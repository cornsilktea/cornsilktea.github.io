class BombPassRules {
  static readonly ARENA_RADIUS = 11;
  static readonly ARENA_LIMIT = BombPassRules.ARENA_RADIUS - 0.6;
  static readonly START_RING_RADIUS = 6;
  static readonly MAX_SPEED = 6.2;
  static readonly HOLDER_SPEED_BONUS = 1.08;
  static readonly ACCEL = 34;
  static readonly FRICTION = 20;
  static readonly DASH_DISTANCE = 4;
  static readonly DASH_TIME_MS = 180;
  static readonly DASH_SPEED = BombPassRules.DASH_DISTANCE / (BombPassRules.DASH_TIME_MS / 1000);
  static readonly DASH_COOLDOWN_MS = 4000;
  static readonly DASH_EXIT_SPEED = 7;
  static readonly PASS_RANGE = 1.3;
  static readonly GIVER_IMMUNITY_MS = 1500;
  static readonly TAKER_LOCK_MS = 600;
  static readonly FIRST_BOMB_DELAY_MS = 1500;
  static readonly NEXT_BOMB_DELAY_MS = 1500;
  static readonly FUSE_START_S = 14;
  static readonly FUSE_STEP_S = 1.5;
  static readonly FUSE_FLOOR_S = 6;
  static readonly FUSE_JITTER = 0.2;
  static readonly SUDDEN_AFTER_MS = 90000;
  static readonly SUDDEN_FUSE_S = 4;
  static readonly WARNING_FUSE_MS = 3000;
  static readonly BLAST_RADIUS = 3.5;
  static readonly BLAST_IMPULSE = 11;
  static readonly BLAST_VISIBLE_MS = 700;
  static readonly SHIELD_COUNT = 6;
  static readonly SHIELD_FIRST_MS = 8000;
  static readonly SHIELD_INTERVAL_MS = 15000;
  static readonly SHIELD_JITTER_MS = 4000;
  static readonly SHIELD_LIFETIME_MS = 10000;
  static readonly SHIELD_DURATION_MS = 5000;
  static readonly SHIELD_PICKUP_RANGE = 1.1;
  static readonly SHIELD_SPAWN_RADIUS = 7.5;
  static readonly END_DELAY_MS = 1500;
  static readonly NET_MS = 143;
  static readonly OBSERVE_SMOOTHING = 14;
  static readonly OBSERVE_EXTRAPOLATE_S = 0.3;
  static readonly OBSERVE_SNAP_DISTANCE = 6;
}

class BombPassAiTuning {
  static readonly THINK_MIN_MS = 150;
  static readonly THINK_MAX_MS = 260;
  static readonly SPEED_FACTOR = 0.9;
  static readonly AIM_NOISE = 0.25;
  static readonly LEAD_S = 0.3;
  static readonly CHASE_DASH_MIN = 2.4;
  static readonly CHASE_DASH_MAX = 4.4;
  static readonly CHASE_DASH_CHANCE = 0.4;
  static readonly FLEE_DASH_DISTANCE = 2.6;
  static readonly FLEE_DASH_CHANCE = 0.6;
  static readonly SAFE_DISTANCE = 8;
  static readonly CALM_SPEED = 0.5;
  static readonly EDGE_PULL = 1.6;
  static readonly CORNER_EDGE = 0.75;
  static readonly CORNER_TANGENT = 0.9;
  static readonly SHIELD_SEEK_DISTANCE = 6;
  static readonly SHIELD_SEEK_SAFE = 4;
  static readonly MIN_LENGTH = 0.01;
}

interface BombPassStateRecord {
  readonly seq: number;
  readonly k: number;
  readonly holder: string;
  readonly prev: string;
  readonly passAt: number;
  readonly fuseAt: number;
  readonly spawnAt: number;
}

interface BombPassOutRecord {
  readonly t: number;
  readonly left?: number;
}

interface BombPassShieldRecord {
  readonly by: string;
  readonly t: number;
}

interface BombPassPositionSnapshot {
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
  readonly yaw: number;
  readonly dashUntil: number;
  readonly sentAt: number;
}

class BombPassRecords {
  static state(value: unknown): BombPassStateRecord | null {
    const raw = value as Partial<Record<keyof BombPassStateRecord, unknown>> | null;
    if (!raw || typeof raw !== "object") return null;
    const numbers = [raw.seq, raw.k, raw.passAt, raw.fuseAt, raw.spawnAt];
    if (numbers.some((entry) => typeof entry !== "number") || typeof raw.holder !== "string" || typeof raw.prev !== "string") return null;
    return {
      seq: raw.seq as number, k: raw.k as number, holder: raw.holder, prev: raw.prev,
      passAt: raw.passAt as number, fuseAt: raw.fuseAt as number, spawnAt: raw.spawnAt as number
    };
  }

  static out(value: unknown): BombPassOutRecord | null {
    const raw = value as Partial<BombPassOutRecord> | null;
    if (!raw || typeof raw !== "object" || typeof raw.t !== "number") return null;
    return { t: raw.t, left: raw.left };
  }

  static shield(value: unknown): BombPassShieldRecord | null {
    const raw = value as Partial<BombPassShieldRecord> | null;
    if (!raw || typeof raw !== "object" || typeof raw.by !== "string" || typeof raw.t !== "number") return null;
    return { by: raw.by, t: raw.t };
  }
}

class BombPassPositionCodec {
  private static readonly FIELD_COUNT = 7;

  static encode(runner: BombPassRunner, t: number): string {
    return [
      MathUtil.round2(runner.x), MathUtil.round2(runner.z), MathUtil.round2(runner.vx), MathUtil.round2(runner.vz),
      MathUtil.round2(runner.yaw), Math.round(runner.dashUntil), Math.round(t)
    ].join(",");
  }

  static decode(raw: unknown): BombPassPositionSnapshot | null {
    const parts = String(raw).split(",").map((part) => +part);
    if (parts.length < BombPassPositionCodec.FIELD_COUNT || parts.some((part) => !isFinite(part))) return null;
    return { x: parts[0], z: parts[1], vx: parts[2], vz: parts[3], yaw: parts[4], dashUntil: parts[5], sentAt: parts[6] };
  }
}

class BombPassFuse {
  constructor(private readonly seed: number) {}

  lengthMs(bombIndex: number, elapsedMs: number): number {
    if (elapsedMs > BombPassRules.SUDDEN_AFTER_MS) return BombPassRules.SUDDEN_FUSE_S * 1000;
    const base = Math.max(BombPassRules.FUSE_FLOOR_S, BombPassRules.FUSE_START_S - BombPassRules.FUSE_STEP_S * bombIndex);
    const wobble = new SeededRandom(this.seed + bombIndex * 7919).next() * 2 - 1;
    return Math.round(base * (1 + wobble * BombPassRules.FUSE_JITTER) * 1000);
  }
}

class BombPassState {
  private record: BombPassStateRecord;

  constructor(firstSpawnAt: number) {
    this.record = { seq: 0, k: 0, holder: "", prev: "", passAt: 0, fuseAt: 0, spawnAt: firstSpawnAt };
  }

  snapshot(): BombPassStateRecord {
    return this.record;
  }

  holderId(): string {
    return this.record.holder;
  }

  hasBomb(): boolean {
    return this.record.holder !== "";
  }

  adopt(record: BombPassStateRecord): void {
    if (record.seq > this.record.seq) this.record = record;
  }

