"use strict";
/* =====================================================================
   게임 계정 통계 정상화 공용 엔진(2026-11-03 선생님 요청) — 교사 제어판(admin.html) 전용

   왜: 한 판을 같이 한 학생들 중 일부만 기록이 남는 일이 있었다(판이 끝난 직후 화면이 닫히거나, 보낸 요청이 한 번 실패한 경우).
       게임 쪽은 account-match-kit.ts 의 보관 상자(AccountOutbox)와 다시 보내기로 막았고,
       이미 빠진 판은 같은 판을 한 다른 학생의 최근 20매치(users/<uid>/recent/<게임>)에 남은 결과표로 되살린다.

   하는 일(게임마다 같은 순서, 게임별로 다른 부분은 AccountRepairGame 자식 클래스가 정한다):
     1. users 전체를 한 번 읽어 모든 학생의 최근 매치를 경기 열쇠(id)로 묶는다.
     2. 그 판 결과표의 사람 줄마다 닉네임(계정 이름에서 학번을 떼고 4자, 게임과 같은 규칙)으로 학생을 찾는다.
        같은 닉네임이 여럿이면 그 판을 가진 학생들의 반과 같은 사람을 고르고, 그래도 여럿이면 건너뛴다(목록에 보임).
     3. 그 판이 최근 매치에도 통계 열쇠(ids)에도 없는 학생에게 게임과 같은 계산(profile.planOf·applyStats·encodeRecent)으로 더한다.
     4. 반 별 통계 요약(gameRanks)도 새 누적값으로 맞추고, 같은 판의 미리 적기(pending)가 남았으면 지운다.
   쓰기는 선생님 계정만 할 수 있다(데이터베이스규칙.json 의 stats·recent·pending 교사 예외 — 콘솔 게시 필요).
   여러 번 실행해도 이미 있는 판은 건너뛰므로 두 번 세지 않는다. 적용 직전에 다시 읽어 그 사이 학생이 한 판을 더 해도 덮어쓰지 않는다.
   ===================================================================== */
