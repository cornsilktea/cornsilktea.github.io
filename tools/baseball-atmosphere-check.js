// 41번 야구 관중·소리 검사 (M7).
// 1) 합성 소리 버퍼가 모두 숫자이고 너무 작거나 크지 않은지, 전체 크기가 예산 안인지
// 2) 투구 장면마다 소리 시점(투구·포구·타격·송구)이 빠짐없이, 장면 길이 안에 있는지
// 3) 관중 자세(앉음·박수·환호·점프·탄식·파도)가 사건에 맞게 바뀌고 모두 같은 동작이 아닌지
// 사용: node tools/baseball-atmosphere-check.js [--pitches 1500]
const fs = require("fs"), vm = require("vm"), path = require("path");

class AtmosphereCheck {
  static FILES = ["motion", "field", "pitch", "batting", "running", "defense", "play", "game", "ai", "drills", "choreo", "live", "sound"];
  static CROWD_SOURCE = "crowd";
  static MAX_SECONDS = 30;
  static PEAK_LOW = 0.05;
  static PEAK_HIGH = 1.6;

  constructor(pitches) {
    this.pitches = pitches;
    const folder = path.join(__dirname, "..", "games", "41.baseball-duel");
    const read = (name) => fs.readFileSync(path.join(folder, "41.baseball-" + name + ".js"), "utf8");
    const source = AtmosphereCheck.FILES.map(read).join("\n") + "\n" + read(AtmosphereCheck.CROWD_SOURCE)
      + "\n;({BbAiGameFeed,BbPlayChoreographer,BbBallparkRegistry,BbBodyDefaults,BbSynthBank,BbSoundSettings,BbFanPoser,BbCrowdMoodBoard})";
    const sandbox = { console, Math, Map, Set, Array, Object, Number, Infinity, JSON, Float32Array, window: { addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} } };
    this.code = vm.runInNewContext(source, sandbox);
    this.passed = 0;
    this.failed = [];
  }

  check(label, ok, detail = "") {
    if (ok) this.passed++;
    else this.failed.push(label + (detail ? " — " + detail : ""));
  }

  synth() {
    const c = this.code, bank = new c.BbSynthBank().build();
    let samples = 0;
    bank.forEach((data, name) => {
      let peak = 0, finite = true;
      for (let index = 0; index < data.length; index++) { if (!Number.isFinite(data[index])) { finite = false; break; } peak = Math.max(peak, Math.abs(data[index])); }
      samples += data.length;
      this.check("소리 " + name + " 숫자", finite);
      this.check("소리 " + name + " 크기", peak >= AtmosphereCheck.PEAK_LOW && peak <= AtmosphereCheck.PEAK_HIGH, "최대 " + peak.toFixed(3));
    });
    this.check("소리 17종", bank.size === 17, String(bank.size));
    const seconds = samples / c.BbSynthBank.RATE;
    this.check("소리 전체 길이 예산", seconds <= AtmosphereCheck.MAX_SECONDS, seconds.toFixed(1) + "초");
    console.log("합성 소리 " + bank.size + "종 · 전체 " + seconds.toFixed(1) + "초 (" + (samples * 4 / 1024).toFixed(0) + "KB)");
    const prefs = c.BbSoundSettings.load();
    this.check("소리 설정 기본값", prefs.fx && prefs.crowd && prefs.volume === 0.6);
  }

  scenes() {
    const c = this.code, setup = { metrics: c.BbBodyDefaults.KAYKIT, batsLeft: false, throwsLeft: false };
    const feed = new c.BbAiGameFeed(c.BbBallparkRegistry.MAIN.dimensions, "R", "R", 4141), missing = new Map(), counts = new Map();
    const note = (kind) => missing.set(kind, (missing.get(kind) || 0) + 1);
    for (let index = 0; index < this.pitches; index++) {
      const live = feed.next(), play = new c.BbPlayChoreographer(live), script = play.build(setup), kinds = play.sounds.map((mark) => mark.kind);
      const outcome = live.outcome, result = outcome.script ? outcome.script.result : outcome.kind;
      kinds.forEach((kind) => counts.set(kind, (counts.get(kind) || 0) + 1));
      if (kinds.indexOf("release") < 0) note("투구 소리 없음");
      if (outcome.swing.kind === "contact" && kinds.indexOf(result === "FOUL" ? "tick" : "crack") < 0) note("타격 소리 없음 " + result);
      if (outcome.swing.kind !== "contact" && kinds.indexOf("mitt") < 0) note("포수 포구 소리 없음");
      if (outcome.swing.kind === "miss" && kinds.indexOf("whiff") < 0) note("헛스윙 소리 없음");
      if (outcome.script && outcome.script.events.some((event) => event.kind === "throw") && kinds.indexOf("throw") < 0 && kinds.indexOf("glove") < 0) note("송구 소리 없음 " + result);
      if (play.sounds.some((mark) => !(mark.at >= 0 && mark.at <= script.duration + 0.01 && mark.power >= 0 && mark.power <= 1))) note("소리 시점이 장면 밖");
    }
    this.check("장면 소리 빠짐 없음", missing.size === 0, Array.from(missing).map(([kind, count]) => kind + " " + count).join(", "));
    console.log("장면 " + this.pitches + "개 소리: " + Array.from(counts).map(([kind, count]) => kind + " " + count).join(" · "));
  }

  crowd() {
    const c = this.code, board = new c.BbCrowdMoodBoard(), pose = { lift: 0, hop: 0, armLeft: 0, armRight: 0, spread: 0, bow: 0 };
    const fan = (extra) => Object.assign({ x: 30, y: 2, z: -40, yaw: 0, angle: 1, team: 1, delay: 0.2, pace: 1, phase: 1, strength: 1, lazy: false, sways: false, style: 0, sector: 0 }, extra);
    const at = (spec, mood, since, now, wave = -1, tense = false) => Object.assign({}, c.BbFanPoser.pose(spec, mood, since, now, wave, tense, pose));
    const sitting = at(fan({}), "sit", 0, 5);
    this.check("앉아 있음은 그대로", sitting.lift === 0 && sitting.armLeft === 0);
    const early = at(fan({}), "cheer", 0, 0.1), late = at(fan({}), "cheer", 0, 1.2);
    this.check("반응 지연", early.armLeft === 0 && late.armLeft > 2, early.armLeft.toFixed(2) + " → " + late.armLeft.toFixed(2));
    this.check("느린 관중은 약하게", at(fan({ lazy: true }), "cheer", 0, 1.2).armLeft < late.armLeft * 0.6);
    const styles = [0, 1, 2, 3].map((style) => at(fan({ style }), "cheer", 0, 1.2));
    this.check("환호 동작 여러 가지", new Set(styles.map((one) => one.armLeft.toFixed(2) + "/" + one.armRight.toFixed(2) + "/" + one.spread.toFixed(2))).size >= 3);
    this.check("점프는 위로 뜀", [1.0, 1.1, 1.2, 1.3].some((now) => at(fan({}), "jump", 0, now).hop > 0.1));
    this.check("탄식은 고개 숙임", at(fan({}), "groan", 0, 1.2).bow > 0.3);
    const clapA = at(fan({ phase: 0.5 }), "clap", 0, 1.21), clapB = at(fan({ phase: 0.5 }), "clap", 0, 1.27);
    this.check("박수는 손이 움직임", Math.abs(clapA.spread - clapB.spread) > 0.05);
    this.check("파도는 각도 순서로", at(fan({ angle: 0.2 }), "sit", 0, 5, 0.3).armLeft > 1 && at(fan({ angle: 2.5 }), "sit", 0, 5, 0.3).armLeft === 0);
    board.set(1, "cheer", 10);
    this.check("사건 뒤 환호", board.of(1, 11).mood === "cheer");
    this.check("시간 지나면 앉음", board.of(1, 20).mood === "sit");
    board.tense = true;
    this.check("긴장되면 박수", board.of(1, 20).mood === "clap");
    this.check("긴장 박수는 일부만", at(fan({ phase: 4 }), "clap", 0, 2, -1, true).armLeft === 0 && at(fan({ phase: 1 }), "clap", 0, 2, -1, true).armLeft > 1);
  }

  run() {
    this.synth();
    this.scenes();
    this.crowd();
    this.failed.forEach((line) => console.log("실패: " + line));
    console.log(this.failed.length ? "실패 " + this.failed.length + "건 / 통과 " + this.passed + "건" : "모두 통과 (" + this.passed + "항목)");
    process.exitCode = this.failed.length ? 1 : 0;
  }
}

const flag = process.argv.indexOf("--pitches");
new AtmosphereCheck(flag > 0 ? Number(process.argv[flag + 1]) : 1500).run();
