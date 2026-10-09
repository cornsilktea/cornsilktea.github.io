interface WarCorpse { team: WarTeam; x: number; y: number; tick: number }

type WarSquadMode = "home" | "away" | "returning";
type WarWinner = 0 | 1 | 2;
type WarEndReason = "hq" | "time" | "surrender";
type WarEventKind = "revived" | "raised" | "produced" | "built" | "unitDied" | "buildingDestroyed" | "ended" | "alert";

interface WarEvent { kind: WarEventKind; team: WarTeam; tick: number; text: string; winner?: WarWinner; x?: number; y?: number }
interface WarResult { winner: WarWinner; reason: WarEndReason; tick: number }
interface WarEngineOptions { seed: number; factions: [WarFactionId, WarFactionId] }
interface WarCommandJson { type: string; team: WarTeam; [field: string]: unknown }

interface WarAttacker {
  readonly id: number;
  readonly team: WarTeam;
  x: number;
  y: number;
  cooldownLeft: number;
  splashRadius(): number;
  cooldownTicks(): number;
  damageAgainst(target: WarEntity): number;
  afterStrike(target: WarEntity): void;
}

class WarMath {
  static isqrt(value: number): number {
    return Math.floor(Math.sqrt(value));
  }

  static dist(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return WarMath.isqrt(dx * dx + dy * dy);
  }

  static clamp(value: number, low: number, high: number): number {
    return value < low ? low : value > high ? high : value;
  }

  static stepToward(from: WarPoint, to: WarPoint, step: number): WarPoint {
    const distance = WarMath.dist(from.x, from.y, to.x, to.y);
    if (distance <= step) return { x: to.x, y: to.y };
    return {
      x: from.x + Math.trunc(((to.x - from.x) * step) / distance),
      y: from.y + Math.trunc(((to.y - from.y) * step) / distance),
    };
  }

  static headingThousandths(from: WarPoint, to: WarPoint): WarPoint | null {
    const distance = WarMath.dist(from.x, from.y, to.x, to.y);
    if (distance === 0) return null;
    return { x: Math.trunc(((to.x - from.x) * 1000) / distance), y: Math.trunc(((to.y - from.y) * 1000) / distance) };
  }
}

class WarRandom {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let m = this.state;
    m = Math.imul(m ^ (m >>> 15), m | 1);
    m ^= m + Math.imul(m ^ (m >>> 7), m | 61);
    return (m ^ (m >>> 14)) >>> 0;
  }

  below(limit: number): number {
    return this.next() % limit;
  }

  between(low: number, high: number): number {
    return low + this.below(high - low + 1);
  }
}

abstract class WarEntity {
  hp: number;
  lastHitTick = -1000;
  lastAttackerId = -1;

  constructor(readonly id: number, readonly team: WarTeam, public x: number, public y: number, readonly maxHp: number) {
    this.hp = maxHp;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  abstract bodyRadius(): number;
}

class WarUnit extends WarEntity implements WarAttacker {
  squadIndex = -1;
  attached = false;
  targetId = -1;
  cooldownLeft = 0;
  chargeReady: boolean;
  slowTicksLeft = 0;
  slowPct = 0;
  marchTicks = 0;
  revived = false;
  readonly ability: WarAbility | null;

  constructor(id: number, team: WarTeam, x: number, y: number, readonly def: WarUnitDef) {
    super(id, team, x, y, def.hp);
    this.chargeReady = def.chargeBonusPct > 0;
    this.ability = WarAbilityFactory.forDef(def);
  }

  bodyRadius(): number {
    return 40;
  }

  stepLength(): number {
    const base = Math.floor(this.def.speed / 10);
    return this.slowTicksLeft > 0 ? Math.floor((base * (100 - this.slowPct)) / 100) : base;
  }

  splashRadius(): number {
    return this.def.splashRadius;
  }

  cooldownTicks(): number {
    return this.slowTicksLeft > 0 ? Math.floor((this.def.cooldownTicks * (100 + this.slowPct)) / 100) : this.def.cooldownTicks;
  }

  damageAgainst(target: WarEntity): number {
    let damage = this.def.damage;
    if (target instanceof WarBuilding) damage = Math.trunc((damage * this.def.buildingDamagePct) / 100);
    if (this.chargeReady) damage += Math.trunc((damage * this.def.chargeBonusPct) / 100);
    if (target instanceof WarUnit) damage = Math.trunc((damage * (100 - target.def.armorPct)) / 100);
    return Math.max(1, damage);
  }

  afterStrike(target: WarEntity): void {
    this.chargeReady = false;
    if (this.def.slowPct > 0 && target instanceof WarUnit) {
      target.slowPct = this.def.slowPct;
      target.slowTicksLeft = this.def.slowTicks;
    }
  }

  reach(target: WarEntity): number {
    return this.def.range + target.bodyRadius();
  }

  retarget(targetId: number): void {
    if (targetId === this.targetId) return;
    this.targetId = targetId;
    this.chargeReady = this.def.chargeBonusPct > 0;
  }

  moveToward(point: WarPoint, step: number): void {
    const next = WarMath.stepToward(this, point, step);
    this.x = next.x;
    this.y = next.y;
  }
}

class WarProductionItem {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly ore: number,
    readonly crystal: number,
    readonly pop: number,
    readonly ticks: number,
    readonly workerKind: WarWorkerKind | null,
    readonly unitDef: WarUnitDef | null,
  ) {}

  static from(id: string): WarProductionItem {
    if (id === "worker_ore") return new WarProductionItem(id, "광석 일꾼", WarBalance.WORKER_ORE, 0, 1, WarBalance.WORKER_BUILD_TICKS, "ore", null);
    if (id === "worker_crystal") return new WarProductionItem(id, "결정 일꾼", WarBalance.WORKER_CRYSTAL_ORE, WarBalance.WORKER_CRYSTAL_CRYSTAL, 1, WarBalance.WORKER_BUILD_TICKS, "crystal", null);
    const def = WarUnitCatalog.byId(id);
    return new WarProductionItem(id, def.name, def.ore, def.crystal, def.pop * def.spawnCount, def.buildTicks, null, def);
  }
}

class WarQueuedItem {
  constructor(readonly item: WarProductionItem, public ticksLeft: number) {}
}

class WarBuilding extends WarEntity {
  buildLeft: number;
  readonly queue: WarQueuedItem[] = [];

  constructor(id: number, team: WarTeam, x: number, y: number, readonly def: WarBuildingDef, readonly slotIndex: number, underConstruction: boolean) {
    super(id, team, x, y, def.hp);
    this.buildLeft = underConstruction ? def.buildTicks : 0;
  }

