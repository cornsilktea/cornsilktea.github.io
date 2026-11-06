"use strict";
class NunchiRecords {
    static commit(value) {
        const raw = value;
        if (!raw || typeof raw !== "object" || typeof raw.h !== "string" || typeof raw.t !== "number")
            return null;
        return { h: raw.h, t: raw.t };
    }
    static reveal(value) {
        const raw = value;
        if (!raw || typeof raw !== "object" || typeof raw.c !== "number" || typeof raw.s !== "string")
            return null;
        return { c: raw.c, s: raw.s };
    }
    static result(value) {
        const raw = value;
        if (!raw || typeof raw !== "object" || !raw.c || typeof raw.c !== "object")
            return null;
        const offered = raw.c;
        const cards = {};
        Object.keys(offered).forEach((id) => {
            if (typeof offered[id] === "number")
                cards[id] = offered[id];
        });
        return { c: cards, a: typeof raw.a === "string" ? raw.a : "" };
    }
}
class NunchiKeys {
    static entry(round, id) {
        return round + "_" + id;
    }
    static parse(key) {
        const at = key.indexOf("_");
        if (at < 1)
            return null;
        const round = +key.slice(0, at);
        const id = key.slice(at + 1);
        return Number.isInteger(round) && id ? { round, id } : null;
    }
}
class NunchiSchedule {
    constructor(startAt) {
        this.startAt = startAt;
    }
    roundStart(round) {
        return this.startAt + round * NunchiRules.ROUND_MS;
    }
    pickDeadline(round) {
        return this.roundStart(round) + NunchiRules.PICK_MS;
    }
    commitCutoff(round) {
        return this.pickDeadline(round) + NunchiRules.COMMIT_GRACE_MS;
    }
    revealAt(round) {
        return this.pickDeadline(round) + NunchiRules.REVEAL_DELAY_MS;
    }
    resolveAt(round) {
        return this.pickDeadline(round) + NunchiRules.RESOLVE_DELAY_MS;
    }
    endAt() {
        return this.roundStart(NunchiRules.ROUNDS);
    }
    hasStarted(now) {
        return now >= this.startAt;
    }
    moment(now) {
        if (now < this.startAt)
            return { round: 0, phase: "intro", elapsedMs: now - this.startAt };
        const round = Math.min(NunchiRules.ROUNDS - 1, Math.floor((now - this.startAt) / NunchiRules.ROUND_MS));
        const elapsedMs = now - this.roundStart(round);
        if (elapsedMs < NunchiRules.PICK_MS)
            return { round, phase: "pick", elapsedMs };
        if (elapsedMs < NunchiRules.PICK_MS + NunchiRules.RESOLVE_DELAY_MS)
            return { round, phase: "resolve", elapsedMs };
        return { round, phase: "show", elapsedMs };
    }
}
class NunchiLedger {
    constructor() {
        this.commits = new Map();
        this.reveals = new Map();
        this.results = new Map();
    }
    addCommit(key, record) {
        if (!this.commits.has(key))
            this.commits.set(key, record);
    }
    addReveal(key, record) {
        if (!this.reveals.has(key))
            this.reveals.set(key, record);
    }
    addResult(round, record) {
        if (!this.results.has(round))
            this.results.set(round, record);
    }
    resultFor(round) {
        return this.results.get(round) || null;
    }
    isPlaced(round, id) {
        return this.commits.has(NunchiKeys.entry(round, id));
    }
    verifiedCard(seed, round, id, cutoffMs, hand) {
        const key = NunchiKeys.entry(round, id);
        const commit = this.commits.get(key);
        const reveal = this.reveals.get(key);
        if (!commit || !reveal || commit.t > cutoffMs || !hand.has(reveal.c))
            return null;
        return NunchiCommitment.digest(seed, round, id, reveal.c, reveal.s) === commit.h ? reveal.c : null;
    }
}
class NunchiVault {
    constructor(seed, id, tokens) {
        this.seed = seed;
        this.id = id;
        this.tokens = tokens;
        this.sealed = new Map();
    }
    seal(round, card) {
        let salt = "";
        for (let part = 0; part < NunchiVault.SALT_PARTS; part++)
            salt += this.tokens.token(NunchiVault.SALT_PART_LENGTH);
        this.sealed.set(round, { card, salt });
        return NunchiCommitment.digest(this.seed, round, this.id, card, salt);
    }
    cardOf(round) {
        const sealed = this.sealed.get(round);
        return sealed ? sealed.card : null;
    }
    reveal(round) {
        const sealed = this.sealed.get(round);
        return sealed ? { c: sealed.card, s: sealed.salt } : null;
    }
}
NunchiVault.SALT_PARTS = 2;
NunchiVault.SALT_PART_LENGTH = 10;
class NunchiWire {
    static streams() {
        return [
            { name: NunchiWire.COMMIT, events: ["child_added"] },
            { name: NunchiWire.REVEAL, events: ["child_added"] },
            { name: NunchiWire.RESULT, events: ["child_added"] }
        ];
    }
    static handlers(target) {
        return {
            [NunchiWire.COMMIT]: (key, value) => target.receiveCommit(key, value),
            [NunchiWire.REVEAL]: (key, value) => target.receiveReveal(key, value),
            [NunchiWire.RESULT]: (key, value) => target.receiveResult(key, value)
        };
    }
    constructor(wire) {
        this.wire = wire;
    }
    publishCommit(round, id, record) {
        this.wire.set(NunchiWire.COMMIT, NunchiKeys.entry(round, id), record);
    }
    publishReveal(round, id, record) {
        this.wire.set(NunchiWire.REVEAL, NunchiKeys.entry(round, id), record);
    }
    publishResult(round, record) {
        this.wire.set(NunchiWire.RESULT, String(round), record);
    }
}
NunchiWire.COMMIT = "commit";
NunchiWire.REVEAL = "reveal";
NunchiWire.RESULT = "result";
class NunchiAiTuning {
}
NunchiAiTuning.RESERVE_WEIGHT = 0.5;
NunchiAiTuning.AVERAGE_PRIZE = 3;
NunchiAiTuning.CLASH_AVOID_WEIGHT = 0.25;
NunchiAiTuning.TEMPERATURE = 0.7;
class NunchiAiPicker {
    constructor(seed, ids) {
        this.seed = seed;
        this.ids = ids;
    }
    pick(round, id, state) {
        const hand = state.hand(id).remaining();
        const rivals = this.ids.filter((other) => other !== id).map((other) => state.hand(other).remaining());
        const pot = state.prizeFor(round).value() + state.carryIn();
        const weights = hand.map((card) => Math.exp(this.worth(card, pot, rivals) / NunchiAiTuning.TEMPERATURE));
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let target = new SeededRandom(NunchiSeeds.mix(this.seed ^ 0x51ED, round, id)).next() * total;
        for (let index = 0; index < hand.length; index++) {
            target -= weights[index];
            if (target <= 0)
                return hand[index];
        }
        return hand[hand.length - 1];
    }
    worth(card, pot, rivals) {
        let winChance = 1;
        let aloneChance = 1;
        rivals.forEach((rival) => {
            if (rival.length === 0)
                return;
            winChance *= rival.filter((other) => other < card).length / rival.length;
            if (rival.indexOf(card) >= 0)
                aloneChance *= 1 - 1 / rival.length;
        });
        const reserve = card / NunchiRules.CARD_COUNT * NunchiAiTuning.AVERAGE_PRIZE * NunchiAiTuning.RESERVE_WEIGHT;
        return winChance * pot + aloneChance * pot * NunchiAiTuning.CLASH_AVOID_WEIGHT / card - reserve;
    }
}
class NunchiReferee {
    constructor(host, seed, participants, schedule, state, ledger, ai, outlet) {
        this.host = host;
        this.seed = seed;
        this.participants = participants;
        this.schedule = schedule;
        this.state = state;
        this.ledger = ledger;
        this.ai = ai;
        this.outlet = outlet;
    }
    step(now) {
        if (!this.host.isHost())
            return;
        const round = this.state.nextRound();
        if (round >= NunchiRules.ROUNDS)
            return;
        if (now < this.schedule.resolveAt(round)) {
            this.announceAiPlacements(round, now);
            return;
        }
        this.outlet.publishResult(round, this.collect(round));
    }
    announceAiPlacements(round, now) {
        this.participants.forEach((participant) => {
            if (!participant.ai || this.ledger.isPlaced(round, participant.id))
                return;
            const delay = NunchiRules.AI_PLACE_MIN_MS + new SeededRandom(NunchiSeeds.mix(this.seed ^ 0xA1, round, participant.id)).next() * NunchiRules.AI_PLACE_SPAN_MS;
            if (now >= this.schedule.roundStart(round) + delay)
                this.outlet.announcePlaced(round, participant.id, { h: NunchiRules.AI_MARK, t: now });
        });
    }
    collect(round) {
        const cards = {};
        const autos = [];
        this.participants.forEach((participant) => {
            const hand = this.state.hand(participant.id);
            const offered = participant.ai
                ? this.ai.pick(round, participant.id, this.state)
                : this.ledger.verifiedCard(this.seed, round, participant.id, this.schedule.commitCutoff(round), hand);
            if (offered !== null) {
                cards[participant.id] = offered;
                return;
            }
            cards[participant.id] = NunchiAutoPick.card(this.seed, round, participant.id, hand.remaining());
            autos.push(participant.id);
        });
        return { c: cards, a: autos.join(",") };
    }
}
