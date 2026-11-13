"use strict";
class BbBatterAbilityModel {
    static leniency(contact) { return 1 + BbBatterAbilityModel.LENIENCY_STEP * (contact - BbBatterAbilityModel.BASE); }
    static exitBoost(power) { return BbBatterAbilityModel.EXIT_SPEED_STEP * (power - BbBatterAbilityModel.BASE); }
    static topWeight(power) { return 1 + BbBatterAbilityModel.TOP_WEIGHT_STEP * (power - BbBatterAbilityModel.BASE); }
    static topSpeed(speed) { return 8 + BbBatterAbilityModel.RUN_SPEED_STEP * (speed - BbBatterAbilityModel.BASE); }
    static firstBaseSeconds(speed) { return 4.1 - BbBatterAbilityModel.FIRST_BASE_STEP * (speed - BbBatterAbilityModel.BASE); }
    static advanceMargin(speed) { return 0.25 - BbBatterAbilityModel.MARGIN_STEP * (speed - BbBatterAbilityModel.BASE); }
}
BbBatterAbilityModel.BASE = 3;
BbBatterAbilityModel.LENIENCY_STEP = 0.1;
BbBatterAbilityModel.EXIT_SPEED_STEP = 1.15;
BbBatterAbilityModel.TOP_WEIGHT_STEP = 0.037;
BbBatterAbilityModel.RUN_SPEED_STEP = 0.6;
BbBatterAbilityModel.FIRST_BASE_STEP = 0.15;
BbBatterAbilityModel.MARGIN_STEP = 0.1;
class BbStrikeZoneJudge {
    static isStrike(point) { return Math.abs(point.u) <= 1 && Math.abs(point.v) <= 1; }
    static inside(point, hand) { return hand === "R" ? point.u : -point.u; }
    static offCenter(point) { return Math.max(Math.abs(point.u), Math.abs(point.v)); }
    static cellOf(point) {
        if (!BbStrikeZoneJudge.isStrike(point))
            return -1;
        const column = Math.min(2, Math.floor((point.u + 1) / 2 * 3)), row = Math.min(2, Math.floor((1 - point.v) / 2 * 3));
        return row * 3 + column;
    }
}
class BbTimingModel {
    static idealShift(inside, noise) { return BbTimingModel.SIDE_SHIFT * Math.max(-2, Math.min(2, inside)) + noise; }
    static width(offCenter, speed, leniency) {
        const points = BbTimingModel.WIDTH_POINTS;
        let base = points[points.length - 1][1];
        for (let index = 0; index < points.length - 1; index++) {
            if (offCenter <= points[index + 1][0]) {
                const ratio = Math.max(0, (offCenter - points[index][0]) / (points[index + 1][0] - points[index][0]));
                base = points[index][1] + (points[index + 1][1] - points[index][1]) * ratio;
                break;
            }
        }
        return base * Math.max(0.85, Math.min(1.15, 1 - 0.004 * (speed - 140))) * leniency;
    }
    static bandOf(adjusted, width, leniency) {
        const error = Math.abs(adjusted), extra = BbTimingModel.BAND_EXTRA;
        if (error <= width)
            return "perfect";
        if (error <= width + extra.good * leniency)
            return "good";
        if (error <= width + extra.fair * leniency)
            return "fair";
        if (error <= width + extra.poor * leniency)
            return "poor";
        return "miss";
    }
}
BbTimingModel.SWING_DELAY = 0.12;
BbTimingModel.SIDE_SHIFT = 0.028;
BbTimingModel.WIDTH_POINTS = [[0, 0.055], [1, 0.028], [1.6, 0.012], [2, 0.006]];
BbTimingModel.BAND_EXTRA = { good: 0.04, fair: 0.08, poor: 0.13 };
class BbContactModel {
    static chase(offCenter) {
        if (offCenter <= 1.15)
            return 1;
        if (offCenter <= 1.9)
            return 1 - 0.65 * (offCenter - 1.15) / 0.75;
        return 0.1;
    }
    static chance(band, offCenter) { return BbContactModel.CONTACT_CHANCE[band] * BbContactModel.chase(offCenter); }
}
BbContactModel.CONTACT_CHANCE = { perfect: 0.95, good: 0.84, fair: 0.64, poor: 0.44, miss: 0 };
BbContactModel.FOUL_TIP_CHANCE = { perfect: 0.14, good: 0.3, fair: 0.46, poor: 0.6 };
class BbSprayModel {
    static tippedDegrees(adjusted, hand, random) {
        const pulled = adjusted < 0 ? random.chance(0.75) : random.chance(0.25), side = (hand === "R" ? -1 : 1) * (pulled ? 1 : -1);
        return side * random.between(BbSprayModel.FOUL_DEGREES + 3, 115);
    }
    static sprayDegrees(adjusted, inside, hand, band, random) {
        const pull = -0.3 * adjusted * 1000 - 8 * inside + random.gaussian(0, BbSprayModel.SCATTER[band]);
        return hand === "R" ? -pull : pull;
    }
}
BbSprayModel.FOUL_DEGREES = 45;
BbSprayModel.BACK_DEGREES = 70;
BbSprayModel.SCATTER = { perfect: 9, good: 16, fair: 26, poor: 38 };
class BbLaunchModel {
    static launchDegrees(adjusted, height, band, random) {
        const deviation = band === "perfect" || band === "good" ? 13 : 17;
        return Math.max(-15, Math.min(70, 18 + 10 * height - 0.06 * adjusted * 1000 + random.gaussian(0, deviation)));
    }
}
class BbExitSpeedModel {
    static sample(band, offCenter, pitchSpeed, power, random) {
        const lift = BbBatterAbilityModel.topWeight(power);
        const parts = BbExitSpeedModel.MIX[band].map((part, index) => index < BbExitSpeedModel.TOP_PARTS ? { ...part, weight: part.weight * lift } : part);
        const base = BbMixtureSampler.sample(parts, random);
        const tuned = base + BbExitSpeedModel.CENTER_BONUS * (1 - Math.min(offCenter, 1)) + BbExitSpeedModel.PITCH_SPEED_FACTOR * (pitchSpeed - 135) + BbBatterAbilityModel.exitBoost(power);
        return Math.max(40, Math.min(185, tuned));
    }
}
BbExitSpeedModel.TOP_PARTS = 2;
BbExitSpeedModel.CENTER_BONUS = 10;
BbExitSpeedModel.PITCH_SPEED_FACTOR = 0.08;
BbExitSpeedModel.MIX = {
    perfect: [{ weight: 18, mean: 170, deviation: 6 }, { weight: 30, mean: 160, deviation: 7 }, { weight: 27, mean: 149, deviation: 8 }, { weight: 17, mean: 134, deviation: 10 }, { weight: 8, mean: 114, deviation: 12 }],
    good: [{ weight: 8, mean: 158, deviation: 8 }, { weight: 24, mean: 146, deviation: 9 }, { weight: 34, mean: 132, deviation: 10 }, { weight: 24, mean: 114, deviation: 12 }, { weight: 10, mean: 94, deviation: 14 }],
    fair: [{ weight: 5, mean: 142, deviation: 9 }, { weight: 15, mean: 128, deviation: 10 }, { weight: 30, mean: 110, deviation: 12 }, { weight: 35, mean: 93, deviation: 14 }, { weight: 15, mean: 76, deviation: 14 }],
    poor: [{ weight: 0, mean: 110, deviation: 12 }, { weight: 25, mean: 100, deviation: 14 }, { weight: 75, mean: 80, deviation: 16 }]
};
class BbBattedBallPhysics {
    static lookup(table, value) {
        if (value <= table[0][0])
            return table[0][1];
        for (let index = 0; index < table.length - 1; index++) {
            if (value <= table[index + 1][0]) {
                const ratio = (value - table[index][0]) / (table[index + 1][0] - table[index][0]);
                return table[index][1] + (table[index + 1][1] - table[index][1]) * ratio;
            }
        }
        return table[table.length - 1][1];
    }
    static kindOf(launchDegrees) {
        if (launchDegrees < 8)
            return "ground";
        if (launchDegrees < 22)
            return "line";
        return launchDegrees <= 50 ? "fly" : "pop";
    }
    static carry(exitSpeed, launchDegrees) {
        return BbBattedBallPhysics.CARRY_SCALE * BbBattedBallPhysics.lookup(BbBattedBallPhysics.CARRY, exitSpeed) * BbBattedBallPhysics.lookup(BbBattedBallPhysics.ANGLE_SHARE, Math.max(0, launchDegrees));
    }
    static hangSeconds(exitSpeed, launchDegrees) {
        const reference = Math.sin(BbBattedBallPhysics.REFERENCE_DEGREES * Math.PI / 180);
        const share = Math.sin(Math.max(2, launchDegrees) * Math.PI / 180) / reference;
        return Math.max(0.35, BbBattedBallPhysics.REFERENCE_HANG * (exitSpeed / 150) * (share < 1 ? Math.pow(share, BbBattedBallPhysics.LOW_ARC_POWER) : share));
    }
    static heightAt(distance, carry, launchDegrees) {
        if (distance >= carry)
            return 0;
        return distance * Math.tan(launchDegrees * Math.PI / 180) * (1 - distance / carry) + 1;
    }
    static groundSpeed(exitSpeed) { return exitSpeed / 3.6 * BbBattedBallPhysics.GROUND_SPEED_KEEP; }
    static groundSecondsTo(distance, startSpeed) {
        const slowing = BbBattedBallPhysics.GROUND_SLOWING, inside = startSpeed * startSpeed - 2 * slowing * distance;
        return inside < 0 ? null : (startSpeed - Math.sqrt(inside)) / slowing;
    }
    static groundStop(startSpeed) { return startSpeed * startSpeed / (2 * BbBattedBallPhysics.GROUND_SLOWING); }
}
BbBattedBallPhysics.REFERENCE_DEGREES = 28;
BbBattedBallPhysics.REFERENCE_HANG = 4.8;
BbBattedBallPhysics.LOW_ARC_POWER = 1.5;
BbBattedBallPhysics.CARRY_SCALE = 1.15;
BbBattedBallPhysics.GROUND_SPEED_KEEP = 1;
BbBattedBallPhysics.GROUND_SLOWING = 2.8;
BbBattedBallPhysics.CARRY = [[60, 12], [90, 34], [120, 62], [130, 73], [140, 85], [150, 98], [160, 110], [170, 123], [180, 136], [190, 149]];
BbBattedBallPhysics.ANGLE_SHARE = [[0, 0.12], [8, 0.42], [10, 0.55], [15, 0.75], [20, 0.9], [28, 1], [35, 0.97], [40, 0.88], [45, 0.75], [50, 0.6], [60, 0.35], [70, 0.15]];
class BbSwingAction {
    constructor() {
        this.kind = "swing";
    }
    resolve(context) {
        const roll = context.roll, random = context.random, leniency = BbBatterAbilityModel.leniency(context.abilities.contact);
        const inside = BbStrikeZoneJudge.inside(roll.arrive, context.batterHand), offCenter = BbStrikeZoneJudge.offCenter(roll.arrive);
        const width = BbTimingModel.width(offCenter, roll.speed, leniency);
        if (context.contactOffset === null)
            return { kind: "take", band: null, adjusted: null, width, ball: null };
        const adjusted = context.contactOffset - BbTimingModel.idealShift(inside, roll.timingNoise);
        const band = BbTimingModel.bandOf(adjusted, width, leniency);
        if (band === "miss" || !random.chance(BbContactModel.chance(band, offCenter)))
            return { kind: "miss", band, adjusted, width, ball: null };
        const tipped = random.chance(BbContactModel.FOUL_TIP_CHANCE[band]);
        const spray = tipped ? BbSprayModel.tippedDegrees(adjusted, context.batterHand, random) : BbSprayModel.sprayDegrees(adjusted, inside, context.batterHand, band, random);
        const launch = tipped ? random.between(-10, 30) : BbLaunchModel.launchDegrees(adjusted, roll.arrive.v, band, random);
        const exitSpeed = BbExitSpeedModel.sample(band, offCenter, roll.speed, context.abilities.power, random);
        const ball = {
            exitSpeed, launch, spray, carry: BbBattedBallPhysics.carry(exitSpeed, launch), hang: BbBattedBallPhysics.hangSeconds(exitSpeed, launch),
            flight: BbBattedBallPhysics.kindOf(launch), foul: Math.abs(spray) > BbSprayModel.FOUL_DEGREES
        };
        return { kind: "contact", band, adjusted, width, ball };
    }
}
class BbBatterActionSet {
    static of(kind) { return BbBatterActionSet.ALLOWED.find((action) => action.kind === kind) || BbBatterActionSet.ALLOWED[0]; }
}
BbBatterActionSet.ALLOWED = [new BbSwingAction()];
