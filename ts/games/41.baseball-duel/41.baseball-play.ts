type BbPlayCode = "SINGLE" | "DOUBLE" | "TRIPLE" | "HOME_RUN" | "GROUND_OUT" | "FLY_OUT" | "LINE_OUT" | "POP_OUT" | "DOUBLE_PLAY" | "SAC_FLY" | "FIELDERS_CHOICE" | "FOUL_CAUGHT" | "FOUL" | "INFIELD_FLY" | "ERROR";
type BbPlayEventKind = "ballFlight" | "field" | "catch" | "throw" | "runnerMove" | "callOut" | "callSafe" | "score" | "tagUp" | "homeRun" | "error" | "infieldFly";

interface BbPlayEvent {
  t: number;
  kind: BbPlayEventKind;
  who?: string;
  base?: number;
  from?: number;
  spot?: [number, number];
  arriveT?: number;
}

interface BbPlayScript {
  result: BbPlayCode;
  outsAdded: number;
  basesAfter: BbBases;
  scored: BbRunner[];
  batterReached: number;
  fielder: BbPosition | null;
  distance: number;
  events: BbPlayEvent[];
}

interface BbPlaySituation {
  outs: number;
  bases: BbBases;
  batter: BbRunner;
  abilities: BbBatterAbilities;
}

class BbPlayCodes {
  static readonly HITS: readonly BbPlayCode[] = ["SINGLE", "DOUBLE", "TRIPLE", "HOME_RUN"];
  static readonly TOTAL_BASES: Readonly<Partial<Record<BbPlayCode, number>>> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, HOME_RUN: 4 };
  static readonly LABELS: Readonly<Record<BbPlayCode, string>> = {
    SINGLE: "안타!", DOUBLE: "2루타!", TRIPLE: "3루타!", HOME_RUN: "홈런!", GROUND_OUT: "땅볼 아웃", FLY_OUT: "플라이 아웃", LINE_OUT: "직선타 아웃", POP_OUT: "내야 뜬공 아웃",
    DOUBLE_PLAY: "병살타", SAC_FLY: "희생플라이", FIELDERS_CHOICE: "야수선택", FOUL_CAUGHT: "파울 플라이 아웃", FOUL: "파울", INFIELD_FLY: "인필드 플라이!", ERROR: "실책"
  };
  static isHit(code: BbPlayCode): boolean { return BbPlayCodes.HITS.indexOf(code) >= 0; }
  static endsPlateAppearance(code: BbPlayCode): boolean { return code !== "FOUL"; }
}

class BbInfieldFlyRule {
  static readonly DEEPEST = 45;
  static readonly EASY_SECONDS = 0.3;

  static applies(situation: BbPlaySituation, ball: BbBattedBall, spots: Map<BbPosition, BbSpot>): boolean {
    if (situation.outs >= 2 || !situation.bases[0] || !situation.bases[1] || ball.foul) return false;
    if (ball.flight !== "fly" && ball.flight !== "pop") return false;
    if (ball.carry > BbInfieldFlyRule.DEEPEST) return false;
    const spot = BbDiamond.polar(ball.carry, ball.spray);
    return BbFielderPositions.INFIELD.some((position) => BbFielderMotion.secondsTo(position, spots.get(position) as BbSpot, spot, false) <= ball.hang - BbInfieldFlyRule.EASY_SECONDS);
  }
}

class BbPlayResolver {
  private static readonly INFIELD_REACH = 44;
  private static readonly THROUGH_METERS = 15;
  private static readonly THROUGH_DEPTH = 46;
  private static readonly THROUGH_SECONDS = 1.3;
  private static readonly THROUGH_SIDE_DEGREES = 15;
  private static readonly THROUGH_CHASE_SPEED = 9;
  private static readonly THROUGH_START = 0.45;
  private static readonly LATE_THROW_WITHIN = 0.7;
  constructor(private readonly dimensions: BbFieldDimensions, private readonly fielding: BbFieldingController, private readonly running: BbBaserunningController, private readonly errors: BbErrorPolicy, private readonly crew: BbDefenseCrew = BbDefenseCrew.STANDARD) {}

  private throwsBy(position: string): BbThrowDecision { return this.crew.arm(position); }

