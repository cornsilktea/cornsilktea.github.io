type BbGameMode = "match" | "batting" | "pitching";

interface BbLocalGame {
  mode: BbGameMode;
  level: BbAiLevelId;
  seed: number;
  me: string;
  teams: [BbTeamSheet, BbTeamSheet];
  log: BbLogEntry[];
}

class BbLocalResume {
  private static readonly KEY = "baseballduel_local_v1";

  static save(game: BbLocalGame): void {
    try { sessionStorage.setItem(BbLocalResume.KEY, JSON.stringify(game)); } catch (error) { return; }
  }

  static load(): BbLocalGame | null {
    try {
      const raw = sessionStorage.getItem(BbLocalResume.KEY), game = raw ? JSON.parse(raw) as BbLocalGame : null;
      return game && Array.isArray(game.log) && Array.isArray(game.teams) && !!BbAiLevel.ALL[game.level] ? game : null;
    } catch (error) {
      return null;
    }
  }

  static clear(): void {
    try { sessionStorage.removeItem(BbLocalResume.KEY); } catch (error) { return; }
  }
}

class BbModeRules {
  static readonly LABELS: Readonly<Record<BbGameMode, string>> = { match: "일반", batting: "타격 연습", pitching: "투구 연습" };
  static readonly ORDER: readonly BbGameMode[] = ["match", "batting", "pitching"];
  private static readonly HUMAN_TEAM: Readonly<Record<BbGameMode, 0 | 1>> = { match: 1, batting: 0, pitching: 1 };

  static humanTeam(mode: BbGameMode): 0 | 1 { return BbModeRules.HUMAN_TEAM[mode]; }

  static plan(game: BbLocalGame): BbMatchPlan {
    const human = BbModeRules.humanTeam(game.mode), level = BbAiLevel.ALL[game.level], rival = "AI " + level.label;
    return {
      format: new BbOneInningFormat(), teams: game.teams, names: human === 1 ? [rival, game.me] : [game.me, rival], seats: human === 1 ? ["ai", "human"] : ["human", "ai"],
      level, seed: game.seed, halvesToPlay: game.mode === "match" ? null : 1, log: game.log, view: null, autoSwingAt: null
    };
  }

  static showcase(seed: number): BbMatchPlan {
    const team = (): BbTeamSheet => ({ lineup: [BbAiLevel.batterSheet("R")], pitchers: [BbAiLevel.pitcherSheet("R")] });
    return { format: new BbThreeInningFormat(), teams: [team(), team()], names: ["", ""], seats: ["ai", "ai"], level: BbAiLevel.ALL.normal, seed, halvesToPlay: null, log: [], view: "pitcher", autoSwingAt: null };
  }
}

interface BbRoomView {
  code: string;
  setup: BbRoomSetup;
  guest: string | null;
  host: string;
  editable: boolean;
  watchers: number;
  notice: string;
}

interface BbRoomActions {
  change(setup: BbRoomSetup): void;
  start(): void;
  leave(): void;
}

class BbRoomCard {
  private static readonly LEVELS: readonly BbAiLevelId[] = ["easy", "normal", "hard"];
  private readonly code: HTMLElement;
  private readonly modes: HTMLButtonElement[];
  private readonly levels: HTMLButtonElement[];
  private readonly seats: HTMLElement;
  private readonly rival: HTMLElement;
  private readonly owner: HTMLElement;
  private readonly addAi: HTMLButtonElement;
  private readonly dropAi: HTMLButtonElement;
  private readonly levelLabel: HTMLElement;
  private readonly levelRow: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly start: HTMLButtonElement;
  private setup: BbRoomSetup = BbRoomRules.BLANK_SETUP;

