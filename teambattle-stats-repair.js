"use strict";
/* =====================================================================
   30번 팀 배틀 계정 통계 정상화(2026-10-29 선생님 요청, 2026-11-02 반 별 통계 버튼으로 다시 붙임) — 교사 제어판(admin.html) 전용

   왜: 경기가 끝난 뒤 학생 기기가 자기 계정에 결과를 쓰기 전에 화면이 닫히면(← 목록으로·탭 닫기·태블릿 끄기)
       같은 판인데 몇 명만 기록되고 몇 명은 빠졌다. 게임 쪽은 account-match-kit.ts 의 stash 로 고쳤고,
       이미 빠진 판은 다른 학생의 최근 20매치(users/<uid>/recent/teambattle)에 남은 그 판의 결과표로 되살린다.

   하는 일:
     1. users 전체를 한 번 읽어 모든 학생의 최근 매치를 경기 열쇠(id)로 묶는다.
     2. 그 판 결과표의 사람 줄마다 닉네임(계정 이름에서 학번을 떼고 4자, 게임과 같은 규칙)으로 학생을 찾는다.
        같은 닉네임이 여럿이면 그 판을 가진 학생들의 반과 같은 사람을 고르고, 그래도 여럿이면 건너뛴다(목록에 보임).
     3. 그 판이 최근 매치에도 통계 열쇠(ids)에도 없는 학생에게 게임과 같은 계산(AccountStatsMath·AccountMvpJudge)으로 더한다.
        누적 통계는 게임 규칙대로 AI 가 없던 판만, 최근 매치는 더 오래된 칸이 있을 때만 그 자리에 넣는다.
        다른 기기에서 "나감"으로 보인 학생은 게임 규칙(나가면 패배)대로 패배로 넣는다(선생님이 끌 수 있음).
     4. 반 별 통계(classStats)도 새 누적값으로 맞추고, 같은 판의 미리 적기(pending)가 남았으면 지운다.
   쓰기는 선생님 계정만 할 수 있다(데이터베이스규칙.json 의 stats·recent·pending 의 teambattle 교사 예외 — 콘솔 게시 필요).
   미리 보기 → 적용 순서이고, 적용 직전에 다시 읽어 그 사이 학생이 한 판을 더 해도 덮어쓰지 않는다.
   ===================================================================== */
/* 같은 판이 경기 열쇠만 다르게 두 번 올라간 것을 알아보는 지문(2026-11-06): 점수와 모든 선수의 이름·팀·캐릭터·킬·데스·어시스트·피해·회복이 같고 시각이 가까우면 같은 판이다.
   나감·AI 표시는 다시 입장하면 달라질 수 있어 뺀다 */
