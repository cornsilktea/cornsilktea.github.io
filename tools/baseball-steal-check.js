// 41번 야구 도루·견제·니어 포스아웃·실책 수비수·홈런 판정 검사(규칙 엔진만, 화면 없음).
// 사용: npx tsc -p . 다음에 node tools/baseball-steal-check.js
const BaseballCode = require("./baseball-load.js");
const K = BaseballCode.load();

class StealCheck {
  constructor() { this.passed = 0; this.failed = []; }

  expect(label, ok) { if (ok) this.passed++; else this.failed.push(label); }

  runner(id, speed) { return { id, earned: true, speed }; }

  engine() {
    const team = K.BbAiLevel.team("R");
    return new K.BbMatchEngine(new K.BbOneInningFormat(), K.BbBallparkRegistry.MAIN.dimensions, new K.BbNoErrorPolicy(), [team, K.BbAiLevel.team("R")]);
  }

  rollFor(engine, pitch, kinds) {
    for (let seed = 1; seed < 5000; seed++) {
      const roll = engine.roll({ pitch, aim: { u: 2.2, v: 0 } }, seed);
      if (kinds.indexOf(engine.preview(roll).kind) >= 0) return roll;
    }
    throw new Error("투구를 찾지 못함 " + kinds.join(","));
  }

  rules() {
    const R = K.BbStealRules, a = this.runner("a", 3), b = this.runner("b", 3), c = this.runner("c", 3);
    this.expect("1루만: 1루 도루 가능", R.canSteal([a, null, null], 1) && !R.canSteal([a, null, null], 2));
    this.expect("1·2루: 둘 다 가능, 1루 버튼은 둘 다 뜀", R.canSteal([a, b, null], 1) && R.canSteal([a, b, null], 2) && R.pressed([a, b, null], 1) === 3 && R.pressed([a, b, null], 2) === 2);
    this.expect("2·3루: 도루 불가", !R.canSteal([null, b, c], 2) && R.pressed([null, b, c], 2) === 0);
    this.expect("만루: 도루 불가", !R.canSteal([a, b, c], 1) && !R.canSteal([a, b, c], 2));
    this.expect("1·3루: 1루만 가능", R.canSteal([a, null, c], 1) && !R.canSteal([a, null, c], 2) && R.pressed([a, null, c], 1) === 1);
    this.expect("잘못된 열쇠 정리", R.clean([a, b, null], 1) === 0 && R.clean([a, null, null], 3) === 1 && R.clean([null, null, null], 3) === 0);
    this.expect("예시 수치: 구위3+포수5+직구 = 8, 주루7+2 = 9", R.defense(3, 5, "ft") === 8 && R.offense(this.runner("x", 7), 2) === 9);
    this.expect("변화구는 수비 -1", R.defense(3, 3, "cv") === 5 && R.defense(3, 3, "kn") === 5);
    this.expect("3루 도루가 더 어려움", R.offense(this.runner("x", 5), 3) < R.offense(this.runner("x", 5), 2));
  }

  steal(label, speed, pitch, safe) {
    const engine = this.engine(), state = engine.state;
    state.bases = [this.runner("fast", speed), null, null];
    const roll = this.rollFor(engine, pitch, ["ball"]), settled = engine.settle(roll, null, 1), play = settled.outcome.steal;
    this.expect(label + ": 도루 판정 있음", !!play && play.target === 2);
    if (!play) return;
    this.expect(label + (safe ? ": 세이프" : ": 아웃"), play.runners[0].out === !safe);
    this.expect(label + ": 주자 위치", safe ? state.bases[1] && state.bases[1].id === "fast" && !state.bases[0] : !state.bases[0] && !state.bases[1] && state.outs === 1);
  }

