interface RoomFlowServices {
  readonly env: BrowserEnv;
  readonly backend: RoomBackend;
  readonly directory: LastTileRoomDirectory;
  readonly profile: PlayerProfile;
  readonly startView: StartView;
  readonly lobbyView: LastTileLobbyView;
  readonly resultView: ResultView;
  readonly runtime: MatchRuntime;
  readonly input: CombinedInput;
  readonly phases: PhaseMachine;
  readonly startPhase: GamePhase;
  readonly lobbyPhase: GamePhase;
  readonly countdownPhase: GamePhase;
  readonly resultPhase: GamePhase;
  readonly random: RandomRange;
  readonly localId: string;
}

class RoomFlow implements RoomListener, HostGate, SessionAccess, ParticipantDirectory {
  private current: LastTileRoomSession | null = null;
  private director: HostDirector | null = null;
  private readonly statusHandlers: Readonly<Record<LastTileRoomStatus, () => void>>;

  constructor(private readonly services: RoomFlowServices) {
    this.statusHandlers = {
      lobby: () => this.openLobby(),
      play: () => this.openRound(),
      roundEnd: () => this.services.phases.goTo(this.services.resultPhase),
      final: () => this.services.phases.goTo(this.services.resultPhase)
    };
    services.startView.onCreate(() => this.createRoom());
    services.startView.onJoin(() => this.joinRoom());
    services.startView.onEnterInCode(() => this.joinRoom());
    services.lobbyView.onStart(() => { if (this.director) this.director.startMatch(); });
    services.lobbyView.onLeave(() => this.leaveRoom());
    services.resultView.onLeave(() => this.leaveRoom());
    services.resultView.onToLobby(() => { if (this.director) this.director.backToLobby(); });
    services.env.onPageHide(() => { if (this.current) this.current.removeMineOnUnload(); });
  }

  session(): LastTileRoomSession | null {
    return this.current;
  }

  isHost(): boolean {
    return !!this.current && this.current.isHost();
  }

  lookup(id: string): ParticipantInfo | null {
    const session = this.current;
    if (session && session.hasPlayer(id)) {
      const record = session.player(id);
      return { nick: record.nick, slot: record.slot, ai: record.isAI };
    }
    const contestant = this.services.runtime.match ? this.services.runtime.match.contestant(id) : null;
    return contestant ? { nick: contestant.participant.nick, slot: contestant.participant.slot, ai: contestant.participant.ai } : null;
  }

  tickHost(): void {
    if (this.director) this.director.tick(this.services.runtime.match);
  }

  pushProfile(): void {
    const session = this.current;
    if (!session || !session.hasPlayer(session.myId)) return;
    session.pushProfile(this.services.profile.nick || session.player(session.myId).nick, this.services.profile.look);
  }

  playersChanged(): void { this.refreshLobby(); }

  playerLeft(id: string): void {
    const session = this.current;
    if (!session) return;
    const unrecorded = this.services.runtime.hasUnrecordedFighter(id);
    this.services.runtime.markDeparted(id);
    if (unrecorded && session.isHost() && session.status === "play") session.writeOut(id, { t: session.now(), left: 1 });
  }

  hostChanged(): void { this.refreshLobby(); }
  winsChanged(): void { this.refreshLobby(); }
  statusChanged(): void { this.syncPhase(); }
  roundChanged(): void { this.syncPhase(); }

  resultsChanged(): void {
    const session = this.current;
    if (session && (session.status === "roundEnd" || session.status === "final")) this.services.resultPhase.refresh();
  }

  remoteState(id: string, snapshot: RemoteSnapshot): void { this.services.runtime.receiveRemoteState(id, snapshot); }
  pushEvent(event: PushEvent): void { this.services.runtime.receivePush(event); }
  tileReported(floor: number, index: number, t: number): void { this.services.runtime.receiveTileStep(floor, index, t); }
  outRecorded(id: string, record: OutRecord): void { this.services.runtime.receiveOut(id, record); }
  closed(message: string): void { this.exitToStart(message); }

  tileRequested(floor: number, index: number, t: number): void {
    const accepted = this.services.runtime.arbitrateTile(floor, index, t);
    if (this.current && accepted !== null) this.current.writeAcceptedTile(floor, index, accepted);
  }

  private refreshLobby(): void {
    this.services.lobbyPhase.refresh();
  }

  private myRecord(slot: number): LastTilePlayerRecord {
    const profile = this.services.profile;
    return { nick: PlayerProfile.cleanNick(profile.nick) || profile.nickOrDefault(), isAI: false, joinedAt: this.services.backend.clock.now(), slot, look: profile.look };
  }

  private async createRoom(): Promise<void> {
    const view = this.services.startView;
    if (!this.services.backend.isOnline()) return;
    view.setCreateEnabled(false);
    view.showMessage("");
    try {
      const code = await this.services.directory.create(this.services.localId, this.myRecord(0));
      if (code) this.enterRoom(code);
      else view.showMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
    } catch (error) {
      view.showMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
    }
    view.setCreateEnabled(true);
  }

  private async joinRoom(): Promise<void> {
    const view = this.services.startView;
    if (!this.services.backend.isOnline()) return;
    const code = view.enteredCode();
    if (code.length !== LastTileRules.ROOM_CODE_LENGTH) {
      view.showMessage("방 코드 5자리를 입력해 주세요.");
      return;
    }
    view.setJoinEnabled(false);
    view.showMessage("");
    try {
      const outcome = await this.services.directory.join(code, this.services.localId, (existing) => this.myRecord(SlotAllocator.freeSlot(existing.values())));
      view.setJoinEnabled(true);
      if (outcome.ok) this.enterRoom(code);
      else view.showMessage(outcome.message);
    } catch (error) {
      view.setJoinEnabled(true);
      view.showMessage("방을 불러오지 못했어요.");
    }
  }

  private enterRoom(code: string): void {
    this.services.runtime.dispose();
    const session = new LastTileRoomSession(this.services.backend, this.services.env, code, this.services.localId, this);
    this.current = session;
    this.director = new HostDirector(session, this.services.random);
    session.connect();
    this.services.lobbyView.showCode(code);
    this.services.phases.goTo(this.services.lobbyPhase);
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
    this.services.input.releaseAll();
    this.services.phases.goTo(this.services.startPhase);
    this.services.startView.showMessage(message);
  }

  private syncPhase(): void {
    if (this.current) this.statusHandlers[this.current.status]();
  }

  private openLobby(): void {
    this.services.runtime.dispose();
    this.services.phases.goTo(this.services.lobbyPhase);
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
    this.services.runtime.begin(round, participants, looks, new RoomMatchChannel(session));
    this.services.phases.goTo(this.services.countdownPhase);
  }
}
