// 31번 좀비 아웃브레이크 일반 방 시뮬레이션(2026-11-16): 가짜 서버(지연·끊김 자동 삭제·트랜잭션) 위에서
// 게임 코드의 입장·시작·감염·재접속 순서를 그대로 옮겨 수천 판 돌리고, 6명 이상 입장과 학생마다 다른 좀비 판정을 센다.
// 사용: node tools/zombie-room-sim.js            (옛 방식 old 와 고친 방식 new 를 나란히)
//       node tools/zombie-room-sim.js 5000        (판 수)
"use strict";

class SimRandom {
  constructor(seed) { this.s = seed >>> 0 || 1; }
  next() { this.s = (this.s * 1664525 + 1013904223) >>> 0; return this.s / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
}

class SimTree {
  static clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
  static parts(path) { return String(path).split("/").filter(Boolean); }
  static get(root, path) {
    let n = root;
    for (const k of SimTree.parts(path)) { if (n == null || typeof n !== "object") return null; n = n[k]; }
    return n === undefined ? null : n;
  }
  static set(root, path, value) {
    const ks = SimTree.parts(path); let n = root;
    for (let i = 0; i < ks.length - 1; i++) { if (n[ks[i]] == null || typeof n[ks[i]] !== "object") n[ks[i]] = {}; n = n[ks[i]]; }
    if (value == null) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = SimTree.clone(value);
    SimTree.prune(root);
  }
  static prune(o) {
    if (o && typeof o === "object") { for (const k of Object.keys(o)) { o[k] = SimTree.prune(o[k]); if (o[k] == null) delete o[k]; } return Object.keys(o).length ? o : null; }
    return o;
  }
}

class SimClock {
  constructor() { this.now = 0; this.queue = []; this.seq = 0; }
  at(t, fn) { this.queue.push({ t: Math.max(t, this.now), n: this.seq++, fn }); }
  static flush() { return new Promise(r => setImmediate(r)); }
  after(ms, fn) { this.at(this.now + ms, fn); }
  async run(until) {
    while (this.queue.length) {
      this.queue.sort((a, b) => a.t - b.t || a.n - b.n);
      if (this.queue[0].t > until) break;
      const e = this.queue.shift(); this.now = e.t; e.fn(); await SimClock.flush();
    }
    this.now = Math.max(this.now, until);
  }
}

class SimServer {
  constructor(clock) { this.clock = clock; this.tree = {}; this.clients = []; this.onDisconnect = new Map(); }
  attach(c) { this.clients.push(c); }
  apply(op) {
    if (op.kind === "set") SimTree.set(this.tree, op.path, op.value);
    else if (op.kind === "update") for (const k of Object.keys(op.value)) SimTree.set(this.tree, op.path + "/" + k, op.value[k]);
    else if (op.kind === "tx") {
      const next = op.fn(SimTree.clone(SimTree.get(this.tree, op.path)));
      if (next === undefined) return { committed: false, value: SimTree.get(this.tree, op.path) };
      SimTree.set(this.tree, op.path, next);
    }
    this.broadcast();
    return { committed: true, value: SimTree.clone(SimTree.get(this.tree, op.path)) };
  }
  broadcast() { const snap = SimTree.clone(this.tree); for (const c of this.clients) c.deliver(snap); }
  read(path) { return SimTree.clone(SimTree.get(this.tree, path)); }
  dropped(c) { const paths = this.onDisconnect.get(c.id) || []; this.onDisconnect.delete(c.id); paths.forEach(p => SimTree.set(this.tree, p, null)); if (paths.length) this.broadcast(); }
}

class SimClient {
  constructor(sim, id, nick) {
    this.sim = sim; this.id = id; this.nick = nick; this.server = sim.server; this.clock = sim.clock; this.rnd = sim.rnd;
    this.serverView = {}; this.pending = []; this.online = true; this.outbox = []; this.lastArrive = 0; this.lastSend = 0;
    this.inRoom = false; this.leaving = false; this.myInfectedAt = 0; this.roundKey = 0; this.reported = new Set(); this.saved = null;
    this.server.attach(this);
  }
  lag() { return this.rnd.range(40, 350); }
  get room() { return this.view("room") || {}; }
  view(path) { const t = SimTree.clone(this.serverView) || {}; for (const op of this.pending) SimServer.prototype.apply.call({ tree: t, broadcast() {} }, op.kind === "tx" ? { kind: "noop" } : op); return SimTree.get(t, path); }
  players() { return this.room.players || {}; }
  deliver(snap) {
    if (!this.online) return;
    const t = Math.max(this.clock.now + this.lag(), this.lastArrive); this.lastArrive = t;
    this.clock.at(t, () => { if (this.online) this.receive(snap); });
  }
  receive(snap) {
    const before = this.view("room/players/" + this.id);
    this.serverView = snap;
    const after = this.view("room/players/" + this.id);
    if (after) this.saved = after;
    if (this.inRoom && before && !after && !this.leaving) this.sim.mode.recover(this, before);
  }
  send(op) {
    return new Promise(resolve => {
      op.done = resolve;
      if (op.kind !== "tx") this.pending.push(op);
      if (this.online) this.transmit(op); else this.outbox.push(op);
    });
  }
  transmit(op) {
    const t = Math.max(this.clock.now + this.lag(), this.lastSend); this.lastSend = t;
    this.clock.at(t, () => {
      const res = this.server.apply(op);
      this.clock.after(this.lag(), () => { this.pending = this.pending.filter(p => p !== op); op.done(res); });
    });
  }
  read(path) { return new Promise(resolve => this.clock.after(this.lag() * 2, () => resolve(this.server.read(path)))); }
  set(path, value) { return this.send({ kind: "set", path, value }); }
  update(path, value) { return this.send({ kind: "update", path, value }); }
  tx(path, fn) { return this.send({ kind: "tx", path, fn }); }
  armDisconnect() { this.server.onDisconnect.set(this.id, ["room/players/" + this.id, "room/st/" + this.id]); }
  goOffline(ms) {
    if (!this.online) return;
    this.online = false;
    this.clock.after(this.rnd.range(50, 600), () => this.server.dropped(this));
    this.clock.after(ms, () => {
      this.online = true; const q = this.outbox; this.outbox = []; q.forEach(op => this.transmit(op));
      if (this.inRoom) this.armDisconnect();
      this.deliver(this.server.read(""));
    });
  }
  isZombieNow(id) { return this.sim.mode.isZombie(this, id); }
  roundIds() { const ps = this.players(); return Object.keys(ps).filter(id => ps[id] && ps[id].inRound); }
  picture() { return this.roundIds().sort().map(id => id + (this.isZombieNow(id) ? ":Z" : ":H")).join(" "); }
}

class OldRoomMode {
  static NAME = "old";
  static MAX = 5;
  static participants(ps) { return Object.keys(ps).filter(id => ps[id] && !ps[id].spec && !ps[id].bot && ps[id].nickname); }
  newPlayer(c, t, spec) { return { nickname: c.nick, joinedAt: t, role: "human", infected: false, inRound: false, spec: !!spec }; }
  async join(c) {
    const r = await c.read("room");
    if (!r || !r.players) return false;
    const ps = r.players, players = OldRoomMode.participants(ps).length;
    const asSpec = r.status !== "lobby" || players >= OldRoomMode.MAX;
    await c.set("room/players/" + c.id, this.newPlayer(c, c.clock.now, asSpec));
    c.inRoom = true; c.armDisconnect(); return true;
  }
  beginRound(host) {
    const ps = host.players(), parts = OldRoomMode.participants(ps).sort((a, b) => ps[a].joinedAt - ps[b].joinedAt);
    const zombieId = parts[Math.floor(host.rnd.next() * parts.length)], startAt = host.clock.now + 3000, u = { status: "playing", startAt, originZombieId: zombieId, zombieIds: { [zombieId]: startAt } };
    Object.keys(ps).forEach(id => { const inRound = parts.includes(id); u["players/" + id + "/inRound"] = inRound; u["players/" + id + "/role"] = id === zombieId ? "zombie" : "human"; u["players/" + id + "/infected"] = false; u["players/" + id + "/infectedAt"] = null; });
    host.update("room", u);
    return parts.length;
  }
  async recover(c, before) {
    const status = await c.read("room/status");
    if (status == null) return;
    await c.set("room/players/" + c.id, before);
    c.armDisconnect();
  }
  async rejoin(c, record) {
    const ps = await c.read("room/players");
    if (ps && !ps[c.id]) await c.set("room/players/" + c.id, record);
    c.inRoom = true; c.leaving = false; c.armDisconnect();
  }
  selfInfect(c, t) {
    c.myInfectedAt = t;
    c.update("room", { ["players/" + c.id + "/infected"]: true, ["players/" + c.id + "/infectedAt"]: t, ["players/" + c.id + "/role"]: "zombie", ["zombieIds/" + c.id]: t });
  }
  report(z, victim, t) {
    if (z.reported.has(victim)) return;
    z.reported.add(victim);
    z.tx("room/players/" + victim, cur => (!cur || cur.infected || cur.role === "zombie") ? undefined : Object.assign(cur, { infected: true, infectedAt: t, role: "zombie" }))
      .then(res => { if (res.committed) z.set("room/zombieIds/" + victim, t); else z.reported.delete(victim); });
  }
  adopt(c) { const mine = c.players()[c.id]; if (mine && mine.infected && !c.myInfectedAt) c.myInfectedAt = mine.infectedAt || 1; }
  isZombie(c, id) { const p = c.players()[id]; return (id === c.id && !!c.myInfectedAt) || !!(p && p.role === "zombie"); }
}

class NewRoomMode extends OldRoomMode {
  static NAME = "new";
  static seatFor(ps, record, status) {
    const others = Object.assign({}, ps); delete others[record.id];
    const full = OldRoomMode.participants(others).length >= OldRoomMode.MAX;
    return status === "lobby" ? (record.spec || full) : true;
  }
  async join(c) {
    const status = await c.read("room/status");
    if (status == null) return false;
    const res = await c.tx("room/players", cur => {
      if (!cur) return cur;
      cur[c.id] = this.newPlayer(c, c.clock.now, status !== "lobby" || OldRoomMode.participants(cur).length >= OldRoomMode.MAX);
      return cur;
    });
    if (!res.value || !res.value[c.id]) return false;
    c.inRoom = true; c.armDisconnect(); return true;
  }
  beginRound(host) {
    const ps = host.players(), parts = OldRoomMode.participants(ps).sort((a, b) => ps[a].joinedAt - ps[b].joinedAt);
    const extra = parts.slice(OldRoomMode.MAX);
    const n = super.beginRound({ players: () => { const q = SimTree.clone(ps); extra.forEach(id => { q[id].spec = true; }); return q; }, rnd: host.rnd, clock: host.clock, update: (p, u) => {
      extra.forEach(id => { u["players/" + id + "/spec"] = true; });
      Object.keys(u).forEach(k => { const m = k.match(/^players\/(.+)\/inRound$/); if (m && u[k]) u["players/" + m[1] + "/roundAt"] = u.startAt; });
      host.update(p, u);
    } });
    return n;
  }
  ledger(c) { const r = c.room, z = r.zombieIds || {}; return id => !!z[id] && z[id] >= (r.startAt || 0); }
  adoptRecord(c, record, players) {
    const r = c.room, out = Object.assign({}, record);
    if (out.roundAt !== r.startAt) { out.inRound = false; out.role = "human"; out.infected = false; }
    if (this.ledger(c)(c.id)) { out.role = "zombie"; out.infected = true; }
    if (r.status === "lobby") out.spec = NewRoomMode.seatFor(players || {}, Object.assign({ id: c.id }, out), "lobby");
    return out;
  }
  async recover(c, before) {
    const status = await c.read("room/status");
    if (status == null) return;
    await c.tx("room/players", cur => { if (!cur) return cur; if (!cur[c.id]) cur[c.id] = this.adoptRecord(c, before, cur); return cur; });
    c.armDisconnect();
  }
  async rejoin(c, record) {
    await c.read("room");
    c.serverView = c.server.read("");
    await c.tx("room/players", cur => { if (!cur) return cur; if (!cur[c.id]) cur[c.id] = this.adoptRecord(c, record, cur); return cur; });
    c.inRoom = true; c.leaving = false; c.armDisconnect();
  }
  selfInfect(c, t) {
    c.myInfectedAt = t;
    c.set("room/zombieIds/" + c.id, t);
    c.tx("room/players/" + c.id, cur => cur ? Object.assign(cur, { infected: true, infectedAt: t, role: "zombie" }) : undefined);
  }
  adopt(c) { if (!c.myInfectedAt && this.ledger(c)(c.id)) c.myInfectedAt = 1; super.adopt(c); }
  isZombie(c, id) { return this.ledger(c)(id) || super.isZombie(c, id); }
}

class RoomSimulation {
  constructor(mode, seed) {
    this.mode = mode; this.rnd = new SimRandom(seed); this.clock = new SimClock(); this.server = new SimServer(this.clock); this.clients = [];
  }
  client(i) { const c = new SimClient(this, "p" + i, "학생" + i); this.clients.push(c); return c; }
  hostCreates(c) { c.server.tree = { room: { status: "lobby", players: { [c.id]: this.mode.newPlayer(c, 0, false) } } }; c.inRoom = true; c.armDisconnect(); c.serverView = SimTree.clone(c.server.tree); }
  async settle() { this.clients.forEach(c => { if (!c.online) { c.online = true; } c.deliver(this.server.read("")); }); await this.clock.run(this.clock.now + 5000); }
  inGame() { const ps = this.server.read("room/players") || {}; return Object.keys(ps).filter(id => ps[id].inRound).length; }