class AccountRepairNames {
    /* 게임 닉네임 규칙: AccountPolicy.personName(학번 떼기) → PlayerProfile 닉네임 정리(제어 문자 빼고 4자) */
    static nickOf(accountName) {
        const stripped = accountName.replace(/^\d+[\s._-]*/, "").trim() || accountName;
        return stripped.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, AccountRepairNames.NICK_MAX);
    }
    static nameOf(user) {
        return typeof user.profile?.name === "string" ? user.profile.name : "";
    }
    static classOf(user) {
        return AccountClassRank.classKey(user.profile?.cls);
    }
}
AccountRepairNames.NICK_MAX = 4;
/* 게임마다 다른 부분: 최근 매치 한 판에서 사람 줄 목록을 꺼내고, 그 판의 다른 사람 줄을 "그 사람이 쓸 결과 보고"로 바꾼다 */
class AccountRepairGame {
    constructor(profile) {
        this.profile = profile;
    }
    get gameKey() {
        return this.profile.gameKey;
    }
    /* 예전 규칙으로는 누적에 안 셌지만 지금 규칙으로는 세는 판(예: 31번 AI 1명 판)인가. 그런 판은 최근 매치에만 있고 누적에 빠져 있으므로 누적에만 채운다 */
    backfillable(entry) {
        return false;
    }
    /* 나가지 않은 사람의 기록을 먼저 믿는다(나간 사람의 결과표는 승패를 모를 수 있다) */
    isReliable(entry) {
        const line = this.linesOf(entry)[this.ownIndex(entry)];
        return !!line && !line.left;
    }
}
class ZombieRepairGame extends AccountRepairGame {
    constructor() { super(new ZombieProfile()); }
    linesOf(entry) { return entry.rows.map((row) => ({ name: row.name, ai: row.ai, left: row.left })); }
    ownIndex(entry) { return entry.myIndex; }
    backfillable(entry) {
        return entry.rows.some((row) => row.ai) && ZombieRoles.countsInTotals(entry.rows) && entry.at < ZombieRoles.AI_RULE_FROM_MS;
    }
    reportFor(source, index) {
        return { matchId: source.id, myIndex: index, rows: source.rows, winner: source.winner, progress: 1, iLeft: !!source.rows[index] && source.rows[index].left };
    }
}
class TurboLapRepairGame extends AccountRepairGame {
    constructor() { super(new TurboLapProfile()); }
    linesOf(entry) { return entry.rows.map((row) => ({ name: row.nick, ai: row.bot, left: false })); }
    ownIndex(entry) { return entry.myIndex; }
    reportFor(source, index) {
        const mine = source.rows[source.myIndex], other = source.rows[index];
        if (!mine || !other)
            return null;
        const sameSide = other.side === mine.side;
        return { matchId: source.id, course: source.course, myIndex: index, rows: source.rows, result: sameSide === source.win ? "win" : "lose" };
    }
}
class FpsRepairGame extends AccountRepairGame {
    constructor() { super(new FpsProfile()); }
    linesOf(entry) { return entry.players.map((line) => ({ name: line.name, ai: line.ai, left: line.left })); }
    ownIndex(entry) { return entry.myIndex; }
    reportFor(source, index) {
        const mine = source.players[source.myIndex], line = source.players[index];
        if (!mine || !line || mine.left)
            return null;
        const winnerTeam = source.win ? mine.team : 1 - mine.team;
        return { matchId: source.id, myIndex: index, players: source.players, score: source.score, winnerTeam, progress: 1, iLeft: line.left };
    }
}
class SnowRepairGame extends AccountRepairGame {
    constructor() { super(new SnAccountProfile()); }
    linesOf(entry) { return entry.players.map((line) => ({ name: line.name, ai: line.ai, left: line.left })); }
    ownIndex(entry) { return entry.myIndex; }
    reportFor(source, index) {
        const line = source.players[index];
        return line ? { matchId: source.id, mode: source.mode, myIndex: index, players: source.players, progress: 1, iLeft: line.left } : null;
    }
}
class BalloonRepairGame extends AccountRepairGame {
    constructor() { super(new WbAccountProfile()); }
    linesOf(entry) { return entry.players.map((line) => ({ name: line.name, ai: line.ai, left: line.left })); }
    ownIndex(entry) { return entry.myIndex; }
    reportFor(source, index) {
        const line = source.players[index];
        return line ? { matchId: source.id, mode: source.mode, myIndex: index, players: source.players, progress: 1, iLeft: line.left } : null;
    }
}
class AccountRepairMatch {
    constructor(key) {
        this.key = key;
        this.holders = [];
    }
    get at() {
        return Math.min(...this.holders.map((holder) => holder.entry.at || 0));
    }
    heldBy(uid) {
        return this.holders.some((holder) => holder.uid === uid);
    }
}
/* 한 학생에게 더할 판들을 차례로 계산해 PATCH 값으로 모은다(게임의 profile 이 쓰는 계산을 그대로 쓴다) */
class AccountRepairFix {
    constructor(uid, user, game) {
        this.uid = uid;
        this.user = user;
        this.game = game;
        this.additions = [];
        this.values = {};
        this.nodeRaw = user.stats ? user.stats[game.gameKey] : null;
        this.slots = Object.assign({}, AccountShape.slots(user.recent ? user.recent[game.gameKey] : null));
    }
    get name() {
        return AccountRepairNames.nameOf(this.user) || this.uid;
    }
    has(key) {
        const ids = (this.nodeRaw && typeof this.nodeRaw === "object" ? this.nodeRaw.ids : null);
        if (ids && ids[key] != null)
            return true;
        return Object.keys(this.slots).some((slot) => this.slots[slot]?.id === key);
    }
    /* 열쇠(ids)가 있어도 센 판이 아닐 수 있다: 예전 규칙에서는 AI 판도 열쇠만 적었다. 채운 판은 열쇠 값을 시각+0.5(소수)로 적어 구분한다 */
    needsTotals(key) {
        const ids = (this.nodeRaw && typeof this.nodeRaw === "object" ? this.nodeRaw.ids : null);
        const value = ids ? ids[key] : null;
        return value == null || (typeof value === "number" && Number.isInteger(value));
    }
    /* 이미 최근 매치에 있는 판을 누적 통계에만 더한다(최근 20칸은 누적 열쇠 20개보다 새로우므로, 칸에 있는데 열쇠가 없으면 센 적이 없는 판이다) */
    addTotalsOnly(key, at, report) {
        const profile = this.game.profile;
        const plan = profile.planOf(report, null);
        if (!plan.countsStats)
            return false;
        const base = JSON.parse(JSON.stringify(this.nodeRaw || {}));
        if (base.ids)
            delete base.ids[key];
        const change = profile.applyStats(base, report, plan, key, at + 0.5);
        if (!change)
            return false;
        this.nodeRaw = change.node;
        const root = "users/" + this.uid + "/";
        Object.keys(change.patch).forEach((path) => { this.values[root + profile.statsPath + "/" + path] = change.patch[path]; });
        Object.assign(this.values, profile.extraPatch({ uid: this.uid, name: this.name }, this.user.profile?.cls, change.node));
        this.additions.push({ key, at, win: plan.win, countsStats: true, intoRecent: false, pendingSame: false });
        return true;
    }
    /* 최근 20칸이 다 찼는데 이 판이 그보다 오래됐으면 예전에 이미 세고 밀려난 판일 수 있어 넣지 않는다(두 번 세지 않게) */
    fitsRecent(at) {
        return this.slotFor(at) !== null;
    }
    add(key, at, report) {
        const profile = this.game.profile;
        const plan = profile.planOf(report, null);
        if (!plan.recordsRecent)
            return false;
        const root = "users/" + this.uid + "/";
        if (plan.countsStats) {
            const change = profile.applyStats(this.nodeRaw, report, plan, key, at);
            if (change) {
                this.nodeRaw = change.node;
                Object.keys(change.patch).forEach((path) => { this.values[root + profile.statsPath + "/" + path] = change.patch[path]; });
                const user = { uid: this.uid, name: this.name };
                Object.assign(this.values, profile.extraPatch(user, this.user.profile?.cls, change.node));
            }
        }
        const slot = this.slotFor(at);
        if (slot !== null) {
            const stored = Object.assign(profile.encodeRecent(report, key, plan.win), { at });
            this.slots[slot] = stored;
            this.values[root + profile.recentPath + "/" + slot] = stored;
        }
        const pendingId = this.user.pending ? this.user.pending[this.game.gameKey]?.id : undefined;
        const pendingSame = pendingId === key;
        if (pendingSame)
            this.values[root + profile.pendingPath] = null;
        this.additions.push({ key, at, win: plan.win, countsStats: plan.countsStats, intoRecent: slot !== null, pendingSame });
        return true;
    }
    patch() {
        return this.values;
    }
    slotFor(at) {
        let oldest = null;
        let oldestAt = Infinity;
        for (let slot = 0; slot < RecentMatchRing.SLOTS; slot++) {
            const entry = this.slots[String(slot)];
            if (!entry)
                return String(slot);
            const entryAt = typeof entry.at === "number" ? entry.at : 0;
            if (entryAt < oldestAt) {
                oldestAt = entryAt;
                oldest = String(slot);
            }
        }
        return oldestAt < at ? oldest : null;
    }
}
class AccountRepairPlan {
    constructor() {
        this.matchCount = 0;
        this.fixes = [];
        this.skips = [];
        this.agedOutLines = 0;
    }
    get partialMatches() {
        const keys = new Set();
        this.fixes.forEach((fix) => fix.additions.forEach((addition) => keys.add(addition.key)));
        this.skips.forEach((skip) => keys.add(skip.key));
        return keys.size;
    }
    get addedCount() {
        return this.fixes.reduce((sum, fix) => sum + fix.additions.length, 0);
    }
    patch() {
        return Object.assign({}, ...this.fixes.map((fix) => fix.patch()));
    }
    summary(gameKey) {
        return {
            gameKey, studentCount: this.fixes.length, matchCount: this.matchCount, partialMatches: this.partialMatches,
            additions: this.fixes.map((fix) => ({ name: fix.name, list: fix.additions })), skips: this.skips, agedOutLines: this.agedOutLines
        };
    }
}
class AccountRepairPlanner {
    constructor(game) {
        this.game = game;
    }
    plan(users) {
        const plan = new AccountRepairPlan();
        const game = this.game;
        const byKey = this.collect(users);
        const byNick = this.nickIndex(users);
        const fixes = {};
        const matches = Object.keys(byKey).map((key) => byKey[key]).sort((a, b) => a.at - b.at);
        plan.matchCount = matches.length;
        matches.forEach((match) => {
            const source = match.holders.filter((holder) => game.isReliable(holder.entry))[0] || match.holders[0];
            match.holders.forEach((holder) => {
                if (!game.backfillable(holder.entry))
                    return;
                const own = game.reportFor(holder.entry, game.ownIndex(holder.entry));
                if (!own)
                    return;
                const fix = fixes[holder.uid] = fixes[holder.uid] || new AccountRepairFix(holder.uid, users[holder.uid], game);
                if (fix.needsTotals(match.key))
                    fix.addTotalsOnly(match.key, holder.entry.at || match.at, own);
            });
            const heldIndexes = match.holders.map((holder) => game.ownIndex(holder.entry));
            game.linesOf(source.entry).forEach((line, index) => {
                if (line.ai || heldIndexes.indexOf(index) >= 0)
                    return;
                const skip = (reason) => plan.skips.push({ name: line.name, key: match.key, reason });
                const uids = this.findUid(line.name, match, byNick, users);
                if (!uids.length)
                    return skip("계정을 찾지 못함(로그인하지 않았거나 닉네임이 다름)");
                if (uids.length > 1)
                    return skip("같은 닉네임 학생이 " + uids.length + "명이라 누구인지 정할 수 없음");
                if (match.heldBy(uids[0]))
                    return;
                const report = game.reportFor(source.entry, index);
                if (!report)
                    return skip("이 판의 승패를 알 수 없음");
                const fix = fixes[uids[0]] = fixes[uids[0]] || new AccountRepairFix(uids[0], users[uids[0]], game);
                if (fix.has(match.key))
                    return;
                if (!fix.fitsRecent(match.at)) {
                    plan.agedOutLines++;
                    return;
                }
                fix.add(match.key, match.at, report);
            });
        });
        plan.fixes.push(...Object.keys(fixes).map((uid) => fixes[uid]).filter((fix) => fix.additions.length > 0));
        return plan;
    }
    collect(users) {
        const byKey = {};
        Object.keys(users).forEach((uid) => {
            const slots = AccountShape.slots(users[uid]?.recent ? users[uid].recent[this.game.gameKey] : null);
            Object.keys(slots).forEach((slot) => {
                const entry = this.game.profile.decodeRecent(slots[slot]);
                if (!entry || !entry.id)
                    return;
                (byKey[entry.id] = byKey[entry.id] || new AccountRepairMatch(entry.id)).holders.push({ uid, entry });
            });
        });
        return byKey;
    }
    nickIndex(users) {
        const index = {};
        Object.keys(users).forEach((uid) => {
            const name = AccountRepairNames.nameOf(users[uid] || {});
            if (!name)
                return;
            const nick = AccountRepairNames.nickOf(name);
            (index[nick] = index[nick] || []).push(uid);
        });
        return index;
    }
    /* 같은 닉네임이 여럿이면 이미 그 판을 가진 학생은 빼고, 그 판 학생들의 반과 같은 사람만 남긴다 */
    findUid(name, match, byNick, users) {
        const candidates = byNick[String(name || "").trim()] || [];
        if (candidates.length <= 1)
            return candidates;
        const notHolding = candidates.filter((uid) => !match.heldBy(uid));
        if (notHolding.length <= 1)
            return notHolding.length ? notHolding : candidates.slice(0, 1);
        const classes = match.holders.map((holder) => AccountRepairNames.classOf(users[holder.uid] || {}));
        const sameClass = notHolding.filter((uid) => classes.indexOf(AccountRepairNames.classOf(users[uid] || {})) >= 0);
        return sameClass.length ? sameClass : notHolding;
    }
}
/* 한 게임의 정상화를 한 번 해 보고 결과를 돌려준다. 반 별 통계의 새로고침 버튼이 누를 때마다 부른다(2026-11-03).
   users 를 읽어 빠진 판을 찾고 → 바로 채우고(다시 읽어 확인) → 무엇을 채웠는지 요약을 돌려준다. 채울 게 없으면 쓰지 않는다. */
