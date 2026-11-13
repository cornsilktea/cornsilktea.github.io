type BbSeatKind = "human" | "ai" | "remote";

interface BbMatchPlan {
  format: BbMatchFormat;
  teams: [BbTeamSheet, BbTeamSheet];
  names: [string, string];
  seats: [BbSeatKind, BbSeatKind];
  level: BbAiTuning;
  seed: number;
  halvesToPlay: number | null;
  log: BbLogEntry[];
  view: BbLiveView | null;
  autoSwingAt: number | null;
}

interface BbMatchSummary {
  plan: BbMatchPlan;
  state: BbGameState;
  forfeitedBy: 0 | 1 | null;
}

interface BbMatchLink {
  pitchChosen(sequence: number, call: BbPitchCall): void;
  swingChosen(sequence: number, contactOffset: number | null): void;
}

interface BbMatchEvents {
  onEnd(summary: BbMatchSummary): void;
  onLog(log: readonly BbLogEntry[]): void;
}

interface BbPendingPitch {
  sequence: number;
  roll: BbPitchRoll;
  setting: BbPlaySetting;
  hands: BbStageCast;
  pitcherHand: BbHand;
  abilities: BbBatterAbilities;
  leniency: number;
  fielding: 0 | 1;
  settled: BbSettledPitch | null;
  announced: boolean;
  started: boolean;
  batting: BbSeatKind;
}

class BbPitchClock {
  private static readonly WARN_SECONDS = 5;
  private readonly element: HTMLElement;
  private left = 0;
  private shown = -1;

  constructor(host: HTMLElement) { this.element = BbHudParts.box("bb-clock", host); }

  start(seconds: number): void {
    this.left = seconds;
    this.shown = -1;
    this.element.classList.add("open");
    this.tick(0);
  }

  hide(): void {
    this.left = 0;
    this.element.classList.remove("open");
  }

  tick(frameSeconds: number): boolean {
    if (this.left <= 0) return false;
    this.left -= frameSeconds;
    const whole = Math.max(0, Math.ceil(this.left));
    if (whole !== this.shown) {
      this.shown = whole;
      this.element.textContent = String(whole);
      this.element.classList.toggle("warn", whole <= BbPitchClock.WARN_SECONDS);
    }
    if (this.left > 0) return false;
    this.hide();
    return true;
  }
}

class BbLocalLink implements BbMatchLink {
  private readonly seeds: BbSeededRandom;

  constructor(private readonly director: BbMatchDirector, seed: number) { this.seeds = new BbSeededRandom(seed ^ 0x2f6e2b1); }

  pitchChosen(sequence: number, call: BbPitchCall): void { this.director.deliverPitch(sequence, call, this.seeds.seed()); }
  swingChosen(sequence: number, contactOffset: number | null): void { this.director.deliverSwing(sequence, contactOffset); }
}

class BbMatchDirector {
  private static readonly SWING_CLOSES_AFTER = 0;
  private static readonly FAST_PACE = 2.2;
  private static readonly PITCH_SECONDS = 12;
  private static readonly REMOTE_LEAD = 0.8;
  private static readonly HOLD_BEFORE = 0.42;
  private static readonly AWAY_AFTER = 3;
  private static readonly FORFEIT_AFTER = 5;
  private static readonly IDLE_SEED = 41;
  private static readonly ORBIT_RADIUS = 70;
  private static readonly ORBIT_HEIGHT = 40;
  private static readonly ORBIT_TURN = 0.05;
  private static readonly ORBIT_CENTER = 22;
  private static readonly RESUME_STRIDE = 7919;
  private static readonly IN_PLAY_VERDICT = "타격";
  private static readonly PLAIN_CALLS: Readonly<Record<BbOutcomeKind, string>> = { ball: "볼", calledStrike: "스트라이크!", swingMiss: "헛스윙", foul: "파울", inPlay: "" };

