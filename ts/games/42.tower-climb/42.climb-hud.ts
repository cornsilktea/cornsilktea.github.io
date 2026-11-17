interface ClimbBestRecord { h: number; s: number; t: number }

class ClimbDom {
  static el<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error("화면 요소가 없어요: " + id);
    return found as T;
  }
}

class ClimbText {
  static clock(seconds: number): string {
    const whole = Math.floor(seconds), minutes = Math.floor(whole / 60), rest = whole % 60, tenth = Math.floor((seconds - whole) * 10);
    return minutes + ":" + (rest < 10 ? "0" : "") + rest + "." + tenth;
  }
  static meters(value: number): string { return Math.floor(value + 1e-6) + "m"; }
}

class ClimbRecords {
  static readonly GAME = "towerclimb";
  static readonly STORAGE_KEY = "towerclimb_best_v1";

  best: ClimbBestRecord;
  readonly world: WorldRecordHandle | null;
  private readonly account: { push(): void } | null;

  constructor(private readonly onChange: () => void) {
    this.best = ClimbRecords.read();
    const factory = window.WorldRecord;
    this.world = factory ? factory(ClimbRecords.GAME, { lower: false, format: (value) => value + "m" }) : null;
    if (this.world) {
      this.world.onChange(() => this.onChange());
      const loading = this.world.load();
      if (loading) loading.then(() => this.onChange(), () => undefined);
    }
    this.account = factory && factory.syncBest
      ? factory.syncBest(ClimbRecords.GAME, { storageKey: ClimbRecords.STORAGE_KEY, merge: ClimbRecords.merge, onApply: () => { this.best = ClimbRecords.read(); this.onChange(); } })
      : null;
  }

  static parse(raw: string | null): ClimbBestRecord | null {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<ClimbBestRecord>;
      const number = (v: unknown): number => typeof v === "number" && isFinite(v) && v > 0 ? v : 0;
      return { h: Math.min(ClimbBalance.TOP, Math.floor(number(value.h))), s: Math.min(ClimbBalance.STAGE_COUNT, Math.floor(number(value.s))), t: number(value.t) };
    } catch (error) {
      return null;
    }
  }

  static merge(local: string | null, account: string | null): string | null {
    const a = ClimbRecords.parse(local), b = ClimbRecords.parse(account);
    if (!a || !b) return a ? local : b ? account : null;
    const time = a.t && b.t ? Math.min(a.t, b.t) : a.t || b.t;
    return JSON.stringify({ h: Math.max(a.h, b.h), s: Math.max(a.s, b.s), t: time });
  }

  private static read(): ClimbBestRecord {
    try { return ClimbRecords.parse(localStorage.getItem(ClimbRecords.STORAGE_KEY)) ?? { h: 0, s: 0, t: 0 }; } catch (error) { return { h: 0, s: 0, t: 0 }; }
  }

  private save(): void {
    try { localStorage.setItem(ClimbRecords.STORAGE_KEY, JSON.stringify(this.best)); } catch (error) { return; }
    if (this.account) this.account.push();
    this.onChange();
  }

  offerHeight(meters: number): boolean {
    if (meters <= this.best.h) return false;
    this.best.h = meters;
    this.save();
    return true;
  }

  offerStage(stage: number): void { if (stage > this.best.s) { this.best.s = stage; this.save(); } }

  offerTime(seconds: number): boolean {
    if (this.best.t && seconds >= this.best.t) return false;
    this.best.t = Math.round(seconds * 10) / 10;
    this.save();
    return true;
  }

  submitWorld(meters: number): void {
    const world = this.world;
    if (!world || meters <= 0 || (!world.beats(meters) && !world.beatsClass(meters))) return;
    world.prompt(meters);
    const factory = window.WorldRecord;
    if (factory && factory.pushBest) factory.pushBest(ClimbRecords.GAME);
  }
}

