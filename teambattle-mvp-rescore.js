"use strict";
/* =====================================================================
   30번 MVP 점수 v3 다시 계산(2026-10-29 선생님 요청) — 교사 제어판(admin.html) 전용

   왜: v3 패치에서 MVP 환산점수 식을 바꿨다(TeamBattleScore — 어시스트 80·회복 0.7·기절 40·둔화 20).
       최근 매치·결과표는 열 때마다 새 식으로 다시 계산되지만, 학생 계정 통계에 쌓인 MVP 수·평균 MVP 점수와
       전체 캐릭터 통계(v2)의 평균 MVP 점수는 옛 식 값이라 새 식으로 고쳐 쓴다.

   학생 계정(users/<uid>/stats/teambattle, classStats):
     - 그 학생의 최근 20매치 결과표에 누적 통계에 들어간 판(AI 없는 판)이 모두 남아 있을 때만 고친다
       (결과표 수 = 누적 판 수 g, 캐릭터별로도 같음). 판마다 6명 기록이 다 있으므로 새 식으로 MVP 를 다시 판정해
       MVP 수(m, 캐릭터별 m)와 평균 MVP 점수(sc, scn = 판 수)를 처음부터 다시 센다. 처음부터 세므로 여러 번 눌러도 같은 값이다.
     - 판이 빠진 학생(20칸이 넘어 밀려났거나 기록이 어긋난 학생)은 건드리지 않고 목록에 이유를 보여 준다.
   전체 캐릭터 통계 v2(teambattle/patchstats/v2/<캐릭터>/mvp):
     - 판별 기록이 없어 평균값으로 고친다. 둔화 가중치 평균은 저장되지 않아 옛 평균 MVP 점수에서 거꾸로 구한다(추정).
     - 한 번만 고치도록 portal/migrations/teambattleMvpV3/v2At 에 시각을 같은 PATCH 로 남긴다(portal 은 교사만 쓰고 누구나 읽음, uid 없음).
     - v1(modestats/cup)에는 MVP 점수가 처음부터 저장되지 않아 고칠 것이 없다. v3 는 새 식으로 쌓인다.
   미리 보기 → 적용 순서이고, 적용 직전에 다시 읽어 계산한다.
   ===================================================================== */
