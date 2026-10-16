class SnPathGraph {
  static readonly CACHE_LIMIT = 256;
  static readonly LOOKAHEAD = 10;
  static readonly ICE_COST = 2;
  private static built: SnPathGraph | null = null;
  static shared(map: SnMap): SnPathGraph {
    if (!SnPathGraph.built) SnPathGraph.built = new SnPathGraph(map);
    return SnPathGraph.built;
  }

  readonly open = new Uint8Array(SnGridMath.COUNT);
  private readonly fields = new Map<number, Int16Array>();

  constructor(private readonly map: SnMap) {
    for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
      if (!map.walkable(idx)) continue;
      this.open[idx] = map.obstacleAt(SnGridMath.centerX(idx), SnGridMath.centerZ(idx), 0.5) ? 0 : 1;
    }
  }

  nearestOpen(x: number, z: number): number {
    const idx = SnGridMath.indexAt(x, z);
    if (idx >= 0 && this.open[idx]) return idx;
    return this.map.nearestWalkable(x, z, (k) => !this.open[k]);
  }

  field(goal: number): Int16Array {
    const cached = this.fields.get(goal);
    if (cached) return cached;
    if (this.fields.size >= SnPathGraph.CACHE_LIMIT) this.fields.clear();
    const dist = new Int16Array(SnGridMath.COUNT).fill(-1);
    const buckets: number[][] = [[goal]];
    dist[goal] = 0;
    for (let d = 0; d < buckets.length; d++) {
      const bucket = buckets[d];
      if (!bucket) continue;
      for (let head = 0; head < bucket.length; head++) {
        const a = bucket[head];
        if (dist[a] !== d) continue;
        const i = SnGridMath.colOf(a), j = SnGridMath.rowOf(a);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if ((!di && !dj) || !SnGridMath.inside(i + di, j + dj)) continue;
          const b = SnGridMath.index(i + di, j + dj);
          if (!this.open[b] || !this.map.connected(b, a)) continue;
          const nd = d + this.stepCost(b);
          if (dist[b] >= 0 && dist[b] <= nd) continue;
          dist[b] = nd;
          (buckets[nd] ??= []).push(b);
        }
      }
    }
    this.fields.set(goal, dist);
    return dist;
  }

  private stepCost(idx: number): number { return this.map.isIce(idx) ? SnPathGraph.ICE_COST : 1; }

  straight(x0: number, z0: number, x1: number, z1: number): boolean {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 0.5));
    let prev = SnGridMath.indexAt(x0, z0);
    const fromIce = this.map.isIce(prev);
    for (let k = 1; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
      const idx = SnGridMath.indexAt(x, z);
      if (idx < 0 || !this.map.walkable(idx)) return false;
      if (!fromIce && this.map.isIce(idx)) return false;
      if (idx !== prev && prev >= 0 && !this.map.connected(prev, idx)) return false;
      if (this.map.obstacleAt(x, z, 0.5)) return false;
      prev = idx;
    }
    return true;
  }

  waypoint(x: number, z: number, gx: number, gz: number): SnPoint {
    if (this.straight(x, z, gx, gz)) return { x: gx, z: gz };
    const goal = this.nearestOpen(gx, gz);
    if (goal < 0) return { x: gx, z: gz };
    const dist = this.field(goal);
    let cur = SnGridMath.indexAt(x, z);
    if (cur < 0 || dist[cur] < 0) {
      const near = this.map.nearestWalkable(x, z, (k) => !this.open[k] || dist[k] < 0);
      if (near < 0) return { x: gx, z: gz };
      return { x: SnGridMath.centerX(near), z: SnGridMath.centerZ(near) };
    }
    let best: SnPoint = { x: SnGridMath.centerX(cur), z: SnGridMath.centerZ(cur) };
    for (let step = 0; step < SnPathGraph.LOOKAHEAD && dist[cur] > 0; step++) {
      const i = SnGridMath.colOf(cur), j = SnGridMath.rowOf(cur);
      let next = -1;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if ((!di && !dj) || !SnGridMath.inside(i + di, j + dj)) continue;
        const b = SnGridMath.index(i + di, j + dj);
        if (dist[b] >= 0 && dist[b] < dist[cur] && this.map.connected(cur, b) && (next < 0 || dist[b] < dist[next] || (dist[b] === dist[next] && di && dj))) next = b;
      }
      if (next < 0) break;
      cur = next;
      const p = { x: SnGridMath.centerX(cur), z: SnGridMath.centerZ(cur) };
      if (step === 0 || this.straight(x, z, p.x, p.z)) best = p;
      else break;
    }
    return best;
  }
}