  bodyRadius(): number {
    return this.def.radius;
  }

  get complete(): boolean {
    return this.buildLeft === 0;
  }

  canProduce(item: WarProductionItem): boolean {
    if (!this.complete) return false;
    if (this.def.type === "hq") return item.workerKind !== null;
    return item.unitDef !== null && item.unitDef.kind === this.def.producesKind;
  }
}

class WarEconomy {
  static readonly MILLI_TABLE: number[] = WarEconomy.buildMilliTable();

  ore = WarBalance.START_ORE;
  crystal = WarBalance.START_CRYSTAL;
  oreWorkers = WarBalance.START_ORE_WORKERS;
  crystalWorkers = WarBalance.START_CRYSTAL_WORKERS;
  popUsed = WarBalance.START_ORE_WORKERS + WarBalance.START_CRYSTAL_WORKERS;
  oreRemainder = 0;
  crystalRemainder = 0;

  private static buildMilliTable(): number[] {
    const table = [0];
    let total = 0;
    let factor = WarBalance.FIRST_WORKER_MILLI_PER_SEC;
    for (let n = 1; n <= WarBalance.WORKER_CAP_PER_RESOURCE; n++) {
      total += factor;
      table.push(Math.round(total));
      factor = (factor * WarBalance.DIMINISH_PERCENT) / 100;
    }
    return table;
  }

  static milliPerSecond(workers: number, isCrystal: boolean): number {
    const base = WarEconomy.MILLI_TABLE[WarMath.clamp(workers, 0, WarBalance.WORKER_CAP_PER_RESOURCE)];
    return isCrystal ? Math.trunc((base * WarBalance.CRYSTAL_SPEED_PERCENT) / 100) : base;
  }

  get popFree(): number {
    return WarBalance.POP_CAP - this.popUsed;
  }

  canAfford(ore: number, crystal: number): boolean {
    return this.ore >= ore && this.crystal >= crystal;
  }

  spend(ore: number, crystal: number): void {
    this.ore -= ore;
    this.crystal -= crystal;
  }

  workersOf(kind: WarWorkerKind): number {
    return kind === "ore" ? this.oreWorkers : this.crystalWorkers;
  }

  addWorker(kind: WarWorkerKind): void {
    if (kind === "ore") this.oreWorkers++;
    else this.crystalWorkers++;
  }

  tick(): void {
    this.oreRemainder += WarEconomy.milliPerSecond(this.oreWorkers, false);
    this.crystalRemainder += WarEconomy.milliPerSecond(this.crystalWorkers, true);
    const perOre = 1000 * WarBalance.TICKS_PER_SEC;
    this.ore += Math.floor(this.oreRemainder / perOre);
    this.oreRemainder %= perOre;
    this.crystal += Math.floor(this.crystalRemainder / perOre);
    this.crystalRemainder %= perOre;
  }
}

class WarTerrain {
  private static readonly CORRIDORS: WarCorridor[] = WarMapData.corridors();

  static clamp(point: WarPoint): WarPoint {
    let best: WarPoint | null = null;
    let bestOutside = Number.MAX_SAFE_INTEGER;
    for (const corridor of WarTerrain.CORRIDORS) {
      const near = WarTerrain.nearestOnSegment(point, corridor);
      const distance = WarMath.dist(point.x, point.y, near.x, near.y);
      if (distance <= corridor.halfWidth) return point;
      const outside = distance - corridor.halfWidth;
      if (outside >= bestOutside) continue;
      bestOutside = outside;
      best = { x: near.x + Math.trunc(((point.x - near.x) * corridor.halfWidth) / distance), y: near.y + Math.trunc(((point.y - near.y) * corridor.halfWidth) / distance) };
    }
    return best as WarPoint;
  }

  private static nearestOnSegment(point: WarPoint, corridor: WarCorridor): WarPoint {
    const dx = corridor.bx - corridor.ax;
    const dy = corridor.by - corridor.ay;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return { x: corridor.ax, y: corridor.ay };
    const dot = (point.x - corridor.ax) * dx + (point.y - corridor.ay) * dy;
    if (dot <= 0) return { x: corridor.ax, y: corridor.ay };
    if (dot >= lengthSq) return { x: corridor.bx, y: corridor.by };
    return { x: corridor.ax + Math.trunc((dx * dot) / lengthSq), y: corridor.ay + Math.trunc((dy * dot) / lengthSq) };
  }
}

class WarNavGraph {
  private static readonly NODES: WarNavNode[] = WarMapData.navNodes();
  private static readonly WALK_SAMPLE_CM = 150;

  static isWalkable(from: WarPoint, to: WarPoint): boolean {
    const length = WarMath.dist(from.x, from.y, to.x, to.y);
    const steps = Math.max(1, Math.ceil(length / WarNavGraph.WALK_SAMPLE_CM));
    for (let i = 1; i < steps; i++) {
      const point = { x: from.x + Math.trunc(((to.x - from.x) * i) / steps), y: from.y + Math.trunc(((to.y - from.y) * i) / steps) };
      const fixed = WarTerrain.clamp(point);
      if (fixed.x !== point.x || fixed.y !== point.y) return false;
    }
    return true;
  }

  static connect(from: WarPoint, to: WarPoint): WarPoint[] {
    if (WarNavGraph.isWalkable(from, to)) return [{ x: to.x, y: to.y }];
    const nodes = WarNavGraph.route(from, to);
    while (nodes.length > 1 && WarNavGraph.isWalkable(from, nodes[1])) nodes.shift();
    return nodes;
  }

  static straighten(start: WarPoint, points: WarPoint[]): WarPoint[] {
    const result: WarPoint[] = [];
    let from = start;
    let i = 0;
    while (i < points.length) {
      let farthest = i;
      for (let j = points.length - 1; j > i; j--) {
        if (WarNavGraph.isWalkable(from, points[j])) {
          farthest = j;
          break;
        }
      }
      result.push(points[farthest]);
      from = points[farthest];
      i = farthest + 1;
    }
    return result;
  }

  static route(from: WarPoint, to: WarPoint): WarPoint[] {
    const start = WarNavGraph.nearest(from);
    const goal = WarNavGraph.nearest(to);
    const chain = WarNavGraph.shortest(start, goal);
    const points = chain.map((node) => ({ x: node.x, y: node.y }));
    points.push({ x: to.x, y: to.y });
    return points;
  }

  private static nearest(point: WarPoint): WarNavNode {
    let best = WarNavGraph.NODES[0];
    let bestDistance = Number.MAX_SAFE_INTEGER;
    for (const node of WarNavGraph.NODES) {
      const distance = WarMath.dist(point.x, point.y, node.x, node.y);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = node;
    }
    return best;
  }

