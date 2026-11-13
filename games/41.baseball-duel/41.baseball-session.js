"use strict";
class BbDuelSession {
    constructor(format, dimensions, teams, random) {
        this.teams = teams;
        this.random = random;
        this.lastPitch = null;
        this.previousSpeed = null;
        this.rules = new BbMatchRules(format);
        this.judge = new BbPitchJudge(dimensions, new BbInfieldGroundBallErrorPolicy(BbDuelSession.ERROR_CHANCE), this.rules);
        this.state = this.rules.start();
        this.lineups = teams.map((team) => new BbLineup(team.lineup));
    }
    get battingIndex() { return this.rules.battingIndex(this.state); }
    get fieldingIndex() { return this.rules.fieldingIndex(this.state); }
    pitcher() { return this.teams[this.fieldingIndex].pitchers[0]; }
    batter() { return this.lineups[this.battingIndex].current(); }
    setting() {
        const bases = this.state.bases;
        return { outs: this.state.outs, runners: [bases[0] ? bases[0].id : null, bases[1] ? bases[1].id : null, bases[2] ? bases[2].id : null] };
    }
    board() {
        const state = this.state;
        return { inning: state.inning, half: state.half, outs: state.outs, balls: state.balls, strikes: state.strikes, score: [state.score[0], state.score[1]], pitches: state.box[this.fieldingIndex].pit.pitches };
    }
    aiCall(level) {
        return new BbAiPitcher(level).choose(this.state.balls, this.state.strikes, this.pitcher(), this.lastPitch, this.random);
    }
    roll(call) {
        const pitcher = this.pitcher();
        return BbPitchRoller.roll(call.pitch, call.aim, pitcher.abilities, pitcher.hand, this.random.seed());
    }
    aiSwing(roll, level) {
        return new BbAiBatter(level).decide(roll, this.state.balls, this.state.strikes, this.batter().hand, this.previousSpeed, this.pitcher().abilities, this.random);
    }
    preview(roll) { return this.judge.judge(this.state, roll, null, this.batter()); }
    settle(roll, contactOffset) {
        const battingIndex = this.battingIndex, outcome = this.judge.judge(this.state, roll, contactOffset, this.batter()), note = this.rules.apply(this.state, outcome);
        this.lastPitch = note.plateAppearanceOver ? null : roll.pitch;
        this.previousSpeed = note.plateAppearanceOver ? null : roll.speed;
        if (note.plateAppearanceOver)
            this.lineups[battingIndex].advance();
        return { outcome, note };
    }
}
BbDuelSession.ERROR_CHANCE = 0.05;
