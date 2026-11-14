interface BbRunner {
  id: string;
  earned: boolean;
  speed?: number;
}

interface BbLegs {
  speed: number;
}

type BbBases = [BbRunner | null, BbRunner | null, BbRunner | null];

interface BbSpot {
  x: number;
  z: number;
}

class BbDiamond {
  static readonly GAP = 27.43;
  static readonly HOME: BbSpot = { x: 0, z: 0 };
  private static readonly BASES: readonly BbSpot[] = [{ x: 0, z: 0 }, { x: 19.4, z: 19.4 }, { x: 0, z: 38.8 }, { x: -19.4, z: 19.4 }, { x: 0, z: 0 }];

  static base(index: number): BbSpot { return BbDiamond.BASES[index]; }
  static distance(from: BbSpot, to: BbSpot): number { return Math.hypot(to.x - from.x, to.z - from.z); }
  static fromHome(spot: BbSpot): number { return Math.hypot(spot.x, spot.z); }

  static polar(distance: number, sprayDegrees: number): BbSpot {
    const radians = sprayDegrees * Math.PI / 180;
    return { x: distance * Math.sin(radians), z: distance * Math.cos(radians) };
  }

  static sprayOf(spot: BbSpot): number { return Math.atan2(spot.x, spot.z) * 180 / Math.PI; }
}

class BbRunnerMotion {
  static readonly ACCELERATION = 6;
  static readonly LEAD = 3;
  static readonly REACTION = 0.1;

  static runSeconds(distance: number, topSpeed: number): number {
    const rampDistance = topSpeed * topSpeed / (2 * BbRunnerMotion.ACCELERATION);
    if (distance <= rampDistance) return Math.sqrt(2 * Math.max(0, distance) / BbRunnerMotion.ACCELERATION);
    return topSpeed / BbRunnerMotion.ACCELERATION + (distance - rampDistance) / topSpeed;
  }

  static legsOf(runner: BbRunner, fallback: BbLegs): BbLegs { return runner.speed === undefined ? fallback : { speed: runner.speed }; }

  static fromBaseSeconds(basesAhead: number, abilities: BbLegs): number {
    return BbRunnerMotion.REACTION + BbRunnerMotion.runSeconds(BbDiamond.GAP * basesAhead - BbRunnerMotion.LEAD, BbBatterAbilityModel.topSpeed(abilities.speed));
  }

  static taggingSeconds(abilities: BbLegs): number {
    return BbRunnerMotion.REACTION + BbDiamond.GAP / BbBatterAbilityModel.topSpeed(abilities.speed);
  }

  static batterSeconds(base: number, abilities: BbLegs): number {
    return BbBatterAbilityModel.firstBaseSeconds(abilities.speed) + (base - 1) * BbDiamond.GAP / BbBatterAbilityModel.topSpeed(abilities.speed);
  }
}

interface BbAdvance {
  runner: BbRunner;
  from: number;
  to: number;
  arriveAt: number;
  forced: boolean;
  out: boolean;
}

interface BbRetrieve {
  at: number;
  spot: BbSpot;
  holdSeconds: number;
  by: string;
}

interface BbThrowClock {
  secondsTo(from: BbSpot, base: number): number;
}

class BbTagUpRule {
  static readonly LEAST_DEPTH: readonly number[] = [0, 100, 85, 55];
  static readonly TAG_SECONDS = 0.25;

  static tries(fromBase: number, catchDepth: number): boolean { return catchDepth >= BbTagUpRule.LEAST_DEPTH[fromBase]; }
}

interface BbBaserunningController {
  onHit(bases: BbBases, batter: BbRunner, abilities: BbBatterAbilities, retrieve: BbRetrieve, throws: BbThrowClock): BbAdvance[];
  onFlyOut(bases: BbBases, abilities: BbBatterAbilities, catchAt: number, spot: BbSpot, throws: BbThrowClock): BbAdvance[];
  onForcedShift(bases: BbBases, batter: BbRunner | null, abilities: BbBatterAbilities): BbAdvance[];
}

