"use strict";
class BbStatsKeys {
    static batKey(abilities) { return abilities.contact + "-" + abilities.power + "-" + abilities.speed + "-" + abilities.defense; }
    static pitKey(abilities) { return abilities.control + "-" + abilities.power + "-" + abilities.breaking + "-" + abilities.stamina; }
    static grouped(sheets, slots, keyOf, empty, used, keys) {
        const groups = {};
        (slots || []).forEach((counts, index) => {
            const sheet = sheets[index];
            if (!sheet || !counts || !used(counts))
                return;
            const key = keyOf(sheet);
            groups[key] = BbStatsMath.addCounts(groups[key] || empty(), counts, keys);
        });
        return groups;
    }
}
BbStatsKeys.GAME = "baseballduel";
BbStatsKeys.BAT = ["pa", "ab", "h", "d2", "d3", "hr", "bb", "k", "sf", "rbi", "r", "roe"];
BbStatsKeys.PIT = ["bf", "ab", "h", "d2", "d3", "hr", "bb", "k", "sf", "outs", "r", "er", "pitches", "strikes"];
BbStatsKeys.RECORD = ["g", "w", "l", "t", "rf", "ra"];
BbStatsKeys.PITCHES = ["ft", "cv", "sl", "ch", "kn"];
BbStatsKeys.ABILITY_KEY = /^[1-7]-[1-7]-[1-7](-[1-7])?$/;
class BbResultColumns {
    static batLine(counts) { return BbResultColumns.BAT.map(([, key]) => AccountNumbers.count(counts[key])); }
    static pitLine(counts) { return BbResultColumns.PIT.map(([, key]) => AccountNumbers.count(counts[key])); }
    static pitCell(index, value) { return BbResultColumns.PIT[index][1] === "outs" ? Math.floor(value / 3) + "." + value % 3 : String(value); }
}
BbResultColumns.BAT = [["타수", "ab"], ["안타", "h"], ["2루타", "d2"], ["3루타", "d3"], ["홈런", "hr"], ["볼넷", "bb"], ["삼진", "k"], ["득점", "r"]];
BbResultColumns.PIT = [["이닝", "outs"], ["투구 수", "pitches"], ["피안타", "h"], ["피홈런", "hr"], ["볼넷", "bb"], ["삼진", "k"], ["실점", "r"], ["자책", "er"]];
class BbBoxTable {
    static ensureStyle() {
        if (typeof document === "undefined" || document.getElementById(BbBoxTable.STYLE_ID))
            return;
        const style = document.createElement("style");
        style.id = BbBoxTable.STYLE_ID;
        style.textContent = BbBoxTable.STYLE;
        document.head.appendChild(style);
    }
    static sheetOf(report) {
        return {
            names: report.names, me: report.me, startInning: report.startInning, lineScore: report.lineScore, score: report.score,
            lines: [0, 1].map((team) => ({ bat: BbResultColumns.batLine(report.box[team].bat), pit: BbResultColumns.pitLine(report.box[team].pit) })),
            bestDistance: Math.round(Math.max(report.box[0].bestDistance, report.box[1].bestDistance)),
            bestPitch: Math.round(Math.max(report.box[0].bestPitch, report.box[1].bestPitch))
        };
    }
    static html(sheet, withScore = true) {
        BbBoxTable.ensureStyle();
        const esc = AccountHtml.esc, names = sheet.names, innings = Array.from({ length: BbBoxTable.BOARD_INNINGS }, (unused, index) => index + 1);
        const score = withScore ? '<div class="bbx-score">' + esc(names[0]) + " <b>" + sheet.score[0] + "</b> : <b>" + sheet.score[1] + "</b> " + esc(names[1]) + "</div>" : "";
        const head = "<tr><th></th>" + innings.map((inning) => "<th>" + inning + "</th>").join("") + '<th class="bbx-total">R</th></tr>';
        const body = [0, 1].map((team) => '<tr><td class="bbx-name">' + esc(names[team]) + "</td>" + innings.map((inning) => BbBoxTable.inningCell(sheet, inning, team)).join("") + '<td class="bbx-total">' + sheet.score[team] + "</td></tr>").join("");
        const rows = [0, 1].map((team) => BbBoxTable.row(names[team], team === 0 ? "초 공격 · 타격" : "말 공격 · 타격", BbResultColumns.BAT.map(([label]) => label), sheet.lines[team].bat.map(String), sheet.me === team)
            + BbBoxTable.row(names[team], "투구", BbResultColumns.PIT.map(([label]) => label), sheet.lines[team].pit.map((value, index) => BbResultColumns.pitCell(index, value)), sheet.me === team)).join("");
        const facts = '<div class="bbx-facts"><span>최장 비거리 <b>' + (sheet.bestDistance ? sheet.bestDistance + "m" : "-") + "</b></span><span>최고 구속 <b>" + (sheet.bestPitch ? sheet.bestPitch + "km/h" : "-") + "</b></span></div>";
        return '<div class="bbx">' + score + '<table class="bbx-line"><thead>' + head + "</thead><tbody>" + body + '</tbody></table><div class="bbx-rows">' + rows + "</div>" + facts + "</div>";
    }
    static inningCell(sheet, inning, team) {
        const index = inning - sheet.startInning;
        if (index < 0)
            return "<td>0</td>";
        const played = sheet.lineScore[index];
        return played ? "<td>" + played[team] + "</td>" : '<td class="bbx-unplayed">' + BbBoxTable.UNPLAYED + "</td>";
    }
    static row(name, role, labels, values, mine) {
        return '<div class="bbx-row' + (mine ? " mine" : "") + '"><span class="bbx-who"><b>' + AccountHtml.esc(name) + "</b><small>" + role + "</small></span>"
            + labels.map((label, index) => '<span class="bbx-cell"><small>' + label + "</small><b>" + values[index] + "</b></span>").join("") + "</div>";
    }
}
BbBoxTable.STYLE_ID = "bbxStyle";
BbBoxTable.STYLE = [
    ".bbx{display:flex;flex-direction:column;gap:8px;font-family:var(--sg-font,'Nanum Gothic','Malgun Gothic',sans-serif);color:#EEF2EE;}",
    ".bbx-score{display:flex;align-items:center;justify-content:center;gap:10px;font-size:20px;font-weight:800;}",
    ".bbx-score b{font-size:30px;color:#F4F1E8;}",
    ".bbx-line{width:100%;border-collapse:collapse;font-size:13px;text-align:center;font-variant-numeric:tabular-nums;}",
    ".bbx-line th,.bbx-line td{padding:4px 2px;border-bottom:1px solid rgba(255,255,255,.12);}",
    ".bbx-line th{color:#A3B0A6;font-weight:700;}.bbx-line td.bbx-name{text-align:left;font-weight:800;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;padding-right:6px;}",
    ".bbx-line td.bbx-unplayed{color:#6F7C73;}",
    ".bbx-line .bbx-total{width:44px;background:rgba(217,123,79,.3);color:#fff;font-weight:900;font-size:16px;}",
    ".bbx-line th.bbx-total{font-size:13px;color:#F4C7AE;}",
    ".bbx-rows{display:flex;flex-direction:column;gap:4px;}",
    ".bbx-row{display:grid;grid-template-columns:minmax(78px,1.4fr) repeat(8,minmax(0,1fr));align-items:center;gap:2px;padding:4px 6px;border-radius:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);}",
    ".bbx-row.mine{border-color:#D97B4F;background:rgba(217,123,79,.14);}",
    ".bbx-who{display:flex;flex-direction:column;min-width:0;}.bbx-who b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.bbx-who small{font-size:11px;color:#A3B0A6;}",
    ".bbx-cell{display:flex;flex-direction:column;align-items:center;min-width:0;}.bbx-cell small{font-size:10px;color:#A3B0A6;white-space:nowrap;}.bbx-cell b{font-size:15px;}",
    ".bbx-facts{display:flex;gap:14px;justify-content:center;font-size:13px;color:#CFD8D0;}.bbx-facts b{color:#F4F1E8;}",
    ".asd-wide .bbx-line{font-size:17px;}.asd-wide .bbx-line th{font-size:14px;}.asd-wide .bbx-line th,.asd-wide .bbx-line td{padding:7px 4px;}",
    ".asd-wide .bbx-line .bbx-total{width:64px;font-size:22px;}.asd-wide .bbx-line td.bbx-name{max-width:200px;}",
    ".asd-wide .bbx-row{padding:8px 12px;}.asd-wide .bbx-who b{font-size:16px;}.asd-wide .bbx-who small{font-size:12px;}",
    ".asd-wide .bbx-cell small{font-size:12px;}.asd-wide .bbx-cell b{font-size:20px;}.asd-wide .bbx-facts{font-size:15px;}"
].join("\n");
BbBoxTable.BOARD_INNINGS = 15;
BbBoxTable.UNPLAYED = "-";
class BbStatsPlan {
    constructor(report) {
        this.recordsRecent = report.rival && !AccountForfeit.leftEarly(report.iLeft, report.progress);
        this.countsStats = this.recordsRecent;
        this.tie = !report.iLeft && report.winner === -1;
        this.win = !report.iLeft && report.winner === report.me;
    }
}
class BbStatsCodec {
    static encode(report, key, win) {
        const sheet = BbBoxTable.sheetOf(report);
        return Object.assign(AccountRecentHeadCodec.encode(BbStatsCodec.VERSION, key, win), {
            t: new BbStatsPlan(report).tie ? 1 : 0, rd: report.random ? 1 : 0, me: report.me, st: report.startInning,
            n: sheet.names.map((name) => String(name || "").slice(0, BbStatsCodec.NAME_MAX)), s: sheet.score.map(AccountNumbers.count),
            ls: sheet.lineScore.slice(0, BbStatsCodec.INNINGS_MAX).map((inning) => [AccountNumbers.count(inning[0]), AccountNumbers.count(inning[1])]),
            b: sheet.lines.map((line) => line.bat), p: sheet.lines.map((line) => line.pit), bd: sheet.bestDistance, bs: sheet.bestPitch
        });
    }
    static decode(raw) {
        const head = AccountRecentHeadCodec.decode(raw, BbStatsCodec.VERSION);
        if (!head)
            return null;
        const stored = raw, numbers = (value) => AccountShape.list(value).map(AccountNumbers.count);
        const names = AccountShape.list(stored.n).map((name) => String(name || "")), score = numbers(stored.s), bats = AccountShape.list(stored.b).map(numbers), pits = AccountShape.list(stored.p).map(numbers);
        if (names.length !== 2 || score.length !== 2 || bats.length !== 2 || pits.length !== 2)
            return null;
        const lineScore = AccountShape.list(stored.ls).map((inning) => { const cells = numbers(inning); return [cells[0] || 0, cells[1] || 0]; });
        const me = stored.me === 1 ? 1 : 0;
        return {
            id: head.id, at: head.at, win: head.win, tie: stored.t === 1, random: stored.rd === 1,
            sheet: {
                names: [names[0], names[1]], me, startInning: AccountNumbers.count(stored.st) || 9, lineScore: lineScore.length ? lineScore : [[0, 0]], score: [score[0], score[1]],
                lines: [{ bat: bats[0], pit: pits[0] }, { bat: bats[1], pit: pits[1] }], bestDistance: AccountNumbers.count(stored.bd), bestPitch: AccountNumbers.count(stored.bs)
            }
        };
    }
}
BbStatsCodec.VERSION = 1;
BbStatsCodec.NAME_MAX = 20;
BbStatsCodec.INNINGS_MAX = 15;
class BbStatsMath {
    static emptyTally() { return { g: 0, w: 0, l: 0, t: 0, rf: 0, ra: 0, bat: BbBoxScoreBuilder.emptyBat(), pit: BbBoxScoreBuilder.emptyPit() }; }
    static empty() {
        return Object.assign(BbStatsMath.emptyTally(), {
            bt: BbBoxScoreBuilder.emptyTeam().byType, bd: 0, be: 0, bs: 0, zb: BbZoneGrid.emptyHitting(), zp: BbZoneGrid.emptyPitching(), ab: {}, ap: {}, ids: {}, rm: BbStatsMath.emptyTally()
        });
    }
    static counts(raw, keys, into) {
        const source = raw && typeof raw === "object" ? raw : {};
        keys.forEach((key) => { into[key] = AccountNumbers.count(source[key]); });
        return into;
    }
    static tally(raw) {
        const source = raw && typeof raw === "object" ? raw : {}, tally = BbStatsMath.emptyTally();
        BbStatsKeys.RECORD.forEach((key) => { tally[key] = AccountNumbers.count(source[key]); });
        tally.bat = BbStatsMath.counts(source.bat, BbStatsKeys.BAT, BbBoxScoreBuilder.emptyBat());
        tally.pit = BbStatsMath.counts(source.pit, BbStatsKeys.PIT, BbBoxScoreBuilder.emptyPit());
        return tally;
    }
    static normalize(raw) {
        const node = BbStatsMath.empty(), source = raw && typeof raw === "object" ? raw : {};
        Object.assign(node, BbStatsMath.tally(source));
        const types = source.bt && typeof source.bt === "object" ? source.bt : {};
        BbStatsKeys.PITCHES.forEach((id) => { node.bt[id] = BbStatsMath.counts(types[id], ["n", "s"], { n: 0, s: 0 }); });
        node.bd = AccountNumbers.count(source.bd);
        node.be = AccountNumbers.count(source.be);
        node.bs = AccountNumbers.count(source.bs);
        const zones = AccountShape.list(source.zb), pitched = AccountShape.list(source.zp);
        node.zb = node.zb.map((empty, index) => BbStatsMath.counts(zones[index], ["n", "ab", "h", "tb"], empty));
        node.zp = node.zp.map((unused, index) => AccountNumbers.count(pitched[index]));
        BbStatsMath.keyed(source.ab, (key, value) => { node.ab[key] = BbStatsMath.counts(value, ["g"].concat(BbStatsKeys.BAT), Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyBat())); });
        BbStatsMath.keyed(source.ap, (key, value) => { node.ap[key] = BbStatsMath.counts(value, ["g"].concat(BbStatsKeys.PIT), Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyPit())); });
        const ids = AccountShape.slots(source.ids);
        Object.keys(ids).forEach((key) => { node.ids[key] = Number(ids[key]) || 0; });
        node.rm = BbStatsMath.tally(source.rm);
        return node;
    }
    static keyed(raw, take) {
        const slots = AccountShape.slots(raw);
        Object.keys(slots).filter((key) => BbStatsKeys.ABILITY_KEY.test(key)).forEach((key) => take(key, slots[key]));
    }
    static addCounts(before, add, keys) {
        const after = Object.assign({}, before);
        keys.forEach((key) => { after[key] = AccountNumbers.count(before[key]) + AccountNumbers.count(add[key]); });
        return after;
    }
    static addTally(before, report, plan) {
        const mine = report.box[report.me];
        return {
            g: before.g + 1, w: before.w + (plan.win ? 1 : 0), l: before.l + (plan.win || plan.tie ? 0 : 1), t: before.t + (plan.tie ? 1 : 0),
            rf: before.rf + AccountNumbers.count(report.score[report.me]), ra: before.ra + AccountNumbers.count(report.score[report.me === 0 ? 1 : 0]),
            bat: BbStatsMath.addCounts(before.bat, mine.bat, BbStatsKeys.BAT), pit: BbStatsMath.addCounts(before.pit, mine.pit, BbStatsKeys.PIT)
        };
    }
    static apply(raw, report, plan, key, at) {
        const before = BbStatsMath.normalize(raw);
        if (before.ids[key] != null)
            return null;
        const mine = report.box[report.me], tally = BbStatsMath.addTally(before, report, plan);
        const node = Object.assign({}, before, tally, {
            bt: Object.assign({}, before.bt), zb: before.zb.map((cell, index) => BbStatsMath.addCounts(cell, mine.batZones[index] || { n: 0, ab: 0, h: 0, tb: 0 }, ["n", "ab", "h", "tb"])),
            zp: before.zp.map((count, index) => count + AccountNumbers.count(mine.pitZones[index])), ab: Object.assign({}, before.ab), ap: Object.assign({}, before.ap),
            bd: Math.max(before.bd, Math.round(mine.bestDistance)), be: Math.max(before.be, Math.round(mine.bestExit)), bs: Math.max(before.bs, Math.round(mine.bestPitch)),
            ids: Object.assign({}, before.ids), rm: report.random ? BbStatsMath.addTally(before.rm, report, plan) : before.rm
        });
        BbStatsKeys.PITCHES.forEach((id) => { node.bt[id] = BbStatsMath.addCounts(before.bt[id], mine.byType[id], ["n", "s"]); });
        Object.keys(report.batKeys).forEach((ability) => {
            const was = before.ab[ability] || Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyBat());
            node.ab[ability] = Object.assign(BbStatsMath.addCounts(was, Object.assign({ g: 0 }, report.batKeys[ability]), BbStatsKeys.BAT), { g: was.g + 1 });
        });
        Object.keys(report.pitKeys).forEach((ability) => {
            const was = before.ap[ability] || Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyPit());
            node.ap[ability] = Object.assign(BbStatsMath.addCounts(was, Object.assign({ g: 0 }, report.pitKeys[ability]), BbStatsKeys.PIT), { g: was.g + 1 });
        });
        node.ids[key] = at;
        const evicted = AccountKeyLedger.overflowKeys(node.ids);
        evicted.forEach((id) => { delete node.ids[id]; });
        return { node, evicted };
    }
}
class BbStudentName {
    static split(rawName, rawClass) {
        const found = BbStudentName.NUMBERED.exec(rawName);
        if (!found)
            return { name: rawName, cls: rawClass };
        const numbered = found[1] + "-" + Number(found[2]);
        return { name: found[3].trim(), cls: BbStudentName.CLASS_KEY.test(numbered) ? numbered : rawClass };
    }
}
BbStudentName.NUMBERED = /^\s*([1-3])(\d{2})\d{2}\s+(\S.*)$/;
BbStudentName.CLASS_KEY = /^[1-3]-[1-5]$/;
BbStudentName.NO_CLASS = "none";
class BbBoardRow {
    static of(user, cls, node) {
        const who = BbStudentName.split(String(user.name || "학생").slice(0, AccountClassRank.NAME_MAX) || "학생", AccountClassRank.classKey(cls));
        return { n: who.name, c: who.cls, g: node.g, bat: Object.assign({}, node.bat), pit: Object.assign({}, node.pit) };
    }
}
BbBoardRow.ROOT = "baseballduel/board";
class BbStatsProfile extends AccountGameProfile {
    constructor() {
        super(...arguments);
        this.gameKey = BbStatsKeys.GAME;
    }
    matchIdOf(report) { return report.matchId; }
    planOf(report) { return new BbStatsPlan(report); }
    encodeRecent(report, key, win) { return BbStatsCodec.encode(report, key, win); }
    decodeRecent(raw) { return BbStatsCodec.decode(raw); }
    normalizeStats(raw) { return BbStatsMath.normalize(raw); }
    rankFields(node) { return { g: node.g, w: node.w, x: node.bat.hr }; }
    extraPatch(user, extraRaw, node) {
        const values = super.extraPatch(user, extraRaw, node);
        const admins = typeof AccountPolicy === "function" ? AccountPolicy.ADMIN_UIDS : [];
        if (admins.indexOf(user.uid) < 0)
            values[BbBoardRow.ROOT + "/" + user.uid] = BbBoardRow.of(user, extraRaw, node);
        return values;
    }
    applyStats(raw, report, plan, key, at) {
        const change = BbStatsMath.apply(raw, report, plan, key, at);
        if (!change)
            return null;
        const node = change.node, patch = {};
        BbStatsKeys.RECORD.forEach((name) => { patch[name] = node[name]; });
        patch.bat = Object.assign({}, node.bat);
        patch.pit = Object.assign({}, node.pit);
        patch.bt = JSON.parse(JSON.stringify(node.bt));
        patch.bd = node.bd;
        patch.be = node.be;
        patch.bs = node.bs;
        patch.zb = node.zb.map((cell) => Object.assign({}, cell));
        patch.zp = node.zp.slice();
        Object.keys(report.batKeys).forEach((ability) => { patch["ab/" + ability] = Object.assign({}, node.ab[ability]); });
        Object.keys(report.pitKeys).forEach((ability) => { patch["ap/" + ability] = Object.assign({}, node.ap[ability]); });
        if (report.random)
            patch.rm = JSON.parse(JSON.stringify(node.rm));
        patch["ids/" + key] = node.ids[key];
        change.evicted.forEach((id) => { patch["ids/" + id] = null; });
        return { node, patch };
    }
}
class BbStatLines {
    static batting(bat, games) {
        const f = BbBaseballFormulas, rate = f.rateText, pct = (value) => AccountHtml.percent(value, bat.pa);
        return [
            ["게임 수", String(games)], ["타석", String(bat.pa)], ["타수", String(bat.ab)], ["타율", rate(f.average(bat))], ["출루율", rate(f.onBase(bat))], ["장타율", rate(f.slugging(bat))],
            ["OPS", rate(f.ops(bat))], ["득점", String(bat.r)], ["홈런", String(bat.hr)], ["홈런율", pct(bat.hr)], ["2루타 · 3루타", bat.d2 + " · " + bat.d3],
            ["삼진", String(bat.k)], ["삼진율", pct(bat.k)], ["볼넷", String(bat.bb)], ["볼넷율", pct(bat.bb)]
        ];
    }
    static pitching(pit, games) {
        const f = BbBaseballFormulas, pct = (value) => AccountHtml.percent(value, pit.bf);
        return [
            ["게임 수", String(games)], ["이닝", f.inningsText(pit)], ["평균자책점", f.meanText(f.earnedRunAverage(pit))], ["WHIP", f.meanText(f.whip(pit))], ["삼진", String(pit.k)], ["삼진률", pct(pit.k)],
            ["볼넷", String(pit.bb)], ["볼넷율", pct(pit.bb)], ["피홈런", String(pit.hr)], ["피홈런율", pct(pit.hr)], ["피OPS", f.rateText(f.ops(pit))]
        ];
    }
    static player(tally) {
        const f = BbBaseballFormulas;
        return [["승률", AccountHtml.percent(tally.w, tally.g)], ["평균 득점", f.meanText(f.perGame(tally.rf, tally.g))], ["평균 실점", f.meanText(f.perGame(tally.ra, tally.g))], ["승 · 패 · 무", tally.w + " · " + tally.l + " · " + tally.t]];
    }
}
class BbStatsView {
    constructor(zonesShown = () => false) {
        this.zonesShown = zonesShown;
        this.title = "야구 1대1 대전";
        this.emptyRecent = "아직 기록된 사람과의 경기가 없어요.";
        this.wide = true;
    }
    statsHtml(node) {
        const s = node || BbStatsMath.empty(), thrown = BbStatsKeys.PITCHES.reduce((sum, id) => sum + s.bt[id].n, 0);
        const types = BbPitchCatalog.ALL.filter((kind) => s.bt[kind.id].n > 0).map((kind) => [kind.label, s.bt[kind.id].n + "개", AccountHtml.percent(s.bt[kind.id].n, thrown), AccountHtml.percent(s.bt[kind.id].s, s.bt[kind.id].n)]);
        const summary = '<div class="bb-stats-top">' + AccountHtml.record(s.g, s.w, s.l) + AccountHtml.grid(BbStatLines.player(s)) + "</div>";
        const players = BbStatsView.columns('<div class="asd-sec">타자</div>' + AccountHtml.grid(BbStatLines.batting(s.bat, s.g)), '<div class="asd-sec">투수</div>' + AccountHtml.grid(BbStatLines.pitching(s.pit, s.g)));
        const pitches = (types.length ? '<div class="asd-sec">구종별</div>' + AccountHtml.table(["구종", "던진 공", "사용 비율", "스트라이크"], types) : "")
            + AccountHtml.grid([["최장 비거리", s.bd ? s.bd + "m" : "—"], ["최고 타구 속도", s.be ? s.be + "km/h" : "—"], ["최고 구속", s.bs ? s.bs + "km/h" : "—"]]);
        const zones = this.zonesShown() ? '<div class="bb-stats-zones"><div><div class="asd-sec">핫콜드존 (내가 쳤을 때 · 투수 시점)</div>' + BbZoneMap.hittingHtml(s.zb, s.bat) + '</div><div><div class="asd-sec">내가 던진 위치</div>' + BbZoneMap.pitchingHtml(s.zp) + "</div></div>" : "";
        return summary + players + BbStatsView.columns(pitches, zones) + '<div class="asd-sec">사람과 한 경기(일반 방·랜덤 매칭)만 세요. AI 대전·연습은 기록하지 않아요.</div>';
    }
    static columns(left, right) {
        BbStatsView.ensureStyle();
        return '<div class="bb-stats-cols"><div>' + left + "</div><div>" + right + "</div></div>";
    }
    static ensureStyle() {
        if (typeof document === "undefined" || document.getElementById("bbStatsStyle"))
            return;
        const style = document.createElement("style");
        style.id = "bbStatsStyle";
        style.textContent = [
            ".bb-stats-top{display:flex;align-items:center;gap:16px;flex-wrap:wrap;}",
            ".bb-stats-top .asd-record{margin:0;flex:0 0 auto;}",
            ".bb-stats-top .asd-grid{flex:1 1 420px;margin:0;}",
            ".bb-stats-cols{display:grid;grid-template-columns:1fr 1fr;gap:0 18px;}",
            ".bb-stats-cols>div{min-width:0;}",
            ".bb-stats-zones{display:flex;gap:18px;flex-wrap:wrap;}",
            "@media (max-width:760px){.bb-stats-cols{grid-template-columns:1fr;}}"
        ].join("\n");
        document.head.appendChild(style);
    }
    blockBodyHtml(entry) {
        const sheet = entry.sheet, me = sheet.me === null ? 1 : sheet.me, line = sheet.lines[me];
        return AccountHtml.esc(sheet.names[0]) + " " + sheet.score[0] + " : " + sheet.score[1] + " " + AccountHtml.esc(sheet.names[1]) + (entry.random ? " · 랜덤 매칭" : "")
            + "<br>타격 " + line.bat[1] + "안타 " + line.bat[4] + "홈런 · 투구 " + BbResultColumns.pitCell(0, line.pit[0]) + "이닝 " + line.pit[6] + "실점";
    }
    resultTitle(entry) { return entry.tie ? "무승부" : entry.win ? "승리!" : "패배"; }
    resultHtml(entry) { return BbBoxTable.html(entry.sheet, false); }
}
class BbZoneMap {
    static hittingCells(zones, overall) {
        const average = BbBaseballFormulas.average(overall);
        return zones.slice(0, BbZoneGrid.CELLS).map((cell) => {
            if (cell.ab < BbZoneMap.MIN_AT_BATS || average === null)
                return { tone: "few", text: cell.ab ? BbBaseballFormulas.rateText(cell.h / cell.ab) : "-" };
            const rate = cell.h / cell.ab;
            return { tone: rate >= average + BbZoneMap.HOT ? "hot" : rate <= average - BbZoneMap.HOT ? "cold" : "mid", text: BbBaseballFormulas.rateText(rate) };
        });
    }
    static pitchingCells(zones) {
        const inside = zones.slice(0, BbZoneGrid.CELLS), total = zones.reduce((sum, value) => sum + value, 0), most = Math.max(1, ...inside);
        return inside.map((count) => ({ tone: "heat" + Math.min(4, Math.round(count / most * 4)), text: total ? Math.round(count / total * 100) + "%" : "-" }));
    }
    static hittingHtml(zones, overall) { return BbZoneMap.gridHtml(BbZoneMap.hittingCells(zones, overall)); }
    static pitchingHtml(zones) { return BbZoneMap.gridHtml(BbZoneMap.pitchingCells(zones)); }
    static gridHtml(cells) {
        BbZoneMap.ensureStyle();
        return '<div class="bbz">' + cells.map((cell) => '<span class="bbz-' + cell.tone + '">' + cell.text + "</span>").join("") + "</div>";
    }
    static ensureStyle() {
        if (typeof document === "undefined" || document.getElementById("bbzStyle"))
            return;
        const style = document.createElement("style");
        style.id = "bbzStyle";
        style.textContent = [
            ".bbz{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;width:150px;margin:4px 0 10px;border:2px solid rgba(255,255,255,.5);padding:2px;}",
            ".bbz span{display:flex;align-items:center;justify-content:center;height:34px;font-size:12px;font-weight:800;color:#fff;border-radius:2px;}",
            ".bbz-hot{background:#C8453A;}.bbz-cold{background:#3A6FC8;}.bbz-mid{background:rgba(255,255,255,.16);}.bbz-few{background:rgba(255,255,255,.06);color:#8C978F !important;}",
            ".bbz-heat0{background:rgba(217,123,79,.06);}.bbz-heat1{background:rgba(217,123,79,.25);}.bbz-heat2{background:rgba(217,123,79,.45);}.bbz-heat3{background:rgba(217,123,79,.7);}.bbz-heat4{background:#D97B4F;}"
        ].join("\n");
        document.head.appendChild(style);
    }
}
BbZoneMap.HOT = 0.08;
BbZoneMap.MIN_AT_BATS = 5;
class BbReportBuilder {
    static fromSummary(matchId, summary, me, rival, random, iLeft, progress) {
        const state = summary.state, plan = summary.plan, mine = plan.teams[me], slots = state.box[me].slots;
        const winner = iLeft ? (me === 0 ? 1 : 0) : summary.forfeitedBy !== null ? (summary.forfeitedBy === 0 ? 1 : 0) : state.winner === 0 ? 0 : state.winner === 1 ? 1 : -1;
        return {
            matchId, random, rival, me, names: [plan.names[0], plan.names[1]], winner, startInning: plan.format.startInning,
            lineScore: state.lineScore.map((inning) => [inning[0], inning[1]]), score: [state.score[0], state.score[1]],
            box: JSON.parse(JSON.stringify(state.box)),
            batKeys: BbStatsKeys.grouped(mine.lineup, slots ? slots.bat : undefined, (sheet) => BbStatsKeys.batKey(sheet.abilities), BbBoxScoreBuilder.emptyBat, (counts) => counts.pa > 0, BbStatsKeys.BAT),
            pitKeys: BbStatsKeys.grouped(BbRosterPlan.orderedPitchers(mine.pitchers), slots ? slots.pit : undefined, (sheet) => BbStatsKeys.pitKey(sheet.abilities), BbBoxScoreBuilder.emptyPit, (counts) => counts.pitches > 0, BbStatsKeys.PIT),
            progress, iLeft
        };
    }
}
class BbVersusCards {
    static fromStats(node, withZones) {
        if (!node || !node.g)
            return null;
        const card = JSON.parse(JSON.stringify(node.rm));
        card.ob = Object.assign({}, node.bat);
        card.op = Object.assign({}, node.pit);
        if (withZones) {
            card.zb = node.zb.map((cell) => Object.assign({}, cell));
            card.zp = node.zp.slice();
        }
        return card;
    }
    static fromRoom(raw) {
        if (!raw || typeof raw !== "object")
            return null;
        const source = raw, card = BbStatsMath.tally(source);
        if (source.ob)
            card.ob = BbStatsMath.counts(source.ob, BbStatsKeys.BAT, BbBoxScoreBuilder.emptyBat());
        if (source.op)
            card.op = BbStatsMath.counts(source.op, BbStatsKeys.PIT, BbBoxScoreBuilder.emptyPit());
        if (source.zb)
            card.zb = AccountShape.list(source.zb).slice(0, BbZoneGrid.SLOTS).map((cell) => BbStatsMath.counts(cell, ["n", "ab", "h", "tb"], { n: 0, ab: 0, h: 0, tb: 0 }));
        if (source.zp)
            card.zp = AccountShape.list(source.zp).slice(0, BbZoneGrid.SLOTS).map(AccountNumbers.count);
        return card.ob ? card : null;
    }
}
class BbScoutBuilder {
    static of(card) {
        if (!card || !card.ob || !card.op)
            return null;
        const f = BbBaseballFormulas, bat = card.ob, pit = card.op;
        return {
            batStats: [f.rateText(f.average(bat)), f.rateText(f.onBase(bat)), f.rateText(f.slugging(bat)), String(bat.hr)],
            pitStats: [f.meanText(f.earnedRunAverage(pit)), f.meanText(f.whip(pit)), f.rateText(f.ops(pit))],
            hitHeat: card.zb ? BbZoneMap.hittingCells(card.zb, bat).map((cell) => cell.tone) : null,
            pitchHeat: card.zp ? BbZoneMap.pitchingCells(card.zp).map((cell) => cell.tone) : null
        };
    }
}
class BbAccount extends AccountGameAccount {
    constructor(zonesShown) {
        super(new BbStatsProfile(), new BbStatsView(zonesShown));
    }
}
class BbVersusRates {
    constructor(account, zonesShown) {
        this.account = account;
        this.zonesShown = zonesShown;
        this.node = null;
        this.loaded = false;
    }
    loadOnce() {
        if (this.loaded)
            return Promise.resolve();
        return this.account.loadStats().then((node) => { this.node = node; this.loaded = true; }).catch(() => undefined);
    }
    forRoom() { return BbVersusCards.fromStats(this.node, this.zonesShown()); }
    note(report) {
        const plan = new BbStatsPlan(report);
        if (!window.PORTAL_USER || !this.loaded || !plan.countsStats)
            return;
        const change = BbStatsMath.apply(this.node, report, plan, AccountMatchKey.of(report.matchId), Date.now());
        if (change)
            this.node = change.node;
    }
}