  resolve(situation: BbPlaySituation, ball: BbBattedBall, random: BbSeededRandom): BbPlayScript {
    const spots = BbFielderPositions.standard(situation.bases, situation.outs);
    if (ball.foul) return this.foul(situation, ball, spots);
    if (ball.flight === "ground") return this.grounder(situation, ball, spots, random);
    const fence = this.dimensions.fenceDistance(ball.spray);
    if (ball.carry >= fence) {
      if (BbBattedBallPhysics.heightAt(fence, ball.carry, ball.launch) >= this.dimensions.wallHeight) return this.homeRun(situation, ball);
      return this.hit(situation, ball, this.fielding.retrieve(ball, spots, fence, true));
    }
    if (BbInfieldFlyRule.applies(situation, ball, spots)) return this.infieldFly(situation, ball, spots);
    const caught = this.fielding.catchInAir(ball, spots, BbFielderPositions.ALL);
    if (caught) return this.flyOut(situation, ball, caught);
    return this.dropped(situation, ball, this.fielding.retrieve(ball, spots, fence, false), spots, random);
  }

  private dropped(situation: BbPlaySituation, ball: BbBattedBall, retrieve: BbRetrieve, spots: Map<BbPosition, BbSpot>, random: BbSeededRandom): BbPlayScript {
    const by = retrieve.by as BbPosition;
    if (BbFielderPositions.isOutfield(by) || BbDiamond.fromHome(retrieve.spot) > BbPlayResolver.INFIELD_REACH) return this.hit(situation, ball, retrieve);
    return this.infieldPlay(situation, ball, { by, at: retrieve.at, spot: retrieve.spot, moved: BbDiamond.distance(spots.get(by) as BbSpot, retrieve.spot) }, spots, random);
  }

  private throughBall(ball: BbBattedBall, pick: BbGroundPick, spots: Map<BbPosition, BbSpot>): BbRetrieve {
    const side = BbPlayResolver.THROUGH_SIDE_DEGREES, by: BbPosition = ball.spray < -side ? "LF" : ball.spray > side ? "RF" : "CF";
    const spot = BbDiamond.polar(Math.max(BbDiamond.fromHome(pick.spot) + BbPlayResolver.THROUGH_METERS, BbPlayResolver.THROUGH_DEPTH), ball.spray);
    const chase = BbPlayResolver.THROUGH_START + BbDiamond.distance(spots.get(by) as BbSpot, spot) / BbPlayResolver.THROUGH_CHASE_SPEED;
    return { at: Math.max(pick.at + BbPlayResolver.THROUGH_SECONDS, chase), spot, holdSeconds: 0, by };
  }

  private blank(situation: BbPlaySituation, result: BbPlayCode, ball: BbBattedBall): BbPlayScript {
    const spot = BbDiamond.polar(ball.carry, ball.spray);
    return {
      result, outsAdded: 0, basesAfter: [situation.bases[0], situation.bases[1], situation.bases[2]], scored: [], batterReached: 0, fielder: null, distance: ball.carry,
      events: [{ t: 0, kind: "ballFlight", spot: [spot.x, spot.z], arriveT: ball.hang }]
    };
  }

  private inFoulGround(spot: BbSpot): boolean {
    const width = this.dimensions.foulTerritoryWidth, along = (Math.abs(spot.x) + spot.z) * Math.SQRT1_2;
    if (along < 0) return BbDiamond.fromHome(spot) <= width;
    return along <= this.dimensions.fenceDistance(45) && Math.abs(Math.abs(spot.x) - spot.z) * Math.SQRT1_2 <= width;
  }

  private foul(situation: BbPlaySituation, ball: BbBattedBall, spots: Map<BbPosition, BbSpot>): BbPlayScript {
    const script = this.blank(situation, "FOUL", ball), spot = BbDiamond.polar(ball.carry, ball.spray);
    const high = ball.flight === "fly" || ball.flight === "pop";
    const caught = high && this.inFoulGround(spot) ? this.fielding.catchInAir(ball, spots, BbFielderPositions.ALL) : null;
    if (!caught) return script;
    script.result = "FOUL_CAUGHT";
    script.outsAdded = 1;
    script.fielder = caught.by;
    script.events.push({ t: caught.at, kind: "catch", who: caught.by, spot: [spot.x, spot.z] }, { t: caught.at, kind: "callOut", who: situation.batter.id, base: 0 });
    return script;
  }

  private homeRun(situation: BbPlaySituation, ball: BbBattedBall): BbPlayScript {
    const script = this.blank(situation, "HOME_RUN", ball);
    for (let base = 3; base >= 1; base--) { const runner = situation.bases[base - 1]; if (runner) script.scored.push(runner); }
    script.scored.push(situation.batter);
    script.basesAfter = [null, null, null];
    script.batterReached = 4;
    script.events.push({ t: ball.hang, kind: "homeRun", who: situation.batter.id });
    return script;
  }

