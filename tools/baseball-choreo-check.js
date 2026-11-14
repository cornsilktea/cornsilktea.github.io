// 41번 야구 연출 시간표 검사 (M2).
// AI 경기를 여러 판 돌려 공 하나마다 연출 시간표(BbPlayChoreographer)를 만들고, 1/30초씩 넘기며
// 선수 위치·자세·공 위치가 숫자인지, 공이 순간 이동하지 않는지, 선수가 0.4초 넘게(몸 날리기보다 길게) 너무 빨리 달리지 않는지, 장면 길이가 적당한지 본다.
// 사용: node tools/baseball-choreo-check.js [--pitches 4000]
const fs = require("fs"), vm = require("vm"), path = require("path");

class ChoreoCheck {
  static FILES = ["motion", "field", "pitch", "batting", "running", "defense", "play", "game", "ai", "drills", "choreo", "live"];
  static STEP = 1 / 30;
  static BALL_JUMP_METERS = 2.6;
  static RUN_METERS_PER_SECOND = 13;
  static DIVE_FRAMES = 12;
  static LONGEST_SCENE_SECONDS = 28;

  constructor(pitches) {
    this.pitches = pitches;
    const folder = path.join(__dirname, "..", "games", "41.baseball-duel");
    const source = ChoreoCheck.FILES.map((name) => fs.readFileSync(path.join(folder, "41.baseball-" + name + ".js"), "utf8")).join("\n")
      + "\n;({BbAiGameFeed,BbPlayChoreographer,BbSwapChoreographer,BbBallparkRegistry,BbBodyDefaults,BbFieldGeometry})";
    this.code = vm.runInNewContext(source, { console, Math, Map, Set, Array, Object, Number, Infinity, JSON });
    this.problems = new Map();
    this.byResult = new Map();
  }

  note(kind, detail) {
    const list = this.problems.get(kind) || [];
    if (list.length < 3) list.push(detail);
    list.count = (list.count || 0) + 1;
    this.problems.set(kind, list);
  }

  inspect(script, label, fastReplay = false) {
    if (!(script.duration > 0) || script.duration > ChoreoCheck.LONGEST_SCENE_SECONDS) this.note("장면 길이", label + " " + script.duration.toFixed(1) + "초");
    const roles = script.roles(), last = new Map(), streak = new Map();
    let lastBall = null, lastHolder = null;
    for (let seconds = 0; seconds <= script.duration; seconds += ChoreoCheck.STEP) {
      for (const role of roles) {
        const spot = script.placementOf(role, seconds).position, frame = script.frameOf(role, seconds);
        if (![spot.x, spot.y, spot.z].every(Number.isFinite)) { this.note("위치가 숫자가 아님", label + " " + role + " " + seconds.toFixed(2)); return; }
        if (frame && ![frame.hips.x, frame.handLeft.y, frame.handRight.z, frame.footLeft.x].every(Number.isFinite)) { this.note("자세가 숫자가 아님", label + " " + role + " " + seconds.toFixed(2)); return; }
        const before = last.get(role);
        const fast = !!before && !fastReplay && script.gaitOf(role, seconds) !== "slide" && before.distanceTo(spot) / ChoreoCheck.STEP > ChoreoCheck.RUN_METERS_PER_SECOND;
        streak.set(role, fast ? (streak.get(role) || 0) + 1 : 0);
        if (fast && streak.get(role) === ChoreoCheck.DIVE_FRAMES) this.note("너무 빠른 이동", label + " " + role + " " + seconds.toFixed(2) + "초 " + (before.distanceTo(spot) / ChoreoCheck.STEP).toFixed(0) + "m/s");
        last.set(role, spot);
      }
      const ball = script.ballAt(seconds);
      if (!ball) continue;
      if (![ball.point.x, ball.point.y, ball.point.z].every(Number.isFinite)) { this.note("공 위치가 숫자가 아님", label + " " + seconds.toFixed(2)); return; }
      if (lastBall && ball.holder === lastHolder && lastBall.distanceTo(ball.point) > ChoreoCheck.BALL_JUMP_METERS) this.note("공 순간 이동", label + " " + seconds.toFixed(2) + "초 " + lastBall.distanceTo(ball.point).toFixed(1) + "m");
      if (lastBall && ball.holder !== lastHolder && ball.holder && lastBall.distanceTo(ball.point) > ChoreoCheck.BALL_JUMP_METERS) this.note("포구 때 공이 글러브와 떨어짐", label + " " + ball.holder + " " + seconds.toFixed(2) + "초 " + lastBall.distanceTo(ball.point).toFixed(1) + "m");
      lastBall = ball.point; lastHolder = ball.holder;
    }
  }