  accept(value: unknown): boolean {
    const incoming = BombPassRecords.state(value);
    if (!incoming || incoming.seq <= this.record.seq) return false;
    this.record = incoming;
    return true;
  }

  canReceive(id: string, now: number): boolean {
    return !(id === this.record.prev && now - this.record.passAt < BombPassRules.GIVER_IMMUNITY_MS);
  }

  canGive(now: number): boolean {
    return now - this.record.passAt >= BombPassRules.TAKER_LOCK_MS;
  }

  fuseLeftMs(now: number): number {
    return this.hasBomb() ? Math.max(0, this.record.fuseAt - now) : 0;
  }

  afterSpawn(holder: string, now: number, fuseMs: number): BombPassStateRecord {
    return { seq: this.record.seq + 1, k: this.record.k, holder, prev: "", passAt: now, fuseAt: now + fuseMs, spawnAt: 0 };
  }

  afterPass(target: string, now: number): BombPassStateRecord {
    return { ...this.record, seq: this.record.seq + 1, holder: target, prev: this.record.holder, passAt: now };
  }

  afterBlast(now: number): BombPassStateRecord {
    return { seq: this.record.seq + 1, k: this.record.k + 1, holder: "", prev: "", passAt: 0, fuseAt: 0, spawnAt: now + BombPassRules.NEXT_BOMB_DELAY_MS };
  }
}

class BombPassRunner {
  x: number;
  z: number;
  vx = 0;
  vz = 0;
  yaw: number;
  dashUntil = 0;
  dashReadyAt = 0;
  shieldUntil = 0;
  outAt = 0;
  private steerX = 0;
  private steerZ = 0;
  private speedFactor = 1;
  private dashX = 0;
  private dashZ = 0;
  private wasDashing = false;
  private goal: BombPassPositionSnapshot;

  constructor(readonly participant: MatchParticipant, x: number, z: number) {
    this.x = x;
    this.z = z;
    this.yaw = Math.atan2(-x, -z);
    this.goal = { x, z, vx: 0, vz: 0, yaw: this.yaw, dashUntil: 0, sentAt: 0 };
  }

  get id(): string { return this.participant.id; }

  isOut(): boolean { return this.outAt > 0; }
  isDashing(t: number): boolean { return t < this.dashUntil; }
  shieldActive(t: number): boolean { return t < this.shieldUntil; }
  speed(): number { return Math.hypot(this.vx, this.vz); }

  eliminate(t: number): void {
    this.outAt = Math.max(1, t);
    this.vx = 0;
    this.vz = 0;
  }

  grantShield(from: number): void {
    this.shieldUntil = from + BombPassRules.SHIELD_DURATION_MS;
  }

  steer(x: number, z: number, factor: number): void {
    this.steerX = x;
    this.steerZ = z;
    this.speedFactor = factor;
  }

  dashCooldownLeft(t: number): number {
    return MathUtil.clamp((this.dashReadyAt - t) / BombPassRules.DASH_COOLDOWN_MS, 0, 1);
  }

  tryDash(t: number, dirX: number, dirZ: number): boolean {
    if (this.isOut() || t < this.dashReadyAt || this.isDashing(t)) return false;
    const direction = this.dashDirection(dirX, dirZ);
    this.dashX = direction.x;
    this.dashZ = direction.z;
    this.dashUntil = t + BombPassRules.DASH_TIME_MS;
    this.dashReadyAt = t + BombPassRules.DASH_COOLDOWN_MS;
    this.yaw = Math.atan2(direction.x, direction.z);
    return true;
  }

  shove(impulseX: number, impulseZ: number): void {
    this.vx += impulseX;
    this.vz += impulseZ;
  }

  step(dt: number, t: number, holding: boolean): void {
    const dashing = this.isDashing(t);
    if (dashing) {
      this.vx = this.dashX * BombPassRules.DASH_SPEED;
      this.vz = this.dashZ * BombPassRules.DASH_SPEED;
    } else {
      if (this.wasDashing) this.limitSpeed(BombPassRules.DASH_EXIT_SPEED);
      this.accelerate(dt, holding);
    }
    this.wasDashing = dashing;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.keepInside();
    if (this.speed() > 0.6) this.yaw = Math.atan2(this.vx, this.vz);
  }

  observe(snapshot: BombPassPositionSnapshot): void {
    if (snapshot.sentAt >= this.goal.sentAt) this.goal = snapshot;
  }

  stepObserved(dt: number, t: number): void {
    const goal = this.goal;
    const age = MathUtil.clamp((t - goal.sentAt) / 1000, 0, BombPassRules.OBSERVE_EXTRAPOLATE_S);
    const targetX = goal.x + goal.vx * age, targetZ = goal.z + goal.vz * age;
    if (MathUtil.distance(targetX, targetZ, this.x, this.z) > BombPassRules.OBSERVE_SNAP_DISTANCE) {
      this.x = targetX;
      this.z = targetZ;
    } else {
      const ratio = Math.min(1, dt * BombPassRules.OBSERVE_SMOOTHING);
      this.x += (targetX - this.x) * ratio;
      this.z += (targetZ - this.z) * ratio;
    }
    this.vx = goal.vx;
    this.vz = goal.vz;
    this.yaw = goal.yaw;
    this.dashUntil = goal.dashUntil;
  }

  private dashDirection(dirX: number, dirZ: number): { x: number; z: number } {
    const candidates = [{ x: dirX, z: dirZ }, { x: this.vx, z: this.vz }, { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }];
    const chosen = candidates.find((candidate) => Math.hypot(candidate.x, candidate.z) > 0.1) as { x: number; z: number };
    const length = Math.hypot(chosen.x, chosen.z);
    return { x: chosen.x / length, z: chosen.z / length };
  }

  private accelerate(dt: number, holding: boolean): void {
    const steerLength = Math.hypot(this.steerX, this.steerZ);
    const top = BombPassRules.MAX_SPEED * this.speedFactor * (holding ? BombPassRules.HOLDER_SPEED_BONUS : 1);
    const wantX = steerLength > 0.01 ? this.steerX * top : 0;
    const wantZ = steerLength > 0.01 ? this.steerZ * top : 0;
    const gapX = wantX - this.vx, gapZ = wantZ - this.vz;
    const gap = Math.hypot(gapX, gapZ);
    const allowed = (steerLength > 0.01 ? BombPassRules.ACCEL : BombPassRules.FRICTION) * dt;
    if (gap <= allowed) {
      this.vx = wantX;
      this.vz = wantZ;
    } else {
      this.vx += gapX / gap * allowed;
      this.vz += gapZ / gap * allowed;
    }
  }

  private limitSpeed(limit: number): void {
    const speed = this.speed();
    if (speed <= limit) return;
    this.vx *= limit / speed;
    this.vz *= limit / speed;
  }

  private keepInside(): void {
    const distance = Math.hypot(this.x, this.z);
    if (distance <= BombPassRules.ARENA_LIMIT) return;
    const nx = this.x / distance, nz = this.z / distance;
    this.x = nx * BombPassRules.ARENA_LIMIT;
    this.z = nz * BombPassRules.ARENA_LIMIT;
    const outward = this.vx * nx + this.vz * nz;
    if (outward > 0) {
      this.vx -= outward * nx;
      this.vz -= outward * nz;
    }
  }
}

class BombPassShield {
  constructor(readonly index: number, readonly x: number, readonly z: number, readonly appearAt: number) {}

