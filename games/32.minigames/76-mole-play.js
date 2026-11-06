"use strict";
class MoleHitCodec {
    static encode(entries) {
        return entries.map((entry) => entry.spawn + ":" + entry.t).join(",");
    }
    static decode(raw) {
        if (typeof raw !== "string")
            return null;
        const entries = [];
        raw.split(",").slice(0, MoleRules.MAX_ENTRIES).forEach((part) => {
            const pieces = part.split(":");
            if (pieces.length !== 2)
                return;
            const spawn = parseInt(pieces[0], 10);
            const t = parseInt(pieces[1], 10);
            if (isFinite(spawn) && isFinite(t))
                entries.push({ spawn, t });
        });
        return entries;
    }
}
class MoleWire {
    static streams() {
        return [{ name: MoleWire.HITS, events: ["child_added", "child_changed"] }];
    }
    static handlers(target) {
        return { [MoleWire.HITS]: (key, value) => target.receiveHits(key, value) };
    }
    constructor(wire) {
        this.wire = wire;
    }
    publishHits(id, entries) {
        this.wire.writeMany(MoleWire.HITS, { [id]: MoleHitCodec.encode(entries) });
    }
}
MoleWire.HITS = "hit";
class MoleOutbox {
    constructor(wire, localId) {
        this.wire = wire;
        this.localId = localId;
        this.lastSentAt = -Infinity;
        this.dirty = false;
    }
    markDirty() {
        this.dirty = true;
    }
    flush(nowMs, entries) {
        if (!this.dirty || nowMs - this.lastSentAt < MoleRules.SEND_MS)
            return;
        this.dirty = false;
        this.lastSentAt = nowMs;
        this.wire.publishHits(this.localId, entries);
    }
}
class MoleAiTemperament {
}
class MoleCarefulTemperament extends MoleAiTemperament {
    reactionMinMs() { return 520; }
    reactionMaxMs() { return 900; }
    slipChance() { return 0.05; }
    pumpkinMistakeChance() { return 0; }
    strayPerMinute() { return 0; }
}
class MoleSteadyTemperament extends MoleAiTemperament {
    reactionMinMs() { return 380; }
    reactionMaxMs() { return 700; }
    slipChance() { return 0.1; }
    pumpkinMistakeChance() { return 0.08; }
    strayPerMinute() { return 1; }
}
class MoleRecklessTemperament extends MoleAiTemperament {
    reactionMinMs() { return 240; }
    reactionMaxMs() { return 520; }
    slipChance() { return 0.12; }
    pumpkinMistakeChance() { return 0.35; }
    strayPerMinute() { return 6; }
}
class MoleTemperaments {
    static forSlot(slot) {
        return MoleTemperaments.ALL[Math.abs(slot) % MoleTemperaments.ALL.length];
    }
}
MoleTemperaments.ALL = [new MoleSteadyTemperament(), new MoleRecklessTemperament(), new MoleCarefulTemperament()];
class MoleAiPlanner {
    static plan(schedule, seed, participant, temperament) {
        const random = new RandomRange(new SeededRandom(MoleSeedHash.of(seed + "|" + participant.id)));
        const intended = [];
        schedule.all().forEach((spawn) => {
            const wanted = MoleAiPlanner.wants(spawn, temperament, random.next());
            const reaction = Math.round(random.between(temperament.reactionMinMs(), temperament.reactionMaxMs()));
            const t = spawn.appearMs + reaction;
            if (wanted && t < spawn.disappearMs - MoleAiPlanner.TOO_LATE_MARGIN_MS)
                intended.push(MoleHitEntries.hit(spawn.index, t));
        });
        MoleAiPlanner.addStrays(schedule, temperament, random, intended);
        const keeper = new MoleScorekeeper(schedule);
        return intended.sort(MoleHitEntries.compare).filter((entry) => keeper.apply(entry).kind !== "ignored");
    }
    static wants(spawn, temperament, roll) {
        if (spawn.kind === MoleKinds.PUMPKIN)
            return roll < temperament.pumpkinMistakeChance();
        return roll >= temperament.slipChance();
    }
    static addStrays(schedule, temperament, random, into) {
        const count = Math.round(temperament.strayPerMinute() * MoleRules.GAME_MS / 60000);
        for (let stray = 0; stray < count; stray++) {
            const t = Math.round(random.between(MoleAiPlanner.STRAY_FROM_MS, MoleRules.GAME_MS - MoleAiPlanner.STRAY_BEFORE_END_MS));
            const cell = random.index(MoleRules.CELL_COUNT);
            if (!schedule.spawnAt(cell, t))
                into.push(MoleHitEntries.miss(cell, t));
        }
    }
}
MoleAiPlanner.TOO_LATE_MARGIN_MS = 30;
MoleAiPlanner.STRAY_FROM_MS = 1500;
MoleAiPlanner.STRAY_BEFORE_END_MS = 500;
class MoleContestant {
    constructor(participant, entries, computed) {
        this.participant = participant;
        this.computed = computed;
        this.version = 0;
        this.departedFlag = false;
        this.cacheKey = "";
        this.cacheTally = null;
        this.entries = entries.slice();
    }
    get id() { return this.participant.id; }
    hasDeparted() {
        return this.departedFlag;
    }
    markDeparted() {
        this.departedFlag = true;
    }
    allEntries() {
        return this.entries;
    }
    replaceEntries(entries) {
        this.entries = entries.slice();
        this.version++;
    }
    addEntry(entry) {
        this.entries.push(entry);
        this.version++;
    }
    tally(schedule, untilMs) {
        const key = this.version + "|" + Math.floor(untilMs / 50);
        if (this.cacheTally && key === this.cacheKey)
            return this.cacheTally;
        this.cacheKey = key;
        this.cacheTally = MoleScoring.evaluate(schedule, this.entries, untilMs);
        return this.cacheTally;
    }
}
class MoleMatch {
    constructor(participants, seed, localId) {
        this.seed = seed;
        this.localId = localId;
        this.byId = new Map();
        this.schedule = MoleSchedule.build(seed);
        this.list = participants.map((participant) => this.contestantFor(participant));
        this.list.forEach((contestant) => this.byId.set(contestant.id, contestant));
    }
    contestants() {
        return this.list;
    }
    contestant(id) {
        return this.byId.get(id) || null;
    }
    receive(id, entries) {
        const contestant = this.byId.get(id);
        if (contestant && !contestant.computed && id !== this.localId)
            contestant.replaceEntries(entries);
    }
    lines(untilMs) {
        return this.list.map((contestant) => ({ id: contestant.id, tally: contestant.tally(this.schedule, untilMs) }));
    }
    ranking() {
        return MoleStandings.ranking(this.lines(MoleRules.GAME_MS));
    }
    contestantFor(participant) {
        if (!participant.ai)
            return new MoleContestant(participant, [], false);
        return new MoleContestant(participant, MoleAiPlanner.plan(this.schedule, this.seed, participant, MoleTemperaments.forSlot(participant.slot)), true);
    }
}
class MoleCellAction {
    static nameOf(cell) {
        return MoleCellAction.PREFIX + cell;
    }
    static cellOf(action) {
        if (action.indexOf(MoleCellAction.PREFIX) !== 0)
            return -1;
        const cell = parseInt(action.slice(MoleCellAction.PREFIX.length), 10);
        return cell >= 0 && cell < MoleRules.CELL_COUNT ? cell : -1;
    }
}
MoleCellAction.PREFIX = "tap:";
class MoleCellKeys {
    static buttons() {
        return MoleCellKeys.LETTERS.map((letter, cell) => ({
            action: MoleCellAction.nameOf(cell),
            label: "",
            codes: [letter, MoleCellKeys.NUMPAD[cell]],
            color: "",
            rightPx: 0,
            bottomPx: 0,
            keyOnly: true
        }));
    }
}
MoleCellKeys.LETTERS = ["KeyQ", "KeyW", "KeyE", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyX", "KeyC"];
MoleCellKeys.NUMPAD = ["Numpad7", "Numpad8", "Numpad9", "Numpad4", "Numpad5", "Numpad6", "Numpad1", "Numpad2", "Numpad3"];
class MoleLocalPlayer {
    constructor(match, localId) {
        this.match = match;
        this.localId = localId;
    }
    tap(cell, relMs) {
        const me = this.match.contestant(this.localId);
        if (!me || me.computed || relMs < 0 || relMs > MoleRules.GAME_MS)
            return false;
        const tally = me.tally(this.match.schedule, relMs);
        if (tally.isLocked(relMs))
            return false;
        const spawn = this.match.schedule.spawnAt(cell, relMs);
        const fresh = spawn !== null && !tally.caughtSpawns().has(spawn.index);
        me.addEntry(spawn && fresh ? MoleHitEntries.hit(spawn.index, relMs) : MoleHitEntries.miss(cell, relMs));
        return true;
    }
}