class SnBotTuning {
  static readonly THINK_MIN = 0.15;
  static readonly THINK_MAX = 0.2;
  static readonly REACTION = 0.3;
  static readonly AIM_ERROR = 12 * Math.PI / 180;
  static readonly AIM_LEAD = 0.6;
  static readonly SIGHT = 20;
  static readonly LOW_HP = 0.4;
  static readonly WALL_HP = 0.5;
  static readonly RETREAT_HP = 0.45;
  static readonly WALL_BREAK_NEAR = 3;
  static readonly ESCAPE_RANGE = 7;
  static readonly ESCAPE_TIME = 2;
  static readonly WALL_BREAK_SNOW = 10;
  static readonly CHASE_EDGE = 0.1;
  static readonly WALL_HIT_WINDOW = 0.6;
  static readonly REVIVE_SAFE = 12;
  static readonly REVIVE_SEEK = 30;
  static readonly LOOT_RANGE = 45;
  static readonly PILE_RANGE = 25;
  static readonly KEEP_NEAR = 6;
  static readonly FIGHT_RANGE = 0.85;
  static readonly ALLY_LEASH = 15;
  static readonly STUCK_TIME = 0.5;
  static readonly DETOUR_TIME = 0.7;
}

class SnBotBrain implements SnPilot {
  readonly bot = true;
  private readonly random: SnSeededRandom;
  private thinkAt = 0;
  private goalX = 0; private goalZ = 0; private hasGoal = false;
  private wantStill = false;
  private strafe = 1;
  private strafeUntil = 0;
  private targetNum = -1;
  private targetSince = 0;
  private wanderX = 0; private wanderZ = 0; private wanderUntil = 0;
  private holdK = false;
  private shootAngle: number | null = null;
  private wallAngle: number | null = null;
  private lastWallHit = -1;
  private readonly cocoa = new Set<number>();
  private stuckFor = 0;
  private detourUntil = 0;
  private detourDir = 1;
  private lastX = 0; private lastZ = 0;
  private waypointX = 0; private waypointZ = 0;
  private blockingWall: SnWall | null = null;
  private stuckStreak = 0;
  private escapeX = 0; private escapeZ = 0; private escapeUntil = 0;

  constructor(seed: number) { this.random = new SnSeededRandom(seed); this.thinkAt = this.random.range(0, SnBotTuning.THINK_MAX); }

  decide(engine: SnEngine, me: SnPlayer, dt: number): SnIntent {
    const intent = SnIdleIntent.make();
    if (me.life !== "alive") return intent;
    if (engine.time >= this.thinkAt) {
      this.thinkAt = engine.time + this.random.range(SnBotTuning.THINK_MIN, SnBotTuning.THINK_MAX);
      this.think(engine, me);
    }
    this.steer(engine, me, dt, intent);
    intent.holdK = this.holdK;
    const wall = this.blockingWall;
    if (this.shootAngle === null && wall && engine.walls.indexOf(wall) >= 0 && wall.distanceTo(me.x, me.z) < SnBotTuning.WALL_BREAK_NEAR && engine.teams[me.team].snow >= SnBotTuning.WALL_BREAK_SNOW) {
      this.shootAngle = SnAngle.toward(me.x, me.z, wall.x, wall.z);
    }
    if (this.shootAngle !== null && !this.holdK && engine.time >= me.nextShotAt) {
      intent.attack = true; intent.attackAngle = this.shootAngle; this.shootAngle = null;
    }
    if (this.wallAngle !== null) { intent.wall = true; intent.wallAngle = this.wallAngle; this.wallAngle = null; }
    return intent;
  }

  private setGoal(x: number, z: number): void { this.goalX = x; this.goalZ = z; this.hasGoal = true; this.wantStill = false; }

  private think(engine: SnEngine, me: SnPlayer): void {
    this.holdK = false;
    this.rememberCocoa(engine, me);
    const storm = engine.stormNow();
    const ring = storm.next || { x: storm.x, z: storm.z, r: storm.r };
    const enemy = this.spotEnemy(engine, me);
    this.planShot(engine, me, enemy);
    this.planWall(engine, me);

    const fromStorm = Math.hypot(me.x - storm.x, me.z - storm.z);
    if (fromStorm > storm.r - 1) { this.setGoal(storm.x, storm.z); return; }
    if (this.planRevive(engine, me)) return;
    if (me.hp < me.maxHp * SnBotTuning.LOW_HP && this.planCocoa(engine, me)) return;
    if (enemy && this.planFight(engine, me, enemy, ring)) return;
    const fromRing = Math.hypot(me.x - ring.x, me.z - ring.z);
    if (fromRing > Math.max(2, ring.r * 0.8)) { this.setGoal(ring.x, ring.z); return; }
    if (this.planLoot(engine, me, ring)) return;
    this.planWander(engine, me, ring);
  }

