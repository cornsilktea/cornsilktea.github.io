class GlassBridgeClipLengths {
  static readonly JUMP_FULL_SHORT_MS = 1170;
  static readonly SPAWN_AIR_MS = 1300;
  static readonly INTERACT_MS = 1300;
  static readonly DEATH_B_MS = 2630;
  static readonly CHEERING_MS = 1670;
}

class GlassBridgeRules {
  static readonly ROW_COUNT = 10;
  static readonly SIDE_COUNT = 2;
  static readonly PLAY_MS = 120000;
  static readonly END_GRACE_MS = 600;
  static readonly ALL_ARRIVED_DELAY_MS = 2500;
  static readonly LOTTERY_MS = 8000;
  static readonly LINEUP_MS = 1800;
  static readonly CHOICE_MS = 4000;
  static readonly HOST_GRACE_MS = 350;
  static readonly ENTER_MS = 600;
  static readonly AUTO_ROW_MS = 350;
  static readonly JUMP_PLAYBACK_SPEED = 1.3;
  static readonly JUMP_MS = Math.round(GlassBridgeClipLengths.JUMP_FULL_SHORT_MS / GlassBridgeRules.JUMP_PLAYBACK_SPEED);
  static readonly CONTACT_MS = Math.round(GlassBridgeRules.JUMP_MS * 0.55);
  static readonly FALL_MS = 900;
  static readonly LAVA_HOLD_MS = 900;
  static readonly FALL_NEXT_MS = GlassBridgeRules.CONTACT_MS + 600;
  static readonly TIMEOUT_NEXT_MS = 1100;
  static readonly AI_LOTTERY_MIN_MS = 600;
  static readonly AI_LOTTERY_MAX_MS = 4500;
  static readonly AI_CHOICE_MIN_MS = 1000;
  static readonly AI_CHOICE_MAX_MS = 3500;
  static readonly MAX_STEPS_PER_TICK = 24;
}

class GlassBridgeSeedHash {
  static unit(text: string): number {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return new SeededRandom(hash >>> 0).next();
  }

  static between(text: string, low: number, high: number): number {
    return low + GlassBridgeSeedHash.unit(text) * (high - low);
  }
}

class GlassBridgeLayout {
  static readonly ROW_LENGTH = 2.4;
  static readonly SIDE_OFFSET = 1.2;
  static readonly ENTRANCE_Z = 0.5;
  static readonly QUEUE_START_Z = 1.9;
  static readonly QUEUE_GAP = 1.25;
  static readonly LOTTERY_BAG_Z = 3.4;
  static readonly LOTTERY_STAND_Z = 8.2;
  static readonly SPOT_GAP = 1.6;
  static readonly LAVA_Y = -16;

  static rowZ(row: number): number {
    return -(row + 0.5) * GlassBridgeLayout.ROW_LENGTH;
  }

  static sideX(side: number): number {
    return side === 0 ? -GlassBridgeLayout.SIDE_OFFSET : GlassBridgeLayout.SIDE_OFFSET;
  }

  static bridgeEndZ(rows: number): number {
    return -rows * GlassBridgeLayout.ROW_LENGTH;
  }

  static midZ(rows: number): number {
    return (GlassBridgeLayout.bridgeEndZ(rows) + GlassBridgeLayout.QUEUE_START_Z) / 2;
  }

  static queueZ(index: number): number {
    return GlassBridgeLayout.QUEUE_START_Z + index * GlassBridgeLayout.QUEUE_GAP;
  }

  static platformSlotX(index: number, count: number): number {
    return (index - (count - 1) / 2) * GlassBridgeLayout.SPOT_GAP;
  }

  static platformZ(rows: number): number {
    return GlassBridgeLayout.bridgeEndZ(rows) - 2.4;
  }
}

type GlassPanelStatus = "hidden" | "confirmed" | "broken";

class GlassBridgePanels {
  private readonly brokenSides: number[];
  private readonly steppedAt: number[];

  constructor(readonly rows: number) {
    this.brokenSides = new Array<number>(rows).fill(-1);
    this.steppedAt = new Array<number>(rows).fill(0);
  }

