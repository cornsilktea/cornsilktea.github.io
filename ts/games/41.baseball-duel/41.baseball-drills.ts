type BbRoleId = "pitcher" | "catcher" | "umpire" | "first" | "second" | "short" | "third" | "left" | "center" | "right" | "batter" | "runner" | "runnerFirst" | "runnerSecond" | "runnerThird";
type BbGait = "run" | "walk" | "slide";
type BbHandUse = "throw" | "glove";
type BbCheckKind = "release" | "contact" | "catch" | "touch";

interface BbPoseCue {
  role: BbRoleId;
  pose: BbActionPose;
  startAt: number;
  eventAt: number | null;
  mirrored: boolean;
  label: string;
}

interface BbMoveCue {
  role: BbRoleId;
  from: BbVec;
  to: BbVec;
  startAt: number;
  endAt: number;
  gait: BbGait;
}

interface BbFaceCue {
  role: BbRoleId;
  at: number;
  toward: BbVec;
}

interface BbBallCue {
  startAt: number;
  path: BbBallPath | null;
  holder: BbRoleId | null;
  hand: BbHandUse;
  spin: number;
}

interface BbCheckpoint {
  label: string;
  kind: BbCheckKind;
  at: number;
  role: BbRoleId;
  point: BbVec;
}

interface BbDrillSetup {
  metrics: BbBodyMetrics;
  batsLeft: boolean;
  throwsLeft: boolean;
}

interface BbBallState {
  holder: BbRoleId | null;
  hand: BbHandUse;
  point: BbVec;
  origin: BbVec;
  sinceStart: number;
  spin: number;
}

class BbDrillScript {
  readonly starts = new Map<BbRoleId, BbActorPlacement>();
  readonly poses: BbPoseCue[] = [];
  readonly moves: BbMoveCue[] = [];
  readonly faces: BbFaceCue[] = [];
  readonly balls: BbBallCue[] = [];
  readonly checkpoints: BbCheckpoint[] = [];
  readonly mirroredRoles = new Set<BbRoleId>();

  constructor(readonly title: string, public duration: number) {}

  roles(): BbRoleId[] { return Array.from(this.starts.keys()); }

  placementOf(role: BbRoleId, seconds: number): BbActorPlacement {
    const start = this.starts.get(role) as BbActorPlacement;
    let position = start.position, yaw = start.yaw, yawSetAt = -Infinity;
    for (const move of this.moves) {
      if (move.role !== role || seconds < move.startAt) continue;
      const ratio = BbCurve.span(seconds, move.startAt, move.endAt);
      position = move.from.lerp(move.to, move.gait === "slide" ? BbSlidePose.travelRatio(ratio) : ratio);
      if (move.startAt >= yawSetAt && move.from.distanceTo(move.to) > 0.05) { yaw = BbActorPlacement.yawToward(move.from, move.to); yawSetAt = move.startAt; }
    }
    for (const face of this.faces) {
      if (face.role === role && seconds >= face.at && face.at >= yawSetAt) { yaw = BbActorPlacement.yawToward(position, face.toward); yawSetAt = face.at; }
    }
    return new BbActorPlacement(position, yaw);
  }

  gaitOf(role: BbRoleId, seconds: number): BbGait | null {
    for (const move of this.moves) if (move.role === role && seconds >= move.startAt && seconds < move.endAt) return move.gait;
    return null;
  }

  speedOf(role: BbRoleId, seconds: number): number {
    for (const move of this.moves) if (move.role === role && seconds >= move.startAt && seconds < move.endAt) return move.from.distanceTo(move.to) / (move.endAt - move.startAt);
    return 0;
  }

  poseOf(role: BbRoleId, seconds: number): BbPoseCue | null {
    let latest: BbPoseCue | null = null;
    for (const cue of this.poses) {
      if (cue.role === role && seconds >= cue.startAt && (!latest || cue.startAt >= latest.startAt)) latest = cue;
    }
    if (!latest || seconds > latest.startAt + latest.pose.duration) return null;
    if (latest.pose.duration === Infinity && this.gaitOf(role, seconds)) return null;
    return latest;
  }

