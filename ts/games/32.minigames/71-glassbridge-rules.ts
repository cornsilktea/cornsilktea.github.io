class GlassBridgeClipLengths {
  static readonly JUMP_FULL_SHORT_MS = 1170;
  static readonly SPAWN_AIR_MS = 1300;
  static readonly INTERACT_MS = 1300;
  static readonly DEATH_B_MS = 2630;
  static readonly CHEERING_MS = 1670;
}

class GlassBridgeRules {
  static readonly ROW_COUNT = 15;
  static readonly SIDE_COUNT = 2;
  static readonly PLAY_MS = 150000;
  static readonly END_GRACE_MS = 600;
  static readonly ALL_ARRIVED_DELAY_MS = 2500;
  static readonly LOTTERY_MS = 8000;
  static readonly LINEUP_MS = 1800;
  static readonly CHOICE_MS = 6000;
  static readonly HOST_GRACE_MS = 350;
  static readonly ENTER_MS = 600;
  static readonly AUTO_ROW_MS = 250;
  static readonly FOLLOW_DELAY_MS = 150;
  static readonly TIMEOUT_FOLLOW_MS = 300;
  static readonly WALK_MIN_MS = 500;
  static readonly JUMP_PLAYBACK_SPEED = 1.3;
  static readonly JUMP_MS = Math.round(GlassBridgeClipLengths.JUMP_FULL_SHORT_MS / GlassBridgeRules.JUMP_PLAYBACK_SPEED);
  static readonly CONTACT_MS = Math.round(GlassBridgeRules.JUMP_MS * 0.55);
  static readonly FALL_MS = 900;
  static readonly LAVA_HOLD_MS = 700;
  static readonly AI_LOTTERY_MIN_MS = 600;
  static readonly AI_LOTTERY_MAX_MS = 4500;
  static readonly AI_CHOICE_MIN_MS = 1200;
  static readonly AI_CHOICE_MAX_MS = 4500;
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

interface GlassChoiceWindow {
  readonly id: string;
  readonly attempt: number;
  readonly row: number;
  readonly opensAt: number;
  readonly closesAt: number;
}

interface GlassPoint {
  readonly x: number;
  readonly z: number;
}

type GlassSegmentKind = "walk" | "run" | "jump" | "drop" | "spawn";

interface GlassSegment {
  readonly kind: GlassSegmentKind;
  readonly start: number;
  readonly duration: number;
  readonly from: GlassPoint;
  readonly to: GlassPoint;
  readonly arrives: boolean;
}

interface GlassLanding {
  readonly rows: number;
  readonly at: number;
}

class GlassBridgeTrack {
  private readonly segments: GlassSegment[] = [];
  private readonly landings: GlassLanding[] = [];
  private readonly dropTimes: number[] = [];
  arrivalAt = -1;
  arrivalNumber = 0;

  constructor(readonly home: GlassPoint) {}

  restPoint(): GlassPoint {
    const last = this.segments[this.segments.length - 1];
    return last ? last.to : this.home;
  }

  add(segment: GlassSegment): void {
    this.segments.push(segment);
    if (segment.kind === "drop") this.dropTimes.push(segment.start);
    if (segment.arrives) this.arrivalAt = segment.start + segment.duration;
  }

  land(rows: number, at: number): void {
    this.landings.push({ rows, at });
  }

  activeAt(now: number): GlassSegment | null {
    for (let index = this.segments.length - 1; index >= 0; index--) {
      if (this.segments[index].start <= now) return this.segments[index];
    }
    return null;
  }

  bestBy(time: number): GlassLanding {
    let best: GlassLanding = { rows: 0, at: Infinity };
    this.landings.forEach((landing) => {
      if (landing.at <= time && landing.rows > best.rows) best = landing;
    });
    return best;
  }

  fallsBy(time: number): number {
    return this.dropTimes.filter((at) => at <= time).length;
  }

