interface FrStore {
  count(id: string): number;
  take(id: string, amount: number): void;
}

interface FrRollContext { tier: FrTier; floor?: number; basketTier?: FrTier }
interface FrRollResult { item: string; legend: boolean; miss: number }
interface FrWeightedItem { item: string; weight: number; legend: boolean }
interface FrBagSlot { id: string; count: number; uses: number }
interface FrPublicLogLine { at: number; who: string; verb: "put" | "take" | "build" | "admin"; item: string; count: number }
interface FrRingAttempt { level: number; success: boolean }
interface FrCookResult { ok: boolean; missing: string[] }

class FrRandom {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  chance(p: number): boolean { return this.next() < p; }
  between(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  pick<T>(list: ReadonlyArray<T>): T { return list[Math.floor(this.next() * list.length) % list.length]; }
}

class FrPity {
  static boost(base: number, miss: number): number {
    if (base <= 0) return 0;
    return Math.min(1, base + FrBalance.PITY_STEP * miss);
  }
}

abstract class FrLegendRoll {
  abstract readonly pityKey: string;
  protected abstract table(context: FrRollContext): FrWeightedItem[];

  roll(random: FrRandom, context: FrRollContext, miss: number): FrRollResult {
    const items = this.table(context);
    const baseLegend = items.filter((w) => w.legend).reduce((sum, w) => sum + w.weight, 0);
    const legend = FrPity.boost(baseLegend, miss);
    const legendScale = baseLegend > 0 ? legend / baseLegend : 0;
    const otherScale = baseLegend < 1 ? (1 - legend) / (1 - baseLegend) : 0;
    let pointer = random.next();
    for (const entry of items) {
      const weight = entry.weight * (entry.legend ? legendScale : otherScale);
      if (pointer < weight) return { item: entry.item, legend: entry.legend, miss: entry.legend ? 0 : miss + (legend > 0 ? 1 : 0) };
      pointer -= weight;
    }
    const last = items[items.length - 1];
    return { item: last.item, legend: last.legend, miss: last.legend ? 0 : miss + (legend > 0 ? 1 : 0) };
  }

  static successRate(table: FrWeightedItem[], miss: number): number {
    const base = table.filter((w) => w.legend).reduce((sum, w) => sum + w.weight, 0);
    return FrPity.boost(base, miss);
  }
}

class FrFruitRoll extends FrLegendRoll {
  readonly pityKey = "fruit";
  protected table(context: FrRollContext): FrWeightedItem[] {
    const multiplier = FrBalance.BASKET_LEGEND_MULTIPLIER[context.basketTier ?? 0];
    const raw = FrBalance.FRUIT_ODDS.map(([item, weight]) => ({ item, weight, legend: item === "golden_apple" }));
    const legendWeight = raw.filter((w) => w.legend).reduce((s, w) => s + w.weight, 0) * multiplier;
    const others = raw.filter((w) => !w.legend);
    const otherSum = others.reduce((s, w) => s + w.weight, 0);
    const scale = (1 - legendWeight) / otherSum;
    return raw.map((w) => ({ ...w, weight: w.legend ? legendWeight : w.weight * scale }));
  }
}

class FrSeedRoll extends FrLegendRoll {
  readonly pityKey = "seed";
  protected table(): FrWeightedItem[] {
    return FrCatalog.CROPS.map((crop) => ({
      item: crop.id + "_seed",
      weight: crop.grade === "common" ? 0.1 : crop.grade === "rare" ? 0.07 : 0.05,
      legend: crop.grade === "legend",
    }));
  }
}

class FrFishRoll extends FrLegendRoll {
  readonly pityKey = "fish";
  protected table(context: FrRollContext): FrWeightedItem[] {
    const odds = FrBalance.FISH_ODDS[context.tier];
    const groups: Array<[ReadonlyArray<string>, number, boolean]> = [
      [FrCatalog.FISH_COMMON, odds[0], false], [FrCatalog.FISH_RARE, odds[1], false], [FrCatalog.FISH_LEGEND, odds[2], true],
    ];
    const result: FrWeightedItem[] = [];
    groups.forEach(([ids, total, legend]) => ids.forEach((item) => result.push({ item, weight: total / ids.length, legend })));
    return result;
  }
}

class FrOreRoll extends FrLegendRoll {
  readonly pityKey = "ore";
  protected table(context: FrRollContext): FrWeightedItem[] {
    const odds = FrBalance.ORE_ODDS[context.tier];
    const multiplier = FrBalance.FLOOR_ORE_MULTIPLIER[context.floor ?? 1];
    const iron = odds[2] * multiplier;
    const diamond = odds[3] * multiplier;
    const copper = Math.max(0, Math.min(odds[1], 1 - iron - diamond));
    const stone = Math.max(0, 1 - copper - iron - diamond);
    return [
      { item: "stone", weight: stone, legend: false }, { item: "copper", weight: copper, legend: false },
      { item: "iron", weight: iron, legend: false }, { item: "diamond", weight: diamond, legend: true },
    ];
  }
}

class FrDungeonDrops {
  static readonly PITY_KEY = "dungeon";

