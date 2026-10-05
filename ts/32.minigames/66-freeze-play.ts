class FreezeRunButton {
  static readonly ACTION = "run";
}

class FreezeRunInput {
  private pressed = false;

  isPressed(): boolean {
    return this.pressed;
  }

  handle(action: string): void {
    if (action === HoldActions.down(FreezeRunButton.ACTION)) this.pressed = true;
    else if (action === HoldActions.up(FreezeRunButton.ACTION)) this.pressed = false;
  }
}

class FreezeAiTuning {
  static readonly GO_DELAY_MIN_MS = 80;
  static readonly GO_DELAY_MAX_MS = 350;
  static readonly LATE_MIN_MS = 500;
  static readonly LATE_MAX_MS = 900;
}

abstract class FreezeAiTemperament {
  abstract marginMs(): number;
  abstract jitterMs(): number;
  abstract lateChance(): number;
}

class FreezeCautiousTemperament extends FreezeAiTemperament {
  marginMs(): number { return 650; }
  jitterMs(): number { return 220; }
  lateChance(): number { return 0.03; }
}

class FreezeSteadyTemperament extends FreezeAiTemperament {
  marginMs(): number { return 350; }
  jitterMs(): number { return 280; }
  lateChance(): number { return 0.07; }
}

class FreezeBoldTemperament extends FreezeAiTemperament {
  marginMs(): number { return 40; }
  jitterMs(): number { return 420; }
  lateChance(): number { return 0.14; }
}

class FreezeTemperaments {
  private static readonly ALL: readonly FreezeAiTemperament[] = [new FreezeSteadyTemperament(), new FreezeBoldTemperament(), new FreezeCautiousTemperament()];

  static forSlot(slot: number): FreezeAiTemperament {
    return FreezeTemperaments.ALL[Math.abs(slot) % FreezeTemperaments.ALL.length];
  }
}

interface FreezeSituation {
  readonly now: number;
  readonly log: FreezeCycleLog;
}

abstract class FreezeDriver {
  abstract simulatesHere(): boolean;

  protected abstract wantsRun(runner: FreezeRunnerState, situation: FreezeSituation): boolean;

  advance(runner: FreezeRunnerState, dt: number, situation: FreezeSituation, endAt: number): FreezeStepResult {
    if (!this.simulatesHere()) {
      runner.stepObserved(dt, situation.now);
      return FreezeStepResult.NONE;
    }
    return runner.advance(dt, situation.now, this.wantsRun(runner, situation), situation.log.isDangerous(situation.now), endAt);
  }
}

class FreezeLocalDriver extends FreezeDriver {
  constructor(private readonly input: FreezeRunInput) {
    super();
  }

  simulatesHere(): boolean {
    return true;
  }

  protected wantsRun(runner: FreezeRunnerState, situation: FreezeSituation): boolean {
    return this.input.isPressed();
  }
}

class FreezeRemoteDriver extends FreezeDriver {
  simulatesHere(): boolean {
    return false;
  }

  protected wantsRun(runner: FreezeRunnerState, situation: FreezeSituation): boolean {
    return false;
  }
}

class FreezeAiDriver extends FreezeDriver {
  private plannedCycle = -1;
  private goAt = 0;
  private stopAt = 0;

  constructor(private readonly temperament: FreezeAiTemperament, private readonly host: HostGate, private readonly random: RandomRange) {
    super();
  }

  simulatesHere(): boolean {
    return this.host.isHost();
  }

  protected wantsRun(runner: FreezeRunnerState, situation: FreezeSituation): boolean {
    const cycle = situation.log.cycleAt(situation.now);
    if (!cycle) return false;
    if (cycle.n !== this.plannedCycle) this.plan(cycle);
    return situation.now >= this.goAt && situation.now < this.stopAt;
  }

  private plan(cycle: FreezeCycle): void {
    this.plannedCycle = cycle.n;
    this.goAt = cycle.at + this.random.between(FreezeAiTuning.GO_DELAY_MIN_MS, FreezeAiTuning.GO_DELAY_MAX_MS);
    const jitter = this.temperament.jitterMs();
    let stopAt = cycle.safeEnd() - this.temperament.marginMs() + this.random.between(-jitter, jitter);
    if (this.random.chance(this.temperament.lateChance())) stopAt += this.random.between(FreezeAiTuning.LATE_MIN_MS, FreezeAiTuning.LATE_MAX_MS);
    this.stopAt = Math.max(this.goAt, stopAt);
  }
}

class FreezeDriverFactory {
  constructor(
    private readonly localId: string,
    private readonly input: FreezeRunInput,
    private readonly host: HostGate,
    private readonly random: RandomSource
  ) {}

  create(participant: MatchParticipant): FreezeDriver {
    if (participant.id === this.localId) return new FreezeLocalDriver(this.input);
    if (participant.ai) return this.createAi(participant);
    return new FreezeRemoteDriver();
  }

