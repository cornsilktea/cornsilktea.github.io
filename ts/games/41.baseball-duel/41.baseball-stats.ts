interface BbStatsReport {
  matchId: string;
  random: boolean;
  rival: boolean;
  me: 0 | 1;
  names: [string, string];
  winner: 0 | 1 | -1;
  startInning: number;
  lineScore: Array<[number, number]>;
  score: [number, number];
  box: [BbTeamBox, BbTeamBox];
  batKey: string;
  pitKey: string;
  progress: number;
  iLeft: boolean;
}

interface BbRecordTally {
  g: number; w: number; l: number; t: number; rf: number; ra: number;
  bat: BbBatCounts;
  pit: BbPitCounts;
}

interface BbAbilityBat extends BbBatCounts { g: number; }
interface BbAbilityPit extends BbPitCounts { g: number; }

interface BbStatsNode extends BbRecordTally {
  bt: Record<BbPitchId, { n: number; s: number }>;
  bd: number;
  be: number;
  bs: number;
  zb: BbZoneHitting[];
  zp: number[];
  ab: Record<string, BbAbilityBat>;
  ap: Record<string, BbAbilityPit>;
  ids: Record<string, number>;
  rm: BbRecordTally;
}

interface BbBoxLine {
  bat: number[];
  pit: number[];
}

interface BbBoxSheet {
  names: [string, string];
  me: 0 | 1 | null;
  startInning: number;
  lineScore: Array<[number, number]>;
  score: [number, number];
  lines: [BbBoxLine, BbBoxLine];
  bestDistance: number;
  bestPitch: number;
}

interface BbStatsEntry extends AccountRecentHeadEntry {
  tie: boolean;
  random: boolean;
  sheet: BbBoxSheet;
}

class BbStatsKeys {
  static readonly GAME = "baseballduel";
  static readonly BAT: readonly (keyof BbBatCounts)[] = ["pa", "ab", "h", "d2", "d3", "hr", "bb", "k", "sf", "rbi", "r", "roe"];
  static readonly PIT: readonly (keyof BbPitCounts)[] = ["bf", "ab", "h", "d2", "d3", "hr", "bb", "k", "sf", "outs", "r", "er", "pitches", "strikes"];
  static readonly RECORD = ["g", "w", "l", "t", "rf", "ra"] as const;
  static readonly PITCHES: readonly BbPitchId[] = ["ft", "cv", "sl", "ch", "kn"];
  static readonly ABILITY_KEY = /^[1-7]-[1-7]-[1-7]$/;

  static batKey(abilities: BbBatterAbilities): string { return abilities.contact + "-" + abilities.power + "-" + abilities.speed; }
  static pitKey(abilities: BbPitcherAbilities): string { return abilities.control + "-" + abilities.power + "-" + abilities.breaking; }
}

class BbResultColumns {
  static readonly BAT: ReadonlyArray<readonly [string, keyof BbBatCounts]> = [["타수", "ab"], ["안타", "h"], ["2루타", "d2"], ["3루타", "d3"], ["홈런", "hr"], ["볼넷", "bb"], ["삼진", "k"], ["득점", "r"]];
  static readonly PIT: ReadonlyArray<readonly [string, keyof BbPitCounts]> = [["이닝", "outs"], ["투구 수", "pitches"], ["피안타", "h"], ["피홈런", "hr"], ["볼넷", "bb"], ["삼진", "k"], ["실점", "r"], ["자책", "er"]];

  static batLine(counts: BbBatCounts): number[] { return BbResultColumns.BAT.map(([, key]) => AccountNumbers.count(counts[key])); }
  static pitLine(counts: BbPitCounts): number[] { return BbResultColumns.PIT.map(([, key]) => AccountNumbers.count(counts[key])); }
  static pitCell(index: number, value: number): string { return BbResultColumns.PIT[index][1] === "outs" ? Math.floor(value / 3) + "." + value % 3 : String(value); }
}

