"use strict";
class InputSource {
}
class KeyboardInput extends InputSource {
    constructor(env) {
        super();
        this.held = new Set();
        this.listener = null;
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
    bind(listener) {
        this.listener = listener;
    }
    release() {
        this.held = new Set();
    }
    directionOf(key) {
        return KeyboardInput.ARROWS[key.key] || KeyboardInput.WASD[key.code];
    }
    handleDown(key) {
        if (key.inTextField)
            return;
        const direction = this.directionOf(key);
        if (direction) {
            this.held.add(direction);
            key.preventDefault();
            return;
        }
        if (key.repeat || !this.listener)
            return;
        if (KeyboardInput.PUSH_CODES.indexOf(key.code) >= 0)
            this.listener.onPush();
        else if (KeyboardInput.DASH_CODES.indexOf(key.code) >= 0) {
            key.preventDefault();
            this.listener.onDash();
        }
        else if (KeyboardInput.SPECTATE_CODES.indexOf(key.code) >= 0) {
            key.preventDefault();
            this.listener.onSpectateNext();
        }
    }
    handleUp(key) {
        const direction = this.directionOf(key);
        if (direction)
            this.held.delete(direction);
    }
}
KeyboardInput.ARROWS = { ArrowUp: "up", ArrowLeft: "left", ArrowDown: "down", ArrowRight: "right" };
KeyboardInput.WASD = { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right" };
KeyboardInput.PUSH_CODES = ["KeyJ"];
KeyboardInput.DASH_CODES = ["KeyK", "Space"];
KeyboardInput.SPECTATE_CODES = ["Tab"];
class TouchInput extends InputSource {
    constructor(page) {
        super();
        this.page = page;
        this.pointerId = null;
        this.originX = 0;
        this.originY = 0;
        this.stickX = 0;
        this.stickZ = 0;
        this.zone = page.byId("joyZone");
        this.base = page.byId("joyBase");
        this.knob = page.byId("joyKnob");
        this.bindStick();
    }
    axis() {
        return { x: this.stickX, z: this.stickZ };
    }
    bind(listener) {
        this.bindButton("btnPush", () => listener.onPush());
        this.bindButton("btnDash", () => listener.onDash());
    }
    release() {
        this.pointerId = null;
        this.stickX = this.stickZ = 0;
        this.page.show(this.base, false);
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
            this.page.show(this.base, true);
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
            const reach = length > TouchInput.JOYSTICK_RADIUS ? TouchInput.JOYSTICK_RADIUS / length : 1;
            this.knob.style.transform = "translate(" + dx * reach + "px," + dy * reach + "px)";
            const strength = Math.min(1, length / TouchInput.JOYSTICK_RADIUS);
            if (strength < TouchInput.DEAD_ZONE) {
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
    bindButton(id, action) {
        const button = this.page.byId(id);
        button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            action();
        });
    }
}
TouchInput.JOYSTICK_RADIUS = 50;
TouchInput.DEAD_ZONE = 0.18;
class CombinedInput {
    constructor(sources) {
        this.sources = sources;
    }
    axis() {
        for (const source of this.sources) {
            const axis = source.axis();
            if (axis.x || axis.z)
                return axis;
        }
        return { x: 0, z: 0 };
    }
    bind(listener) {
        this.sources.forEach((source) => source.bind(listener));
    }
    releaseAll() {
        this.sources.forEach((source) => source.release());
    }
}
