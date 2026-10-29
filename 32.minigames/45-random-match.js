"use strict";
class CollectionMatchHooks {
    constructor(port, myId) {
        this.port = port;
        this.myId = myId;
    }
    member() {
        return this.port.member();
    }
    async create(plan) {
        const code = await this.port.createMatchedRoom(plan.matchId);
        return code ? { room: code, host: this.myId } : null;
    }
    discard(made) {
        return this.port.discardRoom(made.room);
    }
    enterRoom(ticket, hosting) {
        return this.port.enterTicketRoom(ticket.room, hosting);
    }
    leaveRoom() {
        this.port.leaveRoomQuietly();
    }
    startMatch() {
        this.port.startCollection();
    }
    showParty() {
        this.port.showParty();
    }
    presentIds() {
        return this.port.presentIds();
    }
    showStart(message) {
        this.port.showStart(message);
    }
}
class CollectionFinalOutcome {
    static of(scores, memberIds) {
        const mine = memberIds.filter((id) => scores.ids().indexOf(id) >= 0);
        if (!mine.length)
            return null;
        const rank = Math.min(...mine.map((id) => 1 + scores.ids().filter((other) => scores.total(other) > scores.total(id)).length));
        return { result: rank === 1 ? "win" : "lose", rank, of: scores.ids().length };
    }
}
class CollectionRandomMatch {
    constructor(database, clock, myId, port, screen, mount) {
        this.flow = null;
        if (!database)
            return;
        const options = {
            gameRoot: "minigames",
            queue: "minigames",
            partyLimit: CollectionRandomMatch.PARTY_LIMIT,
            matcher: new MkFreeForAllMatcher(CollectionRandomMatch.PARTY_LIMIT, CollectionRules.MAX_PLAYERS),
            intro: "매칭 시작을 누르면 다른 학생들과 최대 " + CollectionRules.MAX_PLAYERS + "명이 모여 미니게임 모음을 해요. 모자란 자리는 AI가 채워요.",
            showRank: true,
            stats: new RandomMatchAccount(CollectionRandomMatch.STATS_KEY, "미니게임 랜덤 매칭 통계", true)
        };
        this.flow = new MkRandomFlow(database, clock, myId, options, new CollectionMatchHooks(port, myId), new MkPartyPanel(screen, mount, options));
    }
    inParty() {
        return !!this.flow && this.flow.inParty();
    }
    matched() {
        return !!this.flow && this.flow.hasTicket();
    }
    versusMatch() {
        const ticket = this.flow ? this.flow.ticket() : null;
        return this.flow && ticket ? { allyIds: this.flow.memberIds(), expect: ticket.expect } : null;
    }
    streakText() {
        return this.flow ? this.flow.endHint() : "";
    }
    async codeTaken(code) {
        return this.flow ? this.flow.codeTaken(code).catch(() => false) : false;
    }
    reportFinal(scores, onStreak) {
        const flow = this.flow;
        const ticket = flow ? flow.ticket() : null;
        if (!flow || !ticket)
            return "";
        const outcome = CollectionFinalOutcome.of(scores, flow.memberIds());
        if (!outcome)
            return "";
        flow.matchEnded(outcome, onStreak);
        return ticket.matchId;
    }
}
CollectionRandomMatch.PARTY_LIMIT = 3;
CollectionRandomMatch.STATS_KEY = "minigames";