class BbBoxTable {
  private static readonly STYLE_ID = "bbxStyle";
  private static readonly STYLE = [
    ".bbx{display:flex;flex-direction:column;gap:8px;font-family:var(--sg-font,'Nanum Gothic','Malgun Gothic',sans-serif);color:#EEF2EE;}",
    ".bbx-score{display:flex;align-items:center;justify-content:center;gap:10px;font-size:20px;font-weight:800;}",
    ".bbx-score b{font-size:30px;color:#F4F1E8;}",
    ".bbx-line{width:100%;border-collapse:collapse;font-size:13px;text-align:center;}",
    ".bbx-line th,.bbx-line td{padding:3px 4px;border-bottom:1px solid rgba(255,255,255,.12);}",
    ".bbx-line th{color:#A3B0A6;font-weight:700;}.bbx-line td.bbx-name{text-align:left;font-weight:800;}",
    ".bbx-line td.bbx-total{font-weight:800;color:#F4F1E8;}",
    ".bbx-rows{display:flex;flex-direction:column;gap:4px;}",
    ".bbx-row{display:grid;grid-template-columns:minmax(78px,1.4fr) repeat(8,minmax(0,1fr));align-items:center;gap:2px;padding:4px 6px;border-radius:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);}",
    ".bbx-row.mine{border-color:#D97B4F;background:rgba(217,123,79,.14);}",
    ".bbx-who{display:flex;flex-direction:column;min-width:0;}.bbx-who b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.bbx-who small{font-size:11px;color:#A3B0A6;}",
    ".bbx-cell{display:flex;flex-direction:column;align-items:center;min-width:0;}.bbx-cell small{font-size:10px;color:#A3B0A6;white-space:nowrap;}.bbx-cell b{font-size:15px;}",
    ".bbx-facts{display:flex;gap:14px;justify-content:center;font-size:13px;color:#CFD8D0;}.bbx-facts b{color:#F4F1E8;}"
  ].join("\n");

