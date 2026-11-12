interface BbFieldDimensions {
  readonly wallHeight: number;
  readonly warningTrackWidth: number;
  readonly backstopDistance: number;
  readonly foulTerritoryWidth: number;
  fenceDistance(sprayDegrees: number): number;
}

class BbFieldSpace {
  static toWorld(fieldX: number, fieldZ: number, height = 0): BbVec { return new BbVec(fieldX, height, -fieldZ); }

  static polar(distance: number, sprayDegrees: number, height = 0): BbVec {
    const radians = sprayDegrees * Math.PI / 180;
    return BbFieldSpace.toWorld(distance * Math.sin(radians), distance * Math.cos(radians), height);
  }
}

class BbFieldGeometry {
  static readonly BASE_GAP = 27.43;
  static readonly BASE_OFFSET = 19.4;
  static readonly BASE_SIZE = 0.38;
  static readonly PLATE_WIDTH = 0.43;
  static readonly RUBBER_DISTANCE = 18.44;
  static readonly MOUND_RADIUS = 2.74;
  static readonly MOUND_HEIGHT = 0.25;
  static readonly INFIELD_DIRT_RADIUS = 28.9;
  static readonly HOME_DIRT_RADIUS = 3.96;
  static readonly BATTER_BOX_OFFSET = 0.95;
  static readonly FOUL_LINE_DEGREES = 45;

  static readonly HOME = BbFieldSpace.toWorld(0, 0);
  static readonly FIRST = BbFieldSpace.toWorld(BbFieldGeometry.BASE_OFFSET, BbFieldGeometry.BASE_OFFSET);
  static readonly SECOND = BbFieldSpace.toWorld(0, BbFieldGeometry.BASE_OFFSET * 2);
  static readonly THIRD = BbFieldSpace.toWorld(-BbFieldGeometry.BASE_OFFSET, BbFieldGeometry.BASE_OFFSET);
  static readonly RUBBER = BbFieldSpace.toWorld(0, BbFieldGeometry.RUBBER_DISTANCE, BbFieldGeometry.MOUND_HEIGHT);
}

class BbMainBallpark implements BbFieldDimensions {
  static readonly CENTER_DISTANCE = 120;
  static readonly POLE_DISTANCE = 100;
  readonly wallHeight = 3;
  readonly warningTrackWidth = 4.5;
  readonly backstopDistance = 17;
  readonly foulTerritoryWidth = 18;

  fenceDistance(sprayDegrees: number): number {
    const spread = Math.min(Math.abs(sprayDegrees), BbFieldGeometry.FOUL_LINE_DEGREES) / BbFieldGeometry.FOUL_LINE_DEGREES;
    return BbMainBallpark.CENTER_DISTANCE - (BbMainBallpark.CENTER_DISTANCE - BbMainBallpark.POLE_DISTANCE) * spread;
  }
}

interface BbBallparkSpec {
  readonly id: string;
  readonly name: string;
  readonly dimensions: BbFieldDimensions;
}

class BbBallparkRegistry {
  static readonly MAIN: BbBallparkSpec = { id: "main", name: "동마 구장", dimensions: new BbMainBallpark() };
  static readonly ALL: readonly BbBallparkSpec[] = [BbBallparkRegistry.MAIN];

  static find(id: string): BbBallparkSpec {
    return BbBallparkRegistry.ALL.find((park) => park.id === id) || BbBallparkRegistry.MAIN;
  }
}

class BbStrikeZoneBox {
  static readonly CENTER_HEIGHT = 0.62;
  static readonly HALF_HEIGHT = 0.24;
  static readonly HALF_WIDTH = 0.25;
  static readonly CONTACT_FIELD_Z = 0.3;

  static pointAt(u: number, v: number): BbVec {
    return BbFieldSpace.toWorld(-u * BbStrikeZoneBox.HALF_WIDTH, BbStrikeZoneBox.CONTACT_FIELD_Z, BbStrikeZoneBox.CENTER_HEIGHT + v * BbStrikeZoneBox.HALF_HEIGHT);
  }
}

class BbActorPlacement {
  constructor(readonly position: BbVec, readonly yaw: number) {}

  static facing(position: BbVec, toward: BbVec): BbActorPlacement {
    return new BbActorPlacement(position, BbActorPlacement.yawToward(position, toward));
  }

  static yawToward(from: BbVec, toward: BbVec): number { return Math.atan2(toward.x - from.x, toward.z - from.z); }

  toWorld(local: BbVec): BbVec { return this.position.plus(BbTurn.fromAngles(this.yaw, 0, 0).apply(local)); }
  toLocal(world: BbVec): BbVec { return BbTurn.fromAngles(-this.yaw, 0, 0).apply(world.minus(this.position)); }
  standingBack(distance: number): BbActorPlacement { return new BbActorPlacement(this.toWorld(new BbVec(0, 0, -distance)), this.yaw); }
}
