"use strict";
/* =====================================================================
   31번 좀비 아웃브레이크 계정 통계 · 최근 20매치 (공용 뼈대 ts/common/account-match-kit.ts 의 자식, 게임 키 zombieoutbreak)

   집계 규칙(2026-10-26, 선생님 요청 · 정의는 코드 기준으로 정함)
     - 대상: 온라인 방(방 만들기·코드 입장·랜덤 매칭). 관전자는 기록하지 않는다.
     - 개인 승패(2026-11-04 선생님 결정): 인간이 이기면 끝까지 생존한 시민이 승, 좀비가 이기면 숙주만 승. 감염된 시민은 항상 패.
     - 화면의 승률은 전체 승률 없이 두 가지만 보인다.
       시민 승률 = cw / cg (시민으로 시작한 판 중 끝까지 생존해 이긴 판), 좀비 승률 = pw / pg (숙주로 시작한 판 중 이긴 판).
       cg·cw·pg·pw 는 2026-11-04 부터 쌓는다. 옛 칸 hw·zg·zw 는 감염된 판이 섞여 나눌 수 없어 화면에 쓰지 않고, DB 규칙에 필요해 계속 적어 둔다.
     - 인간 평균 생존 시간 = 인간으로 시작한 판의 생존 초 합계 ÷ 그런 판 수(감염되면 감염된 때까지, 끝까지면 라운드 길이).
     - 완료 미션 수: 내가 끝낸 미션(한 판 최대 3). 감염 수와 같은 기준(누적은 AI 가 1명 이하인 판만).
     - 감염 수: 내가 감염시킨 사람 수(room.players[].infectedBy). 누적 통계는 AI 가 1명 이하인 판만(2026-11-03 선생님 결정: 사람 4명+AI 1명 판도 승패를 센다), 최근 매치는 AI 가 몇 명 섞여도 기록.
     - 경기 절반 뒤에 나가면 패배, 절반 전에 나가면 기록 없음. 승패가 안 가려진 판은 없다(인간·좀비 중 한쪽이 항상 이김).

   저장:
     users/<uid>/stats/zombieoutbreak  { g, w, l, cg, cw, pg, pw, hg, hw, zg, zw, og 숙주 횟수, sv 끝까지 생존 횟수, ik 감염 합, ms 완료 미션 합, mi 한 판 최다 감염, hs 인간 생존 초 합, ls 최장 생존 초, ids }
     users/<uid>/recent/zombieoutbreak/<0~19>  { v, id, at, r, ai, me, w 0인간/1좀비, p [[닉네임, 0숙주/1감염/2생존, 생존 초, 감염 수, 나감 0/1, AI 0/1, 완료 미션 수]] }
   ===================================================================== */
