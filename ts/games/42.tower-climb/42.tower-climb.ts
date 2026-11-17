type TowerClimbState = "loading" | "menu" | "countdown" | "play" | "pause";
type ClimbEventHandlers = { [K in ClimbEvent["t"]]?: (event: Extract<ClimbEvent, { t: K }>) => void };

class TowerClimbGame {
  static readonly COUNTDOWN = 3;
  static readonly HINT_EVERY = 4;
  static readonly MAX_FRAME = 0.1;

  private state: TowerClimbState = "loading";
  private level!: TowerLevel;
  private view!: ClimbWorldView;
  private hud!: ClimbHud;
  private startPanel!: ClimbStartPanel;
  private records!: ClimbRecords;
  private progress!: StageProgress;
  private rules!: ClimbRules;
  private keyboard!: KeyboardInput;
  private touch!: TouchInput;
  private readonly sfx = new ClimbSfx();
  private readonly probe = new ClimbGrabSpot();
  private readonly handlers: ClimbEventHandlers;
  private lastFrame = 0;
  private countLeft = 0;
  private warmed = false;
  private freshBest = false;
  private frame = 0;
  private portalHint = "";
  private shownStage = -1;

  constructor(private readonly libs: ThreeLibs) {
    this.handlers = {
      jump: () => this.sfx.play("jump"),
      land: (e) => { if (e.drop > 1.2) this.sfx.play("land"); },
      pad: () => this.sfx.play("pad"),
      grab: () => this.sfx.play("grab"),
      hop: () => this.sfx.play("grab"),
      launch: (e) => { this.sfx.play("launch"); this.hud.banner("발사! 힘 " + Math.round(e.power * 100) + "%", false, 1.2); },
      cannonLand: (e) => { if (e.hit) this.hud.banner("발사대 성공!", true, 2); },
      fellHome: () => this.fell(),
      voidReturn: () => this.fell(),
      stageClear: (e) => this.cleared(e.stage),
      portalEnter: () => this.sfx.play("portal"),
      portalArrive: (e) => { this.view.avatar.playOnce("Spawn_Air", 0.7); this.hud.banner("스테이지 " + e.stage + " 시작점", false, 2); },
    };
    this.boot().catch((error) => { ClimbDom.el("loading").textContent = "불러오기 실패: " + error; });
  }

  private async boot(): Promise<void> {
    const assets = new CharacterAssets(this.libs);
    await assets.load();
    const library = new ClimbModelLibrary(this.libs);
    await library.load(assets.clips);
    const factory = new CharacterModelFactory(this.libs, assets);
    this.level = new TowerLevel(TowerLevelData.spec());
    this.startPanel = new ClimbStartPanel();
    this.records = new ClimbRecords(() => this.recordsChanged());
    this.progress = new StageProgress(this.records.best.s);
    this.rules = new ClimbRules(this.level, this.progress);
    const touchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    this.view = new ClimbWorldView(this.libs, ClimbDom.el<HTMLCanvasElement>("view"), library, factory, this.level, touchDevice, () => this.state === "play");
    const profile = new PlayerProfile();
    this.view.avatar.wear(profile.look);
    profile.onChange(() => this.view.avatar.wear(profile.look));
    new ProfileEditor(this.libs, factory, assets, profile).mount(ClimbDom.el("profileHost"));
    FoldCard.bindAll(document);
    this.hud = new ClimbHud(this.level);
    const zone = ClimbDom.el("touchZone");
    this.keyboard = new KeyboardInput();
    this.touch = new TouchInput(zone, ClimbDom.el("joyBase"), ClimbDom.el("joyKnob"), ClimbDom.el("btnJump"), ClimbDom.el("btnSlow"), ClimbDom.el("btnGrab"), ClimbDom.el("btnPause"));
    for (const input of [this.keyboard, this.touch]) {
      input.onJump = () => this.rules.pressJump();
      input.onGrab = () => this.rules.pressGrab();
      input.onPause = () => this.pause();
    }
    this.keyboard.onPauseKey = () => this.togglePause();
    if (touchDevice) document.body.classList.add("touch");
    ClimbDom.el("btnStart").addEventListener("click", () => this.startRun());
    ClimbDom.el("btnResume").addEventListener("click", () => this.resume());
    ClimbDom.el("btnRestart").addEventListener("click", () => this.startRun());
    ClimbDom.el("btnQuit").addEventListener("click", () => this.showMenu());
    this.view.portals.sync(this.progress);
    this.view.quality.restore();
    ClimbDom.el("loading").hidden = true;
    this.showMenu();
    requestAnimationFrame((now) => this.loop(now));
  }

  private recordsChanged(): void {
    this.startPanel.paint(this.records);
    if (!this.progress || this.records.best.s <= this.progress.cleared) return;
    this.progress.cleared = this.records.best.s;
    this.view.portals.sync(this.progress);
  }

  private setInputs(enabled: boolean): void {
    for (const input of [this.keyboard, this.touch]) { input.enabled = enabled; if (!enabled) input.release(); }
  }

