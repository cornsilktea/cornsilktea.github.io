"use strict";
/* =====================================================================
   30번 팀 배틀 계정별 통계 · 최근 매치 (공용 모듈, 로그인한 학생만)

   저장 위치(Realtime Database, 규칙은 데이터베이스규칙.json 의 users·classStats):
     users/<uid>/stats/teambattle   { g, w, l, bg, bw, rg, rw, m, ids/<matchKey>, c/<캐릭터> }
       g 유효한 판 수 · w 승 · l 패 · bg/bw 블루 판·승 · rg/rw 레드 판·승 · m MVP 수
       c/<캐릭터> = { n 판, w 승, bg, bw, rg, rw, m MVP 횟수, kn 킬·데스·어시스트 평균 분모,
                      k·d·a 평균 킬·데스·어시스트, dmg·hl·bl 평균 피해·회복·막은 피해, st·sl 평균 기절·둔화(초) }
       ids = 최근에 올린 경기 열쇠(같은 판을 두 번 올리지 않게, 최근 IDS_KEEP 개만)
     users/<uid>/recent/<0~9>       최근 매치 10칸(값 배열, RecentMatchCodec) — 칸이 10개뿐이라 규칙으로도 10판을 넘지 못한다
     classStats/<학년-반|none>/<uid> { n 이름, g, w, m }  교사 화면 반별 승률 순위용 요약(교사만 읽음)

   집계 규칙(2026-10-26 선생님 결정)
     - 누적 통계: 대회모드이고 AI 가 한 명도 없던 경기만. 경기 절반 뒤에 나가면 패배, 절반 전에 나가면 기록 없음.
     - 최근 매치: 대회모드 경기면 AI 가 있어도 기록(절반 전에 나간 판은 없음).
     - MVP: 환산점수 최고점, 동점이면 모두 인정, 나간 사람과 처치·어시스트가 하나도 없는 사람은 후보에서 뺀다.
     - 승률·MVP율 같은 파생값은 저장하지 않고 화면에서 계산한다(AccountRates).

   계산 클래스(AccountMatchPlan·AccountMvpJudge·RecentMatchCodec·RecentMatchRing·AccountStatsMath·AccountStatsTable·ClassStatsSummary)는
   화면도 통신도 모르는 순수 클래스라 30번 &test 가 직접 검사한다. 읽고 쓰는 것은 AccountStatsStore 한 곳이며,
   경기 하나당 쓰기 1번(읽기-수정-쓰기 + 여러 경로 PATCH 1번), 창을 열 때 읽기 1번만 한다.
   AccountDatabase 는 personal-records.js(로그인하면 account-login.js 가 불러옴)에 있다.
   ===================================================================== */
