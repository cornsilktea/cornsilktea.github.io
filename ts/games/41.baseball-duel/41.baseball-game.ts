interface BbMatchFormat {
  readonly id: string;
  readonly startInning: number;
  readonly inningsToPlay: number;
  readonly maxInning: number;
  readonly walkOff: boolean;
  readonly skipBottomWhenLeading: boolean;
  extraStartBases(inning: number): readonly number[];
}

abstract class BbStandardFormat implements BbMatchFormat {
  abstract readonly id: string;
  abstract readonly startInning: number;
  abstract readonly inningsToPlay: number;
  readonly maxInning = 15;
  readonly walkOff = true;
  readonly skipBottomWhenLeading = true;

  get lastRegularInning(): number { return this.startInning + this.inningsToPlay - 1; }

  extraStartBases(inning: number): readonly number[] {
    if (inning <= this.lastRegularInning) return [];
    return inning === this.lastRegularInning + 1 ? [1, 2] : [1, 2, 3];
  }
}

class BbOneInningFormat extends BbStandardFormat { readonly id = "one"; readonly startInning = 9; readonly inningsToPlay = 1; }
class BbThreeInningFormat extends BbStandardFormat { readonly id = "three"; readonly startInning = 7; readonly inningsToPlay = 3; }
class BbFullGameFormat extends BbStandardFormat { readonly id = "full"; readonly startInning = 1; readonly inningsToPlay = 9; }

interface BbBatterSheet {
  abilities: BbBatterAbilities;
  hand: BbHand;
}

interface BbPitcherSheet {
  abilities: BbPitcherAbilities;
  hand: BbHand;
  pitches: BbPitchId[];
  role: "starter" | "reliever" | "closer";
}

interface BbTeamSheet {
  lineup: BbBatterSheet[];
  pitchers: BbPitcherSheet[];
}

class BbLineup {
  private turn = 0;
  constructor(private readonly slots: readonly BbBatterSheet[]) {}
  current(): BbBatterSheet { return this.slots[this.turn % this.slots.length]; }
  advance(): void { this.turn++; }
}

interface BbPitcherStamina {
  afterPitch(): void;
  isSpent(): boolean;
}

class BbNoStamina implements BbPitcherStamina {
  afterPitch(): void { return; }
  isSpent(): boolean { return false; }
}

interface BbSubstitutionPolicy {
  nextPitcher(roster: BbPitcherRoster, stamina: BbPitcherStamina): BbPitcherSheet | null;
}

class BbNoSubstitution implements BbSubstitutionPolicy {
  nextPitcher(): BbPitcherSheet | null { return null; }
}

class BbPitcherRoster {
  readonly starter: BbPitcherSheet;
  readonly relievers: BbPitcherSheet[];
  readonly closer: BbPitcherSheet | null;
  private onMound: BbPitcherSheet;

  constructor(pitchers: readonly BbPitcherSheet[]) {
    this.starter = pitchers.find((pitcher) => pitcher.role === "starter") || pitchers[0];
    this.relievers = pitchers.filter((pitcher) => pitcher.role === "reliever");
    this.closer = pitchers.find((pitcher) => pitcher.role === "closer") || null;
    this.onMound = this.starter;
  }

  current(): BbPitcherSheet { return this.onMound; }
  change(to: BbPitcherSheet): void { this.onMound = to; }
}

interface BbBatCounts { pa: number; ab: number; h: number; d2: number; d3: number; hr: number; bb: number; k: number; sf: number; rbi: number; r: number; roe: number; }
interface BbPitCounts { bf: number; ab: number; h: number; d2: number; d3: number; hr: number; bb: number; k: number; sf: number; outs: number; r: number; er: number; pitches: number; strikes: number; }

interface BbTeamBox {
  bat: BbBatCounts;
  pit: BbPitCounts;
  byType: Record<BbPitchId, { n: number; s: number }>;
  bestDistance: number;
  bestExit: number;
  bestPitch: number;
}