  reveal(row: number, brokenSide: number, at: number): void {
    this.brokenSides[row] = brokenSide;
    this.steppedAt[row] = at;
  }

  knownCount(): number {
    let count = 0;
    while (count < this.rows && this.brokenSides[count] >= 0) count++;
    return count;
  }

  isKnown(row: number): boolean {
    return row >= 0 && row < this.rows && this.brokenSides[row] >= 0;
  }

  brokenSide(row: number): number {
    return this.brokenSides[row];
  }

  safeSide(row: number): number {
    return 1 - this.brokenSides[row];
  }

  steppedTime(row: number): number {
    return this.steppedAt[row];
  }

  statusAt(row: number, side: number, now: number): GlassPanelStatus {
    if (!this.isKnown(row) || now < this.steppedAt[row] + GlassBridgeRules.CONTACT_MS) return "hidden";
    return side === this.brokenSides[row] ? "broken" : "confirmed";
  }
}

interface GlassStepRecord {
  readonly id: string;
  readonly a: number;
  readonly r: number;
  readonly s: number;
  readonly b: number;
  readonly t: number;
}

interface GlassDrawRecord {
  readonly id: string;
  readonly b: number;
  readonly n: number;
  readonly t: number;
}

interface GlassPickRecord {
  readonly id: string;
  readonly a: number;
  readonly r: number;
  readonly s: number;
  readonly t: number;
}

interface GlassWantRecord {
  readonly b: number;
  readonly q: number;
}

class GlassBridgeLottery {
  private readonly draws = new Map<string, GlassDrawRecord>();

  constructor(readonly ids: readonly string[]) {}

  bagCount(): number {
    return this.ids.length;
  }

  accept(record: GlassDrawRecord): boolean {
    const valid = this.ids.indexOf(record.id) >= 0 && !this.draws.has(record.id)
      && record.b >= 0 && record.b < this.bagCount() && record.n >= 1 && record.n <= this.bagCount()
      && this.bagOwner(record.b) === null && this.numberOwner(record.n) === null;
    if (valid) this.draws.set(record.id, record);
    return valid;
  }

  hasDrawn(id: string): boolean {
    return this.draws.has(id);
  }

  drawOf(id: string): GlassDrawRecord | null {
    return this.draws.get(id) || null;
  }

  bagOwner(bag: number): string | null {
    let owner: string | null = null;
    this.draws.forEach((record, id) => { if (record.b === bag) owner = id; });
    return owner;
  }

  numberOwner(number: number): string | null {
    let owner: string | null = null;
    this.draws.forEach((record, id) => { if (record.n === number) owner = id; });
    return owner;
  }

  freeBags(): number[] {
    return Array.from({ length: this.bagCount() }, (unused, bag) => bag).filter((bag) => this.bagOwner(bag) === null);
  }

  freeNumbers(): number[] {
    return Array.from({ length: this.bagCount() }, (unused, index) => index + 1).filter((number) => this.numberOwner(number) === null);
  }

  undrawn(): string[] {
    return this.ids.filter((id) => !this.draws.has(id));
  }

  complete(): boolean {
    return this.draws.size === this.ids.length;
  }

  crossStartAt(): number {
    let latest = 0;
    this.draws.forEach((record) => { latest = Math.max(latest, record.t); });
    return latest + GlassBridgeRules.LINEUP_MS;
  }

  lineup(): string[] {
    const drawn = this.ids.filter((id) => this.draws.has(id)).sort((a, b) => (this.draws.get(a) as GlassDrawRecord).n - (this.draws.get(b) as GlassDrawRecord).n);
    return drawn.concat(this.undrawn());
  }
}

class GlassBridgeTurnQueue {
  private readonly line: string[];

  constructor(order: readonly string[]) {
    this.line = order.slice();
  }

  next(): string | null {
    return this.line.length ? (this.line.shift() as string) : null;
  }

  sendBack(id: string): void {
    this.line.push(id);
  }

  snapshot(): readonly string[] {
    return this.line;
  }

