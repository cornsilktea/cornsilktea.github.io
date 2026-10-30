const F = require("./forest-load.js")();
const { FrBalance, FrCatalog, FrRandom, FrFruitRoll, FrFishRoll, FrOreRoll, FrDungeonDrops, FrBag, FrPublicStore, FrChestStore, FrPersonalCraftSource, FrVillageBuildSource, FrActionPoints, FrRecipeRules, FrCraftRules, FrRingRules, FrCropRules, FrSnowRules, FrVillage, FrDungeonRules, FrClock, FrSleepVote, FrMashGauge, FrCenterStop, FrShrinkRing, FrHoldRelease, FrMiniGameFactory, FrFoodRules, FrTerrainData, FrWorld, FrLocalBackend, FrBlockStore, FrBlockRules, FrHouseKit, FrBlockKey } = F;
const terrainFile = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "assets/forest/island-terrain.json"), "utf8"));

let passed = 0;
const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const recipe = (id) => FrCatalog.RECIPES.find((x) => x.id === id);
const sourceOf = (bag, pub = new FrPublicStore(), chest = new FrChestStore()) => new FrPersonalCraftSource(chest, bag, pub);

{
  const mats = FrCatalog.MATERIALS;
  const ids = new Set(mats.map((m) => m.id));
  check("재화 id 중복 없음", ids.size === mats.length, mats.length - ids.size);
  check("레시피 27종", FrCatalog.RECIPES.length === 27, FrCatalog.RECIPES.length);
  const stars = [1, 2, 3, 4, 5].map((s) => FrCatalog.RECIPES.filter((r) => r.star === s).length).join();
  check("별 등급별 개수 5·6·7·5·4", stars === "5,6,7,5,4", stars);
  check("레시피 재료가 모두 존재", FrCatalog.RECIPES.every((r) => r.ingredients.every((i) => i.group || ids.has(i.item) || FrCatalog.RECIPES.some((x) => x.id === i.item))));
  check("물고기 13종", FrCatalog.FISH_COMMON.length + FrCatalog.FISH_RARE.length + FrCatalog.FISH_LEGEND.length === 13);
  check("작물 12종·씨앗 12종", FrCatalog.CROPS.length === 12 && FrCatalog.CROPS.every((c) => ids.has(c.id + "_seed")));
  check("건설 13종류", FrCatalog.CONSTRUCTIONS.length === 13);
  check("성벽 12·성문 4·망루 4·가로등 8", [["wall", 12], ["gate", 4], ["tower", 4], ["lamp", 8]].every(([id, n]) => FrVillage.definition(id).count === n));
}

{
  const sum = (table) => table.reduce((s, w) => s + w.weight, 0);
  const fruit = new FrFruitRoll(), fish = new FrFishRoll(), ore = new FrOreRoll();
  [0, 1, 2, 3].forEach((b) => check("과일 확률 합 1 (바구니 " + b + ")", near(sum(fruit.table({ basketTier: b })), 1, 1e-9)));
  [1, 2, 3].forEach((t) => check("낚시 확률 합 1 (낚싯대 " + t + ")", near(sum(fish.table({ tier: t })), 1, 1e-9)));
  [0, 1, 2, 3].forEach((t) => [1, 2, 3].forEach((f) => check("광맥 확률 합 1 (곡괭이 " + t + ", " + f + "층)", near(sum(ore.table({ tier: t, floor: f })), 1, 1e-9))));
  const diamondOf = (t, f) => ore.table({ tier: t, floor: f }).find((w) => w.item === "diamond").weight;
  check("다이아몬드 2층 ×1.5·3층 ×2", near(diamondOf(3, 2), 0.135) && near(diamondOf(3, 3), 0.18), [diamondOf(3, 2), diamondOf(3, 3)]);
  check("기본 0%(맨손) 다이아몬드는 보정해도 안 나옴", (() => { const r = new FrRandom(1); for (let i = 0; i < 3000; i++) if (ore.roll(r, { tier: 0, floor: 1 }, 500).item === "diamond") return false; return true; })());
  check("다이아몬드 바구니: 황금 사과 ×2", near(fruit.table({ basketTier: 3 }).find((w) => w.legend).weight, 0.06));
}