class BbBoxScoreBuilder {
  static emptyBat(): BbBatCounts { return { pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, k: 0, sf: 0, rbi: 0, r: 0, roe: 0 }; }
  static emptyPit(): BbPitCounts { return { bf: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, k: 0, sf: 0, outs: 0, r: 0, er: 0, pitches: 0, strikes: 0 }; }
  static emptyTeam(): BbTeamBox {
    return { bat: BbBoxScoreBuilder.emptyBat(), pit: BbBoxScoreBuilder.emptyPit(), byType: { ft: { n: 0, s: 0 }, cv: { n: 0, s: 0 }, sl: { n: 0, s: 0 }, ch: { n: 0, s: 0 }, kn: { n: 0, s: 0 } }, bestDistance: 0, bestExit: 0, bestPitch: 0 };
  }
}

type BbWinner = 0 | 1 | -1 | null;

interface BbGameState {
  inning: number;
  half: 0 | 1;
  outs: number;
  balls: number;
  strikes: number;
  bases: BbBases;
  score: [number, number];
  lineScore: Array<[number, number]>;
  halvesDone: number;
  pitchCount: number;
  runnerSerial: number;
  tainted: boolean;
  finished: boolean;
  winner: BbWinner;
  endNote: string;
  box: [BbTeamBox, BbTeamBox];
}

type BbOutcomeKind = "ball" | "calledStrike" | "swingMiss" | "foul" | "inPlay";

interface BbPitchOutcome {
  kind: BbOutcomeKind;
  roll: BbPitchRoll;
  swing: BbSwingResult;
  script: BbPlayScript | null;
}

interface BbOutcomeNote {
  toast: string;
  plateAppearanceOver: boolean;
  halfOver: boolean;
  runs: number;
}

interface BbOutcomeHandler {
  apply(state: BbGameState, outcome: BbPitchOutcome, rules: BbMatchRules): BbOutcomeNote;
}

class BbBallHandler implements BbOutcomeHandler {
  apply(state: BbGameState, outcome: BbPitchOutcome, rules: BbMatchRules): BbOutcomeNote {
    state.balls++;
    if (state.balls < 4) return { toast: "볼", plateAppearanceOver: false, halfOver: false, runs: 0 };
    const batting = rules.batting(state), fielding = rules.fielding(state), batter = rules.newRunner(state, true);
    batting.bat.pa++; batting.bat.bb++; fielding.pit.bf++; fielding.pit.bb++;
    let scored: BbRunner | null = null;
    if (state.bases[0] && state.bases[1] && state.bases[2]) scored = state.bases[2];
    if (state.bases[0] && state.bases[1]) state.bases[2] = state.bases[1];
    if (state.bases[0]) state.bases[1] = state.bases[0];
    state.bases[0] = batter;
    const runs = scored ? rules.scoreRuns(state, [scored], true) : 0;
    return rules.finishPlateAppearance(state, "볼넷", runs, "끝내기 볼넷!");
  }
}

class BbStrikeHandler implements BbOutcomeHandler {
  constructor(private readonly swung: boolean) {}
  apply(state: BbGameState, outcome: BbPitchOutcome, rules: BbMatchRules): BbOutcomeNote {
    state.strikes++;
    rules.fielding(state).pit.strikes++;
    if (state.strikes < 3) return { toast: this.swung ? "헛스윙" : "스트라이크!", plateAppearanceOver: false, halfOver: false, runs: 0 };
    const batting = rules.batting(state), fielding = rules.fielding(state);
    batting.bat.pa++; batting.bat.ab++; batting.bat.k++; fielding.pit.bf++; fielding.pit.ab++; fielding.pit.k++;
    rules.addOuts(state, 1);
    return rules.finishPlateAppearance(state, "삼진 아웃!", 0, "");
  }
}

class BbFoulHandler implements BbOutcomeHandler {
  apply(state: BbGameState, outcome: BbPitchOutcome, rules: BbMatchRules): BbOutcomeNote {
    if (state.strikes < 2) state.strikes++;
    rules.fielding(state).pit.strikes++;
    return { toast: "파울", plateAppearanceOver: false, halfOver: false, runs: 0 };
  }
}

class BbInPlayHandler implements BbOutcomeHandler {
  private static readonly WALK_OFF: Readonly<Partial<Record<BbPlayCode, string>>> = { HOME_RUN: "끝내기 홈런!", SINGLE: "끝내기 안타!", DOUBLE: "끝내기 안타!", TRIPLE: "끝내기 안타!", SAC_FLY: "끝내기 희생플라이!" };

