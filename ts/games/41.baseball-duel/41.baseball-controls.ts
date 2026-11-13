class BbPitchIcon {
  private static readonly START = { x: 20, y: 5 };
  private static readonly BREAK_PIXELS = 9;

  static path(kind: BbPitchKind, hand: BbHand): string {
    const start = BbPitchIcon.START;
    if (kind.arrivalJitterSeconds > 0) return "M20 5 Q14 10 20 14 Q26 18 20 22 Q16 25 20 28";
    const angle = kind.axisRadians(hand), reach = kind.isBreaking ? BbPitchIcon.BREAK_PIXELS : 0;
    const endX = 20 - Math.cos(angle) * reach, endY = 22 + Math.sin(angle) * reach;
    return "M" + start.x + " " + start.y + " Q20 " + (kind.isBreaking ? 15 : 13) + " " + endX.toFixed(1) + " " + endY.toFixed(1);
  }

  static end(kind: BbPitchKind, hand: BbHand): { x: number; y: number } {
    if (kind.arrivalJitterSeconds > 0) return { x: 20, y: 28 };
    const angle = kind.axisRadians(hand), reach = kind.isBreaking ? BbPitchIcon.BREAK_PIXELS : 0;
    return { x: 20 - Math.cos(angle) * reach, y: 22 + Math.sin(angle) * reach };
  }
}

class BbZoneAimWindow {
  private static readonly SPAN = 2.4;
  private readonly frame: HTMLElement;
  private readonly picture: SVGSVGElement;
  private readonly allowed: SVGRectElement;
  private readonly reach: SVGEllipseElement;
  private readonly ball: SVGCircleElement;
  private readonly info: HTMLElement;
  private sheet: BbPitcherSheet | null = null;
  private kind: BbPitchKind | null = null;
  private aim: BbZonePoint = { u: 0, v: 0 };
  private dragging = false;

  constructor(host: HTMLElement) {
    const span = BbZoneAimWindow.SPAN;
    this.frame = BbHudParts.box("bb-aim", host);
    this.picture = BbHudParts.shape("svg", "bb-aim-zone", this.frame, { viewBox: [-span, -span, span * 2, span * 2].join(" ") });
    this.allowed = BbHudParts.shape("rect", "bb-aim-allowed", this.picture);
    BbHudParts.shape("rect", "bb-aim-strike", this.picture, { x: -1, y: -1, width: 2, height: 2 });
    [-1 / 3, 1 / 3].forEach((line) => {
      BbHudParts.shape("line", "bb-aim-grid", this.picture, { x1: line, y1: -1, x2: line, y2: 1 });
      BbHudParts.shape("line", "bb-aim-grid", this.picture, { x1: -1, y1: line, x2: 1, y2: line });
    });
    this.reach = BbHudParts.shape("ellipse", "bb-aim-reach", this.picture);
    this.ball = BbHudParts.shape("circle", "bb-aim-ball", this.picture, { r: 0.14 });
    this.info = BbHudParts.box("bb-aim-info", this.frame);
    this.picture.addEventListener("pointerdown", (event) => { this.dragging = true; this.picture.setPointerCapture(event.pointerId); this.pointAt(event); });
    this.picture.addEventListener("pointermove", (event) => { if (this.dragging) this.pointAt(event); });
    this.picture.addEventListener("pointerup", () => { this.dragging = false; });
    this.picture.addEventListener("pointercancel", () => { this.dragging = false; });
  }

  nudge(sideways: number, upward: number): void {
    if (!this.kind) return;
    this.aim = { u: this.aim.u + sideways, v: this.aim.v + upward };
    this.draw();
  }

  get call(): BbPitchCall | null { return this.kind ? { pitch: this.kind.id, aim: { u: this.aim.u, v: this.aim.v } } : null; }

  begin(sheet: BbPitcherSheet): void {
    this.sheet = sheet;
    this.kind = null;
    this.aim = { u: 0, v: 0 };
    this.frame.classList.remove("open");
  }

  choose(kind: BbPitchKind): void {
    this.kind = kind;
    this.frame.classList.add("open");
    this.draw();
  }

  close(): void {
    this.kind = null;
    this.frame.classList.remove("open");
  }

  private pointAt(event: PointerEvent): void {
    const box = this.picture.getBoundingClientRect(), span = BbZoneAimWindow.SPAN;
    this.aim = { u: ((event.clientX - box.left) / box.width * 2 - 1) * span, v: (1 - (event.clientY - box.top) / box.height * 2) * span };
    event.preventDefault();
    this.draw();
  }