  frameOf(role: BbRoleId, seconds: number): BbPoseFrame | null {
    const cue = this.poseOf(role, seconds);
    return cue ? BbHandednessMirror.frame(cue.pose.frameAt(seconds - cue.startAt), cue.mirrored) : null;
  }

  handPointOf(role: BbRoleId, hand: BbHandUse, seconds: number): BbVec | null {
    const frame = this.frameOf(role, seconds);
    if (!frame) return null;
    const side = this.sideOf(role, hand);
    return this.placementOf(role, seconds).toWorld(side === "left" ? frame.handLeft : frame.handRight);
  }

  sideOf(role: BbRoleId, hand: BbHandUse): BbSide {
    return BbHandednessMirror.side(hand === "glove" ? "left" : "right", this.mirroredRoles.has(role));
  }

  ballAt(seconds: number): BbBallState | null {
    let chosen: BbBallCue | null = null;
    for (const cue of this.balls) if (seconds >= cue.startAt && (!chosen || cue.startAt >= chosen.startAt)) chosen = cue;
    if (!chosen) return null;
    const sinceStart = seconds - chosen.startAt;
    if (chosen.path) return { holder: null, hand: chosen.hand, point: chosen.path.pointAt(sinceStart), origin: chosen.path.pointAt(0), sinceStart, spin: chosen.spin };
    const held = this.handPointOf(chosen.holder as BbRoleId, chosen.hand, seconds) || this.placementOf(chosen.holder as BbRoleId, seconds).toWorld(new BbVec(0, 0.6, 0.2));
    return { holder: chosen.holder, hand: chosen.hand, point: held, origin: held, sinceStart, spin: 0 };
  }
}

abstract class BbDrill {
  protected static readonly WINDUP_AT = 0.6;
  protected static readonly PITCH_FLIGHT = 1.05;
  protected static readonly GROUND_GLOVE = new BbVec(0.05, 0.075, 0.42);
  protected static readonly CHEST_GLOVE = new BbVec(0.1, 0.72, 0.4);
  protected static readonly FLY_GLOVE = new BbVec(0.08, 1.12, 0.2);
  protected static readonly CATCHER_TARGET = new BbVec(0.22, 0.5, 0.6);
  protected static readonly THROW_STRIDE = 1.1;
  protected static readonly CROW_HOP_STRIDE = 2.2;
  protected static readonly THROW_AFTER_CATCH = 0.4;

  abstract readonly title: string;
  abstract readonly duration: number;
  protected script!: BbDrillScript;
  protected setup!: BbDrillSetup;

  build(setup: BbDrillSetup): BbDrillScript {
    this.setup = setup;
    this.script = new BbDrillScript(this.title, this.duration);
    this.placeDefense();
    this.compose();
    return this.script;
  }

  protected abstract compose(): void;

  protected get metrics(): BbBodyMetrics { return this.setup.metrics; }

  protected stand(role: BbRoleId, placement: BbActorPlacement, idle: BbActionPose | null): void {
    this.script.starts.set(role, placement);
    if (idle) this.pose(role, idle, 0, null, "대기");
  }

  protected pose(role: BbRoleId, pose: BbActionPose, startAt: number, eventAt: number | null, label: string): void {
    this.script.poses.push({ role, pose, startAt, eventAt, mirrored: this.script.mirroredRoles.has(role), label });
  }

  protected synced(role: BbRoleId, pose: BbActionPose, eventAt: number, label: string): number {
    const startAt = BbActionSync.startFor(eventAt, pose);
    this.pose(role, pose, startAt, eventAt, label);
    return startAt;
  }

  protected move(role: BbRoleId, to: BbVec, startAt: number, endAt: number, gait: BbGait = "run"): void {
    const from = this.script.placementOf(role, startAt).position;
    this.script.moves.push({ role, from, to, startAt, endAt, gait });
  }

