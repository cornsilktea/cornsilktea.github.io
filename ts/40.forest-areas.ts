interface FrWalkWorld {
  readonly terrain: FrTerrainData;
  blocked(x: number, z: number): boolean;
  solid(x: number, z: number): boolean;
  surfaceAt(x: number, z: number): number;
  overhead(x: number, z: number, groundHeight: number): boolean;
}

type FrAreaId = "island" | "fruit" | "beach" | "mine" | "dungeon";
type FrFeatureKind = "fruitTree" | "jungleTree" | "flower" | "shoreSpot" | "torch" | "ladderDown" | "ladderUp" | "exit" | "decor";

class FrFeature {
  availableAt = 0;
  constructor(readonly kind: FrFeatureKind, readonly x: number, readonly z: number, readonly variant: number, readonly item = "") {}
  get blocks(): boolean { return this.kind === "fruitTree" || this.kind === "jungleTree"; }
  get gatherable(): boolean { return this.kind === "fruitTree" || this.kind === "jungleTree" || this.kind === "flower" || this.kind === "shoreSpot"; }
}

class FrAreaInfo {
  static readonly NAMES: Readonly<Record<string, string>> = { island: "마을", fruit: "과일 숲", beach: "해변", mine: "광산", dungeon: "던전" };
  static readonly SOLO: ReadonlyArray<string> = ["fruit", "mine", "dungeon"];
  static label(id: string): string { return FrAreaInfo.NAMES[id] || id; }
  static solo(id: string): boolean { return FrAreaInfo.SOLO.indexOf(id) >= 0; }
  static shared(id: string): boolean { return id === "island" || id === "beach"; }
}

class FrAreaWorld implements FrWalkWorld {
  readonly features = new Map<number, FrFeature>();
  readonly lava = new Set<number>();
  readonly list: FrFeature[] = [];
  spawnSpots: Array<[number, number]> = [];
  kind = "";

  constructor(readonly id: FrAreaId, readonly terrain: FrTerrainData, readonly spawn: FrPoint, readonly dark: boolean, readonly floor = 1) {}

  add(feature: FrFeature): void {
    this.list.push(feature);
    this.features.set(this.terrain.index(feature.x, feature.z), feature);
  }

  featureAt(x: number, z: number): FrFeature | null { return this.features.get(this.terrain.index(x, z)) || null; }

  blocked(x: number, z: number): boolean {
    const feature = this.featureAt(x, z);
    return (!!feature && feature.blocks) || this.lava.has(this.terrain.index(x, z));
  }

  solid(): boolean { return false; }
  surfaceAt(x: number, z: number): number { return this.terrain.height(x, z); }
  overhead(): boolean { return false; }

  available(feature: FrFeature, absoluteMinute: number): boolean { return feature.availableAt <= absoluteMinute; }
}

class FrAreaFactory {
  static readonly FOREST_SIZE = 46;
  static readonly BEACH_W = 64;
  static readonly BEACH_D = 46;
  static readonly SHORE_ITEMS = ["shell", "salt", "seaweed", "sand"];

  private static letter(h: number): string { return String.fromCharCode(97 + h + 2); }

  private static file(w: number, d: number, height: (x: number, z: number) => number, top: (x: number, z: number) => string): FrTerrainFile {
    const heights: string[] = [], tops: string[] = [];
    for (let z = 0; z < d; z++) {
      let hRow = "", tRow = "";
      for (let x = 0; x < w; x++) { hRow += FrAreaFactory.letter(height(x, z)); tRow += top(x, z); }
      heights.push(hRow);
      tops.push(tRow);
    }
    const anchors: FrAnchors = { plaza: { x: 0, z: 0, radius: 0, height: 0 }, campfire: { x: -9, z: -9 }, publicChest: { x: -9, z: -9, size: 0 }, portals: {}, lots: [], farm: { x: -9, z: -9, w: 0, d: 0 }, bridges: {}, jungleZones: [], paths: {} };
    return { w, d, heights, tops, anchors };
  }