class ZombieRoles {
    static countsInTotals(rows) {
        return rows.filter((row) => row.ai).length <= ZombieRoles.AI_COUNTED_MAX;
    }
    static fromResult(result) {
        return result === "origin" ? ZombieRoles.ORIGIN : result === "infected" ? ZombieRoles.INFECTED : ZombieRoles.SURVIVED;
    }
    static wonBy(role, winner) {
        return winner === 0 ? role === ZombieRoles.SURVIVED : winner === 1 && role === ZombieRoles.ORIGIN;
    }
}
ZombieRoles.ORIGIN = 0;
ZombieRoles.INFECTED = 1;
ZombieRoles.SURVIVED = 2;
ZombieRoles.LABELS = ["숙주 좀비", "감염", "생존"];
ZombieRoles.SECONDS_MAX = 180;
ZombieRoles.MISSIONS_MAX = 3;
ZombieRoles.AI_COUNTED_MAX = 1;
/* 이 시각(2026-11-03 efdc201 반영) 전에 기록된 AI 1명 판은 누적에 승패가 더해지지 않았다. 열쇠(ids)만 적혀 있어 정상화가 이 시각으로 가려낸다 */
ZombieRoles.AI_RULE_FROM_MS = 1793684492000;
ZombieRoles.NUMBER_KEYS = ["g", "w", "l", "cg", "cw", "pg", "pw", "hg", "hw", "zg", "zw", "og", "sv", "ik", "ms", "mi", "hs", "ls"];
class ZombiePlan {
    constructor(report) {
        const me = report.rows[report.myIndex];
        this.withAi = report.rows.some((row) => row.ai);
        this.recordsRecent = !!me && !AccountForfeit.leftEarly(report.iLeft, report.progress) && (report.winner === 0 || report.winner === 1 || report.iLeft);
        this.countsMain = this.recordsRecent && ZombieRoles.countsInTotals(report.rows);
        this.countsRandom = this.recordsRecent && !!report.random;
        this.countsStats = this.countsMain || this.countsRandom;
        this.win = !!me && !report.iLeft && ZombieRoles.wonBy(me.role, report.winner);
    }
}
class ZombieCodec {
    static encode(report, key, win) {
        return Object.assign(AccountRecentHeadCodec.encode(ZombieCodec.VERSION, key, win), {
            ai: report.rows.some((row) => row.ai) ? 1 : 0,
            me: report.myIndex,
            w: report.winner === 1 ? 1 : 0,
            p: report.rows.map((row) => [
                String(row.name || "").slice(0, ZombieCodec.NAME_MAX), Math.min(2, AccountNumbers.count(row.role)),
                Math.min(ZombieRoles.SECONDS_MAX, AccountNumbers.count(row.secs)), Math.min(9, AccountNumbers.count(row.infects)), row.left ? 1 : 0, row.ai ? 1 : 0,
                Math.min(ZombieRoles.MISSIONS_MAX, AccountNumbers.count(row.missions))
            ])
        });
    }
    static decode(raw) {
        const head = AccountRecentHeadCodec.decode(raw, ZombieCodec.VERSION);
        if (!head)
            return null;
        const stored = raw;
        const rows = [];
        for (const item of AccountShape.list(stored.p)) {
            const cells = AccountShape.list(item);
            if (cells.length < 6 || typeof cells[0] !== "string")
                return null;
            rows.push({ name: String(cells[0]), role: Math.min(2, AccountNumbers.count(cells[1])), secs: AccountNumbers.count(cells[2]), infects: AccountNumbers.count(cells[3]), missions: Math.min(ZombieRoles.MISSIONS_MAX, AccountNumbers.count(cells[6])), left: Number(cells[4]) === 1, ai: Number(cells[5]) === 1 });
        }
        const myIndex = AccountNumbers.count(stored.me);
        if (!rows.length || myIndex >= rows.length)
            return null;
        return { id: head.id, at: head.at, win: head.win && rows[myIndex].role !== ZombieRoles.INFECTED, withAi: stored.ai === 1, myIndex, winner: stored.w === 1 ? 1 : 0, rows };
    }
}
ZombieCodec.VERSION = 1;
ZombieCodec.NAME_MAX = 20;
class ZombieRoleTallyMath {
    static empty() {
        return { cg: 0, cw: 0, pg: 0, pw: 0 };
    }
    static normalize(raw) {
        const tally = ZombieRoleTallyMath.empty();
        if (!raw || typeof raw !== "object")
            return tally;
        const source = raw;
        ZombieRoleTallyMath.KEYS.forEach((key) => { tally[key] = AccountNumbers.count(source[key]); });
        return tally;
    }
    static add(before, role, win) {
        const origin = role === ZombieRoles.ORIGIN;
        return {
            cg: before.cg + (origin ? 0 : 1), cw: before.cw + (!origin && win ? 1 : 0),
            pg: before.pg + (origin ? 1 : 0), pw: before.pw + (origin && win ? 1 : 0)
        };
    }
}
ZombieRoleTallyMath.KEYS = ["cg", "cw", "pg", "pw"];
class ZombieRandomTallyMath {
    static empty() {
        return Object.assign({ g: 0, w: 0, hg: 0, hw: 0, zg: 0, zw: 0 }, ZombieRoleTallyMath.empty());
    }
    static normalize(raw) {
        const tally = ZombieRandomTallyMath.empty();
        if (!raw || typeof raw !== "object")
            return tally;
        const source = raw;
        ZombieRandomTallyMath.NUMBERS.forEach((key) => { tally[key] = AccountNumbers.count(source[key]); });
        return tally;
    }
    static add(before, report, win) {
        const me = report.rows[report.myIndex];
        const startedHuman = me.role !== ZombieRoles.ORIGIN;
        const endedZombie = me.role !== ZombieRoles.SURVIVED;
        return Object.assign({
            g: before.g + 1, w: before.w + (win ? 1 : 0),
            hg: before.hg + (startedHuman ? 1 : 0), hw: before.hw + (startedHuman && report.winner === 0 ? 1 : 0),
            zg: before.zg + (endedZombie ? 1 : 0), zw: before.zw + (endedZombie && report.winner === 1 ? 1 : 0)
        }, ZombieRoleTallyMath.add(before, me.role, win));
    }
}
ZombieRandomTallyMath.NUMBERS = ["g", "w", "hg", "hw", "zg", "zw", "cg", "cw", "pg", "pw"];
class ZombieStatsMath {
    static empty() {
        return Object.assign({ g: 0, w: 0, l: 0, hg: 0, hw: 0, zg: 0, zw: 0, og: 0, sv: 0, ik: 0, ms: 0, mi: 0, hs: 0, ls: 0, ids: {}, rm: ZombieRandomTallyMath.empty() }, ZombieRoleTallyMath.empty());
    }
    static normalize(raw) {
        const node = ZombieStatsMath.empty();
        if (!raw || typeof raw !== "object")
            return node;
        const source = raw;
        ZombieRoles.NUMBER_KEYS.forEach((key) => { node[key] = AccountNumbers.count(source[key]); });
        const ids = AccountShape.slots(source.ids);
        Object.keys(ids).forEach((key) => { node.ids[key] = Number(ids[key]) || 0; });
        node.rm = ZombieRandomTallyMath.normalize(source.rm);
        return node;
    }
    static apply(raw, report, win, key, at) {
        const before = ZombieStatsMath.normalize(raw);
        if (before.ids[key] != null)
            return null;
        const me = report.rows[report.myIndex];
        const startedHuman = me.role !== ZombieRoles.ORIGIN;
        const endedZombie = me.role !== ZombieRoles.SURVIVED;
        const secs = Math.min(ZombieRoles.SECONDS_MAX, AccountNumbers.count(me.secs));
        const infects = Math.min(9, AccountNumbers.count(me.infects));
        const missions = Math.min(ZombieRoles.MISSIONS_MAX, AccountNumbers.count(me.missions));
        const rm = report.random ? ZombieRandomTallyMath.add(before.rm, report, win) : before.rm;
        const node = !ZombieRoles.countsInTotals(report.rows) ? Object.assign({}, before, { ids: Object.assign({}, before.ids), rm }) : Object.assign({
            g: before.g + 1, w: before.w + (win ? 1 : 0), l: before.l + (win ? 0 : 1),
            hg: before.hg + (startedHuman ? 1 : 0), hw: before.hw + (startedHuman && report.winner === 0 ? 1 : 0),
            zg: before.zg + (endedZombie ? 1 : 0), zw: before.zw + (endedZombie && report.winner === 1 ? 1 : 0),
            og: before.og + (me.role === ZombieRoles.ORIGIN ? 1 : 0), sv: before.sv + (me.role === ZombieRoles.SURVIVED ? 1 : 0),
            ik: before.ik + infects, ms: before.ms + missions, mi: Math.max(before.mi, infects),
            hs: before.hs + (startedHuman ? secs : 0), ls: Math.max(before.ls, startedHuman ? secs : 0),
            ids: Object.assign({}, before.ids), rm
        }, ZombieRoleTallyMath.add(before, me.role, win));
        node.ids[key] = at;
        const evicted = AccountKeyLedger.overflowKeys(node.ids);
        evicted.forEach((id) => { delete node.ids[id]; });
        return { node, evicted };
    }
}
class ZombieProfile extends AccountGameProfile {
    constructor() {
        super(...arguments);
        this.gameKey = "zombieoutbreak";
        this.mainChanged = true;
    }
    matchIdOf(report) { return report.matchId; }
    rankFields(node) { return { g: node.g, w: node.w, x: node.ik, y: node.ms, extra: { cg: node.cg, cw: node.cw, pg: node.pg, pw: node.pw } }; }
    extraPatch(user, extraRaw, node) { return this.mainChanged ? super.extraPatch(user, extraRaw, node) : {}; }
    planOf(report) { return new ZombiePlan(report); }
    encodeRecent(report, key, win) { return ZombieCodec.encode(report, key, win); }
    decodeRecent(raw) { return ZombieCodec.decode(raw); }
    normalizeStats(raw) { return ZombieStatsMath.normalize(raw); }
    applyStats(raw, report, plan, key, at) {
        const change = ZombieStatsMath.apply(raw, report, plan.win, key, at);
        if (!change)
            return null;
        this.mainChanged = plan.countsMain;
        const node = change.node;
        const patch = {};
        if (plan.countsMain)
            ZombieRoles.NUMBER_KEYS.forEach((name) => { patch[name] = node[name]; });
        if (plan.countsRandom)
            patch.rm = Object.assign({}, node.rm);
        patch["ids/" + key] = node.ids[key];
        change.evicted.forEach((id) => { patch["ids/" + id] = null; });
        return { node, patch };
    }
}
class ZombieStatsView {
    constructor() {
        this.title = "좀비 아웃브레이크";
        this.emptyRecent = "아직 기록된 온라인 경기가 없어요.";
    }
    statsHtml(node) {
        const s = node || ZombieStatsMath.empty();
        return AccountHtml.grid([
            ["좀비 승률", AccountHtml.percent(s.pw, s.pg) + " (" + s.pw + "/" + s.pg + ")"],
            ["시민 승률", AccountHtml.percent(s.cw, s.cg) + " (" + s.cw + "/" + s.cg + ")"],
            ["시민 평균 생존", s.hg ? AccountHtml.average(s.hs, s.hg, 1) + "초" : "—"],
            ["최장 생존", s.ls ? s.ls + "초" : "—"],
            ["감염시킨 수 합계", String(s.ik)],
            ["한 판 최다 감염", String(s.mi)],
            ["완료한 미션 합계", String(s.ms)],
            ["숙주 좀비", s.og + "번"],
            ["끝까지 생존", s.sv + "번"]
        ])
            + '<div class="asd-sec">좀비 승률은 숙주 좀비로 시작한 판, 시민 승률은 시민으로 시작한 판만 세요. 감염된 시민은 패배예요. 두 승률은 2026년 11월 4일부터 쌓여요. AI 가 1명 이하인 판만 셉니다(사람 4명 + AI 1명 판은 셉니다).</div>';
    }
    blockBodyHtml(entry) {
        const me = entry.rows[entry.myIndex];
        const secs = me.role === ZombieRoles.ORIGIN ? "" : " · 생존 " + me.secs + "초";
        return ZombieRoles.LABELS[me.role] + secs + (me.infects ? " · 감염시킴 " + me.infects : "") + (me.missions ? " · 미션 " + me.missions : "") + " · " + (entry.winner === 0 ? "인간 승리" : "좀비 승리");
    }
    resultTitle(entry) {
        return entry.winner === 0 ? "인간 승리!" : "좀비 승리!";
    }
    resultHtml(entry) {
        const order = entry.rows.map((row, index) => ({ row, index })).sort((a, b) => (b.row.secs - a.row.secs) || (a.index - b.index));
        const body = order.map((item) => {
            const row = item.row, mine = item.index === entry.myIndex;
            const pill = '<span class="asd-pill ' + ZombieStatsView.PILL_CLASSES[row.role] + '">' + ZombieRoles.LABELS[row.role] + "</span>";
            const cells = [(row.ai ? "🤖 " : "") + AccountHtml.esc(row.name) + (mine ? " (나)" : ""), pill, row.role === ZombieRoles.ORIGIN ? "-" : row.secs + "초", String(row.missions), String(row.infects)];
            return '<tr class="' + (mine ? "asd-me" : "") + '">' + cells.map((cell) => "<td>" + cell + "</td>").join("") + "</tr>";
        }).join("");
        return '<table class="asd-table"><thead><tr>' + ["닉네임", "결과", "생존 시간", "미션", "감염"].map((head) => "<th>" + head + "</th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table>";
    }
}
ZombieStatsView.PILL_CLASSES = ["origin", "infected", "survived"];
class ZombieOriginRotation {
    static gapOf(recent) {
        if (!recent.length)
            return ZombieOriginRotation.UNKNOWN_GAP;
        const newestFirst = recent.slice().sort((a, b) => b.at - a.at);
        let gap = 0;
        for (const entry of newestFirst) {
            if (entry.rows[entry.myIndex].role === ZombieRoles.ORIGIN)
                break;
            gap++;
        }
        return Math.min(ZombieOriginRotation.GAP_CAP, gap);
    }
    static gapFromRoom(raw) {
        const gap = Number(raw);
        return Number.isFinite(gap) && gap >= 0 ? Math.min(ZombieOriginRotation.GAP_CAP, Math.floor(gap)) : ZombieOriginRotation.UNKNOWN_GAP;
    }
    static nextGap(gap, wasOrigin) {
        return wasOrigin ? 0 : Math.min(ZombieOriginRotation.GAP_CAP, gap + 1);
    }
    static pick(candidates, random) {
        const eligible = candidates.filter((item) => item.gap >= ZombieOriginRotation.COOLDOWN);
        if (eligible.length)
            return ZombieOriginRotation.weighted(eligible, random);
        const longest = Math.max(...candidates.map((item) => item.gap));
        const tied = candidates.filter((item) => item.gap === longest);
        return tied[Math.floor(random() * tied.length)].id;
    }
    static weighted(eligible, random) {
        const weights = eligible.map((item) => Math.min(item.gap, ZombieOriginRotation.GAP_CAP) - ZombieOriginRotation.COOLDOWN + 1);
        let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
        for (let index = 0; index < eligible.length; index++) {
            roll -= weights[index];
            if (roll < 0)
                return eligible[index].id;
        }
        return eligible[eligible.length - 1].id;
    }
}
ZombieOriginRotation.COOLDOWN = 3;
ZombieOriginRotation.GAP_CAP = 12;
ZombieOriginRotation.UNKNOWN_GAP = ZombieOriginRotation.COOLDOWN;
class ZombieAccount extends AccountGameAccount {
    constructor() {
        super(new ZombieProfile(), new ZombieStatsView());
    }
    loadHostGap() {
        return this.loadRecent().then(ZombieOriginRotation.gapOf, () => ZombieOriginRotation.UNKNOWN_GAP);
    }
}
