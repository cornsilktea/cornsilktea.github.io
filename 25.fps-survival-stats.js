"use strict";
/* =====================================================================
   25번 서바이벌 팀 대전 계정 통계 · 최근 10매치 (공용 뼈대 account-match-kit.ts 의 자식, 게임 키 fpsbattle)

   집계 규칙(2026-10-26, 선생님 요청)
     - 대상: 팀 대전 방(방 만들기·코드 입장·랜덤 매칭). AI 대전(혼자)은 기록하지 않는다.
     - 승: 내 팀 처치 점수가 더 높거나 상대 팀이 모두 나가서 이긴 판. 무승부는 기록하지 않는다.
     - 누적 통계: AI 가 한 명도 없던 판만. 최근 매치: AI 가 섞여도 기록.
     - 경기 절반 뒤에 나가면 패배(누적·최근 매치), 절반 전에 나가면 기록 없음.
     - 어시스트는 이 게임에 없다(피해량이 판 합계로만 쌓임). 그래서 KDA 는 처치 ÷ 쓰러짐, 쓰러짐 0 이면 "Perfect".
     - 평균(판 수로 나눔)과 합계를 함께 보이려고 처치·쓰러짐·입힌 피해는 합계로 저장한다.

   저장:
     users/<uid>/stats/fpsbattle  { g, w, l, k 처치 합, d 쓰러짐 합, dm 입힌 피해 합, ids/<경기열쇠> }
     users/<uid>/recent/fpsbattle/<0~9>  { v, id, at, r, ai, me 내 줄, s [블루 점수, 레드 점수], p [[닉네임, 팀 0블루/1레드, 처치, 쓰러짐, 피해, 나감 0/1, AI 0/1]] }
   ===================================================================== */
