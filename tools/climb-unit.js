// 42번 타워 클라임: 규칙 엔진 단위 검사. 실행: node tools/climb-unit.js
const K = require("./climb-load.js")();
const { ClimbBalance: B, ClimbRules, TowerLevel, StageProgress, TowerLevelData, LaunchCannon } = K;

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
  const r = world([box("wall", 2, 0, 2.4, 2, 4, { depth: 2.4 })], { x: 0.5, y: 0, z: 0, yaw: 0 });
  settle(r);
  r.steer(1, 0);
  run(r, 0.4);
  check("벽에 막힘", near(r.body.x, 1 - B.RADIUS, 0.01), r.body.x);
  r.steer(0, 0);
  r.pressGrab();
  const ev = run(r, 0.1);
  check("모서리 잡기(2.4m 위)", r.body.hanging && ev.some((e) => e.t === "grab" && e.ledge));
  const evMid = run(r, 0.6);
  check("0.4초 뒤 기어오르기 시작(바로 순간이동하지 않음)", evMid.some((e) => e.t === "climbUp") && r.body.mode === "climbUp" && r.body.y > 0.4 && r.body.y < 2.6, { y: r.body.y, mode: r.body.mode });
  const ev2 = run(r, 0.4);
  check("기어오른 뒤 위에 섬", ev2.some((e) => e.t === "mantle") && r.body.grounded && near(r.body.y, 2.4, 1e-6) && r.body.ground.id === "wall", { y: r.body.y });
  const r2 = world([box("wall", 2, 0, 2.8, 2, 4, { depth: 2.8 })], { x: 0.6, y: 0, z: 0, yaw: 0 });
  settle(r2);
  r2.pressGrab();
  run(r2, 0.1);
  check("너무 높은 모서리(2.8m)는 서서 못 잡음", !r2.body.hanging);
  r2.pressJump();
  run(r2, 0.15);
  r2.pressGrab();
  run(r2, 0.05);
  check("점프 중에는 잡음", r2.body.hanging);
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
  r.pressGrab();
  run(r, 0.05);
  check("손잡이 잡기", r.body.hanging && r.body.spot.piece.id === "h0");
  check("매달린 자리는 벽 밖", near(r.body.x, 2 + B.RADIUS, 1e-6) && near(r.body.y, 2.2 - B.HANG_DROP, 1e-6), { x: r.body.x, y: r.body.y });
  for (let i = 0; i < 3; i++) { r.pressJump(); run(r, 0.3); }
  check("손잡이 이어 오르기(간격 1.5·1.6)", r.body.hanging && r.body.spot.piece.id === "h3", r.body.spot.piece && r.body.spot.piece.id);
  run(r, 30);
  check("매달림에는 시간 제한 없음", r.body.hanging);
  r.pressGrab();
  const ev = run(r, 0.05);
  check("E 로 놓기", !r.body.hanging && ev.some((e) => e.t === "release"));
  run(r, 0.2);
  r.pressGrab();
  run(r, 0.3);
  check("떨어지다 다시 잡기", r.body.hanging, r.body.y);
  const far = holds([1.7]);
  settle(far);
  far.pressGrab();
  run(far, 0.05);
  far.pressJump();
  run(far, 0.3);
  check("간격 1.7m 는 이어 잡지 못함", !far.body.hanging);
  const side = world([{ id: "trunk", kind: "static", stage: 1, x: 0, y: 30, z: 0, radius: 2, depth: 30, noLedge: true },
    { id: "a", kind: "hold", stage: 1, x: 2, y: 2.2, z: 0, radius: 0.2, yaw: Math.PI / 2 }, { id: "b", kind: "hold", stage: 1, x: 1.8, y: 2.4, z: 0.9, radius: 0.2, yaw: Math.PI / 2 }], { x: 2.5, y: 0, z: 0, yaw: 0 });
  settle(side);
  side.pressGrab();
  run(side, 0.05);
  side.steer(0, 1);
  run(side, 0.3);
  check("매달린 채 옆 손잡이로 옮겨 잡기", side.body.hanging && side.body.spot.piece.id === "b");
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
  const fire = (power) => {
    const r = world([{ id: "c", kind: "cannon", stage: 1, x: 0, y: 1, z: 0, radius: 1.3, depth: 1, yaw: 0 }], { x: 0, y: 1, z: 0, yaw: 0 });
    let top = 0, launched = null, atTwelve = null;
    run(r, 4, (i) => {
      if (power < 1 && launched === null && r.chargeFill >= power - 1e-9) r.pressJump();
      top = Math.max(top, r.body.y);
      if (r.body.flight && atTwelve === null && r.body.vy < 0 && r.body.y <= 13) atTwelve = r.body.z;
    }).forEach((e) => { if (e.t === "launch" && launched === null) launched = e.power; });
    const ev = r.cannonMisses;
    return { top: top - 1, launched, atTwelve, misses: ev };
  };
  const full = fire(1);
  check("발사대: 기다리면 0.8초 뒤 100% 자동 발사", full.launched === 1, full.launched);
  check("발사대 100%: 정점 약 13m", near(full.top, 27 * 27 / 56, 0.15), full.top);
  check("발사대 100%: +12m 지점이 앞쪽 약 8m", near(full.atTwelve, 8.02, 0.15), full.atTwelve);
  const weak = fire(0.6), early = fire(0.2);
  check("발사대 60%: 정점이 낮아 +12m 에 못 미침", weak.top < 12 && near(weak.top, LaunchCannon.launchUp(0.6) ** 2 / 56, 0.15), weak.top);
  check("발사대: 너무 일찍 눌러도 최소 60% 힘", near(early.launched, 0.6, 1e-9), early.launched);
  check("발사대: 낮은 곳에 내리면 실패로 셈", weak.misses === 1, weak.misses);
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
  check("허브에서는 게이지가 줄지 않음(계속 가득)", r.time.active && near(r.time.scale, 0.3, 1e-9) && r.time.gauge > 3.9, r.time.gauge);
  const air = world([box("p", 0, 0, 5, 3, 3)], { x: 0, y: 5, z: 0, yaw: 0 });
  air.holdSlow(true);
  let slowTicks = 0, minScale = 1;
  for (let i = 0; i < 120 * 5; i++) { air.advance(B.TICK); if (air.time.active) slowTicks++; minScale = Math.min(minScale, air.time.scale); }
  check("슬로 게이지 4초치", near(slowTicks * B.TICK, 4, 0.02), slowTicks * B.TICK);
  check("슬로 최저 배율 0.3", near(minScale, 0.3, 1e-9), minScale);
  air.holdSlow(false);
  for (let i = 0; i < 120 * 8; i++) air.advance(B.TICK);
  check("슬로 게이지 회복 8초", near(air.time.gauge, 4, 0.02), air.time.gauge);
}
{
  const p = new StageProgress(0);
  const level = new TowerLevel(TowerLevelData.spec());
  check("포탈 2: 스테이지 1 클리어 전에는 잠김", !p.portalOpen(2, level));
  check("스테이지 1 클리어 → 포탈 2 열림", p.clear(1) && p.portalOpen(2, level));
  check("포탈 3: 스테이지 2 클리어 전에는 잠김", !p.unlocked(3));
  p.clear(2);
  check("포탈 3: 풀렸어도 스테이지가 없으면(공사 중) 안 열림", p.unlocked(3) && !p.portalOpen(3, level));
  check("이미 깬 스테이지는 다시 세지 않음", !p.clear(1) && p.cleared === 2);
  check("포탈은 6개(스테이지 2~7)", level.portals.length === 6 && level.portals.map((x) => x.stage).join("") === "234567");
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
  check("실제 탑: 스테이지 2 시작 쉼터 있음, 3 은 없음", level.hasStage(2) && !level.hasStage(3));
  check("실제 탑: 시작 지점이 포탈 밖", level.portals.every((p) => Math.hypot(p.x - level.spawn.x, p.z - level.spawn.z) > B.PORTAL_RADIUS + 2));
  check("높이별 스테이지", level.stageAt(0).index === 1 && level.stageAt(29.9).index === 1 && level.stageAt(30).index === 2 && level.stageAt(-5).index === 0);
}

console.log("climb-unit: 통과 " + passed + ", 실패 " + failures.length);
failures.forEach((f) => console.log("  실패: " + f));
process.exit(failures.length ? 1 : 0);
