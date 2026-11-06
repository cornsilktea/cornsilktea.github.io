class FreezeHudBuilder {
  private static readonly SPECTATOR_NOTE = "관전 중 · 다음 종목부터 함께해요";
  private static readonly FINISHED_NOTE = "완주! 다른 사람을 기다려요";
  private static readonly CAUGHT_NOTE = "걸렸어요! 출발선에서 다시 달려요";

  constructor(
    private readonly localId: string,
    private readonly startAt: number,
    private readonly endAt: number,
    private readonly arena: FreezeArena,
    private readonly standings: FreezeStandings
  ) {}

  build(now: number): HudModel {
    const mine = this.arena.get(this.localId);
    const order = this.standings.order();
    return {
      rows: order.map((runner) => this.rowOf(runner)),
      summary: mine ? "걸린 횟수 " + mine.runner.hits + "회" : "",
      clock: this.clockText(now),
      footer: mine ? this.remainingText(mine.runner) : "",
      viewTargets: [],
      viewingId: null,
      cooldowns: [],
      bannerHtml: "",
      bannerWarning: false,
      centerText: now < this.startAt ? String(Math.max(1, Math.ceil((this.startAt - now) / 1000))) : "",
      spectateButton: false
    };
  }

  noteFor(now: number): string {
    const mine = this.arena.get(this.localId);
    if (now < this.startAt) return "";
    if (!mine) return FreezeHudBuilder.SPECTATOR_NOTE;
    if (mine.runner.isFinished()) return FreezeHudBuilder.FINISHED_NOTE;
    return mine.runner.isLocked(now) ? FreezeHudBuilder.CAUGHT_NOTE : "";
  }

  private rowOf(runner: FreezeRunnerState): HudRow {
    const participant = runner.participant;
    return {
      id: runner.id,
      nick: participant.nick,
      slot: participant.slot,
      ai: participant.ai,
      dead: false,
      detail: runner.isFinished() ? "완주 " + this.seconds(runner.finishedAt) + "초" : Math.floor(runner.progress() * 100) + "%",
      progress: runner.progress()
    };
  }

  private seconds(at: number): string {
    return Math.max(0, (at - this.startAt) / 1000).toFixed(1);
  }

  private remainingText(runner: FreezeRunnerState): string {
    return runner.isFinished() ? "결승선 도착" : "결승선까지 " + Math.max(0, Math.ceil(FreezeRules.TRACK_LENGTH - runner.dist)) + "m";
  }

  private clockText(now: number): string {
    const left = MathUtil.clamp(this.endAt - now, 0, FreezeRules.GAME_MS);
    const seconds = Math.ceil(left / 1000);
    return Math.floor(seconds / 60) + ":" + ("0" + seconds % 60).slice(-2);
  }
}

class FreezeGame extends MiniGame implements FreezeWireTarget, FreezeOutlet {
  private readonly endAt: number;
  private readonly input = new FreezeRunInput();
  private readonly log = new FreezeCycleLog();
  private readonly arena: FreezeArena;
  private readonly standings: FreezeStandings;
  private readonly stage: FreezeScene;
  private readonly camera: FreezeCamera;
  private readonly watcher: FreezeWatcherView;
  private readonly cone: FreezeVisionCone;
  private readonly effects: FreezeEffectsKit;
  private readonly views: FreezeRunnerViews;
  private readonly signal: FreezeSignalHud;
  private readonly wire: FreezeWire;
  private readonly referee: FreezeReferee;
  private readonly hudBuilder: FreezeHudBuilder;
  private readonly handlers: Readonly<Record<string, (key: string, value: unknown) => void>>;
  private lastPositionAt = 0;
  private concluded = false;

