type WbLife = "alive" | "trapped" | "out";
type WbOutReason = "time" | "finish" | "sudden" | "left" | "clock";
type WbPhase = "countdown" | "play" | "ended";
type WbDifficulty = "easy" | "normal" | "hard";

interface WbIntent { move: number; alt: number; kPress: number }

interface WbPilot {
  readonly bot: boolean;
  decide(engine: WbEngine, me: WbPlayer, dt: number): WbIntent;
}

interface WbRosterMember { id: string; nick: string; bot: boolean }
interface WbRosterTeam { color: number; members: WbRosterMember[] }
interface WbHumanSeat { id: string; nick: string; slot: number }
interface WbEngineConfig { seed: number; lootSeed: number | null; mode: WbMode; teams: WbRosterTeam[] }
interface WbFloorItem { kind: string; grade: number; tick: number }
interface WbPickResult { gain: number; max: boolean }
interface WbMoveWorld { blocked(i: number, j: number, who: number): boolean; balloonAt(i: number, j: number): number }
interface WbBody { x: number; z: number }
interface WbMoveResult { moved: number; dir: number; kick: number }
interface WbProbe { mode: number; dir: number; room: number; slide: number; kick: number }

type WbEvent =
  | { t: "start" }
  | { t: "place"; id: number; by: number; i: number; j: number }
  | { t: "noPlace"; by: number }
  | { t: "kick"; id: number; by: number; dir: number }
  | { t: "slideStop"; id: number; i: number; j: number }
  | { t: "blast"; id: number; by: number; i: number; j: number; cells: number[]; wave: number }
  | { t: "boxBreak"; cell: number; by: number; kind: string | null; grade: number }
  | { t: "itemGone"; cell: number }
  | { t: "pick"; by: number; cell: number; kind: string; grade: number; gain: number; max: boolean }
  | { t: "trap"; id: number; by: number }
  | { t: "rescue"; id: number; by: number; needle: boolean }
  | { t: "finish"; id: number; by: number }
  | { t: "out"; id: number; by: number; why: WbOutReason }
  | { t: "sudden" }
  | { t: "suddenWarn"; cell: number; land: number }
  | { t: "suddenDrop"; cell: number }
  | { t: "end" };

class WbBalance {
  static readonly RATE = 30;
  static readonly DT = 1 / 30;
  static readonly MATCH = 180;
  static readonly COUNTDOWN = 3;
  static readonly FUSE = 2.8;
  static readonly PULSE = 0.8;
  static readonly PREVIEW = 0.3;
  static readonly FLOW = 0.5;
  static readonly TRAP = 5;
  static readonly TRAP_BLINK = 1.5;
  static readonly INVULN = 1;
  static readonly SHIELD = 5;
  static readonly SPEED_BASE = 2.8;
  static readonly SPEED_STEP = 0.4;
  static readonly SHOE_MAX = 5;
  static readonly TRAP_SPEED = 0.5;
  static readonly BALLOON_START = 1;
  static readonly BALLOON_MAX = 6;
  static readonly RANGE_START = 1;
  static readonly RANGE_MAX = 7;
  static readonly NEEDLE_MAX = 2;
  static readonly KICK_SPEED = 8;
  static readonly BODY = 0.35;
  static readonly SLIDE_LIMIT = 0.45;
  static readonly TURN_MEMORY = 0.25;
  static readonly CONTACT = 0.6;
  static readonly PICK_MARGIN = 0.05;
  static readonly STAT_GAIN: readonly number[] = [1, 2, 0];
  static readonly SUDDEN_START = 120;
  static readonly SUDDEN_SPAN = 59;
  static readonly SUDDEN_WARN = 1;
  static readonly FINAL_COUNT = 5;
  static readonly MIN_PLAYERS = 4;
  static readonly MAX_PLAYERS = 8;
  static readonly TEAM_COUNT = 4;
  static readonly TEAM_SIZE = 2;

  static ticks(seconds: number): number { return Math.round(seconds * WbBalance.RATE); }
}

class WbDir {
  static readonly NONE = -1;
  static readonly UP = 0;
  static readonly RIGHT = 1;
  static readonly DOWN = 2;
  static readonly LEFT = 3;
  static readonly DX: readonly number[] = [0, 1, 0, -1];
  static readonly DZ: readonly number[] = [-1, 0, 1, 0];

  static horizontal(d: number): boolean { return d === WbDir.RIGHT || d === WbDir.LEFT; }
  static sign(d: number): number { return d === WbDir.RIGHT || d === WbDir.DOWN ? 1 : -1; }
  static perpendicular(a: number, b: number): boolean { return a >= 0 && b >= 0 && WbDir.horizontal(a) !== WbDir.horizontal(b); }
}

class WbIdleIntent {
  static make(): WbIntent { return { move: WbDir.NONE, alt: WbDir.NONE, kPress: 0 }; }
}

class WbTurnBuffer {
  private held: number[] = [];
  private memory: { dir: number; until: number } | null = null;
  private pressedAt = new Map<number, WbBody>();

  press(dir: number, body: WbBody): void {
    if (this.held.indexOf(dir) >= 0) return;
    this.held.push(dir);
    this.pressedAt.set(dir, { x: body.x, z: body.z });
  }

  private lastGone: { dir: number; until: number } | null = null;

  release(dir: number, body: WbBody, now: number): void {
    const at = this.held.indexOf(dir);
    if (at < 0) return;
    const wasMove = at === this.held.length - 1;
    this.held.splice(at, 1);
    const start = this.pressedAt.get(dir);
    this.pressedAt.delete(dir);
    const progressed = !start || (WbDir.horizontal(dir) ? Math.abs(body.x - start.x) : Math.abs(body.z - start.z)) > 0.02;
    if (wasMove && !progressed && this.held.length) this.memory = { dir, until: now + WbBalance.TURN_MEMORY };
    else this.lastGone = { dir, until: now + WbBalance.TURN_MEMORY };
  }

