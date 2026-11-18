type ClimbLoadStep = "tower" | "ready";

class ClimbLoadGauge {
  private static readonly LIBRARY_AT = 0.06;
  private static readonly CHARACTERS_FROM = 0.1;
  private static readonly CHARACTERS_SPAN = 0.3;
  private static readonly MODELS_FROM = 0.4;
  private static readonly MODELS_SPAN = 0.45;
  private static readonly STEP_AT: Readonly<Record<ClimbLoadStep, number>> = { tower: 0.9, ready: 0.97 };
  private static readonly STEP_TEXT: Readonly<Record<ClimbLoadStep, string>> = { tower: "탑 쌓는 중…", ready: "캐릭터 준비하는 중…" };
  private static readonly SLOW_MS = 15000;
  private static readonly DETAIL_LIMIT = 160;

  private readonly root: HTMLElement;
  private readonly text: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly retry: HTMLButtonElement;
  private readonly startedAt = performance.now();
  private done = false;

  constructor() {
    this.root = ClimbLoadGauge.box("climb-load", document.body);
    ClimbLoadGauge.box("climb-load-title", this.root, "타워 준비 중");
    this.text = ClimbLoadGauge.box("climb-load-text", this.root);
    const bar = ClimbLoadGauge.box("climb-load-bar", this.root);
    this.fill = ClimbLoadGauge.box("climb-load-fill", bar);
    this.detail = ClimbLoadGauge.box("climb-load-detail", this.root);
    this.retry = document.createElement("button");
    this.retry.type = "button";
    this.retry.className = "climb-load-retry";
    this.retry.textContent = "다시 불러오기";
    this.retry.hidden = true;
    this.retry.addEventListener("click", () => location.reload());
    this.root.appendChild(this.retry);
    window.addEventListener("error", (event) => this.note(event.message || "스크립트 오류"));
    window.addEventListener("unhandledrejection", (event) => this.note(ClimbLoadGauge.describe(event.reason)));
    this.show("그래픽 라이브러리 받는 중…", 0.02);
  }

  static describe(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error || "알 수 없는 오류");
    return text.slice(0, ClimbLoadGauge.DETAIL_LIMIT);
  }

  library(): void { this.show("그래픽 라이브러리 받는 중…", ClimbLoadGauge.LIBRARY_AT); }

  characters(progress: CharacterLoadProgress): void {
    this.show("캐릭터 파일 받는 중… " + progress.done + " / " + progress.total + this.slowNote(), ClimbLoadGauge.CHARACTERS_FROM + ClimbLoadGauge.CHARACTERS_SPAN * progress.ratio);
  }

  models(progress: CharacterLoadProgress): void {
    this.show("탑 블록·소품 받는 중… " + progress.done + " / " + progress.total + this.slowNote(), ClimbLoadGauge.MODELS_FROM + ClimbLoadGauge.MODELS_SPAN * progress.ratio);
  }

  step(step: ClimbLoadStep): Promise<void> {
    this.show(ClimbLoadGauge.STEP_TEXT[step], ClimbLoadGauge.STEP_AT[step]);
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  fail(message: string): void {
    this.root.hidden = false;
    this.root.classList.add("failed");
    this.text.textContent = message;
    this.retry.hidden = false;
    if (!this.detail.textContent) this.detail.textContent = ClimbLoadGauge.deviceLine();
  }

  finish(): void {
    this.done = true;
    this.root.hidden = true;
  }

  private slowNote(): string {
    return performance.now() - this.startedAt > ClimbLoadGauge.SLOW_MS ? " — 인터넷이 느리면 조금 더 기다려 주세요" : "";
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
    if (!this.done) this.detail.textContent = text.slice(0, ClimbLoadGauge.DETAIL_LIMIT);
  }

  private static box(className: string, parent: HTMLElement, text = ""): HTMLElement {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  private static deviceLine(): string {
    const agent = navigator.userAgent, browser = /SamsungBrowser\/[\d.]+/.exec(agent) || /Chrome\/\d+/.exec(agent) || /Version\/[\d.]+ Mobile/.exec(agent);
    const model = /;\s*(SM-[A-Z0-9]+)/.exec(agent);
    return [model ? model[1] : "", browser ? browser[0] : ""].filter((part) => !!part).join(" · ");
  }
}

class ClimbBoot {
  private static readonly LIBRARY_TIMEOUT_MS = 30000;

  constructor(importer: () => Promise<ThreeLibs>) {
    void this.start(importer, new ClimbLoadGauge());
  }

  private async start(importer: () => Promise<ThreeLibs>, gauge: ClimbLoadGauge): Promise<void> {
    let libs: ThreeLibs;
    gauge.library();
    try {
      libs = await ClimbBoot.within(importer(), ClimbBoot.LIBRARY_TIMEOUT_MS);
    } catch (error) {
      gauge.fail("그래픽 라이브러리(three.js)를 받지 못했어요. 인터넷을 확인하고 다시 불러와 주세요.");
      return;
    }
    try {
      new TowerClimbGame(libs, gauge);
    } catch (error) {
      gauge.fail("화면을 준비하지 못했어요: " + ClimbLoadGauge.describe(error));
    }
  }

  private static within<T>(work: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("시간 초과")), ms);
      work.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });
  }
}