  constructor(context: MiniGameContext, assets: FreezeAssets) {
    super(context);
    this.endAt = context.startAt + FreezeRules.GAME_MS;
    this.arena = new FreezeArena(context.participants, context.seed, new FreezeDriverFactory(context.localId, this.input, context.host, new MathRandomSource()));
    this.standings = new FreezeStandings(this.arena.runners());
    this.stage = new FreezeScene(context.libs, context.page, assets);
    this.camera = new FreezeCamera(this.stage.camera, context.env);
    this.watcher = new FreezeWatcherView(context.libs, assets, context.characters.assets.clips, this.stage.world);
    this.cone = new FreezeVisionCone(context.libs, this.stage.world);
    this.effects = new FreezeEffectsKit(context.libs, context.page);
    const kit = new FighterViewKit(context.libs, context.page, new NameTagFactory(context.libs, context.page));
    this.views = new FreezeRunnerViews(kit, this.effects, context.characters.factory, context.characters.assets, this.stage.world);
    this.views.build(this.arena.runners(), context.looks, context.localId, true);
    this.signal = new FreezeSignalHud(context.page);
    this.wire = new FreezeWire(context.wire);
    this.referee = new FreezeReferee(context.host, context.startAt, this.endAt, this.arena, this.log, new RandomRange(new MathRandomSource()), this);
    this.hudBuilder = new FreezeHudBuilder(context.localId, context.startAt, this.endAt, this.arena, this.standings);
    this.handlers = FreezeWire.handlers(this);
    assets.loadCheer();
  }

  streams(): readonly WireStream[] {
    return FreezeWire.streams();
  }

  controls(): ControlSpec {
    return {
      stick: false,
      buttons: [{ action: FreezeRunButton.ACTION, label: "달리기", codes: ["Space", "KeyW", "ArrowUp"], color: "rgba(217, 123, 79, .78)", rightPx: 0, bottomPx: 28, hold: true, wide: true }]
    };
  }

  startAt(): number {
    return this.context.startAt;
  }

  tick(dt: number, draw: boolean): void {
    const now = this.context.clock.now();
    if (now >= this.context.startAt) {
      const situation: FreezeSituation = { now, log: this.log };
      this.arena.all().forEach((contestant) => {
        const result = contestant.driver.advance(contestant.runner, dt, situation, this.endAt);
        if (result.caught) this.reportHit(contestant.runner, now);
      });
      this.publishPositions(now);
    }
    this.referee.step(now);
    if (draw) this.draw(now, dt);
  }

  perform(action: string): void {
    this.input.handle(action);
  }

  spectateNext(): void {
    return;
  }

  receive(stream: string, key: string, value: unknown): void {
    const handler = this.handlers[stream];
    if (handler) handler(key, value);
  }

  receivePosition(key: string, value: unknown): void {
    const contestant = this.arena.get(key);
    const snapshot = FreezePositionCodec.decode(value);
    if (contestant && snapshot && !contestant.driver.simulatesHere()) contestant.runner.observe(snapshot);
  }

  receiveCycle(value: unknown): void {
    this.log.accept(value);
  }

  receiveHit(value: unknown): void {
    const record = FreezeRecords.hit(value);
    const contestant = record ? this.arena.get(record.id) : null;
    if (record && contestant) contestant.runner.applyCatch(record.n, record.t, record.d);
  }

  receiveFinish(key: string, value: unknown): void {
    const record = FreezeRecords.finish(value);
    const contestant = this.arena.get(key);
    if (record && contestant) contestant.runner.confirmFinish(record.t);
  }

  publishCycle(record: FreezeCycleRecord): void {
    this.log.add(record);
    this.wire.publishCycle(record);
  }

  confirmFinish(id: string, t: number): void {
    const contestant = this.arena.get(id);
    if (contestant) contestant.runner.confirmFinish(t);
    this.wire.publishFinish(id, { t });
  }

  playerDeparted(id: string): void {
    this.arena.handOverToAi(id);
  }

  isOver(): boolean {
    const now = this.context.clock.now();
    if (now >= this.endAt + FreezeRules.END_GRACE_MS) return true;
    return this.standings.allFinished() && now - this.standings.lastFinishAt() >= FreezeRules.ALL_FINISHED_DELAY_MS;
  }

