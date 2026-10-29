"use strict";
class WbVersusCards {
    static fromStats(node) {
        return node && node.rm.g > 0 ? Object.assign({}, node.rm) : null;
    }
    static fromRoom(raw) {
        if (!raw || typeof raw !== "object")
            return null;
        const card = WbRandomTallyMath.normalize(raw);
        return card.g > 0 ? card : null;
    }
}
class WbVersusRates {
    constructor(account) {
        this.account = account;
        this.node = null;
        this.loaded = false;
    }
    loadOnce() {
        if (this.loaded)
            return Promise.resolve();
        return this.account.loadStats().then((node) => { this.node = node; this.loaded = true; }).catch(() => undefined);
    }
    forRoom() {
        return WbVersusCards.fromStats(this.node);
    }
    note(report) {
        const plan = new WbAccountPlan(report);
        if (!window.PORTAL_USER || !this.loaded || !plan.countsRandom)
            return;
        const change = WbAccountMath.apply(this.node, report, plan.win, AccountMatchKey.of(report.matchId), Date.now());
        if (change)
            this.node = change.node;
    }
}
class WbVersusLineupBuilder {
    static build(mode, teams, people, myId) {
        const units = teams.map((team) => ({
            color: team.color,
            seats: team.members.map((member) => WbVersusLineupBuilder.seatOf(member, people.get(member.id) || null, myId))
        }));
        return { mode, units };
    }
    static seatOf(member, person, myId) {
        if (member.bot)
            return { nick: member.nick, ai: true, me: false, waiting: false, card: null };
        if (!person)
            return { nick: member.nick, ai: false, me: false, waiting: true, card: null };
        return { nick: person.nick || "학생", ai: false, me: member.id === myId, waiting: false, card: WbVersusCards.fromRoom(person.vs) };
    }
}
class WbVersusView {
    constructor(root) {
        this.root = root;
        this.shownKey = "";
    }
    reset() {
        this.shownKey = "";
        this.root.textContent = "";
        this.root.classList.remove("wbv-enter");
    }
    render(title, lineup) {
        const key = JSON.stringify([title, lineup]);
        if (key === this.shownKey)
            return;
        const animate = !this.shownKey;
        this.shownKey = key;
        if (animate)
            this.root.classList.add("wbv-enter");
        const team = lineup.mode === "team";
        const sub = team ? "팀전 · 2명씩 " + lineup.units.length + "팀 · 마지막까지 남은 팀이 우승" : "개인전 · " + lineup.units.length + "명 · 최후의 1명이 우승";
        this.root.innerHTML = '<div class="wbv-head">💧 ' + AccountHtml.esc(title) + '</div><div class="wbv-sub">' + sub + "</div>"
            + (team ? this.teamsHtml(lineup.units) : this.soloHtml(lineup.units));
        if (animate)
            window.setTimeout(() => this.root.classList.remove("wbv-enter"), WbVersusView.ENTER_MS);
    }
    soloHtml(units) {
        const columns = Math.min(WbVersusView.SOLO_COLUMNS, Math.max(2, units.length <= 4 ? units.length : Math.ceil(units.length / 2)));
        return '<div class="wbv-grid" style="--wbv-cols:' + columns + '">'
            + units.map((unit, index) => this.seatHtml(unit.seats[0], WbPalette.teamColor("solo", unit.color), index, false)).join("") + "</div>";
    }
    teamsHtml(units) {
        const boxes = units.map((unit, index) => {
            const color = WbPalette.teamColor("team", unit.color);
            return '<div class="wbv-team" style="--wbv-c:' + color + ";--wbv-i:" + index + '"><b class="wbv-team-name">' + WbVersusView.TEAM_NAMES[unit.color % 4] + "팀</b>"
                + unit.seats.map((seat, k) => this.seatHtml(seat, color, index * 2 + k, true)).join("") + "</div>";
        });
        return '<div class="wbv-teams">' + boxes.join('<div class="wbv-vs"><b>VS</b></div>') + "</div>";
    }
    seatHtml(seat, color, index, team) {
        const cls = "wbv-card" + (seat.me ? " me" : "") + (seat.waiting ? " waiting" : "");
        const tag = seat.me ? "나" : seat.ai ? "봇" : "&nbsp;";
        const name = (seat.ai ? "🤖 " : "") + AccountHtml.esc(seat.nick || (seat.waiting ? "상대" : ""));
        const lines = seat.ai ? ["컴퓨터", "&nbsp;"] : seat.waiting ? ["입장하는 중…", "&nbsp;"] : this.recordLines(seat.card, team);
        return '<div class="' + cls + '" style="--wbv-c:' + color + ";--wbv-i:" + index + '"><span class="wbv-tag">' + tag + '</span><b class="wbv-name">' + name + "</b>"
            + lines.map((line) => '<span class="wbv-line">' + line + "</span>").join("") + "</div>";
    }
    recordLines(card, team) {
        if (!card || !card.g)
            return ["1위 비율 <em>기록 없음</em>", "&nbsp;"];
        const first = "1위 비율 <em>" + Math.round(card.w / card.g * 100) + "%</em> <small>" + card.w + "승 " + (card.g - card.w) + "패</small>";
        const rescue = team ? " · 구출 <em>" + (card.gt ? AccountHtml.average(card.rs, card.gt, 1) : "—") + "</em>" : "";
        return [first, "판당 처치 <em>" + AccountHtml.average(card.kl, card.g, 1) + "</em>" + rescue];
    }
}
WbVersusView.ENTER_MS = 1400;
WbVersusView.SOLO_COLUMNS = 4;
WbVersusView.TEAM_NAMES = ["빨강", "파랑", "노랑", "초록"];