  isEmpty(): boolean {
    return this.line.length === 0;
  }
}

type GlassTurnOutcome = "running" | "fell" | "arrived";

class GlassBridgeTurn {
  readonly steps: GlassStepRecord[] = [];
  outcome: GlassTurnOutcome = "running";
  endAt = 0;
  fallStartAt = 0;
  arrivalIndex = -1;

  constructor(readonly id: string, readonly attempt: number, readonly startAt: number, readonly knownRows: number, readonly rows: number) {}

  nextRow(): number {
    return this.knownRows + this.steps.length;
  }

  autoEndAt(): number {
    return this.startAt + GlassBridgeRules.ENTER_MS + this.knownRows * GlassBridgeRules.AUTO_ROW_MS;
  }

  nextOpensAt(): number {
    return this.steps.length === 0 ? this.autoEndAt() : this.steps[this.steps.length - 1].t + GlassBridgeRules.JUMP_MS;
  }

  nextOpensAtFor(stepIndex: number): number {
    return stepIndex === 0 ? this.autoEndAt() : this.steps[stepIndex - 1].t + GlassBridgeRules.JUMP_MS;
  }

  nextClosesAt(): number {
    return this.nextOpensAt() + GlassBridgeRules.CHOICE_MS;
  }

  fallEndAt(): number {
    return this.fallStartAt + GlassBridgeRules.FALL_MS + GlassBridgeRules.LAVA_HOLD_MS;
  }

  rowsReachedBy(time: number): number {
    let rows = 0;
    for (let row = 1; row <= this.knownRows; row++) {
      if (this.startAt + GlassBridgeRules.ENTER_MS + row * GlassBridgeRules.AUTO_ROW_MS <= time) rows = row;
    }
    this.steps.forEach((step) => {
      if (step.s >= 0 && step.s !== step.b && step.t + GlassBridgeRules.JUMP_MS <= time) rows = Math.max(rows, step.r + 1);
    });
    return rows;
  }

  rowsReachedAt(rows: number): number {
    for (let row = 1; row <= this.knownRows; row++) {
      if (row >= rows) return this.startAt + GlassBridgeRules.ENTER_MS + row * GlassBridgeRules.AUTO_ROW_MS;
    }
    const step = this.steps.find((entry) => entry.s >= 0 && entry.s !== entry.b && entry.r + 1 >= rows);
    return step ? step.t + GlassBridgeRules.JUMP_MS : Infinity;
  }
}

interface GlassChoiceWindow {
  readonly id: string;
  readonly attempt: number;
  readonly row: number;
  readonly opensAt: number;
  readonly closesAt: number;
}

class GlassBridgeTimeline {
  private readonly queue: GlassBridgeTurnQueue;
  private readonly allTurns: GlassBridgeTurn[] = [];
  private readonly latestByPlayer = new Map<string, GlassBridgeTurn>();
  private active: GlassBridgeTurn | null = null;
  private arrivalCount = 0;
  private attemptCount = 0;
  private lastArrivalAt = 0;

  constructor(lineup: readonly string[], readonly startAt: number, readonly rows: number, readonly panels: GlassBridgePanels = new GlassBridgePanels(rows)) {
    this.queue = new GlassBridgeTurnQueue(lineup);
    this.beginTurn(startAt);
  }

  turns(): readonly GlassBridgeTurn[] {
    return this.allTurns;
  }

  current(): GlassBridgeTurn | null {
    return this.active;
  }

  latestTurn(id: string): GlassBridgeTurn | null {
    return this.latestByPlayer.get(id) || null;
  }

  waiting(): readonly string[] {
    return this.queue.snapshot();
  }

  arrivals(): number {
    return this.arrivalCount;
  }

  lastArrival(): number {
    return this.lastArrivalAt;
  }

  isFinished(): boolean {
    return this.active === null;
  }

  openWindow(): GlassChoiceWindow | null {
    const turn = this.active;
    if (!turn || turn.outcome !== "running") return null;
    return { id: turn.id, attempt: turn.attempt, row: turn.nextRow(), opensAt: turn.nextOpensAt(), closesAt: turn.nextClosesAt() };
  }

