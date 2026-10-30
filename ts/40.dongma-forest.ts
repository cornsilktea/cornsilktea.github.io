class FrMenuBackdrop {
  private readonly avatars: Array<{ avatar: FrAvatar; radius: number; speed: number; phase: number }> = [];
  private angle = 0;
  private running = false;

  constructor(private readonly libs: ThreeLibs, private readonly view: FrWorldView, factory: CharacterModelFactory, clips: Map<string, Three<"AnimationClip">>, private readonly center: FrPoint) {
    [0, 3, 6, 9].forEach((type, i) => {
      const model = factory.build(CharacterLooks.clean({ ...CharacterLooks.createDefault(), c: type }));
      const avatar = new FrAvatar(libs, model, clips);
      avatar.play("walk");
      this.avatars.push({ avatar, radius: 6 + i * 1.6, speed: 0.22 + i * 0.05, phase: i * 1.7 });
      view.scene.add(avatar.group);
    });
  }

  start(): void { this.running = true; this.avatars.forEach((a) => { a.avatar.group.visible = true; }); }

  stop(): void {
    this.running = false;
    this.avatars.forEach((a) => { a.avatar.group.visible = false; });
  }

  update(dt: number, terrain: FrTerrainData): void {
    if (!this.running) return;
    this.angle += dt * 0.1;
    const B = FrTerrainData.BLOCK;
    const cx = (this.center.x + 0.5) * B, cz = (this.center.z + 0.5) * B;
    this.avatars.forEach((a) => {
      a.phase += dt * a.speed;
      const x = cx + Math.cos(a.phase) * a.radius, z = cz + Math.sin(a.phase) * a.radius;
      a.avatar.group.position.set(x, terrain.surfaceY(terrain.cellOf(x), terrain.cellOf(z)), z);
      a.avatar.group.rotation.y = Math.atan2(-Math.sin(a.phase), Math.cos(a.phase));
      a.avatar.update(dt);
    });
    const camera = this.view.rig.camera;
    camera.position.set(cx + Math.cos(this.angle) * 24, 15, cz + Math.sin(this.angle) * 24);
    camera.lookAt(cx, 2, cz);
  }
}

class FrStartScreen {
  private readonly screen = FrDom.el("startScreen");
  private readonly codeCard = FrDom.el("codeCard");
  private readonly codeInput = FrDom.el<HTMLInputElement>("codeInput");
  private readonly codeMessage = FrDom.el("codeMsg");
  private readonly enterButton = FrDom.el<HTMLButtonElement>("btnEnter");
  private readonly enterMessage = FrDom.el("enterMsg");

  onCode: (code: string) => void = () => undefined;
  onEnter: () => void = () => undefined;

  constructor() {
    FrDom.el("btnCode").addEventListener("click", () => this.onCode(this.codeInput.value));
    this.codeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") this.onCode(this.codeInput.value); });
    this.enterButton.addEventListener("click", () => this.onEnter());
  }

  show(): void { this.screen.hidden = false; }
  hide(): void { this.screen.hidden = true; }
  showCode(visible: boolean): void { this.codeCard.hidden = !visible; }
  codeMessageText(text: string): void { this.codeMessage.textContent = text; }
  enter(ready: boolean, text: string): void { this.enterButton.disabled = !ready; this.enterMessage.textContent = text; }
}

class FrStatusSummary {
  static line(session: FrSession): string {
    const gear = session.bag.slots.filter((s) => s.id.indexOf("gear_") === 0).length;
    return "장비 " + gear + "개 · 먹어 본 재료 " + session.seen.size + "종 · 행동력 최대 " + session.ap.max();
  }
}

class FrGame {
  private static readonly CODE_PATTERN_HINT = "섬 코드를 입력해 주세요.";
  private readonly touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  private readonly random = new FrRandom(Date.now() >>> 0);
  private readonly toast: FrToast;
  private readonly mini = new FrMiniGameView();
  private readonly windows = new FrWindows();
  private readonly start = new FrStartScreen();
  private terrainFile!: FrTerrainFile;
  private assets!: CharacterAssets;
  private factory!: CharacterModelFactory;
  private clips = new Map<string, Three<"AnimationClip">>();
  private backend: FrBackend = new FrLocalBackend(false);
  private uid = "local";
  private profile!: PlayerProfile;
  private view!: FrWorldView;
  private backdrop!: FrMenuBackdrop;
  private join!: FrIslandJoin;
  private world: FrWorld | null = null;
  private session: FrSession | null = null;
  private clock: FrClockSync | null = null;
  private save: FrAccountSave | null = null;
  private player: FrPlayerBody | null = null;
  private avatar: FrAvatar | null = null;
  private finder: FrTargetFinder | null = null;
  private outcome: FrTaskOutcome | null = null;
  private hud: FrStatusHud | null = null;
  private hotbar: FrHotbar | null = null;
  private input: FrInput;
  private bagWindow: FrBagWindow | null = null;
  private chestWindow: FrChestWindow | null = null;
  private craftWindow: FrCraftWindow | null = null;
  private cookWindow: FrCookWindow | null = null;
  private buildWindow: FrBuildWindow | null = null;
  private playing = false;
  private currentTask: { target: FrTarget; task: FrTask; game: FrMiniGame } | null = null;
  private target: FrTarget | null = null;
  private lastDay = 0;
  private lastSnowCheck = 0;
  private lastTime = 0;
  private busy = false;

