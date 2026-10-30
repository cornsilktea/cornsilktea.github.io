"use strict";
class FrCraftMenu {
    static options() {
        const options = [];
        FrItems.GEAR_KINDS.forEach((kind) => {
            options.push({ id: "gear_" + kind + "_1", label: "나무 " + FrCraftMenu.KIND_NAMES[kind], cost: FrCraftRules.gearCost(1), output: FrItems.gearId(kind, 1), count: 1, station: "workbench" });
        });
        FrItems.GEAR_KINDS.forEach((kind) => [2, 3].forEach((tier) => {
            options.push({ id: "gear_" + kind + "_" + tier, label: FrItems.TIER_NAMES[tier] + " " + FrCraftMenu.KIND_NAMES[kind], cost: FrCraftRules.gearCost(tier), output: FrItems.gearId(kind, tier), count: 1, station: "forge" });
        }));
        options.push({ id: "plank", label: "판자", cost: { wood: 2 }, output: "plank", count: 1, station: "workbench" });
        const block = (id, label, cost, count = 1) => options.push({ id: "make_" + id, label, cost, output: id, count, station: "workbench" });
        block("block_wood", "나무 블록", { wood: 1 });
        block("block_plank", "판자 블록", { plank: 1 });
        block("block_brick", "돌벽돌 블록", { brick: 1 });
        block("block_stone", "돌 블록", { stone: 1 });
        block("block_glass", "유리 블록", { glass: 1 });
        block("block_ice", "얼음 블록", { ice: 1 });
        ["빨강", "노랑", "파랑", "초록"].forEach((name, i) => block("block_color_" + i, name + " 블록 ×4", { plank: 1, ["dye_" + i]: 1 }, 4));
        block("block_stairs", "계단 ×3", { block_plank: 2 }, 3);
        block("block_slab", "반 블록 ×3", { block_plank: 2 }, 3);
        block("block_fence", "울타리 ×3", { block_plank: 2 }, 3);
        block("block_door", "문", { plank: 3 });
        block("block_window", "창문", { glass: 2 });
        block("block_torch", "횃불 ×4", { wood: 1, coal: 1 }, 4);
        FrFurnitureCatalog.ITEMS.forEach((f) => options.push({ id: "make_" + FrFurnitureCatalog.idOf(f.id), label: "가구 · " + f.name, cost: f.cost, output: FrFurnitureCatalog.idOf(f.id), count: 1, station: "workbench" }));
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
FrCraftMenu.KIND_NAMES = {
    weapon: "무기", helmet: "헬멧", top: "상의", bottom: "하의", shoes: "신발", axe: "도끼", pickaxe: "곡괭이", rod: "낚싯대", shovel: "삽", basket: "바구니",
};
class FrItemNames {
    static label(id) {
        const material = FrCatalog.material(id);
        if (material)
            return material.name;
        const gear = FrItems.parseGear(id);
        if (gear)
            return FrItems.TIER_NAMES[gear.tier] + " " + FrCraftMenu.KIND_NAMES[gear.kind];
        const recipe = FrCatalog.RECIPES.find((r) => r.id === id);
        return recipe ? recipe.name : id;
    }
    static grade(id) {
        const material = FrCatalog.material(id);
        if (material)
            return material.grade;
        return id.indexOf("gear_") === 0 ? "rare" : "common";
    }
    static mark(id) {
        const gear = FrItems.parseGear(id);
        if (gear)
            return FrCraftMenu.KIND_NAMES[gear.kind].slice(0, 1);
        const recipe = FrCatalog.RECIPES.find((r) => r.id === id);
        if (recipe)
            return "★" + recipe.star;
        return FrItemNames.label(id).slice(0, 2);
    }
}
FrItemNames.GRADE_COLORS = { common: "#B8BEC9", rare: "#5B9BFF", legend: "#F08A3E" };
class FrSession {
    constructor(world, uid, nick, no, ringLevel = 0) {
        this.world = world;
        this.uid = uid;
        this.nick = nick;
        this.no = no;
        this.bag = new FrBag();
        this.seen = new Set();
        this.pity = {};
        this.stats = new FrStats();
        this.personal = new FrChestStore();
        this.listeners = [];
        this.sleeping = false;
        this.area = "island";
        this.selected = 0;
        this.floor = 1;
        this.admin = false;
        this.ap = new FrActionPoints(ringLevel);
    }
    onChange(listener) { this.listeners.push(listener); }
    player() { return { uid: this.uid, no: this.no, admin: this.admin }; }
    heldBlock() {
        const slot = this.bag.slots[this.selected];
        return slot && (slot.id.indexOf("block_") === 0 || FrFurnitureCatalog.isFurniture(slot.id)) ? slot.id : null;
    }
    changed() {
        const ring = FrRingKit.level(this);
        if (ring !== this.ap.ringLevel) {
            this.ap.ringLevel = ring;
            this.ap.current = Math.min(this.ap.current, this.ap.max());
        }
        this.listeners.forEach((l) => l());
    }
    craftSource() { return new FrPersonalCraftSource(this.personal, this.bag, this.world.publicStore); }
    gain(id, amount) {
        const left = this.bag.add(id, amount);
        if (amount - left > 0) {
            this.seen.add(id);
            this.stats.add("itemsTotal", amount - left);
            this.stats.see("items", id, "itemKinds");
        }
        this.changed();
        return left;
    }
    gainAll(cost) {
        let lost = 0;
        Object.keys(cost).forEach((id) => { lost += this.gain(id, cost[id]); });
        return lost;
    }
    eat(id) {
        if (!FrFoodRules.canEat(id) || this.bag.count(id) < 1 || this.ap.current >= this.ap.max())
            return false;
        this.bag.take(id, 1);
        this.ap.restore(FrFoodRules.islandGain(Math.max(0, FrFoodRules.starOfIngredient(id))));
        this.changed();
        return true;
    }
    craft(option) {
        const source = this.craftSource();
        if (!source.canPay(option.cost))
            return false;
        if (FrItems.isStackable(option.output) ? this.bag.freeSlots() < 1 && this.bag.count(option.output) % FrBalance.STACK_SIZE === 0 : this.bag.freeSlots() < 1)
            return false;
        source.pay(option.cost);
        this.gain(option.output, option.count);
        this.stats.add(option.output.indexOf("gear_") === 0 ? "craftGear" : option.output.indexOf("block_") === 0 || FrFurnitureCatalog.isFurniture(option.output) ? "craftBlocks" : "craftProcessed", option.count);
        return true;
    }
    cook(recipe) {
        const result = FrRecipeRules.cook(recipe, this.craftSource(), this.bag);
        if (result.ok) {
            this.seen.add(recipe.id);
            this.stats.add("cooked");
            this.stats.see("recipes", recipe.id, "recipeKinds");
            this.changed();
        }
        return result;
    }
    wearTool(kind) {
        const broken = this.bag.wear(kind);
        this.changed();
        return broken;
    }
    toSave() {
        return {
            bag: this.bag.slots.map((s) => ({ id: s.id, count: s.count, uses: s.uses })),
            ap: Math.round(this.ap.current),
            ring: this.ap.ringLevel,
            pity: { ...this.pity },
            seen: Array.from(this.seen),
            lastAt: Date.now(),
            stats: this.stats.data,
            chest: this.personal.snapshot(),
        };
    }
    restore(data) {
        this.bag.slots.length = 0;
        data.bag.forEach((s) => this.bag.slots.push({ id: s.id, count: s.count, uses: s.uses }));
        this.ap.ringLevel = data.ring;
        this.ap.current = Math.min(data.ap, this.ap.max());
        Object.keys(data.pity).forEach((k) => { this.pity[k] = data.pity[k]; });
        data.seen.forEach((id) => this.seen.add(id));
        this.stats.load(data.stats || null, FrStats.dayStamp(new Date()));
        this.personal.restore(data.chest || {});
    }
}