  ranking(): RankEntry[] {
    return this.standings.ranking();
  }

  resultNotes(): Record<string, string> {
    const notes: Record<string, string> = {};
    this.arena.runners().forEach((runner) => {
      notes[runner.id] = runner.isFinished() ? "완주 " + Math.max(0, (runner.finishedAt - this.context.startAt) / 1000).toFixed(1) + "초" : "도달 " + Math.floor(runner.progress() * 100) + "%";
    });
    return notes;
  }

  hud(now: number): HudModel {
    return this.hudBuilder.build(now);
  }

  conclude(): void {
    this.concluded = true;
  }

  dispose(): void {
    this.concluded = true;
    this.signal.hide();
    this.views.clear();
    this.watcher.dispose();
    this.cone.dispose();
    this.effects.dispose();
    this.stage.releaseMaterials();
  }

  private reportHit(runner: FreezeRunnerState, now: number): void {
    this.wire.publishHit({ id: runner.id, n: runner.hits, t: now, d: runner.dist });
  }

  private publishPositions(now: number): void {
    if (this.concluded || now - this.lastPositionAt < FreezeRules.NET_MS) return;
    this.lastPositionAt = now;
    const values: Record<string, string> = {};
    let count = 0;
    this.arena.all().forEach((contestant) => {
      if (!contestant.driver.simulatesHere() || contestant.runner.finishConfirmed) return;
      values[contestant.runner.id] = FreezePositionCodec.encode(contestant.runner, now);
      count++;
    });
    if (count > 0) this.wire.publishPositions(values);
  }

  private draw(now: number, dt: number): void {
    const phase = this.log.phaseAt(now);
    const mine = this.arena.get(this.context.localId);
    this.watcher.update(phase, now, dt);
    this.cone.update(phase, now);
    this.views.update(this.arena.runners(), now, dt);
    if (mine && !mine.runner.isFinished()) this.camera.follow(dt, mine.runner.dist, FreezeLanes.xOf(mine.runner.lane));
    else this.camera.overview(dt);
    this.signal.update(now >= this.context.startAt, phase, now, this.hudBuilder.noteFor(now));
    this.context.render.render(this.stage.scene, this.stage.camera);
  }
}

class FreezeBackdrop extends GameBackdrop {
  private static readonly RUN_LIMIT_MS = 40000;
  private static readonly REST_AFTER_FINISH_MS = 2500;
  private static readonly DEMO_NAMES: readonly string[] = ["a", "b", "c", "d", "e", "f"];

  private readonly stage: FreezeScene;
  private readonly camera: FreezeCamera;
  private readonly watcher: FreezeWatcherView;
  private readonly cone: FreezeVisionCone;
  private readonly effects: FreezeEffectsKit;
  private readonly views: FreezeRunnerViews;
  private readonly arena: FreezeArena;
  private readonly standings: FreezeStandings;
  private readonly log = new FreezeCycleLog();
  private readonly random = new RandomRange(new MathRandomSource());
  private runStartedAt = 0;

  constructor(private readonly context: BackdropContext, assets: FreezeAssets, characters: CharacterSet) {
    super();
    const page = new Page();
    const participants: MatchParticipant[] = FreezeBackdrop.DEMO_NAMES.map((nick, slot) => ({ id: "demo" + slot, nick, ai: true, slot }));
    const looks = new Map<string, CharacterLook>();
    participants.forEach((participant) => looks.set(participant.id, CharacterLooks.random()));
    this.stage = new FreezeScene(context.libs, page, assets);
    this.camera = new FreezeCamera(this.stage.camera, context.env);
    this.watcher = new FreezeWatcherView(context.libs, assets, characters.assets.clips, this.stage.world);
    this.cone = new FreezeVisionCone(context.libs, this.stage.world);
    this.effects = new FreezeEffectsKit(context.libs, page);
    const kit = new FighterViewKit(context.libs, page, new NameTagFactory(context.libs, page));
    this.arena = new FreezeArena(participants, context.clock.now() % 1000003, new FreezeDriverFactory("", new FreezeRunInput(), { isHost: () => true }, new MathRandomSource()));
    this.standings = new FreezeStandings(this.arena.runners());
    this.views = new FreezeRunnerViews(kit, this.effects, characters.factory, characters.assets, this.stage.world);
    this.views.build(this.arena.runners(), looks, "", false);
    this.runStartedAt = context.clock.now();
    assets.loadCheer();
  }

