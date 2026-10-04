"use strict";
class SocConfig {
    static teamOfSlot(slot) {
        if (slot >= SocConfig.SEAT_COUNT)
            return slot - SocConfig.SEAT_COUNT;
        return slot < 2 ? 0 : 1;
    }
    static sideOf(team) {
        return team === 0 ? 1 : -1;
    }
    static attackOf(team) {
        return -SocConfig.sideOf(team);
    }
}
SocConfig.ROOT = "soccer/rooms";
SocConfig.HALF_W = 7.5;
SocConfig.HALF_L = 12;
SocConfig.GOAL_HALF_W = 2.6;
SocConfig.GOAL_H = 2.2;
SocConfig.GOAL_DEPTH = 2.2;
SocConfig.BALL_R = 0.3;
SocConfig.BODY_R = 0.45;
SocConfig.BODY_H = 1.8;
SocConfig.GRAVITY = 11;
SocConfig.SUB_STEP = 1 / 120;
SocConfig.SEAT_COUNT = 4;
SocConfig.SPECTATOR_SLOT = 4;
SocConfig.NET_MS = 143;
SocConfig.THINK_MS = 100;
SocConfig.MATCH_MS = 120000;
SocConfig.READY_MS = 3200;
SocConfig.OVERTIME_READY_MS = 3600;
SocConfig.GOAL_MS = 4200;
SocConfig.MOVE_SPEED = 6.2;
SocConfig.DRIBBLE_SPEED_FACTOR = 0.9;
SocConfig.DRIBBLE_NEAR = 0.8;
SocConfig.DRIBBLE_FAR = 1.05;
SocConfig.DRIBBLE_TOUCH_MS = 190;
SocConfig.DRIBBLE_TURN_RATE = 8;
SocConfig.DRIBBLE_TURN_RATE_STANDING = 4;
SocConfig.PLAYER_SEPARATION = 0.9;
SocConfig.KEEPER_HALF_W = 2;
SocConfig.KEEPER_NEAR = 0.7;
SocConfig.KEEPER_FAR = 2.1;
SocConfig.KEEPER_SPEED_SCALE = 0.72;
SocConfig.KEEPER_THINK_MS = 140;
SocConfig.KEEPER_REACH = 1.2;
SocConfig.KEEPER_CATCH_SPEED = 11;
SocConfig.KEEPER_HOLD_MS = 1300;
SocConfig.KEEPER_KICK_POWER = 0.8;
SocConfig.KEEPER_COME_OUT_DISTANCE = 3.2;
SocConfig.PICKUP_RADIUS = 0.92;
SocConfig.PICKUP_HEIGHT = 1.2;
SocConfig.CAPTURE_MAX_SPEED = 7;
SocConfig.KICK_IMMUNE_MS = 380;
SocConfig.OWNER_PROTECT_MS = 700;
SocConfig.KICKOFF_PROTECT_MS = 1500;
SocConfig.ROLL_DRAG = 0.5;
SocConfig.AIR_DRAG = 0.06;
SocConfig.STOP_SPEED = 0.18;
SocConfig.BOUNCE_REST = 0.5;
SocConfig.BOUNCE_MIN_SPEED = 1.3;
SocConfig.BOUNCE_FRICTION = 0.88;
SocConfig.WALL_REST = 0.62;
SocConfig.NET_REST = 0.28;
SocConfig.BODY_REST = 0.55;
SocConfig.PASS_MIN_SPEED = 6.5;
SocConfig.PASS_MAX_SPEED = 18;
SocConfig.PASS_ARRIVE_SPEED = 4.5;
SocConfig.PASS_POWER_BOOST = 0.9;
SocConfig.PASS_LEAD_FACTOR = 0.9;
SocConfig.PASS_LEAD_MAX_S = 0.9;
SocConfig.SHOT_SPEED_MIN = 13;
SocConfig.SHOT_SPEED_MAX = 24;
SocConfig.SHOT_ARRIVE_SPEED = 3.2;
SocConfig.SHOT_FALLOFF_START = 6;
SocConfig.SHOT_FALLOFF_RANGE = 12;
SocConfig.SHOT_FALLOFF_MAX = 0.55;
SocConfig.SHOT_ERROR_BASE = 0.012;
SocConfig.SHOT_ERROR_PER_M = 0.016;
SocConfig.SHOT_ERROR_FREE_M = 3;
SocConfig.SHOT_MISS_FREE_M = 2.8;
SocConfig.SHOT_MISS_SPAN_M = 4.6;
SocConfig.SHOT_MISS_MAX = 0.95;
SocConfig.SHOT_MISS_MIN_OFFSET = 0.45;
SocConfig.SHOT_MISS_OFFSET_SPAN = 1.6;
SocConfig.SHOT_CORNER_INSET = 0.6;
SocConfig.SHOT_TARGET_H = 0.7;
SocConfig.SHOT_MAX_VY = 4.2;
SocConfig.CHARGE_MS = 900;
SocConfig.TACKLE_ACTIVE_MS = 300;
SocConfig.TACKLE_LUNGE_SPEED = 1.5;
SocConfig.TACKLE_RANGE = 1.15;
SocConfig.TACKLE_HALF_ANGLE = 0.75;
SocConfig.TACKLE_CLOSE_RANGE = 0.6;
SocConfig.TACKLE_ASSIST_RANGE = 2.2;
SocConfig.TACKLE_FAIL_RECOVER_MS = 220;
SocConfig.TACKLE_WIN_RECOVER_MS = 60;
SocConfig.TACKLE_POP_SPEED = 4.6;
SocConfig.SLIDE_MS = 650;
SocConfig.SLIDE_SPEED = 10.5;
SocConfig.SLIDE_HIT_RADIUS = 1.15;
SocConfig.SLIDE_FAIL_RECOVER_MS = 650;
SocConfig.SLIDE_WIN_RECOVER_MS = 120;
SocConfig.SLIDE_POP_SPEED = 6.6;
SocConfig.SLIDE_KICK_SPEED = 8.5;
SocConfig.DISLODGE_STUN_MS = 750;
SocConfig.TEAM_NAMES = ["빨강 팀", "파랑 팀"];
SocConfig.TEAM_COLORS = ["#E5484D", "#3E8EF0"];
SocConfig.TEAM_TOP_COLOR_INDEX = [0, 5];
SocConfig.BOT_NAMES = ["봇 1", "봇 2", "봇 3", "봇 4"];
SocConfig.KEEPER_NAME = "골키퍼";
class SocMath {
    static clamp(value, low, high) {
        return value < low ? low : value > high ? high : value;
    }
    static lerp(from, to, ratio) {
        return from + (to - from) * ratio;
    }
    static gaussian(random) {
        return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    }
    static angleDifference(a, b) {
        let difference = a - b;
        while (difference > Math.PI)
            difference -= Math.PI * 2;
        while (difference < -Math.PI)
            difference += Math.PI * 2;
        return difference;
    }
    static distance(a, b) {
        return Math.hypot(a.x - b.x, a.z - b.z);
    }
    static segmentDistance(point, from, to) {
        const dx = to.x - from.x, dz = to.z - from.z;
        const lengthSquared = dx * dx + dz * dz;
        if (lengthSquared < 1e-9)
            return SocMath.distance(point, from);
        const ratio = SocMath.clamp(((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared, 0, 1);
        return Math.hypot(point.x - (from.x + dx * ratio), point.z - (from.z + dz * ratio));
    }
}
class SocBallPhysics {
    constructor() {
        this.x = 0;
        this.y = SocConfig.BALL_R;
        this.z = 0;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.scoredTeam = -1;
        this.impacts = [];
        this.carry = 0;
    }
    static projectedDistanceFactor(seconds) {
        return (1 - Math.exp(-SocConfig.ROLL_DRAG * seconds)) / SocConfig.ROLL_DRAG;
    }
    load(state) {
        this.x = state.x;
        this.y = state.y;
        this.z = state.z;
        this.vx = state.vx;
        this.vy = state.vy;
        this.vz = state.vz;
        this.carry = 0;
    }
    state() {
        return { x: this.x, y: this.y, z: this.z, vx: this.vx, vy: this.vy, vz: this.vz };
    }
    speed() {
        return Math.hypot(this.vx, this.vz);
    }
    advance(seconds) {
        this.carry += seconds;
        while (this.carry >= SocConfig.SUB_STEP) {
            this.substep(SocConfig.SUB_STEP);
            this.carry -= SocConfig.SUB_STEP;
        }
    }
    substep(dt) {
        this.vy -= SocConfig.GRAVITY * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.z += this.vz * dt;
        this.resolveGround();
        this.resolveBounds();
        this.applyDrag(dt);
        this.detectGoal();
    }
    resolveGround() {
        if (this.y > SocConfig.BALL_R)
            return;
        this.y = SocConfig.BALL_R;
        if (this.vy < -SocConfig.BOUNCE_MIN_SPEED) {
            this.vy = -this.vy * SocConfig.BOUNCE_REST;
            this.vx *= SocConfig.BOUNCE_FRICTION;
            this.vz *= SocConfig.BOUNCE_FRICTION;
        }
        else if (this.vy < 0) {
            this.vy = 0;
        }
    }
    resolveBounds() {
        const radius = SocConfig.BALL_R;
        const inPocket = Math.abs(this.z) > SocConfig.HALF_L;
        const limitX = (inPocket ? SocConfig.GOAL_HALF_W : SocConfig.HALF_W) - radius;
        if (Math.abs(this.x) > limitX) {
            const sign = Math.sign(this.x);
            this.x = sign * limitX;
            if (this.vx * sign > 0) {
                this.recordImpact(inPocket ? "side" : "", Math.abs(this.vx));
                this.vx = -this.vx * (inPocket ? SocConfig.NET_REST : SocConfig.WALL_REST);
            }
        }
        const mouthOpen = Math.abs(this.x) <= SocConfig.GOAL_HALF_W - radius && this.y <= SocConfig.GOAL_H - radius;
        const deep = inPocket || mouthOpen;
        const limitZ = deep ? SocConfig.HALF_L + SocConfig.GOAL_DEPTH - radius : SocConfig.HALF_L - radius;
        if (Math.abs(this.z) > limitZ) {
            const sign = Math.sign(this.z);
            this.z = sign * limitZ;
            if (this.vz * sign > 0) {
                this.recordImpact(deep ? "back" : "", Math.abs(this.vz));
                this.vz = -this.vz * (deep ? SocConfig.NET_REST : SocConfig.WALL_REST);
            }
        }
        if (Math.abs(this.z) > SocConfig.HALF_L && this.y > SocConfig.GOAL_H - radius) {
            this.y = SocConfig.GOAL_H - radius;
            if (this.vy > 0) {
                this.recordImpact("roof", this.vy);
                this.vy = -this.vy * SocConfig.NET_REST;
            }
        }
    }
    settle() {
        this.resolveBounds();
    }
    recordImpact(surface, strength) {
        if (surface === "" || strength < 0.8)
            return;
        this.impacts.push({ surface, x: this.x, y: this.y, z: this.z, strength });
        if (this.impacts.length > 8)
            this.impacts.shift();
    }
    applyDrag(dt) {
        const grounded = this.y <= SocConfig.BALL_R + 1e-4 && this.vy <= 0.001;
        const factor = Math.exp(-(grounded ? SocConfig.ROLL_DRAG : SocConfig.AIR_DRAG) * dt);
        this.vx *= factor;
        this.vz *= factor;
        if (grounded && Math.hypot(this.vx, this.vz) < SocConfig.STOP_SPEED) {
            this.vx = 0;
            this.vz = 0;
        }
    }
    detectGoal() {
        if (this.scoredTeam >= 0)
            return;
        if (Math.abs(this.z) > SocConfig.HALF_L + SocConfig.BALL_R && this.y < SocConfig.GOAL_H)
            this.scoredTeam = this.z < 0 ? 0 : 1;
    }
}
class SocDribbleFollower {
    constructor() {
        this.angle = 0;
        this.ready = false;
        this.lastMs = 0;
    }
    reset() {
        this.ready = false;
    }
    position(x, z, yaw, moving, sinceMs, nowMs, seed) {
        if (!this.ready) {
            this.ready = true;
            this.angle = seed && Math.hypot(seed.x - x, seed.z - z) > 0.05 ? Math.atan2(seed.x - x, seed.z - z) : yaw;
            this.lastMs = nowMs;
        }
        const seconds = Math.max(0, Math.min(0.25, (nowMs - this.lastMs) / 1000));
        this.lastMs = nowMs;
        const rate = (moving ? SocConfig.DRIBBLE_TURN_RATE : SocConfig.DRIBBLE_TURN_RATE_STANDING) * seconds;
        this.angle += SocMath.clamp(SocMath.angleDifference(yaw, this.angle), -rate, rate);
        const touch = SocConfig.DRIBBLE_TOUCH_MS;
        const phase = moving ? (((nowMs - sinceMs) % touch) + touch) % touch / touch : 0.5;
        const offset = SocConfig.DRIBBLE_NEAR + (SocConfig.DRIBBLE_FAR - SocConfig.DRIBBLE_NEAR) * Math.abs(1 - 2 * phase);
        const limitX = SocConfig.HALF_W - SocConfig.BALL_R, limitZ = SocConfig.HALF_L - SocConfig.BALL_R;
        return {
            x: SocMath.clamp(x + Math.sin(this.angle) * offset, -limitX, limitX),
            z: SocMath.clamp(z + Math.cos(this.angle) * offset, -limitZ, limitZ)
        };
    }
}
class SocPlanner {
    static clampToField(point) {
        return { x: SocMath.clamp(point.x, -SocConfig.HALF_W + 0.5, SocConfig.HALF_W - 0.5), z: SocMath.clamp(point.z, -SocConfig.HALF_L + 0.5, SocConfig.HALF_L - 0.5) };
    }
    static laneClear(from, to, opponents, radius) {
        return opponents.every((opponent) => SocMath.segmentDistance(opponent, from, to) > radius);
    }
    static baseSpeed(distance, arriveSpeed) {
        return SocConfig.ROLL_DRAG * distance + arriveSpeed;
    }
    static pass(from, mate, power, errorAngle) {
        const drag = SocConfig.ROLL_DRAG;
        let target = { x: mate.x, z: mate.z };
        let speed = SocConfig.PASS_MIN_SPEED;
        for (let round = 0; round < 3; round++) {
            const distance = Math.max(0.5, SocMath.distance(from, target));
            const base = Math.max(SocConfig.PASS_MIN_SPEED, SocPlanner.baseSpeed(distance, SocConfig.PASS_ARRIVE_SPEED));
            speed = SocMath.clamp(base * (1 + power * SocConfig.PASS_POWER_BOOST), SocConfig.PASS_MIN_SPEED, SocConfig.PASS_MAX_SPEED);
            const ratio = Math.min(0.95, (drag * distance) / base);
            const arrive = -Math.log(1 - ratio) / drag;
            const lead = Math.min(arrive, SocConfig.PASS_LEAD_MAX_S) * SocConfig.PASS_LEAD_FACTOR;
            target = SocPlanner.clampToField({ x: mate.x + mate.vx * lead, z: mate.z + mate.vz * lead });
        }
        const angle = Math.atan2(target.x - from.x, target.z - from.z) + errorAngle;
        return { vx: Math.sin(angle) * speed, vy: 0, vz: Math.cos(angle) * speed, startX: from.x, startZ: from.z, target };
    }
    static shotTarget(from, team, opponents) {
        const attack = SocConfig.attackOf(team);
        const goalZ = attack * (SocConfig.HALF_L + 0.6);
        const cornerX = SocConfig.GOAL_HALF_W - SocConfig.SHOT_CORNER_INSET;
        let best = { x: cornerX, z: goalZ };
        let bestScore = -1;
        [-cornerX, cornerX].forEach((x) => {
            const corner = { x, z: goalZ };
            let score = 99;
            opponents.forEach((opponent) => {
                score = Math.min(score, SocMath.segmentDistance(opponent, from, corner), SocMath.distance(opponent, corner));
            });
            if (score > bestScore) {
                bestScore = score;
                best = corner;
            }
        });
        return best;
    }
    static shotSpeed(distance, power) {
        const raw = SocMath.lerp(SocConfig.SHOT_SPEED_MIN, SocConfig.SHOT_SPEED_MAX, power);
        const falloff = 1 - SocConfig.SHOT_FALLOFF_MAX * SocMath.clamp((distance - SocConfig.SHOT_FALLOFF_START) / SocConfig.SHOT_FALLOFF_RANGE, 0, 1);
        return Math.max(SocPlanner.baseSpeed(distance, SocConfig.SHOT_ARRIVE_SPEED), raw * falloff);
    }
    static shotError(distance) {
        return SocConfig.SHOT_ERROR_BASE + SocConfig.SHOT_ERROR_PER_M * Math.max(0, distance - SocConfig.SHOT_ERROR_FREE_M);
    }
    static missChance(distance) {
        return SocMath.clamp((distance - SocConfig.SHOT_MISS_FREE_M) / SocConfig.SHOT_MISS_SPAN_M, 0, SocConfig.SHOT_MISS_MAX);
    }
    static shot(from, team, opponents, power, random, errorScale = 1) {
        const corner = SocPlanner.shotTarget(from, team, opponents);
        const distance = Math.max(1, SocMath.distance(from, corner));
        const wide = random() < SocPlanner.missChance(distance) ? Math.sign(corner.x) * (SocConfig.SHOT_MISS_MIN_OFFSET + random() * SocConfig.SHOT_MISS_OFFSET_SPAN) : 0;
        const target = { x: corner.x + wide, z: corner.z };
        const speed = SocPlanner.shotSpeed(distance, power);
        const angle = Math.atan2(target.x - from.x, target.z - from.z) + SocMath.gaussian(random) * SocPlanner.shotError(distance) * errorScale;
        const average = Math.max(2, speed - (SocConfig.ROLL_DRAG * distance) / 2);
        const seconds = distance / average;
        const lift = (SocConfig.SHOT_TARGET_H - SocConfig.BALL_R + 0.5 * SocConfig.GRAVITY * seconds * seconds) / seconds;
        return { vx: Math.sin(angle) * speed, vy: SocMath.clamp(lift, 0, SocConfig.SHOT_MAX_VY), vz: Math.cos(angle) * speed, startX: from.x, startZ: from.z, target };
    }
}
class SocCourtLayout {
    static takerSlot(team) {
        return team * 2;
    }
    static kickoffSpot(slot, kickoffTeam) {
        const team = SocConfig.teamOfSlot(slot);
        const side = SocConfig.sideOf(team);
        const first = slot % 2 === 0;
        if (team === kickoffTeam)
            return first ? { x: 0, z: side * 1.1 } : { x: 3.4 * side, z: side * 5.5 };
        return first ? { x: -2.8 * side, z: side * 4.6 } : { x: 2.8 * side, z: side * 7.4 };
    }
    static keeperHome(slot) {
        const side = SocConfig.sideOf(SocConfig.teamOfSlot(slot));
        return { x: 0, z: side * (SocConfig.HALF_L - (SocConfig.KEEPER_NEAR + SocConfig.KEEPER_FAR) / 2) };
    }
    static spotFor(slot, kickoffTeam) {
        return slot >= SocConfig.SEAT_COUNT ? SocCourtLayout.keeperHome(slot) : SocCourtLayout.kickoffSpot(slot, kickoffTeam);
    }
    static facingYaw(team) {
        return SocConfig.sideOf(team) > 0 ? Math.PI : 0;
    }
    static clampPlayer(x, z) {
        return {
            x: SocMath.clamp(x, -SocConfig.HALF_W + SocConfig.BODY_R, SocConfig.HALF_W - SocConfig.BODY_R),
            z: SocMath.clamp(z, -SocConfig.HALF_L + SocConfig.BODY_R, SocConfig.HALF_L - SocConfig.BODY_R)
        };
    }
}
class SocPlayerController {
    constructor(slot) {
        this.slot = slot;
        this.x = 0;
        this.z = 0;
        this.yaw = 0;
        this.moving = false;
        this.ix = 0;
        this.iz = 0;
        this.frozen = false;
        this.carrying = false;
        this.actionKind = "none";
        this.actionStartMs = -1e9;
        this.actionDirX = 0;
        this.actionDirZ = 1;
        this.actionSeq = 0;
        this.actionResolved = true;
        this.slideKicked = false;
        this.recoverUntilMs = 0;
        this.noPickupUntilMs = 0;
        this.protectUntilMs = 0;
        this.speedScale = 1;
        this.obstacles = [];
        this.queued = null;
    }
    get team() {
        return SocConfig.teamOfSlot(this.slot);
    }
    queueAction(request) {
        this.queued = request;
    }
    takeQueued() {
        const request = this.queued;
        this.queued = null;
        return request;
    }
    velocity() {
        const length = Math.hypot(this.ix, this.iz);
        if (!this.moving || length < 0.05)
            return { x: this.x, z: this.z, vx: 0, vz: 0 };
        const speed = SocConfig.MOVE_SPEED * this.speedScale * (this.carrying ? SocConfig.DRIBBLE_SPEED_FACTOR : 1);
        return { x: this.x, z: this.z, vx: (this.ix / length) * speed, vz: (this.iz / length) * speed };
    }
    activeMs() {
        return this.actionKind === "tackle" ? SocConfig.TACKLE_ACTIVE_MS : this.actionKind === "slide" ? SocConfig.SLIDE_MS : 0;
    }
    isActing(nowMs) {
        return this.actionKind !== "none" && nowMs >= this.actionStartMs && nowMs < this.actionStartMs + this.activeMs();
    }
    isBusy(nowMs) {
        return this.isActing(nowMs) || nowMs < this.recoverUntilMs;
    }
    beginBodyAction(kind, nowMs, dirX, dirZ) {
        const length = Math.hypot(dirX, dirZ) || 1;
        this.actionKind = kind;
        this.actionStartMs = nowMs;
        this.actionDirX = dirX / length;
        this.actionDirZ = dirZ / length;
        this.actionSeq++;
        this.actionResolved = false;
        this.slideKicked = false;
        this.yaw = Math.atan2(this.actionDirX, this.actionDirZ);
        const failRecover = kind === "tackle" ? SocConfig.TACKLE_FAIL_RECOVER_MS : SocConfig.SLIDE_FAIL_RECOVER_MS;
        this.recoverUntilMs = nowMs + this.activeMs() + failRecover;
    }
    winRecover(nowMs) {
        const recover = this.actionKind === "slide" ? SocConfig.SLIDE_WIN_RECOVER_MS : SocConfig.TACKLE_WIN_RECOVER_MS;
        this.recoverUntilMs = Math.min(this.recoverUntilMs, nowMs + recover);
        this.actionResolved = true;
    }
    step(dtSec, nowMs = 0) {
        if (this.frozen) {
            this.moving = false;
            return;
        }
        if (this.isActing(nowMs)) {
            const progress = (nowMs - this.actionStartMs) / this.activeMs();
            const speed = this.actionKind === "slide" ? SocConfig.SLIDE_SPEED * (1 - progress * 0.85) : SocConfig.TACKLE_LUNGE_SPEED;
            this.applyMove(this.actionDirX * speed * dtSec, this.actionDirZ * speed * dtSec);
            this.moving = true;
            return;
        }
        if (nowMs < this.recoverUntilMs) {
            this.moving = false;
            return;
        }
        const length = Math.hypot(this.ix, this.iz);
        if (length > 0.05) {
            const speed = SocConfig.MOVE_SPEED * this.speedScale * (this.carrying ? SocConfig.DRIBBLE_SPEED_FACTOR : 1);
            this.applyMove((this.ix / length) * speed * dtSec, (this.iz / length) * speed * dtSec);
            this.yaw = Math.atan2(this.ix, this.iz);
            this.moving = true;
        }
        else {
            this.moving = false;
        }
    }
    teleport(x, z) {
        this.x = x;
        this.z = z;
        this.ix = this.iz = 0;
        this.moving = false;
        this.yaw = SocCourtLayout.facingYaw(this.team);
        this.actionKind = "none";
        this.recoverUntilMs = 0;
    }
    applyMove(dx, dz) {
        const next = SocCourtLayout.clampPlayer(this.x + dx, this.z + dz);
        this.x = next.x;
        this.z = next.z;
        this.separateFromObstacles();
    }
    separateFromObstacles() {
        for (const other of this.obstacles) {
            if (other === this)
                continue;
            const dx = this.x - other.x, dz = this.z - other.z;
            const distance = Math.hypot(dx, dz);
            if (distance >= SocConfig.PLAYER_SEPARATION)
                continue;
            const normalX = distance > 1e-4 ? dx / distance : 1, normalZ = distance > 1e-4 ? dz / distance : 0;
            const pushed = SocCourtLayout.clampPlayer(other.x + normalX * SocConfig.PLAYER_SEPARATION, other.z + normalZ * SocConfig.PLAYER_SEPARATION);
            this.x = pushed.x;
            this.z = pushed.z;
        }
    }
}
class SocRemoteController extends SocPlayerController {
    constructor() {
        super(...arguments);
        this.targetX = 0;
        this.targetZ = 0;
        this.seenActionSeq = 0;
    }
    poll(engine, dtSec) {
        const follow = Math.min(1, dtSec * 12);
        this.x = SocMath.lerp(this.x, this.targetX, follow);
        this.z = SocMath.lerp(this.z, this.targetZ, follow);
    }
    step() { }
    receive(x, z, yaw, moving, ix, iz) {
        this.targetX = x;
        this.targetZ = z;
        this.yaw = yaw;
        this.moving = moving;
        this.ix = ix;
        this.iz = iz;
    }
    receiveAction(kind, seq, ageMs, nowMs) {
        if (seq === this.seenActionSeq)
            return;
        this.seenActionSeq = seq;
        if (kind === "none")
            return;
        this.actionKind = kind;
        this.actionStartMs = nowMs - ageMs;
        this.actionSeq++;
    }
    teleport(x, z) {
        super.teleport(x, z);
        this.targetX = x;
        this.targetZ = z;
    }
}
class SocActionAim {
    static direction(kind, me, opponentOwner) {
        const facing = { x: Math.sin(me.yaw), z: Math.cos(me.yaw) };
        if (kind !== "tackle" || !opponentOwner)
            return facing;
        const dx = opponentOwner.x - me.x, dz = opponentOwner.z - me.z;
        const distance = Math.hypot(dx, dz);
        if (distance > SocConfig.TACKLE_ASSIST_RANGE || distance < 0.01)
            return facing;
        return { x: dx / distance, z: dz / distance };
    }
}
class SocBotTuning {
}
SocBotTuning.REACTION_SEC = 0.22;
SocBotTuning.SHOT_RANGE = 7.5;
SocBotTuning.SHOT_CHANCE = 0.3;
SocBotTuning.SHOT_POWER_MIN = 0.35;
SocBotTuning.SHOT_POWER_SPAN = 0.55;
SocBotTuning.SHOT_SPOT_DEPTH = 5;
SocBotTuning.SHOT_MIN_ANGLE_RATIO = 0.6;
SocBotTuning.PASS_CHANCE = 0.7;
SocBotTuning.PASS_PRESSURED_CHANCE = 0.85;
SocBotTuning.PASS_ERROR = 0.05;
SocBotTuning.PASS_POWER = 0.2;
SocBotTuning.PASS_MIN_DISTANCE = 2.8;
SocBotTuning.PASS_ADVANCE = 1.6;
SocBotTuning.LANE_RADIUS = 1.1;
SocBotTuning.MARKED_RADIUS = 2;
SocBotTuning.PRESSURE_RADIUS = 2.8;
SocBotTuning.AVOID_RADIUS = 3.2;
SocBotTuning.TACKLE_CHANCE = 0.16;
SocBotTuning.SLIDE_CHANCE = 0.05;
SocBotTuning.SLIDE_MIN = 2.3;
SocBotTuning.SLIDE_MAX = 3.7;
SocBotTuning.MISS_CHANCE = 0.15;
SocBotTuning.COVER_RATIO = 0.9;
SocBotTuning.COVER_GOALSIDE = 1.3;
SocBotTuning.PASS_REACTION_MS = 450;
class SocBot extends SocPlayerController {
    constructor(slot, random) {
        super(slot);
        this.random = random;
        this.nextThinkMs = 0;
        this.reactUntilMs = 0;
        this.seenOwner = -2;
        this.goal = null;
        this.supportSpot = null;
    }
    poll(engine, dtSec, nowMs) {
        if (!engine)
            return;
        if (engine.phase !== "play") {
            this.goal = null;
            this.ix = this.iz = 0;
            this.step(dtSec, nowMs);
            return;
        }
        if (nowMs >= this.nextThinkMs) {
            this.nextThinkMs = nowMs + SocConfig.THINK_MS;
            this.think(engine, nowMs);
        }
        this.steer();
        this.step(dtSec, nowMs);
    }
    steer() {
        if (!this.goal) {
            this.ix = this.iz = 0;
            return;
        }
        const dx = this.goal.x - this.x, dz = this.goal.z - this.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 0.3) {
            this.ix = dx / distance;
            this.iz = dz / distance;
        }
        else {
            this.ix = this.iz = 0;
        }
    }
    think(engine, nowMs) {
        if (engine.ownerSlot !== this.seenOwner) {
            this.seenOwner = engine.ownerSlot;
            this.reactUntilMs = nowMs + SocBotTuning.REACTION_SEC * 1000 * (0.8 + this.random() * 0.4);
        }
        const owner = engine.ownerSlot;
        const ball = engine.ballPoint(nowMs);
        const mate = engine.players[this.slot ^ 1];
        if (owner === this.slot)
            this.thinkAttack(engine, nowMs, ball, mate);
        else if (owner >= SocConfig.SEAT_COUNT && SocConfig.teamOfSlot(owner) === this.team)
            this.thinkOutlet();
        else if (owner >= 0 && SocConfig.teamOfSlot(owner) === this.team)
            this.thinkSupport(engine, mate);
        else if (owner >= SocConfig.SEAT_COUNT)
            this.thinkRetreat();
        else if (owner >= 0)
            this.thinkDefend(engine, nowMs, ball, mate, engine.bodies[owner]);
        else
            this.thinkLoose(engine, nowMs, ball, mate);
    }
    opponentPoints(engine) {
        return engine.opponentsOf(this.team).map((opponent) => ({ x: opponent.x, z: opponent.z }));
    }
    thinkAttack(engine, nowMs, ball, mate) {
        const me = { x: this.x, z: this.z };
        const attack = SocConfig.attackOf(this.team);
        const opponents = this.opponentPoints(engine);
        const goalCenter = { x: 0, z: attack * SocConfig.HALF_L };
        const goalDistance = SocMath.distance(me, goalCenter);
        const nearest = opponents.reduce((best, opponent) => Math.min(best, SocMath.distance(me, opponent)), 99);
        const pressured = nearest < SocBotTuning.PRESSURE_RADIUS;
        const ready = nowMs >= this.reactUntilMs && !this.isBusy(nowMs);
        if (ready && goalDistance <= SocBotTuning.SHOT_RANGE && this.random() < SocBotTuning.SHOT_CHANCE) {
            const target = SocPlanner.shotTarget(me, this.team, opponents);
            const openAngle = Math.abs(target.z - me.z) >= Math.abs(target.x - me.x) * SocBotTuning.SHOT_MIN_ANGLE_RATIO;
            if (openAngle && SocPlanner.laneClear(me, target, opponents, 0.9)) {
                this.queueAction({ kind: "shot", power: SocBotTuning.SHOT_POWER_MIN + this.random() * SocBotTuning.SHOT_POWER_SPAN, atMs: nowMs, dirX: 0, dirZ: 0 });
                return;
            }
        }
        if (ready && this.wantsPass(mate, me, opponents, attack, pressured)) {
            this.queueAction({ kind: "pass", power: SocBotTuning.PASS_POWER, atMs: nowMs, dirX: 0, dirZ: 0 });
            return;
        }
        this.goal = this.dribbleGoal(me, goalCenter, attack, opponents);
    }
    wantsPass(mate, me, opponents, attack, pressured) {
        const distance = SocMath.distance(me, mate);
        if (distance < SocBotTuning.PASS_MIN_DISTANCE)
            return false;
        const advance = (mate.z - me.z) * attack;
        if (!pressured && advance < SocBotTuning.PASS_ADVANCE)
            return false;
        const launch = SocPlanner.pass(me, mate.velocity(), 0, 0);
        if (!SocPlanner.laneClear(me, launch.target, opponents, SocBotTuning.LANE_RADIUS))
            return false;
        if (opponents.some((opponent) => SocMath.distance(opponent, launch.target) < SocBotTuning.MARKED_RADIUS))
            return false;
        return this.random() < (pressured ? SocBotTuning.PASS_PRESSURED_CHANCE : SocBotTuning.PASS_CHANCE);
    }
    dribbleGoal(me, goalCenter, attack, opponents) {
        const spot = { x: 0, z: goalCenter.z - attack * SocBotTuning.SHOT_SPOT_DEPTH };
        let dx = spot.x - me.x, dz = spot.z - me.z;
        const length = Math.hypot(dx, dz) || 1;
        dx /= length;
        dz /= length;
        let steerX = dx, steerZ = dz;
        opponents.forEach((opponent) => {
            const relX = opponent.x - me.x, relZ = opponent.z - me.z;
            const distance = Math.hypot(relX, relZ);
            if (distance > SocBotTuning.AVOID_RADIUS || relX * dx + relZ * dz < -0.3)
                return;
            const side = relX * dz - relZ * dx > 0 ? 1 : -1;
            const weight = (1 - distance / SocBotTuning.AVOID_RADIUS) * 1.7;
            steerX -= dz * side * weight;
            steerZ += dx * side * weight;
        });
        const edge = SocConfig.HALF_W - 1.3;
        if (Math.abs(me.x) > edge)
            steerX -= Math.sign(me.x) * 0.8;
        const steerLength = Math.hypot(steerX, steerZ) || 1;
        return SocPlanner.clampToField({ x: me.x + (steerX / steerLength) * 3, z: me.z + (steerZ / steerLength) * 3 });
    }
    thinkOutlet() {
        const attack = SocConfig.attackOf(this.team);
        this.goal = SocPlanner.clampToField({ x: (this.slot % 2 === 0 ? 3.6 : -3.6) * attack, z: -attack * 1 });
    }
    thinkRetreat() {
        const attack = SocConfig.attackOf(this.team);
        this.goal = SocPlanner.clampToField({ x: (this.slot % 2 === 0 ? 2.8 : -2.8) * attack, z: -attack * 3 });
    }
    supportScore(spot, holder, opponents, depth) {
        let lane = 9, near = 9;
        opponents.forEach((opponent) => {
            lane = Math.min(lane, SocMath.segmentDistance(opponent, holder, spot));
            near = Math.min(near, SocMath.distance(opponent, spot));
        });
        return Math.min(lane, 3) * 1.5 + Math.min(near, 4) + 0.12 * depth - 0.08 * SocMath.distance(this, spot);
    }
    thinkSupport(engine, mate) {
        const attack = SocConfig.attackOf(this.team);
        const holder = { x: mate.x, z: mate.z };
        const opponents = this.opponentPoints(engine);
        const limit = attack * (SocConfig.HALF_L - 3.5);
        let best = null;
        let bestScore = -Infinity;
        [-5, -2.5, 0, 2.5, 5].forEach((x) => {
            [3, 5, 7].forEach((depth) => {
                const rawZ = holder.z + attack * depth;
                const z = attack > 0 ? Math.min(rawZ, limit) : Math.max(rawZ, limit);
                const spot = SocPlanner.clampToField({ x, z });
                if (SocMath.distance(spot, holder) < SocBotTuning.PASS_MIN_DISTANCE)
                    return;
                const score = this.supportScore(spot, holder, opponents, depth);
                if (score > bestScore) {
                    bestScore = score;
                    best = spot;
                }
            });
        });
        const keep = this.supportSpot;
        if (keep && best && this.supportScore(keep, holder, opponents, 5) >= bestScore - 0.4)
            best = keep;
        this.supportSpot = best;
        this.goal = best;
    }
    thinkDefend(engine, nowMs, ball, mate, owner) {
        const myDistance = SocMath.distance(this, ball);
        const mateDistance = SocMath.distance(mate, ball);
        const chaser = myDistance < mateDistance || (myDistance === mateDistance && this.slot < mate.slot);
        if (!chaser) {
            const partner = engine.players[owner.slot ^ 1];
            const goalSide = -SocConfig.attackOf(this.team) * SocBotTuning.COVER_GOALSIDE;
            const lane = { x: SocMath.lerp(owner.x, partner.x, SocBotTuning.COVER_RATIO), z: SocMath.lerp(owner.z, partner.z, SocBotTuning.COVER_RATIO) + goalSide };
            const ownGoalZ = -SocConfig.attackOf(this.team) * SocConfig.HALF_L;
            const nearGoal = Math.abs(lane.z - ownGoalZ) < 3;
            this.goal = SocPlanner.clampToField(nearGoal ? { x: lane.x, z: ownGoalZ + SocConfig.attackOf(this.team) * 3.2 } : lane);
            return;
        }
        const velocity = owner.velocity();
        this.goal = SocPlanner.clampToField({ x: ball.x + velocity.vx * 0.25, z: ball.z + velocity.vz * 0.25 });
        if (nowMs < this.reactUntilMs || this.isBusy(nowMs))
            return;
        if (this.random() < SocBotTuning.MISS_CHANCE)
            return;
        const distance = SocMath.distance(this, ball);
        if (distance <= SocConfig.TACKLE_RANGE && this.random() < SocBotTuning.TACKLE_CHANCE) {
            this.queueAction({ kind: "tackle", power: 0, atMs: nowMs, dirX: 0, dirZ: 0 });
        }
        else if (distance >= SocBotTuning.SLIDE_MIN && distance <= SocBotTuning.SLIDE_MAX && this.random() < SocBotTuning.SLIDE_CHANCE) {
            const dx = ball.x - this.x, dz = ball.z - this.z;
            this.queueAction({ kind: "slide", power: 0, atMs: nowMs, dirX: dx, dirZ: dz });
        }
    }
    thinkLoose(engine, nowMs, ball, mate) {
        const rivalPass = engine.ballKind === "pass" && engine.lastKickerSlot >= 0 && SocConfig.teamOfSlot(engine.lastKickerSlot) !== this.team;
        if (rivalPass && nowMs - engine.lastKickMs < SocBotTuning.PASS_REACTION_MS)
            return;
        const velocity = engine.ballVelocity();
        const myDistance = SocMath.distance(this, ball);
        const seconds = SocMath.clamp(myDistance / SocConfig.MOVE_SPEED, 0, 1.2);
        const factor = SocBallPhysics.projectedDistanceFactor(seconds);
        const predicted = SocPlanner.clampToField({ x: ball.x + velocity.x * factor, z: ball.z + velocity.z * factor });
        const mateDistance = SocMath.distance(mate, predicted);
        const myPredicted = SocMath.distance(this, predicted);
        const chase = myPredicted < mateDistance - 0.3 || (Math.abs(myPredicted - mateDistance) <= 0.3 && this.slot % 2 === 0);
        if (chase) {
            this.goal = predicted;
            return;
        }
        const attack = SocConfig.attackOf(this.team);
        this.goal = SocPlanner.clampToField({ x: ball.x * 0.4 + (this.slot % 2 === 0 ? 2.5 : -2.5) * attack, z: ball.z - attack * 3.5 });
    }
}
class SocKeeper extends SocPlayerController {
    constructor(slot, random) {
        super(slot);
        this.random = random;
        this.nextThinkMs = 0;
        this.holdSinceMs = -1;
        this.targetX = 0;
        this.targetDepth = (SocConfig.KEEPER_NEAR + SocConfig.KEEPER_FAR) / 2;
        this.speedScale = SocConfig.KEEPER_SPEED_SCALE;
    }
    poll(engine, dtSec, nowMs) {
        if (!engine)
            return;
        if (engine.phase === "play") {
            if (nowMs >= this.nextThinkMs) {
                this.nextThinkMs = nowMs + SocConfig.KEEPER_THINK_MS;
                this.think(engine, nowMs);
            }
        }
        else {
            this.holdSinceMs = -1;
            this.targetX = 0;
            this.targetDepth = (SocConfig.KEEPER_NEAR + SocConfig.KEEPER_FAR) / 2;
        }
        this.steer();
        this.step(dtSec, nowMs);
        this.confine();
        this.yaw = SocCourtLayout.facingYaw(this.team);
    }
    get side() {
        return SocConfig.sideOf(this.team);
    }
    steer() {
        const dx = this.targetX - this.x;
        const dz = this.side * (SocConfig.HALF_L - this.targetDepth) - this.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 0.18) {
            this.ix = dx / distance;
            this.iz = dz / distance;
        }
        else {
            this.ix = this.iz = 0;
        }
    }
    confine() {
        this.x = SocMath.clamp(this.x, -SocConfig.KEEPER_HALF_W, SocConfig.KEEPER_HALF_W);
        const depth = SocMath.clamp(SocConfig.HALF_L - this.side * this.z, SocConfig.KEEPER_NEAR, SocConfig.KEEPER_FAR);
        this.z = this.side * (SocConfig.HALF_L - depth);
    }
    think(engine, nowMs) {
        if (engine.ownerSlot === this.slot) {
            this.targetX = this.x;
            this.targetDepth = SocConfig.HALF_L - this.side * this.z;
            if (this.holdSinceMs < 0)
                this.holdSinceMs = nowMs;
            if (nowMs - this.holdSinceMs > SocConfig.KEEPER_HOLD_MS && !this.isBusy(nowMs)) {
                this.queueAction({ kind: "pass", power: SocConfig.KEEPER_KICK_POWER, atMs: nowMs, dirX: 0, dirZ: 0 });
                this.holdSinceMs = nowMs;
            }
            return;
        }
        this.holdSinceMs = -1;
        const ball = engine.ballPoint(nowMs);
        const velocity = engine.ballVelocity();
        const incoming = velocity.z * this.side > 1.5;
        const middle = (SocConfig.KEEPER_NEAR + SocConfig.KEEPER_FAR) / 2;
        let x = ball.x * 0.45;
        let depth = middle;
        if (incoming) {
            const seconds = (this.side * SocConfig.HALF_L - ball.z) / velocity.z;
            x = ball.x + velocity.x * Math.max(0, seconds) + SocMath.gaussian(this.random) * 0.25;
        }
        else if (engine.ownerSlot < 0 && engine.physics.speed() < 3 && Math.hypot(ball.x - this.x, ball.z - this.z) < SocConfig.KEEPER_COME_OUT_DISTANCE) {
            x = ball.x;
            depth = SocConfig.KEEPER_FAR;
        }
        this.targetX = SocMath.clamp(x, -SocConfig.KEEPER_HALF_W, SocConfig.KEEPER_HALF_W);
        this.targetDepth = depth;
    }
}
class SocEngine {
    constructor(players, random) {
        this.players = players;
        this.random = random;
        this.physics = new SocBallPhysics();
        this.dribble = new SocDribbleFollower();
        this.phase = "idle";
        this.score = [0, 0];
        this.ownerSlot = -1;
        this.ballKind = "kickoff";
        this.lastToucher = -1;
        this.lastKickerSlot = -1;
        this.lastKickMs = 0;
        this.leftMs = SocConfig.MATCH_MS;
        this.overtime = false;
        this.kickoffTeam = 0;
        this.gameNo = 0;
        this.scorer = -1;
        this.ownGoal = false;
        this.winner = -1;
        this.goalsBySlot = [0, 0, 0, 0];
        this.concedingTeam = 0;
        this.ownerSinceMs = 0;
        this.ballSeq = 0;
        this.phaseEndMs = 0;
        this.kickerImmuneUntilMs = 0;
        this.accumulator = 0;
        this.lastBallWriteMs = 0;
        this.events = [];
        this.keepers = [new SocKeeper(SocConfig.SEAT_COUNT, random), new SocKeeper(SocConfig.SEAT_COUNT + 1, random)];
        this.bodyCache = players.concat(this.keepers);
        this.bodyCache.forEach((body) => { body.obstacles = this.bodyCache; });
    }
    get bodies() {
        for (let index = 0; index < SocConfig.SEAT_COUNT; index++) {
            if (this.bodyCache[index] !== this.players[index]) {
                this.bodyCache[index] = this.players[index];
                this.players[index].obstacles = this.bodyCache;
            }
        }
        return this.bodyCache;
    }
    opponentsOf(team) {
        return this.bodies.filter((body) => body.team !== team);
    }
    ballPoint(nowMs) {
        if (this.ownerSlot >= 0)
            return this.dribblePoint(nowMs);
        return { x: this.physics.x, z: this.physics.z };
    }
    ballVelocity() {
        if (this.ownerSlot >= 0) {
            const velocity = this.bodies[this.ownerSlot].velocity();
            return { x: velocity.vx, z: velocity.vz };
        }
        return { x: this.physics.vx, z: this.physics.vz };
    }
    begin(nowMs) {
        this.events = [];
        this.kickoffTeam = this.random() < 0.5 ? 0 : 1;
        this.startReady(nowMs, SocConfig.READY_MS);
        return this.flush();
    }
    update(dtSec, nowMs) {
        this.events = [];
        const playing = this.phase === "play";
        this.bodies.forEach((body) => {
            body.frozen = !playing;
            body.carrying = body.slot === this.ownerSlot;
        });
        this.keepers.forEach((keeper) => keeper.poll(this, dtSec, nowMs));
        if (this.phase === "ready" && nowMs >= this.phaseEndMs)
            this.startPlay(nowMs);
        else if (this.phase === "play")
            this.updatePlay(dtSec, nowMs);
        else if (this.phase === "goal")
            this.updateGoal(dtSec, nowMs);
        return this.flush();
    }
    flush() {
        const events = this.events;
        this.events = [];
        return events;
    }
    dribblePoint(nowMs) {
        const owner = this.bodies[this.ownerSlot];
        return this.dribble.position(owner.x, owner.z, owner.yaw, owner.moving, this.ownerSinceMs, nowMs, this.physics);
    }
    startReady(nowMs, durationMs) {
        this.phase = "ready";
        this.gameNo++;
        this.phaseEndMs = nowMs + durationMs;
        this.bodies.forEach((body) => {
            const spot = SocCourtLayout.spotFor(body.slot, this.kickoffTeam);
            body.teleport(spot.x, spot.z);
            body.frozen = true;
        });
        this.physics.load({ x: 0, y: SocConfig.BALL_R, z: 0, vx: 0, vy: 0, vz: 0 });
        this.physics.scoredTeam = -1;
        this.physics.impacts.length = 0;
        this.ownerSlot = SocCourtLayout.takerSlot(this.kickoffTeam);
        this.ownerSinceMs = nowMs;
        this.dribble.reset();
        this.ballKind = "kickoff";
        this.lastToucher = this.ownerSlot;
        this.players[this.ownerSlot].protectUntilMs = nowMs + durationMs + SocConfig.KICKOFF_PROTECT_MS;
        this.emitGame(nowMs);
        this.emitBall(nowMs, "kickoff", this.ownerSlot, -1);
    }
    startPlay(nowMs) {
        this.phase = "play";
        this.ownerSinceMs = nowMs;
        this.dribble.reset();
        this.emitGame(nowMs);
        this.emitBall(nowMs, "kickoff", this.ownerSlot, -1);
    }
    updatePlay(dtSec, nowMs) {
        if (!this.overtime) {
            this.leftMs -= dtSec * 1000;
            if (this.leftMs <= 0) {
                this.leftMs = 0;
                this.timeUp(nowMs);
                return;
            }
        }
        this.processRequests(nowMs);
        this.stepBall(dtSec, nowMs);
        this.resolveBodyActions(nowMs);
        this.checkGoal(nowMs);
        if (this.ownerSlot < 0 && this.physics.speed() > 0.4 && nowMs - this.lastBallWriteMs > 800)
            this.emitBall(nowMs, "loose", -1, -1);
    }
    updateGoal(dtSec, nowMs) {
        this.accumulator += dtSec;
        while (this.accumulator >= SocConfig.SUB_STEP) {
            this.physics.substep(SocConfig.SUB_STEP);
            this.accumulator -= SocConfig.SUB_STEP;
        }
        if (nowMs < this.phaseEndMs)
            return;
        if (this.overtime) {
            this.finish(nowMs, this.score[0] > this.score[1] ? 0 : 1);
            return;
        }
        this.kickoffTeam = this.concedingTeam;
        this.startReady(nowMs, SocConfig.READY_MS);
    }
    timeUp(nowMs) {
        if (this.score[0] === this.score[1]) {
            this.overtime = true;
            this.kickoffTeam = this.random() < 0.5 ? 0 : 1;
            this.startReady(nowMs, SocConfig.OVERTIME_READY_MS);
            return;
        }
        this.finish(nowMs, this.score[0] > this.score[1] ? 0 : 1);
    }
    finish(nowMs, winner) {
        this.phase = "over";
        this.winner = winner;
        this.bodies.forEach((body) => { body.frozen = true; });
        this.emitGame(nowMs);
    }
    checkGoal(nowMs) {
        const team = this.physics.scoredTeam;
        if (team < 0)
            return;
        this.physics.scoredTeam = -1;
        this.score[team]++;
        this.scorer = this.lastToucher;
        this.ownGoal = this.scorer >= 0 && SocConfig.teamOfSlot(this.scorer) !== team;
        if (this.scorer >= 0 && this.scorer < SocConfig.SEAT_COUNT && !this.ownGoal)
            this.goalsBySlot[this.scorer]++;
        this.concedingTeam = 1 - team;
        this.phase = "goal";
        this.phaseEndMs = nowMs + SocConfig.GOAL_MS;
        this.ownerSlot = -1;
        this.bodies.forEach((body) => { body.frozen = true; });
        this.emitGame(nowMs);
        this.emitBall(nowMs, "loose", -1, -1);
    }
    processRequests(nowMs) {
        this.bodies.forEach((player) => {
            const request = player.takeQueued();
            if (!request || nowMs - request.atMs > 900 || player.isBusy(nowMs))
                return;
            if (request.kind === "pass")
                this.executePass(player, request, nowMs);
            else if (request.kind === "shot")
                this.executeShot(player, request, nowMs);
            else
                this.beginBodyAction(player, request, nowMs);
        });
    }
    beginBodyAction(player, request, nowMs) {
        let dirX = request.dirX, dirZ = request.dirZ;
        if (Math.hypot(dirX, dirZ) < 0.01) {
            const owner = this.ownerSlot >= 0 && this.bodies[this.ownerSlot].team !== player.team ? this.bodies[this.ownerSlot] : null;
            const aim = SocActionAim.direction(request.kind, player, owner ? this.ballPoint(nowMs) : null);
            dirX = aim.x;
            dirZ = aim.z;
        }
        player.beginBodyAction(request.kind === "tackle" ? "tackle" : "slide", nowMs, dirX, dirZ);
    }
    executePass(player, request, nowMs) {
        if (this.ownerSlot !== player.slot)
            return;
        const mate = this.passTarget(player);
        const from = this.dribblePoint(nowMs);
        const error = player instanceof SocBot ? SocMath.gaussian(this.random) * SocBotTuning.PASS_ERROR : 0;
        const launch = SocPlanner.pass(from, mate.velocity(), request.power, error);
        this.kick(player, launch, "pass", nowMs);
    }
    passTarget(player) {
        if (player.slot < SocConfig.SEAT_COUNT)
            return this.players[player.slot ^ 1];
        const attack = SocConfig.attackOf(player.team);
        const mates = this.players.filter((candidate) => candidate.team === player.team);
        return mates.reduce((best, candidate) => (candidate.z * attack > best.z * attack ? candidate : best), mates[0]);
    }
    executeShot(player, request, nowMs) {
        if (this.ownerSlot !== player.slot)
            return;
        const from = this.dribblePoint(nowMs);
        const opponents = this.opponentsOf(player.team).map((opponent) => ({ x: opponent.x, z: opponent.z }));
        const launch = SocPlanner.shot(from, player.team, opponents, request.power, this.random);
        this.kick(player, launch, "shot", nowMs);
    }
    kick(player, launch, kind, nowMs) {
        const speed = Math.hypot(launch.vx, launch.vz) || 1;
        const startX = launch.startX + (launch.vx / speed) * 0.2;
        const startZ = launch.startZ + (launch.vz / speed) * 0.2;
        this.physics.load({ x: startX, y: SocConfig.BALL_R, z: startZ, vx: launch.vx, vy: launch.vy, vz: launch.vz });
        this.ownerSlot = -1;
        this.ballKind = kind;
        this.lastToucher = player.slot;
        this.lastKickerSlot = player.slot;
        this.lastKickMs = nowMs;
        this.kickerImmuneUntilMs = nowMs + SocConfig.KICK_IMMUNE_MS;
        player.yaw = Math.atan2(launch.vx, launch.vz);
        this.emitBall(nowMs, kind, player.slot, -1);
    }
    stepBall(dtSec, nowMs) {
        if (this.ownerSlot >= 0) {
            const point = this.dribblePoint(nowMs);
            const velocity = this.bodies[this.ownerSlot].velocity();
            this.physics.load({ x: point.x, y: SocConfig.BALL_R, z: point.z, vx: velocity.vx, vy: 0, vz: velocity.vz });
            return;
        }
        this.collideBall(nowMs);
        if (this.ownerSlot >= 0)
            return;
        this.accumulator += dtSec;
        while (this.accumulator >= SocConfig.SUB_STEP) {
            this.physics.substep(SocConfig.SUB_STEP);
            this.accumulator -= SocConfig.SUB_STEP;
            this.collideBall(nowMs);
            if (this.ownerSlot >= 0 || this.physics.scoredTeam >= 0) {
                this.accumulator = 0;
                return;
            }
        }
        this.collideBall(nowMs);
    }
    collideBall(nowMs) {
        const ball = this.physics;
        const speed = ball.speed();
        let taker = null;
        let takerDistance = Infinity;
        for (const player of this.bodies) {
            if (player.slot === this.lastKickerSlot && nowMs < this.kickerImmuneUntilMs)
                continue;
            const distance = Math.hypot(ball.x - player.x, ball.z - player.z);
            const keeper = player.slot >= SocConfig.SEAT_COUNT;
            const canTake = this.ballKind === "pass" || speed <= (keeper ? SocConfig.KEEPER_CATCH_SPEED : SocConfig.CAPTURE_MAX_SPEED);
            const overlapping = distance < SocConfig.BODY_R + SocConfig.BALL_R;
            const stunned = nowMs < player.noPickupUntilMs;
            const deep = distance < (SocConfig.BODY_R + SocConfig.BALL_R) * 0.85;
            const available = overlapping ? !stunned || deep || this.nearWall() : !stunned && !player.isBusy(nowMs);
            if (canTake && distance < (keeper ? SocConfig.KEEPER_REACH : SocConfig.PICKUP_RADIUS) && ball.y < (keeper ? SocConfig.BODY_H : SocConfig.PICKUP_HEIGHT) && available && distance < takerDistance) {
                taker = player;
                takerDistance = distance;
            }
        }
        if (taker) {
            this.capture(taker, nowMs);
            return;
        }
        for (let pass = 0; pass < 2; pass++) {
            for (const player of this.bodies) {
                if (player.slot === this.lastKickerSlot && nowMs < this.kickerImmuneUntilMs)
                    continue;
                this.bounceOffBody(player, nowMs);
            }
        }
        this.captureTrappedBall(nowMs);
    }
    captureTrappedBall(nowMs) {
        const reach = SocConfig.BODY_R + SocConfig.BALL_R - 0.02;
        let taker = null;
        let takerDistance = Infinity;
        for (const player of this.bodies) {
            if (player.slot === this.lastKickerSlot && nowMs < this.kickerImmuneUntilMs)
                continue;
            const distance = Math.hypot(this.physics.x - player.x, this.physics.z - player.z);
            if (nowMs < player.noPickupUntilMs || this.physics.y > SocConfig.BODY_H)
                continue;
            if (distance < reach && distance < takerDistance) {
                taker = player;
                takerDistance = distance;
            }
        }
        if (taker)
            this.capture(taker, nowMs);
    }
    nearWall() {
        const margin = SocConfig.BALL_R + 0.4;
        return Math.abs(this.physics.x) > SocConfig.HALF_W - margin || Math.abs(this.physics.z) > SocConfig.HALF_L - margin;
    }
    capture(player, nowMs) {
        this.ownerSlot = player.slot;
        this.ownerSinceMs = nowMs;
        this.dribble.reset();
        this.ballKind = "dribble";
        this.lastToucher = player.slot;
        player.protectUntilMs = nowMs + (player.slot >= SocConfig.SEAT_COUNT ? SocConfig.KEEPER_HOLD_MS * 4 : SocConfig.OWNER_PROTECT_MS);
        this.emitBall(nowMs, "dribble", player.slot, -1);
    }
    bounceOffBody(player, nowMs) {
        const ball = this.physics;
        const reach = SocConfig.BODY_R + SocConfig.BALL_R;
        const dx = ball.x - player.x, dz = ball.z - player.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= reach || ball.y > SocConfig.BODY_H + SocConfig.BALL_R)
            return;
        let normalX = 1, normalZ = 0;
        if (distance > 1e-4) {
            normalX = dx / distance;
            normalZ = dz / distance;
        }
        else if (ball.speed() > 1e-3) {
            normalX = -ball.vx / ball.speed();
            normalZ = -ball.vz / ball.speed();
        }
        const relative = ball.vx * normalX + ball.vz * normalZ;
        ball.x = player.x + normalX * (reach + 0.01);
        ball.z = player.z + normalZ * (reach + 0.01);
        ball.settle();
        if (relative >= 0)
            return;
        ball.vx -= (1 + SocConfig.BODY_REST) * relative * normalX;
        ball.vz -= (1 + SocConfig.BODY_REST) * relative * normalZ;
        this.ballKind = "deflect";
        this.emitBall(nowMs, "deflect", player.slot, -1);
    }
    resolveBodyActions(nowMs) {
        this.players.forEach((player) => {
            if (player.actionKind === "none" || player.actionResolved)
                return;
            if (!player.isActing(nowMs)) {
                player.actionResolved = true;
                return;
            }
            if (this.ownerSlot >= 0 && this.tryDislodge(player, nowMs))
                return;
            if (player.actionKind === "slide" && this.ownerSlot < 0 && !player.slideKicked)
                this.tryKickLoose(player, nowMs);
        });
    }
    tryDislodge(player, nowMs) {
        const victim = this.bodies[this.ownerSlot];
        if (victim.slot >= SocConfig.SEAT_COUNT || victim.team === player.team || nowMs < victim.protectUntilMs)
            return false;
        const ball = this.dribblePoint(nowMs);
        const dx = ball.x - player.x, dz = ball.z - player.z;
        const distance = Math.hypot(dx, dz);
        let hit = false;
        if (player.actionKind === "tackle") {
            const angle = Math.abs(SocMath.angleDifference(Math.atan2(dx, dz), Math.atan2(player.actionDirX, player.actionDirZ)));
            hit = distance <= SocConfig.TACKLE_CLOSE_RANGE || (distance <= SocConfig.TACKLE_RANGE && angle <= SocConfig.TACKLE_HALF_ANGLE);
        }
        else {
            const bodyDistance = Math.hypot(victim.x - player.x, victim.z - player.z);
            const front = dx * player.actionDirX + dz * player.actionDirZ > -0.2;
            hit = front && (distance <= SocConfig.SLIDE_HIT_RADIUS || bodyDistance <= SocConfig.SLIDE_HIT_RADIUS);
        }
        if (!hit)
            return false;
        const pop = player.actionKind === "slide" ? SocConfig.SLIDE_POP_SPEED : SocConfig.TACKLE_POP_SPEED;
        const turn = (this.random() < 0.5 ? -1 : 1) * (0.7 + this.random() * 0.5);
        const base = Math.atan2(player.actionDirX, player.actionDirZ) + turn;
        const popZ = Math.cos(base) * pop;
        const forwardZ = Math.abs(popZ) * SocConfig.attackOf(player.team);
        const popX = Math.sin(base) * pop;
        const popLength = Math.hypot(popX, forwardZ) || 1;
        const edge = SocConfig.BODY_R + SocConfig.BALL_R + 0.02;
        this.physics.load({ x: victim.x + (popX / popLength) * edge, y: SocConfig.BALL_R, z: victim.z + (forwardZ / popLength) * edge, vx: popX, vy: 0, vz: forwardZ });
        this.pushOutOfBodies();
        this.ownerSlot = -1;
        this.ballKind = "tackled";
        this.lastToucher = player.slot;
        this.lastKickerSlot = -1;
        victim.noPickupUntilMs = nowMs + SocConfig.DISLODGE_STUN_MS;
        player.winRecover(nowMs);
        this.emitBall(nowMs, "tackled", player.slot, victim.slot);
        this.ballKind = "loose";
        const squeezed = Math.hypot(this.physics.x - victim.x, this.physics.z - victim.z) < SocConfig.BODY_R + SocConfig.BALL_R - 0.05;
        if (squeezed)
            this.capture(player, nowMs);
        else
            this.captureTrappedBall(nowMs);
        return true;
    }
    pushOutOfBodies() {
        const reach = SocConfig.BODY_R + SocConfig.BALL_R + 0.01;
        this.bodies.forEach((player) => {
            const dx = this.physics.x - player.x, dz = this.physics.z - player.z;
            const distance = Math.hypot(dx, dz);
            if (distance >= reach || distance < 1e-4)
                return;
            this.physics.x = player.x + (dx / distance) * reach;
            this.physics.z = player.z + (dz / distance) * reach;
        });
        this.physics.settle();
    }
    tryKickLoose(player, nowMs) {
        const ball = this.physics;
        if (ball.y > 0.9 || Math.hypot(ball.x - player.x, ball.z - player.z) > SocConfig.SLIDE_HIT_RADIUS)
            return;
        player.slideKicked = true;
        ball.vx = player.actionDirX * SocConfig.SLIDE_KICK_SPEED;
        ball.vz = player.actionDirZ * SocConfig.SLIDE_KICK_SPEED;
        this.ballKind = "loose";
        this.lastToucher = player.slot;
        this.lastKickerSlot = player.slot;
        this.kickerImmuneUntilMs = nowMs + SocConfig.KICK_IMMUNE_MS;
        this.emitBall(nowMs, "loose", player.slot, -1);
    }
    emitBall(nowMs, kind, by, victim) {
        const state = this.physics.state();
        if (this.ownerSlot >= 0) {
            const point = this.dribblePoint(nowMs);
            state.x = point.x;
            state.z = point.z;
            state.y = SocConfig.BALL_R;
            state.vx = state.vy = state.vz = 0;
        }
        this.lastBallWriteMs = nowMs;
        this.ballSeq++;
        const ball = {
            x: Math.round(state.x * 100) / 100, y: Math.round(state.y * 100) / 100, z: Math.round(state.z * 100) / 100,
            vx: Math.round(state.vx * 100) / 100, vy: Math.round(state.vy * 100) / 100, vz: Math.round(state.vz * 100) / 100,
            at: Math.round(nowMs), seq: this.ballSeq, kind, by, owner: this.ownerSlot, victim
        };
        this.events.push({ type: "ball", ball });
    }
    emitGame(nowMs) {
        this.events.push({
            type: "game",
            game: {
                n: this.gameNo, phase: this.phase === "idle" ? "ready" : this.phase, at: Math.round(nowMs), leftMs: Math.round(this.leftMs), overtime: this.overtime,
                sa: this.score[0], sb: this.score[1], kickoff: this.kickoffTeam, scorer: this.scorer, own: this.ownGoal, winner: this.winner, goals: this.goalsBySlot.slice()
            }
        });
    }
}
