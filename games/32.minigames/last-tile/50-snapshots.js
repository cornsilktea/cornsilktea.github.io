"use strict";
class RemoteSnapshot {
    constructor(fields) {
        this.fields = fields;
    }
}
class GroundedSnapshot extends RemoteSnapshot {
    get floor() { return this.fields.floor; }
    get x() { return this.fields.x; }
    get z() { return this.fields.z; }
    get vx() { return this.fields.vx; }
    get vz() { return this.fields.vz; }
    get yaw() { return this.fields.yaw; }
    get sentAt() { return this.fields.sentAt; }
    get dashEndsAt() { return this.fields.dashEndsAt; }
    get pushedAt() { return this.fields.pushedAt; }
    static landedFrom(floor, x, z, vx, vz, yaw, t) {
        return new GroundedSnapshot({ floor, x, y: LastTileGeometry.floorY(floor), z, vx, vz, yaw, fallId: 0, passedFloor: 0, sentAt: t, dashEndsAt: 0, pushedAt: 0, fallStartedAt: 0 });
    }
    applyTo(current, parts) {
        return current.receiveGrounded(this, parts);
    }
}
class FallingSnapshot extends RemoteSnapshot {
    get fallId() { return this.fields.fallId; }
    get passedFloor() { return this.fields.passedFloor; }
    startTrajectory() {
        const f = this.fields;
        return new FallTrajectory(f.x, f.y, f.z, f.vx, f.vz, f.fallStartedAt, f.passedFloor);
    }
    faceFrom(parts) {
        parts.body.faceYaw(this.fields.yaw);
    }
    applyTo(current, parts) {
        return current.receiveFalling(this, parts);
    }
}
class OutSnapshot extends RemoteSnapshot {
    applyTo(current, parts) {
        return current.receiveOut(this, parts);
    }
}
class FighterStateCodec {
    static encode(state) {
        return [
            state.code, state.floor,
            MathUtil.round2(state.x), MathUtil.round2(state.y), MathUtil.round2(state.z), MathUtil.round2(state.vx), MathUtil.round2(state.vz),
            MathUtil.round2(state.yaw), state.fallId, state.passedFloor,
            Math.round(state.sentAt), Math.round(state.dashEndsAt || 0), Math.round(state.pushedAt || 0), Math.round(state.fallStartedAt)
        ].join(",");
    }
    static decode(raw) {
        const parts = String(raw).split(",");
        if (parts.length < FighterStateCodec.FIELD_COUNT)
            return null;
        const build = FighterStateCodec.BUILDERS[parts[0]];
        if (!build)
            return null;
        return build({
            floor: +parts[1], x: +parts[2], y: +parts[3], z: +parts[4], vx: +parts[5], vz: +parts[6], yaw: +parts[7],
            fallId: +parts[8], passedFloor: +parts[9], sentAt: +parts[10], dashEndsAt: +parts[11], pushedAt: +parts[12], fallStartedAt: +parts[13]
        });
    }
}
FighterStateCodec.FIELD_COUNT = 14;
FighterStateCodec.BUILDERS = {
    G: (fields) => new GroundedSnapshot(fields),
    F: (fields) => new FallingSnapshot(fields),
    O: (fields) => new OutSnapshot(fields)
};
