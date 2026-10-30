const F = require("./forest-load.js")();
const { FrBalance, FrCatalog, FrRandom, FrFruitRoll, FrSeedRoll, FrFishRoll, FrOreRoll, FrDungeonDrops, FrItems, FrBag, FrPublicStore, FrChestStore, FrPersonalCraftSource, FrVillageBuildSource, FrVillage, FrCraftRules, FrRingRules, FrDungeonRules, FrMineRules, FrMiniGameFactory, FrHoldRelease, FrMashGauge, FrCenterStop, FrShrinkRing, FrFishingRules } = F;

class SimConfig {
  static readonly = null;
}
SimConfig.SESSIONS = Number(process.argv[2] || 10);
SimConfig.DAYS_PER_SESSION = 11;
SimConfig.BOTS = 10;
SimConfig.DAY_SECONDS = 230;
SimConfig.SEED = Number(process.argv[3] || 20261030);
SimConfig.PERSONAS = ["gatherer", "gatherer", "fisher", "fisher", "miner", "miner", "miner", "fighter", "fighter", "builder"];
SimConfig.PERSONA_WEIGHTS = {
  gatherer: { fruit: 5, beach: 2, fish: 1, mine: 1, dungeon: 0, terrain: 0 },
  fisher: { fruit: 1, beach: 3, fish: 5, mine: 1, dungeon: 0, terrain: 0 },
  miner: { fruit: 1, beach: 0, fish: 0, mine: 6, dungeon: 0, terrain: 1 },
  fighter: { fruit: 0, beach: 0, fish: 0, mine: 2, dungeon: 4, terrain: 0 },
  builder: { fruit: 2, beach: 1, fish: 0, mine: 3, dungeon: 0, terrain: 3 },
};
SimConfig.WANTED_GEAR = {
  gatherer: ["axe", "basket", "shovel", "pickaxe", "weapon", "rod"],
  fisher: ["rod", "basket", "axe", "pickaxe", "weapon", "shovel"],
  miner: ["pickaxe", "weapon", "axe", "helmet", "top", "bottom", "shoes", "basket"],
  fighter: ["weapon", "pickaxe", "helmet", "top", "bottom", "shoes", "axe", "basket"],
  builder: ["pickaxe", "axe", "shovel", "weapon", "basket", "rod"],
};
SimConfig.DONATED = ["wood", "vine", "seaweed", "stone", "coal", "copper", "iron", "cloth", "plank", "rope", "brick", "magic_stone", "enhance_stone"];
SimConfig.PRIORITY = ["workbench", "forge", "bridge_east", "oven", "bridge_south", "bridge_shortcut", "bridge_shortcut", "stairs", "stairs", "stairs", "farm_expand", "farm_expand", "lamp", "lamp", "lamp", "lamp", "lamp", "lamp", "lamp", "lamp", "kitchen"]
  .concat(Array(12).fill("wall"), Array(4).fill("gate"), Array(4).fill("tower"));