class ClimbSfx {
  static readonly SOUNDS: Readonly<Record<string, readonly [number, number, number, OscillatorType]>> = {
    jump: [420, 640, 0.12, "square"], land: [180, 110, 0.09, "triangle"], pad: [300, 900, 0.25, "square"], grab: [520, 560, 0.07, "triangle"],
    launch: [160, 1100, 0.5, "sawtooth"], portal: [700, 240, 0.9, "sine"], clear: [520, 1040, 0.6, "square"], fall: [300, 90, 0.5, "sawtooth"],
  };
  static readonly VOLUME = 0.07;
  muted = false;
  rate = 1;
  private context: AudioContext | null = null;

  play(name: string): void {
    const sound = ClimbSfx.SOUNDS[name];
    if (!sound || this.muted) return;
    try {
      if (!this.context) this.context = new AudioContext();
      const context = this.context, now = context.currentTime, [from, to, seconds, shape] = sound, long = seconds / this.rate;
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = shape;
      oscillator.frequency.setValueAtTime(from * this.rate, now);
      oscillator.frequency.exponentialRampToValueAtTime(to * this.rate, now + long);
      gain.gain.setValueAtTime(ClimbSfx.VOLUME, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + long);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + long + 0.02);
    } catch (error) {
      this.muted = true;
    }
  }
}

class ClimbHudField {
  private shown = "";
  constructor(private readonly element: HTMLElement) {}
  set(text: string): void { if (text !== this.shown) { this.shown = text; this.element.textContent = text; } }
}

class ClimbHudMeter {
  private shown = -1;
  constructor(private readonly element: HTMLElement) {}
  set(ratio: number): void {
    const value = Math.round(Math.max(0, Math.min(1, ratio)) * 200) / 200;
    if (value === this.shown) return;
    this.shown = value;
    this.element.style.transform = "scaleX(" + value + ")";
  }
}

class ClimbHudFade {
  private shown = -1;
  constructor(private readonly element: HTMLElement) {}
  set(opacity: number): void {
    const value = Math.round(Math.max(0, Math.min(1, opacity)) * 50) / 50;
    if (value === this.shown) return;
    this.shown = value;
    this.element.style.opacity = String(value);
  }
}

class ClimbHud {
  static readonly MAP_CELL = 22;
  static readonly PLAY_IDS: readonly string[] = ["hudTop", "hudLeft", "hudMap", "controls", "btnPause"];

  private readonly height = new ClimbHudField(ClimbDom.el("hudHeight"));
  private readonly stage = new ClimbHudField(ClimbDom.el("hudStage"));
  private readonly time = new ClimbHudField(ClimbDom.el("hudTime"));
  private readonly best = new ClimbHudField(ClimbDom.el("hudBest"));
  private readonly bar = new ClimbHudMeter(ClimbDom.el("hudBarFill"));
  private readonly charge = new ClimbHudMeter(ClimbDom.el("hudChargeFill"));
  private readonly veil = new ClimbHudFade(ClimbDom.el("slowVeil"));
  private readonly white = new ClimbHudFade(ClimbDom.el("whiteFade"));
  private readonly bannerBox = ClimbDom.el("banner");
  private readonly countBox = ClimbDom.el("bigCount");
  private readonly chargeBox = ClimbDom.el("hudCharge");
  private readonly grabButton = ClimbDom.el("btnGrab");
  private readonly grabTip = ClimbDom.el("grabHint");
  private readonly mapDot = ClimbDom.el("hudMapDot");
  private readonly mapCells: HTMLElement[] = [];
  private bannerLeft = 0;
  private dotAt = -1;
  private tipShown = "";
  private chargeShown = false;
  private clearedShown = -1;
  private countShown = "";

  constructor(private readonly level: TowerLevel) {
    const map = ClimbDom.el("hudMapCells");
    for (let index = ClimbBalance.STAGE_COUNT; index >= 1; index--) {
      const cell = document.createElement("i");
      cell.textContent = String(index);
      if (!level.stageOf(index)?.built) cell.className = "unbuilt";
      map.appendChild(cell);
      this.mapCells[index] = cell;
    }
  }

  showPlay(visible: boolean): void {
    ClimbHud.PLAY_IDS.forEach((id) => { ClimbDom.el(id).hidden = !visible; });
    if (visible) return;
    this.bannerBox.hidden = true;
    this.countBox.hidden = true;
    this.chargeBox.hidden = true;
    this.grabTip.hidden = true;
    this.veil.set(0);
    this.white.set(0);
  }