  static ensureStyle(): void {
    if (typeof document === "undefined" || document.getElementById(BbBoxTable.STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = BbBoxTable.STYLE_ID;
    style.textContent = BbBoxTable.STYLE;
    document.head.appendChild(style);
  }

  static sheetOf(report: BbStatsReport): BbBoxSheet {
    return {
      names: report.names, me: report.me, startInning: report.startInning, lineScore: report.lineScore, score: report.score,
      lines: [0, 1].map((team) => ({ bat: BbResultColumns.batLine(report.box[team].bat), pit: BbResultColumns.pitLine(report.box[team].pit) })) as [BbBoxLine, BbBoxLine],
      bestDistance: Math.round(Math.max(report.box[0].bestDistance, report.box[1].bestDistance)),
      bestPitch: Math.round(Math.max(report.box[0].bestPitch, report.box[1].bestPitch))
    };
  }

  static html(sheet: BbBoxSheet): string {
    BbBoxTable.ensureStyle();
    const esc = AccountHtml.esc, names = sheet.names;
    const score = '<div class="bbx-score">' + esc(names[0]) + " <b>" + sheet.score[0] + "</b> : <b>" + sheet.score[1] + "</b> " + esc(names[1]) + "</div>";
    const head = "<tr><th></th>" + sheet.lineScore.map((unused, index) => "<th>" + (sheet.startInning + index) + "</th>").join("") + "<th>R</th></tr>";
    const body = [0, 1].map((team) => '<tr><td class="bbx-name">' + esc(names[team]) + "</td>" + sheet.lineScore.map((inning) => "<td>" + inning[team] + "</td>").join("") + '<td class="bbx-total">' + sheet.score[team] + "</td></tr>").join("");
    const rows = [0, 1].map((team) => BbBoxTable.row(names[team], team === 0 ? "초 공격 · 타격" : "말 공격 · 타격", BbResultColumns.BAT.map(([label]) => label), sheet.lines[team].bat.map(String), sheet.me === team)
      + BbBoxTable.row(names[team], "투구", BbResultColumns.PIT.map(([label]) => label), sheet.lines[team].pit.map((value, index) => BbResultColumns.pitCell(index, value)), sheet.me === team)).join("");
    const facts = '<div class="bbx-facts"><span>최장 비거리 <b>' + (sheet.bestDistance ? sheet.bestDistance + "m" : "-") + "</b></span><span>최고 구속 <b>" + (sheet.bestPitch ? sheet.bestPitch + "km/h" : "-") + "</b></span></div>";
    return '<div class="bbx">' + score + '<table class="bbx-line"><thead>' + head + "</thead><tbody>" + body + '</tbody></table><div class="bbx-rows">' + rows + "</div>" + facts + "</div>";
  }

  private static row(name: string, role: string, labels: string[], values: string[], mine: boolean): string {
    return '<div class="bbx-row' + (mine ? " mine" : "") + '"><span class="bbx-who"><b>' + AccountHtml.esc(name) + "</b><small>" + role + "</small></span>"
      + labels.map((label, index) => '<span class="bbx-cell"><small>' + label + "</small><b>" + values[index] + "</b></span>").join("") + "</div>";
  }
}

class BbStatsPlan implements AccountMatchPlanBase {
  readonly recordsRecent: boolean;
  readonly countsStats: boolean;
  readonly win: boolean;
  readonly tie: boolean;

  constructor(report: BbStatsReport) {
    this.recordsRecent = report.rival && !AccountForfeit.leftEarly(report.iLeft, report.progress);
    this.countsStats = this.recordsRecent;
    this.tie = !report.iLeft && report.winner === -1;
    this.win = !report.iLeft && report.winner === report.me;
  }
}

class BbStatsCodec {
  static readonly VERSION = 1;
  static readonly NAME_MAX = 20;
  static readonly INNINGS_MAX = 15;

  static encode(report: BbStatsReport, key: string, win: boolean): object {
    const sheet = BbBoxTable.sheetOf(report);
    return Object.assign(AccountRecentHeadCodec.encode(BbStatsCodec.VERSION, key, win), {
      t: new BbStatsPlan(report).tie ? 1 : 0, rd: report.random ? 1 : 0, me: report.me, st: report.startInning,
      n: sheet.names.map((name) => String(name || "").slice(0, BbStatsCodec.NAME_MAX)), s: sheet.score.map(AccountNumbers.count),
      ls: sheet.lineScore.slice(0, BbStatsCodec.INNINGS_MAX).map((inning) => [AccountNumbers.count(inning[0]), AccountNumbers.count(inning[1])]),
      b: sheet.lines.map((line) => line.bat), p: sheet.lines.map((line) => line.pit), bd: sheet.bestDistance, bs: sheet.bestPitch
    });
  }

  static decode(raw: unknown): BbStatsEntry | null {
    const head = AccountRecentHeadCodec.decode(raw, BbStatsCodec.VERSION);
    if (!head) return null;
    const stored = raw as Record<string, unknown>, numbers = (value: unknown) => AccountShape.list(value).map(AccountNumbers.count);
    const names = AccountShape.list(stored.n).map((name) => String(name || "")), score = numbers(stored.s), bats = AccountShape.list(stored.b).map(numbers), pits = AccountShape.list(stored.p).map(numbers);
    if (names.length !== 2 || score.length !== 2 || bats.length !== 2 || pits.length !== 2) return null;
    const lineScore = AccountShape.list(stored.ls).map((inning) => { const cells = numbers(inning); return [cells[0] || 0, cells[1] || 0] as [number, number]; });
    const me: 0 | 1 = stored.me === 1 ? 1 : 0;
    return {
      id: head.id, at: head.at, win: head.win, tie: stored.t === 1, random: stored.rd === 1,
      sheet: {
        names: [names[0], names[1]], me, startInning: AccountNumbers.count(stored.st) || 9, lineScore: lineScore.length ? lineScore : [[0, 0]], score: [score[0], score[1]],
        lines: [{ bat: bats[0], pit: pits[0] }, { bat: bats[1], pit: pits[1] }], bestDistance: AccountNumbers.count(stored.bd), bestPitch: AccountNumbers.count(stored.bs)
      }
    };
  }
}

class BbStatsMath {
  static emptyTally(): BbRecordTally { return { g: 0, w: 0, l: 0, t: 0, rf: 0, ra: 0, bat: BbBoxScoreBuilder.emptyBat(), pit: BbBoxScoreBuilder.emptyPit() }; }

  static empty(): BbStatsNode {
    return Object.assign(BbStatsMath.emptyTally(), {
      bt: BbBoxScoreBuilder.emptyTeam().byType, bd: 0, be: 0, bs: 0, zb: BbZoneGrid.emptyHitting(), zp: BbZoneGrid.emptyPitching(), ab: {}, ap: {}, ids: {}, rm: BbStatsMath.emptyTally()
    });
  }

  static counts<T extends object>(raw: unknown, keys: readonly (keyof T)[], into: T): T {
    const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    keys.forEach((key) => { (into as Record<string, number>)[key as string] = AccountNumbers.count(source[key as string]); });
    return into;
  }

  static tally(raw: unknown): BbRecordTally {
    const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}, tally = BbStatsMath.emptyTally();
    BbStatsKeys.RECORD.forEach((key) => { tally[key] = AccountNumbers.count(source[key]); });
    tally.bat = BbStatsMath.counts(source.bat, BbStatsKeys.BAT, BbBoxScoreBuilder.emptyBat());
    tally.pit = BbStatsMath.counts(source.pit, BbStatsKeys.PIT, BbBoxScoreBuilder.emptyPit());
    return tally;
  }

  static normalize(raw: unknown): BbStatsNode {
    const node = BbStatsMath.empty(), source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    Object.assign(node, BbStatsMath.tally(source));
    const types = source.bt && typeof source.bt === "object" ? source.bt as Record<string, unknown> : {};
    BbStatsKeys.PITCHES.forEach((id) => { node.bt[id] = BbStatsMath.counts(types[id], ["n", "s"], { n: 0, s: 0 }); });
    node.bd = AccountNumbers.count(source.bd);
    node.be = AccountNumbers.count(source.be);
    node.bs = AccountNumbers.count(source.bs);
    const zones = AccountShape.list(source.zb), pitched = AccountShape.list(source.zp);
    node.zb = node.zb.map((empty, index) => BbStatsMath.counts(zones[index], ["n", "ab", "h", "tb"], empty));
    node.zp = node.zp.map((unused, index) => AccountNumbers.count(pitched[index]));
    BbStatsMath.keyed(source.ab, (key, value) => { node.ab[key] = BbStatsMath.counts(value, (["g"] as (keyof BbAbilityBat)[]).concat(BbStatsKeys.BAT), Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyBat())); });
    BbStatsMath.keyed(source.ap, (key, value) => { node.ap[key] = BbStatsMath.counts(value, (["g"] as (keyof BbAbilityPit)[]).concat(BbStatsKeys.PIT), Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyPit())); });
    const ids = AccountShape.slots(source.ids);
    Object.keys(ids).forEach((key) => { node.ids[key] = Number(ids[key]) || 0; });
    node.rm = BbStatsMath.tally(source.rm);
    return node;
  }

  private static keyed(raw: unknown, take: (key: string, value: unknown) => void): void {
    const slots = AccountShape.slots(raw);
    Object.keys(slots).filter((key) => BbStatsKeys.ABILITY_KEY.test(key)).forEach((key) => take(key, slots[key]));
  }

  static addCounts<T extends object>(before: T, add: T, keys: readonly (keyof T)[]): T {
    const after = Object.assign({}, before);
    keys.forEach((key) => { (after as Record<string, number>)[key as string] = AccountNumbers.count(before[key]) + AccountNumbers.count(add[key]); });
    return after;
  }

  static addTally(before: BbRecordTally, report: BbStatsReport, plan: BbStatsPlan): BbRecordTally {
    const mine = report.box[report.me];
    return {
      g: before.g + 1, w: before.w + (plan.win ? 1 : 0), l: before.l + (plan.win || plan.tie ? 0 : 1), t: before.t + (plan.tie ? 1 : 0),
      rf: before.rf + AccountNumbers.count(report.score[report.me]), ra: before.ra + AccountNumbers.count(report.score[report.me === 0 ? 1 : 0]),
      bat: BbStatsMath.addCounts(before.bat, mine.bat, BbStatsKeys.BAT), pit: BbStatsMath.addCounts(before.pit, mine.pit, BbStatsKeys.PIT)
    };
  }

  static apply(raw: unknown, report: BbStatsReport, plan: BbStatsPlan, key: string, at: number): { node: BbStatsNode; evicted: string[] } | null {
    const before = BbStatsMath.normalize(raw);
    if (before.ids[key] != null) return null;
    const mine = report.box[report.me], tally = BbStatsMath.addTally(before, report, plan);
    const node: BbStatsNode = Object.assign({}, before, tally, {
      bt: Object.assign({}, before.bt), zb: before.zb.map((cell, index) => BbStatsMath.addCounts(cell, mine.batZones[index] || { n: 0, ab: 0, h: 0, tb: 0 }, ["n", "ab", "h", "tb"])),
      zp: before.zp.map((count, index) => count + AccountNumbers.count(mine.pitZones[index])), ab: Object.assign({}, before.ab), ap: Object.assign({}, before.ap),
      bd: Math.max(before.bd, Math.round(mine.bestDistance)), be: Math.max(before.be, Math.round(mine.bestExit)), bs: Math.max(before.bs, Math.round(mine.bestPitch)),
      ids: Object.assign({}, before.ids), rm: report.random ? BbStatsMath.addTally(before.rm, report, plan) : before.rm
    });
    BbStatsKeys.PITCHES.forEach((id) => { node.bt[id] = BbStatsMath.addCounts(before.bt[id], mine.byType[id], ["n", "s"]); });
    const batBefore = before.ab[report.batKey] || Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyBat()), pitBefore = before.ap[report.pitKey] || Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyPit());
    node.ab[report.batKey] = Object.assign(BbStatsMath.addCounts(batBefore, Object.assign({ g: 0 }, mine.bat), BbStatsKeys.BAT), { g: batBefore.g + 1 });
    node.ap[report.pitKey] = Object.assign(BbStatsMath.addCounts(pitBefore, Object.assign({ g: 0 }, mine.pit), BbStatsKeys.PIT), { g: pitBefore.g + 1 });
    node.ids[key] = at;
    const evicted = AccountKeyLedger.overflowKeys(node.ids);
    evicted.forEach((id) => { delete node.ids[id]; });
    return { node, evicted };
  }
}

