"use strict";
class BbFielderPositions {
    static standard(bases, outs) {
        const spots = new Map();
        BbFielderPositions.ALL.forEach((position) => spots.set(position, { ...BbFielderPositions.BASE[position] }));
        if (bases[0] && outs < 2) {
            spots.set("2B", { x: 8.2, z: 32 });
            spots.set("SS", { x: -8.2, z: 32 });
            spots.set("1B", { x: 18.6, z: 20 });
        }
        if (outs >= 2)
            BbFielderPositions.OUTFIELD.forEach((position) => {
                const spot = spots.get(position), depth = BbDiamond.fromHome(spot);
                spots.set(position, { x: spot.x * (depth + 5) / depth, z: spot.z * (depth + 5) / depth });
            });
        return spots;
    }
    static isOutfield(position) { return BbFielderPositions.OUTFIELD.indexOf(position) >= 0; }
}
BbFielderPositions.ALL = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
BbFielderPositions.INFIELD = ["P", "C", "1B", "2B", "SS", "3B"];
BbFielderPositions.OUTFIELD = ["LF", "CF", "RF"];
BbFielderPositions.BASE = {
    P: { x: 0, z: 18.44 }, C: { x: 0, z: -1.6 }, "1B": { x: 17.5, z: 21 }, "2B": { x: 10, z: 31 }, SS: { x: -10, z: 31 }, "3B": { x: -17.5, z: 21 },
    LF: { x: -38, z: 75 }, CF: { x: 0, z: 82 }, RF: { x: 38, z: 75 }
};
class BbFielderMotion {
    static secondsTo(position, from, to, liner) {
        const outfield = BbFielderPositions.isOutfield(position);
        const speed = position === "C" ? BbFielderMotion.CATCHER_SPEED : outfield ? BbFielderMotion.OUTFIELD_SPEED : BbFielderMotion.INFIELD_SPEED;
        const quick = liner && !outfield;
        const reaction = quick ? BbFielderMotion.LINER_REACTION : position === "C" ? BbFielderMotion.CATCHER_REACTION : outfield ? BbFielderMotion.OUTFIELD_REACTION : BbFielderMotion.INFIELD_REACTION;
        const dive = (outfield ? BbFielderMotion.OUTFIELD_DIVE : BbFielderMotion.INFIELD_DIVE) + (quick ? BbFielderMotion.LINER_DIVE_BONUS : 0);
        return reaction + Math.max(0, BbDiamond.distance(from, to) - dive) / speed;
    }
}
BbFielderMotion.INFIELD_SPEED = 6.6;
BbFielderMotion.OUTFIELD_SPEED = 7.4;
BbFielderMotion.CATCHER_SPEED = 5.4;
BbFielderMotion.INFIELD_REACTION = 0.28;
BbFielderMotion.OUTFIELD_REACTION = 0.35;
BbFielderMotion.CATCHER_REACTION = 0.5;
BbFielderMotion.LINER_REACTION = 0.15;
BbFielderMotion.INFIELD_DIVE = 1.3;
BbFielderMotion.OUTFIELD_DIVE = 2;
BbFielderMotion.LINER_DIVE_BONUS = 1;
class BbThrowDecision {
    static rangeDelay(moved) { return Math.min(BbThrowDecision.RANGE_SECONDS_LIMIT, moved * BbThrowDecision.RANGE_SECONDS_PER_METER); }
    secondsTo(from, base) {
        const distance = BbDiamond.distance(from, BbDiamond.base(base)), deep = BbDiamond.fromHome(from) >= BbThrowDecision.OUTFIELD_DEPTH;
        const release = deep ? BbThrowDecision.OUTFIELD_RELEASE : BbThrowDecision.INFIELD_RELEASE, speed = deep ? BbThrowDecision.OUTFIELD_SPEED : BbThrowDecision.INFIELD_SPEED;
        return release + distance / speed + (distance > BbThrowDecision.RELAY_BEYOND ? BbThrowDecision.RELAY_SECONDS : 0);
    }
    relaySeconds(fromBase, toBase) {
        return BbThrowDecision.PIVOT_SECONDS + BbDiamond.distance(BbDiamond.base(fromBase), BbDiamond.base(toBase)) / BbThrowDecision.INFIELD_SPEED;
    }
}
BbThrowDecision.INFIELD_RELEASE = 0.45;
BbThrowDecision.OUTFIELD_RELEASE = 0.6;
BbThrowDecision.INFIELD_SPEED = 33;
BbThrowDecision.OUTFIELD_SPEED = 36;
BbThrowDecision.RELAY_BEYOND = 60;
BbThrowDecision.RELAY_SECONDS = 0.5;
BbThrowDecision.OUTFIELD_DEPTH = 46;
BbThrowDecision.PIVOT_SECONDS = 0.95;
BbThrowDecision.RANGE_SECONDS_PER_METER = 0.08;
BbThrowDecision.RANGE_SECONDS_LIMIT = 0.8;
class BbCoverageTable {
    static secondBaseCover(sprayDegrees) { return sprayDegrees < 0 ? "2B" : "SS"; }
    static relayLead(sprayDegrees) { return sprayDegrees < 0 ? "SS" : "2B"; }
    static relayTrail(sprayDegrees) { return sprayDegrees < 0 ? "2B" : "SS"; }
    static homeCutoff(sprayDegrees, firstWasOccupied) { return sprayDegrees < -15 ? "3B" : firstWasOccupied || sprayDegrees >= -15 ? "1B" : "3B"; }
    static thirdBaseCover(sprayDegrees) { return sprayDegrees < -15 ? "SS" : "3B"; }
    static firstBaseCover(fielder) { return fielder === "1B" ? "P" : "1B"; }
    static firstBaseBackups(basesEmpty) { return basesEmpty ? ["RF", "C"] : ["RF"]; }
    static thirdBaseBackup() { return "LF"; }
}
class BbInfieldGroundBallErrorPolicy {
    constructor(rate) {
        this.rate = rate;
    }
    fumbles(random) { return random.chance(this.rate); }
}
class BbNoErrorPolicy {
    constructor() {
        this.rate = 0;
    }
    fumbles() { return false; }
}
class BbAutoFielding {
    catchInAir(ball, spots, among) {
        const spot = BbDiamond.polar(ball.carry, ball.spray), liner = ball.flight === "line";
        const reach = new Map();
        among.forEach((position) => {
            const seconds = BbFielderMotion.secondsTo(position, spots.get(position), spot, liner);
            if (seconds <= ball.hang)
                reach.set(position, seconds);
        });
        if (!reach.size)
            return null;
        let outfielder = null, infielder = null;
        if (reach.has("CF"))
            outfielder = "CF";
        else
            for (const position of ["LF", "RF"])
                if (reach.has(position) && (!outfielder || reach.get(position) < reach.get(outfielder)))
                    outfielder = position;
        for (const position of BbAutoFielding.INFIELD_CALL)
            if (reach.has(position)) {
                infielder = position;
                break;
            }
        let by = outfielder || infielder;
        if (outfielder && infielder && (ball.flight === "pop" || reach.get(infielder) + BbAutoFielding.INFIELDER_HEAD_START <= reach.get(outfielder)))
            by = infielder;
        return { by, at: ball.hang, spot };
    }
    pickGrounder(ball, spots, among, fromDistance, toDistance) {
        const startSpeed = BbBattedBallPhysics.groundSpeed(ball.exitSpeed), stop = BbBattedBallPhysics.groundStop(startSpeed);
        for (let distance = fromDistance; distance <= Math.min(toDistance, stop); distance += 1) {
            const spot = BbDiamond.polar(distance, ball.spray), ballAt = BbBattedBallPhysics.groundSecondsTo(distance, startSpeed);
            let best = null, bestSeconds = Infinity;
            among.forEach((position) => {
                const home = spots.get(position);
                if (!BbFielderPositions.isOutfield(position) && distance > BbDiamond.fromHome(home) + BbAutoFielding.INFIELD_BACKPEDAL)
                    return;
                const seconds = BbFielderMotion.secondsTo(position, home, spot, false);
                if (seconds <= ballAt && seconds < bestSeconds) {
                    best = position;
                    bestSeconds = seconds;
                }
            });
            if (best)
                return { by: best, at: ballAt, spot, moved: BbDiamond.distance(spots.get(best), spot) };
        }
        if (stop > toDistance)
            return null;
        const rest = BbDiamond.polar(Math.max(fromDistance, stop), ball.spray), stoppedAt = startSpeed / BbBattedBallPhysics.GROUND_SLOWING;
        let nearest = among[0], nearestSeconds = Infinity;
        among.forEach((position) => {
            const seconds = BbFielderMotion.secondsTo(position, spots.get(position), rest, false);
            if (seconds < nearestSeconds) {
                nearest = position;
                nearestSeconds = seconds;
            }
        });
        return { by: nearest, at: Math.max(stoppedAt, nearestSeconds), spot: rest, moved: BbDiamond.distance(spots.get(nearest), rest) };
    }
    retrieve(ball, spots, fence, wallBall) {
        const limit = fence - 1.5;
        if (ball.flight === "ground") {
            const pick = this.pickGrounder(ball, spots, BbFielderPositions.OUTFIELD, 30, limit);
            if (pick)
                return { at: pick.at, spot: pick.spot, holdSeconds: 0, by: pick.by };
        }
        const roll = wallBall ? 0 : Math.max(3, Math.min(30, ball.exitSpeed / 150 * (ball.flight === "line" ? 22 : 10)));
        const landing = Math.min(ball.carry, limit), distance = Math.min(landing + roll, limit), spot = BbDiamond.polar(distance, ball.spray);
        const ballAt = ball.hang * (landing / Math.max(ball.carry, 1)) + (distance - landing) / BbAutoFielding.ROLL_SPEED + (wallBall ? 1 : 0);
        let by = "CF", bySeconds = Infinity;
        BbFielderPositions.ALL.forEach((position) => {
            if (position === "C" || position === "P")
                return;
            const seconds = BbFielderMotion.secondsTo(position, spots.get(position), spot, false);
            if (seconds < bySeconds) {
                by = position;
                bySeconds = seconds;
            }
        });
        return { at: Math.max(ballAt, bySeconds), spot, holdSeconds: ball.flight === "ground" || ball.flight === "line" ? 0 : Math.min(ball.hang, 1) * 0.6, by };
    }
}
BbAutoFielding.INFIELD_CALL = ["SS", "2B", "3B", "1B", "P", "C"];
BbAutoFielding.INFIELDER_HEAD_START = 0.5;
BbAutoFielding.ROLL_SPEED = 11;
BbAutoFielding.INFIELD_BACKPEDAL = 3;
