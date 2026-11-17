interface ClimbPieceExtras { depth?: number; rise?: number; noLedge?: boolean; startOf?: number; look?: string }
interface ClimbPropShape { model: string; turn: number; top: number; base: number; cx: number; cz: number; span: number; across: number; round: boolean }
interface ClimbRoofShape { eaveHalf: number; eaveY: number; wallHalf: number; wallTop: number }

class TowerPropShapes {
  static readonly SHAPES: Readonly<Record<string, ClimbPropShape>> = {
    hex: { model: "hexIsle", turn: 0, top: 0, base: -1, cx: 0, cz: 0, span: 2, across: 2, round: true },
    crate: { model: "crate", turn: 0, top: 0.21, base: 0, cx: 0, cz: 0, span: 0.22, across: 0.22, round: false },
    barrel: { model: "barrelProp", turn: 0, top: 0.21, base: 0, cx: 0, cz: 0, span: 0.2, across: 0.2, round: true },
    wall: { model: "rampart", turn: 0, top: 0.9, base: 0, cx: 0, cz: -0.1, span: 2, across: 0.6, round: false },
    turret: { model: "turret", turn: 0, top: 1.4, base: 0, cx: 0, cz: 0.025, span: 0.84, across: 0.84, round: true },
    houseA: { model: "houseA", turn: Math.PI / 2, top: 0.93, base: 0, cx: 0, cz: -0.04, span: 0.86, across: 0.26, round: false },
    houseB: { model: "houseB", turn: 0, top: 1.2, base: 0, cx: 0, cz: -0.07, span: 0.88, across: 0.26, round: false },
  };
  static readonly ROOFS: Readonly<Record<string, ClimbRoofShape>> = {
    houseA: { eaveHalf: 0.4, eaveY: 0.37, wallHalf: 0.3, wallTop: 0.28 },
    houseB: { eaveHalf: 0.46, eaveY: 0.8, wallHalf: 0.36, wallTop: 0.6 },
  };
  static readonly HIDDEN = "hidden";

  static of(look: string): ClimbPropShape | undefined { return TowerPropShapes.SHAPES[look]; }
  static part(id: string): boolean { return id.includes("."); }
}

class ClimbTrail {
  constructor(public deg: number, public rho: number, public half: number, private readonly sense = 1) {}

  next(rho: number, half: number, gap: number): number {
    const reach = this.half + gap + half, cos = (this.rho * this.rho + rho * rho - reach * reach) / (2 * this.rho * rho);
    this.deg += this.sense * Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    this.rho = rho;
    this.half = half;
    return this.deg;
  }

  alongX(deg: number, rho: number, along: number, out = 0): number { return ClimbLayoutPen.ringX(deg, rho + out) + along * Math.cos(ClimbLayoutPen.rad(deg)); }
  alongZ(deg: number, rho: number, along: number, out = 0): number { return ClimbLayoutPen.ringZ(deg, rho + out) - along * Math.sin(ClimbLayoutPen.rad(deg)); }
}

class ClimbLayoutPen {
  readonly pieces: ClimbPieceSpec[] = [];

  constructor(private readonly stage: number) {}

  static halfOf(look: string, scale: number): number {
    const shape = TowerPropShapes.of(look);
    return shape ? shape.span * scale / 2 : 0;
  }

  prop(id: string, kind: string, look: string, x: number, z: number, top: number, scale: number, yawDeg: number, extras: ClimbPieceExtras = {}): void {
    const shape = TowerPropShapes.SHAPES[look], depth = (shape.top - shape.base) * scale;
    if (shape.round) this.roundAt(id, kind, x, z, top, shape.span * scale / 2, yawDeg, { depth, look, ...extras });
    else this.boxAt(id, kind, x, z, top, shape.span * scale, shape.across * scale, yawDeg, { depth, look, ...extras });
  }

