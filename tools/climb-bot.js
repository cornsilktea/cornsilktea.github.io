// 42번 타워 클라임: 길(route)을 따라 실제 규칙 엔진을 조작하는 검사용 봇.
// climb-reach.js(도달 검사)와 climb-sim.js(시뮬레이션)가 같이 쓴다.

class ClimbSeededRandom {
  constructor(seed) { this.state = seed >>> 0 || 1; }
  next() { let s = this.state; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; this.state = s; return s / 4294967296; }
  spread(width) { return (this.next() + this.next() + this.next() - 1.5) / 1.5 * width; }
}

// 회전 막대(SweeperBar)가 앞으로 어디를 지날지 내다본다. 봇은 막대에 맞지 않게 때를 기다리거나 제자리에서 뛰어넘는다
class ClimbHazardWatch {
  constructor(K, rules) { this.B = K.ClimbBalance; this.rules = rules; }

  hitsAt(bar, seconds, x, y, z, margin) {
    if (!(y < bar.top && y + this.B.HEIGHT > bar.bottom)) return false;
    const a = bar.angleAt(seconds), c = Math.cos(a), s = Math.sin(a), R = this.B.RADIUS + margin;
    const lx = (x - bar.x) * c - (z - bar.z) * s, lz = (x - bar.x) * s + (z - bar.z) * c;
    return Math.abs(lx) <= bar.halfX + R && Math.abs(lz) <= bar.halfZ + R;
  }

  // now+from ~ now+to 사이에 (x,y,z) 에 선 몸을 막대가 치는가
  threat(x, y, z, from, to, margin = 0.15) {
    const now = this.rules.worldTime;
    for (const bar of this.rules.sweepers)
      for (let t = from; t <= to; t += 1 / 60) if (this.hitsAt(bar, now + t, x, y, z, margin)) return true;
    return false;
  }

  // 지금 속도로 달릴 때 처음 맞는 시각(없으면 -1)
  firstHit(body, to) {
    const now = this.rules.worldTime;
    for (let t = 0; t <= to; t += 1 / 120)
      for (const bar of this.rules.sweepers) if (this.hitsAt(bar, now + t, body.x + body.vx * t, body.y, body.z + body.vz * t, 0.05)) return t;
    return -1;
  }
}

class ClimbBot {
  // skill: { aimNoise(rad), jumpEarly(m), power(0.6~1), slip(틱당 실수 확률) } — 잡기는 규칙 엔진이 저절로 한다
  constructor(K, rules, route, skill = {}, random = new ClimbSeededRandom(1)) {
    this.K = K; this.rules = rules; this.route = route; this.random = random;
    this.skill = Object.assign({ aimNoise: 0, jumpEarly: 0.12, power: 1, slip: 0 }, skill);
    this.index = 1;
    this.hopWait = 0;
    this.wobble = 0;
    this.wobbleLeft = 0;
    this.edgeMargin = this.skill.jumpEarly;
    this.spot = new K.ClimbGrabSpot();
    this.probe = { x: 0, z: 0, nx: 0, nz: 0, dist: 0, inside: false };
    this.pose = new K.ClimbPose();
    this.chosen = null;
    this.launch = 0;
    this.watch = new ClimbHazardWatch(K, rules);
  }

  // 길의 첫 발판에 선 채로 시작하는 한 판(스테이지 2부터는 앞 스테이지를 깬 것으로 친다)
  static startRules(K, level, route) {
    const rules = new K.ClimbRules(level, new K.StageProgress(route.stage - 1)), first = level.piece(route.steps[0]);
    if (route.stage > 1) { rules.body.place(first.x, first.top, first.z); rules.body.airPeak = first.top; }
    return rules;
  }

  get done() { return this.index >= this.route.length; }
  get target() { return this.pickMember(this.rules.level.piece(this.route[Math.min(this.index, this.route.length - 1)])); }
  get after() { const id = this.route[this.index + 1]; return id ? this.rules.level.piece(id) : null; }

  observe(events) {
    for (const e of events) {
      if (e.t === "pad") this.passed(e.piece);
    }
  }

