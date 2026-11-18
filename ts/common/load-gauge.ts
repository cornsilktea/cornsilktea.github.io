// 공용 로딩 게이지(2026-11-18 선생님 요청). 41번 야구의 BbLoadGauge 를 뽑아 3D 에셋을 받는 모든 게임이 같이 쓴다.
// 교실에서 여러 기기가 한꺼번에 받으면 몇십 초씩 걸리므로 "지금 무엇을 몇 개째 받는지"를 막대와 글로 보여 주고,
// 실패하면 이유와 기기 이름·다시 불러오기 버튼을 띄운다. 모양은 common/theme.css 의 .lg-* 가 정한다.
//
// 게임은 단계 표(phases)만 넘긴다. 단계마다 막대 위치(at)와 문구(text)를 적고,
// 파일 여러 개를 받는 단계는 span 을 더 적어 count() 로 "n / 전체" 와 함께 at → at+span 사이를 채운다.
// 문구는 게임마다 그 게임에 맞게 쓴다(야구장 만드는 중…, 탑 쌓는 중…). 사용법은 docs/common/load-gauge.md.

interface LoadGaugePhase {
  readonly at: number;
  readonly span?: number;
  readonly text: string;
}

interface LoadGaugeCount {
  readonly done: number;
  readonly total: number;
}

type LoadGaugePlace = "center" | "bottom";

interface LoadGaugeOptions<K extends string> {
  readonly title: string;
  readonly phases: Readonly<Record<K, LoadGaugePhase>>;
  // center: 받는 동안 할 게 없는 게임(화면 가운데). bottom: 받는 동안에도 시작 화면을 볼 수 있는 게임(아래쪽에 작게).
  readonly place?: LoadGaugePlace;
}

class LoadGauge<K extends string = string> {
  // 이만큼 지나도 끝나지 않으면 "인터넷이 느리면…" 을 덧붙인다(교실 와이파이에서 멈춘 줄 알고 새로고침하는 것을 막으려고).
  static readonly SLOW_MS = 15000;
  static readonly DETAIL_LIMIT = 160;
  static readonly HIDDEN_FRAME_MS = 100;
  static readonly SLOW_NOTE = " — 인터넷이 느리면 조금 더 기다려 주세요";

  private readonly root: HTMLElement;
  private readonly titleLine: HTMLElement;
  private readonly text: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly retry: HTMLButtonElement;
  private readonly startedAt = performance.now();
  private retryAction: () => void = () => location.reload();
  private settled = false;

  constructor(private readonly options: LoadGaugeOptions<K>) {
    this.root = LoadGauge.box("lg-load lg-" + (options.place || "center"), document.body);
    this.root.hidden = true;
    this.titleLine = LoadGauge.box("lg-title", this.root, options.title);
    this.text = LoadGauge.box("lg-text", this.root);
    const bar = LoadGauge.box("lg-bar", this.root);
    this.fill = LoadGauge.box("lg-fill", bar);
    this.detail = LoadGauge.box("lg-detail", this.root);
    this.retry = document.createElement("button");
    this.retry.type = "button";
    this.retry.className = "lg-retry";
    this.retry.textContent = "다시 불러오기";
    this.retry.hidden = true;
    this.retry.addEventListener("click", () => this.pressRetry());
    this.root.appendChild(this.retry);
    // 받는 도중 스크립트 오류가 나면 막대가 멈춘 이유를 작은 글씨로 남긴다(선생님이 사진으로 알려 주기 쉽게).
    window.addEventListener("error", (event) => this.note(event.message || "스크립트 오류"));
    window.addEventListener("unhandledrejection", (event) => this.note(LoadGauge.describe(event.reason)));
  }