  private spotEnemy(engine: SnEngine, me: SnPlayer): SnPlayer | null {
    const level = engine.map.levelAt(me.x, me.z);
    let best: SnPlayer | null = null, bd = Infinity;
    for (const o of engine.players) {
      if (o.team === me.team || o.life !== "alive") continue;
      const d = Math.hypot(o.x - me.x, o.z - me.z);
      if (d > SnBotTuning.SIGHT || d >= bd) continue;
      if (!SnSightLine.clear(engine, me.x, me.z, o.x, o.z, level)) continue;
      bd = d; best = o;
    }
    if (!best) { this.targetNum = -1; return null; }
    if (best.num !== this.targetNum) { this.targetNum = best.num; this.targetSince = engine.time; }
    return best;
  }

  private planShot(engine: SnEngine, me: SnPlayer, enemy: SnPlayer | null): void {
    this.shootAngle = null;
    if (!enemy || engine.time - this.targetSince < SnBotTuning.REACTION) return;
    const d = Math.hypot(enemy.x - me.x, enemy.z - me.z);
    const level = engine.map.levelAt(me.x, me.z);
    const reach = me.bigBall ? SnBalance.BIG.distance * 0.7 : SnBalance.SHOT.range * SnHeightRules.rangeScale(level, engine.map.levelAt(enemy.x, enemy.z));
    if (d > reach) return;
    if (!me.bigBall && engine.teams[me.team].snow < SnBalance.SHOT.cost) return;
    const spot = engine.aim.leadSpot(me, enemy, SnBotTuning.AIM_LEAD);
    this.shootAngle = SnAngle.toward(me.x, me.z, spot.x, spot.z) + this.random.range(-1, 1) * SnBotTuning.AIM_ERROR;
  }

  private planWall(engine: SnEngine, me: SnPlayer): void {
    if (me.hp > me.maxHp * SnBotTuning.WALL_HP || me.lastHitAt < 0 || engine.time - me.lastHitAt > SnBotTuning.WALL_HIT_WINDOW) return;
    if (me.lastHitAt === this.lastWallHit || engine.time < me.nextWallAt || engine.teams[me.team].snow < SnBalance.WALL.cost) return;
    this.lastWallHit = me.lastHitAt;
    this.wallAngle = SnAngle.toward(me.x, me.z, me.lastHitFromX, me.lastHitFromZ);
  }

  private planRevive(engine: SnEngine, me: SnPlayer): boolean {
    if (engine.mode !== "duos") return false;
    const ally = engine.teams[me.team].members.find((q) => q !== me && q.canBeRevived());
    if (!ally) return false;
    const d = Math.hypot(ally.x - me.x, ally.z - me.z);
    if (d > SnBotTuning.REVIVE_SEEK) return false;
    for (const o of engine.players) {
      if (o.team === me.team || o.life !== "alive") continue;
      if (Math.hypot(o.x - ally.x, o.z - ally.z) < SnBotTuning.REVIVE_SAFE) return false;
    }
    if (d <= SnBalance.REVIVE.reach - 0.4) { this.holdK = true; this.hasGoal = false; this.wantStill = true; this.shootAngle = null; return true; }
    this.setGoal(ally.x, ally.z);
    return true;
  }

  private rememberCocoa(engine: SnEngine, me: SnPlayer): void {
    for (const c of engine.crates) {
      if (c.taken) { this.cocoa.delete(c.num); continue; }
      if (c.opened && c.item.kind === "cocoa" && Math.hypot(c.x - me.x, c.z - me.z) < SnBotTuning.SIGHT) this.cocoa.add(c.num);
    }
  }

  private planCocoa(engine: SnEngine, me: SnPlayer): boolean {
    let best: SnCrate | null = null, bd = Infinity;
    for (const num of this.cocoa) {
      const c = engine.crates[num];
      const d = Math.hypot(c.x - me.x, c.z - me.z);
      if (d < bd && engine.storm.inside(engine.time, c.x, c.z)) { bd = d; best = c; }
    }
    if (!best) return false;
    this.setGoal(best.x, best.z);
    return true;
  }

