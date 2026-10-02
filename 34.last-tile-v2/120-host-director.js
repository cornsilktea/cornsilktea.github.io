"use strict";
class HostDirector {
    constructor(session, random) {
        this.session = session;
        this.random = random;
        this.roundEnding = false;
        this.advancing = false;
        this.closing = false;
        this.tokens = new TokenSource(random);
    }
    startMatch() {
        if (!this.session.isHost() || this.session.status !== "lobby")
            return;
        const players = this.session.playerRecords();
        const updates = {};
        const humanCount = Array.from(players.values()).filter((record) => !record.isAI).length;
        if (humanCount === 1)
            this.ensureOneAi(players, updates);
        else
            this.removeAllAi(players, updates);
        updates.results = null;
        this.session.updateRoom(updates).then(() => this.startRound(1, players));
    }
    startRound(roundNumber, known) {
        const source = known || this.session.playerRecords();
        const ids = Array.from(source.keys()).sort((a, b) => (source.get(a).slot || 0) - (source.get(b).slot || 0));
        this.roundEnding = false;
        this.advancing = false;
        if (ids.length < LastTileRules.MIN_PLAYERS) {
            this.session.updateRoom({ status: "lobby" });
            return;
        }
        const startAt = this.session.now() + LastTileRules.COUNTDOWN_MS + LastTileRules.COUNTDOWN_LEAD_MS;
        this.session.updateRoom({
            status: "play", ev: null, tiles: null, tileReq: null, out: null, st: null, nextAt: 0,
            round: { n: roundNumber, seed: Math.floor(this.random.next() * 1e9), startAt, roster: ids }
        });
    }
    backToLobby() {
        if (!this.session.isHost())
            return;
        const updates = { status: "lobby", results: null, round: null, ev: null, tiles: null, tileReq: null, out: null, st: null, nextAt: 0 };
        this.session.playerRecords().forEach((record, id) => { if (record.isAI)
            updates["players/" + id] = null; });
        this.roundEnding = false;
        this.advancing = false;
        this.closing = false;
        this.session.updateRoom(updates);
    }
    tick(match) {
        if (!this.session.isHost())
            return;
        const now = this.session.now();
        if (this.session.status === "play") {
            if (match && match.isOver())
                this.finishRound(match);
        }
        else if (this.session.status === "roundEnd" && this.session.nextAt && now >= this.session.nextAt && this.session.round) {
            this.advanceAfterResult(this.session.round.n);
        }
    }
    advanceAfterResult(finishedRound) {
        if (finishedRound >= LastTileRules.TOTAL_ROUNDS) {
            this.finishMatch();
            return;
        }
        if (this.advancing)
            return;
        this.advancing = true;
        this.startRound(finishedRound + 1);
    }
    finishRound(match) {
        const round = this.session.round;
        if (this.roundEnding || !round)
            return;
        this.roundEnding = true;
        const ranks = {};
        match.ranking().forEach((entry) => { ranks[entry.id] = entry.rank; });
        const names = {};
        match.contestants().forEach((contestant) => {
            names[contestant.id] = (this.session.hasPlayer(contestant.id) && this.session.player(contestant.id).nick) || contestant.participant.nick || "?";
        });
        const updates = { status: "roundEnd", nextAt: this.session.now() + LastTileRules.RESULT_MS };
        updates["results/" + round.n] = { ranks, names };
        this.session.updateRoom(updates);
    }
    finishMatch() {
        if (this.closing)
            return;
        this.closing = true;
        const scores = new TournamentScores(this.session.resultsRecord());
        const updates = { status: "final" };
        scores.winnerIds().forEach((id) => {
            if (this.session.hasPlayer(id))
                updates["wins/" + id] = this.session.winsOf(id) + 1;
        });
        this.session.updateRoom(updates);
    }
    ensureOneAi(players, updates) {
        const hasAi = Array.from(players.values()).some((record) => record.isAI);
        if (hasAi)
            return;
        const used = new Set();
        players.forEach((record) => used.add(record.nick));
        const nick = LastTileRules.AI_NAMES.filter((name) => !used.has(name))[0] || LastTileRules.AI_FALLBACK_NAME;
        const id = "ai_" + this.tokens.token(6);
        const record = { nick, isAI: true, ai: true, joinedAt: this.session.now() + 1, slot: SlotAllocator.freeSlot(players.values()), look: CharacterLooks.random() };
        updates["players/" + id] = record;
        players.set(id, record);
    }
    removeAllAi(players, updates) {
        Array.from(players.keys()).forEach((id) => {
            if (!players.get(id).isAI)
                return;
            updates["players/" + id] = null;
            players.delete(id);
        });
    }
}
