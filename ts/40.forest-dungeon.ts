type FrMonsterState = "chase" | "windup" | "recover" | "dead";

class FrMonster {
  static nextId = 1;
  readonly id = FrMonster.nextId++;
  hp: number;
  state: FrMonsterState = "chase";
  timer = 0;
  flash = 0;
  facing = 0;
  vx = 0;
  vz = 0;
  deadFor = 0;

  constructor(readonly def: FrMonsterDef, public x: number, public z: number) { this.hp = def.hp; }
}

type FrFightEvent =
  | { t: "spawn"; monster: FrMonster }
  | { t: "windup"; monster: FrMonster }
  | { t: "hit"; monster: FrMonster; damage: number }
  | { t: "kill"; monster: FrMonster; drops: FrCost; legend: boolean }
  | { t: "hurt"; damage: number }
  | { t: "end"; reason: "time" | "dead" | "left" };

interface FrFightPlayer { x: number; z: number; facing: number }
interface FrFightGear { weaponTier: FrTier; reduction: number }

class FrDungeonFight {
  static readonly SPAWN_GAP = 1.35;
  static readonly MAX_ALIVE: Readonly<Record<FrDifficulty, number>> = { normal: 5, hard: 5, hell: 4 };
  static readonly STRIKE_RANGE = 2.2;
  static readonly HIT_RANGE = 2.7;
  static readonly RECOVER = 1.1;
  static readonly KNOCKBACK = 1.6;
  static readonly SPAWN_SAFE = 7;
  static readonly STUN = 1;
  static readonly EIGHT: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  readonly monsters: FrMonster[] = [];
  timeLeft = FrBalance.DUNGEON_SECONDS;
  health = FrBalance.PLAYER_HEALTH;
  kills = 0;
  ended: "time" | "dead" | "left" | null = null;
  stun = 0;
  attackCooldown = 0;
  pity = 0;
  private spawnTimer = 0.4;
  private legendMiss = 0;
  private flow = new Map<number, number>();
  private flowKey = -1;
  private flowAge = 0;

  constructor(readonly difficulty: FrDifficulty, private readonly random: FrRandom, private readonly spawnSpots: ReadonlyArray<[number, number]>, private readonly walkable: (x: number, z: number) => boolean, pityStart = 0) {
    this.legendMiss = pityStart;
  }

  get legendMissCount(): number { return this.legendMiss; }
  alive(): FrMonster[] { return this.monsters.filter((m) => m.state !== "dead"); }

  update(dt: number, player: FrFightPlayer, gear: FrFightGear): FrFightEvent[] {
    const events: FrFightEvent[] = [];
    if (this.ended) return events;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.spawn(dt, player, events);
    this.refreshFlow(player, dt);
    this.monsters.forEach((m) => this.step(m, dt, player, gear, events));
    for (let i = this.monsters.length - 1; i >= 0; i--) if (this.monsters[i].state === "dead" && (this.monsters[i].deadFor += dt) > 1.2) this.monsters.splice(i, 1);
    if (this.health <= 0) { this.ended = "dead"; events.push({ t: "end", reason: "dead" }); }
    else if (this.timeLeft <= 0) { this.ended = "time"; events.push({ t: "end", reason: "time" }); }
    return events;
  }

  private cellOf(v: number): number { return Math.floor(v / FrTerrainData.BLOCK); }
  private cellKey(x: number, z: number): number { return (z + 64) * 256 + (x + 64); }
  private cellOpen(x: number, z: number): boolean { const B = FrTerrainData.BLOCK; return this.walkable((x + 0.5) * B, (z + 0.5) * B); }

  private refreshFlow(player: FrFightPlayer, dt: number): void {
    this.flowAge += dt;
    const px = this.cellOf(player.x), pz = this.cellOf(player.z);
    const key = this.cellKey(px, pz);
    if (key === this.flowKey && this.flowAge < 1) return;
    this.flowKey = key;
    this.flowAge = 0;
    const dist = new Map<number, number>();
    const queue: Array<[number, number]> = [[px, pz]];
    dist.set(key, 0);
    for (let head = 0; head < queue.length && head < 2500; head++) {
      const [x, z] = queue[head];
      const d = dist.get(this.cellKey(x, z)) as number;
      for (const [dx, dz] of FrDungeonFight.EIGHT) {
        const nx = x + dx, nz = z + dz, k = this.cellKey(nx, nz);
        if (dist.has(k) || !this.cellOpen(nx, nz)) continue;
        if (dx !== 0 && dz !== 0 && (!this.cellOpen(x + dx, z) || !this.cellOpen(x, z + dz))) continue;
        dist.set(k, d + 1);
        queue.push([nx, nz]);
      }
    }
    this.flow = dist;
  }