  private infieldFly(situation: BbPlaySituation, ball: BbBattedBall, spots: Map<BbPosition, BbSpot>): BbPlayScript {
    const script = this.blank(situation, "INFIELD_FLY", ball), caught = this.fielding.catchInAir(ball, spots, BbFielderPositions.INFIELD);
    script.outsAdded = 1;
    script.fielder = caught ? caught.by : null;
    script.events.push({ t: 0.4, kind: "infieldFly", who: situation.batter.id });
    if (caught) script.events.push({ t: caught.at, kind: "catch", who: caught.by, spot: [caught.spot.x, caught.spot.z] });
    return script;
  }

  private flyOut(situation: BbPlaySituation, ball: BbBattedBall, caught: BbCatch): BbPlayScript {
    const script = this.blank(situation, ball.flight === "line" ? "LINE_OUT" : ball.flight === "pop" ? "POP_OUT" : "FLY_OUT", ball);
    script.outsAdded = 1;
    script.fielder = caught.by;
    script.events.push({ t: caught.at, kind: "catch", who: caught.by, spot: [caught.spot.x, caught.spot.z] }, { t: caught.at, kind: "callOut", who: situation.batter.id, base: 0 });
    if (situation.outs + 1 >= 3) return script;
    const moves = this.running.onFlyOut(situation.bases, situation.abilities, caught.at, caught.spot, this.throwsBy(caught.by));
    this.applyMoves(script, moves, caught.at);
    if (script.scored.length && BbFielderPositions.isOutfield(caught.by)) script.result = "SAC_FLY";
    return script;
  }

  private hit(situation: BbPlaySituation, ball: BbBattedBall, retrieve: BbRetrieve): BbPlayScript {
    const script = this.blank(situation, "SINGLE", ball);
    if (situation.outs >= 2) retrieve = { ...retrieve, holdSeconds: 0 };
    const moves = this.running.onHit(situation.bases, situation.batter, situation.abilities, retrieve, this.throwsBy(retrieve.by));
    script.basesAfter = [null, null, null];
    script.fielder = retrieve.by as BbPosition;
    script.events.push({ t: retrieve.at, kind: "field", who: retrieve.by, spot: [retrieve.spot.x, retrieve.spot.z] });
    this.applyMoves(script, moves, 0);
    const reached = (moves.find((move) => move.from === 0) as BbAdvance).to;
    script.batterReached = reached;
    script.result = reached >= 4 ? "HOME_RUN" : reached === 3 ? "TRIPLE" : reached === 2 ? "DOUBLE" : "SINGLE";
    script.events.push({ t: retrieve.at, kind: "throw", who: retrieve.by, base: Math.min(4, reached + 1), arriveT: retrieve.at + this.throwsBy(retrieve.by).secondsTo(retrieve.spot, Math.min(4, reached + 1)) });
    return script;
  }

  private applyMoves(script: BbPlayScript, moves: readonly BbAdvance[], startAt: number): void {
    const after: BbBases = [null, null, null];
    for (const move of moves) {
      if (move.to !== move.from) script.events.push({ t: startAt, kind: move.from > 0 && startAt > 0 ? "tagUp" : "runnerMove", who: move.runner.id, from: move.from, base: move.to, arriveT: move.arriveAt });
      if (move.out) { script.events.push({ t: move.arriveAt, kind: "callOut", who: move.runner.id, base: move.to }); continue; }
      if (move.to >= 4) { script.scored.push(move.runner); script.events.push({ t: move.arriveAt, kind: "score", who: move.runner.id }); }
      else if (move.to >= 1) after[move.to - 1] = move.runner;
    }
    script.basesAfter = after;
  }

  private grounder(situation: BbPlaySituation, ball: BbBattedBall, spots: Map<BbPosition, BbSpot>, random: BbSeededRandom): BbPlayScript {
    const pick = this.fielding.pickGrounder(ball, spots, BbFielderPositions.INFIELD, 3, BbPlayResolver.INFIELD_REACH);
    if (!pick) return this.dropped(situation, ball, this.fielding.retrieve(ball, spots, this.dimensions.fenceDistance(ball.spray), false), spots, random);
    return this.infieldPlay(situation, ball, pick, spots, random);
  }

