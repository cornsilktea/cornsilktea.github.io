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
  onRestartKey: () => void = () => undefined;
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
    if (e.code === "KeyR") { if (down && !e.repeat) this.onRestartKey(); return; }
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

class TouchStick {
  static readonly RADIUS = 60;

  private originX = 0;
  private originY = 0;

  constructor(private readonly ring: HTMLElement, private readonly knob: HTMLElement) {}

  grab(x: number, y: number): void {
    this.originX = x; this.originY = y;
    this.ring.style.left = x + "px";
    this.ring.style.top = y + "px";
    this.ring.classList.add("on");
    this.knob.style.transform = "";
  }

  pull(x: number, y: number): { dx: number; dy: number; far: number } {
    const dx = x - this.originX, dy = y - this.originY, far = Math.hypot(dx, dy), scale = far > TouchStick.RADIUS ? TouchStick.RADIUS / far : 1;
    this.knob.style.transform = "translate(" + dx * scale + "px," + dy * scale + "px)";
    return { dx, dy, far };
  }

  home(): void {
    this.ring.style.left = "";
    this.ring.style.top = "";
    this.ring.classList.remove("on");
    this.knob.style.transform = "";
  }
}

class TouchInput extends ClimbInputRouter {
  static readonly DEAD_ZONE = 14;
  static readonly STICK_SIDE = 0.5;
  static readonly TOUCH_TURN = 0.0058;

  used = false;
  private moveId = -1;
  private lookId = -1;
  private lookLastX = 0;
  private lookLastY = 0;
  private readonly moveStick: TouchStick;
  private readonly lookStick: TouchStick;

  constructor(private readonly zone: HTMLElement, moveRing: HTMLElement, lookRing: HTMLElement, jump: HTMLElement, slow: HTMLElement, pause: HTMLElement) {
    super();
    this.moveStick = new TouchStick(moveRing, TouchInput.knobOf(moveRing));
    this.lookStick = new TouchStick(lookRing, TouchInput.knobOf(lookRing));
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

  private static knobOf(ring: HTMLElement): HTMLElement {
    const knob = ring.querySelector<HTMLElement>(".tc-knob");
    if (!knob) throw new Error("조이스틱 손잡이가 없어요: " + ring.id);
    return knob;
  }

  private press(button: HTMLElement, act: () => void): void {
    button.addEventListener("pointerdown", (e) => { e.preventDefault(); if (this.enabled) act(); });
    button.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }

  release(): void {
    super.release();
    this.moveId = this.lookId = -1;
    this.moveStick.home();
    this.lookStick.home();
  }

  private markTouch(e: PointerEvent): void {
    if (this.used || e.pointerType !== "touch") return;
    this.used = true;
    document.body.classList.add("touch");
  }

  private capture(pointerId: number): void {
    try { this.zone.setPointerCapture(pointerId); } catch (error) { return; }
  }

  private down(e: PointerEvent): void {
    this.markTouch(e);
    if (!this.enabled || e.pointerType === "mouse") return;
    const left = e.clientX < window.innerWidth * TouchInput.STICK_SIDE;
    if (left ? this.moveId >= 0 : this.lookId >= 0) return;
    this.capture(e.pointerId);
    if (left) { this.moveId = e.pointerId; this.moveStick.grab(e.clientX, e.clientY); return; }
    this.lookId = e.pointerId;
    this.lookLastX = e.clientX; this.lookLastY = e.clientY;
    this.lookStick.grab(e.clientX, e.clientY);
  }

  private move(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.pointerId === this.moveId) {
      const pull = this.moveStick.pull(e.clientX, e.clientY);
      if (pull.far < TouchInput.DEAD_ZONE) { this.moveX = this.moveY = 0; return; }
      this.moveX = pull.dx / pull.far; this.moveY = -pull.dy / pull.far;
      return;
    }
    if (e.pointerId !== this.lookId) return;
    this.lookX += (e.clientX - this.lookLastX) * TouchInput.TOUCH_TURN;
    this.lookY += (e.clientY - this.lookLastY) * TouchInput.TOUCH_TURN;
    this.lookLastX = e.clientX; this.lookLastY = e.clientY;
    this.lookStick.pull(e.clientX, e.clientY);
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.moveId) { this.moveId = -1; this.moveX = this.moveY = 0; this.moveStick.home(); }
    if (e.pointerId === this.lookId) { this.lookId = -1; this.lookStick.home(); }
  }
}
