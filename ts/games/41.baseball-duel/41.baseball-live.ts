interface BbLiveBoard {
  inning: number;
  half: 0 | 1;
  outs: number;
  balls: number;
  strikes: number;
  score: [number, number];
}

interface BbLivePitch extends BbPitchCue {
  toast: string;
  batterHand: BbHand;
  fieldingIndex: 0 | 1;
  halfOver: boolean;
  board: BbLiveBoard;
}

class BbAiGameFeed {
  private static readonly ERROR_CHANCE = 0.05;
  private static readonly PLAIN_CALLS: Readonly<Record<BbOutcomeKind, string>> = { ball: "볼", calledStrike: "스트라이크", swingMiss: "헛스윙", foul: "파울", inPlay: "" };
  private readonly queue: BbLivePitch[] = [];
  private readonly seeds: BbSeededRandom;

  constructor(private readonly dimensions: BbFieldDimensions, private readonly batterHand: BbHand, private readonly pitcherHand: BbHand, seed: number) {
    this.seeds = new BbSeededRandom(seed);
  }

  next(): BbLivePitch {
    if (!this.queue.length) this.playGame();
    return this.queue.shift() as BbLivePitch;
  }

  private static settingOf(state: BbGameState): BbPlaySetting {
    return { outs: state.outs, runners: [state.bases[0] ? state.bases[0].id : null, state.bases[1] ? state.bases[1].id : null, state.bases[2] ? state.bases[2].id : null] };
  }

  private playGame(): void {
    const level = BbAiLevel.ALL.normal, batter = BbAiLevel.batterSheet(this.batterHand), format = new BbThreeInningFormat();
    const team: BbTeamSheet = { lineup: [batter], pitchers: [BbAiLevel.pitcherSheet(this.pitcherHand)] };
    const runner = new BbAiMatchRunner(format, this.dimensions, new BbInfieldGroundBallErrorPolicy(BbAiGameFeed.ERROR_CHANCE), [team, team], [level, level], [level, level]);
    let setting = BbAiGameFeed.settingOf(new BbMatchRules(format).start());
    runner.play(new BbSeededRandom(this.seeds.seed()), (state, outcome, note, battingIndex) => {
      const called = outcome.script ? BbPlayCodes.LABELS[outcome.script.result] : BbAiGameFeed.PLAIN_CALLS[outcome.kind];
      this.queue.push({
        outcome, setting, toast: note.toast || called, pitcherHand: this.pitcherHand, batterHand: this.batterHand, abilities: batter.abilities,
        fieldingIndex: battingIndex === 0 ? 1 : 0, halfOver: note.halfOver,
        board: { inning: state.inning, half: state.half, outs: state.outs, balls: state.balls, strikes: state.strikes, score: [state.score[0], state.score[1]] }
      });
      setting = BbAiGameFeed.settingOf(state);
    });
  }
}
