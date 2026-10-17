type SnMode = "duos" | "solo";
type SnLife = "sky" | "alive" | "down" | "out";
type SnGearSlot = "hat" | "suit" | "shoes";
type SnStormPhase = "prep" | "shrink" | "wait" | "full";
type SnShotEnd = "player" | "wall" | "ground" | "block";
type SnItem = { kind: "gear"; slot: SnGearSlot; grade: number } | { kind: "cocoa" } | { kind: "big" };

interface SnIntent {
  moveX: number; moveZ: number;
  attack: boolean; attackAngle: number | null;
  wall: boolean; wallAngle: number | null;
  holdK: boolean;
  dropPick: SnPoint | null;
}

interface SnPilot {
  readonly bot: boolean;
  decide(engine: SnEngine, me: SnPlayer, dt: number): SnIntent;
}

interface SnRosterMember { id: string; nick: string; bot: boolean }
interface SnRosterTeam { members: SnRosterMember[] }
interface SnHumanSeat { id: string; nick: string; team: number }
interface SnStormState { x: number; z: number; r: number; dps: number; stage: number; phase: SnStormPhase; phaseEnd: number; next: { x: number; z: number; r: number } | null }
interface SnStormRow { start: number; end: number; from: number; to: number; dps: number; stage: number; phase: SnStormPhase }
interface SnEngineConfig { seed: number; mode: SnMode; teams: SnRosterTeam[] }

type SnEvent =
  | { t: "shot"; id: number; by: number; x: number; z: number; a: number; big: boolean; lv: number }
  | { t: "shotEnd"; id: number; x: number; z: number; why: SnShotEnd }
  | { t: "hit"; to: number; by: number; v: number; storm: boolean }
  | { t: "down"; id: number; by: number }
  | { t: "revive"; id: number; by: number }
  | { t: "wall"; id: number }
  | { t: "wallGone"; id: number; broken: boolean }
  | { t: "wallHit"; id: number; v: number }
  | { t: "snow"; tiles: number[] }
  | { t: "pile"; i: number; by: number }
  | { t: "crate"; i: number; open: boolean; taken: boolean; by: number }
  | { t: "storm"; stage: number; what: "warn" | "shrink" | "full" }
  | { t: "drop"; team: number; x: number; z: number }
  | { t: "land"; id: number }
  | { t: "teamOut"; team: number }
  | { t: "noSnow"; id: number }
  | { t: "noWall"; id: number }
  | { t: "end" };

class SnBalance {
  static readonly MAX_HP = 100;
  static readonly SPEED = 4;
  static readonly ICE_PACE = 0.5;
  static readonly RADIUS = 0.4;
  static readonly SHOT = { damage: 12, cost: 2, interval: 0.45, speed: 22, range: 14, radius: 0.25, spawn: 0.5 };
  static readonly WALL = { cost: 30, hp: 150, halfLength: 1.5, halfDepth: 0.3, height: 2.2, buildTime: 1, interval: 1.2, perTeam: 10, life: 75, distance: 1.3, snap: 3.2, minLength: 0.8, maxLength: 3.6, joinOverlap: 0.3, joinFree: 0.9, cliffReach: 1.6, cliffLengths: [1.5, 1.1, 0.7] as readonly number[] };
  static readonly COCOA_RATIO = 0.3;
  static readonly BIG = { damage: 40, wallDamage: 200, radius: 1.2, speed: 12, distance: 30, knock: 4, knockTime: 0.3 };
  static readonly REVIVE = { time: 10, hp: 50, guard: 3, max: 2, reach: 2.5 };
  static readonly DROP = { time: 8, pickLimit: 20, spread: 6, gap: 2, steer: 3.5, steerMax: 22, botPickMin: 2, botPickMax: 6, keyWeight: 3 };
  static readonly SNOW = { perTile: 5, start: 30, cap: 300, pile: 10, pileReach: 1.0 };
  static readonly HEIGHT = { defense: 0.12, rangeUp: 0.15, rangeDown: 0.10 };
  static readonly AIM = { reach: 20, lead: 0.6, err: 0.08, moveMemory: 0.4 };
  static readonly GRADE_COLORS: readonly string[] = ["#B8BEC9", "#5B9BFF", "#F08A3E"];
  static readonly GRADE_NAMES: readonly string[] = ["일반", "희귀", "전설"];
  static readonly GRADE_ODDS_BASE: readonly number[] = [0.5, 0.4, 0.1];
  static readonly GRADE_ODDS_KEY: readonly number[] = [0.3, 0.45, 0.25];
  static readonly GEAR_SLOTS: readonly SnGearSlot[] = ["hat", "suit", "shoes"];
  static readonly HAT_CUT: readonly number[] = [0.08, 0.14, 0.20];
  static readonly SUIT_HP: readonly number[] = [15, 30, 50];
  static readonly SHOES_SPEED: readonly number[] = [0.15, 0.30, 0.45];
  static readonly CRATES = { placed: 40, cocoa: 10, big: 6, open: 1.5 };
  static readonly STORM_TICK = 0.5;
  static readonly STORM_WARN = 5;
  static readonly STORM_RADII: readonly number[] = [113, 70, 45, 28, 16, 7, 0];
  static readonly STORM_ROWS: readonly SnStormRow[] = [
    { start: 0, end: 45, from: 0, to: 0, dps: 0, stage: 0, phase: "prep" },
    { start: 45, end: 90, from: 0, to: 1, dps: 1, stage: 1, phase: "shrink" },
    { start: 90, end: 115, from: 1, to: 1, dps: 1, stage: 1, phase: "wait" },
    { start: 115, end: 150, from: 1, to: 2, dps: 2, stage: 2, phase: "shrink" },
    { start: 150, end: 170, from: 2, to: 2, dps: 2, stage: 2, phase: "wait" },
    { start: 170, end: 210, from: 2, to: 3, dps: 4, stage: 3, phase: "shrink" },
    { start: 210, end: 225, from: 3, to: 3, dps: 4, stage: 3, phase: "wait" },
    { start: 225, end: 260, from: 3, to: 4, dps: 7, stage: 4, phase: "shrink" },
    { start: 260, end: 270, from: 4, to: 4, dps: 7, stage: 4, phase: "wait" },
    { start: 270, end: 305, from: 4, to: 5, dps: 11, stage: 5, phase: "shrink" },
    { start: 305, end: 315, from: 5, to: 5, dps: 11, stage: 5, phase: "wait" },
    { start: 315, end: 360, from: 5, to: 6, dps: 16, stage: 6, phase: "shrink" },
    { start: 360, end: Infinity, from: 6, to: 6, dps: 25, stage: 7, phase: "full" },
  ];
  static readonly STORM_MIN_OPEN = 0.4;
  static readonly SAFETY_END = 480;
  static readonly TEAM_COLORS_DUOS: readonly string[] = ["#E0524B", "#3F7FE0", "#E8B931"];
  static readonly TEAM_COLORS_SOLO: readonly string[] = ["#E0524B", "#3F7FE0", "#E8B931", "#4CB860", "#9A62D8", "#5CC8E8"];
  static readonly TEAM_NAMES_DUOS: readonly string[] = ["빨강", "파랑", "노랑"];
  static readonly MIN_PLAYERS = 4;
  static readonly MAX_PLAYERS = 6;
}