  isLiveAt(now: number): boolean {
    return now >= this.appearAt && now < this.appearAt + BombPassRules.SHIELD_LIFETIME_MS;
  }
}

class BombPassShields {
  private readonly items: BombPassShield[] = [];
  private readonly taken = new Set<number>();

  constructor(seed: number, startAt: number) {
    const random = new SeededRandom(seed ^ 0x5bd1e995);
    for (let index = 0; index < BombPassRules.SHIELD_COUNT; index++) {
      const jitter = Math.round((random.next() - 0.5) * BombPassRules.SHIELD_JITTER_MS);
      const angle = random.next() * Math.PI * 2;
      const radius = Math.sqrt(random.next()) * BombPassRules.SHIELD_SPAWN_RADIUS;
      const appearAt = startAt + BombPassRules.SHIELD_FIRST_MS + index * BombPassRules.SHIELD_INTERVAL_MS + jitter;
      this.items.push(new BombPassShield(index, Math.cos(angle) * radius, Math.sin(angle) * radius, appearAt));
    }
  }

  all(): readonly BombPassShield[] {
    return this.items;
  }

  available(now: number): BombPassShield[] {
    return this.items.filter((item) => item.isLiveAt(now) && !this.taken.has(item.index));
  }

  nearestAvailable(now: number, x: number, z: number): BombPassShield | null {
    let best: BombPassShield | null = null;
    let bestDistance = Infinity;
    this.available(now).forEach((item) => {
      const distance = MathUtil.distance(item.x, item.z, x, z);
      if (distance < bestDistance) {
        best = item;
        bestDistance = distance;
      }
    });
    return best;
  }

  markTaken(index: number): void {
    this.taken.add(index);
  }

  isTaken(index: number): boolean {
    return this.taken.has(index);
  }
}

interface BombPassSituation {
  readonly now: number;
  readonly arena: BombPassArena;
  readonly state: BombPassState;
  readonly shields: BombPassShields;
}

class BombPassPlan {
  static readonly IDLE = new BombPassPlan(0, 0, 0, false);

  constructor(readonly x: number, readonly z: number, readonly speed: number, readonly dash: boolean) {}

  static toward(dx: number, dz: number, speed: number, dash: boolean, noise: number): BombPassPlan {
    const length = Math.hypot(dx, dz);
    if (length < BombPassAiTuning.MIN_LENGTH) return BombPassPlan.IDLE;
    const ux = dx / length, uz = dz / length;
    const cos = Math.cos(noise), sin = Math.sin(noise);
    return new BombPassPlan(ux * cos - uz * sin, ux * sin + uz * cos, speed, dash);
  }
}

class BombPassGeometry {
  static nearest(from: BombPassRunner, others: readonly BombPassRunner[]): BombPassRunner | null {
    let best: BombPassRunner | null = null;
    let bestDistance = Infinity;
    others.forEach((other) => {
      const distance = MathUtil.distance(from.x, from.z, other.x, other.z);
      if (distance < bestDistance) {
        best = other;
        bestDistance = distance;
      }
    });
    return best;
  }
}

interface BombPassBehavior {
  applies(self: BombPassRunner, situation: BombPassSituation): boolean;
  plan(self: BombPassRunner, situation: BombPassSituation, random: RandomRange): BombPassPlan;
}

class BombPassChaseBehavior implements BombPassBehavior {
  applies(self: BombPassRunner, situation: BombPassSituation): boolean {
    return situation.state.holderId() === self.id;
  }

  plan(self: BombPassRunner, situation: BombPassSituation, random: RandomRange): BombPassPlan {
    const now = situation.now;
    const others = situation.arena.alive().map((contestant) => contestant.runner).filter((runner) => runner !== self);
    const takeable = others.filter((runner) => situation.state.canReceive(runner.id, now) && !runner.shieldActive(now));
    const target = BombPassGeometry.nearest(self, takeable.length ? takeable : others);
    if (!target) return BombPassPlan.IDLE;
    const dx = target.x + target.vx * BombPassAiTuning.LEAD_S - self.x;
    const dz = target.z + target.vz * BombPassAiTuning.LEAD_S - self.z;
    const distance = Math.hypot(dx, dz);
    const dash = distance >= BombPassAiTuning.CHASE_DASH_MIN && distance <= BombPassAiTuning.CHASE_DASH_MAX && random.chance(BombPassAiTuning.CHASE_DASH_CHANCE);
    return BombPassPlan.toward(dx, dz, 1, dash, random.between(-BombPassAiTuning.AIM_NOISE, BombPassAiTuning.AIM_NOISE));
  }
}

class BombPassFleeBehavior implements BombPassBehavior {
  applies(self: BombPassRunner, situation: BombPassSituation): boolean {
    return true;
  }

  plan(self: BombPassRunner, situation: BombPassSituation, random: RandomRange): BombPassPlan {
    const holder = situation.arena.get(situation.state.holderId());
    if (!holder || holder.runner.isOut()) return BombPassPlan.toward(-self.x, -self.z, BombPassAiTuning.CALM_SPEED, false, 0);
    const threat = holder.runner;
    const distance = Math.max(BombPassAiTuning.MIN_LENGTH, MathUtil.distance(self.x, self.z, threat.x, threat.z));
    const shield = situation.shields.nearestAvailable(situation.now, self.x, self.z);
    const wantsShield = shield !== null && distance > BombPassAiTuning.SHIELD_SEEK_SAFE && MathUtil.distance(self.x, self.z, shield.x, shield.z) < BombPassAiTuning.SHIELD_SEEK_DISTANCE;
    const noise = random.between(-BombPassAiTuning.AIM_NOISE, BombPassAiTuning.AIM_NOISE);
    if (wantsShield && shield) return BombPassPlan.toward(shield.x - self.x, shield.z - self.z, 1, false, noise);
    const away = this.awayFrom(self, threat, distance);
    const dash = distance < BombPassAiTuning.FLEE_DASH_DISTANCE && random.chance(BombPassAiTuning.FLEE_DASH_CHANCE);
    const speed = distance > BombPassAiTuning.SAFE_DISTANCE ? BombPassAiTuning.CALM_SPEED : 1;
    return BombPassPlan.toward(away.x, away.z, speed, dash, noise);
  }

  private awayFrom(self: BombPassRunner, threat: BombPassRunner, distance: number): { x: number; z: number } {
    let ax = (self.x - threat.x) / distance, az = (self.z - threat.z) / distance;
    const radius = Math.max(BombPassAiTuning.MIN_LENGTH, Math.hypot(self.x, self.z));
    const edge = radius / BombPassRules.ARENA_RADIUS;
    const pull = edge * edge * BombPassAiTuning.EDGE_PULL;
    ax -= self.x / radius * pull;
    az -= self.z / radius * pull;
    if (edge > BombPassAiTuning.CORNER_EDGE) {
      const tx = -self.z / radius, tz = self.x / radius;
      const side = ax * tx + az * tz >= 0 ? 1 : -1;
      ax += tx * side * BombPassAiTuning.CORNER_TANGENT;
      az += tz * side * BombPassAiTuning.CORNER_TANGENT;
    }
    return { x: ax, z: az };
  }
}

abstract class BombPassDriver {
  abstract simulatesHere(): boolean;

  protected abstract decide(runner: BombPassRunner, situation: BombPassSituation): void;

