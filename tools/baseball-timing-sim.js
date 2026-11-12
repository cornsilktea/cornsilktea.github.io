// 41번 야구 타이밍 시뮬레이션 (사양서 17.3절).
// 가상 사람(타이밍 흩어짐 40~120ms, 한쪽으로 치우치는 버릇)을 만들어 정타 폭 배율별 타율·정타율을 계산한다.
// "어느 값에서 목표 타율 .400 이 나오는지" 찾는 표다. 사용: node tools/baseball-timing-sim.js [--games 1500]
const BaseballCode = require("./baseball-load.js");

class TimingSim {
  static DEVIATIONS = [0.04, 0.05, 0.062, 0.075, 0.09, 0.105, 0.12];
  static WIDTH_SCALES = [0.7, 1, 1.3, 1.6, 2];

  constructor(games) {
    this.games = games;
    this.code = BaseballCode.load();
    this.baseWidths = this.code.BbTimingModel.WIDTH_POINTS.map(([off, seconds]) => [off, seconds]);
  }

  run(deviation, widthScale) {
    const c = this.code, normal = c.BbAiLevel.ALL.normal, human = Object.assign({}, normal, { timingDeviation: deviation });
    c.BbTimingModel.WIDTH_POINTS = this.baseWidths.map(([off, seconds]) => [off, seconds * widthScale]);
    const team = { lineup: [c.BbAiLevel.batterSheet("R")], pitchers: [c.BbAiLevel.pitcherSheet("R")] }, bat = c.BbBoxScoreBuilder.emptyBat(), random = new c.BbSeededRandom(4100);
    let swings = 0, perfect = 0;
    for (let game = 0; game < this.games; game++) {
      const runner = new c.BbAiMatchRunner(new c.BbOneInningFormat(), new c.BbMainBallpark(), new c.BbInfieldGroundBallErrorPolicy(0.05), [team, team], [normal, normal], [human, human]);
      const state = runner.play(new c.BbSeededRandom(random.seed()), (unused, outcome) => { if (outcome.swing.kind !== "take") { swings++; if (outcome.swing.band === "perfect") perfect++; } });
      for (const side of state.box) for (const key of Object.keys(bat)) bat[key] += side.bat[key];
    }
    return { average: c.BbBaseballFormulas.average(bat), homers: bat.hr / bat.pa, strikeouts: bat.k / bat.pa, perfect: perfect / swings };
  }

  report() {
    const rate = this.code.BbBaseballFormulas.rateText;
    console.log("가상 사람의 타이밍 흩어짐(표준편차) × 정타 폭 표 배율 → 타율 / 정타율 / 홈런율 / 삼진률  (★ = 타율 .370~.430)");
    console.log("흩어짐   | " + TimingSim.WIDTH_SCALES.map((scale) => ("폭 ×" + scale).padEnd(26)).join("| "));
    for (const deviation of TimingSim.DEVIATIONS) {
      const cells = TimingSim.WIDTH_SCALES.map((scale) => {
        const row = this.run(deviation, scale), star = row.average >= 0.37 && row.average <= 0.43 ? "★" : " ";
        return (star + rate(row.average) + " " + (row.perfect * 100).toFixed(0) + "% " + (row.homers * 100).toFixed(1) + "% " + (row.strikeouts * 100).toFixed(1) + "%").padEnd(26);
      });
      console.log((Math.round(deviation * 1000) + "ms").padEnd(9) + "| " + cells.join("| "));
    }
    console.log("\n보통 AI 는 흩어짐 62ms · 폭 ×1 이다. 사람의 흩어짐은 타이밍 연습장(tools/baseball-timing-lab.html)의 '흩어짐' 값으로 잰다.");
  }
}

const gamesAt = process.argv.indexOf("--games");
new TimingSim(gamesAt >= 0 ? Number(process.argv[gamesAt + 1]) : 1500).report();