class BbBoardRow {
  static readonly ROOT = "baseballduel/board";

  static of(user: PortalUser, cls: unknown, node: BbStatsNode): Record<string, unknown> {
    return { n: String(user.name || "학생").slice(0, AccountClassRank.NAME_MAX) || "학생", c: AccountClassRank.classKey(cls), g: node.g, bat: Object.assign({}, node.bat), pit: Object.assign({}, node.pit) };
  }
}

class BbStatsProfile extends AccountGameProfile<BbStatsReport, BbStatsPlan, BbStatsNode, BbStatsEntry, null> {
  readonly gameKey = BbStatsKeys.GAME;

  matchIdOf(report: BbStatsReport): string { return report.matchId; }
  planOf(report: BbStatsReport): BbStatsPlan { return new BbStatsPlan(report); }
  encodeRecent(report: BbStatsReport, key: string, win: boolean): object { return BbStatsCodec.encode(report, key, win); }
  decodeRecent(raw: unknown): BbStatsEntry | null { return BbStatsCodec.decode(raw); }
  normalizeStats(raw: unknown): BbStatsNode { return BbStatsMath.normalize(raw); }
  rankFields(node: BbStatsNode): AccountRankFields { return { g: node.g, w: node.w, x: node.bat.hr }; }

  extraPatch(user: PortalUser, extraRaw: unknown, node: BbStatsNode): Record<string, unknown> {
    const values = super.extraPatch(user, extraRaw, node);
    const admins = typeof AccountPolicy === "function" ? AccountPolicy.ADMIN_UIDS : [];
    if (admins.indexOf(user.uid) < 0) values[BbBoardRow.ROOT + "/" + user.uid] = BbBoardRow.of(user, extraRaw, node);
    return values;
  }

