class ElementFactory {
  create<T extends HTMLElement = HTMLElement>(tag: string): T {
    return document.createElement(tag) as T;
  }
}

interface ActionSink {
  onAction(action: string): void;
  onSpectateNext(): void;
}

interface StickReading {
  x: number;
  z: number;
}

class TurnActions {
  private static readonly PREFIX = "turn:";

  static nameOf(direction: string): string {
    return TurnActions.PREFIX + direction;
  }
}

class HoldActions {
  private static readonly DOWN = ":down";
  private static readonly UP = ":up";

  static down(action: string): string {
    return action + HoldActions.DOWN;
  }

  static up(action: string): string {
    return action + HoldActions.UP;
  }
}

abstract class ControlSurface {
  protected spec: ControlSpec = { stick: false, buttons: [] };
  protected sink: ActionSink | null = null;

  configure(spec: ControlSpec, sink: ActionSink | null): void {
    this.spec = spec;
    this.sink = sink;
    this.release();
    this.rebuild();
  }

  abstract axis(): StickReading;
  abstract release(): void;
  protected abstract rebuild(): void;
}

class KeyboardSurface extends ControlSurface {
  private static readonly ARROWS: Readonly<Record<string, string>> = { ArrowUp: "up", ArrowLeft: "left", ArrowDown: "down", ArrowRight: "right" };
  private static readonly WASD: Readonly<Record<string, string>> = { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right" };
  private static readonly SPECTATE_CODE = "Tab";

  private held = new Set<string>();
  private actionByCode = new Map<string, string>();
  private holdByCode = new Map<string, string>();
  private heldHoldCodes = new Map<string, Set<string>>();

  constructor(env: BrowserEnv) {
    super();
    env.onKeyDown((key) => this.handleDown(key));
    env.onKeyUp((key) => this.handleUp(key));
    env.onBlur(() => this.release());
  }

  axis(): StickReading {
    const dx = (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
    const dz = (this.held.has("down") ? 1 : 0) - (this.held.has("up") ? 1 : 0);
    if (!dx && !dz) return { x: 0, z: 0 };
    const length = Math.hypot(dx, dz);
    return { x: dx / length, z: dz / length };
  }

  release(): void {
    this.held = new Set<string>();
    const sink = this.sink;
    const actions = Array.from(this.heldHoldCodes.keys());
    this.heldHoldCodes = new Map<string, Set<string>>();
    if (sink) actions.forEach((action) => sink.onAction(HoldActions.up(action)));
  }

  protected rebuild(): void {
    this.actionByCode = new Map<string, string>();
    this.holdByCode = new Map<string, string>();
    this.spec.buttons.forEach((button) => button.codes.forEach((code) => {
      if (button.hold) this.holdByCode.set(code, button.action);
      else this.actionByCode.set(code, button.action);
    }));
  }

  private holdDown(action: string, code: string, sink: ActionSink): void {
    const codes = this.heldHoldCodes.get(action) || new Set<string>();
    const wasIdle = codes.size === 0;
    codes.add(code);
    this.heldHoldCodes.set(action, codes);
    if (wasIdle) sink.onAction(HoldActions.down(action));
  }

  private holdUp(action: string, code: string): void {
    const codes = this.heldHoldCodes.get(action);
    if (!codes || !codes.delete(code) || codes.size > 0) return;
    this.heldHoldCodes.delete(action);
    if (this.sink) this.sink.onAction(HoldActions.up(action));
  }

  private directionOf(key: KeyPress): string | undefined {
    return KeyboardSurface.ARROWS[key.key] || KeyboardSurface.WASD[key.code];
  }

  private handleDown(key: KeyPress): void {
    if (key.inTextField || !this.sink) return;
    const hold = this.holdByCode.get(key.code);
    if (hold) {
      key.preventDefault();
      this.holdDown(hold, key.code, this.sink);
      return;
    }
    const direction = this.directionOf(key);
    if (direction) {
      this.held.add(direction);
      key.preventDefault();
      if (this.spec.turnActions && !key.repeat) this.sink.onAction(TurnActions.nameOf(direction));
      return;
    }
    if (key.repeat) return;
    const action = this.actionByCode.get(key.code);
    if (action) {
      key.preventDefault();
      this.sink.onAction(action);
    } else if (key.code === KeyboardSurface.SPECTATE_CODE) {
      key.preventDefault();
      this.sink.onSpectateNext();
    }
  }

  private handleUp(key: KeyPress): void {
    const hold = this.holdByCode.get(key.code);
    if (hold) {
      this.holdUp(hold, key.code);
      return;
    }
    const direction = this.directionOf(key);
    if (direction) this.held.delete(direction);
  }
}

class TouchSurface extends ControlSurface {
  private static readonly JOYSTICK_RADIUS = 50;
  private static readonly DEAD_ZONE = 0.18;
  private static readonly SWIPE_DISTANCE = 26;

  private readonly zone: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly buttonBox: HTMLElement;
  private readonly overlays = new Map<string, HTMLElement>();
  private readonly heldButtons = new Map<string, HTMLElement>();
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private stickX = 0;
  private stickZ = 0;
  private active = false;

  constructor(private readonly page: Page, private readonly elements: ElementFactory) {
    super();
    this.zone = page.byId("joyZone");
    this.base = page.byId("joyBase");
    this.knob = page.byId("joyKnob");
    this.buttonBox = page.byId("touchButtons");
    this.bindStick();
  }

  axis(): StickReading {
    return { x: this.stickX, z: this.stickZ };
  }

  release(): void {
    this.pointerId = null;
    this.stickX = this.stickZ = 0;
    this.page.show(this.base, false);
    this.releaseHeldButtons();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.zone.classList.toggle("swipeArea", !!this.spec.turnActions);
    this.page.show(this.zone, active && (this.spec.stick || !!this.spec.turnActions));
    this.page.show(this.buttonBox, active);
    if (!active) this.release();
  }

  setCooldown(action: string, left: number): void {
    const overlay = this.overlays.get(action);
    if (overlay) overlay.style.height = left * 100 + "%";
  }

  protected rebuild(): void {
    this.buttonBox.innerHTML = "";
    this.overlays.clear();
    this.spec.buttons.forEach((button) => this.buildButton(button));
    this.setActive(this.active);
  }

  private releaseHeldButtons(): void {
    const sink = this.sink;
    const actions = Array.from(this.heldButtons.keys());
    this.heldButtons.forEach((element) => element.classList.remove("held"));
    this.heldButtons.clear();
    if (sink) actions.forEach((action) => sink.onAction(HoldActions.up(action)));
  }

  private capture(element: HTMLElement, pointerId: number): void {
    try { element.setPointerCapture(pointerId); } catch (error) { return; }
  }

  private bindHold(element: HTMLElement, action: string): void {
    const end = (): void => {
      if (!this.heldButtons.delete(action)) return;
      element.classList.remove("held");
      if (this.sink) this.sink.onAction(HoldActions.up(action));
    };
    element.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (!this.sink || this.heldButtons.has(action)) return;
      this.capture(element, event.pointerId);
      this.heldButtons.set(action, element);
      element.classList.add("held");
      this.sink.onAction(HoldActions.down(action));
    });
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
    element.addEventListener("lostpointercapture", end);
    element.addEventListener("pointerleave", end);
  }

