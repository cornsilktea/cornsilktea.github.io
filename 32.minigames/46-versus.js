"use strict";
class CollectionVersusCards {
    static fromStats(node) {
        return node ? { g: node.g, w: node.w, t: node.t } : null;
    }
    static fromRoom(raw) {
        if (!raw || typeof raw !== "object")
            return null;
        const source = raw;
        const games = AccountNumbers.count(source.g);
        return { g: games, w: Math.min(games, AccountNumbers.count(source.w)), t: Math.min(games, AccountNumbers.count(source.t)) };
    }
}
class CollectionVersusRates {
    constructor(env, gameKey) {
        this.env = env;
        this.gameKey = gameKey;
        this.card = null;
        this.loaded = false;
        this.loading = false;
        this.reloadedFor = "";
    }
    mine() {
        return this.card;
    }
    loadOnce() {
        if (!this.loaded)
            this.load();
    }
    reloadAfter(matchId) {
        if (!matchId || this.reloadedFor === matchId)
            return;
        this.reloadedFor = matchId;
        this.env.afterMs(CollectionVersusRates.RELOAD_MS, () => this.load());
    }
    load() {
        const store = AccountMatchStore.forProfile(new RandomMatchProfile(this.gameKey));
        if (!store || this.loading)
            return;
        this.loading = true;
        store.loadStats()
            .then((node) => { this.card = CollectionVersusCards.fromStats(node); this.loaded = true; })
            .catch(() => undefined)
            .then(() => { this.loading = false; });
    }
}
CollectionVersusRates.RELOAD_MS = 6000;
class CollectionVersusLineup {
    static seats(session, match) {
        const records = session.playerRecords();
        const allies = new Set(match ? match.allyIds : []);
        allies.add(session.myId);
        const order = (id) => (id === session.myId ? 0 : allies.has(id) ? 1 : 2);
        const seated = session.seatedIds().filter((id) => !records.get(id).isAI)
            .sort((a, b) => order(a) - order(b) || (records.get(a).slot || 0) - (records.get(b).slot || 0));
        const seats = seated.map((id) => CollectionVersusLineup.person(records.get(id), id === session.myId, allies.has(id)));
        if (!match) {
            while (seats.length < CollectionRules.MAX_PLAYERS)
                seats.push("empty");
            return seats;
        }
        for (let missing = match.expect - seated.length; missing > 0; missing--)
            seats.push("coming");
        session.seatedIds().filter((id) => records.get(id).isAI)
            .forEach((id) => seats.push(CollectionVersusLineup.computer(records.get(id).nick)));
        while (seats.length < CollectionRules.MIN_FIELD_SIZE)
            seats.push(CollectionVersusLineup.computer(CollectionVersusLineup.FILLER_NICK));
        return seats.slice(0, CollectionRules.MAX_PLAYERS);
    }
    static person(record, me, ally) {
        return { nick: record.nick || "학생", ai: false, me, ally, card: CollectionVersusCards.fromRoom(record.vs) };
    }
    static computer(nick) {
        return { nick: nick || CollectionVersusLineup.FILLER_NICK, ai: true, me: false, ally: false, card: null };
    }
}
CollectionVersusLineup.FILLER_NICK = "AI";
class CollectionVersusView {
    constructor(root, env) {
        this.root = root;
        this.env = env;
        this.shownKey = "";
    }
    reset() {
        this.shownKey = "";
        this.root.textContent = "";
    }
    render(seats, matched) {
        const key = JSON.stringify([seats, matched]);
        if (key === this.shownKey)
            return;
        const animate = !this.shownKey;
        this.shownKey = key;
        const half = Math.ceil(seats.length / 2);
        this.root.classList.toggle("mgv-enter", animate);
        this.root.innerHTML = '<div class="mgv-arena">' + this.sideHtml("left", seats.slice(0, half), matched)
            + '<div class="mgv-vs"><span class="mgv-spark"></span><b>VS</b></div>'
            + this.sideHtml("right", seats.slice(half), matched) + "</div>";
        if (animate)
            this.env.afterMs(CollectionVersusView.ENTER_MS, () => this.root.classList.remove("mgv-enter"));
    }
    sideHtml(side, seats, matched) {
        return '<div class="mgv-side ' + side + '">' + seats.map((seat) => this.rowHtml(seat, matched)).join("") + "</div>";
    }
    rowHtml(seat, matched) {
        if (seat === "empty")
            return this.waitingHtml("빈 자리");
        if (seat === "coming")
            return this.waitingHtml("입장하는 중…");
        const tag = seat.me ? "나" : matched && seat.ally ? "우리 팀" : "";
        const classes = "mgv-row" + (seat.me ? " me" : "") + (matched && seat.ally ? " ally" : "") + (matched && !seat.ally && !seat.ai ? " rival" : "") + (seat.ai ? " ai" : "");
        return '<div class="' + classes + '"><div class="mgv-who"><b>' + (seat.ai ? "🤖 " : "") + AccountHtml.esc(seat.nick)
            + (tag ? ' <i class="mgv-tag">' + tag + "</i>" : "") + "</b>"
            + '<span class="mgv-rate">' + this.rateHtml(seat) + "</span></div>"
            + this.recordsHtml(seat.ai ? null : seat.card) + "</div>";
    }
    waitingHtml(label) {
        return '<div class="mgv-row waiting"><div class="mgv-who"><b>' + label + '</b><span class="mgv-rate">&nbsp;</span></div>' + this.recordsHtml(null) + "</div>";
    }
    rateHtml(seat) {
        if (seat.ai)
            return "컴퓨터";
        if (!seat.card || !seat.card.g)
            return "총 승률 <em>기록 없음</em>";
        return "총 승률 <em>" + Math.round(seat.card.w / seat.card.g * 100) + "%</em> <small>" + seat.card.w + "승 " + (seat.card.g - seat.card.w) + "패</small>";
    }
    recordsHtml(card) {
        const ready = card !== null && card.g > 0;
        const first = card && ready ? card.w + "회" : "&nbsp;";
        const top = card && ready ? Math.round(card.t / card.g * 100) + "%" : "&nbsp;";
        return '<div class="mgv-recs' + (ready ? "" : " empty") + '">'
            + '<div class="mgv-rec"><span>🥇 1등</span><b>' + first + "</b></div>"
            + '<div class="mgv-rec"><span>🏅 3위 안</span><b>' + top + "</b></div></div>";
    }
}
CollectionVersusView.ENTER_MS = 1200;
class CollectionVersusScreen {
    constructor(page, env) {
        this.page = page;
        this.env = env;
        this.fadeTicket = 0;
        this.root = page.byId("versusCurtain");
        this.head = page.byId("mgvHead");
        this.hint = page.byId("mgvHint");
        this.view = new CollectionVersusView(page.byId("mgvBody"), env);
    }
    open(matched) {
        this.fadeTicket++;
        this.view.reset();
        this.page.setText(this.head, matched ? "⚔️ 상대를 찾았어요!" : "⚔️ 곧 대결이 시작돼요!");
        this.page.setText(this.hint, "종목 " + CollectionRules.GAMES_PER_COLLECTION + "개를 무작위로 뽑아 겨뤄요 · 곧 첫 종목이 시작돼요.");
        this.root.classList.remove("out");
        this.page.show(this.root, true);
    }
    render(seats, matched) {
        this.view.render(seats, matched);
    }
    close() {
        const ticket = ++this.fadeTicket;
        this.root.classList.add("out");
        this.env.afterMs(CollectionVersusScreen.FADE_MS, () => {
            if (ticket !== this.fadeTicket)
                return;
            this.page.show(this.root, false);
            this.root.classList.remove("out");
        });
    }
}
CollectionVersusScreen.FADE_MS = 350;
class CollectionVersusCurtain {
    constructor(env, screen, rates, port) {
        this.env = env;
        this.screen = screen;
        this.rates = rates;
        this.port = port;
        this.shownAt = -1;
        this.pendingAt = 0;
        this.pendingStart = null;
        this.pendingSession = null;
    }
    seatExtra() {
        const card = this.rates.mine();
        return card ? { vs: card } : {};
    }
    hostStart(start) {
        const session = this.port.session();
        if (!session || !session.isHost())
            return;
        if (session.practice || this.port.match()) {
            start();
            return;
        }
        if (this.pendingStart || this.roomLeftMs(session) > 0)
            return;
        session.updateRoom({ vsAt: session.now() });
        this.schedule(session, CollectionVersusCurtain.SHOW_MS, start);
    }
    startAfterShow(start) {
        const session = this.port.session();
        if (!session)
            return;
        const wait = this.visible() ? this.shownAt + CollectionVersusCurtain.SHOW_MS - this.env.nowMs() : CollectionVersusCurtain.SHOW_MS;
        if (wait <= 0)
            start();
        else
            this.schedule(session, wait, start);
    }
    update() {
        const now = this.env.nowMs();
        this.runPending(now);
        const session = this.port.session();
        const match = this.port.match();
        if (session && this.wanted(session, match)) {
            if (!this.visible()) {
                this.shownAt = now;
                this.screen.open(!!match);
            }
            this.screen.render(CollectionVersusLineup.seats(session, match), !!match);
            return;
        }
        if (!this.visible())
            return;
        const screen = this.port.screen();
        if (!session || screen === "start" || screen === "party" || now - this.shownAt >= CollectionVersusCurtain.MIN_MS)
            this.hide();
    }
    wanted(session, match) {
        if (session.practice || session.status !== "lobby" || this.port.screen() !== "lobby")
            return false;
        return !!match || this.roomLeftMs(session) > 0;
    }
    roomLeftMs(session) {
        return session.vsAt ? session.vsAt + CollectionVersusCurtain.SHOW_MS + CollectionVersusCurtain.ROOM_SLACK_MS - session.now() : 0;
    }
    visible() {
        return this.shownAt >= 0;
    }
    hide() {
        this.shownAt = -1;
        this.screen.close();
    }
    schedule(session, waitMs, start) {
        this.pendingSession = session;
        this.pendingStart = start;
        this.pendingAt = this.env.nowMs() + waitMs;
    }
    runPending(now) {
        if (!this.pendingStart || now < this.pendingAt)
            return;
        const start = this.pendingStart;
        const session = this.pendingSession;
        this.pendingStart = null;
        this.pendingSession = null;
        if (session && session === this.port.session() && session.status === "lobby")
            start();
    }
}
CollectionVersusCurtain.SHOW_MS = 4500;
CollectionVersusCurtain.ROOM_SLACK_MS = 3000;
CollectionVersusCurtain.MIN_MS = 2000;
