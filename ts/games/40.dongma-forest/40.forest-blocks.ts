interface FrBlockRecord { t: string; n: number; r: number }
interface FrLot { uid: string; no: number; name: string }
interface FrBlockPlayer { uid: string; no: number; admin: boolean }
interface FrBlockPlan { x: number; z: number; y: number; t: string; r: number }

class FrBlockKey {
  static key(index: number, y: number): string { return index + "_" + y; }
  static parse(key: string): { index: number; y: number } {
    const parts = key.split("_");
    return { index: Number(parts[0]), y: Number(parts[1]) };
  }
}

class FrBlockStore {
  private readonly columns: Map<number, Map<number, FrBlockRecord>> = new Map();
  private amount = 0;

  get(index: number, y: number): FrBlockRecord | null {
    const column = this.columns.get(index);
    return column ? column.get(y) || null : null;
  }

  set(index: number, y: number, record: FrBlockRecord | null): boolean {
    let column = this.columns.get(index);
    const had = !!column && column.has(y);
    if (record === null) {
      if (!had || !column) return false;
      column.delete(y);
      if (column.size === 0) this.columns.delete(index);
      this.amount -= 1;
      return true;
    }
    if (!column) { column = new Map(); this.columns.set(index, column); }
    column.set(y, record);
    if (!had) this.amount += 1;
    return true;
  }

  top(index: number): number {
    const column = this.columns.get(index);
    if (!column) return 0;
    let highest = -1;
    column.forEach((_, y) => { if (y > highest) highest = y; });
    return highest + 1;
  }

  column(index: number): ReadonlyArray<[number, FrBlockRecord]> {
    const column = this.columns.get(index);
    return column ? Array.from(column.entries()) : [];
  }

  total(): number { return this.amount; }

  forEach(visit: (index: number, y: number, record: FrBlockRecord) => void): void {
    this.columns.forEach((column, index) => column.forEach((record, y) => visit(index, y, record)));
  }

  countWhere(test: (index: number, record: FrBlockRecord) => boolean): number {
    let count = 0;
    this.forEach((index, _y, record) => { if (test(index, record)) count += 1; });
    return count;
  }
}

interface FrPlaceCheck { ok: boolean; reason: string }

class FrBlockRules {
  static readonly MAX_LEVEL = 8;
  static readonly OPEN_LIMIT = 300;
  static readonly LOT_LIMIT = 600;
  static readonly ISLAND_LIMIT = 10000;
  static readonly NEIGHBORS: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  static lotIndexAt(world: FrWorld, x: number, z: number): number {
    return world.terrain.anchors.lots.findIndex((l) => x >= l.x && x < l.x + l.size && z >= l.z && z < l.z + l.size);
  }

  static ownLot(world: FrWorld, uid: string): number {
    for (const [index, lot] of world.lots) if (lot.uid === uid) return index;
    return -1;
  }

  static allowedLevels(world: FrWorld, x: number, z: number): number[] {
    const terrain = world.terrain;
    const index = terrain.index(x, z);
    const levels: number[] = [];
    for (let y = 0; y < FrBlockRules.MAX_LEVEL; y++) {
      if (world.blocks.get(index, y)) continue;
      const supported = y === 0 || !!world.blocks.get(index, y - 1) || FrBlockRules.NEIGHBORS.some(([dx, dz]) => !!world.blocks.get(terrain.index(x + dx, z + dz), y));
      if (supported) levels.push(y);
    }
    return levels;
  }

