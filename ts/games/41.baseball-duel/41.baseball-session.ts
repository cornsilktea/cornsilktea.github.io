class BbDuelSession {
  private static readonly ERROR_CHANCE = 0.05;

  readonly state: BbGameState;
  readonly log: BbLogEvent[] = [];
  readonly engine: BbMatchEngine;
  private lastPitch: BbPitchId | null = null;
  private previousSpeed: number | null = null;

  constructor(format: BbMatchFormat, dimensions: BbFieldDimensions, teams: readonly [BbTeamSheet, BbTeamSheet], private readonly random: BbSeededRandom) {
    this.engine = new BbMatchEngine(format, dimensions, new BbInfieldGroundBallErrorPolicy(BbDuelSession.ERROR_CHANCE), teams);
    this.state = this.engine.state;
  }

  get battingIndex(): 0 | 1 { return this.engine.battingIndex; }
  get fieldingIndex(): 0 | 1 { return this.engine.fieldingIndex; }

  pitcher(): BbPitcherSheet { return this.engine.pitcher(); }
  batter(): BbBatterSheet { return this.engine.batter(); }
  roster(team: 0 | 1 = this.fieldingIndex): BbPitcherRoster { return this.engine.roster(team); }

  setting(): BbPlaySetting {
    const bases = this.state.bases;
    return { outs: this.state.outs, runners: [bases[0] ? bases[0].id : null, bases[1] ? bases[1].id : null, bases[2] ? bases[2].id : null] };
  }

  board(): BbBoardSnapshot {
    const state = this.state;
    return { inning: state.inning, half: state.half, outs: state.outs, balls: state.balls, strikes: state.strikes, score: [state.score[0], state.score[1]], pitches: this.roster().pitchesThisOuting() };
  }

  aiCall(level: BbAiTuning): BbPitchCall {
    return new BbAiPitcher(level).choose(this.state.balls, this.state.strikes, this.pitcher(), this.lastPitch, this.random, this.engine.condition());
  }

  get lastThrown(): BbPitchId | null { return this.lastPitch; }

  rollWith(call: BbPitchCall, seed: number): BbPitchRoll { return this.engine.roll(call, seed); }

  restore(entries: readonly BbLogEvent[]): void {
    entries.forEach((entry) => {
      if (this.state.finished) return;
      if (BbLogEvents.isChange(entry)) this.change(entry.change);
      else this.settle(this.rollWith({ pitch: entry.pitch, aim: entry.aim }, entry.seed), entry.contactOffset);
    });
  }

  roll(call: BbPitchCall): BbPitchRoll { return this.engine.roll(call, this.random.seed()); }

  aiSwing(roll: BbPitchRoll, level: BbAiTuning): number | null {
    return new BbAiBatter(level).decide(roll, this.state.balls, this.state.strikes, this.batter().hand, this.previousSpeed, this.pitcher().abilities, this.random);
  }

  preview(roll: BbPitchRoll): BbPitchOutcome { return this.engine.preview(roll); }

  change(index: number): boolean {
    if (!this.engine.change(index)) return false;
    this.lastPitch = null;
    this.log.push({ change: index });
    return true;
  }

  tiredRelief(): number | null { return new BbTiredSubstitution().nextPitcher(this.roster()); }

  settle(roll: BbPitchRoll, contactOffset: number | null): BbSettledPitch {
    const settled = this.engine.settle(roll, contactOffset), note = settled.note;
    this.lastPitch = note.plateAppearanceOver ? null : roll.pitch;
    this.previousSpeed = note.plateAppearanceOver ? null : roll.speed;
    this.log.push({ pitch: roll.pitch, aim: roll.aim, seed: roll.seed, contactOffset });
    return settled;
  }
}