{
  const fish = new FrFishRoll();
  const averageGap = (tier, seed) => {
    const random = new FrRandom(seed);
    let miss = 0, gap = 0;
    const gaps = [];
    for (let i = 0; i < 200000; i++) {
      const r = fish.roll(random, { tier }, miss);
      miss = r.miss; gap++;
      if (r.legend) { gaps.push(gap); gap = 0; }
    }
    return gaps.reduce((a, b) => a + b, 0) / gaps.length;
  };
  check("전설을 얻으면 미스 0 으로", (() => { const x = fish.roll(new FrRandom(3), { tier: 3 }, 1000); return x.legend && x.miss === 0; })());
  const wood = averageGap(1, 7), iron = averageGap(2, 8), diamond = averageGap(3, 9);
  check("전설 평균 간격: 나무 낚싯대 15~30번", wood >= 15 && wood <= 30, wood);
  check("전설 평균 간격: 철 낚싯대 8~20번", iron >= 8 && iron <= 20, iron);
  check("전설 평균 간격: 다이아몬드 낚싯대 4~12번", diamond >= 4 && diamond <= 12, diamond);
  check("전설 보정 한 번에 +0.2%p", near(FrBalance.PITY_STEP, 0.002));
}

{
  check("행동력 기본 최대 100", new FrActionPoints(0).max() === 100);
  check("반지 +10 이면 최대 200", new FrActionPoints(10).max() === 200);
  check("모자라면 못 씀", (() => { const a = new FrActionPoints(0, 2); return !a.spend(3) && a.current === 2 && a.spend(2) && a.current === 0; })());
  check("채우기는 최대치까지", (() => { const a = new FrActionPoints(2, 10); a.restore(500); return a.current === 120; })());
  check("반지 단계 오르면 최대치만 오름", (() => { const a = new FrActionPoints(0, 50); a.ringLevel = 3; return a.max() === 130 && a.current === 50; })());
}

{
  check("가방 한 칸 30개", (() => { const b = new FrBag(); return b.add("wood", 45) === 0 && b.slots.length === 2 && b.slots[0].count === 30; })());
  check("가방 40칸 한도", (() => { const b = new FrBag(); return b.add("stone", 40 * 30 + 5) === 5 && b.slots.length === 40; })());
  check("장비는 한 칸 1개", (() => { const b = new FrBag(); b.add("gear_axe_1", 2); return b.slots.length === 2; })());
  check("가방 꺼내기", (() => { const b = new FrBag(); b.add("iron", 35); b.take("iron", 32); return b.count("iron") === 3 && b.slots.length === 1; })());
  check("공용 창고 칸 수는 올림", (() => { const s = new FrPublicStore(); return s.put("wood", 31, "a", 1) && s.slotsUsed() === 2; })());
  check("공용 창고 180칸 한도", (() => { const s = new FrPublicStore(); for (let i = 0; i < 6; i++) s.put("m" + i, 900, "a", 1); return s.slotsUsed() === 180 && !s.put("extra", 1, "a", 1); })());
  check("공용 창고에 장비·반지는 못 넣음", (() => { const s = new FrPublicStore(); return !s.put("gear_axe_1", 1, "a", 1) && !s.put("ring", 1, "a", 1); })());
  check("공용 창고 기록은 최근 100줄", (() => { const s = new FrPublicStore(); for (let i = 0; i < 130; i++) s.put("wood", 1, "n" + i, i); return s.log.length === 100 && s.log[0].who === "n129"; })());
  check("공용 창고 꺼내기 부족하면 거절", (() => { const s = new FrPublicStore(); s.put("wood", 31, "a", 1); return !s.takeBy("wood", 99, "a", 2, "take") && s.count("wood") === 31; })());
}

{
  const chest = new FrChestStore(), bag = new FrBag(), pub = new FrPublicStore();
  chest.put("iron", 2); bag.add("iron", 10); pub.put("iron", 5, "t", 0);
  const personal = sourceOf(bag, pub, chest);
  check("개인 제작 합계는 세 곳을 더함", personal.total("iron") === 17);
  check("개인 제작 순서: 개인 창고 → 가방 → 공용", (() => { personal.pay({ iron: 15 }); return chest.count("iron") === 0 && bag.count("iron") === 0 && pub.count("iron") === 2; })());
  check("마을 건설은 공용 창고만 셈", (() => { const v = new FrVillageBuildSource(pub); return !v.canPay({ iron: 3 }) && v.canPay({ iron: 2 }); })());
  check("공용 5 + 가방 10 = 철 15 장비 가능", (() => { const b = new FrBag(); b.add("iron", 10); const p = new FrPublicStore(); p.put("iron", 5, "t", 0); const s = sourceOf(b, p); return s.total("iron") === 15 && s.pay({ iron: 15 }) && b.count("iron") === 0 && p.count("iron") === 0; })());
}

