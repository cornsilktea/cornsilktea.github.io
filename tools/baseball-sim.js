// 41번 야구 밸런스 시뮬레이션 (사양서 17.2절, 선수단 프롬프트 5절).
// 사용: node tools/baseball-sim.js [--games 10000] [--seed 41] [--abilities] [--screen 1000] [--refine 8000] [--write]
//   기본: 보통 AI 선수단(타자 9명·투수 3명, 모두 3/3/3/3) 대 같은 선수단으로 9회 1이닝 경기를 돌려 목표와 비교하고,
//         중요 수비 포지션 투자, 체력별 교체 시점(1·3·9이닝), 포수 수비별 장타를 표로 낸다.
//   --abilities: 타자 149가지·투수 149가지 배분의 공정성(먼저 --screen 판씩 훑고, 위·아래 끝 배분을 --refine 판씩 다시).
//   --write: docs/41.baseball-duel/41.baseball-sim-report.md 로 저장.
const fs = require("fs"), path = require("path");
const BaseballCode = require("./baseball-load.js");

class Tally {
  constructor(code) {
    this.code = code;
    this.bat = code.BbBoxScoreBuilder.emptyBat();
    this.pit = code.BbBoxScoreBuilder.emptyPit();
    this.halves = 0; this.runs = 0; this.pitches = 0; this.games = 0; this.extra = 0; this.ties = 0; this.changes = 0;
    this.results = {}; this.flights = { ground: 0, line: 0, fly: 0, pop: 0 };
    this.bands = {}; this.types = {}; this.homeRunSpray = { pull: 0, center: 0, opposite: 0 };
    this.swings = 0; this.misses = 0; this.fouls = 0; this.takes = 0; this.zonePitches = 0;
    this.location = { middle: { n: 0, perfect: 0 }, edge: { n: 0, perfect: 0 }, outside: { n: 0, perfect: 0 } };
  }

  pitch(outcome) {
    const roll = outcome.roll, type = this.types[roll.pitch] || (this.types[roll.pitch] = { n: 0, strikes: 0, ab: 0, h: 0 });
    this.pitches++; type.n++;
    if (outcome.kind !== "ball") type.strikes++;
    const off = this.code.BbStrikeZoneJudge.offCenter(roll.arrive);
    if (off <= 1) this.zonePitches++;
    if (outcome.swing.kind === "take") { this.takes++; return; }
    this.swings++;
    const where = off <= 0.5 ? "middle" : off <= 1 ? "edge" : "outside";
    this.location[where].n++;
    if (outcome.swing.band === "perfect") this.location[where].perfect++;
    if (outcome.kind === "swingMiss") { this.misses++; return; }
    if (outcome.kind === "foul") { this.fouls++; return; }
    const script = outcome.script, ball = outcome.swing.ball, code = script.result;
    this.results[code] = (this.results[code] || 0) + 1;
    if (code !== "FOUL_CAUGHT") this.flights[ball.flight]++;
    const band = this.bands[outcome.swing.band] || (this.bands[outcome.swing.band] = { n: 0, histogram: new Array(15).fill(0), hr: 0, hits: 0 });
    band.n++;
    if (ball.flight !== "ground") band.histogram[Math.min(14, Math.floor(ball.carry / 10))]++;
    if (this.code.BbPlayCodes.isHit(code)) { band.hits++; type.h++; }
    if (code !== "SAC_FLY") type.ab++;
    if (code === "HOME_RUN") { band.hr++; this.homeRunSpray[Math.abs(ball.spray) < 15 ? "center" : ball.spray < 0 ? "pull" : "opposite"]++; }
  }

  add(counts, into) { for (const key of Object.keys(counts)) into[key] += counts[key]; }

  game(state) {
    this.games++;
    this.halves += state.halvesDone + (state.finished && state.half === 1 && state.outs < 3 && state.winner === 1 && state.endNote ? 1 : 0);
    this.runs += state.score[0] + state.score[1];
    if (state.inning > 9) this.extra++;
    if (state.winner === -1) this.ties++;
    for (const team of state.box) { this.add(team.bat, this.bat); this.add(team.pit, this.pit); }
  }
}

class SideTally {
  constructor(code) {
    this.code = code;
    this.games = 0; this.wins = 0; this.ties = 0; this.runsFor = 0; this.runsAgainst = 0; this.changes = 0;
    this.against = code.BbBoxScoreBuilder.emptyPit();
    this.outings = []; this.current = null;
  }

  add(counts, into) { for (const key of Object.keys(counts)) into[key] += counts[key]; }