  banner(text: string, strong: boolean, seconds: number): void {
    this.bannerBox.textContent = text;
    this.bannerBox.classList.toggle("strong", strong);
    this.bannerBox.hidden = !text;
    this.bannerLeft = seconds;
  }

  countdown(text: string): void {
    if (text === this.countShown) return;
    this.countShown = text;
    this.countBox.hidden = !text;
    this.countBox.textContent = text;
    if (text) this.countBox.animate([{ transform: "translate(-50%,-50%) scale(1.6)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1 }], { duration: 380, easing: "ease-out" });
  }

  static readonly GRAB_TIP = "E 잡기";
  static readonly CLIMB_TIP = "W · Space 오르기";

  grabHint(canGrab: boolean, onLedge: boolean): void {
    const tip = canGrab ? ClimbHud.GRAB_TIP : onLedge ? ClimbHud.CLIMB_TIP : "";
    if (tip === this.tipShown) return;
    this.tipShown = tip;
    this.grabButton.classList.toggle("ready", canGrab);
    this.grabTip.hidden = !tip;
    if (tip) this.grabTip.textContent = tip;
  }

  update(rules: ClimbRules, records: ClimbRecords, fresh: boolean, dt: number): void {
    const B = ClimbBalance, height = rules.height, stage = this.level.stageAt(height);
    this.height.set(ClimbText.meters(height));
    this.stage.set(stage.index > 0 ? "스테이지 " + stage.index + " · " + stage.name : stage.name);
    this.bar.set(height / B.TOP);
    this.time.set(ClimbText.clock(rules.clock));
    this.best.set("최고 " + records.best.h + "m" + (fresh ? " NEW" : ""));
    this.veil.set((1 - rules.time.scale) / (1 - B.SLOW_SCALE));
    this.white.set(rules.body.mode === "portal" ? 1 - rules.body.portalTime / B.PORTAL_TIME : 0);
    const charging = rules.chargeFill > 0;
    if (charging !== this.chargeShown) { this.chargeShown = charging; this.chargeBox.hidden = !charging; }
    if (charging) this.charge.set(rules.chargeFill);
    const dot = Math.round((1 - Math.min(1, height / B.TOP)) * B.STAGE_COUNT * ClimbHud.MAP_CELL);
    if (dot !== this.dotAt) { this.dotAt = dot; this.mapDot.style.transform = "translateY(" + dot + "px)"; }
    if (rules.progress.cleared !== this.clearedShown) {
      this.clearedShown = rules.progress.cleared;
      this.mapCells.forEach((cell, index) => cell.classList.toggle("cleared", index <= this.clearedShown));
    }
    if (this.bannerLeft > 0) { this.bannerLeft -= dt; if (this.bannerLeft <= 0) this.bannerBox.hidden = true; }
  }
}

class ClimbStartPanel {
  private readonly best = ClimbDom.el("recBest");
  private readonly bestNote = ClimbDom.el("recBestNote");
  private readonly world = ClimbDom.el("recWorld");
  private readonly worldWho = ClimbDom.el("recWorldWho");
  private readonly classBox = ClimbDom.el("recClassBox");
  private readonly classValue = ClimbDom.el("recClass");
  private readonly classWho = ClimbDom.el("recClassWho");
  private readonly stage = ClimbDom.el("recStage");

  paint(records: ClimbRecords): void {
    const best = records.best, world = records.world;
    this.best.textContent = best.h ? best.h + "m" : "-";
    this.bestNote.textContent = best.t ? "스테이지 1 " + ClimbText.clock(best.t) : "";
    this.stage.textContent = best.s + " / " + ClimbBalance.STAGE_COUNT;
    this.world.textContent = world && world.rec ? world.text() : "-";
    this.worldWho.textContent = world && world.rec ? world.who() : "";
    const slot = world ? world.cls : null;
    this.classBox.hidden = !slot;
    if (!slot) return;
    this.classValue.textContent = slot.rec ? slot.text() : "-";
    this.classWho.textContent = slot.rec ? slot.who() : "";
  }
}