  applyStats(raw: unknown, report: BbStatsReport, plan: BbStatsPlan, key: string, at: number): AccountStatsChangeBase<BbStatsNode> | null {
    const change = BbStatsMath.apply(raw, report, plan, key, at);
    if (!change) return null;
    const node = change.node, patch: Record<string, unknown> = {};
    BbStatsKeys.RECORD.forEach((name) => { patch[name] = node[name]; });
    patch.bat = Object.assign({}, node.bat);
    patch.pit = Object.assign({}, node.pit);
    patch.bt = JSON.parse(JSON.stringify(node.bt));
    patch.bd = node.bd;
    patch.be = node.be;
    patch.bs = node.bs;
    patch.zb = node.zb.map((cell) => Object.assign({}, cell));
    patch.zp = node.zp.slice();
    patch["ab/" + report.batKey] = Object.assign({}, node.ab[report.batKey]);
    patch["ap/" + report.pitKey] = Object.assign({}, node.ap[report.pitKey]);
    if (report.random) patch.rm = JSON.parse(JSON.stringify(node.rm));
    patch["ids/" + key] = node.ids[key];
    change.evicted.forEach((id) => { patch["ids/" + id] = null; });
    return { node, patch };
  }
}

class BbStatLines {
  static batting(bat: BbBatCounts, games: number): Array<[string, string]> {
    const f = BbBaseballFormulas, rate = f.rateText, pct = (value: number) => AccountHtml.percent(value, bat.pa);
    return [
      ["게임 수", String(games)], ["타석", String(bat.pa)], ["타수", String(bat.ab)], ["타율", rate(f.average(bat))], ["출루율", rate(f.onBase(bat))], ["장타율", rate(f.slugging(bat))],
      ["OPS", rate(f.ops(bat))], ["득점", String(bat.r)], ["홈런", String(bat.hr)], ["홈런율", pct(bat.hr)], ["2루타 · 3루타", bat.d2 + " · " + bat.d3],
      ["삼진", String(bat.k)], ["삼진율", pct(bat.k)], ["볼넷", String(bat.bb)], ["볼넷율", pct(bat.bb)]
    ];
  }

