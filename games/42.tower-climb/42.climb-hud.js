"use strict";
class ClimbDom {
    static el(id) {
        const found = document.getElementById(id);
        if (!found)
            throw new Error("화면 요소가 없어요: " + id);
        return found;
    }
}
class ClimbText {
    static tenths(seconds) { return Math.floor(seconds * 10 + 1e-6); }
    static clock(seconds) {
        const tenths = ClimbText.tenths(seconds), minutes = Math.floor(tenths / 600), rest = Math.floor(tenths / 10) % 60;
        return minutes + ":" + (rest < 10 ? "0" : "") + rest + "." + (tenths % 10);
    }
    static delta(seconds) {
        const tenths = Math.abs(Math.round(seconds * 10));
        return (seconds < 0 ? ClimbText.MINUS : "+") + Math.floor(tenths / 10) + "." + (tenths % 10);
    }
    static meters(value) { return Math.floor(value + 1e-6) + "m"; }
    static number(value) { return typeof value === "number" && isFinite(value) && value > 0 ? value : 0; }
}
ClimbText.MINUS = "−";
class ClimbRecordBook {
    constructor(game, storageKey, lower, format, onChange) {
        this.game = game;
        this.storageKey = storageKey;
        this.onChange = onChange;
        this.best = this.read();
        const factory = window.WorldRecord;
        this.world = factory ? factory(game, { lower, format }) : null;
        if (this.world) {
            this.world.onChange(() => this.onChange());
            const loading = this.world.load();
            if (loading)
                loading.then(() => this.onChange(), () => undefined);
        }
        this.account = factory && factory.syncBest
            ? factory.syncBest(game, { storageKey, merge: this.merger(factory), onApply: () => { this.best = this.read(); this.onChange(); } })
            : null;
    }
    read() {
        try {
            return this.parse(localStorage.getItem(this.storageKey)) ?? this.empty();
        }
        catch (error) {
            return this.empty();
        }
    }
    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.best));
        }
        catch (error) {
            return;
        }
        if (this.account)
            this.account.push();
        this.onChange();
    }
    submit(value, detail) {
        const world = this.world;
        if (!world || value <= 0 || (!world.beats(value) && !world.beatsClass(value)))
            return;
        world.prompt(value, undefined, detail);
        const factory = window.WorldRecord;
        if (factory && factory.pushBest)
            factory.pushBest(this.game);
    }
}
class ClimbRecords extends ClimbRecordBook {
    constructor(onChange) { super(ClimbRecords.GAME, ClimbRecords.STORAGE_KEY, false, (value) => value + "m", onChange); }
    static parse(raw) {
        if (!raw)
            return null;
        try {
            const value = JSON.parse(raw);
            return { h: Math.min(ClimbBalance.TOP, Math.floor(ClimbText.number(value.h))), s: Math.min(ClimbBalance.STAGE_COUNT, Math.floor(ClimbText.number(value.s))) };
        }
        catch (error) {
            return null;
        }
    }
    static merge(local, account) {
        const a = ClimbRecords.parse(local), b = ClimbRecords.parse(account);
        if (!a || !b)
            return a ? JSON.stringify(a) : b ? JSON.stringify(b) : null;
        return JSON.stringify({ h: Math.max(a.h, b.h), s: Math.max(a.s, b.s) });
    }
    parse(raw) { return ClimbRecords.parse(raw); }
    empty() { return { h: 0, s: 0 }; }
    merger() { return ClimbRecords.merge; }
    offerHeight(meters) {
        if (meters <= this.best.h)
            return false;
        this.best.h = meters;
        this.save();
        return true;
    }
    offerStage(stage) { if (stage > this.best.s) {
        this.best.s = stage;
        this.save();
    } }
    submitWorld(meters) { this.submit(meters); }
}
ClimbRecords.GAME = "towerclimb";
ClimbRecords.STORAGE_KEY = "towerclimb_best_v1";
class ClimbSpeedRecords extends ClimbRecordBook {
    constructor(onChange) { super(ClimbSpeedRecords.GAME, ClimbSpeedRecords.STORAGE_KEY, true, (tenths) => ClimbText.clock(tenths / 10), onChange); }
    static parse(raw) {
        if (!raw)
            return null;
        try {
            const value = JSON.parse(raw), t = ClimbText.number(value.t);
            if (!t)
                return null;
            const splits = Array.isArray(value.sp) ? value.sp : [];
            return { t, sp: Array.from({ length: ClimbBalance.STAGE_COUNT }, (_, index) => ClimbText.number(splits[index])) };
        }
        catch (error) {
            return null;
        }
    }
    static faster(local, account) {
        const a = ClimbSpeedRecords.parse(local), b = ClimbSpeedRecords.parse(account);
        if (!a || !b)
            return a ? local : b ? account : null;
        return b.t < a.t ? account : local;
    }
    parse(raw) { return ClimbSpeedRecords.parse(raw); }
    empty() { return { t: 0, sp: [] }; }
    merger(factory) {
        return factory.betterOf ? factory.betterOf((raw) => ClimbSpeedRecords.parse(raw)?.t ?? null, true) : ClimbSpeedRecords.faster;
    }
    get seconds() { return this.best.t; }
    split(stage) { return this.best.sp[stage - 1] ?? 0; }
    offer(finish) {
        const seconds = ClimbText.tenths(finish.seconds) / 10;
        if (seconds <= 0 || (this.best.t && seconds >= this.best.t))
            return false;
        this.best = { t: seconds, sp: finish.splits.map((split) => ClimbText.tenths(split) / 10) };
        this.save();
        return true;
    }
    submitWorld(finish) {
        if (finish.seconds < ClimbSpeedRecords.WORLD_MIN_SECONDS)
            return;
        this.submit(ClimbText.tenths(finish.seconds), { splits: finish.splits.map((split) => ClimbText.tenths(split)) });
    }
}
ClimbSpeedRecords.GAME = "towerclimbspeed";
ClimbSpeedRecords.STORAGE_KEY = "towerclimb_speed_v1";
ClimbSpeedRecords.WORLD_MIN_SECONDS = 60;
class ClimbSfx {
    constructor() {
        this.muted = false;
        this.rate = 1;
        this.context = null;
    }
    play(name) {
        const sound = ClimbSfx.SOUNDS[name];
        if (!sound || this.muted)
            return;
        try {
            if (!this.context)
                this.context = new AudioContext();
            const context = this.context, now = context.currentTime, [from, to, seconds, shape] = sound, long = seconds / this.rate;
            const oscillator = context.createOscillator(), gain = context.createGain();
            oscillator.type = shape;
            oscillator.frequency.setValueAtTime(from * this.rate, now);
            oscillator.frequency.exponentialRampToValueAtTime(to * this.rate, now + long);
            gain.gain.setValueAtTime(ClimbSfx.VOLUME, now);
            gain.gain.exponentialRampToValueAtTime(0.0008, now + long);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(now);
            oscillator.stop(now + long + 0.02);
        }
        catch (error) {
            this.muted = true;
        }
    }
}
ClimbSfx.SOUNDS = {
    jump: [420, 640, 0.12, "square"], land: [180, 110, 0.09, "triangle"], pad: [300, 900, 0.25, "square"], grab: [520, 560, 0.07, "triangle"],
    portal: [700, 240, 0.9, "sine"], clear: [520, 1040, 0.6, "square"], fall: [300, 90, 0.5, "sawtooth"],
    knock: [240, 120, 0.18, "sawtooth"], crumble: [160, 60, 0.35, "triangle"], summit: [520, 1560, 1.2, "square"],
};
ClimbSfx.VOLUME = 0.07;
class ClimbHudField {
    constructor(element) {
        this.element = element;
        this.shown = "";
    }
    set(text) { if (text !== this.shown) {
        this.shown = text;
        this.element.textContent = text;
    } }
}
class ClimbHudMeter {
    constructor(element) {
        this.element = element;
        this.shown = -1;
    }
    set(ratio) {
        const value = Math.round(Math.max(0, Math.min(1, ratio)) * 200) / 200;
        if (value === this.shown)
            return;
        this.shown = value;
        this.element.style.transform = "scaleX(" + value + ")";
    }
}
class ClimbHudFade {
    constructor(element) {
        this.element = element;
        this.shown = -1;
    }
    set(opacity) {
        const value = Math.round(Math.max(0, Math.min(1, opacity)) * 50) / 50;
        if (value === this.shown)
            return;
        this.shown = value;
        this.element.style.opacity = String(value);
    }
}
class ClimbHudSwitch {
    constructor(element, name) {
        this.element = element;
        this.name = name;
        this.shown = null;
    }
    set(on) { if (on !== this.shown) {
        this.shown = on;
        this.element.classList.toggle(this.name, on);
    } }
}
class ClimbHud {
    constructor(level) {
        this.level = level;
        this.height = new ClimbHudField(ClimbDom.el("hudHeight"));
        this.stage = new ClimbHudField(ClimbDom.el("hudStage"));
        this.time = new ClimbHudField(ClimbDom.el("hudTime"));
        this.best = new ClimbHudField(ClimbDom.el("hudBest"));
        this.speedBest = new ClimbHudField(ClimbDom.el("hudSpeedBest"));
        this.speedMode = new ClimbHudSwitch(ClimbDom.el("hudLeft"), "speed");
        this.bar = new ClimbHudMeter(ClimbDom.el("hudBarFill"));
        this.veil = new ClimbHudFade(ClimbDom.el("slowVeil"));
        this.white = new ClimbHudFade(ClimbDom.el("whiteFade"));
        this.bannerBox = ClimbDom.el("banner");
        this.countBox = ClimbDom.el("bigCount");
        this.grabTip = ClimbDom.el("grabHint");
        this.mapDot = ClimbDom.el("hudMapDot");
        this.mapCells = [];
        this.bannerLeft = 0;
        this.dotAt = -1;
        this.tipShown = "";
        this.clearedShown = -1;
        this.countShown = "";
        const map = ClimbDom.el("hudMapCells");
        for (let index = ClimbBalance.STAGE_COUNT; index >= 1; index--) {
            const cell = document.createElement("i");
            cell.textContent = String(index);
            if (!level.stageOf(index)?.built)
                cell.className = "unbuilt";
            map.appendChild(cell);
            this.mapCells[index] = cell;
        }
    }
    showPlay(visible) {
        ClimbHud.PLAY_IDS.forEach((id) => { ClimbDom.el(id).hidden = !visible; });
        if (visible)
            return;
        this.bannerBox.hidden = true;
        this.countBox.hidden = true;
        this.grabTip.hidden = true;
        this.veil.set(0);
        this.white.set(0);
    }
    banner(text, strong, seconds) {
        this.bannerBox.textContent = text;
        this.bannerBox.classList.toggle("strong", strong);
        this.bannerBox.hidden = !text;
        this.bannerLeft = seconds;
    }
    countdown(text) {
        if (text === this.countShown)
            return;
        this.countShown = text;
        this.countBox.hidden = !text;
        this.countBox.textContent = text;
        if (text)
            this.countBox.animate([{ transform: "translate(-50%,-50%) scale(1.6)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1 }], { duration: 380, easing: "ease-out" });
    }
    hangHint(hanging, onLedge, touch) {
        const H = ClimbHud, tip = !hanging ? "" : onLedge ? (touch ? H.LEDGE_TIP_TOUCH : H.LEDGE_TIP) : (touch ? H.HOLD_TIP_TOUCH : H.HOLD_TIP);
        if (tip === this.tipShown)
            return;
        this.tipShown = tip;
        this.grabTip.hidden = !tip;
        if (tip)
            this.grabTip.innerHTML = tip;
    }
    update(rules, records, speed, fresh, dt) {
        const B = ClimbBalance, height = rules.height, stage = this.level.stageAt(height), mode = rules.mode;
        this.height.set(ClimbText.meters(height));
        this.stage.set(stage.index > 0 ? "스테이지 " + stage.index + " · " + stage.name : stage.name);
        this.bar.set(height / B.TOP);
        this.speedMode.set(mode.timed);
        this.time.set(mode.timed ? ClimbText.clock(mode.seconds) : "");
        this.best.set(mode.timed ? "이번 판 " + ClimbText.meters(mode.peak) + " · 최고 " + records.best.h + "m" : "최고 " + records.best.h + "m" + (fresh.height ? " NEW" : ""));
        this.speedBest.set(mode.timed ? "최고 기록 " + (speed.seconds ? ClimbText.clock(speed.seconds) : "-") + (fresh.speed ? " NEW" : "") : "");
        this.veil.set((1 - rules.time.scale) / (1 - B.SLOW_SCALE));
        this.white.set(rules.body.mode === "portal" ? 1 - rules.body.portalTime / B.PORTAL_TIME : 0);
        const dot = Math.round((1 - Math.min(1, height / B.TOP)) * B.STAGE_COUNT * ClimbHud.MAP_CELL);
        if (dot !== this.dotAt) {
            this.dotAt = dot;
            this.mapDot.style.transform = "translateY(" + dot + "px)";
        }
        if (rules.progress.cleared !== this.clearedShown) {
            this.clearedShown = rules.progress.cleared;
            this.mapCells.forEach((cell, index) => cell.classList.toggle("cleared", index <= this.clearedShown));
        }
        if (this.bannerLeft > 0) {
            this.bannerLeft -= dt;
            if (this.bannerLeft <= 0)
                this.bannerBox.hidden = true;
        }
    }
}
ClimbHud.MAP_CELL = 22;
ClimbHud.PLAY_IDS = ["hudTop", "hudLeft", "hudMap", "controls", "btnPause"];
ClimbHud.LEDGE_TIP = "<b>W / Space</b><span>올라가기</span><b>S</b><span>놓기</span>";
ClimbHud.HOLD_TIP = "<b>Space</b><span>위로</span><b>S</b><span>놓기</span>";
ClimbHud.LEDGE_TIP_TOUCH = "<b>위로 밀기 · 점프</b><span>올라가기</span><b>아래로 당기기</b><span>놓기</span>";
ClimbHud.HOLD_TIP_TOUCH = "<b>점프</b><span>위로</span><b>아래로 당기기</b><span>놓기</span>";
class ClimbFreshMarks {
    constructor() {
        this.height = false;
        this.speed = false;
    }
    clear() { this.height = false; this.speed = false; }
}
class ClimbResultCard {
    constructor(id) { this.box = ClimbDom.el(id); }
    reveal() { this.box.hidden = false; }
    hide() { this.box.hidden = true; }
}
class ClimbPracticeResult extends ClimbResultCard {
    constructor() {
        super("resultBox");
        this.falls = ClimbDom.el("resultFalls");
        this.portals = ClimbDom.el("resultPortals");
    }
    show(summit) {
        this.falls.textContent = summit.falls + "번";
        this.portals.textContent = summit.portals ? summit.portals + "번" : "안 씀";
        this.reveal();
    }
}
class ClimbSpeedrunResult extends ClimbResultCard {
    constructor() {
        super("speedResultBox");
        this.time = ClimbDom.el("speedTime");
        this.best = ClimbDom.el("speedBest");
        this.falls = ClimbDom.el("speedFalls");
        this.splits = ClimbDom.el("speedSplits");
    }
    static paintDelta(cell, seconds, before) {
        cell.className = "";
        if (!before) {
            cell.textContent = "";
            return;
        }
        const delta = ClimbText.tenths(seconds) / 10 - before;
        cell.textContent = "(" + ClimbText.delta(delta) + ")";
        cell.className = delta < 0 ? "faster" : delta > 0 ? "slower" : "";
    }
    show(finish, before, fresh) {
        this.time.textContent = ClimbText.clock(finish.seconds) + (fresh ? " NEW" : "");
        this.time.classList.toggle("fresh", fresh);
        this.best.textContent = before.t ? ClimbText.clock(before.t) : "처음 완주";
        this.falls.textContent = finish.falls + "번";
        this.splits.replaceChildren();
        finish.splits.forEach((seconds, index) => {
            const stage = index + 1, row = document.createElement("tr"), name = document.createElement("td"), at = document.createElement("td"), delta = document.createElement("td");
            name.textContent = "스테이지 " + stage + " · " + (stage === ClimbBalance.STAGE_COUNT ? ClimbBalance.TOP : stage * 30) + "m";
            at.textContent = seconds ? ClimbText.clock(seconds) : "-";
            ClimbSpeedrunResult.paintDelta(delta, seconds, seconds ? before.sp[index] ?? 0 : 0);
            row.append(name, at, delta);
            this.splits.appendChild(row);
        });
        this.reveal();
    }
}
class ClimbRecordCell {
    constructor(valueId, noteId, boxId = "") {
        this.value = ClimbDom.el(valueId);
        this.note = ClimbDom.el(noteId);
        this.box = boxId ? ClimbDom.el(boxId) : null;
    }
    paint(slot) {
        if (this.box)
            this.box.hidden = !slot;
        this.value.textContent = slot && slot.rec ? slot.text() : "-";
        this.note.textContent = slot && slot.rec ? slot.who() : "";
    }
}
class ClimbSpeedBoard {
    constructor(level) {
        this.rows = [];
        this.times = [];
        this.who = ClimbDom.el("speedBoardWho");
        this.total = ClimbDom.el("speedBoardTime");
        const list = ClimbDom.el("speedBoardRows");
        for (let stage = 1; stage <= ClimbBalance.STAGE_COUNT; stage++) {
            const row = document.createElement("li"), chip = document.createElement("i"), name = document.createElement("span"), time = document.createElement("b");
            chip.textContent = String(stage);
            name.textContent = level.stageOf(stage)?.name ?? "스테이지 " + stage;
            row.append(chip, name, time);
            list.appendChild(row);
            this.rows.push(row);
            this.times.push(time);
        }
    }
    static splitsOf(record) {
        const raw = record && typeof record === "object" ? record.splits : null;
        const table = raw && typeof raw === "object" ? raw : {};
        return Array.from({ length: ClimbBalance.STAGE_COUNT }, (_, index) => ClimbText.number(table[String(index)]) / 10);
    }
    paint(world) {
        const held = !!(world && world.rec), splits = held && world ? ClimbSpeedBoard.splitsOf(world.rec) : [];
        this.rows.forEach((row, index) => {
            const seconds = splits[index] ?? 0;
            row.classList.toggle("done", seconds > 0);
            this.times[index].textContent = seconds > 0 ? ClimbText.clock(seconds) : "-";
        });
        this.who.textContent = held && world ? "🏆 " + world.who() : "아직 기록이 없어요";
        this.total.textContent = held && world ? world.text() : "-";
    }
}
class ClimbStartPanel {
    constructor(level) {
        this.best = ClimbDom.el("recBest");
        this.stage = ClimbDom.el("recStage");
        this.speedBest = ClimbDom.el("recSpeedBest");
        this.heightWorld = new ClimbRecordCell("recWorld", "recWorldWho");
        this.heightClass = new ClimbRecordCell("recClass", "recClassWho", "recClassBox");
        this.speedWorld = new ClimbRecordCell("recSpeedWorld", "recSpeedWorldWho");
        this.speedClass = new ClimbRecordCell("recSpeedClass", "recSpeedClassWho", "recSpeedClassBox");
        this.board = new ClimbSpeedBoard(level);
    }
    paint(records, speed) {
        this.best.textContent = records.best.h ? records.best.h + "m" : "-";
        this.stage.textContent = records.best.s + " / " + ClimbBalance.STAGE_COUNT;
        this.speedBest.textContent = speed.seconds ? ClimbText.clock(speed.seconds) : "-";
        this.heightWorld.paint(records.world);
        this.heightClass.paint(records.world ? records.world.cls : null);
        this.speedWorld.paint(speed.world);
        this.speedClass.paint(speed.world ? speed.world.cls : null);
        this.board.paint(speed.world);
    }
}
