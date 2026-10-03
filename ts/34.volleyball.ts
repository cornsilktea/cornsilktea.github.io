type VbScreenName = "start" | "lobby" | "game" | "end";
type VbRoomStatus = "lobby" | "play" | "end";
type VbChange = "players" | "host" | "status" | "match" | "ball" | "rally" | "end";

interface VbPlayerRecord {
  nick: string;
  isBot: boolean;
  joinedAt: number;
  slot: number;
  look: CharacterLook;
  spectator?: boolean;
}

interface VbMatchRecord { id: number; startAt: number; seats: Record<string, string> }
interface VbEndRecord { winner: number; sa: number; sb: number; at: number }
interface VbPressRecord { n: number; t: number; ax: number; az: number; j: number }
interface VbRemoteState { x: number; z: number; yaw: number; moving: boolean; ix: number; iz: number; ax: number; az: number; js: number }
interface VbJoinOutcome { ok: boolean; message: string }
interface VbAxis { x: number; z: number }

class VbDom {
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

class VbStateCodec {
  static encode(controller: VbPlayerController): string {
    const round2 = (value: number) => Math.round(value * 100) / 100;
    const round1 = (value: number) => Math.round(value * 10) / 10;
    return [round2(controller.x), round2(controller.z), round2(controller.yaw), controller.moving ? 1 : 0, round1(controller.ix), round1(controller.iz), round1(controller.aimX), round1(controller.aimZ), controller.jumpStartMs > 0 ? Math.round(controller.jumpStartMs) : 0].join(",");
  }

  static decode(raw: unknown): VbRemoteState | null {
    if (typeof raw !== "string") return null;
    const parts = raw.split(",").map(Number);
    if (parts.length < 9 || parts.some((part) => isNaN(part))) return null;
    return { x: parts[0], z: parts[1], yaw: parts[2], moving: parts[3] === 1, ix: parts[4], iz: parts[5], ax: parts[6], az: parts[7], js: parts[8] };
  }
}

class VbBackend {
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

class VbSeatPlan {
  static humanSeats(players: ReadonlyMap<string, VbPlayerRecord>): Array<string | null> {
    const seats: Array<string | null> = [null, null, null, null];
    players.forEach((record, id) => {
      if (!record.isBot && !record.spectator && record.slot >= 0 && record.slot < VbConfig.SEAT_COUNT) seats[record.slot] = id;
    });
    return seats;
  }

  static spectators(players: ReadonlyMap<string, VbPlayerRecord>): string[] {
    const ids: string[] = [];
    players.forEach((record, id) => { if (record.spectator) ids.push(id); });
    return ids;
  }

  static freeSeat(players: ReadonlyMap<string, VbPlayerRecord>): number {
    return VbSeatPlan.humanSeats(players).indexOf(null);
  }

  static swapUpdates(players: ReadonlyMap<string, VbPlayerRecord>, first: number, second: number): Record<string, number> {
    const seats = VbSeatPlan.humanSeats(players);
    const updates: Record<string, number> = {};
    if (seats[first]) updates["players/" + seats[first] + "/slot"] = second;
    if (seats[second]) updates["players/" + seats[second] + "/slot"] = first;
    return updates;
  }

  static matchSeats(match: VbMatchRecord | null): Array<string | null> {
    const seats: Array<string | null> = [null, null, null, null];
    if (!match || !match.seats) return seats;
    for (let slot = 0; slot < VbConfig.SEAT_COUNT; slot++) seats[slot] = match.seats["s" + slot] || null;
    return seats;
  }
}

class VbBotLooks {
  static create(team: number): CharacterLook {
    const look = CharacterLooks.random();
    look.p.top = VbConfig.TEAM_TOP_COLOR_INDEX[team] + 1;
    return look;
  }
}

class VbRoomSession {
  readonly players = new Map<string, VbPlayerRecord>();
  hostId: string | null = null;
  hostLoaded = false;
  status: VbRoomStatus = "lobby";
  match: VbMatchRecord | null = null;
  ball: VbBallRecord | null = null;
  rally: VbRallyRecord | null = null;
  end: VbEndRecord | null = null;
  onChange: (kind: VbChange) => void = () => undefined;
  onRemoteState: (id: string, state: VbRemoteState) => void = () => undefined;
  onPress: (id: string, record: VbPressRecord) => void = () => undefined;
  onPlayerRemoved: (id: string) => void = () => undefined;
  onClosed: (message: string) => void = () => undefined;
  readonly ref: FirebaseRef;
  private subscriptions: Array<{ ref: FirebaseRef; event: FirebaseEvent; listener: (snapshot: FirebaseSnapshot) => void }> = [];
  private leaving = false;

  constructor(private readonly backend: VbBackend, readonly code: string, readonly myId: string, private readonly hosting: boolean) {
    this.ref = (backend.database as FirebaseDatabase).ref(VbConfig.ROOT + "/" + code);
  }

  isHost(): boolean {
    return this.hostId === this.myId;
  }

  me(): VbPlayerRecord | null {
    return this.players.get(this.myId) || null;
  }

  isSpectator(): boolean {
    const record = this.me();
    return !!record && !!record.spectator;
  }

  order(): string[] {
    return Array.from(this.players.keys()).sort((a, b) => {
      const difference = (this.players.get(a) as VbPlayerRecord).joinedAt - (this.players.get(b) as VbPlayerRecord).joinedAt;
      return difference || (a < b ? -1 : 1);
    });
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
      this.status = value as VbRoomStatus;
      this.onChange("status");
    });
    this.watchValue("match", (value) => { this.match = value as VbMatchRecord | null; this.onChange("match"); });
    this.watchValue("ball", (value) => { this.ball = value as VbBallRecord | null; this.onChange("ball"); });
    this.watchValue("rally", (value) => { this.rally = value as VbRallyRecord | null; this.onChange("rally"); });
    this.watchValue("end", (value) => { this.end = value as VbEndRecord | null; this.onChange("end"); });
    const stateRef = this.ref.child("st");
    const onState = (snapshot: FirebaseSnapshot) => {
      const state = VbStateCodec.decode(snapshot.val());
      if (state && snapshot.key !== this.myId) this.onRemoteState(snapshot.key, state);
    };
    this.subscribe(stateRef, "child_added", onState);
    this.subscribe(stateRef, "child_changed", onState);
    const pressRef = this.ref.child("in");
    const onPressSnapshot = (snapshot: FirebaseSnapshot) => {
      const record = snapshot.val<VbPressRecord>();
      if (record && snapshot.key !== this.myId) this.onPress(snapshot.key, record);
    };
    this.subscribe(pressRef, "child_added", onPressSnapshot);
    this.subscribe(pressRef, "child_changed", onPressSnapshot);
  }

  pushProfile(record: Pick<VbPlayerRecord, "nick" | "look">): void {
    if (this.players.has(this.myId)) this.ref.child("players/" + this.myId).update({ nick: record.nick, look: record.look });
  }

  writeState(raw: string, id: string = this.myId): void {
    this.ref.child("st/" + id).set(raw);
  }

  writePress(record: VbPressRecord): void {
    this.ref.child("in/" + this.myId).set(record);
  }

  writeBall(record: VbBallRecord): void {
    this.ref.child("ball").set(record);
  }

