type CollectionStatus = "lobby" | "play" | "roundEnd" | "final";

interface CollectionPlayerRecord {
  nick: string;
  isAI: boolean;
  ai?: boolean;
  joinedAt: number;
  slot: number;
  look: CharacterLook;
}

interface CollectionRound {
  n: number;
  kind: string;
  seed: number;
  startAt: number;
  roster: string[];
}

interface CollectionRoundResult extends RoundResult {
  kind?: string;
}

interface CollectionJoinOutcome {
  ok: boolean;
  message: string;
}

interface CollectionListener {
  playersChanged(): void;
  playerLeft(id: string): void;
  hostChanged(): void;
  statusChanged(): void;
  roundChanged(): void;
  resultsChanged(): void;
  winsChanged(): void;
  closed(message: string): void;
}

interface Subscription {
  readonly ref: FirebaseRef;
  readonly event: FirebaseEvent;
  readonly listener: (snapshot: FirebaseSnapshot) => void;
}

class SubscriptionSet {
  private entries: Subscription[] = [];

  add(ref: FirebaseRef, event: FirebaseEvent, listener: (snapshot: FirebaseSnapshot) => void): void {
    ref.on(event, listener);
    this.entries.push({ ref, event, listener });
  }

  closeAll(): void {
    this.entries.forEach((entry) => {
      try { entry.ref.off(entry.event, entry.listener); } catch (error) { return; }
    });
    this.entries = [];
  }
}

class SessionWire implements GameWire {
  constructor(private readonly base: FirebaseRef) {}

  writeMany(stream: string, values: Record<string, string>): void {
    this.base.child(stream).update(values);
  }

  push(stream: string, value: unknown): void {
    this.base.child(stream).push(value);
  }

  set(stream: string, key: string, value: unknown): void {
    this.base.child(stream + "/" + key).set(value);
  }

  claimEarliest(stream: string, key: string, value: number): void {
    this.base.child(stream + "/" + key).transaction((current) => (current !== null && (current as number) <= value ? undefined : value));
  }
}

class CollectionSession {
  private static readonly REJOIN_TRIES = 3;
  private static readonly REJOIN_DELAY_MS = 1000;

  readonly ref: FirebaseRef;
  private hostPlayerId: string | null = null;
  private roomStatus: CollectionStatus = "lobby";
  private roomPlan: string[] = [];
  private currentRound: CollectionRound | null = null;
  private resultDeadline = 0;
  private readonly players = new Map<string, CollectionPlayerRecord>();
  private results: ResultsRecord | null = null;
  private wins: Record<string, number> = {};
  private hostLoaded = false;
  private leaving = false;
  private readonly roomSubscriptions = new SubscriptionSet();
  private readonly gameSubscriptions = new SubscriptionSet();

  constructor(private readonly backend: RoomBackend, private readonly env: BrowserEnv, readonly code: string, readonly myId: string, private readonly listener: CollectionListener) {
    this.ref = backend.ref(CollectionRules.ROOM_ROOT + "/" + code);
  }

  get hostId(): string | null { return this.hostPlayerId; }
  get status(): CollectionStatus { return this.roomStatus; }
  get plan(): readonly string[] { return this.roomPlan; }
  get round(): CollectionRound | null { return this.currentRound; }
  get nextAt(): number { return this.resultDeadline; }

  isHost(): boolean {
    return this.hostPlayerId === this.myId;
  }

  now(): number {
    return this.backend.clock.now();
  }

