type BbPosition = "P" | "C" | "1B" | "2B" | "SS" | "3B" | "LF" | "CF" | "RF";

class BbFielderPositions {
  static readonly ALL: readonly BbPosition[] = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"];
  static readonly INFIELD: readonly BbPosition[] = ["P", "C", "1B", "2B", "SS", "3B"];
  static readonly OUTFIELD: readonly BbPosition[] = ["LF", "CF", "RF"];
  private static readonly BASE: Readonly<Record<BbPosition, BbSpot>> = {
    P: { x: 0, z: 18.44 }, C: { x: 0, z: -1.6 }, "1B": { x: 17.5, z: 21 }, "2B": { x: 10, z: 31 }, SS: { x: -10, z: 31 }, "3B": { x: -17.5, z: 21 },
    LF: { x: -38, z: 75 }, CF: { x: 0, z: 82 }, RF: { x: 38, z: 75 }
  };

  static standard(bases: BbBases, outs: number): Map<BbPosition, BbSpot> {
    const spots = new Map<BbPosition, BbSpot>();
    BbFielderPositions.ALL.forEach((position) => spots.set(position, { ...BbFielderPositions.BASE[position] }));
    if (bases[0] && outs < 2) {
      spots.set("2B", { x: 8.2, z: 32 });
      spots.set("SS", { x: -8.2, z: 32 });
      spots.set("1B", { x: 18.6, z: 20 });
    }
    if (outs >= 2) BbFielderPositions.OUTFIELD.forEach((position) => {
      const spot = spots.get(position) as BbSpot, depth = BbDiamond.fromHome(spot);
      spots.set(position, { x: spot.x * (depth + 5) / depth, z: spot.z * (depth + 5) / depth });
    });
    return spots;
  }

  static isOutfield(position: BbPosition): boolean { return BbFielderPositions.OUTFIELD.indexOf(position) >= 0; }
}

class BbFielderMotion {
  static readonly INFIELD_SPEED = 6.6;
  static readonly OUTFIELD_SPEED = 7.4;
  static readonly CATCHER_SPEED = 5.4;
  static readonly INFIELD_REACTION = 0.28;
  static readonly OUTFIELD_REACTION = 0.35;
  static readonly CATCHER_REACTION = 0.5;
  static readonly LINER_REACTION = 0.15;
  static readonly INFIELD_DIVE = 1.3;
  static readonly OUTFIELD_DIVE = 2;
  static readonly LINER_DIVE_BONUS = 1;

  static secondsTo(position: BbPosition, from: BbSpot, to: BbSpot, liner: boolean): number {
    const outfield = BbFielderPositions.isOutfield(position);
    const speed = position === "C" ? BbFielderMotion.CATCHER_SPEED : outfield ? BbFielderMotion.OUTFIELD_SPEED : BbFielderMotion.INFIELD_SPEED;
    const quick = liner && !outfield;
    const reaction = quick ? BbFielderMotion.LINER_REACTION : position === "C" ? BbFielderMotion.CATCHER_REACTION : outfield ? BbFielderMotion.OUTFIELD_REACTION : BbFielderMotion.INFIELD_REACTION;
    const dive = (outfield ? BbFielderMotion.OUTFIELD_DIVE : BbFielderMotion.INFIELD_DIVE) + (quick ? BbFielderMotion.LINER_DIVE_BONUS : 0);
    return reaction + Math.max(0, BbDiamond.distance(from, to) - dive) / speed;
  }
}

class BbThrowDecision implements BbThrowClock {
  static readonly INFIELD_RELEASE = 0.45;
  static readonly OUTFIELD_RELEASE = 0.6;
  static readonly INFIELD_SPEED = 33;
  static readonly OUTFIELD_SPEED = 36;
  static readonly RELAY_BEYOND = 60;
  static readonly RELAY_SECONDS = 0.5;
  static readonly OUTFIELD_DEPTH = 46;
  static readonly PIVOT_SECONDS = 1.25;