  writeRally(record: VbRallyRecord): void {
    this.ref.child("rally").set(record);
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
    const record = snapshot.val<VbPlayerRecord>();
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

class VbRoomDirectory {
  private static readonly STALE_EMPTY_MS = 60000;
  private static readonly STALE_OLD_MS = 6 * 3600000;

  constructor(private readonly backend: VbBackend) {}

  async create(myId: string, record: VbPlayerRecord): Promise<string | null> {
    await this.sweep();
    const database = this.backend.database as FirebaseDatabase;
    for (let attempt = 0; attempt < 9; attempt++) {
      const code = String(10000 + Math.floor(Math.random() * 90000));
      const room = { status: "lobby", hostPlayerId: myId, createdAt: this.backend.now(), players: { [myId]: record } };
      const result = await database.ref(VbConfig.ROOT + "/" + code).transaction((current) => (current !== null ? undefined : room));
      if (result.committed) return code;
    }
    return null;
  }

  async join(code: string, myId: string, record: VbPlayerRecord, asSpectator: boolean): Promise<VbJoinOutcome> {
    const room = (this.backend.database as FirebaseDatabase).ref(VbConfig.ROOT + "/" + code);
    const [playersSnapshot, statusSnapshot] = await Promise.all([room.child("players").once("value"), room.child("status").once("value")]);
    const players = playersSnapshot.val<Record<string, VbPlayerRecord>>();
    if (!players || !Object.keys(players).some((id) => !players[id].isBot)) return { ok: false, message: "그런 방이 없어요. 코드를 확인해 주세요." };
    const map = new Map<string, VbPlayerRecord>(Object.keys(players).map((id) => [id, players[id]] as [string, VbPlayerRecord]));
    const seat = VbSeatPlan.freeSeat(map);
    const lobby = statusSnapshot.val<string>() === "lobby";
    const spectate = asSpectator || !lobby || seat < 0;
    if (spectate) {
      if (VbSeatPlan.spectators(map).length > 0) return { ok: false, message: "관전 자리가 이미 찼어요. 다음 판에 들어와 주세요." };
      await room.child("players/" + myId).set(Object.assign({}, record, { slot: VbConfig.SPECTATOR_SLOT, spectator: true }));
      const reason = asSpectator ? "" : lobby ? "선수 자리가 가득 차서 관전으로 들어왔어요." : "경기 중이라 관전으로 들어왔어요.";
      return { ok: true, message: reason };
    }
    await room.child("players/" + myId).set(Object.assign({}, record, { slot: seat, spectator: false }));
    return { ok: true, message: "" };
  }

  private async sweep(): Promise<void> {
    try {
      const base = this.backend.databaseUrl();
      const response = await fetch(base + "/" + VbConfig.ROOT + ".json?shallow=true");
      const codes = response.ok ? Object.keys((await response.json()) || {}) : [];
      const now = this.backend.now();
      const database = this.backend.database as FirebaseDatabase;
      const updates: Record<string, null> = {};
      await Promise.all(codes.map(async (code) => {
        const room = database.ref(VbConfig.ROOT + "/" + code);
        const [created, players] = await Promise.all([room.child("createdAt").once("value"), room.child("players").once("value")]);
        const age = now - (created.val<number>() || 0);
        const map = players.val<Record<string, VbPlayerRecord>>() || {};
        const hasHuman = Object.keys(map).some((id) => !map[id].isBot);
        if ((!hasHuman && age > VbRoomDirectory.STALE_EMPTY_MS) || age > VbRoomDirectory.STALE_OLD_MS) updates[code] = null;
      }));
      if (Object.keys(updates).length) await database.ref(VbConfig.ROOT).update(updates);
    } catch (error) {
      return;
    }
  }
}

class VbLabelFactory {
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

class VbCourtTextures {
  constructor(private readonly libs: ThreeLibs) {}

  floor(): Three<"CanvasTexture"> {
    const width = 1024, height = 1680;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    const pixelsPerMeterX = width / VbCourtView.FLOOR_WIDTH;
    const pixelsPerMeterZ = height / VbCourtView.FLOOR_LENGTH;
    context.fillStyle = "#B9854F";
    context.fillRect(0, 0, width, height);
    const plankHeight = pixelsPerMeterZ * 0.28;
    for (let y = 0, index = 0; y < height; y += plankHeight, index++) {
      context.fillStyle = index % 2 ? "rgba(255,230,190,.08)" : "rgba(60,30,10,.07)";
      context.fillRect(0, y, width, plankHeight);
      context.fillStyle = "rgba(60,32,12,.35)";
      context.fillRect(0, y, width, 2);
    }
    const courtLeft = (VbCourtView.FLOOR_WIDTH / 2 - VbConfig.HALF_W) * pixelsPerMeterX;
    const courtTop = (VbCourtView.FLOOR_LENGTH / 2 - VbConfig.HALF_L) * pixelsPerMeterZ;
    const courtWidth = VbConfig.HALF_W * 2 * pixelsPerMeterX;
    const courtHeight = VbConfig.HALF_L * 2 * pixelsPerMeterZ;
    context.fillStyle = "rgba(48,112,170,.55)";
    context.fillRect(courtLeft, courtTop, courtWidth, courtHeight);
    context.strokeStyle = "#FFFFFF";
    context.lineWidth = 6;
    context.strokeRect(courtLeft, courtTop, courtWidth, courtHeight);
    const centerY = courtTop + courtHeight / 2;
    context.beginPath();
    context.moveTo(courtLeft, centerY);
    context.lineTo(courtLeft + courtWidth, centerY);
    context.stroke();
    context.lineWidth = 3;
    [-3, 3].forEach((offset) => {
      context.beginPath();
      context.moveTo(courtLeft, centerY + offset * pixelsPerMeterZ);
      context.lineTo(courtLeft + courtWidth, centerY + offset * pixelsPerMeterZ);
      context.stroke();
    });
    const texture = new this.libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = this.libs.THREE.SRGBColorSpace;
    return texture;
  }

  net(): Three<"CanvasTexture"> {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.strokeStyle = "rgba(255,255,255,.85)";
    context.lineWidth = 2;
    for (let x = 0; x <= 512; x += 16) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 64);
      context.stroke();
    }
    for (let y = 0; y <= 64; y += 16) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(512, y);
      context.stroke();
    }
    const texture = new this.libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = this.libs.THREE.SRGBColorSpace;
    return texture;
  }

  ball(): Three<"CanvasTexture"> {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, 256, 128);
    context.fillStyle = "#3E8EF0";
    context.fillRect(0, 26, 256, 22);
    context.fillRect(0, 80, 256, 22);
    context.fillStyle = "#F2C93B";
    context.fillRect(0, 52, 256, 24);
    context.fillStyle = "rgba(0,0,0,.18)";
    for (let x = 0; x < 256; x += 64) context.fillRect(x, 0, 3, 128);
    const texture = new this.libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = this.libs.THREE.SRGBColorSpace;
    return texture;
  }
}

class VbCourtView {
  static readonly FLOOR_WIDTH = 14;
  static readonly FLOOR_LENGTH = 23;
  private static readonly DECOR: ReadonlyArray<{ file: string; x: number; z: number; height: number; turn: number }> = [
    { file: "banner_blue", x: -3.2, z: -11.6, height: 2.6, turn: 0 },
    { file: "banner_green", x: 3.2, z: -11.6, height: 2.6, turn: 0 },
    { file: "banner_blue", x: -3.2, z: 11.6, height: 2.6, turn: Math.PI },
    { file: "banner_green", x: 3.2, z: 11.6, height: 2.6, turn: Math.PI },
    { file: "torch_lit", x: -6.8, z: -6, height: 1.1, turn: 0 },
    { file: "torch_lit", x: 6.8, z: -6, height: 1.1, turn: 0 },
    { file: "torch_lit", x: -6.8, z: 6, height: 1.1, turn: 0 },
    { file: "torch_lit", x: 6.8, z: 6, height: 1.1, turn: 0 }
  ];

  readonly group: Three<"Group">;

  constructor(private readonly libs: ThreeLibs, textures: VbCourtTextures) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshLambertMaterial({ color: "#2B2638" }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(VbCourtView.FLOOR_WIDTH, VbCourtView.FLOOR_LENGTH), new THREE.MeshBasicMaterial({ map: textures.floor() }));
    floor.rotation.x = -Math.PI / 2;
    this.group.add(ground, floor);
    this.buildWalls();
    this.buildNet(textures);
    this.buildRefereeStand();
  }

  async loadDecor(): Promise<void> {
    const THREE = this.libs.THREE;
    const loader = new this.libs.GLTFLoader();
    await Promise.all(VbCourtView.DECOR.map((entry) =>
      loader.loadAsync("assets/kaykit/dungeon/" + entry.file + ".gltf").then((gltf) => {
        gltf.scene.traverse((node) => {
          const mesh = node as Three<"Mesh">;
          if (!mesh.isMesh || Array.isArray(mesh.material)) return;
          const source = mesh.material as Three<"MeshStandardMaterial">;
          mesh.material = new THREE.MeshLambertMaterial({ map: source.map, color: source.color });
        });
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const scale = entry.height / Math.max(size.y, 0.001);
        gltf.scene.scale.setScalar(scale);
        const holder = new THREE.Group();
        holder.add(gltf.scene);
        gltf.scene.position.set(-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);
        holder.position.set(entry.x, 0, entry.z);
        holder.rotation.y = entry.turn;
        this.group.add(holder);
      }).catch(() => undefined)
    ));
  }

  private buildWalls(): void {
    const THREE = this.libs.THREE;
    const material = new THREE.MeshLambertMaterial({ color: "#5E5870" });
    const addWall = (width: number, depth: number, x: number, z: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(width, 1, depth), material);
      wall.position.set(x, 0.5, z);
      this.group.add(wall);
    };
    const halfWidth = VbCourtView.FLOOR_WIDTH / 2, halfLength = VbCourtView.FLOOR_LENGTH / 2;
    addWall(VbCourtView.FLOOR_WIDTH + 0.8, 0.4, 0, -halfLength - 0.2);
    addWall(VbCourtView.FLOOR_WIDTH + 0.8, 0.4, 0, halfLength + 0.2);
    addWall(0.4, VbCourtView.FLOOR_LENGTH, -halfWidth - 0.2, 0);
    addWall(0.4, VbCourtView.FLOOR_LENGTH, halfWidth + 0.2, 0);
  }

  private buildNet(textures: VbCourtTextures): void {
    const THREE = this.libs.THREE;
    const poleMaterial = new THREE.MeshLambertMaterial({ color: "#D8D8DE" });
    [-1, 1].forEach((sign) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, VbConfig.NET_TOP + 0.35, 10), poleMaterial);
      pole.position.set(sign * (VbConfig.HALF_W + 0.2), (VbConfig.NET_TOP + 0.35) / 2, 0);
      this.group.add(pole);
    });
    const netWidth = VbConfig.HALF_W * 2 + 0.4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(netWidth, 1), new THREE.MeshBasicMaterial({ map: textures.net(), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }));
    mesh.position.set(0, VbConfig.NET_TOP - 0.06 - 0.5, 0);
    const band = new THREE.Mesh(new THREE.BoxGeometry(netWidth, 0.12, 0.05), new THREE.MeshLambertMaterial({ color: "#FFFFFF" }));
    band.position.set(0, VbConfig.NET_TOP - 0.06, 0);
    this.group.add(mesh, band);
  }

  private buildRefereeStand(): void {
    const THREE = this.libs.THREE;
    const wood = new THREE.MeshLambertMaterial({ color: "#8A6A44" });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 1.3), wood);
    seat.position.set(-VbConfig.HALF_W - 1.7, 2.3, 0);
    const legGeometry = new THREE.BoxGeometry(0.12, 2.3, 0.12);
    [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].forEach((offset) => {
      const leg = new THREE.Mesh(legGeometry, wood);
      leg.position.set(seat.position.x + offset[0], 1.15, offset[1]);
      this.group.add(leg);
    });
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 1.2), wood);
    back.position.set(seat.position.x - 0.6, 2.75, 0);
    this.group.add(seat, back);
  }
}

