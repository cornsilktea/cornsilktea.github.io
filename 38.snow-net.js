"use strict";
class SnRoomRules {
    static teamOfSlot(mode, slot) { return mode === "duos" ? Math.floor(slot / 2) : slot; }
}
SnRoomRules.ROOT = "snowroyale/rooms";
SnRoomRules.SEATS = 6;
SnRoomRules.SPECTATOR_SLOT = 9;
SnRoomRules.RULES = { root: SnRoomRules.ROOT, seatCount: SnRoomRules.SEATS, spectatorSlot: SnRoomRules.SPECTATOR_SLOT, seatOrder: [0, 2, 4, 1, 3, 5], spectatorLimit: 12 };
SnRoomRules.VALUES = ["mode", "match", "snap", "wall", "loot", "snowmap", "ev", "end", "vsAt"];
SnRoomRules.SEND_MS = 100;
SnRoomRules.KEEPALIVE_MS = 1000;
SnRoomRules.SNOWMAP_MS = 5000;
SnRoomRules.EVENT_HISTORY = 3;
class SnStateCodec {
    static encode(s) {
        const angle = (a) => (a === null ? SnStateCodec.AUTO : Math.round(a * 1000));
        return [Math.round(s.x * 100), Math.round(s.z * 100), Math.round(s.yaw * 100), Math.round(s.mx * 100), Math.round(s.mz * 100), s.holdK ? 1 : 0,
            s.attackSeq, angle(s.attackAngle), s.wallSeq, angle(s.wallAngle), s.dropSeq, Math.round(s.dropX * 10), Math.round(s.dropZ * 10), s.match].join(",");
    }
    static decode(raw) {
        const v = raw.split(",").map(Number);
        if (v.length < 14 || v.some((n) => !isFinite(n)))
            return null;
        const angle = (n) => (n === SnStateCodec.AUTO ? null : n / 1000);
        return { x: v[0] / 100, z: v[1] / 100, yaw: v[2] / 100, mx: v[3] / 100, mz: v[4] / 100, holdK: v[5] === 1, attackSeq: v[6], attackAngle: angle(v[7]), wallSeq: v[8], wallAngle: angle(v[9]), dropSeq: v[10], dropX: v[11] / 10, dropZ: v[12] / 10, match: v[13] };
    }
}
SnStateCodec.AUTO = 9999;
class SnEventSlimmer {
    static slim(ev) {
        const copy = Object.assign({}, ev);
        for (const key of Object.keys(copy)) {
            const v = copy[key];
            if (typeof v === "number" && !Number.isInteger(v))
                copy[key] = Math.round(v * 100) / 100;
        }
        return copy;
    }
}
class SnRemotePilot {
    constructor() {
        this.bot = false;
        this.current = null;
        this.seenAttack = 0;
        this.seenWall = 0;
        this.seenDrop = 0;
        this.pendingAttack = undefined;
    }
    decide(engine, me) {
        const intent = SnIdleIntent.make();
        const s = this.current;
        if (!s)
            return intent;
        if (me.life === "sky") {
            intent.moveX = s.mx;
            intent.moveZ = s.mz;
        }
        intent.holdK = s.holdK;
        if (s.attackSeq > this.seenAttack) {
            this.seenAttack = s.attackSeq;
            this.pendingAttack = s.attackAngle;
        }
        if (this.pendingAttack !== undefined && engine.time >= me.nextShotAt) {
            intent.attack = true;
            intent.attackAngle = this.pendingAttack;
            this.pendingAttack = undefined;
        }
        if (s.wallSeq > this.seenWall) {
            this.seenWall = s.wallSeq;
            intent.wall = true;
            intent.wallAngle = s.wallAngle;
        }
        if (s.dropSeq > this.seenDrop) {
            this.seenDrop = s.dropSeq;
            intent.dropPick = { x: s.dropX, z: s.dropZ };
        }
        return intent;
    }
}
class SnNetMeter {
    constructor() {
        this.bytes = 0;
        this.since = performance.now();
        this.rate = 0;
    }
    sent(text) { this.bytes += text.length; }
    tick(nowMs) {
        if (nowMs - this.since < 1000)
            return;
        this.rate = this.bytes * 1000 / (nowMs - this.since);
        this.bytes = 0;
        this.since = nowMs;
    }
}
class SnHostDirector {
    constructor(engine, session, match, meter) {
        this.engine = engine;
        this.session = session;
        this.match = match;
        this.meter = meter;
        this.remote = new Map();
        this.sent = new Map();
        this.pending = [];
        this.history = [];
        this.seq = 0;
        this.lastSendMs = 0;
        this.lastSnowMs = 0;
        this.lastState = new Map();
        this.endWritten = false;
    }
    receiveState(num, raw, nowMs) {
        const pilot = this.remote.get(num);
        const decoded = SnStateCodec.decode(raw);
        if (!pilot || !decoded || decoded.match !== this.match.id)
            return;
        pilot.current = decoded;
        const last = this.lastState.get(num) || nowMs - 100;
        this.lastState.set(num, nowMs);
        this.engine.placeExternal(num, decoded.x, decoded.z, decoded.yaw, (nowMs - last) / 1000);
    }
    collect(events) { events.forEach((ev) => this.pending.push(SnEventSlimmer.slim(ev))); }
    publish(nowMs) {
        if (nowMs - this.lastSendMs < SnRoomRules.SEND_MS)
            return;
        this.lastSendMs = nowMs;
        const e = this.engine;
        const snap = JSON.stringify({ t: Math.round(e.time * 100) / 100, p: e.players.map((p) => SnSnapshotCodec.encodePlayer(p, e.time)), m: SnSnapshotCodec.encodeTeams(e.teams) });
        this.write("snap", snap, true);
        this.writeIfChanged("wall", SnSnapshotCodec.encodeWalls(e.walls));
        this.writeIfChanged("loot", SnSnapshotCodec.encodeLoot(e.crates, e.piles));
        if (nowMs - this.lastSnowMs > SnRoomRules.SNOWMAP_MS) {
            this.lastSnowMs = nowMs;
            this.writeIfChanged("snowmap", SnSnapshotCodec.encodeSnow(e.snow.amount));
        }
        if (this.pending.length) {
            this.seq++;
            this.history.push([this.seq, this.pending.splice(0)]);
            while (this.history.length > SnRoomRules.EVENT_HISTORY)
                this.history.shift();
            this.write("ev", JSON.stringify({ s: this.seq, b: this.history.slice() }), true);
        }
        if (e.ended && !this.endWritten)
            this.writeEnd();
    }
    writeEnd() {
        this.endWritten = true;
        const e = this.engine;
        const end = { match: this.match.id, ranks: e.ranks(), stats: e.players.map((p) => [p.kills, p.dealt, p.collected, Math.round(e.survival(p) * 10) / 10, p.walls, p.assists]), at: Date.now() };
        this.session.ref.update({ end, status: "ended" });
    }
    writeIfChanged(name, text) {
        if (this.sent.get(name) === text)
            return;
        this.write(name, text, false);
    }
    write(name, text, always) {
        if (!always)
            this.sent.set(name, text);
        this.meter.sent(text);
        this.session.writeValue(name, text);
    }
}
class SnShotGhost {
    constructor(id, x, z, angle, big, level) {
        this.id = id;
        this.x = x;
        this.z = z;
        this.big = big;
        this.level = level;
        this.traveled = 0;
        this.done = false;
        this.dirX = Math.cos(angle);
        this.dirZ = Math.sin(angle);
    }
    step(dt) {
        const v = (this.big ? SnBalance.BIG.speed : SnBalance.SHOT.speed) * dt;
        this.x += this.dirX * v;
        this.z += this.dirZ * v;
        this.traveled += v;
        if (this.traveled > (this.big ? SnBalance.BIG.distance : SnBalance.SHOT.range * 1.3) + 1)
            this.done = true;
    }
}
class SnMirror {
    constructor(match, myNum) {
        this.match = match;
        this.myNum = myNum;
        this.shots = [];
        this.snapRaw = "";
        this.snapTime = 0;
        this.snapAtMs = 0;
        this.lastSeq = 0;
        this.wallRaw = "";
        this.lootRaw = "";
        this.snowRaw = "";
        this.lastPos = new Map();
        this.received = false;
        this.engine = new SnEngine({ seed: match.seed, mode: match.mode, teams: match.teams });
    }
    get time() { return this.engine.time; }
    get mode() { return this.engine.mode; }
    get players() { return this.engine.players; }
    get walls() { return this.engine.walls; }
    get crates() { return this.engine.crates; }
    get piles() { return this.engine.piles; }
    stormNow() { return this.engine.stormNow(); }
    advance(nowMs, dt) {
        if (this.received)
            this.engine.time = this.snapTime + Math.min(0.4, (nowMs - this.snapAtMs) / 1000);
        for (const s of this.shots)
            s.step(dt);
        for (let k = this.shots.length - 1; k >= 0; k--)
            if (this.shots[k].done)
                this.shots.splice(k, 1);
    }
    applySnap(raw, nowMs, keepMine) {
        if (!raw || raw === this.snapRaw)
            return;
        this.snapRaw = raw;
        let data;
        try {
            data = JSON.parse(raw);
        }
        catch (error) {
            return;
        }
        this.received = true;
        this.snapTime = data.t;
        this.snapAtMs = nowMs;
        data.p.forEach((text, num) => {
            const p = this.engine.players[num];
            if (!p)
                return;
            const d = SnSnapshotCodec.decodePlayer(text);
            const mine = keepMine && num === this.myNum;
            const hostOwnsBody = d.life !== "alive" || d.building || d.knocked || p.life !== "alive";
            if (!mine || hostOwnsBody) {
                const prev = this.lastPos.get(num);
                if (prev && data.t > prev.t) {
                    p.vx = (d.x - prev.x) / (data.t - prev.t);
                    p.vz = (d.z - prev.z) / (data.t - prev.t);
                }
                this.lastPos.set(num, { x: d.x, z: d.z, t: data.t });
                p.x = d.x;
                p.z = d.z;
                if (!mine)
                    p.yaw = d.yaw;
            }
            p.life = d.life;
            p.hp = d.hp;
            d.gear.forEach((g, k) => { p.gear[k] = g; });
            p.bigBall = d.bigBall;
            p.kills = d.kills;
            p.revivesUsed = d.revivesUsed;
            p.reviveTarget = d.reviveTarget;
            p.reviveProgress = d.reviveProgress;
            p.landAt = d.landAt;
            p.killedBy = d.killedBy;
            p.buildUntil = d.building ? data.t + 0.2 : 0;
            p.guardUntil = d.guarded ? data.t + 0.2 : 0;
            p.knockLeft = d.knocked ? 0.1 : 0;
        });
        SnSnapshotCodec.decodeTeams(data.m).forEach((t, k) => {
            const team = this.engine.teams[k];
            if (!team)
                return;
            team.snow = t.snow;
            team.outTick = t.outTick;
            team.dropAt = t.dropAt;
            team.dropX = t.dropX;
            team.dropZ = t.dropZ;
        });
    }
    applyWalls(raw) {
        const text = raw || "";
        if (text === this.wallRaw)
            return;
        this.wallRaw = text;
        const fresh = SnSnapshotCodec.decodeWalls(text);
        this.engine.walls.length = 0;
        fresh.forEach((w) => this.engine.walls.push(w));
    }
    applyLoot(raw) {
        if (!raw || raw === this.lootRaw)
            return;
        this.lootRaw = raw;
        SnSnapshotCodec.applyLoot(raw, this.engine.crates, this.engine.piles);
    }
    applySnowMap(raw) {
        if (!raw || raw === this.snowRaw)
            return [];
        this.snowRaw = raw;
        return SnSnapshotCodec.applySnow(raw, this.engine.snow.amount);
    }
    takeEvents(raw) {
        if (!raw)
            return [];
        let batch;
        try {
            batch = JSON.parse(raw);
        }
        catch (error) {
            return [];
        }
        const fresh = [];
        for (const [seq, list] of batch.b || []) {
            if (seq <= this.lastSeq)
                continue;
            this.lastSeq = seq;
            list.forEach((ev) => fresh.push(ev));
        }
        for (const ev of fresh) {
            if (ev.t === "shot")
                this.shots.push(new SnShotGhost(ev.id, ev.x, ev.z, ev.a, ev.big, ev.lv));
            else if (ev.t === "shotEnd") {
                const s = this.shots.find((x) => x.id === ev.id);
                if (s)
                    s.done = true;
            }
            else if (ev.t === "snow")
                ev.tiles.forEach((idx) => { this.engine.snow.amount[idx] = 0; });
            else if (ev.t === "end")
                this.engine.ended = true;
        }
        return fresh;
    }
    applyEnd(end) {
        if (!end || end.match !== this.match.id)
            return;
        this.engine.ended = true;
        end.stats.forEach((s, num) => {
            const p = this.engine.players[num];
            if (!p)
                return;
            p.kills = s[0];
            p.dealt = s[1];
            p.collected = s[2];
            p.downAt = s[3];
            p.walls = s[4] || 0;
            p.assists = s[5] || 0;
        });
        this.engine.endAt = Math.max(...end.stats.map((s) => s[3]));
    }
}
class SnLocalBody {
    constructor(mirror, num, session, meter) {
        this.mirror = mirror;
        this.num = num;
        this.session = session;
        this.meter = meter;
        this.attackSeq = 0;
        this.wallSeq = 0;
        this.dropSeq = 0;
        this.lastAttackAngle = null;
        this.lastWallAngle = null;
        this.dropX = 0;
        this.dropZ = 0;
        this.lastText = "";
        this.lastSentMs = 0;
        this.mx = 0;
        this.mz = 0;
        this.holdK = false;
    }
    step(intent, dt) {
        const engine = this.mirror.engine, me = engine.players[this.num];
        if (intent.attack) {
            this.attackSeq++;
            this.lastAttackAngle = intent.attackAngle;
            if (intent.attackAngle !== null)
                me.yaw = intent.attackAngle;
        }
        if (intent.wall) {
            this.wallSeq++;
            this.lastWallAngle = intent.wallAngle;
        }
        if (intent.dropPick) {
            this.dropSeq++;
            this.dropX = intent.dropPick.x;
            this.dropZ = intent.dropPick.z;
        }
        this.mx = intent.moveX;
        this.mz = intent.moveZ;
        this.holdK = intent.holdK;
        if (me.life !== "alive" || me.building(engine.time) || me.knockLeft > 0)
            return;
        const ox = me.x, oz = me.z;
        let mx = intent.moveX, mz = intent.moveZ;
        const m = Math.hypot(mx, mz);
        if (m > 1) {
            mx /= m;
            mz /= m;
        }
        if (m > 0.05) {
            engine.mover.walk(me, mx, mz, dt);
            me.yaw = Math.atan2(mz, mx);
        }
        me.vx = (me.x - ox) / Math.max(1e-3, dt);
        me.vz = (me.z - oz) / Math.max(1e-3, dt);
    }
    send(nowMs) {
        if (nowMs - this.lastSentMs < SnRoomRules.SEND_MS)
            return;
        const me = this.mirror.engine.players[this.num];
        const text = SnStateCodec.encode({
            x: me.x, z: me.z, yaw: me.yaw, mx: this.mx, mz: this.mz, holdK: this.holdK,
            attackSeq: this.attackSeq, attackAngle: this.lastAttackAngle, wallSeq: this.wallSeq, wallAngle: this.lastWallAngle,
            dropSeq: this.dropSeq, dropX: this.dropX, dropZ: this.dropZ, match: this.mirror.match.id,
        });
        if (text === this.lastText && nowMs - this.lastSentMs < SnRoomRules.KEEPALIVE_MS)
            return;
        this.lastText = text;
        this.lastSentMs = nowMs;
        this.meter.sent(text);
        this.session.writeState(text);
    }
}
