interface GameShell {
  readonly libs: ThreeLibs;
  readonly page: Page;
  readonly env: BrowserEnv;
  readonly clock: Clock;
  readonly render: RenderHost;
  readonly characters: CharacterSet;
  readonly localId: string;
  readonly host: HostGate;
}

class GameRuntime implements ActionSink {
  private active: MiniGame | null = null;
  private activeRound: CollectionRound | null = null;
  private activeSession: CollectionSession | null = null;

  constructor(private readonly catalog: GameCatalog, private readonly shell: GameShell, private readonly hub: ActionHub) {}

  get game(): MiniGame | null { return this.active; }
  get round(): CollectionRound | null { return this.activeRound; }

  isRoundStarted(startAt: number): boolean {
    return this.activeRound !== null && this.activeRound.startAt === startAt;
  }

  begin(round: CollectionRound, participants: MatchParticipant[], looks: ReadonlyMap<string, CharacterLook>, session: CollectionSession): boolean {
    this.dispose();
    const definition = this.catalog.find(round.kind);
    if (!definition) return false;
    const shell = this.shell;
    const game = definition.create({
      seed: round.seed, startAt: round.startAt, participants, looks,
      localId: shell.localId, clock: shell.clock, wire: session.wireFor(round.kind), host: shell.host, render: shell.render,
      movement: this.hub, libs: shell.libs, page: shell.page, env: shell.env, characters: shell.characters
    });
    this.active = game;
    this.activeRound = round;
    this.activeSession = session;
    session.listenGame(round.kind, game.streams(), (stream, key, value) => game.receive(stream, key, value));
    this.hub.configure(game.controls(), this);
    return true;
  }

  step(dt: number, draw: boolean): void {
    if (this.active) this.active.tick(dt, draw);
  }

  conclude(): void {
    if (this.active) this.active.conclude();
  }

  playerDeparted(id: string): void {
    if (this.active) this.active.playerDeparted(id);
  }

  onAction(action: string): void {
    if (this.active) this.active.perform(action);
  }

  onSpectateNext(): void {
    if (this.active) this.active.spectateNext();
  }

  onSpectateTo(id: string): void {
    if (this.active) this.active.spectateTo(id);
  }

  dispose(): void {
    if (this.activeSession) this.activeSession.closeGame();
    if (this.active) this.active.dispose();
    this.active = null;
    this.activeRound = null;
    this.activeSession = null;
    this.hub.clear();
    this.shell.render.clear();
  }
}

class MenuBackdropDirector {
  private current: GameBackdrop | null = null;
  private ready = false;

  constructor(private readonly catalog: GameCatalog, private readonly context: BackdropContext, private readonly random: RandomSource) {}

  markReady(): void {
    this.ready = true;
  }

  render(dt: number): void {
    if (!this.current && this.ready) {
      const definition = this.catalog.pickRandom(this.random);
      this.current = definition ? definition.createBackdrop(this.context) : null;
    }
    if (this.current) this.current.render(dt);
    else this.context.render.clear();
  }

  release(): void {
    if (this.current) this.current.dispose();
    this.current = null;
  }
}

interface CollectionSessionAccess {
  session(): CollectionSession | null;
}

interface CollectionServices extends CollectionSessionAccess {
  readonly clock: Clock;
  readonly screens: CollectionScreens;
  readonly runtime: GameRuntime;
  readonly hud: CollectionHud;
  readonly spectatorBar: SpectatorViewBar;
  readonly messages: MessageView;
  readonly hub: ActionHub;
  readonly render: RenderHost;
  readonly backdrops: MenuBackdropDirector;
  readonly catalog: GameCatalog;
  readonly lobbyView: CollectionLobbyView;
  readonly resultView: CollectionResultView;
  readonly profilePanel: ProfilePanel;
  readonly startProfileHost: HTMLElement;
  readonly lobbyProfileHost: HTMLElement;
  readonly practiceProfileHost: HTMLElement;
  readonly localId: string;
  readonly directory: ParticipantDirectory;
}

abstract class CollectionPhase {
  constructor(protected readonly services: CollectionServices) {}

  abstract enter(): void;
  abstract update(dt: number, draw: boolean): void;

  exit(): void {
    return;
  }

