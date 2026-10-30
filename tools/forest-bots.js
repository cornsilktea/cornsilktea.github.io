const fs = require("fs"), vm = require("vm"), path = require("path");
const { MockDbServer } = require("./forest-mockdb.js");

const root = path.join(__dirname, "..");
const FILES = ["40.forest-furniture.js", "40.forest-data.js", "40.forest-rules.js", "40.forest-clock.js", "40.forest-minigame.js", "40.forest-terrain.js", "40.forest-village.js", "40.forest-stream.js", "40.forest-net.js", "40.forest-blocks.js", "40.forest-world.js", "40.forest-sync.js", "40.forest-play.js"];
const NAMES = ["FrBalance", "FrCatalog", "FrClock", "FrTerrainData", "FrTreeField", "FrRestBackend", "FrWorld", "FrRoster", "FrSyncHub", "FrJungleNode", "FrTerrainNode", "FrSnowNode", "FrBuildNode", "FrPublicNode", "FrLogNode", "FrClockNode", "FrMembersNode", "FrPresenceNode", "FrPoseNode", "FrAdminNode", "FrPresencePublisher", "FrPosePublisher", "FrMemberWriter", "FrClockSync", "FrPlayerBody", "FrSleepVote", "FrWire"];

class BotEnvironment {
  constructor(port) {
    this.window = { PORTAL_CONFIG: { DB_URL: "http://localhost:" + port + "/db", isReady: () => true } };
    const sandbox = {
      window: this.window, console, Math, Set, Map, Array, Object, Number, String, JSON, isFinite, Infinity, Date, Promise, Int8Array, Uint8Array,
      fetch, URL, TextDecoder, AbortController, setTimeout, clearTimeout, Error,
    };
    this.window.window = this.window;
    const source = FILES.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n;({" + NAMES.join(",") + "})";
    this.F = vm.runInNewContext(source, sandbox);
    this.terrainFile = JSON.parse(fs.readFileSync(path.join(root, "assets/forest/island-terrain.json"), "utf8"));
  }
}

class ForestBot {
  constructor(env, index, island) {
    this.F = env.F;
    this.env = env;
    this.index = index;
    this.island = island;
    this.uid = "bot" + index;
    this.random = () => Math.random();
    this.target = null;
    this.moving = true;
  }

  async start() {
    const F = this.F;
    const user = { uid: this.uid, getToken: async () => "tok" };
    this.backend = new F.FrRestBackend(user);
    this.world = new F.FrWorld(this.island, new F.FrTerrainData(this.env.terrainFile), this.backend);
    await this.world.load();
    this.clock = new F.FrClockSync(this.backend, this.island, this.uid);
    await this.clock.join();
    this.roster = new F.FrRoster();
    this.roster.serverNow = () => this.clock.serverNow();
    const hub = new F.FrSyncHub();
    hub.register("jungle", new F.FrJungleNode(this.world));
    hub.register("terrain", new F.FrTerrainNode(this.world));
    hub.register("snow", new F.FrSnowNode(this.world));
    hub.register("build", new F.FrBuildNode(this.world));
    hub.register("public", new F.FrPublicNode(this.world));
    hub.register("publicLog", new F.FrLogNode(this.world));
    hub.register("clock", new F.FrClockNode(this.clock));
    hub.register("members", new F.FrMembersNode(this.roster));
    hub.register("presence", new F.FrPresenceNode(this.roster));
    hub.register("pos", new F.FrPoseNode(this.roster));
    hub.register("admin", new F.FrAdminNode());
    hub.start(this.backend, this.island);
    this.hub = hub;
    this.body = new F.FrPlayerBody(this.world);
    const plaza = this.world.terrain.anchors.plaza;
    this.body.place(plaza.x + (this.index % 5) - 2, plaza.z + 3 + Math.floor(this.index / 5));
    this.presence = new F.FrPresencePublisher(this.backend, this.island, this.uid);
    this.pose = new F.FrPosePublisher(this.backend, this.island, this.uid);
    await new F.FrMemberWriter(this.backend, this.island).write(this.uid, (20100 + this.index) + " 봇" + this.index, "봇" + this.index, { c: this.index % 13 }, false);
    await this.presence.publish("island", false, 1, true);
  }