class VbBallView {
  readonly group: Three<"Group">;
  private readonly sphere: Three<"Mesh">;
  private readonly shadow: Three<"Mesh">;
  private spin = 0;

  constructor(libs: ThreeLibs, textures: VbCourtTextures) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(VbConfig.BALL_R, 20, 14), new THREE.MeshLambertMaterial({ map: textures.ball() }));
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.sphere, this.shadow);
  }

  place(x: number, y: number, z: number, speed: number, deltaSeconds: number): void {
    this.sphere.position.set(x, y, z);
    this.spin += speed * deltaSeconds * 0.9;
    this.sphere.rotation.set(this.spin, 0, this.spin * 0.4);
    const height = Math.max(0, y - VbConfig.BALL_R);
    const scale = 1 / (1 + height * 0.3);
    this.shadow.position.set(x, 0.03, z);
    this.shadow.scale.setScalar(scale);
    (this.shadow.material as Three<"MeshBasicMaterial">).opacity = 0.38 * scale;
  }
}

class VbMarkerView {
  readonly group: Three<"Group">;
  private readonly ringMaterial: Three<"MeshBasicMaterial">;
  private readonly fillMaterial: Three<"MeshBasicMaterial">;

  constructor(libs: ThreeLibs, parent: Three<"Object3D">, private readonly crosshair: boolean) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.ringMaterial = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.95, depthWrite: false });
    this.fillMaterial = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.28, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.98, 32), this.ringMaterial);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.78, 32), this.fillMaterial);
    ring.rotation.x = fill.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    fill.position.y = 0.045;
    this.group.add(ring, fill);
    if (crosshair) {
      [0, Math.PI / 2].forEach((angle) => {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.12), this.ringMaterial);
        bar.rotation.x = -Math.PI / 2;
        bar.rotation.z = angle;
        bar.position.y = 0.055;
        this.group.add(bar);
      });
    }
    this.group.visible = false;
    parent.add(this.group);
  }

  show(x: number, z: number, color: string, scale: number, opacity: number): void {
    this.group.visible = true;
    this.group.position.set(x, 0, z);
    this.group.scale.set(scale, 1, scale);
    this.ringMaterial.color.set(color);
    this.fillMaterial.color.set(color);
    this.ringMaterial.opacity = opacity;
    this.fillMaterial.opacity = opacity * 0.3;
  }

  hide(): void {
    this.group.visible = false;
  }
}

class VbPlayerView {
  private static readonly CLIP_IDLE = "Idle_A";
  private static readonly CLIP_RUN = "Running_A";
  private static readonly JUMP_HEIGHT = VbConfig.JUMP_HEIGHT;

  readonly group: Three<"Group">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private shownYaw = 0;
  private actionUntilMs = 0;
  private jumpStartMs = -1e9;
  private jumpHeight = 0;

  constructor(
    libs: ThreeLibs,
    private readonly factory: CharacterModelFactory,
    assets: CharacterAssets,
    labels: VbLabelFactory,
    private readonly parent: Three<"Object3D">,
    readonly slot: number,
    readonly record: VbPlayerRecord
  ) {
    const THREE = libs.THREE;
    const color = VbConfig.TEAM_COLORS[VbConfig.teamOfSlot(slot)];
    this.group = new THREE.Group();
    this.model = factory.build(CharacterLooks.clean(record.look));
    this.group.add(this.model);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.74, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    const label = labels.create(record.nick, color);
    label.position.y = 2.75;
    this.group.add(ring, label);
    parent.add(this.group);
    this.animator = new CharacterAnimator(libs, this.model, assets.clips);
    this.animator.play(VbPlayerView.CLIP_IDLE);
    this.shownYaw = VbCourtLayout.facingYaw(VbConfig.teamOfSlot(slot));
  }

  playAction(clip: string, nowMs: number, jump: boolean): void {
    this.animator.play(clip, { once: true });
    this.actionUntilMs = nowMs + 650;
    if (jump) {
      this.jumpStartMs = nowMs;
      this.jumpHeight = VbPlayerView.JUMP_HEIGHT;
    }
  }

  render(x: number, z: number, yaw: number, moving: boolean, deltaSeconds: number, nowMs: number): void {
    this.shownYaw += VbMath.angleDifference(yaw, this.shownYaw) * Math.min(1, deltaSeconds * 14);
    const jumpProgress = (nowMs - this.jumpStartMs) / VbConfig.JUMP_MS;
    const lift = jumpProgress >= 0 && jumpProgress <= 1 ? Math.sin(jumpProgress * Math.PI) * this.jumpHeight : 0;
    this.group.position.set(x, lift, z);
    this.group.rotation.y = this.shownYaw;
    if (nowMs >= this.actionUntilMs) this.animator.play(moving ? VbPlayerView.CLIP_RUN : VbPlayerView.CLIP_IDLE);
    this.animator.update(deltaSeconds);
  }

  dispose(): void {
    this.parent.remove(this.group);
    this.factory.disposeModel(this.model);
  }
}

class VbCameraRig {
  private static readonly REFEREE_HALF_FOV = 44;

  private readonly camera: Three<"PerspectiveCamera">;
  private focusX = 0;
  private focusZ = 0;
  private ready = false;

  constructor(libs: ThreeLibs) {
    this.camera = new libs.THREE.PerspectiveCamera(50, 1, 0.5, 200);
  }

  get perspective(): Three<"PerspectiveCamera"> {
    return this.camera;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    const refereeHalf = Math.atan(Math.tan((VbCameraRig.REFEREE_HALF_FOV * Math.PI) / 180) / aspect);
    this.camera.fov = Math.min(80, Math.max(48, (refereeHalf * 2 * 180) / Math.PI));
    this.camera.updateProjectionMatrix();
  }

  snap(): void {
    this.ready = false;
  }

  orbit(radius: number, height: number, angle: number): void {
    this.camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    this.camera.lookAt(0, 1.2, 0);
  }

  followPlayer(team: number, playerX: number, deltaSeconds: number): void {
    const side = VbConfig.sideOf(team);
    this.smooth(playerX, deltaSeconds);
    this.camera.position.set(this.focusX * 0.4, 10.2, side * 18);
    this.camera.lookAt(this.focusX * 0.2, 0.5, -side * 2);
  }

  watchFromReferee(ballZ: number, deltaSeconds: number): void {
    this.smooth(ballZ, deltaSeconds);
    this.camera.position.set(11.8, 5.9, this.focusZ * 0.08);
    this.camera.lookAt(0, 1.3, this.focusZ * 0.12);
  }

  private smooth(value: number, deltaSeconds: number): void {
    if (!this.ready) {
      this.focusX = this.focusZ = value;
      this.ready = true;
    }
    const ratio = Math.min(1, deltaSeconds * 4);
    this.focusX += (value - this.focusX) * ratio;
    this.focusZ += (value - this.focusZ) * ratio;
  }
}

class VbWorldView {
  readonly scene: Three<"Scene">;
  readonly rig: VbCameraRig;
  readonly matchGroup: Three<"Group">;
  playing = false;
  private readonly renderer: Three<"WebGLRenderer">;
  private pixelRatio: number;
  private readonly governor: QualityGovernorHandle | null;

