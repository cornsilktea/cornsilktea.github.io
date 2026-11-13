interface BbPlayLabOptions {
  batsLeft: boolean;
  throwsLeft: boolean;
  seed: number;
  level: BbAiLevelId;
  autoSwingAt: number | null;
  autoPitch: boolean;
  plain: boolean;
}

class BbPlayLabAddress {
  private static readonly DEFAULT_SEED = 41;

  static read(): BbPlayLabOptions {
    const query = new URLSearchParams(location.search), level = query.get("level"), swing = query.get("swing");
    return {
      batsLeft: query.get("bat") === "L", throwsLeft: query.get("arm") === "L",
      seed: Number(query.get("seed") || BbPlayLabAddress.DEFAULT_SEED) || BbPlayLabAddress.DEFAULT_SEED,
      level: level === "easy" || level === "hard" ? level : "normal",
      autoSwingAt: swing === null ? null : (Number(swing) || 0) / 1000, autoPitch: query.has("autopitch"),
      plain: query.has("plain")
    };
  }
}

interface BbPendingPitch {
  roll: BbPitchRoll;
  setting: BbPlaySetting;
  hands: BbStageCast;
  pitcherHand: BbHand;
  abilities: BbBatterAbilities;
  leniency: number;
  fielding: 0 | 1;
  before: BbBoardSnapshot;
  settled: BbSettledPitch | null;
  announced: boolean;
}

class BbPlayLab {
  private static readonly ASSET_DIRECTORY = "../assets/kaykit/";
  private static readonly HUMAN_TEAM = 1;
  private static readonly SWING_CLOSES_AFTER = 0;
  private static readonly END_TOAST_SECONDS = 600;
  private static readonly FAST_PACE = 2.2;
  private static readonly IN_PLAY_VERDICT = "타격";
  private static readonly PLAIN_CALLS: Readonly<Record<BbOutcomeKind, string>> = { ball: "볼", calledStrike: "스트라이크!", swingMiss: "헛스윙", foul: "파울", inPlay: "" };

  private readonly options = BbPlayLabAddress.read();
  private readonly stage: BbStage;
  private readonly hud: BbScoreHud;
  private readonly player: BbScenePlayer;
  private readonly scenes: BbSceneFactory;
  private session: BbDuelSession;
  private readonly sheet: BbSheetDialog;
  private fast = false;
  private readonly pad: BbPitchPad;
  private readonly swing: BbSwingButton;
  private readonly report: BbPitchReport;
  private readonly ticker: BbBoardTicker;
  private readonly cards: BbMatchupCards;
  private readonly names: readonly string[];
  private readonly toast: BbCallToast;
  private readonly level: BbAiTuning;
  private readonly queued: BbScene[] = [];
  private pending: BbPendingPitch | null = null;
  private waitingForCall = false;
  private over = false;

  constructor(libs: ThreeLibs) {
    const controls = document.getElementById("bbControls") as HTMLElement;
    this.level = BbAiLevel.ALL[this.options.level];
    this.stage = new BbStage(libs, document.getElementById("labView") as HTMLCanvasElement);
    this.hud = new BbScoreHud(document.getElementById("hudTop") as HTMLElement);
    this.names = ["AI " + this.level.label, "나"];
    this.hud.players(this.names[0], this.names[1]);
    this.cards = new BbMatchupCards(controls);
    this.toast = new BbCallToast(controls);
    this.report = new BbPitchReport(controls);
    this.ticker = new BbBoardTicker(this.hud);
    this.player = new BbScenePlayer(this.stage, this.hud, (call) => this.called(call));
    this.scenes = new BbSceneFactory(() => this.stage.metrics);
    this.session = this.newSession();
    this.pad = new BbPitchPad(controls, (call) => this.humanThrows(call));
    this.swing = new BbSwingButton(controls, () => this.humanSwings());
    this.sheet = new BbSheetDialog(controls, () => this.showCards());
    new BbGameMenu(controls, [{ label: "연출 빠르게", onFlip: (on) => { this.fast = on; } }], [["연출 건너뛰기", () => this.skipScene()], ["나가기", () => location.reload()]]);
    if (this.options.plain) document.body.classList.add("plain");
    this.start().catch((error: Error) => this.toast.show("불러오지 못했어요", error.message, BbPlayLab.END_TOAST_SECONDS));
  }

