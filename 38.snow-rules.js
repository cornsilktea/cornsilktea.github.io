"use strict";
class SnBalance {
}
SnBalance.MAX_HP = 100;
SnBalance.SPEED = 2;
SnBalance.RADIUS = 0.4;
SnBalance.SHOT = { damage: 12, cost: 2, interval: 0.45, speed: 22, range: 14, radius: 0.25, spawn: 0.5 };
SnBalance.WALL = { cost: 30, hp: 150, halfLength: 1.5, halfDepth: 0.3, height: 2.2, buildTime: 1, interval: 1.2, perTeam: 6, life: 75, distance: 1.3 };
SnBalance.COCOA_RATIO = 0.3;
SnBalance.BIG = { damage: 40, wallDamage: 200, radius: 1.2, speed: 12, distance: 30, knock: 4, knockTime: 0.3 };
SnBalance.REVIVE = { time: 10, hp: 50, guard: 3, max: 2, reach: 2.5 };
SnBalance.DROP = { time: 8, pickLimit: 20, spread: 6, gap: 2, steer: 1.2, steerMax: 6, botPickMin: 2, botPickMax: 6, keyWeight: 3 };
SnBalance.SNOW = { perTile: 5, start: 30, cap: 300, pile: 10, pileReach: 1.0 };
SnBalance.HEIGHT = { defense: 0.12, rangeUp: 0.15, rangeDown: 0.10 };
SnBalance.AIM = { reach: 20, lead: 0.6, err: 0.08, moveMemory: 0.4 };
SnBalance.GRADE_COLORS = ["#B8BEC9", "#5B9BFF", "#F08A3E"];
SnBalance.GRADE_NAMES = ["일반", "희귀", "전설"];
SnBalance.GRADE_ODDS_BASE = [0.5, 0.4, 0.1];
SnBalance.GRADE_ODDS_KEY = [0.3, 0.45, 0.25];
SnBalance.GEAR_SLOTS = ["hat", "suit", "shoes"];
SnBalance.HAT_CUT = [0.08, 0.14, 0.20];
SnBalance.SUIT_HP = [15, 30, 50];
SnBalance.SHOES_SPEED = [0.15, 0.30, 0.45];
SnBalance.CRATES = { placed: 40, cocoa: 10, big: 6, open: 1.5 };
SnBalance.STORM_TICK = 0.5;
SnBalance.STORM_WARN = 5;
SnBalance.STORM_RADII = [113, 70, 45, 28, 16, 7, 0];
SnBalance.STORM_ROWS = [
    { start: 0, end: 45, from: 0, to: 0, dps: 0, stage: 0, phase: "prep" },
    { start: 45, end: 90, from: 0, to: 1, dps: 1, stage: 1, phase: "shrink" },
    { start: 90, end: 115, from: 1, to: 1, dps: 1, stage: 1, phase: "wait" },
    { start: 115, end: 150, from: 1, to: 2, dps: 2, stage: 2, phase: "shrink" },
    { start: 150, end: 170, from: 2, to: 2, dps: 2, stage: 2, phase: "wait" },
    { start: 170, end: 210, from: 2, to: 3, dps: 4, stage: 3, phase: "shrink" },
    { start: 210, end: 225, from: 3, to: 3, dps: 4, stage: 3, phase: "wait" },
    { start: 225, end: 260, from: 3, to: 4, dps: 7, stage: 4, phase: "shrink" },
    { start: 260, end: 270, from: 4, to: 4, dps: 7, stage: 4, phase: "wait" },
    { start: 270, end: 305, from: 4, to: 5, dps: 11, stage: 5, phase: "shrink" },
    { start: 305, end: 315, from: 5, to: 5, dps: 11, stage: 5, phase: "wait" },
    { start: 315, end: 360, from: 5, to: 6, dps: 16, stage: 6, phase: "shrink" },
    { start: 360, end: Infinity, from: 6, to: 6, dps: 25, stage: 7, phase: "full" },
];
SnBalance.STORM_MIN_OPEN = 0.4;
SnBalance.SAFETY_END = 480;
SnBalance.TEAM_COLORS_DUOS = ["#E0524B", "#3F7FE0", "#E8B931"];
SnBalance.TEAM_COLORS_SOLO = ["#E0524B", "#3F7FE0", "#E8B931", "#4CB860", "#9A62D8", "#5CC8E8"];
SnBalance.TEAM_NAMES_DUOS = ["빨강", "파랑", "노랑"];
SnBalance.MIN_PLAYERS = 4;
SnBalance.MAX_PLAYERS = 6;
class SnAngle {
    static dirX(a) { return Math.cos(a); }
    static dirZ(a) { return Math.sin(a); }
    static toward(fx, fz, tx, tz) { return Math.atan2(tz - fz, tx - fx); }
    static wrap(a) { while (a > Math.PI)
        a -= Math.PI * 2; while (a < -Math.PI)
        a += Math.PI * 2; return a; }
}
class SnGearRules {
    static canEquip(current, grade) { return current < 0 || grade > current; }
    static hatCut(grade) { return grade < 0 ? 0 : SnBalance.HAT_CUT[grade]; }
    static suitHp(grade) { return grade < 0 ? 0 : SnBalance.SUIT_HP[grade]; }
    static shoesBoost(grade) { return grade < 0 ? 0 : SnBalance.SHOES_SPEED[grade]; }
    static slotIndex(slot) { return SnBalance.GEAR_SLOTS.indexOf(slot); }
    static rollGrade(random, key) {
        const odds = key ? SnBalance.GRADE_ODDS_KEY : SnBalance.GRADE_ODDS_BASE;
        let roll = random.next();
        for (let g = 0; g < odds.length; g++) {
            roll -= odds[g];
            if (roll < 0)
                return g;
        }
        return odds.length - 1;
    }
}
class SnHeightRules {
    static defenseScale(targetLevel, attackerLevel) {
        const n = targetLevel - attackerLevel;
        return n > 0 ? 1 - SnBalance.HEIGHT.defense * n : 1;
    }
    static rangeScale(flightLevel, groundLevel) {
        const d = groundLevel - flightLevel;
        if (d > 0)
            return 1 - SnBalance.HEIGHT.rangeUp * d;
        return 1 + SnBalance.HEIGHT.rangeDown * -d;
    }
}
class SnRosterPlanner {
    static allBots(mode) {
        const bot = (k) => ({ id: "bot" + k, nick: "AI " + k, bot: true });
        return mode === "solo"
            ? [1, 2, 3, 4, 5, 6].map((k) => ({ members: [bot(k)] }))
            : [0, 1, 2].map((t) => ({ members: [bot(t * 2 + 1), bot(t * 2 + 2)] }));
    }
    static fill(mode, humans) {
        let botCount = 0;
        const bot = () => { botCount++; return { id: "bot" + botCount, nick: "AI " + botCount, bot: true }; };
        if (mode === "solo") {
            const teams = humans.slice(0, SnBalance.MAX_PLAYERS).map((h) => ({ members: [{ id: h.id, nick: h.nick, bot: false }] }));
            while (teams.length < SnBalance.MIN_PLAYERS)
                teams.push({ members: [bot()] });
            return teams;
        }
        const byTeam = [[], [], []];
        for (const h of humans)
            if (h.team >= 0 && h.team < 3 && byTeam[h.team].length < 2)
                byTeam[h.team].push({ id: h.id, nick: h.nick, bot: false });
        const teams = [];
        for (const members of byTeam) {
            if (!members.length)
                continue;
            while (members.length < 2)
                members.push(bot());
            teams.push({ members });
        }
        while (teams.length * 2 < SnBalance.MIN_PLAYERS)
            teams.push({ members: [bot(), bot()] });
        return teams;
    }
}
class SnPlayer {
    constructor(num, id, nick, team, bot) {
        this.num = num;
        this.id = id;
        this.nick = nick;
        this.team = team;
        this.bot = bot;
        this.x = 0;
        this.z = 0;
        this.yaw = 0;
        this.vx = 0;
        this.vz = 0;
        this.movedAt = -1;
        this.life = "sky";
        this.hp = SnBalance.MAX_HP;
        this.gear = [-1, -1, -1];
        this.bigBall = false;
        this.revivesUsed = 0;
        this.guardUntil = 0;
        this.nextShotAt = 0;
        this.nextWallAt = 0;
        this.buildUntil = 0;
        this.buildingWall = -1;
        this.knockX = 0;
        this.knockZ = 0;
        this.knockLeft = 0;
        this.reviveTarget = -1;
        this.reviveProgress = 0;
        this.kills = 0;
        this.dealt = 0;
        this.collected = 0;
        this.downAt = -1;
        this.killedBy = -1;
        this.lastHitAt = -1;
        this.lastHitFromX = 0;
        this.lastHitFromZ = 0;
        this.landAt = -1;
        this.spotX = 0;
        this.spotZ = 0;
        this.skyX = 0;
        this.skyZ = 0;
        this.external = false;
    }
    get maxHp() { return SnBalance.MAX_HP + SnGearRules.suitHp(this.gear[1]); }
    get speed() { return SnBalance.SPEED * (1 + SnGearRules.shoesBoost(this.gear[2])); }
    get onGround() { return this.life === "alive"; }
    canBeRevived() { return this.life === "down" && this.revivesUsed < SnBalance.REVIVE.max; }
    building(time) { return time < this.buildUntil; }
    guarded(time) { return time < this.guardUntil; }
}
class SnTeam {
    constructor(num, members) {
        this.num = num;
        this.members = members;
        this.snow = SnBalance.SNOW.start;
        this.outTick = -1;
        this.outAt = -1;
        this.dropAt = -1;
        this.dropX = 0;
        this.dropZ = 0;
        this.botPickAt = -1;
    }
    get leader() { return this.members.find((p) => !p.bot) || this.members[0]; }
    get out() { return this.outTick >= 0; }
    room() { return SnBalance.SNOW.cap - this.snow; }
}
class SnWall {
    constructor(id, team, owner, x, z, facing, level, createdAt, readyAt) {
        this.id = id;
        this.team = team;
        this.owner = owner;
        this.x = x;
        this.z = z;
        this.facing = facing;
        this.level = level;
        this.createdAt = createdAt;
        this.readyAt = readyAt;
        this.halfX = SnBalance.WALL.halfLength;
        this.halfZ = SnBalance.WALL.halfDepth;
        this.hp = SnBalance.WALL.hp;
        this.yaw = Math.atan2(Math.cos(facing), Math.sin(facing));
        this.expireAt = readyAt + SnBalance.WALL.life;
    }
    solid(time) { return time >= this.readyAt; }
    distanceTo(x, z) { return SnBoxMath.distance(this.x, this.z, this.halfX, this.halfZ, this.yaw, x, z); }
    pushOut(x, z, pad) { return SnBoxMath.pushOut(this.x, this.z, this.halfX, this.halfZ, this.yaw, x, z, pad); }
    samplePoints() {
        const pts = [], c = Math.cos(this.yaw), s = Math.sin(this.yaw);
        for (let a = -this.halfX; a <= this.halfX + 1e-6; a += 0.5)
            for (const b of [-this.halfZ, this.halfZ])
                pts.push({ x: this.x + a * c + b * s, z: this.z - a * s + b * c });
        return pts;
    }
}
class SnCrate {
    constructor(num, spot, x, z, key, item) {
        this.num = num;
        this.spot = spot;
        this.x = x;
        this.z = z;
        this.key = key;
        this.item = item;
        this.opened = false;
        this.taken = false;
    }
}
class SnPile {
    constructor(num, x, z) {
        this.num = num;
        this.x = x;
        this.z = z;
        this.taken = false;
    }
}
class SnSnowField {
    constructor(map) {
        this.amount = new Uint8Array(SnGridMath.COUNT);
        this.changed = [];
        for (let idx = 0; idx < SnGridMath.COUNT; idx++)
            if (map.walkable(idx))
                this.amount[idx] = SnBalance.SNOW.perTile;
    }
    take(idx, room) {
        if (idx < 0 || room <= 0 || !this.amount[idx])
            return 0;
        const got = Math.min(this.amount[idx], room);
        this.amount[idx] -= got;
        this.changed.push(idx);
        return got;
    }
    remaining() { let sum = 0; for (let k = 0; k < this.amount.length; k++)
        sum += this.amount[k]; return sum; }
}
class SnStormPlan {
    constructor(map, random) {
        this.centers = [];
        this.centers.push({ x: 0, z: 0 });
        const radii = SnBalance.STORM_RADII;
        for (let k = 1; k < radii.length; k++)
            this.centers.push(this.pickCenter(map, random, this.centers[k - 1], radii[k - 1], radii[k]));
    }
    openShare(map, x, z, r) {
        if (r < 1)
            return 1;
        let all = 0, open = 0;
        for (let dz = -r; dz <= r; dz += 2)
            for (let dx = -r; dx <= r; dx += 2) {
                if (dx * dx + dz * dz > r * r)
                    continue;
                all++;
                const idx = SnGridMath.indexAt(x + dx, z + dz);
                if (idx >= 0 && map.walkable(idx))
                    open++;
            }
        return all ? open / all : 0;
    }
    pickCenter(map, random, prev, prevR, r) {
        const room = prevR - r;
        for (let tries = 0; tries < 400; tries++) {
            const a = random.range(0, Math.PI * 2), d = Math.sqrt(random.next()) * room;
            const x = prev.x + Math.cos(a) * d, z = prev.z + Math.sin(a) * d;
            const idx = SnGridMath.indexAt(x, z);
            if (idx < 0 || !map.standable(idx))
                continue;
            if (this.openShare(map, x, z, r) < SnBalance.STORM_MIN_OPEN)
                continue;
            return { x, z };
        }
        const fallback = map.nearestWalkable(prev.x, prev.z);
        return { x: SnGridMath.centerX(fallback), z: SnGridMath.centerZ(fallback) };
    }
    row(t) {
        const rows = SnBalance.STORM_ROWS;
        for (const row of rows)
            if (t < row.end)
                return row;
        return rows[rows.length - 1];
    }
    state(t) {
        const row = this.row(t), radii = SnBalance.STORM_RADII;
        const a = this.centers[row.from], b = this.centers[row.to];
        const f = row.phase === "shrink" ? Math.min(1, Math.max(0, (t - row.start) / (row.end - row.start))) : 0;
        const r = radii[row.from] + (radii[row.to] - radii[row.from]) * f;
        const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
        const nextIndex = row.phase === "shrink" ? row.to : row.phase === "full" ? -1 : row.to + 1;
        const next = nextIndex > 0 && nextIndex < radii.length ? { x: this.centers[nextIndex].x, z: this.centers[nextIndex].z, r: radii[nextIndex] } : null;
        return { x, z, r, dps: row.dps, stage: row.stage, phase: row.phase, phaseEnd: row.end, next };
    }
    inside(t, x, z) {
        const s = this.state(t);
        return Math.hypot(x - s.x, z - s.z) <= s.r;
    }
}
class SnMover {
    constructor(engine) {
        this.engine = engine;
    }
    move(p, vx, vz, dt, allowDrop) {
        const dist = Math.hypot(vx, vz) * dt;
        if (dist < 1e-6)
            return;
        const steps = Math.max(1, Math.ceil(dist / 0.2));
        const sx = vx * dt / steps, sz = vz * dt / steps;
        for (let k = 0; k < steps; k++)
            this.step(p, sx, sz, allowDrop);
    }
    step(p, sx, sz, allowDrop) {
        const options = [[sx, sz], [sx, 0], [0, sz]];
        for (const [dx, dz] of options) {
            if (Math.abs(dx) + Math.abs(dz) < 1e-9)
                continue;
            const spot = this.resolve(p, p.x + dx, p.z + dz);
            if (spot && this.canStand(p, spot.x, spot.z, allowDrop)) {
                p.x = spot.x;
                p.z = spot.z;
                return;
            }
        }
    }
    resolve(p, x, z) {
        const r = SnBalance.RADIUS, e = this.engine;
        for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            for (const o of e.map.obstaclesAround(x, z, r + 0.2)) {
                const out = o.pushOut(x, z, r);
                if (out) {
                    x = out.x;
                    z = out.z;
                    moved = true;
                }
            }
            for (const w of e.walls) {
                if (!w.solid(e.time))
                    continue;
                const out = w.pushOut(x, z, r);
                if (out) {
                    x = out.x;
                    z = out.z;
                    moved = true;
                }
            }
            for (const q of e.players) {
                if (q === p || q.life !== "alive")
                    continue;
                const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz), need = r * 2;
                if (d >= need)
                    continue;
                if (d < 1e-6) {
                    x += need;
                    moved = true;
                    continue;
                }
                x = q.x + dx / d * need;
                z = q.z + dz / d * need;
                moved = true;
            }
            if (!moved)
                return { x, z };
        }
        return this.blocked(p, x, z) ? null : { x, z };
    }
    blocked(p, x, z) {
        const r = SnBalance.RADIUS - 0.02, e = this.engine;
        if (e.map.obstacleAt(x, z, r))
            return true;
        for (const w of e.walls)
            if (w.solid(e.time) && w.distanceTo(x, z) < r)
                return true;
        for (const q of e.players)
            if (q !== p && q.life === "alive" && Math.hypot(q.x - x, q.z - z) < r * 2)
                return true;
        return false;
    }
    canStand(p, x, z, allowDrop) {
        const map = this.engine.map;
        const from = SnGridMath.indexAt(p.x, p.z), to = SnGridMath.indexAt(x, z);
        if (to < 0 || !map.walkable(to))
            return false;
        if (from !== to && !this.reachable(from, to, allowDrop))
            return false;
        const r = SnBalance.RADIUS;
        for (let k = 0; k < 8; k++) {
            const a = k * Math.PI / 4;
            const s = SnGridMath.indexAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
            if (s === to)
                continue;
            if (s < 0 || !map.connected(to, s, allowDrop))
                return false;
        }
        return true;
    }
    reachable(from, to, allowDrop) {
        const map = this.engine.map;
        if (from < 0)
            return map.walkable(to);
        const di = Math.abs(SnGridMath.colOf(from) - SnGridMath.colOf(to)), dj = Math.abs(SnGridMath.rowOf(from) - SnGridMath.rowOf(to));
        if (di > 1 || dj > 1)
            return false;
        return map.connected(from, to, allowDrop);
    }
    placeFree(p) {
        if (!this.blocked(p, p.x, p.z) && this.canStand(p, p.x, p.z, false))
            return;
        const taken = (idx) => this.blocked(p, SnGridMath.centerX(idx), SnGridMath.centerZ(idx));
        const idx = this.engine.map.nearestWalkable(p.x, p.z, taken);
        if (idx >= 0) {
            p.x = SnGridMath.centerX(idx);
            p.z = SnGridMath.centerZ(idx);
        }
    }
}
class SnSightLine {
    static clear(engine, x0, z0, x1, z1, level) {
        const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.4);
        for (let k = 1; k < n; k++) {
            const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
            if (engine.map.shotBlockedAt(x, z, level))
                return false;
            for (const w of engine.walls)
                if (w.solid(engine.time) && w.distanceTo(x, z) < SnBalance.SHOT.radius)
                    return false;
        }
        return true;
    }
}
class SnAutoAim {
    constructor(engine) {
        this.engine = engine;
    }
    target(me) {
        const e = this.engine, level = e.map.levelAt(me.x, me.z);
        let best = null, bd = Infinity, open = null, od = Infinity;
        for (const o of e.players) {
            if (o.team === me.team || o.life !== "alive")
                continue;
            const d = Math.hypot(o.x - me.x, o.z - me.z);
            if (d > SnBalance.AIM.reach)
                continue;
            if (d < bd) {
                bd = d;
                best = o;
            }
            if (d < od && SnSightLine.clear(e, me.x, me.z, o.x, o.z, level)) {
                od = d;
                open = o;
            }
        }
        return open || best;
    }
    leadSpot(me, t, share) {
        const e = this.engine;
        if (e.time - t.movedAt > SnBalance.AIM.moveMemory)
            return { x: t.x, z: t.z };
        const travel = Math.hypot(t.x - me.x, t.z - me.z) / SnBalance.SHOT.speed;
        return { x: t.x + t.vx * travel * share, z: t.z + t.vz * travel * share };
    }
    angle(me) {
        const t = this.target(me);
        if (!t)
            return me.yaw;
        const spot = this.leadSpot(me, t, SnBalance.AIM.lead);
        return SnAngle.toward(me.x, me.z, spot.x, spot.z) + (this.engine.random.next() - 0.5) * 2 * SnBalance.AIM.err;
    }
}
class SnProjectile {
    constructor(id, owner, x, z, angle, level) {
        this.id = id;
        this.owner = owner;
        this.angle = angle;
        this.level = level;
        this.traveled = 0;
        this.done = false;
        this.x = x;
        this.z = z;
        this.dirX = Math.cos(angle);
        this.dirZ = Math.sin(angle);
    }
    finish(engine, why) {
        this.done = true;
        engine.emit({ t: "shotEnd", id: this.id, x: this.x, z: this.z, why });
    }
}
class SnSnowball extends SnProjectile {
    get big() { return false; }
    step(engine, dt) {
        const move = SnBalance.SHOT.speed * dt, n = Math.max(1, Math.ceil(move / 0.25)), part = move / n;
        for (let k = 0; k < n && !this.done; k++) {
            this.x += this.dirX * part;
            this.z += this.dirZ * part;
            this.traveled += part;
            if (engine.map.shotBlockedAt(this.x, this.z, this.level)) {
                this.finish(engine, "block");
                return;
            }
            const allow = SnBalance.SHOT.range * SnHeightRules.rangeScale(this.level, engine.map.levelAt(this.x, this.z));
            if (this.traveled > allow) {
                this.finish(engine, "ground");
                return;
            }
            for (const w of engine.walls) {
                if (!w.solid(engine.time) || w.distanceTo(this.x, this.z) >= SnBalance.SHOT.radius)
                    continue;
                engine.combat.hurtWall(w, SnBalance.SHOT.damage, this.level);
                this.finish(engine, "wall");
                return;
            }
            for (const p of engine.players) {
                if (p.team === this.owner.team || p.life !== "alive")
                    continue;
                if (Math.hypot(p.x - this.x, p.z - this.z) >= SnBalance.RADIUS + SnBalance.SHOT.radius)
                    continue;
                engine.combat.hurt(p, this.owner, SnBalance.SHOT.damage, this.level);
                this.finish(engine, "player");
                return;
            }
        }
    }
}
class SnBigBall extends SnProjectile {
    constructor(id, owner, x, z, angle, level) {
        super(id, owner, x, z, angle, level);
        this.struck = new Set();
        this.tile = SnGridMath.indexAt(x, z);
    }
    get big() { return true; }
    step(engine, dt) {
        const move = SnBalance.BIG.speed * dt, n = Math.max(1, Math.ceil(move / 0.25)), part = move / n;
        for (let k = 0; k < n && !this.done; k++) {
            const nx = this.x + this.dirX * part, nz = this.z + this.dirZ * part;
            const idx = SnGridMath.indexAt(nx, nz);
            if (idx < 0 || (idx !== this.tile && !this.rollsInto(engine.map, idx))) {
                this.finish(engine, "block");
                return;
            }
            if (engine.map.obstacleAt(nx, nz, 0.3)) {
                this.finish(engine, "block");
                return;
            }
            this.x = nx;
            this.z = nz;
            this.tile = idx;
            this.traveled += part;
            const level = engine.map.levelAt(this.x, this.z);
            for (const w of engine.walls) {
                if (!w.solid(engine.time) || w.distanceTo(this.x, this.z) >= SnBalance.BIG.radius)
                    continue;
                engine.combat.hurtWall(w, SnBalance.BIG.wallDamage, level);
                this.finish(engine, "wall");
                return;
            }
            for (const p of engine.players) {
                if (p.team === this.owner.team || p.life !== "alive" || this.struck.has(p.num))
                    continue;
                if (Math.hypot(p.x - this.x, p.z - this.z) >= SnBalance.RADIUS + SnBalance.BIG.radius)
                    continue;
                this.struck.add(p.num);
                if (engine.combat.hurt(p, this.owner, SnBalance.BIG.damage, level) > 0 && p.life === "alive")
                    engine.combat.knock(p, this.dirX, this.dirZ);
            }
            if (this.traveled >= SnBalance.BIG.distance) {
                this.finish(engine, "ground");
                return;
            }
        }
    }
    rollsInto(map, idx) {
        if (this.tile < 0)
            return map.walkable(idx);
        const di = Math.abs(SnGridMath.colOf(idx) - SnGridMath.colOf(this.tile)), dj = Math.abs(SnGridMath.rowOf(idx) - SnGridMath.rowOf(this.tile));
        if (di > 1 || dj > 1)
            return false;
        if (di === 1 && dj === 1) {
            const a = SnGridMath.index(SnGridMath.colOf(idx), SnGridMath.rowOf(this.tile)), b = SnGridMath.index(SnGridMath.colOf(this.tile), SnGridMath.rowOf(idx));
            return (map.connected(this.tile, a, true) && map.connected(a, idx, true)) || (map.connected(this.tile, b, true) && map.connected(b, idx, true));
        }
        return map.connected(this.tile, idx, true);
    }
}
class SnCombat {
    constructor(engine) {
        this.engine = engine;
    }
    hurt(target, attacker, base, fromLevel) {
        const e = this.engine;
        if (target.life !== "alive" || target.guarded(e.time))
            return 0;
        let v = base;
        if (attacker) {
            const scale = (1 - SnGearRules.hatCut(target.gear[0])) * SnHeightRules.defenseScale(e.map.levelAt(target.x, target.z), fromLevel);
            v = Math.max(1, Math.round(base * scale));
        }
        target.hp -= v;
        target.lastHitAt = e.time;
        target.reviveTarget = -1;
        target.reviveProgress = 0;
        if (attacker) {
            attacker.dealt += v;
            target.lastHitFromX = attacker.x;
            target.lastHitFromZ = attacker.z;
        }
        e.emit({ t: "hit", to: target.num, by: attacker ? attacker.num : -1, v, storm: !attacker });
        if (target.hp <= 0)
            e.knockDown(target, attacker);
        return v;
    }
    hurtWall(w, base, fromLevel) {
        const e = this.engine;
        const v = Math.max(1, Math.round(base * SnHeightRules.defenseScale(w.level, fromLevel)));
        w.hp -= v;
        e.emit({ t: "wallHit", id: w.id, v });
        if (w.hp <= 0)
            e.removeWall(w, true);
    }
    knock(p, dx, dz) {
        const speed = SnBalance.BIG.knock / SnBalance.BIG.knockTime;
        p.knockX = dx * speed;
        p.knockZ = dz * speed;
        p.knockLeft = SnBalance.BIG.knockTime;
    }
    tryAttack(p, angle) {
        const e = this.engine;
        if (p.life !== "alive" || e.time < p.nextShotAt || p.building(e.time))
            return false;
        const team = e.teams[p.team];
        if (!p.bigBall && team.snow < SnBalance.SHOT.cost) {
            e.emit({ t: "noSnow", id: p.num });
            p.nextShotAt = e.time + SnBalance.SHOT.interval;
            return false;
        }
        const a = angle === null ? e.aim.angle(p) : angle;
        p.yaw = a;
        p.nextShotAt = e.time + SnBalance.SHOT.interval;
        const level = e.map.levelAt(p.x, p.z);
        const sx = p.x + Math.cos(a) * SnBalance.SHOT.spawn, sz = p.z + Math.sin(a) * SnBalance.SHOT.spawn;
        const id = e.nextId();
        let shot;
        if (p.bigBall) {
            p.bigBall = false;
            shot = new SnBigBall(id, p, sx, sz, a, level);
        }
        else {
            team.snow -= SnBalance.SHOT.cost;
            shot = new SnSnowball(id, p, sx, sz, a, level);
        }
        e.shots.push(shot);
        e.emit({ t: "shot", id, by: p.num, x: sx, z: sz, a, big: shot.big, lv: level });
        return true;
    }
}
class SnWallWorks {
    constructor(engine) {
        this.engine = engine;
    }
    footprint(p, facing) {
        const e = this.engine, d = SnBalance.WALL.distance;
        const x = p.x + Math.cos(facing) * d, z = p.z + Math.sin(facing) * d;
        return new SnWall(-1, p.team, p.num, x, z, facing, e.map.levelAt(p.x, p.z), e.time, e.time + SnBalance.WALL.buildTime);
    }
    fits(p, w) {
        const e = this.engine, map = e.map;
        const home = SnGridMath.indexAt(p.x, p.z);
        if (home < 0 || map.isRamp(home))
            return false;
        const level = map.level[home];
        for (const pt of w.samplePoints()) {
            const idx = SnGridMath.indexAt(pt.x, pt.z);
            if (idx < 0 || !map.walkable(idx) || map.isRamp(idx) || map.level[idx] !== level)
                return false;
            if (map.obstacleAt(pt.x, pt.z, 0))
                return false;
            for (const other of e.walls)
                if (other.distanceTo(pt.x, pt.z) < 0.05)
                    return false;
        }
        for (const q of e.players) {
            if (q.life !== "alive" && q.life !== "down")
                continue;
            if (w.distanceTo(q.x, q.z) < SnBalance.RADIUS)
                return false;
        }
        return true;
    }
    tryBuild(p, angle) {
        const e = this.engine;
        if (p.life !== "alive" || e.time < p.nextWallAt || p.building(e.time))
            return false;
        const team = e.teams[p.team];
        if (team.snow < SnBalance.WALL.cost) {
            e.emit({ t: "noSnow", id: p.num });
            return false;
        }
        const facing = angle === null ? p.yaw : angle;
        const draft = this.footprint(p, facing);
        if (!this.fits(p, draft)) {
            e.emit({ t: "noWall", id: p.num });
            return false;
        }
        const w = new SnWall(e.nextId(), p.team, p.num, draft.x, draft.z, facing, draft.level, e.time, e.time + SnBalance.WALL.buildTime);
        team.snow -= SnBalance.WALL.cost;
        p.yaw = facing;
        p.buildUntil = w.readyAt;
        p.buildingWall = w.id;
        p.nextWallAt = e.time + SnBalance.WALL.interval;
        const mine = e.walls.filter((x) => x.team === p.team).sort((a, b) => a.createdAt - b.createdAt);
        while (mine.length >= SnBalance.WALL.perTeam)
            e.removeWall(mine.shift(), false);
        e.walls.push(w);
        e.emit({ t: "wall", id: w.id });
        return true;
    }
    step() {
        const e = this.engine;
        for (const w of e.walls.slice()) {
            if (e.time >= w.expireAt) {
                e.removeWall(w, false);
                continue;
            }
            if (w.solid(e.time) && e.time - e.lastDt < w.readyAt) {
                for (const q of e.players) {
                    if (q.life !== "alive")
                        continue;
                    const out = w.pushOut(q.x, q.z, SnBalance.RADIUS);
                    if (out) {
                        q.x = out.x;
                        q.z = out.z;
                        e.mover.placeFree(q);
                    }
                }
            }
        }
    }
}
class SnLoot {
    constructor(engine) {
        this.engine = engine;
    }
    static deal(map, random) {
        const spots = map.itemSpots.map((_, i) => i);
        for (let i = spots.length - 1; i > 0; i--) {
            const j = random.int(i + 1);
            const t = spots[i];
            spots[i] = spots[j];
            spots[j] = t;
        }
        const chosen = spots.slice(0, SnBalance.CRATES.placed);
        const kinds = [];
        for (let k = 0; k < SnBalance.CRATES.cocoa; k++)
            kinds.push("cocoa");
        for (let k = 0; k < SnBalance.CRATES.big; k++)
            kinds.push("big");
        while (kinds.length < chosen.length)
            kinds.push("gear");
        for (let i = kinds.length - 1; i > 0; i--) {
            const j = random.int(i + 1);
            const t = kinds[i];
            kinds[i] = kinds[j];
            kinds[j] = t;
        }
        return chosen.map((spot, n) => {
            const p = map.itemSpots[spot], key = map.keySpots[spot], kind = kinds[n];
            const item = kind === "gear" ? { kind: "gear", slot: random.pick(SnBalance.GEAR_SLOTS), grade: SnGearRules.rollGrade(random, key) } : { kind };
            return new SnCrate(n, spot, p.x, p.z, key, item);
        });
    }
    canTake(p, item) {
        if (item.kind === "cocoa")
            return p.hp < p.maxHp;
        if (item.kind === "big")
            return !p.bigBall;
        return SnGearRules.canEquip(p.gear[SnGearRules.slotIndex(item.slot)], item.grade);
    }
    apply(p, item) {
        if (item.kind === "cocoa") {
            p.hp = Math.min(p.maxHp, p.hp + p.maxHp * SnBalance.COCOA_RATIO);
            return;
        }
        if (item.kind === "big") {
            p.bigBall = true;
            return;
        }
        const slot = SnGearRules.slotIndex(item.slot);
        if (item.slot === "suit") {
            const before = SnGearRules.suitHp(p.gear[slot]);
            p.gear[slot] = item.grade;
            p.hp += SnGearRules.suitHp(item.grade) - before;
            return;
        }
        p.gear[slot] = item.grade;
    }
    step() {
        const e = this.engine;
        for (const c of e.crates) {
            if (c.taken)
                continue;
            for (const p of e.players) {
                if (p.life !== "alive" || Math.hypot(p.x - c.x, p.z - c.z) > SnBalance.CRATES.open)
                    continue;
                const wasOpen = c.opened;
                c.opened = true;
                if (this.canTake(p, c.item)) {
                    this.apply(p, c.item);
                    c.taken = true;
                    e.emit({ t: "crate", i: c.num, open: true, taken: true, by: p.num });
                    break;
                }
                if (!wasOpen)
                    e.emit({ t: "crate", i: c.num, open: true, taken: false, by: p.num });
            }
        }
        for (const pile of e.piles) {
            if (pile.taken)
                continue;
            for (const p of e.players) {
                if (p.life !== "alive" || Math.hypot(p.x - pile.x, p.z - pile.z) > SnBalance.SNOW.pileReach + SnBalance.RADIUS)
                    continue;
                const team = e.teams[p.team], got = Math.min(SnBalance.SNOW.pile, team.room());
                if (got <= 0)
                    continue;
                team.snow += got;
                p.collected += got;
                pile.taken = true;
                e.emit({ t: "pile", i: pile.num, by: p.num });
                break;
            }
        }
        for (const p of e.players) {
            if (p.life !== "alive")
                continue;
            const team = e.teams[p.team];
            const got = e.snow.take(SnGridMath.indexAt(p.x, p.z), team.room());
            if (got) {
                team.snow += got;
                p.collected += got;
            }
        }
    }
}
class SnReviveRules {
    constructor(engine) {
        this.engine = engine;
    }
    patient(p) {
        const e = this.engine;
        let best = null, bd = SnBalance.REVIVE.reach;
        for (const q of e.teams[p.team].members) {
            if (q === p || !q.canBeRevived())
                continue;
            const d = Math.hypot(q.x - p.x, q.z - p.z);
            if (d <= bd) {
                bd = d;
                best = q;
            }
        }
        return best;
    }
    step(p, holding, dt) {
        const e = this.engine;
        const q = holding && e.mode === "duos" && p.life === "alive" ? this.patient(p) : null;
        if (!q) {
            p.reviveTarget = -1;
            p.reviveProgress = 0;
            return false;
        }
        if (p.reviveTarget !== q.num) {
            p.reviveTarget = q.num;
            p.reviveProgress = 0;
        }
        p.reviveProgress += dt;
        if (p.reviveProgress >= SnBalance.REVIVE.time) {
            q.life = "alive";
            q.hp = SnBalance.REVIVE.hp;
            q.guardUntil = e.time + SnBalance.REVIVE.guard;
            q.revivesUsed++;
            q.knockLeft = 0;
            e.mover.placeFree(q);
            p.reviveTarget = -1;
            p.reviveProgress = 0;
            e.emit({ t: "revive", id: q.num, by: p.num });
        }
        return true;
    }
}
class SnDropRules {
    constructor(engine) {
        this.engine = engine;
    }
    setup() {
        const e = this.engine;
        for (const t of e.teams)
            if (t.leader.bot)
                t.botPickAt = e.random.range(SnBalance.DROP.botPickMin, SnBalance.DROP.botPickMax);
    }
    randomTarget() {
        const e = this.engine, map = e.map;
        let total = 0;
        const weights = [];
        for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
            const w = map.kind[idx] === SnTile.FLAT ? (map.zone[idx] === "village" || map.zone[idx] === "lookout" ? SnBalance.DROP.keyWeight : 1) : 0;
            weights.push(w);
            total += w;
        }
        let roll = e.random.next() * total;
        for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
            roll -= weights[idx];
            if (roll < 0)
                return { x: SnGridMath.centerX(idx), z: SnGridMath.centerZ(idx) };
        }
        return { x: 0, z: 0 };
    }
    choose(team, x, z) {
        const e = this.engine, map = e.map;
        if (team.dropAt >= 0 || e.time > SnBalance.DROP.pickLimit + 1e-9)
            return false;
        const center = map.nearestWalkable(x, z);
        if (center < 0)
            return false;
        const cx = SnGridMath.centerX(center), cz = SnGridMath.centerZ(center);
        team.dropAt = e.time;
        team.dropX = cx;
        team.dropZ = cz;
        const used = [];
        for (const p of team.members) {
            let spot = null;
            for (let tries = 0; tries < 60 && !spot; tries++) {
                const a = e.random.range(0, Math.PI * 2), d = Math.sqrt(e.random.next()) * SnBalance.DROP.spread;
                const idx = SnGridMath.indexAt(cx + Math.cos(a) * d, cz + Math.sin(a) * d);
                if (idx < 0 || !map.standable(idx))
                    continue;
                const sx = SnGridMath.centerX(idx), sz = SnGridMath.centerZ(idx);
                if (used.some((u) => Math.hypot(u.x - sx, u.z - sz) < SnBalance.DROP.gap))
                    continue;
                spot = { x: sx, z: sz };
            }
            if (!spot)
                spot = { x: cx, z: cz };
            used.push(spot);
            p.spotX = spot.x;
            p.spotZ = spot.z;
            p.skyX = 0;
            p.skyZ = 0;
            p.x = spot.x;
            p.z = spot.z;
            p.landAt = e.time + SnBalance.DROP.time;
        }
        e.emit({ t: "drop", team: team.num, x: cx, z: cz });
        return true;
    }
    step(dt) {
        const e = this.engine;
        for (const t of e.teams) {
            if (t.dropAt >= 0)
                continue;
            if ((t.botPickAt >= 0 && e.time >= t.botPickAt) || e.time >= SnBalance.DROP.pickLimit) {
                const spot = this.randomTarget();
                this.choose(t, spot.x, spot.z);
            }
        }
        for (const p of e.players) {
            if (p.life !== "sky" || p.landAt < 0)
                continue;
            const intent = e.intents[p.num];
            if (intent) {
                p.skyX += intent.moveX * SnBalance.DROP.steer * dt;
                p.skyZ += intent.moveZ * SnBalance.DROP.steer * dt;
                const len = Math.hypot(p.skyX, p.skyZ);
                if (len > SnBalance.DROP.steerMax) {
                    p.skyX *= SnBalance.DROP.steerMax / len;
                    p.skyZ *= SnBalance.DROP.steerMax / len;
                }
            }
            p.x = p.spotX + p.skyX;
            p.z = p.spotZ + p.skyZ;
            if (e.time >= p.landAt)
                this.land(p);
        }
    }
    land(p) {
        const e = this.engine;
        p.life = "alive";
        const idx = SnGridMath.indexAt(p.x, p.z);
        if (idx < 0 || !e.map.standable(idx)) {
            const near = e.map.nearestWalkable(p.x, p.z);
            if (near >= 0) {
                p.x = SnGridMath.centerX(near);
                p.z = SnGridMath.centerZ(near);
            }
        }
        e.mover.placeFree(p);
        e.emit({ t: "land", id: p.num });
    }
}
class SnStormRules {
    constructor(engine) {
        this.engine = engine;
        this.nextTick = 0;
        this.announced = new Set();
    }
    step() {
        const e = this.engine;
        this.announce();
        if (e.time < this.nextTick)
            return;
        this.nextTick = (Math.floor(e.time / SnBalance.STORM_TICK) + 1) * SnBalance.STORM_TICK;
        const s = e.storm.state(e.time);
        if (s.dps <= 0)
            return;
        for (const p of e.players) {
            if (p.life !== "alive" || Math.hypot(p.x - s.x, p.z - s.z) <= s.r)
                continue;
            e.combat.hurt(p, null, s.dps * SnBalance.STORM_TICK, 0);
        }
    }
    announce() {
        const e = this.engine;
        for (const row of SnBalance.STORM_ROWS) {
            if (row.phase !== "shrink" && row.phase !== "full")
                continue;
            if (row.phase === "shrink" && e.time >= row.start - SnBalance.STORM_WARN && !this.announced.has("w" + row.stage)) {
                this.announced.add("w" + row.stage);
                e.emit({ t: "storm", stage: row.stage, what: "warn" });
            }
            if (e.time >= row.start && !this.announced.has("s" + row.stage)) {
                this.announced.add("s" + row.stage);
                e.emit({ t: "storm", stage: row.stage, what: row.phase === "full" ? "full" : "shrink" });
            }
        }
    }
}
class SnScoreboard {
    static ranks(teams) {
        const order = teams.map((t) => (t.out ? t.outTick : Infinity));
        return order.map((mine) => 1 + order.filter((other) => other > mine).length);
    }
}
class SnIdleIntent {
    static make() { return { moveX: 0, moveZ: 0, attack: false, attackAngle: null, wall: false, wallAngle: null, holdK: false, dropPick: null }; }
}
class SnEngine {
    constructor(config) {
        this.config = config;
        this.map = SnMap.shared();
        this.players = [];
        this.teams = [];
        this.shots = [];
        this.walls = [];
        this.mover = new SnMover(this);
        this.aim = new SnAutoAim(this);
        this.combat = new SnCombat(this);
        this.wallWorks = new SnWallWorks(this);
        this.loot = new SnLoot(this);
        this.revive = new SnReviveRules(this);
        this.drops = new SnDropRules(this);
        this.stormRules = new SnStormRules(this);
        this.pilots = new Map();
        this.intents = [];
        this.time = 0;
        this.tick = 0;
        this.lastDt = 0;
        this.ended = false;
        this.endAt = -1;
        this.events = [];
        this.idCounter = 0;
        this.random = new SnSeededRandom(config.seed);
        this.mode = config.mode;
        config.teams.forEach((rt, ti) => {
            const members = rt.members.map((m) => {
                const p = new SnPlayer(this.players.length, m.id, m.nick, ti, m.bot);
                this.players.push(p);
                return p;
            });
            this.teams.push(new SnTeam(ti, members));
        });
        this.snow = new SnSnowField(this.map);
        this.storm = new SnStormPlan(this.map, new SnSeededRandom(config.seed ^ 0x5bd1e995));
        const lootRandom = new SnSeededRandom(config.seed ^ 0x27d4eb2f);
        this.crates = SnLoot.deal(this.map, lootRandom);
        this.piles = this.map.pileSpots.map((p, i) => new SnPile(i, p.x, p.z));
        this.drops.setup();
    }
    nextId() { return ++this.idCounter; }
    emit(ev) { this.events.push(ev); }
    attach(num, pilot) { this.pilots.set(num, pilot); }
    teamOf(p) { return this.teams[p.team]; }
    chooseDrop(teamNum, x, z) { return this.drops.choose(this.teams[teamNum], x, z); }
    update(dt) {
        this.events = [];
        if (this.ended)
            return this.events;
        this.time += dt;
        this.tick++;
        this.lastDt = dt;
        this.intents = this.players.map((p) => {
            const pilot = this.pilots.get(p.num);
            return pilot && (p.life === "alive" || p.life === "sky") ? pilot.decide(this, p, dt) : SnIdleIntent.make();
        });
        for (const p of this.players) {
            const pick = this.intents[p.num].dropPick;
            if (pick && p.life === "sky" && this.teams[p.team].leader === p)
                this.drops.choose(this.teams[p.team], pick.x, pick.z);
        }
        this.drops.step(dt);
        for (const p of this.players)
            this.movePlayer(p, dt);
        for (const p of this.players)
            this.actPlayer(p, dt);
        for (const s of this.shots)
            s.step(this, dt);
        for (let k = this.shots.length - 1; k >= 0; k--)
            if (this.shots[k].done)
                this.shots.splice(k, 1);
        this.wallWorks.step();
        this.loot.step();
        this.stormRules.step();
        if (this.snow.changed.length) {
            this.emit({ t: "snow", tiles: this.snow.changed.slice() });
            this.snow.changed.length = 0;
        }
        this.judge();
        return this.events;
    }
    movePlayer(p, dt) {
        if (p.life !== "alive") {
            p.vx = 0;
            p.vz = 0;
            return;
        }
        const ox = p.x, oz = p.z;
        if (p.knockLeft > 0) {
            const step = Math.min(dt, p.knockLeft);
            this.mover.move(p, p.knockX, p.knockZ, step, true);
            p.knockLeft -= step;
        }
        else if (!p.building(this.time)) {
            const it = this.intents[p.num];
            let mx = it.moveX, mz = it.moveZ;
            const m = Math.hypot(mx, mz);
            if (m > 1) {
                mx /= m;
                mz /= m;
            }
            if (m > 0.05) {
                this.mover.move(p, mx * p.speed, mz * p.speed, dt, false);
                p.yaw = Math.atan2(mz, mx);
            }
        }
        if (p.external && p.knockLeft <= 0)
            return;
        p.vx = (p.x - ox) / dt;
        p.vz = (p.z - oz) / dt;
        if (Math.hypot(p.vx, p.vz) > 0.1)
            p.movedAt = this.time;
    }
    placeExternal(num, x, z, yaw, elapsed) {
        const p = this.players[num];
        if (!p || p.life !== "alive" || p.knockLeft > 0 || p.building(this.time))
            return false;
        const jump = Math.hypot(x - p.x, z - p.z);
        if (jump > p.speed * Math.max(0.1, elapsed) * 1.6 + 0.6)
            return false;
        const old = { x: p.x, z: p.z };
        p.x = x;
        p.z = z;
        if (!this.mover.canStand(p, x, z, false) && this.mover.blocked(p, x, z)) {
            p.x = old.x;
            p.z = old.z;
            return false;
        }
        p.yaw = yaw;
        const span = Math.max(0.05, elapsed);
        p.vx = (x - old.x) / span;
        p.vz = (z - old.z) / span;
        if (jump > 0.05)
            p.movedAt = this.time;
        return true;
    }
    actPlayer(p, dt) {
        if (p.life !== "alive") {
            p.reviveTarget = -1;
            p.reviveProgress = 0;
            return;
        }
        const it = this.intents[p.num];
        const reviving = this.revive.step(p, it.holdK, dt);
        if (reviving)
            return;
        if (it.wall)
            this.wallWorks.tryBuild(p, it.wallAngle);
        if (it.attack)
            this.combat.tryAttack(p, it.attackAngle);
        else if (it.holdK)
            this.combat.tryAttack(p, null);
    }
    knockDown(p, by) {
        p.hp = 0;
        p.downAt = this.time;
        p.killedBy = by ? by.num : -1;
        p.knockLeft = 0;
        p.reviveTarget = -1;
        p.reviveProgress = 0;
        if (by && by.team !== p.team)
            by.kills++;
        if (p.building(this.time)) {
            const w = this.walls.find((x) => x.id === p.buildingWall);
            if (w)
                this.removeWall(w, false);
            p.buildUntil = 0;
        }
        p.life = this.mode === "solo" ? "out" : "down";
        this.emit({ t: "down", id: p.num, by: p.killedBy });
        for (const q of this.players)
            if (q.reviveTarget === p.num) {
                q.reviveTarget = -1;
                q.reviveProgress = 0;
            }
        this.checkTeam(this.teams[p.team]);
    }
    disconnect(num) {
        const p = this.players[num];
        if (!p || p.life === "out")
            return;
        p.revivesUsed = SnBalance.REVIVE.max;
        if (p.life === "alive" || p.life === "sky") {
            p.hp = 0;
            p.downAt = this.time;
            p.life = this.mode === "solo" ? "out" : "down";
            this.emit({ t: "down", id: p.num, by: -1 });
        }
        this.checkTeam(this.teams[p.team]);
    }
    checkTeam(t) {
        if (t.out)
            return;
        if (t.members.some((m) => m.life === "alive" || m.life === "sky"))
            return;
        t.outTick = this.tick;
        t.outAt = this.time;
        for (const m of t.members)
            m.life = "out";
        this.emit({ t: "teamOut", team: t.num });
    }
    removeWall(w, broken) {
        const k = this.walls.indexOf(w);
        if (k < 0)
            return;
        this.walls.splice(k, 1);
        this.emit({ t: "wallGone", id: w.id, broken });
    }
    judge() {
        const alive = this.teams.filter((t) => !t.out);
        if (alive.length <= 1 || this.time >= SnBalance.SAFETY_END) {
            this.ended = true;
            this.endAt = this.time;
            this.emit({ t: "end" });
        }
    }
    ranks() { return SnScoreboard.ranks(this.teams); }
    survival(p) {
        if (p.life === "out" || p.life === "down")
            return Math.max(0, p.downAt);
        return this.ended ? this.endAt : this.time;
    }
    stormNow() { return this.storm.state(this.time); }
}
class SnSnapshotCodec {
    static encodePlayer(p, time) {
        const flags = (p.bigBall ? 1 : 0) | (p.building(time) ? 2 : 0) | (p.guarded(time) ? 4 : 0) | (p.knockLeft > 0 ? 8 : 0);
        return [
            Math.round(p.x * 100), Math.round(p.z * 100), Math.round(p.yaw * 100), SnSnapshotCodec.LIVES.indexOf(p.life),
            Math.round(p.hp * 10), p.gear[0], p.gear[1], p.gear[2], flags, p.kills, p.revivesUsed,
            p.reviveTarget, Math.round(p.reviveProgress * 10), Math.round(p.landAt * 10), p.killedBy,
        ].join(",");
    }
    static decodePlayer(s) {
        const v = s.split(",").map(Number);
        return {
            x: v[0] / 100, z: v[1] / 100, yaw: v[2] / 100, life: SnSnapshotCodec.LIVES[v[3]], hp: v[4] / 10,
            gear: [v[5], v[6], v[7]], bigBall: !!(v[8] & 1), building: !!(v[8] & 2), guarded: !!(v[8] & 4), knocked: !!(v[8] & 8),
            kills: v[9], revivesUsed: v[10], reviveTarget: v[11], reviveProgress: v[12] / 10, landAt: v[13] / 10, killedBy: v[14],
        };
    }
    static encodeTeams(teams) {
        return teams.map((t) => [t.snow, t.outTick, Math.round(t.dropAt * 10), Math.round(t.dropX * 10), Math.round(t.dropZ * 10)].join(":")).join(",");
    }
    static decodeTeams(s) {
        return s.split(",").map((part) => { const v = part.split(":").map(Number); return { snow: v[0], outTick: v[1], dropAt: v[2] / 10, dropX: v[3] / 10, dropZ: v[4] / 10 }; });
    }
    static encodeWalls(walls) {
        return walls.map((w) => [w.id, w.team, w.owner, Math.round(w.x * 100), Math.round(w.z * 100), Math.round(w.facing * 1000), w.level, Math.round(w.hp), Math.round(w.createdAt * 10), Math.round(w.readyAt * 10)].join(",")).join(";");
    }
    static decodeWalls(s) {
        if (!s)
            return [];
        return s.split(";").map((part) => {
            const v = part.split(",").map(Number);
            const w = new SnWall(v[0], v[1], v[2], v[3] / 100, v[4] / 100, v[5] / 1000, v[6], v[8] / 10, v[9] / 10);
            w.hp = v[7];
            return w;
        });
    }
    static encodeLoot(crates, piles) {
        return crates.map((c) => (c.taken ? "2" : c.opened ? "1" : "0")).join("") + "|" + piles.map((p) => (p.taken ? "1" : "0")).join("");
    }
    static applyLoot(s, crates, piles) {
        const [c, p] = s.split("|");
        crates.forEach((crate, k) => { crate.opened = c[k] !== "0"; crate.taken = c[k] === "2"; });
        piles.forEach((pile, k) => { pile.taken = (p || "")[k] === "1"; });
    }
    static encodeSnow(amount) {
        let text = "";
        for (let k = 0; k < amount.length; k += 6) {
            let bits = 0;
            for (let b = 0; b < 6; b++)
                if (k + b < amount.length && amount[k + b] > 0)
                    bits |= 1 << b;
            text += SnSnapshotCodec.ALPHABET[bits];
        }
        return text;
    }
    static applySnow(s, amount) {
        const cleared = [];
        for (let k = 0; k < s.length; k++) {
            const bits = SnSnapshotCodec.ALPHABET.indexOf(s[k]);
            for (let b = 0; b < 6; b++) {
                const idx = k * 6 + b;
                if (idx >= amount.length)
                    break;
                if (!(bits & (1 << b)) && amount[idx] > 0) {
                    amount[idx] = 0;
                    cleared.push(idx);
                }
            }
        }
        return cleared;
    }
}
SnSnapshotCodec.LIVES = ["sky", "alive", "down", "out"];
SnSnapshotCodec.ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
