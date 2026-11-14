"use strict";
class BbLocalResume {
    static save(game) {
        try {
            sessionStorage.setItem(BbLocalResume.KEY, JSON.stringify(game));
        }
        catch (error) {
            return;
        }
    }
    static load() {
        try {
            const raw = sessionStorage.getItem(BbLocalResume.KEY), game = raw ? JSON.parse(raw) : null;
            return game && Array.isArray(game.log) && Array.isArray(game.teams) && !!BbAiLevel.ALL[game.level] ? game : null;
        }
        catch (error) {
            return null;
        }
    }
    static clear() {
        try {
            sessionStorage.removeItem(BbLocalResume.KEY);
        }
        catch (error) {
            return;
        }
    }
}
BbLocalResume.KEY = "baseballduel_local_v1";
class BbModeRules {
    static humanTeam(mode) { return BbModeRules.HUMAN_TEAM[mode]; }
    static aiLook(team) { return CharacterLooks.clean(team === 0 ? { c: 1, p: { skin: 3, hair: 2 } } : { c: 4, p: { skin: 1, hair: 5 } }); }
    static plan(game) {
        const human = BbModeRules.humanTeam(game.mode), level = BbAiLevel.ALL[game.level], rival = "AI " + level.label, mine = new PlayerProfile().look;
        return {
            format: new BbOneInningFormat(), teams: game.teams, names: human === 1 ? [rival, game.me] : [game.me, rival], seats: human === 1 ? ["ai", "human"] : ["human", "ai"],
            level, seed: game.seed, halvesToPlay: game.mode === "match" ? null : 1, log: game.log, view: null, autoSwingAt: null,
            looks: human === 1 ? [BbModeRules.aiLook(0), mine] : [mine, BbModeRules.aiLook(1)]
        };
    }
    static showcase(seed) {
        const team = () => (BbAiLevel.team("R"));
        return { format: new BbThreeInningFormat(), teams: [team(), team()], names: ["", ""], seats: ["ai", "ai"], level: BbAiLevel.ALL.normal, seed, halvesToPlay: null, log: [], view: "pitcher", autoSwingAt: null, looks: [BbModeRules.aiLook(0), BbModeRules.aiLook(1)] };
    }
}
BbModeRules.LABELS = { match: "일반", batting: "타격 연습", pitching: "투구 연습" };
BbModeRules.ORDER = ["match", "batting", "pitching"];
BbModeRules.HUMAN_TEAM = { match: 1, batting: 0, pitching: 1 };
class BbRoomCard {
    constructor(mount, actions) {
        this.setup = BbRoomRules.BLANK_SETUP;
        const change = (part) => actions.change({ ...this.setup, ...part });
        this.code = BbHudParts.box("bb-room-code", mount);
        BbHudParts.box("bb-room-label", mount, "게임 모드");
        const modeRow = BbHudParts.box("bb-room-row", mount);
        this.modes = BbModeRules.ORDER.map((mode) => BbSheetParts.button("bb-room-chip", modeRow, BbModeRules.LABELS[mode], () => change({ mode })));
        this.seats = BbHudParts.box("bb-room-seats", mount);
        const guest = BbHudParts.box("bb-room-seat", this.seats);
        const labels = BbRoomRules.sideLabels(false), guestSide = BbHudParts.box("bb-room-side", guest, labels[0]), face = (seat) => {
            const image = document.createElement("img");
            image.className = "bb-room-face";
            image.alt = "";
            seat.appendChild(image);
            return image;
        };
        const guestFace = face(guest);
        this.rival = BbHudParts.box("bb-room-name", guest);
        this.addAi = BbSheetParts.button("bb-room-chip", guest, "AI 추가", () => change({ ai: true }));
        this.dropAi = BbSheetParts.button("bb-room-chip", guest, "AI 제거", () => change({ ai: false }));
        const host = BbHudParts.box("bb-room-seat", this.seats);
        this.sides = [guestSide, BbHudParts.box("bb-room-side", host, labels[1])];
        this.faces = [guestFace, face(host)];
        this.owner = BbHudParts.box("bb-room-name", host);
        this.levelLabel = BbHudParts.box("bb-room-label", mount, "AI 난이도");
        this.levelRow = BbHudParts.box("bb-room-row", mount);
        this.levels = BbRoomCard.LEVELS.map((level) => BbSheetParts.button("bb-room-chip", this.levelRow, BbAiLevel.ALL[level].label, () => change({ level })));
        this.notice = BbHudParts.box("bb-room-notice", mount);
        this.start = BbSheetParts.button("st-btn primary", mount, "시작", () => actions.start());
        BbSheetParts.button("st-btn", mount, "나가기", () => actions.leave());
    }
    draw(view) {
        const setup = view.setup, match = setup.mode === "match", ai = setup.ai && !view.guest, needsLevel = !match || ai;
        this.setup = setup;
        this.code.textContent = view.code ? "방 코드 " + view.code + (view.watchers ? "  ·  관전 " + view.watchers + "명" : "") : "";
        this.modes.forEach((button, index) => { button.classList.toggle("on", BbModeRules.ORDER[index] === setup.mode); button.disabled = !view.editable; });
        this.levels.forEach((button, index) => { button.classList.toggle("on", BbRoomCard.LEVELS[index] === setup.level); button.disabled = !view.editable; });
        this.seats.hidden = !match;
        const labels = BbRoomRules.sideLabels(view.flip);
        this.sides[0].textContent = labels[0];
        this.sides[1].textContent = labels[1];
        this.faces.forEach((image, index) => {
            const url = view.faces[index];
            image.hidden = !url;
            if (url && image.src !== url)
                image.src = url;
        });
        this.rival.textContent = view.guest || (ai ? "🤖 AI (" + BbAiLevel.ALL[setup.level].label + ")" : "사람을 기다리는 중");
        this.owner.textContent = view.host;
        this.addAi.hidden = !view.editable || !!view.guest || ai;
        this.dropAi.hidden = !view.editable || !ai;
        this.levelRow.hidden = this.levelLabel.hidden = !needsLevel;
        this.notice.textContent = view.editable ? view.notice : "방장이 시작하기를 기다리는 중";
        this.start.hidden = !view.editable;
        this.start.disabled = match && !view.guest && !ai;
        this.start.textContent = match ? "시작" : BbModeRules.LABELS[setup.mode] + " 시작";
    }
}
BbRoomCard.LEVELS = ["easy", "normal", "hard"];
class BbResultCard {
    constructor(mount, onAgain, onLeave) {
        this.headline = BbHudParts.box("bb-result-headline", mount);
        this.detail = BbHudParts.box("bb-result-detail", mount);
        this.streak = BbHudParts.box("bb-result-streak", mount);
        this.lines = BbHudParts.box("bb-result-lines", mount);
        this.facts = BbHudParts.box("bb-result-facts", mount);
        this.againButton = BbSheetParts.button("st-btn primary", mount, "다시 하기", onAgain);
        this.leaveButton = BbSheetParts.button("st-btn", mount, "나가기", onLeave);
    }
    note(text) { this.streak.textContent = text; }
    show(summary, mode, viewer, againLabel, leaveLabel = "나가기") {
        const state = summary.state, mine = viewer === null ? 1 : viewer, names = summary.plan.names;
        this.againButton.textContent = againLabel;
        this.againButton.hidden = !againLabel;
        this.leaveButton.textContent = leaveLabel;
        this.streak.textContent = "";
        this.lines.textContent = "";
        this.facts.textContent = "";
        if (mode === "match") {
            this.showMatch(summary, viewer);
            return;
        }
        else {
            this.headline.textContent = BbModeRules.LABELS[mode] + " 끝";
            this.detail.textContent = names[mine];
            this.lines.hidden = true;
        }
        const bat = state.box[mine].bat, pit = state.box[mine].pit, box = state.box[mine], rate = (part, whole) => whole ? Math.round(part / whole * 100) + "%" : "-";
        if (mode !== "pitching")
            this.addFacts("타격", [["득점", String(bat.r)], ["안타", String(bat.h)], ["홈런", String(bat.hr)], ["볼넷", String(bat.bb)], ["삼진", String(bat.k)], ["최장 비거리", box.bestDistance ? Math.round(box.bestDistance) + "m" : "-"], ["최고 타구 속도", box.bestExit ? Math.round(box.bestExit) + "km/h" : "-"]]);
        if (mode !== "batting") {
            this.addFacts("투구", [["실점", String(pit.r)], ["삼진", String(pit.k)], ["볼넷", String(pit.bb)], ["피안타", String(pit.h)], ["투구 수", String(pit.pitches)], ["스트라이크 비율", rate(pit.strikes, pit.pitches)], ["최고 구속", box.bestPitch ? Math.round(box.bestPitch) + "km/h" : "-"]]);
            const thrown = BbPitchCatalog.ALL.filter((kind) => box.byType[kind.id].n > 0).map((kind) => [kind.label, box.byType[kind.id].n + "개 · 스트라이크 " + rate(box.byType[kind.id].s, box.byType[kind.id].n)]);
            if (thrown.length)
                this.addFacts("구종별", thrown);
        }
    }
    showMatch(summary, viewer) {
        const state = summary.state, names = summary.plan.names, tied = summary.forfeitedBy === null && (state.winner === -1 || state.winner === null);
        const winner = summary.forfeitedBy !== null ? (summary.forfeitedBy === 0 ? 1 : 0) : state.winner === 0 ? 0 : 1;
        this.headline.textContent = tied ? "무승부" : viewer === null ? names[winner] + " 승리" : winner === viewer ? "승리!" : "패배";
        this.detail.textContent = summary.forfeitedBy !== null ? names[summary.forfeitedBy] + " 기권 (자리 비움·나감)" : state.endNote || names[0] + " " + state.score[0] + " : " + state.score[1] + " " + names[1];
        this.lines.hidden = false;
        this.lines.innerHTML = BbBoxTable.html(BbBoxTable.sheetOf(BbReportBuilder.fromSummary("view", summary, viewer === null ? 1 : viewer, false, false, false, 1)));
    }
    addFacts(title, facts) {
        BbHudParts.box("bb-result-title", this.facts, title);
        const grid = BbHudParts.box("bb-result-grid", this.facts);
        facts.forEach(([label, value]) => {
            const cell = BbHudParts.box("bb-result-fact", grid);
            BbHudParts.box("bb-result-fact-label", cell, label);
            BbHudParts.box("bb-result-fact-value", cell, value);
        });
    }
}
class BbDuelGame {
    constructor(libs) {
        this.roster = new BbRosterAccount(() => this.sheetChanged());
        this.profile = new PlayerProfile();
        this.backend = new RkBackend();
        this.directory = new RkDirectory(this.backend, BbRoomRules.RULES);
        this.seatPlan = new RkSeatPlan(BbRoomRules.RULES);
        this.myId = RkReloadResume.identity(BbRoomRules.RULES);
        this.session = null;
        this.link = null;
        this.presence = null;
        this.live = null;
        this.liveOver = false;
        this.game = null;
        this.setup = BbRoomRules.BLANK_SETUP;
        this.last = { mode: "match", level: "normal" };
        this.showcaseSeed = 4100;
        this.shown = "startScreen";
        this.zones = new BbZoneSwitch();
        this.account = new BbAccount(() => this.zones.on);
        this.rates = new BbVersusRates(this.account, () => this.zones.on);
        this.random = null;
        this.quality = null;
        const controls = document.getElementById("bbControls"), dialogs = document.getElementById("bbDialogs");
        this.stage = new BbStage(libs, document.getElementById("bbView"));
        this.hud = new BbScoreHud(document.getElementById("hudTop"));
        this.director = new BbMatchDirector(this.stage, this.hud, controls, { onEnd: (summary) => this.ended(summary), onLog: (log) => this.logged(log) });
        this.pause = new BbPauseBanner(controls);
        this.sheet = new BbSheetDialog(dialogs, new BbStageFaces(this.stage), (profile) => { this.sheetChanged(); void this.roster.push(profile); });
        void this.roster.pull();
        this.corner = document.getElementById("sheetCorner");
        this.corner.addEventListener("click", () => this.sheet.open());
        document.getElementById("btnPartySheet").addEventListener("click", () => this.sheet.open());
        this.room = new BbRoomCard(document.getElementById("roomMount"), { change: (setup) => this.changeSetup(setup), start: () => this.startFromRoom(), leave: () => this.leaveRoom("") });
        this.result = new BbResultCard(document.getElementById("resultMount"), () => this.again(), () => this.leaveRoom(""));
        this.sound = new BbSoundDirector(() => this.stage.listener);
        this.director.attach(new BbAtmosphere(this.stage, this.sound));
        const prefs = this.sound.settings;
        this.menu = new BbGameMenu(controls, [
            { label: "연출 빠르게", onFlip: (on) => this.director.quicken(on) },
            { label: "타자 시점으로 보기(관전)", onFlip: (on) => this.director.watch(on ? "batter" : "pitcher") },
            { label: "효과음", on: prefs.fx, onFlip: (on) => this.sound.change({ fx: on }) },
            { label: "응원 소리", on: prefs.crowd, onFlip: (on) => this.sound.change({ crowd: on }) }
        ], [["연출 건너뛰기", () => this.director.skipScene()], ["나가기", () => this.leaveGame()]], [{ labels: BbSoundSettings.VOLUME_LABELS, index: Math.max(0, BbSoundSettings.VOLUMES.indexOf(prefs.volume)), onPick: (index) => this.sound.change({ volume: BbSoundSettings.VOLUMES[index] }) }]);
        document.getElementById("btnCreate").addEventListener("click", () => { this.createRoom(); });
        document.getElementById("btnRandom").addEventListener("click", () => { this.createParty(); });
        document.getElementById("btnJoin").addEventListener("click", () => { this.joinRoom(); });
        window.addEventListener("pagehide", () => { if (this.session)
            this.session.removeMineOnUnload(); });
        this.versus = new VersusCurtain(document.getElementById("versusCurtain"), new BbVersusContent(), {
            inRoom: () => !!this.session, waiting: () => !!this.session && this.session.status === "lobby", randomMatch: () => !!this.ticket(),
            roomShownAt: () => (this.session ? Number(this.session.value("vsAt")) || 0 : 0), sides: () => this.versusSides(), now: () => this.backend.now()
        }, ["초 공격", "말 공격"]);
        const portal = window.PORTAL_CLASS;
        this.board = new BbBoardPanel(document.getElementById("boardMount"), this.backend, portal ? portal.id : null);
        this.account.bind();
        this.showScreen("startScreen");
        this.load().catch((error) => this.notice("불러오지 못했어요: " + error.message));
    }
    async load() {
        this.zones.load(this.backend);
        this.board.load();
        await this.stage.load(BbDuelGame.ASSET_DIRECTORY, BbBallparkRegistry.MAIN, { batsLeft: false, throwsLeft: false });
        const govern = window.QualityGovernor;
        if (govern) {
            this.quality = govern({ steps: this.stage.qualitySteps(), storageKey: BbDuelGame.QUALITY_KEY, isPlaying: () => this.director.isRunning && !this.liveOver && this.shown === null, slowSec: 0.022, slowLimit: 90 });
            this.quality.restore();
        }
        this.versus.sync();
        const saved = BbLocalResume.load();
        if (saved)
            this.play(saved, "방금 상황을 불러왔어요");
        else {
            this.showcase();
            RkReloadResume.resumeInto(this.backend, BbRoomRules.RULES, (code) => this.enterRoom(code, false, ""));
        }
        this.stage.run((frameSeconds) => this.tick(frameSeconds));
    }
    tick(frameSeconds) {
        const live = this.live, link = this.link, presence = this.presence;
        if (live && link && presence && !this.liveOver) {
            const missing = presence.missing(live), expired = this.pause.step(frameSeconds, !!missing);
            this.director.halt(this.pause.paused);
            link.hold(this.pause.paused);
            if (expired && missing)
                this.claimEnd(BbRoomRules.teamOf(live, missing) === 0 ? 1 : 0);
            link.pump();
        }
        this.director.tick(frameSeconds);
        if (this.quality)
            this.quality.update(frameSeconds);
    }
    myName() { return PlayerProfile.storedNick() || "나"; }
    myRecord() {
        const record = { nick: this.myName(), isBot: false, joinedAt: this.backend.now(), slot: BbRoomRules.HOST_TEAM, look: this.profile.look, spectator: false, sheet: BbProfileStore.teamOf(BbProfileStore.load()) };
        const card = this.rates.forRoom();
        if (card)
            record.vs = card;
        return record;
    }
    ticket() { return this.random ? this.random.ticket() : null; }
    flow() {
        if (this.random)
            return this.random;
        const account = this.account;
        this.random = RkRandomSetup.create({
            backend: this.backend, directory: this.directory, rules: BbRoomRules.RULES, myId: this.myId,
            options: {
                gameRoot: "baseballduel", queue: "baseballduel", partyLimit: 1, solo: true, allowBots: false, aiFallbackMs: BbDuelGame.AI_FALLBACK_MS, clientVersion: BbDuelGame.CLIENT_VERSION,
                matcher: new MkVersusMatcher(1, Object.assign({}, MkMatcher.TIMING, { rematchWaitMs: BbDuelGame.AI_FALLBACK_MS + 30000, busyMs: 300000 })),
                intro: "매칭 시작을 누르면 아무 학생과 1대1 야구를 해요.",
                stats: new AccountStatsOpener(() => account.openStats(), account.pendingGuard(() => this.leaveReport(true)))
            },
            assign: (plan) => BbRoomRules.assignSeats(plan),
            port: {
                myRecord: () => this.myRecord(),
                enterTicketRoom: (code, hosting) => this.enterTicketRoom(code, hosting),
                leaveRoomQuietly: () => this.dropSession(),
                startMatch: () => this.versus.afterShown(() => this.launchMatch(true)),
                showParty: () => { this.showScreen("partyScreen"); this.random.render(); },
                showStart: (message) => { this.showScreen("startScreen"); if (message)
                    this.notice(message); },
                presentIds: () => (this.session ? RkMatchHooks.humanIds(this.session.players) : [])
            },
            screen: document.getElementById("partyScreen"),
            mount: document.getElementById("partyMount")
        });
        return this.random;
    }
    async createParty() {
        if (!this.backend.database) {
            this.notice("서버에 연결하지 못했어요");
            return;
        }
        try {
            await this.rates.loadOnce();
            const message = await this.flow().create();
            if (message)
                this.notice(message);
        }
        catch (error) {
            this.notice("랜덤 매칭 방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
        }
    }
    async enterTicketRoom(code, hosting) {
        if (!hosting) {
            const outcome = await this.directory.join(code, this.myId, this.myRecord(), false, true).catch(() => null);
            if (!outcome || !outcome.ok)
                return false;
        }
        this.enterRoom(code, hosting, "매칭됐어요! 곧 시작해요.");
        return true;
    }
    inParty() { return !!this.random && this.random.inParty(); }
    versusSides() {
        const session = this.session;
        if (!session)
            return null;
        const ticket = this.ticket(), assign = session.value("assign"), setup = BbRoomRules.setupOf(session.value("setup"));
        const seats = this.seatPlan.humanSeats(session.players);
        const ids = ticket && assign ? [BbRoomRules.assignedTo(assign, 0), BbRoomRules.assignedTo(assign, 1)] : BbRoomRules.seatIds(seats[0], seats[BbRoomRules.HOST_TEAM], this.flipped(session));
        if (!ids[0] && !ids[1])
            return null;
        const names = (ticket && ticket.rivalIds) || {};
        const side = (team) => {
            const id = ids[team], record = id ? session.players.get(id) || null : null, ai = !id && (!!ticket || setup.ai);
            const portrait = ai ? this.stage.portrait(BbModeRules.aiLook(team), team) : record ? this.stage.portrait(BbWardrobe.lookOf(record.look, BbModeRules.aiLook(team)), team) : null;
            return BbVersusLineup.side(id, record ? { nick: record.nick, vs: record.vs } : null, ai ? "AI" : id ? names[id] || "" : "", team, this.myId, ai, portrait);
        };
        return [side(0), side(1)];
    }
    flipped(session) { return !this.ticket() && !!session.value("flip"); }
    leaveReport(randomOnly) {
        const live = this.live, session = this.session, summary = this.director.summary();
        const mine = live ? BbRoomRules.teamOf(live, this.myId) : null, random = !!this.ticket();
        if (!live || !session || !summary || mine === null || this.liveOver || (randomOnly && !random))
            return null;
        const progress = AccountForfeit.progressOnLeave(random, this.director.matchProgress());
        return BbReportBuilder.fromSummary(this.matchKey(session, live), summary, mine, live.seats.s0 !== BbRoomRules.AI_SEAT && live.seats.s1 !== BbRoomRules.AI_SEAT, random, true, progress);
    }
    matchKey(session, match) {
        const ticket = this.ticket();
        return ticket ? ticket.matchId : session.code + "_" + match.id;
    }
    notice(text) {
        const note = document.getElementById("startNote");
        note.textContent = text;
        window.setTimeout(() => { if (note.textContent === text)
            note.textContent = ""; }, BbDuelGame.NOTICE_SECONDS * 1000);
    }
    showScreen(shown) {
        this.shown = shown;
        BbDuelGame.SCREENS.forEach((id) => { document.getElementById(id).hidden = id !== shown; });
        document.body.classList.toggle("menu", shown !== null);
        this.corner.hidden = shown !== "startScreen" && shown !== "roomScreen";
        if (shown === null)
            this.sheet.shut();
        this.menu.shut();
    }
    showcase() {
        const plan = BbModeRules.showcase(this.showcaseSeed++);
        this.game = null;
        this.director.halt(false);
        this.director.orbit(true);
        this.director.begin(plan, new BbLocalLink(this.director, plan.seed));
    }
    async createRoom() {
        this.setup = BbRoomRules.BLANK_SETUP;
        if (!this.backend.database) {
            this.openRoom("");
            return;
        }
        try {
            await this.rates.loadOnce();
            const code = await this.directory.create(this.myId, this.myRecord(), { setup: this.setup }, (taken) => this.flow().codeTaken(taken));
            if (code)
                this.enterRoom(code, true, "");
            else
                this.notice("방을 만들지 못했어요. 다시 눌러 주세요.");
        }
        catch (error) {
            this.openRoom("서버에 연결하지 못해 혼자 하기만 됩니다");
        }
    }
    async joinRoom() {
        const code = document.getElementById("joinCode").value.replace(/\D/g, "");
        if (!this.backend.database) {
            this.notice("서버에 연결하지 못했어요");
            return;
        }
        if (code.length !== 5) {
            this.notice("방 코드 5자리를 입력해 주세요.");
            return;
        }
        try {
            await this.rates.loadOnce();
            const party = await this.flow().tryJoin(code);
            if (party.handled) {
                if (party.message)
                    this.notice(party.message);
                return;
            }
            const outcome = await this.directory.join(code, this.myId, this.myRecord(), false);
            if (outcome.ok)
                this.enterRoom(code, false, outcome.message);
            else
                this.notice(outcome.message);
        }
        catch (error) {
            this.notice("방을 불러오지 못했어요.");
        }
    }
    openRoom(note) {
        this.showScreen("roomScreen");
        this.drawRoom(note);
    }
    enterRoom(code, hosting, note) {
        const session = new RkSession(this.backend, BbRoomRules.RULES, code, this.myId, hosting, BbRoomRules.VALUES);
        this.session = session;
        this.hud.room(code);
        document.getElementById("joinCode").value = code;
        session.onChange = (kind) => this.roomChanged(kind);
        session.onClosed = (message) => this.leaveRoom(message);
        session.onHostTakeover = () => this.roomChanged("host");
        session.connect();
        this.openRoom(note);
        this.versus.sync();
    }
    drawRoom(note) {
        const session = this.session;
        if (!session) {
            const faces = [this.setup.ai ? this.stage.portrait(BbModeRules.aiLook(0), 0) : null, this.stage.portrait(this.profile.look, 1)];
            this.room.draw({ code: "", setup: this.setup, guest: null, host: this.myName(), editable: true, watchers: 0, notice: note, flip: false, faces });
            return;
        }
        const seats = this.seatPlan.humanSeats(session.players), nameOf = (id) => { const record = id ? session.players.get(id) : null; return record ? record.nick : null; };
        const setup = BbRoomRules.setupOf(session.value("setup")), flip = this.flipped(session), guestTeam = flip ? 1 : 0, hostTeam = flip ? 0 : 1;
        const faceOf = (id, team) => {
            const record = id ? session.players.get(id) : null;
            if (record)
                return this.stage.portrait(BbWardrobe.lookOf(record.look, BbModeRules.aiLook(team)), team);
            return !id && setup.ai ? this.stage.portrait(BbModeRules.aiLook(team), team) : null;
        };
        this.room.draw({
            code: session.code, setup, guest: nameOf(seats[0]), host: nameOf(seats[BbRoomRules.HOST_TEAM]) || "방장",
            editable: session.isHost(), watchers: this.seatPlan.spectators(session.players).length, notice: session.isSpectator() ? "관전으로 들어왔습니다" : note, flip,
            faces: [faceOf(seats[0], guestTeam), faceOf(seats[BbRoomRules.HOST_TEAM], hostTeam)]
        });
    }
    roomChanged(kind) {
        const session = this.session;
        if (!session)
            return;
        const match = session.value("match"), end = session.value("end");
        if (session.status === "play" && match && (!this.live || this.live.id !== match.id)) {
            this.versus.sync();
            if (this.random && kind === "match")
                this.random.armMatch();
            this.startOnline(session, match);
            return;
        }
        if (session.status === "lobby" && this.live) {
            this.closeLive();
            this.showcase();
            this.showScreen("roomScreen");
        }
        if (this.live && !this.liveOver && end && end.match === this.live.id)
            this.director.forfeit(end.winner === 0 ? 1 : 0);
        if (this.live && !this.liveOver && kind === "host")
            this.director.reseat(BbRoomRules.seatsFor(this.live, this.myId, session.isHost()));
        if (this.shown === "roomScreen")
            this.drawRoom("");
        const random = this.random;
        if (random && (kind === "players" || kind === "host" || kind === "status"))
            random.roomChanged(this.seatPlan.humanSeats(session.players).filter((id) => !!id).length, session.isHost(), session.status === "lobby");
        if (random && kind === "match")
            random.armMatch();
        this.versus.sync();
    }
    changeSetup(setup) {
        const session = this.session;
        if (!session) {
            this.setup = setup;
            this.drawRoom("");
            return;
        }
        if (session.isHost())
            session.writeValue("setup", setup);
    }
    sheetChanged() {
        if (this.session && !this.live)
            this.session.ref.child("players/" + this.myId + "/sheet").set(BbProfileStore.teamOf(BbProfileStore.load()));
    }
    startFromRoom() {
        const session = this.session, setup = session ? BbRoomRules.setupOf(session.value("setup")) : this.setup;
        if (setup.mode !== "match") {
            this.dropSession();
            this.startGame(setup.mode, setup.level);
            return;
        }
        if (!session) {
            if (setup.ai)
                this.startGame("match", setup.level);
            return;
        }
        if (!session.isHost())
            return;
        if (this.guestId(session))
            this.versus.requestRoomStart((at) => { session.ref.update({ vsAt: at }); }, () => { if (this.session === session)
                this.launchMatch(false); });
        else
            this.launchMatch(false);
    }
    guestId(session) {
        const humans = this.seatPlan.humanSeats(session.players).filter((id) => !!id && id !== this.myId);
        return humans[0] || null;
    }
    launchMatch(randomMatch) {
        const session = this.session;
        if (!session || !session.isHost() || session.status !== "lobby")
            return;
        const setup = randomMatch ? { mode: "match", level: "normal", ai: true } : BbRoomRules.setupOf(session.value("setup"));
        const guestId = this.guestId(session), guest = guestId ? session.players.get(guestId) || null : null, mine = session.me();
        if (!mine || (!guest && !setup.ai))
            return;
        const rival = guest ? BbProfileStore.teamOf(guest.sheet) : BbAiLevel.team("R");
        const flip = !randomMatch && this.flipped(session), rivalId = guest ? guestId : BbRoomRules.AI_SEAT, rivalName = guest ? guest.nick : "AI " + BbAiLevel.ALL[setup.level].label;
        const ids = BbRoomRules.seatIds(rivalId, this.myId, flip), ownSheet = BbProfileStore.teamOf(mine.sheet);
        const lookOf = (id, team) => { const record = session.players.get(id); return BbWardrobe.lookOf(record ? record.look : null, BbModeRules.aiLook(team)); };
        const match = {
            id: this.backend.now(), seats: { s0: ids[0], s1: ids[1] }, sheets: flip ? [ownSheet, rival] : [rival, ownSheet],
            names: flip ? [mine.nick, rivalName] : [rivalName, mine.nick], level: setup.level, looks: [lookOf(ids[0], 0), lookOf(ids[1], 1)]
        };
        session.ref.update({ match, status: "play", end: null, log: null });
    }
    scouting(session, match) {
        const scout = (id) => {
            const record = id === BbRoomRules.AI_SEAT ? null : session.players.get(id), built = record ? BbScoutBuilder.of(BbVersusCards.fromRoom(record.vs)) : null;
            return built && !this.zones.on ? { batStats: built.batStats, pitStats: built.pitStats, hitHeat: null, pitchHeat: null } : built;
        };
        return [scout(match.seats.s0), scout(match.seats.s1)];
    }
    async startOnline(session, match) {
        this.closeLive();
        this.live = match;
        this.liveOver = false;
        this.game = null;
        const link = new BbRoomLink(this.director, session, this.backend), log = await link.open();
        if (this.session !== session || this.live !== match) {
            link.close();
            return;
        }
        this.link = link;
        this.presence = new BbPresenceWatch(session);
        this.showScreen(null);
        this.director.orbit(false);
        this.director.begin({
            format: new BbOneInningFormat(), teams: [BbProfileStore.teamOf(match.sheets[0]), BbProfileStore.teamOf(match.sheets[1])], names: match.names,
            seats: BbRoomRules.seatsFor(match, this.myId, session.isHost()), level: BbAiLevel.ALL[match.level] || BbAiLevel.ALL.normal, seed: match.id % BbDuelGame.SEED_SPAN,
            halvesToPlay: null, log, view: BbRoomRules.teamOf(match, this.myId) === null ? "pitcher" : null, autoSwingAt: null, scouting: this.scouting(session, match),
            looks: [BbWardrobe.lookOf(match.looks ? match.looks[0] : null, BbModeRules.aiLook(0)), BbWardrobe.lookOf(match.looks ? match.looks[1] : null, BbModeRules.aiLook(1))]
        }, link);
        if (log.length)
            this.director.say("방금 상황을 불러왔어요");
        if (this.random)
            this.random.armMatch();
    }
    closeLive() {
        if (this.link)
            this.link.close();
        if (this.presence)
            this.presence.close();
        this.link = null;
        this.presence = null;
        this.live = null;
        this.liveOver = false;
        this.pause.clear();
        this.director.halt(false);
    }
    claimEnd(winner) {
        const session = this.session, live = this.live;
        if (!session || !live)
            return;
        session.ref.child("end").transaction((current) => (current !== null && current !== undefined ? undefined : { winner, match: live.id })).catch(() => undefined);
    }
    startGame(mode, level) {
        const profile = BbProfileStore.load(), mine = { lineup: profile.lineup, pitchers: profile.pitchers }, rival = BbAiLevel.team("R");
        const human = BbModeRules.humanTeam(mode);
        this.last = { mode, level };
        this.play({ mode, level, seed: Math.floor(Math.random() * 1e9) + 1, me: this.myName(), teams: human === 1 ? [rival, mine] : [mine, rival], log: [] }, "");
    }
    play(game, note) {
        const plan = BbModeRules.plan(game);
        this.game = game;
        this.last = { mode: game.mode, level: game.level };
        this.hud.room("");
        BbLocalResume.save(game);
        this.showScreen(null);
        this.director.orbit(false);
        this.director.begin(plan, new BbLocalLink(this.director, plan.seed + game.log.length));
        if (note)
            this.director.say(note);
    }
    logged(log) {
        if (!this.game)
            return;
        this.game.log = log.slice();
        BbLocalResume.save(this.game);
    }
    ended(summary) {
        const game = this.game, live = this.live;
        if (live && !this.liveOver) {
            this.liveOver = true;
            this.pause.clear();
            const mine = BbRoomRules.teamOf(live, this.myId), random = this.random, ticket = this.ticket(), session = this.session;
            const hostLabel = this.session && this.session.isHost() ? "한 번 더 (공수 교대)" : "방장을 기다리는 중";
            this.result.show(summary, "match", mine, ticket ? "" : hostLabel, ticket ? "팀 대기실로" : "나가기");
            this.showScreen("resultScreen");
            this.showcase();
            if (mine !== null && session)
                this.recordEnd(session, live, summary, mine);
            if (random && ticket && mine !== null) {
                const report = BbReportBuilder.fromSummary("x", summary, mine, true, true, false, 1), result = report.winner === -1 ? "draw" : report.winner === mine ? "win" : "lose";
                const hint = () => this.result.note(random.endHint());
                hint();
                random.matchEnded({ result }, hint);
            }
            return;
        }
        if (!game) {
            this.showcase();
            return;
        }
        BbLocalResume.clear();
        this.result.show(summary, game.mode, BbModeRules.humanTeam(game.mode), "다시 하기");
        this.showScreen("resultScreen");
        this.showcase();
    }
    recordEnd(session, live, summary, mine) {
        const rival = live.seats.s0 !== BbRoomRules.AI_SEAT && live.seats.s1 !== BbRoomRules.AI_SEAT;
        if (!rival)
            return;
        const report = BbReportBuilder.fromSummary(this.matchKey(session, live), summary, mine, rival, !!this.ticket(), false, 1);
        this.account.record(report);
        this.rates.note(report);
    }
    again() {
        const session = this.session;
        if (!session) {
            this.startGame(this.last.mode, this.last.level);
            return;
        }
        if (!session.isHost())
            return;
        const flip = !this.flipped(session);
        session.ref.update({ status: "lobby", match: null, end: null, log: null, vsAt: null, flip }).then(() => { if (this.session === session)
            this.startFromRoom(); }).catch(() => undefined);
    }
    dropSession() {
        const session = this.session;
        this.closeLive();
        this.session = null;
        this.hud.room("");
        this.versus.cancelStart();
        if (session)
            session.leave();
        this.versus.sync();
    }
    leaveRoom(message) {
        if (this.inParty()) {
            this.random.backToParty(message);
            return;
        }
        this.dropSession();
        this.showScreen("startScreen");
        if (message)
            this.notice(message);
    }
    leaveGame() {
        const live = this.live, mine = live ? BbRoomRules.teamOf(live, this.myId) : null, random = !!this.ticket();
        const question = random && mine !== null && !this.liveOver ? MkForfeit.QUESTION : "경기를 그만두고 나갈까요?";
        if ((!this.game && !live) || !window.confirm(question))
            return;
        if (live && mine !== null && !this.liveOver) {
            const report = this.leaveReport(false);
            if (report && report.rival)
                this.account.record(report);
            if (this.random)
                this.random.forfeitIfLate(this.director.matchProgress());
            this.claimEnd(mine === 0 ? 1 : 0);
        }
        BbLocalResume.clear();
        this.leaveRoom("");
        this.showcase();
    }
}
BbDuelGame.ASSET_DIRECTORY = "assets/kaykit/";
BbDuelGame.SCREENS = ["startScreen", "roomScreen", "partyScreen", "resultScreen"];
BbDuelGame.NOTICE_SECONDS = 2.5;
BbDuelGame.SEED_SPAN = 1000000007;
BbDuelGame.AI_FALLBACK_MS = 120000;
BbDuelGame.CLIENT_VERSION = 20261113;
BbDuelGame.QUALITY_KEY = "baseballduel_quality_v1";
