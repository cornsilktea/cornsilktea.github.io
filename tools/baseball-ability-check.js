// 41번 야구 능력치 반영 검사 (사양서 17.1절 아래 표).
// 능력치 하나를 1~7 로 바꾸고 나머지는 3 으로 두었을 때, 의도한 값만 의도한 방향으로 바뀌는지 본다.
// 사용: node tools/baseball-ability-check.js   (표는 화면에, sim-reports/baseball-ability-check.csv 에도 저장)
const fs = require("fs"), path = require("path");
const BaseballCode = require("./baseball-load.js");

class AbilityCheck {
  static LEVELS = [1, 2, 3, 4, 5, 6, 7];

  constructor() {
    this.code = BaseballCode.load();
    this.rows = [];
    this.failures = 0;
    this.park = new this.code.BbMainBallpark();
  }

  record(who, ability, measure, values, direction) {
    let ok = true;
    for (let index = 1; index < values.length; index++) {
      const step = values[index] - values[index - 1];
      if (direction === "up" && step < -1e-9) ok = false;
      if (direction === "down" && step > 1e-9) ok = false;
      if (direction === "same" && Math.abs(step) > 1e-9) ok = false;
    }
    if (!ok) this.failures++;
    this.rows.push({ who, ability, measure, values, direction, ok });
  }

  spread(kindId, abilities) {
    const c = this.code, kind = c.BbPitchCatalog.of(kindId), random = new c.BbSeededRandom(1234), angle = kind.axisRadians("R");
    let alongSum = 0, acrossSum = 0, count = 6000;
    for (let index = 0; index < count; index++) {
      const point = c.BbPitchLocationSampler.sample({ u: 0, v: 0 }, kind, abilities, "R", random);
      alongSum += Math.pow(point.u * Math.cos(angle) + point.v * Math.sin(angle), 2);
      acrossSum += Math.pow(-point.u * Math.sin(angle) + point.v * Math.cos(angle), 2);
    }
    return { along: Math.sqrt(alongSum / count), across: Math.sqrt(acrossSum / count) };
  }

  pitcher() {
    const c = this.code, levels = AbilityCheck.LEVELS, of = (control, power, breaking, stamina = 3) => ({ control, power, breaking, stamina });
    this.record("투수", "제구", "직구 도착 표준편차(표본)", levels.map((n) => this.spread("ft", of(n, 3, 3)).along), "down");
    this.record("투수", "제구", "커브 후보 범위 가로 반경", levels.map((n) => c.BbPitchCatalog.of("cv").reach(of(n, 3, 3), "R").u), "down");
    this.record("투수", "제구", "직구 구속(불변)", levels.map((n) => c.BbPitchCatalog.of("ft").speedFor(of(n, 3, 3))), "same");
    this.record("투수", "제구", "변화구 수(불변)", levels.map(() => c.BbPitchSelection.slotsFor(3)), "same");
    this.record("투수", "구위", "직구 구속 126+3.5p", levels.map((n) => c.BbPitchCatalog.of("ft").speedFor(of(3, n, 3))), "up");
    for (const id of ["cv", "sl", "ch", "kn"]) this.record("투수", "구위", c.BbPitchCatalog.of(id).label + " 구속", levels.map((n) => c.BbPitchCatalog.of(id).speedFor(of(3, n, 3))), "up");
    this.record("투수", "구위", "직구 후보 범위(불변)", levels.map((n) => c.BbPitchCatalog.of("ft").reach(of(3, n, 3), "R").u), "same");
    this.record("투수", "변화", "고를 수 있는 변화구 수", levels.map((n) => c.BbPitchSelection.slotsFor(n)), "up");
    for (const id of ["cv", "sl", "ch"]) this.record("투수", "변화", c.BbPitchCatalog.of(id).label + " 긴 방향 표준편차(표본)", levels.map((n) => this.spread(id, of(3, 3, n)).along), "up");
    this.record("투수", "변화", "커브 짧은 방향(불변)", levels.map((n) => c.BbPitchCatalog.of("cv").shortDeviation(of(3, 3, n))), "same");
    this.record("투수", "변화", "직구 범위(불변)", levels.map((n) => c.BbPitchCatalog.of("ft").reach(of(3, 3, n), "R").u), "same");
    this.record("투수", "변화", "너클 범위(불변)", levels.map((n) => c.BbPitchCatalog.of("kn").reach(of(3, 3, n), "R").u), "same");
    const ball = { kind: "ball", script: null }, single = { kind: "inPlay", script: { result: "SINGLE" } }, homer = { kind: "inPlay", script: { result: "HOME_RUN" } }, model = c.BbStaminaModel;
    this.record("투수", "체력", "1구당 체력 소모", levels.map((n) => model.costOf(n, ball)), "down");
    this.record("투수", "체력", "안타 맞은 공 체력 소모", levels.map((n) => model.costOf(n, single)), "down");
    this.record("투수", "체력", "홈런 맞은 공 체력 소모", levels.map((n) => model.costOf(n, homer)), "down");
    this.record("투수", "체력", "50 아래까지 공 수(볼만)", levels.map((n) => Math.ceil((model.FULL - model.TIRED_BELOW + 1e-9) / model.costOf(n, ball))), "up");
    this.record("투수", "체력", "직구 구속(불변)", levels.map((n) => c.BbPitchCatalog.of("ft").speedFor(of(3, 3, 3, n))), "same");
    this.record("투수", "체력", "직구 범위(불변)", levels.map((n) => c.BbPitchCatalog.of("ft").reach(of(3, 3, 3, n), "R").u), "same");
  }