  static pitching(pit: BbPitCounts, games: number): Array<[string, string]> {
    const f = BbBaseballFormulas, pct = (value: number) => AccountHtml.percent(value, pit.bf);
    return [
      ["게임 수", String(games)], ["이닝", f.inningsText(pit)], ["평균자책점", f.meanText(f.earnedRunAverage(pit))], ["WHIP", f.meanText(f.whip(pit))], ["삼진", String(pit.k)], ["삼진률", pct(pit.k)],
      ["볼넷", String(pit.bb)], ["볼넷율", pct(pit.bb)], ["피홈런", String(pit.hr)], ["피홈런율", pct(pit.hr)], ["피OPS", f.rateText(f.ops(pit))]
    ];
  }

  static player(tally: BbRecordTally): Array<[string, string]> {
    const f = BbBaseballFormulas;
    return [["승률", AccountHtml.percent(tally.w, tally.g)], ["평균 득점", f.meanText(f.perGame(tally.rf, tally.g))], ["평균 실점", f.meanText(f.perGame(tally.ra, tally.g))], ["승 · 패 · 무", tally.w + " · " + tally.l + " · " + tally.t]];
  }
}

class BbStatsView implements AccountDialogView<BbStatsNode, BbStatsEntry> {
  readonly title = "야구 1대1 대전";
  readonly emptyRecent = "아직 기록된 사람과의 경기가 없어요.";

  constructor(private readonly zonesShown: () => boolean = () => false) {}

  statsHtml(node: BbStatsNode | null): string {
    const s = node || BbStatsMath.empty(), thrown = BbStatsKeys.PITCHES.reduce((sum, id) => sum + s.bt[id].n, 0);
    const types = BbPitchCatalog.ALL.filter((kind) => s.bt[kind.id].n > 0).map((kind) => [kind.label, s.bt[kind.id].n + "개", AccountHtml.percent(s.bt[kind.id].n, thrown), AccountHtml.percent(s.bt[kind.id].s, s.bt[kind.id].n)]);
    return AccountHtml.record(s.g, s.w, s.l) + (s.t ? '<div class="asd-sec">무승부 ' + s.t + "판</div>" : "")
      + AccountHtml.grid(BbStatLines.player(s))
      + '<div class="asd-sec">타자</div>' + AccountHtml.grid(BbStatLines.batting(s.bat, s.g))
      + '<div class="asd-sec">투수</div>' + AccountHtml.grid(BbStatLines.pitching(s.pit, s.g))
      + (types.length ? '<div class="asd-sec">구종별</div>' + AccountHtml.table(["구종", "던진 공", "사용 비율", "스트라이크"], types) : "")
      + AccountHtml.grid([["최장 비거리", s.bd ? s.bd + "m" : "—"], ["최고 타구 속도", s.be ? s.be + "km/h" : "—"], ["최고 구속", s.bs ? s.bs + "km/h" : "—"]])
      + (this.zonesShown() ? '<div class="asd-sec">핫콜드존 (내가 쳤을 때 · 투수 시점)</div>' + BbZoneMap.hittingHtml(s.zb, s.bat) + '<div class="asd-sec">내가 던진 위치</div>' + BbZoneMap.pitchingHtml(s.zp) : "")
      + '<div class="asd-sec">사람과 한 경기(일반 방·랜덤 매칭)만 세요. AI 대전·연습은 기록하지 않아요.</div>';
  }