  async joinRush() {
    const host = this.client(0); this.hostCreates(host);
    const already = this.rnd.int(0, 3), rush = this.rnd.int(2, 5);
    for (let i = 1; i <= already; i++) { const c = this.client(i); this.clock.at(i * 3000, () => this.mode.join(c)); }
    const t0 = already * 3000 + 4000;
    for (let i = 0; i < rush; i++) { const c = this.client(already + 1 + i); this.clock.at(t0 + this.rnd.range(0, 1500), () => this.mode.join(c)); }
    await this.clock.run(t0 + 6000);
    this.mode.beginRound(host); await this.clock.run(this.clock.now + 3000);
    return this.inGame();
  }

  async reloadAcrossRounds() {
    const host = this.client(0); this.hostCreates(host);
    const cs = [host]; for (let i = 1; i < 5; i++) { const c = this.client(i); cs.push(c); this.clock.at(i * 500, () => this.mode.join(c)); }
    await this.clock.run(4000); this.mode.beginRound(host); await this.clock.run(this.clock.now + 4000);
    const leaver = cs[this.rnd.int(1, 4)], saved = leaver.saved;
    leaver.leaving = true; leaver.inRoom = false; leaver.set("room/players/" + leaver.id, null);
    await this.clock.run(this.clock.now + 2000);
    host.update("room", { status: "lobby" }); await this.clock.run(this.clock.now + 2000);
    const newcomer = this.client(9); this.mode.join(newcomer); await this.clock.run(this.clock.now + 3000);
    this.mode.beginRound(host); await this.clock.run(this.clock.now + 3000);
    this.mode.rejoin(leaver, saved); await this.clock.run(this.clock.now + 4000);
    return this.inGame();
  }

