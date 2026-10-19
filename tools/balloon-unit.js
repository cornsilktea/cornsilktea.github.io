const W = require("./balloon-load.js")();
const { WbEngine, WbGrid, WbCell, WbBalloon, WbDir, WbMover, WbTurnBuffer, WbRosterPlanner, WbLootTable, WbBalance, WbSnapshotCodec, WbSeededRandom, WbSpawnPlan, WbFairBoxLayout, WbWalkDistance, WbBotBrain, WbPlayer } = W;

let passed = 0;
const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
function near(a, b, eps = 1e-3) { return Math.abs(a - b) <= eps; }

class Script {
  constructor() { this.bot = false; this.move = -1; this.alt = -1; this.kPress = 0; }
  decide() { return { move: this.move, alt: this.alt, kPress: this.kPress }; }
}

function arena(mode = "solo", count = 2) {
  const teams = WbRosterPlanner.allBots(mode, count);
  const e = new WbEngine({ seed: 4242, lootSeed: 99, mode, teams });
  e.grid.cells.set(WbGrid.withPillars().cells);
  e.hidden.clear();
  e.tick = 0;
  const pilots = e.players.map((p) => { const s = new Script(); e.attach(p.index, s); p.x = 50; p.z = 50; p.life = "alive"; return s; });
  e.players.forEach((p) => { p.x = 0.5 + 14 * (p.index % 2); p.z = 0.5 + 12 * Math.floor(p.index / 2) % 13; });
  return { e, pilots };
}
function put(p, i, j) { p.x = i + 0.5; p.z = j + 0.5; }
function addBalloon(e, owner, i, j, fuse, range, id) {
  const b = new WbBalloon(id, owner, i, j, e.tick, e.tick + fuse, range);
  e.balloons.push(b); e.balloonCell[WbGrid.index(i, j)] = b.id; return b;
}
function run(e, ticks) { const all = []; for (let k = 0; k < ticks && !e.ended; k++) all.push(...e.step()); return all; }
function cellsOf(list) { return list.map((k) => (k % 15) + "," + Math.floor(k / 15)).sort().join(" "); }
function gridWorld(grid) { return { blocked: (i, j) => grid.blocked(i, j), balloonAt: () => -1 }; }

