type BbLoadStep = "library" | "files" | "park" | "players";

type BbLoadReport = Pick<LoadGauge<BbLoadStep>, "count" | "phase">;

class BbLoading {
  static readonly PHASES: Readonly<Record<BbLoadStep, LoadGaugePhase>> = {
    library: { at: 0.06, text: "그래픽 라이브러리 받는 중…" },
    files: { at: 0.1, span: 0.7, text: "선수 파일 받는 중…" },
    park: { at: 0.82, text: "야구장 만드는 중…" },
    players: { at: 0.92, text: "선수 준비하는 중…" },
  };

  static gauge(): LoadGauge<BbLoadStep> {
    return new LoadGauge({ title: "야구장 준비 중", phases: BbLoading.PHASES, place: "bottom" });
  }
}

class BbBoot {
  private readonly three: ThreeBoot<string, BbDuelGame>;

  constructor(importer: () => Promise<ThreeLibs>) {
    const gauge = BbLoading.gauge();
    this.three = new ThreeBoot(gauge, "library", importer, (libs) => new BbDuelGame(libs, gauge));
  }

  get game(): BbDuelGame | null { return this.three.started; }
}
