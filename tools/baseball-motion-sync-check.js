// 41번 야구: 동작 동기 검사 (사양서 0.2절 ActionSync).
// 모든 동작의 키 프레임(릴리스·접촉·포구·도달)이 사건 시각과 1프레임(16.7ms) 안에서 맞는지,
// 그 순간 배트·글러브·손이 공과 같은 자리에 있는지, 팔다리가 닿는 범위 안인지(= 손이 배트에서 안 떨어짐) 확인한다.
// 사용: npx tsc -p . 다음에 node tools/baseball-motion-sync-check.js
const fs = require("fs"), vm = require("vm"), path = require("path");

class MotionCode {
  static FILES = ["41.baseball-motion.js", "41.baseball-field.js", "41.baseball-drills.js"];
  static NAMES = ["BbVec", "BbBodyDefaults", "BbBodyModel", "BbHandednessMirror", "BbBatShape", "BbActionSync", "BbReadyPose", "BbCatcherCrouchPose",
    "BbBatStancePose", "BbBatLoadPose", "BbBatSwingPose", "BbPitchPose", "BbFieldThrowPose", "BbCatchPose", "BbTagPose", "BbSlidePose",
    "BbThrowTrajectory", "BbFieldSpace", "BbFieldGeometry", "BbStrikeZoneBox", "BbActorPlacement", "BbDrillCatalog"];
  static load() {
    const folder = path.join(__dirname, "..", "games", "41.baseball-duel");
    const source = MotionCode.FILES.map((file) => fs.readFileSync(path.join(folder, file), "utf8")).join("\n") + "\n;({" + MotionCode.NAMES.join(",") + "})";
    return vm.runInNewContext(source, { console, Math, Map, Set, Array, Object, Number, Infinity });
  }
}

class Report {
  constructor() { this.rows = []; this.failures = 0; }
  add(group, name, value, limit, unit) {
    const ok = value <= limit;
    if (!ok) this.failures++;
    this.rows.push({ group, name, value, limit, unit, ok });
  }
  print() {
    let lastGroup = "";
    for (const row of this.rows) {
      if (row.group !== lastGroup) { console.log("\n[" + row.group + "]"); lastGroup = row.group; }
      console.log("  " + (row.ok ? "통과" : "실패") + "  " + row.name.padEnd(46) + " " + row.value.toFixed(row.unit === "ms" ? 2 : 4) + " " + row.unit + "  (한도 " + row.limit + ")");
    }
    console.log("\n" + (this.failures ? "실패 " + this.failures + "건" : "모두 통과 (" + this.rows.length + "항목)"));
  }
}

class SyncCheck {
  static FRAME_MS = 1000 / 60;
  static STRETCH_LIMIT = 0.02;

  constructor() {
    this.code = MotionCode.load();
    this.metrics = this.code.BbBodyDefaults.KAYKIT;
    this.body = new this.code.BbBodyModel(this.metrics);
    this.report = new Report();
  }

  worstStretch(pose, from, to) {
    let worst = -1;
    for (let time = from; time <= to + 1e-9; time += 1 / 120) {
      const frame = pose.frameAt(time);
      worst = Math.max(worst, this.body.armStretch(frame, "left"), this.body.armStretch(frame, "right"), this.body.legStretch(frame, "left"), this.body.legStretch(frame, "right"));
    }
    return Math.max(0, worst);
  }