  apply(record: GlassStepRecord): boolean {
    const turn = this.active;
    if (!turn || record.id !== turn.id || record.a !== turn.attempt || record.r !== turn.nextRow()) return false;
    if (record.s < -1 || record.s > 1 || (record.s >= 0 && (record.b < 0 || record.b > 1))) return false;
    const opensAt = turn.nextOpensAt();
    const t = MathUtil.clamp(record.t, opensAt, turn.nextClosesAt());
    turn.steps.push({ id: record.id, a: record.a, r: record.r, s: record.s, b: record.b, t });
    if (record.s < 0) this.settleFall(turn, t, t, GlassBridgeRules.TIMEOUT_NEXT_MS);
    else {
      this.panels.reveal(record.r, record.b, t);
      if (record.s === record.b) this.settleFall(turn, t, t + GlassBridgeRules.CONTACT_MS, GlassBridgeRules.FALL_NEXT_MS);
      else if (record.r === this.rows - 1) this.settleArrival(turn, t + GlassBridgeRules.JUMP_MS + GlassBridgeRules.AUTO_ROW_MS);
    }
    return true;
  }

  private settleFall(turn: GlassBridgeTurn, at: number, fallStart: number, nextDelay: number): void {
    turn.outcome = "fell";
    turn.endAt = at + nextDelay;
    turn.fallStartAt = fallStart;
    this.queue.sendBack(turn.id);
    this.beginTurn(turn.endAt);
  }

  private settleArrival(turn: GlassBridgeTurn, at: number): void {
    turn.outcome = "arrived";
    turn.endAt = at;
    turn.arrivalIndex = this.arrivalCount++;
    this.lastArrivalAt = at;
    this.beginTurn(at);
  }

  private beginTurn(startAt: number): void {
    let at = startAt;
    for (;;) {
      const id = this.queue.next();
      if (id === null) {
        this.active = null;
        return;
      }
      const turn = new GlassBridgeTurn(id, this.attemptCount++, at, this.panels.knownCount(), this.rows);
      this.allTurns.push(turn);
      this.latestByPlayer.set(id, turn);
      this.active = turn;
      if (turn.knownRows < this.rows) return;
      at = turn.autoEndAt() + GlassBridgeRules.AUTO_ROW_MS;
      turn.outcome = "arrived";
      turn.endAt = at;
      turn.arrivalIndex = this.arrivalCount++;
      this.lastArrivalAt = at;
    }
  }
}

interface GlassStanding {
  readonly id: string;
  readonly rows: number;
  readonly at: number;
  readonly arrived: boolean;
  readonly falls: number;
}

class GlassBridgeStandings {
  constructor(private readonly ids: readonly string[], private readonly timeline: GlassBridgeTimeline | null, private readonly endAt: number) {}

  entries(): GlassStanding[] {
    const list = this.ids.map((id) => this.standingOf(id));
    return list.sort((a, b) => this.compare(a, b));
  }

  ranking(): RankEntry[] {
    const list = this.entries();
    return list.map((entry, index) => {
      let first = index;
      while (first > 0 && this.compare(list[first - 1], entry) === 0) first--;
      return { id: entry.id, rank: first + 1 };
    });
  }

  private standingOf(id: string): GlassStanding {
    let rows = 0;
    let at = Infinity;
    let falls = 0;
    const timeline = this.timeline;
    if (timeline) {
      timeline.turns().forEach((turn) => {
        if (turn.id !== id) return;
        if (turn.outcome === "fell" && turn.fallStartAt <= this.endAt) falls++;
        const reached = turn.rowsReachedBy(this.endAt);
        if (reached > rows) {
          rows = reached;
          at = turn.rowsReachedAt(reached);
        }
      });
    }
    const total = timeline ? timeline.rows : 0;
    return { id, rows, at, arrived: total > 0 && rows >= total, falls };
  }

