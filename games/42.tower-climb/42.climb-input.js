"use strict";
class ClimbInputRouter {
    constructor() {
        this.moveX = 0;
        this.moveY = 0;
        this.slowHeld = false;
        this.enabled = false;
        this.onJump = () => undefined;
        this.onGrab = () => undefined;
        this.onPause = () => undefined;
        this.lookX = 0;
        this.lookY = 0;
    }
    takeLookX() { const value = this.lookX; this.lookX = 0; return value; }
    takeLookY() { const value = this.lookY; this.lookY = 0; return value; }
    release() { this.moveX = this.moveY = 0; this.slowHeld = false; this.lookX = this.lookY = 0; }
}
class KeyboardInput extends ClimbInputRouter {
    constructor() {
        super();
        this.onPauseKey = () => undefined;
        this.held = new Set();
        window.addEventListener("keydown", (e) => this.key(e, true));
        window.addEventListener("keyup", (e) => this.key(e, false));
        window.addEventListener("blur", () => { this.held.clear(); this.refresh(); this.slowHeld = false; });
    }
    release() { super.release(); this.held.clear(); }
    advance(seconds) {
        const K = KeyboardInput, h = this.held;
        this.lookX += ((h.has("lookRight") ? 1 : 0) - (h.has("lookLeft") ? 1 : 0)) * K.TURN_SPEED * seconds;
        this.lookY += ((h.has("lookDown") ? 1 : 0) - (h.has("lookUp") ? 1 : 0)) * K.PITCH_SPEED * seconds;
    }
    control(e) {
        return KeyboardInput.LOOK_OF_KEY[e.key] ?? KeyboardInput.MOVE_OF_CODE[e.code] ?? "";
    }
    refresh() {
        const h = this.held;
        this.moveX = (h.has("right") ? 1 : 0) - (h.has("left") ? 1 : 0);
        this.moveY = (h.has("up") ? 1 : 0) - (h.has("down") ? 1 : 0);
    }
    key(e, down) {
        if (e.code === "Escape") {
            if (down && !e.repeat)
                this.onPauseKey();
            return;
        }
        if (!this.enabled)
            return;
        const control = this.control(e);
        if (control) {
            if (down)
                this.held.add(control);
            else
                this.held.delete(control);
            this.refresh();
            e.preventDefault();
            return;
        }
        if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
            this.slowHeld = down;
            return;
        }
        if (!down || e.repeat) {
            if (e.code === "Space")
                e.preventDefault();
            return;
        }
        if (e.code === "Space") {
            this.onJump();
            e.preventDefault();
        }
        else if (e.code === "KeyE")
            this.onGrab();
    }
}
KeyboardInput.TURN_SPEED = 2.4;
KeyboardInput.PITCH_SPEED = 1.4;
KeyboardInput.MOVE_OF_CODE = { KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
KeyboardInput.LOOK_OF_KEY = { ArrowUp: "lookUp", ArrowDown: "lookDown", ArrowLeft: "lookLeft", ArrowRight: "lookRight" };
class TouchInput extends ClimbInputRouter {
    constructor(zone, base, knob, jump, slow, grab, pause) {
        super();
        this.base = base;
        this.knob = knob;
        this.used = false;
        this.stickId = -1;
        this.stickX = 0;
        this.stickY = 0;
        this.lookers = new Map();
        zone.addEventListener("pointerdown", (e) => this.down(e));
        zone.addEventListener("pointermove", (e) => this.move(e));
        const up = (e) => this.up(e);
        zone.addEventListener("pointerup", up);
        zone.addEventListener("pointercancel", up);
        this.press(jump, () => this.onJump());
        this.press(grab, () => this.onGrab());
        this.press(pause, () => this.onPause());
        this.press(slow, () => { this.slowHeld = true; slow.classList.add("on"); });
        const slowOff = () => { this.slowHeld = false; slow.classList.remove("on"); };
        slow.addEventListener("pointerup", slowOff);
        slow.addEventListener("pointercancel", slowOff);
        slow.addEventListener("pointerleave", slowOff);
    }
    press(button, act) {
        button.addEventListener("pointerdown", (e) => { e.preventDefault(); if (this.enabled)
            act(); });
        button.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    }
    release() { super.release(); this.stickId = -1; this.lookers.clear(); this.drawKnob(0, 0, false); }
    markTouch(e) {
        if (this.used || e.pointerType !== "touch")
            return;
        this.used = true;
        document.body.classList.add("touch");
    }
    down(e) {
        this.markTouch(e);
        if (!this.enabled || e.pointerType === "mouse")
            return;
        if (this.stickId < 0 && e.clientX < window.innerWidth * TouchInput.STICK_SIDE) {
            this.stickId = e.pointerId;
            this.stickX = e.clientX;
            this.stickY = e.clientY;
            this.base.style.transform = "translate(" + (e.clientX - 64) + "px," + (e.clientY - 64) + "px)";
            this.drawKnob(0, 0, true);
            return;
        }
        this.lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    move(e) {
        if (!this.enabled)
            return;
        if (e.pointerId === this.stickId) {
            const dx = e.clientX - this.stickX, dy = e.clientY - this.stickY, far = Math.hypot(dx, dy);
            if (far < TouchInput.DEAD_ZONE) {
                this.moveX = this.moveY = 0;
                this.drawKnob(dx, dy, true);
                return;
            }
            this.moveX = dx / far;
            this.moveY = -dy / far;
            const reach = Math.min(far, TouchInput.KNOB_REACH);
            this.drawKnob(dx / far * reach, dy / far * reach, true);
            return;
        }
        const last = this.lookers.get(e.pointerId);
        if (!last)
            return;
        this.lookX += (e.clientX - last.x) * TouchInput.TOUCH_TURN;
        this.lookY += (e.clientY - last.y) * TouchInput.TOUCH_TURN;
        last.x = e.clientX;
        last.y = e.clientY;
    }
    up(e) {
        if (e.pointerId === this.stickId) {
            this.stickId = -1;
            this.moveX = this.moveY = 0;
            this.drawKnob(0, 0, false);
        }
        this.lookers.delete(e.pointerId);
    }
    drawKnob(dx, dy, active) {
        this.knob.style.transform = "translate(" + dx + "px," + dy + "px)";
        this.base.classList.toggle("on", active);
    }
}
TouchInput.DEAD_ZONE = 14;
TouchInput.KNOB_REACH = 46;
TouchInput.STICK_SIDE = 0.45;
TouchInput.TOUCH_TURN = 0.0058;
