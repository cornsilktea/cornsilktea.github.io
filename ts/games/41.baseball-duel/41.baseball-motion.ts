class BbVec {
  static readonly ZERO = new BbVec(0, 0, 0);
  static readonly UP = new BbVec(0, 1, 0);

  constructor(readonly x: number, readonly y: number, readonly z: number) {}

  plus(other: BbVec): BbVec { return new BbVec(this.x + other.x, this.y + other.y, this.z + other.z); }
  minus(other: BbVec): BbVec { return new BbVec(this.x - other.x, this.y - other.y, this.z - other.z); }
  times(factor: number): BbVec { return new BbVec(this.x * factor, this.y * factor, this.z * factor); }
  dot(other: BbVec): number { return this.x * other.x + this.y * other.y + this.z * other.z; }
  length(): number { return Math.sqrt(this.dot(this)); }
  distanceTo(other: BbVec): number { return this.minus(other).length(); }
  flat(): BbVec { return new BbVec(this.x, 0, this.z); }
  mirrored(): BbVec { return new BbVec(-this.x, this.y, this.z); }
  withY(y: number): BbVec { return new BbVec(this.x, y, this.z); }
  lerp(to: BbVec, ratio: number): BbVec { return this.plus(to.minus(this).times(ratio)); }
  unit(): BbVec {
    const size = this.length();
    return size < 1e-9 ? BbVec.UP : this.times(1 / size);
  }
}

class BbCurve {
  static clamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)); }
  static span(value: number, from: number, to: number): number { return BbCurve.clamp((value - from) / (to - from), 0, 1); }
  static smooth(ratio: number): number { return ratio * ratio * (3 - 2 * ratio); }
  static mix(from: number, to: number, ratio: number): number { return from + (to - from) * ratio; }
}

class BbTurn {
  private constructor(private readonly rows: readonly number[]) {}

  static fromAngles(yaw: number, pitch: number, roll: number): BbTurn {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
    return new BbTurn([
      cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
      cx * sz, cx * cz, -sx,
      -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx
    ]);
  }

  then(inner: BbTurn): BbTurn {
    const a = this.rows, b = inner.rows, out: number[] = [];
    for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
      out.push(a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column]);
    }
    return new BbTurn(out);
  }

  apply(point: BbVec): BbVec {
    const m = this.rows;
    return new BbVec(m[0] * point.x + m[1] * point.y + m[2] * point.z, m[3] * point.x + m[4] * point.y + m[5] * point.z, m[6] * point.x + m[7] * point.y + m[8] * point.z);
  }
}

class BbKeyTrack {
  constructor(private readonly times: readonly number[], private readonly points: readonly BbVec[]) {}

  at(seconds: number): BbVec {
    const last = this.times.length - 1;
    if (seconds <= this.times[0]) return this.points[0];
    if (seconds >= this.times[last]) return this.points[last];
    let index = 0;
    while (seconds > this.times[index + 1]) index++;
    const span = this.times[index + 1] - this.times[index], k = (seconds - this.times[index]) / span;
    const k2 = k * k, k3 = k2 * k;
    const from = this.points[index], to = this.points[index + 1];
    return from.times(2 * k3 - 3 * k2 + 1)
      .plus(this.slopeAt(index).times((k3 - 2 * k2 + k) * span))
      .plus(to.times(-2 * k3 + 3 * k2))
      .plus(this.slopeAt(index + 1).times((k3 - k2) * span));
  }

  private slopeAt(index: number): BbVec {
    const before = Math.max(0, index - 1), after = Math.min(this.times.length - 1, index + 1);
    return this.points[after].minus(this.points[before]).times(1 / (this.times[after] - this.times[before]));
  }
}

type BbSide = "left" | "right";

interface BbBodyMetrics {
  hipHeight: number;
  spineLength: number;
  chestLength: number;
  shoulderRise: number;
  shoulderHalfWidth: number;
  armReach: number;
  hipJointHalfWidth: number;
  hipJointRise: number;
  legReach: number;
  ankleHeight: number;
}

class BbBodyDefaults {
  static readonly KAYKIT: BbBodyMetrics = {
    hipHeight: 0.325, spineLength: 0.154, chestLength: 0.3, shoulderRise: 0.107, shoulderHalfWidth: 0.17, armReach: 0.52,
    hipJointHalfWidth: 0.137, hipJointRise: 0.091, legReach: 0.3, ankleHeight: 0.115
  };
  static standingShoulderHeight(metrics: BbBodyMetrics): number {
    return metrics.hipHeight + metrics.spineLength + metrics.chestLength + metrics.shoulderRise;
  }
}

interface BbBatPlacement {
  knob: BbVec;
  axis: BbVec;
}

interface BbPoseFrame {
  hips: BbVec;
  hipsYaw: number;
  hipsPitch: number;
  hipsRoll: number;
  chestYaw: number;
  chestPitch: number;
  chestRoll: number;
  headYaw: number;
  headPitch: number;
  handLeft: BbVec;
  handRight: BbVec;
  footLeft: BbVec;
  footRight: BbVec;
  bat: BbBatPlacement | null;
}

class BbBodyModel {
  constructor(readonly metrics: BbBodyMetrics) {}

  hipsTurn(frame: BbPoseFrame): BbTurn { return BbTurn.fromAngles(frame.hipsYaw, frame.hipsPitch, frame.hipsRoll); }

  chestTurn(frame: BbPoseFrame): BbTurn {
    const half = BbTurn.fromAngles(frame.chestYaw / 2, frame.chestPitch / 2, frame.chestRoll / 2);
    return this.hipsTurn(frame).then(half).then(half);
  }

  chestJoint(frame: BbPoseFrame): BbVec {
    const hipsTurn = this.hipsTurn(frame);
    const half = BbTurn.fromAngles(frame.chestYaw / 2, frame.chestPitch / 2, frame.chestRoll / 2);
    return frame.hips.plus(hipsTurn.apply(new BbVec(0, this.metrics.spineLength, 0))).plus(hipsTurn.then(half).apply(new BbVec(0, this.metrics.chestLength, 0)));
  }

