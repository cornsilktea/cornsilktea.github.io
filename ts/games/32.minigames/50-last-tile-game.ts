class LastTileWireChannel implements MatchChannel {
  constructor(private readonly wire: GameWire, private readonly host: HostGate) {}

  publishStates(states: Record<string, string>): void {
    this.wire.writeMany("st", states);
  }

  publishPush(event: PushEvent): void {
    this.wire.push("ev", event);
  }

  publishTileStep(floor: number, index: number, t: number): void {
    const key = floor + "_" + index;
    if (this.host.isHost()) this.wire.set("tiles", key, t);
    else this.wire.claimEarliest("tileReq", key, t);
  }

  publishOut(fighterId: string, t: number): void {
    this.wire.set("out", fighterId, { t });
  }
}

interface TileReport {
  readonly floor: number;
  readonly index: number;
  readonly t: number;
}

class TileReports {
  static parse(key: string, value: unknown): TileReport | null {
    const parts = key.split("_");
    const report = { floor: +parts[0], index: +parts[1], t: +(value as number) };
    return !isNaN(report.index) && isFinite(report.t) ? report : null;
  }
}

class LastTileScene {
  readonly scene: Three<"Scene">;
  readonly camera: Three<"PerspectiveCamera">;
  readonly world: Three<"Group">;

  constructor(libs: ThreeLibs) {
    const THREE = libs.THREE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(Palette.SKY);
    this.scene.fog = new THREE.Fog(Palette.SKY, 30, 78);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
    this.scene.add(new THREE.HemisphereLight(Palette.SKY_LIGHT, Palette.GROUND_LIGHT, 1.05));
    const sun = new THREE.DirectionalLight(Palette.SUN_LIGHT, 1.6);
    sun.position.set(6, 16, 9);
    this.scene.add(sun);
    this.world = new THREE.Group();
    this.scene.add(this.world);
  }

  releaseMaterials(): void {
    this.scene.traverse((object) => {
      const material = (object as { material?: Three<"Material"> | Three<"Material">[] }).material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else if (material) material.dispose();
    });
  }
}

class LastTileGame extends MiniGame {
  private static readonly SUDDEN_DEATH_MESSAGE = "서든데스! 위층 바깥부터 무너집니다";
  private static readonly SPECTATOR_MESSAGE = "관전 중 · 다음 종목부터 함께해요";

  private readonly stage: LastTileScene;
  private readonly match: LastTileMatch;
  private readonly board: BoardView;
  private readonly floors: FloorPresenter;
  private readonly rig: CameraRig;
  private readonly views: FighterViews;
  private readonly cursor: SpectatorCursor;
  private readonly handlers: Readonly<Record<string, (key: string, value: unknown) => void>>;
  private subject: Fighter | null = null;
  private concluded = false;
  private readonly declaredOut = new Set<string>();

  constructor(context: MiniGameContext, scenery: SceneryKit) {
    super(context);
    this.stage = new LastTileScene(context.libs);
    this.board = new BoardView(context.libs, this.stage.scene, scenery);
    this.board.build();
    this.floors = new FloorPresenter(this.board, context.page.byId("fade"), context.env);
    this.floors.showTop();
    this.rig = new CameraRig(this.stage.camera, context.env);
    this.cursor = new SpectatorCursor(context.localId);
    const labels = new NameTagFactory(context.libs, context.page);
    this.views = new FighterViews(new FighterViewKit(context.libs, context.page, labels), context.characters.factory, context.characters.assets, this.stage.world);
    this.match = new LastTileMatch(
      { seed: context.seed, startAt: context.startAt, participants: context.participants },
      {
        clock: context.clock,
        channel: new LastTileWireChannel(context.wire, context.host),
        controllers: new RoundControllers(context.localId, context.movement, context.host, new MathRandomSource()),
        localId: context.localId
      }
    );
    this.views.rebuild(this.match, context.looks);
    this.handlers = {
      st: (key, value) => this.receiveState(key, value),
      ev: (key, value) => this.match.receivePush(value as PushEvent),
      tiles: (key, value) => this.receiveTile(key, value),
      tileReq: (key, value) => this.arbitrateTile(key, value),
      out: (key, value) => this.match.receiveOut(key, ((value as OutRecord | null) || { t: this.context.clock.now() }).t)
    };
  }

  streams(): readonly WireStream[] {
    return [
      { name: "st", events: ["child_added", "child_changed"] },
      { name: "ev", events: ["child_added"] },
      { name: "tiles", events: ["child_added", "child_changed"] },
      { name: "tileReq", events: ["child_added", "child_changed"] },
      { name: "out", events: ["child_added"] }
    ];
  }

