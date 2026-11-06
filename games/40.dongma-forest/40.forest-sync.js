"use strict";
class FrWire {
    static pair(value) {
        if (Array.isArray(value))
            return { h: Number(value[0]), t: String(value[1]) };
        if (value && typeof value === "object") {
            const o = value;
            return { h: Number(o["0"]), t: String(o["1"]) };
        }
        return null;
    }
    static encodePose(x, z, y, facing, anim, vx, vz) {
        const dir = ((Math.round((facing / (Math.PI * 2)) * 16) % 16) + 16) % 16;
        return Math.round(x * 10) + "," + Math.round(z * 10) + "," + Math.round(y * 10) + "," + dir + "," + anim + "," + Math.round(vx * 10) + "," + Math.round(vz * 10);
    }
    static decodePose(text) {
        if (typeof text !== "string")
            return null;
        const p = text.split(",").map(Number);
        if (p.length < 5 || p.some((n) => !isFinite(n)))
            return null;
        return { x: p[0] / 10, z: p[1] / 10, y: p[2] / 10, dir: (p[3] / 16) * Math.PI * 2, anim: p[4], vx: (p[5] || 0) / 10, vz: (p[6] || 0) / 10, at: Date.now() };
    }
}
FrWire.ANIMS = ["idle", "run", "walk", "chop", "pickaxe", "dig", "sleep", "fish", "work"];
class FrRoster {
    constructor() {
        this.members = new Map();
        this.presence = new Map();
        this.poses = new Map();
        this.listeners = [];
        this.serverNow = () => Date.now();
    }
    onChange(listener) { this.listeners.push(listener); }
    changed() { this.listeners.forEach((l) => l()); }
    alive(uid) {
        const row = this.presence.get(uid);
        return !!row && this.serverNow() - row.at < FrRoster.STALE_MS;
    }
    aliveUids() { return Array.from(this.presence.keys()).filter((uid) => this.alive(uid)); }
    asPresences(day, selfUid, self) {
        const list = [self];
        this.aliveUids().forEach((uid) => {
            if (uid === selfUid)
                return;
            const row = this.presence.get(uid);
            const member = this.members.get(uid);
            if (member && member.adm)
                return;
            list.push({ uid, name: member ? member.name : "?", area: row.area, sleeping: row.sleeping, actedToday: row.day === day });
        });
        return list;
    }
    sleepRows(day, self) {
        const rows = [self];
        this.members.forEach((member, uid) => {
            if (uid === self.uid || member.adm)
                return;
            const row = this.presence.get(uid);
            const online = !!row && this.alive(uid);
            const area = row ? row.area : "island";
            rows.push({ uid, no: member.no, name: member.name, state: FrRoster.sleepStateOf(online, row, day), area, self: false });
        });
        return rows.sort((a, b) => a.no - b.no || a.name.localeCompare(b.name));
    }
    static sleepStateOf(online, row, day) {
        if (!online || !row)
            return "offline";
        if (row.sleeping)
            return "asleep";
        if (row.day !== day)
            return "idle";
        return FrSleepVote.canSleep(FrBalance.DUSK_MINUTE, row.area) ? "awake" : "away";
    }
}
FrRoster.STALE_MS = 75000;
class FrMapNode {
    apply(rest, value) {
        if (rest.length === 0) {
            const table = (value || {});
            this.replaceAll(table);
            return;
        }
        this.setOne(rest, value);
    }
}
class FrJungleNode extends FrMapNode {
    constructor(world) {
        super();
        this.world = world;
    }
    replaceAll(table) { Object.keys(table).forEach((k) => this.world.remoteFelled(Number(k))); }
    setOne(rest, value) { if (value === 1)
        this.world.remoteFelled(Number(rest[0])); }
}
class FrTerrainNode extends FrMapNode {
    constructor(world) {
        super();
        this.world = world;
    }
    replaceAll(table) { Object.keys(table).forEach((chunk) => this.setOne([chunk], table[chunk])); }
    setOne(rest, value) {
        if (rest.length === 1) {
            const cells = (value || {});
            Object.keys(cells).forEach((cell) => this.setOne([rest[0], cell], cells[cell]));
            return;
        }
        const edit = FrWire.pair(value);
        if (edit)
            this.world.remoteTerrain(Number(rest[1]), edit);
    }
}
class FrSnowNode extends FrMapNode {
    constructor(world) {
        super();
        this.world = world;
    }
    replaceAll(table) { Object.keys(table).forEach((k) => this.world.remoteSnow(Number(k), Number(table[k]))); }
    setOne(rest, value) { this.world.remoteSnow(Number(rest[0]), value === null ? null : Number(value)); }
}
class FrBuildNode extends FrMapNode {
    constructor(world) {
        super();
        this.world = world;
    }
    replaceAll(table) { Object.keys(table).forEach((k) => this.world.remoteBuilt(k)); }
    setOne(rest, value) { if (value !== null)
        this.world.remoteBuilt(rest[0]);
    else
        this.world.remoteUnbuilt(rest[0]); }
}
class FrPublicNode extends FrMapNode {
    constructor(world) {
        super();
        this.world = world;
        this.known = new Set();
    }
    replaceAll(table) {
        this.known.forEach((id) => { if (table[id] === undefined)
            this.world.remotePublic(id, 0); });
        this.known = new Set(Object.keys(table));
        Object.keys(table).forEach((id) => this.world.remotePublic(id, Number(table[id])));
    }
    setOne(rest, value) {
        this.known.add(rest[0]);
        this.world.remotePublic(rest[0], value === null ? 0 : Number(value));
    }
}
class FrBlocksNode extends FrMapNode {
    constructor(world) {
        super();
        this.world = world;
    }
    replaceAll(table) { Object.keys(table).forEach((chunk) => this.setOne([chunk], table[chunk])); }
    setOne(rest, value) {
        if (rest.length === 1) {
            const cells = (value || {});
            Object.keys(cells).forEach((key) => this.setOne([rest[0], key], cells[key]));
            return;
        }
        const parsed = FrBlockKey.parse(rest[1]);
        const record = value && typeof value === "object" ? value : null;
        this.world.remoteBlock(parsed.index, parsed.y, record);
    }
}
class FrFarmNode extends FrMapNode {
    constructor(world) {
        super();
        this.world = world;
        this.known = new Set();
    }
    replaceAll(table) {
        const now = new Set(Object.keys(table).map(Number));
        this.known.forEach((i) => { if (!now.has(i))
            this.world.remoteFarm(i, null); });
        this.known = now;
        Object.keys(table).forEach((k) => this.world.remoteFarm(Number(k), table[k]));
    }
    setOne(rest, value) {
        const index = Number(rest[0]);
        if (value && typeof value === "object") {
            this.known.add(index);
            this.world.remoteFarm(index, value);
        }
        else {
            this.known.delete(index);
            this.world.remoteFarm(index, null);
        }
    }
}
class FrLotsNode extends FrMapNode {
    constructor(world) {
        super();
        this.world = world;
    }
    replaceAll(table) {
        const keep = new Set(Object.keys(table).map(Number));
        Array.from(this.world.lots.keys()).forEach((n) => { if (!keep.has(n))
            this.world.remoteLot(n, null); });
        Object.keys(table).forEach((n) => this.world.remoteLot(Number(n), table[n]));
    }
    setOne(rest, value) { this.world.remoteLot(Number(rest[0]), value && typeof value === "object" ? value : null); }
}
class FrLogNode extends FrMapNode {
    constructor(world) {
        super();
        this.world = world;
    }
    replaceAll(table) { Object.keys(table).sort().forEach((k) => this.setOne([k], table[k])); }
    setOne(rest, value) { if (value)
        this.world.remoteLog(rest[0], value); }
}
class FrMembersNode extends FrMapNode {
    constructor(roster) {
        super();
        this.roster = roster;
    }
    replaceAll(table) { Object.keys(table).forEach((uid) => this.put(uid, table[uid])); this.roster.changed(); }
    setOne(rest, value) { if (rest.length === 1)
        this.put(rest[0], value); this.roster.changed(); }
    put(uid, value) {
        if (!value || typeof value !== "object") {
            this.roster.members.delete(uid);
            return;
        }
        const v = value;
        this.roster.members.set(uid, { no: Number(v.no) || 0, name: String(v.name || "?"), look: v.look || null, adm: v.adm === 1 || v.adm === true });
    }
}
class FrPresenceNode extends FrMapNode {
    constructor(roster) {
        super();
        this.roster = roster;
    }
    replaceAll(table) {
        this.roster.presence.clear();
        Object.keys(table).forEach((uid) => this.put(uid, table[uid]));
        this.roster.changed();
    }
    setOne(rest, value) {
        if (rest.length === 1)
            this.put(rest[0], value);
        else {
            const row = this.roster.presence.get(rest[0]);
            if (row)
                this.field(row, rest[1], value);
        }
        this.roster.changed();
    }
    put(uid, value) {
        if (!value || typeof value !== "object") {
            this.roster.presence.delete(uid);
            this.roster.poses.delete(uid);
            return;
        }
        const v = value;
        this.roster.presence.set(uid, { area: String(v.a || "island"), sleeping: v.s === 1, day: Number(v.d) || 0, at: Number(v.at) || 0 });
    }
    field(row, name, value) {
        if (name === "a")
            row.area = String(value);
        else if (name === "s")
            row.sleeping = value === 1;
        else if (name === "d")
            row.day = Number(value) || 0;
        else if (name === "at")
            row.at = Number(value) || 0;
    }
}
class FrPoseNode extends FrMapNode {
    constructor(roster) {
        super();
        this.roster = roster;
    }
    replaceAll(table) {
        this.roster.poses.clear();
        Object.keys(table).forEach((uid) => this.put(uid, table[uid]));
    }
    setOne(rest, value) { this.put(rest[0], value); }
    put(uid, value) {
        const pose = FrWire.decodePose(value);
        if (pose)
            this.roster.poses.set(uid, pose);
        else
            this.roster.poses.delete(uid);
    }
}
class FrAdminNode extends FrMapNode {
    constructor() {
        super(...arguments);
        this.state = { notice: null, lock: false, commands: {} };
        this.onNotice = () => undefined;
        this.onCommand = () => undefined;
        this.selfUid = "";
    }
    replaceAll(table) {
        this.state.lock = table.lock === true || table.lock === 1;
        const notice = table.notice;
        this.state.notice = notice || null;
        const commands = (table.cmd || {});
        Object.keys(commands).forEach((uid) => this.command(uid, commands[uid], false));
    }
    setOne(rest, value) {
        if (rest[0] === "lock")
            this.state.lock = value === true || value === 1;
        else if (rest[0] === "notice") {
            this.state.notice = value || null;
            if (this.state.notice)
                this.onNotice(this.state.notice.text);
        }
        else if (rest[0] === "cmd" && rest.length >= 2)
            this.command(rest[1], value, true);
    }
    command(uid, value, live) {
        if (!value) {
            delete this.state.commands[uid];
            return;
        }
        this.state.commands[uid] = value;
        if (live && uid === this.selfUid)
            this.onCommand(uid, value.type, value.id || "", value.n || 0);
    }
}
class FrClockNode {
    constructor(clock) {
        this.clock = clock;
    }
    apply(rest, value) {
        if (rest.length === 0) {
            if (value && typeof value === "object")
                this.clock.remoteState(value);
            return;
        }
        this.clock.remoteField(rest[0], value);
    }
}
class FrSyncHub {
    constructor() {
        this.nodes = {};
        this.stop = () => undefined;
    }
    register(name, node) { this.nodes[name] = node; }
    onValue(path, value) {
        if (path.length === 0) {
            const table = (value || {});
            Object.keys(this.nodes).forEach((name) => this.nodes[name].apply([], table[name] === undefined ? null : table[name]));
            return;
        }
        const node = this.nodes[path[0]];
        if (node)
            node.apply(path.slice(1), value);
    }
    start(backend, island) { this.stop = backend.listen("forest/" + island, this); }
    close() { this.stop(); }
}
class FrPresencePublisher {
    constructor(backend, island, uid) {
        this.backend = backend;
        this.island = island;
        this.uid = uid;
        this.last = 0;
        this.lastKey = "";
    }
    path() { return "forest/" + this.island + "/presence/" + this.uid; }
    async publish(area, sleeping, day, force) {
        const key = area + "|" + sleeping + "|" + day;
        const due = Date.now() - this.last >= FrPresencePublisher.REFRESH_MS;
        if (!force && !due && key === this.lastKey)
            return;
        this.last = Date.now();
        this.lastKey = key;
        await this.backend.set(this.path(), { a: area, s: sleeping ? 1 : 0, d: day, at: { ".sv": "timestamp" } });
    }
    async leave() { await this.backend.set(this.path(), null); await this.backend.set("forest/" + this.island + "/pos/" + this.uid, null); }
}
FrPresencePublisher.REFRESH_MS = 30000;
class FrPosePublisher {
    constructor(backend, island, uid) {
        this.backend = backend;
        this.island = island;
        this.uid = uid;
        this.last = 0;
        this.sent = null;
    }
    send(x, z, y, facing, anim, vx, vz) {
        const now = Date.now();
        if (now - this.last < FrPosePublisher.INTERVAL_MS)
            return;
        if (!this.needsSend(x, z, facing, anim, vx, vz, now))
            return;
        this.sent = { x, z, vx, vz, anim, dir: facing };
        this.last = now;
        void this.backend.set("forest/" + this.island + "/pos/" + this.uid, FrWire.encodePose(x, z, y, facing, anim, vx, vz));
    }
    needsSend(x, z, facing, anim, vx, vz, now) {
        const sent = this.sent;
        if (!sent)
            return true;
        if (sent.anim !== anim)
            return true;
        const moving = Math.hypot(vx, vz) > 0.05, wasMoving = Math.hypot(sent.vx, sent.vz) > 0.05;
        if (moving !== wasMoving)
            return true;
        if (!moving)
            return Math.hypot(x - sent.x, z - sent.z) > 0.2 || Math.abs(facing - sent.dir) > 0.4;
        const elapsed = (now - this.last) / 1000;
        const predictedX = sent.x + sent.vx * elapsed, predictedZ = sent.z + sent.vz * elapsed;
        if (Math.hypot(x - predictedX, z - predictedZ) > FrPosePublisher.MAX_ERROR)
            return true;
        if (Math.hypot(vx - sent.vx, vz - sent.vz) > FrPosePublisher.VELOCITY_CHANGE)
            return true;
        return now - this.last > FrPosePublisher.MAX_SILENCE_MS;
    }
}
FrPosePublisher.INTERVAL_MS = 500;
FrPosePublisher.MAX_ERROR = 0.9;
FrPosePublisher.VELOCITY_CHANGE = 0.8;
FrPosePublisher.MAX_SILENCE_MS = 3000;
class FrMemberWriter {
    constructor(backend, island) {
        this.backend = backend;
        this.island = island;
    }
    static studentNumber(name) {
        const match = /^(\d+)/.exec(name);
        return match ? Number(match[1]) : 0;
    }
    static numberFor(uid, accountName) {
        const fromName = FrMemberWriter.studentNumber(accountName);
        if (fromName > 0)
            return fromName;
        let hash = 0;
        for (let i = 0; i < uid.length; i++)
            hash = (Math.imul(hash, 31) + uid.charCodeAt(i)) | 0;
        return 90000 + (Math.abs(hash) % 9000);
    }
    async write(uid, accountName, nick, look, adm) {
        await this.backend.set("forest/" + this.island + "/members/" + uid, { no: FrMemberWriter.numberFor(uid, accountName), name: nick, look, adm: adm ? 1 : 0 });
    }
}
