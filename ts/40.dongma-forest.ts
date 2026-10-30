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
  private roster = new FrRoster();
  private hub: FrSyncHub | null = null;
  private adminNode = new FrAdminNode();
  private presencePublisher: FrPresencePublisher | null = null;
  private posePublisher: FrPosePublisher | null = null;
  private remotes: FrRemoteAvatars | null = null;
  private labels!: RkLabelFactory;
  private actedDay = 0;
  private lastSleepCheck = 0;
  private island = "";
  private adminWindow: FrAdminWindow | null = null;
  private fade!: FrFade;
  private levelPick: number | null = null;
  private rotation = 0;
  private morningPending = false;

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
    this.labels = new RkLabelFactory(this.libs);
    this.fade = new FrFade(FrDom.el("fade"));
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
    if (FrBoardPage.requested(location.search)) {
      this.start.hide();
      this.backdrop.stop();
      FrDom.el("view").hidden = true;
      await new FrBoardPage(this.backend, this.terrainFile, this.uid).start(FrBoardPage.islandsFor(location.search));
      return;
    }
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
    if (this.isAdmin()) {
      const chosen = this.islandParam() || (await this.join.existingHome()) || FrIslandLink.TEST_ISLAND;
      this.start.showCode(false);
      await this.prepareIsland(chosen);
      return;
    }
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
    const account = window.PORTAL_USER;
    const session = new FrSession(world, this.uid, nick, FrMemberWriter.numberFor(this.uid, account ? account.name : ""));
    session.admin = this.isAdmin();
    const save = new FrAccountSave(this.backend, this.uid);
    session.restore(await save.load());
    this.view.useWorld(world);
    this.view.setLabels(this.labels, this.uid);
    this.world = world;
    this.clock = clock;
    this.session = session;
    this.save = save;
    this.finder = new FrTargetFinder(world);
    this.outcome = new FrTaskOutcome(session, world, this.random, clock);
    this.island = island;
    this.startSync(world, clock, island);
    this.buildWindows(session);
    if (this.isAdmin()) {
      const panel = this.windows.register(new FrAdminWindow(session, this.toast, new FrAdminTools(this.backend, island, clock, world), this.roster, this.adminNode, clock, island));
      panel.focus = () => (this.player ? this.player.cell() : null);
      this.adminWindow = panel;
    }
    session.onChange(() => { save.queue(session.toSave()); this.refreshHud(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) void save.flush(); });
    this.start.enter(true, "섬: " + island + " · " + FrStatusSummary.line(session));
  }

  private startSync(world: FrWorld, clock: FrClockSync, island: string): void {
    if (this.hub) this.hub.close();
    this.roster = new FrRoster();
    this.roster.serverNow = () => clock.serverNow();
    this.adminNode = new FrAdminNode();
    this.adminNode.selfUid = this.uid;
    this.adminNode.onNotice = (text) => this.toast.show("공지: " + text, 10000);
    this.adminNode.onCommand = (uid, type) => { this.runCommand(type); void this.backend.set("forest/" + island + "/admin/cmd/" + uid, null); };
    const hub = new FrSyncHub();
    hub.register("jungle", new FrJungleNode(world));
    hub.register("blocks", new FrBlocksNode(world));
    hub.register("lots", new FrLotsNode(world));
    hub.register("terrain", new FrTerrainNode(world));
    hub.register("snow", new FrSnowNode(world));
    hub.register("build", new FrBuildNode(world));
    hub.register("public", new FrPublicNode(world));
    hub.register("publicLog", new FrLogNode(world));
    hub.register("clock", new FrClockNode(clock));
    hub.register("members", new FrMembersNode(this.roster));
    hub.register("presence", new FrPresenceNode(this.roster));
    hub.register("pos", new FrPoseNode(this.roster));
    hub.register("admin", this.adminNode);
    hub.start(this.backend, island);
    this.hub = hub;
    clock.onSkipped = () => this.onSkipped();
    this.presencePublisher = new FrPresencePublisher(this.backend, island, this.uid);
    this.posePublisher = new FrPosePublisher(this.backend, island, this.uid);
  }

  private runCommand(type: string): void {
    if (!this.player || !this.world) return;
    if (type === "plaza") {
      const plaza = this.world.terrain.anchors.plaza;
      this.player.place(plaza.x, plaza.z + 3);
      this.cancelTask();
      this.toast.show("선생님이 광장으로 옮겼어요");
    } else if (type === "wake" && this.session) {
      this.session.sleeping = false;
      void this.fade.lift(900);
      this.toast.show("선생님이 깨웠어요");
    }
  }

  private onSkipped(): void {
    if (!this.session || !this.session.sleeping) return;
    this.session.sleeping = false;
    this.session.ap.fill();
    this.session.changed();
    this.fade.snapBlack();
    window.setTimeout(() => {
      void this.fade.lift(2400);
      this.toast.show("좋은 아침이에요! 행동력이 가득 찼어요", 3200);
    }, 700);
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
    const others = this.roster.aliveUids().filter((uid) => uid !== this.uid && !(this.roster.members.get(uid) || { adm: false }).adm).length;
    if (!this.isAdmin() && others >= FrBalance.MAX_ISLAND_PLAYERS) { this.start.enter(false, "이 섬은 " + FrBalance.MAX_ISLAND_PLAYERS + "명이 모두 들어와 있어요. 잠시 뒤 다시 눌러 주세요."); window.setTimeout(() => this.start.enter(true, "다시 들어가 볼까요?"), 4000); return; }
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
    this.remotes = new FrRemoteAvatars(this.libs, this.view.scene, this.factory, this.clips, this.labels, this.roster, this.uid);
    const ownLabel = this.labels.create(this.session.nick, "#FFE2C9");
    ownLabel.scale.set(1.4, 0.35, 1);
    ownLabel.position.y = FrRemoteAvatars.LABEL_HEIGHT;
    avatar.group.add(ownLabel);
    const account = window.PORTAL_USER;
    void new FrMemberWriter(this.backend, this.island).write(this.uid, account ? account.name : "", this.session.nick, this.profile.look, this.isAdmin());
    if (!FrClock.isNight(this.clock.minuteOfDay())) this.actedDay = this.clock.day();
    window.addEventListener("pagehide", () => { if (this.presencePublisher) void this.presencePublisher.leave(); });
    this.hotbar = new FrHotbar(this.session, (slot) => this.useHotbar(slot));
    FrDom.el("btnBag").addEventListener("click", () => this.toggleBag());
    const adminButton = FrDom.el<HTMLButtonElement>("btnAdmin");
    adminButton.hidden = !this.adminWindow;
    adminButton.addEventListener("click", () => this.key("F2"));
    FrDom.el("btnSleep").addEventListener("click", () => void this.toggleSleep());
    this.view.rig.snap(new this.libs.THREE.Vector3(player.x, player.y, player.z));
    this.lastDay = this.clock.day();
    this.view.canvas.addEventListener("click", (event) => this.clickWorld(event.clientX, event.clientY));
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

  private clickWorld(clientX: number, clientY: number): void {
    if (!this.playing || !this.session || !this.player || !this.finder || this.currentTask || this.windows.anyOpen() || this.session.sleeping) return;
    const pick = this.view.pick(clientX, clientY);
    if (!pick) return;
    if (pick.kind === "ground" && pick.cell) {
      const blockTarget = this.finder.blockTarget(pick.cell, this.finderContext());
      const B = FrTerrainData.BLOCK;
      if (blockTarget && Math.hypot(this.player.x - (pick.cell.x + 0.5) * B, this.player.z - (pick.cell.z + 0.5) * B) <= 6) { this.act(blockTarget); return; }
    }
    const result = this.finder.fromPick(pick, this.player);
    if (result.far) { this.toast.show("조금 더 가까이 가서 눌러 주세요"); return; }
    if (!result.target) return;
    if (this.adminNode.state.lock && !this.isAdmin()) { this.toast.show("선생님이 잠시 멈췄어요. 걷기만 할 수 있어요."); return; }
    this.act(result.target);
  }

  private pressFeedback(game: FrMiniGame, hitsBefore: number): void {
    const hitsNow = game instanceof FrCenterStop ? Math.round(game.progress() * game.hitsNeeded) : hitsBefore;
    if (game.state === "fail") this.mini.feedback("miss");
    else if (game instanceof FrCenterStop && hitsNow > hitsBefore) this.mini.feedback("hit");
    else this.mini.feedback("press");
    if (!this.player || !this.currentTask) return;
    const front = this.player.frontCell();
    const B = FrTerrainData.BLOCK;
    this.view.burst.emit((front.x + 0.5) * B, this.player.y + 1.4, (front.z + 0.5) * B, FrTaskColors.of(this.currentTask.task.kind), game.state === "fail" ? 2 : 4, 4);
  }

  private press(): void {
    if (!this.playing || !this.session) return;
    if (this.currentTask) {
      const game = this.currentTask.game;
      const before = game instanceof FrCenterStop ? Math.round(game.progress() * game.hitsNeeded) : 0;
      game.press();
      this.pressFeedback(game, before);
      return;
    }
    if (this.windows.anyOpen() || this.session.sleeping || !this.target) return;
    if (this.adminNode.state.lock && !this.isAdmin()) { this.toast.show("선생님이 잠시 멈췄어요. 걷기만 할 수 있어요."); return; }
    this.act(this.target);
  }

  private release(): void {
    if (this.currentTask) this.currentTask.game.release();
  }

  private key(code: string): void {
    if (!this.playing) return;
    if (code === "Escape") { this.windows.closeAll(); this.cancelTask(); return; }
    if (code === "KeyI") { this.toggleBag(); return; }
    if (code === "KeyR") { this.adjustLevel(1); return; }
    if (code === "KeyF") { this.adjustLevel(-1); return; }
    if (code === "KeyT") { this.rotation = (this.rotation + 1) % 4; this.toast.show("블록을 돌렸어요"); return; }
    if (code === "KeyZ") { void this.toggleSleep(); return; }
    if (code === "F2" && this.adminWindow) { if (this.adminWindow.isOpen) this.adminWindow.close(); else this.windows.openOnly(this.adminWindow); return; }
    if (code.indexOf("Digit") === 0) { const n = Number(code.slice(5)); if (n >= 1 && n <= FrBalance.HOTBAR_SLOTS) this.useHotbar(n - 1); }
  }

  private toggleBag(): void {
    if (!this.bagWindow) return;
    if (this.bagWindow.isOpen) this.bagWindow.close(); else this.windows.openOnly(this.bagWindow);
  }

  private useHotbar(slot: number): void {
    if (!this.session) return;
    const item = this.session.bag.slots[slot];
    const already = this.session.selected === slot;
    this.session.selected = slot;
    this.levelPick = null;
    this.session.changed();
    if (!item) return;
    if (already && FrFoodRules.canEat(item.id)) this.toast.show(this.session.eat(item.id) ? "냠냠! 행동력이 찼어요" : "행동력이 가득해요");
    else if (item.id.indexOf("block_") === 0) this.toast.show(FrItemNames.label(item.id) + " — 앞 칸에 놓아요 (R/F 높이, T 돌리기)");
    else this.toast.show(FrItemNames.label(item.id) + (FrFoodRules.canEat(item.id) ? " — 한 번 더 누르면 먹어요" : ""));
  }

  private finderContext(): FrFinderContext {
    const session = this.session as FrSession;
    const bodies: FrPoint[] = [];
    this.roster.aliveUids().forEach((uid) => {
      const pose = this.roster.poses.get(uid);
      if (pose && uid !== this.uid) bodies.push({ x: Math.floor(pose.x / FrTerrainData.BLOCK), z: Math.floor(pose.z / FrTerrainData.BLOCK) });
    });
    if (this.player) bodies.push(this.player.cell());
    return { held: session.heldBlock(), me: session.player(), bodies, levelPick: this.levelPick, rotation: this.rotation };
  }

  private adjustLevel(direction: number): void {
    if (!this.player || !this.world || !this.session || !this.session.heldBlock()) return;
    const front = this.player.frontCell();
    const current = FrBlockRules.chooseLevel(this.world, front.x, front.z, this.levelPick);
    this.levelPick = FrBlockRules.stepLevel(this.world, front.x, front.z, current, direction);
  }

  private async placeHere(target: FrTarget): Promise<void> {
    if (!this.session || !this.world || !target.plan || !target.check) return;
    if (!target.check.ok) { this.toast.show(target.check.reason); return; }
    const plan = target.plan;
    const ok = await this.world.placeBlock(plan.x, plan.z, plan.y, plan.t, plan.r, this.session.player());
    if (!ok) { this.toast.show("다른 친구가 먼저 놓았어요"); return; }
    this.session.bag.take(plan.t, 1);
    this.levelPick = null;
    this.session.changed();
    const B = FrTerrainData.BLOCK;
    this.view.burst.emit((plan.x + 0.5) * B, this.world.terrain.surfaceY(plan.x, plan.z) + plan.y * B + 1, (plan.z + 0.5) * B, [0xffffff, 0xd9d2c0], 6, 3);
  }

  private async removeHere(target: FrTarget): Promise<void> {
    if (!this.session || !this.world || !target.cell || target.removeY === undefined) return;
    const record = this.world.blocks.get(this.world.terrain.index(target.cell.x, target.cell.z), target.removeY);
    if (!record) return;
    const mine = record.n === this.session.no;
    if (mine && this.session.bag.freeSlots() < 1 && this.session.bag.count(record.t) % FrBalance.STACK_SIZE === 0) { this.toast.show("가방이 가득 찼어요"); return; }
    const removed = await this.world.removeBlock(target.cell.x, target.cell.z, target.removeY, this.session.player());
    if (!removed) return;
    if (mine) this.session.gain(removed.t, 1);
    const B = FrTerrainData.BLOCK;
    this.view.burst.emit((target.cell.x + 0.5) * B, this.world.terrain.surfaceY(target.cell.x, target.cell.z) + target.removeY * B + 1, (target.cell.z + 0.5) * B, [0xffffff, 0xb0a890], 6, 3);
  }

  private async claimLot(index: number): Promise<void> {
    if (!this.session || !this.world) return;
    const ok = await this.world.claimLot(index, { uid: this.uid, no: this.session.no, name: this.session.nick });
    this.toast.show(ok ? "내 집터로 정했어요! 블록으로 마음껏 지어요" : "그 집터는 이미 임자가 있어요");
  }

  private async buildHouse(index: number): Promise<void> {
    if (!this.session || !this.world) return;
    const source = this.session.craftSource();
    if (!source.canPay(FrHouseKit.COST)) { this.toast.show("재료가 모자라요: 목재 30 · 돌 20 · 노끈 10"); return; }
    const anchor = this.world.terrain.anchors.lots[index];
    source.pay(FrHouseKit.COST);
    await this.world.placeMany(FrHouseKit.blueprint(anchor), this.session.player());
    this.session.changed();
    this.toast.show("작은 집이 지어졌어요! 블록을 바꿔 꾸며 보세요", 3500);
  }

  private act(target: FrTarget): void {
    if (!this.session) return;
    if (target.kind === "cook" && this.cookWindow) { this.windows.openOnly(this.cookWindow); return; }
    if (target.kind === "chest" && this.chestWindow) { this.windows.openOnly(this.chestWindow); return; }
    if (target.kind === "site" && target.site) { this.openSite(target.site); return; }
    if (target.kind === "place") { void this.placeHere(target); return; }
    if (target.kind === "remove") { void this.removeHere(target); return; }
    if (target.kind === "lot" && target.lot !== undefined) { void this.claimLot(target.lot); return; }
    if (target.kind === "house" && target.lot !== undefined) { void this.buildHouse(target.lot); return; }
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
    if (current.game.state !== "success") { this.mini.hide(); return; }
    this.mini.celebrate();
    window.setTimeout(() => { if (!this.currentTask) this.mini.hide(); }, 950);
    if (this.player) {
      const cell = current.target.cell || this.player.frontCell();
      const B = FrTerrainData.BLOCK;
      this.view.burst.emit((cell.x + 0.5) * B, this.view.terrainData().surfaceY(cell.x, cell.z) + 2.2, (cell.z + 0.5) * B, FrTaskColors.success(current.task.kind), 22, 7);
    }
    const message = await this.outcome.finish(current.target, current.task);
    if (message) this.toast.show(message);
  }

  private isAdmin(): boolean {
    const flagged = (window as unknown as { __FOREST_ADMIN__?: boolean }).__FOREST_ADMIN__ === true;
    return flagged || (typeof AccountPolicy !== "undefined" && AccountPolicy.ADMIN_UIDS.indexOf(this.uid) >= 0);
  }

  private islandParam(): string {
    const match = /[?&]island=([^&]+)/.exec(location.search);
    return match ? decodeURIComponent(match[1]) : "";
  }

  private presences(): FrPresence[] {
    if (!this.session || !this.clock) return [];
    const self: FrPresence = { uid: this.uid, name: this.session.nick, area: this.session.area, sleeping: this.session.sleeping, actedToday: true };
    const others = this.roster.asPresences(this.clock.day(), this.uid, self);
    return this.isAdmin() ? others.filter((p) => p.uid !== this.uid) : others;
  }

  private async toggleSleep(): Promise<void> {
    if (!this.session || !this.clock) return;
    if (this.session.sleeping) { this.session.sleeping = false; void this.fade.lift(700); this.toast.show("일어났어요"); await this.publishPresence(true); return; }
    if (!FrSleepVote.canSleep(this.clock.minuteOfDay(), this.session.area)) return;
    this.cancelTask();
    this.windows.closeAll();
    this.session.sleeping = true;
    void this.fade.dim(0.55, 2600);
    await this.publishPresence(true);
    await this.tryMorning();
  }

  private async publishPresence(force: boolean): Promise<void> {
    if (!this.presencePublisher || !this.session) return;
    await this.presencePublisher.publish(this.session.area, this.session.sleeping, this.actedDay, force);
  }

  private async tryMorning(): Promise<void> {
    if (!this.session || !this.clock || !this.session.sleeping || this.morningPending) return;
    if (!FrSleepVote.allAsleep(this.presences())) return;
    this.morningPending = true;
    await this.fade.blackout(1600);
    this.morningPending = false;
    if (!this.session.sleeping) return;
    if (!FrSleepVote.allAsleep(this.presences())) { void this.fade.dim(0.55, 900); return; }
    if (await this.clock.skipToMorning()) this.onSkipped();
  }

  private poseCode(moving: boolean): number {
    if (!this.session || !this.player) return 0;
    if (this.session.sleeping) return 6;
    if (this.currentTask) return FrWire.ANIMS.indexOf(this.currentTask.task.clip);
    return moving ? (this.player.swimming ? 2 : 1) : 0;
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
    if (this.remotes) this.remotes.update(dt);
    if (this.posePublisher) this.posePublisher.send(player.x, player.z, player.y, player.facing, this.poseCode(player.moving), player.vx, player.vz);
    this.target = blocked ? null : this.finder.find(player, this.finderContext());
    const place = this.target && this.target.kind === "place" ? this.target : null;
    if (place && place.plan) this.view.setPreview(place.cell, place.plan.y, !!place.check && place.check.ok);
    else this.view.setPreview(null, 0, true);
    this.view.setMarker(this.target && this.target.cell ? this.target.cell : null);
    this.input.setActionLabel(this.target ? this.target.label : "·");
    if (this.currentTask) {
      this.currentTask.game.tick(dt);
      this.mini.update();
      if (this.currentTask.game.state !== "running" && this.currentTask.game.state !== "waiting") void this.finishTask();
    }
    const minute = clock.minuteOfDay();
    const day = clock.day();
    if (!FrClock.isNight(minute) && (player.moving || this.currentTask !== null)) this.actedDay = day;
    void this.publishPresence(false);
    if (session.sleeping && time - this.lastSleepCheck > 1) { this.lastSleepCheck = time; void this.tryMorning(); }
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
      void this.fade.lift(1800);
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