  static forest(seed: number): FrAreaWorld {
    const random = new FrRandom(seed);
    const N = FrAreaFactory.FOREST_SIZE;
    const edge = (x: number, z: number) => x < 2 || z < 2 || x >= N - 2 || z >= N - 2;
    const file = FrAreaFactory.file(N, N, (x, z) => (edge(x, z) ? 3 : (FrTreeField.hash(Math.floor(x / 4), Math.floor(z / 4), 41) > 0.82 ? 1 : 0)), (x, z) => (edge(x, z) ? "S" : "G"));
    const area = new FrAreaWorld("fruit", new FrTerrainData(file), { x: N / 2, z: N - 4 }, false);
    area.add(new FrFeature("exit", N / 2, N - 3, 0));
    const taken = new Set<number>();
    const place = (kind: FrFeatureKind, count: number, variants: number): void => {
      for (let tries = 0; tries < count * 12 && count > 0; tries++) {
        const x = random.between(3, N - 4), z = random.between(3, N - 6);
        const index = area.terrain.index(x, z);
        if (taken.has(index) || Math.hypot(x - N / 2, z - (N - 4)) < 4 || area.terrain.height(x, z) !== 0) continue;
        taken.add(index);
        area.add(new FrFeature(kind, x, z, random.between(0, variants - 1)));
        count--;
      }
    };
    place("fruitTree", 34, 5);
    place("jungleTree", 30, 3);
    place("flower", 46, 4);
    return area;
  }

  static beach(seed: number): FrAreaWorld {
    const random = new FrRandom(seed);
    const W = FrAreaFactory.BEACH_W, D = FrAreaFactory.BEACH_D;
    const landEnd = 26, sandEnd = 32;
    const file = FrAreaFactory.file(W, D, (x, z) => (x < 2 || x >= W - 2 ? 3 : z < 2 ? 3 : z >= sandEnd ? -1 : 0), (x, z) => {
      if (x < 2 || x >= W - 2 || z < 2) return "S";
      if (z < landEnd) return FrTreeField.hash(x, z, 17) > 0.55 ? "G" : "N";
      if (z < sandEnd) return "N";
      return z >= sandEnd + 8 ? "O" : "R";
    });
    const area = new FrAreaWorld("beach", new FrTerrainData(file), { x: W / 2, z: 5 }, false);
    area.add(new FrFeature("exit", W / 2, 3, 0));
    const taken = new Set<number>();
    for (let n = 0, tries = 0; n < 40 && tries < 600; tries++) {
      const x = random.between(4, W - 5), z = random.between(14, sandEnd - 1);
      const index = area.terrain.index(x, z);
      if (taken.has(index) || area.terrain.top(x, z) === "R") continue;
      taken.add(index);
      const item = random.pick(FrAreaFactory.SHORE_ITEMS);
      area.add(new FrFeature("shoreSpot", x, z, FrAreaFactory.SHORE_ITEMS.indexOf(item), item));
      n++;
    }
    return area;
  }

  static dungeon(data: FrDungeonCaveData): FrAreaWorld {
    const cell = (x: number, z: number) => (z < 0 || z >= data.rows.length || x < 0 || x >= data.w ? "#" : data.rows[z].charAt(x));
    const file = FrAreaFactory.file(data.w, data.d, (x, z) => (cell(x, z) === "#" ? 3 : 0), (x, z) => { const c = cell(x, z); return c === "#" ? "T" : c === "^" ? "L" : "C"; });
    const area = new FrAreaWorld("dungeon", new FrTerrainData(file), { x: data.start[0], z: data.start[1] }, true);
    area.kind = data.kind;
    area.spawnSpots = data.spawnSpots;
    area.add(new FrFeature("exit", data.start[0], data.start[1], 0));
    data.torches.forEach(([x, z]) => area.add(new FrFeature("torch", x, z, 0)));
    data.decor.forEach(([x, z], i) => { if (!area.featureAt(x, z)) area.add(new FrFeature("decor", x, z, i)); });
    for (let z = 0; z < data.d; z++) for (let x = 0; x < data.w; x++) if (cell(x, z) === "^") area.lava.add(z * data.w + x);
    return area;
  }

