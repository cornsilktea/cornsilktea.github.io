"use strict";
class MiniGamesApp {
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
        this.practiceEntry = new PracticeEntryView(this.page);
        this.practiceMenu = new PracticeMenuView(this.page);
        this.phases = new CollectionPhaseMachine();
        this.lastFrameMs = 0;
        this.lastTickMs = 0;
        this.assetsReady = false;
        this.frame = (timeMs) => {
            this.env.requestFrame(this.frame);
            const dt = Math.min(MiniGamesApp.MAX_FRAME_SECONDS, (timeMs - this.lastFrameMs) / 1000);
            this.lastFrameMs = timeMs;
            this.tick(dt, true);
        };
        this.assets = new CharacterAssets(libs);
        this.factory = new CharacterModelFactory(libs, this.assets);
        this.catalog = new GameCatalog([new LastTileDefinition(libs), new BombPassDefinition(), new NunchiCardDefinition(), new TerritoryDefinition(), new FreezeDefinition(libs, this.assets, this.factory)]);
        this.render = new RenderHost(libs, this.page.byId("view"), this.env);
        this.backdrops = new MenuBackdropDirector(this.catalog, { libs, env: this.env, clock: this.backend.clock, render: this.render }, this.randomSource);
        this.editor = new ProfileEditor(libs, this.factory, this.assets, this.profile);
        FoldCard.bindAll(document);
        this.profilePanel = new ProfilePanel(this.editor);
        const wiring = this.wire();
        this.flow = wiring.flow;
        this.startPhase = wiring.startPhase;
        this.editor.onChange(() => this.flow.pushProfile());
    }
    start() {
        this.lastFrameMs = this.env.nowMs();
        this.lastTickMs = this.lastFrameMs;
        new CatalogView(this.page).render(this.catalog);
        this.practiceMenu.render(this.catalog);
        this.updateStartButtons();
        this.env.requestFrame(this.frame);
        this.env.everyMs(MiniGamesApp.BACKUP_TICK_MS, () => this.backupTick());
        this.env.everyMs(MiniGamesApp.HOST_TICK_MS, () => this.flow.tickHost());
        this.loadAssets();
    }
    wire() {
        const messages = new MessageView(this.page);
        const hub = new ActionHub(this.env, this.page, new ElementFactory());
        this.env.onBlur(() => hub.releaseAll());
        const screens = new CollectionScreens(this.page, this.env.touchDevice, messages, hub);
        const host = { isHost: () => this.flow.isHost() };
        const runtime = new GameRuntime(this.catalog, {
            libs: this.libs, page: this.page, env: this.env, clock: this.backend.clock, render: this.render,
            characters: { assets: this.assets, factory: this.factory }, localId: this.localId, host
        }, hub);
        const spectatorBar = new SpectatorViewBar(this.page);
        spectatorBar.onPick((id) => runtime.onSpectateTo(id));
        const lobbyView = new CollectionLobbyView(this.page, this.catalog);
        const resultView = new CollectionResultView(this.page, this.catalog);
        const services = {
            clock: this.backend.clock, screens, runtime, hud: new CollectionHud(this.page), spectatorBar, messages, hub, render: this.render, backdrops: this.backdrops, catalog: this.catalog,
            lobbyView, resultView, profilePanel: this.profilePanel,
            startProfileHost: this.page.byId("profileHost"), lobbyProfileHost: this.page.byId("lobbyProfileHost"), practiceProfileHost: this.page.byId("practiceProfileHost"),
            localId: this.localId, session: () => this.flow.session(), directory: { lookup: (id) => this.flow.lookup(id) }
        };
        const startPhase = new StartScreenPhase(services);
        const flow = new CollectionFlow({
            env: this.env, backend: this.backend, directory: new CollectionDirectory(this.backend, this.env, this.tokens), catalog: this.catalog, profile: this.profile,
            startView: this.startView, practiceEntry: this.practiceEntry, practiceMenu: this.practiceMenu, lobbyView, resultView, runtime, hub, phases: this.phases,
            startPhase, lobbyPhase: new LobbyScreenPhase(services), practicePhase: new PracticeScreenPhase(services), playPhase: new PlayScreenPhase(services), resultPhase: new ResultScreenPhase(services),
            random: new RandomRange(this.randomSource), localId: this.localId
        });
        return { flow, startPhase };
    }
    async loadAssets() {
        this.phases.goTo(this.startPhase);
        try {
            await Promise.all([this.assets.load(), this.catalog.preloadAll()]);
            this.assetsReady = true;
            this.backdrops.markReady();
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
        this.practiceEntry.setEnabled(ready);
        if (!this.backend.isOnline())
            this.startView.showMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인)");
    }
    backupTick() {
        const nowMs = this.env.nowMs();
        if (nowMs - this.lastFrameMs < MiniGamesApp.BACKUP_AFTER_MS)
            return;
        this.tick(Math.min(MiniGamesApp.MAX_BACKUP_SECONDS, (nowMs - this.lastTickMs) / 1000), false);
    }
    tick(dt, draw) {
        this.lastTickMs = this.env.nowMs();
        this.render.trackFrameTime(dt);
        this.phases.update(dt, draw);
    }
}
MiniGamesApp.BACKUP_TICK_MS = 50;
MiniGamesApp.BACKUP_AFTER_MS = 200;
MiniGamesApp.MAX_FRAME_SECONDS = 0.05;
MiniGamesApp.MAX_BACKUP_SECONDS = 0.1;
MiniGamesApp.HOST_TICK_MS = 250;
