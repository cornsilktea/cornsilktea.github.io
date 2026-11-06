"use strict";
class FallTrajectory {
    constructor(startX, startY, startZ, vx, vz, startedAt, passedFloor) {
        this.startX = startX;
        this.startY = startY;
        this.startZ = startZ;
        this.vx = vx;
        this.vz = vz;
        this.startedAt = startedAt;
        this.passedFloor = passedFloor;
    }
    static from(body, floor, t) {
        return new FallTrajectory(body.x, body.y, body.z, body.velocityX, body.velocityZ, t, floor);
    }
    get passed() { return this.passedFloor; }
    get x() { return this.startX; }
    get y() { return this.startY; }
    get z() { return this.startZ; }
    get velocityX() { return this.vx; }
    get velocityZ() { return this.vz; }
    get startTime() { return this.startedAt; }
    lowerPassedFloor(floor) {
        if (floor < this.passedFloor)
            this.passedFloor = floor;
    }
    resolve(t, board) {
        const limit = LastTileRules.BOARD_LIMIT, gravity = LastTileRules.GRAVITY;
        const seconds = (t - this.startedAt) / 1000;
        const position = {
            x: MathUtil.clamp(this.startX + this.vx * seconds, -limit, limit),
            y: this.startY - 0.5 * gravity * seconds * seconds,
            z: MathUtil.clamp(this.startZ + this.vz * seconds, -limit, limit)
        };
        for (let floor = this.passedFloor - 1; floor >= 0; floor--) {
            const floorHeight = LastTileGeometry.floorY(floor);
            if (position.y > floorHeight)
                break;
            const landing = this.landingOn(floor, floorHeight, board);
            if (landing)
                return { landing, position };
            this.passedFloor = floor;
        }
        return { landing: null, position };
    }
    landingOn(floor, floorHeight, board) {
        const limit = LastTileRules.BOARD_LIMIT;
        const arrivalSeconds = Math.sqrt(2 * (this.startY - floorHeight) / LastTileRules.GRAVITY);
        const x = MathUtil.clamp(this.startX + this.vx * arrivalSeconds, -limit, limit);
        const z = MathUtil.clamp(this.startZ + this.vz * arrivalSeconds, -limit, limit);
        const arrivalTime = this.startedAt + arrivalSeconds * 1000;
        if (!board.isSolid(floor, LastTileGeometry.tileIndexAt(x, z), arrivalTime))
            return null;
        return { floor, x, z, vx: this.vx, vz: this.vz };
    }
}
