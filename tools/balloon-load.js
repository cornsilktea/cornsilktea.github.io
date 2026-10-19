const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const files = ["39.balloon-map.js", "39.balloon-rules.js", "39.balloon-bot.js", "39.balloon-net.js"];
const names = ["WbCell","WbGrid","WbSeededRandom","WbSpawnPlan","WbWalkDistance","WbZoneMap","WbFairReport","WbLootDeck","WbFairBoxLayout","WbMapCatalog","WbBalance","WbDir","WbIdleIntent","WbTurnBuffer","WbMover","WbPlayer","WbBalloon","WbLootTable","WbSuddenDeath","WbRosterPlanner","WbScoreboard","WbBlast","WbTrapRules","WbEngine","WbSnapshotCodec","WbDangerMap","WbPathFinder","WbBotTuning","WbBotBrain","WbStatItem","WbItem","WbStateCodec","WbMirror","WbRoomRules"];
module.exports = function load() {
  const src = files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n;({" + names.join(",") + "})";
  return vm.runInNewContext(src, { console, Math, Set, Map, Array, Object, Number, String, Int8Array, Int16Array, Int32Array, Uint8Array, Float64Array, Infinity, JSON, isFinite, performance: { now: () => 0 } });
};