  shoulder(frame: BbPoseFrame, side: BbSide): BbVec {
    const sign = side === "left" ? 1 : -1;
    return this.chestJoint(frame).plus(this.chestTurn(frame).apply(new BbVec(sign * this.metrics.shoulderHalfWidth, this.metrics.shoulderRise, 0)));
  }

  hipJoint(frame: BbPoseFrame, side: BbSide): BbVec {
    const sign = side === "left" ? 1 : -1;
    return frame.hips.plus(this.hipsTurn(frame).apply(new BbVec(sign * this.metrics.hipJointHalfWidth, this.metrics.hipJointRise, 0)));
  }

  armStretch(frame: BbPoseFrame, side: BbSide): number {
    const distance = this.shoulder(frame, side).distanceTo(side === "left" ? frame.handLeft : frame.handRight);
    return distance - this.metrics.armReach;
  }

  legStretch(frame: BbPoseFrame, side: BbSide): number {
    return this.hipJoint(frame, side).distanceTo(side === "left" ? frame.footLeft : frame.footRight) - this.metrics.legReach;
  }
}

class BbPoseSketch {
  private static readonly REACH_USE = 0.96;
  private static readonly LEG_USE = 0.97;
  private readonly raw: BbPoseFrame;
  private readonly body: BbBodyModel;

  get frame(): BbPoseFrame {
    this.raw.footLeft = this.footWithinReach("left", this.raw.footLeft);
    this.raw.footRight = this.footWithinReach("right", this.raw.footRight);
    return this.raw;
  }

  private footWithinReach(side: BbSide, foot: BbVec): BbVec {
    const joint = this.body.hipJoint(this.raw, side), gap = foot.minus(joint), allowed = this.metrics.legReach * BbPoseSketch.LEG_USE;
    return gap.length() <= allowed ? foot : joint.plus(gap.times(allowed / gap.length()));
  }

  constructor(private readonly metrics: BbBodyMetrics) {
    this.body = new BbBodyModel(metrics);
    this.raw = {
      hips: new BbVec(0, metrics.hipHeight, 0), hipsYaw: 0, hipsPitch: 0, hipsRoll: 0, chestYaw: 0, chestPitch: 0, chestRoll: 0, headYaw: 0, headPitch: 0,
      handLeft: BbVec.ZERO, handRight: BbVec.ZERO,
      footLeft: new BbVec(0.12, metrics.ankleHeight, 0), footRight: new BbVec(-0.12, metrics.ankleHeight, 0), bat: null
    };
    this.handFromShoulder("left", new BbVec(0.06, -0.36, 0.08)).handFromShoulder("right", new BbVec(-0.06, -0.36, 0.08));
  }

  hips(position: BbVec, yaw = 0, pitch = 0, roll = 0): this {
    this.raw.hips = position; this.raw.hipsYaw = yaw; this.raw.hipsPitch = pitch; this.raw.hipsRoll = roll;
    return this;
  }

  chest(yaw: number, pitch: number, roll = 0): this {
    this.raw.chestYaw = yaw; this.raw.chestPitch = pitch; this.raw.chestRoll = roll;
    return this;
  }

  head(yaw: number, pitch: number): this {
    this.raw.headYaw = BbCurve.clamp(yaw, -1.25, 1.25); this.raw.headPitch = BbCurve.clamp(pitch, -0.8, 0.8);
    return this;
  }

  headFacing(actorYaw: number, pitch = 0): this {
    return this.head(actorYaw - this.raw.hipsYaw - this.raw.chestYaw, pitch - this.raw.hipsPitch - this.raw.chestPitch);
  }

  feet(left: BbVec, right: BbVec): this {
    this.raw.footLeft = left; this.raw.footRight = right;
    return this;
  }

  handAt(side: BbSide, point: BbVec): this {
    if (side === "left") this.raw.handLeft = point; else this.raw.handRight = point;
    return this;
  }

  handFromShoulder(side: BbSide, offsetInChest: BbVec): this {
    return this.handAt(side, this.body.shoulder(this.raw, side).plus(this.body.chestTurn(this.raw).apply(offsetInChest)));
  }

  reachWith(side: BbSide, point: BbVec): this {
    const allowed = this.metrics.armReach * BbPoseSketch.REACH_USE;
    for (let round = 0; round < 4; round++) {
      const shoulder = this.body.shoulder(this.raw, side), gap = point.minus(shoulder);
      const excess = gap.length() - allowed;
      if (excess <= 0) break;
      const flat = gap.flat(), flatLength = flat.length();
      if (flatLength > 0.02) this.raw.hips = this.raw.hips.plus(flat.times(Math.min(excess, flatLength) / flatLength));
      else this.raw.hips = this.raw.hips.plus(new BbVec(0, Math.sign(gap.y) * excess, 0));
    }
    return this.handAt(side, point);
  }

  holdBat(knob: BbVec, axis: BbVec): this {
    const direction = axis.unit();
    this.raw.bat = { knob, axis: direction };
    return this.handAt("left", knob.plus(direction.times(BbBatShape.BOTTOM_HAND_AT))).handAt("right", knob.plus(direction.times(BbBatShape.TOP_HAND_AT)));
  }
}

class BbHandednessMirror {
  static point(point: BbVec, mirrored: boolean): BbVec { return mirrored ? point.mirrored() : point; }

  static frame(frame: BbPoseFrame, mirrored: boolean): BbPoseFrame {
    if (!mirrored) return frame;
    return {
      hips: frame.hips.mirrored(), hipsYaw: -frame.hipsYaw, hipsPitch: frame.hipsPitch, hipsRoll: -frame.hipsRoll,
      chestYaw: -frame.chestYaw, chestPitch: frame.chestPitch, chestRoll: -frame.chestRoll, headYaw: -frame.headYaw, headPitch: frame.headPitch,
      handLeft: frame.handRight.mirrored(), handRight: frame.handLeft.mirrored(), footLeft: frame.footRight.mirrored(), footRight: frame.footLeft.mirrored(),
      bat: frame.bat ? { knob: frame.bat.knob.mirrored(), axis: frame.bat.axis.mirrored() } : null
    };
  }

