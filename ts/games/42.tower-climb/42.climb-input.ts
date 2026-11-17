abstract class ClimbInputRouter {
  moveX = 0;
  moveY = 0;
  slowHeld = false;
  enabled = false;
  onJump: () => void = () => undefined;
  onPause: () => void = () => undefined;
  protected lookX = 0;
  protected lookY = 0;

  takeLookX(): number { const value = this.lookX; this.lookX = 0; return value; }
  takeLookY(): number { const value = this.lookY; this.lookY = 0; return value; }
  release(): void { this.moveX = this.moveY = 0; this.slowHeld = false; this.lookX = this.lookY = 0; }
}

class KeyboardInput extends ClimbInputRouter {
  static readonly TURN_SPEED = 2.4;
  static readonly PITCH_SPEED = 1.4;
  static readonly MOVE_OF_CODE: Readonly<Record<string, string>> = { KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
  static readonly LOOK_OF_KEY: Readonly<Record<string, string>> = { ArrowUp: "lookUp", ArrowDown: "lookDown", ArrowLeft: "lookLeft", ArrowRight: "lookRight" };

  onPauseKey: () => void = () => undefined;
  private readonly held = new Set<string>();

  constructor() {
    super();
    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => { this.held.clear(); this.refresh(); this.slowHeld = false; });
  }

  release(): void { super.release(); this.held.clear(); }

  advance(seconds: number): void {
    const K = KeyboardInput, h = this.held;
    this.lookX += ((h.has("lookRight") ? 1 : 0) - (h.has("lookLeft") ? 1 : 0)) * K.TURN_SPEED * seconds;
    this.lookY += ((h.has("lookDown") ? 1 : 0) - (h.has("lookUp") ? 1 : 0)) * K.PITCH_SPEED * seconds;
  }

  private control(e: KeyboardEvent): string {
    return KeyboardInput.LOOK_OF_KEY[e.key] ?? KeyboardInput.MOVE_OF_CODE[e.code] ?? "";
  }

  private refresh(): void {
    const h = this.held;
    this.moveX = (h.has("right") ? 1 : 0) - (h.has("left") ? 1 : 0);
    this.moveY = (h.has("up") ? 1 : 0) - (h.has("down") ? 1 : 0);
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (e.code === "Escape") { if (down && !e.repeat) this.onPauseKey(); return; }
    if (!this.enabled) return;
    const control = this.control(e);
    if (control) {
      if (down) this.held.add(control); else this.held.delete(control);
      this.refresh();
      e.preventDefault();
      return;
    }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") { this.slowHeld = down; return; }
    if (!down || e.repeat) { if (e.code === "Space") e.preventDefault(); return; }
    if (e.code === "Space") { this.onJump(); e.preventDefault(); }
  }
}

class TouchInput extends ClimbInputRouter {
  static readonly DEAD_ZONE = 14;
  static readonly KNOB_REACH = 46;
  static readonly STICK_SIDE = 0.45;
  static readonly TOUCH_TURN = 0.0058;

  used = false;
  private stickId = -1;
  private stickX = 0;
  private stickY = 0;
  private readonly lookers = new Map<number, { x: number; y: number }>();

  constructor(zone: HTMLElement, private readonly base: HTMLElement, private readonly knob: HTMLElement, jump: HTMLElement, slow: HTMLElement, pause: HTMLElement) {
    super();
    zone.addEventListener("pointerdown", (e) => this.down(e));
    zone.addEventListener("pointermove", (e) => this.move(e));
    const up = (e: PointerEvent): void => this.up(e);
    zone.addEventListener("pointerup", up);
    zone.addEventListener("pointercancel", up);
    this.press(jump, () => this.onJump());
    this.press(pause, () => this.onPause());
    this.press(slow, () => { this.slowHeld = true; slow.classList.add("on"); });
    const slowOff = (): void => { this.slowHeld = false; slow.classList.remove("on"); };
    slow.addEventListener("pointerup", slowOff);
    slow.addEventListener("pointercancel", slowOff);
    slow.addEventListener("pointerleave", slowOff);
  }

  private press(button: HTMLElement, act: () => void): void {
    button.addEventListener("pointerdown", (e) => { e.preventDefault(); if (this.enabled) act(); });
    button.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }

  release(): void { super.release(); this.stickId = -1; this.lookers.clear(); this.drawKnob(0, 0, false); }

  private markTouch(e: PointerEvent): void {
    if (this.used || e.pointerType !== "touch") return;
    this.used = true;
    document.body.classList.add("touch");
  }

  private down(e: PointerEvent): void {
    this.markTouch(e);
    if (!this.enabled || e.pointerType === "mouse") return;
    if (this.stickId < 0 && e.clientX < window.innerWidth * TouchInput.STICK_SIDE) {
      this.stickId = e.pointerId;
      this.stickX = e.clientX; this.stickY = e.clientY;
      this.base.style.transform = "translate(" + (e.clientX - 64) + "px," + (e.clientY - 64) + "px)";
      this.drawKnob(0, 0, true);
      return;
    }
    this.lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  private move(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.pointerId === this.stickId) {
      const dx = e.clientX - this.stickX, dy = e.clientY - this.stickY, far = Math.hypot(dx, dy);
      if (far < TouchInput.DEAD_ZONE) { this.moveX = this.moveY = 0; this.drawKnob(dx, dy, true); return; }
      this.moveX = dx / far; this.moveY = -dy / far;
      const reach = Math.min(far, TouchInput.KNOB_REACH);
      this.drawKnob(dx / far * reach, dy / far * reach, true);
      return;
    }
    const last = this.lookers.get(e.pointerId);
    if (!last) return;
    this.lookX += (e.clientX - last.x) * TouchInput.TOUCH_TURN;
    this.lookY += (e.clientY - last.y) * TouchInput.TOUCH_TURN;
    last.x = e.clientX; last.y = e.clientY;
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.stickId) { this.stickId = -1; this.moveX = this.moveY = 0; this.drawKnob(0, 0, false); }
    this.lookers.delete(e.pointerId);
  }

  private drawKnob(dx: number, dy: number, active: boolean): void {
    this.knob.style.transform = "translate(" + dx + "px," + dy + "px)";
    this.base.classList.toggle("on", active);
  }
}