  private compare(a: GlassStanding, b: GlassStanding): number {
    if (a.arrived !== b.arrived) return a.arrived ? -1 : 1;
    if (a.rows !== b.rows) return b.rows - a.rows;
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    return 0;
  }
}

type GlassPoseKind = "lottery" | "draw" | "queued" | "spawn" | "walk" | "run" | "wait" | "jump" | "fall" | "lava" | "arrived";

interface GlassPose {
  readonly kind: GlassPoseKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
  readonly sinceMs: number;
  readonly tumble: number;
}

class GlassPoseBuilder {
  static readonly FORWARD = 0;
  static readonly BACKWARD = Math.PI;

  static make(kind: GlassPoseKind, x: number, z: number, sinceMs: number, y = 0, facing = GlassPoseBuilder.FORWARD, tumble = 0): GlassPose {
    return { kind, x, y, z, facing, sinceMs, tumble };
  }
}

class GlassBridgeChoreography {
  constructor(private readonly ids: readonly string[], private readonly lottery: GlassBridgeLottery, private readonly rows: number) {}

  poseOf(timeline: GlassBridgeTimeline | null, id: string, now: number): GlassPose {
    if (!timeline) return this.lotteryPose(id, now);
    const turn = timeline.latestTurn(id);
    if (!turn) return this.queuedPose(timeline, id, now, Infinity);
    if (turn.outcome === "arrived" && now >= turn.endAt) return this.arrivedPose(turn, now);
    if (turn.outcome === "fell" && now >= turn.fallEndAt()) return this.queuedPose(timeline, id, now, now - turn.fallEndAt());
    if (now < turn.startAt) return this.queuedPose(timeline, id, now, Infinity);
    return this.turnPose(timeline, turn, now);
  }

  displayQueue(timeline: GlassBridgeTimeline, now: number): string[] {
    const list: string[] = [];
    const active = timeline.current();
    if (active && now < active.startAt) list.push(active.id);
    timeline.waiting().forEach((id) => {
      const turn = timeline.latestTurn(id);
      const falling = turn !== null && turn.outcome === "fell" && now < turn.fallEndAt();
      if (!falling) list.push(id);
    });
    return list;
  }

  lotteryPose(id: string, now: number): GlassPose {
    const spot = this.ids.indexOf(id);
    const x = GlassBridgeLayout.platformSlotX(spot, this.ids.length);
    const draw = this.lottery.drawOf(id);
    const since = draw ? now - draw.t : Infinity;
    const kind: GlassPoseKind = since >= 0 && since < GlassBridgeClipLengths.INTERACT_MS ? "draw" : "lottery";
    return GlassPoseBuilder.make(kind, x, GlassBridgeLayout.LOTTERY_STAND_Z, Math.max(0, since), 0, GlassPoseBuilder.FORWARD);
  }

  private queuedPose(timeline: GlassBridgeTimeline, id: string, now: number, sinceRespawnMs: number): GlassPose {
    const queue = this.displayQueue(timeline, now);
    const index = Math.max(0, queue.indexOf(id));
    const kind: GlassPoseKind = sinceRespawnMs < GlassBridgeClipLengths.SPAWN_AIR_MS ? "spawn" : "queued";
    return GlassPoseBuilder.make(kind, 0, GlassBridgeLayout.queueZ(index), kind === "spawn" ? sinceRespawnMs : 0);
  }

  private arrivedPose(turn: GlassBridgeTurn, now: number): GlassPose {
    return GlassPoseBuilder.make("arrived", GlassBridgeLayout.platformSlotX(turn.arrivalIndex, this.ids.length), GlassBridgeLayout.platformZ(this.rows), now - turn.endAt, 0, GlassPoseBuilder.BACKWARD);
  }