  static side(side: BbSide, mirrored: boolean): BbSide {
    if (!mirrored) return side;
    return side === "left" ? "right" : "left";
  }
}

class BbBatShape {
  static readonly LENGTH = 0.86;
  static readonly SWEET_SPOT_AT = 0.66;
  static readonly BOTTOM_HAND_AT = 0.055;
  static readonly TOP_HAND_AT = 0.15;
  static readonly GRIP_CENTER_AT = 0.1;
  static readonly HANDLE_TAPE_END = 0.27;
  static readonly PROFILE: ReadonlyArray<readonly [radius: number, along: number]> = [
    [0, 0], [0.019, 0.002], [0.021, 0.012], [0.0135, 0.03], [0.0125, 0.12], [0.013, 0.27], [0.0155, 0.38], [0.021, 0.48],
    [0.0275, 0.57], [0.0315, 0.65], [0.0325, 0.72], [0.0325, 0.81], [0.03, 0.845], [0.02, 0.858], [0, 0.86]
  ];
}

abstract class BbActionPose {
  abstract readonly duration: number;
  abstract readonly keyTime: number;
  abstract frameAt(seconds: number): BbPoseFrame;
}

class BbActionSync {
  static readonly FRAME_SECONDS = 1 / 60;
  static startFor(eventTime: number, pose: BbActionPose): number { return eventTime - pose.keyTime; }
  static keyError(startAt: number, pose: BbActionPose, eventTime: number): number { return startAt + pose.keyTime - eventTime; }
}

class BbReadyPose extends BbActionPose {
  readonly duration = Infinity;
  readonly keyTime = 0;
  constructor(private readonly metrics: BbBodyMetrics, private readonly depth: number) { super(); }

  frameAt(seconds: number): BbPoseFrame {
    const m = this.metrics, sway = Math.sin(seconds * 2.2) * 0.008, deep = this.depth;
    const sketch = new BbPoseSketch(m)
      .hips(new BbVec(sway, m.hipHeight - 0.05 - 0.09 * deep, -0.02), 0, 0.22 + 0.2 * deep)
      .chest(0, 0.2 + 0.15 * deep)
      .feet(new BbVec(0.17 + 0.05 * deep, m.ankleHeight, 0.02), new BbVec(-0.17 - 0.05 * deep, m.ankleHeight, 0.02));
    sketch.headFacing(0, 0.05);
    return sketch.handFromShoulder("left", new BbVec(0.02, -0.34, 0.2)).handFromShoulder("right", new BbVec(-0.02, -0.34, 0.2)).frame;
  }
}

class BbCatcherCrouchPose extends BbActionPose {
  readonly duration = Infinity;
  readonly keyTime = 0;
  constructor(private readonly metrics: BbBodyMetrics, private readonly target: BbVec) { super(); }

  frameAt(seconds: number): BbPoseFrame {
    const m = this.metrics;
    const sketch = new BbPoseSketch(m)
      .hips(new BbVec(0, 0.19 + Math.sin(seconds * 1.7) * 0.004, -0.06), 0, 0.12)
      .chest(0, 0.18)
      .feet(new BbVec(0.2, m.ankleHeight, 0.06), new BbVec(-0.2, m.ankleHeight, 0.06));
    sketch.headFacing(0, 0);
    return sketch.handFromShoulder("right", new BbVec(-0.04, -0.3, -0.06)).reachWith("left", this.target).frame;
  }
}

class BbBatStance {
  static readonly FRONT_FOOT_X = 0.2;
  static readonly STRIDE_FOOT_X = 0.25;

  static stance(metrics: BbBodyMetrics, seconds: number): BbPoseSketch {
    const shoulder = BbBodyDefaults.standingShoulderHeight(metrics), waggle = Math.sin(seconds * 3.1) * 0.05;
    const sketch = new BbPoseSketch(metrics)
      .hips(new BbVec(0, metrics.hipHeight - 0.035, 0), -0.1, 0.06)
      .chest(-0.45, 0.1)
      .feet(new BbVec(BbBatStance.FRONT_FOOT_X, metrics.ankleHeight, 0), new BbVec(-0.2, metrics.ankleHeight, 0));
    sketch.headFacing(1.05, 0.05);
    const axis = new BbVec(-0.3 + waggle, 0.9, 0.16 - waggle * 0.5);
    return sketch.holdBat(new BbVec(-0.27, shoulder - 0.05, 0.38).minus(axis.unit().times(BbBatShape.GRIP_CENTER_AT)), axis);
  }

  static loaded(metrics: BbBodyMetrics, liftRatio: number): BbPoseSketch {
    const shoulder = BbBodyDefaults.standingShoulderHeight(metrics), lift = Math.sin(liftRatio * Math.PI) * 0.07;
    const frontX = BbCurve.mix(BbBatStance.FRONT_FOOT_X, BbBatStance.STRIDE_FOOT_X, BbCurve.smooth(liftRatio));
    const sketch = new BbPoseSketch(metrics)
      .hips(new BbVec(-0.05, metrics.hipHeight - 0.045, 0), -0.3, 0.06)
      .chest(-0.45, 0.12)
      .feet(new BbVec(frontX, metrics.ankleHeight + lift, 0), new BbVec(-0.2, metrics.ankleHeight, 0));
    sketch.headFacing(1.05, 0.05);
    const axis = new BbVec(-0.5, 0.8, 0.08);
    return sketch.holdBat(new BbVec(-0.34, shoulder - 0.04, 0.34).minus(axis.unit().times(BbBatShape.GRIP_CENTER_AT)), axis);
  }

