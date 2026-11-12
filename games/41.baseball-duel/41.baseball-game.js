"use strict";
class BbStandardFormat {
    constructor() {
        this.maxInning = 15;
        this.walkOff = true;
        this.skipBottomWhenLeading = true;
    }
    get lastRegularInning() { return this.startInning + this.inningsToPlay - 1; }
    extraStartBases(inning) {
        if (inning <= this.lastRegularInning)
            return [];
        return inning === this.lastRegularInning + 1 ? [1, 2] : [1, 2, 3];
    }
}
class BbOneInningFormat extends BbStandardFormat {
    constructor() {
        super(...arguments);
        this.id = "one";
        this.startInning = 9;
        this.inningsToPlay = 1;
    }
}
class BbThreeInningFormat extends BbStandardFormat {
    constructor() {
        super(...arguments);
        this.id = "three";
        this.startInning = 7;
        this.inningsToPlay = 3;
    }
}
class BbFullGameFormat extends BbStandardFormat {
    constructor() {
        super(...arguments);
        this.id = "full";
        this.startInning = 1;
        this.inningsToPlay = 9;
    }
}
class BbLineup {
    constructor(slots) {
        this.slots = slots;
        this.turn = 0;
    }
    current() { return this.slots[this.turn % this.slots.length]; }
    advance() { this.turn++; }
}
class BbNoStamina {
    afterPitch() { return; }
    isSpent() { return false; }
}
class BbNoSubstitution {
    nextPitcher() { return null; }
}
class BbPitcherRoster {
    constructor(pitchers) {
        this.starter = pitchers.find((pitcher) => pitcher.role === "starter") || pitchers[0];
        this.relievers = pitchers.filter((pitcher) => pitcher.role === "reliever");
        this.closer = pitchers.find((pitcher) => pitcher.role === "closer") || null;
        this.onMound = this.starter;
    }
    current() { return this.onMound; }
    change(to) { this.onMound = to; }
}
class BbBoxScoreBuilder {
    static emptyBat() { return { pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, k: 0, sf: 0, rbi: 0, r: 0, roe: 0 }; }
    static emptyPit() { return { bf: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, k: 0, sf: 0, outs: 0, r: 0, er: 0, pitches: 0, strikes: 0 }; }
    static emptyTeam() {
        return { bat: BbBoxScoreBuilder.emptyBat(), pit: BbBoxScoreBuilder.emptyPit(), byType: { ft: { n: 0, s: 0 }, cv: { n: 0, s: 0 }, sl: { n: 0, s: 0 }, ch: { n: 0, s: 0 }, kn: { n: 0, s: 0 } }, bestDistance: 0, bestExit: 0, bestPitch: 0 };
    }
}
class BbBallHandler {
    apply(state, outcome, rules) {
        state.balls++;
        if (state.balls < 4)
            return { toast: "볼", plateAppearanceOver: false, halfOver: false, runs: 0 };
        const batting = rules.batting(state), fielding = rules.fielding(state), batter = rules.newRunner(state, true);
        batting.bat.pa++;
        batting.bat.bb++;
        fielding.pit.bf++;
        fielding.pit.bb++;
        let scored = null;
        if (state.bases[0] && state.bases[1] && state.bases[2])
            scored = state.bases[2];
        if (state.bases[0] && state.bases[1])
            state.bases[2] = state.bases[1];
        if (state.bases[0])
            state.bases[1] = state.bases[0];
        state.bases[0] = batter;
        const runs = scored ? rules.scoreRuns(state, [scored], true) : 0;
        return rules.finishPlateAppearance(state, "볼넷", runs, "끝내기 볼넷!");
    }
}
class BbStrikeHandler {
    constructor(swung) {
        this.swung = swung;
    }
    apply(state, outcome, rules) {
        state.strikes++;
        rules.fielding(state).pit.strikes++;
        if (state.strikes < 3)
            return { toast: this.swung ? "헛스윙" : "스트라이크!", plateAppearanceOver: false, halfOver: false, runs: 0 };
        const batting = rules.batting(state), fielding = rules.fielding(state);
        batting.bat.pa++;
        batting.bat.ab++;
        batting.bat.k++;
        fielding.pit.bf++;
        fielding.pit.ab++;
        fielding.pit.k++;
        rules.addOuts(state, 1);
        return rules.finishPlateAppearance(state, "삼진 아웃!", 0, "");
    }
}
class BbFoulHandler {
    apply(state, outcome, rules) {
        if (state.strikes < 2)
            state.strikes++;
        rules.fielding(state).pit.strikes++;
        return { toast: "파울", plateAppearanceOver: false, halfOver: false, runs: 0 };
    }
}
class BbInPlayHandler {
    apply(state, outcome, rules) {
        const script = outcome.script, code = script.result, batting = rules.batting(state), fielding = rules.fielding(state), ball = outcome.swing.ball;
        fielding.pit.strikes++;
        batting.bat.pa++;
        fielding.pit.bf++;
        const sacrifice = code === "SAC_FLY";
        if (sacrifice) {
            batting.bat.sf++;
            fielding.pit.sf++;
        }
        else {
            batting.bat.ab++;
            fielding.pit.ab++;
        }
        if (BbPlayCodes.isHit(code)) {
            batting.bat.h++;
            fielding.pit.h++;
            if (code === "DOUBLE") {
                batting.bat.d2++;
                fielding.pit.d2++;
            }
            if (code === "TRIPLE") {
                batting.bat.d3++;
                fielding.pit.d3++;
            }
            if (code === "HOME_RUN") {
                batting.bat.hr++;
                fielding.pit.hr++;
            }
            batting.bestDistance = Math.max(batting.bestDistance, script.distance);
            batting.bestExit = Math.max(batting.bestExit, ball.exitSpeed);
        }
        if (code === "ERROR") {
            batting.bat.roe++;
            state.tainted = true;
        }
        state.bases = [script.basesAfter[0], script.basesAfter[1], script.basesAfter[2]];
        rules.addOuts(state, script.outsAdded);
        const creditsBatter = code !== "DOUBLE_PLAY" && code !== "ERROR";
        const runs = script.scored.length && state.outs <= 3 ? rules.scoreRuns(state, script.scored, creditsBatter) : 0;
        return rules.finishPlateAppearance(state, BbPlayCodes.LABELS[code], runs, BbInPlayHandler.WALK_OFF[code] || "끝내기!");
    }
}
BbInPlayHandler.WALK_OFF = { HOME_RUN: "끝내기 홈런!", SINGLE: "끝내기 안타!", DOUBLE: "끝내기 안타!", TRIPLE: "끝내기 안타!", SAC_FLY: "끝내기 희생플라이!" };
class BbEventHandlerRegistry {
    constructor() {
        this.handlers = new Map();
    }
    static standard() {
        const registry = new BbEventHandlerRegistry();
        registry.register("ball", new BbBallHandler());
        registry.register("calledStrike", new BbStrikeHandler(false));
        registry.register("swingMiss", new BbStrikeHandler(true));
        registry.register("foul", new BbFoulHandler());
        registry.register("inPlay", new BbInPlayHandler());
        return registry;
    }
    register(kind, handler) { this.handlers.set(kind, handler); }
    handlerOf(kind) { return this.handlers.get(kind); }
}
class BbMatchRules {
    constructor(format, registry = BbEventHandlerRegistry.standard()) {
        this.format = format;
        this.registry = registry;
    }
    start() {
        const state = {
            inning: this.format.startInning, half: 0, outs: 0, balls: 0, strikes: 0, bases: [null, null, null], score: [0, 0], lineScore: [[0, 0]], halvesDone: 0, pitchCount: 0,
            runnerSerial: 0, tainted: false, finished: false, winner: null, endNote: "", box: [BbBoxScoreBuilder.emptyTeam(), BbBoxScoreBuilder.emptyTeam()]
        };
        this.placeStartRunners(state);
        return state;
    }
    battingIndex(state) { return state.half; }
    fieldingIndex(state) { return state.half === 0 ? 1 : 0; }
    batting(state) { return state.box[this.battingIndex(state)]; }
    fielding(state) { return state.box[this.fieldingIndex(state)]; }
    progress(state) {
        return Math.min(1, (state.halvesDone + Math.min(state.outs, 3) / 3) / (this.format.inningsToPlay * 2));
    }
    newRunner(state, earned) {
        state.runnerSerial++;
        return { id: "r" + state.runnerSerial, earned: earned && !state.tainted };
    }
    apply(state, outcome) {
        if (state.finished)
            return { toast: "", plateAppearanceOver: false, halfOver: false, runs: 0 };
        const fielding = this.fielding(state), type = fielding.byType[outcome.roll.pitch];
        state.pitchCount++;
        fielding.pit.pitches++;
        type.n++;
        if (outcome.kind !== "ball")
            type.s++;
        fielding.bestPitch = Math.max(fielding.bestPitch, outcome.roll.speed);
        return this.registry.handlerOf(outcome.kind).apply(state, outcome, this);
    }
    addOuts(state, count) {
        state.outs += count;
        this.fielding(state).pit.outs += Math.min(count, 3);
    }
    scoreRuns(state, runners, creditBatter) {
        const batting = this.batting(state), fielding = this.fielding(state), line = state.lineScore[state.lineScore.length - 1];
        for (const runner of runners) {
            state.score[state.half]++;
            line[state.half]++;
            batting.bat.r++;
            fielding.pit.r++;
            if (runner.earned && !state.tainted)
                fielding.pit.er++;
            if (creditBatter)
                batting.bat.rbi++;
        }
        return runners.length;
    }
    finishPlateAppearance(state, toast, runs, walkOffNote) {
        state.balls = 0;
        state.strikes = 0;
        const lastOrLater = state.inning >= this.format.startInning + this.format.inningsToPlay - 1;
        if (this.format.walkOff && state.half === 1 && lastOrLater && state.score[1] > state.score[0]) {
            this.finish(state, 1, runs > 0 ? walkOffNote : "");
            return { toast: state.endNote || toast, plateAppearanceOver: true, halfOver: true, runs };
        }
        if (state.outs < 3)
            return { toast, plateAppearanceOver: true, halfOver: false, runs };
        this.endHalf(state, lastOrLater);
        return { toast, plateAppearanceOver: true, halfOver: true, runs };
    }
    finish(state, winner, note) {
        state.finished = true;
        state.winner = winner;
        state.endNote = note;
    }
    endHalf(state, lastOrLater) {
        state.halvesDone++;
        state.outs = 0;
        state.bases = [null, null, null];
        state.tainted = false;
        if (state.half === 0) {
            if (lastOrLater && this.format.skipBottomWhenLeading && state.score[1] > state.score[0]) {
                this.finish(state, 1, "");
                return;
            }
            state.half = 1;
            this.placeStartRunners(state);
            return;
        }
        if (lastOrLater && state.score[0] !== state.score[1]) {
            this.finish(state, state.score[0] > state.score[1] ? 0 : 1, "");
            return;
        }
        if (lastOrLater && state.inning >= this.format.maxInning) {
            this.finish(state, -1, "");
            return;
        }
        state.inning++;
        state.half = 0;
        state.lineScore.push([0, 0]);
        this.placeStartRunners(state);
    }
    placeStartRunners(state) {
        for (const base of this.format.extraStartBases(state.inning)) {
            state.runnerSerial++;
            state.bases[base - 1] = { id: "x" + state.runnerSerial, earned: false };
        }
    }
}
class BbPitchJudge {
    constructor(dimensions, errors, rules) {
        this.rules = rules;
        this.resolver = new BbPlayResolver(dimensions, new BbAutoFielding(), new BbAutoBaseRunning(), errors);
    }
    judge(state, roll, contactOffset, batter) {
        const random = new BbSeededRandom(roll.seed ^ 0x5bd1e995);
        const swing = BbBatterActionSet.of("swing").resolve({ roll, batterHand: batter.hand, abilities: batter.abilities, contactOffset, random });
        if (swing.kind === "take")
            return { kind: BbStrikeZoneJudge.isStrike(roll.arrive) ? "calledStrike" : "ball", roll, swing, script: null };
        if (swing.kind === "miss")
            return { kind: "swingMiss", roll, swing, script: null };
        const runner = { id: "r" + (state.runnerSerial + 1), earned: !state.tainted };
        const script = this.resolver.resolve({ outs: state.outs, bases: state.bases, batter: runner, abilities: batter.abilities }, swing.ball, random);
        if (script.result === "FOUL")
            return { kind: "foul", roll, swing, script };
        if (script.result === "ERROR")
            runner.earned = false;
        state.runnerSerial++;
        return { kind: "inPlay", roll, swing, script };
    }
}
class BbGameLogFold {
    constructor(format, dimensions, errors, teams) {
        this.format = format;
        this.dimensions = dimensions;
        this.errors = errors;
        this.teams = teams;
    }
    fold(entries) {
        const rules = new BbMatchRules(this.format), judge = new BbPitchJudge(this.dimensions, this.errors, rules), state = rules.start();
        const lineups = [new BbLineup(this.teams[0].lineup), new BbLineup(this.teams[1].lineup)], rosters = [new BbPitcherRoster(this.teams[0].pitchers), new BbPitcherRoster(this.teams[1].pitchers)];
        for (const entry of entries) {
            if (state.finished)
                break;
            const pitcher = rosters[rules.fieldingIndex(state)].current(), lineup = lineups[rules.battingIndex(state)];
            const roll = BbPitchRoller.roll(entry.pitch, entry.aim, pitcher.abilities, pitcher.hand, entry.seed);
            const note = rules.apply(state, judge.judge(state, roll, entry.contactOffset, lineup.current()));
            if (note.plateAppearanceOver)
                lineup.advance();
        }
        return state;
    }
}
class BbBaseballFormulas {
    static totalBases(counts) { return counts.h + counts.d2 + 2 * counts.d3 + 3 * counts.hr; }
    static average(counts) { return counts.ab ? counts.h / counts.ab : null; }
    static onBase(counts) { const chances = counts.ab + counts.bb + counts.sf; return chances ? (counts.h + counts.bb) / chances : null; }
    static slugging(counts) { return counts.ab ? BbBaseballFormulas.totalBases(counts) / counts.ab : null; }
    static ops(counts) {
        const onBase = BbBaseballFormulas.onBase(counts), slugging = BbBaseballFormulas.slugging(counts);
        return onBase === null || slugging === null ? null : onBase + slugging;
    }
    static perPlate(value, counts) { return counts.pa ? value / counts.pa : null; }
    static perBatter(value, counts) { return counts.bf ? value / counts.bf : null; }
    static innings(counts) { return counts.outs / 3; }
    static earnedRunAverage(counts) { return counts.outs ? 9 * counts.er / BbBaseballFormulas.innings(counts) : null; }
    static whip(counts) { return counts.outs ? (counts.bb + counts.h) / BbBaseballFormulas.innings(counts) : null; }
    static winRate(wins, losses, ties) { const games = wins + losses + ties; return games ? wins / games : null; }
    static perGame(total, games) { return games ? total / games : null; }
    static rateText(value) { return value === null ? "-" : value >= 1 ? value.toFixed(3) : value.toFixed(3).slice(1); }
    static meanText(value) { return value === null ? "-" : value.toFixed(2); }
    static inningsText(counts) { return Math.floor(counts.outs / 3) + "." + counts.outs % 3; }
}
