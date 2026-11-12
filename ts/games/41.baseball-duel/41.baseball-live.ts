interface BbLiveBoard {
  inning: number;
  half: 0 | 1;
  outs: number;
  balls: number;
  strikes: number;
  score: [number, number];
}

interface BbLivePitch {
  outcome: BbPitchOutcome;
  toast: string;
  pitcherHand: BbHand;
  batterHand: BbHand;
  abilities: BbBatterAbilities;
  board: BbLiveBoard;
}

class BbAiGameFeed {
  private static readonly ERROR_CHANCE = 0.05;
  private static readonly PLAIN_CALLS: Readonly<Record<BbOutcomeKind, string>> = { ball: "볼", calledStrike: "스트라이크", swingMiss: "헛스윙", foul: "파울", inPlay: "" };
  private readonly queue: BbLivePitch[] = [];
  private readonly seeds: BbSeededRandom;

  constructor(private readonly dimensions: BbFieldDimensions, private readonly batterHand: BbHand, private readonly pitcherHand: BbHand, seed: number) {
    this.seeds = new BbSeededRandom(seed);
  }

  next(): BbLivePitch {
    if (!this.queue.length) this.playGame();
    return this.queue.shift() as BbLivePitch;
  }

  private playGame(): void {
    const level = BbAiLevel.ALL.normal, batter = BbAiLevel.batterSheet(this.batterHand);
    const team: BbTeamSheet = { lineup: [batter], pitchers: [BbAiLevel.pitcherSheet(this.pitcherHand)] };
    const runner = new BbAiMatchRunner(new BbThreeInningFormat(), this.dimensions, new BbInfieldGroundBallErrorPolicy(BbAiGameFeed.ERROR_CHANCE), [team, team], [level, level], [level, level]);
    runner.play(new BbSeededRandom(this.seeds.seed()), (state, outcome, note) => {
      const called = outcome.script ? BbPlayCodes.LABELS[outcome.script.result] : BbAiGameFeed.PLAIN_CALLS[outcome.kind];
      this.queue.push({
        outcome, toast: note.toast || called, pitcherHand: this.pitcherHand, batterHand: this.batterHand, abilities: batter.abilities,
        board: { inning: state.inning, half: state.half, outs: state.outs, balls: state.balls, strikes: state.strikes, score: [state.score[0], state.score[1]] }
      });
    });
  }
}

class BbCatcherReceivePose extends BbActionPose {
  readonly duration = Infinity;
  readonly keyTime: number;

  constructor(private readonly metrics: BbBodyMetrics, private readonly from: BbVec, private readonly to: BbVec, shiftSeconds: number) {
    super();
    this.keyTime = shiftSeconds;
  }

  frameAt(seconds: number): BbPoseFrame {
    const ratio = BbCurve.smooth(BbCurve.span(seconds, 0, this.keyTime));
    return new BbCatcherCrouchPose(this.metrics, this.from.lerp(this.to, ratio)).frameAt(seconds);
  }
}

class BbLiveCycleDrill extends BbDrill {
  private static readonly ROLE_OF: Readonly<Record<BbPosition, BbRoleId>> = { P: "pitcher", C: "catcher", "1B": "first", "2B": "second", SS: "short", "3B": "third", LF: "left", CF: "center", RF: "right" };
  private static readonly DROP = new BbVec(0, -0.12, 0);
  private static readonly BREAK_SCALE = 1.2;
  private static readonly PITCH_SPIN = 30;
  private static readonly LOAD_LEAD = 0.75;
  private static readonly MISS_GAP = 0.14;
  private static readonly SWING_SLIP_LIMIT = 0.18;
  private static readonly RECEIVE_SHIFT = 0.3;
  private static readonly GLOVE_LOW = new BbVec(-0.45, 0.12, 0);
  private static readonly GLOVE_HIGH = new BbVec(0.5, 1, 0);
  private static readonly TAIL_AFTER_CATCH = 1.1;
  private static readonly TAIL_AFTER_PLAY = 1.4;
  private static readonly TAIL_AFTER_FOUL = 0.8;
  private static readonly LONGEST_FOUL = 3;
  private static readonly FIELDER_REACTION = 0.25;
  private static readonly FIELDER_SETTLE = 0.4;
  private static readonly WALL_GAP = 0.6;
  private static readonly FOUL_ROLL_SECONDS = 1.2;
  private static readonly FOUL_ROLL_METERS = 14;

  readonly title: string;
  readonly duration: number;
  private plateAt = 0;

  constructor(private readonly live: BbLivePitch) {
    super();
    const outcome = live.outcome, kind = BbPitchCatalog.of(outcome.roll.pitch), plateAt = BbDrill.WINDUP_AT + BbPitchTuning.WINDUP_SECONDS + outcome.roll.flightSeconds;
    this.title = kind.label + " " + Math.round(outcome.roll.speed) + "km/h";
    this.duration = plateAt + BbLiveCycleDrill.tailSeconds(outcome);
  }