  game(state, side) {
    this.games++;
    if (state.winner === side) this.wins++;
    if (state.winner === -1) this.ties++;
    this.runsFor += state.score[side];
    this.runsAgainst += state.score[1 - side];
    this.add(state.box[side].pit, this.against);
    this.closeOuting();
  }

  watch(engine, side) {
    if (engine.fieldingIndex !== side) return;
    const roster = engine.roster(side), index = roster.currentIndex(), level = roster.stamina().level(), thrown = roster.pitchesThisOuting();
    if (!this.current || this.current.index !== index) { this.closeOuting(); this.current = { index, tired: null, worn: null, pitches: 0 }; }
    this.current.pitches = thrown;
    if (this.current.tired === null && level < 50) this.current.tired = thrown;
    if (this.current.worn === null && level < 30) this.current.worn = thrown;
  }

  closeOuting() { if (this.current) this.outings.push(this.current); this.current = null; }
}

class BaseballSim {
  static FORMATS = { one: "BbOneInningFormat", three: "BbThreeInningFormat", full: "BbFullGameFormat" };

  constructor(seed) {
    this.code = BaseballCode.load();
    this.seed = seed;
    this.dimensions = new this.code.BbMainBallpark();
    this.errors = new this.code.BbInfieldGroundBallErrorPolicy(0.05);
    this.level = this.code.BbAiLevel.ALL.normal;
  }

  format(id) { return new this.code[BaseballSim.FORMATS[id]](); }

  team(batterPoints = [3, 3, 3, 3], pitcherPoints = [3, 3, 3, 3], byPosition = {}) {
    const code = this.code, plan = code.BbRosterPlan, breaking = pitcherPoints[2];
    const batter = (points, position) => ({ abilities: { contact: points[0], power: points[1], speed: points[2], defense: points[3] }, hand: "R", position });
    return {
      lineup: plan.BATTING_ORDER.map((position) => batter(byPosition[position] || batterPoints, position)),
      pitchers: plan.pitcherRoles().map((role) => ({ abilities: { control: pitcherPoints[0], power: pitcherPoints[1], breaking, stamina: pitcherPoints[3] }, hand: "R", pitches: new code.BbPitchSelection(breaking).usable(), role }))
    };
  }

  runner(formatId, teams) {
    const code = this.code, level = this.level;
    return new code.BbAiMatchRunner(this.format(formatId), this.dimensions, this.errors, teams, [level, level], [level, level]);
  }

  run(games, away, home, formatId = "one", salt = 0) {
    const tally = new Tally(this.code), random = new this.code.BbSeededRandom(this.seed + salt);
    for (let game = 0; game < games; game++) {
      const state = this.runner(formatId, [away, home]).play(new this.code.BbSeededRandom(random.seed()), (s, outcome) => tally.pitch(outcome), undefined, () => tally.changes++);
      tally.game(state);
    }
    return tally;
  }

  side(games, mine, rival, formatId = "one", salt = 0) {
    const code = this.code, tally = new SideTally(code), random = new code.BbSeededRandom(this.seed + 1000 + salt);
    for (let game = 0; game < games; game++) {
      const side = game % 2, teams = side ? [rival, mine] : [mine, rival];
      const state = this.runner(formatId, teams).play(new code.BbSeededRandom(random.seed()), (s, outcome, note, batting, engine) => tally.watch(engine, side), undefined, (engine, team) => { if (team === side) tally.changes++; });
      tally.game(state, side);
    }
    return tally;
  }
}

class SimReport {
  constructor(code) { this.code = code; this.lines = []; }
  line(text = "") { this.lines.push(text); }
  rate(value) { return this.code.BbBaseballFormulas.rateText(value); }
  percent(value) { return (value * 100).toFixed(1) + "%"; }
  signed(value) { return (value >= 0 ? "+" : "") + (value * 100).toFixed(1) + "%"; }
  extraBases(counts) { return (counts.d2 + counts.d3 + counts.hr) / (counts.pa || counts.bf); }
  mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