  constructor(private readonly libs: ThreeLibs) {
    this.toast = new FrToast(FrDom.el("toast"));
    this.input = new FrInput(FrDom.el("joyBase"), FrDom.el("joyKnob"), FrDom.el("btnAction"), {
      press: () => this.press(),
      release: () => this.release(),
      key: (code) => this.key(code),
    });
    this.boot().catch((error) => { FrDom.el("loading").textContent = "불러오기 실패: " + error; });
  }

  private async boot(): Promise<void> {
    this.terrainFile = (await (await fetch("assets/forest/island-terrain.json?v=1")).json()) as FrTerrainFile;
    this.assets = new CharacterAssets(this.libs);
    const tools = new FrToolClips(this.libs);
    await Promise.all([this.assets.load(), tools.load()]);
    this.assets.clips.forEach((clip, name) => this.clips.set(name, clip));
    tools.clips.forEach((clip, name) => this.clips.set(name, clip));
    this.factory = new CharacterModelFactory(this.libs, this.assets);
    this.profile = new PlayerProfile();
    const editor = new ProfileEditor(this.libs, this.factory, this.assets, this.profile);
    editor.mount(FrDom.el("profileHost"));
    FoldCard.bindAll(document);
    const preview = new FrWorld("preview", new FrTerrainData(this.terrainFile), new FrLocalBackend(false));
    this.view = new FrWorldView(this.libs, FrDom.el<HTMLCanvasElement>("view"), preview, this.touch);
    this.backdrop = new FrMenuBackdrop(this.libs, this.view, this.factory, this.clips, preview.terrain.anchors.campfire);
    this.backdrop.start();
    this.view.applyClock(FrBalance.DAWN_MINUTE + 240);
    const user = await FrIdentity.ready(location.search);
    if (!user && FrIdentity.required(location.search)) { this.start.enter(false, "로그인이 필요해요. 새로 고침해 주세요."); return; }
    this.uid = user ? user.uid : "local";
    this.backend = FrBackendChooser.choose();
    this.join = new FrIslandJoin(this.backend, this.uid, location.search);
    this.start.onCode = (code) => void this.submitCode(code);
    this.start.onEnter = () => this.enterGame();
    FrDom.el("loading").hidden = true;
    this.start.show();
    this.start.enter(false, "섬을 찾는 중…");
    requestAnimationFrame((t) => this.loop(t));
    await this.resolveHome();
  }

  private async resolveHome(): Promise<void> {
    let home = await this.join.existingHome();
    if (!home) {
      const automatic = FrIslandLink.autoIsland(location.search);
      if (automatic) home = (await this.join.joinAutomatically(automatic)).island;
    }
    if (!home) {
      this.start.showCode(true);
      this.start.codeMessageText(FrGame.CODE_PATTERN_HINT);
      this.start.enter(false, "먼저 섬 코드를 입력해 주세요");
      return;
    }
    this.start.showCode(false);
    await this.prepareIsland(home);
  }

  private async submitCode(code: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const result = await this.join.joinWithCode(code);
      this.start.codeMessageText(result.message);
      if (result.island) { this.start.showCode(false); await this.prepareIsland(result.island); }
    } catch (error) {
      this.start.codeMessageText("연결에 실패했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      this.busy = false;
    }
  }

  private async prepareIsland(island: string): Promise<void> {
    this.start.enter(false, "섬을 불러오는 중…");
    const world = new FrWorld(island, new FrTerrainData(this.terrainFile), this.backend);
    await world.load();
    const clock = new FrClockSync(this.backend, island, this.uid);
    await clock.join();
    world.syncSnow(clock.day());
    const user = window.PORTAL_USER;
    const nick = user && user.nick ? user.nick : this.profile.nickOrDefault();
    const session = new FrSession(world, this.uid, nick);
    const save = new FrAccountSave(this.backend, this.uid);
    session.restore(await save.load());
    this.view.useWorld(world);
    this.world = world;
    this.clock = clock;
    this.session = session;
    this.save = save;
    this.finder = new FrTargetFinder(world);
    this.outcome = new FrTaskOutcome(session, world, this.random, clock);
    this.buildWindows(session);
    session.onChange(() => { save.queue(session.toSave()); this.refreshHud(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) void save.flush(); });
    this.start.enter(true, "섬: " + island + " · " + FrStatusSummary.line(session));
  }

