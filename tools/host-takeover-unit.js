const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(file, names) {
  const context = { Math, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8") + "\nthis.__api={" + names.join(",") + "};", context);
  return context.__api;
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let m = s; m = Math.imul(m ^ (m >>> 15), m | 1); m ^= m + Math.imul(m ^ (m >>> 7), m | 61); return ((m ^ (m >>> 14)) >>> 0) / 4294967296; };
}

const results = [];
function check(name, ok, detail) { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : "")); }

function volleyball() {
  const A = load("34.volleyball-rules.js", ["VbConfig", "VbRallyEngine", "VolleyballBot"]);
  const random = seededRandom(7);
  const makeEngine = () => {
    const bots = [0, 1, 2, 3].map((slot) => new A.VolleyballBot(slot, random));
    return { bots, engine: new A.VbRallyEngine(bots, random) };
  };
  const runUntil = (setup, stop, startMs) => {
    let now = startMs;
    const records = [];
    const handle = (events) => events.forEach((event) => { if (event.type === "rally") records.push(event.rally); });
    let frames = 0;
    while (!stop(setup.engine, records) && frames < 60 * 600) {
      now += 1000 / 60;
      setup.bots.forEach((bot) => bot.poll(setup.engine, 1 / 60, now));
      handle(setup.engine.update(1 / 60, now));
      frames++;
    }
    return { now, records };
  };
  const first = makeEngine();
  let now = 100000;
  const started = [];
  first.engine.begin(now).forEach((event) => { if (event.type === "rally") started.push(event.rally); });
  const middle = runUntil(first, (engine, records) => records.some((rally) => rally.phase === "point" && rally.sa + rally.sb >= 3), now);
  const pointRecord = middle.records.filter((rally) => rally.phase === "point").pop();

  const second = makeEngine();
  const events = second.engine.resume({ n: pointRecord.n + 1, phase: "play", at: middle.now, serveTeam: pointRecord.serveTeam, server: pointRecord.server, sa: pointRecord.sa, sb: pointRecord.sb, winner: -1, why: "", lx: 0, lz: 0 }, middle.now);
  const serve = events.find((event) => event.type === "rally");
  check("34 이어받기: 점수·서브 팀·서버가 그대로", serve && serve.rally.sa === pointRecord.sa && serve.rally.sb === pointRecord.sb && serve.rally.serveTeam === pointRecord.serveTeam && serve.rally.server === pointRecord.server && serve.rally.phase === "serve");
  check("34 이어받기: 진행 중이던 랠리 번호 다음으로 이어짐", serve.rally.n === pointRecord.n + 2);
  const rest = runUntil(second, (engine) => engine.phase === "over", middle.now);
  const last = rest.records.filter((rally) => rally.phase === "over").pop();
  check("34 이어받기: 끝까지 진행해 승부가 난다", !!last && Math.max(last.sa, last.sb) >= A.VbConfig.WIN_SCORE && last.sa >= pointRecord.sa && last.sb >= pointRecord.sb, last ? last.sa + ":" + last.sb : "");

  const third = makeEngine();
  third.engine.resume({ n: 9, phase: "point", at: middle.now, serveTeam: 1, server: 3, sa: 5, sb: 6, winner: 1, why: "바닥", lx: 0, lz: 0 }, middle.now);
  check("34 이어받기: 득점 직후면 그 점수에서 다음 랠리로", third.engine.phase === "point" && third.engine.score[0] === 5 && third.engine.score[1] === 6 && third.engine.serverSlot() === 3);
}

function soccer() {
  const A = load("35.soccer-rules.js", ["SocConfig", "SocEngine", "SocBot"]);
  const random = seededRandom(11);
  const bots = [0, 1, 2, 3].map((slot) => new A.SocBot(slot, random));
  const engine = new A.SocEngine(bots, random);
  const events = engine.resume({ n: 4, phase: "play", at: 0, leftMs: 90000, overtime: false, sa: 2, sb: 1, kickoff: 1, scorer: -1 }, 5000);
  const ready = events.find((event) => event.type === "game");
  check("35 이어받기: 점수·남은 시간·킥오프 팀이 그대로", engine.score[0] === 2 && engine.score[1] === 1 && Math.round(engine.leftMs) === 90000 && engine.kickoffTeam === 1 && engine.phase === "ready", ready ? "" : "game 이벤트 없음");
  let now = 5000;
  let frames = 0;
  while (engine.phase !== "over" && frames < 60 * 400) {
    now += 1000 / 60;
    bots.forEach((bot) => bot.poll(engine, 1 / 60, now));
    engine.update(1 / 60, now);
    frames++;
  }
  check("35 이어받기: 남은 시간만큼만 뛰고 경기가 끝난다", engine.phase === "over" && engine.score[0] >= 2 && engine.score[1] >= 1 && frames < 60 * 400, "score " + engine.score.join(":") + " frames " + frames);

  const overtime = new A.SocEngine(bots, random);
  overtime.resume({ n: 8, phase: "goal", at: 0, leftMs: 0, overtime: true, sa: 3, sb: 2, kickoff: 1, scorer: 0 }, 9000);
  check("35 이어받기: 연장 골 직후면 바로 승부 확정", overtime.phase === "over" && overtime.winner === 0);
}

volleyball();
soccer();
process.exit(results.every(Boolean) ? 0 : 1);