class MvpRescoreStudent {
    constructor(uid, user) {
        this.uid = uid;
        this.user = user;
        this.changes = [];
        this.skipReason = "";
        this.node = AccountStatsMath.normalize(user.stats?.teambattle);
        this.mBefore = this.node.m;
        this.rescore();
    }
    get name() {
        return TeamBattleRepairNames.nameOf(this.user) || this.uid;
    }
    get changed() {
        return !this.skipReason && (this.node.m !== this.mBefore || this.changes.some((c) => c.mBefore !== c.mAfter || c.scBefore !== c.scAfter));
    }
    patch() {
        const values = { ["users/" + this.uid + "/stats/teambattle"]: this.node };
        if (TeamBattleRepairNames.ADMIN_UIDS.indexOf(this.uid) < 0) {
            const classKey = TeamBattleRepairNames.classOf(this.user);
            values["classStats/" + classKey + "/" + this.uid] = ClassStatsSummary.build(this.name, this.node);
        }
        return values;
    }
    rescore() {
        const counted = MvpRescoreStudent.uniqueById(TeamBattleRing.entries(this.user.recent?.teambattle).filter((entry) => !entry.withAi));
        if (!this.node.g) {
            this.skipReason = "누적 판 없음";
            return;
        }
        if (counted.length !== this.node.g) {
            this.skipReason = "누적 " + this.node.g + "판 중 결과표가 " + counted.length + "판만 남아 있음";
            return;
        }
        const byChar = {};
        counted.forEach((entry) => { const char = entry.players[entry.myIndex].char; (byChar[char] = byChar[char] || []).push(entry); });
        const chars = this.node.c || {};
        const wrong = Object.keys(chars).filter((char) => (byChar[char] || []).length !== chars[char].n);
        if (wrong.length) {
            this.skipReason = "캐릭터별 판 수가 결과표와 다름(" + wrong.join(", ") + ")";
            return;
        }
        const judge = new AccountMvpJudge((line) => TeamBattleScore.of(line));
        const isMvp = (entry) => !entry.players[entry.myIndex].left && judge.isMvp(entry.players, entry.myIndex);
        this.node.m = counted.filter(isMvp).length;
        Object.keys(chars).forEach((char) => {
            const list = byChar[char], c = chars[char];
            const scores = list.map((entry) => TeamBattleScore.of(entry.players[entry.myIndex]));
            const change = { char, mBefore: c.m, mAfter: list.filter(isMvp).length, scBefore: c.sc, scAfter: AccountNumbers.oneDecimal(scores.reduce((a, b) => a + b, 0) / scores.length) };
            c.m = change.mAfter;
            c.sc = change.scAfter;
            c.scn = list.length;
            this.changes.push(change);
        });
    }
    static uniqueById(entries) {
        const seen = new Set();
        return entries.filter((entry) => { if (seen.has(entry.id))
            return false; seen.add(entry.id); return true; });
    }
}
/* 평균값으로 옛 식 → 새 식. 둔화 몫 = 옛 평균 − (둔화를 뺀 옛 식 항목들), 새 식에서는 둔화 1초당 점수 비율만큼 줄인다 */
class MvpRescorePatchStats {
    static rescore(raw) {
        const rows = AccountShape.slots(raw);
        return Object.keys(rows).filter((char) => rows[char] && typeof rows[char] === "object").map((char) => {
            const d = rows[char];
            const num = (value) => Number(value) || 0;
            if (!num(d.mvpPicks) || !num(d.kdPicks))
                return null;
            const before = num(d.mvp);
            const common = num(d.kills) * TeamBattleScore.KILL + num(d.dmg) + num(d.block) - num(d.deaths) * TeamBattleScore.DEATH;
            const legacyRest = common + num(d.assist) * LegacyTeamBattleScore.ASSIST + num(d.heal) + num(d.stun) * LegacyTeamBattleScore.STUN_PER_SEC;
            const slowSeconds = Math.max(0, before - legacyRest) / LegacyTeamBattleScore.SLOW_PER_SEC;
            const after = common + num(d.assist) * TeamBattleScore.ASSIST + num(d.heal) * TeamBattleScore.HEAL + num(d.stun) * TeamBattleScore.STUN_PER_SEC + slowSeconds * TeamBattleScore.SLOW_PER_SEC;
            return { char, before, after: AccountNumbers.oneDecimal(after) };
        }).filter((row) => !!row);
    }
    static patch(rows, at) {
        const values = { [MvpRescorePatchStats.LEDGER]: at };
        rows.forEach((row) => { values[MvpRescorePatchStats.PATH + "/" + row.char + "/mvp"] = row.after; });
        return values;
    }
}
MvpRescorePatchStats.PATH = "teambattle/patchstats/v2";
MvpRescorePatchStats.LEDGER = "portal/migrations/teambattleMvpV3/v2At";
class MvpRescorePlan {
    constructor(users, patchStats, ledgerAt) {
        this.students = [];
        this.patchRows = [];
        this.patchDoneAt = 0;
        Object.keys(users).forEach((uid) => {
            const user = users[uid] || {};
            if (user.stats?.teambattle)
                this.students.push(new MvpRescoreStudent(uid, user));
        });
        this.patchDoneAt = Number(ledgerAt) || 0;
        if (!this.patchDoneAt)
            this.patchRows = MvpRescorePatchStats.rescore(patchStats);
    }
    get changedStudents() {
        return this.students.filter((student) => student.changed);
    }
    get skippedStudents() {
        return this.students.filter((student) => !!student.skipReason);
    }
    patch(at) {
        const values = Object.assign({}, ...this.changedStudents.map((student) => student.patch()));
        if (this.patchRows.length)
            Object.assign(values, MvpRescorePatchStats.patch(this.patchRows, at));
        return values;
    }
}
class MvpRescorePanel {
    constructor(io, labelOf, ids) {
        this.io = io;
        this.labelOf = labelOf;
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
    say(text) {
        this.el(this.ids.msg).textContent = text;
    }
    async load() {
        const users = (await this.io.read("users")) || {};
        const ledgerAt = await this.io.read(MvpRescorePatchStats.LEDGER);
        const patchStats = ledgerAt ? null : await this.io.read(MvpRescorePatchStats.PATH);
        return new MvpRescorePlan(users, patchStats, ledgerAt);
    }
    async preview() {
        const apply = this.el(this.ids.apply);
        apply.disabled = true;
        this.say("학생 기록과 전체 통계를 읽는 중…");
        try {
            this.plan = await this.load();
            this.render(this.plan);
            const work = this.plan.changedStudents.length + this.plan.patchRows.length;
            apply.disabled = work === 0;
            this.say(work ? "아래 내용을 확인하고 '적용'을 누르면 새 MVP 점수로 고쳐 씁니다. 먼저 'MVP 점수 공식 비교' 칸의 백업을 받아 두세요." : "고칠 것이 없습니다.");
        }
        catch (error) {
            this.say("읽지 못했습니다: " + MvpRescorePanel.errorText(error));
        }
    }
    async apply() {
        const apply = this.el(this.ids.apply);
        if (!this.plan || !confirm("학생 " + this.plan.changedStudents.length + "명의 MVP 수·평균 MVP 점수" + (this.plan.patchRows.length ? "와 전체 통계 v2 평균 MVP 점수" : "") + "를 새 식으로 고칠까요?"))
            return;
        apply.disabled = true;
        this.say("다시 읽고 적용하는 중…");
        try {
            const fresh = await this.load();
            const values = fresh.patch(Date.now());
            if (Object.keys(values).length)
                await this.io.patch(values);
            this.render(fresh);
            this.plan = null;
            this.say("적용했습니다: 학생 " + fresh.changedStudents.length + "명" + (fresh.patchRows.length ? ", 전체 통계 v2 캐릭터 " + fresh.patchRows.length + "개" : "") + ". 반 별 통계를 새로고침하면 보입니다.");
        }
        catch (error) {
            this.say("적용하지 못했습니다(" + MvpRescorePanel.errorText(error) + "). 데이터베이스규칙.json 을 Firebase 콘솔에 다시 게시했는지 확인해 주세요.");
            apply.disabled = false;
        }
    }
    render(plan) {
        const changed = plan.changedStudents, skipped = plan.skippedStudents;
        const rows = changed.map((student) => "<tr><td>" + AccountHtml.esc(student.name) + "</td><td>" + student.mBefore + " → <b>" + student.node.m + "</b></td><td>" +
            AccountHtml.esc(student.changes.filter((c) => c.mBefore !== c.mAfter || c.scBefore !== c.scAfter)
                .map((c) => this.labelOf(c.char) + " MVP " + c.mBefore + "→" + c.mAfter + " · 평균 " + Math.round(c.scBefore) + "→" + Math.round(c.scAfter)).join(" / ")) + "</td></tr>").join("");
        const skipRows = skipped.map((student) => "<tr><td>" + AccountHtml.esc(student.name) + "</td><td>-</td><td>" + AccountHtml.esc(student.skipReason) + "</td></tr>").join("");
        const patchRows = plan.patchRows.map((row) => "<tr><td>" + AccountHtml.esc(this.labelOf(row.char)) + "</td><td>" + Math.round(row.before) + " → <b>" + Math.round(row.after) + "</b></td></tr>").join("");
        this.el(this.ids.box).innerHTML =
            "<p><b>학생 계정</b>: 30번 기록이 있는 학생 " + plan.students.length + "명 중 바뀌는 학생 " + changed.length + "명" + (skipped.length ? " · 고치지 못하는 학생 " + skipped.length + "명" : "") + "</p>" +
                (rows || skipRows ? "<table><thead><tr><th>학생</th><th>MVP 수</th><th>바뀌는 캐릭터 / 고치지 못하는 까닭</th></tr></thead><tbody>" + rows + skipRows + "</tbody></table>" : "") +
                "<p><b>전체 캐릭터 통계 v2</b>: " + (plan.patchDoneAt ? RecentBlockList.whenText(plan.patchDoneAt) + "에 이미 고쳤습니다." : patchRows ? "평균 MVP 점수(추정)" : "고칠 캐릭터가 없습니다.") + "</p>" +
                (patchRows ? "<table><thead><tr><th>캐릭터</th><th>평균 MVP 점수</th></tr></thead><tbody>" + patchRows + "</tbody></table>" : "") +
                "<p><small>v1 에는 MVP 점수가 저장되지 않았고, v3 는 처음부터 새 식으로 쌓입니다. 최근 매치·결과표의 점수와 MVP 표시는 열 때마다 새 식으로 다시 계산됩니다.</small></p>";
    }
    static errorText(error) {
        return error instanceof Error ? error.message : String(error);
    }
}
