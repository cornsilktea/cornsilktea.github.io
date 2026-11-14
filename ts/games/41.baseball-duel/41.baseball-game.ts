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

type BbLineupPosition = Exclude<BbPosition, "P"> | "DH";
type BbPitcherRole = "starter" | "reliever" | "closer";

interface BbBatterSheet {
  abilities: BbBatterAbilities;
  hand: BbHand;
  position: BbLineupPosition;
}

interface BbPitcherSheet {
  abilities: BbPitcherAbilities;
  hand: BbHand;
  pitches: BbPitchId[];
  role: BbPitcherRole;
}

interface BbTeamSheet {
  lineup: BbBatterSheet[];
  pitchers: BbPitcherSheet[];
}

interface BbRoleSlot {
  role: BbPitcherRole;
  count: number;
  label: string;
}

class BbRosterPlan {
  static readonly PITCHER_SLOTS: readonly BbRoleSlot[] = [{ role: "starter", count: 1, label: "선발" }, { role: "reliever", count: 1, label: "중간계투" }, { role: "closer", count: 1, label: "마무리" }];
  static readonly BATTING_ORDER: readonly BbLineupPosition[] = ["DH", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  static readonly POSITION_LABELS: Readonly<Record<BbLineupPosition, string>> = { DH: "지명타자", C: "포수", "1B": "1루수", "2B": "2루수", "3B": "3루수", SS: "유격수", LF: "좌익수", CF: "중견수", RF: "우익수" };
  static readonly DESIGNATED: BbLineupPosition = "DH";
  static readonly BASE_POINTS = 3;

  static pitcherRoles(): BbPitcherRole[] {
    const roles: BbPitcherRole[] = [];
    BbRosterPlan.PITCHER_SLOTS.forEach((slot) => { for (let index = 0; index < slot.count; index++) roles.push(slot.role); });
    return roles;
  }

  static pitcherCount(): number { return BbRosterPlan.pitcherRoles().length; }
  static batterCount(): number { return BbRosterPlan.BATTING_ORDER.length; }
  static roleLabel(role: BbPitcherRole): string { const slot = BbRosterPlan.PITCHER_SLOTS.find((entry) => entry.role === role); return slot ? slot.label : role; }
  static positionLabel(position: BbLineupPosition): string { return BbRosterPlan.POSITION_LABELS[position]; }

  static isFullLineup(lineup: readonly BbBatterSheet[]): boolean {
    if (lineup.length !== BbRosterPlan.batterCount()) return false;
    return BbRosterPlan.BATTING_ORDER.every((position) => lineup.filter((sheet) => sheet.position === position).length === 1);
  }

  static swapPosition(lineup: BbBatterSheet[], index: number, to: BbLineupPosition): void {
    const mover = lineup[index], holder = lineup.find((sheet) => sheet.position === to);
    if (!mover || mover.position === to) return;
    if (holder) holder.position = mover.position;
    mover.position = to;
  }

  static orderedPitchers(pitchers: readonly BbPitcherSheet[]): BbPitcherSheet[] {
    const order = BbRosterPlan.PITCHER_SLOTS.map((slot) => slot.role);
    return pitchers.map((sheet, index) => ({ sheet, index })).sort((a, b) => (order.indexOf(a.sheet.role) - order.indexOf(b.sheet.role)) || a.index - b.index).map((entry) => entry.sheet);
  }

  static points(value: number | undefined): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(7, Math.round(value))) : BbRosterPlan.BASE_POINTS; }

  static crewOf(lineup: readonly BbBatterSheet[]): BbDefenseCrew {
    const points = new Map<BbPosition, number>();
    lineup.forEach((sheet) => { const position = sheet.position; if (position && position !== "DH") points.set(position, BbRosterPlan.points(sheet.abilities.defense)); });
    return new BbDefenseCrew(points);
  }
}

class BbLineup {
  private turn = 0;
  constructor(private readonly slots: readonly BbBatterSheet[]) {}
  current(): BbBatterSheet { return this.slots[this.turn % this.slots.length]; }
  currentIndex(): number { return this.turn % this.slots.length; }
  advance(): void { this.turn++; }
}

class BbStaminaModel {
  static readonly FULL = 100;
  static readonly TIRED_BELOW = 50;
  static readonly WORN_BELOW = 30;
  static readonly RELIEF_BELOW = 30;
  static readonly PITCH_COST: readonly number[] = [0, 4, 3.5, 3, 2.5, 2, 1.5, 1];
  static readonly HIT_COST: readonly number[] = [0, 2, 1.8, 1.7, 1.5, 1.3, 1.2, 1];
  static readonly HOME_RUN_COST: readonly number[] = [0, 4, 3.7, 3.3, 3, 2.7, 2.3, 2];
  static readonly TIRED = new BbPitchCondition(0.9, 1);
  static readonly WORN = new BbPitchCondition(0.9, 1.3);

