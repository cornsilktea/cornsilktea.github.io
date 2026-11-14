// 41번 야구 규칙 엔진 단위 검사 (사양서 17.1절). 사용: npx tsc -p . 다음에 node tools/baseball-unit.js
const BaseballCode = require("./baseball-load.js");

class Checks {
  constructor() { this.passed = 0; this.failed = []; this.group = ""; }
  section(name) { this.group = name; }
  ok(condition, label) { if (condition) this.passed++; else this.failed.push("[" + this.group + "] " + label); }
  near(actual, expected, slack, label) { this.ok(Math.abs(actual - expected) <= slack, label + " (값 " + actual + ", 기대 " + expected + ")"); }
  finish() {
    this.failed.forEach((line) => console.log("실패  " + line));
    console.log(this.failed.length ? "실패 " + this.failed.length + "건 / 통과 " + this.passed + "건" : "모두 통과 (" + this.passed + "항목)");
    process.exit(this.failed.length ? 1 : 0);
  }
}

class BaseballUnit {
  constructor() {
    this.code = BaseballCode.load();
    this.check = new Checks();
    this.park = new this.code.BbMainBallpark();
  }

  abilities(control, power, breaking) { return { control, power, breaking }; }
  batter(contact = 3, power = 3, speed = 3) { return { contact, power, speed }; }
  runner(id) { return { id, earned: true }; }
  resolver(errors) { const c = this.code; return new c.BbPlayResolver(this.park, new c.BbAutoFielding(), new c.BbAutoBaseRunning(), errors || new c.BbNoErrorPolicy()); }

  ball(exitSpeed, launch, spray) {
    const p = this.code.BbBattedBallPhysics;
    return { exitSpeed, launch, spray, carry: p.carry(exitSpeed, launch), hang: p.hangSeconds(exitSpeed, launch), flight: p.kindOf(launch), foul: Math.abs(spray) > 45 };
  }

  play(outs, bases, ball, errors, seed = 1) {
    const filled = bases.map((on, index) => on ? this.runner("b" + (index + 1)) : null);
    return this.resolver(errors).resolve({ outs, bases: filled, batter: this.runner("bat"), abilities: this.batter() }, ball, new this.code.BbSeededRandom(seed));
  }

  outcome(kind, script) {
    const roll = { pitch: "ft", aim: { u: 0, v: 0 }, arrive: { u: 0, v: 0 }, speed: 136.5, flightSeconds: 1, timingNoise: 0, seed: 1 };
    return { kind, roll, swing: { kind: kind === "ball" || kind === "calledStrike" ? "take" : "contact", band: "perfect", adjusted: 0, width: 0.05, ball: this.ball(150, 28, 0) }, script: script || null };
  }

  script(result, outsAdded, basesAfter, scored) {
    return { result, outsAdded, basesAfter, scored, batterReached: 0, fielder: null, distance: 100, events: [] };
  }

  samplerStaysInRange() {
    const c = this.code, check = this.check;
    check.section("1. 투구 위치 표본");
    for (const kind of c.BbPitchCatalog.ALL) for (let control = 1; control <= 7; control++) for (const hand of ["R", "L"]) {
      const abilities = this.abilities(control, 3, 4), random = new c.BbSeededRandom(control * 31 + kind.id.charCodeAt(0)), angle = kind.axisRadians(hand);
      let worst = 0;
      for (let index = 0; index < 10000; index++) {
        const point = c.BbPitchLocationSampler.sample({ u: 0.3, v: -0.2 }, kind, abilities, hand, random), du = point.u - 0.3, dv = point.v + 0.2;
        const along = (du * Math.cos(angle) + dv * Math.sin(angle)) / kind.longDeviation(abilities), across = (-du * Math.sin(angle) + dv * Math.cos(angle)) / kind.shortDeviation(abilities);
        worst = Math.max(worst, Math.hypot(along, across));
      }
      check.ok(worst <= kind.cutRadius + 1e-9, kind.label + " 제구 " + control + " " + hand + " 표본이 절단 범위 안");
    }
  }

  aimLimiterKeepsBallOffBatter() {
    const c = this.code, check = this.check;
    check.section("2. 조준 제한(사구 0)");
    let worst = 0;
    for (const kind of c.BbPitchCatalog.ALL) for (const control of [1, 4, 7]) for (const breaking of [1, 7]) for (const hand of ["R", "L"]) {
      const abilities = this.abilities(control, 3, breaking), random = new c.BbSeededRandom(77);
      for (let u = -3; u <= 3; u += 1.5) for (let v = -3; v <= 3; v += 1.5) {
        const aim = c.BbAimLimiter.clamp({ u, v }, kind, abilities, hand);
        for (let index = 0; index < 150; index++) {
          const point = c.BbPitchLocationSampler.sample(aim, kind, abilities, hand, random);
          worst = Math.max(worst, Math.abs(point.u), Math.abs(point.v));
        }
      }
    }
    check.ok(worst <= c.BbPitchTuning.AIM_LIMIT + 1e-9, "어떤 표본도 ±2.2 밖으로 안 감 (최대 " + worst.toFixed(3) + ")");
  }

