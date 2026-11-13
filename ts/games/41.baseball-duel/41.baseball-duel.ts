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

class BbRoomCard {
  private static readonly LEVELS: readonly BbAiLevelId[] = ["easy", "normal", "hard"];
  private readonly modes: HTMLButtonElement[];
  private readonly levels: HTMLButtonElement[];
  private readonly seats: HTMLElement;
  private readonly guest: HTMLElement;
  private readonly host: HTMLElement;
  private readonly rival: HTMLElement;
  private readonly addAi: HTMLButtonElement;
  private readonly dropAi: HTMLButtonElement;
  private readonly levelRow: HTMLElement;
  private readonly start: HTMLButtonElement;
  private mode: BbGameMode = "match";
  private level: BbAiLevelId = "normal";
  private withAi = false;

  constructor(mount: HTMLElement, onStart: (mode: BbGameMode, level: BbAiLevelId) => void, onLeave: () => void) {
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

  open(me: string): void {
    (this.host.lastElementChild as HTMLElement).textContent = me;
    this.withAi = false;
    this.draw();
  }

  private draw(): void {
    const match = this.mode === "match", needsLevel = !match || this.withAi;
    this.modes.forEach((button, index) => button.classList.toggle("on", BbModeRules.ORDER[index] === this.mode));
    this.levels.forEach((button, index) => button.classList.toggle("on", BbRoomCard.LEVELS[index] === this.level));
    this.seats.hidden = !match;
    this.rival.textContent = this.withAi ? "🤖 AI (" + BbAiLevel.ALL[this.level].label + ")" : "사람을 기다리는 중";
    this.addAi.hidden = this.withAi;
    this.dropAi.hidden = !this.withAi;
    this.levelRow.hidden = !needsLevel;
    (this.levelRow.previousElementSibling as HTMLElement).hidden = !needsLevel;
    this.start.disabled = match && !this.withAi;
    this.start.textContent = match ? "시작" : BbModeRules.LABELS[this.mode] + " 시작";
  }
}

class BbResultCard {
  private readonly headline: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly lines: HTMLElement;
  private readonly facts: HTMLElement;

  constructor(mount: HTMLElement, onAgain: () => void, onLeave: () => void) {
    this.headline = BbHudParts.box("bb-result-headline", mount);
    this.detail = BbHudParts.box("bb-result-detail", mount);
    this.lines = BbHudParts.box("bb-result-lines", mount);
    this.facts = BbHudParts.box("bb-result-facts", mount);
    BbSheetParts.button("st-btn primary", mount, "다시 하기", onAgain);
    BbSheetParts.button("st-btn", mount, "나가기", onLeave);
  }

  show(summary: BbMatchSummary, mode: BbGameMode): void {
    const state = summary.state, mine = BbModeRules.humanTeam(mode), names = summary.plan.names;
    this.lines.textContent = "";
    this.facts.textContent = "";
    if (mode === "match") this.showMatch(summary, mine);
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

  private showMatch(summary: BbMatchSummary, mine: 0 | 1): void {
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
  private static readonly SCREENS: readonly string[] = ["startScreen", "roomScreen", "resultScreen"];
  private static readonly NOTICE_SECONDS = 2.5;

  private readonly stage: BbStage;
  private readonly director: BbMatchDirector;
  private readonly sheet: BbSheetDialog;
  private readonly room: BbRoomCard;
  private readonly result: BbResultCard;
  private readonly corner: HTMLElement;
  private game: BbLocalGame | null = null;
  private last: { mode: BbGameMode; level: BbAiLevelId } = { mode: "match", level: "normal" };
  private showcaseSeed = 4100;

  constructor(libs: ThreeLibs) {
    const controls = document.getElementById("bbControls") as HTMLElement, dialogs = document.getElementById("bbDialogs") as HTMLElement;
    this.stage = new BbStage(libs, document.getElementById("bbView") as HTMLCanvasElement);
    this.director = new BbMatchDirector(this.stage, new BbScoreHud(document.getElementById("hudTop") as HTMLElement), controls, { onEnd: (summary) => this.ended(summary), onLog: (log) => this.logged(log) });
    this.sheet = new BbSheetDialog(dialogs, () => undefined);
    this.corner = document.getElementById("sheetCorner") as HTMLElement;
    this.corner.addEventListener("click", () => this.sheet.open());
    this.room = new BbRoomCard(document.getElementById("roomMount") as HTMLElement, (mode, level) => this.startGame(mode, level), () => this.showScreen("startScreen"));
    this.result = new BbResultCard(document.getElementById("resultMount") as HTMLElement, () => this.startGame(this.last.mode, this.last.level), () => this.showScreen("startScreen"));
    new BbGameMenu(controls, [{ label: "연출 빠르게", onFlip: (on) => this.director.quicken(on) }], [["연출 건너뛰기", () => this.director.skipScene()], ["나가기", () => this.leaveGame()]]);
    (document.getElementById("btnCreate") as HTMLElement).addEventListener("click", () => { this.room.open(this.myName()); this.showScreen("roomScreen"); });
    (document.getElementById("btnRandom") as HTMLElement).addEventListener("click", () => this.notice("랜덤 매칭은 준비 중입니다"));
    (document.getElementById("btnJoin") as HTMLElement).addEventListener("click", () => this.notice("방 코드 입장은 준비 중입니다"));
    this.showScreen("startScreen");
    this.load().catch((error: Error) => this.notice("불러오지 못했어요: " + error.message));
  }

  private async load(): Promise<void> {
    await this.stage.load(BbDuelGame.ASSET_DIRECTORY, BbBallparkRegistry.MAIN, { batsLeft: false, throwsLeft: false });
    const saved = BbLocalResume.load();
    if (saved) this.play(saved, "방금 상황을 불러왔어요");
    else this.showcase();
    this.stage.run((frameSeconds) => this.director.tick(frameSeconds));
  }

  private myName(): string { return PlayerProfile.storedNick() || "나"; }

  private notice(text: string): void {
    const note = document.getElementById("startNote") as HTMLElement;
    note.textContent = text;
    window.setTimeout(() => { if (note.textContent === text) note.textContent = ""; }, BbDuelGame.NOTICE_SECONDS * 1000);
  }

  private showScreen(shown: string | null): void {
    BbDuelGame.SCREENS.forEach((id) => { (document.getElementById(id) as HTMLElement).hidden = id !== shown; });
    document.body.classList.toggle("menu", shown !== null);
    this.corner.hidden = shown !== "startScreen" && shown !== "roomScreen";
  }

  private showcase(): void {
    const plan = BbModeRules.showcase(this.showcaseSeed++);
    this.game = null;
    this.director.orbit(true);
    this.director.begin(plan, new BbLocalLink(this.director, plan.seed));
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
    const game = this.game;
    if (!game) { this.showcase(); return; }
    BbLocalResume.clear();
    this.result.show(summary, game.mode);
    this.showScreen("resultScreen");
    this.showcase();
  }

  private leaveGame(): void {
    if (!this.game || !window.confirm("경기를 그만두고 나갈까요?")) return;
    BbLocalResume.clear();
    this.showScreen("startScreen");
    this.showcase();
  }
}
