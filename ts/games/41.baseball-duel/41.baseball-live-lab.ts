interface BbLiveLabOptions {
  view: BbLiveView;
  batsLeft: boolean;
  throwsLeft: boolean;
  seed: number;
  speed: number;
  skip: number;
  segment: number;
  freezeAt: number | null;
  plain: boolean;
}

class BbLiveLabAddress {
  static readonly VIEWS: ReadonlyArray<readonly [BbLiveView, string]> = [["pitcher", "투수 시점"], ["batter", "타자 시점"]];
  private static readonly DEFAULT_SEED = 41;

  static read(): BbLiveLabOptions {
    const query = new URLSearchParams(location.search), freeze = query.get("freeze");
    return {
      view: query.get("cam") === "batter" ? "batter" : "pitcher",
      batsLeft: query.get("bat") === "L", throwsLeft: query.get("arm") === "L",
      seed: Number(query.get("seed") || BbLiveLabAddress.DEFAULT_SEED) || BbLiveLabAddress.DEFAULT_SEED,
      speed: Number(query.get("speed") || 1) || 1,
      skip: Math.max(0, Number(query.get("skip") || 0) || 0),
      segment: Math.max(0, Number(query.get("segment") || 0) || 0),
      freezeAt: freeze === null ? null : Number(freeze),
      plain: query.has("plain")
    };
  }

  static go(options: BbLiveLabOptions, change: Partial<BbLiveLabOptions>): void {
    const next = { ...options, ...change }, query = new URLSearchParams();
    if (next.view !== "pitcher") query.set("cam", next.view);
    if (next.batsLeft) query.set("bat", "L");
    if (next.throwsLeft) query.set("arm", "L");
    if (next.seed !== BbLiveLabAddress.DEFAULT_SEED) query.set("seed", String(next.seed));
    location.search = query.toString();
  }
}

class BbLiveScoreLine {
  private shown: BbLiveBoard = { inning: 7, half: 0, outs: 0, balls: 0, strikes: 0, score: [0, 0] };
  private title = "";

  constructor(private readonly box: HTMLElement) {}

  pitching(live: BbLivePitch, title: string): void {
    this.title = title;
    this.write(live.batterHand === "L" ? "좌타" : "우타");
  }

  called(live: BbLivePitch): void {
    this.shown = live.board;
    this.write(live.toast);
  }

  shout(text: string): void { this.write(text); }

  swapping(): void {
    this.title = "공수 교대";
    this.write(this.shown.inning + "회 " + (this.shown.half === 0 ? "초" : "말"));
  }

  private write(note: string): void {
    const board = this.shown;
    this.box.textContent = board.inning + "회" + (board.half === 0 ? "초" : "말") + " · 손님 " + board.score[0] + " : " + board.score[1] + " 방장 · B" + board.balls + " S" + board.strikes + " O" + board.outs + " · " + this.title + " · " + note;
  }
}

interface BbLiveSegment {
  script: BbDrillScript;
  director: BbCameraDirector;
  calls: readonly BbCallCue[];
  sparks: readonly BbEffectCue[];
  mark: BbVec | null;
  arriveAt: number;
  fielding: 0 | 1;
  live: BbLivePitch | null;
  title: string;
}

class BbLiveLab {
  private static readonly ASSET_DIRECTORY = "../assets/kaykit/";
  private static readonly ZONE_LINGER_SECONDS = 0.15;
  private static readonly SPEEDS: ReadonlyArray<readonly [number, string]> = [[1, "×1"], [0.5, "×0.5"], [0.2, "×0.2"]];
  private static readonly DUGOUT_SIDES: readonly number[] = [-1, 1];

  private readonly options = BbLiveLabAddress.read();
  private readonly bar = document.getElementById("labBar") as HTMLElement;
  private readonly status = document.getElementById("labStatus") as HTMLElement;
  private readonly stage: BbStage;
  private readonly feed: BbAiGameFeed;
  private readonly score: BbLiveScoreLine;
  private readonly waiting: BbLiveSegment[] = [];
  private segment!: BbLiveSegment;
  private directed!: BbDirectedShot;
  private seconds = 0;
  private speed: number;
  private paused = false;
  private view: BbLiveView;
  private cut = true;

  constructor(libs: ThreeLibs) {
    this.speed = this.options.speed;
    this.view = this.options.view;
    this.stage = new BbStage(libs, document.getElementById("labView") as HTMLCanvasElement);
    this.feed = new BbAiGameFeed(BbBallparkRegistry.MAIN.dimensions, this.options.batsLeft ? "L" : "R", this.options.throwsLeft ? "L" : "R", this.options.seed);
    this.score = new BbLiveScoreLine(this.status);
    this.start().catch((error: Error) => { this.status.textContent = "불러오지 못했어요: " + error.message; });
  }

  private async start(): Promise<void> {
    await this.stage.load(BbLiveLab.ASSET_DIRECTORY, BbBallparkRegistry.MAIN, this.options);
    this.buildBar();
    if (this.options.plain) document.body.classList.add("plain");
    for (let skipped = 0; skipped < this.options.skip; skipped++) this.feed.next();
    this.nextSegment();
    for (let passed = 0; passed < this.options.segment; passed++) this.nextSegment();
    if (this.options.freezeAt !== null) this.freeze(this.options.freezeAt);
    this.stage.run((frameSeconds) => this.tick(frameSeconds));
  }