  controls(): ControlSpec {
    return {
      stick: true,
      buttons: [
        { action: "push", label: "밀치기", codes: ["KeyJ"], color: "rgba(217, 123, 79, .82)", rightPx: 18, bottomPx: 96 },
        { action: "dash", label: "대시", codes: ["KeyK", "Space"], color: "rgba(76, 141, 255, .8)", rightPx: 112, bottomPx: 28 }
      ]
    };
  }

  startAt(): number {
    return this.match.startAt();
  }

  tick(dt: number, draw: boolean): void {
    this.match.tick(dt);
    this.subject = this.chooseSubject();
    if (!draw) return;
    const t = this.context.clock.now();
    this.floors.follow(this.subject);
    this.views.update(this.match, dt, t, this.subject, this.floors.shownFloor);
    this.board.render(this.match.board, t, this.floors.shownFloor);
    this.rig.follow(dt, this.subject, this.floors.shownFloor);
    this.context.render.render(this.stage.scene, this.stage.camera);
  }

  perform(action: string): void {
    if (action === "push") this.match.localPush();
    else if (action === "dash") this.match.localDash();
  }

  spectateNext(): void {
    this.cursor.cycle(this.aliveIds());
  }

  spectateTo(id: string): void {
    this.cursor.select(id, this.aliveIds());
  }

  receive(stream: string, key: string, value: unknown): void {
    const handler = this.handlers[stream];
    if (handler) handler(key, value);
  }

  playerDeparted(id: string): void {
    const unrecorded = !!this.match.contestant(id) && !this.match.isOut(id);
    this.match.markDeparted(id);
    if (!unrecorded || this.concluded || this.declaredOut.has(id) || !this.context.host.isHost()) return;
    this.declaredOut.add(id);
    this.context.wire.set("out", id, { t: this.context.clock.now(), left: 1 });
  }

  isOver(): boolean {
    return this.match.isOver();
  }

  ranking(): RankEntry[] {
    return this.match.ranking();
  }

  conclude(): void {
    this.concluded = true;
    this.match.conclude();
  }

  dispose(): void {
    this.concluded = true;
    this.match.dispose();
    this.views.clear();
    this.stage.releaseMaterials();
  }

  hud(now: number): HudModel {
    const contestants = this.match.contestants();
    const mine = this.match.contestant(this.context.localId);
    const census = new FloorCensus();
    contestants.forEach((contestant) => contestant.fighter.inspect(census));
    const elapsed = Math.max(0, (now - this.match.startAt()) / 1000);
    const started = this.match.hasStarted(now);
    const message = this.messageFor(now, started, mine);
    return {
      rows: contestants.map((contestant) => this.rowOf(contestant)),
      viewTargets: contestants.map((contestant) => ({ id: contestant.id, nick: contestant.participant.nick, slot: contestant.participant.slot, ai: contestant.participant.ai, out: contestant.fighter.isOut() })),
      viewingId: this.subject ? this.subject.id : null,
      summary: census.summary(),
      clock: started ? Math.floor(elapsed / 60) + ":" + ("0" + Math.floor(elapsed % 60)).slice(-2) : "0:00",
      footer: "남은 인원 " + this.aliveIds().length + "명",
      cooldowns: mine ? [
        { action: "push", label: "밀치기", left: mine.fighter.pushCooldownLeft(now) },
        { action: "dash", label: "대시", left: mine.fighter.dashCooldownLeft(now) }
      ] : [],
      bannerHtml: message.banner,
      bannerWarning: message.warning,
      centerText: message.center,
      spectateButton: message.spectate
    };
  }

  private messageFor(now: number, started: boolean, mine: Contestant | null): { banner: string; warning: boolean; center: string; spectate: boolean } {
    if (!started) {
      const left = this.match.startAt() - now;
      return { banner: "", warning: false, center: left > 0 ? String(Math.ceil(left / 1000)) : "", spectate: !mine };
    }
    const suddenDeath = now - this.match.startAt() > LastTileRules.SUDDEN_START_S * 1000;
    let banner = suddenDeath ? LastTileGame.SUDDEN_DEATH_MESSAGE : "";
    if (!mine) banner = LastTileGame.SPECTATOR_MESSAGE;
    else if (mine.fighter.isOut()) banner = "탈락! " + this.spectatingText(mine);
    return { banner, warning: suddenDeath, center: "", spectate: !mine || mine.fighter.isOut() };
  }

  private spectatingText(mine: Contestant): string {
    const watched = this.subject && this.subject !== mine.fighter ? this.match.contestant(this.subject.id) : null;
    return watched ? Html.escape(watched.participant.nick) + " 관전 중" : "관전 중";
  }