  private infieldPlay(situation: BbPlaySituation, ball: BbBattedBall, pick: BbGroundPick, spots: Map<BbPosition, BbSpot>, random: BbSeededRandom): BbPlayScript {
    const script = this.blank(situation, "GROUND_OUT", ball), bases = situation.bases, abilities = situation.abilities;
    script.fielder = pick.by;
    script.distance = BbDiamond.fromHome(pick.spot);
    script.events = [{ t: 0, kind: "ballFlight", spot: [pick.spot.x, pick.spot.z], arriveT: pick.at }, { t: pick.at, kind: "field", who: pick.by, spot: [pick.spot.x, pick.spot.z] }];
    const shifted = this.running.onForcedShift(bases, situation.batter, abilities);
    if (this.errors.fumbles(random)) {
      const through = this.throughBall(ball, pick, spots), moves = this.running.onHit(bases, situation.batter, abilities, through, this.throwsBy(through.by));
      const reached = (moves.find((move) => move.from === 0) as BbAdvance).to, next = Math.min(4, reached + 1);
      script.result = "ERROR";
      script.batterReached = reached;
      script.events.push({ t: pick.at, kind: "error", who: pick.by }, { t: through.at, kind: "field", who: through.by, spot: [through.spot.x, through.spot.z] });
      this.applyMoves(script, moves, 0);
      script.events.push({ t: through.at, kind: "throw", who: through.by, base: next, arriveT: through.at + this.throwsBy(through.by).secondsTo(through.spot, next) });
      return script;
    }
    const batterAt = BbRunnerMotion.batterSeconds(1, abilities), runnerAt = (runner: BbRunner) => BbRunnerMotion.fromBaseSeconds(1, BbRunnerMotion.legsOf(runner, abilities));
    const loaded = !!(bases[0] && bases[1] && bases[2]), leadForce = loaded ? 4 : bases[0] && bases[1] ? 3 : bases[0] ? 2 : 0;
    const doubleBase = loaded ? 4 : bases[0] ? 2 : 0;
    const out = (who: BbRunner, base: number, at: number) => {
      const move = shifted.find((entry) => entry.runner === who) as BbAdvance;
      move.out = true; move.to = base; move.arriveAt = at;
      script.outsAdded++;
    };
    const runnerInto = (base: number) => (shifted.find((entry) => entry.to === base && entry.from === base - 1) as BbAdvance).runner;
    const readyAt = pick.at + BbThrowDecision.rangeDelay(pick.moved), arm = this.throwsBy(pick.by);
    const firstAt = readyAt + arm.secondsTo(pick.spot, 1);
    if (situation.outs < 2 && doubleBase) {
      const leadAt = readyAt + arm.secondsTo(pick.spot, doubleBase), lead = runnerInto(doubleBase);
      if (leadAt < runnerAt(lead)) {
        out(lead, doubleBase, leadAt);
        script.events.push({ t: pick.at, kind: "throw", who: pick.by, base: doubleBase, arriveT: leadAt });
        const pivot: BbPosition = doubleBase === 4 ? "C" : BbCoverageTable.secondBaseCover(ball.spray);
        const turnAt = leadAt + this.throwsBy(pivot).relaySeconds(doubleBase, 1);
        script.events.push({ t: leadAt, kind: "throw", who: pivot, base: 1, arriveT: turnAt });
        if (turnAt < batterAt) { out(situation.batter, 1, turnAt); script.result = "DOUBLE_PLAY"; }
        else { script.result = "FIELDERS_CHOICE"; script.batterReached = 1; }
        return this.closeInfieldPlay(script, situation, shifted);
      }
    }
    if (firstAt < batterAt) {
      out(situation.batter, 1, firstAt);
      script.events.push({ t: pick.at, kind: "throw", who: pick.by, base: 1, arriveT: firstAt });
      const second = shifted.find((entry) => entry.from === 2 && !entry.forced);
      if (second && ball.spray > 0 && !bases[2]) { second.to = 3; second.arriveAt = runnerAt(second.runner); }
      return this.closeInfieldPlay(script, situation, shifted);
    }
    if (leadForce) {
      const leadAt = readyAt + arm.secondsTo(pick.spot, leadForce), lead = runnerInto(leadForce);
      if (leadAt < runnerAt(lead)) {
        out(lead, leadForce, leadAt);
        script.events.push({ t: pick.at, kind: "throw", who: pick.by, base: leadForce, arriveT: leadAt });
        script.result = "FIELDERS_CHOICE";
        script.batterReached = 1;
        return this.closeInfieldPlay(script, situation, shifted);
      }
    }
    script.result = "SINGLE";
    script.batterReached = 1;
    if (firstAt - batterAt <= BbPlayResolver.LATE_THROW_WITHIN) script.events.push({ t: pick.at, kind: "throw", who: pick.by, base: 1, arriveT: firstAt });
    if (situation.outs >= 2) shifted.forEach((move) => { if (!move.forced && move.from >= 1) { move.to = move.from + 1; move.arriveAt = runnerAt(move.runner); } });
    return this.closeInfieldPlay(script, situation, shifted);
  }

  private closeInfieldPlay(script: BbPlayScript, situation: BbPlaySituation, moves: readonly BbAdvance[]): BbPlayScript {
    const inningOver = situation.outs + script.outsAdded >= 3;
    this.applyMoves(script, moves, 0);
    if (inningOver && script.result !== "SINGLE") script.scored = [];
    return script;
  }
}