{
  check("나무 도끼는 목재 3", (() => { const b = new FrBag(); b.add("wood", 20); return FrCraftRules.craftGear("axe", 1, sourceOf(b), b) && b.count("wood") === 17 && b.bestTier("axe") === 1; })());
  check("재료 모자라면 제작 실패", (() => { const b = new FrBag(); b.add("iron", 2); return !FrCraftRules.craftGear("pickaxe", 2, sourceOf(b), b); })());
  check("도구 100번 쓰면 없어짐", (() => { const b = new FrBag(); b.add("gear_pickaxe_1", 1); let broke = null; for (let i = 0; i < 100; i++) broke = b.wear("pickaxe") || broke; return broke === "gear_pickaxe_1" && b.bestTier("pickaxe") === 0; })());
  check("무기 200번", (() => { const b = new FrBag(); b.add("gear_weapon_3", 1); for (let i = 0; i < 199; i++) b.wear("weapon"); const alive = b.bestTier("weapon") === 3; b.wear("weapon"); return alive && b.bestTier("weapon") === 0; })());
  check("높은 등급 도구부터 닳음", (() => { const b = new FrBag(); b.add("gear_axe_1", 1); b.add("gear_axe_3", 1); b.wear("axe"); return b.slots.find((s) => s.id === "gear_axe_3").uses === 99 && b.slots.find((s) => s.id === "gear_axe_1").uses === 100; })());
}

{
  check("요리: 일반 물고기 아무거나", (() => { const b = new FrBag(); b.add("potato", 1); b.add("sardine", 1); b.add("salt", 1); return FrRecipeRules.cook(recipe("fish_set"), sourceOf(b), b).ok && b.count("fish_set") === 1 && b.count("sardine") === 0; })());
  check("요리: 재료 모자라면 missing 3", (() => { const b = new FrBag(); return FrRecipeRules.cook(recipe("fish_set"), sourceOf(b), b).missing.length === 3; })());
  check("요리: 과일은 일반부터 소모", (() => { const b = new FrBag(); b.add("apple", 2); b.add("mango", 1); FrRecipeRules.cook(recipe("fruit_skewer"), sourceOf(b), b); return b.count("apple") === 0 && b.count("mango") === 1; })());
  check("별 1 레시피는 처음부터 열림", FrCatalog.RECIPES.filter((x) => x.star === 1).every((x) => FrRecipeRules.unlocked(x, new Set())));
  check("재료를 얻으면 레시피가 열림", FrRecipeRules.unlocked(recipe("bread"), new Set(["wheat"])) && !FrRecipeRules.unlocked(recipe("bread"), new Set()));
  check("별 5 회복: 섬 50·던전 100", FrFoodRules.islandGain(5) === 50 && FrFoodRules.dungeonGain(5) === 100);
}

{
  const rates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => FrRingRules.successRate(n)).join();
  check("반지 성공률 표", rates === "0.8,0.8,0.8,0.4,0.4,0.4,0.2,0.2,0.1,0.05", rates);
  check("반지 +10 까지 오를 수 있고 내려가지 않음", (() => { const r = new FrRandom(11); let level = 0, tries = 0; while (level < 10 && tries < 100000) { const x = FrRingRules.attempt(level, r); if (x.level < level) return false; level = x.level; tries++; } return level === 10; })());
  check("반지 녹이면 강화석 3", FrRingRules.melt().enhance_stone === 3);
  check("+10 이후엔 못 올림", !FrRingRules.attempt(10, new FrRandom(1)).success);
}

{
  check("감자 1일 = 1440분", FrCropRules.growMinutes("potato", false) === 1440);
  check("물가 1.7배 빠름(수박 약 7분)", near(FrCropRules.growMinutes("watermelon", true) / 360, 7.06, 0.05));
  check("작물 단계 0→3", [0, 400, 900, 1440].map((m) => FrCropRules.stage("potato", false, 0, m)).join() === "0,1,2,3");
  check("눈은 3일 뒤 다시 생김", !FrSnowRules.regrown(5, 7) && FrSnowRules.regrown(5, 8));
}