  private button(label: string, active: boolean, onPress: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = label;
    button.classList.toggle("on", active);
    button.addEventListener("click", onPress);
    this.bar.appendChild(button);
    return button;
  }

  private gap(): void {
    const spacer = document.createElement("span");
    spacer.className = "lab-gap";
    this.bar.appendChild(spacer);
  }

  private buildBar(): void {
    this.bar.textContent = "";
    const views = BbLiveLabAddress.VIEWS, viewButtons = views.map(([name, label]) => this.button(label, name === this.view, () => {
      this.view = name;
      this.cut = true;
      viewButtons.forEach((button, index) => button.classList.toggle("on", views[index][0] === name));
    }));
    this.gap();
    this.button(this.options.batsLeft ? "좌타" : "우타", this.options.batsLeft, () => BbLiveLabAddress.go(this.options, { batsLeft: !this.options.batsLeft, view: this.view }));
    this.button(this.options.throwsLeft ? "좌투" : "우투", this.options.throwsLeft, () => BbLiveLabAddress.go(this.options, { throwsLeft: !this.options.throwsLeft, view: this.view }));
    this.gap();
    const speeds = BbLiveLab.SPEEDS, speedButtons = speeds.map(([value, label]) => this.button(label, value === this.speed, () => {
      this.speed = value;
      speedButtons.forEach((button, index) => button.classList.toggle("on", speeds[index][0] === value));
    }));
    const pause = this.button("일시정지", false, () => { this.paused = !this.paused; pause.classList.toggle("on", this.paused); });
    this.button("다음 공 ▶", false, () => this.nextSegment());
  }

  private setup(): BbDrillSetup { return { metrics: this.stage.metrics, batsLeft: this.options.batsLeft, throwsLeft: this.options.throwsLeft }; }

  private queuePitch(): void {
    const live = this.feed.next(), play = new BbPlayChoreographer(live), script = play.build(this.setup());
    this.waiting.push({ script, director: new BbCameraDirector(play.cameraCues), calls: play.calls, sparks: play.sparks, mark: play.crossedAt, arriveAt: play.arriveAt, fielding: live.fieldingIndex, live, title: play.title });
    if (!live.halfOver) return;
    const incoming: 0 | 1 = live.fieldingIndex === 0 ? 1 : 0;
    ([[false, live.fieldingIndex], [true, incoming]] as Array<[boolean, 0 | 1]>).forEach(([entering, team]) => {
      const swap = new BbSwapChoreographer(entering, BbLiveLab.DUGOUT_SIDES[team]);
      this.waiting.push({ script: swap.build(this.setup()), director: new BbCameraDirector(swap.cameraCues), calls: swap.calls, sparks: [], mark: null, arriveAt: swap.arriveAt, fielding: team, live: null, title: swap.title });
    });
  }

  private nextSegment(): void {
    if (!this.waiting.length) this.queuePitch();
    this.segment = this.waiting.shift() as BbLiveSegment;
    this.seconds = 0;
    this.cut = true;
    if (this.segment.live) this.score.pitching(this.segment.live, this.segment.title);
    else this.score.swapping();
    this.stage.field(this.segment.fielding);
    this.stage.reset(this.segment.script);
    this.advance(0);
  }

  private freeze(seconds: number): void {
    this.paused = true;
    for (let time = 0; time < seconds - 1e-9; time += BbActionSync.FRAME_SECONDS) this.advance(Math.min(BbActionSync.FRAME_SECONDS, seconds - time));
    this.advance(0);
  }

  private advance(deltaSeconds: number): void {
    const before = this.seconds, segment = this.segment;
    this.seconds += deltaSeconds;
    const state = segment.script.ballAt(this.seconds);
    this.directed = segment.director.direct(this.view, this.seconds, state ? state.point : null);
    this.cut = this.cut || this.directed.cut;
    const pitching = this.directed.kind === "pitch";
    this.stage.advance(segment.script, this.seconds, deltaSeconds, this.view === "batter" && pitching ? BbStage.HIDDEN_BEHIND_PLATE : [], pitching && this.seconds < segment.arriveAt + BbLiveLab.ZONE_LINGER_SECONDS, pitching && this.seconds >= segment.arriveAt ? segment.mark : null);
    segment.sparks.forEach((spark) => { if (before < spark.at && this.seconds >= spark.at) this.stage.spark(spark.point); });
    if (segment.live && before < segment.arriveAt && this.seconds >= segment.arriveAt) this.score.called(segment.live);
    segment.calls.forEach((call) => { if (before < call.at && this.seconds >= call.at) this.score.shout(call.text); });
  }

  private tick(frameSeconds: number): void {
    if (!this.paused) {
      this.advance(frameSeconds * this.speed);
      if (this.seconds > this.segment.script.duration) this.nextSegment();
    }
    this.stage.aim(this.directed.shot, frameSeconds, this.cut || this.paused);
    this.cut = false;
  }
}