  private rowOf(contestant: Contestant): HudRow {
    const outLabel = this.match.isOut(contestant.id) ? this.match.provisionalRank(contestant.id) + "위" : "탈락";
    const participant = contestant.participant;
    return {
      id: contestant.id,
      nick: participant.nick,
      slot: participant.slot,
      ai: participant.ai,
      dead: contestant.fighter.isOut(),
      detail: contestant.fighter.inspect(new FloorLabel(outLabel))
    };
  }

  private aliveIds(): string[] {
    return this.match.contestants().filter((contestant) => !contestant.fighter.isOut()).map((contestant) => contestant.id);
  }

  private chooseSubject(): Fighter | null {
    const chosen = this.cursor.choose(this.aliveIds());
    const contestant = chosen ? this.match.contestant(chosen) : this.fallbackContestant();
    return contestant ? contestant.fighter : null;
  }

  private fallbackContestant(): Contestant | null {
    const watched = this.cursor.watched();
    return this.match.contestant(this.context.localId) || (watched ? this.match.contestant(watched) : null);
  }

  private receiveState(key: string, value: unknown): void {
    const snapshot = FighterStateCodec.decode(value);
    if (snapshot) this.match.receiveRemoteState(key, snapshot);
  }

  private receiveTile(key: string, value: unknown): void {
    const report = TileReports.parse(key, value);
    if (report) this.match.receiveTileStep(report.floor, report.index, report.t);
  }

  private arbitrateTile(key: string, value: unknown): void {
    if (!this.context.host.isHost()) return;
    const report = TileReports.parse(key, value);
    if (!report) return;
    const accepted = this.match.arbitrateTileRequest(report.floor, report.index, report.t);
    if (accepted !== null) this.context.wire.set("tiles", key, accepted);
  }
}

class LastTileBackdrop extends GameBackdrop {
  private static readonly TOP_FLOOR = LastTileRules.FLOOR_COUNT - 1;

  private readonly stage: LastTileScene;
  private readonly board: BoardView;
  private readonly rig: CameraRig;
  private readonly emptyBoard = TileBoard.inactive();

  constructor(private readonly context: BackdropContext, scenery: SceneryKit) {
    super();
    this.stage = new LastTileScene(context.libs);
    this.board = new BoardView(context.libs, this.stage.scene, scenery);
    this.board.build();
    this.board.showUpTo(LastTileBackdrop.TOP_FLOOR);
    this.rig = new CameraRig(this.stage.camera, context.env);
  }

  render(dt: number): void {
    this.board.render(this.emptyBoard, this.context.clock.now(), LastTileBackdrop.TOP_FLOOR);
    this.rig.showcase();
    this.context.render.render(this.stage.scene, this.stage.camera);
  }

  dispose(): void {
    this.stage.releaseMaterials();
  }
}

class LastTileDefinition extends GameDefinition {
  readonly id = "lasttile";
  readonly title = "마지막 발판";
  readonly summary = "무너지는 3층 발판 위에서 밀치고 버티는 서바이벌";
  readonly keyHelp: readonly KeyHelp[] = [
    { keys: ["W", "A", "S", "D", "↑", "←", "↓", "→"], text: "이동 (관성이 있어 바로 서지 못해요)" },
    { keys: ["J"], text: "밀치기 · 쿨타임 1초" },
    { keys: ["K", "스페이스"], text: "대시 · 쿨타임 1.5초" },
    { keys: ["Tab"], text: "탈락 후 다음 사람 관전" },
    { keys: ["태블릿"], text: "왼쪽 화면을 눌러 끌면 조이스틱, 오른쪽 아래 버튼으로 밀치기·대시" }
  ];
  readonly rules: readonly string[] = [
    "8×8 발판이 <b>3층</b>으로 쌓여 있어요. 발판은 <b>밟으면 곧 무너지고</b> 되살아나지 않아요.",
    "<b>밀치기</b>로 같은 층의 상대를 밀어 떨어뜨리고, <b>대시</b>로 빈 곳을 건너요. 대시 중에는 밀리지 않지만 도착한 곳에 발판이 없으면 떨어져요.",
    "발판 밖으로 나가면 <b>달리던 속도 그대로</b> 날아가 아래층 발판에 착지해요. 맨 아래층에서 떨어지면 탈락!",
    "오래 끌면 위층 바깥 줄부터 무너져요(서든데스). 끝까지 남은 사람이 1등, 탈락한 순서대로 순위가 정해져요."
  ];

  private readonly scenery: SceneryKit;

  constructor(libs: ThreeLibs) {
    super();
    this.scenery = new SceneryKit(libs);
  }

  preload(): Promise<void> {
    return this.scenery.load();
  }

  create(context: MiniGameContext): MiniGame {
    return new LastTileGame(context, this.scenery);
  }

  createBackdrop(context: BackdropContext): GameBackdrop {
    return new LastTileBackdrop(context, this.scenery);
  }
}