  constructor(libs: ThreeLibs, canvas: HTMLCanvasElement, touchDevice: boolean) {
    const THREE = libs.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#1A1626");
    this.scene.add(new THREE.HemisphereLight(0xE6EEFF, 0x504058, 1.35));
    const sun = new THREE.DirectionalLight(0xFFF0D8, 1.3);
    sun.position.set(5, 14, 8);
    this.scene.add(sun);
    this.matchGroup = new THREE.Group();
    this.scene.add(this.matchGroup);
    this.rig = new VbCameraRig(libs);
    this.governor = window.QualityGovernor
      ? window.QualityGovernor({ steps: [() => this.lowerPixelRatio()], storageKey: "volleyball_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 })
      : null;
    if (this.governor) this.governor.restore();
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize(): void {
    const width = window.innerWidth, height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / height);
  }

  render(deltaSeconds: number): void {
    this.renderer.render(this.scene, this.rig.perspective);
    if (this.governor) this.governor.update(deltaSeconds);
  }

  private lowerPixelRatio(): boolean {
    if (this.pixelRatio <= 1) return false;
    this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
    return true;
  }
}

class VolleyballInput {
  private static readonly JOYSTICK_RADIUS = 55;
  private static readonly DEAD_ZONE = 0.18;

  onAct: () => void = () => undefined;
  enabled = true;
  private readonly held = new Set<string>();
  private joystickPointer: number | null = null;
  private joystickOriginX = 0;
  private joystickOriginY = 0;
  private joystickX = 0;
  private joystickZ = 0;

  constructor(private readonly zone: HTMLElement, private readonly base: HTMLElement, private readonly knob: HTMLElement) {
    this.bindKeyboard();
    this.bindJoystick();
    this.bindButton("btnAct");
  }

  axis(): VbAxis {
    if (!this.enabled) return { x: 0, z: 0 };
    let x = this.joystickX, z = this.joystickZ;
    if (this.held.has("KeyA") || this.held.has("ArrowLeft")) x -= 1;
    if (this.held.has("KeyD") || this.held.has("ArrowRight")) x += 1;
    if (this.held.has("KeyW") || this.held.has("ArrowUp")) z -= 1;
    if (this.held.has("KeyS") || this.held.has("ArrowDown")) z += 1;
    const length = Math.hypot(x, z);
    return length > 1 ? { x: x / length, z: z / length } : { x, z };
  }

  releaseAll(): void {
    this.held.clear();
    this.joystickPointer = null;
    this.joystickX = this.joystickZ = 0;
    this.base.hidden = true;
  }

  private bindKeyboard(): void {
    const movementKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
    window.addEventListener("keydown", (event) => {
      if ((event.target as HTMLElement).tagName === "INPUT" || !this.enabled) return;
      const code = this.codeOf(event);
      if (movementKeys.indexOf(code) >= 0) {
        this.held.add(code);
        event.preventDefault();
      } else if (!event.repeat && (code === "Space" || code === "KeyE")) {
        this.onAct();
        event.preventDefault();
      }
    });
    window.addEventListener("keyup", (event) => this.held.delete(this.codeOf(event)));
    window.addEventListener("blur", () => this.held.clear());
  }

  private codeOf(event: KeyboardEvent): string {
    return event.key.indexOf("Arrow") === 0 ? event.key : event.code;
  }

  private bindJoystick(): void {
    this.zone.addEventListener("pointerdown", (event) => {
      if (this.joystickPointer !== null) return;
      this.joystickPointer = event.pointerId;
      this.joystickOriginX = event.clientX;
      this.joystickOriginY = event.clientY;
      this.base.style.left = event.clientX + "px";
      this.base.style.top = event.clientY + "px";
      this.base.hidden = false;
      this.knob.style.transform = "translate(0px,0px)";
      this.zone.setPointerCapture(event.pointerId);
    });
    this.zone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.joystickPointer) return;
      const deltaX = event.clientX - this.joystickOriginX, deltaY = event.clientY - this.joystickOriginY;
      const length = Math.hypot(deltaX, deltaY) || 1;
      const reach = Math.min(length, VolleyballInput.JOYSTICK_RADIUS);
      this.knob.style.transform = "translate(" + (deltaX / length) * reach + "px," + (deltaY / length) * reach + "px)";
      const strength = Math.min(1, length / VolleyballInput.JOYSTICK_RADIUS);
      if (strength < VolleyballInput.DEAD_ZONE) this.joystickX = this.joystickZ = 0;
      else {
        this.joystickX = (deltaX / length) * strength;
        this.joystickZ = (deltaY / length) * strength;
      }
    });
    const end = (event: PointerEvent) => {
      if (event.pointerId !== this.joystickPointer) return;
      this.joystickPointer = null;
      this.joystickX = this.joystickZ = 0;
      this.base.hidden = true;
    };
    this.zone.addEventListener("pointerup", end);
    this.zone.addEventListener("pointercancel", end);
  }

  private bindButton(id: string): void {
    const button = VbDom.byId(id);
    button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (this.enabled) this.onAct();
    });
  }
}

class VbLocalController extends VbPlayerController {
  private static readonly AIM_SPEED = 6;

  constructor(slot: number, private readonly input: VolleyballInput) {
    super(slot);
    this.resetAim();
  }

  resetAim(): void {
    const side = VbConfig.sideOf(this.team);
    this.aimX = 0;
    this.aimZ = -side * 4.5;
  }

  poll(engine: VbRallyEngine | null, dtSec: number, nowMs: number): void {
    const axis = this.input.axis();
    const side = VbConfig.sideOf(this.team);
    this.ix = axis.x * side;
    this.iz = axis.z * side;
    if (this.locked) {
      this.aimX = VbMath.clamp(this.aimX + this.ix * VbLocalController.AIM_SPEED * dtSec, -4.2, 4.2);
      this.aimZ = VbMath.clamp(this.aimZ + this.iz * VbLocalController.AIM_SPEED * dtSec, side > 0 ? -8.6 : 0.8, side > 0 ? -0.8 : 8.6);
    }
    this.step(dtSec, nowMs);
  }
}

class VbHud {
  private readonly teamScore = [VbDom.byId("hudScore0"), VbDom.byId("hudScore1")];
  private readonly teamBox = [VbDom.byId("hudTeam0"), VbDom.byId("hudTeam1")];
  private readonly role = VbDom.byId("hudRole");
  private readonly banner = VbDom.byId("banner");
  private readonly bannerBox = VbDom.byId("bannerBox");
  private readonly hint = VbDom.byId("hudHint");
  private readonly action = VbDom.byId<HTMLButtonElement>("btnAct");
  private readonly actionLabel = this.action.querySelector("span") as HTMLElement;

  update(model: VbHudModel): void {
    VbDom.setText(this.teamScore[0], String(model.score[0]));
    VbDom.setText(this.teamScore[1], String(model.score[1]));
    this.teamBox.forEach((box, team) => box.classList.toggle("serving", model.serveTeam === team));
    this.teamBox.forEach((box, team) => box.classList.toggle("mine", model.myTeam === team));
    VbDom.show(this.role, model.roleText !== "");
    VbDom.setText(this.role, model.roleText);
    VbDom.show(this.banner, model.banner !== "");
    VbDom.setText(this.bannerBox, model.banner);
    VbDom.show(this.hint, model.hint !== "");
    VbDom.setText(this.hint, model.hint);
    VbDom.show(this.action, model.actionLabel !== "");
    VbDom.setText(this.actionLabel, model.actionLabel);
    this.action.classList.toggle("ready", model.actionReady);
  }
}

interface VbHudModel {
  score: number[];
  serveTeam: number;
  myTeam: number;
  roleText: string;
  banner: string;
  hint: string;
  actionLabel: string;
  actionReady: boolean;
}

interface VbSeatActor {
  id: string;
  seenJump: number;
  controller: VbPlayerController;
  view: VbPlayerView;
}

interface VbMatchServices {
  libs: ThreeLibs;
  assets: CharacterAssets;
  factory: CharacterModelFactory;
  labels: VbLabelFactory;
  world: VbWorldView;
  hud: VbHud;
  input: VolleyballInput;
  backend: VbBackend;
  court: VbCourtView;
  textures: VbCourtTextures;
}

class VbHostDirector {
  private static readonly MAX_TICK_SEC = 0.5;

  private started = false;
  private lastTickMs = 0;
  private readonly lastPressSeq = new Map<string, number>();

  constructor(private readonly engine: VbRallyEngine, private readonly onEvents: (events: VbEvent[]) => void) {}

  get hasStarted(): boolean {
    return this.started;
  }

  begin(nowMs: number): void {
    this.started = true;
    this.lastTickMs = nowMs;
    this.onEvents(this.engine.begin(nowMs));
  }

  tick(dtSec: number, nowMs: number): void {
    if (!this.started) return;
    const elapsed = Math.min(VbHostDirector.MAX_TICK_SEC, Math.max(0, (nowMs - this.lastTickMs) / 1000));
    this.lastTickMs = nowMs;
    this.engine.players.forEach((controller) => controller.poll(this.engine, elapsed, nowMs));
    this.onEvents(this.engine.update(elapsed, nowMs));
  }

  receivePress(controller: VbPlayerController, id: string, record: VbPressRecord): void {
    const last = this.lastPressSeq.get(id) || 0;
    if (record.n <= last) return;
    this.lastPressSeq.set(id, record.n);
    if (record.j) {
      controller.jumpStartMs = record.t;
      if (controller instanceof VbRemoteController) {
        controller.teleport(record.ax, record.az);
        controller.jumpStartMs = record.t;
      }
    } else controller.registerPress(record.t, record.ax, record.az);
  }
}

class VolleyballMatch {
  private static readonly STATE_KEEPALIVE_MS = 1000;
  private static readonly CLIPS: Record<string, string> = {
    toss: "Throw", serve: "Melee_1H_Attack_Chop", dig: "Melee_Block", set: "Ranged_Magic_Raise",
    over: "Throw", spike: "Melee_1H_Attack_Jump_Chop", quick: "Melee_1H_Attack_Chop", block: "Melee_Block"
  };
  private static readonly JUMP_KINDS: readonly string[] = ["serve", "spike"];
  private static readonly TOSS_COLORS: readonly string[] = ["#5DBB63", "#4C8DFF"];
  private static readonly INCOMING_COLOR = "#D97B4F";
  private static readonly AIM_COLOR = "#FFD23F";

  private readonly group: Three<"Group">;
  private readonly seats: Array<VbSeatActor | null> = [null, null, null, null];
  private readonly controllers: VbPlayerController[] = [];
  private readonly ballView: VbBallView;
  private readonly receiveMarker: VbMarkerView;
  private readonly aimMarker: VbMarkerView;
  private readonly local: VbLocalController | null = null;
  private readonly mySlot: number;
  private director: VbHostDirector | null = null;
  private engine: VbRallyEngine | null = null;
  private ball: VbBallRecord | null = null;
  private rally: VbRallyRecord | null = null;
  private seatsDirty = true;
  private lastSentMs = 0;
  private readonly botSent = new Map<string, { text: string; at: number }>();
  private localSent = { text: "", at: 0 };
  private lastRallyNo = 0;
  private pressCounter = 0;
  private ended = false;
  private totalFlight = 1;
  private totalFlightSeq = -1;

