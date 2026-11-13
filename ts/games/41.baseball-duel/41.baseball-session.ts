interface BbSettledPitch {
  outcome: BbPitchOutcome;
  note: BbOutcomeNote;
}

class BbDuelSession {
  private static readonly ERROR_CHANCE = 0.05;

  readonly state: BbGameState;
  private readonly rules: BbMatchRules;
  private readonly judge: BbPitchJudge;
  private readonly lineups: BbLineup[];
  private lastPitch: BbPitchId | null = null;
  private previousSpeed: number | null = null;

  constructor(format: BbMatchFormat, dimensions: BbFieldDimensions, private readonly teams: readonly [BbTeamSheet, BbTeamSheet], private readonly random: BbSeededRandom) {
    this.rules = new BbMatchRules(format);
    this.judge = new BbPitchJudge(dimensions, new BbInfieldGroundBallErrorPolicy(BbDuelSession.ERROR_CHANCE), this.rules);
    this.state = this.rules.start();
    this.lineups = teams.map((team) => new BbLineup(team.lineup));
  }

  get battingIndex(): 0 | 1 { return this.rules.battingIndex(this.state); }
  get fieldingIndex(): 0 | 1 { return this.rules.fieldingIndex(this.state); }

  pitcher(): BbPitcherSheet { return this.teams[this.fieldingIndex].pitchers[0]; }
  batter(): BbBatterSheet { return this.lineups[this.battingIndex].current(); }

  setting(): BbPlaySetting {
    const bases = this.state.bases;
    return { outs: this.state.outs, runners: [bases[0] ? bases[0].id : null, bases[1] ? bases[1].id : null, bases[2] ? bases[2].id : null] };
  }

  board(): BbBoardSnapshot {
    const state = this.state;
    return { inning: state.inning, half: state.half, outs: state.outs, balls: state.balls, strikes: state.strikes, score: [state.score[0], state.score[1]], pitches: state.box[this.fieldingIndex].pit.pitches };
  }

  aiCall(level: BbAiTuning): BbPitchCall {
    return new BbAiPitcher(level).choose(this.state.balls, this.state.strikes, this.pitcher(), this.lastPitch, this.random);
  }

  roll(call: BbPitchCall): BbPitchRoll {
    const pitcher = this.pitcher();
    return BbPitchRoller.roll(call.pitch, call.aim, pitcher.abilities, pitcher.hand, this.random.seed());
  }

  aiSwing(roll: BbPitchRoll, level: BbAiTuning): number | null {
    return new BbAiBatter(level).decide(roll, this.state.balls, this.state.strikes, this.batter().hand, this.previousSpeed, this.pitcher().abilities, this.random);
  }

  preview(roll: BbPitchRoll): BbPitchOutcome { return this.judge.judge(this.state, roll, null, this.batter()); }

  settle(roll: BbPitchRoll, contactOffset: number | null): BbSettledPitch {
    const battingIndex = this.battingIndex, outcome = this.judge.judge(this.state, roll, contactOffset, this.batter()), note = this.rules.apply(this.state, outcome);
    this.lastPitch = note.plateAppearanceOver ? null : roll.pitch;
    this.previousSpeed = note.plateAppearanceOver ? null : roll.speed;
    if (note.plateAppearanceOver) this.lineups[battingIndex].advance();
    return { outcome, note };
  }
}
