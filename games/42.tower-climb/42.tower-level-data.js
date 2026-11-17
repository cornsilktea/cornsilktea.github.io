"use strict";
class ClimbLayoutPen {
    constructor(stage) {
        this.stage = stage;
        this.pieces = [];
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
            list.push({ stage, x: ClimbLayoutPen.ringX(angle, H.PORTAL_RHO), y: 0, z: ClimbLayoutPen.ringZ(angle, H.PORTAL_RHO), yaw: ClimbLayoutPen.rad(angle + 180) });
        }
        return list;
    }
    static spawn() { return { x: 0, y: 0, z: TowerHubLayout.SPAWN_RHO, yaw: Math.PI }; }
}
TowerHubLayout.RADIUS = 22;
TowerHubLayout.SPAWN_RHO = 10;
TowerHubLayout.PORTAL_RHO = 15;
TowerHubLayout.PORTAL_FIRST_DEG = -50;
TowerHubLayout.PORTAL_STEP_DEG = 20;
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
        const hardLogDeg = S.EASY_START_DEG;
        pen.box("hard1", "narrow", hardLogDeg, 11.8, S.MID_Y + 0.3, 5.6, 0.7, hardLogDeg - 90, { depth: 0.6, noLedge: true, look: "log" });
        pen.box("hard2", "narrow", S.HARD_DEG, S.HARD_RING, 13.2, 5, 0.7, S.HARD_DEG, { depth: 0.6, look: "log" });
        const along = 2.5 + S.CANNON_GAP + S.CANNON_RADIUS, tangentDeg = S.HARD_DEG;
        const cannonX = ClimbLayoutPen.ringX(S.HARD_DEG, S.HARD_RING) + along * Math.cos(ClimbLayoutPen.rad(tangentDeg));
        const cannonZ = ClimbLayoutPen.ringZ(S.HARD_DEG, S.HARD_RING) - along * Math.sin(ClimbLayoutPen.rad(tangentDeg));
        const cannonRho = Math.hypot(cannonX, cannonZ), cannonDeg = Math.atan2(cannonX, cannonZ) * 180 / Math.PI;
        pen.boxAt("cannon", "cannon", cannonX, cannonZ, 14, S.CANNON_RADIUS * 2, S.CANNON_RADIUS * 2, cannonDeg + 180, { depth: 0.8, look: "cannon" });
        const flightTime = (ClimbBalance.CANNON_UP + Math.sqrt(ClimbBalance.CANNON_UP ** 2 - 2 * ClimbBalance.GRAVITY * 12)) / ClimbBalance.GRAVITY;
        const targetRho = cannonRho - ClimbBalance.CANNON_FORWARD * flightTime;
        pen.box("target", "static", cannonDeg, targetRho, 26, 3, 3, cannonDeg, { depth: 0.6, look: "deck" });
        pen.box("hard3", "static", cannonDeg, S.JOIN_RING - 0.3, S.JOIN_Y, 3, 3, cannonDeg, { depth: 0.6, look: "deck" });
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
            { stage: 1, name: "hard", label: "발사대", ratioLimit: 0.9, steps: [...opening, "hard1", "hard2", "cannon", "target", "hard3", "rest2"] },
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
TowerStageOneLayout.HARD_DEG = 291;
TowerStageOneLayout.HARD_RING = 16;
TowerStageOneLayout.CANNON_GAP = 3.5;
TowerStageOneLayout.CANNON_RADIUS = 1.3;
class TowerStageTwoLayout {
    static pieces() {
        const S = TowerStageTwoLayout, pen = new ClimbLayoutPen(2), B = ClimbBalance;
        pen.round("tower2", "static", 0, 0, S.TOP_Y - 0.5, TowerStageOneLayout.TRUNK_RADIUS, { depth: S.TOP_Y - 0.5 - S.TOWER_BASE, noLedge: true, look: "tower" });
        let below = S.FLOOR;
        S.PATH.forEach(([angle, top], i) => {
            const wall = top - below > S.WALL;
            pen.box("r" + (i + 1), "static", angle, S.RING, top, S.SIDE, S.SIDE, angle, { depth: wall ? top - below : 0.8, look: wall ? "ruin" : "slab" });
            below = top;
        });
        pen.box("join2", "static", S.JOIN_DEG, S.JOIN_RING, S.JOIN_Y, 3.6, 3.6, S.JOIN_DEG, { depth: 1.2, look: "slab" });
        const [, n0Base] = S.PATH[1];
        pen.box("m0", "static", S.HOLD_DEG_LOW, 4.3, n0Base + 0.2, 2.4, 2, S.HOLD_DEG_LOW, { depth: 0.6, noLedge: true, look: "slab" });
        S.HOLDS_LOW.forEach((y, i) => pen.round("g" + (i + 1), "hold", S.HOLD_DEG_LOW, TowerStageOneLayout.TRUNK_RADIUS, y, 0.25, { depth: 0.3, look: "hold" }));
        const lowLast = S.HOLDS_LOW[S.HOLDS_LOW.length - 1];
        pen.box("m1", "static", S.HOLD_DEG_HIGH - 3, 4.3, lowLast + 1.1, 2.4, 2, S.HOLD_DEG_HIGH - 3, { depth: 0.5, look: "slab" });
        S.HOLDS_HIGH.forEach((y, i) => pen.round("g" + (i + 6), "hold", S.HOLD_DEG_HIGH, TowerStageOneLayout.TRUNK_RADIUS, y, 0.25, { depth: 0.3, look: "hold" }));
        const highLast = S.HOLDS_HIGH[S.HOLDS_HIGH.length - 1];
        pen.box("m2", "static", S.HOLD_DEG_HIGH + 22, 4.3, highLast + 1.1, 2.4, 2, S.HOLD_DEG_HIGH + 22, { depth: 0.5, look: "slab" });
        pen.box("x1", "narrow", S.BEAM_DEG, 11.3, S.CANNON_Y - 0.5, 4.6, 0.7, S.BEAM_DEG - 90, { depth: 0.6, noLedge: true, look: "beam" });
        const fromX = ClimbLayoutPen.ringX(S.BEAM_DEG, 13.6), fromZ = ClimbLayoutPen.ringZ(S.BEAM_DEG, 13.6);
        const toX = ClimbLayoutPen.ringX(S.CANNON_DEG, S.CANNON_RHO), toZ = ClimbLayoutPen.ringZ(S.CANNON_DEG, S.CANNON_RHO);
        const span = Math.hypot(toX - fromX, toZ - fromZ), ux = (toX - fromX) / span, uz = (toZ - fromZ) / span;
        const beamStart = S.BEAM_GAP, beamEnd = span - 1.3 - S.CANNON_GAP2, beamMid = (beamStart + beamEnd) / 2;
        pen.boxAt("x2", "narrow", fromX + ux * beamMid, fromZ + uz * beamMid, S.CANNON_Y - 0.3, beamEnd - beamStart, 0.7, Math.atan2(-uz, ux) * 180 / Math.PI, { depth: 0.6, look: "beam" });
        pen.box("cannon2", "cannon", S.CANNON_DEG, S.CANNON_RHO, S.CANNON_Y, 2.6, 2.6, S.CANNON_DEG + 180, { depth: 0.8, look: "cannon" });
        const flightTime = (B.CANNON_UP + Math.sqrt(B.CANNON_UP ** 2 - 2 * B.GRAVITY * 12)) / B.GRAVITY;
        pen.box("target2", "static", S.CANNON_DEG, S.CANNON_RHO - B.CANNON_FORWARD * flightTime, S.CANNON_Y + 12, 3, 3, S.CANNON_DEG, { depth: 0.6, look: "slab" });
        pen.round("rest3", "rest", 0, 0, S.TOP_Y, 4.2, { depth: 0.5, startOf: 3, look: "rest" });
        return pen.pieces;
    }
    static routes() {
        const S = TowerStageTwoLayout;
        const path = S.PATH.map((_, i) => "r" + (i + 1)), ending = ["join2", "rest3"];
        const low = S.HOLDS_LOW.map((_, i) => "g" + (i + 1)), high = S.HOLDS_HIGH.map((_, i) => "g" + (i + 6));
        return [
            { stage: 2, name: "easy2", label: "쉬운 길", ratioLimit: 0.65, steps: ["rest2", ...path, ...ending] },
            { stage: 2, name: "normal2", label: "긴 손잡이 오르막", ratioLimit: 0.65, steps: ["rest2", "r1", "r2", "m0", ...low, "m1", ...high, "m2", ...path.slice(S.NORMAL_JOIN - 1), ...ending] },
            { stage: 2, name: "hard2", label: "발사대", ratioLimit: 0.9, steps: ["rest2", "r1", "r2", "r3", "r4", "r5", "x1", "x2", "cannon2", "target2", ...path.slice(S.HARD_JOIN - 1), ...ending] },
        ];
    }
}
TowerStageTwoLayout.FLOOR = 30;
TowerStageTwoLayout.TOWER_BASE = 34;
TowerStageTwoLayout.TOP_Y = 60;
TowerStageTwoLayout.RING = 7;
TowerStageTwoLayout.SIDE = 3.4;
TowerStageTwoLayout.WALL = 1.5;
TowerStageTwoLayout.PATH = [
    [0, 32.8], [55, 32.8], [100, 36], [155, 36], [200, 39.2], [255, 39.4], [300, 42.4], [355, 42.4],
    [400, 45.6], [455, 45.6], [500, 48.8], [555, 49], [600, 52.2], [655, 52.2], [700, 55.4],
];
TowerStageTwoLayout.JOIN_DEG = 740;
TowerStageTwoLayout.JOIN_RING = 6.3;
TowerStageTwoLayout.JOIN_Y = 56.6;
TowerStageTwoLayout.HOLD_DEG_LOW = 55;
TowerStageTwoLayout.HOLD_DEG_HIGH = 75;
TowerStageTwoLayout.HOLDS_LOW = [35.15, 36.65, 38.15, 39.65, 41.15];
TowerStageTwoLayout.HOLDS_HIGH = [43.55, 45.05, 46.55, 48.05];
TowerStageTwoLayout.NORMAL_JOIN = 11;
TowerStageTwoLayout.BEAM_DEG = 200;
TowerStageTwoLayout.BEAM_GAP = 1.8;
TowerStageTwoLayout.CANNON_GAP2 = 1.2;
TowerStageTwoLayout.CANNON_DEG = 222;
TowerStageTwoLayout.CANNON_RHO = 17.6;
TowerStageTwoLayout.CANNON_Y = 40;
TowerStageTwoLayout.HARD_JOIN = 13;
class TowerLevelData {
    static spec() {
        return {
            stages: TowerLevelData.STAGES.map((s) => ({ ...s })),
            pieces: [...TowerHubLayout.pieces(), ...TowerStageOneLayout.pieces(), ...TowerStageTwoLayout.pieces()],
            portals: TowerHubLayout.portals(),
            routes: [...TowerStageOneLayout.routes(), ...TowerStageTwoLayout.routes()],
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
    { index: 7, name: "우주 기지", floor: 180, ceiling: 200 },
];