  strikeZoneIsExact() {
    const judge = this.code.BbStrikeZoneJudge, check = this.check;
    check.section("3. 스트라이크 판정");
    check.ok(judge.isStrike({ u: 1, v: 1 }) && judge.isStrike({ u: -1, v: 0 }) && judge.isStrike({ u: 0, v: -1 }), "경계는 스트라이크");
    check.ok(!judge.isStrike({ u: 1.0001, v: 0 }) && !judge.isStrike({ u: 0, v: -1.0001 }), "바로 바깥은 볼");
    let same = true;
    for (let index = 0; index < 100; index++) same = same && judge.isStrike({ u: 0.999, v: -0.999 });
    check.ok(same, "같은 입력 100번 같은 판정");
    check.ok(judge.inside({ u: 0.8, v: 0 }, "R") === 0.8 && judge.inside({ u: 0.8, v: 0 }, "L") === -0.8, "몸쪽 좌표는 타자 손에 따라 뒤집힘");
  }

  abilityRules() {
    const c = this.code, check = this.check;
    check.section("4. 능력치·구종 칩");
    const splits = c.BbAbilityAllocator.everySplit(c.BbAbilityAllocator.BATTER);
    check.ok(splits.length === 149, "배분 149가지 (실제 " + splits.length + ")");
    check.ok(splits.every((split) => split.length === 4 && split.reduce((a, b) => a + b, 0) === 12 && split.every((value) => value >= 1 && value <= 7)), "4종, 합 12, 각 1~7");
    const allocator = new c.BbAbilityAllocator(c.BbAbilityAllocator.PITCHER);
    check.ok(allocator.points.join() === "3,3,3,3" && allocator.spare() === 0, "3/3/3/3 시작, 여분 0");
    check.ok(!allocator.raise(0), "여분 없으면 못 올림");
    check.ok(allocator.lower(1) && allocator.raise(0) && allocator.points.join() === "4,2,3,3", "내린 뒤 올리기");
    allocator.lower(1);
    check.ok(!allocator.lower(1), "1 밑으로 못 내림");
    check.ok([1, 2, 3, 4, 5, 6, 7].map((value) => c.BbPitchSelection.slotsFor(value)).join() === "1,1,2,2,3,3,4", "변화 포인트별 구종 수");
    const selection = new c.BbPitchSelection(3);
    check.ok(selection.usable().join() === "ft,cv,sl" && selection.spare() === 0, "변화 3 기본 직구+커브+슬라이더");
    check.ok(!selection.toggle("ch"), "남은 수 0이면 다른 칩 못 켬");
    check.ok(selection.toggle("cv") && selection.spare() === 1 && selection.toggle("ch") && selection.usable().join() === "ft,sl,ch", "끄고 다른 구종으로 교체");
    check.ok(!new c.BbPitchSelection(6).isUnlocked("kn") && new c.BbPitchSelection(7).usable().join() === "ft,cv,sl,ch,kn", "너클은 변화 7에서만");
    const grown = new c.BbPitchSelection(1);
    grown.setBreaking(5);
    check.ok(grown.usable().join() === "ft,cv,sl,ch", "포인트를 올리면 순서대로 켜짐");
    grown.setBreaking(2);
    check.ok(grown.usable().join() === "ft,cv", "내리면 뒤 칩부터 꺼짐");
    const full = new c.BbPitchSelection(7);
    full.setBreaking(6);
    check.ok(!full.isOn("kn") && full.usable().length === 4, "7 밑으로 내리면 너클이 먼저 꺼짐");
    check.near(c.BbPitchKind.fastballSpeed(1), 129.5, 1e-9, "구위 1 직구 구속");
    check.near(c.BbPitchKind.fastballSpeed(7), 150.5, 1e-9, "구위 7 직구 구속");
    check.near(c.BbBatterAbilityModel.leniency(7), 1.56, 1e-9, "컨택 7 배율(1점당 0.14)");
    check.near(c.BbBatterAbilityModel.firstBaseSeconds(3), 4.1, 1e-9, "주루 3 1루 도달");
  }

