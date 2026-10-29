"use strict";
/* =====================================================================
   30번 팀 배틀 MVP 점수 공식 비교표(2026-10-29 선생님 요청) — 교사 제어판(admin.html) 전용, 읽기만 한다

   왜: 지금 환산점수는 회복·기절처럼 캐릭터가 원래 많이 쌓는 수치가 실력처럼 보인다(드루이드 승률 47%인데 평균 1위).
       공식을 바꾸기 전에, 학생들의 최근 20매치 결과표(판마다 6명 전체 기록)에 여러 공식을 똑같이 적용해 숫자로 비교한다.
       캐릭터 평균과 비교하는 공식은 잘하는 몇 명이 평균을 끌어올리고 자기 자신과 비교되는 문제가 있어 넣지 않았다(선생님 결정).

   하는 일:
     1. users 전체를 한 번 읽어 모든 학생의 최근 매치를 경기 열쇠로 묶는다(같은 판은 한 번만, TeamBattleRepairMatch 재사용).
        AI 가 있던 판·이긴 팀을 알 수 없는 판은 뺀다(누적 통계와 같은 기준).
     2. 공식마다 판별 점수·MVP(AccountMvpJudge — 게임과 같은 후보 규칙)를 다시 계산하고 세 가지를 잰다.
        - 학생 점수–승률 상관: 학생별 평균 점수가 그 학생 승률과 함께 움직이는 정도(실력 지표라면 높을수록 좋음)
        - 이긴 팀 MVP 비율
        - 캐릭터 편중(변동계수): 캐릭터별 평균 점수가 얼마나 벌어지는가(작을수록 캐릭터 덕을 덜 봄)
     3. 정상화 가능 여부 점검: 결과표 20칸이 다 찬 학생(오래된 판이 밀려났을 수 있음)과
        누적 판 수(g)가 AI 없는 결과표 수와 다른 학생을 보여 준다.
     4. 백업: 바꾸기 전에 30번 계정 통계·최근 매치·반 별 통계를 JSON 파일로 내려받는다.
   ===================================================================== */
