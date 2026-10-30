const F = require("./forest-load.js")();
const { FrCatalog, FrCropRules, FrTerrainData, FrWorld, FrLocalBackend, FrFarmRules, FrStats, FrStatCatalog, FrSession } = F;
const fs = require("fs"), path = require("path");

let passed = 0;
const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
const terrainFile = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets/forest/island-terrain.json"), "utf8"));
const makeWorld = () => new FrWorld("t", new FrTerrainData(terrainFile), new FrLocalBackend(false));

{
  const w = makeWorld(); const farm = w.terrain.anchors.farm;
  check("텃밭은 처음에 24칸", FrFarmRules.plotCells(w).size === 24);
  check("텃밭 넓히기 한 번이면 36칸, 두 번이면 48칸", (() => { w.village.markBuilt("farm_expand"); const a = FrFarmRules.plotCells(w).size; w.village.markBuilt("farm_expand"); return a === 36 && FrFarmRules.plotCells(w).size === 48; })());
  check("텃밭 칸만 심을 수 있고 이미 심긴 칸은 안 됨", (() => {
    const v = makeWorld(); const x = farm.x, z = farm.z;
    const first = FrFarmRules.canPlant(v, x, z, "potato_seed");
    v.farm.set(v.terrain.index(x, z), { uid: "u", no: 1, crop: "potato", at: 0 });
    return first.ok && !FrFarmRules.canPlant(v, x, z, "potato_seed").ok && !FrFarmRules.canPlant(v, 40, 40, "potato_seed").ok && !FrFarmRules.canPlant(v, x + 1, z, "potato").ok;
  })());
  check("강·수로 두 칸 안의 텃밭은 물가", (() => {
    const v = makeWorld(); const x = farm.x, z = farm.z;
    const before = FrFarmRules.watered(v, x, z);
    v.terrain.edit(x + 8, z, { h: -1, t: "R" });
    const far = FrFarmRules.watered(v, x, z);
    v.terrain.edit(x + 7, z, { h: -1, t: "R" });
    v.terrain.edit(x + 6, z, { h: -1, t: "R" });
    return !before && !far && FrFarmRules.watered(v, x + 5, z + 0) === true;
  })());
  check("작물 단계는 심은 뒤 시간으로 자람(물가면 1.7배 빠름)", (() => {
    const v = makeWorld(); const rec = { uid: "u", no: 1, crop: "potato", at: 0 };
    const dry = [0, 400, 900, 1440].map((m) => FrFarmRules.stage(v, farm.x, farm.z, rec, m)).join();
    v.terrain.edit(farm.x + 7, farm.z, { h: -1, t: "R" });
    const wet = FrFarmRules.stage(v, farm.x + 5, farm.z, rec, 1440 / 1.7 + 1);
    return dry === "0,1,2,3" && wet === 3;
  })());
  check("남은 시간 계산", (() => { const v = makeWorld(); const rec = { uid: "u", no: 1, crop: "carrot", at: 100 }; return Math.round(FrFarmRules.minutesLeft(v, farm.x, farm.z, rec, 340)) === 1200 && FrFarmRules.minutesLeft(v, farm.x, farm.z, rec, 99999) === 0; })());
  check("수로: 강에 붙은 땅·텃밭에 붙은 땅만, 텃밭·물·광장은 안 됨", (() => {
    const v = makeWorld(); let riverNeighbor = null;
    for (let z = 60; z < 70 && !riverNeighbor; z++) for (let x = 70; x < 85 && !riverNeighbor; x++) if ((v.terrain.top(x, z) === "G" || v.terrain.top(x, z) === "D") && v.terrain.top(x + 1, z) === "R" && !v.terrain.isShielded(x, z)) riverNeighbor = [x, z];
    const nextToPlot = [farm.x + farm.w, farm.z];
    return !!riverNeighbor && FrFarmRules.canalAllowed(v, riverNeighbor[0], riverNeighbor[1]) && FrFarmRules.canalAllowed(v, nextToPlot[0], nextToPlot[1]) && !FrFarmRules.canalAllowed(v, farm.x, farm.z) && !FrFarmRules.canalAllowed(v, 40, 30) && !FrFarmRules.canalAllowed(v, v.terrain.anchors.plaza.x, v.terrain.anchors.plaza.z);
  })());
  check("처음 씨앗 감자·당근 3개씩", FrFarmRules.FIRST_SEEDS.potato_seed === 3 && FrFarmRules.FIRST_SEEDS.carrot_seed === 3);
}