  countAndBaseTransitions() {
    const c = this.code, check = this.check, rules = new c.BbMatchRules(new c.BbOneInningFormat());
    check.section("5. 카운트·아웃·주자·득점");
    let state = rules.start();
    check.ok(state.inning === 9 && state.half === 0, "9회 초에서 시작");
    for (let index = 0; index < 3; index++) rules.apply(state, this.outcome("ball"));
    check.ok(state.balls === 3, "볼 3");
    let note = rules.apply(state, this.outcome("ball"));
    check.ok(note.plateAppearanceOver && state.bases[0] && state.balls === 0 && state.box[0].bat.bb === 1, "볼넷 1루");
    for (let walk = 0; walk < 2; walk++) for (let index = 0; index < 4; index++) rules.apply(state, this.outcome("ball"));
    check.ok(state.bases[0] && state.bases[1] && state.bases[2] && state.score[0] === 0, "만루");
    for (let index = 0; index < 4; index++) note = rules.apply(state, this.outcome("ball"));
    check.ok(state.score[0] === 1 && note.runs === 1 && state.box[0].bat.rbi === 1 && state.box[1].pit.er === 1, "밀어내기 1점(타점·자책)");
    rules.apply(state, this.outcome("foul")); rules.apply(state, this.outcome("foul")); rules.apply(state, this.outcome("foul"));
    check.ok(state.strikes === 2, "2스트라이크 뒤 파울은 그대로");
    note = rules.apply(state, this.outcome("swingMiss"));
    check.ok(state.outs === 1 && state.box[0].bat.k === 1 && note.toast === "삼진 아웃!", "삼진");
    rules.apply(state, this.outcome("calledStrike"));
    check.ok(state.strikes === 1, "루킹 스트라이크");
    for (let run = 0; run < 24; run++) rules.apply(state, this.outcome("inPlay", this.script("HOME_RUN", 0, [null, null, null], [this.runner("h" + run)])));
    check.ok(state.score[0] === 25 && !state.finished, "득점 상한 없음(25점)");
    rules.apply(state, this.outcome("inPlay", this.script("FLY_OUT", 1, [null, null, null], [])));
    note = rules.apply(state, this.outcome("inPlay", this.script("GROUND_OUT", 1, [null, null, null], [])));
    check.ok(note.halfOver && state.half === 1 && state.outs === 0 && !state.bases[0], "3아웃 공수 교대");

    state = rules.start();
    for (let out = 0; out < 3; out++) rules.apply(state, this.outcome("inPlay", this.script("FLY_OUT", 1, [null, null, null], [])));
    note = rules.apply(state, this.outcome("inPlay", this.script("HOME_RUN", 0, [null, null, null], [this.runner("w")])));
    check.ok(state.finished && state.winner === 1 && state.endNote === "끝내기 홈런!" && note.toast === "끝내기 홈런!", "끝내기 홈런 문구");

    state = rules.start();
    for (let half = 0; half < 2; half++) for (let out = 0; out < 3; out++) rules.apply(state, this.outcome("inPlay", this.script("FLY_OUT", 1, [null, null, null], [])));
    check.ok(state.inning === 10 && state.bases[0] && state.bases[1] && !state.bases[2] && !state.bases[0].earned, "10회 무사 1·2루(비자책 주자)");
    for (let half = 0; half < 2; half++) for (let out = 0; out < 3; out++) rules.apply(state, this.outcome("inPlay", this.script("FLY_OUT", 1, [null, null, null], [])));
    check.ok(state.inning === 11 && state.bases[0] && state.bases[1] && state.bases[2], "11회 무사 만루");
    for (let inning = 11; inning <= 15; inning++) for (let half = 0; half < 2; half++) for (let out = 0; out < 3; out++) rules.apply(state, this.outcome("inPlay", this.script("FLY_OUT", 1, [null, null, null], [])));
    check.ok(state.finished && state.winner === -1 && state.inning === 15, "15회 동점이면 무승부");

    state = rules.start();
    for (let out = 0; out < 3; out++) rules.apply(state, this.outcome("inPlay", this.script("FLY_OUT", 1, [null, null, null], [])));
    for (let index = 0; index < 12; index++) rules.apply(state, this.outcome("ball"));
    for (let index = 0; index < 4; index++) note = rules.apply(state, this.outcome("ball"));
    check.ok(state.finished && state.endNote === "끝내기 볼넷!", "끝내기 볼넷 문구");

    const three = new c.BbMatchRules(new c.BbThreeInningFormat());
    state = three.start();
    check.ok(state.inning === 7, "3이닝 형식은 7회 시작");
    for (let out = 0; out < 3; out++) three.apply(state, this.outcome("inPlay", this.script("FLY_OUT", 1, [null, null, null], [])));
    three.apply(state, this.outcome("inPlay", this.script("HOME_RUN", 0, [null, null, null], [this.runner("lead")])));
    check.ok(!state.finished, "7회 말 앞서도 끝내기 아님");
    for (let half = 0; half < 4; half++) for (let out = 0; out < 3; out++) three.apply(state, this.outcome("inPlay", this.script("FLY_OUT", 1, [null, null, null], [])));
    check.ok(state.finished && state.winner === 1 && state.inning === 9 && state.half === 0, "후공이 앞선 채 9회 초가 끝나면 말 생략");
    check.near(new c.BbMatchRules(new c.BbFullGameFormat()).progress({ halvesDone: 9, outs: 0 }), 0.5, 1e-9, "진행도는 형식의 하프 이닝 수 기준");

    state = rules.start();
    rules.apply(state, this.outcome("inPlay", this.script("ERROR", 0, [{ id: "e", earned: false }, null, null], [])));
    rules.apply(state, this.outcome("inPlay", this.script("HOME_RUN", 0, [null, null, null], [{ id: "e", earned: false }, this.runner("k")])));
    check.ok(state.box[1].pit.r === 2 && state.box[1].pit.er === 0 && state.box[0].bat.roe === 1, "실책 뒤 같은 이닝 득점은 비자책");
    rules.apply(state, this.outcome("inPlay", this.script("SAC_FLY", 1, [null, null, null], [this.runner("s")])));
    check.ok(state.box[0].bat.sf === 1 && state.box[0].bat.ab === 2, "희생플라이는 타수 불인정");
  }

