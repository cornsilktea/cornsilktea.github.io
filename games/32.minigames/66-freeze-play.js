"use strict";
class FreezeRunButton {
}
FreezeRunButton.ACTION = "run";
class FreezeRunInput {
    constructor() {
        this.pressed = false;
    }
    isPressed() {
        return this.pressed;
    }
    handle(action) {
        if (action === HoldActions.down(FreezeRunButton.ACTION))
            this.pressed = true;
        else if (action === HoldActions.up(FreezeRunButton.ACTION))
            this.pressed = false;
    }
}
class FreezeAiTuning {
}
FreezeAiTuning.GO_DELAY_MIN_MS = 80;
FreezeAiTuning.GO_DELAY_MAX_MS = 350;
FreezeAiTuning.LATE_MIN_MS = 500;
FreezeAiTuning.LATE_MAX_MS = 900;
class FreezeAiTemperament {
}
class FreezeCautiousTemperament extends FreezeAiTemperament {
    marginMs() { return 650; }
    jitterMs() { return 220; }
    lateChance() { return 0.03; }
}
class FreezeSteadyTemperament extends FreezeAiTemperament {
    marginMs() { return 350; }
    jitterMs() { return 280; }
    lateChance() { return 0.07; }
}
class FreezeBoldTemperament extends FreezeAiTemperament {
    marginMs() { return 40; }
    jitterMs() { return 420; }
    lateChance() { return 0.14; }
}
class FreezeTemperaments {
    static forSlot(slot) {
        return FreezeTemperaments.ALL[Math.abs(slot) % FreezeTemperaments.ALL.length];
    }
}
FreezeTemperaments.ALL = [new FreezeSteadyTemperament(), new FreezeBoldTemperament(), new FreezeCautiousTemperament()];
class FreezeDriver {
    advance(runner, dt, situation, endAt) {
        if (!this.simulatesHere()) {
            runner.stepObserved(dt, situation.now);
            return FreezeStepResult.NONE;
        }
        return runner.advance(dt, situation.now, this.wantsRun(runner, situation), situation.log.isDangerous(situation.now), endAt);
    }
}
class FreezeLocalDriver extends FreezeDriver {
    constructor(input) {
        super();
        this.input = input;
    }
    simulatesHere() {
        return true;
    }
    wantsRun(runner, situation) {
        return this.input.isPressed();
    }
}
class FreezeRemoteDriver extends FreezeDriver {
    simulatesHere() {
        return false;
    }
    wantsRun(runner, situation) {
        return false;
    }
}
class FreezeAiDriver extends FreezeDriver {
    constructor(temperament, host, random) {
        super();
        this.temperament = temperament;
        this.host = host;
        this.random = random;
        this.plannedCycle = -1;
        this.goAt = 0;
        this.stopAt = 0;
    }
    simulatesHere() {
        return this.host.isHost();
    }
    wantsRun(runner, situation) {
        const cycle = situation.log.cycleAt(situation.now);
        if (!cycle)
            return false;
        if (cycle.n !== this.plannedCycle)
            this.plan(cycle);
        return situation.now >= this.goAt && situation.now < this.stopAt;
    }
    plan(cycle) {
        this.plannedCycle = cycle.n;
        this.goAt = cycle.at + this.random.between(FreezeAiTuning.GO_DELAY_MIN_MS, FreezeAiTuning.GO_DELAY_MAX_MS);
        const jitter = this.temperament.jitterMs();
        let stopAt = cycle.safeEnd() - this.temperament.marginMs() + this.random.between(-jitter, jitter);
        if (this.random.chance(this.temperament.lateChance()))
            stopAt += this.random.between(FreezeAiTuning.LATE_MIN_MS, FreezeAiTuning.LATE_MAX_MS);
        this.stopAt = Math.max(this.goAt, stopAt);
    }
}
class FreezeDriverFactory {
    constructor(localId, input, host, random) {
        this.localId = localId;
        this.input = input;
        this.host = host;
        this.random = random;
    }
    create(participant) {
        if (participant.id === this.localId)
            return new FreezeLocalDriver(this.input);
        if (participant.ai)
            return this.createAi(participant);
        return new FreezeRemoteDriver();
    }
    createAi(participant) {
        return new FreezeAiDriver(FreezeTemperaments.forSlot(participant.slot), this.host, new RandomRange(this.random));
    }
}
class FreezeContestant {
    constructor(runner, driver) {
        this.runner = runner;
        this.driver = driver;
    }
}
class FreezeArena {
    constructor(participants, seed, drivers) {
        this.drivers = drivers;
        this.byId = new Map();
        const lanes = FreezeLanes.assign(participants.map((participant) => participant.id), seed);
        this.contestants = participants.map((participant) => new FreezeContestant(new FreezeRunnerState(participant, lanes.get(participant.id)), drivers.create(participant)));
        this.contestants.forEach((contestant) => this.byId.set(contestant.runner.id, contestant));
    }
    all() {
        return this.contestants;
    }
    runners() {
        return this.contestants.map((contestant) => contestant.runner);
    }
    get(id) {
        return this.byId.get(id) || null;
    }
    handOverToAi(id) {
        const contestant = this.byId.get(id);
        if (contestant && !contestant.runner.isFinished())
            contestant.driver = this.drivers.createAi(contestant.runner.participant);
    }
}
class FreezeWire {
    static streams() {
        return [
            { name: FreezeWire.POSITIONS, events: ["child_added", "child_changed"] },
            { name: FreezeWire.CYCLES, events: ["child_added"] },
            { name: FreezeWire.HITS, events: ["child_added"] },
            { name: FreezeWire.FINISHES, events: ["child_added"] }
        ];
    }
    static handlers(target) {
        return {
            [FreezeWire.POSITIONS]: (key, value) => target.receivePosition(key, value),
            [FreezeWire.CYCLES]: (key, value) => target.receiveCycle(value),
            [FreezeWire.HITS]: (key, value) => target.receiveHit(value),
            [FreezeWire.FINISHES]: (key, value) => target.receiveFinish(key, value)
        };
    }
    constructor(wire) {
        this.wire = wire;
    }
    publishPositions(values) {
        this.wire.writeMany(FreezeWire.POSITIONS, values);
    }
    publishCycle(record) {
        this.wire.set(FreezeWire.CYCLES, String(record.n), record);
    }
    publishHit(record) {
        this.wire.set(FreezeWire.HITS, record.id + "_" + record.n, record);
    }
    publishFinish(id, record) {
        this.wire.set(FreezeWire.FINISHES, id, record);
    }
}
FreezeWire.POSITIONS = "pos";
FreezeWire.CYCLES = "cyc";
FreezeWire.HITS = "hit";
FreezeWire.FINISHES = "fin";
class FreezeReferee {
    constructor(host, startAt, endAt, arena, log, random, outlet) {
        this.host = host;
        this.startAt = startAt;
        this.endAt = endAt;
        this.arena = arena;
        this.log = log;
        this.random = random;
        this.outlet = outlet;
    }
    step(now) {
        if (!this.host.isHost())
            return;
        this.scheduleCycle(now);
        if (now >= this.startAt)
            this.confirmFinishes();
    }
    scheduleCycle(now) {
        if (now >= this.endAt)
            return;
        const latest = this.log.latest();
        if (!latest) {
            this.outlet.publishCycle(FreezeCycleDraft.draw(0, this.startAt, this.random));
            return;
        }
        if (latest.end() - now > FreezeRules.CYCLE_LEAD_MS)
            return;
        this.outlet.publishCycle(FreezeCycleDraft.draw(latest.n + 1, Math.max(latest.end(), now), this.random));
    }
    confirmFinishes() {
        this.arena.runners().forEach((runner) => {
            if (runner.finishConfirmed)
                return;
            const reported = runner.finishedAt > 0 ? runner.finishedAt : runner.reportedFinishAt;
            if (reported <= 0)
                return;
            this.outlet.confirmFinish(runner.id, MathUtil.clamp(reported, this.startAt, this.endAt));
        });
    }
}