  static roll(random: FrRandom, difficulty: FrDifficulty, miss: number): { items: FrCost; gotLegend: boolean } {
    const items: FrCost = {};
    let gotLegend = false;
    FrCatalog.DROPS[difficulty].forEach((drop) => {
      const legend = FrCatalog.LEGEND_DROPS.indexOf(drop.item) >= 0;
      const chance = legend ? FrPity.boost(drop.chance, miss) : drop.chance;
      if (!random.chance(chance)) return;
      items[drop.item] = (items[drop.item] || 0) + random.between(drop.min, drop.max);
      if (legend) gotLegend = true;
    });
    return { items, gotLegend };
  }
}

class FrItems {
  static isStackable(id: string): boolean {
    return id.indexOf("gear_") !== 0 && id !== "ring" && id.indexOf("furniture_") !== 0;
  }
  static gearId(kind: string, tier: FrTier): string { return "gear_" + kind + "_" + tier; }
  static parseGear(id: string): { kind: string; tier: FrTier } | null {
    const parts = id.split("_");
    if (parts[0] !== "gear" || parts.length !== 3) return null;
    return { kind: parts[1], tier: Number(parts[2]) as FrTier };
  }
  static durabilityOf(id: string): number {
    const gear = FrItems.parseGear(id);
    if (!gear) return 0;
    return gear.kind === "weapon" ? FrBalance.WEAPON_DURABILITY : FrItems.TOOL_KINDS.indexOf(gear.kind) >= 0 ? FrBalance.TOOL_DURABILITY : 0;
  }
  static readonly TOOL_KINDS = ["axe", "pickaxe", "rod", "shovel", "basket"];
  static readonly ARMOR_KINDS = ["helmet", "top", "bottom", "shoes"];
  static readonly GEAR_KINDS = ["weapon", "helmet", "top", "bottom", "shoes", "axe", "pickaxe", "rod", "shovel", "basket"];
  static readonly TIER_MATERIAL: ReadonlyArray<string> = ["", "wood", "iron", "diamond"];
  static readonly TIER_NAMES = ["맨손", "나무", "철", "다이아몬드"];
}

class FrBag implements FrStore {
  readonly slots: FrBagSlot[] = [];

  count(id: string): number {
    return this.slots.filter((s) => s.id === id).reduce((sum, s) => sum + s.count, 0);
  }

  add(id: string, amount: number, uses = 0): number {
    let left = amount;
    if (FrItems.isStackable(id)) {
      for (const slot of this.slots) {
        if (slot.id !== id || left <= 0) continue;
        const room = FrBalance.STACK_SIZE - slot.count;
        const put = Math.min(room, left);
        slot.count += put;
        left -= put;
      }
    }
    while (left > 0 && this.slots.length < FrBalance.BAG_SLOTS) {
      const put = FrItems.isStackable(id) ? Math.min(FrBalance.STACK_SIZE, left) : 1;
      this.slots.push({ id, count: put, uses: uses || FrItems.durabilityOf(id) });
      left -= put;
    }
    return left;
  }