  private static shortest(start: WarNavNode, goal: WarNavNode): WarNavNode[] {
    const cost = new Map<string, number>([[start.id, 0]]);
    const previous = new Map<string, string>();
    const open = [start.id];
    const done = new Set<string>();
    while (open.length > 0) {
      open.sort((a, b) => (cost.get(a) as number) - (cost.get(b) as number) || (a < b ? -1 : 1));
      const currentId = open.shift() as string;
      if (done.has(currentId)) continue;
      done.add(currentId);
      const current = WarNavGraph.node(currentId);
      for (const linkId of current.links) {
        const link = WarNavGraph.node(linkId);
        const through = (cost.get(currentId) as number) + WarMath.dist(current.x, current.y, link.x, link.y);
        if (cost.has(linkId) && (cost.get(linkId) as number) <= through) continue;
        cost.set(linkId, through);
        previous.set(linkId, currentId);
        open.push(linkId);
      }
    }
    const chain: WarNavNode[] = [];
    let walker: string | undefined = goal.id;
    while (walker !== undefined) {
      chain.unshift(WarNavGraph.node(walker));
      walker = previous.get(walker);
    }
    return chain;
  }

  private static node(id: string): WarNavNode {
    return WarNavGraph.NODES.find((n) => n.id === id) as WarNavNode;
  }
}

class WarVision {
  private static readonly COLS = Math.ceil((WarMapData.HALF_W * 2) / WarMapData.VISION_CELL);
  private static readonly ROWS = Math.ceil((WarMapData.HALF_H * 2) / WarMapData.VISION_CELL);

  private readonly grids: Uint8Array[] = [new Uint8Array(WarVision.COLS * WarVision.ROWS), new Uint8Array(WarVision.COLS * WarVision.ROWS)];
  private readonly homeLayers: Uint8Array[] = [new Uint8Array(WarVision.COLS * WarVision.ROWS), new Uint8Array(WarVision.COLS * WarVision.ROWS)];
  private homeReady = false;

  update(entities: WarEntity[]): void {
    if (!this.homeReady) this.paintHomeLayers();
    this.grids[0].set(this.homeLayers[0]);
    this.grids[1].set(this.homeLayers[1]);
    const seen = new Set<number>();
    const cell = WarMapData.VISION_CELL;
    for (const entity of entities) {
      if (!entity.alive) continue;
      const radius = entity instanceof WarUnit ? WarBalance.SIGHT_UNIT : WarBalance.SIGHT_BUILDING;
      const snapX = Math.floor((entity.x + WarMapData.HALF_W) / cell);
      const snapY = Math.floor((entity.y + WarMapData.HALF_H) / cell);
      const key = ((snapY * WarVision.COLS + snapX) * 2 + entity.team) * 2 + (radius === WarBalance.SIGHT_UNIT ? 0 : 1);
      if (seen.has(key)) continue;
      seen.add(key);
      this.reveal(this.grids[entity.team], entity.x, entity.y, radius);
    }
  }

  isVisible(team: WarTeam, x: number, y: number): boolean {
    const col = Math.floor((x + WarMapData.HALF_W) / WarMapData.VISION_CELL);
    const row = Math.floor((y + WarMapData.HALF_H) / WarMapData.VISION_CELL);
    if (col < 0 || row < 0 || col >= WarVision.COLS || row >= WarVision.ROWS) return false;
    return this.grids[team][row * WarVision.COLS + col] === 1;
  }

  private paintHomeLayers(): void {
    this.homeReady = true;
    for (const team of [0, 1] as WarTeam[]) {
      const layer = this.homeLayers[team];
      for (const zone of WarMapData.SHARED_VISION_ZONES) this.reveal(layer, zone.x, zone.y, zone.radius);
      const hq = WarMapData.hq(team);
      const gate = WarMapData.entrance(team);
      this.reveal(layer, hq.x, hq.y, WarMapData.BASE_RADIUS + WarBalance.HOME_VISION_EXTRA);
      this.reveal(layer, gate.x, gate.y, WarMapData.PLAZA_RADIUS);
    }
  }

  private reveal(grid: Uint8Array, x: number, y: number, radius: number): void {
    const cell = WarMapData.VISION_CELL;
    const half = cell / 2;
    const limit = (radius + 1) * (radius + 1) - 1;
    const rowLow = Math.max(0, Math.floor((y - radius + WarMapData.HALF_H) / cell));
    const rowHigh = Math.min(WarVision.ROWS - 1, Math.floor((y + radius + WarMapData.HALF_H) / cell));
    for (let row = rowLow; row <= rowHigh; row++) {
      const dy = row * cell + half - WarMapData.HALF_H - y;
      const remaining = limit - dy * dy;
      if (remaining < 0) continue;
      const reach = Math.floor(Math.sqrt(remaining));
      const colLow = Math.max(0, Math.ceil((x - reach + WarMapData.HALF_W - half) / cell));
      const colHigh = Math.min(WarVision.COLS - 1, Math.floor((x + reach + WarMapData.HALF_W - half) / cell));
      const offset = row * WarVision.COLS;
      for (let col = colLow; col <= colHigh; col++) grid[offset + col] = 1;
    }
  }
}

class SquadCursor {
  squad = 0;
  placedInBatch = 0;

  constructor(readonly batchSize: number) {}
}

class WarSquadAssigner {
  private readonly cursors: Record<WarUnitKind, SquadCursor> = {
    melee: new SquadCursor(WarBalance.BATCH_MELEE),
    ranged: new SquadCursor(WarBalance.BATCH_RANGED),
    elite: new SquadCursor(WarBalance.BATCH_ELITE),
  };

  constructor(private readonly squads: WarSquad[]) {}

  assign(unit: WarUnit): WarSquad | null {
    const cursor = this.cursors[unit.def.kind];
    const target = this.firstWithRoomFrom(cursor.squad);
    if (target === null) return null;
    if (target.index !== cursor.squad) {
      cursor.squad = target.index;
      cursor.placedInBatch = 0;
    }
    target.add(unit);
    cursor.placedInBatch++;
    if (cursor.placedInBatch >= cursor.batchSize) {
      cursor.squad = (cursor.squad + 1) % this.squads.length;
      cursor.placedInBatch = 0;
    }
    return target;
  }

  cursorOf(kind: WarUnitKind): SquadCursor {
    return this.cursors[kind];
  }

