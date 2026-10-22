// 랜덤 매칭 결과 검사(브라우저용). tools/match-result-check.js 가 만든 .claude/mk-check-*.html 사본에 들어간다.
// 가짜 Firebase(tools/fbmock.js) 위에서 실제 게임 화면으로 랜덤 매칭 대기실을 만들고, 가짜 상대를 대기열에 넣어
// 진짜로 묶이게 한 뒤, 게임이 시작되면 승·무·패 끝 상태를 방에 써서 게임 코드가 남긴 전적·연승을 확인한다.
// 사용: window.__mkCheck.run(["win","draw","win","lose"]) → window.__mkCheck.log 에 판마다 결과가 쌓인다.

class MkCheckDb {
  static tree() { return window.__fbTree() || {}; }
  static at(path) {
    let node = MkCheckDb.tree();
    for (const part of path.split("/").filter(Boolean)) { if (!node || typeof node !== "object") return null; node = node[part]; }
    return node === undefined ? null : node;
  }
  static ref(path) { return firebase.database().ref(path); }
  static findRoom(code) {
    const found = [];
    const walk = (node, path, depth) => {
      if (!node || typeof node !== "object" || depth > 3) return;
      Object.keys(node).forEach((key) => {
        const child = node[key], next = path ? path + "/" + key : key;
        if (key === code && child && typeof child === "object" && ("status" in child || "players" in child) && !next.includes("parties")) found.push(next);
        else walk(child, next, depth + 1);
      });
    };
    walk(MkCheckDb.tree(), "", 0);
    return found[0] || null;
  }
}

class MkCheckGame {
  constructor(root, openButton) { this.root = root; this.openButton = openButton; this.enterButton = ""; this.startWaitMs = 40000; this.joinAfterStart = false; this.leaveId = "btnGameLeave"; this.doubleTap = false; this.lateTimeoutMs = 30000; }
  // leaveLate: 경기를 절반 넘게 진행된 상태로 만드는 방 데이터(없으면 null)와, 실제로 그렇게 됐는지 보는 조건.
  lateUpdate(room) { return null; }
  lateReady(room, since) { return true; }
  winSide(room, me) { return null; }
  // 판 결과를 방에 쓰는 내용. outcome: "win" | "draw" | "lose"
  endUpdate(room, me, outcome) { throw new Error("endUpdate"); }
  started(room) { return !!room && room.status && room.status !== "lobby"; }
  // 경기 시작을 기다리는 동안 사람이 눌러야 하는 버튼(30번 밴픽 "준비 완료" 등)을 누른다.
  poke() {}
  // 가짜 상대가 실제로 경기장에 들어온 것처럼 방 선수 목록에 넣을 기록(내 기록을 본떠 편만 바꿈). 못 하는 게임은 null.
  fakePlayer(room, me, fakeId, nick) { return null; }
  teamOf(room, me) { return room.players && room.players[me] ? room.players[me].team : null; }
  otherIds(room, me) { return Object.keys(room.players || {}).filter((id) => id !== me); }
}

class TurboCheck extends MkCheckGame {
  endUpdate(room, me, outcome) {
    const mine = this.teamOf(room, me), rival = this.otherIds(room, me).find((id) => room.players[id].team && room.players[id].team !== mine && room.players[id].team !== "spec");
    const row = (id, fin) => ({ nick: room.players[id].nickname, team: room.players[id].team, fin, prog: fin ? 3 : 1.2 });
    const result = { [me]: row(me, outcome === "win" ? 60000 : 0), [rival]: row(rival, outcome === "lose" ? 60000 : 0) };
    return { result, status: "ended", endedAt: Date.now() };
  }
}

class FpsCheck extends MkCheckGame {
  constructor(root, openButton) { super(root, openButton); this.lateTimeoutMs = 120000; this.enterButton = "btnTeam"; }
  lateReady(room) { return room.status === "playing" && Date.now() - room.startAt >= 66000; }
  fakePlayer(room, me, fakeId, nick) {
    const mine = room.players[me];
    return Object.assign({}, mine, { nickname: nick, team: mine.team === "blue" ? "red" : "blue", joinedAt: Date.now() });
  }
  endUpdate(room, me, outcome) {
    const mine = this.teamOf(room, me), other = mine === "blue" ? "red" : "blue";
    const kills = {};
    if (outcome !== "draw") {
      const kt = outcome === "win" ? mine : other;
      kills["-check" + Date.now().toString(36)] = { k: "x", v: "y", kt, vt: kt === "blue" ? "red" : "blue", h: 0, at: (room.startAt || Date.now()) + 1000 };
    }
    return { kills, status: "ended", endedAt: Date.now() };
  }
}