{
  const pub = new FrPublicStore();
  const source = new FrVillageBuildSource(pub);
  const v = new FrVillage();
  check("재료 없으면 못 지음", !v.canBuild(FrVillage.definition("workbench"), source));
  pub.put("wood", 10, "t", 0);
  check("작업대: 재료 차감·점수 3", v.build(FrVillage.definition("workbench"), source) && pub.count("wood") === 0 && v.score() === 3);
  check("작업대는 한 번만", !v.canBuild(FrVillage.definition("workbench"), source));
  pub.put("brick", 30, "t", 0); pub.put("iron", 10, "t", 0); pub.put("plank", 20, "t", 0);
  check("섬 부엌은 마을 3단계부터", !v.canBuild(FrVillage.definition("kitchen"), source) && v.level() === 1);
  const rich = new FrPublicStore();
  ["wood", "stone", "brick", "iron", "copper", "plank", "rope"].forEach((m) => rich.put(m, 600, "t", 0));
  const big = new FrVillage(), richSource = new FrVillageBuildSource(rich);
  FrCatalog.CONSTRUCTIONS.forEach((c) => { for (let i = 0; i < c.count; i++) if (c.id !== "kitchen") big.build(c, richSource); });
  check("부엌 빼고 다 지어도 성벽이 모두 있어야 5단계", big.level() >= 4 && big.builtCount("wall") <= 12);
  big.build(FrVillage.definition("kitchen"), richSource);
  check("재료 충분하면 전부 지어 5단계", big.level() === 5, [big.score(), big.level(), big.builtCount("wall")]);
}

{
  check("공격력 맨손 10·다이아몬드 40", FrDungeonRules.weaponDamage(0) === 10 && FrDungeonRules.weaponDamage(3) === 40);
  const full = { helmet: 3, top: 3, bottom: 3, shoes: 3 };
  check("다이아몬드 방어구 전체 48%", near(FrDungeonRules.armorReduction(full), 0.48));
  check("받는 피해 = 공격 × (1 − 감소)", FrDungeonRules.damageTaken(24, 0.48) === 12);
  check("졸개 체력 30: 맨손 3번·다이아몬드 1번", FrDungeonRules.hitsToKill(30, 0) === 3 && FrDungeonRules.hitsToKill(30, 3) === 1);
  check("부채꼴: 앞 2m 안은 맞고 뒤·3m 밖은 안 맞음", FrDungeonRules.inAttackArc(0, 2, 0) && !FrDungeonRules.inAttackArc(0, -1, 0) && !FrDungeonRules.inAttackArc(0, 3, 0));
  check("부채꼴: 60° 안·밖", FrDungeonRules.inAttackArc(Math.sin(0.9) * 2, Math.cos(0.9) * 2, 0) && !FrDungeonRules.inAttackArc(Math.sin(1.2) * 2, Math.cos(1.2) * 2, 0));
  const kills = (t) => FrDungeonRules.estimateKills("normal", t);
  check("노말 40초 맨손 약 10마리", kills(0) >= 8 && kills(0) <= 14, kills(0));
  check("노말 40초 다이아몬드 약 25마리", kills(3) >= 20 && kills(3) <= 30, kills(3));
  check("헬에서 반지·다이아몬드가 나옴", (() => { const r = new FrRandom(9); let ring = 0, dia = 0, miss = 0; for (let i = 0; i < 20000; i++) { const d = FrDungeonDrops.roll(r, "hell", miss); miss = d.gotLegend ? 0 : miss + 1; ring += d.items.ring || 0; dia += d.items.diamond || 0; } return ring > 0 && dia > 0; })());
  check("노말에는 반지 없음", (() => { const r = new FrRandom(2); for (let i = 0; i < 5000; i++) if (FrDungeonDrops.roll(r, "normal", 0).items.ring) return false; return true; })());
}

