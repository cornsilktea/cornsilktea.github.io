"use strict";
class BbVec {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    plus(other) { return new BbVec(this.x + other.x, this.y + other.y, this.z + other.z); }
    minus(other) { return new BbVec(this.x - other.x, this.y - other.y, this.z - other.z); }
    times(factor) { return new BbVec(this.x * factor, this.y * factor, this.z * factor); }
    dot(other) { return this.x * other.x + this.y * other.y + this.z * other.z; }
    length() { return Math.sqrt(this.dot(this)); }
    distanceTo(other) { return this.minus(other).length(); }
    flat() { return new BbVec(this.x, 0, this.z); }
    mirrored() { return new BbVec(-this.x, this.y, this.z); }
    withY(y) { return new BbVec(this.x, y, this.z); }
    lerp(to, ratio) { return this.plus(to.minus(this).times(ratio)); }
    unit() {
        const size = this.length();
        return size < 1e-9 ? BbVec.UP : this.times(1 / size);
    }
}
BbVec.ZERO = new BbVec(0, 0, 0);
BbVec.UP = new BbVec(0, 1, 0);
class BbCurve {
    static clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
    static span(value, from, to) { return BbCurve.clamp((value - from) / (to - from), 0, 1); }
    static smooth(ratio) { return ratio * ratio * (3 - 2 * ratio); }
    static mix(from, to, ratio) { return from + (to - from) * ratio; }
}
class BbTurn {
    constructor(rows) {
        this.rows = rows;
    }
    static fromAngles(yaw, pitch, roll) {
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
        return new BbTurn([
            cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
            cx * sz, cx * cz, -sx,
            -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx
        ]);
    }
    then(inner) {
        const a = this.rows, b = inner.rows, out = [];
        for (let row = 0; row < 3; row++)
            for (let column = 0; column < 3; column++) {
                out.push(a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column]);
            }
        return new BbTurn(out);
    }
    apply(point) {
        const m = this.rows;
        return new BbVec(m[0] * point.x + m[1] * point.y + m[2] * point.z, m[3] * point.x + m[4] * point.y + m[5] * point.z, m[6] * point.x + m[7] * point.y + m[8] * point.z);
    }
}
class BbKeyTrack {
    constructor(times, points) {
        this.times = times;
        this.points = points;
    }
    at(seconds) {
        const last = this.times.length - 1;
        if (seconds <= this.times[0])
            return this.points[0];
        if (seconds >= this.times[last])
            return this.points[last];
        let index = 0;
        while (seconds > this.times[index + 1])
            index++;
        const span = this.times[index + 1] - this.times[index], k = (seconds - this.times[index]) / span;
        const k2 = k * k, k3 = k2 * k;
        const from = this.points[index], to = this.points[index + 1];
        return from.times(2 * k3 - 3 * k2 + 1)
            .plus(this.slopeAt(index).times((k3 - 2 * k2 + k) * span))
            .plus(to.times(-2 * k3 + 3 * k2))
            .plus(this.slopeAt(index + 1).times((k3 - k2) * span));
    }
    slopeAt(index) {
        const before = Math.max(0, index - 1), after = Math.min(this.times.length - 1, index + 1);
        return this.points[after].minus(this.points[before]).times(1 / (this.times[after] - this.times[before]));
    }
}
class BbBodyDefaults {
    static standingShoulderHeight(metrics) {
        return metrics.hipHeight + metrics.spineLength + metrics.chestLength + metrics.shoulderRise;
    }
}
BbBodyDefaults.KAYKIT = {
    hipHeight: 0.325, spineLength: 0.154, chestLength: 0.3, shoulderRise: 0.107, shoulderHalfWidth: 0.17, armReach: 0.52,
    hipJointHalfWidth: 0.137, hipJointRise: 0.091, legReach: 0.3, ankleHeight: 0.115
};
class BbBodyModel {
    constructor(metrics) {
        this.metrics = metrics;
    }
    hipsTurn(frame) { return BbTurn.fromAngles(frame.hipsYaw, frame.hipsPitch, frame.hipsRoll); }
    chestTurn(frame) {
        const half = BbTurn.fromAngles(frame.chestYaw / 2, frame.chestPitch / 2, frame.chestRoll / 2);
        return this.hipsTurn(frame).then(half).then(half);
    }
    chestJoint(frame) {
        const hipsTurn = this.hipsTurn(frame);
        const half = BbTurn.fromAngles(frame.chestYaw / 2, frame.chestPitch / 2, frame.chestRoll / 2);
        return frame.hips.plus(hipsTurn.apply(new BbVec(0, this.metrics.spineLength, 0))).plus(hipsTurn.then(half).apply(new BbVec(0, this.metrics.chestLength, 0)));
    }
    shoulder(frame, side) {
        const sign = side === "left" ? 1 : -1;
        return this.chestJoint(frame).plus(this.chestTurn(frame).apply(new BbVec(sign * this.metrics.shoulderHalfWidth, this.metrics.shoulderRise, 0)));
    }
    hipJoint(frame, side) {
        const sign = side === "left" ? 1 : -1;
        return frame.hips.plus(this.hipsTurn(frame).apply(new BbVec(sign * this.metrics.hipJointHalfWidth, this.metrics.hipJointRise, 0)));
    }
    armStretch(frame, side) {
        const distance = this.shoulder(frame, side).distanceTo(side === "left" ? frame.handLeft : frame.handRight);
        return distance - this.metrics.armReach;
    }
    legStretch(frame, side) {
        return this.hipJoint(frame, side).distanceTo(side === "left" ? frame.footLeft : frame.footRight) - this.metrics.legReach;
    }
}
class BbPoseSketch {
    get frame() {
        this.raw.footLeft = this.footWithinReach("left", this.raw.footLeft);
        this.raw.footRight = this.footWithinReach("right", this.raw.footRight);
        return this.raw;
    }
    footWithinReach(side, foot) {
        const joint = this.body.hipJoint(this.raw, side), gap = foot.minus(joint), allowed = this.metrics.legReach * BbPoseSketch.LEG_USE;
        return gap.length() <= allowed ? foot : joint.plus(gap.times(allowed / gap.length()));
    }
    constructor(metrics) {
        this.metrics = metrics;
        this.body = new BbBodyModel(metrics);
        this.raw = {
            hips: new BbVec(0, metrics.hipHeight, 0), hipsYaw: 0, hipsPitch: 0, hipsRoll: 0, chestYaw: 0, chestPitch: 0, chestRoll: 0, headYaw: 0, headPitch: 0,
            handLeft: BbVec.ZERO, handRight: BbVec.ZERO,
            footLeft: new BbVec(0.12, metrics.ankleHeight, 0), footRight: new BbVec(-0.12, metrics.ankleHeight, 0), bat: null
        };
        this.handFromShoulder("left", new BbVec(0.06, -0.36, 0.08)).handFromShoulder("right", new BbVec(-0.06, -0.36, 0.08));
    }
    hips(position, yaw = 0, pitch = 0, roll = 0) {
        this.raw.hips = position;
        this.raw.hipsYaw = yaw;
        this.raw.hipsPitch = pitch;
        this.raw.hipsRoll = roll;
        return this;
    }
    chest(yaw, pitch, roll = 0) {
        this.raw.chestYaw = yaw;
        this.raw.chestPitch = pitch;
        this.raw.chestRoll = roll;
        return this;
    }
    head(yaw, pitch) {
        this.raw.headYaw = BbCurve.clamp(yaw, -1.25, 1.25);
        this.raw.headPitch = BbCurve.clamp(pitch, -0.8, 0.8);
        return this;
    }
    headFacing(actorYaw, pitch = 0) {
        return this.head(actorYaw - this.raw.hipsYaw - this.raw.chestYaw, pitch - this.raw.hipsPitch - this.raw.chestPitch);
    }
    feet(left, right) {
        this.raw.footLeft = left;
        this.raw.footRight = right;
        return this;
    }
    handAt(side, point) {
        if (side === "left")
            this.raw.handLeft = point;
        else
            this.raw.handRight = point;
        return this;
    }
    handFromShoulder(side, offsetInChest) {
        return this.handAt(side, this.body.shoulder(this.raw, side).plus(this.body.chestTurn(this.raw).apply(offsetInChest)));
    }
    reachWith(side, point) {
        const allowed = this.metrics.armReach * BbPoseSketch.REACH_USE;
        for (let round = 0; round < 4; round++) {
            const shoulder = this.body.shoulder(this.raw, side), gap = point.minus(shoulder);
            const excess = gap.length() - allowed;
            if (excess <= 0)
                break;
            const flat = gap.flat(), flatLength = flat.length();
            if (flatLength > 0.02)
                this.raw.hips = this.raw.hips.plus(flat.times(Math.min(excess, flatLength) / flatLength));
            else
                this.raw.hips = this.raw.hips.plus(new BbVec(0, Math.sign(gap.y) * excess, 0));
        }
        return this.handAt(side, point);
    }
    holdBat(knob, axis) {
        const direction = axis.unit();
        this.raw.bat = { knob, axis: direction };
        return this.handAt("left", knob.plus(direction.times(BbBatShape.BOTTOM_HAND_AT))).handAt("right", knob.plus(direction.times(BbBatShape.TOP_HAND_AT)));
    }
}
BbPoseSketch.REACH_USE = 0.96;
BbPoseSketch.LEG_USE = 0.97;
class BbHandednessMirror {
    static point(point, mirrored) { return mirrored ? point.mirrored() : point; }
    static frame(frame, mirrored) {
        if (!mirrored)
            return frame;
        return {
            hips: frame.hips.mirrored(), hipsYaw: -frame.hipsYaw, hipsPitch: frame.hipsPitch, hipsRoll: -frame.hipsRoll,
            chestYaw: -frame.chestYaw, chestPitch: frame.chestPitch, chestRoll: -frame.chestRoll, headYaw: -frame.headYaw, headPitch: frame.headPitch,
            handLeft: frame.handRight.mirrored(), handRight: frame.handLeft.mirrored(), footLeft: frame.footRight.mirrored(), footRight: frame.footLeft.mirrored(),
            bat: frame.bat ? { knob: frame.bat.knob.mirrored(), axis: frame.bat.axis.mirrored() } : null
        };
    }
    static side(side, mirrored) {
        if (!mirrored)
            return side;
        return side === "left" ? "right" : "left";
    }
}
class BbBatShape {
}
BbBatShape.LENGTH = 0.86;
BbBatShape.SWEET_SPOT_AT = 0.66;
BbBatShape.BOTTOM_HAND_AT = 0.055;
BbBatShape.TOP_HAND_AT = 0.15;
BbBatShape.GRIP_CENTER_AT = 0.1;
BbBatShape.HANDLE_TAPE_END = 0.27;
BbBatShape.PROFILE = [
    [0, 0], [0.019, 0.002], [0.021, 0.012], [0.0135, 0.03], [0.0125, 0.12], [0.013, 0.27], [0.0155, 0.38], [0.021, 0.48],
    [0.0275, 0.57], [0.0315, 0.65], [0.0325, 0.72], [0.0325, 0.81], [0.03, 0.845], [0.02, 0.858], [0, 0.86]
];
class BbActionPose {
}
class BbActionSync {
    static startFor(eventTime, pose) { return eventTime - pose.keyTime; }
    static keyError(startAt, pose, eventTime) { return startAt + pose.keyTime - eventTime; }
}
BbActionSync.FRAME_SECONDS = 1 / 60;
class BbReadyPose extends BbActionPose {
    constructor(metrics, depth) {
        super();
        this.metrics = metrics;
        this.depth = depth;
        this.duration = Infinity;
        this.keyTime = 0;
    }
    frameAt(seconds) {
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
    constructor(metrics, target) {
        super();
        this.metrics = metrics;
        this.target = target;
        this.duration = Infinity;
        this.keyTime = 0;
    }
    frameAt(seconds) {
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
    static stance(metrics, seconds) {
        const shoulder = BbBodyDefaults.standingShoulderHeight(metrics), waggle = Math.sin(seconds * 3.1) * 0.05;
        const sketch = new BbPoseSketch(metrics)
            .hips(new BbVec(0, metrics.hipHeight - 0.035, 0), -0.1, 0.06)
            .chest(-0.35, 0.1)
            .feet(new BbVec(BbBatStance.FRONT_FOOT_X, metrics.ankleHeight, 0), new BbVec(-0.2, metrics.ankleHeight, 0));
        sketch.headFacing(1.05, 0.05);
        const axis = new BbVec(-0.5 + waggle, 0.8, -0.05 - waggle * 0.5);
        return sketch.holdBat(new BbVec(-0.3, shoulder, 0.25).minus(axis.unit().times(BbBatShape.GRIP_CENTER_AT)), axis);
    }
    static loaded(metrics, liftRatio) {
        const shoulder = BbBodyDefaults.standingShoulderHeight(metrics), lift = Math.sin(liftRatio * Math.PI) * 0.07;
        const frontX = BbCurve.mix(BbBatStance.FRONT_FOOT_X, BbBatStance.STRIDE_FOOT_X, BbCurve.smooth(liftRatio));
        const sketch = new BbPoseSketch(metrics)
            .hips(new BbVec(-0.05, metrics.hipHeight - 0.045, 0), -0.3, 0.06)
            .chest(-0.45, 0.12)
            .feet(new BbVec(frontX, metrics.ankleHeight + lift, 0), new BbVec(-0.2, metrics.ankleHeight, 0));
        sketch.headFacing(1.05, 0.05);
        const axis = new BbVec(-0.62, 0.7, -0.15);
        return sketch.holdBat(new BbVec(-0.36, shoulder - 0.02, 0.2).minus(axis.unit().times(BbBatShape.GRIP_CENTER_AT)), axis);
    }
    static blend(from, to, ratio) {
        const mix = (a, b) => BbCurve.mix(a, b, ratio);
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
BbBatStance.FRONT_FOOT_X = 0.2;
BbBatStance.STRIDE_FOOT_X = 0.25;
class BbBatStancePose extends BbActionPose {
    constructor(metrics) {
        super();
        this.metrics = metrics;
        this.duration = Infinity;
        this.keyTime = 0;
    }
    frameAt(seconds) { return BbBatStance.stance(this.metrics, seconds).frame; }
}
class BbBatLoadPose extends BbActionPose {
    constructor(metrics) {
        super();
        this.metrics = metrics;
        this.duration = BbBatLoadPose.LOAD_SECONDS + BbBatLoadPose.HOLD_SECONDS;
        this.keyTime = BbBatLoadPose.LOAD_SECONDS;
    }
    frameAt(seconds) {
        const ratio = BbCurve.span(seconds, 0, BbBatLoadPose.LOAD_SECONDS);
        return BbBatStance.blend(BbBatStance.stance(this.metrics, 0).frame, BbBatStance.loaded(this.metrics, ratio).frame, BbCurve.smooth(ratio));
    }
}
BbBatLoadPose.LOAD_SECONDS = 0.35;
BbBatLoadPose.HOLD_SECONDS = 1.6;
class BbBatSwingPose extends BbActionPose {
    constructor(metrics, contactPoint, style) {
        super();
        this.metrics = metrics;
        this.contactPoint = contactPoint;
        this.duration = BbBatSwingPose.SWING_DELAY + BbBatSwingPose.FOLLOW_SECONDS;
        this.keyTime = BbBatSwingPose.SWING_DELAY;
        const m = metrics, shoulder = BbBodyDefaults.standingShoulderHeight(m), times = BbBatSwingPose.TIMES;
        const finish = style === "full" ? 1 : 0.55;
        const loaded = BbBatStance.loaded(m, 1).frame, loadedBat = loaded.bat;
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
    frameAt(seconds) {
        const time = BbCurve.clamp(seconds, 0, this.duration), turn = this.turnTrack.at(time), axis = this.axisTrack.at(time).unit();
        const sketch = new BbPoseSketch(this.metrics)
            .hips(this.hipsTrack.at(time), turn.x, 0.06)
            .chest(turn.y, turn.z)
            .feet(new BbVec(BbBatStance.STRIDE_FOOT_X, this.metrics.ankleHeight, 0), this.backFootTrack.at(time));
        sketch.headFacing(BbCurve.mix(1.05, 0.5, BbCurve.span(time, 0.04, 0.14)), 0.2);
        return sketch.holdBat(this.gripTrack.at(time).minus(axis.times(BbBatShape.GRIP_CENTER_AT)), axis).frame;
    }
    sweetSpotAt(seconds) {
        const bat = this.frameAt(seconds).bat;
        return bat.knob.plus(bat.axis.times(BbBatShape.SWEET_SPOT_AT));
    }
}
BbBatSwingPose.SWING_DELAY = 0.12;
BbBatSwingPose.FOLLOW_SECONDS = 0.43;
BbBatSwingPose.TIMES = [0, 0.06, 0.12, 0.22, 0.36, 0.55];
class BbArmSwingKeys {
    constructor(times, hips, turns, leftFoot, rightFoot, throwHand, gloveHand) {
        this.times = times;
        this.hips = hips;
        this.turns = turns;
        this.leftFoot = leftFoot;
        this.rightFoot = rightFoot;
        this.throwHand = throwHand;
        this.gloveHand = gloveHand;
    }
}
class BbThrowingPose extends BbActionPose {
    constructor(metrics, keys) {
        super();
        this.metrics = metrics;
        this.duration = keys.times[keys.times.length - 1];
        this.hipsTrack = new BbKeyTrack(keys.times, keys.hips);
        this.turnTrack = new BbKeyTrack(keys.times, keys.turns);
        this.leftFootTrack = new BbKeyTrack(keys.times, keys.leftFoot);
        this.rightFootTrack = new BbKeyTrack(keys.times, keys.rightFoot);
        this.throwHandTrack = new BbKeyTrack(keys.times, keys.throwHand);
        this.gloveHandTrack = new BbKeyTrack(keys.times, keys.gloveHand);
    }
    frameAt(seconds) {
        const time = BbCurve.clamp(seconds, 0, this.duration), turn = this.turnTrack.at(time);
        const sketch = new BbPoseSketch(this.metrics).hips(this.hipsTrack.at(time), turn.x, 0.04).chest(turn.y, turn.z).feet(this.leftFootTrack.at(time), this.rightFootTrack.at(time));
        sketch.headFacing(0, 0.05);
        return sketch.handFromShoulder("right", this.throwHandTrack.at(time)).handFromShoulder("left", this.gloveHandTrack.at(time)).frame;
    }
    releaseHand() { return this.frameAt(this.keyTime).handRight; }
}
class BbPitchPose extends BbThrowingPose {
    constructor(metrics) {
        const h = metrics.hipHeight, a = metrics.ankleHeight;
        super(metrics, new BbArmSwingKeys([0, 0.3, 0.55, 0.75, 0.9, 1.1, 1.4], [new BbVec(0, h, 0), new BbVec(-0.02, h, -0.03), new BbVec(0, h - 0.05, 0.12), new BbVec(0, h - 0.09, 0.26), new BbVec(0.02, h - 0.1, 0.36), new BbVec(0.04, h - 0.1, 0.42), new BbVec(0, h - 0.04, 0.4)], [new BbVec(0, 0, 0), new BbVec(-1.3, -0.15, -0.05), new BbVec(-1.35, -0.25, 0), new BbVec(-0.7, -0.45, 0.05), new BbVec(0.15, 0.25, 0.45), new BbVec(0.5, 0.45, 0.8), new BbVec(0.1, 0, 0.25)], [new BbVec(0.1, a, 0), new BbVec(0.02, 0.33, 0.1), new BbVec(0.05, 0.2, 0.3), new BbVec(0.06, a, 0.5), new BbVec(0.06, a, 0.5), new BbVec(0.06, a, 0.5), new BbVec(0.14, a, 0.45)], [new BbVec(-0.1, a, 0), new BbVec(-0.1, a, 0), new BbVec(-0.1, a, 0), new BbVec(-0.1, a + 0.02, 0.02), new BbVec(-0.1, a + 0.06, 0.13), new BbVec(-0.14, 0.2, 0.32), new BbVec(-0.14, a, 0.42)], [new BbVec(0.14, -0.14, 0.24), new BbVec(0.14, -0.08, 0.24), new BbVec(-0.1, -0.3, -0.28), new BbVec(-0.2, 0.3, -0.25), new BbVec(-0.12, 0.36, 0.33), new BbVec(0.25, -0.3, 0.3), new BbVec(-0.04, -0.28, 0.24)], [new BbVec(-0.14, -0.14, 0.24), new BbVec(-0.14, -0.08, 0.24), new BbVec(0.38, 0.02, 0.1), new BbVec(0.3, -0.1, 0.15), new BbVec(0.1, -0.2, 0.12), new BbVec(0.05, -0.2, 0.05), new BbVec(0.04, -0.28, 0.24)]));
        this.keyTime = BbPitchPose.WINDUP_SECONDS;
    }
}
BbPitchPose.WINDUP_SECONDS = 0.9;
class BbFieldThrowPose extends BbThrowingPose {
    constructor(metrics, crowHop) {
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
BbFieldThrowPose.RELEASE_SECONDS = 0.28;
BbFieldThrowPose.CROW_HOP_SECONDS = 0.2;
class BbCatchPose extends BbActionPose {
    constructor(metrics, kind, glovePoint) {
        super();
        this.metrics = metrics;
        this.kind = kind;
        this.glovePoint = glovePoint;
        this.keyTime = BbCatchPose.LEAD_SECONDS[kind];
        this.duration = this.keyTime + BbCatchPose.HOLD_SECONDS + BbCatchPose.SETTLE_SECONDS;
        this.ready = new BbReadyPose(metrics, 0.3).frameAt(0);
        this.caught = this.caughtSketch().frame;
        this.settled = this.settledSketch().frame;
    }
    frameAt(seconds) {
        if (seconds <= this.keyTime)
            return BbBatStance.blend(this.ready, this.caught, BbCurve.smooth(BbCurve.span(seconds, 0, this.keyTime * 0.82)));
        const after = seconds - this.keyTime - BbCatchPose.HOLD_SECONDS;
        return BbBatStance.blend(this.caught, this.settled, BbCurve.smooth(BbCurve.span(after, 0, BbCatchPose.SETTLE_SECONDS)));
    }
    caughtSketch() {
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
    settledSketch() {
        const m = this.metrics, hips = this.caught.hips;
        const sketch = new BbPoseSketch(m).hips(new BbVec(hips.x, m.hipHeight - 0.05, hips.z), 0, 0.12).chest(0, 0.15).feet(this.caught.footLeft, this.caught.footRight);
        sketch.headFacing(0, 0.05);
        return sketch.handFromShoulder("left", new BbVec(-0.08, -0.16, 0.22)).handFromShoulder("right", new BbVec(0.04, -0.15, 0.2));
    }
}
BbCatchPose.LEAD_SECONDS = { ground: 0.36, fly: 0.45, chest: 0.25, stretch: 0.32 };
BbCatchPose.HOLD_SECONDS = 0.18;
BbCatchPose.SETTLE_SECONDS = 0.3;
class BbTagPose extends BbActionPose {
    constructor(metrics, tagPoint) {
        super();
        this.tagPoint = tagPoint;
        this.keyTime = 0.2;
        this.duration = 0.55;
        this.ready = new BbReadyPose(metrics, 0.4).frameAt(0);
        const sketch = new BbPoseSketch(metrics).hips(new BbVec(tagPoint.x * 0.4, 0.2, tagPoint.z - 0.4), 0, 0.4).chest(tagPoint.x > 0 ? 0.3 : -0.3, 0.7)
            .feet(new BbVec(0.2 + tagPoint.x * 0.4, metrics.ankleHeight, tagPoint.z - 0.34), new BbVec(-0.2 + tagPoint.x * 0.4, metrics.ankleHeight, tagPoint.z - 0.38));
        sketch.headFacing(0, 0.45);
        this.tagging = sketch.reachWith("left", tagPoint).handAt("right", tagPoint.plus(new BbVec(-0.08, 0.08, -0.02))).frame;
    }
    frameAt(seconds) {
        if (seconds <= this.keyTime)
            return BbBatStance.blend(this.ready, this.tagging, BbCurve.smooth(BbCurve.span(seconds, 0, this.keyTime)));
        return BbBatStance.blend(this.tagging, this.ready, BbCurve.smooth(BbCurve.span(seconds, this.keyTime + 0.1, this.duration)));
    }
}
class BbSlidePose extends BbActionPose {
    constructor(metrics, slideSeconds) {
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
    frameAt(seconds) {
        return BbBatStance.blend(this.upright, this.sliding, BbCurve.smooth(BbCurve.span(seconds, 0, BbSlidePose.DROP_SECONDS)));
    }
    static travelRatio(ratio) {
        const k = BbCurve.clamp(ratio, 0, 1);
        return 1 - (1 - k) * (1 - k);
    }
}
BbSlidePose.DROP_SECONDS = 0.2;
BbSlidePose.REST_SECONDS = 0.35;
class BbThrowTrajectory {
    constructor(from, to, speed) {
        this.from = from;
        this.to = to;
        this.distance = to.minus(from).flat().length();
        this.duration = this.distance / speed;
        this.shape = this.distance <= BbThrowTrajectory.LINE_LIMIT ? "line" : this.distance < BbThrowTrajectory.ARC_LIMIT ? "lowArc" : "oneHop";
        this.hopRatio = 1 - BbThrowTrajectory.HOP_BEFORE_TARGET / Math.max(this.distance, 1);
    }
    pointAt(seconds) {
        const ratio = BbCurve.clamp(seconds / this.duration, 0, 1);
        const along = this.from.lerp(this.to, ratio);
        if (this.shape === "line")
            return along.withY(along.y + Math.min(BbThrowTrajectory.LINE_RISE, this.distance * 0.006) * 4 * ratio * (1 - ratio));
        if (this.shape === "lowArc")
            return along.withY(along.y + Math.min(BbThrowTrajectory.ARC_APEX - Math.max(this.from.y, this.to.y), this.distance * 0.04) * 4 * ratio * (1 - ratio));
        const ground = BbThrowTrajectory.BALL_RADIUS;
        if (ratio <= this.hopRatio) {
            const k = ratio / this.hopRatio;
            return along.withY(BbCurve.mix(this.from.y, ground, k) + (BbThrowTrajectory.HOP_APEX - this.from.y) * 4 * k * (1 - k) * 0.9);
        }
        const k = (ratio - this.hopRatio) / (1 - this.hopRatio);
        return along.withY(BbCurve.mix(ground, this.to.y, k) + 0.35 * 4 * k * (1 - k));
    }
    apexHeight() {
        let highest = 0;
        for (let step = 0; step <= 200; step++)
            highest = Math.max(highest, this.pointAt(this.duration * step / 200).y);
        return highest;
    }
}
BbThrowTrajectory.INFIELD_SPEED = 33;
BbThrowTrajectory.OUTFIELD_SPEED = 36;
BbThrowTrajectory.LINE_LIMIT = 40;
BbThrowTrajectory.ARC_LIMIT = 75;
BbThrowTrajectory.LINE_RISE = 0.3;
BbThrowTrajectory.ARC_APEX = 3;
BbThrowTrajectory.HOP_APEX = 2.5;
BbThrowTrajectory.HOP_BEFORE_TARGET = 10;
BbThrowTrajectory.BALL_RADIUS = 0.037;
class BbPitchFlight {
    constructor(from, to, duration, breakOffset) {
        this.from = from;
        this.to = to;
        this.duration = duration;
        this.breakOffset = breakOffset;
    }
    pointAt(seconds) {
        const ratio = BbCurve.clamp(seconds / this.duration, 0, 1.35);
        const late = ratio * ratio * (1 - Math.min(ratio, 1));
        return this.from.lerp(this.to, ratio).plus(this.breakOffset.times(late * -4));
    }
}
class BbBattedFlight {
    constructor(from, to, duration, apex) {
        this.from = from;
        this.to = to;
        this.duration = duration;
        this.apex = apex;
    }
    pointAt(seconds) {
        const ratio = BbCurve.clamp(seconds / this.duration, 0, 1);
        const along = this.from.lerp(this.to, ratio);
        return along.withY(along.y + this.apex * 4 * ratio * (1 - ratio));
    }
}
class BbGroundRoll {
    constructor(from, to, duration, hops, firstHopHeight) {
        this.from = from;
        this.to = to;
        this.duration = duration;
        this.hops = hops;
        this.firstHopHeight = firstHopHeight;
    }
    pointAt(seconds) {
        const ratio = BbCurve.clamp(seconds / this.duration, 0, 1);
        const along = this.from.lerp(this.to, ratio * (1.35 - 0.35 * ratio));
        const firstDrop = this.from.y * (1 - BbCurve.span(ratio, 0, 0.1));
        const bounce = Math.abs(Math.sin(ratio * this.hops * Math.PI)) * this.firstHopHeight * (1 - ratio) * (1 - ratio);
        const resting = BbCurve.mix(BbThrowTrajectory.BALL_RADIUS, this.to.y, BbCurve.span(ratio, 0.88, 1));
        return along.withY(Math.max(resting, firstDrop) + bounce * BbCurve.span(ratio, 0.1, 0.14));
    }
}
