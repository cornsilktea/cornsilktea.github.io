interface MatchParticipant {
  readonly id: string;
  readonly nick: string;
  readonly ai: boolean;
  readonly slot: number;
}

interface MatchSetup {
  readonly seed: number;
  readonly startAt: number;
  readonly participants: readonly MatchParticipant[];
}

interface MatchChannel {
  publishStates(states: Record<string, string>): void;
  publishPush(event: PushEvent): void;
  publishTileStep(floor: number, index: number, t: number): void;
  publishOut(fighterId: string, t: number): void;
}

interface ControllerFactory {
  controllerFor(participant: MatchParticipant): PlayerController;
}

interface LastTileMatchServices {
  readonly clock: Clock;
  readonly channel: MatchChannel;
  readonly controllers: ControllerFactory;
  readonly localId: string;
}

interface RankEntry {
  readonly id: string;
  readonly rank: number;
}

class Contestant {
  readonly fighter: Fighter;

  constructor(readonly participant: MatchParticipant, readonly controller: PlayerController) {
    this.fighter = new Fighter(participant.id);
  }

  get id(): string { return this.participant.id; }
}

class RoundEndWatch {
  private lastSampleAt = -Infinity;
  private pendingSince = 0;
  private over = false;

  isOver(): boolean {
    return this.over;
  }

  observe(t: number, started: boolean, rosterSize: number, aliveCount: number): void {
    if (!started || t - this.lastSampleAt < LastTileRules.END_CHECK_INTERVAL_MS) return;
    this.lastSampleAt = t;
    const lastOneStanding = rosterSize >= LastTileRules.MIN_PLAYERS && aliveCount <= 1;
    if (!lastOneStanding) {
      this.pendingSince = 0;
    } else if (!this.pendingSince) {
      this.pendingSince = t;
    } else if (t - this.pendingSince >= LastTileRules.ROUND_END_DELAY_MS) {
      this.over = true;
    }
  }
}

class RankCalculator {
  static rank(roster: readonly string[], outs: ReadonlyMap<string, number>): RankEntry[] {
    const alive = roster.filter((id) => !outs.has(id));
    const entries: RankEntry[] = alive.map((id) => ({ id, rank: 1 }));
    const fallen = roster.filter((id) => outs.has(id)).sort((a, b) => (outs.get(b) as number) - (outs.get(a) as number));
    let previousRank = 0;
    let previousTime: number | null = null;
    fallen.forEach((id, order) => {
      const time = outs.get(id) as number;
      const tied = previousTime !== null && previousTime - time <= LastTileRules.TIE_MS;
      const rank = tied ? previousRank : alive.length + order + 1;
      entries.push({ id, rank });
      previousRank = rank;
      previousTime = time;
    });
    return entries;
  }

  static provisionalRank(id: string, roster: readonly string[], outs: ReadonlyMap<string, number>): number {
    const mine = outs.get(id) as number;
    let earlier = 0;
    roster.forEach((other) => {
      const time = outs.get(other);
      if (time !== undefined && time < mine - LastTileRules.TIE_MS) earlier++;
    });
    return roster.length - earlier;
  }
}

class LastTileMatch implements FighterListener, SimulationEnvironment {
  readonly board: TileBoard;
  private readonly contestantList: Contestant[];
  private readonly byId = new Map<string, Contestant>();
  private readonly outs = new Map<string, number>();
  private readonly endWatch = new RoundEndWatch();
  private concluded = false;
  private lastFlushAt = 0;
  private readonly context: ControlContext = { env: this, listener: this, allFighters: () => this.allFighters() };

  constructor(setup: MatchSetup, private readonly services: LastTileMatchServices) {
    this.board = new TileBoard(setup.seed, setup.startAt);
    this.contestantList = setup.participants.map((participant, index) => {
      const contestant = new Contestant(participant, services.controllers.controllerFor(participant));
      const spot = LastTileGeometry.startPosition(index, setup.participants.length);
      contestant.fighter.spawnAt(spot.x, spot.z);
      this.byId.set(participant.id, contestant);
      return contestant;
    });
    this.flushStates(services.clock.now());
  }

  startAt(): number {
    return this.board.startAt();
  }

  isPlaying(t: number): boolean {
    return !this.concluded && t >= this.board.startAt();
  }

  hasStarted(t: number): boolean {
    return t >= this.board.startAt();
  }