  advance(runner: BombPassRunner, dt: number, situation: BombPassSituation): void {
    if (runner.isOut()) return;
    if (this.simulatesHere()) {
      this.decide(runner, situation);
      runner.step(dt, situation.now, situation.state.holderId() === runner.id);
    } else {
      runner.stepObserved(dt, situation.now);
    }
  }
}

class BombPassLocalDriver extends BombPassDriver {
  constructor(private readonly movement: MovementSource) {
    super();
  }

  simulatesHere(): boolean {
    return true;
  }

  protected decide(runner: BombPassRunner, situation: BombPassSituation): void {
    const axis = this.movement.axis();
    runner.steer(axis.x, axis.z, 1);
  }
}

class BombPassRemoteDriver extends BombPassDriver {
  simulatesHere(): boolean {
    return false;
  }

  protected decide(runner: BombPassRunner, situation: BombPassSituation): void {
    return;
  }
}

class BombPassAiDriver extends BombPassDriver {
  private plan = BombPassPlan.IDLE;
  private nextThinkAt = 0;

  constructor(private readonly behaviors: readonly BombPassBehavior[], private readonly host: HostGate, private readonly random: RandomRange) {
    super();
  }

  simulatesHere(): boolean {
    return this.host.isHost();
  }

  protected decide(runner: BombPassRunner, situation: BombPassSituation): void {
    if (situation.now >= this.nextThinkAt) this.think(runner, situation);
    runner.steer(this.plan.x, this.plan.z, this.plan.speed * BombPassAiTuning.SPEED_FACTOR);
  }

  private think(runner: BombPassRunner, situation: BombPassSituation): void {
    const behavior = this.behaviors.find((entry) => entry.applies(runner, situation)) as BombPassBehavior;
    this.plan = behavior.plan(runner, situation, this.random);
    this.nextThinkAt = situation.now + this.random.between(BombPassAiTuning.THINK_MIN_MS, BombPassAiTuning.THINK_MAX_MS);
    if (this.plan.dash) runner.tryDash(situation.now, this.plan.x, this.plan.z);
  }
}

class BombPassDriverFactory {
  private readonly behaviors: readonly BombPassBehavior[] = [new BombPassChaseBehavior(), new BombPassFleeBehavior()];

  constructor(
    private readonly localId: string,
    private readonly movement: MovementSource,
    private readonly host: HostGate,
    private readonly random: RandomSource
  ) {}

  create(participant: MatchParticipant): BombPassDriver {
    if (participant.id === this.localId) return new BombPassLocalDriver(this.movement);
    if (participant.ai) return new BombPassAiDriver(this.behaviors, this.host, new RandomRange(this.random));
    return new BombPassRemoteDriver();
  }
}

class BombPassContestant {
  constructor(readonly runner: BombPassRunner, readonly driver: BombPassDriver) {}
}

class BombPassArena {
  private readonly contestants: BombPassContestant[];
  private readonly byId = new Map<string, BombPassContestant>();

  constructor(participants: readonly MatchParticipant[], drivers: BombPassDriverFactory) {
    this.contestants = participants.map((participant, index) => {
      const angle = index / participants.length * Math.PI * 2;
      const runner = new BombPassRunner(participant, Math.cos(angle) * BombPassRules.START_RING_RADIUS, Math.sin(angle) * BombPassRules.START_RING_RADIUS);
      return new BombPassContestant(runner, drivers.create(participant));
    });
    this.contestants.forEach((contestant) => this.byId.set(contestant.runner.id, contestant));
  }

  all(): readonly BombPassContestant[] {
    return this.contestants;
  }

  alive(): BombPassContestant[] {
    return this.contestants.filter((contestant) => !contestant.runner.isOut());
  }

  get(id: string): BombPassContestant | null {
    return this.byId.get(id) || null;
  }

  blast(x: number, z: number, exceptId: string): void {
    this.contestants.forEach((contestant) => {
      const runner = contestant.runner;
      if (runner.id === exceptId || runner.isOut() || !contestant.driver.simulatesHere()) return;
      const distance = MathUtil.distance(runner.x, runner.z, x, z);
      if (distance >= BombPassRules.BLAST_RADIUS) return;
      const strength = BombPassRules.BLAST_IMPULSE * (1 - distance / BombPassRules.BLAST_RADIUS);
      const nx = distance > 0.01 ? (runner.x - x) / distance : 1;
      const nz = distance > 0.01 ? (runner.z - z) / distance : 0;
      runner.shove(nx * strength, nz * strength);
    });
  }
}

class BombPassStandings {
  private readonly order: Array<{ id: string; t: number }> = [];
  private lastOutAt = 0;

  constructor(private readonly arena: BombPassArena) {}

  eliminate(id: string, t: number, now: number): boolean {
    const contestant = this.arena.get(id);
    if (!contestant || contestant.runner.isOut()) return false;
    contestant.runner.eliminate(t);
    this.order.push({ id, t });
    this.order.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    this.lastOutAt = now;
    return true;
  }

  survivors(): number {
    return this.arena.alive().length;
  }

  provisionalRank(id: string): number {
    const index = this.order.findIndex((entry) => entry.id === id);
    return index < 0 ? 1 : this.arena.all().length - index;
  }

  isOver(now: number): boolean {
    return this.arena.all().length >= CollectionRules.MIN_PLAYERS && this.survivors() <= 1 && this.lastOutAt > 0 && now - this.lastOutAt >= BombPassRules.END_DELAY_MS;
  }

  ranking(): RankEntry[] {
    const entries: RankEntry[] = this.arena.alive().map((contestant) => ({ id: contestant.runner.id, rank: 1 }));
    this.order.forEach((entry) => entries.push({ id: entry.id, rank: this.provisionalRank(entry.id) }));
    return entries;
  }
}

class BombPassWire {
  private static readonly POSITIONS = "pos";
  private static readonly STATE = "bomb";
  private static readonly STATE_KEY = "state";
  private static readonly OUT = "out";
  private static readonly SHIELD = "shield";

  static streams(): readonly WireStream[] {
    return [
      { name: BombPassWire.POSITIONS, events: ["child_added", "child_changed"] },
      { name: BombPassWire.STATE, events: ["child_added", "child_changed"] },
      { name: BombPassWire.OUT, events: ["child_added"] },
      { name: BombPassWire.SHIELD, events: ["child_added", "child_changed"] }
    ];
  }

  static handlers(target: BombPassWireTarget): Readonly<Record<string, (key: string, value: unknown) => void>> {
    return {
      [BombPassWire.POSITIONS]: (key, value) => target.receivePosition(key, value),
      [BombPassWire.STATE]: (key, value) => target.receiveState(value),
      [BombPassWire.OUT]: (key, value) => target.receiveOut(key, value),
      [BombPassWire.SHIELD]: (key, value) => target.receiveShield(key, value)
    };
  }

  constructor(private readonly wire: GameWire) {}

  publishPositions(values: Record<string, string>): void {
    this.wire.writeMany(BombPassWire.POSITIONS, values);
  }

  publishState(record: BombPassStateRecord): void {
    this.wire.set(BombPassWire.STATE, BombPassWire.STATE_KEY, record);
  }

  publishOut(id: string, record: BombPassOutRecord): void {
    this.wire.set(BombPassWire.OUT, id, record);
  }

  publishShield(index: number, record: BombPassShieldRecord): void {
    this.wire.set(BombPassWire.SHIELD, String(index), record);
  }
}

