class MoleRules {
  static readonly GAME_MS = 60000;
  static readonly CELL_COUNT = 9;
  static readonly COLUMNS = 3;
  static readonly LEAD_MS = 1200;
  static readonly TAIL_MS = 800;
  static readonly GAP_START_MS = 1000;
  static readonly GAP_END_MS = 450;
  static readonly GAP_JITTER = 0.15;
  static readonly RETRY_MS = 50;
  static readonly STAY_START_MS = 1400;
  static readonly STAY_END_MS = 700;
  static readonly GOLDEN_STAY_MS = 700;
  static readonly GOLDEN_MIN_GAP_MS = 6000;
  static readonly GOLDEN_CHANCE = 0.2;
  static readonly PUMPKIN_CHANCE = 0.15;
  static readonly LIVE_EARLY = 2;
  static readonly LIVE_LATE = 3;
  static readonly LATE_FROM = 0.5;
  static readonly CELL_REST_MS = 250;
  static readonly SKELETON_POINTS = 1;
  static readonly GOLDEN_POINTS = 5;
  static readonly PUMPKIN_POINTS = -3;
  static readonly COMBO_DOUBLE = 5;
  static readonly COMBO_TRIPLE = 15;
  static readonly PUMPKIN_LOCK_MS = 800;
  static readonly MISS_LOCK_MS = 300;
  static readonly HIT_TOLERANCE_MS = 50;
  static readonly SEND_MS = 150;
  static readonly END_GRACE_MS = 1200;
  static readonly MAX_ENTRIES = 400;
  static readonly SEED_SALT = 0x6D6F6C65;
}

class MoleSeedHash {
  static of(text: string): number {
    let hash = 0x811C9DC5;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }
}

class MoleCombo {
  static multiplier(combo: number): number {
    if (combo >= MoleRules.COMBO_TRIPLE) return 3;
    if (combo >= MoleRules.COMBO_DOUBLE) return 2;
    return 1;
  }
}

interface MoleReaction {
  readonly points: number;
  readonly combo: number;
  readonly lockMs: number;
}

abstract class MoleKind {
  abstract readonly code: string;
  abstract readonly label: string;

  abstract chance(sinceGoldenMs: number): number;
  abstract reactTo(combo: number): MoleReaction;

  stayMs(progress: number): number {
    return MathUtil.lerp(MoleRules.STAY_START_MS, MoleRules.STAY_END_MS, progress);
  }

  protected catchReaction(basePoints: number, combo: number): MoleReaction {
    const next = combo + 1;
    return { points: basePoints * MoleCombo.multiplier(next), combo: next, lockMs: 0 };
  }
}

class MoleSkeletonKind extends MoleKind {
  readonly code = "s";
  readonly label = "스켈레톤";

  chance(sinceGoldenMs: number): number {
    return 1;
  }

  reactTo(combo: number): MoleReaction {
    return this.catchReaction(MoleRules.SKELETON_POINTS, combo);
  }
}

class MoleGoldenKind extends MoleKind {
  readonly code = "g";
  readonly label = "황금 해골";

  chance(sinceGoldenMs: number): number {
    return sinceGoldenMs >= MoleRules.GOLDEN_MIN_GAP_MS ? MoleRules.GOLDEN_CHANCE : 0;
  }

  stayMs(progress: number): number {
    return MoleRules.GOLDEN_STAY_MS;
  }

  reactTo(combo: number): MoleReaction {
    return this.catchReaction(MoleRules.GOLDEN_POINTS, combo);
  }
}

class MolePumpkinKind extends MoleKind {
  readonly code = "p";
  readonly label = "호박 폭탄";

  chance(sinceGoldenMs: number): number {
    return MoleRules.PUMPKIN_CHANCE;
  }

  reactTo(combo: number): MoleReaction {
    return { points: MoleRules.PUMPKIN_POINTS, combo: 0, lockMs: MoleRules.PUMPKIN_LOCK_MS };
  }
}

class MoleKinds {
  static readonly SKELETON: MoleKind = new MoleSkeletonKind();
  static readonly GOLDEN: MoleKind = new MoleGoldenKind();
  static readonly PUMPKIN: MoleKind = new MolePumpkinKind();
  static readonly PICK_ORDER: readonly MoleKind[] = [MoleKinds.GOLDEN, MoleKinds.PUMPKIN, MoleKinds.SKELETON];
  static readonly ALL: readonly MoleKind[] = [MoleKinds.SKELETON, MoleKinds.GOLDEN, MoleKinds.PUMPKIN];

