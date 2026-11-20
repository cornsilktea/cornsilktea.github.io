// 42번 타워 클라임: 규칙 엔진 단위 검사. 실행: node tools/climb-unit.js
const K = require("./climb-load.js")();
const { ClimbBalance: B, ClimbRules, TowerLevel, StageProgress, TowerLevelData, ClimbWallAxes } = K;

let passed = 0;
const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
function near(a, b, eps) { return Math.abs(a - b) <= eps; }

const STAGES = TowerLevelData.spec().stages;
function world(pieces, spawn = { x: 0, y: 0, z: 0, yaw: 0 }, cleared = 0) {
  const hub = { id: "hub", kind: "hub", stage: 0, x: 0, y: 0, z: 0, radius: 60, depth: 3 };
  const level = new TowerLevel({ stages: STAGES, pieces: [hub, ...pieces], portals: [{ stage: 2, x: 30, y: 0, z: 0, yaw: 0 }, { stage: 3, x: 30, y: 0, z: 5, yaw: 0 }], routes: [], spawn });
  return new ClimbRules(level, new StageProgress(cleared));
}
function run(rules, seconds, each) {
  const all = [], ticks = Math.round(seconds / B.TICK);
  for (let i = 0; i < ticks; i++) { if (each) each(i); all.push(...rules.advance(B.TICK).map((e) => ({ ...e }))); }
  return all;
}
function settle(rules) { run(rules, 0.2); }
function box(id, x, z, y, sx, sz, more = {}) { return { id, kind: "static", stage: 1, x, y, z, sx, sz, ...more }; }