  private draw(): void {
    const sheet = this.sheet, kind = this.kind;
    if (!sheet || !kind) return;
    this.aim = BbAimLimiter.clamp(this.aim, kind, sheet.abilities, sheet.hand);
    const edge = kind.reach(sheet.abilities, sheet.hand), limitU = Math.max(0, BbPitchTuning.AIM_LIMIT - edge.u), limitV = Math.max(0, BbPitchTuning.AIM_LIMIT - edge.v);
    const place = (shape: SVGElement, values: Readonly<Record<string, number | string>>) => Object.keys(values).forEach((name) => shape.setAttribute(name, String(values[name])));
    place(this.allowed, { x: -limitU, y: -limitV, width: limitU * 2, height: limitV * 2 });
    place(this.reach, {
      cx: this.aim.u, cy: -this.aim.v, rx: kind.longDeviation(sheet.abilities) * kind.cutRadius, ry: kind.shortDeviation(sheet.abilities) * kind.cutRadius,
      transform: "rotate(" + (-kind.axisRadians(sheet.hand) * 180 / Math.PI).toFixed(1) + " " + this.aim.u + " " + (-this.aim.v) + ")"
    });
    place(this.ball, { cx: this.aim.u, cy: -this.aim.v });
    this.info.textContent = kind.label + "  약 " + Math.round(kind.speedFor(sheet.abilities)) + "km/h";
  }
}

class BbPitchPad {
  private static readonly THROW_CODES: readonly string[] = ["Space", "Enter", "NumpadEnter"];
  private static readonly ARROW_SPEED = 1.5;
  private static readonly ARROWS: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  private readonly row: HTMLElement;
  private readonly keys: HTMLButtonElement[];
  private readonly paths: SVGPathElement[];
  private readonly dots: SVGCircleElement[];
  private readonly throwButton: HTMLButtonElement;
  private readonly aim: BbZoneAimWindow;
  private readonly held = new Set<string>();
  private usable: readonly BbPitchId[] = [];
  private opened = false;

  constructor(host: HTMLElement, private readonly onThrow: (call: BbPitchCall) => void) {
    this.aim = new BbZoneAimWindow(host);
    this.row = BbHudParts.box("bb-pad", host);
    this.paths = [];
    this.dots = [];
    this.keys = BbPitchCatalog.ALL.map((kind) => {
      const key = document.createElement("button");
      key.className = "bb-pitch-key";
      key.type = "button";
      BbHudParts.box("bb-pitch-letter", key, kind.hotkey);
      BbHudParts.box("bb-pitch-name", key, kind.label);
      const icon = BbHudParts.shape("svg", "bb-pitch-icon", key, { viewBox: "0 0 40 34" });
      BbHudParts.shape("rect", "bb-pitch-icon-zone", icon, { x: 11, y: 10, width: 18, height: 20 });
      this.paths.push(BbHudParts.shape("path", "bb-pitch-icon-path", icon));
      this.dots.push(BbHudParts.shape("circle", "bb-pitch-icon-ball", icon, { r: 2.6 }));
      key.addEventListener("click", () => this.pick(kind));
      this.row.appendChild(key);
      return key;
    });
    this.throwButton = document.createElement("button");
    this.throwButton.className = "bb-action bb-throw";
    this.throwButton.type = "button";
    this.throwButton.textContent = "던지기";
    this.throwButton.addEventListener("click", () => this.confirm());
    host.appendChild(this.throwButton);
    window.addEventListener("keydown", (event) => this.pressed(event));
    window.addEventListener("keyup", (event) => this.held.delete(event.key));
    window.addEventListener("blur", () => this.held.clear());
  }

  tick(frameSeconds: number): void {
    if (!this.opened || !this.held.size) return;
    const reach = BbPitchPad.ARROW_SPEED * frameSeconds;
    let sideways = 0, upward = 0;
    this.held.forEach((key) => { sideways += BbPitchPad.ARROWS[key][0]; upward += BbPitchPad.ARROWS[key][1]; });
    this.aim.nudge(sideways * reach, upward * reach);
  }