class SnAngle {
  static dirX(a: number): number { return Math.cos(a); }
  static dirZ(a: number): number { return Math.sin(a); }
  static toward(fx: number, fz: number, tx: number, tz: number): number { return Math.atan2(tz - fz, tx - fx); }
  static wrap(a: number): number { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
}

class SnGearRules {
  static canEquip(current: number, grade: number): boolean { return current < 0 || grade > current; }
  static hatCut(grade: number): number { return grade < 0 ? 0 : SnBalance.HAT_CUT[grade]; }
  static suitHp(grade: number): number { return grade < 0 ? 0 : SnBalance.SUIT_HP[grade]; }
  static shoesBoost(grade: number): number { return grade < 0 ? 0 : SnBalance.SHOES_SPEED[grade]; }
  static slotIndex(slot: SnGearSlot): number { return SnBalance.GEAR_SLOTS.indexOf(slot); }
  static rollGrade(random: SnSeededRandom, key: boolean): number {
    const odds = key ? SnBalance.GRADE_ODDS_KEY : SnBalance.GRADE_ODDS_BASE;
    let roll = random.next();
    for (let g = 0; g < odds.length; g++) { roll -= odds[g]; if (roll < 0) return g; }
    return odds.length - 1;
  }
}

class SnHeightRules {
  static defenseScale(targetLevel: number, attackerLevel: number): number {
    const n = targetLevel - attackerLevel;
    return n > 0 ? 1 - SnBalance.HEIGHT.defense * n : 1;
  }
  static rangeScale(flightLevel: number, groundLevel: number): number {
    const d = groundLevel - flightLevel;
    if (d > 0) return 1 - SnBalance.HEIGHT.rangeUp * d;
    return 1 + SnBalance.HEIGHT.rangeDown * -d;
  }
}

class SnRosterPlanner {
  static allBots(mode: SnMode): SnRosterTeam[] {
    const bot = (k: number): SnRosterMember => ({ id: "bot" + k, nick: "AI " + k, bot: true });
    return mode === "solo"
      ? [1, 2, 3, 4, 5, 6].map((k) => ({ members: [bot(k)] }))
      : [0, 1, 2].map((t) => ({ members: [bot(t * 2 + 1), bot(t * 2 + 2)] }));
  }

  static fill(mode: SnMode, humans: readonly SnHumanSeat[]): SnRosterTeam[] {
    let botCount = 0;
    const bot = (): SnRosterMember => { botCount++; return { id: "bot" + botCount, nick: "AI " + botCount, bot: true }; };
    if (mode === "solo") {
      const teams: SnRosterTeam[] = humans.slice(0, SnBalance.MAX_PLAYERS).map((h) => ({ members: [{ id: h.id, nick: h.nick, bot: false }] }));
      while (teams.length < SnBalance.MIN_PLAYERS) teams.push({ members: [bot()] });
      return teams;
    }
    const byTeam: SnRosterMember[][] = [[], [], []];
    for (const h of humans) if (h.team >= 0 && h.team < 3 && byTeam[h.team].length < 2) byTeam[h.team].push({ id: h.id, nick: h.nick, bot: false });
    const teams: SnRosterTeam[] = [];
    for (const members of byTeam) {
      if (!members.length) continue;
      while (members.length < 2) members.push(bot());
      teams.push({ members });
    }
    while (teams.length * 2 < SnBalance.MIN_PLAYERS) teams.push({ members: [bot(), bot()] });
    return teams;
  }
}

class SnPlayer {
  x = 0; z = 0; yaw = 0;
  vx = 0; vz = 0; movedAt = -1;
  life: SnLife = "sky";
  hp = SnBalance.MAX_HP;
  readonly gear: number[] = [-1, -1, -1];
  bigBall = false;
  revivesUsed = 0;
  guardUntil = 0;
  nextShotAt = 0;
  nextWallAt = 0;
  buildUntil = 0;
  buildingWall = -1;
  knockX = 0; knockZ = 0; knockLeft = 0;
  reviveTarget = -1; reviveProgress = 0;
  kills = 0; dealt = 0; collected = 0; walls = 0;
  downAt = -1; killedBy = -1;
  lastHitAt = -1; lastHitFromX = 0; lastHitFromZ = 0;
  landAt = -1; spotX = 0; spotZ = 0; skyX = 0; skyZ = 0;
  external = false;
  constructor(readonly num: number, readonly id: string, readonly nick: string, readonly team: number, readonly bot: boolean) {}

  get maxHp(): number { return SnBalance.MAX_HP + SnGearRules.suitHp(this.gear[1]); }
  get speed(): number { return SnBalance.SPEED * (1 + SnGearRules.shoesBoost(this.gear[2])); }
  get onGround(): boolean { return this.life === "alive"; }
  canBeRevived(): boolean { return this.life === "down" && this.revivesUsed < SnBalance.REVIVE.max; }
  building(time: number): boolean { return time < this.buildUntil; }
  guarded(time: number): boolean { return time < this.guardUntil; }
}

class SnTeam {
  snow = SnBalance.SNOW.start;
  outTick = -1;
  outAt = -1;
  dropAt = -1;
  dropX = 0; dropZ = 0;
  botPickAt = -1;
  constructor(readonly num: number, readonly members: SnPlayer[]) {}
  get leader(): SnPlayer { return this.members.find((p) => !p.bot) || this.members[0]; }
  get out(): boolean { return this.outTick >= 0; }
  room(): number { return SnBalance.SNOW.cap - this.snow; }
}

class SnWall {
  readonly halfZ = SnBalance.WALL.halfDepth;
  readonly yaw: number;
  hp = SnBalance.WALL.hp;
  expireAt: number;
  constructor(readonly id: number, readonly team: number, readonly owner: number, readonly x: number, readonly z: number, readonly facing: number, readonly level: number, readonly createdAt: number, readonly readyAt: number, readonly halfX: number = SnBalance.WALL.halfLength) {
    this.yaw = Math.atan2(Math.cos(facing), Math.sin(facing));
    this.expireAt = readyAt + SnBalance.WALL.life;
  }
  get axisX(): number { return Math.cos(this.yaw); }
  get axisZ(): number { return -Math.sin(this.yaw); }
  ends(): [SnPoint, SnPoint] {
    const ax = this.axisX * this.halfX, az = this.axisZ * this.halfX;
    return [{ x: this.x - ax, z: this.z - az }, { x: this.x + ax, z: this.z + az }];
  }
  solid(time: number): boolean { return time >= this.readyAt; }
  distanceTo(x: number, z: number): number { return SnBoxMath.distance(this.x, this.z, this.halfX, this.halfZ, this.yaw, x, z); }
  pushOut(x: number, z: number, pad: number): SnPoint | null { return SnBoxMath.pushOut(this.x, this.z, this.halfX, this.halfZ, this.yaw, x, z, pad); }
  spine(inset: number): SnPoint[] {
    const reach = this.halfX - inset, pts: SnPoint[] = [{ x: this.x, z: this.z }];
    for (let a = 0.25; a <= reach; a += 0.25) pts.push({ x: this.x + this.axisX * a, z: this.z + this.axisZ * a }, { x: this.x - this.axisX * a, z: this.z - this.axisZ * a });
    return pts;
  }
  samplePoints(inset: number = 0): SnPoint[] {
    const pts: SnPoint[] = [], c = Math.cos(this.yaw), s = Math.sin(this.yaw), reach = this.halfX - inset;
    const n = Math.max(1, Math.ceil(reach * 2 / 0.5));
    for (let k = 0; k <= n; k++) { const a = -reach + reach * 2 * k / n; for (const b of [-this.halfZ, this.halfZ]) pts.push({ x: this.x + a * c + b * s, z: this.z - a * s + b * c }); }
    return pts;
  }
}

class SnCrate {
  opened = false;
  taken = false;
  constructor(readonly num: number, readonly spot: number, readonly x: number, readonly z: number, readonly key: boolean, readonly item: SnItem) {}
}

class SnPile {
  taken = false;
  constructor(readonly num: number, readonly x: number, readonly z: number) {}
}

class SnSnowField {
  readonly amount = new Uint8Array(SnGridMath.COUNT);
  readonly changed: number[] = [];
  constructor(map: SnMap) {
    for (let idx = 0; idx < SnGridMath.COUNT; idx++) if (map.snowy(idx)) this.amount[idx] = SnBalance.SNOW.perTile;
  }
  take(idx: number, room: number): number {
    if (idx < 0 || room <= 0 || !this.amount[idx]) return 0;
    const got = Math.min(this.amount[idx], room);
    this.amount[idx] -= got;
    this.changed.push(idx);
    return got;
  }
  remaining(): number { let sum = 0; for (let k = 0; k < this.amount.length; k++) sum += this.amount[k]; return sum; }
}

class SnStormPlan {
  readonly centers: SnPoint[] = [];
  constructor(map: SnMap, random: SnSeededRandom) {
    this.centers.push({ x: 0, z: 0 });
    const radii = SnBalance.STORM_RADII;
    for (let k = 1; k < radii.length; k++) this.centers.push(this.pickCenter(map, random, this.centers[k - 1], radii[k - 1], radii[k]));
  }

  private openShare(map: SnMap, x: number, z: number, r: number): number {
    if (r < 1) return 1;
    let all = 0, open = 0;
    for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) {
      if (dx * dx + dz * dz > r * r) continue;
      all++;
      const idx = SnGridMath.indexAt(x + dx, z + dz);
      if (idx >= 0 && map.walkable(idx)) open++;
    }
    return all ? open / all : 0;
  }