{
  const r = world([]);
  settle(r);
  r.steer(1, 0);
  run(r, 1);
  check("달리기 속도 7 m/s", near(r.body.speed, 7, 1e-6), r.body.speed);
  r.steer(0, 0);
  run(r, 0.05 + B.TICK);
  check("입력을 놓으면 0.05초 안에 멈춤", r.body.speed === 0, r.body.speed);
}
{
  const r = world([]);
  settle(r);
  let top = 0, air = 0;
  r.pressJump();
  run(r, 1.2, () => { top = Math.max(top, r.body.y); if (!r.body.grounded) air++; });
  check("점프 높이 약 1.61m", near(top, 1.61, 0.05), top);
  check("체공 약 0.68초", near(air * B.TICK, 0.68, 0.03), air * B.TICK);
}
{
  const r = world([]);
  settle(r);
  r.steer(1, 0);
  run(r, 1);
  const from = r.body.x;
  r.pressJump();
  run(r, B.TICK * 2);
  let landedAt = null;
  run(r, 1, () => { if (landedAt === null && r.body.grounded) landedAt = r.body.x; });
  check("점프 수평 거리 약 4.75m", landedAt !== null && near(landedAt - from, 4.75, 0.2), landedAt - from);
}
{
  const edgeTest = (delay) => {
    const r = world([box("p", 0, 0, 5, 4, 4)], { x: 0, y: 5, z: 0, yaw: 0 });
    settle(r);
    r.steer(1, 0);
    let left = -1, jumped = false;
    run(r, 1.2, (i) => {
      if (left < 0 && !r.body.grounded && i > 5) left = i;
      if (left >= 0 && i === left + Math.round(delay / B.TICK)) r.pressJump();
    }).forEach((e) => { if (e.t === "jump") jumped = true; });
    return jumped;
  };
  check("코요테 시간 안(0.08초)에는 점프됨", edgeTest(0.08) === true);
  check("코요테 시간 뒤(0.2초)에는 점프 안 됨", edgeTest(0.2) === false);
}
{
  const bufferTest = (before) => {
    const r = world([], { x: 0, y: 3, z: 0, yaw: 0 });
    const fall = Math.sqrt(2 * 3 / B.GRAVITY), pressAt = Math.round((fall - before) / B.TICK);
    let jumped = false;
    run(r, 1, (i) => { if (i === pressAt) r.pressJump(); }).forEach((e) => { if (e.t === "jump") jumped = true; });
    return jumped;
  };
  check("점프 예약: 착지 0.1초 전 입력은 실행", bufferTest(0.1) === true);
  check("점프 예약: 착지 0.3초 전 입력은 버림", bufferTest(0.3) === false);
}
{
  const slope = (rise) => {
    const r = world([{ id: "s", kind: "slope", stage: 1, x: 0, y: 6, z: 0, sx: 6, sz: 3, rise, depth: 0.5 }], { x: 0, y: 6.2, z: 0, yaw: 0 });
    run(r, 0.6);
    const x = r.body.x;
    run(r, 0.6);
    return { moved: Math.abs(r.body.x - x), sliding: r.body.sliding, grounded: r.body.grounded };
  };
  const gentle = slope(2.8), steep = slope(6);
  check("25도 경사에서는 서 있음", gentle.moved < 1e-6 && gentle.grounded, gentle);
  check("45도 경사에서는 미끄러짐", steep.moved > 0.5, steep);
  const r = world([{ id: "s", kind: "slope", stage: 1, x: 0, y: 6, z: 0, sx: 6, sz: 3, rise: 2.8, depth: 0.5 }], { x: -2.5, y: 4.7, z: 0, yaw: 0 });
  settle(r);
  r.steer(1, 0);
  run(r, 0.6);
  check("경사를 걸어 올라감", r.body.grounded && r.body.y > 5.8, r.body.y);
}
{
  const r = world([box("low", 2, 0, 1.8, 2, 4, { depth: 1.8 })], { x: 0.5, y: 0, z: 0, yaw: 0 });
  settle(r);
  r.steer(1, 0);
  run(r, 0.4);
  r.steer(0, 0);
  r.pressJump();
  let lowest = Infinity;
  run(r, 1, () => { if (r.body.hanging) lowest = Math.min(lowest, r.body.y); });
  check("땅 바로 위 낮은 턱에 매달려도 몸이 땅 아래로 안 내려감", lowest < Infinity && lowest >= -1e-6, { lowest, mode: r.body.mode });
}
{
  const r = world([box("wall", 2, 0, 2.4, 2, 4, { depth: 2.4 })], { x: 0.5, y: 0, z: 0, yaw: 0 });
  settle(r);
  r.steer(1, 0);
  run(r, 0.4);
  check("벽에 막힘", near(r.body.x, 1 - B.RADIUS, 0.01), r.body.x);
  r.steer(0, 0);
  run(r, 1);
  check("서 있으면 저절로 잡지 않음", !r.body.hanging && r.body.grounded);
  r.pressJump();
  const ev = run(r, 0.3);
  check("점프하면 모서리를 저절로 잡음(2.4m 위)", r.body.hanging && ev.some((e) => e.t === "grab" && e.ledge));
  run(r, 1);
  check("가만히 있으면 계속 매달림(저절로 안 올라감)", r.body.hanging, r.body.mode);
  r.pressJump();
  const evMid = run(r, 0.3);
  check("점프를 누르면 기어오르기 시작(바로 순간이동하지 않음)", evMid.some((e) => e.t === "climbUp") && r.body.mode === "climbUp" && r.body.y > 0.4 && r.body.y < 2.6, { y: r.body.y, mode: r.body.mode });
  const ev2 = run(r, 0.4);
  check("기어오른 뒤 위에 섬", ev2.some((e) => e.t === "mantle") && r.body.grounded && near(r.body.y, 2.4, 1e-6) && r.body.ground.id === "wall", { y: r.body.y });
  const r2 = world([box("wall", 2, 0, 2.8, 2, 4, { depth: 2.8 })], { x: 0.6, y: 0, z: 0, yaw: 0 });
  settle(r2);
  r2.pressJump();
  run(r2, 0.4);
  check("점프하면 2.8m 모서리도 잡음", r2.body.hanging);
  r2.steer(1, 0);
  const evPush = run(r2, 0.9, () => { if (r2.body.grounded) r2.steer(0, 0); });
  check("벽 쪽(W)으로 밀면 기어올라 섬", evPush.some((e) => e.t === "mantle") && r2.body.grounded && near(r2.body.y, 2.8, 1e-6), { y: r2.body.y, mode: r2.body.mode });
  const r3 = world([box("wall", 2, 0, 2.8, 2, 4, { depth: 2.8 })], { x: 0.6, y: 0, z: 0, yaw: 0 });
  settle(r3);
  r3.pressJump();
  run(r3, 0.4);
  r3.steer(-1, 0);
  const evLet = run(r3, 0.1);
  r3.steer(0, 0);
  run(r3, 1);
  check("벽 반대쪽(S)으로 당기면 손을 놓고, 떨어지는 동안 같은 모서리를 다시 잡지 않음", evLet.some((e) => e.t === "release") && r3.body.grounded && !r3.body.hanging, r3.body.mode);
  const viewFrom = (yaw) => ({ rightX: Math.cos(yaw), rightZ: -Math.sin(yaw), forwardX: -Math.sin(yaw), forwardZ: -Math.cos(yaw) });
  const views = { "뒤에서": viewFrom(-Math.PI / 2), "옆에서": viewFrom(0), "반대 옆에서": viewFrom(Math.PI), "앞에서": viewFrom(Math.PI / 2) };
  for (const [label, view] of Object.entries(views)) {
    const hangOn = () => { const h = world([box("wall", 2, 0, 2.8, 2, 4, { depth: 2.8 })], { x: 0.6, y: 0, z: 0, yaw: 0 }); settle(h); h.pressJump(); run(h, 0.4); return h; };
    const up = hangOn();
    up.steerStick(0, 1, view);
    const evUp = run(up, 0.9, () => { if (up.body.grounded) up.steerStick(0, 0, view); else up.steerStick(0, 1, view); });
    check("매달린 채 " + label + " 보아도 W 로 기어오름", evUp.some((e) => e.t === "mantle") && up.body.grounded && near(up.body.y, 2.8, 1e-6), { y: up.body.y, mode: up.body.mode });
    const down = hangOn();
    const evDown = run(down, 0.1, () => down.steerStick(0, -1, view));
    check("매달린 채 " + label + " 보아도 S 로 손을 놓음", evDown.some((e) => e.t === "release"), down.body.mode);
    const still = hangOn();
    run(still, 0.6, () => still.steerStick(1, 0, view));
    check("매달린 채 " + label + " 보며 옆(D)을 눌러도 손을 놓거나 오르지 않음", still.body.hanging, still.body.mode);
  }
  const spot = { nx: -1, nz: 0 };
  const behind = ClimbWallAxes.of(spot, views["뒤에서"]);
  check("벽 기준 축: 뒤에서 보면 D 는 화면 오른쪽", near(behind.rightX, views["뒤에서"].rightX, 1e-9) && near(behind.rightZ, views["뒤에서"].rightZ, 1e-9), behind);
  const front = ClimbWallAxes.of(spot, views["앞에서"]);
  check("벽 기준 축: 앞에서 보면 D 도 화면 오른쪽(거울)", near(front.rightX, views["앞에서"].rightX, 1e-9) && near(front.rightZ, views["앞에서"].rightZ, 1e-9) && near(front.forwardX, 1, 1e-9), front);
  const low = world([box("step", 2, 0, 1.2, 2, 4, { depth: 1.2 })], { x: 0.6, y: 0, z: 0, yaw: Math.PI / 2 });
  settle(low);
  low.steer(1, 0);
  low.pressJump();
  run(low, 1, () => { if (low.body.grounded && low.body.y > 1) low.steer(0, 0); });
  check("점프로 넘을 수 있는 1.2m 발판은 잡지 않고 올라섬", low.body.grounded && near(low.body.y, 1.2, 1e-6) && !low.body.hanging, { y: low.body.y, mode: low.body.mode });
}
{
  const airAt = (pieces, yaw) => { const r = world(pieces); r.body.place(0, 3, 0); r.body.grounded = false; r.body.yaw = yaw; return r; };
  const front = box("front", 1.9, 0, 5, 2, 2, { depth: 5 }), back = box("back", -1.6, 0, 5, 2, 2, { depth: 5 });
  const both = airAt([front, back], Math.PI / 2);
  run(both, B.TICK);
  check("공중 자동 잡기: 보는 방향 지형을 먼저(뒤가 더 가까워도)", both.body.hanging && both.body.spot.piece.id === "front", both.body.spot.piece && both.body.spot.piece.id);
  const onlyBack = airAt([back], Math.PI / 2);
  run(onlyBack, B.TICK);
  check("공중 자동 잡기: 보는 방향에 없으면 뒤쪽을 잡고 그쪽으로 몸을 돌림", onlyBack.body.hanging && onlyBack.body.spot.piece.id === "back" && near(Math.sin(onlyBack.body.yaw), -1, 1e-6), onlyBack.body.yaw);
  const far = airAt([box("far", 2.3, 0, 5, 2, 2, { depth: 5 })], Math.PI / 2);
  run(far, B.TICK);
  check("공중 자동 잡기는 1.3m 떨어진 모서리도 잡음", far.body.hanging);
  const away = airAt([back], Math.PI / 2);
  away.steer(1, 0);
  run(away, B.TICK);
  check("멀어지는 쪽으로 움직이면 잡지 않음", !away.body.hanging);
}
{
  const holds = (gaps) => {
    let y = 2.2;
    const list = [{ id: "trunk", kind: "static", stage: 1, x: 0, y: 30, z: 0, radius: 2, depth: 30, noLedge: true }, { id: "h0", kind: "hold", stage: 1, x: 2, y, z: 0, radius: 0.2, yaw: Math.PI / 2 }];
    gaps.forEach((g, i) => { y += g; list.push({ id: "h" + (i + 1), kind: "hold", stage: 1, x: 2, y, z: 0, radius: 0.2, yaw: Math.PI / 2 }); });
    return world(list, { x: 2.5, y: 0, z: 0, yaw: 0 });
  };
  const r = holds([1.5, 1.6, 1.5]);
  settle(r);
  r.pressJump();
  run(r, 0.3);
  check("점프하면 손잡이를 저절로 잡음", r.body.hanging && r.body.spot.piece.id === "h0");
  check("매달린 자리는 벽 밖", near(r.body.x, 2 + B.RADIUS, 1e-6) && near(r.body.y, 2.2 - B.HANG_DROP, 1e-6), { x: r.body.x, y: r.body.y });
  for (let i = 0; i < 3; i++) { r.pressJump(); run(r, 0.3); }
  check("손잡이 이어 오르기(간격 1.5·1.6)", r.body.hanging && r.body.spot.piece.id === "h3", r.body.spot.piece && r.body.spot.piece.id);
  run(r, 30);
  check("매달림에는 시간 제한 없음", r.body.hanging);
  r.steer(1, 0);
  const ev = run(r, 0.05);
  r.steer(0, 0);
  check("S(바깥쪽)로 놓기", !r.body.hanging && ev.some((e) => e.t === "release"));
  run(r, 0.6);
  check("떨어지다 아래 손잡이를 저절로 다시 잡음", r.body.hanging && r.body.spot.piece.id !== "h3", r.body.spot.piece && r.body.spot.piece.id);
  const side = world([{ id: "trunk", kind: "static", stage: 1, x: 0, y: 30, z: 0, radius: 2, depth: 30, noLedge: true },
    { id: "a", kind: "hold", stage: 1, x: 2, y: 2.2, z: 0, radius: 0.2, yaw: Math.PI / 2 }, { id: "b", kind: "hold", stage: 1, x: 1.8, y: 2.4, z: 0.9, radius: 0.2, yaw: Math.PI / 2 }], { x: 2.5, y: 0, z: 0, yaw: 0 });
  settle(side);
  side.pressJump();
  run(side, 0.3);
  side.steer(0, 1);
  run(side, 0.3);
  check("매달린 채 옆 손잡이로 옮겨 잡기", side.body.hanging && side.body.spot.piece.id === "b", side.body.spot.piece && side.body.spot.piece.id);
}
{
  const r = world([{ id: "pad", kind: "pad", stage: 1, x: 3, y: 0.2, z: 0, radius: 1, depth: 0.2 }]);
  settle(r);
  r.steer(1, 0);
  let top = 0;
  const ev = run(r, 2, () => { top = Math.max(top, r.body.y); if (r.body.x > 3) r.steer(0, 0); });
  check("작은 점프대 높이 약 4m", ev.some((e) => e.t === "pad") && near(top - 0.2, 4.02, 0.1), top);
}
{
  const spec = TowerLevelData.spec();
  check("발사대가 없음(종류·발판 모두)", !spec.pieces.some((p) => p.kind === "cannon" || p.look === "cannon"));
  check("스테이지 1~3 은 길이 두 개씩", [1, 2, 3].every((stage) => spec.routes.filter((r) => r.stage === stage).length === 2));
}
{
  const path = (slow) => {
    const r = world([]);
    const trace = [];
    r.holdSlow(slow);
    const step = r.step.bind(r);
    let tick = 0;
    r.step = () => {
      if (tick === 0) r.steer(1, 0.3);
      if (tick === 5) r.pressJump();
      step();
      trace.push(r.body.x.toFixed(9) + "/" + r.body.y.toFixed(9));
      tick++;
    };
    for (let i = 0; i < 4000 && trace.length < 240; i++) r.advance(B.TICK);
    return trace.slice(0, 240).join(" ");
  };
  const normalPath = path(false);
  check("슬로 모션: 같은 입력이면 같은 궤적", normalPath.length > 1000 && normalPath === path(true));
  const r = world([]);
  r.holdSlow(true);
  for (let i = 0; i < 120 * 6; i++) r.advance(B.TICK);
  check("슬로는 누르는 동안 끝없이 유지(6초)", r.time.active && near(r.time.scale, 0.3, 1e-9), r.time.scale);
  r.holdSlow(false);
  for (let i = 0; i < 120; i++) r.advance(B.TICK);
  check("슬로를 놓으면 원래 속도", !r.time.active && near(r.time.scale, 1, 1e-9), r.time.scale);
}
{
  const p = new StageProgress(0), practice = new K.ClimbPracticeMode();
  const level = new TowerLevel(TowerLevelData.spec());
  check("포탈 2: 스테이지 1 클리어 전에는 잠김", !p.portalOpen(2, level, practice));
  check("스테이지 1 클리어 → 포탈 2 열림", p.clear(1) && p.portalOpen(2, level, practice));
  check("포탈 3: 스테이지 2 클리어 전에는 잠김", !p.unlocked(3));
  p.clear(2);
  check("포탈 3: 스테이지 2 클리어 → 열림", p.unlocked(3) && p.portalOpen(3, level, practice));
  check("포탈 4: 스테이지 3 클리어 전에는 잠김", !p.unlocked(4) && !p.portalOpen(4, level, practice));
  p.clear(3);
  check("포탈 4: 스테이지 3 클리어 → 열림", p.unlocked(4) && p.portalOpen(4, level, practice));
  check("포탈 5: 스테이지 4 클리어 전에는 잠김", !p.unlocked(5) && !p.portalOpen(5, level, practice));
  p.clear(4);
  check("포탈 5: 스테이지 4 클리어 → 열림", p.unlocked(5) && p.portalOpen(5, level, practice));
  p.clear(5);
  check("포탈 6: 스테이지 5 클리어 → 열림", p.unlocked(6) && p.portalOpen(6, level, practice));
  p.clear(6);
  check("포탈 7: 스테이지 6 클리어 → 열림", p.unlocked(7) && p.portalOpen(7, level, practice));
  check("이미 깬 스테이지는 다시 세지 않음", !p.clear(1) && p.cleared === 6);
  const stagePortals = level.portals.filter((x) => (x.kind || "stage") === "stage");
  check("스테이지 포탈은 6개(스테이지 2~7)", stagePortals.length === 6 && stagePortals.map((x) => x.stage).join("") === "234567");
  check("스피드런 포탈은 1개", level.portals.filter((x) => x.kind === "speedrun").length === 1);
  check("스피드런 중에는 열린 스테이지 포탈도 닫힘", !p.portalOpen(2, level, new K.ClimbSpeedrunMode(0)) && p.portalOpen(2, level, practice));
}
{
  const rest = { id: "rest2", kind: "rest", stage: 1, x: 0, y: 30, z: 0, radius: 4, depth: 0.5, startOf: 2 };
  const r = world([rest], { x: 29, y: 0, z: 0, yaw: 0 });
  settle(r);
  check("잠긴 포탈은 들어가도 그대로", r.body.mode === "free" && r.body.y === 0);
  const open = world([rest], { x: 0, y: 30, z: 0, yaw: 0 });
  const ev = run(open, 0.2);
  check("스테이지 시작 쉼터에 닿으면 클리어", ev.some((e) => e.t === "stageClear" && e.stage === 1) && open.progress.cleared === 1);
  const back = world([rest], { x: 29.5, y: 0, z: 0, yaw: 0 }, 1);
  const ev2 = run(back, 2.2);
  check("열린 포탈 → 1.5초 뒤 스테이지 시작 쉼터", ev2.some((e) => e.t === "portalEnter") && ev2.some((e) => e.t === "portalArrive" && e.stage === 2) && back.body.grounded && back.body.ground.id === "rest2" && back.portalsUsed === 1, { y: back.body.y });
  check("포탈 도착은 추락으로 세지 않음", back.falls === 0);
}
{
  const r = world([box("p", 0, 0, 12, 3, 3)], { x: 0, y: 12, z: 0, yaw: 0 });
  settle(r);
  r.steer(1, 0);
  const ev = run(r, 0.5);
  r.steer(0, 0);
  ev.push(...run(r, 2));
  check("12m 에서 떨어지면 허브 도착 + 추락 1회", ev.some((e) => e.t === "fellHome") && r.falls === 1 && r.body.y === 0);
  check("일어난 뒤 바로 플레이", r.body.mode === "free");
  check("최고 높이는 남음", near(r.peak, 12, 1e-6), r.peak);
  const low = world([box("p", 0, 0, 3, 3, 3)], { x: 0, y: 3, z: 0, yaw: 0 });
  settle(low);
  low.steer(1, 0);
  run(low, 1.5);
  check("낮은 곳(3m)에서 내려오는 것은 추락이 아님", low.falls === 0);
  const out = world([], { x: 0, y: 0, z: 0, yaw: 0 });
  out.body.place(80, 0, 0);
  const ev3 = run(out, 3);
  check("바깥으로 떨어지면(-20m) 시작 지점으로", ev3.some((e) => e.t === "voidReturn") && Math.hypot(out.body.x, out.body.z) < 1 && out.body.grounded);
}
{
  const level = new TowerLevel(TowerLevelData.spec());
  const r = new ClimbRules(level, new StageProgress(0));
  r.body.place(0, 30, 0);
  run(r, 0.2);
  r.steer(1, 0.2);
  const ev = run(r, 6);
  check("실제 탑: 30m 쉼터에서 뛰어내리면 끝까지 떨어져 허브", r.body.grounded && (r.body.ground.id === "hub" || r.body.y < 30), { y: r.body.y, on: r.body.ground && r.body.ground.id });
  check("실제 탑: 스테이지 2~7 시작 쉼터 있음", [2, 3, 4, 5, 6, 7].every((n) => level.hasStage(n)));
  check("실제 탑: 시작 지점이 포탈 밖", level.portals.every((p) => Math.hypot(p.x - level.spawn.x, p.z - level.spawn.z) > B.PORTAL_RADIUS + 2));
  check("높이별 스테이지", level.stageAt(0).index === 1 && level.stageAt(29.9).index === 1 && level.stageAt(30).index === 2 && level.stageAt(-5).index === 0);
}

