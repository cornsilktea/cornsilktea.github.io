"use strict";
class FrMenuBackdrop {
    constructor(libs, view, factory, clips, center) {
        this.libs = libs;
        this.view = view;
        this.center = center;
        this.avatars = [];
        this.angle = 0;
        this.running = false;
        [0, 3, 6, 9].forEach((type, i) => {
            const model = factory.build(CharacterLooks.clean({ ...CharacterLooks.createDefault(), c: type }));
            const avatar = new FrAvatar(libs, model, clips);
            avatar.play("walk");
            this.avatars.push({ avatar, radius: 6 + i * 1.6, speed: 0.22 + i * 0.05, phase: i * 1.7 });
            view.scene.add(avatar.group);
        });
    }
    start() { this.running = true; this.avatars.forEach((a) => { a.avatar.group.visible = true; }); }
    stop() {
        this.running = false;
        this.avatars.forEach((a) => { a.avatar.group.visible = false; });
    }
    update(dt, terrain) {
        if (!this.running)
            return;
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
    constructor() {
        this.screen = FrDom.el("startScreen");
        this.codeCard = FrDom.el("codeCard");
        this.codeInput = FrDom.el("codeInput");
        this.codeMessage = FrDom.el("codeMsg");
        this.enterButton = FrDom.el("btnEnter");
        this.enterMessage = FrDom.el("enterMsg");
        this.onCode = () => undefined;
        this.onEnter = () => undefined;
        FrDom.el("btnCode").addEventListener("click", () => this.onCode(this.codeInput.value));
        this.codeInput.addEventListener("keydown", (event) => { if (event.key === "Enter")
            this.onCode(this.codeInput.value); });
        this.enterButton.addEventListener("click", () => this.onEnter());
    }
    show() { this.screen.hidden = false; }
    hide() { this.screen.hidden = true; }
    showCode(visible) { this.codeCard.hidden = !visible; }
    codeMessageText(text) { this.codeMessage.textContent = text; }
    enter(ready, text) { this.enterButton.disabled = !ready; this.enterMessage.textContent = text; }
}
class FrStatusSummary {
    static line(session) {
        const gear = session.bag.slots.filter((s) => s.id.indexOf("gear_") === 0).length;
        return "장비 " + gear + "개 · 먹어 본 재료 " + session.seen.size + "종 · 행동력 최대 " + session.ap.max();
    }
}
class FrGame {
    constructor(libs) {
        this.libs = libs;
        this.touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
        this.random = new FrRandom(Date.now() >>> 0);
        this.mini = new FrMiniGameView();
        this.windows = new FrWindows();
        this.start = new FrStartScreen();
        this.clips = new Map();
        this.backend = new FrLocalBackend(false);
        this.uid = "local";
        this.slotDrag = null;
        this.mapWindow = null;
        this.hover = new FrHoverCell();
        this.guard = new FrPageGuard();
        this.lastSleepBoard = 0;
        this.world = null;
        this.session = null;
        this.clock = null;
        this.save = null;
        this.player = null;
        this.avatar = null;
        this.finder = null;
        this.outcome = null;
        this.hud = null;
        this.hotbar = null;
        this.bagWindow = null;
        this.chestWindow = null;
        this.personalChestWindow = null;
        this.personalChestCell = null;
        this.craftWindow = null;
        this.cookWindow = null;
        this.ovenWindow = null;
        this.kitchenWindow = null;
        this.forgeWindow = null;
        this.seedWindow = null;
        this.bookWindow = null;
        this.currencyWindow = null;
        this.statsWindow = null;
        this.plantCell = null;
        this.dungeonWindow = null;
        this.fight = null;
        this.monsterAssets = null;
        this.monsterLayer = null;
        this.dungeonData = {};
        this.pendingDifficulty = "normal";
        this.attackUntil = 0;
        this.fightClock = 0;
        this.fightEnding = false;
        this.buildWindow = null;
        this.playing = false;
        this.currentTask = null;
        this.target = null;
        this.lastDay = 0;
        this.lastSnowCheck = 0;
        this.lastTime = 0;
        this.busy = false;
        this.roster = new FrRoster();
        this.hub = null;
        this.adminNode = new FrAdminNode();
        this.presencePublisher = null;
        this.posePublisher = null;
        this.remotes = null;
        this.actedDay = 0;
        this.lastSleepCheck = 0;
        this.island = "";
        this.adminWindow = null;
        this.areaWorld = null;
        this.areaScene = null;
        this.areaFinder = null;
        this.areaOutcome = null;
        this.expedition = null;
        this.beachWorld = null;
        this.mineData = null;
        this.pouchWindow = null;
        this.travelling = false;
        this.levelPick = null;
        this.rotation = 0;
        this.morningPending = false;
        this.toast = new FrToast(FrDom.el("toast"));
        this.input = new FrInput(FrDom.el("joyBase"), FrDom.el("joyKnob"), FrDom.el("btnAction"), {
            press: () => this.press(),
            release: () => this.release(),
            key: (code) => this.key(code),
        });
        this.boot().catch((error) => { FrDom.el("loading").textContent = "불러오기 실패: " + error; });
    }
    async boot() {
        this.terrainFile = (await (await fetch("assets/forest/island-terrain.json?v=1")).json());
        this.mineData = (await (await fetch("assets/forest/mine-cave.json?v=1")).json());
        for (const kind of ["moss", "crystal", "lava"])
            this.dungeonData[kind] = (await (await fetch("assets/forest/dungeon-cave-" + kind + ".json?v=1")).json());
        this.assets = new CharacterAssets(this.libs);
        const tools = new FrToolClips(this.libs);
        this.nature = new FrNatureModels(this.libs);
        await Promise.all([this.assets.load(), tools.load(), this.nature.load()]);
        this.assets.clips.forEach((clip, name) => this.clips.set(name, clip));
        tools.clips.forEach((clip, name) => this.clips.set(name, clip));
        this.factory = new CharacterModelFactory(this.libs, this.assets);
        this.labels = new RkLabelFactory(this.libs);
        this.fade = new FrFade(FrDom.el("fade"));
        this.fishing = new FrFishingScreen(this.random);
        this.monsterAssets = new FrMonsterAssets(this.libs);
        this.profile = new PlayerProfile();
        this.editor = new ProfileEditor(this.libs, this.factory, this.assets, this.profile);
        this.editor.mount(FrDom.el("profileHost"));
        this.editor.setActive(true);
        FoldCard.bindAll(document);
        this.sleepBoard = new FrSleepBoard(() => void this.toggleSleep());
        const preview = new FrWorld("preview", new FrTerrainData(this.terrainFile), new FrLocalBackend(false));
        this.view = new FrWorldView(this.libs, FrDom.el("view"), preview, this.touch, this.nature);
        this.view.onVillageLevel = (level) => this.toast.show("마을이 " + level + "단계 " + FrVillageLevels.label(level) + "이(가) 됐어요!", 3600);
        this.backdrop = new FrMenuBackdrop(this.libs, this.view, this.factory, this.clips, preview.terrain.anchors.campfire);
        this.backdrop.start();
        this.view.applyClock(FrBalance.DAWN_MINUTE + 240);
        const user = await FrIdentity.ready(location.search);
        if (!user && FrIdentity.required(location.search)) {
            FrDom.el("loading").hidden = true;
            this.start.show();
            this.start.enter(false, "로그인이 필요해요. 새로 고침해 주세요.");
            return;
        }
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
    async resolveHome() {
        if (this.isAdmin()) {
            const chosen = this.islandParam() || (await this.join.existingHome()) || FrIslandLink.TEST_ISLAND;
            this.start.showCode(false);
            await this.prepareIsland(chosen);
            return;
        }
        let home = await this.join.existingHome();
        if (!home) {
            const automatic = FrIslandLink.autoIsland(location.search);
            if (automatic)
                home = (await this.join.joinAutomatically(automatic)).island;
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
    async submitCode(code) {
        if (this.busy)
            return;
        this.busy = true;
        try {
            const result = await this.join.joinWithCode(code);
            this.start.codeMessageText(result.message);
            if (result.island) {
                this.start.showCode(false);
                await this.prepareIsland(result.island);
            }
        }
        catch (error) {
            this.start.codeMessageText("연결에 실패했어요. 잠시 뒤 다시 해 주세요.");
        }
        finally {
            this.busy = false;
        }
    }
    async prepareIsland(island) {
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
        save.statsPath = "forest/" + island + "/stats/" + this.uid;
        const loaded = await save.load();
        session.restore(loaded);
        const pouch = FrExpedition.recall(this.uid);
        if (pouch && pouch.lastAt > loaded.lastAt) {
            session.restore(pouch);
            save.queue(session.toSave());
        }
        FrExpedition.clear();
        session.ap.unlimited = session.admin;
        if (loaded.lastAt === 0) {
            for (const id of Object.keys(FrFarmRules.FIRST_SEEDS))
                await world.putPublic(id, FrFarmRules.FIRST_SEEDS[id], nick);
            save.queue(session.toSave());
        }
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
            const panel = this.windows.register(new FrAdminWindow(session, this.toast, new FrAdminTools(this.backend, island, clock, world, nick), this.roster, this.adminNode, clock, island));
            panel.focus = () => (this.player ? this.player.cell() : null);
            panel.travel = (areaId) => this.adminTravel(areaId);
            panel.teleport = (x, z) => { if (this.player && !this.areaWorld)
                this.player.place(x, z); };
            this.adminWindow = panel;
        }
        session.onChange(() => { if (this.expedition)
            this.expedition.remember();
        else
            save.queue(session.toSave()); this.refreshHud(); });
        document.addEventListener("visibilitychange", () => { if (document.hidden)
            void save.flush(); });
        this.start.enter(true, "섬: " + island + " · " + FrStatusSummary.line(session));
    }
    startSync(world, clock, island) {
        if (this.hub)
            this.hub.close();
        this.roster = new FrRoster();
        this.roster.serverNow = () => clock.serverNow();
        this.adminNode = new FrAdminNode();
        this.adminNode.selfUid = this.uid;
        this.adminNode.onNotice = (text) => this.toast.show("공지: " + text, 10000);
        this.adminNode.onCommand = (uid, type, id, n) => { this.runCommand(type, id, n); void this.backend.set("forest/" + island + "/admin/cmd/" + uid, null); };
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
    runCommand(type, id = "", n = 0) {
        if (!this.player || !this.world)
            return;
        if (this.runItemCommand(type, id, n))
            return;
        if (type === "plaza") {
            const plaza = this.world.terrain.anchors.plaza;
            this.player.place(plaza.x, plaza.z + 3);
            this.cancelTask();
            this.toast.show("선생님이 광장으로 옮겼어요");
        }
        else if (type === "wake" && this.session) {
            this.session.sleeping = false;
            void this.fade.lift(900);
            this.toast.show("선생님이 깨웠어요");
        }
    }
    runItemCommand(type, id, n) {
        const session = this.session;
        if (!session)
            return false;
        if (type === "give" && FrCatalog.material(id) && n > 0) {
            const lost = session.gain(id, Math.min(n, 900));
            this.toast.show("선생님이 " + FrItemNames.label(id) + " " + n + "개를 보냈어요" + (lost > 0 ? " (가방이 가득 차서 일부는 못 받았어요)" : ""), 3200);
        }
        else if (type === "apfill") {
            session.ap.fill();
            session.changed();
            this.toast.show("선생님이 행동력을 채워 줬어요");
        }
        else if (type === "apbonus") {
            session.ap.bonus = Math.min(100, session.ap.bonus + n);
            session.ap.fill();
            session.changed();
            this.toast.show("선생님이 최대 행동력을 " + n + " 늘려 줬어요");
        }
        else if (type === "exit") {
            this.toast.show("선생님이 섬으로 데려와요");
            if (this.areaWorld)
                void this.leaveArea();
        }
        else
            return false;
        return true;
    }
    adminTravel(areaId) {
        if (!this.session || this.travelling)
            return;
        if (areaId === "island") {
            if (this.areaWorld)
                void this.leaveArea();
            return;
        }
        if (this.areaWorld) {
            this.toast.show("먼저 섬으로 나가세요");
            return;
        }
        void this.enterArea(areaId, 1, "start");
    }
    onSkipped() {
        if (!this.session || !this.session.sleeping)
            return;
        this.session.sleeping = false;
        this.session.ap.fill();
        this.session.changed();
        this.fade.snapBlack();
        window.setTimeout(() => {
            void this.fade.lift(2400);
            this.toast.show("좋은 아침이에요! 행동력이 가득 찼어요", 3200);
        }, 700);
    }
    buildWindows(session) {
        this.slotDrag = new FrSlotDrag(session);
        this.bagWindow = this.windows.register(new FrBagWindow(session, this.toast, this.slotDrag));
        this.mapWindow = this.windows.register(new FrMapWindow(session, this.toast, () => this.mapMarks()));
        this.chestWindow = this.windows.register(new FrChestWindow(session, this.toast));
        this.personalChestWindow = this.windows.register(new FrPersonalChestWindow(session, this.toast));
        this.personalChestWindow.onRemove = () => { if (this.personalChestCell)
            void this.removeHere(this.personalChestCell); };
        this.craftWindow = this.windows.register(new FrCraftWindow(session, this.toast, "workbench"));
        this.forgeWindow = this.windows.register(new FrCraftWindow(session, this.toast, "forge"));
        this.cookWindow = this.windows.register(new FrCookWindow(session, this.toast, "campfire"));
        this.ovenWindow = this.windows.register(new FrCookWindow(session, this.toast, "oven"));
        this.kitchenWindow = this.windows.register(new FrCookWindow(session, this.toast, "kitchen"));
        this.seedWindow = this.windows.register(new FrSeedWindow(session, this.toast));
        this.seedWindow.onPlant = (seedId) => void this.plantSeed(seedId);
        this.bookWindow = this.windows.register(new FrRecipeBookWindow(session, this.toast));
        this.currencyWindow = this.windows.register(new FrCurrencyWindow(session, this.toast));
        this.statsWindow = this.windows.register(new FrStatsWindow(session, this.toast, this.backend, this.island, this.roster));
        this.buildWindow = this.windows.register(new FrBuildWindow(session, this.toast));
        this.pouchWindow = this.windows.register(new FrPouchWindow(session, this.toast));
        this.dungeonWindow = this.windows.register(new FrDungeonWindow(session, this.toast));
        this.dungeonWindow.onEnter = (difficulty) => void this.startDungeon(difficulty);
        const currency = this.currencyWindow;
        [this.craftWindow, this.forgeWindow, this.cookWindow, this.ovenWindow, this.kitchenWindow, this.buildWindow, this.dungeonWindow, this.chestWindow, this.personalChestWindow].forEach((w) => { if (w)
            w.onItem = (id) => currency.showInfo(id); });
    }
    enterGame() {
        if (!this.world || !this.session || !this.clock)
            return;
        const others = this.roster.aliveUids().filter((uid) => uid !== this.uid && !(this.roster.members.get(uid) || { adm: false }).adm).length;
        if (!this.isAdmin() && others >= FrBalance.MAX_ISLAND_PLAYERS) {
            this.start.enter(false, "이 섬은 " + FrBalance.MAX_ISLAND_PLAYERS + "명이 모두 들어와 있어요. 잠시 뒤 다시 눌러 주세요.");
            window.setTimeout(() => this.start.enter(true, "다시 들어가 볼까요?"), 4000);
            return;
        }
        this.backdrop.stop();
        this.start.hide();
        this.editor.setActive(false);
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
        if (!FrClock.isNight(this.clock.minuteOfDay()))
            this.actedDay = this.clock.day();
        window.addEventListener("pagehide", () => { if (this.presencePublisher)
            void this.presencePublisher.leave(); });
        this.hotbar = new FrHotbar(this.session, (slot) => this.useHotbar(slot), this.slotDrag);
        FrDom.el("btnBag").addEventListener("click", () => this.toggleBag());
        FrDom.el("btnMap").addEventListener("click", () => this.toggleWindow(this.mapWindow));
        FrDom.el("btnCurrency").addEventListener("click", () => this.toggleWindow(this.currencyWindow));
        FrDom.el("btnStats").addEventListener("click", () => this.toggleWindow(this.statsWindow));
        FrDom.el("btnBook").addEventListener("click", () => this.toggleWindow(this.bookWindow));
        this.view.updateCrops(this.clock.absoluteMinute(), true);
        const adminButton = FrDom.el("btnAdmin");
        adminButton.hidden = !this.adminWindow;
        adminButton.addEventListener("click", () => this.key("F2"));
        FrDom.el("btnSleep").addEventListener("click", () => void this.toggleSleep());
        this.view.rig.snap(new this.libs.THREE.Vector3(player.x, player.y, player.z));
        this.lastDay = this.clock.day();
        this.view.canvas.addEventListener("click", (event) => this.clickWorld(event.clientX, event.clientY));
        this.view.canvas.addEventListener("pointermove", (event) => { if (event.pointerType === "mouse")
            this.hover.moved(event.clientX, event.clientY); });
        this.view.canvas.addEventListener("pointerleave", () => this.hover.left());
        this.input.enabled = true;
        this.playing = true;
        this.refreshHud();
        this.toast.show("모닥불 옆 큰 상자와 나무를 찾아보세요. 나무를 베어 목재를 모으면 작업대를 지을 수 있어요.", 4200);
    }
    refreshHud() {
        if (!this.session || !this.hud || !this.hotbar)
            return;
        this.hotbar.render();
        this.hud.showAp(this.session.ap, this.session.admin);
    }
    clickWorld(clientX, clientY) {
        if (!this.playing || !this.session || !this.player || !this.finder || this.currentTask || this.windows.anyOpen() || this.session.sleeping)
            return;
        if (this.areaWorld && this.areaFinder) {
            const areaPick = this.view.pickArea(clientX, clientY);
            if (!areaPick)
                return;
            const areaResult = this.areaFinder.fromPick(areaPick, this.player);
            if (areaResult.far) {
                this.toast.show("조금 더 가까이 가서 눌러 주세요");
                return;
            }
            if (areaResult.target)
                this.act(areaResult.target);
            return;
        }
        const pick = this.view.pick(clientX, clientY);
        if (!pick)
            return;
        if (this.adminNode.state.lock && !this.isAdmin()) {
            this.toast.show("선생님이 잠시 멈췄어요. 걷기만 할 수 있어요.");
            return;
        }
        if (pick.kind === "ground" && pick.cell && this.clickBuild(pick.cell))
            return;
        const result = this.finder.fromPick(pick, this.player);
        if (result.far) {
            this.toast.show("조금 더 가까이 가서 눌러 주세요");
            return;
        }
        if (!result.target)
            return;
        this.act(result.target);
    }
    clickBuild(cell) {
        if (!this.finder || !this.player || !this.session)
            return false;
        const context = this.finderContext();
        const blockTarget = this.finder.blockTarget(cell, context);
        if (blockTarget) {
            if (this.withinBuildReach(cell)) {
                this.act(blockTarget);
                return true;
            }
            if (context.held) {
                this.toast.show("조금 더 가까이 가서 눌러 주세요");
                return true;
            }
        }
        if (context.held)
            return false;
        const lot = this.finder.lotTargetAt(cell, this.player, context);
        if (lot.far) {
            this.toast.show("집터 가까이 가서 눌러 주세요");
            return true;
        }
        if (!lot.target)
            return false;
        this.act(lot.target);
        return true;
    }
    withinBuildReach(cell) {
        if (!this.player)
            return false;
        const B = FrTerrainData.BLOCK;
        return Math.hypot(this.player.x - (cell.x + 0.5) * B, this.player.z - (cell.z + 0.5) * B) <= FrTargetFinder.BUILD_REACH;
    }
    hoverPlacement() {
        if (!this.finder || !this.session || !this.session.heldBlock() || !this.hover.active)
            return null;
        if (this.hover.dirty) {
            const pick = this.view.pick(this.hover.x, this.hover.y);
            this.hover.settle(pick && pick.kind === "ground" && pick.cell ? pick.cell : null);
        }
        const cell = this.hover.cell;
        if (!cell || !this.withinBuildReach(cell))
            return null;
        return this.finder.blockTarget(cell, this.finderContext());
    }
    pressFeedback(game, hitsBefore) {
        const hitsNow = game instanceof FrCenterStop ? Math.round(game.progress() * game.hitsNeeded) : hitsBefore;
        if (game.state === "fail")
            this.mini.feedback("miss");
        else if (game instanceof FrCenterStop && hitsNow > hitsBefore)
            this.mini.feedback("hit");
        else
            this.mini.feedback("press");
        if (!this.player || !this.currentTask)
            return;
        const front = this.player.frontCell();
        const B = FrTerrainData.BLOCK;
        this.view.burst.emit((front.x + 0.5) * B, this.player.y + 1.4, (front.z + 0.5) * B, FrTaskColors.of(this.currentTask.task.kind), game.state === "fail" ? 2 : 4, 4);
    }
    press() {
        if (!this.playing || !this.session)
            return;
        if (this.fishing.active) {
            this.fishing.pull();
            return;
        }
        if (this.fight && !(this.target && this.target.kind === "exit")) {
            this.attackInput();
            return;
        }
        if (this.currentTask) {
            const game = this.currentTask.game;
            const before = game instanceof FrCenterStop ? Math.round(game.progress() * game.hitsNeeded) : 0;
            game.press();
            this.pressFeedback(game, before);
            return;
        }
        if (this.windows.anyOpen() || this.session.sleeping || !this.target)
            return;
        if (this.adminNode.state.lock && !this.isAdmin()) {
            this.toast.show("선생님이 잠시 멈췄어요. 걷기만 할 수 있어요.");
            return;
        }
        this.act(this.target);
    }
    release() {
        if (this.currentTask)
            this.currentTask.game.release();
    }
    key(code) {
        if (!this.playing)
            return;
        if (code === "Escape") {
            this.windows.closeAll();
            this.cancelTask();
            if (this.fishing.active)
                this.fishing.close();
            return;
        }
        if (code === "KeyJ") {
            this.attackInput();
            return;
        }
        if (code === "KeyI") {
            this.toggleBag();
            return;
        }
        if (code === "KeyR") {
            this.toggleWindow(this.bookWindow);
            return;
        }
        if (code === "KeyU") {
            this.toggleWindow(this.currencyWindow);
            return;
        }
        if (code === "KeyY") {
            this.toggleWindow(this.statsWindow);
            return;
        }
        if (code === "KeyM") {
            this.toggleWindow(this.mapWindow);
            return;
        }
        if (code === "KeyE") {
            this.adjustLevel(1);
            return;
        }
        if (code === "KeyQ") {
            this.adjustLevel(-1);
            return;
        }
        if (code === "KeyT") {
            this.rotation = (this.rotation + 1) % 4;
            this.toast.show("블록을 돌렸어요");
            return;
        }
        if (code === "KeyZ") {
            void this.toggleSleep();
            return;
        }
        if (code === "F2" && this.adminWindow) {
            if (this.adminWindow.isOpen)
                this.adminWindow.close();
            else
                this.windows.openOnly(this.adminWindow);
            return;
        }
        if (code.indexOf("Digit") === 0) {
            const n = Number(code.slice(5));
            if (n >= 1 && n <= FrBalance.HOTBAR_SLOTS)
                this.useHotbar(n - 1);
        }
    }
    toggleWindow(target) {
        if (!target)
            return;
        if (target.isOpen)
            target.close();
        else
            this.windows.openOnly(target);
    }
    toggleBag() {
        if (!this.bagWindow)
            return;
        if (this.bagWindow.isOpen)
            this.bagWindow.close();
        else
            this.windows.openOnly(this.bagWindow);
    }
    useHotbar(slot) {
        if (!this.session)
            return;
        const item = this.session.bag.slots[slot];
        if (this.fight && item && FrFoodRules.canEat(item.id) && !this.fightEnding) {
            const gain = FrFoodRules.dungeonGain(Math.max(0, FrFoodRules.starOfIngredient(item.id)));
            if (this.fight.heal(gain)) {
                this.session.bag.take(item.id, 1);
                this.session.changed();
                this.toast.show("냠냠! 체력이 찼어요 (잠깐 멈춰요)", 1500);
            }
            else
                this.toast.show("체력이 가득해요", 1200);
            return;
        }
        const already = this.session.selected === slot;
        this.session.selected = slot;
        this.levelPick = null;
        this.session.changed();
        if (!item)
            return;
        if (already && FrFoodRules.canEat(item.id))
            this.toast.show(this.session.eat(item.id) ? "냠냠! 행동력이 찼어요" : "행동력이 가득해요");
        else if (item.id.indexOf("block_") === 0 || FrFurnitureCatalog.isFurniture(item.id))
            this.toast.show(FrItemNames.label(item.id) + " — 놓을 칸을 눌러요 (Q/E 높이, T 돌리기)");
        else
            this.toast.show(FrItemNames.label(item.id) + (FrFoodRules.canEat(item.id) ? " — 한 번 더 누르면 먹어요" : ""));
    }
    ownLotUnder(cell) {
        if (!this.world || !this.session)
            return -1;
        const lot = FrBlockRules.lotIndexAt(this.world, cell.x, cell.z);
        const record = lot >= 0 ? this.world.lots.get(lot) : undefined;
        return record && record.uid === this.session.uid ? lot : -1;
    }
    finderContext() {
        const session = this.session;
        const bodies = [];
        this.roster.aliveUids().forEach((uid) => {
            const pose = this.roster.poses.get(uid);
            if (pose && uid !== this.uid)
                bodies.push({ x: Math.floor(pose.x / FrTerrainData.BLOCK), z: Math.floor(pose.z / FrTerrainData.BLOCK) });
        });
        if (this.player)
            bodies.push(this.player.cell());
        return { nowMinute: this.clock ? this.clock.absoluteMinute() : 0, held: session.heldBlock(), me: session.player(), bodies, levelPick: this.levelPick, rotation: this.rotation };
    }
    adjustLevel(direction) {
        if (!this.player || !this.world || !this.session || !this.session.heldBlock())
            return;
        const cell = this.hover.cell || this.player.frontCell();
        const current = FrBlockRules.chooseLevel(this.world, cell.x, cell.z, this.levelPick);
        this.levelPick = FrBlockRules.stepLevel(this.world, cell.x, cell.z, current, direction);
    }
    async placeHere(target) {
        if (!this.session || !this.world || !target.plan || !target.check)
            return;
        if (!target.check.ok) {
            this.toast.show(target.check.reason);
            return;
        }
        const plan = target.plan;
        const ok = await this.world.placeBlock(plan.x, plan.z, plan.y, plan.t, plan.r, this.session.player());
        if (!ok) {
            this.toast.show("다른 친구가 먼저 놓았어요");
            return;
        }
        this.session.bag.take(plan.t, 1);
        this.session.stats.add("placed");
        this.levelPick = null;
        this.session.changed();
        const B = FrTerrainData.BLOCK;
        this.view.burst.emit((plan.x + 0.5) * B, this.world.terrain.surfaceY(plan.x, plan.z) + plan.y * B + 1, (plan.z + 0.5) * B, [0xffffff, 0xd9d2c0], 6, 3);
    }
    async removeHere(target) {
        if (!this.session || !this.world || !target.cell || target.removeY === undefined)
            return;
        const record = this.world.blocks.get(this.world.terrain.index(target.cell.x, target.cell.z), target.removeY);
        if (!record)
            return;
        const mine = record.n === this.session.no;
        if (mine && this.session.bag.freeSlots() < 1 && this.session.bag.count(record.t) % FrBalance.STACK_SIZE === 0) {
            this.toast.show("가방이 가득 찼어요");
            return;
        }
        const removed = await this.world.removeBlock(target.cell.x, target.cell.z, target.removeY, this.session.player());
        if (!removed)
            return;
        if (mine)
            this.session.gain(removed.t, 1);
        const B = FrTerrainData.BLOCK;
        this.view.burst.emit((target.cell.x + 0.5) * B, this.world.terrain.surfaceY(target.cell.x, target.cell.z) + target.removeY * B + 1, (target.cell.z + 0.5) * B, [0xffffff, 0xb0a890], 6, 3);
    }
    async claimLot(index) {
        if (!this.session || !this.world)
            return;
        const ok = await this.world.claimLot(index, { uid: this.uid, no: this.session.no, name: this.session.nick });
        this.toast.show(ok ? "내 집터로 정했어요! 블록으로 마음껏 지어요" : "그 집터는 이미 임자가 있어요");
    }
    async buildHouse(index) {
        if (!this.session || !this.world)
            return;
        const source = this.session.craftSource();
        if (!source.canPay(FrHouseKit.COST)) {
            this.toast.show("재료가 모자라요: 목재 30 · 돌 20 · 노끈 10");
            return;
        }
        const anchor = this.world.terrain.anchors.lots[index];
        source.pay(FrHouseKit.COST);
        await this.world.placeMany(FrHouseKit.blueprint(anchor), this.session.player());
        this.session.changed();
        this.toast.show("작은 집이 지어졌어요! 블록을 바꿔 꾸며 보세요", 3500);
    }
    act(target) {
        if (!this.session)
            return;
        if (target.kind === "cook" && this.cookWindow) {
            this.windows.openOnly(this.cookWindow);
            return;
        }
        if (target.kind === "farmPlant" && this.seedWindow && target.cell) {
            this.plantCell = target.cell;
            this.windows.openOnly(this.seedWindow);
            return;
        }
        if (target.kind === "farmGrowing" && target.cell && this.world && this.clock) {
            const record = this.world.farm.get(this.world.terrain.index(target.cell.x, target.cell.z));
            if (record)
                this.toast.show(FrItemNames.label(record.crop) + " — 다 자라려면 약 " + Math.ceil(FrFarmRules.minutesLeft(this.world, target.cell.x, target.cell.z, record, this.clock.absoluteMinute()) / 6 / 60 * 10) / 10 + "분 남았어요");
            return;
        }
        if (target.kind === "pchest" && this.personalChestWindow) {
            this.personalChestCell = target;
            this.windows.openOnly(this.personalChestWindow);
            return;
        }
        if (target.kind === "chest" && this.chestWindow) {
            this.windows.openOnly(this.chestWindow);
            return;
        }
        if (target.kind === "site" && target.site) {
            this.openSite(target.site);
            return;
        }
        if (target.kind === "place") {
            void this.placeHere(target);
            return;
        }
        if (target.kind === "remove") {
            void this.removeHere(target);
            return;
        }
        if (target.kind === "lot" && target.lot !== undefined) {
            if (window.confirm("이 집터를 내 집터로 정할까요? 한 사람에 하나만 정할 수 있어요."))
                void this.claimLot(target.lot);
            return;
        }
        if (target.kind === "house" && target.lot !== undefined) {
            if (window.confirm("목재 30 · 돌 20 · 노끈 10 으로 작은 집을 지을까요?"))
                void this.buildHouse(target.lot);
            return;
        }
        if (target.kind === "portal" && target.portal) {
            this.enterPortal(target.portal);
            return;
        }
        if (target.kind === "exit") {
            void this.leaveArea();
            return;
        }
        if (target.kind === "ladderDown") {
            void this.changeFloor(1);
            return;
        }
        if (target.kind === "ladderUp") {
            void this.changeFloor(-1);
            return;
        }
        if (target.kind === "fish" && target.cell) {
            this.startFishing(target.cell);
            return;
        }
        const task = FrTasks.forTarget(target.kind) || FrAreaTargets.forTarget(target.kind);
        if (task)
            this.startTask(target, task);
    }
    enterPortal(id) {
        if (id === "dungeon") {
            if (this.dungeonWindow)
                this.windows.openOnly(this.dungeonWindow);
            return;
        }
        void this.enterArea(id, 1, "start");
    }
    async startDungeon(difficulty) {
        if (!this.session || this.travelling)
            return;
        if (!this.session.ap.canSpend(FrBalance.DUNGEON_ENTRY_COST)) {
            this.toast.show("행동력이 모자라요. 음식을 먹거나 밤에 잠을 자요.");
            return;
        }
        this.session.ap.spend(FrBalance.DUNGEON_ENTRY_COST);
        this.session.stats.add(FrDungeonInfo.STAT_ENTER[difficulty]);
        this.session.changed();
        this.pendingDifficulty = difficulty;
        try {
            await this.monsterAssets.load();
        }
        catch (error) {
            this.toast.show("몬스터를 불러오지 못했어요");
        }
        await this.enterArea("dungeon", 1, "start");
    }
    setupFight(area, scene) {
        const terrain = area.terrain;
        this.fight = new FrDungeonFight(this.pendingDifficulty, this.random, area.spawnSpots, (x, z) => terrain.top(terrain.cellOf(x), terrain.cellOf(z)) === "C", this.session ? this.session.pity.dungeon || 0 : 0);
        this.fight.invincible = !!this.session && this.session.admin;
        this.monsterLayer = new FrMonsterLayer(this.libs, scene.group, this.monsterAssets, this.clips);
        this.fightEnding = false;
        FrDom.el("btnAttack").hidden = false;
        FrDom.el("btnAttack").onpointerdown = (event) => { event.preventDefault(); this.attackInput(); };
        this.toast.show(FrDungeonInfo.NAMES[this.pendingDifficulty] + " 던전! " + FrBalance.DUNGEON_SECONDS + "초 동안 해골을 물리쳐요 (J·공격 버튼)", 3200);
    }
    clearFight() {
        this.fight = null;
        if (this.monsterLayer) {
            this.monsterLayer.clear();
            this.monsterLayer = null;
        }
        FrDom.el("btnAttack").hidden = true;
        if (this.hud)
            this.hud.showHealth(false);
    }
    attackInput() {
        if (!this.fight || !this.player || !this.session || this.travelling || this.fightEnding)
            return;
        const events = this.fight.attack({ x: this.player.x, z: this.player.z, facing: this.player.facing }, FrDungeonInfo.gearOf(this.session));
        if (this.fight.stun > 0)
            return;
        this.attackUntil = this.fightClock + 0.35;
        this.handleFight(events);
    }
    handleFight(events) {
        if (!this.session || !this.fight)
            return;
        events.forEach((e) => {
            if (e.t === "hit") {
                const broken = this.session.wearTool("weapon");
                this.view.burst.emit(e.monster.x, 3, e.monster.z, [0xffffff, 0xe8e0c8, 0xb8b0a0], 5, 6);
                if (broken)
                    this.toast.show(FrItemNames.label(broken) + "이(가) 다 닳았어요");
            }
            else if (e.t === "kill") {
                const lost = this.session.gainAll(e.drops);
                this.session.pity.dungeon = this.fight.legendMissCount;
                this.session.stats.add(FrDungeonInfo.STAT_KILL[this.fight.difficulty]);
                this.view.burst.emit(e.monster.x, 2.5, e.monster.z, [0xffd43a, 0xffffff, 0xcfd6e0], e.legend ? 18 : 9, 7);
                const names = Object.keys(e.drops).filter((id) => id !== "bone").map((id) => FrItemNames.label(id) + (e.drops[id] > 1 ? "×" + e.drops[id] : ""));
                if (names.length > 0 || e.legend)
                    this.toast.show((e.legend ? "전설! " : "") + names.join(", ") + (lost > 0 ? " (가방 가득)" : ""), 1400);
            }
            else if (e.t === "hurt") {
                const hurt = FrDom.el("hurt");
                hurt.style.opacity = "1";
                window.setTimeout(() => { hurt.style.opacity = "0"; }, 160);
            }
            else if (e.t === "end") {
                void this.finishDungeon(e.reason);
            }
        });
    }
    async finishDungeon(reason) {
        if (!this.fight || this.fightEnding)
            return;
        this.fightEnding = true;
        if (this.expedition)
            this.expedition.note = "잡은 몬스터 " + this.fight.kills + "마리";
        if (reason === "time")
            this.toast.show("시간이 다 됐어요! 지금까지 얻은 것을 정리해요", 2400);
        else if (reason === "dead")
            this.toast.show("쓰러졌어요… 그래도 얻은 것은 가지고 나가요", 2400);
        await new Promise((resolve) => window.setTimeout(resolve, 1100));
        this.clearFight();
        await this.leaveArea();
    }
    buildArea(id, floor, arrive) {
        if (id === "dungeon")
            return FrAreaFactory.dungeon(this.dungeonData[FrDungeonInfo.KIND[this.pendingDifficulty]]);
        if (id === "fruit")
            return FrAreaFactory.forest(Date.now() & 0xffffff);
        if (id === "beach") {
            if (!this.beachWorld)
                this.beachWorld = FrAreaFactory.beach(7);
            return this.beachWorld;
        }
        const data = this.mineData.floors[floor - 1];
        const area = FrAreaFactory.mine(data, this.mineData.floors.length, Date.now() & 0xffffff);
        if (arrive === "ladder" && data.ladderDown) {
            area.spawn.x = data.ladderDown[0];
            area.spawn.z = data.ladderDown[1];
        }
        return area;
    }
    async enterArea(id, floor, arrive) {
        if (!this.session || !this.player || !this.clock || this.travelling)
            return;
        this.travelling = true;
        this.cancelTask();
        this.windows.closeAll();
        await this.fade.blackout(380);
        const area = this.buildArea(id, floor, arrive);
        let light = null;
        if (id === "mine")
            light = new FrCaveLight(this.mineData.floors[floor - 1].torches);
        if (id === "dungeon") {
            const data = this.dungeonData[FrDungeonInfo.KIND[this.pendingDifficulty]];
            light = new FrCaveLight(data.torches, data.kind === "moss" ? [0.8, 1.1, 0.85] : data.kind === "crystal" ? [0.8, 0.95, 1.2] : [1.15, 0.85, 0.8]);
        }
        const scene = new FrAreaScene(this.libs, area, this.view.groundMaterial(), light, this.nature);
        scene.syncAvailability(this.clock.absoluteMinute());
        if (this.areaScene)
            this.view.hideArea();
        this.view.showArea(scene, area.dark);
        this.areaWorld = area;
        this.areaScene = scene;
        this.player.useWorld(area);
        this.player.place(area.spawn.x, area.spawn.z);
        const minute = () => this.clock.absoluteMinute();
        this.areaFinder = new FrAreaFinder(area, minute);
        this.areaOutcome = new FrAreaOutcome(this.session, area, scene, this.random, minute);
        this.session.area = id;
        this.session.floor = floor;
        if (FrAreaInfo.solo(id) && !this.expedition) {
            this.expedition = new FrExpedition(this.session, id);
            this.expedition.begin();
        }
        this.view.rig.snap(new this.libs.THREE.Vector3(this.player.x, this.player.y, this.player.z));
        if (id === "dungeon")
            this.setupFight(area, scene);
        await this.publishPresence(true);
        await this.fade.lift(450);
        this.travelling = false;
    }
    async changeFloor(delta) {
        if (!this.session || this.session.area !== "mine")
            return;
        const next = this.session.floor + delta;
        if (next < 1) {
            await this.leaveArea();
            return;
        }
        if (next > 3)
            return;
        await this.enterArea("mine", next, delta > 0 ? "start" : "ladder");
    }
    async leaveArea() {
        if (!this.session || !this.player || !this.world || !this.areaWorld || this.travelling)
            return;
        this.travelling = true;
        const left = this.areaWorld.id;
        this.cancelTask();
        await this.fade.blackout(380);
        this.view.hideArea();
        this.areaWorld = null;
        this.areaScene = null;
        this.areaFinder = null;
        this.areaOutcome = null;
        this.clearFight();
        this.player.useWorld(this.world);
        const portal = this.world.terrain.anchors.portals[left];
        const plaza = this.world.terrain.anchors.plaza;
        this.player.place(portal.x + Math.sign(plaza.x - portal.x) * 3, portal.z + Math.sign(plaza.z - portal.z) * 3);
        this.session.area = "island";
        this.session.floor = 1;
        const finished = this.expedition;
        this.expedition = null;
        if (finished) {
            FrExpedition.clear();
            this.session.changed();
        }
        this.view.rig.snap(new this.libs.THREE.Vector3(this.player.x, this.player.y, this.player.z));
        await this.publishPresence(true);
        await this.fade.lift(450);
        this.travelling = false;
        if (finished && this.pouchWindow)
            this.windows.openOnly(this.pouchWindow, () => this.pouchWindow.showFor(finished));
    }
    startFishing(cell) {
        if (!this.session || !this.player)
            return;
        if (this.session.bag.bestTier("rod") === 0) {
            this.toast.show("낚싯대가 있어야 해요. 작업대에서 만들 수 있어요.");
            return;
        }
        const B = FrTerrainData.BLOCK;
        this.player.facing = Math.atan2((cell.x + 0.5) * B - this.player.x, (cell.z + 0.5) * B - this.player.z);
        const session = this.session;
        this.fishing.open({
            rodTier: () => session.bag.bestTier("rod"),
            cast: () => {
                if (!session.ap.canSpend(FrBalance.ACTION_COST.fish)) {
                    this.toast.show("행동력이 모자라요. 음식을 먹거나 밤에 잠을 자요.");
                    return null;
                }
                return FrGatherRules.fish(this.random, session);
            },
            onCatch: (roll) => {
                session.ap.spend(FrBalance.ACTION_COST.fish);
                session.pity.fish = roll.miss;
                const broken = session.wearTool("rod");
                session.gain(roll.item, 1);
                session.stats.add("fish");
                if (roll.legend)
                    session.stats.add("fishLegend");
                session.stats.see("fish", roll.item, "fishKinds");
                if (broken)
                    this.toast.show(FrItemNames.label(broken) + "이(가) 다 닳았어요");
            },
            onClose: () => { if (this.avatar)
                this.avatar.play("idle"); },
        });
    }
    openSite(site) {
        if (!this.world || !this.craftWindow || !this.buildWindow)
            return;
        const def = FrVillage.definition(site.defId);
        const done = this.world.isBuilt(site.id);
        const windows = { workbench: this.craftWindow, forge: this.forgeWindow, oven: this.ovenWindow, kitchen: this.kitchenWindow };
        if (done) {
            const target = windows[site.defId];
            if (target)
                this.windows.openOnly(target);
            else
                this.toast.show(site.name + "이(가) 지어져 있어요 (마을 점수 +" + def.score + ")");
            return;
        }
        if (this.world.village.level() < def.minVillageLevel) {
            this.toast.show("마을이 더 자라야 지을 수 있어요 (마을 " + def.minVillageLevel + "단계)");
            return;
        }
        this.windows.closeAll();
        this.buildWindow.openFor(def, site);
    }
    async plantSeed(seedId) {
        if (!this.session || !this.world || !this.clock || !this.plantCell)
            return;
        const cell = this.plantCell;
        const check = FrFarmRules.canPlant(this.world, cell.x, cell.z, seedId);
        if (!check.ok || this.session.bag.count(seedId) < 1) {
            this.toast.show(check.reason || "씨앗이 없어요");
            return;
        }
        const crop = seedId.replace(/_seed$/, "");
        const ok = await this.world.plant(this.world.terrain.index(cell.x, cell.z), { uid: this.uid, no: this.session.no, crop, at: this.clock.absoluteMinute() });
        if (!ok) {
            this.toast.show("다른 친구가 먼저 심었어요");
            return;
        }
        this.session.bag.take(seedId, 1);
        this.session.stats.add("planted");
        this.session.changed();
        this.view.updateCrops(this.clock.absoluteMinute(), true);
        this.toast.show(FrItemNames.label(crop) + "을(를) 심었어요! 다 자라면 수확해요");
    }
    startTask(target, task) {
        if (!this.session || !this.player)
            return;
        if (!this.session.ap.canSpend(task.apCost)) {
            this.toast.show("행동력이 모자라요. 음식을 먹거나 밤에 잠을 자요.");
            return;
        }
        const tier = this.session.bag.bestTier(task.toolKind);
        const game = FrMiniGameFactory.createVaried(task.kind, tier, this.random.next());
        if (!game) {
            this.toast.show(task.missingTool || "도구가 필요해요");
            return;
        }
        if (target.cell) {
            const B = FrTerrainData.BLOCK;
            this.player.facing = Math.atan2((target.cell.x + 0.5) * B - this.player.x, (target.cell.z + 0.5) * B - this.player.z);
        }
        this.currentTask = { target, task, game };
        this.mini.show(task.label, game);
        if (this.avatar)
            this.avatar.play(task.clip);
        game.press();
    }
    cancelTask() {
        if (!this.currentTask)
            return;
        this.currentTask = null;
        this.mini.hide();
    }
    async finishTask() {
        const current = this.currentTask;
        if (!current || !this.outcome)
            return;
        this.currentTask = null;
        const areaOutcome = this.areaOutcome;
        if (current.game.state !== "success") {
            this.mini.hide();
            return;
        }
        this.mini.celebrate();
        window.setTimeout(() => { if (!this.currentTask)
            this.mini.hide(); }, 950);
        if (this.player) {
            const cell = current.target.cell || this.player.frontCell();
            const B = FrTerrainData.BLOCK;
            const terrain = this.areaWorld ? this.areaWorld.terrain : this.view.terrainData();
            this.view.burst.emit((cell.x + 0.5) * B, Math.max(0, terrain.surfaceY(cell.x, cell.z)) + 2.2, (cell.z + 0.5) * B, FrTaskColors.success(current.task.kind), 22, 7);
        }
        const message = this.areaWorld && areaOutcome ? await areaOutcome.finish(current.target, current.task) : await this.outcome.finish(current.target, current.task);
        if (message)
            this.toast.show(message);
    }
    isAdmin() {
        const flagged = window.__FOREST_ADMIN__ === true;
        return flagged || (typeof AccountPolicy !== "undefined" && AccountPolicy.ADMIN_UIDS.indexOf(this.uid) >= 0);
    }
    islandParam() {
        const match = /[?&]island=([^&]+)/.exec(location.search);
        return match ? decodeURIComponent(match[1]) : "";
    }
    presences() {
        if (!this.session || !this.clock)
            return [];
        const self = { uid: this.uid, name: this.session.nick, area: this.session.area, sleeping: this.session.sleeping, actedToday: true };
        const everyone = this.roster.asPresences(this.clock.day(), this.uid, self);
        return this.isAdmin() && !this.session.sleeping ? everyone.filter((p) => p.uid !== this.uid) : everyone;
    }
    mapMarks() {
        const onIsland = !this.areaWorld;
        const me = this.player && onIsland && this.session ? { x: this.player.x / FrTerrainData.BLOCK, z: this.player.z / FrTerrainData.BLOCK, name: "나" } : null;
        return { me, others: FrIslandMapPainter.othersOf(this.roster, this.uid, true), island: onIsland };
    }
    sleepRows() {
        if (!this.session || !this.clock)
            return [];
        const self = { uid: this.uid, no: this.session.no, name: this.session.nick, state: this.session.sleeping ? "asleep" : "awake", area: this.session.area, self: true };
        return this.roster.sleepRows(this.clock.day(), self);
    }
    async toggleSleep() {
        if (!this.session || !this.clock)
            return;
        if (this.session.sleeping) {
            this.session.sleeping = false;
            this.sleepBoard.hide();
            void this.fade.lift(700);
            this.toast.show("일어났어요");
            await this.publishPresence(true);
            return;
        }
        if (!FrSleepVote.canSleep(this.clock.minuteOfDay(), this.session.area))
            return;
        this.cancelTask();
        this.windows.closeAll();
        this.session.sleeping = true;
        this.sleepBoard.show(this.sleepRows(), FrSleepVote.banner(this.presences()));
        void this.fade.dim(FrGame.SLEEP_DIM, 2600);
        await this.publishPresence(true);
        await this.tryMorning();
    }
    async publishPresence(force) {
        if (!this.presencePublisher || !this.session)
            return;
        await this.presencePublisher.publish(this.session.area, this.session.sleeping, this.actedDay, force);
    }
    async tryMorning() {
        if (!this.session || !this.clock || !this.session.sleeping || this.morningPending)
            return;
        if (!FrSleepVote.allAsleep(this.presences()))
            return;
        this.morningPending = true;
        await this.fade.blackout(1600);
        this.morningPending = false;
        if (!this.session.sleeping)
            return;
        if (!FrSleepVote.allAsleep(this.presences())) {
            void this.fade.dim(FrGame.SLEEP_DIM, 900);
            return;
        }
        try {
            if (await this.clock.skipToMorning())
                this.onSkipped();
        }
        catch (error) {
            this.session.sleeping = false;
            void this.fade.lift(700);
            this.toast.show("아침으로 넘기지 못했어요. 다시 잠자기를 눌러 보세요. (" + error + ")", 5000);
            await this.publishPresence(true);
        }
    }
    poseCode(moving) {
        if (!this.session || !this.player)
            return 0;
        if (this.session.sleeping)
            return 6;
        if (this.currentTask)
            return FrWire.ANIMS.indexOf(this.currentTask.task.clip);
        return moving ? (this.player.swimming ? 2 : 1) : 0;
    }
    frame(dt, time) {
        const session = this.session, clock = this.clock, player = this.player, world = this.world;
        if (!this.playing || !session || !clock || !player || !world || !this.hud || !this.avatar || !this.finder)
            return;
        const direction = this.input.direction();
        this.fightClock = time;
        const blocked = this.windows.anyOpen() || session.sleeping || this.currentTask !== null || this.fishing.active || this.travelling || (this.fight !== null && this.fight.stun > 0);
        if (this.fishing.active)
            this.fishing.update(dt);
        if (this.currentTask && Math.hypot(direction.x, direction.z) > 0.4)
            this.cancelTask();
        const shoes = FrBalance.SHOES_SPEED[session.bag.bestTier("shoes")];
        player.step(blocked ? { x: 0, z: 0 } : direction, dt, shoes);
        if (this.fight && this.monsterLayer && !this.fightEnding && !this.travelling) {
            this.handleFight(this.fight.update(dt, { x: player.x, z: player.z, facing: player.facing }, FrDungeonInfo.gearOf(session)));
            this.monsterLayer.update(this.fight.monsters, this.areaWorld.terrain, dt, time);
            this.hud.showHealth(true, this.fight.health);
        }
        else if (this.monsterLayer && this.fight)
            this.monsterLayer.update(this.fight.monsters, this.areaWorld.terrain, dt, time);
        this.avatar.group.position.set(player.x, player.y, player.z);
        this.avatar.group.rotation.y = player.facing;
        if (session.sleeping)
            this.avatar.play("sleep");
        else if (this.currentTask)
            this.avatar.play(this.currentTask.task.clip);
        else if (this.fight && time < this.attackUntil)
            this.avatar.play("attack");
        else if (this.fishing.active)
            this.avatar.play("fish");
        else
            this.avatar.play(player.moving ? (player.swimming ? "walk" : "run") : "idle");
        this.view.rig.follow(new this.libs.THREE.Vector3(player.x, player.y, player.z), dt);
        if (!this.areaWorld) {
            this.view.fadeTreesAround(player.cell());
            this.view.blocksLayer.setRoofLot(this.ownLotUnder(player.cell()));
        }
        if (this.remotes)
            this.remotes.update(dt, session.area);
        if (this.posePublisher && FrAreaInfo.shared(session.area))
            this.posePublisher.send(player.x, player.z, player.y, player.facing, this.poseCode(player.moving), player.vx, player.vz);
        if (this.areaWorld && this.areaFinder) {
            this.target = blocked ? null : this.areaFinder.find(player);
            this.view.updateAreaMarker(this.target && this.target.cell && this.target.kind !== "exit" && this.target.kind !== "ladderDown" && this.target.kind !== "ladderUp" ? this.target.cell : null);
        }
        else {
            this.target = blocked ? null : this.finder.find(player, this.finderContext());
            if (player.moving)
                this.hover.dirty = true;
            const place = blocked ? null : this.hoverPlacement();
            if (place && place.plan)
                this.view.setPreview(place.cell, place.plan.y, !!place.check && place.check.ok);
            else
                this.view.setPreview(null, 0, true);
            this.view.setMarker(this.target && this.target.cell ? this.target.cell : null);
        }
        this.input.setActionLabel(this.target ? this.target.label : this.fight ? "공격" : "·");
        if (this.currentTask) {
            this.currentTask.game.tick(dt);
            this.mini.update();
            if (this.currentTask.game.state !== "running" && this.currentTask.game.state !== "waiting")
                void this.finishTask();
        }
        const minute = clock.minuteOfDay();
        const day = clock.day();
        if (!FrClock.isNight(minute) && (player.moving || this.currentTask !== null))
            this.actedDay = day;
        void this.publishPresence(false);
        if (session.sleeping && time - this.lastSleepCheck > 1) {
            this.lastSleepCheck = time;
            void this.tryMorning();
        }
        if (!session.sleeping)
            this.sleepBoard.hide();
        else if (time - this.lastSleepBoard > 0.5) {
            this.lastSleepBoard = time;
            this.sleepBoard.show(this.sleepRows(), FrSleepVote.banner(this.presences()));
        }
        this.view.applyClock(minute);
        this.hud.showClock(minute, day);
        this.hud.showArea(this.fight ? "던전 " + FrDungeonInfo.NAMES[this.fight.difficulty] + " · 남은 " + Math.ceil(this.fight.timeLeft) + "초" : FrAreaInfo.label(session.area) + (session.area === "mine" ? " " + session.floor + "층" : ""));
        this.hud.showSleepButton(FrSleepVote.canSleep(minute, session.area) && !this.currentTask, session.sleeping);
        this.hud.showSleepBand(FrClock.isNight(minute) ? FrSleepVote.banner(this.presences()) : "");
        if (day !== this.lastDay)
            this.onNewDay(day);
        if (time - this.lastSnowCheck > 1) {
            this.lastSnowCheck = time;
            world.syncSnow(day);
            this.view.updateCrops(clock.absoluteMinute(), true);
            void clock.heartbeat();
        }
    }
    onNewDay(day) {
        this.lastDay = day;
        if (this.session && this.session.sleeping) {
            this.session.ap.current = FrSleepVote.morningActionPoints(true, false, this.session.ap.current, this.session.ap.max());
            this.session.sleeping = false;
            this.session.changed();
            void this.fade.lift(1800);
            this.toast.show("아침이 밝았어요");
        }
    }
    loop(milliseconds) {
        const time = milliseconds / 1000;
        const dt = Math.min(0.05, this.lastTime ? time - this.lastTime : 0.016);
        this.lastTime = time;
        if (this.playing)
            this.frame(dt, time);
        else
            this.backdrop.update(dt, this.view.terrainData());
        this.view.render(dt, time);
        requestAnimationFrame((t) => this.loop(t));
    }
}
FrGame.CODE_PATTERN_HINT = "섬 코드를 입력해 주세요.";
FrGame.SLEEP_DIM = 0.84;
