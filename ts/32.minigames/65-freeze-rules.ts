type FreezePhaseKind = "idle" | "safe" | "warning" | "look";
type FreezePose = "idle" | "run" | "hit" | "cheer";

class FreezeRules {
  static readonly TRACK_LENGTH = 72;
  static readonly LANE_COUNT = 6;
  static readonly LANE_WIDTH = 2.5;
  static readonly RUN_SPEED = 2.9;
  static readonly ACCEL_S = 0.12;
  static readonly GAME_MS = 60000;
  static readonly END_GRACE_MS = 1200;
  static readonly ALL_FINISHED_DELAY_MS = 1500;
  static readonly SAFE_MIN_MS = 2000;
  static readonly SAFE_MAX_MS = 4500;
  static readonly WARNING_MS = 300;
  static readonly LOOK_MIN_MS = 1200;
  static readonly LOOK_MAX_MS = 2500;
  static readonly GRACE_MS = 250;
  static readonly PULL_MS = 500;
  static readonly RESUME_MS = 800;
  static readonly CYCLE_LEAD_MS = 600;
  static readonly TREND_LIMIT = 0.6;
  static readonly TAIL_FACTORS: readonly number[] = [0.45, 1, 1, 2.2];
  static readonly CHEER_TEXT = "무궁화꽃이 피었습니다";
  static readonly NET_MS = 143;
  static readonly OBSERVE_SMOOTHING = 14;
  static readonly OBSERVE_EXTRAPOLATE_S = 0.3;
  static readonly OBSERVE_SNAP_DISTANCE = 8;
  static readonly COMPARE_STEP = 0.1;
}

interface FreezeCycleRecord {
  readonly n: number;
  readonly at: number;
  readonly safe: number;
  readonly look: number;
  readonly trend: number;
  readonly tail: number;
}

interface FreezeHitRecord {
  readonly id: string;
  readonly n: number;
  readonly t: number;
  readonly d: number;
}

interface FreezeFinishRecord {
  readonly t: number;
}

interface FreezePositionSnapshot {
  readonly d: number;
  readonly run: boolean;
  readonly hits: number;
  readonly fin: number;
  readonly sentAt: number;
}

class FreezeRecords {
  static cycle(value: unknown): FreezeCycleRecord | null {
    const raw = value as Partial<Record<keyof FreezeCycleRecord, unknown>> | null;
    if (!raw || typeof raw !== "object") return null;
    const numbers = [raw.n, raw.at, raw.safe, raw.look, raw.trend, raw.tail];
    if (numbers.some((entry) => typeof entry !== "number" || !isFinite(entry))) return null;
    return { n: raw.n as number, at: raw.at as number, safe: raw.safe as number, look: raw.look as number, trend: raw.trend as number, tail: raw.tail as number };
  }

  static hit(value: unknown): FreezeHitRecord | null {
    const raw = value as Partial<Record<keyof FreezeHitRecord, unknown>> | null;
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string") return null;
    const numbers = [raw.n, raw.t, raw.d];
    if (numbers.some((entry) => typeof entry !== "number" || !isFinite(entry))) return null;
    return { id: raw.id, n: raw.n as number, t: raw.t as number, d: raw.d as number };
  }

  static finish(value: unknown): FreezeFinishRecord | null {
    const raw = value as Partial<FreezeFinishRecord> | null;
    if (!raw || typeof raw !== "object" || typeof raw.t !== "number" || !isFinite(raw.t)) return null;
    return { t: raw.t };
  }
}

class FreezePositionCodec {
  private static readonly FIELD_COUNT = 5;

  static encode(runner: FreezeRunnerState, sentAt: number): string {
    return [MathUtil.round2(runner.dist), runner.moving ? 1 : 0, runner.hits, Math.round(Math.max(runner.finishedAt, runner.reportedFinishAt)), Math.round(sentAt)].join(",");
  }

  static decode(raw: unknown): FreezePositionSnapshot | null {
    const parts = String(raw).split(",").map((part) => +part);
    if (parts.length < FreezePositionCodec.FIELD_COUNT || parts.some((part) => !isFinite(part))) return null;
    return { d: parts[0], run: parts[1] === 1, hits: parts[2], fin: parts[3], sentAt: parts[4] };
  }
}