{
  const car = { id: "car", kind: "moving", stage: 6, x: 0, y: 5, z: 0, sx: 3.5, sz: 1.6, depth: 1, move: { track: "orbit", group: "t", rho: 10, speed: 3.5, startDeg: 0 } };
  const r = world([car], { x: 0, y: 5.5, z: 10, yaw: 0 });
  settle(r);
  check("움직이는 칸 위에 서면 같이 감", r.body.grounded && r.body.ground.id === "car", r.body.ground && r.body.ground.id);
  const p = r.level.piece("car"), localX = p.localX(r.body.x, r.body.z), localZ = p.localZ(r.body.x, r.body.z);
  run(r, 3);
  const driftX = p.localX(r.body.x, r.body.z) - localX, driftZ = p.localZ(r.body.x, r.body.z) - localZ;
  check("3초 뒤에도 칸 위 같은 자리(칸과 같이 돌아감)", r.body.grounded && r.body.ground === p && Math.hypot(driftX, driftZ) < 0.02, { driftX, driftZ });
  const vx = p.vx, vz = p.vz;
  r.pressJump();
  run(r, B.TICK * 2);
  const fromX = r.body.x, fromZ = r.body.z;
  run(r, 0.3);
  const moved = Math.hypot(r.body.x - fromX, r.body.z - fromZ), expect = Math.hypot(vx, vz) * 0.3;
  check("움직이는 칸에서 뛰면 칸 속도(관성)를 싣고 날아감", !r.body.grounded && near(moved, expect, 0.05), { moved, expect });
  run(r, 1);
  check("제자리 점프는 같은 칸에 다시 내려앉음", r.body.grounded && r.body.ground === p, r.body.ground && r.body.ground.id);
}
{
  const lift = { id: "lift", kind: "moving", stage: 6, x: 0, y: 2, z: 0, sx: 2, sz: 2, depth: 3, move: { track: "lift", group: "l", low: 2, high: 6, period: 4, phase: 0 } };
  const r = world([lift], { x: 0, y: 2.5, z: 0, yaw: 0 });
  settle(r);
  run(r, 2 - 0.2);
  check("승강 상자 위에 서면 같이 올라감(꼭대기 6m)", r.body.grounded && near(r.body.y, 6, 0.05), r.body.y);
  run(r, 2);
  check("내려올 때도 같이 내려옴(바닥 2m)", r.body.grounded && near(r.body.y, 2, 0.05), r.body.y);
}
{
  const lift = { id: "lift", kind: "moving", stage: 6, x: 0, y: 2.2, z: 0, sx: 2, sz: 2, depth: 4, move: { track: "lift", group: "l", low: 2.2, high: 5.6, period: 6, phase: 0 } };
  const r = world([lift], { x: 0, y: 0, z: 2.2, yaw: Math.PI });
  settle(r);
  const p = r.level.piece("lift");
  r.steer(0, -1);
  run(r, B.TICK);
  r.pressJump();
  run(r, B.TICK * 3);
  r.steer(0, 0);
  let hangTicks = 0, worst = 0, rose = 0, lastTop = p.top;
  run(r, 0.8, () => {
    if (!r.body.hanging) return;
    hangTicks++;
    rose += p.top - lastTop;
    worst = Math.max(worst, Math.abs(r.body.spot.y - p.top), Math.abs(r.body.y - (p.top - B.HANG_DROP)));
    lastTop = p.top;
  });
  check("승강 상자 모서리를 저절로 잡음", hangTicks > 0, hangTicks);
  check("매달린 채 같이 올라감(잡은 곳·몸 높이가 상자를 따라감)", worst < 0.06 && rose > 0.1, { worst, rose });
  r.pressJump();
  run(r, 1);
  check("기어오르면 움직이는 상자 위에 섬", r.body.grounded && r.body.ground === p && near(r.body.y, p.top, 1e-6), { mode: r.body.mode, y: r.body.y, top: p.top });
}
{
  const pad = { id: "mp", kind: "movingPad", stage: 6, x: 0, y: 0.3, z: 0, sx: 1.8, sz: 1.8, depth: 0.6, move: { track: "shuttle", group: "s", dirDeg: 90, stroke: 3, speed: 3.5, phase: 0 } };
  const r = world([pad], { x: 0, y: 0.32, z: 0, yaw: 0 });
  let bounced = null;
  run(r, 0.5).forEach((e) => { if (e.t === "pad" && bounced === null) bounced = r.body.driftX; });
  check("움직이는 점프대: 튕기면서 점프대 속도를 실음", bounced !== null && near(bounced, 3.5, 1e-6), bounced);
}
{
  const r = world([box("ice", 0, 0, 5, 40, 40, { kind: "ice", stage: 7 })], { x: 0, y: 5, z: 0, yaw: 0 });
  settle(r);
  r.steer(1, 0);
  run(r, 0.5);
  check("얼음: 0.5초 달려도 최고 속도가 안 됨(가속 8 m/s²)", near(r.body.speed, 4, 0.1), r.body.speed);
  run(r, 1);
  check("얼음: 결국 7 m/s 까지 오름", near(r.body.speed, 7, 1e-6), r.body.speed);
  r.steer(0, 0);
  const from = r.body.x;
  run(r, 2);
  check("얼음: 손을 놓아도 약 4.9m 미끄러진 뒤 멈춤", near(r.body.x - from, 4.9, 0.15) && r.body.speed === 0, { slid: r.body.x - from, speed: r.body.speed });
}
{
  const r = world([box("cr", 0, 0, 5, 4, 4, { kind: "crumble", stage: 7 })], { x: 0, y: 5.01, z: 0, yaw: 0 });
  const piece = r.level.piece("cr");
  let crumbled = null;
  const events = run(r, 0.6);
  check("무너지는 발판: 0.6초 동안은 그대로", piece.solid && r.body.grounded && piece.shaking > 0.5, { solid: piece.solid, shaking: piece.shaking });
  run(r, 0.2).forEach((e) => { if (e.t === "crumble") crumbled = e.piece; });
  check("무너지는 발판: 밟고 0.7초 뒤 무너져 떨어짐", crumbled === "cr" && !piece.solid && !r.body.grounded, { crumbled, solid: piece.solid });
  check("무너지는 발판: 처음 이벤트 전에는 무너짐 없음", !events.some((e) => e.t === "crumble"));
  run(r, 3);
  check("무너지는 발판: 3초 뒤 다시 생김", piece.solid && piece.age < 0, piece.age);
  const again = world([box("cr", 0, 0, 5, 4, 4, { kind: "crumble", stage: 7 })]);
  check("무너지는 발판: 새 판을 시작하면 처음 상태", again.level.piece("cr").solid);
}
{
  const bar = { id: "bar", kind: "sweeper", stage: 7, x: 0, y: 1.05, z: 0, sx: 6, sz: 0.5, depth: 0.55, spin: { rate: 2, phase: 0 } };
  const r = world([bar], { x: 0, y: 0, z: 2, yaw: 0 });
  let knock = null;
  run(r, 1.5).forEach((e) => { if (e.t === "knock" && !knock) knock = { speed: Math.hypot(r.body.vx, r.body.vz) }; });
  check("회전 막대: 서 있으면 지나가는 막대에 맞아 튕겨 나감", knock !== null, knock);
  const sweeper = r.level.piece("bar");
  sweeper.update(0);
  const probe = { x: 2, y: 1.1, z: 0 };
  check("회전 막대: 막대보다 높이 뛰면 안 맞음", !sweeper.hits(probe) && sweeper.hits({ x: 2, y: 0, z: 0 }));
  const push = { x: 2, y: 0, z: 0 };
  check("회전 막대: 막대가 도는 쪽으로 밀어냄", near(sweeper.pushX(push), 0, 1e-9) && near(sweeper.pushZ(push), -1, 1e-9), [sweeper.pushX(push), sweeper.pushZ(push)]);
}
{
  const zone = { id: "wind", kind: "wind", stage: 7, x: 0, y: 5, z: 0, sx: 40, sz: 40, depth: 6, gust: { dirDeg: 90, speed: 3, period: 10, share: 1, phase: 5 } };
  const r = world([zone], { x: 0, y: 0, z: 0, yaw: 0 });
  settle(r);
  const from = r.body.x;
  run(r, 1);
  check("바람: 땅에 서 있으면 바람의 절반(1.5 m/s)만큼 밀림", near(r.body.x - from, 1.5, 0.05), r.body.x - from);
  const gust = r.level.piece("wind");
  check("바람: 돌풍은 켜질 때 0.4초에 걸쳐 세짐", near(gust.strengthAt(-5 + 0.2), 0.5, 1e-6) && gust.strengthAt(-5 + 0.6) === 1, [gust.strengthAt(-4.8), gust.strengthAt(-4.4)]);
}
{
  const r = world([{ id: "top", kind: "summit", stage: 7, x: 0, y: 3, z: 0, radius: 4, depth: 1 }], { x: 0, y: 3.01, z: 0, yaw: 0 }, 6);
  const events = run(r, 0.5);
  check("꼭대기 깃발: 서면 스테이지 7 클리어와 완주 이벤트", events.some((e) => e.t === "stageClear" && e.stage === 7) && events.filter((e) => e.t === "summit").length === 1 && r.progress.cleared === 7, events.map((e) => e.t));
}

