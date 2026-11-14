interface BbPlayLabOptions {
  batsLeft: boolean;
  throwsLeft: boolean;
  seed: number;
  level: BbAiLevelId;
  autoSwingAt: number | null;
  autoPitch: boolean;
  plain: boolean;
}

class BbPlayLabAddress {
  private static readonly DEFAULT_SEED = 41;

  static read(): BbPlayLabOptions {
    const query = new URLSearchParams(location.search), level = query.get("level"), swing = query.get("swing");
    return {
      batsLeft: query.get("bat") === "L", throwsLeft: query.get("arm") === "L",
      seed: Number(query.get("seed") || BbPlayLabAddress.DEFAULT_SEED) || BbPlayLabAddress.DEFAULT_SEED,
      level: level === "easy" || level === "hard" ? level : "normal",
      autoSwingAt: swing === null ? null : (Number(swing) || 0) / 1000, autoPitch: query.has("autopitch"),
      plain: query.has("plain")
    };
  }
}

class BbPlayLab {
  private static readonly ASSET_DIRECTORY = "../assets/kaykit/";
  private static readonly END_TOAST_SECONDS = 600;

  private readonly options = BbPlayLabAddress.read();
  private readonly stage: BbStage;
  private readonly director: BbMatchDirector;
  private readonly sheet: BbSheetDialog;
  private readonly level: BbAiTuning;

  constructor(libs: ThreeLibs) {
    const controls = document.getElementById("bbControls") as HTMLElement;
    this.level = BbAiLevel.ALL[this.options.level];
    this.stage = new BbStage(libs, document.getElementById("labView") as HTMLCanvasElement);
    this.director = new BbMatchDirector(this.stage, new BbScoreHud(document.getElementById("hudTop") as HTMLElement), controls, { onEnd: (summary) => this.finish(summary), onLog: () => undefined });
    this.sheet = new BbSheetDialog(controls, new BbStageFaces(this.stage), () => this.director.preview(this.plan()));
    new BbGameMenu(controls, [{ label: "연출 빠르게", onFlip: (on) => this.director.quicken(on) }], [["연출 건너뛰기", () => this.director.skipScene()], ["나가기", () => location.reload()]]);
    if (this.options.plain) document.body.classList.add("plain");
    this.start(controls).catch((error: Error) => this.director.say("불러오지 못했어요", error.message, BbPlayLab.END_TOAST_SECONDS));
  }

  private async start(controls: HTMLElement): Promise<void> {
    await this.stage.load(BbPlayLab.ASSET_DIRECTORY, BbBallparkRegistry.MAIN, { batsLeft: this.options.batsLeft, throwsLeft: this.options.throwsLeft });
    (document.getElementById("labLoading") as HTMLElement).remove();
    if (this.options.autoPitch || this.options.autoSwingAt !== null) this.begin();
    else {
      document.body.classList.add("lobby");
      this.director.preview(this.plan());
      new BbLabLobby(controls, "야구 1대1 대전 · 조작 시험장", () => { document.body.classList.remove("lobby"); this.begin(); }, () => this.sheet.open());
    }
    this.stage.run((frameSeconds) => this.director.tick(frameSeconds));
  }

  private plan(): BbMatchPlan {
    const profile = BbProfileStore.load(), options = this.options;
    return {
      format: new BbThreeInningFormat(), names: ["AI " + this.level.label, "나"], seats: ["ai", options.autoPitch ? "ai" : "human"], level: this.level, seed: options.seed,
      halvesToPlay: null, log: [], view: null, autoSwingAt: options.autoSwingAt,
      teams: [
        BbAiLevel.team("R"),
        { lineup: profile.lineup.map((batter) => ({ ...batter, hand: options.batsLeft ? "L" : batter.hand })), pitchers: profile.pitchers.map((pitcher) => ({ ...pitcher, hand: options.throwsLeft ? "L" : pitcher.hand })) }
      ]
    };
  }

  private begin(): void {
    const plan = this.plan();
    this.director.begin(plan, new BbLocalLink(this.director, plan.seed));
  }

  private finish(summary: BbMatchSummary): void {
    const score = summary.state.score, mine = score[1], theirs = score[0];
    this.director.say(mine > theirs ? "승리!" : mine < theirs ? "패배" : "무승부", theirs + " : " + mine, BbPlayLab.END_TOAST_SECONDS);
  }
}