  constructor(mount: HTMLElement, actions: BbRoomActions) {
    const change = (part: Partial<BbRoomSetup>) => actions.change({ ...this.setup, ...part });
    this.code = BbHudParts.box("bb-room-code", mount);
    BbHudParts.box("bb-room-label", mount, "게임 모드");
    const modeRow = BbHudParts.box("bb-room-row", mount);
    this.modes = BbModeRules.ORDER.map((mode) => BbSheetParts.button("bb-room-chip", modeRow, BbModeRules.LABELS[mode], () => change({ mode })));
    this.seats = BbHudParts.box("bb-room-seats", mount);
    const guest = BbHudParts.box("bb-room-seat", this.seats);
    BbHudParts.box("bb-room-side", guest, "손님 · 초 공격");
    this.rival = BbHudParts.box("bb-room-name", guest);
    this.addAi = BbSheetParts.button("bb-room-chip", guest, "AI 추가", () => change({ ai: true }));
    this.dropAi = BbSheetParts.button("bb-room-chip", guest, "AI 제거", () => change({ ai: false }));
    const host = BbHudParts.box("bb-room-seat", this.seats);
    BbHudParts.box("bb-room-side", host, "방장 · 말 공격");
    this.owner = BbHudParts.box("bb-room-name", host);
    this.levelLabel = BbHudParts.box("bb-room-label", mount, "AI 난이도");
    this.levelRow = BbHudParts.box("bb-room-row", mount);
    this.levels = BbRoomCard.LEVELS.map((level) => BbSheetParts.button("bb-room-chip", this.levelRow, BbAiLevel.ALL[level].label, () => change({ level })));
    this.notice = BbHudParts.box("bb-room-notice", mount);
    this.start = BbSheetParts.button("st-btn primary", mount, "시작", () => actions.start());
    BbSheetParts.button("st-btn", mount, "나가기", () => actions.leave());
  }

