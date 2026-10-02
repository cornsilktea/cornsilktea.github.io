"use strict";
class Contestant {
    constructor(participant, controller) {
        this.participant = participant;
        this.controller = controller;
        this.fighter = new Fighter(participant.id);
    }
    get id() { return this.participant.id; }
}
class RoundEndWatch {
    constructor() {
        this.lastSampleAt = -Infinity;
        this.pendingSince = 0;
        this.over = false;
    }
    isOver() {
        return this.over;
    }
    observe(t, started, rosterSize, aliveCount) {
        if (!started || t - this.lastSampleAt < LastTileRules.END_CHECK_INTERVAL_MS)
            return;
        this.lastSampleAt = t;
        const lastOneStanding = rosterSize >= LastTileRules.MIN_PLAYERS && aliveCount <= 1;
        if (!lastOneStanding) {
            this.pendingSince = 0;
        }
        else if (!this.pendingSince) {
            this.pendingSince = t;
        }
        else if (t - this.pendingSince >= LastTileRules.ROUND_END_DELAY_MS) {
            this.over = true;
        }
    }
}
class RankCalculator {
    static rank(roster, outs) {
        const alive = roster.filter((id) => !outs.has(id));
        const entries = alive.map((id) => ({ id, rank: 1 }));
        const fallen = roster.filter((id) => outs.has(id)).sort((a, b) => outs.get(b) - outs.get(a));
        let previousRank = 0;
        let previousTime = null;
        fallen.forEach((id, order) => {
            const time = outs.get(id);
            const tied = previousTime !== null && previousTime - time <= LastTileRules.TIE_MS;
            const rank = tied ? previousRank : alive.length + order + 1;
            entries.push({ id, rank });
            previousRank = rank;
            previousTime = time;
        });
        return entries;
    }
    static provisionalRank(id, roster, outs) {
        const mine = outs.get(id);
        let earlier = 0;
        roster.forEach((other) => {
            const time = outs.get(other);
            if (time !== undefined && time < mine - LastTileRules.TIE_MS)
                earlier++;
        });
        return roster.length - earlier;
    }
}
class LastTileMatch {
    constructor(setup, services) {
        this.services = services;
        this.byId = new Map();
        this.outs = new Map();
        this.endWatch = new RoundEndWatch();
        this.concluded = false;
        this.lastFlushAt = 0;
        this.context = { env: this, listener: this, allFighters: () => this.allFighters() };
        this.board = new TileBoard(setup.seed, setup.startAt);
        this.contestantList = setup.participants.map((participant, index) => {
            const contestant = new Contestant(participant, services.controllers.controllerFor(participant));
            const spot = LastTileGeometry.startPosition(index, setup.participants.length);
            contestant.fighter.spawnAt(spot.x, spot.z);
            this.byId.set(participant.id, contestant);
            return contestant;
        });
        this.flushStates(services.clock.now());
    }
    startAt() {
        return this.board.startAt();
    }
    isPlaying(t) {
        return !this.concluded && t >= this.board.startAt();
    }
    hasStarted(t) {
        return t >= this.board.startAt();
    }
    tick(dt) {
        const t = this.services.clock.now();
        this.contestantList.forEach((contestant) => {
            if (contestant.fighter.isOut())
                return;
            contestant.controller.advance(contestant.fighter, dt, t, this.context);
        });
        if (t - this.lastFlushAt >= LastTileRules.NET_MS)
            this.flushStates(t);
        this.endWatch.observe(t, this.hasStarted(t), this.contestantList.length, this.aliveCount());
    }
    localPush() {
        const me = this.byId.get(this.services.localId);
        if (me)
            me.fighter.tryPush(this.services.clock.now(), this, this);
    }
    localDash() {
        const me = this.byId.get(this.services.localId);
        if (me)
            me.fighter.tryDash(this.services.clock.now(), this, this, null);
    }
    receiveRemoteState(id, snapshot) {
        const contestant = this.byId.get(id);
        if (!contestant || contestant.controller.simulatesHere() || this.outs.has(id))
            return;
        contestant.fighter.receiveSnapshot(snapshot);
    }
    receivePush(event) {
        const t = this.services.clock.now();
        if (!event || t - event.t > LastTileRules.PUSH_EVENT_MAX_AGE_MS)
            return;
        this.contestantList.forEach((contestant) => {
            if (contestant.controller.simulatesHere())
                contestant.fighter.receivePush(event, t, this, this);
        });
    }
    receiveTileStep(floor, index, t) {
        this.board.acceptReportedStep(floor, index, t);
    }
    arbitrateTileRequest(floor, index, requestedAt) {
        if (!isFinite(requestedAt))
            return null;
        const now = this.services.clock.now();
        const accepted = MathUtil.clamp(requestedAt, now - LastTileRules.TILE_REQUEST_PAST_MS, now + LastTileRules.TILE_REQUEST_FUTURE_MS);
        const known = this.board.knownStepTime(floor, index);
        return known !== null && known <= accepted ? null : accepted;
    }
    receiveOut(id, t) {
        this.outs.set(id, t);
        const contestant = this.byId.get(id);
        if (contestant)
            contestant.fighter.markOut();
    }
    markDeparted(id) {
        const contestant = this.byId.get(id);
        if (contestant && !this.outs.has(id))
            contestant.fighter.markDeparted();
    }
    tileStepped(floor, index, t) {
        this.services.channel.publishTileStep(floor, index, t);
    }
    stateChanged(t) {
        this.flushStates(t);
    }
    pushLaunched(event) {
        this.services.channel.publishPush(event);
    }
    eliminated(fighterId, t) {
        if (!this.outs.has(fighterId))
            this.outs.set(fighterId, t);
        this.services.channel.publishOut(fighterId, t);
    }
    allFighters() {
        return this.contestantList.map((contestant) => contestant.fighter);
    }
    contestants() {
        return this.contestantList.slice();
    }
    contestant(id) {
        return this.byId.get(id) || null;
    }
    rosterIds() {
        return this.contestantList.map((contestant) => contestant.id);
    }
    aliveCount() {
        return this.contestantList.filter((contestant) => !this.outs.has(contestant.id)).length;
    }
    isOut(id) {
        return this.outs.has(id);
    }
    provisionalRank(id) {
        return RankCalculator.provisionalRank(id, this.rosterIds(), this.outs);
    }
    isOver() {
        return this.endWatch.isOver();
    }
    ranking() {
        return RankCalculator.rank(this.rosterIds(), this.outs);
    }
    conclude() {
        this.concluded = true;
    }
    dispose() {
        this.concluded = true;
        this.byId.clear();
        this.contestantList.length = 0;
        this.outs.clear();
    }
    flushStates(t) {
        this.lastFlushAt = t;
        const states = {};
        let hasStates = false;
        this.contestantList.forEach((contestant) => {
            if (!contestant.controller.simulatesHere() || contestant.fighter.hasLeft())
                return;
            states[contestant.id] = contestant.fighter.encodeState(t);
            hasStates = true;
        });
        if (hasStates)
            this.services.channel.publishStates(states);
    }
}