  player(id: string): CollectionPlayerRecord {
    return this.players.get(id) as CollectionPlayerRecord;
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  playerRecords(): Map<string, CollectionPlayerRecord> {
    return new Map(this.players);
  }

  playerIds(): string[] {
    return Array.from(this.players.keys()).sort((a, b) => (this.player(a).joinedAt || 0) - (this.player(b).joinedAt || 0));
  }

  humanIds(): string[] {
    return this.playerIds().filter((id) => !this.player(id).isAI);
  }

  winsOf(id: string): number {
    return this.wins[id] || 0;
  }

  resultsRecord(): ResultsRecord | null {
    return this.results;
  }

  connect(): void {
    this.armDisconnect();
    this.watchPlayers();
    this.roomSubscriptions.add(this.backend.ref(".info/connected"), "value", (snapshot) => {
      if (snapshot.val<boolean>() === true && !this.leaving) this.armDisconnect();
    });
    this.watchValue("hostPlayerId", (value) => {
      this.hostPlayerId = (value as string) || null;
      this.hostLoaded = true;
      this.electHost();
      this.listener.hostChanged();
    });
    this.watchValue("status", (value) => {
      if (value === null) {
        if (!this.leaving) this.listener.closed("방이 종료되었어요.");
        return;
      }
      this.roomStatus = value as CollectionStatus;
      this.listener.statusChanged();
    });
    this.watchValue("plan", (value) => { this.roomPlan = (value as string[] | null) || []; });
    this.watchValue("round", (value) => { this.currentRound = value as CollectionRound | null; this.listener.roundChanged(); });
    this.watchValue("nextAt", (value) => { this.resultDeadline = (value as number) || 0; });
    this.watchValue("results", (value) => { this.results = value as ResultsRecord | null; this.listener.resultsChanged(); });
    this.watchValue("wins", (value) => { this.wins = (value as Record<string, number>) || {}; this.listener.winsChanged(); });
  }

  wireFor(kind: string): GameWire {
    return new SessionWire(this.ref.child("games/" + kind));
  }

  listenGame(kind: string, streams: readonly WireStream[], handler: WireHandler): void {
    this.gameSubscriptions.closeAll();
    const base = this.ref.child("games/" + kind);
    streams.forEach((stream) => {
      stream.events.forEach((event) => {
        this.gameSubscriptions.add(base.child(stream.name), event, (snapshot) => handler(stream.name, snapshot.key, snapshot.val()));
      });
    });
  }

  closeGame(): void {
    this.gameSubscriptions.closeAll();
  }

  updateRoom(values: Record<string, unknown>): Promise<void> {
    return this.ref.update(values);
  }

  pushProfile(nick: string, look: CharacterLook): void {
    if (this.players.has(this.myId)) this.ref.child("players/" + this.myId).update({ nick, look });
  }

  leave(): void {
    this.shutDown();
    const mine = this.ref.child("players/" + this.myId);
    try { mine.onDisconnect().cancel(); } catch (error) { return; }
    mine.remove()
      .then(() => this.ref.child("players").once("value"))
      .then((snapshot) => this.handOverHostOrClose(snapshot.val<Record<string, CollectionPlayerRecord>>() || {}))
      .catch(() => undefined);
  }

  silentClose(): void {
    this.shutDown();
    try { this.ref.child("players/" + this.myId).onDisconnect().cancel(); } catch (error) { return; }
  }

  removeMineOnUnload(): void {
    try { this.ref.child("players/" + this.myId).remove(); } catch (error) { return; }
  }

  private shutDown(): void {
    this.leaving = true;
    this.roomSubscriptions.closeAll();
    this.gameSubscriptions.closeAll();
  }

  private handOverHostOrClose(players: Record<string, CollectionPlayerRecord>): Promise<void> | undefined {
    const humans = Object.keys(players).filter((id) => !players[id].isAI).sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0));
    if (!humans.length) return this.ref.remove();
    return this.ref.child("hostPlayerId").once("value").then((host) => {
      const hostId = host.val<string>();
      if (!hostId || !players[hostId] || players[hostId].isAI) return this.ref.update({ hostPlayerId: humans[0] });
    });
  }

  private watchPlayers(): void {
    const playersRef = this.ref.child("players");
    this.roomSubscriptions.add(playersRef, "child_added", (snapshot) => this.setPlayer(snapshot));
    this.roomSubscriptions.add(playersRef, "child_changed", (snapshot) => this.setPlayer(snapshot));
    this.roomSubscriptions.add(playersRef, "child_removed", (snapshot) => this.removePlayer(snapshot));
  }

  private watchValue(path: string, apply: (value: unknown) => void): void {
    this.roomSubscriptions.add(this.ref.child(path), "value", (snapshot) => apply(snapshot.val()));
  }

  private armDisconnect(): void {
    this.ref.child("players/" + this.myId).onDisconnect().remove();
  }

  private setPlayer(snapshot: FirebaseSnapshot): void {
    const record = snapshot.val<CollectionPlayerRecord>();
    if (!record) return;
    record.look = CharacterLooks.clean(record.look);
    this.players.set(snapshot.key, record);
    this.listener.playersChanged();
  }

  private removePlayer(snapshot: FirebaseSnapshot): void {
    if (snapshot.key === this.myId && !this.leaving) {
      this.rejoinAfterDrop(snapshot.val<CollectionPlayerRecord>() || this.players.get(this.myId) || null, 0);
      return;
    }
    this.players.delete(snapshot.key);
    this.listener.playerLeft(snapshot.key);
    this.electHost();
    this.listener.playersChanged();
  }

  private rejoinAfterDrop(last: CollectionPlayerRecord | null, tries: number): void {
    if (!last || tries >= CollectionSession.REJOIN_TRIES) {
      if (!this.leaving) this.listener.closed("연결이 끊겨 방에서 나왔어요.");
      return;
    }
    this.ref.child("status").once("value").then((snapshot) => {
      if (this.leaving) return;
      if (snapshot.val() === null) {
        this.listener.closed("방이 종료되었어요.");
        return;
      }
      return this.ref.child("players/" + this.myId).set(last).then(() => this.armDisconnect());
    }).catch(() => {
      if (!this.leaving) this.env.afterMs(CollectionSession.REJOIN_DELAY_MS, () => this.rejoinAfterDrop(last, tries + 1));
    });
  }

  private electHost(): void {
    if (!this.hostLoaded || !this.players.has(this.myId)) return;
    const current = this.hostPlayerId ? this.players.get(this.hostPlayerId) : null;
    if (current && !current.isAI) return;
    if (this.humanIds()[0] === this.myId) {
      this.hostPlayerId = this.myId;
      this.ref.update({ hostPlayerId: this.myId });
    }
  }
}

