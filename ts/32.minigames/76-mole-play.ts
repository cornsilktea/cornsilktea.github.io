class MoleHitCodec {
  static encode(entries: readonly MoleHitEntry[]): string {
    return entries.map((entry) => entry.spawn + ":" + entry.t).join(",");
  }

  static decode(raw: unknown): MoleHitEntry[] | null {
    if (typeof raw !== "string") return null;
    const entries: MoleHitEntry[] = [];
    raw.split(",").slice(0, MoleRules.MAX_ENTRIES).forEach((part) => {
      const pieces = part.split(":");
      if (pieces.length !== 2) return;
      const spawn = parseInt(pieces[0], 10);
      const t = parseInt(pieces[1], 10);
      if (isFinite(spawn) && isFinite(t)) entries.push({ spawn, t });
    });
    return entries;
  }
}

class MoleWire {
  private static readonly HITS = "hit";

  static streams(): readonly WireStream[] {
    return [{ name: MoleWire.HITS, events: ["child_added", "child_changed"] }];
  }

  static handlers(target: MoleWireTarget): Readonly<Record<string, (key: string, value: unknown) => void>> {
    return { [MoleWire.HITS]: (key, value) => target.receiveHits(key, value) };
  }

  constructor(private readonly wire: GameWire) {}

  publishHits(id: string, entries: readonly MoleHitEntry[]): void {
    this.wire.writeMany(MoleWire.HITS, { [id]: MoleHitCodec.encode(entries) });
  }
}

interface MoleWireTarget {
  receiveHits(key: string, value: unknown): void;
}

class MoleOutbox {
  private lastSentAt = -Infinity;
  private dirty = false;

  constructor(private readonly wire: MoleWire, private readonly localId: string) {}

  markDirty(): void {
    this.dirty = true;
  }

  flush(nowMs: number, entries: readonly MoleHitEntry[]): void {
    if (!this.dirty || nowMs - this.lastSentAt < MoleRules.SEND_MS) return;
    this.dirty = false;
    this.lastSentAt = nowMs;
    this.wire.publishHits(this.localId, entries);
  }
}

abstract class MoleAiTemperament {
  abstract reactionMinMs(): number;
  abstract reactionMaxMs(): number;
  abstract slipChance(): number;
  abstract pumpkinMistakeChance(): number;
  abstract strayPerMinute(): number;
}

class MoleCarefulTemperament extends MoleAiTemperament {
  reactionMinMs(): number { return 520; }
  reactionMaxMs(): number { return 900; }
  slipChance(): number { return 0.05; }
  pumpkinMistakeChance(): number { return 0; }
  strayPerMinute(): number { return 0; }
}

class MoleSteadyTemperament extends MoleAiTemperament {
  reactionMinMs(): number { return 380; }
  reactionMaxMs(): number { return 700; }
  slipChance(): number { return 0.1; }
  pumpkinMistakeChance(): number { return 0.08; }
  strayPerMinute(): number { return 1; }
}

class MoleRecklessTemperament extends MoleAiTemperament {
  reactionMinMs(): number { return 240; }
  reactionMaxMs(): number { return 520; }
  slipChance(): number { return 0.12; }
  pumpkinMistakeChance(): number { return 0.35; }
  strayPerMinute(): number { return 6; }
}

class MoleTemperaments {
  private static readonly ALL: readonly MoleAiTemperament[] = [new MoleSteadyTemperament(), new MoleRecklessTemperament(), new MoleCarefulTemperament()];

  static forSlot(slot: number): MoleAiTemperament {
    return MoleTemperaments.ALL[Math.abs(slot) % MoleTemperaments.ALL.length];
  }
}

class MoleAiPlanner {
  private static readonly TOO_LATE_MARGIN_MS = 30;
  private static readonly STRAY_FROM_MS = 1500;
  private static readonly STRAY_BEFORE_END_MS = 500;

  static plan(schedule: MoleSchedule, seed: number, participant: MatchParticipant, temperament: MoleAiTemperament): MoleHitEntry[] {
    const random = new RandomRange(new SeededRandom(MoleSeedHash.of(seed + "|" + participant.id)));
    const intended: MoleHitEntry[] = [];
    schedule.all().forEach((spawn) => {
      const wanted = MoleAiPlanner.wants(spawn, temperament, random.next());
      const reaction = Math.round(random.between(temperament.reactionMinMs(), temperament.reactionMaxMs()));
      const t = spawn.appearMs + reaction;
      if (wanted && t < spawn.disappearMs - MoleAiPlanner.TOO_LATE_MARGIN_MS) intended.push(MoleHitEntries.hit(spawn.index, t));
    });
    MoleAiPlanner.addStrays(schedule, temperament, random, intended);
    const keeper = new MoleScorekeeper(schedule);
    return intended.sort(MoleHitEntries.compare).filter((entry) => keeper.apply(entry).kind !== "ignored");
  }

  private static wants(spawn: MoleSpawn, temperament: MoleAiTemperament, roll: number): boolean {
    if (spawn.kind === MoleKinds.PUMPKIN) return roll < temperament.pumpkinMistakeChance();
    return roll >= temperament.slipChance();
  }

