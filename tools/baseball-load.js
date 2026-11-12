// 41번 야구 규칙 엔진(화면을 모르는 컴파일 결과)을 node 에서 불러온다. 검사·시뮬레이션 도구가 같이 쓴다.
const fs = require("fs"), vm = require("vm"), path = require("path");

class BaseballCode {
  static FILES = ["41.baseball-motion.js", "41.baseball-field.js", "41.baseball-pitch.js", "41.baseball-batting.js", "41.baseball-running.js", "41.baseball-defense.js", "41.baseball-play.js", "41.baseball-game.js", "41.baseball-ai.js"];
  static NAMES = ["BbMainBallpark", "BbBallparkRegistry", "BbSeededRandom", "BbMixtureSampler", "BbAbilityAllocator", "BbPitchKind", "BbPitchTuning", "BbPitchCatalog", "BbPitchSelection", "BbAimLimiter",
    "BbPitchLocationSampler", "BbPitchRoller", "BbBatterAbilityModel", "BbStrikeZoneJudge", "BbTimingModel", "BbContactModel", "BbSprayModel", "BbLaunchModel", "BbExitSpeedModel", "BbBattedBallPhysics",
    "BbSwingAction", "BbBatterActionSet", "BbDiamond", "BbRunnerMotion", "BbTagUpRule", "BbAutoBaseRunning", "BbFielderPositions", "BbFielderMotion", "BbThrowDecision", "BbCoverageTable",
    "BbInfieldGroundBallErrorPolicy", "BbNoErrorPolicy", "BbAutoFielding", "BbPlayCodes", "BbInfieldFlyRule", "BbPlayResolver", "BbOneInningFormat", "BbThreeInningFormat", "BbFullGameFormat", "BbLineup",
    "BbBoxScoreBuilder", "BbEventHandlerRegistry", "BbMatchRules", "BbPitchJudge", "BbGameLogFold", "BbBaseballFormulas", "BbAiLevel", "BbAiPitcher", "BbAiBatter", "BbAiMatchRunner"];

  static load() {
    const folder = path.join(__dirname, "..", "games", "41.baseball-duel");
    const source = BaseballCode.FILES.map((file) => fs.readFileSync(path.join(folder, file), "utf8")).join("\n") + "\n;({" + BaseballCode.NAMES.join(",") + "})";
    return vm.runInNewContext(source, { console, Math, Map, Set, Array, Object, Number, Infinity, JSON });
  }
}

module.exports = BaseballCode;
