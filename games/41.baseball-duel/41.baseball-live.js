"use strict";
class BbAiGameFeed {
    constructor(dimensions, batterHand, pitcherHand, seed) {
        this.dimensions = dimensions;
        this.batterHand = batterHand;
        this.pitcherHand = pitcherHand;
        this.queue = [];
        this.seeds = new BbSeededRandom(seed);
    }
    next() {
        if (!this.queue.length)
            this.playGame();
        return this.queue.shift();
    }
    static boardOf(state, fieldingIndex) {
        return { inning: state.inning, half: state.half, outs: state.outs, balls: state.balls, strikes: state.strikes, score: [state.score[0], state.score[1]], pitches: state.box[fieldingIndex].pit.pitches };
    }
    static settingOf(state) {
        return { outs: state.outs, runners: [state.bases[0] ? state.bases[0].id : null, state.bases[1] ? state.bases[1].id : null, state.bases[2] ? state.bases[2].id : null] };
    }
    playGame() {
        const level = BbAiLevel.ALL.normal, batter = BbAiLevel.batterSheet(this.batterHand), format = new BbThreeInningFormat();
        const team = { lineup: [batter], pitchers: [BbAiLevel.pitcherSheet(this.pitcherHand)] };
        const runner = new BbAiMatchRunner(format, this.dimensions, new BbInfieldGroundBallErrorPolicy(BbAiGameFeed.ERROR_CHANCE), [team, team], [level, level], [level, level]);
        const opening = new BbMatchRules(format).start();
        let setting = BbAiGameFeed.settingOf(opening), boardBefore = BbAiGameFeed.boardOf(opening, 1);
        runner.play(new BbSeededRandom(this.seeds.seed()), (state, outcome, note, battingIndex) => {
            const called = outcome.script ? BbPlayCodes.LABELS[outcome.script.result] : BbAiGameFeed.PLAIN_CALLS[outcome.kind];
            this.queue.push({
                outcome, setting, toast: note.toast || called, pitcherHand: this.pitcherHand, batterHand: this.batterHand, abilities: batter.abilities,
                fieldingIndex: battingIndex === 0 ? 1 : 0, halfOver: note.halfOver, boardBefore,
                board: BbAiGameFeed.boardOf(state, battingIndex === 0 ? 1 : 0)
            });
            setting = BbAiGameFeed.settingOf(state);
            boardBefore = BbAiGameFeed.boardOf(state, state.half === 0 ? 1 : 0);
        });
    }
}
BbAiGameFeed.ERROR_CHANCE = 0.05;
BbAiGameFeed.PLAIN_CALLS = { ball: "볼", calledStrike: "스트라이크", swingMiss: "헛스윙", foul: "파울", inPlay: "" };
