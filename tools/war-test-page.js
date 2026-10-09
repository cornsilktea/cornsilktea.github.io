const fs = require("fs");
const path = require("path");

class WarTestHelper {
  static SOURCE = `
class WarDebug {
  constructor(app) { this.app = app; }
  get engine() { return this.app.match.engine; }
  start(faction) {
    const button = document.querySelector("#startBtn") || [...document.querySelectorAll("button")].find((b) => b.textContent.includes("게임 시작"));
    if (faction === "grave") [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "무덤 군단").click();
    button.click();
  }
  spawn(team, unitId, count, buildingType) {
    const engine = this.engine;
    const player = engine.players[team];
    player.economy.ore = 5000;
    player.economy.crystal = 2000;
    const type = buildingType || "barracks";
    let slot = player.slotBuildings.findIndex((b) => b && b.def.type === type);
    if (slot < 0) {
      slot = player.slotBuildings.findIndex((b, i) => !b && player.slotDefs[i].enabled);
      engine.build(team, slot, type);
    }
    const building = player.slotBuildings[slot];
    building.buildLeft = 0;
    for (let i = 0; i < count; i++) engine.produce(team, building.id, unitId);
  }
  look(zoom, sceneX, sceneZ) {
    const rig = this.app.world.rig;
    rig.setZoom(zoom);
    rig.focusOn(sceneX, sceneZ);
  }
  lookAtTurret(team, zoom) {
    const view = this.app.match.view.buildings.get(this.engine.players[team].turret.id);
    const THREE = this.app.libs.THREE;
    const point = new THREE.Vector3();
    view.group.getWorldPosition(point);
    this.look(zoom || 0.3, point.x, point.z + 2);
  }
  errors() { return window.__consoleErrors.slice(); }
}
window.__consoleErrors = [];
window.addEventListener("error", (e) => window.__consoleErrors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => window.__consoleErrors.push(String(e.reason)));
const originalError = console.error;
console.error = function () { window.__consoleErrors.push([...arguments].join(" ")); originalError.apply(console, arguments); };
Math.random = function () { return 0.1; };
`;
}

class WarTestPageBuilder {
  constructor(root) {
    this.root = root;
  }

  build() {
    let html = fs.readFileSync(path.join(this.root, "37.space-war.html"), "utf8");
    html = html.replace('<script charset="utf-8" src="access-guard.js" data-game="spacewar"></script>', "");
    html = html.replace("<head>", '<head><base href="/"><script>window.requestAnimationFrame=function(cb){return setTimeout(function(){cb(performance.now())},16)}</script><script>' + WarTestHelper.SOURCE + "</script>");
    const entry = "new WarGameApp({ THREE, GLTFLoader, SkeletonUtils });";
    if (!html.includes(entry)) throw new Error("시작 줄을 찾지 못했어요");
    html = html.replace(entry, "window.__app = " + entry + " window.__t = new WarDebug(window.__app);");
    const target = path.join(this.root, ".claude", "war-test.html");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, html, "utf8");
    console.log("만들었어요: .claude/war-test.html — 항상 내 팀(0번) 시점이고, __t.start/spawn/look/lookAtTurret/errors 를 쓸 수 있어요.");
  }
}

new WarTestPageBuilder(path.resolve(__dirname, "..")).build();