  fieldPlays() {
    const c = this.code, check = this.check;
    check.section("5b. 타구 처리");
    let script = this.play(0, [true, false, false], this.ball(150, -2, -13));
    check.ok(script.result === "DOUBLE_PLAY" && script.outsAdded === 2 && !script.basesAfter[0] && !script.basesAfter[1], "주자 1루 강한 유격수 땅볼 → 병살");
    script = this.play(0, [true, false, false], this.ball(70, -2, -22));
    check.ok(script.result !== "DOUBLE_PLAY", "느린 땅볼은 병살이 안 됨 (" + script.result + ")");
    script = this.play(2, [true, true, true], this.ball(120, -2, -22));
    check.ok(script.outsAdded === 1 && script.scored.length === 0, "2사 만루 땅볼 아웃은 득점 불인정");
    script = this.play(1, [false, false, true], this.ball(140, 32, 5));
    check.ok(script.result === "SAC_FLY" && script.scored.length === 1 && script.outsAdded === 1, "1사 3루 깊은 외야 플라이 → 희생플라이 (" + script.result + ")");
    script = this.play(1, [false, false, true], this.ball(120, 38, 0));
    check.ok(script.result === "FLY_OUT" && script.scored.length === 0 && script.basesAfter[2], "얕은 플라이는 태그업 안 함");
    script = this.play(2, [false, false, true], this.ball(140, 32, 5));
    check.ok(script.result === "FLY_OUT" && script.scored.length === 0, "2사 플라이 아웃은 득점 없음");
    script = this.play(0, [true, true, false], this.ball(110, 55, 3));
    check.ok(script.result === "INFIELD_FLY" && script.outsAdded === 1 && script.basesAfter[0] && script.basesAfter[1], "무사 1·2루 내야 뜬공 → 인필드 플라이, 주자 그대로");
    check.ok(this.play(2, [true, true, false], this.ball(110, 55, 3)).result !== "INFIELD_FLY", "2사면 인필드 플라이 아님");
    check.ok(this.play(0, [true, false, false], this.ball(110, 55, 3)).result !== "INFIELD_FLY", "주자 1루만이면 인필드 플라이 아님");
    script = this.play(0, [true, true, true], this.ball(175, 28, 0));
    check.ok(script.result === "HOME_RUN" && script.scored.length === 4, "만루 홈런 4점");
    check.ok(this.play(0, [false, false, false], this.ball(175, 28, 60)).result === "FOUL", "폴 바깥으로 넘어간 타구는 파울");
    const always = new c.BbInfieldGroundBallErrorPolicy(1);
    script = this.play(0, [true, false, false], this.ball(150, -2, -13), always);
    check.ok(script.result === "ERROR" && script.outsAdded === 0 && script.basesAfter[0] && script.basesAfter[1] && script.batterReached === 1, "실책: 타자 1루, 밀린 주자 한 베이스");
    check.ok(this.play(0, [false, false, false], this.ball(150, 30, 0), always).result !== "ERROR", "외야 뜬공에는 실책 없음");
    let errors = 0;
    const policy = new c.BbInfieldGroundBallErrorPolicy(0.05), random = new c.BbSeededRandom(9);
    for (let index = 0; index < 20000; index++) if (policy.fumbles(random)) errors++;
    check.near(errors / 20000, 0.05, 0.006, "실책 확률 5%");
    check.ok(!new c.BbNoErrorPolicy().fumbles(), "실책 끄면 0");
  }

