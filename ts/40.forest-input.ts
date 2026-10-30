interface FrInputHandlers {
  press(): void;
  release(): void;
  key(code: string): void;
}

class FrPageGuard {
  constructor() {
    document.addEventListener("contextmenu", (event) => { if (!FrPageGuard.editable(event.target)) event.preventDefault(); });
    document.addEventListener("selectstart", (event) => { if (!FrPageGuard.editable(event.target)) event.preventDefault(); });
  }

  private static editable(target: EventTarget | null): boolean {
    const node = target as HTMLElement | null;
    return !!node && !!node.closest && !!node.closest("input, textarea, select");
  }
}

class FrHoverCell {
  x = 0;
  y = 0;
  active = false;
  dirty = false;
  cell: FrPoint | null = null;

  moved(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.active = true;
    this.dirty = true;
  }

  left(): void {
    this.active = false;
    this.cell = null;
  }

  settle(cell: FrPoint | null): void {
    this.cell = cell;
    this.dirty = false;
  }
}

class FrJoystick {
  static readonly RADIUS = 52;
  static readonly DEAD_ZONE = 0.18;
  x = 0;
  z = 0;
  private pointer = -1;

  constructor(private readonly base: HTMLElement, private readonly knob: HTMLElement) {
    base.addEventListener("pointerdown", (event) => this.start(event));
    window.addEventListener("pointermove", (event) => this.move(event));
    window.addEventListener("pointerup", (event) => this.end(event));
    window.addEventListener("pointercancel", (event) => this.end(event));
  }

  private center(): FrPoint {
    const box = this.base.getBoundingClientRect();
    return { x: box.left + box.width / 2, z: box.top + box.height / 2 };
  }

  private start(event: PointerEvent): void {
    event.preventDefault();
    this.pointer = event.pointerId;
    this.move(event);
  }

  private move(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    const c = this.center();
    let dx = event.clientX - c.x, dz = event.clientY - c.z;
    const length = Math.hypot(dx, dz);
    if (length > FrJoystick.RADIUS) { dx = (dx / length) * FrJoystick.RADIUS; dz = (dz / length) * FrJoystick.RADIUS; }
    this.knob.style.transform = "translate(" + dx + "px," + dz + "px)";
    const strength = Math.min(1, length / FrJoystick.RADIUS);
    if (strength < FrJoystick.DEAD_ZONE) { this.x = 0; this.z = 0; return; }
    this.x = (dx / Math.max(1, length)) * strength;
    this.z = (dz / Math.max(1, length)) * strength;
  }

  private end(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    this.pointer = -1;
    this.x = 0;
    this.z = 0;
    this.knob.style.transform = "translate(0,0)";
  }
}

class FrInput {
  private readonly down = new Set<string>();
  private readonly joystick: FrJoystick;
  enabled = false;

  constructor(joystickBase: HTMLElement, joystickKnob: HTMLElement, private readonly actionButton: HTMLElement, private readonly handlers: FrInputHandlers) {
    this.joystick = new FrJoystick(joystickBase, joystickKnob);
    window.addEventListener("keydown", (event) => this.keyDown(event));
    window.addEventListener("keyup", (event) => this.keyUp(event));
    window.addEventListener("blur", () => this.down.clear());
    actionButton.addEventListener("touchstart", (event) => { event.preventDefault(); this.handlers.press(); }, { passive: false });
    actionButton.addEventListener("touchend", (event) => { event.preventDefault(); this.handlers.release(); }, { passive: false });
    actionButton.addEventListener("pointerdown", (event) => { if (event.pointerType === "mouse") this.handlers.press(); });
    actionButton.addEventListener("pointerup", (event) => { if (event.pointerType === "mouse") this.handlers.release(); });
  }

  private typing(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
  }

  private keyDown(event: KeyboardEvent): void {
    if (!this.enabled || this.typing(event)) return;
    const code = event.code;
    if (code === "Space") { event.preventDefault(); if (!event.repeat) this.handlers.press(); return; }
    if (FrInput.MOVE_CODES.indexOf(code) >= 0) { event.preventDefault(); this.down.add(code); return; }
    if (!event.repeat) this.handlers.key(code);
  }

  private keyUp(event: KeyboardEvent): void {
    if (event.code === "Space") { if (this.enabled) this.handlers.release(); return; }
    this.down.delete(event.code);
  }

  static readonly MOVE_CODES = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

  direction(): FrPoint {
    let x = this.joystick.x, z = this.joystick.z;
    if (this.down.has("KeyA") || this.down.has("ArrowLeft")) x -= 1;
    if (this.down.has("KeyD") || this.down.has("ArrowRight")) x += 1;
    if (this.down.has("KeyW") || this.down.has("ArrowUp")) z -= 1;
    if (this.down.has("KeyS") || this.down.has("ArrowDown")) z += 1;
    const length = Math.hypot(x, z);
    if (length > 1) { x /= length; z /= length; }
    return { x, z };
  }

  setActionLabel(text: string): void { this.actionButton.textContent = text; }
}
