"use strict";
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
class BbBasePath {
    static point(base) { return BbBasePath.POINTS[base]; }
    static leadSpot(base) {
        const from = BbBasePath.point(base), toward = BbBasePath.point(base + 1);
        return from.plus(toward.minus(from).unit().times(BbBasePath.LEAD_METERS));
    }
    static dugoutDoor(side, slot) { return BbFieldSpace.toWorld(side * (19 + slot * 0.9), -3 + slot * 0.9); }
}
BbBasePath.RUNNER_ROLES = ["runnerFirst", "runnerSecond", "runnerThird"];
BbBasePath.POINTS = [BbFieldGeometry.HOME, BbFieldGeometry.FIRST, BbFieldGeometry.SECOND, BbFieldGeometry.THIRD, BbFieldGeometry.HOME];
BbBasePath.LEAD_METERS = 2.6;
class BbPitchChoreographer extends BbDrill {
    constructor(cue) {
        super();
        this.cue = cue;
        this.duration = 0;
        this.cameraCues = [];
        this.calls = [];
        this.plateAt = 0;
        this.lastMoment = 0;
        const roll = cue.outcome.roll;
        this.title = BbPitchCatalog.of(roll.pitch).label + " " + Math.round(roll.speed) + "km/h";
    }
    get arriveAt() { return this.plateAt; }
    until(seconds) {
        this.lastMoment = Math.max(this.lastMoment, seconds);
        return seconds;
    }
    shoot(at, kind, from, to) { this.cameraCues.push({ at, kind, from, to }); }
    runnerRole(id) {
        const index = id ? this.cue.setting.runners.indexOf(id) : -1;
        return index >= 0 ? BbBasePath.RUNNER_ROLES[index] : "batter";
    }
    compose() {
        const outcome = this.cue.outcome, roll = outcome.roll, swing = outcome.swing;
        this.cue.setting.runners.forEach((id, index) => {
            if (id)
                this.stand(BbBasePath.RUNNER_ROLES[index], BbActorPlacement.facing(BbBasePath.leadSpot(index + 1), BbFieldGeometry.HOME), null);
        });
        const pitchPose = new BbPitchPose(this.metrics), releaseAt = BbDrill.WINDUP_AT + pitchPose.keyTime;
        this.hold("pitcher", "throw", 0);
        this.pose("pitcher", pitchPose, BbDrill.WINDUP_AT, releaseAt, "투구");
        const from = this.handWorld("pitcher", "throw", releaseAt), plate = BbStrikeZoneBox.pointAt(roll.arrive.u, roll.arrive.v);
        const flight = new BbPitchFlight(from, plate, roll.flightSeconds, this.breakOf(roll).plus(BbPitchChoreographer.DROP));
        this.fly(flight, releaseAt, BbPitchChoreographer.PITCH_SPIN);
        this.plateAt = this.until(releaseAt + roll.flightSeconds);
        this.shoot(0, "pitch", BbFieldGeometry.RUBBER, BbFieldGeometry.HOME);
        this.pose("batter", new BbBatLoadPose(this.metrics), this.plateAt - BbPitchChoreographer.LOAD_LEAD, null, "로드");
        if (swing.kind === "contact" && swing.ball && outcome.script) {
            const swingEndsAt = this.swingAt(plate, this.plateAt, swing.band === "perfect" || swing.band === "good" ? "full" : "weak");
            this.playOut(swing.ball, outcome.script, plate, swingEndsAt);
        }
        else {
            if (swing.kind === "miss") {
                const slip = BbCurve.clamp(swing.adjusted || 0, -BbPitchChoreographer.SWING_SLIP_LIMIT, BbPitchChoreographer.SWING_SLIP_LIMIT);
                this.swingAt(plate.plus(new BbVec(0, roll.arrive.v < 0 ? BbPitchChoreographer.MISS_GAP : -BbPitchChoreographer.MISS_GAP, 0)), this.plateAt + slip, "full");
            }
            this.until(this.receive(flight, releaseAt) + BbPitchChoreographer.TAIL_AFTER_CATCH);
        }
        this.script.duration = this.lastMoment;
    }
    breakOf(roll) {
        const kind = BbPitchCatalog.of(roll.pitch);
        if (!kind.isBreaking)
            return new BbVec(0, 0, 0);
        const angle = kind.axisRadians(this.cue.pitcherHand);
        return BbStrikeZoneBox.pointAt(-Math.cos(angle), -Math.sin(angle)).minus(BbStrikeZoneBox.pointAt(0, 0)).times(BbPitchChoreographer.BREAK_SCALE);
    }
    swingAt(point, at, style) {
        const local = this.canonical("batter", this.script.placementOf("batter", at).toLocal(point));
        const pose = new BbBatSwingPose(this.metrics, local, style);
        return this.synced("batter", pose, at, "스윙") + pose.duration;
    }
    receive(flight, releaseAt) {
        const catcher = this.script.placementOf("catcher", 0), rest = BbDrill.CATCHER_TARGET, glovePlane = catcher.toWorld(rest).z;
        const ratio = (glovePlane - flight.from.z) / (flight.to.z - flight.from.z), catchAt = releaseAt + flight.duration * ratio;
        const reach = catcher.toLocal(flight.pointAt(flight.duration * ratio)), low = BbPitchChoreographer.GLOVE_LOW, high = BbPitchChoreographer.GLOVE_HIGH;
        const target = new BbVec(BbCurve.clamp(reach.x, low.x, high.x), BbCurve.clamp(reach.y, low.y, high.y), rest.z);
        this.synced("catcher", new BbCatcherReceivePose(this.metrics, rest, target, BbPitchChoreographer.RECEIVE_SHIFT), catchAt - 0.1, "포수 포구");
        this.hold("catcher", "glove", catchAt);
        return catchAt;
    }
}
BbPitchChoreographer.DROP = new BbVec(0, -0.12, 0);
BbPitchChoreographer.BREAK_SCALE = 1.2;
BbPitchChoreographer.PITCH_SPIN = 30;
BbPitchChoreographer.LOAD_LEAD = 0.75;
BbPitchChoreographer.MISS_GAP = 0.14;
BbPitchChoreographer.SWING_SLIP_LIMIT = 0.18;
BbPitchChoreographer.RECEIVE_SHIFT = 0.3;
BbPitchChoreographer.GLOVE_LOW = new BbVec(-0.45, 0.12, 0);
BbPitchChoreographer.GLOVE_HIGH = new BbVec(0.5, 1, 0);
BbPitchChoreographer.TAIL_AFTER_CATCH = 1.1;
class BbPlayChoreographer extends BbPitchChoreographer {
    constructor() {
        super(...arguments);
        this.busy = new Set();
        this.freeAt = new Map();
        this.clock = new BbThrowDecision();
        this.contactAt = 0;
        this.holder = null;
        this.heldSince = 0;
    }
    playOut(ball, script, contactPoint, swingEndsAt) {
        this.contactAt = this.plateAt;
        const handled = script.events.find((event) => (event.kind === "catch" || event.kind === "field") && !!event.spot && !!event.who) || null;
        const fumbled = script.events.some((event) => event.kind === "error");
        const glove = handled ? this.fielderTakes(handled, contactPoint, fumbled) : null;
        this.ballTravels(ball, script, contactPoint, handled, glove);
        this.shoot(this.contactAt + 0.12, "chase", contactPoint, glove || BbFieldSpace.polar(ball.carry, ball.spray));
        if (fumbled && glove)
            this.fly(new BbGroundRoll(glove, glove.plus(BbPlayChoreographer.ERROR_SPILL).withY(BbThrowTrajectory.BALL_RADIUS), 0.7, 2, 0.25), this.contactAt + handled.t, 10);
        if (!this.busy.has("pitcher"))
            this.pitcherWatches(glove || BbFieldSpace.polar(ball.carry, ball.spray), this.contactAt);
        script.events.filter((event) => event.kind === "throw").forEach((event) => this.throwPlay(event, ball));
        if (script.result === "SAC_FLY" || script.events.some((event) => event.kind === "tagUp"))
            this.throwAfterTagUp(script, ball);
        if (script.events.some((event) => event.kind === "homeRun"))
            this.homeRunTrot(swingEndsAt);
        else
            this.runnersGo(script, ball, swingEndsAt);
        if (!ball.foul)
            this.coverBases(ball, script, handled);
        script.events.forEach((event) => {
            const text = BbPlayChoreographer.CALL_TEXT[event.kind];
            if (text)
                this.calls.push({ at: this.until(this.contactAt + event.t), text });
        });
        this.until(this.contactAt + (ball.foul && !handled ? Math.min(ball.hang, BbPlayChoreographer.LONGEST_FOUL) + BbPlayChoreographer.FOUL_TAIL : 0));
        this.until(this.script.duration);
        this.until(this.lastSeconds() + BbPlayChoreographer.TAIL);
    }
    lastSeconds() {
        let last = this.contactAt;
        this.script.moves.forEach((move) => { if (!this.isBackground(move.role))
            last = Math.max(last, move.endAt); });
        this.script.balls.forEach((ball) => { last = Math.max(last, ball.startAt + (ball.path ? ball.path.duration : 0)); });
        return last;
    }
    isBackground(role) { return !this.busy.has(role) && role !== "batter" && BbBasePath.RUNNER_ROLES.indexOf(role) < 0; }
    role(position) { return BbPlayChoreographer.ROLE_OF[position]; }
    spotOf(role, at) { return this.script.placementOf(role, at).position; }
    fielderTakes(event, contactPoint, fumbled) {
        const role = this.role(event.who), spot = event.spot, standing = BbFieldSpace.toWorld(spot[0], spot[1]), at = this.contactAt + event.t, inAir = event.kind === "catch";
        const leaveAt = this.contactAt + BbPlayChoreographer.FIELDER_REACTION, reach = this.spotOf(role, this.contactAt).distanceTo(standing);
        const settledAt = Math.min(at, Math.max(at - BbPlayChoreographer.FIELDER_SETTLE, leaveAt + reach / BbPlayChoreographer.CHASE_SPEED));
        this.busy.add(role);
        this.freeAt.set(role, at);
        if (reach > 0.5)
            this.move(role, standing, leaveAt, settledAt);
        this.face(role, contactPoint.flat(), settledAt);
        const local = inAir ? BbDrill.FLY_GLOVE : BbDrill.GROUND_GLOVE, glove = this.gloveWorld(role, at, local);
        if (fumbled)
            this.synced(role, new BbCatchPose(this.metrics, "ground", local), at, "포구 실패");
        else {
            this.catchWith(role, inAir ? "fly" : "ground", local, at, inAir ? "뜬공 포구" : "타구 포구");
            this.holder = role;
            this.heldSince = at;
        }
        return glove;
    }
    ballTravels(ball, script, contactPoint, handled, glove) {
        const contactAt = this.contactAt, takenAt = handled ? contactAt + handled.t : 0, landing = BbFieldSpace.polar(ball.carry, ball.spray, BbThrowTrajectory.BALL_RADIUS);
        if (ball.flight === "ground") {
            const stop = glove || BbFieldSpace.polar(Math.max(ball.carry, BbPlayChoreographer.FOUL_ROLL_METERS), ball.spray, BbThrowTrajectory.BALL_RADIUS);
            this.fly(new BbGroundRoll(contactPoint, stop, glove ? takenAt - contactAt : BbPlayChoreographer.FOUL_ROLL_SECONDS, 5, 0.4), contactAt, 26);
            return;
        }
        if (handled && handled.kind === "catch" && glove) {
            this.fly(new BbBattedFlight(contactPoint, glove, takenAt - contactAt, this.apexOf(ball, 1)), contactAt, 18);
            return;
        }
        const fence = BbBallparkRegistry.MAIN.dimensions.fenceDistance(ball.spray), overWall = script.result === "HOME_RUN" && !handled;
        const share = ball.foul || overWall || ball.carry < fence ? 1 : (fence - BbPlayChoreographer.WALL_GAP) / ball.carry;
        const airSeconds = ball.hang * share, reach = ball.carry * share;
        const down = share < 1 ? BbFieldSpace.polar(reach, ball.spray, BbBattedBallPhysics.heightAt(reach, ball.carry, ball.launch)) : landing;
        this.fly(new BbBattedFlight(contactPoint, down, airSeconds, this.apexOf(ball, share)), contactAt, 18);
        if (glove && takenAt - contactAt - airSeconds > 0.05)
            this.fly(new BbGroundRoll(down, glove, takenAt - contactAt - airSeconds, 3, 0.8), contactAt + airSeconds, 18);
    }
    apexOf(ball, share) {
        return ball.carry * Math.tan(Math.max(0, ball.launch) * Math.PI / 180) / 4 * share * share;
    }
    receiverFor(base, thrower, spray) {
        if (base >= 4)
            return "catcher";
        if (base === 1)
            return thrower === "first" ? "pitcher" : "first";
        const first = this.role(base === 2 ? BbCoverageTable.secondBaseCover(spray) : BbCoverageTable.thirdBaseCover(spray));
        if (first !== thrower)
            return first;
        return base === 2 ? (thrower === "second" ? "short" : "second") : (thrower === "third" ? "short" : "third");
    }
    throwPlay(event, ball) {
        const thrower = this.role(event.who), base = event.base, arriveAt = this.contactAt + event.arriveT;
        if (this.holder !== thrower)
            return;
        const bag = BbBasePath.point(base), from = this.spotOf(thrower, this.heldSince), distance = from.distanceTo(bag);
        if (distance < BbPlayChoreographer.SELF_TAG_METERS) {
            this.move(thrower, bag.lerp(from, 0.08), this.heldSince + 0.15, Math.max(this.heldSince + 0.3, arriveAt));
            return;
        }
        const receiver = this.receiverFor(base, thrower, ball.spray), outfield = BbPlayChoreographer.OUTFIELD.indexOf(thrower) >= 0;
        const relay = outfield && distance > BbPlayChoreographer.RELAY_BEYOND ? this.relayMan(ball.spray, receiver) : null;
        this.shoot(this.heldSince + 0.1, outfield ? "relay" : "throw", from, bag);
        if (relay) {
            const spot = from.lerp(bag, BbPlayChoreographer.RELAY_SHARE), relayAt = arriveAt - spot.distanceTo(bag) / BbThrowTrajectory.INFIELD_SPEED - BbPlayChoreographer.RELAY_HANDLING;
            if (relayAt > this.heldSince + 0.9) {
                this.passTo(thrower, relay, spot, from, relayAt, "chest", true);
                this.passTo(relay, receiver, bag, spot, arriveAt, base === 1 ? "stretch" : "chest", false);
                this.tagIfNeeded(receiver, base);
                return;
            }
        }
        this.passTo(thrower, receiver, bag, from, arriveAt, base === 1 ? "stretch" : "chest", outfield);
        this.tagIfNeeded(receiver, base);
    }
    relayMan(spray, receiver) {
        const lead = this.role(BbCoverageTable.relayLead(spray)), trail = this.role(BbCoverageTable.relayTrail(spray));
        if (lead !== receiver && !this.busy.has(lead))
            return lead;
        return trail !== receiver && !this.busy.has(trail) ? trail : null;
    }
    passTo(thrower, receiver, standAt, comingFrom, arriveAt, kind, crowHop) {
        const stand = standAt.lerp(comingFrom, Math.min(0.3, 0.35 / Math.max(1, standAt.distanceTo(comingFrom)))), readyBy = Math.max(this.contactAt + 0.6, arriveAt - 0.55);
        this.busy.add(receiver);
        const leaveAt = Math.max(this.contactAt + 0.2, this.freeAt.get(receiver) || 0), reach = this.spotOf(receiver, leaveAt).distanceTo(stand);
        arriveAt = Math.max(arriveAt, leaveAt + reach / BbPlayChoreographer.CHASE_SPEED + 0.1);
        const setAt = Math.max(leaveAt + 0.05, Math.min(arriveAt - 0.1, Math.max(readyBy, leaveAt + reach / BbPlayChoreographer.COVER_SPEED)));
        if (reach > 0.4)
            this.move(receiver, stand, leaveAt, setAt);
        this.face(receiver, comingFrom, setAt);
        const local = kind === "stretch" ? BbPlayChoreographer.STRETCH_GLOVE : BbDrill.CHEST_GLOVE, target = this.gloveWorld(receiver, arriveAt, local);
        const landedAt = this.throwTo(thrower, target, arriveAt, crowHop);
        this.catchWith(receiver, kind, local, landedAt, "송구 포구");
        this.holder = receiver;
        this.heldSince = landedAt;
        this.until(landedAt);
    }
    throwTo(role, target, arriveAt, crowHop) {
        const pose = new BbFieldThrowPose(this.metrics, crowHop), readyAt = this.heldSince + BbPlayChoreographer.THROW_READY, standing = this.spotOf(role, readyAt);
        const toward = target.minus(standing).flat(), nominal = toward.length() / (crowHop ? BbThrowTrajectory.OUTFIELD_SPEED : BbThrowTrajectory.INFIELD_SPEED);
        let startAt = Math.max(readyAt, arriveAt - nominal - pose.keyTime);
        if (startAt + pose.keyTime > arriveAt - BbPlayChoreographer.SHORTEST_THROW)
            startAt = readyAt;
        const releaseAt = startAt + pose.keyTime, flightSeconds = Math.max(BbPlayChoreographer.SHORTEST_THROW, arriveAt - releaseAt, toward.length() / BbPlayChoreographer.FASTEST_THROW);
        this.face(role, target, startAt);
        this.move(role, standing.plus(toward.unit().times(crowHop ? BbDrill.CROW_HOP_STRIDE : BbDrill.THROW_STRIDE)), startAt, releaseAt + 0.14, "walk");
        this.pose(role, pose, startAt, releaseAt, "송구");
        this.hold(role, "throw", startAt);
        const from = this.handWorld(role, "throw", releaseAt);
        this.fly(new BbThrowTrajectory(from, target, Math.max(1, target.minus(from).flat().length()) / flightSeconds), releaseAt, 14);
        this.freeAt.set(role, releaseAt + 0.3);
        return releaseAt + flightSeconds;
    }
    tagIfNeeded(receiver, base) {
        if (base < 2 || this.cue.outcome.script === null)
            return;
        const result = this.cue.outcome.script.result;
        if (result === "DOUBLE_PLAY" || result === "FIELDERS_CHOICE" || result === "GROUND_OUT")
            return;
        this.pose(receiver, new BbTagPose(this.metrics, BbPlayChoreographer.TAG_POINT), this.heldSince + 0.05, null, "태그");
    }
    throwAfterTagUp(script, ball) {
        if (!this.holder || script.events.some((event) => event.kind === "throw"))
            return;
        const lead = script.events.filter((event) => event.kind === "tagUp").sort((a, b) => b.base - a.base)[0];
        if (!lead)
            return;
        const spot = this.spotOf(this.holder, this.heldSince), base = lead.base;
        this.throwPlay({ t: this.heldSince - this.contactAt, kind: "throw", who: Object.keys(BbPlayChoreographer.ROLE_OF).find((key) => this.role(key) === this.holder), base,
            arriveT: this.heldSince - this.contactAt + this.clock.secondsTo({ x: spot.x, z: -spot.z }, base) }, ball);
    }
    runnersGo(script, ball, swingEndsAt) {
        const outs = script.events.filter((event) => event.kind === "callOut"), throws = script.events.filter((event) => event.kind === "throw" || event.kind === "tagUp");
        const moved = new Set();
        script.events.filter((event) => event.kind === "runnerMove" || event.kind === "tagUp").forEach((event) => {
            const role = this.runnerRole(event.who), from = event.from, to = event.base, out = outs.some((call) => call.who === event.who);
            const ownPace = role === "batter" ? BbRunnerMotion.batterSeconds(to, this.cue.abilities) : event.t + BbRunnerMotion.fromBaseSeconds(to - from, this.cue.abilities);
            const endAt = this.contactAt + (out ? Math.max(ownPace, event.arriveT) : event.arriveT);
            const contested = to >= 2 && (out || throws.some((other) => other.base === to && other.kind === "throw") || (to === 4 && event.kind === "tagUp"));
            moved.add(role);
            this.runBases(role, from, to, role === "batter" ? swingEndsAt - 0.15 : this.contactAt + event.t + BbRunnerMotion.REACTION, endAt, contested, event.kind === "tagUp" || role === "batter");
            if (to === 1 && role === "batter")
                this.move(role, BbPlayChoreographer.OVERRUN, endAt, endAt + 1.1, "slide");
            if (to >= 4)
                this.move(role, BbBasePath.dugoutDoor(-1, 0).lerp(BbFieldGeometry.HOME, 0.6), endAt + 0.4, endAt + 2.2, "walk");
        });
        if (!moved.has("batter") && !ball.foul && script.batterReached === 0) {
            const endAt = this.contactAt + BbRunnerMotion.batterSeconds(1, this.cue.abilities), caughtAt = outs.length ? this.contactAt + outs[0].t : endAt;
            const bag = BbBasePath.point(1), start = this.spotOf("batter", swingEndsAt), stopAt = Math.min(endAt, Math.max(swingEndsAt + 0.4, caughtAt + 0.6));
            this.move("batter", start.lerp(bag, BbCurve.span(stopAt, swingEndsAt - 0.15, endAt)), swingEndsAt - 0.15, stopAt);
        }
    }
    runBases(role, from, to, leaveAt, endAt, slides, leavesNow) {
        const points = [this.spotOf(role, leaveAt)];
        for (let base = from + 1; base <= to; base++)
            points.push(BbBasePath.point(base).plus(base === 1 ? new BbVec(0.25, 0, 0.1) : new BbVec(0, 0, 0)));
        let total = 0;
        for (let index = 1; index < points.length; index++)
            total += points[index].distanceTo(points[index - 1]);
        const startAt = leavesNow ? Math.min(leaveAt, endAt - 0.5) : Math.max(leaveAt, endAt - total / BbPlayChoreographer.HELD_RUN_SPEED - 0.4);
        const slideSeconds = slides ? BbPlayChoreographer.SLIDE_SECONDS : 0, runUntil = endAt - slideSeconds, slideShare = slides ? Math.min(0.5, BbPlayChoreographer.SLIDE_METERS / Math.max(total, 1)) : 0;
        let covered = 0, clock = startAt;
        for (let index = 1; index < points.length; index++) {
            const length = points[index].distanceTo(points[index - 1]), last = index === points.length - 1;
            const stop = last && slides ? points[index].lerp(points[index - 1], BbPlayChoreographer.SLIDE_METERS / Math.max(length, BbPlayChoreographer.SLIDE_METERS)) : points[index];
            covered += last && slides ? length - Math.min(length, BbPlayChoreographer.SLIDE_METERS) : length;
            const arrive = startAt + (runUntil - startAt) * Math.min(1, covered / Math.max(total * (1 - slideShare), 0.1));
            this.move(role, stop, clock, Math.max(clock + 0.05, arrive));
            clock = Math.max(clock + 0.05, arrive);
        }
        if (slides) {
            this.move(role, points[points.length - 1], clock, clock + slideSeconds, "slide");
            this.synced(role, new BbSlidePose(this.metrics, slideSeconds), clock + slideSeconds, "슬라이딩");
        }
        this.until(endAt);
    }
    homeRunTrot(swingEndsAt) {
        const gap = BbFieldGeometry.BASE_GAP / BbPlayChoreographer.TROT_SPEED, landedAt = this.contactAt + this.cue.outcome.swing.ball.hang;
        const trot = (role, from, leaveAt) => {
            let clock = leaveAt;
            for (let base = from + 1; base <= 4; base++) {
                this.move(role, BbBasePath.point(base), clock, clock + gap);
                clock += gap;
            }
            this.move(role, BbBasePath.dugoutDoor(-1, 0).lerp(BbFieldGeometry.HOME, 0.6), clock, clock + 1.5, "walk");
            this.until(clock);
        };
        this.cue.setting.runners.forEach((id, index) => { if (id)
            trot(BbBasePath.RUNNER_ROLES[index], index + 1, this.contactAt + 0.6); });
        trot("batter", 0, swingEndsAt);
        this.shoot(landedAt + 0.8, "bases", BbFieldGeometry.HOME, BbFieldGeometry.SECOND);
        BbPlayChoreographer.OUTFIELD.forEach((role) => {
            const spot = this.spotOf(role, this.contactAt), wall = BbFieldSpace.polar(BbBallparkRegistry.MAIN.dimensions.fenceDistance(this.cue.outcome.swing.ball.spray) - 3, this.cue.outcome.swing.ball.spray);
            const reach = Math.min(spot.distanceTo(wall) * 0.7, BbPlayChoreographer.COVER_SPEED * (landedAt - this.contactAt - 0.4));
            if (reach > 1)
                this.move(role, spot.plus(wall.minus(spot).unit().times(reach)), this.contactAt + 0.4, landedAt);
        });
    }
    send(role, point, facing) {
        if (this.busy.has(role))
            return;
        this.busy.add(role);
        const startAt = this.contactAt + 0.4, from = this.spotOf(role, startAt);
        if (from.distanceTo(point) < 0.6)
            return;
        const endAt = startAt + from.distanceTo(point) / BbPlayChoreographer.COVER_SPEED;
        this.script.moves.push({ role, from, to: point, startAt, endAt, gait: "run" });
        this.face(role, facing, endAt);
    }
    coverBases(ball, script, handled) {
        if (script.events.some((event) => event.kind === "homeRun"))
            return;
        const reserved = new Set(this.busy), spot = handled && handled.spot ? BbFieldSpace.toWorld(handled.spot[0], handled.spot[1]) : BbFieldSpace.polar(ball.carry, ball.spray);
        const deep = spot.length() > BbThrowDecision.OUTFIELD_DEPTH, empty = this.cue.setting.runners.every((id) => !id), home = BbFieldGeometry.HOME;
        const cover = this.role(BbCoverageTable.secondBaseCover(ball.spray)), other = cover === "second" ? "short" : "second";
        this.busy.clear();
        reserved.forEach((role) => this.busy.add(role));
        this.send("first", BbBasePath.point(1).plus(new BbVec(-0.35, 0, 0.1)), spot);
        this.send(cover, BbBasePath.point(2).plus(new BbVec(0, 0, 0.35)), spot);
        this.send("third", BbBasePath.point(3).plus(new BbVec(0.35, 0, 0.1)), spot);
        if (deep) {
            this.send(other, spot.lerp(BbBasePath.point(2), 0.55), spot);
            this.send("pitcher", BbPlayChoreographer.HOME_BACKUP, spot);
            this.send("catcher", BbPlayChoreographer.PLATE_GUARD, spot);
            BbPlayChoreographer.OUTFIELD.forEach((role) => this.send(role, spot.plus(spot.unit().times(BbPlayChoreographer.BACKUP_BEHIND)).lerp(this.spotOf(role, this.contactAt), 0.3), home));
        }
        else {
            this.send("right", BbPlayChoreographer.FIRST_BACKUP, home);
            if (empty && ball.flight === "ground")
                this.send("catcher", BbPlayChoreographer.CATCHER_TRAIL, BbBasePath.point(1));
        }
        reserved.forEach((role) => this.busy.add(role));
        this.busy.forEach((role) => { if (!reserved.has(role))
            this.busy.delete(role); });
    }
}
BbPlayChoreographer.ROLE_OF = { P: "pitcher", C: "catcher", "1B": "first", "2B": "second", SS: "short", "3B": "third", LF: "left", CF: "center", RF: "right" };
BbPlayChoreographer.OUTFIELD = ["left", "center", "right"];
BbPlayChoreographer.STRETCH_GLOVE = new BbVec(0.06, 0.68, 0.5);
BbPlayChoreographer.TAG_POINT = new BbVec(0.1, 0.16, 0.45);
BbPlayChoreographer.TAIL = 1.3;
BbPlayChoreographer.FOUL_TAIL = 0.8;
BbPlayChoreographer.LONGEST_FOUL = 3;
BbPlayChoreographer.FIELDER_REACTION = 0.08;
BbPlayChoreographer.CHASE_SPEED = 9;
BbPlayChoreographer.FIELDER_SETTLE = 0.4;
BbPlayChoreographer.WALL_GAP = 0.6;
BbPlayChoreographer.FOUL_ROLL_SECONDS = 1.2;
BbPlayChoreographer.FOUL_ROLL_METERS = 14;
BbPlayChoreographer.SHORTEST_THROW = 0.18;
BbPlayChoreographer.FASTEST_THROW = 44;
BbPlayChoreographer.THROW_READY = 0.12;
BbPlayChoreographer.SELF_TAG_METERS = 4;
BbPlayChoreographer.RELAY_BEYOND = 60;
BbPlayChoreographer.RELAY_HANDLING = 0.5;
BbPlayChoreographer.RELAY_SHARE = 0.45;
BbPlayChoreographer.SLIDE_METERS = 3;
BbPlayChoreographer.SLIDE_SECONDS = 0.75;
BbPlayChoreographer.HELD_RUN_SPEED = 7.5;
BbPlayChoreographer.TROT_SPEED = 8;
BbPlayChoreographer.COVER_SPEED = 6.5;
BbPlayChoreographer.BACKUP_BEHIND = 8;
BbPlayChoreographer.OVERRUN = BbFieldSpace.toWorld(22.9, 23.2);
BbPlayChoreographer.FIRST_BACKUP = BbFieldSpace.toWorld(27, 14);
BbPlayChoreographer.CATCHER_TRAIL = BbFieldSpace.toWorld(14, 4);
BbPlayChoreographer.HOME_BACKUP = BbFieldSpace.toWorld(-4, -8);
BbPlayChoreographer.PLATE_GUARD = BbFieldSpace.toWorld(0.35, 0.75);
BbPlayChoreographer.ERROR_SPILL = new BbVec(1.6, 0, 1.2);
BbPlayChoreographer.CALL_TEXT = { callOut: "아웃!", score: "득점!", homeRun: "홈런!", error: "실책!", infieldFly: "인필드 플라이!" };
class BbSwapChoreographer extends BbDrill {
    constructor(entering, dugoutSide) {
        super();
        this.entering = entering;
        this.dugoutSide = dugoutSide;
        this.title = "공수 교대";
        this.duration = BbSwapChoreographer.SECONDS;
        this.cameraCues = [{ at: 0, kind: "top", from: BbFieldGeometry.HOME, to: BbFieldGeometry.SECOND }];
        this.calls = [];
        this.arriveAt = -1;
    }
    compose() {
        BbSwapChoreographer.FIELDERS.forEach((role, slot) => this.swap(role, BbBasePath.dugoutDoor(this.dugoutSide, slot)));
        this.swap("batter", BbBasePath.dugoutDoor(-this.dugoutSide, 0));
    }
    swap(role, door) {
        const post = this.script.placementOf(role, 0);
        if (this.entering)
            this.script.starts.set(role, BbActorPlacement.facing(door, post.position));
        this.move(role, this.entering ? post.position : door, 0, BbSwapChoreographer.SECONDS);
        if (this.entering)
            this.face(role, BbFieldGeometry.HOME, BbSwapChoreographer.SECONDS);
    }
}
BbSwapChoreographer.SECONDS = 1;
BbSwapChoreographer.FIELDERS = ["pitcher", "catcher", "first", "second", "short", "third", "left", "center", "right"];