  refresh(): void {
    return;
  }
}

class CollectionPhaseMachine {
  private current: CollectionPhase | null = null;

  goTo(phase: CollectionPhase): void {
    if (this.current === phase) {
      phase.refresh();
      return;
    }
    if (this.current) this.current.exit();
    this.current = phase;
    phase.enter();
  }

  update(dt: number, draw: boolean): void {
    if (this.current) this.current.update(dt, draw);
  }
}

abstract class MenuScreenPhase extends CollectionPhase {
  update(dt: number, draw: boolean): void {
    if (draw) this.services.backdrops.render(dt);
  }

  protected showMenu(screen: CollectionScreenName, profileHost: HTMLElement): void {
    this.services.screens.show(screen);
    this.services.profilePanel.setActive(true);
    this.services.profilePanel.mountInto(profileHost);
  }
}

class StartScreenPhase extends MenuScreenPhase {
  enter(): void {
    this.showMenu("start", this.services.startProfileHost);
  }
}

class LobbyScreenPhase extends MenuScreenPhase {
  enter(): void {
    this.showMenu("lobby", this.services.lobbyProfileHost);
    this.refresh();
  }

  refresh(): void {
    const session = this.services.session();
    if (session && this.services.screens.current === "lobby") this.services.lobbyView.render(session);
  }
}

class PracticeScreenPhase extends MenuScreenPhase {
  enter(): void {
    this.showMenu("practice", this.services.practiceProfileHost);
  }
}

class PlayScreenPhase extends CollectionPhase {
  private static readonly ROSTER_REFRESH_SECONDS = 0.2;
  private rosterClock = 0;

  enter(): void {
    this.services.backdrops.release();
    this.services.screens.show("game");
    this.services.profilePanel.setActive(false);
    this.rosterClock = PlayScreenPhase.ROSTER_REFRESH_SECONDS;
  }

  exit(): void {
    this.services.spectatorBar.hide();
  }

  update(dt: number, draw: boolean): void {
    const game = this.services.runtime.game;
    const session = this.services.session();
    if (!game || !session || !session.round) return;
    this.services.runtime.step(dt, draw);
    const model = game.hud(this.services.clock.now());
    this.rosterClock += dt;
    if (this.rosterClock > PlayScreenPhase.ROSTER_REFRESH_SECONDS) {
      this.rosterClock = 0;
      this.services.hud.renderRoster(model, this.services.localId, this.roundLabel(session, session.round), this.spectatorNames(session, session.round));
    }
    this.services.hud.renderLive(model);
    model.cooldowns.forEach((cooldown) => this.services.hub.setCooldown(cooldown.action, cooldown.left));
    this.services.messages.showBanner(model.bannerHtml, model.bannerWarning);
    this.services.messages.showCenter(model.centerText);
    this.services.spectatorBar.render(model);
  }

  private roundLabel(session: CollectionSession, round: CollectionRound): string {
    const definition = this.services.catalog.find(round.kind);
    return round.n + " / " + session.plan.length + " · " + (definition ? definition.title : "");
  }

  private spectatorNames(session: CollectionSession, round: CollectionRound): string[] {
    return session.playerIds().filter((id) => round.roster.indexOf(id) < 0).map((id) => session.player(id).nick);
  }
}

class ResultScreenPhase extends CollectionPhase {
  enter(): void {
    this.services.screens.show("result");
    this.services.runtime.conclude();
    this.services.profilePanel.setActive(false);
    this.refresh();
  }

  update(dt: number, draw: boolean): void {
    this.services.runtime.step(dt, draw);
    this.showCountdown();
  }

  refresh(): void {
    const session = this.services.session();
    if (!session || !session.round) return;
    const view = this.services.resultView;
    const final = session.status === "final";
    const scores = new TournamentScores(session.resultsRecord());
    if (final) view.renderFinal(scores, this.services.localId, this.services.directory);
    else view.renderRound(session.round, session.plan.length, scores, (session.resultsRecord() || {})[session.round.n] || {}, this.services.localId, this.services.directory);
    view.showButtons(final, session.isHost());
  }

