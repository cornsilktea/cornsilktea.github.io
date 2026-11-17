// 42번 타워 클라임: 시뮬레이션. 실행: node tools/climb-sim.js [판 수=5000] [제한 초=240]
// 조준이 흔들리고 점프 시점이 들쭉날쭉한 봇으로 길마다 도착 비율·평균 시간·추락 횟수를 본다.
const K = require("./climb-load.js")();
const { ClimbBot, ClimbSeededRandom } = require("./climb-bot.js");
const { ClimbRules, TowerLevel, StageProgress, TowerLevelData } = K;

class ClimbSimulation {
  static get SKILLS() {
    return [
      { label: "처음 하는 학생", aimNoise: 0.4, jumpEarly: 0.3, slip: 0.0012 },
      { label: "익숙한 학생", aimNoise: 0.22, jumpEarly: 0.2, slip: 0.0004 },
      { label: "숙련자", aimNoise: 0.08, jumpEarly: 0.12, slip: 0 },
    ];
  }

  constructor(games, limit) { this.games = games; this.limit = limit; this.level = new TowerLevel(TowerLevelData.spec()); }

  play(route, skill, seed) {
    const rules = ClimbBot.startRules(K, this.level, route);
    const bot = new ClimbBot(K, rules, route.steps, skill, new ClimbSeededRandom(seed));
    const result = bot.run(this.limit);
    return { done: result.done, seconds: result.seconds, falls: result.falls, peak: rules.peak, hits: rules.cannonHits, misses: rules.cannonMisses };
  }

  report() {
    const cells = [];
    for (const skill of ClimbSimulation.SKILLS) for (const route of this.level.routes) cells.push({ skill, route });
    const each = Math.max(1, Math.floor(this.games / cells.length));
    let seed = 1000, total = 0;
    console.log("climb-sim: 칸마다 " + each + "판, 제한 " + this.limit + "초");
    console.log("실력".padEnd(10) + "길".padEnd(9) + "도착".padStart(7) + "평균 시간".padStart(9) + "추락".padStart(7) + "평균 최고".padStart(9) + "  발사대 성공/실패");
    for (const { skill, route } of cells) {
      let done = 0, seconds = 0, falls = 0, peak = 0, hits = 0, misses = 0;
      for (let i = 0; i < each; i++) {
        const r = this.play(route, skill, seed++);
        total++;
        if (r.done) { done++; seconds += r.seconds; }
        falls += r.falls; peak += r.peak; hits += r.hits; misses += r.misses;
      }
      console.log(skill.label.padEnd(10) + (route.stage + " " + route.label).padEnd(11) + (Math.round(done / each * 100) + "%").padStart(7) + (done ? (seconds / done).toFixed(1) + "초" : "-").padStart(9)
        + (falls / each).toFixed(2).padStart(7) + ((peak / each).toFixed(1) + "m").padStart(9) + "  " + (route.name.startsWith("hard") ? hits + "/" + misses : ""));
    }
    console.log("모두 " + total + "판");
  }
}

new ClimbSimulation(Number(process.argv[2]) || 5000, Number(process.argv[3]) || 240).report();
