"use strict";
class ZombieVersusCards {
    static fromStats(node) {
        return node ? ZombieVersusCards.fromRoom(node.rm) : null;
    }
    static toRoom(card) {
        return { g: card.g, w: card.w, hg: card.hg, hw: card.hw, zg: card.zg, zw: card.zw };
    }
    static fromRoom(raw) {
        if (!raw || typeof raw !== "object")
            return null;
        const tally = ZombieRandomTallyMath.normalize(raw);
        return tally.g ? tally : null;
    }
}
class ZombieVersusLineup {
    static build(humans, capacity, matched, expected) {
        const seats = humans.slice(0, capacity).map((human) => ({ kind: "player", nick: human.nick, me: human.me, zombie: human.zombie, card: human.card }));
        const coming = matched ? Math.max(0, Math.min(capacity, expected) - seats.length) : 0;
        while (seats.length < capacity && seats.length < humans.length + coming)
            seats.push({ kind: "coming" });
        while (seats.length < capacity)
            seats.push(matched ? { kind: "ai" } : { kind: "empty" });
        return seats;
    }
}
class ZombieVersusView {
    constructor(root) {
        this.root = root;
        this.shownKey = "";
    }
    reset() {
        this.shownKey = "";
        this.root.textContent = "";
    }
    render(seats) {
        const key = JSON.stringify(seats);
        if (key === this.shownKey)
            return;
        const animate = !this.shownKey;
        this.shownKey = key;
        this.root.classList.toggle("zv-enter", animate);
        const cells = seats.map((seat, index) => '<div class="zv-cell" style="--zv-delay:' + (index * 0.08) + 's">' + this.seatHtml(seat) + "</div>");
        this.root.innerHTML = '<div class="zv-arena' + (seats.length > 4 ? " wide" : "") + '">' + cells.join("") + "</div>";
        if (animate)
            window.setTimeout(() => this.root.classList.remove("zv-enter"), ZombieVersusView.ENTER_MS);
    }
    seatHtml(seat) {
        const blank = '<span class="zv-line">&nbsp;</span>';
        if (seat.kind === "ai")
            return '<div class="zv-seat ai"><b>🤖 AI</b><span class="zv-line">컴퓨터</span>' + blank + "</div>";
        if (seat.kind === "coming")
            return '<div class="zv-seat waiting"><b>입장하는 중…</b>' + blank + blank + "</div>";
        if (seat.kind === "empty")
            return '<div class="zv-seat empty"><b>빈 자리</b>' + blank + blank + "</div>";
        return '<div class="zv-seat' + (seat.me ? " me" : "") + (seat.zombie ? " zombie" : "") + '"><b>' + (seat.zombie ? "🧟 " : "") + AccountHtml.esc(seat.nick) + (seat.me ? " <small>(나)</small>" : "") + "</b>" + this.cardHtml(seat.card) + "</div>";
    }
    cardHtml(card) {
        if (!card)
            return '<span class="zv-line"><em>기록 없음</em></span><span class="zv-line">&nbsp;</span>';
        return '<span class="zv-line">승률 <em>' + ZombieVersusView.percent(card.w, card.g) + "</em> <small>" + card.w + "승 " + (card.g - card.w) + "패</small></span>"
            + '<span class="zv-line">인간 <em>' + ZombieVersusView.percent(card.hw, card.hg) + "</em> · 좀비 <em>" + ZombieVersusView.percent(card.zw, card.zg) + "</em></span>";
    }
    static percent(part, total) {
        return total ? Math.round(part / total * 100) + "%" : "—";
    }
}
ZombieVersusView.ENTER_MS = 1200;