  clear(): void { this.held = []; this.memory = null; this.lastGone = null; this.pressedAt.clear(); }

  read(now: number): { move: number; alt: number } {
    const top = this.held.length ? this.held[this.held.length - 1] : WbDir.NONE;
    if (this.memory && (now > this.memory.until || this.held.indexOf(this.memory.dir) >= 0 || !WbDir.perpendicular(this.memory.dir, top))) this.memory = null;
    if (this.memory) return { move: this.memory.dir, alt: top };
    for (let k = this.held.length - 2; k >= 0; k--) if (WbDir.perpendicular(this.held[k], top)) return { move: top, alt: this.held[k] };
    if (this.lastGone && (now > this.lastGone.until || this.held.indexOf(this.lastGone.dir) >= 0)) this.lastGone = null;
    const alt = this.lastGone && WbDir.perpendicular(this.lastGone.dir, top) ? this.lastGone.dir : WbDir.NONE;
    return { move: top, alt };
  }
}

class WbMover {
  static readonly EPS = 1e-7;
  static readonly MARKS: readonly number[] = [0.1, 0.35, 0.5, 0.65, 0.9];
  static readonly STOP = 0;
  static readonly GO = 1;
  static readonly SLIDE = 2;

  static nextMark(c: number, sign: number): number {
    const base = Math.floor(c), frac = c - base;
    let best = Infinity;
    for (let shift = -1; shift <= 1; shift++) for (const m of WbMover.MARKS) {
      const d = sign > 0 ? m + shift - frac : frac - (m + shift);
      if (d > WbMover.EPS && d < best) best = d;
    }
    return best;
  }

  static probe(world: WbMoveWorld, who: number, body: WbBody, d: number): WbProbe {
    const R = WbBalance.BODY, EPS = WbMover.EPS;
    const horiz = WbDir.horizontal(d), sign = WbDir.sign(d);
    const f = horiz ? body.x : body.z, s = horiz ? body.z : body.x;
    const cell = (fi: number, si: number): boolean => horiz ? world.blocked(fi, si, who) : world.blocked(si, fi, who);
    const front = f + sign * R;
    const boundary = sign > 0 ? Math.ceil(front - EPS) : Math.floor(front + EPS);
    const ahead = sign > 0 ? boundary : boundary - 1;
    const gap = sign > 0 ? boundary - front : front - boundary;
    const go: WbProbe = { mode: WbMover.GO, dir: d, room: WbMover.nextMark(f, sign), slide: 0, kick: WbDir.NONE };
    if (gap > EPS) return go;
    const lo = Math.floor(s - R + EPS), hi = Math.floor(s + R - EPS);
    const blockLo = cell(ahead, lo), blockHi = cell(ahead, hi);
    const own = Math.floor(s);
    const kickable = (): number => {
      const balloon = horiz ? world.balloonAt(ahead, own) : world.balloonAt(own, ahead);
      return balloon >= 0 && cell(ahead, own) ? d : WbDir.NONE;
    };
    const stop: WbProbe = { mode: WbMover.STOP, dir: d, room: 0, slide: 0, kick: WbDir.NONE };
    if (lo === hi || (blockLo && blockHi)) {
      if (!blockLo && !blockHi) return go;
      stop.kick = kickable();
      return stop;
    }
    if (!blockLo && !blockHi) return go;
    const overlap = blockLo ? (lo + 1) - (s - R) : (s + R) - hi;
    if (overlap > WbBalance.SLIDE_LIMIT + EPS) { stop.kick = kickable(); return stop; }
    const slide = blockLo ? 1 : -1;
    return { mode: WbMover.SLIDE, dir: d, room: WbMover.nextMark(s, slide), slide, kick: WbDir.NONE };
  }

  static advance(world: WbMoveWorld, who: number, body: WbBody, move: number, alt: number, distance: number): WbMoveResult {
    const result: WbMoveResult = { moved: 0, dir: move, kick: WbDir.NONE };
    if (move < 0) return result;
    let remaining = distance;
    for (let guard = 0; guard < 400 && remaining > WbMover.EPS; guard++) {
      let p = WbMover.probe(world, who, body, move);
      if (p.mode === WbMover.STOP) {
        if (p.kick >= 0) result.kick = p.kick;
        if (WbDir.perpendicular(alt, move)) p = WbMover.probe(world, who, body, alt);
      }
      if (p.mode === WbMover.STOP || p.room <= WbMover.EPS) break;
      const step = Math.min(remaining, p.room);
      const horiz = WbDir.horizontal(p.dir);
      if (p.mode === WbMover.GO) {
        if (horiz) body.x += WbDir.sign(p.dir) * step; else body.z += WbDir.sign(p.dir) * step;
      } else if (horiz) body.z += p.slide * step; else body.x += p.slide * step;
      remaining -= step;
      result.moved += step;
      result.dir = p.dir;
    }
    WbMover.snap(body);
    return result;
  }

  static snap(body: WbBody): void {
    body.x = Math.round(body.x * 1e6) / 1e6;
    body.z = Math.round(body.z * 1e6) / 1e6;
  }

  static overlapsCell(body: WbBody, i: number, j: number): boolean {
    const R = WbBalance.BODY - WbMover.EPS;
    return body.x + R > i && body.x - R < i + 1 && body.z + R > j && body.z - R < j + 1;
  }
}