  house(id: string, look: string, x: number, z: number, ground: number, scale: number, yawDeg: number): void {
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

  static rad(deg: number): number { return deg * Math.PI / 180; }
  static ringX(angleDeg: number, rho: number): number { return rho * Math.sin(ClimbLayoutPen.rad(angleDeg)); }
  static ringZ(angleDeg: number, rho: number): number { return rho * Math.cos(ClimbLayoutPen.rad(angleDeg)); }

  round(id: string, kind: string, angleDeg: number, rho: number, y: number, radius: number, extras: ClimbPieceExtras = {}): void {
    this.pieces.push({ id, kind, stage: this.stage, x: ClimbLayoutPen.ringX(angleDeg, rho), y, z: ClimbLayoutPen.ringZ(angleDeg, rho), radius, yaw: ClimbLayoutPen.rad(angleDeg), ...extras });
  }

  box(id: string, kind: string, angleDeg: number, rho: number, y: number, sx: number, sz: number, yawDeg: number, extras: ClimbPieceExtras = {}): void {
    this.pieces.push({ id, kind, stage: this.stage, x: ClimbLayoutPen.ringX(angleDeg, rho), y, z: ClimbLayoutPen.ringZ(angleDeg, rho), sx, sz, yaw: ClimbLayoutPen.rad(yawDeg), ...extras });
  }

  boxAt(id: string, kind: string, x: number, z: number, y: number, sx: number, sz: number, yawDeg: number, extras: ClimbPieceExtras = {}): void {
    this.pieces.push({ id, kind, stage: this.stage, x, y, z, sx, sz, yaw: ClimbLayoutPen.rad(yawDeg), ...extras });
  }

  roundAt(id: string, kind: string, x: number, z: number, y: number, radius: number, yawDeg: number, extras: ClimbPieceExtras = {}): void {
    this.pieces.push({ id, kind, stage: this.stage, x, y, z, radius, yaw: ClimbLayoutPen.rad(yawDeg), ...extras });
  }
}

class TowerHubLayout {
  static readonly RADIUS = 22;
  static readonly SPAWN_RHO = 10;
  static readonly PORTAL_RHO = 15;
  static readonly PORTAL_FIRST_DEG = -50;
  static readonly PORTAL_STEP_DEG = 20;

  static pieces(): ClimbPieceSpec[] {
    const pen = new ClimbLayoutPen(0);
    pen.round("hub", "hub", 0, 0, 0, TowerHubLayout.RADIUS, { depth: 3, look: "island" });
    return pen.pieces;
  }

  static portals(): ClimbPortalSpec[] {
    const H = TowerHubLayout, list: ClimbPortalSpec[] = [];
    for (let stage = 2; stage <= ClimbBalance.STAGE_COUNT; stage++) {
      const angle = H.PORTAL_FIRST_DEG + (stage - 2) * H.PORTAL_STEP_DEG;
      list.push({ stage, x: ClimbLayoutPen.ringX(angle, H.PORTAL_RHO), y: 0, z: ClimbLayoutPen.ringZ(angle, H.PORTAL_RHO), yaw: ClimbLayoutPen.rad(angle + 180) });
    }
    return list;
  }

  static spawn(): ClimbSpawnSpec { return { x: 0, y: 0, z: TowerHubLayout.SPAWN_RHO, yaw: Math.PI }; }
}

class TowerStageOneLayout {
  static readonly RING = 6.5;
  static readonly EASY_RING = 7;
  static readonly EASY_START_DEG = 282;
  static readonly CLIMB_PATH: readonly (readonly [number, number])[] = [
    [313, 14.2], [358, 14.2], [403, 14.6], [434, 16.8], [479, 16.8], [524, 16.4], [555, 18.7], [600, 18.7], [642, 18.7], [673, 21.3], [718, 21.3], [749, 23.9], [794, 23.9],
  ];
  static readonly CLIMB_SIDE = 3.4;
  static readonly CLIMB_WALL = 1.5;
  static readonly JOIN_DEG = 825;
  static readonly JOIN_RING = 6.3;
  static readonly JOIN_Y = 26.5;
  static readonly NORMAL_JOIN = 9;
  static readonly MID_Y = 12;
  static readonly HOLD_YS: readonly number[] = [14.3, 15.3, 16.3, 17.3];
  static readonly TOP_Y = 30;
  static readonly TRUNK_RADIUS = 3;
  static readonly HARD_DEG = 291;
  static readonly HARD_RING = 16;
  static readonly CANNON_GAP = 3.5;
  static readonly CANNON_RADIUS = 1.3;