  hasArrived(now: number): boolean {
    return this.arrivalAt >= 0 && now >= this.arrivalAt;
  }
}

class GlassBridgeTimeline {
  private readonly tracks = new Map<string, GlassBridgeTrack>();
  private readonly line: string[];
  private readonly pending: Array<{ id: string; at: number }> = [];
  private readonly playerCount: number;
  private leaderId: string | null = null;
  private leaderSlot = -2;
  private clock: number;
  private readyAt: number;
  private attempt = -1;
  private attemptCount = 0;
  private arrivalCount = 0;
  private lastArrivalAt = 0;

  constructor(lineup: readonly string[], readonly startAt: number, readonly rows: number, readonly panels: GlassBridgePanels = new GlassBridgePanels(rows)) {
    this.playerCount = lineup.length;
    this.line = lineup.slice();
    lineup.forEach((id, index) => this.tracks.set(id, new GlassBridgeTrack(this.pointOf(-2 - index, 0))));
    this.clock = startAt;
    this.readyAt = startAt;
    this.settle();
  }

  trackOf(id: string): GlassBridgeTrack {
    return this.tracks.get(id) as GlassBridgeTrack;
  }

  leader(): string | null {
    return this.leaderId;
  }

  leaderReadyAt(): number {
    return this.readyAt;
  }

  arrivals(): number {
    return this.arrivalCount;
  }

  lastArrival(): number {
    return this.lastArrivalAt;
  }

  isFinished(): boolean {
    return this.leaderId === null && this.line.length === 0 && this.pending.length === 0;
  }

  openWindow(): GlassChoiceWindow | null {
    if (this.leaderId === null) return null;
    return { id: this.leaderId, attempt: this.attempt, row: this.panels.knownCount(), opensAt: this.readyAt, closesAt: this.readyAt + GlassBridgeRules.CHOICE_MS };
  }

  respawnPoint(id: string): GlassPoint | null {
    const rank = this.pending.findIndex((entry) => entry.id === id);
    if (rank < 0) return null;
    const slot = this.line.length === 0 ? -2 - rank : this.leaderSlot - this.line.length - rank;
    return this.pointOf(slot, 0);
  }

  apply(record: GlassStepRecord): boolean {
    const window = this.openWindow();
    if (!window || record.id !== window.id || record.a !== window.attempt || record.r !== window.row) return false;
    if (record.s < -1 || record.s > 1 || (record.s >= 0 && (record.b < 0 || record.b > 1))) return false;
    const t = MathUtil.clamp(record.t, window.opensAt, window.closesAt);
    this.clock = t;
    this.releaseRespawns(t);
    const leaderTrack = this.trackOf(window.id);
    const standing = leaderTrack.restPoint();
    if (record.s < 0) {
      this.dropLeader(t, standing, t + GlassBridgeRules.TIMEOUT_FOLLOW_MS);
      return true;
    }
    const target = this.pointOf(record.r, 0, record.s);
    this.panels.reveal(record.r, record.b, t);
    if (record.s === record.b) {
      leaderTrack.add({ kind: "jump", start: t, duration: GlassBridgeRules.CONTACT_MS, from: standing, to: target, arrives: false });
      this.dropLeader(t + GlassBridgeRules.CONTACT_MS, target, t + GlassBridgeRules.CONTACT_MS + GlassBridgeRules.FOLLOW_DELAY_MS);
      return true;
    }
    this.stepLine(t, GlassBridgeRules.JUMP_MS, target);
    this.clock = t + GlassBridgeRules.JUMP_MS;
    this.settle();
    return true;
  }

  private frontierSlot(): number {
    const known = this.panels.knownCount();
    return known >= this.rows ? this.rows : known - 1;
  }