  // 같은 무리(기차 칸)의 움직이는 발판은 길에 적힌 칸 대신 지금 가장 가까워질 칸을 노린다
  pickMember(piece) {
    if (!piece.moving) return piece;
    const members = this.rules.level.pieces.filter((p) => p.moving && p.group === piece.group);
    if (members.length < 2) return piece;
    const body = this.rules.body, later = this.rules.worldTime + 0.8;
    let best = piece, bestD = Infinity;
    for (const member of members) {
      member.track.pose(later, this.pose);
      const d = Math.hypot(this.pose.x - body.x, this.pose.z - body.z);
      if (d < bestD) { bestD = d; best = member; }
    }
    if (this.chosen && this.chosen.group === piece.group && Math.hypot(this.chosen.x - body.x, this.chosen.z - body.z) < bestD + 3) return this.chosen;
    this.chosen = best;
    return best;
  }

  passed(id) {
    let at = this.route.indexOf(id);
    if (at < 0) {
      const piece = this.rules.level.piece(id);
      if (piece.moving) at = this.route.findIndex((step) => { const p = this.rules.level.piece(step); return p.moving && p.group === piece.group; });
    }
    if (at >= 0) this.index = at + 1;
  }

  aim(target, body) {
    const K = this.K;
    if (target instanceof K.GrabHold) return [target.x + target.nx * 0.45, target.z + target.nz * 0.45];
    if (target instanceof K.JumpPad) return [target.x, target.z];
    if (target.round) {
      const dx = body.x - target.x, dz = body.z - target.z, d = Math.hypot(dx, dz) || 1, keep = Math.min(d, target.radius * 0.45);
      return [target.x + dx / d * keep, target.z + dz / d * keep];
    }
    const insetX = target.halfX * 0.55, insetZ = target.halfZ * 0.55;
    const lx = Math.max(-insetX, Math.min(insetX, target.localX(body.x, body.z)));
    const lz = Math.max(-insetZ, Math.min(insetZ, target.localZ(body.x, body.z)));
    return [target.worldX(lx, lz), target.worldZ(lx, lz)];
  }