  private buildButton(button: ControlButton): void {
    const element = this.elements.create<HTMLButtonElement>("button");
    element.type = "button";
    element.className = "actBtn" + (button.wide ? " wide" : "");
    element.style.background = button.color;
    element.style.right = button.rightPx + "px";
    element.style.bottom = "calc(env(safe-area-inset-bottom, 0px) + " + button.bottomPx + "px)";
    const overlay = this.elements.create("i");
    const label = this.elements.create("span");
    label.textContent = button.label;
    element.appendChild(overlay);
    element.appendChild(label);
    element.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
    if (button.hold) {
      this.bindHold(element, button.action);
    } else {
      element.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (this.sink) this.sink.onAction(button.action);
      });
    }
    this.buttonBox.appendChild(element);
    this.overlays.set(button.action, overlay);
  }

  private swipe(event: PointerEvent, dx: number, dy: number, length: number): void {
    if (length < TouchSurface.SWIPE_DISTANCE || !this.sink) return;
    const direction = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up");
    this.sink.onAction(TurnActions.nameOf(direction));
    this.originX = event.clientX;
    this.originY = event.clientY;
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
      this.page.show(this.base, !this.spec.turnActions);
      try { this.zone.setPointerCapture(event.pointerId); } catch (error) { return; }
      event.preventDefault();
    });
    this.zone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.pointerId) return;
      const dx = event.clientX - this.originX, dy = event.clientY - this.originY, length = Math.hypot(dx, dy);
      if (this.spec.turnActions) {
        this.swipe(event, dx, dy, length);
        return;
      }
      const reach = length > TouchSurface.JOYSTICK_RADIUS ? TouchSurface.JOYSTICK_RADIUS / length : 1;
      this.knob.style.transform = "translate(" + dx * reach + "px," + dy * reach + "px)";
      const strength = Math.min(1, length / TouchSurface.JOYSTICK_RADIUS);
      if (strength < TouchSurface.DEAD_ZONE) {
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
}

class ActionHub implements MovementSource {
  private readonly keyboard: KeyboardSurface;
  private readonly touch: TouchSurface;
  private readonly surfaces: readonly ControlSurface[];

  constructor(env: BrowserEnv, page: Page, elements: ElementFactory) {
    this.keyboard = new KeyboardSurface(env);
    this.touch = new TouchSurface(page, elements);
    this.surfaces = [this.keyboard, this.touch];
  }

  axis(): StickReading {
    for (const surface of this.surfaces) {
      const reading = surface.axis();
      if (reading.x || reading.z) return reading;
    }
    return { x: 0, z: 0 };
  }

  configure(spec: ControlSpec, sink: ActionSink): void {
    this.surfaces.forEach((surface) => surface.configure(spec, sink));
  }

  clear(): void {
    this.surfaces.forEach((surface) => surface.configure({ stick: false, buttons: [] }, null));
  }

  releaseAll(): void {
    this.surfaces.forEach((surface) => surface.release());
  }

  showTouchControls(visible: boolean): void {
    this.touch.setActive(visible);
  }

  setCooldown(action: string, left: number): void {
    this.touch.setCooldown(action, left);
  }
}