  apply(state: BbGameState, outcome: BbPitchOutcome, rules: BbMatchRules): BbOutcomeNote {
    const script = outcome.script as BbPlayScript, code = script.result, batting = rules.batting(state), fielding = rules.fielding(state), ball = outcome.swing.ball as BbBattedBall;
    fielding.pit.strikes++;
    batting.bat.pa++; fielding.pit.bf++;
    const sacrifice = code === "SAC_FLY";
    if (sacrifice) { batting.bat.sf++; fielding.pit.sf++; } else { batting.bat.ab++; fielding.pit.ab++; }
    if (BbPlayCodes.isHit(code)) {
      batting.bat.h++; fielding.pit.h++;
      if (code === "DOUBLE") { batting.bat.d2++; fielding.pit.d2++; }
      if (code === "TRIPLE") { batting.bat.d3++; fielding.pit.d3++; }
      if (code === "HOME_RUN") { batting.bat.hr++; fielding.pit.hr++; }
      batting.bestDistance = Math.max(batting.bestDistance, script.distance);
      batting.bestExit = Math.max(batting.bestExit, ball.exitSpeed);
    }
    if (code === "ERROR") { batting.bat.roe++; state.tainted = true; }
    state.bases = [script.basesAfter[0], script.basesAfter[1], script.basesAfter[2]];
    rules.addOuts(state, script.outsAdded);
    const creditsBatter = code !== "DOUBLE_PLAY" && code !== "ERROR";
    const runs = script.scored.length && state.outs <= 3 ? rules.scoreRuns(state, script.scored, creditsBatter) : 0;
    return rules.finishPlateAppearance(state, BbPlayCodes.LABELS[code], runs, BbInPlayHandler.WALK_OFF[code] || "끝내기!");
  }
}

class BbEventHandlerRegistry {
  private readonly handlers = new Map<BbOutcomeKind, BbOutcomeHandler>();

  static standard(): BbEventHandlerRegistry {
    const registry = new BbEventHandlerRegistry();
    registry.register("ball", new BbBallHandler());
    registry.register("calledStrike", new BbStrikeHandler(false));
    registry.register("swingMiss", new BbStrikeHandler(true));
    registry.register("foul", new BbFoulHandler());
    registry.register("inPlay", new BbInPlayHandler());
    return registry;
  }

  register(kind: BbOutcomeKind, handler: BbOutcomeHandler): void { this.handlers.set(kind, handler); }
  handlerOf(kind: BbOutcomeKind): BbOutcomeHandler { return this.handlers.get(kind) as BbOutcomeHandler; }
}

class BbMatchRules {
  constructor(readonly format: BbMatchFormat, private readonly registry: BbEventHandlerRegistry = BbEventHandlerRegistry.standard()) {}

  start(): BbGameState {
    const state: BbGameState = {
      inning: this.format.startInning, half: 0, outs: 0, balls: 0, strikes: 0, bases: [null, null, null], score: [0, 0], lineScore: [[0, 0]], halvesDone: 0, pitchCount: 0,
      runnerSerial: 0, tainted: false, finished: false, winner: null, endNote: "", box: [BbBoxScoreBuilder.emptyTeam(), BbBoxScoreBuilder.emptyTeam()]
    };
    this.placeStartRunners(state);
    return state;
  }

  battingIndex(state: BbGameState): 0 | 1 { return state.half; }
  fieldingIndex(state: BbGameState): 0 | 1 { return state.half === 0 ? 1 : 0; }
  batting(state: BbGameState): BbTeamBox { return state.box[this.battingIndex(state)]; }
  fielding(state: BbGameState): BbTeamBox { return state.box[this.fieldingIndex(state)]; }

  progress(state: BbGameState): number {
    return Math.min(1, (state.halvesDone + Math.min(state.outs, 3) / 3) / (this.format.inningsToPlay * 2));
  }

  newRunner(state: BbGameState, earned: boolean): BbRunner {
    state.runnerSerial++;
    return { id: "r" + state.runnerSerial, earned: earned && !state.tainted };
  }