  basic(tally, games, seed) {
    const f = this.code.BbBaseballFormulas, bat = tally.bat, pa = bat.pa;
    const inPlay = tally.flights.ground + tally.flights.line + tally.flights.fly + tally.flights.pop;
    this.line("# 41번 야구 시뮬레이션 보고서");
    this.line();
    this.line("보통 AI 선수단(타자 9명 3/3/3/3 · 투수 선발·중간·마무리 3/3/3/3, 체력 30 미만 자동 교체) 대 같은 선수단, 9회 1이닝 경기 " + games + "판(시드 " + seed + ") · 하프 이닝 " + tally.halves + "개 · 타석 " + pa + "개.");
    this.line();
    this.line("## 1. 목표 대비 (선생님 결정 2026-11-14: 최소선, 타율만 .500 상한)");
    this.line();
    this.line("| 지표 | 결과 | 목표 | 판정 |");
    this.line("|---|---|---|---|");
    const average = f.average(bat), onBase = f.onBase(bat), slugging = f.slugging(bat);
    this.line("| 타율 | " + this.rate(average) + " | .400 이상 .500 이하 | " + (average >= 0.4 && average <= 0.5 ? "맞음" : "벗어남") + " |");
    this.line("| 출루율 | " + this.rate(onBase) + " | .450 이상 | " + (onBase >= 0.45 ? "맞음" : "벗어남") + " |");
    this.line("| 장타율 | " + this.rate(slugging) + " | .700 이상 | " + (slugging >= 0.7 ? "맞음" : "벗어남") + " |");
    this.line("| 타석당 홈런 | " + this.percent(bat.hr / pa) + " | 상한 없음 | - |");
    this.line();
    this.line("## 2. 그 밖의 값");
    this.line();
    this.line("| 지표 | 결과 |");
    this.line("|---|---|");
    this.line("| OPS | " + this.rate(f.ops(bat)) + " |");
    this.line("| 삼진률 | " + this.percent(bat.k / pa) + " |");
    this.line("| 볼넷률 | " + this.percent(bat.bb / pa) + " |");
    this.line("| 하프 이닝 평균 득점 | " + (tally.runs / tally.halves).toFixed(2) + " |");
    this.line("| 하프 이닝 평균 투구 수 | " + (tally.pitches / tally.halves).toFixed(1) + " |");
    this.line("| 타석당 투구 수 | " + (tally.pitches / pa).toFixed(2) + " |");
    this.line("| 한 판 평균 합계 득점 | " + (tally.runs / tally.games).toFixed(2) + " |");
    this.line("| 한 판 평균 투구 수(두 팀 합) | " + (tally.pitches / tally.games).toFixed(1) + " |");
    this.line("| 한 판 평균 투수 교체(두 팀 합) | " + (tally.changes / tally.games).toFixed(2) + " |");
    this.line("| 연장으로 간 판 | " + this.percent(tally.extra / tally.games) + " (무승부 " + this.percent(tally.ties / tally.games) + ") |");
    this.line("| 땅볼 : 라인드라이브 : 뜬공 : 내야 뜬공 | " + ["ground", "line", "fly", "pop"].map((kind) => this.percent(tally.flights[kind] / inPlay)).join(" : ") + " |");
    this.line("| 스윙률 / 헛스윙률(스윙 중) / 파울률(스윙 중) | " + this.percent(tally.swings / tally.pitches) + " / " + this.percent(tally.misses / tally.swings) + " / " + this.percent(tally.fouls / tally.swings) + " |");
    this.line("| 존 안에 들어온 공 | " + this.percent(tally.zonePitches / tally.pitches) + " |");
    this.line();
    this.line("## 3. 타석 결과 분포");
    this.line();
    this.line("| 결과 | 타석 비율 |");
    this.line("|---|---|");
    this.line("| 삼진 | " + this.percent(bat.k / pa) + " |");
    this.line("| 볼넷 | " + this.percent(bat.bb / pa) + " |");
    for (const code of Object.keys(tally.results).sort((a, b) => tally.results[b] - tally.results[a])) this.line("| " + this.code.BbPlayCodes.LABELS[code].replace("!", "") + " | " + this.percent(tally.results[code] / pa) + " |");
    this.line();
    this.line("## 4. 타이밍 밴드별 타구 (비거리는 뜬 타구만, 10m 단위 비율)");
    this.line();
    this.line("| 밴드 | 인플레이 수 | 안타율 | 홈런율 | 0~59m | 60~79 | 80~99 | 100~109 | 110~119 | 120m+ |");
    this.line("|---|---|---|---|---|---|---|---|---|---|");
    const names = { perfect: "정타", good: "양호", fair: "보통", poor: "빗맞음" };
    for (const band of ["perfect", "good", "fair", "poor"]) {
      const data = tally.bands[band];
      if (!data) continue;
      const air = data.histogram.reduce((sum, count) => sum + count, 0) || 1, share = (from, to) => this.percent(data.histogram.slice(from, to).reduce((sum, count) => sum + count, 0) / air);
      this.line("| " + names[band] + " | " + data.n + " | " + this.rate(data.hits / data.n) + " | " + this.percent(data.hr / data.n) + " | " + share(0, 6) + " | " + share(6, 8) + " | " + share(8, 10) + " | " + share(10, 11) + " | " + share(11, 12) + " | " + share(12, 15) + " |");
    }
    this.line();
    this.line("## 5. 위치별 정타율 (스윙한 공)");
    this.line();
    this.line("| 위치 | 스윙 수 | 정타 비율 |");
    this.line("|---|---|---|");
    for (const [key, name] of [["middle", "가운데(r≤0.5)"], ["edge", "가장자리(0.5<r≤1)"], ["outside", "존 밖(r>1)"]]) this.line("| " + name + " | " + tally.location[key].n + " | " + this.percent(tally.location[key].perfect / Math.max(1, tally.location[key].n)) + " |");
    this.line();
    this.line("## 6. 구종별");
    this.line();
    this.line("| 구종 | 투구 비율 | 스트라이크율 | 피안타율 |");
    this.line("|---|---|---|---|");
    for (const id of Object.keys(tally.types)) { const type = tally.types[id]; this.line("| " + this.code.BbPitchCatalog.of(id).label + " | " + this.percent(type.n / tally.pitches) + " | " + this.percent(type.strikes / type.n) + " | " + this.rate(type.ab ? type.h / type.ab : null) + " |"); }
    this.line();
    const homers = tally.homeRunSpray, total = homers.pull + homers.center + homers.opposite || 1;
    this.line("홈런 방향(우타 기준): 당긴 쪽 " + this.percent(homers.pull / total) + " · 가운데 " + this.percent(homers.center / total) + " · 민 쪽 " + this.percent(homers.opposite / total));
    this.line();
  }