{
  const { e } = arena();
  put(e.players[0], 0, 12); put(e.players[1], 14, 12);
  e.grid.set(5, 2, WbCell.BOX);
  addBalloon(e, 0, 1, 2, 1, 7, 900);
  const blast = run(e, 2).find((x) => x.t === "blast");
  check("물줄기: 기둥에서 멈추고 상자 1개까지만", blast && cellsOf(blast.cells) === "0,2 1,2 2,2 3,2 4,2 5,2", blast && cellsOf(blast.cells));
  run(e, 20);
  check("상자는 물줄기가 끝날 때 사라짐", e.grid.kind(5, 2) === WbCell.EMPTY);
}
{
  const { e } = arena();
  put(e.players[0], 0, 12); put(e.players[1], 14, 12);
  addBalloon(e, 0, 2, 2, 1, 1, 900);
  const blast = run(e, 2).find((x) => x.t === "blast");
  check("물줄기 길이 1 = 십자 5칸", blast && cellsOf(blast.cells) === "1,2 2,1 2,2 2,3 3,2", blast && cellsOf(blast.cells));
  const { e: e2 } = arena();
  put(e2.players[0], 0, 12); put(e2.players[1], 14, 12);
  addBalloon(e2, 0, 0, 6, 1, 7, 901);
  const b2 = run(e2, 2).find((x) => x.t === "blast");
  check("물줄기 길이 7", b2 && b2.cells.length === 1 + 7 + 6 + 6, b2 && b2.cells.length);
}
{
  const { e } = arena();
  put(e.players[0], 0, 12); put(e.players[1], 14, 12);
  addBalloon(e, 0, 2, 2, 5, 2, 900);
  addBalloon(e, 1, 4, 2, 200, 3, 901);
  addBalloon(e, 1, 6, 2, 300, 2, 902);
  const evs = run(e, 6);
  const blasts = evs.filter((x) => x.t === "blast");
  const ticks = new Set(blasts.map((b) => b.id));
  check("연쇄: 남의 풍선까지 같은 틱에 터짐", blasts.length === 3 && ticks.size === 3 && e.balloons.length === 0, blasts.length);
  const { e: c } = arena();
  put(c.players[0], 0, 12); put(c.players[1], 14, 12);
  addBalloon(c, 0, 2, 4, 1, 3, 910); addBalloon(c, 1, 4, 4, 1, 3, 911); addBalloon(c, 0, 4, 6, 1, 3, 912); addBalloon(c, 1, 2, 6, 1, 3, 913);
  const cb = run(c, 2).filter((x) => x.t === "blast");
  check("원형 연쇄도 한 번씩만 터지고 끝남", cb.length === 4, cb.length);
}
{
  const { e, pilots } = arena();
  const [a, b] = e.players;
  put(a, 2, 2); b.x = 2.8; b.z = 2.5;
  pilots[0].kPress = 1;
  run(e, 1);
  const balloon = e.balloons[0];
  check("놓는 순간 그 칸에 걸친 다른 사람도 빠져나갈 수 있음", balloon && balloon.passers.has(0) && balloon.passers.has(1));
  pilots[0].move = WbDir.RIGHT;
  run(e, 15);
  check("놓은 칸에서 빠져나감", a.x > 3.35 - 1e-6, a.x);
  pilots[0].move = WbDir.LEFT;
  run(e, 15);
  check("빠져나간 뒤 다시 못 들어감", near(a.x, 3.35), a.x);
  pilots[1].move = WbDir.DOWN; pilots[1].kPress = 1;
  run(e, 1);
  check("이미 풍선이 있는 칸에는 못 놓음", e.balloons.length === 1);
}
{
  const { e, pilots } = arena();
  const a = e.players[0];
  put(a, 0, 4); put(e.players[1], 14, 12);
  pilots[0].kPress = 1; run(e, 1);
  pilots[0].move = WbDir.RIGHT; run(e, 12);
  pilots[0].kPress = 2; const evs = run(e, 1);
  check("동시 풍선 개수 상한(1)", e.balloons.length === 1 && evs.some((x) => x.t === "noPlace"));
  a.balloonsMax = 2; pilots[0].kPress = 3; run(e, 1);
  check("걸으며 연달아 깔기(이동이 멈추지 않음)", e.balloons.length === 2 && a.moving);
}
{
  const grid = WbGrid.withPillars();
  const world = gridWorld(grid);
  const body = { x: 2.5, z: 2.5 };
  WbMover.advance(world, 0, body, WbDir.RIGHT, WbDir.NONE, 0.5);
  check("한 축 이동", near(body.x, 3.0) && near(body.z, 2.5), body);
  const s = { x: 2.5, z: 2.2 };
  WbMover.advance(world, 0, s, WbDir.RIGHT, WbDir.NONE, 1);
  check("모서리 미끄러짐(걸린 정도 0.15 → 통로로 밀림)", near(s.x, 3.35) && near(s.z, 2.35), s);
  const t = { x: 2.5, z: 1.85 };
  WbMover.advance(world, 0, t, WbDir.RIGHT, WbDir.NONE, 1);
  check("걸린 정도 0.5 > 0.45 는 막힘", near(t.x, 2.65) && near(t.z, 1.85), t);
  const u = { x: 2.5, z: 1.96 };
  WbMover.advance(world, 0, u, WbDir.RIGHT, WbDir.NONE, 1);
  check("걸린 정도 0.39 ≤ 0.45 는 미끄러짐", u.z > 2.3 && u.x > 2.7, u);
  const v = { x: 2.5, z: 0.35 };
  WbMover.advance(world, 0, v, WbDir.UP, WbDir.RIGHT, 0.5);
  check("주 방향이 막히면 다른 축으로(조이스틱 축 바꾸기)", near(v.x, 3.0) && near(v.z, 0.35), v);
}
{
  const { e, pilots } = arena();
  const a = e.players[0];
  put(a, 0, 4); put(e.players[1], 14, 12);
  pilots[0].move = WbDir.RIGHT; run(e, 1);
  check("가속 없음: 첫 틱부터 최고 속도", near(a.x, 0.5 + 2.8 / 30, 1e-6), a.x);
  const x1 = a.x; pilots[0].move = WbDir.NONE; run(e, 1);
  check("뗀 틱에 정지", a.x === x1);
  a.shoe = 5; pilots[0].move = WbDir.RIGHT; run(e, 1);
  check("운동화 5단계 = 4.8칸/초", near(a.x - x1, 4.8 / 30, 1e-6));
}
{
  const grid = WbGrid.withPillars();
  const world = gridWorld(grid);
  const body = { x: 2.6, z: 0.5 };
  const buf = new WbTurnBuffer();
  let now = 0;
  buf.press(WbDir.RIGHT, body);
  const stepFor = (sec) => { const n = Math.round(sec * 60); for (let k = 0; k < n; k++) { const r = buf.read(now); WbMover.advance(world, 0, body, r.move, r.alt, 2.8 / 60); now += 1 / 60; } };
  stepFor(0.3);
  buf.press(WbDir.DOWN, body); buf.release(WbDir.RIGHT, body, now);
  stepFor(0.45);
  check("미리 꺾기: 오른쪽을 떼고 아래를 미리 누르면 다음 열린 줄에서 꺾음", body.z > 0.6 && near(body.x, 4.35), body);
  const late = { x: 2.6, z: 0.5 };
  const buf2 = new WbTurnBuffer(); now = 0;
  buf2.press(WbDir.RIGHT, late); buf2.release(WbDir.RIGHT, late, now);
  now = 0.3; buf2.press(WbDir.DOWN, late);
  const r = buf2.read(now);
  check("0.25초가 지난 입력은 기억하지 않음", r.alt === WbDir.NONE);
}
{
  const grid = WbGrid.withPillars();
  grid.set(6, 4, WbCell.BOX);
  const world = gridWorld(grid);
  const finals = [1 / 30, 1 / 60, 1 / 144].map((dt) => {
    const body = { x: 0.5, z: 2.3 };
    const steps = Math.round(1.5 / dt);
    for (let k = 0; k < steps; k++) WbMover.advance(world, 0, body, k < Math.round(0.5 / dt) ? WbDir.RIGHT : WbDir.DOWN, WbDir.RIGHT, 2.8 * dt);
    return body;
  });
  check("프레임 간격 1/30·1/60·1/144 에서 같은 시간 같은 위치", finals.every((b) => near(b.x, finals[0].x) && near(b.z, finals[0].z)), finals);
}
{
  const { e } = arena();
  const [a, b] = e.players;
  put(a, 4, 4); put(b, 10, 10);
  e.wetUntil[a.cell] = e.tick + 15; e.wetOwner[a.cell] = 1;
  const t = run(e, 1);
  check("물줄기 칸에 몸 중심이 있으면 갇힘", a.life === "trapped" && t.some((x) => x.t === "trap"));
  run(e, 148);
  check("갇힘 5초 전에는 아직 안 탈락", a.life === "trapped");
  run(e, 2);
  check("갇힘 5초 뒤 탈락 + 처치는 풍선 주인", a.life === "out" && b.kills === 1, { life: a.life, kills: b.kills });
}
{
  const { e } = arena();
  const [a, b] = e.players;
  put(a, 4, 4); a.x = 4.36; put(b, 10, 10);
  e.wetUntil[WbGrid.index(4, 4)] = e.tick + 15; e.wetOwner[WbGrid.index(4, 4)] = 1;
  e.wetUntil[WbGrid.index(5, 4)] = -1;
  a.x = 5.1;
  run(e, 1);
  check("살짝 걸친 것은 안 갇힘(몸 중심 기준)", a.life === "alive");
}
{
  const { e } = arena("team", 4);
  const [a, ally, foe] = e.players.filter((p) => true).sort((p, q) => p.team - q.team || p.index - q.index);
  e.players.forEach((p) => put(p, 12, 12));
  put(a, 4, 4); ally.x = 4.5; ally.z = 5.0; put(foe, 10, 10);
  a.life = "trapped"; a.trapUntil = e.tick + 100; a.trapOwner = foe.index;
  e.players.filter((p) => p !== a && p !== ally && p !== foe).forEach((p) => put(p, 12, 0));
  run(e, 1);
  check("팀전: 같은 팀이 닿으면 구출", a.life === "alive" && ally.rescues === 1);
  e.wetUntil[a.cell] = e.tick + 15; e.wetOwner[a.cell] = foe.index;
  run(e, 20);
  check("구출 뒤 1초 무적", a.life === "alive");
  a.life = "trapped"; a.trapUntil = e.tick + 100;
  foe.x = 4.5; foe.z = 4.0; ally.x = 4.5; ally.z = 5.0;
  run(e, 1);
  check("같은 틱에 구출·마무리가 겹치면 구출이 먼저", a.life === "alive");
  a.life = "trapped"; a.trapUntil = e.tick + 100; ally.x = 9.5; ally.z = 9.5;
  foe.x = 4.5; foe.z = 4.1;
  run(e, 1);
  check("팀전: 다른 팀이 닿으면 즉시 탈락(마무리)", a.life === "out" && foe.kills === 1);
}
{
  const { e } = arena();
  const [a, b] = e.players;
  put(a, 4, 4); b.x = 4.5; b.z = 4.9;
  a.life = "trapped"; a.trapUntil = e.tick + 100;
  b.life = "trapped"; b.trapUntil = e.tick + 100;
  run(e, 1);
  check("갇힌 사람끼리 닿으면 아무 일 없음", a.life === "trapped" && b.life === "trapped");
  b.life = "alive";
  run(e, 1);
  check("개인전: 누구든 닿으면 즉시 탈락", a.life === "out" && b.kills === 1);
}
{
  const { e, pilots } = arena();
  const [a, b] = e.players;
  put(a, 4, 4); put(b, 10, 10);
  a.balloonsMax = 0; a.needles = 1;
  pilots[0].kPress = 1; run(e, 1);
  e.wetUntil[a.cell] = e.tick + 15; e.wetOwner[a.cell] = 1;
  run(e, 3);
  check("갇히기 전부터 누르고 있던 K 는 무시", a.life === "trapped" && a.needles === 1);
  pilots[0].kPress = 2; const ev = run(e, 1);
  check("갇혔을 때 K 를 새로 누르면 바늘 탈출", a.life === "alive" && a.needles === 0 && ev.some((x) => x.t === "rescue" && x.needle));
  a.balloonsMax = 1; run(e, 2);
  check("풀린 뒤에는 새로 눌러야 풍선을 놓음", e.balloons.length === 0);
  run(e, 40);
  e.wetUntil[a.cell] = e.tick + 15; e.wetOwner[a.cell] = 1; run(e, 1);
  pilots[0].kPress = 3; run(e, 1);
  check("바늘이 없으면 K 를 눌러도 그대로", a.life === "trapped");
  const p = new WbPlayer(0, "a", "a", false, 0);
  for (let k = 0; k < 3; k++) WbLootTable.create("needle", 1).apply(p, 0);
  check("바늘은 최대 2개", p.needles === 2);
}
{
  const { e } = arena();
  const [a, b] = e.players;
  put(a, 4, 4); put(b, 10, 10);
  WbLootTable.create("shield", 2).apply(a, e.tick);
  e.wetUntil[a.cell] = e.tick + 140; e.wetOwner[a.cell] = 1;
  run(e, 120);
  WbLootTable.create("shield", 2).apply(a, e.tick);
  run(e, 100);
  check("방패: 5초 동안 안 갇히고, 겹치면 다시 5초", a.life === "alive");
  e.wetUntil[a.cell] = e.tick + 200;
  run(e, 60);
  check("방패가 끝나면 갇힘", a.life === "trapped");
  const before = a.trapUntil;
  e.wetUntil[a.cell] = e.tick + 15; run(e, 5);
  check("갇힌 사람 위 물줄기는 효과 없음", a.trapUntil === before);
}
{
  const same = (a, b) => a.slice().sort().join() === b.slice().sort().join();
  check("등급표: 일반 = 물풍선·물줄기·운동화", same(WbLootTable.BY_GRADE[0], ["balloon", "range", "shoe"]));
  check("등급표: 희귀 = 물풍선·물줄기·운동화·바늘", same(WbLootTable.BY_GRADE[1], ["balloon", "range", "shoe", "needle"]));
  check("등급표: 전설 = 발차기·최대 물줄기·방패", same(WbLootTable.BY_GRADE[2], ["kick", "maxRange", "shield"]));
  const p = new WbPlayer(0, "a", "a", false, 0);
  const r1 = WbLootTable.create("balloon", 0).apply(p, 0), r2 = WbLootTable.create("range", 1).apply(p, 0);
  check("일반 +1, 희귀 +2", r1.gain === 1 && p.balloonsMax === 2 && r2.gain === 2 && p.range === 3);
  p.balloonsMax = 5; const r3 = WbLootTable.create("balloon", 1).apply(p, 0);
  check("상한을 넘으면 상한까지만(5 → 6)", p.balloonsMax === 6 && r3.gain === 1 && !r3.max);
  const r4 = WbLootTable.create("balloon", 0).apply(p, 0);
  check("이미 상한이면 MAX", r4.max && p.balloonsMax === 6);
  p.shoe = 4; WbLootTable.create("shoe", 1).apply(p, 0);
  check("운동화 상한 5단계", p.shoe === 5);
  WbLootTable.create("maxRange", 2).apply(p, 0);
  check("최대 물줄기 → 7", p.range === 7);
  const counts = { 0: {}, 1: {}, 2: {} };
  for (let s = 0; s < 200; s++) {
    const e = new WbEngine({ seed: s, lootSeed: s * 7 + 1, mode: s % 2 ? "solo" : "team", teams: WbRosterPlanner.allBots(s % 2 ? "solo" : "team", 4 + (s % 3) * 2) });
    for (const it of e.hidden.values()) counts[it.grade][it.kind] = (counts[it.grade][it.kind] || 0) + 1;
  }
  check("실제 배치: 일반에 바늘·전설 아이템 0", !counts[0].needle && !counts[0].kick && !counts[0].maxRange && !counts[0].shield, counts[0]);
  check("실제 배치: 전설에 물풍선·물줄기·운동화·바늘 0", !counts[2].balloon && !counts[2].range && !counts[2].shoe && !counts[2].needle, counts[2]);
}
{
  const { e } = arena();
  const [a, b] = e.players;
  put(a, 0, 12); put(b, 14, 12);
  e.floor.set(WbGrid.index(4, 2), { kind: "shoe", grade: 0, tick: e.tick - 1 });
  e.grid.set(6, 2, WbCell.BOX); e.hidden.set(WbGrid.index(6, 2), { kind: "range", grade: 1 });
  addBalloon(e, 0, 2, 2, 1, 7, 900);
  run(e, 2);
  check("아이템 위 물줄기 → 아이템 사라짐", !e.floor.has(WbGrid.index(4, 2)));
  addBalloon(e, 0, 4, 2, 13, 3, 901);
  run(e, 16);
  check("방금 상자에서 나온 아이템은 그 순간의 물줄기에 안 사라짐", e.floor.has(WbGrid.index(6, 2)), Array.from(e.floor.keys()));
  addBalloon(e, 0, 4, 2, 2, 3, 902);
  run(e, 3);
  check("나온 뒤 새로 터진 물줄기에는 사라짐", !e.floor.has(WbGrid.index(6, 2)));
}
{
  const { e, pilots } = arena();
  const [a, b] = e.players;
  put(a, 1, 0); put(b, 14, 12);
  a.kick = true;
  e.grid.set(8, 0, WbCell.BOX);
  addBalloon(e, 1, 2, 0, 200, 1, 900);
  pilots[0].move = WbDir.RIGHT;
  const evs = run(e, 30);
  const stop = evs.find((x) => x.t === "slideStop");
  check("발차기: 풍선이 미끄러져 상자 앞에서 멈춤", evs.some((x) => x.t === "kick") && stop && stop.i === 7 && stop.j === 0, stop);
  const { e: e2, pilots: p2 } = arena();
  put(e2.players[0], 1, 0); put(e2.players[1], 6, 0);
  e2.players[0].kick = true;
  addBalloon(e2, 1, 2, 0, 200, 1, 900);
  p2[0].move = WbDir.RIGHT;
  const s2 = run(e2, 30).find((x) => x.t === "slideStop");
  check("발차기: 사람 앞에서 멈춤", s2 && s2.i === 5, s2);
  const { e: e3, pilots: p3 } = arena();
  put(e3.players[0], 1, 0); put(e3.players[1], 14, 12);
  e3.players[0].kick = true;
  e3.floor.set(WbGrid.index(4, 0), { kind: "shoe", grade: 0, tick: -5 });
  addBalloon(e3, 1, 2, 0, 200, 1, 900);
  p3[0].move = WbDir.RIGHT;
  const s3 = run(e3, 30).find((x) => x.t === "slideStop");
  check("발차기: 아이템 앞에서 멈춤", s3 && s3.i === 3, s3);
}
{
  const { e } = arena();
  const [a, b] = e.players;
  put(a, 4, 4); put(b, 10, 10);
  a.balloonsMax = 6; a.range = 7; a.shoe = 5; a.needles = 2; a.kick = true;
  const before = e.floor.size;
  e.disconnect(0);
  run(e, 1);
  check("탈락한 사람의 아이템은 바닥에 안 나옴", e.floor.size === before && a.life === "out" && a.outWhy === "left");
}
{
  const fails = [];
  let fallback = 0;
  for (let s = 0; s < 1000; s++) {
    const mode = s % 3 === 0 ? "team" : "solo";
    const n = mode === "team" ? 2 + (s % 3) : 2 + (s % 7);
    const rng = new WbSeededRandom(s ^ 0x51A7);
    const groups = mode === "solo" ? WbSpawnPlan.solo(n, rng) : WbSpawnPlan.team(n, rng);
    const lay = new WbFairBoxLayout(groups, new WbSeededRandom(s ^ 0x2B0C)).build(WbLootTable.BY_GRADE, new WbSeededRandom(s + 5));
    const rep = lay.report;
    for (const g of groups) for (const c of g.clear) if (lay.grid.kind(c.i, c.j) !== WbCell.EMPTY) fails.push(["clear", s]);
    if (!rep.passed) { fallback++; if (rep.tries < WbFairBoxLayout.MAX_TRIES) fails.push(["gave up early", s]); continue; }
    if (Math.max(...rep.nearBoxes) - Math.min(...rep.nearBoxes) > 1) fails.push(["near", s]);
    if (Math.max(...rep.zoneBoxes) - Math.min(...rep.zoneBoxes) > 2) fails.push(["zone", s]);
    if (rep.escapeOk.some((ok) => !ok)) fails.push(["escape", s]);
    const totals = rep.zoneGrades.map((g) => g[0] + g[1] + g[2]);
    if (Math.max(...totals) - Math.min(...totals) > 1) fails.push(["loot total", s, rep.zoneGrades]);
    for (let g = 0; g < 3; g++) { const col = rep.zoneGrades.map((z) => z[g]); if (Math.max(...col) - Math.min(...col) > 1) fails.push(["loot grade", s]); }
    if (lay.loot.size !== Math.round(lay.grid.count(WbCell.BOX) * 0.4)) fails.push(["loot count", s]);
  }
  check("공정 배치 1000개 시드: 비운 칸·4칸 안 상자 ±1·구역 상자 ±2·첫 탈출로·구역별 아이템(통과 못 하면 200번 시도 뒤 가장 나은 배치)", fails.length === 0, fails.slice(0, 5));
  check("공정 배치: 200번 안에 못 통과한 시드가 1% 이하", fallback <= 10, fallback);
}
{
  const { e } = arena();
  const s = new W.WbSuddenDeath(0);
  check("서든데스: 판마다 시작 구석이 바뀜(4가지)", new Set([0, 1, 2, 3, 4, 5, 6, 7].map((n) => new WbEngine({ seed: n, lootSeed: 1, mode: "solo", teams: WbRosterPlanner.allBots("solo", 2) }).sudden.order[0])).size >= 3);
  check("서든데스: 144칸", s.order.length === 144, s.order.length);
  check("서든데스: 기둥 건너뜀", s.order.every((k) => !WbGrid.isPillarSpot(k % 15, Math.floor(k / 15))));
  check("서든데스: 바깥 테두리부터 시계 방향", s.order[0] === 0 && s.order[1] === 1 && s.order[14] === 14 && s.order[15] === 29);
  check("서든데스: 마지막 칸이 180초에 착지", s.landAt[143] === 5400 && s.warnAt[0] === 3600, [s.warnAt[0], s.landAt[143]]);
  const [a, b] = e.players;
  const first = e.sudden.order[0];
  put(a, first % 15, Math.floor(first / 15)); put(b, 7, 6);
  e.tick = e.sudden.landAt[0] - 1;
  run(e, 2);
  check("떨어진 칸의 사람 즉시 탈락(처치 없음)", a.life === "out" && a.outWhy === "sudden" && b.kills === 0);
  const { e: f } = arena();
  put(f.players[0], 7, 6); put(f.players[1], 6, 6);
  f.tick = 3500;
  run(f, 2000);
  let empty = 0; for (let k = 0; k < 195; k++) if (f.grid.cells[k] === WbCell.EMPTY) empty++;
  check("180초에 가운데 5×3(빈 칸 9) 만 남음", empty === 9 && f.grid.count(WbCell.WALL) === 144, empty);
  check("시간 종료 개인전: 남은 사람 여럿이면 무승부", f.ended && f.ranks[0] === 1 && f.ranks[1] === 1);
}
{
  const { e } = arena("team", 6);
  const byTeam = (t) => e.players.filter((p) => p.team === t);
  e.players.forEach((p, k) => put(p, 7 + (k % 2) * 2 - 1, 6));
  e.tick = 5390;
  byTeam(1)[0].life = "out"; byTeam(1)[0].outTick = 100;
  run(e, 20);
  check("시간 종료 팀전: 남은 인원이 많은 팀 우승", e.ended && e.ranks[byTeam(0)[0].index] === 1 && e.ranks[byTeam(2)[0].index] === 1 && e.ranks[byTeam(1)[1].index] === 3, e.ranks);
  const { e: g } = arena();
  const [a, b] = g.players;
  put(a, 6, 6); put(b, 8, 6);
  g.tick = 5390; a.life = "trapped"; a.trapUntil = 5500; a.trapOwner = 1;
  run(g, 20);
  check("시간 종료 순간 갇혀 있는 사람은 탈락 처리", a.life === "out" && g.ranks[1] === 1 && g.ranks[0] === 2 && b.kills === 1, g.ranks);
  const { e: h } = arena("solo", 3);
  h.players.forEach((p, k) => put(p, 2 + k * 2, 4));
  h.tick = 10;
  h.players[0].life = "out"; h.players[0].outTick = 5;
  h.knockOut(h.players[1], -1, "finish"); h.knockOut(h.players[2], -1, "finish");
  run(h, 1);
  check("같은 틱 탈락은 공동 순위", h.ended && h.ranks[1] === 1 && h.ranks[2] === 1 && h.ranks[0] === 3, h.ranks);
  const { e: t } = arena("team", 6);
  const team = (c) => t.players.filter((p) => p.team === c);
  t.players.forEach((p, k) => put(p, 2 + (k % 6) * 2, 4));
  team(2).forEach((p) => { p.life = "out"; p.outTick = 10; });
  team(0).forEach((p) => { p.life = "out"; p.outTick = 50; });
  t.tick = 60; run(t, 1);
  check("팀 순위는 팀이 전멸한 순서", t.ended && t.ranks[team(1)[0].index] === 1 && t.ranks[team(0)[0].index] === 2 && t.ranks[team(2)[0].index] === 3, t.ranks);
}
{
  const { e } = arena();
  const [a, b] = e.players;
  put(a, 4, 4); put(b, 10, 10);
  a.life = "trapped"; a.trapUntil = e.tick + 1; a.trapOwner = 0;
  run(e, 2);
  check("자기 풍선에 갇혀 시간이 다 되면 자폭", a.selfKills === 1 && b.kills === 0);
  const { e: g } = arena();
  const [c, d] = g.players;
  put(c, 4, 4); put(d, 10, 10);
  g.wetUntil[c.cell] = g.tick + 15; g.wetOwner[c.cell] = 1;
  run(g, 1);
  check("가둔 수 집계", d.traps === 1);
  g.grid.set(12, 12, WbCell.BOX); addBalloon(g, 1, 12, 10, 1, 3, 950);
  run(g, 2);
  check("부순 상자 집계", d.boxes === 1);
}
{
  const fillCount = (mode, seats, extra = []) => { const t = WbRosterPlanner.fill(mode, seats, extra); return { bots: t.reduce((s, x) => s + x.members.filter((m) => m.bot).length, 0), teams: t.length, sizes: t.map((x) => x.members.length) }; };
  const h = (slots) => slots.map((slot, k) => ({ id: "h" + k, nick: "h" + k, slot }));
  check("개인전 사람 1·2·3·4 → 봇 3·2·1·0", [1, 2, 3, 4].map((n) => fillCount("solo", h(Array.from({ length: n }, (_, k) => k))).bots).join() === "3,2,1,0");
  const cases = [
    [[0], 3, 2], [[0, 1], 2, 2], [[0, 2], 2, 2], [[0, 1, 2], 1, 2], [[0, 2, 4], 3, 3],
    [[0, 1, 2, 3], 0, 2], [[0, 1, 2, 4], 2, 3], [[0, 2, 4, 6], 4, 4], [[0, 1, 2, 3, 4], 1, 3],
  ];
  for (const [slots, bots, teams] of cases) {
    const r = fillCount("team", h(slots));
    check("팀전 채우기 " + JSON.stringify(slots) + " → 봇 " + bots + ", " + teams + "팀", r.bots === bots && r.teams === teams && r.sizes.every((s) => s === 2), r);
  }
  const plus = fillCount("team", h([0]), [2, 3]);
  check("방장이 봇 팀 추가", plus.teams === 3 && plus.bots === 5, plus);
  const solo = fillCount("solo", h([0]), [1, 2, 3, 4, 5, 6, 7, 8]);
  check("개인전 방장이 봇 추가(최대 8자리)", solo.bots === 7 && solo.teams === 8, solo);
}
{
  for (const n of [2, 3, 4]) {
    const e = new WbEngine({ seed: 31 + n, lootSeed: 1, mode: "team", teams: WbRosterPlanner.allBots("team", n * 2) });
    const okPairs = e.teamColors().every((c) => { const m = e.players.filter((p) => p.team === c); return m[0].z === m[1].z && Math.abs(m[0].x - m[1].x) === 2; });
    const corners = new Set(e.players.map((p) => (p.x < 7.5 ? "L" : "R") + (p.z < 6.5 ? "T" : "B")));
    check("팀전 " + n + "팀: 팀마다 같은 구석 가로 2칸, 구석이 서로 다름", okPairs && corners.size === n, Array.from(corners));
    if (n === 2) check("팀전 2팀은 대각선 구석", !corners.has("LT") || corners.has("RB"));
  }
  const s2 = new WbEngine({ seed: 5, lootSeed: 1, mode: "solo", teams: WbRosterPlanner.allBots("solo", 2) });
  check("개인전 2명은 대각선", Math.abs(s2.players[0].x - s2.players[1].x) === 14 && Math.abs(s2.players[0].z - s2.players[1].z) === 12);
}
{
  const play = (seed) => {
    const e = new WbEngine({ seed, lootSeed: seed + 1, mode: "solo", teams: WbRosterPlanner.allBots("solo", 4) });
    e.players.forEach((p) => e.attach(p.index, new WbBotBrain(p.index, "normal", seed)));
    let hash = 0;
    while (!e.ended && e.tick < 2400) { e.step(); for (const p of e.players) hash = (hash * 31 + Math.round(p.x * 1000) + Math.round(p.z * 7000)) >>> 0; }
    return hash + ":" + e.balloons.length + ":" + e.tick;
  };
  check("같은 시드·같은 입력이면 같은 판", play(11) === play(11));
  const e = new WbEngine({ seed: 3, lootSeed: 4, mode: "team", teams: WbRosterPlanner.allBots("team", 4) });
  e.players.forEach((p) => e.attach(p.index, new WbBotBrain(p.index, "hard", 3)));
  for (let k = 0; k < 1500; k++) e.step();
  const ok = e.players.every((p) => { const s = WbSnapshotCodec.encodePlayer(p, e); const q = new WbPlayer(p.index, p.id, p.nick, p.bot, p.team); WbSnapshotCodec.applyPlayer(q, s, e.tick); return WbSnapshotCodec.encodePlayer(q, e) === s; });
  check("스냅샷 왕복", ok);
  const board = WbSnapshotCodec.encodeBoard(e), back = WbSnapshotCodec.decodeBoard(board);
  check("board 왕복(칸·바닥 아이템·풍선)", back.cells.join("") === Array.from(e.grid.cells).join("") && back.items.length === e.floor.size && back.balloons.length === e.balloons.length);
  const hiddenKinds = Array.from(e.hidden.keys());
  check("board 에 상자 속 내용이 없음", hiddenKinds.length > 0 && hiddenKinds.every((k) => !back.items.some((it) => it.cell === k)));
  const guest = new WbEngine({ seed: 3, lootSeed: null, mode: "team", teams: WbRosterPlanner.allBots("team", 4) });
  const host = new WbEngine({ seed: 3, lootSeed: 4, mode: "team", teams: WbRosterPlanner.allBots("team", 4) });
  check("손님(상자 속 없이)과 방장의 상자 자리가 같음", guest.hidden.size === 0 && Array.from(guest.grid.cells).join("") === Array.from(host.grid.cells).join(""));
}

