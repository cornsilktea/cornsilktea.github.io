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