  private readonly player: BbScenePlayer;
  private readonly scenes: BbSceneFactory;
  private readonly pad: BbPitchPad;
  private readonly swing: BbSwingButton;
  private readonly report: BbPitchReport;
  private readonly ticker: BbBoardTicker;
  private readonly cards: BbMatchupCards;
  private readonly toast: BbCallToast;
  private readonly clock: BbPitchClock;
  private readonly queued: BbScene[] = [];
  private plan!: BbMatchPlan;
  private session!: BbDuelSession;
  private link!: BbMatchLink;
  private chance = new BbSeededRandom(1);
  private pending: BbPendingPitch | null = null;
  private waitingForCall = false;
  private running = false;
  private staged = false;
  private fast = false;
  private idlePitches = 0;
  private orbiting = false;
  private halted = false;
  private orbitAngle = 0;

  constructor(private readonly stage: BbStage, private readonly hud: BbScoreHud, host: HTMLElement, private readonly events: BbMatchEvents) {
    this.cards = new BbMatchupCards(host);
    this.toast = new BbCallToast(host);
    this.report = new BbPitchReport(host);
    this.clock = new BbPitchClock(host);
    this.ticker = new BbBoardTicker(hud);
    this.player = new BbScenePlayer(stage, hud, (call) => this.called(call));
    this.scenes = new BbSceneFactory(() => this.stage.metrics);
    this.pad = new BbPitchPad(host, (call) => this.humanThrows(call));
    this.swing = new BbSwingButton(host, () => this.humanSwings());
  }

  get isRunning(): boolean { return this.running; }
  get sequence(): number { return this.session.log.length; }
  get awaitsPitch(): boolean { return this.running && this.waitingForCall && !this.pending; }

  halt(on: boolean): void { this.halted = on; }

  watch(view: BbLiveView): void {
    if (!this.plan || !this.plan.view) return;
    this.plan.view = view;
    this.player.view = view;
  }

  reseat(seats: [BbSeatKind, BbSeatKind]): void {
    const changed = this.plan.seats[0] !== seats[0] || this.plan.seats[1] !== seats[1];
    this.plan.seats = seats;
    if (changed && this.running && this.waitingForCall && !this.pending) this.nextPitch();
  }
  get board(): BbBoardSnapshot { return this.session.board(); }

  say(text: string, detail = "", seconds?: number): void { this.toast.show(text, detail, seconds); }

  quicken(on: boolean): void { this.fast = on; }

  orbit(on: boolean): void { this.orbiting = on; }

  preview(plan: BbMatchPlan): void {
    this.load(plan);
    this.running = false;
    this.waitingForCall = true;
    this.show();
    this.player.play(this.idleScene());
  }

  begin(plan: BbMatchPlan, link: BbMatchLink): void {
    this.load(plan);
    this.link = link;
    this.running = true;
    this.nextPitch();
  }

  stop(): void {
    this.running = false;
    this.pad.close();
    this.swing.hide();
    this.report.hide();
    this.clock.hide();
  }

  skipScene(): void {
    const pending = this.pending;
    if (!this.running || this.waitingForCall || (pending && (!pending.settled || !pending.announced))) return;
    this.player.skip();
  }

  deliverPitch(sequence: number, call: BbPitchCall, seed: number, swingOpen = true): void {
    const session = this.session;
    if (!this.running || !this.waitingForCall || this.pending || sequence !== session.log.length) return;
    this.pad.close();
    this.clock.hide();
    this.waitingForCall = false;
    const roll = session.rollWith(call, seed), batter = session.batter(), seated = this.plan.seats[session.battingIndex], seat: BbSeatKind = seated === "human" && !swingOpen ? "remote" : seated;
    this.pending = {
      sequence, roll, setting: session.setting(), fielding: session.fieldingIndex, hands: this.hands(), pitcherHand: session.pitcher().hand, abilities: batter.abilities,
      leniency: BbBatterAbilityModel.leniency(batter.abilities.contact), settled: null, announced: false, started: false, batting: seat
    };
    if (seat === "ai") { this.link.swingChosen(sequence, session.aiSwing(roll, this.plan.level)); return; }
    this.player.play(this.sceneOf(session.preview(roll)), seat === "remote" ? BbMatchDirector.REMOTE_LEAD : 0);
    this.pending.started = true;
    if (seat === "human") this.swing.arm();
  }