  blockBodyHtml(entry: BbStatsEntry): string {
    const sheet = entry.sheet, me = sheet.me === null ? 1 : sheet.me, line = sheet.lines[me];
    return (entry.tie ? "무승부 · " : "") + AccountHtml.esc(sheet.names[0]) + " " + sheet.score[0] + " : " + sheet.score[1] + " " + AccountHtml.esc(sheet.names[1]) + (entry.random ? " · 랜덤 매칭" : "")
      + "<br>타격 " + line.bat[1] + "안타 " + line.bat[4] + "홈런 · 투구 " + BbResultColumns.pitCell(0, line.pit[0]) + "이닝 " + line.pit[6] + "실점";
  }

  resultTitle(entry: BbStatsEntry): string { return entry.tie ? "무승부" : entry.win ? "승리!" : "패배"; }

  resultHtml(entry: BbStatsEntry): string { return BbBoxTable.html(entry.sheet); }
}

class BbZoneMap {
  private static readonly HOT = 0.08;
  private static readonly MIN_AT_BATS = 5;

  static hittingCells(zones: readonly BbZoneHitting[], overall: BbBatCounts): Array<{ tone: string; text: string }> {
    const average = BbBaseballFormulas.average(overall);
    return zones.slice(0, BbZoneGrid.CELLS).map((cell) => {
      if (cell.ab < BbZoneMap.MIN_AT_BATS || average === null) return { tone: "few", text: cell.ab ? BbBaseballFormulas.rateText(cell.h / cell.ab) : "-" };
      const rate = cell.h / cell.ab;
      return { tone: rate >= average + BbZoneMap.HOT ? "hot" : rate <= average - BbZoneMap.HOT ? "cold" : "mid", text: BbBaseballFormulas.rateText(rate) };
    });
  }

  static pitchingCells(zones: readonly number[]): Array<{ tone: string; text: string }> {
    const inside = zones.slice(0, BbZoneGrid.CELLS), total = zones.reduce((sum, value) => sum + value, 0), most = Math.max(1, ...inside);
    return inside.map((count) => ({ tone: "heat" + Math.min(4, Math.round(count / most * 4)), text: total ? Math.round(count / total * 100) + "%" : "-" }));
  }

  static hittingHtml(zones: readonly BbZoneHitting[], overall: BbBatCounts): string { return BbZoneMap.gridHtml(BbZoneMap.hittingCells(zones, overall)); }
  static pitchingHtml(zones: readonly number[]): string { return BbZoneMap.gridHtml(BbZoneMap.pitchingCells(zones)); }

  static gridHtml(cells: Array<{ tone: string; text: string }>): string {
    BbZoneMap.ensureStyle();
    return '<div class="bbz">' + cells.map((cell) => '<span class="bbz-' + cell.tone + '">' + cell.text + "</span>").join("") + "</div>";
  }

