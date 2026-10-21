const fs = require("fs"), vm = require("vm"), path = require("path");

class MatchKitLoader {
  static NAMES = ["MkPaths", "MkMatcher", "MkVersusMatcher", "MkFreeForAllMatcher", "MkRecordBook", "MkPartyDirectory", "MkParty", "MkQueue"];
  static load() {
    const src = fs.readFileSync(path.join(__dirname, "..", "match-kit.js"), "utf8") + "\n;({" + MatchKitLoader.NAMES.join(",") + "})";
    return vm.runInNewContext(src, { console, Math, Date, JSON, Object, Array, String, Number, Set, Map, Promise, setTimeout, clearTimeout });
  }
}
const Mk = MatchKitLoader.load();

class Report {
  static passed = 0;
  static failures = [];
  static check(name, ok, detail) { if (ok) Report.passed++; else Report.failures.push(name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
}

class Util {
  static wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  static clone(value) { return value === undefined || value === null ? null : JSON.parse(JSON.stringify(value)); }
  static split(p) { return String(p || "").split("/").filter(Boolean); }
}

class MockServer {
  constructor(maxLag) { this.tree = {}; this.listeners = []; this.disconnects = new Map(); this.dead = new Set(); this.maxLag = maxLag; this.writes = 0; }
  lag() { return Math.floor(Math.random() * (this.maxLag + 1)); }
  get(p) { let node = this.tree; for (const part of Util.split(p)) { if (node === null || typeof node !== "object") return null; node = node[part]; if (node === undefined) return null; } return Util.clone(node); }
  put(p, value) {
    const parts = Util.split(p);
    this.writes++;
    if (!parts.length) { this.tree = Util.clone(value) || {}; return; }
    let node = this.tree;
    for (let i = 0; i < parts.length - 1; i++) { if (node[parts[i]] === null || typeof node[parts[i]] !== "object") node[parts[i]] = {}; node = node[parts[i]]; }
    if (value === null || value === undefined) delete node[parts[parts.length - 1]]; else node[parts[parts.length - 1]] = Util.clone(value);
    this.prune(this.tree);
  }
  prune(node) {
    if (node && typeof node === "object") { for (const key of Object.keys(node)) { node[key] = this.prune(node[key]); if (node[key] === null) delete node[key]; } return Object.keys(node).length ? node : null; }
    return node;
  }
  notify() {
    for (const listener of this.listeners) {
      const json = JSON.stringify(this.get(listener.path));
      if (json === listener.last) continue;
      listener.last = json;
      const at = Math.max(listener.nextAt, Date.now() + this.lag());
      listener.nextAt = at;
      setTimeout(() => { if (listener.on && !this.dead.has(listener.client)) listener.fn(MockRef.snap(listener.path, JSON.parse(json))); }, Math.max(0, at - Date.now()));
    }
  }
  kill(client) {
    this.dead.add(client);
    (this.disconnects.get(client) || new Set()).forEach((p) => this.put(p, null));
    this.disconnects.delete(client);
    this.listeners = this.listeners.filter((l) => l.client !== client);
    this.notify();
  }
  database(client) {
    return { ref: (p) => {
      if (typeof p !== "string" || p === "") throw new Error("실제 Firebase 처럼 빈 경로는 거절");
      return new MockRef(this, client, Util.split(p).join("/"));
    } };
  }
}

class MockRef {
  static snap(p, value) { const parts = Util.split(p); return { key: parts[parts.length - 1] || null, val: () => Util.clone(value), exists: () => value !== null && value !== undefined }; }
  constructor(server, client, p) { this.server = server; this.client = client; this.path = p; }
  child(p) { return new MockRef(this.server, this.client, this.path ? this.path + "/" + p : p); }
  alive() { return !this.server.dead.has(this.client); }
  async set(value) { await Util.wait(this.server.lag()); if (!this.alive()) return; this.server.put(this.path, value); this.server.notify(); }
  async remove() { return this.set(null); }
  async update(values) {
    await Util.wait(this.server.lag());
    if (!this.alive()) return;
    Object.keys(values).forEach((key) => this.server.put(this.path ? this.path + "/" + key : key, values[key]));
    this.server.notify();
  }
  async once() { await Util.wait(this.server.lag()); return MockRef.snap(this.path, this.server.get(this.path)); }
  warm() { return this.server.listeners.some((l) => l.client === this.client && (this.path === l.path || this.path.startsWith(l.path + "/"))); }
  async transaction(update) {
    let local = this.warm() ? this.server.get(this.path) : null;
    for (let attempt = 0; attempt < 50; attempt++) {
      const result = update(Util.clone(local));
      if (result === undefined) return { committed: false, snapshot: MockRef.snap(this.path, local) };
      await Util.wait(this.server.lag());
      if (!this.alive()) throw new Error("disconnected");
      const server = this.server.get(this.path);
      if (JSON.stringify(server) !== JSON.stringify(local)) { local = server; continue; }
      this.server.put(this.path, result);
      this.server.notify();
      return { committed: true, snapshot: MockRef.snap(this.path, result) };
    }
    throw new Error("transaction retries exhausted");
  }
  onDisconnect() {
    const server = this.server, client = this.client, p = this.path;
    return {
      remove: async () => { if (!server.disconnects.has(client)) server.disconnects.set(client, new Set()); server.disconnects.get(client).add(p); },
      cancel: async () => { const set = server.disconnects.get(client); if (set) set.delete(p); },
    };
  }
  on(event, fn) {
    const listener = { client: this.client, path: this.path, fn, on: true, last: JSON.stringify(this.server.get(this.path)), nextAt: 0 };
    this.server.listeners.push(listener);
    const value = this.server.get(this.path);
    listener.nextAt = Date.now() + this.server.lag();
    setTimeout(() => { if (listener.on) fn(MockRef.snap(this.path, value)); }, Math.max(0, listener.nextAt - Date.now()));
    return fn;
  }
  off(event, fn) { this.server.listeners.forEach((l) => { if (l.client === this.client && l.path === this.path && l.fn === fn) l.on = false; }); this.server.listeners = this.server.listeners.filter((l) => l.on); }
}

class SimWorld {
  static TIMING = { settleMs: 40, claimExpireMs: 300 };
  static clock = { now: () => Date.now() };
  static clientSeq = 0;

  constructor(matcher, maxLag) {
    this.server = new MockServer(maxLag);
    this.paths = Mk.MkPaths.forGame("simgame", "simgame");
    this.matcher = matcher;
    this.plans = [];
    this.rooms = 0;
    this.made = [];
    this.discarded = [];
    this.makerHook = null;
  }
  maker(hostId) {
    return { create: async (plan) => {
      if (this.makerHook) { const verdict = await this.makerHook(plan, hostId); if (verdict === null) return null; }
      const db = this.server.database(hostId);
      const room = String(10000 + this.rooms++);
      await db.ref(this.paths.rooms + "/" + room).set({ status: "lobby", hostPlayerId: hostId });
      this.made.push(room);
      return { room, host: hostId, map: "맵" + (plan.seed % 3) };
    }, discard: async (made) => {
      this.discarded.push(made.room);
      await this.server.database(hostId).ref(this.paths.rooms + "/" + made.room).remove();
    } };
  }
  async team(size, limit) {
    const ids = [];
    for (let i = 0; i < size; i++) ids.push("p" + (++SimWorld.clientSeq));
    const leaderDb = this.server.database(ids[0]);
    const directory = new Mk.MkPartyDirectory(leaderDb, SimWorld.clock, this.paths, limit);
    const code = await directory.create(ids[0], { nick: ids[0], joinedAt: Date.now() });
    const parties = [];
    for (let i = 0; i < ids.length; i++) {
      const db = this.server.database(ids[i]);
      if (i > 0) {
        const outcome = await new Mk.MkPartyDirectory(db, SimWorld.clock, this.paths, limit).join(code, ids[i], { nick: ids[i], joinedAt: Date.now() + i });
        if (!outcome.ok) throw new Error("join failed " + outcome.message);
      }
      const party = new Mk.MkParty(db, SimWorld.clock, this.paths, code, ids[i], limit);
      party.tickets = [];
      party.onTicket = (ticket) => party.tickets.push(ticket);
      party.connect();
      parties.push(party);
    }
    await Util.wait(10);
    const queue = new Mk.MkQueue(leaderDb, SimWorld.clock, this.paths, this.matcher, this.maker(ids[0]));
    queue.onBound = (plan) => this.plans.push({ plan: JSON.parse(JSON.stringify(plan)), at: Date.now() });
    return { code, ids, parties, queue, leader: parties[0], cancelled: false, killed: false };
  }
  queueNow() { return this.server.get(this.paths.queue) || {}; }
}

class Scenarios {
  static planCodes(world) { const seen = new Map(); world.plans.forEach((p) => p.plan.groups.forEach((g) => seen.set(g.code, (seen.get(g.code) || 0) + 1))); return seen; }

  static async scenarioRandom(label, matcher, teamCount, maxSize, opts) {
    const world = new SimWorld(matcher, opts.lag);
    const teams = [];
    for (let i = 0; i < teamCount; i++) teams.push(await world.team(1 + Math.floor(Math.random() * maxSize), maxSize));
    const actions = teams.map(async (team) => {
      await Util.wait(Math.floor(Math.random() * opts.spread));
      await team.queue.enter(team.leader);
      const roll = Math.random();
      if (roll < opts.cancelRate) {
        await Util.wait(Math.floor(Math.random() * 80));
        team.cancelled = await team.queue.cancel(team.leader);
      } else if (roll < opts.cancelRate + opts.killRate) {
        await Util.wait(Math.floor(Math.random() * 80));
        team.killed = true;
        team.queue.stop();
        world.server.kill(team.ids[0]);
      }
    });
    await Promise.all(actions);
    await Util.wait(opts.settle);
    const counts = Scenarios.planCodes(world);
    Report.check(label + ": 한 팀이 두 번 묶이지 않음", [...counts.values()].every((n) => n === 1), [...counts.entries()].filter(([, n]) => n > 1));
    Report.check(label + ": 남은 방 수 = 묶음 수(버린 방은 지워짐)", world.made.length - world.discarded.length === world.plans.length && Object.keys(world.server.get(world.paths.rooms) || {}).length === world.plans.length, [world.made.length, world.discarded.length, world.plans.length]);
    if (world.discarded.length) console.log("  " + label + ": 차지를 잃어 버린 방 " + world.discarded.length + "개");
    Report.check(label + ": 취소에 성공한 팀은 묶이지 않음", teams.filter((t) => t.cancelled).every((t) => !counts.has(t.code)));
    const sizes = world.plans.map((p) => p.plan.groups.reduce((s, g) => s + g.entry.size, 0));
    Report.check(label + ": 묶음 인원이 정원 안", sizes.every((n) => n <= opts.capacity), sizes);
    Report.check(label + ": 묶음마다 2팀 이상", world.plans.every((p) => p.plan.groups.length >= 2));
    if (opts.versus) Report.check(label + ": 1대1 묶음은 정확히 2팀·편 0/1", world.plans.every((p) => p.plan.groups.length === 2 && p.plan.groups.map((g) => g.side).sort().join() === "0,1"));
    const delivered = teams.filter((t) => counts.has(t.code) && !t.killed);
    const allGot = delivered.every((t) => t.parties.every((party) => world.server.dead.has(party.myId) || party.tickets.length === 1));
    Report.check(label + ": 묶인 팀의 모든 팀원이 표를 한 번 받음", allGot, delivered.filter((t) => t.parties.some((p) => p.tickets.length !== 1)).map((t) => [t.code, t.parties.map((p) => p.tickets.length)]));
    const sameRoom = delivered.every((t) => t.parties.every((party) => !party.tickets.length || party.tickets[0].room === t.parties[0].tickets[0].room));
    Report.check(label + ": 같은 팀은 같은 방", sameRoom);
    const left = world.queueNow();
    const stuck = Object.keys(left).filter((code) => left[code].claim);
    Report.check(label + ": 끝난 뒤 차지된 채 남은 항목 없음", stuck.length === 0, stuck);
    const leftover = matcher.plan(left, Date.now() + 1e6, Math.random);
    Report.check(label + ": 끝난 뒤 남은 항목끼리 더 묶을 수 없음", leftover === null, left);
    const searchingWithoutEntry = teams.filter((t) => !t.killed && !t.cancelled && t.leader.searching() && !left[t.code]);
    Report.check(label + ": 대기열에 없는데 '찾는 중'인 팀 없음", searchingWithoutEntry.length === 0, searchingWithoutEntry.map((t) => t.code));
    teams.forEach((t) => { t.queue.stop(); t.parties.forEach((p) => p.silentClose()); });
    return world;
  }

  static async scenarioMakerFails() {
    const world = new SimWorld(new Mk.MkVersusMatcher(1, SimWorld.TIMING), 3);
    let failOnce = true;
    world.makerHook = async () => { if (failOnce) { failOnce = false; return null; } return true; };
    const a = await world.team(1, 1), b = await world.team(1, 1);
    await a.queue.enter(a.leader); await b.queue.enter(b.leader);
    await Util.wait(500);
    Report.check("방 만들기 실패: 차지를 풀고 다시 묶음", world.plans.length === 1 && a.leader.tickets.length === 1 && b.leader.tickets.length === 1, [world.plans.length, a.leader.tickets.length, b.leader.tickets.length]);
    [a, b].forEach((t) => { t.queue.stop(); t.leader.silentClose(); });
  }

  static async scenarioBinderDies() {
    const world = new SimWorld(new Mk.MkVersusMatcher(1, SimWorld.TIMING), 3);
    const x = await world.team(1, 1);
    world.makerHook = async (plan, hostId) => { if (hostId === x.ids[0]) { await Util.wait(10000); return null; } return true; };
    const y = await world.team(1, 1);
    await x.queue.enter(x.leader); await Util.wait(5); await y.queue.enter(y.leader);
    await Util.wait(120);
    const claimed = world.queueNow()[y.code];
    Report.check("묶던 팀장 끊김: 상대 항목이 차지된 상태였음", !!(claimed && claimed.claim), claimed);
    x.queue.stop();
    world.server.kill(x.ids[0]);
    const z = await world.team(1, 1);
    await z.queue.enter(z.leader);
    await Util.wait(800);
    Report.check("묶던 팀장 끊김: 차지가 풀린 뒤 남은 팀끼리 묶임", y.leader.tickets.length === 1 && z.leader.tickets.length === 1 && y.leader.tickets[0].room === z.leader.tickets[0].room, [y.leader.tickets, z.leader.tickets]);
    Report.check("묶던 팀장 끊김: 끊긴 팀 항목은 대기열에서 빠짐", !world.queueNow()[x.code]);
    [y, z].forEach((t) => { t.queue.stop(); t.leader.silentClose(); });
  }

  static async scenarioCancelWhileClaimed() {
    const world = new SimWorld(new Mk.MkVersusMatcher(1, SimWorld.TIMING), 3);
    const a = await world.team(1, 1), b = await world.team(1, 1);
    let release;
    world.makerHook = () => new Promise((resolve) => { release = resolve; });
    await a.queue.enter(a.leader); await Util.wait(5); await b.queue.enter(b.leader);
    await Util.wait(150);
    const cancelled = await b.queue.cancel(b.leader);
    Report.check("묶이는 중 취소: 취소가 거절됨(곧 표가 옴)", cancelled === false);
    release(true);
    await Util.wait(100);
    Report.check("묶이는 중 취소: 두 팀 모두 표를 받음", a.leader.tickets.length === 1 && b.leader.tickets.length === 1);
    [a, b].forEach((t) => { t.queue.stop(); t.leader.silentClose(); });
  }

  static async scenarioJoinRules() {
    const world = new SimWorld(new Mk.MkVersusMatcher(2, SimWorld.TIMING), 3);
    const team = await world.team(2, 2);
    const outsider = world.server.database("outsider");
    const directory = new Mk.MkPartyDirectory(outsider, SimWorld.clock, world.paths, 2);
    const full = await directory.join(team.code, "outsider", { nick: "o", joinedAt: Date.now() });
    Report.check("팀 들어가기: 가득 차면 거절", !full.ok && /가득/.test(full.message), full);
    const none = await directory.join("99999", "outsider", { nick: "o", joinedAt: Date.now() });
    Report.check("팀 들어가기: 없는 코드 거절", !none.ok && /없어요/.test(none.message), none);
    const solo = await world.team(1, 2);
    solo.leader.setBots(5);
    await Util.wait(30);
    Report.check("AI 추가: 팀 정원까지만", solo.leader.bots() === 1, solo.leader.bots());
    const joinWithBot = await directory.join(solo.code, "outsider", { nick: "o", joinedAt: Date.now() });
    await Util.wait(30);
    Report.check("AI 자리에 사람이 들어오면 AI 가 빠짐", joinWithBot.ok && solo.leader.bots() === 0 && solo.leader.members().length === 2, [joinWithBot, solo.leader.bots()]);
    const third = await world.team(1, 2);
    await third.queue.enter(third.leader);
    await Util.wait(20);
    const busy = await new Mk.MkPartyDirectory(world.server.database("late"), SimWorld.clock, world.paths, 2).join(third.code, "late", { nick: "l", joinedAt: Date.now() });
    Report.check("팀 들어가기: 찾는 중이면 거절", !busy.ok && /찾는 중/.test(busy.message), busy);
    Report.check("팀 코드 존재 확인", (await directory.exists(team.code)) && !(await directory.exists("99999")));
    [team, solo, third].forEach((t) => { t.queue.stop(); t.parties.forEach((p) => p.silentClose()); });
  }

  static async scenarioStreak() {
    const world = new SimWorld(new Mk.MkVersusMatcher(3, SimWorld.TIMING), 2);
    const team = await world.team(3, 3);
    const [leader, second, third] = team.parties;
    const ticket = (id) => ({ matchId: id, room: "10000", side: 0, host: "h", expect: 2, at: Date.now(), rivals: ["상대1", "상대2"], map: "숲" });
    await leader.report(ticket("m1"), { result: "win" });
    await leader.report(ticket("m2"), { result: "win" });
    await Util.wait(30);
    Report.check("연승: 2승이면 2연승", leader.book().streak() === 2 && second.book().streak() === 2, leader.book().streak());
    const both = await Promise.all([leader.report(ticket("m2"), { result: "win" }), leader.report(ticket("m2"), { result: "win" })]);
    await Util.wait(30);
    Report.check("연승: 같은 판 두 번 반영 안 됨", leader.book().lines.length === 2 && both.every((v) => v === false), [leader.book().lines.length, both]);
    const fromMember = await second.report(ticket("m3x"), { result: "win" });
    await Util.wait(30);
    Report.check("연승: 팀장이 아니면 반영 안 함", fromMember === false && leader.book().lines.length === 2);
    await leader.report(ticket("m3"), { result: "draw" });
    await Util.wait(30);
    Report.check("연승: 비기면 0", leader.book().streak() === 0 && leader.book().streakLabel() === "연승 없음");
    await leader.report(ticket("m4"), { result: "win" });
    await Util.wait(30);
    Report.check("연승: 다시 이기면 1", leader.book().streak() === 1 && leader.book().streakLabel() === "🔥 1연승");
    await leader.leave();
    await Util.wait(40);
    Report.check("팀장 나감: 다음 사람이 팀장", second.isLeader() && !third.isLeader(), second.record && second.record.leaderId);
    Report.check("팀장 나감: 연승 유지", second.book().streak() === 1);
    await second.report(ticket("m5"), { result: "lose", rank: 3, of: 6 });
    await Util.wait(30);
    const book = third.book();
    Report.check("연승: 지면 0", book.streak() === 0);
    Report.check("전적: 순서·합계", book.lines.map((l) => l.n).join() === "1,2,3,4,5" && book.summary() === "5전 3승 1무 1패", [book.lines.map((l) => l.n), book.summary()]);
    Report.check("전적: 순위·상대·맵 기록", book.lines[4].rank === 3 && book.lines[4].of === 6 && book.lines[4].rivals.join() === "상대1,상대2" && book.lines[4].map === "숲");
    await second.report(ticket("m6"), { result: "win" });
    await Util.wait(30);
    world.server.kill(second.myId);
    await Util.wait(80);
    Report.check("팀장 끊김: 남은 사람이 팀장·연승 유지", third.isLeader() && third.book().streak() === 1, [third.record && third.record.leaderId, third.book().streak()]);
    await third.leave();
    await Util.wait(30);
    Report.check("마지막 사람이 나가면 팀 대기실과 전적이 사라짐", world.server.get(world.paths.party(team.code)) === null);
  }

  static async scenarioRematch() {
    const world = new SimWorld(new Mk.MkVersusMatcher(1, SimWorld.TIMING), 3);
    const a = await world.team(1, 1), b = await world.team(1, 1);
    for (let round = 1; round <= 3; round++) {
      await a.queue.enter(a.leader); await b.queue.enter(b.leader);
      await Util.wait(150);
      const ta = a.leader.tickets[round - 1], tb = b.leader.tickets[round - 1];
      if (!ta || !tb) { Report.check("다시 매칭 " + round + "판: 표 받음", false, [a.leader.tickets.length, b.leader.tickets.length]); break; }
      const aWins = ta.side === 0;
      await a.leader.report(ta, { result: aWins ? "win" : "lose" });
      await b.leader.report(tb, { result: aWins ? "lose" : "win" });
      await Util.wait(30);
    }
    const total = a.leader.book().lines.length + b.leader.book().lines.length;
    Report.check("같은 팀으로 다시 매칭: 3판 모두 전적에 남음", a.leader.book().lines.length === 3 && b.leader.book().lines.length === 3, total);
    Report.check("같은 팀으로 다시 매칭: 승패가 서로 반대", a.leader.book().count("win") + b.leader.book().count("win") === 3);
    Report.check("판이 끝나면 표(match)가 지워짐", !a.leader.ticket() && !b.leader.ticket());
    [a, b].forEach((t) => { t.queue.stop(); t.leader.silentClose(); });
  }

  static unitMatcher() {
    const m = new Mk.MkFreeForAllMatcher(3, 6, SimWorld.TIMING);
    const e = (at, size, claim) => ({ leader: "x", people: {}, bots: 0, size, at, claim: claim || null });
    const entries = { a: e(0, 3), b: e(1, 2), c: e(2, 3), d: e(3, 1), late: e(95, 1) };
    const plan = m.plan(entries, 100, () => 0.5);
    Report.check("정원 넘침: 넘치는 항목은 건너뛰고 다음 묶음", plan && plan.groups.map((g) => g.code).join() === "a,b,d", plan && plan.groups.map((g) => g.code));
    Report.check("3초 안 된 항목은 묶지 않음", plan && !plan.groups.some((g) => g.code === "late"));
    Report.check("묶는 사람은 가장 먼저 준비된 항목", m.anchor(entries, 100) === "a");
    const claimed = { a: e(0, 1, { by: "q", at: 90 }), b: e(1, 1) };
    Report.check("차지된 항목은 묶지 않음(혼자 남으면 묶지 않음)", m.plan(claimed, 100, Math.random) === null);
    Report.check("오래된 차지는 풀림", m.plan(claimed, 90 + SimWorld.TIMING.claimExpireMs + 1, Math.random) !== null);
    Report.check("다음 확인 시각 = 다음 준비 시각", m.nextCheck(entries, 100) === 95 + SimWorld.TIMING.settleMs);
    const v = new Mk.MkVersusMatcher(2, SimWorld.TIMING);
    Report.check("1대1: 혼자면 기다림", v.plan({ a: e(0, 2) }, 100, Math.random) === null);
    Report.check("1대1: 팀 정원보다 큰 항목은 무시", v.plan({ a: e(0, 2), b: e(1, 3) }, 100, Math.random) === null);
    Report.check("기록장: 빈 전적", new Mk.MkRecordBook(null).summary() === "0전 0승 0무 0패" && new Mk.MkRecordBook(null).streak() === 0);
  }
}

class SimRunner {
  static async run() {
    Scenarios.unitMatcher();
    await Scenarios.scenarioJoinRules();
    await Scenarios.scenarioStreak();
    await Scenarios.scenarioRematch();
    await Scenarios.scenarioMakerFails();
    await Scenarios.scenarioBinderDies();
    await Scenarios.scenarioCancelWhileClaimed();
    for (let round = 0; round < 4; round++) {
      await Scenarios.scenarioRandom("동시 입장 2대2 #" + round, new Mk.MkVersusMatcher(2, SimWorld.TIMING), 14, 2, { lag: 6, spread: 1, cancelRate: 0, killRate: 0, settle: 900, capacity: 4, versus: true });
    }
    for (let round = 0; round < 3; round++) {
      await Scenarios.scenarioRandom("섞어서 2대2 #" + round, new Mk.MkVersusMatcher(2, SimWorld.TIMING), 30, 2, { lag: 8, spread: 600, cancelRate: 0.15, killRate: 0.08, settle: 1500, capacity: 4, versus: true });
      await Scenarios.scenarioRandom("섞어서 6인 #" + round, new Mk.MkFreeForAllMatcher(3, 6, SimWorld.TIMING), 30, 3, { lag: 8, spread: 600, cancelRate: 0.15, killRate: 0.08, settle: 1500, capacity: 6, versus: false });
    }
    console.log("통과 " + Report.passed + "개, 실패 " + Report.failures.length + "개");
    Report.failures.forEach((f) => console.log("  ✗ " + f));
    process.exit(Report.failures.length ? 1 : 0);
  }
}

SimRunner.run().catch((error) => { console.error(error); process.exit(1); });
