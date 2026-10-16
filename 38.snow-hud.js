"use strict";
class SnDom {
    static el(id) { return document.getElementById(id); }
    static esc(text) { return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    static show(el, on) { el.hidden = !on; }
    static text(el, text) { if (el.textContent !== text)
        el.textContent = text; }
    static html(el, html) { if (el.innerHTML !== html)
        el.innerHTML = html; }
}
class SnKeyboard {
    constructor() {
        this.held = { up: false, down: false, left: false, right: false, k: false };
        this.listeners = [];
        window.addEventListener("keydown", (e) => this.onDown(e));
        window.addEventListener("keyup", (e) => this.onUp(e));
        window.addEventListener("blur", () => this.release());
    }
    onPress(listener) { this.listeners.push(listener); }
    nameOf(e) { return SnKeyboard.MOVE[e.code] ? e.code : SnKeyboard.MOVE[e.key] ? e.key : e.code; }
    onDown(e) {
        if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName))
            return;
        const name = this.nameOf(e), dir = SnKeyboard.MOVE[name];
        if (dir) {
            this.held[dir] = true;
            e.preventDefault();
        }
        if (e.code === "KeyK")
            this.held.k = true;
        if (!e.repeat)
            this.listeners.forEach((fn) => fn(e.code || e.key));
    }
    onUp(e) {
        const dir = SnKeyboard.MOVE[this.nameOf(e)];
        if (dir)
            this.held[dir] = false;
        if (e.code === "KeyK")
            this.held.k = false;
    }
    release() { this.held.up = this.held.down = this.held.left = this.held.right = this.held.k = false; }
    vector() {
        const x = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0), z = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0);
        const d = Math.hypot(x, z);
        return d ? { x: x / d, z: z / d } : { x: 0, z: 0 };
    }
}
SnKeyboard.MOVE = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
};
class SnJoystick {
    constructor(zone) {
        this.zone = zone;
        this.pointer = null;
        this.ox = 0;
        this.oy = 0;
        this.dx = 0;
        this.dy = 0;
        this.base = SnDom.el("joyBase");
        this.knob = SnDom.el("joyKnob");
        zone.addEventListener("pointerdown", (e) => this.down(e));
        zone.addEventListener("pointermove", (e) => this.move(e));
        zone.addEventListener("pointerup", (e) => this.up(e));
        zone.addEventListener("pointercancel", (e) => this.up(e));
    }
    radius() { return this.base.offsetWidth / 2 || 60; }
    down(e) {
        if (this.pointer !== null)
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
    move(e) {
        if (e.pointerId !== this.pointer)
            return;
        this.dx = e.clientX - this.ox;
        this.dy = e.clientY - this.oy;
        this.paint();
    }
    up(e) {
        if (e.pointerId !== this.pointer)
            return;
        this.pointer = null;
        this.dx = this.dy = 0;
        this.paint();
    }
    reset() { this.pointer = null; this.dx = this.dy = 0; this.paint(); }
    paint() {
        const r = this.radius(), d = Math.hypot(this.dx, this.dy), k = d > r ? r / d : 1;
        this.knob.style.transform = "translate(" + (this.dx * k) + "px," + (this.dy * k) + "px)";
        this.base.classList.toggle("on", this.pointer !== null);
    }
    vector() {
        if (this.pointer === null)
            return null;
        const d = Math.hypot(this.dx, this.dy);
        if (d < SnJoystick.DEAD)
            return { x: 0, z: 0 };
        const m = Math.min(1, d / this.radius());
        return { x: this.dx / d * m, z: this.dy / d * m };
    }
}
SnJoystick.DEAD = 8;
class SnAimButton {
    constructor(el, kind, handlers) {
        this.el = el;
        this.kind = kind;
        this.handlers = handlers;
        this.pointer = null;
        this.ox = 0;
        this.oy = 0;
        this.dragging = false;
        this.cancelled = false;
        this.angle = 0;
        el.addEventListener("pointerdown", (e) => this.down(e));
        el.addEventListener("pointermove", (e) => this.move(e));
        el.addEventListener("pointerup", (e) => this.up(e, false));
        el.addEventListener("pointercancel", (e) => this.up(e, true));
        el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    }
    get pressed() { return this.pointer !== null; }
    get aiming() { return this.pointer !== null && this.dragging && !this.cancelled; }
    get dragged() { return this.pointer !== null && this.dragging; }
    down(e) {
        e.preventDefault();
        if (this.pointer !== null)
            return;
        this.pointer = e.pointerId;
        this.ox = e.clientX;
        this.oy = e.clientY;
        this.dragging = false;
        this.cancelled = false;
        try {
            this.el.setPointerCapture(e.pointerId);
        }
        catch (error) {
            this.pointer = e.pointerId;
        }
        this.handlers.press();
    }
    move(e) {
        if (e.pointerId !== this.pointer)
            return;
        const dx = e.clientX - this.ox, dy = e.clientY - this.oy;
        if (Math.hypot(dx, dy) > SnAimButton.DRAG_MIN) {
            this.dragging = true;
            this.angle = Math.atan2(dy, dx);
        }
        const box = this.el.getBoundingClientRect();
        this.cancelled = this.dragging && e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
        if (this.dragging && !this.cancelled)
            this.handlers.drag(this.angle, this.kind);
    }
    up(e, lost) {
        if (e.pointerId !== this.pointer)
            return;
        this.pointer = null;
        this.handlers.release(this.dragging ? this.angle : null, lost || this.cancelled);
        this.dragging = false;
    }
}
SnAimButton.DRAG_MIN = 14;
class SnLocalControls {
    constructor(shotCounter) {
        this.shotCounter = shotCounter;
        this.keyboard = new SnKeyboard();
        this.enabled = false;
        this.aimAngle = null;
        this.aimKind = "throw";
        this.pendingAttack = false;
        this.pendingAttackAngle = null;
        this.pendingWall = false;
        this.pendingWallAngle = null;
        this.pendingDrop = null;
        this.throwPressedAt = -1;
        this.shotsAtPress = -1;
        this.mapListeners = [];
        this.headingOf = () => -Math.PI / 2;
        this.latched = null;
        this.joystick = new SnJoystick(SnDom.el("touchZone"));
        this.throwButton = new SnAimButton(SnDom.el("btnThrow"), "throw", {
            press: () => { this.throwPressedAt = performance.now(); this.shotsAtPress = this.shotCounter(); },
            drag: (angle, kind) => { this.aimAngle = angle; this.aimKind = kind; },
            release: (angle, cancelled) => {
                this.aimAngle = null;
                if (cancelled || !this.enabled)
                    return;
                if (angle !== null) {
                    this.pendingAttack = true;
                    this.pendingAttackAngle = angle;
                    return;
                }
                if (this.shotCounter() === this.shotsAtPress) {
                    this.pendingAttack = true;
                    this.pendingAttackAngle = null;
                }
            },
        });
        this.wallButton = new SnAimButton(SnDom.el("btnWall"), "wall", {
            press: () => undefined,
            drag: (angle, kind) => { this.aimAngle = angle; this.aimKind = kind; },
            release: (angle, cancelled) => {
                this.aimAngle = null;
                if (cancelled || !this.enabled)
                    return;
                this.pendingWall = true;
                this.pendingWallAngle = angle;
            },
        });
        this.keyboard.onPress((code) => {
            if (code === "KeyM") {
                this.mapListeners.forEach((fn) => fn());
                return;
            }
            if (!this.enabled)
                return;
            if (code === "KeyK") {
                this.pendingAttack = true;
                this.pendingAttackAngle = null;
            }
            if (code === "KeyJ") {
                this.pendingWall = true;
                this.pendingWallAngle = null;
            }
        });
    }
    useHeading(provider) { this.headingOf = provider; }
    toWorld(screenAngle) {
        return SnAngle.wrap((this.latched === null ? this.headingOf() : this.latched) + Math.PI / 2 + screenAngle);
    }
    aimWorldAngle() { return this.aimAngle === null ? null : this.toWorld(this.aimAngle); }
    onMapKey(listener) { this.mapListeners.push(listener); }
    queueDrop(x, z) { this.pendingDrop = { x, z }; }
    holdingK() {
        const buttonHeld = this.throwButton.pressed && !this.throwButton.dragged && performance.now() - this.throwPressedAt > SnLocalControls.HOLD_MS;
        return this.keyboard.held.k || buttonHeld;
    }
    intent(canThrow = true) {
        const intent = SnIdleIntent.make();
        if (this.pendingDrop) {
            intent.dropPick = this.pendingDrop;
            this.pendingDrop = null;
        }
        if (!this.enabled) {
            this.pendingAttack = this.pendingWall = false;
            return intent;
        }
        const stick = this.joystick.vector() || this.keyboard.vector();
        const m = Math.hypot(stick.x, stick.z);
        if (m > 0.05) {
            if (this.latched === null)
                this.latched = this.headingOf();
            const world = this.toWorld(Math.atan2(stick.z, stick.x));
            intent.moveX = Math.cos(world) * m;
            intent.moveZ = Math.sin(world) * m;
        }
        else
            this.latched = null;
        intent.holdK = this.holdingK();
        if (this.pendingAttack && canThrow) {
            intent.attack = true;
            intent.attackAngle = this.pendingAttackAngle === null ? null : this.toWorld(this.pendingAttackAngle);
            this.pendingAttack = false;
        }
        if (this.pendingWall) {
            intent.wall = true;
            intent.wallAngle = this.pendingWallAngle === null ? null : this.toWorld(this.pendingWallAngle);
            this.pendingWall = false;
        }
        return intent;
    }
    reset() {
        this.keyboard.release();
        this.joystick.reset();
        this.pendingAttack = this.pendingWall = false;
        this.pendingDrop = null;
        this.aimAngle = null;
        this.latched = null;
    }
}
SnLocalControls.HOLD_MS = 250;
class SnLocalPilot {
    constructor(controls) {
        this.controls = controls;
        this.bot = false;
    }
    decide(engine, me) { return this.controls.intent(engine.time >= me.nextShotAt); }
}
class SnMapPainter {
    constructor(map) {
        this.map = map;
        this.base = document.createElement("canvas");
        this.base.width = this.base.height = SnMapPainter.SIZE;
        this.paintBase();
    }
    paintBase() {
        const ctx = this.base.getContext("2d");
        const cell = SnMapPainter.SIZE / SnGridMath.SIZE, map = this.map;
        const levels = ["#DCE6EE", "#C4D3DF", "#A9BDCD"];
        for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
            const kind = map.kind[idx];
            ctx.fillStyle = kind === SnTile.MOUNTAIN ? "#7E848C" : kind === SnTile.BLOCK ? "#8C6A55" : kind === SnTile.RAMP ? "#B9C9D6" : levels[map.level[idx]];
            ctx.fillRect(SnGridMath.colOf(idx) * cell, SnGridMath.rowOf(idx) * cell, cell + 0.5, cell + 0.5);
        }
        ctx.strokeStyle = "rgba(60,70,84,.75)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
            if (!map.walkable(idx))
                continue;
            const i = SnGridMath.colOf(idx), j = SnGridMath.rowOf(idx);
            if (i + 1 < SnGridMath.SIZE) {
                const n = idx + 1;
                if (map.walkable(n) && !map.connected(idx, n)) {
                    ctx.moveTo((i + 1) * cell, j * cell);
                    ctx.lineTo((i + 1) * cell, (j + 1) * cell);
                }
            }
            if (j + 1 < SnGridMath.SIZE) {
                const n = idx + SnGridMath.SIZE;
                if (map.walkable(n) && !map.connected(idx, n)) {
                    ctx.moveTo(i * cell, (j + 1) * cell);
                    ctx.lineTo((i + 1) * cell, (j + 1) * cell);
                }
            }
        }
        ctx.stroke();
        const scale = SnMapPainter.SIZE / (SnGridMath.HALF * 2);
        for (const o of map.obstacles) {
            const x = (o.x + SnGridMath.HALF) * scale, y = (o.z + SnGridMath.HALF) * scale;
            if (o.model === "pine") {
                ctx.fillStyle = "#2E5845";
                ctx.beginPath();
                ctx.arc(x, y, 3.2, 0, Math.PI * 2);
                ctx.fill();
            }
            else if (o.model === "rock") {
                ctx.fillStyle = "#6E737A";
                ctx.beginPath();
                ctx.arc(x, y, Math.max(2, o.radius * scale), 0, Math.PI * 2);
                ctx.fill();
            }
            else if (!o.isBox || o.halfX < 2.5) {
                ctx.fillStyle = "#8C6A55";
                ctx.fillRect(x - 2, y - 2, 4, 4);
            }
        }
    }
}
SnMapPainter.SIZE = 480;
class SnMapCanvas {
    constructor(canvas, painter) {
        this.canvas = canvas;
        this.painter = painter;
    }
    fit() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
            this.canvas.width = Math.round(w * dpr);
            this.canvas.height = Math.round(h * dpr);
        }
        return { w, h, dpr };
    }
    draw(cx, cz, span, marks) {
        const { w, h, dpr } = this.fit();
        if (!w || !h)
            return;
        const ctx = this.canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const size = Math.min(w, h), scale = size / span;
        const ox = w / 2 - cx * scale, oy = h / 2 - cz * scale;
        const toX = (x) => ox + x * scale, toY = (z) => oy + z * scale;
        ctx.fillStyle = "#EEF3F8";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(this.painter.base, toX(-SnGridMath.HALF), toY(-SnGridMath.HALF), SnGridMath.HALF * 2 * scale, SnGridMath.HALF * 2 * scale);
        const s = marks.storm;
        if (s.r > 0.2) {
            ctx.save();
            ctx.fillStyle = "rgba(235,242,250,.55)";
            ctx.beginPath();
            ctx.rect(0, 0, w, h);
            ctx.arc(toX(s.x), toY(s.z), s.r * scale, 0, Math.PI * 2, true);
            ctx.fill("evenodd");
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.arc(toX(s.x), toY(s.z), s.r * scale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        else {
            ctx.fillStyle = "rgba(235,242,250,.55)";
            ctx.fillRect(0, 0, w, h);
        }
        if (s.next && s.next.r > 0.2) {
            ctx.save();
            ctx.setLineDash([6, 5]);
            ctx.strokeStyle = "#2F6FD6";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(toX(s.next.x), toY(s.next.z), s.next.r * scale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = "#F7C948";
        ctx.strokeStyle = "rgba(40,30,10,.7)";
        ctx.lineWidth = 1;
        for (const c of marks.crates) {
            if (c.taken)
                continue;
            ctx.beginPath();
            ctx.rect(toX(c.x) - 3, toY(c.z) - 3, 6, 6);
            ctx.fill();
            ctx.stroke();
        }
        for (const pin of marks.pins) {
            const x = toX(pin.x), y = toY(pin.z);
            ctx.fillStyle = pin.color;
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y - 16, 8, Math.PI * 0.8, Math.PI * 2.2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        for (const p of marks.people) {
            const x = toX(p.x), y = toY(p.z);
            ctx.save();
            ctx.translate(x, y);
            if (p.down) {
                ctx.fillStyle = "#FFFFFF";
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            else if (p.me) {
                ctx.rotate(p.yaw);
                ctx.fillStyle = "#D97B4F";
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(9, 0);
                ctx.lineTo(-6, 6);
                ctx.lineTo(-3, 0);
                ctx.lineTo(-6, -6);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            else {
                ctx.fillStyle = p.color;
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.arc(0, 0, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }
    }
    worldAt(clientX, clientY, cx, cz, span) {
        const box = this.canvas.getBoundingClientRect(), size = Math.min(box.width, box.height), scale = size / span;
        return { x: cx + (clientX - box.left - box.width / 2) / scale, z: cz + (clientY - box.top - box.height / 2) / scale };
    }
}
class SnToast {
    constructor(el) {
        this.el = el;
        this.hideAt = 0;
    }
    show(text, seconds, nowMs, strong = false) {
        this.el.textContent = text;
        this.el.classList.toggle("strong", strong);
        this.el.hidden = false;
        this.hideAt = nowMs + seconds * 1000;
    }
    update(nowMs) { if (!this.el.hidden && nowMs > this.hideAt)
        this.el.hidden = true; }
}
class SnDamageNumbers {
    constructor(layer) {
        this.layer = layer;
        this.pool = [];
    }
    add(text, kind, x, y, z, nowMs) {
        let slot = this.pool.find((p) => p.until < nowMs);
        if (!slot) {
            if (this.pool.length > 40)
                return;
            const el = document.createElement("div");
            el.className = "sn-num";
            this.layer.appendChild(el);
            slot = { el, until: 0, x: 0, y: 0, z: 0, born: 0 };
            this.pool.push(slot);
        }
        slot.el.textContent = text;
        slot.el.className = "sn-num " + kind;
        slot.x = x;
        slot.y = y;
        slot.z = z;
        slot.born = nowMs;
        slot.until = nowMs + 900;
    }
    update(world, nowMs) {
        for (const p of this.pool) {
            if (p.until < nowMs) {
                p.el.style.display = "none";
                continue;
            }
            const k = (nowMs - p.born) / 900, s = world.project(p.x, p.y + k * 0.8, p.z);
            p.el.style.display = s.visible ? "block" : "none";
            p.el.style.transform = "translate(" + Math.round(s.x) + "px," + Math.round(s.y) + "px) translate(-50%,-50%)";
            p.el.style.opacity = String(1 - k * k);
        }
    }
}
class SnHud {
    constructor() {
        this.hp = SnDom.el("hudHpFill");
        this.hpText = SnDom.el("hudHpText");
        this.snow = SnDom.el("hudSnow");
        this.gear = SnDom.el("hudGear");
        this.storm = SnDom.el("hudStorm");
        this.teams = SnDom.el("hudTeams");
        this.kills = SnDom.el("hudKills");
        this.watchTag = SnDom.el("hudWatch");
        this.throwButton = SnDom.el("btnThrow");
        this.wallButton = SnDom.el("btnWall");
        this.frost = SnDom.el("frost");
    }
    showTop(engine) {
        const s = engine.stormNow();
        let text;
        if (s.phase === "prep")
            text = "❄ 눈보라 " + Math.ceil(s.phaseEnd - engine.time) + "초 뒤";
        else if (s.phase === "full")
            text = "❄ 눈보라가 섬을 덮었습니다";
        else
            text = "❄ " + s.stage + "단계 " + (s.phase === "shrink" ? "줄어드는 중 " : "대기 ") + Math.ceil(s.phaseEnd - engine.time) + "초";
        SnDom.text(this.storm, text);
        SnDom.text(this.teams, "남은 팀 " + engine.teams.filter((t) => !t.out).length);
    }
    showPlayer(engine, p, watching) {
        SnDom.show(SnDom.el("hudMine"), !!p);
        if (!p)
            return;
        const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));
        this.hp.style.width = (ratio * 100).toFixed(1) + "%";
        this.hp.classList.toggle("low", ratio < 0.3);
        SnDom.text(this.hpText, p.life === "down" || p.life === "out" ? "얼어붙음 ⛄" : "체온 " + Math.ceil(Math.max(0, p.hp)) + " / " + p.maxHp);
        SnDom.text(this.snow, "❄ " + engine.teams[p.team].snow + " / " + SnBalance.SNOW.cap);
        SnDom.html(this.gear, p.gear.map((g, k) => '<span class="slot' + (g < 0 ? " empty" : "") + '" style="' + (g < 0 ? "" : "border-color:" + SnBalance.GRADE_COLORS[g]) + '" title="' + SnHud.SLOT_NAMES[k] + '">' + SnHud.ICONS[k] + (g < 0 ? "" : "<b style=\"background:" + SnBalance.GRADE_COLORS[g] + '"></b>') + "</span>").join("") + (p.bigBall ? '<span class="slot big" title="대형 눈덩이">⚪</span>' : ""));
        SnDom.text(this.kills, "처치 " + p.kills);
        SnDom.show(this.watchTag, watching);
        if (watching)
            SnDom.text(this.watchTag, "관전 중: " + p.nick);
    }
    showButtons(engine, me, on) {
        SnDom.show(SnDom.el("controls"), on);
        if (!on || !me)
            return;
        const team = engine.teams[me.team];
        this.throwButton.classList.toggle("big", me.bigBall);
        SnDom.text(this.throwButton.querySelector("span"), me.bigBall ? "굴리기" : me.reviveTarget >= 0 ? "부활 " + Math.ceil(SnBalance.REVIVE.time - me.reviveProgress) + "초" : "던지기");
        const revive = me.reviveTarget >= 0 ? me.reviveProgress / SnBalance.REVIVE.time : 0;
        this.throwButton.style.setProperty("--revive", (revive * 360).toFixed(0) + "deg");
        this.throwButton.classList.toggle("reviving", revive > 0);
        this.throwButton.classList.toggle("dim", !me.bigBall && team.snow < SnBalance.SHOT.cost);
        this.wallButton.classList.toggle("dim", team.snow < SnBalance.WALL.cost || engine.time < me.nextWallAt);
    }
    showFrost(strength) {
        this.frost.style.opacity = strength.toFixed(2);
    }
}
SnHud.ICONS = ["🎩", "🧥", "👟"];
SnHud.SLOT_NAMES = ["모자", "한벌옷", "신발"];
class SnSpectatorPanel {
    constructor() {
        this.panel = SnDom.el("specPanel");
        this.overviewButton = SnDom.el("btnOverview");
        this.picked = null;
        this.panel.addEventListener("click", (e) => {
            const card = e.target.closest("[data-num]");
            if (card && this.picked)
                this.picked(Number(card.dataset.num));
        });
    }
    onPick(listener) { this.picked = listener; }
    onOverview(listener) { this.overviewButton.addEventListener("click", listener); }
    show(on) {
        SnDom.show(this.panel, on);
        SnDom.show(this.overviewButton, on);
    }
    render(engine, watched, overview) {
        this.overviewButton.classList.toggle("on", overview);
        SnDom.text(this.overviewButton.querySelector("span"), overview ? "선수 시점" : "전체 보기");
        const s = engine.stormNow();
        let html = '<div class="spTime"><b>' + SnTimeText.clock(engine.time) + "</b><small>" + (s.stage ? "눈보라 " + Math.min(6, s.stage) + "단계" : "준비") + " · 남은 팀 " + engine.teams.filter((t) => !t.out).length + "</small></div>";
        engine.teams.forEach((team) => {
            const color = SnPalette.teamColor(engine.mode, team.num);
            const alive = team.members.filter((m) => m.life === "alive" || m.life === "sky").length;
            if (engine.mode === "duos")
                html += '<div class="spHead" style="background:' + color + '">' + SnBalance.TEAM_NAMES_DUOS[team.num] + "팀 · 생존 " + alive + "/" + team.members.length + "<small>❄ " + team.snow + (team.out ? " · 탈락" : "") + "</small></div>";
            team.members.forEach((p) => {
                const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));
                const status = p.life === "sky" ? "낙하 중" : p.life === "down" ? (p.canBeRevived() ? "⛄ 부활 대기" : "⛄ 얼어붙음") : p.life === "out" ? "탈락" : "체온 " + Math.ceil(p.hp) + " / " + p.maxHp;
                const dots = p.gear.map((g) => '<i class="gd" style="background:' + (g < 0 ? "rgba(255,255,255,.18)" : SnBalance.GRADE_COLORS[g]) + '"></i>').join("");
                html += '<div class="spCard' + (p.life === "out" ? " dead" : p.life === "down" ? " down" : "") + (p.num === watched && !overview ? " watched" : "") + '" data-num="' + p.num + '" style="border-color:' + color + '">' +
                    '<div class="spName">' + (p.bot ? "🤖 " : "") + SnDom.esc(p.nick) + '<span class="spK">' + p.kills + "처치</span>" + (p.bigBall ? '<span class="spBig">⚪</span>' : "") + "</div>" +
                    '<div class="spBar hp' + (ratio < 0.3 ? " low" : "") + '"><i style="width:' + Math.round((p.life === "alive" || p.life === "sky" ? ratio : 0) * 100) + '%"></i><span>' + status + "</span></div>" +
                    '<div class="spGear">' + dots + "</div></div>";
            });
        });
        SnDom.html(this.panel, html);
    }
}
class SnBigMap {
    constructor(painter) {
        this.box = SnDom.el("bigMap");
        this.title = SnDom.el("bigMapTitle");
        this.picking = false;
        this.pickHandler = null;
        this.open = false;
        this.canvas = new SnMapCanvas(SnDom.el("bigMapCanvas"), painter);
        SnDom.el("bigMapClose").addEventListener("click", () => this.setOpen(false));
        SnDom.el("bigMapCanvas").addEventListener("pointerdown", (e) => {
            if (!this.picking || !this.pickHandler)
                return;
            const p = this.canvas.worldAt(e.clientX, e.clientY, 0, 0, SnGridMath.HALF * 2 + 8);
            this.pickHandler(p.x, p.z);
        });
    }
    setOpen(open) {
        this.open = open;
        SnDom.show(this.box, open);
    }
    setPicking(picking, title, handler) {
        this.picking = picking;
        this.pickHandler = handler;
        SnDom.text(this.title, title);
        SnDom.show(SnDom.el("bigMapClose"), !picking);
        this.box.classList.toggle("picking", picking);
    }
    draw(marks) {
        if (this.open)
            this.canvas.draw(0, 0, SnGridMath.HALF * 2 + 8, marks);
    }
}
class SnMiniMap {
    constructor(painter, onOpen) {
        const el = SnDom.el("miniMap");
        this.canvas = new SnMapCanvas(el, painter);
        el.addEventListener("click", onOpen);
    }
    draw(cx, cz, marks) { this.canvas.draw(cx, cz, SnMiniMap.SPAN, marks); }
}
SnMiniMap.SPAN = 84;
class SnResultBoard {
    constructor() {
        this.box = SnDom.el("resultBox");
    }
    show(engine, myNum) {
        const ranks = engine.ranks();
        const order = engine.teams.map((t, i) => ({ t, rank: ranks[i] })).sort((a, b) => a.rank - b.rank);
        let rows = "";
        for (const { t, rank } of order)
            for (const p of t.members) {
                rows += "<tr" + (p.num === myNum ? ' class="me"' : "") + "><td>" + rank + "위</td><td><i class=\"tc\" style=\"background:" + SnPalette.teamColor(engine.mode, t.num) + '"></i>' + (p.bot ? "🤖 " : "") + SnDom.esc(p.nick) + "</td><td>" + SnTimeText.clock(engine.survival(p)) + "</td><td>" + p.kills + "</td><td>" + p.dealt + "</td><td>" + p.collected + "</td></tr>";
            }
        const mine = myNum >= 0 ? ranks[engine.players[myNum].team] : 0;
        SnDom.text(SnDom.el("resultTitle"), myNum < 0 ? "경기 끝" : mine === 1 ? "우승! 🏆" : mine + "위");
        SnDom.html(SnDom.el("resultRows"), rows);
        SnDom.show(this.box, true);
    }
    hide() { SnDom.show(this.box, false); }
}
