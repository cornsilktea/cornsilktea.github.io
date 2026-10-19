const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const os = require("os");

function playGame(W, n) {
  const rng = new W.WbSeededRandom(9000 + n * 7919);
  const special = n % 10 === 9;
  const mode = special ? "solo" : (rng.next() < 0.5 ? "solo" : "team");
  const count = special ? 4 : mode === "solo" ? 2 + rng.int(7) : (2 + rng.int(3)) * 2;
  const levels = ["easy", "normal", "hard"];
  const level = levels[rng.int(3)];
  const teams = W.WbRosterPlanner.allBots(mode, count);
  const e = new W.WbEngine({ seed: 50000 + n, lootSeed: 123457 + n * 31, mode, teams });
  const brains = e.players.map((p, k) => new W.WbBotBrain(p.index, special ? (k === 0 ? "hard" : "normal") : level, e.seed));
  brains.forEach((b, k) => e.attach(k, b));
  const start = e.players.map((p) => ({ spawn: p.spawn, corner: (p.x < 7.5 ? 0 : 1) + (p.z < 6.5 ? 0 : 2) }));
  const picks = e.players.map(() => ({}));
  const lastEnemyPlace = e.players.map(() => -9999); const ownPlace = e.players.map(() => -9999);
  const r = { mode, count, level, special, violations: 0, outs: {}, self: 0, deaths: 0, picksByGrade: [0, 0, 0], mid: null, stuck: 0, pureSelf: 0 };
  while (!e.ended) {
    for (const ev of e.step()) {
      if (ev.t === "out") { r.outs[ev.why] = (r.outs[ev.why] || 0) + 1; r.deaths++; }
      if (ev.t === "place") { e.players.forEach((q, k) => { if (k !== ev.by && Math.abs(q.cellI - ev.i) + Math.abs(q.cellJ - ev.j) <= 4) lastEnemyPlace[k] = e.tick; }); ownPlace[ev.by] = e.tick; }
      if (ev.t === "trap" && ev.by === ev.id && lastEnemyPlace[ev.id] < ownPlace[ev.id]) r.pureSelf++;
      if (ev.t === "pick") { r.picksByGrade[ev.grade]++; picks[ev.by][ev.kind] = 1; }
    }
    for (const p of e.players) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || p.x < 0.3 || p.z < 0.3 || p.x > 14.7 || p.z > 12.7) r.violations++;
    }
    if (e.tick === 2700) {
      const alive = e.players.filter((p) => p.life !== "out");
      r.mid = alive.length ? [0, 1, 2].map((k) => alive.reduce((s, p) => s + [p.balloonsMax, p.range, p.shoe][k], 0) / alive.length) : null;
    }
  }
  r.len = e.tick / 30;
  r.self = e.players.reduce((s, p) => s + p.selfKills, 0);
  r.ranks = e.ranks;
  r.start = start;
  r.stuck = brains.reduce((s, b) => s + b.stuckEvents, 0);
  r.tries = e.report.tries; r.passed = e.report.passed;
  r.winners = e.players.filter((p, k) => e.ranks[k] === 1).map((p) => p.index);
  r.winnerPicks = r.winners.map((k) => picks[k]);
  r.teamOf = e.players.map((p) => p.team);
  return r;
}

if (!isMainThread) {
  const W = require("./balloon-load.js")();
  const out = [];
  for (let n = workerData.from; n < workerData.to; n++) out.push(playGame(W, n));
  parentPort.postMessage(out);
} else {
  const total = Number(process.argv[2] || 200);
  const threads = Math.min(os.cpus().length - 2, 16, total);
  const per = Math.ceil(total / threads);
  const t0 = Date.now();
  const jobs = [];
  for (let k = 0; k < threads; k++) {
    const from = k * per, to = Math.min(total, from + per);
    if (from >= to) continue;
    jobs.push(new Promise((ok, bad) => { const w = new Worker(__filename, { workerData: { from, to } }); w.on("message", ok); w.on("error", bad); }));
  }
  Promise.all(jobs).then((parts) => report([].concat(...parts), Date.now() - t0));
}

function pct(a, b) { return b ? (100 * a / b).toFixed(1) + "%" : "-"; }
function mean(list) { return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0; }
function quant(list, q) { const s = list.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }
function isDraw(r) { return r.mode === "solo" ? r.winners.length > 1 : new Set(r.winners.map((w) => r.teamOf[w])).size > 1; }