class CollectionDirectory {
  private static readonly CREATE_ATTEMPTS = 9;

  constructor(private readonly backend: RoomBackend, private readonly env: BrowserEnv, private readonly tokens: TokenSource) {}

  async create(myId: string, record: CollectionPlayerRecord): Promise<string | null> {
    await this.sweep();
    for (let attempt = 0; attempt < CollectionDirectory.CREATE_ATTEMPTS; attempt++) {
      const code = this.tokens.digits(CollectionRules.ROOM_CODE_LENGTH);
      const room = { status: "lobby", hostPlayerId: myId, createdAt: this.backend.clock.now(), players: { [myId]: record } };
      const result = await this.backend.ref(CollectionRules.ROOM_ROOT + "/" + code).transaction((current) => (current !== null ? undefined : room));
      if (result.committed) return code;
    }
    return null;
  }

  async join(code: string, myId: string, makeRecord: (existing: Map<string, CollectionPlayerRecord>) => CollectionPlayerRecord): Promise<CollectionJoinOutcome> {
    const room = this.backend.ref(CollectionRules.ROOM_ROOT + "/" + code);
    const playersSnapshot = await room.child("players").once("value");
    const players = playersSnapshot.val<Record<string, CollectionPlayerRecord>>();
    if (!players || !Object.keys(players).some((id) => !players[id].isAI)) return { ok: false, message: "그런 방이 없어요. 코드를 확인해 주세요." };
    if (Object.keys(players).length >= CollectionRules.MAX_PLAYERS) return { ok: false, message: "방이 가득 찼어요. (최대 " + CollectionRules.MAX_PLAYERS + "명)" };
    try {
      await room.child("players/" + myId).set(makeRecord(new Map(Object.keys(players).map((id) => [id, players[id]] as [string, CollectionPlayerRecord]))));
    } catch (error) {
      return { ok: false, message: "입장하지 못했어요." };
    }
    return { ok: true, message: "" };
  }

  private async sweep(): Promise<void> {
    try {
      const base = this.backend.databaseUrl();
      if (!base) return;
      const listing = await this.env.readJson(base + "/" + CollectionRules.ROOM_ROOT + ".json?shallow=true");
      const codes = Object.keys((listing as Record<string, unknown> | null) || {});
      const now = this.backend.clock.now();
      const verdicts = await Promise.all(codes.map((code) => this.isStale(code, now)));
      const updates: Record<string, null> = {};
      codes.forEach((code, index) => { if (verdicts[index]) updates[code] = null; });
      if (Object.keys(updates).length) await this.backend.ref(CollectionRules.ROOM_ROOT).update(updates);
    } catch (error) {
      return;
    }
  }

  private async isStale(code: string, now: number): Promise<boolean> {
    const room = this.backend.ref(CollectionRules.ROOM_ROOT + "/" + code);
    const [created, players] = await Promise.all(["createdAt", "players"].map((key) => room.child(key).once("value")));
    const age = now - (created.val<number>() || 0);
    const records = players.val<Record<string, CollectionPlayerRecord>>() || {};
    const hasHuman = Object.keys(records).some((id) => records[id] && !records[id].isAI);
    return (!hasHuman && age > CollectionRules.STALE_EMPTY_ROOM_MS) || age > CollectionRules.STALE_OLD_ROOM_MS;
  }
}

class CollectionDirector {
  private roundEnding = false;
  private advancing = false;
  private closing = false;
  private readonly tokens: TokenSource;

  constructor(private readonly session: CollectionSession, private readonly catalog: GameCatalog, private readonly random: RandomRange) {
    this.tokens = new TokenSource(random);
  }

  startCollection(): void {
    if (!this.session.isHost() || this.session.status !== "lobby") return;
    const players = this.session.playerRecords();
    const updates: Record<string, unknown> = {};
    const humanCount = Array.from(players.values()).filter((record) => !record.isAI).length;
    if (humanCount === 1) this.ensureOneAi(players, updates);
    else this.removeAllAi(players, updates);
    updates.results = null;
    updates.plan = PlanBuilder.build(this.catalog.ids(), CollectionRules.ROUNDS_PER_GAME);
    this.session.updateRoom(updates).then(() => this.startRound(1, players));
  }

