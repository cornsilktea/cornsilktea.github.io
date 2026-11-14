"use strict";
class BbDuelSession {
    constructor(format, dimensions, teams, random) {
        this.random = random;
        this.log = [];
        this.lastPitch = null;
        this.previousSpeed = null;
        this.engine = new BbMatchEngine(format, dimensions, new BbInfieldGroundBallErrorPolicy(BbDuelSession.ERROR_CHANCE), teams);
        this.state = this.engine.state;
    }
    get battingIndex() { return this.engine.battingIndex; }
    get fieldingIndex() { return this.engine.fieldingIndex; }
    pitcher() { return this.engine.pitcher(); }
    batter() { return this.engine.batter(); }
    roster(team = this.fieldingIndex) { return this.engine.roster(team); }
    setting() {
        const bases = this.state.bases;
        return { outs: this.state.outs, runners: [bases[0] ? bases[0].id : null, bases[1] ? bases[1].id : null, bases[2] ? bases[2].id : null] };
    }
    board() {
        const state = this.state;
        return { inning: state.inning, half: state.half, outs: state.outs, balls: state.balls, strikes: state.strikes, score: [state.score[0], state.score[1]], pitches: this.roster().pitchesThisOuting() };
    }
    aiCall(level) {
        return new BbAiPitcher(level).choose(this.state.balls, this.state.strikes, this.pitcher(), this.lastPitch, this.random, this.engine.condition());
    }
    get lastThrown() { return this.lastPitch; }
    rollWith(call, seed) { return this.engine.roll(call, seed); }
    restore(entries) {
        entries.forEach((entry) => {
            if (this.state.finished)
                return;
            if (BbLogEvents.isChange(entry))
                this.change(entry.change);
            else
                this.settle(this.rollWith({ pitch: entry.pitch, aim: entry.aim }, entry.seed), entry.contactOffset);
        });
    }
    roll(call) { return this.engine.roll(call, this.random.seed()); }
    aiSwing(roll, level) {
        return new BbAiBatter(level).decide(roll, this.state.balls, this.state.strikes, this.batter().hand, this.previousSpeed, this.pitcher().abilities, this.random);
    }
    preview(roll) { return this.engine.preview(roll); }
    change(index) {
        if (!this.engine.change(index))
            return false;
        this.lastPitch = null;
        this.log.push({ change: index });
        return true;
    }
    tiredRelief() { return new BbTiredSubstitution().nextPitcher(this.roster()); }
    settle(roll, contactOffset) {
        const settled = this.engine.settle(roll, contactOffset), note = settled.note;
        this.lastPitch = note.plateAppearanceOver ? null : roll.pitch;
        this.previousSpeed = note.plateAppearanceOver ? null : roll.speed;
        this.log.push({ pitch: roll.pitch, aim: roll.aim, seed: roll.seed, contactOffset });
        return settled;
    }
}
BbDuelSession.ERROR_CHANCE = 0.05;