  protected face(role: BbRoleId, toward: BbVec, at: number): void { this.script.faces.push({ role, at, toward }); }

  protected hold(role: BbRoleId, hand: BbHandUse, startAt: number): void {
    this.script.balls.push({ startAt, path: null, holder: role, hand, spin: 0 });
  }

  protected fly(path: BbBallPath, startAt: number, spin: number): void {
    this.script.balls.push({ startAt, path, holder: null, hand: "throw", spin });
  }

  protected check(label: string, kind: BbCheckKind, at: number, role: BbRoleId, point: BbVec): void {
    this.script.checkpoints.push({ label, kind, at, role, point });
  }

  protected canonical(role: BbRoleId, local: BbVec): BbVec {
    return BbHandednessMirror.point(local, this.script.mirroredRoles.has(role));
  }

  protected handWorld(role: BbRoleId, hand: BbHandUse, at: number): BbVec {
    return this.script.handPointOf(role, hand, at) as BbVec;
  }

  protected gloveWorld(role: BbRoleId, at: number, local: BbVec): BbVec {
    return this.script.placementOf(role, at).toWorld(this.canonical(role, local));
  }

  protected catchWith(role: BbRoleId, kind: BbCatchKind, local: BbVec, at: number, label: string): BbVec {
    const point = this.gloveWorld(role, at, local);
    this.synced(role, new BbCatchPose(this.metrics, kind, local), at, label);
    this.hold(role, "glove", at);
    this.check(label, "catch", at, role, point);
    return point;
  }

  protected throwFrom(role: BbRoleId, startAt: number, target: BbVec, speed: number, crowHop: boolean, label: string): { arriveAt: number; releaseAt: number } {
    const pose = new BbFieldThrowPose(this.metrics, crowHop);
    this.face(role, target, startAt);
    const standing = this.script.placementOf(role, startAt).position, stride = crowHop ? BbDrill.CROW_HOP_STRIDE : BbDrill.THROW_STRIDE;
    this.move(role, standing.plus(target.minus(standing).flat().unit().times(stride)), startAt, startAt + pose.keyTime + 0.14, "walk");
    this.pose(role, pose, startAt, startAt + pose.keyTime, label);
    this.hold(role, "throw", startAt);
    const releaseAt = startAt + pose.keyTime, from = this.handWorld(role, "throw", releaseAt);
    const path = new BbThrowTrajectory(from, target, speed);
    this.fly(path, releaseAt, 14);
    this.check(label + " 릴리스", "release", releaseAt, role, from);
    return { arriveAt: releaseAt + path.duration, releaseAt };
  }

  private placeDefense(): void {
    const home = BbFieldGeometry.HOME, ready = () => new BbReadyPose(this.metrics, 0.35);
    if (this.setup.throwsLeft) this.script.mirroredRoles.add("pitcher");
    if (this.setup.batsLeft) this.script.mirroredRoles.add("batter");
    const spots: Array<[BbRoleId, number, number]> = [["first", 17.5, 21], ["second", 10, 31], ["short", -10, 31], ["third", -17.5, 21], ["left", -38, 75], ["center", 0, 82], ["right", 38, 75]];
    spots.forEach(([role, x, z]) => this.stand(role, BbActorPlacement.facing(BbFieldSpace.toWorld(x, z), home), ready()));
    this.stand("pitcher", BbActorPlacement.facing(BbFieldGeometry.RUBBER, home.withY(BbFieldGeometry.MOUND_HEIGHT)), new BbReadyPose(this.metrics, 0));
    const catcherSpot = BbActorPlacement.facing(BbFieldSpace.toWorld(0, -1.25), BbFieldGeometry.RUBBER.withY(0));
    this.stand("catcher", catcherSpot, new BbCatcherCrouchPose(this.metrics, BbDrill.CATCHER_TARGET));
    this.stand("umpire", BbActorPlacement.facing(BbFieldSpace.toWorld(0.25, -2.2), BbFieldGeometry.RUBBER.withY(0)), new BbReadyPose(this.metrics, 0.8));
    const boxX = this.setup.batsLeft ? BbFieldGeometry.BATTER_BOX_OFFSET : -BbFieldGeometry.BATTER_BOX_OFFSET;
    const batterSpot = BbFieldSpace.toWorld(boxX, 0.25);
    this.stand("batter", BbActorPlacement.facing(batterSpot, BbFieldSpace.toWorld(0, 0.25)), new BbBatStancePose(this.metrics));
  }