  private chaseDirection(m: FrMonster, player: FrFightPlayer): [number, number] {
    const B = FrTerrainData.BLOCK;
    const cx = this.cellOf(m.x), cz = this.cellOf(m.z);
    const here = this.flow.get(this.cellKey(cx, cz));
    if (here === undefined || here <= 1) { const d = Math.hypot(player.x - m.x, player.z - m.z) || 1; return [(player.x - m.x) / d, (player.z - m.z) / d]; }
    let best = here, tx = cx, tz = cz;
    for (const [dx, dz] of FrDungeonFight.EIGHT) {
      const v = this.flow.get(this.cellKey(cx + dx, cz + dz));
      if (v !== undefined && v < best) { best = v; tx = cx + dx; tz = cz + dz; }
    }
    const gx = (tx + 0.5) * B - m.x, gz = (tz + 0.5) * B - m.z, d = Math.hypot(gx, gz) || 1;
    return [gx / d, gz / d];
  }

  private spawn(dt: number, player: FrFightPlayer, events: FrFightEvent[]): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || this.alive().length >= FrDungeonFight.MAX_ALIVE[this.difficulty]) return;
    const B = FrTerrainData.BLOCK;
    const spots = this.spawnSpots.filter(([x, z]) => Math.hypot((x + 0.5) * B - player.x, (z + 0.5) * B - player.z) >= FrDungeonFight.SPAWN_SAFE);
    if (spots.length === 0) return;
    this.spawnTimer = FrDungeonFight.SPAWN_GAP;
    const [x, z] = this.random.pick(spots);
    const defs = FrCatalog.MONSTERS[this.difficulty];
    const def = this.difficulty === "hell" ? (this.random.chance(0.2) ? defs[2] : defs[this.random.between(0, 1)]) : defs[this.random.between(0, defs.length - 1)];
    const monster = new FrMonster(def, (x + 0.5) * B, (z + 0.5) * B);
    this.monsters.push(monster);
    events.push({ t: "spawn", monster });
  }

  private step(m: FrMonster, dt: number, player: FrFightPlayer, gear: FrFightGear, events: FrFightEvent[]): void {
    if (m.state === "dead") return;
    m.flash = Math.max(0, m.flash - dt);
    if (m.vx !== 0 || m.vz !== 0) { this.slide(m, m.vx * dt, m.vz * dt); m.vx *= Math.max(0, 1 - dt * 7); m.vz *= Math.max(0, 1 - dt * 7); if (Math.hypot(m.vx, m.vz) < 0.2) { m.vx = 0; m.vz = 0; } }
    const dx = player.x - m.x, dz = player.z - m.z, distance = Math.hypot(dx, dz);
    if (m.state === "chase") {
      m.facing = Math.atan2(dx, dz);
      if (distance <= FrDungeonFight.STRIKE_RANGE) { m.state = "windup"; m.timer = FrBalance.MONSTER_WINDUP; events.push({ t: "windup", monster: m }); return; }
      if (m.vx === 0 && m.vz === 0) { const [ux, uz] = this.chaseDirection(m, player); this.slide(m, ux * m.def.speed * dt, uz * m.def.speed * dt); }
    } else if (m.state === "windup") {
      m.timer -= dt;
      if (m.timer <= 0) {
        if (distance <= FrDungeonFight.HIT_RANGE) {
          const damage = FrDungeonRules.damageTaken(m.def.attack, gear.reduction);
          this.health = Math.max(0, this.health - damage);
          events.push({ t: "hurt", damage });
        }
        m.state = "recover";
        m.timer = FrDungeonFight.RECOVER;
      }
    } else if (m.state === "recover") {
      m.timer -= dt;
      if (m.timer <= 0) m.state = "chase";
    }
  }

  private slide(m: FrMonster, dx: number, dz: number): void {
    if (this.walkable(m.x + dx, m.z)) m.x += dx;
    if (this.walkable(m.x, m.z + dz)) m.z += dz;
  }

  attack(player: FrFightPlayer, gear: FrFightGear): FrFightEvent[] {
    const events: FrFightEvent[] = [];
    if (this.ended || this.attackCooldown > 0 || this.stun > 0) return events;
    this.attackCooldown = FrBalance.ATTACK_INTERVAL;
    const damage = FrDungeonRules.weaponDamage(gear.weaponTier);
    this.monsters.forEach((m) => {
      if (m.state === "dead" || !FrDungeonRules.inAttackArc(m.x - player.x, m.z - player.z, player.facing)) return;
      m.hp -= damage;
      m.flash = 0.2;
      const away = Math.hypot(m.x - player.x, m.z - player.z) || 1;
      m.vx = ((m.x - player.x) / away) * FrDungeonFight.KNOCKBACK * 7;
      m.vz = ((m.z - player.z) / away) * FrDungeonFight.KNOCKBACK * 7;
      if (m.state === "windup") { m.state = "recover"; m.timer = FrDungeonFight.RECOVER * 0.6; }
      events.push({ t: "hit", monster: m, damage });
      if (m.hp <= 0) this.kill(m, events);
    });
    return events;
  }

  private kill(m: FrMonster, events: FrFightEvent[]): void {
    m.state = "dead";
    m.deadFor = 0;
    this.kills += 1;
    const roll = FrDungeonDrops.roll(this.random, this.difficulty, this.legendMiss);
    this.legendMiss = roll.gotLegend ? 0 : this.legendMiss + 1;
    events.push({ t: "kill", monster: m, drops: roll.items, legend: roll.gotLegend });
  }

  heal(amount: number): boolean {
    if (this.health >= FrBalance.PLAYER_HEALTH || this.ended) return false;
    this.health = Math.min(FrBalance.PLAYER_HEALTH, this.health + amount);
    this.stun = FrDungeonFight.STUN;
    return true;
  }

  leave(): FrFightEvent[] {
    if (this.ended) return [];
    this.ended = "left";
    return [{ t: "end", reason: "left" }];
  }
}