  stealScenes(feed, setup) {
    const c = this.code, bags = [null, c.BbFieldGeometry.FIRST, c.BbFieldGeometry.SECOND, c.BbFieldGeometry.THIRD];
    const roleOf = { s1: "runnerFirst", s2: "runnerSecond" };
    const kinds = [
      ["도루 아웃", (speed) => ({ steal: { target: 2, offense: 0, defense: 0, runners: [{ id: "s1", from: 1, out: true, speed }] } }), false],
      ["도루 세이프", (speed) => ({ steal: { target: 2, offense: 0, defense: 0, runners: [{ id: "s1", from: 1, out: false, speed }] } }), false],
      ["이중 도루", (speed) => ({ steal: { target: 3, offense: 0, defense: 0, runners: [{ id: "s2", from: 2, out: speed < 4, speed }, { id: "s1", from: 1, out: false, speed }] } }), true],
      ["견제 세이프", () => ({ pickoff: { base: 1, caught: false, runners: [] } }), false],
      ["견제 아웃 1루", (speed) => ({ pickoff: { base: 1, caught: true, runners: [{ id: "s2", from: 2, out: false, speed }, { id: "s1", from: 1, out: true, speed }] } }), true],
      ["견제 아웃 2루", (speed) => ({ pickoff: { base: 2, caught: true, runners: [{ id: "s2", from: 2, out: true, speed }, { id: "s1", from: 1, out: false, speed }] } }), true]
    ];
    let made = 0;
    for (let index = 0; made < kinds.length * 7 && index < 5000; index++) {
      const live = feed.next();
      if (live.outcome.kind !== "ball" && live.outcome.kind !== "calledStrike") continue;
      const [label, extra, two] = kinds[made % kinds.length], speed = 1 + Math.floor(made / kinds.length), add = extra(speed);
      made++;
      const cue = Object.assign({}, live, { setting: { outs: 0, runners: ["s1", two ? "s2" : null, null] } });
      if (add.steal) cue.outcome = Object.assign({}, live.outcome, { steal: add.steal });
      if (add.pickoff) cue.pickoff = add.pickoff;
      let script;
      try { script = new c.BbPlayChoreographer(cue).build(setup); } catch (error) { this.note("도루·견제 장면 오류", label + " " + error.message); continue; }
      this.inspect(script, label + " 주루" + speed);
      const runners = add.steal ? add.steal.runners : add.pickoff.runners;
      runners.forEach((entry) => {
        const end = script.placementOf(roleOf[entry.id], script.duration).position, bag = bags[entry.from + 1];
        if (!entry.out && end.distanceTo(bag) > 1.5) this.note("도루 주자가 다음 루에 닿지 않음", label + " " + entry.id + " " + end.distanceTo(bag).toFixed(1) + "m");
      });
      if (add.pickoff && !add.pickoff.caught) {
        const end = script.placementOf("runnerFirst", script.duration).position;
        if (end.distanceTo(c.BbFieldGeometry.FIRST) > 3.5) this.note("견제 뒤 주자가 1루 근처에 없음", label + " " + end.distanceTo(c.BbFieldGeometry.FIRST).toFixed(1) + "m");
      }
      const tally = this.byResult.get(label) || { count: 0, seconds: 0, longest: 0 };
      tally.count++; tally.seconds += script.duration; tally.longest = Math.max(tally.longest, script.duration);
      this.byResult.set(label, tally);
    }
  }

  run() {
    const c = this.code, setup = { metrics: c.BbBodyDefaults.KAYKIT, batsLeft: false, throwsLeft: false };
    const feed = new c.BbAiGameFeed(c.BbBallparkRegistry.MAIN.dimensions, "R", "R", 4141);
    for (let index = 0; index < this.pitches; index++) {
      const live = feed.next(), result = live.outcome.script ? live.outcome.script.result : live.outcome.kind;
      const label = "#" + index + " " + result;
      let script;
      try { script = new c.BbPlayChoreographer(live).build(setup); } catch (error) { this.note("만들다 오류", label + " " + error.message); continue; }
      const tally = this.byResult.get(result) || { count: 0, seconds: 0, longest: 0 };
      tally.count++; tally.seconds += script.duration; tally.longest = Math.max(tally.longest, script.duration);
      this.byResult.set(result, tally);
      this.inspect(script, label);
    }
    for (const entering of [false, true]) this.inspect(new c.BbSwapChoreographer(entering, 1).build(setup), "공수 교대", true);
    this.stealScenes(feed, setup);
    console.log("결과 | 횟수 | 평균 길이(초) | 가장 긴 장면(초)");
    for (const [result, tally] of this.byResult) console.log(result + " | " + tally.count + " | " + (tally.seconds / tally.count).toFixed(1) + " | " + tally.longest.toFixed(1));
    let total = 0;
    for (const [kind, list] of this.problems) { total += list.count; console.log("문제: " + kind + " " + list.count + "건 — 예: " + list.join(" / ")); }
    console.log(total ? "\n문제 " + total + "건" : "\n모두 통과 (" + this.pitches + "구)");
    process.exit(total ? 1 : 0);
  }
}

const at = process.argv.indexOf("--pitches");
new ChoreoCheck(at >= 0 ? Number(process.argv[at + 1]) : 4000).run();