function report(all, ms) {
  const normal = all.filter((r) => !r.special);
  const lens = normal.map((r) => r.len);
  console.log("games " + all.length + " (" + (ms / 1000).toFixed(0) + "s)");
  console.log("length mean " + mean(lens).toFixed(1) + "s  p10/50/90 " + [0.1, 0.5, 0.9].map((q) => quant(lens, q).toFixed(0)).join("/") +
    "  reach sudden(>=120) " + pct(lens.filter((l) => l >= 120).length, lens.length) + "  full 180 " + pct(lens.filter((l) => l >= 180).length, lens.length) +
    "  draws " + pct(normal.filter(isDraw).length, normal.length));
  for (const mode of ["solo", "team"]) {
    const g = normal.filter((r) => r.mode === mode);
    console.log("  " + mode + ": mean " + mean(g.map((r) => r.len)).toFixed(1) + "s, draws " + pct(g.filter(isDraw).length, g.length));
  }
  for (const lv of ["easy", "normal", "hard"]) {
    const g = normal.filter((r) => r.level === lv);
    const deaths = g.reduce((s, r) => s + r.deaths, 0), self = g.reduce((s, r) => s + r.self, 0);
    console.log("  " + lv + ": games " + g.length + " mean " + mean(g.map((r) => r.len)).toFixed(1) + "s, deaths/game " + (deaths / Math.max(1, g.length)).toFixed(2) + ", self-kill share of deaths " + pct(self, deaths) + " (no enemy balloon nearby after mine: " + pct(g.reduce((s, r) => s + r.pureSelf, 0), deaths) + ")");
  }
  const reasons = {}; for (const r of all) for (const k in r.outs) reasons[k] = (reasons[k] || 0) + r.outs[k];
  console.log("out reasons " + JSON.stringify(reasons));
  const tally = (games, keyOf) => {
    const t = {};
    for (const r of games) {
      const share = 1 / r.winners.length, seen = new Set();
      r.start.forEach((s, k) => {
        const unit = r.mode === "team" ? r.teamOf[k] : k;
        if (seen.has(unit)) return; seen.add(unit);
        const key = keyOf(s); t[key] = t[key] || [0, 0]; t[key][1]++;
        t[key][0] += r.winners.filter((w) => (r.mode === "team" ? r.teamOf[w] : w) === unit).length * share;
      });
    }
    return Object.keys(t).sort().map((k) => k + ":" + pct(t[k][0], t[k][1]) + "(" + t[k][1] + ")").join(" ");
  };
  for (const c of [2, 3, 4, 5, 6, 7, 8]) {
    const g = normal.filter((r) => r.mode === "solo" && r.count === c);
    if (g.length) console.log("  solo " + c + "p (fair " + pct(1, c) + ") by spot: " + tally(g, (s) => s.spawn));
  }
  for (const c of [4, 6, 8]) {
    const g = normal.filter((r) => r.mode === "team" && r.count === c);
    if (g.length) console.log("  team " + c / 2 + " teams (fair " + pct(2, c) + ") by corner: " + tally(g, (s) => s.corner));
  }
  const tries = all.map((r) => r.tries);
  console.log("layout tries mean " + mean(tries).toFixed(1) + " max " + Math.max(...tries) + " failed " + pct(all.filter((r) => !r.passed).length, all.length));
  for (const c of [2, 3, 4, 5, 6, 7, 8]) {
    for (const mode of ["solo", "team"]) {
      const g = all.filter((r) => r.count === c && r.mode === mode);
      if (g.length) console.log("  " + mode + " " + c + "p tries mean " + mean(g.map((r) => r.tries)).toFixed(1) + " failed " + pct(g.filter((r) => !r.passed).length, g.length));
    }
  }
  const pg = [0, 0, 0]; all.forEach((r) => r.picksByGrade.forEach((v, k) => pg[k] += v));
  console.log("picks per game by grade " + pg.map((v) => (v / all.length).toFixed(1)).join(" / "));
  for (const c of [2, 4, 6, 8]) {
    const g = all.filter((r) => r.count === c && r.mid);
    if (g.length) console.log("  " + c + " players stats at 90s: balloons/range/shoe " + [0, 1, 2].map((k) => mean(g.map((r) => r.mid[k])).toFixed(2)).join(" / "));
  }
  const sp = all.filter((r) => r.special);
  if (sp.length) console.log("hard 1 vs normal 3: hard win " + pct(sp.reduce((s, r) => s + (r.winners.includes(0) ? 1 / r.winners.length : 0), 0), sp.length) + " (fair 25%) over " + sp.length);
  const kinds = {}; let wc = 0;
  for (const r of normal) for (const p of r.winnerPicks) { wc++; for (const k in p) kinds[k] = (kinds[k] || 0) + 1; }
  console.log("winners holding kind: " + Object.keys(kinds).map((k) => k + " " + pct(kinds[k], wc)).join(", "));
  console.log("stuck events " + all.reduce((s, r) => s + r.stuck, 0) + ", violations " + all.reduce((s, r) => s + r.violations, 0));
}