class AccountNumbers {
    static oneDecimal(value) {
        return Math.round((Number(value) || 0) * 10) / 10;
    }
    static twoDecimals(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
    }
    static whole(value) {
        return Math.round(Number(value) || 0);
    }
    static count(value) {
        const number = Number(value);
        return isFinite(number) && number > 0 ? Math.floor(number) : 0;
    }
    static runningAverage(average, samples, value) {
        return AccountNumbers.oneDecimal((average * samples + value) / (samples + 1));
    }
}
class AccountRates {
    static ratio(part, whole) {
        return whole > 0 ? part / whole : null;
    }
    static winRate(node) {
        return node ? AccountRates.ratio(node.w, node.g) : null;
    }
    static mvpRate(node) {
        return node ? AccountRates.ratio(node.m, node.g) : null;
    }
}
class AccountMatchKey {
    static of(matchId) {
        const key = String(matchId == null ? "" : matchId).replace(/[.#$\[\]\/\s]/g, "_").slice(0, AccountMatchKey.MAX_LENGTH);
        return key || "match";
    }
}
AccountMatchKey.MAX_LENGTH = 60;
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
class AccountMatchPlan {
    constructor(report, judge) {
        const me = report.players[report.myIndex];
        const leftEarly = report.iLeft && report.progress < AccountMatchPlan.FORFEIT_AT;
        this.withAi = report.players.some((line) => line.ai);
        this.recordsRecent = report.mode === AccountMatchPlan.CUP_MODE && !!me && !leftEarly && (report.winnerTeam === 0 || report.winnerTeam === 1 || report.iLeft);
        this.countsStats = this.recordsRecent && !this.withAi;
        this.win = !!me && !report.iLeft && me.team === report.winnerTeam;
        this.mvp = !!me && !report.iLeft && judge.isMvp(report.players, report.myIndex);
    }
}
AccountMatchPlan.CUP_MODE = "cup";
AccountMatchPlan.FORFEIT_AT = 0.5;
class RecentMatchCodec {
    static encode(report, key, win) {
        return {
            v: RecentMatchCodec.VERSION,
            id: key,
            at: { ".sv": "timestamp" },
            r: win ? 1 : 0,
            ai: report.players.some((line) => line.ai) ? 1 : 0,
            me: report.myIndex,
            s: [AccountNumbers.count(report.score[0]), AccountNumbers.count(report.score[1])],
            p: report.players.map((line) => RecentMatchCodec.encodeLine(line))
        };
    }
    static encodeLine(line) {
        return [
            String(line.name || "").slice(0, RecentMatchCodec.NAME_MAX), line.team === 1 ? 1 : 0, line.char,
            AccountNumbers.count(line.kills), AccountNumbers.count(line.deaths), AccountNumbers.count(line.assists),
            Math.max(0, AccountNumbers.whole(line.dmg)), Math.max(0, AccountNumbers.whole(line.heal)), Math.max(0, AccountNumbers.whole(line.blocked)),
            Math.max(0, AccountNumbers.oneDecimal(line.stun)), Math.max(0, AccountNumbers.oneDecimal(line.slow)),
            line.left ? 1 : 0, line.ai ? 1 : 0, Math.max(0, AccountNumbers.twoDecimals(line.slowWeight))
        ];
    }
    static decode(raw) {
        const stored = raw;
        if (!stored || typeof stored !== "object" || stored.v !== RecentMatchCodec.VERSION)
            return null;
        const lines = AccountShape.list(stored.p).map((item) => RecentMatchCodec.decodeLine(item));
        if (!lines.length || lines.some((line) => !line))
            return null;
        const players = lines;
        const myIndex = AccountNumbers.count(stored.me);
        if (myIndex >= players.length)
            return null;
        const score = AccountShape.list(stored.s).map((value) => AccountNumbers.count(value));
        return {
            id: String(stored.id || ""),
            at: typeof stored.at === "number" ? stored.at : 0,
            win: stored.r === 1,
            withAi: stored.ai === 1,
            myIndex,
            score: [score[0] || 0, score[1] || 0],
            players
        };
    }
    static decodeLine(raw) {
        const item = AccountShape.list(raw);
        if (item.length < RecentMatchCodec.FIELDS - 1 || typeof item[2] !== "string")
            return null;
        const number = (index) => Number(item[index]) || 0;
        return {
            name: String(item[0] == null ? "" : item[0]), team: number(1) === 1 ? 1 : 0, char: String(item[2]),
            kills: number(3), deaths: number(4), assists: number(5), dmg: number(6), heal: number(7), blocked: number(8),
            stun: number(9), slow: number(10), left: number(11) === 1, ai: number(12) === 1, slowWeight: number(13)
        };
    }
}
RecentMatchCodec.VERSION = 1;
RecentMatchCodec.NAME_MAX = 20;
RecentMatchCodec.FIELDS = 14;
class AccountShape {
    static list(value) {
        if (Array.isArray(value))
            return value;
        if (!value || typeof value !== "object")
            return [];
        const record = value;
        return Object.keys(record).filter((key) => /^[0-9]+$/.test(key)).sort((a, b) => Number(a) - Number(b)).map((key) => record[key]);
    }
    static slots(value) {
        if (!value || typeof value !== "object")
            return {};
        const record = value;
        const slots = {};
        Object.keys(record).forEach((key) => { if (record[key] != null)
            slots[key] = record[key]; });
        return slots;
    }
}
class RecentMatchRing {
    static chooseSlot(stored, key) {
        const slots = AccountShape.slots(stored);
        let oldestSlot = -1;
        let oldestAt = Infinity;
        for (let slot = 0; slot < RecentMatchRing.SLOTS; slot++) {
            const entry = slots[String(slot)];
            if (entry && entry.id === key)
                return -1;
        }
        for (let slot = 0; slot < RecentMatchRing.SLOTS; slot++) {
            const entry = slots[String(slot)];
            if (!entry)
                return slot;
            const at = typeof entry.at === "number" ? entry.at : 0;
            if (at < oldestAt) {
                oldestAt = at;
                oldestSlot = slot;
            }
        }
        return oldestSlot;
    }
    static entries(stored) {
        const slots = AccountShape.slots(stored);
        return Object.keys(slots)
            .filter((key) => /^[0-9]$/.test(key))
            .map((key) => RecentMatchCodec.decode(slots[key]))
            .filter((entry) => !!entry)
            .sort((a, b) => b.at - a.at);
    }
}
RecentMatchRing.SLOTS = 10;
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
        const evictedKeys = AccountStatsMath.overflowKeys(node.ids);
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
    static overflowKeys(ids) {
        const keys = Object.keys(ids).sort((a, b) => ids[a] - ids[b]);
        return keys.slice(0, Math.max(0, keys.length - AccountStatsMath.IDS_KEEP));
    }
}
AccountStatsMath.IDS_KEEP = 20;
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
class AccountStatsStore {
    constructor(database, user) {
        this.database = database;
        this.user = user;
    }
    /* 로그인 전이거나 personal-records.js 가 아직 안 불렸으면 null — 화면은 안내 문구를 보인다 */
    static open() {
        const user = window.PORTAL_USER;
        if (!user || typeof AccountDatabase !== "function")
            return null;
        return new AccountStatsStore(new AccountDatabase(user), user);
    }
    loadStats() {
        return this.database.read(AccountStatsStore.STATS_PATH).then((raw) => (raw ? AccountStatsMath.normalize(raw) : null));
    }
    loadRecent() {
        return this.database.read(AccountStatsStore.RECENT_PATH).then((raw) => RecentMatchRing.entries(raw));
    }
    async record(report, judge) {
        const plan = new AccountMatchPlan(report, judge);
        if (!plan.recordsRecent)
            return "skip";
        const key = AccountMatchKey.of(report.matchId);
        const [statsRaw, recentRaw, cls] = await Promise.all([
            plan.countsStats ? this.database.read(AccountStatsStore.STATS_PATH) : Promise.resolve(null),
            this.database.read(AccountStatsStore.RECENT_PATH),
            plan.countsStats ? this.database.read(AccountStatsStore.CLASS_PATH) : Promise.resolve(null)
        ]);
        const slot = RecentMatchRing.chooseSlot(recentRaw, key);
        if (slot < 0)
            return "duplicate";
        const userRoot = "users/" + this.user.uid + "/";
        const values = {};
        values[userRoot + AccountStatsStore.RECENT_PATH + "/" + slot] = RecentMatchCodec.encode(report, key, plan.win);
        if (plan.countsStats) {
            const me = report.players[report.myIndex];
            const change = AccountStatsMath.apply(statsRaw, me, { key, win: plan.win, side: me.team, mvp: plan.mvp, at: Date.now() });
            if (!change)
                return "duplicate";
            Object.assign(values, this.statsPatch(userRoot + AccountStatsStore.STATS_PATH + "/", change));
            Object.assign(values, this.classPatch(cls, change.node));
        }
        await this.database.updateRoot(values);
        return plan.countsStats ? "stats" : "recent";
    }
    statsPatch(prefix, change) {
        const values = {};
        const node = change.node;
        ["g", "w", "l", "bg", "bw", "rg", "rw", "m"].forEach((key) => { values[prefix + key] = node[key]; });
        values[prefix + "c/" + change.charId] = node.c[change.charId];
        values[prefix + "ids/" + change.addedKey] = node.ids[change.addedKey];
        change.evictedKeys.forEach((key) => { values[prefix + "ids/" + key] = null; });
        return values;
    }
    /* 선생님 계정은 반별 순위에 넣지 않는다. 반이 정해진 학생은 미분류(none) 칸의 옛 요약을 함께 지운다 */
    classPatch(cls, node) {
        const values = {};
        const admins = typeof AccountPolicy === "function" ? AccountPolicy.ADMIN_UIDS : [];
        if (admins.indexOf(this.user.uid) >= 0)
            return values;
        const classKey = ClassStatsSummary.classKey(cls);
        const root = AccountStatsStore.CLASS_STATS_ROOT + "/";
        values[root + classKey + "/" + this.user.uid] = ClassStatsSummary.build(this.user.name, node);
        if (classKey !== ClassStatsSummary.NONE)
            values[root + ClassStatsSummary.NONE + "/" + this.user.uid] = null;
        return values;
    }
}
AccountStatsStore.STATS_PATH = "stats/teambattle";
AccountStatsStore.RECENT_PATH = "recent";
AccountStatsStore.CLASS_PATH = "profile/cls";
AccountStatsStore.CLASS_STATS_ROOT = "classStats";
