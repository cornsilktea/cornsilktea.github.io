"use strict";
/* =====================================================================
   계정별 통계 · 최근 10매치 공용 뼈대 (게임을 모르는 부분, 로그인한 학생만)

   게임마다 복사하지 않고 이 파일을 함께 쓴다. 게임별 모양은 AccountGameProfile 을 이어 받은
   자식 클래스(30번 TeamBattleProfile 등)가 정하고, 읽고 쓰는 일은 AccountMatchStore 한 곳이 한다.

   저장 위치(Realtime Database, 규칙은 데이터베이스규칙.json 의 users/$uid):
     users/<uid>/stats/<게임키>          누적 통계(게임별 모양, ids/<경기열쇠> 로 중복 방지)
     users/<uid>/recent/<게임키>/<0~9>   최근 매치 10칸. 칸이 10개뿐이라 규칙으로도 10판을 넘지 못한다.
   최근 매치 한 판은 공통 머리 {v, id, at(서버 시각), r(1승/0패)} + 게임별 몸통이다.

   요청 빈도: 경기 끝 쓰기 1번(읽기-수정-쓰기 + 여러 경로 PATCH 1번), 창을 열 때 읽기 1번. 그 외 요청은 만들지 않는다.
   이 파일의 계산 클래스는 화면도 통신도 몰라서 tools/account-stats-unit.js 가 node 에서 직접 검사한다.
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
}
class AccountMatchKey {
    static of(matchId) {
        const key = String(matchId == null ? "" : matchId).replace(/[.#$\[\]\/\s]/g, "_").slice(0, AccountMatchKey.MAX_LENGTH);
        return key || "match";
    }
}
AccountMatchKey.MAX_LENGTH = 60;
class AccountKeyLedger {
    static overflowKeys(ids) {
        const keys = Object.keys(ids).sort((a, b) => ids[a] - ids[b]);
        return keys.slice(0, Math.max(0, keys.length - AccountKeyLedger.KEEP));
    }
}
AccountKeyLedger.KEEP = 20;
class AccountForfeit {
    static leftEarly(iLeft, progress) {
        return iLeft && progress < AccountForfeit.AT;
    }
}
AccountForfeit.AT = 0.5;
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
class AccountRecentHeadCodec {
    static encode(version, key, win) {
        return { v: version, id: key, at: { ".sv": "timestamp" }, r: win ? 1 : 0 };
    }
    static decode(raw, version) {
        const stored = raw;
        if (!stored || typeof stored !== "object" || stored.v !== version)
            return null;
        return { id: String(stored.id || ""), at: typeof stored.at === "number" ? stored.at : 0, win: stored.r === 1 };
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
    static decodeAll(stored, decode) {
        const slots = AccountShape.slots(stored);
        return Object.keys(slots)
            .filter((key) => /^[0-9]$/.test(key))
            .map((key) => decode(slots[key]))
            .filter((entry) => !!entry)
            .sort((a, b) => b.at - a.at);
    }
}
RecentMatchRing.SLOTS = 10;
class AccountLoginNotice {
}
AccountLoginNotice.STATS_LOGIN_NEEDED = "로그인하면 내 통계를 볼 수 있어요.";
AccountLoginNotice.RECENT_LOGIN_NEEDED = "로그인하면 최근 매치를 볼 수 있어요.";
AccountLoginNotice.NOT_READY = "로그인 정보를 준비하는 중이에요. 잠시 뒤 다시 열어 주세요.";
AccountLoginNotice.STATS_FAILED = "내 통계를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.";
AccountLoginNotice.RECENT_FAILED = "최근 매치를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.";
AccountLoginNotice.LOADING = "불러오는 중…";
class RecentBlockList {
    static whenText(at) {
        if (!at)
            return "";
        const date = new Date(at);
        const two = (n) => (n < 10 ? "0" : "") + n;
        return (date.getMonth() + 1) + "월 " + date.getDate() + "일 " + two(date.getHours()) + ":" + two(date.getMinutes());
    }
    static html(entries, bodyOf) {
        return entries.map((entry, index) => '<button type="button" class="rmItem ' + (entry.win ? "win" : "lose") + '" data-recent="' + index + '">' +
            '<span class="rmHead"><b>' + (entry.win ? "승리" : "패배") + "</b><small>" + RecentBlockList.whenText(entry.at) + "</small></span>" +
            bodyOf(entry, index) + "</button>").join("");
    }
}
class AccountGameProfile {
    get statsPath() {
        return "stats/" + this.gameKey;
    }
    get recentPath() {
        return "recent/" + this.gameKey;
    }
    extraReadPath() {
        return null;
    }
    extraPatch(user, extraRaw, node) {
        return {};
    }
}
class AccountMatchStore {
    constructor(database, user, profile) {
        this.database = database;
        this.user = user;
        this.profile = profile;
    }
    loadStats() {
        return this.database.read(this.profile.statsPath).then((raw) => (raw ? this.profile.normalizeStats(raw) : null));
    }
    loadRecent() {
        return this.database.read(this.profile.recentPath).then((raw) => RecentMatchRing.decodeAll(raw, (item) => this.profile.decodeRecent(item)));
    }
    async record(report, context) {
        const profile = this.profile;
        const plan = profile.planOf(report, context);
        if (!plan.recordsRecent)
            return "skip";
        const key = AccountMatchKey.of(profile.matchIdOf(report));
        const extraPath = profile.extraReadPath();
        const [statsRaw, recentRaw, extraRaw] = await Promise.all([
            plan.countsStats ? this.database.read(profile.statsPath) : Promise.resolve(null),
            this.database.read(profile.recentPath),
            plan.countsStats && extraPath ? this.database.read(extraPath) : Promise.resolve(null)
        ]);
        const slot = RecentMatchRing.chooseSlot(recentRaw, key);
        if (slot < 0)
            return "duplicate";
        const userRoot = "users/" + this.user.uid + "/";
        const values = {};
        values[userRoot + profile.recentPath + "/" + slot] = profile.encodeRecent(report, key, plan.win);
        if (plan.countsStats) {
            const change = profile.applyStats(statsRaw, report, plan, key, Date.now());
            if (!change)
                return "duplicate";
            const statsRoot = userRoot + profile.statsPath + "/";
            Object.keys(change.patch).forEach((path) => { values[statsRoot + path] = change.patch[path]; });
            Object.assign(values, profile.extraPatch(this.user, extraRaw, change.node));
        }
        await this.database.updateRoot(values);
        return plan.countsStats ? "stats" : "recent";
    }
}