class WbPlayer {
  x = 0;
  z = 0;
  face = WbDir.DOWN;
  life: WbLife = "alive";
  balloonsMax = WbBalance.BALLOON_START;
  range = WbBalance.RANGE_START;
  shoe = 0;
  needles = 0;
  kick = false;
  trapUntil = 0;
  trapOwner = -1;
  invulnUntil = -1;
  shieldUntil = -1;
  kSeen = 0;
  outTick = -1;
  outWhy: WbOutReason | null = null;
  disconnected = false;
  moving = false;
  spawn = 0;
  traps = 0;
  kills = 0;
  rescues = 0;
  boxes = 0;
  selfKills = 0;

  constructor(readonly index: number, readonly id: string, readonly nick: string, readonly bot: boolean, readonly team: number) {}

  get cellI(): number { return Math.floor(this.x); }
  get cellJ(): number { return Math.floor(this.z); }
  get cell(): number { return WbGrid.index(this.cellI, this.cellJ); }
  get standing(): boolean { return this.life !== "out"; }
  speed(): number { return this.life === "trapped" ? WbBalance.TRAP_SPEED : WbBalance.SPEED_BASE + WbBalance.SPEED_STEP * this.shoe; }
  invulnerable(tick: number): boolean { return tick < this.invulnUntil || tick < this.shieldUntil; }
}

class WbBalloon {
  x: number;
  z: number;
  slideDir = WbDir.NONE;
  readonly passers = new Set<number>();

  constructor(readonly id: number, readonly owner: number, i: number, j: number, readonly placedAt: number, readonly explodeAt: number, readonly range: number) {
    this.x = i + 0.5;
    this.z = j + 0.5;
  }

  get i(): number { return Math.floor(this.x); }
  get j(): number { return Math.floor(this.z); }
  get cell(): number { return WbGrid.index(this.i, this.j); }
}

abstract class WbItem {
  constructor(readonly kind: string, readonly grade: number) {}
  abstract apply(p: WbPlayer, tick: number): WbPickResult;
}

abstract class WbStatItem extends WbItem {
  protected abstract read(p: WbPlayer): number;
  protected abstract write(p: WbPlayer, value: number): void;
  protected abstract cap(): number;

  apply(p: WbPlayer): WbPickResult {
    const before = this.read(p);
    const after = Math.min(this.cap(), before + WbBalance.STAT_GAIN[this.grade]);
    this.write(p, after);
    return { gain: after - before, max: after === before };
  }
}

class WbBalloonItem extends WbStatItem {
  protected read(p: WbPlayer): number { return p.balloonsMax; }
  protected write(p: WbPlayer, v: number): void { p.balloonsMax = v; }
  protected cap(): number { return WbBalance.BALLOON_MAX; }
}

class WbRangeItem extends WbStatItem {
  protected read(p: WbPlayer): number { return p.range; }
  protected write(p: WbPlayer, v: number): void { p.range = v; }
  protected cap(): number { return WbBalance.RANGE_MAX; }
}

class WbShoeItem extends WbStatItem {
  protected read(p: WbPlayer): number { return p.shoe; }
  protected write(p: WbPlayer, v: number): void { p.shoe = v; }
  protected cap(): number { return WbBalance.SHOE_MAX; }
}

class WbNeedleItem extends WbItem {
  apply(p: WbPlayer): WbPickResult {
    if (p.needles >= WbBalance.NEEDLE_MAX) return { gain: 0, max: true };
    p.needles++;
    return { gain: 1, max: false };
  }
}

class WbKickItem extends WbItem {
  apply(p: WbPlayer): WbPickResult {
    if (p.kick) return { gain: 0, max: true };
    p.kick = true;
    return { gain: 1, max: false };
  }
}

class WbMaxRangeItem extends WbItem {
  apply(p: WbPlayer): WbPickResult {
    const gain = WbBalance.RANGE_MAX - p.range;
    p.range = WbBalance.RANGE_MAX;
    return { gain, max: gain === 0 };
  }
}

class WbShieldItem extends WbItem {
  apply(p: WbPlayer, tick: number): WbPickResult {
    p.shieldUntil = tick + WbBalance.ticks(WbBalance.SHIELD);
    return { gain: WbBalance.SHIELD, max: false };
  }
}

class WbLootTable {
  static readonly KINDS: readonly string[] = ["balloon", "range", "shoe", "needle", "kick", "maxRange", "shield"];
  static readonly BY_GRADE: readonly (readonly string[])[] = [
    ["balloon", "range", "shoe"],
    ["balloon", "range", "shoe", "needle"],
    ["kick", "maxRange", "shield"],
  ];
  static readonly FACTORIES: Readonly<Record<string, (grade: number) => WbItem>> = {
    balloon: (g) => new WbBalloonItem("balloon", g),
    range: (g) => new WbRangeItem("range", g),
    shoe: (g) => new WbShoeItem("shoe", g),
    needle: (g) => new WbNeedleItem("needle", g),
    kick: (g) => new WbKickItem("kick", g),
    maxRange: (g) => new WbMaxRangeItem("maxRange", g),
    shield: (g) => new WbShieldItem("shield", g),
  };

  static create(kind: string, grade: number): WbItem { return WbLootTable.FACTORIES[kind](grade); }
  static allows(kind: string, grade: number): boolean { return WbLootTable.BY_GRADE[grade].indexOf(kind) >= 0; }
}

class WbSuddenDeath {
  readonly order: number[] = [];
  readonly warnAt: number[] = [];
  readonly landAt: number[] = [];