  static mine(floorData: FrMineFloorData, floors: number, seed: number): FrAreaWorld {
    const random = new FrRandom(seed + floorData.level * 977);
    const rows = floorData.rows;
    const veins = new Set<number>();
    floorData.oreSpots.forEach((cluster) => cluster.forEach(([x, z]) => { if (random.chance(0.75)) veins.add(z * floorData.w + x); }));
    const cell = (x: number, z: number) => (z < 0 || z >= rows.length || x < 0 || x >= floorData.w ? "#" : rows[z].charAt(x));
    const top = (x: number, z: number) => {
      const c = cell(x, z);
      if (c === "#") return veins.has(z * floorData.w + x) ? "V" : "T";
      if (c === "X") return "K";
      if (c === "~") return "R";
      if (c === "^") return "L";
      return "C";
    };
    const height = (x: number, z: number) => { const c = cell(x, z); return c === "#" || c === "X" ? 3 : c === "~" ? -1 : 0; };
    const file = FrAreaFactory.file(floorData.w, floorData.d, height, top);
    const area = new FrAreaWorld("mine", new FrTerrainData(file), { x: floorData.start[0], z: floorData.start[1] }, true, floorData.level);
    area.add(new FrFeature(floorData.level === 1 ? "exit" : "ladderUp", floorData.start[0], floorData.start[1], 0));
    if (floorData.ladderDown && floorData.level < floors) area.add(new FrFeature("ladderDown", floorData.ladderDown[0], floorData.ladderDown[1], 0));
    floorData.torches.forEach(([x, z]) => area.add(new FrFeature("torch", x, z, 0)));
    return area;
  }
}

interface FrDungeonCaveData { kind: string; w: number; d: number; start: [number, number]; spawnSpots: Array<[number, number]>; torches: Array<[number, number]>; decor: Array<[number, number]>; rows: string[] }

interface FrMineFloorData { level: number; w: number; d: number; start: [number, number]; ladderDown: [number, number] | null; oreSpots: Array<Array<[number, number]>>; torches: Array<[number, number]>; rows: string[] }

class FrCaveLight {
  constructor(private readonly torches: ReadonlyArray<[number, number]>, private readonly tint: [number, number, number] = [1, 1, 1]) {}

  at(x: number, z: number): [number, number, number] {
    let glow = 0;
    this.torches.forEach(([tx, tz]) => { const d2 = (x - tx) * (x - tx) + (z - tz) * (z - tz); glow += 1.1 / (1 + d2 * 0.05); });
    const g = Math.min(0.55, glow);
    return [(0.86 + g * 0.55) * this.tint[0], (0.84 + g * 0.3) * this.tint[1], (0.82 - g * 0.12) * this.tint[2]];
  }
}

class FrGatherRules {
  static shake(random: FrRandom, session: FrSession): FrCost {
    const basket = session.bag.bestTier("basket");
    const roll = new FrFruitRoll().roll(random, { tier: 0, basketTier: basket }, session.pity.fruit || 0);
    session.pity.fruit = roll.miss;
    const gains: FrCost = { [roll.item]: 1 };
    if (random.chance(FrBalance.BASKET_EXTRA_CHANCE[basket])) gains[roll.item] += 1;
    if (random.chance(FrBalance.SEED_DROP_CHANCE)) {
      const seed = new FrSeedRoll().roll(random, { tier: 0 }, session.pity.seed || 0);
      session.pity.seed = seed.miss;
      gains[seed.item] = (gains[seed.item] || 0) + 1;
    }
    return gains;
  }

  static chop(session: FrSession): FrCost {
    return { wood: 2 + FrBalance.AXE_WOOD_BONUS[session.bag.bestTier("axe")] };
  }

