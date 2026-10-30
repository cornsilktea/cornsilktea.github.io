"use strict";
class FrRandom {
    constructor(seed) { this.state = seed >>> 0; }
    next() {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    chance(p) { return this.next() < p; }
    between(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
    pick(list) { return list[Math.floor(this.next() * list.length) % list.length]; }
}
class FrPity {
    static boost(base, miss) {
        if (base <= 0)
            return 0;
        return Math.min(1, base + FrBalance.PITY_STEP * miss);
    }
}
class FrLegendRoll {
    roll(random, context, miss) {
        const items = this.table(context);
        const baseLegend = items.filter((w) => w.legend).reduce((sum, w) => sum + w.weight, 0);
        const legend = FrPity.boost(baseLegend, miss);
        const legendScale = baseLegend > 0 ? legend / baseLegend : 0;
        const otherScale = baseLegend < 1 ? (1 - legend) / (1 - baseLegend) : 0;
        let pointer = random.next();
        for (const entry of items) {
            const weight = entry.weight * (entry.legend ? legendScale : otherScale);
            if (pointer < weight)
                return { item: entry.item, legend: entry.legend, miss: entry.legend ? 0 : miss + (legend > 0 ? 1 : 0) };
            pointer -= weight;
        }
        const last = items[items.length - 1];
        return { item: last.item, legend: last.legend, miss: last.legend ? 0 : miss + (legend > 0 ? 1 : 0) };
    }
    static successRate(table, miss) {
        const base = table.filter((w) => w.legend).reduce((sum, w) => sum + w.weight, 0);
        return FrPity.boost(base, miss);
    }
}
class FrFruitRoll extends FrLegendRoll {
    constructor() {
        super(...arguments);
        this.pityKey = "fruit";
    }
    table(context) {
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
    constructor() {
        super(...arguments);
        this.pityKey = "seed";
    }
    table() {
        return FrCatalog.CROPS.map((crop) => ({
            item: crop.id + "_seed",
            weight: crop.grade === "common" ? 0.1 : crop.grade === "rare" ? 0.07 : 0.05,
            legend: crop.grade === "legend",
        }));
    }
}
class FrFishRoll extends FrLegendRoll {
    constructor() {
        super(...arguments);
        this.pityKey = "fish";
    }
    table(context) {
        const odds = FrBalance.FISH_ODDS[context.tier];
        const groups = [
            [FrCatalog.FISH_COMMON, odds[0], false], [FrCatalog.FISH_RARE, odds[1], false], [FrCatalog.FISH_LEGEND, odds[2], true],
        ];
        const result = [];
        groups.forEach(([ids, total, legend]) => ids.forEach((item) => result.push({ item, weight: total / ids.length, legend })));
        return result;
    }
}
class FrOreRoll extends FrLegendRoll {
    constructor() {
        super(...arguments);
        this.pityKey = "ore";
    }
    table(context) {
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
    static roll(random, difficulty, miss) {
        const items = {};
        let gotLegend = false;
        FrCatalog.DROPS[difficulty].forEach((drop) => {
            const legend = FrCatalog.LEGEND_DROPS.indexOf(drop.item) >= 0;
            const chance = legend ? FrPity.boost(drop.chance, miss) : drop.chance;
            if (!random.chance(chance))
                return;
            items[drop.item] = (items[drop.item] || 0) + random.between(drop.min, drop.max);
            if (legend)
                gotLegend = true;
        });
        return { items, gotLegend };
    }
}
FrDungeonDrops.PITY_KEY = "dungeon";
class FrItems {
    static isStackable(id) {
        return id.indexOf("gear_") !== 0 && id !== "ring" && id.indexOf("furniture_") !== 0;
    }
    static gearId(kind, tier) { return "gear_" + kind + "_" + tier; }
    static parseGear(id) {
        const parts = id.split("_");
        if (parts[0] !== "gear" || parts.length !== 3)
            return null;
        return { kind: parts[1], tier: Number(parts[2]) };
    }
    static durabilityOf(id) {
        const gear = FrItems.parseGear(id);
        if (!gear)
            return 0;
        return gear.kind === "weapon" ? FrBalance.WEAPON_DURABILITY : FrItems.TOOL_KINDS.indexOf(gear.kind) >= 0 ? FrBalance.TOOL_DURABILITY : 0;
    }
}
FrItems.TOOL_KINDS = ["axe", "pickaxe", "rod", "shovel", "basket"];
FrItems.ARMOR_KINDS = ["helmet", "top", "bottom", "shoes"];
FrItems.GEAR_KINDS = ["weapon", "helmet", "top", "bottom", "shoes", "axe", "pickaxe", "rod", "shovel", "basket"];
FrItems.TIER_MATERIAL = ["", "wood", "iron", "diamond"];
FrItems.TIER_NAMES = ["맨손", "나무", "철", "다이아몬드"];
class FrBag {
    constructor() {
        this.slots = [];
    }
    count(id) {
        return this.slots.filter((s) => s.id === id).reduce((sum, s) => sum + s.count, 0);
    }
    add(id, amount, uses = 0) {
        let left = amount;
        if (FrItems.isStackable(id)) {
            for (const slot of this.slots) {
                if (slot.id !== id || left <= 0)
                    continue;
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
    take(id, amount) {
        let left = amount;
        for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
            if (this.slots[i].id !== id)
                continue;
            const cut = Math.min(this.slots[i].count, left);
            this.slots[i].count -= cut;
            left -= cut;
            if (this.slots[i].count === 0)
                this.slots.splice(i, 1);
        }
    }
    bestTier(kind) {
        let best = 0;
        this.slots.forEach((slot) => {
            const gear = FrItems.parseGear(slot.id);
            if (gear && gear.kind === kind && gear.tier > best)
                best = gear.tier;
        });
        return best;
    }
    wear(kind) {
        const tier = this.bestTier(kind);
        if (tier === 0)
            return null;
        const id = FrItems.gearId(kind, tier);
        const index = this.slots.findIndex((s) => s.id === id);
        this.slots[index].uses -= 1;
        if (this.slots[index].uses > 0)
            return null;
        this.slots.splice(index, 1);
        return id;
    }
    freeSlots() { return FrBalance.BAG_SLOTS - this.slots.length; }
}
class FrPublicStore {
    constructor() {
        this.amounts = new Map();
        this.log = [];
    }
    count(id) { return this.amounts.get(id) || 0; }
    slotsUsed() {
        let used = 0;
        this.amounts.forEach((n) => { used += Math.ceil(n / FrBalance.STACK_SIZE); });
        return used;
    }
    restore(amounts, lines) {
        this.amounts.clear();
        Object.keys(amounts).forEach((id) => { if (amounts[id] > 0)
            this.amounts.set(id, amounts[id]); });
        this.log.length = 0;
        lines.slice().sort((x, y) => y.at - x.at).slice(0, FrBalance.PUBLIC_LOG_LINES).forEach((line) => this.log.push(line));
    }
    setAmount(id, amount) {
        if (amount > 0)
            this.amounts.set(id, amount);
        else
            this.amounts.delete(id);
    }
    addLine(line) {
        this.log.unshift(line);
        this.log.sort((a, b) => b.at - a.at);
        if (this.log.length > FrBalance.PUBLIC_LOG_LINES)
            this.log.length = FrBalance.PUBLIC_LOG_LINES;
    }
    amountsSnapshot() {
        const copy = {};
        this.amounts.forEach((n, id) => { copy[id] = n; });
        return copy;
    }
    canPut(id, amount) {
        const now = this.count(id);
        const extra = Math.ceil((now + amount) / FrBalance.STACK_SIZE) - Math.ceil(now / FrBalance.STACK_SIZE);
        return FrItems.isStackable(id) && id !== "ring" && this.slotsUsed() + extra <= FrBalance.PUBLIC_SLOTS;
    }
    put(id, amount, who, at) {
        if (!this.canPut(id, amount))
            return false;
        this.amounts.set(id, this.count(id) + amount);
        this.record({ at, who, verb: "put", item: id, count: amount });
        return true;
    }
    take(id, amount) {
        const left = this.count(id) - amount;
        if (left <= 0)
            this.amounts.delete(id);
        else
            this.amounts.set(id, left);
    }
    takeBy(id, amount, who, at, verb) {
        if (this.count(id) < amount)
            return false;
        this.take(id, amount);
        this.record({ at, who, verb, item: id, count: amount });
        return true;
    }
    record(line) {
        this.log.unshift(line);
        if (this.log.length > FrBalance.PUBLIC_LOG_LINES)
            this.log.pop();
    }
}
class FrChestStore {
    constructor() {
        this.amounts = new Map();
    }
    count(id) { return this.amounts.get(id) || 0; }
    snapshot() {
        const out = {};
        this.amounts.forEach((n, id) => { out[id] = n; });
        return out;
    }
    restore(amounts) {
        this.amounts.clear();
        Object.keys(amounts).forEach((id) => { if (amounts[id] > 0)
            this.amounts.set(id, amounts[id]); });
    }
    slotsUsed() {
        let used = 0;
        this.amounts.forEach((n) => { used += Math.ceil(n / FrBalance.STACK_SIZE); });
        return used;
    }
    canPut(id, amount) {
        const now = this.count(id);
        const extra = Math.ceil((now + amount) / FrBalance.STACK_SIZE) - Math.ceil(now / FrBalance.STACK_SIZE);
        return FrItems.isStackable(id) && id !== "ring" && this.slotsUsed() + extra <= FrBalance.PERSONAL_SLOTS;
    }
    ids() { return Array.from(this.amounts.keys()); }
    put(id, amount) { this.amounts.set(id, this.count(id) + amount); }
    take(id, amount) {
        const left = this.count(id) - amount;
        if (left <= 0)
            this.amounts.delete(id);
        else
            this.amounts.set(id, left);
    }
}
class FrMaterialSource {
    total(id) { return this.stores().reduce((sum, s) => sum + s.count(id), 0); }
    canPay(cost) {
        return Object.keys(cost).every((id) => this.total(id) >= cost[id]);
    }
    pay(cost) {
        if (!this.canPay(cost))
            return false;
        Object.keys(cost).forEach((id) => {
            let left = cost[id];
            for (const store of this.stores()) {
                const cut = Math.min(store.count(id), left);
                if (cut > 0)
                    store.take(id, cut);
                left -= cut;
            }
        });
        return true;
    }
}
class FrPersonalCraftSource extends FrMaterialSource {
    constructor(chest, bag, publicStore) {
        super();
        this.chest = chest;
        this.bag = bag;
        this.publicStore = publicStore;
    }
    stores() { return [this.chest, this.bag, this.publicStore]; }
}
class FrVillageBuildSource extends FrMaterialSource {
    constructor(publicStore) {
        super();
        this.publicStore = publicStore;
    }
    stores() { return [this.publicStore]; }
}
class FrActionPoints {
    constructor(ringLevel, current) {
        this.ringLevel = ringLevel;
        this.current = current === undefined ? this.max() : Math.min(current, this.max());
    }
    max() {
        return Math.min(FrBalance.MAX_ACTION_POINTS_CAP, FrBalance.BASE_ACTION_POINTS + this.ringLevel * FrBalance.RING_ACTION_POINTS_PER_LEVEL);
    }
    canSpend(cost) { return this.current >= cost; }
    spend(cost) {
        if (!this.canSpend(cost))
            return false;
        this.current -= cost;
        return true;
    }
    restore(amount) { this.current = Math.min(this.max(), this.current + amount); }
    fill() { this.current = this.max(); }
}
class FrFoodRules {
    static islandGain(star) { return FrBalance.FOOD_BY_STAR[star].island; }
    static dungeonGain(star) { return FrBalance.FOOD_BY_STAR[star].dungeon; }
    static starOfIngredient(id) {
        const recipe = FrCatalog.RECIPES.find((r) => r.id === id);
        if (recipe)
            return recipe.star;
        const material = FrCatalog.material(id);
        return material && (material.category === "crop" || id.indexOf("apple") >= 0 || FrCatalog.FRUITS.indexOf(id) >= 0) ? 0 : -1;
    }
    static canEat(id) { return FrFoodRules.starOfIngredient(id) >= 0 && id.indexOf("_seed") < 0; }
}
class FrRecipeRules {
    static resolve(recipe, source) {
        const cost = {};
        const missing = [];
        recipe.ingredients.forEach((ingredient) => {
            const options = ingredient.item ? [ingredient.item] : FrCatalog.groupMembers(ingredient.group).slice();
            let left = ingredient.count;
            options.forEach((id) => {
                if (left <= 0)
                    return;
                const free = source.total(id) - (cost[id] || 0);
                const use = Math.max(0, Math.min(free, left));
                if (use > 0) {
                    cost[id] = (cost[id] || 0) + use;
                    left -= use;
                }
            });
            if (left > 0)
                missing.push(ingredient.item || ingredient.group);
        });
        return { cost, missing };
    }
    static cook(recipe, source, bag) {
        const plan = FrRecipeRules.resolve(recipe, source);
        if (plan.missing.length > 0)
            return { ok: false, missing: plan.missing };
        source.pay(plan.cost);
        bag.add(recipe.id, 1);
        return { ok: true, missing: [] };
    }
    static unlocked(recipe, seen) {
        return recipe.star === 1 || recipe.ingredients.every((i) => i.item ? seen.has(i.item) : FrCatalog.groupMembers(i.group).some((id) => seen.has(id)));
    }
}
class FrCraftRules {
    static gearCost(tier) { return { [FrItems.TIER_MATERIAL[tier]]: FrBalance.GEAR_MATERIAL_COUNT }; }
    static craftGear(kind, tier, source, bag) {
        if (tier === 0 || FrItems.GEAR_KINDS.indexOf(kind) < 0)
            return false;
        if (bag.freeSlots() < 1 || !source.pay(FrCraftRules.gearCost(tier)))
            return false;
        bag.add(FrItems.gearId(kind, tier), 1);
        return true;
    }
}
class FrRingRules {
    static successRate(targetLevel) { return FrBalance.RING_SUCCESS[targetLevel] || 0; }
    static cost(targetLevel) { return FrBalance.RING_COST[targetLevel]; }
    static attempt(level, random) {
        const target = level + 1;
        if (target > FrBalance.RING_MAX_LEVEL)
            return { level, success: false };
        const success = random.chance(FrRingRules.successRate(target));
        return { level: success ? target : level, success };
    }
    static melt() { return { enhance_stone: FrBalance.RING_MELT_ENHANCE }; }
}
class FrCropRules {
    static growMinutes(cropId, nearWater) {
        const crop = FrCatalog.CROPS.find((c) => c.id === cropId);
        if (!crop)
            return Infinity;
        const base = crop.days * 1440;
        return nearWater ? base / FrBalance.WATER_GROWTH_FACTOR : base;
    }
    static stage(cropId, nearWater, plantedGameMinute, nowGameMinute) {
        const ratio = (nowGameMinute - plantedGameMinute) / FrCropRules.growMinutes(cropId, nearWater);
        if (ratio >= 1)
            return 3;
        return ratio >= 0.6 ? 2 : ratio >= 0.25 ? 1 : 0;
    }
    static harvest(random) {
        return { crop: random.between(2, 3), seed: random.between(1, 2) };
    }
}
class FrSnowRules {
    static regrown(dugDay, today) { return today - dugDay >= FrBalance.SNOW_REGROW_DAYS; }
}
class FrVillage {
    constructor() {
        this.built = new Map();
    }
    builtCount(id) { return this.built.get(id) || 0; }
    markBuilt(id) { this.built.set(id, this.builtCount(id) + 1); }
    unmarkBuilt(id) { if (this.builtCount(id) > 0)
        this.built.set(id, this.builtCount(id) - 1); }
    score() {
        return FrCatalog.CONSTRUCTIONS.reduce((sum, c) => sum + c.score * this.builtCount(c.id), 0);
    }
    level() {
        const wallsDone = this.builtCount("wall") >= 12;
        let level = 1;
        for (let l = 2; l <= 5; l++)
            if (this.score() >= FrBalance.VILLAGE_LEVEL_SCORE[l] && (l < 5 || wallsDone))
                level = l;
        return level;
    }
    canBuild(def, source) {
        return this.builtCount(def.id) < def.count && this.level() >= def.minVillageLevel && source.canPay(def.cost);
    }
    build(def, source) {
        if (!this.canBuild(def, source))
            return false;
        source.pay(def.cost);
        this.built.set(def.id, this.builtCount(def.id) + 1);
        return true;
    }
    static definition(id) {
        return FrCatalog.CONSTRUCTIONS.find((c) => c.id === id);
    }
}
class FrFishingRules {
    static biteSeconds(tier, random) {
        const [min, max] = FrBalance.ROD_BITE_SECONDS[tier];
        return min + random.next() * (max - min);
    }
    static beatsFor(item) {
        const grade = FrCatalog.FISH_LEGEND.indexOf(item) >= 0 ? "legend" : FrCatalog.FISH_RARE.indexOf(item) >= 0 ? "rare" : "common";
        return FrBalance.FISH_BEATS[grade];
    }
    static beatHit(offsetSeconds, tier) {
        return Math.abs(offsetSeconds) <= FrBalance.ROD_BEAT_TOLERANCE[tier];
    }
}
class FrMineRules {
    static stoneDrop(random) {
        return random.chance(FrBalance.STONE_COAL_CHANCE) ? { stone: 1, coal: 1 } : { stone: 1 };
    }
    static terrainStoneDrop(random) {
        const drop = { stone: 1 };
        if (random.chance(FrBalance.TERRAIN_STONE_COAL_CHANCE))
            drop.coal = 1;
        if (random.chance(FrBalance.TERRAIN_STONE_ORE_CHANCE))
            drop[random.chance(0.5) ? "copper" : "iron"] = 1;
        return drop;
    }
}
class FrDungeonRules {
    static weaponDamage(tier) { return FrBalance.WEAPON_DAMAGE[tier]; }
    static armorReduction(armor) {
        return Math.min(0.9, FrBalance.ARMOR_REDUCTION.helmet[armor.helmet] + FrBalance.ARMOR_REDUCTION.top[armor.top] +
            FrBalance.ARMOR_REDUCTION.bottom[armor.bottom] + FrBalance.ARMOR_REDUCTION.shoes[armor.shoes]);
    }
    static damageTaken(monsterAttack, reduction) {
        return Math.max(1, Math.round(monsterAttack * (1 - reduction)));
    }
    static hitsToKill(monsterHp, weaponTier) {
        return Math.ceil(monsterHp / FrDungeonRules.weaponDamage(weaponTier));
    }
    static inAttackArc(dx, dz, facingRadians) {
        const distance = Math.hypot(dx, dz);
        if (distance > FrBalance.ATTACK_RADIUS_METERS)
            return false;
        if (distance < 0.01)
            return true;
        let diff = Math.atan2(dx, dz) - facingRadians;
        while (diff > Math.PI)
            diff -= Math.PI * 2;
        while (diff < -Math.PI)
            diff += Math.PI * 2;
        return Math.abs(diff) <= (FrBalance.ATTACK_ARC_DEGREES / 2) * Math.PI / 180;
    }
    static estimateKills(difficulty, weaponTier) {
        const monster = FrCatalog.MONSTERS[difficulty][0];
        const perKill = FrDungeonRules.hitsToKill(monster.hp, weaponTier) * FrBalance.ATTACK_INTERVAL * 1.35 + 1.1;
        return Math.min(Math.floor(FrBalance.DUNGEON_SECONDS / perKill), Math.floor(FrBalance.DUNGEON_SECONDS / 1.2));
    }
}
