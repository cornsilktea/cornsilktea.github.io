"use strict";
class LastTileApp {
    constructor(libs) {
        this.libs = libs;
        this.env = new BrowserEnv();
        this.page = new Page();
        this.profile = new PlayerProfile();
        this.backend = new RoomBackend(this.env);
        this.randomSource = new MathRandomSource();
        this.tokens = new TokenSource(new RandomRange(this.randomSource));
        this.localId = "p" + this.tokens.token(8) + new SystemClock().now().toString(36).slice(-4);
        this.startView = new StartView(this.page);
        this.phases = new PhaseMachine();
        this.lastFrameMs = 0;
        this.lastTickMs = 0;
        this.assetsReady = false;
        this.frame = (timeMs) => {
            this.env.requestFrame(this.frame);
            const dt = Math.min(LastTileApp.MAX_FRAME_SECONDS, (timeMs - this.lastFrameMs) / 1000);
            this.lastFrameMs = timeMs;
            this.tick(dt, true);
        };
        this.assets = new CharacterAssets(libs);
        this.factory = new CharacterModelFactory(libs, this.assets);
        this.scenery = new SceneryKit(libs);
        this.world = new LastTileWorldView(libs, this.page.byId("view"), this.env);
        this.boardView = new BoardView(libs, this.world.scene, this.scenery);
        this.editor = new ProfileEditor(libs, this.factory, this.assets, this.profile);
        this.profilePanel = new ProfilePanel(this.editor);
        const wiring = this.wire();
        this.flow = wiring.flow;
        this.startPhase = wiring.startPhase;
        this.editor.onChange(() => this.flow.pushProfile());
    }
    start() {
        this.lastFrameMs = this.env.nowMs();
        this.lastTickMs = this.lastFrameMs;
        this.updateStartButtons();
        this.env.requestFrame(this.frame);
        this.env.everyMs(LastTileApp.BACKUP_TICK_MS, () => this.backupTick());
        this.env.everyMs(LastTileApp.HOST_TICK_MS, () => this.flow.tickHost());
        this.loadAssets();
    }
    wire() {
        const messages = new MessageView(this.page);
        const screens = new LastTileScreens(this.page, this.env.touchDevice, messages);
        const floors = new FloorPresenter(this.boardView, this.page.byId("fade"), this.env);
        const subjects = new SubjectSelector(this.localId);
        const labels = new NameTagFactory(this.libs, this.page);
        const views = new FighterViews(new FighterViewKit(this.libs, this.page, labels), this.factory, this.assets, this.world.world);
        const stage = new StageRenderer(this.world, this.boardView, floors, new CameraRig(this.world.camera, this.env), subjects, views);
        const keyboard = new KeyboardInput(this.env);
        const input = new CombinedInput([keyboard, new TouchInput(this.page)]);
        this.env.onBlur(() => input.releaseAll());
        const random = this.randomSource;
        const host = { isHost: () => this.flow.isHost() };
        const runtime = new MatchRuntime(stage, this.backend.clock, this.localId, input, host, random);
        input.bind({ onPush: () => runtime.localPush(), onDash: () => runtime.localDash(), onSpectateNext: () => runtime.spectateNext() });
        messages.onSpectateNext(() => runtime.spectateNext());
        const services = {
            clock: this.backend.clock,
            page: this.page,
            screens,
            runtime,
            stage,
            hud: new HudView(this.page),
            messages,
            lobbyView: new LastTileLobbyView(this.page),
            resultView: new ResultView(this.page),
            profilePanel: this.profilePanel,
            startProfileHost: this.page.byId("profileHost"),
            lobbyProfileHost: this.page.byId("lobbyProfileHost"),
            localId: this.localId,
            session: () => this.flow.session(),
            directory: { lookup: (id) => this.flow.lookup(id) }
        };
        const playPhase = new PlayPhase(services);
        const countdownPhase = new CountdownPhase(services, this.phases, () => playPhase);
        const startPhase = new StartPhase(services);
        const flow = new RoomFlow({
            env: this.env, backend: this.backend, directory: new LastTileRoomDirectory(this.backend, this.env, this.tokens), profile: this.profile,
            startView: this.startView, lobbyView: services.lobbyView, resultView: services.resultView, runtime, input, phases: this.phases,
            startPhase, lobbyPhase: new LobbyPhase(services), countdownPhase, resultPhase: new ResultPhase(services),
            random: new RandomRange(random), localId: this.localId
        });
        return { flow, startPhase };
    }
    async loadAssets() {
        this.phases.goTo(this.startPhase);
        try {
            await Promise.all([this.assets.load(), this.scenery.load()]);
            this.boardView.build();
            this.assetsReady = true;
            this.startView.showLoadNote("");
            this.profilePanel.markReady();
            this.updateStartButtons();
        }
        catch (error) {
            this.startView.showLoadNote("캐릭터를 불러오지 못했어요. 새로고침해 주세요.");
        }
    }
    updateStartButtons() {
        const ready = this.backend.isOnline() && this.assetsReady;
        this.startView.setOnlineReady(ready);
        if (!this.backend.isOnline())
            this.startView.showMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인)");
    }
    backupTick() {
        const nowMs = this.env.nowMs();
        if (nowMs - this.lastFrameMs < LastTileApp.BACKUP_AFTER_MS)
            return;
        this.tick(Math.min(LastTileApp.MAX_BACKUP_SECONDS, (nowMs - this.lastTickMs) / 1000), false);
    }
    tick(dt, draw) {
        this.lastTickMs = this.env.nowMs();
        this.world.trackFrameTime(dt);
        this.phases.update(dt, draw);
    }
}
LastTileApp.BACKUP_TICK_MS = 50;
LastTileApp.BACKUP_AFTER_MS = 200;
LastTileApp.MAX_FRAME_SECONDS = 0.05;
LastTileApp.MAX_BACKUP_SECONDS = 0.1;
LastTileApp.HOST_TICK_MS = 250;