class ArenaCheck extends MkCheckGame {
  constructor(root, openButton) { super(root, openButton); this.startWaitMs = 300000; this.joinAfterStart = true; this.leaveId = "btnLeaveGame"; }
  fakePlayer(room, me, fakeId, nick) {
    const mine = room.players[me];
    return Object.assign({}, mine, { nickname: nick, team: this.teamOf(room, me) === "blue" ? "red" : "blue", isAI: false, joinedAt: Date.now() });
  }
  teamOf(room, me) { return (room.roster && room.roster[me] && room.roster[me].team) || super.teamOf(room, me); }
  started(room) { return !!room && (room.status === "playing" || room.status === "countdown"); }
  lateUpdate(room) { return { overtimeAt: Date.now() }; }
  lateReady(room) { return room.status === "playing"; }
  poke() { const ready = document.getElementById("btnDraftReady"); if (ready && ready.offsetParent !== null && !ready.disabled) ready.click(); }
  endUpdate(room, me, outcome) {
    const mine = this.teamOf(room, me), other = mine === "blue" ? "red" : "blue";
    const winner = outcome === "win" ? mine : other;
    return { status: "ended", winner, endedAt: Date.now(), final: { blue: winner === "blue" ? 3 : 1, red: winner === "red" ? 3 : 1, reason: "검사" } };
  }
}

// 31번은 감염되면 좀비 편이다. win = 인간 승리에 나는 생존, zombieWin = 전원 감염(좀비 승리, 나도 감염 → 승),
// lose = 인간 승리인데 나는 감염(좀비 편이 짐).
class ZombieCheck extends MkCheckGame {
  lateUpdate(room) { return { startAt: Date.now() - 108000 }; }
  lateReady(room) { return room.status === "playing"; }
  fakePlayer(room, me, fakeId, nick) { return Object.assign({}, room.players[me], { nickname: nick, joinedAt: Date.now() }); }
  endUpdate(room, me, outcome) {
    const final = {}, humansWin = outcome !== "zombieWin";
    const others = Object.keys(room.players || {}).filter((id) => id !== me);
    Object.keys(room.players || {}).forEach((id, k) => { final[id] = { n: room.players[id].nickname || id, r: "infected", s: 30, j: k }; });
    if (outcome === "win") final[me].r = "survived";
    if (outcome === "lose" && others.length) final[others[0]].r = "survived";
    return { final, winner: humansWin ? "human" : "zombie", status: "ended", endedAt: Date.now() };
  }
}

class CollectionCheck extends MkCheckGame {
  fakePlayer(room, me, fakeId, nick) { return Object.assign({}, room.players[me], { nick, joinedAt: Date.now() }); }
  endUpdate(room, me, outcome) {
    const others = this.otherIds(room, me);
    const ranks = { [me]: outcome === "win" ? 1 : 2 };
    others.forEach((id, k) => { ranks[id] = outcome === "win" ? 2 + k : (k === 0 ? 1 : 2 + k); });
    const names = {};
    Object.keys(ranks).forEach((id) => { names[id] = (room.players[id] && room.players[id].nick) || id; });
    return { results: { r1: { ranks, names } }, status: "final" };
  }
}

class SideCheck extends MkCheckGame {
  constructor(root, openButton, extra) { super(root, openButton); this.extra = extra || {}; this.lateTimeoutMs = 240000; }
  lateReady(room) {
    if (this.root === "volleyball") return !!room.rally && Math.max(room.rally.sa, room.rally.sb) >= 6;
    return !!room.game && (room.game.overtime || 1 - (room.game.leftMs - (room.game.phase === "play" ? Date.now() - room.game.at : 0)) / 90000 >= 0.55);
  }
  fakePlayer(room, me, fakeId, nick) {
    const slot = room.assign && room.assign[fakeId];
    return slot === undefined ? null : Object.assign({}, room.players[me], { nick, slot, joinedAt: Date.now() });
  }
  started(room) { return !!room && room.status && room.status !== "lobby" && room.status !== "end"; }
  endUpdate(room, me, outcome, ticket) {
    const winner = outcome === "win" ? ticket.side : 1 - ticket.side;
    return { end: Object.assign({ winner, sa: winner === 0 ? 7 : 3, sb: winner === 1 ? 7 : 3, at: Date.now() }, this.extra), status: "end" };
  }
}

