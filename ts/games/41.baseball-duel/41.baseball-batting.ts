interface BbBatterAbilities {
  contact: number;
  power: number;
  speed: number;
}

class BbBatterAbilityModel {
  static readonly BASE = 3;
  static readonly LENIENCY_STEP = 0.1;
  static readonly EXIT_SPEED_STEP = 1.15;
  static readonly TOP_WEIGHT_STEP = 0.037;
  static readonly RUN_SPEED_STEP = 0.6;
  static readonly FIRST_BASE_STEP = 0.15;
  static readonly MARGIN_STEP = 0.1;

  static leniency(contact: number): number { return 1 + BbBatterAbilityModel.LENIENCY_STEP * (contact - BbBatterAbilityModel.BASE); }
  static exitBoost(power: number): number { return BbBatterAbilityModel.EXIT_SPEED_STEP * (power - BbBatterAbilityModel.BASE); }
  static topWeight(power: number): number { return 1 + BbBatterAbilityModel.TOP_WEIGHT_STEP * (power - BbBatterAbilityModel.BASE); }
  static topSpeed(speed: number): number { return 8 + BbBatterAbilityModel.RUN_SPEED_STEP * (speed - BbBatterAbilityModel.BASE); }
  static firstBaseSeconds(speed: number): number { return 4.1 - BbBatterAbilityModel.FIRST_BASE_STEP * (speed - BbBatterAbilityModel.BASE); }
  static advanceMargin(speed: number): number { return 0.25 - BbBatterAbilityModel.MARGIN_STEP * (speed - BbBatterAbilityModel.BASE); }
}

class BbStrikeZoneJudge {
  static isStrike(point: BbZonePoint): boolean { return Math.abs(point.u) <= 1 && Math.abs(point.v) <= 1; }
  static inside(point: BbZonePoint, hand: BbHand): number { return hand === "R" ? point.u : -point.u; }
  static offCenter(point: BbZonePoint): number { return Math.max(Math.abs(point.u), Math.abs(point.v)); }
  static cellOf(point: BbZonePoint): number {
    if (!BbStrikeZoneJudge.isStrike(point)) return -1;
    const column = Math.min(2, Math.floor((point.u + 1) / 2 * 3)), row = Math.min(2, Math.floor((1 - point.v) / 2 * 3));
    return row * 3 + column;
  }
}

type BbTimingBand = "perfect" | "good" | "fair" | "poor" | "miss";

class BbTimingModel {
  static readonly SWING_DELAY = 0.12;
  static readonly SIDE_SHIFT = 0.028;
  static readonly WIDTH_POINTS: ReadonlyArray<readonly [offCenter: number, seconds: number]> = [[0, 0.055], [1, 0.028], [1.6, 0.012], [2, 0.006]];
  static readonly BAND_EXTRA: Readonly<Record<Exclude<BbTimingBand, "perfect" | "miss">, number>> = { good: 0.04, fair: 0.08, poor: 0.13 };

  static idealShift(inside: number, noise: number): number { return BbTimingModel.SIDE_SHIFT * Math.max(-2, Math.min(2, inside)) + noise; }

  static width(offCenter: number, speed: number, leniency: number): number {
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

  static bandOf(adjusted: number, width: number, leniency: number): BbTimingBand {
    const error = Math.abs(adjusted), extra = BbTimingModel.BAND_EXTRA;
    if (error <= width) return "perfect";
    if (error <= width + extra.good * leniency) return "good";
    if (error <= width + extra.fair * leniency) return "fair";
    if (error <= width + extra.poor * leniency) return "poor";
    return "miss";
  }
}

class BbContactModel {
  static readonly CONTACT_CHANCE: Readonly<Record<BbTimingBand, number>> = { perfect: 0.95, good: 0.84, fair: 0.64, poor: 0.44, miss: 0 };

  static readonly FOUL_TIP_CHANCE: Readonly<Record<Exclude<BbTimingBand, "miss">, number>> = { perfect: 0.14, good: 0.3, fair: 0.46, poor: 0.6 };

  static chase(offCenter: number): number {
    if (offCenter <= 1.15) return 1;
    if (offCenter <= 1.9) return 1 - 0.65 * (offCenter - 1.15) / 0.75;
    return 0.1;
  }

  static chance(band: BbTimingBand, offCenter: number): number { return BbContactModel.CONTACT_CHANCE[band] * BbContactModel.chase(offCenter); }
}

class BbSprayModel {
  static readonly FOUL_DEGREES = 45;
  static readonly BACK_DEGREES = 70;

  static readonly SCATTER: Readonly<Record<Exclude<BbTimingBand, "miss">, number>> = { perfect: 9, good: 16, fair: 26, poor: 38 };