  apply(state: BbGameState, outcome: BbPitchOutcome): BbOutcomeNote {
    if (state.finished) return { toast: "", plateAppearanceOver: false, halfOver: false, runs: 0 };
    const fielding = this.fielding(state), type = fielding.byType[outcome.roll.pitch];
    state.pitchCount++;
    fielding.pit.pitches++;
    type.n++;
    if (outcome.kind !== "ball") type.s++;
    fielding.bestPitch = Math.max(fielding.bestPitch, outcome.roll.speed);
    return this.registry.handlerOf(outcome.kind).apply(state, outcome, this);
  }

  addOuts(state: BbGameState, count: number): void {
    state.outs += count;
    this.fielding(state).pit.outs += Math.min(count, 3);
  }

  scoreRuns(state: BbGameState, runners: readonly BbRunner[], creditBatter: boolean): number {
    const batting = this.batting(state), fielding = this.fielding(state), line = state.lineScore[state.lineScore.length - 1];
    for (const runner of runners) {
      state.score[state.half]++;
      line[state.half]++;
      batting.bat.r++;
      fielding.pit.r++;
      if (runner.earned && !state.tainted) fielding.pit.er++;
      if (creditBatter) batting.bat.rbi++;
    }
    return runners.length;
  }

  finishPlateAppearance(state: BbGameState, toast: string, runs: number, walkOffNote: string): BbOutcomeNote {
    state.balls = 0;
    state.strikes = 0;
    const lastOrLater = state.inning >= this.format.startInning + this.format.inningsToPlay - 1;
    if (this.format.walkOff && state.half === 1 && lastOrLater && state.score[1] > state.score[0]) {
      this.finish(state, 1, runs > 0 ? walkOffNote : "");
      return { toast: state.endNote || toast, plateAppearanceOver: true, halfOver: true, runs };
    }
    if (state.outs < 3) return { toast, plateAppearanceOver: true, halfOver: false, runs };
    this.endHalf(state, lastOrLater);
    return { toast, plateAppearanceOver: true, halfOver: true, runs };
  }

  private finish(state: BbGameState, winner: BbWinner, note: string): void {
    state.finished = true;
    state.winner = winner;
    state.endNote = note;
  }

  private endHalf(state: BbGameState, lastOrLater: boolean): void {
    state.halvesDone++;
    state.outs = 0;
    state.bases = [null, null, null];
    state.tainted = false;
    if (state.half === 0) {
      if (lastOrLater && this.format.skipBottomWhenLeading && state.score[1] > state.score[0]) { this.finish(state, 1, ""); return; }
      state.half = 1;
      this.placeStartRunners(state);
      return;
    }
    if (lastOrLater && state.score[0] !== state.score[1]) { this.finish(state, state.score[0] > state.score[1] ? 0 : 1, ""); return; }
    if (lastOrLater && state.inning >= this.format.maxInning) { this.finish(state, -1, ""); return; }
    state.inning++;
    state.half = 0;
    state.lineScore.push([0, 0]);
    this.placeStartRunners(state);
  }

  private placeStartRunners(state: BbGameState): void {
    for (const base of this.format.extraStartBases(state.inning)) {
      state.runnerSerial++;
      state.bases[base - 1] = { id: "x" + state.runnerSerial, earned: false };
    }
  }
}

class BbPitchJudge {
  private readonly resolver: BbPlayResolver;

  constructor(dimensions: BbFieldDimensions, errors: BbErrorPolicy, private readonly rules: BbMatchRules) {
    this.resolver = new BbPlayResolver(dimensions, new BbAutoFielding(), new BbAutoBaseRunning(), errors);
  }

