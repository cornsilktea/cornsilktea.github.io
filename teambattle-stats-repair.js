"use strict";
/* =====================================================================
   30번 팀 배틀 계정 통계 정상화(2026-10-29 선생님 요청) — 교사 제어판(admin.html) 전용

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
                if (fix.has(match.key))
                    return;
                if (!fix.fitsRecent(match.at))
                    return skip("이 학생의 최근 20매치보다 오래된 판이라 이미 센 판인지 알 수 없음");
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
class TeamBattleRepairPanel {
    constructor(io, ids) {
        this.io = io;
        this.ids = ids;
        this.plan = null;
    }
    bind() {
        this.el(this.ids.check).addEventListener("click", () => { void this.preview(); });
        this.el(this.ids.apply).addEventListener("click", () => { void this.apply(); });
    }
    el(id) {
        return document.getElementById(id);
    }
    includeLeft() {
        return (this.el(this.ids.left)).checked;
    }
    say(text) {
        this.el(this.ids.msg).textContent = text;
    }
    async load() {
        const users = (await this.io.read("users"));
        return new TeamBattleRepairPlanner(this.includeLeft()).plan(users || {});
    }
    async preview() {
        const apply = this.el(this.ids.apply);
        apply.disabled = true;
        this.say("학생 기록을 읽는 중…");
        try {
            this.plan = await this.load();
            this.render(this.plan);
            apply.disabled = this.plan.fixes.length === 0;
            this.say(this.plan.fixes.length ? "아래 내용을 확인하고 '적용'을 누르면 학생 통계에 채워 넣습니다." : "빠진 기록이 없습니다.");
        }
        catch (error) {
            this.say("읽지 못했습니다: " + (error instanceof Error ? error.message : String(error)));
        }
    }
    async apply() {
        const apply = this.el(this.ids.apply);
        if (!this.plan || !confirm("학생 " + this.plan.fixes.length + "명의 30번 통계에 빠진 판 " + this.plan.addedLines.length + "개를 채워 넣을까요?"))
            return;
        apply.disabled = true;
        this.say("다시 읽고 적용하는 중…");
        try {
            const fresh = await this.load();
            const values = fresh.patch();
            if (Object.keys(values).length)
                await this.io.patch(values);
            this.render(fresh);
            this.plan = null;
            this.say("적용했습니다: 학생 " + fresh.fixes.length + "명, 판 " + fresh.addedLines.length + "개. 반 별 통계를 새로고침하면 보입니다.");
        }
        catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            this.say("적용하지 못했습니다(" + text + "). 데이터베이스규칙.json 을 Firebase 콘솔에 다시 게시했는지 확인해 주세요.");
            apply.disabled = false;
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
            (plan.skips.length ? " · 건너뜀 " + plan.skips.length + "줄" : "");
        const rows = plan.fixes.map((fix) => {
            const list = fix.additions.map((addition) => RecentBlockList.whenText(addition.at) + " " + (addition.win ? "승" : "패") + (addition.mvp ? "·MVP" : "") + (addition.left ? "(나감)" : "") + (addition.countsStats ? "" : "(AI 판)")).join(", ");
            return "<tr><td>" + AccountHtml.esc(fix.name) + "</td><td>" + fix.additions.length + "</td><td>" + AccountHtml.esc(list) + "</td></tr>";
        });
        const skipRows = plan.skips.map((skip) => "<tr><td>" + AccountHtml.esc(skip.name) + "</td><td>-</td><td>" + AccountHtml.esc(skip.reason) + "</td></tr>");
        this.el(this.ids.box).innerHTML = "<p>" + AccountHtml.esc(summary) + "</p>" +
            (rows.length || skipRows.length ? "<table><thead><tr><th>학생</th><th>판</th><th>채울 판 / 건너뛴 까닭</th></tr></thead><tbody>" + rows.join("") + skipRows.join("") + "</tbody></table>" : "");
    }
}