  defenseRow(label, tally, base) {
    const f = this.code.BbBaseballFormulas, against = tally.against, perInning = against.r / (against.outs / 3), perGame = tally.runsAgainst / tally.games;
    const gap = base ? perInning / (base.against.r / (base.against.outs / 3)) - 1 : 0;
    this.line("| " + label + " | " + perGame.toFixed(2) + " | " + perInning.toFixed(3) + " | " + (base ? this.signed(gap) : "기준") + " | " + this.rate(f.average(against)) + " | " + this.percent(this.extraBases(against)) + " | " + this.rate(f.slugging(against)) + " |");
  }

  keyDefense(rows, games) {
    this.line("## 7. 중요 수비 포지션(포수·유격수·중견수)에 수비를 몰아준 효과");
    this.line();
    this.line("그 팀이 수비할 때의 실점만 본다(공격력이 줄어든 것은 10절 공정성에서 본다). 9회 1이닝, 각 " + games + "판(선공·후공 반씩). 나머지 6명은 3/3/3/3.");
    this.line();
    this.line("| 수비 배치 | 경기당 실점 | 이닝당 실점 | 기준 대비 | 피안타율 | 장타 허용(타석당 2루타 이상) | 피장타율 |");
    this.line("|---|---|---|---|---|---|---|");
    rows.forEach((row) => this.defenseRow(row.label, row.tally, row.base ? null : rows[0].tally));
    this.line();
  }

  stamina(tables) {
    this.line("## 8. 체력 — 체력 스탯별 교체 시점 (투수 3명 모두 그 체력, 나머지 능력치 3/3/3 고정, 상대는 기준 선수단)");
    this.line();
    this.line("구속 10% 감소(체력 50 미만)·흩어짐 30% 증가(30 미만)는 선생님이 정한 값. 깎이는 양: 1구당 " + this.code.BbStaminaModel.PITCH_COST.slice(1).join("/") + ", 안타 +" + this.code.BbStaminaModel.HIT_COST.slice(1).join("/") + ", 홈런 +" + this.code.BbStaminaModel.HOME_RUN_COST.slice(1).join("/") + " (체력 1→7).");
    this.line();
    for (const table of tables) {
      this.line("### " + table.title + " (" + table.games + "판)");
      this.line();
      this.line("| 체력 | 선발이 50 아래로(몇 구째) | 선발이 30 아래로(몇 구째) | 30 아래까지 간 선발 | 경기당 교체 | 경기당 실점 | 체력 3 대비 |");
      this.line("|---|---|---|---|---|---|---|");
      const base = table.rows.find((row) => row.stamina === 3).tally;
      for (const row of table.rows) {
        const starts = row.tally.outings.filter((outing) => outing.index === 0), tired = this.mean(starts.filter((o) => o.tired !== null).map((o) => o.tired)), worn = this.mean(starts.filter((o) => o.worn !== null).map((o) => o.worn));
        const perGame = row.tally.runsAgainst / row.tally.games, gap = perGame / (base.runsAgainst / base.games) - 1;
        this.line("| " + row.stamina + " | " + (tired === null ? "-" : tired.toFixed(1)) + " | " + (worn === null ? "-" : worn.toFixed(1)) + " | " + this.percent(starts.filter((o) => o.worn !== null).length / Math.max(1, starts.length)) + " | " + (row.tally.changes / row.tally.games).toFixed(2) + " | " + perGame.toFixed(2) + " | " + (row.stamina === 3 ? "기준" : this.signed(gap)) + " |");
      }
      this.line();
    }
  }