  private pickCenter(map: SnMap, random: SnSeededRandom, prev: SnPoint, prevR: number, r: number): SnPoint {
    const room = prevR - r;
    for (let tries = 0; tries < 400; tries++) {
      const a = random.range(0, Math.PI * 2), d = Math.sqrt(random.next()) * room;
      const x = prev.x + Math.cos(a) * d, z = prev.z + Math.sin(a) * d;
      const idx = SnGridMath.indexAt(x, z);
      if (idx < 0 || !map.standable(idx)) continue;
      if (this.openShare(map, x, z, r) < SnBalance.STORM_MIN_OPEN) continue;
      return { x, z };
    }
    const fallback = map.nearestWalkable(prev.x, prev.z);
    return { x: SnGridMath.centerX(fallback), z: SnGridMath.centerZ(fallback) };
  }

  row(t: number): SnStormRow {
    const rows = SnBalance.STORM_ROWS;
    for (const row of rows) if (t < row.end) return row;
    return rows[rows.length - 1];
  }

  state(t: number): SnStormState {
    const row = this.row(t), radii = SnBalance.STORM_RADII;
    const a = this.centers[row.from], b = this.centers[row.to];
    const f = row.phase === "shrink" ? Math.min(1, Math.max(0, (t - row.start) / (row.end - row.start))) : 0;
    const r = radii[row.from] + (radii[row.to] - radii[row.from]) * f;
    const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
    const nextIndex = row.phase === "shrink" ? row.to : row.phase === "full" ? -1 : row.to + 1;
    const next = nextIndex > 0 && nextIndex < radii.length ? { x: this.centers[nextIndex].x, z: this.centers[nextIndex].z, r: radii[nextIndex] } : null;
    return { x, z, r, dps: row.dps, stage: row.stage, phase: row.phase, phaseEnd: row.end, next };
  }

  inside(t: number, x: number, z: number): boolean {
    const s = this.state(t);
    return Math.hypot(x - s.x, z - s.z) <= s.r;
  }
}

class SnMover {
  constructor(private readonly engine: SnEngine) {}

  paceAt(x: number, z: number): number { return this.engine.map.onIce(x, z) ? SnBalance.ICE_PACE : 1; }

  walk(p: SnPlayer, dirX: number, dirZ: number, dt: number): void {
    const v = p.speed * this.paceAt(p.x, p.z);
    this.move(p, dirX * v, dirZ * v, dt, false);
  }

  move(p: SnPlayer, vx: number, vz: number, dt: number, allowDrop: boolean): void {
    const dist = Math.hypot(vx, vz) * dt;
    if (dist < 1e-6) return;
    const steps = Math.max(1, Math.ceil(dist / 0.2));
    const sx = vx * dt / steps, sz = vz * dt / steps;
    for (let k = 0; k < steps; k++) this.step(p, sx, sz, allowDrop);
  }

  private step(p: SnPlayer, sx: number, sz: number, allowDrop: boolean): void {
    const options: Array<[number, number]> = [[sx, sz], [sx, 0], [0, sz]];
    for (const [dx, dz] of options) {
      if (Math.abs(dx) + Math.abs(dz) < 1e-9) continue;
      const spot = this.resolve(p, p.x + dx, p.z + dz);
      if (spot && this.canStand(p, spot.x, spot.z, allowDrop)) { p.x = spot.x; p.z = spot.z; return; }
    }
  }

  resolve(p: SnPlayer, x: number, z: number): SnPoint | null {
    const r = SnBalance.RADIUS, e = this.engine;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const o of e.map.obstaclesAround(x, z, r + 0.2)) {
        const out = o.pushOut(x, z, r);
        if (out) { x = out.x; z = out.z; moved = true; }
      }
      for (const w of e.walls) {
        if (!w.solid(e.time)) continue;
        const out = w.pushOut(x, z, r);
        if (out) { x = out.x; z = out.z; moved = true; }
      }
      for (const q of e.players) {
        if (q === p || q.life !== "alive") continue;
        const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz), need = r * 2;
        if (d >= need) continue;
        if (d < 1e-6) { x += need; moved = true; continue; }
        x = q.x + dx / d * need; z = q.z + dz / d * need; moved = true;
      }
      if (!moved) return { x, z };
    }
    return this.blocked(p, x, z) ? null : { x, z };
  }

  blocked(p: SnPlayer, x: number, z: number): boolean {
    const r = SnBalance.RADIUS - 0.02, e = this.engine;
    if (e.map.obstacleAt(x, z, r)) return true;
    for (const w of e.walls) if (w.solid(e.time) && w.distanceTo(x, z) < r) return true;
    for (const q of e.players) if (q !== p && q.life === "alive" && Math.hypot(q.x - x, q.z - z) < r * 2) return true;
    return false;
  }

  canStand(p: SnPlayer, x: number, z: number, allowDrop: boolean): boolean {
    const map = this.engine.map;
    const from = SnGridMath.indexAt(p.x, p.z), to = SnGridMath.indexAt(x, z);
    if (to < 0 || !map.walkable(to)) return false;
    if (from !== to && !this.reachable(from, to, allowDrop)) return false;
    const r = SnBalance.RADIUS;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      const s = SnGridMath.indexAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (s === to) continue;
      if (s < 0 || !map.connected(to, s, allowDrop)) return false;
    }
    return true;
  }

  private reachable(from: number, to: number, allowDrop: boolean): boolean {
    const map = this.engine.map;
    if (from < 0) return map.walkable(to);
    const di = Math.abs(SnGridMath.colOf(from) - SnGridMath.colOf(to)), dj = Math.abs(SnGridMath.rowOf(from) - SnGridMath.rowOf(to));
    if (di > 1 || dj > 1) return false;
    return map.connected(from, to, allowDrop);
  }

  placeFree(p: SnPlayer): void {
    if (!this.blocked(p, p.x, p.z) && this.canStand(p, p.x, p.z, false)) return;
    const taken = (idx: number) => this.blocked(p, SnGridMath.centerX(idx), SnGridMath.centerZ(idx));
    const idx = this.engine.map.nearestWalkable(p.x, p.z, taken);
    if (idx >= 0) { p.x = SnGridMath.centerX(idx); p.z = SnGridMath.centerZ(idx); }
  }
}

class SnSightLine {
  static clear(engine: SnEngine, x0: number, z0: number, x1: number, z1: number, level: number): boolean {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.4);
    for (let k = 1; k < n; k++) {
      const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
      if (engine.map.shotBlockedAt(x, z, level)) return false;
      for (const w of engine.walls) if (w.solid(engine.time) && w.distanceTo(x, z) < SnBalance.SHOT.radius) return false;
    }
    return true;
  }
}

class SnAutoAim {
  constructor(private readonly engine: SnEngine) {}

  target(me: SnPlayer): SnPlayer | null {
    const e = this.engine, level = e.map.levelAt(me.x, me.z);
    let best: SnPlayer | null = null, bd = Infinity, open: SnPlayer | null = null, od = Infinity;
    for (const o of e.players) {
      if (o.team === me.team || o.life !== "alive") continue;
      const d = Math.hypot(o.x - me.x, o.z - me.z);
      if (d > SnBalance.AIM.reach) continue;
      if (d < bd) { bd = d; best = o; }
      if (d < od && SnSightLine.clear(e, me.x, me.z, o.x, o.z, level)) { od = d; open = o; }
    }
    return open || best;
  }

  leadSpot(me: SnPlayer, t: SnPlayer, share: number): SnPoint {
    const e = this.engine;
    if (e.time - t.movedAt > SnBalance.AIM.moveMemory) return { x: t.x, z: t.z };
    const travel = Math.hypot(t.x - me.x, t.z - me.z) / SnBalance.SHOT.speed;
    return { x: t.x + t.vx * travel * share, z: t.z + t.vz * travel * share };
  }

  angle(me: SnPlayer): number {
    const t = this.target(me);
    if (!t) return me.yaw;
    const spot = this.leadSpot(me, t, SnBalance.AIM.lead);
    return SnAngle.toward(me.x, me.z, spot.x, spot.z) + (this.engine.random.next() - 0.5) * 2 * SnBalance.AIM.err;
  }
}