  static flower(random: FrRandom, session: FrSession): FrCost {
    const gains: FrCost = { ["flower_" + random.between(0, 3)]: 1 };
    const key = Object.keys(gains)[0];
    if (random.chance(FrBalance.BASKET_EXTRA_CHANCE[session.bag.bestTier("basket")])) gains[key] += 1;
    return gains;
  }

  static shore(feature: FrFeature, random: FrRandom, session: FrSession): FrCost {
    const gains: FrCost = { [feature.item]: 1 };
    if (random.chance(FrBalance.BASKET_EXTRA_CHANCE[session.bag.bestTier("basket")])) gains[feature.item] += 1;
    return gains;
  }

  static vein(random: FrRandom, session: FrSession, floor: number): FrCost {
    const roll = new FrOreRoll().roll(random, { tier: session.bag.bestTier("pickaxe"), floor }, session.pity.ore || 0);
    session.pity.ore = roll.miss;
    return { [roll.item]: 1 };
  }

  static fish(random: FrRandom, session: FrSession): FrRollResult {
    const roll = new FrFishRoll().roll(random, { tier: session.bag.bestTier("rod") }, session.pity.fish || 0);
    return roll;
  }
}

class FrExpedition {
  static readonly STORAGE_KEY = "forest_pouch_v1";
  private before: FrSaveData | null = null;
  private enteredAt = 0;

  constructor(private readonly session: FrSession, readonly area: FrAreaId) {}

  begin(): void {
    this.before = this.session.toSave();
    this.enteredAt = Date.now();
  }

  gains(): FrCost {
    const result: FrCost = {};
    if (!this.before) return result;
    const was = new Map<string, number>();
    this.before.bag.forEach((s) => was.set(s.id, (was.get(s.id) || 0) + s.count));
    const now = new Map<string, number>();
    this.session.bag.slots.forEach((s) => now.set(s.id, (now.get(s.id) || 0) + s.count));
    now.forEach((n, id) => { const delta = n - (was.get(id) || 0); if (delta > 0 && FrItems.isStackable(id)) result[id] = delta; });
    return result;
  }

  gearGained(): string[] {
    if (!this.before) return [];
    const was = new Set(this.before.bag.filter((s) => !FrItems.isStackable(s.id)).map((s) => s.id));
    return this.session.bag.slots.filter((s) => !FrItems.isStackable(s.id) && !was.has(s.id)).map((s) => s.id);
  }

  spentActionPoints(): number { return this.before ? Math.max(0, this.before.ap - Math.round(this.session.ap.current)) : 0; }

  wornTools(): string[] {
    if (!this.before) return [];
    const worn: string[] = [];
    this.before.bag.forEach((old) => {
      if (FrItems.durabilityOf(old.id) <= 0) return;
      const now = this.session.bag.slots.find((s) => s.id === old.id);
      if (!now) worn.push(FrItemNames.label(old.id) + " (다 닳음)");
      else if (now.uses < old.uses) worn.push(FrItemNames.label(old.id) + " -" + (old.uses - now.uses));
    });
    return worn;
  }

  note = "";

  seconds(): number { return Math.round((Date.now() - this.enteredAt) / 1000); }

  remember(): void {
    try { localStorage.setItem(FrExpedition.STORAGE_KEY, JSON.stringify({ uid: this.session.uid, area: this.area, save: this.session.toSave() })); } catch (error) { return; }
  }

  static recall(uid: string): FrSaveData | null {
    try {
      const raw = localStorage.getItem(FrExpedition.STORAGE_KEY);
      if (!raw) return null;
      const stored = JSON.parse(raw) as { uid: string; save: FrSaveData };
      return stored.uid === uid ? stored.save : null;
    } catch (error) {
      return null;
    }
  }

  static clear(): void { try { localStorage.removeItem(FrExpedition.STORAGE_KEY); } catch (error) { return; } }
}
