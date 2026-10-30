interface FrNode { apply(rest: string[], value: unknown): void }

interface FrMember { no: number; name: string; look: unknown; adm: boolean }
interface FrPresenceRow { area: string; sleeping: boolean; day: number; at: number }
interface FrRemotePose { x: number; z: number; y: number; dir: number; anim: number; vx: number; vz: number; at: number }
interface FrAdminState { notice: { text: string; at: number } | null; lock: boolean; commands: Record<string, { type: string; at: number }> }

class FrWire {
  static readonly ANIMS = ["idle", "run", "walk", "chop", "pickaxe", "dig", "sleep", "fish", "work"];

  static pair(value: unknown): FrTerrainEdit | null {
    if (Array.isArray(value)) return { h: Number(value[0]), t: String(value[1]) };
    if (value && typeof value === "object") { const o = value as Record<string, unknown>; return { h: Number(o["0"]), t: String(o["1"]) }; }
    return null;
  }

  static encodePose(x: number, z: number, y: number, facing: number, anim: number, vx: number, vz: number): string {
    const dir = ((Math.round((facing / (Math.PI * 2)) * 16) % 16) + 16) % 16;
    return Math.round(x * 10) + "," + Math.round(z * 10) + "," + Math.round(y * 10) + "," + dir + "," + anim + "," + Math.round(vx * 10) + "," + Math.round(vz * 10);
  }

  static decodePose(text: unknown): FrRemotePose | null {
    if (typeof text !== "string") return null;
    const p = text.split(",").map(Number);
    if (p.length < 5 || p.some((n) => !isFinite(n))) return null;
    return { x: p[0] / 10, z: p[1] / 10, y: p[2] / 10, dir: (p[3] / 16) * Math.PI * 2, anim: p[4], vx: (p[5] || 0) / 10, vz: (p[6] || 0) / 10, at: Date.now() };
  }
}

class FrRoster {
  readonly members = new Map<string, FrMember>();
  readonly presence = new Map<string, FrPresenceRow>();
  readonly poses = new Map<string, FrRemotePose>();
  private readonly listeners: Array<() => void> = [];
  serverNow: () => number = () => Date.now();

  onChange(listener: () => void): void { this.listeners.push(listener); }
  changed(): void { this.listeners.forEach((l) => l()); }

  static readonly STALE_MS = 75000;

  alive(uid: string): boolean {
    const row = this.presence.get(uid);
    return !!row && this.serverNow() - row.at < FrRoster.STALE_MS;
  }

  aliveUids(): string[] { return Array.from(this.presence.keys()).filter((uid) => this.alive(uid)); }

  asPresences(day: number, selfUid: string, self: FrPresence): FrPresence[] {
    const list: FrPresence[] = [self];
    this.aliveUids().forEach((uid) => {
      if (uid === selfUid) return;
      const row = this.presence.get(uid) as FrPresenceRow;
      const member = this.members.get(uid);
      if (member && member.adm) return;
      list.push({ uid, name: member ? member.name : "?", area: row.area, sleeping: row.sleeping, actedToday: row.day === day });
    });
    return list;
  }
}

abstract class FrMapNode implements FrNode {
  apply(rest: string[], value: unknown): void {
    if (rest.length === 0) {
      const table = (value || {}) as Record<string, unknown>;
      this.replaceAll(table);
      return;
    }
    this.setOne(rest, value);
  }
  protected abstract replaceAll(table: Record<string, unknown>): void;
  protected abstract setOne(rest: string[], value: unknown): void;
}

class FrJungleNode extends FrMapNode {
  constructor(private readonly world: FrWorld) { super(); }
  protected replaceAll(table: Record<string, unknown>): void { Object.keys(table).forEach((k) => this.world.remoteFelled(Number(k))); }
  protected setOne(rest: string[], value: unknown): void { if (value === 1) this.world.remoteFelled(Number(rest[0])); }
}

class FrTerrainNode extends FrMapNode {
  constructor(private readonly world: FrWorld) { super(); }
  protected replaceAll(table: Record<string, unknown>): void { Object.keys(table).forEach((chunk) => this.setOne([chunk], table[chunk])); }
  protected setOne(rest: string[], value: unknown): void {
    if (rest.length === 1) {
      const cells = (value || {}) as Record<string, unknown>;
      Object.keys(cells).forEach((cell) => this.setOne([rest[0], cell], cells[cell]));
      return;
    }
    const edit = FrWire.pair(value);
    if (edit) this.world.remoteTerrain(Number(rest[1]), edit);
  }
}