class RoyaleCheck extends MkCheckGame {
  constructor(root, openButton, perPlayer) { super(root, openButton); this.perPlayer = perPlayer; this.doubleTap = true; this.lateTimeoutMs = 900000; }
  // 방장이 쓰는 snap 의 게임 안 시간으로 본다(38: 초, 눈보라 완전 수축 360초 / 39: 틱 30/초, 서든데스 끝 179초). 시험 탭 타이머가 느려 실제 시간과 다르다.
  lateReady(room) {
    let snap = null;
    try { snap = JSON.parse(room.snap || "null"); } catch (error) { return false; }
    if (!snap) return false;
    return this.root === "snowroyale" ? snap.t >= 0.55 * 360 : snap.t / 30 >= 0.55 * 179;
  }
  started(room) { return !!room && !!room.match && !!room.match.teams; }
  endUpdate(room, me, outcome) {
    const teams = room.match.teams;
    const slots = this.perPlayer ? teams.flatMap((t) => t.members.map((m) => ({ id: m.id, team: teams.indexOf(t) }))) : teams.map((t, k) => ({ ids: t.members.map((m) => m.id), team: k }));
    const myTeam = teams.findIndex((t) => t.members.some((m) => m.id === me));
    const isMine = (slot) => this.perPlayer ? slot.team === myTeam : slot.team === myTeam;
    let firstOther = true;
    const ranks = slots.map((slot) => {
      if (isMine(slot)) return outcome === "win" ? 1 : 2;
      if (outcome === "lose" && firstOther) { firstOther = false; return 1; }
      return 3;
    });
    return { end: { match: room.match.id, ranks, outTicks: ranks.map(() => 0), at: Date.now() }, status: "ended" };
  }
}

