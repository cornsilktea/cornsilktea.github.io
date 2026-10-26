"use strict";
/* =====================================================================
   30번 팀 배틀 계정별 통계 · 최근 매치 (공용 뼈대 account-match-kit.ts 를 이어 받은 30번 전용 부분)

   저장 위치(Realtime Database, 규칙은 데이터베이스규칙.json 의 users·classStats):
     users/<uid>/stats/teambattle   { g, w, l, bg, bw, rg, rw, m, ids/<matchKey>, c/<캐릭터> }
       g 유효한 판 수 · w 승 · l 패 · bg/bw 블루 판·승 · rg/rw 레드 판·승 · m MVP 수
       c/<캐릭터> = { n 판, w 승, bg, bw, rg, rw, m MVP 횟수, kn 킬·데스·어시스트 평균 분모,
                      k·d·a 평균 킬·데스·어시스트, dmg·hl·bl 평균 피해·회복·막은 피해, st·sl 평균 기절·둔화(초) }
       ids = 최근에 올린 경기 열쇠(같은 판을 두 번 올리지 않게, 최근 AccountKeyLedger.KEEP 개만)
     users/<uid>/recent/teambattle/<0~9>  최근 매치 10칸(값 배열, TeamBattleCodec) — 칸이 10개뿐이라 규칙으로도 10판을 넘지 못한다
     classStats/<학년-반|none>/<uid> { n 이름, g, w, m }  교사 화면 반별 승률 순위용 요약(교사만 읽음)

   집계 규칙(2026-10-26 선생님 결정)
     - 누적 통계: 대회모드이고 AI 가 한 명도 없던 경기만. 경기 절반 뒤에 나가면 패배, 절반 전에 나가면 기록 없음.
     - 최근 매치: 대회모드 경기면 AI 가 있어도 기록(절반 전에 나간 판은 없음).
     - MVP: 환산점수 최고점, 동점이면 모두 인정, 나간 사람과 처치·어시스트가 하나도 없는 사람은 후보에서 뺀다.
     - 승률·MVP율 같은 파생값은 저장하지 않고 화면에서 계산한다(TeamBattleRates).

   계산 클래스(TeamBattlePlan·AccountMvpJudge·TeamBattleCodec·TeamBattleRing·AccountStatsMath·AccountStatsTable·ClassStatsSummary)는
   화면도 통신도 모르는 순수 클래스라 30번 &test 가 직접 검사한다. 읽고 쓰는 것은 공용 AccountMatchStore 를 이어 받은
   AccountStatsStore 한 곳이며, TeamBattleProfile 이 30번만의 모양(게임 키·집계 대상·합산·값 배열)을 정한다.
   AccountDatabase 는 personal-records.js(로그인하면 account-login.js 가 불러옴)에 있다.
   ===================================================================== */
