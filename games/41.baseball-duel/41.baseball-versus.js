"use strict";
class BbVersusContent {
    title(randomMatch) { return randomMatch ? "상대를 찾았어요!" : "곧 대결이 시작돼요!"; }
    centerBadge() { return "VS"; }
    footer() { return "랜덤 매칭 경기 기록"; }
    rowsFor(side) {
        if (side.kind === "ai")
            return [new VersusTextRow("🤖 AI"), new VersusTextRow("컴퓨터", true)];
        if (side.kind === "pending")
            return [new VersusTextRow("입장하는 중…", true)];
        if (side.kind === "empty")
            return [new VersusTextRow("빈 자리", true)];
        const card = side.payload;
        if (!card || !card.g)
            return [new VersusTextRow("기록 없음", true)];
        const f = BbBaseballFormulas;
        return [
            new VersusStatRow(card.g + "경기 · " + card.w + "승 " + card.l + "패" + (card.t ? " " + card.t + "무" : ""), [["승률", AccountHtml.percent(card.w, card.g)], ["평균 득점", f.meanText(f.perGame(card.rf, card.g))], ["평균 실점", f.meanText(f.perGame(card.ra, card.g))]]),
            new VersusStatRow("타격", [["타율", f.rateText(f.average(card.bat))], ["OPS", f.rateText(f.ops(card.bat))], ["홈런", String(card.bat.hr)]]),
            new VersusStatRow("투구", [["평균자책점", f.meanText(f.earnedRunAverage(card.pit))], ["WHIP", f.meanText(f.whip(card.pit))], ["피OPS", f.rateText(f.ops(card.pit))]])
        ];
    }
}
BbVersusContent.COLORS = ["#D9534F", "#4F8BD9"];
class BbVersusLineup {
    static side(id, person, fallbackNick, team, myId, ai) {
        const color = BbVersusContent.COLORS[team];
        if (ai)
            return { nick: fallbackNick || "AI", kind: "ai", me: false, portrait: null, color, payload: null };
        if (!id)
            return { nick: "상대", kind: "empty", me: false, portrait: null, color, payload: null };
        if (!person)
            return { nick: fallbackNick || "상대", kind: "pending", me: false, portrait: null, color, payload: null };
        return { nick: person.nick || "학생", kind: "player", me: id === myId, portrait: null, color, payload: BbVersusCards.fromRoom(person.vs) };
    }
}