abstract class SnProjectile {
  x: number; z: number;
  traveled = 0;
  done = false;
  readonly dirX: number; readonly dirZ: number;
  constructor(readonly id: number, readonly owner: SnPlayer, x: number, z: number, readonly angle: number, readonly level: number) {
    this.x = x; this.z = z;
    this.dirX = Math.cos(angle); this.dirZ = Math.sin(angle);
  }
  abstract get big(): boolean;
  abstract step(engine: SnEngine, dt: number): void;
  protected finish(engine: SnEngine, why: SnShotEnd): void {
    this.done = true;
    engine.emit({ t: "shotEnd", id: this.id, x: this.x, z: this.z, why });
  }
}

class SnSnowball extends SnProjectile {
  get big(): boolean { return false; }

  step(engine: SnEngine, dt: number): void {
    const move = SnBalance.SHOT.speed * dt, n = Math.max(1, Math.ceil(move / 0.25)), part = move / n;
    for (let k = 0; k < n && !this.done; k++) {
      this.x += this.dirX * part; this.z += this.dirZ * part; this.traveled += part;
      if (engine.map.shotBlockedAt(this.x, this.z, this.level)) { this.finish(engine, "block"); return; }
      const allow = SnBalance.SHOT.range * SnHeightRules.rangeScale(this.level, engine.map.levelAt(this.x, this.z));
      if (this.traveled > allow) { this.finish(engine, "ground"); return; }
      for (const w of engine.walls) {
        if (!w.solid(engine.time) || w.distanceTo(this.x, this.z) >= SnBalance.SHOT.radius) continue;
        engine.combat.hurtWall(w, SnBalance.SHOT.damage, this.level);
        this.finish(engine, "wall");
        return;
      }
      for (const p of engine.players) {
        if (p.team === this.owner.team || p.life !== "alive") continue;
        if (Math.hypot(p.x - this.x, p.z - this.z) >= SnBalance.RADIUS + SnBalance.SHOT.radius) continue;
        engine.combat.hurt(p, this.owner, SnBalance.SHOT.damage, this.level);
        this.finish(engine, "player");
        return;
      }
    }
  }
}

class SnBigBall extends SnProjectile {
  private readonly struck = new Set<number>();
  private tile: number;
  constructor(id: number, owner: SnPlayer, x: number, z: number, angle: number, level: number) {
    super(id, owner, x, z, angle, level);
    this.tile = SnGridMath.indexAt(x, z);
  }
  get big(): boolean { return true; }

  step(engine: SnEngine, dt: number): void {
    const move = SnBalance.BIG.speed * dt, n = Math.max(1, Math.ceil(move / 0.25)), part = move / n;
    for (let k = 0; k < n && !this.done; k++) {
      const nx = this.x + this.dirX * part, nz = this.z + this.dirZ * part;
      const idx = SnGridMath.indexAt(nx, nz);
      if (idx < 0 || (idx !== this.tile && !this.rollsInto(engine.map, idx))) { this.finish(engine, "block"); return; }
      if (engine.map.obstacleAt(nx, nz, 0.3)) { this.finish(engine, "block"); return; }
      this.x = nx; this.z = nz; this.tile = idx; this.traveled += part;
      const level = engine.map.levelAt(this.x, this.z);
      for (const w of engine.walls) {
        if (!w.solid(engine.time) || w.distanceTo(this.x, this.z) >= SnBalance.BIG.radius) continue;
        engine.combat.hurtWall(w, SnBalance.BIG.wallDamage, level);
        this.finish(engine, "wall");
        return;
      }
      for (const p of engine.players) {
        if (p.team === this.owner.team || p.life !== "alive" || this.struck.has(p.num)) continue;
        if (Math.hypot(p.x - this.x, p.z - this.z) >= SnBalance.RADIUS + SnBalance.BIG.radius) continue;
        this.struck.add(p.num);
        if (engine.combat.hurt(p, this.owner, SnBalance.BIG.damage, level) > 0 && p.life === "alive") engine.combat.knock(p, this.dirX, this.dirZ);
      }
      if (this.traveled >= SnBalance.BIG.distance) { this.finish(engine, "ground"); return; }
    }
  }

  private rollsInto(map: SnMap, idx: number): boolean {
    if (this.tile < 0) return map.walkable(idx);
    const di = Math.abs(SnGridMath.colOf(idx) - SnGridMath.colOf(this.tile)), dj = Math.abs(SnGridMath.rowOf(idx) - SnGridMath.rowOf(this.tile));
    if (di > 1 || dj > 1) return false;
    if (di === 1 && dj === 1) {
      const a = SnGridMath.index(SnGridMath.colOf(idx), SnGridMath.rowOf(this.tile)), b = SnGridMath.index(SnGridMath.colOf(this.tile), SnGridMath.rowOf(idx));
      return (map.connected(this.tile, a, true) && map.connected(a, idx, true)) || (map.connected(this.tile, b, true) && map.connected(b, idx, true));
    }
    return map.connected(this.tile, idx, true);
  }
}

class SnCombat {
  constructor(private readonly engine: SnEngine) {}

  hurt(target: SnPlayer, attacker: SnPlayer | null, base: number, fromLevel: number): number {
    const e = this.engine;
    if (target.life !== "alive" || target.guarded(e.time)) return 0;
    let v = base;
    if (attacker) {
      const scale = (1 - SnGearRules.hatCut(target.gear[0])) * SnHeightRules.defenseScale(e.map.levelAt(target.x, target.z), fromLevel);
      v = Math.max(1, Math.round(base * scale));
    }
    target.hp -= v;
    target.lastHitAt = e.time;
    target.reviveTarget = -1; target.reviveProgress = 0;
    if (attacker) { attacker.dealt += v; target.lastHitFromX = attacker.x; target.lastHitFromZ = attacker.z; }
    e.emit({ t: "hit", to: target.num, by: attacker ? attacker.num : -1, v, storm: !attacker });
    if (target.hp <= 0) e.knockDown(target, attacker);
    return v;
  }

  hurtWall(w: SnWall, base: number, fromLevel: number): void {
    const e = this.engine;
    const v = Math.max(1, Math.round(base * SnHeightRules.defenseScale(w.level, fromLevel)));
    w.hp -= v;
    e.emit({ t: "wallHit", id: w.id, v });
    if (w.hp <= 0) e.removeWall(w, true);
  }

  knock(p: SnPlayer, dx: number, dz: number): void {
    const speed = SnBalance.BIG.knock / SnBalance.BIG.knockTime;
    p.knockX = dx * speed; p.knockZ = dz * speed; p.knockLeft = SnBalance.BIG.knockTime;
  }

  tryAttack(p: SnPlayer, angle: number | null): boolean {
    const e = this.engine;
    if (p.life !== "alive" || e.time < p.nextShotAt || p.building(e.time)) return false;
    const team = e.teams[p.team];
    if (!p.bigBall && team.snow < SnBalance.SHOT.cost) { e.emit({ t: "noSnow", id: p.num }); p.nextShotAt = e.time + SnBalance.SHOT.interval; return false; }
    const a = angle === null ? e.aim.angle(p) : angle;
    p.yaw = a;
    p.nextShotAt = e.time + SnBalance.SHOT.interval;
    const level = e.map.levelAt(p.x, p.z);
    const sx = p.x + Math.cos(a) * SnBalance.SHOT.spawn, sz = p.z + Math.sin(a) * SnBalance.SHOT.spawn;
    const id = e.nextId();
    let shot: SnProjectile;
    if (p.bigBall) { p.bigBall = false; shot = new SnBigBall(id, p, sx, sz, a, level); }
    else { team.snow -= SnBalance.SHOT.cost; shot = new SnSnowball(id, p, sx, sz, a, level); }
    e.shots.push(shot);
    e.emit({ t: "shot", id, by: p.num, x: sx, z: sz, a, big: shot.big, lv: level });
    return true;
  }
}

class SnWallWorks {
  constructor(private readonly engine: SnEngine) {}

  footprint(p: SnPlayer, facing: number): SnWall {
    const e = this.engine, d = SnBalance.WALL.distance;
    const x = p.x + Math.cos(facing) * d, z = p.z + Math.sin(facing) * d;
    return new SnWall(-1, p.team, p.num, x, z, facing, e.map.levelAt(p.x, p.z), e.time, e.time + SnBalance.WALL.buildTime);
  }

