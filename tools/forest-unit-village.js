const F = require("./forest-load.js")();
const { FrChestStore, FrFurnitureCatalog, FrBlockRules, FrCatalog, FrTerrainData, FrWorld, FrLocalBackend, FrVillage, FrSiteBook, FrVillageLevels, FrBalance } = F;
const fs = require("fs"), path = require("path");

let passed = 0;
const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
const terrainFile = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets/forest/island-terrain.json"), "utf8"));
const makeWorld = () => new FrWorld("t", new FrTerrainData(terrainFile), new FrLocalBackend(false));
const rich = async (world, defId) => { const def = FrVillage.definition(defId); for (const id of Object.keys(def.cost)) await world.putPublic(id, def.cost[id], "t"); };

(async () => {
  const w = makeWorld();
  FrCatalog.CONSTRUCTIONS.forEach((def) => {
    const mine = w.sites.filter((s) => s.defId === def.id);
    check(def.id + " 자리 수가 건설 개수와 같음", mine.length === def.count, [mine.length, def.count]);
    mine.forEach((s, i) => check(def.id + " 번호가 1부터 이어짐", s.number === i + 1));
  });
  const used = new Set();
  let overlap = 0;
  w.sites.forEach((s) => s.cells.forEach((c) => { const key = c.x + "," + c.z; if (used.has(key)) overlap++; used.add(key); }));
  check("자리끼리 칸이 겹치지 않음", overlap === 0, overlap);
  check("성벽·탑·가로등 칸은 물이 아님", w.sites.filter((s) => ["wall", "tower", "lamp", "gate"].indexOf(s.defId) >= 0).every((s) => s.cells.every((c) => !w.terrain.isWater(c.x, c.z))));

  const bridge = w.sites.find((s) => s.defId === "bridge_east");
  check("다리 자리는 건설 전에는 물", bridge.effect.every((c) => w.terrain.top(c.x, c.z) === "R"));
  await rich(w, "bridge_east");
  w.village.markBuilt("workbench"); w.village.markBuilt("forge"); w.village.markBuilt("oven"); w.village.markBuilt("kitchen");
  for (let i = 0; i < 5; i++) w.village.markBuilt("lamp");
  check("마을이 충분히 크면 동쪽 다리를 지을 수 있음", await w.build(FrVillage.definition("bridge_east"), "t"), w.village.level());
  check("다리를 지으면 물이 널빤지로 바뀜", bridge.effect.every((c) => w.terrain.top(c.x, c.z) === "P" && w.terrain.height(c.x, c.z) === 0));
  check("같은 번호는 다시 지을 수 없음", !(await w.build(FrVillage.definition("bridge_east"), "t")));
  check("건설 기록 키는 종류_번호", w.isBuilt("bridge_east_1"));
  await w.unbuild("bridge_east_1", true);
  check("철거하면 물로 돌아옴", bridge.effect.every((c) => w.terrain.top(c.x, c.z) === "R" && w.terrain.height(c.x, c.z) === -1) && !w.isBuilt("bridge_east_1"));
  check("철거하면 재료가 돌아옴", Object.keys(FrVillage.definition("bridge_east").cost).every((id) => w.publicStore.count(id) >= FrVillage.definition("bridge_east").cost[id]) && w.village.builtCount("bridge_east") === 0);

  const lamp = w.sites.find((s) => s.defId === "lamp");
  check("가로등은 짓기 전에도 표지 칸이 막힘", w.solid(lamp.cells[0].x, lamp.cells[0].z));
  const wall = w.sites.find((s) => s.defId === "wall");
  const wallCell = wall.cells[2];
  check("성벽은 짓기 전에는 지나갈 수 있음", !w.solid(wallCell.x, wallCell.z));
  w.village.markBuilt("wall");
  w.remoteBuilt("wall_1");
  check("성벽을 지으면 칸이 막힘", w.solid(wallCell.x, wallCell.z));
  const gate = w.sites.find((s) => s.defId === "gate");
  const mid = { x: gate.x, z: gate.z };
  check("성문 가운데 칸은 계속 통과", !w.solid(mid.x, mid.z));
  w.remoteBuilt("gate_1");
  check("성문 기둥은 짓고 나면 막힘", gate.cells.every((c) => w.solid(c.x, c.z)) && !w.solid(mid.x, mid.z));

  const levels = new Set([1]);
  const probe = makeWorld();
  for (const def of FrCatalog.CONSTRUCTIONS) for (let i = 0; i < def.count; i++) { probe.village.markBuilt(def.id); levels.add(probe.village.level()); }
  check("모두 지으면 마을 5단계", probe.village.level() === 5 && FrVillageLevels.label(5) !== "", probe.village.level());
  check("마을 단계 이름이 5개", [1, 2, 3, 4, 5].every((l) => FrVillageLevels.label(l).length > 0));
  check("5단계는 다음 점수 없음", FrVillageLevels.nextScore(5) === -1 && FrVillageLevels.nextScore(1) === FrBalance.VILLAGE_LEVEL_SCORE[2]);

  check("가구 30종", FrFurnitureCatalog.ITEMS.length === 30, FrFurnitureCatalog.ITEMS.length);
  check("가구는 모두 재료 목록(가방)에 있음", FrFurnitureCatalog.ITEMS.every((f) => FrCatalog.material(FrFurnitureCatalog.idOf(f.id)) && Object.keys(f.cost).every((id) => FrCatalog.material(id))));
  check("가구 아이디가 겹치지 않음", new Set(FrFurnitureCatalog.ITEMS.map((f) => f.id)).size === 30);
  {
    const fw = makeWorld();
    const lot = fw.terrain.anchors.lots[0];
    await fw.claimLot(0, { uid: "u1", no: 1, name: "나" });
    const me = { uid: "u1", no: 1, admin: false };
    const x = lot.x + 2, z = lot.z + 2;
    check("내 집터 안에 의자를 놓을 수 있음", FrBlockRules.check(fw, x, z, 0, me, []).ok);
    await fw.placeBlock(x, z, 0, FrFurnitureCatalog.idOf("chair"), 1, me);
    check("의자 칸은 막힘", fw.solid(x, z));
    await fw.placeBlock(x + 1, z, 0, FrFurnitureCatalog.idOf("rug_red"), 0, me);
    check("양탄자 칸은 지나갈 수 있음", !fw.solid(x + 1, z));
    check("가구는 올라설 수 없음(바닥 높이 그대로)", fw.surfaceAt(x, z) === fw.terrain.height(x, z));
    check("남의 집터에는 못 놓음", !FrBlockRules.check(fw, x, z, 1, { uid: "u2", no: 2, admin: false }, []).ok);
    await fw.removeBlock(x, z, 0, me);
    check("치우면 다시 지나감", !fw.solid(x, z));
  }

  {
    const chest = new FrChestStore();
    chest.put("wood", 30);
    const copy = new FrChestStore();
    copy.restore(chest.snapshot());
    check("내 창고 저장·복원", copy.count("wood") === 30 && copy.slotsUsed() === chest.slotsUsed());
    check("내 창고는 120칸까지", (() => { const c = new FrChestStore(); let n = 0; for (const m of FrCatalog.MATERIALS) { if (!c.canPut(m.id, 99)) continue; c.put(m.id, 99); n++; if (c.slotsUsed() >= 120) break; } return c.slotsUsed() <= 120 && !c.canPut("wood", 99 * 200); })());
    check("반지는 내 창고에 못 넣음", !new FrChestStore().canPut("ring", 1));
  }

  if (failures.length > 0) {
    console.log("마을 건설 검사 실패 " + failures.length + "개 / 통과 " + passed + "개");
    failures.forEach((f) => console.log("  ✗ " + f));
    process.exit(1);
  }
  console.log("마을 건설 검사 모두 통과 " + passed + "개");
})();