  open(sheet: BbPitcherSheet): void {
    this.opened = true;
    this.usable = sheet.pitches;
    this.aim.begin(sheet);
    BbPitchCatalog.ALL.forEach((kind, index) => {
      const end = BbPitchIcon.end(kind, sheet.hand);
      this.keys[index].disabled = sheet.pitches.indexOf(kind.id) < 0;
      this.keys[index].classList.remove("on");
      this.paths[index].setAttribute("d", BbPitchIcon.path(kind, sheet.hand));
      this.dots[index].setAttribute("cx", end.x.toFixed(1));
      this.dots[index].setAttribute("cy", end.y.toFixed(1));
    });
    this.row.classList.add("open");
    this.throwButton.classList.remove("open");
  }

  close(): void {
    this.opened = false;
    this.held.clear();
    this.aim.close();
    this.row.classList.remove("open");
    this.throwButton.classList.remove("open");
  }

  private pick(kind: BbPitchKind): void {
    if (!this.opened || this.usable.indexOf(kind.id) < 0) return;
    this.aim.choose(kind);
    this.keys.forEach((key, index) => key.classList.toggle("on", BbPitchCatalog.ALL[index] === kind));
    this.throwButton.classList.add("open");
  }

  private confirm(): void {
    const call = this.aim.call;
    if (!this.opened || !call) return;
    this.close();
    this.onThrow(call);
  }

  private pressed(event: KeyboardEvent): void {
    if (!this.opened) return;
    const arrow = BbPitchPad.ARROWS[event.key];
    if (arrow) { event.preventDefault(); this.held.add(event.key); return; }
    if (event.repeat) return;
    const kind = BbPitchCatalog.ALL.find((candidate) => event.code === "Key" + candidate.hotkey);
    if (kind) { this.pick(kind); return; }
    if (BbPitchPad.THROW_CODES.indexOf(event.code) >= 0) { event.preventDefault(); this.confirm(); }
  }
}

class BbSwingButton {
  private static readonly SWING_CODES: readonly string[] = ["Space", "Enter", "NumpadEnter"];
  private readonly button: HTMLButtonElement;
  private armed = false;

  constructor(host: HTMLElement, private readonly onSwing: () => void) {
    this.button = document.createElement("button");
    this.button.className = "bb-action bb-swing";
    this.button.type = "button";
    this.button.textContent = "스윙";
    this.button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
    this.button.addEventListener("pointerdown", (event) => { event.preventDefault(); this.fire(); });
    host.appendChild(this.button);
    window.addEventListener("keydown", (event) => {
      if (!this.armed || event.repeat || BbSwingButton.SWING_CODES.indexOf(event.code) < 0) return;
      event.preventDefault();
      this.fire();
    });
  }

  arm(): void {
    this.armed = true;
    this.button.classList.add("open");
    this.button.classList.remove("spent");
  }

  disarm(): void {
    this.armed = false;
    this.button.classList.add("spent");
  }

  hide(): void {
    this.armed = false;
    this.button.classList.remove("open");
  }

  private fire(): void {
    if (!this.armed) return;
    this.disarm();
    this.onSwing();
  }
}

class BbFadingNote {
  private left = 0;

  constructor(protected readonly element: HTMLElement) {}

  protected reveal(seconds: number): void {
    this.left = seconds;
    this.element.classList.add("open");
  }

  hide(): void {
    this.left = 0;
    this.element.classList.remove("open");
  }

  tick(frameSeconds: number): void {
    if (this.left <= 0) return;
    this.left -= frameSeconds;
    if (this.left <= 0) this.element.classList.remove("open");
  }
}

class BbTimingGauge {
  private static readonly MARGIN = 0.03;
  private readonly element: HTMLElement;
  private static readonly BAND_CLASSES: ReadonlyArray<readonly [Exclude<BbTimingBand, "perfect" | "miss" | "poor">, string]> = [["fair", "bb-gauge-fair"], ["good", "bb-gauge-good"]];
  private readonly bands: HTMLElement[];
  private readonly perfect: HTMLElement;
  private readonly marker: HTMLElement;
  private readonly label: HTMLElement;

  constructor(host: HTMLElement) {
    this.element = BbHudParts.box("bb-gauge", host);
    this.label = BbHudParts.box("bb-gauge-label", this.element);
    const bar = BbHudParts.box("bb-gauge-bar", this.element);
    this.bands = BbTimingGauge.BAND_CLASSES.map(([, className]) => BbHudParts.box("bb-gauge-band " + className, bar));
    this.perfect = BbHudParts.box("bb-gauge-band bb-gauge-perfect", bar);
    this.marker = BbHudParts.box("bb-gauge-marker", bar, "▲");
    const ends = BbHudParts.box("bb-gauge-ends", this.element);
    BbHudParts.box("", ends, "빠름 ◀");
    BbHudParts.box("", ends, "▶ 늦음");
  }