  fits(p: SnPlayer, w: SnWall, joined: readonly SnWall[] = []): boolean {
    const e = this.engine, map = e.map;
    const home = SnGridMath.indexAt(p.x, p.z);
    if (home < 0 || map.isRamp(home)) return false;
    const level = map.level[home];
    for (const pt of w.samplePoints()) {
      const idx = SnGridMath.indexAt(pt.x, pt.z);
      if (idx < 0 || !map.walkable(idx) || map.isRamp(idx) || map.level[idx] !== level) return false;
      if (map.obstacleAt(pt.x, pt.z, 0)) return false;
    }
    for (const other of e.walls) {
      if (joined.indexOf(other) >= 0) { if (w.spine(SnBalance.WALL.joinFree).some((pt) => other.distanceTo(pt.x, pt.z) < 0.02)) return false; continue; }
      for (const pt of w.samplePoints()) if (other.distanceTo(pt.x, pt.z) < 0.05) return false;
    }
    for (const q of e.players) {
      if (q === p || (q.life !== "alive" && q.life !== "down")) continue;
      if (w.distanceTo(q.x, q.z) < SnBalance.RADIUS) return false;
    }
    return true;
  }

  tryBuild(p: SnPlayer, angle: number | null): boolean {
    const e = this.engine;
    if (p.life !== "alive" || e.time < p.nextWallAt || p.building(e.time)) return false;
    const team = e.teams[p.team];
    if (team.snow < SnBalance.WALL.cost) { e.emit({ t: "noSnow", id: p.num }); return false; }
    const facing = angle === null ? p.yaw : angle;
    const plan = this.plan(p, facing);
    if (!plan) { e.emit({ t: "noWall", id: p.num }); return false; }
    const draft = plan.wall;
    const w = new SnWall(e.nextId(), p.team, p.num, draft.x, draft.z, draft.facing, draft.level, e.time, e.time + SnBalance.WALL.buildTime, draft.halfX);
    team.snow -= SnBalance.WALL.cost;
    p.walls++;
    p.yaw = facing;
    p.buildUntil = w.readyAt;
    p.buildingWall = w.id;
    p.nextWallAt = e.time + SnBalance.WALL.interval;
    const mine = e.walls.filter((x) => x.team === p.team).sort((a, b) => a.createdAt - b.createdAt);
    while (mine.length >= SnBalance.WALL.perTeam) e.removeWall(mine.shift() as SnWall, false);
    e.walls.push(w);
    e.emit({ t: "wall", id: w.id });
    return true;
  }

  private pushBack(w: SnWall, q: SnPlayer): SnPoint | null {
    if (w.distanceTo(q.x, q.z) >= SnBalance.RADIUS) return null;
    const fx = Math.cos(w.facing), fz = Math.sin(w.facing);
    const ahead = (q.x - w.x) * fx + (q.z - w.z) * fz, need = -(w.halfZ + SnBalance.RADIUS + 0.02);
    if (ahead <= need) return null;
    return { x: q.x + fx * (need - ahead), z: q.z + fz * (need - ahead) };
  }

  plan(p: SnPlayer, facing: number): { wall: SnWall; joined: SnWall[] } | null {
    const draft = this.footprint(p, facing);
    const options: Array<{ wall: SnWall; joined: SnWall[] }> = [];
    const ends = draft.ends();
    const firstA = this.nearestEnd(ends[0], null), firstB = this.nearestEnd(ends[1], null);
    const aFirst = !!firstA && (!firstB || firstA.gap <= firstB.gap);
    const lead = aFirst ? ends[0] : ends[1], tail = aFirst ? ends[1] : ends[0];
    const nearLead = aFirst ? firstA : firstB;
    if (nearLead) {
      const nearTail = this.nearestEnd(tail, nearLead.wall);
      if (nearTail) {
        const bridge = this.between(p, draft, nearLead.point, nearTail.point);
        if (bridge) options.push({ wall: bridge, joined: [nearLead.wall, nearTail.wall] });
      }
      options.push({ wall: this.attached(p, draft, lead, tail, nearLead.point), joined: [nearLead.wall] });
      if (nearTail) options.push({ wall: this.attached(p, draft, tail, lead, nearTail.point), joined: [nearTail.wall] });
    }
    options.push({ wall: draft, joined: [] });
    for (const option of options) if (this.behind(p, option.wall) && this.fits(p, option.wall, option.joined)) return option;
    for (const wall of this.alongCliff(p, facing)) if (this.behind(p, wall, 0) && this.fits(p, wall)) return { wall, joined: [] };
    return null;
  }

  private alongCliff(p: SnPlayer, facing: number): SnWall[] {
    const e = this.engine, map = e.map, home = SnGridMath.indexAt(p.x, p.z);
    if (home < 0) return [];
    const fx = Math.cos(facing), fz = Math.sin(facing), reach = SnBalance.WALL.distance + SnBalance.WALL.halfDepth + SnBalance.WALL.cliffReach;
    let last = home, hitX = 0, hitZ = 0, next = -1, found = false;
    for (let t = 0.2; t <= reach && !found; t += 0.1) {
      const x = p.x + fx * t, z = p.z + fz * t, idx = SnGridMath.indexAt(x, z);
      if (idx === last) continue;
      if (idx < 0 || !map.walkable(idx) || map.isRamp(idx) || map.level[idx] !== map.level[home]) { next = idx; hitX = x; hitZ = z; found = true; }
      else last = idx;
    }
    if (!found) return [];
    const lastCol = SnGridMath.colOf(last), lastRow = SnGridMath.rowOf(last);
    const nextCol = next >= 0 ? SnGridMath.colOf(next) : SnGridMath.col(hitX), nextRow = next >= 0 ? SnGridMath.rowOf(next) : SnGridMath.row(hitZ);
    const walls: SnWall[] = [];
    const level = map.levelAt(p.x, p.z), gap = SnBalance.WALL.halfDepth + 0.05;
    if (nextCol !== lastCol) {
      const sx = Math.sign(nextCol - lastCol), edgeX = Math.max(nextCol, lastCol) * SnGridMath.CELL - SnGridMath.HALF;
      for (const half of SnBalance.WALL.cliffLengths) walls.push(new SnWall(-1, p.team, p.num, edgeX - sx * gap, hitZ, sx > 0 ? 0 : Math.PI, level, e.time, e.time + SnBalance.WALL.buildTime, half));
    }
    if (nextRow !== lastRow) {
      const sz = Math.sign(nextRow - lastRow), edgeZ = Math.max(nextRow, lastRow) * SnGridMath.CELL - SnGridMath.HALF;
      for (const half of SnBalance.WALL.cliffLengths) walls.push(new SnWall(-1, p.team, p.num, hitX, edgeZ - sz * gap, sz > 0 ? Math.PI / 2 : -Math.PI / 2, level, e.time, e.time + SnBalance.WALL.buildTime, half));
    }
    return walls;
  }

  behind(p: SnPlayer, w: SnWall, margin: number = w.halfZ): boolean {
    const ahead = (p.x - w.x) * Math.cos(w.facing) + (p.z - w.z) * Math.sin(w.facing);
    return ahead <= -margin;
  }

  private nearestEnd(point: SnPoint, skip: SnWall | null): { wall: SnWall; point: SnPoint; gap: number } | null {
    let best: { wall: SnWall; point: SnPoint; gap: number } | null = null, bd = SnBalance.WALL.snap;
    for (const w of this.engine.walls) {
      if (w === skip) continue;
      for (const end of w.ends()) {
        const d = Math.hypot(end.x - point.x, end.z - point.z);
        if (d < bd) { bd = d; best = { wall: w, point: end, gap: d }; }
      }
    }
    return best;
  }

