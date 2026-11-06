"use strict";
class Body {
    constructor() {
        this.px = 0;
        this.py = 0;
        this.pz = 0;
        this.vx = 0;
        this.vz = 0;
        this.heading = 0;
    }
    get x() { return this.px; }
    get y() { return this.py; }
    get z() { return this.pz; }
    get velocityX() { return this.vx; }
    get velocityZ() { return this.vz; }
    get yaw() { return this.heading; }
    place(x, y, z, yaw) {
        this.px = x;
        this.py = y;
        this.pz = z;
        this.heading = yaw;
    }
    setPosition(x, y, z) {
        this.px = x;
        this.py = y;
        this.pz = z;
    }
    setVelocity(vx, vz) {
        this.vx = vx;
        this.vz = vz;
    }
    addVelocity(dx, dz) {
        this.vx += dx;
        this.vz += dz;
    }
    faceYaw(yaw) {
        this.heading = yaw;
    }
    moveBy(dx, dz) {
        this.px += dx;
        this.pz += dz;
    }
    glide(dt) {
        this.px += this.vx * dt;
        this.pz += this.vz * dt;
    }
    accelerateToward(targetVx, targetVz, rate, dt) {
        const deltaX = targetVx - this.vx, deltaZ = targetVz - this.vz;
        const length = Math.hypot(deltaX, deltaZ), step = rate * dt;
        if (length <= step) {
            this.vx = targetVx;
            this.vz = targetVz;
        }
        else {
            this.vx += deltaX / length * step;
            this.vz += deltaZ / length * step;
        }
    }
    keepInsideBoard() {
        const limit = LastTileRules.BOARD_LIMIT;
        if (this.px > limit) {
            this.px = limit;
            if (this.vx > 0)
                this.vx = 0;
        }
        else if (this.px < -limit) {
            this.px = -limit;
            if (this.vx < 0)
                this.vx = 0;
        }
        if (this.pz > limit) {
            this.pz = limit;
            if (this.vz > 0)
                this.vz = 0;
        }
        else if (this.pz < -limit) {
            this.pz = -limit;
            if (this.vz < 0)
                this.vz = 0;
        }
    }
    easeToward(targetX, targetZ, ratio) {
        this.px += (targetX - this.px) * ratio;
        this.pz += (targetZ - this.pz) * ratio;
    }
    easeHeight(targetY, ratio) {
        this.py = MathUtil.lerp(this.py, targetY, ratio);
    }
    distanceTo(x, z) {
        return MathUtil.distance(this.px, this.pz, x, z);
    }
    speed() {
        return Math.hypot(this.vx, this.vz);
    }
}
class Steering {
    constructor() {
        this.axisX = 0;
        this.axisZ = 0;
        this.factor = 1;
    }
    get x() { return this.axisX; }
    get z() { return this.axisZ; }
    get speedFactor() { return this.factor; }
    steer(x, z) {
        this.axisX = x;
        this.axisZ = z;
    }
    release() {
        this.axisX = 0;
        this.axisZ = 0;
    }
    setSpeedFactor(factor) {
        this.factor = factor;
    }
    isActive() {
        return this.axisX !== 0 || this.axisZ !== 0;
    }
}
class Abilities {
    constructor() {
        this.pushedAt = 0;
        this.pushReadyAt = 0;
        this.dashEndsAt = 0;
        this.dashReadyAt = 0;
        this.hitAt = 0;
    }
    get lastPushAt() { return this.pushedAt; }
    get lastHitAt() { return this.hitAt; }
    get dashingUntil() { return this.dashEndsAt; }
    canPush(t) {
        return t >= this.pushReadyAt;
    }
    canDash(t) {
        return t >= this.dashReadyAt;
    }
    startPush(t) {
        this.pushedAt = t;
        this.pushReadyAt = t + LastTileRules.PUSH_COOLDOWN_MS;
    }
    startDash(t) {
        this.dashEndsAt = t + LastTileRules.DASH_TIME_S * 1000;
        this.dashReadyAt = t + LastTileRules.DASH_COOLDOWN_MS;
    }
    registerHit(t) {
        this.hitAt = t;
    }
    mirror(dashEndsAt, pushedAt) {
        this.dashEndsAt = dashEndsAt;
        this.pushedAt = pushedAt;
    }
    pushCooldownLeft(t) {
        return MathUtil.clamp((this.pushReadyAt - t) / LastTileRules.PUSH_COOLDOWN_MS, 0, 1);
    }
    dashCooldownLeft(t) {
        return MathUtil.clamp((this.dashReadyAt - t) / LastTileRules.DASH_COOLDOWN_MS, 0, 1);
    }
    isDashAnimating(t) {
        return t < this.dashEndsAt;
    }
    isPushAnimating(t) {
        return t - this.pushedAt < 400 && this.pushedAt > 0;
    }
    isHitAnimating(t) {
        return t - this.hitAt < 500 && this.hitAt > 0;
    }
}
class FallSequence {
    constructor() {
        this.count = 0;
    }
    get current() { return this.count; }
    advance() {
        this.count++;
        return this.count;
    }
    adopt(count) {
        this.count = count;
    }
}
class FighterParts {
    constructor() {
        this.body = new Body();
        this.steering = new Steering();
        this.abilities = new Abilities();
        this.falls = new FallSequence();
    }
}