  take(id: string, amount: number): void {
    let left = amount;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      if (this.slots[i].id !== id) continue;
      const cut = Math.min(this.slots[i].count, left);
      this.slots[i].count -= cut;
      left -= cut;
      if (this.slots[i].count === 0) this.slots.splice(i, 1);
    }
  }

  bestTier(kind: string): FrTier {
    let best: FrTier = 0;
    this.slots.forEach((slot) => {
      const gear = FrItems.parseGear(slot.id);
      if (gear && gear.kind === kind && gear.tier > best) best = gear.tier;
    });
    return best;
  }

  wear(kind: string): string | null {
    const tier = this.bestTier(kind);
    if (tier === 0) return null;
    const id = FrItems.gearId(kind, tier);
    const index = this.slots.findIndex((s) => s.id === id);
    this.slots[index].uses -= 1;
    if (this.slots[index].uses > 0) return null;
    this.slots.splice(index, 1);
    return id;
  }

  freeSlots(): number { return FrBalance.BAG_SLOTS - this.slots.length; }

  move(from: number, to: number): boolean {
    if (from < 0 || from >= this.slots.length || to < 0 || from === to) return false;
    if (to >= this.slots.length) {
      const [slot] = this.slots.splice(from, 1);
      this.slots.push(slot);
      return true;
    }
    const held = this.slots[to];
    this.slots[to] = this.slots[from];
    this.slots[from] = held;
    return true;
  }
}

class FrPublicStore implements FrStore {
  private readonly amounts: Map<string, number> = new Map();
  readonly log: FrPublicLogLine[] = [];

  count(id: string): number { return this.amounts.get(id) || 0; }

  slotsUsed(): number {
    let used = 0;
    this.amounts.forEach((n) => { used += Math.ceil(n / FrBalance.STACK_SIZE); });
    return used;
  }

  restore(amounts: Record<string, number>, lines: FrPublicLogLine[]): void {
    this.amounts.clear();
    Object.keys(amounts).forEach((id) => { if (amounts[id] > 0) this.amounts.set(id, amounts[id]); });
    this.log.length = 0;
    lines.slice().sort((x, y) => y.at - x.at).slice(0, FrBalance.PUBLIC_LOG_LINES).forEach((line) => this.log.push(line));
  }

  setAmount(id: string, amount: number): void {
    if (amount > 0) this.amounts.set(id, amount); else this.amounts.delete(id);
  }

  addLine(line: FrPublicLogLine): void {
    this.log.unshift(line);
    this.log.sort((a, b) => b.at - a.at);
    if (this.log.length > FrBalance.PUBLIC_LOG_LINES) this.log.length = FrBalance.PUBLIC_LOG_LINES;
  }

  amountsSnapshot(): Record<string, number> {
    const copy: Record<string, number> = {};
    this.amounts.forEach((n, id) => { copy[id] = n; });
    return copy;
  }

  canPut(id: string, amount: number): boolean {
    const now = this.count(id);
    const extra = Math.ceil((now + amount) / FrBalance.STACK_SIZE) - Math.ceil(now / FrBalance.STACK_SIZE);
    return FrItems.isStackable(id) && id !== "ring" && this.slotsUsed() + extra <= FrBalance.PUBLIC_SLOTS;
  }

  put(id: string, amount: number, who: string, at: number): boolean {
    if (!this.canPut(id, amount)) return false;
    this.amounts.set(id, this.count(id) + amount);
    this.record({ at, who, verb: "put", item: id, count: amount });
    return true;
  }

  take(id: string, amount: number): void {
    const left = this.count(id) - amount;
    if (left <= 0) this.amounts.delete(id); else this.amounts.set(id, left);
  }

  takeBy(id: string, amount: number, who: string, at: number, verb: "take" | "build"): boolean {
    if (this.count(id) < amount) return false;
    this.take(id, amount);
    this.record({ at, who, verb, item: id, count: amount });
    return true;
  }

  private record(line: FrPublicLogLine): void {
    this.log.unshift(line);
    if (this.log.length > FrBalance.PUBLIC_LOG_LINES) this.log.pop();
  }
}