  static pick(roll: number, sinceGoldenMs: number): MoleKind {
    let threshold = 0;
    for (const kind of MoleKinds.PICK_ORDER) {
      threshold += kind.chance(sinceGoldenMs);
      if (roll < threshold) return kind;
    }
    return MoleKinds.SKELETON;
  }
}

interface MoleSpawn {
  readonly index: number;
  readonly cell: number;
  readonly kind: MoleKind;
  readonly appearMs: number;
  readonly disappearMs: number;
}

class MoleSchedule {
  private readonly byCell: MoleSpawn[][] = [];

  constructor(private readonly spawns: readonly MoleSpawn[]) {
    for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++) this.byCell.push([]);
    spawns.forEach((spawn) => this.byCell[spawn.cell].push(spawn));
  }

  static build(seed: number): MoleSchedule {
    const random = new SeededRandom((seed ^ MoleRules.SEED_SALT) >>> 0);
    const spawns: MoleSpawn[] = [];
    const cellFreeAt: number[] = [];
    for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++) cellFreeAt.push(0);
    let time = MoleRules.LEAD_MS;
    let lastGoldenAt = -MoleRules.GOLDEN_MIN_GAP_MS;
    while (time <= MoleRules.GAME_MS - MoleRules.TAIL_MS) {
      const progress = time / MoleRules.GAME_MS;
      const liveLimit = progress < MoleRules.LATE_FROM ? MoleRules.LIVE_EARLY : MoleRules.LIVE_LATE;
      const live = spawns.filter((spawn) => spawn.disappearMs > time).length;
      const freeCells: number[] = [];
      cellFreeAt.forEach((freeAt, cell) => {
        if (freeAt <= time) freeCells.push(cell);
      });
      if (live >= liveLimit || freeCells.length === 0) {
        time += MoleRules.RETRY_MS;
        continue;
      }
      const kind = MoleKinds.pick(random.next(), time - lastGoldenAt);
      const cell = freeCells[Math.min(freeCells.length - 1, Math.floor(random.next() * freeCells.length))];
      const appearMs = Math.round(time);
      const disappearMs = appearMs + Math.round(kind.stayMs(progress));
      spawns.push({ index: spawns.length, cell, kind, appearMs, disappearMs });
      cellFreeAt[cell] = disappearMs + MoleRules.CELL_REST_MS;
      if (kind === MoleKinds.GOLDEN) lastGoldenAt = time;
      const jitter = 1 + (random.next() * 2 - 1) * MoleRules.GAP_JITTER;
      time += MathUtil.lerp(MoleRules.GAP_START_MS, MoleRules.GAP_END_MS, progress) * jitter;
    }
    return new MoleSchedule(spawns);
  }

  all(): readonly MoleSpawn[] {
    return this.spawns;
  }

  size(): number {
    return this.spawns.length;
  }

  at(index: number): MoleSpawn | null {
    return index >= 0 && index < this.spawns.length ? this.spawns[index] : null;
  }

  ofCell(cell: number): readonly MoleSpawn[] {
    return this.byCell[cell] || [];
  }

  spawnAt(cell: number, relMs: number): MoleSpawn | null {
    const list = this.ofCell(cell);
    for (let index = 0; index < list.length; index++) {
      const spawn = list[index];
      if (relMs >= spawn.appearMs && relMs < spawn.disappearMs) return spawn;
      if (spawn.appearMs > relMs) return null;
    }
    return null;
  }
}

interface MoleHitEntry {
  readonly spawn: number;
  readonly t: number;
}

class MoleHitEntries {
  static hit(spawn: number, t: number): MoleHitEntry {
    return { spawn, t };
  }

  static miss(cell: number, t: number): MoleHitEntry {
    return { spawn: -(cell + 1), t };
  }

  static missCell(entry: MoleHitEntry): number {
    return entry.spawn < 0 ? -entry.spawn - 1 : -1;
  }

  static compare(a: MoleHitEntry, b: MoleHitEntry): number {
    return a.t - b.t || a.spawn - b.spawn;
  }
}

type MoleOutcomeKind = "hit" | "miss" | "ignored";

interface MoleOutcome {
  readonly kind: MoleOutcomeKind;
  readonly spawn: MoleSpawn | null;
  readonly cell: number;
  readonly t: number;
  readonly points: number;
  readonly combo: number;
}