  constructor(readonly flip: number) {
    const W = WbGrid.W, H = WbGrid.H;
    for (let r = 0; r * 2 < Math.min(W, H); r++) {
      const ring: number[] = [];
      const i0 = r, j0 = r, i1 = W - 1 - r, j1 = H - 1 - r;
      for (let i = i0; i <= i1; i++) ring.push(WbGrid.index(i, j0));
      for (let j = j0 + 1; j <= j1; j++) ring.push(WbGrid.index(i1, j));
      if (j1 > j0) for (let i = i1 - 1; i >= i0; i--) ring.push(WbGrid.index(i, j1));
      if (i1 > i0) for (let j = j1 - 1; j > j0; j--) ring.push(WbGrid.index(i0, j));
      for (const k of ring) if (!WbGrid.isPillarSpot(WbGrid.col(k), WbGrid.row(k)) && !WbSuddenDeath.safe(k)) this.order.push(WbSuddenDeath.mirror(k, flip));
    }
    const n = this.order.length;
    this.order.forEach((_, k) => {
      const warn = WbBalance.SUDDEN_START + (n > 1 ? k * WbBalance.SUDDEN_SPAN / (n - 1) : 0);
      this.warnAt.push(WbBalance.ticks(warn));
      this.landAt.push(WbBalance.ticks(warn + WbBalance.SUDDEN_WARN));
    });
  }

  static mirror(k: number, flip: number): number {
    const i = WbGrid.col(k), j = WbGrid.row(k);
    return WbGrid.index(flip & 1 ? WbGrid.W - 1 - i : i, flip & 2 ? WbGrid.H - 1 - j : j);
  }

  static safe(k: number): boolean {
    const i = WbGrid.col(k), j = WbGrid.row(k);
    return i >= 5 && i <= 9 && j >= 5 && j <= 7;
  }

  doomedSoon(cell: number, tick: number): number {
    const at = this.order.indexOf(cell);
    return at >= 0 && this.warnAt[at] <= tick ? this.landAt[at] : -1;
  }
}

class WbRosterPlanner {
  static botMember(n: number): WbRosterMember { return { id: "bot" + n, nick: "봇 " + n, bot: true }; }

  static allBots(mode: WbMode, count: number): WbRosterTeam[] {
    let n = 0;
    const next = (): WbRosterMember => WbRosterPlanner.botMember(++n);
    if (mode === "solo") return Array.from({ length: count }, (_, k) => ({ color: k, members: [next()] }));
    return Array.from({ length: Math.max(2, Math.min(4, Math.round(count / 2))) }, (_, t) => ({ color: t, members: [next(), next()] }));
  }

  static fill(mode: WbMode, humans: readonly WbHumanSeat[], extraBots: readonly number[]): WbRosterTeam[] {
    let n = 0;
    const next = (): WbRosterMember => WbRosterPlanner.botMember(++n);
    if (mode === "solo") {
      const seats: Array<WbRosterMember | null> = Array.from({ length: WbBalance.MAX_PLAYERS }, () => null);
      for (const h of humans) if (h.slot >= 0 && h.slot < seats.length && !seats[h.slot]) seats[h.slot] = { id: h.id, nick: h.nick, bot: false };
      for (const slot of extraBots) if (slot >= 0 && slot < seats.length && !seats[slot]) seats[slot] = next();
      let filled = seats.filter((s) => s).length;
      for (let slot = 0; slot < seats.length && filled < WbBalance.MIN_PLAYERS; slot++) if (!seats[slot]) { seats[slot] = next(); filled++; }
      return seats.map((m, color) => m ? { color, members: [m] } : null).filter((t): t is WbRosterTeam => t !== null);
    }
    const byTeam: WbRosterMember[][] = [[], [], [], []];
    for (const h of humans) {
      const t = Math.floor(h.slot / WbBalance.TEAM_SIZE);
      if (t >= 0 && t < WbBalance.TEAM_COUNT && byTeam[t].length < WbBalance.TEAM_SIZE) byTeam[t].push({ id: h.id, nick: h.nick, bot: false });
    }
    const used = byTeam.map((m) => m.length > 0);
    for (const t of extraBots) if (t >= 0 && t < WbBalance.TEAM_COUNT && !used[t]) used[t] = true;
    for (let t = 0; t < WbBalance.TEAM_COUNT; t++) if (used[t]) while (byTeam[t].length < WbBalance.TEAM_SIZE) byTeam[t].push(next());
    let total = byTeam.reduce((sum, m) => sum + m.length, 0);
    for (let t = 0; t < WbBalance.TEAM_COUNT && total < WbBalance.MIN_PLAYERS; t++) {
      if (byTeam[t].length) continue;
      byTeam[t].push(next(), next());
      total += 2;
    }
    return byTeam.map((members, color) => ({ color, members })).filter((t) => t.members.length > 0);
  }
}

class WbScoreboard {
  static ranks(engine: WbEngine): number[] {
    const survival = (p: WbPlayer): number => p.life === "out" ? p.outTick : Infinity;
    if (engine.mode === "solo") {
      return engine.players.map((p) => 1 + engine.players.filter((q) => survival(q) > survival(p)).length);
    }
    const teams = engine.teamColors();
    const score = (color: number): number[] => {
      const members = engine.players.filter((p) => p.team === color);
      const alive = members.filter((p) => p.life !== "out").length;
      return [alive, Math.max(...members.map(survival))];
    };
    const better = (a: number[], b: number[]): boolean => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
    const teamRank = new Map<number, number>();
    for (const c of teams) teamRank.set(c, 1 + teams.filter((o) => better(score(o), score(c))).length);
    return engine.players.map((p) => teamRank.get(p.team) as number);
  }
}

