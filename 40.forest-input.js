"use strict";
class FrJoystick {
    constructor(base, knob) {
        this.base = base;
        this.knob = knob;
        this.x = 0;
        this.z = 0;
        this.pointer = -1;
        base.addEventListener("pointerdown", (event) => this.start(event));
        window.addEventListener("pointermove", (event) => this.move(event));
        window.addEventListener("pointerup", (event) => this.end(event));
        window.addEventListener("pointercancel", (event) => this.end(event));
    }
    center() {
        const box = this.base.getBoundingClientRect();
        return { x: box.left + box.width / 2, z: box.top + box.height / 2 };
    }
    start(event) {
        event.preventDefault();
        this.pointer = event.pointerId;
        this.move(event);
    }
    move(event) {
        if (event.pointerId !== this.pointer)
            return;
        const c = this.center();
        let dx = event.clientX - c.x, dz = event.clientY - c.z;
        const length = Math.hypot(dx, dz);
        if (length > FrJoystick.RADIUS) {
            dx = (dx / length) * FrJoystick.RADIUS;
            dz = (dz / length) * FrJoystick.RADIUS;
        }
        this.knob.style.transform = "translate(" + dx + "px," + dz + "px)";
        const strength = Math.min(1, length / FrJoystick.RADIUS);
        if (strength < FrJoystick.DEAD_ZONE) {
            this.x = 0;
            this.z = 0;
            return;
        }
        this.x = (dx / Math.max(1, length)) * strength;
        this.z = (dz / Math.max(1, length)) * strength;
    }
    end(event) {
        if (event.pointerId !== this.pointer)
            return;
        this.pointer = -1;
        this.x = 0;
        this.z = 0;
        this.knob.style.transform = "translate(0,0)";
    }
}
FrJoystick.RADIUS = 52;
FrJoystick.DEAD_ZONE = 0.18;
class FrInput {
    constructor(joystickBase, joystickKnob, actionButton, handlers) {
        this.actionButton = actionButton;
        this.handlers = handlers;
        this.down = new Set();
        this.enabled = false;
        this.joystick = new FrJoystick(joystickBase, joystickKnob);
        window.addEventListener("keydown", (event) => this.keyDown(event));
        window.addEventListener("keyup", (event) => this.keyUp(event));
        window.addEventListener("blur", () => this.down.clear());
        actionButton.addEventListener("touchstart", (event) => { event.preventDefault(); this.handlers.press(); }, { passive: false });
        actionButton.addEventListener("touchend", (event) => { event.preventDefault(); this.handlers.release(); }, { passive: false });
        actionButton.addEventListener("pointerdown", (event) => { if (event.pointerType === "mouse")
            this.handlers.press(); });
        actionButton.addEventListener("pointerup", (event) => { if (event.pointerType === "mouse")
            this.handlers.release(); });
    }
    typing(event) {
        const target = event.target;
        return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
    }
    keyDown(event) {
        if (!this.enabled || this.typing(event))
            return;
        const code = event.code;
        if (code === "Space") {
            event.preventDefault();
            if (!event.repeat)
                this.handlers.press();
            return;
        }
        if (FrInput.MOVE_CODES.indexOf(code) >= 0) {
            event.preventDefault();
            this.down.add(code);
            return;
        }
        if (!event.repeat)
            this.handlers.key(code);
    }
    keyUp(event) {
        if (event.code === "Space") {
            if (this.enabled)
                this.handlers.release();
            return;
        }
        this.down.delete(event.code);
    }
    direction() {
        let x = this.joystick.x, z = this.joystick.z;
        if (this.down.has("KeyA") || this.down.has("ArrowLeft"))
            x -= 1;
        if (this.down.has("KeyD") || this.down.has("ArrowRight"))
            x += 1;
        if (this.down.has("KeyW") || this.down.has("ArrowUp"))
            z -= 1;
        if (this.down.has("KeyS") || this.down.has("ArrowDown"))
            z += 1;
        const length = Math.hypot(x, z);
        if (length > 1) {
            x /= length;
            z /= length;
        }
        return { x, z };
    }
    setActionLabel(text) { this.actionButton.textContent = text; }
}
FrInput.MOVE_CODES = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
