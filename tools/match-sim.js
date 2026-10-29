const fs = require("fs"), vm = require("vm"), path = require("path");

class MatchKitLoader {
  static NAMES = ["MkPaths", "MkMatcher", "MkVersusMatcher", "MkWinBandVersusMatcher", "MkWinBand", "MkRecentMaps", "MkFreeForAllMatcher", "MkRecordBook", "MkPartyDirectory", "MkParty", "MkQueue", "MkBusySign", "MkStreakMath", "MkPersonalStreak"];
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
  echo(client, p, value) {
    const saved = this.tree;
    this.tree = Util.clone(saved) || {};
    this.put(p, value);
    this.writes--;
    const seen = this.listeners.filter((l) => l.client === client && l.on && (p === l.path || p.startsWith(l.path + "/"))).map((l) => [l, this.get(l.path)]);
    this.tree = saved;
    seen.forEach(([l, v]) => l.fn(MockRef.snap(l.path, v)));
  }
  kill(client) {
    this.dead.add(client);
    (this.disconnects.get(client) || new Set()).forEach((p) => this.put(p, null));
    this.disconnects.delete(client);
    this.listeners = this.listeners.filter((l) => l.client !== client);
    this.notify();
  }
  blip(client) {
    (this.disconnects.get(client) || new Set()).forEach((p) => this.put(p, null));
    this.disconnects.delete(client);
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
      if (attempt === 0 && this.server.localEcho) this.server.echo(this.client, this.path, result);
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
    Report.check("연승: 비겨도 끊기지 않음(2연승 유지)", leader.book().streak() === 2 && leader.book().streakLabel() === "🔥 2연승", leader.book().streak());
    await leader.report(ticket("m4"), { result: "win" });
    await Util.wait(30);
    Report.check("연승: 비긴 뒤 이기면 이어서 3연승", leader.book().streak() === 3 && leader.book().streakLabel() === "🔥 3연승", leader.book().streak());
    await leader.leave();
    await Util.wait(40);
    Report.check("팀장 나감: 다음 사람이 팀장", second.isLeader() && !third.isLeader(), second.record && second.record.leaderId);
    Report.check("팀장 나감: 연승 유지", second.book().streak() === 3);
    await second.report(ticket("m5"), { result: "lose", rank: 3, of: 6 });
    await Util.wait(30);
    const book = third.book();
    Report.check("연승: 지면 0", book.streak() === 0);
    const line = (n, result) => ({ n, matchId: "u" + n, at: n, result, rivals: [] });
    Report.check("연승: 무승부만 있으면 연승 없음", new Mk.MkRecordBook({ a: line(1, "draw"), b: line(2, "draw") }).streakLabel() === "연승 없음");
    Report.check("연승: 패 뒤 무승부는 0", new Mk.MkRecordBook({ a: line(1, "win"), b: line(2, "lose"), c: line(3, "draw") }).streak() === 0);
    Report.check("연승: 승·무·승·무 는 2연승", new Mk.MkRecordBook({ a: line(1, "win"), b: line(2, "draw"), c: line(3, "win"), d: line(4, "draw") }).streak() === 2);
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

  static async scenarioCancelThenRematch() {
    const world = new SimWorld(new Mk.MkVersusMatcher(1, SimWorld.TIMING), 3);
    world.server.localEcho = true;
    const a = await world.team(1, 1);
    let errors = 0;
    a.queue.onError = () => errors++;
    await a.queue.enter(a.leader);
    await Util.wait(20);
    const cancelled = await a.queue.cancel(a.leader);
    await Util.wait(20);
    const again = new Mk.MkQueue(world.server.database(a.ids[0]), SimWorld.clock, world.paths, world.matcher, world.maker(a.ids[0]));
    again.onError = () => errors++;
    await again.enter(a.leader);
    await Util.wait(4300);
    Report.check("취소 뒤 다시 매칭: 취소 성공", cancelled === true);
    Report.check("취소 뒤 다시 매칭: 옛 대기열이 새 '찾는 중'을 지우지 않음", !!a.leader.searching() && !!world.queueNow()[a.code] && errors === 0, [a.leader.searching(), errors]);
    const b = await world.team(1, 1);
    await b.queue.enter(b.leader);
    await Util.wait(300);
    Report.check("취소 뒤 다시 매칭: 표는 한 번만", a.leader.tickets.length === 1 && b.leader.tickets.length === 1 && a.leader.tickets[0].room === b.leader.tickets[0].room, [a.leader.tickets.length, b.leader.tickets.length]);
    [a, b].forEach((t) => { t.queue.stop(); t.leader.silentClose(); });
    again.stop();
  }

  static async scenarioWaitingCount() {
    const world = new SimWorld(new Mk.MkVersusMatcher(2, { settleMs: 5000, claimExpireMs: 300 }), 3);
    const a = await world.team(1, 2), b = await world.team(2, 2);
    await a.queue.enter(a.leader);
    await Util.wait(30);
    const alone = a.queue.othersWaiting(a.code);
    await b.queue.enter(b.leader);
    await Util.wait(30);
    const seenByA = a.queue.othersWaiting(a.code), seenByB = b.queue.othersWaiting(b.code);
    a.queue.stop();
    Report.check("대기 팀 수: 혼자면 0팀, 두 명 팀이 와도 1팀, 상대도 1팀", alone === 0 && seenByA === 1 && seenByB === 1, [alone, seenByA, seenByB]);
    Report.check("대기 인원: 찾는 중이 아니면 모름(null)", a.queue.othersWaiting(a.code) === null);
    [a, b].forEach((t) => { t.queue.stop(); t.parties.forEach((p) => p.silentClose()); });
  }

  static async scenarioRecordKeeping() {
    const world = new SimWorld(new Mk.MkVersusMatcher(1, SimWorld.TIMING), 3);
    const solo = await world.team(1, 1);
    const ticket = { matchId: "rk-1", room: "1", side: 0, host: "x", expect: 2, at: Date.now(), rivals: ["표에 적힌 학생"] };
    await solo.leader.report(ticket, { result: "win", rivals: [] });
    await Util.wait(20);
    const line = solo.leader.book().lines[0];
    Report.check("전적: 실제 상대가 AI 면 표의 학생 이름 대신 AI 로 남음", !!line && !(line.rivals && line.rivals.length), line);

    world.server.blip(solo.ids[0]);
    await Util.wait(5);
    const realRandom = Math.random;
    let calls = 0;
    const fixed = (Number(solo.code) - 10000 + 0.5) / 90000;
    Math.random = () => (calls++ < 3 ? fixed : realRandom());
    const other = await new Mk.MkPartyDirectory(world.server.database("intruder"), SimWorld.clock, world.paths, 1).create("intruder", { nick: "다른 학생", joinedAt: Date.now() });
    Math.random = realRandom;
    await Util.wait(40);
    const kept = world.server.get(world.paths.party(solo.code));
    Report.check("전적: 잠깐 끊긴 학생의 대기실을 새 대기실이 덮어쓰지 않음", other !== solo.code && !!kept && !!kept.history && kept.leaderId === solo.ids[0], [other, kept && kept.leaderId]);

    await solo.leader.leave(true);
    const left = world.server.get(world.paths.party(solo.code));
    Report.check("혼자 게임: 나가도 대기실·전적이 남음", !!left && !!left.history && !left.members && !!left.leftAt, left);
    const directory = new Mk.MkPartyDirectory(world.server.database(solo.ids[0]), SimWorld.clock, world.paths, 1);
    await world.server.database(solo.ids[0]).ref(world.paths.party(solo.code) + "/match").set(ticket);
    const back = await directory.reclaim(solo.code, solo.ids[0], { nick: solo.ids[0], joinedAt: Date.now() });
    const after = world.server.get(world.paths.party(solo.code));
    Report.check("혼자 게임: 다시 들어오면 같은 전적을 이어 쓰고 지난 표는 지워짐", back && Object.keys(after.history).length === 1 && !after.match && !!after.members[solo.ids[0]], after);
    const stranger = await new Mk.MkPartyDirectory(world.server.database("p-stranger"), SimWorld.clock, world.paths, 1).reclaim(solo.code, "p-stranger", { nick: "남", joinedAt: Date.now() });
    Report.check("혼자 게임: 누가 들어 있으면 다른 사람이 가져가지 못함", stranger === false);
    const sameNick = await new Mk.MkPartyDirectory(world.server.database("p-twin"), SimWorld.clock, world.paths, 1).reclaim(solo.code, "p-twin", { nick: solo.ids[0], joinedAt: Date.now() }, "p-other");
    Report.check("대기실 돌아가기: 이름이 같아도 직전 아이디가 아니면 남의 자리를 밀어내지 않음", sameNick === false && !!world.server.get(world.paths.party(solo.code)).members[solo.ids[0]]);
    const reloaded = await new Mk.MkPartyDirectory(world.server.database("p-reload"), SimWorld.clock, world.paths, 1).reclaim(solo.code, "p-reload", { nick: solo.ids[0], joinedAt: Date.now() }, solo.ids[0]);
    const afterReload = world.server.get(world.paths.party(solo.code));
    Report.check("대기실 돌아가기: 새로고침(아이디 바뀜, 이 기기의 직전 아이디)이면 예전 자리를 이어받음", reloaded && Object.keys(afterReload.members).join() === "p-reload" && afterReload.leaderId === "p-reload" && Object.keys(afterReload.history).length === 1, afterReload);
    const party = new Mk.MkParty(world.server.database("p-reload"), SimWorld.clock, world.paths, solo.code, "p-reload", 1);
    party.connect();
    await Util.wait(20);
    await party.leave(false);
    Report.check("leave(false): 마지막 사람이 나가면 대기실이 사라짐", world.server.get(world.paths.party(solo.code)) === null);
    solo.queue.stop();
    solo.leader.silentClose();
  }

  static async scenarioBlip() {
    const world = new SimWorld(new Mk.MkVersusMatcher(1, SimWorld.TIMING), 3);
    const solo = await world.team(1, 1), pair = await world.team(2, 2);
    let closed = 0;
    solo.leader.onClosed = () => { closed++; };
    const ticket = { matchId: "b1", room: "10000", side: 0, host: "h", expect: 2, at: Date.now(), rivals: ["상대"] };
    await solo.leader.report(ticket, { result: "win" });
    await Util.wait(30);
    world.server.blip(solo.leader.myId);
    await Util.wait(80);
    Report.check("잠깐 끊김: 혼자 팀 대기실 자리가 되살아남", closed === 0 && !!solo.leader.record && solo.leader.isLeader() && solo.leader.book().streak() === 1, [closed, solo.leader.record]);
    world.server.blip(solo.leader.myId);
    await Util.wait(80);
    Report.check("잠깐 끊김 두 번: 다시 되살아남(onDisconnect 다시 걸림)", closed === 0 && !!(world.server.get(world.paths.party(solo.code)) || {}).members, world.server.get(world.paths.party(solo.code)));
    const [first, second] = pair.parties;
    world.server.blip(second.myId);
    await Util.wait(80);
    Report.check("잠깐 끊김: 둘 팀원 자리가 되살아남", Object.keys(first.record.members).length === 2 && !!second.record, first.record && first.record.members);
    world.server.blip(first.myId);
    await Util.wait(80);
    Report.check("잠깐 끊김: 팀장도 되살아나고 팀장은 한 명", first.isLeader() !== second.isLeader() && Object.keys(second.record.members).length === 2 && Object.keys(first.record.members).length === 2, second.record);
    world.server.put(world.paths.party("99999"), { leaderId: "gone", createdAt: Date.now(), history: { m1: { n: 1 } } });
    world.server.put(world.paths.party("99998"), { leaderId: "gone", createdAt: Date.now() - 4 * 3600000 });
    await world.team(1, 1);
    Report.check("청소: 사람이 잠깐 빠진 대기실은 남기고 오래된 빈 대기실만 지움", !!world.server.get(world.paths.party("99999")) && world.server.get(world.paths.party("99998")) === null);
    await solo.leader.leave();
    await Util.wait(40);
    Report.check("잠깐 끊김 뒤 스스로 나가면 대기실이 사라짐", world.server.get(world.paths.party(solo.code)) === null);
  }

  static async scenarioAiFallback() {
    const world = new SimWorld(new Mk.MkVersusMatcher(2, SimWorld.TIMING), 3);
    const lone = await world.team(2, 2);
    await lone.queue.enter(lone.leader);
    await Util.wait(60);
    const solo = await lone.queue.goSolo(lone.code);
    await Util.wait(80);
    const ticket = lone.parties[0].tickets[0];
    Report.check("AI 대체: 혼자면 우리 팀만 든 방으로 표를 받음", solo && !!ticket && !(ticket.rivals || []).length && ticket.expect === 2 && lone.parties[1].tickets.length === 1, [solo, ticket]);
    Report.check("AI 대체: 대기열에서 빠지고 찾는 중이 풀림", !world.queueNow()[lone.code] && !lone.leader.searching());
    const a = await world.team(1, 2), b = await world.team(1, 2);
    let release;
    world.makerHook = () => new Promise((resolve) => { release = resolve; });
    await a.queue.enter(a.leader); await Util.wait(5); await b.queue.enter(b.leader);
    await Util.wait(150);
    const refused = await b.queue.goSolo(b.code);
    release(true);
    await Util.wait(120);
    Report.check("AI 대체: 사람끼리 묶이는 중이면 하지 않음", refused === false && a.leader.tickets.length === 1 && b.leader.tickets.length === 1 && a.leader.tickets[0].room === b.leader.tickets[0].room, [refused, a.leader.tickets.length, b.leader.tickets.length]);
    [lone, a, b].forEach((t) => { t.queue.stop(); t.parties.forEach((p) => p.silentClose()); });
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
    const teams = new Mk.MkFreeForAllMatcher(2, 6, SimWorld.TIMING, 3);
    const solos = { a: e(0, 1), b: e(1, 1), c: e(2, 1), d: e(3, 1) };
    const teamPlan = teams.plan(solos, 100, () => 0.5);
    Report.check("팀 수 상한: 6자리라도 3팀까지만", teamPlan && teamPlan.groups.map((g) => g.code).join() === "a,b,c", teamPlan && teamPlan.groups.map((g) => g.code));
    Report.check("기록장: 빈 전적", new Mk.MkRecordBook(null).summary() === "0전 0승 0무 0패" && new Mk.MkRecordBook(null).streak() === 0);
    const S = Mk.MkStreakMath;
    let rec = S.EMPTY;
    for (let n = 0; n < 150; n++) rec = S.next(rec, "m" + n, "win");
    Report.check("아이디 연승: 상한 없이 150연승", rec.n === 150 && rec.b === 150 && S.label(rec.n) === "🔥 150연승", rec);
    Report.check("아이디 연승: 같은 판은 두 번 안 셈", S.next(rec, "m149", "win") === null);
    const drew = S.next(rec, "d1", "draw"), lost = S.next(drew, "l1", "lose");
    Report.check("아이디 연승: 비기면 그대로, 지면 0(최고 기록은 남음)", drew.n === 150 && lost.n === 0 && lost.b === 150 && S.label(0) === "연승 없음");
    Report.check("아이디 연승: 저장 값 다듬기", S.normalize({ n: "3", b: 1, id: 5 }).n === 3 && S.normalize({ n: 3, b: 1 }).b === 3 && S.normalize(null).n === 0 && S.key("a.b/c").indexOf(".") < 0);
  }

  static unitRecentMaps() {
    const maps = ["seoul", "singapore", "hongkong"];
    const plan = (seed, ...recents) => ({ seed, groups: recents.map((r, i) => ({ code: "c" + i, side: i, entry: { people: { ["u" + i]: { nick: "u" + i, joinedAt: i, recentMaps: r } } } })) });
    const picks = [0, 1, 2, 3, 4, 5].map((seed) => Mk.MkRecentMaps.pick(maps, plan(seed, ["seoul", "hongkong"], ["singapore"])));
    Report.check("맵 고르기: 두 사람의 바로 전 맵(서울·싱가포르)은 피함", picks.every((m) => m === "hongkong"));
    const one = [0, 1, 2, 3].map((seed) => Mk.MkRecentMaps.pick(maps, plan(seed, ["seoul"], null)));
    Report.check("맵 고르기: 한 사람만 기록 있으면 그 맵만 빼고 고름", one.every((m) => m !== "seoul") && new Set(one).size === 2);
    Report.check("맵 고르기: 기록이 없으면 전체에서 고름", new Set([0, 1, 2].map((seed) => Mk.MkRecentMaps.pick(maps, plan(seed, null, null)))).size === 3);
    Report.check("맵 고르기: 다 빠지면 전체에서", maps.indexOf(Mk.MkRecentMaps.pick(["seoul"], plan(7, ["seoul"]))) === 0);
    Report.check("맵 기록: 앞에 넣고 2개까지, 겹치면 앞으로", JSON.stringify(Mk.MkRecentMaps.noted(["a", "b"], "b")) === JSON.stringify(["b", "a"]) && JSON.stringify(Mk.MkRecentMaps.noted(["a", "b"], "c")) === JSON.stringify(["c", "a"]) && Mk.MkRecentMaps.clean("x") === null);
  }

  static unitWinBand() {
    const m = new Mk.MkWinBandVersusMatcher(1, SimWorld.TIMING);
    const e = (at, g, w) => ({ leader: "x", people: { ["u" + at]: Object.assign({ nick: "u" + at, joinedAt: at }, g === null ? {} : { rate: { g, w } }) }, bots: 0, size: 1, at, claim: null });
    const codes = (plan) => plan ? plan.groups.map((g) => g.code).sort().join() : null;
    Report.check("승률 구간: 35% 미만 + 65% 이상은 묶지 않음", m.plan({ low: e(0, 10, 2), high: e(1, 10, 8) }, 100, Math.random) === null);
    Report.check("승률 구간: 35% 미만은 50% 미만과 묶음", codes(m.plan({ low: e(0, 10, 2), mid: e(1, 10, 4) }, 100, Math.random)) === "low,mid");
    Report.check("승률 구간: 35% 미만은 50%와 안 묶음", m.plan({ low: e(0, 10, 2), half: e(1, 10, 5) }, 100, Math.random) === null);
    Report.check("승률 구간: 65% 이상은 50% 이상과 묶음", codes(m.plan({ high: e(0, 10, 7), half: e(1, 10, 5) }, 100, Math.random)) === "half,high");
    Report.check("승률 구간: 65% 이상은 50% 미만과 안 묶음", m.plan({ high: e(0, 10, 7), mid: e(1, 10, 4) }, 100, Math.random) === null);
    Report.check("승률 구간 경계: 34%·65% 는 구간 안(35%·65% 기준)", m.plan({ low: e(0, 100, 34), mid: e(1, 10, 5) }, 100, Math.random) === null && m.plan({ high: e(0, 20, 13), mid: e(1, 10, 4) }, 100, Math.random) === null);
    Report.check("승률 구간 경계: 35%·64% 는 중간이라 누구와도", codes(m.plan({ a: e(0, 20, 7), b: e(1, 10, 6) }, 100, Math.random)) === "a,b" && codes(m.plan({ a: e(0, 100, 64), b: e(1, 10, 4) }, 100, Math.random)) === "a,b");
    Report.check("승률 구간: 중간(35~65%)끼리는 자유", codes(m.plan({ a: e(0, 10, 4), b: e(1, 10, 6) }, 100, Math.random)) === "a,b");
    Report.check("승률 구간: 판 수가 적거나 기록 없으면 누구와도", codes(m.plan({ low: e(0, 4, 0), high: e(1, 10, 9) }, 100, Math.random)) === "high,low" && codes(m.plan({ none: e(0, null), high: e(1, 10, 9) }, 100, Math.random)) === "high,none");
    const stuck = { low: e(0, 10, 1), high: e(1, 10, 9), half: e(2, 10, 5) };
    Report.check("승률 구간: 맨 앞 학생이 맞는 상대가 없어도 다른 학생끼리는 묶임", m.anchor(stuck, 100) === "high" && codes(m.plan(stuck, 100, Math.random)) === "half,high");
    Report.check("승률 구간: 맞는 상대만 '함께 기다리는 학생'으로 봄(AI 대체를 막지 않음)", !m.hasCompany({ low: e(0, 10, 1), high: e(1, 10, 9) }, 100, "low") && m.hasCompany(stuck, 100, "half"));
    Report.check("승률 구간: 기본 매처는 누구와도 만남", new Mk.MkVersusMatcher(1, SimWorld.TIMING).canMeet(e(0, 10, 1), e(1, 10, 9)) === true);
    Report.check("승률 값 다듬기", JSON.stringify(Mk.MkWinBand.clean({ g: "7", w: 9 })) === JSON.stringify({ g: 7, w: 7 }) && Mk.MkWinBand.clean(null) === null);
  }

  static async scenarioWinBand() {
    const world = new SimWorld(new Mk.MkWinBandVersusMatcher(1, SimWorld.TIMING), 3);
    const low = await world.team(1, 1), high = await world.team(1, 1), half = await world.team(1, 1);
    await low.queue.enter(low.leader, { nick: "low", joinedAt: 0, rate: { g: 10, w: 1 } });
    await Util.wait(5);
    await high.queue.enter(high.leader, { nick: "high", joinedAt: 0, rate: { g: 10, w: 9 } });
    await Util.wait(150);
    Report.check("승률 구간(대기열): 맞지 않는 둘은 계속 기다림", !low.leader.tickets.length && !high.leader.tickets.length && low.queue.othersWaiting(low.code) === 0);
    await half.queue.enter(half.leader, { nick: "half", joinedAt: 0, rate: { g: 10, w: 5 } });
    await Util.wait(200);
    Report.check("승률 구간(대기열): 맞는 학생이 오면 그 둘이 묶이고 30% 미만은 남음", high.leader.tickets.length === 1 && half.leader.tickets.length === 1 && !low.leader.tickets.length && !!world.queueNow()[low.code], [low.leader.tickets.length, high.leader.tickets.length, half.leader.tickets.length]);
    const entry = world.server.get(world.paths.entry(low.code));
    Report.check("승률 구간(대기열): 항목에 승패가 실림", entry && entry.people[low.ids[0]].rate && entry.people[low.ids[0]].rate.g === 10);
    [low, high, half].forEach((t) => { t.queue.stop(); t.leader.silentClose(); });
  }

  static unitRotation() {
    const timing = { settleMs: 40, claimExpireMs: 300, rematchWaitMs: 400, busyMs: 2000, returnGraceMs: 300 };
    const v = new Mk.MkVersusMatcher(1, timing);
    const e = (at, extra) => Object.assign({ leader: "x", people: {}, bots: 0, size: 1, at, claim: null }, extra || {});
    const sign = (until) => ({ leader: "y", people: {}, bots: 0, size: 0, at: 0, claim: null, busyUntil: until });
    const codes = (plan) => plan ? plan.groups.map((g) => g.code).sort().join() : null;
    Report.check("재대결 피하기: 바로 전 상대 대신 다른 팀과 묶음", codes(v.plan({ a: e(0, { avoid: ["b"] }), b: e(1, { avoid: ["a"] }), c: e(2) }, 100, () => 0.5)) === "a,c");
    Report.check("재대결 피하기: 상대 쪽 기록만 있어도 피함", codes(v.plan({ a: e(0), b: e(1, { avoid: ["a"] }), c: e(2) }, 100, () => 0.5)) === "a,c");
    const rivals = { a: e(0, { avoid: ["b"] }), b: e(1, { avoid: ["a"] }), c: sign(5000) };
    Report.check("재대결: 경기 중인 팀이 있으면 잠깐 기다림", v.plan(rivals, 100, () => 0.5) === null);
    Report.check("재대결: 기다릴 시간이 지나면 다시 붙임", codes(v.plan(rivals, 40 + 400 + 1, () => 0.5)) === "a,b");
    Report.check("재대결: 경기 중인 팀이 없으면 바로 다시 붙임", codes(v.plan({ a: rivals.a, b: rivals.b }, 100, () => 0.5)) === "a,b");
    Report.check("재대결: 오래된 표지판은 무시", codes(v.plan({ a: rivals.a, b: rivals.b, c: sign(90) }, 100, () => 0.5)) === "a,b");
    Report.check("표지판은 묶이지 않음", v.plan({ a: e(0), c: sign(5000) }, 100, () => 0.5) === null && v.anchor({ c: sign(5000) }, 100) === null);
    Report.check("다음 확인 시각: 재대결 대기 끝·표지판 끝", v.nextCheck(rivals, 100) === 40 + 400 + 1 && v.nextCheck({ c: sign(250) }, 100) === 251, [v.nextCheck(rivals, 100), v.nextCheck({ c: sign(250) }, 100)]);
    const owed = { a: e(0), b: e(1), c: e(5, { owed: true }) };
    Report.check("AI 차례 돌리기: 지난 판 AI 와 한 팀이 먼저 묶임", v.anchor(owed, 100) === "c" && codes(v.plan(owed, 100, () => 0.5)) === "a,c");
    Report.check("AI 대체 미루기: 다른 팀이 대기열에 있으면 동행 있음", v.hasCompany(rivals, 100, "a") && !v.hasCompany({ a: rivals.a, c: sign(5000) }, 100, "a"));
    const owedSign = Object.assign(sign(5000), { owed: true });
    Report.check("AI 차례 돌리기: AI 판 팀이 곧 오면 남은 두 팀은 잠깐 기다림", v.plan({ a: e(0), b: e(1), c: owedSign }, 100, () => 0.5) === null && codes(v.plan({ a: e(0), b: e(1), c: owedSign }, 40 + 400 + 1, () => 0.5)) === "a,b");
    Report.check("AI 차례 돌리기: 네 팀이면 먼저 두 팀은 바로 묶음", codes(v.plan({ a: e(0), b: e(1), c: e(2), d: e(3), x: owedSign }, 100, () => 0.5)) === "a,b");
    Report.check("AI 차례 돌리기: 막 들어온 AI 판 팀도 곧 올 팀으로 셈", v.plan({ a: e(0), b: e(1), c: e(90, { owed: true }) }, 100, () => 0.5) === null);
  }

  // 1인 팀 3개가 여러 판 계속 매칭할 때: 바로 전 상대와 연달아 붙지 않고, AI 와 하는 판이 한 팀에 연달아 몰리지 않는가.
  // 게임 흐름(MkRandomFlow)을 줄여 흉내 낸다: 표를 받으면 경기 중 표지판 → 경기 → 결과 → 돌아옴 표지판 → 다시 매칭.
  static async scenarioRotation(teamCount, rounds) {
    const timing = { settleMs: 40, claimExpireMs: 300, rematchWaitMs: 450, busyMs: 3000, returnGraceMs: 400 };
    const world = new SimWorld(new Mk.MkVersusMatcher(1, timing), 3);
    const teams = [];
    for (let i = 0; i < teamCount; i++) teams.push(await world.team(1, 1));
    const codeOfNick = new Map(teams.map((t) => [t.ids[0], t.code]));
    const FALLBACK = 250, PLAY = 300;
    const runTeam = async (team) => {
      const sign = new Mk.MkBusySign(world.server.database(team.ids[0]), SimWorld.clock, world.paths);
      team.opponents = [];
      for (let round = 0; round < rounds; round++) {
        const before = team.leader.tickets.length;
        await Util.wait(Math.floor(Math.random() * 30));
        await team.queue.enter(team.leader);
        const since = Date.now();
        let triedSolo = false;
        while (team.leader.tickets.length === before) {
          await Util.wait(10);
          const waited = Date.now() - since;
          if (!triedSolo && waited >= FALLBACK && !(team.queue.hasCompany(team.code) && waited < FALLBACK + timing.rematchWaitMs + 150)) { triedSolo = true; await team.queue.goSolo(team.code); }
          if (waited > 6000) throw new Error("표를 못 받음 " + team.code);
        }
        const ticket = team.leader.tickets[before];
        team.opponents.push((ticket.rivals || []).length ? codeOfNick.get(ticket.rivals[0]) : "AI");
        await sign.put(team.leader, timing.busyMs, !(ticket.rivals || []).length);
        await Util.wait(PLAY);
        await team.leader.report(ticket, { result: "win" });
        await sign.put(team.leader, timing.returnGraceMs, !!team.leader.lastMatch().ai);
      }
      team.queue.stop();
    };
    await Promise.all(teams.map(runTeam));
    const label = "팀 " + teamCount + "개 " + rounds + "판";
    const repeats = teams.map((t) => t.opponents.filter((o, i) => i > 0 && o !== "AI" && o === t.opponents[i - 1]).length);
    const aiTwice = teams.map((t) => t.opponents.filter((o, i) => i > 0 && o === "AI" && t.opponents[i - 1] === "AI").length);
    console.log("  " + label + ": " + teams.map((t) => t.code.slice(-2) + "[" + t.opponents.map((o) => o === "AI" ? "AI" : o.slice(-2)).join(" ") + "]").join(" "));
    Report.check(label + ": 바로 전 상대와 연달아 붙지 않음", repeats.every((n) => n === 0), repeats);
    Report.check(label + ": AI 와 하는 판이 한 팀에 연달아 몰리지 않음", aiTwice.every((n) => n === 0), aiTwice);
    if (teamCount % 2 === 1) {
      const aiTeams = teams.filter((t) => t.opponents.indexOf("AI") >= 0).length;
      Report.check(label + ": AI 와 하는 차례가 여러 팀에 돌아감", aiTeams >= 2, teams.map((t) => t.opponents));
    }
    teams.forEach((t) => t.parties.forEach((p) => p.silentClose()));
  }
}

class SimRunner {
  static async run() {
    Scenarios.unitMatcher();
    Scenarios.unitRotation();
    Scenarios.unitWinBand();
    Scenarios.unitRecentMaps();
    await Scenarios.scenarioWinBand();
    await Scenarios.scenarioJoinRules();
    await Scenarios.scenarioStreak();
    await Scenarios.scenarioRematch();
    await Scenarios.scenarioMakerFails();
    await Scenarios.scenarioBinderDies();
    await Scenarios.scenarioCancelWhileClaimed();
    await Scenarios.scenarioAiFallback();
    await Scenarios.scenarioBlip();
    await Scenarios.scenarioCancelThenRematch();
    await Scenarios.scenarioWaitingCount();
    await Scenarios.scenarioRecordKeeping();
    for (let round = 0; round < 4; round++) {
      await Scenarios.scenarioRandom("동시 입장 2대2 #" + round, new Mk.MkVersusMatcher(2, SimWorld.TIMING), 14, 2, { lag: 6, spread: 1, cancelRate: 0, killRate: 0, settle: 900, capacity: 4, versus: true });
    }
    for (let round = 0; round < 3; round++) {
      await Scenarios.scenarioRandom("섞어서 2대2 #" + round, new Mk.MkVersusMatcher(2, SimWorld.TIMING), 30, 2, { lag: 8, spread: 600, cancelRate: 0.15, killRate: 0.08, settle: 1500, capacity: 4, versus: true });
      await Scenarios.scenarioRandom("섞어서 6인 #" + round, new Mk.MkFreeForAllMatcher(3, 6, SimWorld.TIMING), 30, 3, { lag: 8, spread: 600, cancelRate: 0.15, killRate: 0.08, settle: 1500, capacity: 6, versus: false });
    }
    await Scenarios.scenarioRotation(3, 6);
    await Scenarios.scenarioRotation(4, 5);
    await Scenarios.scenarioRotation(5, 5);
    console.log("통과 " + Report.passed + "개, 실패 " + Report.failures.length + "개");
    Report.failures.forEach((f) => console.log("  ✗ " + f));
    process.exit(Report.failures.length ? 1 : 0);
  }
}

SimRunner.run().catch((error) => { console.error(error); process.exit(1); });
