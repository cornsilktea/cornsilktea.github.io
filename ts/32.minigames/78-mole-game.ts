class MoleHudBuilder {
  private static readonly SPECTATOR_NOTE = "관전 중";

  constructor(private readonly localId: string, private readonly startAt: number, private readonly match: MoleMatch) {}

  build(now: number): HudModel {
    const rel = now - this.startAt;
    const lines = MoleStandings.order(this.match.lines(Math.max(0, rel)));
    const mine = lines.find((line) => line.id === this.localId) || null;
    const locked = mine !== null && mine.tally.isLocked(rel);
    return {
      rows: lines.map((line) => this.rowOf(line)),
      summary: mine ? "콤보 " + mine.tally.combo + " · 배율 ×" + mine.tally.multiplier() : "",
      clock: this.clockText(rel),
      footer: mine ? "최고 콤보 " + mine.tally.bestCombo : MoleHudBuilder.SPECTATOR_NOTE,
      viewTargets: [],
      viewingId: null,
      cooldowns: [],
      bannerHtml: locked && mine ? "입력 잠김 " + Math.max(0, (mine.tally.lockedUntil - rel) / 1000).toFixed(1) + "초" : "",
      bannerWarning: locked,
      centerText: rel < 0 ? String(Math.max(1, Math.ceil(-rel / 1000))) : "",
      spectateButton: false
    };
  }

  private rowOf(line: MoleScoreLine): HudRow {
    const contestant = this.match.contestant(line.id) as MoleContestant;
    const participant = contestant.participant;
    const combo = line.tally.combo > 1 ? " · " + line.tally.combo + "콤보" : "";
    return {
      id: line.id,
      nick: participant.nick,
      slot: participant.slot,
      ai: participant.ai,
      dead: contestant.hasDeparted(),
      detail: contestant.hasDeparted() ? line.tally.score + "점 (나감)" : line.tally.score + "점" + combo
    };
  }

  private clockText(rel: number): string {
    const left = MathUtil.clamp(MoleRules.GAME_MS - rel, 0, MoleRules.GAME_MS);
    const seconds = Math.ceil(left / 1000);
    return Math.floor(seconds / 60) + ":" + ("0" + seconds % 60).slice(-2);
  }
}

class MoleGame extends MiniGame implements MoleWireTarget {
  private readonly endAt: number;
  private readonly match: MoleMatch;
  private readonly localPlayer: MoleLocalPlayer;
  private readonly stage: MoleStage;
  private readonly wire: MoleWire;
  private readonly outbox: MoleOutbox;
  private readonly flash: MoleScreenFlash;
  private readonly hudBuilder: MoleHudBuilder;
  private readonly picker: MoleBoardPicker | null;
  private readonly handlers: Readonly<Record<string, (key: string, value: unknown) => void>>;
  private concluded = false;

  constructor(context: MiniGameContext, assets: MoleAssets) {
    super(context);
    this.endAt = context.startAt + MoleRules.GAME_MS;
    this.match = new MoleMatch(context.participants, context.seed, context.localId);
    this.localPlayer = new MoleLocalPlayer(this.match, context.localId);
    this.stage = new MoleStage(context.libs, context.page, context.env, assets, context.characters, this.match, context.looks, context.localId);
    this.wire = new MoleWire(context.wire);
    this.outbox = new MoleOutbox(this.wire, context.localId);
    this.flash = new MoleScreenFlash(context.page, context.env);
    this.hudBuilder = new MoleHudBuilder(context.localId, context.startAt, this.match);
    this.handlers = MoleWire.handlers(this);
    const place = this.stage.localPlace();
    this.picker = place && this.localParticipates()
      ? new MoleBoardPicker(context.libs, context.page.byId<HTMLCanvasElement>("view"), this.stage.scenery.camera, this.stage.scenery.world, place, (cell) => this.tapCell(cell))
      : null;
    assets.loadClips();
  }

  streams(): readonly WireStream[] {
    return MoleWire.streams();
  }

  controls(): ControlSpec {
    return { stick: false, buttons: MoleCellKeys.buttons() };
  }

  startAt(): number {
    return this.context.startAt;
  }

  tick(dt: number, draw: boolean): void {
    const now = this.context.clock.now();
    this.publish();
    if (draw) this.draw(now - this.context.startAt, dt);
  }

  perform(action: string): void {
    const cell = MoleCellAction.cellOf(action);
    if (cell >= 0) this.tapCell(cell);
  }

  spectateNext(): void {
    return;
  }

  receive(stream: string, key: string, value: unknown): void {
    const handler = this.handlers[stream];
    if (handler) handler(key, value);
  }

  receiveHits(key: string, value: unknown): void {
    const entries = MoleHitCodec.decode(value);
    if (entries) this.match.receive(key, entries);
  }

  playerDeparted(id: string): void {
    const contestant = this.match.contestant(id);
    if (contestant) contestant.markDeparted();
  }

  isOver(): boolean {
    return this.context.clock.now() >= this.endAt + MoleRules.END_GRACE_MS;
  }

  ranking(): RankEntry[] {
    return this.match.ranking();
  }