  private firstWithRoomFrom(start: number): WarSquad | null {
    for (let i = 0; i < this.squads.length; i++) {
      const squad = this.squads[(start + i) % this.squads.length];
      if (squad.members.length < WarBalance.SQUAD_CAP) return squad;
    }
    return null;
  }
}

class WarFormation {
  private static readonly ROW_FORWARD: Record<WarRole, number> = { front: 260, mid: 0, rear: -420 };
  private static readonly LATERAL_SPACING = 130;
  private static readonly SUBROW_SIZE = 10;
  private static readonly SUBROW_BACK = 160;

  static slots(members: WarUnit[], anchor: WarPoint, heading: WarPoint): Map<number, WarPoint> {
    const result = new Map<number, WarPoint>();
    for (const role of ["front", "mid", "rear"] as WarRole[]) {
      const row = members.filter((unit) => unit.def.role === role).sort((a, b) => a.id - b.id);
      row.forEach((unit, i) => {
        const subRow = Math.floor(i / WarFormation.SUBROW_SIZE);
        const inRow = Math.min(WarFormation.SUBROW_SIZE, row.length - subRow * WarFormation.SUBROW_SIZE);
        const index = i - subRow * WarFormation.SUBROW_SIZE;
        const forward = WarFormation.ROW_FORWARD[role] - subRow * WarFormation.SUBROW_BACK;
        const lateral = Math.trunc(((2 * index - (inRow - 1)) * WarFormation.LATERAL_SPACING) / 2);
        result.set(unit.id, {
          x: anchor.x + Math.trunc((heading.x * forward - heading.y * lateral) / 1000),
          y: anchor.y + Math.trunc((heading.y * forward + heading.x * lateral) / 1000),
        });
      });
    }
    return result;
  }
}

class WarSquad {
  readonly members: WarUnit[] = [];
  mode: WarSquadMode = "home";
  anchor: WarPoint;
  heading: WarPoint;
  path: WarPoint[] = [];
  lagTicks = 0;
  moveFreeTicks = 0;
  slots = new Map<number, WarPoint>();
  postSlots = new Map<number, WarPoint>();

  constructor(readonly team: WarTeam, readonly index: number) {
    this.anchor = WarMapData.post(team, index);
    this.heading = { x: 0, y: -1000 * WarMapData.sign(team) };
  }

  get post(): WarPoint {
    return WarMapData.post(this.team, this.index);
  }

  add(unit: WarUnit): void {
    unit.squadIndex = this.index;
    unit.attached = this.mode === "home";
    this.members.push(unit);
  }

  remove(unit: WarUnit): void {
    const at = this.members.indexOf(unit);
    if (at >= 0) this.members.splice(at, 1);
  }

  attachedMembers(): WarUnit[] {
    return this.members.filter((unit) => unit.attached);
  }

  speed(): number {
    const attached = this.attachedMembers();
    if (attached.length === 0) return 0;
    return Math.min(...attached.map((unit) => unit.stepLength()));
  }

  isEngaged(): boolean {
    return this.members.some((unit) => unit.attached && unit.targetId >= 0);
  }

  sendAlong(points: WarPoint[]): void {
    if (points.length === 0) return;
    let from = this.anchor;
    const path: WarPoint[] = [];
    for (const point of points) {
      const target = WarTerrain.clamp(point);
      if (WarMath.dist(from.x, from.y, target.x, target.y) < WarBalance.PATH_MIN_STEP) continue;
      path.push(...WarNavGraph.connect(from, target));
      from = target;
    }
    this.path = WarNavGraph.straighten(this.anchor, path);
    this.mode = "away";
    this.lagTicks = WarBalance.LAG_PATIENCE_TICKS;
    this.moveFreeTicks = WarBalance.DEPART_FREE_TICKS;
    for (const unit of this.members) {
      unit.attached = true;
      unit.marchTicks = WarBalance.DEPART_FREE_TICKS;
      unit.targetId = -1;
    }
  }

  recall(): void {
    this.path = WarNavGraph.straighten(this.anchor, WarNavGraph.connect(this.anchor, this.post));
    this.mode = "returning";
    this.lagTicks = 0;
    this.moveFreeTicks = WarBalance.DEPART_FREE_TICKS;
    for (const unit of this.members) {
      unit.attached = true;
      unit.marchTicks = WarBalance.DEPART_FREE_TICKS;
      unit.targetId = -1;
    }
  }

  planSlots(): void {
    this.slots = WarFormation.slots(this.attachedMembers(), this.anchor, this.heading);
    const waiting = this.members.filter((unit) => !unit.attached);
    const home = { x: this.post.x, y: this.post.y };
    this.postSlots = WarFormation.slots(waiting, home, { x: 0, y: -1000 * WarMapData.sign(this.team) });
  }

  slotOf(unit: WarUnit): WarPoint {
    const found = unit.attached ? this.slots.get(unit.id) : this.postSlots.get(unit.id);
    return found ?? this.anchor;
  }

  advanceAnchor(): void {
    if (this.mode === "home") {
      this.anchor = this.post;
      return;
    }
    if (this.attachedMembers().length === 0) {
      this.arriveHome();
      this.anchor = this.post;
      this.path = [];
      return;
    }
    if (this.path.length === 0) return;
    if (this.moveFreeTicks > 0) this.moveFreeTicks--;
    else if (this.isEngaged() || this.isStalledByLag()) return;
    const step = this.speed();
    if (step === 0) return;
    const goal = this.path[0];
    const turn = WarMath.headingThousandths(this.anchor, goal);
    if (turn) this.heading = turn;
    this.anchor = WarMath.stepToward(this.anchor, goal, step);
    if (this.anchor.x === goal.x && this.anchor.y === goal.y) this.path.shift();
    if (this.path.length === 0 && this.mode === "returning") this.arriveHome();
  }

  arriveHome(): void {
    this.mode = "home";
    this.heading = { x: 0, y: -1000 * WarMapData.sign(this.team) };
    for (const unit of this.members) unit.attached = true;
  }

  private isStalledByLag(): boolean {
    let worst = 0;
    for (const unit of this.attachedMembers()) {
      if (WarMath.dist(unit.x, unit.y, this.anchor.x, this.anchor.y) > WarBalance.LAG_IGNORE_FAR) continue;
      const slot = this.slotOf(unit);
      worst = Math.max(worst, WarMath.dist(unit.x, unit.y, slot.x, slot.y));
    }
    if (worst <= WarBalance.FORMATION_LAG) {
      this.lagTicks = 0;
      return false;
    }
    this.lagTicks++;
    return this.lagTicks < WarBalance.LAG_PATIENCE_TICKS;
  }
}

