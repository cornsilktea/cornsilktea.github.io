interface FallLanding {
  floor: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

interface FallPosition {
  x: number;
  y: number;
  z: number;
}

interface FallResolution {
  landing: FallLanding | null;
  position: FallPosition;
}

class FallTrajectory {
  constructor(
    private readonly startX: number,
    private readonly startY: number,
    private readonly startZ: number,
    private readonly vx: number,
    private readonly vz: number,
    private readonly startedAt: number,
    private passedFloor: number
  ) {}

  static from(body: Body, floor: number, t: number): FallTrajectory {
    return new FallTrajectory(body.x, body.y, body.z, body.velocityX, body.velocityZ, t, floor);
  }

  get passed(): number { return this.passedFloor; }
  get x(): number { return this.startX; }
  get y(): number { return this.startY; }
  get z(): number { return this.startZ; }
  get velocityX(): number { return this.vx; }
  get velocityZ(): number { return this.vz; }
  get startTime(): number { return this.startedAt; }

  lowerPassedFloor(floor: number): void {
    if (floor < this.passedFloor) this.passedFloor = floor;
  }

  resolve(t: number, board: TileBoard): FallResolution {
    const limit = LastTileRules.BOARD_LIMIT, gravity = LastTileRules.GRAVITY;
    const seconds = (t - this.startedAt) / 1000;
    const position = {
      x: MathUtil.clamp(this.startX + this.vx * seconds, -limit, limit),
      y: this.startY - 0.5 * gravity * seconds * seconds,
      z: MathUtil.clamp(this.startZ + this.vz * seconds, -limit, limit)
    };
    for (let floor = this.passedFloor - 1; floor >= 0; floor--) {
      const floorHeight = LastTileGeometry.floorY(floor);
      if (position.y > floorHeight) break;
      const landing = this.landingOn(floor, floorHeight, board);
      if (landing) return { landing, position };
      this.passedFloor = floor;
    }
    return { landing: null, position };
  }

  private landingOn(floor: number, floorHeight: number, board: TileBoard): FallLanding | null {
    const limit = LastTileRules.BOARD_LIMIT;
    const arrivalSeconds = Math.sqrt(2 * (this.startY - floorHeight) / LastTileRules.GRAVITY);
    const x = MathUtil.clamp(this.startX + this.vx * arrivalSeconds, -limit, limit);
    const z = MathUtil.clamp(this.startZ + this.vz * arrivalSeconds, -limit, limit);
    const arrivalTime = this.startedAt + arrivalSeconds * 1000;
    if (!board.isSolid(floor, LastTileGeometry.tileIndexAt(x, z), arrivalTime)) return null;
    return { floor, x, z, vx: this.vx, vz: this.vz };
  }
}