  static tippedDegrees(adjusted: number, hand: BbHand, random: BbSeededRandom): number {
    const pulled = adjusted < 0 ? random.chance(0.75) : random.chance(0.25), side = (hand === "R" ? -1 : 1) * (pulled ? 1 : -1);
    return side * random.between(BbSprayModel.FOUL_DEGREES + 3, 115);
  }

  static sprayDegrees(adjusted: number, inside: number, hand: BbHand, band: Exclude<BbTimingBand, "miss">, random: BbSeededRandom): number {
    const pull = -0.3 * adjusted * 1000 - 8 * inside + random.gaussian(0, BbSprayModel.SCATTER[band]);
    return hand === "R" ? -pull : pull;
  }
}

class BbLaunchModel {
  static launchDegrees(adjusted: number, height: number, band: BbTimingBand, random: BbSeededRandom): number {
    const deviation = band === "perfect" || band === "good" ? 13 : 17;
    return Math.max(-15, Math.min(70, 18 + 10 * height - 0.06 * adjusted * 1000 + random.gaussian(0, deviation)));
  }
}

class BbExitSpeedModel {
  static readonly TOP_PARTS = 2;
  static readonly CENTER_BONUS = 10;
  static readonly PITCH_SPEED_FACTOR = 0.08;
  static readonly MIX: Readonly<Record<Exclude<BbTimingBand, "miss">, readonly BbMixturePart[]>> = {
    perfect: [{ weight: 18, mean: 170, deviation: 6 }, { weight: 30, mean: 160, deviation: 7 }, { weight: 27, mean: 149, deviation: 8 }, { weight: 17, mean: 134, deviation: 10 }, { weight: 8, mean: 114, deviation: 12 }],
    good: [{ weight: 8, mean: 158, deviation: 8 }, { weight: 24, mean: 146, deviation: 9 }, { weight: 34, mean: 132, deviation: 10 }, { weight: 24, mean: 114, deviation: 12 }, { weight: 10, mean: 94, deviation: 14 }],
    fair: [{ weight: 5, mean: 142, deviation: 9 }, { weight: 15, mean: 128, deviation: 10 }, { weight: 30, mean: 110, deviation: 12 }, { weight: 35, mean: 93, deviation: 14 }, { weight: 15, mean: 76, deviation: 14 }],
    poor: [{ weight: 0, mean: 110, deviation: 12 }, { weight: 25, mean: 100, deviation: 14 }, { weight: 75, mean: 80, deviation: 16 }]
  };

  static sample(band: Exclude<BbTimingBand, "miss">, offCenter: number, pitchSpeed: number, power: number, random: BbSeededRandom): number {
    const lift = BbBatterAbilityModel.topWeight(power);
    const parts = BbExitSpeedModel.MIX[band].map((part, index) => index < BbExitSpeedModel.TOP_PARTS ? { ...part, weight: part.weight * lift } : part);
    const base = BbMixtureSampler.sample(parts, random);
    const tuned = base + BbExitSpeedModel.CENTER_BONUS * (1 - Math.min(offCenter, 1)) + BbExitSpeedModel.PITCH_SPEED_FACTOR * (pitchSpeed - 135) + BbBatterAbilityModel.exitBoost(power);
    return Math.max(40, Math.min(185, tuned));
  }
}

type BbBallFlightKind = "ground" | "line" | "fly" | "pop";

class BbBattedBallPhysics {
  static readonly REFERENCE_DEGREES = 28;
  static readonly REFERENCE_HANG = 4.8;
  static readonly LOW_ARC_POWER = 1.5;
  static readonly CARRY_SCALE = 1.15;
  static readonly GROUND_SPEED_KEEP = 1;
  static readonly GROUND_SLOWING = 2.8;
  static readonly CARRY: ReadonlyArray<readonly [exitSpeed: number, meters: number]> = [[60, 12], [90, 34], [120, 62], [130, 73], [140, 85], [150, 98], [160, 110], [170, 123], [180, 136], [190, 149]];
  static readonly ANGLE_SHARE: ReadonlyArray<readonly [degrees: number, share: number]> = [[0, 0.12], [8, 0.42], [10, 0.55], [15, 0.75], [20, 0.9], [28, 1], [35, 0.97], [40, 0.88], [45, 0.75], [50, 0.6], [60, 0.35], [70, 0.15]];

  private static lookup(table: ReadonlyArray<readonly [number, number]>, value: number): number {
    if (value <= table[0][0]) return table[0][1];
    for (let index = 0; index < table.length - 1; index++) {
      if (value <= table[index + 1][0]) {
        const ratio = (value - table[index][0]) / (table[index + 1][0] - table[index][0]);
        return table[index][1] + (table[index + 1][1] - table[index][1]) * ratio;
      }
    }
    return table[table.length - 1][1];
  }

  static kindOf(launchDegrees: number): BbBallFlightKind {
    if (launchDegrees < 8) return "ground";
    if (launchDegrees < 22) return "line";
    return launchDegrees <= 50 ? "fly" : "pop";
  }

