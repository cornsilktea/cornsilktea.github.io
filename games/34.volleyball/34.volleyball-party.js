"use strict";
class VbPartyPaths {
}
VbPartyPaths.GAME_ROOT = "volleyball";
VbPartyPaths.PARTIES = "volleyball/parties";
class VbMatchHooks {
    constructor(directory, database, myId, port) {
        this.directory = directory;
        this.database = database;
        this.myId = myId;
        this.port = port;
    }
    member() {
        const record = this.port.myRecord();
        return { nick: record.nick, joinedAt: record.joinedAt, look: record.look };
    }
    async create(plan) {
        const assign = MkSeatAssign.bySide(plan, VbRandomSetup.PARTY_LIMIT);
        const record = this.port.myRecord();
        record.slot = assign[this.myId] === undefined ? 0 : assign[this.myId];
        const code = await this.directory.create(this.myId, record, { assign, matchId: plan.matchId });
        return code ? { room: code, host: this.myId } : null;
    }
    async discard(made) {
        await this.database.ref(VbConfig.ROOT + "/" + made.room).remove();
    }
    enterRoom(ticket, hosting) {
        return this.port.enterTicketRoom(ticket.room, hosting);
    }
    leaveRoom() {
        this.port.leaveRoomQuietly();
    }
    startMatch() {
        this.port.startMatch();
    }
    showParty() {
        this.port.showParty();
    }
    showStart(message) {
        this.port.showStart(message);
    }
    presentIds() {
        return this.port.presentIds();
    }
}
class VbRandomSetup {
    static create(backend, directory, myId, port) {
        const database = backend.database;
        const options = {
            gameRoot: VbPartyPaths.GAME_ROOT,
            queue: "volleyball",
            partyLimit: VbRandomSetup.PARTY_LIMIT,
            matcher: new MkVersusMatcher(VbRandomSetup.PARTY_LIMIT),
            intro: "매칭 시작을 누르면 아무 팀과 2대2로 만나요.",
            allowBots: true,
            stats: new RandomMatchAccount(VbPartyPaths.GAME_ROOT, "배구 랜덤 매칭 통계", false)
        };
        const panel = new MkPartyPanel(VbDom.byId("partyScreen"), VbDom.byId("partyMount"), options);
        return new MkRandomFlow(database, backend, myId, options, new VbMatchHooks(directory, database, myId, port), panel);
    }
}
VbRandomSetup.PARTY_LIMIT = 2;
