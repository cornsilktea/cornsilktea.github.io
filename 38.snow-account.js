"use strict";
/* =====================================================================
   38번 눈싸움 배틀로얄 계정 통계 · 최근 10매치 (공용 뼈대 account-match-kit.ts 의 자식, 게임 키 snowroyale)

   집계 규칙(2026-10-26, 선생님 요청 · 정의는 규칙 엔진 기준으로 정함)
     - 대상: 온라인 방(방 만들기·코드 입장·랜덤 매칭). 혼자 연습(AI)·관전은 기록하지 않는다.
     - 승: 내 팀이 1위(팀전은 팀 승리, 개인전은 최후 생존). 2위 이하는 패. 순위는 규칙 엔진 SnScoreboard.ranks 와 같다.
     - 누적 통계: AI 가 한 명도 없던 판만. 최근 매치: AI 가 섞여도 기록.
     - 경기 진행(눈보라 단계 또는 탈락한 팀 비율)이 절반을 넘긴 뒤 나가면 패배, 절반 전이면 기록 없음.
     - 처치·준 피해·모은 눈·만든 벽·생존 시간·어시스트는 모두 규칙 엔진(SnPlayer, SnEngine.survival)이 센 값을 쓴다.
       어시스트 = 상대가 쓰러지기 5초 안에 그 상대에게 피해를 준 다른 사람(SnBalance.ASSIST_WINDOW, 30번 규칙과 같다).
     - 모드(팀전/개인전)는 합산하고 판 수만 따로 센다. 눈덩이 명중률은 엔진이 세지 않아 넣지 않았다.

   저장:
     users/<uid>/stats/snowroyale  { g, w, l, gd 팀전 판, gs 개인전 판, k 처치, a 어시스트, dm 준 피해, wl 만든 벽, sv 생존 초 합, rk 순위 합, t3 3위 안 횟수, mk 한 판 최다 처치, ids }
     users/<uid>/recent/snowroyale/<0~9>  { v, id, at, r, ai, md 0팀전/1개인전, me, p [[닉네임, 팀, 순위, 생존 초, 처치, 어시스트, 준 피해, 모은 눈, 만든 벽, 나감 0/1, AI 0/1]] }
   ===================================================================== */