class MkCheckRunner {
  constructor(game) { this.game = game; this.log = []; this.done = false; this.fakeSeq = 0; }
  static wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
  async until(test, ms, what) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const value = test(); if (value) return value; await MkCheckRunner.wait(200); }
    throw new Error("시간 초과: " + what);
  }
  note(text) { this.log.push(text); }
  visibleButton(pattern) {
    return [...document.querySelectorAll("button")].find((b) => pattern.test(b.textContent) && b.offsetParent !== null && !b.disabled) || null;
  }
  myParty() {
    const parties = MkCheckDb.at(this.game.root + "/parties") || {};
    const shown = ((document.querySelector(".mk-code") || {}).textContent || "").trim();
    if (shown && parties[shown] && parties[shown].members) return { code: shown, record: parties[shown], me: Object.keys(parties[shown].members).find((id) => !id.startsWith("fk")) };
    const code = Object.keys(parties).filter((c) => parties[c].members && Object.keys(parties[c].members).some((id) => !id.startsWith("fk"))).sort((a, b) => parties[b].createdAt - parties[a].createdAt)[0];
    return code ? { code, record: parties[code], me: Object.keys(parties[code].members).find((id) => !id.startsWith("fk")) } : null;
  }
  queueName(code) {
    const queues = MkCheckDb.at("matchQueue") || {};
    return Object.keys(queues).find((q) => queues[q] && queues[q][code] && queues[q][code].size > 0) || null;
  }
  // "매칭 시작"을 누른 뒤 대기열에 새로 생긴 내 항목으로 내 대기실을 찾는다(예전 판의 대기실과 헷갈리지 않게).
  queueStamp() {
    const queues = MkCheckDb.at("matchQueue") || {}, stamp = new Set();
    Object.keys(queues).forEach((queue) => Object.keys(queues[queue] || {}).forEach((code) => stamp.add(queue + "/" + code + "@" + queues[queue][code].at)));
    return stamp;
  }
  myEntry(before) {
    const queues = MkCheckDb.at("matchQueue") || {};
    for (const queue of Object.keys(queues)) {
      for (const code of Object.keys(queues[queue] || {})) {
        const entry = queues[queue][code];
        if (entry && entry.size > 0 && entry.leader && !entry.leader.startsWith("fk") && !before.has(queue + "/" + code + "@" + entry.at)) return { queue, code, me: entry.leader };
      }
    }
    return null;
  }
  // 가짜 Firebase 에는 onDisconnect 가 없어서, 앞서 연 페이지의 대기열 항목·"경기 중" 표지판이 남아 묶기를 막는다. 시작 전에 이 게임 대기열을 비운다.
  async clearStaleQueue() {
    const queues = MkCheckDb.at("matchQueue") || {};
    for (const queue of Object.keys(queues).filter((name) => name.startsWith(this.game.root))) {
      for (const code of Object.keys(queues[queue] || {})) {
        await MkCheckDb.ref("matchQueue/" + queue + "/" + code).remove();
      }
    }
  }
  async addRival(queue) {
    const fakeCode = String(90000 + (Date.now() % 9000) + this.fakeSeq++), fakeId = "fk" + fakeCode;
    const person = { nick: "가짜상대" + this.fakeSeq, joinedAt: Date.now(), look: null };
    this.fake = { id: fakeId, nick: person.nick };
    await MkCheckDb.ref(this.game.root + "/parties/" + fakeCode).set({ leaderId: fakeId, createdAt: Date.now(), members: { [fakeId]: person }, bots: 0 });
    await MkCheckDb.ref("matchQueue/" + queue + "/" + fakeCode).set({ leader: fakeId, people: { [fakeId]: person }, bots: 0, size: 1, at: Date.now() + 50, claim: null });
  }
  async round(outcome, index) {
    const start = await this.until(() => this.visibleButton(/^매칭 시작$/), 10000, "매칭 시작 버튼");
    const before0 = this.queueStamp();
    start.click();
    const party = await this.until(() => this.myEntry(before0), 8000, "내 대기열 항목");
    const before = Object.keys(MkCheckDb.at(this.game.root + "/parties/" + party.code + "/history") || {}).length;
    await this.addRival(party.queue);
    const ticket = await this.until(() => { const p = MkCheckDb.at(this.game.root + "/parties/" + party.code); return p && p.match; }, 60000, "표");
    const roomPath = await this.until(() => MkCheckDb.findRoom(ticket.room), 8000, "방 " + ticket.room);
    const joins = outcome === "winJoined";
    const joinRival = async () => {
      await this.until(() => { const r = MkCheckDb.at(roomPath); return r && r.players && r.players[party.me]; }, 8000, "내 선수 기록");
      const record = this.game.fakePlayer(MkCheckDb.at(roomPath), party.me, this.fake.id, this.fake.nick);
      if (!record) throw new Error("이 게임은 winJoined 를 지원하지 않음");
      await MkCheckDb.ref(roomPath + "/players/" + this.fake.id).set(record);
      await MkCheckRunner.wait(1000);
    };
    if (joins && !this.game.joinAfterStart) await joinRival();
    await this.until(() => { this.game.poke(); return this.game.started(MkCheckDb.at(roomPath)); }, this.game.startWaitMs, "게임 시작");
    await MkCheckRunner.wait(1500);
    if (joins && this.game.joinAfterStart) await joinRival();
    if (outcome === "leaveLate" || outcome === "leaveEarly") { await this.leaveMidMatch(outcome, index, party, roomPath, before); return; }
    const room = MkCheckDb.at(roomPath);
    const quick = outcome === "winQuick";
    await MkCheckDb.ref(roomPath).update(this.game.endUpdate(room, party.me, joins || quick ? "win" : outcome, ticket));
    const findBack = () => this.visibleButton(/대기실로/) || [...document.querySelectorAll("button")].find((b) => /^(팀|랜덤 매칭) 대기실로$/.test(b.textContent.trim()) && !b.hidden && !b.disabled);
    const historyNow = () => { const h = MkCheckDb.at(this.game.root + "/parties/" + party.code + "/history") || {}; return Object.keys(h).map((k) => h[k]).sort((a, b) => a.n - b.n); };
    // winQuick: 결과 화면이 뜨자마자(전적을 쓰기 전에) 대기실로 돌아가도 전적이 남는지.
    if (quick) {
      await this.until(() => this.visibleButton(/대기실로/), 4000, "").catch(() => null);
      const early = findBack();
      if (!early) throw new Error("대기실로 버튼 없음");
      early.click();
    }
    const line = await this.until(() => { const lines = historyNow(); return lines.length > before ? lines[lines.length - 1] : null; }, quick ? 6000 : 10000, "전적 줄").catch(() => null);
    if (!line && !quick) throw new Error("시간 초과: 전적 줄");
    await MkCheckRunner.wait(1500);
    const lines = historyNow().length;
    if (!quick) {
      await this.until(() => this.visibleButton(/대기실로/), 4000, "").catch(() => null);
      const back = findBack();
      if (!back) throw new Error("대기실로 버튼 없음");
      back.click();
    }
    await this.until(() => this.visibleButton(/^매칭 시작$/), 10000, "대기실 복귀");
    const streak = (document.querySelector(".mk-streak") || {}).textContent || "";
    const expect = outcome === "zombieWin" || joins || quick ? "win" : outcome;
    if (!line) { this.note({ round: index + 1, case: outcome, want: expect, got: "전적 없음", ok: false, added: lines - before, streak }); return; }
    const rivals = line.rivals || [], rivalsOk = joins ? rivals.length === 1 && rivals[0] === this.fake.nick : rivals.length === 0;
    this.note({ round: index + 1, case: outcome, want: expect, got: line.result, ok: expect === line.result && rivalsOk && lines - before === 1, added: lines - before, rivals, rivalsOk, rank: line.rank, of: line.of, streak });
  }
  // 경기 중 나가기 버튼(확인 창은 "예", 두 번 누르는 버튼은 두 번)으로 나간다. leaveLate 는 절반 넘게 진행된 뒤라 패가 남아야 하고,
  // leaveEarly 는 절반 전이라 아무것도 남지 않아야 한다.
  async leaveMidMatch(outcome, index, party, roomPath, before) {
    const late = outcome === "leaveLate", since = Date.now(), asked = [];
    if (late) {
      const update = this.game.lateUpdate(MkCheckDb.at(roomPath));
      if (update) await MkCheckDb.ref(roomPath).update(update);
      await this.until(() => this.game.lateReady(MkCheckDb.at(roomPath) || {}, since), this.game.lateTimeoutMs, "절반 넘게 진행");
      await MkCheckRunner.wait(1500);
    }
    window.confirm = (message) => { asked.push(message); return true; };
    const button = await this.until(() => document.getElementById(this.game.leaveId), 5000, "경기 중 나가기 버튼");
    button.click();
    if (this.game.doubleTap) { await MkCheckRunner.wait(300); asked.push(button.textContent.trim()); button.click(); }
    await this.until(() => this.visibleButton(/^매칭 시작$/), 10000, "대기실 복귀");
    await MkCheckRunner.wait(2500);
    const h = MkCheckDb.at(this.game.root + "/parties/" + party.code + "/history") || {};
    const lines = Object.keys(h).map((k) => h[k]).sort((a, b) => a.n - b.n);
    const added = lines.length - before, last = lines[lines.length - 1];
    const warned = asked.some((m) => /패배/.test(m));
    const ok = late ? added === 1 && last.result === "lose" && warned : added === 0 && !warned;
    const streak = (document.querySelector(".mk-streak") || {}).textContent || "";
    this.note({ round: index + 1, case: outcome, want: late ? "lose(경고 문구)" : "기록 없음", got: added ? last.result : "기록 없음", ok, added, asked, streak });
  }
  async run(outcomes) {
    if (typeof window.__fbTree !== "function" || typeof firebase.SDK_VERSION === "string") {
      this.note("중단: 진짜 Firebase 에 연결돼 있어요(가짜 fbmock 이 아님). 실제 DB 에 쓰지 않도록 시작하지 않습니다.");
      this.done = true;
      return;
    }
    try {
      await this.clearStaleQueue();
      if (this.game.enterButton) { (await this.until(() => document.getElementById(this.game.enterButton), 10000, "모드 버튼")).click(); await MkCheckRunner.wait(800); }
      const open = await this.until(() => document.getElementById(this.game.openButton), 10000, "랜덤 매칭 버튼");
      open.click();
      await this.until(() => this.myParty(), 10000, "대기실");
      for (let i = 0; i < outcomes.length; i++) await this.round(outcomes[i], i);
    } catch (error) {
      this.note("오류: " + error.message);
    }
    this.done = true;
  }
}