class MvpLabMatch {
    constructor(key, players, winnerTeam, playerIds) {
        this.key = key;
        this.players = players;
        this.winnerTeam = winnerTeam;
        this.playerIds = playerIds;
    }
    teamTotal(team, pick) {
        return this.players.filter((line) => line.team === team).reduce((sum, line) => sum + pick(line), 0);
    }
    isWinner(line) {
        return line.team === this.winnerTeam;
    }
}
class MvpLabCollector {
    constructor(users) {
        this.matches = [];
        this.skippedAi = 0;
        this.skippedUnknown = 0;
        const byKey = {};
        Object.keys(users).forEach((uid) => {
            const slots = AccountShape.slots(users[uid]?.recent?.teambattle);
            Object.keys(slots).forEach((slot) => {
                const entry = TeamBattleCodec.decode(slots[slot]);
                if (!entry || !entry.id)
                    return;
                (byKey[entry.id] = byKey[entry.id] || new TeamBattleRepairMatch(entry.id)).add({ uid, raw: slots[slot], entry });
            });
        });
        const byNick = MvpLabCollector.uniqueNicks(users);
        Object.keys(byKey).map((key) => byKey[key]).sort((a, b) => a.at - b.at).forEach((match) => {
            const entry = match.source.entry;
            if (entry.withAi) {
                this.skippedAi++;
                return;
            }
            const winnerTeam = match.winnerTeam();
            if (winnerTeam < 0) {
                this.skippedUnknown++;
                return;
            }
            const ids = entry.players.map((line, index) => {
                const holder = match.holders.find((item) => item.entry.myIndex === index);
                return holder ? holder.uid : byNick[String(line.name || "").trim()] || "nick:" + line.name;
            });
            this.matches.push(new MvpLabMatch(match.key, entry.players, winnerTeam, ids));
        });
    }
    static uniqueNicks(users) {
        const seen = {};
        Object.keys(users).forEach((uid) => {
            const name = TeamBattleRepairNames.nameOf(users[uid] || {});
            if (name)
                (seen[TeamBattleRepairNames.nickOf(name)] = seen[TeamBattleRepairNames.nickOf(name)] || []).push(uid);
        });
        const unique = {};
        Object.keys(seen).forEach((nick) => { if (seen[nick].length === 1)
            unique[nick] = seen[nick][0]; });
        return unique;
    }
}
class MvpFormula {
    constructor(title, detail) {
        this.title = title;
        this.detail = detail;
    }
    score(line, match, winBonus) {
        return Math.round(this.raw(line, match) * (match.isWinner(line) ? 1 + winBonus : 1));
    }
}
class CurrentMvpFormula extends MvpFormula {
    constructor() {
        super("지금 식", MvpLabText.weights(MvpLabWeightSet.CURRENT));
    }
    raw(line) {
        return TeamBattleScore.of(line);
    }
}
class WeightedMvpFormula extends MvpFormula {
    constructor(title, weights, note) {
        super(title, MvpLabText.weights(weights) + note);
        this.weights = weights;
    }
    raw(line) {
        const w = this.weights;
        return line.kills * w.kill + line.assists * w.assist - line.deaths * w.death + line.dmg * w.dmg + line.heal * w.heal
            + line.blocked * w.blocked + line.stun * w.stunSec + line.slowWeight * w.slowSec;
    }
}
class TeamShareMvpFormula extends MvpFormula {
    constructor() {
        super("팀 비중", "킬 관여율 " + TeamShareMvpFormula.KILL_SHARE + " · 팀 피해 중 내 몫 " + TeamShareMvpFormula.DMG_SHARE +
            " · 팀 회복+막은 피해 중 내 몫 " + TeamShareMvpFormula.SUPPORT_SHARE + " · 팀 기절·둔화 중 내 몫 " + TeamShareMvpFormula.CC_SHARE +
            " − 팀 쓰러짐 중 내 몫 " + TeamShareMvpFormula.DEATH_SHARE + " (×" + TeamShareMvpFormula.SCALE + ")");
    }
    raw(line, match) {
        const share = (pick) => {
            const total = match.teamTotal(line.team, pick);
            return total > 0 ? pick(line) / total : 0;
        };
        const kills = match.teamTotal(line.team, (item) => item.kills);
        const involvement = kills > 0 ? Math.min(1, (line.kills + line.assists) / kills) : 0;
        return TeamShareMvpFormula.SCALE * (TeamShareMvpFormula.KILL_SHARE * involvement
            + TeamShareMvpFormula.DMG_SHARE * share((item) => item.dmg)
            + TeamShareMvpFormula.SUPPORT_SHARE * share((item) => item.heal + item.blocked)
            + TeamShareMvpFormula.CC_SHARE * share((item) => item.stun * TeamBattleScore.STUN_PER_SEC + item.slowWeight * TeamBattleScore.SLOW_PER_SEC)
            - TeamShareMvpFormula.DEATH_SHARE * share((item) => item.deaths));
    }
}
TeamShareMvpFormula.KILL_SHARE = 40;
TeamShareMvpFormula.DMG_SHARE = 30;
TeamShareMvpFormula.SUPPORT_SHARE = 15;
TeamShareMvpFormula.CC_SHARE = 15;
TeamShareMvpFormula.DEATH_SHARE = 20;
TeamShareMvpFormula.SCALE = 10;
class MvpLabWeightSet {
}
MvpLabWeightSet.CURRENT = {
    kill: TeamBattleScore.KILL, assist: TeamBattleScore.ASSIST, death: TeamBattleScore.DEATH, dmg: 1, heal: 1, blocked: 1,
    stunSec: TeamBattleScore.STUN_PER_SEC, slowSec: TeamBattleScore.SLOW_PER_SEC
};
MvpLabWeightSet.REWEIGHTED = Object.assign({}, MvpLabWeightSet.CURRENT, { assist: 80, heal: 0.7, stunSec: 40, slowSec: 20 });
/* 팀 처치 차이(블루 − 레드)를 피해·회복·막은 피해·기절·둔화의 팀 합계 차이로 설명하는 능형 회귀.
   승패는 처치 수로 정해지므로(MatchFlow.hostJudge) 승패 대신 처치 차이를 쓴다. 계수(처치 몇 개 분량)에 처치 점수 100 을 곱해 1당 점수로 바꾸고,
   음수(데이터가 적어 생긴 흔들림)는 0 으로 둔다. 처치·어시스트·쓰러짐 점수는 지금 식 그대로 */