interface BombPassWireTarget {
  receivePosition(key: string, value: unknown): void;
  receiveState(value: unknown): void;
  receiveOut(key: string, value: unknown): void;
  receiveShield(key: string, value: unknown): void;
}

interface BombPassOutlet {
  declareOut(id: string, left: boolean): void;
  claimShield(index: number, by: string): void;
  publishState(record: BombPassStateRecord): void;
}

class BombPassReferee {
  private settledSeq = -1;

  constructor(
    private readonly host: HostGate,
    private readonly seed: number,
    private readonly startAt: number,
    private readonly arena: BombPassArena,
    private readonly state: BombPassState,
    private readonly shields: BombPassShields,
    private readonly fuse: BombPassFuse,
    private readonly outlet: BombPassOutlet
  ) {}

  step(now: number): void {
    if (!this.host.isHost() || now < this.startAt) return;
    this.settleLostHolder(now);
    this.spawnBomb(now);
    this.explodeIfDue(now);
    this.passIfTouching(now);
    this.collectShields(now);
  }

  private settleLostHolder(now: number): void {
    const holderId = this.state.holderId();
    if (!holderId) return;
    const holder = this.arena.get(holderId);
    if (holder && !holder.runner.isOut()) return;
    const seq = this.state.snapshot().seq;
    if (this.settledSeq === seq) return;
    this.settledSeq = seq;
    this.outlet.publishState(this.state.afterBlast(now));
  }

  private spawnBomb(now: number): void {
    const snapshot = this.state.snapshot();
    const alive = this.arena.alive();
    if (this.state.hasBomb() || alive.length < CollectionRules.MIN_PLAYERS || now < snapshot.spawnAt) return;
    const pick = Math.min(alive.length - 1, Math.floor(new SeededRandom(this.seed + 977 * (snapshot.k + 1)).next() * alive.length));
    const fuseMs = this.fuse.lengthMs(snapshot.k, now - this.startAt);
    this.outlet.publishState(this.state.afterSpawn(alive[pick].runner.id, now, fuseMs));
  }

  private explodeIfDue(now: number): void {
    if (!this.state.hasBomb() || now < this.state.snapshot().fuseAt) return;
    const holder = this.arena.get(this.state.holderId());
    if (holder && !holder.runner.isOut()) this.outlet.declareOut(holder.runner.id, false);
  }

  private passIfTouching(now: number): void {
    const holder = this.arena.get(this.state.holderId());
    if (!holder || holder.runner.isOut() || !this.state.canGive(now)) return;
    const candidates = this.arena.alive()
      .map((contestant) => contestant.runner)
      .filter((runner) => runner !== holder.runner && this.state.canReceive(runner.id, now) && !runner.shieldActive(now))
      .filter((runner) => MathUtil.distance(runner.x, runner.z, holder.runner.x, holder.runner.z) < BombPassRules.PASS_RANGE);
    const target = BombPassGeometry.nearest(holder.runner, candidates);
    if (target) this.outlet.publishState(this.state.afterPass(target.id, now));
  }

  private collectShields(now: number): void {
    this.shields.available(now).forEach((shield) => {
      const taker = this.arena.alive().find((contestant) => MathUtil.distance(contestant.runner.x, contestant.runner.z, shield.x, shield.z) < BombPassRules.SHIELD_PICKUP_RANGE);
      if (taker) this.outlet.claimShield(shield.index, taker.runner.id);
    });
  }
}

class BombPassScene {
  readonly scene: Three<"Scene">;
  readonly camera: Three<"PerspectiveCamera">;
  readonly world: Three<"Group">;

  constructor(libs: ThreeLibs) {
    const THREE = libs.THREE;
    const radius = BombPassRules.ARENA_RADIUS;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(Palette.SKY);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
    this.scene.add(new THREE.HemisphereLight(Palette.SKY_LIGHT, Palette.GROUND_LIGHT, 1.05));
    const sun = new THREE.DirectionalLight(Palette.SUN_LIGHT, 1.5);
    sun.position.set(6, 16, 9);
    this.scene.add(sun);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.5, radius + 0.5, 1, 56), new THREE.MeshLambertMaterial({ color: Palette.ISLAND }));
    rim.position.y = -0.5;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 56), new THREE.MeshLambertMaterial({ color: 0x33415F }));
    floor.rotation.x = -Math.PI / 2;
    const edge = new THREE.Mesh(new THREE.RingGeometry(radius - 0.45, radius, 56), new THREE.MeshBasicMaterial({ color: 0xD97B4F }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.02;
    const inner = new THREE.Mesh(new THREE.RingGeometry(radius * 0.5 - 0.08, radius * 0.5, 56), new THREE.MeshBasicMaterial({ color: 0x4B5B80 }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.02;
    this.world.add(rim, floor, edge, inner);
  }

  releaseMaterials(): void {
    this.scene.traverse((object) => {
      const material = (object as { material?: Three<"Material"> | Three<"Material">[] }).material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else if (material) material.dispose();
    });
  }
}

class BombPassCamera {
  private static readonly HEIGHT = 27;
  private static readonly DEPTH = 15;
  private static readonly ORBIT_RADIUS = 17;
  private static readonly ORBIT_HEIGHT = 12;
  private static readonly ORBIT_SPEED = 0.18;

  private orbit = 0;

  constructor(private readonly camera: Three<"PerspectiveCamera">, private readonly env: BrowserEnv) {}

  place(): void {
    const size = this.env.viewport();
    const zoom = Math.pow(MathUtil.clamp(1.6 / (size.width / size.height), 1, 2.1), 0.8);
    this.camera.position.set(0, BombPassCamera.HEIGHT * zoom, BombPassCamera.DEPTH * zoom);
    this.camera.lookAt(0, 0, 0);
  }

  showcase(dt: number): void {
    this.orbit += dt * BombPassCamera.ORBIT_SPEED;
    this.camera.position.set(Math.sin(this.orbit) * BombPassCamera.ORBIT_RADIUS, BombPassCamera.ORBIT_HEIGHT, Math.cos(this.orbit) * BombPassCamera.ORBIT_RADIUS);
    this.camera.lookAt(0, 1, 0);
  }
}

class BombPassBombMarker {
  private static readonly HEIGHT = 3.4;
  private static readonly DARK = 0x1B1B24;
  private static readonly HOT = 0xE24A3A;

  private readonly group: Three<"Group">;
  private readonly body: Three<"Mesh">;
  private readonly bodyMaterial: Three<"MeshBasicMaterial">;
  private readonly spark: Three<"Mesh">;

  constructor(libs: ThreeLibs, private readonly world: Three<"Group">) {
    const THREE = libs.THREE;
    this.bodyMaterial = new THREE.MeshBasicMaterial({ color: BombPassBombMarker.DARK });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), this.bodyMaterial);
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xFFD54A }));
    this.spark.position.set(0.22, 0.62, 0);
    this.group = new THREE.Group();
    this.group.add(this.body, this.spark);
    this.group.visible = false;
    world.add(this.group);
  }

  hide(): void {
    this.group.visible = false;
  }

  place(x: number, y: number, z: number, fuseLeftMs: number, t: number): void {
    const rate = fuseLeftMs > 6000 ? 1.5 : fuseLeftMs > 3000 ? 3 : fuseLeftMs > 1500 ? 6 : 11;
    const lit = Math.sin(t / 1000 * rate * Math.PI * 2) > 0;
    this.bodyMaterial.color.setHex(lit ? BombPassBombMarker.HOT : BombPassBombMarker.DARK);
    this.group.visible = true;
    this.group.position.set(x, y + BombPassBombMarker.HEIGHT + Math.sin(t / 160) * 0.1, z);
    this.group.scale.setScalar(lit ? 1.15 : 1);
    this.spark.visible = lit;
  }

  dispose(): void {
    this.world.remove(this.group);
    this.body.geometry.dispose();
    this.bodyMaterial.dispose();
    this.spark.geometry.dispose();
    (this.spark.material as Three<"MeshBasicMaterial">).dispose();
  }
}