class FrChestStore implements FrStore {
  private readonly amounts: Map<string, number> = new Map();
  count(id: string): number { return this.amounts.get(id) || 0; }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    this.amounts.forEach((n, id) => { out[id] = n; });
    return out;
  }

  restore(amounts: Record<string, number>): void {
    this.amounts.clear();
    Object.keys(amounts).forEach((id) => { if (amounts[id] > 0) this.amounts.set(id, amounts[id]); });
  }

  slotsUsed(): number {
    let used = 0;
    this.amounts.forEach((n) => { used += Math.ceil(n / FrBalance.STACK_SIZE); });
    return used;
  }

  canPut(id: string, amount: number): boolean {
    const now = this.count(id);
    const extra = Math.ceil((now + amount) / FrBalance.STACK_SIZE) - Math.ceil(now / FrBalance.STACK_SIZE);
    return FrItems.isStackable(id) && id !== "ring" && this.slotsUsed() + extra <= FrBalance.PERSONAL_SLOTS;
  }

  ids(): string[] { return Array.from(this.amounts.keys()); }
  put(id: string, amount: number): void { this.amounts.set(id, this.count(id) + amount); }
  take(id: string, amount: number): void {
    const left = this.count(id) - amount;
    if (left <= 0) this.amounts.delete(id); else this.amounts.set(id, left);
  }
}

abstract class FrMaterialSource {
  protected abstract stores(): FrStore[];

  total(id: string): number { return this.stores().reduce((sum, s) => sum + s.count(id), 0); }

  canPay(cost: FrCost): boolean {
    return Object.keys(cost).every((id) => this.total(id) >= cost[id]);
  }

  pay(cost: FrCost): boolean {
    if (!this.canPay(cost)) return false;
    Object.keys(cost).forEach((id) => {
      let left = cost[id];
      for (const store of this.stores()) {
        const cut = Math.min(store.count(id), left);
        if (cut > 0) store.take(id, cut);
        left -= cut;
      }
    });
    return true;
  }
}

class FrPersonalCraftSource extends FrMaterialSource {
  constructor(private readonly chest: FrStore, private readonly bag: FrStore, private readonly publicStore: FrStore) { super(); }
  protected stores(): FrStore[] { return [this.chest, this.bag, this.publicStore]; }
}

class FrVillageBuildSource extends FrMaterialSource {
  constructor(private readonly publicStore: FrStore) { super(); }
  protected stores(): FrStore[] { return [this.publicStore]; }
}

class FrActionPoints {
  current: number;
  bonus = 0;
  constructor(public ringLevel: number, current?: number) {
    this.current = current === undefined ? this.max() : Math.min(current, this.max());
  }
  max(): number {
    return Math.min(FrBalance.MAX_ACTION_POINTS_CAP, FrBalance.BASE_ACTION_POINTS + this.ringLevel * FrBalance.RING_ACTION_POINTS_PER_LEVEL + this.bonus);
  }
  unlimited = false;
  canSpend(cost: number): boolean { return this.unlimited || this.current >= cost; }
  spend(cost: number): boolean {
    if (!this.canSpend(cost)) return false;
    if (this.unlimited) return true;
    this.current -= cost;
    return true;
  }
  restore(amount: number): void { this.current = Math.min(this.max(), this.current + amount); }
  fill(): void { this.current = this.max(); }
}

class FrFoodRules {
  static islandGain(star: number): number { return FrBalance.FOOD_BY_STAR[star].island; }
  static dungeonGain(star: number): number { return FrBalance.FOOD_BY_STAR[star].dungeon; }
  static starOfIngredient(id: string): number {
    const recipe = FrCatalog.RECIPES.find((r) => r.id === id);
    if (recipe) return recipe.star;
    const material = FrCatalog.material(id);
    return material && (material.category === "crop" || id.indexOf("apple") >= 0 || FrCatalog.FRUITS.indexOf(id) >= 0) ? 0 : -1;
  }
  static canEat(id: string): boolean { return FrFoodRules.starOfIngredient(id) >= 0 && id.indexOf("_seed") < 0; }
}