  engineSteals() {
    this.steal("주루7 직구", 7, "ft", true);
    this.steal("주루3 직구", 3, "ft", false);
    this.steal("주루4 직구(같으면 실패)", 4, "ft", false);
    this.steal("주루4 커브", 4, "cv", true);
    const engine = this.engine(), state = engine.state;
    state.bases = [this.runner("one", 7), this.runner("two", 7), null];
    engine.settle(this.rollFor(engine, "ft", ["ball"]), null, 3);
    this.expect("이중 도루: 2·3루", state.bases[1] && state.bases[1].id === "one" && state.bases[2] && state.bases[2].id === "two");
    const third = this.engine();
    third.state.bases = [null, this.runner("two", 5), null];
    third.settle(this.rollFor(third, "ft", ["ball"]), null, 2);
    this.expect("3루 도루 주루5 직구 실패(6 대 6)", third.state.outs === 1 && !third.state.bases[1] && !third.state.bases[2]);
    let contact = 0;
    for (let seed = 1; seed < 400 && contact < 20; seed++) {
      const swing = this.engine();
      swing.state.bases = [this.runner("one", 7), null, null];
      const hit = swing.settle(swing.roll({ pitch: "ft", aim: { u: 0, v: 0 } }, seed), 0, 1);
      if (hit.outcome.kind !== "inPlay" && hit.outcome.kind !== "foul") continue;
      contact++;
      this.expect("공을 맞히면 도루 판정 없음 (" + seed + ")", !hit.outcome.steal);
    }
    this.expect("맞힌 공 사례 있음", contact > 0);
  }

  lastOut() {
    const engine = this.engine(), state = engine.state, batterBefore = engine.lineup().currentIndex(), half = state.half;
    state.outs = 2;
    state.balls = 2;
    state.bases = [this.runner("slow", 1), null, null];
    const settled = engine.settle(this.rollFor(engine, "ft", ["ball"]), null, 1);
    this.expect("도루 실패 3아웃: 공수 교대", settled.note.halfOver && state.half !== half && state.outs === 0);
    this.expect("도루 실패 3아웃: 볼카운트 초기화", state.balls === 0 && state.strikes === 0);
    const sameTeam = engine.lineup(half === 0 ? 0 : 1);
    this.expect("도루 실패 3아웃: 타자 그대로(다음 이닝 선두)", sameTeam.currentIndex() === batterBefore);
  }

  pickoffs() {
    const engine = this.engine(), state = engine.state, roster = engine.roster(), stamina = roster.stamina().level(), pitches = state.pitchCount;
    state.bases = [this.runner("one", 7), null, null];
    const quiet = engine.pickoff(1, 0);
    this.expect("견제(도루 안 함): 아무 일 없음", quiet && !quiet.play.caught && state.bases[0] && state.bases[0].id === "one" && state.outs === 0);
    this.expect("견제: 체력 1 감소, 투구 수 그대로", Math.abs(roster.stamina().level() - (stamina - 1)) < 1e-9 && state.pitchCount === pitches);
    const caught = engine.pickoff(1, 1);
    this.expect("도루 중 견제: 다음 루에서 아웃", caught && caught.play.caught && !state.bases[0] && !state.bases[1] && state.outs === 1);
    this.expect("견제 두 번: 체력 2 감소", Math.abs(roster.stamina().level() - (stamina - 2)) < 1e-9);
    this.expect("주자 없는 루 견제 거절", engine.pickoff(2, 0) === null);
    const double = this.engine();
    double.state.bases = [this.runner("one", 3), this.runner("two", 3), null];
    const play = double.pickoff(1, 3);
    this.expect("이중 도루 중 1루 견제: 1루 주자 아웃, 2루 주자 3루", play.play.caught && double.state.outs === 1 && !double.state.bases[0] && !double.state.bases[1] && double.state.bases[2] && double.state.bases[2].id === "two");
    const other = this.engine();
    other.state.bases = [this.runner("one", 3), this.runner("two", 3), null];
    other.pickoff(1, 2);
    this.expect("다른 루 견제: 도루 취소, 아무 일 없음", other.state.outs === 0 && other.state.bases[0].id === "one" && other.state.bases[1].id === "two");
  }

