"use strict";
class FreezeRules {
}
FreezeRules.TRACK_LENGTH = 72;
FreezeRules.LANE_COUNT = 6;
FreezeRules.LANE_WIDTH = 2.5;
FreezeRules.RUN_SPEED = 2.9;
FreezeRules.ACCEL_S = 0.12;
FreezeRules.GAME_MS = 60000;
FreezeRules.END_GRACE_MS = 1200;
FreezeRules.ALL_FINISHED_DELAY_MS = 1500;
FreezeRules.SAFE_MIN_MS = 2000;
FreezeRules.SAFE_MAX_MS = 4500;
FreezeRules.WARNING_MS = 300;
FreezeRules.LOOK_MIN_MS = 1200;
FreezeRules.LOOK_MAX_MS = 2500;
FreezeRules.GRACE_MS = 250;
FreezeRules.PULL_MS = 500;
FreezeRules.RESUME_MS = 800;
FreezeRules.CYCLE_LEAD_MS = 600;
FreezeRules.TREND_LIMIT = 0.6;
FreezeRules.TAIL_FACTORS = [0.45, 1, 1, 2.2];
FreezeRules.CHEER_TEXT = "무궁화꽃이 피었습니다";
FreezeRules.NET_MS = 143;
FreezeRules.OBSERVE_SMOOTHING = 14;
FreezeRules.OBSERVE_EXTRAPOLATE_S = 0.3;
FreezeRules.OBSERVE_SNAP_DISTANCE = 8;
FreezeRules.COMPARE_STEP = 0.1;
class FreezeRecords {
    static cycle(value) {
        const raw = value;
        if (!raw || typeof raw !== "object")
            return null;
        const numbers = [raw.n, raw.at, raw.safe, raw.look, raw.trend, raw.tail];
        if (numbers.some((entry) => typeof entry !== "number" || !isFinite(entry)))
            return null;
        return { n: raw.n, at: raw.at, safe: raw.safe, look: raw.look, trend: raw.trend, tail: raw.tail };
    }
    static hit(value) {
        const raw = value;
        if (!raw || typeof raw !== "object" || typeof raw.id !== "string")
            return null;
        const numbers = [raw.n, raw.t, raw.d];
        if (numbers.some((entry) => typeof entry !== "number" || !isFinite(entry)))
            return null;
        return { id: raw.id, n: raw.n, t: raw.t, d: raw.d };
    }
    static finish(value) {
        const raw = value;
        if (!raw || typeof raw !== "object" || typeof raw.t !== "number" || !isFinite(raw.t))
            return null;
        return { t: raw.t };
    }
}
class FreezePositionCodec {
    static encode(runner, sentAt) {
        return [MathUtil.round2(runner.dist), runner.moving ? 1 : 0, runner.hits, Math.round(Math.max(runner.finishedAt, runner.reportedFinishAt)), Math.round(sentAt)].join(",");
    }
    static decode(raw) {
        const parts = String(raw).split(",").map((part) => +part);
        if (parts.length < FreezePositionCodec.FIELD_COUNT || parts.some((part) => !isFinite(part)))
            return null;
        return { d: parts[0], run: parts[1] === 1, hits: parts[2], fin: parts[3], sentAt: parts[4] };
    }
}
FreezePositionCodec.FIELD_COUNT = 5;
class FreezeCheer {
    static starts(safeMs, trend, tail) {
        const count = FreezeCheer.SYLLABLES;
        const weights = [];
        for (let index = 0; index < count; index++) {
            const slope = 1 + trend * (2 * index / (count - 1) - 1);
            weights.push(Math.max(FreezeCheer.MIN_WEIGHT, index >= count - 2 ? slope * tail : slope));
        }
        const unit = safeMs / weights.reduce((sum, weight) => sum + weight, 0);
        const starts = [];
        let at = 0;
        weights.forEach((weight) => {
            starts.push(at);
            at += weight * unit;
        });
        return starts;
    }
    static text(starts, elapsedMs) {
        const shown = starts.filter((start) => start <= elapsedMs).length;
        let seen = 0;
        let out = "";
        let pendingSpace = false;
        for (const letter of FreezeRules.CHEER_TEXT) {
            if (letter === " ") {
                pendingSpace = true;
                continue;
            }
            if (seen >= shown)
                break;
            if (pendingSpace)
                out += " ";
            pendingSpace = false;
            out += letter;
            seen++;
        }
        return out;
    }
}
FreezeCheer.SYLLABLES = FreezeRules.CHEER_TEXT.replace(/ /g, "").length;
FreezeCheer.MIN_WEIGHT = 0.15;
class FreezeCycle {
    constructor(record) {
        this.record = record;
        this.starts = FreezeCheer.starts(record.safe, record.trend, record.tail);
    }
    get n() { return this.record.n; }
    get at() { return this.record.at; }
    safeEnd() { return this.record.at + this.record.safe; }
    warningEnd() { return this.safeEnd() + FreezeRules.WARNING_MS; }
    end() { return this.warningEnd() + this.record.look; }
    phaseAt(now) {
        if (now < this.safeEnd())
            return { kind: "safe", sinceMs: now - this.record.at, leftMs: this.safeEnd() - now, cycle: this };
        if (now < this.warningEnd())
            return { kind: "warning", sinceMs: now - this.safeEnd(), leftMs: this.warningEnd() - now, cycle: this };
        if (now < this.end())
            return { kind: "look", sinceMs: now - this.warningEnd(), leftMs: this.end() - now, cycle: this };
        return { kind: "idle", sinceMs: now - this.end(), leftMs: 0, cycle: this };
    }
    cheerAt(now) {
        return FreezeCheer.text(this.starts, now - this.record.at);
    }
}
class FreezeCycleLog {
    constructor() {
        this.ordered = [];
        this.numbers = new Set();
    }
    accept(value) {
        const record = FreezeRecords.cycle(value);
        return record !== null && this.add(record);
    }
    add(record) {
        if (this.numbers.has(record.n))
            return false;
        this.numbers.add(record.n);
        this.ordered.push(new FreezeCycle(record));
        this.ordered.sort((a, b) => a.n - b.n);
        return true;
    }
    latest() {
        return this.ordered.length ? this.ordered[this.ordered.length - 1] : null;
    }
    has(n) {
        return this.numbers.has(n);
    }
    cycleAt(now) {
        let found = null;
        this.ordered.forEach((cycle) => {
            if (cycle.at <= now)
                found = cycle;
        });
        return found;
    }
    phaseAt(now) {
        const cycle = this.cycleAt(now);
        return cycle ? cycle.phaseAt(now) : { kind: "idle", sinceMs: 0, leftMs: 0, cycle: null };
    }
    isDangerous(now) {
        const phase = this.phaseAt(now);
        return phase.kind === "look" && phase.sinceMs >= FreezeRules.GRACE_MS;
    }
}
class FreezeCycleDraft {
    static draw(n, at, random) {
        return {
            n,
            at,
            safe: FreezeCycleDraft.tenMs(random.between(FreezeRules.SAFE_MIN_MS, FreezeRules.SAFE_MAX_MS)),
            look: FreezeCycleDraft.tenMs(random.between(FreezeRules.LOOK_MIN_MS, FreezeRules.LOOK_MAX_MS)),
            trend: MathUtil.round2(random.between(-FreezeRules.TREND_LIMIT, FreezeRules.TREND_LIMIT)),
            tail: FreezeRules.TAIL_FACTORS[random.index(FreezeRules.TAIL_FACTORS.length)]
        };
    }
    static tenMs(value) {
        return Math.round(value / 10) * 10;
    }
}
class FreezeLanes {
    static xOf(lane) {
        return (lane - (FreezeRules.LANE_COUNT - 1) / 2) * FreezeRules.LANE_WIDTH;
    }
    static assign(ids, seed) {
        const lanes = [];
        for (let lane = 0; lane < FreezeRules.LANE_COUNT; lane++)
            lanes.push(lane);
        const random = new SeededRandom(seed ^ 0x2f6b9c15);
        for (let index = lanes.length - 1; index > 0; index--) {
            const swap = Math.floor(random.next() * (index + 1));
            const keep = lanes[index];
            lanes[index] = lanes[swap];
            lanes[swap] = keep;
        }
        const assigned = new Map();
        ids.forEach((id, index) => assigned.set(id, lanes[index % lanes.length]));
        return assigned;
    }
}
class FreezeStepResult {
    constructor(caught, finished) {
        this.caught = caught;
        this.finished = finished;
    }
}
FreezeStepResult.NONE = new FreezeStepResult(false, false);
FreezeStepResult.CAUGHT = new FreezeStepResult(true, false);
FreezeStepResult.FINISHED = new FreezeStepResult(false, true);
class FreezeRunnerState {
    constructor(participant, lane) {
        this.participant = participant;
        this.lane = lane;
        this.dist = 0;
        this.speed = 0;
        this.hits = 0;
        this.caughtAt = 0;
        this.finishedAt = 0;
        this.reportedFinishAt = 0;
        this.finishConfirmed = false;
        this.moving = false;
        this.pullFrom = 0;
        this.goal = { d: 0, run: false, hits: 0, fin: 0, sentAt: 0 };
    }
    get id() { return this.participant.id; }
    isFinished() { return this.finishedAt > 0; }
    isPulling(now) { return this.caughtAt > 0 && now < this.caughtAt + FreezeRules.PULL_MS; }
    isLocked(now) { return this.caughtAt > 0 && now < this.caughtAt + FreezeRules.PULL_MS + FreezeRules.RESUME_MS; }
    progress() { return MathUtil.clamp(this.dist / FreezeRules.TRACK_LENGTH, 0, 1); }
    pose(now) {
        if (this.isFinished())
            return "cheer";
        if (this.caughtAt > 0 && now < this.caughtAt + FreezeRules.PULL_MS)
            return "hit";
        return this.moving ? "run" : "idle";
    }
    applyCatch(n, at, from) {
        if (n <= this.hits)
            return false;
        this.hits = n;
        this.caughtAt = at;
        this.pullFrom = from;
        this.speed = 0;
        this.moving = false;
        return true;
    }
    reset() {
        this.dist = 0;
        this.speed = 0;
        this.hits = 0;
        this.caughtAt = 0;
        this.finishedAt = 0;
        this.reportedFinishAt = 0;
        this.finishConfirmed = false;
        this.moving = false;
        this.pullFrom = 0;
    }
    nextHitNumber() {
        return this.hits + 1;
    }
    confirmFinish(t) {
        this.finishConfirmed = true;
        this.finishedAt = t;
        this.reportedFinishAt = t;
        this.dist = FreezeRules.TRACK_LENGTH;
        this.speed = 0;
        this.moving = false;
    }
    advance(dt, now, wantsRun, dangerous, endAt) {
        if (this.isFinished() || now >= endAt) {
            this.moving = false;
            this.speed = 0;
            return FreezeStepResult.NONE;
        }
        if (this.isLocked(now)) {
            this.followPull(now);
            return FreezeStepResult.NONE;
        }
        if (dangerous && wantsRun) {
            this.applyCatch(this.nextHitNumber(), now, this.dist);
            return FreezeStepResult.CAUGHT;
        }
        if (!wantsRun) {
            this.speed = 0;
            this.moving = false;
            return FreezeStepResult.NONE;
        }
        this.moving = true;
        this.speed = Math.min(FreezeRules.RUN_SPEED, this.speed + FreezeRules.RUN_SPEED / FreezeRules.ACCEL_S * dt);
        this.dist += this.speed * dt;
        if (this.dist < FreezeRules.TRACK_LENGTH)
            return FreezeStepResult.NONE;
        const overshootMs = this.speed > 0 ? (this.dist - FreezeRules.TRACK_LENGTH) / this.speed * 1000 : 0;
        this.reportedFinishAt = Math.max(1, Math.round(now - overshootMs));
        this.finishedAt = this.reportedFinishAt;
        this.dist = FreezeRules.TRACK_LENGTH;
        this.speed = 0;
        this.moving = false;
        return FreezeStepResult.FINISHED;
    }
    observe(snapshot) {
        if (snapshot.sentAt < this.goal.sentAt)
            return;
        this.goal = snapshot;
        if (snapshot.fin > 0 && this.reportedFinishAt === 0)
            this.reportedFinishAt = snapshot.fin;
    }
    stepObserved(dt, now) {
        if (this.isFinished())
            return;
        if (this.isLocked(now)) {
            this.followPull(now);
            return;
        }
        const goal = this.goal;
        this.moving = goal.run;
        const age = MathUtil.clamp((now - goal.sentAt) / 1000, 0, FreezeRules.OBSERVE_EXTRAPOLATE_S);
        const target = Math.min(FreezeRules.TRACK_LENGTH, goal.d + (goal.run ? FreezeRules.RUN_SPEED * age : 0));
        if (Math.abs(target - this.dist) > FreezeRules.OBSERVE_SNAP_DISTANCE)
            this.dist = target;
        else
            this.dist += (target - this.dist) * Math.min(1, dt * FreezeRules.OBSERVE_SMOOTHING);
    }
    followPull(now) {
        this.speed = 0;
        this.moving = false;
        const progress = MathUtil.clamp((now - this.caughtAt) / FreezeRules.PULL_MS, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.dist = this.pullFrom * (1 - eased);
    }
}
class FreezeStandings {
    constructor(runners) {
        this.runners = runners;
    }
    order() {
        return this.runners.slice().sort((a, b) => this.groupOf(a) - this.groupOf(b) || this.valueOf(a) - this.valueOf(b) || (a.id < b.id ? -1 : 1));
    }
    rankOf(id) {
        const ranks = this.rankMap();
        return ranks.get(id) || this.runners.length;
    }
    allFinished() {
        return this.runners.length > 0 && this.runners.every((runner) => runner.isFinished());
    }
    lastFinishAt() {
        return this.runners.reduce((latest, runner) => Math.max(latest, runner.finishedAt), 0);
    }
    ranking() {
        const ranks = this.rankMap();
        return this.runners.map((runner) => ({ id: runner.id, rank: ranks.get(runner.id) }));
    }
    rankMap() {
        const ranks = new Map();
        const ordered = this.order();
        ordered.forEach((runner, index) => {
            const previous = index > 0 ? ordered[index - 1] : null;
            const tied = previous !== null && this.groupOf(previous) === this.groupOf(runner) && this.valueOf(previous) === this.valueOf(runner);
            ranks.set(runner.id, tied && previous ? ranks.get(previous.id) : index + 1);
        });
        return ranks;
    }
    groupOf(runner) {
        return runner.isFinished() ? 0 : 1;
    }
    valueOf(runner) {
        return runner.isFinished() ? runner.finishedAt : -Math.round(runner.dist / FreezeRules.COMPARE_STEP);
    }
}