  constructor(private readonly services: VbMatchServices, private readonly session: VbRoomSession) {
    const THREE = services.libs.THREE;
    this.group = new THREE.Group();
    services.world.matchGroup.add(this.group);
    this.ballView = new VbBallView(services.libs, services.textures);
    this.group.add(this.ballView.group);
    this.receiveMarker = new VbMarkerView(services.libs, this.group, false);
    this.aimMarker = new VbMarkerView(services.libs, this.group, true);
    const seatIds = VbSeatPlan.matchSeats(session.match);
    this.mySlot = seatIds.indexOf(session.myId);
    if (this.mySlot >= 0) this.local = new VbLocalController(this.mySlot, services.input);
    services.world.playing = true;
    services.world.rig.snap();
    services.input.enabled = this.mySlot >= 0;
    this.ball = session.ball;
    this.rally = session.rally;
    this.syncSeats();
    if (session.isHost()) {
      this.engine = new VbRallyEngine(this.controllers, Math.random);
      this.director = new VbHostDirector(this.engine, (events) => this.applyEvents(events));
    }
  }

  applyChange(kind: VbChange): void {
    if (kind === "players" || kind === "match") this.seatsDirty = true;
    if (kind === "ball" && !this.isHost()) this.applyBall(this.session.ball);
    if (kind === "rally" && !this.isHost()) this.applyRally(this.session.rally);
  }

  receiveRemote(id: string, state: VbRemoteState): void {
    const seat = this.seats.find((actor) => !!actor && actor.id === id);
    if (seat && seat.controller instanceof VbRemoteController) seat.controller.receive(state.x, state.z, state.yaw, state.moving, state.ix, state.iz, state.ax, state.az, state.js);
  }

  receivePress(id: string, record: VbPressRecord): void {
    if (!this.director) return;
    const seat = this.seats.find((actor) => !!actor && actor.id === id);
    if (seat) this.director.receivePress(seat.controller, id, record);
  }

  playerRemoved(id: string): void {
    if (!this.isHost()) return;
    const slot = this.seats.findIndex((actor) => !!actor && actor.id === id);
    if (slot < 0 || !this.session.match) return;
    const botId = "bot" + Math.random().toString(36).slice(2, 8);
    const record: VbPlayerRecord = { nick: VbConfig.BOT_NAMES[slot], isBot: true, joinedAt: this.services.backend.now(), slot, look: VbBotLooks.create(VbConfig.teamOfSlot(slot)) };
    this.session.ref.update({ ["players/" + botId]: record, ["match/seats/s" + slot]: botId });
  }

  markEnded(): void {
    this.ended = true;
  }

  dispose(): void {
    this.services.world.playing = false;
    this.services.input.releaseAll();
    this.seats.forEach((actor) => { if (actor) actor.view.dispose(); });
    this.services.world.matchGroup.remove(this.group);
  }

  update(deltaSeconds: number): void {
    const now = this.services.backend.now();
    if (this.seatsDirty) this.syncSeats();
    this.tryBeginHost(now);
    this.driveControllers(deltaSeconds, now);
    this.sendStates(now);
    this.renderWorld(deltaSeconds, now);
    this.services.hud.update(this.hudModel(now));
    this.services.world.render(deltaSeconds);
  }

  private isHost(): boolean {
    return this.session.isHost();
  }

  private syncSeats(): void {
    const seatIds = VbSeatPlan.matchSeats(this.session.match);
    let complete = true;
    for (let slot = 0; slot < VbConfig.SEAT_COUNT; slot++) {
      const id = seatIds[slot];
      const record = id ? this.session.players.get(id) : undefined;
      const current = this.seats[slot];
      if (!id || !record) {
        complete = false;
        continue;
      }
      if (current && current.id === id) continue;
      const previous = current ? current.controller : null;
      if (current) current.view.dispose();
      const controller = this.makeController(slot, id, record, previous);
      const view = new VbPlayerView(this.services.libs, this.services.factory, this.services.assets, this.services.labels, this.group, slot, record);
      this.seats[slot] = { id, seenJump: 0, controller, view };
      this.controllers[slot] = controller;
    }
    this.seatsDirty = !complete;
  }

  private makeController(slot: number, id: string, record: VbPlayerRecord, previous: VbPlayerController | null): VbPlayerController {
    let controller: VbPlayerController;
    if (id === this.session.myId && this.local) controller = this.local;
    else if (this.isHost() && record.isBot) controller = new VolleyballBot(slot, Math.random);
    else controller = new VbRemoteController(slot);
    if (previous) {
      controller.x = previous.x;
      controller.z = previous.z;
      controller.yaw = previous.yaw;
      if (controller instanceof VbRemoteController) controller.teleport(previous.x, previous.z);
      controller.locked = previous.locked;
    } else if (this.rally) {
      const spot = VbCourtLayout.homeSpot(slot, this.rally.serveTeam, this.rally.server);
      controller.teleport(spot.x, spot.z);
    } else {
      const spot = VbCourtLayout.defendSpot(slot);
      controller.teleport(spot.x, spot.z);
    }
    return controller;
  }

  private tryBeginHost(now: number): void {
    if (!this.director || this.director.hasStarted || this.seatsDirty) return;
    this.director.begin(now);
  }

  private driveControllers(deltaSeconds: number, now: number): void {
    if (this.local) this.local.locked = !!this.rally && this.rally.phase === "serve" && this.rally.server === this.mySlot;
    if (this.director && this.director.hasStarted) {
      this.director.tick(deltaSeconds, now);
      return;
    }
    this.controllers.forEach((controller) => controller.poll(null, deltaSeconds, now));
  }

  private sendStates(now: number): void {
    if (now - this.lastSentMs < VbConfig.NET_MS) return;
    this.lastSentMs = now;
    if (this.local) this.sendIfNeeded(this.localSent, VbStateCodec.encode(this.local), now, this.session.myId);
    if (!this.isHost()) return;
    this.seats.forEach((actor) => {
      if (!actor || !(actor.controller instanceof VolleyballBot)) return;
      let sent = this.botSent.get(actor.id);
      if (!sent) {
        sent = { text: "", at: 0 };
        this.botSent.set(actor.id, sent);
      }
      this.sendIfNeeded(sent, VbStateCodec.encode(actor.controller), now, actor.id);
    });
  }

  private sendIfNeeded(sent: { text: string; at: number }, text: string, now: number, id: string): void {
    if (text === sent.text && now - sent.at < VolleyballMatch.STATE_KEEPALIVE_MS) return;
    sent.text = text;
    sent.at = now;
    this.session.writeState(text, id);
  }

  pressAction(): void {
    const local = this.local;
    if (!local || this.ended) return;
    const now = this.services.backend.now();
    const jump = this.isJumpPress(local, now);
    if (jump) {
      if (local.isJumping(now)) return;
      local.jumpStartMs = now;
      this.lastSentMs = 0;
    }
    if (this.isHost()) {
      if (!jump) local.registerPress(now, local.aimX, local.aimZ);
      return;
    }
    this.pressCounter++;
    this.session.writePress(jump
      ? { n: this.pressCounter, t: now, ax: local.x, az: local.z, j: 1 }
      : { n: this.pressCounter, t: now, ax: local.aimX, az: local.aimZ, j: 0 });
  }

  private isJumpPress(local: VbLocalController, now: number): boolean {
    const rally = this.rally, ball = this.ball;
    if (!rally || rally.phase !== "play" || !ball) return false;
    const onMySide = this.ballPosition(now).z * VbConfig.sideOf(local.team) > 0;
    return !(ball.to === local.team && onMySide);
  }

  private applyEvents(events: VbEvent[]): void {
    for (const event of events) {
      if (event.type === "ball") {
        this.session.writeBall(event.ball);
        this.applyBall(event.ball);
      } else {
        this.session.writeRally(event.rally);
        this.applyRally(event.rally);
        if (event.rally.phase === "over") this.finishMatch(event.rally);
      }
    }
  }

  private finishMatch(rally: VbRallyRecord): void {
    this.session.ref.update({ end: { winner: rally.winner, sa: rally.sa, sb: rally.sb, at: this.services.backend.now() }, status: "end" });
  }

  private applyBall(record: VbBallRecord | null): void {
    if (!record) return;
    this.ball = record;
    const now = this.services.backend.now();
    const actor = record.by >= 0 && record.by < VbConfig.SEAT_COUNT ? this.seats[record.by] : null;
    const clip = VolleyballMatch.CLIPS[record.kind];
    if (actor && clip && Math.abs(now - record.at) < 1500) actor.view.playAction(clip, now, VolleyballMatch.JUMP_KINDS.indexOf(record.kind) >= 0);
  }

  private applyRally(record: VbRallyRecord | null): void {
    if (!record) return;
    this.rally = record;
    if (record.phase === "serve" && record.n !== this.lastRallyNo) {
      this.lastRallyNo = record.n;
      if (!this.isHost()) this.seats.forEach((actor) => {
        if (!actor) return;
        const spot = VbCourtLayout.homeSpot(actor.controller.slot, record.serveTeam, record.server);
        actor.controller.teleport(spot.x, spot.z);
        actor.controller.locked = actor.controller.slot === record.server;
      });
      if (this.local) this.local.resetAim();
    }
  }