  private planFight(engine: SnEngine, me: SnPlayer, enemy: SnPlayer, ring: { x: number; z: number; r: number }): boolean {
    const d = Math.hypot(enemy.x - me.x, enemy.z - me.z);
    const reach = SnBalance.SHOT.range * SnBotTuning.FIGHT_RANGE;
    if (engine.time > this.strafeUntil) { this.strafe = this.random.next() < 0.5 ? -1 : 1; this.strafeUntil = engine.time + this.random.range(1, 2.5); }
    const mine = me.hp / me.maxHp, theirs = enemy.hp / enemy.maxHp;
    const ax = (enemy.x - me.x) / (d || 1), az = (enemy.z - me.z) / (d || 1);
    let mx = -az * this.strafe, mz = ax * this.strafe;
    if (mine < SnBotTuning.RETREAT_HP) { mx = mx * 0.5 - ax; mz = mz * 0.5 - az; }
    else if (d > reach) {
      if (mine < theirs + SnBotTuning.CHASE_EDGE) return false;
      mx = ax; mz = az;
    }
    else if (d < SnBotTuning.KEEP_NEAR) { mx = mx * 0.6 - ax; mz = mz * 0.6 - az; }
    if (Math.hypot(me.x + mx * 3 - ring.x, me.z + mz * 3 - ring.z) > ring.r && Math.hypot(me.x - ring.x, me.z - ring.z) > ring.r * 0.6) { mx = ring.x - me.x; mz = ring.z - me.z; }
    const len = Math.hypot(mx, mz) || 1;
    this.setGoal(me.x + mx / len * 4, me.z + mz / len * 4);
    return true;
  }

  private planLoot(engine: SnEngine, me: SnPlayer, ring: { x: number; z: number; r: number }): boolean {
    let best: SnPoint | null = null, bd = Infinity;
    for (const c of engine.crates) {
      if (c.taken || (c.opened && !engine.loot.canTake(me, c.item))) continue;
      if (Math.hypot(c.x - ring.x, c.z - ring.z) > ring.r) continue;
      const d = Math.hypot(c.x - me.x, c.z - me.z);
      if (d < bd && d < SnBotTuning.LOOT_RANGE) { bd = d; best = c; }
    }
    if (engine.teams[me.team].room() > 0) for (const p of engine.piles) {
      if (p.taken) continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (d < SnBotTuning.PILE_RANGE && d < bd) { bd = d; best = p; }
    }
    if (!best) return false;
    this.setGoal(best.x, best.z);
    return true;
  }

  private planWander(engine: SnEngine, me: SnPlayer, ring: { x: number; z: number; r: number }): void {
    const ally = engine.teams[me.team].members.find((q) => q !== me && q.life === "alive");
    if (ally && Math.hypot(ally.x - me.x, ally.z - me.z) > SnBotTuning.ALLY_LEASH) { this.setGoal(ally.x, ally.z); return; }
    if (engine.time > this.wanderUntil || Math.hypot(this.wanderX - me.x, this.wanderZ - me.z) < 2 || Math.hypot(this.wanderX - ring.x, this.wanderZ - ring.z) > ring.r) {
      for (let tries = 0; tries < 20; tries++) {
        const a = this.random.range(0, Math.PI * 2), d = Math.sqrt(this.random.next()) * ring.r * 0.6;
        const x = ring.x + Math.cos(a) * d, z = ring.z + Math.sin(a) * d;
        const idx = SnGridMath.indexAt(x, z);
        if (idx < 0 || !engine.map.standable(idx)) continue;
        this.wanderX = x; this.wanderZ = z; break;
      }
      this.wanderUntil = engine.time + this.random.range(8, 12);
    }
    this.setGoal(this.wanderX, this.wanderZ);
  }