{
  check("요리 단계: 모닥불 ★1~2·화덕 ★3~4·섬 부엌 ★5", FrCatalog.RECIPES.every((r) => (r.star <= 2) === (r.station === "campfire") && ((r.star === 3 || r.star === 4) === (r.station === "oven")) && ((r.star === 5) === (r.station === "kitchen"))));
  check("기록판 분류 10개·모든 칸이 분류 안에 있음", FrStatCatalog.TABS.length === 10 && FrStatCatalog.DEFS.every((d) => FrStatCatalog.TABS.indexOf(d.tab) >= 0) && new Set(FrStatCatalog.DEFS.map((d) => d.key)).size === FrStatCatalog.DEFS.length);
  check("기록 세기: 전체·오늘·종류 수·최댓값", (() => {
    const s = new FrStats(); s.load(null, "20261030");
    s.add("shake"); s.add("shake", 2); s.see("fish", "tuna", "fishKinds"); s.see("fish", "tuna", "fishKinds"); s.see("fish", "sardine", "fishKinds"); s.atLeast("deepFloor", 2); s.atLeast("deepFloor", 1);
    return s.value("shake", false) === 3 && s.value("shake", true) === 3 && s.value("fishKinds", false) === 2 && s.value("deepFloor", false) === 2;
  })());
  check("기록: 날짜가 바뀌면 오늘만 0 으로, 전체는 그대로", (() => {
    const s = new FrStats(); s.load(null, "20261030"); s.add("chop", 5);
    const saved = JSON.parse(JSON.stringify(s.data));
    const next = new FrStats(); next.load(saved, "20261031");
    return next.value("chop", false) === 5 && next.value("chop", true) === 0;
  })());
  check("기록 저장 표시(dirty)", (() => { const s = new FrStats(); s.load(null, "20261030"); const a = s.takeDirty(); s.add("dug"); const b = s.takeDirty(); return !a && b && !s.takeDirty(); })());
  check("세션: 재화를 얻으면 얻은 재화 합계·종류가 쌓임", (() => { const w = makeWorld(); const sess = new FrSession(w, "u", "나", 1); sess.gain("wood", 4); sess.gain("stone", 2); sess.gain("wood", 1); return sess.stats.value("itemsTotal", false) === 7 && sess.stats.value("itemKinds", false) === 2; })());
  check("세션: 요리·제작하면 기록이 오름", (() => {
    const w = makeWorld(); const sess = new FrSession(w, "u", "나", 1); sess.gain("potato", 2);
    const r = FrCatalog.RECIPES.find((x) => x.id === "baked_potato"); const ok = sess.cook(r).ok;
    sess.gain("wood", 6); const opts = F.FrBag ? null : null;
    return ok && sess.stats.value("cooked", false) === 1 && sess.stats.value("recipeKinds", false) === 1;
  })());
  check("세션 저장에 기록이 들어가고 다시 읽으면 같음", (() => { const w = makeWorld(); const a = new FrSession(w, "u", "나", 1); a.stats.load(null, "20261030"); a.stats.add("harvested", 3); const save = JSON.parse(JSON.stringify(a.toSave())); const b = new FrSession(w, "u", "나", 1); b.restore(save); return b.stats.value("harvested", false) === 3; })());
}

if (failures.length > 0) {
  console.log("농사·기록 검사 실패 " + failures.length + "개 / 통과 " + passed + "개");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("농사·기록 검사 모두 통과 " + passed + "개");
