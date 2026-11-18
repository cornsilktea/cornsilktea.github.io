"use strict";
class ClimbBalance {
}
ClimbBalance.TICK = 1 / 120;
ClimbBalance.FRAME_CAP = 0.1;
ClimbBalance.RUN = 7;
ClimbBalance.GROUND_ACCEL = 40;
ClimbBalance.AIR_ACCEL = 12;
ClimbBalance.STOP_TIME = 0.05;
ClimbBalance.GRAVITY = 28;
ClimbBalance.JUMP = 9.5;
ClimbBalance.COYOTE = 0.12;
ClimbBalance.JUMP_BUFFER = 0.15;
ClimbBalance.FALL_MAX = 35;
ClimbBalance.SLOPE_LIMIT_DEG = 40;
ClimbBalance.PAD_SPEED = 15;
ClimbBalance.RADIUS = 0.4;
ClimbBalance.HEIGHT = 2;
ClimbBalance.STEP = 0.35;
ClimbBalance.GRAB_LOW = 1.2;
ClimbBalance.GRAB_HIGH = 2.6;
ClimbBalance.GRAB_SIDE = 1;
ClimbBalance.GRAB_SIDE_AIR = 1.4;
ClimbBalance.GRAB_LOW_AIR = 0.9;
ClimbBalance.GRAB_HIGH_AIR = 2.8;
ClimbBalance.GRAB_FACE_COS = 0.4;
ClimbBalance.CLEAR_MARGIN = 0.15;
ClimbBalance.GRAB_SWING = 0.2;
ClimbBalance.HANG_DROP = 2;
ClimbBalance.MANTLE_MIN_HANG = 0.2;
ClimbBalance.MANTLE_PUSH = 0.5;
ClimbBalance.MANTLE_INSET = 0.55;
ClimbBalance.MANTLE_INSETS = [ClimbBalance.MANTLE_INSET, 0.35, 0.2];
ClimbBalance.CLIMB_UP_TIME = 0.5;
ClimbBalance.CLIMB_UP_RISE_SHARE = 0.6;
ClimbBalance.CLIMB_UP_LIFT = 0.15;
ClimbBalance.HOP_TIME = 0.2;
ClimbBalance.HOP_UP = 1.6;
ClimbBalance.HOP_MIN = 0.2;
ClimbBalance.HOP_SIDE = 1.3;
ClimbBalance.SHIFT_LEVEL = 0.6;
ClimbBalance.SHIFT_COOLDOWN = 0.3;
ClimbBalance.REGRAB = 0.2;
ClimbBalance.SLOW_SCALE = 0.3;
ClimbBalance.SLOW_BLEND = 0.15;
ClimbBalance.PORTAL_RADIUS = 1.2;
ClimbBalance.PORTAL_TIME = 1.5;
ClimbBalance.PORTAL_DROP = 1.5;
ClimbBalance.HOME_FALL = 6;
ClimbBalance.STUN = 0.9;
ClimbBalance.VOID_Y = -20;
ClimbBalance.REST_SIDE = 3;
ClimbBalance.ICE_ACCEL = 8;
ClimbBalance.ICE_BRAKE = 5;
ClimbBalance.CRUMBLE_DELAY = 0.7;
ClimbBalance.CRUMBLE_GONE = 3;
ClimbBalance.KNOCK_SPEED = 9;
ClimbBalance.KNOCK_UP = 6;
ClimbBalance.KNOCK_TIME = 0.4;
ClimbBalance.KNOCK_AGAIN = 0.5;
ClimbBalance.GUST_RAMP = 0.4;
ClimbBalance.WIND_GRIP = 0.5;
ClimbBalance.STAGE_COUNT = 7;
ClimbBalance.TOP = 200;
ClimbBalance.GRID_CELL = 4;
class PlatformPiece {
    constructor(spec) {
        this.index = 0;
        this.id = spec.id;
        this.stage = spec.stage;
        this.x = spec.x;
        this.z = spec.z;
        this.top = spec.y;
        this.depth = spec.depth ?? 0.6;
        this.yaw = spec.yaw ?? 0;
        this.radius = spec.radius ?? 0;
        this.halfX = this.radius > 0 ? this.radius : (spec.sx ?? 1) / 2;
        this.halfZ = this.radius > 0 ? this.radius : (spec.sz ?? 1) / 2;
        this.rise = spec.rise ?? 0;
        this.look = spec.look ?? "";
        this.startOf = spec.startOf ?? 0;
        this.cos = Math.cos(this.yaw);
        this.sin = Math.sin(this.yaw);
        this.ledgeAllowed = !spec.noLedge;
    }
    get solid() { return true; }
    get moving() { return false; }
    get hazard() { return false; }
    get accel() { return ClimbBalance.GROUND_ACCEL; }
    get brake() { return ClimbBalance.RUN / ClimbBalance.STOP_TIME; }
    get windGrip() { return ClimbBalance.WIND_GRIP; }
    get ledge() { return this.ledgeAllowed && this.rise === 0; }
    get hub() { return false; }
    get round() { return this.radius > 0; }
    get bottom() { return this.top - Math.abs(this.rise) / 2 - this.depth; }
    get peak() { return this.top + Math.abs(this.rise) / 2; }
    get span() { return this.round ? this.radius : Math.hypot(this.halfX, this.halfZ); }
    get rest() { return this.solid && this.rise === 0 && Math.min(this.halfX, this.halfZ) * 2 >= ClimbBalance.REST_SIDE; }
    get slopeDeg() { return Math.atan2(Math.abs(this.rise), this.halfX * 2) * 180 / Math.PI; }
    localX(px, pz) { return (px - this.x) * this.cos - (pz - this.z) * this.sin; }
    localZ(px, pz) { return (px - this.x) * this.sin + (pz - this.z) * this.cos; }
    worldX(lx, lz) { return this.x + lx * this.cos + lz * this.sin; }
    worldZ(lx, lz) { return this.z - lx * this.sin + lz * this.cos; }
    covers(px, pz) {
        if (this.round) {
            const dx = px - this.x, dz = pz - this.z;
            return dx * dx + dz * dz <= this.radius * this.radius;
        }
        return Math.abs(this.localX(px, pz)) <= this.halfX && Math.abs(this.localZ(px, pz)) <= this.halfZ;
    }
    topAt(px, pz) {
        if (this.rise === 0)
            return this.top;
        const along = Math.max(-1, Math.min(1, this.localX(px, pz) / this.halfX));
        return this.top + this.rise * along / 2;
    }
    edge(px, pz, out) {
        if (this.round) {
            const dx = px - this.x, dz = pz - this.z, d = Math.hypot(dx, dz);
            out.nx = d > 1e-6 ? dx / d : 1;
            out.nz = d > 1e-6 ? dz / d : 0;
            out.x = this.x + out.nx * this.radius;
            out.z = this.z + out.nz * this.radius;
            out.inside = d < this.radius;
            out.dist = Math.abs(d - this.radius);
            return out;
        }
        const lx = this.localX(px, pz), lz = this.localZ(px, pz);
        let ex, ez, nlx, nlz;
        const inside = Math.abs(lx) < this.halfX && Math.abs(lz) < this.halfZ;
        if (inside) {
            const gapX = this.halfX - Math.abs(lx), gapZ = this.halfZ - Math.abs(lz);
            if (gapX < gapZ) {
                nlx = lx < 0 ? -1 : 1;
                nlz = 0;
                ex = nlx * this.halfX;
                ez = lz;
                out.dist = gapX;
            }
            else {
                nlx = 0;
                nlz = lz < 0 ? -1 : 1;
                ex = lx;
                ez = nlz * this.halfZ;
                out.dist = gapZ;
            }
        }
        else {
            ex = Math.max(-this.halfX, Math.min(this.halfX, lx));
            ez = Math.max(-this.halfZ, Math.min(this.halfZ, lz));
            const d = Math.hypot(lx - ex, lz - ez);
            nlx = d > 1e-6 ? (lx - ex) / d : 1;
            nlz = d > 1e-6 ? (lz - ez) / d : 0;
            out.dist = d;
        }
        out.inside = inside;
        out.x = this.worldX(ex, ez);
        out.z = this.worldZ(ex, ez);
        out.nx = nlx * this.cos + nlz * this.sin;
        out.nz = -nlx * this.sin + nlz * this.cos;
        return out;
    }
    rayEnter(ox, oy, oz, dx, dy, dz, limit) {
        const lox = this.localX(ox, oz), loz = this.localZ(ox, oz);
        const ldx = dx * this.cos - dz * this.sin, ldz = dx * this.sin + dz * this.cos;
        let near = 0, far = limit;
        const lows = [-this.halfX, this.bottom, -this.halfZ], highs = [this.halfX, this.peak, this.halfZ];
        const origin = [lox, oy, loz], dir = [ldx, dy, ldz];
        for (let axis = 0; axis < 3; axis++) {
            if (Math.abs(dir[axis]) < 1e-9) {
                if (origin[axis] < lows[axis] || origin[axis] > highs[axis])
                    return limit;
                continue;
            }
            let a = (lows[axis] - origin[axis]) / dir[axis], b = (highs[axis] - origin[axis]) / dir[axis];
            if (a > b) {
                const swap = a;
                a = b;
                b = swap;
            }
            near = Math.max(near, a);
            far = Math.min(far, b);
            if (near > far)
                return limit;
        }
        return near;
    }
    stand(_rules) { }
}
class StaticPlatform extends PlatformPiece {
}
class NarrowPlatform extends PlatformPiece {
}
class SlopePlatform extends PlatformPiece {
    get ledge() { return false; }
}
class HubIsland extends PlatformPiece {
    get hub() { return true; }
    get ledge() { return false; }
}
class StageRest extends PlatformPiece {
    stand(rules) { rules.touchStageStart(this.startOf); }
}
class SummitGoal extends PlatformPiece {
    get ledge() { return false; }
    stand(rules) { rules.reachSummit(); }
}
class JumpPad extends PlatformPiece {
    get ledge() { return false; }
    stand(rules) { rules.bounce(this); }
}
class IcePlatform extends PlatformPiece {
    get accel() { return ClimbBalance.ICE_ACCEL; }
    get brake() { return ClimbBalance.ICE_BRAKE; }
    get windGrip() { return 0; }
}
class CrumblePlatform extends PlatformPiece {
    constructor() {
        super(...arguments);
        this.since = -1;
        this.now = 0;
    }
    reset() { this.since = -1; this.now = 0; }
    get age() { return this.since < 0 ? -1 : this.now - this.since; }
    get gone() { return this.age >= ClimbBalance.CRUMBLE_DELAY; }
    get shaking() { const age = this.age; return age < 0 || this.gone ? 0 : age / ClimbBalance.CRUMBLE_DELAY; }
    get fallTime() { return this.gone ? this.age - ClimbBalance.CRUMBLE_DELAY : 0; }
    get solid() { return !this.gone; }
    get ledge() { return super.ledge && !this.gone; }
    update(seconds, rules) {
        const wasGone = this.gone;
        this.now = seconds;
        if (this.age >= ClimbBalance.CRUMBLE_DELAY + ClimbBalance.CRUMBLE_GONE)
            this.since = -1;
        if (!wasGone && this.gone)
            rules.emit({ t: "crumble", piece: this.id });
    }
    stand(rules) { if (this.since < 0)
        this.since = rules.worldTime; }
}
class ClimbHazard extends PlatformPiece {
    get solid() { return false; }
    get ledge() { return false; }
    get hazard() { return true; }
    overlapsBody(body) { return body.y < this.top && body.y + ClimbBalance.HEIGHT > this.bottom; }
}
class SweeperBar extends ClimbHazard {
    constructor(spec) {
        super(spec);
        this.spin = spec.spin ?? { rate: 1, phase: 0 };
        this.update(0);
    }
    angleAt(seconds) { return this.spin.phase + this.spin.rate * seconds; }
    update(seconds) { this.yaw = this.angleAt(seconds); this.cos = Math.cos(this.yaw); this.sin = Math.sin(this.yaw); }
    hits(body) {
        if (!this.overlapsBody(body))
            return false;
        const R = ClimbBalance.RADIUS;
        return Math.abs(this.localX(body.x, body.z)) <= this.halfX + R && Math.abs(this.localZ(body.x, body.z)) <= this.halfZ + R;
    }
    pushX(body) { return -this.sin * this.pushSign(body); }
    pushZ(body) { return -this.cos * this.pushSign(body); }
    pushSign(body) { return Math.sign(this.localX(body.x, body.z) * this.spin.rate) || 1; }
}
class WindZone extends ClimbHazard {
    constructor(spec) {
        super(spec);
        this.strength = 0;
        this.gust = spec.gust ?? { dirDeg: 0, speed: 0, period: 1, share: 0, phase: 0 };
    }
    get dirX() { return Math.sin(this.gust.dirDeg * Math.PI / 180); }
    get dirZ() { return Math.cos(this.gust.dirDeg * Math.PI / 180); }
    strengthAt(seconds) {
        const g = this.gust, cycle = (((seconds + g.phase) % g.period) + g.period) % g.period, on = g.share * g.period;
        if (cycle >= on)
            return 0;
        return Math.max(0, Math.min(1, cycle / ClimbBalance.GUST_RAMP, (on - cycle) / ClimbBalance.GUST_RAMP));
    }
    update(seconds) { this.strength = this.strengthAt(seconds); }
    holds(body) { return this.overlapsBody(body) && this.covers(body.x, body.z); }
}
class GrabHold extends PlatformPiece {
    get solid() { return false; }
    get ledge() { return false; }
    get nx() { return this.sin; }
    get nz() { return this.cos; }
}
class ClimbPose {
    constructor() {
        this.x = 0;
        this.top = 0;
        this.z = 0;
        this.yaw = 0;
    }
    set(x, top, z, yaw) { this.x = x; this.top = top; this.z = z; this.yaw = yaw; }
}
class ClimbTrack {
    constructor(base) {
        this.base = base;
    }
}
class ClimbOrbitTrack extends ClimbTrack {
    constructor(move, base) {
        super(base);
        this.move = move;
    }
    get period() { return 2 * Math.PI * this.move.rho / Math.abs(this.move.speed); }
    pose(seconds, out) {
        const angle = this.move.startDeg * Math.PI / 180 + this.move.speed / this.move.rho * seconds;
        out.set(this.move.rho * Math.sin(angle), this.base.y, this.move.rho * Math.cos(angle), angle);
    }
}
class ClimbLiftTrack extends ClimbTrack {
    constructor(move, base) {
        super(base);
        this.move = move;
    }
    get period() { return this.move.period; }
    pose(seconds, out) {
        const wave = (1 - Math.cos(2 * Math.PI * (seconds + this.move.phase) / this.move.period)) / 2;
        out.set(this.base.x, this.move.low + (this.move.high - this.move.low) * wave, this.base.z, this.base.yaw ?? 0);
    }
}
class ClimbShuttleTrack extends ClimbTrack {
    constructor(move, base) {
        super(base);
        this.move = move;
    }
    get period() { return 2 * this.move.stroke / this.move.speed; }
    pose(seconds, out) {
        const period = this.period, cycle = (((seconds + this.move.phase) % period) + period) % period;
        const along = cycle < period / 2 ? cycle * this.move.speed : (period - cycle) * this.move.speed, dir = this.move.dirDeg * Math.PI / 180;
        out.set(this.base.x + Math.sin(dir) * along, this.base.y, this.base.z + Math.cos(dir) * along, this.base.yaw ?? 0);
    }
}
class ClimbTrackFactory {
    static of(move, base) {
        return ClimbTrackFactory.KINDS[move.track](move, base);
    }
}
ClimbTrackFactory.KINDS = {
    orbit: (move, base) => new ClimbOrbitTrack(move, base),
    lift: (move, base) => new ClimbLiftTrack(move, base),
    shuttle: (move, base) => new ClimbShuttleTrack(move, base),
};
class MovingPlatform extends PlatformPiece {
    constructor(spec) {
        super(spec);
        this.prevX = 0;
        this.prevTop = 0;
        this.prevZ = 0;
        this.prevYaw = 0;
        this.prevCos = 1;
        this.prevSin = 0;
        this.pose = new ClimbPose();
        if (!spec.move)
            throw new Error("moving piece without track " + spec.id);
        this.track = ClimbTrackFactory.of(spec.move, spec);
        this.group = spec.move.group;
        this.moveTo(0);
    }
    get moving() { return true; }
    get lift() { return this.top - this.prevTop; }
    get turn() { return this.yaw - this.prevYaw; }
    get vx() { return (this.x - this.prevX) / ClimbBalance.TICK; }
    get vz() { return (this.z - this.prevZ) / ClimbBalance.TICK; }
    get vy() { return this.lift / ClimbBalance.TICK; }
    moveTo(seconds) {
        const pose = this.pose;
        this.track.pose(seconds - ClimbBalance.TICK, pose);
        this.prevX = pose.x;
        this.prevTop = pose.top;
        this.prevZ = pose.z;
        this.prevYaw = pose.yaw;
        this.prevCos = Math.cos(pose.yaw);
        this.prevSin = Math.sin(pose.yaw);
        this.track.pose(seconds, pose);
        this.x = pose.x;
        this.top = pose.top;
        this.z = pose.z;
        this.yaw = pose.yaw;
        this.cos = Math.cos(pose.yaw);
        this.sin = Math.sin(pose.yaw);
    }
    fromX(px, pz) { return (px - this.prevX) * this.prevCos - (pz - this.prevZ) * this.prevSin; }
    fromZ(px, pz) { return (px - this.prevX) * this.prevSin + (pz - this.prevZ) * this.prevCos; }
    carryX(px, pz) { return this.worldX(this.fromX(px, pz), this.fromZ(px, pz)); }
    carryZ(px, pz) { return this.worldZ(this.fromX(px, pz), this.fromZ(px, pz)); }
    turnX(vx, vz) { const t = this.turn; return vx * Math.cos(t) + vz * Math.sin(t); }
    turnZ(vx, vz) { const t = this.turn; return -vx * Math.sin(t) + vz * Math.cos(t); }
}
class MovingJumpPad extends MovingPlatform {
    get ledge() { return false; }
    stand(rules) { rules.bounce(this); }
}
class ClimbWallAxes {
    constructor() {
        this.rightX = 0;
        this.rightZ = 0;
        this.forwardX = 0;
        this.forwardZ = 0;
    }
    static of(spot, view) {
        const axes = ClimbWallAxes.shared, faceRightX = spot.nz, faceRightZ = -spot.nx;
        const side = view.rightX * faceRightX + view.rightZ * faceRightZ < ClimbWallAxes.MIRROR_DOT ? -1 : 1;
        axes.forwardX = -spot.nx;
        axes.forwardZ = -spot.nz;
        axes.rightX = faceRightX * side;
        axes.rightZ = faceRightZ * side;
        return axes;
    }
}
ClimbWallAxes.MIRROR_DOT = -0.3;
ClimbWallAxes.shared = new ClimbWallAxes();
class ClimbGrabSpot {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.nx = 0;
        this.nz = 1;
        this.piece = null;
        this.ledge = false;
    }
    set(x, y, z, nx, nz, piece, ledge) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.nx = nx;
        this.nz = nz;
        this.piece = piece;
        this.ledge = ledge;
    }
    copy(other) { if (other.piece)
        this.set(other.x, other.y, other.z, other.nx, other.nz, other.piece, other.ledge); }
    ride(piece) {
        const x = piece.carryX(this.x, this.z), z = piece.carryZ(this.x, this.z), nx = piece.turnX(this.nx, this.nz), nz = piece.turnZ(this.nx, this.nz);
        this.x = x;
        this.z = z;
        this.y += piece.lift;
        this.nx = nx;
        this.nz = nz;
    }
    get bodyX() { return this.x + this.nx * ClimbBalance.RADIUS; }
    get bodyZ() { return this.z + this.nz * ClimbBalance.RADIUS; }
    get bodyY() { return this.y - ClimbBalance.HANG_DROP; }
}
class ClimbCollisionWorld {
    constructor(pieces) {
        this.cells = new Map();
        this.stamp = 0;
        this.pieces = pieces;
        this.marks = new Int32Array(pieces.length);
        this.movers = pieces.filter((piece) => piece.moving);
        pieces.forEach((piece, index) => { piece.index = index; if (!piece.moving)
            this.insert(piece); });
    }
    static cell(value) { return Math.floor(value / ClimbBalance.GRID_CELL) + 512; }
    static key(ix, iy, iz) { return ix + iz * 1024 + iy * 1048576; }
    insert(piece) {
        const C = ClimbCollisionWorld, span = piece.span;
        for (let ix = C.cell(piece.x - span); ix <= C.cell(piece.x + span); ix++)
            for (let iz = C.cell(piece.z - span); iz <= C.cell(piece.z + span); iz++)
                for (let iy = C.cell(piece.bottom); iy <= C.cell(piece.peak); iy++) {
                    const key = C.key(ix, iy, iz), list = this.cells.get(key);
                    if (list)
                        list.push(piece);
                    else
                        this.cells.set(key, [piece]);
                }
    }
    near(x, z, low, high, reach, out) {
        const C = ClimbCollisionWorld;
        out.length = 0;
        this.stamp++;
        for (let ix = C.cell(x - reach); ix <= C.cell(x + reach); ix++)
            for (let iz = C.cell(z - reach); iz <= C.cell(z + reach); iz++)
                for (let iy = C.cell(low); iy <= C.cell(high); iy++) {
                    const list = this.cells.get(C.key(ix, iy, iz));
                    if (!list)
                        continue;
                    for (const piece of list)
                        if (this.marks[piece.index] !== this.stamp) {
                            this.marks[piece.index] = this.stamp;
                            out.push(piece);
                        }
                }
        for (const piece of this.movers) {
            const room = reach + piece.span + ClimbBalance.GRID_CELL;
            if (Math.abs(piece.x - x) <= room && Math.abs(piece.z - z) <= room && piece.peak >= low - ClimbBalance.GRID_CELL && piece.bottom <= high + ClimbBalance.GRID_CELL)
                out.push(piece);
        }
        return out;
    }
    rayReach(ox, oy, oz, dx, dy, dz, limit) {
        let reach = limit;
        for (const piece of this.pieces)
            if (piece.solid)
                reach = Math.min(reach, piece.rayEnter(ox, oy, oz, dx, dy, dz, reach));
        return reach;
    }
}
class ClimbGrabSystem {
    constructor(world) {
        this.world = world;
        this.found = [];
        this.probe = { x: 0, z: 0, nx: 0, nz: 0, dist: 0, inside: false };
        this.facingSpot = new ClimbGrabSpot();
    }
    scan(x, z, low, high, side, out, faceX = 0, faceZ = 0, skip = null) {
        let best = Infinity, bestFacing = Infinity;
        const facing = this.facingSpot, judgeFacing = faceX !== 0 || faceZ !== 0;
        const offer = (d, sx, sz, top, nx, nz, piece, ledge) => {
            if (d < best) {
                best = d;
                out.set(sx, top, sz, nx, nz, piece, ledge);
            }
            if (judgeFacing && d < bestFacing && -(nx * faceX + nz * faceZ) >= ClimbBalance.GRAB_FACE_COS) {
                bestFacing = d;
                facing.set(sx, top, sz, nx, nz, piece, ledge);
            }
        };
        for (const piece of this.world.near(x, z, low, high, side + 0.5, this.found)) {
            if (piece === skip || piece.top < low || piece.top > high)
                continue;
            if (piece instanceof GrabHold) {
                const d = Math.hypot(piece.x - x, piece.z - z);
                if (d <= side)
                    offer(d, piece.x, piece.z, piece.top, piece.nx, piece.nz, piece, false);
            }
            else if (piece.ledge && !piece.covers(x, z)) {
                const edge = piece.edge(x, z, this.probe);
                if (edge.dist <= side)
                    offer(edge.dist, edge.x, edge.z, piece.top, edge.nx, edge.nz, piece, true);
            }
        }
        if (bestFacing < Infinity)
            out.copy(facing);
        return best < Infinity;
    }
    find(x, y, z, out) {
        return this.scan(x, z, y + ClimbBalance.GRAB_LOW, y + ClimbBalance.GRAB_HIGH, ClimbBalance.GRAB_SIDE, out);
    }
    findFor(body, out, skip = null) {
        const B = ClimbBalance, air = !body.grounded, faceX = Math.sin(body.yaw), faceZ = Math.cos(body.yaw);
        const rising = air && body.vy > 0, apex = rising ? body.y + body.vy * body.vy / (2 * B.GRAVITY) + B.CLEAR_MARGIN : -Infinity;
        const low = air ? Math.max(B.GRAB_LOW_AIR, apex - body.y) : B.GRAB_LOW, high = air ? B.GRAB_HIGH_AIR : B.GRAB_HIGH, side = air ? B.GRAB_SIDE_AIR : B.GRAB_SIDE;
        return this.scan(body.x, body.z, body.y + low, body.y + high, side, out, faceX, faceZ, skip);
    }
    above(from, out) {
        return this.scan(from.bodyX, from.bodyZ, from.y + ClimbBalance.HOP_MIN, from.y + ClimbBalance.HOP_UP + 1e-6, ClimbBalance.HOP_SIDE, out);
    }
    beside(from, moveX, moveZ, out) {
        let best = Infinity;
        const B = ClimbBalance;
        for (const piece of this.world.near(from.x, from.z, from.y - B.SHIFT_LEVEL, from.y + B.SHIFT_LEVEL, B.HOP_SIDE + 0.5, this.found)) {
            if (!(piece instanceof GrabHold) || piece === from.piece || Math.abs(piece.top - from.y) > B.SHIFT_LEVEL)
                continue;
            const dx = piece.x - from.x, dz = piece.z - from.z, d = Math.hypot(dx, dz);
            if (d < B.HOP_MIN || d > B.HOP_SIDE || (dx * moveX + dz * moveZ) / d < 0.5 || d >= best)
                continue;
            best = d;
            out.set(piece.x, piece.top, piece.z, piece.nx, piece.nz, piece, false);
        }
        return best < Infinity;
    }
}
class ClimbTimeScale {
    constructor() {
        this.scale = 1;
        this.active = false;
    }
    update(realDt, held) {
        const B = ClimbBalance;
        this.active = held;
        const target = this.active ? B.SLOW_SCALE : 1, pace = (1 - B.SLOW_SCALE) / B.SLOW_BLEND * realDt;
        this.scale = this.scale < target ? Math.min(target, this.scale + pace) : Math.max(target, this.scale - pace);
    }
}
class ClimbRunMode {
    get stagePortalsUsable() { return true; }
    get timed() { return false; }
    get seconds() { return 0; }
    get peak() { return 0; }
    tick(_rules) { }
    restReached(_cleared, _rules) { }
}
class ClimbPracticeMode extends ClimbRunMode {
    constructor() {
        super(...arguments);
        this.name = "practice";
    }
    finish(rules) { rules.emit({ t: "summit", falls: rules.falls, portals: rules.portalsUsed }); }
    switched(rules) {
        rules.emit({ t: "speedrunStart" });
        return new ClimbSpeedrunMode(rules.falls);
    }
}
class ClimbSpeedrunMode extends ClimbRunMode {
    constructor(fallsBefore) {
        super();
        this.fallsBefore = fallsBefore;
        this.name = "speedrun";
        this.splits = new Array(ClimbBalance.STAGE_COUNT).fill(0);
        this.finished = false;
        this.elapsed = 0;
        this.highest = 0;
    }
    get stagePortalsUsable() { return false; }
    get timed() { return true; }
    get seconds() { return this.elapsed; }
    get peak() { return this.highest; }
    tick(rules) {
        if (this.finished)
            return;
        this.elapsed += ClimbBalance.TICK / rules.time.scale;
        const body = rules.body;
        if (body.grounded || body.hanging)
            this.highest = Math.max(this.highest, body.y);
    }
    restReached(cleared, rules) {
        const slot = cleared - 1;
        if (this.finished || slot < 0 || slot >= this.splits.length || this.splits[slot] > 0)
            return;
        this.splits[slot] = this.elapsed;
        rules.emit({ t: "split", stage: cleared, seconds: this.elapsed });
    }
    finish(rules) {
        if (this.finished)
            return;
        this.highest = ClimbBalance.TOP;
        this.restReached(ClimbBalance.STAGE_COUNT, rules);
        this.finished = true;
        rules.emit({ t: "speedrunFinish", seconds: this.elapsed, splits: this.splits.slice(), falls: rules.falls - this.fallsBefore, peak: this.highest });
    }
    switched(rules) {
        rules.emit({ t: "speedrunExit" });
        return new ClimbPracticeMode();
    }
}
class ClimbPortalKind {
    enter(_spec, _rules) { }
}
class ClimbStagePortalKind extends ClimbPortalKind {
    open(spec, rules) { return rules.progress.portalOpen(spec.stage, rules.level, rules.mode); }
    arrive(spec, rules) {
        const start = rules.level.stageStart(spec.stage);
        if (!start)
            return;
        rules.dropAt(start.x, start.top, start.z, ClimbBalance.PORTAL_DROP);
        rules.portalsUsed++;
        rules.emit({ t: "portalArrive", stage: spec.stage });
    }
}
class ClimbSpeedrunPortalKind extends ClimbPortalKind {
    open() { return true; }
    enter(_spec, rules) { rules.mode = rules.mode.switched(rules); }
    arrive(_spec, rules) {
        const spawn = rules.level.spawn;
        rules.dropAt(spawn.x, spawn.y, spawn.z, 0);
        rules.body.yaw = spawn.yaw;
        rules.emit({ t: "hubArrive" });
    }
}
class ClimbPortalKinds {
    static of(spec) { return ClimbPortalKinds.KINDS[spec.kind ?? "stage"]; }
}
ClimbPortalKinds.KINDS = { stage: new ClimbStagePortalKind(), speedrun: new ClimbSpeedrunPortalKind() };
class StageProgress {
    constructor(cleared = 0) {
        this.cleared = cleared;
    }
    clear(stage) {
        if (stage <= this.cleared || stage < 1 || stage > ClimbBalance.STAGE_COUNT)
            return false;
        this.cleared = stage;
        return true;
    }
    unlocked(portalStage) { return portalStage >= 2 && portalStage - 1 <= this.cleared; }
    portalOpen(portalStage, level, mode) { return mode.stagePortalsUsable && this.unlocked(portalStage) && level.hasStage(portalStage); }
}
class TowerStage {
    constructor(index, name, floor, ceiling) {
        this.index = index;
        this.name = name;
        this.floor = floor;
        this.ceiling = ceiling;
        this.pieces = [];
        this.routes = [];
    }
    get built() { return this.pieces.length > 0; }
}
class TowerLevel {
    constructor(spec) {
        this.byId = new Map();
        this.starts = new Map();
        this.stages = spec.stages.map((s) => new TowerStage(s.index, s.name, s.floor, s.ceiling));
        this.pieces = spec.pieces.map((pieceSpec) => {
            const Kind = TowerLevel.PIECE_KINDS[pieceSpec.kind];
            if (!Kind)
                throw new Error("unknown piece kind " + pieceSpec.kind);
            return new Kind(pieceSpec);
        });
        for (const piece of this.pieces) {
            if (this.byId.has(piece.id))
                throw new Error("duplicate piece id " + piece.id);
            this.byId.set(piece.id, piece);
            if (piece.startOf > 0)
                this.starts.set(piece.startOf, piece);
            this.stageOf(piece.stage)?.pieces.push(piece);
        }
        for (const route of spec.routes)
            this.stageOf(route.stage)?.routes.push(route);
        this.portals = spec.portals;
        this.routes = spec.routes;
        this.spawn = spec.spawn;
    }
    stageOf(index) { return this.stages.find((s) => s.index === index); }
    stageAt(height) {
        let current = this.stages[0];
        for (const stage of this.stages)
            if (height >= stage.floor - 1e-6)
                current = stage;
        return current;
    }
    piece(id) {
        const found = this.byId.get(id);
        if (!found)
            throw new Error("no piece " + id);
        return found;
    }
    stageStart(index) { return this.starts.get(index) ?? null; }
    hasStage(index) { return this.starts.has(index); }
}
TowerLevel.PIECE_KINDS = {
    static: StaticPlatform, narrow: NarrowPlatform, slope: SlopePlatform, hub: HubIsland,
    rest: StageRest, pad: JumpPad, hold: GrabHold, moving: MovingPlatform, movingPad: MovingJumpPad,
    ice: IcePlatform, crumble: CrumblePlatform, sweeper: SweeperBar, wind: WindZone, summit: SummitGoal,
};
class ClimbUpPath {
    constructor() {
        this.fromX = 0;
        this.fromY = 0;
        this.fromZ = 0;
        this.toX = 0;
        this.toY = 0;
        this.toZ = 0;
        this.elapsed = 0;
        this.piece = null;
    }
    start(fromX, fromY, fromZ, toX, toY, toZ, piece) {
        this.fromX = fromX;
        this.fromY = fromY;
        this.fromZ = fromZ;
        this.toX = toX;
        this.toY = toY;
        this.toZ = toZ;
        this.piece = piece;
        this.elapsed = 0;
    }
    ride(piece) {
        const fromX = piece.carryX(this.fromX, this.fromZ), fromZ = piece.carryZ(this.fromX, this.fromZ), toX = piece.carryX(this.toX, this.toZ), toZ = piece.carryZ(this.toX, this.toZ);
        this.fromX = fromX;
        this.fromZ = fromZ;
        this.fromY += piece.lift;
        this.toX = toX;
        this.toZ = toZ;
        this.toY += piece.lift;
    }
    get progress() { return Math.min(1, this.elapsed / ClimbBalance.CLIMB_UP_TIME); }
    get done() { return this.elapsed >= ClimbBalance.CLIMB_UP_TIME - 1e-9; }
    get rising() { return this.progress < ClimbBalance.CLIMB_UP_RISE_SHARE; }
    static ease(t) { return t * t * (3 - 2 * t); }
    advance(seconds, body) {
        const B = ClimbBalance, P = ClimbUpPath;
        this.elapsed += seconds;
        const t = this.progress, share = B.CLIMB_UP_RISE_SHARE;
        const rise = P.ease(Math.min(1, t / share)), over = P.ease(Math.max(0, (t - share) / (1 - share)));
        const peak = this.toY + B.CLIMB_UP_LIFT;
        body.y = t < share ? this.fromY + (peak - this.fromY) * rise : peak + (this.toY - peak) * over;
        body.x = this.fromX + (this.toX - this.fromX) * over;
        body.z = this.fromZ + (this.toZ - this.fromZ) * over;
    }
}
class ClimbCharacterBody {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.prevX = 0;
        this.prevY = 0;
        this.prevZ = 0;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.driftX = 0;
        this.driftZ = 0;
        this.yaw = 0;
        this.mode = "free";
        this.grounded = false;
        this.ground = null;
        this.sliding = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.airPeak = 0;
        this.spot = new ClimbGrabSpot();
        this.climbPath = new ClimbUpPath();
        this.hangTime = 0;
        this.hopTime = 0;
        this.shiftCooldown = 0;
        this.grabCooldown = 0;
        this.letGo = null;
        this.stunTime = 0;
        this.knockTime = 0;
        this.knockCooldown = 0;
        this.windX = 0;
        this.windZ = 0;
        this.portalTime = 0;
        this.portal = null;
    }
    place(x, y, z) {
        this.x = this.prevX = x;
        this.y = this.prevY = y;
        this.z = this.prevZ = z;
        this.vx = this.vy = this.vz = 0;
        this.stopDrift();
    }
    stopDrift() { this.driftX = this.driftZ = 0; }
    remember() { this.prevX = this.x; this.prevY = this.y; this.prevZ = this.z; }
    get speed() { return Math.hypot(this.vx, this.vz); }
    get hanging() { return this.mode === "hang"; }
}
class FallReturnWatcher {
    constructor(rules) {
        this.rules = rules;
        this.falls = 0;
    }
    landed(piece, drop) {
        if (!piece.hub || drop < ClimbBalance.HOME_FALL)
            return;
        const body = this.rules.body;
        this.falls++;
        body.mode = "stun";
        body.stunTime = ClimbBalance.STUN;
        body.vx = body.vz = 0;
        this.rules.emit({ t: "fellHome", from: body.airPeak });
    }
    watch() {
        const body = this.rules.body, spawn = this.rules.level.spawn;
        if (body.y >= ClimbBalance.VOID_Y)
            return;
        this.falls++;
        body.place(spawn.x, spawn.y + 0.5, spawn.z);
        body.mode = "free";
        body.grounded = false;
        body.ground = null;
        body.airPeak = body.y;
        this.rules.emit({ t: "voidReturn" });
    }
}
class ClimbRules {
    constructor(level, progress) {
        this.level = level;
        this.progress = progress;
        this.time = new ClimbTimeScale();
        this.body = new ClimbCharacterBody();
        this.events = [];
        this.summitReached = false;
        this.ticks = 0;
        this.peak = 0;
        this.portalsUsed = 0;
        this.mode = new ClimbPracticeMode();
        this.moveX = 0;
        this.moveZ = 0;
        this.jumpLatch = false;
        this.slowHeld = false;
        this.bank = 0;
        this.found = [];
        this.probe = { x: 0, z: 0, nx: 0, nz: 0, dist: 0, inside: false };
        this.nextSpot = new ClimbGrabSpot();
        this.world = new ClimbCollisionWorld(level.pieces);
        this.grab = new ClimbGrabSystem(this.world);
        this.watcher = new FallReturnWatcher(this);
        this.movers = level.pieces.filter((piece) => piece instanceof MovingPlatform);
        this.crumbles = level.pieces.filter((piece) => piece instanceof CrumblePlatform);
        this.sweepers = level.pieces.filter((piece) => piece instanceof SweeperBar);
        this.winds = level.pieces.filter((piece) => piece instanceof WindZone);
        this.crumbles.forEach((piece) => piece.reset());
        this.moveMovers();
        this.modeSteps = {
            free: () => this.stepFree(),
            hang: () => this.stepHang(),
            climbUp: () => this.stepClimbUp(),
            portal: () => this.stepPortal(),
            stun: () => this.stepStun(),
        };
        this.body.place(level.spawn.x, level.spawn.y, level.spawn.z);
        this.body.yaw = level.spawn.yaw;
        this.body.airPeak = level.spawn.y;
    }
    steer(x, z) {
        const length = Math.hypot(x, z);
        this.moveX = length > 1e-6 ? x / length : 0;
        this.moveZ = length > 1e-6 ? z / length : 0;
    }
    steerStick(stickX, stickY, view) {
        const body = this.body;
        if (!body.hanging) {
            this.steer(view.rightX * stickX + view.forwardX * stickY, view.rightZ * stickX + view.forwardZ * stickY);
            return;
        }
        const axes = ClimbWallAxes.of(body.spot, view);
        this.steer(axes.rightX * stickX + axes.forwardX * stickY, axes.rightZ * stickX + axes.forwardZ * stickY);
    }
    pressJump() { this.jumpLatch = true; }
    holdSlow(held) { this.slowHeld = held; }
    emit(event) { this.events.push(event); }
    get falls() { return this.watcher.falls; }
    get height() { return Math.max(0, this.body.y); }
    get blend() { return this.bank / ClimbBalance.TICK; }
    get steering() { return this.moveX !== 0 || this.moveZ !== 0; }
    advance(realDt) {
        const B = ClimbBalance, dt = Math.min(Math.max(realDt, 0), B.FRAME_CAP);
        this.events.length = 0;
        this.time.update(dt, this.slowHeld);
        this.bank += dt * this.time.scale;
        while (this.bank >= B.TICK - 1e-12) {
            this.bank -= B.TICK;
            this.step();
        }
        if (this.bank < 0)
            this.bank = 0;
        return this.events;
    }
    step() {
        const B = ClimbBalance, body = this.body;
        body.remember();
        this.ticks++;
        this.mode.tick(this);
        this.moveMovers();
        this.carry();
        body.grabCooldown = Math.max(0, body.grabCooldown - B.TICK);
        body.knockTime = Math.max(0, body.knockTime - B.TICK);
        body.knockCooldown = Math.max(0, body.knockCooldown - B.TICK);
        body.shiftCooldown = Math.max(0, body.shiftCooldown - B.TICK);
        if (!(body.hanging && body.hopTime > 0))
            body.jumpBuffer = Math.max(0, body.jumpBuffer - B.TICK);
        if (this.jumpLatch) {
            body.jumpBuffer = B.JUMP_BUFFER;
            this.jumpLatch = false;
        }
        this.modeSteps[body.mode]();
        this.knockIfSwept();
        this.watcher.watch();
    }
    get worldTime() { return this.ticks * ClimbBalance.TICK; }
    moveMovers() {
        const now = this.worldTime, body = this.body;
        for (const mover of this.movers)
            mover.moveTo(now);
        for (const piece of this.crumbles)
            piece.update(now, this);
        for (const piece of this.sweepers)
            piece.update(now);
        body.windX = body.windZ = 0;
        for (const zone of this.winds) {
            zone.update(now);
            if (zone.strength > 0 && zone.holds(body)) {
                body.windX += zone.dirX * zone.gust.speed * zone.strength;
                body.windZ += zone.dirZ * zone.gust.speed * zone.strength;
            }
        }
    }
    knockIfSwept() {
        const B = ClimbBalance, body = this.body;
        if (body.knockCooldown > 0 || body.mode === "portal" || body.mode === "stun")
            return;
        const bar = this.sweepers.find((piece) => piece.hits(body));
        if (!bar)
            return;
        if (body.mode === "hang")
            body.letGo = body.spot.piece;
        body.mode = "free";
        this.leaveGround();
        body.stopDrift();
        body.coyote = 0;
        body.vx = bar.pushX(body) * B.KNOCK_SPEED;
        body.vz = bar.pushZ(body) * B.KNOCK_SPEED;
        body.vy = B.KNOCK_UP;
        body.knockTime = B.KNOCK_TIME;
        body.knockCooldown = B.KNOCK_AGAIN;
        body.grabCooldown = B.KNOCK_TIME;
        this.emit({ t: "knock", piece: bar.id });
    }
    reachSummit() {
        if (this.summitReached)
            return;
        this.summitReached = true;
        if (this.progress.clear(ClimbBalance.STAGE_COUNT))
            this.emit({ t: "stageClear", stage: ClimbBalance.STAGE_COUNT });
        this.mode.finish(this);
    }
    beginSpeedrun() { this.mode = new ClimbPracticeMode().switched(this); }
    carrier() {
        const body = this.body;
        const piece = body.mode === "hang" ? body.spot.piece : body.mode === "climbUp" ? body.climbPath.piece : body.grounded ? body.ground : null;
        return piece instanceof MovingPlatform ? piece : null;
    }
    carry() {
        const body = this.body, piece = this.carrier();
        if (!piece)
            return;
        const x = piece.carryX(body.x, body.z), z = piece.carryZ(body.x, body.z);
        body.x = x;
        body.z = z;
        body.y += piece.lift;
        body.yaw += piece.turn;
        if (body.mode === "hang")
            body.spot.ride(piece);
        if (body.mode === "climbUp")
            body.climbPath.ride(piece);
    }
    touchStageStart(stage) {
        if (this.progress.clear(stage - 1))
            this.emit({ t: "stageClear", stage: stage - 1 });
        this.mode.restReached(stage - 1, this);
    }
    bounce(pad) {
        this.body.vy = ClimbBalance.PAD_SPEED;
        this.leaveGround();
        this.body.coyote = 0;
        this.emit({ t: "pad", piece: pad.id });
    }
    leaveGround() {
        const body = this.body, ground = body.ground;
        if (ground instanceof MovingPlatform) {
            body.driftX = ground.vx;
            body.driftZ = ground.vz;
        }
        body.grounded = false;
        body.ground = null;
        body.sliding = false;
        body.airPeak = body.y;
    }
    approach(targetX, targetZ, maxDelta) {
        const body = this.body, dx = targetX - body.vx, dz = targetZ - body.vz, d = Math.hypot(dx, dz);
        if (d <= maxDelta) {
            body.vx = targetX;
            body.vz = targetZ;
            return;
        }
        body.vx += dx / d * maxDelta;
        body.vz += dz / d * maxDelta;
    }
    stepFree() {
        const B = ClimbBalance, T = B.TICK, body = this.body;
        const ground = body.grounded ? body.ground : null;
        body.sliding = !!ground && ground.slopeDeg > B.SLOPE_LIMIT_DEG;
        if (ground && body.sliding) {
            const down = ground.rise > 0 ? -1 : 1, angle = ground.slopeDeg * Math.PI / 180, pull = B.GRAVITY * Math.sin(angle) * Math.cos(angle) * T;
            body.vx += down * ground.cos * pull;
            body.vz += down * -ground.sin * pull;
        }
        else if (ground) {
            if (this.steering)
                this.approach(this.moveX * B.RUN, this.moveZ * B.RUN, ground.accel * T);
            else
                this.approach(0, 0, ground.brake * T);
        }
        else if (this.steering && body.knockTime <= 0)
            this.approach(this.moveX * B.RUN, this.moveZ * B.RUN, B.AIR_ACCEL * T);
        body.coyote = body.grounded ? B.COYOTE : Math.max(0, body.coyote - T);
        if (body.jumpBuffer > 0 && body.coyote > 0 && !body.sliding) {
            body.jumpBuffer = 0;
            body.coyote = 0;
            body.vy = B.JUMP;
            this.leaveGround();
            this.emit({ t: "jump" });
        }
        if (!body.grounded)
            body.vy = Math.max(body.vy - B.GRAVITY * T, -B.FALL_MAX);
        const blown = ground ? 1 - ground.windGrip : 1;
        let nextX = body.x + (body.vx + body.driftX + body.windX * blown) * T, nextZ = body.z + (body.vz + body.driftZ + body.windZ * blown) * T;
        const near = this.world.near(nextX, nextZ, body.y - 1.5, body.y + B.HEIGHT + 1.5, B.RADIUS + 0.5, this.found);
        for (let pass = 0; pass < 2; pass++)
            for (const piece of near) {
                if (!piece.solid)
                    continue;
                const edge = piece.edge(nextX, nextZ, this.probe);
                if (!edge.inside && edge.dist >= B.RADIUS)
                    continue;
                if (body.y + B.STEP >= piece.topAt(edge.x, edge.z) || body.y + B.HEIGHT <= piece.bottom)
                    continue;
                nextX = edge.x + edge.nx * B.RADIUS;
                nextZ = edge.z + edge.nz * B.RADIUS;
                const into = body.vx * edge.nx + body.vz * edge.nz;
                if (into < 0) {
                    body.vx -= into * edge.nx;
                    body.vz -= into * edge.nz;
                }
                const driftInto = body.driftX * edge.nx + body.driftZ * edge.nz;
                if (driftInto < 0) {
                    body.driftX -= driftInto * edge.nx;
                    body.driftZ -= driftInto * edge.nz;
                }
            }
        const wasGrounded = body.grounded;
        let nextY = body.y + body.vy * T, floor = -Infinity, floorPiece = null;
        for (const piece of near) {
            if (!piece.solid || !piece.covers(nextX, nextZ))
                continue;
            const top = piece.topAt(nextX, nextZ);
            if (top <= body.y + B.STEP + 1e-6) {
                if (top > floor) {
                    floor = top;
                    floorPiece = piece;
                }
            }
            else if (body.vy > 0 && piece.bottom >= body.y + B.HEIGHT - 1e-6 && piece.bottom < nextY + B.HEIGHT) {
                nextY = piece.bottom - B.HEIGHT;
                body.vy = 0;
            }
        }
        body.x = nextX;
        body.z = nextZ;
        if (body.vy <= 0 && floorPiece && floor >= nextY - (wasGrounded ? B.STEP : 0))
            this.land(floorPiece, floor, wasGrounded);
        else {
            body.y = nextY;
            if (wasGrounded)
                this.leaveGround();
            body.airPeak = Math.max(body.airPeak, body.y);
        }
        if (body.grounded && body.ground)
            body.ground.stand(this);
        if (body.speed > 0.5)
            body.yaw = Math.atan2(body.vx, body.vz);
        if (body.grounded) {
            this.peak = Math.max(this.peak, body.y);
            this.enterPortalIfInside();
        }
        else if (this.canAutoGrab())
            this.startHang();
    }
    land(piece, top, wasGrounded) {
        const body = this.body;
        body.y = top;
        body.vy = 0;
        body.grounded = true;
        body.ground = piece;
        body.stopDrift();
        if (wasGrounded)
            return;
        body.letGo = null;
        const drop = body.airPeak - top;
        this.emit({ t: "land", piece: piece.id, drop });
        this.watcher.landed(piece, drop);
    }
    enterPortalIfInside() {
        const B = ClimbBalance, body = this.body;
        if (body.mode !== "free")
            return;
        for (const portal of this.level.portals) {
            const kind = ClimbPortalKinds.of(portal);
            if (!kind.open(portal, this))
                continue;
            if (Math.hypot(portal.x - body.x, portal.z - body.z) > B.PORTAL_RADIUS || Math.abs(portal.y - body.y) > 1)
                continue;
            body.mode = "portal";
            body.portalTime = B.PORTAL_TIME;
            body.portal = portal;
            body.vx = body.vy = body.vz = 0;
            this.emit({ t: "portalEnter", stage: portal.stage });
            kind.enter(portal, this);
            return;
        }
    }
    startHang() {
        const body = this.body;
        body.mode = "hang";
        body.hangTime = 0;
        body.hopTime = ClimbBalance.GRAB_SWING;
        body.grounded = false;
        body.ground = null;
        body.sliding = false;
        this.settleOnSpot();
        this.emit({ t: "grab", ledge: body.spot.ledge });
    }
    settleOnSpot() {
        const body = this.body, spot = body.spot;
        body.x = spot.bodyX;
        body.y = spot.bodyY;
        body.z = spot.bodyZ;
        body.vx = body.vy = body.vz = 0;
        body.stopDrift();
        body.yaw = Math.atan2(-spot.nx, -spot.nz);
        body.airPeak = body.y;
        this.peak = Math.max(this.peak, body.y);
    }
    stepHang() {
        const B = ClimbBalance, T = B.TICK, body = this.body, spot = body.spot;
        if (spot.piece && !spot.piece.solid && !(spot.piece instanceof GrabHold)) {
            this.release(false);
            return;
        }
        if (body.hopTime > 0) {
            body.hopTime = Math.max(0, body.hopTime - T);
            return;
        }
        if (this.pullingAway(spot)) {
            this.release(false);
            return;
        }
        if (spot.ledge) {
            body.hangTime += T;
            if (body.hangTime >= B.MANTLE_MIN_HANG && (body.jumpBuffer > 0 || this.pushingInto(spot))) {
                body.jumpBuffer = 0;
                this.mantle();
            }
            return;
        }
        if (body.jumpBuffer > 0) {
            body.jumpBuffer = 0;
            if (this.grab.above(spot, this.nextSpot))
                this.hopTo(this.nextSpot);
            else
                this.release(true);
            return;
        }
        if (this.steering && body.shiftCooldown <= 0 && this.grab.beside(spot, this.moveX, this.moveZ, this.nextSpot)) {
            this.hopTo(this.nextSpot);
            body.shiftCooldown = B.SHIFT_COOLDOWN;
        }
    }
    canAutoGrab() {
        const body = this.body;
        if (body.grounded || body.grabCooldown > 0)
            return false;
        return this.grab.findFor(body, body.spot, body.letGo) && !this.pullingAway(body.spot);
    }
    pullingAway(spot) {
        return this.moveX * spot.nx + this.moveZ * spot.nz >= ClimbBalance.MANTLE_PUSH;
    }
    pushingInto(spot) {
        return -(this.moveX * spot.nx + this.moveZ * spot.nz) >= ClimbBalance.MANTLE_PUSH;
    }
    hopTo(next) {
        const body = this.body;
        body.spot.copy(next);
        body.hopTime = ClimbBalance.HOP_TIME;
        body.hangTime = 0;
        this.settleOnSpot();
        this.emit({ t: "hop" });
    }
    mantle() {
        const B = ClimbBalance, body = this.body, spot = body.spot, piece = spot.piece;
        if (!piece) {
            this.release(false);
            return;
        }
        const inset = ClimbBalance.MANTLE_INSETS.find((d) => piece.covers(spot.x - spot.nx * d, spot.z - spot.nz * d));
        const x = inset === undefined ? piece.x : spot.x - spot.nx * inset, z = inset === undefined ? piece.z : spot.z - spot.nz * inset;
        body.climbPath.start(body.x, body.y, body.z, x, piece.top, z, piece);
        body.mode = "climbUp";
        this.emit({ t: "climbUp" });
    }
    stepClimbUp() {
        const body = this.body, path = body.climbPath;
        if (path.piece && !path.piece.solid) {
            this.dropFromClimb();
            return;
        }
        path.advance(ClimbBalance.TICK, body);
        if (path.done)
            this.finishMantle();
    }
    dropFromClimb() {
        const body = this.body;
        body.mode = "free";
        body.grounded = false;
        body.ground = null;
        body.vx = body.vy = body.vz = 0;
        body.airPeak = body.y;
        this.emit({ t: "release" });
    }
    finishMantle() {
        const B = ClimbBalance, body = this.body, path = body.climbPath, piece = path.piece;
        if (!piece) {
            body.mode = "free";
            return;
        }
        body.x = path.toX;
        body.y = path.toY;
        body.z = path.toZ;
        body.vx = body.vy = body.vz = 0;
        body.stopDrift();
        body.mode = "free";
        body.grounded = true;
        body.ground = piece;
        body.coyote = B.COYOTE;
        body.airPeak = body.y;
        this.peak = Math.max(this.peak, body.y);
        this.emit({ t: "mantle" });
    }
    release(jump) {
        const B = ClimbBalance, body = this.body;
        body.mode = "free";
        body.grabCooldown = B.REGRAB;
        body.letGo = body.spot.piece;
        body.grounded = false;
        body.ground = null;
        body.coyote = 0;
        body.airPeak = body.y;
        body.stopDrift();
        if (jump) {
            body.vy = B.JUMP;
            body.vx = this.moveX * B.RUN;
            body.vz = this.moveZ * B.RUN;
            this.emit({ t: "jump" });
        }
        else
            this.emit({ t: "release" });
    }
    stepStun() {
        const body = this.body;
        body.stunTime -= ClimbBalance.TICK;
        if (body.stunTime <= 0)
            body.mode = "free";
        if (body.ground)
            body.ground.stand(this);
    }
    stepPortal() {
        const B = ClimbBalance, body = this.body;
        body.portalTime -= B.TICK;
        if (body.portalTime > 0)
            return;
        const portal = body.portal;
        body.mode = "free";
        body.portal = null;
        if (portal)
            ClimbPortalKinds.of(portal).arrive(portal, this);
    }
    dropAt(x, top, z, lift) {
        const body = this.body;
        body.place(x, top + lift, z);
        body.grounded = false;
        body.ground = null;
        body.airPeak = top;
    }
}