  secondsTo(from: BbSpot, base: number): number {
    const distance = BbDiamond.distance(from, BbDiamond.base(base)), deep = BbDiamond.fromHome(from) >= BbThrowDecision.OUTFIELD_DEPTH;
    const release = deep ? BbThrowDecision.OUTFIELD_RELEASE : BbThrowDecision.INFIELD_RELEASE, speed = deep ? BbThrowDecision.OUTFIELD_SPEED : BbThrowDecision.INFIELD_SPEED;
    return release + distance / speed + (distance > BbThrowDecision.RELAY_BEYOND ? BbThrowDecision.RELAY_SECONDS : 0);
  }

  relaySeconds(fromBase: number, toBase: number): number {
    return BbThrowDecision.PIVOT_SECONDS + BbDiamond.distance(BbDiamond.base(fromBase), BbDiamond.base(toBase)) / BbThrowDecision.INFIELD_SPEED;
  }
}

class BbCoverageTable {
  static secondBaseCover(sprayDegrees: number): BbPosition { return sprayDegrees < 0 ? "2B" : "SS"; }
  static relayLead(sprayDegrees: number): BbPosition { return sprayDegrees < 0 ? "SS" : "2B"; }
  static relayTrail(sprayDegrees: number): BbPosition { return sprayDegrees < 0 ? "2B" : "SS"; }
  static homeCutoff(sprayDegrees: number, firstWasOccupied: boolean): BbPosition { return sprayDegrees < -15 ? "3B" : firstWasOccupied || sprayDegrees >= -15 ? "1B" : "3B"; }
  static thirdBaseCover(sprayDegrees: number): BbPosition { return sprayDegrees < -15 ? "SS" : "3B"; }
  static firstBaseCover(fielder: BbPosition): BbPosition { return fielder === "1B" ? "P" : "1B"; }
  static firstBaseBackups(basesEmpty: boolean): BbPosition[] { return basesEmpty ? ["RF", "C"] : ["RF"]; }
  static thirdBaseBackup(): BbPosition { return "LF"; }
}

interface BbErrorPolicy {
  readonly rate: number;
  fumbles(random: BbSeededRandom): boolean;
}

class BbInfieldGroundBallErrorPolicy implements BbErrorPolicy {
  constructor(readonly rate: number) {}
  fumbles(random: BbSeededRandom): boolean { return random.chance(this.rate); }
}

class BbNoErrorPolicy implements BbErrorPolicy {
  readonly rate = 0;
  fumbles(): boolean { return false; }
}

interface BbCatch {
  by: BbPosition;
  at: number;
  spot: BbSpot;
}

interface BbGroundPick {
  by: BbPosition;
  at: number;
  spot: BbSpot;
}

interface BbFieldingController {
  catchInAir(ball: BbBattedBall, spots: Map<BbPosition, BbSpot>, among: readonly BbPosition[]): BbCatch | null;
  pickGrounder(ball: BbBattedBall, spots: Map<BbPosition, BbSpot>, among: readonly BbPosition[], fromDistance: number, toDistance: number): BbGroundPick | null;
  retrieve(ball: BbBattedBall, spots: Map<BbPosition, BbSpot>, fence: number, wallBall: boolean): BbRetrieve;
}

class BbAutoFielding implements BbFieldingController {
  private static readonly INFIELD_CALL: readonly BbPosition[] = ["SS", "2B", "3B", "1B", "P", "C"];
  private static readonly INFIELDER_HEAD_START = 0.5;
  private static readonly ROLL_SPEED = 11;
  private static readonly INFIELD_BACKPEDAL = 3;