  static costOf(stamina: number, outcome: BbPitchOutcome): number {
    const points = BbRosterPlan.points(stamina), code = outcome.script ? outcome.script.result : null;
    let cost = BbStaminaModel.PITCH_COST[points];
    if (outcome.kind === "inPlay" && code === "HOME_RUN") cost += BbStaminaModel.HOME_RUN_COST[points];
    else if (outcome.kind === "inPlay" && code && BbPlayCodes.isHit(code)) cost += BbStaminaModel.HIT_COST[points];
    return cost;
  }

  static condition(level: number): BbPitchCondition {
    if (level < BbStaminaModel.WORN_BELOW) return BbStaminaModel.WORN;
    if (level < BbStaminaModel.TIRED_BELOW) return BbStaminaModel.TIRED;
    return BbPitchCondition.FRESH;
  }
}

interface BbPitcherStamina {
  spend(outcome: BbPitchOutcome): void;
  level(): number;
  condition(): BbPitchCondition;
  isSpent(): boolean;
}

class BbNoStamina implements BbPitcherStamina {
  spend(): void { return; }
  level(): number { return BbStaminaModel.FULL; }
  condition(): BbPitchCondition { return BbPitchCondition.FRESH; }
  isSpent(): boolean { return false; }
}

class BbStaminaMeter implements BbPitcherStamina {
  private value = BbStaminaModel.FULL;
  constructor(private readonly stamina: number) {}
  spend(outcome: BbPitchOutcome): void { this.value = Math.max(0, this.value - BbStaminaModel.costOf(this.stamina, outcome)); }
  level(): number { return this.value; }
  condition(): BbPitchCondition { return BbStaminaModel.condition(this.value); }
  isSpent(): boolean { return this.value < BbStaminaModel.RELIEF_BELOW; }
}

class BbPitcherRoster {
  readonly pitchers: readonly BbPitcherSheet[];
  private readonly meters: BbPitcherStamina[];
  private readonly retired = new Set<number>();
  private mound = 0;
  private thrown = 0;

  constructor(pitchers: readonly BbPitcherSheet[], meterOf: (sheet: BbPitcherSheet) => BbPitcherStamina = (sheet) => new BbStaminaMeter(sheet.abilities.stamina)) {
    this.pitchers = BbRosterPlan.orderedPitchers(pitchers);
    this.meters = this.pitchers.map(meterOf);
  }

  current(): BbPitcherSheet { return this.pitchers[this.mound]; }
  currentIndex(): number { return this.mound; }
  pitchesThisOuting(): number { return this.thrown; }
  stamina(index = this.mound): BbPitcherStamina { return this.meters[index]; }
  isAvailable(index: number): boolean { return Number.isInteger(index) && index >= 0 && index < this.pitchers.length && index !== this.mound && !this.retired.has(index); }
  available(): number[] { return this.pitchers.map((sheet, index) => index).filter((index) => this.isAvailable(index)); }

  recommended(): number | null {
    const left = this.available();
    return left.length ? left[0] : null;
  }

  change(index: number): boolean {
    if (!this.isAvailable(index)) return false;
    this.retired.add(this.mound);
    this.mound = index;
    this.thrown = 0;
    return true;
  }

  afterPitch(outcome: BbPitchOutcome): void {
    this.thrown++;
    this.meters[this.mound].spend(outcome);
  }
}

interface BbSubstitutionPolicy {
  nextPitcher(roster: BbPitcherRoster): number | null;
}

class BbNoSubstitution implements BbSubstitutionPolicy {
  nextPitcher(): number | null { return null; }
}

class BbTiredSubstitution implements BbSubstitutionPolicy {
  nextPitcher(roster: BbPitcherRoster): number | null { return roster.stamina().isSpent() ? roster.recommended() : null; }
}

interface BbBatCounts { pa: number; ab: number; h: number; d2: number; d3: number; hr: number; bb: number; k: number; sf: number; rbi: number; r: number; roe: number; }
interface BbPitCounts { bf: number; ab: number; h: number; d2: number; d3: number; hr: number; bb: number; k: number; sf: number; outs: number; r: number; er: number; pitches: number; strikes: number; }

interface BbZoneHitting { n: number; ab: number; h: number; tb: number; }

interface BbTeamBox {
  bat: BbBatCounts;
  pit: BbPitCounts;
  byType: Record<BbPitchId, { n: number; s: number }>;
  bestDistance: number;
  bestExit: number;
  bestPitch: number;
  batZones: BbZoneHitting[];
  pitZones: number[];
}