class FrRecipeRules {
  static resolve(recipe: FrRecipeDef, source: FrMaterialSource): { cost: FrCost; missing: string[] } {
    const cost: FrCost = {};
    const missing: string[] = [];
    recipe.ingredients.forEach((ingredient) => {
      const options = ingredient.item ? [ingredient.item] : FrCatalog.groupMembers(ingredient.group as FrIngredientGroup).slice();
      let left = ingredient.count;
      options.forEach((id) => {
        if (left <= 0) return;
        const free = source.total(id) - (cost[id] || 0);
        const use = Math.max(0, Math.min(free, left));
        if (use > 0) { cost[id] = (cost[id] || 0) + use; left -= use; }
      });
      if (left > 0) missing.push(ingredient.item || (ingredient.group as string));
    });
    return { cost, missing };
  }

  static cook(recipe: FrRecipeDef, source: FrMaterialSource, bag: FrBag): FrCookResult {
    const plan = FrRecipeRules.resolve(recipe, source);
    if (plan.missing.length > 0) return { ok: false, missing: plan.missing };
    source.pay(plan.cost);
    bag.add(recipe.id, 1);
    return { ok: true, missing: [] };
  }

  static unlocked(recipe: FrRecipeDef, seen: ReadonlySet<string>): boolean {
    return recipe.star === 1 || recipe.ingredients.every((i) => i.item ? seen.has(i.item) : FrCatalog.groupMembers(i.group as FrIngredientGroup).some((id) => seen.has(id)));
  }
}

class FrCraftRules {
  static gearCost(tier: FrTier): FrCost { return { [FrItems.TIER_MATERIAL[tier]]: FrBalance.GEAR_MATERIAL_COUNT }; }

  static craftGear(kind: string, tier: FrTier, source: FrMaterialSource, bag: FrBag): boolean {
    if (tier === 0 || FrItems.GEAR_KINDS.indexOf(kind) < 0) return false;
    if (bag.freeSlots() < 1 || !source.pay(FrCraftRules.gearCost(tier))) return false;
    bag.add(FrItems.gearId(kind, tier), 1);
    return true;
  }
}

class FrRingRules {
  static successRate(targetLevel: number): number { return FrBalance.RING_SUCCESS[targetLevel] || 0; }

  static cost(targetLevel: number): { enhance: number; magic: number } { return FrBalance.RING_COST[targetLevel]; }

  static attempt(level: number, random: FrRandom): FrRingAttempt {
    const target = level + 1;
    if (target > FrBalance.RING_MAX_LEVEL) return { level, success: false };
    const success = random.chance(FrRingRules.successRate(target));
    return { level: success ? target : level, success };
  }

  static melt(): FrCost { return { enhance_stone: FrBalance.RING_MELT_ENHANCE }; }
}

class FrCropRules {
  static growMinutes(cropId: string, nearWater: boolean): number {
    const crop = FrCatalog.CROPS.find((c) => c.id === cropId);
    if (!crop) return Infinity;
    const base = crop.days * 1440;
    return nearWater ? base / FrBalance.WATER_GROWTH_FACTOR : base;
  }

  static stage(cropId: string, nearWater: boolean, plantedGameMinute: number, nowGameMinute: number): 0 | 1 | 2 | 3 {
    const ratio = (nowGameMinute - plantedGameMinute) / FrCropRules.growMinutes(cropId, nearWater);
    if (ratio >= 1) return 3;
    return ratio >= 0.6 ? 2 : ratio >= 0.25 ? 1 : 0;
  }

  static harvest(random: FrRandom): { crop: number; seed: number } {
    return { crop: random.between(2, 3), seed: random.between(1, 2) };
  }
}

class FrSnowRules {
  static regrown(dugDay: number, today: number): boolean { return today - dugDay >= FrBalance.SNOW_REGROW_DAYS; }
}

class FrVillage {
  private readonly built: Map<string, number> = new Map();

  builtCount(id: string): number { return this.built.get(id) || 0; }

  markBuilt(id: string): void { this.built.set(id, this.builtCount(id) + 1); }

  unmarkBuilt(id: string): void { if (this.builtCount(id) > 0) this.built.set(id, this.builtCount(id) - 1); }

  score(): number {
    return FrCatalog.CONSTRUCTIONS.reduce((sum, c) => sum + c.score * this.builtCount(c.id), 0);
  }

