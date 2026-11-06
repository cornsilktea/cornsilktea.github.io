type LastTileRoomStatus = "lobby" | "play" | "roundEnd" | "final";

interface LastTilePlayerRecord {
  nick: string;
  isAI: boolean;
  ai?: boolean;
  joinedAt: number;
  slot: number;
  look: CharacterLook;
}

interface RoundRecord {
  n: number;
  seed: number;
  startAt: number;
  roster: string[];
}

interface OutRecord {
  t: number;
  left?: number;
}

interface LastTileJoinOutcome {
  ok: boolean;
  message: string;
}

class RoomBackend {
  readonly database: FirebaseDatabase | null = null;
  readonly clock = new OffsetClock();

  constructor(private readonly env: BrowserEnv) {
    const config = env.portalConfig();
    const api = env.firebaseApi();
    try {
      if (api && config && config.isReady()) {
        api.initializeApp({ apiKey: config.API_KEY, authDomain: config.AUTH_DOMAIN, databaseURL: config.DB_URL.replace(/\/+$/, "") });
        this.database = api.database();
      }
    } catch (error) {
      this.database = null;
    }
    if (this.database) {
      this.database.ref(".info/serverTimeOffset").on("value", (snapshot) => {
        this.clock.setOffset(snapshot.val<number>() || 0);
      });
    }
  }

  isOnline(): boolean {
    return this.database !== null;
  }

  ref(path: string): FirebaseRef {
    return (this.database as FirebaseDatabase).ref(path);
  }

  databaseUrl(): string {
    const config = this.env.portalConfig();
    return config ? config.DB_URL.replace(/\/+$/, "") : "";
  }
}

interface RoomListener {
  playersChanged(): void;
  playerLeft(id: string): void;
  hostChanged(): void;
  statusChanged(): void;
  roundChanged(): void;
  resultsChanged(): void;
  winsChanged(): void;
  remoteState(id: string, snapshot: RemoteSnapshot): void;
  pushEvent(event: PushEvent): void;
  tileReported(floor: number, index: number, t: number): void;
  tileRequested(floor: number, index: number, t: number): void;
  outRecorded(id: string, record: OutRecord): void;
  closed(message: string): void;
}

class SlotAllocator {
  static freeSlot(records: Iterable<LastTilePlayerRecord>): number {
    const used = new Set<number>();
    for (const record of records) used.add(record.slot);
    for (let slot = 0; slot < LastTileRules.MAX_PLAYERS; slot++) if (!used.has(slot)) return slot;
    return 0;
  }
}

class LastTileRoomSession implements HostGate {
  private static readonly REJOIN_TRIES = 3;
  private static readonly REJOIN_DELAY_MS = 1000;

  readonly ref: FirebaseRef;
  private hostPlayerId: string | null = null;
  private roomStatus: LastTileRoomStatus = "lobby";
  private currentRound: RoundRecord | null = null;
  private resultDeadline = 0;
  private readonly players = new Map<string, LastTilePlayerRecord>();
  private results: ResultsRecord | null = null;
  private wins: Record<string, number> = {};
  private hostLoaded = false;
  private leaving = false;
  private subscriptions: Array<{ ref: FirebaseRef; event: FirebaseEvent; listener: (snapshot: FirebaseSnapshot) => void }> = [];

  constructor(private readonly backend: RoomBackend, private readonly env: BrowserEnv, readonly code: string, readonly myId: string, private readonly listener: RoomListener) {
    this.ref = backend.ref(LastTileRules.ROOM_ROOT + "/" + code);
  }

  get hostId(): string | null { return this.hostPlayerId; }
  get status(): LastTileRoomStatus { return this.roomStatus; }
  get round(): RoundRecord | null { return this.currentRound; }
  get nextAt(): number { return this.resultDeadline; }

  isHost(): boolean {
    return this.hostPlayerId === this.myId;
  }

  now(): number {
    return this.backend.clock.now();
  }

