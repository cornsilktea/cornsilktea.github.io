// 41번 야구 밸런스 시뮬레이션 (사양서 17.2절).
// 사용: node tools/baseball-sim.js [--games 10000] [--seed 41] [--abilities] [--cross] [--write]
//   기본: 보통 AI(3/3/3) 대 보통 AI 로 9회 1이닝 경기를 돌려 타격·투구 분포를 12.3절 목표와 비교한다.
//   --abilities: 타자 28가지 배분 × 표준 투수, 투수 28가지 배분 × 표준 타자의 기대 득점 편차(목표 ±8%).
//   --cross: 28 × 28 전체 교차(오래 걸림).  --write: docs/41.baseball-duel/41.baseball-sim-report.md 로 저장.
const fs = require("fs"), path = require("path");
const BaseballCode = require("./baseball-load.js");

class Tally {
  constructor(code) {
    this.code = code;
    this.bat = code.BbBoxScoreBuilder.emptyBat();
    this.pit = code.BbBoxScoreBuilder.emptyPit();
    this.halves = 0; this.runs = 0; this.pitches = 0; this.games = 0; this.extra = 0; this.ties = 0;
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

class BaseballSim {
  constructor(seed) {
    this.code = BaseballCode.load();
    this.seed = seed;
    this.dimensions = new this.code.BbMainBallpark();
    this.errors = new this.code.BbInfieldGroundBallErrorPolicy(0.05);
  }

  team(batterPoints, pitcherPoints) {
    const code = this.code, breaking = pitcherPoints[2];
    return {
      lineup: [{ abilities: { contact: batterPoints[0], power: batterPoints[1], speed: batterPoints[2] }, hand: "R" }],
      pitchers: [{ abilities: { control: pitcherPoints[0], power: pitcherPoints[1], breaking }, hand: "R", pitches: new code.BbPitchSelection(breaking).usable(), role: "starter" }]
    };
  }

  run(games, away, home, level = "normal") {
    const code = this.code, tuning = code.BbAiLevel.ALL[level], tally = new Tally(code), random = new code.BbSeededRandom(this.seed);
    for (let game = 0; game < games; game++) {
      const runner = new code.BbAiMatchRunner(new code.BbOneInningFormat(), this.dimensions, this.errors, [away, home], [tuning, tuning], [tuning, tuning]);
      tally.game(runner.play(new code.BbSeededRandom(random.seed()), (state, outcome) => tally.pitch(outcome)));
    }
    return tally;
  }

  halfInningRuns(halves, batterPoints, pitcherPoints) {
    const code = this.code, tuning = code.BbAiLevel.ALL.normal, random = new code.BbSeededRandom(this.seed + 7);
    const away = this.team(batterPoints, [3, 3, 3]), home = this.team([3, 3, 3], pitcherPoints), bat = code.BbBoxScoreBuilder.emptyBat();
    let runs = 0;
    for (let half = 0; half < halves; half++) {
      const runner = new code.BbAiMatchRunner(new code.BbOneInningFormat(), this.dimensions, this.errors, [away, home], [tuning, tuning], [tuning, tuning]);
      const state = runner.play(new code.BbSeededRandom(random.seed()), undefined, 1);
      runs += state.score[0];
      for (const key of Object.keys(bat)) bat[key] += state.box[0].bat[key];
    }
    return { runs: runs / halves, bat };
  }
}

class SimReport {
  constructor(code) { this.code = code; this.lines = []; }
  line(text = "") { this.lines.push(text); }
  rate(value) { return this.code.BbBaseballFormulas.rateText(value); }
  percent(value) { return (value * 100).toFixed(1) + "%"; }

  basic(tally, games) {
    const f = this.code.BbBaseballFormulas, bat = tally.bat, pa = bat.pa;
    const inPlay = tally.flights.ground + tally.flights.line + tally.flights.fly + tally.flights.pop;
    this.line("# 41번 야구 시뮬레이션 보고서");
    this.line();
    this.line("보통 AI(타자 3/3/3) 대 보통 AI(투수 3/3/3), 9회 1이닝 경기 " + games + "판 · 하프 이닝 " + tally.halves + "개 · 타석 " + pa + "개.");
    this.line();
    this.line("## 1. 목표 대비 (사양서 12.3절)");
    this.line();
    this.line("| 지표 | 결과 | 목표 | 판정 |");
    this.line("|---|---|---|---|");
    const rows = [["타율", f.average(bat), 0.4, 0.03], ["출루율", f.onBase(bat), 0.45, 0.03], ["장타율", f.slugging(bat), 0.78, 0.05], ["타석당 홈런", bat.hr / pa, 0.1, 0.02]];
    for (const [name, value, goal, slack] of rows) this.line("| " + name + " | " + (name === "타석당 홈런" ? this.percent(value) : this.rate(value)) + " | " + (name === "타석당 홈런" ? this.percent(goal) : this.rate(goal)) + " ± " + (name === "타석당 홈런" ? "2.0%p" : this.rate(slack)) + " | " + (Math.abs(value - goal) <= slack ? "맞음" : "벗어남") + " |");
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

  abilities(title, rows, average) {
    this.line("## " + title);
    this.line();
    this.line("| 배분 | 하프 이닝 기대 득점 | 평균 대비 | OPS | 홈런율 | 삼진률 | 판정(±8%) |");
    this.line("|---|---|---|---|---|---|---|");
    const f = this.code.BbBaseballFormulas;
    for (const row of rows) {
      const gap = row.runs / average - 1;
      this.line("| " + row.points.join("/") + " | " + row.runs.toFixed(3) + " | " + (gap >= 0 ? "+" : "") + (gap * 100).toFixed(1) + "% | " + this.rate(f.ops(row.bat)) + " | " + this.percent(row.bat.hr / row.bat.pa) + " | " + this.percent(row.bat.k / row.bat.pa) + " | " + (Math.abs(gap) <= 0.08 ? "안" : "밖") + " |");
    }
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
    this.halves = value("--halves", 4000);
  }

  run() {
    const sim = new BaseballSim(this.seed), report = new SimReport(sim.code), standard = sim.team([3, 3, 3], [3, 3, 3]);
    report.basic(sim.run(this.games, standard, standard), this.games);
    if (this.withAbilities) {
      const splits = sim.code.BbAbilityAllocator.everySplit(sim.code.BbAbilityAllocator.BATTER);
      for (const [title, asBatter] of [["7. 타자 배분 28가지 (컨택/파워/주루) × 표준 투수", true], ["8. 투수 배분 28가지 (제구/구위/변화) × 표준 타자 — 득점이 낮을수록 투수에게 유리", false]]) {
        const rows = splits.map((points) => ({ points, ...sim.halfInningRuns(this.halves, asBatter ? points : [3, 3, 3], asBatter ? [3, 3, 3] : points) }));
        const average = rows.reduce((sum, row) => sum + row.runs, 0) / rows.length;
        rows.sort((a, b) => b.runs - a.runs);
        report.abilities(title, rows, average);
      }
    }
    const text = report.lines.join("\n");
    console.log(text);
    if (this.write) fs.writeFileSync(path.join(__dirname, "..", "docs", "41.baseball-duel", "41.baseball-sim-report.md"), text + "\n", "utf8");
  }
}

new SimCommand(process.argv.slice(2)).run();