class SkillTable {
  constructor(random) {
    this.random = random;
    this.cache = new Map();
  }
  pressInterval(rate) { return 1 / Math.max(2.5, rate + this.gauss() * 0.8); }
  gauss() { let s = 0; for (let i = 0; i < 6; i++) s += this.random.next(); return (s - 3) * 1.4142; }
  trial(task, tier) {
    const game = FrMiniGameFactory.create(task, tier);
    if (!game) return false;
    const dt = 0.02;
    if (game instanceof FrMashGauge) {
      game.press();
      let next = this.pressInterval(5);
      for (let t = 0; game.state === "running" && t < 4; t += dt) { game.tick(dt); next -= dt; if (next <= 0) { game.press(); next = this.pressInterval(5); } }
    } else if (game instanceof FrCenterStop) {
      game.press();
      const hits = game.hitsNeeded, period = game.period, noise = 0.08;
      let target = period * 0.25 + this.gauss() * noise;
      let done = 0;
      for (let t = 0; game.state === "running" && t < 9; t += dt) {
        game.tick(dt);
        if (t >= target) { game.press(); done++; target = period * (0.25 + 0.5 * done) + this.gauss() * noise; }
      }
    } else if (game instanceof FrShrinkRing) {
      game.press();
      const target = 1.2 + this.gauss() * 0.1;
      for (let t = 0; game.state === "running" && t < 4; t += dt) { game.tick(dt); if (t >= target) game.press(); }
    } else if (game instanceof FrHoldRelease) {
      game.press();
      const target = 0.8 + this.gauss() * 0.12;
      for (let t = 0; game.state === "running" && t < 4; t += dt) { game.tick(dt); if (t >= target) game.release(); }
    }
    return game.state === "success";
  }
  rate(task, tier) {
    const key = task + ":" + tier;
    if (!this.cache.has(key)) {
      if (!FrMiniGameFactory.create(task, tier)) { this.cache.set(key, 0); }
      else { let ok = 0; for (let i = 0; i < 400; i++) if (this.trial(task, tier)) ok++; this.cache.set(key, ok / 400); }
    }
    return this.cache.get(key);
  }
  fishBeatRate(tier, beats) {
    const tolerance = FrBalance.ROD_BEAT_TOLERANCE[tier];
    let ok = 0;
    for (let i = 0; i < 400; i++) { let all = true; for (let b = 0; b < beats; b++) if (!FrFishingRules.beatHit(this.gauss() * 0.1, tier)) all = false; if (all) ok++; }
    return ok / 400;
  }
}

class SimBot {
  constructor(index, persona, random) {
    this.index = index;
    this.persona = persona;
    this.random = random;
    this.bag = new FrBag();
    this.ringLevel = 0;
    this.hasRing = false;
    this.pity = { fruit: 0, seed: 0, fish: 0, ore: 0, dungeon: 0 };
    this.ap = FrBalance.BASE_ACTION_POINTS;
    this.timeLeft = 0;
    this.counts = { gears: 0, dungeons: 0, fish: 0, diamonds: 0, legends: 0 };
  }
  maxAp() { return Math.min(FrBalance.MAX_ACTION_POINTS_CAP, FrBalance.BASE_ACTION_POINTS + this.ringLevel * FrBalance.RING_ACTION_POINTS_PER_LEVEL); }
  tier(kind) { return this.bag.bestTier(kind); }
  armorTiers() { return { helmet: this.tier("helmet"), top: this.tier("top"), bottom: this.tier("bottom"), shoes: this.tier("shoes") }; }
  give(item, amount) {
    if (amount <= 0) return;
    this.bag.add(item, amount);
  }
}

class IslandSim {
  constructor(seed, label) {
    this.label = label;
    this.random = new FrRandom(seed);
    this.skills = new SkillTable(this.random);
    this.fruit = new FrFruitRoll(); this.seed = new FrSeedRoll(); this.fish = new FrFishRoll(); this.ore = new FrOreRoll();
    this.publicStore = new FrPublicStore();
    this.village = new FrVillage();
    this.bots = SimConfig.PERSONAS.slice(0, SimConfig.BOTS).map((p, i) => new SimBot(i, p, this.random));
    this.day = 0;
    this.milestones = {};
    this.stats = { diamonds: 0, rings: 0, dungeonRuns: 0, fish: 0 };
  }

  get workbench() { return this.village.builtCount("workbench") > 0; }
  get forge() { return this.village.builtCount("forge") > 0; }
  bridgeCount() { return ["bridge_east", "bridge_south"].reduce((s, id) => s + this.village.builtCount(id), 0) + this.village.builtCount("bridge_shortcut"); }

  run(sessions) {
    for (let s = 1; s <= sessions; s++) {
      for (let d = 0; d < SimConfig.DAYS_PER_SESSION; d++) {
        this.day++;
        this.playDay(s);
      }
    }
  }

  playDay(session) {
    this.bots.forEach((bot) => { bot.ap = bot.maxAp(); bot.timeLeft = SimConfig.DAY_SECONDS; this.playBot(bot); });
    this.bots.forEach((bot) => this.endOfDay(bot));
    this.convertIntermediates();
    this.tryBuild(session);
    this.markMilestones(session);
  }