  tick(dt: number): void {
    const t = this.services.clock.now();
    this.contestantList.forEach((contestant) => {
      if (contestant.fighter.isOut()) return;
      contestant.controller.advance(contestant.fighter, dt, t, this.context);
    });
    if (t - this.lastFlushAt >= LastTileRules.NET_MS) this.flushStates(t);
    this.endWatch.observe(t, this.hasStarted(t), this.contestantList.length, this.aliveCount());
  }

  localPush(): void {
    const me = this.byId.get(this.services.localId);
    if (me) me.fighter.tryPush(this.services.clock.now(), this, this);
  }

  localDash(): void {
    const me = this.byId.get(this.services.localId);
    if (me) me.fighter.tryDash(this.services.clock.now(), this, this, null);
  }

  receiveRemoteState(id: string, snapshot: RemoteSnapshot): void {
    const contestant = this.byId.get(id);
    if (!contestant || contestant.controller.simulatesHere() || this.outs.has(id)) return;
    contestant.fighter.receiveSnapshot(snapshot);
  }

  receivePush(event: PushEvent): void {
    const t = this.services.clock.now();
    if (!event || t - event.t > LastTileRules.PUSH_EVENT_MAX_AGE_MS) return;
    this.contestantList.forEach((contestant) => {
      if (contestant.controller.simulatesHere()) contestant.fighter.receivePush(event, t, this, this);
    });
  }

  receiveTileStep(floor: number, index: number, t: number): void {
    this.board.acceptReportedStep(floor, index, t);
  }

  arbitrateTileRequest(floor: number, index: number, requestedAt: number): number | null {
    if (!isFinite(requestedAt)) return null;
    const now = this.services.clock.now();
    const accepted = MathUtil.clamp(requestedAt, now - LastTileRules.TILE_REQUEST_PAST_MS, now + LastTileRules.TILE_REQUEST_FUTURE_MS);
    const known = this.board.knownStepTime(floor, index);
    return known !== null && known <= accepted ? null : accepted;
  }

  receiveOut(id: string, t: number): void {
    this.outs.set(id, t);
    const contestant = this.byId.get(id);
    if (contestant) contestant.fighter.markOut();
  }

  markDeparted(id: string): void {
    const contestant = this.byId.get(id);
    if (contestant && !this.outs.has(id)) contestant.fighter.markDeparted();
  }

  tileStepped(floor: number, index: number, t: number): void {
    this.services.channel.publishTileStep(floor, index, t);
  }

  stateChanged(t: number): void {
    this.flushStates(t);
  }

  pushLaunched(event: PushEvent): void {
    this.services.channel.publishPush(event);
  }

  eliminated(fighterId: string, t: number): void {
    if (!this.outs.has(fighterId)) this.outs.set(fighterId, t);
    this.services.channel.publishOut(fighterId, t);
  }

  allFighters(): readonly Fighter[] {
    return this.contestantList.map((contestant) => contestant.fighter);
  }

  contestants(): readonly Contestant[] {
    return this.contestantList.slice();
  }

  contestant(id: string): Contestant | null {
    return this.byId.get(id) || null;
  }

  rosterIds(): string[] {
    return this.contestantList.map((contestant) => contestant.id);
  }

  aliveCount(): number {
    return this.contestantList.filter((contestant) => !this.outs.has(contestant.id)).length;
  }

  isOut(id: string): boolean {
    return this.outs.has(id);
  }

  provisionalRank(id: string): number {
    return RankCalculator.provisionalRank(id, this.rosterIds(), this.outs);
  }

  isOver(): boolean {
    return this.endWatch.isOver();
  }

  ranking(): RankEntry[] {
    return RankCalculator.rank(this.rosterIds(), this.outs);
  }

  conclude(): void {
    this.concluded = true;
  }

  dispose(): void {
    this.concluded = true;
    this.byId.clear();
    this.contestantList.length = 0;
    this.outs.clear();
  }

  private flushStates(t: number): void {
    this.lastFlushAt = t;
    const states: Record<string, string> = {};
    let hasStates = false;
    this.contestantList.forEach((contestant) => {
      if (!contestant.controller.simulatesHere() || contestant.fighter.hasLeft()) return;
      states[contestant.id] = contestant.fighter.encodeState(t);
      hasStates = true;
    });
    if (hasStates) this.services.channel.publishStates(states);
  }
}