class MkCheckCatalog {
  static game(name) {
    return {
      turbo: () => new TurboCheck("turbolap", "btnRandom"),
      fps: () => new FpsCheck("fpsbattle", "btnRandom"),
      arena: () => new ArenaCheck("teambattle", "btnRandom"),
      zombie: () => new ZombieCheck("zombieoutbreak", "btnRandom"),
      minigames: () => new CollectionCheck("minigames", "btnRandom"),
      volley: () => new SideCheck("volleyball", "btnRandom"),
      soccer: () => new SideCheck("soccer", "btnRandom", { overtime: false, goals: [] }),
      snowSolo: () => new RoyaleCheck("snowroyale", "btnRandomSolo", false),
      snowDuos: () => new RoyaleCheck("snowroyale", "btnRandomDuos", false),
      balloonSolo: () => new RoyaleCheck("waterballoon", "btnRandomSolo", true),
      balloonTeam: () => new RoyaleCheck("waterballoon", "btnRandomTeam", true),
    }[name]();
  }
}

window.__mkCheck = {
  runner: null,
  get log() { return this.runner ? this.runner.log : []; },
  get done() { return !!this.runner && this.runner.done; },
  run(name, outcomes) { this.runner = new MkCheckRunner(MkCheckCatalog.game(name)); this.runner.run(outcomes); return "started"; }
};