  private ballPosition(now: number): VbVec & { speed: number } {
    const ball = this.ball;
    if (!ball) return { x: 0, y: VbConfig.SERVE_HAND_Y, z: 0, speed: 0 };
    if (ball.hold) return { x: ball.x, y: ball.y, z: ball.z, speed: 0 };
    const seconds = VbMath.clamp((now - ball.at) / 1000, 0, 6);
    const position = VbBallPhysics.positionAt(ball, seconds);
    return { x: position.x, y: Math.max(position.y, VbConfig.BALL_R), z: position.z, speed: Math.hypot(ball.vx, ball.vz) };
  }

  private renderWorld(deltaSeconds: number, now: number): void {
    const ballPosition = this.ballPosition(now);
    this.ballView.place(ballPosition.x, ballPosition.y, ballPosition.z, ballPosition.speed, deltaSeconds);
    this.seats.forEach((actor) => {
      if (!actor) return;
      const controller = actor.controller;
      if (controller.jumpStartMs > actor.seenJump) {
        actor.seenJump = controller.jumpStartMs;
        if (now - controller.jumpStartMs < VbConfig.JUMP_MS) actor.view.playAction("Melee_Block", controller.jumpStartMs, true);
      }
      actor.view.render(controller.x, controller.z, controller.yaw, controller.moving, deltaSeconds, now);
    });
    this.updateMarkers(now);
    const rig = this.services.world.rig;
    if (this.local) rig.followPlayer(this.local.team, this.local.x, deltaSeconds);
    else rig.watchFromReferee(ballPosition.z, deltaSeconds);
  }

  private viewerSeesTeam(team: number): boolean {
    return !this.local || this.local.team === team;
  }

  private updateMarkers(now: number): void {
    this.updateReceiveMarker(now);
    this.updateAimMarker();
  }

  private updateReceiveMarker(now: number): void {
    const ball = this.ball;
    if (!ball || ball.hold || ball.to < 0 || !this.viewerSeesTeam(ball.to)) {
      this.receiveMarker.hide();
      return;
    }
    const crossing = VbBallPhysics.crossing(ball, ball.ry);
    if (!crossing) {
      this.receiveMarker.hide();
      return;
    }
    if (ball.seq !== this.totalFlightSeq) {
      this.totalFlightSeq = ball.seq;
      this.totalFlight = Math.max(0.3, crossing.t);
    }
    const remaining = ball.at / 1000 + crossing.t - now / 1000;
    if (remaining < -0.25) {
      this.receiveMarker.hide();
      return;
    }
    const own = ball.kind === "dig" || ball.kind === "set";
    const color = own ? VolleyballMatch.TOSS_COLORS[ball.to] : VolleyballMatch.INCOMING_COLOR;
    const progress = VbMath.clamp(remaining / this.totalFlight, 0, 1);
    const blink = remaining < 0.45 ? 0.55 + 0.45 * Math.sin(now / 45) : 1;
    this.receiveMarker.show(crossing.x, crossing.z, color, 0.5 + 0.7 * progress, 0.95 * blink);
  }

  private updateAimMarker(): void {
    const rally = this.rally, ball = this.ball;
    let slot = -1;
    if (rally && rally.phase === "serve" && ball && (ball.kind === "hold" || ball.kind === "toss")) slot = rally.server;
    else if (rally && rally.phase === "play" && ball && ball.next >= 0 && ball.n >= 1) slot = ball.next;
    const actor = slot >= 0 ? this.seats[slot] : null;
    if (!actor || (this.local && this.local.slot !== slot)) {
      this.aimMarker.hide();
      return;
    }
    const controller = actor.controller;
    const target = rally && rally.phase === "serve" ? { x: controller.aimX, z: controller.aimZ } : this.spikeAimOf(controller, this.session.players.get(actor.id));
    this.aimMarker.show(target.x, target.z, VolleyballMatch.AIM_COLOR, 1, 0.9);
  }

  private spikeAimOf(controller: VbPlayerController, record: VbPlayerRecord | undefined): VbPoint {
    const opponents = this.controllers.filter((other) => other.team !== controller.team).map((other) => ({ x: other.x, z: other.z }));
    const spike = !!this.ball && this.ball.n >= 2;
    const human = !!record && !record.isBot;
    const near = spike && human && -controller.iz * VbConfig.sideOf(controller.team) < -0.45;
    const depths = spike ? (near ? ShotAimer.NEAR_SPIKE_DEPTHS : ShotAimer.SPIKE_DEPTHS) : ShotAimer.LOB_DEPTHS;
    return ShotAimer.emptySpot(controller.team, opponents, depths);
  }

  private hudModel(now: number): VbHudModel {
    const rally = this.rally, ball = this.ball;
    const score = rally ? [rally.sa, rally.sb] : [0, 0];
    const model: VbHudModel = {
      score, serveTeam: rally ? rally.serveTeam : -1, myTeam: this.local ? this.local.team : -1,
      roleText: this.local ? "" : "관전 중", banner: "", hint: "", actionLabel: this.local ? "치기" : "", actionReady: false
    };
    if (!rally) {
      model.banner = "경기를 준비하고 있어요…";
      return model;
    }
    model.banner = this.bannerText(rally, now);
    if (this.local && ball) this.fillActionHint(model, rally, ball);
    return model;
  }

  private bannerText(rally: VbRallyRecord, now: number): string {
    if (rally.phase === "point") {
      const teamName = VbConfig.TEAM_NAMES[rally.winner];
      return teamName + " 득점!  (" + rally.why + ")  " + rally.sa + " : " + rally.sb;
    }
    if (rally.phase === "serve" && now < rally.at) {
      const seconds = Math.ceil((rally.at - now) / 1000);
      return (rally.n === 1 ? "경기 시작! " : "서브 준비 ") + seconds;
    }
    return "";
  }

  private fillActionHint(model: VbHudModel, rally: VbRallyRecord, ball: VbBallRecord): void {
    const local = this.local as VbLocalController;
    if (rally.phase === "serve") {
      if (rally.server === local.slot) {
        model.actionLabel = ball.kind === "toss" ? "서브!" : "공 띄우기";
        model.actionReady = true;
        model.hint = ball.kind === "toss" ? "공이 가장 높이 떴을 때 한 번 더 눌러 서브!" : "스틱으로 목표 지점을 정하고 버튼으로 공을 띄워요";
      } else {
        model.hint = rally.server >= 0 && VbConfig.teamOfSlot(rally.server) === local.team ? "동료가 서브해요" : "상대가 서브해요 · 주황 표식으로 달려가요";
      }
      return;
    }
    if (rally.phase !== "play") return;
    if (ball.to >= 0 && ball.to !== local.team && ball.kind === "set" && ball.n === 2) {
      model.actionLabel = "블로킹";
      model.actionReady = true;
      model.hint = "상대가 공격해요 · 네트 앞에서 스파이크 방향을 읽고 제자리 점프(버튼)로 블로킹!";
      return;
    }
    if (ball.to !== local.team) return;
    if (ball.kind !== "dig" && ball.kind !== "set") {
      model.hint = "표식 위로 달려가면 자동으로 받아요";
      return;
    }
    const mine = ball.next === local.slot;
    if (!mine) {
      model.hint = "동료가 공을 받아요";
      return;
    }
    model.actionReady = true;
    if (ball.n === 1) {
      model.actionLabel = "넘기기";
      model.hint = "누르지 않으면 동료에게 토스 · 누르면 상대 코트로 높게 넘겨요";
    } else {
      model.actionLabel = "스파이크";
      model.hint = "누르면 점프 스파이크(스틱 그대로=멀리 강하게, 뒤로 당기면 가까이) · 안 누르면 블로킹 위로 안전하게 넘겨요";
    }
  }
}

class VbScreens {
  private readonly start = VbDom.byId("startScreen");
  private readonly lobby = VbDom.byId("lobbyScreen");
  private readonly end = VbDom.byId("endScreen");
  private readonly gameUi = VbDom.byId("gameUi");
  private readonly joystickZone = VbDom.byId("joyZone");
  current: VbScreenName = "start";

  constructor(private readonly touchDevice: boolean) {}

  show(name: VbScreenName, canControl: boolean = true): void {
    this.current = name;
    VbDom.show(this.start, name === "start");
    VbDom.show(this.lobby, name === "lobby");
    VbDom.show(this.end, name === "end");
    VbDom.show(this.gameUi, name === "game");
    VbDom.show(this.joystickZone, name === "game" && this.touchDevice && canControl);
    document.body.classList.toggle("in-game", name === "game");
  }
}

class VbLobbyView {
  private readonly code = VbDom.byId("lobbyCode");
  private readonly seatBoard = VbDom.byId("seatBoard");
  private readonly spectatorLine = VbDom.byId("spectatorLine");
  private readonly startButton = VbDom.byId<HTMLButtonElement>("btnStart");
  private readonly modeButton = VbDom.byId<HTMLButtonElement>("btnSeatMode");
  private readonly hint = VbDom.byId("lobbyHint");
  onSeatClick: (slot: number) => void = () => undefined;
  selectedSlot = -1;

  constructor() {
    this.seatBoard.addEventListener("click", (event) => {
      const seat = (event.target as HTMLElement).closest("[data-slot]") as HTMLElement | null;
      if (seat) this.onSeatClick(Number(seat.dataset.slot));
    });
  }