  catcher(rows, games) {
    const f = this.code.BbBaseballFormulas, base = rows.find((row) => row.points === 3).tally.against;
    this.line("## 9. 포수 수비별 상대 장타 (포수만 바꾸고 나머지는 3/3/3/3, 각 " + games + "판)");
    this.line();
    this.line("| 포수 수비 | 장타 배율(코드) | 피장타율 | 장타 허용(타석당 2루타 이상) | 기준 대비 | 선생님 예시 |");
    this.line("|---|---|---|---|---|---|");
    const example = { 1: "+10%", 2: "+5%", 3: "0%", 4: "−3%", 5: "−6%", 6: "(−9%)", 7: "(−12%)" };
    for (const row of rows) {
      const against = row.tally.against, gap = this.extraBases(against) / this.extraBases(base) - 1;
      this.line("| " + row.points + " | ×" + this.code.BbCatcherFraming.topWeight(row.points).toFixed(2) + " | " + this.rate(f.slugging(against)) + " | " + this.percent(this.extraBases(against)) + " | " + (row.points === 3 ? "기준" : this.signed(gap)) + " | " + example[row.points] + " |");
    }
    this.line();
  }

  fairness(title, rows, note) {
    this.line("## " + title);
    this.line();
    this.line(note);
    this.line();
    this.line("| 배분 | 판 수 | 승률 | 경기당 득점 − 실점 | 기준(3/3/3/3) 득점 대비 | 판정(±8%) |");
    this.line("|---|---|---|---|---|---|");
    for (const row of rows) this.line("| " + row.points.join("/") + " | " + row.games + " | " + this.percent(row.winRate) + " | " + (row.net >= 0 ? "+" : "") + row.net.toFixed(2) + " | " + this.signed(row.gap) + " | " + (Math.abs(row.gap) <= 0.08 ? "안" : "밖") + " |");
    this.line();
  }
}