class WarPlayer {
  readonly economy = new WarEconomy();
  readonly squads: WarSquad[];
  readonly assigner: WarSquadAssigner;
  readonly slotBuildings: (WarBuilding | null)[];
  readonly slotDefs: WarSlotDef[];
  hq: WarBuilding | null = null;
  unitsProduced = 0;
  unitsLost = 0;

  constructor(readonly team: WarTeam, readonly faction: WarFactionId) {
    this.squads = [0, 1, 2].map((index) => new WarSquad(team, index));
    this.assigner = new WarSquadAssigner(this.squads);
    this.slotDefs = WarMapData.slots(team);
    this.slotBuildings = this.slotDefs.map(() => null);
  }

  buildings(): WarBuilding[] {
    const list = this.slotBuildings.filter((b): b is WarBuilding => b !== null);
    if (this.hq) list.push(this.hq);
    return list;
  }
}

class WarCombat {
  static readonly SPLASH_FALLOFF_PERCENT = 60;

  static strike(engine: WarEngine, attacker: WarAttacker, target: WarEntity): void {
    const damage = attacker.damageAgainst(target);
    engine.damage(target, damage, attacker.id);
    const radius = attacker.splashRadius();
    if (radius > 0) {
      const splash = Math.max(1, Math.trunc((damage * WarCombat.SPLASH_FALLOFF_PERCENT) / 100));
      for (const other of engine.entities) {
        if (other === target || !other.alive || other.team === attacker.team) continue;
        if (WarMath.dist(other.x, other.y, target.x, target.y) <= radius) engine.damage(other, splash, attacker.id);
      }
    }
    attacker.cooldownLeft = attacker.cooldownTicks();
    attacker.afterStrike(target);
  }
}

class WarTargeting {
  private static assistTarget(engine: WarEngine, unit: WarUnit, origin: WarPoint): WarEntity | null {
    const reachSq = WarBalance.ASSIST_RANGE * WarBalance.ASSIST_RANGE;
    let best: WarEntity | null = null;
    let bestSq = Number.MAX_SAFE_INTEGER;
    for (const ally of engine.entitiesOf(unit.team)) {
      if (ally.lastAttackerId < 0 || engine.tick - ally.lastHitTick > WarBalance.ASSIST_MEMORY_TICKS) continue;
      const dx = unit.x - ally.x;
      const dy = unit.y - ally.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > reachSq) continue;
      const attacker = engine.entityById(ally.lastAttackerId);
      if (!attacker || !attacker.alive || attacker.team === unit.team) continue;
      if (!engine.vision.isVisible(unit.team, attacker.x, attacker.y)) continue;
      if (WarMath.dist(origin.x, origin.y, attacker.x, attacker.y) > WarBalance.LEASH_RANGE) continue;
      if (distanceSq < bestSq) {
        bestSq = distanceSq;
        best = attacker;
      }
    }
    return best;
  }

  static pick(engine: WarEngine, unit: WarUnit, origin: WarPoint): WarEntity | null {
    const assisted = WarTargeting.assistTarget(engine, unit, origin);
    if (assisted) return assisted;
    const enemy: WarTeam = unit.team === 0 ? 1 : 0;
    const leashSq = WarBalance.LEASH_RANGE * WarBalance.LEASH_RANGE;
    let bestUnit: WarEntity | null = null;
    let bestUnitSq = Number.MAX_SAFE_INTEGER;
    let bestBuilding: WarEntity | null = null;
    let bestBuildingKey = Number.MAX_SAFE_INTEGER;
    for (const other of engine.entitiesOf(enemy)) {
      const reach = WarBalance.ACQUIRE_RANGE + other.bodyRadius();
      const dx = unit.x - other.x;
      const dy = unit.y - other.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > reach * reach) continue;
      const ox = origin.x - other.x;
      const oy = origin.y - other.y;
      if (ox * ox + oy * oy > leashSq) continue;
      if (!engine.vision.isVisible(unit.team, other.x, other.y)) continue;
      if (other instanceof WarUnit) {
        if (distanceSq < bestUnitSq) {
          bestUnitSq = distanceSq;
          bestUnit = other;
        }
        continue;
      }
      const isHq = other instanceof WarBuilding && other.def.type === "hq";
      const key = (isHq ? 1 : 0) * 1000000000000 + distanceSq;
      if (key < bestBuildingKey) {
        bestBuildingKey = key;
        bestBuilding = other;
      }
    }
    return bestUnit ?? bestBuilding;
  }
}

class WarUnitBrain {
  static think(engine: WarEngine, unit: WarUnit, squad: WarSquad): void {
    if (unit.cooldownLeft > 0) unit.cooldownLeft--;
    if (unit.slowTicksLeft > 0) unit.slowTicksLeft--;
    const slot = squad.slotOf(unit);
    if (unit.marchTicks > 0) {
      unit.marchTicks--;
      unit.retarget(-1);
      WarUnitBrain.holdFormation(unit, squad, slot);
      return;
    }
    const origin = unit.attached ? slot : squad.post;
    let target = unit.targetId >= 0 ? engine.entityById(unit.targetId) : null;
    if (target && !WarUnitBrain.stillValid(engine, unit, target, origin)) target = null;
    if (!target && (engine.tick + unit.id) % WarBalance.ACQUIRE_EVERY_TICKS === 0) target = WarTargeting.pick(engine, unit, origin);
    unit.retarget(target ? target.id : -1);
    if (!target) {
      WarUnitBrain.holdFormation(unit, squad, slot);
      return;
    }
    const reach = unit.reach(target);
    if (WarMath.dist(unit.x, unit.y, target.x, target.y) <= reach) {
      if (unit.cooldownLeft === 0) WarCombat.strike(engine, unit, target);
      return;
    }
    unit.moveToward(target, unit.stepLength());
  }

  private static stillValid(engine: WarEngine, unit: WarUnit, target: WarEntity, origin: WarPoint): boolean {
    if (!target.alive) return false;
    if (!engine.vision.isVisible(unit.team, target.x, target.y)) return false;
    return WarMath.dist(origin.x, origin.y, target.x, target.y) <= WarBalance.LEASH_RANGE;
  }

  static holdFormation(unit: WarUnit, squad: WarSquad, slot: WarPoint): void {
    const gap = WarMath.dist(unit.x, unit.y, slot.x, slot.y);
    const catchingUp = gap > 300 || !unit.attached || squad.mode === "home";
    const pace = catchingUp ? unit.stepLength() : Math.min(unit.stepLength(), squad.speed());
    unit.moveToward(slot, pace);
  }
}

abstract class WarAbility {
  abstract update(engine: WarEngine, unit: WarUnit): void;
}

