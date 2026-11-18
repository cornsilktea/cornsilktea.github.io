"use strict";
class TowerPropShapes {
    static of(look) { return TowerPropShapes.SHAPES[look]; }
    static part(id) { return id.includes("."); }
}
TowerPropShapes.SHAPES = {
    hex: { model: "hexIsle", turn: 0, top: 0, base: -1, cx: 0, cz: 0, span: 2, across: 2, round: true },
    crate: { model: "crate", turn: 0, top: 0.21, base: 0, cx: 0, cz: 0, span: 0.22, across: 0.22, round: false },
    barrel: { model: "barrelProp", turn: 0, top: 0.21, base: 0, cx: 0, cz: 0, span: 0.2, across: 0.2, round: true },
    wall: { model: "rampart", turn: 0, top: 0.9, base: 0, cx: 0, cz: -0.1, span: 2, across: 0.6, round: false },
    turret: { model: "turret", turn: 0, top: 1.4, base: 0, cx: 0, cz: 0.025, span: 0.84, across: 0.84, round: true },
    houseA: { model: "houseA", turn: Math.PI / 2, top: 0.93, base: 0, cx: 0, cz: -0.04, span: 0.86, across: 0.26, round: false },
    houseB: { model: "houseB", turn: 0, top: 1.2, base: 0, cx: 0, cz: -0.07, span: 0.88, across: 0.26, round: false },
    column: { model: "pillar", turn: 0, top: 4, base: 0, cx: 0, cz: 0, span: 1.5, across: 1.5, round: true },
    box: { model: "boxLarge", turn: 0, top: 1.5, base: 0, cx: 0, cz: 0, span: 1.5, across: 1.5, round: false },
    keg: { model: "barrel", turn: 0, top: 2, base: 0, cx: 0, cz: 0, span: 1.8, across: 1.8, round: true },
    tile: { model: "tile", turn: 0, top: 0.05, base: -0.1, cx: 0, cz: 0, span: 4, across: 4, round: false },
    dwall: { model: "dungeonWall", turn: 0, top: 4, base: 0, cx: 0, cz: 0, span: 4, across: 1, round: false },
    ktable: { model: "kitchenTable", turn: 0, top: 1, base: 0, cx: 0, cz: 0, span: 2, across: 2, round: false },
    rtable: { model: "roundTable", turn: 0, top: 1, base: 0, cx: 0, cz: 0, span: 3, across: 3, round: true },
    counter: { model: "counter", turn: 0, top: 1, base: 0, cx: 0, cz: 0.021, span: 2, across: 2.04, round: false },
    stove: { model: "stove", turn: 0, top: 1.2, base: 0, cx: 0, cz: 0.114, span: 2, across: 2.29, round: false },
    fridge: { model: "fridge", turn: 0, top: 2.5, base: 0, cx: 0, cz: 0.12, span: 2, across: 2.24, round: false },
    board: { model: "board", turn: 0, top: 0.15, base: 0, cx: 0, cz: 0, span: 1.5, across: 1, round: false },
    plate: { model: "plate", turn: 0, top: 0.1, base: 0, cx: 0, cz: 0, span: 0.95, across: 0.95, round: true },
    tomb: { model: "gravePillar", turn: 0, top: 4.4, base: 0, cx: 0, cz: 0, span: 2, across: 2, round: false, cap: "plaque" },
    coffin: { model: "coffin", turn: 0, top: 1.32, base: 0, cx: 0, cz: 0, span: 2, across: 3, round: false },
    slab: { model: "plaque", turn: 0, top: 0.4, base: 0, cx: 0, cz: 0, span: 2, across: 2, round: false },
    dirt: { model: "dirtPlot", turn: 0, top: 0.03, base: -0.5, cx: 0, cz: 0, span: 4, across: 4, round: false },
    pumpkin: { model: "pumpkin", turn: 0, top: 0.6, base: 0, cx: 0, cz: 0, span: 1, across: 1, round: true },
    wagon: { model: "wagon", turn: Math.PI / 2, top: 0.55, base: 0, cx: 0, cz: 0, span: 0.984, across: 0.432, round: false },
    giftRed: { model: "giftRed", turn: 0, top: 1, base: 0, cx: 0, cz: 0, span: 0.964, across: 0.964, round: false },
    giftGreen: { model: "giftGreen", turn: 0, top: 1, base: 0, cx: 0, cz: 0, span: 0.964, across: 0.964, round: false },
    giftBlue: { model: "giftBlue", turn: 0, top: 1, base: 0, cx: 0, cz: 0, span: 0.964, across: 0.964, round: false },
    giftTallRed: { model: "giftTallRed", turn: 0, top: 1, base: 0, cx: 0, cz: 0, span: 0.522, across: 0.504, round: false },
    giftTallGreen: { model: "giftTallGreen", turn: 0, top: 1, base: 0, cx: 0, cz: 0, span: 0.522, across: 0.504, round: false },
    giftLongGreen: { model: "giftLongGreen", turn: 0, top: 0.44, base: 0, cx: 0, cz: 0, span: 2.164, across: 0.964, round: false },
    giftLongBlue: { model: "giftLongBlue", turn: 0, top: 0.44, base: 0, cx: 0, cz: 0, span: 2.164, across: 0.964, round: false },
};
TowerPropShapes.ROOFS = {
    houseA: { eaveHalf: 0.4, eaveY: 0.37, wallHalf: 0.3, wallTop: 0.28 },
    houseB: { eaveHalf: 0.46, eaveY: 0.8, wallHalf: 0.36, wallTop: 0.6 },
};
TowerPropShapes.HIDDEN = "hidden";
class ClimbTrail {
    constructor(deg, rho, half, sense = 1) {
        this.deg = deg;
        this.rho = rho;
        this.half = half;
        this.sense = sense;
    }
    next(rho, half, gap) {
        const reach = this.half + gap + half, cos = (this.rho * this.rho + rho * rho - reach * reach) / (2 * this.rho * rho);
        this.deg += this.sense * Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
        this.rho = rho;
        this.half = half;
        return this.deg;
    }
    alongX(deg, rho, along, out = 0) { return ClimbLayoutPen.ringX(deg, rho + out) + along * Math.cos(ClimbLayoutPen.rad(deg)); }
    alongZ(deg, rho, along, out = 0) { return ClimbLayoutPen.ringZ(deg, rho + out) - along * Math.sin(ClimbLayoutPen.rad(deg)); }
}
class ClimbLayoutPen {
    constructor(stage) {
        this.stage = stage;
        this.pieces = [];
    }
    static halfOf(look, scale) {
        const shape = TowerPropShapes.of(look);
        return shape ? shape.span * scale / 2 : 0;
    }
    prop(id, kind, look, x, z, top, scale, yawDeg, extras = {}) {
        const shape = TowerPropShapes.SHAPES[look], depth = (shape.top - shape.base) * scale;
        if (shape.round)
            this.roundAt(id, kind, x, z, top, shape.span * scale / 2, yawDeg, { depth, look, ...extras });
        else
            this.boxAt(id, kind, x, z, top, shape.span * scale, shape.across * scale, yawDeg, { depth, look, ...extras });
    }
    house(id, look, x, z, ground, scale, yawDeg) {
        const shape = TowerPropShapes.SHAPES[look], roof = TowerPropShapes.ROOFS[look], hidden = TowerPropShapes.HIDDEN;
        const ridge = ground + shape.top * scale, eave = ground + roof.eaveY * scale, length = shape.span * scale;
        this.prop(id, "narrow", look, x, z, ridge, scale, yawDeg);
        this.boxAt(id + ".body", "static", x, z, ground + roof.wallTop * scale, length, roof.wallHalf * 2 * scale, yawDeg, { depth: roof.wallTop * scale, noLedge: true, look: hidden });
        const inner = shape.across * scale / 2, width = roof.eaveHalf * scale - inner, offset = inner + width / 2, yaw = ClimbLayoutPen.rad(yawDeg);
        for (const side of [1, -1]) {
            const cx = x + side * offset * Math.sin(yaw), cz = z + side * offset * Math.cos(yaw);
            this.boxAt(id + (side > 0 ? ".roofOut" : ".roofIn"), "slope", cx, cz, (ridge + eave) / 2, width, length, yawDeg - 90, { depth: 0.3, rise: -side * (ridge - eave), look: hidden });
        }
    }
    static rad(deg) { return deg * Math.PI / 180; }
    static ringX(angleDeg, rho) { return rho * Math.sin(ClimbLayoutPen.rad(angleDeg)); }
    static ringZ(angleDeg, rho) { return rho * Math.cos(ClimbLayoutPen.rad(angleDeg)); }
    round(id, kind, angleDeg, rho, y, radius, extras = {}) {
        this.pieces.push({ id, kind, stage: this.stage, x: ClimbLayoutPen.ringX(angleDeg, rho), y, z: ClimbLayoutPen.ringZ(angleDeg, rho), radius, yaw: ClimbLayoutPen.rad(angleDeg), ...extras });
    }
    box(id, kind, angleDeg, rho, y, sx, sz, yawDeg, extras = {}) {
        this.pieces.push({ id, kind, stage: this.stage, x: ClimbLayoutPen.ringX(angleDeg, rho), y, z: ClimbLayoutPen.ringZ(angleDeg, rho), sx, sz, yaw: ClimbLayoutPen.rad(yawDeg), ...extras });
    }
    boxAt(id, kind, x, z, y, sx, sz, yawDeg, extras = {}) {
        this.pieces.push({ id, kind, stage: this.stage, x, y, z, sx, sz, yaw: ClimbLayoutPen.rad(yawDeg), ...extras });
    }
    roundAt(id, kind, x, z, y, radius, yawDeg, extras = {}) {
        this.pieces.push({ id, kind, stage: this.stage, x, y, z, radius, yaw: ClimbLayoutPen.rad(yawDeg), ...extras });
    }
}
class TowerHubLayout {
    static pieces() {
        const pen = new ClimbLayoutPen(0);
        pen.round("hub", "hub", 0, 0, 0, TowerHubLayout.RADIUS, { depth: 3, look: "island" });
        return pen.pieces;
    }
    static portals() {
        const H = TowerHubLayout, list = [];
        for (let stage = 2; stage <= ClimbBalance.STAGE_COUNT; stage++) {
            const angle = H.PORTAL_FIRST_DEG + (stage - 2) * H.PORTAL_STEP_DEG;
            list.push({ kind: "stage", stage, x: ClimbLayoutPen.ringX(angle, H.PORTAL_RHO), y: 0, z: ClimbLayoutPen.ringZ(angle, H.PORTAL_RHO), yaw: ClimbLayoutPen.rad(angle + 180) });
        }
        const speed = H.SPEEDRUN_DEG;
        list.push({ kind: "speedrun", stage: 0, x: ClimbLayoutPen.ringX(speed, H.PORTAL_RHO), y: 0, z: ClimbLayoutPen.ringZ(speed, H.PORTAL_RHO), yaw: ClimbLayoutPen.rad(speed + 180) });
        return list;
    }
    static spawn() { return { x: 0, y: 0, z: TowerHubLayout.SPAWN_RHO, yaw: Math.PI }; }
}
TowerHubLayout.RADIUS = 22;
TowerHubLayout.SPAWN_RHO = 10;
TowerHubLayout.PORTAL_RHO = 15;
TowerHubLayout.PORTAL_FIRST_DEG = -50;
TowerHubLayout.PORTAL_STEP_DEG = 20;
TowerHubLayout.SPEEDRUN_DEG = 180;
class TowerStageOneLayout {
    static pieces() {
        const S = TowerStageOneLayout, pen = new ClimbLayoutPen(1);
        pen.round("trunk", "static", 0, 0, S.TOP_Y - 0.5, S.TRUNK_RADIUS, { depth: S.TOP_Y - 0.5, noLedge: true, look: "trunk" });
        pen.box("t1", "static", 20, S.RING, 1, 2.4, 2.4, 20, { depth: 1, look: "rock" });
        pen.box("t2", "static", 50, S.RING, 2, 2.3, 2.3, 50, { depth: 2, look: "stump" });
        pen.box("t3", "static", 80, S.RING, 3, 2.4, 2.4, 80, { depth: 0.8, look: "rock" });
        pen.box("t4", "narrow", 112, S.RING, 3.6, 4.6, 0.9, 112, { depth: 0.8, look: "log" });
        pen.box("t5", "static", 148, S.RING, 4.2, 3.6, 3.6, 148, { depth: 0.8, look: "deck" });
        pen.box("t6", "static", 176, S.RING, 6.6, 3, 3, 176, { depth: 3, look: "block" });
        pen.box("t7", "static", 202, S.RING, 7.6, 2.4, 2.4, 202, { depth: 0.8, look: "rock" });
        pen.box("t8", "static", 228, S.RING, 8.4, 3.4, 3.4, 228, { depth: 0.8, look: "deck" });
        pen.box("pad", "pad", 252, S.RING, 8.4, 2, 2, 252, { depth: 0.6, look: "pad" });
        pen.box("mid", "static", S.EASY_START_DEG, S.RING, S.MID_Y, 5, 5, S.EASY_START_DEG, { depth: 0.8, look: "deck" });
        let below = S.MID_Y;
        S.CLIMB_PATH.forEach(([angle, top], i) => {
            const wall = top - below > S.CLIMB_WALL;
            pen.box("c" + (i + 1), "static", angle, S.EASY_RING, top, S.CLIMB_SIDE, S.CLIMB_SIDE, angle, { depth: wall ? top - below : 0.8, look: wall ? "block" : "rock" });
            below = top;
        });
        pen.box("join", "static", S.JOIN_DEG, S.JOIN_RING, S.JOIN_Y, 3.6, 3.6, S.JOIN_DEG, { depth: S.JOIN_Y - below, look: "deck" });
        pen.box("n0", "static", S.EASY_START_DEG, 3.9, S.MID_Y + 0.15, 2.4, 1.6, S.EASY_START_DEG, { depth: 0.8, noLedge: true, look: "root" });
        S.HOLD_YS.forEach((y, i) => pen.round("h" + (i + 1), "hold", S.EASY_START_DEG, S.TRUNK_RADIUS, y, 0.25, { depth: 0.3, look: "hold" }));
        pen.box("n1", "static", S.EASY_START_DEG, 4.8, S.HOLD_YS[S.HOLD_YS.length - 1] + 1.1, 2.4, 1.8, S.EASY_START_DEG, { depth: 0.5, look: "deck" });
        pen.round("rest2", "rest", 0, 0, S.TOP_Y, 4.2, { depth: 0.5, startOf: 2, look: "rest" });
        return pen.pieces;
    }
    static routes() {
        const S = TowerStageOneLayout;
        const opening = ["hub", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "pad", "mid"];
        const ending = ["join", "rest2"];
        const easy = S.CLIMB_PATH.map((_, i) => "c" + (i + 1));
        const holds = S.HOLD_YS.map((_, i) => "h" + (i + 1));
        return [
            { stage: 1, name: "easy", label: "쉬운 길", ratioLimit: 0.6, steps: [...opening, ...easy, ...ending] },
            { stage: 1, name: "normal", label: "잡기 오르막", ratioLimit: 0.6, steps: [...opening, "n0", ...holds, "n1", ...easy.slice(S.NORMAL_JOIN - 1), ...ending] },
        ];
    }
}
TowerStageOneLayout.RING = 6.5;
TowerStageOneLayout.EASY_RING = 7;
TowerStageOneLayout.EASY_START_DEG = 282;
TowerStageOneLayout.CLIMB_PATH = [
    [313, 14.2], [358, 14.2], [403, 14.6], [434, 16.8], [479, 16.8], [524, 16.4], [555, 18.7], [600, 18.7], [642, 18.7], [673, 21.3], [718, 21.3], [749, 23.9], [794, 23.9],
];
TowerStageOneLayout.CLIMB_SIDE = 3.4;
TowerStageOneLayout.CLIMB_WALL = 1.5;
TowerStageOneLayout.JOIN_DEG = 825;
TowerStageOneLayout.JOIN_RING = 6.3;
TowerStageOneLayout.JOIN_Y = 26.5;
TowerStageOneLayout.NORMAL_JOIN = 9;
TowerStageOneLayout.MID_Y = 12;
TowerStageOneLayout.HOLD_YS = [14.3, 15.3, 16.3, 17.3];
TowerStageOneLayout.TOP_Y = 30;
TowerStageOneLayout.TRUNK_RADIUS = 3;
class ClimbRingBuilder {
    constructor(pen, restRadius) {
        this.pen = pen;
        this.restRadius = restRadius;
        this.trail = new ClimbTrail(0, 0, 0);
    }
    follow(deg, rho, half, sense = 1) { this.trail = new ClimbTrail(deg, rho, half, sense); }
    spokeRho(look, scale) { return this.restRadius - 0.1 + ClimbLayoutPen.halfOf(look, scale); }
    spoke(id, look, deg, top, scale) {
        const rho = this.spokeRho(look, scale);
        this.pen.prop(id, "static", look, ClimbLayoutPen.ringX(deg, rho), ClimbLayoutPen.ringZ(deg, rho), top, scale, deg - 90);
        return rho + ClimbLayoutPen.halfOf(look, scale);
    }
    ring(id, look, rho, top, scale, gap, kind = "static", extras = {}) {
        const deg = this.trail.next(rho, ClimbLayoutPen.halfOf(look, scale), gap);
        this.pen.prop(id, kind, look, ClimbLayoutPen.ringX(deg, rho), ClimbLayoutPen.ringZ(deg, rho), top, scale, deg, extras);
        return deg;
    }
    hop(id, look, deg, top, scale, gap) {
        const own = ClimbLayoutPen.halfOf(look, scale), rho = this.trail.rho + this.trail.half + gap + own;
        this.pen.prop(id, "static", look, ClimbLayoutPen.ringX(deg, rho), ClimbLayoutPen.ringZ(deg, rho), top, scale, deg);
        this.trail = new ClimbTrail(deg, rho, own, this.trail.sense);
        return rho;
    }
    along(id, look, deg, rho, top, scale, along, out = 0) {
        this.pen.prop(id, "static", look, this.trail.alongX(deg, rho, along, out), this.trail.alongZ(deg, rho, along, out), top, scale, deg);
    }
    pad(id, deg, rho, ground, size, along, out = 0) {
        this.pen.boxAt(id, "pad", this.trail.alongX(deg, rho, along, out), this.trail.alongZ(deg, rho, along, out), ground + 0.3, size, size, deg, { depth: 0.6, look: "pad" });
    }
    house(id, look, rho, ridge, scale, gap, isleScale) {
        const ground = ridge - TowerPropShapes.SHAPES[look].top * scale, deg = this.trail.next(rho, ClimbLayoutPen.halfOf(look, scale), gap);
        const x = ClimbLayoutPen.ringX(deg, rho), z = ClimbLayoutPen.ringZ(deg, rho);
        this.pen.prop(id + ".isle", "static", "hex", x, z, ground, isleScale, deg);
        this.pen.house(id, look, x, z, ground, scale, deg);
        return deg;
    }
    bridge(id, look, deg, outerRho, top, scale) {
        const shape = TowerPropShapes.SHAPES[look], middle = (outerRho + this.restRadius) / 2;
        this.pen.boxAt(id, "static", ClimbLayoutPen.ringX(deg, middle), ClimbLayoutPen.ringZ(deg, middle), top, outerRho - this.restRadius + 0.2, shape.across * scale, deg - 90, { depth: (shape.top - shape.base) * scale, look });
    }
    longJump(spec) {
        const along = ClimbLayoutPen.halfOf(spec.launchLook, spec.launchScale) - spec.padSize / 2, sense = this.trail.sense;
        const deg = this.ring(spec.launch, spec.launchLook, spec.rho, spec.top, spec.launchScale, spec.approach);
        this.pad(spec.pad, deg, spec.rho, spec.top, spec.padSize, sense * along);
        this.follow(deg + sense * Math.atan2(along, spec.rho) * 180 / Math.PI, spec.rho, spec.padSize / 2, sense);
        this.ring(spec.goal, spec.goalLook, spec.rho, spec.top + 0.3 + spec.rise, spec.goalScale, spec.gap);
    }
    arrive(id, look, rho, top, scale, gap, bridgeId, bridgeLook, bridgeScale) {
        const deg = this.ring(id, look, rho, top, scale, gap);
        this.bridge(bridgeId, bridgeLook, deg, rho - ClimbLayoutPen.halfOf(look, scale), top, bridgeScale);
    }
}
class TowerStageTwoLayout {
    static pieces() {
        const S = TowerStageTwoLayout, pen = new ClimbLayoutPen(2), go = new ClimbRingBuilder(pen, S.REST_RADIUS);
        const isleOf = (scale) => S.HEX * 0.75 * scale / S.HOUSE_A;
        go.spoke("vw1", "wall", 0, S.FLOOR, S.WALL);
        go.follow(0, S.LOOP_RHO, ClimbLayoutPen.halfOf("hex", S.HEX));
        pen.prop("vi1", "static", "hex", 0, S.LOOP_RHO, 31, S.HEX, 0);
        go.ring("vt1", "turret", 14.5, 34.6, S.TURRET, 1);
        go.ring("vc1", "crate", 15.5, 34.2, S.CRATE, 3.4);
        go.ring("vb1", "barrel", 16, 35.2, S.BARREL, 2.8);
        const isle2 = go.ring("vi2", "hex", 16, 36, 2.8, 2.9);
        go.along("vk1", "barrel", isle2, 16, 36 + 0.21 * 6, 6, -1.25, 1.5);
        go.along("vk2", "crate", isle2, 16, 36 + 0.21 * 7.5, 7.5, -1.25);
        pen.house("vhA", "houseA", go.trail.alongX(isle2, 16, 0.9), go.trail.alongZ(isle2, 16, 0.9), 36, S.HOUSE_A, isle2);
        go.ring("vw2", "wall", 16, 39.4, S.WALL, 2.5);
        go.ring("vt2", "turret", 16, 43, S.TURRET, 1);
        go.ring("vc2", "crate", 15, 42.6, S.CRATE, 3.5);
        const isle3 = go.ring("vi3", "hex", 14.5, 43.6, S.HEX, 2.9);
        go.pad("vp1", isle3, 14.5, 43.6, S.PAD, 0.9);
        go.ring("vt3", "turret", 14.5, 47.2, S.TURRET, 1.2);
        go.ring("vw3", "wall", 15, 46.8, S.WALL, 3.4);
        go.ring("vb2", "barrel", 15.5, 47.8, S.BARREL, 2.8);
        go.ring("vt4", "turret", 15.5, 51.4, S.TURRET, 1);
        go.ring("vc3", "crate", 15, 51, S.CRATE, 3.5);
        const isle4 = go.ring("vi4", "hex", 14.5, 52, 2.6, 2.8);
        go.pad("vp2", isle4, 14.5, 52, S.PAD, 1);
        go.ring("vt5", "turret", 14.5, 55.6, S.TURRET, 1.2);
        go.house("vhB", "houseB", 14.5, 56.96, S.HOUSE_B, 2.5, isleOf(S.HOUSE_B));
        go.arrive("vt6", "turret", 11.5, S.TOP_Y, S.TURRET, 1, "vw4", "wall", S.WALL);
        const roofStart = go.spoke("nw1", "wall", S.ROOF_SPOKE, S.FLOOR, S.WALL);
        go.follow(S.ROOF_SPOKE, roofStart, 0);
        go.hop("ni1", "hex", S.ROOF_SPOKE, 31, S.HEX, 2.6);
        go.pad("np1", S.ROOF_SPOKE, go.trail.rho, 31, S.PAD, 0, 1.2);
        go.follow(S.ROOF_SPOKE, go.trail.rho + 1.2, S.PAD / 2);
        go.hop("nt1", "turret", S.ROOF_SPOKE, 34.6, S.TURRET, 1.8);
        go.house("nhA", "houseA", S.ROOF_RHO, 35.4, S.HOUSE_A, 2.6, isleOf(S.HOUSE_A));
        go.house("nhB", "houseB", S.ROOF_RHO, 36.5, S.HOUSE_B, 3, isleOf(S.HOUSE_B));
        go.ring("nc1", "crate", S.ROOF_RHO, 37.6, S.CRATE, 3);
        go.ring("nt2", "turret", S.ROOF_RHO, 41.2, S.TURRET, 1);
        go.house("nhC", "houseA", S.ROOF_RHO, 42, S.HOUSE_A, 2.8, isleOf(S.HOUSE_A));
        go.ring("nw2", "wall", S.ROOF_RHO, 42.8, S.WALL, 3.1);
        go.ring("nt3", "turret", 19, 46.4, S.TURRET, 1);
        pen.round("rest3", "rest", 0, 0, S.TOP_Y, S.REST_RADIUS, { depth: 0.5, startOf: 3, look: "rest" });
        return pen.pieces;
    }
    static routes() {
        const easy = ["rest2", "vw1", "vi1", "vt1", "vc1", "vb1", "vi2", "vk1", "vk2", "vhA", "vw2", "vt2", "vc2", "vi3", "vp1", "vt3", "vw3", "vb2", "vt4", "vc3", "vi4", "vp2", "vt5", "vhB", "vt6", "vw4", "rest3"];
        const tail = easy.slice(easy.indexOf("vb2"));
        return [
            { stage: 2, name: "easy2", label: "쉬운 길", ratioLimit: 0.75, steps: easy },
            { stage: 2, name: "normal2", label: "지붕 길", ratioLimit: 0.8, steps: ["rest2", "nw1", "ni1", "np1", "nt1", "nhA", "nhB", "nc1", "nt2", "nhC", "nw2", "nt3", ...tail] },
        ];
    }
}
TowerStageTwoLayout.FLOOR = 30;
TowerStageTwoLayout.TOP_Y = 60;
TowerStageTwoLayout.REST_RADIUS = 4.2;
TowerStageTwoLayout.LOOP_RHO = 14;
TowerStageTwoLayout.HEX = 2.4;
TowerStageTwoLayout.TURRET = 3.6;
TowerStageTwoLayout.CRATE = 7.7;
TowerStageTwoLayout.BARREL = 8;
TowerStageTwoLayout.WALL = 2.6;
TowerStageTwoLayout.HOUSE_A = 3;
TowerStageTwoLayout.HOUSE_B = 2.8;
TowerStageTwoLayout.PAD = 1.8;
TowerStageTwoLayout.ROOF_SPOKE = 140;
TowerStageTwoLayout.ROOF_RHO = 20;
class TowerStageThreeLayout {
    static pieces() {
        const S = TowerStageThreeLayout, pen = new ClimbLayoutPen(3), go = new ClimbRingBuilder(pen, S.REST_RADIUS);
        go.follow(S.EASY_SPOKE, go.spoke("dw1", "dwall", S.EASY_SPOKE, S.FLOOR, S.SPOKE), 0);
        go.hop("dt1", "tile", S.EASY_SPOKE, S.FLOOR, S.TILE, 3.9);
        const R = S.EASY_RHO;
        go.ring("dp1", "column", R, 63.8, S.PILLAR, 1.4);
        go.ring("db1", "box", R, 63.4, S.BOX, 4.3);
        go.ring("dk1", "keg", R, 64.2, S.KEG, 3.5);
        const tile2 = go.ring("dt2", "tile", R + 0.5, 64.2, S.TILE, 4.1);
        go.pad("dj1", tile2, R + 0.5, 64.2, S.PAD, 0.6);
        go.ring("dt3", "tile", R + 0.5, 67.5, S.TILE, 1.8);
        go.ring("dp2", "column", R, 71.3, S.PILLAR, 1.4);
        go.ring("db2", "box", R, 70.9, S.BOX, 4.3);
        go.ring("dt7", "tile", R + 0.5, 71.7, S.TILE, 3.8);
        go.ring("dp3", "column", R, 75.5, S.PILLAR, 1.4);
        go.ring("dk2", "keg", R, 75.1, S.KEG, 4.25);
        const tile4 = go.ring("dt4", "tile", R + 0.5, 75.6, S.TILE, 3.6);
        go.pad("dj2", tile4, R + 0.5, 75.6, S.PAD, 0.6);
        go.ring("dt5", "tile", R + 0.5, 78.9, S.TILE, 1.8);
        go.ring("dp4", "column", R, 82.7, S.PILLAR, 1.4);
        go.ring("db3", "box", R, 82.3, S.BOX, 4.3);
        go.ring("dk3", "keg", R, 83.1, S.KEG, 3.5);
        go.ring("dp5", "column", R, 86.9, S.PILLAR, 1.4);
        go.ring("dt6", "tile", R - 1.5, 86.5, S.TILE, 4);
        go.arrive("dp6", "column", S.ARRIVE_RHO, S.TOP_Y, S.PILLAR, 1.4, "dw3", "dwall", S.WALL);
        go.follow(S.WALL_SPOKE, go.spoke("lw1", "dwall", S.WALL_SPOKE, S.FLOOR, S.SPOKE), 0, -1);
        go.hop("lt1", "tile", S.WALL_SPOKE, S.FLOOR, S.TILE, 4.1);
        const W = S.WALL_RHO;
        go.ring("lp1", "column", W - 2.5, 63.8, S.PILLAR, 1.5);
        go.ring("lp2", "column", W, 67.6, S.PILLAR, 1.5);
        go.ring("lt2", "tile", W, 67.2, S.TILE, 4.5);
        go.ring("lb2", "box", W, 68, S.BOX, 3.6);
        go.ring("lp3", "column", W, 71.8, S.PILLAR, 1.5);
        go.ring("lp4", "column", W, 75.6, S.PILLAR, 1.5);
        go.ring("lt3", "tile", W, 75.2, S.TILE, 4.5);
        go.ring("lb1", "box", W, 76, S.BOX, 3.6);
        go.ring("lp5", "column", W, 79.8, S.PILLAR, 1.5);
        go.ring("lp6", "column", W, 83.6, S.PILLAR, 1.5);
        go.follow(go.ring("lt4", "tile", W, 83.2, S.TILE, 4.5), W, ClimbLayoutPen.halfOf("tile", S.TILE));
        go.ring("lp7", "column", W - 3.5, 87, S.PILLAR, 1.5);
        pen.round("rest4", "rest", 0, 0, S.TOP_Y, S.REST_RADIUS, { depth: 0.5, startOf: 4, look: "rest" });
        return pen.pieces;
    }
    static routes() {
        return [
            { stage: 3, name: "easy3", label: "쉬운 길", ratioLimit: 0.85, steps: ["rest3", "dw1", "dt1", "dp1", "db1", "dk1", "dt2", "dj1", "dt3", "dp2", "db2", "dt7", "dp3", "dk2", "dt4", "dj2", "dt5", "dp4", "db3", "dk3", "dp5", "dt6", "dp6", "dw3", "rest4"] },
            { stage: 3, name: "normal3", label: "기둥 길", ratioLimit: 0.9, steps: ["rest3", "lw1", "lt1", "lp1", "lp2", "lt2", "lb2", "lp3", "lp4", "lt3", "lb1", "lp5", "lp6", "lt4", "lp7", "dt6", "dp6", "dw3", "rest4"] },
        ];
    }
}
TowerStageThreeLayout.FLOOR = 60;
TowerStageThreeLayout.TOP_Y = 90;
TowerStageThreeLayout.REST_RADIUS = 4.2;
TowerStageThreeLayout.SPOKE = 1.5;
TowerStageThreeLayout.PILLAR = 1.68;
TowerStageThreeLayout.BOX = 1.2;
TowerStageThreeLayout.KEG = 1;
TowerStageThreeLayout.TILE = 0.75;
TowerStageThreeLayout.WALL = 1.5;
TowerStageThreeLayout.PAD = 1.8;
TowerStageThreeLayout.ARRIVE_RHO = 11.5;
TowerStageThreeLayout.EASY_SPOKE = 40;
TowerStageThreeLayout.EASY_RHO = 15.5;
TowerStageThreeLayout.WALL_SPOKE = 170;
TowerStageThreeLayout.WALL_RHO = 22;
class TowerStageFourLayout {
    static pieces() {
        const S = TowerStageFourLayout, pen = new ClimbLayoutPen(4), go = new ClimbRingBuilder(pen, S.REST_RADIUS);
        go.follow(S.EASY_SPOKE, go.spoke("ks1", "counter", S.EASY_SPOKE, S.FLOOR, S.SPOKE), 0);
        go.hop("kr1", "rtable", S.EASY_SPOKE, S.FLOOR, S.RTABLE, 3.9);
        const R = S.EASY_RHO;
        go.ring("kf1", "fridge", R, 93.8, S.FRIDGE, 1.4);
        go.ring("kt1", "ktable", R, 93.4, S.KTABLE, 4.3);
        go.ring("kv1", "stove", R, 94.2, S.STOVE, 3.5);
        const board1 = go.ring("kb1", "board", R + 0.5, 94.2, S.BOARD, 4.1);
        go.pad("kj1", board1, R + 0.5, 94.2, S.PAD, 0.6);
        go.ring("kb2", "board", R + 0.5, 97.5, S.BOARD, 1.8);
        go.ring("kf2", "fridge", R, 101.3, S.FRIDGE, 1.4);
        go.ring("kt2", "ktable", R, 100.9, S.KTABLE, 4.3);
        go.ring("kb3", "board", R + 0.5, 101.7, S.BOARD, 3.8);
        go.ring("kf3", "fridge", R, 105.5, S.FRIDGE, 1.4);
        go.ring("kp1", "plate", R, 105.1, S.PLATE, 4.25);
        const board4 = go.ring("kb4", "board", R + 0.5, 105.6, S.BOARD, 3.6);
        go.pad("kj2", board4, R + 0.5, 105.6, S.PAD, 0.6);
        go.ring("kb5", "board", R + 0.5, 108.9, S.BOARD, 1.8);
        go.ring("kf4", "fridge", R, 112.7, S.FRIDGE, 1.4);
        go.ring("kt3", "ktable", R, 112.3, S.KTABLE, 4.3);
        go.ring("kv2", "stove", R, 113.1, S.STOVE, 3.5);
        const lastFridge = go.ring("kf5", "fridge", R, 116.9, S.FRIDGE, 1.4);
        go.longJump({ launch: "kb6", pad: "kj3", goal: "kc1", launchLook: "board", launchScale: S.BOARD, goalLook: "counter", goalScale: S.COUNTER, rho: R - 1.5, top: S.LAUNCH_TOP, approach: 4, padSize: S.PAD, gap: S.LONG_GAP, rise: S.LONG_RISE });
        go.arrive("kf6", "fridge", S.ARRIVE_RHO, S.TOP_Y, S.FRIDGE, 1.4, "kw1", "counter", S.SPOKE);
        go.follow(S.SHELF_SPOKE, go.spoke("gs1", "counter", S.SHELF_SPOKE, S.FLOOR, S.SPOKE), 0, -1);
        go.hop("gr1", "rtable", S.SHELF_SPOKE, S.FLOOR, S.RTABLE, 4.1);
        const W = S.SHELF_RHO;
        go.ring("gf1", "fridge", W - 3, 93.8, S.FRIDGE, 1.5);
        go.ring("gf2", "fridge", W, 97.6, S.FRIDGE, 1.5);
        go.ring("gb1", "board", W, 97.2, S.BOARD, 4.5);
        go.ring("gt1", "ktable", W, 98, S.KTABLE, 3.6);
        go.ring("gf3", "fridge", W, 101.8, S.FRIDGE, 1.5);
        go.ring("gf4", "fridge", W, 105.6, S.FRIDGE, 1.5);
        go.ring("gb2", "board", W, 105.2, S.BOARD, 4.5);
        go.ring("gt2", "ktable", W, 106, S.KTABLE, 3.6);
        go.ring("gf5", "fridge", W, 109.8, S.FRIDGE, 1.5);
        go.ring("gf6", "fridge", W, 113.6, S.FRIDGE, 1.5);
        const joinRho = R + TowerPropShapes.SHAPES.fridge.across * S.FRIDGE / 2 + S.JOIN_GAP + TowerPropShapes.SHAPES.board.across * S.BOARD / 2;
        pen.prop("gb3", "static", "board", ClimbLayoutPen.ringX(lastFridge, joinRho), ClimbLayoutPen.ringZ(lastFridge, joinRho), 113.2, S.BOARD, lastFridge);
        pen.round("rest5", "rest", 0, 0, S.TOP_Y, S.REST_RADIUS, { depth: 0.5, startOf: 5, look: "rest" });
        return pen.pieces;
    }
    static routes() {
        const tail = ["kb6", "kj3", "kc1", "kf6", "kw1", "rest5"];
        return [
            { stage: 4, name: "easy4", label: "쉬운 길", ratioLimit: 0.85, steps: ["rest4", "ks1", "kr1", "kf1", "kt1", "kv1", "kb1", "kj1", "kb2", "kf2", "kt2", "kb3", "kf3", "kp1", "kb4", "kj2", "kb5", "kf4", "kt3", "kv2", "kf5", ...tail] },
            { stage: 4, name: "normal4", label: "냉장고 길", ratioLimit: 0.9, steps: ["rest4", "gs1", "gr1", "gf1", "gf2", "gb1", "gt1", "gf3", "gf4", "gb2", "gt2", "gf5", "gf6", "gb3", "kf5", ...tail] },
        ];
    }
}
TowerStageFourLayout.FLOOR = 90;
TowerStageFourLayout.TOP_Y = 120;
TowerStageFourLayout.REST_RADIUS = 4.2;
TowerStageFourLayout.SPOKE = 2;
TowerStageFourLayout.KTABLE = 1.6;
TowerStageFourLayout.RTABLE = 1.2;
TowerStageFourLayout.COUNTER = 1.6;
TowerStageFourLayout.STOVE = 1.5;
TowerStageFourLayout.FRIDGE = 1.6;
TowerStageFourLayout.BOARD = 2.2;
TowerStageFourLayout.PLATE = 3.2;
TowerStageFourLayout.PAD = 1.8;
TowerStageFourLayout.ARRIVE_RHO = 11.5;
TowerStageFourLayout.EASY_SPOKE = 120;
TowerStageFourLayout.EASY_RHO = 15.5;
TowerStageFourLayout.SHELF_SPOKE = 277;
TowerStageFourLayout.SHELF_RHO = 22;
TowerStageFourLayout.JOIN_GAP = 1.2;
TowerStageFourLayout.LAUNCH_TOP = 115.5;
TowerStageFourLayout.LONG_GAP = 4.2;
TowerStageFourLayout.LONG_RISE = 2;
class TowerStageFiveLayout {
    static pieces() {
        const S = TowerStageFiveLayout, pen = new ClimbLayoutPen(5), go = new ClimbRingBuilder(pen, S.REST_RADIUS);
        go.follow(S.EASY_SPOKE, go.spoke("ms1", "slab", S.EASY_SPOKE, S.FLOOR, S.SPOKE), 0);
        go.hop("mu1", "pumpkin", S.EASY_SPOKE, S.FLOOR, S.HOP_PUMPKIN, 3.9);
        const R = S.EASY_RHO;
        go.ring("mh1", "tomb", R, 123.8, S.TOMB, 1.4);
        go.ring("mc1", "coffin", R, 123.4, S.COFFIN, 4.3);
        go.ring("mq1", "slab", R, 124.2, S.SLAB, 3.5);
        const dirt1 = go.ring("md1", "dirt", R + 0.5, 124.2, S.DIRT, 4.1);
        go.pad("mj1", dirt1, R + 0.5, 124.2, S.PAD, 0.6);
        go.ring("md2", "dirt", R + 0.5, 127.5, S.DIRT, 1.8);
        go.ring("mh2", "tomb", R, 131.3, S.TOMB, 1.4);
        go.ring("mc2", "coffin", R, 130.9, S.COFFIN, 4.3);
        go.ring("md3", "dirt", R + 0.5, 131.7, S.DIRT, 3.8);
        go.ring("mh3", "tomb", R, 135.5, S.TOMB, 1.4);
        go.ring("mu2", "pumpkin", R, 135.1, S.PUMPKIN, 4.25);
        const dirt4 = go.ring("md4", "dirt", R + 0.5, 135.6, S.DIRT, 3.6);
        go.pad("mj2", dirt4, R + 0.5, 135.6, S.PAD, 0.6);
        go.ring("md5", "dirt", R + 0.5, 138.9, S.DIRT, 1.8);
        go.ring("mh4", "tomb", R, 142.7, S.TOMB, 1.4);
        go.ring("mc3", "coffin", R, 142.3, S.COFFIN, 4.3);
        go.ring("mq2", "slab", R, 143.1, S.SLAB, 3.5);
        const lastShrine = go.ring("mh5", "tomb", R, 146.9, S.TOMB, 1.4);
        go.longJump({ launch: "md6", pad: "mj3", goal: "mq3", launchLook: "dirt", launchScale: S.DIRT, goalLook: "slab", goalScale: S.SPOKE, rho: R - 1.5, top: S.LAUNCH_TOP, approach: 4, padSize: S.PAD, gap: S.LONG_GAP, rise: S.LONG_RISE });
        go.arrive("mh6", "tomb", S.ARRIVE_RHO, S.TOP_Y, S.TOMB, 1.4, "mw1", "slab", S.SPOKE);
        go.follow(S.CRYPT_SPOKE, go.spoke("ys1", "slab", S.CRYPT_SPOKE, S.FLOOR, S.SPOKE), 0, -1);
        go.hop("yu1", "pumpkin", S.CRYPT_SPOKE, S.FLOOR, S.HOP_PUMPKIN, 4.1);
        const W = S.CRYPT_RHO;
        go.ring("yh1", "tomb", S.FIRST_TOMB_RHO, 123.8, S.TOMB, 1.5);
        go.ring("yh2", "tomb", S.FIRST_TOMB_RHO + 3.2, 127.6, S.TOMB, 1.5);
        go.ring("yd1", "dirt", W, 127.2, S.DIRT, 4.5);
        go.ring("yc1", "coffin", W, 128, S.COFFIN, 3.6);
        go.ring("yh3", "tomb", W, 131.8, S.TOMB, 1.5);
        go.ring("yh4", "tomb", W, 135.6, S.TOMB, 1.5);
        go.ring("yd2", "dirt", W, 135.2, S.DIRT, 4.5);
        go.ring("yc2", "coffin", W, 136, S.COFFIN, 3.6);
        go.ring("yh5", "tomb", W, 139.8, S.TOMB, 1.5);
        go.ring("yh6", "tomb", W, 143.6, S.TOMB, 1.5);
        const joinRho = R + TowerPropShapes.SHAPES.tomb.across * S.TOMB / 2 + S.JOIN_GAP + TowerPropShapes.SHAPES.dirt.across * S.DIRT / 2;
        pen.prop("yd3", "static", "dirt", ClimbLayoutPen.ringX(lastShrine, joinRho), ClimbLayoutPen.ringZ(lastShrine, joinRho), 143.2, S.DIRT, lastShrine);
        pen.round("rest6", "rest", 0, 0, S.TOP_Y, S.REST_RADIUS, { depth: 0.5, startOf: 6, look: "rest" });
        return pen.pieces;
    }
    static routes() {
        const tail = ["md6", "mj3", "mq3", "mh6", "mw1", "rest6"];
        return [
            { stage: 5, name: "easy5", label: "쉬운 길", ratioLimit: 0.85, steps: ["rest5", "ms1", "mu1", "mh1", "mc1", "mq1", "md1", "mj1", "md2", "mh2", "mc2", "md3", "mh3", "mu2", "md4", "mj2", "md5", "mh4", "mc3", "mq2", "mh5", ...tail] },
            { stage: 5, name: "normal5", label: "비석 길", ratioLimit: 0.9, steps: ["rest5", "ys1", "yu1", "yh1", "yh2", "yd1", "yc1", "yh3", "yh4", "yd2", "yc2", "yh5", "yh6", "yd3", "mh5", ...tail] },
        ];
    }
}
TowerStageFiveLayout.FLOOR = 120;
TowerStageFiveLayout.TOP_Y = 150;
TowerStageFiveLayout.REST_RADIUS = 4.2;
TowerStageFiveLayout.SPOKE = 2;
TowerStageFiveLayout.TOMB = 0.935;
TowerStageFiveLayout.COFFIN = 1.4;
TowerStageFiveLayout.SLAB = 1.5;
TowerStageFiveLayout.DIRT = 0.75;
TowerStageFiveLayout.PUMPKIN = 2.6;
TowerStageFiveLayout.HOP_PUMPKIN = 3;
TowerStageFiveLayout.PAD = 1.8;
TowerStageFiveLayout.ARRIVE_RHO = 11.5;
TowerStageFiveLayout.EASY_SPOKE = 290;
TowerStageFiveLayout.EASY_RHO = 15.5;
TowerStageFiveLayout.CRYPT_SPOKE = 8;
TowerStageFiveLayout.CRYPT_RHO = 24;
TowerStageFiveLayout.FIRST_TOMB_RHO = 17.5;
TowerStageFiveLayout.JOIN_GAP = 1.2;
TowerStageFiveLayout.LAUNCH_TOP = 145.5;
TowerStageFiveLayout.LONG_GAP = 4.4;
TowerStageFiveLayout.LONG_RISE = 2;
class TowerStageSixLayout {
    static get stationTop() { return TowerStageSixLayout.OUTER_TOP + TowerStageSixLayout.STATION_RISE; }
    static get gain() {
        const S = TowerStageSixLayout;
        return (S.TOP_Y - S.stationTop - 0.3 - S.LONG_RISE) / S.LIFT_COUNT;
    }
    static pieces() {
        const S = TowerStageSixLayout, pen = new ClimbLayoutPen(6), go = new ClimbRingBuilder(pen, S.REST_RADIUS), P = ClimbLayoutPen;
        const firstEnd = go.spoke("xs1", "giftLongGreen", S.SPOKE_DEG, S.FLOOR, S.SPOKE), stepRho = firstEnd + P.halfOf("giftLongBlue", S.SPOKE);
        pen.prop("xs2", "static", "giftLongBlue", P.ringX(S.SPOKE_DEG, stepRho), P.ringZ(S.SPOKE_DEG, stepRho), S.STEP_TOP, S.SPOKE, S.SPOKE_DEG - 90);
        S.train(pen, "xa", "trainIn", S.INNER_RHO, S.INNER_TOP, S.TRAIN_SPEED, S.INNER_START_DEG);
        S.train(pen, "xb", "trainOut", S.OUTER_RHO, S.OUTER_TOP, -S.TRAIN_SPEED, S.OUTER_START_DEG);
        const wagonHalf = TowerPropShapes.SHAPES.wagon.across * S.WAGON / 2, stationHalf = P.halfOf("giftRed", S.REST_BOX);
        const stationRho = S.OUTER_RHO + wagonHalf + S.STATION_GAP + stationHalf;
        let floor = S.stationTop;
        pen.prop("xt1", "static", "giftRed", P.ringX(S.STATION_DEG, stationRho), P.ringZ(S.STATION_DEG, stationRho), floor, S.REST_BOX, S.STATION_DEG);
        go.follow(S.STATION_DEG, stationRho, stationHalf);
        const lift = (id, look, rho, upper, index, gap = S.LIFT_GAP) => {
            const low = floor + S.LIFT_UNDER, move = { track: "lift", group: id, low, high: upper + S.LIFT_OVER, period: S.LIFT_PERIOD, phase: S.LIFT_PHASES[index] };
            go.ring(id, look, rho, low, S.LIFT, gap, "moving", { move });
            floor = upper;
        };
        lift("xe1", "giftTallGreen", 24.8, floor + S.gain, 0);
        go.ring("xp2", "giftGreen", 24.4, floor, S.BOX, S.LIFT_GAP);
        lift("xe2", "giftTallRed", 24, floor + S.gain, 1);
        go.ring("xp3", "giftBlue", 23.6, floor, S.REST_BOX, S.LIFT_GAP);
        lift("xe3", "giftTallGreen", 23.2, floor + S.gain, 2);
        const launchRho = 22.8, launchHalf = P.halfOf("giftLongGreen", S.LAUNCH), launchDeg = go.trail.next(launchRho, launchHalf, S.LIFT_GAP);
        const lineYaw = launchDeg + S.LINE_TURN, dirDeg = lineYaw + 90, dirX = Math.sin(P.rad(dirDeg)), dirZ = Math.cos(P.rad(dirDeg));
        const launchX = P.ringX(launchDeg, launchRho), launchZ = P.ringZ(launchDeg, launchRho);
        pen.prop("xl1", "static", "giftLongGreen", launchX, launchZ, floor, S.LAUNCH, lineYaw);
        const padAt = launchHalf + S.SHUTTLE_GAP + S.PAD / 2, padTop = floor + 0.3;
        pen.boxAt("xj1", "movingPad", launchX + dirX * padAt, launchZ + dirZ * padAt, padTop, S.PAD, S.PAD, lineYaw, {
            depth: 0.6, look: "pad", move: { track: "shuttle", group: "xj1", dirDeg, stroke: S.SHUTTLE_STROKE, speed: S.SHUTTLE_SPEED, phase: 0 },
        });
        const goalHalf = P.halfOf("giftLongBlue", S.GOAL), goalAt = S.GOAL_AT + goalHalf, goalX = launchX + dirX * goalAt, goalZ = launchZ + dirZ * goalAt;
        floor = padTop + S.LONG_RISE;
        pen.prop("xg1", "static", "giftLongBlue", goalX, goalZ, floor, S.GOAL, lineYaw);
        go.follow(Math.atan2(goalX, goalZ) * 180 / Math.PI, Math.hypot(goalX, goalZ), goalHalf);
        lift("xe4", "giftTallRed", 17, floor + S.gain, 3, S.INWARD_GAP);
        go.ring("xp5", "giftGreen", 15.2, floor, S.BOX, S.INWARD_GAP);
        lift("xe5", "giftTallGreen", 13.6, S.TOP_Y, 4, S.INWARD_GAP);
        go.arrive("xq1", "giftRed", S.ARRIVE_RHO, S.TOP_Y, S.REST_BOX, S.INWARD_GAP, "xw1", "giftLongGreen", S.SPOKE);
        pen.round("rest7", "rest", 0, 0, S.TOP_Y, S.REST_RADIUS, { depth: 0.5, startOf: 7, look: "rest" });
        return pen.pieces;
    }
    static train(pen, prefix, group, rho, top, speed, startDeg) {
        const S = TowerStageSixLayout;
        for (let k = 0; k < S.WAGONS; k++) {
            const move = { track: "orbit", group, rho, speed, startDeg: startDeg + k * 360 / S.WAGONS };
            pen.prop(prefix + (k + 1), "moving", "wagon", 0, rho, top, S.WAGON, 0, { move });
        }
    }
    static routes() {
        return [
            { stage: 6, name: "hard6", label: "기차·승강기 길", ratioLimit: 0.9, steps: ["rest6", "xs1", "xs2", "xa1", "xb1", "xt1", "xe1", "xp2", "xe2", "xp3", "xe3", "xl1", "xj1", "xg1", "xe4", "xp5", "xe5", "xq1", "xw1", "rest7"] },
        ];
    }
}
TowerStageSixLayout.FLOOR = 150;
TowerStageSixLayout.TOP_Y = 180;
TowerStageSixLayout.REST_RADIUS = 4.2;
TowerStageSixLayout.SPOKE_DEG = 100;
TowerStageSixLayout.SPOKE = 2.6;
TowerStageSixLayout.STEP_TOP = 150.8;
TowerStageSixLayout.WAGON = 3.6;
TowerStageSixLayout.WAGONS = 6;
TowerStageSixLayout.TRAIN_SPEED = 3.5;
TowerStageSixLayout.INNER_RHO = 17;
TowerStageSixLayout.INNER_TOP = 152;
TowerStageSixLayout.INNER_START_DEG = 130;
TowerStageSixLayout.OUTER_RHO = 20.6;
TowerStageSixLayout.OUTER_TOP = 153;
TowerStageSixLayout.OUTER_START_DEG = 160;
TowerStageSixLayout.STATION_DEG = 10;
TowerStageSixLayout.STATION_GAP = 2;
TowerStageSixLayout.STATION_RISE = 1.2;
TowerStageSixLayout.REST_BOX = 3.2;
TowerStageSixLayout.BOX = 2.6;
TowerStageSixLayout.LIFT = 3.8;
TowerStageSixLayout.LIFT_GAP = 1;
TowerStageSixLayout.INWARD_GAP = 1.4;
TowerStageSixLayout.LIFT_PERIOD = 5;
TowerStageSixLayout.LIFT_UNDER = 2.2;
TowerStageSixLayout.LIFT_OVER = 1;
TowerStageSixLayout.LIFT_PHASES = [0, 1.3, 2.6, 3.9, 0.7];
TowerStageSixLayout.LIFT_COUNT = 5;
TowerStageSixLayout.LAUNCH = 2.6;
TowerStageSixLayout.LINE_TURN = 40;
TowerStageSixLayout.PAD = 1.8;
TowerStageSixLayout.SHUTTLE_GAP = 0.9;
TowerStageSixLayout.SHUTTLE_STROKE = 3;
TowerStageSixLayout.SHUTTLE_SPEED = 3.5;
TowerStageSixLayout.GOAL_AT = 13.5;
TowerStageSixLayout.GOAL = 3.2;
TowerStageSixLayout.LONG_RISE = 2;
TowerStageSixLayout.ARRIVE_RHO = 12;
class ClimbBoxTrail {
    constructor(pen, deg, rho, half, sense = 1) {
        this.pen = pen;
        this.trail = new ClimbTrail(deg, rho, half, sense);
    }
    get deg() { return this.trail.deg; }
    get rho() { return this.trail.rho; }
    next(id, kind, look, rho, top, along, across, gap, extras = {}) {
        const deg = this.trail.next(rho, along / 2, gap);
        this.pen.box(id, kind, deg, rho, top, along, across, deg, { look, ...extras });
        return deg;
    }
    radial(id, kind, look, deg, inner, outer, top, across, extras = {}) {
        this.pen.box(id, kind, deg, (inner + outer) / 2, top, outer - inner, across, deg - 90, { look, ...extras });
    }
}
class TowerStageSevenLayout {
    static get launchTop() { return TowerStageSevenLayout.TOP_Y - 0.3 - TowerStageSevenLayout.LONG_RISE; }
    static pieces() {
        const S = TowerStageSevenLayout, pen = new ClimbLayoutPen(7);
        const spokeOuter = S.REST_RADIUS - 0.1 + S.SPOKE_LENGTH, go = new ClimbBoxTrail(pen, S.SPOKE_DEG, spokeOuter, 0);
        go.radial("zs1", "static", "deck7", S.SPOKE_DEG, S.REST_RADIUS - 0.1, spokeOuter, S.FLOOR, S.SPOKE_WIDTH, { depth: S.DEPTH });
        let top = S.FLOOR + 0.6;
        go.next("zd1", "static", "deck7", S.ENTRY_RHO, top, S.REST, S.REST, 2.4, { depth: S.DEPTH, look: "deck7" });
        for (let k = 1; k <= S.ICE_COUNT; k++) {
            top += S.ICE_STEP;
            go.next("zi" + k, "ice", "ice7", S.ICE_RHO, top, S.ICE_ALONG, S.ICE_ACROSS, S.ICE_GAP, { depth: S.DEPTH, look: "ice7" });
        }
        top += 0.6;
        go.next("zr1", "static", "deck7", S.CRUMBLE_RHO, top, S.REST, S.REST, 2.8, { depth: S.DEPTH, look: "deck7" });
        for (let k = 1; k <= S.CRUMBLE_COUNT; k++) {
            top += S.CRUMBLE_STEP;
            go.next("zc" + k, "crumble", "crumble7", S.CRUMBLE_RHO, top, S.CRUMBLE, S.CRUMBLE, S.CRUMBLE_GAP, { depth: S.DEPTH, look: "crumble7" });
        }
        top += S.MAST_RISE;
        go.next("zc4", "crumble", "crumble7", S.CRUMBLE_RHO, top, S.MAST, S.MAST, S.MAST_GAP, { depth: S.MAST_DEPTH, look: "crumble7" });
        top += S.SWEEP_DECK_RISE;
        const deckDeg = go.next("zr2", "static", "deck7", S.CRUMBLE_RHO, top, S.SWEEP_DECK_ALONG, S.REST, S.SWEEP_GAP, { depth: S.DEPTH, look: "deck7" });
        pen.box("zx1", "sweeper", deckDeg, S.CRUMBLE_RHO, top + S.SWEEP_HIGH, S.SWEEP_ARM * 2, S.SWEEP_WIDTH, deckDeg, { depth: S.SWEEP_HIGH - S.SWEEP_LOW, look: "sweeper7", spin: { rate: S.SWEEP_RATE, phase: 0 } });
        const windFrom = top;
        let windFirst = 0, windLast = 0;
        for (let k = 1; k <= S.WIND_COUNT; k++) {
            top += S.WIND_STEP;
            const deg = go.next("zw" + k, "static", "deck7", S.WIND_RHO, top, S.WIND_PANEL, S.WIND_PANEL, S.WIND_GAP, { depth: S.DEPTH, look: "deck7" });
            if (k === 1)
                windFirst = deg;
            windLast = deg;
        }
        const windMid = (windFirst + windLast) / 2, windSpan = (windLast - windFirst) * Math.PI / 180 * S.WIND_RHO + S.WIND_PANEL + S.WIND_GAP * 2;
        pen.box("zv1", "wind", windMid, S.WIND_RHO, top + 3, windSpan, 9, windMid, {
            depth: top + 3 - windFrom + 1, look: "wind7", gust: { dirDeg: windMid, speed: S.WIND_SPEED, period: S.WIND_PERIOD, share: S.WIND_SHARE, phase: 0 },
        });
        top = S.launchTop - S.LAND_STEP;
        const mastDeg = go.next("zt1", "static", "mast7", S.WIND_RHO, top, S.MAST, S.MAST, S.MAST_GAP, { depth: S.MAST_DEPTH, look: "mast7" });
        const launchTop = S.launchTop, mastInner = S.WIND_RHO - S.MAST / 2, launchOuter = mastInner - 0.2;
        const launchDeg = mastDeg + Math.atan2(S.MAST / 2 + 0.4 + S.LAUNCH_WIDTH / 2, S.WIND_RHO) * 180 / Math.PI;
        go.radial("zl1", "static", "deck7", launchDeg, launchOuter - S.REST, launchOuter, launchTop, S.LAUNCH_WIDTH, { depth: S.DEPTH });
        go.radial("zl2", "ice", "ice7", launchDeg, S.LAUNCH_INNER, launchOuter - S.REST, launchTop, S.LAUNCH_WIDTH, { depth: S.DEPTH });
        const landRho = launchOuter - S.REST / 2, side = S.LAUNCH_WIDTH / 2 + S.LAND_HUB_OUT, along = ClimbLayoutPen.rad(launchDeg);
        const hubX = ClimbLayoutPen.ringX(launchDeg, landRho) + Math.cos(along) * side, hubZ = ClimbLayoutPen.ringZ(launchDeg, landRho) - Math.sin(along) * side;
        pen.boxAt("zx2", "sweeper", hubX, hubZ, launchTop + S.SWEEP_HIGH, S.LAND_ARM * 2, S.SWEEP_WIDTH, launchDeg, { depth: S.SWEEP_HIGH - S.SWEEP_LOW, look: "sweeper7", spin: { rate: S.LAND_RATE, phase: 1 } });
        const padRho = S.LAUNCH_INNER + S.PAD / 2;
        pen.box("zj1", "pad", launchDeg, padRho, launchTop + 0.3, S.PAD, S.PAD, launchDeg, { depth: 0.6, look: "pad" });
        const windRho = (S.SUMMIT_RADIUS + S.LAUNCH_INNER) / 2;
        pen.box("zv2", "wind", launchDeg, windRho, S.TOP_Y + 3, S.LAUNCH_INNER - S.SUMMIT_RADIUS + 2, 8, launchDeg - 90, {
            depth: 5, look: "wind7", gust: { dirDeg: launchDeg + 90, speed: S.LONG_WIND_SPEED, period: S.LONG_WIND_PERIOD, share: S.WIND_SHARE, phase: 1.2 },
        });
        pen.round("summit", "summit", 0, 0, S.TOP_Y, S.SUMMIT_RADIUS, { depth: S.SUMMIT_DEPTH, look: "summit" });
        return pen.pieces;
    }
    static routes() {
        const S = TowerStageSevenLayout, ice = Array.from({ length: S.ICE_COUNT }, (_, k) => "zi" + (k + 1)), crumble = Array.from({ length: S.CRUMBLE_COUNT + 1 }, (_, k) => "zc" + (k + 1));
        const wind = Array.from({ length: S.WIND_COUNT }, (_, k) => "zw" + (k + 1));
        return [
            { stage: 7, name: "hard7", label: "화성 기지 길", ratioLimit: 0.9, steps: ["rest7", "zs1", "zd1", ...ice, "zr1", ...crumble, "zr2", ...wind, "zt1", "zl1", "zl2", "zj1", "summit"] },
        ];
    }
}
TowerStageSevenLayout.FLOOR = 180;
TowerStageSevenLayout.TOP_Y = 200;
TowerStageSevenLayout.REST_RADIUS = 4.2;
TowerStageSevenLayout.SPOKE_DEG = 300;
TowerStageSevenLayout.SPOKE_LENGTH = 5;
TowerStageSevenLayout.SPOKE_WIDTH = 2.4;
TowerStageSevenLayout.DEPTH = 0.6;
TowerStageSevenLayout.REST = 3.2;
TowerStageSevenLayout.ENTRY_RHO = 13.5;
TowerStageSevenLayout.ICE_RHO = 15;
TowerStageSevenLayout.ICE_ALONG = 3;
TowerStageSevenLayout.ICE_ACROSS = 2.2;
TowerStageSevenLayout.ICE_GAP = 3.8;
TowerStageSevenLayout.ICE_STEP = 0.8;
TowerStageSevenLayout.ICE_COUNT = 4;
TowerStageSevenLayout.CRUMBLE_RHO = 15;
TowerStageSevenLayout.CRUMBLE = 2.4;
TowerStageSevenLayout.CRUMBLE_GAP = 3.7;
TowerStageSevenLayout.CRUMBLE_STEP = 1;
TowerStageSevenLayout.CRUMBLE_COUNT = 3;
TowerStageSevenLayout.MAST = 2;
TowerStageSevenLayout.MAST_DEPTH = 4;
TowerStageSevenLayout.MAST_RISE = 3.8;
TowerStageSevenLayout.MAST_GAP = 1.4;
TowerStageSevenLayout.SWEEP_DECK_ALONG = 8;
TowerStageSevenLayout.SWEEP_DECK_RISE = 0.4;
TowerStageSevenLayout.SWEEP_GAP = 2.4;
TowerStageSevenLayout.SWEEP_ARM = 3.4;
TowerStageSevenLayout.SWEEP_WIDTH = 0.5;
TowerStageSevenLayout.SWEEP_LOW = 0.5;
TowerStageSevenLayout.SWEEP_HIGH = 1.05;
TowerStageSevenLayout.SWEEP_RATE = 1.9;
TowerStageSevenLayout.LAND_ARM = 3.8;
TowerStageSevenLayout.LAND_HUB_OUT = 1;
TowerStageSevenLayout.LAND_STEP = 0.6;
TowerStageSevenLayout.LAND_RATE = -2;
TowerStageSevenLayout.WIND_RHO = 16;
TowerStageSevenLayout.WIND_PANEL = 2.4;
TowerStageSevenLayout.WIND_GAP = 4;
TowerStageSevenLayout.WIND_STEP = 0.8;
TowerStageSevenLayout.WIND_COUNT = 3;
TowerStageSevenLayout.WIND_SPEED = 3.2;
TowerStageSevenLayout.WIND_PERIOD = 3.6;
TowerStageSevenLayout.WIND_SHARE = 0.5;
TowerStageSevenLayout.LAUNCH_INNER = 9;
TowerStageSevenLayout.LAUNCH_WIDTH = 3.2;
TowerStageSevenLayout.PAD = 1.8;
TowerStageSevenLayout.SUMMIT_RADIUS = 5;
TowerStageSevenLayout.SUMMIT_DEPTH = 1.2;
TowerStageSevenLayout.LONG_RISE = 1.6;
TowerStageSevenLayout.LONG_WIND_SPEED = 2.4;
TowerStageSevenLayout.LONG_WIND_PERIOD = 3;
class TowerLevelData {
    static spec() {
        return {
            stages: TowerLevelData.STAGES.map((s) => ({ ...s })),
            pieces: [...TowerHubLayout.pieces(), ...TowerStageOneLayout.pieces(), ...TowerStageTwoLayout.pieces(), ...TowerStageThreeLayout.pieces(), ...TowerStageFourLayout.pieces(), ...TowerStageFiveLayout.pieces(), ...TowerStageSixLayout.pieces(), ...TowerStageSevenLayout.pieces()],
            portals: TowerHubLayout.portals(),
            routes: [...TowerStageOneLayout.routes(), ...TowerStageTwoLayout.routes(), ...TowerStageThreeLayout.routes(), ...TowerStageFourLayout.routes(), ...TowerStageFiveLayout.routes(), ...TowerStageSixLayout.routes(), ...TowerStageSevenLayout.routes()],
            spawn: TowerHubLayout.spawn(),
        };
    }
}
TowerLevelData.STAGES = [
    { index: 0, name: "시작 지점", floor: -100, ceiling: 0 },
    { index: 1, name: "뿌리 숲", floor: 0, ceiling: 30 },
    { index: 2, name: "폐허 마을", floor: 30, ceiling: 60 },
    { index: 3, name: "지하 던전", floor: 60, ceiling: 90 },
    { index: 4, name: "거인의 주방", floor: 90, ceiling: 120 },
    { index: 5, name: "묘지", floor: 120, ceiling: 150 },
    { index: 6, name: "눈 덮인 장난감 마을", floor: 150, ceiling: 180 },
    { index: 7, name: "화성 기지", floor: 180, ceiling: 200 },
];
