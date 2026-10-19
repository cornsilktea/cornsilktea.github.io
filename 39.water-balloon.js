"use strict";
class WbPlayOptions {
    constructor(search) {
        const params = new URLSearchParams(search);
        const saved = WbPlayOptions.load();
        this.seed = Number(params.get("seed")) || Math.floor(Math.random() * 1e9);
        this.mapId = params.get("map") || saved.map || WbMapCatalog.RANDOM;
        this.mode = (params.get("mode") || saved.mode) === "team" ? "team" : "solo";
        this.bots = WbPlayOptions.clampBots(this.mode, Number(params.get("bots")) || saved.bots || 0);
        this.level = WbPlayOptions.levelOf(params.get("level") || saved.level || "");
        this.speed = Math.max(0.25, Math.min(8, Number(params.get("speed")) || 1));
        this.skipTo = Math.max(0, Math.min(WbBalance.MATCH, Number(params.get("at")) || 0));
        this.watch = params.has("watch");
        this.autoSolo = params.has("solo") || this.watch;
        this.showNet = params.has("net");
        if (params.get("trap") === "hit")
            WbAvatarView.trapClip = "Hit_B";
    }
    static clampBots(mode, bots) {
        const limit = mode === "solo" ? WbBalance.MAX_PLAYERS - 1 : WbBalance.TEAM_COUNT - 1;
        return Math.max(1, Math.min(limit, bots || (mode === "solo" ? 3 : 1)));
    }
    static levelOf(text) { return text === "easy" || text === "hard" ? text : "normal"; }
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
    constructor() {
        this.online = false;
    }
    get source() { return this.engine; }
    lead(input) {
        const me = this.engine.players[this.myIndex];
        return me ? new WbLocalLead(this.engine, me.index, input) : null;
    }
    update(dt, nowMs) { return this.engine.update(dt); }
}
class WbSoloDriver extends WbMatchDriver {
    constructor(options, seed, profile, input) {
        super();
        const teams = WbSoloRoster.build(options.mode, profile.nickOrDefault(), options.bots);
        this.engine = new WbEngine({ seed, lootSeed: seed ^ 0x1007, mode: options.mode, teams });
        this.myIndex = this.engine.players.findIndex((p) => p.id === WbSoloRoster.MY_ID);
        this.engine.players.forEach((p) => this.engine.attach(p.index, p.bot ? new WbBotBrain(p.index, options.level, seed) : new WbLocalPilot(input)));
        this.looks = this.engine.players.map((p) => p.bot ? WbBotLooks.make(seed + p.index * 7919) : profile.look);
        this.mapId = WbMapCatalog.resolve(options.mapId, new WbSeededRandom(seed ^ 0x3A9)).id;
    }
}
class WbWatchDriver extends WbMatchDriver {
    constructor(mode, count, level, seed, mapId) {
        super();
        this.mapId = mapId;
        this.myIndex = -1;
        this.engine = new WbEngine({ seed, lootSeed: seed ^ 0x1007, mode, teams: WbRosterPlanner.allBots(mode, count) });
        this.engine.players.forEach((p) => this.engine.attach(p.index, new WbBotBrain(p.index, level, seed)));
        this.looks = this.engine.players.map((p) => WbBotLooks.make(seed + p.index * 7919));
    }
}
class WbHostDriver extends WbMatchDriver {
    constructor(match, session, input, meter, level, looks) {
        super();
        this.match = match;
        this.looks = looks;
        this.online = true;
        this.engine = new WbEngine({ seed: match.seed, lootSeed: Math.floor(Math.random() * 1e9), mode: match.mode, teams: match.teams });
        this.link = new WbHostLink(this.engine, session, match, meter);
        this.mapId = match.map;
        let mine = -1;
        this.engine.players.forEach((p) => {
            if (p.bot)
                this.engine.attach(p.index, new WbBotBrain(p.index, level, match.seed));
            else if (p.id === session.myId) {
                this.engine.attach(p.index, new WbLocalPilot(input));
                mine = p.index;
            }
            else {
                const pilot = new WbRemotePilot();
                this.engine.attach(p.index, pilot);
                this.link.remote.set(p.index, pilot);
                p.external = true;
            }
        });
        this.myIndex = mine;
    }
    receiveState(id, raw, nowMs) {
        const p = this.engine.players.find((x) => x.id === id);
        if (p)
            this.link.receive(p.index, raw, nowMs);
    }
    playerLeft(id) {
        const p = this.engine.players.find((x) => x.id === id);
        if (p && !p.bot)
            this.engine.disconnect(p.index);
    }
    update(dt, nowMs) {
        const events = this.engine.update(dt, (list, tick) => this.link.collect(list, tick));
        this.link.publish(nowMs);
        return events;
    }
}
class WbGuestDriver extends WbMatchDriver {
    constructor(match, session, input, meter, looks) {
        super();
        this.match = match;
        this.session = session;
        this.input = input;
        this.meter = meter;
        this.looks = looks;
        this.online = true;
        this.body = null;
        this.myIndex = match.teams.flatMap((t) => t.members).findIndex((m) => m.id === session.myId);
        this.mirror = new WbMirror(match, this.myIndex);
        this.mapId = match.map;
    }
    get engine() { return this.mirror.engine; }
    get source() { return this.mirror; }
    lead(input) {
        if (this.myIndex < 0)
            return null;
        this.body = new WbGuestBody(this.mirror, this.myIndex, input, this.session, this.meter);
        return this.body;
    }
    update(dt, nowMs) {
        const m = this.mirror, s = this.session;
        m.applySnap(s.value("snap"), nowMs);
        const events = m.takeEvents(s.value("ev"));
        m.applyBoard(s.value("board"));
        m.applyEnd(s.value("end"));
        m.advance(nowMs, dt);
        if (this.body)
            this.body.step(Math.min(0.1, dt), nowMs);
        return events;
    }
}
class WbMatchView {
    constructor(driver, world, ui, input) {
        this.driver = driver;
        this.world = world;
        this.ui = ui;
        this.endedAt = -1;
        this.resultShown = false;
        this.tenWarned = false;
        this.lastCount = "";
        const theme = WbMapCatalog.find(driver.mapId);
        const match = world.show(theme, driver.source, driver.looks);
        match.lead = driver.lead(input);
        const me = driver.engine.players[driver.myIndex];
        input.reset();
        input.body = () => me ? { x: me.x, z: me.z } : { x: 0, z: 0 };
        world.playing = true;
        ui.result.hide();
        ui.banner.hide();
        ui.hud.show(true);
        this.watched = Math.max(0, driver.myIndex);
        this.markWatched();
        const first = driver.engine.players[this.watched];
        if (first && first.life === "out")
            this.cycle(1);
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
        if (!this.spectating)
            return;
        const n = this.engine.players.length;
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
        const events = this.driver.update(dt, nowMs);
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
            if (!this.engine.ranks.length)
                this.engine.ranks = WbScoreboard.ranks(this.engine);
            this.ui.result.show(this.engine, this.driver.myIndex);
            const match = this.world.current;
            if (match)
                match.cheer(this.engine.ranks);
        }
        const panel = this.spectating && !this.resultShown;
        this.ui.spectators.show(panel);
        document.body.classList.toggle("spectating", panel);
        if (panel)
            this.ui.spectators.render(this.engine, this.watched);
    }
    pick(index) {
        if (!this.spectating || !this.engine.players[index])
            return;
        this.watched = index;
        this.markWatched();
    }
    dispose() {
        this.world.clear();
        this.world.playing = false;
        this.ui.result.hide();
        this.ui.banner.hide();
        this.ui.count.set("");
        this.ui.hud.show(false);
        this.ui.spectators.show(false);
        document.body.classList.remove("spectating");
        WbDom.show(WbDom.el("controls"), false);
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
            text = String(Math.max(1, Math.ceil(-s)));
        else if (s < WbMatchView.START_SHOW)
            text = "시작!";
        else if (!e.ended && s >= WbBalance.MATCH - WbBalance.FINAL_COUNT)
            text = String(Math.max(1, Math.ceil(WbBalance.MATCH - s)));
        if (text && text !== this.lastCount)
            this.ui.sound.beep(text === "시작!");
        this.lastCount = text;
        this.ui.count.set(text);
        if (!this.tenWarned && s >= WbBalance.MATCH - 10 && !e.ended) {
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
                ui.banner.show(this.nick(ev.id) + (ev.why === "left" ? " 님 연결 끊김" : " 님 탈락"), ev.id === me, 1400);
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
        this.spectators = new WbSpectatorPanel();
        this.joystick = new WbJoystick(WbDom.el("touchZone"));
        this.button = new WbActionButton(onAction);
    }
}
class WbMenuBackdrop {
    constructor(world) {
        this.world = world;
        this.driver = null;
        this.angle = 0;
        this.seed = Math.floor(Math.random() * 1e9);
    }
    stop() { if (this.driver) {
        this.world.clear();
        this.driver = null;
    } }
    frame(dt, nowMs) {
        if (!this.driver || this.driver.engine.ended) {
            this.seed = (this.seed + 1) >>> 0;
            this.driver = new WbWatchDriver("solo", WbMenuBackdrop.BOTS, "normal", this.seed, "classroom");
            this.world.show(WbMapCatalog.find("classroom"), this.driver.engine, this.driver.looks);
            this.world.playing = false;
        }
        this.world.react(this.driver.update(dt, nowMs), nowMs);
        this.angle += dt * WbMenuBackdrop.SPIN;
        this.world.render(dt, nowMs);
        this.world.rig.orbit(this.angle, WbMenuBackdrop.RADIUS, WbMenuBackdrop.HEIGHT);
    }
}
WbMenuBackdrop.RADIUS = 34;
WbMenuBackdrop.HEIGHT = 30;
WbMenuBackdrop.SPIN = 0.05;
WbMenuBackdrop.BOTS = 4;
class WbLobbyView {
    constructor() {
        this.onSeat = () => undefined;
        this.onBot = () => undefined;
        WbDom.el("lobbySeats").addEventListener("click", (e) => {
            const target = e.target;
            const bot = target.closest("[data-bot]");
            if (bot) {
                this.onBot(Number(bot.dataset.bot));
                return;
            }
            const seat = target.closest("[data-slot]");
            if (seat)
                this.onSeat(Number(seat.dataset.slot));
        });
    }
    static modeOf(session) { return session.value("mode") === "team" ? "team" : "solo"; }
    static botsOf(session) { const list = session.value("bots"); return Array.isArray(list) ? list.slice() : []; }
    static humans(session, plan) {
        const list = [];
        plan.humanSeats(session.players).forEach((id, slot) => { if (id)
            list.push({ id, nick: session.players.get(id).nick, slot }); });
        return list;
    }
    render(session, plan) {
        const mode = WbLobbyView.modeOf(session), host = session.isHost(), bots = WbLobbyView.botsOf(session);
        WbDom.text(WbDom.el("lobbyCode"), session.code);
        WbDom.text(WbDom.el("lobbyMode"), mode === "team" ? "팀전 (2명씩)" : "개인전");
        const seats = plan.humanSeats(session.players);
        let html = "";
        for (let slot = 0; slot < WbRoomRules.SEATS; slot++) {
            const team = WbRoomRules.teamOfSlot(mode, slot), color = WbPalette.teamColor(mode, team);
            const id = seats[slot], record = id ? session.players.get(id) : null;
            const head = mode === "team" && slot % 2 === 0 ? "<div class=\"seatTeam\" style=\"background:" + color + "\">" + WbLobbyView.TEAM_NAMES[team] + "팀</div>" : "";
            const botHere = bots.indexOf(mode === "team" ? team : slot) >= 0;
            let inner = "<span class=\"empty\">빈자리</span>";
            if (record)
                inner = WbDom.esc(record.nick) + (id === session.hostId ? " 👑" : "");
            else if (botHere)
                inner = "봇" + (host ? " <button type=\"button\" class=\"seatBot\" data-bot=\"" + slot + "\">×</button>" : "");
            else if (host)
                inner += " <button type=\"button\" class=\"seatBot\" data-bot=\"" + slot + "\">+봇</button>";
            html += head + "<div class=\"seat" + (record ? " taken" : "") + (id === session.myId ? " mine" : "") + "\" data-slot=\"" + slot + "\" style=\"border-color:" + color + ";background:" + (record || botHere ? color : color + "26") + "\">" + inner + "</div>";
        }
        WbDom.html(WbDom.el("lobbySeats"), html);
        const watchers = plan.spectators(session.players).map((sid) => WbDom.esc(session.players.get(sid).nick));
        WbDom.html(WbDom.el("lobbySpectators"), "관전: " + (watchers.length ? watchers.join(", ") : "<span class=\"empty\">없음</span>"));
        WbDom.show(WbDom.el("btnStart"), host);
        WbDom.show(WbDom.el("lobbyHostRow"), host);
        WbDom.show(WbDom.el("lobbyGuestRow"), !host);
        const map = session.value("map") || WbMapCatalog.RANDOM, level = WbPlayOptions.levelOf(session.value("level") || "");
        WbDom.el("lobbyMap").value = map;
        WbDom.el("lobbyLevel").value = level;
        WbDom.text(WbDom.el("lobbyGuestInfo"), "맵: " + (map === WbMapCatalog.RANDOM ? "무작위" : WbMapCatalog.find(map).title) + " · 봇: " + WbBotTuning.LABELS[level]);
        WbDom.text(WbDom.el("btnSeatMode"), session.isSpectator() ? "선수로 참가" : "관전자로 보기");
        const humans = WbLobbyView.humans(session, plan);
        const roster = WbRosterPlanner.fill(mode, humans, bots);
        const botCount = roster.reduce((a, t) => a + t.members.filter((m) => m.bot).length, 0);
        WbDom.el("btnStart").disabled = humans.length < 1;
        WbDom.text(WbDom.el("lobbyHint"), host ? "사람 " + humans.length + "명 + 봇 " + botCount + "명으로 시작해요." : "방장이 시작하길 기다려요…");
    }
}
WbLobbyView.TEAM_NAMES = ["빨강", "파랑", "노랑", "초록"];
class WbGame {
    constructor(libs) {
        this.libs = libs;
        this.options = new WbPlayOptions(location.search);
        this.touch = matchMedia("(pointer: coarse)").matches;
        this.backend = new RkBackend();
        this.directory = new RkDirectory(this.backend, WbRoomRules.RULES);
        this.seatPlan = new RkSeatPlan(WbRoomRules.RULES);
        this.meter = new WbNetMeter();
        this.myId = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        this.lobby = null;
        this.world = null;
        this.ui = null;
        this.input = null;
        this.profile = null;
        this.editor = null;
        this.backdrop = null;
        this.session = null;
        this.view = null;
        this.practice = false;
        this.holding = false;
        this.matchId = 0;
        this.lastMs = 0;
        this.leaveAskedAt = -1;
        this.start().catch((error) => { WbDom.text(WbDom.el("loading"), "불러오기 실패: " + error); });
    }
    async start() {
        const assets = new CharacterAssets(this.libs);
        await assets.load();
        const library = new WbModelLibrary(this.libs);
        await library.load(assets.clips);
        const factory = new CharacterModelFactory(this.libs, assets);
        this.world = new WbWorldView(this.libs, WbDom.el("view"), this.touch, library, factory);
        this.backdrop = new WbMenuBackdrop(this.world);
        this.profile = new PlayerProfile();
        this.editor = new ProfileEditor(this.libs, factory, assets, this.profile);
        this.editor.onChange(() => this.pushProfile());
        FoldCard.bindAll(document);
        const ui = new WbGameUi(() => this.action());
        this.ui = ui;
        ui.spectators.onPick((index) => { if (this.view)
            this.view.pick(index); });
        this.input = new WbInput(ui.joystick);
        this.lobby = new WbLobbyView();
        this.lobby.onSeat = (slot) => this.clickSeat(slot);
        this.lobby.onBot = (slot) => this.toggleBot(slot);
        new WbKeyboard({ dir: (dir, down) => this.direction(dir, down), action: () => this.action(), other: (code) => this.otherKey(code) });
        this.bindMenus();
        document.body.classList.toggle("touch", this.touch);
        WbDom.show(WbDom.el("loading"), false);
        window.addEventListener("pagehide", () => { if (this.session)
            this.session.removeMineOnUnload(); });
        this.fillSoloForm();
        if (this.options.autoSolo)
            this.startSolo();
        else {
            this.showScreen("start");
            this.updateStartButtons();
        }
        this.lastMs = performance.now();
        requestAnimationFrame((ms) => this.frame(ms));
        window.setInterval(() => { const now = performance.now(); if (now - this.lastMs > WbGame.STALL_MS)
            this.step(now); }, WbGame.WATCHDOG_MS);
    }
    bindMenus() {
        const on = (id, fn) => WbDom.el(id).addEventListener("click", fn);
        on("btnSolo", () => { this.readSoloForm(); this.startSolo(); });
        on("btnCreateSolo", () => this.createRoom("solo"));
        on("btnCreateTeam", () => this.createRoom("team"));
        on("btnJoin", () => this.joinRoom(false));
        on("btnWatch", () => this.joinRoom(true));
        WbDom.el("joinCode").addEventListener("keydown", (e) => { if (e.key === "Enter")
            this.joinRoom(false); });
        on("btnStart", () => this.startMatch());
        on("btnLeave", () => this.leaveRoom(""));
        on("btnSeatMode", () => this.toggleSeatMode());
        on("btnModeToggle", () => this.toggleMode());
        on("btnAgain", () => this.afterResult());
        on("btnResultLeave", () => this.leaveRoom(""));
        on("btnGameLeave", () => this.askLeave());
        on("btnMute", () => this.toggleMute());
        WbDom.el("lobbyMap").addEventListener("change", () => this.writeHostValue("map", WbDom.el("lobbyMap").value));
        WbDom.el("lobbyLevel").addEventListener("change", () => this.writeHostValue("level", WbDom.el("lobbyLevel").value));
        WbDom.el("soloMode").addEventListener("change", () => this.refreshBotChoices());
    }
    fillSoloForm() {
        WbDom.el("soloMode").value = this.options.mode;
        this.refreshBotChoices();
        WbDom.el("soloBots").value = String(this.options.bots);
        WbDom.el("soloLevel").value = this.options.level;
        WbDom.el("soloMap").value = this.options.mapId;
    }
    refreshBotChoices() {
        const mode = WbDom.el("soloMode").value === "team" ? "team" : "solo";
        const select = WbDom.el("soloBots"), keep = Number(select.value) || 0;
        const limit = mode === "solo" ? WbBalance.MAX_PLAYERS - 1 : WbBalance.TEAM_COUNT - 1;
        select.innerHTML = Array.from({ length: limit }, (_, k) => "<option value=\"" + (k + 1) + "\">봇 " + (k + 1) + (mode === "solo" ? "명" : "팀") + "</option>").join("");
        select.value = String(WbPlayOptions.clampBots(mode, keep));
    }
    readSoloForm() {
        const o = this.options;
        o.mode = WbDom.el("soloMode").value === "team" ? "team" : "solo";
        o.bots = WbPlayOptions.clampBots(o.mode, Number(WbDom.el("soloBots").value));
        o.level = WbPlayOptions.levelOf(WbDom.el("soloLevel").value);
        o.mapId = WbDom.el("soloMap").value || WbMapCatalog.RANDOM;
        o.save();
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
            if (this.practice || this.holding || !this.session || this.session.isHost())
                this.afterResult();
            return;
        }
        if (this.input)
            this.input.action();
    }
    otherKey(code) {
        if (code === "KeyN" && this.practice)
            this.afterResult();
    }
    toggleMute() {
        if (!this.ui)
            return;
        WbDom.text(WbDom.el("btnMute"), this.ui.sound.toggle() ? "🔇" : "🔊");
    }
    askLeave() {
        const button = WbDom.el("btnGameLeave"), now = performance.now();
        if (this.leaveAskedAt >= 0 && now - this.leaveAskedAt < WbGame.LEAVE_CONFIRM_MS) {
            this.resetLeave();
            this.leaveRoom("");
            return;
        }
        this.leaveAskedAt = now;
        button.classList.add("confirm");
        WbDom.text(button, "한 번 더 누르면 나가요");
        window.setTimeout(() => { if (performance.now() - this.leaveAskedAt >= WbGame.LEAVE_CONFIRM_MS - 50)
            this.resetLeave(); }, WbGame.LEAVE_CONFIRM_MS);
    }
    resetLeave() {
        this.leaveAskedAt = -1;
        const button = WbDom.el("btnGameLeave");
        button.classList.remove("confirm");
        WbDom.text(button, this.practice ? "나가기" : "방 나가기");
    }
    showScreen(name) {
        WbDom.show(WbDom.el("btnGameLeave"), name === "game");
        this.resetLeave();
        WbDom.show(WbDom.el("startScreen"), name === "start");
        WbDom.show(WbDom.el("lobbyScreen"), name === "lobby");
        WbDom.show(WbDom.el("touchZone"), name === "game");
        if (name !== "game") {
            WbDom.show(WbDom.el("controls"), false);
            if (this.ui)
                this.ui.hud.show(false);
        }
        const editor = this.editor;
        if (!editor)
            return;
        if (name === "game") {
            editor.setActive(false);
            return;
        }
        editor.mount(WbDom.el(name === "start" ? "profileHost" : "lobbyProfileHost"));
        editor.setActive(true);
    }
    pushProfile() {
        const profile = this.profile;
        if (this.session && profile)
            this.session.pushProfile({ nick: profile.nickOrDefault(), look: profile.look });
    }
    updateStartButtons() {
        const ok = !!this.backend.database;
        ["btnCreateSolo", "btnCreateTeam", "btnJoin", "btnWatch"].forEach((id) => { WbDom.el(id).disabled = !ok; });
        if (!ok)
            this.startMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인) 혼자 하기는 할 수 있어요.");
    }
    startMessage(text) { WbDom.text(WbDom.el("startMsg"), text); }
    myRecord() {
        const profile = this.profile;
        return { nick: profile.nickOrDefault(), isBot: false, joinedAt: this.backend.now(), slot: 0, look: profile.look, spectator: false };
    }
    async createRoom(mode) {
        if (!this.backend.database)
            return;
        this.startMessage("");
        try {
            const code = await this.directory.create(this.myId, this.myRecord());
            if (!code) {
                this.startMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
                return;
            }
            this.enterRoom(code, true);
            this.session.ref.update({ mode, map: WbMapCatalog.RANDOM, level: "normal", bots: [] });
        }
        catch (error) {
            this.startMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
        }
    }
    async joinRoom(asSpectator) {
        if (!this.backend.database)
            return;
        const code = WbDom.el("joinCode").value.replace(/\D/g, "");
        if (code.length !== 5) {
            this.startMessage("방 코드 5자리를 입력해 주세요.");
            return;
        }
        this.startMessage("");
        try {
            const outcome = await this.directory.join(code, this.myId, this.myRecord(), asSpectator);
            if (outcome.ok) {
                this.enterRoom(code, false);
                WbDom.text(WbDom.el("lobbyNotice"), outcome.message);
            }
            else
                this.startMessage(outcome.message);
        }
        catch (error) {
            this.startMessage("방을 불러오지 못했어요.");
        }
    }
    enterRoom(code, hosting) {
        if (this.backdrop)
            this.backdrop.stop();
        const session = new RkSession(this.backend, WbRoomRules.RULES, code, this.myId, hosting, WbRoomRules.VALUES);
        this.session = session;
        this.practice = false;
        session.onChange = (kind) => this.onSessionChange(kind);
        session.onRemoteState = (id, raw) => { if (this.view && this.view.driver instanceof WbHostDriver)
            this.view.driver.receiveState(id, raw, performance.now()); };
        session.onPlayerRemoved = (id) => this.playerRemoved(id);
        session.onClosed = (message) => this.exitToStart(message);
        session.connect();
        this.showScreen("lobby");
        this.lobby.render(session, this.seatPlan);
    }
    playerRemoved(id) {
        const session = this.session;
        if (this.view && this.view.driver instanceof WbHostDriver)
            this.view.driver.playerLeft(id);
        if (session && session.isHost() && session.status === "lobby")
            this.pruneBots();
    }
    onSessionChange(kind) {
        const session = this.session;
        if (!session)
            return;
        if (!this.view && kind !== "snap" && kind !== "ev" && kind !== "board")
            this.lobby.render(session, this.seatPlan);
        if (kind === "status" || kind === "match" || kind === "players")
            this.syncPhase();
    }
    syncPhase() {
        const session = this.session, ui = this.ui, world = this.world, input = this.input;
        if (!session || !ui || !world || !input)
            return;
        const match = session.value("match");
        if (session.status === "lobby") {
            if (this.view && this.view.finished && session.isSpectator() && !this.holding) {
                this.holding = true;
                WbDom.show(WbDom.el("btnAgain"), true);
                WbDom.text(WbDom.el("btnAgain"), "대기실로");
                return;
            }
            if (this.holding)
                return;
            if (this.view) {
                this.view.dispose();
                this.view = null;
            }
            this.showScreen("lobby");
            this.lobby.render(session, this.seatPlan);
            return;
        }
        if ((session.status === "playing" || session.status === "ended") && match && match.id !== this.matchId && session.me()) {
            if (this.view)
                this.view.dispose();
            if (this.backdrop)
                this.backdrop.stop();
            this.holding = false;
            this.matchId = match.id;
            const looks = match.teams.flatMap((t) => t.members).map((m, k) => {
                const record = session.players.get(m.id);
                return record && !m.bot ? record.look : WbBotLooks.make(match.seed + k * 7919);
            });
            const level = WbPlayOptions.levelOf(session.value("level") || "");
            const driver = session.isHost() ? new WbHostDriver(match, session, input, this.meter, level, looks) : new WbGuestDriver(match, session, input, this.meter, looks);
            this.view = new WbMatchView(driver, world, ui, input);
            this.showScreen("game");
            ui.hud.show(true);
            WbDom.show(WbDom.el("btnAgain"), session.isHost());
            WbDom.text(WbDom.el("btnAgain"), "대기실로");
            WbDom.text(WbDom.el("btnResultLeave"), "방 나가기");
        }
    }
    startMatch() {
        const session = this.session;
        if (!session || !session.isHost() || session.status !== "lobby")
            return;
        const mode = WbLobbyView.modeOf(session);
        const humans = WbLobbyView.humans(session, this.seatPlan);
        if (!humans.length)
            return;
        const seed = Math.floor(Math.random() * 1e9);
        const map = WbMapCatalog.resolve(session.value("map") || WbMapCatalog.RANDOM, new WbSeededRandom(seed ^ 0x3A9)).id;
        const match = { id: 1 + Math.floor(Math.random() * 1e9), seed, mode, map, teams: WbRosterPlanner.fill(mode, humans, WbLobbyView.botsOf(session)), startAt: this.backend.now() };
        session.ref.update({ match, status: "playing", st: null, snap: null, ev: null, board: null, end: null });
    }
    afterResult() {
        if (this.practice) {
            this.options.seed = (this.options.seed + 1) >>> 0;
            this.startSolo();
            return;
        }
        if (this.holding) {
            this.holding = false;
            if (this.view) {
                this.view.dispose();
                this.view = null;
            }
            this.syncPhase();
            return;
        }
        const session = this.session;
        if (!session || !session.isHost())
            return;
        session.ref.update({ status: "lobby", match: null, st: null, snap: null, ev: null, board: null, end: null });
    }
    writeHostValue(name, value) {
        const session = this.session;
        if (session && session.isHost() && session.status === "lobby")
            session.writeValue(name, value);
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
        else
            session.ref.child("players/" + session.myId).update({ slot: WbRoomRules.SPECTATOR_SLOT, spectator: true });
    }
    toggleMode() {
        const session = this.session;
        if (!session || !session.isHost() || session.status !== "lobby")
            return;
        session.ref.update({ mode: WbLobbyView.modeOf(session) === "team" ? "solo" : "team", bots: [] });
    }
    clickSeat(slot) {
        const session = this.session;
        if (!session || session.status !== "lobby")
            return;
        if (this.seatPlan.humanSeats(session.players)[slot])
            return;
        session.ref.child("players/" + session.myId).update({ slot, spectator: false });
    }
    toggleBot(slot) {
        const session = this.session;
        if (!session || !session.isHost() || session.status !== "lobby")
            return;
        const mode = WbLobbyView.modeOf(session), key = WbRoomRules.teamOfSlot(mode, slot);
        const bots = WbLobbyView.botsOf(session), at = bots.indexOf(key);
        if (at >= 0)
            bots.splice(at, 1);
        else
            bots.push(key);
        session.writeValue("bots", bots);
    }
    pruneBots() {
        const session = this.session;
        if (!session)
            return;
        const mode = WbLobbyView.modeOf(session), seats = this.seatPlan.humanSeats(session.players);
        const bots = WbLobbyView.botsOf(session).filter((key) => mode === "team" || !seats[key]);
        if (bots.length !== WbLobbyView.botsOf(session).length)
            session.writeValue("bots", bots);
    }
    leaveRoom(message) {
        if (this.practice) {
            this.practice = false;
            if (this.view) {
                this.view.dispose();
                this.view = null;
            }
            this.showScreen("start");
            this.updateStartButtons();
            return;
        }
        if (this.session)
            this.session.leave();
        this.exitToStart(message);
    }
    exitToStart(message) {
        if (this.session)
            this.session.silentClose();
        this.session = null;
        this.holding = false;
        if (this.view) {
            this.view.dispose();
            this.view = null;
        }
        this.matchId = 0;
        this.showScreen("start");
        this.updateStartButtons();
        this.startMessage(message);
    }
    startSolo() {
        const ui = this.ui, world = this.world, input = this.input;
        if (this.view)
            this.view.dispose();
        if (this.backdrop)
            this.backdrop.stop();
        this.practice = true;
        const o = this.options;
        const driver = o.watch
            ? new WbWatchDriver(o.mode, o.mode === "solo" ? o.bots + 1 : (o.bots + 1) * 2, o.level, o.seed, WbMapCatalog.resolve(o.mapId, new WbSeededRandom(o.seed ^ 0x3A9)).id)
            : new WbSoloDriver(o, o.seed, this.profile, input);
        while (!driver.engine.ended && driver.engine.seconds < o.skipTo)
            driver.engine.step();
        this.view = new WbMatchView(driver, world, ui, input);
        this.showScreen("game");
        ui.hud.show(true);
        WbDom.show(WbDom.el("btnAgain"), true);
        WbDom.text(WbDom.el("btnAgain"), "다시 하기");
        WbDom.text(WbDom.el("btnResultLeave"), "나가기");
    }
    frame(ms) {
        requestAnimationFrame((next) => this.frame(next));
        this.step(ms);
    }
    step(ms) {
        const dt = Math.min(0.1, Math.max(0, (ms - this.lastMs) / 1000));
        this.lastMs = ms;
        if (this.view)
            this.view.frame(dt * (this.practice ? this.options.speed : 1), ms);
        else if (this.backdrop && this.world)
            this.backdrop.frame(dt, ms);
        this.meter.tick(ms);
        if (this.options.showNet)
            WbDom.text(WbDom.el("netMeter"), (this.meter.rate / 1024).toFixed(1) + " KB/s");
    }
}
WbGame.STALL_MS = 250;
WbGame.WATCHDOG_MS = 100;
WbGame.LEAVE_CONFIRM_MS = 3000;
