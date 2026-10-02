"use strict";
class QueuedAction {
    constructor(dueAt, yaw) {
        this.dueAt = dueAt;
        this.yaw = yaw;
    }
}
class QueuedPush extends QueuedAction {
    execute(fighter, t, context) {
        fighter.faceYaw(this.yaw);
        fighter.tryPush(t, context.env, context.listener);
    }
}
class QueuedDash extends QueuedAction {
    execute(fighter, t, context) {
        fighter.tryDash(t, context.env, context.listener, this.yaw);
    }
}
class AiBrain {
    constructor(random) {
        this.random = random;
        this.nextThink = 0;
        this.queued = null;
    }
    step(fighter, t, context) {
        if (!fighter.isGrounded()) {
            fighter.releaseSteering();
            this.queued = null;
            return;
        }
        fighter.setSpeedFactor(AiTuning.SPEED_FACTOR);
        this.runQueuedAction(fighter, t, context);
        if (t < this.nextThink)
            return;
        this.nextThink = t + this.random.between(AiTuning.THINK_MIN, AiTuning.THINK_MAX);
        if (!context.env.isPlaying(t))
            return;
        this.think(fighter, t, context);
    }
    runQueuedAction(fighter, t, context) {
        const action = this.queued;
        if (!action || t < action.dueAt)
            return;
        this.queued = null;
        action.execute(fighter, t, context);
    }
    think(fighter, t, context) {
        const board = context.env.board;
        const floor = fighter.floor();
        const index = LastTileGeometry.tileIndexAt(fighter.x, fighter.z);
        const remaining = index >= 0 ? board.collapseTime(floor, index) - t : 0;
        const endangered = remaining < AiTuning.DANGER_MS;
        const sighting = this.nearestFoe(fighter, floor, context);
        const reaction = this.random.between(AiTuning.REACT_MIN, AiTuning.REACT_MAX);
        if (sighting && !this.queued)
            this.planAttack(fighter, sighting, t, reaction, endangered, context);
        const target = this.chooseTile(fighter, floor, index, endangered, t, board) || this.fallbackTile(fighter, floor, t, context);
        if (!target) {
            fighter.releaseSteering();
            return;
        }
        this.steerToward(fighter, target, endangered);
    }
    nearestFoe(fighter, floor, context) {
        let best = null;
        let bestDistance = AiTuning.NO_FOE_DISTANCE;
        for (const other of context.allFighters()) {
            if (other === fighter || !other.isGrounded() || other.floor() !== floor)
                continue;
            const distance = MathUtil.distance(other.x, other.z, fighter.x, fighter.z);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = { foe: other, distance };
            }
        }
        return best;
    }
    planAttack(fighter, sighting, t, reaction, endangered, context) {
        const floor = fighter.floor(), board = context.env.board;
        const foe = sighting.foe, distance = sighting.distance;
        const angle = Math.atan2(foe.x - fighter.x, foe.z - fighter.z);
        const behindX = foe.x + Math.sin(angle) * AiTuning.EDGE_PROBE_DISTANCE, behindZ = foe.z + Math.cos(angle) * AiTuning.EDGE_PROBE_DISTANCE;
        const edgy = Math.abs(behindX) < LastTileRules.BOARD_LIMIT && Math.abs(behindZ) < LastTileRules.BOARD_LIMIT
            && !board.isSolidAt(floor, behindX, behindZ, t + AiTuning.EDGE_PROBE_AHEAD_MS);
        const pushReady = fighter.canPush(t), dashReady = fighter.canDash(t);
        if (distance < LastTileRules.PUSH_RANGE * AiTuning.PUSH_REACH_FACTOR && pushReady && edgy && this.random.chance(AiTuning.PUSH_SUCCESS)) {
            const aim = angle + this.random.between(-AiTuning.AIM_NOISE, AiTuning.AIM_NOISE);
            this.queued = new QueuedPush(t + reaction, aim);
        }
        else if (distance > AiTuning.DASH_MIN_FOE_DISTANCE && distance < AiTuning.DASH_MAX_FOE_DISTANCE && dashReady && pushReady && edgy && !endangered
            && this.random.chance(AiTuning.DASH_APPROACH_CHANCE)
            && this.isPathClear(board, floor, fighter.x, fighter.z, fighter.x + Math.sin(angle) * (distance - AiTuning.DASH_STOP_SHORT), fighter.z + Math.cos(angle) * (distance - AiTuning.DASH_STOP_SHORT), t)) {
            this.queued = new QueuedDash(t + reaction, angle);
        }
    }
    chooseTile(fighter, floor, index, endangered, t, board) {
        let best = null;
        let bestScore = AiTuning.WORST_SCORE;
        for (let candidate = 0; candidate < LastTileGeometry.tileCount(); candidate++) {
            if (candidate === index && endangered)
                continue;
            const timeLeft = board.collapseTime(floor, candidate) - t;
            if (board.isHole(floor, candidate) || timeLeft < AiTuning.SAFE_MS)
                continue;
            const center = LastTileGeometry.tileCenter(candidate);
            const distance = MathUtil.distance(center.x, center.z, fighter.x, fighter.z);
            if (distance > AiTuning.TARGET_MAX_DISTANCE)
                continue;
            if (!this.isPathClear(board, floor, fighter.x, fighter.z, center.x, center.z, t))
                continue;
            const fresh = board.isUntouched(floor, candidate) && board.suddenTime(floor, candidate) - t > AiTuning.SAFE_MS;
            let score = distance + AiTuning.CENTER_PULL * Math.hypot(center.x, center.z) + (fresh ? AiTuning.FRESH_BONUS : AiTuning.WORN_PENALTY) + this.random.next() * AiTuning.TARGET_NOISE;
            if (candidate === index)
                score += AiTuning.STAY_PENALTY;
            if (score < bestScore) {
                bestScore = score;
                best = center;
            }
        }
        return best;
    }
    fallbackTile(fighter, floor, t, context) {
        const board = context.env.board;
        let nearest = null;
        let nearestDistance = AiTuning.WORST_SCORE;
        for (let candidate = 0; candidate < LastTileGeometry.tileCount(); candidate++) {
            if (board.isHole(floor, candidate) || board.collapseTime(floor, candidate) - t < AiTuning.FALLBACK_SAFE_MS)
                continue;
            const center = LastTileGeometry.tileCenter(candidate);
            const distance = MathUtil.distance(center.x, center.z, fighter.x, fighter.z);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = center;
            }
        }
        if (!nearest)
            return null;
        const rescueYaw = Math.atan2(nearest.x - fighter.x, nearest.z - fighter.z);
        if (fighter.canDash(t) && nearestDistance > AiTuning.RESCUE_DASH_MIN && nearestDistance < LastTileRules.DASH_DISTANCE + 1 && !this.queued) {
            this.queued = new QueuedDash(t + AiTuning.RESCUE_DASH_DELAY_MS, rescueYaw);
        }
        return nearest;
    }
    steerToward(fighter, target, endangered) {
        const dx = target.x - fighter.x, dz = target.z - fighter.z, length = Math.hypot(dx, dz);
        if (length < AiTuning.ARRIVE_DISTANCE && !endangered) {
            fighter.releaseSteering();
            return;
        }
        const pace = endangered ? 1 : (length < AiTuning.SLOW_DOWN_DISTANCE ? AiTuning.IDLE_SPEED_FACTOR : 1);
        fighter.setSpeedFactor(AiTuning.SPEED_FACTOR);
        fighter.steer(dx / length * pace, dz / length * pace);
    }
    isPathClear(board, floor, fromX, fromZ, toX, toZ, t) {
        const distance = Math.hypot(toX - fromX, toZ - fromZ);
        const steps = Math.max(1, Math.ceil(distance / AiTuning.PATH_STEP));
        for (let step = 1; step <= steps; step++) {
            if (!board.isSolidAt(floor, MathUtil.lerp(fromX, toX, step / steps), MathUtil.lerp(fromZ, toZ, step / steps), t))
                return false;
        }
        return true;
    }
}