  static describe(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error || "알 수 없는 오류");
    return text.slice(0, LoadGauge.DETAIL_LIMIT);
  }

  static within<T>(work: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("시간 초과")), ms);
      work.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });
  }

  get open(): boolean { return !this.root.hidden; }

  // 단계 하나를 보여 주고 한 프레임 쉰다. 바로 뒤에 무거운 동기 작업(장면 만들기)이 와도 문구가 먼저 그려지게.
  // 받는 도중 다른 탭으로 가면 requestAnimationFrame 이 멈추므로, 잠깐 뒤에는 타이머로도 넘어간다(돌아올 때까지 멈추지 않게).
  phase(key: K): Promise<void> {
    const phase = this.options.phases[key];
    this.show(phase.text, phase.at);
    return new Promise((resolve) => {
      requestAnimationFrame(() => setTimeout(resolve, 0));
      setTimeout(resolve, LoadGauge.HIDDEN_FRAME_MS);
    });
  }

  count(key: K, count: LoadGaugeCount): void {
    const phase = this.options.phases[key], ratio = count.total ? count.done / count.total : 0;
    this.show(phase.text + " " + count.done + " / " + (count.total || "?") + this.slowNote(), phase.at + (phase.span || 0) * ratio);
  }

  // 단계 표에 없는 문구(예: 30번 "캐릭터 그림을 불러오지 못해…")를 그대로 띄운다.
  say(text: string, ratio: number): void { this.show(text, ratio); }

  title(text: string): void { this.titleLine.textContent = text; }

  // 다시 불러오기 버튼이 할 일. 주지 않으면 페이지를 새로 고친다.
  fail(message: string, retry?: () => void): void {
    this.settled = false;
    this.retryAction = retry || (() => location.reload());
    this.root.hidden = false;
    this.root.classList.add("failed");
    this.text.textContent = message;
    this.retry.hidden = false;
    if (!this.detail.textContent) this.detail.textContent = LoadGauge.deviceLine();
  }

  // 다 받았으면 숨긴다. 뒤에 다시 받을 것이 생기면(코스 바꾸기 등) phase·count 가 다시 띄운다.
  finish(): void {
    this.settled = true;
    this.root.hidden = true;
    this.root.classList.remove("failed");
    this.detail.textContent = "";
  }

  // 그래픽 메모리가 모자라 WebGL 이 꺼졌을 때(디벗 Chrome 120, 2026-11-16) 같은 판으로 알린다.
  contextLost(lost: boolean): void {
    if (!lost) { if (this.settled) this.finish(); else this.root.classList.remove("failed"); return; }
    const wasSettled = this.settled;
    this.fail("이 기기의 그래픽 메모리가 모자라 3D 화면이 꺼졌어요. 열려 있는 다른 게임 탭을 닫고 다시 불러와 주세요.");
    this.settled = wasSettled;
  }

  private slowNote(): string {
    return performance.now() - this.startedAt > LoadGauge.SLOW_MS ? LoadGauge.SLOW_NOTE : "";
  }

  private show(text: string, ratio: number): void {
    this.settled = false;
    this.root.hidden = false;
    this.root.classList.remove("failed");
    this.retry.hidden = true;
    this.text.textContent = text;
    this.fill.style.transform = "scaleX(" + Math.max(0, Math.min(1, ratio)).toFixed(3) + ")";
  }

  private note(text: string): void {
    if (this.open) this.detail.textContent = text.slice(0, LoadGauge.DETAIL_LIMIT);
  }

  private pressRetry(): void {
    this.retry.hidden = true;
    this.detail.textContent = "";
    this.retryAction();
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

// 여러 파일을 한꺼번에 받을 때 몇 개 받았는지 센다. 받을 약속(Promise)을 track 에 넣으면 끝날 때마다 onChange 를 부른다.
class LoadCounter implements LoadGaugeCount {
  total = 0;
  done = 0;
  readonly failed: string[] = [];

  constructor(private readonly onChange: (counter: LoadCounter) => void = () => undefined) {}

  get pending(): number { return this.total - this.done - this.failed.length; }

  track<T>(work: Promise<T>, name = ""): Promise<T> {
    this.total++;
    this.onChange(this);
    return work.then((value) => {
      this.done++;
      this.onChange(this);
      return value;
    }, (error: unknown) => {
      this.failed.push(name || "파일");
      this.onChange(this);
      throw error;
    });
  }
}

// three.js 를 동적으로 가져오는 게임의 시작점. 라이브러리를 받는 동안에도 게이지가 보이고,
// 30초 안에 못 받으면(학교 방화벽·CDN 끊김) 멈춘 화면 대신 안내와 다시 불러오기를 띄운다.
// started 는 확인용 화면(tools/*-test-page.js)이 window.__game 으로 게임 객체를 꺼내 보려고 둔다.
class ThreeBoot<K extends string, T = unknown> {
  static readonly LIBRARY_TIMEOUT_MS = 30000;
  started: T | null = null;

  constructor(gauge: LoadGauge<K>, libraryPhase: K, importer: () => Promise<ThreeLibs>, start: (libs: ThreeLibs) => T) {
    void this.run(gauge, libraryPhase, importer, start);
  }

  private async run(gauge: LoadGauge<K>, libraryPhase: K, importer: () => Promise<ThreeLibs>, start: (libs: ThreeLibs) => T): Promise<void> {
    let libs: ThreeLibs;
    void gauge.phase(libraryPhase);
    try {
      libs = await LoadGauge.within(importer(), ThreeBoot.LIBRARY_TIMEOUT_MS);
    } catch (error) {
      gauge.fail("그래픽 라이브러리(three.js)를 받지 못했어요. 인터넷을 확인하고 다시 불러와 주세요.");
      return;
    }
    try {
      this.started = start(libs);
    } catch (error) {
      gauge.fail("화면을 준비하지 못했어요: " + LoadGauge.describe(error));
    }
  }
}
