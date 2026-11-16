abstract class ClimbInputRouter {
  moveX = 0;
  moveY = 0;
  slowHeld = false;
  enabled = false;
  onJump: () => void = () => undefined;
  onGrab: () => void = () => undefined;
  onPause: () => void = () => undefined;
  protected lookX = 0;
  protected lookY = 0;

  takeLookX(): number { const value = this.lookX; this.lookX = 0; return value; }
  takeLookY(): number { const value = this.lookY; this.lookY = 0; return value; }
  release(): void { this.moveX = this.moveY = 0; this.slowHeld = false; this.lookX = this.lookY = 0; }
}

class KeyboardMouseInput extends ClimbInputRouter {
  static readonly MOUSE_TURN = 0.0026;
  static readonly DIRECTION_OF_KEY: Readonly<Record<string, string>> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  static readonly DIRECTION_OF_CODE: Readonly<Record<string, string>> = { KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };

  private readonly held = new Set<string>();
  private dragging = false;

  constructor(private readonly surface: HTMLElement) {
    super();
    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => { this.held.clear(); this.refresh(); this.slowHeld = false; });
    surface.addEventListener("mousedown", (e) => this.mouseDown(e));
    window.addEventListener("mouseup", () => { this.dragging = false; });
    window.addEventListener("mousemove", (e) => this.mouseMove(e));
    document.addEventListener("pointerlockchange", () => { if (!document.pointerLockElement && this.enabled) this.onPause(); });
  }

  get locked(): boolean { return document.pointerLockElement === this.surface; }
  unlock(): void { if (document.pointerLockElement) document.exitPointerLock(); }

  release(): void { super.release(); this.held.clear(); }

  private direction(e: KeyboardEvent): string {
    return KeyboardMouseInput.DIRECTION_OF_KEY[e.key] ?? KeyboardMouseInput.DIRECTION_OF_CODE[e.code] ?? "";
  }

  private refresh(): void {
    this.moveX = (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
    this.moveY = (this.held.has("up") ? 1 : 0) - (this.held.has("down") ? 1 : 0);
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (!this.enabled) return;
    const direction = this.direction(e);
    if (direction) {
      if (down) this.held.add(direction); else this.held.delete(direction);
      this.refresh();
      e.preventDefault();
      return;
    }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") { this.slowHeld = down; return; }
    if (!down || e.repeat) { if (e.code === "Space") e.preventDefault(); return; }
    if (e.code === "Space") { this.onJump(); e.preventDefault(); }
    else if (e.code === "KeyE") this.onGrab();
    else if (e.code === "Escape" && !this.locked) this.onPause();
  }

  private mouseDown(e: MouseEvent): void {
    if (!this.enabled) return;
    this.dragging = true;
    if (!this.locked && this.surface.requestPointerLock) {
      try { const asked = this.surface.requestPointerLock() as unknown; if (asked instanceof Promise) asked.catch(() => undefined); } catch (error) { this.dragging = true; }
    }
    e.preventDefault();
  }

  private mouseMove(e: MouseEvent): void {
    if (!this.enabled || (!this.locked && !this.dragging)) return;
    this.lookX += e.movementX * KeyboardMouseInput.MOUSE_TURN;
    this.lookY += e.movementY * KeyboardMouseInput.MOUSE_TURN;
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

  constructor(zone: HTMLElement, private readonly base: HTMLElement, private readonly knob: HTMLElement, jump: HTMLElement, slow: HTMLElement, grab: HTMLElement, pause: HTMLElement) {
    super();
    zone.addEventListener("pointerdown", (e) => this.down(e));
    zone.addEventListener("pointermove", (e) => this.move(e));
    const up = (e: PointerEvent): void => this.up(e);
    zone.addEventListener("pointerup", up);
    zone.addEventListener("pointercancel", up);
    this.press(jump, () => this.onJump());
    this.press(grab, () => this.onGrab());
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