class WarRaiseDeadAbility extends WarAbility {
  private static readonly PERIOD_TICKS = 80;
  private static readonly RANGE = 700;
  private static readonly CORPSE_LIFE_TICKS = 100;

  private waitTicks = WarRaiseDeadAbility.PERIOD_TICKS;

  update(engine: WarEngine, unit: WarUnit): void {
    if (this.waitTicks > 0) {
      this.waitTicks--;
      return;
    }
    const corpse = engine.takeCorpse(unit.team, unit, WarRaiseDeadAbility.RANGE, WarRaiseDeadAbility.CORPSE_LIFE_TICKS);
    if (!corpse) return;
    if (engine.raiseMinion(unit, corpse)) this.waitTicks = WarRaiseDeadAbility.PERIOD_TICKS;
  }
}

class WarAbilityFactory {
  static forDef(def: WarUnitDef): WarAbility | null {
    return def.ability === "raise" ? new WarRaiseDeadAbility() : null;
  }
}

abstract class WarCommand {
  constructor(readonly team: WarTeam) {}

  abstract apply(engine: WarEngine): void;
  abstract toJson(): WarCommandJson;

  static fromJson(json: WarCommandJson): WarCommand {
    switch (json.type) {
      case "produce": return new WarProduceCommand(json.team, json.buildingId as number, json.itemId as string);
      case "build": return new WarBuildCommand(json.team, json.slotIndex as number, json.buildingType as WarBuildingType);
      case "attackPath": return new WarAttackPathCommand(json.team, json.squad as number, json.points as WarPoint[]);
      case "recall": return new WarRecallCommand(json.team, json.squad as number);
      case "surrender": return new WarSurrenderCommand(json.team);
    }
    throw new Error("unknown command " + json.type);
  }
}

class WarProduceCommand extends WarCommand {
  constructor(team: WarTeam, readonly buildingId: number, readonly itemId: string) {
    super(team);
  }

  apply(engine: WarEngine): void {
    engine.produce(this.team, this.buildingId, this.itemId);
  }

  toJson(): WarCommandJson {
    return { type: "produce", team: this.team, buildingId: this.buildingId, itemId: this.itemId };
  }
}

class WarBuildCommand extends WarCommand {
  constructor(team: WarTeam, readonly slotIndex: number, readonly buildingType: WarBuildingType) {
    super(team);
  }

  apply(engine: WarEngine): void {
    engine.build(this.team, this.slotIndex, this.buildingType);
  }

  toJson(): WarCommandJson {
    return { type: "build", team: this.team, slotIndex: this.slotIndex, buildingType: this.buildingType };
  }
}

class WarAttackPathCommand extends WarCommand {
  constructor(team: WarTeam, readonly squad: number, readonly points: WarPoint[]) {
    super(team);
  }

  apply(engine: WarEngine): void {
    engine.players[this.team].squads[this.squad]?.sendAlong(this.points);
  }

  toJson(): WarCommandJson {
    return { type: "attackPath", team: this.team, squad: this.squad, points: this.points };
  }
}

class WarRecallCommand extends WarCommand {
  constructor(team: WarTeam, readonly squad: number) {
    super(team);
  }

  apply(engine: WarEngine): void {
    engine.players[this.team].squads[this.squad]?.recall();
  }

  toJson(): WarCommandJson {
    return { type: "recall", team: this.team, squad: this.squad };
  }
}

class WarSurrenderCommand extends WarCommand {
  apply(engine: WarEngine): void {
    engine.finish((this.team === 0 ? 1 : 0) as WarWinner, "surrender");
  }

  toJson(): WarCommandJson {
    return { type: "surrender", team: this.team };
  }
}

class WarWinCheck {
  static atTimeLimit(engine: WarEngine): WarWinner {
    const ratios = engine.players.map((p) => (p.hq ? Math.trunc((p.hq.hp * 1000) / p.hq.maxHp) : 0));
    if (ratios[0] !== ratios[1]) return ratios[0] > ratios[1] ? 0 : 1;
    const pops = engine.players.map((p) => p.economy.popUsed);
    if (pops[0] !== pops[1]) return pops[0] > pops[1] ? 0 : 1;
    return 2;
  }
}

class WarStateHash {
  static compute(engine: WarEngine): number {
    let hash = 0x811c9dc5;
    const mix = (value: number): void => {
      hash = Math.imul(hash ^ (value | 0), 0x01000193) >>> 0;
    };
    mix(engine.tick);
    mix(engine.random.state);
    for (const player of engine.players) {
      mix(player.economy.ore);
      mix(player.economy.crystal);
      mix(player.economy.oreWorkers);
      mix(player.economy.crystalWorkers);
      mix(player.economy.popUsed);
      mix(player.economy.oreRemainder);
      mix(player.economy.crystalRemainder);
      for (const squad of player.squads) {
        mix(squad.anchor.x);
        mix(squad.anchor.y);
        mix(squad.members.length);
      }
    }
    for (const entity of engine.entities) {
      mix(entity.id);
      mix(entity.x);
      mix(entity.y);
      mix(entity.hp);
      if (entity instanceof WarUnit) {
        mix(entity.targetId);
        mix(entity.cooldownLeft);
        mix(entity.slowTicksLeft);
        mix(entity.revived ? 1 : 0);
      } else if (entity instanceof WarBuilding) {
        mix(entity.buildLeft);
        for (const queued of entity.queue) mix(queued.ticksLeft);
      }
    }
    return hash >>> 0;
  }
}

class WarAlertTracker {
  private readonly lastRaisedTick = new Map<string, number>();

  constructor(private readonly engine: WarEngine) {}

  update(): void {
    WarMapData.SHARED_VISION_ZONES.forEach((zone, index) => {
      for (const team of [0, 1] as WarTeam[]) {
        const enemy: WarTeam = team === 0 ? 1 : 0;
        if (!this.hasUnitInside(enemy, zone) || this.hasUnitInside(team, zone)) continue;
        this.raise(team, "zone" + index, zone.x, zone.y, "적이 나타났어요!");
      }
    });
  }

  noteBuildingHit(building: WarBuilding): void {
    this.raise(building.team, "base", building.x, building.y, "기지가 공격받고 있어요!");
  }

  private hasUnitInside(team: WarTeam, zone: WarVisionZone): boolean {
    const limitSq = zone.radius * zone.radius;
    for (const entity of this.engine.entitiesOf(team)) {
      if (!(entity instanceof WarUnit)) continue;
      const dx = entity.x - zone.x;
      const dy = entity.y - zone.y;
      if (dx * dx + dy * dy <= limitSq) return true;
    }
    return false;
  }