  private pointOf(slot: number, arrivalIndex: number, sideOverride = -1): GlassPoint {
    if (slot >= this.rows) return { x: GlassBridgeLayout.platformSlotX(arrivalIndex, this.playerCount), z: GlassBridgeLayout.platformZ(this.rows) };
    if (slot >= 0) return { x: GlassBridgeLayout.sideX(sideOverride >= 0 ? sideOverride : this.panels.safeSide(slot)), z: GlassBridgeLayout.rowZ(slot) };
    if (slot === -1) return { x: 0, z: GlassBridgeLayout.ENTRANCE_Z };
    return { x: 0, z: GlassBridgeLayout.queueZ(-2 - slot) };
  }

  private dropLeader(at: number, point: GlassPoint, followAt: number): void {
    const id = this.line.shift() as string;
    const duration = GlassBridgeRules.FALL_MS + GlassBridgeRules.LAVA_HOLD_MS;
    this.trackOf(id).add({ kind: "drop", start: at, duration, from: point, to: point, arrives: false });
    this.pending.push({ id, at: at + duration });
    this.pending.sort((a, b) => a.at - b.at);
    this.leaderSlot--;
    this.leaderId = null;
    this.clock = followAt;
    this.settle();
  }

  private releaseRespawns(time: number): void {
    while (this.pending.length && this.pending[0].at <= time) {
      const entry = this.pending.shift() as { id: string; at: number };
      const wasEmpty = this.line.length === 0;
      if (wasEmpty) this.leaderSlot = -2;
      const point = this.pointOf(this.leaderSlot - this.line.length, 0);
      this.trackOf(entry.id).add({ kind: "spawn", start: entry.at, duration: GlassBridgeClipLengths.SPAWN_AIR_MS, from: point, to: point, arrives: false });
      this.line.push(entry.id);
      if (wasEmpty) this.clock = Math.max(this.clock, entry.at + GlassBridgeClipLengths.SPAWN_AIR_MS);
    }
  }

  private settle(): void {
    for (let guard = 0; guard < 400; guard++) {
      this.releaseRespawns(this.clock);
      if (this.line.length === 0) {
        if (this.pending.length === 0) {
          this.leaderId = null;
          this.readyAt = this.clock;
          return;
        }
        this.clock = Math.max(this.clock, this.pending[0].at);
        continue;
      }
      if (this.leaderId !== this.line[0]) {
        this.leaderId = this.line[0];
        this.attempt = this.attemptCount++;
      }
      if (this.leaderSlot >= this.frontierSlot()) {
        this.readyAt = this.clock;
        return;
      }
      const duration = this.leaderSlot < -1 ? GlassBridgeRules.ENTER_MS : GlassBridgeRules.AUTO_ROW_MS;
      this.stepLine(this.clock, duration, null);
      this.clock += duration;
    }
  }