  drive() {
    const K = this.K, B = K.ClimbBalance, rules = this.rules, body = rules.body;
    if (this.done || body.mode === "stun" || body.mode === "portal") { rules.steer(0, 0); return; }
    if (body.grounded && body.ground) this.passed(body.ground.id);
    if (body.hanging && body.spot.piece instanceof K.GrabHold) this.passed(body.spot.piece.id);
    if (this.done) { rules.steer(0, 0); return; }
    const target = this.target;

    if (body.hanging) {
      rules.steer(0, 0);
      if (body.hopTime > 0) return;
      if (body.spot.ledge && !this.mantleSafe()) return;
      if (--this.hopWait <= 0) { rules.pressJump(); this.hopWait = body.spot.ledge ? 12 : 30; }
      return;
    }

    const footing = body.grounded ? body.ground : null;
    if (target.moving || footing && footing.moving || !footing && (body.driftX !== 0 || body.driftZ !== 0)) { this.driveTimed(target); return; }
    this.launch = 0;

    let [aimX, aimZ] = this.aim(target, body);
    const slope = body.grounded && body.ground.rise !== 0 ? body.ground : null;
    if (slope && target.top > body.y + 1.35 && body.y < slope.peak - 0.2) {
      const high = Math.sign(slope.rise) * (slope.halfX - 0.3);
      aimX = slope.worldX(high, 0); aimZ = slope.worldZ(high, 0);
    }
    let dx = aimX - body.x, dz = aimZ - body.z;
    const far = Math.hypot(dx, dz);
    if (far > 1e-6) { dx /= far; dz /= far; }
    if (this.skill.aimNoise > 0) {
      if (--this.wobbleLeft <= 0) { this.wobble = this.random.spread(this.skill.aimNoise); this.wobbleLeft = 20 + Math.floor(this.random.next() * 40); this.edgeMargin = Math.max(0, this.skill.jumpEarly + this.random.spread(this.skill.jumpEarly)); }
      const c = Math.cos(this.wobble), s = Math.sin(this.wobble), rx = dx * c - dz * s, rz = dx * s + dz * c;
      dx = rx; dz = rz;
    }
    const needsGrab = target instanceof K.GrabHold || target.top - body.y > 1.45;
    const overTarget = target.solid && target.covers(body.x, body.z) && Math.abs(target.top - body.y) < 3;

    if (!body.grounded) {
      if (overTarget && body.speed > 1.5 && far < 0.5) rules.steer(-body.vx, -body.vz);
      else if (body.windX !== 0 || body.windZ !== 0) this.steerAgainstWind(target, aimX, aimZ);
      else rules.steer(dx, dz);
      return;
    }
    if (this.dodge()) return;
    if (far < 0.08 && overTarget) { rules.steer(0, 0); return; }
    rules.steer(dx, dz);
    if (this.skill.slip > 0 && this.random.next() < this.skill.slip) { rules.pressJump(); return; }
    const ground = body.ground;
    if (needsGrab) {
      const reach = target instanceof K.GrabHold ? Math.hypot(target.x - body.x, target.z - body.z) : target.edge(body.x, body.z, this.probe).dist;
      if (reach < 0.95 || !ground.covers(body.x + dx * this.edgeMargin, body.z + dz * this.edgeMargin)) this.takeoff(target, aimX, aimZ);
      return;
    }
    const edge = target.edge(body.x, body.z, this.probe);
    const touching = edge.inside || edge.dist < 0.7;
    const touchingGround = ground.covers(edge.x, edge.z) || ground.edge(edge.x, edge.z, { x: 0, z: 0, nx: 0, nz: 0, dist: 0, inside: false }).dist < 0.15;
    const level = touchingGround && Math.abs(target.topAt(edge.x, edge.z) - body.y) <= B.STEP;
    if (level && edge.dist < 0.1) return;
    if (level && edge.dist < 1.2) { rules.steer(edge.x - body.x, edge.z - body.z); return; }
    if (target.topAt(edge.x, edge.z) > body.y + B.STEP) { if (touching || !ground.covers(body.x + dx * this.edgeMargin, body.z + dz * this.edgeMargin)) this.takeoff(target, aimX, aimZ); return; }
    if (ground.covers(body.x + dx * this.edgeMargin, body.z + dz * this.edgeMargin)) return;
    if (target.covers(body.x + dx * 0.6, body.z + dz * 0.6) && target.topAt(edge.x, edge.z) >= body.y - 1.2) return;
    this.takeoff(target, aimX, aimZ);
  }

  // 막대가 곧 몸을 치면(0.12~0.2초 뒤) 제자리에서 뛰어넘는다
  dodge() {
    if (!this.rules.sweepers.length) return false;
    const hit = this.watch.firstHit(this.rules.body, 0.2);
    if (hit < 0.12) return false;
    this.rules.pressJump();
    return true;
  }

  // 뛰어서 내려설 곳을 막대가 지나가는 때면 기다린다(무너지는 발판 위에서는 기다릴 수 없어 그냥 뛴다)
  takeoff(target, aimX, aimZ) {
    const K = this.K, B = K.ClimbBalance, body = this.rules.body;
    if (this.rules.sweepers.length && !(body.ground instanceof K.CrumblePlatform)) {
      const flight = Math.min(0.9, Math.hypot(aimX - body.x, aimZ - body.z) / B.RUN + 0.1);
      if (this.watch.threat(aimX, target.top, aimZ, flight - 0.35, flight + 0.35)) { this.rules.steer(0, 0); return; }
    }
    this.rules.pressJump();
  }