  catchInAir(ball: BbBattedBall, spots: Map<BbPosition, BbSpot>, among: readonly BbPosition[]): BbCatch | null {
    const spot = BbDiamond.polar(ball.carry, ball.spray), liner = ball.flight === "line";
    const reach = new Map<BbPosition, number>();
    among.forEach((position) => {
      const seconds = BbFielderMotion.secondsTo(position, spots.get(position) as BbSpot, spot, liner);
      if (seconds <= ball.hang) reach.set(position, seconds);
    });
    if (!reach.size) return null;
    let outfielder: BbPosition | null = null, infielder: BbPosition | null = null;
    if (reach.has("CF")) outfielder = "CF";
    else for (const position of ["LF", "RF"] as BbPosition[]) if (reach.has(position) && (!outfielder || (reach.get(position) as number) < (reach.get(outfielder) as number))) outfielder = position;
    for (const position of BbAutoFielding.INFIELD_CALL) if (reach.has(position)) { infielder = position; break; }
    let by = outfielder || (infielder as BbPosition);
    if (outfielder && infielder && (ball.flight === "pop" || (reach.get(infielder) as number) + BbAutoFielding.INFIELDER_HEAD_START <= (reach.get(outfielder) as number))) by = infielder;
    return { by, at: ball.hang, spot };
  }

  pickGrounder(ball: BbBattedBall, spots: Map<BbPosition, BbSpot>, among: readonly BbPosition[], fromDistance: number, toDistance: number): BbGroundPick | null {
    const startSpeed = BbBattedBallPhysics.groundSpeed(ball.exitSpeed), stop = BbBattedBallPhysics.groundStop(startSpeed);
    for (let distance = fromDistance; distance <= Math.min(toDistance, stop); distance += 1) {
      const spot = BbDiamond.polar(distance, ball.spray), ballAt = BbBattedBallPhysics.groundSecondsTo(distance, startSpeed) as number;
      let best: BbPosition | null = null, bestSeconds = Infinity;
      among.forEach((position) => {
        const home = spots.get(position) as BbSpot;
        if (!BbFielderPositions.isOutfield(position) && distance > BbDiamond.fromHome(home) + BbAutoFielding.INFIELD_BACKPEDAL) return;
        const seconds = BbFielderMotion.secondsTo(position, home, spot, false);
        if (seconds <= ballAt && seconds < bestSeconds) { best = position; bestSeconds = seconds; }
      });
      if (best) return { by: best, at: ballAt, spot };
    }
    if (stop > toDistance) return null;
    const rest = BbDiamond.polar(Math.max(fromDistance, stop), ball.spray), stoppedAt = startSpeed / BbBattedBallPhysics.GROUND_SLOWING;
    let nearest = among[0], nearestSeconds = Infinity;
    among.forEach((position) => {
      const seconds = BbFielderMotion.secondsTo(position, spots.get(position) as BbSpot, rest, false);
      if (seconds < nearestSeconds) { nearest = position; nearestSeconds = seconds; }
    });
    return { by: nearest, at: Math.max(stoppedAt, nearestSeconds), spot: rest };
  }

  retrieve(ball: BbBattedBall, spots: Map<BbPosition, BbSpot>, fence: number, wallBall: boolean): BbRetrieve {
    const limit = fence - 1.5;
    if (ball.flight === "ground") {
      const pick = this.pickGrounder(ball, spots, BbFielderPositions.OUTFIELD, 30, limit);
      if (pick) return { at: pick.at, spot: pick.spot, holdSeconds: 0, by: pick.by };
    }
    const roll = wallBall ? 0 : Math.max(3, Math.min(30, ball.exitSpeed / 150 * (ball.flight === "line" ? 22 : 10)));
    const landing = Math.min(ball.carry, limit), distance = Math.min(landing + roll, limit), spot = BbDiamond.polar(distance, ball.spray);
    const ballAt = ball.hang * (landing / Math.max(ball.carry, 1)) + (distance - landing) / BbAutoFielding.ROLL_SPEED + (wallBall ? 1 : 0);
    let by: BbPosition = "CF", bySeconds = Infinity;
    BbFielderPositions.ALL.forEach((position) => {
      if (position === "C" || position === "P") return;
      const seconds = BbFielderMotion.secondsTo(position, spots.get(position) as BbSpot, spot, false);
      if (seconds < bySeconds) { by = position; bySeconds = seconds; }
    });
    return { at: Math.max(ballAt, bySeconds), spot, holdSeconds: ball.flight === "ground" || ball.flight === "line" ? 0 : Math.min(ball.hang, 1) * 0.6, by };
  }
}