class BombPassRunnerView {
  private readonly group: Three<"Group">;
  private readonly inner: Three<"Group">;
  private readonly blob: Three<"Mesh">;
  private readonly ring: Three<"Mesh">;
  private readonly ringMaterial: Three<"MeshBasicMaterial">;
  private readonly bubble: Three<"Mesh">;
  private readonly label: Three<"Sprite">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly baseColor: string;
  private shownYaw: number;
  private ringHot = false;

  constructor(
    private readonly kit: FighterViewKit,
    private readonly factory: CharacterModelFactory,
    clips: Map<string, Three<"AnimationClip">>,
    private readonly world: Three<"Group">,
    participant: MatchParticipant,
    look: CharacterLook,
    initialYaw: number
  ) {
    const THREE = kit.libs.THREE;
    this.baseColor = Palette.slotColor(participant.slot);
    this.shownYaw = initialYaw;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.model = factory.build(look);
    this.inner.add(this.model);
    this.ringMaterial = new THREE.MeshBasicMaterial({ color: this.baseColor, transparent: true, opacity: 0.95, depthWrite: false });
    this.ring = new THREE.Mesh(kit.ringGeometry, this.ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.35, 14, 10), new THREE.MeshBasicMaterial({ color: 0x66E0FF, transparent: true, opacity: 0.3, depthWrite: false }));
    this.bubble.position.y = 1.1;
    this.bubble.visible = false;
    this.label = kit.labels.create(participant.nick + (participant.ai ? " (AI)" : ""), this.baseColor);
    this.label.position.y = 2.75;
    this.blob = new THREE.Mesh(kit.blobGeometry, kit.blobMaterial);
    this.blob.rotation.x = -Math.PI / 2;
    this.group.add(this.inner, this.ring, this.bubble, this.label);
    world.add(this.group, this.blob);
    this.animator = new CharacterAnimator(kit.libs, this.model, clips);
    this.animator.play(FighterClips.IDLE);
  }

  update(runner: BombPassRunner, t: number, dt: number, holding: boolean): void {
    const visible = !runner.isOut();
    this.group.visible = visible;
    this.blob.visible = visible;
    if (!visible) return;
    this.group.position.set(runner.x, 0, runner.z);
    this.blob.position.set(runner.x, 0.03, runner.z);
    this.shownYaw += MathUtil.angleDifference(runner.yaw, this.shownYaw) * Math.min(1, dt * 16);
    this.inner.rotation.y = this.shownYaw;
    this.inner.rotation.x = runner.isDashing(t) ? 0.35 : 0;
    this.bubble.visible = runner.shieldActive(t);
    this.showRing(holding);
    this.animate(runner, t, dt);
  }

  dispose(): void {
    this.world.remove(this.group);
    this.world.remove(this.blob);
    this.factory.disposeModel(this.model);
    this.ringMaterial.dispose();
    this.bubble.geometry.dispose();
    (this.bubble.material as Three<"MeshBasicMaterial">).dispose();
    const labelMaterial = this.label.material;
    if (labelMaterial.map) labelMaterial.map.dispose();
    labelMaterial.dispose();
  }

  private showRing(holding: boolean): void {
    if (holding === this.ringHot) return;
    this.ringHot = holding;
    this.ringMaterial.color.set(holding ? Palette.WARN_COLOR : this.baseColor);
    this.ring.scale.setScalar(holding ? 1.5 : 1);
  }

  private animate(runner: BombPassRunner, t: number, dt: number): void {
    if (runner.isDashing(t)) this.animator.play(FighterClips.RUN, { speed: 2.4 });
    else if (runner.speed() > 0.6) this.animator.play(FighterClips.RUN, { speed: MathUtil.clamp(runner.speed() / 5, 0.7, 1.5) });
    else this.animator.play(FighterClips.IDLE, { speed: 1 });
    this.animator.update(dt);
  }
}

class BombPassRunnerViews {
  private readonly views = new Map<string, BombPassRunnerView>();

  constructor(
    private readonly kit: FighterViewKit,
    private readonly factory: CharacterModelFactory,
    private readonly assets: CharacterAssets,
    private readonly world: Three<"Group">
  ) {}

  build(arena: BombPassArena, looks: ReadonlyMap<string, CharacterLook>): void {
    this.clear();
    arena.all().forEach((contestant) => {
      const runner = contestant.runner;
      const look = looks.get(runner.id) || CharacterLooks.createDefault();
      this.views.set(runner.id, new BombPassRunnerView(this.kit, this.factory, this.assets.clips, this.world, runner.participant, look, runner.yaw));
    });
  }

  update(arena: BombPassArena, holderId: string, t: number, dt: number): void {
    arena.all().forEach((contestant) => {
      const view = this.views.get(contestant.runner.id);
      if (view) view.update(contestant.runner, t, dt, contestant.runner.id === holderId);
    });
  }

  clear(): void {
    this.views.forEach((view) => view.dispose());
    this.views.clear();
  }
}

class BombPassShieldViews {
  private readonly meshes = new Map<number, Three<"Mesh">>();
  private readonly geometry: Three<"OctahedronGeometry">;
  private readonly material: Three<"MeshBasicMaterial">;

  constructor(libs: ThreeLibs, private readonly world: Three<"Group">, shields: BombPassShields) {
    const THREE = libs.THREE;
    this.geometry = new THREE.OctahedronGeometry(0.6);
    this.material = new THREE.MeshBasicMaterial({ color: 0x66E0FF });
    shields.all().forEach((shield) => {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.position.set(shield.x, 0.9, shield.z);
      mesh.visible = false;
      world.add(mesh);
      this.meshes.set(shield.index, mesh);
    });
  }

  update(shields: BombPassShields, now: number, t: number): void {
    const live = new Set(shields.available(now).map((shield) => shield.index));
    this.meshes.forEach((mesh, index) => {
      mesh.visible = live.has(index);
      if (!mesh.visible) return;
      mesh.rotation.y = t / 500;
      mesh.position.y = 0.9 + Math.sin(t / 300) * 0.2;
    });
  }

  dispose(): void {
    this.meshes.forEach((mesh) => this.world.remove(mesh));
    this.meshes.clear();
    this.geometry.dispose();
    this.material.dispose();
  }
}

class BombPassBlast {
  private readonly ball: Three<"Mesh">;
  private readonly wave: Three<"Mesh">;

  constructor(libs: ThreeLibs, private readonly world: Three<"Group">, x: number, z: number, private readonly startedAt: number) {
    const THREE = libs.THREE;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xFF9A3C, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ball.position.set(x, 1, z);
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.position.set(x, 0.06, z);
    world.add(this.ball, this.wave);
  }

