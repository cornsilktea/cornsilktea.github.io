const fs = require("fs");
const path = require("path");
const vm = require("vm");

class FakeRef {
  constructor(store, p) { this.store = store; this.p = p; }
  child(c) { return new FakeRef(this.store, this.p ? this.p + "/" + c : c); }
  set(v) { if (this.store.failSets > 0) { this.store.failSets--; return Promise.reject(new Error("net")); } this.store.data[this.p] = v; return Promise.resolve(); }
  once() { const v = this.store.data[this.p]; return Promise.resolve({ val: () => (v === undefined ? null : v) }); }
  on(event, fn) { this.store.listeners.push({ p: this.p, event, fn }); return fn; }
  onDisconnect() { return { remove: () => { this.store.armed.push(this.p); return Promise.resolve(); }, cancel: () => Promise.resolve() }; }
}

function build(statusValue, failSets) {
  const store = { data: { "room/status": statusValue }, armed: [], listeners: [], failSets: failSets || 0 };
  const db = { ref: (p) => new FakeRef(store, p) };
  const state = { exited: null, afterReturn: 0, leaving: false };
  const roomRef = db.ref("room");
  const host = {
    myId: () => "me", room: () => roomRef, leaving: () => state.leaving,
    exit: (m) => { state.exited = m; }, subscribe: (r, e, l) => r.on(e, l),
    returnRecord: (saved) => saved, afterReturn: () => { state.afterReturn++; },
  };
  const source = fs.readFileSync(path.join(__dirname, "..", "room-drop-recovery.js"), "utf8") + "\nthis.RoomDropRecovery = RoomDropRecovery;";
  const sandbox = { setTimeout: (fn) => fn() };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const recovery = new sandbox.RoomDropRecovery(host, db, ["players", "st"]);
  return { store, state, recovery, roomRef };
}

const results = [];
function check(name, ok) { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name); }
const tick = () => new Promise((r) => setImmediate(r));

(async () => {
  let t = build("playing");
  t.recovery.arm(t.roomRef);
  check("arm: players·st 끊김 삭제를 건다", t.store.armed.join() === "room/players/me,room/st/me");
  t.store.armed.length = 0;
  t.recovery.recover({ team: "blue" });
  await tick(); await tick();
  check("방이 남아 있으면 내 정보를 다시 쓴다", JSON.stringify(t.store.data["room/players/me"]) === '{"team":"blue"}');
  check("다시 쓴 뒤 끊김 삭제를 다시 걸고 afterReturn 호출", t.store.armed.length === 2 && t.state.afterReturn === 1);

  t = build(null);
  t.recovery.recover({ team: "blue" });
  await tick(); await tick();
  check("방이 사라졌으면 방이 종료되었어요", t.state.exited === "방이 종료되었어요." && t.store.data["room/players/me"] === undefined);

  t = build("playing", 2);
  t.recovery.recover({ team: "red" });
  for (let i = 0; i < 6; i++) await tick();
  check("쓰기가 두 번 실패해도 세 번째에 복귀", t.state.exited === null && t.store.data["room/players/me"].team === "red");

  t = build("playing", 5);
  t.recovery.recover({ team: "red" });
  for (let i = 0; i < 8; i++) await tick();
  check("계속 실패하면 3회 뒤 방에서 나옴", t.state.exited === "연결이 끊겨 방에서 나왔어요.");

  t = build("playing");
  t.state.leaving = true;
  t.recovery.recover({ team: "red" });
  await tick(); await tick();
  check("직접 나간 경우엔 되살리지 않음", t.store.data["room/players/me"] === undefined && t.state.exited === null);

  t = build("playing");
  t.recovery.watchConnection(t.roomRef);
  const conn = t.store.listeners.find((l) => l.p === ".info/connected");
  t.store.armed.length = 0;
  conn.fn({ val: () => true });
  check(".info/connected 가 켜지면 끊김 삭제를 다시 건다", t.store.armed.length === 2);

  const memory = {};
  const resumeSandbox = {
    sessionStorage: { getItem: (k) => (k in memory ? memory[k] : null), setItem: (k, v) => { memory[k] = String(v); }, removeItem: (k) => { delete memory[k]; } },
    window: { setInterval: () => 1, clearInterval: () => undefined },
    Date,
  };
  vm.createContext(resumeSandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "room-drop-recovery.js"), "utf8") + "\nthis.RoomResumeStore = RoomResumeStore;", resumeSandbox);
  const Store = resumeSandbox.RoomResumeStore;
  const store = new Store("fps");
  const firstId = store.identity();
  check("저장이 없으면 새 아이디", /^p/.test(firstId) && store.read() === null);
  store.save("12345", firstId, { team: "blue" });
  check("저장 뒤 같은 아이디를 돌려준다", store.identity() === firstId && store.read().code === "12345");
  check("3분이 지나면 이어하지 않음", store.read(Date.now() + 181000) === null);
  const live = build("playing");
  live.store.data["room/12345/status"] = "playing";
  live.store.data["room/12345/players"] = { other: { team: "red" } };
  const rejoinDb = { ref: (p) => new FakeRef(live.store, p) };
  const code = await store.rejoin(rejoinDb, "room");
  check("방이 남아 있으면 코드와 함께 내 정보를 다시 쓴다", code === "12345" && live.store.data["room/12345/players/" + firstId].team === "blue");
  live.store.data["room/12345/status"] = null;
  const gone = await store.rejoin(rejoinDb, "room");
  check("방이 사라졌으면 null 이고 저장을 지운다", gone === null && store.read() === null);
  store.save("1", "x", { a: 1 });
  store.clear();
  check("clear 후 읽으면 없음", store.read() === null);

  process.exit(results.every(Boolean) ? 0 : 1);
})();
