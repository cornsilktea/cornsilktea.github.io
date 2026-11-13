"use strict";
class BbPlayCodes {
    static isHit(code) { return BbPlayCodes.HITS.indexOf(code) >= 0; }
    static endsPlateAppearance(code) { return code !== "FOUL"; }
}
BbPlayCodes.HITS = ["SINGLE", "DOUBLE", "TRIPLE", "HOME_RUN"];
BbPlayCodes.TOTAL_BASES = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, HOME_RUN: 4 };
BbPlayCodes.LABELS = {
    SINGLE: "안타!", DOUBLE: "2루타!", TRIPLE: "3루타!", HOME_RUN: "홈런!", GROUND_OUT: "땅볼 아웃", FLY_OUT: "플라이 아웃", LINE_OUT: "직선타 아웃", POP_OUT: "내야 뜬공 아웃",
    DOUBLE_PLAY: "병살타", SAC_FLY: "희생플라이", FIELDERS_CHOICE: "야수선택", FOUL_CAUGHT: "파울 플라이 아웃", FOUL: "파울", INFIELD_FLY: "인필드 플라이!", ERROR: "실책"
};
class BbInfieldFlyRule {
    static applies(situation, ball, spots) {
        if (situation.outs >= 2 || !situation.bases[0] || !situation.bases[1] || ball.foul)
            return false;
        if (ball.flight !== "fly" && ball.flight !== "pop")
            return false;
        if (ball.carry > BbInfieldFlyRule.DEEPEST)
            return false;
        const spot = BbDiamond.polar(ball.carry, ball.spray);
        return BbFielderPositions.INFIELD.some((position) => BbFielderMotion.secondsTo(position, spots.get(position), spot, false) <= ball.hang - BbInfieldFlyRule.EASY_SECONDS);
    }
}
BbInfieldFlyRule.DEEPEST = 45;
BbInfieldFlyRule.EASY_SECONDS = 0.3;
class BbPlayResolver {
    constructor(dimensions, fielding, running, errors) {
        this.dimensions = dimensions;
        this.fielding = fielding;
        this.running = running;
        this.errors = errors;
        this.throws = new BbThrowDecision();
    }
    resolve(situation, ball, random) {
        const spots = BbFielderPositions.standard(situation.bases, situation.outs);
        if (ball.foul)
            return this.foul(situation, ball, spots);
        if (ball.flight === "ground")
            return this.grounder(situation, ball, spots, random);
        const fence = this.dimensions.fenceDistance(ball.spray);
        if (ball.carry >= fence) {
            if (BbBattedBallPhysics.heightAt(fence, ball.carry, ball.launch) >= this.dimensions.wallHeight)
                return this.homeRun(situation, ball);
            return this.hit(situation, ball, this.fielding.retrieve(ball, spots, fence, true));
        }
        if (BbInfieldFlyRule.applies(situation, ball, spots))
            return this.infieldFly(situation, ball, spots);
        const caught = this.fielding.catchInAir(ball, spots, BbFielderPositions.ALL);
        if (caught)
            return this.flyOut(situation, ball, caught);
        return this.hit(situation, ball, this.fielding.retrieve(ball, spots, fence, false));
    }
    blank(situation, result, ball) {
        const spot = BbDiamond.polar(ball.carry, ball.spray);
        return {
            result, outsAdded: 0, basesAfter: [situation.bases[0], situation.bases[1], situation.bases[2]], scored: [], batterReached: 0, fielder: null, distance: ball.carry,
            events: [{ t: 0, kind: "ballFlight", spot: [spot.x, spot.z], arriveT: ball.hang }]
        };
    }
    inFoulGround(spot) {
        const width = this.dimensions.foulTerritoryWidth, along = (Math.abs(spot.x) + spot.z) * Math.SQRT1_2;
        if (along < 0)
            return BbDiamond.fromHome(spot) <= width;
        return along <= this.dimensions.fenceDistance(45) && Math.abs(Math.abs(spot.x) - spot.z) * Math.SQRT1_2 <= width;
    }
    foul(situation, ball, spots) {
        const script = this.blank(situation, "FOUL", ball), spot = BbDiamond.polar(ball.carry, ball.spray);
        const high = ball.flight === "fly" || ball.flight === "pop";
        const caught = high && this.inFoulGround(spot) ? this.fielding.catchInAir(ball, spots, BbFielderPositions.ALL) : null;
        if (!caught)
            return script;
        script.result = "FOUL_CAUGHT";
        script.outsAdded = 1;
        script.fielder = caught.by;
        script.events.push({ t: caught.at, kind: "catch", who: caught.by, spot: [spot.x, spot.z] }, { t: caught.at, kind: "callOut", who: situation.batter.id, base: 0 });
        return script;
    }
    homeRun(situation, ball) {
        const script = this.blank(situation, "HOME_RUN", ball);
        for (let base = 3; base >= 1; base--) {
            const runner = situation.bases[base - 1];
            if (runner)
                script.scored.push(runner);
        }
        script.scored.push(situation.batter);
        script.basesAfter = [null, null, null];
        script.batterReached = 4;
        script.events.push({ t: ball.hang, kind: "homeRun", who: situation.batter.id });
        return script;
    }
    infieldFly(situation, ball, spots) {
        const script = this.blank(situation, "INFIELD_FLY", ball), caught = this.fielding.catchInAir(ball, spots, BbFielderPositions.INFIELD);
        script.outsAdded = 1;
        script.fielder = caught ? caught.by : null;
        script.events.push({ t: 0.4, kind: "infieldFly", who: situation.batter.id });
        if (caught)
            script.events.push({ t: caught.at, kind: "catch", who: caught.by, spot: [caught.spot.x, caught.spot.z] });
        return script;
    }
    flyOut(situation, ball, caught) {
        const script = this.blank(situation, ball.flight === "line" ? "LINE_OUT" : ball.flight === "pop" ? "POP_OUT" : "FLY_OUT", ball);
        script.outsAdded = 1;
        script.fielder = caught.by;
        script.events.push({ t: caught.at, kind: "catch", who: caught.by, spot: [caught.spot.x, caught.spot.z] }, { t: caught.at, kind: "callOut", who: situation.batter.id, base: 0 });
        if (situation.outs + 1 >= 3)
            return script;
        const moves = this.running.onFlyOut(situation.bases, situation.abilities, caught.at, caught.spot, this.throws);
        this.applyMoves(script, moves, caught.at);
        if (script.scored.length && BbFielderPositions.isOutfield(caught.by))
            script.result = "SAC_FLY";
        return script;
    }
    hit(situation, ball, retrieve) {
        const script = this.blank(situation, "SINGLE", ball);
        if (situation.outs >= 2)
            retrieve = { ...retrieve, holdSeconds: 0 };
        const moves = this.running.onHit(situation.bases, situation.batter, situation.abilities, retrieve, this.throws);
        script.basesAfter = [null, null, null];
        script.fielder = retrieve.by;
        script.events.push({ t: retrieve.at, kind: "field", who: retrieve.by, spot: [retrieve.spot.x, retrieve.spot.z] });
        this.applyMoves(script, moves, 0);
        const reached = moves.find((move) => move.from === 0).to;
        script.batterReached = reached;
        script.result = reached >= 4 ? "HOME_RUN" : reached === 3 ? "TRIPLE" : reached === 2 ? "DOUBLE" : "SINGLE";
        script.events.push({ t: retrieve.at, kind: "throw", who: retrieve.by, base: Math.min(4, reached + 1), arriveT: retrieve.at + this.throws.secondsTo(retrieve.spot, Math.min(4, reached + 1)) });
        return script;
    }
    applyMoves(script, moves, startAt) {
        const after = [null, null, null];
        for (const move of moves) {
            if (move.to !== move.from)
                script.events.push({ t: startAt, kind: move.from > 0 && startAt > 0 ? "tagUp" : "runnerMove", who: move.runner.id, from: move.from, base: move.to, arriveT: move.arriveAt });
            if (move.out) {
                script.events.push({ t: move.arriveAt, kind: "callOut", who: move.runner.id, base: move.to });
                continue;
            }
            if (move.to >= 4) {
                script.scored.push(move.runner);
                script.events.push({ t: move.arriveAt, kind: "score", who: move.runner.id });
            }
            else if (move.to >= 1)
                after[move.to - 1] = move.runner;
        }
        script.basesAfter = after;
    }
    grounder(situation, ball, spots, random) {
        const pick = this.fielding.pickGrounder(ball, spots, BbFielderPositions.INFIELD, 3, BbPlayResolver.INFIELD_REACH);
        if (!pick)
            return this.hit(situation, ball, this.fielding.retrieve(ball, spots, this.dimensions.fenceDistance(ball.spray), false));
        const script = this.blank(situation, "GROUND_OUT", ball), bases = situation.bases, abilities = situation.abilities;
        script.fielder = pick.by;
        script.distance = BbDiamond.fromHome(pick.spot);
        script.events = [{ t: 0, kind: "ballFlight", spot: [pick.spot.x, pick.spot.z], arriveT: pick.at }, { t: pick.at, kind: "field", who: pick.by, spot: [pick.spot.x, pick.spot.z] }];
        const shifted = this.running.onForcedShift(bases, situation.batter, abilities);
        if (this.errors.fumbles(random)) {
            script.result = "ERROR";
            script.batterReached = 1;
            script.events.push({ t: pick.at, kind: "error", who: pick.by });
            this.applyMoves(script, shifted, 0);
            return script;
        }
        const batterAt = BbRunnerMotion.batterSeconds(1, abilities), runnerAt = BbRunnerMotion.fromBaseSeconds(1, abilities);
        const loaded = !!(bases[0] && bases[1] && bases[2]), leadForce = loaded ? 4 : bases[0] && bases[1] ? 3 : bases[0] ? 2 : 0;
        const doubleBase = loaded ? 4 : bases[0] ? 2 : 0;
        const out = (who, base, at) => {
            const move = shifted.find((entry) => entry.runner === who);
            move.out = true;
            move.to = base;
            move.arriveAt = at;
            script.outsAdded++;
        };
        const runnerInto = (base) => shifted.find((entry) => entry.to === base && entry.from === base - 1).runner;
        const readyAt = pick.at + BbThrowDecision.rangeDelay(pick.moved);
        const firstAt = readyAt + this.throws.secondsTo(pick.spot, 1);
        if (situation.outs < 2 && doubleBase) {
            const leadAt = readyAt + this.throws.secondsTo(pick.spot, doubleBase);
            if (leadAt < runnerAt) {
                out(runnerInto(doubleBase), doubleBase, leadAt);
                script.events.push({ t: pick.at, kind: "throw", who: pick.by, base: doubleBase, arriveT: leadAt });
                const turnAt = leadAt + this.throws.relaySeconds(doubleBase, 1);
                script.events.push({ t: leadAt, kind: "throw", who: doubleBase === 4 ? "C" : BbCoverageTable.secondBaseCover(ball.spray), base: 1, arriveT: turnAt });
                if (turnAt < batterAt) {
                    out(situation.batter, 1, turnAt);
                    script.result = "DOUBLE_PLAY";
                }
                else {
                    script.result = "FIELDERS_CHOICE";
                    script.batterReached = 1;
                }
                return this.closeInfieldPlay(script, situation, shifted);
            }
        }
        if (firstAt < batterAt) {
            out(situation.batter, 1, firstAt);
            script.events.push({ t: pick.at, kind: "throw", who: pick.by, base: 1, arriveT: firstAt });
            const second = shifted.find((entry) => entry.from === 2 && !entry.forced);
            if (second && ball.spray > 0 && !bases[2]) {
                second.to = 3;
                second.arriveAt = BbRunnerMotion.fromBaseSeconds(1, abilities);
            }
            return this.closeInfieldPlay(script, situation, shifted);
        }
        if (leadForce) {
            const leadAt = readyAt + this.throws.secondsTo(pick.spot, leadForce);
            if (leadAt < runnerAt) {
                out(runnerInto(leadForce), leadForce, leadAt);
                script.events.push({ t: pick.at, kind: "throw", who: pick.by, base: leadForce, arriveT: leadAt });
                script.result = "FIELDERS_CHOICE";
                script.batterReached = 1;
                return this.closeInfieldPlay(script, situation, shifted);
            }
        }
        script.result = "SINGLE";
        script.batterReached = 1;
        return this.closeInfieldPlay(script, situation, shifted);
    }
    closeInfieldPlay(script, situation, moves) {
        const inningOver = situation.outs + script.outsAdded >= 3;
        this.applyMoves(script, moves, 0);
        if (inningOver && script.result !== "SINGLE")
            script.scored = [];
        return script;
    }
}
BbPlayResolver.INFIELD_REACH = 44;