  protected pitchAndSwing(u: number, v: number): { contactAt: number; contactPoint: BbVec; swingEndsAt: number } {
    const pitch = new BbPitchPose(this.metrics), releaseAt = BbDrill.WINDUP_AT + pitch.keyTime;
    this.hold("pitcher", "throw", 0);
    this.pose("pitcher", pitch, BbDrill.WINDUP_AT, releaseAt, "투구");
    const releasePoint = this.handWorld("pitcher", "throw", releaseAt), contactPoint = BbStrikeZoneBox.pointAt(u, v), contactAt = releaseAt + BbDrill.PITCH_FLIGHT;
    this.fly(new BbPitchFlight(releasePoint, contactPoint, BbDrill.PITCH_FLIGHT, new BbVec(0, -0.12, 0)), releaseAt, 30);
    this.check("투구 릴리스", "release", releaseAt, "pitcher", releasePoint);
    this.pose("batter", new BbBatLoadPose(this.metrics), releaseAt + 0.3, null, "로드");
    const local = this.canonical("batter", this.script.placementOf("batter", contactAt).toLocal(contactPoint));
    const swing = new BbBatSwingPose(this.metrics, local, "full");
    const swingAt = this.synced("batter", swing, contactAt, "스윙 접촉");
    this.check("스윙 접촉", "contact", contactAt, "batter", contactPoint);
    return { contactAt, contactPoint, swingEndsAt: swingAt + swing.duration };
  }

  protected pitcherWatches(spot: BbVec, contactAt: number): void {
    this.face("pitcher", spot, contactAt + 0.12);
    this.pose("pitcher", new BbReadyPose(this.metrics, 0.2), contactAt + 0.12, null, "타구 보기");
  }

  protected batterRunsToFirst(leaveAt: number, contactAt: number, overrun: boolean): number {
    const arriveAt = contactAt + 4.1;
    const bag = BbFieldGeometry.FIRST.plus(new BbVec(0.25, 0, 0.1));
    this.move("batter", bag, leaveAt, arriveAt);
    this.check("타자 주자 1루 도달", "touch", arriveAt, "batter", bag);
    if (overrun) this.move("batter", BbFieldSpace.toWorld(22.9, 23.2), arriveAt, arriveAt + 1.1, "slide");
    return arriveAt;
  }
}

class BbLineDriveDrill extends BbDrill {
  readonly title = "① 투구 → 스윙 → 안타";
  readonly duration = 10.5;

  protected compose(): void {
    const { contactAt, contactPoint, swingEndsAt } = this.pitchAndSwing(0.1, -0.15);
    const landing = BbFieldSpace.toWorld(-20, 60, BbThrowTrajectory.BALL_RADIUS), landAt = contactAt + 2.5;
    this.fly(new BbBattedFlight(contactPoint, landing, 2.5, 8.5), contactAt, 20);
    const fieldSpot = BbFieldSpace.toWorld(-25, 71.5), pickAt = landAt + 1.25;
    this.pitcherWatches(landing, contactAt);
    this.move("left", fieldSpot, contactAt + 0.35, pickAt - 0.45);
    this.face("left", landing, pickAt - 0.45);
    const glove = this.gloveWorld("left", pickAt, BbDrill.GROUND_GLOVE);
    this.fly(new BbGroundRoll(landing, glove, 1.25, 3, 0.9), landAt, 18);
    this.catchWith("left", "ground", BbDrill.GROUND_GLOVE, pickAt, "좌익수 포구");
    this.move("second", BbFieldGeometry.SECOND.plus(new BbVec(0.3, 0, 0.3)), contactAt + 0.4, contactAt + 2.4);
    this.face("second", fieldSpot, contactAt + 2.4);
    this.move("short", BbFieldSpace.toWorld(-11, 50), contactAt + 0.4, contactAt + 3.2);
    this.face("short", fieldSpot, contactAt + 3.2);
    const target = this.gloveWorld("second", pickAt + 1, BbDrill.CHEST_GLOVE);
    const thrown = this.throwFrom("left", pickAt + BbDrill.THROW_AFTER_CATCH, target, BbThrowTrajectory.OUTFIELD_SPEED, true, "좌익수 송구");
    this.catchWith("second", "chest", BbDrill.CHEST_GLOVE, thrown.arriveAt, "2루 포구");
    this.batterRunsToFirst(swingEndsAt - 0.15, contactAt, false);
    this.face("batter", BbFieldGeometry.SECOND, contactAt + 4.2);
  }
}