  static blend(from: BbPoseFrame, to: BbPoseFrame, ratio: number): BbPoseFrame {
    const mix = (a: number, b: number) => BbCurve.mix(a, b, ratio);
    return {
      hips: from.hips.lerp(to.hips, ratio), hipsYaw: mix(from.hipsYaw, to.hipsYaw), hipsPitch: mix(from.hipsPitch, to.hipsPitch), hipsRoll: mix(from.hipsRoll, to.hipsRoll),
      chestYaw: mix(from.chestYaw, to.chestYaw), chestPitch: mix(from.chestPitch, to.chestPitch), chestRoll: mix(from.chestRoll, to.chestRoll),
      headYaw: mix(from.headYaw, to.headYaw), headPitch: mix(from.headPitch, to.headPitch),
      handLeft: from.handLeft.lerp(to.handLeft, ratio), handRight: from.handRight.lerp(to.handRight, ratio),
      footLeft: from.footLeft.lerp(to.footLeft, ratio), footRight: from.footRight.lerp(to.footRight, ratio),
      bat: from.bat && to.bat ? { knob: from.bat.knob.lerp(to.bat.knob, ratio), axis: from.bat.axis.lerp(to.bat.axis, ratio).unit() } : to.bat
    };
  }
}

class BbBatStancePose extends BbActionPose {
  readonly duration = Infinity;
  readonly keyTime = 0;
  constructor(private readonly metrics: BbBodyMetrics) { super(); }
  frameAt(seconds: number): BbPoseFrame { return BbBatStance.stance(this.metrics, seconds).frame; }
}

class BbBatLoadPose extends BbActionPose {
  static readonly LOAD_SECONDS = 0.35;
  static readonly HOLD_SECONDS = 1.6;
  readonly duration = BbBatLoadPose.LOAD_SECONDS + BbBatLoadPose.HOLD_SECONDS;
  readonly keyTime = BbBatLoadPose.LOAD_SECONDS;
  constructor(private readonly metrics: BbBodyMetrics) { super(); }

  frameAt(seconds: number): BbPoseFrame {
    const ratio = BbCurve.span(seconds, 0, BbBatLoadPose.LOAD_SECONDS);
    return BbBatStance.blend(BbBatStance.stance(this.metrics, 0).frame, BbBatStance.loaded(this.metrics, ratio).frame, BbCurve.smooth(ratio));
  }
}

type BbSwingStyle = "full" | "weak";

class BbBatSwingPose extends BbActionPose {
  static readonly SWING_DELAY = 0.12;
  static readonly FOLLOW_SECONDS = 0.43;
  private static readonly TIMES: readonly number[] = [0, 0.06, 0.12, 0.22, 0.36, 0.55];

  readonly duration = BbBatSwingPose.SWING_DELAY + BbBatSwingPose.FOLLOW_SECONDS;
  readonly keyTime = BbBatSwingPose.SWING_DELAY;
  private readonly hipsTrack: BbKeyTrack;
  private readonly turnTrack: BbKeyTrack;
  private readonly gripTrack: BbKeyTrack;
  private readonly axisTrack: BbKeyTrack;
  private readonly backFootTrack: BbKeyTrack;

  constructor(private readonly metrics: BbBodyMetrics, readonly contactPoint: BbVec, style: BbSwingStyle) {
    super();
    const m = metrics, shoulder = BbBodyDefaults.standingShoulderHeight(m), times = BbBatSwingPose.TIMES;
    const finish = style === "full" ? 1 : 0.55;
    const loaded = BbBatStance.loaded(m, 1).frame, loadedBat = loaded.bat as BbBatPlacement;
    const crouch = BbCurve.clamp((0.62 - contactPoint.y) * 0.35, -0.03, 0.09);
    const farReach = BbCurve.clamp(contactPoint.z - 0.92, -0.12, 0.3);
    const hipsAtContact = new BbVec(0.05, m.hipHeight - 0.05 - crouch, farReach * 0.8);
    const contactTurn = new BbVec(0.85, 0, 0.2 + crouch * 2 + Math.max(0, farReach) * 1.5);
    this.hipsTrack = new BbKeyTrack(times, [
      loaded.hips, new BbVec(0.01, m.hipHeight - 0.05 - crouch * 0.6, farReach * 0.3), hipsAtContact,
      hipsAtContact.plus(new BbVec(0.02, 0, 0)), new BbVec(0.08, m.hipHeight - 0.04, farReach * 0.3), new BbVec(0.08, m.hipHeight - 0.035, 0)
    ]);
    this.turnTrack = new BbKeyTrack(times, [
      new BbVec(loaded.hipsYaw, loaded.chestYaw, loaded.chestPitch), new BbVec(0.25, -0.3, 0.16), contactTurn,
      new BbVec(BbCurve.mix(0.85, 1.2, finish), 0.25 * finish, 0.15), new BbVec(BbCurve.mix(0.85, 1.4, finish), 0.45 * finish, 0.08), new BbVec(BbCurve.mix(0.85, 1.45, finish), 0.5 * finish, 0.05)
    ]);
    const contactBody = new BbPoseSketch(m).hips(hipsAtContact, contactTurn.x, 0.06).chest(contactTurn.y, contactTurn.z).frame;
    const body = new BbBodyModel(m);
    const between = body.shoulder(contactBody, "left").lerp(body.shoulder(contactBody, "right"), 0.5);
    const toward = contactPoint.minus(between).flat().unit();
    const wantedGrip = between.plus(toward.times(0.33)).withY(BbCurve.mix(between.y - 0.17, contactPoint.y + 0.05, 0.6));
    const contactAxis = contactPoint.minus(wantedGrip).unit();
    const contactGrip = contactPoint.minus(contactAxis.times(BbBatShape.SWEET_SPOT_AT - BbBatShape.GRIP_CENTER_AT));
    const loadedGrip = loadedBat.knob.plus(loadedBat.axis.times(BbBatShape.GRIP_CENTER_AT));
    this.gripTrack = new BbKeyTrack(times, [
      loadedGrip, new BbVec(-0.1, shoulder - 0.17, 0.24).lerp(contactGrip, 0.35), contactGrip,
      contactGrip.lerp(new BbVec(0.2, shoulder - 0.12, 0.27), finish), contactGrip.lerp(new BbVec(0.3, shoulder - 0.02, 0.02), finish), contactGrip.lerp(new BbVec(0.28, shoulder + 0.02, -0.06), finish)
    ]);
    this.axisTrack = new BbKeyTrack(times, [
      loadedBat.axis, new BbVec(-0.88, 0.22, 0.12).unit(), contactAxis,
      contactAxis.lerp(new BbVec(0.9, 0.08, 0.35), finish).unit(), contactAxis.lerp(new BbVec(0.3, 0.55, -0.75), finish).unit(), contactAxis.lerp(new BbVec(-0.35, 0.75, -0.55), finish).unit()
    ]);
    const backFoot = new BbVec(-0.2, m.ankleHeight, 0);
    this.backFootTrack = new BbKeyTrack(times, [backFoot, backFoot, new BbVec(-0.16, m.ankleHeight + 0.03, 0.02), new BbVec(-0.14, m.ankleHeight + 0.04, 0.03), new BbVec(-0.13, m.ankleHeight + 0.04, 0.03), new BbVec(-0.13, m.ankleHeight + 0.03, 0.03)]);
  }