  private raise(team: WarTeam, key: string, x: number, y: number, text: string): void {
    const slot = team + key;
    const last = this.lastRaisedTick.get(slot);
    if (last !== undefined && this.engine.tick - last < WarBalance.ALERT_COOLDOWN_TICKS) return;
    this.lastRaisedTick.set(slot, this.engine.tick);
    this.engine.emit({ kind: "alert", team, tick: this.engine.tick, text, x, y });
  }
}

class WarEngine {
  readonly random: WarRandom;
  readonly players: [WarPlayer, WarPlayer];
  readonly vision = new WarVision();
  readonly alerts = new WarAlertTracker(this);
  entities: WarEntity[] = [];
  tick = 0;
  result: WarResult | null = null;
  private nextId = 1;
  private pending: WarCommand[] = [];
  private events: WarEvent[] = [];
  private readonly byId = new Map<number, WarEntity>();
  private readonly teamEntities: [WarEntity[], WarEntity[]] = [[], []];
  private corpses: WarCorpse[] = [];

  constructor(options: WarEngineOptions) {
    this.random = new WarRandom(options.seed);
    this.players = [new WarPlayer(0, options.factions[0]), new WarPlayer(1, options.factions[1])];
    for (const player of this.players) this.placeHq(player);
    this.vision.update(this.entities);
  }

  submit(command: WarCommand): void {
    this.pending.push(command);
  }

  drainEvents(): WarEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  takeCorpse(team: WarTeam, near: WarPoint, range: number, lifeTicks: number): WarCorpse | null {
    for (const corpse of this.corpses) {
      if (corpse.team !== team || this.tick - corpse.tick > lifeTicks) continue;
      if (WarMath.dist(corpse.x, corpse.y, near.x, near.y) > range) continue;
      this.corpses.splice(this.corpses.indexOf(corpse), 1);
      return corpse;
    }
    return null;
  }

  raiseMinion(necromancer: WarUnit, corpse: WarCorpse): boolean {
    const player = this.players[necromancer.team];
    if (player.economy.popFree < 1) return false;
    const unit = new WarUnit(this.nextId++, necromancer.team, corpse.x, corpse.y, WarUnitCatalog.byId("minion"));
    const squad = player.squads[necromancer.squadIndex];
    if (squad && squad.members.length < WarBalance.SQUAD_CAP) squad.add(unit);
    else if (!player.assigner.assign(unit)) return false;
    unit.attached = necromancer.attached;
    this.register(unit);
    player.economy.popUsed += 1;
    this.emit({ kind: "raised", team: necromancer.team, tick: this.tick, text: unit.def.name, x: corpse.x, y: corpse.y });
    return true;
  }

  emit(event: WarEvent): void {
    this.events.push(event);
  }

  entitiesOf(team: WarTeam): WarEntity[] {
    return this.teamEntities[team];
  }

  entityById(id: number): WarEntity | null {
    return this.byId.get(id) ?? null;
  }

  units(team?: WarTeam): WarUnit[] {
    return this.entities.filter((e): e is WarUnit => e instanceof WarUnit && e.alive && (team === undefined || e.team === team));
  }

  step(): void {
    if (this.result) return;
    for (const command of this.pending) command.apply(this);
    this.pending = [];
    for (const player of this.players) player.economy.tick();
    this.advanceBuildings();
    this.refreshTeamEntities();
    if (this.tick % WarBalance.VISION_EVERY_TICKS === 0) this.vision.update(this.entities);
    this.advanceSquads();
    if (this.tick % WarBalance.ALERT_EVERY_TICKS === 0) this.alerts.update();
    this.separateUnits();
    this.removeDead();
    if (this.tick % 10 === 0) this.corpses = this.corpses.filter((corpse) => this.tick - corpse.tick <= WarBalance.CORPSE_KEEP_TICKS);
    this.tick++;
    if (!this.result && this.tick >= WarBalance.MATCH_TICKS) this.finish(WarWinCheck.atTimeLimit(this), "time");
  }

  finish(winner: WarWinner, reason: WarEndReason): void {
    if (this.result) return;
    this.result = { winner, reason, tick: this.tick };
    this.events.push({ kind: "ended", team: winner === 1 ? 1 : 0, tick: this.tick, text: reason, winner });
  }

  damage(target: WarEntity, amount: number, attackerId = -1): void {
    if (!target.alive) return;
    if (attackerId >= 0) {
      target.lastHitTick = this.tick;
      target.lastAttackerId = attackerId;
    }
    target.hp = Math.max(0, target.hp - amount);
    if (target instanceof WarBuilding) this.alerts.noteBuildingHit(target);
    if (target instanceof WarUnit && target.hp === 0) this.tryRevive(target);
  }

  produce(team: WarTeam, buildingId: number, itemId: string): boolean {
    const player = this.players[team];
    const building = this.entityById(buildingId);
    if (!(building instanceof WarBuilding) || building.team !== team || !building.alive) return false;
    const item = WarProductionItem.from(itemId);
    if (item.unitDef && item.unitDef.faction !== player.faction) return false;
    if (!building.canProduce(item) || building.queue.length >= WarBalance.QUEUE_LIMIT) return false;
    const economy = player.economy;
    if (!economy.canAfford(item.ore, item.crystal) || economy.popFree < item.pop) return false;
    if (item.workerKind && economy.workersOf(item.workerKind) + this.queuedWorkers(player, item.workerKind) >= WarBalance.WORKER_CAP_PER_RESOURCE) return false;
    economy.spend(item.ore, item.crystal);
    economy.popUsed += item.pop;
    building.queue.push(new WarQueuedItem(item, item.ticks));
    return true;
  }

  build(team: WarTeam, slotIndex: number, type: WarBuildingType): boolean {
    const player = this.players[team];
    const slot = player.slotDefs[slotIndex];
    if (!slot || !slot.enabled || player.slotBuildings[slotIndex]) return false;
    if (!WarBuildingCatalog.buildable(slot.kind).some((def) => def.type === type)) return false;
    const def = WarBuildingCatalog.byType(type);
    if (!player.economy.canAfford(def.ore, def.crystal)) return false;
    player.economy.spend(def.ore, def.crystal);
    const building = new WarBuilding(this.nextId++, team, slot.x, slot.y, def, slotIndex, true);
    player.slotBuildings[slotIndex] = building;
    this.register(building);
    return true;
  }

