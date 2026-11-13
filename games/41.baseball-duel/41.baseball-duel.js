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
    static plan(game) {
        const human = BbModeRules.humanTeam(game.mode), level = BbAiLevel.ALL[game.level], rival = "AI " + level.label;
        return {
            format: new BbOneInningFormat(), teams: game.teams, names: human === 1 ? [rival, game.me] : [game.me, rival], seats: human === 1 ? ["ai", "human"] : ["human", "ai"],
            level, seed: game.seed, halvesToPlay: game.mode === "match" ? null : 1, log: game.log, view: null, autoSwingAt: null
        };
    }
    static showcase(seed) {
        const team = () => ({ lineup: [BbAiLevel.batterSheet("R")], pitchers: [BbAiLevel.pitcherSheet("R")] });
        return { format: new BbThreeInningFormat(), teams: [team(), team()], names: ["", ""], seats: ["ai", "ai"], level: BbAiLevel.ALL.normal, seed, halvesToPlay: null, log: [], view: "pitcher", autoSwingAt: null };
    }
}
BbModeRules.LABELS = { match: "일반", batting: "타격 연습", pitching: "투구 연습" };
BbModeRules.ORDER = ["match", "batting", "pitching"];
BbModeRules.HUMAN_TEAM = { match: 1, batting: 0, pitching: 1 };
class BbRoomCard {
    constructor(mount, onStart, onLeave) {
        this.mode = "match";
        this.level = "normal";
        this.withAi = false;
        BbHudParts.box("bb-room-label", mount, "게임 모드");
        const modeRow = BbHudParts.box("bb-room-row", mount);
        this.modes = BbModeRules.ORDER.map((mode) => BbSheetParts.button("bb-room-chip", modeRow, BbModeRules.LABELS[mode], () => { this.mode = mode; this.draw(); }));
        this.seats = BbHudParts.box("bb-room-seats", mount);
        this.guest = BbHudParts.box("bb-room-seat", this.seats);
        BbHudParts.box("bb-room-side", this.guest, "손님 · 초 공격");
        this.rival = BbHudParts.box("bb-room-name", this.guest);
        this.addAi = BbSheetParts.button("bb-room-chip", this.guest, "AI 추가", () => { this.withAi = true; this.draw(); });
        this.dropAi = BbSheetParts.button("bb-room-chip", this.guest, "AI 제거", () => { this.withAi = false; this.draw(); });
        this.host = BbHudParts.box("bb-room-seat", this.seats);
        BbHudParts.box("bb-room-side", this.host, "방장 · 말 공격");
        BbHudParts.box("bb-room-name", this.host);
        BbHudParts.box("bb-room-label", mount, "AI 난이도");
        this.levelRow = BbHudParts.box("bb-room-row", mount);
        this.levels = BbRoomCard.LEVELS.map((level) => BbSheetParts.button("bb-room-chip", this.levelRow, BbAiLevel.ALL[level].label, () => { this.level = level; this.draw(); }));
        this.start = BbSheetParts.button("st-btn primary", mount, "시작", () => onStart(this.mode, this.level));
        BbSheetParts.button("st-btn", mount, "나가기", onLeave);
    }
    open(me) {
        this.host.lastElementChild.textContent = me;
        this.withAi = false;
        this.draw();
    }
    draw() {
        const match = this.mode === "match", needsLevel = !match || this.withAi;
        this.modes.forEach((button, index) => button.classList.toggle("on", BbModeRules.ORDER[index] === this.mode));
        this.levels.forEach((button, index) => button.classList.toggle("on", BbRoomCard.LEVELS[index] === this.level));
        this.seats.hidden = !match;
        this.rival.textContent = this.withAi ? "🤖 AI (" + BbAiLevel.ALL[this.level].label + ")" : "사람을 기다리는 중";
        this.addAi.hidden = this.withAi;
        this.dropAi.hidden = !this.withAi;
        this.levelRow.hidden = !needsLevel;
        this.levelRow.previousElementSibling.hidden = !needsLevel;
        this.start.disabled = match && !this.withAi;
        this.start.textContent = match ? "시작" : BbModeRules.LABELS[this.mode] + " 시작";
    }
}
BbRoomCard.LEVELS = ["easy", "normal", "hard"];
class BbResultCard {
    constructor(mount, onAgain, onLeave) {
        this.headline = BbHudParts.box("bb-result-headline", mount);
        this.detail = BbHudParts.box("bb-result-detail", mount);
        this.lines = BbHudParts.box("bb-result-lines", mount);
        this.facts = BbHudParts.box("bb-result-facts", mount);
        BbSheetParts.button("st-btn primary", mount, "다시 하기", onAgain);
        BbSheetParts.button("st-btn", mount, "나가기", onLeave);
    }
    show(summary, mode) {
        const state = summary.state, mine = BbModeRules.humanTeam(mode), names = summary.plan.names;
        this.lines.textContent = "";
        this.facts.textContent = "";
        if (mode === "match")
            this.showMatch(summary, mine);
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
    showMatch(summary, mine) {
        const state = summary.state, names = summary.plan.names, lost = summary.forfeitedBy === mine || (summary.forfeitedBy === null && state.winner === 1 - mine);
        const tied = summary.forfeitedBy === null && (state.winner === -1 || state.winner === null);
        this.headline.textContent = tied ? "무승부" : lost ? "패배" : "승리!";
        this.detail.textContent = summary.forfeitedBy !== null ? "자리 비움으로 경기가 끝났습니다" : state.endNote || names[0] + " " + state.score[0] + " : " + state.score[1] + " " + names[1];
        this.lines.hidden = false;
        const first = summary.plan.format.startInning, head = BbHudParts.box("bb-result-line head", this.lines);
        BbHudParts.box("bb-result-team", head);
        state.lineScore.forEach((unused, index) => BbHudParts.box("bb-result-cell", head, String(first + index)));
        BbHudParts.box("bb-result-cell total", head, "R");
        [0, 1].forEach((team) => {
            const row = BbHudParts.box("bb-result-line", this.lines);
            BbHudParts.box("bb-result-team", row, names[team]);
            state.lineScore.forEach((inning) => BbHudParts.box("bb-result-cell", row, String(inning[team])));
            BbHudParts.box("bb-result-cell total", row, String(state.score[team]));
        });
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
        this.game = null;
        this.last = { mode: "match", level: "normal" };
        this.showcaseSeed = 4100;
        const controls = document.getElementById("bbControls"), dialogs = document.getElementById("bbDialogs");
        this.stage = new BbStage(libs, document.getElementById("bbView"));
        this.director = new BbMatchDirector(this.stage, new BbScoreHud(document.getElementById("hudTop")), controls, { onEnd: (summary) => this.ended(summary), onLog: (log) => this.logged(log) });
        this.sheet = new BbSheetDialog(dialogs, () => undefined);
        this.corner = document.getElementById("sheetCorner");
        this.corner.addEventListener("click", () => this.sheet.open());
        this.room = new BbRoomCard(document.getElementById("roomMount"), (mode, level) => this.startGame(mode, level), () => this.showScreen("startScreen"));
        this.result = new BbResultCard(document.getElementById("resultMount"), () => this.startGame(this.last.mode, this.last.level), () => this.showScreen("startScreen"));
        new BbGameMenu(controls, [{ label: "연출 빠르게", onFlip: (on) => this.director.quicken(on) }], [["연출 건너뛰기", () => this.director.skipScene()], ["나가기", () => this.leaveGame()]]);
        document.getElementById("btnCreate").addEventListener("click", () => { this.room.open(this.myName()); this.showScreen("roomScreen"); });
        document.getElementById("btnRandom").addEventListener("click", () => this.notice("랜덤 매칭은 준비 중입니다"));
        document.getElementById("btnJoin").addEventListener("click", () => this.notice("방 코드 입장은 준비 중입니다"));
        this.showScreen("startScreen");
        this.load().catch((error) => this.notice("불러오지 못했어요: " + error.message));
    }
    async load() {
        await this.stage.load(BbDuelGame.ASSET_DIRECTORY, BbBallparkRegistry.MAIN, { batsLeft: false, throwsLeft: false });
        const saved = BbLocalResume.load();
        if (saved)
            this.play(saved, "방금 상황을 불러왔어요");
        else
            this.showcase();
        this.stage.run((frameSeconds) => this.director.tick(frameSeconds));
    }
    myName() { return PlayerProfile.storedNick() || "나"; }
    notice(text) {
        const note = document.getElementById("startNote");
        note.textContent = text;
        window.setTimeout(() => { if (note.textContent === text)
            note.textContent = ""; }, BbDuelGame.NOTICE_SECONDS * 1000);
    }
    showScreen(shown) {
        BbDuelGame.SCREENS.forEach((id) => { document.getElementById(id).hidden = id !== shown; });
        document.body.classList.toggle("menu", shown !== null);
        this.corner.hidden = shown !== "startScreen" && shown !== "roomScreen";
    }
    showcase() {
        const plan = BbModeRules.showcase(this.showcaseSeed++);
        this.game = null;
        this.director.orbit(true);
        this.director.begin(plan, new BbLocalLink(this.director, plan.seed));
    }
    startGame(mode, level) {
        const profile = BbProfileStore.load(), mine = { lineup: profile.lineup, pitchers: profile.pitchers }, rival = { lineup: [BbAiLevel.batterSheet("R")], pitchers: [BbAiLevel.pitcherSheet("R")] };
        const human = BbModeRules.humanTeam(mode);
        this.last = { mode, level };
        this.play({ mode, level, seed: Math.floor(Math.random() * 1e9) + 1, me: this.myName(), teams: human === 1 ? [rival, mine] : [mine, rival], log: [] }, "");
    }
    play(game, note) {
        const plan = BbModeRules.plan(game);
        this.game = game;
        this.last = { mode: game.mode, level: game.level };
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
        const game = this.game;
        if (!game) {
            this.showcase();
            return;
        }
        BbLocalResume.clear();
        this.result.show(summary, game.mode);
        this.showScreen("resultScreen");
        this.showcase();
    }
    leaveGame() {
        if (!this.game || !window.confirm("경기를 그만두고 나갈까요?"))
            return;
        BbLocalResume.clear();
        this.showScreen("startScreen");
        this.showcase();
    }
}
BbDuelGame.ASSET_DIRECTORY = "assets/kaykit/";
BbDuelGame.SCREENS = ["startScreen", "roomScreen", "resultScreen"];
BbDuelGame.NOTICE_SECONDS = 2.5;
