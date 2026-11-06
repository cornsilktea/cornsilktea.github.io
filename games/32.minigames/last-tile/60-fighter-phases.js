"use strict";
class FighterPhase {
    receiveOut(snapshot, parts) {
        return new OutPhase();
    }
    enteredLocally(fighterId, t, listener) {
        listener.stateChanged(t);
    }
    tryPush(parts, fighterId, t, env) {
        return null;
    }
    tryDash(parts, t, env, yaw) {
        return false;
    }
    receivePush(parts, fighterId, event, t, env) {
        return false;
    }
    isGrounded() { return false; }
    isFalling() { return false; }
    isOut() { return false; }
    floor() { return -1; }
}
class DashRun {
    constructor(dx, dz, distance) {
        this.dx = dx;
        this.dz = dz;
        this.left = distance;
    }
    nextStep(dt) {
        return Math.min(this.left, LastTileRules.DASH_SPEED * dt);
    }
    consume(distance) {
        this.left -= distance;
    }
    isFinished() {
        return this.left <= 0.0001;
    }
}
class GroundedPhase extends FighterPhase {
    constructor(groundFloor, observed = null) {
        super();
        this.groundFloor = groundFloor;
        this.observed = observed;
        this.wireCode = "G";
        this.dash = null;
    }
    accept(visitor) { return visitor.grounded(this.groundFloor); }
    isGrounded() { return true; }
    floor() { return this.groundFloor; }
    stepLocal(parts, dt, t, env, listener) {
        return this.dash ? this.stepDash(parts, dt, t, env, listener) : this.stepWalk(parts, dt, t, env, listener);
    }
    stepObserved(parts, dt, t, env) {
        const seen = this.observed;
        if (!seen)
            return null;
        const age = MathUtil.clamp((t - seen.sentAt) / 1000, 0, GroundedPhase.MAX_EXTRAPOLATION_S);
        const ratio = Math.min(1, dt * GroundedPhase.SMOOTH_POSITION_RATE);
        parts.body.easeToward(seen.x + seen.vx * age, seen.z + seen.vz * age, ratio);
        parts.body.easeHeight(LastTileGeometry.floorY(this.groundFloor), Math.min(1, dt * GroundedPhase.SMOOTH_HEIGHT_RATE));
        parts.body.setVelocity(seen.vx, seen.vz);
        parts.body.faceYaw(seen.yaw);
        parts.abilities.mirror(seen.dashEndsAt, seen.pushedAt);
        return null;
    }
    receiveGrounded(snapshot, parts) {
        const body = parts.body;
        const needsReposition = this.groundFloor !== snapshot.floor || body.distanceTo(snapshot.x, snapshot.z) > GroundedPhase.REPOSITION_DISTANCE;
        this.groundFloor = snapshot.floor;
        this.observed = snapshot;
        this.dash = null;
        if (needsReposition)
            body.setPosition(snapshot.x + snapshot.vx * GroundedPhase.REPOSITION_LEAD_S, LastTileGeometry.floorY(snapshot.floor), snapshot.z + snapshot.vz * GroundedPhase.REPOSITION_LEAD_S);
        body.faceYaw(snapshot.yaw);
        parts.abilities.mirror(snapshot.dashEndsAt, snapshot.pushedAt);
        return this;
    }
    receiveFalling(snapshot, parts) {
        return FallingPhase.fromSnapshot(snapshot, parts);
    }
    encode(parts, t) {
        const body = parts.body;
        return {
            code: this.wireCode, floor: this.groundFloor, x: body.x, y: body.y, z: body.z, vx: body.velocityX, vz: body.velocityZ, yaw: body.yaw,
            fallId: parts.falls.current, passedFloor: 0, sentAt: t, dashEndsAt: parts.abilities.dashingUntil, pushedAt: parts.abilities.lastPushAt, fallStartedAt: 0
        };
    }
    tryPush(parts, fighterId, t, env) {
        if (this.dash || !parts.abilities.canPush(t) || !env.isPlaying(t))
            return null;
        parts.abilities.startPush(t);
        const body = parts.body;
        return { by: fighterId, x: MathUtil.round2(body.x), z: MathUtil.round2(body.z), f: this.groundFloor, a: MathUtil.round2(body.yaw), t: Math.round(t) };
    }
    tryDash(parts, t, env, yaw) {
        if (this.dash || !parts.abilities.canDash(t) || !env.isPlaying(t))
            return false;
        const direction = this.dashDirection(parts, yaw);
        this.dash = new DashRun(direction.x, direction.z, LastTileRules.DASH_DISTANCE);
        parts.body.faceYaw(Math.atan2(direction.x, direction.z));
        parts.abilities.startDash(t);
        return true;
    }
    receivePush(parts, fighterId, event, t, env) {
        if (fighterId === event.by || this.groundFloor !== event.f || this.dash || !env.isPlaying(t))
            return false;
        const body = parts.body;
        const dx = body.x - event.x, dz = body.z - event.z, distance = Math.hypot(dx, dz);
        if (distance > LastTileRules.PUSH_RANGE)
            return false;
        const angle = Math.atan2(dx, dz);
        if (distance > LastTileRules.PUSH_MIN_SPREAD_DISTANCE && Math.abs(MathUtil.angleDifference(angle, event.a)) > LastTileRules.PUSH_HALF_ANGLE)
            return false;
        const radialX = distance > 0.001 ? dx / distance : Math.sin(event.a);
        const radialZ = distance > 0.001 ? dz / distance : Math.cos(event.a);
        const blend = LastTileRules.PUSH_BLEND_RADIAL;
        const directionX = Math.sin(event.a) * (1 - blend) + radialX * blend;
        const directionZ = Math.cos(event.a) * (1 - blend) + radialZ * blend;
        const length = Math.hypot(directionX, directionZ) || 1;
        body.addVelocity(directionX / length * LastTileRules.PUSH_IMPULSE, directionZ / length * LastTileRules.PUSH_IMPULSE);
        parts.abilities.registerHit(t);
        return true;
    }
    isDashing() {
        return this.dash !== null;
    }
    dashDirection(parts, yaw) {
        if (yaw !== null)
            return { x: Math.sin(yaw), z: Math.cos(yaw) };
        const steering = parts.steering;
        if (steering.isActive()) {
            const length = Math.hypot(steering.x, steering.z);
            return { x: steering.x / length, z: steering.z / length };
        }
        return { x: Math.sin(parts.body.yaw), z: Math.cos(parts.body.yaw) };
    }
    stepDash(parts, dt, t, env, listener) {
        const dash = this.dash;
        const step = dash.nextStep(dt);
        parts.body.moveBy(dash.dx * step, dash.dz * step);
        dash.consume(step);
        if (!dash.isFinished())
            return null;
        this.dash = null;
        parts.body.setVelocity(dash.dx * LastTileRules.DASH_EXIT_SPEED, dash.dz * LastTileRules.DASH_EXIT_SPEED);
        return this.settleAfterMove(parts, t, env, listener);
    }
    stepWalk(parts, dt, t, env, listener) {
        const live = env.isPlaying(t);
        const wantX = live ? parts.steering.x : 0, wantZ = live ? parts.steering.z : 0;
        const topSpeed = LastTileRules.MAX_SPEED * parts.steering.speedFactor;
        const pushing = wantX !== 0 || wantZ !== 0;
        parts.body.accelerateToward(wantX * topSpeed, wantZ * topSpeed, pushing ? LastTileRules.ACCEL : LastTileRules.FRICTION, dt);
        parts.body.glide(dt);
        if (live && pushing)
            parts.body.faceYaw(Math.atan2(wantX, wantZ));
        return this.settleAfterMove(parts, t, env, listener);
    }
    settleAfterMove(parts, t, env, listener) {
        parts.body.keepInsideBoard();
        const index = LastTileGeometry.tileIndexAt(parts.body.x, parts.body.z);
        if (!env.board.isSolid(this.groundFloor, index, t))
            return FallingPhase.startFrom(parts, this.groundFloor, t);
        if (t >= env.board.startAt() && env.board.recordStep(this.groundFloor, index, t))
            listener.tileStepped(this.groundFloor, index, t);
        return null;
    }
}
GroundedPhase.MAX_EXTRAPOLATION_S = 0.35;
GroundedPhase.SMOOTH_POSITION_RATE = 14;
GroundedPhase.SMOOTH_HEIGHT_RATE = 18;
GroundedPhase.REPOSITION_DISTANCE = 2.5;
GroundedPhase.REPOSITION_LEAD_S = 0.05;
class FallingPhase extends FighterPhase {
    constructor(trajectory) {
        super();
        this.trajectory = trajectory;
        this.wireCode = "F";
    }
    static startFrom(parts, floor, t) {
        parts.falls.advance();
        return new FallingPhase(FallTrajectory.from(parts.body, floor, t));
    }
    static fromSnapshot(snapshot, parts) {
        parts.falls.adopt(snapshot.fallId);
        snapshot.faceFrom(parts);
        return new FallingPhase(snapshot.startTrajectory());
    }
    accept(visitor) { return visitor.falling(); }
    isFalling() { return true; }
    stepLocal(parts, dt, t, env, listener) {
        const resolution = this.trajectory.resolve(t, env.board);
        if (resolution.landing)
            return this.landLocally(parts, resolution.landing);
        parts.body.setPosition(resolution.position.x, resolution.position.y, resolution.position.z);
        return resolution.position.y < LastTileGeometry.floorY(0) - LastTileRules.DEATH_DEPTH ? new OutPhase(t) : null;
    }
    stepObserved(parts, dt, t, env) {
        const resolution = this.trajectory.resolve(t, env.board);
        if (resolution.landing)
            return this.landObserved(parts, resolution.landing, t);
        parts.body.setPosition(resolution.position.x, resolution.position.y, resolution.position.z);
        return null;
    }
    receiveGrounded(snapshot, parts) {
        const body = parts.body;
        body.setPosition(snapshot.x + snapshot.vx * GroundedPhase.REPOSITION_LEAD_S, LastTileGeometry.floorY(snapshot.floor), snapshot.z + snapshot.vz * GroundedPhase.REPOSITION_LEAD_S);
        body.faceYaw(snapshot.yaw);
        parts.abilities.mirror(snapshot.dashEndsAt, snapshot.pushedAt);
        return new GroundedPhase(snapshot.floor, snapshot);
    }
    receiveFalling(snapshot, parts) {
        if (parts.falls.current !== snapshot.fallId)
            return FallingPhase.fromSnapshot(snapshot, parts);
        this.trajectory.lowerPassedFloor(snapshot.passedFloor);
        snapshot.faceFrom(parts);
        return this;
    }
    encode(parts, t) {
        const fall = this.trajectory;
        return {
            code: this.wireCode, floor: -1, x: fall.x, y: fall.y, z: fall.z, vx: fall.velocityX, vz: fall.velocityZ, yaw: parts.body.yaw,
            fallId: parts.falls.current, passedFloor: fall.passed, sentAt: t, dashEndsAt: parts.abilities.dashingUntil, pushedAt: parts.abilities.lastPushAt, fallStartedAt: fall.startTime
        };
    }
    landLocally(parts, landing) {
        this.placeOnFloor(parts, landing);
        return new GroundedPhase(landing.floor);
    }
    landObserved(parts, landing, t) {
        this.placeOnFloor(parts, landing);
        const body = parts.body;
        const seen = GroundedSnapshot.landedFrom(landing.floor, body.x, body.z, body.velocityX, body.velocityZ, body.yaw, t);
        parts.abilities.mirror(0, 0);
        return new GroundedPhase(landing.floor, seen);
    }
    placeOnFloor(parts, landing) {
        parts.body.setPosition(landing.x, LastTileGeometry.floorY(landing.floor), landing.z);
        parts.body.setVelocity(landing.vx * LastTileRules.LAND_KEEP, landing.vz * LastTileRules.LAND_KEEP);
    }
}
class OutPhase extends FighterPhase {
    constructor(outAt = 0) {
        super();
        this.outAt = outAt;
        this.wireCode = "O";
    }
    accept(visitor) { return visitor.out(); }
    isOut() { return true; }
    stepLocal(parts, dt, t, env, listener) { return null; }
    stepObserved(parts, dt, t, env) { return null; }
    receiveOut(snapshot, parts) {
        return this;
    }
    receiveGrounded(snapshot, parts) {
        const body = parts.body;
        body.setPosition(snapshot.x + snapshot.vx * GroundedPhase.REPOSITION_LEAD_S, LastTileGeometry.floorY(snapshot.floor), snapshot.z + snapshot.vz * GroundedPhase.REPOSITION_LEAD_S);
        body.faceYaw(snapshot.yaw);
        parts.abilities.mirror(snapshot.dashEndsAt, snapshot.pushedAt);
        return new GroundedPhase(snapshot.floor, snapshot);
    }
    receiveFalling(snapshot, parts) {
        return FallingPhase.fromSnapshot(snapshot, parts);
    }
    enteredLocally(fighterId, t, listener) {
        listener.eliminated(fighterId, t);
        listener.stateChanged(t);
    }
    encode(parts, t) {
        const body = parts.body;
        return {
            code: this.wireCode, floor: -1, x: body.x, y: body.y, z: body.z, vx: body.velocityX, vz: body.velocityZ, yaw: body.yaw,
            fallId: parts.falls.current, passedFloor: 0, sentAt: t, dashEndsAt: parts.abilities.dashingUntil, pushedAt: parts.abilities.lastPushAt, fallStartedAt: 0
        };
    }
}
