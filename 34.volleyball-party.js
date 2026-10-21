"use strict";
class VbPartyPaths {
    static create() {
        return new MkPaths(VbPartyPaths.QUEUE, VbPartyPaths.PARTIES, VbConfig.ROOT);
    }
}
VbPartyPaths.QUEUE = "matchQueue/volleyball";
VbPartyPaths.PARTIES = "volleyball/parties";
class VbRandomRoomMaker {
    constructor(directory, database, myId, myRecord) {
        this.directory = directory;
        this.database = database;
        this.myId = myId;
        this.myRecord = myRecord;
    }
    static assign(plan) {
        const assign = {};
        plan.groups.forEach((group) => {
            const people = group.entry.people || {};
            Object.keys(people)
                .sort((a, b) => people[a].joinedAt - people[b].joinedAt || (a < b ? -1 : 1))
                .slice(0, VbRandomFlow.PARTY_LIMIT)
                .forEach((id, index) => { assign[id] = group.side * VbRandomFlow.PARTY_LIMIT + index; });
        });
        return assign;
    }
    async create(plan) {
        const assign = VbRandomRoomMaker.assign(plan);
        const record = this.myRecord();
        record.slot = assign[this.myId] === undefined ? 0 : assign[this.myId];
        const code = await this.directory.create(this.myId, record, { assign, matchId: plan.matchId });
        return code ? { room: code, host: this.myId } : null;
    }
    async discard(made) {
        await this.database.ref(VbConfig.ROOT + "/" + made.room).remove();
    }
}
class VbPartyView {
    constructor() {
        this.screen = VbDom.byId("partyScreen");
        this.code = VbDom.byId("partyCode");
        this.seats = VbDom.byId("partySeats");
        this.button = VbDom.byId("btnMatch");
        this.hint = VbDom.byId("partyHint");
        this.notice = VbDom.byId("partyNotice");
        this.onAddBot = () => undefined;
        this.onRemoveBot = () => undefined;
        this.streak = new MkStreakButton(this.screen, false);
        VbDom.byId("partyStreakSlot").appendChild(this.streak.element);
        this.seats.addEventListener("click", (event) => {
            const seat = event.target.closest("[data-seat]");
            if (!seat)
                return;
            if (seat.dataset.seat === "bot")
                this.onRemoveBot();
            if (seat.dataset.seat === "empty")
                this.onAddBot();
        });
    }
    setNotice(text) {
        VbDom.setText(this.notice, text);
    }
    render(party) {
        const leader = party.isLeader();
        const searching = !!party.searching();
        VbDom.setText(this.code, party.code);
        this.streak.render(party.book());
        const rows = party.members().map(([id, member]) => {
            const tags = [id === party.record.leaderId ? "팀장" : "", id === party.myId ? "나" : ""].filter(Boolean).join(" ");
            return "<div class='vbSeat" + (id === party.myId ? " me" : "") + "'><b>" + VbDom.escape(member.nick) + "</b><small>" + tags + "</small></div>";
        });
        for (let index = 0; index < party.bots(); index++) {
            rows.push("<button type='button' class='vbSeat' data-seat='bot'" + (leader && !searching ? "" : " disabled") + "><b>🤖 AI</b><small>" + (leader && !searching ? "눌러서 빼기" : "아군 AI") + "</small></button>");
        }
        while (rows.length < VbRandomFlow.PARTY_LIMIT) {
            rows.push(leader && !searching
                ? "<button type='button' class='vbSeat empty' data-seat='empty'><b>🤖 AI 추가</b><small>빈 자리 · 친구는 팀 코드로 들어와요</small></button>"
                : "<div class='vbSeat empty'><b>빈 자리</b><small>경기에서는 AI가 채워요</small></div>");
        }
        this.seats.innerHTML = "<div class='vbTeam' style='--team:#D97B4F'><h3>우리 팀</h3>" + rows.join("") + "</div>";
        this.button.textContent = searching ? "매칭 취소" : "매칭 시작";
        this.button.classList.toggle("sub", searching);
        this.button.disabled = !leader;
        const streakNote = party.book().streak() > 0 ? " · 지금 " + party.book().streak() + "연승 중" : "";
        VbDom.setText(this.hint, searching
            ? "상대를 찾는 중… " + party.searchSeconds() + "초" + streakNote
            : leader ? "매칭 시작을 누르면 아무 팀과 2대2로 만나요." + streakNote : "팀장이 매칭을 시작하길 기다리는 중이에요…" + streakNote);
    }
}
class VbRandomFlow {
    constructor(backend, rooms, myId, hooks) {
        this.backend = backend;
        this.rooms = rooms;
        this.myId = myId;
        this.hooks = hooks;
        this.paths = VbPartyPaths.create();
        this.matcher = new MkVersusMatcher(VbRandomFlow.PARTY_LIMIT);
        this.view = new VbPartyView();
        this.party = null;
        this.queue = null;
        this.ticket = null;
        this.startTimer = null;
        this.secondsTimer = null;
        this.resultShown = false;
        this.startedFor = "";
        this.directory = new MkPartyDirectory(backend.database, backend, this.paths, VbRandomFlow.PARTY_LIMIT);
        this.view.onAddBot = () => { if (this.party)
            this.party.setBots(this.party.bots() + 1); };
        this.view.onRemoveBot = () => { if (this.party)
            this.party.setBots(this.party.bots() - 1); };
        VbDom.byId("btnMatch").addEventListener("click", () => this.toggleSearch());
        VbDom.byId("btnPartyLeave").addEventListener("click", () => this.leaveParty());
    }
    inParty() {
        return !!this.party;
    }
    hasTicket() {
        return !!this.ticket;
    }
    async create() {
        const code = await this.directory.create(this.myId, this.member());
        if (!code)
            return "팀 대기실을 만들지 못했어요. 다시 눌러 주세요.";
        this.attach(code);
        return "";
    }
    async tryJoin(code) {
        if (!(await this.directory.exists(code)))
            return { handled: false, message: "" };
        const outcome = await this.directory.join(code, this.myId, this.member());
        if (outcome.ok)
            this.attach(code);
        return { handled: true, message: outcome.message };
    }
    updateMe() {
        if (this.party)
            this.party.updateMe(this.member());
    }
    render() {
        if (this.party)
            this.view.render(this.party);
    }
    roomChanged(session) {
        if (!this.ticket || !session.isHost() || session.status !== "lobby")
            return;
        const humans = VbSeatPlan.humanSeats(session.players).filter((id) => !!id).length;
        if (humans >= this.ticket.expect)
            this.startNow();
    }
    matchEnded(end) {
        const ticket = this.ticket;
        if (!ticket || !this.party)
            return;
        this.resultShown = true;
        this.party.report(ticket, { result: end.winner === ticket.side ? "win" : "lose" });
        this.showEndStreak();
    }
    endHint() {
        return this.party ? "지금 " + this.party.book().streakLabel().replace("🔥 ", "") : "";
    }
    backToParty(message) {
        const note = this.resultShown ? "" : message;
        this.clearStartTimer();
        this.ticket = null;
        this.resultShown = false;
        this.hooks.leaveRoomQuietly();
        if (this.party)
            this.hooks.showParty(note);
        else
            this.hooks.showStart(note);
    }
    member() {
        const record = this.hooks.myRecord();
        return { nick: record.nick, joinedAt: this.backend.now(), look: record.look };
    }
    attach(code) {
        const party = new MkParty(this.backend.database, this.backend, this.paths, code, this.myId, VbRandomFlow.PARTY_LIMIT);
        this.party = party;
        party.onChange = () => {
            this.render();
            this.tickSeconds(!!party.searching());
            if (this.resultShown)
                this.showEndStreak();
        };
        party.onTicket = (ticket) => this.receiveTicket(ticket);
        party.onClosed = (message) => this.dropParty(message);
        party.connect();
        this.view.setNotice("");
        this.hooks.showParty("");
    }
    async toggleSearch() {
        const party = this.party;
        if (!party || !party.isLeader())
            return;
        const button = VbDom.byId("btnMatch");
        button.disabled = true;
        try {
            if (party.searching()) {
                const cancelled = this.queue ? await this.queue.cancel(party) : true;
                if (!cancelled)
                    this.view.setNotice("상대를 찾았어요! 곧 경기장으로 가요.");
                else if (!this.queue)
                    await party.markSearching(null);
            }
            else {
                this.view.setNotice("");
                if (this.queue)
                    this.queue.stop();
                const database = this.backend.database;
                this.queue = new MkQueue(database, this.backend, this.paths, this.matcher, new VbRandomRoomMaker(this.rooms, database, this.myId, () => this.hooks.myRecord()));
                this.queue.onError = (message) => this.view.setNotice(message);
                await this.queue.enter(party);
            }
        }
        catch (error) {
            this.view.setNotice("매칭 서버에 연결하지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
        }
        this.render();
    }
    async receiveTicket(ticket) {
        if (this.queue)
            this.queue.stop();
        this.tickSeconds(false);
        this.hooks.leaveRoomQuietly();
        this.ticket = ticket;
        this.resultShown = false;
        const hosting = ticket.host === this.myId;
        const entered = await this.hooks.enterTicketRoom(ticket.room, hosting);
        if (!entered) {
            this.ticket = null;
            if (this.party)
                this.party.clearTicket(ticket.matchId);
            this.hooks.showParty("경기장에 들어가지 못했어요. 다시 매칭해 주세요.");
            return;
        }
        if (hosting) {
            this.clearStartTimer();
            this.startTimer = setTimeout(() => this.startNow(), VbRandomFlow.START_WAIT_MS);
        }
    }
    startNow() {
        this.clearStartTimer();
        if (!this.ticket || this.startedFor === this.ticket.matchId)
            return;
        this.startedFor = this.ticket.matchId;
        this.hooks.startMatch();
    }
    clearStartTimer() {
        if (this.startTimer)
            clearTimeout(this.startTimer);
        this.startTimer = null;
    }
    tickSeconds(on) {
        if (on && !this.secondsTimer)
            this.secondsTimer = setInterval(() => this.render(), 1000);
        if (!on && this.secondsTimer) {
            clearInterval(this.secondsTimer);
            this.secondsTimer = null;
        }
    }
    showEndStreak() {
        VbDom.setText(VbDom.byId("endHint"), this.endHint());
    }
    async leaveParty() {
        const party = this.party;
        if (!party)
            return;
        if (this.queue)
            this.queue.stop();
        this.tickSeconds(false);
        this.party = null;
        await party.leave().catch(() => undefined);
        this.hooks.showStart("");
    }
    dropParty(message) {
        if (this.queue)
            this.queue.stop();
        this.tickSeconds(false);
        this.party = null;
        if (!this.ticket)
            this.hooks.showStart(message);
    }
}
VbRandomFlow.PARTY_LIMIT = 2;
VbRandomFlow.START_WAIT_MS = 15000;
