"use strict";
class RdRoomRules {
}
RdRoomRules.RULES = { root: RdRules.ROOT, seatCount: RdRules.SEATS, spectatorSlot: RdRules.SPECTATOR_SLOT };
RdRoomRules.VALUES = ["match", "snap", "flow", "party", "offer", "ev", "end", "wr", "wrname", "pick"];
RdRoomRules.RECORD_ASK_SECONDS = 30;
RdRoomRules.EVENT_HISTORY = 3;
class RdDebugOptions {
    static speed() {
        const match = /[?&]speed=(\d+)/.exec(location.search);
        return match ? RdMath.clamp(Number(match[1]), 1, 8) : 1;
    }
}
class RdTimeText {
    static clock(seconds) {
        const total = Math.max(0, seconds);
        const minutes = Math.floor(total / 60);
        const rest = total - minutes * 60;
        return minutes + ":" + (rest < 10 ? "0" : "") + rest.toFixed(1);
    }
    static short(seconds) {
        const total = Math.max(0, Math.floor(seconds));
        return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
    }
}
class RdNetMeter {
    constructor(enabled) {
        this.up = 0;
        this.down = 0;
        this.windowStart = performance.now();
        this.element = enabled ? document.createElement("div") : null;
        if (this.element) {
            this.element.className = "rd-net";
            document.body.appendChild(this.element);
        }
    }
    sent(text) {
        this.up += text.length;
    }
    received(value) {
        if (typeof value === "string")
            this.down += value.length;
        else if (value !== null && value !== undefined)
            this.down += JSON.stringify(value).length;
    }
    tick() {
        if (!this.element)
            return;
        const now = performance.now();
        const seconds = (now - this.windowStart) / 1000;
        if (seconds < 1)
            return;
        this.element.textContent = "↑ " + (this.up / seconds / 1024).toFixed(2) + " KB/s  ↓ " + (this.down / seconds / 1024).toFixed(2) + " KB/s";
        this.up = this.down = 0;
        this.windowStart = now;
    }
}
class RdClock {
    constructor() {
        this.offset = 0;
        this.synced = false;
    }
    local() {
        return performance.now() / 1000;
    }
    observe(engineTime) {
        const sample = engineTime - this.local();
        if (!this.synced || Math.abs(sample - this.offset) > 1.5) {
            this.offset = sample;
            this.synced = true;
            return;
        }
        if (sample > this.offset)
            this.offset += (sample - this.offset) * 0.5;
        else
            this.offset += (sample - this.offset) * 0.05;
    }
    now() {
        return this.local() + this.offset;
    }
}
class RdInputController {
    constructor(canvas, zone, base, knob) {
        this.canvas = canvas;
        this.zone = zone;
        this.base = base;
        this.knob = knob;
        this.enabled = false;
        this.onSkill = () => undefined;
        this.held = new Set();
        this.attackKey = false;
        this.attackMouse = false;
        this.attackTouch = false;
        this.joystickPointer = null;
        this.joystickOriginX = 0;
        this.joystickOriginY = 0;
        this.joystickX = 0;
        this.joystickZ = 0;
        this.pointerX = 0;
        this.pointerY = 0;
        this.pointerAt = -1e9;
        this.bindKeyboard();
        this.bindMouse();
        this.bindJoystick();
    }
    axis() {
        if (!this.enabled)
            return { x: 0, z: 0 };
        let x = this.joystickX, z = this.joystickZ;
        if (this.held.has("KeyA") || this.held.has("ArrowLeft"))
            x -= 1;
        if (this.held.has("KeyD") || this.held.has("ArrowRight"))
            x += 1;
        if (this.held.has("KeyW") || this.held.has("ArrowUp"))
            z -= 1;
        if (this.held.has("KeyS") || this.held.has("ArrowDown"))
            z += 1;
        const length = Math.hypot(x, z);
        return length > 0.05 ? { x: x / Math.max(1, length), z: z / Math.max(1, length) } : { x: 0, z: 0 };
    }
    attacking() {
        return this.enabled && (this.attackKey || this.attackMouse || this.attackTouch);
    }
    pointer() {
        return this.pointerAt > 0 ? { x: this.pointerX, y: this.pointerY } : null;
    }
    setTouchAttack(down) {
        this.attackTouch = down;
    }
    releaseAll() {
        this.held.clear();
        this.attackKey = this.attackMouse = this.attackTouch = false;
        this.joystickPointer = null;
        this.joystickX = this.joystickZ = 0;
        this.base.hidden = true;
    }
    codeOf(event) {
        return event.key.indexOf("Arrow") === 0 ? event.key : event.code;
    }
    bindKeyboard() {
        const movement = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
        window.addEventListener("keydown", (event) => {
            const target = event.target;
            if (!this.enabled || target.tagName === "INPUT")
                return;
            const code = this.codeOf(event);
            if (movement.indexOf(code) >= 0) {
                this.held.add(code);
                event.preventDefault();
                return;
            }
            if (code === "KeyJ") {
                this.attackKey = true;
                event.preventDefault();
                return;
            }
            const skill = RdInputController.SKILL_CODES.indexOf(code);
            if (skill >= 0 && !event.repeat) {
                this.onSkill(skill);
                event.preventDefault();
            }
        });
        window.addEventListener("keyup", (event) => {
            const code = this.codeOf(event);
            this.held.delete(code);
            if (code === "KeyJ")
                this.attackKey = false;
        });
        window.addEventListener("blur", () => this.releaseAll());
    }
    bindMouse() {
        this.canvas.addEventListener("pointermove", (event) => {
            if (event.pointerType !== "mouse")
                return;
            this.pointerX = event.clientX;
            this.pointerY = event.clientY;
            this.pointerAt = performance.now();
        });
        this.canvas.addEventListener("pointerdown", (event) => {
            if (event.pointerType !== "mouse" || event.button !== 0)
                return;
            this.pointerX = event.clientX;
            this.pointerY = event.clientY;
            this.pointerAt = performance.now();
            this.attackMouse = true;
        });
        window.addEventListener("pointerup", (event) => { if (event.pointerType === "mouse")
            this.attackMouse = false; });
        this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    }
    bindJoystick() {
        this.zone.addEventListener("pointerdown", (event) => {
            if (this.joystickPointer !== null)
                return;
            this.joystickPointer = event.pointerId;
            this.joystickOriginX = event.clientX;
            this.joystickOriginY = event.clientY;
            this.base.style.left = event.clientX + "px";
            this.base.style.top = event.clientY + "px";
            this.base.hidden = false;
            this.knob.style.transform = "translate(0px,0px)";
            this.zone.setPointerCapture(event.pointerId);
        });
        this.zone.addEventListener("pointermove", (event) => {
            if (event.pointerId !== this.joystickPointer)
                return;
            const dx = event.clientX - this.joystickOriginX, dy = event.clientY - this.joystickOriginY;
            const length = Math.hypot(dx, dy) || 1;
            const reach = Math.min(length, RdInputController.JOYSTICK_RADIUS);
            this.knob.style.transform = "translate(" + (dx / length) * reach + "px," + (dy / length) * reach + "px)";
            if (length / RdInputController.JOYSTICK_RADIUS < RdInputController.DEAD_ZONE)
                this.joystickX = this.joystickZ = 0;
            else {
                this.joystickX = dx / length;
                this.joystickZ = dy / length;
            }
        });
        const end = (event) => {
            if (event.pointerId !== this.joystickPointer)
                return;
            this.joystickPointer = null;
            this.joystickX = this.joystickZ = 0;
            this.base.hidden = true;
        };
        this.zone.addEventListener("pointerup", end);
        this.zone.addEventListener("pointercancel", end);
    }
}
RdInputController.JOYSTICK_RADIUS = 55;
RdInputController.DEAD_ZONE = 0.25;
RdInputController.SKILL_CODES = ["KeyK", "KeyL", "Semicolon"];
class RdLocalPilot {
    constructor(input) {
        this.input = input;
        this.external = false;
        this.bot = false;
        this.skillSeq = [0, 0, 0];
        this.aim = { x: 0, z: 0 };
    }
    press(index) {
        this.skillSeq[index]++;
    }
    intent() {
        const axis = this.input.axis();
        return { moveX: axis.x, moveZ: axis.z, aimX: this.aim.x, aimZ: this.aim.z, attack: this.input.attacking(), focus: -1, skills: this.skillSeq.slice() };
    }
}
class RdFloorBanner {
    constructor() {
        this.ledger = new RdBannerLedger();
        this.box = RkDom.byId("floorBanner");
        this.title = RkDom.byId("bannerTitle");
        this.sub = RkDom.byId("bannerSub");
        this.record = RkDom.byId("bannerRecord");
        this.hideTimer = 0;
        this.fadeTimer = 0;
    }
    showStart(floor, match) {
        if (!this.ledger.accept("start", floor, match))
            return;
        const lines = RdBannerLedger.lines("start", floor);
        this.present(lines.title, lines.sub, "", false, RdFloorBanner.START_HOLD + RdFloorBanner.START_IN);
    }
    showClear(floor, match, recordSeconds) {
        if (!this.ledger.accept("clear", floor, match))
            return;
        const lines = RdBannerLedger.lines("clear", floor);
        if (lines.title === "")
            return;
        const final = floor === RdFloorPlan.LAST_FLOOR;
        this.present(lines.title, lines.sub, final ? "기록 " + RdTimeText.clock(recordSeconds) : "", true, final ? RdFloorBanner.FINAL_HOLD : RdFloorBanner.CLEAR_HOLD);
    }
    hide() {
        window.clearTimeout(this.hideTimer);
        window.clearTimeout(this.fadeTimer);
        this.box.hidden = true;
        this.box.classList.remove("on");
    }
    present(title, sub, record, clear, holdMs) {
        window.clearTimeout(this.hideTimer);
        window.clearTimeout(this.fadeTimer);
        RkDom.setText(this.title, title);
        RkDom.show(this.title, title !== "");
        this.sub.innerHTML = sub.split("\n").map((line) => RkDom.escape(line)).join("<br>");
        RkDom.setText(this.record, record);
        RkDom.show(this.record, record !== "");
        this.box.classList.toggle("clear", clear);
        this.box.hidden = false;
        this.box.classList.remove("on");
        void this.box.offsetWidth;
        this.box.classList.add("on");
        this.fadeTimer = window.setTimeout(() => this.box.classList.remove("on"), holdMs);
        this.hideTimer = window.setTimeout(() => { this.box.hidden = true; }, holdMs + RdFloorBanner.START_OUT);
    }
}
RdFloorBanner.START_IN = 400;
RdFloorBanner.START_HOLD = 2000;
RdFloorBanner.START_OUT = 500;
RdFloorBanner.CLEAR_HOLD = 2500;
RdFloorBanner.FINAL_HOLD = 3800;
class RdMinimapView {
    constructor(canvas) {
        this.canvas = canvas;
        canvas.width = RdMinimapView.WIDTH;
        canvas.height = RdMinimapView.HEIGHT;
        this.context = canvas.getContext("2d");
        const spanX = RdMapData.VAULT.maxX - RdMapData.HALL.minX, spanZ = RdMapData.HALL.maxZ - RdMapData.HALL.minZ;
        this.scale = Math.min((RdMinimapView.WIDTH - 8) / spanX, (RdMinimapView.HEIGHT - 8) / spanZ);
        this.offsetX = 4 - RdMapData.HALL.minX * this.scale;
        this.offsetY = 4 - RdMapData.HALL.minZ * this.scale;
    }
    rect(rect, fill, stroke) {
        const c = this.context;
        c.fillStyle = fill;
        c.strokeStyle = stroke;
        c.lineWidth = 1.5;
        c.fillRect(this.offsetX + rect.minX * this.scale, this.offsetY + rect.minZ * this.scale, (rect.maxX - rect.minX) * this.scale, (rect.maxZ - rect.minZ) * this.scale);
        c.strokeRect(this.offsetX + rect.minX * this.scale, this.offsetY + rect.minZ * this.scale, (rect.maxX - rect.minX) * this.scale, (rect.maxZ - rect.minZ) * this.scale);
    }
    dot(x, z, radius, color) {
        const c = this.context;
        c.fillStyle = color;
        c.beginPath();
        c.arc(this.offsetX + x * this.scale, this.offsetY + z * this.scale, radius, 0, Math.PI * 2);
        c.fill();
    }
    draw(state, poses, mySlot) {
        const c = this.context;
        c.clearRect(0, 0, RdMinimapView.WIDTH, RdMinimapView.HEIGHT);
        this.rect(RdMapData.HALL, "rgba(60,48,78,.55)", "rgba(255,255,255,.35)");
        this.rect(RdMapData.VAULT, state.flow.vault ? "rgba(242,193,78,.35)" : "rgba(40,34,52,.6)", state.flow.vault ? "#F2C14E" : "rgba(255,255,255,.2)");
        if (state.flow.zone)
            this.dot(state.flow.zone.x, state.flow.zone.z, state.flow.zone.r * this.scale, "rgba(76,227,138,.45)");
        if (state.flow.mech)
            state.flow.mech.zones.forEach((zone) => this.dot(zone[0], zone[1], 4, zone[2] === 1 ? "#4C9BFF" : zone[2] === 0 ? "#FFD23F" : "#FF4040"));
        state.snap.foes.forEach((foe) => {
            if (foe.flags & RdFoeFlags.HIDDEN)
                return;
            const boss = foe.kind === "giant" || foe.kind === "archmage" || foe.kind === "lord";
            const color = foe.kind === "chest" ? "#F2C14E" : foe.kind === "pillar" ? "#B07CFF" : foe.kind === "dummy" ? "#A0A0A0" : "#FF5A4A";
            this.dot(foe.x, foe.z, boss ? 5 : 2.2, color);
        });
        state.snap.heroes.forEach((hero) => {
            if (hero.flags & RdHeroFlags.DOWN)
                return;
            const pose = poses(hero.slot);
            this.dot(pose.x, pose.z, hero.slot === mySlot ? 4 : 3, RdBalance.heroSpec(hero.slot).color);
            if (hero.slot === mySlot) {
                c.strokeStyle = "#FFFFFF";
                c.lineWidth = 1.5;
                c.beginPath();
                c.arc(this.offsetX + pose.x * this.scale, this.offsetY + pose.z * this.scale, 5.5, 0, Math.PI * 2);
                c.stroke();
            }
        });
    }
}
RdMinimapView.WIDTH = 168;
RdMinimapView.HEIGHT = 112;
class RdHud {
    constructor(input, touchDevice) {
        this.input = input;
        this.touchDevice = touchDevice;
        this.team = RkDom.byId("hudTeam");
        this.floorLine = RkDom.byId("hudFloor");
        this.timeLine = RkDom.byId("hudTime");
        this.waveLine = RkDom.byId("hudWave");
        this.bossBox = RkDom.byId("hudBoss");
        this.bossName = RkDom.byId("hudBossName");
        this.bossFill = RkDom.byId("hudBossFill");
        this.bossTag = RkDom.byId("hudBossTag");
        this.mechLine = RkDom.byId("hudMech");
        this.countdown = RkDom.byId("hudCount");
        this.hint = RkDom.byId("hudHint");
        this.selfBox = RkDom.byId("hudSelf");
        this.selfFill = RkDom.byId("hudSelfFill");
        this.selfText = RkDom.byId("hudSelfText");
        this.skillBar = RkDom.byId("hudSkills");
        this.gearPanel = new RdGearPanel(RkDom.byId("hudGear"));
        this.statPanel = new RdStatPanel(RkDom.byId("hudStats"));
        this.downCover = RkDom.byId("downCover");
        this.touchSkills = RkDom.byId("touchSkills");
        this.attackButton = RkDom.byId("btnAttack");
        this.minimap = new RdMinimapView(RkDom.byId("minimap"));
        this.teamRows = [];
        this.skillCells = [];
        this.touchCells = [];
        this.builtFor = -2;
        this.attackButton.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
        this.attackButton.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            this.attackButton.setPointerCapture(event.pointerId);
            this.input.setTouchAttack(true);
        });
        const release = () => this.input.setTouchAttack(false);
        this.attackButton.addEventListener("pointerup", release);
        this.attackButton.addEventListener("pointercancel", release);
    }
    build(roster, mySlot) {
        this.team.innerHTML = roster.slice().sort((a, b) => a.slot - b.slot).map((entry) => {
            const spec = RdBalance.heroSpec(entry.slot);
            return "<div class='rd-row" + (entry.slot === mySlot ? " me" : "") + "' data-slot='" + entry.slot + "'><i style='background:" + spec.color + "'>" + spec.icon + "</i><span>" + RkDom.escape(entry.nick) + (entry.isBot ? " <small>AI</small>" : "") + "</span><b><em></em></b></div>";
        }).join("");
        this.teamRows = Array.prototype.slice.call(this.team.querySelectorAll(".rd-row"));
        this.builtFor = mySlot;
        const spec = mySlot >= 0 ? RdBalance.heroSpec(mySlot) : null;
        const keys = ["K", "L", ";"];
        this.skillBar.innerHTML = spec ? spec.skills.map((key, index) => "<div class='rd-skill'><kbd>" + keys[index] + "</kbd><span>" + RdBalance.SKILLS[key].name + "</span><b></b></div>").join("") : "";
        this.skillCells = Array.prototype.slice.call(this.skillBar.querySelectorAll(".rd-skill"));
        this.touchSkills.innerHTML = spec ? spec.skills.map((key, index) => "<button type='button' class='rd-tskill' data-skill='" + index + "' style='--slot:" + index + "'>" + RdBalance.SKILLS[key].name + "<b></b></button>").join("") : "";
        this.touchCells = Array.prototype.slice.call(this.touchSkills.querySelectorAll("button"));
        this.touchCells.forEach((button) => {
            button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
            button.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                this.input.onSkill(Number(button.dataset.skill));
            });
        });
        RkDom.show(this.selfBox, mySlot >= 0);
        RkDom.show(this.skillBar, mySlot >= 0 && !this.touchDevice);
        RkDom.show(this.touchSkills, mySlot >= 0 && this.touchDevice);
        RkDom.show(this.attackButton, mySlot >= 0 && this.touchDevice);
        this.gearPanel.reset(mySlot >= 0);
        this.statPanel.reset(mySlot >= 0);
    }
    get builtSlot() {
        return this.builtFor;
    }
    update(model) {
        const { state, time, mySlot } = model;
        const flow = state.flow;
        const floorSpec = RdFloorPlan.spec(flow.floor);
        RkDom.setText(this.floorLine, flow.stage === "reward" ? flow.floor + "층 보상방" : floorSpec.startTitle);
        const record = RdRecordClock.ofFlow(flow, time);
        RkDom.setText(this.timeLine, "이 층 " + RdTimeText.short(time - flow.fs) + " · 기록 " + RdTimeText.short(record));
        let wave = "";
        if (flow.stage === "wave")
            wave = "웨이브 " + flow.wave + "/" + flow.waves + " · 남은 적 " + flow.left;
        else if (flow.stage === "boss" && flow.left > 1)
            wave = "소환된 적 " + (flow.left - 1);
        else if (flow.stage === "reward")
            wave = flow.picking > 0 ? "선택 중 " + flow.picking + "/" + state.snap.heroes.filter((hero) => !(hero.flags & RdHeroFlags.GONE)).length : "준비 구역으로 모이세요";
        else if (flow.stage === "ready")
            wave = "준비 구역 " + flow.inZone.length + "/" + state.snap.heroes.filter((hero) => !(hero.flags & (RdHeroFlags.GONE | RdHeroFlags.DOWN))).length;
        RkDom.setText(this.waveLine, wave);
        RkDom.show(this.waveLine, wave !== "");
        this.updateBoss(state);
        this.updateTeam(state);
        this.updateSelf(model);
        this.updateMechanic(state, time);
        RkDom.setText(this.hint, flow.hint);
        RkDom.show(this.hint, flow.hint !== "");
        const me = mySlot >= 0 ? state.snap.heroes[mySlot] : null;
        const down = !!me && (me.flags & RdHeroFlags.DOWN) !== 0;
        RkDom.show(this.downCover, down && flow.out === "running");
        this.minimap.draw(state, model.poses, mySlot);
    }
    updateBoss(state) {
        const boss = state.flow.boss;
        const shot = boss ? state.snap.foes.filter((foe) => foe.id === boss.id)[0] : undefined;
        RkDom.show(this.bossBox, !!boss && !!shot);
        if (!boss || !shot)
            return;
        const percent = (shot.hp / 10).toFixed(1) + "%";
        RkDom.setText(this.bossName, boss.name + " " + percent);
        this.bossFill.style.width = percent;
        const invulnerable = (shot.flags & RdFoeFlags.INVULNERABLE) !== 0;
        const vulnerable = (shot.flags & RdFoeFlags.VULNERABLE) !== 0;
        const stunned = (shot.flags & RdFoeFlags.STUNNED) !== 0;
        const tag = invulnerable ? "무적" : vulnerable ? "받는 피해 증가" : stunned ? "기절" : "";
        RkDom.setText(this.bossTag, tag);
        RkDom.show(this.bossTag, tag !== "");
        this.bossBox.classList.toggle("invuln", invulnerable);
    }
    updateTeam(state) {
        this.teamRows.forEach((row) => {
            const slot = Number(row.dataset.slot);
            const shot = state.snap.heroes[slot];
            if (!shot)
                return;
            const bar = row.querySelector("em");
            bar.style.width = (shot.max > 0 ? (shot.hp / shot.max) * 100 : 0).toFixed(1) + "%";
            row.classList.toggle("down", (shot.flags & RdHeroFlags.DOWN) !== 0);
            row.classList.toggle("gone", (shot.flags & RdHeroFlags.GONE) !== 0);
        });
    }
    updateSelf(model) {
        const { state, mySlot } = model;
        if (mySlot < 0)
            return;
        const shot = state.snap.heroes[mySlot];
        if (!shot)
            return;
        this.selfFill.style.width = (shot.max > 0 ? (shot.hp / shot.max) * 100 : 0).toFixed(1) + "%";
        RkDom.setText(this.selfText, shot.hp + " / " + shot.max);
        const party = state.party[mySlot];
        model.cooldowns.forEach((left, index) => {
            const max = party ? party.cdMax[index] || 1 : 1;
            const ratio = RdMath.clamp(left / max, 0, 1);
            const text = left > 0.05 ? left.toFixed(1) : "";
            [this.skillCells[index], this.touchCells[index]].forEach((cell) => {
                if (!cell)
                    return;
                cell.classList.toggle("cool", left > 0.05);
                cell.style.setProperty("--cd", String(ratio));
                RkDom.setText(cell.querySelector("b"), text);
            });
        });
        if (party) {
            this.gearPanel.render(party.gear);
            this.statPanel.render(party, RdBalance.heroSpec(mySlot));
        }
    }
    updateMechanic(state, time) {
        const flow = state.flow;
        const mech = flow.mech;
        let line = "", count = "";
        if (mech) {
            line = mech.text;
            if (mech.kind === "zones")
                count = String(Math.max(0, Math.ceil(mech.end - time)));
            else {
                const left = Math.max(0, mech.end - time);
                line += "  (남은 시간 " + Math.ceil(left) + "초" + (mech.window >= 0 ? " · 8초 안에 " + Math.max(0, mech.window - time).toFixed(1) + "초 남음" : "") + ")";
            }
        }
        else if (flow.readyEnd >= 0) {
            count = String(Math.max(1, Math.ceil(flow.readyEnd - time)));
        }
        RkDom.setText(this.mechLine, line);
        RkDom.show(this.mechLine, line !== "");
        RkDom.setText(this.countdown, count);
        RkDom.show(this.countdown, count !== "");
    }
}
class RdGearIcons {
}
RdGearIcons.ICONS = { weapon: "⚔", armor: "◆", boots: "▲" };
class RdGearPanel {
    constructor(box) {
        this.box = box;
        this.shown = "";
    }
    reset(visible) {
        this.shown = "";
        RkDom.show(this.box, visible);
    }
    render(gear) {
        const key = gear.join(",");
        if (key === this.shown)
            return;
        this.shown = key;
        this.box.innerHTML = RdBalance.GEAR_SLOTS.map((slot, index) => {
            const tier = gear[index];
            const color = tier >= 0 ? RdBalance.TIER_COLORS[tier] : "rgba(255,255,255,.18)";
            return "<span class='rd-gear' style='--tier:" + color + "' title='" + RdBalance.GEAR_NAMES[slot] + "'>" + RdGearIcons.ICONS[slot] + "<small>" + (tier >= 0 ? RdBalance.TIER_NAMES[tier] : "없음") + "</small></span>";
        }).join("");
    }
}
class RdStatPanel {
    constructor(box) {
        this.box = box;
        this.shown = "";
    }
    reset(visible) {
        this.shown = "";
        RkDom.show(this.box, visible);
    }
    static bonus(ratio) {
        const percent = Math.round((ratio - 1) * 100);
        return percent > 0 ? "<small>+" + percent + "%</small>" : "";
    }
    render(party, spec) {
        const baseCooldown = RdBalance.SKILLS[spec.skills[0]].cooldown;
        const cooldown = party.cdMax[0] || baseCooldown;
        const rows = [
            ["공격력", String(Math.round(party.atk)), RdStatPanel.bonus(party.atk / spec.attack)],
            ["공격 속도", (1 / Math.max(0.05, party.gap)).toFixed(2) + "/초", RdStatPanel.bonus(spec.interval / Math.max(0.05, party.gap))],
            ["이동 속도", (party.spd / RdUnits.PER_METER).toFixed(1) + "m/s", RdStatPanel.bonus(party.spd / spec.speed)],
            ["스킬 쿨타임", cooldown.toFixed(1) + "초", baseCooldown - cooldown > 0.05 ? "<small>-" + (baseCooldown - cooldown).toFixed(1) + "초</small>" : ""]
        ];
        const key = rows.map((row) => row.join("|")).join(";");
        if (key === this.shown)
            return;
        this.shown = key;
        this.box.innerHTML = rows.map((row) => "<div class='rd-stat'><span>" + row[0] + "</span><b>" + row[1] + row[2] + "</b></div>").join("");
    }
}
class RdRewardView {
    constructor() {
        this.box = RkDom.byId("rewardBox");
        this.title = RkDom.byId("rewardTitle");
        this.timer = RkDom.byId("rewardTimer");
        this.cards = RkDom.byId("rewardCards");
        this.skip = RkDom.byId("rewardSkip");
        this.others = RkDom.byId("rewardOthers");
        this.shownKey = "";
        this.pending = "";
        this.onPick = () => undefined;
        this.cards.addEventListener("click", (event) => {
            const card = event.target.closest("button[data-index]");
            if (!card || card.disabled)
                return;
            this.choose(Number(card.dataset.index));
        });
        this.skip.addEventListener("click", () => this.choose(-1));
    }
    choose(index) {
        const [phase, floor] = this.shownKey.split(":");
        if (!phase || this.pending === this.shownKey)
            return;
        this.pending = this.shownKey;
        this.box.classList.add("sent");
        this.onPick(phase, index, Number(floor));
    }
    update(offer, gear, time, picking, total) {
        if (!offer) {
            this.box.hidden = true;
            this.shownKey = "";
            return;
        }
        const key = offer.phase + ":" + offer.floor;
        this.box.hidden = false;
        RkDom.setText(this.timer, Math.max(0, Math.ceil(offer.deadline - time)) + "초");
        RkDom.setText(this.others, "선택 중 " + picking + "/" + total);
        if (key === this.shownKey)
            return;
        this.shownKey = key;
        this.box.classList.remove("sent");
        if (offer.phase === "stat") {
            RkDom.setText(this.title, "능력치 카드를 고르세요");
            this.cards.innerHTML = offer.stats.map((stat, index) => {
                const spec = RdBalance.statCard(stat);
                return "<button type='button' class='rd-card stat' data-index='" + index + "'><span class='rd-card-icon'>" + RdRewardIcons.STAT[stat] + "</span><b>" + spec.name + "</b><em>" + RdRewardRules.statText(stat, offer.tier) + "</em></button>";
            }).join("");
            this.skip.hidden = true;
            return;
        }
        RkDom.setText(this.title, "장비 카드를 고르세요");
        this.cards.innerHTML = offer.gear.map((card, index) => {
            const blocked = RdRewardRules.blockedReason(gear, card);
            const color = RdBalance.TIER_COLORS[card.tier];
            return "<button type='button' class='rd-card gear' data-index='" + index + "' style='--tier:" + color + "'" + (blocked ? " disabled" : "") + "><span class='rd-card-icon'>" + RdGearIcons.ICONS[card.slot] + "</span><small>" + RdBalance.TIER_NAMES[card.tier] + " " + RdBalance.GEAR_NAMES[card.slot] + "</small><em>" + RkDom.escape(RdRewardRules.gearChangeText(gear, card)) + "</em>" + (blocked ? "<i>" + RkDom.escape(blocked) + "</i>" : "") + "</button>";
        }).join("");
        this.skip.hidden = false;
    }
}
class RdRewardIcons {
}
RdRewardIcons.STAT = { atk: "⚔", hp: "♥", aspd: "»", move: "➤", cdr: "◷" };
class RdScreens {
    constructor(touchDevice) {
        this.touchDevice = touchDevice;
        this.start = RkDom.byId("startScreen");
        this.lobby = RkDom.byId("lobbyScreen");
        this.end = RkDom.byId("endScreen");
        this.gameUi = RkDom.byId("gameUi");
        this.joystickZone = RkDom.byId("joyZone");
        this.current = "start";
    }
    show(name, canControl = true) {
        this.current = name;
        RkDom.show(this.start, name === "start");
        RkDom.show(this.lobby, name === "lobby");
        RkDom.show(this.end, name === "end");
        RkDom.show(this.gameUi, name === "game");
        RkDom.show(this.joystickZone, name === "game" && this.touchDevice && canControl);
        document.body.classList.toggle("in-game", name === "game");
    }
}
class RdJobDetailPanel {
    constructor(box) {
        this.box = box;
    }
    render(slot) {
        if (slot < 0) {
            this.box.innerHTML = "<h3>직업 능력치</h3><p class='empty'>직업 카드를 누르면 능력치가 여기에 보여요.</p>";
            return;
        }
        const spec = RdBalance.heroSpec(slot);
        const rows = [
            ["체력", String(spec.hp)],
            ["공격력", String(spec.attack)],
            ["공격 속도", (1 / spec.interval).toFixed(2) + "회/초"],
            ["사거리", spec.range / 100 + "m"],
            ["이동 속도", spec.speed / 100 + "m/초"]
        ];
        const skills = spec.skills.map((key) => {
            const skill = RdBalance.SKILLS[key];
            return "<div class='skill'><b>" + skill.name + " <small>쿨타임 " + skill.cooldown + "초</small></b><p>" + skill.summary + "</p>" +
                RdJobDetailPanel.SKILL_DETAILS[key].map((line) => "<p>" + line + "</p>").join("") + "</div>";
        }).join("");
        this.box.style.setProperty("--job", spec.color);
        this.box.innerHTML = "<h3>" + spec.name + " <small>" + spec.role + "</small></h3>" +
            "<table>" + rows.map((row) => "<tr><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>").join("") + "</table>" + skills;
    }
}
RdJobDetailPanel.SKILL_DETAILS = {
    taunt: ["범위 " + RdBalance.TAUNT.radius / 100 + "m 안의 적이 나를 공격", "일반 적 " + RdBalance.TAUNT.mobSeconds + "초 · 보스 " + RdBalance.TAUNT.bossSeconds + "초"],
    charge: ["앞으로 " + RdBalance.CHARGE.distance / 100 + "m 돌진 · 공격력 " + RdBalance.CHARGE.factor + "배", "맞은 적 " + RdBalance.CHARGE.stunSeconds + "초 기절"],
    fireball: ["사거리 " + RdBalance.FIREBALL.range / 100 + "m · 폭발 반경 " + RdBalance.FIREBALL.radius / 100 + "m", "공격력 " + RdBalance.FIREBALL.factor + "배 · 적이 가장 몰린 곳"],
    dash: [RdBalance.DASH.distance / 100 + "m 대쉬 · 무적 " + RdBalance.DASH.invulnerableSeconds + "초", "다음 화살 " + RdBalance.DASH.factor + "배 (" + RdBalance.DASH.empowerSeconds + "초 안)"],
    heal: ["사거리 " + RdBalance.HEAL.range / 100 + "m · 가장 다친 동료", "최대 체력의 " + Math.round(RdBalance.HEAL.ratio * 100) + "% 회복"]
};
class RdLobbyView {
    constructor() {
        this.detail = new RdJobDetailPanel(RkDom.byId("jobDetail"));
        this.inspected = -1;
        this.code = RkDom.byId("lobbyCode");
        this.seatBoard = RkDom.byId("jobBoard");
        this.spectatorLine = RkDom.byId("spectatorLine");
        this.startButton = RkDom.byId("btnStart");
        this.modeButton = RkDom.byId("btnSeatMode");
        this.hint = RkDom.byId("lobbyHint");
        this.seatPlan = new RkSeatPlan(RdRoomRules.RULES);
        this.onSeatClick = () => undefined;
        this.seatBoard.addEventListener("click", (event) => {
            const seat = event.target.closest("[data-slot]");
            if (!seat)
                return;
            this.inspected = Number(seat.dataset.slot);
            this.detail.render(this.inspected);
            this.onSeatClick(this.inspected);
        });
        this.detail.render(-1);
    }
    render(session) {
        const seats = this.seatPlan.humanSeats(session.players);
        RkDom.setText(this.code, session.code);
        this.seatBoard.innerHTML = RdBalance.HEROES.map((spec, slot) => {
            const id = seats[slot];
            const record = id ? session.players.get(id) : undefined;
            const mine = id === session.myId;
            const skill = RdBalance.SKILLS[spec.skills[0]];
            const who = record ? RkDom.escape(record.nick) + (id === session.hostId ? " · 방장" : "") + (mine ? " · 나" : "") : "비어 있음 (AI가 맡아요)";
            return "<button type='button' class='rd-job" + (mine ? " me" : "") + (record ? "" : " empty") + "' data-slot='" + slot + "' style='--job:" + spec.color + "'>" +
                "<i>" + spec.icon + "</i><div><b>" + spec.name + "</b><small>" + spec.role + "</small><small class='skill'>스킬 " + skill.name + " · " + skill.summary + " (" + skill.cooldown + "초)</small><span>" + who + "</span></div></button>";
        }).join("");
        const spectators = this.seatPlan.spectators(session.players).map((id) => session.players.get(id).nick + (id === session.myId ? " (나)" : ""));
        RkDom.setText(this.spectatorLine, spectators.length ? "관전: " + spectators.join(", ") : "");
        const humans = seats.filter((id) => !!id).length;
        RkDom.show(this.startButton, session.isHost());
        const spectating = session.isSpectator();
        this.modeButton.textContent = spectating ? "직업 고르기로 돌아가기" : "관전자로 바꾸기";
        this.modeButton.disabled = spectating ? this.seatPlan.freeSeat(session.players) < 0 : this.seatPlan.spectators(session.players).length > 0;
        RkDom.setText(this.hint, session.isHost()
            ? "사람 " + humans + "명 · 빈 직업 " + (RdRules.SEATS - humans) + "개는 AI가 맡아요. 직업 카드를 눌러 바꿀 수 있어요."
            : "방장이 시작하길 기다리는 중이에요… 빈 직업 카드를 누르면 그 직업으로 바꿔요.");
    }
}
class RdResultView {
    constructor() {
        this.title = RkDom.byId("endTitle");
        this.reason = RkDom.byId("endReason");
        this.times = RkDom.byId("endTimes");
        this.rows = RkDom.byId("endRows");
        this.note = RkDom.byId("endNote");
    }
    render(end, roster, mySlot, recordText) {
        const cleared = end.out === "success";
        RkDom.setText(this.title, cleared ? "던전 클리어!" : "파티 전멸…");
        RkDom.setText(this.reason, cleared ? "기록 " + RdTimeText.clock(end.ms / 1000) : end.floor + "층에서 쓰러졌어요");
        this.times.innerHTML = end.times.filter((entry) => entry[0].indexOf("1층") !== 0 && entry[0].indexOf("보상방") < 0).map((entry) => "<tr><td>" + RkDom.escape(entry[0]) + "</td><td>" + RdTimeText.short(entry[1]) + "</td></tr>").join("");
        this.rows.innerHTML = end.party.map((shot) => {
            const entry = roster.filter((item) => item.slot === shot.slot)[0];
            const spec = RdBalance.heroSpec(shot.slot);
            const name = entry ? entry.nick + (entry.isBot ? " (AI)" : "") : "(나감)";
            return "<tr" + (shot.slot === mySlot ? " class='meRow'" : "") + "><td><span class='rankDot' style='background:" + spec.color + "'></span>" + RkDom.escape(name) + "</td><td>" + spec.name + "</td><td>" + shot.dmg + "</td><td>" + (shot.hurt || 0) + "</td><td>" + shot.heal + "</td><td>" + shot.downs + "</td></tr>";
        }).join("");
        const notes = [];
        if (!end.humans)
            notes.push("AI 가 포함된 판은 기록에 등록되지 않습니다");
        if (recordText)
            notes.push(recordText);
        this.note.innerHTML = notes.map((line) => RkDom.escape(line)).join("<br>");
    }
}
class RdRecordBoard {
    constructor() {
        this.handle = null;
        if (!window.WorldRecord)
            return;
        this.handle = window.WorldRecord(RdRules.GAME, { lower: true, format: (ms) => RdTimeText.clock(ms / 1000) });
        this.handle.onChange(() => this.render());
        this.handle.load();
    }
    get record() {
        return this.handle;
    }
    render() {
        const handle = this.handle;
        const empty = "아직 기록이 없습니다";
        ["", "End"].forEach((suffix) => {
            const value = document.getElementById("wrValue" + suffix);
            if (!value)
                return;
            RkDom.setText(value, handle && handle.rec ? handle.text() : empty);
            RkDom.setText(RkDom.byId("wrWho" + suffix), handle && handle.rec ? handle.who() : "");
            const classBox = document.getElementById("clsBox" + suffix);
            if (!classBox)
                return;
            const slot = handle ? handle.cls : undefined;
            classBox.hidden = !slot;
            if (slot) {
                RkDom.setText(RkDom.byId("clsValue" + suffix), slot.rec ? slot.text() : empty);
                RkDom.setText(RkDom.byId("clsWho" + suffix), slot.rec ? slot.who() : "");
            }
        });
    }
}
class RdNetLink {
    constructor(session, meter) {
        this.session = session;
        this.meter = meter;
    }
    write(name, text) {
        this.meter.sent(text);
        this.session.writeValue(name, text);
    }
    writeState(text, id) {
        this.meter.sent(text);
        this.session.writeState(text, id);
    }
    writeChild(path, value) {
        this.meter.sent(JSON.stringify(value));
        this.session.ref.child(path).set(value);
    }
}
class RdHostDirector {
    constructor(pilots, link) {
        this.link = link;
        this.sent = new Map();
        this.pending = [];
        this.history = [];
        this.seq = 0;
        this.seenPicks = new Map();
        this.remote = new Map();
        this.speed = RdDebugOptions.speed();
        this.engine = new RdEngine(Math.random, pilots);
        pilots.forEach((pilot, slot) => { if (pilot instanceof RdRemotePilot)
            this.remote.set(slot, pilot); });
    }
    step(dt) {
        const events = [];
        for (let round = 0; round < this.speed; round++)
            this.engine.update(Math.min(RdHostDirector.MAX_STEP, dt)).forEach((event) => events.push(event));
        events.forEach((event) => this.pending.push(event));
        return events;
    }
    receiveState(slot, raw) {
        const pilot = this.remote.get(slot);
        const decoded = RdHeroStateCodec.decode(raw);
        if (!pilot || !decoded)
            return;
        pilot.current = decoded.intent;
        this.engine.placeExternal(slot, decoded.x, decoded.z, decoded.yaw, decoded.moving, decoded.transition);
    }
    receivePicks(picks, slotOf) {
        if (!picks)
            return;
        Object.keys(picks).forEach((id) => {
            const pick = picks[id];
            if (!pick || (this.seenPicks.get(id) || 0) >= pick.n)
                return;
            this.seenPicks.set(id, pick.n);
            const slot = slotOf(id);
            if (slot >= 0)
                this.engine.choose(slot, pick.k, pick.i, pick.f);
        });
    }
    publish(state) {
        this.writeIfChanged("snap", RdSnapshotCodec.encodeSnap(state.snap));
        this.writeIfChanged("flow", RdSnapshotCodec.encodeJson(state.flow));
        this.writeIfChanged("party", RdSnapshotCodec.encodeJson(state.party));
        this.writeIfChanged("offer", RdSnapshotCodec.encodeJson(state.offers));
        if (!this.pending.length)
            return;
        this.seq++;
        this.history.push([this.seq, this.pending.splice(0)]);
        while (this.history.length > RdRoomRules.EVENT_HISTORY)
            this.history.shift();
        const batch = { s: this.seq, b: this.history.slice() };
        this.link.write("ev", JSON.stringify(batch));
    }
    writeIfChanged(name, text) {
        if (this.sent.get(name) === text)
            return;
        this.sent.set(name, text);
        this.link.write(name, text);
    }
}
RdHostDirector.MAX_STEP = 0.1;
class RdMirror {
    constructor(clock) {
        this.clock = clock;
        this.state = null;
        this.lastSeq = 0;
        this.snapRaw = "";
    }
    applySnap(raw) {
        if (!raw || raw === this.snapRaw)
            return;
        this.snapRaw = raw;
        const snap = RdSnapshotCodec.decodeSnap(raw);
        if (!snap)
            return;
        this.clock.observe(snap.t);
        this.ensure().snap = snap;
    }
    applyFlow(raw) {
        const flow = RdSnapshotCodec.decodeJson(raw);
        if (flow)
            this.ensure().flow = flow;
    }
    applyParty(raw) {
        const party = RdSnapshotCodec.decodeJson(raw);
        if (party)
            this.ensure().party = party;
    }
    applyOffers(raw) {
        const offers = RdSnapshotCodec.decodeJson(raw);
        if (offers)
            this.ensure().offers = offers;
    }
    takeEvents(raw) {
        const batch = RdSnapshotCodec.decodeJson(raw);
        if (!batch || !batch.b)
            return [];
        const fresh = [];
        batch.b.forEach((entry) => {
            if (entry[0] <= this.lastSeq)
                return;
            this.lastSeq = entry[0];
            entry[1].forEach((event) => fresh.push(event));
        });
        return fresh;
    }
    ready() {
        return !!this.state && this.state.snap.heroes.length === RdRules.SEATS && !!this.state.flow.stage;
    }
    ensure() {
        if (!this.state) {
            this.state = {
                snap: { t: 0, heroes: [], foes: [], tele: [], areas: [] },
                flow: { n: 0, floor: 1, stage: "ready", phase: "intro", phaseAt: 0, wave: 0, waves: 0, left: 0, vault: false, zone: null, inZone: [], readyEnd: -1, rs: -1, re: -1, rp: 0, rq: -1, fs: 0, boss: null, mech: null, hint: "", out: "running", times: [], banner: null, picking: 0 },
                party: [], offers: []
            };
        }
        return this.state;
    }
}
class RdRemoteBodies {
    constructor() {
        this.poses = new Map();
    }
    receive(slot, raw) {
        const decoded = RdHeroStateCodec.decode(raw);
        if (!decoded)
            return;
        this.poses.set(slot, { x: decoded.x, z: decoded.z, yaw: decoded.yaw, moving: decoded.moving, dash: decoded.dash, at: performance.now() });
    }
    pose(slot) {
        return this.poses.get(slot) || null;
    }
}
class RdLocalBody {
    constructor(slot, pilot, clock) {
        this.slot = slot;
        this.pilot = pilot;
        this.clock = clock;
        this.world = new RdCollisionWorld();
        this.transition = -1;
        this.readyAt = [0, 0, 0];
        this.pressedAt = [-9, -9, -9];
        this.lastSentText = "";
        this.lastSentAt = 0;
        this.targets = [];
        this.dashAim = null;
        this.hero = new RdHero(slot, pilot);
    }
    cooldowns() {
        const now = this.clock.local();
        return this.hero.heroClass.skills.map((skill, index) => Math.max(0, this.readyAt[index] - now));
    }
    tryPress(index, party) {
        if (index >= this.hero.heroClass.skills.length || !this.hero.alive || this.hero.dash)
            return false;
        const now = this.clock.local();
        if (now < this.readyAt[index])
            return false;
        const intent = this.pilot.intent();
        intent.aimX = this.hero.intent.aimX;
        intent.aimZ = this.hero.intent.aimZ;
        const skill = this.hero.heroClass.skills[index];
        this.pilot.press(index);
        this.pressedAt[index] = now;
        this.readyAt[index] = now + (party ? party.cdMax[index] || skill.spec.cooldown : skill.spec.cooldown);
        const dash = skill.motion(this.hero, intent, this.targets);
        this.hero.dash = dash;
        this.dashAim = dash && dash.kind === "charge" ? { x: dash.dirX, z: dash.dirZ } : null;
        return true;
    }
    knock(dir, distance) {
        if (!this.hero.alive)
            return;
        this.hero.dash = RdKnockback.dash({ x: Math.sin(dir), z: Math.cos(dir) }, distance);
    }
    sync(state) {
        const flow = state.flow;
        const shot = state.snap.heroes[this.slot];
        if (flow.n !== this.transition) {
            this.transition = flow.n;
            const spot = shot && this.transition > 0 ? { x: shot.x, z: shot.z } : RdMapData.HERO_STARTS[this.slot];
            const start = RdMapData.HERO_STARTS[this.slot];
            this.hero.place(Math.hypot(spot.x - start.x, spot.z - start.z) < 400 ? spot.x : start.x, Math.hypot(spot.x - start.x, spot.z - start.z) < 400 ? spot.z : start.z);
            this.hero.yaw = Math.PI;
            this.hero.dash = null;
        }
        if (!shot)
            return;
        const now = this.clock.local();
        const wasDown = this.hero.down;
        this.hero.down = (shot.flags & RdHeroFlags.DOWN) !== 0;
        this.hero.gone = (shot.flags & RdHeroFlags.GONE) !== 0;
        if (wasDown && !this.hero.down)
            this.hero.place(shot.x, shot.z);
        this.hero.hp = shot.hp;
        this.hero.maxHp = shot.max;
        if (shot.flags & RdHeroFlags.STUNNED)
            this.hero.stunUntil = now + 0.15;
        if (shot.flags & RdHeroFlags.SLOWED)
            this.hero.slowUntil = now + 0.3;
        const party = state.party[this.slot];
        if (party) {
            Object.keys(party.cards).forEach((key) => { this.hero.stats.cards[key] = party.cards[key]; });
            party.gear.forEach((tier, index) => { this.hero.stats.gear[index] = tier; });
        }
        shot.cd.forEach((left, index) => {
            if (now - this.pressedAt[index] < RdLocalBody.PRESS_GRACE)
                return;
            this.readyAt[index] = now + left;
        });
        this.world.vaultOpen = flow.vault;
    }
    step(state, others, dt, aim) {
        const bodies = [];
        const targets = [];
        const untouchable = RdFoeFlags.HIDDEN | RdFoeFlags.SPAWNING | RdFoeFlags.INVULNERABLE | RdFoeFlags.BROKEN;
        state.snap.foes.forEach((foe) => {
            if (foe.flags & RdFoeFlags.HIDDEN)
                return;
            const body = { id: foe.id, x: foe.x, z: foe.z, radius: RdLocalBody.radiusOf(foe.kind) };
            bodies.push(body);
            if (!(foe.flags & untouchable) && foe.hp > 0 && (foe.kind !== "chest" || foe.owner === this.slot))
                targets.push(body);
        });
        this.targets = targets;
        state.snap.heroes.forEach((shot) => {
            if (shot.slot === this.slot || shot.flags & RdHeroFlags.DOWN)
                return;
            const pose = others(shot.slot);
            bodies.push({ id: shot.slot + 1, x: pose.x, z: pose.z, radius: RdBalance.HERO_RADIUS });
        });
        bodies.push(this.hero);
        this.world.bodies = bodies;
        const intent = this.pilot.intent();
        if (!this.hero.dash)
            this.dashAim = null;
        const steer = this.dashAim || aim;
        intent.aimX = steer.x;
        intent.aimZ = steer.z;
        this.hero.intent = intent;
        const now = this.clock.local();
        if (intent.attack)
            this.hero.faceUntil = now + 0.5;
        RdHeroMover.step(this.hero, intent, Math.min(0.1, dt), this.world, now);
    }
    stateText(transition) {
        return RdHeroStateCodec.encode(this.hero, transition);
    }
    shouldSend(text, nowMs) {
        if (text === this.lastSentText && nowMs - this.lastSentAt < 1000)
            return false;
        this.lastSentText = text;
        this.lastSentAt = nowMs;
        return true;
    }
    static radiusOf(kind) {
        return RdFoeRadius.OF[kind];
    }
}
RdLocalBody.PRESS_GRACE = 0.6;
class RdMatch {
    constructor(services, session, onFinish) {
        this.services = services;
        this.session = session;
        this.onFinish = onFinish;
        this.clock = new RdClock();
        this.remoteBodies = new RdRemoteBodies();
        this.local = null;
        this.localPilot = null;
        this.director = null;
        this.roster = [];
        this.lastNetMs = 0;
        this.pickCounter = 0;
        this.ended = false;
        this.wrStarted = false;
        this.wrAsked = false;
        this.hostState = null;
        this.lastBannerAt = -1;
        const match = session.value("match");
        this.matchId = match ? match.id : 0;
        this.seatIds = new RkSeatPlan(RdRoomRules.RULES).matchSeats(match);
        this.mySlot = this.seatIds.indexOf(session.myId);
        this.link = new RdNetLink(session, services.meter);
        this.mirror = new RdMirror(this.clock);
        this.seatIds.forEach((id, slot) => {
            const record = id ? session.players.get(id) : undefined;
            this.roster.push({ slot, nick: record ? record.nick : RdRules.BOT_NAMES[slot], look: record ? record.look : CharacterLooks.createDefault(), isMe: id === session.myId, isBot: !record || record.isBot });
        });
        if (this.mySlot >= 0) {
            this.localPilot = new RdLocalPilot(services.input);
            this.local = new RdLocalBody(this.mySlot, this.localPilot, this.clock);
        }
        services.input.enabled = this.mySlot >= 0;
        services.input.onSkill = (index) => this.pressSkill(index);
        services.reward.onPick = (phase, index, floor) => this.pick(phase, index, floor);
        services.world.playing = true;
        services.world.rig.snap();
        this.scene = new RdSceneView(services.kit);
        this.scene.setRoster(this.roster);
        services.hud.build(this.roster, this.mySlot);
        services.banner.hide();
        services.banner.ledger.reset();
        if (session.isHost())
            this.startHosting();
        else
            ["snap", "flow", "party", "offer"].forEach((name) => this.applyChange(name));
    }
    startHosting() {
        const pilots = this.seatIds.map((id, slot) => {
            if (slot === this.mySlot && this.localPilot)
                return this.localPilot;
            const record = id ? this.session.players.get(id) : undefined;
            if (!record || record.isBot)
                return RdHeroBots.create(slot, new RdRandom(Math.random));
            return new RdRemotePilot();
        });
        this.director = new RdHostDirector(pilots, this.link);
    }
    slotOf(id) {
        return this.seatIds.indexOf(id);
    }
    applyChange(kind) {
        const raw = this.session.value(kind);
        this.services.meter.received(raw);
        if (kind === "pick" && this.director)
            this.director.receivePicks(this.session.value("pick"), (id) => this.slotOf(id));
        if (kind === "wr")
            this.onRecordAsk();
        if (kind === "wrname" && this.director)
            this.collectNames();
        if (this.director)
            return;
        if (kind === "snap")
            this.mirror.applySnap(raw);
        else if (kind === "flow")
            this.mirror.applyFlow(raw);
        else if (kind === "party")
            this.mirror.applyParty(raw);
        else if (kind === "offer")
            this.mirror.applyOffers(raw);
        else if (kind === "ev")
            this.scene.handle(this.filterEvents(this.mirror.takeEvents(raw)), this.mySlot);
    }
    receiveRemote(id, raw) {
        this.services.meter.received(raw);
        const slot = this.slotOf(id);
        if (slot < 0)
            return;
        this.remoteBodies.receive(slot, raw);
        if (this.director)
            this.director.receiveState(slot, raw);
    }
    playerRemoved(id) {
        const slot = this.slotOf(id);
        if (slot < 0 || !this.director)
            return;
        this.director.engine.setGone(slot);
    }
    pressSkill(index) {
        if (this.ended || !this.local)
            return;
        const state = this.currentState();
        const party = state ? state.party[this.mySlot] || null : null;
        if (this.director) {
            const hero = this.director.engine.heroes[this.mySlot];
            if (index < hero.heroClass.skills.length && this.director.engine.time >= hero.skillReadyAt[index])
                this.localPilot.press(index);
            return;
        }
        this.local.tryPress(index, party);
    }
    pick(phase, index, floor) {
        if (this.director) {
            this.director.engine.choose(this.mySlot, phase, index, floor);
            return;
        }
        this.pickCounter++;
        const record = { f: floor, k: phase, i: index, n: Date.now() * 10 + this.pickCounter };
        this.link.writeChild("pick/" + this.session.myId, record);
    }
    currentState() {
        return this.director ? this.hostState : this.mirror.state;
    }
    time() {
        return this.director ? this.director.engine.time : this.clock.now();
    }
    poseOf(slot, state) {
        const shot = state.snap.heroes[slot];
        if (this.local && slot === this.mySlot && !this.director) {
            const hero = this.local.hero;
            return { x: hero.x, z: hero.z, yaw: hero.yaw, moving: hero.moving, dash: !!hero.dash };
        }
        if (this.director) {
            const hero = this.director.engine.heroes[slot];
            return { x: hero.x, z: hero.z, yaw: hero.yaw, moving: hero.moving, dash: !!hero.dash };
        }
        const remote = this.roster[slot] && !this.roster[slot].isBot ? this.remoteBodies.pose(slot) : null;
        if (remote)
            return remote;
        return { x: shot ? shot.x : 0, z: shot ? shot.z : 0, yaw: shot ? shot.yaw : 0, moving: !!shot && (shot.flags & RdHeroFlags.MOVING) !== 0, dash: !!shot && (shot.flags & RdHeroFlags.DASH) !== 0 };
    }
    aimFor(hero) {
        const pointer = this.services.input.pointer();
        if (!pointer || this.services.touchDevice)
            return { x: 0, z: 0 };
        const ground = this.services.world.groundPoint(pointer.x, pointer.y);
        if (!ground)
            return { x: 0, z: 0 };
        return RdMath.normalize(ground.x - hero.x, ground.z - hero.z);
    }
    filterEvents(events) {
        events.forEach((event) => {
            if (event.t === "floor")
                this.showBanner(event.k, event.f);
            if (event.t === "fx" && event.k === "knock" && event.id === this.mySlot + 1 && this.local && !this.director)
                this.local.knock(event.d, event.r);
        });
        return events;
    }
    showBanner(kind, floor) {
        const state = this.currentState();
        const record = state ? RdRecordClock.ofFlow(state.flow, this.time()) : 0;
        if (kind === "start")
            this.services.banner.showStart(floor, this.matchId);
        else
            this.services.banner.showClear(floor, this.matchId, record);
    }
    update(dt) {
        const nowMs = performance.now();
        let state = null;
        if (this.director) {
            const director = this.director;
            if (this.localPilot)
                this.localPilot.aim = this.aimFor(director.engine.heroes[this.mySlot]);
            const events = director.step(dt);
            state = RdSnapshotCodec.capture(director.engine);
            this.hostState = state;
            this.scene.handle(this.filterEvents(events), this.mySlot);
            if (nowMs - this.lastNetMs >= RdRules.NET_MS) {
                this.lastNetMs = nowMs;
                director.publish(state);
            }
            this.checkEnd(state);
        }
        else {
            state = this.mirror.ready() ? this.mirror.state : null;
            if (state && this.local) {
                this.local.sync(state);
                this.local.step(state, (slot) => this.poseOf(slot, state), dt, this.aimFor(this.local.hero));
                if (nowMs - this.lastNetMs >= RdRules.NET_MS) {
                    this.lastNetMs = nowMs;
                    const text = this.local.stateText(state.flow.n);
                    if (this.local.shouldSend(text, nowMs))
                        this.link.writeState(text);
                }
            }
        }
        if (!state) {
            this.services.world.render(dt);
            return;
        }
        const current = state;
        const time = this.time();
        this.catchUpBanner(current, time);
        const slowDt = dt * this.scene.slowFactor;
        this.scene.apply(current, time, (slot) => this.poseOf(slot, current), this.mySlot, slowDt);
        this.scene.render(slowDt);
        const cooldowns = this.cooldowns(current, time);
        this.services.hud.update({ state: current, time, mySlot: this.mySlot, roster: this.roster, poses: (slot) => this.poseOf(slot, current), cooldowns, spectating: this.mySlot < 0 });
        const offer = this.mySlot >= 0 ? current.offers.filter((item) => item.slot === this.mySlot)[0] || null : null;
        const party = this.mySlot >= 0 ? current.party[this.mySlot] : undefined;
        this.services.reward.update(offer, party ? party.gear : [-1, -1, -1], time, current.flow.picking, current.snap.heroes.filter((hero) => !(hero.flags & RdHeroFlags.GONE)).length);
        this.followCamera(current, dt);
        this.services.world.render(dt);
    }
    catchUpBanner(state, time) {
        const banner = state.flow.banner;
        if (!banner || banner.at === this.lastBannerAt)
            return;
        this.lastBannerAt = banner.at;
        if (time - banner.at < 3)
            this.showBanner(banner.k, banner.f);
    }
    cooldowns(state, time) {
        if (this.mySlot < 0)
            return [];
        if (this.director) {
            const hero = this.director.engine.heroes[this.mySlot];
            return hero.skillReadyAt.map((at) => Math.max(0, at - time));
        }
        return this.local ? this.local.cooldowns() : [];
    }
    followCamera(state, dt) {
        const w = RdViewMath.w;
        const living = state.snap.heroes.filter((hero) => !(hero.flags & RdHeroFlags.DOWN));
        const points = living.map((hero) => {
            const pose = this.poseOf(hero.slot, state);
            return { x: w(pose.x), z: w(pose.z) };
        });
        const me = this.mySlot >= 0 ? state.snap.heroes[this.mySlot] : null;
        const myAlive = !!me && !(me.flags & RdHeroFlags.DOWN);
        const myPose = this.mySlot >= 0 ? this.poseOf(this.mySlot, state) : null;
        const bias = myAlive && myPose ? { x: w(myPose.x), z: w(myPose.z) } : null;
        if (points.length)
            this.services.world.rig.follow(points, bias, dt);
    }
    checkEnd(state) {
        if (this.ended || !this.director || state.flow.out === "running")
            return;
        this.ended = true;
        const engine = this.director.engine;
        const humans = this.roster.every((entry) => !entry.isBot);
        const end = { out: state.flow.out, ms: Math.round(engine.flow.recordSeconds(engine) * 1000), floor: state.flow.floor, times: state.flow.times, party: state.party, humans, at: Date.now(), match: this.matchId };
        this.director.publish(state);
        this.session.ref.update({ end: end, status: "end" });
        if (end.out === "success" && humans)
            this.beginRecordAsk(end.ms);
    }
    markEnded() {
        this.ended = true;
        this.services.input.enabled = false;
    }
    async beginRecordAsk(ms) {
        const handle = this.services.records.record;
        if (!handle || this.wrStarted || handle.noRecord)
            return;
        this.wrStarted = true;
        await handle.load();
        if (!handle.beats(ms) && !handle.beatsClass(ms))
            return;
        const ask = { phase: "ask", v: ms, deadline: Date.now() + RdRoomRules.RECORD_ASK_SECONDS * 1000, match: this.matchId, ok: false };
        this.session.ref.update({ wr: ask, wrname: null });
    }
    onRecordAsk() {
        const ask = this.session.value("wr");
        const handle = this.services.records.record;
        if (!ask || ask.phase !== "ask" || ask.match !== this.matchId || this.wrAsked || this.mySlot < 0 || !handle || !handle.askName)
            return;
        this.wrAsked = true;
        const nick = this.roster[this.mySlot].nick;
        const seconds = Math.max(5, Math.round((ask.deadline - Date.now()) / 1000));
        const askName = handle.askName.bind(handle);
        window.setTimeout(() => {
            askName({ value: ask.v, seconds, fallback: nick, needClass: this.director !== null && !handle.klass, title: "파티 신기록 달성!" }).then((answer) => {
                this.link.writeChild("wrname/" + this.session.myId, { name: answer.name.slice(0, 8), grade: answer.grade, cls: answer.cls });
            });
        }, 4200);
        if (this.director)
            window.setTimeout(() => this.finishRecord(true), (seconds + 6) * 1000);
    }
    collectNames() {
        const names = this.session.value("wrname") || {};
        const filled = this.seatIds.every((id) => !!id && !!names[id]);
        if (filled)
            this.finishRecord(false);
    }
    async finishRecord(timeout) {
        const ask = this.session.value("wr");
        const handle = this.services.records.record;
        if (!ask || ask.phase !== "ask" || !handle || !handle.submitParty || !this.director)
            return;
        const names = this.session.value("wrname") || {};
        const party = this.seatIds.map((id, slot) => {
            const entry = id ? names[id] : undefined;
            const text = entry && entry.name ? entry.name : this.roster[slot].nick;
            return String(text).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 8) || this.roster[slot].nick.slice(0, 8);
        });
        const mine = names[this.session.myId];
        const klass = handle.klass;
        const grade = klass ? klass.grade : mine ? mine.grade : 0;
        const cls = klass ? klass.cls : mine ? mine.cls : 0;
        this.session.ref.update({ wr: { phase: "done", v: ask.v, deadline: ask.deadline, match: ask.match, ok: true } });
        if (!grade || !cls)
            return;
        try {
            await handle.submitParty(ask.v, { party, grade, cls });
        }
        catch (error) {
            return;
        }
        if (timeout)
            return;
    }
    dispose() {
        this.services.world.playing = false;
        this.services.input.releaseAll();
        this.services.input.enabled = false;
        this.services.input.onSkill = () => undefined;
        this.services.reward.update(null, [-1, -1, -1], 0, 0, 0);
        this.services.banner.hide();
        this.scene.dispose();
    }
}
class RdGame {
    constructor(libs) {
        this.libs = libs;
        this.touchDevice = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
        this.profile = new PlayerProfile();
        this.backend = new RkBackend();
        this.directory = new RkDirectory(this.backend, RdRoomRules.RULES);
        this.seatPlan = new RkSeatPlan(RdRoomRules.RULES);
        this.screens = new RdScreens(this.touchDevice);
        this.lobbyView = new RdLobbyView();
        this.resultView = new RdResultView();
        this.myId = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        this.session = null;
        this.match = null;
        this.assetsReady = false;
        this.lastFrameMs = 0;
        this.loop = (timeMs) => {
            this.step(timeMs);
            requestAnimationFrame(this.loop);
        };
        this.assets = new CharacterAssets(libs);
        this.factory = new CharacterModelFactory(libs, this.assets);
        this.library = new RdModelLibrary(libs);
        this.world = new RdWorldView(libs, RkDom.byId("view"), this.touchDevice);
        this.editor = new ProfileEditor(libs, this.factory, this.assets, this.profile);
        FoldCard.bindAll(document);
        const input = new RdInputController(RkDom.byId("view"), RkDom.byId("joyZone"), RkDom.byId("joyBase"), RkDom.byId("joyKnob"));
        const labels = new RkLabelFactory(libs);
        const numbers = new RdDamageNumbers(this.world, RkDom.byId("numberLayer"));
        const kit = { libs, world: this.world, library: this.library, factory: this.factory, clips: this.assets.clips, labels, numbers };
        this.services = {
            libs, world: this.world, kit, hud: new RdHud(input, this.touchDevice), input, banner: new RdFloorBanner(), reward: new RdRewardView(),
            meter: new RdNetMeter(/[?&]net(=|&|$)/.test(location.search)), records: new RdRecordBoard(), touchDevice: this.touchDevice
        };
        this.backdrop = new RdMenuBackdrop(this.world, libs, this.library);
        this.bindMenus();
        this.screens.show("start");
        this.updateStartButtons();
        this.loadAssets();
        requestAnimationFrame(this.loop);
        window.setInterval(() => { if (document.hidden)
            this.step(performance.now()); }, 250);
        window.addEventListener("pagehide", () => { if (this.session)
            this.session.removeMineOnUnload(); });
    }
    async loadAssets() {
        try {
            await Promise.all([this.assets.load(), this.library.load(), this.loadExtraClips()]);
            this.assetsReady = true;
            this.backdrop.prepare(this.factory, this.assets.clips, this.services.kit.labels);
            RkDom.setText(RkDom.byId("loadNote"), "");
            this.editor.mount(RkDom.byId("profileHost"));
            this.editor.setActive(true);
            this.editor.onChange(() => this.pushProfile());
            this.updateStartButtons();
        }
        catch (error) {
            RkDom.setText(RkDom.byId("loadNote"), "캐릭터를 불러오지 못했어요. 새로고침해 주세요.");
        }
    }
    async loadExtraClips() {
        try {
            const gltf = await new this.libs.GLTFLoader().loadAsync("assets/kaykit/animations/raid_anims.glb");
            gltf.animations.forEach((clip) => this.assets.clips.set(clip.name, clip));
        }
        catch (error) {
            return;
        }
    }
    bindMenus() {
        RkDom.byId("btnCreate").addEventListener("click", () => this.createRoom());
        RkDom.byId("btnJoin").addEventListener("click", () => this.joinRoom(false));
        RkDom.byId("btnWatch").addEventListener("click", () => this.joinRoom(true));
        RkDom.byId("joinCode").addEventListener("keydown", (event) => { if (event.key === "Enter")
            this.joinRoom(false); });
        RkDom.byId("btnStart").addEventListener("click", () => this.startMatch());
        RkDom.byId("btnLeave").addEventListener("click", () => this.leaveRoom());
        RkDom.byId("btnEndLeave").addEventListener("click", () => this.leaveRoom());
        RkDom.byId("btnGameLeave").addEventListener("click", () => this.leaveRoom());
        RkDom.byId("btnToLobby").addEventListener("click", () => this.returnToLobby());
        RkDom.byId("btnSeatMode").addEventListener("click", () => this.toggleSeatMode());
        this.lobbyView.onSeatClick = (slot) => this.clickSeat(slot);
    }
    toggleSeatMode() {
        const session = this.session;
        if (!session || session.status !== "lobby")
            return;
        if (session.isSpectator()) {
            const seat = this.seatPlan.freeSeat(session.players);
            if (seat >= 0)
                session.ref.child("players/" + session.myId).update({ slot: seat, spectator: false });
        }
        else if (this.seatPlan.spectators(session.players).length === 0) {
            session.ref.child("players/" + session.myId).update({ slot: RdRules.SPECTATOR_SLOT, spectator: true });
        }
    }
    updateStartButtons() {
        const ok = !!this.backend.database && this.assetsReady;
        ["btnCreate", "btnJoin", "btnWatch"].forEach((id) => { RkDom.byId(id).disabled = !ok; });
        if (!this.backend.database)
            this.showStartMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인)");
    }
    showStartMessage(text) {
        RkDom.setText(RkDom.byId("startMsg"), text);
    }
    myRecord() {
        return { nick: this.profile.nickOrDefault(), isBot: false, joinedAt: this.backend.now(), slot: 0, look: this.profile.look, spectator: false };
    }
    pushProfile() {
        if (this.session)
            this.session.pushProfile({ nick: this.profile.nickOrDefault(), look: this.profile.look });
    }
    async createRoom() {
        if (!this.backend.database)
            return;
        this.showStartMessage("");
        const button = RkDom.byId("btnCreate");
        button.disabled = true;
        try {
            const code = await this.directory.create(this.myId, this.myRecord());
            if (code)
                this.enterRoom(code, true, "");
            else
                this.showStartMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
        }
        catch (error) {
            this.showStartMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
        }
        button.disabled = false;
    }
    async joinRoom(asSpectator) {
        if (!this.backend.database)
            return;
        const code = RkDom.byId("joinCode").value.replace(/\D/g, "");
        if (code.length !== 5) {
            this.showStartMessage("방 코드 5자리를 입력해 주세요.");
            return;
        }
        this.showStartMessage("");
        try {
            const outcome = await this.directory.join(code, this.myId, this.myRecord(), asSpectator);
            if (outcome.ok)
                this.enterRoom(code, false, outcome.message);
            else
                this.showStartMessage(outcome.message);
        }
        catch (error) {
            this.showStartMessage("방을 불러오지 못했어요.");
        }
    }
    enterRoom(code, hosting, notice) {
        const session = new RkSession(this.backend, RdRoomRules.RULES, code, this.myId, hosting, RdRoomRules.VALUES);
        this.session = session;
        session.onChange = (kind) => this.onSessionChange(kind);
        session.onRemoteState = (id, raw) => { if (this.match)
            this.match.receiveRemote(id, raw); };
        session.onPlayerRemoved = (id) => { if (this.match)
            this.match.playerRemoved(id); };
        session.onClosed = (message) => this.exitToStart(message);
        session.connect();
        this.showLobby();
        RkDom.setText(RkDom.byId("lobbyNotice"), notice);
    }
    showLobby() {
        this.screens.show("lobby");
        this.editor.mount(RkDom.byId("lobbyProfileHost"));
        this.editor.setActive(true);
        this.services.records.render();
        if (this.session)
            this.lobbyView.render(this.session);
    }
    showStart(message) {
        this.screens.show("start");
        this.editor.mount(RkDom.byId("profileHost"));
        this.editor.setActive(true);
        this.services.records.render();
        this.showStartMessage(message);
    }
    onSessionChange(kind) {
        const session = this.session;
        if (!session)
            return;
        if (this.screens.current === "lobby" && (kind === "players" || kind === "host" || kind === "status"))
            this.lobbyView.render(session);
        if (kind === "status" || kind === "match" || kind === "end" || (kind === "players" && session.status === "play" && !this.match))
            this.syncPhase();
        if (this.match)
            this.match.applyChange(kind);
    }
    syncPhase() {
        const session = this.session;
        if (!session)
            return;
        const end = session.value("end");
        if (session.status === "lobby") {
            if (this.match)
                this.disposeMatch();
            if (this.screens.current !== "lobby")
                this.showLobby();
            this.lobbyView.render(session);
        }
        else if (session.status === "play" && session.value("match") && !this.match && session.me()) {
            this.editor.setActive(false);
            this.match = new RdMatch(this.services, session, () => undefined);
            this.screens.show("game", !session.isSpectator());
        }
        else if (session.status === "end" && end && this.screens.current !== "end") {
            if (this.match)
                this.match.markEnded();
            const delay = end.out === "success" ? 300 : 1500;
            window.setTimeout(() => this.showResult(end), delay);
        }
    }
    showResult(end) {
        const session = this.session;
        if (!session || session.status !== "end")
            return;
        const seats = this.seatPlan.matchSeats(session.value("match"));
        const roster = seats.map((id, slot) => {
            const record = id ? session.players.get(id) : undefined;
            return { slot, nick: record ? record.nick : RdRules.BOT_NAMES[slot], look: record ? record.look : CharacterLooks.createDefault(), isMe: id === session.myId, isBot: !record || record.isBot };
        });
        const handle = this.services.records.record;
        const recordText = end.out === "success" && end.humans && handle && handle.noRecord ? "배포용 링크라 기록이 등록되지 않아요" : "";
        this.resultView.render(end, roster, seats.indexOf(session.myId), recordText);
        this.screens.show("end");
        this.services.records.render();
        RkDom.show(RkDom.byId("btnToLobby"), session.isHost());
        RkDom.setText(RkDom.byId("endHint"), session.isHost() ? "" : "방장이 대기실로 돌아가길 기다려요…");
    }
    disposeMatch() {
        if (this.match)
            this.match.dispose();
        this.match = null;
    }
    clickSeat(slot) {
        const session = this.session;
        if (!session || session.status !== "lobby")
            return;
        const seats = this.seatPlan.humanSeats(session.players);
        if (seats[slot])
            return;
        session.ref.child("players/" + session.myId).update({ slot, spectator: false });
    }
    startMatch() {
        const session = this.session;
        if (!session || !session.isHost() || session.status !== "lobby")
            return;
        const humans = this.seatPlan.humanSeats(session.players);
        const seats = {};
        const updates = {};
        for (let slot = 0; slot < RdRules.SEATS; slot++) {
            const human = humans[slot];
            if (human) {
                seats["s" + slot] = human;
                continue;
            }
            const botId = "bot" + Math.random().toString(36).slice(2, 8);
            seats["s" + slot] = botId;
            const look = CharacterLooks.random();
            look.c = RdBalance.heroSpec(slot).lookType;
            const record = { nick: RdRules.BOT_NAMES[slot], isBot: true, joinedAt: this.backend.now() + 1 + slot, slot, look };
            updates["players/" + botId] = record;
        }
        const match = { id: 1 + Math.floor(Math.random() * 1000000000), startAt: this.backend.now(), seats };
        Object.assign(updates, { match, status: "play", st: null, in: null, snap: null, flow: null, party: null, offer: null, ev: null, end: null, wr: null, wrname: null, pick: null });
        session.ref.update(updates);
    }
    returnToLobby() {
        const session = this.session;
        if (!session || !session.isHost())
            return;
        const updates = { status: "lobby", match: null, snap: null, flow: null, party: null, offer: null, ev: null, end: null, st: null, in: null, wr: null, wrname: null, pick: null };
        session.players.forEach((record, id) => { if (record.isBot)
            updates["players/" + id] = null; });
        session.ref.update(updates);
    }
    leaveRoom() {
        if (this.session)
            this.session.leave();
        this.session = null;
        this.disposeMatch();
        this.showStart("");
    }
    exitToStart(message) {
        if (this.session)
            this.session.silentClose();
        this.session = null;
        this.disposeMatch();
        this.showStart(message);
    }
    step(timeMs) {
        const dt = Math.min(0.1, Math.max(0, (timeMs - this.lastFrameMs) / 1000));
        this.lastFrameMs = timeMs;
        this.services.meter.tick();
        const playing = !!this.match && this.screens.current === "game";
        this.world.matchGroup.visible = playing;
        this.backdrop.setVisible(!playing);
        if (playing && this.match) {
            this.match.update(dt);
            return;
        }
        this.backdrop.render(dt);
    }
}