  render(session: VbRoomSession): void {
    const isHost = session.isHost();
    const seats = VbSeatPlan.humanSeats(session.players);
    VbDom.setText(this.code, session.code);
    const teamHtml = [0, 1].map((team) => {
      const rows = [team * 2, team * 2 + 1].map((slot) => this.seatHtml(session, seats[slot], slot)).join("");
      return "<div class='vbTeam' style='--team:" + VbConfig.TEAM_COLORS[team] + "'><h3>" + VbConfig.TEAM_NAMES[team] + "</h3>" + rows + "</div>";
    }).join("");
    this.seatBoard.innerHTML = teamHtml;
    const spectatorNames = VbSeatPlan.spectators(session.players).map((id) => (session.players.get(id) as VbPlayerRecord).nick + (id === session.myId ? " (나)" : ""));
    VbDom.setText(this.spectatorLine, "관전: " + (spectatorNames.length ? spectatorNames.join(", ") : "없음"));
    const humans = seats.filter((id) => !!id).length;
    VbDom.show(this.startButton, isHost);
    const spectating = session.isSpectator();
    this.modeButton.textContent = spectating ? "선수로 참가하기" : "관전자로 바꾸기";
    this.modeButton.disabled = spectating ? VbSeatPlan.freeSeat(session.players) < 0 : VbSeatPlan.spectators(session.players).length > 0;
    VbDom.setText(this.hint, isHost
      ? "사람 " + humans + "명 · 빈 자리 " + (VbConfig.SEAT_COUNT - humans) + "곳은 AI가 채워요. 자리를 눌러 두 칸을 바꿀 수 있어요."
      : "방장이 시작하길 기다리는 중이에요… 빈 자리를 누르면 옮길 수 있어요.");
  }

  private seatHtml(session: VbRoomSession, id: string | null, slot: number): string {
    const selected = this.selectedSlot === slot ? " selected" : "";
    if (!id) return "<button type='button' class='vbSeat empty" + selected + "' data-slot='" + slot + "'><b>AI</b><small>빈 자리</small></button>";
    const record = session.players.get(id) as VbPlayerRecord;
    const tag = id === session.hostId ? "방장" : "";
    const mine = id === session.myId ? " me" : "";
    return "<button type='button' class='vbSeat" + mine + selected + "' data-slot='" + slot + "'><b>" + VbDom.escape(record.nick) + "</b><small>" + tag + (id === session.myId ? " 나" : "") + "</small></button>";
  }
}

class VbEndView {
  private readonly title = VbDom.byId("endTitle");
  private readonly reason = VbDom.byId("endReason");
  private readonly rows = VbDom.byId("endRows");

  render(session: VbRoomSession, end: VbEndRecord): void {
    const seats = VbSeatPlan.matchSeats(session.match);
    const myTeam = seats.indexOf(session.myId) >= 0 ? VbConfig.teamOfSlot(seats.indexOf(session.myId)) : -1;
    VbDom.setText(this.title, VbConfig.TEAM_NAMES[end.winner] + " 승리!" + (myTeam >= 0 ? (myTeam === end.winner ? "  (우리가 이겼어요)" : "  (아쉬워요)") : ""));
    VbDom.setText(this.reason, VbConfig.TEAM_NAMES[0] + " " + end.sa + " : " + end.sb + " " + VbConfig.TEAM_NAMES[1]);
    this.rows.innerHTML = [0, 1, 2, 3].map((slot) => {
      const id = seats[slot];
      const record = id ? session.players.get(id) : undefined;
      const team = VbConfig.teamOfSlot(slot);
      const name = record ? record.nick + (record.isBot ? " (AI)" : "") : "(나감)";
      const result = team === end.winner ? "승리" : "패배";
      return "<tr" + (id === session.myId ? " class='meRow'" : "") + "><td><span class='rankDot' style='background:" + VbConfig.TEAM_COLORS[team] + "'></span>" + VbDom.escape(name) + "</td><td>" + VbConfig.TEAM_NAMES[team] + "</td><td>" + result + "</td></tr>";
    }).join("");
  }
}

class VbMenuBackdrop {
  private static readonly ORBIT_SECONDS = 70;
  private static readonly RADIUS = 17;
  private static readonly HEIGHT = 7.5;
  private static readonly HOP_SECONDS = 1.8;
  private static readonly PEAK = 3.4;

  private readonly ballView: VbBallView;
  private readonly views: VbPlayerView[] = [];
  private seconds = 0;
  private hopIndex = -1;

  constructor(private readonly world: VbWorldView, private readonly libs: ThreeLibs, textures: VbCourtTextures) {
    this.ballView = new VbBallView(libs, textures);
    world.scene.add(this.ballView.group);
  }

  prepare(factory: CharacterModelFactory, assets: CharacterAssets, labels: VbLabelFactory): void {
    if (this.views.length) return;
    for (let slot = 0; slot < VbConfig.SEAT_COUNT; slot++) {
      const record: VbPlayerRecord = { nick: VbConfig.BOT_NAMES[slot], isBot: true, joinedAt: 0, slot, look: VbBotLooks.create(VbConfig.teamOfSlot(slot)) };
      const view = new VbPlayerView(this.libs, factory, assets, labels, this.world.scene, slot, record);
      this.views.push(view);
    }
  }

  render(deltaSeconds: number): void {
    this.seconds += deltaSeconds;
    const nowMs = this.seconds * 1000;
    this.ballView.group.visible = true;
    const hops = this.seconds / VbMenuBackdrop.HOP_SECONDS;
    const hop = Math.floor(hops);
    const progress = hops - hop;
    const fromTeam = hop % 2;
    const direction = VbConfig.sideOf(fromTeam);
    const ballZ = direction * (5.2 - 10.4 * progress);
    const ballX = Math.sin(hops * 1.3) * 2;
    const height = VbConfig.BALL_R + 4 * progress * (1 - progress) * VbMenuBackdrop.PEAK + 0.8 * (1 - progress);
    this.ballView.place(ballX, height, ballZ, 4, deltaSeconds);
    if (hop !== this.hopIndex) {
      this.hopIndex = hop;
      const sender = this.views[fromTeam * 2 + (Math.floor(hop / 2) % 2)];
      if (sender) sender.playAction("Melee_1H_Attack_Jump_Chop", nowMs, true);
    }
    this.views.forEach((view, slot) => {
      const spot = VbCourtLayout.defendSpot(slot);
      const team = VbConfig.teamOfSlot(slot);
      const approach = VbConfig.sideOf(team) * direction > 0 ? 0 : 1;
      const x = spot.x + Math.sin(this.seconds * 0.8 + slot) * 0.7 + (slot % 2 === 0 ? -1 : 1) * 0.3 * approach;
      view.render(x, spot.z, VbCourtLayout.facingYaw(team), false, deltaSeconds, nowMs);
    });
    this.world.rig.orbit(VbMenuBackdrop.RADIUS, VbMenuBackdrop.HEIGHT, (this.seconds / VbMenuBackdrop.ORBIT_SECONDS) * Math.PI * 2);
    this.world.render(deltaSeconds);
  }

  hide(): void {
    this.ballView.group.visible = false;
    this.views.forEach((view) => { view.group.visible = false; });
  }

  show(): void {
    this.views.forEach((view) => { view.group.visible = true; });
  }
}

class VolleyballGame {
  private readonly backdrop: VbMenuBackdrop;
  private readonly touchDevice = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  private readonly profile = new PlayerProfile();
  private readonly backend = new VbBackend();
  private readonly directory = new VbRoomDirectory(this.backend);
  private readonly assets: CharacterAssets;
  private readonly factory: CharacterModelFactory;
  private readonly textures: VbCourtTextures;
  private readonly court: VbCourtView;
  private readonly services: VbMatchServices;
  private readonly screens = new VbScreens(this.touchDevice);
  private readonly lobbyView = new VbLobbyView();
  private readonly endView = new VbEndView();
  private readonly editor: ProfileEditor;
  private readonly myId = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  private session: VbRoomSession | null = null;
  private match: VolleyballMatch | null = null;
  private assetsReady = false;
  private lastFrameMs = 0;

  constructor(private readonly libs: ThreeLibs) {
    this.assets = new CharacterAssets(libs);
    this.factory = new CharacterModelFactory(libs, this.assets);
    this.textures = new VbCourtTextures(libs);
    this.court = new VbCourtView(libs, this.textures);
    this.editor = new ProfileEditor(libs, this.factory, this.assets, this.profile);
    FoldCard.bindAll(document);
    const input = new VolleyballInput(VbDom.byId("joyZone"), VbDom.byId("joyBase"), VbDom.byId("joyKnob"));
    input.onAct = () => { if (this.match) this.match.pressAction(); };
    this.services = {
      libs, assets: this.assets, factory: this.factory, labels: new VbLabelFactory(libs),
      world: new VbWorldView(libs, VbDom.byId<HTMLCanvasElement>("view"), this.touchDevice),
      hud: new VbHud(), input, backend: this.backend, court: this.court, textures: this.textures
    };
    this.services.world.scene.add(this.court.group);
    this.backdrop = new VbMenuBackdrop(this.services.world, libs, this.textures);
    this.bindMenus();
    this.screens.show("start");
    this.updateStartButtons();
    this.loadAssets();
    requestAnimationFrame(this.loop);
    window.setInterval(() => { if (document.hidden) this.step(performance.now()); }, 250);
    window.addEventListener("pagehide", () => { if (this.session) this.session.removeMineOnUnload(); });
  }