class TeamBattleGameFingerprint {
    static of(entry) {
        return JSON.stringify([entry.score, entry.players.map((line) => [line.name, line.team, line.char, line.kills, line.deaths, line.assists, Math.round(line.dmg), Math.round(line.heal)])]);
    }
    static same(a, b) {
        return Math.abs((a.at || 0) - (b.at || 0)) <= TeamBattleGameFingerprint.SAME_GAME_WINDOW_MS && TeamBattleGameFingerprint.of(a) === TeamBattleGameFingerprint.of(b);
    }
}
TeamBattleGameFingerprint.SAME_GAME_WINDOW_MS = 3 * 60 * 60 * 1000;
/* 누적 통계에서 한 판을 되돌려 뺀다(AccountStatsMath.apply 의 거꾸로). 평균은 한 자리 반올림이라 아주 조금 어긋날 수 있다 */
class TeamBattleStatsReverter {
    static remove(raw, entry, key) {
        const before = AccountStatsMath.normalize(raw);
        const me = entry.players[entry.myIndex];
        const blue = me.team === 0;
        const win = entry.win;
        const mvp = !me.left && new AccountMvpJudge((line) => TeamBattleScore.of(line)).isMvp(entry.players, entry.myIndex);
        const down = (value, flag) => Math.max(0, value - (flag ? 1 : 0));
        const node = {
            g: down(before.g, true), w: down(before.w, win), l: down(before.l, !win),
            bg: down(before.bg, blue), bw: down(before.bw, blue && win), rg: down(before.rg, !blue), rw: down(before.rw, !blue && win),
            m: down(before.m, mvp), ids: Object.assign({}, before.ids || {}), c: Object.assign({}, before.c || {})
        };
        delete node.ids[key];
        const reduced = TeamBattleStatsReverter.removeChar(node.c[me.char] || AccountStatsMath.emptyChar(), me, win, blue, mvp);
        if (reduced.n > 0)
            node.c[me.char] = reduced;
        else
            delete node.c[me.char];
        return { node, charId: me.char };
    }
    static unaverage(average, samplesNow, value) {
        return samplesNow <= 1 ? 0 : Math.max(0, AccountNumbers.oneDecimal((average * samplesNow - value) / (samplesNow - 1)));
    }
    static removeChar(before, line, win, blue, mvp) {
        const un = TeamBattleStatsReverter.unaverage;
        const down = (value, flag) => Math.max(0, value - (flag ? 1 : 0));
        const skillKnown = line.skillDmg != null;
        const dealt = Math.max(0, Number(line.dmg) || 0);
        return {
            n: down(before.n, true), w: down(before.w, win), bg: down(before.bg, blue), bw: down(before.bw, blue && win),
            rg: down(before.rg, !blue), rw: down(before.rw, !blue && win), m: down(before.m, mvp),
            kn: down(before.kn, true),
            k: un(before.k, before.kn, AccountNumbers.count(line.kills)),
            d: un(before.d, before.kn, AccountNumbers.count(line.deaths)),
            a: un(before.a, before.kn, AccountNumbers.count(line.assists)),
            dmg: un(before.dmg, before.n, dealt),
            hl: un(before.hl, before.n, Math.max(0, Number(line.heal) || 0)),
            bl: un(before.bl, before.n, Math.max(0, Number(line.blocked) || 0)),
            st: un(before.st, before.n, Math.max(0, Number(line.stun) || 0)),
            sl: un(before.sl, before.n, Math.max(0, Number(line.slow) || 0)),
            scn: down(before.scn, true),
            sc: un(before.sc, before.scn, TeamBattleScore.of(line)),
            skn: down(before.skn, skillKnown),
            sk: skillKnown ? un(before.sk, before.skn, Math.max(0, Number(line.skillDmg) || 0)) : before.sk,
            skb: skillKnown ? un(before.skb, before.skn, dealt) : before.skb
        };
    }
}
/* 한 학생의 같은 판 중복을 지우는 계산: 최근 매치 칸을 비우고, 누적에 셌던 판이면 누적·캐릭터 통계·반 별 요약을 되돌린다 */
class TeamBattleDuplicateFix {
    constructor(uid, user) {
        this.uid = uid;
        this.user = user;
        this.removals = [];
        this.skips = [];
        this.node = null;
        this.values = {};
    }
    get name() {
        return TeamBattleRepairNames.nameOf(this.user) || this.uid;
    }
    /* 오래된 칸을 남기고 같은 판의 나중 칸들을 지운다 */
    collect() {
        const slots = AccountShape.slots(this.user.recent?.teambattle);
        const entries = Object.keys(slots)
            .map((slot) => ({ slot, entry: TeamBattleCodec.decode(slots[slot]) }))
            .filter((item) => !!item.entry)
            .sort((a, b) => (a.entry.at - b.entry.at) || (a.entry.id < b.entry.id ? -1 : 1));
        const kept = [];
        entries.forEach((item) => {
            if (!kept.some((other) => TeamBattleGameFingerprint.same(other, item.entry))) {
                kept.push(item.entry);
                return;
            }
            this.remove(item.slot, item.entry);
        });
    }
    patch() {
        return this.values;
    }
    remove(slot, entry) {
        const root = "users/" + this.uid + "/";
        const statsRaw = this.node || this.user.stats?.teambattle;
        const ids = AccountStatsMath.normalize(statsRaw).ids || {};
        const counted = ids[entry.id] != null;
        if (!entry.withAi && !counted) {
            this.skips.push({ name: this.name, key: entry.id, reason: "누적에 센 판인지 알 수 없어(오래된 열쇠가 밀려남) 그대로 둠" });
            return;
        }
        if (!entry.withAi) {
            const reduced = TeamBattleStatsReverter.remove(statsRaw, entry, entry.id);
            this.node = reduced.node;
            const node = reduced.node;
            ["g", "w", "l", "bg", "bw", "rg", "rw", "m"].forEach((field) => { this.values[root + "stats/teambattle/" + field] = node[field]; });
            this.values[root + "stats/teambattle/ids/" + entry.id] = null;
            this.values[root + "stats/teambattle/c/" + reduced.charId] = node.c[reduced.charId] || null;
            if (TeamBattleRepairNames.ADMIN_UIDS.indexOf(this.uid) < 0) {
                const classKey = TeamBattleRepairNames.classOf(this.user);
                this.values["classStats/" + classKey + "/" + this.uid] = ClassStatsSummary.build(this.name, node);
            }
        }
        this.values[root + "recent/teambattle/" + slot] = null;
        this.removals.push({ key: entry.id, at: entry.at, win: entry.win, countedInStats: !entry.withAi });
    }
}
class TeamBattleDuplicatePlan {
    constructor() {
        this.fixes = [];
    }
    get removedCount() {
        return this.fixes.reduce((sum, fix) => sum + fix.removals.length, 0);
    }
    get skips() {
        return [].concat(...this.fixes.map((fix) => fix.skips));
    }
    patch() {
        return Object.assign({}, ...this.fixes.map((fix) => fix.patch()));
    }
    static build(users) {
        const plan = new TeamBattleDuplicatePlan();
        Object.keys(users).forEach((uid) => {
            const fix = new TeamBattleDuplicateFix(uid, users[uid] || {});
            fix.collect();
            if (fix.removals.length || fix.skips.length)
                plan.fixes.push(fix);
        });
        return plan;
    }
}
class TeamBattleRepairNames {
    /* 게임 닉네임 규칙: AccountPolicy.personName(학번 떼기) → PlayerProfile 닉네임 정리(제어 문자 빼고 4자) */
    static nickOf(accountName) {
        const stripped = accountName.replace(/^\d+[\s._-]*/, "").trim() || accountName;
        return stripped.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, TeamBattleRepairNames.NICK_MAX);
    }
    static nameOf(user) {
        return typeof user.profile?.name === "string" ? user.profile.name : "";
    }
    static classOf(user) {
        return ClassStatsSummary.classKey(user.profile?.cls);
    }
}
TeamBattleRepairNames.NICK_MAX = 4;
TeamBattleRepairNames.ADMIN_UIDS = ["use16pcii5RbEATuPtWhRDArmoj2", "HFcjiyXAl1YWzm3AyrZmzo4uMdG3"];
class TeamBattleRepairMatch {
    constructor(key) {
        this.key = key;
        this.holders = [];
    }
    add(holder) {
        this.holders.push(holder);
    }
    get source() {
        return this.holders.filter((holder) => !holder.entry.players[holder.entry.myIndex].left)[0] || this.holders[0];
    }
    get at() {
        return Math.min(...this.holders.map((holder) => holder.entry.at || 0));
    }
    /* 나가지 않은 학생들의 승패로 이긴 팀을 정하고, 모두 나갔으면 점수판으로 정한다. 정할 수 없으면 -1 */
    winnerTeam() {
        const votes = [0, 0];
        this.holders.forEach((holder) => {
            const me = holder.entry.players[holder.entry.myIndex];
            if (me.left)
                return;
            votes[holder.entry.win ? me.team : 1 - me.team]++;
        });
        if (votes[0] !== votes[1])
            return votes[0] > votes[1] ? 0 : 1;
        const score = this.source.entry.score;
        return score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1;
    }
    heldBy(uid) {
        return this.holders.some((holder) => holder.uid === uid);
    }
    holderClasses(users) {
        return this.holders.map((holder) => TeamBattleRepairNames.classOf(users[holder.uid] || {}));
    }
}
class TeamBattleRepairFix {
    constructor(uid, user) {
        this.uid = uid;
        this.user = user;
        this.additions = [];
        this.node = null;
        this.newSlots = {};
        this.slots = Object.assign({}, AccountShape.slots(user.recent?.teambattle));
    }
    get name() {
        return TeamBattleRepairNames.nameOf(this.user) || this.uid;
    }
    get statsNode() {
        return this.node;
    }
    has(key) {
        const ids = AccountStatsMath.normalize(this.user.stats?.teambattle).ids || {};
        if (ids[key] != null || (this.node && this.node.ids && this.node.ids[key] != null))
            return true;
        return Object.keys(this.slots).some((slot) => this.slots[slot]?.id === key);
    }
    /* 열쇠만 다르고 같은 판이 이미 이 학생 칸에 있으면(다시 입장해 두 번 올라간 판 등) 또 채우지 않는다 */
    holdsSameGame(match) {
        const target = match.source.entry;
        return Object.keys(this.slots).some((slot) => {
            const entry = TeamBattleCodec.decode(this.slots[slot]);
            return !!entry && TeamBattleGameFingerprint.same(entry, target);
        });
    }
    /* 최근 20칸이 다 찼는데 이 판이 그보다 오래됐으면 예전에 이미 세고 밀려난 판일 수 있어 넣지 않는다(두 번 세지 않게) */
    fitsRecent(at) {
        return this.slotFor(at) !== null;
    }
    add(match, index, winnerTeam) {
        const source = match.source;
        const line = source.entry.players[index];
        const left = line.left;
        const win = !left && line.team === winnerTeam;
        const mvp = !left && new AccountMvpJudge((player) => TeamBattleScore.of(player)).isMvp(source.entry.players, index);
        const countsStats = !source.entry.withAi;
        const at = match.at;
        if (countsStats) {
            const change = AccountStatsMath.apply(this.node || this.user.stats?.teambattle, line, { key: match.key, win, side: line.team, mvp, at });
            if (change)
                this.node = change.node;
        }
        const raw = Object.assign(JSON.parse(JSON.stringify(source.raw)), { me: index, r: win ? 1 : 0, at });
        const slot = this.slotFor(at);
        if (slot !== null) {
            this.slots[slot] = raw;
            this.newSlots[slot] = raw;
        }
        const pendingId = this.user.pending?.teambattle?.id;
        this.additions.push({ key: match.key, at, index, win, mvp, left, countsStats, intoRecent: slot !== null, pendingSame: pendingId === match.key });
    }
    patch() {
        const values = {};
        const root = "users/" + this.uid + "/";
        if (this.node) {
            values[root + "stats/teambattle"] = this.node;
            if (TeamBattleRepairNames.ADMIN_UIDS.indexOf(this.uid) < 0) {
                const classKey = TeamBattleRepairNames.classOf(this.user);
                values["classStats/" + classKey + "/" + this.uid] = ClassStatsSummary.build(this.name, this.node);
                if (classKey !== ClassStatsSummary.NONE)
                    values["classStats/" + ClassStatsSummary.NONE + "/" + this.uid] = null;
            }
        }
        Object.keys(this.newSlots).forEach((slot) => { values[root + "recent/teambattle/" + slot] = this.newSlots[slot]; });
        if (this.additions.some((addition) => addition.pendingSame))
            values[root + "pending/teambattle"] = null;
        return values;
    }
    /* 빈 칸이 있으면 그 칸, 없으면 이 판보다 오래된 판 중 가장 오래된 칸. 모두 더 새로우면 최근 매치에는 넣지 않는다 */
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
class TeamBattleRepairPlan {
    constructor() {
        this.matches = [];
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
    get addedLines() {
        return [].concat(...this.fixes.map((fix) => fix.additions));
    }
    patch() {
        return Object.assign({}, ...this.fixes.map((fix) => fix.patch()));
    }
}
class TeamBattleRepairPlanner {
    constructor(includeLeft) {
        this.includeLeft = includeLeft;
    }
    plan(users) {
        const plan = new TeamBattleRepairPlan();
        const byKey = this.collect(users);
        const byNick = this.nickIndex(users);
        const fixes = {};
        plan.matches.push(...Object.keys(byKey).map((key) => byKey[key]).sort((a, b) => a.at - b.at));
        plan.matches.forEach((match) => {
            const winnerTeam = match.winnerTeam();
            match.source.entry.players.forEach((line, index) => {
                if (line.ai || match.holders.some((holder) => holder.entry.myIndex === index))
                    return;
                const uid = this.findUid(line.name, match, byNick, users);
                const skip = (reason) => plan.skips.push({ name: line.name, key: match.key, reason });
                if (!uid.length)
                    return skip("계정을 찾지 못함(로그인하지 않았거나 닉네임이 다름)");
                if (uid.length > 1)
                    return skip("같은 닉네임 학생이 " + uid.length + "명이라 누구인지 정할 수 없음");
                if (match.heldBy(uid[0]))
                    return;
                if (winnerTeam < 0)
                    return skip("이긴 팀을 알 수 없음");
                if (line.left && !this.includeLeft)
                    return skip("중간에 나감(패배로 넣지 않기로 함)");
                const fix = fixes[uid[0]] = fixes[uid[0]] || new TeamBattleRepairFix(uid[0], users[uid[0]]);
                if (fix.has(match.key) || fix.holdsSameGame(match))
                    return;
                if (!fix.fitsRecent(match.at)) {
                    plan.agedOutLines++;
                    return;
                }
                fix.add(match, index, winnerTeam);
            });
        });
        plan.fixes.push(...Object.keys(fixes).map((uid) => fixes[uid]).filter((fix) => fix.additions.length > 0));
        return plan;
    }
    collect(users) {
        const byKey = {};
        Object.keys(users).forEach((uid) => {
            const slots = AccountShape.slots(users[uid]?.recent?.teambattle);
            Object.keys(slots).forEach((slot) => {
                const entry = TeamBattleCodec.decode(slots[slot]);
                if (!entry || !entry.id)
                    return;
                const match = byKey[entry.id] = byKey[entry.id] || new TeamBattleRepairMatch(entry.id);
                match.add({ uid, raw: slots[slot], entry });
            });
        });
        return byKey;
    }
    nickIndex(users) {
        const index = {};
        Object.keys(users).forEach((uid) => {
            const name = TeamBattleRepairNames.nameOf(users[uid] || {});
            if (!name)
                return;
            const nick = TeamBattleRepairNames.nickOf(name);
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
        const classes = match.holderClasses(users);
        const sameClass = notHolding.filter((uid) => classes.indexOf(TeamBattleRepairNames.classOf(users[uid] || {})) >= 0);
        return sameClass.length ? sameClass : notHolding;
    }
}
/* 2026-11-02 선생님 요청으로 반 별 통계의 새로고침 옆 버튼 하나로 다시 붙였다: 누르면 빠진 판을 찾아 표로 보이고, 확인 창에서 '확인'을 누를 때만 채운다.
   중간에 나간 학생은 게임 규칙대로 패배로 넣는다 */
class TeamBattleRepairPanel {
    constructor(io, ids, onApplied) {
        this.io = io;
        this.ids = ids;
        this.onApplied = onApplied;
        this.busy = false;
    }
    bind() {
        this.el(this.ids.run).addEventListener("click", () => { void this.run(); });
    }
    el(id) {
        return document.getElementById(id);
    }
    say(text) {
        this.el(this.ids.msg).textContent = text;
    }
    async load() {
        const users = (await this.io.read("users"));
        return new TeamBattleRepairPlanner(true).plan(users || {});
    }
    async run() {
        if (this.busy)
            return;
        const button = this.el(this.ids.run);
        this.busy = true;
        button.disabled = true;
        this.say("학생 기록을 읽어 빠진 판을 찾는 중…");
        try {
            const plan = await this.load();
            this.render(plan);
            if (!plan.fixes.length) {
                this.say("빠진 기록이 없습니다.");
                return;
            }
            if (!confirm("학생 " + plan.fixes.length + "명의 30번 통계에 빠진 판 " + plan.addedLines.length + "개를 채워 넣을까요?\n(아래 표에 학생과 판이 나와 있습니다)")) {
                this.say("채우지 않았습니다. 아래 표는 미리 보기입니다.");
                return;
            }
            this.say("다시 읽고 채우는 중…");
            const fresh = await this.load();
            const values = fresh.patch();
            if (Object.keys(values).length)
                await this.io.patch(values);
            this.render(fresh);
            this.say("채웠습니다: 학생 " + fresh.fixes.length + "명, 판 " + fresh.addedLines.length + "개.");
            this.onApplied();
        }
        catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            this.say("정상화하지 못했습니다(" + text + "). 데이터베이스규칙.json 을 Firebase 콘솔에 다시 게시했는지 확인해 주세요.");
        }
        finally {
            this.busy = false;
            button.disabled = false;
        }
    }
    render(plan) {
        const added = plan.addedLines;
        const closed = added.filter((addition) => addition.pendingSame).length;
        const left = added.filter((addition) => addition.left).length;
        const summary = "최근 매치에 남은 판 " + plan.matches.length + "개 중 " + plan.partialMatches + "개에서 기록이 빠진 학생이 있습니다. " +
            "채울 학생 " + plan.fixes.length + "명 · 판 " + added.length + "개(누적 통계 " + added.filter((addition) => addition.countsStats).length + " · 최근 매치 " + added.filter((addition) => addition.intoRecent).length + ")" +
            (closed ? " · 그중 " + closed + "개는 판이 끝난 뒤 결과를 쓰기 전에 화면이 닫힌 흔적(미리 적기)이 남아 있음" : "") +
            (left ? " · 다른 기기에서 '나감'으로 보인 판 " + left + "개는 패배로 넣음" : "") +
            (plan.skips.length ? " · 건너뜀 " + plan.skips.length + "줄" : "") +
            (plan.agedOutLines ? " · 최근 20매치보다 오래된 " + plan.agedOutLines + "줄은 이미 센 판으로 보고 문제 없음 처리" : "");
        if (!plan.fixes.length && !plan.skips.length) {
            this.el(this.ids.box).innerHTML = "";
            return;
        }
        const rows = plan.fixes.map((fix) => {
            const list = fix.additions.map((addition) => RecentBlockList.whenText(addition.at) + " " + (addition.win ? "승" : "패") + (addition.mvp ? "·MVP" : "") + (addition.left ? "(나감)" : "") + (addition.countsStats ? "" : "(AI 판)")).join(", ");
            return "<tr><td>" + AccountHtml.esc(fix.name) + "</td><td>" + fix.additions.length + "</td><td>" + AccountHtml.esc(list) + "</td></tr>";
        });
        const skipRows = plan.skips.map((skip) => "<tr><td>" + AccountHtml.esc(skip.name) + "</td><td>-</td><td>" + AccountHtml.esc(skip.reason) + "</td></tr>");
        this.el(this.ids.box).innerHTML = "<p>" + AccountHtml.esc(summary) + "</p>" +
            (rows.length || skipRows.length ? "<table><thead><tr><th>학생</th><th>판</th><th>채울 판 / 건너뛴 까닭</th></tr></thead><tbody>" + rows.join("") + skipRows.join("") + "</tbody></table>" : "");
    }
}
