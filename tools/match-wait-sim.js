// 최근 2판 상대 피하기(팀이 7개 이상일 때)의 대기 시간·재대결 비율을 가상 시계로 돌려 본다. Firebase 없이 매칭 규칙(MkVersusMatcher)만 쓴다.
// 사용: node tools/match-wait-sim.js [시간(분, 기본 180)] [시드 수(기본 6)]
const fs = require("fs"), vm = require("vm"), path = require("path");

class MatchKitLoader {
  static NAMES = ["MkVersusMatcher", "MkRecentRivals"];
  static load() {
    const src = fs.readFileSync(path.join(__dirname, "..", "common/match-kit.js"), "utf8") + "\n;({" + MatchKitLoader.NAMES.join(",") + "})";
    return vm.runInNewContext(src, { console, Math, Date, JSON, Object, Array, String, Number, Set, Map, Promise, setTimeout, clearTimeout });
  }
}
const Mk = MatchKitLoader.load();

class Rng {
  constructor(seed) { this.state = seed >>> 0; }
  next() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  between(low, high) { return low + this.next() * (high - low); }
}

class Setup {
  static TICK_MS = 1000;
  static PARTY_SIZE = 3;
  static TIMING = { settleMs: 3000, claimExpireMs: 10000, rematchWaitMs: 150000, busyMs: 300000, returnGraceMs: 25000 };
  static AI_FALLBACK_MS = 120000;
  static MATCH_MS = [180000, 240000];
  static AI_MATCH_MS = 150000;
  static RETURN_MS = [15000, 40000];
  static WARMUP_MS = 15 * 60000;
  static SPREAD_MS = (Number(process.argv[4]) || 0) * 1000;
}

class SimTeam {
  constructor(code) {
    this.code = code;
    this.avoid = [];
    this.recent = [];
    this.owed = false;
    this.enteredAt = null;
    this.returnAt = 0;
    this.history = [];
  }
}

class Stats {
  constructor() { this.waits = []; this.aiMatches = 0; this.humanMatches = 0; this.repeatLast1 = 0; this.repeatLast2 = 0; this.pairCounts = new Map(); }
  percentile(p) {
    if (!this.waits.length) return 0;
    const sorted = this.waits.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  }
  merge(other) {
    this.waits = this.waits.concat(other.waits);
    ["aiMatches", "humanMatches", "repeatLast1", "repeatLast2"].forEach((key) => { this[key] += other[key]; });
    other.pairCounts.forEach((count, key) => this.pairCounts.set(key, (this.pairCounts.get(key) || 0) + count));
  }
  mean() { return this.waits.length ? this.waits.reduce((sum, v) => sum + v, 0) / this.waits.length : 0; }
}

class Arena {
  constructor(teamCount, newRule, seed) {
    this.rng = new Rng(seed);
    const timing = Object.assign({}, Setup.TIMING, newRule ? (Setup.SPREAD_MS ? { spreadWaitMs: Setup.SPREAD_MS } : {}) : { spreadWaitMs: 0 });
    this.matcher = new Mk.MkVersusMatcher(Setup.PARTY_SIZE, timing);
    this.newRule = newRule;
    this.teams = [];
    for (let i = 0; i < teamCount; i++) this.teams.push(new SimTeam("T" + (i + 1)));
    this.entries = {};
    this.stats = new Stats();
    this.now = 0;
  }

  run(totalMs) {
    this.teams.forEach((team) => { team.returnAt = this.rng.between(0, 30000); });
    for (this.now = 0; this.now < totalMs; this.now += Setup.TICK_MS) {
      this.teams.forEach((team) => { if (team.enteredAt === null && this.now >= team.returnAt) this.enter(team); });
      this.tryAi();
      this.bindAll();
    }
    return this.stats;
  }

  enter(team) {
    const entry = { leader: team.code, people: {}, bots: 0, size: Setup.PARTY_SIZE, at: this.now, claim: null };
    if (team.avoid.length) entry.avoid = team.avoid.slice();
    if (this.newRule && team.recent.length) entry.recent = team.recent.map((list) => list.slice());
    if (team.owed) entry.owed = true;
    this.entries[team.code] = entry;
    team.enteredAt = this.now;
  }