  createAi(participant: MatchParticipant): FreezeDriver {
    return new FreezeAiDriver(FreezeTemperaments.forSlot(participant.slot), this.host, new RandomRange(this.random));
  }
}

class FreezeContestant {
  constructor(readonly runner: FreezeRunnerState, public driver: FreezeDriver) {}
}

class FreezeArena {
  private readonly contestants: FreezeContestant[];
  private readonly byId = new Map<string, FreezeContestant>();

  constructor(participants: readonly MatchParticipant[], seed: number, private readonly drivers: FreezeDriverFactory) {
    const lanes = FreezeLanes.assign(participants.map((participant) => participant.id), seed);
    this.contestants = participants.map((participant) => new FreezeContestant(new FreezeRunnerState(participant, lanes.get(participant.id) as number), drivers.create(participant)));
    this.contestants.forEach((contestant) => this.byId.set(contestant.runner.id, contestant));
  }

  all(): readonly FreezeContestant[] {
    return this.contestants;
  }

  runners(): FreezeRunnerState[] {
    return this.contestants.map((contestant) => contestant.runner);
  }

  get(id: string): FreezeContestant | null {
    return this.byId.get(id) || null;
  }

  handOverToAi(id: string): void {
    const contestant = this.byId.get(id);
    if (contestant && !contestant.runner.isFinished()) contestant.driver = this.drivers.createAi(contestant.runner.participant);
  }
}

class FreezeWire {
  private static readonly POSITIONS = "pos";
  private static readonly CYCLES = "cyc";
  private static readonly HITS = "hit";
  private static readonly FINISHES = "fin";

  static streams(): readonly WireStream[] {
    return [
      { name: FreezeWire.POSITIONS, events: ["child_added", "child_changed"] },
      { name: FreezeWire.CYCLES, events: ["child_added"] },
      { name: FreezeWire.HITS, events: ["child_added"] },
      { name: FreezeWire.FINISHES, events: ["child_added"] }
    ];
  }

  static handlers(target: FreezeWireTarget): Readonly<Record<string, (key: string, value: unknown) => void>> {
    return {
      [FreezeWire.POSITIONS]: (key, value) => target.receivePosition(key, value),
      [FreezeWire.CYCLES]: (key, value) => target.receiveCycle(value),
      [FreezeWire.HITS]: (key, value) => target.receiveHit(value),
      [FreezeWire.FINISHES]: (key, value) => target.receiveFinish(key, value)
    };
  }

  constructor(private readonly wire: GameWire) {}

  publishPositions(values: Record<string, string>): void {
    this.wire.writeMany(FreezeWire.POSITIONS, values);
  }

  publishCycle(record: FreezeCycleRecord): void {
    this.wire.set(FreezeWire.CYCLES, String(record.n), record);
  }

  publishHit(record: FreezeHitRecord): void {
    this.wire.set(FreezeWire.HITS, record.id + "_" + record.n, record);
  }

  publishFinish(id: string, record: FreezeFinishRecord): void {
    this.wire.set(FreezeWire.FINISHES, id, record);
  }
}

interface FreezeWireTarget {
  receivePosition(key: string, value: unknown): void;
  receiveCycle(value: unknown): void;
  receiveHit(value: unknown): void;
  receiveFinish(key: string, value: unknown): void;
}

interface FreezeOutlet {
  publishCycle(record: FreezeCycleRecord): void;
  confirmFinish(id: string, t: number): void;
}

class FreezeReferee {
  constructor(
    private readonly host: HostGate,
    private readonly startAt: number,
    private readonly endAt: number,
    private readonly arena: FreezeArena,
    private readonly log: FreezeCycleLog,
    private readonly random: RandomRange,
    private readonly outlet: FreezeOutlet
  ) {}

  step(now: number): void {
    if (!this.host.isHost()) return;
    this.scheduleCycle(now);
    if (now >= this.startAt) this.confirmFinishes();
  }

  private scheduleCycle(now: number): void {
    if (now >= this.endAt) return;
    const latest = this.log.latest();
    if (!latest) {
      this.outlet.publishCycle(FreezeCycleDraft.draw(0, this.startAt, this.random));
      return;
    }
    if (latest.end() - now > FreezeRules.CYCLE_LEAD_MS) return;
    this.outlet.publishCycle(FreezeCycleDraft.draw(latest.n + 1, Math.max(latest.end(), now), this.random));
  }

  private confirmFinishes(): void {
    this.arena.runners().forEach((runner) => {
      if (runner.finishConfirmed) return;
      const reported = runner.finishedAt > 0 ? runner.finishedAt : runner.reportedFinishAt;
      if (reported <= 0) return;
      this.outlet.confirmFinish(runner.id, MathUtil.clamp(reported, this.startAt, this.endAt));
    });
  }
}
