"use strict";
class ClimbInputRouter {
    constructor() {
        this.moveX = 0;
        this.moveY = 0;
        this.slowHeld = false;
        this.enabled = false;
        this.onJump = () => undefined;
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
    }
}
KeyboardInput.TURN_SPEED = 2.4;
KeyboardInput.PITCH_SPEED = 1.4;
KeyboardInput.MOVE_OF_CODE = { KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
KeyboardInput.LOOK_OF_KEY = { ArrowUp: "lookUp", ArrowDown: "lookDown", ArrowLeft: "lookLeft", ArrowRight: "lookRight" };
class TouchStick {
    constructor(ring, knob) {
        this.ring = ring;
        this.knob = knob;
        this.originX = 0;
        this.originY = 0;
    }
    grab(x, y) {
        this.originX = x;
        this.originY = y;
        this.ring.style.left = x + "px";
        this.ring.style.top = y + "px";
        this.ring.classList.add("on");
        this.knob.style.transform = "";
    }
    pull(x, y) {
        const dx = x - this.originX, dy = y - this.originY, far = Math.hypot(dx, dy), scale = far > TouchStick.RADIUS ? TouchStick.RADIUS / far : 1;
        this.knob.style.transform = "translate(" + dx * scale + "px," + dy * scale + "px)";
        return { dx, dy, far };
    }
    home() {
        this.ring.style.left = "";
        this.ring.style.top = "";
        this.ring.classList.remove("on");
        this.knob.style.transform = "";
    }
}
TouchStick.RADIUS = 60;
class TouchInput extends ClimbInputRouter {
    constructor(zone, moveRing, lookRing, jump, slow, pause) {
        super();
        this.zone = zone;
        this.used = false;
        this.moveId = -1;
        this.lookId = -1;
        this.lookLastX = 0;
        this.lookLastY = 0;
        this.moveStick = new TouchStick(moveRing, TouchInput.knobOf(moveRing));
        this.lookStick = new TouchStick(lookRing, TouchInput.knobOf(lookRing));
        zone.addEventListener("pointerdown", (e) => this.down(e));
        zone.addEventListener("pointermove", (e) => this.move(e));
        const up = (e) => this.up(e);
        zone.addEventListener("pointerup", up);
        zone.addEventListener("pointercancel", up);
        this.press(jump, () => this.onJump());
        this.press(pause, () => this.onPause());
        this.press(slow, () => { this.slowHeld = true; slow.classList.add("on"); });
        const slowOff = () => { this.slowHeld = false; slow.classList.remove("on"); };
        slow.addEventListener("pointerup", slowOff);
        slow.addEventListener("pointercancel", slowOff);
        slow.addEventListener("pointerleave", slowOff);
    }
    static knobOf(ring) {
        const knob = ring.querySelector(".tc-knob");
        if (!knob)
            throw new Error("조이스틱 손잡이가 없어요: " + ring.id);
        return knob;
    }
    press(button, act) {
        button.addEventListener("pointerdown", (e) => { e.preventDefault(); if (this.enabled)
            act(); });
        button.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    }
    release() {
        super.release();
        this.moveId = this.lookId = -1;
        this.moveStick.home();
        this.lookStick.home();
    }
    markTouch(e) {
        if (this.used || e.pointerType !== "touch")
            return;
        this.used = true;
        document.body.classList.add("touch");
    }
    capture(pointerId) {
        try {
            this.zone.setPointerCapture(pointerId);
        }
        catch (error) {
            return;
        }
    }
    down(e) {
        this.markTouch(e);
        if (!this.enabled || e.pointerType === "mouse")
            return;
        const left = e.clientX < window.innerWidth * TouchInput.STICK_SIDE;
        if (left ? this.moveId >= 0 : this.lookId >= 0)
            return;
        this.capture(e.pointerId);
        if (left) {
            this.moveId = e.pointerId;
            this.moveStick.grab(e.clientX, e.clientY);
            return;
        }
        this.lookId = e.pointerId;
        this.lookLastX = e.clientX;
        this.lookLastY = e.clientY;
        this.lookStick.grab(e.clientX, e.clientY);
    }
    move(e) {
        if (!this.enabled)
            return;
        if (e.pointerId === this.moveId) {
            const pull = this.moveStick.pull(e.clientX, e.clientY);
            if (pull.far < TouchInput.DEAD_ZONE) {
                this.moveX = this.moveY = 0;
                return;
            }
            this.moveX = pull.dx / pull.far;
            this.moveY = -pull.dy / pull.far;
            return;
        }
        if (e.pointerId !== this.lookId)
            return;
        this.lookX += (e.clientX - this.lookLastX) * TouchInput.TOUCH_TURN;
        this.lookY += (e.clientY - this.lookLastY) * TouchInput.TOUCH_TURN;
        this.lookLastX = e.clientX;
        this.lookLastY = e.clientY;
        this.lookStick.pull(e.clientX, e.clientY);
    }
    up(e) {
        if (e.pointerId === this.moveId) {
            this.moveId = -1;
            this.moveX = this.moveY = 0;
            this.moveStick.home();
        }
        if (e.pointerId === this.lookId) {
            this.lookId = -1;
            this.lookStick.home();
        }
    }
}
TouchInput.DEAD_ZONE = 14;
TouchInput.STICK_SIDE = 0.5;
TouchInput.TOUCH_TURN = 0.0058;