  judge(state: BbGameState, roll: BbPitchRoll, contactOffset: number | null, batter: BbBatterSheet): BbPitchOutcome {
    const random = new BbSeededRandom(roll.seed ^ 0x5bd1e995);
    const swing = BbBatterActionSet.of("swing").resolve({ roll, batterHand: batter.hand, abilities: batter.abilities, contactOffset, random });
    if (swing.kind === "take") return { kind: BbStrikeZoneJudge.isStrike(roll.arrive) ? "calledStrike" : "ball", roll, swing, script: null };
    if (swing.kind === "miss") return { kind: "swingMiss", roll, swing, script: null };
    const runner: BbRunner = { id: "r" + (state.runnerSerial + 1), earned: !state.tainted };
    const script = this.resolver.resolve({ outs: state.outs, bases: state.bases, batter: runner, abilities: batter.abilities }, swing.ball as BbBattedBall, random);
    if (script.result === "FOUL") return { kind: "foul", roll, swing, script };
    if (script.result === "ERROR") runner.earned = false;
    state.runnerSerial++;
    return { kind: "inPlay", roll, swing, script };
  }
}

interface BbLogEntry {
  pitch: BbPitchId;
  aim: BbZonePoint;
  seed: number;
  contactOffset: number | null;
}

class BbGameLogFold {
  constructor(private readonly format: BbMatchFormat, private readonly dimensions: BbFieldDimensions, private readonly errors: BbErrorPolicy, private readonly teams: readonly [BbTeamSheet, BbTeamSheet]) {}

  fold(entries: readonly BbLogEntry[]): BbGameState {
    const rules = new BbMatchRules(this.format), judge = new BbPitchJudge(this.dimensions, this.errors, rules), state = rules.start();
    const lineups = [new BbLineup(this.teams[0].lineup), new BbLineup(this.teams[1].lineup)], rosters = [new BbPitcherRoster(this.teams[0].pitchers), new BbPitcherRoster(this.teams[1].pitchers)];
    for (const entry of entries) {
      if (state.finished) break;
      const pitcher = rosters[rules.fieldingIndex(state)].current(), lineup = lineups[rules.battingIndex(state)];
      const roll = BbPitchRoller.roll(entry.pitch, entry.aim, pitcher.abilities, pitcher.hand, entry.seed);
      const note = rules.apply(state, judge.judge(state, roll, entry.contactOffset, lineup.current()));
      if (note.plateAppearanceOver) lineup.advance();
    }
    return state;
  }
}

class BbBaseballFormulas {
  static totalBases(counts: BbBatCounts | BbPitCounts): number { return counts.h + counts.d2 + 2 * counts.d3 + 3 * counts.hr; }
  static average(counts: BbBatCounts | BbPitCounts): number | null { return counts.ab ? counts.h / counts.ab : null; }
  static onBase(counts: BbBatCounts | BbPitCounts): number | null { const chances = counts.ab + counts.bb + counts.sf; return chances ? (counts.h + counts.bb) / chances : null; }
  static slugging(counts: BbBatCounts | BbPitCounts): number | null { return counts.ab ? BbBaseballFormulas.totalBases(counts) / counts.ab : null; }
  static ops(counts: BbBatCounts | BbPitCounts): number | null {
    const onBase = BbBaseballFormulas.onBase(counts), slugging = BbBaseballFormulas.slugging(counts);
    return onBase === null || slugging === null ? null : onBase + slugging;
  }
  static perPlate(value: number, counts: BbBatCounts): number | null { return counts.pa ? value / counts.pa : null; }
  static perBatter(value: number, counts: BbPitCounts): number | null { return counts.bf ? value / counts.bf : null; }
  static innings(counts: BbPitCounts): number { return counts.outs / 3; }
  static earnedRunAverage(counts: BbPitCounts): number | null { return counts.outs ? 9 * counts.er / BbBaseballFormulas.innings(counts) : null; }
  static whip(counts: BbPitCounts): number | null { return counts.outs ? (counts.bb + counts.h) / BbBaseballFormulas.innings(counts) : null; }
  static winRate(wins: number, losses: number, ties: number): number | null { const games = wins + losses + ties; return games ? wins / games : null; }
  static perGame(total: number, games: number): number | null { return games ? total / games : null; }

  static rateText(value: number | null): string { return value === null ? "-" : value >= 1 ? value.toFixed(3) : value.toFixed(3).slice(1); }
  static meanText(value: number | null): string { return value === null ? "-" : value.toFixed(2); }
  static inningsText(counts: BbPitCounts): string { return Math.floor(counts.outs / 3) + "." + counts.outs % 3; }
}
