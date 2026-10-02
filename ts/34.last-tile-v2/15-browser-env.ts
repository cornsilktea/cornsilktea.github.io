interface KeyPress {
  readonly key: string;
  readonly code: string;
  readonly repeat: boolean;
  readonly inTextField: boolean;
  preventDefault(): void;
}

interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

class BrowserEnv {
  readonly touchDevice: boolean;

  constructor(private readonly win: Window = window) {
    this.touchDevice = "ontouchstart" in win || (navigator.maxTouchPoints || 0) > 0;
  }

  viewport(): ViewportSize {
    return { width: this.win.innerWidth, height: this.win.innerHeight };
  }

  devicePixelRatio(): number {
    return this.win.devicePixelRatio || 1;
  }

  nowMs(): number {
    return performance.now();
  }

  isPageHidden(): boolean {
    return document.hidden;
  }

  onResize(handler: () => void): void {
    this.win.addEventListener("resize", handler);
  }

  onBlur(handler: () => void): void {
    this.win.addEventListener("blur", handler);
  }

  onPageHide(handler: () => void): void {
    this.win.addEventListener("pagehide", handler);
  }

  onKeyDown(handler: (key: KeyPress) => void): void {
    this.win.addEventListener("keydown", (event) => handler(this.toKeyPress(event)));
  }

  onKeyUp(handler: (key: KeyPress) => void): void {
    this.win.addEventListener("keyup", (event) => handler(this.toKeyPress(event)));
  }

  requestFrame(callback: (timeMs: number) => void): void {
    this.win.requestAnimationFrame(callback);
  }

  everyMs(intervalMs: number, callback: () => void): void {
    this.win.setInterval(callback, intervalMs);
  }

  afterMs(delayMs: number, callback: () => void): void {
    this.win.setTimeout(callback, delayMs);
  }

  async readJson(url: string): Promise<unknown> {
    const response = await this.win.fetch(url);
    return response.ok ? response.json() : null;
  }

  portalConfig(): PortalConfig | null {
    return this.win.PORTAL_CONFIG || null;
  }

  firebaseApi(): Window["firebase"] {
    return this.win.firebase;
  }

  createQualityGovernor(options: QualityGovernorOptions): QualityGovernorHandle {
    const factory = this.win.QualityGovernor;
    if (factory) return factory(options);
    return { update: () => undefined, lower: () => false, restore: () => undefined, stepsTaken: 0 };
  }

  private toKeyPress(event: KeyboardEvent): KeyPress {
    const target = event.target as HTMLElement | null;
    const inTextField = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
    return { key: event.key, code: event.code, repeat: event.repeat, inTextField, preventDefault: () => event.preventDefault() };
  }
}

class Page {
  byId<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
  }

  show(element: HTMLElement, visible: boolean): void {
    element.hidden = !visible;
  }

  setText(element: HTMLElement, text: string): void {
    if (element.textContent !== text) element.textContent = text;
  }

  createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  isFocused(element: HTMLElement): boolean {
    return document.activeElement === element;
  }
}