  render(dt: number): void {
    const now = this.context.clock.now();
    this.keepCycles(now);
    const situation: FreezeSituation = { now, log: this.log };
    this.arena.all().forEach((contestant) => contestant.driver.advance(contestant.runner, dt, situation, Infinity));
    this.restartWhenDone(now);
    const phase = this.log.phaseAt(now);
    this.watcher.update(phase, now, dt);
    this.cone.update(phase, now);
    this.views.update(this.arena.runners(), now, dt);
    this.camera.showcase(dt);
    this.context.render.render(this.stage.scene, this.stage.camera);
  }

  dispose(): void {
    this.views.clear();
    this.watcher.dispose();
    this.cone.dispose();
    this.effects.dispose();
    this.stage.releaseMaterials();
  }

  private keepCycles(now: number): void {
    const latest = this.log.latest();
    if (!latest) this.log.add(FreezeCycleDraft.draw(0, now, this.random));
    else if (latest.end() - now <= FreezeRules.CYCLE_LEAD_MS) this.log.add(FreezeCycleDraft.draw(latest.n + 1, Math.max(latest.end(), now), this.random));
  }

  private restartWhenDone(now: number): void {
    const everyoneRested = this.standings.allFinished() && now - this.standings.lastFinishAt() >= FreezeBackdrop.REST_AFTER_FINISH_MS;
    if (!everyoneRested && now - this.runStartedAt < FreezeBackdrop.RUN_LIMIT_MS) return;
    this.runStartedAt = now;
    this.arena.runners().forEach((runner) => runner.reset());
  }
}

class FreezeDefinition extends GameDefinition {
  readonly id = "freeze";
  readonly title = "무궁화꽃이 피었습니다";
  readonly summary = "구호가 끝나기 전에 멈춰야 하는 60초 달리기 경주";
  readonly keyHelp: readonly KeyHelp[] = [
    { keys: ["스페이스", "W", "↑"], text: "누르고 있는 동안 달리기 (떼면 바로 멈춰요)" },
    { keys: ["태블릿"], text: "화면 아래 큰 달리기 버튼을 누르고 있기" }
  ];
  readonly rules: readonly string[] = [
    "6명이 나란히 서서 <b>결승선</b>까지 달려요. 결승선 쪽에 선 <b>해골 술래</b>가 구호를 외치는 동안은 마음껏 달릴 수 있어요.",
    "구호가 끝나는 순간 술래의 <b>눈이 붉게 번쩍</b>하고 곧 이쪽을 돌아봐요. 돌아보는 동안 <b>달리기 버튼을 누르고 있으면</b> 걸려서 출발선으로 끌려가요.",
    "구호 속도는 매번 달라요. <b>구호 끝을 잘 읽고</b> 멈추세요. 돌아보는 시간도 매번 달라요.",
    "60초 안에 결승선에 먼저 닿은 순서대로 순위가 정해져요. 못 닿았으면 결승선에 가까운 순서예요."
  ];

  private readonly assets: FreezeAssets;

  constructor(libs: ThreeLibs, private readonly characters: CharacterAssets, private readonly factory: CharacterModelFactory) {
    super();
    this.assets = new FreezeAssets(libs, characters);
  }

  preload(): Promise<void> {
    return this.assets.load();
  }

  create(context: MiniGameContext): MiniGame {
    return new FreezeGame(context, this.assets);
  }

  createBackdrop(context: BackdropContext): GameBackdrop {
    return new FreezeBackdrop(context, this.assets, { assets: this.characters, factory: this.factory });
  }
}