  private tryRevive(unit: WarUnit): void {
    if (unit.def.reviveChancePct <= 0 || unit.revived) return;
    if (this.random.below(100) >= unit.def.reviveChancePct) return;
    unit.revived = true;
    unit.hp = Math.max(1, Math.trunc((unit.maxHp * WarBalance.REVIVE_HP_PERCENT) / 100));
    unit.targetId = -1;
    unit.cooldownLeft = WarBalance.REVIVE_STUN_TICKS;
    this.emit({ kind: "revived", team: unit.team, tick: this.tick, text: unit.def.name, x: unit.x, y: unit.y });
  }

  private placeHq(player: WarPlayer): void {
    const point = WarMapData.hq(player.team);
    const def = WarBuildingCatalog.byType("hq");
    const hq = new WarBuilding(this.nextId++, player.team, point.x, point.y, def, -1, false);
    player.hq = hq;
    this.register(hq);
  }

  private register(entity: WarEntity): void {
    this.entities.push(entity);
    this.byId.set(entity.id, entity);
  }

  private queuedWorkers(player: WarPlayer, kind: WarWorkerKind): number {
    let count = 0;
    for (const building of player.buildings()) {
      for (const queued of building.queue) if (queued.item.workerKind === kind) count++;
    }
    return count;
  }

  private advanceBuildings(): void {
    for (const player of this.players) {
      for (const building of player.buildings()) {
        if (!building.alive) continue;
        if (!building.complete) {
          building.buildLeft--;
          if (building.complete) this.events.push({ kind: "built", team: player.team, tick: this.tick, text: WarBuildingCatalog.displayName(building.def.type, player.faction) });
          continue;
        }
        const head = building.queue[0];
        if (!head) continue;
        head.ticksLeft--;
        if (head.ticksLeft > 0) continue;
        building.queue.shift();
        this.completeItem(player, building, head.item);
      }
    }
  }

  private completeItem(player: WarPlayer, building: WarBuilding, item: WarProductionItem): void {
    this.events.push({ kind: "produced", team: player.team, tick: this.tick, text: item.name });
    if (item.workerKind) {
      player.economy.addWorker(item.workerKind);
      return;
    }
    const def = item.unitDef as WarUnitDef;
    for (let n = 0; n < def.spawnCount; n++) {
      const jitterX = this.random.between(-200, 200);
      const jitterY = this.random.between(-200, 200);
      const spawn = WarTerrain.clamp({ x: building.x + jitterX, y: building.y + jitterY });
      const unit = new WarUnit(this.nextId++, player.team, spawn.x, spawn.y, def);
      this.register(unit);
      player.unitsProduced++;
      if (!player.assigner.assign(unit)) unit.hp = 0;
    }
  }

  private refreshTeamEntities(): void {
    this.teamEntities[0].length = 0;
    this.teamEntities[1].length = 0;
    for (const entity of this.entities) if (entity.alive) this.teamEntities[entity.team].push(entity);
  }

  private advanceSquads(): void {
    for (const player of this.players) {
      for (const squad of player.squads) {
        squad.planSlots();
        squad.advanceAnchor();
        for (const unit of squad.members.slice()) {
          if (!unit.alive) continue;
          WarUnitBrain.think(this, unit, squad);
          if (unit.ability) unit.ability.update(this, unit);
        }
      }
    }
  }

  private separateUnits(): void {
    const units = this.units();
    const radius = WarBalance.SEPARATION_RADIUS;
    const cells = new Map<number, WarUnit[]>();
    const keyOf = (x: number, y: number): number => (Math.floor(x / radius) + 200) * 1000 + (Math.floor(y / radius) + 200);
    for (const unit of units) {
      const key = keyOf(unit.x, unit.y);
      const bucket = cells.get(key);
      if (bucket) bucket.push(unit);
      else cells.set(key, [unit]);
    }
    for (const a of units) {
      const baseCol = Math.floor(a.x / radius) + 200;
      const baseRow = Math.floor(a.y / radius) + 200;
      for (let col = baseCol - 1; col <= baseCol + 1; col++) {
        for (let row = baseRow - 1; row <= baseRow + 1; row++) {
          const bucket = cells.get(col * 1000 + row);
          if (!bucket) continue;
          for (const b of bucket) if (b.id > a.id) this.pushApart(a, b, radius);
        }
      }
    }
    for (const unit of units) {
      const fixed = WarTerrain.clamp(unit);
      unit.x = fixed.x;
      unit.y = fixed.y;
    }
  }

  private pushApart(a: WarUnit, b: WarUnit, radius: number): void {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (Math.abs(dx) >= radius || Math.abs(dy) >= radius) return;
    const distance = WarMath.isqrt(dx * dx + dy * dy);
    if (distance >= radius) return;
    const push = Math.ceil((radius - distance) / 2);
    const ux = distance === 0 ? (a.id % 2 === 0 ? 1 : -1) * 1000 : Math.trunc((dx * 1000) / distance);
    const uy = distance === 0 ? 0 : Math.trunc((dy * 1000) / distance);
    a.x += Math.trunc((ux * push) / 1000);
    a.y += Math.trunc((uy * push) / 1000);
    b.x -= Math.trunc((ux * push) / 1000);
    b.y -= Math.trunc((uy * push) / 1000);
  }

  private removeDead(): void {
    for (const entity of this.entities) {
      if (entity.alive) continue;
      const player = this.players[entity.team];
      if (entity instanceof WarUnit) this.retireUnit(player, entity);
      else if (entity instanceof WarBuilding) this.retireBuilding(player, entity);
    }
    this.entities = this.entities.filter((entity) => entity.alive);
    for (const id of Array.from(this.byId.keys())) if (!this.byId.get(id)?.alive) this.byId.delete(id);
  }

  private retireUnit(player: WarPlayer, unit: WarUnit): void {
    player.economy.popUsed -= unit.def.pop;
    player.unitsLost++;
    player.squads[unit.squadIndex]?.remove(unit);
    if (unit.def.kind !== "elite") this.corpses.push({ team: unit.team, x: unit.x, y: unit.y, tick: this.tick });
    this.events.push({ kind: "unitDied", team: player.team, tick: this.tick, text: unit.def.name });
  }

  private retireBuilding(player: WarPlayer, building: WarBuilding): void {
    for (const queued of building.queue) player.economy.popUsed -= queued.item.pop;
    building.queue.length = 0;
    this.events.push({ kind: "buildingDestroyed", team: player.team, tick: this.tick, text: WarBuildingCatalog.displayName(building.def.type, player.faction) });
    if (building.def.type === "hq") {
      this.finish((player.team === 0 ? 1 : 0) as WarWinner, "hq");
      return;
    }
    player.slotBuildings[building.slotIndex] = null;
  }
}