class MvpWeightFitter {
    static fit(matches) {
        if (matches.length < MvpWeightFitter.MIN_MATCHES)
            return null;
        const rows = matches.map((match) => MvpWeightFitter.FEATURES.map((pick) => match.teamTotal(0, pick) - match.teamTotal(1, pick)));
        const target = matches.map((match) => match.teamTotal(0, (line) => line.kills) - match.teamTotal(1, (line) => line.kills));
        const size = MvpWeightFitter.FEATURES.length;
        const gram = MvpLabStats.zeros(size).map(() => MvpLabStats.zeros(size));
        const right = MvpLabStats.zeros(size);
        rows.forEach((row, r) => row.forEach((value, i) => {
            right[i] += value * target[r];
            row.forEach((other, j) => { gram[i][j] += value * other; });
        }));
        gram.forEach((row, i) => { row[i] = row[i] * (1 + MvpWeightFitter.RIDGE) || 1; });
        const beta = MvpLabStats.solve(gram, right);
        if (!beta)
            return null;
        const predicted = rows.map((row) => row.reduce((sum, value, i) => sum + value * beta[i], 0));
        const kill = TeamBattleScore.KILL;
        const point = (value) => Math.max(0, Math.round(value * kill * 100) / 100);
        return {
            weights: {
                kill, assist: TeamBattleScore.ASSIST, death: TeamBattleScore.DEATH,
                dmg: point(beta[0]), heal: point(beta[1]), blocked: point(beta[2]), stunSec: point(beta[3]), slowSec: point(beta[4])
            },
            rSquared: MvpLabStats.rSquared(target, predicted),
            matches: matches.length
        };
    }
}
MvpWeightFitter.MIN_MATCHES = 10;
MvpWeightFitter.RIDGE = 0.05;
MvpWeightFitter.FEATURES = [
    (line) => line.dmg, (line) => line.heal, (line) => line.blocked, (line) => line.stun, (line) => line.slowWeight
];
class MvpLabStats {
    static zeros(size) {
        return Array.from({ length: size }, () => 0);
    }
    static mean(values) {
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    }
    static sd(values) {
        const mean = MvpLabStats.mean(values);
        return values.length ? Math.sqrt(MvpLabStats.mean(values.map((value) => (value - mean) * (value - mean)))) : 0;
    }
    static pearson(xs, ys) {
        if (xs.length < 3)
            return null;
        const mx = MvpLabStats.mean(xs), my = MvpLabStats.mean(ys);
        let sxy = 0, sxx = 0, syy = 0;
        xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx); syy += (ys[i] - my) * (ys[i] - my); });
        return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
    }
    static rSquared(actual, predicted) {
        const mean = MvpLabStats.mean(actual);
        const total = actual.reduce((sum, value) => sum + (value - mean) * (value - mean), 0);
        const residual = actual.reduce((sum, value, i) => sum + (value - predicted[i]) * (value - predicted[i]), 0);
        return total > 0 ? 1 - residual / total : 0;
    }
    /* 가우스 소거(부분 피벗). 풀 수 없으면 null */
    static solve(matrix, vector) {
        const n = vector.length;
        const a = matrix.map((row, i) => row.slice().concat([vector[i]]));
        for (let col = 0; col < n; col++) {
            let pivot = col;
            for (let row = col + 1; row < n; row++)
                if (Math.abs(a[row][col]) > Math.abs(a[pivot][col]))
                    pivot = row;
            if (Math.abs(a[pivot][col]) < 1e-12)
                return null;
            [a[col], a[pivot]] = [a[pivot], a[col]];
            for (let row = 0; row < n; row++) {
                if (row === col)
                    continue;
                const factor = a[row][col] / a[col][col];
                for (let k = col; k <= n; k++)
                    a[row][k] -= factor * a[col][k];
            }
        }
        return a.map((row, i) => row[n] / row[i]);
    }
}
class MvpFormulaReport {
    constructor(formula, matches, winBonus) {
        this.formula = formula;
        this.chars = {};
        this.mvpPicks = 0;
        this.mvpOnWinners = 0;
        this.noMvpMatches = 0;
        this.playerR = null;
        this.playerCount = 0;
        this.charR = null;
        this.charSpread = null;
        const players = {};
        matches.forEach((match) => {
            const scoreOf = (line) => this.formula.score(line, match, winBonus);
            const mvps = new AccountMvpJudge(scoreOf).winners(match.players);
            if (!mvps.length)
                this.noMvpMatches++;
            mvps.forEach((index) => { this.mvpPicks++; if (match.isWinner(match.players[index]))
                this.mvpOnWinners++; });
            match.players.forEach((line, index) => {
                if (line.ai)
                    return;
                const score = scoreOf(line), win = match.isWinner(line) ? 1 : 0;
                const char = this.chars[line.char] = this.chars[line.char] || { games: 0, wins: 0, scoreSum: 0, mvp: 0 };
                char.games++;
                char.wins += win;
                char.scoreSum += score;
                char.mvp += mvps.indexOf(index) >= 0 ? 1 : 0;
                const player = players[match.playerIds[index]] = players[match.playerIds[index]] || { games: 0, wins: 0, scoreSum: 0 };
                player.games++;
                player.wins += win;
                player.scoreSum += score;
            });
        });
        const regulars = Object.keys(players).map((id) => players[id]).filter((p) => p.games >= MvpFormulaReport.MIN_PLAYER_GAMES);
        this.playerCount = regulars.length;
        this.playerR = MvpLabStats.pearson(regulars.map((p) => p.scoreSum / p.games), regulars.map((p) => p.wins / p.games));
        const common = Object.keys(this.chars).map((id) => this.chars[id]).filter((c) => c.games >= MvpFormulaReport.MIN_CHAR_GAMES);
        const averages = common.map((c) => c.scoreSum / c.games);
        this.charR = MvpLabStats.pearson(averages, common.map((c) => c.wins / c.games));
        const mean = MvpLabStats.mean(averages);
        this.charSpread = common.length >= 2 && mean > 0 ? MvpLabStats.sd(averages) / mean : null;
    }
    get winnerMvpRate() {
        return AccountRates.ratio(this.mvpOnWinners, this.mvpPicks);
    }
}
MvpFormulaReport.MIN_PLAYER_GAMES = 3;
MvpFormulaReport.MIN_CHAR_GAMES = 5;
class MvpLabAudit {
    constructor(users) {
        this.rows = [];
        Object.keys(users).forEach((uid) => {
            const user = users[uid] || {};
            const entries = TeamBattleRing.entries(user.recent?.teambattle);
            const games = AccountStatsMath.normalize(user.stats?.teambattle).g;
            if (!entries.length && !games)
                return;
            const recentNoAi = entries.filter((entry) => !entry.withAi).length;
            this.rows.push({
                name: TeamBattleRepairNames.nameOf(user) || uid, games, recent: entries.length, recentNoAi,
                full: entries.length >= RecentMatchRing.SLOTS, mismatch: recentNoAi !== games
            });
        });
    }
    get flagged() {
        return this.rows.filter((row) => row.full || row.mismatch);
    }
}
class MvpLabBackup {
    static build(users, classStats, savedAt) {
        const picked = {};
        Object.keys(users).forEach((uid) => {
            const user = users[uid] || {};
            if (!user.stats?.teambattle && !user.recent?.teambattle && !user.pending?.teambattle)
                return;
            picked[uid] = {
                profile: { name: user.profile?.name ?? null, cls: user.profile?.cls ?? null },
                stats: { teambattle: user.stats?.teambattle ?? null },
                recent: { teambattle: user.recent?.teambattle ?? null },
                pending: { teambattle: user.pending?.teambattle ?? null }
            };
        });
        return { game: "teambattle", savedAt: new Date(savedAt).toISOString(), users: picked, classStats: classStats ?? null };
    }
    static fileName(savedAt) {
        const d = new Date(savedAt);
        const two = (value) => String(value).padStart(2, "0");
        return "teambattle-backup-" + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + "-" + two(d.getHours()) + two(d.getMinutes()) + ".json";
    }
    static download(data, name) {
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
class MvpLabText {
    static weights(w) {
        const parts = [
            ["처치", w.kill], ["어시스트", w.assist], ["피해 1당", w.dmg], ["회복 1당", w.heal], ["막은 피해 1당", w.blocked], ["기절 1초당", w.stunSec], ["둔화 1초×둔화율당", w.slowSec]
        ];
        return parts.map((part) => part[0] + " " + MvpLabText.num(part[1])).join(" · ") + " − 쓰러짐 " + MvpLabText.num(w.death);
    }
    static num(value) {
        return String(Math.round(value * 100) / 100);
    }
    static pct(value) {
        return value == null ? "—" : (value * 100).toFixed(0) + "%";
    }
    static corr(value) {
        return value == null ? "—" : value.toFixed(2);
    }
}
class MvpLabPanel {
    constructor(io, labelOf, ids) {
        this.io = io;
        this.labelOf = labelOf;
        this.ids = ids;
        this.users = null;
    }
    bind() {
        const bonus = this.el(this.ids.bonus);
        bonus.innerHTML = MvpLabPanel.BONUSES.map((value) => '<option value="' + value + '">' + (value ? "이긴 팀 +" + Math.round(value * 100) + "%" : "승리 보너스 없음") + "</option>").join("");
        bonus.addEventListener("change", () => { if (this.users)
            this.render(this.users); });
        this.el(this.ids.compare).addEventListener("click", () => { void this.compare(); });
        this.el(this.ids.backup).addEventListener("click", () => { void this.backup(); });
    }
    el(id) {
        return document.getElementById(id);
    }
    say(text) {
        this.el(this.ids.msg).textContent = text;
    }
    async readUsers() {
        return (await this.io.read("users")) || {};
    }
    async compare() {
        this.say("학생 기록을 읽는 중…");
        try {
            this.users = await this.readUsers();
            this.render(this.users);
            this.say("");
        }
        catch (error) {
            this.say("읽지 못했습니다: " + (error instanceof Error ? error.message : String(error)));
        }
    }
    async backup() {
        this.say("백업할 기록을 읽는 중…");
        try {
            const users = await this.readUsers();
            const classStats = await this.io.read("classStats");
            const savedAt = Date.now();
            const data = MvpLabBackup.build(users, classStats, savedAt);
            MvpLabBackup.download(data, MvpLabBackup.fileName(savedAt));
            this.say("백업 파일을 내려받았습니다: 학생 " + Object.keys(data.users).length + "명. 안전한 곳에 보관해 주세요.");
        }
        catch (error) {
            this.say("백업하지 못했습니다: " + (error instanceof Error ? error.message : String(error)));
        }
    }
    formulas(matches) {
        const fit = MvpWeightFitter.fit(matches);
        const list = [
            new CurrentMvpFormula(),
            new WeightedMvpFormula("가중치 조정", MvpLabWeightSet.REWEIGHTED, "")
        ];
        if (fit)
            list.push(new WeightedMvpFormula("승리 기여도 가중치", fit.weights, " (결과표 " + fit.matches + "판으로 계산, 설명력 R² " + fit.rSquared.toFixed(2) + ")"));
        list.push(new TeamShareMvpFormula());
        return { list, fit };
    }
    render(users) {
        const bonus = Number(this.el(this.ids.bonus).value) || 0;
        const collected = new MvpLabCollector(users);
        const audit = new MvpLabAudit(users);
        const { list, fit } = this.formulas(collected.matches);
        const reports = list.map((formula) => new MvpFormulaReport(formula, collected.matches, bonus));
        this.el(this.ids.box).innerHTML = this.auditHtml(audit) +
            "<p>비교한 판: " + collected.matches.length + "판(AI 판 " + collected.skippedAi + " · 이긴 팀을 알 수 없는 판 " + collected.skippedUnknown + " 제외)" +
            (fit ? "" : " · 판이 " + MvpWeightFitter.MIN_MATCHES + "개보다 적어 '승리 기여도 가중치'는 빼었습니다") + "</p>" +
            this.summaryHtml(reports) + this.charHtml(reports);
    }
    auditHtml(audit) {
        const flagged = audit.flagged;
        const head = "<p><b>정상화 가능 여부</b>: 기록이 있는 학생 " + audit.rows.length + "명 중 " +
            (flagged.length ? "확인이 필요한 학생 " + flagged.length + "명(아래 표). 나머지는 결과표로 누적 통계를 다시 만들 수 있습니다." : "모두 결과표 20칸 미만이고 누적 판 수와 결과표 수가 같아, 결과표로 누적 통계를 다시 만들 수 있습니다.") + "</p>";
        if (!flagged.length)
            return head;
        const rows = flagged.map((row) => "<tr><td>" + AccountHtml.esc(row.name) + "</td><td>" + row.games + "</td><td>" + row.recentNoAi + " / " + row.recent + "</td><td>" +
            [row.full ? "결과표 20칸이 다 참(오래된 판이 밀려났을 수 있음)" : "", row.mismatch ? "누적 판 수와 AI 없는 결과표 수가 다름" : ""].filter(Boolean).join(" · ") + "</td></tr>").join("");
        return head + "<table><thead><tr><th>학생</th><th>누적 판</th><th>결과표(AI 없음 / 전체)</th><th>까닭</th></tr></thead><tbody>" + rows + "</tbody></table>";
    }
    summaryHtml(reports) {
        const rows = reports.map((report) => "<tr><td>" + AccountHtml.esc(report.formula.title) + "</td>" +
            "<td>" + MvpLabText.corr(report.playerR) + "<small>" + report.playerCount + "명</small></td>" +
            "<td>" + MvpLabText.pct(report.winnerMvpRate) + "<small>MVP 없는 판 " + report.noMvpMatches + "</small></td>" +
            "<td>" + MvpLabText.corr(report.charR) + "</td>" +
            "<td>" + (report.charSpread == null ? "—" : report.charSpread.toFixed(2)) + "</td></tr>").join("");
        const details = reports.map((report) => "<li><b>" + AccountHtml.esc(report.formula.title) + "</b>: " + AccountHtml.esc(report.formula.detail) + "</li>").join("");
        return "<table><thead><tr><th>공식</th><th>학생 점수–승률 상관<small>높을수록 좋음</small></th><th>이긴 팀 MVP 비율</th>" +
            "<th>캐릭터 점수–승률 상관<small>높을수록 좋음</small></th><th>캐릭터 편중<small>낮을수록 좋음</small></th></tr></thead><tbody>" + rows + "</tbody></table>" +
            "<ul>" + details + "</ul><ul><li>상관은 −1~1 입니다. 1에 가까울수록 점수가 높은 학생(캐릭터)이 실제로 더 많이 이겼다는 뜻입니다. 학생은 " + MvpFormulaReport.MIN_PLAYER_GAMES + "판 이상, 캐릭터는 " + MvpFormulaReport.MIN_CHAR_GAMES + "판 이상만 셉니다.</li>" +
            "<li>캐릭터 편중은 캐릭터별 평균 점수의 표준편차 ÷ 평균입니다. 높으면 어떤 캐릭터를 골랐는지가 점수를 크게 좌우합니다.</li>" +
            "<li>승리 보너스를 켜면 이긴 쪽 점수가 올라가므로 상관·이긴 팀 MVP 비율은 당연히 올라갑니다. 공식끼리는 같은 보너스에서 비교해 주세요.</li>" +
            "<li>자기 회복(드루이드 부쉬 회복 등)은 결과표에 회복 합계로만 남아 있어 따로 뺄 수 없습니다.</li></ul>";
    }
    charHtml(reports) {
        const base = reports[0];
        const ids = Object.keys(base.chars).sort((a, b) => base.chars[b].games - base.chars[a].games);
        const rows = ids.map((id) => {
            const c = base.chars[id];
            return "<tr><td>" + AccountHtml.esc(this.labelOf(id)) + "</td><td>" + c.games + "</td><td>" + AccountHtml.percent(c.wins, c.games) + "</td>" +
                reports.map((report) => {
                    const r = report.chars[id];
                    return "<td><b>" + AccountHtml.percent(r.mvp, r.games) + "</b><small>" + Math.round(r.scoreSum / r.games) + "점</small></td>";
                }).join("") + "</tr>";
        }).join("");
        return "<h4>캐릭터별 MVP율·평균 점수</h4><table><thead><tr><th>캐릭터</th><th>판</th><th>승률</th>" +
            reports.map((report) => "<th>" + AccountHtml.esc(report.formula.title) + "</th>").join("") + "</tr></thead><tbody>" + rows + "</tbody></table>" +
            "<p><small>승률이 높은 캐릭터의 MVP율이 높고, 승률이 낮은 캐릭터의 MVP율이 낮을수록 실력을 잘 반영하는 공식입니다.</small></p>";
    }
}
MvpLabPanel.BONUSES = [0, 0.1, 0.15, 0.2];