  playBot(bot) {
    for (let guard = 0; guard < 40 && bot.timeLeft > 40; guard++) {
      const activity = this.chooseActivity(bot);
      if (!activity || !this[activity + "Visit"](bot)) break;
    }
  }

  chooseActivity(bot) {
    const weights = Object.assign({}, SimConfig.PERSONA_WEIGHTS[bot.persona]);
    const need = this.biggestRawNeed();
    if (need && this.random.chance(0.5)) return need;
    if (bot.ap >= 40 && weights.dungeon > 0 && this.random.chance(0.8)) return "dungeon";
    const entries = Object.keys(weights).filter((k) => weights[k] > 0 && (k !== "dungeon" || bot.ap >= 40));
    const total = entries.reduce((s, k) => s + weights[k], 0);
    let p = this.random.next() * total;
    for (const k of entries) { p -= weights[k]; if (p <= 0) return k; }
    return entries[0];
  }

  rawNeeds() {
    const needs = {};
    const add = (id, n) => { needs[id] = (needs[id] || 0) + n; };
    const next = this.nextTargets(3);
    next.forEach((def) => Object.keys(def.cost).forEach((id) => {
      const want = def.cost[id];
      if (id === "plank") add("wood", want * 2);
      else if (id === "brick") add("stone", want * 3);
      else if (id === "rope") add("seaweed", want * 3);
      else add(id, want);
    }));
    const raw = {};
    Object.keys(needs).forEach((id) => { const have = this.publicStore.count(id) + (id === "wood" ? this.publicStore.count("plank") * 2 : id === "stone" ? this.publicStore.count("brick") * 3 : id === "seaweed" ? this.publicStore.count("rope") * 3 : 0); raw[id] = needs[id] - have; });
    return raw;
  }

  biggestRawNeed() {
    const raw = this.rawNeeds();
    const map = { wood: "fruit", seaweed: "beach", stone: "mine", copper: "mine", iron: "mine", diamond: "mine", coal: "mine" };
    let best = null, amount = 0;
    Object.keys(raw).forEach((id) => { if (raw[id] > amount && map[id]) { best = map[id]; amount = raw[id]; } });
    return best;
  }

  nextTargets(count) {
    const taken = {};
    const list = [];
    for (const id of SimConfig.PRIORITY) {
      const def = FrVillage.definition(id);
      taken[id] = (taken[id] || 0) + 1;
      if (taken[id] <= this.village.builtCount(id)) continue;
      list.push(def);
      if (list.length >= count) break;
    }
    return list;
  }

  spend(bot, ap, seconds) {
    if (bot.ap < ap || bot.timeLeft < seconds) return false;
    bot.ap -= ap; bot.timeLeft -= seconds;
    return true;
  }

  basketExtra(bot) { return this.random.chance(FrBalance.BASKET_EXTRA_CHANCE[bot.tier("basket")]) ? 1 : 0; }

  fruitVisit(bot) {
    if (bot.timeLeft < 60 || bot.ap < 3) return false;
    bot.timeLeft -= 35;
    for (let i = 0; i < 12; i++) {
      if (this.random.chance(0.5)) {
        if (!this.spend(bot, 1, 6)) break;
        if (!this.random.chance(this.skills.rate("shake", 0))) continue;
        const r = this.fruit.roll(this.random, { tier: 0, basketTier: bot.tier("basket") }, bot.pity.fruit);
        bot.pity.fruit = r.miss;
        bot.give(r.item, 1 + this.basketExtra(bot));
        if (r.legend) bot.counts.legends++;
        if (this.random.chance(FrBalance.SEED_DROP_CHANCE)) { const s = this.seed.roll(this.random, {}, bot.pity.seed); bot.pity.seed = s.miss; bot.give(s.item, 1); }
        bot.bag.wear("basket");
      } else {
        const t = bot.tier("axe");
        if (!this.spend(bot, 3, 10)) break;
        if (!this.random.chance(this.skills.rate("chop", t))) continue;
        bot.give("wood", 2 + FrBalance.AXE_WOOD_BONUS[t]);
        bot.bag.wear("axe");
      }
    }
    return true;
  }

