interface SnapshotFields {
  floor: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  fallId: number;
  passedFloor: number;
  sentAt: number;
  dashEndsAt: number;
  pushedAt: number;
  fallStartedAt: number;
}

abstract class RemoteSnapshot {
  constructor(protected readonly fields: SnapshotFields) {}

  abstract applyTo(current: FighterPhase, parts: FighterParts): FighterPhase;
}

class GroundedSnapshot extends RemoteSnapshot {
  get floor(): number { return this.fields.floor; }
  get x(): number { return this.fields.x; }
  get z(): number { return this.fields.z; }
  get vx(): number { return this.fields.vx; }
  get vz(): number { return this.fields.vz; }
  get yaw(): number { return this.fields.yaw; }
  get sentAt(): number { return this.fields.sentAt; }
  get dashEndsAt(): number { return this.fields.dashEndsAt; }
  get pushedAt(): number { return this.fields.pushedAt; }

  static landedFrom(floor: number, x: number, z: number, vx: number, vz: number, yaw: number, t: number): GroundedSnapshot {
    return new GroundedSnapshot({ floor, x, y: LastTileGeometry.floorY(floor), z, vx, vz, yaw, fallId: 0, passedFloor: 0, sentAt: t, dashEndsAt: 0, pushedAt: 0, fallStartedAt: 0 });
  }

  applyTo(current: FighterPhase, parts: FighterParts): FighterPhase {
    return current.receiveGrounded(this, parts);
  }
}

class FallingSnapshot extends RemoteSnapshot {
  get fallId(): number { return this.fields.fallId; }
  get passedFloor(): number { return this.fields.passedFloor; }

  startTrajectory(): FallTrajectory {
    const f = this.fields;
    return new FallTrajectory(f.x, f.y, f.z, f.vx, f.vz, f.fallStartedAt, f.passedFloor);
  }

  faceFrom(parts: FighterParts): void {
    parts.body.faceYaw(this.fields.yaw);
  }

  applyTo(current: FighterPhase, parts: FighterParts): FighterPhase {
    return current.receiveFalling(this, parts);
  }
}

class OutSnapshot extends RemoteSnapshot {
  applyTo(current: FighterPhase, parts: FighterParts): FighterPhase {
    return current.receiveOut(this, parts);
  }
}

interface EncodedState {
  code: string;
  floor: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  fallId: number;
  passedFloor: number;
  sentAt: number;
  dashEndsAt: number;
  pushedAt: number;
  fallStartedAt: number;
}

class FighterStateCodec {
  private static readonly FIELD_COUNT = 14;
  private static readonly BUILDERS: Readonly<Record<string, (fields: SnapshotFields) => RemoteSnapshot>> = {
    G: (fields) => new GroundedSnapshot(fields),
    F: (fields) => new FallingSnapshot(fields),
    O: (fields) => new OutSnapshot(fields)
  };

  static encode(state: EncodedState): string {
    return [
      state.code, state.floor,
      MathUtil.round2(state.x), MathUtil.round2(state.y), MathUtil.round2(state.z), MathUtil.round2(state.vx), MathUtil.round2(state.vz),
      MathUtil.round2(state.yaw), state.fallId, state.passedFloor,
      Math.round(state.sentAt), Math.round(state.dashEndsAt || 0), Math.round(state.pushedAt || 0), Math.round(state.fallStartedAt)
    ].join(",");
  }

  static decode(raw: unknown): RemoteSnapshot | null {
    const parts = String(raw).split(",");
    if (parts.length < FighterStateCodec.FIELD_COUNT) return null;
    const build = FighterStateCodec.BUILDERS[parts[0]];
    if (!build) return null;
    return build({
      floor: +parts[1], x: +parts[2], y: +parts[3], z: +parts[4], vx: +parts[5], vz: +parts[6], yaw: +parts[7],
      fallId: +parts[8], passedFloor: +parts[9], sentAt: +parts[10], dashEndsAt: +parts[11], pushedAt: +parts[12], fallStartedAt: +parts[13]
    });
  }
}