{
  const state = { day: 1, dawnAt: 1000000, lastSeen: 1000000, frozen: false };
  const at = (sec) => 1000000 + sec * 1000;
  const label = (s, sec) => FrClock.label(FrClock.minuteOfDay(s, at(sec)));
  check("시계 시작은 06:00", label(state, 0) === "06:00");
  check("10초 = 게임 1시간", label(state, 10) === "07:00");
  check("2분 뒤 18:00 밤", label(state, 120) === "18:00" && FrClock.isNight(FrClock.minuteOfDay(state, at(120))));
  check("4분 뒤 06:00 다음 날", label(state, 240) === "06:00" && FrClock.dayNumber(state, at(240)) === 2);
  check("정오 가장 밝고 자정은 어두움", FrClock.sunLevel(720) === 1 && FrClock.sunLevel(0) < 0.5);
  check("수업 사이 10분 넘으면 다음 날 06:00", (() => { const s = FrClock.startOfClass(state, at(660)); return s.dawnAt === at(660) && s.day === FrClock.dayNumber(state, state.lastSeen) + 1; })());
  check("10분 안이면 시계 이어짐", FrClock.startOfClass({ ...state, lastSeen: at(100) }, at(400)).dawnAt === state.dawnAt);
  check("모두 잠들면 다음 날 06:00", (() => { const s = FrClock.skipToMorning(state, at(150)); return s.day === 2 && label(s, 150) === "06:00"; })());
  const P = (name, area, sleeping, acted = true) => ({ uid: name, name, area, sleeping, actedToday: acted });
  check("모두 잠들면 true", FrSleepVote.allAsleep([P("a", "island", true), P("b", "beach", true)]));
  check("지역 안 학생이 있으면 안 넘어감", !FrSleepVote.allAsleep([P("a", "island", true), P("b", "mine", false)]));
  check("그날 조작 안 한 학생은 세지 않음", FrSleepVote.allAsleep([P("a", "island", true), P("b", "island", false, false)]));
  check("아무도 없으면 안 넘어감", !FrSleepVote.allAsleep([]));
  const banner = FrSleepVote.banner([P("가", "island", true), P("나", "mine", false), P("다", "fruit", false)]);
  check("잠 띠 글자", banner === "잠든 사람 1 / 3 · 아직: 나(광산), 다(과일 숲)", banner);
  check("광산·과일 숲·던전에서는 못 잠, 섬·해변은 밤에만", !FrSleepVote.canSleep(1200, "mine") && !FrSleepVote.canSleep(1200, "dungeon") && !FrSleepVote.canSleep(1200, "fruit") && FrSleepVote.canSleep(1200, "island") && FrSleepVote.canSleep(1200, "beach") && !FrSleepVote.canSleep(700, "island"));
  check("아침 행동력: 다 잠 → 최대, 일부 → +50", FrSleepVote.morningActionPoints(true, true, 3, 130) === 130 && FrSleepVote.morningActionPoints(true, false, 100, 130) === 130 && FrSleepVote.morningActionPoints(true, false, 10, 130) === 60 && FrSleepVote.morningActionPoints(false, false, 10, 130) === 10);
}

{
  check("연타: 초당 5번으로 12번 3초 안에 성공", (() => { const g = new FrMashGauge(12); for (let i = 0; i < 60; i++) { g.tick(0.05); if (i % 4 === 0) g.press(); } return g.state === "success"; })());
  check("연타: 안 누르면 3초 뒤 실패", (() => { const g = new FrMashGauge(12); g.press(); for (let i = 0; i < 70; i++) g.tick(0.05); return g.state === "fail"; })());
  check("연타: 가만히 있으면 줄어듦", (() => { const g = new FrMashGauge(12); g.press(); g.press(); const before = g.progress(); g.tick(1); return g.progress() < before; })());
  check("가운데 맞추기: 가운데에서 성공", (() => { const g = new FrCenterStop(0.2, 1, 1.4); g.press(); g.tick(0.35); g.press(); return g.state === "success"; })());
  check("가운데 맞추기: 끝에서 실패", (() => { const g = new FrCenterStop(0.2, 1, 1.4); g.press(); g.tick(0.01); g.press(); return g.state === "fail"; })());
  check("가운데 맞추기: 2번 연달아", (() => { const g = new FrCenterStop(0.3, 2, 1.4); g.press(); g.tick(0.35); g.press(); const first = g.state; g.tick(0.7); g.press(); return first === "running" && g.state === "success"; })());
  check("줄어드는 원: 고리에 겹칠 때 성공", (() => { const g = new FrShrinkRing(0.12, 1.2, 0.35); g.press(); g.tick(1.2); g.press(); return g.state === "success"; })());
  check("줄어드는 원: 지나치면 저절로 실패", (() => { const g = new FrShrinkRing(0.12); g.press(); g.tick(1.2); g.tick(0.5); return g.state === "fail"; })());
  check("꾹 눌러 떼기: 초록 칸에서 떼면 성공", (() => { const g = new FrHoldRelease(0.25); g.press(); g.tick(0.8); g.release(); return g.state === "success"; })());
  check("꾹 눌러 떼기: 일찍 떼면 실패", (() => { const g = new FrHoldRelease(0.25); g.press(); g.tick(0.2); g.release(); return g.state === "fail"; })());
  check("도끼 등급별 맞출 횟수 4→1", FrMiniGameFactory.create("chop", 0).hitsNeeded === 4 && FrMiniGameFactory.create("chop", 3).hitsNeeded === 1);
  check("삽·곡괭이 없으면 못 하는 작업", FrMiniGameFactory.create("dig", 0) === null && FrMiniGameFactory.create("snow", 0) === null && FrMiniGameFactory.create("hardRock", 1) === null && FrMiniGameFactory.create("hardRock", 2) !== null);
}


