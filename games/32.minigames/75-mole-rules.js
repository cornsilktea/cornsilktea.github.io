"use strict";
class MoleRules {
}
MoleRules.GAME_MS = 60000;
MoleRules.CELL_COUNT = 9;
MoleRules.COLUMNS = 3;
MoleRules.LEAD_MS = 1200;
MoleRules.TAIL_MS = 800;
MoleRules.GAP_START_MS = 1000;
MoleRules.GAP_END_MS = 450;
MoleRules.GAP_JITTER = 0.15;
MoleRules.RETRY_MS = 50;
MoleRules.STAY_START_MS = 1400;
MoleRules.STAY_END_MS = 700;
MoleRules.GOLDEN_STAY_MS = 700;
MoleRules.GOLDEN_MIN_GAP_MS = 6000;
MoleRules.GOLDEN_CHANCE = 0.2;
MoleRules.PUMPKIN_CHANCE = 0.15;
MoleRules.LIVE_EARLY = 2;
MoleRules.LIVE_LATE = 3;
MoleRules.LATE_FROM = 0.5;
MoleRules.CELL_REST_MS = 250;
MoleRules.SKELETON_POINTS = 1;
MoleRules.GOLDEN_POINTS = 5;
MoleRules.PUMPKIN_POINTS = -3;
MoleRules.COMBO_DOUBLE = 5;
MoleRules.COMBO_TRIPLE = 15;
MoleRules.PUMPKIN_LOCK_MS = 800;
MoleRules.MISS_LOCK_MS = 300;
MoleRules.HIT_TOLERANCE_MS = 50;
MoleRules.SEND_MS = 150;
MoleRules.END_GRACE_MS = 1200;
MoleRules.MAX_ENTRIES = 400;
MoleRules.SEED_SALT = 0x6D6F6C65;
class MoleSeedHash {
    static of(text) {
        let hash = 0x811C9DC5;
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash >>> 0;
    }
}
class MoleCombo {
    static multiplier(combo) {
        if (combo >= MoleRules.COMBO_TRIPLE)
            return 3;
        if (combo >= MoleRules.COMBO_DOUBLE)
            return 2;
        return 1;
    }
}
class MoleKind {
    stayMs(progress) {
        return MathUtil.lerp(MoleRules.STAY_START_MS, MoleRules.STAY_END_MS, progress);
    }
    catchReaction(basePoints, combo) {
        const next = combo + 1;
        return { points: basePoints * MoleCombo.multiplier(next), combo: next, lockMs: 0 };
    }
}
class MoleSkeletonKind extends MoleKind {
    constructor() {
        super(...arguments);
        this.code = "s";
        this.label = "스켈레톤";
    }
    chance(sinceGoldenMs) {
        return 1;
    }
    reactTo(combo) {
        return this.catchReaction(MoleRules.SKELETON_POINTS, combo);
    }
}
class MoleGoldenKind extends MoleKind {
    constructor() {
        super(...arguments);
        this.code = "g";
        this.label = "황금 해골";
    }
    chance(sinceGoldenMs) {
        return sinceGoldenMs >= MoleRules.GOLDEN_MIN_GAP_MS ? MoleRules.GOLDEN_CHANCE : 0;
    }
    stayMs(progress) {
        return MoleRules.GOLDEN_STAY_MS;
    }
    reactTo(combo) {
        return this.catchReaction(MoleRules.GOLDEN_POINTS, combo);
    }
}
class MolePumpkinKind extends MoleKind {
    constructor() {
        super(...arguments);
        this.code = "p";
        this.label = "호박 폭탄";
    }
    chance(sinceGoldenMs) {
        return MoleRules.PUMPKIN_CHANCE;
    }
    reactTo(combo) {
        return { points: MoleRules.PUMPKIN_POINTS, combo: 0, lockMs: MoleRules.PUMPKIN_LOCK_MS };
    }
}
class MoleKinds {
    static pick(roll, sinceGoldenMs) {
        let threshold = 0;
        for (const kind of MoleKinds.PICK_ORDER) {
            threshold += kind.chance(sinceGoldenMs);
            if (roll < threshold)
                return kind;
        }
        return MoleKinds.SKELETON;
    }
}
MoleKinds.SKELETON = new MoleSkeletonKind();
MoleKinds.GOLDEN = new MoleGoldenKind();
MoleKinds.PUMPKIN = new MolePumpkinKind();
MoleKinds.PICK_ORDER = [MoleKinds.GOLDEN, MoleKinds.PUMPKIN, MoleKinds.SKELETON];
MoleKinds.ALL = [MoleKinds.SKELETON, MoleKinds.GOLDEN, MoleKinds.PUMPKIN];
class MoleSchedule {
    constructor(spawns) {
        this.spawns = spawns;
        this.byCell = [];
        for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++)
            this.byCell.push([]);
        spawns.forEach((spawn) => this.byCell[spawn.cell].push(spawn));
    }
    static build(seed) {
        const random = new SeededRandom((seed ^ MoleRules.SEED_SALT) >>> 0);
        const spawns = [];
        const cellFreeAt = [];
        for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++)
            cellFreeAt.push(0);
        let time = MoleRules.LEAD_MS;
        let lastGoldenAt = -MoleRules.GOLDEN_MIN_GAP_MS;
        while (time <= MoleRules.GAME_MS - MoleRules.TAIL_MS) {
            const progress = time / MoleRules.GAME_MS;
            const liveLimit = progress < MoleRules.LATE_FROM ? MoleRules.LIVE_EARLY : MoleRules.LIVE_LATE;
            const live = spawns.filter((spawn) => spawn.disappearMs > time).length;
            const freeCells = [];
            cellFreeAt.forEach((freeAt, cell) => {
                if (freeAt <= time)
                    freeCells.push(cell);
            });
            if (live >= liveLimit || freeCells.length === 0) {
                time += MoleRules.RETRY_MS;
                continue;
            }
            const kind = MoleKinds.pick(random.next(), time - lastGoldenAt);
            const cell = freeCells[Math.min(freeCells.length - 1, Math.floor(random.next() * freeCells.length))];
            const appearMs = Math.round(time);
            const disappearMs = appearMs + Math.round(kind.stayMs(progress));
            spawns.push({ index: spawns.length, cell, kind, appearMs, disappearMs });
            cellFreeAt[cell] = disappearMs + MoleRules.CELL_REST_MS;
            if (kind === MoleKinds.GOLDEN)
                lastGoldenAt = time;
            const jitter = 1 + (random.next() * 2 - 1) * MoleRules.GAP_JITTER;
            time += MathUtil.lerp(MoleRules.GAP_START_MS, MoleRules.GAP_END_MS, progress) * jitter;
        }
        return new MoleSchedule(spawns);
    }
    all() {
        return this.spawns;
    }
    size() {
        return this.spawns.length;
    }
    at(index) {
        return index >= 0 && index < this.spawns.length ? this.spawns[index] : null;
    }
    ofCell(cell) {
        return this.byCell[cell] || [];
    }
    spawnAt(cell, relMs) {
        const list = this.ofCell(cell);
        for (let index = 0; index < list.length; index++) {
            const spawn = list[index];
            if (relMs >= spawn.appearMs && relMs < spawn.disappearMs)
                return spawn;
            if (spawn.appearMs > relMs)
                return null;
        }
        return null;
    }
}
class MoleHitEntries {
    static hit(spawn, t) {
        return { spawn, t };
    }
    static miss(cell, t) {
        return { spawn: -(cell + 1), t };
    }
    static missCell(entry) {
        return entry.spawn < 0 ? -entry.spawn - 1 : -1;
    }
    static compare(a, b) {
        return a.t - b.t || a.spawn - b.spawn;
    }
}
class MoleTally {
    constructor(score, combo, bestCombo, catches, misses, lockedUntil, outcomes) {
        this.score = score;
        this.combo = combo;
        this.bestCombo = bestCombo;
        this.catches = catches;
        this.misses = misses;
        this.lockedUntil = lockedUntil;
        this.outcomes = outcomes;
    }
    multiplier() {
        return MoleCombo.multiplier(this.combo);
    }
    isLocked(t) {
        return t < this.lockedUntil;
    }
    caughtSpawns() {
        const caught = new Set();
        this.outcomes.forEach((outcome) => {
            if (outcome.kind === "hit" && outcome.spawn)
                caught.add(outcome.spawn.index);
        });
        return caught;
    }
}
class MoleScorekeeper {
    constructor(schedule) {
        this.schedule = schedule;
        this.score = 0;
        this.combo = 0;
        this.bestCombo = 0;
        this.catches = 0;
        this.misses = 0;
        this.lockedUntil = 0;
        this.caught = new Set();
        this.outcomes = [];
    }
    isLocked(t) {
        return t < this.lockedUntil;
    }
    apply(entry) {
        const outcome = this.judge(entry);
        if (outcome.kind !== "ignored")
            this.outcomes.push(outcome);
        return outcome;
    }
    tally() {
        return new MoleTally(this.score, this.combo, this.bestCombo, this.catches, this.misses, this.lockedUntil, this.outcomes);
    }
    ignored(entry) {
        return { kind: "ignored", spawn: null, cell: -1, t: entry.t, points: 0, combo: this.combo };
    }
    judge(entry) {
        if (!isFinite(entry.t) || entry.t < 0 || entry.t > MoleRules.GAME_MS || this.isLocked(entry.t))
            return this.ignored(entry);
        const missCell = MoleHitEntries.missCell(entry);
        if (missCell >= 0)
            return this.applyMiss(entry, missCell);
        const spawn = this.schedule.at(entry.spawn);
        if (!spawn || this.caught.has(spawn.index))
            return this.ignored(entry);
        if (entry.t < spawn.appearMs || entry.t > spawn.disappearMs + MoleRules.HIT_TOLERANCE_MS)
            return this.ignored(entry);
        return this.applyHit(entry, spawn);
    }
    applyMiss(entry, cell) {
        if (cell >= MoleRules.CELL_COUNT)
            return this.ignored(entry);
        this.combo = 0;
        this.misses++;
        this.lockedUntil = entry.t + MoleRules.MISS_LOCK_MS;
        return { kind: "miss", spawn: null, cell, t: entry.t, points: 0, combo: 0 };
    }
    applyHit(entry, spawn) {
        const reaction = spawn.kind.reactTo(this.combo);
        this.caught.add(spawn.index);
        this.score += reaction.points;
        this.combo = reaction.combo;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        if (reaction.points > 0)
            this.catches++;
        if (reaction.lockMs > 0)
            this.lockedUntil = Math.max(this.lockedUntil, entry.t + reaction.lockMs);
        return { kind: "hit", spawn, cell: spawn.cell, t: entry.t, points: reaction.points, combo: this.combo };
    }
}
class MoleScoring {
    static evaluate(schedule, entries, untilMs) {
        const keeper = new MoleScorekeeper(schedule);
        entries
            .filter((entry) => entry.t <= untilMs)
            .slice()
            .sort(MoleHitEntries.compare)
            .forEach((entry) => keeper.apply(entry));
        return keeper.tally();
    }
}
class MoleStandings {
    static order(lines) {
        return lines.slice().sort((a, b) => b.tally.score - a.tally.score);
    }
    static ranking(lines) {
        const ordered = MoleStandings.order(lines);
        const ranks = new Map();
        ordered.forEach((line, index) => {
            const previous = index > 0 ? ordered[index - 1] : null;
            const tied = previous !== null && previous.tally.score === line.tally.score;
            ranks.set(line.id, tied && previous ? ranks.get(previous.id) : index + 1);
        });
        return lines.map((line) => ({ id: line.id, rank: ranks.get(line.id) }));
    }
}
