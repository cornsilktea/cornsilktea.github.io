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
    column: { model: "pillar", turn: 0, top: 4, base: 0, cx: 0, cz: 0, span: 1.5, across: 1.5, round: true },
    box: { model: "boxLarge", turn: 0, top: 1.5, base: 0, cx: 0, cz: 0, span: 1.5, across: 1.5, round: false },
    keg: { model: "barrel", turn: 0, top: 2, base: 0, cx: 0, cz: 0, span: 1.8, across: 1.8, round: true },
    tile: { model: "tile", turn: 0, top: 0.05, base: -0.1, cx: 0, cz: 0, span: 4, across: 4, round: false },
    dwall: { model: "dungeonWall", turn: 0, top: 4, base: 0, cx: 0, cz: 0, span: 4, across: 1, round: false },
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
  constructor(public deg: number, public rho: number, public half: number, readonly sense = 1) {}

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

class ClimbRingBuilder {
  trail = new ClimbTrail(0, 0, 0);

  constructor(readonly pen: ClimbLayoutPen, private readonly restRadius: number) {}

  follow(deg: number, rho: number, half: number, sense = 1): void { this.trail = new ClimbTrail(deg, rho, half, sense); }

  spokeRho(look: string, scale: number): number { return this.restRadius - 0.1 + ClimbLayoutPen.halfOf(look, scale); }

  spoke(id: string, look: string, deg: number, top: number, scale: number): number {
    const rho = this.spokeRho(look, scale);
    this.pen.prop(id, "static", look, ClimbLayoutPen.ringX(deg, rho), ClimbLayoutPen.ringZ(deg, rho), top, scale, deg - 90);
    return rho + ClimbLayoutPen.halfOf(look, scale);
  }

  ring(id: string, look: string, rho: number, top: number, scale: number, gap: number): number {
    const deg = this.trail.next(rho, ClimbLayoutPen.halfOf(look, scale), gap);
    this.pen.prop(id, "static", look, ClimbLayoutPen.ringX(deg, rho), ClimbLayoutPen.ringZ(deg, rho), top, scale, deg);
    return deg;
  }

  hop(id: string, look: string, deg: number, top: number, scale: number, gap: number): number {
    const own = ClimbLayoutPen.halfOf(look, scale), rho = this.trail.rho + this.trail.half + gap + own;
    this.pen.prop(id, "static", look, ClimbLayoutPen.ringX(deg, rho), ClimbLayoutPen.ringZ(deg, rho), top, scale, deg);
    this.trail = new ClimbTrail(deg, rho, own, this.trail.sense);
    return rho;
  }

  along(id: string, look: string, deg: number, rho: number, top: number, scale: number, along: number, out = 0): void {
    this.pen.prop(id, "static", look, this.trail.alongX(deg, rho, along, out), this.trail.alongZ(deg, rho, along, out), top, scale, deg);
  }

  pad(id: string, deg: number, rho: number, ground: number, size: number, along: number, out = 0): void {
    this.pen.boxAt(id, "pad", this.trail.alongX(deg, rho, along, out), this.trail.alongZ(deg, rho, along, out), ground + 0.3, size, size, deg, { depth: 0.6, look: "pad" });
  }

  house(id: string, look: string, rho: number, ridge: number, scale: number, gap: number, isleScale: number): number {
    const ground = ridge - TowerPropShapes.SHAPES[look].top * scale, deg = this.trail.next(rho, ClimbLayoutPen.halfOf(look, scale), gap);
    const x = ClimbLayoutPen.ringX(deg, rho), z = ClimbLayoutPen.ringZ(deg, rho);
    this.pen.prop(id + ".isle", "static", "hex", x, z, ground, isleScale, deg);
    this.pen.house(id, look, x, z, ground, scale, deg);
    return deg;
  }

  bridge(id: string, look: string, deg: number, outerRho: number, top: number, scale: number): void {
    const shape = TowerPropShapes.SHAPES[look], middle = (outerRho + this.restRadius) / 2;
    this.pen.boxAt(id, "static", ClimbLayoutPen.ringX(deg, middle), ClimbLayoutPen.ringZ(deg, middle), top, outerRho - this.restRadius + 0.2, shape.across * scale, deg - 90, { depth: (shape.top - shape.base) * scale, look });
  }