  draw(view: BbRoomView): void {
    const setup = view.setup, match = setup.mode === "match", ai = setup.ai && !view.guest, needsLevel = !match || ai;
    this.setup = setup;
    this.code.textContent = view.code ? "방 코드 " + view.code + (view.watchers ? "  ·  관전 " + view.watchers + "명" : "") : "";
    this.modes.forEach((button, index) => { button.classList.toggle("on", BbModeRules.ORDER[index] === setup.mode); button.disabled = !view.editable; });
    this.levels.forEach((button, index) => { button.classList.toggle("on", BbRoomCard.LEVELS[index] === setup.level); button.disabled = !view.editable; });
    this.seats.hidden = !match;
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

class BbResultCard {
  private readonly headline: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly streak: HTMLElement;
  private readonly lines: HTMLElement;
  private readonly facts: HTMLElement;
  private readonly againButton: HTMLButtonElement;
  private readonly leaveButton: HTMLButtonElement;

  constructor(mount: HTMLElement, onAgain: () => void, onLeave: () => void) {
    this.headline = BbHudParts.box("bb-result-headline", mount);
    this.detail = BbHudParts.box("bb-result-detail", mount);
    this.streak = BbHudParts.box("bb-result-streak", mount);
    this.lines = BbHudParts.box("bb-result-lines", mount);
    this.facts = BbHudParts.box("bb-result-facts", mount);
    this.againButton = BbSheetParts.button("st-btn primary", mount, "다시 하기", onAgain);
    this.leaveButton = BbSheetParts.button("st-btn", mount, "나가기", onLeave);
  }

  note(text: string): void { this.streak.textContent = text; }

  show(summary: BbMatchSummary, mode: BbGameMode, viewer: 0 | 1 | null, againLabel: string, leaveLabel = "나가기"): void {
    const state = summary.state, mine = viewer === null ? 1 : viewer, names = summary.plan.names;
    this.againButton.textContent = againLabel;
    this.againButton.hidden = !againLabel;
    this.leaveButton.textContent = leaveLabel;
    this.streak.textContent = "";
    this.lines.textContent = "";
    this.facts.textContent = "";
    if (mode === "match") { this.showMatch(summary, viewer); return; }
    else {
      this.headline.textContent = BbModeRules.LABELS[mode] + " 끝";
      this.detail.textContent = names[mine];
      this.lines.hidden = true;
    }
    const bat = state.box[mine].bat, pit = state.box[mine].pit, box = state.box[mine], rate = (part: number, whole: number) => whole ? Math.round(part / whole * 100) + "%" : "-";
    if (mode !== "pitching") this.addFacts("타격", [["득점", String(bat.r)], ["안타", String(bat.h)], ["홈런", String(bat.hr)], ["볼넷", String(bat.bb)], ["삼진", String(bat.k)], ["최장 비거리", box.bestDistance ? Math.round(box.bestDistance) + "m" : "-"], ["최고 타구 속도", box.bestExit ? Math.round(box.bestExit) + "km/h" : "-"]]);
    if (mode !== "batting") {
      this.addFacts("투구", [["실점", String(pit.r)], ["삼진", String(pit.k)], ["볼넷", String(pit.bb)], ["피안타", String(pit.h)], ["투구 수", String(pit.pitches)], ["스트라이크 비율", rate(pit.strikes, pit.pitches)], ["최고 구속", box.bestPitch ? Math.round(box.bestPitch) + "km/h" : "-"]]);
      const thrown = BbPitchCatalog.ALL.filter((kind) => box.byType[kind.id].n > 0).map((kind): [string, string] => [kind.label, box.byType[kind.id].n + "개 · 스트라이크 " + rate(box.byType[kind.id].s, box.byType[kind.id].n)]);
      if (thrown.length) this.addFacts("구종별", thrown);
    }
  }

  private showMatch(summary: BbMatchSummary, viewer: 0 | 1 | null): void {
    const state = summary.state, names = summary.plan.names, tied = summary.forfeitedBy === null && (state.winner === -1 || state.winner === null);
    const winner: 0 | 1 = summary.forfeitedBy !== null ? (summary.forfeitedBy === 0 ? 1 : 0) : state.winner === 0 ? 0 : 1;
    this.headline.textContent = tied ? "무승부" : viewer === null ? names[winner] + " 승리" : winner === viewer ? "승리!" : "패배";
    this.detail.textContent = summary.forfeitedBy !== null ? names[summary.forfeitedBy] + " 기권 (자리 비움·나감)" : state.endNote || names[0] + " " + state.score[0] + " : " + state.score[1] + " " + names[1];
    this.lines.hidden = false;
    this.lines.innerHTML = BbBoxTable.html(BbBoxTable.sheetOf(BbReportBuilder.fromSummary("view", summary, viewer === null ? 1 : viewer, false, false, false, 1)));
  }

  private addFacts(title: string, facts: ReadonlyArray<readonly [string, string]>): void {
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
  private static readonly ASSET_DIRECTORY = "assets/kaykit/";
  private static readonly SCREENS: readonly string[] = ["startScreen", "roomScreen", "partyScreen", "resultScreen"];
  private static readonly NOTICE_SECONDS = 2.5;
  private static readonly SEED_SPAN = 1000000007;
  private static readonly AI_FALLBACK_MS = 120000;
  private static readonly CLIENT_VERSION = 20261113;

  private readonly stage: BbStage;
  private readonly hud: BbScoreHud;
  private readonly director: BbMatchDirector;
  private readonly sheet: BbSheetDialog;
  private readonly room: BbRoomCard;
  private readonly result: BbResultCard;
  private readonly menu: BbGameMenu;
  private readonly pause: BbPauseBanner;
  private readonly corner: HTMLElement;
  private readonly profile = new PlayerProfile();
  private readonly backend = new RkBackend();
  private readonly directory = new RkDirectory<BbPlayerRecord>(this.backend, BbRoomRules.RULES);
  private readonly seatPlan = new RkSeatPlan(BbRoomRules.RULES);
  private readonly myId = RkReloadResume.identity(BbRoomRules.RULES);
  private session: RkSession<BbPlayerRecord> | null = null;
  private link: BbRoomLink | null = null;
  private presence: BbPresenceWatch | null = null;
  private live: BbRoomMatch | null = null;
  private liveOver = false;
  private game: BbLocalGame | null = null;
  private setup: BbRoomSetup = BbRoomRules.BLANK_SETUP;
  private last: { mode: BbGameMode; level: BbAiLevelId } = { mode: "match", level: "normal" };
  private showcaseSeed = 4100;
  private shown: string | null = "startScreen";
  private readonly zones = new BbZoneSwitch();
  private readonly account = new BbAccount(() => this.zones.on);
  private readonly rates = new BbVersusRates(this.account, () => this.zones.on);
  private readonly versus: VersusCurtain;
  private readonly board: BbBoardPanel;
  private random: MkRandomFlow | null = null;

  constructor(libs: ThreeLibs) {
    const controls = document.getElementById("bbControls") as HTMLElement, dialogs = document.getElementById("bbDialogs") as HTMLElement;
    this.stage = new BbStage(libs, document.getElementById("bbView") as HTMLCanvasElement);
    this.hud = new BbScoreHud(document.getElementById("hudTop") as HTMLElement);
    this.director = new BbMatchDirector(this.stage, this.hud, controls, { onEnd: (summary) => this.ended(summary), onLog: (log) => this.logged(log) });
    this.pause = new BbPauseBanner(controls);
    this.sheet = new BbSheetDialog(dialogs, () => this.sheetChanged());
    this.corner = document.getElementById("sheetCorner") as HTMLElement;
    this.corner.addEventListener("click", () => this.sheet.open());
    this.room = new BbRoomCard(document.getElementById("roomMount") as HTMLElement, { change: (setup) => this.changeSetup(setup), start: () => this.startFromRoom(), leave: () => this.leaveRoom("") });
    this.result = new BbResultCard(document.getElementById("resultMount") as HTMLElement, () => this.again(), () => this.leaveRoom(""));
    this.menu = new BbGameMenu(controls, [
      { label: "연출 빠르게", onFlip: (on) => this.director.quicken(on) },
      { label: "타자 시점으로 보기(관전)", onFlip: (on) => this.director.watch(on ? "batter" : "pitcher") }
    ], [["연출 건너뛰기", () => this.director.skipScene()], ["나가기", () => this.leaveGame()]]);
    (document.getElementById("btnCreate") as HTMLElement).addEventListener("click", () => { this.createRoom(); });
    (document.getElementById("btnRandom") as HTMLElement).addEventListener("click", () => { this.createParty(); });
    (document.getElementById("btnJoin") as HTMLElement).addEventListener("click", () => { this.joinRoom(); });
    window.addEventListener("pagehide", () => { if (this.session) this.session.removeMineOnUnload(); });
    this.versus = new VersusCurtain(document.getElementById("versusCurtain") as HTMLElement, new BbVersusContent(), {
      inRoom: () => !!this.session, waiting: () => !!this.session && this.session.status === "lobby", randomMatch: () => !!this.ticket(),
      roomShownAt: () => (this.session ? Number(this.session.value<number>("vsAt")) || 0 : 0), sides: () => this.versusSides(), now: () => this.backend.now()
    }, ["손님 · 초 공격", "방장 · 말 공격"]);
    const portal = window.PORTAL_CLASS;
    this.board = new BbBoardPanel(document.getElementById("boardMount") as HTMLElement, this.backend, portal ? portal.id : null);
    this.account.bind();
    this.showScreen("startScreen");
    this.load().catch((error: Error) => this.notice("불러오지 못했어요: " + error.message));
  }

  private async load(): Promise<void> {
    this.zones.load(this.backend);
    this.board.load();
    await this.stage.load(BbDuelGame.ASSET_DIRECTORY, BbBallparkRegistry.MAIN, { batsLeft: false, throwsLeft: false });
    const saved = BbLocalResume.load();
    if (saved) this.play(saved, "방금 상황을 불러왔어요");
    else {
      this.showcase();
      RkReloadResume.resumeInto(this.backend, BbRoomRules.RULES, (code) => this.enterRoom(code, false, ""));
    }
    this.stage.run((frameSeconds) => this.tick(frameSeconds));
  }

  private tick(frameSeconds: number): void {
    const live = this.live, link = this.link, presence = this.presence;
    if (live && link && presence && !this.liveOver) {
      const missing = presence.missing(live), expired = this.pause.step(frameSeconds, !!missing);
      this.director.halt(this.pause.paused);
      link.hold(this.pause.paused);
      if (expired && missing) this.claimEnd(BbRoomRules.teamOf(live, missing) === 0 ? 1 : 0);
      link.pump();
    }
    this.director.tick(frameSeconds);
  }

  private myName(): string { return PlayerProfile.storedNick() || "나"; }

  private myRecord(): BbPlayerRecord {
    const record: BbPlayerRecord = { nick: this.myName(), isBot: false, joinedAt: this.backend.now(), slot: BbRoomRules.HOST_TEAM, look: this.profile.look, spectator: false, sheet: BbProfileStore.teamOf(BbProfileStore.load()) };
    const card = this.rates.forRoom();
    if (card) record.vs = card;
    return record;
  }

  private ticket(): MkTicket | null { return this.random ? this.random.ticket() : null; }

  private flow(): MkRandomFlow {
    if (this.random) return this.random;
    const account = this.account;
    this.random = RkRandomSetup.create<BbPlayerRecord>({
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
        showParty: () => { this.showScreen("partyScreen"); (this.random as MkRandomFlow).render(); },
        showStart: (message) => { this.showScreen("startScreen"); if (message) this.notice(message); },
        presentIds: () => (this.session ? RkMatchHooks.humanIds(this.session.players) : [])
      },
      screen: document.getElementById("partyScreen") as HTMLElement,
      mount: document.getElementById("partyMount") as HTMLElement
    });
    return this.random;
  }

  private async createParty(): Promise<void> {
    if (!this.backend.database) { this.notice("서버에 연결하지 못했어요"); return; }
    try {
      await this.rates.loadOnce();
      const message = await this.flow().create();
      if (message) this.notice(message);
    } catch (error) {
      this.notice("랜덤 매칭 방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
    }
  }

  private async enterTicketRoom(code: string, hosting: boolean): Promise<boolean> {
    if (!hosting) {
      const outcome = await this.directory.join(code, this.myId, this.myRecord(), false, true).catch(() => null);
      if (!outcome || !outcome.ok) return false;
    }
    this.enterRoom(code, hosting, "매칭됐어요! 곧 시작해요.");
    return true;
  }

  private inParty(): boolean { return !!this.random && this.random.inParty(); }

  private versusSides(): [VersusSideData, VersusSideData] | null {
    const session = this.session;
    if (!session) return null;
    const ticket = this.ticket(), assign = session.value<Record<string, number>>("assign"), setup = BbRoomRules.setupOf(session.value<BbRoomSetup>("setup"));
    const seats = this.seatPlan.humanSeats(session.players);
    const ids: [string | null, string | null] = ticket && assign ? [BbRoomRules.assignedTo(assign, 0), BbRoomRules.assignedTo(assign, 1)] : [seats[0], seats[BbRoomRules.HOST_TEAM]];
    if (!ids[0] && !ids[1]) return null;
    const names = (ticket && ticket.rivalIds) || {};
    const side = (team: 0 | 1): VersusSideData => {
      const id = ids[team], record = id ? session.players.get(id) || null : null, ai = !id && (!!ticket || setup.ai);
      return BbVersusLineup.side(id, record ? { nick: record.nick, vs: record.vs } : null, ai ? "AI" : id ? names[id] || "" : "", team, this.myId, ai);
    };
    return [side(0), side(1)];
  }

  private leaveReport(randomOnly: boolean): BbStatsReport | null {
    const live = this.live, session = this.session, summary = this.director.summary();
    const mine = live ? BbRoomRules.teamOf(live, this.myId) : null, random = !!this.ticket();
    if (!live || !session || !summary || mine === null || this.liveOver || (randomOnly && !random)) return null;
    const progress = AccountForfeit.progressOnLeave(random, this.director.matchProgress());
    return BbReportBuilder.fromSummary(this.matchKey(session, live), summary, mine, live.seats.s0 !== BbRoomRules.AI_SEAT && live.seats.s1 !== BbRoomRules.AI_SEAT, random, true, progress);
  }

  private matchKey(session: RkSession<BbPlayerRecord>, match: BbRoomMatch): string {
    const ticket = this.ticket();
    return ticket ? ticket.matchId : session.code + "_" + match.id;
  }

  private notice(text: string): void {
    const note = document.getElementById("startNote") as HTMLElement;
    note.textContent = text;
    window.setTimeout(() => { if (note.textContent === text) note.textContent = ""; }, BbDuelGame.NOTICE_SECONDS * 1000);
  }

  private showScreen(shown: string | null): void {
    this.shown = shown;
    BbDuelGame.SCREENS.forEach((id) => { (document.getElementById(id) as HTMLElement).hidden = id !== shown; });
    document.body.classList.toggle("menu", shown !== null);
    this.corner.hidden = shown !== "startScreen" && shown !== "roomScreen";
    this.menu.shut();
  }

  private showcase(): void {
    const plan = BbModeRules.showcase(this.showcaseSeed++);
    this.game = null;
    this.director.halt(false);
    this.director.orbit(true);
    this.director.begin(plan, new BbLocalLink(this.director, plan.seed));
  }

  private async createRoom(): Promise<void> {
    this.setup = BbRoomRules.BLANK_SETUP;
    if (!this.backend.database) { this.openRoom(""); return; }
    try {
      await this.rates.loadOnce();
      const code = await this.directory.create(this.myId, this.myRecord(), { setup: this.setup }, (taken) => this.flow().codeTaken(taken));
      if (code) this.enterRoom(code, true, "");
      else this.notice("방을 만들지 못했어요. 다시 눌러 주세요.");
    } catch (error) {
      this.openRoom("서버에 연결하지 못해 혼자 하기만 됩니다");
    }
  }

  private async joinRoom(): Promise<void> {
    const code = (document.getElementById("joinCode") as HTMLInputElement).value.replace(/\D/g, "");
    if (!this.backend.database) { this.notice("서버에 연결하지 못했어요"); return; }
    if (code.length !== 5) { this.notice("방 코드 5자리를 입력해 주세요."); return; }
    try {
      await this.rates.loadOnce();
      const party = await this.flow().tryJoin(code);
      if (party.handled) { if (party.message) this.notice(party.message); return; }
      const outcome = await this.directory.join(code, this.myId, this.myRecord(), false);
      if (outcome.ok) this.enterRoom(code, false, outcome.message);
      else this.notice(outcome.message);
    } catch (error) {
      this.notice("방을 불러오지 못했어요.");
    }
  }

  private openRoom(note: string): void {
    this.showScreen("roomScreen");
    this.drawRoom(note);
  }

  private enterRoom(code: string, hosting: boolean, note: string): void {
    const session = new RkSession<BbPlayerRecord>(this.backend, BbRoomRules.RULES, code, this.myId, hosting, BbRoomRules.VALUES);
    this.session = session;
    this.hud.room(code);
    (document.getElementById("joinCode") as HTMLInputElement).value = code;
    session.onChange = (kind) => this.roomChanged(kind);
    session.onClosed = (message) => this.leaveRoom(message);
    session.onHostTakeover = () => this.roomChanged("host");
    session.connect();
    this.openRoom(note);
    this.versus.sync();
  }

  private drawRoom(note: string): void {
    const session = this.session;
    if (!session) { this.room.draw({ code: "", setup: this.setup, guest: null, host: this.myName(), editable: true, watchers: 0, notice: note }); return; }
    const seats = this.seatPlan.humanSeats(session.players), nameOf = (id: string | null) => { const record = id ? session.players.get(id) : null; return record ? record.nick : null; };
    this.room.draw({
      code: session.code, setup: BbRoomRules.setupOf(session.value<BbRoomSetup>("setup")), guest: nameOf(seats[0]), host: nameOf(seats[BbRoomRules.HOST_TEAM]) || "방장",
      editable: session.isHost(), watchers: this.seatPlan.spectators(session.players).length, notice: session.isSpectator() ? "관전으로 들어왔습니다" : note
    });
  }

  private roomChanged(kind: string): void {
    const session = this.session;
    if (!session) return;
    const match = session.value<BbRoomMatch>("match"), end = session.value<BbRoomEnd>("end");
    if (session.status === "play" && match && (!this.live || this.live.id !== match.id)) { this.versus.sync(); if (this.random && kind === "match") this.random.armMatch(); this.startOnline(session, match); return; }
    if (session.status === "lobby" && this.live) {
      this.closeLive();
      this.showcase();
      this.showScreen("roomScreen");
    }
    if (this.live && !this.liveOver && end && end.match === this.live.id) this.director.forfeit(end.winner === 0 ? 1 : 0);
    if (this.live && !this.liveOver && kind === "host") this.director.reseat(BbRoomRules.seatsFor(this.live, this.myId, session.isHost()));
    if (this.shown === "roomScreen") this.drawRoom("");
    const random = this.random;
    if (random && (kind === "players" || kind === "host" || kind === "status")) random.roomChanged(this.seatPlan.humanSeats(session.players).filter((id) => !!id).length, session.isHost(), session.status === "lobby");
    if (random && kind === "match") random.armMatch();
    this.versus.sync();
  }

  private changeSetup(setup: BbRoomSetup): void {
    const session = this.session;
    if (!session) { this.setup = setup; this.drawRoom(""); return; }
    if (session.isHost()) session.writeValue("setup", setup);
  }

  private sheetChanged(): void {
    if (this.session && !this.live) this.session.ref.child("players/" + this.myId + "/sheet").set(BbProfileStore.teamOf(BbProfileStore.load()));
  }

  private startFromRoom(): void {
    const session = this.session, setup = session ? BbRoomRules.setupOf(session.value<BbRoomSetup>("setup")) : this.setup;
    if (setup.mode !== "match") { this.dropSession(); this.startGame(setup.mode, setup.level); return; }
    if (!session) { if (setup.ai) this.startGame("match", setup.level); return; }
    if (!session.isHost()) return;
    if (this.guestId(session)) this.versus.requestRoomStart((at) => { session.ref.update({ vsAt: at }); }, () => { if (this.session === session) this.launchMatch(false); });
    else this.launchMatch(false);
  }

  private guestId(session: RkSession<BbPlayerRecord>): string | null {
    const humans = this.seatPlan.humanSeats(session.players).filter((id): id is string => !!id && id !== this.myId);
    return humans[0] || null;
  }

  private launchMatch(randomMatch: boolean): void {
    const session = this.session;
    if (!session || !session.isHost() || session.status !== "lobby") return;
    const setup = randomMatch ? { mode: "match" as BbGameMode, level: "normal" as BbAiLevelId, ai: true } : BbRoomRules.setupOf(session.value<BbRoomSetup>("setup"));
    const guestId = this.guestId(session), guest = guestId ? session.players.get(guestId) || null : null, mine = session.me();
    if (!mine || (!guest && !setup.ai)) return;
    const rival: BbTeamSheet = guest ? BbProfileStore.teamOf(guest.sheet) : { lineup: [BbAiLevel.batterSheet("R")], pitchers: [BbAiLevel.pitcherSheet("R")] };
    const match: BbRoomMatch = {
      id: this.backend.now(), seats: { s0: guest ? guestId as string : BbRoomRules.AI_SEAT, s1: this.myId }, sheets: [rival, BbProfileStore.teamOf(mine.sheet)],
      names: [guest ? guest.nick : "AI " + BbAiLevel.ALL[setup.level].label, mine.nick], level: setup.level
    };
    session.ref.update({ match, status: "play", end: null, log: null });
  }

  private scouting(session: RkSession<BbPlayerRecord>, match: BbRoomMatch): [BbTeamScout | null, BbTeamScout | null] {
    const scout = (id: string): BbTeamScout | null => {
      const record = id === BbRoomRules.AI_SEAT ? null : session.players.get(id), built = record ? BbScoutBuilder.of(BbVersusCards.fromRoom(record.vs)) : null;
      return built && !this.zones.on ? { batStats: built.batStats, pitStats: built.pitStats, hitHeat: null, pitchHeat: null } : built;
    };
    return [scout(match.seats.s0), scout(match.seats.s1)];
  }

  private async startOnline(session: RkSession<BbPlayerRecord>, match: BbRoomMatch): Promise<void> {
    this.closeLive();
    this.live = match;
    this.liveOver = false;
    this.game = null;
    const link = new BbRoomLink(this.director, session, this.backend), log = await link.open();
    if (this.session !== session || this.live !== match) { link.close(); return; }
    this.link = link;
    this.presence = new BbPresenceWatch(session);
    this.showScreen(null);
    this.director.orbit(false);
    this.director.begin({
      format: new BbOneInningFormat(), teams: [BbProfileStore.teamOf(match.sheets[0]), BbProfileStore.teamOf(match.sheets[1])], names: match.names,
      seats: BbRoomRules.seatsFor(match, this.myId, session.isHost()), level: BbAiLevel.ALL[match.level] || BbAiLevel.ALL.normal, seed: match.id % BbDuelGame.SEED_SPAN,
      halvesToPlay: null, log, view: BbRoomRules.teamOf(match, this.myId) === null ? "pitcher" : null, autoSwingAt: null, scouting: this.scouting(session, match)
    }, link);
    if (log.length) this.director.say("방금 상황을 불러왔어요");
    if (this.random) this.random.armMatch();
  }

  private closeLive(): void {
    if (this.link) this.link.close();
    if (this.presence) this.presence.close();
    this.link = null;
    this.presence = null;
    this.live = null;
    this.liveOver = false;
    this.pause.clear();
    this.director.halt(false);
  }

  private claimEnd(winner: 0 | 1): void {
    const session = this.session, live = this.live;
    if (!session || !live) return;
    session.ref.child("end").transaction((current) => (current !== null && current !== undefined ? undefined : { winner, match: live.id })).catch(() => undefined);
  }

  private startGame(mode: BbGameMode, level: BbAiLevelId): void {
    const profile = BbProfileStore.load(), mine: BbTeamSheet = { lineup: profile.lineup, pitchers: profile.pitchers }, rival: BbTeamSheet = { lineup: [BbAiLevel.batterSheet("R")], pitchers: [BbAiLevel.pitcherSheet("R")] };
    const human = BbModeRules.humanTeam(mode);
    this.last = { mode, level };
    this.play({ mode, level, seed: Math.floor(Math.random() * 1e9) + 1, me: this.myName(), teams: human === 1 ? [rival, mine] : [mine, rival], log: [] }, "");
  }

  private play(game: BbLocalGame, note: string): void {
    const plan = BbModeRules.plan(game);
    this.game = game;
    this.last = { mode: game.mode, level: game.level };
    this.hud.room("");
    BbLocalResume.save(game);
    this.showScreen(null);
    this.director.orbit(false);
    this.director.begin(plan, new BbLocalLink(this.director, plan.seed + game.log.length));
    if (note) this.director.say(note);
  }

  private logged(log: readonly BbLogEntry[]): void {
    if (!this.game) return;
    this.game.log = log.slice();
    BbLocalResume.save(this.game);
  }

  private ended(summary: BbMatchSummary): void {
    const game = this.game, live = this.live;
    if (live && !this.liveOver) {
      this.liveOver = true;
      this.pause.clear();
      const mine = BbRoomRules.teamOf(live, this.myId), random = this.random, ticket = this.ticket(), session = this.session;
      const hostLabel = this.session && this.session.isHost() ? "방으로 돌아가기" : "방장을 기다리는 중";
      this.result.show(summary, "match", mine, ticket ? "" : hostLabel, ticket ? "팀 대기실로" : "나가기");
      this.showScreen("resultScreen");
      this.showcase();
      if (mine !== null && session) this.recordEnd(session, live, summary, mine);
      if (random && ticket && mine !== null) {
        const report = BbReportBuilder.fromSummary("x", summary, mine, true, true, false, 1), result: MkResult = report.winner === -1 ? "draw" : report.winner === mine ? "win" : "lose";
        const hint = () => this.result.note(random.endHint());
        hint();
        random.matchEnded({ result }, hint);
      }
      return;
    }
    if (!game) { this.showcase(); return; }
    BbLocalResume.clear();
    this.result.show(summary, game.mode, BbModeRules.humanTeam(game.mode), "다시 하기");
    this.showScreen("resultScreen");
    this.showcase();
  }

  private recordEnd(session: RkSession<BbPlayerRecord>, live: BbRoomMatch, summary: BbMatchSummary, mine: 0 | 1): void {
    const rival = live.seats.s0 !== BbRoomRules.AI_SEAT && live.seats.s1 !== BbRoomRules.AI_SEAT;
    if (!rival) return;
    const report = BbReportBuilder.fromSummary(this.matchKey(session, live), summary, mine, rival, !!this.ticket(), false, 1);
    this.account.record(report);
    this.rates.note(report);
  }

  private again(): void {
    const session = this.session;
    if (!session) { this.startGame(this.last.mode, this.last.level); return; }
    if (session.isHost()) session.ref.update({ status: "lobby", match: null, end: null, log: null });
  }

  private dropSession(): void {
    const session = this.session;
    this.closeLive();
    this.session = null;
    this.hud.room("");
    this.versus.cancelStart();
    if (session) session.leave();
    this.versus.sync();
  }

  private leaveRoom(message: string): void {
    if (this.inParty()) { (this.random as MkRandomFlow).backToParty(message); return; }
    this.dropSession();
    this.showScreen("startScreen");
    if (message) this.notice(message);
  }

  private leaveGame(): void {
    const live = this.live, mine = live ? BbRoomRules.teamOf(live, this.myId) : null, random = !!this.ticket();
    const question = random && mine !== null && !this.liveOver ? MkForfeit.QUESTION : "경기를 그만두고 나갈까요?";
    if ((!this.game && !live) || !window.confirm(question)) return;
    if (live && mine !== null && !this.liveOver) {
      const report = this.leaveReport(false);
      if (report && report.rival) this.account.record(report);
      if (this.random) this.random.forfeitIfLate(this.director.matchProgress());
      this.claimEnd(mine === 0 ? 1 : 0);
    }
    BbLocalResume.clear();
    this.leaveRoom("");
    this.showcase();
  }
}
