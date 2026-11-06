"use strict";
class GlassBridgeRecords {
    static integer(value, low, high) {
        return typeof value === "number" && Number.isFinite(value) && Math.floor(value) === value && value >= low && value <= high ? value : null;
    }
    static time(value) {
        return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
    }
    static text(value) {
        return typeof value === "string" && value.length > 0 && value.length < 40 ? value : null;
    }
    static draw(value) {
        const raw = value;
        if (!raw || typeof raw !== "object")
            return null;
        const id = GlassBridgeRecords.text(raw.id), b = GlassBridgeRecords.integer(raw.b, 0, 9), n = GlassBridgeRecords.integer(raw.n, 1, 10), t = GlassBridgeRecords.time(raw.t);
        return id !== null && b !== null && n !== null && t !== null ? { id, b, n, t } : null;
    }
    static step(value) {
        const raw = value;
        if (!raw || typeof raw !== "object")
            return null;
        const id = GlassBridgeRecords.text(raw.id), a = GlassBridgeRecords.integer(raw.a, 0, 999), r = GlassBridgeRecords.integer(raw.r, 0, 99);
        const s = GlassBridgeRecords.integer(raw.s, -1, 1), b = GlassBridgeRecords.integer(raw.b, -1, 1), t = GlassBridgeRecords.time(raw.t);
        return id !== null && a !== null && r !== null && s !== null && b !== null && t !== null ? { id, a, r, s, b, t } : null;
    }
    static pick(value) {
        const raw = value;
        if (!raw || typeof raw !== "object")
            return null;
        const id = GlassBridgeRecords.text(raw.id), a = GlassBridgeRecords.integer(raw.a, 0, 999), r = GlassBridgeRecords.integer(raw.r, 0, 99);
        const s = GlassBridgeRecords.integer(raw.s, 0, 1), t = GlassBridgeRecords.time(raw.t);
        return id !== null && a !== null && r !== null && s !== null && t !== null ? { id, a, r, s, t } : null;
    }
    static want(value) {
        const raw = value;
        if (!raw || typeof raw !== "object")
            return null;
        const b = GlassBridgeRecords.integer(raw.b, 0, 9), q = GlassBridgeRecords.integer(raw.q, 0, 9999);
        return b !== null && q !== null ? { b, q } : null;
    }
}
class GlassBridgeKeys {
    static pick(attempt, row) {
        return attempt + "_" + row;
    }
}
class GlassBridgeAiPolicy {
    static lotteryDelayMs(seed, id) {
        return GlassBridgeSeedHash.between(seed + "|lot|" + id, GlassBridgeRules.AI_LOTTERY_MIN_MS, GlassBridgeRules.AI_LOTTERY_MAX_MS);
    }
    static choice(seed, id, choiceWindow) {
        const key = seed + "|" + id + "|" + choiceWindow.attempt + "|" + choiceWindow.row;
        return {
            side: GlassBridgeSeedHash.unit(key + "|side") < 0.5 ? 0 : 1,
            t: choiceWindow.opensAt + Math.round(GlassBridgeSeedHash.between(key + "|delay", GlassBridgeRules.AI_CHOICE_MIN_MS, GlassBridgeRules.AI_CHOICE_MAX_MS))
        };
    }
}
class GlassBridgeStepMaker {
    constructor(random) {
        this.random = random;
    }
    fromChoice(choiceWindow, side, t) {
        return { id: choiceWindow.id, a: choiceWindow.attempt, r: choiceWindow.row, s: side, b: this.random.chance(0.5) ? 0 : 1, t };
    }
    timeout(choiceWindow) {
        return { id: choiceWindow.id, a: choiceWindow.attempt, r: choiceWindow.row, s: -1, b: -1, t: choiceWindow.closesAt };
    }
}
class GlassBridgeMatch {
    constructor(participants, seed, startAt, rows) {
        this.participants = participants;
        this.seed = seed;
        this.startAt = startAt;
        this.rows = rows;
        this.wants = new Map();
        this.picks = new Map();
        this.waitingSteps = new Map();
        this.departed = new Set();
        this.timelineValue = null;
        this.roster = participants.map((participant) => participant.id);
        this.lottery = new GlassBridgeLottery(this.roster);
        this.choreography = new GlassBridgeChoreography(this.roster, this.lottery, rows);
    }
    ids() {
        return this.roster;
    }
    timeline() {
        return this.timelineValue;
    }
    participant(id) {
        return this.participants.find((participant) => participant.id === id) || null;
    }
    crossStartAt() {
        return this.timelineValue ? this.timelineValue.startAt : null;
    }
    endAt() {
        const start = this.crossStartAt();
        return start === null ? null : start + GlassBridgeRules.PLAY_MS;
    }
    acceptDraw(record) {
        this.lottery.accept(record);
        this.sync();
    }
    acceptWant(id, record) {
        if (this.roster.indexOf(id) >= 0)
            this.wants.set(id, record);
    }
    acceptPick(key, record) {
        if (this.roster.indexOf(record.id) >= 0 && key === GlassBridgeKeys.pick(record.a, record.r) && !this.picks.has(key))
            this.picks.set(key, record);
    }
    acceptStep(key, record) {
        if (key === GlassBridgeKeys.pick(record.a, record.r))
            this.waitingSteps.set(key, record);
        this.sync();
    }
    markDeparted(id) {
        this.departed.add(id);
    }
    isDriven(id) {
        const participant = this.participant(id);
        return this.departed.has(id) || (participant !== null && participant.ai);
    }
    wantOf(id) {
        return this.wants.get(id) || null;
    }
    pickFor(choiceWindow) {
        const record = this.picks.get(GlassBridgeKeys.pick(choiceWindow.attempt, choiceWindow.row));
        return record && record.id === choiceWindow.id ? record : null;
    }
    sync() {
        if (!this.timelineValue && this.lottery.complete())
            this.timelineValue = new GlassBridgeTimeline(this.lottery.lineup(), this.lottery.crossStartAt(), this.rows);
        const timeline = this.timelineValue;
        if (!timeline)
            return;
        for (let guard = 0; guard < 400; guard++) {
            const choiceWindow = timeline.openWindow();
            const key = choiceWindow ? GlassBridgeKeys.pick(choiceWindow.attempt, choiceWindow.row) : "";
            const record = this.waitingSteps.get(key);
            if (!choiceWindow || !record || !timeline.apply(record))
                return;
            this.waitingSteps.delete(key);
        }
    }
    standings(endAt) {
        return new GlassBridgeStandings(this.roster, this.timelineValue, endAt);
    }
    allArrived() {
        return this.timelineValue !== null && this.timelineValue.isFinished();
    }
    isOver(now) {
        const timeline = this.timelineValue;
        const endAt = this.endAt();
        if (timeline === null || endAt === null)
            return false;
        if (now >= endAt + GlassBridgeRules.END_GRACE_MS)
            return true;
        return timeline.isFinished() && now >= timeline.lastArrival() + GlassBridgeRules.ALL_ARRIVED_DELAY_MS;
    }
    resultNotes() {
        const endAt = this.endAt() || this.startAt;
        const notes = {};
        const standings = this.standings(endAt).entries();
        let arrivedRank = 0;
        standings.forEach((entry) => {
            if (entry.arrived) {
                arrivedRank++;
                notes[entry.id] = "도착 " + arrivedRank + "위 · 추락 " + entry.falls + "회";
            }
            else {
                notes[entry.id] = "도달 " + entry.rows + "칸 · 추락 " + entry.falls + "회";
            }
        });
        return notes;
    }
}
class GlassBridgeSilentSink {
    sendDraw(record) {
        return;
    }
    sendStep(record) {
        return;
    }
}
class GlassBridgeReferee {
    constructor(match, host, random, sink) {
        this.match = match;
        this.host = host;
        this.random = random;
        this.sink = sink;
    }
    step(now) {
        if (!this.host.isHost() || now < this.match.startAt)
            return;
        this.advanceLottery(now);
        this.advanceCrossing(now);
    }
    advanceLottery(now) {
        const lottery = this.match.lottery;
        if (lottery.complete())
            return;
        const closed = now >= this.match.startAt + GlassBridgeRules.LOTTERY_MS;
        lottery.undrawn().forEach((id) => {
            const wanted = this.match.wantOf(id);
            if (wanted && lottery.bagOwner(wanted.b) === null)
                this.draw(id, wanted.b, now);
            else if (closed || (this.match.isDriven(id) && now >= this.match.startAt + GlassBridgeAiPolicy.lotteryDelayMs(this.match.seed, id)))
                this.drawRandomBag(id, now);
        });
    }
    drawRandomBag(id, now) {
        const bags = this.match.lottery.freeBags();
        if (bags.length)
            this.draw(id, bags[this.random.index(bags.length)], now);
    }
    draw(id, bag, now) {
        const numbers = this.match.lottery.freeNumbers();
        if (!numbers.length)
            return;
        const record = { id, b: bag, n: numbers[this.random.index(numbers.length)], t: now };
        this.match.acceptDraw(record);
        this.sink.sendDraw(record);
    }
    advanceCrossing(now) {
        const timeline = this.match.timeline();
        if (!timeline)
            return;
        const maker = new GlassBridgeStepMaker(this.random);
        for (let guard = 0; guard < GlassBridgeRules.MAX_STEPS_PER_TICK; guard++) {
            const endAt = this.match.endAt();
            const choiceWindow = timeline.openWindow();
            if (!choiceWindow || choiceWindow.opensAt >= endAt)
                return;
            const record = this.recordFor(choiceWindow, now, maker);
            if (!record)
                return;
            this.match.acceptStep(GlassBridgeKeys.pick(record.a, record.r), record);
            this.sink.sendStep(record);
        }
    }
    recordFor(choiceWindow, now, maker) {
        const pick = this.match.pickFor(choiceWindow);
        if (pick && pick.t <= choiceWindow.closesAt)
            return maker.fromChoice(choiceWindow, pick.s, Math.max(pick.t, choiceWindow.opensAt));
        if (this.match.isDriven(choiceWindow.id)) {
            const choice = GlassBridgeAiPolicy.choice(this.match.seed, choiceWindow.id, choiceWindow);
            if (now >= choice.t)
                return maker.fromChoice(choiceWindow, choice.side, choice.t);
        }
        return now >= choiceWindow.closesAt + GlassBridgeRules.HOST_GRACE_MS ? maker.timeout(choiceWindow) : null;
    }
}
class GlassBridgeLocalPlayer {
    constructor(localId, match, outlet) {
        this.localId = localId;
        this.match = match;
        this.outlet = outlet;
        this.wantCount = 0;
    }
    participates() {
        return this.match.participant(this.localId) !== null;
    }
    canChooseBag(bag) {
        return this.participates() && !this.match.lottery.hasDrawn(this.localId) && this.match.lottery.bagOwner(bag) === null;
    }
    chooseBag(bag) {
        if (!this.canChooseBag(bag))
            return;
        const record = { b: bag, q: this.wantCount++ };
        this.match.acceptWant(this.localId, record);
        this.outlet.requestBag(record);
    }
    myWindow(now) {
        const timeline = this.match.timeline();
        const choiceWindow = timeline ? timeline.openWindow() : null;
        return choiceWindow && choiceWindow.id === this.localId && now >= choiceWindow.opensAt && now <= choiceWindow.closesAt && this.match.pickFor(choiceWindow) === null ? choiceWindow : null;
    }
    canChooseSide(side, now) {
        const timeline = this.match.timeline();
        const choiceWindow = this.myWindow(now);
        if (!timeline || !choiceWindow)
            return false;
        return !timeline.panels.isKnown(choiceWindow.row) || timeline.panels.brokenSide(choiceWindow.row) !== side;
    }
    chooseSide(side, now) {
        const choiceWindow = this.myWindow(now);
        if (!choiceWindow || !this.canChooseSide(side, now))
            return;
        const record = { id: this.localId, a: choiceWindow.attempt, r: choiceWindow.row, s: side, t: now };
        const key = GlassBridgeKeys.pick(choiceWindow.attempt, choiceWindow.row);
        this.match.acceptPick(key, record);
        this.outlet.sendPick(key, record);
    }
}
class GlassBridgeWire {
    static streams() {
        return [
            { name: GlassBridgeWire.WANT, events: ["child_added", "child_changed"] },
            { name: GlassBridgeWire.LOT, events: ["child_added"] },
            { name: GlassBridgeWire.PICK, events: ["child_added"] },
            { name: GlassBridgeWire.STEP, events: ["child_added"] }
        ];
    }
    static handlers(match) {
        return {
            [GlassBridgeWire.WANT]: (key, value) => {
                const record = GlassBridgeRecords.want(value);
                if (record)
                    match.acceptWant(key, record);
            },
            [GlassBridgeWire.LOT]: (key, value) => {
                const record = GlassBridgeRecords.draw(value);
                if (record)
                    match.acceptDraw(record);
            },
            [GlassBridgeWire.PICK]: (key, value) => {
                const record = GlassBridgeRecords.pick(value);
                if (record)
                    match.acceptPick(key, record);
            },
            [GlassBridgeWire.STEP]: (key, value) => {
                const record = GlassBridgeRecords.step(value);
                if (record)
                    match.acceptStep(key, record);
            }
        };
    }
    constructor(wire, localId) {
        this.wire = wire;
        this.localId = localId;
    }
    requestBag(record) {
        this.wire.set(GlassBridgeWire.WANT, this.localId, record);
    }
    sendPick(key, record) {
        this.wire.set(GlassBridgeWire.PICK, key, record);
    }
    sendDraw(record) {
        this.wire.set(GlassBridgeWire.LOT, record.id, record);
    }
    sendStep(record) {
        this.wire.set(GlassBridgeWire.STEP, GlassBridgeKeys.pick(record.a, record.r), record);
    }
}
GlassBridgeWire.WANT = "want";
GlassBridgeWire.LOT = "lot";
GlassBridgeWire.PICK = "pick";
GlassBridgeWire.STEP = "step";