class FrSnowNode extends FrMapNode {
  constructor(private readonly world: FrWorld) { super(); }
  protected replaceAll(table: Record<string, unknown>): void { Object.keys(table).forEach((k) => this.world.remoteSnow(Number(k), Number(table[k]))); }
  protected setOne(rest: string[], value: unknown): void { this.world.remoteSnow(Number(rest[0]), value === null ? null : Number(value)); }
}

class FrBuildNode extends FrMapNode {
  constructor(private readonly world: FrWorld) { super(); }
  protected replaceAll(table: Record<string, unknown>): void { Object.keys(table).forEach((k) => this.world.remoteBuilt(k)); }
  protected setOne(rest: string[], value: unknown): void { if (value !== null) this.world.remoteBuilt(rest[0]); else this.world.remoteUnbuilt(rest[0]); }
}

class FrPublicNode extends FrMapNode {
  private known = new Set<string>();
  constructor(private readonly world: FrWorld) { super(); }
  protected replaceAll(table: Record<string, unknown>): void {
    this.known.forEach((id) => { if (table[id] === undefined) this.world.remotePublic(id, 0); });
    this.known = new Set(Object.keys(table));
    Object.keys(table).forEach((id) => this.world.remotePublic(id, Number(table[id])));
  }
  protected setOne(rest: string[], value: unknown): void {
    this.known.add(rest[0]);
    this.world.remotePublic(rest[0], value === null ? 0 : Number(value));
  }
}

class FrBlocksNode extends FrMapNode {
  constructor(private readonly world: FrWorld) { super(); }
  protected replaceAll(table: Record<string, unknown>): void { Object.keys(table).forEach((chunk) => this.setOne([chunk], table[chunk])); }
  protected setOne(rest: string[], value: unknown): void {
    if (rest.length === 1) {
      const cells = (value || {}) as Record<string, unknown>;
      Object.keys(cells).forEach((key) => this.setOne([rest[0], key], cells[key]));
      return;
    }
    const parsed = FrBlockKey.parse(rest[1]);
    const record = value && typeof value === "object" ? (value as FrBlockRecord) : null;
    this.world.remoteBlock(parsed.index, parsed.y, record);
  }
}

class FrFarmNode extends FrMapNode {
  private known = new Set<number>();
  constructor(private readonly world: FrWorld) { super(); }
  protected replaceAll(table: Record<string, unknown>): void {
    const now = new Set(Object.keys(table).map(Number));
    this.known.forEach((i) => { if (!now.has(i)) this.world.remoteFarm(i, null); });
    this.known = now;
    Object.keys(table).forEach((k) => this.world.remoteFarm(Number(k), table[k] as FrCropRecord));
  }
  protected setOne(rest: string[], value: unknown): void {
    const index = Number(rest[0]);
    if (value && typeof value === "object") { this.known.add(index); this.world.remoteFarm(index, value as FrCropRecord); } else { this.known.delete(index); this.world.remoteFarm(index, null); }
  }
}

class FrLotsNode extends FrMapNode {
  constructor(private readonly world: FrWorld) { super(); }
  protected replaceAll(table: Record<string, unknown>): void {
    const keep = new Set(Object.keys(table).map(Number));
    Array.from(this.world.lots.keys()).forEach((n) => { if (!keep.has(n)) this.world.remoteLot(n, null); });
    Object.keys(table).forEach((n) => this.world.remoteLot(Number(n), table[n] as FrLot));
  }
  protected setOne(rest: string[], value: unknown): void { this.world.remoteLot(Number(rest[0]), value && typeof value === "object" ? (value as FrLot) : null); }
}

class FrLogNode extends FrMapNode {
  constructor(private readonly world: FrWorld) { super(); }
  protected replaceAll(table: Record<string, unknown>): void { Object.keys(table).sort().forEach((k) => this.setOne([k], table[k])); }
  protected setOne(rest: string[], value: unknown): void { if (value) this.world.remoteLog(rest[0], value as FrPublicLogLine); }
}

