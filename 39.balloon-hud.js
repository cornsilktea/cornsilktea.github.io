"use strict";
class WbDom {
    static el(id) { return document.getElementById(id); }
    static esc(text) { return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    static show(el, on) { el.hidden = !on; }
    static text(el, text) { if (el.textContent !== text)
        el.textContent = text; }
    static html(el, html) { if (el.innerHTML !== html)
        el.innerHTML = html; }
}
class WbKeyboard {
    constructor(handlers) {
        this.handlers = handlers;
        this.down = new Set();
        window.addEventListener("keydown", (e) => this.onDown(e));
        window.addEventListener("keyup", (e) => this.onUp(e));
        window.addEventListener("blur", () => this.releaseAll());
    }
    dirOf(e) {
        const byCode = WbKeyboard.MOVE[e.code];
        if (byCode !== undefined)
            return byCode;
        const byKey = WbKeyboard.MOVE[e.key];
        return byKey !== undefined ? byKey : WbDir.NONE;
    }
    onDown(e) {
        if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))
            return;
        const dir = this.dirOf(e);
        if (dir >= 0) {
            e.preventDefault();
            if (!this.down.has(dir)) {
                this.down.add(dir);
                this.handlers.dir(dir, true);
            }
            return;
        }
        if (WbKeyboard.ACTION.indexOf(e.code) >= 0) {
            e.preventDefault();
            if (!e.repeat)
                this.handlers.action();
            return;
        }
        if (!e.repeat)
            this.handlers.other(e.code);
    }
    onUp(e) {
        const dir = this.dirOf(e);
        if (dir >= 0 && this.down.has(dir)) {
            this.down.delete(dir);
            this.handlers.dir(dir, false);
        }
    }
    releaseAll() {
        for (const dir of Array.from(this.down)) {
            this.down.delete(dir);
            this.handlers.dir(dir, false);
        }
    }
}
WbKeyboard.MOVE = {
    ArrowUp: WbDir.UP, ArrowRight: WbDir.RIGHT, ArrowDown: WbDir.DOWN, ArrowLeft: WbDir.LEFT,
    KeyW: WbDir.UP, KeyD: WbDir.RIGHT, KeyS: WbDir.DOWN, KeyA: WbDir.LEFT,
};
WbKeyboard.ACTION = ["KeyK", "Space"];
class WbJoystick {
    constructor(zone) {
        this.zone = zone;
        this.pointer = null;
        this.ox = 0;
        this.oy = 0;
        this.dx = 0;
        this.dy = 0;
        this.base = WbDom.el("joyBase");
        this.knob = WbDom.el("joyKnob");
        zone.addEventListener("pointerdown", (e) => this.press(e));
        zone.addEventListener("pointermove", (e) => this.drag(e));
        zone.addEventListener("pointerup", (e) => this.lift(e));
        zone.addEventListener("pointercancel", (e) => this.lift(e));
    }
    radius() { return this.base.offsetWidth / 2 || 60; }
    press(e) {
        if (this.pointer !== null || this.base.offsetWidth === 0)
            return;
        const box = this.base.getBoundingClientRect();
        const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
        if (Math.hypot(e.clientX - cx, e.clientY - cy) > this.radius() * 2.5)
            return;
        this.pointer = e.pointerId;
        this.ox = cx;
        this.oy = cy;
        this.dx = e.clientX - cx;
        this.dy = e.clientY - cy;
        try {
            this.zone.setPointerCapture(e.pointerId);
        }
        catch (error) {
            this.pointer = e.pointerId;
        }
        e.preventDefault();
        this.paint();
    }
    drag(e) {
        if (e.pointerId !== this.pointer)
            return;
        this.dx = e.clientX - this.ox;
        this.dy = e.clientY - this.oy;
        this.paint();
    }
    lift(e) {
        if (e.pointerId !== this.pointer)
            return;
        this.reset();
    }
    reset() { this.pointer = null; this.dx = this.dy = 0; this.paint(); }
    paint() {
        const r = this.radius(), d = Math.hypot(this.dx, this.dy), k = d > r ? r / d : 1;
        this.knob.style.transform = "translate(" + (this.dx * k) + "px," + (this.dy * k) + "px)";
        this.base.classList.toggle("on", this.pointer !== null);
    }
    get active() { return this.pointer !== null; }
    read() {
        const none = { move: WbDir.NONE, alt: WbDir.NONE };
        if (this.pointer === null || Math.hypot(this.dx, this.dy) < WbJoystick.DEAD)
            return none;
        const ax = Math.abs(this.dx), ay = Math.abs(this.dy);
        const horizontal = this.dx > 0 ? WbDir.RIGHT : WbDir.LEFT, vertical = this.dy > 0 ? WbDir.DOWN : WbDir.UP;
        const major = ax >= ay ? horizontal : vertical, minor = ax >= ay ? vertical : horizontal;
        return { move: major, alt: Math.min(ax, ay) >= WbJoystick.DEAD ? minor : WbDir.NONE };
    }
}
WbJoystick.DEAD = 8;
class WbActionButton {
    constructor(onPress) {
        this.el = WbDom.el("btnBalloon");
        this.icon = WbDom.el("btnBalloonIcon");
        this.count = WbDom.el("btnBalloonCount");
        this.el.addEventListener("pointerdown", (e) => { e.preventDefault(); onPress(); });
        this.el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    }
    show(mode, count) {
        WbDom.text(this.icon, mode === "needle" ? "📌" : "💧");
        WbDom.text(this.count, String(count));
        this.el.classList.toggle("needle", mode === "needle");
        this.el.classList.toggle("dim", mode === "empty");
    }
    shake() {
        this.el.classList.remove("shake");
        void this.el.offsetWidth;
        this.el.classList.add("shake");
    }
}
class WbBanner {
    constructor() {
        this.timer = 0;
        this.el = WbDom.el("banner");
    }
    show(text, strong = false, ms = 1600) {
        WbDom.text(this.el, text);
        this.el.classList.toggle("strong", strong);
        WbDom.show(this.el, true);
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => WbDom.show(this.el, false), ms);
    }
    hide() { window.clearTimeout(this.timer); WbDom.show(this.el, false); }
}
class WbBigCount {
    constructor() {
        this.shown = "";
        this.el = WbDom.el("bigCount");
    }
    set(text) {
        if (text === this.shown)
            return;
        this.shown = text;
        WbDom.show(this.el, text !== "");
        if (!text)
            return;
        WbDom.text(this.el, text);
        this.el.classList.remove("pop");
        void this.el.offsetWidth;
        this.el.classList.add("pop");
    }
}
class WbFloatText {
    constructor() { this.layer = WbDom.el("floatLayer"); }
    spawn(x, y, text, kind) {
        const el = document.createElement("div");
        el.className = "wb-float " + kind;
        el.textContent = text;
        el.style.left = x + "px";
        el.style.top = y + "px";
        this.layer.appendChild(el);
        window.setTimeout(() => el.remove(), 1000);
    }
}
class WbTimeText {
    static clock(seconds) {
        const s = Math.max(0, Math.ceil(seconds));
        return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }
}
class WbHud {
    constructor() {
        this.clock = WbDom.el("hudClock");
        this.alive = WbDom.el("hudAlive");
        this.mine = WbDom.el("hudMine");
        this.veil = WbDom.el("trapVeil");
        this.trapBig = WbDom.el("trapBig");
        this.trapHint = WbDom.el("trapHint");
    }
    show(on) {
        WbDom.show(WbDom.el("hudTop"), on);
        WbDom.show(this.mine, on);
        if (!on) {
            WbDom.show(this.veil, false);
            WbDom.show(WbDom.el("trapCenter"), false);
        }
    }
    update(engine, watched, mine) {
        const left = WbBalance.MATCH - Math.max(0, engine.seconds);
        WbDom.text(this.clock, engine.tick < 0 ? "준비" : "⏱ " + WbTimeText.clock(left));
        this.clock.classList.toggle("sudden", engine.seconds >= WbBalance.SUDDEN_START);
        WbDom.html(this.alive, this.aliveHtml(engine));
        WbDom.html(this.mine, watched ? this.statsHtml(engine, watched, mine) : "");
        const trapped = !!watched && mine && watched.life === "trapped";
        WbDom.show(this.veil, trapped);
        WbDom.show(WbDom.el("trapCenter"), trapped);
        if (watched && trapped) {
            const sec = Math.max(0, (watched.trapUntil - engine.tick) / WbBalance.RATE);
            WbDom.text(this.trapBig, sec.toFixed(1));
            this.trapBig.classList.toggle("blink", sec < WbBalance.TRAP_BLINK);
            WbDom.text(this.trapHint, watched.needles > 0 ? "K / 버튼으로 바늘 탈출 (📌 " + watched.needles + ")" : engine.mode === "team" ? "같은 팀이 닿으면 풀려나요" : "바늘이 없어요");
        }
    }
    aliveHtml(engine) {
        if (engine.mode === "solo")
            return "남은 사람 <b>" + engine.players.filter((p) => p.life !== "out").length + "</b>/" + engine.players.length;
        return engine.teamColors().map((c) => {
            const left = engine.players.filter((p) => p.team === c && p.life !== "out").length;
            const color = left ? WbPalette.teamColor("team", c) : "#6B7380";
            return "<span class=\"teamDot\" style=\"background:" + color + "\"></span><b>" + left + "</b>";
        }).join(" ");
    }
    statsHtml(engine, p, mine) {
        const parts = [];
        if (!mine)
            parts.push("<div class=\"hudWho\">" + WbDom.esc(p.nick) + " 보는 중</div>");
        const cell = (icon, text, full) => "<span class=\"stat" + (full ? " full" : "") + "\">" + icon + " " + text + "</span>";
        parts.push("<div class=\"statRow\">" +
            cell("💧", p.balloonsMax + "/" + WbBalance.BALLOON_MAX, p.balloonsMax >= WbBalance.BALLOON_MAX) +
            cell("<i class=\"rangeIcon\"></i>", p.range + "/" + WbBalance.RANGE_MAX, p.range >= WbBalance.RANGE_MAX) +
            cell("👟", p.shoe + "/" + WbBalance.SHOE_MAX, p.shoe >= WbBalance.SHOE_MAX) + "</div>");
        const extra = [];
        if (p.needles)
            extra.push(cell("📌", String(p.needles), p.needles >= WbBalance.NEEDLE_MAX));
        if (p.kick)
            extra.push("<span class=\"stat kick\">발차기</span>");
        if (engine.tick < p.shieldUntil)
            extra.push(cell("🛡", Math.ceil((p.shieldUntil - engine.tick) / WbBalance.RATE) + "초", false));
        if (p.life === "out")
            extra.push("<span class=\"stat out\">탈락</span>");
        if (extra.length)
            parts.push("<div class=\"statRow\">" + extra.join("") + "</div>");
        return parts.join("");
    }
}
WbHud.ITEM_NAMES = {
    balloon: "물풍선", range: "물줄기", shoe: "운동화", needle: "바늘", kick: "발차기 신발", maxRange: "최대 물줄기", shield: "방패",
};
class WbSound {
    constructor() {
        this.context = null;
        this.noise = null;
        this.muted = false;
        this.lastBlast = 0;
        const wake = () => this.wake();
        window.addEventListener("pointerdown", wake);
        window.addEventListener("keydown", wake);
    }
    get isMuted() { return this.muted; }
    toggle() { this.muted = !this.muted; return this.muted; }
    wake() {
        if (this.context) {
            if (this.context.state === "suspended")
                this.context.resume();
            return;
        }
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor)
            return;
        this.context = new Ctor();
        const length = Math.floor(this.context.sampleRate * 0.5);
        this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let k = 0; k < length; k++)
            data[k] = Math.random() * 2 - 1;
    }
    ready() { return this.muted || !this.context || this.context.state !== "running" ? null : this.context; }
    tone(freq, to, seconds, type, volume, delay = 0) {
        const c = this.ready();
        if (!c)
            return;
        const t = c.currentTime + delay;
        const osc = c.createOscillator(), gain = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + seconds);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + seconds);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + seconds + 0.02);
    }
    hiss(seconds, cutoff, volume) {
        const c = this.ready();
        if (!c || !this.noise)
            return;
        const t = c.currentTime;
        const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
        source.buffer = this.noise;
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(cutoff, t);
        filter.frequency.exponentialRampToValueAtTime(cutoff * 0.25, t + seconds);
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.0008, t + seconds);
        source.connect(filter).connect(gain).connect(c.destination);
        source.start(t);
        source.stop(t + seconds + 0.02);
    }
    place() { this.tone(520, 780, 0.07, "sine", 0.18); }
    noPlace() { this.tone(170, 140, 0.08, "square", 0.05); }
    blast(count, nowMs) {
        if (nowMs - this.lastBlast < 40)
            return;
        this.lastBlast = nowMs;
        const loud = Math.min(0.5, 0.22 + count * 0.05);
        this.hiss(0.38, 1800, loud);
        this.tone(200, 80, 0.25, "sine", loud * 0.6);
    }
    trap() { this.tone(700, 1500, 0.14, "triangle", 0.16); this.tone(1500, 1100, 0.1, "sine", 0.08, 0.1); }
    pop() { this.tone(420, 60, 0.18, "square", 0.1); this.hiss(0.12, 4000, 0.15); }
    rescue() { this.tone(660, 990, 0.12, "sine", 0.15); this.tone(990, 1320, 0.12, "sine", 0.12, 0.08); }
    pick(rare) { this.tone(880, 880, 0.08, "sine", 0.12); this.tone(rare ? 1560 : 1320, rare ? 1560 : 1320, 0.12, "sine", 0.12, 0.06); }
    beep(high) { this.tone(high ? 990 : 660, high ? 990 : 660, high ? 0.3 : 0.12, "sine", 0.16); }
    warn() { this.tone(220, 180, 0.45, "sawtooth", 0.07); }
}
class WbVibration {
    static trap() {
        const activation = navigator.userActivation;
        if (!navigator.vibrate || (activation && !activation.hasBeenActive))
            return;
        try {
            navigator.vibrate(120);
        }
        catch (error) {
            return;
        }
    }
}
class WbResultBoard {
    constructor() {
        this.box = WbDom.el("resultBox");
    }
    hide() { WbDom.show(this.box, false); }
    show(engine, myIndex) {
        const order = engine.players.map((p, k) => ({ p, rank: engine.ranks[k] || 1 })).sort((a, b) => a.rank - b.rank || b.p.kills - a.p.kills);
        const me = engine.players[myIndex];
        const myRank = me ? engine.ranks[myIndex] : 0;
        const winners = order.filter((r) => r.rank === 1).length;
        const title = !me ? "경기 끝" : myRank === 1 ? (winners > 1 && engine.mode === "solo" ? "공동 1위!" : "우승!") : myRank + "위";
        WbDom.text(WbDom.el("resultTitle"), title);
        const team = engine.mode === "team";
        WbDom.html(WbDom.el("resultHead"), "<tr><th>순위</th><th>이름</th><th>가둔 수</th><th>처치</th>" + (team ? "<th>구출</th>" : "") + "<th>상자</th><th>자폭</th></tr>");
        const rows = order.map(({ p, rank }) => {
            const color = WbPalette.teamColor(engine.mode, p.team);
            const why = p.disconnected ? " <small>연결 끊김</small>" : "";
            return "<tr class=\"" + (p.index === myIndex ? "me" : "") + "\"><td>" + rank + "</td><td><span class=\"tc\" style=\"background:" + color + "\"></span>" + WbDom.esc(p.nick) + (p.bot ? " <small>BOT</small>" : "") + why + "</td>" +
                "<td>" + p.traps + "</td><td>" + p.kills + "</td>" + (team ? "<td>" + p.rescues + "</td>" : "") + "<td>" + p.boxes + "</td><td>" + p.selfKills + "</td></tr>";
        }).join("");
        WbDom.html(WbDom.el("resultRows"), rows);
        WbDom.show(this.box, true);
    }
}