{
  const { e } = arena("team", 4);
  const [a, ally] = e.players.filter((p) => p.team === e.players[0].team);
  e.players.forEach((p) => put(p, 12, 12 - p.index * 2));
  put(a, 4, 4);
  e.wetUntil[a.cell] = e.tick + 15; e.wetOwner[a.cell] = ally.index;
  run(e, 1);
  check("팀전: 아군 물줄기에도 갇힘(가둔 수는 안 셈)", a.life === "trapped" && ally.traps === 0);
  a.trapUntil = e.tick + 1; run(e, 2);
  check("아군 풍선에 갇혀 탈락하면 처치 없음", a.life === "out" && ally.kills === 0 && a.selfKills === 0);
  const { e: g } = arena();
  const [b, c] = g.players;
  put(b, 4, 4); put(c, 10, 10);
  b.life = "trapped"; b.trapUntil = g.tick + 100;
  g.floor.set(b.cell, { kind: "shoe", grade: 0, tick: -1 });
  run(g, 1);
  check("갇힌 동안 아이템을 못 주움", g.floor.has(b.cell) && b.shoe === 0);
  c.x = 6.0 + 0.04; c.z = 6.5; g.floor.set(WbGrid.index(5, 6), { kind: "shoe", grade: 0, tick: -1 });
  run(g, 1);
  check("아이템 줍기: 몸이 칸에 0.3칸 이상 걸치면 주움", c.shoe === 1);
  c.x = 6.0 + 0.06 + 0.5; g.floor.set(WbGrid.index(5, 6), { kind: "shoe", grade: 0, tick: -1 });
  c.x = 6.07; run(g, 1);
  check("0.3칸 미만으로 걸치면 안 주움", g.floor.has(WbGrid.index(5, 6)));
}

console.log(failures.length ? failures.map((f) => "FAIL " + f).join("\n") : "");
console.log((failures.length ? "UNIT CHECKS FAILED " : "ALL UNIT CHECKS PASSED ") + "(" + passed + " passed, " + failures.length + " failed)");
process.exitCode = failures.length ? 1 : 0;
