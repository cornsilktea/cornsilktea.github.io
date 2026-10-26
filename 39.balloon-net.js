"use strict";
class WbRoomRules {
    static teamOfSlot(mode, slot) { return mode === "team" ? Math.floor(slot / WbBalance.TEAM_SIZE) : slot; }
}
WbRoomRules.ROOT = "waterballoon/rooms";
WbRoomRules.SEATS = 8;
WbRoomRules.SPECTATOR_SLOT = 9;
WbRoomRules.RULES = { root: WbRoomRules.ROOT, seatCount: WbRoomRules.SEATS, spectatorSlot: WbRoomRules.SPECTATOR_SLOT, seatOrder: [0, 2, 4, 6, 1, 3, 5, 7], spectatorLimit: 12 };
WbRoomRules.VALUES = ["mode", "map", "level", "bots", "match", "snap", "ev", "board", "end"];
WbRoomRules.SEND_MS = 100;
WbRoomRules.KEEPALIVE_MS = 1000;
WbRoomRules.BOARD_MS = 2000;
WbRoomRules.EVENT_HISTORY = 3;
class WbStateCodec {
    static encode(s) {
        return [Math.round(s.x * 1000), Math.round(s.z * 1000), s.face, s.move, s.alt, s.kPress, s.match].join(",");
    }
    static decode(raw) {
        const v = raw.split(",").map(Number);
        if (v.length < 7 || v.some((n) => !isFinite(n)))
            return null;
        return { x: v[0] / 1000, z: v[1] / 1000, face: v[2], move: v[3], alt: v[4], kPress: v[5], match: v[6] };
    }
}
class WbRemotePilot {
    constructor() {
        this.bot = false;
        this.kPress = 0;
    }
    decide() { return { move: WbDir.NONE, alt: WbDir.NONE, kPress: this.kPress }; }
}
class WbNetMeter {
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
class WbHostLink {
    constructor(engine, session, match, meter) {
        this.engine = engine;
        this.session = session;
        this.match = match;
        this.meter = meter;
        this.remote = new Map();
        this.pending = [];
        this.history = [];
        this.lastHeard = new Map();
        this.seq = 0;
        this.lastSendMs = 0;
        this.lastBoardMs = 0;
        this.lastBoard = "";
        this.endWritten = false;
    }
    receive(index, raw, nowMs) {
        const pilot = this.remote.get(index);
        const s = WbStateCodec.decode(raw);
        if (!pilot || !s || s.match !== this.match.id)
            return;
        pilot.kPress = Math.max(pilot.kPress, s.kPress);
        const last = this.lastHeard.get(index);
        this.lastHeard.set(index, nowMs);
        const elapsed = last === undefined ? WbBalance.DT : (nowMs - last) / 1000;
        this.engine.placeExternal(index, s.x, s.z, s.face, s.move, elapsed);
    }
    collect(events, tick) { for (const ev of events)
        this.pending.push([tick, ev]); }
    publish(nowMs) {
        if (nowMs - this.lastSendMs < WbRoomRules.SEND_MS)
            return;
        this.lastSendMs = nowMs;
        const e = this.engine;
        this.write("snap", JSON.stringify({ t: e.tick, p: e.players.map((p) => WbSnapshotCodec.encodePlayer(p, e)) }));
        if (this.pending.length) {
            this.seq++;
            this.history.push([this.seq, this.pending.splice(0)]);
            while (this.history.length > WbRoomRules.EVENT_HISTORY)
                this.history.shift();
            this.write("ev", JSON.stringify({ s: this.seq, b: this.history.slice() }));
        }
        if (nowMs - this.lastBoardMs > WbRoomRules.BOARD_MS) {
            this.lastBoardMs = nowMs;
            const board = WbSnapshotCodec.encodeBoard(e);
            const body = board.slice(board.indexOf("|"));
            if (body !== this.lastBoard) {
                this.lastBoard = body;
                this.write("board", board);
            }
        }
        if (e.ended && !this.endWritten)
            this.writeEnd();
    }
    writeEnd() {
        this.endWritten = true;
        const e = this.engine;
        const end = { match: this.match.id, ranks: e.ranks.slice(), outTicks: e.players.map((p) => p.outTick), at: Date.now(), stats: e.players.map((p) => [p.kills, p.traps, p.rescues, p.boxes, p.selfKills]), endTick: e.tick };
        this.session.ref.update({ end, status: "ended" });
    }
    write(name, text) {
        this.meter.sent(text);
        this.session.writeValue(name, text);
    }
}
class WbMirror {
    constructor(match, myIndex) {
        this.match = match;
        this.myIndex = myIndex;
        this.hostX = [];
        this.hostZ = [];
        this.ghosts = [];
        this.snapRaw = "";
        this.snapTick = -WbBalance.ticks(WbBalance.COUNTDOWN);
        this.snapAtMs = 0;
        this.lastSeq = 0;
        this.lastEventTick = -1e9;
        this.boardRaw = "";
        this.estimate = -WbBalance.ticks(WbBalance.COUNTDOWN);
        this.nextGhost = -1;
        this.received = false;
        this.engine = new WbEngine({ seed: match.seed, lootSeed: null, mode: match.mode, teams: match.teams });
        this.engine.players.forEach((p) => { this.hostX.push(p.x); this.hostZ.push(p.z); });
    }
    get tick() { return this.engine.tick; }
    get tickTime() { return this.estimate; }
    get mode() { return this.engine.mode; }
    get grid() { return this.engine.grid; }
    get players() { return this.engine.players; }
    get balloons() { return this.ghosts.length ? [...this.engine.balloons, ...this.ghosts.map((g) => g.balloon)] : this.engine.balloons; }
    get floor() { return this.engine.floor; }
    get wetUntil() { return this.engine.wetUntil; }
    get sudden() { return this.engine.sudden; }
    addGhost(i, j, owner, nowMs) {
        if (this.engine.balloonAt(i, j) >= 0 || this.ghosts.some((g) => g.balloon.i === i && g.balloon.j === j))
            return;
        const tick = this.engine.tick;
        const balloon = new WbBalloon(this.nextGhost--, owner, i, j, tick, tick + WbBalance.ticks(WbBalance.FUSE), this.engine.players[owner].range);
        this.ghosts.push({ balloon, until: nowMs + WbMirror.GHOST_MS });
    }
    ghostCount(owner) { return this.ghosts.filter((g) => g.balloon.owner === owner).length; }
    advance(nowMs, dt) {
        if (this.received && !this.engine.ended) {
            const lead = Math.min(WbMirror.MAX_LEAD_TICKS, (nowMs - this.snapAtMs) / 1000 * WbBalance.RATE);
            this.estimate = Math.max(this.estimate, this.snapTick + lead);
            this.engine.tick = Math.floor(this.estimate);
        }
        for (let k = this.ghosts.length - 1; k >= 0; k--)
            if (nowMs > this.ghosts[k].until)
                this.ghosts.splice(k, 1);
        this.slide(dt);
    }
    slide(dt) {
        const e = this.engine;
        for (const b of e.balloons) {
            if (b.slideDir < 0)
                continue;
            const i = b.i + WbDir.DX[b.slideDir], j = b.j + WbDir.DZ[b.slideDir];
            const centerAhead = WbDir.horizontal(b.slideDir) ? (b.x - (b.i + 0.5)) * WbDir.sign(b.slideDir) : (b.z - (b.j + 0.5)) * WbDir.sign(b.slideDir);
            if (centerAhead >= 0 && (e.grid.blocked(i, j) || e.balloonAt(i, j) >= 0)) {
                b.x = b.i + 0.5;
                b.z = b.j + 0.5;
                continue;
            }
            const before = b.cell;
            const step = WbBalance.KICK_SPEED * dt;
            if (WbDir.horizontal(b.slideDir))
                b.x += WbDir.sign(b.slideDir) * step;
            else
                b.z += WbDir.sign(b.slideDir) * step;
            if (b.cell !== before) {
                if (e.balloonCell[before] === b.id)
                    e.balloonCell[before] = -1;
                e.balloonCell[b.cell] = b.id;
            }
        }
    }
    applySnap(raw, nowMs) {
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
        this.snapTick = data.t;
        this.snapAtMs = nowMs;
        if (data.t > this.estimate || data.t < this.estimate - WbMirror.MAX_LEAD_TICKS * 2)
            this.estimate = data.t;
        this.engine.tick = Math.floor(this.estimate);
        data.p.forEach((text, k) => {
            const p = this.engine.players[k];
            if (!p)
                return;
            const mine = k === this.myIndex;
            const keepX = p.x, keepZ = p.z, keepFace = p.face, wasOut = p.life === "out";
            WbSnapshotCodec.applyPlayer(p, text, data.t);
            this.hostX[k] = p.x;
            this.hostZ[k] = p.z;
            p.moving = !mine && Math.abs(p.x - keepX) + Math.abs(p.z - keepZ) > 0.01;
            if (mine) {
                p.x = keepX;
                p.z = keepZ;
                p.face = keepFace;
            }
            if (!wasOut && p.life === "out")
                p.outTick = data.t;
        });
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
            for (const [tick, ev] of list) {
                this.apply(ev, tick);
                this.lastEventTick = Math.max(this.lastEventTick, tick);
                fresh.push(ev);
            }
        }
        return fresh;
    }
    apply(ev, tick) {
        const e = this.engine;
        if (ev.t === "place") {
            const owner = e.players[ev.by];
            const b = new WbBalloon(ev.id, ev.by, ev.i, ev.j, tick, tick + WbBalance.ticks(WbBalance.FUSE), owner ? owner.range : 1);
            for (const q of e.players)
                if (q.life !== "out" && WbMover.overlapsCell(q, ev.i, ev.j))
                    b.passers.add(q.index);
            e.balloons.push(b);
            e.balloonCell[WbGrid.index(ev.i, ev.j)] = b.id;
            const ghost = this.ghosts.findIndex((g) => g.balloon.owner === ev.by && g.balloon.i === ev.i && g.balloon.j === ev.j);
            if (ghost >= 0)
                this.ghosts.splice(ghost, 1);
        }
        else if (ev.t === "kick") {
            const b = e.balloonById(ev.id);
            if (b)
                b.slideDir = ev.dir;
        }
        else if (ev.t === "slideStop") {
            const b = e.balloonById(ev.id);
            if (b) {
                if (e.balloonCell[b.cell] === b.id)
                    e.balloonCell[b.cell] = -1;
                b.slideDir = WbDir.NONE;
                b.x = ev.i + 0.5;
                b.z = ev.j + 0.5;
                e.balloonCell[b.cell] = b.id;
            }
        }
        else if (ev.t === "blast") {
            const b = e.balloonById(ev.id);
            if (b)
                e.removeBalloon(b);
            const until = tick + WbBalance.ticks(WbBalance.FLOW);
            for (const k of ev.cells)
                if (until >= e.wetUntil[k]) {
                    e.wetUntil[k] = until;
                    e.wetOwner[k] = ev.by;
                }
        }
        else if (ev.t === "boxBreak") {
            e.grid.cells[ev.cell] = WbCell.EMPTY;
            if (ev.kind)
                e.floor.set(ev.cell, { kind: ev.kind, grade: ev.grade, tick });
        }
        else if (ev.t === "itemGone" || ev.t === "pick") {
            e.floor.delete(ev.cell);
        }
        else if (ev.t === "suddenDrop") {
            e.grid.cells[ev.cell] = WbCell.WALL;
            e.floor.delete(ev.cell);
            const id = e.balloonCell[ev.cell];
            const b = id >= 0 ? e.balloonById(id) : null;
            if (b)
                e.removeBalloon(b);
        }
        else if (ev.t === "end") {
            e.ended = true;
        }
    }
    applyBoard(raw) {
        if (!raw || raw === this.boardRaw)
            return;
        this.boardRaw = raw;
        const board = WbSnapshotCodec.decodeBoard(raw);
        if (board.tick < this.lastEventTick)
            return;
        const e = this.engine;
        board.cells.forEach((kind, k) => { e.grid.cells[k] = kind; });
        e.floor.clear();
        for (const item of board.items)
            e.floor.set(item.cell, { kind: item.kind, grade: item.grade, tick: board.tick - 1 });
        const keep = new Set(board.balloons.map((b) => b.id));
        for (const b of e.balloons.slice())
            if (!keep.has(b.id))
                e.removeBalloon(b);
        for (const info of board.balloons) {
            if (e.balloonById(info.id))
                continue;
            const b = new WbBalloon(info.id, info.owner, info.i, info.j, board.tick + info.fuseLeft - WbBalance.ticks(WbBalance.FUSE), board.tick + info.fuseLeft, info.range);
            e.balloons.push(b);
            e.balloonCell[b.cell] = b.id;
        }
    }
    applyEnd(end) {
        if (!end || end.match !== this.match.id)
            return;
        const e = this.engine;
        e.ended = true;
        e.ranks = end.ranks.slice();
        end.outTicks.forEach((t, k) => { const p = e.players[k]; if (p)
            p.outTick = t; });
        (end.stats || []).forEach((s, k) => { const p = e.players[k]; if (p) {
            p.kills = s[0];
            p.traps = s[1];
            p.rescues = s[2];
            p.boxes = s[3];
            p.selfKills = s[4];
        } });
    }
}
WbMirror.GHOST_MS = 400;
WbMirror.MAX_LEAD_TICKS = 12;
class WbGuestBody {
    constructor(mirror, index, input, session, meter) {
        this.mirror = mirror;
        this.index = index;
        this.input = input;
        this.session = session;
        this.meter = meter;
        this.lastText = "";
        this.lastSentMs = 0;
        this.lastPress = 0;
        this.offFor = 0;
        const me = mirror.engine.players[index];
        this.body = { x: me.x, z: me.z };
        this.face = me.face;
    }
    position() { return { x: this.body.x, z: this.body.z }; }
    step(dt, nowMs) {
        const e = this.mirror.engine, me = e.players[this.index];
        if (!me)
            return;
        const intent = this.input.intent();
        if (me.life === "out" || e.tick < 0 || e.ended) {
            this.body.x = this.mirror.hostX[this.index];
            this.body.z = this.mirror.hostZ[this.index];
            me.moving = false;
        }
        else {
            const result = WbMover.advance(e, this.index, this.body, intent.move, intent.alt, me.speed() * dt);
            me.moving = result.moved > 0;
            if (intent.move >= 0)
                this.face = result.moved > 0 ? result.dir : intent.move;
            this.correct(dt);
        }
        me.x = this.body.x;
        me.z = this.body.z;
        me.face = this.face;
        if (intent.kPress > this.lastPress) {
            this.lastPress = intent.kPress;
            const active = e.activeBalloons(this.index) + this.mirror.ghostCount(this.index);
            if (me.life === "alive" && active < me.balloonsMax)
                this.mirror.addGhost(Math.floor(this.body.x), Math.floor(this.body.z), this.index, nowMs);
            this.send(nowMs, intent, true);
            return;
        }
        this.send(nowMs, intent, false);
    }
    correct(dt) {
        const hx = this.mirror.hostX[this.index], hz = this.mirror.hostZ[this.index];
        const off = Math.abs(hx - this.body.x) + Math.abs(hz - this.body.z);
        this.offFor = off > WbGuestBody.CORRECT_DISTANCE ? this.offFor + dt : 0;
        if (this.offFor > WbGuestBody.CORRECT_AFTER) {
            this.body.x = hx;
            this.body.z = hz;
            this.offFor = 0;
        }
    }
    send(nowMs, intent, now) {
        if (!now && nowMs - this.lastSentMs < WbRoomRules.SEND_MS)
            return;
        const text = WbStateCodec.encode({ x: this.body.x, z: this.body.z, face: this.face, move: intent.move, alt: intent.alt, kPress: intent.kPress, match: this.mirror.match.id });
        if (!now && text === this.lastText && nowMs - this.lastSentMs < WbRoomRules.KEEPALIVE_MS)
            return;
        this.lastText = text;
        this.lastSentMs = nowMs;
        this.meter.sent(text);
        this.session.writeState(text);
    }
}
WbGuestBody.CORRECT_DISTANCE = 1.0;
WbGuestBody.CORRECT_AFTER = 0.4;