  timingExamples() {
    const c = this.code, check = this.check, timing = c.BbTimingModel;
    check.section("6. 타이밍·펜스 (사양서 8.9절 예)");
    check.near(timing.width(0, 140, 1), 0.066, 1e-9, "예 A 한가운데 정타 폭 66ms(사양 55ms × 1.2)");
    check.ok(timing.bandOf(-0.005, timing.width(0, 140, 1), 1) === "perfect", "예 A −5ms 정타");
    const shiftB = timing.idealShift(-0.8, 0), adjustedB = -0.075 - shiftB;
    check.near(shiftB, -0.0224, 1e-9, "예 B 몸쪽 이상 타이밍 −22ms");
    check.near(adjustedB, -0.0526, 1e-9, "예 B 보정 오차 −53ms");
    check.ok(timing.bandOf(adjustedB, timing.width(0.8, 140, 1), 1) === "good", "예 B 양호 밴드");
    const adjustedC = 0.03 - timing.idealShift(0.8, 0);
    check.ok(timing.bandOf(adjustedC, timing.width(0.8, 140, 1), 1) === "perfect", "예 C 바깥쪽 공 늦게 쳐서 정타");
    check.near(this.park.fenceDistance(0), 120, 1e-9, "중앙 펜스 120m");
    check.near(this.park.fenceDistance(22.5), 110, 1e-9, "좌우중간 110m");
    check.near(this.park.fenceDistance(-45), 100, 1e-9, "폴대 100m");
    check.near(this.park.fenceDistance(1.5), 119.33, 0.01, "예 A 방향 펜스 119.3m");
    const early = new c.BbSeededRandom(5);
    let pulled = 0;
    for (let index = 0; index < 2000; index++) if (c.BbSprayModel.sprayDegrees(-0.04, 0, "R", "perfect", early) < 0) pulled++;
    check.ok(pulled > 1500, "우타자가 빠르면 좌익 쪽으로 당겨침");
  }

  determinism() {
    const c = this.code, check = this.check;
    check.section("7. 결정성·로그 접기");
    const first = JSON.stringify(this.play(1, [true, false, true], this.ball(140, 12, -18), new c.BbInfieldGroundBallErrorPolicy(0.05), 99));
    check.ok(first === JSON.stringify(this.play(1, [true, false, true], this.ball(140, 12, -18), new c.BbInfieldGroundBallErrorPolicy(0.05), 99)), "같은 입력·시드 → 같은 PlayScript");
    const team = { lineup: [{ abilities: this.batter(), hand: "R" }], pitchers: [{ abilities: this.abilities(3, 3, 3), hand: "R", pitches: ["ft", "cv", "sl"], role: "starter" }] };
    const random = new c.BbSeededRandom(2026), entries = [];
    for (let index = 0; index < 400; index++) entries.push({ pitch: random.pick(["ft", "cv", "sl"]), aim: { u: random.between(-1.2, 1.2), v: random.between(-1.2, 1.2) }, seed: random.seed(), contactOffset: random.chance(0.5) ? random.gaussian(0, 0.06) : null });
    const fold = () => new c.BbGameLogFold(new c.BbOneInningFormat(), this.park, new c.BbInfieldGroundBallErrorPolicy(0.05), [team, team]);
    const whole = JSON.stringify(fold().fold(entries));
    check.ok(whole === JSON.stringify(fold().fold(entries)), "로그를 다시 접어도 같은 상태");
    const part = fold().fold(entries.slice(0, 25));
    check.ok(part.pitchCount === 25 || part.finished, "중간에서 끊어 접으면 그때까지의 상태");
    check.ok(JSON.parse(whole).finished, "400구 안에 경기가 끝남");
  }

  formats() {
    const c = this.code, check = this.check;
    check.section("8. 경기 형식");
    const team = { lineup: [c.BbAiLevel.batterSheet("R")], pitchers: [c.BbAiLevel.pitcherSheet("R")] }, level = c.BbAiLevel.ALL.normal;
    for (const format of [new c.BbOneInningFormat(), new c.BbThreeInningFormat(), new c.BbFullGameFormat()]) {
      const state = new c.BbAiMatchRunner(format, this.park, new c.BbNoErrorPolicy(), [team, team], [level, level], [level, level]).play(new c.BbSeededRandom(3));
      check.ok(state.finished && state.inning >= format.startInning + format.inningsToPlay - 1 && state.lineScore.length === state.inning - format.startInning + 1, format.id + " 형식으로 끝까지 진행 (" + state.inning + "회, " + state.score.join(":") + ")");
    }
  }

