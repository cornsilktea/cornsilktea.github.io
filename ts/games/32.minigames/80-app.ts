class MiniGamesApp {
  private static readonly BACKUP_TICK_MS = 50;
  private static readonly BACKUP_AFTER_MS = 200;
  private static readonly MAX_FRAME_SECONDS = 0.05;
  private static readonly MAX_BACKUP_SECONDS = 0.1;
  private static readonly HOST_TICK_MS = 250;

  private readonly env = new BrowserEnv();
  private readonly page = new Page();
  private readonly profile = new PlayerProfile();
  private readonly backend = new RoomBackend(this.env);
  private readonly randomSource = new MathRandomSource();
  private readonly tokens = new TokenSource(new RandomRange(this.randomSource));
  private readonly localId = new RoomResumeStore("minigames").identity();
  private readonly assets: CharacterAssets;
  private readonly factory: CharacterModelFactory;
  private readonly catalog: GameCatalog;
  private readonly render: RenderHost;
  private readonly startView = new StartView(this.page);
  private readonly practiceEntry = new PracticeEntryView(this.page);
  private readonly randomEntry = new RandomEntryView(this.page);
  private readonly practiceMenu = new PracticeMenuView(this.page);
  private readonly editor: ProfileEditor;
  private readonly profilePanel: ProfilePanel;
  private readonly backdrops: MenuBackdropDirector;
  private readonly phases = new CollectionPhaseMachine();
  private readonly flow: CollectionFlow;
  private readonly startPhase: CollectionPhase;
  private lastFrameMs = 0;
  private lastTickMs = 0;
  private assetsReady = false;

  constructor(private readonly libs: ThreeLibs, private readonly gauge: LoadGauge<MiniGamesLoadStep>) {
    this.assets = new CharacterAssets(libs);
    this.factory = new CharacterModelFactory(libs, this.assets);
    this.catalog = new GameCatalog([new LastTileDefinition(libs), new BombPassDefinition(), new NunchiCardDefinition(), new TerritoryDefinition(), new FreezeDefinition(libs, this.assets, this.factory), new MoleDefinition(libs, this.assets, this.factory), new GlassBridgeDefinition(libs, this.assets, this.factory)]);
    this.render = new RenderHost(libs, this.page.byId<HTMLCanvasElement>("view"), this.env);
    this.backdrops = new MenuBackdropDirector(this.catalog, { libs, env: this.env, clock: this.backend.clock, render: this.render }, this.randomSource);
    this.editor = new ProfileEditor(libs, this.factory, this.assets, this.profile);
    FoldCard.bindAll(document);
    this.profilePanel = new ProfilePanel(this.editor);
    const wiring = this.wire();
    this.flow = wiring.flow;
    this.startPhase = wiring.startPhase;
    this.editor.onChange(() => this.flow.pushProfile());
  }

  start(): void {
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

  private wire(): { flow: CollectionFlow; startPhase: CollectionPhase } {
    const messages = new MessageView(this.page);
    const hub = new ActionHub(this.env, this.page, new ElementFactory());
    this.env.onBlur(() => hub.releaseAll());
    const screens = new CollectionScreens(this.page, this.env.touchDevice, messages, hub);
    const host: HostGate = { isHost: () => this.flow.isHost() };
    const runtime = new GameRuntime(this.catalog, {
      libs: this.libs, page: this.page, env: this.env, clock: this.backend.clock, render: this.render,
      characters: { assets: this.assets, factory: this.factory }, localId: this.localId, host
    }, hub);
    const spectatorBar = new SpectatorViewBar(this.page);
    spectatorBar.onPick((id) => runtime.onSpectateTo(id));
    const lobbyView = new CollectionLobbyView(this.page, this.catalog);
    const resultView = new CollectionResultView(this.page, this.catalog);
    const services: CollectionServices = {
      clock: this.backend.clock, screens, runtime, hud: new CollectionHud(this.page), spectatorBar, messages, hub, render: this.render, backdrops: this.backdrops, catalog: this.catalog,
      lobbyView, resultView, profilePanel: this.profilePanel,
      startProfileHost: this.page.byId("profileHost"), lobbyProfileHost: this.page.byId("lobbyProfileHost"), practiceProfileHost: this.page.byId("practiceProfileHost"),
      partyProfileHost: this.page.byId("partyProfileHost"),
      localId: this.localId, session: () => this.flow.session(), directory: { lookup: (id) => this.flow.lookup(id) },
      matchedInfo: { matched: () => this.flow.random.matched(), streakText: () => this.flow.random.streakText() }
    };
    const startPhase = new StartScreenPhase(services);
    const flow = new CollectionFlow({
      env: this.env, backend: this.backend, directory: new CollectionDirectory(this.backend, this.env, this.tokens), catalog: this.catalog, profile: this.profile,
      startView: this.startView, practiceEntry: this.practiceEntry, practiceMenu: this.practiceMenu, lobbyView, resultView, runtime, hub, phases: this.phases,
      randomEntry: this.randomEntry, partyScreen: this.page.byId("partyScreen"), partyMount: this.page.byId("partyMount"), partyPhase: new PartyScreenPhase(services), versusScreen: new CollectionVersusScreen(this.page, this.env), screens,
      startPhase, lobbyPhase: new LobbyScreenPhase(services), practicePhase: new PracticeScreenPhase(services), playPhase: new PlayScreenPhase(services), resultPhase: new ResultScreenPhase(services),
      random: new RandomRange(this.randomSource), localId: this.localId
    });
    return { flow, startPhase };
  }

  private async loadAssets(): Promise<void> {
    this.phases.goTo(this.startPhase);
    try {
      this.assets.onProgress = (progress) => this.gauge.count("characters", progress);
      await this.assets.load();
      await this.catalog.preloadAll(new LoadCounter((counter) => this.gauge.count("games", counter)));
      await this.gauge.phase("ready");
      this.assetsReady = true;
      this.backdrops.markReady();
      this.gauge.finish();
      this.profilePanel.markReady();
      this.updateStartButtons();
      this.flow.resumeAfterReload();
    } catch (error) {
      this.gauge.fail("캐릭터와 경기장을 불러오지 못했어요: " + LoadGauge.describe(error), () => this.loadAssets());
    }
  }

  private updateStartButtons(): void {
    const ready = this.backend.isOnline() && this.assetsReady;
    this.startView.setOnlineReady(ready);
    this.practiceEntry.setEnabled(ready);
    this.randomEntry.setEnabled(ready);
    if (!this.backend.isOnline()) this.startView.showMessage("온라인 연결을 할 수 없어요. (common/firebase-config.js·인터넷 확인)");
  }

  private readonly frame = (timeMs: number): void => {
    this.env.requestFrame(this.frame);
    const dt = Math.min(MiniGamesApp.MAX_FRAME_SECONDS, (timeMs - this.lastFrameMs) / 1000);
    this.lastFrameMs = timeMs;
    this.tick(dt, true);
  };

  private backupTick(): void {
    const nowMs = this.env.nowMs();
    if (nowMs - this.lastFrameMs < MiniGamesApp.BACKUP_AFTER_MS) return;
    this.tick(Math.min(MiniGamesApp.MAX_BACKUP_SECONDS, (nowMs - this.lastTickMs) / 1000), false);
  }

  private tick(dt: number, draw: boolean): void {
    this.lastTickMs = this.env.nowMs();
    this.render.trackFrameTime(dt);
    this.phases.update(dt, draw);
    this.flow.tickVersus();
  }
}

type MiniGamesLoadStep = "library" | "characters" | "games" | "ready";

class MiniGamesLoading {
  static readonly PHASES: Readonly<Record<MiniGamesLoadStep, LoadGaugePhase>> = {
    library: { at: 0.06, text: "그래픽 라이브러리 받는 중…" },
    characters: { at: 0.1, span: 0.45, text: "캐릭터 파일 받는 중…" },
    games: { at: 0.55, span: 0.37, text: "미니게임 경기장 준비 중…" },
    ready: { at: 0.96, text: "대기실 꾸미는 중…" },
  };

  static gauge(): LoadGauge<MiniGamesLoadStep> {
    return new LoadGauge({ title: "미니게임 모음 준비 중", phases: MiniGamesLoading.PHASES, place: "bottom" });
  }
}

class MiniGamesBoot {
  private readonly three: ThreeBoot<string, MiniGamesApp>;

  constructor(importer: () => Promise<ThreeLibs>) {
    const gauge = MiniGamesLoading.gauge();
    this.three = new ThreeBoot(gauge, "library", importer, (libs) => {
      const app = new MiniGamesApp(libs, gauge);
      app.start();
      return app;
    });
  }

  get game(): MiniGamesApp | null { return this.three.started; }
}
