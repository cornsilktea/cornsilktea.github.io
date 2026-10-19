class WbPreviewOptions {
  readonly seed: number;
  readonly mapId: string;
  readonly mode: WbMode;
  readonly count: number;
  readonly level: WbDifficulty;
  readonly speed: number;
  readonly skipTo: number;

  constructor(search: string) {
    const params = new URLSearchParams(search);
    this.seed = Number(params.get("seed")) || Math.floor(Math.random() * 1e9);
    this.mapId = params.get("map") || WbMapCatalog.RANDOM;
    this.mode = params.get("mode") === "team" ? "team" : "solo";
    this.count = Math.max(2, Math.min(8, Number(params.get("n")) || 6));
    const level = params.get("level");
    this.level = level === "easy" || level === "hard" ? level : "normal";
    this.speed = Math.max(0.25, Math.min(8, Number(params.get("speed")) || 1));
    this.skipTo = Math.max(0, Math.min(WbBalance.MATCH, Number(params.get("at")) || 0));
    const trap = params.get("trap");
    if (trap === "hit") WbAvatarView.trapClip = "Hit_B";
  }
}

class WbBotLooks {
  static make(seed: number): CharacterLook {
    const random = new WbSeededRandom(seed);
    const look = CharacterLooks.createDefault();
    look.c = random.int(CharacterCatalog.RANDOM_TYPE_COUNT);
    CharacterCatalog.COLOR_PARTS.forEach((part) => { look.p[part.key] = random.next() < 0.15 ? 0 : 1 + random.int(part.set.length); });
    return look;
  }
}

class WbPreviewOverlay {
  private readonly box: HTMLElement;

  constructor() {
    this.box = document.getElementById("previewInfo") as HTMLElement;
  }

  show(engine: WbEngine, theme: WbMapTheme, level: WbDifficulty, watched: number): void {
    const s = Math.max(0, Math.ceil(WbBalance.MATCH - engine.seconds));
    const clock = engine.tick < 0 ? "준비 " + Math.ceil(-engine.seconds) : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    const alive = engine.players.filter((p) => p.life !== "out").length;
    const me = engine.players[watched];
    const stat = me ? me.nick + " · 💧" + me.balloonsMax + " 줄기" + me.range + " 👟" + me.shoe + " 📌" + me.needles : "";
    this.box.textContent = theme.title + " · " + (engine.mode === "solo" ? "개인전" : "팀전") + " · " + level + " · " + clock + " · 남은 " + alive + "명 · 시드 " + engine.seed + " | " + stat;
  }
}

class WbGame {
  static readonly RESTART_MS = 3000;
  private readonly options = new WbPreviewOptions(location.search);
  private readonly overlay = new WbPreviewOverlay();
  private readonly touch = matchMedia("(pointer: coarse)").matches;
  private world: WbWorldView | null = null;
  private engine: WbEngine | null = null;
  private theme: WbMapTheme = WbMapCatalog.THEMES[0];
  private seed: number;
  private watched = 0;
  private endedAt = -1;
  private lastMs = 0;
  private mapStep = 0;

  constructor(private readonly libs: ThreeLibs) {
    this.seed = this.options.seed;
    this.start().catch((error) => { (document.getElementById("loading") as HTMLElement).textContent = "불러오기 실패: " + error; });
  }

  private async start(): Promise<void> {
    const assets = new CharacterAssets(this.libs);
    await assets.load();
    const library = new WbModelLibrary(this.libs);
    await library.load(assets.clips);
    const factory = new CharacterModelFactory(this.libs, assets);
    const canvas = document.getElementById("view") as HTMLCanvasElement;
    this.world = new WbWorldView(this.libs, canvas, this.touch, library, factory);
    (document.getElementById("loading") as HTMLElement).hidden = true;
    window.addEventListener("keydown", (e) => this.key(e));
    canvas.addEventListener("pointerdown", (e) => this.pick(e.clientX, e.clientY));
    this.newMatch();
    this.lastMs = performance.now();
    requestAnimationFrame((ms) => this.frame(ms));
  }

  private newMatch(): void {
    const world = this.world as WbWorldView;
    const mapRng = new WbSeededRandom(this.seed ^ 0x3A9);
    const pickId = this.mapStep > 0 ? WbMapCatalog.THEMES[(this.mapStep - 1) % WbMapCatalog.THEMES.length].id : this.options.mapId;
    this.theme = WbMapCatalog.resolve(pickId, mapRng);
    const teams = WbRosterPlanner.allBots(this.options.mode, this.options.count);
    const engine = new WbEngine({ seed: this.seed, lootSeed: this.seed ^ 0x1007, mode: this.options.mode, teams });
    engine.players.forEach((p) => engine.attach(p.index, new WbBotBrain(p.index, this.options.level, engine.seed)));
    if (this.mapStep === 0) while (!engine.ended && engine.seconds < this.options.skipTo) engine.step();
    this.engine = engine;
    const looks = engine.players.map((p) => WbBotLooks.make(this.seed + p.index * 7919));
    world.show(this.theme, engine, looks);
    world.playing = true;
    this.watched = 0;
    this.endedAt = -1;
    this.markWatched();
  }

  private markWatched(): void {
    const match = this.world && this.world.current;
    if (match) match.avatars.forEach((a, k) => { a.watched = k === this.watched; });
  }

  private key(e: KeyboardEvent): void {
    const engine = this.engine;
    if (!engine) return;
    const n = engine.players.length;
    if (e.key === "ArrowRight" || e.code === "KeyD") { this.watched = (this.watched + 1) % n; this.markWatched(); }
    if (e.key === "ArrowLeft" || e.code === "KeyA") { this.watched = (this.watched + n - 1) % n; this.markWatched(); }
    if (e.code === "KeyM") { this.mapStep++; this.newMatch(); }
    if (e.code === "KeyN") { this.seed = (this.seed + 1) >>> 0; this.newMatch(); }
  }

  private pick(x: number, y: number): void {
    const match = this.world && this.world.current;
    if (!match || !this.world) return;
    let best = -1, bestD = 70;
    match.avatars.forEach((a, k) => {
      const at = this.world!.project(a.root.position.x, 1.2, a.root.position.z);
      const d = Math.hypot(at.x - x, at.y - y);
      if (d < bestD) { bestD = d; best = k; }
    });
    if (best >= 0) { this.watched = best; this.markWatched(); }
  }

  private frame(ms: number): void {
    const dt = Math.min(0.1, (ms - this.lastMs) / 1000);
    this.lastMs = ms;
    const engine = this.engine, world = this.world;
    if (engine && world) {
      const events = engine.update(dt * this.options.speed);
      world.react(events, ms);
      world.render(dt, ms);
      this.overlay.show(engine, this.theme, this.options.level, this.watched);
      if (engine.ended && this.endedAt < 0) this.endedAt = ms;
      if (this.endedAt >= 0 && ms - this.endedAt > WbGame.RESTART_MS) { this.seed = (this.seed + 1) >>> 0; this.newMatch(); }
    }
    requestAnimationFrame((next) => this.frame(next));
  }
}
