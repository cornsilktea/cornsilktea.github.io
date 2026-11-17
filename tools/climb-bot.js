// 42번 타워 클라임: 길(route)을 따라 실제 규칙 엔진을 조작하는 검사용 봇.
// climb-reach.js(도달 검사)와 climb-sim.js(시뮬레이션)가 같이 쓴다.

class ClimbSeededRandom {
  constructor(seed) { this.state = seed >>> 0 || 1; }
  next() { let s = this.state; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; this.state = s; return s / 4294967296; }
  spread(width) { return (this.next() + this.next() + this.next() - 1.5) / 1.5 * width; }
}

class ClimbBot {
  // skill: { aimNoise(rad), jumpEarly(m), rescue(bool), power(0.6~1), slip(틱당 실수 확률) }
  constructor(K, rules, route, skill = {}, random = new ClimbSeededRandom(1)) {
    this.K = K; this.rules = rules; this.route = route; this.random = random;
    this.skill = Object.assign({ aimNoise: 0, jumpEarly: 0.12, rescue: false, power: 1, slip: 0 }, skill);
    this.index = 1;
    this.hopWait = 0;
    this.wobble = 0;
    this.wobbleLeft = 0;
    this.edgeMargin = this.skill.jumpEarly;
    this.spot = new K.ClimbGrabSpot();
    this.probe = { x: 0, z: 0, nx: 0, nz: 0, dist: 0, inside: false };
  }

  get done() { return this.index >= this.route.length; }
  get target() { return this.rules.level.piece(this.route[Math.min(this.index, this.route.length - 1)]); }

  observe(events) {
    for (const e of events) {
      if (e.t === "pad") this.passed(e.piece);
      if (e.t === "launch") this.passed("cannon");
    }
  }

  passed(id) { const at = this.route.indexOf(id); if (at >= 0) this.index = at + 1; }

  aim(target, body) {
    const K = this.K;
    if (target instanceof K.GrabHold) return [target.x + target.nx * 0.45, target.z + target.nz * 0.45];
    if (target instanceof K.JumpPad || target instanceof K.LaunchCannon) return [target.x, target.z];
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
    if (body.hanging && body.spot.piece) this.passed(body.spot.piece.id);
    if (this.done) { rules.steer(0, 0); return; }
    const target = this.target;

    if (body.hanging) {
      rules.steer(0, 0);
      if (body.spot.ledge || body.hopTime > 0) return;
      if (--this.hopWait <= 0) { rules.pressJump(); this.hopWait = 30; }
      return;
    }
    if (body.grounded && body.ground instanceof K.LaunchCannon) {
      rules.steer(0, 0);
      if (this.skill.power < 1 && rules.chargeFill >= this.skill.power - 1e-9) rules.pressJump();
      return;
    }
    if (body.flight) {
      rules.steer(0, 0);
      if (this.skill.rescue && body.vy < 0 && rules.grab.find(body.x, body.y, body.z, this.spot)) rules.pressGrab();
      return;
    }

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
      if (overTarget && body.speed > 1.5 && far < 0.5) rules.steer(-body.vx, -body.vz); else rules.steer(dx, dz);
      if ((needsGrab || this.skill.rescue) && rules.grab.find(body.x, body.y, body.z, this.spot) && this.route.indexOf(this.spot.piece.id) >= this.index) rules.pressGrab();
      return;
    }
    if (far < 0.08 && overTarget) { rules.steer(0, 0); return; }
    rules.steer(dx, dz);
    if (this.skill.slip > 0 && this.random.next() < this.skill.slip) { rules.pressJump(); return; }
    const ground = body.ground;
    if (needsGrab) {
      if (rules.grab.find(body.x, body.y, body.z, this.spot) && this.spot.piece === target) { rules.pressGrab(); return; }
      const reach = target instanceof K.GrabHold ? Math.hypot(target.x - body.x, target.z - body.z) : target.edge(body.x, body.z, this.probe).dist;
      if (reach < 0.95) rules.pressJump();
      return;
    }
    const edge = target.edge(body.x, body.z, this.probe);
    const touching = edge.inside || edge.dist < 0.7;
    if (target.topAt(edge.x, edge.z) > body.y + B.STEP) { if (touching || !ground.covers(body.x + dx * this.edgeMargin, body.z + dz * this.edgeMargin)) rules.pressJump(); return; }
    if (ground.covers(body.x + dx * this.edgeMargin, body.z + dz * this.edgeMargin)) return;
    if (target.covers(body.x + dx * 0.6, body.z + dz * 0.6) && target.topAt(edge.x, edge.z) >= body.y - 1.2) return;
    rules.pressJump();
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