  swings(abilities, samples) {
    const c = this.code, random = new c.BbSeededRandom(4141), action = new c.BbSwingAction(), pitcher = { control: 3, power: 3, breaking: 3, stamina: 3 };
    let contact = 0, perfect = 0, exit = 0, carry = 0, air = 0, homers = 0, fair = 0;
    const resolver = new c.BbPlayResolver(this.park, new c.BbAutoFielding(), new c.BbAutoBaseRunning(), new c.BbNoErrorPolicy());
    for (let index = 0; index < samples; index++) {
      const roll = c.BbPitchRoller.roll("ft", { u: random.between(-0.8, 0.8), v: random.between(-0.8, 0.8) }, pitcher, "R", random.seed());
      const offset = c.BbTimingModel.idealShift(c.BbStrikeZoneJudge.inside(roll.arrive, "R"), roll.timingNoise) + random.gaussian(0, 0.062);
      const result = action.resolve({ roll, batterHand: "R", abilities, contactOffset: offset, random: new c.BbSeededRandom(roll.seed) });
      if (result.band === "perfect") perfect++;
      if (result.kind !== "contact") continue;
      contact++;
      if (result.ball.foul) continue;
      fair++; exit += result.ball.exitSpeed;
      if (result.ball.flight !== "ground") { air++; carry += result.ball.carry; }
      if (resolver.resolve({ outs: 0, bases: [null, null, null], batter: { id: "b", earned: true }, abilities }, result.ball, new c.BbSeededRandom(roll.seed + 1)).result === "HOME_RUN") homers++;
    }
    return { contact: contact / samples, perfect: perfect / samples, exit: exit / fair, carry: carry / air, homers: homers / samples };
  }

  running(abilities, samples) {
    const c = this.code, random = new c.BbSeededRandom(777), resolver = new c.BbPlayResolver(this.park, new c.BbAutoFielding(), new c.BbAutoBaseRunning(), new c.BbNoErrorPolicy());
    const physics = c.BbBattedBallPhysics, ball = (exitSpeed, launch, spray) => ({ exitSpeed, launch, spray, carry: physics.carry(exitSpeed, launch), hang: physics.hangSeconds(exitSpeed, launch), flight: physics.kindOf(launch), foul: false });
    const runner = (id) => ({ id, earned: true });
    let safe = 0, doubles = 0, turned = 0, extra = 0;
    for (let index = 0; index < samples; index++) {
      const ground = ball(random.between(35, 150), random.between(-8, 6), random.between(-42, 42)), seed = random.seed();
      const alone = resolver.resolve({ outs: 0, bases: [null, null, null], batter: runner("b"), abilities }, ground, new c.BbSeededRandom(seed));
      if (alone.batterReached >= 1) safe++;
      const withRunner = resolver.resolve({ outs: 0, bases: [runner("r1"), null, null], batter: runner("b"), abilities }, ground, new c.BbSeededRandom(seed));
      if (withRunner.result === "DOUBLE_PLAY") turned++;
      const liner = ball(random.between(120, 160), random.between(9, 20), random.between(-40, 40));
      const hit = resolver.resolve({ outs: 0, bases: [null, runner("r2"), null], batter: runner("b"), abilities }, liner, new c.BbSeededRandom(seed));
      if (c.BbPlayCodes.isHit(hit.result)) { doubles++; if (hit.scored.length || hit.batterReached >= 2) extra++; }
    }
    return { safe: safe / samples, avoided: 1 - turned / samples, extra: extra / Math.max(1, doubles) };
  }

