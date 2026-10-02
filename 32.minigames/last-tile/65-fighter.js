"use strict";
class Fighter {
    constructor(id) {
        this.id = id;
        this.parts = new FighterParts();
        this.departed = false;
        const top = LastTileRules.FLOOR_COUNT - 1;
        this.phase = new GroundedPhase(top);
        this.parts.body.place(0, LastTileGeometry.floorY(top), 0, 0);
    }
    get x() { return this.parts.body.x; }
    get y() { return this.parts.body.y; }
    get z() { return this.parts.body.z; }
    get velocityX() { return this.parts.body.velocityX; }
    get velocityZ() { return this.parts.body.velocityZ; }
    get yaw() { return this.parts.body.yaw; }
    spawnAt(x, z) {
        const top = LastTileRules.FLOOR_COUNT - 1;
        this.phase = new GroundedPhase(top);
        this.parts.body.place(x, LastTileGeometry.floorY(top), z, Math.atan2(-x, -z));
    }
    inspect(visitor) {
        return this.phase.accept(visitor);
    }
    isGrounded() { return this.phase.isGrounded(); }
    isFalling() { return this.phase.isFalling(); }
    isOut() { return this.phase.isOut(); }
    hasLeft() { return this.departed; }
    floor() { return this.phase.floor(); }
    speed() { return this.parts.body.speed(); }
    canPush(t) { return this.parts.abilities.canPush(t); }
    canDash(t) { return this.parts.abilities.canDash(t); }
    pushCooldownLeft(t) { return this.parts.abilities.pushCooldownLeft(t); }
    dashCooldownLeft(t) { return this.parts.abilities.dashCooldownLeft(t); }
    isDashAnimating(t) { return this.parts.abilities.isDashAnimating(t); }
    isPushAnimating(t) { return this.parts.abilities.isPushAnimating(t); }
    isHitAnimating(t) { return this.parts.abilities.isHitAnimating(t); }
    steer(x, z) {
        this.parts.steering.steer(x, z);
    }
    releaseSteering() {
        this.parts.steering.release();
    }
    setSpeedFactor(factor) {
        this.parts.steering.setSpeedFactor(factor);
    }
    faceYaw(yaw) {
        this.parts.body.faceYaw(yaw);
    }
    stepLocal(dt, t, env, listener) {
        const next = this.phase.stepLocal(this.parts, dt, t, env, listener);
        if (!next)
            return;
        this.phase = next;
        next.enteredLocally(this.id, t, listener);
    }
    stepObserved(dt, t, env) {
        const next = this.phase.stepObserved(this.parts, dt, t, env);
        if (next)
            this.phase = next;
    }
    receiveSnapshot(snapshot) {
        this.phase = snapshot.applyTo(this.phase, this.parts);
    }
    tryPush(t, env, listener) {
        const event = this.phase.tryPush(this.parts, this.id, t, env);
        if (!event)
            return false;
        listener.pushLaunched(event);
        listener.stateChanged(t);
        return true;
    }
    tryDash(t, env, listener, yaw) {
        if (!this.phase.tryDash(this.parts, t, env, yaw))
            return false;
        listener.stateChanged(t);
        return true;
    }
    receivePush(event, t, env, listener) {
        if (this.phase.receivePush(this.parts, this.id, event, t, env))
            listener.stateChanged(t);
    }
    markOut() {
        if (!this.phase.isOut())
            this.phase = new OutPhase();
    }
    markDeparted() {
        this.departed = true;
        this.phase = new OutPhase();
    }
    encodeState(t) {
        return FighterStateCodec.encode(this.phase.encode(this.parts, t));
    }
}