interface FreezePhase {
  readonly kind: FreezePhaseKind;
  readonly sinceMs: number;
  readonly leftMs: number;
  readonly cycle: FreezeCycle | null;
}

class FreezeCheer {
  private static readonly SYLLABLES = FreezeRules.CHEER_TEXT.replace(/ /g, "").length;
  private static readonly MIN_WEIGHT = 0.15;

  static starts(safeMs: number, trend: number, tail: number): number[] {
    const count = FreezeCheer.SYLLABLES;
    const weights: number[] = [];
    for (let index = 0; index < count; index++) {
      const slope = 1 + trend * (2 * index / (count - 1) - 1);
      weights.push(Math.max(FreezeCheer.MIN_WEIGHT, index >= count - 2 ? slope * tail : slope));
    }
    const unit = safeMs / weights.reduce((sum, weight) => sum + weight, 0);
    const starts: number[] = [];
    let at = 0;
    weights.forEach((weight) => {
      starts.push(at);
      at += weight * unit;
    });
    return starts;
  }

  static text(starts: readonly number[], elapsedMs: number): string {
    const shown = starts.filter((start) => start <= elapsedMs).length;
    let seen = 0;
    let out = "";
    let pendingSpace = false;
    for (const letter of FreezeRules.CHEER_TEXT) {
      if (letter === " ") {
        pendingSpace = true;
        continue;
      }
      if (seen >= shown) break;
      if (pendingSpace) out += " ";
      pendingSpace = false;
      out += letter;
      seen++;
    }
    return out;
  }
}

class FreezeCycle {
  private readonly starts: readonly number[];

  constructor(readonly record: FreezeCycleRecord) {
    this.starts = FreezeCheer.starts(record.safe, record.trend, record.tail);
  }

  get n(): number { return this.record.n; }
  get at(): number { return this.record.at; }
  safeEnd(): number { return this.record.at + this.record.safe; }
  warningEnd(): number { return this.safeEnd() + FreezeRules.WARNING_MS; }
  end(): number { return this.warningEnd() + this.record.look; }

  phaseAt(now: number): FreezePhase {
    if (now < this.safeEnd()) return { kind: "safe", sinceMs: now - this.record.at, leftMs: this.safeEnd() - now, cycle: this };
    if (now < this.warningEnd()) return { kind: "warning", sinceMs: now - this.safeEnd(), leftMs: this.warningEnd() - now, cycle: this };
    if (now < this.end()) return { kind: "look", sinceMs: now - this.warningEnd(), leftMs: this.end() - now, cycle: this };
    return { kind: "idle", sinceMs: now - this.end(), leftMs: 0, cycle: this };
  }

  cheerAt(now: number): string {
    return FreezeCheer.text(this.starts, now - this.record.at);
  }
}

class FreezeCycleLog {
  private readonly ordered: FreezeCycle[] = [];
  private readonly numbers = new Set<number>();

  accept(value: unknown): boolean {
    const record = FreezeRecords.cycle(value);
    return record !== null && this.add(record);
  }

  add(record: FreezeCycleRecord): boolean {
    if (this.numbers.has(record.n)) return false;
    this.numbers.add(record.n);
    this.ordered.push(new FreezeCycle(record));
    this.ordered.sort((a, b) => a.n - b.n);
    return true;
  }

  latest(): FreezeCycle | null {
    return this.ordered.length ? this.ordered[this.ordered.length - 1] : null;
  }

  has(n: number): boolean {
    return this.numbers.has(n);
  }

  cycleAt(now: number): FreezeCycle | null {
    let found: FreezeCycle | null = null;
    this.ordered.forEach((cycle) => {
      if (cycle.at <= now) found = cycle;
    });
    return found;
  }

  phaseAt(now: number): FreezePhase {
    const cycle = this.cycleAt(now);
    return cycle ? cycle.phaseAt(now) : { kind: "idle", sinceMs: 0, leftMs: 0, cycle: null };
  }

  isDangerous(now: number): boolean {
    const phase = this.phaseAt(now);
    return phase.kind === "look" && phase.sinceMs >= FreezeRules.GRACE_MS;
  }
}

