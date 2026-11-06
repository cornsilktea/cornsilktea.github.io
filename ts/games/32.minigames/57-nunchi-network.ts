interface NunchiCommitRecord {
  readonly h: string;
  readonly t: number;
}

interface NunchiRevealRecord {
  readonly c: number;
  readonly s: string;
}

interface NunchiResultRecord {
  readonly c: Readonly<Record<string, number>>;
  readonly a: string;
}

class NunchiRecords {
  static commit(value: unknown): NunchiCommitRecord | null {
    const raw = value as Partial<Record<keyof NunchiCommitRecord, unknown>> | null;
    if (!raw || typeof raw !== "object" || typeof raw.h !== "string" || typeof raw.t !== "number") return null;
    return { h: raw.h, t: raw.t };
  }

  static reveal(value: unknown): NunchiRevealRecord | null {
    const raw = value as Partial<Record<keyof NunchiRevealRecord, unknown>> | null;
    if (!raw || typeof raw !== "object" || typeof raw.c !== "number" || typeof raw.s !== "string") return null;
    return { c: raw.c, s: raw.s };
  }

  static result(value: unknown): NunchiResultRecord | null {
    const raw = value as { c?: unknown; a?: unknown } | null;
    if (!raw || typeof raw !== "object" || !raw.c || typeof raw.c !== "object") return null;
    const offered = raw.c as Record<string, unknown>;
    const cards: Record<string, number> = {};
    Object.keys(offered).forEach((id) => {
      if (typeof offered[id] === "number") cards[id] = offered[id] as number;
    });
    return { c: cards, a: typeof raw.a === "string" ? raw.a : "" };
  }
}

interface NunchiKey {
  readonly round: number;
  readonly id: string;
}

class NunchiKeys {
  static entry(round: number, id: string): string {
    return round + "_" + id;
  }

  static parse(key: string): NunchiKey | null {
    const at = key.indexOf("_");
    if (at < 1) return null;
    const round = +key.slice(0, at);
    const id = key.slice(at + 1);
    return Number.isInteger(round) && id ? { round, id } : null;
  }
}

type NunchiPhase = "intro" | "pick" | "resolve" | "show";

interface NunchiMoment {
  readonly round: number;
  readonly phase: NunchiPhase;
  readonly elapsedMs: number;
}

class NunchiSchedule {
  constructor(private readonly startAt: number) {}

  roundStart(round: number): number {
    return this.startAt + round * NunchiRules.ROUND_MS;
  }

  pickDeadline(round: number): number {
    return this.roundStart(round) + NunchiRules.PICK_MS;
  }

  commitCutoff(round: number): number {
    return this.pickDeadline(round) + NunchiRules.COMMIT_GRACE_MS;
  }

  revealAt(round: number): number {
    return this.pickDeadline(round) + NunchiRules.REVEAL_DELAY_MS;
  }

  resolveAt(round: number): number {
    return this.pickDeadline(round) + NunchiRules.RESOLVE_DELAY_MS;
  }

  endAt(): number {
    return this.roundStart(NunchiRules.ROUNDS);
  }

  hasStarted(now: number): boolean {
    return now >= this.startAt;
  }

  moment(now: number): NunchiMoment {
    if (now < this.startAt) return { round: 0, phase: "intro", elapsedMs: now - this.startAt };
    const round = Math.min(NunchiRules.ROUNDS - 1, Math.floor((now - this.startAt) / NunchiRules.ROUND_MS));
    const elapsedMs = now - this.roundStart(round);
    if (elapsedMs < NunchiRules.PICK_MS) return { round, phase: "pick", elapsedMs };
    if (elapsedMs < NunchiRules.PICK_MS + NunchiRules.RESOLVE_DELAY_MS) return { round, phase: "resolve", elapsedMs };
    return { round, phase: "show", elapsedMs };
  }
}

