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
class BbRosterPlan {
    static pitcherRoles() {
        const roles = [];
        BbRosterPlan.PITCHER_SLOTS.forEach((slot) => { for (let index = 0; index < slot.count; index++)
            roles.push(slot.role); });
        return roles;
    }
    static pitcherCount() { return BbRosterPlan.pitcherRoles().length; }
    static batterCount() { return BbRosterPlan.BATTING_ORDER.length; }
    static roleLabel(role) { const slot = BbRosterPlan.PITCHER_SLOTS.find((entry) => entry.role === role); return slot ? slot.label : role; }
    static positionLabel(position) { return BbRosterPlan.POSITION_LABELS[position]; }
    static isFullLineup(lineup) {
        if (lineup.length !== BbRosterPlan.batterCount())
            return false;
        return BbRosterPlan.BATTING_ORDER.every((position) => lineup.filter((sheet) => sheet.position === position).length === 1);
    }
    static swapPosition(lineup, index, to) {
        const mover = lineup[index], holder = lineup.find((sheet) => sheet.position === to);
        if (!mover || mover.position === to)
            return;
        if (holder)
            holder.position = mover.position;
        mover.position = to;
    }
    static orderedPitchers(pitchers) {
        const order = BbRosterPlan.PITCHER_SLOTS.map((slot) => slot.role);
        return pitchers.map((sheet, index) => ({ sheet, index })).sort((a, b) => (order.indexOf(a.sheet.role) - order.indexOf(b.sheet.role)) || a.index - b.index).map((entry) => entry.sheet);
    }
    static points(value) { return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(7, Math.round(value))) : BbRosterPlan.BASE_POINTS; }
    static crewOf(lineup) {
        const points = new Map();
        lineup.forEach((sheet) => { const position = sheet.position; if (position && position !== "DH")
            points.set(position, BbRosterPlan.points(sheet.abilities.defense)); });
        return new BbDefenseCrew(points);
    }
}
BbRosterPlan.PITCHER_SLOTS = [{ role: "starter", count: 1, label: "선발" }, { role: "reliever", count: 1, label: "중간계투" }, { role: "closer", count: 1, label: "마무리" }];
BbRosterPlan.BATTING_ORDER = ["DH", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
BbRosterPlan.POSITION_LABELS = { DH: "지명타자", C: "포수", "1B": "1루수", "2B": "2루수", "3B": "3루수", SS: "유격수", LF: "좌익수", CF: "중견수", RF: "우익수" };
BbRosterPlan.DESIGNATED = "DH";
BbRosterPlan.BASE_POINTS = 3;
class BbLineup {
    constructor(slots) {
        this.slots = slots;
        this.turn = 0;
    }
    current() { return this.slots[this.turn % this.slots.length]; }
    currentIndex() { return this.turn % this.slots.length; }
    advance() { this.turn++; }
}
class BbStaminaModel {
    static costOf(stamina, outcome) {
        const points = BbRosterPlan.points(stamina), code = outcome.script ? outcome.script.result : null;
        let cost = BbStaminaModel.PITCH_COST[points];
        if (outcome.kind === "inPlay" && code === "HOME_RUN")
            cost += BbStaminaModel.HOME_RUN_COST[points];
        else if (outcome.kind === "inPlay" && code && BbPlayCodes.isHit(code))
            cost += BbStaminaModel.HIT_COST[points];
        return cost;
    }
    static condition(level) {
        if (level < BbStaminaModel.WORN_BELOW)
            return BbStaminaModel.WORN;
        if (level < BbStaminaModel.TIRED_BELOW)
            return BbStaminaModel.TIRED;
        return BbPitchCondition.FRESH;
    }
}
BbStaminaModel.FULL = 100;
BbStaminaModel.TIRED_BELOW = 50;
BbStaminaModel.WORN_BELOW = 30;
BbStaminaModel.PITCH_COST = [0, 4, 3.5, 3, 2.5, 2, 1.5, 1];
BbStaminaModel.HIT_COST = [0, 2, 1.8, 1.7, 1.5, 1.3, 1.2, 1];
BbStaminaModel.HOME_RUN_COST = [0, 4, 3.7, 3.3, 3, 2.7, 2.3, 2];
BbStaminaModel.TIRED = new BbPitchCondition(0.9, 1);
BbStaminaModel.WORN = new BbPitchCondition(0.9, 1.3);
class BbNoStamina {
    spend() { return; }
    level() { return BbStaminaModel.FULL; }
    condition() { return BbPitchCondition.FRESH; }
    isSpent() { return false; }
}
class BbStaminaMeter {
    constructor(stamina) {
        this.stamina = stamina;
        this.value = BbStaminaModel.FULL;
    }
    spend(outcome) { this.value = Math.max(0, this.value - BbStaminaModel.costOf(this.stamina, outcome)); }
    level() { return this.value; }
    condition() { return BbStaminaModel.condition(this.value); }
    isSpent() { return this.value < BbStaminaModel.WORN_BELOW; }
}
class BbPitcherRoster {
    constructor(pitchers, meterOf = (sheet) => new BbStaminaMeter(sheet.abilities.stamina)) {
        this.retired = new Set();
        this.mound = 0;
        this.thrown = 0;
        this.pitchers = BbRosterPlan.orderedPitchers(pitchers);
        this.meters = this.pitchers.map(meterOf);
    }
    current() { return this.pitchers[this.mound]; }
    currentIndex() { return this.mound; }
    pitchesThisOuting() { return this.thrown; }
    stamina(index = this.mound) { return this.meters[index]; }
    isAvailable(index) { return Number.isInteger(index) && index >= 0 && index < this.pitchers.length && index !== this.mound && !this.retired.has(index); }
    available() { return this.pitchers.map((sheet, index) => index).filter((index) => this.isAvailable(index)); }
    recommended() {
        const left = this.available();
        return left.length ? left[0] : null;
    }
    change(index) {
        if (!this.isAvailable(index))
            return false;
        this.retired.add(this.mound);
        this.mound = index;
        this.thrown = 0;
        return true;
    }
    afterPitch(outcome) {
        this.thrown++;
        this.meters[this.mound].spend(outcome);
    }
}
class BbNoSubstitution {
    nextPitcher() { return null; }
}
class BbTiredSubstitution {
    nextPitcher(roster) { return roster.stamina().isSpent() ? roster.recommended() : null; }
}
class BbZoneGrid {
    static indexOf(point) {
        if (Math.abs(point.u) > 1 || Math.abs(point.v) > 1)
            return BbZoneGrid.OUTSIDE;
        const column = Math.min(2, Math.floor((point.u + 1) * 1.5)), row = Math.min(2, Math.floor((1 - point.v) * 1.5));
        return row * 3 + column;
    }
    static emptyHitting() { return Array.from({ length: BbZoneGrid.SLOTS }, () => ({ n: 0, ab: 0, h: 0, tb: 0 })); }
    static emptyPitching() { return Array.from({ length: BbZoneGrid.SLOTS }, () => 0); }
}
BbZoneGrid.CELLS = 9;
BbZoneGrid.OUTSIDE = 9;
BbZoneGrid.SLOTS = 10;
class BbBoxScoreBuilder {
    static emptyBat() { return { pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, k: 0, sf: 0, rbi: 0, r: 0, roe: 0 }; }
    static emptyPit() { return { bf: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, k: 0, sf: 0, outs: 0, r: 0, er: 0, pitches: 0, strikes: 0 }; }
    static emptyTeam() {
        return {
            bat: BbBoxScoreBuilder.emptyBat(), pit: BbBoxScoreBuilder.emptyPit(), byType: { ft: { n: 0, s: 0 }, cv: { n: 0, s: 0 }, sl: { n: 0, s: 0 }, ch: { n: 0, s: 0 }, kn: { n: 0, s: 0 } },
            bestDistance: 0, bestExit: 0, bestPitch: 0, batZones: BbZoneGrid.emptyHitting(), pitZones: BbZoneGrid.emptyPitching()
        };
    }
}
class BbBallHandler {
    apply(state, outcome, rules) {
        state.balls++;
        if (state.balls < 4)
            return { toast: "볼", plateAppearanceOver: false, halfOver: false, runs: 0 };
        const batting = rules.batting(state), fielding = rules.fielding(state), batter = rules.newRunner(state, true, outcome.runnerSpeed);
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
    newRunner(state, earned, speed) {
        state.runnerSerial++;
        const runner = { id: "r" + state.runnerSerial, earned: earned && !state.tainted };
        if (speed !== undefined)
            runner.speed = speed;
        return runner;
    }
    apply(state, outcome) {
        if (state.finished)
            return { toast: "", plateAppearanceOver: false, halfOver: false, runs: 0 };
        const fielding = this.fielding(state), batting = this.batting(state), type = fielding.byType[outcome.roll.pitch], zone = BbZoneGrid.indexOf(outcome.roll.arrive);
        const before = { ab: batting.bat.ab, h: batting.bat.h, tb: BbBaseballFormulas.totalBases(batting.bat) };
        state.pitchCount++;
        fielding.pit.pitches++;
        fielding.pitZones[zone]++;
        type.n++;
        if (outcome.kind !== "ball")
            type.s++;
        fielding.bestPitch = Math.max(fielding.bestPitch, outcome.roll.speed);
        const note = this.registry.handlerOf(outcome.kind).apply(state, outcome, this), cell = batting.batZones[zone];
        cell.n++;
        cell.ab += batting.bat.ab - before.ab;
        cell.h += batting.bat.h - before.h;
        cell.tb += BbBaseballFormulas.totalBases(batting.bat) - before.tb;
        return note;
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
    constructor(dimensions, errors, rules, crews = [BbDefenseCrew.STANDARD, BbDefenseCrew.STANDARD]) {
        this.rules = rules;
        this.crews = crews;
        const resolverFor = (crew) => new BbPlayResolver(dimensions, new BbAutoFielding(crew), new BbAutoBaseRunning(), errors, crew);
        this.resolvers = [resolverFor(crews[0]), resolverFor(crews[1])];
    }
    judge(state, roll, contactOffset, batter) {
        const random = new BbSeededRandom(roll.seed ^ 0x5bd1e995), fielding = this.rules.fieldingIndex(state), runnerSpeed = batter.abilities.speed;
        const swing = BbBatterActionSet.of("swing").resolve({ roll, batterHand: batter.hand, abilities: batter.abilities, contactOffset, random, catcherDefense: this.crews[fielding].pointsOf("C") });
        if (swing.kind === "take")
            return { kind: BbStrikeZoneJudge.isStrike(roll.arrive) ? "calledStrike" : "ball", roll, swing, script: null, runnerSpeed };
        if (swing.kind === "miss")
            return { kind: "swingMiss", roll, swing, script: null, runnerSpeed };
        const runner = { id: "r" + (state.runnerSerial + 1), earned: !state.tainted, speed: runnerSpeed };
        const script = this.resolvers[fielding].resolve({ outs: state.outs, bases: state.bases, batter: runner, abilities: batter.abilities }, swing.ball, random);
        if (script.result === "FOUL")
            return { kind: "foul", roll, swing, script, runnerSpeed };
        if (script.result === "ERROR")
            runner.earned = false;
        state.runnerSerial++;
        return { kind: "inPlay", roll, swing, script, runnerSpeed };
    }
}
class BbLogEvents {
    static isChange(event) { return typeof event.change === "number"; }
}
class BbMatchEngine {
    constructor(format, dimensions, errors, teams) {
        this.teams = teams;
        this.rules = new BbMatchRules(format);
        this.judge = new BbPitchJudge(dimensions, errors, this.rules, [BbRosterPlan.crewOf(teams[0].lineup), BbRosterPlan.crewOf(teams[1].lineup)]);
        this.state = this.rules.start();
        this.lineups = [new BbLineup(teams[0].lineup), new BbLineup(teams[1].lineup)];
        this.rosters = [new BbPitcherRoster(teams[0].pitchers), new BbPitcherRoster(teams[1].pitchers)];
    }
    get battingIndex() { return this.rules.battingIndex(this.state); }
    get fieldingIndex() { return this.rules.fieldingIndex(this.state); }
    roster(team = this.fieldingIndex) { return this.rosters[team]; }
    lineup(team = this.battingIndex) { return this.lineups[team]; }
    pitcher() { return this.roster().current(); }
    batter() { return this.lineup().current(); }
    condition() { return this.roster().stamina().condition(); }
    roll(call, seed) {
        const pitcher = this.pitcher();
        return BbPitchRoller.roll(call.pitch, call.aim, pitcher.abilities, pitcher.hand, seed, this.condition());
    }
    preview(roll) { return this.judge.judge(this.state, roll, null, this.batter()); }
    settle(roll, contactOffset) {
        const roster = this.roster(), lineup = this.lineup(), outcome = this.judge.judge(this.state, roll, contactOffset, lineup.current()), note = this.rules.apply(this.state, outcome);
        roster.afterPitch(outcome);
        if (note.plateAppearanceOver)
            lineup.advance();
        return { outcome, note };
    }
    change(index) { return !this.state.finished && this.roster().change(index); }
    replay(event) {
        if (this.state.finished)
            return;
        if (BbLogEvents.isChange(event)) {
            this.change(event.change);
            return;
        }
        this.settle(this.roll(event, event.seed), event.contactOffset);
    }
}
class BbGameLogFold {
    constructor(format, dimensions, errors, teams) {
        this.format = format;
        this.dimensions = dimensions;
        this.errors = errors;
        this.teams = teams;
    }
    engine(entries) {
        const engine = new BbMatchEngine(this.format, this.dimensions, this.errors, this.teams);
        entries.forEach((entry) => engine.replay(entry));
        return engine;
    }
    fold(entries) { return this.engine(entries).state; }
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