class WbBlast {
  static spread(engine: WbEngine, first: WbBalloon): void {
    const queue: WbBalloon[] = [first];
    const done = new Set<number>();
    let wave = 0;
    while (queue.length) {
      const b = queue.shift() as WbBalloon;
      if (done.has(b.id)) continue;
      done.add(b.id);
      engine.removeBalloon(b);
      const cells = WbBlast.cross(engine, b);
      for (const k of cells) {
        const other = engine.balloonIdAt(k);
        if (other >= 0 && !done.has(other)) queue.push(engine.balloonById(other) as WbBalloon);
      }
      engine.wet(b, cells, wave++);
    }
  }

  static cross(engine: WbEngine, b: WbBalloon): number[] {
    const cells = [b.cell];
    for (let d = 0; d < 4; d++) {
      for (let s = 1; s <= b.range; s++) {
        const i = b.i + WbDir.DX[d] * s, j = b.j + WbDir.DZ[d] * s;
        if (!WbGrid.inside(i, j) || engine.grid.solid(i, j)) break;
        cells.push(WbGrid.index(i, j));
        if (engine.grid.kind(i, j) === WbCell.BOX) break;
      }
    }
    return cells;
  }
}

class WbTrapRules {
  static trap(engine: WbEngine, p: WbPlayer, owner: number): void {
    p.life = "trapped";
    p.trapUntil = engine.tick + WbBalance.ticks(WbBalance.TRAP);
    p.trapOwner = owner;
    const by = owner >= 0 ? engine.players[owner] : null;
    if (by && by !== p && !engine.allies(by, p)) by.traps++;
    engine.emit({ t: "trap", id: p.index, by: owner });
  }

  static release(engine: WbEngine, p: WbPlayer, by: number, needle: boolean): void {
    p.life = "alive";
    p.invulnUntil = engine.tick + WbBalance.ticks(WbBalance.INVULN);
    p.trapOwner = -1;
    engine.emit({ t: "rescue", id: p.index, by, needle });
  }

  static contacts(engine: WbEngine): void {
    const trapped = engine.players.filter((p) => p.life === "trapped");
    const helpers = engine.players.filter((p) => p.life === "alive");
    for (const t of trapped) {
      const touching = helpers.filter((h) => h !== t && Math.hypot(h.x - t.x, h.z - t.z) <= WbBalance.CONTACT + 1e-9);
      if (!touching.length) continue;
      const friend = touching.find((h) => engine.allies(h, t));
      if (friend) {
        friend.rescues++;
        WbTrapRules.release(engine, t, friend.index, false);
        continue;
      }
      touching.sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z) || a.index - b.index);
      const finisher = touching[0];
      finisher.kills++;
      engine.emit({ t: "finish", id: t.index, by: finisher.index });
      engine.knockOut(t, finisher.index, "finish");
    }
  }

  static expire(engine: WbEngine): void {
    for (const p of engine.players) {
      if (p.life !== "trapped" || engine.tick < p.trapUntil) continue;
      WbTrapRules.creditTimeout(engine, p);
      engine.knockOut(p, p.trapOwner, "time");
    }
  }

  static creditTimeout(engine: WbEngine, p: WbPlayer): void {
    const owner = p.trapOwner >= 0 ? engine.players[p.trapOwner] : null;
    if (!owner) return;
    if (owner === p) p.selfKills++;
    else if (!engine.allies(owner, p)) owner.kills++;
  }
}

class WbEngine implements WbMoveWorld {
  readonly mode: WbMode;
  readonly seed: number;
  readonly grid: WbGrid;
  readonly players: WbPlayer[] = [];
  readonly balloons: WbBalloon[] = [];
  readonly floor = new Map<number, WbFloorItem>();
  readonly hidden: Map<number, WbHiddenLoot>;
  readonly breaking = new Map<number, { at: number; by: number }>();
  readonly wetUntil = new Int32Array(WbGrid.COUNT).fill(-1);
  readonly wetOwner = new Int16Array(WbGrid.COUNT).fill(-1);
  readonly balloonCell = new Int16Array(WbGrid.COUNT).fill(-1);
  readonly sudden: WbSuddenDeath;
  readonly report: WbFairReport;
  readonly groups: WbSpawnGroup[];
  readonly pilots = new Map<number, WbPilot>();
  tick = -WbBalance.ticks(WbBalance.COUNTDOWN);
  ended = false;
  ranks: number[] = [];
  private nextBalloon = 1;
  private suddenCursor = 0;
  private warnCursor = 0;
  private events: WbEvent[] = [];
  private carry = 0;

  constructor(config: WbEngineConfig) {
    this.mode = config.mode;
    this.seed = config.seed;
    this.sudden = new WbSuddenDeath(new WbSeededRandom(config.seed ^ 0x5DD).int(4));
    const spawnRng = new WbSeededRandom(config.seed ^ 0x51A7);
    const layoutRng = new WbSeededRandom(config.seed ^ 0x2B0C);
    const teams = config.teams;
    this.groups = config.mode === "solo"
      ? WbSpawnPlan.solo(teams.length, spawnRng)
      : WbSpawnPlan.team(teams.length, spawnRng);
    const lootRng = config.lootSeed === null ? null : new WbSeededRandom(config.lootSeed);
    const layout = new WbFairBoxLayout(this.groups, layoutRng).build(lootRng ? WbLootTable.BY_GRADE : null, lootRng);
    this.grid = layout.grid;
    this.hidden = layout.loot || new Map<number, WbHiddenLoot>();
    this.report = layout.report;
    const groupOrder = spawnRng.shuffle(this.groups.map((_, k) => k));
    teams.forEach((team, t) => {
      const group = this.groups[groupOrder[t]];
      const spotOrder = spawnRng.shuffle(group.spots.map((_, k) => k));
      team.members.forEach((m, k) => {
        const p = new WbPlayer(this.players.length, m.id, m.nick, m.bot, team.color);
        const spot = group.spots[spotOrder[k % group.spots.length]];
        p.x = spot.i + 0.5; p.z = spot.j + 0.5;
        p.spawn = WbSpawnPlan.CORNERS.concat(WbSpawnPlan.SIDES).findIndex((s) => s.i === spot.i && s.j === spot.j);
        this.players.push(p);
      });
    });
  }