  checkSwings() {
    const { BbBatSwingPose, BbBatStancePose, BbBatLoadPose, BbStrikeZoneBox, BbActorPlacement, BbFieldSpace, BbFieldGeometry, BbHandednessMirror, BbBatShape } = this.code;
    let worstGap = 0, worstStretch = 0, worstFront = Infinity, worstPitcherSide = Infinity, worstMirror = 0;
    for (const batsLeft of [false, true]) {
      const boxX = batsLeft ? BbFieldGeometry.BATTER_BOX_OFFSET : -BbFieldGeometry.BATTER_BOX_OFFSET;
      const placement = BbActorPlacement.facing(BbFieldSpace.toWorld(boxX, 0.25), BbFieldSpace.toWorld(0, 0.25));
      for (const u of [-1.3, -1, 0, 1, 1.3]) for (const v of [-1.3, -1, 0, 1, 1.3]) {
        const ball = BbStrikeZoneBox.pointAt(u, v);
        const local = BbHandednessMirror.point(placement.toLocal(ball), batsLeft);
        const swing = new BbBatSwingPose(this.metrics, local, "full");
        const frame = BbHandednessMirror.frame(swing.frameAt(swing.keyTime), batsLeft);
        const sweet = placement.toWorld(frame.bat.knob.plus(frame.bat.axis.times(BbBatShape.SWEET_SPOT_AT)));
        worstGap = Math.max(worstGap, sweet.distanceTo(ball));
        worstStretch = Math.max(worstStretch, this.worstStretch(swing, 0, swing.duration), this.worstStretch(new BbBatSwingPose(this.metrics, local, "weak"), 0, swing.duration));
        const head = swing.frameAt(swing.keyTime).bat;
        const tip = head.knob.plus(head.axis.times(BbBatShape.LENGTH));
        worstFront = Math.min(worstFront, tip.z);
        worstPitcherSide = Math.min(worstPitcherSide, tip.x);
        const pitcherDirection = BbFieldGeometry.RUBBER.minus(placement.position).flat().unit();
        const shoulderToPitcher = placement.toWorld(this.body.shoulder(frame, batsLeft ? "right" : "left")).minus(placement.toWorld(this.body.shoulder(frame, batsLeft ? "left" : "right"))).dot(pitcherDirection);
        worstMirror = Math.max(worstMirror, -shoulderToPitcher);
      }
    }
    this.report.add("스윙 (우타·좌타 × 코스 25곳)", "접촉 프레임 배트 중심–공 거리", worstGap, 0.05, "m");
    this.report.add("스윙 (우타·좌타 × 코스 25곳)", "두 손–배트 떨어짐(팔 초과 길이)", worstStretch, SyncCheck.STRETCH_LIMIT, "m");
    this.report.add("스윙 (우타·좌타 × 코스 25곳)", "배트 끝이 몸 앞(플레이트 쪽)에 있음", -worstFront, -0.3, "m");
    this.report.add("스윙 (우타·좌타 × 코스 25곳)", "배트 끝이 포수 쪽으로 처지지 않음", -worstPitcherSide, 0.25, "m");
    this.report.add("스윙 (우타·좌타 × 코스 25곳)", "투수 쪽 어깨가 앞 어깨(우타=왼쪽)", worstMirror, 0, "m");
    this.report.add("스윙 (우타·좌타 × 코스 25곳)", "접촉 프레임 시각 = SWING_DELAY 120ms", Math.abs(new BbBatSwingPose(this.metrics, new this.code.BbVec(0, 0.6, 0.95), "full").keyTime - 0.12) * 1000, 0.001, "ms");
    this.report.add("타격 자세", "스탠스·로드 팔다리 닿음", Math.max(this.worstStretch(new BbBatStancePose(this.metrics), 0, 2), this.worstStretch(new BbBatLoadPose(this.metrics), 0, 1)), SyncCheck.STRETCH_LIMIT, "m");
  }

  checkBodyPoses() {
    const { BbPitchPose, BbFieldThrowPose, BbCatchPose, BbTagPose, BbSlidePose, BbReadyPose, BbCatcherCrouchPose, BbVec } = this.code;
    const pitch = new BbPitchPose(this.metrics);
    this.report.add("투구·송구", "투구 팔다리 닿음", this.worstStretch(pitch, 0, pitch.duration), SyncCheck.STRETCH_LIMIT, "m");
    this.report.add("투구·송구", "릴리스 프레임 = 와인드업 0.9초", Math.abs(pitch.keyTime - 0.9) * 1000, 0.001, "ms");
    for (const hop of [false, true]) {
      const pose = new BbFieldThrowPose(this.metrics, hop);
      this.report.add("투구·송구", "야수 송구" + (hop ? "(크로우 홉)" : "") + " 팔다리 닿음", this.worstStretch(pose, 0, pose.duration), SyncCheck.STRETCH_LIMIT, "m");
    }
    const gloves = { ground: new BbVec(0.05, 0.075, 0.42), fly: new BbVec(0.08, 1.12, 0.2), chest: new BbVec(0.1, 0.72, 0.4), stretch: new BbVec(0.06, 0.68, 0.5) };
    for (const kind of Object.keys(gloves)) {
      const pose = new BbCatchPose(this.metrics, kind, gloves[kind]);
      this.report.add("포구", kind + " 포구 프레임 글러브–목표 거리", pose.frameAt(pose.keyTime).handLeft.distanceTo(gloves[kind]), 0.001, "m");
      this.report.add("포구", kind + " 팔다리 닿음", this.worstStretch(pose, 0, pose.duration), SyncCheck.STRETCH_LIMIT, "m");
      this.report.add("포구", kind + " 준비 동작이 도착 전에 시작(초)", -pose.keyTime, -0.25, "s");
    }
    const ground = new BbCatchPose(this.metrics, "ground", gloves.ground);
    this.report.add("포구", "땅볼 몸 낮추기 시작이 도착 0.3~0.4초 전", Math.abs(ground.keyTime - 0.35), 0.05, "s");
    const others = [["태그", new BbTagPose(this.metrics, new BbVec(0.1, 0.15, 0.45)), 0.55], ["슬라이딩", new BbSlidePose(this.metrics, 0.75), 1.1], ["수비 대기", new BbReadyPose(this.metrics, 0.35), 2], ["심판 자세", new BbReadyPose(this.metrics, 0.8), 2], ["포수 앉기", new BbCatcherCrouchPose(this.metrics, new BbVec(0.03, 0.5, 0.4)), 2]];
    for (const [name, pose, until] of others) this.report.add("그 밖 자세", name + " 팔다리 닿음", this.worstStretch(pose, 0, until), SyncCheck.STRETCH_LIMIT, "m");
  }

