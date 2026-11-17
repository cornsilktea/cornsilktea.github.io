// 42번 타워 클라임: 도달 검사. 실행: node tools/climb-reach.js [-v]
// 1) 길마다 이웃한 두 발판 사이를 계산으로 분류(걷기·점프·잡기·점프대·발사대)하고 한계 비율을 확인
// 2) 봇이 실제 규칙 엔진으로 슬로 없이 끝까지 가는지 확인
// 3) 발사대는 힘 단계별 결과를 모두 적음   4) 갇히는 발판·길에 없는 발판 확인
const K = require("./climb-load.js")();
const { ClimbBot } = require("./climb-bot.js");
const { ClimbBalance: B, ClimbRules, TowerLevel, StageProgress, TowerLevelData, GrabHold, JumpPad } = K;
const verbose = process.argv.includes("-v");

class ReachReport {
  constructor() { this.passed = 0; this.failures = []; this.lines = []; }
  check(name, ok, detail) { if (ok) this.passed++; else this.failures.push(name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
  note(line) { this.lines.push(line); }
  finish() {
    this.lines.forEach((l) => console.log(l));
    console.log("climb-reach: 통과 " + this.passed + ", 실패 " + this.failures.length);
    this.failures.forEach((f) => console.log("  실패: " + f));
    process.exit(this.failures.length ? 1 : 0);
  }
}

class LinkMeter {
  static readonly;
  constructor() { this.probe = { x: 0, z: 0, nx: 0, nz: 0, dist: 0, inside: false }; }

  outline(piece) {
    const points = [];
    if (piece.round) for (let i = 0; i < 64; i++) points.push([piece.x + piece.radius * Math.cos(i / 64 * 2 * Math.PI), piece.z + piece.radius * Math.sin(i / 64 * 2 * Math.PI)]);
    else for (let i = 0; i <= 16; i++) {
      const t = i / 16 * 2 - 1;
      for (const [lx, lz] of [[t * piece.halfX, piece.halfZ], [t * piece.halfX, -piece.halfZ], [piece.halfX, t * piece.halfZ], [-piece.halfX, t * piece.halfZ]]) points.push([piece.worldX(lx, lz), piece.worldZ(lx, lz)]);
    }
    return points;
  }

  // 두 발판 바닥 모양 사이의 가장 짧은 수평 거리와 그 지점의 높이 차
  gap(a, b) {
    let best = { gap: Infinity, rise: 0 };
    const scan = (from, to, flip) => {
      for (const [px, pz] of this.outline(from)) {
        const edge = to.edge(px, pz, this.probe), d = to.covers(px, pz) ? 0 : edge.dist;
        if (d >= best.gap) continue;
        const fromTop = from.topAt(px, pz), toTop = to.topAt(to.covers(px, pz) ? px : edge.x, to.covers(px, pz) ? pz : edge.z);
        best = { gap: d, rise: flip ? fromTop - toTop : toTop - fromTop };
      }
    };
    scan(a, b, false);
    scan(b, a, true);
    return best;
  }

  static airTime(up, rise) {
    const inside = up * up - 2 * B.GRAVITY * rise;
    return inside < 0 ? 0 : (up + Math.sqrt(inside)) / B.GRAVITY;
  }

  // 점프대 없이 이 발판으로 갈 수 있는가(걷기·모서리 잡기·최대 거리 안의 점프)
  reachable(a, b) {
    const link = this.link(a, b);
    return link.type === "걷기" || link.type === "모서리 잡기" || link.type === "손잡이→모서리" || (link.type === "점프" && link.ratio <= 1);
  }

  link(a, b) {
    const jumpHeight = B.JUMP * B.JUMP / (2 * B.GRAVITY);
    if (a instanceof GrabHold && b instanceof GrabHold) {
      const rise = b.top - a.top, side = Math.hypot(b.x - a.x, b.z - a.z);
      return { type: "손잡이", ok: rise > B.HOP_MIN && rise <= B.HOP_UP && side <= B.HOP_SIDE, rise, gap: side };
    }
    if (b instanceof GrabHold) {
      const rise = b.top - a.top, reach = a.covers(b.x + b.nx * B.RADIUS, b.z + b.nz * B.RADIUS);
      return { type: "잡기", ok: rise >= B.GRAB_LOW && rise <= B.GRAB_HIGH && reach, rise, gap: 0 };
    }
    if (a instanceof GrabHold) {
      const bx = a.x + a.nx * B.RADIUS, bz = a.z + a.nz * B.RADIUS, edge = b.edge(bx, bz, this.probe), rise = b.top - a.top;
      return { type: "손잡이→모서리", ok: b.ledge && !b.covers(bx, bz) && rise > B.HOP_MIN && rise <= B.HOP_UP && edge.dist <= B.HOP_SIDE, rise, gap: edge.dist };
    }
    const { gap, rise } = this.gap(a, b);
    if (a instanceof JumpPad) {
      const time = LinkMeter.airTime(B.PAD_SPEED, rise), high = rise <= B.PAD_SPEED ** 2 / (2 * B.GRAVITY) * 0.92, ratio = time > 0 ? gap / (B.RUN * time * 0.7) : Infinity;
      if (ratio <= 0.6) return { type: "점프대", ok: high, rise, gap, ratio };
      // 멀리뛰기: 점프대에 올라서는 순간(가까운 쪽 가장자리) 튕기므로 점프대 폭만큼 더 날아야 한다
      const flight = time > 0 ? (gap + Math.min(a.halfX, a.halfZ) * 2) / (B.RUN * time) : Infinity;
      return { type: "점프대 멀리뛰기", ok: high && flight <= 0.9, rise, gap, ratio: flight };
    }
    if (gap <= 0.05 && rise <= B.STEP) return { type: "걷기", ok: true, rise, gap };
    if (rise <= jumpHeight * 0.9) {
      const ratio = gap / (B.RUN * LinkMeter.airTime(B.JUMP, rise));
      return { type: "점프", ok: true, rise, gap, ratio };
    }
    if (b.ledge && rise <= B.GRAB_HIGH_AIR + jumpHeight * 0.8 && gap <= 1.6) return { type: "모서리 잡기", ok: true, rise, gap, jump: rise > B.GRAB_HIGH };
    return { type: "불가", ok: false, rise, gap };
  }
}

class RouteInspector {
  constructor(level, report) { this.level = level; this.report = report; this.meter = new LinkMeter(); }

  analyse(route) {
    const pieces = route.steps.map((id) => this.level.piece(id));
    let chain = 0, worstChain = 0, holds = 0, worstRatio = 0, worstAt = "", longJumps = 0;
    for (let i = 1; i < pieces.length; i++) {
      const a = pieces[i - 1], b = pieces[i], link = this.meter.link(a, b), tag = route.name + " " + a.id + "→" + b.id;
      if (verbose) this.report.note("  " + tag.padEnd(26) + link.type.padEnd(9) + " 간격 " + link.gap.toFixed(2) + " 높이 " + link.rise.toFixed(2) + (link.ratio !== undefined ? " 비율 " + link.ratio.toFixed(2) : ""));
      this.report.check(tag + " 이어짐(" + link.type + ")", link.ok, link);
      if (link.type === "점프") {
        this.report.check(tag + " 점프 비율 ≤ " + route.ratioLimit, link.ratio <= route.ratioLimit + 1e-9, link.ratio);
        this.report.check(tag + " 점프 비율 ≤ 0.95", link.ratio <= 0.95, link.ratio);
        if (link.ratio > worstRatio) { worstRatio = link.ratio; worstAt = a.id + "→" + b.id; }
      }
      if (link.type === "점프대 멀리뛰기") {
        longJumps++;
        const later = new Set(route.steps.slice(i + 1));
        const others = this.level.pieces.filter((p) => p.stage === b.stage && p !== a && p !== b && p.solid && !p.id.includes(".") && !/^towerd$/.test(p.id) && !later.has(p.id));
        const shortcut = others.find((p) => this.meter.reachable(p, b));
        this.report.check(tag + " 점프대 없이는 못 감", !shortcut, shortcut && shortcut.id);
      }
      if (b instanceof GrabHold) holds++;
      else { if (holds > 0) this.report.check(route.name + " 손잡이 오르막 4~6개", holds >= 4 && holds <= 6, holds); holds = 0; }
      if (link.type === "점프" || link.type === "모서리 잡기") chain++;
      if (b.rest || b.hub || link.type === "걷기" && a.rest) { worstChain = Math.max(worstChain, chain); if (b.rest || b.hub) chain = 0; }
      worstChain = Math.max(worstChain, chain);
    }
    this.report.check(route.name + " 연속 점프 5회 이하", worstChain <= 5, worstChain);
    if (route.stage >= 4) this.report.check(route.name + " 점프대 멀리뛰기 구간이 있음(스테이지 4부터)", longJumps >= 1, longJumps);
    this.report.check(route.name + " 끝이 다음 스테이지 시작 쉼터", pieces[pieces.length - 1].startOf === route.stage + 1);
    this.report.note(route.label + ": 발판 " + pieces.length + "개, 가장 먼 점프 " + worstAt + " (최대 거리의 " + Math.round(worstRatio * 100) + "%), 연속 점프 최대 " + worstChain + "회");
  }

  play(route) {
    const rules = ClimbBot.startRules(K, this.level, route);
    const bot = new ClimbBot(K, rules, route.steps);
    const result = bot.run(300);
    this.report.check(route.name + " 봇이 슬로 없이 끝까지 감", result.done && rules.progress.cleared === route.stage, { at: route.steps[bot.index], seconds: result.seconds, y: rules.body.y });
    this.report.check(route.name + " 한 번도 안 떨어지고 감", result.falls === 0, result.falls);
    this.report.note(route.label + ": 봇 완주 " + result.seconds.toFixed(1) + "초");
    return result.seconds;
  }
}

class TrapInspector {
  constructor(level, report) { this.level = level; this.report = report; this.meter = new LinkMeter(); }

  open(piece) {
    return this.meter.outline(piece).some(([px, pz]) => {
      const edge = piece.edge(px, pz, { x: 0, z: 0, nx: 0, nz: 0, dist: 0, inside: false }), ox = px + edge.nx * 0.7, oz = pz + edge.nz * 0.7;
      return !this.level.pieces.some((other) => other !== piece && other.solid && other.covers(ox, oz) && other.topAt(ox, oz) > piece.top + B.STEP && other.bottom < piece.top + B.HEIGHT);
    });
  }

  inspect() {
    const onRoute = new Set();
    this.level.routes.forEach((r) => r.steps.forEach((id) => onRoute.add(id)));
    // 이름에 점이 있는 조각(hB.isle·hA.roofIn 등)은 집·섬에 딸린 몸통이라 길에 넣지 않는다
    const decor = { has: (id) => id === "trunk" || /^tower\d$/.test(id) || id.includes(".") };
    for (const piece of this.level.pieces) {
      if (!decor.has(piece.id)) this.report.check("발판 " + piece.id + " 는 어떤 길에든 속함", onRoute.has(piece.id));
      if (piece.solid && !piece.hub && !decor.has(piece.id)) this.report.check("발판 " + piece.id + " 에 갇히지 않음(내려갈 곳 있음)", this.open(piece));
    }
    const hub = this.level.pieces.find((p) => p.hub), spawn = this.level.spawn;
    this.report.check("시작 지점은 허브 위", hub.covers(spawn.x, spawn.z));
    for (const portal of this.level.portals) {
      this.report.check("포탈 " + portal.stage + " 는 허브 위", hub.covers(portal.x, portal.z) && Math.hypot(portal.x, portal.z) < hub.radius - 2);
      this.report.check("포탈 " + portal.stage + " 앞이 막히지 않음", !this.level.pieces.some((p) => p.solid && !p.hub && p.bottom < 3 && p.edge(portal.x, portal.z, { x: 0, z: 0, nx: 0, nz: 0, dist: 0, inside: false }).dist < 2 || p.solid && !p.hub && p.bottom < 3 && p.covers(portal.x, portal.z)));
    }
    for (const stage of this.level.stages) {
      const start = this.level.stageStart(stage.index);
      if (start) this.report.check("스테이지 " + stage.index + " 시작 쉼터는 한 변 3m 이상·높이 " + stage.floor, start.rest && Math.abs(start.top - stage.floor) < 1e-9, start.top);
      if (start) this.report.check("스테이지 " + stage.index + " 시작 쉼터 가운데 위가 비어 있음(포탈로 와서 설 자리)", !this.level.pieces.some((p) => p !== start && p.solid && p.covers(start.x, start.z) && p.bottom < start.top + B.HEIGHT + 1 && p.top > start.top));
    }
  }
}

const level = new TowerLevel(TowerLevelData.spec());
const report = new ReachReport();
const routes = new RouteInspector(level, report);
const times = {};
for (const route of level.routes) {
  routes.analyse(route);
  times[route.name] = routes.play(route);
}
for (const stage of new Set(level.routes.map((r) => r.stage))) {
  const time = (kind) => { const route = level.routes.find((r) => r.stage === stage && r.name.startsWith(kind)); return route ? times[route.name] : NaN; };
  report.check("스테이지 " + stage + " 쉬운 길이 있음", level.routes.some((r) => r.stage === stage && r.name.startsWith("easy")));
  report.note("스테이지 " + stage + " 둘째 길이 쉬운 길보다 " + (time("easy") - time("normal")).toFixed(1) + "초 빠름");
  report.check("스테이지 " + stage + " 둘째 길이 쉬운 길보다 빠름", time("normal") < time("easy"), { easy: time("easy"), normal: time("normal") });
}
report.check("발사대가 없음", !level.pieces.some((p) => p.look === "cannon"));
new TrapInspector(level, report).inspect();
report.finish();
