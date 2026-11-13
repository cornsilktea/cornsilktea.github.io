// 41번 야구 조작 흐름 검사 (M3).
// 사람이 타자일 때 화면은 "지켜보기" 시간표로 투구를 시작했다가, 스윙을 누른 순간 실제 결과 시간표로 바꿔 끼운다.
// 이 검사는 BbDuelSession 으로 여러 경기를 돌리며 (1) 미리 보기 판정이 경기 상태를 바꾸지 않는지,
// (2) 바꿔 끼우는 순간까지 두 시간표의 공·투수·타자 위치가 같은지(화면이 튀지 않는지), (3) 경기가 끝까지 진행되는지 본다.
// 사용: node tools/baseball-session-check.js [--games 60]
const fs = require("fs"), vm = require("vm"), path = require("path");

class SessionCheck {
  static FILES = ["motion", "field", "pitch", "batting", "running", "defense", "play", "game", "ai", "drills", "choreo", "session"];
  static STEP = 1 / 30;
  static SAME_METERS = 0.001;
  static LONGEST_GAME_PITCHES = 600;

  constructor(games) {
    this.games = games;
    const folder = path.join(__dirname, "..", "games", "41.baseball-duel");
    const source = SessionCheck.FILES.map((name) => fs.readFileSync(path.join(folder, "41.baseball-" + name + ".js"), "utf8")).join("\n")
      + "\n;({BbDuelSession,BbPlayChoreographer,BbBallparkRegistry,BbBodyDefaults,BbThreeInningFormat,BbAiLevel,BbSeededRandom,BbTimingModel})";
    this.code = vm.runInNewContext(source, { console, Math, Map, Set, Array, Object, Number, Infinity, JSON });
    this.problems = [];
    this.counts = { pitches: 0, swings: 0, takes: 0, finished: 0, kinds: {} };
  }

  note(text) { if (this.problems.length < 12) this.problems.push(text); }

  scriptOf(outcome, session, setting, batter, pitcher) {
    const play = new this.code.BbPlayChoreographer({ outcome, pitcherHand: pitcher.hand, abilities: batter.abilities, setting });
    return { play, script: play.build({ metrics: this.code.BbBodyDefaults.KAYKIT, batsLeft: batter.hand === "L", throwsLeft: pitcher.hand === "L" }) };
  }

  sameUntil(first, second, until, label) {
    for (let seconds = 0; seconds < until; seconds += SessionCheck.STEP) {
      const a = first.ballAt(seconds), b = second.ballAt(seconds);
      if (!!a !== !!b || (a && b && a.point.distanceTo(b.point) > SessionCheck.SAME_METERS)) { this.note(label + " 공 위치가 다름 @" + seconds.toFixed(2)); return; }
      for (const role of ["pitcher", "catcher", "runnerFirst", "runnerSecond", "runnerThird"]) {
        if (first.starts.has(role) !== second.starts.has(role)) { this.note(label + " " + role + " 등장이 다름"); return; }
        if (first.starts.has(role) && first.placementOf(role, seconds).position.distanceTo(second.placementOf(role, seconds).position) > SessionCheck.SAME_METERS) { this.note(label + " " + role + " 위치가 다름 @" + seconds.toFixed(2)); return; }
      }
    }
  }

  playGame(seed) {
    const c = this.code, level = c.BbAiLevel.ALL.normal, hands = seed % 2 ? "L" : "R";
    const team = () => ({ lineup: [c.BbAiLevel.batterSheet(hands)], pitchers: [c.BbAiLevel.pitcherSheet(seed % 3 ? "R" : "L")] });
    const session = new c.BbDuelSession(new c.BbThreeInningFormat(), c.BbBallparkRegistry.MAIN.dimensions, [team(), team()], new c.BbSeededRandom(seed)), press = new c.BbSeededRandom(seed * 7919 + 1);
    for (let pitch = 0; pitch < SessionCheck.LONGEST_GAME_PITCHES && !session.state.finished; pitch++) {
      const setting = session.setting(), batter = session.batter(), pitcher = session.pitcher(), roll = session.roll(session.aiCall(level)), label = "경기 " + seed + " 공 " + pitch;
      const before = JSON.stringify(session.state), preview = session.preview(roll);
      if (JSON.stringify(session.state) !== before) this.note(label + " 미리 보기 판정이 경기 상태를 바꿈");
      if (preview.swing.kind !== "take") this.note(label + " 미리 보기가 지켜보기가 아님");
      const waiting = this.scriptOf(preview, session, setting, batter, pitcher);
      const drawn = press.chance(0.45) ? null : press.gaussian(0, 0.07), offset = drawn !== null && drawn > c.BbTimingModel.SWING_DELAY ? null : drawn, settled = session.settle(roll, offset);
      const real = this.scriptOf(settled.outcome, session, setting, batter, pitcher);
      if (Math.abs(real.play.arriveAt - waiting.play.arriveAt) > 1e-9) this.note(label + " 도착 시각이 다름");
      const pressedAt = offset === null ? waiting.play.arriveAt : waiting.play.arriveAt + offset - c.BbTimingModel.SWING_DELAY;
      this.sameUntil(waiting.script, real.script, pressedAt, label);
      if (!(real.script.duration > 0)) this.note(label + " 장면 길이 0");
      this.counts.pitches++;
      this.counts[offset === null ? "takes" : "swings"]++;
      this.counts.kinds[settled.outcome.kind] = (this.counts.kinds[settled.outcome.kind] || 0) + 1;
    }
    if (session.state.finished) this.counts.finished++;
    else this.note("경기 " + seed + " 이 끝나지 않음");
  }

  run() {
    for (let seed = 1; seed <= this.games; seed++) this.playGame(seed);
    const counts = this.counts;
    console.log("경기 " + this.games + "판 · 끝난 경기 " + counts.finished + " · 공 " + counts.pitches + "개 (스윙 " + counts.swings + " · 지켜보기 " + counts.takes + ")");
    console.log("결과: " + Object.keys(counts.kinds).map((kind) => kind + " " + counts.kinds[kind]).join(" · "));
    if (!this.problems.length) { console.log("모두 통과"); return; }
    this.problems.forEach((problem) => console.log("  문제  " + problem));
    process.exitCode = 1;
  }
}

const gamesAt = process.argv.indexOf("--games");
new SessionCheck(gamesAt > 0 ? Number(process.argv[gamesAt + 1]) : 60).run();