  formulas() {
    const f = this.code.BbBaseballFormulas, check = this.check, b = this.code.BbBoxScoreBuilder;
    check.section("9. 통계 공식");
    const bat = Object.assign(b.emptyBat(), { pa: 20, ab: 16, h: 6, d2: 2, d3: 1, hr: 1, bb: 3, k: 4, sf: 1 });
    check.near(f.average(bat), 0.375, 1e-9, "타율");
    check.near(f.onBase(bat), 9 / 20, 1e-9, "출루율");
    check.near(f.slugging(bat), 13 / 16, 1e-9, "장타율");
    check.near(f.ops(bat), 9 / 20 + 13 / 16, 1e-9, "OPS");
    check.near(f.perPlate(bat.hr, bat), 0.05, 1e-9, "홈런율");
    const pit = Object.assign(b.emptyPit(), { bf: 30, ab: 26, h: 7, bb: 3, k: 6, hr: 1, outs: 17, er: 4, sf: 1 });
    check.ok(f.inningsText(pit) === "5.2", "이닝 표기 5.2");
    check.near(f.earnedRunAverage(pit), 9 * 4 / (17 / 3), 1e-9, "평균자책점");
    check.near(f.whip(pit), 10 / (17 / 3), 1e-9, "WHIP");
    check.ok(f.average(b.emptyBat()) === null && f.rateText(null) === "-", "분모 0이면 -");
    check.ok(f.rateText(0.4) === ".400" && f.rateText(1.2) === "1.200" && f.meanText(3.456) === "3.46", "표기 형식");
    check.near(f.winRate(3, 1, 1), 0.6, 1e-9, "승률(무 포함)");
  }

  fieldDimensions() {
    const c = this.code, check = this.check;
    check.section("10. 구장 치수");
    check.near(c.BbDiamond.distance(c.BbDiamond.base(0), c.BbDiamond.base(1)), 27.43, 0.01, "베이스 간격 27.43m");
    check.near(c.BbDiamond.base(2).z, 38.8, 1e-9, "2루 위치");
    const small = { wallHeight: 3, warningTrackWidth: 4.5, backstopDistance: 17, foulTerritoryWidth: 18, fenceDistance: () => 70 };
    const resolver = new c.BbPlayResolver(small, new c.BbAutoFielding(), new c.BbAutoBaseRunning(), new c.BbNoErrorPolicy());
    const result = resolver.resolve({ outs: 0, bases: [null, null, null], batter: this.runner("x"), abilities: this.batter() }, this.ball(140, 28, 0), new c.BbSeededRandom(1));
    check.ok(result.result === "HOME_RUN" && this.play(0, [false, false, false], this.ball(140, 28, 0)).result !== "HOME_RUN", "구장 치수만 바꾸면 같은 타구가 홈런이 됨");
  }

  roster() {
    const c = this.code, check = this.check, plan = c.BbRosterPlan;
    check.section("11. 선수단·포지션");
    check.ok(plan.pitcherRoles().join() === "starter,reliever,closer" && plan.pitcherCount() === 3, "투수 3명: 선발·중간·마무리");
    check.ok(plan.BATTING_ORDER.join() === "DH,C,1B,2B,3B,SS,LF,CF,RF", "기본 타순 1번 지명타자 ~ 9번 우익수");
    const team = c.BbAiLevel.team("R");
    check.ok(team.lineup.length === 9 && team.pitchers.length === 3 && plan.isFullLineup(team.lineup), "AI 선수단 9명·3명, 포지션 9칸이 한 번씩");
    plan.swapPosition(team.lineup, 0, "SS");
    check.ok(team.lineup[0].position === "SS" && team.lineup[5].position === "DH" && plan.isFullLineup(team.lineup), "1번 지명타자 → 유격수: 원래 유격수(6번)가 지명타자");
    plan.swapPosition(team.lineup, 0, "2B");
    check.ok(team.lineup[0].position === "2B" && team.lineup[3].position === "SS" && plan.isFullLineup(team.lineup), "다시 2루수로: 원래 2루수(4번)가 유격수");
    team.lineup[1].position = "C"; team.lineup[2].position = "C";
    check.ok(!plan.isFullLineup(team.lineup), "같은 포지션 둘이면 잘못된 타순");
    const ordered = plan.orderedPitchers([{ role: "closer", tag: "c" }, { role: "starter", tag: "s" }, { role: "reliever", tag: "r" }]);
    check.ok(ordered.map((sheet) => sheet.tag).join() === "s,r,c", "투수는 역할 순서(선발→중간→마무리)로 정렬");
  }