  frameAt(seconds: number): BbPoseFrame {
    const time = BbCurve.clamp(seconds, 0, this.duration), turn = this.turnTrack.at(time), axis = this.axisTrack.at(time).unit();
    const sketch = new BbPoseSketch(this.metrics)
      .hips(this.hipsTrack.at(time), turn.x, 0.06)
      .chest(turn.y, turn.z)
      .feet(new BbVec(BbBatStance.STRIDE_FOOT_X, this.metrics.ankleHeight, 0), this.backFootTrack.at(time));
    sketch.headFacing(BbCurve.mix(1.05, 0.5, BbCurve.span(time, 0.04, 0.14)), 0.2);
    return sketch.holdBat(this.gripTrack.at(time).minus(axis.times(BbBatShape.GRIP_CENTER_AT)), axis).frame;
  }

  sweetSpotAt(seconds: number): BbVec {
    const bat = this.frameAt(seconds).bat as BbBatPlacement;
    return bat.knob.plus(bat.axis.times(BbBatShape.SWEET_SPOT_AT));
  }
}

class BbArmSwingKeys {
  constructor(readonly times: readonly number[], readonly hips: readonly BbVec[], readonly turns: readonly BbVec[], readonly leftFoot: readonly BbVec[], readonly rightFoot: readonly BbVec[], readonly throwHand: readonly BbVec[], readonly gloveHand: readonly BbVec[]) {}
}

abstract class BbThrowingPose extends BbActionPose {
  private readonly hipsTrack: BbKeyTrack;
  private readonly turnTrack: BbKeyTrack;
  private readonly leftFootTrack: BbKeyTrack;
  private readonly rightFootTrack: BbKeyTrack;
  private readonly throwHandTrack: BbKeyTrack;
  private readonly gloveHandTrack: BbKeyTrack;
  readonly duration: number;

  constructor(protected readonly metrics: BbBodyMetrics, keys: BbArmSwingKeys) {
    super();
    this.duration = keys.times[keys.times.length - 1];
    this.hipsTrack = new BbKeyTrack(keys.times, keys.hips);
    this.turnTrack = new BbKeyTrack(keys.times, keys.turns);
    this.leftFootTrack = new BbKeyTrack(keys.times, keys.leftFoot);
    this.rightFootTrack = new BbKeyTrack(keys.times, keys.rightFoot);
    this.throwHandTrack = new BbKeyTrack(keys.times, keys.throwHand);
    this.gloveHandTrack = new BbKeyTrack(keys.times, keys.gloveHand);
  }

  frameAt(seconds: number): BbPoseFrame {
    const time = BbCurve.clamp(seconds, 0, this.duration), turn = this.turnTrack.at(time);
    const sketch = new BbPoseSketch(this.metrics).hips(this.hipsTrack.at(time), turn.x, 0.04).chest(turn.y, turn.z).feet(this.leftFootTrack.at(time), this.rightFootTrack.at(time));
    sketch.headFacing(0, 0.05);
    return sketch.handFromShoulder("right", this.throwHandTrack.at(time)).handFromShoulder("left", this.gloveHandTrack.at(time)).frame;
  }

  releaseHand(): BbVec { return this.frameAt(this.keyTime).handRight; }
}

class BbPitchPose extends BbThrowingPose {
  static readonly WINDUP_SECONDS = 0.9;
  readonly keyTime = BbPitchPose.WINDUP_SECONDS;

  constructor(metrics: BbBodyMetrics) {
    const h = metrics.hipHeight, a = metrics.ankleHeight;
    super(metrics, new BbArmSwingKeys(
      [0, 0.3, 0.55, 0.75, 0.9, 1.1, 1.4],
      [new BbVec(0, h, 0), new BbVec(-0.02, h, -0.03), new BbVec(0, h - 0.05, 0.12), new BbVec(0, h - 0.09, 0.26), new BbVec(0.02, h - 0.1, 0.36), new BbVec(0.04, h - 0.1, 0.42), new BbVec(0, h - 0.04, 0.4)],
      [new BbVec(0, 0, 0), new BbVec(-1.3, -0.15, -0.05), new BbVec(-1.35, -0.25, 0), new BbVec(-0.7, -0.45, 0.05), new BbVec(0.15, 0.25, 0.45), new BbVec(0.5, 0.45, 0.8), new BbVec(0.1, 0, 0.25)],
      [new BbVec(0.1, a, 0), new BbVec(0.02, 0.33, 0.1), new BbVec(0.05, 0.2, 0.3), new BbVec(0.06, a, 0.5), new BbVec(0.06, a, 0.5), new BbVec(0.06, a, 0.5), new BbVec(0.14, a, 0.45)],
      [new BbVec(-0.1, a, 0), new BbVec(-0.1, a, 0), new BbVec(-0.1, a, 0), new BbVec(-0.1, a + 0.02, 0.02), new BbVec(-0.1, a + 0.06, 0.13), new BbVec(-0.14, 0.2, 0.32), new BbVec(-0.14, a, 0.42)],
      [new BbVec(0.14, -0.14, 0.24), new BbVec(0.14, -0.08, 0.24), new BbVec(-0.1, -0.3, -0.28), new BbVec(-0.2, 0.3, -0.25), new BbVec(-0.12, 0.36, 0.33), new BbVec(0.25, -0.3, 0.3), new BbVec(-0.04, -0.28, 0.24)],
      [new BbVec(-0.14, -0.14, 0.24), new BbVec(-0.14, -0.08, 0.24), new BbVec(0.38, 0.02, 0.1), new BbVec(0.3, -0.1, 0.15), new BbVec(0.1, -0.2, 0.12), new BbVec(0.05, -0.2, 0.05), new BbVec(0.04, -0.28, 0.24)]
    ));
  }
}

