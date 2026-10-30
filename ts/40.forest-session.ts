interface FrCraftOption {
  id: string;
  label: string;
  cost: FrCost;
  output: string;
  count: number;
  station: "workbench";
}

class FrCraftMenu {
  static readonly KIND_NAMES: Readonly<Record<string, string>> = {
    weapon: "무기", helmet: "헬멧", top: "상의", bottom: "하의", shoes: "신발", axe: "도끼", pickaxe: "곡괭이", rod: "낚싯대", shovel: "삽", basket: "바구니",
  };

  static options(): FrCraftOption[] {
    const options: FrCraftOption[] = [];
    FrItems.GEAR_KINDS.forEach((kind) => {
      options.push({ id: "gear_" + kind + "_1", label: "나무 " + FrCraftMenu.KIND_NAMES[kind], cost: FrCraftRules.gearCost(1), output: FrItems.gearId(kind, 1), count: 1, station: "workbench" });
    });
    options.push({ id: "plank", label: "판자", cost: { wood: 2 }, output: "plank", count: 1, station: "workbench" });
    options.push({ id: "rope_seaweed", label: "노끈 (해초 3)", cost: { seaweed: 3 }, output: "rope", count: 1, station: "workbench" });
    options.push({ id: "rope_vine", label: "노끈 (덩굴 2)", cost: { vine: 2 }, output: "rope", count: 1, station: "workbench" });
    options.push({ id: "rope_cloth", label: "노끈 (천 1)", cost: { cloth: 1 }, output: "rope", count: 1, station: "workbench" });
    options.push({ id: "brick", label: "돌벽돌", cost: { stone: 3 }, output: "brick", count: 1, station: "workbench" });
    ["빨강", "노랑", "파랑", "하양"].forEach((name, i) => {
      options.push({ id: "dye_" + i, label: name + " 염료 (꽃 2)", cost: { ["flower_" + i]: 2 }, output: "dye_" + i, count: 1, station: "workbench" });
    });
    return options;
  }
}

class FrItemNames {
  static label(id: string): string {
    const material = FrCatalog.material(id);
    if (material) return material.name;
    const gear = FrItems.parseGear(id);
    if (gear) return FrItems.TIER_NAMES[gear.tier] + " " + FrCraftMenu.KIND_NAMES[gear.kind];
    const recipe = FrCatalog.RECIPES.find((r) => r.id === id);
    return recipe ? recipe.name : id;
  }

  static grade(id: string): FrGrade {
    const material = FrCatalog.material(id);
    if (material) return material.grade;
    return id.indexOf("gear_") === 0 ? "rare" : "common";
  }

  static mark(id: string): string {
    const gear = FrItems.parseGear(id);
    if (gear) return FrCraftMenu.KIND_NAMES[gear.kind].slice(0, 1);
    const recipe = FrCatalog.RECIPES.find((r) => r.id === id);
    if (recipe) return "★" + recipe.star;
    return FrItemNames.label(id).slice(0, 2);
  }

  static readonly GRADE_COLORS: Readonly<Record<FrGrade, string>> = { common: "#B8BEC9", rare: "#5B9BFF", legend: "#F08A3E" };
}

class FrSession {
  readonly bag = new FrBag();
  readonly ap: FrActionPoints;
  readonly seen: Set<string> = new Set();
  readonly pity: Record<string, number> = {};
  readonly personal = new FrChestStore();
  private readonly listeners: Array<() => void> = [];
  sleeping = false;
  area = "island";

  constructor(readonly world: FrWorld, readonly uid: string, readonly nick: string, ringLevel = 0) {
    this.ap = new FrActionPoints(ringLevel);
  }

  onChange(listener: () => void): void { this.listeners.push(listener); }
  changed(): void { this.listeners.forEach((l) => l()); }

  craftSource(): FrPersonalCraftSource { return new FrPersonalCraftSource(this.personal, this.bag, this.world.publicStore); }

  gain(id: string, amount: number): number {
    const left = this.bag.add(id, amount);
    if (amount - left > 0) this.seen.add(id);
    this.changed();
    return left;
  }

  gainAll(cost: FrCost): number {
    let lost = 0;
    Object.keys(cost).forEach((id) => { lost += this.gain(id, cost[id]); });
    return lost;
  }

  eat(id: string): boolean {
    if (!FrFoodRules.canEat(id) || this.bag.count(id) < 1 || this.ap.current >= this.ap.max()) return false;
    this.bag.take(id, 1);
    this.ap.restore(FrFoodRules.islandGain(Math.max(0, FrFoodRules.starOfIngredient(id))));
    this.changed();
    return true;
  }

  craft(option: FrCraftOption): boolean {
    const source = this.craftSource();
    if (!source.canPay(option.cost)) return false;
    if (FrItems.isStackable(option.output) ? this.bag.freeSlots() < 1 && this.bag.count(option.output) % FrBalance.STACK_SIZE === 0 : this.bag.freeSlots() < 1) return false;
    source.pay(option.cost);
    this.gain(option.output, option.count);
    return true;
  }

  cook(recipe: FrRecipeDef): FrCookResult {
    const result = FrRecipeRules.cook(recipe, this.craftSource(), this.bag);
    if (result.ok) { this.seen.add(recipe.id); this.changed(); }
    return result;
  }

  wearTool(kind: string): string | null {
    const broken = this.bag.wear(kind);
    this.changed();
    return broken;
  }

  toSave(): FrSaveData {
    return {
      bag: this.bag.slots.map((s) => ({ id: s.id, count: s.count, uses: s.uses })),
      ap: Math.round(this.ap.current),
      ring: this.ap.ringLevel,
      pity: { ...this.pity },
      seen: Array.from(this.seen),
      lastAt: Date.now(),
    };
  }

  restore(data: FrSaveData): void {
    this.bag.slots.length = 0;
    data.bag.forEach((s) => this.bag.slots.push({ id: s.id, count: s.count, uses: s.uses }));
    this.ap.ringLevel = data.ring;
    this.ap.current = Math.min(data.ap, this.ap.max());
    Object.keys(data.pity).forEach((k) => { this.pity[k] = data.pity[k]; });
    data.seen.forEach((id) => this.seen.add(id));
  }
}
