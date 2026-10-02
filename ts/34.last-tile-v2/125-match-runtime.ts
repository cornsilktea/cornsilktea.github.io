interface ControllerRule {
  matches(participant: MatchParticipant): boolean;
  create(participant: MatchParticipant): PlayerController;
}

class LocalControllerRule implements ControllerRule {
  constructor(private readonly localId: string, private readonly movement: MovementSource) {}

  matches(participant: MatchParticipant): boolean { return participant.id === this.localId; }
  create(participant: MatchParticipant): PlayerController { return new LocalPlayerController(this.movement); }
}

class AiControllerRule implements ControllerRule {
  constructor(private readonly host: HostGate, private readonly random: RandomSource) {}

  matches(participant: MatchParticipant): boolean { return participant.ai; }
  create(participant: MatchParticipant): PlayerController { return new AiController(new AiBrain(new RandomRange(this.random)), this.host); }
}

class RemoteControllerRule implements ControllerRule {
  matches(participant: MatchParticipant): boolean { return true; }
  create(participant: MatchParticipant): PlayerController { return new RemotePlayerController(); }
}

class RoundControllers implements ControllerFactory {
  private readonly rules: readonly ControllerRule[];

  constructor(localId: string, movement: MovementSource, host: HostGate, random: RandomSource) {
    this.rules = [new LocalControllerRule(localId, movement), new AiControllerRule(host, random), new RemoteControllerRule()];
  }

  controllerFor(participant: MatchParticipant): PlayerController {
    return (this.rules.find((rule) => rule.matches(participant)) as ControllerRule).create(participant);
  }
}

class FighterViews {
  private readonly views = new Map<string, FighterView>();

  constructor(
    private readonly kit: FighterViewKit,
    private readonly factory: CharacterModelFactory,
    private readonly assets: CharacterAssets,
    private readonly world: Three<"Group">
  ) {}

  rebuild(match: LastTileMatch, looks: ReadonlyMap<string, CharacterLook>): void {
    this.clear();
    match.contestants().forEach((contestant) => {
      const look = looks.get(contestant.id) || CharacterLooks.createDefault();
      this.views.set(contestant.id, new FighterView(this.kit, this.factory, this.assets.clips, this.world, contestant.participant, look, contestant.fighter.yaw));
    });
  }

  update(match: LastTileMatch, dt: number, t: number, subject: Fighter | null, shownFloor: number): void {
    match.contestants().forEach((contestant) => {
      const view = this.views.get(contestant.id);
      if (view) view.update(contestant.fighter, { t, dt, subject, shownFloor, simulatedHere: contestant.controller.simulatesHere() });
    });
  }

  clear(): void {
    this.views.forEach((view) => view.dispose());
    this.views.clear();
  }
}

class StageRenderer {
  private readonly backdropBoard = TileBoard.inactive();

  constructor(
    private readonly world: LastTileWorldView,
    private readonly board: BoardView,
    private readonly floors: FloorPresenter,
    private readonly camera: CameraRig,
    private readonly subjects: SubjectSelector,
    private readonly views: FighterViews
  ) {}

  get shownFloor(): number { return this.floors.shownFloor; }

  isReady(): boolean {
    return this.board.isBuilt();
  }

  showMenuFloor(): void {
    this.floors.showTop();
    this.board.showUpTo(LastTileRules.FLOOR_COUNT - 1);
  }

  prepareForMatch(match: LastTileMatch, looks: ReadonlyMap<string, CharacterLook>): void {
    this.views.rebuild(match, looks);
    this.floors.showTop();
    this.camera.reset();
    this.subjects.reset();
  }

  releaseMatch(): void {
    this.views.clear();
    this.floors.showTop();
    this.camera.reset();
  }

  subjectOf(match: LastTileMatch): Fighter | null {
    return this.subjects.subject(match);
  }

  spectateNext(match: LastTileMatch): void {
    this.subjects.cycle(match);
  }

  renderBackdrop(t: number): void {
    if (this.board.isBuilt()) {
      this.board.showUpTo(LastTileRules.FLOOR_COUNT - 1);
      this.board.render(this.backdropBoard, t, LastTileRules.FLOOR_COUNT - 1);
    }
    this.camera.showcase();
    this.world.render();
  }

  renderMatch(match: LastTileMatch, dt: number, t: number, subject: Fighter | null): void {
    this.floors.follow(subject);
    this.views.update(match, dt, t, subject, this.floors.shownFloor);
    if (this.board.isBuilt()) this.board.render(match.board, t, this.floors.shownFloor);
    this.camera.follow(dt, subject, this.floors.shownFloor);
    this.world.render();
  }
}

class MatchRuntime {
  private active: LastTileMatch | null = null;
  private startedRound: RoundRecord | null = null;

  constructor(
    private readonly stage: StageRenderer,
    private readonly clock: Clock,
    private readonly localId: string,
    private readonly movement: MovementSource,
    private readonly host: HostGate,
    private readonly random: RandomSource
  ) {}

  get match(): LastTileMatch | null { return this.active; }
  get roundNumber(): number { return this.startedRound ? this.startedRound.n : 0; }

  isRoundStarted(startAt: number): boolean {
    return this.startedRound !== null && this.startedRound.startAt === startAt;
  }

  begin(round: RoundRecord, participants: MatchParticipant[], looks: ReadonlyMap<string, CharacterLook>, channel: MatchChannel): void {
    this.dispose();
    const services: LastTileMatchServices = {
      clock: this.clock,
      channel,
      controllers: new RoundControllers(this.localId, this.movement, this.host, this.random),
      localId: this.localId
    };
    this.startedRound = round;
    this.active = new LastTileMatch({ seed: round.seed, startAt: round.startAt, participants }, services);
    this.stage.prepareForMatch(this.active, looks);
  }

  step(dt: number, draw: boolean): Fighter | null {
    const match = this.active;
    if (!match) return null;
    match.tick(dt);
    const subject = this.stage.subjectOf(match);
    if (draw) this.stage.renderMatch(match, dt, this.clock.now(), subject);
    return subject;
  }

  conclude(): void {
    if (this.active) this.active.conclude();
  }

  localPush(): void {
    if (this.active) this.active.localPush();
  }

  localDash(): void {
    if (this.active) this.active.localDash();
  }

  spectateNext(): void {
    if (this.active) this.stage.spectateNext(this.active);
  }

  receiveRemoteState(id: string, snapshot: RemoteSnapshot): void {
    if (this.active) this.active.receiveRemoteState(id, snapshot);
  }

  receivePush(event: PushEvent): void {
    if (this.active) this.active.receivePush(event);
  }

  receiveTileStep(floor: number, index: number, t: number): void {
    if (this.active) this.active.receiveTileStep(floor, index, t);
  }

  arbitrateTile(floor: number, index: number, requestedAt: number): number | null {
    return this.active ? this.active.arbitrateTileRequest(floor, index, requestedAt) : null;
  }

  receiveOut(id: string, record: OutRecord): void {
    if (this.active) this.active.receiveOut(id, record.t);
  }

  markDeparted(id: string): void {
    if (this.active) this.active.markDeparted(id);
  }

  hasUnrecordedFighter(id: string): boolean {
    return !!this.active && !!this.active.contestant(id) && !this.active.isOut(id);
  }

  dispose(): void {
    if (this.active) this.active.dispose();
    this.active = null;
    this.startedRound = null;
    this.stage.releaseMatch();
  }
}