class NunchiLedger {
  private readonly commits = new Map<string, NunchiCommitRecord>();
  private readonly reveals = new Map<string, NunchiRevealRecord>();
  private readonly results = new Map<number, NunchiResultRecord>();

  addCommit(key: string, record: NunchiCommitRecord): void {
    if (!this.commits.has(key)) this.commits.set(key, record);
  }

  addReveal(key: string, record: NunchiRevealRecord): void {
    if (!this.reveals.has(key)) this.reveals.set(key, record);
  }

  addResult(round: number, record: NunchiResultRecord): void {
    if (!this.results.has(round)) this.results.set(round, record);
  }

  resultFor(round: number): NunchiResultRecord | null {
    return this.results.get(round) || null;
  }

  isPlaced(round: number, id: string): boolean {
    return this.commits.has(NunchiKeys.entry(round, id));
  }

  verifiedCard(seed: number, round: number, id: string, cutoffMs: number, hand: NunchiHand): number | null {
    const key = NunchiKeys.entry(round, id);
    const commit = this.commits.get(key);
    const reveal = this.reveals.get(key);
    if (!commit || !reveal || commit.t > cutoffMs || !hand.has(reveal.c)) return null;
    return NunchiCommitment.digest(seed, round, id, reveal.c, reveal.s) === commit.h ? reveal.c : null;
  }
}

interface NunchiSealed {
  readonly card: number;
  readonly salt: string;
}

class NunchiVault {
  private static readonly SALT_PARTS = 2;
  private static readonly SALT_PART_LENGTH = 10;

  private readonly sealed = new Map<number, NunchiSealed>();

  constructor(private readonly seed: number, private readonly id: string, private readonly tokens: TokenSource) {}

  seal(round: number, card: number): string {
    let salt = "";
    for (let part = 0; part < NunchiVault.SALT_PARTS; part++) salt += this.tokens.token(NunchiVault.SALT_PART_LENGTH);
    this.sealed.set(round, { card, salt });
    return NunchiCommitment.digest(this.seed, round, this.id, card, salt);
  }

  cardOf(round: number): number | null {
    const sealed = this.sealed.get(round);
    return sealed ? sealed.card : null;
  }

  reveal(round: number): NunchiRevealRecord | null {
    const sealed = this.sealed.get(round);
    return sealed ? { c: sealed.card, s: sealed.salt } : null;
  }
}

interface NunchiWireTarget {
  receiveCommit(key: string, value: unknown): void;
  receiveReveal(key: string, value: unknown): void;
  receiveResult(key: string, value: unknown): void;
}

class NunchiWire {
  private static readonly COMMIT = "commit";
  private static readonly REVEAL = "reveal";
  private static readonly RESULT = "result";

  static streams(): readonly WireStream[] {
    return [
      { name: NunchiWire.COMMIT, events: ["child_added"] },
      { name: NunchiWire.REVEAL, events: ["child_added"] },
      { name: NunchiWire.RESULT, events: ["child_added"] }
    ];
  }

  static handlers(target: NunchiWireTarget): Readonly<Record<string, (key: string, value: unknown) => void>> {
    return {
      [NunchiWire.COMMIT]: (key, value) => target.receiveCommit(key, value),
      [NunchiWire.REVEAL]: (key, value) => target.receiveReveal(key, value),
      [NunchiWire.RESULT]: (key, value) => target.receiveResult(key, value)
    };
  }

  constructor(private readonly wire: GameWire) {}

  publishCommit(round: number, id: string, record: NunchiCommitRecord): void {
    this.wire.set(NunchiWire.COMMIT, NunchiKeys.entry(round, id), record);
  }

  publishReveal(round: number, id: string, record: NunchiRevealRecord): void {
    this.wire.set(NunchiWire.REVEAL, NunchiKeys.entry(round, id), record);
  }

  publishResult(round: number, record: NunchiResultRecord): void {
    this.wire.set(NunchiWire.RESULT, String(round), record);
  }
}