class AccountStatsNormalizer {
    constructor(io) {
        this.io = io;
        this.planners = {};
        this.register(new ZombieRepairGame());
        this.register(new TurboLapRepairGame());
        this.register(new FpsRepairGame());
        this.register(new SnowRepairGame());
        this.register(new BalloonRepairGame());
        this.planners["teambattle"] = (users) => {
            const plan = new TeamBattleRepairPlanner(true).plan(users);
            return { patch: () => plan.patch(), summary: () => AccountStatsNormalizer.teamSummary(plan) };
        };
    }
    /* 정상화를 지원하는 게임인가(32·34·35 랜덤 매칭은 결과표에 상대 이름만 남아 되살릴 수 없다) */
    supports(gameKey) {
        return !!this.planners[gameKey];
    }
    /* 30번은 먼저 같은 판이 두 번 올라간 중복을 지우고(2026-11-06), 그 뒤 깨끗한 자료로 빠진 판을 채운다 */
    async normalize(gameKey) {
        const make = this.planners[gameKey];
        if (!make)
            return null;
        const duplicates = gameKey === "teambattle" ? await this.removeTeamBattleDuplicates() : null;
        const first = make(await this.readUsers());
        if (!first.summary().studentCount)
            return AccountStatsNormalizer.withDuplicates(first.summary(), duplicates);
        const fresh = make(await this.readUsers());
        const values = fresh.patch();
        if (Object.keys(values).length)
            await this.io.patch(values);
        return AccountStatsNormalizer.withDuplicates(fresh.summary(), duplicates);
    }
    async removeTeamBattleDuplicates() {
        const first = TeamBattleDuplicatePlan.build(await this.readUsers());
        if (!first.removedCount)
            return first;
        const fresh = TeamBattleDuplicatePlan.build(await this.readUsers());
        const values = fresh.patch();
        if (Object.keys(values).length)
            await this.io.patch(values);
        return fresh;
    }
    static withDuplicates(result, duplicates) {
        if (!duplicates)
            return result;
        result.removed = duplicates.fixes.filter((fix) => fix.removals.length).map((fix) => ({ name: fix.name, list: fix.removals.map((removal) => ({ at: removal.at, win: removal.win })) }));
        result.removedSkips = duplicates.skips.map((skip) => ({ name: skip.name, key: skip.key, reason: skip.reason }));
        return result;
    }
    async readUsers() {
        return (await this.io.read("users")) || {};
    }
    register(game) {
        this.planners[game.gameKey] = (users) => {
            const plan = new AccountRepairPlanner(game).plan(users);
            return { patch: () => plan.patch(), summary: () => plan.summary(game.gameKey) };
        };
    }
    static teamSummary(plan) {
        const by = {};
        plan.fixes.forEach((fix) => {
            by[fix.uid] = { name: fix.name, list: fix.additions.map((addition) => ({ key: addition.key, at: addition.at, win: addition.win, countsStats: addition.countsStats, intoRecent: addition.intoRecent, pendingSame: addition.pendingSame })) };
        });
        return {
            gameKey: "teambattle", studentCount: plan.fixes.length, matchCount: plan.matches.length, partialMatches: plan.partialMatches,
            additions: Object.keys(by).map((uid) => by[uid]), skips: plan.skips.map((skip) => ({ name: skip.name, key: skip.key, reason: skip.reason })), agedOutLines: plan.agedOutLines
        };
    }
}
/* 새로고침 버튼 아래에 정상화 결과를 보여 준다 */
class AccountRepairReport {
    static line(result) {
        if (!result)
            return "";
        const added = result.additions.reduce((sum, item) => sum + item.list.length, 0);
        const removed = (result.removed || []).reduce((sum, item) => sum + item.list.length, 0);
        const removedText = removed ? "같은 판이 두 번 기록된 " + removed + "판(학생 " + (result.removed || []).length + "명)을 지워 통계에서 뺐습니다. " : "";
        if (!added)
            return "통계 정상화: " + removedText + "빠진 기록이 없습니다.";
        return "통계 정상화: " + removedText + "학생 " + result.studentCount + "명의 빠진 판 " + added + "개를 채웠습니다." + (result.skips.length ? " (건너뜀 " + result.skips.length + "줄)" : "");
    }
    static html(result) {
        if (!result)
            return "";
        const row = (name, count, text) => "<tr><td>" + AccountHtml.esc(name) + "</td><td>" + count + "</td><td>" + AccountHtml.esc(text) + "</td></tr>";
        const removedRows = (result.removed || []).map((item) => row(item.name, String(item.list.length), "중복 삭제: " + item.list.map((one) => RecentBlockList.whenText(one.at) + " " + (one.win ? "승" : "패")).join(", ")))
            .concat((result.removedSkips || []).map((skip) => row(skip.name, "-", skip.reason)));
        const addedRows = result.additions.map((item) => row(item.name, String(item.list.length), "채움: " + item.list.map((addition) => RecentBlockList.whenText(addition.at) + " " + (addition.win ? "승" : "패") + (addition.countsStats ? "" : "(AI 판)")).join(", ")));
        const skipRows = result.skips.map((skip) => row(skip.name, "-", skip.reason));
        const rows = removedRows.concat(addedRows, skipRows);
        if (!rows.length)
            return "";
        return "<table><thead><tr><th>학생</th><th>판</th><th>정리한 내용 / 건너뛴 까닭</th></tr></thead><tbody>" + rows.join("") + "</tbody></table>";
    }
}