  private showCountdown(): void {
    const session = this.services.session();
    if (!session || session.status !== "roundEnd" || !session.round) return;
    const left = Math.max(0, Math.ceil((session.nextAt - session.now()) / 1000));
    const next = this.services.catalog.find(session.plan[session.round.n] || "");
    if (session.practice) {
      this.services.resultView.showCountdown("연습 끝 · " + left + "초 후 종목 선택으로 돌아가요");
      return;
    }
    this.services.resultView.showCountdown(next ?"다음 종목 · " + next.title + " · " + left + "초 후 시작" : "최종 결과 " + left + "초 후");
  }
}

interface CollectionFlowServices {
  readonly env: BrowserEnv;
  readonly backend: RoomBackend;
  readonly directory: CollectionDirectory;
  readonly catalog: GameCatalog;
  readonly profile: PlayerProfile;
  readonly startView: StartView;
  readonly practiceEntry: PracticeEntryView;
  readonly practiceMenu: PracticeMenuView;
  readonly lobbyView: CollectionLobbyView;
  readonly resultView: CollectionResultView;
  readonly runtime: GameRuntime;
  readonly hub: ActionHub;
  readonly phases: CollectionPhaseMachine;
  readonly startPhase: CollectionPhase;
  readonly lobbyPhase: CollectionPhase;
  readonly practicePhase: CollectionPhase;
  readonly playPhase: CollectionPhase;
  readonly resultPhase: CollectionPhase;
  readonly random: RandomRange;
  readonly localId: string;
}

class CollectionFlow implements CollectionListener, HostGate, CollectionSessionAccess, ParticipantDirectory {
  private current: CollectionSession | null = null;
  private director: CollectionDirector | null = null;
  private readonly statusHandlers: Readonly<Record<CollectionStatus, () => void>>;

  constructor(private readonly services: CollectionFlowServices) {
    this.statusHandlers = {
      lobby: () => this.openLobby(),
      play: () => this.openRound(),
      roundEnd: () => this.services.phases.goTo(this.services.resultPhase),
      final: () => this.services.phases.goTo(this.services.resultPhase)
    };
    services.startView.onCreate(() => this.createRoom(false));
    services.practiceEntry.onClick(() => this.createRoom(true));
    services.practiceMenu.onPick((gameId) => { if (this.director) this.director.startPractice(gameId); });
    services.practiceMenu.onLeave(() => this.leaveRoom());
    services.lobbyView.onSwitchSeat(() => { if (this.current) this.current.switchSeat(); });
    services.startView.onJoin(() => this.joinRoom());
    services.startView.onEnterInCode(() => this.joinRoom());
    services.lobbyView.onStart(() => { if (this.director) this.director.startCollection(); });
    services.lobbyView.onLeave(() => this.leaveRoom());
    services.resultView.onLeave(() => this.leaveRoom());
    services.resultView.onToLobby(() => { if (this.director) this.director.backToLobby(); });
    services.env.onPageHide(() => { if (this.current) this.current.removeMineOnUnload(); });
  }

  session(): CollectionSession | null {
    return this.current;
  }

  isHost(): boolean {
    return !!this.current && this.current.isHost();
  }

  lookup(id: string): ParticipantInfo | null {
    const session = this.current;
    if (!session || !session.hasPlayer(id)) return null;
    const record = session.player(id);
    return { nick: record.nick, slot: record.slot, ai: record.isAI };
  }

  tickHost(): void {
    if (this.director) this.director.tick(this.services.runtime.game);
  }

  pushProfile(): void {
    const session = this.current;
    if (!session || !session.hasPlayer(session.myId)) return;
    session.pushProfile(this.services.profile.nick || session.player(session.myId).nick, this.services.profile.look);
  }

  playersChanged(): void { this.services.lobbyPhase.refresh(); }
  hostChanged(): void {
    this.services.lobbyPhase.refresh();
    this.settleDepartures();
  }
  winsChanged(): void { this.services.lobbyPhase.refresh(); }
  statusChanged(): void { this.syncPhase(); }
  roundChanged(): void { this.syncPhase(); }
  closed(message: string): void { this.exitToStart(message); }

  playerLeft(id: string): void {
    this.services.runtime.playerDeparted(id);
  }

  resultsChanged(): void {
    const session = this.current;
    if (session && (session.status === "roundEnd" || session.status === "final")) this.services.resultPhase.refresh();
  }