  private async start(): Promise<void> {
    await this.stage.load(BbPlayLab.ASSET_DIRECTORY, BbBallparkRegistry.MAIN, { batsLeft: this.options.batsLeft, throwsLeft: this.options.throwsLeft });
    (document.getElementById("labLoading") as HTMLElement).remove();
    if (this.options.autoPitch || this.options.autoSwingAt !== null) this.nextPitch();
    else this.openLobby();
    this.stage.run((frameSeconds) => this.tick(frameSeconds));
  }

  private newSession(): BbDuelSession {
    const profile = BbProfileStore.load(), batter = profile.lineup[0], pitcher = profile.pitchers[0];
    const sheets: [BbTeamSheet, BbTeamSheet] = [
      { lineup: [BbAiLevel.batterSheet("R")], pitchers: [BbAiLevel.pitcherSheet("R")] },
      { lineup: [{ ...batter, hand: this.options.batsLeft ? "L" : batter.hand }], pitchers: [{ ...pitcher, hand: this.options.throwsLeft ? "L" : pitcher.hand }] }
    ];
    return new BbDuelSession(new BbThreeInningFormat(), BbBallparkRegistry.MAIN.dimensions, sheets, new BbSeededRandom(this.options.seed));
  }

  private openLobby(): void {
    const controls = document.getElementById("bbControls") as HTMLElement;
    document.body.classList.add("lobby");
    this.waitingForCall = true;
    this.showCards();
    this.ticker.begin(this.session.board());
    this.player.play(this.idleScene());
    new BbLabLobby(controls, "야구 1대1 대전 · 조작 시험장", () => { document.body.classList.remove("lobby"); this.session = this.newSession(); this.nextPitch(); }, () => this.sheet.open());
  }

  private showCards(): void {
    if (document.body.classList.contains("lobby")) this.session = this.newSession();
    this.cards.show(this.names[this.session.battingIndex], this.session.batter(), this.names[this.session.fieldingIndex], this.session.pitcher(), this.session.board().pitches);
  }

  private skipScene(): void {
    const pending = this.pending;
    if (this.over || this.waitingForCall || (pending && (!pending.settled || !pending.announced))) return;
    this.player.skip();
  }

  private humanFields(): boolean { return this.session.fieldingIndex === BbPlayLab.HUMAN_TEAM; }

  private hands(): BbStageCast { return { batsLeft: this.session.batter().hand === "L", throwsLeft: this.session.pitcher().hand === "L" }; }

  private idleScene(): BbScene {
    const session = this.session, roll = session.roll({ pitch: "ft", aim: { u: 0, v: 0 } });
    return this.scenes.pitch({ outcome: session.preview(roll), pitcherHand: session.pitcher().hand, abilities: session.batter().abilities, setting: session.setting() }, session.fieldingIndex, this.hands());
  }

  private nextPitch(): void {
    if (this.session.state.finished) { this.finish(); return; }
    this.player.view = this.humanFields() ? "pitcher" : "batter";
    this.ticker.begin(this.session.board());
    this.showCards();
    this.report.hide();
    if (this.humanFields() && this.options.autoPitch) {
      this.swing.hide();
      this.throwPitch(this.session.aiCall(this.level), (roll) => this.session.aiSwing(roll, this.level));
      return;
    }
    if (this.humanFields()) {
      this.swing.hide();
      this.waitingForCall = true;
      this.player.play(this.idleScene());
      this.pad.open(this.session.pitcher());
      return;
    }
    this.throwPitch(this.session.aiCall(this.level), null);
    this.swing.arm();
  }

  private throwPitch(call: BbPitchCall, swingOffset: ((roll: BbPitchRoll) => number | null) | null): void {
    const session = this.session, before = session.board(), setting = session.setting(), fielding = session.fieldingIndex, roll = session.roll(call);
    const batter = session.batter();
    this.pending = { roll, setting, fielding, before, hands: this.hands(), pitcherHand: session.pitcher().hand, abilities: batter.abilities, leniency: BbBatterAbilityModel.leniency(batter.abilities.contact), settled: null, announced: false };
    this.waitingForCall = false;
    if (swingOffset) this.settle(swingOffset(roll), false);
    else this.player.play(this.sceneOf(session.preview(roll)));
  }