  resultNotes(): Record<string, string> {
    const notes: Record<string, string> = {};
    this.match.lines(MoleRules.GAME_MS).forEach((line) => {
      notes[line.id] = "점수 " + line.tally.score + " · 최고 콤보 " + line.tally.bestCombo;
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
    if (this.picker) this.picker.dispose();
    this.flash.hide();
    this.stage.dispose();
  }

  private tapCell(cell: number): void {
    if (this.concluded) return;
    const rel = Math.round(this.context.clock.now() - this.context.startAt);
    if (this.localPlayer.tap(cell, rel)) this.outbox.markDirty();
  }

  private publish(): void {
    if (this.concluded) return;
    const me = this.match.contestant(this.context.localId);
    if (me && !me.computed) this.outbox.flush(this.context.env.nowMs(), me.allEntries());
  }

  private draw(rel: number, dt: number): void {
    const outcomes = this.stage.update(rel, dt);
    if (outcomes.some((outcome) => outcome.kind === "hit" && outcome.points < 0)) this.flash.pulse();
    if (this.picker) this.stage.camera.player(dt);
    else this.stage.camera.overview(dt);
    this.context.render.render(this.stage.scenery.scene, this.stage.scenery.camera);
  }
}

class MoleBackdrop extends GameBackdrop {
  private static readonly DEMO_NAMES: readonly string[] = ["a", "b", "c", "d", "e", "f"];
  private static readonly RESTART_AFTER_MS = MoleRules.GAME_MS + 1500;

  private readonly page = new Page();
  private readonly participants: MatchParticipant[];
  private readonly looks = new Map<string, CharacterLook>();
  private stage: MoleStage;
  private startedAt: number;

  constructor(private readonly context: BackdropContext, private readonly assets: MoleAssets, private readonly characters: CharacterSet) {
    super();
    this.participants = MoleBackdrop.DEMO_NAMES.map((nick, slot) => ({ id: "demo" + slot, nick, ai: true, slot }));
    this.participants.forEach((participant) => this.looks.set(participant.id, CharacterLooks.random()));
    this.startedAt = context.clock.now();
    this.stage = this.buildStage();
    assets.loadClips();
  }

  render(dt: number): void {
    const now = this.context.clock.now();
    if (now - this.startedAt > MoleBackdrop.RESTART_AFTER_MS) this.restart(now);
    this.stage.update(now - this.startedAt, dt);
    this.stage.camera.showcase(dt);
    this.context.render.render(this.stage.scenery.scene, this.stage.scenery.camera);
  }

  dispose(): void {
    this.stage.dispose();
  }

  private restart(now: number): void {
    this.stage.dispose();
    this.startedAt = now;
    this.stage = this.buildStage();
  }

  private buildStage(): MoleStage {
    const match = new MoleMatch(this.participants, this.context.clock.now() % 1000003, "");
    return new MoleStage(this.context.libs, this.page, this.context.env, this.assets, this.characters, match, this.looks, "");
  }
}

class MoleDefinition extends GameDefinition {
  readonly id = "mole";
  readonly title = "묘지 두더지";
  readonly summary = "묘비에서 튀어나오는 스켈레톤을 60초 동안 빠르고 정확하게 잡는 개인전";
  readonly keyHelp: readonly KeyHelp[] = [
    { keys: ["Q", "W", "E", "A", "S", "D", "Z", "X", "C"], text: "3×3 묘비와 같은 자리의 키를 눌러 내리치기 (숫자패드 7 8 9 / 4 5 6 / 1 2 3 도 돼요)" },
    { keys: ["태블릿"], text: "내 묘비를 직접 터치하기" }
  ];
  readonly rules: readonly string[] = [
    "6명이 각자 자기 묘지(묘비 3×3)를 갖고 60초 동안 튀어나오는 것을 망치로 잡아요. 나오는 순서와 자리는 모두 똑같아서 <b>누가 더 빠르고 정확한지</b>로 승부가 나요.",
    "<b>스켈레톤</b>은 +1점, <b>황금 해골</b>은 +5점(금방 사라져요). <b>호박 폭탄</b>은 치면 −3점에 콤보가 끊기고 0.8초 동안 기절해요. 그냥 두면 사라져요.",
    "연속으로 잡으면 <b>콤보</b>가 쌓여요. 5콤보부터 점수 ×2, 15콤보부터 ×3. 호박을 치거나 <b>빈 묘비를 헛치면</b> 콤보가 0이 되고 잠깐 못 쳐요.",
    "시간이 지날수록 더 빨리, 더 많이 나와요. 60초 때 점수가 높은 순서대로 순위가 정해져요."
  ];

  private readonly assets: MoleAssets;

  constructor(libs: ThreeLibs, private readonly characters: CharacterAssets, private readonly factory: CharacterModelFactory) {
    super();
    this.assets = new MoleAssets(libs, characters);
  }

  preload(): Promise<void> {
    this.assets.loadClips();
    return this.assets.load();
  }

  create(context: MiniGameContext): MiniGame {
    return new MoleGame(context, this.assets);
  }

  createBackdrop(context: BackdropContext): GameBackdrop {
    return new MoleBackdrop(context, this.assets, { assets: this.characters, factory: this.factory });
  }
}