  beachVisit(bot) {
    if (bot.timeLeft < 60 || bot.ap < 3) return false;
    bot.timeLeft -= 40;
    const items = ["shell", "salt", "seaweed", "sand"];
    for (let i = 0; i < 8; i++) {
      if (!this.spend(bot, 1, 5)) break;
      if (!this.random.chance(this.skills.rate("gatherRing", 0))) continue;
      bot.give(this.random.pick(items), 1 + this.basketExtra(bot));
    }
    return true;
  }

  fishVisit(bot) {
    const t = bot.tier("rod");
    if (t === 0 || bot.timeLeft < 70 || bot.ap < 4) return false;
    bot.timeLeft -= 40;
    for (let i = 0; i < 8; i++) {
      if (!this.spend(bot, 2, 8 + 10 * 1)) break;
      const r = this.fish.roll(this.random, { tier: t }, bot.pity.fish);
      bot.pity.fish = r.miss;
      if (!this.random.chance(this.skills.fishBeatRate(t, FrFishingRules.beatsFor(r.item)))) continue;
      bot.give(r.item, 1);
      this.stats.fish++;
      if (r.legend) bot.counts.legends++;
      bot.bag.wear("rod");
    }
    return true;
  }

  mineVisit(bot) {
    if (bot.timeLeft < 60 || bot.ap < 3) return false;
    bot.timeLeft -= this.bridgeCount() > 0 && this.village.builtCount("bridge_east") > 0 ? 35 : 55;
    const t = bot.tier("pickaxe");
    let floor = 1;
    if (t >= 2 && this.random.chance(0.5)) floor = 2;
    if (t >= 3 && this.random.chance(0.5)) floor = 3;
    for (let i = 0; i < 30; i++) {
      if (this.random.chance(0.55)) {
        if (!this.spend(bot, 1, 6)) break;
        if (!this.random.chance(this.skills.rate("stone", t))) continue;
        const drop = FrMineRules.stoneDrop(this.random);
        Object.keys(drop).forEach((id) => bot.give(id, drop[id]));
        bot.bag.wear("pickaxe");
      } else {
        if (!this.spend(bot, 2, 8)) break;
        if (!this.random.chance(this.skills.rate("vein", t))) continue;
        const r = this.ore.roll(this.random, { tier: t, floor }, bot.pity.ore);
        bot.pity.ore = r.miss;
        bot.give(r.item, 1 + (r.item === "stone" ? 0 : this.basketExtra(bot) * 0));
        if (r.item === "diamond") { bot.counts.diamonds++; this.stats.diamonds++; }
        bot.bag.wear("pickaxe");
      }
    }
    return true;
  }

  terrainVisit(bot) {
    if (bot.timeLeft < 20 || bot.ap < 5) return false;
    const t = bot.tier("pickaxe");
    for (let i = 0; i < 12; i++) {
      if (!this.spend(bot, 1, 6)) break;
      if (!this.random.chance(this.skills.rate("stone", t))) continue;
      const drop = FrMineRules.terrainStoneDrop(this.random);
      Object.keys(drop).forEach((id) => bot.give(id, drop[id]));
      bot.bag.wear("pickaxe");
    }
    return true;
  }

  dungeonVisit(bot) {
    if (bot.ap < FrBalance.DUNGEON_ENTRY_COST || bot.timeLeft < 100) return false;
    const w = bot.tier("weapon");
    const difficulty = w >= 3 ? "hell" : w >= 2 ? "hard" : "normal";
    this.spend(bot, FrBalance.DUNGEON_ENTRY_COST, 100);
    this.stats.dungeonRuns++;
    bot.counts.dungeons++;
    const kills = Math.max(0, Math.round(FrDungeonRules.estimateKills(difficulty, w) * (0.8 + this.random.next() * 0.4)));
    for (let k = 0; k < kills; k++) {
      const drop = FrDungeonDrops.roll(this.random, difficulty, bot.pity.dungeon);
      bot.pity.dungeon = drop.gotLegend ? 0 : bot.pity.dungeon + 1;
      Object.keys(drop.items).forEach((id) => {
        if (id === "ring") { bot.hasRing = true; this.stats.rings++; bot.counts.legends++; return; }
        if (id === "diamond") { bot.counts.diamonds++; this.stats.diamonds++; bot.counts.legends++; }
        bot.give(id, drop.items[id]);
      });
      bot.bag.wear("weapon");
    }
    return true;
  }