  arrive(id: string, look: string, rho: number, top: number, scale: number, gap: number, bridgeId: string, bridgeLook: string, bridgeScale: number): void {
    const deg = this.ring(id, look, rho, top, scale, gap);
    this.bridge(bridgeId, bridgeLook, deg, rho - ClimbLayoutPen.halfOf(look, scale), top, bridgeScale);
  }

  cannonAt(id: string, x: number, z: number, top: number, size: number, towardX: number, towardZ: number, lift: number): { x: number; z: number; yaw: number } {
    const flight = ClimbRingBuilder.cannonFlight(lift), dx = towardX - x, dz = towardZ - z, d = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz) * 180 / Math.PI;
    this.pen.boxAt(id, "cannon", x, z, top, size, size, yaw, { depth: 0.8, look: "cannon" });
    return { x: x + dx / d * flight, z: z + dz / d * flight, yaw };
  }

  static cannonFlight(lift: number): number {
    const B = ClimbBalance;
    return (B.CANNON_UP + Math.sqrt(B.CANNON_UP ** 2 - 2 * B.GRAVITY * lift)) / B.GRAVITY * B.CANNON_FORWARD;
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
    const S = TowerStageTwoLayout, pen = new ClimbLayoutPen(2), go = new ClimbRingBuilder(pen, S.REST_RADIUS), polarX = ClimbLayoutPen.ringX, polarZ = ClimbLayoutPen.ringZ;
    pen.round("tower2", "static", 0, 0, S.TOP_Y - 0.5, TowerStageOneLayout.TRUNK_RADIUS, { depth: S.TOP_Y - 0.5 - S.TOWER_BASE, noLedge: true, look: "tower" });
    const isleOf = (scale: number): number => S.HEX * 0.75 * scale / S.HOUSE_A;

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

    const cannonStart = go.spoke("xw1", "wall", S.CANNON_SPOKE, S.FLOOR, S.WALL);
    go.follow(S.CANNON_SPOKE, cannonStart, 0, -1);
    go.ring("xb1", "barrel", S.INNER_RHO, 31.1, S.BARREL, 3);
    go.ring("xc1", "crate", S.INNER_RHO, 32.3, S.CRATE, 2.9);
    const barrel = pen.pieces.find((p) => p.id === "vb2") as ClimbPieceSpec, barrelRho = Math.hypot(barrel.x, barrel.z), barrelDeg = Math.atan2(barrel.x, barrel.z) * 180 / Math.PI;
    const aimRho = barrelRho - (barrel.radius ?? 0) - S.TARGET_GAP - 1.5, flight = ClimbRingBuilder.cannonFlight(S.CANNON_LIFT);
    const swing = Math.acos((S.INNER_RHO ** 2 + aimRho ** 2 - flight ** 2) / (2 * S.INNER_RHO * aimRho)) * 180 / Math.PI, cannonDeg = barrelDeg - swing;
    const land = go.cannonAt("xcan", polarX(cannonDeg, S.INNER_RHO), polarZ(cannonDeg, S.INNER_RHO), S.CANNON_TOP, 2.6, polarX(barrelDeg, aimRho), polarZ(barrelDeg, aimRho), S.CANNON_LIFT);
    pen.boxAt("xtarget", "static", land.x, land.z, S.CANNON_TOP + S.CANNON_LIFT, 3, 3, land.yaw, { depth: 0.6, look: "slab" });

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

class TowerStageThreeLayout {
  static readonly FLOOR = 60;
  static readonly TOWER_BASE = 64;
  static readonly TOP_Y = 90;
  static readonly REST_RADIUS = 4.2;
  static readonly SPOKE = 1.5;
  static readonly PILLAR = 1.68;
  static readonly BOX = 1.2;
  static readonly KEG = 1;
  static readonly TILE = 0.75;
  static readonly WALL = 1.5;
  static readonly PAD = 1.8;
  static readonly ARRIVE_RHO = 11.5;
  static readonly EASY_SPOKE = 40;
  static readonly EASY_RHO = 15.5;
  static readonly WALL_SPOKE = 170;
  static readonly WALL_RHO = 22;
  static readonly CANNON_SPOKE = 300;
  static readonly CANNON_RHO = 11;
  static readonly CANNON_LIFT = 12;
  static readonly CANNON_TOP = 62.2;
  static readonly CANNON_SIZE = 3;

  static pieces(): ClimbPieceSpec[] {
    const S = TowerStageThreeLayout, pen = new ClimbLayoutPen(3), go = new ClimbRingBuilder(pen, S.REST_RADIUS), polarX = ClimbLayoutPen.ringX, polarZ = ClimbLayoutPen.ringZ;
    pen.round("tower3", "static", 0, 0, S.TOP_Y - 0.5, TowerStageOneLayout.TRUNK_RADIUS, { depth: S.TOP_Y - 0.5 - S.TOWER_BASE, noLedge: true, look: "tower" });

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

    go.follow(S.CANNON_SPOKE, go.spoke("cw1", "dwall", S.CANNON_SPOKE, S.FLOOR, S.SPOKE), 0, -1);
    go.ring("ck1", "keg", S.CANNON_RHO, 60.4, S.KEG, 4);
    go.ring("cb1", "box", S.CANNON_RHO, 61.2, S.BOX, 3.8);
    const flight = ClimbRingBuilder.cannonFlight(S.CANNON_LIFT), step = 2 * Math.asin(flight / 2 / S.CANNON_RHO) * 180 / Math.PI;
    const firstDeg = go.trail.next(S.CANNON_RHO, S.CANNON_SIZE / 2, 3), secondDeg = firstDeg - step, landDeg = secondDeg - step;
    const at = (deg: number): [number, number] => [polarX(deg, S.CANNON_RHO), polarZ(deg, S.CANNON_RHO)];
    go.cannonAt("cc1", ...at(firstDeg), S.CANNON_TOP, S.CANNON_SIZE, ...at(secondDeg), S.CANNON_LIFT);
    const land = go.cannonAt("cc2", ...at(secondDeg), S.CANNON_TOP + S.CANNON_LIFT, S.CANNON_SIZE, ...at(landDeg), S.CANNON_LIFT);
    pen.boxAt("ctarget", "static", land.x, land.z, S.CANNON_TOP + 2 * S.CANNON_LIFT, 3, 3, land.yaw, { depth: 0.6, look: "slab" });
    go.follow(landDeg, S.CANNON_RHO, 1.5, -1);
    go.arrive("cp1", "column", S.ARRIVE_RHO, S.TOP_Y, S.PILLAR, 1.5, "cw2", "dwall", S.WALL);

    pen.round("rest4", "rest", 0, 0, S.TOP_Y, S.REST_RADIUS, { depth: 0.5, startOf: 4, look: "rest" });
    return pen.pieces;
  }

  static routes(): ClimbRouteSpec[] {
    return [
      { stage: 3, name: "easy3", label: "쉬운 길", ratioLimit: 0.85, steps: ["rest3", "dw1", "dt1", "dp1", "db1", "dk1", "dt2", "dj1", "dt3", "dp2", "db2", "dt7", "dp3", "dk2", "dt4", "dj2", "dt5", "dp4", "db3", "dk3", "dp5", "dt6", "dp6", "dw3", "rest4"] },
      { stage: 3, name: "normal3", label: "기둥 길", ratioLimit: 0.9, steps: ["rest3", "lw1", "lt1", "lp1", "lp2", "lt2", "lb2", "lp3", "lp4", "lt3", "lb1", "lp5", "lp6", "lt4", "lp7", "dt6", "dp6", "dw3", "rest4"] },
      { stage: 3, name: "hard3", label: "연쇄 발사대", ratioLimit: 0.93, steps: ["rest3", "cw1", "ck1", "cb1", "cc1", "cc2", "ctarget", "cp1", "cw2", "rest4"] },
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
      pieces: [...TowerHubLayout.pieces(), ...TowerStageOneLayout.pieces(), ...TowerStageTwoLayout.pieces(), ...TowerStageThreeLayout.pieces()],
      portals: TowerHubLayout.portals(),
      routes: [...TowerStageOneLayout.routes(), ...TowerStageTwoLayout.routes(), ...TowerStageThreeLayout.routes()],
      spawn: TowerHubLayout.spawn(),
    };
  }
}