class BbAutoBaseRunning implements BbBaserunningController {
  static readonly RIGHT_FIELD_DEPTH = 46;
  static readonly FIRST_TO_THIRD_BONUS = 0.3;

  onHit(bases: BbBases, batter: BbRunner, abilities: BbBatterAbilities, retrieve: BbRetrieve, throws: BbThrowClock): BbAdvance[] {
    const moves: BbAdvance[] = [];
    const toRightField = retrieve.spot.x > 0 && BbDiamond.fromHome(retrieve.spot) >= BbAutoBaseRunning.RIGHT_FIELD_DEPTH;
    let ceiling = 4;
    for (let from = 3; from >= 0; from--) {
      const runner = from === 0 ? batter : bases[from - 1];
      if (!runner) continue;
      const legs = from === 0 ? abilities : BbRunnerMotion.legsOf(runner, abilities), margin = BbBatterAbilityModel.advanceMargin(legs.speed);
      const forcedBase = this.isForced(bases, from) ? from + 1 : from;
      let to = from, arriveAt = 0;
      for (let next = from + 1; next <= Math.min(4, ceiling); next++) {
        const runnerAt = from === 0 ? BbRunnerMotion.batterSeconds(next, legs) : retrieve.holdSeconds + BbRunnerMotion.fromBaseSeconds(next - from, legs);
        const ballAt = retrieve.at + throws.secondsTo(retrieve.spot, next);
        const needed = toRightField && from === 1 && next === 3 ? margin - BbAutoBaseRunning.FIRST_TO_THIRD_BONUS : margin;
        if (next > forcedBase && ballAt - runnerAt < needed) break;
        to = next; arriveAt = runnerAt;
      }
      moves.push({ runner, from, to, arriveAt, forced: forcedBase > from, out: false });
      ceiling = to >= 4 ? 4 : to - 1;
    }
    return moves;
  }

  onFlyOut(bases: BbBases, abilities: BbBatterAbilities, catchAt: number, spot: BbSpot, throws: BbThrowClock): BbAdvance[] {
    const moves: BbAdvance[] = [], depth = BbDiamond.fromHome(spot);
    let ceiling = 4;
    for (let from = 3; from >= 1; from--) {
      const runner = bases[from - 1];
      if (!runner) continue;
      const next = from + 1, runnerAt = catchAt + BbRunnerMotion.taggingSeconds(BbRunnerMotion.legsOf(runner, abilities)), ballAt = catchAt + throws.secondsTo(spot, next) + BbTagUpRule.TAG_SECONDS;
      const goes = next <= ceiling && BbTagUpRule.tries(from, depth) && ballAt > runnerAt;
      moves.push({ runner, from, to: goes ? next : from, arriveAt: goes ? runnerAt : catchAt, forced: false, out: false });
      ceiling = goes && next >= 4 ? 4 : (goes ? next : from) - 1;
    }
    return moves;
  }

  onForcedShift(bases: BbBases, batter: BbRunner | null, abilities: BbBatterAbilities): BbAdvance[] {
    const moves: BbAdvance[] = [];
    for (let from = 3; from >= 1; from--) {
      const runner = bases[from - 1];
      if (!runner) continue;
      const forced = this.isForced(bases, from);
      moves.push({ runner, from, to: forced ? from + 1 : from, arriveAt: forced ? BbRunnerMotion.fromBaseSeconds(1, BbRunnerMotion.legsOf(runner, abilities)) : 0, forced, out: false });
    }
    if (batter) moves.push({ runner: batter, from: 0, to: 1, arriveAt: BbRunnerMotion.batterSeconds(1, abilities), forced: true, out: false });
    return moves;
  }

  private isForced(bases: BbBases, from: number): boolean {
    for (let behind = from - 1; behind >= 1; behind--) if (!bases[behind - 1]) return false;
    return true;
  }
}