  private between(p: SnPlayer, draft: SnWall, from: SnPoint, to: SnPoint): SnWall | null {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length < SnBalance.WALL.minLength || length > SnBalance.WALL.maxLength) return null;
    const along = Math.atan2(to.z - from.z, to.x - from.x);
    let facing = along + Math.PI / 2;
    if (Math.cos(facing - draft.facing) < 0) facing += Math.PI;
    const half = length / 2 + SnBalance.WALL.joinOverlap;
    return new SnWall(-1, p.team, p.num, (from.x + to.x) / 2, (from.z + to.z) / 2, SnAngle.wrap(facing), draft.level, draft.createdAt, draft.readyAt, half);
  }

  private attached(p: SnPlayer, draft: SnWall, end: SnPoint, other: SnPoint, joint: SnPoint): SnWall {
    const len = Math.hypot(end.x - other.x, end.z - other.z) || 1;
    const ux = (end.x - other.x) / len, uz = (end.z - other.z) / len, over = SnBalance.WALL.joinOverlap;
    const dx = joint.x + ux * over - end.x, dz = joint.z + uz * over - end.z;
    return new SnWall(-1, p.team, p.num, draft.x + dx, draft.z + dz, draft.facing, draft.level, draft.createdAt, draft.readyAt, draft.halfX);
  }

  step(): void {
    const e = this.engine;
    for (const w of e.walls.slice()) {
      if (e.time >= w.expireAt) { e.removeWall(w, false); continue; }
      if (w.solid(e.time) && e.time - e.lastDt < w.readyAt) {
        for (const q of e.players) {
          if (q.life !== "alive") continue;
          const out = q.num === w.owner ? this.pushBack(w, q) : w.pushOut(q.x, q.z, SnBalance.RADIUS);
          if (out) { q.x = out.x; q.z = out.z; e.mover.placeFree(q); }
        }
      }
    }
  }
}

class SnLoot {
  constructor(private readonly engine: SnEngine) {}

  static deal(map: SnMap, random: SnSeededRandom): SnCrate[] {
    const spots = map.itemSpots.map((_, i) => i);
    for (let i = spots.length - 1; i > 0; i--) { const j = random.int(i + 1); const t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
    const chosen = spots.slice(0, SnBalance.CRATES.placed);
    const kinds: Array<"cocoa" | "big" | "gear"> = [];
    for (let k = 0; k < SnBalance.CRATES.cocoa; k++) kinds.push("cocoa");
    for (let k = 0; k < SnBalance.CRATES.big; k++) kinds.push("big");
    while (kinds.length < chosen.length) kinds.push("gear");
    for (let i = kinds.length - 1; i > 0; i--) { const j = random.int(i + 1); const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t; }
    return chosen.map((spot, n) => {
      const p = map.itemSpots[spot], key = map.keySpots[spot], kind = kinds[n];
      const item: SnItem = kind === "gear" ? { kind: "gear", slot: random.pick(SnBalance.GEAR_SLOTS), grade: SnGearRules.rollGrade(random, key) } : { kind };
      return new SnCrate(n, spot, p.x, p.z, key, item);
    });
  }

  canTake(p: SnPlayer, item: SnItem): boolean {
    if (item.kind === "cocoa") return p.hp < p.maxHp;
    if (item.kind === "big") return !p.bigBall;
    return SnGearRules.canEquip(p.gear[SnGearRules.slotIndex(item.slot)], item.grade);
  }

  apply(p: SnPlayer, item: SnItem): void {
    if (item.kind === "cocoa") { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * SnBalance.COCOA_RATIO); return; }
    if (item.kind === "big") { p.bigBall = true; return; }
    const slot = SnGearRules.slotIndex(item.slot);
    if (item.slot === "suit") {
      const before = SnGearRules.suitHp(p.gear[slot]);
      p.gear[slot] = item.grade;
      p.hp += SnGearRules.suitHp(item.grade) - before;
      return;
    }
    p.gear[slot] = item.grade;
  }

  step(): void {
    const e = this.engine;
    for (const c of e.crates) {
      if (c.taken) continue;
      for (const p of e.players) {
        if (p.life !== "alive" || Math.hypot(p.x - c.x, p.z - c.z) > SnBalance.CRATES.open) continue;
        const wasOpen = c.opened;
        c.opened = true;
        if (this.canTake(p, c.item)) {
          this.apply(p, c.item);
          c.taken = true;
          e.emit({ t: "crate", i: c.num, open: true, taken: true, by: p.num });
          break;
        }
        if (!wasOpen) e.emit({ t: "crate", i: c.num, open: true, taken: false, by: p.num });
      }
    }
    for (const pile of e.piles) {
      if (pile.taken) continue;
      for (const p of e.players) {
        if (p.life !== "alive" || Math.hypot(p.x - pile.x, p.z - pile.z) > SnBalance.SNOW.pileReach + SnBalance.RADIUS) continue;
        const team = e.teams[p.team], got = Math.min(SnBalance.SNOW.pile, team.room());
        if (got <= 0) continue;
        team.snow += got; p.collected += got; pile.taken = true;
        e.emit({ t: "pile", i: pile.num, by: p.num });
        break;
      }
    }
    for (const p of e.players) {
      if (p.life !== "alive") continue;
      const team = e.teams[p.team];
      const got = e.snow.take(SnGridMath.indexAt(p.x, p.z), team.room());
      if (got) { team.snow += got; p.collected += got; }
    }
  }
}

class SnReviveRules {
  constructor(private readonly engine: SnEngine) {}

  patient(p: SnPlayer): SnPlayer | null {
    const e = this.engine;
    let best: SnPlayer | null = null, bd = SnBalance.REVIVE.reach;
    for (const q of e.teams[p.team].members) {
      if (q === p || !q.canBeRevived()) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d <= bd) { bd = d; best = q; }
    }
    return best;
  }

  step(p: SnPlayer, holding: boolean, dt: number): boolean {
    const e = this.engine;
    const q = holding && e.mode === "duos" && p.life === "alive" ? this.patient(p) : null;
    if (!q) { p.reviveTarget = -1; p.reviveProgress = 0; return false; }
    if (p.reviveTarget !== q.num) { p.reviveTarget = q.num; p.reviveProgress = 0; }
    p.reviveProgress += dt;
    if (p.reviveProgress >= SnBalance.REVIVE.time) {
      q.life = "alive";
      q.hp = SnBalance.REVIVE.hp;
      q.guardUntil = e.time + SnBalance.REVIVE.guard;
      q.revivesUsed++;
      q.knockLeft = 0;
      e.mover.placeFree(q);
      p.reviveTarget = -1; p.reviveProgress = 0;
      e.emit({ t: "revive", id: q.num, by: p.num });
    }
    return true;
  }
}

class SnDropRules {
  constructor(private readonly engine: SnEngine) {}

  setup(): void {
    const e = this.engine;
    for (const t of e.teams) if (t.leader.bot) t.botPickAt = e.random.range(SnBalance.DROP.botPickMin, SnBalance.DROP.botPickMax);
  }

  randomTarget(): SnPoint {
    const e = this.engine, map = e.map;
    let total = 0;
    const weights: number[] = [];
    for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
      const w = map.kind[idx] === SnTile.FLAT ? (map.zone[idx] === "village" || map.zone[idx] === "lookout" ? SnBalance.DROP.keyWeight : 1) : 0;
      weights.push(w); total += w;
    }
    let roll = e.random.next() * total;
    for (let idx = 0; idx < SnGridMath.COUNT; idx++) { roll -= weights[idx]; if (roll < 0) return { x: SnGridMath.centerX(idx), z: SnGridMath.centerZ(idx) }; }
    return { x: 0, z: 0 };
  }

  choose(team: SnTeam, x: number, z: number): boolean {
    const e = this.engine, map = e.map;
    if (team.dropAt >= 0 || e.time > SnBalance.DROP.pickLimit + 1e-9) return false;
    const center = map.nearestWalkable(x, z);
    if (center < 0) return false;
    const cx = SnGridMath.centerX(center), cz = SnGridMath.centerZ(center);
    team.dropAt = e.time; team.dropX = cx; team.dropZ = cz;
    const used: SnPoint[] = [];
    for (const p of team.members) {
      let spot: SnPoint | null = null;
      for (let tries = 0; tries < 60 && !spot; tries++) {
        const a = e.random.range(0, Math.PI * 2), d = Math.sqrt(e.random.next()) * SnBalance.DROP.spread;
        const idx = SnGridMath.indexAt(cx + Math.cos(a) * d, cz + Math.sin(a) * d);
        if (idx < 0 || !map.standable(idx)) continue;
        const sx = SnGridMath.centerX(idx), sz = SnGridMath.centerZ(idx);
        if (used.some((u) => Math.hypot(u.x - sx, u.z - sz) < SnBalance.DROP.gap)) continue;
        spot = { x: sx, z: sz };
      }
      if (!spot) spot = { x: cx, z: cz };
      used.push(spot);
      p.spotX = spot.x; p.spotZ = spot.z; p.skyX = 0; p.skyZ = 0;
      p.x = spot.x; p.z = spot.z;
      p.landAt = e.time + SnBalance.DROP.time;
    }
    e.emit({ t: "drop", team: team.num, x: cx, z: cz });
    return true;
  }

  step(dt: number): void {
    const e = this.engine;
    for (const t of e.teams) {
      if (t.dropAt >= 0) continue;
      if ((t.botPickAt >= 0 && e.time >= t.botPickAt) || e.time >= SnBalance.DROP.pickLimit) {
        const spot = this.randomTarget();
        this.choose(t, spot.x, spot.z);
      }
    }
    for (const p of e.players) {
      if (p.life !== "sky" || p.landAt < 0) continue;
      const intent = e.intents[p.num];
      if (intent) {
        p.skyX += intent.moveX * SnBalance.DROP.steer * dt; p.skyZ += intent.moveZ * SnBalance.DROP.steer * dt;
        const len = Math.hypot(p.skyX, p.skyZ);
        if (len > SnBalance.DROP.steerMax) { p.skyX *= SnBalance.DROP.steerMax / len; p.skyZ *= SnBalance.DROP.steerMax / len; }
      }
      const edge = SnGridMath.HALF - 3;
      p.skyX = Math.max(-edge - p.spotX, Math.min(edge - p.spotX, p.skyX)); p.skyZ = Math.max(-edge - p.spotZ, Math.min(edge - p.spotZ, p.skyZ));
      p.x = p.spotX + p.skyX; p.z = p.spotZ + p.skyZ;
      if (e.time >= p.landAt) this.land(p);
    }
  }

  private land(p: SnPlayer): void {
    const e = this.engine;
    p.life = "alive";
    const idx = SnGridMath.indexAt(p.x, p.z);
    if (idx < 0 || !e.map.standable(idx)) { const near = e.map.nearestWalkable(p.x, p.z); if (near >= 0) { p.x = SnGridMath.centerX(near); p.z = SnGridMath.centerZ(near); } }
    e.mover.placeFree(p);
    e.emit({ t: "land", id: p.num });
  }
}

