interface ClimbPieceExtras { depth?: number; rise?: number; noLedge?: boolean; startOf?: number; look?: string }

class ClimbLayoutPen {
  readonly pieces: ClimbPieceSpec[] = [];

  constructor(private readonly stage: number) {}

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
  static readonly EASY_STEP_DEG = 28;
  static readonly EASY_RISE = 0.5;
  static readonly EASY_COUNT = 28;
  static readonly EASY_REST_EVERY = 5;
  static readonly MID_Y = 12;
  static readonly HOLD_YS: readonly number[] = [14.3, 15.3, 16.3, 17.3];
  static readonly NORMAL_JOIN = 15;
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

    for (let i = 1; i <= S.EASY_COUNT; i++) {
      const angle = S.EASY_START_DEG + S.EASY_STEP_DEG * i, y = S.MID_Y + S.EASY_RISE * i;
      if (i % S.EASY_REST_EVERY === 0) pen.box("e" + i, "static", angle, S.EASY_RING, y, 3.2, 3.2, angle, { depth: 0.6, look: "deck" });
      else pen.box("e" + i, "static", angle, S.EASY_RING, y, 2.3, 2.3, angle, { depth: 0.6, look: i % 2 ? "rock" : "stump" });
    }
    const joinDeg = S.EASY_START_DEG + S.EASY_STEP_DEG * (S.EASY_COUNT + 1), joinY = S.MID_Y + S.EASY_RISE * (S.EASY_COUNT + 1);
    pen.box("join", "static", joinDeg, S.EASY_RING, joinY, 3.6, 3.6, joinDeg, { depth: 0.6, look: "deck" });

    pen.box("n0", "static", S.EASY_START_DEG, 3.9, S.MID_Y + 0.15, 2.4, 1.6, S.EASY_START_DEG, { depth: 0.8, noLedge: true, look: "root" });
    S.HOLD_YS.forEach((y, i) => pen.round("h" + (i + 1), "hold", S.EASY_START_DEG, S.TRUNK_RADIUS, y, 0.25, { depth: 0.3, look: "hold" }));
    const rampLow = S.HOLD_YS[S.HOLD_YS.length - 1] + 1.1, rampHigh = S.MID_Y + S.EASY_RISE * S.NORMAL_JOIN;
    pen.box("n1", "static", S.EASY_START_DEG, 4.8, rampLow, 2.4, 1.8, S.EASY_START_DEG, { depth: 0.5, look: "deck" });
    pen.box("ramp", "slope", 310, 4.5, (rampLow + rampHigh) / 2, 3.4, 1.3, 310, { depth: 0.5, rise: rampHigh - rampLow, look: "ramp" });

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

    pen.box("u1", "static", joinDeg + 26, 6.4, joinY + 0.9, 2.2, 2.2, joinDeg + 26, { depth: 0.6, look: "rock" });
    pen.box("u2", "static", joinDeg + 52, 6.4, joinY + 1.8, 2.2, 2.2, joinDeg + 52, { depth: 0.6, look: "stump" });
    pen.box("u3", "static", joinDeg + 78, 6.4, joinY + 2.65, 2.2, 2.2, joinDeg + 78, { depth: 0.6, look: "rock" });
    pen.round("rest2", "rest", 0, 0, S.TOP_Y, 4.2, { depth: 0.5, startOf: 2, look: "rest" });
    return pen.pieces;
  }

  static routes(): ClimbRouteSpec[] {
    const S = TowerStageOneLayout;
    const opening = ["hub", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "pad", "mid"];
    const ending = ["join", "u1", "u2", "u3", "rest2"];
    const easy: string[] = [];
    for (let i = 1; i <= S.EASY_COUNT; i++) easy.push("e" + i);
    const holds = S.HOLD_YS.map((_, i) => "h" + (i + 1));
    return [
      { stage: 1, name: "easy", label: "쉬운 길", ratioLimit: 0.6, steps: [...opening, ...easy, ...ending] },
      { stage: 1, name: "normal", label: "잡기 오르막", ratioLimit: 0.6, steps: [...opening, "n0", ...holds, "n1", "ramp", ...easy.slice(S.NORMAL_JOIN - 1), ...ending] },
      { stage: 1, name: "hard", label: "발사대", ratioLimit: 0.9, steps: [...opening, "hard1", "hard2", "cannon", "target", "e" + (S.EASY_COUNT - 1), "e" + S.EASY_COUNT, ...ending] },
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
      pieces: [...TowerHubLayout.pieces(), ...TowerStageOneLayout.pieces()],
      portals: TowerHubLayout.portals(),
      routes: TowerStageOneLayout.routes(),
      spawn: TowerHubLayout.spawn(),
    };
  }
}