  get phase(): WbPhase { return this.ended ? "ended" : this.tick < 0 ? "countdown" : "play"; }
  get seconds(): number { return this.tick / WbBalance.RATE; }
  get tickTime(): number { return this.tick + this.carry * WbBalance.RATE; }
  get endTick(): number { return WbBalance.ticks(WbBalance.MATCH); }

  attach(index: number, pilot: WbPilot): void { this.pilots.set(index, pilot); }
  emit(ev: WbEvent): void { this.events.push(ev); }
  allies(a: WbPlayer, b: WbPlayer): boolean { return this.mode === "team" && a.team === b.team; }
  teamColors(): number[] { return Array.from(new Set(this.players.map((p) => p.team))); }

  blocked(i: number, j: number, who: number): boolean {
    if (this.grid.blocked(i, j)) return true;
    const id = this.balloonCell[WbGrid.index(i, j)];
    if (id < 0) return false;
    const b = this.balloonById(id);
    return !b || !b.passers.has(who);
  }

  balloonAt(i: number, j: number): number { return WbGrid.inside(i, j) ? this.balloonCell[WbGrid.index(i, j)] : -1; }
  balloonIdAt(cell: number): number { return this.balloonCell[cell]; }
  balloonById(id: number): WbBalloon | null { return this.balloons.find((b) => b.id === id) || null; }
  activeBalloons(owner: number): number { return this.balloons.filter((b) => b.owner === owner).length; }
  isWet(cell: number): boolean { return this.wetUntil[cell] > this.tick; }

  removeBalloon(b: WbBalloon): void {
    const at = this.balloons.indexOf(b);
    if (at >= 0) this.balloons.splice(at, 1);
    if (this.balloonCell[b.cell] === b.id) this.balloonCell[b.cell] = -1;
  }

  wet(b: WbBalloon, cells: number[], wave: number): void {
    const until = this.tick + WbBalance.ticks(WbBalance.FLOW);
    for (const k of cells) {
      if (until >= this.wetUntil[k]) { this.wetUntil[k] = until; this.wetOwner[k] = b.owner; }
      if (this.grid.cells[k] === WbCell.BOX && !this.breaking.has(k)) {
        this.breaking.set(k, { at: until, by: b.owner });
        const owner = this.players[b.owner];
        if (owner) owner.boxes++;
      }
      const item = this.floor.get(k);
      if (item && item.tick < this.tick) { this.floor.delete(k); this.emit({ t: "itemGone", cell: k }); }
    }
    this.emit({ t: "blast", id: b.id, by: b.owner, i: b.i, j: b.j, cells, wave });
  }

  knockOut(p: WbPlayer, by: number, why: WbOutReason): void {
    if (p.life === "out") return;
    p.life = "out";
    p.outTick = this.tick;
    p.outWhy = why;
    this.emit({ t: "out", id: p.index, by, why });
  }

  disconnect(index: number): void {
    const p = this.players[index];
    if (!p || p.life === "out") return;
    p.disconnected = true;
    this.knockOut(p, -1, "left");
  }

  update(dt: number): WbEvent[] {
    this.carry += Math.min(dt, 0.25);
    const all: WbEvent[] = [];
    while (this.carry >= WbBalance.DT - 1e-9 && !this.ended) {
      this.carry -= WbBalance.DT;
      all.push(...this.step());
    }
    return all;
  }

  step(): WbEvent[] {
    this.events = [];
    if (this.ended) return this.events;
    const intents = this.players.map((p) => {
      const pilot = this.pilots.get(p.index);
      return pilot && p.life !== "out" ? pilot.decide(this, p, WbBalance.DT) : WbIdleIntent.make();
    });
    if (this.tick < 0) {
      this.players.forEach((p, k) => { p.kSeen = Math.max(p.kSeen, intents[k].kPress); });
      this.tick++;
      if (this.tick === 0) this.emit({ t: "start" });
      return this.events;
    }
    this.movePlayers(intents);
    this.pressKeys(intents);
    this.slideBalloons();
    this.explode();
    this.trapInWater();
    WbTrapRules.contacts(this);
    WbTrapRules.expire(this);
    this.dropBlocks();
    this.revealAndPick();
    this.judge();
    this.tick++;
    return this.events;
  }

  private movePlayers(intents: WbIntent[]): void {
    for (const p of this.players) {
      if (p.life === "out") continue;
      const intent = intents[p.index];
      const result = WbMover.advance(this, p.index, p, intent.move, intent.alt, p.speed() * WbBalance.DT);
      p.moving = result.moved > 0;
      if (intent.move >= 0) p.face = result.moved > 0 ? result.dir : intent.move;
      if (result.kick >= 0 && p.kick && p.life === "alive") this.startKick(p, result.kick);
      for (const b of this.balloons) if (b.passers.has(p.index) && !WbMover.overlapsCell(p, b.i, b.j)) b.passers.delete(p.index);
    }
  }