class NunchiAiTuning {
  static readonly RESERVE_WEIGHT = 0.5;
  static readonly AVERAGE_PRIZE = 3;
  static readonly CLASH_AVOID_WEIGHT = 0.25;
  static readonly TEMPERATURE = 0.7;
}

class NunchiAiPicker {
  constructor(private readonly seed: number, private readonly ids: readonly string[]) {}

  pick(round: number, id: string, state: NunchiMatchState): number {
    const hand = state.hand(id).remaining();
    const rivals = this.ids.filter((other) => other !== id).map((other) => state.hand(other).remaining());
    const pot = state.prizeFor(round).value() + state.carryIn();
    const weights = hand.map((card) => Math.exp(this.worth(card, pot, rivals) / NunchiAiTuning.TEMPERATURE));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let target = new SeededRandom(NunchiSeeds.mix(this.seed ^ 0x51ED, round, id)).next() * total;
    for (let index = 0; index < hand.length; index++) {
      target -= weights[index];
      if (target <= 0) return hand[index];
    }
    return hand[hand.length - 1];
  }

  private worth(card: number, pot: number, rivals: readonly number[][]): number {
    let winChance = 1;
    let aloneChance = 1;
    rivals.forEach((rival) => {
      if (rival.length === 0) return;
      winChance *= rival.filter((other) => other < card).length / rival.length;
      if (rival.indexOf(card) >= 0) aloneChance *= 1 - 1 / rival.length;
    });
    const reserve = card / NunchiRules.CARD_COUNT * NunchiAiTuning.AVERAGE_PRIZE * NunchiAiTuning.RESERVE_WEIGHT;
    return winChance * pot + aloneChance * pot * NunchiAiTuning.CLASH_AVOID_WEIGHT / card - reserve;
  }
}

interface NunchiRefereeOutlet {
  publishResult(round: number, record: NunchiResultRecord): void;
  announcePlaced(round: number, id: string, record: NunchiCommitRecord): void;
}

class NunchiReferee {
  constructor(
    private readonly host: HostGate,
    private readonly seed: number,
    private readonly participants: readonly MatchParticipant[],
    private readonly schedule: NunchiSchedule,
    private readonly state: NunchiMatchState,
    private readonly ledger: NunchiLedger,
    private readonly ai: NunchiAiPicker,
    private readonly outlet: NunchiRefereeOutlet
  ) {}

  step(now: number): void {
    if (!this.host.isHost()) return;
    const round = this.state.nextRound();
    if (round >= NunchiRules.ROUNDS) return;
    if (now < this.schedule.resolveAt(round)) {
      this.announceAiPlacements(round, now);
      return;
    }
    this.outlet.publishResult(round, this.collect(round));
  }

  private announceAiPlacements(round: number, now: number): void {
    this.participants.forEach((participant) => {
      if (!participant.ai || this.ledger.isPlaced(round, participant.id)) return;
      const delay = NunchiRules.AI_PLACE_MIN_MS + new SeededRandom(NunchiSeeds.mix(this.seed ^ 0xA1, round, participant.id)).next() * NunchiRules.AI_PLACE_SPAN_MS;
      if (now >= this.schedule.roundStart(round) + delay) this.outlet.announcePlaced(round, participant.id, { h: NunchiRules.AI_MARK, t: now });
    });
  }

  private collect(round: number): NunchiResultRecord {
    const cards: Record<string, number> = {};
    const autos: string[] = [];
    this.participants.forEach((participant) => {
      const hand = this.state.hand(participant.id);
      const offered = participant.ai
        ? this.ai.pick(round, participant.id, this.state)
        : this.ledger.verifiedCard(this.seed, round, participant.id, this.schedule.commitCutoff(round), hand);
      if (offered !== null) {
        cards[participant.id] = offered;
        return;
      }
      cards[participant.id] = NunchiAutoPick.card(this.seed, round, participant.id, hand.remaining());
      autos.push(participant.id);
    });
    return { c: cards, a: autos.join(",") };
  }
}
