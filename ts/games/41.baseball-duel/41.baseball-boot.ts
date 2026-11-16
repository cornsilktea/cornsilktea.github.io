type BbLoadStep = "park" | "players";

interface BbLoadReport {
  files(progress: CharacterLoadProgress): void;
  step(step: BbLoadStep): Promise<void>;
}

class BbLoadGauge implements BbLoadReport {
  private static readonly LIBRARY_AT = 0.06;
  private static readonly FILES_FROM = 0.1;
  private static readonly FILES_SPAN = 0.7;
  private static readonly STEP_AT: Readonly<Record<BbLoadStep, number>> = { park: 0.82, players: 0.92 };
  private static readonly STEP_TEXT: Readonly<Record<BbLoadStep, string>> = { park: "야구장 만드는 중…", players: "선수 준비하는 중…" };
  private static readonly SLOW_MS = 15000;
  private static readonly DETAIL_LIMIT = 160;

  private readonly root: HTMLElement;
  private readonly text: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly retry: HTMLButtonElement;
  private readonly startedAt = performance.now();
  private onRetry: () => void = () => undefined;
  private done = false;

  constructor() {
    this.root = BbHudParts.box("bb-load", document.body);
    BbHudParts.box("bb-load-title", this.root, "야구장 준비 중");
    this.text = BbHudParts.box("bb-load-text", this.root);
    const bar = BbHudParts.box("bb-load-bar", this.root);
    this.fill = BbHudParts.box("bb-load-fill", bar);
    this.detail = BbHudParts.box("bb-load-detail", this.root);
    this.retry = document.createElement("button");
    this.retry.type = "button";
    this.retry.className = "bb-load-retry";
    this.retry.textContent = "다시 불러오기";
    this.retry.hidden = true;
    this.retry.addEventListener("click", () => this.pressRetry());
    this.root.appendChild(this.retry);
    window.addEventListener("error", (event) => this.note(event.message || "스크립트 오류"));
    window.addEventListener("unhandledrejection", (event) => this.note(BbLoadGauge.describe(event.reason)));
    this.show("그래픽 라이브러리 받는 중…", 0.02);
  }

  static describe(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error || "알 수 없는 오류");
    return text.slice(0, BbLoadGauge.DETAIL_LIMIT);
  }

  library(): void { this.show("그래픽 라이브러리 받는 중…", BbLoadGauge.LIBRARY_AT); }

  files(progress: CharacterLoadProgress): void {
    const slow = performance.now() - this.startedAt > BbLoadGauge.SLOW_MS ? " — 인터넷이 느리면 조금 더 기다려 주세요" : "";
    this.show("선수 파일 받는 중… " + progress.done + " / " + progress.total + slow, BbLoadGauge.FILES_FROM + BbLoadGauge.FILES_SPAN * progress.ratio);
  }

  step(step: BbLoadStep): Promise<void> {
    this.show(BbLoadGauge.STEP_TEXT[step], BbLoadGauge.STEP_AT[step]);
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  fail(message: string, retry: () => void): void {
    this.onRetry = retry;
    this.root.classList.add("failed");
    this.text.textContent = message;
    this.retry.hidden = false;
    this.detail.textContent = BbLoadGauge.deviceLine();
  }

  finish(): void {
    this.done = true;
    this.root.hidden = true;
  }

  contextLost(lost: boolean): void {
    if (!lost) { this.root.hidden = this.done; this.root.classList.remove("failed"); return; }
    this.root.hidden = false;
    this.fail("이 기기의 그래픽 메모리가 모자라 3D 화면이 꺼졌어요. 열려 있는 다른 게임 탭을 닫고 다시 불러와 주세요.", () => location.reload());
  }

  private show(text: string, ratio: number): void {
    if (this.done) return;
    this.root.hidden = false;
    this.root.classList.remove("failed");
    this.retry.hidden = true;
    this.text.textContent = text;
    this.fill.style.transform = "scaleX(" + Math.max(0, Math.min(1, ratio)).toFixed(3) + ")";
  }

  private note(text: string): void {
    if (!this.done) this.detail.textContent = text.slice(0, BbLoadGauge.DETAIL_LIMIT);
  }

  private pressRetry(): void {
    this.retry.hidden = true;
    this.detail.textContent = "";
    this.onRetry();
  }

  private static deviceLine(): string {
    const agent = navigator.userAgent, browser = /SamsungBrowser\/[\d.]+/.exec(agent) || /Chrome\/\d+/.exec(agent) || /Version\/[\d.]+ Mobile/.exec(agent);
    const model = /;\s*(SM-[A-Z0-9]+)/.exec(agent);
    return [model ? model[1] : "", browser ? browser[0] : ""].filter((part) => !!part).join(" · ");
  }
}

class BbBoot {
  private static readonly LIBRARY_TIMEOUT_MS = 30000;

  constructor(importer: () => Promise<ThreeLibs>) {
    void this.start(importer, new BbLoadGauge());
  }

  private async start(importer: () => Promise<ThreeLibs>, gauge: BbLoadGauge): Promise<void> {
    let libs: ThreeLibs;
    gauge.library();
    try {
      libs = await BbBoot.within(importer(), BbBoot.LIBRARY_TIMEOUT_MS);
    } catch (error) {
      gauge.fail("그래픽 라이브러리(three.js)를 받지 못했어요. 인터넷을 확인하고 다시 불러와 주세요.", () => location.reload());
      return;
    }
    try {
      new BbDuelGame(libs, gauge);
    } catch (error) {
      gauge.fail("화면을 준비하지 못했어요: " + BbLoadGauge.describe(error), () => location.reload());
    }
  }

  private static within<T>(work: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("시간 초과")), ms);
      work.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });
  }
}