class SnStormRules {
  private nextTick = 0;
  private announced = new Set<string>();
  constructor(private readonly engine: SnEngine) {}

  step(): void {
    const e = this.engine;
    this.announce();
    if (e.time < this.nextTick) return;
    this.nextTick = (Math.floor(e.time / SnBalance.STORM_TICK) + 1) * SnBalance.STORM_TICK;
    const s = e.storm.state(e.time);
    if (s.dps <= 0) return;
    for (const p of e.players) {
      if (p.life !== "alive" || Math.hypot(p.x - s.x, p.z - s.z) <= s.r) continue;
      e.combat.hurt(p, null, s.dps * SnBalance.STORM_TICK, 0);
    }
  }

  private announce(): void {
    const e = this.engine;
    for (const row of SnBalance.STORM_ROWS) {
      if (row.phase !== "shrink" && row.phase !== "full") continue;
      if (row.phase === "shrink" && e.time >= row.start - SnBalance.STORM_WARN && !this.announced.has("w" + row.stage)) { this.announced.add("w" + row.stage); e.emit({ t: "storm", stage: row.stage, what: "warn" }); }
      if (e.time >= row.start && !this.announced.has("s" + row.stage)) { this.announced.add("s" + row.stage); e.emit({ t: "storm", stage: row.stage, what: row.phase === "full" ? "full" : "shrink" }); }
    }
  }
}

class SnScoreboard {
  static ranks(teams: readonly SnTeam[]): number[] {
    const order = teams.map((t) => (t.out ? t.outTick : Infinity));
    return order.map((mine) => 1 + order.filter((other) => other > mine).length);
  }
}

class SnIdleIntent {
  static make(): SnIntent { return { moveX: 0, moveZ: 0, attack: false, attackAngle: null, wall: false, wallAngle: null, holdK: false, dropPick: null }; }
}

class SnEngine {
  readonly map = SnMap.shared();
  readonly random: SnSeededRandom;
  readonly mode: SnMode;
  readonly players: SnPlayer[] = [];
  readonly teams: SnTeam[] = [];
  readonly shots: SnProjectile[] = [];
  readonly walls: SnWall[] = [];
  readonly crates: SnCrate[];
  readonly piles: SnPile[];
  readonly snow: SnSnowField;
  readonly storm: SnStormPlan;
  readonly mover = new SnMover(this);
  readonly aim = new SnAutoAim(this);
  readonly combat = new SnCombat(this);
  readonly wallWorks = new SnWallWorks(this);
  readonly loot = new SnLoot(this);
  readonly revive = new SnReviveRules(this);
  readonly drops = new SnDropRules(this);
  readonly stormRules = new SnStormRules(this);
  readonly pilots = new Map<number, SnPilot>();
  intents: SnIntent[] = [];
  time = 0;
  tick = 0;
  lastDt = 0;
  ended = false;
  endAt = -1;
  private events: SnEvent[] = [];
  private idCounter = 0;

  constructor(readonly config: SnEngineConfig) {
    this.random = new SnSeededRandom(config.seed);
    this.mode = config.mode;
    config.teams.forEach((rt, ti) => {
      const members = rt.members.map((m) => {
        const p = new SnPlayer(this.players.length, m.id, m.nick, ti, m.bot);
        this.players.push(p);
        return p;
      });
      this.teams.push(new SnTeam(ti, members));
    });
    this.snow = new SnSnowField(this.map);
    this.storm = new SnStormPlan(this.map, new SnSeededRandom(config.seed ^ 0x5bd1e995));
    const lootRandom = new SnSeededRandom(config.seed ^ 0x27d4eb2f);
    this.crates = SnLoot.deal(this.map, lootRandom);
    this.piles = this.map.pileSpots.map((p, i) => new SnPile(i, p.x, p.z));
    this.drops.setup();
  }

  nextId(): number { return ++this.idCounter; }
  emit(ev: SnEvent): void { this.events.push(ev); }
  attach(num: number, pilot: SnPilot): void { this.pilots.set(num, pilot); }
  teamOf(p: SnPlayer): SnTeam { return this.teams[p.team]; }
  chooseDrop(teamNum: number, x: number, z: number): boolean { return this.drops.choose(this.teams[teamNum], x, z); }

  update(dt: number): SnEvent[] {
    this.events = [];
    if (this.ended) return this.events;
    this.time += dt; this.tick++; this.lastDt = dt;
    this.intents = this.players.map((p) => {
      const pilot = this.pilots.get(p.num);
      return pilot && (p.life === "alive" || p.life === "sky") ? pilot.decide(this, p, dt) : SnIdleIntent.make();
    });
    for (const p of this.players) {
      const pick = this.intents[p.num].dropPick;
      if (pick && p.life === "sky" && this.teams[p.team].leader === p) this.drops.choose(this.teams[p.team], pick.x, pick.z);
    }
    this.drops.step(dt);
    for (const p of this.players) this.movePlayer(p, dt);
    for (const p of this.players) this.actPlayer(p, dt);
    for (const s of this.shots) s.step(this, dt);
    for (let k = this.shots.length - 1; k >= 0; k--) if (this.shots[k].done) this.shots.splice(k, 1);
    this.wallWorks.step();
    this.loot.step();
    this.stormRules.step();
    if (this.snow.changed.length) { this.emit({ t: "snow", tiles: this.snow.changed.slice() }); this.snow.changed.length = 0; }
    this.judge();
    return this.events;
  }

  private movePlayer(p: SnPlayer, dt: number): void {
    if (p.life !== "alive") { p.vx = 0; p.vz = 0; return; }
    const ox = p.x, oz = p.z;
    if (p.knockLeft > 0) {
      const step = Math.min(dt, p.knockLeft);
      this.mover.move(p, p.knockX, p.knockZ, step, true);
      p.knockLeft -= step;
    } else if (!p.building(this.time)) {
      const it = this.intents[p.num];
      let mx = it.moveX, mz = it.moveZ;
      const m = Math.hypot(mx, mz);
      if (m > 1) { mx /= m; mz /= m; }
      if (m > 0.05) {
        this.mover.walk(p, mx, mz, dt);
        p.yaw = Math.atan2(mz, mx);
      }
    }
    if (p.external && p.knockLeft <= 0) return;
    p.vx = (p.x - ox) / dt; p.vz = (p.z - oz) / dt;
    if (Math.hypot(p.vx, p.vz) > 0.1) p.movedAt = this.time;
  }