  static check(world: FrWorld, x: number, z: number, y: number, me: FrBlockPlayer, bodies: ReadonlyArray<FrPoint>): FrPlaceCheck {
    const terrain = world.terrain;
    if (!terrain.inside(x, z) || (terrain.isWater(x, z) && !terrain.isFlooded(x, z))) return { ok: false, reason: "여기에는 놓을 수 없어요" };
    if (y < 0 || y >= FrBlockRules.MAX_LEVEL) return { ok: false, reason: "더 높이 쌓을 수 없어요 (8칸까지)" };
    if (world.blocked(x, z)) return { ok: false, reason: "나무가 있어서 놓을 수 없어요" };
    if (bodies.some((b) => b.x === x && b.z === z)) return { ok: false, reason: "누가 서 있어요" };
    const lotIndex = FrBlockRules.lotIndexAt(world, x, z);
    if (lotIndex >= 0) {
      const lot = world.lots.get(lotIndex);
      if (!me.admin && (!lot || lot.uid !== me.uid)) return { ok: false, reason: lot ? "남의 집터예요" : "집터를 먼저 정해야 해요" };
    } else if (terrain.isShielded(x, z)) return { ok: false, reason: "길·광장·창고 앞에는 놓을 수 없어요" };
    if (!FrBlockRules.allowedLevels(world, x, z).includes(y)) return { ok: false, reason: "그 자리는 받쳐 주는 블록이 없어요" };
    if (!me.admin && world.blocks.total() >= FrBlockRules.ISLAND_LIMIT) return { ok: false, reason: "섬에 블록이 너무 많아요" };
    if (!me.admin) {
      const own = FrBlockRules.ownLot(world, me.uid);
      const inLot = (index: number) => own >= 0 && FrBlockRules.lotIndexAt(world, index % terrain.w, Math.floor(index / terrain.w)) === own;
      const mine = world.blocks.countWhere((index, record) => record.n === me.no && inLot(index) === (lotIndex >= 0));
      if (mine >= (lotIndex >= 0 ? FrBlockRules.LOT_LIMIT : FrBlockRules.OPEN_LIMIT)) return { ok: false, reason: lotIndex >= 0 ? "집터에 600개까지 쌓을 수 있어요" : "빈터에는 300개까지 쌓을 수 있어요" };
    }
    return { ok: true, reason: "" };
  }

  static chooseLevel(world: FrWorld, x: number, z: number, pick: number | null): number {
    const levels = FrBlockRules.allowedLevels(world, x, z);
    if (levels.length === 0) return -1;
    if (pick !== null && levels.includes(pick)) return pick;
    const top = world.blocks.top(world.terrain.index(x, z));
    return levels.includes(top) ? top : levels[levels.length - 1];
  }

  static stepLevel(world: FrWorld, x: number, z: number, current: number, direction: number): number {
    const levels = FrBlockRules.allowedLevels(world, x, z);
    const at = levels.indexOf(current);
    const next = Math.max(0, Math.min(levels.length - 1, (at < 0 ? levels.length - 1 : at) + direction));
    return levels.length === 0 ? -1 : levels[next];
  }

  static canRemove(record: FrBlockRecord, me: FrBlockPlayer): boolean { return me.admin || record.n === me.no; }

  static removable(world: FrWorld, x: number, z: number, me: FrBlockPlayer): number {
    const index = world.terrain.index(x, z);
    const column = world.blocks.column(index).slice().sort((a, b) => b[0] - a[0]);
    const found = column.find(([, record]) => FrBlockRules.canRemove(record, me));
    return found ? found[0] : -1;
  }
}

class FrHouseKit {
  static readonly COST: FrCost = { wood: 30, stone: 20, rope: 10 };
  static readonly SIZE = 5;

  static blueprint(lot: { x: number; z: number }): FrBlockPlan[] {
    const plan: FrBlockPlan[] = [];
    const S = FrHouseKit.SIZE;
    const edge = (i: number, j: number) => i === 0 || j === 0 || i === S - 1 || j === S - 1;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = lot.x + i, z = lot.z + j;
        if (edge(i, j)) {
          const door = i === 2 && j === S - 1;
          const window = (i === 0 && j === 2) || (i === S - 1 && j === 2) || (i === 2 && j === 0);
          plan.push({ x, z, y: 0, t: door ? "block_door" : "block_stone", r: 0 });
          plan.push({ x, z, y: 1, t: window ? "block_window" : door ? "block_door" : "block_wood", r: 0 });
          plan.push({ x, z, y: 2, t: "block_wood", r: 0 });
        }
        plan.push({ x, z, y: 3, t: "block_plank", r: 0 });
      }
    }
    return plan;
  }
}