class BbFieldThrowPose extends BbThrowingPose {
  static readonly RELEASE_SECONDS = 0.28;
  static readonly CROW_HOP_SECONDS = 0.2;
  readonly keyTime: number;

  constructor(metrics: BbBodyMetrics, crowHop: boolean) {
    const h = metrics.hipHeight, a = metrics.ankleHeight, lead = crowHop ? BbFieldThrowPose.CROW_HOP_SECONDS : 0;
    const times = [0, 0.12, 0.28, 0.42, 0.6].map((time) => time + lead);
    const hips = [new BbVec(0, h - 0.04, 0), new BbVec(0, h - 0.07, 0.08), new BbVec(0.02, h - 0.08, 0.18), new BbVec(0.03, h - 0.08, 0.22), new BbVec(0, h - 0.04, 0.22)];
    const turns = [new BbVec(-0.9, -0.2, 0.05), new BbVec(-0.7, -0.4, 0.05), new BbVec(0.15, 0.25, 0.4), new BbVec(0.45, 0.4, 0.6), new BbVec(0.1, 0, 0.2)];
    const leftFoot = [new BbVec(0.08, a + 0.05, 0.12), new BbVec(0.06, a, 0.3), new BbVec(0.06, a, 0.3), new BbVec(0.06, a, 0.3), new BbVec(0.12, a, 0.28)];
    const rightFoot = [new BbVec(-0.1, a, -0.04), new BbVec(-0.1, a + 0.02, -0.02), new BbVec(-0.1, a + 0.05, 0.02), new BbVec(-0.13, 0.17, 0.16), new BbVec(-0.13, a, 0.24)];
    const throwHand = [new BbVec(0.05, -0.12, 0.16), new BbVec(-0.2, 0.28, -0.22), new BbVec(-0.12, 0.36, 0.33), new BbVec(0.22, -0.28, 0.28), new BbVec(-0.04, -0.3, 0.2)];
    const gloveHand = [new BbVec(-0.05, -0.12, 0.2), new BbVec(0.36, 0, 0.1), new BbVec(0.1, -0.2, 0.12), new BbVec(0.05, -0.2, 0.05), new BbVec(0.04, -0.3, 0.2)];
    if (crowHop) {
      times.unshift(0);
      hips.unshift(new BbVec(0, h + 0.05, -0.14));
      turns.unshift(new BbVec(-0.4, -0.1, 0.1));
      leftFoot.unshift(new BbVec(0.1, a + 0.08, -0.06));
      rightFoot.unshift(new BbVec(-0.1, a + 0.1, -0.16));
      throwHand.unshift(new BbVec(0.1, -0.16, 0.2));
      gloveHand.unshift(new BbVec(-0.1, -0.16, 0.2));
    }
    super(metrics, new BbArmSwingKeys(times, hips, turns, leftFoot, rightFoot, throwHand, gloveHand));
    this.keyTime = BbFieldThrowPose.RELEASE_SECONDS + lead;
  }
}

type BbCatchKind = "ground" | "fly" | "chest" | "stretch";

class BbCatchPose extends BbActionPose {
  static readonly LEAD_SECONDS: Readonly<Record<BbCatchKind, number>> = { ground: 0.36, fly: 0.45, chest: 0.25, stretch: 0.32 };
  private static readonly HOLD_SECONDS = 0.18;
  private static readonly SETTLE_SECONDS = 0.3;

  readonly keyTime: number;
  readonly duration: number;
  private readonly ready: BbPoseFrame;
  private readonly caught: BbPoseFrame;
  private readonly settled: BbPoseFrame;

  constructor(private readonly metrics: BbBodyMetrics, readonly kind: BbCatchKind, readonly glovePoint: BbVec) {
    super();
    this.keyTime = BbCatchPose.LEAD_SECONDS[kind];
    this.duration = this.keyTime + BbCatchPose.HOLD_SECONDS + BbCatchPose.SETTLE_SECONDS;
    this.ready = new BbReadyPose(metrics, 0.3).frameAt(0);
    this.caught = this.caughtSketch().frame;
    this.settled = this.settledSketch().frame;
  }

  frameAt(seconds: number): BbPoseFrame {
    if (seconds <= this.keyTime) return BbBatStance.blend(this.ready, this.caught, BbCurve.smooth(BbCurve.span(seconds, 0, this.keyTime * 0.82)));
    const after = seconds - this.keyTime - BbCatchPose.HOLD_SECONDS;
    return BbBatStance.blend(this.caught, this.settled, BbCurve.smooth(BbCurve.span(after, 0, BbCatchPose.SETTLE_SECONDS)));
  }

