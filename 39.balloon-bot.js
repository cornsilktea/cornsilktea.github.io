"use strict";
class WbBotTuning {
}
WbBotTuning.LEVELS = {
    easy: { think: 0.40, missChain: 0.15, aim: 0, needleDelay: 1.5, reaction: 0.35 },
    normal: { think: 0.20, missChain: 0.04, aim: 1, needleDelay: 0.8, reaction: 0.15 },
    hard: { think: 0.12, missChain: 0, aim: 2, needleDelay: 0.2, reaction: 0.05 },
};
WbBotTuning.FINISH_STEPS = 3;
WbBotTuning.RESCUE_STEPS = 5;
WbBotTuning.ITEM_STEPS = 6;
WbBotTuning.BOX_STEPS = 9;
WbBotTuning.AIM_STEPS = 6;
WbBotTuning.ALLY_WAIT = 2;
WbBotTuning.STUCK = 1;
WbBotTuning.SUDDEN_LOOK = 3;
WbBotTuning.SAFE_MARGIN = 3;
WbBotTuning.PASS_MARGIN = 9;
WbBotTuning.DEAD_END = 0.5;
WbBotTuning.ARRIVE = 0.12;
WbBotTuning.CENTER_PULL = 0.14;
WbBotTuning.BOX_CANDIDATES = 5;
WbBotTuning.AIM_CANDIDATES = 8;
WbBotTuning.TRAP_ESCAPES = 2;
WbBotTuning.HUNT_NEAR = 3;
WbBotTuning.ESCAPE_SPARE = 0.6;
WbBotTuning.ESCAPE_CHOICES = 2;
WbBotTuning.BOLD_FROM = 150;
WbBotTuning.BOLD_SPARE = 0.2;
WbBotTuning.BOLD_CHOICES = 1;
WbBotTuning.HUNT_FAR = 14;
class WbDangerMap {
    constructor(engine, blindChain, extra) {
        this.spans = [];
        for (let k = 0; k < WbGrid.COUNT; k++)
            this.spans.push([]);
        const now = engine.tick;
        for (let k = 0; k < WbGrid.COUNT; k++)
            if (engine.wetUntil[k] > now)
                this.spans[k].push({ from: now, to: engine.wetUntil[k] });
        const list = engine.balloons.map((b) => ({ cell: b.cell, i: b.i, j: b.j, range: b.range, time: b.explodeAt, done: false }));
        if (extra)
            list.push({ cell: WbGrid.index(extra.i, extra.j), i: extra.i, j: extra.j, range: extra.range, time: extra.time, done: false });
        const flow = WbBalance.ticks(WbBalance.FLOW);
        for (;;) {
            let next = null;
            for (const v of list)
                if (!v.done && (!next || v.time < next.time))
                    next = v;
            if (!next)
                break;
            next.done = true;
            for (const k of WbFairBoxLayout.wetCross(engine.grid, next.i, next.j, next.range)) {
                this.spans[k].push({ from: next.time, to: next.time + flow });
                if (blindChain)
                    continue;
                for (const v of list)
                    if (!v.done && v.cell === k && v.time > next.time)
                        v.time = next.time;
            }
        }
        const s = engine.sudden, look = WbBalance.ticks(WbBotTuning.SUDDEN_LOOK);
        s.order.forEach((k, n) => {
            if (s.warnAt[n] - look <= now && s.landAt[n] >= now)
                this.spans[k].push({ from: s.landAt[n] - WbBotTuning.SAFE_MARGIN * 2, to: Infinity });
        });
    }
    safeAfter(cell, tick) {
        for (const s of this.spans[cell])
            if (s.to > tick)
                return false;
        return true;
    }
    clearDuring(cell, a, b) {
        for (const s of this.spans[cell])
            if (s.from < b && s.to > a)
                return false;
        return true;
    }
}
class WbPathFinder {
    constructor(engine, start, speed, startTick, danger, maxSteps, dirs = WbPathFinder.DIRS) {
        this.engine = engine;
        this.dist = new Int16Array(WbGrid.COUNT).fill(-1);
        this.prev = new Int16Array(WbGrid.COUNT).fill(-1);
        this.arrive = new Float64Array(WbGrid.COUNT).fill(Infinity);
        this.order = [];
        const stepTicks = WbBalance.RATE / speed;
        const margin = WbBotTuning.PASS_MARGIN;
        this.dist[start] = 0;
        this.arrive[start] = startTick;
        this.order.push(start);
        for (let head = 0; head < this.order.length; head++) {
            const k = this.order[head];
            if (this.dist[k] >= maxSteps)
                continue;
            const i = WbGrid.col(k), j = WbGrid.row(k);
            for (const d of dirs) {
                const ni = i + WbDir.DX[d], nj = j + WbDir.DZ[d];
                if (engine.grid.blocked(ni, nj) || engine.balloonAt(ni, nj) >= 0)
                    continue;
                const nk = WbGrid.index(ni, nj);
                if (this.dist[nk] >= 0)
                    continue;
                const at = this.arrive[k] + stepTicks;
                if (!danger.clearDuring(nk, this.arrive[k] - margin, at + stepTicks * 0.5 + margin))
                    continue;
                this.dist[nk] = this.dist[k] + 1;
                this.prev[nk] = k;
                this.arrive[nk] = at;
                this.order.push(nk);
            }
        }
    }
    reachable(cell) { return this.dist[cell] >= 0; }
    path(target) {
        const cells = [];
        for (let k = target; k >= 0; k = this.prev[k])
            cells.unshift(k);
        return cells;
    }
    nearestSafe(danger, exclude) {
        let best = -1;
        for (const k of this.order) {
            if (k === exclude || !danger.safeAfter(k, this.arrive[k] - WbBotTuning.SAFE_MARGIN))
                continue;
            if (best < 0 || this.refugeCost(k) < this.refugeCost(best))
                best = k;
        }
        return best;
    }
    refugeCost(k) {
        const i = WbGrid.col(k), j = WbGrid.row(k);
        let open = 0;
        for (let d = 0; d < 4; d++) {
            const ni = i + WbDir.DX[d], nj = j + WbDir.DZ[d];
            if (!this.engine.grid.blocked(ni, nj) && this.engine.balloonAt(ni, nj) < 0)
                open++;
        }
        return this.arrive[k] + (open <= 1 ? WbBalance.ticks(WbBotTuning.DEAD_END) : 0);
    }
    safeCount(danger, exclude) {
        let n = 0;
        for (const k of this.order)
            if (k !== exclude && danger.safeAfter(k, this.arrive[k] - WbBotTuning.SAFE_MARGIN))
                n++;
        return n;
    }
}
WbPathFinder.DIRS = [0, 1, 2, 3];
class WbBotBrain {
    constructor(index, difficulty, seed) {
        this.index = index;
        this.bot = true;
        this.stuckTicks = 0;
        this.stuckEvents = 0;
        this.kPress = 0;
        this.dirs = [0, 1, 2, 3];
        this.path = [];
        this.placeOnArrive = false;
        this.dangerSeen = -1;
        this.needleAt = -1;
        this.lastX = -1;
        this.lastZ = -1;
        this.level = WbBotTuning.LEVELS[difficulty];
        this.rng = new WbSeededRandom((seed * 31 + index * 977) >>> 0);
        this.nextThink = -WbBalance.ticks(WbBalance.COUNTDOWN) + this.rng.int(WbBalance.ticks(this.level.think));
        this.rng.shuffle(this.dirs);
    }
    decide(engine, me) {
        if (engine.tick < 0)
            return { move: WbDir.NONE, alt: WbDir.NONE, kPress: this.kPress };
        if (me.life === "trapped")
            return this.trapped(engine, me);
        this.needleAt = -1;
        if (engine.tick >= this.nextThink) {
            this.nextThink = engine.tick + Math.max(1, WbBalance.ticks(this.level.think));
            this.think(engine, me);
        }
        this.watchStuck(engine, me);
        return this.follow(engine, me);
    }
    watchStuck(engine, me) {
        const still = Math.abs(me.x - this.lastX) < 1e-4 && Math.abs(me.z - this.lastZ) < 1e-4;
        this.lastX = me.x;
        this.lastZ = me.z;
        const wantsToMove = this.path.length > 1;
        this.stuckTicks = still && wantsToMove ? this.stuckTicks + 1 : 0;
        if (this.stuckTicks >= WbBalance.ticks(WbBotTuning.STUCK)) {
            this.stuckEvents++;
            this.stuckTicks = 0;
            this.path = [];
            this.placeOnArrive = false;
            this.nextThink = engine.tick + 1;
        }
    }
    trapped(engine, me) {
        this.path = [];
        this.placeOnArrive = false;
        const allies = engine.players.filter((p) => p !== me && p.life === "alive" && engine.allies(p, me));
        const nearAlly = allies.some((a) => Math.abs(a.x - me.x) + Math.abs(a.z - me.z) <= WbBotTuning.ALLY_WAIT);
        if (me.needles > 0) {
            if (this.needleAt < 0)
                this.needleAt = engine.tick + WbBalance.ticks(this.level.needleDelay);
            const lastChance = me.trapUntil - engine.tick <= WbBalance.ticks(0.5);
            if (engine.tick >= this.needleAt && (!nearAlly || lastChance)) {
                this.kPress++;
                this.needleAt = -1;
            }
        }
        const goal = allies.length ? this.closest(me, allies) : null;
        if (goal)
            return this.steerToward(me, goal.x, goal.z);
        const foes = engine.players.filter((p) => p.life !== "out" && !engine.allies(p, me) && p !== me);
        const foe = this.closest(me, foes);
        if (!foe)
            return { move: WbDir.NONE, alt: WbDir.NONE, kPress: this.kPress };
        return this.steerToward(me, me.x * 2 - foe.x, me.z * 2 - foe.z);
    }
    closest(me, list) {
        let best = null;
        for (const p of list)
            if (!best || Math.hypot(p.x - me.x, p.z - me.z) < Math.hypot(best.x - me.x, best.z - me.z))
                best = p;
        return best;
    }
    steerToward(me, x, z) {
        const dx = x - me.x, dz = z - me.z;
        const horiz = Math.abs(dx) >= Math.abs(dz);
        const move = horiz ? (dx > 0 ? WbDir.RIGHT : WbDir.LEFT) : (dz > 0 ? WbDir.DOWN : WbDir.UP);
        const alt = horiz ? (dz > 0 ? WbDir.DOWN : WbDir.UP) : (dx > 0 ? WbDir.RIGHT : WbDir.LEFT);
        return { move, alt, kPress: this.kPress };
    }
    think(engine, me) {
        const danger = new WbDangerMap(engine, this.rng.next() < this.level.missChain, null);
        const finder = new WbPathFinder(engine, me.cell, me.speed(), engine.tick, danger, 40, this.dirs);
        if (!danger.safeAfter(me.cell, engine.tick)) {
            if (this.dangerSeen < 0)
                this.dangerSeen = engine.tick;
            const react = WbBalance.ticks(this.level.reaction);
            if (engine.tick - this.dangerSeen < react) {
                this.nextThink = this.dangerSeen + react;
                return;
            }
            const refuge = finder.nearestSafe(danger, -1);
            this.go(finder, refuge >= 0 ? refuge : this.leastBad(finder, danger), false);
            return;
        }
        this.dangerSeen = -1;
        if (this.chaseTrapped(engine, me, finder, danger))
            return;
        if (this.collectItem(engine, me, finder, danger))
            return;
        if (this.attack(engine, me, finder, danger))
            return;
        if (this.hunt(engine, me, finder, danger, WbBotTuning.HUNT_NEAR))
            return;
        if (this.breakBoxes(engine, me, finder, danger))
            return;
        if (this.hunt(engine, me, finder, danger, engine.seconds >= WbBotTuning.BOLD_FROM ? WbGrid.COUNT : WbBotTuning.HUNT_FAR))
            return;
        this.wander(finder, danger);
    }
    leastBad(finder, danger) {
        let best = -1, bestFrom = -Infinity;
        for (const k of finder.order) {
            const from = Math.min(...danger.spans[k].map((s) => s.from), Infinity);
            if (from > bestFrom) {
                bestFrom = from;
                best = k;
            }
        }
        return best;
    }
    go(finder, cell, place) {
        this.path = cell >= 0 ? finder.path(cell) : [];
        this.placeOnArrive = place && cell >= 0;
    }
    chaseTrapped(engine, me, finder, danger) {
        let best = -1;
        for (const p of engine.players) {
            if (p === me || p.life !== "trapped")
                continue;
            const friend = engine.allies(p, me);
            const limit = friend ? WbBotTuning.RESCUE_STEPS : WbBotTuning.FINISH_STEPS;
            const k = p.cell;
            if (!finder.reachable(k) || finder.dist[k] > limit || !danger.safeAfter(k, finder.arrive[k] + WbBotTuning.SAFE_MARGIN))
                continue;
            if (best < 0 || finder.dist[k] < finder.dist[best])
                best = k;
        }
        if (best < 0)
            return false;
        this.go(finder, best, false);
        return true;
    }
    wants(engine, me, item) {
        const probe = new WbPlayer(-1, "", "", true, -1);
        probe.balloonsMax = me.balloonsMax;
        probe.range = me.range;
        probe.shoe = me.shoe;
        probe.needles = me.needles;
        probe.kick = me.kick;
        return !WbLootTable.create(item.kind, item.grade).apply(probe, engine.tick).max;
    }
    collectItem(engine, me, finder, danger) {
        let best = -1, bestGrade = -1;
        for (const [k, item] of engine.floor) {
            if (!finder.reachable(k) || finder.dist[k] > WbBotTuning.ITEM_STEPS || !this.wants(engine, me, item))
                continue;
            if (!danger.safeAfter(k, finder.arrive[k]))
                continue;
            if (best < 0 || finder.dist[k] < finder.dist[best] || (finder.dist[k] === finder.dist[best] && item.grade > bestGrade)) {
                best = k;
                bestGrade = item.grade;
            }
        }
        if (best < 0)
            return false;
        this.go(finder, best, false);
        return true;
    }
    canPlace(engine, me) {
        return engine.activeBalloons(me.index) < me.balloonsMax;
    }
    safeToPlace(engine, me, cell, atTick) {
        if (engine.balloonIdAt(cell) >= 0)
            return false;
        const i = WbGrid.col(cell), j = WbGrid.row(cell);
        const danger = new WbDangerMap(engine, false, { i, j, range: me.range, time: atTick + WbBalance.ticks(WbBalance.FUSE) });
        const finder = new WbPathFinder(engine, cell, me.speed(), atTick, danger, 12, this.dirs);
        const refuge = finder.nearestSafe(danger, cell);
        if (refuge < 0)
            return false;
        const bold = engine.seconds >= WbBotTuning.BOLD_FROM;
        const spare = atTick + WbBalance.ticks(WbBalance.FUSE - (bold ? WbBotTuning.BOLD_SPARE : WbBotTuning.ESCAPE_SPARE)) - finder.arrive[refuge];
        return spare >= 0 && finder.safeCount(danger, cell) >= (bold ? WbBotTuning.BOLD_CHOICES : WbBotTuning.ESCAPE_CHOICES);
    }
    lineHits(engine, from, range, target) {
        return WbFairBoxLayout.wetCross(engine.grid, WbGrid.col(from), WbGrid.row(from), range).has(target);
    }
    attack(engine, me, finder, danger) {
        if (this.level.aim === 0 || !this.canPlace(engine, me))
            return false;
        const foes = engine.players.filter((p) => p !== me && p.life === "alive" && !engine.allies(p, me));
        if (!foes.length)
            return false;
        if (this.level.aim === 1) {
            const aligned = foes.some((f) => this.lineHits(engine, me.cell, me.range, f.cell));
            if (aligned && this.safeToPlace(engine, me, me.cell, engine.tick)) {
                this.placeNow();
                return true;
            }
            return false;
        }
        let best = -1, bestScore = Infinity;
        const candidates = [];
        for (const k of finder.order) {
            if (finder.dist[k] > WbBotTuning.AIM_STEPS || engine.balloonIdAt(k) >= 0)
                continue;
            if (foes.some((f) => Math.abs(WbGrid.col(k) - f.cellI) + Math.abs(WbGrid.row(k) - f.cellJ) <= me.range + 1))
                candidates.push(k);
            if (candidates.length >= WbBotTuning.AIM_CANDIDATES)
                break;
        }
        for (const k of candidates) {
            const at = finder.arrive[k];
            const hypo = new WbDangerMap(engine, false, { i: WbGrid.col(k), j: WbGrid.row(k), range: me.range, time: at + WbBalance.ticks(WbBalance.FUSE) });
            for (const f of foes) {
                if (!this.lineHits(engine, k, me.range, f.cell) && finder.dist[k] > 0)
                    continue;
                const run = new WbPathFinder(engine, f.cell, f.speed(), engine.tick, hypo, 10, this.dirs);
                const escapes = run.safeCount(hypo, -1);
                const score = escapes * 10 + finder.dist[k];
                if (escapes <= WbBotTuning.TRAP_ESCAPES && score < bestScore && this.safeToPlace(engine, me, k, at)) {
                    bestScore = score;
                    best = k;
                }
            }
        }
        if (best < 0)
            return false;
        if (best === me.cell) {
            this.placeNow();
            return true;
        }
        this.go(finder, best, true);
        return true;
    }
    placeNow() {
        this.kPress++;
        this.dangerSeen = -WbBalance.ticks(WbBalance.MATCH);
        this.path = [];
        this.placeOnArrive = false;
        this.nextThink = 0;
    }
    breakBoxes(engine, me, finder, danger) {
        if (!this.canPlace(engine, me))
            return false;
        const scored = [];
        for (const k of finder.order) {
            if (finder.dist[k] > WbBotTuning.BOX_STEPS || engine.balloonIdAt(k) >= 0 || !danger.safeAfter(k, finder.arrive[k]))
                continue;
            let boxes = 0;
            for (const c of WbFairBoxLayout.wetCross(engine.grid, WbGrid.col(k), WbGrid.row(k), me.range)) {
                if (engine.grid.cells[c] === WbCell.BOX && !engine.breaking.has(c) && danger.spans[c].length === 0)
                    boxes++;
            }
            if (boxes > 0)
                scored.push({ cell: k, score: boxes * 3 - finder.dist[k] });
        }
        scored.sort((a, b) => b.score - a.score || a.cell - b.cell);
        for (const c of scored.slice(0, WbBotTuning.BOX_CANDIDATES)) {
            if (!this.safeToPlace(engine, me, c.cell, finder.arrive[c.cell]))
                continue;
            if (c.cell === me.cell) {
                this.placeNow();
                return true;
            }
            this.go(finder, c.cell, true);
            return true;
        }
        return false;
    }
    hunt(engine, me, finder, danger, steps) {
        if (this.level.aim === 0 || !this.canPlace(engine, me))
            return false;
        const foes = engine.players.filter((p) => p !== me && p.life === "alive" && !engine.allies(p, me));
        let best = -1;
        for (const k of finder.order) {
            if (finder.dist[k] > steps || engine.balloonIdAt(k) >= 0 || !danger.safeAfter(k, finder.arrive[k]))
                continue;
            if (!foes.some((f) => this.lineHits(engine, k, me.range, f.cell)))
                continue;
            if (best < 0 || finder.dist[k] < finder.dist[best])
                best = k;
        }
        if (best < 0 || !this.safeToPlace(engine, me, best, finder.arrive[best]))
            return false;
        if (best === me.cell) {
            this.placeNow();
            return true;
        }
        this.go(finder, best, true);
        return true;
    }
    wander(finder, danger) {
        let best = -1, bestScore = Infinity;
        for (const k of finder.order) {
            if (!danger.safeAfter(k, finder.arrive[k]))
                continue;
            const score = Math.abs(WbGrid.col(k) - 7) + Math.abs(WbGrid.row(k) - 6) + this.rng.next() * 0.5;
            if (score < bestScore) {
                bestScore = score;
                best = k;
            }
        }
        this.go(finder, best, false);
    }
    follow(engine, me) {
        const idle = { move: WbDir.NONE, alt: WbDir.NONE, kPress: this.kPress };
        while (this.path.length > 1 && this.path[0] !== me.cell && this.path.indexOf(me.cell) > 0)
            this.path.shift();
        if (!this.path.length)
            return idle;
        if (this.path[0] !== me.cell) {
            this.path = [];
            this.nextThink = engine.tick + 1;
            return idle;
        }
        const here = this.path[0];
        const cx = WbGrid.col(here) + 0.5, cz = WbGrid.row(here) + 0.5;
        if (this.path.length === 1) {
            if (Math.abs(me.x - cx) <= WbBotTuning.ARRIVE && Math.abs(me.z - cz) <= WbBotTuning.ARRIVE) {
                this.path = [];
                if (this.placeOnArrive) {
                    this.placeOnArrive = false;
                    if (this.canPlace(engine, me) && this.safeToPlace(engine, me, here, engine.tick))
                        this.placeNow();
                    else
                        this.nextThink = engine.tick + 1;
                    return { move: WbDir.NONE, alt: WbDir.NONE, kPress: this.kPress };
                }
                return idle;
            }
            return this.steerToward(me, cx, cz);
        }
        const next = this.path[1];
        const dx = WbGrid.col(next) - WbGrid.col(here), dz = WbGrid.row(next) - WbGrid.row(here);
        const move = dx > 0 ? WbDir.RIGHT : dx < 0 ? WbDir.LEFT : dz > 0 ? WbDir.DOWN : WbDir.UP;
        const off = WbDir.horizontal(move) ? me.z - cz : me.x - cx;
        if (Math.abs(off) > WbBotTuning.CENTER_PULL) {
            const pull = WbDir.horizontal(move) ? (off > 0 ? WbDir.UP : WbDir.DOWN) : (off > 0 ? WbDir.LEFT : WbDir.RIGHT);
            return { move: pull, alt: move, kPress: this.kPress };
        }
        return { move, alt: WbDir.NONE, kPress: this.kPress };
    }
}