  stamina() {
    const c = this.code, check = this.check, model = c.BbStaminaModel;
    check.section("12. 체력");
    const plain = this.outcome("ball"), single = this.outcome("inPlay", this.script("SINGLE", 0, [null, null, null], [])), homer = this.outcome("inPlay", this.script("HOME_RUN", 0, [null, null, null], []));
    check.near(model.costOf(1, plain), 4, 1e-9, "체력 1: 1구당 4");
    check.near(model.costOf(1, single), 6, 1e-9, "체력 1: 안타 +2");
    check.near(model.costOf(1, homer), 8, 1e-9, "체력 1: 홈런 +4");
    check.near(model.costOf(7, plain), 1, 1e-9, "체력 7: 1구당 1");
    check.near(model.costOf(7, single), 2, 1e-9, "체력 7: 안타 +1");
    check.near(model.costOf(7, homer), 3, 1e-9, "체력 7: 홈런 +2");
    check.ok([1, 2, 3, 4, 5, 6, 7].every((s, i, all) => i === 0 || model.costOf(s, plain) < model.costOf(all[i - 1], plain)), "체력 스탯이 높을수록 덜 깎임");
    check.ok(model.condition(50) === c.BbPitchCondition.FRESH && model.condition(49.9).speedScale === 0.9 && model.condition(49.9).spreadScale === 1, "50 미만: 구속 10% 감소");
    check.ok(model.condition(29.9).speedScale === 0.9 && model.condition(29.9).spreadScale === 1.3, "30 미만: 구속 10% 감소 + 흩어짐 30% 증가");
    const abilities = { control: 3, power: 3, breaking: 3, stamina: 3 }, kind = c.BbPitchCatalog.of("cv");
    const fresh = c.BbPitchRoller.roll("ft", { u: 0, v: 0 }, abilities, "R", 77), worn = c.BbPitchRoller.roll("ft", { u: 0, v: 0 }, abilities, "R", 77, model.WORN);
    check.near(worn.speed / fresh.speed, 0.9, 1e-9, "지친 투수의 구속 비율");
    check.near(kind.longDeviation(abilities, model.WORN) / kind.longDeviation(abilities), 1.3, 1e-9, "지친 투수의 흩어짐 비율(긴 축)");
    check.near(kind.shortDeviation(abilities, model.WORN) / kind.shortDeviation(abilities), 1.3, 1e-9, "지친 투수의 흩어짐 비율(짧은 축)");
    const meter = new c.BbStaminaMeter(3);
    for (let pitch = 0; pitch < 17; pitch++) meter.spend(plain);
    check.ok(meter.level() === 49 && meter.condition().speedScale === 0.9 && !meter.isSpent(), "체력 3: 17구 뒤 49 (구속 감소 시작)");
    for (let pitch = 0; pitch < 7; pitch++) meter.spend(plain);
    check.ok(meter.isSpent() && meter.level() === 28, "체력 3: 24구 뒤 28 (교체 추천)");
  }

  substitution() {
    const c = this.code, check = this.check;
    check.section("13. 투수 교체·로그 접기");
    const team = c.BbAiLevel.team("R"), roster = new c.BbPitcherRoster(team.pitchers), plain = this.outcome("ball");
    check.ok(roster.currentIndex() === 0 && roster.current().role === "starter" && roster.recommended() === 1, "선발로 시작, 추천은 중간계투");
    roster.afterPitch(plain); roster.afterPitch(plain);
    check.ok(roster.pitchesThisOuting() === 2 && roster.stamina().level() === 94, "투구수·체력이 그 투수에게 쌓임");
    check.ok(!roster.change(0) && roster.change(1) && roster.pitchesThisOuting() === 0 && roster.stamina().level() === 100, "교체하면 투구수 0, 새 투수 체력 100");
    check.ok(!roster.change(0) && roster.recommended() === 2 && roster.available().join() === "2", "내려간 투수는 다시 못 나옴, 다음 추천은 마무리");
    check.ok(roster.change(2) && roster.recommended() === null && !roster.change(1), "마지막 투수 뒤에는 추천 없음");
    const policy = new c.BbTiredSubstitution(), fresh = new c.BbPitcherRoster(team.pitchers);
    check.ok(policy.nextPitcher(fresh) === null, "체력 30 이상이면 자동 교체 없음");
    for (let pitch = 0; pitch < 24; pitch++) fresh.afterPitch(plain);
    check.ok(policy.nextPitcher(fresh) === 1, "체력 30 미만이면 다음 투수 추천");
    const teams = [c.BbAiLevel.team("R"), c.BbAiLevel.team("L")], random = new c.BbSeededRandom(4141), entries = [];
    for (let index = 0; index < 300; index++) {
      if (index === 9 || index === 40) entries.push({ change: index === 9 ? 1 : 2 });
      entries.push({ pitch: random.pick(["ft", "cv", "sl"]), aim: { u: random.between(-1.2, 1.2), v: random.between(-1.2, 1.2) }, seed: random.seed(), contactOffset: random.chance(0.5) ? random.gaussian(0, 0.06) : null });
    }
    const fold = () => new c.BbGameLogFold(new c.BbThreeInningFormat(), this.park, new c.BbInfieldGroundBallErrorPolicy(0.05), teams);
    const one = fold().engine(entries), two = fold().engine(entries);
    const snapshot = (engine) => JSON.stringify([engine.state, [0, 1].map((team) => [engine.roster(team).currentIndex(), engine.roster(team).stamina(0).level(), engine.roster(team).pitchesThisOuting()])]);
    check.ok(snapshot(one) === snapshot(two), "교체가 든 로그를 다시 접어도 같은 상태·체력");
    const before = fold().engine(entries.slice(0, 9)), changed = fold().engine(entries.slice(0, 10)), team9 = before.fieldingIndex;
    check.ok(before.roster(team9).currentIndex() === 0 && changed.roster(team9).currentIndex() === 1 && changed.roster(team9).pitchesThisOuting() === 0, "교체 사건을 접으면 그 순간 수비 팀 투수가 바뀜");
    const plainEntries = entries.filter((entry) => typeof entry.change !== "number");
    check.ok(snapshot(fold().engine(plainEntries)) !== snapshot(one), "교체가 있고 없음에 따라 결과가 달라짐");
    const session = new c.BbMatchEngine(new c.BbThreeInningFormat(), this.park, new c.BbInfieldGroundBallErrorPolicy(0.05), teams);
    entries.forEach((entry) => session.replay(entry));
    check.ok(snapshot(session) === snapshot(one), "한 사건씩 넣어도 같은 결과(새로고침·관전 복원)");
  }