  replay() {
    const engine = this.engine(), log = [];
    engine.state.bases = [this.runner("x1", 7), null, null];
    const fold = new K.BbGameLogFold(new K.BbOneInningFormat(), K.BbBallparkRegistry.MAIN.dimensions, new K.BbNoErrorPolicy(), [K.BbAiLevel.team("R"), K.BbAiLevel.team("R")]);
    const live = fold.engine([]);
    for (let index = 0; index < 60 && !live.state.finished; index++) {
      const steal = index % 3 === 0 ? 3 : 0;
      if (index % 7 === 3) {
        const base = live.state.bases.findIndex((runner) => !!runner) + 1;
        if (base > 0 && live.pickoff(base, index % 2 ? 1 : 0)) { log.push({ pickoff: base, steal: index % 2 ? 1 : 0 }); continue; }
      }
      const roll = live.roll({ pitch: index % 2 ? "cv" : "ft", aim: { u: 0.3, v: 0 } }, 1000 + index), offset = index % 4 === 0 ? 0.01 : null;
      live.settle(roll, offset, steal);
      log.push({ pitch: roll.pitch, aim: roll.aim, seed: roll.seed, contactOffset: offset, steal });
    }
    const again = fold.engine(log);
    this.expect("로그 다시 접기: 상태 같음", JSON.stringify(again.state) === JSON.stringify(live.state));
    this.expect("로그 다시 접기: 체력 같음", again.roster(0).stamina().level() === live.roster(0).stamina().level() && again.roster(1).stamina().level() === live.roster(1).stamina().level());
  }

  nearForce() {
    const dims = K.BbBallparkRegistry.MAIN.dimensions, resolver = new K.BbPlayResolver(dims, new K.BbAutoFielding(), new K.BbAutoBaseRunning(), new K.BbNoErrorPolicy());
    let forced = 0, toFirstOnly = 0;
    for (let spray = -40; spray <= -8; spray += 2) for (let exit = 70; exit <= 120; exit += 10) {
      const ball = { exitSpeed: exit, launch: 2, spray, carry: K.BbBattedBallPhysics.carry(exit, 2), hang: K.BbBattedBallPhysics.hangSeconds(exit, 2), flight: "ground", foul: false };
      const script = resolver.resolve({ outs: 2, bases: [this.runner("a", 3), this.runner("b", 3), null], batter: this.runner("bat", 3), abilities: { contact: 3, power: 3, speed: 3, defense: 3 } }, ball, new K.BbSeededRandom(spray * 100 + exit));
      if (script.result === "FIELDERS_CHOICE" && script.outsAdded === 1) forced++;
      if (script.result === "GROUND_OUT") toFirstOnly++;
      const throwEvent = script.events.find((event) => event.kind === "throw");
      if (script.outsAdded === 1 && throwEvent && script.fielder === "SS") {
        const spot = script.events.find((event) => event.kind === "field").spot, pick = { x: spot[0], z: spot[1] };
        const used = K.BbDiamond.distance(pick, K.BbDiamond.base(throwEvent.base)), first = K.BbDiamond.distance(pick, K.BbDiamond.base(1));
        this.expect("2사 1·2루 유격수 땅볼: 1루보다 가까운 루로 (" + spray + "," + exit + ")", used <= first);
      }
    }
    this.expect("2사 1·2루 내야 땅볼에서 포스아웃이 나옴", forced > 0);
    console.log("  2사 1·2루 왼쪽 땅볼: 니어 포스아웃 " + forced + "번, 1루 아웃 " + toFirstOnly + "번");
  }

