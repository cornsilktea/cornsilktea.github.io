"use strict";
class WbPlayOptions {
    constructor(search) {
        const params = new URLSearchParams(search);
        const saved = WbPlayOptions.load();
        this.seed = Number(params.get("seed")) || Math.floor(Math.random() * 1e9);
        this.mapId = params.get("map") || saved.map || WbMapCatalog.RANDOM;
        this.mode = (params.get("mode") || saved.mode) === "team" ? "team" : "solo";
        const botLimit = this.mode === "solo" ? WbBalance.MAX_PLAYERS - 1 : WbBalance.TEAM_COUNT - 1;
        const defaultBots = this.mode === "solo" ? 3 : 1;
        this.bots = Math.max(1, Math.min(botLimit, Number(params.get("bots")) || saved.bots || defaultBots));
        const level = params.get("level") || saved.level;
        this.level = level === "easy" || level === "hard" ? level : "normal";
        this.speed = Math.max(0.25, Math.min(8, Number(params.get("speed")) || 1));
        this.skipTo = Math.max(0, Math.min(WbBalance.MATCH, Number(params.get("at")) || 0));
        this.watch = params.has("watch");
        if (params.get("trap") === "hit")
            WbAvatarView.trapClip = "Hit_B";
    }
    static load() {
        try {
            const raw = localStorage.getItem(WbPlayOptions.STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        }
        catch (error) {
            return {};
        }
    }
    save() {
        try {
            localStorage.setItem(WbPlayOptions.STORAGE_KEY, JSON.stringify({ map: this.mapId, mode: this.mode, bots: this.bots, level: this.level }));
        }
        catch (error) {
            return;
        }
    }
}
WbPlayOptions.STORAGE_KEY = "waterballoon_solo_v1";
class WbBotLooks {
    static make(seed) {
        const random = new WbSeededRandom(seed);
        const look = CharacterLooks.createDefault();
        look.c = random.int(CharacterCatalog.RANDOM_TYPE_COUNT);
        CharacterCatalog.COLOR_PARTS.forEach((part) => { look.p[part.key] = random.next() < 0.15 ? 0 : 1 + random.int(part.set.length); });
        return look;
    }
}
class WbSoloRoster {
    static build(mode, nick, bots) {
        let n = 0;
        const next = () => WbRosterPlanner.botMember(++n);
        const me = { id: WbSoloRoster.MY_ID, nick, bot: false };
        if (mode === "solo")
            return [{ color: 0, members: [me] }, ...Array.from({ length: bots }, (_, k) => ({ color: k + 1, members: [next()] }))];
        return [{ color: 0, members: [me, next()] }, ...Array.from({ length: bots }, (_, k) => ({ color: k + 1, members: [next(), next()] }))];
    }
}
WbSoloRoster.MY_ID = "me";
class WbInput {
    constructor(joystick) {
        this.joystick = joystick;
        this.buffer = new WbTurnBuffer();
        this.presses = 0;
        this.body = () => ({ x: 0, z: 0 });
    }
    now() { return performance.now() / 1000; }
    direction(dir, down) {
        if (down)
            this.buffer.press(dir, this.body());
        else
            this.buffer.release(dir, this.body(), this.now());
    }
    action() { this.presses++; }
    intent() {
        const steer = this.joystick.active ? this.joystick.read() : this.buffer.read(this.now());
        return { move: steer.move, alt: steer.alt, kPress: this.presses };
    }
    reset() { this.buffer.clear(); this.joystick.reset(); }
}
class WbLocalPilot {
    constructor(input) {
        this.input = input;
        this.bot = false;
    }
    decide() { return this.input.intent(); }
}
class WbLocalLead {
    constructor(engine, index, input) {
        this.engine = engine;
        this.index = index;
        this.input = input;
    }
    position(tickTime) {
        const e = this.engine, p = e.players[this.index];
        const body = { x: p.x, z: p.z };
        if (p.life === "out" || e.tick < 0 || e.ended)
            return body;
        const f = Math.max(0, Math.min(1, tickTime - e.tick));
        const intent = this.input.intent();
        WbMover.advance(e, p.index, body, intent.move, intent.alt, p.speed() * WbBalance.DT * f);
        return body;
    }
}
class WbMatchDriver {
    update(dt) { return this.engine.update(dt); }
}
class WbSoloDriver extends WbMatchDriver {
    constructor(options, seed, profile, input) {
        super();
        const teams = WbSoloRoster.build(options.mode, profile.nickOrDefault(), options.bots);
        this.engine = new WbEngine({ seed, lootSeed: seed ^ 0x1007, mode: options.mode, teams });
        this.myIndex = this.engine.players.findIndex((p) => p.id === WbSoloRoster.MY_ID);
        this.engine.players.forEach((p) => this.engine.attach(p.index, p.bot ? new WbBotBrain(p.index, options.level, seed) : new WbLocalPilot(input)));
        this.looks = this.engine.players.map((p) => p.bot ? WbBotLooks.make(seed + p.index * 7919) : profile.look);
    }
}
class WbWatchDriver extends WbMatchDriver {
    constructor(options, seed) {
        super();
        this.myIndex = -1;
        const count = options.mode === "solo" ? options.bots + 1 : (options.bots + 1) * 2;
        this.engine = new WbEngine({ seed, lootSeed: seed ^ 0x1007, mode: options.mode, teams: WbRosterPlanner.allBots(options.mode, count) });
        this.engine.players.forEach((p) => this.engine.attach(p.index, new WbBotBrain(p.index, options.level, seed)));
        this.looks = this.engine.players.map((p) => WbBotLooks.make(seed + p.index * 7919));
    }
}
class WbMatchView {
    constructor(driver, world, ui) {
        this.driver = driver;
        this.world = world;
        this.ui = ui;
        this.endedAt = -1;
        this.resultShown = false;
        this.tenWarned = false;
        this.lastCount = "";
        this.watched = Math.max(0, driver.myIndex);
        this.markWatched();
    }
    get engine() { return this.driver.engine; }
    get mine() { return this.driver.myIndex >= 0 && this.watched === this.driver.myIndex; }
    get finished() { return this.resultShown; }
    get spectating() { const me = this.engine.players[this.driver.myIndex]; return !me || me.life === "out"; }
    markWatched() {
        const match = this.world.current;
        if (match)
            match.avatars.forEach((a, k) => { a.watched = k === this.watched; });
    }
    cycle(delta) {
        const n = this.engine.players.length;
        const me = this.engine.players[this.driver.myIndex];
        if (me && me.life !== "out")
            return;
        for (let k = 1; k <= n; k++) {
            const next = (this.watched + delta * k + n * 4) % n;
            if (this.engine.players[next].life !== "out") {
                this.watched = next;
                break;
            }
        }
        this.markWatched();
    }
    frame(dt, nowMs) {
        const events = this.driver.update(dt);
        this.world.react(events, nowMs);
        this.reactUi(events, nowMs);
        this.world.render(dt, nowMs);
        const watched = this.engine.players[this.watched] || null;
        this.ui.hud.update(this.engine, watched, this.mine);
        this.updateButton();
        this.updateCount();
        if (this.engine.ended && this.endedAt < 0)
            this.endedAt = nowMs;
        if (this.endedAt >= 0 && !this.resultShown && nowMs - this.endedAt > WbMatchView.RESULT_DELAY_MS) {
            this.resultShown = true;
            this.world.playing = false;
            this.ui.result.show(this.engine, this.driver.myIndex);
        }
    }
    updateButton() {
        const me = this.engine.players[this.driver.myIndex];
        WbDom.show(WbDom.el("controls"), !!me && me.life !== "out" && !this.engine.ended);
        if (!me)
            return;
        if (me.life === "trapped")
            this.ui.button.show(me.needles > 0 ? "needle" : "empty", me.needles);
        else {
            const left = me.balloonsMax - this.engine.activeBalloons(me.index);
            this.ui.button.show(left > 0 && me.life === "alive" ? "balloon" : "empty", Math.max(0, left));
        }
    }
    updateCount() {
        const e = this.engine, s = e.seconds;
        let text = "";
        if (e.tick < 0)
            text = String(Math.ceil(-s));
        else if (s < WbMatchView.START_SHOW)
            text = "시작!";
        else if (!e.ended && s >= WbBalance.MATCH - WbBalance.FINAL_COUNT)
            text = String(Math.ceil(WbBalance.MATCH - s));
        if (text && text !== this.lastCount)
            this.ui.sound.beep(text === "시작!");
        this.lastCount = text;
        this.ui.count.set(text);
        if (!this.tenWarned && s >= WbBalance.MATCH - 10) {
            this.tenWarned = true;
            this.ui.banner.show("10초 남음", true);
        }
    }
    headAt(index) {
        const match = this.world.current;
        const avatar = match ? match.avatarAt(index) : null;
        if (!avatar)
            return null;
        return this.world.project(avatar.root.position.x, 2.9, avatar.root.position.z);
    }
    nick(index) {
        const p = this.engine.players[index];
        return p ? p.nick : "";
    }
    reactUi(events, nowMs) {
        const me = this.driver.myIndex, ui = this.ui;
        let blasts = 0;
        for (const ev of events) {
            if (ev.t === "blast")
                blasts++;
            if (ev.t === "place" && ev.by === me)
                ui.sound.place();
            if (ev.t === "noPlace" && ev.by === me) {
                ui.sound.noPlace();
                ui.button.shake();
            }
            if (ev.t === "trap") {
                ui.sound.trap();
                if (ev.id === me) {
                    WbVibration.trap();
                    ui.banner.show("갇혔어요!", true, 1200);
                }
                else
                    ui.banner.show(this.nick(ev.id) + " 님이 갇혔습니다", false, 1200);
            }
            if (ev.t === "rescue") {
                ui.sound.rescue();
                ui.banner.show(this.nick(ev.id) + (ev.needle ? " 님 바늘 탈출!" : " 님 구출!"), false, 1200);
            }
            if (ev.t === "out") {
                ui.sound.pop();
                ui.banner.show(this.nick(ev.id) + " 님 탈락", ev.id === me, 1400);
                if (ev.id === this.watched)
                    window.setTimeout(() => this.cycle(1), 1200);
            }
            if (ev.t === "pick") {
                if (ev.by === me)
                    ui.sound.pick(ev.grade > 0);
                const at = this.headAt(ev.by);
                if (at)
                    ui.floats.spawn(at.x, at.y, this.pickText(ev.kind, ev.gain, ev.max), ev.max ? "max" : "grade" + ev.grade);
            }
            if (ev.t === "sudden") {
                ui.sound.warn();
                ui.banner.show("서든데스!", true, 2000);
            }
        }
        if (blasts)
            ui.sound.blast(blasts, nowMs);
    }
    pickText(kind, gain, max) {
        if (max)
            return "MAX";
        const icon = WbMatchView.ICONS[kind];
        if (icon)
            return "+" + gain + " " + icon;
        return WbHud.ITEM_NAMES[kind] + "!";
    }
}
WbMatchView.RESULT_DELAY_MS = 2000;
WbMatchView.START_SHOW = 0.8;
WbMatchView.ICONS = { balloon: "💧", range: "물줄기", shoe: "👟", needle: "📌" };
class WbGameUi {
    constructor(onAction) {
        this.hud = new WbHud();
        this.banner = new WbBanner();
        this.count = new WbBigCount();
        this.floats = new WbFloatText();
        this.sound = new WbSound();
        this.result = new WbResultBoard();
        this.joystick = new WbJoystick(WbDom.el("touchZone"));
        this.button = new WbActionButton(onAction);
    }
}
class WbGame {
    constructor(libs) {
        this.libs = libs;
        this.options = new WbPlayOptions(location.search);
        this.touch = matchMedia("(pointer: coarse)").matches;
        this.world = null;
        this.ui = null;
        this.input = null;
        this.profile = null;
        this.view = null;
        this.lastMs = 0;
        this.seed = this.options.seed;
        this.start().catch((error) => { WbDom.text(WbDom.el("loading"), "불러오기 실패: " + error); });
    }
    async start() {
        const assets = new CharacterAssets(this.libs);
        await assets.load();
        const library = new WbModelLibrary(this.libs);
        await library.load(assets.clips);
        const factory = new CharacterModelFactory(this.libs, assets);
        this.world = new WbWorldView(this.libs, WbDom.el("view"), this.touch, library, factory);
        this.profile = new PlayerProfile();
        const ui = new WbGameUi(() => this.action());
        this.ui = ui;
        this.input = new WbInput(ui.joystick);
        new WbKeyboard({
            dir: (dir, down) => this.direction(dir, down),
            action: () => this.action(),
            other: (code) => this.otherKey(code),
        });
        WbDom.el("btnMute").addEventListener("click", () => this.toggleMute());
        WbDom.el("btnAgain").addEventListener("click", () => this.again());
        document.body.classList.toggle("touch", this.touch);
        WbDom.show(WbDom.el("loading"), false);
        this.options.save();
        this.newMatch();
        this.lastMs = performance.now();
        requestAnimationFrame((ms) => this.frame(ms));
    }
    direction(dir, down) {
        const view = this.view;
        if (view && view.spectating && down && WbDir.horizontal(dir)) {
            view.cycle(dir === WbDir.RIGHT ? 1 : -1);
            return;
        }
        if (this.input)
            this.input.direction(dir, down);
    }
    action() {
        if (this.view && this.view.finished) {
            this.again();
            return;
        }
        if (this.input)
            this.input.action();
    }
    otherKey(code) {
        if (code === "KeyN")
            this.again();
    }
    toggleMute() {
        if (!this.ui)
            return;
        const muted = this.ui.sound.toggle();
        WbDom.text(WbDom.el("btnMute"), muted ? "🔇" : "🔊");
    }
    again() {
        this.seed = (this.seed + 1) >>> 0;
        this.newMatch();
    }
    newMatch() {
        const world = this.world, ui = this.ui, input = this.input;
        input.reset();
        ui.result.hide();
        ui.banner.hide();
        const driver = this.options.watch ? new WbWatchDriver(this.options, this.seed) : new WbSoloDriver(this.options, this.seed, this.profile, input);
        const engine = driver.engine;
        while (!engine.ended && engine.seconds < this.options.skipTo)
            engine.step();
        const theme = WbMapCatalog.resolve(this.options.mapId, new WbSeededRandom(this.seed ^ 0x3A9));
        const match = world.show(theme, engine, driver.looks);
        const me = engine.players[driver.myIndex];
        input.body = () => me ? { x: me.x, z: me.z } : { x: 0, z: 0 };
        match.lead = me ? new WbLocalLead(engine, me.index, input) : null;
        world.playing = true;
        this.view = new WbMatchView(driver, world, ui);
        ui.hud.show(true);
    }
    frame(ms) {
        const dt = Math.min(0.1, (ms - this.lastMs) / 1000);
        this.lastMs = ms;
        if (this.view)
            this.view.frame(dt * this.options.speed, ms);
        requestAnimationFrame((next) => this.frame(next));
    }
}
