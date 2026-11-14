// 41번 야구 온라인 투수 교체 검사: BbRoomLink 가 교체(log/<순번>/c)와 10초 타임(log/<순번>/t)을
// 모든 기기에서 같은 순서로 접는지 가짜 Firebase 로 확인한다(화면 없이).
// 사용: npx tsc -p . 다음에 node tools/baseball-relief-net-check.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");

class FakeTree {
  constructor() { this.data = {}; this.listeners = []; this.clock = 1000000; }

  read(parts) { return parts.reduce((node, key) => (node && typeof node === "object" ? node[key] : undefined), this.data); }

  write(parts, value) {
    const watched = this.listeners.map((entry) => entry.path.split("/")).filter((base) => base.length < parts.length && base.every((key, index) => parts[index] === key));
    const existed = watched.map((base) => this.read(parts.slice(0, base.length + 1)) !== undefined);
    let node = this.data;
    parts.slice(0, -1).forEach((key) => { if (!node[key] || typeof node[key] !== "object") node[key] = {}; node = node[key]; });
    node[parts[parts.length - 1]] = JSON.parse(JSON.stringify(value));
    watched.forEach((base, index) => {
      const child = parts.slice(0, base.length + 1), event = existed[index] ? "child_changed" : "child_added";
      this.listeners.filter((entry) => entry.path === base.join("/") && entry.event === event).forEach((entry) => entry.listener({ key: child[child.length - 1], val: () => JSON.parse(JSON.stringify(this.read(child))) }));
    });
  }

  ref(parts = []) {
    const tree = this;
    return {
      child: (sub) => tree.ref(parts.concat(String(sub).split("/"))),
      set: (value) => { tree.write(parts, value); return Promise.resolve(); },
      once: () => Promise.resolve({ val: () => JSON.parse(JSON.stringify(tree.read(parts) || null)) }),
      on: (event, listener) => { tree.listeners.push({ path: parts.join("/"), event, listener }); return listener; },
      off: () => undefined,
      transaction: (update) => {
        const next = update(tree.read(parts));
        if (next !== undefined) tree.write(parts, next);
        return Promise.resolve({ committed: next !== undefined });
      }
    };
  }
}

class FakeDirector {
  constructor(seats) { this.sequence = 0; this.calls = []; this.awaitsPitch = true; this.seats = seats; }
  deliverChange(sequence, index) {
    if (sequence !== this.sequence) return false;
    this.calls.push("change " + sequence + "→" + index);
    this.sequence++;
    return true;
  }
  deliverPitch(sequence) { this.calls.push("pitch " + sequence); }
  deliverSwing(sequence) { this.calls.push("swing " + sequence); }
  showRemoteTime(seconds) { this.remote = seconds; }
}

class NetCode {
  static load() {
    const folder = path.join(root, "games", "41.baseball-duel");
    const files = ["41.baseball-motion.js", "41.baseball-field.js", "41.baseball-pitch.js", "41.baseball-batting.js", "41.baseball-running.js", "41.baseball-defense.js", "41.baseball-play.js", "41.baseball-game.js", "41.baseball-net.js"];
    const stub = "class BbMatchDirector { static TIME_OUT_SECONDS = 10; }\n";
    const source = stub + files.map((file) => fs.readFileSync(path.join(folder, file), "utf8")).join("\n") + "\n;({BbRoomLink, BbRosterPlan})";
    return vm.runInNewContext(source, { console, Math, Map, Set, Array, Object, Number, Infinity, JSON, Promise });
  }
}

class ReliefNetCheck {
  constructor() { this.code = NetCode.load(); this.passed = 0; this.failed = []; }
  ok(condition, label, detail) { if (condition) this.passed++; else this.failed.push(label + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }

  link(tree, hosting, director) {
    const session = { ref: tree.ref(["room"]), isHost: () => hosting };
    const backend = { now: () => tree.clock };
    return new this.code.BbRoomLink(director, session, backend);
  }

  async run() {
    const tree = new FakeTree();
    const hostDirector = new FakeDirector(), guestDirector = new FakeDirector();
    const hostLink = this.link(tree, true, hostDirector), guestLink = this.link(tree, false, guestDirector);
    await hostLink.open();
    await guestLink.open();
    const pumpAll = () => { hostLink.pump(); guestLink.pump(); };

    guestLink.timeChosen(0, true);
    tree.clock += 3000;
    pumpAll();
    this.ok(Math.abs(hostDirector.remote - 7) < 0.01, "10초 타임 시작이 상대 화면에 남은 시간(7초)으로 보임", hostDirector.remote);

    guestLink.changeChosen(0, 2);
    pumpAll();
    this.ok(hostDirector.calls.join() === "change 0→2" && guestDirector.calls.join() === "change 0→2", "교체가 두 기기에서 같은 순번·같은 투수로 접힘", [hostDirector.calls, guestDirector.calls]);
    this.ok(hostDirector.remote === 0, "교체가 들어오면 타임 표시가 꺼짐", hostDirector.remote);

    guestLink.changeChosen(0, 1);
    pumpAll();
    this.ok(hostDirector.calls.length === 1, "같은 순번에 두 번째 교체는 먼저 쓴 쪽이 이김(무시)", hostDirector.calls);

    guestLink.timeChosen(1, true);
    pumpAll();
    this.ok(hostDirector.remote > 9.9, "다음 순번 타임 시작", hostDirector.remote);
    guestLink.timeChosen(1, false);
    pumpAll();
    this.ok(hostDirector.remote === 0, "타임 취소(done)면 표시가 꺼짐", hostDirector.remote);

    guestLink.pitchChosen(1, { pitch: "ft", aim: { u: 0, v: 0 } });
    pumpAll();
    const roll = tree.read(["room", "log", "1", "r"]);
    this.ok(!!roll, "교체 다음 순번 투구에 방장이 난수를 붙임");
    guestLink.swingChosen(1, null);
    tree.write(["room", "log", "2", "c"], { to: 9 });
    tree.write(["room", "log", "3", "c"], { to: 1 });
    tree.write(["room", "log", "3", "p"], { t: "ft", u: 0, v: 0 });

    const late = this.link(tree, false, new FakeDirector()), folded = await late.open();
    this.ok(folded.length === 2 && folded[0].change === 2 && folded[1].pitch === "ft", "늦게 들어온 관전자: 교체 → 투구 순서로 복원", folded);
    this.ok(!folded.some((entry) => entry.change === 9), "범위 밖 투수 번호(9)는 교체로 읽지 않음", folded);

    const both = new FakeTree();
    both.write(["room", "log", "0", "c"], { to: 1 });
    both.write(["room", "log", "0", "p"], { t: "ft", u: 0, v: 0 });
    both.write(["room", "log", "0", "r"], { seed: 5, at: 1 });
    both.write(["room", "log", "0", "s"], { k: "take" });
    const mixed = await this.link(both, false, new FakeDirector()).open();
    this.ok(mixed.length === 1 && mixed[0].change === 1, "같은 순번에 교체와 투구가 함께 있으면 교체로 접음(모든 기기 같은 규칙)", mixed);

    this.failed.forEach((line) => console.log("실패  " + line));
    console.log(this.failed.length ? "실패 " + this.failed.length + "건 / 통과 " + this.passed + "건" : "모두 통과 (" + this.passed + "항목)");
    process.exit(this.failed.length ? 1 : 0);
  }
}

new ReliefNetCheck().run();