  static carry(exitSpeed: number, launchDegrees: number): number {
    return BbBattedBallPhysics.CARRY_SCALE * BbBattedBallPhysics.lookup(BbBattedBallPhysics.CARRY, exitSpeed) * BbBattedBallPhysics.lookup(BbBattedBallPhysics.ANGLE_SHARE, Math.max(0, launchDegrees));
  }

  static hangSeconds(exitSpeed: number, launchDegrees: number): number {
    const reference = Math.sin(BbBattedBallPhysics.REFERENCE_DEGREES * Math.PI / 180);
    const share = Math.sin(Math.max(2, launchDegrees) * Math.PI / 180) / reference;
    return Math.max(0.35, BbBattedBallPhysics.REFERENCE_HANG * (exitSpeed / 150) * (share < 1 ? Math.pow(share, BbBattedBallPhysics.LOW_ARC_POWER) : share));
  }

  static heightAt(distance: number, carry: number, launchDegrees: number): number {
    if (distance >= carry) return 0;
    return distance * Math.tan(launchDegrees * Math.PI / 180) * (1 - distance / carry) + 1;
  }

  static groundSpeed(exitSpeed: number): number { return exitSpeed / 3.6 * BbBattedBallPhysics.GROUND_SPEED_KEEP; }

  static groundSecondsTo(distance: number, startSpeed: number): number | null {
    const slowing = BbBattedBallPhysics.GROUND_SLOWING, inside = startSpeed * startSpeed - 2 * slowing * distance;
    return inside < 0 ? null : (startSpeed - Math.sqrt(inside)) / slowing;
  }

  static groundStop(startSpeed: number): number { return startSpeed * startSpeed / (2 * BbBattedBallPhysics.GROUND_SLOWING); }
}

interface BbBattedBall {
  exitSpeed: number;
  launch: number;
  spray: number;
  carry: number;
  hang: number;
  flight: BbBallFlightKind;
  foul: boolean;
}

type BbSwingResultKind = "take" | "miss" | "contact";

interface BbSwingResult {
  kind: BbSwingResultKind;
  band: BbTimingBand | null;
  adjusted: number | null;
  width: number;
  ball: BbBattedBall | null;
}

interface BbBatterContext {
  roll: BbPitchRoll;
  batterHand: BbHand;
  abilities: BbBatterAbilities;
  contactOffset: number | null;
  random: BbSeededRandom;
}

interface BbBatterAction {
  readonly kind: string;
  resolve(context: BbBatterContext): BbSwingResult;
}

class BbSwingAction implements BbBatterAction {
  readonly kind = "swing";

  resolve(context: BbBatterContext): BbSwingResult {
    const roll = context.roll, random = context.random, leniency = BbBatterAbilityModel.leniency(context.abilities.contact);
    const inside = BbStrikeZoneJudge.inside(roll.arrive, context.batterHand), offCenter = BbStrikeZoneJudge.offCenter(roll.arrive);
    const width = BbTimingModel.width(offCenter, roll.speed, leniency);
    if (context.contactOffset === null) return { kind: "take", band: null, adjusted: null, width, ball: null };
    const adjusted = context.contactOffset - BbTimingModel.idealShift(inside, roll.timingNoise);
    const band = BbTimingModel.bandOf(adjusted, width, leniency);
    if (band === "miss" || !random.chance(BbContactModel.chance(band, offCenter))) return { kind: "miss", band, adjusted, width, ball: null };
    const tipped = random.chance(BbContactModel.FOUL_TIP_CHANCE[band]);
    const spray = tipped ? BbSprayModel.tippedDegrees(adjusted, context.batterHand, random) : BbSprayModel.sprayDegrees(adjusted, inside, context.batterHand, band, random);
    const launch = tipped ? random.between(-10, 30) : BbLaunchModel.launchDegrees(adjusted, roll.arrive.v, band, random);
    const exitSpeed = BbExitSpeedModel.sample(band, offCenter, roll.speed, context.abilities.power, random);
    const ball: BbBattedBall = {
      exitSpeed, launch, spray, carry: BbBattedBallPhysics.carry(exitSpeed, launch), hang: BbBattedBallPhysics.hangSeconds(exitSpeed, launch),
      flight: BbBattedBallPhysics.kindOf(launch), foul: Math.abs(spray) > BbSprayModel.FOUL_DEGREES
    };
    return { kind: "contact", band, adjusted, width, ball };
  }
}

class BbBatterActionSet {
  static readonly ALLOWED: readonly BbBatterAction[] = [new BbSwingAction()];
  static of(kind: string): BbBatterAction { return BbBatterActionSet.ALLOWED.find((action) => action.kind === kind) || BbBatterActionSet.ALLOWED[0]; }
}