class FrMembersNode extends FrMapNode {
  constructor(private readonly roster: FrRoster) { super(); }
  protected replaceAll(table: Record<string, unknown>): void { Object.keys(table).forEach((uid) => this.put(uid, table[uid])); this.roster.changed(); }
  protected setOne(rest: string[], value: unknown): void { if (rest.length === 1) this.put(rest[0], value); this.roster.changed(); }
  private put(uid: string, value: unknown): void {
    if (!value || typeof value !== "object") { this.roster.members.delete(uid); return; }
    const v = value as Record<string, unknown>;
    this.roster.members.set(uid, { no: Number(v.no) || 0, name: String(v.name || "?"), look: v.look || null, adm: v.adm === 1 || v.adm === true });
  }
}

class FrPresenceNode extends FrMapNode {
  constructor(private readonly roster: FrRoster) { super(); }
  protected replaceAll(table: Record<string, unknown>): void {
    this.roster.presence.clear();
    Object.keys(table).forEach((uid) => this.put(uid, table[uid]));
    this.roster.changed();
  }
  protected setOne(rest: string[], value: unknown): void {
    if (rest.length === 1) this.put(rest[0], value);
    else {
      const row = this.roster.presence.get(rest[0]);
      if (row) this.field(row, rest[1], value);
    }
    this.roster.changed();
  }
  private put(uid: string, value: unknown): void {
    if (!value || typeof value !== "object") { this.roster.presence.delete(uid); this.roster.poses.delete(uid); return; }
    const v = value as Record<string, unknown>;
    this.roster.presence.set(uid, { area: String(v.a || "island"), sleeping: v.s === 1, day: Number(v.d) || 0, at: Number(v.at) || 0 });
  }
  private field(row: FrPresenceRow, name: string, value: unknown): void {
    if (name === "a") row.area = String(value);
    else if (name === "s") row.sleeping = value === 1;
    else if (name === "d") row.day = Number(value) || 0;
    else if (name === "at") row.at = Number(value) || 0;
  }
}

class FrPoseNode extends FrMapNode {
  constructor(private readonly roster: FrRoster) { super(); }
  protected replaceAll(table: Record<string, unknown>): void {
    this.roster.poses.clear();
    Object.keys(table).forEach((uid) => this.put(uid, table[uid]));
  }
  protected setOne(rest: string[], value: unknown): void { this.put(rest[0], value); }
  private put(uid: string, value: unknown): void {
    const pose = FrWire.decodePose(value);
    if (pose) this.roster.poses.set(uid, pose); else this.roster.poses.delete(uid);
  }
}

class FrAdminNode extends FrMapNode {
  readonly state: FrAdminState = { notice: null, lock: false, commands: {} };
  onNotice: (text: string) => void = () => undefined;
  onCommand: (uid: string, type: string) => void = () => undefined;
  selfUid = "";
  protected replaceAll(table: Record<string, unknown>): void {
    this.state.lock = table.lock === true || table.lock === 1;
    const notice = table.notice as { text: string; at: number } | undefined;
    this.state.notice = notice || null;
    const commands = (table.cmd || {}) as Record<string, { type: string; at: number }>;
    Object.keys(commands).forEach((uid) => this.command(uid, commands[uid], false));
  }
  protected setOne(rest: string[], value: unknown): void {
    if (rest[0] === "lock") this.state.lock = value === true || value === 1;
    else if (rest[0] === "notice") { this.state.notice = (value as { text: string; at: number }) || null; if (this.state.notice) this.onNotice(this.state.notice.text); }
    else if (rest[0] === "cmd" && rest.length >= 2) this.command(rest[1], value as { type: string; at: number }, true);
  }
  private command(uid: string, value: { type: string; at: number } | null, live: boolean): void {
    if (!value) { delete this.state.commands[uid]; return; }
    this.state.commands[uid] = value;
    if (live && uid === this.selfUid) this.onCommand(uid, value.type);
  }
}

class FrClockNode implements FrNode {
  constructor(private readonly clock: FrClockSync) {}
  apply(rest: string[], value: unknown): void {
    if (rest.length === 0) { if (value && typeof value === "object") this.clock.remoteState(value as FrClockState); return; }
    this.clock.remoteField(rest[0], value);
  }
}

class FrSyncHub implements FrStreamSink {
  private readonly nodes: Record<string, FrNode> = {};
  private stop: () => void = () => undefined;

  register(name: string, node: FrNode): void { this.nodes[name] = node; }