  private static ensureStyle(): void {
    if (typeof document === "undefined" || document.getElementById("bbzStyle")) return;
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

class BbReportBuilder {
  static fromSummary(matchId: string, summary: BbMatchSummary, me: 0 | 1, rival: boolean, random: boolean, iLeft: boolean, progress: number): BbStatsReport {
    const state = summary.state, plan = summary.plan, mine = plan.teams[me];
    const winner: 0 | 1 | -1 = iLeft ? (me === 0 ? 1 : 0) : summary.forfeitedBy !== null ? (summary.forfeitedBy === 0 ? 1 : 0) : state.winner === 0 ? 0 : state.winner === 1 ? 1 : -1;
    return {
      matchId, random, rival, me, names: [plan.names[0], plan.names[1]], winner, startInning: plan.format.startInning,
      lineScore: state.lineScore.map((inning) => [inning[0], inning[1]] as [number, number]), score: [state.score[0], state.score[1]],
      box: JSON.parse(JSON.stringify(state.box)) as [BbTeamBox, BbTeamBox],
      batKey: BbStatsKeys.batKey(mine.lineup[0].abilities), pitKey: BbStatsKeys.pitKey(mine.pitchers[0].abilities), progress, iLeft
    };
  }
}

interface BbVersusCard {
  g: number; w: number; l: number; t: number; rf: number; ra: number;
  bat: BbBatCounts;
  pit: BbPitCounts;
  ob?: BbBatCounts;
  op?: BbPitCounts;
  zb?: BbZoneHitting[];
  zp?: number[];
}

class BbVersusCards {
  static fromStats(node: BbStatsNode | null, withZones: boolean): BbVersusCard | null {
    if (!node || !node.g) return null;
    const card: BbVersusCard = JSON.parse(JSON.stringify(node.rm));
    card.ob = Object.assign({}, node.bat);
    card.op = Object.assign({}, node.pit);
    if (withZones) { card.zb = node.zb.map((cell) => Object.assign({}, cell)); card.zp = node.zp.slice(); }
    return card;
  }

  static fromRoom(raw: unknown): BbVersusCard | null {
    if (!raw || typeof raw !== "object") return null;
    const source = raw as Record<string, unknown>, card: BbVersusCard = BbStatsMath.tally(source);
    if (source.ob) card.ob = BbStatsMath.counts(source.ob, BbStatsKeys.BAT, BbBoxScoreBuilder.emptyBat());
    if (source.op) card.op = BbStatsMath.counts(source.op, BbStatsKeys.PIT, BbBoxScoreBuilder.emptyPit());
    if (source.zb) card.zb = AccountShape.list(source.zb).slice(0, BbZoneGrid.SLOTS).map((cell) => BbStatsMath.counts(cell, ["n", "ab", "h", "tb"], { n: 0, ab: 0, h: 0, tb: 0 }));
    if (source.zp) card.zp = AccountShape.list(source.zp).slice(0, BbZoneGrid.SLOTS).map(AccountNumbers.count);
    return card.ob ? card : null;
  }
}

class BbScoutBuilder {
  static of(card: BbVersusCard | null): BbTeamScout | null {
    if (!card || !card.ob || !card.op) return null;
    const f = BbBaseballFormulas, bat = card.ob, pit = card.op;
    return {
      batStats: [f.rateText(f.average(bat)), f.rateText(f.onBase(bat)), f.rateText(f.slugging(bat)), String(bat.hr)],
      pitStats: [f.meanText(f.earnedRunAverage(pit)), f.meanText(f.whip(pit)), f.rateText(f.ops(pit))],
      hitHeat: card.zb ? BbZoneMap.hittingCells(card.zb, bat).map((cell) => cell.tone) : null,
      pitchHeat: card.zp ? BbZoneMap.pitchingCells(card.zp).map((cell) => cell.tone) : null
    };
  }
}

class BbAccount extends AccountGameAccount<BbStatsReport, BbStatsPlan, BbStatsNode, BbStatsEntry> {
  constructor(zonesShown: () => boolean) {
    super(new BbStatsProfile(), new BbStatsView(zonesShown));
  }
}

class BbVersusRates {
  private node: BbStatsNode | null = null;
  private loaded = false;

  constructor(private readonly account: BbAccount, private readonly zonesShown: () => boolean) {}

  loadOnce(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    return this.account.loadStats().then((node) => { this.node = node; this.loaded = true; }).catch(() => undefined);
  }

  forRoom(): BbVersusCard | null { return BbVersusCards.fromStats(this.node, this.zonesShown()); }

  note(report: BbStatsReport): void {
    const plan = new BbStatsPlan(report);
    if (!window.PORTAL_USER || !this.loaded || !plan.countsStats) return;
    const change = BbStatsMath.apply(this.node, report, plan, AccountMatchKey.of(report.matchId), Date.now());
    if (change) this.node = change.node;
  }
}