  private stepLine(at: number, duration: number, leaderTarget: GlassPoint | null): void {
    let arrived = false;
    this.line.forEach((id, index) => {
      const track = this.trackOf(id);
      const toSlot = this.leaderSlot - index + 1;
      const from = track.restPoint();
      const arrives = toSlot >= this.rows;
      const to = index === 0 && leaderTarget ? leaderTarget : this.pointOf(toSlot, this.arrivalCount);
      const kind: GlassSegmentKind = index === 0 && leaderTarget ? "jump" : duration >= GlassBridgeRules.WALK_MIN_MS ? "walk" : "run";
      track.add({ kind, start: at, duration, from, to, arrives });
      if (toSlot >= 0) track.land(Math.min(toSlot, this.rows - 1) + 1, at + duration);
      if (arrives) {
        track.arrivalNumber = ++this.arrivalCount;
        this.lastArrivalAt = at + duration;
        arrived = true;
      }
    });
    this.leaderSlot++;
    if (arrived) {
      this.line.shift();
      this.leaderSlot--;
      this.leaderId = null;
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
    const timeline = this.timeline;
    if (!timeline) return { id, rows: 0, at: Infinity, arrived: false, falls: 0 };
    const track = timeline.trackOf(id);
    const best = track.bestBy(this.endAt);
    return { id, rows: best.rows, at: best.at, arrived: best.rows >= timeline.rows, falls: track.fallsBy(this.endAt) };
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
    const track = timeline.trackOf(id);
    const segment = track.activeAt(now);
    if (!segment) return this.restPose(timeline, id, track.home, now);
    const since = now - segment.start;
    if (segment.kind === "drop") return since < segment.duration ? this.fallPose(segment.from, since) : this.respawnPose(timeline, id, segment, now);
    if (segment.kind === "spawn") return since < segment.duration ? GlassPoseBuilder.make("spawn", segment.to.x, segment.to.z, since) : this.restPose(timeline, id, segment.to, now);
    if (since < segment.duration) return this.between(segment.kind, segment.from, segment.to, since / segment.duration, since);
    return this.restPose(timeline, id, segment.to, now);
  }

  lotteryPose(id: string, now: number): GlassPose {
    const spot = this.ids.indexOf(id);
    const x = GlassBridgeLayout.platformSlotX(spot, this.ids.length);
    const draw = this.lottery.drawOf(id);
    const since = draw ? now - draw.t : Infinity;
    const kind: GlassPoseKind = since >= 0 && since < GlassBridgeClipLengths.INTERACT_MS ? "draw" : "lottery";
    return GlassPoseBuilder.make(kind, x, GlassBridgeLayout.LOTTERY_STAND_Z, Math.max(0, since), 0, GlassPoseBuilder.FORWARD);
  }

  private restPose(timeline: GlassBridgeTimeline, id: string, point: GlassPoint, now: number): GlassPose {
    const track = timeline.trackOf(id);
    if (track.hasArrived(now)) return GlassPoseBuilder.make("arrived", point.x, point.z, now - track.arrivalAt, 0, GlassPoseBuilder.BACKWARD);
    if (timeline.leader() === id && now >= timeline.leaderReadyAt()) return GlassPoseBuilder.make("wait", point.x, point.z, now - timeline.leaderReadyAt());
    return GlassPoseBuilder.make("queued", point.x, point.z, 0);
  }

  private respawnPose(timeline: GlassBridgeTimeline, id: string, drop: GlassSegment, now: number): GlassPose {
    const point = timeline.respawnPoint(id);
    if (!point) return this.fallPose(drop.from, drop.duration);
    const since = now - (drop.start + drop.duration);
    return since < GlassBridgeClipLengths.SPAWN_AIR_MS ? GlassPoseBuilder.make("spawn", point.x, point.z, since) : GlassPoseBuilder.make("queued", point.x, point.z, 0);
  }

  private fallPose(from: GlassPoint, sinceMs: number): GlassPose {
    if (sinceMs >= GlassBridgeRules.FALL_MS) return GlassPoseBuilder.make("lava", from.x, from.z, sinceMs - GlassBridgeRules.FALL_MS, GlassBridgeLayout.LAVA_Y);
    const ratio = sinceMs / GlassBridgeRules.FALL_MS;
    return GlassPoseBuilder.make("fall", from.x, from.z, sinceMs, GlassBridgeLayout.LAVA_Y * ratio * ratio, GlassPoseBuilder.FORWARD, ratio);
  }

  private between(kind: GlassPoseKind, from: GlassPoint, to: GlassPoint, ratio: number, sinceMs: number): GlassPose {
    const clamped = MathUtil.clamp(ratio, 0, 1);
    const lift = kind === "jump" ? Math.sin(clamped * Math.PI) * 0.9 : 0;
    const dx = to.x - from.x, dz = to.z - from.z;
    const facing = Math.abs(dx) > 0.01 && Math.abs(dx) > Math.abs(dz) ? Math.atan2(dx, -dz) * 0.5 : GlassPoseBuilder.FORWARD;
    return GlassPoseBuilder.make(kind, MathUtil.lerp(from.x, to.x, clamped), MathUtil.lerp(from.z, to.z, clamped), sinceMs, lift, facing);
  }
}