  onValue(path: string[], value: unknown): void {
    if (path.length === 0) {
      const table = (value || {}) as Record<string, unknown>;
      Object.keys(this.nodes).forEach((name) => this.nodes[name].apply([], table[name] === undefined ? null : table[name]));
      return;
    }
    const node = this.nodes[path[0]];
    if (node) node.apply(path.slice(1), value);
  }

  start(backend: FrBackend, island: string): void { this.stop = backend.listen("forest/" + island, this); }
  close(): void { this.stop(); }
}

class FrPresencePublisher {
  static readonly REFRESH_MS = 30000;
  private last = 0;
  private lastKey = "";

  constructor(private readonly backend: FrBackend, private readonly island: string, private readonly uid: string) {}

  private path(): string { return "forest/" + this.island + "/presence/" + this.uid; }

  async publish(area: string, sleeping: boolean, day: number, force: boolean): Promise<void> {
    const key = area + "|" + sleeping + "|" + day;
    const due = Date.now() - this.last >= FrPresencePublisher.REFRESH_MS;
    if (!force && !due && key === this.lastKey) return;
    this.last = Date.now();
    this.lastKey = key;
    await this.backend.set(this.path(), { a: area, s: sleeping ? 1 : 0, d: day, at: { ".sv": "timestamp" } });
  }

  async leave(): Promise<void> { await this.backend.set(this.path(), null); await this.backend.set("forest/" + this.island + "/pos/" + this.uid, null); }
}

class FrPosePublisher {
  static readonly INTERVAL_MS = 500;
  static readonly MAX_ERROR = 0.9;
  static readonly VELOCITY_CHANGE = 0.8;
  static readonly MAX_SILENCE_MS = 3000;
  private last = 0;
  private sent: { x: number; z: number; vx: number; vz: number; anim: number; dir: number } | null = null;

  constructor(private readonly backend: FrBackend, private readonly island: string, private readonly uid: string) {}

  send(x: number, z: number, y: number, facing: number, anim: number, vx: number, vz: number): void {
    const now = Date.now();
    if (now - this.last < FrPosePublisher.INTERVAL_MS) return;
    if (!this.needsSend(x, z, facing, anim, vx, vz, now)) return;
    this.sent = { x, z, vx, vz, anim, dir: facing };
    this.last = now;
    void this.backend.set("forest/" + this.island + "/pos/" + this.uid, FrWire.encodePose(x, z, y, facing, anim, vx, vz));
  }

  private needsSend(x: number, z: number, facing: number, anim: number, vx: number, vz: number, now: number): boolean {
    const sent = this.sent;
    if (!sent) return true;
    if (sent.anim !== anim) return true;
    const moving = Math.hypot(vx, vz) > 0.05, wasMoving = Math.hypot(sent.vx, sent.vz) > 0.05;
    if (moving !== wasMoving) return true;
    if (!moving) return Math.hypot(x - sent.x, z - sent.z) > 0.2 || Math.abs(facing - sent.dir) > 0.4;
    const elapsed = (now - this.last) / 1000;
    const predictedX = sent.x + sent.vx * elapsed, predictedZ = sent.z + sent.vz * elapsed;
    if (Math.hypot(x - predictedX, z - predictedZ) > FrPosePublisher.MAX_ERROR) return true;
    if (Math.hypot(vx - sent.vx, vz - sent.vz) > FrPosePublisher.VELOCITY_CHANGE) return true;
    return now - this.last > FrPosePublisher.MAX_SILENCE_MS;
  }
}

class FrMemberWriter {
  constructor(private readonly backend: FrBackend, private readonly island: string) {}

  static studentNumber(name: string): number {
    const match = /^(\d+)/.exec(name);
    return match ? Number(match[1]) : 0;
  }

  static numberFor(uid: string, accountName: string): number {
    const fromName = FrMemberWriter.studentNumber(accountName);
    if (fromName > 0) return fromName;
    let hash = 0;
    for (let i = 0; i < uid.length; i++) hash = (Math.imul(hash, 31) + uid.charCodeAt(i)) | 0;
    return 90000 + (Math.abs(hash) % 9000);
  }

  async write(uid: string, accountName: string, nick: string, look: unknown, adm: boolean): Promise<void> {
    await this.backend.set("forest/" + this.island + "/members/" + uid, { no: FrMemberWriter.numberFor(uid, accountName), name: nick, look, adm: adm ? 1 : 0 });
  }
}