  player(id: string): LastTilePlayerRecord {
    return this.players.get(id) as LastTilePlayerRecord;
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  playerCount(): number {
    return this.players.size;
  }

  playerRecords(): Map<string, LastTilePlayerRecord> {
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
    this.subscribe(this.backend.ref(".info/connected"), "value", (snapshot) => {
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
      this.roomStatus = value as LastTileRoomStatus;
      this.listener.statusChanged();
    });
    this.watchValue("round", (value) => { this.currentRound = value as RoundRecord | null; this.listener.roundChanged(); });
    this.watchValue("nextAt", (value) => { this.resultDeadline = (value as number) || 0; });
    this.watchValue("results", (value) => { this.results = value as ResultsRecord | null; this.listener.resultsChanged(); });
    this.watchValue("wins", (value) => { this.wins = (value as Record<string, number>) || {}; this.listener.winsChanged(); });
    this.watchStates();
    this.subscribe(this.ref.child("ev"), "child_added", (snapshot) => this.listener.pushEvent(snapshot.val<PushEvent>() as PushEvent));
    this.watchTiles();
    this.subscribe(this.ref.child("out"), "child_added", (snapshot) => this.listener.outRecorded(snapshot.key, snapshot.val<OutRecord>() || { t: this.now() }));
  }

  updateRoom(values: Record<string, unknown>): Promise<void> {
    return this.ref.update(values);
  }

  writeStates(states: Record<string, string>): void {
    this.ref.child("st").update(states);
  }

  writePush(event: PushEvent): void {
    this.ref.child("ev").push(event);
  }

  reportTileStep(floor: number, index: number, t: number): void {
    const key = floor + "_" + index;
    if (this.isHost()) this.ref.child("tiles/" + key).set(t);
    else this.ref.child("tileReq/" + key).transaction((current) => (current !== null && (current as number) <= t ? undefined : t));
  }

  writeAcceptedTile(floor: number, index: number, t: number): void {
    this.ref.child("tiles/" + floor + "_" + index).set(t);
  }

  writeOut(id: string, record: OutRecord): void {
    this.ref.child("out/" + id).set(record);
  }

  pushProfile(nick: string, look: CharacterLook): void {
    if (this.players.has(this.myId)) this.ref.child("players/" + this.myId).update({ nick, look });
  }

  leave(): void {
    this.leaving = true;
    this.unsubscribeAll();
    const mine = this.ref.child("players/" + this.myId);
    try { mine.onDisconnect().cancel(); } catch (error) { return; }
    mine.remove()
      .then(() => this.ref.child("players").once("value"))
      .then((snapshot) => this.handOverHostOrClose(snapshot.val<Record<string, LastTilePlayerRecord>>() || {}))
      .catch(() => undefined);
  }

  silentClose(): void {
    this.leaving = true;
    this.unsubscribeAll();
    try { this.ref.child("players/" + this.myId).onDisconnect().cancel(); } catch (error) { return; }
  }

  removeMineOnUnload(): void {
    try { this.ref.child("players/" + this.myId).remove(); } catch (error) { return; }
  }

  private handOverHostOrClose(players: Record<string, LastTilePlayerRecord>): Promise<void> | undefined {
    const humans = Object.keys(players).filter((id) => !players[id].isAI).sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0));
    if (!humans.length) return this.ref.remove();
    return this.ref.child("hostPlayerId").once("value").then((host) => {
      const hostId = host.val<string>();
      if (!hostId || !players[hostId] || players[hostId].isAI) return this.ref.update({ hostPlayerId: humans[0] });
    });
  }

  private watchPlayers(): void {
    const playersRef = this.ref.child("players");
    this.subscribe(playersRef, "child_added", (snapshot) => this.setPlayer(snapshot));
    this.subscribe(playersRef, "child_changed", (snapshot) => this.setPlayer(snapshot));
    this.subscribe(playersRef, "child_removed", (snapshot) => this.removePlayer(snapshot));
  }

  private watchStates(): void {
    const stateRef = this.ref.child("st");
    const onState = (snapshot: FirebaseSnapshot) => {
      const decoded = FighterStateCodec.decode(snapshot.val());
      if (decoded) this.listener.remoteState(snapshot.key, decoded);
    };
    this.subscribe(stateRef, "child_added", onState);
    this.subscribe(stateRef, "child_changed", onState);
  }

  private watchTiles(): void {
    const parse = (snapshot: FirebaseSnapshot) => {
      const parts = snapshot.key.split("_");
      return { floor: +parts[0], index: +parts[1], t: +(snapshot.val<number>() as number) };
    };
    const onTile = (snapshot: FirebaseSnapshot) => {
      const tile = parse(snapshot);
      if (!isNaN(tile.index) && isFinite(tile.t)) this.listener.tileReported(tile.floor, tile.index, tile.t);
    };
    const tilesRef = this.ref.child("tiles");
    this.subscribe(tilesRef, "child_added", onTile);
    this.subscribe(tilesRef, "child_changed", onTile);
    const onRequest = (snapshot: FirebaseSnapshot) => {
      if (!this.isHost()) return;
      const tile = parse(snapshot);
      this.listener.tileRequested(tile.floor, tile.index, tile.t);
    };
    const requestRef = this.ref.child("tileReq");
    this.subscribe(requestRef, "child_added", onRequest);
    this.subscribe(requestRef, "child_changed", onRequest);
  }

  private watchValue(path: string, apply: (value: unknown) => void): void {
    this.subscribe(this.ref.child(path), "value", (snapshot) => apply(snapshot.val()));
  }

  private subscribe(ref: FirebaseRef, event: FirebaseEvent, listener: (snapshot: FirebaseSnapshot) => void): void {
    ref.on(event, listener);
    this.subscriptions.push({ ref, event, listener });
  }

  private unsubscribeAll(): void {
    this.subscriptions.forEach((entry) => {
      try { entry.ref.off(entry.event, entry.listener); } catch (error) { return; }
    });
    this.subscriptions = [];
  }

  private armDisconnect(): void {
    this.ref.child("players/" + this.myId).onDisconnect().remove();
    this.ref.child("st/" + this.myId).onDisconnect().remove();
  }

  private setPlayer(snapshot: FirebaseSnapshot): void {
    const record = snapshot.val<LastTilePlayerRecord>();
    if (!record) return;
    record.look = CharacterLooks.clean(record.look);
    this.players.set(snapshot.key, record);
    this.listener.playersChanged();
  }

  private removePlayer(snapshot: FirebaseSnapshot): void {
    if (snapshot.key === this.myId && !this.leaving) {
      this.rejoinAfterDrop(snapshot.val<LastTilePlayerRecord>() || this.players.get(this.myId) || null, 0);
      return;
    }
    this.players.delete(snapshot.key);
    this.listener.playerLeft(snapshot.key);
    this.electHost();
    this.listener.playersChanged();
  }

  private rejoinAfterDrop(last: LastTilePlayerRecord | null, tries: number): void {
    if (!last || tries >= LastTileRoomSession.REJOIN_TRIES) {
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
      if (!this.leaving) this.env.afterMs(LastTileRoomSession.REJOIN_DELAY_MS, () => this.rejoinAfterDrop(last, tries + 1));
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

class LastTileRoomDirectory {
  private static readonly CREATE_ATTEMPTS = 9;

  constructor(private readonly backend: RoomBackend, private readonly env: BrowserEnv, private readonly tokens: TokenSource) {}

  async create(myId: string, record: LastTilePlayerRecord): Promise<string | null> {
    await this.sweep();
    for (let attempt = 0; attempt < LastTileRoomDirectory.CREATE_ATTEMPTS; attempt++) {
      const code = this.tokens.digits(LastTileRules.ROOM_CODE_LENGTH);
      const room = { status: "lobby", hostPlayerId: myId, createdAt: this.backend.clock.now(), players: { [myId]: record } };
      const result = await this.backend.ref(LastTileRules.ROOM_ROOT + "/" + code).transaction((current) => (current !== null ? undefined : room));
      if (result.committed) return code;
    }
    return null;
  }

  async join(code: string, myId: string, makeRecord: (existing: Map<string, LastTilePlayerRecord>) => LastTilePlayerRecord): Promise<LastTileJoinOutcome> {
    const room = this.backend.ref(LastTileRules.ROOM_ROOT + "/" + code);
    const [playersSnapshot, statusSnapshot] = await Promise.all([room.child("players").once("value"), room.child("status").once("value")]);
    const players = playersSnapshot.val<Record<string, LastTilePlayerRecord>>();
    if (!players || !Object.keys(players).some((id) => !players[id].isAI)) return { ok: false, message: "그런 방이 없어요. 코드를 확인해 주세요." };
    if (statusSnapshot.val<string>() !== "lobby") return { ok: false, message: "이미 게임이 진행 중이에요. 끝난 뒤 다시 들어와 주세요." };
    if (Object.keys(players).length >= LastTileRules.MAX_PLAYERS) return { ok: false, message: "방이 가득 찼어요. (최대 " + LastTileRules.MAX_PLAYERS + "명)" };
    try {
      await room.child("players/" + myId).set(makeRecord(new Map(Object.keys(players).map((id) => [id, players[id]] as [string, LastTilePlayerRecord]))));
    } catch (error) {
      return { ok: false, message: "입장하지 못했어요." };
    }
    return { ok: true, message: "" };
  }

  private async sweep(): Promise<void> {
    try {
      const base = this.backend.databaseUrl();
      if (!base) return;
      const listing = await this.env.readJson(base + "/" + LastTileRules.ROOM_ROOT + ".json?shallow=true");
      const codes = Object.keys((listing as Record<string, unknown> | null) || {});
      const now = this.backend.clock.now();
      const verdicts = await Promise.all(codes.map((code) => this.isStale(code, now)));
      const updates: Record<string, null> = {};
      codes.forEach((code, index) => { if (verdicts[index]) updates[code] = null; });
      if (Object.keys(updates).length) await this.backend.ref(LastTileRules.ROOM_ROOT).update(updates);
    } catch (error) {
      return;
    }
  }

  private async isStale(code: string, now: number): Promise<boolean> {
    const room = this.backend.ref(LastTileRules.ROOM_ROOT + "/" + code);
    const [created, , players] = await Promise.all(["createdAt", "status", "players"].map((key) => room.child(key).once("value")));
    const age = now - (created.val<number>() || 0);
    const records = players.val<Record<string, LastTilePlayerRecord>>() || {};
    const hasHuman = Object.keys(records).some((id) => records[id] && !records[id].isAI);
    return (!hasHuman && age > LastTileRules.STALE_EMPTY_ROOM_MS) || age > LastTileRules.STALE_OLD_ROOM_MS;
  }
}

class RoomMatchChannel implements MatchChannel {
  constructor(private readonly session: LastTileRoomSession) {}

  publishStates(states: Record<string, string>): void {
    this.session.writeStates(states);
  }

  publishPush(event: PushEvent): void {
    this.session.writePush(event);
  }

  publishTileStep(floor: number, index: number, t: number): void {
    this.session.reportTileStep(floor, index, t);
  }

  publishOut(fighterId: string, t: number): void {
    this.session.writeOut(fighterId, { t });
  }
}
