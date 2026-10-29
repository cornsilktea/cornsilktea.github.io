"use strict";
class TeamBattleVersusCards {
    static fromStats(node, known) {
        if (!node)
            return null;
        const random = node.rm || AccountStatsMath.normalizeRandom(null);
        const picks = Object.keys(random.c).filter(known).map((c) => ({ c, n: random.c[c].n, w: random.c[c].w })).filter((pick) => pick.n > 0);
        picks.sort((a, b) => b.n - a.n || b.w - a.w || a.c.localeCompare(b.c));
        return { g: random.g, w: random.w, top: picks.slice(0, TeamBattleVersusCards.TOP) };
    }
    static toRoom(card) {
        return { g: card.g, w: card.w, t: card.top.map((pick) => [pick.c, pick.n, pick.w]) };
    }
    static fromRoom(raw) {
        if (!raw || typeof raw !== "object")
            return null;
        const source = raw;
        const top = AccountShape.list(source.t).map((row) => AccountShape.list(row)).filter((row) => typeof row[0] === "string")
            .slice(0, TeamBattleVersusCards.TOP).map((row) => ({ c: String(row[0]), n: AccountNumbers.count(row[1]), w: AccountNumbers.count(row[2]) }));
        return { g: AccountNumbers.count(source.g), w: AccountNumbers.count(source.w), top };
    }
}
TeamBattleVersusCards.TOP = 3;
class TeamBattleVersusView {
    constructor(root, look) {
        this.root = root;
        this.look = look;
        this.shownKey = "";
    }
    reset() {
        this.shownKey = "";
        this.root.textContent = "";
    }
    render(mapName, blue, red) {
        const key = JSON.stringify([mapName, blue, red]);
        if (key === this.shownKey)
            return;
        const animate = !this.shownKey;
        this.shownKey = key;
        this.root.classList.toggle("tbv-enter", animate);
        this.root.innerHTML = '<div class="tbv-map">🗺️ ' + AccountHtml.esc(mapName) + "</div>"
            + '<div class="tbv-arena">' + this.sideHtml("blue", blue)
            + '<div class="tbv-vs"><span class="tbv-spark"></span><b>VS</b></div>'
            + this.sideHtml("red", red) + "</div>";
        if (animate)
            window.setTimeout(() => this.root.classList.remove("tbv-enter"), TeamBattleVersusView.ENTER_MS);
    }
    sideHtml(team, seats) {
        const rows = [];
        for (let i = 0; i < 3; i++)
            rows.push(this.rowHtml(seats[i] || null));
        return '<div class="tbv-side ' + team + '"><div class="tbv-team">' + (team === "blue" ? "블루 팀" : "레드 팀") + "</div>" + rows.join("") + "</div>";
    }
    rowHtml(seat) {
        if (seat === "empty")
            return '<div class="tbv-row waiting"><div class="tbv-who"><b>빈 자리</b><span class="tbv-rate">&nbsp;</span></div>' + this.picksHtml([]) + "</div>";
        if (!seat)
            return '<div class="tbv-row waiting"><div class="tbv-who"><b>입장하는 중…</b><span class="tbv-rate">&nbsp;</span></div>' + this.picksHtml([]) + "</div>";
        return '<div class="tbv-row' + (seat.me ? " me" : "") + '"><div class="tbv-who"><b>' + (seat.ai ? "🤖 " : "") + AccountHtml.esc(seat.nick) + "</b>"
            + '<span class="tbv-rate">' + this.rateHtml(seat) + "</span></div>"
            + this.picksHtml(seat.ai || !seat.card ? [] : seat.card.top) + "</div>";
    }
    rateHtml(seat) {
        if (seat.ai)
            return "컴퓨터";
        if (!seat.card || !seat.card.g)
            return "총 승률 <em>기록 없음</em>";
        return "총 승률 <em>" + Math.round(seat.card.w / seat.card.g * 100) + "%</em> <small>" + seat.card.w + "승 " + (seat.card.g - seat.card.w) + "패</small>";
    }
    picksHtml(top) {
        const slots = [];
        for (let i = 0; i < TeamBattleVersusCards.TOP; i++)
            slots.push(top[i] ? this.pickHtml(top[i]) : '<div class="tbv-pick empty"><i></i><b class="tbv-pick-name">&nbsp;</b><span>&nbsp;</span></div>');
        return '<div class="tbv-picks">' + slots.join("") + "</div>";
    }
    pickHtml(pick) {
        const name = this.look.nameOf(pick.c);
        return '<div class="tbv-pick" title="' + AccountHtml.esc(name) + '"><i><img src="' + AccountHtml.esc(this.look.faceOf(pick.c)) + '" alt="' + AccountHtml.esc(name) + '"></i>'
            + '<b class="tbv-pick-name">' + AccountHtml.esc(name) + "</b><span>" + pick.n + "회 / " + Math.round(pick.w / pick.n * 100) + "%</span></div>";
    }
}
TeamBattleVersusView.ENTER_MS = 1200;