  static pieces(): ClimbPieceSpec[] {
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

  static routes(): ClimbRouteSpec[] {
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

class TowerStageTwoLayout {
  static readonly FLOOR = 30;
  static readonly TOWER_BASE = 34;
  static readonly TOP_Y = 60;
  static readonly REST_RADIUS = 4.2;
  static readonly LOOP_RHO = 14;
  static readonly HEX = 2.4;
  static readonly TURRET = 3.6;
  static readonly CRATE = 7.7;
  static readonly BARREL = 8;
  static readonly WALL = 2.6;
  static readonly HOUSE_A = 3;
  static readonly HOUSE_B = 2.8;
  static readonly PAD = 1.8;
  static readonly ROOF_SPOKE = 140;
  static readonly ROOF_RHO = 20;
  static readonly CANNON_SPOKE = -88;
  static readonly INNER_RHO = 11.4;
  static readonly CANNON_LIFT = 12;
  static readonly CANNON_TOP = 33.5;
  static readonly TARGET_GAP = 1.2;

  static pieces(): ClimbPieceSpec[] {
    const S = TowerStageTwoLayout, pen = new ClimbLayoutPen(2), half = ClimbLayoutPen.halfOf, polarX = ClimbLayoutPen.ringX, polarZ = ClimbLayoutPen.ringZ;
    pen.round("tower2", "static", 0, 0, S.TOP_Y - 0.5, TowerStageOneLayout.TRUNK_RADIUS, { depth: S.TOP_Y - 0.5 - S.TOWER_BASE, noLedge: true, look: "tower" });
    const spokeRho = S.REST_RADIUS - 0.1 + half("wall", S.WALL), spokeEnd = spokeRho + half("wall", S.WALL);
    const spoke = (id: string, deg: number): void => pen.prop(id, "static", "wall", polarX(deg, spokeRho), polarZ(deg, spokeRho), S.FLOOR, S.WALL, deg - 90);

    let trail = new ClimbTrail(0, S.LOOP_RHO, S.HEX);
    const ring = (id: string, look: string, rho: number, top: number, scale: number, gap: number): number => {
      const deg = trail.next(rho, half(look, scale), gap);
      pen.prop(id, "static", look, polarX(deg, rho), polarZ(deg, rho), top, scale, deg);
      return deg;
    };
    const onIsle = (id: string, look: string, deg: number, rho: number, top: number, scale: number, along: number, out = 0): void =>
      pen.prop(id, "static", look, trail.alongX(deg, rho, along, out), trail.alongZ(deg, rho, along, out), top, scale, deg);
    const pad = (id: string, deg: number, rho: number, ground: number, along: number, out = 0): void =>
      pen.boxAt(id, "pad", trail.alongX(deg, rho, along, out), trail.alongZ(deg, rho, along, out), ground + 0.3, S.PAD, S.PAD, deg, { depth: 0.6, look: "pad" });
    const house = (id: string, look: string, rho: number, ridge: number, scale: number, gap: number): number => {
      const ground = ridge - TowerPropShapes.SHAPES[look].top * scale, deg = trail.next(rho, half(look, scale), gap);
      pen.prop(id + ".isle", "static", "hex", polarX(deg, rho), polarZ(deg, rho), ground, S.HEX * 0.75 * scale / S.HOUSE_A, deg);
      pen.house(id, look, polarX(deg, rho), polarZ(deg, rho), ground, scale, deg);
      return deg;
    };
    const hop = (id: string, look: string, deg: number, top: number, scale: number, gap: number): void => {
      const own = half(look, scale), rho = trail.rho + trail.half + gap + own;
      pen.prop(id, "static", look, polarX(deg, rho), polarZ(deg, rho), top, scale, deg);
      trail = new ClimbTrail(deg, rho, own);
    };

    spoke("vw1", 0);
    pen.prop("vi1", "static", "hex", 0, S.LOOP_RHO, 31, S.HEX, 0);
    ring("vt1", "turret", 14.5, 34.6, S.TURRET, 1);
    ring("vc1", "crate", 15.5, 34.2, S.CRATE, 3.4);
    ring("vb1", "barrel", 16, 35.2, S.BARREL, 2.8);
    const isle2 = ring("vi2", "hex", 16, 36, 2.8, 2.9);
    onIsle("vk1", "barrel", isle2, 16, 36 + 0.21 * 6, 6, -1.25, 1.5);
    onIsle("vk2", "crate", isle2, 16, 36 + 0.21 * 7.5, 7.5, -1.25);
    pen.house("vhA", "houseA", trail.alongX(isle2, 16, 0.9), trail.alongZ(isle2, 16, 0.9), 36, S.HOUSE_A, isle2);
    ring("vw2", "wall", 16, 39.4, S.WALL, 2.5);
    ring("vt2", "turret", 16, 43, S.TURRET, 1);
    ring("vc2", "crate", 15, 42.6, S.CRATE, 3.5);
    const isle3 = ring("vi3", "hex", 14.5, 43.6, S.HEX, 2.9);
    pad("vp1", isle3, 14.5, 43.6, 0.9);
    ring("vt3", "turret", 14.5, 47.2, S.TURRET, 1.2);
    ring("vw3", "wall", 15, 46.8, S.WALL, 3.4);
    ring("vb2", "barrel", 15.5, 47.8, S.BARREL, 2.8);
    ring("vt4", "turret", 15.5, 51.4, S.TURRET, 1);
    ring("vc3", "crate", 15, 51, S.CRATE, 3.5);
    const isle4 = ring("vi4", "hex", 14.5, 52, 2.6, 2.8);
    pad("vp2", isle4, 14.5, 52, 1);
    ring("vt5", "turret", 14.5, 55.6, S.TURRET, 1.2);
    house("vhB", "houseB", 14.5, 56.96, S.HOUSE_B, 2.5);
    const lastDeg = ring("vt6", "turret", 11.5, 60, S.TURRET, 1);
    const lastIn = 11.5 - half("turret", S.TURRET), lastWall = (lastIn + S.REST_RADIUS) / 2;
    pen.boxAt("vw4", "static", polarX(lastDeg, lastWall), polarZ(lastDeg, lastWall), S.TOP_Y, lastIn - S.REST_RADIUS + 0.2, 0.6 * S.WALL, lastDeg - 90, { depth: 0.9 * S.WALL, look: "wall" });

    spoke("nw1", S.ROOF_SPOKE);
    trail = new ClimbTrail(S.ROOF_SPOKE, spokeEnd, 0);
    hop("ni1", "hex", S.ROOF_SPOKE, 31, S.HEX, 2.6);
    pad("np1", S.ROOF_SPOKE, trail.rho, 31, 0, 1.2);
    trail = new ClimbTrail(S.ROOF_SPOKE, trail.rho + 1.2, S.PAD / 2);
    hop("nt1", "turret", S.ROOF_SPOKE, 34.6, S.TURRET, 1.8);
    house("nhA", "houseA", S.ROOF_RHO, 35.4, S.HOUSE_A, 2.6);
    house("nhB", "houseB", S.ROOF_RHO, 36.5, S.HOUSE_B, 3);
    ring("nc1", "crate", S.ROOF_RHO, 37.6, S.CRATE, 3);
    ring("nt2", "turret", S.ROOF_RHO, 41.2, S.TURRET, 1);
    house("nhC", "houseA", S.ROOF_RHO, 42, S.HOUSE_A, 2.8);
    ring("nw2", "wall", S.ROOF_RHO, 42.8, S.WALL, 3.1);
    ring("nt3", "turret", 19, 46.4, S.TURRET, 1);

    spoke("xw1", S.CANNON_SPOKE);
    trail = new ClimbTrail(S.CANNON_SPOKE, spokeEnd, 0, -1);
    ring("xb1", "barrel", S.INNER_RHO, 31.1, S.BARREL, 3);
    ring("xc1", "crate", S.INNER_RHO, 32.3, S.CRATE, 2.9);
    const barrel = pen.pieces.find((p) => p.id === "vb2") as ClimbPieceSpec, barrelRho = Math.hypot(barrel.x, barrel.z), barrelDeg = Math.atan2(barrel.x, barrel.z) * 180 / Math.PI;
    const aimRho = barrelRho - (barrel.radius ?? 0) - S.TARGET_GAP - 1.5, aimX = polarX(barrelDeg, aimRho), aimZ = polarZ(barrelDeg, aimRho);
    const B = ClimbBalance, flight = (B.CANNON_UP + Math.sqrt(B.CANNON_UP ** 2 - 2 * B.GRAVITY * S.CANNON_LIFT)) / B.GRAVITY * B.CANNON_FORWARD;
    const swing = Math.acos((S.INNER_RHO ** 2 + aimRho ** 2 - flight ** 2) / (2 * S.INNER_RHO * aimRho)) * 180 / Math.PI;
    const cannonDeg = barrelDeg - swing, cannonX = polarX(cannonDeg, S.INNER_RHO), cannonZ = polarZ(cannonDeg, S.INNER_RHO);
    const dirX = (aimX - cannonX) / flight, dirZ = (aimZ - cannonZ) / flight;
    const cannonYaw = Math.atan2(dirX, dirZ) * 180 / Math.PI;
    pen.boxAt("xcan", "cannon", cannonX, cannonZ, S.CANNON_TOP, 2.6, 2.6, cannonYaw, { depth: 0.8, look: "cannon" });
    pen.boxAt("xtarget", "static", cannonX + dirX * flight, cannonZ + dirZ * flight, S.CANNON_TOP + S.CANNON_LIFT, 3, 3, cannonYaw, { depth: 0.6, look: "slab" });

    pen.round("rest3", "rest", 0, 0, S.TOP_Y, S.REST_RADIUS, { depth: 0.5, startOf: 3, look: "rest" });
    return pen.pieces;
  }

  static routes(): ClimbRouteSpec[] {
    const easy = ["rest2", "vw1", "vi1", "vt1", "vc1", "vb1", "vi2", "vk1", "vk2", "vhA", "vw2", "vt2", "vc2", "vi3", "vp1", "vt3", "vw3", "vb2", "vt4", "vc3", "vi4", "vp2", "vt5", "vhB", "vt6", "vw4", "rest3"];
    const tail = easy.slice(easy.indexOf("vb2"));
    return [
      { stage: 2, name: "easy2", label: "쉬운 길", ratioLimit: 0.75, steps: easy },
      { stage: 2, name: "normal2", label: "지붕 길", ratioLimit: 0.8, steps: ["rest2", "nw1", "ni1", "np1", "nt1", "nhA", "nhB", "nc1", "nt2", "nhC", "nw2", "nt3", ...tail] },
      { stage: 2, name: "hard2", label: "발사대", ratioLimit: 0.9, steps: ["rest2", "xw1", "xb1", "xc1", "xcan", "xtarget", ...tail] },
    ];
  }
}

class TowerLevelData {
  static readonly STAGES: readonly ClimbStageSpec[] = [
    { index: 0, name: "시작 지점", floor: -100, ceiling: 0 },
    { index: 1, name: "뿌리 숲", floor: 0, ceiling: 30 },
    { index: 2, name: "폐허 마을", floor: 30, ceiling: 60 },
    { index: 3, name: "지하 던전", floor: 60, ceiling: 90 },
    { index: 4, name: "거인의 주방", floor: 90, ceiling: 120 },
    { index: 5, name: "묘지", floor: 120, ceiling: 150 },
    { index: 6, name: "눈 덮인 장난감 마을", floor: 150, ceiling: 180 },
    { index: 7, name: "우주 기지", floor: 180, ceiling: 200 },
  ];

  static spec(): ClimbLevelSpec {
    return {
      stages: TowerLevelData.STAGES.map((s) => ({ ...s })),
      pieces: [...TowerHubLayout.pieces(), ...TowerStageOneLayout.pieces(), ...TowerStageTwoLayout.pieces()],
      portals: TowerHubLayout.portals(),
      routes: [...TowerStageOneLayout.routes(), ...TowerStageTwoLayout.routes()],
      spawn: TowerHubLayout.spawn(),
    };
  }
}