  private aroundWall(engine: SnEngine, me: SnPlayer, to: SnPoint): SnPoint {
    this.blockingWall = null;
    const d = Math.hypot(to.x - me.x, to.z - me.z), n = Math.max(1, Math.ceil(d / 0.4));
    for (const w of engine.walls) {
      if (!w.solid(engine.time) || w.distanceTo(me.x, me.z) > d + 2) continue;
      let crosses = false;
      for (let k = 1; k <= n && !crosses; k++) crosses = w.distanceTo(me.x + (to.x - me.x) * k / n, me.z + (to.z - me.z) * k / n) < SnBalance.RADIUS + 0.1;
      if (!crosses) continue;
      const ax = Math.cos(w.yaw), az = -Math.sin(w.yaw), reach = w.halfX + SnBalance.RADIUS + 0.6;
      const ends = [{ x: w.x + ax * reach, z: w.z + az * reach }, { x: w.x - ax * reach, z: w.z - az * reach }];
      ends.sort((a, b) => Math.hypot(a.x - to.x, a.z - to.z) + Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - to.x, b.z - to.z) - Math.hypot(b.x - me.x, b.z - me.z));
      const side = w.distanceTo(me.x, me.z) < SnBalance.RADIUS + 0.3 ? SnBalance.RADIUS + 0.5 : 0;
      const nx = Math.sin(w.yaw), nz = Math.cos(w.yaw), facing = (me.x - w.x) * nx + (me.z - w.z) * nz >= 0 ? 1 : -1;
      const graph = SnPathGraph.shared(engine.map);
      for (const end of ends) {
        const spot = { x: end.x + nx * facing * side, z: end.z + nz * facing * side };
        if (graph.straight(me.x, me.z, spot.x, spot.z)) return spot;
      }
      this.blockingWall = w;
      return to;
    }
    return to;
  }

  private clearRun(engine: SnEngine, x0: number, z0: number, x1: number, z1: number): boolean {
    if (!SnPathGraph.shared(engine.map).straight(x0, z0, x1, z1)) return false;
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 0.4));
    for (const w of engine.walls) for (let k = 1; k <= n; k++) if (w.distanceTo(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n) < SnBalance.RADIUS + 0.1) return false;
    return true;
  }

  private pickEscape(engine: SnEngine, me: SnPlayer): void {
    for (let tries = 0; tries < 24; tries++) {
      const a = this.random.range(0, Math.PI * 2), d = this.random.range(2, SnBotTuning.ESCAPE_RANGE);
      const x = me.x + Math.cos(a) * d, z = me.z + Math.sin(a) * d;
      if (!this.clearRun(engine, me.x, me.z, x, z)) continue;
      this.escapeX = x; this.escapeZ = z; this.escapeUntil = engine.time + SnBotTuning.ESCAPE_TIME;
      this.stuckStreak = 0;
      return;
    }
  }

  private steer(engine: SnEngine, me: SnPlayer, dt: number, intent: SnIntent): void {
    if (engine.time < this.escapeUntil && Math.hypot(this.escapeX - me.x, this.escapeZ - me.z) > 0.4) {
      const ex = this.escapeX - me.x, ez = this.escapeZ - me.z, el = Math.hypot(ex, ez);
      intent.moveX = ex / el; intent.moveZ = ez / el;
      this.lastX = me.x; this.lastZ = me.z; this.stuckFor = 0;
      return;
    }
    const dist = Math.hypot(this.goalX - me.x, this.goalZ - me.z);
    if (this.wantStill || !this.hasGoal || dist < 0.3) { this.lastX = me.x; this.lastZ = me.z; this.stuckFor = 0; return; }
    if (engine.time >= this.thinkAt - 0.01 || Math.hypot(this.waypointX - me.x, this.waypointZ - me.z) < 0.5) {
      const w = SnPathGraph.shared(engine.map).waypoint(me.x, me.z, this.goalX, this.goalZ);
      const around = this.aroundWall(engine, me, w);
      this.waypointX = around.x; this.waypointZ = around.z;
    }
    let mx = this.waypointX - me.x, mz = this.waypointZ - me.z;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len; mz /= len;
    if (engine.time < this.detourUntil) { const rx = -mz * this.detourDir, rz = mx * this.detourDir; mx = rx; mz = rz; }
    const pace = Math.min(1, dist / 1.5 + 0.3);
    intent.moveX = mx * pace; intent.moveZ = mz * pace;
    if (me.building(engine.time) || me.knockLeft > 0) { this.stuckFor = 0; this.lastX = me.x; this.lastZ = me.z; return; }
    this.stuckFor += dt;
    if (this.stuckFor < SnBotTuning.STUCK_TIME) return;
    const moved = Math.hypot(me.x - this.lastX, me.z - this.lastZ);
    if (moved < me.speed * this.stuckFor * 0.3 * pace && engine.time >= this.detourUntil) {
      this.detourDir = this.random.next() < 0.5 ? -1 : 1;
      this.detourUntil = engine.time + SnBotTuning.DETOUR_TIME;
      this.stuckStreak++;
      if (this.stuckStreak >= 2) this.pickEscape(engine, me);
    } else if (moved >= me.speed * this.stuckFor * 0.3 * pace) this.stuckStreak = 0;
    this.stuckFor = 0; this.lastX = me.x; this.lastZ = me.z;
  }
}
