interface RkPlayerRecord {
  nick: string;
  isBot: boolean;
  joinedAt: number;
  slot: number;
  look: CharacterLook;
  spectator?: boolean;
}

interface RkRoomRules {
  root: string;
  seatCount: number;
  spectatorSlot: number;
}

interface RkJoinOutcome { ok: boolean; message: string }

class RkDom {
  static byId<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
  }

  static show(element: HTMLElement, visible: boolean): void {
    element.hidden = !visible;
  }

  static setText(element: HTMLElement, text: string): void {
    if (element.textContent !== text) element.textContent = text;
  }

  static escape(text: string): string {
    const table: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return String(text).replace(/[&<>"]/g, (character) => table[character]);
  }
}

class RkBackend {
  readonly database: FirebaseDatabase | null = null;
  private serverOffset = 0;

  constructor() {
    const config = window.PORTAL_CONFIG;
    try {
      if (window.firebase && config && config.isReady()) {
        window.firebase.initializeApp({ apiKey: config.API_KEY, authDomain: config.AUTH_DOMAIN, databaseURL: config.DB_URL.replace(/\/+$/, "") });
        this.database = window.firebase.database();
      }
    } catch (error) {
      this.database = null;
    }
    if (this.database) {
      this.database.ref(".info/serverTimeOffset").on("value", (snapshot) => {
        this.serverOffset = snapshot.val<number>() || 0;
      });
    }
  }

  now(): number {
    return Date.now() + this.serverOffset;
  }

  databaseUrl(): string {
    return window.PORTAL_CONFIG ? window.PORTAL_CONFIG.DB_URL.replace(/\/+$/, "") : "";
  }
}

class RkLabelFactory {
  constructor(private readonly libs: ThreeLibs) {}

  create(text: string, color: string): Three<"Sprite"> {
    const THREE = this.libs.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.font = '800 34px "Nanum Gothic", "Malgun Gothic", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = 8;
    context.strokeStyle = "rgba(10,12,20,.85)";
    context.strokeText(text, 128, 34, 232);
    context.fillStyle = color;
    context.fillText(text, 128, 34, 232);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(2.6, 0.65, 1);
    return sprite;
  }
}

class RkSeatPlan {
  constructor(private readonly rules: RkRoomRules) {}

  humanSeats(players: ReadonlyMap<string, RkPlayerRecord>): Array<string | null> {
    const seats: Array<string | null> = [];
    for (let slot = 0; slot < this.rules.seatCount; slot++) seats.push(null);
    players.forEach((record, id) => {
      if (!record.isBot && !record.spectator && record.slot >= 0 && record.slot < this.rules.seatCount) seats[record.slot] = id;
    });
    return seats;
  }

  spectators(players: ReadonlyMap<string, RkPlayerRecord>): string[] {
    const ids: string[] = [];
    players.forEach((record, id) => { if (record.spectator) ids.push(id); });
    return ids;
  }

  freeSeat(players: ReadonlyMap<string, RkPlayerRecord>): number {
    return this.humanSeats(players).indexOf(null);
  }

  swapUpdates(players: ReadonlyMap<string, RkPlayerRecord>, first: number, second: number): Record<string, number> {
    const seats = this.humanSeats(players);
    const updates: Record<string, number> = {};
    if (seats[first]) updates["players/" + seats[first] + "/slot"] = second;
    if (seats[second]) updates["players/" + seats[second] + "/slot"] = first;
    return updates;
  }

  matchSeats(match: { seats: Record<string, string> } | null): Array<string | null> {
    const seats: Array<string | null> = [];
    for (let slot = 0; slot < this.rules.seatCount; slot++) seats.push(match && match.seats ? match.seats["s" + slot] || null : null);
    return seats;
  }
}

class RkSession<P extends RkPlayerRecord> {
  readonly players = new Map<string, P>();
  readonly values = new Map<string, unknown>();
  hostId: string | null = null;
  hostLoaded = false;
  status = "lobby";
  onChange: (kind: string) => void = () => undefined;
  onRemoteState: (id: string, raw: string) => void = () => undefined;
  onPress: (id: string, record: unknown) => void = () => undefined;
  onPlayerRemoved: (id: string) => void = () => undefined;
  onClosed: (message: string) => void = () => undefined;
  readonly ref: FirebaseRef;
  private subscriptions: Array<{ ref: FirebaseRef; event: FirebaseEvent; listener: (snapshot: FirebaseSnapshot) => void }> = [];
  private leaving = false;

  constructor(
    backend: RkBackend,
    readonly rules: RkRoomRules,
    readonly code: string,
    readonly myId: string,
    private readonly hosting: boolean,
    private readonly valueNames: readonly string[]
  ) {
    this.ref = (backend.database as FirebaseDatabase).ref(rules.root + "/" + code);
  }

  value<T>(name: string): T | null {
    const value = this.values.get(name);
    return value === undefined ? null : (value as T);
  }

  isHost(): boolean {
    return this.hostId === this.myId;
  }

  me(): P | null {
    return this.players.get(this.myId) || null;
  }

  isSpectator(): boolean {
    const record = this.me();
    return !!record && !!record.spectator;
  }

  connect(): void {
    this.armDisconnect();
    const playersRef = this.ref.child("players");
    this.subscribe(playersRef, "child_added", (snapshot) => this.setPlayer(snapshot));
    this.subscribe(playersRef, "child_changed", (snapshot) => this.setPlayer(snapshot));
    this.subscribe(playersRef, "child_removed", (snapshot) => this.removePlayer(snapshot));
    this.watchValue("hostPlayerId", (value) => { this.hostId = (value as string) || null; this.hostLoaded = true; this.onChange("host"); });
    this.watchValue("status", (value) => {
      if (value === null) {
        if (!this.leaving) this.onClosed("방이 종료되었어요.");
        return;
      }
      this.status = value as string;
      this.onChange("status");
    });
    this.valueNames.forEach((name) => {
      this.watchValue(name, (value) => {
        this.values.set(name, value);
        this.onChange(name);
      });
    });
    const stateRef = this.ref.child("st");
    const onState = (snapshot: FirebaseSnapshot) => {
      const raw = snapshot.val();
      if (typeof raw === "string" && snapshot.key !== this.myId) this.onRemoteState(snapshot.key, raw);
    };
    this.subscribe(stateRef, "child_added", onState);
    this.subscribe(stateRef, "child_changed", onState);
    const pressRef = this.ref.child("in");
    const onPressSnapshot = (snapshot: FirebaseSnapshot) => {
      const record = snapshot.val();
      if (record && snapshot.key !== this.myId) this.onPress(snapshot.key, record);
    };
    this.subscribe(pressRef, "child_added", onPressSnapshot);
    this.subscribe(pressRef, "child_changed", onPressSnapshot);
  }

  pushProfile(record: Pick<RkPlayerRecord, "nick" | "look">): void {
    if (this.players.has(this.myId)) this.ref.child("players/" + this.myId).update({ nick: record.nick, look: record.look });
  }

  writeState(raw: string, id: string = this.myId): void {
    this.ref.child("st/" + id).set(raw);
  }

  writePress(record: unknown): void {
    this.ref.child("in/" + this.myId).set(record);
  }

  writeValue(name: string, value: unknown): void {
    this.ref.child(name).set(value);
  }

  leave(): void {
    this.leaving = true;
    this.unsubscribeAll();
    this.cancelDisconnect();
    if (this.hosting) {
      this.ref.remove().catch(() => undefined);
      return;
    }
    this.removeMine();
  }

  silentClose(): void {
    this.leaving = true;
    this.unsubscribeAll();
    this.cancelDisconnect();
  }

  removeMineOnUnload(): void {
    if (this.hosting) {
      try { this.ref.remove(); } catch (error) { return; }
    } else {
      this.removeMine();
    }
  }

  private removeMine(): void {
    try {
      this.ref.child("players/" + this.myId).remove();
      this.ref.child("st/" + this.myId).remove();
      this.ref.child("in/" + this.myId).remove();
    } catch (error) {
      return;
    }
  }

  private cancelDisconnect(): void {
    try {
      this.ref.child("players/" + this.myId).onDisconnect().cancel();
      this.ref.child("st/" + this.myId).onDisconnect().cancel();
      this.ref.child("in/" + this.myId).onDisconnect().cancel();
      if (this.hosting) this.ref.onDisconnect().cancel();
    } catch (error) {
      return;
    }
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
    this.ref.child("in/" + this.myId).onDisconnect().remove();
    if (this.hosting) this.ref.onDisconnect().remove();
  }

  private setPlayer(snapshot: FirebaseSnapshot): void {
    const record = snapshot.val<P>();
    if (!record) return;
    record.look = CharacterLooks.clean(record.look);
    this.players.set(snapshot.key, record);
    this.onChange("players");
  }

  private removePlayer(snapshot: FirebaseSnapshot): void {
    this.players.delete(snapshot.key);
    if (snapshot.key === this.myId && !this.leaving) {
      this.onClosed("연결이 끊겨 방에서 나왔어요.");
      return;
    }
    this.onPlayerRemoved(snapshot.key);
    this.onChange("players");
  }
}

class RkDirectory<P extends RkPlayerRecord> {
  private static readonly STALE_EMPTY_MS = 60000;
  private static readonly STALE_OLD_MS = 6 * 3600000;
  private readonly seats: RkSeatPlan;

  constructor(private readonly backend: RkBackend, private readonly rules: RkRoomRules) {
    this.seats = new RkSeatPlan(rules);
  }

  async create(myId: string, record: P): Promise<string | null> {
    await this.sweep();
    const database = this.backend.database as FirebaseDatabase;
    for (let attempt = 0; attempt < 9; attempt++) {
      const code = String(10000 + Math.floor(Math.random() * 90000));
      const room = { status: "lobby", hostPlayerId: myId, createdAt: this.backend.now(), players: { [myId]: record } };
      const result = await database.ref(this.rules.root + "/" + code).transaction((current) => (current !== null ? undefined : room));
      if (result.committed) return code;
    }
    return null;
  }

  async join(code: string, myId: string, record: P, asSpectator: boolean): Promise<RkJoinOutcome> {
    const room = (this.backend.database as FirebaseDatabase).ref(this.rules.root + "/" + code);
    const [playersSnapshot, statusSnapshot] = await Promise.all([room.child("players").once("value"), room.child("status").once("value")]);
    const players = playersSnapshot.val<Record<string, P>>();
    if (!players || !Object.keys(players).some((id) => !players[id].isBot)) return { ok: false, message: "그런 방이 없어요. 코드를 확인해 주세요." };
    const map = new Map<string, P>(Object.keys(players).map((id) => [id, players[id]] as [string, P]));
    const seat = this.seats.freeSeat(map);
    const lobby = statusSnapshot.val<string>() === "lobby";
    const spectate = asSpectator || !lobby || seat < 0;
    if (spectate) {
      if (this.seats.spectators(map).length > 0) return { ok: false, message: "관전 자리가 이미 찼어요. 다음 판에 들어와 주세요." };
      await room.child("players/" + myId).set(Object.assign({}, record, { slot: this.rules.spectatorSlot, spectator: true }));
      const reason = asSpectator ? "" : lobby ? "선수 자리가 가득 차서 관전으로 들어왔어요." : "경기 중이라 관전으로 들어왔어요.";
      return { ok: true, message: reason };
    }
    await room.child("players/" + myId).set(Object.assign({}, record, { slot: seat, spectator: false }));
    return { ok: true, message: "" };
  }

  private async sweep(): Promise<void> {
    try {
      const base = this.backend.databaseUrl();
      const response = await fetch(base + "/" + this.rules.root + ".json?shallow=true");
      const codes = response.ok ? Object.keys((await response.json()) || {}) : [];
      const now = this.backend.now();
      const database = this.backend.database as FirebaseDatabase;
      const updates: Record<string, null> = {};
      await Promise.all(codes.map(async (code) => {
        const room = database.ref(this.rules.root + "/" + code);
        const [created, players] = await Promise.all([room.child("createdAt").once("value"), room.child("players").once("value")]);
        const age = now - (created.val<number>() || 0);
        const map = players.val<Record<string, P>>() || {};
        const hasHuman = Object.keys(map).some((id) => !map[id].isBot);
        if ((!hasHuman && age > RkDirectory.STALE_EMPTY_MS) || age > RkDirectory.STALE_OLD_MS) updates[code] = null;
      }));
      if (Object.keys(updates).length) await database.ref(this.rules.root).update(updates);
    } catch (error) {
      return;
    }
  }
}
