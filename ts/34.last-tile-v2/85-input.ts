interface ActionListener {
  onPush(): void;
  onDash(): void;
  onSpectateNext(): void;
}

interface AxisReading {
  x: number;
  z: number;
}

abstract class InputSource implements MovementSource {
  abstract axis(): AxisReading;
  abstract bind(listener: ActionListener): void;
  abstract release(): void;
}

class KeyboardInput extends InputSource {
  private static readonly ARROWS: Readonly<Record<string, string>> = { ArrowUp: "up", ArrowLeft: "left", ArrowDown: "down", ArrowRight: "right" };
  private static readonly WASD: Readonly<Record<string, string>> = { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right" };
  private static readonly PUSH_CODES: readonly string[] = ["KeyJ"];
  private static readonly DASH_CODES: readonly string[] = ["KeyK", "Space"];
  private static readonly SPECTATE_CODES: readonly string[] = ["Tab"];

  private held = new Set<string>();
  private listener: ActionListener | null = null;

  constructor(env: BrowserEnv) {
    super();
    env.onKeyDown((key) => this.handleDown(key));
    env.onKeyUp((key) => this.handleUp(key));
    env.onBlur(() => this.release());
  }

  axis(): AxisReading {
    const dx = (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
    const dz = (this.held.has("down") ? 1 : 0) - (this.held.has("up") ? 1 : 0);
    if (!dx && !dz) return { x: 0, z: 0 };
    const length = Math.hypot(dx, dz);
    return { x: dx / length, z: dz / length };
  }

  bind(listener: ActionListener): void {
    this.listener = listener;
  }

  release(): void {
    this.held = new Set<string>();
  }

  private directionOf(key: KeyPress): string | undefined {
    return KeyboardInput.ARROWS[key.key] || KeyboardInput.WASD[key.code];
  }

  private handleDown(key: KeyPress): void {
    if (key.inTextField) return;
    const direction = this.directionOf(key);
    if (direction) {
      this.held.add(direction);
      key.preventDefault();
      return;
    }
    if (key.repeat || !this.listener) return;
    if (KeyboardInput.PUSH_CODES.indexOf(key.code) >= 0) this.listener.onPush();
    else if (KeyboardInput.DASH_CODES.indexOf(key.code) >= 0) {
      key.preventDefault();
      this.listener.onDash();
    } else if (KeyboardInput.SPECTATE_CODES.indexOf(key.code) >= 0) {
      key.preventDefault();
      this.listener.onSpectateNext();
    }
  }

  private handleUp(key: KeyPress): void {
    const direction = this.directionOf(key);
    if (direction) this.held.delete(direction);
  }
}

class TouchInput extends InputSource {
  private static readonly JOYSTICK_RADIUS = 50;
  private static readonly DEAD_ZONE = 0.18;

  private readonly zone: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private stickX = 0;
  private stickZ = 0;

  constructor(private readonly page: Page) {
    super();
    this.zone = page.byId("joyZone");
    this.base = page.byId("joyBase");
    this.knob = page.byId("joyKnob");
    this.bindStick();
  }

  axis(): AxisReading {
    return { x: this.stickX, z: this.stickZ };
  }

  bind(listener: ActionListener): void {
    this.bindButton("btnPush", () => listener.onPush());
    this.bindButton("btnDash", () => listener.onDash());
  }

  release(): void {
    this.pointerId = null;
    this.stickX = this.stickZ = 0;
    this.page.show(this.base, false);
  }

  private bindStick(): void {
    this.zone.addEventListener("pointerdown", (event) => {
      if (this.pointerId !== null) return;
      this.pointerId = event.pointerId;
      this.originX = event.clientX;
      this.originY = event.clientY;
      this.base.style.left = this.originX + "px";
      this.base.style.top = this.originY + "px";
      this.knob.style.transform = "translate(0,0)";
      this.page.show(this.base, true);
      try { this.zone.setPointerCapture(event.pointerId); } catch (error) { return; }
      event.preventDefault();
    });
    this.zone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.pointerId) return;
      const dx = event.clientX - this.originX, dy = event.clientY - this.originY, length = Math.hypot(dx, dy);
      const reach = length > TouchInput.JOYSTICK_RADIUS ? TouchInput.JOYSTICK_RADIUS / length : 1;
      this.knob.style.transform = "translate(" + dx * reach + "px," + dy * reach + "px)";
      const strength = Math.min(1, length / TouchInput.JOYSTICK_RADIUS);
      if (strength < TouchInput.DEAD_ZONE) {
        this.stickX = this.stickZ = 0;
      } else {
        this.stickX = dx / length * strength;
        this.stickZ = dy / length * strength;
      }
    });
    const end = (event: PointerEvent) => {
      if (event.pointerId === this.pointerId) this.release();
    };
    this.zone.addEventListener("pointerup", end);
    this.zone.addEventListener("pointercancel", end);
  }

  private bindButton(id: string, action: () => void): void {
    const button = this.page.byId(id);
    button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      action();
    });
  }
}

class CombinedInput implements MovementSource {
  constructor(private readonly sources: readonly InputSource[]) {}

  axis(): AxisReading {
    for (const source of this.sources) {
      const axis = source.axis();
      if (axis.x || axis.z) return axis;
    }
    return { x: 0, z: 0 };
  }

  bind(listener: ActionListener): void {
    this.sources.forEach((source) => source.bind(listener));
  }

  releaseAll(): void {
    this.sources.forEach((source) => source.release());
  }
}
