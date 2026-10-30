const F = require("./forest-load.js")();
const { FrBalance, FrCatalog, FrRandom, FrTerrainData, FrWorld, FrLocalBackend, FrSession, FrAreaFactory, FrFeature, FrGatherRules, FrFishingSession, FrExpedition, FrAreaInfo, FrCaveLight } = F;
const fs = require("fs"), path = require("path");

let passed = 0;
const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }

const terrainFile = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets/forest/island-terrain.json"), "utf8"));
const mineData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets/forest/mine-cave.json"), "utf8"));
const forest = FrAreaFactory.forest(11), beach = FrAreaFactory.beach(7);
const count = (area, kind) => area.list.filter((f) => f.kind === kind).length;

check("과일 숲: 과일나무·정글 나무·꽃과 출구", count(forest, "fruitTree") >= 25 && count(forest, "jungleTree") >= 20 && count(forest, "flower") >= 30 && count(forest, "exit") === 1, [count(forest, "fruitTree"), count(forest, "jungleTree"), count(forest, "flower")]);
check("과일 숲: 시작 자리 둘레는 비어 있음", forest.list.every((f) => f.kind === "exit" || Math.hypot(f.x - forest.spawn.x, f.z - forest.spawn.z) >= 3.9));
check("과일 숲: 나무는 길을 막고 꽃은 안 막음", (() => { const tree = forest.list.find((f) => f.kind === "fruitTree"), flower = forest.list.find((f) => f.kind === "flower"); return forest.blocked(tree.x, tree.z) && !forest.blocked(flower.x, flower.z); })());
check("해변: 채집 지점이 물 밖, 바다가 있음", beach.list.filter((f) => f.kind === "shoreSpot").length >= 30 && beach.list.filter((f) => f.kind === "shoreSpot").every((f) => !beach.terrain.isWater(f.x, f.z)) && beach.terrain.isWater(32, 40));
check("과일 숲은 들어갈 때마다 배치가 다름", FrAreaFactory.forest(1).list.filter((f) => f.kind === "flower").map((f) => f.x).join() !== FrAreaFactory.forest(2).list.filter((f) => f.kind === "flower").map((f) => f.x).join());

check("광산 1층: 바닥 칸 수가 지도와 같고 광맥은 광맥 자리 안", (() => {
  const f = mineData.floors[0]; const area = FrAreaFactory.mine(f, 3, 5); const t = area.terrain;
  let floorCells = 0, veins = 0, outside = 0; const allowed = new Set(); f.oreSpots.forEach((c) => c.forEach(([x, z]) => allowed.add(z * f.w + x)));
  for (let z = 0; z < t.d; z++) for (let x = 0; x < t.w; x++) { if (t.top(x, z) === "C") floorCells++; if (t.top(x, z) === "V") { veins++; if (!allowed.has(z * f.w + x)) outside++; } }
  return floorCells === f.rows.join("").split(".").length - 1 && veins > 0 && outside === 0;
})());
check("광산: 1층 출구·아래 사다리, 3층 아래 사다리 없음, 횃불 모두", (() => {
  const a1 = FrAreaFactory.mine(mineData.floors[0], 3, 1), a2 = FrAreaFactory.mine(mineData.floors[1], 3, 1), a3 = FrAreaFactory.mine(mineData.floors[2], 3, 1);
  return count(a1, "exit") === 1 && count(a1, "ladderDown") === 1 && count(a2, "ladderUp") === 1 && count(a3, "ladderDown") === 0 && count(a1, "torch") === mineData.floors[0].torches.length;
})());
check("광산: 벽은 막혀 있고 파면 걸을 수 있음", (() => {
  const a = FrAreaFactory.mine(mineData.floors[0], 3, 1); const t = a.terrain; let w = null;
  for (let z = 1; z < t.d - 1 && !w; z++) for (let x = 1; x < t.w - 1 && !w; x++) if (t.top(x, z) === "T" && t.top(x - 1, z) === "C") w = [x, z];
  const before = !t.canStep(w[0] - 1, w[1], w[0], w[1]);
  t.edit(w[0], w[1], { h: 0, t: "C" });
  return before && t.canStep(w[0] - 1, w[1], w[0], w[1]);
})());
check("동굴 빛: 횃불 가까이가 더 밝음", (() => { const light = new FrCaveLight([[10, 10]]); return light.at(10, 11)[0] > light.at(30, 30)[0]; })());
check("구역 이름·혼자 구역·함께 구역", FrAreaInfo.label("fruit") === "과일 숲" && FrAreaInfo.solo("mine") && !FrAreaInfo.solo("beach") && FrAreaInfo.shared("beach") && FrAreaInfo.shared("island"));