  update(now: number): boolean {
    const progress = (now - this.startedAt) / BombPassRules.BLAST_VISIBLE_MS;
    if (progress >= 1) {
      this.dispose();
      return false;
    }
    this.ball.scale.setScalar(0.4 + progress * BombPassRules.BLAST_RADIUS * 0.6);
    this.wave.scale.setScalar(0.4 + progress * BombPassRules.BLAST_RADIUS * 1.5);
    (this.ball.material as Three<"MeshBasicMaterial">).opacity = 0.9 * (1 - progress);
    (this.wave.material as Three<"MeshBasicMaterial">).opacity = 0.8 * (1 - progress);
    return true;
  }

  dispose(): void {
    this.world.remove(this.ball, this.wave);
    this.ball.geometry.dispose();
    this.wave.geometry.dispose();
    (this.ball.material as Three<"MeshBasicMaterial">).dispose();
    (this.wave.material as Three<"MeshBasicMaterial">).dispose();
  }
}

class BombPassBlasts {
  private blasts: BombPassBlast[] = [];

  constructor(private readonly libs: ThreeLibs, private readonly world: Three<"Group">) {}

  add(x: number, z: number, now: number): void {
    this.blasts.push(new BombPassBlast(this.libs, this.world, x, z, now));
  }

  update(now: number): void {
    this.blasts = this.blasts.filter((blast) => blast.update(now));
  }

  clear(): void {
    this.blasts.forEach((blast) => blast.dispose());
    this.blasts = [];
  }
}

interface BombPassMessage {
  readonly banner: string;
  readonly warning: boolean;
  readonly center: string;
}

class BombPassHudBuilder {
  private static readonly SPECTATOR_MESSAGE = "관전 중 · 다음 종목부터 함께해요";
  private static readonly HOLDING_MESSAGE = "폭탄을 들고 있어요! 다른 사람에게 닿으세요";
  private static readonly FUSE_MESSAGE = "폭탄이 곧 터져요!";
  private static readonly SUDDEN_MESSAGE = "서든데스! 퓨즈가 짧아져요";
  private static readonly OUT_MESSAGE = "탈락! 끝까지 지켜봐요";

  constructor(
    private readonly localId: string,
    private readonly startAt: number,
    private readonly arena: BombPassArena,
    private readonly state: BombPassState,
    private readonly standings: BombPassStandings
  ) {}

  build(now: number): HudModel {
    const started = now >= this.startAt;
    const mine = this.arena.get(this.localId);
    const holderId = this.state.holderId();
    const holder = this.arena.get(holderId);
    const elapsed = Math.max(0, (now - this.startAt) / 1000);
    const message = this.messageFor(now, started, mine, holderId);
    return {
      rows: this.arena.all().map((contestant) => this.rowOf(contestant, holderId, now)),
      summary: holder ? "폭탄: " + holder.runner.participant.nick : "폭탄 준비 중",
      clock: started ? Math.floor(elapsed / 60) + ":" + ("0" + Math.floor(elapsed % 60)).slice(-2) : "0:00",
      footer: "남은 인원 " + this.standings.survivors() + "명",
      viewTargets: [],
      viewingId: null,
      cooldowns: mine && !mine.runner.isOut() ? [{ action: "dash", label: "대시", left: mine.runner.dashCooldownLeft(now) }] : [],
      bannerHtml: message.banner,
      bannerWarning: message.warning,
      centerText: message.center,
      spectateButton: false
    };
  }

  private messageFor(now: number, started: boolean, mine: BombPassContestant | null, holderId: string): BombPassMessage {
    if (!started) {
      const left = this.startAt - now;
      return { banner: "", warning: false, center: left > 0 ? String(Math.ceil(left / 1000)) : "" };
    }
    if (!mine) return { banner: BombPassHudBuilder.SPECTATOR_MESSAGE, warning: false, center: "" };
    if (mine.runner.isOut()) return { banner: BombPassHudBuilder.OUT_MESSAGE, warning: false, center: "" };
    if (holderId === this.localId) return { banner: BombPassHudBuilder.HOLDING_MESSAGE, warning: true, center: "" };
    if (this.state.hasBomb() && this.state.fuseLeftMs(now) <= BombPassRules.WARNING_FUSE_MS) return { banner: BombPassHudBuilder.FUSE_MESSAGE, warning: true, center: "" };
    if (now - this.startAt > BombPassRules.SUDDEN_AFTER_MS) return { banner: BombPassHudBuilder.SUDDEN_MESSAGE, warning: true, center: "" };
    return { banner: "", warning: false, center: "" };
  }

  private rowOf(contestant: BombPassContestant, holderId: string, now: number): HudRow {
    const runner = contestant.runner;
    const participant = runner.participant;
    return {
      id: runner.id,
      nick: participant.nick,
      slot: participant.slot,
      ai: participant.ai,
      dead: runner.isOut(),
      detail: runner.isOut() ? this.standings.provisionalRank(runner.id) + "위" : runner.id === holderId ? "폭탄" : runner.shieldActive(now) ? "방패" : ""
    };
  }
}

class BombPassGame extends MiniGame implements BombPassWireTarget, BombPassOutlet {
  private readonly stage: BombPassScene;
  private readonly camera: BombPassCamera;
  private readonly arena: BombPassArena;
  private readonly state: BombPassState;
  private readonly shields: BombPassShields;
  private readonly standings: BombPassStandings;
  private readonly wire: BombPassWire;
  private readonly referee: BombPassReferee;
  private readonly views: BombPassRunnerViews;
  private readonly bomb: BombPassBombMarker;
  private readonly shieldViews: BombPassShieldViews;
  private readonly blasts: BombPassBlasts;
  private readonly hudBuilder: BombPassHudBuilder;
  private readonly handlers: Readonly<Record<string, (key: string, value: unknown) => void>>;
  private lastPositionAt = 0;
  private concluded = false;
  private readonly declaredOut = new Set<string>();

  constructor(context: MiniGameContext) {
    super(context);
    this.stage = new BombPassScene(context.libs);
    this.camera = new BombPassCamera(this.stage.camera, context.env);
    this.arena = new BombPassArena(context.participants, new BombPassDriverFactory(context.localId, context.movement, context.host, new MathRandomSource()));
    this.state = new BombPassState(context.startAt + BombPassRules.FIRST_BOMB_DELAY_MS);
    this.shields = new BombPassShields(context.seed, context.startAt);
    this.standings = new BombPassStandings(this.arena);
    this.wire = new BombPassWire(context.wire);
    this.referee = new BombPassReferee(context.host, context.seed, context.startAt, this.arena, this.state, this.shields, new BombPassFuse(context.seed), this);
    const kit = new FighterViewKit(context.libs, context.page, new NameTagFactory(context.libs, context.page));
    this.views = new BombPassRunnerViews(kit, context.characters.factory, context.characters.assets, this.stage.world);
    this.views.build(this.arena, context.looks);
    this.bomb = new BombPassBombMarker(context.libs, this.stage.world);
    this.shieldViews = new BombPassShieldViews(context.libs, this.stage.world, this.shields);
    this.blasts = new BombPassBlasts(context.libs, this.stage.world);
    this.hudBuilder = new BombPassHudBuilder(context.localId, context.startAt, this.arena, this.state, this.standings);
    this.handlers = BombPassWire.handlers(this);
  }

  streams(): readonly WireStream[] {
    return BombPassWire.streams();
  }

  controls(): ControlSpec {
    return {
      stick: true,
      buttons: [{ action: "dash", label: "대시", codes: ["KeyK", "Space"], color: "rgba(76, 141, 255, .8)", rightPx: 28, bottomPx: 40 }]
    };
  }