  private startKick(p: WbPlayer, dir: number): void {
    const i = p.cellI + WbDir.DX[dir], j = p.cellJ + WbDir.DZ[dir];
    const id = this.balloonAt(i, j);
    const b = id >= 0 ? this.balloonById(id) : null;
    if (!b || b.slideDir >= 0 || !this.canSlideInto(b, dir)) return;
    b.slideDir = dir;
    this.emit({ t: "kick", id: b.id, by: p.index, dir });
  }

  private canSlideInto(b: WbBalloon, dir: number): boolean {
    const i = b.i + WbDir.DX[dir], j = b.j + WbDir.DZ[dir];
    if (this.grid.blocked(i, j) || this.balloonAt(i, j) >= 0) return false;
    const k = WbGrid.index(i, j);
    if (this.floor.has(k)) return false;
    return !this.players.some((p) => p.life !== "out" && WbMover.overlapsCell(p, i, j));
  }

  private pressKeys(intents: WbIntent[]): void {
    for (const p of this.players) {
      const press = intents[p.index].kPress;
      if (p.life === "out" || press <= p.kSeen) { p.kSeen = Math.max(p.kSeen, press); continue; }
      p.kSeen = press;
      if (p.life === "trapped") {
        if (p.needles > 0) { p.needles--; WbTrapRules.release(this, p, p.index, true); }
        continue;
      }
      this.place(p);
    }
  }

  private place(p: WbPlayer): void {
    const i = p.cellI, j = p.cellJ, k = WbGrid.index(i, j);
    if (this.balloonCell[k] >= 0 || this.activeBalloons(p.index) >= p.balloonsMax || this.grid.blocked(i, j)) {
      this.emit({ t: "noPlace", by: p.index });
      return;
    }
    const b = new WbBalloon(this.nextBalloon++, p.index, i, j, this.tick, this.tick + WbBalance.ticks(WbBalance.FUSE), p.range);
    for (const q of this.players) if (q.life !== "out" && WbMover.overlapsCell(q, i, j)) b.passers.add(q.index);
    this.balloons.push(b);
    this.balloonCell[k] = b.id;
    this.emit({ t: "place", id: b.id, by: p.index, i, j });
  }

  private slideBalloons(): void {
    const step = WbBalance.KICK_SPEED * WbBalance.DT;
    for (const b of this.balloons.slice()) {
      if (b.slideDir < 0) continue;
      let left = step;
      while (left > 1e-9 && b.slideDir >= 0) {
        const cx = b.i + 0.5, cz = b.j + 0.5;
        const toCenter = WbDir.horizontal(b.slideDir) ? (cx - b.x) * WbDir.sign(b.slideDir) : (cz - b.z) * WbDir.sign(b.slideDir);
        if (toCenter > 1e-9) {
          const d = Math.min(left, toCenter);
          this.shiftBalloon(b, d);
          left -= d;
          continue;
        }
        if (!this.canSlideInto(b, b.slideDir)) {
          b.x = cx; b.z = cz; b.slideDir = WbDir.NONE;
          this.emit({ t: "slideStop", id: b.id, i: b.i, j: b.j });
          break;
        }
        const d = Math.min(left, 1);
        this.shiftBalloon(b, d);
        left -= d;
      }
    }
  }

  private shiftBalloon(b: WbBalloon, d: number): void {
    const before = b.cell;
    b.x += WbDir.DX[b.slideDir] * d;
    b.z += WbDir.DZ[b.slideDir] * d;
    b.x = Math.round(b.x * 1e6) / 1e6; b.z = Math.round(b.z * 1e6) / 1e6;
    if (b.cell !== before) {
      if (this.balloonCell[before] === b.id) this.balloonCell[before] = -1;
      this.balloonCell[b.cell] = b.id;
      b.passers.clear();
    }
  }

  private explode(): void {
    for (;;) {
      const due = this.balloons.find((b) => b.explodeAt <= this.tick || (b.slideDir >= 0 && this.isWet(b.cell)));
      if (!due) break;
      WbBlast.spread(this, due);
    }
  }

  private trapInWater(): void {
    for (const p of this.players) {
      if (p.life !== "alive" || p.invulnerable(this.tick)) continue;
      const k = p.cell;
      if (this.isWet(k)) WbTrapRules.trap(this, p, this.wetOwner[k]);
    }
  }

  private dropBlocks(): void {
    if (this.tick === WbBalance.ticks(WbBalance.SUDDEN_START)) this.emit({ t: "sudden" });
    const s = this.sudden;
    while (this.warnCursor < s.order.length && s.warnAt[this.warnCursor] <= this.tick) {
      this.emit({ t: "suddenWarn", cell: s.order[this.warnCursor], land: s.landAt[this.warnCursor] });
      this.warnCursor++;
    }
    while (this.suddenCursor < s.order.length && s.landAt[this.suddenCursor] <= this.tick) {
      const k = s.order[this.suddenCursor++];
      const i = WbGrid.col(k), j = WbGrid.row(k);
      this.grid.cells[k] = WbCell.WALL;
      this.breaking.delete(k);
      this.hidden.delete(k);
      this.floor.delete(k);
      const id = this.balloonCell[k];
      if (id >= 0) { const b = this.balloonById(id); if (b) this.removeBalloon(b); }
      this.emit({ t: "suddenDrop", cell: k });
      for (const p of this.players) if (p.life !== "out" && p.cellI === i && p.cellJ === j) this.knockOut(p, -1, "sudden");
    }
  }