class SnAccountKeys {
    static modeIndex(mode) {
        return mode === "solo" ? 1 : 0;
    }
}
SnAccountKeys.NUMBERS = ["g", "w", "l", "gd", "gs", "k", "a", "dm", "wl", "sv", "rk", "t3", "mk"];
SnAccountKeys.MODES = ["duos", "solo"];
SnAccountKeys.MODE_NAMES = ["팀전", "개인전"];
class SnAccountPlan {
    constructor(report) {
        const me = report.players[report.myIndex];
        this.withAi = report.players.some((line) => line.ai);
        this.recordsRecent = !!me && !AccountForfeit.leftEarly(report.iLeft, report.progress);
        this.countsStats = this.recordsRecent && !this.withAi;
        this.win = !!me && !report.iLeft && me.rank === 1;
    }
}
class SnAccountCodec {
    static encode(report, key, win) {
        return Object.assign(AccountRecentHeadCodec.encode(SnAccountCodec.VERSION, key, win), {
            ai: report.players.some((line) => line.ai) ? 1 : 0,
            md: SnAccountKeys.modeIndex(report.mode),
            me: report.myIndex,
            p: report.players.map((line) => [
                String(line.name || "").slice(0, SnAccountCodec.NAME_MAX), AccountNumbers.count(line.team), Math.max(1, AccountNumbers.count(line.rank)),
                AccountNumbers.oneDecimal(Math.max(0, line.secs)), AccountNumbers.count(line.kills), AccountNumbers.count(line.assists),
                AccountNumbers.whole(Math.max(0, line.dealt)), AccountNumbers.count(line.collected), AccountNumbers.count(line.walls), line.left ? 1 : 0, line.ai ? 1 : 0
            ])
        });
    }
    static decode(raw) {
        const head = AccountRecentHeadCodec.decode(raw, SnAccountCodec.VERSION);
        if (!head)
            return null;
        const stored = raw;
        const players = [];
        for (const item of AccountShape.list(stored.p)) {
            const cells = AccountShape.list(item);
            if (cells.length < SnAccountCodec.CELLS || typeof cells[0] !== "string")
                return null;
            const n = (index) => Number(cells[index]) || 0;
            players.push({ name: String(cells[0]), team: n(1), rank: n(2), secs: n(3), kills: n(4), assists: n(5), dealt: n(6), collected: n(7), walls: n(8), left: n(9) === 1, ai: n(10) === 1 });
        }
        const myIndex = AccountNumbers.count(stored.me);
        if (!players.length || myIndex >= players.length)
            return null;
        return { id: head.id, at: head.at, win: head.win, withAi: stored.ai === 1, mode: SnAccountKeys.MODES[stored.md === 1 ? 1 : 0], myIndex, players };
    }
}
SnAccountCodec.VERSION = 1;
SnAccountCodec.NAME_MAX = 20;
SnAccountCodec.CELLS = 11;
class SnAccountMath {
    static empty() {
        return { g: 0, w: 0, l: 0, gd: 0, gs: 0, k: 0, a: 0, dm: 0, wl: 0, sv: 0, rk: 0, t3: 0, mk: 0, ids: {} };
    }
    static normalize(raw) {
        const node = SnAccountMath.empty();
        if (!raw || typeof raw !== "object")
            return node;
        const source = raw;
        SnAccountKeys.NUMBERS.forEach((key) => { node[key] = AccountNumbers.count(source[key]); });
        const ids = AccountShape.slots(source.ids);
        Object.keys(ids).forEach((key) => { node.ids[key] = Number(ids[key]) || 0; });
        return node;
    }
    static apply(raw, report, win, key, at) {
        const before = SnAccountMath.normalize(raw);
        if (before.ids[key] != null)
            return null;
        const me = report.players[report.myIndex];
        const solo = SnAccountKeys.modeIndex(report.mode) === 1;
        const kills = AccountNumbers.count(me.kills);
        const node = {
            g: before.g + 1, w: before.w + (win ? 1 : 0), l: before.l + (win ? 0 : 1),
            gd: before.gd + (solo ? 0 : 1), gs: before.gs + (solo ? 1 : 0),
            k: before.k + kills, a: before.a + AccountNumbers.count(me.assists), dm: before.dm + AccountNumbers.whole(Math.max(0, me.dealt)), wl: before.wl + AccountNumbers.count(me.walls),
            sv: before.sv + AccountNumbers.whole(Math.max(0, me.secs)), rk: before.rk + Math.max(1, AccountNumbers.count(me.rank)), t3: before.t3 + (me.rank <= 3 ? 1 : 0), mk: Math.max(before.mk, kills),
            ids: Object.assign({}, before.ids)
        };
        node.ids[key] = at;
        const evicted = AccountKeyLedger.overflowKeys(node.ids);
        evicted.forEach((id) => { delete node.ids[id]; });
        return { node, evicted };
    }
}
class SnAccountProfile extends AccountGameProfile {
    constructor() {
        super(...arguments);
        this.gameKey = "snowroyale";
    }
    matchIdOf(report) { return report.matchId; }
    planOf(report) { return new SnAccountPlan(report); }
    encodeRecent(report, key, win) { return SnAccountCodec.encode(report, key, win); }
    decodeRecent(raw) { return SnAccountCodec.decode(raw); }
    normalizeStats(raw) { return SnAccountMath.normalize(raw); }
    applyStats(raw, report, plan, key, at) {
        const change = SnAccountMath.apply(raw, report, plan.win, key, at);
        if (!change)
            return null;
        const node = change.node;
        const patch = {};
        SnAccountKeys.NUMBERS.forEach((name) => { patch[name] = node[name]; });
        patch["ids/" + key] = node.ids[key];
        change.evicted.forEach((id) => { patch["ids/" + id] = null; });
        return { node, patch };
    }
}
class SnAccountView {
    constructor() {
        this.title = "눈싸움 배틀로얄";
        this.emptyRecent = "아직 기록된 온라인 경기가 없어요.";
    }
    statsHtml(node) {
        const s = node || SnAccountMath.empty();
        const rows = [
            ["처치", String(s.k), AccountHtml.average(s.k, s.g, 1)],
            ["어시스트", String(s.a), AccountHtml.average(s.a, s.g, 1)],
            ["준 피해", String(s.dm), AccountHtml.average(s.dm, s.g, 0)],
            ["만든 벽", String(s.wl), AccountHtml.average(s.wl, s.g, 1)]
        ];
        return AccountHtml.record(s.g, s.w, s.l)
            + AccountHtml.grid([
                ["평균 순위", s.g ? AccountHtml.average(s.rk, s.g, 1) + "위" : "—"],
                ["평균 생존 시간", s.g ? AccountHtml.minutes(s.sv / s.g) : "—"],
                ["3위 안", s.t3 + "번 (" + AccountHtml.percent(s.t3, s.g) + ")"],
                ["한 판 최다 처치", String(s.mk)],
                ["팀전 / 개인전", s.gd + "판 / " + s.gs + "판"]
            ])
            + AccountHtml.table(["항목", "합계", "판당 평균"], rows)
            + '<div class="asd-sec">AI 없이 사람끼리 한 온라인 경기만 세요. 1위가 승리예요.</div>';
    }
    blockBodyHtml(entry) {
        const me = entry.players[entry.myIndex];
        const teams = new Set(entry.players.map((p) => p.team)).size;
        return SnAccountKeys.MODE_NAMES[SnAccountKeys.modeIndex(entry.mode)] + " · " + me.rank + "위/" + teams + "팀 · 생존 " + AccountHtml.minutes(me.secs)
            + "<br>처치 " + me.kills + " · 어시스트 " + me.assists + " · 준 피해 " + me.dealt;
    }
    resultTitle(entry) {
        return entry.players[entry.myIndex].rank === 1 ? "우승! 🏆" : entry.players[entry.myIndex].rank + "위";
    }
    resultHtml(entry) {
        const order = entry.players.map((p, index) => ({ p, index })).sort((a, b) => (a.p.rank - b.p.rank) || (a.index - b.index));
        const rows = order.map((item) => {
            const p = item.p;
            const cells = [p.rank + "위", (p.ai ? "🤖 " : "") + AccountHtml.esc(p.name) + (item.index === entry.myIndex ? " (나)" : ""), AccountHtml.minutes(p.secs), String(p.kills), String(p.assists), String(p.dealt), String(p.collected), String(p.walls)];
            return item.index === entry.myIndex ? cells.map((cell) => '<b class="asd-result-mine">' + cell + "</b>") : cells;
        });
        return AccountHtml.table(["순위", "이름", "생존", "처치", "어시", "준 피해", "모은 눈", "만든 벽"], rows);
    }
}
class SnReportBuilder {
    static fromEnd(matchId, match, end, myId) {
        const members = [];
        match.teams.forEach((team, teamIndex) => team.members.forEach((member) => members.push({ member, team: teamIndex })));
        const players = members.map((item, index) => {
            const stat = end.stats[index] || [];
            return { name: item.member.nick, team: item.team, rank: end.ranks[item.team] || members.length, secs: stat[3] || 0, kills: stat[0] || 0, assists: stat[5] || 0,
                dealt: stat[1] || 0, collected: stat[2] || 0, walls: stat[4] || 0, left: false, ai: item.member.bot };
        });
        return { matchId, mode: match.mode, myIndex: members.findIndex((item) => item.member.id === myId), players, progress: 1, iLeft: false };
    }
    static fromEngine(matchId, engine, myNum, progress) {
        const ranks = engine.ranks();
        const players = engine.players.map((p) => ({ name: p.nick, team: p.team, rank: ranks[p.team] || engine.teams.length, secs: engine.survival(p), kills: p.kills, assists: p.assists,
            dealt: p.dealt, collected: p.collected, walls: p.walls, left: p.num === myNum, ai: p.bot }));
        return { matchId, mode: engine.mode, myIndex: myNum, players, progress, iLeft: true };
    }
}
class SnAccount {
    constructor() {
        this.profile = new SnAccountProfile();
        this.dialog = new AccountStatsDialog(() => AccountMatchStore.forProfile(this.profile), new SnAccountView());
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