  pickTarget() {
    const plaza = this.world.terrain.anchors.plaza;
    const angle = this.random() * Math.PI * 2, radius = 3 + this.random() * 22;
    this.target = { x: (plaza.x + Math.cos(angle) * radius + 0.5) * 2, z: (plaza.z + Math.sin(angle) * radius + 0.5) * 2 };
    this.pause = this.random() < 0.3 ? 20 + Math.floor(this.random() * 30) : 0;
  }

  step(dt) {
    if (!this.target || (Math.hypot(this.target.x - this.body.x, this.target.z - this.body.z) < 1.5)) this.pickTarget();
    let dir = { x: 0, z: 0 };
    if (this.pause > 0) this.pause -= 1;
    else {
      const dx = this.target.x - this.body.x, dz = this.target.z - this.body.z, d = Math.hypot(dx, dz);
      dir = { x: dx / d, z: dz / d };
    }
    const before = this.body.x + this.body.z;
    this.body.step(dir, dt, 0);
    if (this.pause <= 0 && Math.abs(this.body.x + this.body.z - before) < 0.001) this.pickTarget();
    this.pose.send(this.body.x, this.body.z, this.body.y, this.body.facing, this.body.moving ? 1 : 0, this.body.vx, this.body.vz);
    void this.presence.publish("island", false, 1, false);
    if (this.random() < 0.0015) this.randomAction();
  }

  async randomAction() {
    const trees = Array.from(this.world.trees.values());
    const spot = trees[Math.floor(this.random() * trees.length)];
    if (spot && !this.world.isFelled(this.world.terrain.index(spot.x, spot.z))) await this.world.fellTree(spot);
    await this.world.putPublic("wood", 2, this.uid);
  }
}

class BotRun {
  constructor(count, seconds) { this.count = count; this.seconds = seconds; }

  async run() {
    const port = 8793;
    const server = await new MockDbServer(port).start();
    const env = new BotEnvironment(port);
    const bots = Array.from({ length: this.count }, (_, i) => new ForestBot(env, i + 1, "test_1"));
    await Promise.all(bots.map((b) => b.start()));
    const t0 = Date.now();
    const timer = setInterval(() => bots.forEach((b) => b.step(0.05)), 50);
    await new Promise((resolve) => setTimeout(resolve, this.seconds * 1000));
    clearInterval(timer);
    const stats = server.stats.snapshot();
    const visible = bots.map((b) => b.roster.aliveUids().length);
    const posesSeen = bots.map((b) => b.roster.poses.size);
    this.report(stats, (Date.now() - t0) / 1000, visible, posesSeen);
    bots.forEach((b) => b.hub.close());
    server.stop();
    process.exit(0);
  }

  report(stats, seconds, visible, posesSeen) {
    const kb = (n) => (n / 1024).toFixed(1) + " KB";
    const sse = Object.keys(stats.bytes).filter((k) => k.indexOf("WRITE") !== 0 && k.indexOf("GET") !== 0).reduce((a, k) => a + stats.bytes[k], 0);
    const writes = Object.keys(stats.bytes).filter((k) => k.indexOf("WRITE") === 0).reduce((a, k) => a + stats.bytes[k], 0);
    const perClassSseMb = (sse / seconds) * 2700 / 1024 / 1024;
    console.log("봇 " + this.count + "명 · " + seconds.toFixed(0) + "초 측정");
    console.log("서버가 학생들에게 보낸 양(스트림): " + kb(sse) + " → 학생 한 명당 " + kb(sse / this.count) + " (45분이면 약 " + (perClassSseMb / this.count).toFixed(1) + " MB)");
    console.log("학생들이 서버에 쓴 양: " + kb(writes));
    console.log("섬 하나 수업 한 번(45분) 예상 내려받기 합계: 약 " + perClassSseMb.toFixed(0) + " MB");
    console.log("분류별 스트림: " + Object.keys(stats.bytes).filter((k) => k.indexOf("WRITE") !== 0 && k.indexOf("GET") !== 0).map((k) => k + " " + kb(stats.bytes[k])).join(" · "));
    console.log("요청 수: " + JSON.stringify(stats.requests));
    console.log("각 봇이 본 접속자 수: " + Math.min(...visible) + "~" + Math.max(...visible) + " · 위치를 받은 수: " + Math.min(...posesSeen) + "~" + Math.max(...posesSeen));
  }
}

new BotRun(Number(process.argv[2] || 16), Number(process.argv[3] || 40)).run();