const world = new FrWorld("t", new FrTerrainData(terrainFile), new FrLocalBackend(false));
const newSession = () => new FrSession(world, "u", "나", 1);
check("열매 흔들기: 늘 과일이 나옴", (() => { const s = newSession(); const r = new FrRandom(5); for (let i = 0; i < 300; i++) { const g = FrGatherRules.shake(r, s); if (!Object.keys(g).some((k) => FrCatalog.FRUITS.indexOf(k) >= 0)) return false; } return true; })());
check("열매 흔들기: 다이아몬드 바구니는 황금 사과가 더 자주", (() => { const rate = (tier) => { const s = newSession(); if (tier) s.bag.add("gear_basket_" + tier, 1); const r = new FrRandom(9); let n = 0; for (let i = 0; i < 8000; i++) { s.pity.fruit = 0; if (FrGatherRules.shake(r, s).golden_apple) n++; } return n; }; return rate(3) > rate(0) * 1.5; })());
check("광맥: 깊을수록 철·다이아몬드가 많음", (() => { const rate = (floor) => { const s = newSession(); s.bag.add("gear_pickaxe_3", 1); const r = new FrRandom(3); let n = 0; for (let i = 0; i < 6000; i++) { s.pity.ore = 0; const g = FrGatherRules.vein(r, s, floor); if (g.iron || g.diamond) n++; } return n; }; return rate(3) > rate(1); })());
check("해변 채집·꽃 따기·나무 베기", (() => { const s = newSession(); const r = new FrRandom(2); const f = new FrFeature("shoreSpot", 1, 1, 0, "salt"); return FrGatherRules.shore(f, r, s).salt >= 1 && Object.keys(FrGatherRules.flower(r, s))[0].indexOf("flower_") === 0 && FrGatherRules.chop(s).wood === 2; })());

const common = { item: "sardine", legend: false, miss: 0 };
check("낚시: 박자에 당기면 잡음", (() => { const fs2 = new FrFishingSession(1, common, new FrRandom(1)); while (fs2.phase !== "rhythm") fs2.tick(0.02); while (fs2.elapsed < fs2.beatTimes[0] - 0.01) fs2.tick(0.01); return fs2.press() === "caught" && fs2.phase === "caught"; })());
check("낚시: 일반 1번·희귀 2번·전설 3번", (() => { const beats = (item) => new FrFishingSession(1, { item, legend: false, miss: 0 }, new FrRandom(1)).beats; return beats("sardine") === 1 && beats("sea_bream") === 2 && beats("tuna") === 3; })());
check("낚시: 가짜 입질에 당기면 사라짐", (() => { for (let seed = 1; seed < 60; seed++) { const fs2 = new FrFishingSession(1, common, new FrRandom(seed)); if (fs2.fakeTimes.length === 0) continue; while (fs2.elapsed < fs2.fakeTimes[0] + 0.1) fs2.tick(0.02); return fs2.phase === "fake" && fs2.press() === "miss" && fs2.phase === "escaped"; } return false; })());
check("낚시: 박자를 놓치거나 일찍 당기면 사라짐", (() => { const a = new FrFishingSession(1, common, new FrRandom(1)); while (a.elapsed < a.beatTimes[0] + 0.5) a.tick(0.02); const late = a.phase === "escaped"; const b = new FrFishingSession(1, common, new FrRandom(1)); while (b.phase !== "rhythm") b.tick(0.02); while (b.elapsed < b.beatTimes[0] - 0.5) b.tick(0.02); return late && b.press() === "miss"; })());
check("낚시: 입질까지 시간은 낚싯대 등급 범위", [1, 2, 3].every((t) => { const [lo, hi] = FrBalance.ROD_BITE_SECONDS[t]; return [1, 2, 3, 4, 5].every((seed) => { const fs2 = new FrFishingSession(t, common, new FrRandom(seed)); return fs2.biteAt >= lo && fs2.biteAt <= hi; }); }));
check("낚시: 희귀 2번을 연달아 맞춰야 잡음", (() => { const fs2 = new FrFishingSession(2, { item: "sea_bream", legend: false, miss: 0 }, new FrRandom(2)); while (fs2.phase !== "rhythm") fs2.tick(0.02); while (fs2.elapsed < fs2.beatTimes[0] - 0.01) fs2.tick(0.01); const first = fs2.press(); while (fs2.elapsed < fs2.beatTimes[1] - 0.01) fs2.tick(0.01); return first === "hit" && fs2.press() === "caught"; })());

check("탐험 정산: 얻은 재료·쓴 행동력·닳은 도구", (() => {
  const s = newSession(); s.bag.add("gear_pickaxe_1", 1); s.bag.add("wood", 3);
  const e = new FrExpedition(s, "mine"); e.begin();
  s.gain("iron", 4); s.gain("wood", 2); s.ap.spend(12); s.bag.wear("pickaxe");
  const gains = e.gains();
  return gains.iron === 4 && gains.wood === 2 && e.spentActionPoints() === 12 && e.wornTools().length === 1;
})());
check("탐험 정산: 도구가 다 닳으면 알려 줌", (() => { const s = newSession(); s.bag.add("gear_axe_1", 1); const e = new FrExpedition(s, "fruit"); e.begin(); for (let i = 0; i < 100; i++) s.bag.wear("axe"); return e.wornTools()[0].indexOf("다 닳음") >= 0; })());

if (failures.length > 0) {
  console.log("구역 검사 실패 " + failures.length + "개 / 통과 " + passed + "개");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("구역 검사 모두 통과 " + passed + "개");
