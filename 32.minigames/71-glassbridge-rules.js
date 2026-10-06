"use strict";
class GlassBridgeClipLengths {
}
GlassBridgeClipLengths.JUMP_FULL_SHORT_MS = 1170;
GlassBridgeClipLengths.SPAWN_AIR_MS = 1300;
GlassBridgeClipLengths.INTERACT_MS = 1300;
GlassBridgeClipLengths.DEATH_B_MS = 2630;
GlassBridgeClipLengths.CHEERING_MS = 1670;
class GlassBridgeRules {
}
GlassBridgeRules.ROW_COUNT = 10;
GlassBridgeRules.SIDE_COUNT = 2;
GlassBridgeRules.PLAY_MS = 120000;
GlassBridgeRules.END_GRACE_MS = 600;
GlassBridgeRules.ALL_ARRIVED_DELAY_MS = 2500;
GlassBridgeRules.LOTTERY_MS = 8000;
GlassBridgeRules.LINEUP_MS = 1800;
GlassBridgeRules.CHOICE_MS = 4000;
GlassBridgeRules.HOST_GRACE_MS = 350;
GlassBridgeRules.ENTER_MS = 600;
GlassBridgeRules.AUTO_ROW_MS = 350;
GlassBridgeRules.JUMP_PLAYBACK_SPEED = 1.3;
GlassBridgeRules.JUMP_MS = Math.round(GlassBridgeClipLengths.JUMP_FULL_SHORT_MS / GlassBridgeRules.JUMP_PLAYBACK_SPEED);
GlassBridgeRules.CONTACT_MS = Math.round(GlassBridgeRules.JUMP_MS * 0.55);
GlassBridgeRules.FALL_MS = 900;
GlassBridgeRules.LAVA_HOLD_MS = 900;
GlassBridgeRules.FALL_NEXT_MS = GlassBridgeRules.CONTACT_MS + 600;
GlassBridgeRules.TIMEOUT_NEXT_MS = 1100;
GlassBridgeRules.AI_LOTTERY_MIN_MS = 600;
GlassBridgeRules.AI_LOTTERY_MAX_MS = 4500;
GlassBridgeRules.AI_CHOICE_MIN_MS = 1000;
GlassBridgeRules.AI_CHOICE_MAX_MS = 3500;
GlassBridgeRules.MAX_STEPS_PER_TICK = 24;
class GlassBridgeSeedHash {
    static unit(text) {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++)
            hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        return new SeededRandom(hash >>> 0).next();
    }
    static between(text, low, high) {
        return low + GlassBridgeSeedHash.unit(text) * (high - low);
    }
}
class GlassBridgeLayout {
    static rowZ(row) {
        return -(row + 0.5) * GlassBridgeLayout.ROW_LENGTH;
    }
    static sideX(side) {
        return side === 0 ? -GlassBridgeLayout.SIDE_OFFSET : GlassBridgeLayout.SIDE_OFFSET;
    }
    static bridgeEndZ(rows) {
        return -rows * GlassBridgeLayout.ROW_LENGTH;
    }
    static midZ(rows) {
        return (GlassBridgeLayout.bridgeEndZ(rows) + GlassBridgeLayout.QUEUE_START_Z) / 2;
    }
    static queueZ(index) {
        return GlassBridgeLayout.QUEUE_START_Z + index * GlassBridgeLayout.QUEUE_GAP;
    }
    static platformSlotX(index, count) {
        return (index - (count - 1) / 2) * GlassBridgeLayout.SPOT_GAP;
    }
    static platformZ(rows) {
        return GlassBridgeLayout.bridgeEndZ(rows) - 2.4;
    }
}
GlassBridgeLayout.ROW_LENGTH = 2.4;
GlassBridgeLayout.SIDE_OFFSET = 1.2;
GlassBridgeLayout.ENTRANCE_Z = 0.5;
GlassBridgeLayout.QUEUE_START_Z = 1.9;
GlassBridgeLayout.QUEUE_GAP = 1.25;
GlassBridgeLayout.LOTTERY_BAG_Z = 3.4;
GlassBridgeLayout.LOTTERY_STAND_Z = 8.2;
GlassBridgeLayout.SPOT_GAP = 1.6;
GlassBridgeLayout.LAVA_Y = -16;
class GlassBridgePanels {
    constructor(rows) {
        this.rows = rows;
        this.brokenSides = new Array(rows).fill(-1);
        this.steppedAt = new Array(rows).fill(0);
    }
    reveal(row, brokenSide, at) {
        this.brokenSides[row] = brokenSide;
        this.steppedAt[row] = at;
    }
    knownCount() {
        let count = 0;
        while (count < this.rows && this.brokenSides[count] >= 0)
            count++;
        return count;
    }
    isKnown(row) {
        return row >= 0 && row < this.rows && this.brokenSides[row] >= 0;
    }
    brokenSide(row) {
        return this.brokenSides[row];
    }
    safeSide(row) {
        return 1 - this.brokenSides[row];
    }
    steppedTime(row) {
        return this.steppedAt[row];
    }
    statusAt(row, side, now) {
        if (!this.isKnown(row) || now < this.steppedAt[row] + GlassBridgeRules.CONTACT_MS)
            return "hidden";
        return side === this.brokenSides[row] ? "broken" : "confirmed";
    }
}
class GlassBridgeLottery {
    constructor(ids) {
        this.ids = ids;
        this.draws = new Map();
    }
    bagCount() {
        return this.ids.length;
    }
    accept(record) {
        const valid = this.ids.indexOf(record.id) >= 0 && !this.draws.has(record.id)
            && record.b >= 0 && record.b < this.bagCount() && record.n >= 1 && record.n <= this.bagCount()
            && this.bagOwner(record.b) === null && this.numberOwner(record.n) === null;
        if (valid)
            this.draws.set(record.id, record);
        return valid;
    }
    hasDrawn(id) {
        return this.draws.has(id);
    }
    drawOf(id) {
        return this.draws.get(id) || null;
    }
    bagOwner(bag) {
        let owner = null;
        this.draws.forEach((record, id) => { if (record.b === bag)
            owner = id; });
        return owner;
    }
    numberOwner(number) {
        let owner = null;
        this.draws.forEach((record, id) => { if (record.n === number)
            owner = id; });
        return owner;
    }
    freeBags() {
        return Array.from({ length: this.bagCount() }, (unused, bag) => bag).filter((bag) => this.bagOwner(bag) === null);
    }
    freeNumbers() {
        return Array.from({ length: this.bagCount() }, (unused, index) => index + 1).filter((number) => this.numberOwner(number) === null);
    }
    undrawn() {
        return this.ids.filter((id) => !this.draws.has(id));
    }
    complete() {
        return this.draws.size === this.ids.length;
    }
    crossStartAt() {
        let latest = 0;
        this.draws.forEach((record) => { latest = Math.max(latest, record.t); });
        return latest + GlassBridgeRules.LINEUP_MS;
    }
    lineup() {
        const drawn = this.ids.filter((id) => this.draws.has(id)).sort((a, b) => this.draws.get(a).n - this.draws.get(b).n);
        return drawn.concat(this.undrawn());
    }
}
class GlassBridgeTurnQueue {
    constructor(order) {
        this.line = order.slice();
    }
    next() {
        return this.line.length ? this.line.shift() : null;
    }
    sendBack(id) {
        this.line.push(id);
    }
    snapshot() {
        return this.line;
    }
    isEmpty() {
        return this.line.length === 0;
    }
}
class GlassBridgeTurn {
    constructor(id, attempt, startAt, knownRows, rows) {
        this.id = id;
        this.attempt = attempt;
        this.startAt = startAt;
        this.knownRows = knownRows;
        this.rows = rows;
        this.steps = [];
        this.outcome = "running";
        this.endAt = 0;
        this.fallStartAt = 0;
        this.arrivalIndex = -1;
    }
    nextRow() {
        return this.knownRows + this.steps.length;
    }
    autoEndAt() {
        return this.startAt + GlassBridgeRules.ENTER_MS + this.knownRows * GlassBridgeRules.AUTO_ROW_MS;
    }
    nextOpensAt() {
        return this.steps.length === 0 ? this.autoEndAt() : this.steps[this.steps.length - 1].t + GlassBridgeRules.JUMP_MS;
    }
    nextOpensAtFor(stepIndex) {
        return stepIndex === 0 ? this.autoEndAt() : this.steps[stepIndex - 1].t + GlassBridgeRules.JUMP_MS;
    }
    nextClosesAt() {
        return this.nextOpensAt() + GlassBridgeRules.CHOICE_MS;
    }
    fallEndAt() {
        return this.fallStartAt + GlassBridgeRules.FALL_MS + GlassBridgeRules.LAVA_HOLD_MS;
    }
    rowsReachedBy(time) {
        let rows = 0;
        for (let row = 1; row <= this.knownRows; row++) {
            if (this.startAt + GlassBridgeRules.ENTER_MS + row * GlassBridgeRules.AUTO_ROW_MS <= time)
                rows = row;
        }
        this.steps.forEach((step) => {
            if (step.s >= 0 && step.s !== step.b && step.t + GlassBridgeRules.JUMP_MS <= time)
                rows = Math.max(rows, step.r + 1);
        });
        return rows;
    }
    rowsReachedAt(rows) {
        for (let row = 1; row <= this.knownRows; row++) {
            if (row >= rows)
                return this.startAt + GlassBridgeRules.ENTER_MS + row * GlassBridgeRules.AUTO_ROW_MS;
        }
        const step = this.steps.find((entry) => entry.s >= 0 && entry.s !== entry.b && entry.r + 1 >= rows);
        return step ? step.t + GlassBridgeRules.JUMP_MS : Infinity;
    }
}
class GlassBridgeTimeline {
    constructor(lineup, startAt, rows, panels = new GlassBridgePanels(rows)) {
        this.startAt = startAt;
        this.rows = rows;
        this.panels = panels;
        this.allTurns = [];
        this.latestByPlayer = new Map();
        this.active = null;
        this.arrivalCount = 0;
        this.attemptCount = 0;
        this.lastArrivalAt = 0;
        this.queue = new GlassBridgeTurnQueue(lineup);
        this.beginTurn(startAt);
    }
    turns() {
        return this.allTurns;
    }
    current() {
        return this.active;
    }
    latestTurn(id) {
        return this.latestByPlayer.get(id) || null;
    }
    waiting() {
        return this.queue.snapshot();
    }
    arrivals() {
        return this.arrivalCount;
    }
    lastArrival() {
        return this.lastArrivalAt;
    }
    isFinished() {
        return this.active === null;
    }
    openWindow() {
        const turn = this.active;
        if (!turn || turn.outcome !== "running")
            return null;
        return { id: turn.id, attempt: turn.attempt, row: turn.nextRow(), opensAt: turn.nextOpensAt(), closesAt: turn.nextClosesAt() };
    }
    apply(record) {
        const turn = this.active;
        if (!turn || record.id !== turn.id || record.a !== turn.attempt || record.r !== turn.nextRow())
            return false;
        if (record.s < -1 || record.s > 1 || (record.s >= 0 && (record.b < 0 || record.b > 1)))
            return false;
        const opensAt = turn.nextOpensAt();
        const t = MathUtil.clamp(record.t, opensAt, turn.nextClosesAt());
        turn.steps.push({ id: record.id, a: record.a, r: record.r, s: record.s, b: record.b, t });
        if (record.s < 0)
            this.settleFall(turn, t, t, GlassBridgeRules.TIMEOUT_NEXT_MS);
        else {
            this.panels.reveal(record.r, record.b, t);
            if (record.s === record.b)
                this.settleFall(turn, t, t + GlassBridgeRules.CONTACT_MS, GlassBridgeRules.FALL_NEXT_MS);
            else if (record.r === this.rows - 1)
                this.settleArrival(turn, t + GlassBridgeRules.JUMP_MS + GlassBridgeRules.AUTO_ROW_MS);
        }
        return true;
    }
    settleFall(turn, at, fallStart, nextDelay) {
        turn.outcome = "fell";
        turn.endAt = at + nextDelay;
        turn.fallStartAt = fallStart;
        this.queue.sendBack(turn.id);
        this.beginTurn(turn.endAt);
    }
    settleArrival(turn, at) {
        turn.outcome = "arrived";
        turn.endAt = at;
        turn.arrivalIndex = this.arrivalCount++;
        this.lastArrivalAt = at;
        this.beginTurn(at);
    }
    beginTurn(startAt) {
        let at = startAt;
        for (;;) {
            const id = this.queue.next();
            if (id === null) {
                this.active = null;
                return;
            }
            const turn = new GlassBridgeTurn(id, this.attemptCount++, at, this.panels.knownCount(), this.rows);
            this.allTurns.push(turn);
            this.latestByPlayer.set(id, turn);
            this.active = turn;
            if (turn.knownRows < this.rows)
                return;
            at = turn.autoEndAt() + GlassBridgeRules.AUTO_ROW_MS;
            turn.outcome = "arrived";
            turn.endAt = at;
            turn.arrivalIndex = this.arrivalCount++;
            this.lastArrivalAt = at;
        }
    }
}
class GlassBridgeStandings {
    constructor(ids, timeline, endAt) {
        this.ids = ids;
        this.timeline = timeline;
        this.endAt = endAt;
    }
    entries() {
        const list = this.ids.map((id) => this.standingOf(id));
        return list.sort((a, b) => this.compare(a, b));
    }
    ranking() {
        const list = this.entries();
        return list.map((entry, index) => {
            let first = index;
            while (first > 0 && this.compare(list[first - 1], entry) === 0)
                first--;
            return { id: entry.id, rank: first + 1 };
        });
    }
    standingOf(id) {
        let rows = 0;
        let at = Infinity;
        let falls = 0;
        const timeline = this.timeline;
        if (timeline) {
            timeline.turns().forEach((turn) => {
                if (turn.id !== id)
                    return;
                if (turn.outcome === "fell" && turn.fallStartAt <= this.endAt)
                    falls++;
                const reached = turn.rowsReachedBy(this.endAt);
                if (reached > rows) {
                    rows = reached;
                    at = turn.rowsReachedAt(reached);
                }
            });
        }
        const total = timeline ? timeline.rows : 0;
        return { id, rows, at, arrived: total > 0 && rows >= total, falls };
    }
    compare(a, b) {
        if (a.arrived !== b.arrived)
            return a.arrived ? -1 : 1;
        if (a.rows !== b.rows)
            return b.rows - a.rows;
        if (a.at !== b.at)
            return a.at < b.at ? -1 : 1;
        return 0;
    }
}
class GlassPoseBuilder {
    static make(kind, x, z, sinceMs, y = 0, facing = GlassPoseBuilder.FORWARD, tumble = 0) {
        return { kind, x, y, z, facing, sinceMs, tumble };
    }
}
GlassPoseBuilder.FORWARD = 0;
GlassPoseBuilder.BACKWARD = Math.PI;
class GlassBridgeChoreography {
    constructor(ids, lottery, rows) {
        this.ids = ids;
        this.lottery = lottery;
        this.rows = rows;
    }
    poseOf(timeline, id, now) {
        if (!timeline)
            return this.lotteryPose(id, now);
        const turn = timeline.latestTurn(id);
        if (!turn)
            return this.queuedPose(timeline, id, now, Infinity);
        if (turn.outcome === "arrived" && now >= turn.endAt)
            return this.arrivedPose(turn, now);
        if (turn.outcome === "fell" && now >= turn.fallEndAt())
            return this.queuedPose(timeline, id, now, now - turn.fallEndAt());
        if (now < turn.startAt)
            return this.queuedPose(timeline, id, now, Infinity);
        return this.turnPose(timeline, turn, now);
    }
    displayQueue(timeline, now) {
        const list = [];
        const active = timeline.current();
        if (active && now < active.startAt)
            list.push(active.id);
        timeline.waiting().forEach((id) => {
            const turn = timeline.latestTurn(id);
            const falling = turn !== null && turn.outcome === "fell" && now < turn.fallEndAt();
            if (!falling)
                list.push(id);
        });
        return list;
    }
    lotteryPose(id, now) {
        const spot = this.ids.indexOf(id);
        const x = GlassBridgeLayout.platformSlotX(spot, this.ids.length);
        const draw = this.lottery.drawOf(id);
        const since = draw ? now - draw.t : Infinity;
        const kind = since >= 0 && since < GlassBridgeClipLengths.INTERACT_MS ? "draw" : "lottery";
        return GlassPoseBuilder.make(kind, x, GlassBridgeLayout.LOTTERY_STAND_Z, Math.max(0, since), 0, GlassPoseBuilder.FORWARD);
    }
    queuedPose(timeline, id, now, sinceRespawnMs) {
        const queue = this.displayQueue(timeline, now);
        const index = Math.max(0, queue.indexOf(id));
        const kind = sinceRespawnMs < GlassBridgeClipLengths.SPAWN_AIR_MS ? "spawn" : "queued";
        return GlassPoseBuilder.make(kind, 0, GlassBridgeLayout.queueZ(index), kind === "spawn" ? sinceRespawnMs : 0);
    }
    arrivedPose(turn, now) {
        return GlassPoseBuilder.make("arrived", GlassBridgeLayout.platformSlotX(turn.arrivalIndex, this.ids.length), GlassBridgeLayout.platformZ(this.rows), now - turn.endAt, 0, GlassPoseBuilder.BACKWARD);
    }
    turnPose(timeline, turn, now) {
        const panels = timeline.panels;
        const spot = (row, side) => ({ x: GlassBridgeLayout.sideX(side), z: GlassBridgeLayout.rowZ(row) });
        const entrance = { x: 0, z: GlassBridgeLayout.ENTRANCE_Z };
        const head = { x: 0, z: GlassBridgeLayout.queueZ(0) };
        const t = now - turn.startAt;
        if (t < GlassBridgeRules.ENTER_MS)
            return this.between("walk", head, entrance, t / GlassBridgeRules.ENTER_MS, t);
        let from = entrance;
        for (let row = 0; row < turn.knownRows; row++) {
            const target = spot(row, panels.safeSide(row));
            const segmentStart = GlassBridgeRules.ENTER_MS + row * GlassBridgeRules.AUTO_ROW_MS;
            if (t < segmentStart + GlassBridgeRules.AUTO_ROW_MS)
                return this.between("run", from, target, (t - segmentStart) / GlassBridgeRules.AUTO_ROW_MS, t - segmentStart);
            from = target;
        }
        if (turn.knownRows >= this.rows)
            return this.runToPlatform(from, turn, t - (GlassBridgeRules.ENTER_MS + turn.knownRows * GlassBridgeRules.AUTO_ROW_MS));
        let standing = from;
        for (let index = 0; index < turn.steps.length; index++) {
            const step = turn.steps[index];
            const since = now - step.t;
            if (since < 0)
                return GlassPoseBuilder.make("wait", standing.x, standing.z, now - turn.nextOpensAtFor(index), 0, GlassPoseBuilder.FORWARD);
            if (step.s < 0)
                return this.fallPose(standing, since);
            const target = spot(step.r, step.s);
            if (step.s === step.b) {
                if (since < GlassBridgeRules.CONTACT_MS)
                    return this.between("jump", standing, target, since / GlassBridgeRules.CONTACT_MS, since);
                return this.fallPose(target, since - GlassBridgeRules.CONTACT_MS);
            }
            if (since < GlassBridgeRules.JUMP_MS)
                return this.between("jump", standing, target, since / GlassBridgeRules.JUMP_MS, since);
            standing = target;
            if (step.r === this.rows - 1)
                return this.runToPlatform(standing, turn, since - GlassBridgeRules.JUMP_MS);
        }
        return GlassPoseBuilder.make("wait", standing.x, standing.z, now - turn.nextOpensAt(), 0, GlassPoseBuilder.FORWARD);
    }
    runToPlatform(from, turn, sinceMs) {
        const slot = { x: GlassBridgeLayout.platformSlotX(Math.max(0, turn.arrivalIndex), this.ids.length), z: GlassBridgeLayout.platformZ(this.rows) };
        return this.between("run", from, slot, MathUtil.clamp(sinceMs / GlassBridgeRules.AUTO_ROW_MS, 0, 1), sinceMs);
    }
    fallPose(from, sinceMs) {
        if (sinceMs >= GlassBridgeRules.FALL_MS)
            return GlassPoseBuilder.make("lava", from.x, from.z, sinceMs - GlassBridgeRules.FALL_MS, GlassBridgeLayout.LAVA_Y);
        const ratio = sinceMs / GlassBridgeRules.FALL_MS;
        return GlassPoseBuilder.make("fall", from.x, from.z, sinceMs, GlassBridgeLayout.LAVA_Y * ratio * ratio, GlassPoseBuilder.FORWARD, ratio);
    }
    between(kind, from, to, ratio, sinceMs) {
        const clamped = MathUtil.clamp(ratio, 0, 1);
        const lift = kind === "jump" ? Math.sin(clamped * Math.PI) * 0.9 : 0;
        const dx = to.x - from.x, dz = to.z - from.z;
        const facing = Math.abs(dx) > 0.01 && Math.abs(dx) > Math.abs(dz) ? Math.atan2(dx, -dz) * 0.5 : GlassPoseBuilder.FORWARD;
        return GlassPoseBuilder.make(kind, MathUtil.lerp(from.x, to.x, clamped), MathUtil.lerp(from.z, to.z, clamped), sinceMs, lift, facing);
    }
}