  private async loadAssets(): Promise<void> {
    try {
      await Promise.all([this.assets.load(), this.court.loadDecor()]);
      this.assetsReady = true;
      this.backdrop.prepare(this.factory, this.assets, this.services.labels);
      VbDom.setText(VbDom.byId("loadNote"), "");
      this.editor.mount(VbDom.byId("profileHost"));
      this.editor.setActive(true);
      this.editor.onChange(() => this.pushProfile());
      this.updateStartButtons();
    } catch (error) {
      VbDom.setText(VbDom.byId("loadNote"), "캐릭터를 불러오지 못했어요. 새로고침해 주세요.");
    }
  }

  private bindMenus(): void {
    VbDom.byId("btnCreate").addEventListener("click", () => this.createRoom());
    VbDom.byId("btnJoin").addEventListener("click", () => this.joinRoom(false));
    VbDom.byId("btnWatch").addEventListener("click", () => this.joinRoom(true));
    VbDom.byId("joinCode").addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") this.joinRoom(false); });
    VbDom.byId("btnStart").addEventListener("click", () => this.startMatch());
    VbDom.byId("btnLeave").addEventListener("click", () => this.leaveRoom());
    VbDom.byId("btnEndLeave").addEventListener("click", () => this.leaveRoom());
    VbDom.byId("btnGameLeave").addEventListener("click", () => this.leaveRoom());
    VbDom.byId("btnToLobby").addEventListener("click", () => this.returnToLobby());
    VbDom.byId("btnSeatMode").addEventListener("click", () => this.toggleSeatMode());
    this.lobbyView.onSeatClick = (slot) => this.clickSeat(slot);
  }

  private updateStartButtons(): void {
    const ok = !!this.backend.database && this.assetsReady;
    ["btnCreate", "btnJoin", "btnWatch"].forEach((id) => { VbDom.byId<HTMLButtonElement>(id).disabled = !ok; });
    if (!this.backend.database) this.showStartMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인)");
  }

  private showStartMessage(text: string): void {
    VbDom.setText(VbDom.byId("startMsg"), text);
  }

  private myRecord(): VbPlayerRecord {
    return { nick: this.profile.nickOrDefault(), isBot: false, joinedAt: this.backend.now(), slot: 0, look: this.profile.look, spectator: false };
  }

  private pushProfile(): void {
    if (this.session) this.session.pushProfile({ nick: this.profile.nickOrDefault(), look: this.profile.look });
  }

  private async createRoom(): Promise<void> {
    if (!this.backend.database) return;
    this.showStartMessage("");
    const button = VbDom.byId<HTMLButtonElement>("btnCreate");
    button.disabled = true;
    try {
      const code = await this.directory.create(this.myId, this.myRecord());
      if (code) this.enterRoom(code, true, "");
      else this.showStartMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
    } catch (error) {
      this.showStartMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
    }
    button.disabled = false;
  }

  private async joinRoom(asSpectator: boolean): Promise<void> {
    if (!this.backend.database) return;
    const code = VbDom.byId<HTMLInputElement>("joinCode").value.replace(/\D/g, "");
    if (code.length !== 5) {
      this.showStartMessage("방 코드 5자리를 입력해 주세요.");
      return;
    }
    this.showStartMessage("");
    try {
      const outcome = await this.directory.join(code, this.myId, this.myRecord(), asSpectator);
      if (outcome.ok) this.enterRoom(code, false, outcome.message);
      else this.showStartMessage(outcome.message);
    } catch (error) {
      this.showStartMessage("방을 불러오지 못했어요.");
    }
  }

  private enterRoom(code: string, hosting: boolean, notice: string): void {
    const session = new VbRoomSession(this.backend, code, this.myId, hosting);
    this.session = session;
    session.onChange = (kind) => this.onSessionChange(kind);
    session.onRemoteState = (id, state) => { if (this.match) this.match.receiveRemote(id, state); };
    session.onPress = (id, record) => { if (this.match) this.match.receivePress(id, record); };
    session.onPlayerRemoved = (id) => { if (this.match) this.match.playerRemoved(id); };
    session.onClosed = (message) => this.exitToStart(message);
    session.connect();
    this.lobbyView.selectedSlot = -1;
    this.showLobby();
    VbDom.setText(VbDom.byId("lobbyNotice"), notice);
  }

  private showLobby(): void {
    this.screens.show("lobby");
    this.editor.mount(VbDom.byId("lobbyProfileHost"));
    this.editor.setActive(true);
    if (this.session) this.lobbyView.render(this.session);
  }

  private showStart(message: string): void {
    this.screens.show("start");
    this.editor.mount(VbDom.byId("profileHost"));
    this.editor.setActive(true);
    this.showStartMessage(message);
  }

  private onSessionChange(kind: VbChange): void {
    const session = this.session;
    if (!session) return;
    if (this.screens.current === "lobby" && (kind === "players" || kind === "host" || kind === "status")) this.lobbyView.render(session);
    if (kind === "status" || kind === "match" || kind === "end" || (kind === "players" && session.status === "play" && !this.match)) this.syncPhase();
    if (this.match) this.match.applyChange(kind);
  }

  private syncPhase(): void {
    const session = this.session;
    if (!session) return;
    if (session.status === "lobby") {
      if (this.match) this.disposeMatch();
      if (this.screens.current !== "lobby") this.showLobby();
      this.lobbyView.render(session);
    } else if (session.status === "play" && session.match && !this.match && session.me()) {
      this.editor.setActive(false);
      this.match = new VolleyballMatch(this.services, session);
      this.screens.show("game", !session.isSpectator());
    } else if (session.status === "end" && session.end && this.screens.current !== "end") {
      if (this.match) this.match.markEnded();
      this.endView.render(session, session.end);
      this.screens.show("end");
      VbDom.show(VbDom.byId("btnToLobby"), session.isHost());
      VbDom.setText(VbDom.byId("endHint"), session.isHost() ? "" : "방장이 대기실로 돌아가길 기다려요…");
    }
  }

  private disposeMatch(): void {
    if (this.match) this.match.dispose();
    this.match = null;
  }

  private clickSeat(slot: number): void {
    const session = this.session;
    if (!session || session.status !== "lobby") return;
    const seats = VbSeatPlan.humanSeats(session.players);
    if (session.isHost()) {
      const picked = this.lobbyView.selectedSlot;
      if (picked < 0) this.lobbyView.selectedSlot = slot;
      else if (picked === slot) this.lobbyView.selectedSlot = -1;
      else {
        const updates = VbSeatPlan.swapUpdates(session.players, picked, slot);
        if (Object.keys(updates).length) session.ref.update(updates);
        this.lobbyView.selectedSlot = -1;
      }
      this.lobbyView.render(session);
      return;
    }
    const me = session.me();
    if (me && !seats[slot]) session.ref.child("players/" + session.myId).update({ slot, spectator: false });
  }

  private toggleSeatMode(): void {
    const session = this.session;
    if (!session || session.status !== "lobby") return;
    if (session.isSpectator()) {
      const seat = VbSeatPlan.freeSeat(session.players);
      if (seat >= 0) session.ref.child("players/" + session.myId).update({ slot: seat, spectator: false });
    } else if (VbSeatPlan.spectators(session.players).length === 0) {
      session.ref.child("players/" + session.myId).update({ slot: VbConfig.SPECTATOR_SLOT, spectator: true });
    }
  }

  private startMatch(): void {
    const session = this.session;
    if (!session || !session.isHost() || session.status !== "lobby") return;
    const humans = VbSeatPlan.humanSeats(session.players);
    const seats: Record<string, string> = {};
    const updates: Record<string, unknown> = {};
    for (let slot = 0; slot < VbConfig.SEAT_COUNT; slot++) {
      const human = humans[slot];
      if (human) {
        seats["s" + slot] = human;
        continue;
      }
      const botId = "bot" + Math.random().toString(36).slice(2, 8);
      seats["s" + slot] = botId;
      const record: VbPlayerRecord = { nick: VbConfig.BOT_NAMES[slot], isBot: true, joinedAt: this.backend.now() + 1 + slot, slot, look: VbBotLooks.create(VbConfig.teamOfSlot(slot)) };
      updates["players/" + botId] = record;
    }
    const match: VbMatchRecord = { id: 1 + Math.floor(Math.random() * 1000000000), startAt: this.backend.now(), seats };
    Object.assign(updates, { match, status: "play", st: null, in: null, ball: null, rally: null, end: null });
    session.ref.update(updates);
  }

  private returnToLobby(): void {
    const session = this.session;
    if (!session || !session.isHost()) return;
    const updates: Record<string, unknown> = { status: "lobby", match: null, ball: null, rally: null, end: null, st: null, in: null };
    session.players.forEach((record, id) => { if (record.isBot) updates["players/" + id] = null; });
    session.ref.update(updates);
  }

  private leaveRoom(): void {
    if (this.session) this.session.leave();
    this.session = null;
    this.disposeMatch();
    this.showStart("");
  }

  private exitToStart(message: string): void {
    if (this.session) this.session.silentClose();
    this.session = null;
    this.disposeMatch();
    this.showStart(message);
  }

  private readonly loop = (timeMs: number): void => {
    this.step(timeMs);
    requestAnimationFrame(this.loop);
  };

  private step(timeMs: number): void {
    const deltaSeconds = Math.min(0.1, Math.max(0, (timeMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = timeMs;
    if (this.match) {
      this.backdrop.hide();
      this.match.update(deltaSeconds);
    } else {
      this.backdrop.show();
      this.backdrop.render(deltaSeconds);
    }
  }
}