class FpsPlan {
    constructor(report) {
        const me = report.players[report.myIndex];
        this.withAi = report.players.some((line) => line.ai);
        this.recordsRecent = !!me && !AccountForfeit.leftEarly(report.iLeft, report.progress) && (report.winnerTeam === 0 || report.winnerTeam === 1 || report.iLeft);
        this.countsStats = this.recordsRecent && !this.withAi;
        this.win = !!me && !report.iLeft && me.team === report.winnerTeam;
    }
}
class FpsCodec {
    static encode(report, key, win) {
        return Object.assign(AccountRecentHeadCodec.encode(FpsCodec.VERSION, key, win), {
            ai: report.players.some((line) => line.ai) ? 1 : 0,
            me: report.myIndex,
            s: [AccountNumbers.count(report.score[0]), AccountNumbers.count(report.score[1])],
            p: report.players.map((line) => [
                String(line.name || "").slice(0, FpsCodec.NAME_MAX), line.team === 1 ? 1 : 0,
                AccountNumbers.count(line.kills), AccountNumbers.count(line.deaths), AccountNumbers.whole(Math.max(0, line.dmg)),
                line.left ? 1 : 0, line.ai ? 1 : 0
            ])
        });
    }
    static decode(raw) {
        const head = AccountRecentHeadCodec.decode(raw, FpsCodec.VERSION);
        if (!head)
            return null;
        const stored = raw;
        const players = [];
        for (const item of AccountShape.list(stored.p)) {
            const cells = AccountShape.list(item);
            if (cells.length < 7 || typeof cells[0] !== "string")
                return null;
            players.push({ name: String(cells[0]), team: Number(cells[1]) === 1 ? 1 : 0, kills: AccountNumbers.count(cells[2]), deaths: AccountNumbers.count(cells[3]), dmg: AccountNumbers.count(cells[4]), left: Number(cells[5]) === 1, ai: Number(cells[6]) === 1 });
        }
        const myIndex = AccountNumbers.count(stored.me);
        if (!players.length || myIndex >= players.length)
            return null;
        const score = AccountShape.list(stored.s).map((value) => AccountNumbers.count(value));
        return { id: head.id, at: head.at, win: head.win, withAi: stored.ai === 1, myIndex, score: [score[0] || 0, score[1] || 0], players };
    }
}
FpsCodec.VERSION = 1;
FpsCodec.NAME_MAX = 20;
class FpsStatsMath {
    static empty() {
        return { g: 0, w: 0, l: 0, k: 0, d: 0, dm: 0, ids: {} };
    }
    static normalize(raw) {
        const node = FpsStatsMath.empty();
        if (!raw || typeof raw !== "object")
            return node;
        const source = raw;
        ["g", "w", "l", "k", "d", "dm"].forEach((key) => { node[key] = AccountNumbers.count(source[key]); });
        const ids = AccountShape.slots(source.ids);
        Object.keys(ids).forEach((key) => { node.ids[key] = Number(ids[key]) || 0; });
        return node;
    }
    static apply(raw, me, win, key, at) {
        const before = FpsStatsMath.normalize(raw);
        if (before.ids[key] != null)
            return null;
        const node = {
            g: before.g + 1, w: before.w + (win ? 1 : 0), l: before.l + (win ? 0 : 1),
            k: before.k + AccountNumbers.count(me.kills), d: before.d + AccountNumbers.count(me.deaths), dm: before.dm + AccountNumbers.whole(Math.max(0, me.dmg)),
            ids: Object.assign({}, before.ids)
        };
        node.ids[key] = at;
        const evicted = AccountKeyLedger.overflowKeys(node.ids);
        evicted.forEach((id) => { delete node.ids[id]; });
        return { node, evicted };
    }
    static kda(kills, deaths) {
        if (deaths > 0)
            return (kills / deaths).toFixed(2);
        return kills > 0 ? "Perfect" : "—";
    }
}
class FpsProfile extends AccountGameProfile {
    constructor() {
        super(...arguments);
        this.gameKey = "fpsbattle";
    }
    matchIdOf(report) { return report.matchId; }
    planOf(report) { return new FpsPlan(report); }
    encodeRecent(report, key, win) { return FpsCodec.encode(report, key, win); }
    decodeRecent(raw) { return FpsCodec.decode(raw); }
    normalizeStats(raw) { return FpsStatsMath.normalize(raw); }
    applyStats(raw, report, plan, key, at) {
        const change = FpsStatsMath.apply(raw, report.players[report.myIndex], plan.win, key, at);
        if (!change)
            return null;
        const node = change.node;
        const patch = { g: node.g, w: node.w, l: node.l, k: node.k, d: node.d, dm: node.dm, ["ids/" + key]: node.ids[key] };
        change.evicted.forEach((id) => { patch["ids/" + id] = null; });
        return { node, patch };
    }
}
class FpsStatsView {
    constructor() {
        this.title = "서바이벌 팀 대전";
        this.emptyRecent = "아직 기록된 팀 대전이 없어요.";
    }
    statsHtml(node) {
        const s = node || FpsStatsMath.empty();
        const rows = [
            ["처치", String(s.k), AccountHtml.average(s.k, s.g, 1)],
            ["쓰러짐", String(s.d), AccountHtml.average(s.d, s.g, 1)],
            ["입힌 피해", String(s.dm), AccountHtml.average(s.dm, s.g, 0)]
        ];
        return AccountHtml.record(s.g, s.w, s.l)
            + AccountHtml.grid([["KDA (처치 ÷ 쓰러짐)", FpsStatsMath.kda(s.k, s.d)], ["판 수", String(s.g)]])
            + AccountHtml.table(["항목", "합계", "판당 평균"], rows)
            + '<div class="asd-sec">AI 없이 사람끼리 한 팀 대전만 세요. 이 게임엔 어시스트가 없어요.</div>';
    }
    blockBodyHtml(entry) {
        const me = entry.players[entry.myIndex];
        const names = (team) => entry.players.filter((p) => p.team === team).map((p) => (p.ai ? "🤖 " : "") + AccountHtml.esc(p.name)).join(" · ");
        return "처치 " + me.kills + " · 쓰러짐 " + me.deaths + " · 피해 " + me.dmg + " · 점수 " + entry.score[0] + ":" + entry.score[1]
            + "<br>블루 " + names(0) + "<br>레드 " + names(1);
    }
    resultTitle(entry) {
        return entry.score[0] === entry.score[1] ? "🤝 무승부" : "🏆 " + (entry.score[0] > entry.score[1] ? "블루" : "레드") + "팀 승리";
    }
    resultHtml(entry) {
        const head = '<div class="asd-record"><b style="color:#6FA8FF">' + entry.score[0] + '</b> : <b style="color:#FF7A70">' + entry.score[1] + "</b></div>";
        const rows = entry.players.map((p, index) => {
            const cells = [p.team === 0 ? "블루" : "레드", (p.ai ? "🤖 " : "") + AccountHtml.esc(p.name) + (index === entry.myIndex ? " (나)" : ""), String(p.kills), String(p.deaths), String(p.dmg)];
            return index === entry.myIndex ? cells.map((cell) => '<b class="asd-result-mine">' + cell + "</b>") : cells;
        });
        return head + AccountHtml.table(["팀", "닉네임", "처치", "쓰러짐", "입힌 피해"], rows);
    }
}
class FpsAccount {
    constructor() {
        this.profile = new FpsProfile();
        this.dialog = new AccountStatsDialog(() => AccountMatchStore.forProfile(this.profile), new FpsStatsView());
        this.sentKey = "";
    }
    bind() {
        this.dialog.bindButtons();
    }
    record(report) {
        const key = AccountMatchKey.of(report.matchId);
        const store = AccountMatchStore.forProfile(this.profile);
        if (!window.PORTAL_USER || !store || key === this.sentKey)
            return;
        this.sentKey = key;
        store.record(report, null).catch(() => { });
    }
}