  tryAi() {
    this.teams.forEach((team) => {
      if (team.enteredAt === null) return;
      const waited = this.now - team.enteredAt;
      if (waited < Setup.AI_FALLBACK_MS) return;
      if (this.matcher.hasCompany(this.entries, this.now, team.code) && waited < Setup.AI_FALLBACK_MS + Setup.TIMING.rematchWaitMs + 15000) return;
      delete this.entries[team.code];
      team.avoid = [];
      team.owed = true;
      this.startPlay(team, Setup.AI_MATCH_MS);
      if (this.now >= Setup.WARMUP_MS) this.stats.aiMatches++;
    });
  }

  bindAll() {
    for (let guard = 0; guard < 20; guard++) {
      const plan = this.matcher.plan(this.entries, this.now, () => this.rng.next());
      if (!plan) return;
      const codes = plan.groups.map((group) => group.code);
      plan.groups.forEach((group) => {
        const team = this.teams.find((t) => t.code === group.code);
        const rivals = codes.filter((code) => code !== group.code);
        const last1 = team.history[0] || [], last2 = team.history.slice(0, 2);
        if (this.now >= Setup.WARMUP_MS) {
          this.stats.waits.push(this.now - team.enteredAt);
          if (rivals.some((code) => last1.indexOf(code) >= 0)) this.stats.repeatLast1++;
          if (rivals.some((code) => last2.some((list) => list.indexOf(code) >= 0))) this.stats.repeatLast2++;
        }
        team.avoid = rivals;
        team.recent = Mk.MkRecentRivals.push(team.recent, rivals);
        team.history.unshift(rivals);
        team.owed = false;
        delete this.entries[group.code];
      });
      if (this.now >= Setup.WARMUP_MS) {
        this.stats.humanMatches++;
        const key = codes.slice().sort().join("-");
        this.stats.pairCounts.set(key, (this.stats.pairCounts.get(key) || 0) + 1);
      }
      plan.groups.forEach((group) => this.startPlay(this.teams.find((t) => t.code === group.code), this.rng.between(Setup.MATCH_MS[0], Setup.MATCH_MS[1])));
    }
  }

  startPlay(team, duration) {
    team.enteredAt = null;
    team.returnAt = this.now + duration + this.rng.between(Setup.RETURN_MS[0], Setup.RETURN_MS[1]);
    this.entries[team.code] = { leader: team.code, people: {}, bots: 0, size: 0, at: this.now, claim: null, busyUntil: this.now + Setup.TIMING.busyMs, owed: team.owed || undefined };
    if (!team.owed) delete this.entries[team.code].owed;
  }
}

class Report {
  static run(minutes, seeds) {
    const counts = [4, 6, 7, 8, 9, 10, 12];
    console.log("가상 " + minutes + "분 × 시드 " + seeds + "개, 팀당 " + Setup.PARTY_SIZE + "명, 판 3~4분, 돌아와서 15~40초 뒤 다시 매칭\n");
    console.log("팀수 규칙 | 사람판 | AI판 | 평균대기 | 중앙 | 상위10% | 최대 | 바로전재대결 | 최근2판재대결 | 가장 많이 붙은 쌍 비율");
    counts.forEach((count) => {
      [false, true].forEach((newRule) => {
        const total = new Stats();
        for (let seed = 1; seed <= seeds; seed++) total.merge(new Arena(count, newRule, seed * 7919).run(minutes * 60000));
        const topPair = Math.max(0, ...total.pairCounts.values());
        const perMatch = total.humanMatches * 2;
        console.log([
          String(count).padStart(3), newRule ? "새  " : "기존",
          String(total.humanMatches).padStart(6), String(total.aiMatches).padStart(5),
          (total.mean() / 1000).toFixed(0).padStart(5) + "초", (total.percentile(0.5) / 1000).toFixed(0).padStart(4) + "초",
          (total.percentile(0.9) / 1000).toFixed(0).padStart(5) + "초", (total.percentile(1) / 1000).toFixed(0).padStart(5) + "초",
          (100 * total.repeatLast1 / Math.max(1, perMatch)).toFixed(1).padStart(6) + "%", (100 * total.repeatLast2 / Math.max(1, perMatch)).toFixed(1).padStart(6) + "%",
          (100 * topPair / Math.max(1, total.humanMatches)).toFixed(1).padStart(6) + "%",
        ].join(" | "));
      });
    });
  }
}

Report.run(Number(process.argv[2]) || 180, Number(process.argv[3]) || 6);