  private buildWindows(session: FrSession): void {
    this.bagWindow = this.windows.register(new FrBagWindow(session, this.toast));
    this.chestWindow = this.windows.register(new FrChestWindow(session, this.toast));
    this.craftWindow = this.windows.register(new FrCraftWindow(session, this.toast));
    this.cookWindow = this.windows.register(new FrCookWindow(session, this.toast));
    this.buildWindow = this.windows.register(new FrBuildWindow(session, this.toast));
  }

  private enterGame(): void {
    if (!this.world || !this.session || !this.clock) return;
    this.backdrop.stop();
    this.start.hide();
    FrDom.el("hud").hidden = false;
    FrDom.el("controls").hidden = false;
    const player = new FrPlayerBody(this.world);
    const spawn = this.world.terrain.anchors.plaza;
    player.place(spawn.x, spawn.z + 3);
    this.player = player;
    const avatar = new FrAvatar(this.libs, this.factory.build(this.profile.look), this.clips);
    this.avatar = avatar;
    this.view.attachAvatar(avatar);
    this.hud = new FrStatusHud();
    this.hotbar = new FrHotbar(this.session, (slot) => this.useHotbar(slot));
    FrDom.el("btnBag").addEventListener("click", () => this.toggleBag());
    FrDom.el("btnSleep").addEventListener("click", () => void this.toggleSleep());
    this.view.rig.snap(new this.libs.THREE.Vector3(player.x, player.y, player.z));
    this.lastDay = this.clock.day();
    this.input.enabled = true;
    this.playing = true;
    this.refreshHud();
    this.toast.show("모닥불 옆 큰 상자와 나무를 찾아보세요. 나무를 베어 목재를 모으면 작업대를 지을 수 있어요.", 4200);
  }

  private refreshHud(): void {
    if (!this.session || !this.hud || !this.hotbar) return;
    this.hud.showAp(this.session.ap);
    this.hotbar.render();
  }

  private press(): void {
    if (!this.playing || !this.session) return;
    if (this.currentTask) { this.currentTask.game.press(); return; }
    if (this.windows.anyOpen() || this.session.sleeping || !this.target) return;
    this.act(this.target);
  }

  private release(): void {
    if (this.currentTask) this.currentTask.game.release();
  }

  private key(code: string): void {
    if (!this.playing) return;
    if (code === "Escape") { this.windows.closeAll(); this.cancelTask(); return; }
    if (code === "KeyI") { this.toggleBag(); return; }
    if (code === "KeyZ") { void this.toggleSleep(); return; }
    if (code.indexOf("Digit") === 0) { const n = Number(code.slice(5)); if (n >= 1 && n <= FrBalance.HOTBAR_SLOTS) this.useHotbar(n - 1); }
  }

  private toggleBag(): void {
    if (!this.bagWindow) return;
    if (this.bagWindow.isOpen) this.bagWindow.close(); else this.windows.openOnly(this.bagWindow);
  }

  private useHotbar(slot: number): void {
    const item = this.session ? this.session.bag.slots[slot] : undefined;
    if (!this.session || !item) return;
    if (FrFoodRules.canEat(item.id)) this.toast.show(this.session.eat(item.id) ? "냠냠! 행동력이 찼어요" : "행동력이 가득해요");
    else this.toast.show(FrItemNames.label(item.id));
  }

  private act(target: FrTarget): void {
    if (!this.session) return;
    if (target.kind === "cook" && this.cookWindow) { this.windows.openOnly(this.cookWindow); return; }
    if (target.kind === "chest" && this.chestWindow) { this.windows.openOnly(this.chestWindow); return; }
    if (target.kind === "site" && target.site) { this.openSite(target.site); return; }
    const task = FrTasks.forTarget(target.kind);
    if (task) this.startTask(target, task);
  }

  private openSite(site: FrBuildSite): void {
    if (!this.world || !this.craftWindow || !this.buildWindow) return;
    if (this.world.village.builtCount(site.id) > 0) { this.windows.openOnly(this.craftWindow); return; }
    const def = FrVillage.definition(site.id);
    this.windows.closeAll();
    this.buildWindow.openFor(def);
  }