class SimCommand {
  constructor(argv) {
    const value = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 ? Number(argv[index + 1]) : fallback; };
    this.games = value("--games", 10000);
    this.seed = value("--seed", 41);
    this.withAbilities = argv.includes("--abilities");
    this.write = argv.includes("--write");
    this.screen = value("--screen", 1000);
    this.refine = value("--refine", 8000);
    this.sideGames = value("--side", 6000);
    this.quick = argv.includes("--quick");
    const part = argv.indexOf("--fair");
    this.fairKinds = part >= 0 ? argv[part + 1].split(",") : ["batter", "pitcher"];
  }

  keyDefense(sim) {
    const plan = (points) => ({ C: points, SS: points, CF: points });
    const rows = [
      { label: "기준(전원 3/3/3/3)", tally: sim.side(this.sideGames, sim.team(), sim.team(), "one", 1), base: true },
      { label: "포수·유격수·중견수 수비 5 (3/2/2/5)", tally: sim.side(this.sideGames, sim.team([3, 3, 3, 3], [3, 3, 3, 3], plan([3, 2, 2, 5])), sim.team(), "one", 1) },
      { label: "포수·유격수·중견수 수비 6 (2/2/2/6)", tally: sim.side(this.sideGames, sim.team([3, 3, 3, 3], [3, 3, 3, 3], plan([2, 2, 2, 6])), sim.team(), "one", 1) },
      { label: "포수·유격수·중견수 수비 7 (2/2/1/7)", tally: sim.side(this.sideGames, sim.team([3, 3, 3, 3], [3, 3, 3, 3], plan([2, 2, 1, 7])), sim.team(), "one", 1) },
      { label: "9명 모두 수비 7 (2/2/1/7)", tally: sim.side(this.sideGames, sim.team([2, 2, 1, 7]), sim.team(), "one", 1) },
      { label: "9명 모두 수비 1 (4/4/3/1)", tally: sim.side(this.sideGames, sim.team([4, 4, 3, 1]), sim.team(), "one", 1) }
    ];
    return rows;
  }

  staminaTables(sim) {
    const formats = [["one", "9회 1이닝(본 게임)", this.sideGames], ["three", "3이닝", Math.round(this.sideGames / 3)], ["full", "9이닝", Math.round(this.sideGames / 8)]];
    return formats.map(([id, title, games]) => ({ title, games, rows: [1, 2, 3, 4, 5, 6, 7].map((stamina) => ({ stamina, tally: sim.side(games, sim.team([3, 3, 3, 3], [3, 3, 3, stamina]), sim.team(), id, 2) })) }));
  }

  catcherRows(sim) {
    return [1, 2, 3, 4, 5, 6, 7].map((points) => ({ points, tally: sim.side(this.sideGames * 2, sim.team([3, 3, 3, 3], [3, 3, 3, 3], { C: [3, 3, 3, points] }), sim.team(), "one", 3) }));
  }

  fairnessRows(sim, asBatter) {
    const splits = sim.code.BbAbilityAllocator.everySplit(sim.code.BbAbilityAllocator.BATTER), standard = sim.team();
    const measure = (points, games) => {
      const mine = asBatter ? sim.team(points) : sim.team([3, 3, 3, 3], points), tally = sim.side(games, mine, standard, "one", 4);
      const base = 0;
      return { points, games, winRate: (tally.wins + tally.ties / 2) / tally.games, net: (tally.runsFor - tally.runsAgainst) / tally.games, runsFor: tally.runsFor / tally.games, base };
    };
    const screened = splits.map((points) => measure(points, this.screen));
    screened.sort((a, b) => b.net - a.net);
    const edges = new Set([...screened.slice(0, 10), ...screened.slice(-10)].map((row) => row.points.join("/")));
    const showcase = ["3/3/3/3", "7/1/1/3", "1/7/1/3", "1/1/7/3", "3/1/1/7", "1/1/3/7", "7/3/1/1", "1/7/3/1", "4/4/3/1", "4/4/1/3", "5/5/1/1", "2/2/1/7"];
    showcase.forEach((key) => edges.add(key));
    const refined = splits.filter((points) => edges.has(points.join("/"))).map((points) => measure(points, this.refine));
    const standardRow = refined.find((row) => row.points.join("/") === "3/3/3/3"), scale = standardRow.runsFor;
    refined.forEach((row) => { row.gap = row.net / scale; });
    refined.sort((a, b) => b.net - a.net);
    return { refined, screenedCount: screened.length, best: screened.slice(0, 5).map((row) => row.points.join("/")) };
  }

  run() {
    const sim = new BaseballSim(this.seed), report = new SimReport(sim.code), standard = sim.team();
    report.basic(sim.run(this.games, standard, standard), this.games, this.seed);
    if (!this.quick) {
      report.keyDefense(this.keyDefense(sim), this.sideGames);
      report.stamina(this.staminaTables(sim));
      report.catcher(this.catcherRows(sim), this.sideGames * 2);
    }
    if (this.withAbilities) {
      for (const [title, asBatter] of [["10. 타자 배분 149가지 (컨택/파워/주루/수비) — 9명 모두 그 배분 대 기준 선수단", true], ["11. 투수 배분 149가지 (제구/구위/변화/체력) — 투수 3명 모두 그 배분 대 기준 선수단", false]]) {
        if (this.fairKinds.indexOf(asBatter ? "batter" : "pitcher") < 0) continue;
        const result = this.fairnessRows(sim, asBatter);
        report.fairness(title, result.refined, "149가지를 " + this.screen + "판씩 훑은 뒤 위·아래 끝 10가지씩과 대표 배분을 " + this.refine + "판씩 다시 돌린 표(9회 1이닝, 선공·후공 반씩). 공격과 수비(또는 투구)를 함께 보는 값은 경기당 득점 − 실점이다. 훑기에서 가장 좋았던 5가지: " + result.best.join(", ") + ".");
      }
    }
    const text = report.lines.join("\n");
    console.log(text);
    if (this.write) fs.writeFileSync(path.join(__dirname, "..", "docs", "41.baseball-duel", "41.baseball-sim-report.md"), text + "\n", "utf8");
  }
}

new SimCommand(process.argv.slice(2)).run();