class FreezeCycleDraft {
  static draw(n: number, at: number, random: RandomRange): FreezeCycleRecord {
    return {
      n,
      at,
      safe: FreezeCycleDraft.tenMs(random.between(FreezeRules.SAFE_MIN_MS, FreezeRules.SAFE_MAX_MS)),
      look: FreezeCycleDraft.tenMs(random.between(FreezeRules.LOOK_MIN_MS, FreezeRules.LOOK_MAX_MS)),
      trend: MathUtil.round2(random.between(-FreezeRules.TREND_LIMIT, FreezeRules.TREND_LIMIT)),
      tail: FreezeRules.TAIL_FACTORS[random.index(FreezeRules.TAIL_FACTORS.length)]
    };
  }

  private static tenMs(value: number): number {
    return Math.round(value / 10) * 10;
  }
}

class FreezeLanes {
  static xOf(lane: number): number {
    return (lane - (FreezeRules.LANE_COUNT - 1) / 2) * FreezeRules.LANE_WIDTH;
  }

  static assign(ids: readonly string[], seed: number): Map<string, number> {
    const lanes: number[] = [];
    for (let lane = 0; lane < FreezeRules.LANE_COUNT; lane++) lanes.push(lane);
    const random = new SeededRandom(seed ^ 0x2f6b9c15);
    for (let index = lanes.length - 1; index > 0; index--) {
      const swap = Math.floor(random.next() * (index + 1));
      const keep = lanes[index];
      lanes[index] = lanes[swap];
      lanes[swap] = keep;
    }
    const assigned = new Map<string, number>();
    ids.forEach((id, index) => assigned.set(id, lanes[index % lanes.length]));
    return assigned;
  }
}

class FreezeStepResult {
  static readonly NONE = new FreezeStepResult(false, false);
  static readonly CAUGHT = new FreezeStepResult(true, false);
  static readonly FINISHED = new FreezeStepResult(false, true);

  private constructor(readonly caught: boolean, readonly finished: boolean) {}
}

class FreezeRunnerState {
  dist = 0;
  speed = 0;
  hits = 0;
  caughtAt = 0;
  finishedAt = 0;
  reportedFinishAt = 0;
  finishConfirmed = false;
  moving = false;
  private pullFrom = 0;
  private goal: FreezePositionSnapshot = { d: 0, run: false, hits: 0, fin: 0, sentAt: 0 };

  constructor(readonly participant: MatchParticipant, readonly lane: number) {}

  get id(): string { return this.participant.id; }

  isFinished(): boolean { return this.finishedAt > 0; }
  isPulling(now: number): boolean { return this.caughtAt > 0 && now < this.caughtAt + FreezeRules.PULL_MS; }
  isLocked(now: number): boolean { return this.caughtAt > 0 && now < this.caughtAt + FreezeRules.PULL_MS + FreezeRules.RESUME_MS; }
  progress(): number { return MathUtil.clamp(this.dist / FreezeRules.TRACK_LENGTH, 0, 1); }

  pose(now: number): FreezePose {
    if (this.isFinished()) return "cheer";
    if (this.caughtAt > 0 && now < this.caughtAt + FreezeRules.PULL_MS) return "hit";
    return this.moving ? "run" : "idle";
  }

  applyCatch(n: number, at: number, from: number): boolean {
    if (n <= this.hits) return false;
    this.hits = n;
    this.caughtAt = at;
    this.pullFrom = from;
    this.speed = 0;
    this.moving = false;
    return true;
  }

  reset(): void {
    this.dist = 0;
    this.speed = 0;
    this.hits = 0;
    this.caughtAt = 0;
    this.finishedAt = 0;
    this.reportedFinishAt = 0;
    this.finishConfirmed = false;
    this.moving = false;
    this.pullFrom = 0;
  }

  nextHitNumber(): number {
    return this.hits + 1;
  }

  confirmFinish(t: number): void {
    this.finishConfirmed = true;
    this.finishedAt = t;
    this.reportedFinishAt = t;
    this.dist = FreezeRules.TRACK_LENGTH;
    this.speed = 0;
    this.moving = false;
  }