  show(swing: BbSwingResult, leniency: number): void {
    this.element.classList.toggle("blank", swing.adjusted === null);
    if (swing.adjusted === null) { this.label.textContent = "지켜봄"; return; }
    const extra = BbTimingModel.BAND_EXTRA, range = swing.width + extra.poor * leniency + BbTimingGauge.MARGIN;
    const widthOf = (seconds: number) => (seconds / range * 100).toFixed(1) + "%";
    BbTimingGauge.BAND_CLASSES.forEach(([band], index) => { this.bands[index].style.width = widthOf(swing.width + extra[band] * leniency); });
    this.perfect.style.width = widthOf(swing.width);
    this.marker.style.left = (50 + BbCurve.clamp(swing.adjusted / range, -1, 1) * 50).toFixed(1) + "%";
    this.label.textContent = swing.band === "perfect" ? "정타" : swing.band === "good" ? "좋아요" : swing.adjusted < 0 ? "빨라요" : "늦었어요";
  }
}

class BbPitchReport extends BbFadingNote {
  private static readonly SECONDS = 4;
  private static readonly SPAN = 1.9;
  private static readonly SIDE_OF_VIEW: Readonly<Record<BbLiveView, number>> = { pitcher: 1, batter: -1 };
  private static readonly VIEW_NAMES: Readonly<Record<BbLiveView, string>> = { pitcher: "투수 시선", batter: "타자 시선" };
  private readonly ball: SVGCircleElement;
  private readonly side: HTMLElement;
  private readonly pitch: HTMLElement;
  private readonly gauge: BbTimingGauge;

  constructor(host: HTMLElement) {
    super(BbHudParts.box("bb-report", host));
    const span = BbPitchReport.SPAN;
    this.side = BbHudParts.box("bb-report-side", this.element);
    const picture = BbHudParts.shape("svg", "bb-report-zone", this.element, { viewBox: [-span, -span, span * 2, span * 2].join(" ") });
    BbHudParts.shape("rect", "bb-aim-strike", picture, { x: -1, y: -1, width: 2, height: 2 });
    [-1 / 3, 1 / 3].forEach((line) => {
      BbHudParts.shape("line", "bb-aim-grid", picture, { x1: line, y1: -1, x2: line, y2: 1 });
      BbHudParts.shape("line", "bb-aim-grid", picture, { x1: -1, y1: line, x2: 1, y2: line });
    });
    this.ball = BbHudParts.shape("circle", "bb-report-ball", picture, { r: 0.2 });
    this.pitch = BbHudParts.box("bb-report-pitch", this.element);
    this.gauge = new BbTimingGauge(this.element);
  }

  show(roll: BbPitchRoll, swing: BbSwingResult, leniency: number, view: BbLiveView): void {
    const edge = BbPitchReport.SPAN - 0.2;
    this.ball.style.transform = "translate(" + BbCurve.clamp(roll.arrive.u * BbPitchReport.SIDE_OF_VIEW[view], -edge, edge).toFixed(3) + "px," + BbCurve.clamp(-roll.arrive.v, -edge, edge).toFixed(3) + "px)";
    this.side.textContent = BbPitchReport.VIEW_NAMES[view];
    this.pitch.textContent = BbPitchCatalog.of(roll.pitch).label + "  " + Math.round(roll.speed) + "km/h";
    this.gauge.show(swing, leniency);
    this.reveal(BbPitchReport.SECONDS);
  }
}

class BbCallToast extends BbFadingNote {
  private static readonly SECONDS = 1.5;
  private readonly headline: HTMLElement;
  private readonly detail: HTMLElement;

  constructor(host: HTMLElement) {
    super(BbHudParts.box("bb-toast", host));
    this.headline = BbHudParts.box("bb-toast-call", this.element);
    this.detail = BbHudParts.box("bb-toast-pitch", this.element);
  }

  show(text: string, detail = "", seconds = BbCallToast.SECONDS): void {
    this.headline.textContent = text;
    this.detail.textContent = detail;
    this.reveal(seconds);
  }
}