class BbZoneGrid {
  static readonly CELLS = 9;
  static readonly OUTSIDE = 9;
  static readonly SLOTS = 10;

  static indexOf(point: BbZonePoint): number {
    if (Math.abs(point.u) > 1 || Math.abs(point.v) > 1) return BbZoneGrid.OUTSIDE;
    const column = Math.min(2, Math.floor((point.u + 1) * 1.5)), row = Math.min(2, Math.floor((1 - point.v) * 1.5));
    return row * 3 + column;
  }

  static emptyHitting(): BbZoneHitting[] { return Array.from({ length: BbZoneGrid.SLOTS }, () => ({ n: 0, ab: 0, h: 0, tb: 0 })); }
  static emptyPitching(): number[] { return Array.from({ length: BbZoneGrid.SLOTS }, () => 0); }
}

class BbBoxScoreBuilder {
  static emptyBat(): BbBatCounts { return { pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, k: 0, sf: 0, rbi: 0, r: 0, roe: 0 }; }
  static emptyPit(): BbPitCounts { return { bf: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, k: 0, sf: 0, outs: 0, r: 0, er: 0, pitches: 0, strikes: 0 }; }
  static emptyTeam(): BbTeamBox {
    return {
      bat: BbBoxScoreBuilder.emptyBat(), pit: BbBoxScoreBuilder.emptyPit(), byType: { ft: { n: 0, s: 0 }, cv: { n: 0, s: 0 }, sl: { n: 0, s: 0 }, ch: { n: 0, s: 0 }, kn: { n: 0, s: 0 } },
      bestDistance: 0, bestExit: 0, bestPitch: 0, batZones: BbZoneGrid.emptyHitting(), pitZones: BbZoneGrid.emptyPitching()
    };
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
  runnerSpeed?: number;
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
    const batting = rules.batting(state), fielding = rules.fielding(state), batter = rules.newRunner(state, true, outcome.runnerSpeed);
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

  newRunner(state: BbGameState, earned: boolean, speed?: number): BbRunner {
    state.runnerSerial++;
    const runner: BbRunner = { id: "r" + state.runnerSerial, earned: earned && !state.tainted };
    if (speed !== undefined) runner.speed = speed;
    return runner;
  }

  apply(state: BbGameState, outcome: BbPitchOutcome): BbOutcomeNote {
    if (state.finished) return { toast: "", plateAppearanceOver: false, halfOver: false, runs: 0 };
    const fielding = this.fielding(state), batting = this.batting(state), type = fielding.byType[outcome.roll.pitch], zone = BbZoneGrid.indexOf(outcome.roll.arrive);
    const before = { ab: batting.bat.ab, h: batting.bat.h, tb: BbBaseballFormulas.totalBases(batting.bat) };
    state.pitchCount++;
    fielding.pit.pitches++;
    fielding.pitZones[zone]++;
    type.n++;
    if (outcome.kind !== "ball") type.s++;
    fielding.bestPitch = Math.max(fielding.bestPitch, outcome.roll.speed);
    const note = this.registry.handlerOf(outcome.kind).apply(state, outcome, this), cell = batting.batZones[zone];
    cell.n++;
    cell.ab += batting.bat.ab - before.ab;
    cell.h += batting.bat.h - before.h;
    cell.tb += BbBaseballFormulas.totalBases(batting.bat) - before.tb;
    return note;
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
  private readonly resolvers: readonly [BbPlayResolver, BbPlayResolver];

  constructor(dimensions: BbFieldDimensions, errors: BbErrorPolicy, private readonly rules: BbMatchRules, private readonly crews: readonly [BbDefenseCrew, BbDefenseCrew] = [BbDefenseCrew.STANDARD, BbDefenseCrew.STANDARD]) {
    const resolverFor = (crew: BbDefenseCrew) => new BbPlayResolver(dimensions, new BbAutoFielding(crew), new BbAutoBaseRunning(), errors, crew);
    this.resolvers = [resolverFor(crews[0]), resolverFor(crews[1])];
  }

  judge(state: BbGameState, roll: BbPitchRoll, contactOffset: number | null, batter: BbBatterSheet): BbPitchOutcome {
    const random = new BbSeededRandom(roll.seed ^ 0x5bd1e995), fielding = this.rules.fieldingIndex(state), runnerSpeed = batter.abilities.speed;
    const swing = BbBatterActionSet.of("swing").resolve({ roll, batterHand: batter.hand, abilities: batter.abilities, contactOffset, random, catcherDefense: this.crews[fielding].pointsOf("C") });
    if (swing.kind === "take") return { kind: BbStrikeZoneJudge.isStrike(roll.arrive) ? "calledStrike" : "ball", roll, swing, script: null, runnerSpeed };
    if (swing.kind === "miss") return { kind: "swingMiss", roll, swing, script: null, runnerSpeed };
    const runner: BbRunner = { id: "r" + (state.runnerSerial + 1), earned: !state.tainted, speed: runnerSpeed };
    const script = this.resolvers[fielding].resolve({ outs: state.outs, bases: state.bases, batter: runner, abilities: batter.abilities }, swing.ball as BbBattedBall, random);
    if (script.result === "FOUL") return { kind: "foul", roll, swing, script, runnerSpeed };
    if (script.result === "ERROR") runner.earned = false;
    state.runnerSerial++;
    return { kind: "inPlay", roll, swing, script, runnerSpeed };
  }
}

interface BbLogEntry {
  pitch: BbPitchId;
  aim: BbZonePoint;
  seed: number;
  contactOffset: number | null;
}

interface BbPitcherChangeEntry {
  change: number;
}

type BbLogEvent = BbLogEntry | BbPitcherChangeEntry;

class BbLogEvents {
  static isChange(event: BbLogEvent): event is BbPitcherChangeEntry { return typeof (event as BbPitcherChangeEntry).change === "number"; }
}

interface BbSettledPitch {
  outcome: BbPitchOutcome;
  note: BbOutcomeNote;
}

interface BbAimedPitch {
  pitch: BbPitchId;
  aim: BbZonePoint;
}

class BbMatchEngine {
  readonly rules: BbMatchRules;
  readonly state: BbGameState;
  readonly rosters: readonly [BbPitcherRoster, BbPitcherRoster];
  private readonly judge: BbPitchJudge;
  private readonly lineups: readonly [BbLineup, BbLineup];

  constructor(format: BbMatchFormat, dimensions: BbFieldDimensions, errors: BbErrorPolicy, readonly teams: readonly [BbTeamSheet, BbTeamSheet]) {
    this.rules = new BbMatchRules(format);
    this.judge = new BbPitchJudge(dimensions, errors, this.rules, [BbRosterPlan.crewOf(teams[0].lineup), BbRosterPlan.crewOf(teams[1].lineup)]);
    this.state = this.rules.start();
    this.lineups = [new BbLineup(teams[0].lineup), new BbLineup(teams[1].lineup)];
    this.rosters = [new BbPitcherRoster(teams[0].pitchers), new BbPitcherRoster(teams[1].pitchers)];
  }

  get battingIndex(): 0 | 1 { return this.rules.battingIndex(this.state); }
  get fieldingIndex(): 0 | 1 { return this.rules.fieldingIndex(this.state); }

  roster(team: 0 | 1 = this.fieldingIndex): BbPitcherRoster { return this.rosters[team]; }
  lineup(team: 0 | 1 = this.battingIndex): BbLineup { return this.lineups[team]; }
  pitcher(): BbPitcherSheet { return this.roster().current(); }
  batter(): BbBatterSheet { return this.lineup().current(); }
  condition(): BbPitchCondition { return this.roster().stamina().condition(); }

  roll(call: BbAimedPitch, seed: number): BbPitchRoll {
    const pitcher = this.pitcher();
    return BbPitchRoller.roll(call.pitch, call.aim, pitcher.abilities, pitcher.hand, seed, this.condition());
  }

  preview(roll: BbPitchRoll): BbPitchOutcome { return this.judge.judge(this.state, roll, null, this.batter()); }

  settle(roll: BbPitchRoll, contactOffset: number | null): BbSettledPitch {
    const roster = this.roster(), lineup = this.lineup(), outcome = this.judge.judge(this.state, roll, contactOffset, lineup.current()), note = this.rules.apply(this.state, outcome);
    roster.afterPitch(outcome);
    if (note.plateAppearanceOver) lineup.advance();
    return { outcome, note };
  }

  change(index: number): boolean { return !this.state.finished && this.roster().change(index); }

  replay(event: BbLogEvent): void {
    if (this.state.finished) return;
    if (BbLogEvents.isChange(event)) { this.change(event.change); return; }
    this.settle(this.roll(event, event.seed), event.contactOffset);
  }
}

class BbGameLogFold {
  constructor(private readonly format: BbMatchFormat, private readonly dimensions: BbFieldDimensions, private readonly errors: BbErrorPolicy, private readonly teams: readonly [BbTeamSheet, BbTeamSheet]) {}

  engine(entries: readonly BbLogEvent[]): BbMatchEngine {
    const engine = new BbMatchEngine(this.format, this.dimensions, this.errors, this.teams);
    entries.forEach((entry) => engine.replay(entry));
    return engine;
  }

  fold(entries: readonly BbLogEvent[]): BbGameState { return this.engine(entries).state; }
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