  deliverSwing(sequence: number, contactOffset: number | null): void {
    const pending = this.pending;
    if (!this.running || !pending || pending.settled || pending.sequence !== sequence) return;
    this.swing.disarm();
    const settled = this.session.settle(pending.roll, contactOffset);
    pending.settled = settled;
    if (settled.note.halfOver && !this.isOver()) this.scenes.swap(pending.fielding, pending.hands).forEach((swap) => this.queued.push(swap));
    this.events.onLog(this.session.log);
    const scene = this.sceneOf(settled.outcome);
    if (pending.started) this.player.replace(scene);
    else this.player.play(scene);
    pending.started = true;
  }

  tick(frameSeconds: number): void {
    this.toast.tick(frameSeconds);
    this.pad.tick(frameSeconds);
    if (!this.staged) return;
    if (!this.running || this.waitingForCall || this.halted) {
      this.player.idle(frameSeconds);
      if (this.running && !this.halted && this.clock.tick(frameSeconds)) this.pitchForIdler();
    } else this.advance(frameSeconds);
    if (!this.orbiting) { this.player.frame(frameSeconds); return; }
    this.orbitAngle += frameSeconds * BbMatchDirector.ORBIT_TURN;
    const radius = BbMatchDirector.ORBIT_RADIUS, center = BbMatchDirector.ORBIT_CENTER;
    this.stage.aim({ position: BbFieldSpace.toWorld(Math.sin(this.orbitAngle) * radius, center - Math.cos(this.orbitAngle) * radius, BbMatchDirector.ORBIT_HEIGHT), look: BbFieldSpace.toWorld(0, center, 0), fieldOfView: 42, keepsWidth: true }, frameSeconds, false);
  }

  private load(plan: BbMatchPlan): void {
    this.plan = plan;
    this.chance = new BbSeededRandom(plan.seed + 17);
    this.session = new BbDuelSession(plan.format, BbBallparkRegistry.MAIN.dimensions, plan.teams, new BbSeededRandom(plan.seed + plan.log.length * BbMatchDirector.RESUME_STRIDE));
    this.session.restore(plan.log);
    this.hud.players(plan.names[0], plan.names[1]);
    this.queued.length = 0;
    this.pending = null;
    this.idlePitches = 0;
    this.staged = true;
    this.stop();
  }

  private show(): void {
    const session = this.session, names = this.plan.names;
    this.ticker.begin(session.board());
    this.cards.show(names[session.battingIndex], session.batter(), names[session.fieldingIndex], session.pitcher(), session.board().pitches);
  }

  private isOver(): boolean {
    const state = this.session.state, halves = this.plan.halvesToPlay;
    return state.finished || (halves !== null && state.halvesDone >= halves);
  }

  private viewNow(): BbLiveView {
    const seats = this.plan.seats, session = this.session;
    if (this.plan.view) return this.plan.view;
    return seats[session.fieldingIndex] === "human" ? "pitcher" : seats[session.battingIndex] === "human" ? "batter" : "pitcher";
  }

  private hands(): BbStageCast { return { batsLeft: this.session.batter().hand === "L", throwsLeft: this.session.pitcher().hand === "L" }; }

  private idleScene(): BbScene {
    const session = this.session, roll = session.rollWith({ pitch: "ft", aim: { u: 0, v: 0 } }, BbMatchDirector.IDLE_SEED);
    return this.scenes.pitch({ outcome: session.preview(roll), pitcherHand: session.pitcher().hand, abilities: session.batter().abilities, setting: session.setting() }, session.fieldingIndex, this.hands());
  }

  private sceneOf(outcome: BbPitchOutcome): BbScene {
    const pending = this.pending as BbPendingPitch;
    return this.scenes.pitch({ outcome, pitcherHand: pending.pitcherHand, abilities: pending.abilities, setting: pending.setting }, pending.fielding, pending.hands);
  }