class MoleTally {
  constructor(
    readonly score: number,
    readonly combo: number,
    readonly bestCombo: number,
    readonly catches: number,
    readonly misses: number,
    readonly lockedUntil: number,
    readonly outcomes: readonly MoleOutcome[]
  ) {}

  multiplier(): number {
    return MoleCombo.multiplier(this.combo);
  }

  isLocked(t: number): boolean {
    return t < this.lockedUntil;
  }

  caughtSpawns(): Set<number> {
    const caught = new Set<number>();
    this.outcomes.forEach((outcome) => {
      if (outcome.kind === "hit" && outcome.spawn) caught.add(outcome.spawn.index);
    });
    return caught;
  }
}

class MoleScorekeeper {
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private catches = 0;
  private misses = 0;
  private lockedUntil = 0;
  private readonly caught = new Set<number>();
  private readonly outcomes: MoleOutcome[] = [];

  constructor(private readonly schedule: MoleSchedule) {}

  isLocked(t: number): boolean {
    return t < this.lockedUntil;
  }

  apply(entry: MoleHitEntry): MoleOutcome {
    const outcome = this.judge(entry);
    if (outcome.kind !== "ignored") this.outcomes.push(outcome);
    return outcome;
  }

  tally(): MoleTally {
    return new MoleTally(this.score, this.combo, this.bestCombo, this.catches, this.misses, this.lockedUntil, this.outcomes);
  }

  private ignored(entry: MoleHitEntry): MoleOutcome {
    return { kind: "ignored", spawn: null, cell: -1, t: entry.t, points: 0, combo: this.combo };
  }

  private judge(entry: MoleHitEntry): MoleOutcome {
    if (!isFinite(entry.t) || entry.t < 0 || entry.t > MoleRules.GAME_MS || this.isLocked(entry.t)) return this.ignored(entry);
    const missCell = MoleHitEntries.missCell(entry);
    if (missCell >= 0) return this.applyMiss(entry, missCell);
    const spawn = this.schedule.at(entry.spawn);
    if (!spawn || this.caught.has(spawn.index)) return this.ignored(entry);
    if (entry.t < spawn.appearMs || entry.t > spawn.disappearMs + MoleRules.HIT_TOLERANCE_MS) return this.ignored(entry);
    return this.applyHit(entry, spawn);
  }

  private applyMiss(entry: MoleHitEntry, cell: number): MoleOutcome {
    if (cell >= MoleRules.CELL_COUNT) return this.ignored(entry);
    this.combo = 0;
    this.misses++;
    this.lockedUntil = entry.t + MoleRules.MISS_LOCK_MS;
    return { kind: "miss", spawn: null, cell, t: entry.t, points: 0, combo: 0 };
  }

  private applyHit(entry: MoleHitEntry, spawn: MoleSpawn): MoleOutcome {
    const reaction = spawn.kind.reactTo(this.combo);
    this.caught.add(spawn.index);
    this.score += reaction.points;
    this.combo = reaction.combo;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    if (reaction.points > 0) this.catches++;
    if (reaction.lockMs > 0) this.lockedUntil = Math.max(this.lockedUntil, entry.t + reaction.lockMs);
    return { kind: "hit", spawn, cell: spawn.cell, t: entry.t, points: reaction.points, combo: this.combo };
  }
}

class MoleScoring {
  static evaluate(schedule: MoleSchedule, entries: readonly MoleHitEntry[], untilMs: number): MoleTally {
    const keeper = new MoleScorekeeper(schedule);
    entries
      .filter((entry) => entry.t <= untilMs)
      .slice()
      .sort(MoleHitEntries.compare)
      .forEach((entry) => keeper.apply(entry));
    return keeper.tally();
  }
}

interface MoleScoreLine {
  readonly id: string;
  readonly tally: MoleTally;
}

class MoleStandings {
  static order(lines: readonly MoleScoreLine[]): MoleScoreLine[] {
    return lines.slice().sort((a, b) => b.tally.score - a.tally.score);
  }

  static ranking(lines: readonly MoleScoreLine[]): RankEntry[] {
    const ordered = MoleStandings.order(lines);
    const ranks = new Map<string, number>();
    ordered.forEach((line, index) => {
      const previous = index > 0 ? ordered[index - 1] : null;
      const tied = previous !== null && previous.tally.score === line.tally.score;
      ranks.set(line.id, tied && previous ? ranks.get(previous.id) as number : index + 1);
    });
    return lines.map((line) => ({ id: line.id, rank: ranks.get(line.id) as number }));
  }
}
