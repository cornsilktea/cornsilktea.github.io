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
GlassBridgeRules.ROW_COUNT = 15;
GlassBridgeRules.SIDE_COUNT = 2;
GlassBridgeRules.PLAY_MS = 150000;
GlassBridgeRules.END_GRACE_MS = 600;
GlassBridgeRules.ALL_ARRIVED_DELAY_MS = 2500;
GlassBridgeRules.LOTTERY_MS = 8000;
GlassBridgeRules.LINEUP_MS = 1800;
GlassBridgeRules.CHOICE_MS = 6000;
GlassBridgeRules.HOST_GRACE_MS = 350;
GlassBridgeRules.ENTER_MS = 600;
GlassBridgeRules.AUTO_ROW_MS = 250;
GlassBridgeRules.FOLLOW_DELAY_MS = 150;
GlassBridgeRules.TIMEOUT_FOLLOW_MS = 300;
GlassBridgeRules.WALK_MIN_MS = 500;
GlassBridgeRules.JUMP_PLAYBACK_SPEED = 1.3;
GlassBridgeRules.JUMP_MS = Math.round(GlassBridgeClipLengths.JUMP_FULL_SHORT_MS / GlassBridgeRules.JUMP_PLAYBACK_SPEED);
GlassBridgeRules.CONTACT_MS = Math.round(GlassBridgeRules.JUMP_MS * 0.55);
GlassBridgeRules.FALL_MS = 900;
GlassBridgeRules.LAVA_HOLD_MS = 700;
GlassBridgeRules.AI_LOTTERY_MIN_MS = 600;
GlassBridgeRules.AI_LOTTERY_MAX_MS = 4500;
GlassBridgeRules.AI_CHOICE_MIN_MS = 1200;
GlassBridgeRules.AI_CHOICE_MAX_MS = 4500;
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
class GlassBridgeTrack {
    constructor(home) {
        this.home = home;
        this.segments = [];
        this.landings = [];
        this.dropTimes = [];
        this.arrivalAt = -1;
        this.arrivalNumber = 0;
    }
    restPoint() {
        const last = this.segments[this.segments.length - 1];
        return last ? last.to : this.home;
    }
    add(segment) {
        this.segments.push(segment);
        if (segment.kind === "drop")
            this.dropTimes.push(segment.start);
        if (segment.arrives)
            this.arrivalAt = segment.start + segment.duration;
    }
    land(rows, at) {
        this.landings.push({ rows, at });
    }
    activeAt(now) {
        for (let index = this.segments.length - 1; index >= 0; index--) {
            if (this.segments[index].start <= now)
                return this.segments[index];
        }
        return null;
    }
    bestBy(time) {
        let best = { rows: 0, at: Infinity };
        this.landings.forEach((landing) => {
            if (landing.at <= time && landing.rows > best.rows)
                best = landing;
        });
        return best;
    }
    fallsBy(time) {
        return this.dropTimes.filter((at) => at <= time).length;
    }
    hasArrived(now) {
        return this.arrivalAt >= 0 && now >= this.arrivalAt;
    }
}
class GlassBridgeTimeline {
    constructor(lineup, startAt, rows, panels = new GlassBridgePanels(rows)) {
        this.startAt = startAt;
        this.rows = rows;
        this.panels = panels;
        this.tracks = new Map();
        this.pending = [];
        this.leaderId = null;
        this.leaderSlot = -2;
        this.attempt = -1;
        this.attemptCount = 0;
        this.arrivalCount = 0;
        this.lastArrivalAt = 0;
        this.playerCount = lineup.length;
        this.line = lineup.slice();
        lineup.forEach((id, index) => this.tracks.set(id, new GlassBridgeTrack(this.pointOf(-2 - index, 0))));
        this.clock = startAt;
        this.readyAt = startAt;
        this.settle();
    }
    trackOf(id) {
        return this.tracks.get(id);
    }
    leader() {
        return this.leaderId;
    }
    leaderReadyAt() {
        return this.readyAt;
    }
    arrivals() {
        return this.arrivalCount;
    }
    lastArrival() {
        return this.lastArrivalAt;
    }
    isFinished() {
        return this.leaderId === null && this.line.length === 0 && this.pending.length === 0;
    }
    openWindow() {
        if (this.leaderId === null)
            return null;
        return { id: this.leaderId, attempt: this.attempt, row: this.panels.knownCount(), opensAt: this.readyAt, closesAt: this.readyAt + GlassBridgeRules.CHOICE_MS };
    }
    respawnPoint(id) {
        const rank = this.pending.findIndex((entry) => entry.id === id);
        if (rank < 0)
            return null;
        const slot = this.line.length === 0 ? -2 - rank : this.leaderSlot - this.line.length - rank;
        return this.pointOf(slot, 0);
    }
    apply(record) {
        const window = this.openWindow();
        if (!window || record.id !== window.id || record.a !== window.attempt || record.r !== window.row)
            return false;
        if (record.s < -1 || record.s > 1 || (record.s >= 0 && (record.b < 0 || record.b > 1)))
            return false;
        const t = MathUtil.clamp(record.t, window.opensAt, window.closesAt);
        this.clock = t;
        this.releaseRespawns(t);
        const leaderTrack = this.trackOf(window.id);
        const standing = leaderTrack.restPoint();
        if (record.s < 0) {
            this.dropLeader(t, standing, t + GlassBridgeRules.TIMEOUT_FOLLOW_MS);
            return true;
        }
        const target = this.pointOf(record.r, 0, record.s);
        this.panels.reveal(record.r, record.b, t);
        if (record.s === record.b) {
            leaderTrack.add({ kind: "jump", start: t, duration: GlassBridgeRules.CONTACT_MS, from: standing, to: target, arrives: false });
            this.dropLeader(t + GlassBridgeRules.CONTACT_MS, target, t + GlassBridgeRules.CONTACT_MS + GlassBridgeRules.FOLLOW_DELAY_MS);
            return true;
        }
        this.stepLine(t, GlassBridgeRules.JUMP_MS, target);
        this.clock = t + GlassBridgeRules.JUMP_MS;
        this.settle();
        return true;
    }
    frontierSlot() {
        const known = this.panels.knownCount();
        return known >= this.rows ? this.rows : known - 1;
    }
    pointOf(slot, arrivalIndex, sideOverride = -1) {
        if (slot >= this.rows)
            return { x: GlassBridgeLayout.platformSlotX(arrivalIndex, this.playerCount), z: GlassBridgeLayout.platformZ(this.rows) };
        if (slot >= 0)
            return { x: GlassBridgeLayout.sideX(sideOverride >= 0 ? sideOverride : this.panels.safeSide(slot)), z: GlassBridgeLayout.rowZ(slot) };
        if (slot === -1)
            return { x: 0, z: GlassBridgeLayout.ENTRANCE_Z };
        return { x: 0, z: GlassBridgeLayout.queueZ(-2 - slot) };
    }
    dropLeader(at, point, followAt) {
        const id = this.line.shift();
        const duration = GlassBridgeRules.FALL_MS + GlassBridgeRules.LAVA_HOLD_MS;
        this.trackOf(id).add({ kind: "drop", start: at, duration, from: point, to: point, arrives: false });
        this.pending.push({ id, at: at + duration });
        this.pending.sort((a, b) => a.at - b.at);
        this.leaderSlot--;
        this.leaderId = null;
        this.clock = followAt;
        this.settle();
    }
    releaseRespawns(time) {
        while (this.pending.length && this.pending[0].at <= time) {
            const entry = this.pending.shift();
            const wasEmpty = this.line.length === 0;
            if (wasEmpty)
                this.leaderSlot = -2;
            const point = this.pointOf(this.leaderSlot - this.line.length, 0);
            this.trackOf(entry.id).add({ kind: "spawn", start: entry.at, duration: GlassBridgeClipLengths.SPAWN_AIR_MS, from: point, to: point, arrives: false });
            this.line.push(entry.id);
            if (wasEmpty)
                this.clock = Math.max(this.clock, entry.at + GlassBridgeClipLengths.SPAWN_AIR_MS);
        }
    }
    settle() {
        for (let guard = 0; guard < 400; guard++) {
            this.releaseRespawns(this.clock);
            if (this.line.length === 0) {
                if (this.pending.length === 0) {
                    this.leaderId = null;
                    this.readyAt = this.clock;
                    return;
                }
                this.clock = Math.max(this.clock, this.pending[0].at);
                continue;
            }
            if (this.leaderId !== this.line[0]) {
                this.leaderId = this.line[0];
                this.attempt = this.attemptCount++;
            }
            if (this.leaderSlot >= this.frontierSlot()) {
                this.readyAt = this.clock;
                return;
            }
            const duration = this.leaderSlot < -1 ? GlassBridgeRules.ENTER_MS : GlassBridgeRules.AUTO_ROW_MS;
            this.stepLine(this.clock, duration, null);
            this.clock += duration;
        }
    }
    stepLine(at, duration, leaderTarget) {
        let arrived = false;
        this.line.forEach((id, index) => {
            const track = this.trackOf(id);
            const toSlot = this.leaderSlot - index + 1;
            const from = track.restPoint();
            const arrives = toSlot >= this.rows;
            const to = index === 0 && leaderTarget ? leaderTarget : this.pointOf(toSlot, this.arrivalCount);
            const kind = index === 0 && leaderTarget ? "jump" : duration >= GlassBridgeRules.WALK_MIN_MS ? "walk" : "run";
            track.add({ kind, start: at, duration, from, to, arrives });
            if (toSlot >= 0)
                track.land(Math.min(toSlot, this.rows - 1) + 1, at + duration);
            if (arrives) {
                track.arrivalNumber = ++this.arrivalCount;
                this.lastArrivalAt = at + duration;
                arrived = true;
            }
        });
        this.leaderSlot++;
        if (arrived) {
            this.line.shift();
            this.leaderSlot--;
            this.leaderId = null;
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
        const timeline = this.timeline;
        if (!timeline)
            return { id, rows: 0, at: Infinity, arrived: false, falls: 0 };
        const track = timeline.trackOf(id);
        const best = track.bestBy(this.endAt);
        return { id, rows: best.rows, at: best.at, arrived: best.rows >= timeline.rows, falls: track.fallsBy(this.endAt) };
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
        const track = timeline.trackOf(id);
        const segment = track.activeAt(now);
        if (!segment)
            return this.restPose(timeline, id, track.home, now);
        const since = now - segment.start;
        if (segment.kind === "drop")
            return since < segment.duration ? this.fallPose(segment.from, since) : this.respawnPose(timeline, id, segment, now);
        if (segment.kind === "spawn")
            return since < segment.duration ? GlassPoseBuilder.make("spawn", segment.to.x, segment.to.z, since) : this.restPose(timeline, id, segment.to, now);
        if (since < segment.duration)
            return this.between(segment.kind, segment.from, segment.to, since / segment.duration, since);
        return this.restPose(timeline, id, segment.to, now);
    }
    lotteryPose(id, now) {
        const spot = this.ids.indexOf(id);
        const x = GlassBridgeLayout.platformSlotX(spot, this.ids.length);
        const draw = this.lottery.drawOf(id);
        const since = draw ? now - draw.t : Infinity;
        const kind = since >= 0 && since < GlassBridgeClipLengths.INTERACT_MS ? "draw" : "lottery";
        return GlassPoseBuilder.make(kind, x, GlassBridgeLayout.LOTTERY_STAND_Z, Math.max(0, since), 0, GlassPoseBuilder.FORWARD);
    }
    restPose(timeline, id, point, now) {
        const track = timeline.trackOf(id);
        if (track.hasArrived(now))
            return GlassPoseBuilder.make("arrived", point.x, point.z, now - track.arrivalAt, 0, GlassPoseBuilder.BACKWARD);
        if (timeline.leader() === id && now >= timeline.leaderReadyAt())
            return GlassPoseBuilder.make("wait", point.x, point.z, now - timeline.leaderReadyAt());
        return GlassPoseBuilder.make("queued", point.x, point.z, 0);
    }
    respawnPose(timeline, id, drop, now) {
        const point = timeline.respawnPoint(id);
        if (!point)
            return this.fallPose(drop.from, drop.duration);
        const since = now - (drop.start + drop.duration);
        return since < GlassBridgeClipLengths.SPAWN_AIR_MS ? GlassPoseBuilder.make("spawn", point.x, point.z, since) : GlassPoseBuilder.make("queued", point.x, point.z, 0);
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
