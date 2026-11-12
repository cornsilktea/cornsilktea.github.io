"use strict";
class BbFieldSpace {
    static toWorld(fieldX, fieldZ, height = 0) { return new BbVec(fieldX, height, -fieldZ); }
    static polar(distance, sprayDegrees, height = 0) {
        const radians = sprayDegrees * Math.PI / 180;
        return BbFieldSpace.toWorld(distance * Math.sin(radians), distance * Math.cos(radians), height);
    }
}
class BbFieldGeometry {
}
BbFieldGeometry.BASE_GAP = 27.43;
BbFieldGeometry.BASE_OFFSET = 19.4;
BbFieldGeometry.BASE_SIZE = 0.38;
BbFieldGeometry.PLATE_WIDTH = 0.43;
BbFieldGeometry.RUBBER_DISTANCE = 18.44;
BbFieldGeometry.MOUND_RADIUS = 2.74;
BbFieldGeometry.MOUND_HEIGHT = 0.25;
BbFieldGeometry.INFIELD_DIRT_RADIUS = 28.9;
BbFieldGeometry.HOME_DIRT_RADIUS = 3.96;
BbFieldGeometry.BATTER_BOX_OFFSET = 0.95;
BbFieldGeometry.FOUL_LINE_DEGREES = 45;
BbFieldGeometry.HOME = BbFieldSpace.toWorld(0, 0);
BbFieldGeometry.FIRST = BbFieldSpace.toWorld(BbFieldGeometry.BASE_OFFSET, BbFieldGeometry.BASE_OFFSET);
BbFieldGeometry.SECOND = BbFieldSpace.toWorld(0, BbFieldGeometry.BASE_OFFSET * 2);
BbFieldGeometry.THIRD = BbFieldSpace.toWorld(-BbFieldGeometry.BASE_OFFSET, BbFieldGeometry.BASE_OFFSET);
BbFieldGeometry.RUBBER = BbFieldSpace.toWorld(0, BbFieldGeometry.RUBBER_DISTANCE, BbFieldGeometry.MOUND_HEIGHT);
class BbMainBallpark {
    constructor() {
        this.wallHeight = 3;
        this.warningTrackWidth = 4.5;
        this.backstopDistance = 17;
        this.foulTerritoryWidth = 18;
    }
    fenceDistance(sprayDegrees) {
        const spread = Math.min(Math.abs(sprayDegrees), BbFieldGeometry.FOUL_LINE_DEGREES) / BbFieldGeometry.FOUL_LINE_DEGREES;
        return BbMainBallpark.CENTER_DISTANCE - (BbMainBallpark.CENTER_DISTANCE - BbMainBallpark.POLE_DISTANCE) * spread;
    }
}
BbMainBallpark.CENTER_DISTANCE = 120;
BbMainBallpark.POLE_DISTANCE = 100;
class BbParkBounds {
    constructor(dimensions) {
        this.dimensions = dimensions;
    }
    beyond(point) {
        const x = point.x, z = -point.z, reach = Math.hypot(x, z), degrees = Math.atan2(x, z) * 180 / Math.PI, foul = BbFieldGeometry.FOUL_LINE_DEGREES;
        if (Math.abs(degrees) <= foul)
            return reach - this.dimensions.fenceDistance(degrees);
        const along = (Math.abs(x) + z) * Math.SQRT1_2, out = (Math.abs(x) - z) * Math.SQRT1_2, width = this.dimensions.foulTerritoryWidth, pole = this.dimensions.fenceDistance(foul);
        if (along <= 0)
            return reach - width;
        const taperFrom = pole * BbParkBounds.SIDE_TAPER_FROM;
        return out - (along <= taperFrom ? width : width * Math.max(0, pole - along) / (pole - taperFrom));
    }
    wallHeight(point) {
        return Math.abs(Math.atan2(point.x, -point.z)) * 180 / Math.PI <= BbFieldGeometry.FOUL_LINE_DEGREES ? this.dimensions.wallHeight : BbParkBounds.SIDE_WALL_HEIGHT;
    }
    blocks(point) {
        const beyond = this.beyond(point);
        return beyond > 0 && point.y < this.wallHeight(point) + beyond * BbParkBounds.STAND_SLOPE;
    }
    inTheSeats(point) { return this.beyond(point) > 0 && point.y > this.wallHeight(point) - 0.1; }
}
BbParkBounds.SIDE_WALL_HEIGHT = 1.3;
BbParkBounds.SIDE_TAPER_FROM = 0.62;
BbParkBounds.STAND_SLOPE = 0.567;
class BbBallparkRegistry {
    static find(id) {
        return BbBallparkRegistry.ALL.find((park) => park.id === id) || BbBallparkRegistry.MAIN;
    }
}
BbBallparkRegistry.MAIN = { id: "main", name: "동마 구장", dimensions: new BbMainBallpark() };
BbBallparkRegistry.ALL = [BbBallparkRegistry.MAIN];
class BbStrikeZoneBox {
    static pointAt(u, v) {
        return BbFieldSpace.toWorld(-u * BbStrikeZoneBox.HALF_WIDTH, BbStrikeZoneBox.CONTACT_FIELD_Z, BbStrikeZoneBox.CENTER_HEIGHT + v * BbStrikeZoneBox.HALF_HEIGHT);
    }
}
BbStrikeZoneBox.CENTER_HEIGHT = 0.62;
BbStrikeZoneBox.HALF_HEIGHT = 0.24;
BbStrikeZoneBox.HALF_WIDTH = 0.25;
BbStrikeZoneBox.CONTACT_FIELD_Z = 0.3;
class BbActorPlacement {
    constructor(position, yaw) {
        this.position = position;
        this.yaw = yaw;
    }
    static facing(position, toward) {
        return new BbActorPlacement(position, BbActorPlacement.yawToward(position, toward));
    }
    static yawToward(from, toward) { return Math.atan2(toward.x - from.x, toward.z - from.z); }
    toWorld(local) { return this.position.plus(BbTurn.fromAngles(this.yaw, 0, 0).apply(local)); }
    toLocal(world) { return BbTurn.fromAngles(-this.yaw, 0, 0).apply(world.minus(this.position)); }
    standingBack(distance) { return new BbActorPlacement(this.toWorld(new BbVec(0, 0, -distance)), this.yaw); }
}