  // 매달린 모서리에서 올라간 뒤 다음 발판에 내려설 때 막대가 지나가지 않을 때만 올라간다
  mantleSafe() {
    const next = this.after, body = this.rules.body;
    if (!this.rules.sweepers.length || !next) return true;
    const B = this.K.ClimbBalance, spot = body.spot, piece = spot.piece, [x, z] = this.aim(next, body);
    const landX = spot.x - spot.nx * B.MANTLE_INSET, landZ = spot.z - spot.nz * B.MANTLE_INSET, d = Math.hypot(x - landX, z - landZ) || 1;
    let run = 0;
    while (run < 6 && piece.covers(landX + (x - landX) / d * (run + 0.05), landZ + (z - landZ) / d * (run + 0.05))) run += 0.05;
    const start = B.CLIMB_UP_TIME + 0.12, eta = start + run / B.RUN + ClimbBot.airTime(B.JUMP, next.top - piece.top, B.GRAVITY);
    const midX = landX + (x - landX) / d * run / 2, midZ = landZ + (z - landZ) / d * run / 2, mid = start + run / 2 / B.RUN;
    if (this.watch.threat(landX, piece.top, landZ, B.CLIMB_UP_TIME * B.CLIMB_UP_RISE_SHARE, start, 0.3)) return false;
    if (this.watch.threat(midX, piece.top, midZ, mid - 0.2, mid + 0.2, 0.3)) return false;
    return !this.watch.threat(x, next.top, z, eta - 0.3, eta + 0.35, 0.4);
  }

  // 바람 속에서는 내려설 때까지 바람에 밀릴 만큼 반대쪽으로 조준한다
  steerAgainstWind(target, aimX, aimZ) {
    const body = this.rules.body, rem = this.landingIn(target);
    const wantX = (aimX - body.x) / rem - body.windX, wantZ = (aimZ - body.z) / rem - body.windZ;
    if (Math.hypot(wantX - body.vx, wantZ - body.vz) < 0.3) this.rules.steer(0, 0); else this.steerNoisy(wantX, wantZ);
  }

  // 움직이는 발판: 발판이 앞으로 있을 곳을 내다보고, 관성(drift)을 빼서 조준하고, 때가 될 때까지 가장자리에서 기다린다
  poseOf(piece, seconds) {
    if (piece.moving) piece.track.pose(seconds, this.pose);
    else this.pose.set(piece.x, piece.top, piece.z, piece.yaw);
    return this.pose;
  }

  velocityOf(piece, seconds) {
    if (!piece.moving) return [0, 0];
    const tick = this.K.ClimbBalance.TICK, before = this.poseOf(piece, seconds - tick), bx = before.x, bz = before.z, after = this.poseOf(piece, seconds);
    return [(after.x - bx) / tick, (after.z - bz) / tick];
  }

  static airTime(up, rise, gravity) {
    const inside = up * up - 2 * gravity * rise;
    return inside < 0 ? 0 : (up + Math.sqrt(inside)) / gravity;
  }

  exitPoint(ground, body, dx, dz) {
    let along = 0;
    while (along < 8 && ground.covers(body.x + dx * (along + 0.05), body.z + dz * (along + 0.05))) along += 0.05;
    return [body.x + dx * along, body.z + dz * along];
  }

  landingIn(target) {
    const B = this.K.ClimbBalance, body = this.rules.body, inside = body.vy * body.vy + 2 * B.GRAVITY * (body.y - target.top);
    return inside < 0 ? body.vy / B.GRAVITY + 0.1 : Math.max(0.02, (body.vy + Math.sqrt(inside)) / B.GRAVITY);
  }

  padReady(target, seconds) {
    const next = this.after;
    if (!(target instanceof this.K.MovingJumpPad) || !next) return true;
    return [-0.15, 0, 0.15, 0.25].every((extra) => {
      const [vx, vz] = this.velocityOf(target, seconds + extra), pose = this.poseOf(target, seconds + extra);
      return vx * (next.x - pose.x) + vz * (next.z - pose.z) > 0;
    });
  }

  // 실수하는 봇: 조준 방향을 흔들고(aimNoise) 내다보는 시간을 들쭉날쭉하게(jumpEarly) 한다
  steerNoisy(dx, dz) {
    if (this.skill.aimNoise > 0) {
      if (--this.wobbleLeft <= 0) { this.wobble = this.random.spread(this.skill.aimNoise); this.wobbleLeft = 20 + Math.floor(this.random.next() * 40); this.timing = this.random.spread(this.skill.jumpEarly * 0.5); }
      const c = Math.cos(this.wobble), s = Math.sin(this.wobble);
      this.rules.steer(dx * c - dz * s, dx * s + dz * c);
    } else this.rules.steer(dx, dz);
  }