  bobble() {
    const dims = K.BbBallparkRegistry.MAIN.dimensions, always = new K.BbInfieldGroundBallErrorPolicy(1), resolver = new K.BbPlayResolver(dims, new K.BbAutoFielding(), new K.BbAutoBaseRunning(), always);
    let checked = 0;
    for (let spray = -6; spray <= 6; spray += 3) for (let exit = 50; exit <= 80; exit += 10) {
      const ball = { exitSpeed: exit, launch: 2, spray, carry: K.BbBattedBallPhysics.carry(exit, 2), hang: K.BbBattedBallPhysics.hangSeconds(exit, 2), flight: "ground", foul: false };
      const script = resolver.resolve({ outs: 0, bases: [null, null, null], batter: this.runner("bat", 3), abilities: { contact: 3, power: 3, speed: 3, defense: 3 } }, ball, new K.BbSeededRandom(exit));
      if (script.result !== "ERROR") continue;
      checked++;
      const picked = script.events.filter((event) => event.kind === "field")[1];
      this.expect("실책 뒤 공은 가까운 내야수가 주움 (" + spray + "," + exit + " → " + picked.who + ")", ["LF", "CF", "RF"].indexOf(picked.who) < 0);
      this.expect("실책 뒤 타자 1루 세이프", script.batterReached >= 1 && script.outsAdded === 0);
    }
    this.expect("투수 앞 실책 사례 있음", checked > 0);
  }

  homeRuns() {
    const dims = K.BbBallparkRegistry.MAIN.dimensions, resolver = new K.BbPlayResolver(dims, new K.BbAutoFielding(), new K.BbAutoBaseRunning(), new K.BbNoErrorPolicy());
    let homers = 0, bad = 0;
    for (let launch = 10; launch <= 45; launch += 1) for (let exit = 140; exit <= 190; exit += 2) for (let spray = -40; spray <= 40; spray += 10) {
      const ball = { exitSpeed: exit, launch, spray, carry: K.BbBattedBallPhysics.carry(exit, launch), hang: K.BbBattedBallPhysics.hangSeconds(exit, launch), flight: K.BbBattedBallPhysics.kindOf(launch), foul: false };
      const script = resolver.resolve({ outs: 0, bases: [null, null, null], batter: this.runner("bat", 3), abilities: { contact: 3, power: 3, speed: 3, defense: 3 } }, ball, new K.BbSeededRandom(1));
      if (!script.events.some((event) => event.kind === "homeRun")) continue;
      homers++;
      const fence = dims.fenceDistance(spray);
      if (K.BbBattedBallPhysics.heightAt(fence, ball.carry, launch) < dims.wallHeight + 0.4) bad++;
    }
    this.expect("홈런은 모두 펜스 위로 0.4m 이상", homers > 0 && bad === 0);
  }

  ai() {
    const engine = this.engine(), random = new K.BbSeededRandom(5), runner = new K.BbAiRunner(K.BbAiLevel.ALL.normal);
    engine.state.bases = [this.runner("a", 7), null, null];
    let steals = 0;
    for (let index = 0; index < 400; index++) if (runner.decide(engine, random)) steals++;
    this.expect("AI: 빠른 주자는 가끔 도루", steals > 40 && steals < 300);
    engine.state.bases = [this.runner("a", 1), null, null];
    let slow = 0;
    for (let index = 0; index < 400; index++) if (runner.decide(engine, random)) slow++;
    this.expect("AI: 느린 주자는 도루 안 함", slow === 0);
    this.expect("AI 견제: 한 타자에 한 번까지", runner.pickoffBase(engine, 1, random) === null);
  }

  run() {
    this.rules();
    this.engineSteals();
    this.lastOut();
    this.pickoffs();
    this.replay();
    this.nearForce();
    this.bobble();
    this.homeRuns();
    this.ai();
    if (this.failed.length) { console.log("실패 " + this.failed.length + "개:\n- " + this.failed.join("\n- ")); process.exitCode = 1; }
    else console.log("모두 통과 (" + this.passed + "항목)");
  }
}

new StealCheck().run();
