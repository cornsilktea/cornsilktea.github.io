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

  static pitcherSheet(hand: BbHand): BbPitcherSheet {
    const points = BbAiLevel.ABILITY_POINTS;
    return { abilities: { control: points, power: points, breaking: points }, hand, pitches: new BbPitchSelection(points).usable(), role: "starter" };
  }

  static batterSheet(hand: BbHand): BbBatterSheet {
    const points = BbAiLevel.ABILITY_POINTS;
    return { abilities: { contact: points, power: points, speed: points }, hand };
  }
}

interface BbPitchCall {
  pitch: BbPitchId;
  aim: BbZonePoint;
}

class BbAiPitcher {
  static readonly EDGE_OUTSIDE = 1.15;

  constructor(private readonly level: BbAiTuning) {}

  choose(balls: number, strikes: number, sheet: BbPitcherSheet, lastPitch: BbPitchId | null, random: BbSeededRandom): BbPitchCall {
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
    return { pitch, aim: BbAimLimiter.clamp(noisy, BbPitchCatalog.of(pitch), sheet.abilities, sheet.hand) };
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
  static readonly THREE_BALL_REACH = 0.7;
  static readonly NORMAL_REACH = 0.92;
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

class BbAiMatchRunner {
  private readonly rules: BbMatchRules;
  private readonly judge: BbPitchJudge;

  constructor(format: BbMatchFormat, dimensions: BbFieldDimensions, errors: BbErrorPolicy, private readonly teams: readonly [BbTeamSheet, BbTeamSheet], private readonly pitcherLevels: readonly [BbAiTuning, BbAiTuning], private readonly batterLevels: readonly [BbAiTuning, BbAiTuning]) {
    this.rules = new BbMatchRules(format);
    this.judge = new BbPitchJudge(dimensions, errors, this.rules);
  }

  play(random: BbSeededRandom, onPitch?: (state: BbGameState, outcome: BbPitchOutcome, note: BbOutcomeNote, battingIndex: number) => void, stopAfterHalves?: number): BbGameState {
    const state = this.rules.start(), lineups = [new BbLineup(this.teams[0].lineup), new BbLineup(this.teams[1].lineup)];
    let lastPitch: BbPitchId | null = null, previousSpeed: number | null = null;
    while (!state.finished && (stopAfterHalves === undefined || state.halvesDone < stopAfterHalves)) {
      const battingIndex = this.rules.battingIndex(state), fieldingIndex = this.rules.fieldingIndex(state);
      const pitcher = this.teams[fieldingIndex].pitchers[0], batter = lineups[battingIndex].current();
      const call = new BbAiPitcher(this.pitcherLevels[fieldingIndex]).choose(state.balls, state.strikes, pitcher, lastPitch, random);
      const roll = BbPitchRoller.roll(call.pitch, call.aim, pitcher.abilities, pitcher.hand, random.seed());
      const offset = new BbAiBatter(this.batterLevels[battingIndex]).decide(roll, state.balls, state.strikes, batter.hand, previousSpeed, pitcher.abilities, random);
      const outcome = this.judge.judge(state, roll, offset, batter), note = this.rules.apply(state, outcome);
      if (onPitch) onPitch(state, outcome, note, battingIndex);
      lastPitch = note.plateAppearanceOver ? null : call.pitch;
      previousSpeed = note.plateAppearanceOver ? null : roll.speed;
      if (note.plateAppearanceOver) lineups[battingIndex].advance();
    }
    return state;
  }
}