  backToLobby(): void {
    if (!this.session.isHost()) return;
    const updates: Record<string, unknown> = { status: "lobby", results: null, round: null, plan: null, games: null, nextAt: 0 };
    this.session.playerRecords().forEach((record, id) => { if (record.isAI) updates["players/" + id] = null; });
    this.roundEnding = false;
    this.advancing = false;
    this.closing = false;
    this.session.updateRoom(updates);
  }

  tick(game: MiniGame | null): void {
    if (!this.session.isHost()) return;
    const now = this.session.now();
    if (this.session.status === "play") {
      if (game && game.isOver()) this.finishRound(game);
    } else if (this.session.status === "roundEnd" && this.session.nextAt && now >= this.session.nextAt && this.session.round) {
      this.advanceAfterResult(this.session.round.n);
    }
  }

  private startRound(roundNumber: number, known?: Map<string, CollectionPlayerRecord>): void {
    const source = known || this.session.playerRecords();
    const ids = Array.from(source.keys()).sort((a, b) => ((source.get(a) as CollectionPlayerRecord).slot || 0) - ((source.get(b) as CollectionPlayerRecord).slot || 0));
    this.roundEnding = false;
    this.advancing = false;
    const plan = this.session.plan.length ? this.session.plan : PlanBuilder.build(this.catalog.ids(), CollectionRules.ROUNDS_PER_GAME);
    if (ids.length < CollectionRules.MIN_PLAYERS || !plan[roundNumber - 1]) {
      this.session.updateRoom({ status: "lobby" });
      return;
    }
    const startAt = this.session.now() + CollectionRules.COUNTDOWN_MS + CollectionRules.COUNTDOWN_LEAD_MS;
    this.session.updateRoom({
      status: "play", games: null, nextAt: 0,
      round: { n: roundNumber, kind: plan[roundNumber - 1], seed: Math.floor(this.random.next() * 1e9), startAt, roster: ids }
    });
  }

  private advanceAfterResult(finishedRound: number): void {
    if (finishedRound >= this.session.plan.length) {
      this.finishCollection();
      return;
    }
    if (this.advancing) return;
    this.advancing = true;
    this.startRound(finishedRound + 1);
  }

  private finishRound(game: MiniGame): void {
    const round = this.session.round;
    if (this.roundEnding || !round) return;
    this.roundEnding = true;
    const ranks: Record<string, number> = {};
    game.ranking().forEach((entry) => { ranks[entry.id] = entry.rank; });
    const names: Record<string, string> = {};
    const known = new Map<string, string>();
    game.participants().forEach((participant) => known.set(participant.id, participant.nick));
    round.roster.forEach((id) => {
      names[id] = (this.session.hasPlayer(id) && this.session.player(id).nick) || known.get(id) || "?";
    });
    const updates: Record<string, unknown> = { status: "roundEnd", nextAt: this.session.now() + CollectionRules.RESULT_MS };
    updates["results/" + round.n] = { kind: round.kind, ranks, names };
    this.session.updateRoom(updates);
  }

  private finishCollection(): void {
    if (this.closing) return;
    this.closing = true;
    const scores = new TournamentScores(this.session.resultsRecord());
    const updates: Record<string, unknown> = { status: "final" };
    scores.winnerIds().forEach((id) => {
      if (this.session.hasPlayer(id)) updates["wins/" + id] = this.session.winsOf(id) + 1;
    });
    this.session.updateRoom(updates);
  }

  private ensureOneAi(players: Map<string, CollectionPlayerRecord>, updates: Record<string, unknown>): void {
    if (Array.from(players.values()).some((record) => record.isAI)) return;
    const used = new Set<string>();
    players.forEach((record) => used.add(record.nick));
    const nick = CollectionRules.AI_NAMES.filter((name) => !used.has(name))[0] || CollectionRules.AI_FALLBACK_NAME;
    const id = "ai_" + this.tokens.token(6);
    const record: CollectionPlayerRecord = { nick, isAI: true, ai: true, joinedAt: this.session.now() + 1, slot: SlotAllocator.freeSlot(players.values()), look: CharacterLooks.random() };
    updates["players/" + id] = record;
    players.set(id, record);
  }

  private removeAllAi(players: Map<string, CollectionPlayerRecord>, updates: Record<string, unknown>): void {
    Array.from(players.keys()).forEach((id) => {
      if (!(players.get(id) as CollectionPlayerRecord).isAI) return;
      updates["players/" + id] = null;
      players.delete(id);
    });
  }
}
