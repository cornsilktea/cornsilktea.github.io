// 31번 랜덤 매칭 대기 시간 시뮬레이션: node tools/zombie-queue-sim.js
// 학생 N명이 "대기열 → 매칭 → 한 판(3분 + 결과·대기실 1분) → 다시 대기열"을 반복할 때 대기열에서 기다린 시간을 잰다.
// 진짜 match-kit.js 의 MkFreeForAllMatcher 를 그대로 쓴다. 방금 판의 상대는 entry.avoid 로 넘긴다(앱의 MkQueue 와 같은 방식).
const fs = require("fs"), vm = require("vm"), path = require("path");
const K = vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "match-kit.js"), "utf8") + ";({MkFreeForAllMatcher,MkMatcher})",
  { console, Math, Date, Set, Map, Object, Array, JSON, Number, String, window: {}, document: {} });

class Rng {
  constructor(seed) { this.s = seed >>> 0; }
  next() { this.s = (this.s * 1664525 + 1013904223) >>> 0; return this.s / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
}

class QueueWorld {
  static ROUND_S = 240;
  constructor(students, matcher, seed, spread) {
    this.rng = new Rng(seed); this.matcher = matcher;
    this.entries = {}; this.busy = {}; this.avoid = {}; this.waits = []; this.sizes = []; this.rematchPairs = 0; this.pairs = 0; this.matches = 0;
    for (let i = 0; i < students; i++) this.busy["s" + i] = this.rng.range(0, spread);
  }

  run(seconds) {
    for (let now = 0; now < seconds; now++) {
      Object.keys(this.busy).forEach((id) => { if (this.busy[id] <= now) { delete this.busy[id]; this.entries[id] = { size: 1, at: now * 1000, people: {}, avoid: (this.avoid[id] || []).slice() }; } });
      for (let guard = 0; guard < 6; guard++) if (!this.tryMatch(now)) break;
    }
    return this.stats(seconds);
  }

  tryMatch(now) {
    const plan = this.matcher.plan(this.entries, now * 1000, () => this.rng.next());
    if (!plan) return false;
    const ids = plan.groups.map((g) => g.code);
    ids.forEach((id) => { this.seats = (this.seats || 0) + 1; if (ids.some((other) => other !== id && (this.avoid[id] || []).indexOf(other) >= 0)) this.rematchSeats = (this.rematchSeats || 0) + 1; });
    ids.forEach((id) => {
      this.waits.push(now - this.entries[id].at / 1000);
      delete this.entries[id];
      this.avoid[id] = ids.filter((other) => other !== id);
      this.busy[id] = now + QueueWorld.ROUND_S + this.rng.range(-20, 40);
    });
    this.matches++; this.sizes.push(ids.length);
    return true;
  }

  stats(seconds) {
    const w = this.waits.slice().sort((a, b) => a - b), pick = (q) => w[Math.min(w.length - 1, Math.floor(w.length * q))] || 0;
    const mean = w.reduce((a, b) => a + b, 0) / (w.length || 1);
    return { n: w.length, mean, med: pick(0.5), p90: pick(0.9), max: w[w.length - 1] || 0, matches: this.matches, avgSize: this.sizes.reduce((a, b) => a + b, 0) / (this.sizes.length || 1), waiting: Object.keys(this.entries).length, rematch: (this.rematchSeats || 0) / (this.seats || 1) * 100 };
  }
}

class Report {
  static variants() {
    const T = K.MkMatcher.TIMING;
    return [
      ["① 지금 방식(2명 이상이면 바로, 피하기 없음)", () => new K.MkFreeForAllMatcher(1, 5)],
      ["② 4명 모일 때까지 + 5번째 1분 대기(현재 적용)", () => new K.MkFreeForAllMatcher(1, 5, T, Infinity, 4, 60000)],
      ["③ ② + 방금 상대 피하기 30초", () => new K.MkFreeForAllMatcher(1, 5, T, Infinity, 4, 60000, 30000)],
      ["④ ② + 방금 상대 피하기 60초", () => new K.MkFreeForAllMatcher(1, 5, T, Infinity, 4, 60000, 60000)],
      ["⑤ ② + 방금 상대 피하기 120초", () => new K.MkFreeForAllMatcher(1, 5, T, Infinity, 4, 60000, 120000)],
      ["⑥ ② + 방금 상대 피하기 180초 한도", () => new K.MkFreeForAllMatcher(1, 5, T, Infinity, 4, 60000, 180000)],
      ["⑦ ② + 끝까지 피하기(시간 제한 없음)", () => new K.MkFreeForAllMatcher(1, 5, T, Infinity, 4, 60000, 1e9)]
    ];
  }

  static main() {
    const SECONDS = 3600 * 2, RUNS = 5;
    [20, 25].forEach((students) => {
      console.log("== 학생 " + students + "명 · 2시간 · " + RUNS + "번 평균(시작 시각은 0~60초 사이에 흩어짐, 한 판 약 4분)");
      console.log("방식".padEnd(46), "평균 대기".padStart(9), "중앙값".padStart(7), "90%".padStart(6), "최대".padStart(6), "판 수".padStart(6), "평균 인원".padStart(9), "방금 상대 재회".padStart(14));
      Report.variants().forEach(([name, make]) => {
        const acc = { mean: 0, med: 0, p90: 0, max: 0, matches: 0, avgSize: 0, rematch: 0 };
        for (let run = 0; run < RUNS; run++) {
          const r = new QueueWorld(students, make(), 100 + run * 13, 60).run(SECONDS);
          Object.keys(acc).forEach((k) => { acc[k] += r[k] / RUNS; });
        }
        const f = (x) => Math.round(x) + "초";
        console.log(name.padEnd(46), f(acc.mean).padStart(9), f(acc.med).padStart(7), f(acc.p90).padStart(6), f(acc.max).padStart(6), String(Math.round(acc.matches)).padStart(6), acc.avgSize.toFixed(2).padStart(9), (acc.rematch.toFixed(0) + "%").padStart(14));
      });
    });
  }
}

Report.main();
