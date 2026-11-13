"use strict";
class BbPitchIcon {
    static path(kind, hand) {
        const start = BbPitchIcon.START;
        if (kind.arrivalJitterSeconds > 0)
            return "M20 5 Q14 10 20 14 Q26 18 20 22 Q16 25 20 28";
        const angle = kind.axisRadians(hand), reach = kind.isBreaking ? BbPitchIcon.BREAK_PIXELS : 0;
        const endX = 20 - Math.cos(angle) * reach, endY = 22 + Math.sin(angle) * reach;
        return "M" + start.x + " " + start.y + " Q20 " + (kind.isBreaking ? 15 : 13) + " " + endX.toFixed(1) + " " + endY.toFixed(1);
    }
    static end(kind, hand) {
        if (kind.arrivalJitterSeconds > 0)
            return { x: 20, y: 28 };
        const angle = kind.axisRadians(hand), reach = kind.isBreaking ? BbPitchIcon.BREAK_PIXELS : 0;
        return { x: 20 - Math.cos(angle) * reach, y: 22 + Math.sin(angle) * reach };
    }
}
BbPitchIcon.START = { x: 20, y: 5 };
BbPitchIcon.BREAK_PIXELS = 9;
class BbZoneAimWindow {
    constructor(host) {
        this.sheet = null;
        this.kind = null;
        this.aim = { u: 0, v: 0 };
        this.dragging = false;
        const span = BbZoneAimWindow.SPAN;
        this.frame = BbHudParts.box("bb-aim", host);
        this.picture = BbHudParts.shape("svg", "bb-aim-zone", this.frame, { viewBox: [-span, -span, span * 2, span * 2].join(" ") });
        this.allowed = BbHudParts.shape("rect", "bb-aim-allowed", this.picture);
        BbHudParts.shape("rect", "bb-aim-strike", this.picture, { x: -1, y: -1, width: 2, height: 2 });
        [-1 / 3, 1 / 3].forEach((line) => {
            BbHudParts.shape("line", "bb-aim-grid", this.picture, { x1: line, y1: -1, x2: line, y2: 1 });
            BbHudParts.shape("line", "bb-aim-grid", this.picture, { x1: -1, y1: line, x2: 1, y2: line });
        });
        this.reach = BbHudParts.shape("ellipse", "bb-aim-reach", this.picture);
        this.ball = BbHudParts.shape("circle", "bb-aim-ball", this.picture, { r: 0.14 });
        this.info = BbHudParts.box("bb-aim-info", this.frame);
        this.picture.addEventListener("pointerdown", (event) => { this.dragging = true; this.picture.setPointerCapture(event.pointerId); this.pointAt(event); });
        this.picture.addEventListener("pointermove", (event) => { if (this.dragging)
            this.pointAt(event); });
        this.picture.addEventListener("pointerup", () => { this.dragging = false; });
        this.picture.addEventListener("pointercancel", () => { this.dragging = false; });
    }
    nudge(sideways, upward) {
        if (!this.kind)
            return;
        this.aim = { u: this.aim.u + sideways, v: this.aim.v + upward };
        this.draw();
    }
    get call() { return this.kind ? { pitch: this.kind.id, aim: { u: this.aim.u, v: this.aim.v } } : null; }
    begin(sheet) {
        this.sheet = sheet;
        this.kind = null;
        this.aim = { u: 0, v: 0 };
        this.frame.classList.remove("open");
    }
    choose(kind) {
        this.kind = kind;
        this.frame.classList.add("open");
        this.draw();
    }
    close() {
        this.kind = null;
        this.frame.classList.remove("open");
    }
    pointAt(event) {
        const box = this.picture.getBoundingClientRect(), span = BbZoneAimWindow.SPAN;
        this.aim = { u: ((event.clientX - box.left) / box.width * 2 - 1) * span, v: (1 - (event.clientY - box.top) / box.height * 2) * span };
        event.preventDefault();
        this.draw();
    }
    draw() {
        const sheet = this.sheet, kind = this.kind;
        if (!sheet || !kind)
            return;
        this.aim = BbAimLimiter.clamp(this.aim, kind, sheet.abilities, sheet.hand);
        const edge = kind.reach(sheet.abilities, sheet.hand), limitU = Math.max(0, BbPitchTuning.AIM_LIMIT - edge.u), limitV = Math.max(0, BbPitchTuning.AIM_LIMIT - edge.v);
        const place = (shape, values) => Object.keys(values).forEach((name) => shape.setAttribute(name, String(values[name])));
        place(this.allowed, { x: -limitU, y: -limitV, width: limitU * 2, height: limitV * 2 });
        place(this.reach, {
            cx: this.aim.u, cy: -this.aim.v, rx: kind.longDeviation(sheet.abilities) * kind.cutRadius, ry: kind.shortDeviation(sheet.abilities) * kind.cutRadius,
            transform: "rotate(" + (-kind.axisRadians(sheet.hand) * 180 / Math.PI).toFixed(1) + " " + this.aim.u + " " + (-this.aim.v) + ")"
        });
        place(this.ball, { cx: this.aim.u, cy: -this.aim.v });
        this.info.textContent = kind.label + "  약 " + Math.round(kind.speedFor(sheet.abilities)) + "km/h";
    }
}
BbZoneAimWindow.SPAN = 2.4;
class BbPitchPad {
    constructor(host, onThrow) {
        this.onThrow = onThrow;
        this.held = new Set();
        this.usable = [];
        this.opened = false;
        this.aim = new BbZoneAimWindow(host);
        this.row = BbHudParts.box("bb-pad", host);
        this.paths = [];
        this.dots = [];
        this.keys = BbPitchCatalog.ALL.map((kind) => {
            const key = document.createElement("button");
            key.className = "bb-pitch-key";
            key.type = "button";
            BbHudParts.box("bb-pitch-letter", key, kind.hotkey);
            BbHudParts.box("bb-pitch-name", key, kind.label);
            const icon = BbHudParts.shape("svg", "bb-pitch-icon", key, { viewBox: "0 0 40 34" });
            BbHudParts.shape("rect", "bb-pitch-icon-zone", icon, { x: 11, y: 10, width: 18, height: 20 });
            this.paths.push(BbHudParts.shape("path", "bb-pitch-icon-path", icon));
            this.dots.push(BbHudParts.shape("circle", "bb-pitch-icon-ball", icon, { r: 2.6 }));
            key.addEventListener("click", () => this.pick(kind));
            this.row.appendChild(key);
            return key;
        });
        this.throwButton = document.createElement("button");
        this.throwButton.className = "bb-action bb-throw";
        this.throwButton.type = "button";
        this.throwButton.textContent = "던지기";
        this.throwButton.addEventListener("click", () => this.confirm());
        host.appendChild(this.throwButton);
        window.addEventListener("keydown", (event) => this.pressed(event));
        window.addEventListener("keyup", (event) => this.held.delete(event.key));
        window.addEventListener("blur", () => this.held.clear());
    }
    tick(frameSeconds) {
        if (!this.opened || !this.held.size)
            return;
        const reach = BbPitchPad.ARROW_SPEED * frameSeconds;
        let sideways = 0, upward = 0;
        this.held.forEach((key) => { sideways += BbPitchPad.ARROWS[key][0]; upward += BbPitchPad.ARROWS[key][1]; });
        this.aim.nudge(sideways * reach, upward * reach);
    }
    open(sheet) {
        this.opened = true;
        this.usable = sheet.pitches;
        this.aim.begin(sheet);
        BbPitchCatalog.ALL.forEach((kind, index) => {
            const end = BbPitchIcon.end(kind, sheet.hand);
            this.keys[index].disabled = sheet.pitches.indexOf(kind.id) < 0;
            this.keys[index].classList.remove("on");
            this.paths[index].setAttribute("d", BbPitchIcon.path(kind, sheet.hand));
            this.dots[index].setAttribute("cx", end.x.toFixed(1));
            this.dots[index].setAttribute("cy", end.y.toFixed(1));
        });
        this.row.classList.add("open");
        this.throwButton.classList.remove("open");
    }
    close() {
        this.opened = false;
        this.held.clear();
        this.aim.close();
        this.row.classList.remove("open");
        this.throwButton.classList.remove("open");
    }
    pick(kind) {
        if (!this.opened || this.usable.indexOf(kind.id) < 0)
            return;
        this.aim.choose(kind);
        this.keys.forEach((key, index) => key.classList.toggle("on", BbPitchCatalog.ALL[index] === kind));
        this.throwButton.classList.add("open");
    }
    confirm() {
        const call = this.aim.call;
        if (!this.opened || !call)
            return;
        this.close();
        this.onThrow(call);
    }
    pressed(event) {
        if (!this.opened)
            return;
        const arrow = BbPitchPad.ARROWS[event.key];
        if (arrow) {
            event.preventDefault();
            this.held.add(event.key);
            return;
        }
        if (event.repeat)
            return;
        const kind = BbPitchCatalog.ALL.find((candidate) => event.code === "Key" + candidate.hotkey);
        if (kind) {
            this.pick(kind);
            return;
        }
        if (BbPitchPad.THROW_CODES.indexOf(event.code) >= 0) {
            event.preventDefault();
            this.confirm();
        }
    }
}
BbPitchPad.THROW_CODES = ["Space", "Enter", "NumpadEnter"];
BbPitchPad.ARROW_SPEED = 1.5;
BbPitchPad.ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
class BbSwingButton {
    constructor(host, onSwing) {
        this.onSwing = onSwing;
        this.armed = false;
        this.button = document.createElement("button");
        this.button.className = "bb-action bb-swing";
        this.button.type = "button";
        this.button.textContent = "스윙";
        this.button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
        this.button.addEventListener("pointerdown", (event) => { event.preventDefault(); this.fire(); });
        host.appendChild(this.button);
        window.addEventListener("keydown", (event) => {
            if (!this.armed || event.repeat || BbSwingButton.SWING_CODES.indexOf(event.code) < 0)
                return;
            event.preventDefault();
            this.fire();
        });
    }
    arm() {
        this.armed = true;
        this.button.classList.add("open");
        this.button.classList.remove("spent");
    }
    disarm() {
        this.armed = false;
        this.button.classList.add("spent");
    }
    hide() {
        this.armed = false;
        this.button.classList.remove("open");
    }
    fire() {
        if (!this.armed)
            return;
        this.disarm();
        this.onSwing();
    }
}
BbSwingButton.SWING_CODES = ["Space", "Enter", "NumpadEnter"];
class BbFadingNote {
    constructor(element) {
        this.element = element;
        this.left = 0;
    }
    reveal(seconds) {
        this.left = seconds;
        this.element.classList.add("open");
    }
    hide() {
        this.left = 0;
        this.element.classList.remove("open");
    }
    tick(frameSeconds) {
        if (this.left <= 0)
            return;
        this.left -= frameSeconds;
        if (this.left <= 0)
            this.element.classList.remove("open");
    }
}
class BbTimingGauge {
    constructor(host) {
        this.element = BbHudParts.box("bb-gauge", host);
        this.label = BbHudParts.box("bb-gauge-label", this.element);
        const bar = BbHudParts.box("bb-gauge-bar", this.element);
        this.bands = BbTimingGauge.BAND_CLASSES.map(([, className]) => BbHudParts.box("bb-gauge-band " + className, bar));
        this.perfect = BbHudParts.box("bb-gauge-band bb-gauge-perfect", bar);
        this.marker = BbHudParts.box("bb-gauge-marker", bar, "▲");
        const ends = BbHudParts.box("bb-gauge-ends", this.element);
        BbHudParts.box("", ends, "빠름 ◀");
        BbHudParts.box("", ends, "▶ 늦음");
    }
    show(swing, leniency) {
        this.element.classList.toggle("blank", swing.adjusted === null);
        if (swing.adjusted === null) {
            this.label.textContent = "지켜봄";
            return;
        }
        const extra = BbTimingModel.BAND_EXTRA, range = swing.width + extra.poor * leniency + BbTimingGauge.MARGIN;
        const widthOf = (seconds) => (seconds / range * 100).toFixed(1) + "%";
        BbTimingGauge.BAND_CLASSES.forEach(([band], index) => { this.bands[index].style.width = widthOf(swing.width + extra[band] * leniency); });
        this.perfect.style.width = widthOf(swing.width);
        this.marker.style.left = (50 + BbCurve.clamp(swing.adjusted / range, -1, 1) * 50).toFixed(1) + "%";
        this.label.textContent = swing.band === "perfect" ? "정타" : swing.band === "good" ? "좋아요" : swing.adjusted < 0 ? "빨라요" : "늦었어요";
    }
}
BbTimingGauge.MARGIN = 0.03;
BbTimingGauge.BAND_CLASSES = [["fair", "bb-gauge-fair"], ["good", "bb-gauge-good"]];
class BbPitchReport extends BbFadingNote {
    constructor(host) {
        super(BbHudParts.box("bb-report", host));
        const span = BbPitchReport.SPAN;
        this.side = BbHudParts.box("bb-report-side", this.element);
        const picture = BbHudParts.shape("svg", "bb-report-zone", this.element, { viewBox: [-span, -span, span * 2, span * 2].join(" ") });
        BbHudParts.shape("rect", "bb-aim-strike", picture, { x: -1, y: -1, width: 2, height: 2 });
        [-1 / 3, 1 / 3].forEach((line) => {
            BbHudParts.shape("line", "bb-aim-grid", picture, { x1: line, y1: -1, x2: line, y2: 1 });
            BbHudParts.shape("line", "bb-aim-grid", picture, { x1: -1, y1: line, x2: 1, y2: line });
        });
        this.ball = BbHudParts.shape("circle", "bb-report-ball", picture, { r: 0.2 });
        this.pitch = BbHudParts.box("bb-report-pitch", this.element);
        this.gauge = new BbTimingGauge(this.element);
    }
    show(roll, swing, leniency, view) {
        const edge = BbPitchReport.SPAN - 0.2;
        this.ball.style.transform = "translate(" + BbCurve.clamp(roll.arrive.u * BbPitchReport.SIDE_OF_VIEW[view], -edge, edge).toFixed(3) + "px," + BbCurve.clamp(-roll.arrive.v, -edge, edge).toFixed(3) + "px)";
        this.side.textContent = BbPitchReport.VIEW_NAMES[view];
        this.pitch.textContent = BbPitchCatalog.of(roll.pitch).label + "  " + Math.round(roll.speed) + "km/h";
        this.gauge.show(swing, leniency);
        this.reveal(BbPitchReport.SECONDS);
    }
}
BbPitchReport.SECONDS = 4;
BbPitchReport.SPAN = 1.9;
BbPitchReport.SIDE_OF_VIEW = { pitcher: 1, batter: -1 };
BbPitchReport.VIEW_NAMES = { pitcher: "투수 시선", batter: "타자 시선" };
class BbCallToast extends BbFadingNote {
    constructor(host) {
        super(BbHudParts.box("bb-toast", host));
        this.headline = BbHudParts.box("bb-toast-call", this.element);
        this.detail = BbHudParts.box("bb-toast-pitch", this.element);
    }
    show(text, detail = "", seconds = BbCallToast.SECONDS) {
        this.headline.textContent = text;
        this.detail.textContent = detail;
        this.reveal(seconds);
    }
}
BbCallToast.SECONDS = 1.5;
