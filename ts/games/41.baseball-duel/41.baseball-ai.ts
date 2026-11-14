type BbAiLevelId = "easy" | "normal" | "hard";

interface BbAiTuning {
  label: string;
  readDeviation: number;
  timingDeviation: number;
  aimDeviation: number;
  middleMistake: number;
  repeatWeight: number;
}

class BbAiLevel {
  static readonly ABILITY_POINTS = 3;
  static readonly ALL: Readonly<Record<BbAiLevelId, BbAiTuning>> = {
    easy: { label: "쉬움", readDeviation: 0.45, timingDeviation: 0.085, aimDeviation: 0.45, middleMistake: 0.25, repeatWeight: 1 },
    normal: { label: "보통", readDeviation: 0.3, timingDeviation: 0.062, aimDeviation: 0.2, middleMistake: 0.08, repeatWeight: 0.5 },
    hard: { label: "어려움", readDeviation: 0.18, timingDeviation: 0.045, aimDeviation: 0.06, middleMistake: 0, repeatWeight: 0.3 }
  };

  static pitcherSheet(hand: BbHand, role: BbPitcherRole = "starter"): BbPitcherSheet {
    const points = BbAiLevel.ABILITY_POINTS;
    return { abilities: { control: points, power: points, breaking: points, stamina: points }, hand, pitches: new BbPitchSelection(points).usable(), role };
  }

  static batterSheet(hand: BbHand, position: BbLineupPosition = BbRosterPlan.DESIGNATED): BbBatterSheet {
    const points = BbAiLevel.ABILITY_POINTS;
    return { abilities: { contact: points, power: points, speed: points, defense: points }, hand, position };
  }

  static team(hand: BbHand = "R"): BbTeamSheet {
    return { lineup: BbRosterPlan.BATTING_ORDER.map((position) => BbAiLevel.batterSheet(hand, position)), pitchers: BbRosterPlan.pitcherRoles().map((role) => BbAiLevel.pitcherSheet(hand, role)) };
  }
}

interface BbPitchCall {
  pitch: BbPitchId;
  aim: BbZonePoint;
}

class BbAiPitcher {
  static readonly EDGE_OUTSIDE = 1.15;

  constructor(private readonly level: BbAiTuning) {}

  choose(balls: number, strikes: number, sheet: BbPitcherSheet, lastPitch: BbPitchId | null, random: BbSeededRandom, condition: BbPitchCondition = BbPitchCondition.FRESH): BbPitchCall {
    const ahead = balls < strikes, behind = balls >= 3, breakingShare = behind ? 0.25 : ahead ? 0.6 : 0.4;
    const breaking = sheet.pitches.filter((id) => id !== "ft");
    const weights = sheet.pitches.map((id) => {
      const share = id === "ft" ? 1 - breakingShare : breakingShare / Math.max(1, breaking.length);
      return share * (id === lastPitch ? this.level.repeatWeight : 1);
    });
    let roll = random.next() * weights.reduce((sum, weight) => sum + weight, 0), pitch = sheet.pitches[0];
    for (let index = 0; index < weights.length; index++) { roll -= weights[index]; if (roll <= 0) { pitch = sheet.pitches[index]; break; } }
    const target = random.chance(this.level.middleMistake) ? { u: random.gaussian(0, 0.25), v: random.gaussian(0, 0.25) } : this.target(ahead, behind, random);
    const noisy = { u: target.u + random.gaussian(0, this.level.aimDeviation), v: target.v + random.gaussian(0, this.level.aimDeviation) };
    return { pitch, aim: BbAimLimiter.clamp(noisy, BbPitchCatalog.of(pitch), sheet.abilities, sheet.hand, condition) };
  }

  private target(ahead: boolean, behind: boolean, random: BbSeededRandom): BbZonePoint {
    const side = random.chance(0.5) ? 1 : -1, reach = behind ? random.between(0.55, 0.75) : ahead ? BbAiPitcher.EDGE_OUTSIDE : random.between(0.85, 1.15);
    if (random.chance(0.4)) return { u: random.between(-0.7, 0.7), v: -reach };
    if (random.chance(0.25)) return { u: side * reach, v: side * random.between(-1, 1) * reach };
    return { u: side * reach, v: random.between(-0.8, 0.6) };
  }
}

