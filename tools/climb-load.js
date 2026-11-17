const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const files = ["games/42.tower-climb/42.climb-rules.js", "games/42.tower-climb/42.tower-level-data.js"];
const names = ["ClimbBalance", "PlatformPiece", "StaticPlatform", "NarrowPlatform", "SlopePlatform", "HubIsland", "StageRest", "JumpPad", "GrabHold", "ClimbPose", "MovingPlatform", "MovingJumpPad", "ClimbGrabSpot", "ClimbCollisionWorld", "ClimbGrabSystem", "ClimbTimeScale", "StageProgress", "TowerStage", "TowerLevel", "ClimbCharacterBody", "FallReturnWatcher", "ClimbRules", "ClimbLayoutPen", "TowerHubLayout", "TowerStageOneLayout", "TowerStageFourLayout", "TowerStageFiveLayout", "TowerStageSixLayout", "TowerLevelData"];
module.exports = function load() {
  const src = files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n;({" + names.join(",") + "})";
  return vm.runInNewContext(src, { console, Math, Set, Map, Array, Object, Number, String, Int32Array, Infinity, JSON, isFinite, Error });
};