  placeExternal(num: number, x: number, z: number, yaw: number, elapsed: number): boolean {
    const p = this.players[num];
    if (!p || p.life !== "alive" || p.knockLeft > 0 || p.building(this.time)) return false;
    const jump = Math.hypot(x - p.x, z - p.z);
    if (jump > p.speed * Math.max(0.1, elapsed) * 1.6 + 0.6) return false;
    const old = { x: p.x, z: p.z };
    p.x = x; p.z = z;
    if (!this.mover.canStand(p, x, z, false) && this.mover.blocked(p, x, z)) { p.x = old.x; p.z = old.z; return false; }
    p.yaw = yaw;
    const span = Math.max(0.05, elapsed);
    p.vx = (x - old.x) / span; p.vz = (z - old.z) / span;
    if (jump > 0.05) p.movedAt = this.time;
    return true;
  }

  private actPlayer(p: SnPlayer, dt: number): void {
    if (p.life !== "alive") { p.reviveTarget = -1; p.reviveProgress = 0; return; }
    const it = this.intents[p.num];
    const reviving = this.revive.step(p, it.holdK, dt);
    if (reviving) return;
    if (it.wall) this.wallWorks.tryBuild(p, it.wallAngle);
    if (it.attack) this.combat.tryAttack(p, it.attackAngle);
    else if (it.holdK) this.combat.tryAttack(p, null);
  }

  knockDown(p: SnPlayer, by: SnPlayer | null): void {
    p.hp = 0;
    p.downAt = this.time;
    p.killedBy = by ? by.num : -1;
    p.knockLeft = 0;
    p.reviveTarget = -1; p.reviveProgress = 0;
    if (by && by.team !== p.team) by.kills++;
    if (p.building(this.time)) {
      const w = this.walls.find((x) => x.id === p.buildingWall);
      if (w) this.removeWall(w, false);
      p.buildUntil = 0;
    }
    p.life = this.mode === "solo" ? "out" : "down";
    this.emit({ t: "down", id: p.num, by: p.killedBy });
    for (const q of this.players) if (q.reviveTarget === p.num) { q.reviveTarget = -1; q.reviveProgress = 0; }
    this.checkTeam(this.teams[p.team]);
  }

  disconnect(num: number): void {
    const p = this.players[num];
    if (!p || p.life === "out") return;
    p.revivesUsed = SnBalance.REVIVE.max;
    if (p.life === "alive" || p.life === "sky") { p.hp = 0; p.downAt = this.time; p.life = this.mode === "solo" ? "out" : "down"; this.emit({ t: "down", id: p.num, by: -1 }); }
    this.checkTeam(this.teams[p.team]);
  }

  private checkTeam(t: SnTeam): void {
    if (t.out) return;
    if (t.members.some((m) => m.life === "alive" || m.life === "sky")) return;
    t.outTick = this.tick; t.outAt = this.time;
    for (const m of t.members) m.life = "out";
    this.emit({ t: "teamOut", team: t.num });
  }

  removeWall(w: SnWall, broken: boolean): void {
    const k = this.walls.indexOf(w);
    if (k < 0) return;
    this.walls.splice(k, 1);
    this.emit({ t: "wallGone", id: w.id, broken });
  }

  private judge(): void {
    const alive = this.teams.filter((t) => !t.out);
    if (alive.length <= 1 || this.time >= SnBalance.SAFETY_END) {
      this.ended = true;
      this.endAt = this.time;
      this.emit({ t: "end" });
    }
  }

  ranks(): number[] { return SnScoreboard.ranks(this.teams); }

  survival(p: SnPlayer): number {
    if (p.life === "out" || p.life === "down") return Math.max(0, p.downAt);
    return this.ended ? this.endAt : this.time;
  }

  stormNow(): SnStormState { return this.storm.state(this.time); }
}

class SnSnapshotCodec {
  static readonly LIVES: readonly SnLife[] = ["sky", "alive", "down", "out"];

  static encodePlayer(p: SnPlayer, time: number): string {
    const flags = (p.bigBall ? 1 : 0) | (p.building(time) ? 2 : 0) | (p.guarded(time) ? 4 : 0) | (p.knockLeft > 0 ? 8 : 0);
    return [
      Math.round(p.x * 100), Math.round(p.z * 100), Math.round(p.yaw * 100), SnSnapshotCodec.LIVES.indexOf(p.life),
      Math.round(p.hp * 10), p.gear[0], p.gear[1], p.gear[2], flags, p.kills, p.revivesUsed,
      p.reviveTarget, Math.round(p.reviveProgress * 10), Math.round(p.landAt * 10), p.killedBy,
    ].join(",");
  }

  static decodePlayer(s: string): { x: number; z: number; yaw: number; life: SnLife; hp: number; gear: number[]; bigBall: boolean; building: boolean; guarded: boolean; knocked: boolean; kills: number; revivesUsed: number; reviveTarget: number; reviveProgress: number; landAt: number; killedBy: number } {
    const v = s.split(",").map(Number);
    return {
      x: v[0] / 100, z: v[1] / 100, yaw: v[2] / 100, life: SnSnapshotCodec.LIVES[v[3]], hp: v[4] / 10,
      gear: [v[5], v[6], v[7]], bigBall: !!(v[8] & 1), building: !!(v[8] & 2), guarded: !!(v[8] & 4), knocked: !!(v[8] & 8),
      kills: v[9], revivesUsed: v[10], reviveTarget: v[11], reviveProgress: v[12] / 10, landAt: v[13] / 10, killedBy: v[14],
    };
  }

  static encodeTeams(teams: readonly SnTeam[]): string {
    return teams.map((t) => [t.snow, t.outTick, Math.round(t.dropAt * 10), Math.round(t.dropX * 10), Math.round(t.dropZ * 10)].join(":")).join(",");
  }
  static decodeTeams(s: string): Array<{ snow: number; outTick: number; dropAt: number; dropX: number; dropZ: number }> {
    return s.split(",").map((part) => { const v = part.split(":").map(Number); return { snow: v[0], outTick: v[1], dropAt: v[2] / 10, dropX: v[3] / 10, dropZ: v[4] / 10 }; });
  }

  static encodeWalls(walls: readonly SnWall[]): string {
    return walls.map((w) => [w.id, w.team, w.owner, Math.round(w.x * 100), Math.round(w.z * 100), Math.round(w.facing * 1000), w.level, Math.round(w.hp), Math.round(w.createdAt * 10), Math.round(w.readyAt * 10), Math.round(w.halfX * 100)].join(",")).join(";");
  }
  static decodeWalls(s: string): SnWall[] {
    if (!s) return [];
    return s.split(";").map((part) => {
      const v = part.split(",").map(Number);
      const w = new SnWall(v[0], v[1], v[2], v[3] / 100, v[4] / 100, v[5] / 1000, v[6], v[8] / 10, v[9] / 10, v[10] > 0 ? v[10] / 100 : SnBalance.WALL.halfLength);
      w.hp = v[7];
      return w;
    });
  }

  static encodeLoot(crates: readonly SnCrate[], piles: readonly SnPile[]): string {
    return crates.map((c) => (c.taken ? "2" : c.opened ? "1" : "0")).join("") + "|" + piles.map((p) => (p.taken ? "1" : "0")).join("");
  }
  static applyLoot(s: string, crates: readonly SnCrate[], piles: readonly SnPile[]): void {
    const [c, p] = s.split("|");
    crates.forEach((crate, k) => { crate.opened = c[k] !== "0"; crate.taken = c[k] === "2"; });
    piles.forEach((pile, k) => { pile.taken = (p || "")[k] === "1"; });
  }

  static encodeSnow(amount: Uint8Array): string {
    let text = "";
    for (let k = 0; k < amount.length; k += 6) {
      let bits = 0;
      for (let b = 0; b < 6; b++) if (k + b < amount.length && amount[k + b] > 0) bits |= 1 << b;
      text += SnSnapshotCodec.ALPHABET[bits];
    }
    return text;
  }
  static applySnow(s: string, amount: Uint8Array): number[] {
    const cleared: number[] = [];
    for (let k = 0; k < s.length; k++) {
      const bits = SnSnapshotCodec.ALPHABET.indexOf(s[k]);
      for (let b = 0; b < 6; b++) {
        const idx = k * 6 + b;
        if (idx >= amount.length) break;
        if (!(bits & (1 << b)) && amount[idx] > 0) { amount[idx] = 0; cleared.push(idx); }
      }
    }
    return cleared;
  }
  static readonly ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
}