  level(): number {
    const wallsDone = this.builtCount("wall") >= 12;
    let level = 1;
    for (let l = 2; l <= 5; l++) if (this.score() >= FrBalance.VILLAGE_LEVEL_SCORE[l] && (l < 5 || wallsDone)) level = l;
    return level;
  }

  canBuild(def: FrConstructionDef, source: FrMaterialSource): boolean {
    return this.builtCount(def.id) < def.count && this.level() >= def.minVillageLevel && source.canPay(def.cost);
  }

  build(def: FrConstructionDef, source: FrMaterialSource): boolean {
    if (!this.canBuild(def, source)) return false;
    source.pay(def.cost);
    this.built.set(def.id, this.builtCount(def.id) + 1);
    return true;
  }

  static definition(id: string): FrConstructionDef {
    return FrCatalog.CONSTRUCTIONS.find((c) => c.id === id) as FrConstructionDef;
  }
}

class FrFishingRules {
  static biteSeconds(tier: FrTier, random: FrRandom): number {
    const [min, max] = FrBalance.ROD_BITE_SECONDS[tier];
    return min + random.next() * (max - min);
  }

  static beatsFor(item: string): number {
    const grade: FrGrade = FrCatalog.FISH_LEGEND.indexOf(item) >= 0 ? "legend" : FrCatalog.FISH_RARE.indexOf(item) >= 0 ? "rare" : "common";
    return FrBalance.FISH_BEATS[grade];
  }

  static beatHit(offsetSeconds: number, tier: FrTier): boolean {
    return Math.abs(offsetSeconds) <= FrBalance.ROD_BEAT_TOLERANCE[tier];
  }
}

class FrMineRules {
  static stoneDrop(random: FrRandom): FrCost {
    return random.chance(FrBalance.STONE_COAL_CHANCE) ? { stone: 1, coal: 1 } : { stone: 1 };
  }
  static terrainStoneDrop(random: FrRandom): FrCost {
    const drop: FrCost = { stone: 1 };
    if (random.chance(FrBalance.TERRAIN_STONE_COAL_CHANCE)) drop.coal = 1;
    if (random.chance(FrBalance.TERRAIN_STONE_ORE_CHANCE)) drop[random.chance(0.5) ? "copper" : "iron"] = 1;
    return drop;
  }
}

class FrDungeonRules {
  static weaponDamage(tier: FrTier): number { return FrBalance.WEAPON_DAMAGE[tier]; }

  static armorReduction(armor: { helmet: FrTier; top: FrTier; bottom: FrTier; shoes: FrTier }): number {
    return Math.min(0.9,
      FrBalance.ARMOR_REDUCTION.helmet[armor.helmet] + FrBalance.ARMOR_REDUCTION.top[armor.top] +
      FrBalance.ARMOR_REDUCTION.bottom[armor.bottom] + FrBalance.ARMOR_REDUCTION.shoes[armor.shoes]);
  }

  static damageTaken(monsterAttack: number, reduction: number): number {
    return Math.max(1, Math.round(monsterAttack * (1 - reduction)));
  }

  static hitsToKill(monsterHp: number, weaponTier: FrTier): number {
    return Math.ceil(monsterHp / FrDungeonRules.weaponDamage(weaponTier));
  }

  static inAttackArc(dx: number, dz: number, facingRadians: number): boolean {
    const distance = Math.hypot(dx, dz);
    if (distance > FrBalance.ATTACK_RADIUS_METERS) return false;
    if (distance < 0.01) return true;
    let diff = Math.atan2(dx, dz) - facingRadians;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= (FrBalance.ATTACK_ARC_DEGREES / 2) * Math.PI / 180;
  }

  static estimateKills(difficulty: FrDifficulty, weaponTier: FrTier): number {
    const monster = FrCatalog.MONSTERS[difficulty][0];
    const perKill = FrDungeonRules.hitsToKill(monster.hp, weaponTier) * FrBalance.ATTACK_INTERVAL * 1.35 + 1.1;
    return Math.min(Math.floor(FrBalance.DUNGEON_SECONDS / perKill), Math.floor(FrBalance.DUNGEON_SECONDS / 1.2));
  }
}
