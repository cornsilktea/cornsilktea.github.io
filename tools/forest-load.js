const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const files = ["40.forest-data.js", "40.forest-rules.js", "40.forest-clock.js", "40.forest-minigame.js", "40.forest-terrain.js", "40.forest-stream.js", "40.forest-net.js", "40.forest-blocks.js", "40.forest-world.js"];
const names = ["FrBalance","FrCatalog","FrRandom","FrPity","FrLegendRoll","FrFruitRoll","FrSeedRoll","FrFishRoll","FrOreRoll","FrDungeonDrops","FrItems","FrBag","FrPublicStore","FrChestStore","FrPersonalCraftSource","FrVillageBuildSource","FrActionPoints","FrFoodRules","FrRecipeRules","FrCraftRules","FrRingRules","FrCropRules","FrSnowRules","FrVillage","FrFishingRules","FrMineRules","FrDungeonRules","FrClock","FrSleepVote","FrMashGauge","FrCenterStop","FrShrinkRing","FrHoldRelease","FrMiniGameFactory","FrTerrainData","FrTreeField","FrWorld","FrLocalBackend","FrBlockStore","FrBlockRules","FrHouseKit","FrBlockKey"];
module.exports = function load() {
  const src = files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n;({" + names.join(",") + "})";
  return vm.runInNewContext(src, { console, Math, Set, Map, Array, Object, Number, String, JSON, isFinite, Infinity });
};