  private turnPose(timeline: GlassBridgeTimeline, turn: GlassBridgeTurn, now: number): GlassPose {
    const panels = timeline.panels;
    const spot = (row: number, side: number): { x: number; z: number } => ({ x: GlassBridgeLayout.sideX(side), z: GlassBridgeLayout.rowZ(row) });
    const entrance = { x: 0, z: GlassBridgeLayout.ENTRANCE_Z };
    const head = { x: 0, z: GlassBridgeLayout.queueZ(0) };
    const t = now - turn.startAt;
    if (t < GlassBridgeRules.ENTER_MS) return this.between("walk", head, entrance, t / GlassBridgeRules.ENTER_MS, t);
    let from = entrance;
    for (let row = 0; row < turn.knownRows; row++) {
      const target = spot(row, panels.safeSide(row));
      const segmentStart = GlassBridgeRules.ENTER_MS + row * GlassBridgeRules.AUTO_ROW_MS;
      if (t < segmentStart + GlassBridgeRules.AUTO_ROW_MS) return this.between("run", from, target, (t - segmentStart) / GlassBridgeRules.AUTO_ROW_MS, t - segmentStart);
      from = target;
    }
    if (turn.knownRows >= this.rows) return this.runToPlatform(from, turn, t - (GlassBridgeRules.ENTER_MS + turn.knownRows * GlassBridgeRules.AUTO_ROW_MS));
    let standing = from;
    for (let index = 0; index < turn.steps.length; index++) {
      const step = turn.steps[index];
      const since = now - step.t;
      if (since < 0) return GlassPoseBuilder.make("wait", standing.x, standing.z, now - turn.nextOpensAtFor(index), 0, GlassPoseBuilder.FORWARD);
      if (step.s < 0) return this.fallPose(standing, since);
      const target = spot(step.r, step.s);
      if (step.s === step.b) {
        if (since < GlassBridgeRules.CONTACT_MS) return this.between("jump", standing, target, since / GlassBridgeRules.CONTACT_MS, since);
        return this.fallPose(target, since - GlassBridgeRules.CONTACT_MS);
      }
      if (since < GlassBridgeRules.JUMP_MS) return this.between("jump", standing, target, since / GlassBridgeRules.JUMP_MS, since);
      standing = target;
      if (step.r === this.rows - 1) return this.runToPlatform(standing, turn, since - GlassBridgeRules.JUMP_MS);
    }
    return GlassPoseBuilder.make("wait", standing.x, standing.z, now - turn.nextOpensAt(), 0, GlassPoseBuilder.FORWARD);
  }

  private runToPlatform(from: { x: number; z: number }, turn: GlassBridgeTurn, sinceMs: number): GlassPose {
    const slot = { x: GlassBridgeLayout.platformSlotX(Math.max(0, turn.arrivalIndex), this.ids.length), z: GlassBridgeLayout.platformZ(this.rows) };
    return this.between("run", from, slot, MathUtil.clamp(sinceMs / GlassBridgeRules.AUTO_ROW_MS, 0, 1), sinceMs);
  }

  private fallPose(from: { x: number; z: number }, sinceMs: number): GlassPose {
    if (sinceMs >= GlassBridgeRules.FALL_MS) return GlassPoseBuilder.make("lava", from.x, from.z, sinceMs - GlassBridgeRules.FALL_MS, GlassBridgeLayout.LAVA_Y);
    const ratio = sinceMs / GlassBridgeRules.FALL_MS;
    return GlassPoseBuilder.make("fall", from.x, from.z, sinceMs, GlassBridgeLayout.LAVA_Y * ratio * ratio, GlassPoseBuilder.FORWARD, ratio);
  }

  private between(kind: GlassPoseKind, from: { x: number; z: number }, to: { x: number; z: number }, ratio: number, sinceMs: number): GlassPose {
    const clamped = MathUtil.clamp(ratio, 0, 1);
    const lift = kind === "jump" ? Math.sin(clamped * Math.PI) * 0.9 : 0;
    const dx = to.x - from.x, dz = to.z - from.z;
    const facing = Math.abs(dx) > 0.01 && Math.abs(dx) > Math.abs(dz) ? Math.atan2(dx, -dz) * 0.5 : GlassPoseBuilder.FORWARD;
    return GlassPoseBuilder.make(kind, MathUtil.lerp(from.x, to.x, clamped), MathUtil.lerp(from.z, to.z, clamped), sinceMs, lift, facing);
  }
}