  driveTimed(target) {
    const K = this.K, B = K.ClimbBalance, rules = this.rules, body = rules.body, now = rules.worldTime + (this.timing || 0), ground = body.grounded ? body.ground : null;
    if (!ground) {
      const rem = this.landingIn(target), pose = this.poseOf(target, now + rem);
      const missX = pose.x - body.x - (body.vx + body.driftX) * rem, missZ = pose.z - body.z - (body.vz + body.driftZ) * rem;
      if (Math.hypot(missX, missZ) > 0.3) this.steerNoisy(missX, missZ); else rules.steer(0, 0);
      return;
    }
    const nowPose = this.poseOf(target, now), edge = ground.edge(nowPose.x, nowPose.z, this.probe), inset = Math.min(0.75, Math.min(ground.halfX, ground.halfZ) * 0.9);
    const waitX = ground.moving ? ground.x : edge.x - edge.nx * inset, waitZ = ground.moving ? ground.z : edge.z - edge.nz * inset;
    const driftX = ground.moving ? ground.vx : 0, driftZ = ground.moving ? ground.vz : 0;
    let run = 0.1, flight = 0.5, grab = false, pose = nowPose, takeX = body.x, takeZ = body.z;
    for (let pass = 0; pass < 3; pass++) {
      const guess = this.poseOf(target, now + run + flight), rise = guess.top - body.y;
      grab = rise > 1.45;
      flight = grab ? 0.4 : ClimbBot.airTime(B.JUMP, Math.min(rise, 1.5), B.GRAVITY);
      pose = this.poseOf(target, now + run + flight);
      const aimX = pose.x - driftX * flight, aimZ = pose.z - driftZ * flight, d = Math.hypot(aimX - body.x, aimZ - body.z) || 1;
      [takeX, takeZ] = this.exitPoint(ground, body, (aimX - body.x) / d, (aimZ - body.z) / d);
      run = Math.hypot(takeX - body.x, takeZ - body.z) / B.RUN + 0.06;
    }
    const lead = run + flight, top = pose.top, px = pose.x, pz = pose.z;
    const needX = px - takeX - driftX * flight, needZ = pz - takeZ - driftZ * flight, tolerance = Math.min(target.halfX, target.halfZ) * 0.6;
    const range = top - body.y, high = grab ? range >= 1.9 && range <= 3.9 : range <= 1.45;
    const ready = high && Math.hypot(needX, needZ) - tolerance <= B.RUN * flight * 0.92 && this.padReady(target, now + lead);
    if (this.trace) this.trace({ t: now, target: target.id, high, range, need: Math.hypot(needX, needZ) - tolerance, reach: B.RUN * flight * 0.92, run, ready });
    if (ready && this.launch <= 0) this.launch = Math.round((run + 0.3) / B.TICK);
    if (this.launch > 0) {
      this.launch--;
      const d = Math.hypot(needX, needZ) || 1, dx = needX / d, dz = needZ / d;
      this.steerNoisy(dx, dz);
      if (!ground.covers(body.x + dx * 0.25, body.z + dz * 0.25) || grab && edge.dist < 0.3) { rules.pressJump(); this.launch = 0; }
      return;
    }
    if (Math.hypot(waitX - body.x, waitZ - body.z) > 0.15) rules.steer(waitX - body.x, waitZ - body.z); else rules.steer(0, 0);
  }

  // 한 판을 돌린다. 반환: { done, seconds, falls, ticks }
  run(limitSeconds) {
    const tick = this.K.ClimbBalance.TICK, limit = Math.round(limitSeconds / tick);
    let ticks = 0;
    while (ticks < limit && !this.done) {
      this.drive();
      this.observe(this.rules.advance(tick));
      ticks++;
    }
    if (!this.done && this.rules.body.grounded && this.rules.body.ground) this.passed(this.rules.body.ground.id);
    return { done: this.done, seconds: ticks * tick, falls: this.rules.falls, ticks };
  }
}

module.exports = { ClimbBot, ClimbSeededRandom };