  endOfDay(bot) {
    this.upgradeGear(bot);
    this.enhanceRing(bot);
    this.donate(bot);
  }

  nextWantedGear(bot) {
    const kinds = SimConfig.WANTED_GEAR[bot.persona];
    const ladder = [];
    kinds.slice(0, 2).forEach((kind) => [1, 2, 3].forEach((tier) => ladder.push({ kind, tier })));
    kinds.slice(2).forEach((kind) => ladder.push({ kind, tier: 1 }));
    kinds.slice(2).forEach((kind) => [2, 3].forEach((tier) => ladder.push({ kind, tier })));
    for (const want of ladder) {
      if (bot.tier(want.kind) >= want.tier) continue;
      if (want.tier === 1 && !this.workbench) continue;
      if (want.tier >= 2 && !this.forge) continue;
      return want;
    }
    return null;
  }

  upgradeGear(bot) {
    for (let guard = 0; guard < 4; guard++) {
      const want = this.nextWantedGear(bot);
      if (!want) return;
      const source = new FrPersonalCraftSource(new FrChestStore(), bot.bag, new FrPublicStore());
      if (!FrCraftRules.craftGear(want.kind, want.tier, source, bot.bag)) return;
      bot.counts.gears++;
      if (want.tier === 3 && !this.milestones.firstDiamondGear) this.milestones.firstDiamondGear = this.day;
    }
  }

  enhanceRing(bot) {
    if (!bot.hasRing || !this.forge) return;
    for (let guard = 0; guard < 6 && bot.ringLevel < FrBalance.RING_MAX_LEVEL; guard++) {
      const cost = FrRingRules.cost(bot.ringLevel + 1);
      if (bot.bag.count("enhance_stone") < cost.enhance || bot.bag.count("magic_stone") < cost.magic) return;
      bot.bag.take("enhance_stone", cost.enhance); bot.bag.take("magic_stone", cost.magic);
      bot.ringLevel = FrRingRules.attempt(bot.ringLevel, this.random).level;
    }
  }

  donate(bot) {
    const want = this.nextWantedGear(bot);
    const keep = {};
    if (want) keep[FrItems.TIER_MATERIAL[want.tier]] = FrBalance.GEAR_MATERIAL_COUNT;
    if (bot.hasRing) { keep.enhance_stone = 12; keep.magic_stone = 12; }
    FrCatalog.MATERIALS.forEach((m) => {
      const have = bot.bag.count(m.id);
      const give = have - (keep[m.id] || 0);
      if (give <= 0 || SimConfig.DONATED.indexOf(m.id) < 0) return;
      if (this.publicStore.put(m.id, give, "bot" + bot.index, this.day)) bot.bag.take(m.id, give);
    });
  }

  convertIntermediates() {
    if (!this.workbench) return;
    const store = this.publicStore;
    const needs = {};
    this.nextTargets(6).forEach((def) => Object.keys(def.cost).forEach((id) => { needs[id] = (needs[id] || 0) + def.cost[id]; }));
    const make = (product, raw, perRaw, rawPerProduct) => {
      const deficit = (needs[product] || 0) - store.count(product);
      for (let i = 0; i < deficit; i++) {
        if (store.count(raw) < rawPerProduct) break;
        store.take(raw, rawPerProduct);
        store.put(product, 1, "craft", this.day);
      }
    };
    make("plank", "wood", 1, 2);
    make("brick", "stone", 1, 3);
    const ropeDeficit = (needs.rope || 0) - store.count("rope");
    for (let i = 0; i < ropeDeficit; i++) {
      if (store.count("seaweed") >= 3) store.take("seaweed", 3);
      else if (store.count("vine") >= 2) store.take("vine", 2);
      else if (store.count("cloth") >= 1) store.take("cloth", 1);
      else break;
      store.put("rope", 1, "craft", this.day);
    }
  }