  startAt(): number {
    return this.context.startAt;
  }

  tick(dt: number, draw: boolean): void {
    const now = this.context.clock.now();
    const started = now >= this.context.startAt;
    if (started) {
      const situation: BombPassSituation = { now, arena: this.arena, state: this.state, shields: this.shields };
      this.arena.all().forEach((contestant) => contestant.driver.advance(contestant.runner, dt, situation));
      this.publishPositions(now);
    }
    this.referee.step(now);
    if (draw) this.draw(now, dt);
  }

  perform(action: string): void {
    const now = this.context.clock.now();
    const mine = this.arena.get(this.context.localId);
    if (action !== "dash" || !mine || now < this.context.startAt) return;
    const axis = this.context.movement.axis();
    mine.runner.tryDash(now, axis.x, axis.z);
  }

  spectateNext(): void {
    return;
  }

  receive(stream: string, key: string, value: unknown): void {
    const handler = this.handlers[stream];
    if (handler) handler(key, value);
  }

  receivePosition(key: string, value: unknown): void {
    const contestant = this.arena.get(key);
    const snapshot = BombPassPositionCodec.decode(value);
    if (contestant && snapshot && !contestant.driver.simulatesHere()) contestant.runner.observe(snapshot);
  }

  receiveState(value: unknown): void {
    this.state.accept(value);
  }

  receiveOut(key: string, value: unknown): void {
    const record = BombPassRecords.out(value);
    if (record) this.applyOut(key, record);
  }

  receiveShield(key: string, value: unknown): void {
    const record = BombPassRecords.shield(value);
    if (record) this.applyShield(+key, record);
  }

  declareOut(id: string, left: boolean): void {
    if (this.declaredOut.has(id)) return;
    this.declaredOut.add(id);
    const record: BombPassOutRecord = left ? { t: this.context.clock.now(), left: 1 } : { t: this.context.clock.now() };
    this.wire.publishOut(id, record);
    this.applyOut(id, record);
  }

  claimShield(index: number, by: string): void {
    const record: BombPassShieldRecord = { by, t: this.context.clock.now() };
    this.wire.publishShield(index, record);
    this.applyShield(index, record);
  }

  publishState(record: BombPassStateRecord): void {
    this.state.adopt(record);
    this.wire.publishState(record);
  }

  playerDeparted(id: string): void {
    const contestant = this.arena.get(id);
    if (!contestant || contestant.runner.isOut() || this.concluded || !this.context.host.isHost()) return;
    this.declareOut(id, true);
  }

  isOver(): boolean {
    return this.standings.isOver(this.context.clock.now());
  }

  ranking(): RankEntry[] {
    return this.standings.ranking();
  }

  hud(now: number): HudModel {
    return this.hudBuilder.build(now);
  }

  conclude(): void {
    this.concluded = true;
  }

  dispose(): void {
    this.concluded = true;
    this.views.clear();
    this.bomb.dispose();
    this.shieldViews.dispose();
    this.blasts.clear();
    this.stage.releaseMaterials();
  }

  private publishPositions(now: number): void {
    if (now - this.lastPositionAt < BombPassRules.NET_MS) return;
    this.lastPositionAt = now;
    const values: Record<string, string> = {};
    let count = 0;
    this.arena.all().forEach((contestant) => {
      if (!contestant.driver.simulatesHere() || contestant.runner.isOut()) return;
      values[contestant.runner.id] = BombPassPositionCodec.encode(contestant.runner, now);
      count++;
    });
    if (count > 0) this.wire.publishPositions(values);
  }

  private applyOut(id: string, record: BombPassOutRecord): void {
    const contestant = this.arena.get(id);
    if (!contestant) return;
    const runner = contestant.runner;
    const x = runner.x, z = runner.z;
    if (!this.standings.eliminate(id, record.t, this.context.clock.now()) || record.left) return;
    this.arena.blast(x, z, id);
    this.blasts.add(x, z, this.context.clock.now());
  }

  private applyShield(index: number, record: BombPassShieldRecord): void {
    if (this.shields.isTaken(index)) return;
    this.shields.markTaken(index);
    const taker = this.arena.get(record.by);
    if (taker) taker.runner.grantShield(record.t);
  }

  private draw(now: number, dt: number): void {
    const holderId = this.state.holderId();
    const holder = this.arena.get(holderId);
    this.views.update(this.arena, holderId, now, dt);
    if (holder && !holder.runner.isOut()) this.bomb.place(holder.runner.x, 0, holder.runner.z, this.state.fuseLeftMs(now), now);
    else this.bomb.hide();
    this.shieldViews.update(this.shields, now, now);
    this.blasts.update(now);
    this.camera.place();
    this.context.render.render(this.stage.scene, this.stage.camera);
  }
}

class BombPassBackdrop extends GameBackdrop {
  private readonly stage: BombPassScene;
  private readonly camera: BombPassCamera;
  private readonly bomb: BombPassBombMarker;

  constructor(private readonly context: BackdropContext) {
    super();
    this.stage = new BombPassScene(context.libs);
    this.camera = new BombPassCamera(this.stage.camera, context.env);
    this.bomb = new BombPassBombMarker(context.libs, this.stage.world);
  }

  render(dt: number): void {
    const now = this.context.clock.now();
    this.bomb.place(0, 0, 0, BombPassRules.FUSE_START_S * 1000, now);
    this.camera.showcase(dt);
    this.context.render.render(this.stage.scene, this.stage.camera);
  }

  dispose(): void {
    this.bomb.dispose();
    this.stage.releaseMaterials();
  }
}

class BombPassDefinition extends GameDefinition {
  readonly id = "bombpass";
  readonly title = "폭탄 돌리기";
  readonly summary = "폭탄을 들키지 않게 넘기고 피하는 마지막 1인 서바이벌";
  readonly keyHelp: readonly KeyHelp[] = [
    { keys: ["W", "A", "S", "D", "↑", "←", "↓", "→"], text: "이동" },
    { keys: ["K", "스페이스"], text: "대시 · 쿨타임 4초" },
    { keys: ["태블릿"], text: "왼쪽 화면을 눌러 끌면 조이스틱, 오른쪽 아래 버튼으로 대시" }
  ];
  readonly rules: readonly string[] = [
    "폭탄은 <b>무작위 한 명</b>에게 붙고, 퓨즈가 끝나면 <b>들고 있는 사람이 탈락</b>해요. 폭탄을 든 사람 머리 위에서 깜박이고 터질수록 빨라져요.",
    "폭탄을 든 사람이 <b>다른 사람에게 닿으면</b> 폭탄이 넘어가요. 방금 넘긴 사람은 1.5초간 받지 않고, 받은 사람은 0.6초간 넘기지 못해요.",
    "<b>대시</b>로 순식간에 도망치거나 따라잡아요. 가끔 나타나는 <b>방패</b>를 주우면 5초간 폭탄을 받지 않아요.",
    "폭탄이 터질 때마다 퓨즈가 짧아져요. 끝까지 남은 사람이 1등, 탈락한 순서대로 순위가 정해져요."
  ];

  preload(): Promise<void> {
    return Promise.resolve();
  }

  create(context: MiniGameContext): MiniGame {
    return new BombPassGame(context);
  }

  createBackdrop(context: BackdropContext): GameBackdrop {
    return new BombPassBackdrop(context);
  }
}