{
  const makeWorld = () => new FrWorld("t", new FrTerrainData(terrainFile), new FrLocalBackend(false));
  const world = makeWorld();
  const t = world.terrain;
  const me = { uid: "u1", no: 20101, admin: false }, other = { uid: "u2", no: 20102, admin: false }, admin = { uid: "a", no: 1, admin: true };
  let free = null;
  for (let z = 30; z < 55 && !free; z++) for (let x = 30; x < 55 && !free; x++) {
    const ok = t.top(x, z) === "G" && !t.isShielded(x, z) && !world.blocked(x, z) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => t.top(x + dx, z + dz) === "G" && !t.isShielded(x + dx, z + dz) && !world.blocked(x + dx, z + dz)) && FrBlockRules.lotIndexAt(world, x, z) < 0;
    if (ok) free = [x, z];
  }
  const [fx, fz] = free;
  const idx = t.index(fx, fz);
  check("블록 저장소: 놓고 높이 세고 치움", (() => { const s = new FrBlockStore(); s.set(5, 0, { t: "block_wood", n: 1, r: 0 }); s.set(5, 1, { t: "block_wood", n: 1, r: 0 }); const top = s.top(5); s.set(5, 1, null); return top === 2 && s.top(5) === 1 && s.total() === 1; })());
  check("블록 키 읽기", FrBlockKey.parse(FrBlockKey.key(1234, 3)).index === 1234 && FrBlockKey.parse("77_5").y === 5);
  check("빈터 맨 아래 칸에는 놓을 수 있음", FrBlockRules.check(world, fx, fz, 0, me, []).ok);
  check("받쳐 주는 블록 없이 높이 1 은 못 놓음", !FrBlockRules.check(world, fx, fz, 1, me, []).ok);
  world.blocks.set(idx, 0, { t: "block_wood", n: me.no, r: 0 });
  check("아래에 블록이 있으면 위에 놓을 수 있음", FrBlockRules.check(world, fx, fz, 1, me, []).ok && FrBlockRules.allowedLevels(world, fx, fz).join() === "1");
  check("옆 블록에 붙은 높이는 놓을 수 있음", (() => { world.blocks.set(t.index(fx + 1, fz), 0, { t: "block_wood", n: me.no, r: 0 }); world.blocks.set(t.index(fx + 1, fz), 1, { t: "block_wood", n: me.no, r: 0 }); return FrBlockRules.allowedLevels(world, fx, fz).indexOf(1) >= 0; })());
  check("8칸까지만 쌓음", (() => { const w = makeWorld(); for (let y = 0; y < 8; y++) w.blocks.set(idx, y, { t: "block_wood", n: 1, r: 0 }); return !FrBlockRules.check(w, fx, fz, 8, me, []).ok; })());
  check("물·광장·창고 앞·길에는 못 놓음", (() => { const w = makeWorld(); const wc = (() => { for (let x = 0; x < w.terrain.w; x++) if (w.terrain.top(x, 60) === "R") return x; return -1; })(); const plaza = w.terrain.anchors.plaza; return !FrBlockRules.check(w, wc, 60, 0, me, []).ok && !FrBlockRules.check(w, plaza.x + 2, plaza.z, 0, me, []).ok && !FrBlockRules.check(w, w.terrain.anchors.publicChest.x, w.terrain.anchors.publicChest.z + 3, 0, me, []).ok; })());
  check("나무 자리·사람 몸 위에는 못 놓음", (() => { const w = makeWorld(); const spot = Array.from(w.trees.values())[0]; return !FrBlockRules.check(w, spot.x, spot.z, 0, me, []).ok && !FrBlockRules.check(w, fx, fz, 1, me, [{ x: fx, z: fz }]).ok; })());
  check("집터: 주인 없으면 못 놓고, 내 집터는 놓고, 남의 집터는 못 놓음", (() => {
    const w = makeWorld(); const lot = w.terrain.anchors.lots[0]; const x = lot.x + 1, z = lot.z + 1;
    const none = !FrBlockRules.check(w, x, z, 0, me, []).ok;
    w.lots.set(0, { uid: me.uid, no: me.no, name: "나" });
    const mine = FrBlockRules.check(w, x, z, 0, me, []).ok;
    const theirs = !FrBlockRules.check(w, x, z, 0, other, []).ok;
    const adminOk = FrBlockRules.check(w, x, z, 0, admin, []).ok;
    return none && mine && theirs && adminOk;
  })());
  check("한 학생은 집터 하나만(내 집터 찾기)", (() => { const w = makeWorld(); w.lots.set(3, { uid: "u9", no: 1, name: "a" }); return FrBlockRules.ownLot(w, "u9") === 3 && FrBlockRules.ownLot(w, "u1") === -1; })());
  check("빈터 300개 한도", (() => { const w = makeWorld(); let n = 0; for (let z = 0; z < w.terrain.d && n < 300; z++) for (let x = 0; x < w.terrain.w && n < 300; x++) { if (w.terrain.top(x, z) === "G") { w.blocks.set(w.terrain.index(x, z), 0, { t: "block_wood", n: me.no, r: 0 }); n++; } } return !FrBlockRules.check(w, fx, fz, 0, me, []).ok && FrBlockRules.check(w, fx, fz, 0, admin, []).ok; })());
  check("치우기 권한: 내 것·운영자만", (() => { const rec = { t: "block_wood", n: me.no, r: 0 }; return FrBlockRules.canRemove(rec, me) && !FrBlockRules.canRemove(rec, other) && FrBlockRules.canRemove(rec, admin); })());
  check("치울 블록은 가장 위의 내 블록", (() => { const w = makeWorld(); w.blocks.set(idx, 0, { t: "a", n: me.no, r: 0 }); w.blocks.set(idx, 1, { t: "b", n: other.no, r: 0 }); w.blocks.set(idx, 2, { t: "c", n: me.no, r: 0 }); return FrBlockRules.removable(w, fx, fz, me) === 2 && FrBlockRules.removable(w, fx, fz, other) === 1; })());
  check("집 틀: 집터 안에 73개, 문 2칸 높이·창문 3개", (() => { const lot = terrainFile.anchors.lots[0]; const plan = FrHouseKit.blueprint(lot); const inside = plan.every((p) => p.x >= lot.x && p.x < lot.x + lot.size && p.z >= lot.z && p.z < lot.z + lot.size); return inside && plan.length === 73 && plan.filter((p) => p.t === "block_door").length === 2 && plan.filter((p) => p.t === "block_window").length === 3; })());
  check("집 틀 재료: 목재 30·돌 20·노끈 10", FrHouseKit.COST.wood === 30 && FrHouseKit.COST.stone === 20 && FrHouseKit.COST.rope === 10);
  check("단계 바꾸기 R/F", (() => { const w = makeWorld(); w.blocks.set(idx, 0, { t: "x", n: 1, r: 0 }); w.blocks.set(t.index(fx + 1, fz), 0, { t: "x", n: 1, r: 0 }); w.blocks.set(t.index(fx + 1, fz), 1, { t: "x", n: 1, r: 0 }); const levels = FrBlockRules.allowedLevels(w, fx, fz); return levels.join() === "1" && FrBlockRules.chooseLevel(w, fx, fz, null) === 1; })());
}

if (failures.length > 0) {
  console.log("실패 " + failures.length + "개 / 통과 " + passed + "개");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("모두 통과 " + passed + "개");