class BbGroundOutDrill extends BbDrill {
  readonly title = "② 땅볼 → 유격수 → 1루 아웃";
  readonly duration = 10;

  protected compose(): void {
    const { contactAt, contactPoint, swingEndsAt } = this.pitchAndSwing(-0.2, -0.6);
    const fieldedAt = contactAt + 1.45, spot = BbFieldSpace.toWorld(-7.5, 28);
    this.pitcherWatches(spot, contactAt);
    this.move("short", spot, contactAt + 0.28, fieldedAt - 0.4);
    this.face("short", contactPoint.flat(), fieldedAt - 0.4);
    const glove = this.gloveWorld("short", fieldedAt, BbDrill.GROUND_GLOVE);
    this.fly(new BbGroundRoll(contactPoint, glove, 1.45, 5, 0.45), contactAt, 26);
    this.catchWith("short", "ground", BbDrill.GROUND_GLOVE, fieldedAt, "유격수 땅볼 포구");
    const baseSpot = BbFieldGeometry.FIRST.plus(new BbVec(-0.35, 0, 0.1));
    this.move("first", baseSpot, contactAt + 0.3, contactAt + 1.5);
    this.face("first", spot, contactAt + 1.5);
    const stretchGlove = new BbVec(0.06, 0.68, 0.5);
    const target = this.gloveWorld("first", fieldedAt + 1, stretchGlove);
    const thrown = this.throwFrom("short", fieldedAt + BbDrill.THROW_AFTER_CATCH, target, BbThrowTrajectory.INFIELD_SPEED, false, "유격수 1루 송구");
    this.catchWith("first", "stretch", stretchGlove, thrown.arriveAt, "1루수 포구");
    this.move("right", BbFieldSpace.toWorld(27, 14), contactAt + 0.3, contactAt + 5.4);
    this.move("catcher", BbFieldSpace.toWorld(14, 4), contactAt + 0.5, contactAt + 3.6);
    const arriveAt = this.batterRunsToFirst(swingEndsAt - 0.15, contactAt, true);
    this.face("batter", BbFieldGeometry.HOME, arriveAt + 1.2);
  }
}

class BbSacrificeFlyDrill extends BbDrill {
  readonly title = "③ 플라이 · 리터치 · 태그업 · 중계 · 홈 슬라이딩";
  readonly duration = 14;