  private static addStrays(schedule: MoleSchedule, temperament: MoleAiTemperament, random: RandomRange, into: MoleHitEntry[]): void {
    const count = Math.round(temperament.strayPerMinute() * MoleRules.GAME_MS / 60000);
    for (let stray = 0; stray < count; stray++) {
      const t = Math.round(random.between(MoleAiPlanner.STRAY_FROM_MS, MoleRules.GAME_MS - MoleAiPlanner.STRAY_BEFORE_END_MS));
      const cell = random.index(MoleRules.CELL_COUNT);
      if (!schedule.spawnAt(cell, t)) into.push(MoleHitEntries.miss(cell, t));
    }
  }
}

class MoleContestant {
  private entries: MoleHitEntry[];
  private version = 0;
  private departedFlag = false;
  private cacheKey = "";
  private cacheTally: MoleTally | null = null;

  constructor(readonly participant: MatchParticipant, entries: readonly MoleHitEntry[], readonly computed: boolean) {
    this.entries = entries.slice();
  }

  get id(): string { return this.participant.id; }

  hasDeparted(): boolean {
    return this.departedFlag;
  }

  markDeparted(): void {
    this.departedFlag = true;
  }

  allEntries(): readonly MoleHitEntry[] {
    return this.entries;
  }

  replaceEntries(entries: readonly MoleHitEntry[]): void {
    this.entries = entries.slice();
    this.version++;
  }

  addEntry(entry: MoleHitEntry): void {
    this.entries.push(entry);
    this.version++;
  }

  tally(schedule: MoleSchedule, untilMs: number): MoleTally {
    const key = this.version + "|" + Math.floor(untilMs / 50);
    if (this.cacheTally && key === this.cacheKey) return this.cacheTally;
    this.cacheKey = key;
    this.cacheTally = MoleScoring.evaluate(schedule, this.entries, untilMs);
    return this.cacheTally;
  }
}

class MoleMatch {
  readonly schedule: MoleSchedule;
  private readonly list: MoleContestant[];
  private readonly byId = new Map<string, MoleContestant>();

  constructor(participants: readonly MatchParticipant[], private readonly seed: number, private readonly localId: string) {
    this.schedule = MoleSchedule.build(seed);
    this.list = participants.map((participant) => this.contestantFor(participant));
    this.list.forEach((contestant) => this.byId.set(contestant.id, contestant));
  }

  contestants(): readonly MoleContestant[] {
    return this.list;
  }

  contestant(id: string): MoleContestant | null {
    return this.byId.get(id) || null;
  }

  receive(id: string, entries: readonly MoleHitEntry[]): void {
    const contestant = this.byId.get(id);
    if (contestant && !contestant.computed && id !== this.localId) contestant.replaceEntries(entries);
  }

  lines(untilMs: number): MoleScoreLine[] {
    return this.list.map((contestant) => ({ id: contestant.id, tally: contestant.tally(this.schedule, untilMs) }));
  }

  ranking(): RankEntry[] {
    return MoleStandings.ranking(this.lines(MoleRules.GAME_MS));
  }

  private contestantFor(participant: MatchParticipant): MoleContestant {
    if (!participant.ai) return new MoleContestant(participant, [], false);
    return new MoleContestant(participant, MoleAiPlanner.plan(this.schedule, this.seed, participant, MoleTemperaments.forSlot(participant.slot)), true);
  }
}

class MoleCellAction {
  private static readonly PREFIX = "tap:";

  static nameOf(cell: number): string {
    return MoleCellAction.PREFIX + cell;
  }

  static cellOf(action: string): number {
    if (action.indexOf(MoleCellAction.PREFIX) !== 0) return -1;
    const cell = parseInt(action.slice(MoleCellAction.PREFIX.length), 10);
    return cell >= 0 && cell < MoleRules.CELL_COUNT ? cell : -1;
  }
}

class MoleCellKeys {
  private static readonly LETTERS: readonly string[] = ["KeyQ", "KeyW", "KeyE", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyX", "KeyC"];
  private static readonly NUMPAD: readonly string[] = ["Numpad7", "Numpad8", "Numpad9", "Numpad4", "Numpad5", "Numpad6", "Numpad1", "Numpad2", "Numpad3"];

  static buttons(): ControlButton[] {
    return MoleCellKeys.LETTERS.map((letter, cell) => ({
      action: MoleCellAction.nameOf(cell),
      label: "",
      codes: [letter, MoleCellKeys.NUMPAD[cell]],
      color: "",
      rightPx: 0,
      bottomPx: 0,
      keyOnly: true
    }));
  }
}

class MoleLocalPlayer {
  constructor(private readonly match: MoleMatch, private readonly localId: string) {}

  tap(cell: number, relMs: number): boolean {
    const me = this.match.contestant(this.localId);
    if (!me || me.computed || relMs < 0 || relMs > MoleRules.GAME_MS) return false;
    const tally = me.tally(this.match.schedule, relMs);
    if (tally.isLocked(relMs)) return false;
    const spawn = this.match.schedule.spawnAt(cell, relMs);
    const fresh = spawn !== null && !tally.caughtSpawns().has(spawn.index);
    me.addEntry(spawn && fresh ? MoleHitEntries.hit(spawn.index, relMs) : MoleHitEntries.miss(cell, relMs));
    return true;
  }
}