  private sceneOf(outcome: BbPitchOutcome): BbScene {
    const pending = this.pending as BbPendingPitch;
    return this.scenes.pitch({ outcome, pitcherHand: pending.pitcherHand, abilities: pending.abilities, setting: pending.setting }, pending.fielding, pending.hands);
  }

  private settle(contactOffset: number | null, midFlight: boolean): void {
    const pending = this.pending as BbPendingPitch, settled = this.close(pending, contactOffset), scene = this.sceneOf(settled.outcome);
    if (midFlight) this.player.replace(scene);
    else this.player.play(scene);
  }

  private called(call: BbCallCue): void {
    if (call.text) this.toast.show(call.text);
    if (call.tally) this.ticker.tally(call.tally, this.session.board());
  }

  private close(pending: BbPendingPitch, contactOffset: number | null): BbSettledPitch {
    const settled = this.session.settle(pending.roll, contactOffset);
    pending.settled = settled;
    if (settled.note.halfOver && !this.session.state.finished) this.scenes.swap(pending.fielding, pending.hands).forEach((swap) => this.queued.push(swap));
    return settled;
  }

  private humanThrows(call: BbPitchCall): void {
    if (!this.waitingForCall) return;
    this.throwPitch(call, (roll) => this.session.aiSwing(roll, this.level));
  }

  private humanSwings(): void {
    const pending = this.pending;
    if (!pending || pending.settled) return;
    this.settle(this.player.seconds + BbTimingModel.SWING_DELAY - this.player.arriveAt, true);
  }

  private announce(pending: BbPendingPitch): void {
    const settled = pending.settled as BbSettledPitch, outcome = settled.outcome, play = outcome.script;
    pending.announced = true;
    this.ticker.thrown(!!play && play.result !== "FOUL");
    this.showCards();
    const verdict = play ? BbPlayLab.IN_PLAY_VERDICT : settled.note.toast || BbPlayLab.PLAIN_CALLS[outcome.kind];
    this.report.show(pending.roll, verdict, outcome.swing, pending.leniency, this.player.view);
    if (play) return;
    this.ticker.settle(this.session.board());
    this.toast.show(verdict);
  }

  private finish(): void {
    const score = this.session.state.score, mine = score[BbPlayLab.HUMAN_TEAM], theirs = score[1 - BbPlayLab.HUMAN_TEAM];
    this.over = true;
    this.pad.close();
    this.swing.hide();
    this.toast.show(mine > theirs ? "승리!" : mine < theirs ? "패배" : "무승부", theirs + " : " + mine, BbPlayLab.END_TOAST_SECONDS);
  }

  private tick(frameSeconds: number): void {
    this.toast.tick(frameSeconds);
    this.pad.tick(frameSeconds);
    if (this.over || this.waitingForCall) this.player.idle(frameSeconds);
    else this.advance(frameSeconds);
    this.player.frame(frameSeconds);
  }

  private advance(frameSeconds: number): void {
    const pending = this.pending, eased = this.fast && (!pending || (pending.announced && !!(pending.settled as BbSettledPitch).outcome.script));
    this.player.advance(frameSeconds * (eased ? BbPlayLab.FAST_PACE : 1));
    const auto = this.options.autoSwingAt;
    if (pending && !pending.settled && auto !== null && this.player.seconds >= this.player.arriveAt + auto - BbTimingModel.SWING_DELAY) { this.swing.disarm(); this.humanSwings(); }
    if (pending && !pending.settled && this.player.seconds >= this.player.arriveAt + BbPlayLab.SWING_CLOSES_AFTER) {
      this.swing.disarm();
      this.close(pending, null);
    }
    if (pending && pending.settled && !pending.announced && this.player.seconds >= this.player.arriveAt) this.announce(pending);
    if (!this.player.finished) return;
    this.pending = null;
    const swap = this.queued.shift();
    if (!swap) { this.nextPitch(); return; }
    this.swing.hide();
    this.ticker.begin(this.session.board());
    this.player.play(swap);
  }
}