  tryBuild(session) {
    const source = new FrVillageBuildSource(this.publicStore);
    for (let guard = 0; guard < 60; guard++) {
      let built = false;
      const taken = {};
      for (const id of SimConfig.PRIORITY) {
        const def = FrVillage.definition(id);
        taken[id] = (taken[id] || 0) + 1;
        if (taken[id] <= this.village.builtCount(id)) continue;
        if (this.village.build(def, source)) { this.record(id, session); built = true; }
        break;
      }
      if (!built) break;
    }
  }

  record(id, session) {
    this.milestones.sessions = this.milestones.sessions || {};
    this.milestones.sessions[id + "#" + this.village.builtCount(id)] = this.day;
  }

  markMilestones() {
    const m = this.milestones;
    const sessionOf = (day) => Math.ceil(day / SimConfig.DAYS_PER_SESSION);
    if (!m.bridges4 && this.bridgeCount() >= 4) m.bridges4 = this.day;
    if (!m.walls12 && this.village.builtCount("wall") >= 12) m.walls12 = this.day;
    if (!m.level5 && this.village.level() >= 5) m.level5 = this.day;
    if (!m.workbench && this.workbench) m.workbench = this.day;
    if (!m.forge && this.forge) m.forge = this.day;
    if (!m.firstRing && this.bots.some((b) => b.hasRing)) m.firstRing = this.day;
    if (!m.firstDiamond && this.stats.diamonds > 0) m.firstDiamond = this.day;
    if (!m.firstIronGear && this.bots.some((b) => FrItems.GEAR_KINDS.some((k) => b.tier(k) >= 2))) m.firstIronGear = this.day;
    this.sessionOf = sessionOf;
  }

  report() {
    const s = (day) => day ? Math.ceil(day / SimConfig.DAYS_PER_SESSION) + "번째 수업 (" + day + "일째)" : "—";
    const m = this.milestones;
    const tiers = [0, 0, 0, 0];
    this.bots.forEach((b) => FrItems.GEAR_KINDS.forEach((k) => tiers[b.tier(k)]++));
    return [
      "=== " + this.label + " ===",
      "작업대 " + s(m.workbench) + " · 대장간 " + s(m.forge),
      "다리 4곳 " + s(m.bridges4) + "  (목표 2~4번째)",
      "성벽 12개 " + s(m.walls12) + "  (목표 8~10번째)",
      "마을 5단계 " + s(m.level5),
      "첫 철 장비 " + s(m.firstIronGear) + " · 첫 다이아몬드 획득 " + s(m.firstDiamond),
      "첫 다이아몬드 장비 " + s(m.firstDiamondGear) + "  (목표 4~6번째)",
      "첫 반지 " + s(m.firstRing) + " · 반지 단계 " + this.bots.map((b) => b.ringLevel).join(","),
      "장비 등급 분포(없음/나무/철/다이아) " + tiers.join("/") + " · 전체 다이아몬드 " + this.stats.diamonds + " · 던전 " + this.stats.dungeonRuns + "번 · 낚은 물고기 " + this.stats.fish,
      "마을 점수 " + this.village.score() + " · 공용 창고 칸 " + this.publicStore.slotsUsed() + "/180",
    ].join("\n");
  }
}

const sessions = SimConfig.SESSIONS;
const islands = [new IslandSim(SimConfig.SEED, "섬 1"), new IslandSim(SimConfig.SEED + 7919, "섬 2"), new IslandSim(SimConfig.SEED + 15838, "섬 3")];
islands.forEach((island) => island.run(sessions));
console.log("봇 " + SimConfig.BOTS + "명 × 섬 2개 × 수업 " + sessions + "번 (수업 1번 = 게임 " + SimConfig.DAYS_PER_SESSION + "일, 씨앗 " + SimConfig.SEED + ")");
islands.forEach((island) => console.log(island.report() + "\n"));