  async flakyRound() {
    const host = this.client(0); this.hostCreates(host);
    for (let i = 1; i < 5; i++) { const c = this.client(i); this.clock.at(i * 400, () => this.mode.join(c)); }
    await this.clock.run(4000);
    this.mode.beginRound(host); await this.clock.run(this.clock.now + 3500);
    this.clients.forEach(c => { const p = c.players()[c.id]; if (p && p.inRound) c.saved = Object.assign({}, p, { roundAt: c.room.startAt }); });
    this.server.tree.room.players && Object.keys(this.server.tree.room.players).forEach(id => { this.server.tree.room.players[id].roundAt = this.server.tree.room.startAt; });
    this.server.broadcast(); await this.clock.run(this.clock.now + 1000);
    const start = this.clock.now, end = start + 20000;
    for (let k = 0; k < 14; k++) {
      this.clock.at(start + this.rnd.range(0, 18000), () => {
        const c = this.clients[this.rnd.int(0, this.clients.length - 1)];
        if (this.rnd.chance(0.35)) { c.goOffline(this.rnd.range(800, 6000)); return; }
        const zombies = this.clients.filter(z => z.isZombieNow(z.id) && z.online);
        const humans = this.clients.filter(h => !h.isZombieNow(h.id));
        if (!zombies.length || !humans.length) return;
        const z = zombies[this.rnd.int(0, zombies.length - 1)], h = humans[this.rnd.int(0, humans.length - 1)];
        if (this.rnd.chance(0.5)) this.mode.selfInfect(h, this.clock.now); else this.mode.report(z, h.id, this.clock.now);
      });
    }
    for (let t = start; t < end; t += 250) this.clock.at(t, () => this.clients.forEach(c => this.mode.adopt(c)));
    await this.clock.run(end);
    await this.settle(); this.clients.forEach(c => this.mode.adopt(c));
    const pictures = this.clients.map(c => c.picture());
    const ps = this.server.read("room/players") || {};
    const partial = Object.keys(ps).filter(id => !ps[id].nickname).length;
    const missing = this.clients.filter(c => !ps[c.id]).length;
    return { split: new Set(pictures).size > 1, partial, missing, pictures };
  }
}

class SimReport {
  static async run(trials) {
    const modes = [new OldRoomMode(), new NewRoomMode()];
    console.log("31번 좀비 일반 방 시뮬레이션 — 판 수 " + trials + "\n");
    for (const mode of modes) {
      let over = 0, maxIn = 0, reloadOver = 0, split = 0, partial = 0, sample = null;
      for (let i = 0; i < trials; i++) {
        const n = await new RoomSimulation(mode, 1000 + i).joinRush(); if (n > 5) over++; maxIn = Math.max(maxIn, n);
        if (await new RoomSimulation(mode, 5000 + i).reloadAcrossRounds() > 5) reloadOver++;
        const f = await new RoomSimulation(mode, 9000 + i).flakyRound(); if (f.split) { split++; if (!sample) sample = f.pictures; } if (f.partial) partial++;
      }
      const pct = k => (k / trials * 100).toFixed(1) + "%";
      console.log("[" + mode.constructor.NAME + "]");
      console.log("  ① 여러 명 동시 입장 → 경기 6명 이상: " + over + "판 (" + pct(over) + "), 가장 많을 때 " + maxIn + "명");
      console.log("  ② 지난 판 학생이 새로고침으로 돌아옴 → 경기 6명 이상: " + reloadOver + "판 (" + pct(reloadOver) + ")");
      console.log("  ③ 경기 중 끊김·감염 → 학생마다 좀비 판정이 다름: " + split + "판 (" + pct(split) + "), 이름 없는 반쪽 자리: " + partial + "판");
      if (sample) console.log("     예) 학생별 화면: " + sample.map((p, i) => "학생" + i + "[" + p + "]").join("  "));
      console.log("");
    }
  }
}

SimReport.run(+(process.argv[2] || 2000));