  batter() {
    const c = this.code, levels = AbilityCheck.LEVELS, model = c.BbBatterAbilityModel;
    this.record("타자", "컨택", "정타 폭 배율", levels.map((n) => model.leniency(n)), "up");
    this.record("타자", "컨택", "가운데 공 정타 폭(초)", levels.map((n) => c.BbTimingModel.width(0, 140, model.leniency(n))), "up");
    const byContact = levels.map((n) => this.swings({ contact: n, power: 3, speed: 3, defense: 3 }, 30000));
    this.record("타자", "컨택", "접촉률(같은 타이밍 분포)", byContact.map((row) => row.contact), "up");
    this.record("타자", "컨택", "정타율", byContact.map((row) => row.perfect), "up");
    const byPower = levels.map((n) => this.swings({ contact: 3, power: n, speed: 3, defense: 3 }, 30000));
    this.record("타자", "파워", "타구 속도 평균(km/h)", byPower.map((row) => row.exit), "up");
    this.record("타자", "파워", "뜬 타구 비거리 평균(m)", byPower.map((row) => row.carry), "up");
    this.record("타자", "파워", "스윙당 홈런율", byPower.map((row) => row.homers), "up");
    this.record("타자", "파워", "접촉률(불변)", byPower.map((row) => row.contact), "same");
    this.record("타자", "주루", "1루 도달 시간(초)", levels.map((n) => model.firstBaseSeconds(n)), "down");
    this.record("타자", "주루", "주자 최고 속도(m/s)", levels.map((n) => model.topSpeed(n)), "up");
    const byRun = levels.map((n) => this.running({ contact: 3, power: 3, speed: n, defense: 3 }, 12000));
    this.record("타자", "주루", "땅볼 세이프율", byRun.map((row) => row.safe), "up");
    this.record("타자", "주루", "병살 회피율(주자 1루 땅볼)", byRun.map((row) => row.avoided), "up");
    this.record("타자", "주루", "외야 안타 때 추가 진루율", byRun.map((row) => row.extra), "up");
    const skill = (n) => new c.BbFielderSkill(n), from = { x: -12, z: 38 }, to = { x: -18, z: 30 };
    this.record("타자", "수비", "수비수 이동 속도 배율", levels.map((n) => skill(n).moveScale), "up");
    this.record("타자", "수비", "송구 속도 배율", levels.map((n) => skill(n).throwScale), "up");
    this.record("타자", "수비", "포구 범위 보너스(m)", levels.map((n) => skill(n).rangeBonus), "up");
    this.record("타자", "수비", "유격수 10m 이동 시간(초)", levels.map((n) => c.BbFielderMotion.secondsTo("SS", from, to, false, skill(n))), "down");
    this.record("타자", "수비", "포수 수비별 상대 장타 성분 배율", levels.map((n) => c.BbCatcherFraming.topWeight(n)), "down");
    const byDefense = [1, 4, 7].map((n) => this.swings({ contact: 3, power: 3, speed: 3, defense: n }, 10000).contact);
    this.record("타자", "수비", "자기 타격 접촉률(불변, 1·4·7)", byDefense, "same");
  }

  print() {
    const words = { up: "증가", down: "감소", same: "불변" }, format = (value) => Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(3);
    console.log("대상 | 능력치 | 확인하는 값 | 기대 | 1 → 7 | 판정");
    for (const row of this.rows) console.log([row.who, row.ability, row.measure, words[row.direction], row.values.map(format).join(" "), row.ok ? "정상" : "이상"].join(" | "));
    console.log(this.failures ? "\n이상 " + this.failures + "건" : "\n모두 정상 (" + this.rows.length + "항목)");
    const folder = path.join(__dirname, "..", "sim-reports");
    fs.mkdirSync(folder, { recursive: true });
    const csv = ["대상,능력치,확인하는 값,기대,1,2,3,4,5,6,7,판정", ...this.rows.map((row) => [row.who, row.ability, row.measure, words[row.direction], ...row.values.map(format), row.ok ? "정상" : "이상"].join(","))];
    fs.writeFileSync(path.join(folder, "baseball-ability-check.csv"), "﻿" + csv.join("\n") + "\n", "utf8");
  }

  run() {
    this.pitcher();
    this.batter();
    this.print();
    process.exit(this.failures ? 1 : 0);
  }
}

new AbilityCheck().run();
