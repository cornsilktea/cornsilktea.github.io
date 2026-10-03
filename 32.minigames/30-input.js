"use strict";
class ElementFactory {
    create(tag) {
        return document.createElement(tag);
    }
}
class TurnActions {
    static nameOf(direction) {
        return TurnActions.PREFIX + direction;
    }
}
TurnActions.PREFIX = "turn:";
class ControlSurface {
    constructor() {
        this.spec = { stick: false, buttons: [] };
        this.sink = null;
    }
    configure(spec, sink) {
        this.spec = spec;
        this.sink = sink;
        this.release();
        this.rebuild();
    }
}
class KeyboardSurface extends ControlSurface {
    constructor(env) {
        super();
        this.held = new Set();
        this.actionByCode = new Map();
        env.onKeyDown((key) => this.handleDown(key));
        env.onKeyUp((key) => this.handleUp(key));
        env.onBlur(() => this.release());
    }
    axis() {
        const dx = (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
        const dz = (this.held.has("down") ? 1 : 0) - (this.held.has("up") ? 1 : 0);
        if (!dx && !dz)
            return { x: 0, z: 0 };
        const length = Math.hypot(dx, dz);
        return { x: dx / length, z: dz / length };
    }
    release() {
        this.held = new Set();
    }
    rebuild() {
        this.actionByCode = new Map();
        this.spec.buttons.forEach((button) => button.codes.forEach((code) => this.actionByCode.set(code, button.action)));
    }
    directionOf(key) {
        return KeyboardSurface.ARROWS[key.key] || KeyboardSurface.WASD[key.code];
    }
    handleDown(key) {
        if (key.inTextField || !this.sink)
            return;
        const direction = this.directionOf(key);
        if (direction) {
            this.held.add(direction);
            key.preventDefault();
            if (this.spec.turnActions && !key.repeat)
                this.sink.onAction(TurnActions.nameOf(direction));
            return;
        }
        if (key.repeat)
            return;
        const action = this.actionByCode.get(key.code);
        if (action) {
            key.preventDefault();
            this.sink.onAction(action);
        }
        else if (key.code === KeyboardSurface.SPECTATE_CODE) {
            key.preventDefault();
            this.sink.onSpectateNext();
        }
    }
    handleUp(key) {
        const direction = this.directionOf(key);
        if (direction)
            this.held.delete(direction);
    }
}
KeyboardSurface.ARROWS = { ArrowUp: "up", ArrowLeft: "left", ArrowDown: "down", ArrowRight: "right" };
KeyboardSurface.WASD = { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right" };
KeyboardSurface.SPECTATE_CODE = "Tab";
class TouchSurface extends ControlSurface {
    constructor(page, elements) {
        super();
        this.page = page;
        this.elements = elements;
        this.overlays = new Map();
        this.pointerId = null;
        this.originX = 0;
        this.originY = 0;
        this.stickX = 0;
        this.stickZ = 0;
        this.active = false;
        this.zone = page.byId("joyZone");
        this.base = page.byId("joyBase");
        this.knob = page.byId("joyKnob");
        this.buttonBox = page.byId("touchButtons");
        this.bindStick();
    }
    axis() {
        return { x: this.stickX, z: this.stickZ };
    }
    release() {
        this.pointerId = null;
        this.stickX = this.stickZ = 0;
        this.page.show(this.base, false);
    }
    setActive(active) {
        this.active = active;
        this.zone.classList.toggle("swipeArea", !!this.spec.turnActions);
        this.page.show(this.zone, active && (this.spec.stick || !!this.spec.turnActions));
        this.page.show(this.buttonBox, active);
        if (!active)
            this.release();
    }
    setCooldown(action, left) {
        const overlay = this.overlays.get(action);
        if (overlay)
            overlay.style.height = left * 100 + "%";
    }
    rebuild() {
        this.buttonBox.innerHTML = "";
        this.overlays.clear();
        this.spec.buttons.forEach((button) => this.buildButton(button));
        this.setActive(this.active);
    }
    buildButton(button) {
        const element = this.elements.create("button");
        element.type = "button";
        element.className = "actBtn";
        element.style.background = button.color;
        element.style.right = button.rightPx + "px";
        element.style.bottom = "calc(env(safe-area-inset-bottom, 0px) + " + button.bottomPx + "px)";
        const overlay = this.elements.create("i");
        const label = this.elements.create("span");
        label.textContent = button.label;
        element.appendChild(overlay);
        element.appendChild(label);
        element.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
        element.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            if (this.sink)
                this.sink.onAction(button.action);
        });
        this.buttonBox.appendChild(element);
        this.overlays.set(button.action, overlay);
    }
    swipe(event, dx, dy, length) {
        if (length < TouchSurface.SWIPE_DISTANCE || !this.sink)
            return;
        const direction = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up");
        this.sink.onAction(TurnActions.nameOf(direction));
        this.originX = event.clientX;
        this.originY = event.clientY;
    }
    bindStick() {
        this.zone.addEventListener("pointerdown", (event) => {
            if (this.pointerId !== null)
                return;
            this.pointerId = event.pointerId;
            this.originX = event.clientX;
            this.originY = event.clientY;
            this.base.style.left = this.originX + "px";
            this.base.style.top = this.originY + "px";
            this.knob.style.transform = "translate(0,0)";
            this.page.show(this.base, !this.spec.turnActions);
            try {
                this.zone.setPointerCapture(event.pointerId);
            }
            catch (error) {
                return;
            }
            event.preventDefault();
        });
        this.zone.addEventListener("pointermove", (event) => {
            if (event.pointerId !== this.pointerId)
                return;
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
            }
            else {
                this.stickX = dx / length * strength;
                this.stickZ = dy / length * strength;
            }
        });
        const end = (event) => {
            if (event.pointerId === this.pointerId)
                this.release();
        };
        this.zone.addEventListener("pointerup", end);
        this.zone.addEventListener("pointercancel", end);
    }
}
TouchSurface.JOYSTICK_RADIUS = 50;
TouchSurface.DEAD_ZONE = 0.18;
TouchSurface.SWIPE_DISTANCE = 26;
class ActionHub {
    constructor(env, page, elements) {
        this.keyboard = new KeyboardSurface(env);
        this.touch = new TouchSurface(page, elements);
        this.surfaces = [this.keyboard, this.touch];
    }
    axis() {
        for (const surface of this.surfaces) {
            const reading = surface.axis();
            if (reading.x || reading.z)
                return reading;
        }
        return { x: 0, z: 0 };
    }
    configure(spec, sink) {
        this.surfaces.forEach((surface) => surface.configure(spec, sink));
    }
    clear() {
        this.surfaces.forEach((surface) => surface.configure({ stick: false, buttons: [] }, null));
    }
    releaseAll() {
        this.surfaces.forEach((surface) => surface.release());
    }
    showTouchControls(visible) {
        this.touch.setActive(visible);
    }
    setCooldown(action, left) {
        this.touch.setCooldown(action, left);
    }
}
