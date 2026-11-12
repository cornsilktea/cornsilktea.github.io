"use strict";
class BbAiGameFeed {
    constructor(dimensions, batterHand, pitcherHand, seed) {
        this.dimensions = dimensions;
        this.batterHand = batterHand;
        this.pitcherHand = pitcherHand;
        this.queue = [];
        this.seeds = new BbSeededRandom(seed);
    }
    next() {
        if (!this.queue.length)
            this.playGame();
        return this.queue.shift();
    }
    playGame() {
        const level = BbAiLevel.ALL.normal, batter = BbAiLevel.batterSheet(this.batterHand);
        const team = { lineup: [batter], pitchers: [BbAiLevel.pitcherSheet(this.pitcherHand)] };
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
BbAiGameFeed.ERROR_CHANCE = 0.05;
BbAiGameFeed.PLAIN_CALLS = { ball: "볼", calledStrike: "스트라이크", swingMiss: "헛스윙", foul: "파울", inPlay: "" };
class BbCatcherReceivePose extends BbActionPose {
    constructor(metrics, from, to, shiftSeconds) {
        super();
        this.metrics = metrics;
        this.from = from;
        this.to = to;
        this.duration = Infinity;
        this.keyTime = shiftSeconds;
    }
    frameAt(seconds) {
        const ratio = BbCurve.smooth(BbCurve.span(seconds, 0, this.keyTime));
        return new BbCatcherCrouchPose(this.metrics, this.from.lerp(this.to, ratio)).frameAt(seconds);
    }
}
class BbLiveCycleDrill extends BbDrill {
    constructor(live) {
        super();
        this.live = live;
        this.plateAt = 0;
        const outcome = live.outcome, kind = BbPitchCatalog.of(outcome.roll.pitch), plateAt = BbDrill.WINDUP_AT + BbPitchTuning.WINDUP_SECONDS + outcome.roll.flightSeconds;
        this.title = kind.label + " " + Math.round(outcome.roll.speed) + "km/h";
        this.duration = plateAt + BbLiveCycleDrill.tailSeconds(outcome);
    }
    get arriveAt() { return this.plateAt; }
    get batted() { return this.live.outcome.swing.kind === "contact"; }
    static tailSeconds(outcome) {
        const ball = outcome.swing.ball, script = outcome.script;
        if (!ball || !script)
            return BbLiveCycleDrill.TAIL_AFTER_CATCH;
        const handled = BbLiveCycleDrill.handledEvent(script);
        if (handled)
            return handled.t + BbLiveCycleDrill.TAIL_AFTER_PLAY;
        if (ball.foul)
            return Math.min(ball.hang, BbLiveCycleDrill.LONGEST_FOUL) + BbLiveCycleDrill.TAIL_AFTER_FOUL;
        return ball.hang + BbLiveCycleDrill.TAIL_AFTER_PLAY;
    }
    static handledEvent(script) {
        return script.events.find((event) => (event.kind === "catch" || event.kind === "field") && !!event.spot && !!event.who) || null;
    }
    compose() {
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
    breakOf(roll) {
        const kind = BbPitchCatalog.of(roll.pitch);
        if (!kind.isBreaking)
            return new BbVec(0, 0, 0);
        const angle = kind.axisRadians(this.live.pitcherHand);
        return BbStrikeZoneBox.pointAt(-Math.cos(angle), -Math.sin(angle)).minus(BbStrikeZoneBox.pointAt(0, 0)).times(BbLiveCycleDrill.BREAK_SCALE);
    }
    swingAt(point, at, style) {
        const local = this.canonical("batter", this.script.placementOf("batter", at).toLocal(point));
        const pose = new BbBatSwingPose(this.metrics, local, style);
        return this.synced("batter", pose, at, "스윙") + pose.duration;
    }
    receive(flight, releaseAt) {
        const catcher = this.script.placementOf("catcher", 0), rest = BbDrill.CATCHER_TARGET, glovePlane = catcher.toWorld(rest).z;
        const ratio = (glovePlane - flight.from.z) / (flight.to.z - flight.from.z), catchAt = releaseAt + flight.duration * ratio;
        const reach = catcher.toLocal(flight.pointAt(flight.duration * ratio)), low = BbLiveCycleDrill.GLOVE_LOW, high = BbLiveCycleDrill.GLOVE_HIGH;
        const target = new BbVec(BbCurve.clamp(reach.x, low.x, high.x), BbCurve.clamp(reach.y, low.y, high.y), rest.z);
        this.synced("catcher", new BbCatcherReceivePose(this.metrics, rest, target, BbLiveCycleDrill.RECEIVE_SHIFT), catchAt - 0.1, "포수 포구");
        this.hold("catcher", "glove", catchAt);
    }
    battedBall(ball, script, contactPoint, swingEndsAt) {
        const contactAt = this.plateAt, handled = BbLiveCycleDrill.handledEvent(script);
        const takenAt = handled ? contactAt + handled.t : 0, taker = handled ? BbLiveCycleDrill.ROLE_OF[handled.who] : null;
        const glove = handled && taker ? this.fielderTakes(taker, handled, contactAt, contactPoint) : null;
        const landing = BbFieldSpace.polar(ball.carry, ball.spray, BbThrowTrajectory.BALL_RADIUS);
        if (taker !== "pitcher")
            this.pitcherWatches(glove || landing, contactAt);
        if (ball.flight === "ground") {
            const stop = glove || BbFieldSpace.polar(Math.max(ball.carry, BbLiveCycleDrill.FOUL_ROLL_METERS), ball.spray, BbThrowTrajectory.BALL_RADIUS);
            this.fly(new BbGroundRoll(contactPoint, stop, glove ? takenAt - contactAt : BbLiveCycleDrill.FOUL_ROLL_SECONDS, 5, 0.4), contactAt, 26);
        }
        else if (handled && handled.kind === "catch" && glove) {
            this.fly(new BbBattedFlight(contactPoint, glove, takenAt - contactAt, this.apexOf(ball, 1)), contactAt, 18);
        }
        else {
            const fence = BbBallparkRegistry.MAIN.dimensions.fenceDistance(ball.spray), overWall = script.result === "HOME_RUN" && !handled;
            const share = ball.foul || overWall || ball.carry < fence ? 1 : (fence - BbLiveCycleDrill.WALL_GAP) / ball.carry;
            const airSeconds = ball.hang * share, reach = ball.carry * share;
            const down = share < 1 ? BbFieldSpace.polar(reach, ball.spray, BbBattedBallPhysics.heightAt(reach, ball.carry, ball.launch)) : landing;
            this.fly(new BbBattedFlight(contactPoint, down, airSeconds, this.apexOf(ball, share)), contactAt, 18);
            if (glove && takenAt - contactAt - airSeconds > 0.05)
                this.fly(new BbGroundRoll(down, glove, takenAt - contactAt - airSeconds, 3, 0.8), contactAt + airSeconds, 18);
        }
        if (!ball.foul)
            this.move("batter", BbFieldGeometry.FIRST.plus(new BbVec(0.25, 0, 0.1)), swingEndsAt - 0.15, contactAt + BbRunnerMotion.batterSeconds(1, this.live.abilities));
    }
    apexOf(ball, share) {
        return ball.carry * Math.tan(Math.max(0, ball.launch) * Math.PI / 180) / 4 * share * share;
    }
    fielderTakes(role, event, contactAt, contactPoint) {
        const spot = event.spot, standing = BbFieldSpace.toWorld(spot[0], spot[1]), at = contactAt + event.t, inAir = event.kind === "catch";
        const settledAt = Math.max(contactAt + BbLiveCycleDrill.FIELDER_REACTION + 0.05, at - BbLiveCycleDrill.FIELDER_SETTLE);
        if (this.script.placementOf(role, contactAt).position.distanceTo(standing) > 0.5)
            this.move(role, standing, contactAt + BbLiveCycleDrill.FIELDER_REACTION, settledAt);
        this.face(role, contactPoint.flat(), settledAt);
        const local = inAir ? BbDrill.FLY_GLOVE : BbDrill.GROUND_GLOVE, glove = this.gloveWorld(role, at, local);
        this.catchWith(role, inAir ? "fly" : "ground", local, at, inAir ? "뜬공 포구" : "타구 포구");
        return glove;
    }
}
BbLiveCycleDrill.ROLE_OF = { P: "pitcher", C: "catcher", "1B": "first", "2B": "second", SS: "short", "3B": "third", LF: "left", CF: "center", RF: "right" };
BbLiveCycleDrill.DROP = new BbVec(0, -0.12, 0);
BbLiveCycleDrill.BREAK_SCALE = 1.2;
BbLiveCycleDrill.PITCH_SPIN = 30;
BbLiveCycleDrill.LOAD_LEAD = 0.75;
BbLiveCycleDrill.MISS_GAP = 0.14;
BbLiveCycleDrill.SWING_SLIP_LIMIT = 0.18;
BbLiveCycleDrill.RECEIVE_SHIFT = 0.3;
BbLiveCycleDrill.GLOVE_LOW = new BbVec(-0.45, 0.12, 0);
BbLiveCycleDrill.GLOVE_HIGH = new BbVec(0.5, 1, 0);
BbLiveCycleDrill.TAIL_AFTER_CATCH = 1.1;
BbLiveCycleDrill.TAIL_AFTER_PLAY = 1.4;
BbLiveCycleDrill.TAIL_AFTER_FOUL = 0.8;
BbLiveCycleDrill.LONGEST_FOUL = 3;
BbLiveCycleDrill.FIELDER_REACTION = 0.25;
BbLiveCycleDrill.FIELDER_SETTLE = 0.4;
BbLiveCycleDrill.WALL_GAP = 0.6;
BbLiveCycleDrill.FOUL_ROLL_SECONDS = 1.2;
BbLiveCycleDrill.FOUL_ROLL_METERS = 14;
class BbLiveDirector {
    followsBall(drill, seconds) { return drill.batted && seconds >= drill.arriveAt + BbLiveDirector.CUT_AFTER_CONTACT; }
    shot(view, drill, seconds, ball) {
        if (!ball || !this.followsBall(drill, seconds))
            return view === "batter" ? BbBroadcastShots.batter() : BbBroadcastShots.pitcher();
        const flat = ball.flat(), booth = BbLiveDirector.BOOTH, position = booth.lerp(flat, BbLiveDirector.CHASE_SHARE);
        return { position: position.withY(booth.y + flat.length() * BbLiveDirector.RISE_PER_METER), look: flat.withY(ball.y * BbLiveDirector.LOOK_HEIGHT_SHARE), fieldOfView: 44 };
    }
}
BbLiveDirector.CUT_AFTER_CONTACT = 0.12;
BbLiveDirector.BOOTH = BbFieldSpace.toWorld(0, -14, 10);
BbLiveDirector.CHASE_SHARE = 0.4;
BbLiveDirector.RISE_PER_METER = 0.12;
BbLiveDirector.LOOK_HEIGHT_SHARE = 0.35;
