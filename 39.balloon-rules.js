"use strict";
class WbBalance {
    static ticks(seconds) { return Math.round(seconds * WbBalance.RATE); }
}
WbBalance.RATE = 30;
WbBalance.DT = 1 / 30;
WbBalance.MATCH = 180;
WbBalance.COUNTDOWN = 3;
WbBalance.FUSE = 2.8;
WbBalance.PULSE = 0.8;
WbBalance.PREVIEW = 0.3;
WbBalance.FLOW = 0.5;
WbBalance.TRAP = 5;
WbBalance.TRAP_BLINK = 1.5;
WbBalance.INVULN = 1;
WbBalance.SHIELD = 5;
WbBalance.SPEED_BASE = 2.8;
WbBalance.SPEED_STEP = 0.4;
WbBalance.SHOE_MAX = 5;
WbBalance.TRAP_SPEED = 0.5;
WbBalance.BALLOON_START = 1;
WbBalance.BALLOON_MAX = 6;
WbBalance.RANGE_START = 1;
WbBalance.RANGE_MAX = 7;
WbBalance.NEEDLE_MAX = 2;
WbBalance.KICK_SPEED = 8;
WbBalance.BODY = 0.35;
WbBalance.SLIDE_LIMIT = 0.45;
WbBalance.TURN_MEMORY = 0.25;
WbBalance.CONTACT = 0.6;
WbBalance.PICK_MARGIN = 0.05;
WbBalance.STAT_GAIN = [1, 2, 0];
WbBalance.SUDDEN_START = 120;
WbBalance.SUDDEN_SPAN = 59;
WbBalance.SUDDEN_WARN = 1;
WbBalance.FINAL_COUNT = 5;
WbBalance.MIN_PLAYERS = 4;
WbBalance.MAX_PLAYERS = 8;
WbBalance.TEAM_COUNT = 4;
WbBalance.TEAM_SIZE = 2;
class WbDir {
    static horizontal(d) { return d === WbDir.RIGHT || d === WbDir.LEFT; }
    static sign(d) { return d === WbDir.RIGHT || d === WbDir.DOWN ? 1 : -1; }
    static perpendicular(a, b) { return a >= 0 && b >= 0 && WbDir.horizontal(a) !== WbDir.horizontal(b); }
}
WbDir.NONE = -1;
WbDir.UP = 0;
WbDir.RIGHT = 1;
WbDir.DOWN = 2;
WbDir.LEFT = 3;
WbDir.DX = [0, 1, 0, -1];
WbDir.DZ = [-1, 0, 1, 0];
class WbIdleIntent {
    static make() { return { move: WbDir.NONE, alt: WbDir.NONE, kPress: 0 }; }
}
class WbTurnBuffer {
    constructor() {
        this.held = [];
        this.memory = null;
        this.pressedAt = new Map();
        this.lastGone = null;
    }
    press(dir, body) {
        if (this.held.indexOf(dir) >= 0)
            return;
        this.held.push(dir);
        this.pressedAt.set(dir, { x: body.x, z: body.z });
    }
    release(dir, body, now) {
        const at = this.held.indexOf(dir);
        if (at < 0)
            return;
        const wasMove = at === this.held.length - 1;
        this.held.splice(at, 1);
        const start = this.pressedAt.get(dir);
        this.pressedAt.delete(dir);
        const progressed = !start || (WbDir.horizontal(dir) ? Math.abs(body.x - start.x) : Math.abs(body.z - start.z)) > 0.02;
        if (wasMove && !progressed && this.held.length)
            this.memory = { dir, until: now + WbBalance.TURN_MEMORY };
        else
            this.lastGone = { dir, until: now + WbBalance.TURN_MEMORY };
    }
    clear() { this.held = []; this.memory = null; this.lastGone = null; this.pressedAt.clear(); }
    read(now) {
        const top = this.held.length ? this.held[this.held.length - 1] : WbDir.NONE;
        if (this.memory && (now > this.memory.until || this.held.indexOf(this.memory.dir) >= 0 || !WbDir.perpendicular(this.memory.dir, top)))
            this.memory = null;
        if (this.memory)
            return { move: this.memory.dir, alt: top };
        for (let k = this.held.length - 2; k >= 0; k--)
            if (WbDir.perpendicular(this.held[k], top))
                return { move: top, alt: this.held[k] };
        if (this.lastGone && (now > this.lastGone.until || this.held.indexOf(this.lastGone.dir) >= 0))
            this.lastGone = null;
        const alt = this.lastGone && WbDir.perpendicular(this.lastGone.dir, top) ? this.lastGone.dir : WbDir.NONE;
        return { move: top, alt };
    }
}
class WbMover {
    static nextMark(c, sign) {
        const base = Math.floor(c), frac = c - base;
        let best = Infinity;
        for (let shift = -1; shift <= 1; shift++)
            for (const m of WbMover.MARKS) {
                const d = sign > 0 ? m + shift - frac : frac - (m + shift);
                if (d > WbMover.EPS && d < best)
                    best = d;
            }
        return best;
    }
    static probe(world, who, body, d) {
        const R = WbBalance.BODY, EPS = WbMover.EPS;
        const horiz = WbDir.horizontal(d), sign = WbDir.sign(d);
        const f = horiz ? body.x : body.z, s = horiz ? body.z : body.x;
        const cell = (fi, si) => horiz ? world.blocked(fi, si, who) : world.blocked(si, fi, who);
        const front = f + sign * R;
        const boundary = sign > 0 ? Math.ceil(front - EPS) : Math.floor(front + EPS);
        const ahead = sign > 0 ? boundary : boundary - 1;
        const gap = sign > 0 ? boundary - front : front - boundary;
        const go = { mode: WbMover.GO, dir: d, room: WbMover.nextMark(f, sign), slide: 0, kick: WbDir.NONE };
        if (gap > EPS)
            return go;
        const lo = Math.floor(s - R + EPS), hi = Math.floor(s + R - EPS);
        const blockLo = cell(ahead, lo), blockHi = cell(ahead, hi);
        const own = Math.floor(s);
        const kickable = () => {
            const balloon = horiz ? world.balloonAt(ahead, own) : world.balloonAt(own, ahead);
            return balloon >= 0 && cell(ahead, own) ? d : WbDir.NONE;
        };
        const stop = { mode: WbMover.STOP, dir: d, room: 0, slide: 0, kick: WbDir.NONE };
        if (lo === hi || (blockLo && blockHi)) {
            if (!blockLo && !blockHi)
                return go;
            stop.kick = kickable();
            return stop;
        }
        if (!blockLo && !blockHi)
            return go;
        const overlap = blockLo ? (lo + 1) - (s - R) : (s + R) - hi;
        if (overlap > WbBalance.SLIDE_LIMIT + EPS) {
            stop.kick = kickable();
            return stop;
        }
        const slide = blockLo ? 1 : -1;
        return { mode: WbMover.SLIDE, dir: d, room: WbMover.nextMark(s, slide), slide, kick: WbDir.NONE };
    }
    static advance(world, who, body, move, alt, distance) {
        const result = { moved: 0, dir: move, kick: WbDir.NONE };
        if (move < 0)
            return result;
        let remaining = distance;
        for (let guard = 0; guard < 400 && remaining > WbMover.EPS; guard++) {
            let p = WbMover.probe(world, who, body, move);
            if (p.mode === WbMover.STOP) {
                if (p.kick >= 0)
                    result.kick = p.kick;
                if (WbDir.perpendicular(alt, move))
                    p = WbMover.probe(world, who, body, alt);
            }
            if (p.mode === WbMover.STOP || p.room <= WbMover.EPS)
                break;
            const step = Math.min(remaining, p.room);
            const horiz = WbDir.horizontal(p.dir);
            if (p.mode === WbMover.GO) {
                if (horiz)
                    body.x += WbDir.sign(p.dir) * step;
                else
                    body.z += WbDir.sign(p.dir) * step;
            }
            else if (horiz)
                body.z += p.slide * step;
            else
                body.x += p.slide * step;
            remaining -= step;
            result.moved += step;
            result.dir = p.dir;
        }
        WbMover.snap(body);
        return result;
    }
    static snap(body) {
        body.x = Math.round(body.x * 1e6) / 1e6;
        body.z = Math.round(body.z * 1e6) / 1e6;
    }
    static overlapsCell(body, i, j) {
        const R = WbBalance.BODY - WbMover.EPS;
        return body.x + R > i && body.x - R < i + 1 && body.z + R > j && body.z - R < j + 1;
    }
}
WbMover.EPS = 1e-7;
WbMover.MARKS = [0.1, 0.35, 0.5, 0.65, 0.9];
WbMover.STOP = 0;
WbMover.GO = 1;
WbMover.SLIDE = 2;
class WbPlayer {
    constructor(index, id, nick, bot, team) {
        this.index = index;
        this.id = id;
        this.nick = nick;
        this.bot = bot;
        this.team = team;
        this.x = 0;
        this.z = 0;
        this.face = WbDir.DOWN;
        this.life = "alive";
        this.balloonsMax = WbBalance.BALLOON_START;
        this.range = WbBalance.RANGE_START;
        this.shoe = 0;
        this.needles = 0;
        this.kick = false;
        this.trapUntil = 0;
        this.trapOwner = -1;
        this.invulnUntil = -1;
        this.shieldUntil = -1;
        this.kSeen = 0;
        this.outTick = -1;
        this.outWhy = null;
        this.disconnected = false;
        this.moving = false;
        this.spawn = 0;
        this.traps = 0;
        this.kills = 0;
        this.rescues = 0;
        this.boxes = 0;
        this.selfKills = 0;
    }
    get cellI() { return Math.floor(this.x); }
    get cellJ() { return Math.floor(this.z); }
    get cell() { return WbGrid.index(this.cellI, this.cellJ); }
    get standing() { return this.life !== "out"; }
    speed() { return this.life === "trapped" ? WbBalance.TRAP_SPEED : WbBalance.SPEED_BASE + WbBalance.SPEED_STEP * this.shoe; }
    invulnerable(tick) { return tick < this.invulnUntil || tick < this.shieldUntil; }
}
class WbBalloon {
    constructor(id, owner, i, j, placedAt, explodeAt, range) {
        this.id = id;
        this.owner = owner;
        this.placedAt = placedAt;
        this.explodeAt = explodeAt;
        this.range = range;
        this.slideDir = WbDir.NONE;
        this.passers = new Set();
        this.x = i + 0.5;
        this.z = j + 0.5;
    }
    get i() { return Math.floor(this.x); }
    get j() { return Math.floor(this.z); }
    get cell() { return WbGrid.index(this.i, this.j); }
}
class WbItem {
    constructor(kind, grade) {
        this.kind = kind;
        this.grade = grade;
    }
}
class WbStatItem extends WbItem {
    apply(p) {
        const before = this.read(p);
        const after = Math.min(this.cap(), before + WbBalance.STAT_GAIN[this.grade]);
        this.write(p, after);
        return { gain: after - before, max: after === before };
    }
}
class WbBalloonItem extends WbStatItem {
    read(p) { return p.balloonsMax; }
    write(p, v) { p.balloonsMax = v; }
    cap() { return WbBalance.BALLOON_MAX; }
}
class WbRangeItem extends WbStatItem {
    read(p) { return p.range; }
    write(p, v) { p.range = v; }
    cap() { return WbBalance.RANGE_MAX; }
}
class WbShoeItem extends WbStatItem {
    read(p) { return p.shoe; }
    write(p, v) { p.shoe = v; }
    cap() { return WbBalance.SHOE_MAX; }
}
class WbNeedleItem extends WbItem {
    apply(p) {
        if (p.needles >= WbBalance.NEEDLE_MAX)
            return { gain: 0, max: true };
        p.needles++;
        return { gain: 1, max: false };
    }
}
class WbKickItem extends WbItem {
    apply(p) {
        if (p.kick)
            return { gain: 0, max: true };
        p.kick = true;
        return { gain: 1, max: false };
    }
}
class WbMaxRangeItem extends WbItem {
    apply(p) {
        const gain = WbBalance.RANGE_MAX - p.range;
        p.range = WbBalance.RANGE_MAX;
        return { gain, max: gain === 0 };
    }
}
class WbShieldItem extends WbItem {
    apply(p, tick) {
        p.shieldUntil = tick + WbBalance.ticks(WbBalance.SHIELD);
        return { gain: WbBalance.SHIELD, max: false };
    }
}
class WbLootTable {
    static create(kind, grade) { return WbLootTable.FACTORIES[kind](grade); }
    static allows(kind, grade) { return WbLootTable.BY_GRADE[grade].indexOf(kind) >= 0; }
}
WbLootTable.KINDS = ["balloon", "range", "shoe", "needle", "kick", "maxRange", "shield"];
WbLootTable.BY_GRADE = [
    ["balloon", "range", "shoe"],
    ["balloon", "range", "shoe", "needle"],
    ["kick", "maxRange", "shield"],
];
WbLootTable.FACTORIES = {
    balloon: (g) => new WbBalloonItem("balloon", g),
    range: (g) => new WbRangeItem("range", g),
    shoe: (g) => new WbShoeItem("shoe", g),
    needle: (g) => new WbNeedleItem("needle", g),
    kick: (g) => new WbKickItem("kick", g),
    maxRange: (g) => new WbMaxRangeItem("maxRange", g),
    shield: (g) => new WbShieldItem("shield", g),
};
class WbSuddenDeath {
    constructor(flip) {
        this.flip = flip;
        this.order = [];
        this.warnAt = [];
        this.landAt = [];
        const W = WbGrid.W, H = WbGrid.H;
        for (let r = 0; r * 2 < Math.min(W, H); r++) {
            const ring = [];
            const i0 = r, j0 = r, i1 = W - 1 - r, j1 = H - 1 - r;
            for (let i = i0; i <= i1; i++)
                ring.push(WbGrid.index(i, j0));
            for (let j = j0 + 1; j <= j1; j++)
                ring.push(WbGrid.index(i1, j));
            if (j1 > j0)
                for (let i = i1 - 1; i >= i0; i--)
                    ring.push(WbGrid.index(i, j1));
            if (i1 > i0)
                for (let j = j1 - 1; j > j0; j--)
                    ring.push(WbGrid.index(i0, j));
            for (const k of ring)
                if (!WbGrid.isPillarSpot(WbGrid.col(k), WbGrid.row(k)) && !WbSuddenDeath.safe(k))
                    this.order.push(WbSuddenDeath.mirror(k, flip));
        }
        const n = this.order.length;
        this.order.forEach((_, k) => {
            const warn = WbBalance.SUDDEN_START + (n > 1 ? k * WbBalance.SUDDEN_SPAN / (n - 1) : 0);
            this.warnAt.push(WbBalance.ticks(warn));
            this.landAt.push(WbBalance.ticks(warn + WbBalance.SUDDEN_WARN));
        });
    }
    static mirror(k, flip) {
        const i = WbGrid.col(k), j = WbGrid.row(k);
        return WbGrid.index(flip & 1 ? WbGrid.W - 1 - i : i, flip & 2 ? WbGrid.H - 1 - j : j);
    }
    static safe(k) {
        const i = WbGrid.col(k), j = WbGrid.row(k);
        return i >= 5 && i <= 9 && j >= 5 && j <= 7;
    }
    doomedSoon(cell, tick) {
        const at = this.order.indexOf(cell);
        return at >= 0 && this.warnAt[at] <= tick ? this.landAt[at] : -1;
    }
}
class WbRosterPlanner {
    static botMember(n) { return { id: "bot" + n, nick: "봇 " + n, bot: true }; }
    static allBots(mode, count) {
        let n = 0;
        const next = () => WbRosterPlanner.botMember(++n);
        if (mode === "solo")
            return Array.from({ length: count }, (_, k) => ({ color: k, members: [next()] }));
        return Array.from({ length: Math.max(2, Math.min(4, Math.round(count / 2))) }, (_, t) => ({ color: t, members: [next(), next()] }));
    }
    static fill(mode, humans, extraBots) {
        let n = 0;
        const next = () => WbRosterPlanner.botMember(++n);
        if (mode === "solo") {
            const seats = Array.from({ length: WbBalance.MAX_PLAYERS }, () => null);
            for (const h of humans)
                if (h.slot >= 0 && h.slot < seats.length && !seats[h.slot])
                    seats[h.slot] = { id: h.id, nick: h.nick, bot: false };
            for (const slot of extraBots)
                if (slot >= 0 && slot < seats.length && !seats[slot])
                    seats[slot] = next();
            let filled = seats.filter((s) => s).length;
            for (let slot = 0; slot < seats.length && filled < WbBalance.MIN_PLAYERS; slot++)
                if (!seats[slot]) {
                    seats[slot] = next();
                    filled++;
                }
            return seats.map((m, color) => m ? { color, members: [m] } : null).filter((t) => t !== null);
        }
        const byTeam = [[], [], [], []];
        for (const h of humans) {
            const t = Math.floor(h.slot / WbBalance.TEAM_SIZE);
            if (t >= 0 && t < WbBalance.TEAM_COUNT && byTeam[t].length < WbBalance.TEAM_SIZE)
                byTeam[t].push({ id: h.id, nick: h.nick, bot: false });
        }
        const used = byTeam.map((m) => m.length > 0);
        for (const t of extraBots)
            if (t >= 0 && t < WbBalance.TEAM_COUNT && !used[t])
                used[t] = true;
        for (let t = 0; t < WbBalance.TEAM_COUNT; t++)
            if (used[t])
                while (byTeam[t].length < WbBalance.TEAM_SIZE)
                    byTeam[t].push(next());
        let total = byTeam.reduce((sum, m) => sum + m.length, 0);
        for (let t = 0; t < WbBalance.TEAM_COUNT && total < WbBalance.MIN_PLAYERS; t++) {
            if (byTeam[t].length)
                continue;
            byTeam[t].push(next(), next());
            total += 2;
        }
        return byTeam.map((members, color) => ({ color, members })).filter((t) => t.members.length > 0);
    }
}
class WbScoreboard {
    static ranks(engine) {
        const survival = (p) => p.life === "out" ? p.outTick : Infinity;
        if (engine.mode === "solo") {
            return engine.players.map((p) => 1 + engine.players.filter((q) => survival(q) > survival(p)).length);
        }
        const teams = engine.teamColors();
        const score = (color) => {
            const members = engine.players.filter((p) => p.team === color);
            const alive = members.filter((p) => p.life !== "out").length;
            return [alive, Math.max(...members.map(survival))];
        };
        const better = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
        const teamRank = new Map();
        for (const c of teams)
            teamRank.set(c, 1 + teams.filter((o) => better(score(o), score(c))).length);
        return engine.players.map((p) => teamRank.get(p.team));
    }
}
class WbBlast {
    static spread(engine, first) {
        const queue = [first];
        const done = new Set();
        let wave = 0;
        while (queue.length) {
            const b = queue.shift();
            if (done.has(b.id))
                continue;
            done.add(b.id);
            engine.removeBalloon(b);
            const cells = WbBlast.cross(engine, b);
            for (const k of cells) {
                const other = engine.balloonIdAt(k);
                if (other >= 0 && !done.has(other))
                    queue.push(engine.balloonById(other));
            }
            engine.wet(b, cells, wave++);
        }
    }
    static cross(engine, b) {
        const cells = [b.cell];
        for (let d = 0; d < 4; d++) {
            for (let s = 1; s <= b.range; s++) {
                const i = b.i + WbDir.DX[d] * s, j = b.j + WbDir.DZ[d] * s;
                if (!WbGrid.inside(i, j) || engine.grid.solid(i, j))
                    break;
                cells.push(WbGrid.index(i, j));
                if (engine.grid.kind(i, j) === WbCell.BOX)
                    break;
            }
        }
        return cells;
    }
}
class WbTrapRules {
    static trap(engine, p, owner) {
        p.life = "trapped";
        p.trapUntil = engine.tick + WbBalance.ticks(WbBalance.TRAP);
        p.trapOwner = owner;
        const by = owner >= 0 ? engine.players[owner] : null;
        if (by && by !== p && !engine.allies(by, p))
            by.traps++;
        engine.emit({ t: "trap", id: p.index, by: owner });
    }
    static release(engine, p, by, needle) {
        p.life = "alive";
        p.invulnUntil = engine.tick + WbBalance.ticks(WbBalance.INVULN);
        p.trapOwner = -1;
        engine.emit({ t: "rescue", id: p.index, by, needle });
    }
    static contacts(engine) {
        const trapped = engine.players.filter((p) => p.life === "trapped");
        const helpers = engine.players.filter((p) => p.life === "alive");
        for (const t of trapped) {
            const touching = helpers.filter((h) => h !== t && Math.hypot(h.x - t.x, h.z - t.z) <= WbBalance.CONTACT + 1e-9);
            if (!touching.length)
                continue;
            const friend = touching.find((h) => engine.allies(h, t));
            if (friend) {
                friend.rescues++;
                WbTrapRules.release(engine, t, friend.index, false);
                continue;
            }
            touching.sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z) || a.index - b.index);
            const finisher = touching[0];
            finisher.kills++;
            engine.emit({ t: "finish", id: t.index, by: finisher.index });
            engine.knockOut(t, finisher.index, "finish");
        }
    }
    static expire(engine) {
        for (const p of engine.players) {
            if (p.life !== "trapped" || engine.tick < p.trapUntil)
                continue;
            WbTrapRules.creditTimeout(engine, p);
            engine.knockOut(p, p.trapOwner, "time");
        }
    }
    static creditTimeout(engine, p) {
        const owner = p.trapOwner >= 0 ? engine.players[p.trapOwner] : null;
        if (!owner)
            return;
        if (owner === p)
            p.selfKills++;
        else if (!engine.allies(owner, p))
            owner.kills++;
    }
}
class WbEngine {
    constructor(config) {
        this.players = [];
        this.balloons = [];
        this.floor = new Map();
        this.breaking = new Map();
        this.wetUntil = new Int32Array(WbGrid.COUNT).fill(-1);
        this.wetOwner = new Int16Array(WbGrid.COUNT).fill(-1);
        this.balloonCell = new Int16Array(WbGrid.COUNT).fill(-1);
        this.pilots = new Map();
        this.tick = -WbBalance.ticks(WbBalance.COUNTDOWN);
        this.ended = false;
        this.ranks = [];
        this.nextBalloon = 1;
        this.suddenCursor = 0;
        this.warnCursor = 0;
        this.events = [];
        this.carry = 0;
        this.mode = config.mode;
        this.seed = config.seed;
        this.sudden = new WbSuddenDeath(new WbSeededRandom(config.seed ^ 0x5DD).int(4));
        const spawnRng = new WbSeededRandom(config.seed ^ 0x51A7);
        const layoutRng = new WbSeededRandom(config.seed ^ 0x2B0C);
        const teams = config.teams;
        this.groups = config.mode === "solo"
            ? WbSpawnPlan.solo(teams.length, spawnRng)
            : WbSpawnPlan.team(teams.length, spawnRng);
        const lootRng = config.lootSeed === null ? null : new WbSeededRandom(config.lootSeed);
        const layout = new WbFairBoxLayout(this.groups, layoutRng).build(lootRng ? WbLootTable.BY_GRADE : null, lootRng);
        this.grid = layout.grid;
        this.hidden = layout.loot || new Map();
        this.report = layout.report;
        const groupOrder = spawnRng.shuffle(this.groups.map((_, k) => k));
        teams.forEach((team, t) => {
            const group = this.groups[groupOrder[t]];
            const spotOrder = spawnRng.shuffle(group.spots.map((_, k) => k));
            team.members.forEach((m, k) => {
                const p = new WbPlayer(this.players.length, m.id, m.nick, m.bot, team.color);
                const spot = group.spots[spotOrder[k % group.spots.length]];
                p.x = spot.i + 0.5;
                p.z = spot.j + 0.5;
                p.spawn = WbSpawnPlan.CORNERS.concat(WbSpawnPlan.SIDES).findIndex((s) => s.i === spot.i && s.j === spot.j);
                this.players.push(p);
            });
        });
    }
    get phase() { return this.ended ? "ended" : this.tick < 0 ? "countdown" : "play"; }
    get seconds() { return this.tick / WbBalance.RATE; }
    get endTick() { return WbBalance.ticks(WbBalance.MATCH); }
    attach(index, pilot) { this.pilots.set(index, pilot); }
    emit(ev) { this.events.push(ev); }
    allies(a, b) { return this.mode === "team" && a.team === b.team; }
    teamColors() { return Array.from(new Set(this.players.map((p) => p.team))); }
    blocked(i, j, who) {
        if (this.grid.blocked(i, j))
            return true;
        const id = this.balloonCell[WbGrid.index(i, j)];
        if (id < 0)
            return false;
        const b = this.balloonById(id);
        return !b || !b.passers.has(who);
    }
    balloonAt(i, j) { return WbGrid.inside(i, j) ? this.balloonCell[WbGrid.index(i, j)] : -1; }
    balloonIdAt(cell) { return this.balloonCell[cell]; }
    balloonById(id) { return this.balloons.find((b) => b.id === id) || null; }
    activeBalloons(owner) { return this.balloons.filter((b) => b.owner === owner).length; }
    isWet(cell) { return this.wetUntil[cell] > this.tick; }
    removeBalloon(b) {
        const at = this.balloons.indexOf(b);
        if (at >= 0)
            this.balloons.splice(at, 1);
        if (this.balloonCell[b.cell] === b.id)
            this.balloonCell[b.cell] = -1;
    }
    wet(b, cells, wave) {
        const until = this.tick + WbBalance.ticks(WbBalance.FLOW);
        for (const k of cells) {
            if (until >= this.wetUntil[k]) {
                this.wetUntil[k] = until;
                this.wetOwner[k] = b.owner;
            }
            if (this.grid.cells[k] === WbCell.BOX && !this.breaking.has(k)) {
                this.breaking.set(k, { at: until, by: b.owner });
                const owner = this.players[b.owner];
                if (owner)
                    owner.boxes++;
            }
            const item = this.floor.get(k);
            if (item && item.tick < this.tick) {
                this.floor.delete(k);
                this.emit({ t: "itemGone", cell: k });
            }
        }
        this.emit({ t: "blast", id: b.id, by: b.owner, i: b.i, j: b.j, cells, wave });
    }
    knockOut(p, by, why) {
        if (p.life === "out")
            return;
        p.life = "out";
        p.outTick = this.tick;
        p.outWhy = why;
        this.emit({ t: "out", id: p.index, by, why });
    }
    disconnect(index) {
        const p = this.players[index];
        if (!p || p.life === "out")
            return;
        p.disconnected = true;
        this.knockOut(p, -1, "left");
    }
    update(dt) {
        this.carry += Math.min(dt, 0.25);
        const all = [];
        while (this.carry >= WbBalance.DT - 1e-9 && !this.ended) {
            this.carry -= WbBalance.DT;
            all.push(...this.step());
        }
        return all;
    }
    step() {
        this.events = [];
        if (this.ended)
            return this.events;
        const intents = this.players.map((p) => {
            const pilot = this.pilots.get(p.index);
            return pilot && p.life !== "out" ? pilot.decide(this, p, WbBalance.DT) : WbIdleIntent.make();
        });
        if (this.tick < 0) {
            this.players.forEach((p, k) => { p.kSeen = Math.max(p.kSeen, intents[k].kPress); });
            this.tick++;
            if (this.tick === 0)
                this.emit({ t: "start" });
            return this.events;
        }
        this.movePlayers(intents);
        this.pressKeys(intents);
        this.slideBalloons();
        this.explode();
        this.trapInWater();
        WbTrapRules.contacts(this);
        WbTrapRules.expire(this);
        this.dropBlocks();
        this.revealAndPick();
        this.judge();
        this.tick++;
        return this.events;
    }
    movePlayers(intents) {
        for (const p of this.players) {
            if (p.life === "out")
                continue;
            const intent = intents[p.index];
            const result = WbMover.advance(this, p.index, p, intent.move, intent.alt, p.speed() * WbBalance.DT);
            p.moving = result.moved > 0;
            if (intent.move >= 0)
                p.face = result.moved > 0 ? result.dir : intent.move;
            if (result.kick >= 0 && p.kick && p.life === "alive")
                this.startKick(p, result.kick);
            for (const b of this.balloons)
                if (b.passers.has(p.index) && !WbMover.overlapsCell(p, b.i, b.j))
                    b.passers.delete(p.index);
        }
    }
    startKick(p, dir) {
        const i = p.cellI + WbDir.DX[dir], j = p.cellJ + WbDir.DZ[dir];
        const id = this.balloonAt(i, j);
        const b = id >= 0 ? this.balloonById(id) : null;
        if (!b || b.slideDir >= 0 || !this.canSlideInto(b, dir))
            return;
        b.slideDir = dir;
        this.emit({ t: "kick", id: b.id, by: p.index, dir });
    }
    canSlideInto(b, dir) {
        const i = b.i + WbDir.DX[dir], j = b.j + WbDir.DZ[dir];
        if (this.grid.blocked(i, j) || this.balloonAt(i, j) >= 0)
            return false;
        const k = WbGrid.index(i, j);
        if (this.floor.has(k))
            return false;
        return !this.players.some((p) => p.life !== "out" && WbMover.overlapsCell(p, i, j));
    }
    pressKeys(intents) {
        for (const p of this.players) {
            const press = intents[p.index].kPress;
            if (p.life === "out" || press <= p.kSeen) {
                p.kSeen = Math.max(p.kSeen, press);
                continue;
            }
            p.kSeen = press;
            if (p.life === "trapped") {
                if (p.needles > 0) {
                    p.needles--;
                    WbTrapRules.release(this, p, p.index, true);
                }
                continue;
            }
            this.place(p);
        }
    }
    place(p) {
        const i = p.cellI, j = p.cellJ, k = WbGrid.index(i, j);
        if (this.balloonCell[k] >= 0 || this.activeBalloons(p.index) >= p.balloonsMax || this.grid.blocked(i, j)) {
            this.emit({ t: "noPlace", by: p.index });
            return;
        }
        const b = new WbBalloon(this.nextBalloon++, p.index, i, j, this.tick, this.tick + WbBalance.ticks(WbBalance.FUSE), p.range);
        for (const q of this.players)
            if (q.life !== "out" && WbMover.overlapsCell(q, i, j))
                b.passers.add(q.index);
        this.balloons.push(b);
        this.balloonCell[k] = b.id;
        this.emit({ t: "place", id: b.id, by: p.index, i, j });
    }
    slideBalloons() {
        const step = WbBalance.KICK_SPEED * WbBalance.DT;
        for (const b of this.balloons.slice()) {
            if (b.slideDir < 0)
                continue;
            let left = step;
            while (left > 1e-9 && b.slideDir >= 0) {
                const cx = b.i + 0.5, cz = b.j + 0.5;
                const toCenter = WbDir.horizontal(b.slideDir) ? (cx - b.x) * WbDir.sign(b.slideDir) : (cz - b.z) * WbDir.sign(b.slideDir);
                if (toCenter > 1e-9) {
                    const d = Math.min(left, toCenter);
                    this.shiftBalloon(b, d);
                    left -= d;
                    continue;
                }
                if (!this.canSlideInto(b, b.slideDir)) {
                    b.x = cx;
                    b.z = cz;
                    b.slideDir = WbDir.NONE;
                    this.emit({ t: "slideStop", id: b.id, i: b.i, j: b.j });
                    break;
                }
                const d = Math.min(left, 1);
                this.shiftBalloon(b, d);
                left -= d;
            }
        }
    }
    shiftBalloon(b, d) {
        const before = b.cell;
        b.x += WbDir.DX[b.slideDir] * d;
        b.z += WbDir.DZ[b.slideDir] * d;
        b.x = Math.round(b.x * 1e6) / 1e6;
        b.z = Math.round(b.z * 1e6) / 1e6;
        if (b.cell !== before) {
            if (this.balloonCell[before] === b.id)
                this.balloonCell[before] = -1;
            this.balloonCell[b.cell] = b.id;
            b.passers.clear();
        }
    }
    explode() {
        for (;;) {
            const due = this.balloons.find((b) => b.explodeAt <= this.tick || (b.slideDir >= 0 && this.isWet(b.cell)));
            if (!due)
                break;
            WbBlast.spread(this, due);
        }
    }
    trapInWater() {
        for (const p of this.players) {
            if (p.life !== "alive" || p.invulnerable(this.tick))
                continue;
            const k = p.cell;
            if (this.isWet(k))
                WbTrapRules.trap(this, p, this.wetOwner[k]);
        }
    }
    dropBlocks() {
        if (this.tick === WbBalance.ticks(WbBalance.SUDDEN_START))
            this.emit({ t: "sudden" });
        const s = this.sudden;
        while (this.warnCursor < s.order.length && s.warnAt[this.warnCursor] <= this.tick) {
            this.emit({ t: "suddenWarn", cell: s.order[this.warnCursor], land: s.landAt[this.warnCursor] });
            this.warnCursor++;
        }
        while (this.suddenCursor < s.order.length && s.landAt[this.suddenCursor] <= this.tick) {
            const k = s.order[this.suddenCursor++];
            const i = WbGrid.col(k), j = WbGrid.row(k);
            this.grid.cells[k] = WbCell.WALL;
            this.breaking.delete(k);
            this.hidden.delete(k);
            this.floor.delete(k);
            const id = this.balloonCell[k];
            if (id >= 0) {
                const b = this.balloonById(id);
                if (b)
                    this.removeBalloon(b);
            }
            this.emit({ t: "suddenDrop", cell: k });
            for (const p of this.players)
                if (p.life !== "out" && p.cellI === i && p.cellJ === j)
                    this.knockOut(p, -1, "sudden");
        }
    }
    revealAndPick() {
        for (const [k, info] of Array.from(this.breaking)) {
            if (info.at > this.tick)
                continue;
            this.breaking.delete(k);
            this.grid.cells[k] = WbCell.EMPTY;
            const loot = this.hidden.get(k) || null;
            this.hidden.delete(k);
            if (loot)
                this.floor.set(k, { kind: loot.kind, grade: loot.grade, tick: this.tick });
            this.emit({ t: "boxBreak", cell: k, by: info.by, kind: loot ? loot.kind : null, grade: loot ? loot.grade : -1 });
        }
        if (!this.floor.size)
            return;
        const m = WbBalance.PICK_MARGIN;
        for (const p of this.players) {
            if (p.life !== "alive")
                continue;
            for (const [k, item] of Array.from(this.floor)) {
                const i = WbGrid.col(k), j = WbGrid.row(k);
                if (p.x < i - m || p.x > i + 1 + m || p.z < j - m || p.z > j + 1 + m)
                    continue;
                this.floor.delete(k);
                const r = WbLootTable.create(item.kind, item.grade).apply(p, this.tick);
                this.emit({ t: "pick", by: p.index, cell: k, kind: item.kind, grade: item.grade, gain: r.gain, max: r.max });
            }
        }
    }
    judge() {
        if (this.tick >= this.endTick) {
            for (const p of this.players)
                if (p.life === "trapped") {
                    WbTrapRules.creditTimeout(this, p);
                    this.knockOut(p, p.trapOwner, "clock");
                }
            this.finish();
            return;
        }
        const alive = this.players.filter((p) => p.life !== "out");
        const groups = new Set(alive.map((p) => p.team));
        if (groups.size <= 1)
            this.finish();
    }
    finish() {
        this.ended = true;
        this.ranks = WbScoreboard.ranks(this);
        this.emit({ t: "end" });
    }
    drainEvents() { const e = this.events; this.events = []; return e; }
}
class WbSnapshotCodec {
    static encodePlayer(p, engine) {
        const bits = (engine.tick < p.invulnUntil ? 1 : 0) | (engine.tick < p.shieldUntil ? 2 : 0) | (p.kick ? 4 : 0) | (p.disconnected ? 8 : 0);
        return [
            Math.round(p.x * 100), Math.round(p.z * 100), p.face, WbSnapshotCodec.LIVES.indexOf(p.life), bits,
            p.life === "trapped" ? p.trapUntil - engine.tick : 0, engine.activeBalloons(p.index), p.balloonsMax, p.range, p.shoe, p.needles,
            p.kills, p.traps, p.rescues, p.boxes, p.selfKills,
            Math.max(0, p.invulnUntil - engine.tick), Math.max(0, p.shieldUntil - engine.tick),
        ].join(",");
    }
    static decodePlayer(s) {
        const v = s.split(",").map(Number);
        return {
            x: v[0] / 100, z: v[1] / 100, face: v[2], life: WbSnapshotCodec.LIVES[v[3]],
            invuln: !!(v[4] & 1), shield: !!(v[4] & 2), kick: !!(v[4] & 4), left: !!(v[4] & 8),
            trapLeft: v[5], active: v[6], balloonsMax: v[7], range: v[8], shoe: v[9], needles: v[10],
            kills: v[11], traps: v[12], rescues: v[13], boxes: v[14], selfKills: v[15], invulnLeft: v[16], shieldLeft: v[17],
        };
    }
    static applyPlayer(p, s, tick) {
        const d = WbSnapshotCodec.decodePlayer(s);
        p.x = d.x;
        p.z = d.z;
        p.face = d.face;
        p.life = d.life;
        p.kick = d.kick;
        p.disconnected = d.left;
        p.trapUntil = tick + d.trapLeft;
        p.balloonsMax = d.balloonsMax;
        p.range = d.range;
        p.shoe = d.shoe;
        p.needles = d.needles;
        p.kills = d.kills;
        p.traps = d.traps;
        p.rescues = d.rescues;
        p.boxes = d.boxes;
        p.selfKills = d.selfKills;
        p.invulnUntil = tick + d.invulnLeft;
        p.shieldUntil = tick + d.shieldLeft;
    }
    static encodeBoard(engine) {
        const cells = Array.from(engine.grid.cells).join("");
        const items = Array.from(engine.floor).map(([k, it]) => [k, WbLootTable.KINDS.indexOf(it.kind), it.grade].join(":")).join(",");
        const balloons = engine.balloons.map((b) => [b.id, b.owner, b.i, b.j, b.explodeAt - engine.tick, b.range].join(":")).join(",");
        return [engine.tick, cells, items, balloons].join("|");
    }
    static decodeBoard(s) {
        const [tick, cells, items, balloons] = s.split("|");
        const parts = (text) => text ? text.split(",").map((p) => p.split(":").map(Number)) : [];
        return {
            tick: Number(tick),
            cells: cells.split("").map(Number),
            items: parts(items).map((v) => ({ cell: v[0], kind: WbLootTable.KINDS[v[1]], grade: v[2] })),
            balloons: parts(balloons).map((v) => ({ id: v[0], owner: v[1], i: v[2], j: v[3], fuseLeft: v[4], range: v[5] })),
        };
    }
}
WbSnapshotCodec.LIVES = ["alive", "trapped", "out"];