  private showMenu(): void {
    if (this.state === "play" || this.state === "pause") this.records.submitWorld(Math.floor(this.rules.peak + 1e-6));
    this.state = "menu";
    this.setInputs(false);
    this.hud.showPlay(false);
    ClimbDom.el("pauseBox").hidden = true;
    ClimbDom.el("startScreen").hidden = false;
    this.view.builder.showAround(1);
    this.shownStage = -1;
    this.startPanel.paint(this.records);
  }

  private startRun(): void {
    this.rules = new ClimbRules(this.level, this.progress);
    this.view.rig.reset(0);
    this.freshBest = false;
    this.portalHint = "";
    this.countLeft = TowerClimbGame.COUNTDOWN;
    this.state = "countdown";
    ClimbDom.el("startScreen").hidden = true;
    ClimbDom.el("pauseBox").hidden = true;
    this.hud.showPlay(true);
    this.hud.banner("", false, 0);
    this.setInputs(false);
  }

  private pause(): void {
    if (this.state !== "play") return;
    this.state = "pause";
    this.setInputs(false);
    ClimbDom.el("pauseBox").hidden = false;
  }

  private togglePause(): void {
    if (this.state === "play") this.pause();
    else if (this.state === "pause") this.resume();
  }

  private resume(): void {
    if (this.state !== "pause") return;
    this.state = "play";
    ClimbDom.el("pauseBox").hidden = true;
    this.setInputs(true);
  }

  private fell(): void {
    this.sfx.play("fall");
    this.hud.banner("떨어졌어요! 처음으로", false, 2.5);
    this.records.submitWorld(Math.floor(this.rules.peak + 1e-6));
  }

  private cleared(stage: number): void {
    this.sfx.play("clear");
    this.records.offerStage(stage);
    if (this.rules.stageOneTime !== null && stage === 1) this.records.offerTime(this.rules.stageOneTime);
    this.view.portals.sync(this.progress);
    this.view.avatar.playOnce("Cheering", 1.6);
    const opened = this.level.hasStage(stage + 1) ? " 포탈 " + (stage + 1) + "가 열렸어요" : "";
    this.hud.banner("스테이지 " + stage + " 클리어!" + opened, true, 4);
    this.records.submitWorld(Math.floor(this.rules.peak + 1e-6));
  }

  private dispatch(events: ClimbEvent[]): void {
    for (const event of events) {
      const handler = this.handlers[event.t] as ((e: ClimbEvent) => void) | undefined;
      if (handler) handler(event);
    }
  }

  private steer(dt: number): void {
    const rig = this.view.rig;
    this.keyboard.advance(dt);
    const moveX = Math.max(-1, Math.min(1, this.keyboard.moveX + this.touch.moveX)), moveY = Math.max(-1, Math.min(1, this.keyboard.moveY + this.touch.moveY));
    this.rules.steer(rig.rightX * moveX + rig.forwardX * moveY, rig.rightZ * moveX + rig.forwardZ * moveY);
    this.rules.holdSlow(this.keyboard.slowHeld || this.touch.slowHeld);
    rig.turn(this.keyboard.takeLookX() + this.touch.takeLookX(), this.keyboard.takeLookY() + this.touch.takeLookY());
  }

  private hints(): void {
    const body = this.rules.body;
    this.hud.grabHint(body.mode === "free" && body.grabCooldown <= 0 && this.rules.grab.findFor(body, this.probe), body.hanging && body.spot.ledge);
    const hint = this.view.portals.hintNear(body.x, body.y, body.z, this.progress);
    if (hint !== this.portalHint) { this.portalHint = hint; if (hint) this.hud.banner(hint, false, 3); }
    const stage = Math.max(1, this.level.stageAt(body.y).index);
    if (stage !== this.shownStage) { this.shownStage = stage; this.view.builder.showAround(stage); }
  }

  private playFrame(dt: number): void {
    this.steer(dt);
    this.dispatch(this.rules.advance(dt));
    this.sfx.rate = this.rules.time.active ? 0.6 : 1;
    if (this.records.offerHeight(Math.floor(this.rules.peak + 1e-6))) this.freshBest = true;
    if (this.frame % TowerClimbGame.HINT_EVERY === 0) this.hints();
  }

  private countdownFrame(dt: number): void {
    if (!this.warmed) { this.warmed = true; this.view.warmUp(this.progress); }
    this.countLeft -= dt;
    this.hud.countdown(this.countLeft > 0 ? String(Math.ceil(this.countLeft)) : "");
    if (this.countLeft > 0) return;
    this.state = "play";
    this.setInputs(true);
  }

  private loop(now: number): void {
    requestAnimationFrame((next) => this.loop(next));
    const dt = Math.min(TowerClimbGame.MAX_FRAME, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.frame++;
    const view = this.view;
    if (this.state === "menu") { view.backdrop.update(dt); view.portals.update(dt); view.render(); return; }
    if (this.state === "countdown") this.countdownFrame(dt);
    else if (this.state === "play") this.playFrame(dt);
    const still = this.state === "pause" ? 0 : dt;
    view.avatar.follow(this.rules, still);
    view.rig.follow(this.rules, view.avatar.root.position, still);
    view.portals.update(still * this.rules.time.scale);
    this.hud.update(this.rules, this.records, this.freshBest, still);
    view.render();
    view.quality.update(dt);
  }
}