  private revealAndPick(): void {
    for (const [k, info] of Array.from(this.breaking)) {
      if (info.at > this.tick) continue;
      this.breaking.delete(k);
      this.grid.cells[k] = WbCell.EMPTY;
      const loot = this.hidden.get(k) || null;
      this.hidden.delete(k);
      if (loot) this.floor.set(k, { kind: loot.kind, grade: loot.grade, tick: this.tick });
      this.emit({ t: "boxBreak", cell: k, by: info.by, kind: loot ? loot.kind : null, grade: loot ? loot.grade : -1 });
    }
    if (!this.floor.size) return;
    const m = WbBalance.PICK_MARGIN;
    for (const p of this.players) {
      if (p.life !== "alive") continue;
      for (const [k, item] of Array.from(this.floor)) {
        const i = WbGrid.col(k), j = WbGrid.row(k);
        if (p.x < i - m || p.x > i + 1 + m || p.z < j - m || p.z > j + 1 + m) continue;
        this.floor.delete(k);
        const r = WbLootTable.create(item.kind, item.grade).apply(p, this.tick);
        this.emit({ t: "pick", by: p.index, cell: k, kind: item.kind, grade: item.grade, gain: r.gain, max: r.max });
      }
    }
  }

  private judge(): void {
    if (this.tick >= this.endTick) {
      for (const p of this.players) if (p.life === "trapped") { WbTrapRules.creditTimeout(this, p); this.knockOut(p, p.trapOwner, "clock"); }
      this.finish();
      return;
    }
    const alive = this.players.filter((p) => p.life !== "out");
    const groups = new Set(alive.map((p) => p.team));
    if (groups.size <= 1) this.finish();
  }

  private finish(): void {
    this.ended = true;
    this.ranks = WbScoreboard.ranks(this);
    this.emit({ t: "end" });
  }

  drainEvents(): WbEvent[] { const e = this.events; this.events = []; return e; }
}

class WbSnapshotCodec {
  static readonly LIVES: readonly WbLife[] = ["alive", "trapped", "out"];

  static encodePlayer(p: WbPlayer, engine: WbEngine): string {
    const bits = (engine.tick < p.invulnUntil ? 1 : 0) | (engine.tick < p.shieldUntil ? 2 : 0) | (p.kick ? 4 : 0) | (p.disconnected ? 8 : 0);
    return [
      Math.round(p.x * 100), Math.round(p.z * 100), p.face, WbSnapshotCodec.LIVES.indexOf(p.life), bits,
      p.life === "trapped" ? p.trapUntil - engine.tick : 0, engine.activeBalloons(p.index), p.balloonsMax, p.range, p.shoe, p.needles,
      p.kills, p.traps, p.rescues, p.boxes, p.selfKills,
      Math.max(0, p.invulnUntil - engine.tick), Math.max(0, p.shieldUntil - engine.tick),
    ].join(",");
  }

  static decodePlayer(s: string): { x: number; z: number; face: number; life: WbLife; invuln: boolean; shield: boolean; kick: boolean; left: boolean; trapLeft: number; active: number; balloonsMax: number; range: number; shoe: number; needles: number; kills: number; traps: number; rescues: number; boxes: number; selfKills: number; invulnLeft: number; shieldLeft: number } {
    const v = s.split(",").map(Number);
    return {
      x: v[0] / 100, z: v[1] / 100, face: v[2], life: WbSnapshotCodec.LIVES[v[3]],
      invuln: !!(v[4] & 1), shield: !!(v[4] & 2), kick: !!(v[4] & 4), left: !!(v[4] & 8),
      trapLeft: v[5], active: v[6], balloonsMax: v[7], range: v[8], shoe: v[9], needles: v[10],
      kills: v[11], traps: v[12], rescues: v[13], boxes: v[14], selfKills: v[15], invulnLeft: v[16], shieldLeft: v[17],
    };
  }

  static applyPlayer(p: WbPlayer, s: string, tick: number): void {
    const d = WbSnapshotCodec.decodePlayer(s);
    p.x = d.x; p.z = d.z; p.face = d.face; p.life = d.life; p.kick = d.kick; p.disconnected = d.left;
    p.trapUntil = tick + d.trapLeft; p.balloonsMax = d.balloonsMax; p.range = d.range; p.shoe = d.shoe; p.needles = d.needles;
    p.kills = d.kills; p.traps = d.traps; p.rescues = d.rescues; p.boxes = d.boxes; p.selfKills = d.selfKills;
    p.invulnUntil = tick + d.invulnLeft; p.shieldUntil = tick + d.shieldLeft;
  }

  static encodeBoard(engine: WbEngine): string {
    const cells = Array.from(engine.grid.cells).join("");
    const items = Array.from(engine.floor).map(([k, it]) => [k, WbLootTable.KINDS.indexOf(it.kind), it.grade].join(":")).join(",");
    const balloons = engine.balloons.map((b) => [b.id, b.owner, b.i, b.j, b.explodeAt - engine.tick, b.range].join(":")).join(",");
    return [engine.tick, cells, items, balloons].join("|");
  }

  static decodeBoard(s: string): { tick: number; cells: number[]; items: Array<{ cell: number; kind: string; grade: number }>; balloons: Array<{ id: number; owner: number; i: number; j: number; fuseLeft: number; range: number }> } {
    const [tick, cells, items, balloons] = s.split("|");
    const parts = (text: string): number[][] => text ? text.split(",").map((p) => p.split(":").map(Number)) : [];
    return {
      tick: Number(tick),
      cells: cells.split("").map(Number),
      items: parts(items).map((v) => ({ cell: v[0], kind: WbLootTable.KINDS[v[1]], grade: v[2] })),
      balloons: parts(balloons).map((v) => ({ id: v[0], owner: v[1], i: v[2], j: v[3], fuseLeft: v[4], range: v[5] })),
    };
  }
}