  get arriveAt(): number { return this.plateAt; }
  get batted(): boolean { return this.live.outcome.swing.kind === "contact"; }

  private static tailSeconds(outcome: BbPitchOutcome): number {
    const ball = outcome.swing.ball, script = outcome.script;
    if (!ball || !script) return BbLiveCycleDrill.TAIL_AFTER_CATCH;
    const handled = BbLiveCycleDrill.handledEvent(script);
    if (handled) return handled.t + BbLiveCycleDrill.TAIL_AFTER_PLAY;
    if (ball.foul) return Math.min(ball.hang, BbLiveCycleDrill.LONGEST_FOUL) + BbLiveCycleDrill.TAIL_AFTER_FOUL;
    return ball.hang + BbLiveCycleDrill.TAIL_AFTER_PLAY;
  }

  private static handledEvent(script: BbPlayScript): BbPlayEvent | null {
    return script.events.find((event) => (event.kind === "catch" || event.kind === "field") && !!event.spot && !!event.who) || null;
  }

  protected compose(): void {
    const outcome = this.live.outcome, roll = outcome.roll, swing = outcome.swing;
    const pitchPose = new BbPitchPose(this.metrics), releaseAt = BbDrill.WINDUP_AT + pitchPose.keyTime;
    this.hold("pitcher", "throw", 0);
    this.pose("pitcher", pitchPose, BbDrill.WINDUP_AT, releaseAt, "투구");
    const from = this.handWorld("pitcher", "throw", releaseAt), plate = BbStrikeZoneBox.pointAt(roll.arrive.u, roll.arrive.v);
    const flight = new BbPitchFlight(from, plate, roll.flightSeconds, this.breakOf(roll).plus(BbLiveCycleDrill.DROP));
    this.fly(flight, releaseAt, BbLiveCycleDrill.PITCH_SPIN);
    this.plateAt = releaseAt + roll.flightSeconds;
    this.pose("batter", new BbBatLoadPose(this.metrics), this.plateAt - BbLiveCycleDrill.LOAD_LEAD, null, "로드");
    if (swing.kind === "contact" && swing.ball && outcome.script) {
      const swingEndsAt = this.swingAt(plate, this.plateAt, swing.band === "perfect" || swing.band === "good" ? "full" : "weak");
      this.battedBall(swing.ball, outcome.script, plate, swingEndsAt);
      return;
    }
    if (swing.kind === "miss") {
      const slip = BbCurve.clamp(swing.adjusted || 0, -BbLiveCycleDrill.SWING_SLIP_LIMIT, BbLiveCycleDrill.SWING_SLIP_LIMIT);
      this.swingAt(plate.plus(new BbVec(0, roll.arrive.v < 0 ? BbLiveCycleDrill.MISS_GAP : -BbLiveCycleDrill.MISS_GAP, 0)), this.plateAt + slip, "full");
    }
    this.receive(flight, releaseAt);
  }

  private breakOf(roll: BbPitchRoll): BbVec {
    const kind = BbPitchCatalog.of(roll.pitch);
    if (!kind.isBreaking) return new BbVec(0, 0, 0);
    const angle = kind.axisRadians(this.live.pitcherHand);
    return BbStrikeZoneBox.pointAt(-Math.cos(angle), -Math.sin(angle)).minus(BbStrikeZoneBox.pointAt(0, 0)).times(BbLiveCycleDrill.BREAK_SCALE);
  }

  private swingAt(point: BbVec, at: number, style: BbSwingStyle): number {
    const local = this.canonical("batter", this.script.placementOf("batter", at).toLocal(point));
    const pose = new BbBatSwingPose(this.metrics, local, style);
    return this.synced("batter", pose, at, "스윙") + pose.duration;
  }

  private receive(flight: BbPitchFlight, releaseAt: number): void {
    const catcher = this.script.placementOf("catcher", 0), rest = BbDrill.CATCHER_TARGET, glovePlane = catcher.toWorld(rest).z;
    const ratio = (glovePlane - flight.from.z) / (flight.to.z - flight.from.z), catchAt = releaseAt + flight.duration * ratio;
    const reach = catcher.toLocal(flight.pointAt(flight.duration * ratio)), low = BbLiveCycleDrill.GLOVE_LOW, high = BbLiveCycleDrill.GLOVE_HIGH;
    const target = new BbVec(BbCurve.clamp(reach.x, low.x, high.x), BbCurve.clamp(reach.y, low.y, high.y), rest.z);
    this.synced("catcher", new BbCatcherReceivePose(this.metrics, rest, target, BbLiveCycleDrill.RECEIVE_SHIFT), catchAt - 0.1, "포수 포구");
    this.hold("catcher", "glove", catchAt);
  }