  protected compose(): void {
    const third = BbFieldGeometry.THIRD, home = BbFieldGeometry.HOME;
    this.stand("runner", BbActorPlacement.facing(third.plus(new BbVec(0.2, 0, 0.2)), home), null);
    const { contactAt, contactPoint, swingEndsAt } = this.pitchAndSwing(0, 0.35);
    const hang = 4.6, catchAt = contactAt + hang, spot = BbFieldSpace.toWorld(7, 73.6);
    this.pitcherWatches(spot, contactAt);
    this.move("center", spot, contactAt + 0.45, catchAt - 1.3);
    this.face("center", home, catchAt - 1.3);
    const glove = this.gloveWorld("center", catchAt, BbDrill.FLY_GLOVE);
    this.fly(new BbBattedFlight(contactPoint, glove, hang, 31), contactAt, 16);
    this.catchWith("center", "fly", BbDrill.FLY_GLOVE, catchAt, "중견수 플라이 포구");

    const lead = third.lerp(home, 0.11);
    this.move("runner", lead, contactAt + 0.5, contactAt + 1.5, "walk");
    this.move("runner", third.plus(new BbVec(0.2, 0, 0.2)), contactAt + 2.2, contactAt + 3.3, "walk");
    this.face("runner", spot, contactAt + 3.3);
    const slideFrom = home.lerp(third, 0.115), slideSeconds = 0.75, leaveAt = catchAt + 0.1, slideAt = leaveAt + 2.75;
    this.move("runner", slideFrom, leaveAt, slideAt);
    this.move("runner", home.plus(new BbVec(-0.3, 0, -0.1)), slideAt, slideAt + slideSeconds, "slide");
    this.synced("runner", new BbSlidePose(this.metrics, slideSeconds), slideAt + slideSeconds, "홈 슬라이딩");
    this.check("주자 홈 도달", "touch", slideAt + slideSeconds, "runner", home.plus(new BbVec(-0.3, 0, -0.1)));

    const relaySpot = BbFieldSpace.toWorld(3.4, 43);
    this.move("second", relaySpot, contactAt + 0.5, contactAt + 3.4);
    this.face("second", spot, contactAt + 3.4);
    this.move("short", BbFieldGeometry.SECOND.plus(new BbVec(-0.3, 0, 0.2)), contactAt + 0.5, contactAt + 2.6);
    this.face("short", spot, contactAt + 2.6);
    this.move("first", BbFieldSpace.toWorld(1.6, 21.5), contactAt + 0.6, contactAt + 3.2);
    this.face("first", spot, contactAt + 3.2);
    this.move("third", third.plus(new BbVec(-0.4, 0, 0)), contactAt + 0.5, contactAt + 1.6);
    this.face("third", home, contactAt + 1.6);
    this.move("pitcher", BbFieldSpace.toWorld(-3.5, -9), contactAt + 0.8, contactAt + 5.4);
    this.face("pitcher", relaySpot, contactAt + 5.4);
    this.move("left", BbFieldSpace.toWorld(-20, 76), contactAt + 0.5, contactAt + 4.2);
    this.move("right", BbFieldSpace.toWorld(22, 78), contactAt + 0.5, contactAt + 4);

    const relayGlove = this.gloveWorld("second", catchAt + 1, BbDrill.CHEST_GLOVE);
    const first = this.throwFrom("center", catchAt + BbDrill.THROW_AFTER_CATCH, relayGlove, BbThrowTrajectory.OUTFIELD_SPEED, true, "중견수 중계 송구");
    this.catchWith("second", "chest", BbDrill.CHEST_GLOVE, first.arriveAt, "중계 포구");
    this.move("catcher", BbFieldSpace.toWorld(0.35, 0.75), contactAt + 1, contactAt + 2, "walk");
    this.face("catcher", relaySpot, contactAt + 2);
    this.pose("catcher", new BbReadyPose(this.metrics, 0.5), contactAt + 1, null, "홈 대기");
    const homeGlove = new BbVec(0.1, 0.5, 0.4), plateGlove = this.gloveWorld("catcher", first.arriveAt + 1, homeGlove);
    const second = this.throwFrom("second", first.arriveAt + BbDrill.THROW_AFTER_CATCH, plateGlove, BbThrowTrajectory.INFIELD_SPEED, false, "중계수 홈 송구");
    this.catchWith("catcher", "chest", homeGlove, second.arriveAt, "포수 포구");
    this.move("batter", BbFieldSpace.toWorld(11, 11.5), swingEndsAt - 0.15, contactAt + 2.4);
    this.face("batter", spot, contactAt + 2.4);
  }
}

class BbDrillCatalog {
  static all(): BbDrill[] { return [new BbLineDriveDrill(), new BbGroundOutDrill(), new BbSacrificeFlyDrill()]; }
}