  private startTask(target: FrTarget, task: FrTask): void {
    if (!this.session || !this.player) return;
    if (!this.session.ap.canSpend(task.apCost)) { this.toast.show("행동력이 모자라요. 음식을 먹거나 밤에 잠을 자요."); return; }
    const tier = this.session.bag.bestTier(task.toolKind);
    const game = FrMiniGameFactory.create(task.kind, tier);
    if (!game) { this.toast.show(task.missingTool || "도구가 필요해요"); return; }
    if (target.cell) {
      const B = FrTerrainData.BLOCK;
      this.player.facing = Math.atan2((target.cell.x + 0.5) * B - this.player.x, (target.cell.z + 0.5) * B - this.player.z);
    }
    this.currentTask = { target, task, game };
    this.mini.show(task.label, game);
    if (this.avatar) this.avatar.play(task.clip);
    game.press();
  }

  private cancelTask(): void {
    if (!this.currentTask) return;
    this.currentTask = null;
    this.mini.hide();
  }

  private async finishTask(): Promise<void> {
    const current = this.currentTask;
    if (!current || !this.outcome) return;
    this.currentTask = null;
    this.mini.hide();
    if (current.game.state !== "success") return;
    const message = await this.outcome.finish(current.target, current.task);
    if (message) this.toast.show(message);
  }

  private presences(): FrPresence[] {
    if (!this.session) return [];
    return [{ uid: this.uid, name: this.session.nick, area: this.session.area, sleeping: this.session.sleeping, actedToday: true }];
  }

  private async toggleSleep(): Promise<void> {
    if (!this.session || !this.clock) return;
    if (this.session.sleeping) { this.session.sleeping = false; this.toast.show("일어났어요"); return; }
    if (!FrSleepVote.canSleep(this.clock.minuteOfDay(), this.session.area)) return;
    this.cancelTask();
    this.windows.closeAll();
    this.session.sleeping = true;
    if (FrSleepVote.allAsleep(this.presences())) {
      await this.clock.skipToMorning();
      this.session.ap.fill();
      this.session.sleeping = false;
      this.session.changed();
      this.toast.show("좋은 아침이에요! 행동력이 가득 찼어요");
    }
  }

  private frame(dt: number, time: number): void {
    const session = this.session, clock = this.clock, player = this.player, world = this.world;
    if (!this.playing || !session || !clock || !player || !world || !this.hud || !this.avatar || !this.finder) return;
    const direction = this.input.direction();
    const blocked = this.windows.anyOpen() || session.sleeping || this.currentTask !== null;
    if (this.currentTask && Math.hypot(direction.x, direction.z) > 0.4) this.cancelTask();
    const shoes = FrBalance.SHOES_SPEED[session.bag.bestTier("shoes")];
    player.step(blocked ? { x: 0, z: 0 } : direction, dt, shoes);
    this.avatar.group.position.set(player.x, player.y, player.z);
    this.avatar.group.rotation.y = player.facing;
    if (session.sleeping) this.avatar.play("sleep");
    else if (this.currentTask) this.avatar.play(this.currentTask.task.clip);
    else this.avatar.play(player.moving ? (player.swimming ? "walk" : "run") : "idle");
    this.view.rig.follow(new this.libs.THREE.Vector3(player.x, player.y, player.z), dt);
    this.view.fadeTreesAround(player.cell());
    this.target = blocked ? null : this.finder.find(player);
    this.view.setMarker(this.target && this.target.cell ? this.target.cell : null);
    this.input.setActionLabel(this.target ? this.target.label : "·");
    if (this.currentTask) {
      this.currentTask.game.tick(dt);
      this.mini.update();
      if (this.currentTask.game.state !== "running" && this.currentTask.game.state !== "waiting") void this.finishTask();
    }
    const minute = clock.minuteOfDay();
    const day = clock.day();
    this.view.applyClock(minute);
    this.hud.showClock(minute, day);
    this.hud.showArea("마을");
    this.hud.showSleepButton(FrSleepVote.canSleep(minute, session.area) && !this.currentTask, session.sleeping);
    this.hud.showSleepBand(FrClock.isNight(minute) ? FrSleepVote.banner(this.presences()) : "");
    if (day !== this.lastDay) this.onNewDay(day);
    if (time - this.lastSnowCheck > 1) { this.lastSnowCheck = time; world.syncSnow(day); void clock.heartbeat(); }
  }

  private onNewDay(day: number): void {
    this.lastDay = day;
    if (this.session && this.session.sleeping) {
      this.session.ap.current = FrSleepVote.morningActionPoints(true, false, this.session.ap.current, this.session.ap.max());
      this.session.sleeping = false;
      this.session.changed();
      this.toast.show("아침이 밝았어요");
    }
  }

  private loop(milliseconds: number): void {
    const time = milliseconds / 1000;
    const dt = Math.min(0.05, this.lastTime ? time - this.lastTime : 0.016);
    this.lastTime = time;
    if (this.playing) this.frame(dt, time);
    else this.backdrop.update(dt, this.view.terrainData());
    this.view.render(dt, time);
    requestAnimationFrame((t) => this.loop(t));
  }
}