  private battedBall(ball: BbBattedBall, script: BbPlayScript, contactPoint: BbVec, swingEndsAt: number): void {
    const contactAt = this.plateAt, handled = BbLiveCycleDrill.handledEvent(script);
    const takenAt = handled ? contactAt + handled.t : 0, taker = handled ? BbLiveCycleDrill.ROLE_OF[handled.who as BbPosition] : null;
    const glove = handled && taker ? this.fielderTakes(taker, handled, contactAt, contactPoint) : null;
    const landing = BbFieldSpace.polar(ball.carry, ball.spray, BbThrowTrajectory.BALL_RADIUS);
    if (taker !== "pitcher") this.pitcherWatches(glove || landing, contactAt);
    if (ball.flight === "ground") {
      const stop = glove || BbFieldSpace.polar(Math.max(ball.carry, BbLiveCycleDrill.FOUL_ROLL_METERS), ball.spray, BbThrowTrajectory.BALL_RADIUS);
      this.fly(new BbGroundRoll(contactPoint, stop, glove ? takenAt - contactAt : BbLiveCycleDrill.FOUL_ROLL_SECONDS, 5, 0.4), contactAt, 26);
    } else if (handled && handled.kind === "catch" && glove) {
      this.fly(new BbBattedFlight(contactPoint, glove, takenAt - contactAt, this.apexOf(ball, 1)), contactAt, 18);
    } else {
      const fence = BbBallparkRegistry.MAIN.dimensions.fenceDistance(ball.spray), overWall = script.result === "HOME_RUN" && !handled;
      const share = ball.foul || overWall || ball.carry < fence ? 1 : (fence - BbLiveCycleDrill.WALL_GAP) / ball.carry;
      const airSeconds = ball.hang * share, reach = ball.carry * share;
      const down = share < 1 ? BbFieldSpace.polar(reach, ball.spray, BbBattedBallPhysics.heightAt(reach, ball.carry, ball.launch)) : landing;
      this.fly(new BbBattedFlight(contactPoint, down, airSeconds, this.apexOf(ball, share)), contactAt, 18);
      if (glove && takenAt - contactAt - airSeconds > 0.05) this.fly(new BbGroundRoll(down, glove, takenAt - contactAt - airSeconds, 3, 0.8), contactAt + airSeconds, 18);
    }
    if (!ball.foul) this.move("batter", BbFieldGeometry.FIRST.plus(new BbVec(0.25, 0, 0.1)), swingEndsAt - 0.15, contactAt + BbRunnerMotion.batterSeconds(1, this.live.abilities));
  }

  private apexOf(ball: BbBattedBall, share: number): number {
    return ball.carry * Math.tan(Math.max(0, ball.launch) * Math.PI / 180) / 4 * share * share;
  }

  private fielderTakes(role: BbRoleId, event: BbPlayEvent, contactAt: number, contactPoint: BbVec): BbVec {
    const spot = event.spot as [number, number], standing = BbFieldSpace.toWorld(spot[0], spot[1]), at = contactAt + event.t, inAir = event.kind === "catch";
    const settledAt = Math.max(contactAt + BbLiveCycleDrill.FIELDER_REACTION + 0.05, at - BbLiveCycleDrill.FIELDER_SETTLE);
    if (this.script.placementOf(role, contactAt).position.distanceTo(standing) > 0.5) this.move(role, standing, contactAt + BbLiveCycleDrill.FIELDER_REACTION, settledAt);
    this.face(role, contactPoint.flat(), settledAt);
    const local = inAir ? BbDrill.FLY_GLOVE : BbDrill.GROUND_GLOVE, glove = this.gloveWorld(role, at, local);
    this.catchWith(role, inAir ? "fly" : "ground", local, at, inAir ? "뜬공 포구" : "타구 포구");
    return glove;
  }
}

type BbLiveView = "pitcher" | "batter";

class BbLiveDirector {
  private static readonly CUT_AFTER_CONTACT = 0.12;
  private static readonly BOOTH = BbFieldSpace.toWorld(0, -14, 10);
  private static readonly CHASE_SHARE = 0.4;
  private static readonly RISE_PER_METER = 0.12;
  private static readonly LOOK_HEIGHT_SHARE = 0.35;

  followsBall(drill: BbLiveCycleDrill, seconds: number): boolean { return drill.batted && seconds >= drill.arriveAt + BbLiveDirector.CUT_AFTER_CONTACT; }

  shot(view: BbLiveView, drill: BbLiveCycleDrill, seconds: number, ball: BbVec | null): BbCameraShot {
    if (!ball || !this.followsBall(drill, seconds)) return view === "batter" ? BbBroadcastShots.batter() : BbBroadcastShots.pitcher();
    const flat = ball.flat(), booth = BbLiveDirector.BOOTH, position = booth.lerp(flat, BbLiveDirector.CHASE_SHARE);
    return { position: position.withY(booth.y + flat.length() * BbLiveDirector.RISE_PER_METER), look: flat.withY(ball.y * BbLiveDirector.LOOK_HEIGHT_SHARE), fieldOfView: 44 };
  }
}