  private caughtSketch(): BbPoseSketch {
    const m = this.metrics, glove = this.glovePoint, side = BbCurve.clamp(glove.x, -0.2, 0.2);
    const sketch = new BbPoseSketch(m);
    if (this.kind === "ground") {
      sketch.hips(new BbVec(side * 0.5, 0.17, glove.z - 0.43), 0, 0.45).chest(0, 0.85).feet(new BbVec(0.22 + side * 0.5, m.ankleHeight, glove.z - 0.36), new BbVec(-0.22 + side * 0.5, m.ankleHeight, glove.z - 0.4));
      sketch.headFacing(0, 0.5);
      return sketch.reachWith("left", glove).handAt("right", glove.plus(new BbVec(-0.09, 0.09, -0.02)));
    }
    if (this.kind === "fly") {
      sketch.hips(new BbVec(side * 0.4, m.hipHeight - 0.02, glove.z - 0.16), 0, -0.06).chest(0, -0.12).feet(new BbVec(0.14 + side * 0.4, m.ankleHeight, glove.z - 0.1), new BbVec(-0.14 + side * 0.4, m.ankleHeight, glove.z - 0.24));
      sketch.headFacing(0, -0.55);
      return sketch.reachWith("left", glove).handAt("right", glove.plus(new BbVec(-0.1, -0.03, -0.03)));
    }
    if (this.kind === "stretch") {
      const lean = glove.flat().unit();
      sketch.hips(lean.times(0.2).withY(m.hipHeight - 0.11), 0, 0.3).chest(0, 0.3).feet(lean.times(0.4).plus(new BbVec(0.05, m.ankleHeight, 0)), new BbVec(-0.05, m.ankleHeight, -0.03));
      sketch.headFacing(0, 0.05);
      return sketch.reachWith("left", glove).handFromShoulder("right", new BbVec(-0.1, -0.25, -0.12));
    }
    sketch.hips(new BbVec(side * 0.3, m.hipHeight - 0.05, glove.z - 0.34), 0, 0.12).chest(0, 0.12).feet(new BbVec(0.16 + side * 0.3, m.ankleHeight, glove.z - 0.3), new BbVec(-0.16 + side * 0.3, m.ankleHeight, glove.z - 0.38));
    sketch.headFacing(0, 0.05);
    return sketch.reachWith("left", glove).handAt("right", glove.plus(new BbVec(-0.1, 0.02, -0.03)));
  }

  private settledSketch(): BbPoseSketch {
    const m = this.metrics, hips = this.caught.hips;
    const sketch = new BbPoseSketch(m).hips(new BbVec(hips.x, m.hipHeight - 0.05, hips.z), 0, 0.12).chest(0, 0.15).feet(this.caught.footLeft, this.caught.footRight);
    sketch.headFacing(0, 0.05);
    return sketch.handFromShoulder("left", new BbVec(-0.08, -0.16, 0.22)).handFromShoulder("right", new BbVec(0.04, -0.15, 0.2));
  }
}

class BbTagPose extends BbActionPose {
  readonly keyTime = 0.2;
  readonly duration = 0.55;
  private readonly ready: BbPoseFrame;
  private readonly tagging: BbPoseFrame;

  constructor(metrics: BbBodyMetrics, readonly tagPoint: BbVec) {
    super();
    this.ready = new BbReadyPose(metrics, 0.4).frameAt(0);
    const sketch = new BbPoseSketch(metrics).hips(new BbVec(tagPoint.x * 0.4, 0.2, tagPoint.z - 0.4), 0, 0.4).chest(tagPoint.x > 0 ? 0.3 : -0.3, 0.7)
      .feet(new BbVec(0.2 + tagPoint.x * 0.4, metrics.ankleHeight, tagPoint.z - 0.34), new BbVec(-0.2 + tagPoint.x * 0.4, metrics.ankleHeight, tagPoint.z - 0.38));
    sketch.headFacing(0, 0.45);
    this.tagging = sketch.reachWith("left", tagPoint).handAt("right", tagPoint.plus(new BbVec(-0.08, 0.08, -0.02))).frame;
  }

  frameAt(seconds: number): BbPoseFrame {
    if (seconds <= this.keyTime) return BbBatStance.blend(this.ready, this.tagging, BbCurve.smooth(BbCurve.span(seconds, 0, this.keyTime)));
    return BbBatStance.blend(this.tagging, this.ready, BbCurve.smooth(BbCurve.span(seconds, this.keyTime + 0.1, this.duration)));
  }
}

class BbSlidePose extends BbActionPose {
  private static readonly DROP_SECONDS = 0.2;
  private static readonly REST_SECONDS = 0.35;
  readonly keyTime: number;
  readonly duration: number;
  private readonly upright: BbPoseFrame;
  private readonly sliding: BbPoseFrame;

  constructor(metrics: BbBodyMetrics, slideSeconds: number) {
    super();
    this.keyTime = slideSeconds;
    this.duration = slideSeconds + BbSlidePose.REST_SECONDS;
    const m = metrics;
    const up = new BbPoseSketch(m).hips(new BbVec(0, m.hipHeight - 0.03, 0), 0, 0.3).chest(0, 0.15).feet(new BbVec(0.1, m.ankleHeight, 0.14), new BbVec(-0.1, m.ankleHeight + 0.06, -0.16));
    up.headFacing(0, 0);
    this.upright = up.handFromShoulder("left", new BbVec(0.05, -0.2, -0.2)).handFromShoulder("right", new BbVec(-0.05, -0.15, 0.25)).frame;
    const down = new BbPoseSketch(m).hips(new BbVec(0, 0.15, 0), 0, -0.85, 0.18).chest(0, 0.4).feet(new BbVec(0.13, 0.09, 0.04), new BbVec(-0.11, 0.1, 0.19));
    down.headFacing(0, 0.1);
    this.sliding = down.handFromShoulder("left", new BbVec(0.2, 0.22, 0.12)).handFromShoulder("right", new BbVec(-0.16, -0.26, -0.2)).frame;
  }

  frameAt(seconds: number): BbPoseFrame {
    return BbBatStance.blend(this.upright, this.sliding, BbCurve.smooth(BbCurve.span(seconds, 0, BbSlidePose.DROP_SECONDS)));
  }