class TeamBattleRates extends AccountRates {
    static mvpRate(node) {
        return node ? AccountRates.ratio(node.m, node.g) : null;
    }
}
class AccountMvpJudge {
    constructor(scoreOf) {
        this.scoreOf = scoreOf;
    }
    winners(players) {
        let best = [];
        let bestScore = -Infinity;
        players.forEach((line, index) => {
            if (line.left || line.kills + line.assists <= 0)
                return;
            const score = this.scoreOf(line);
            if (score > bestScore) {
                bestScore = score;
                best = [index];
            }
            else if (score === bestScore) {
                best.push(index);
            }
        });
        return best;
    }
    isMvp(players, index) {
        return this.winners(players).indexOf(index) >= 0;
    }
}
class TeamBattlePlan {
    constructor(report, judge) {
        const me = report.players[report.myIndex];
        const leftEarly = AccountForfeit.leftEarly(report.iLeft, report.progress);
        this.withAi = report.players.some((line) => line.ai);
        this.recordsRecent = report.mode === TeamBattlePlan.CUP_MODE && !!me && !leftEarly && (report.winnerTeam === 0 || report.winnerTeam === 1 || report.iLeft);
        this.countsStats = this.recordsRecent && !this.withAi;
        this.win = !!me && !report.iLeft && me.team === report.winnerTeam;
        this.mvp = !!me && !report.iLeft && judge.isMvp(report.players, report.myIndex);
    }
}
TeamBattlePlan.CUP_MODE = "cup";
TeamBattlePlan.FORFEIT_AT = AccountForfeit.AT;
class TeamBattleCodec {
    static encode(report, key, win) {
        return Object.assign(AccountRecentHeadCodec.encode(TeamBattleCodec.VERSION, key, win), {
            ai: report.players.some((line) => line.ai) ? 1 : 0,
            me: report.myIndex,
            s: [AccountNumbers.count(report.score[0]), AccountNumbers.count(report.score[1])],
            p: report.players.map((line) => TeamBattleCodec.encodeLine(line))
        });
    }
    static encodeLine(line) {
        return [
            String(line.name || "").slice(0, TeamBattleCodec.NAME_MAX), line.team === 1 ? 1 : 0, line.char,
            AccountNumbers.count(line.kills), AccountNumbers.count(line.deaths), AccountNumbers.count(line.assists),
            Math.max(0, AccountNumbers.whole(line.dmg)), Math.max(0, AccountNumbers.whole(line.heal)), Math.max(0, AccountNumbers.whole(line.blocked)),
            Math.max(0, AccountNumbers.oneDecimal(line.stun)), Math.max(0, AccountNumbers.oneDecimal(line.slow)),
            line.left ? 1 : 0, line.ai ? 1 : 0, Math.max(0, AccountNumbers.twoDecimals(line.slowWeight))
        ];
    }
    static decode(raw) {
        const head = AccountRecentHeadCodec.decode(raw, TeamBattleCodec.VERSION);
        if (!head)
            return null;
        const stored = raw;
        const lines = AccountShape.list(stored.p).map((item) => TeamBattleCodec.decodeLine(item));
        if (!lines.length || lines.some((line) => !line))
            return null;
        const players = lines;
        const myIndex = AccountNumbers.count(stored.me);
        if (myIndex >= players.length)
            return null;
        const score = AccountShape.list(stored.s).map((value) => AccountNumbers.count(value));
        return {
            id: head.id,
            at: head.at,
            win: head.win,
            withAi: stored.ai === 1,
            myIndex,
            score: [score[0] || 0, score[1] || 0],
            players
        };
    }
    static decodeLine(raw) {
        const item = AccountShape.list(raw);
        if (item.length < TeamBattleCodec.FIELDS - 1 || typeof item[2] !== "string")
            return null;
        const number = (index) => Number(item[index]) || 0;
        return {
            name: String(item[0] == null ? "" : item[0]), team: number(1) === 1 ? 1 : 0, char: String(item[2]),
            kills: number(3), deaths: number(4), assists: number(5), dmg: number(6), heal: number(7), blocked: number(8),
            stun: number(9), slow: number(10), left: number(11) === 1, ai: number(12) === 1, slowWeight: number(13)
        };
    }
}
TeamBattleCodec.VERSION = 1;
TeamBattleCodec.NAME_MAX = 20;
TeamBattleCodec.FIELDS = 14;
class TeamBattleRing extends RecentMatchRing {
    static entries(stored) {
        return RecentMatchRing.decodeAll(stored, TeamBattleCodec.decode);
    }
}
class AccountStatsMath {
    static empty() {
        return { g: 0, w: 0, l: 0, bg: 0, bw: 0, rg: 0, rw: 0, m: 0 };
    }
    static emptyChar() {
        return { n: 0, w: 0, bg: 0, bw: 0, rg: 0, rw: 0, m: 0, kn: 0, k: 0, d: 0, a: 0, dmg: 0, hl: 0, bl: 0, st: 0, sl: 0 };
    }
    static normalize(raw) {
        const node = AccountStatsMath.empty();
        if (!raw || typeof raw !== "object")
            return node;
        const source = raw;
        ["g", "w", "l", "bg", "bw", "rg", "rw", "m"].forEach((key) => { node[key] = AccountNumbers.count(source[key]); });
        const ids = AccountShape.slots(source.ids);
        node.ids = {};
        Object.keys(ids).forEach((key) => { node.ids[key] = Number(ids[key]) || 0; });
        const chars = AccountShape.slots(source.c);
        node.c = {};
        Object.keys(chars).forEach((key) => { node.c[key] = AccountStatsMath.normalizeChar(chars[key]); });
        return node;
    }
    static normalizeChar(raw) {
        const node = AccountStatsMath.emptyChar();
        const source = (raw && typeof raw === "object" ? raw : {});
        Object.keys(node).forEach((key) => { node[key] = Number(source[key]) || 0; });
        return node;
    }
    static apply(raw, line, outcome) {
        const before = AccountStatsMath.normalize(raw);
        const ids = before.ids || {};
        if (ids[outcome.key] != null)
            return null;
        const blue = outcome.side === 0;
        const node = {
            g: before.g + 1,
            w: before.w + (outcome.win ? 1 : 0),
            l: before.l + (outcome.win ? 0 : 1),
            bg: before.bg + (blue ? 1 : 0),
            bw: before.bw + (blue && outcome.win ? 1 : 0),
            rg: before.rg + (blue ? 0 : 1),
            rw: before.rw + (!blue && outcome.win ? 1 : 0),
            m: before.m + (outcome.mvp ? 1 : 0),
            ids: Object.assign({}, ids),
            c: Object.assign({}, before.c || {})
        };
        node.ids[outcome.key] = outcome.at;
        const evictedKeys = AccountKeyLedger.overflowKeys(node.ids);
        evictedKeys.forEach((key) => { delete node.ids[key]; });
        node.c[line.char] = AccountStatsMath.applyChar(node.c[line.char] || AccountStatsMath.emptyChar(), line, outcome);
        return { node, charId: line.char, addedKey: outcome.key, evictedKeys };
    }
    static applyChar(before, line, outcome) {
        const blue = outcome.side === 0;
        const n = before.n;
        const kn = before.kn;
        return {
            n: n + 1,
            w: before.w + (outcome.win ? 1 : 0),
            bg: before.bg + (blue ? 1 : 0),
            bw: before.bw + (blue && outcome.win ? 1 : 0),
            rg: before.rg + (blue ? 0 : 1),
            rw: before.rw + (!blue && outcome.win ? 1 : 0),
            m: before.m + (outcome.mvp ? 1 : 0),
            kn: kn + 1,
            k: AccountNumbers.runningAverage(before.k, kn, AccountNumbers.count(line.kills)),
            d: AccountNumbers.runningAverage(before.d, kn, AccountNumbers.count(line.deaths)),
            a: AccountNumbers.runningAverage(before.a, kn, AccountNumbers.count(line.assists)),
            dmg: AccountNumbers.runningAverage(before.dmg, n, Math.max(0, Number(line.dmg) || 0)),
            hl: AccountNumbers.runningAverage(before.hl, n, Math.max(0, Number(line.heal) || 0)),
            bl: AccountNumbers.runningAverage(before.bl, n, Math.max(0, Number(line.blocked) || 0)),
            st: AccountNumbers.runningAverage(before.st, n, Math.max(0, Number(line.stun) || 0)),
            sl: AccountNumbers.runningAverage(before.sl, n, Math.max(0, Number(line.slow) || 0))
        };
    }
}
AccountStatsMath.IDS_KEEP = AccountKeyLedger.KEEP;
class AccountStatsTable {
    static legacyRows(node) {
        const rows = {};
        const chars = (node && node.c) || {};
        Object.keys(chars).forEach((id) => {
            const c = chars[id];
            rows[id] = {
                picks: c.n, wins: c.w, draws: 0, mvpCount: c.m,
                kills: c.k, deaths: c.d, assist: c.a, kdPicks: c.kn, asPicks: c.kn, ccPicks: c.n,
                dmg: c.dmg, heal: c.hl, block: c.bl, stun: c.st, slow: c.sl
            };
        });
        return rows;
    }
}
class ClassStatsSummary {
    static classKey(cls) {
        return typeof cls === "string" && ClassStatsSummary.CLASS_PATTERN.test(cls) ? cls : ClassStatsSummary.NONE;
    }
    static build(name, node) {
        return { n: String(name || "학생").slice(0, ClassStatsSummary.NAME_MAX) || "학생", g: node.g, w: node.w, m: node.m };
    }
}
ClassStatsSummary.NONE = "none";
ClassStatsSummary.CLASS_PATTERN = /^[12]-[1-5]$/;
ClassStatsSummary.NAME_MAX = 40;
class TeamBattleProfile extends AccountGameProfile {
    constructor() {
        super(...arguments);
        this.gameKey = "teambattle";
    }
    matchIdOf(report) {
        return report.matchId;
    }
    planOf(report, judge) {
        return new TeamBattlePlan(report, judge);
    }
    encodeRecent(report, key, win) {
        return TeamBattleCodec.encode(report, key, win);
    }
    decodeRecent(raw) {
        return TeamBattleCodec.decode(raw);
    }
    normalizeStats(raw) {
        return AccountStatsMath.normalize(raw);
    }
    applyStats(raw, report, plan, key, at) {
        const me = report.players[report.myIndex];
        const change = AccountStatsMath.apply(raw, me, { key, win: plan.win, side: me.team, mvp: plan.mvp, at });
        return change ? { node: change.node, patch: this.statsPatch(change) } : null;
    }
    extraReadPath() {
        return TeamBattleProfile.CLASS_PATH;
    }
    /* 선생님 계정은 반별 순위에 넣지 않는다. 반이 정해진 학생은 미분류(none) 칸의 옛 요약을 함께 지운다 */
    extraPatch(user, cls, node) {
        const values = {};
        const admins = typeof AccountPolicy === "function" ? AccountPolicy.ADMIN_UIDS : [];
        if (admins.indexOf(user.uid) >= 0)
            return values;
        const classKey = ClassStatsSummary.classKey(cls);
        const root = TeamBattleProfile.CLASS_STATS_ROOT + "/";
        values[root + classKey + "/" + user.uid] = ClassStatsSummary.build(user.name, node);
        if (classKey !== ClassStatsSummary.NONE)
            values[root + ClassStatsSummary.NONE + "/" + user.uid] = null;
        return values;
    }
    statsPatch(change) {
        const values = {};
        const node = change.node;
        ["g", "w", "l", "bg", "bw", "rg", "rw", "m"].forEach((key) => { values[key] = node[key]; });
        values["c/" + change.charId] = node.c[change.charId];
        values["ids/" + change.addedKey] = node.ids[change.addedKey];
        change.evictedKeys.forEach((key) => { values["ids/" + key] = null; });
        return values;
    }
}
TeamBattleProfile.CLASS_PATH = "profile/cls";
TeamBattleProfile.CLASS_STATS_ROOT = "classStats";
class AccountStatsStore extends AccountMatchStore {
    constructor(database, user) {
        super(database, user, new TeamBattleProfile());
    }
    /* 로그인 전이거나 personal-records.js 가 아직 안 불렸으면 null — 화면은 안내 문구를 보인다 */
    static open() {
        const user = window.PORTAL_USER;
        if (!user || typeof AccountDatabase !== "function")
            return null;
        return new AccountStatsStore(new AccountDatabase(user), user);
    }
}
