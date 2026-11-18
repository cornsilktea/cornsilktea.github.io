type ClimbLoadStep = "library" | "characters" | "models" | "tower" | "ready";

class ClimbLoading {
  static readonly PHASES: Readonly<Record<ClimbLoadStep, LoadGaugePhase>> = {
    library: { at: 0.06, text: "그래픽 라이브러리 받는 중…" },
    characters: { at: 0.1, span: 0.3, text: "캐릭터 파일 받는 중…" },
    models: { at: 0.4, span: 0.45, text: "탑 블록·소품 받는 중…" },
    tower: { at: 0.9, text: "탑 쌓는 중…" },
    ready: { at: 0.97, text: "캐릭터 준비하는 중…" },
  };

  static gauge(): LoadGauge<ClimbLoadStep> {
    return new LoadGauge({ title: "타워 준비 중", phases: ClimbLoading.PHASES });
  }
}

class ClimbBoot {
  private readonly three: ThreeBoot<string, TowerClimbGame>;

  constructor(importer: () => Promise<ThreeLibs>) {
    const gauge = ClimbLoading.gauge();
    this.three = new ThreeBoot(gauge, "library", importer, (libs) => new TowerClimbGame(libs, gauge));
  }

  get game(): TowerClimbGame | null { return this.three.started; }
}