{
  const speedLevel = (cleared = 1) => {
    const hub = { id: "hub", kind: "hub", stage: 0, x: 0, y: 0, z: 0, radius: 60, depth: 3 };
    const pieces = [hub,
      { id: "rest2", kind: "rest", stage: 1, x: 0, y: 30, z: 40, radius: 4, depth: 0.5, startOf: 2 },
      { id: "rest3", kind: "rest", stage: 2, x: 0, y: 60, z: 40, radius: 4, depth: 0.5, startOf: 3 },
      { id: "high", kind: "static", stage: 1, x: 20, y: 12, z: 20, sx: 3, sz: 3 },
      { id: "top", kind: "summit", stage: 7, x: 0, y: 200, z: 40, radius: 4, depth: 1 }];
    const portals = [{ kind: "stage", stage: 2, x: 30, y: 0, z: 0, yaw: 0 }, { kind: "speedrun", stage: 0, x: -10, y: 0, z: 0, yaw: 0 }];
    const level = new TowerLevel({ stages: STAGES, pieces, portals, routes: [], spawn: { x: 0, y: 0, z: 0, yaw: 0 } });
    return new ClimbRules(level, new StageProgress(cleared));
  };
  const tickRun = (rules, seconds, log) => { for (let i = 0; i < Math.round(seconds / B.TICK); i++) for (const e of rules.advance(B.TICK)) log.push({ ...e, tick: rules.ticks }); return log; };
  const enterSpeedrun = (rules, log) => { rules.body.place(-10, 0, 0); tickRun(rules, 1.8, log); return log.find((e) => e.t === "speedrunStart"); };

  const r = speedLevel(), log = [];
  settle(r);
  const start = enterSpeedrun(r, log);
  check("스피드런 포탈에 닿으면 그 틱에 speedrunStart, 모드가 스피드런", !!start && r.mode.name === "speedrun" && log.some((e) => e.t === "portalEnter" && e.tick === start.tick), log.map((e) => e.t));
  check("스피드런: 닿은 틱부터 시간이 흐름(입력을 기다리지 않음)", near(r.mode.seconds, (r.ticks - start.tick) * B.TICK, 1e-9), [r.mode.seconds, r.ticks - start.tick]);
  check("스피드런: 하얗게 넘어간 뒤 허브 시작 지점에 섬", log.some((e) => e.t === "hubArrive") && r.body.grounded && Math.hypot(r.body.x, r.body.z) < 1e-6 && r.body.mode === "free");
  check("스피드런 포탈은 포탈 사용으로 세지 않음", r.portalsUsed === 0);

  const blocked = [];
  r.body.place(30, 0, 0);
  tickRun(r, 2, blocked);
  check("스피드런 중에는 열린 스테이지 포탈에 닿아도 이동 안 함", !blocked.some((e) => e.t === "portalEnter") && r.body.mode === "free" && near(r.body.x, 30, 1e-6), blocked.map((e) => e.t));

  const fall = [];
  const before = r.mode.seconds;
  r.body.place(20, 12, 20);
  tickRun(r, 0.2, fall);
  r.steer(1, 0);
  tickRun(r, 0.5, fall);
  r.steer(0, 0);
  tickRun(r, 2, fall);
  check("스피드런: 떨어져 허브로 와도 시간 계속·스피드런 유지", fall.some((e) => e.t === "fellHome") && r.mode.name === "speedrun" && near(r.mode.seconds - before, 2.7, 1e-6), [r.mode.seconds - before, fall.map((e) => e.t)]);

  const splits = [];
  r.body.place(0, 30, 40);
  tickRun(r, 0.5, splits);
  r.body.place(0, 30.01, 40);
  tickRun(r, 0.3, splits);
  r.body.place(0, 60, 40);
  tickRun(r, 0.5, splits);
  const splitEvents = splits.filter((e) => e.t === "split");
  check("스피드런: 쉼터마다 split 한 번씩(다시 서도 안 셈)", splitEvents.length === 2 && splitEvents[0].stage === 1 && splitEvents[1].stage === 2 && splitEvents[0].seconds < splitEvents[1].seconds, splitEvents);

  const finish = [];
  r.body.place(0, 200, 40);
  tickRun(r, 1, finish);
  const done = finish.filter((e) => e.t === "speedrunFinish");
  const doneTick = done.length ? done[0].tick : -1;
  check("스피드런: 꼭대기에서 speedrunFinish 한 번, summit 이벤트는 없음", done.length === 1 && !finish.some((e) => e.t === "summit"), finish.map((e) => e.t));
  check("스피드런: 기록 = 들어간 틱부터 꼭대기 틱까지", done.length === 1 && near(done[0].seconds, (doneTick - start.tick) * B.TICK, 1e-9), done[0] && [done[0].seconds, (doneTick - start.tick) * B.TICK]);
  check("스피드런: 결과에 구간 기록(1·2·7)과 떨어진 횟수", done.length === 1 && done[0].splits.length === 7 && done[0].splits[0] > 0 && done[0].splits[1] > 0 && done[0].splits[6] === done[0].seconds && done[0].splits[3] === 0 && done[0].falls === 1, done[0]);
  const after = r.mode.seconds;
  tickRun(r, 0.5, []);
  check("스피드런: 끝난 뒤에는 시계가 멈춤", r.mode.seconds === after);

  const exit = speedLevel(), exitLog = [];
  settle(exit);
  enterSpeedrun(exit, exitLog);
  exit.body.place(-10, 0, 0);
  tickRun(exit, 1.8, exitLog);
  check("스피드런 포탈을 다시 타면 일반 모드로 돌아오고 기록 이벤트 없음", exit.mode.name === "practice" && exitLog.some((e) => e.t === "speedrunExit") && !exitLog.some((e) => e.t === "speedrunFinish" || e.t === "split") && Math.hypot(exit.body.x, exit.body.z) < 1e-6, exitLog.map((e) => e.t));
  check("나간 뒤에는 스테이지 포탈을 다시 씀", exit.progress.portalOpen(2, exit.level, exit.mode));

  const practice = speedLevel(), plog = [];
  settle(practice);
  practice.body.place(0, 30, 40);
  tickRun(practice, 0.5, plog);
  practice.body.place(0, 200, 40);
  tickRun(practice, 0.5, plog);
  const summit = plog.find((e) => e.t === "summit");
  check("일반 모드: 시간 기록 이벤트가 없음(split·speedrunFinish 없음, summit 에 시간 없음)", !!summit && !plog.some((e) => e.t === "split" || e.t === "speedrunFinish") && summit.seconds === undefined && practice.mode.seconds === 0, plog.map((e) => e.t));

  const again = () => {
    const rules = speedLevel(), out = [];
    settle(rules);
    enterSpeedrun(rules, out);
    rules.steer(0.3, 1);
    tickRun(rules, 1.3, out);
    rules.pressJump();
    tickRun(rules, 1, out);
    return rules.mode.seconds;
  };
  check("같은 입력이면 같은 스피드런 시간", again() === again());

  const slow = speedLevel();
  settle(slow);
  enterSpeedrun(slow, []);
  const slowFrom = slow.mode.seconds, worldFrom = slow.worldTime;
  slow.holdSlow(true);
  for (let i = 0; i < 180; i++) slow.advance(1 / 60);
  check("스피드런 기록은 실제 시간: 슬로를 3초 써도 시계는 약 3초", near(slow.mode.seconds - slowFrom, 3, 0.02), slow.mode.seconds - slowFrom);
  check("슬로 중에는 판 시간이 덜 감(3초 동안 1.5초 미만)", slow.worldTime - worldFrom < 1.5, slow.worldTime - worldFrom);
}

console.log("climb-unit: 통과 " + passed + ", 실패 " + failures.length);
failures.forEach((f) => console.log("  실패: " + f));
process.exit(failures.length ? 1 : 0);