class FrDungeonInfo {
  static readonly NAMES: Readonly<Record<FrDifficulty, string>> = { normal: "노말", hard: "하드", hell: "헬" };
  static readonly KIND: Readonly<Record<FrDifficulty, string>> = { normal: "moss", hard: "crystal", hell: "lava" };
  static readonly CAVE_NAMES: Readonly<Record<FrDifficulty, string>> = { normal: "이끼 동굴", hard: "수정 동굴", hell: "용암 동굴" };
  static readonly SUMMARY: Readonly<Record<FrDifficulty, string>> = { normal: "맨손으로도 괜찮아요", hard: "철 장비를 추천해요", hell: "다이아몬드 장비가 있으면 든든해요" };
  static readonly RECOMMENDED: Readonly<Record<FrDifficulty, string>> = { normal: "맨손 · 나무 무기", hard: "철 무기 · 철 방어구", hell: "다이아몬드 무기 · 철 이상 방어구" };
  static readonly STAT_ENTER: Readonly<Record<FrDifficulty, string>> = { normal: "dungeonNormal", hard: "dungeonHard", hell: "dungeonHell" };
  static readonly STAT_KILL: Readonly<Record<FrDifficulty, string>> = { normal: "killNormal", hard: "killHard", hell: "killHell" };

  static dropIds(difficulty: FrDifficulty): string[] { return FrCatalog.DROPS[difficulty].map((d) => d.item); }
  static monsterNames(difficulty: FrDifficulty): string[] {
    const seen: string[] = [];
    FrCatalog.MONSTERS[difficulty].forEach((m) => { if (seen.indexOf(m.name) < 0) seen.push(m.name); });
    return seen;
  }

  static armorOf(session: FrSession): { helmet: FrTier; top: FrTier; bottom: FrTier; shoes: FrTier } {
    return { helmet: session.bag.bestTier("helmet"), top: session.bag.bestTier("top"), bottom: session.bag.bestTier("bottom"), shoes: session.bag.bestTier("shoes") };
  }

  static gearOf(session: FrSession): FrFightGear {
    return { weaponTier: session.bag.bestTier("weapon"), reduction: FrDungeonRules.armorReduction(FrDungeonInfo.armorOf(session)) };
  }
}

class FrRingKit {
  static ringSlots(session: FrSession): FrBagSlot[] { return session.bag.slots.filter((s) => s.id === "ring"); }

  static best(session: FrSession): FrBagSlot | null {
    const rings = FrRingKit.ringSlots(session);
    if (rings.length === 0) return null;
    return rings.reduce((a, b) => (b.uses > a.uses ? b : a));
  }

  static level(session: FrSession): number {
    const best = FrRingKit.best(session);
    return best ? best.uses : 0;
  }

  static spare(session: FrSession): FrBagSlot[] {
    const best = FrRingKit.best(session);
    return FrRingKit.ringSlots(session).filter((s) => s !== best);
  }

  static enhanceCost(session: FrSession): { enhance: number; magic: number; rate: number } | null {
    const best = FrRingKit.best(session);
    if (!best || best.uses >= FrBalance.RING_MAX_LEVEL) return null;
    const target = best.uses + 1;
    return { ...FrRingRules.cost(target), rate: FrRingRules.successRate(target) };
  }

  static enhance(session: FrSession, random: FrRandom): { done: boolean; success: boolean; level: number } {
    const best = FrRingKit.best(session);
    const cost = FrRingKit.enhanceCost(session);
    if (!best || !cost || session.bag.count("enhance_stone") < cost.enhance || session.bag.count("magic_stone") < cost.magic) return { done: false, success: false, level: best ? best.uses : 0 };
    session.bag.take("enhance_stone", cost.enhance);
    session.bag.take("magic_stone", cost.magic);
    const result = FrRingRules.attempt(best.uses, random);
    best.uses = result.level;
    session.stats.atLeast("ringLevel", best.uses);
    session.changed();
    return { done: true, success: result.success, level: best.uses };
  }

  static melt(session: FrSession): boolean {
    const spare = FrRingKit.spare(session)[0];
    if (!spare) return false;
    session.bag.slots.splice(session.bag.slots.indexOf(spare), 1);
    session.gain("enhance_stone", FrBalance.RING_MELT_ENHANCE);
    return true;
  }
}