  checkThrows() {
    const { BbThrowTrajectory, BbVec } = this.code;
    for (const distance of [12, 28, 39, 45, 60, 74, 76, 95, 115]) {
      const speed = distance <= 40 ? BbThrowTrajectory.INFIELD_SPEED : BbThrowTrajectory.OUTFIELD_SPEED;
      const path = new BbThrowTrajectory(new BbVec(0, 1.1, 0), new BbVec(0, 0.72, distance), speed);
      const limit = path.shape === "line" ? 1.1 + 0.3 : path.shape === "lowArc" ? 3 : 2.5;
      this.report.add("송구 궤적", distance + "m " + path.shape + " 정점 높이", path.apexHeight(), limit + 1e-6, "m");
      this.report.add("송구 궤적", distance + "m 비행 시간 = 거리 ÷ 속도", Math.abs(path.duration - distance / speed) * 1000, 0.001, "ms");
      if (path.shape === "oneHop") {
        let lowestAt = 0, lowest = Infinity;
        for (let step = 100; step < 200; step++) { const point = path.pointAt(path.duration * step / 200); if (point.y < lowest) { lowest = point.y; lowestAt = point.z; } }
        this.report.add("송구 궤적", distance + "m 원바운드 지점이 목표 앞 8~12m", Math.abs(distance - lowestAt - 10), 2, "m");
      }
    }
  }

  checkDrills() {
    const { BbDrillCatalog, BbActionSync, BbBatShape } = this.code;
    for (const batsLeft of [false, true]) for (const throwsLeft of [false, true]) {
      const hands = (batsLeft ? "좌타" : "우타") + "·" + (throwsLeft ? "좌투" : "우투");
      for (const drill of BbDrillCatalog.all()) {
        const script = drill.build({ metrics: this.metrics, batsLeft, throwsLeft }), group = "장면 " + script.title + " (" + hands + ")";
        let worstKey = 0, worstTick = 0;
        for (const cue of script.poses) {
          if (cue.eventAt === null) continue;
          worstKey = Math.max(worstKey, Math.abs(BbActionSync.keyError(cue.startAt, cue.pose, cue.eventAt)) * 1000);
          for (let phase = 0; phase < 5; phase++) {
            const offset = phase / 5 / 60, tick = Math.ceil((cue.eventAt - offset) * 60 - 1e-9) / 60 + offset;
            worstTick = Math.max(worstTick, (tick - cue.eventAt) * 1000);
          }
        }
        this.report.add(group, "키 프레임 시각 − 사건 시각", worstKey, 0.001, "ms");
        this.report.add(group, "60fps 화면에서 키 프레임이 그려지는 지연", worstTick, SyncCheck.FRAME_MS + 0.01, "ms");
        for (const check of script.checkpoints) {
          const before = script.ballAt(check.at - 1e-6), after = script.ballAt(check.at + 1e-6);
          if (check.kind === "release") {
            this.report.add(group, check.label + ": 공 출발점–손 거리", after.point.distanceTo(script.handPointOf(check.role, "throw", check.at)), 0.001, "m");
            this.report.add(group, check.label + ": 직전까지 손에 붙어 있음", before.holder === check.role ? 0 : 1, 0, "");
          } else if (check.kind === "contact") {
            const frame = script.frameOf(check.role, check.at), placement = script.placementOf(check.role, check.at);
            const sweet = placement.toWorld(frame.bat.knob.plus(frame.bat.axis.times(BbBatShape.SWEET_SPOT_AT)));
            this.report.add(group, check.label + ": 배트 중심–공 거리", sweet.distanceTo(before.point), 0.05, "m");
          } else if (check.kind === "catch") {
            this.report.add(group, check.label + ": 글러브–공 거리", script.handPointOf(check.role, "glove", check.at).distanceTo(before.point), 0.02, "m");
            this.report.add(group, check.label + ": 도착 순간 글러브에 붙음", after.holder === check.role ? 0 : 1, 0, "");
          } else {
            this.report.add(group, check.label + ": 위치 오차", script.placementOf(check.role, check.at).position.distanceTo(check.point), 0.02, "m");
          }
        }
        let worstStretch = 0;
        for (const role of script.roles()) for (let time = 0; time < script.duration; time += 1 / 30) {
          const frame = script.frameOf(role, time);
          if (frame) worstStretch = Math.max(worstStretch, this.body.armStretch(frame, "left"), this.body.armStretch(frame, "right"), this.body.legStretch(frame, "left"), this.body.legStretch(frame, "right"));
        }
        this.report.add(group, "모든 선수 팔다리 닿음(전 구간)", worstStretch, SyncCheck.STRETCH_LIMIT, "m");
      }
    }
  }

  run() {
    this.checkSwings();
    this.checkBodyPoses();
    this.checkThrows();
    this.checkDrills();
    this.report.print();
    process.exit(this.report.failures ? 1 : 0);
  }
}

new SyncCheck().run();