  static travelRatio(ratio: number): number {
    const k = BbCurve.clamp(ratio, 0, 1);
    return 1 - (1 - k) * (1 - k);
  }
}

interface BbBallPath {
  readonly duration: number;
  pointAt(seconds: number): BbVec;
}

type BbThrowShape = "line" | "lowArc" | "oneHop";

class BbThrowTrajectory implements BbBallPath {
  static readonly INFIELD_SPEED = 33;
  static readonly OUTFIELD_SPEED = 36;
  static readonly LINE_LIMIT = 40;
  static readonly ARC_LIMIT = 75;
  static readonly LINE_RISE = 0.3;
  static readonly ARC_APEX = 3;
  static readonly HOP_APEX = 2.5;
  static readonly HOP_BEFORE_TARGET = 10;
  static readonly BALL_RADIUS = 0.037;

  readonly duration: number;
  readonly shape: BbThrowShape;
  readonly distance: number;
  private readonly hopRatio: number;

  constructor(readonly from: BbVec, readonly to: BbVec, speed: number) {
    this.distance = to.minus(from).flat().length();
    this.duration = this.distance / speed;
    this.shape = this.distance <= BbThrowTrajectory.LINE_LIMIT ? "line" : this.distance < BbThrowTrajectory.ARC_LIMIT ? "lowArc" : "oneHop";
    this.hopRatio = 1 - BbThrowTrajectory.HOP_BEFORE_TARGET / Math.max(this.distance, 1);
  }

  pointAt(seconds: number): BbVec {
    const ratio = BbCurve.clamp(seconds / this.duration, 0, 1);
    const along = this.from.lerp(this.to, ratio);
    if (this.shape === "line") return along.withY(along.y + Math.min(BbThrowTrajectory.LINE_RISE, this.distance * 0.006) * 4 * ratio * (1 - ratio));
    if (this.shape === "lowArc") return along.withY(along.y + Math.min(BbThrowTrajectory.ARC_APEX - Math.max(this.from.y, this.to.y), this.distance * 0.04) * 4 * ratio * (1 - ratio));
    const ground = BbThrowTrajectory.BALL_RADIUS;
    if (ratio <= this.hopRatio) {
      const k = ratio / this.hopRatio;
      return along.withY(BbCurve.mix(this.from.y, ground, k) + (BbThrowTrajectory.HOP_APEX - this.from.y) * 4 * k * (1 - k) * 0.9);
    }
    const k = (ratio - this.hopRatio) / (1 - this.hopRatio);
    return along.withY(BbCurve.mix(ground, this.to.y, k) + 0.35 * 4 * k * (1 - k));
  }

  apexHeight(): number {
    let highest = 0;
    for (let step = 0; step <= 200; step++) highest = Math.max(highest, this.pointAt(this.duration * step / 200).y);
    return highest;
  }
}

class BbPitchFlight implements BbBallPath {
  constructor(readonly from: BbVec, readonly to: BbVec, readonly duration: number, private readonly breakOffset: BbVec) {}

  pointAt(seconds: number): BbVec {
    const ratio = BbCurve.clamp(seconds / this.duration, 0, 1.35);
    const late = ratio * ratio * (1 - Math.min(ratio, 1));
    return this.from.lerp(this.to, ratio).plus(this.breakOffset.times(late * -4));
  }
}

class BbBattedFlight implements BbBallPath {
  constructor(readonly from: BbVec, readonly to: BbVec, readonly duration: number, private readonly apex: number) {}

  pointAt(seconds: number): BbVec {
    const ratio = BbCurve.clamp(seconds / this.duration, 0, 1);
    const along = this.from.lerp(this.to, ratio);
    return along.withY(along.y + this.apex * 4 * ratio * (1 - ratio));
  }
}

class BbGroundRoll implements BbBallPath {
  constructor(readonly from: BbVec, readonly to: BbVec, readonly duration: number, private readonly hops: number, private readonly firstHopHeight: number) {}

  pointAt(seconds: number): BbVec {
    const ratio = BbCurve.clamp(seconds / this.duration, 0, 1);
    const along = this.from.lerp(this.to, ratio * (1.35 - 0.35 * ratio));
    const firstDrop = this.from.y * (1 - BbCurve.span(ratio, 0, 0.1));
    const bounce = Math.abs(Math.sin(ratio * this.hops * Math.PI)) * this.firstHopHeight * (1 - ratio) * (1 - ratio);
    const resting = BbCurve.mix(BbThrowTrajectory.BALL_RADIUS, this.to.y, BbCurve.span(ratio, 0.88, 1));
    return along.withY(Math.max(resting, firstDrop) + bounce * BbCurve.span(ratio, 0.1, 0.14));
  }
}

class BbBlockedFlight implements BbBallPath {
  private static readonly STEP = 1 / 60;
  private static readonly GRAVITY = 9.8;
  readonly duration: number;
  readonly stoppedAt: number | null;
  private readonly stopPoint: BbVec;

  constructor(private readonly path: BbBallPath, blocks: (point: BbVec) => boolean) {
    let stoppedAt: number | null = null;
    for (let seconds = BbBlockedFlight.STEP; seconds <= path.duration; seconds += BbBlockedFlight.STEP) {
      if (blocks(path.pointAt(seconds))) { stoppedAt = seconds - BbBlockedFlight.STEP; break; }
    }
    this.stoppedAt = stoppedAt;
    this.stopPoint = path.pointAt(stoppedAt === null ? path.duration : stoppedAt);
    this.duration = stoppedAt === null ? path.duration : stoppedAt;
  }

  pointAt(seconds: number): BbVec {
    if (this.stoppedAt === null || seconds <= this.stoppedAt) return this.path.pointAt(seconds);
    const falling = seconds - this.stoppedAt;
    return this.stopPoint.withY(Math.max(BbThrowTrajectory.BALL_RADIUS, this.stopPoint.y - BbBlockedFlight.GRAVITY * falling * falling / 2));
  }

  get stopsAt(): BbVec { return this.stopPoint; }
}