  private settleDepartures(): void {
    const session = this.current;
    const round = this.services.runtime.round;
    if (!session || !round || !session.isHost() || session.status !== "play") return;
    round.roster.filter((id) => !session.hasPlayer(id)).forEach((id) => this.services.runtime.playerDeparted(id));
  }

  private myRecord(slot: number, spectator: boolean): CollectionPlayerRecord {
    const profile = this.services.profile;
    const record: CollectionPlayerRecord = { nick: PlayerProfile.cleanNick(profile.nick) || profile.nickOrDefault(), isAI: false, joinedAt: this.services.backend.clock.now(), slot, look: profile.look };
    if (spectator) record.spectator = true;
    return record;
  }

  private setCreateBusy(busy: boolean): void {
    this.services.startView.setCreateEnabled(!busy);
    this.services.practiceEntry.setEnabled(!busy);
  }

  private async createRoom(practice: boolean): Promise<void> {
    const view = this.services.startView;
    if (!this.services.backend.isOnline()) return;
    this.setCreateBusy(true);
    view.showMessage("");
    try {
      const code = await this.services.directory.create(this.services.localId, this.myRecord(0, false), practice);
      if (code) this.enterRoom(code, practice);
      else view.showMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
    } catch (error) {
      view.showMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
    }
    this.setCreateBusy(false);
  }

  private async joinRoom(): Promise<void> {
    const view = this.services.startView;
    if (!this.services.backend.isOnline()) return;
    const code = view.enteredCode();
    if (code.length !== CollectionRules.ROOM_CODE_LENGTH) {
      view.showMessage("방 코드 5자리를 입력해 주세요.");
      return;
    }
    view.setJoinEnabled(false);
    view.showMessage("");
    try {
      const outcome = await this.services.directory.join(code, this.services.localId, (existing, spectator) => this.myRecord(spectator ? CollectionRules.SPECTATOR_SLOT : SlotAllocator.freeSlot(existing.values()), spectator));
      view.setJoinEnabled(true);
      if (outcome.ok) this.enterRoom(code, false);
      else view.showMessage(outcome.message);
    } catch (error) {
      view.setJoinEnabled(true);
      view.showMessage("방을 불러오지 못했어요.");
    }
  }

  private enterRoom(code: string, practice: boolean): void {
    this.services.runtime.dispose();
    const session = new CollectionSession(this.services.backend, this.services.env, code, this.services.localId, practice, this);
    this.current = session;
    this.director = new CollectionDirector(session, this.services.catalog, this.services.random);
    session.connect();
    this.services.lobbyView.showCode(code);
    this.services.phases.goTo(practice ? this.services.practicePhase : this.services.lobbyPhase);
  }

  private leaveRoom(): void {
    if (this.current) this.current.leave();
    this.returnToStart("");
  }

  private exitToStart(message: string): void {
    if (this.current) this.current.silentClose();
    this.returnToStart(message);
  }

  private returnToStart(message: string): void {
    this.current = null;
    this.director = null;
    this.services.runtime.dispose();
    this.services.hub.releaseAll();
    this.services.phases.goTo(this.services.startPhase);
    this.services.startView.showMessage(message);
  }

  private syncPhase(): void {
    if (this.current) this.statusHandlers[this.current.status]();
  }

  private openLobby(): void {
    this.services.runtime.dispose();
    const practice = !!this.current && this.current.practice;
    this.services.phases.goTo(practice ? this.services.practicePhase : this.services.lobbyPhase);
  }

  private openRound(): void {
    const session = this.current;
    const round = session ? session.round : null;
    if (!session || !round || this.services.runtime.isRoundStarted(round.startAt)) return;
    const participants: MatchParticipant[] = [];
    const looks = new Map<string, CharacterLook>();
    round.roster.forEach((id, index) => {
      const record = session.hasPlayer(id) ? session.player(id) : null;
      participants.push({ id, nick: record ? record.nick || "?" : "?", ai: !!(record && (record.ai || record.isAI)), slot: record ? record.slot || 0 : index });
      looks.set(id, record ? record.look : CharacterLooks.createDefault());
    });
    if (this.services.runtime.begin(round, participants, looks, session)) this.services.phases.goTo(this.services.playPhase);
  }
}