  advance(dt: number, now: number, wantsRun: boolean, dangerous: boolean, endAt: number): FreezeStepResult {
    if (this.isFinished() || now >= endAt) {
      this.moving = false;
      this.speed = 0;
      return FreezeStepResult.NONE;
    }
    if (this.isLocked(now)) {
      this.followPull(now);
      return FreezeStepResult.NONE;
    }
    if (dangerous && wantsRun) {
      this.applyCatch(this.nextHitNumber(), now, this.dist);
      return FreezeStepResult.CAUGHT;
    }
    if (!wantsRun) {
      this.speed = 0;
      this.moving = false;
      return FreezeStepResult.NONE;
    }
    this.moving = true;
    this.speed = Math.min(FreezeRules.RUN_SPEED, this.speed + FreezeRules.RUN_SPEED / FreezeRules.ACCEL_S * dt);
    this.dist += this.speed * dt;
    if (this.dist < FreezeRules.TRACK_LENGTH) return FreezeStepResult.NONE;
    const overshootMs = this.speed > 0 ? (this.dist - FreezeRules.TRACK_LENGTH) / this.speed * 1000 : 0;
    this.reportedFinishAt = Math.max(1, Math.round(now - overshootMs));
    this.finishedAt = this.reportedFinishAt;
    this.dist = FreezeRules.TRACK_LENGTH;
    this.speed = 0;
    this.moving = false;
    return FreezeStepResult.FINISHED;
  }

  observe(snapshot: FreezePositionSnapshot): void {
    if (snapshot.sentAt < this.goal.sentAt) return;
    this.goal = snapshot;
    if (snapshot.fin > 0 && this.reportedFinishAt === 0) this.reportedFinishAt = snapshot.fin;
  }

  stepObserved(dt: number, now: number): void {
    if (this.isFinished()) return;
    if (this.isLocked(now)) {
      this.followPull(now);
      return;
    }
    const goal = this.goal;
    this.moving = goal.run;
    const age = MathUtil.clamp((now - goal.sentAt) / 1000, 0, FreezeRules.OBSERVE_EXTRAPOLATE_S);
    const target = Math.min(FreezeRules.TRACK_LENGTH, goal.d + (goal.run ? FreezeRules.RUN_SPEED * age : 0));
    if (Math.abs(target - this.dist) > FreezeRules.OBSERVE_SNAP_DISTANCE) this.dist = target;
    else this.dist += (target - this.dist) * Math.min(1, dt * FreezeRules.OBSERVE_SMOOTHING);
  }

  private followPull(now: number): void {
    this.speed = 0;
    this.moving = false;
    const progress = MathUtil.clamp((now - this.caughtAt) / FreezeRules.PULL_MS, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    this.dist = this.pullFrom * (1 - eased);
  }
}

class FreezeStandings {
  constructor(private readonly runners: readonly FreezeRunnerState[]) {}

  order(): FreezeRunnerState[] {
    return this.runners.slice().sort((a, b) => this.groupOf(a) - this.groupOf(b) || this.valueOf(a) - this.valueOf(b) || (a.id < b.id ? -1 : 1));
  }

  rankOf(id: string): number {
    const ranks = this.rankMap();
    return ranks.get(id) || this.runners.length;
  }

  allFinished(): boolean {
    return this.runners.length > 0 && this.runners.every((runner) => runner.isFinished());
  }

  lastFinishAt(): number {
    return this.runners.reduce((latest, runner) => Math.max(latest, runner.finishedAt), 0);
  }

  ranking(): RankEntry[] {
    const ranks = this.rankMap();
    return this.runners.map((runner) => ({ id: runner.id, rank: ranks.get(runner.id) as number }));
  }

  private rankMap(): Map<string, number> {
    const ranks = new Map<string, number>();
    const ordered = this.order();
    ordered.forEach((runner, index) => {
      const previous = index > 0 ? ordered[index - 1] : null;
      const tied = previous !== null && this.groupOf(previous) === this.groupOf(runner) && this.valueOf(previous) === this.valueOf(runner);
      ranks.set(runner.id, tied && previous ? ranks.get(previous.id) as number : index + 1);
    });
    return ranks;
  }

  private groupOf(runner: FreezeRunnerState): number {
    return runner.isFinished() ? 0 : 1;
  }

  private valueOf(runner: FreezeRunnerState): number {
    return runner.isFinished() ? runner.finishedAt : -Math.round(runner.dist / FreezeRules.COMPARE_STEP);
  }
}