class BbAiBatter {
  static readonly TWO_STRIKE_REACH = 1.15;
  static readonly THREE_BALL_REACH = 0.6;
  static readonly NORMAL_REACH = 0.84;
  static readonly BREAK_READ_STEP = 0.5;
  static readonly SPEED_RUSH = 0.05;
  static readonly COMFORT_SPEED = 136.5;
  static readonly SPEED_CHANGE_BIAS = 0.0012;
  static readonly BIAS_LIMIT = 0.03;

  constructor(private readonly level: BbAiTuning) {}

  decide(roll: BbPitchRoll, balls: number, strikes: number, hand: BbHand, previousSpeed: number | null, pitcher: BbPitcherAbilities, random: BbSeededRandom): number | null {
    const kind = BbPitchCatalog.of(roll.pitch), blur = this.level.readDeviation * (kind.isBreaking ? 1 + BbAiBatter.BREAK_READ_STEP * (pitcher.breaking - 1) : 1);
    const seen = { u: roll.arrive.u + random.gaussian(0, blur), v: roll.arrive.v + random.gaussian(0, blur) };
    const reach = strikes >= 2 ? BbAiBatter.TWO_STRIKE_REACH : balls >= 3 ? BbAiBatter.THREE_BALL_REACH : BbAiBatter.NORMAL_REACH;
    if (BbStrikeZoneJudge.offCenter(seen) > reach) return null;
    const change = previousSpeed === null ? 0 : (roll.speed - previousSpeed) * BbAiBatter.SPEED_CHANGE_BIAS;
    const bias = Math.max(-BbAiBatter.BIAS_LIMIT, Math.min(BbAiBatter.BIAS_LIMIT, change));
    const ideal = BbTimingModel.idealShift(BbStrikeZoneJudge.inside(roll.arrive, hand), roll.timingNoise);
    const rush = 1 + BbAiBatter.SPEED_RUSH * (roll.speed - BbAiBatter.COMFORT_SPEED);
    return ideal + random.gaussian(bias, this.level.timingDeviation * Math.max(0.6, rush));
  }
}

interface BbHalfInningTally {
  runs: number;
  pitches: number;
}

type BbAiPitchWatcher = (state: BbGameState, outcome: BbPitchOutcome, note: BbOutcomeNote, battingIndex: number, engine: BbMatchEngine) => void;

class BbAiMatchRunner {
  constructor(private readonly format: BbMatchFormat, private readonly dimensions: BbFieldDimensions, private readonly errors: BbErrorPolicy, private readonly teams: readonly [BbTeamSheet, BbTeamSheet], private readonly pitcherLevels: readonly [BbAiTuning, BbAiTuning], private readonly batterLevels: readonly [BbAiTuning, BbAiTuning], private readonly substitutions: readonly [BbSubstitutionPolicy, BbSubstitutionPolicy] = [new BbTiredSubstitution(), new BbTiredSubstitution()]) {}

  play(random: BbSeededRandom, onPitch?: BbAiPitchWatcher, stopAfterHalves?: number, onChange?: (engine: BbMatchEngine, team: 0 | 1, from: number) => void): BbGameState {
    const engine = new BbMatchEngine(this.format, this.dimensions, this.errors, this.teams), state = engine.state;
    let lastPitch: BbPitchId | null = null, previousSpeed: number | null = null;
    while (!state.finished && (stopAfterHalves === undefined || state.halvesDone < stopAfterHalves)) {
      const battingIndex = engine.battingIndex, fieldingIndex = engine.fieldingIndex, roster = engine.roster();
      const relief = this.substitutions[fieldingIndex].nextPitcher(roster), leaving = roster.currentIndex();
      if (relief !== null && engine.change(relief)) { lastPitch = null; if (onChange) onChange(engine, fieldingIndex, leaving); }
      const pitcher = engine.pitcher(), batter = engine.batter();
      const call = new BbAiPitcher(this.pitcherLevels[fieldingIndex]).choose(state.balls, state.strikes, pitcher, lastPitch, random, engine.condition());
      const roll = engine.roll(call, random.seed());
      const offset = new BbAiBatter(this.batterLevels[battingIndex]).decide(roll, state.balls, state.strikes, batter.hand, previousSpeed, pitcher.abilities, random);
      const settled = engine.settle(roll, offset), note = settled.note;
      if (onPitch) onPitch(state, settled.outcome, note, battingIndex, engine);
      lastPitch = note.plateAppearanceOver ? null : call.pitch;
      previousSpeed = note.plateAppearanceOver ? null : roll.speed;
    }
    return state;
  }
}