  private nextPitch(): void {
    if (this.isOver()) { this.finish(null); return; }
    const session = this.session, seat = this.plan.seats[session.fieldingIndex], sequence = session.log.length;
    this.player.view = this.viewNow();
    this.show();
    this.report.hide();
    this.swing.hide();
    this.waitingForCall = true;
    this.player.play(this.idleScene());
    if (seat === "human") { this.pad.open(session.pitcher()); this.clock.start(BbMatchDirector.PITCH_SECONDS); }
    else if (seat === "ai") this.link.pitchChosen(sequence, session.aiCall(this.plan.level));
  }

  private humanThrows(call: BbPitchCall): void {
    if (!this.running || !this.waitingForCall || this.halted || this.plan.seats[this.session.fieldingIndex] !== "human") return;
    this.idlePitches = 0;
    this.link.pitchChosen(this.session.log.length, call);
  }

  private pitchForIdler(): void {
    const session = this.session;
    if (!this.waitingForCall || this.plan.seats[session.fieldingIndex] !== "human") return;
    this.idlePitches++;
    if (this.idlePitches >= BbMatchDirector.FORFEIT_AFTER) { this.finish(session.fieldingIndex); return; }
    if (this.idlePitches >= BbMatchDirector.AWAY_AFTER) this.toast.show("자리 비움");
    this.link.pitchChosen(session.log.length, { pitch: session.lastThrown || "ft", aim: { u: this.chance.between(-0.5, 0.5), v: -0.5 } });
  }

  private humanSwings(): void {
    const pending = this.pending;
    if (!pending || pending.settled || pending.batting !== "human" || this.halted) return;
    this.link.swingChosen(pending.sequence, this.player.seconds + BbTimingModel.SWING_DELAY - this.player.arriveAt);
  }

  private called(call: BbCallCue): void {
    if (call.text) this.toast.show(call.text);
    if (call.tally) this.ticker.tally(call.tally, this.session.board());
  }

  private announce(pending: BbPendingPitch): void {
    const settled = pending.settled as BbSettledPitch, outcome = settled.outcome, play = outcome.script, session = this.session, names = this.plan.names;
    pending.announced = true;
    this.ticker.thrown(!!play && play.result !== "FOUL");
    const verdict = play ? BbMatchDirector.IN_PLAY_VERDICT : settled.note.toast || BbMatchDirector.PLAIN_CALLS[outcome.kind];
    this.report.show(pending.roll, verdict, outcome.swing, pending.leniency, this.player.view);
    if (play) return;
    this.ticker.settle(session.board());
    if (!settled.note.halfOver) this.cards.show(names[session.battingIndex], session.batter(), names[session.fieldingIndex], session.pitcher(), session.board().pitches);
    this.toast.show(verdict);
  }

  forfeit(team: 0 | 1): void { if (this.running) this.finish(team); }

  private finish(forfeitedBy: 0 | 1 | null): void {
    this.stop();
    this.events.onEnd({ plan: this.plan, state: this.session.state, forfeitedBy });
  }

  private advance(frameSeconds: number): void {
    const pending = this.pending, player = this.player, batting = pending ? pending.batting : "ai";
    const eased = this.fast && (!pending || (pending.announced && !!(pending.settled as BbSettledPitch).outcome.script));
    let step = frameSeconds * (eased ? BbMatchDirector.FAST_PACE : 1);
    if (pending && !pending.settled && batting === "remote") step = Math.min(step, Math.max(0, player.arriveAt - BbMatchDirector.HOLD_BEFORE - player.seconds));
    player.advance(step);
    if (pending && !pending.settled && batting === "human") {
      const auto = this.plan.autoSwingAt;
      if (auto !== null && player.seconds >= player.arriveAt + auto - BbTimingModel.SWING_DELAY) this.humanSwings();
      else if (player.seconds >= player.arriveAt + BbMatchDirector.SWING_CLOSES_AFTER) this.link.swingChosen(pending.sequence, null);
    }
    if (pending && pending.settled && !pending.announced && player.seconds >= player.arriveAt) this.announce(pending);
    if (!player.finished || (pending && !pending.settled)) return;
    this.pending = null;
    const swap = this.queued.shift();
    if (!swap) { this.nextPitch(); return; }
    this.swing.hide();
    this.ticker.begin(this.session.board());
    player.play(swap);
  }
}