  defenseCrew() {
    const c = this.code, check = this.check, plan = c.BbRosterPlan;
    check.section("14. 수비 스탯·포수·주자 속도");
    const team = c.BbAiLevel.team("R");
    team.lineup[5].abilities.defense = 7; team.lineup[0].abilities.defense = 7; team.lineup[1].abilities.defense = 1;
    const crew = plan.crewOf(team.lineup), base = c.BbFielderSkill.BASE;
    check.ok(crew.pointsOf("SS") === 7 && crew.pointsOf("C") === 1 && crew.pointsOf("P") === 3 && crew.pointsOf("DH") === 3, "유격수 7·포수 1·투수 기준 3, 지명타자는 수비 안 함");
    const from = { x: -10, z: 38 }, to = { x: -16, z: 30 };
    check.ok(c.BbFielderMotion.secondsTo("SS", from, to, false, crew.skillOf("SS")) < c.BbFielderMotion.secondsTo("SS", from, to, false, base), "수비 7 유격수가 더 빨리 닿음");
    check.ok(crew.arm("SS").secondsTo(from, 1) < new c.BbThrowDecision().secondsTo(from, 1), "수비 7 유격수의 송구가 더 빠름");
    check.ok(new c.BbFielderSkill(3).moveScale === 1 && new c.BbFielderSkill(3).throwScale === 1 && new c.BbFielderSkill(3).rangeBonus === 0, "수비 3은 지금 값 그대로");
    check.ok(c.BbCatcherFraming.topWeight(1) > c.BbCatcherFraming.topWeight(2) && c.BbCatcherFraming.topWeight(2) > 1 && c.BbCatcherFraming.topWeight(3) === 1 && c.BbCatcherFraming.topWeight(5) < c.BbCatcherFraming.topWeight(4) && c.BbCatcherFraming.topWeight(4) < 1, "포수 수비: 3 기준, 낮으면 장타 늘고 높으면 줄어듦");
    const legs = (speed) => new c.BbAutoBaseRunning().onForcedShift([{ id: "a", earned: true, speed }, null, null], null, this.batter())[0].arriveAt;
    check.ok(legs(7) < legs(3) && legs(3) < legs(1), "1루 주자는 자기 주루 스탯으로 달림(타자 스탯이 아님)");
    check.ok(new c.BbAutoBaseRunning().onForcedShift([this.runner("a"), null, null], null, this.batter())[0].arriveAt === legs(3), "속도 없는 옛 주자는 타자 스탯으로");
  }

  run() {
    this.roster();
    this.stamina();
    this.substitution();
    this.defenseCrew();
    this.samplerStaysInRange();
    this.aimLimiterKeepsBallOffBatter();
    this.strikeZoneIsExact();
    this.abilityRules();
    this.countAndBaseTransitions();
    this.fieldPlays();
    this.timingExamples();
    this.determinism();
    this.formats();
    this.formulas();
    this.fieldDimensions();
    this.check.finish();
  }
}

new BaseballUnit().run();
