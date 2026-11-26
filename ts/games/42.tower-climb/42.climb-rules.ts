type ClimbMode = "free" | "hang" | "climbUp" | "portal" | "stun";
interface ClimbViewAxes { readonly rightX: number; readonly rightZ: number; readonly forwardX: number; readonly forwardZ: number }

type ClimbMoveSpec =
  | { track: "orbit"; group: string; rho: number; speed: number; startDeg: number }
  | { track: "lift"; group: string; low: number; high: number; period: number; phase: number }
  | { track: "shuttle"; group: string; dirDeg: number; stroke: number; speed: number; phase: number };

interface ClimbSpinSpec { rate: number; phase: number }
interface ClimbGustSpec { dirDeg: number; speed: number; period: number; share: number; phase: number }

interface ClimbPieceSpec {
  id: string; kind: string; stage: number;
  x: number; y: number; z: number;
  sx?: number; sz?: number; radius?: number; depth?: number; yaw?: number; rise?: number;
  noLedge?: boolean; startOf?: number; look?: string; move?: ClimbMoveSpec;
  spin?: ClimbSpinSpec; gust?: ClimbGustSpec;
}
type ClimbPortalKindName = "stage" | "speedrun";
type ClimbRunModeName = "practice" | "speedrun";
interface ClimbPortalSpec { kind?: ClimbPortalKindName; stage: number; x: number; y: number; z: number; yaw: number }
interface ClimbRouteSpec { stage: number; name: string; label: string; ratioLimit: number; steps: string[] }
interface ClimbStageSpec { index: number; name: string; floor: number; ceiling: number }
interface ClimbSpawnSpec { x: number; y: number; z: number; yaw: number }
interface ClimbLevelSpec { stages: ClimbStageSpec[]; pieces: ClimbPieceSpec[]; portals: ClimbPortalSpec[]; routes: ClimbRouteSpec[]; spawn: ClimbSpawnSpec }
interface ClimbEdgeProbe { x: number; z: number; nx: number; nz: number; dist: number; inside: boolean }

type ClimbEvent =
  | { t: "jump" }
  | { t: "land"; piece: string; drop: number }
  | { t: "pad"; piece: string }
  | { t: "grab"; ledge: boolean }
  | { t: "hop" }
  | { t: "climbUp" }
  | { t: "mantle" }
  | { t: "release" }
  | { t: "fellHome"; from: number }
  | { t: "voidReturn" }
  | { t: "stageClear"; stage: number }
  | { t: "portalEnter"; stage: number }
  | { t: "portalArrive"; stage: number }
  | { t: "knock"; piece: string }
  | { t: "crumble"; piece: string }
  | { t: "summit"; falls: number; portals: number }
  | { t: "speedrunStart" }
  | { t: "speedrunExit" }
  | { t: "hubArrive" }
  | { t: "split"; stage: number; seconds: number }
  | { t: "speedrunFinish"; seconds: number; splits: number[]; falls: number; peak: number };

class ClimbBalance {
  static readonly TICK = 1 / 120;
  static readonly FRAME_CAP = 0.1;
  static readonly RUN = 7;
  static readonly GROUND_ACCEL = 40;
  static readonly AIR_ACCEL = 12;
  static readonly STOP_TIME = 0.05;
  static readonly GRAVITY = 28;
  static readonly JUMP = 9.5;
  static readonly COYOTE = 0.12;
  static readonly JUMP_BUFFER = 0.15;
  static readonly FALL_MAX = 35;
  static readonly SLOPE_LIMIT_DEG = 40;
  static readonly PAD_SPEED = 15;
  static readonly RADIUS = 0.4;
  static readonly HEIGHT = 2;
  static readonly STEP = 0.35;
  static readonly GRAB_LOW = 1.2;
  static readonly GRAB_HIGH = 2.6;
  static readonly GRAB_SIDE = 1;
  static readonly GRAB_SIDE_AIR = 1.4;
  static readonly GRAB_LOW_AIR = 0.9;
  static readonly GRAB_HIGH_AIR = 2.8;
  static readonly GRAB_FACE_COS = 0.4;
  static readonly CLEAR_MARGIN = 0.15;
  static readonly GRAB_SWING = 0.2;
  static readonly HANG_DROP = 2;
  static readonly MANTLE_MIN_HANG = 0.2;
  static readonly MANTLE_PUSH = 0.5;
  static readonly MANTLE_INSET = 0.55;
  static readonly MANTLE_INSETS: readonly number[] = [ClimbBalance.MANTLE_INSET, 0.35, 0.2];
  static readonly CLIMB_UP_TIME = 0.5;
  static readonly CLIMB_UP_RISE_SHARE = 0.6;
  static readonly CLIMB_UP_LIFT = 0.15;
  static readonly HOP_TIME = 0.2;
  static readonly HOP_UP = 1.6;
  static readonly HOP_MIN = 0.2;
  static readonly HOP_SIDE = 1.3;
  static readonly SHIFT_LEVEL = 0.6;
  static readonly SHIFT_COOLDOWN = 0.3;
  static readonly REGRAB = 0.2;
  static readonly SLOW_SCALE = 0.3;
  static readonly SLOW_BLEND = 0.15;
  static readonly PORTAL_RADIUS = 1.2;
  static readonly PORTAL_TIME = 1.5;
  static readonly PORTAL_DROP = 1.5;
  static readonly HOME_FALL = 6;
  static readonly STUN = 0.9;
  static readonly VOID_Y = -20;
  static readonly REST_SIDE = 3;
  static readonly ICE_ACCEL = 8;
  static readonly ICE_BRAKE = 5;
  static readonly CRUMBLE_DELAY = 0.7;
  static readonly CRUMBLE_GONE = 3;
  static readonly KNOCK_SPEED = 9;
  static readonly KNOCK_UP = 6;
  static readonly KNOCK_TIME = 0.4;
  static readonly KNOCK_AGAIN = 0.5;
  static readonly GUST_RAMP = 0.4;
  static readonly WIND_GRIP = 0.5;
  static readonly STAGE_COUNT = 7;
  static readonly TOP = 200;
  static readonly GRID_CELL = 4;
}

class PlatformPiece {
  readonly id: string;
  readonly stage: number;
  x: number;
  z: number;
  top: number;
  readonly depth: number;
  yaw: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly radius: number;
  readonly rise: number;
  readonly look: string;
  readonly startOf: number;
  cos: number;
  sin: number;
  index = 0;
  protected readonly ledgeAllowed: boolean;

  constructor(spec: ClimbPieceSpec) {
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

  get solid(): boolean { return true; }
  get moving(): boolean { return false; }
  get hazard(): boolean { return false; }
  get accel(): number { return ClimbBalance.GROUND_ACCEL; }
  get brake(): number { return ClimbBalance.RUN / ClimbBalance.STOP_TIME; }
  get windGrip(): number { return ClimbBalance.WIND_GRIP; }
  get ledge(): boolean { return this.ledgeAllowed && this.rise === 0; }
  get hub(): boolean { return false; }
  get round(): boolean { return this.radius > 0; }
  get bottom(): number { return this.top - Math.abs(this.rise) / 2 - this.depth; }
  get peak(): number { return this.top + Math.abs(this.rise) / 2; }
  get span(): number { return this.round ? this.radius : Math.hypot(this.halfX, this.halfZ); }
  get rest(): boolean { return this.solid && this.rise === 0 && Math.min(this.halfX, this.halfZ) * 2 >= ClimbBalance.REST_SIDE; }
  get slopeDeg(): number { return Math.atan2(Math.abs(this.rise), this.halfX * 2) * 180 / Math.PI; }

  localX(px: number, pz: number): number { return (px - this.x) * this.cos - (pz - this.z) * this.sin; }
  localZ(px: number, pz: number): number { return (px - this.x) * this.sin + (pz - this.z) * this.cos; }
  worldX(lx: number, lz: number): number { return this.x + lx * this.cos + lz * this.sin; }
  worldZ(lx: number, lz: number): number { return this.z - lx * this.sin + lz * this.cos; }

  covers(px: number, pz: number): boolean {
    if (this.round) { const dx = px - this.x, dz = pz - this.z; return dx * dx + dz * dz <= this.radius * this.radius; }
    return Math.abs(this.localX(px, pz)) <= this.halfX && Math.abs(this.localZ(px, pz)) <= this.halfZ;
  }

  topAt(px: number, pz: number): number {
    if (this.rise === 0) return this.top;
    const along = Math.max(-1, Math.min(1, this.localX(px, pz) / this.halfX));
    return this.top + this.rise * along / 2;
  }

  edge(px: number, pz: number, out: ClimbEdgeProbe): ClimbEdgeProbe {
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
    let ex: number, ez: number, nlx: number, nlz: number;
    const inside = Math.abs(lx) < this.halfX && Math.abs(lz) < this.halfZ;
    if (inside) {
      const gapX = this.halfX - Math.abs(lx), gapZ = this.halfZ - Math.abs(lz);
      if (gapX < gapZ) { nlx = lx < 0 ? -1 : 1; nlz = 0; ex = nlx * this.halfX; ez = lz; out.dist = gapX; }
      else { nlx = 0; nlz = lz < 0 ? -1 : 1; ex = lx; ez = nlz * this.halfZ; out.dist = gapZ; }
    } else {
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

  rayEnter(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, limit: number): number {
    const lox = this.localX(ox, oz), loz = this.localZ(ox, oz);
    const ldx = dx * this.cos - dz * this.sin, ldz = dx * this.sin + dz * this.cos;
    let near = 0, far = limit;
    const lows = [-this.halfX, this.bottom, -this.halfZ], highs = [this.halfX, this.peak, this.halfZ];
    const origin = [lox, oy, loz], dir = [ldx, dy, ldz];
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(dir[axis]) < 1e-9) { if (origin[axis] < lows[axis] || origin[axis] > highs[axis]) return limit; continue; }
      let a = (lows[axis] - origin[axis]) / dir[axis], b = (highs[axis] - origin[axis]) / dir[axis];
      if (a > b) { const swap = a; a = b; b = swap; }
      near = Math.max(near, a); far = Math.min(far, b);
      if (near > far) return limit;
    }
    return near;
  }

  stand(_rules: ClimbRules): void {}
}

class StaticPlatform extends PlatformPiece {}
class NarrowPlatform extends PlatformPiece {}

class SlopePlatform extends PlatformPiece {
  get ledge(): boolean { return false; }
}

class HubIsland extends PlatformPiece {
  get hub(): boolean { return true; }
  get ledge(): boolean { return false; }
}

class StageRest extends PlatformPiece {
  stand(rules: ClimbRules): void { rules.touchStageStart(this.startOf); }
}

class SummitGoal extends PlatformPiece {
  get ledge(): boolean { return false; }
  stand(rules: ClimbRules): void { rules.reachSummit(); }
}

class JumpPad extends PlatformPiece {
  get ledge(): boolean { return false; }
  stand(rules: ClimbRules): void { rules.bounce(this); }
}

class IcePlatform extends PlatformPiece {
  get accel(): number { return ClimbBalance.ICE_ACCEL; }
  get brake(): number { return ClimbBalance.ICE_BRAKE; }
  get windGrip(): number { return 0; }
}

class CrumblePlatform extends PlatformPiece {
  private since = -1;
  private now = 0;

  reset(): void { this.since = -1; this.now = 0; }
  get age(): number { return this.since < 0 ? -1 : this.now - this.since; }
  get gone(): boolean { return this.age >= ClimbBalance.CRUMBLE_DELAY; }
  get shaking(): number { const age = this.age; return age < 0 || this.gone ? 0 : age / ClimbBalance.CRUMBLE_DELAY; }
  get fallTime(): number { return this.gone ? this.age - ClimbBalance.CRUMBLE_DELAY : 0; }
  get solid(): boolean { return !this.gone; }
  get ledge(): boolean { return super.ledge && !this.gone; }

  update(seconds: number, rules: ClimbRules): void {
    const wasGone = this.gone;
    this.now = seconds;
    if (this.age >= ClimbBalance.CRUMBLE_DELAY + ClimbBalance.CRUMBLE_GONE) this.since = -1;
    if (!wasGone && this.gone) rules.emit({ t: "crumble", piece: this.id });
  }
  stand(rules: ClimbRules): void { if (this.since < 0) this.since = rules.worldTime; }
}

abstract class ClimbHazard extends PlatformPiece {
  get solid(): boolean { return false; }
  get ledge(): boolean { return false; }
  get hazard(): boolean { return true; }
  overlapsBody(body: ClimbCharacterBody): boolean { return body.y < this.top && body.y + ClimbBalance.HEIGHT > this.bottom; }
  abstract update(seconds: number): void;
}

class SweeperBar extends ClimbHazard {
  readonly spin: ClimbSpinSpec;

  constructor(spec: ClimbPieceSpec) {
    super(spec);
    this.spin = spec.spin ?? { rate: 1, phase: 0 };
    this.update(0);
  }

  angleAt(seconds: number): number { return this.spin.phase + this.spin.rate * seconds; }
  update(seconds: number): void { this.yaw = this.angleAt(seconds); this.cos = Math.cos(this.yaw); this.sin = Math.sin(this.yaw); }

  hits(body: ClimbCharacterBody): boolean {
    if (!this.overlapsBody(body)) return false;
    const R = ClimbBalance.RADIUS;
    return Math.abs(this.localX(body.x, body.z)) <= this.halfX + R && Math.abs(this.localZ(body.x, body.z)) <= this.halfZ + R;
  }

  pushX(body: ClimbCharacterBody): number { return -this.sin * this.pushSign(body); }
  pushZ(body: ClimbCharacterBody): number { return -this.cos * this.pushSign(body); }
  private pushSign(body: ClimbCharacterBody): number { return Math.sign(this.localX(body.x, body.z) * this.spin.rate) || 1; }
}

class WindZone extends ClimbHazard {
  readonly gust: ClimbGustSpec;
  strength = 0;

  constructor(spec: ClimbPieceSpec) {
    super(spec);
    this.gust = spec.gust ?? { dirDeg: 0, speed: 0, period: 1, share: 0, phase: 0 };
  }

  get dirX(): number { return Math.sin(this.gust.dirDeg * Math.PI / 180); }
  get dirZ(): number { return Math.cos(this.gust.dirDeg * Math.PI / 180); }

  strengthAt(seconds: number): number {
    const g = this.gust, cycle = (((seconds + g.phase) % g.period) + g.period) % g.period, on = g.share * g.period;
    if (cycle >= on) return 0;
    return Math.max(0, Math.min(1, cycle / ClimbBalance.GUST_RAMP, (on - cycle) / ClimbBalance.GUST_RAMP));
  }

  update(seconds: number): void { this.strength = this.strengthAt(seconds); }
  holds(body: ClimbCharacterBody): boolean { return this.overlapsBody(body) && this.covers(body.x, body.z); }
}

class GrabHold extends PlatformPiece {
  get solid(): boolean { return false; }
  get ledge(): boolean { return false; }
  get nx(): number { return this.sin; }
  get nz(): number { return this.cos; }
}

class ClimbPose {
  x = 0; top = 0; z = 0; yaw = 0;
  set(x: number, top: number, z: number, yaw: number): void { this.x = x; this.top = top; this.z = z; this.yaw = yaw; }
}

abstract class ClimbTrack {
  constructor(protected readonly base: ClimbPieceSpec) {}
  abstract get period(): number;
  abstract pose(seconds: number, out: ClimbPose): void;
}

class ClimbOrbitTrack extends ClimbTrack {
  constructor(private readonly move: Extract<ClimbMoveSpec, { track: "orbit" }>, base: ClimbPieceSpec) { super(base); }
  get period(): number { return 2 * Math.PI * this.move.rho / Math.abs(this.move.speed); }
  pose(seconds: number, out: ClimbPose): void {
    const angle = this.move.startDeg * Math.PI / 180 + this.move.speed / this.move.rho * seconds;
    out.set(this.move.rho * Math.sin(angle), this.base.y, this.move.rho * Math.cos(angle), angle);
  }
}

class ClimbLiftTrack extends ClimbTrack {
  constructor(private readonly move: Extract<ClimbMoveSpec, { track: "lift" }>, base: ClimbPieceSpec) { super(base); }
  get period(): number { return this.move.period; }
  pose(seconds: number, out: ClimbPose): void {
    const wave = (1 - Math.cos(2 * Math.PI * (seconds + this.move.phase) / this.move.period)) / 2;
    out.set(this.base.x, this.move.low + (this.move.high - this.move.low) * wave, this.base.z, this.base.yaw ?? 0);
  }
}

class ClimbShuttleTrack extends ClimbTrack {
  constructor(private readonly move: Extract<ClimbMoveSpec, { track: "shuttle" }>, base: ClimbPieceSpec) { super(base); }
  get period(): number { return 2 * this.move.stroke / this.move.speed; }
  pose(seconds: number, out: ClimbPose): void {
    const period = this.period, cycle = (((seconds + this.move.phase) % period) + period) % period;
    const along = cycle < period / 2 ? cycle * this.move.speed : (period - cycle) * this.move.speed, dir = this.move.dirDeg * Math.PI / 180;
    out.set(this.base.x + Math.sin(dir) * along, this.base.y, this.base.z + Math.cos(dir) * along, this.base.yaw ?? 0);
  }
}

class ClimbTrackFactory {
  static readonly KINDS: { [K in ClimbMoveSpec["track"]]: (move: Extract<ClimbMoveSpec, { track: K }>, base: ClimbPieceSpec) => ClimbTrack } = {
    orbit: (move, base) => new ClimbOrbitTrack(move, base),
    lift: (move, base) => new ClimbLiftTrack(move, base),
    shuttle: (move, base) => new ClimbShuttleTrack(move, base),
  };

  static of(move: ClimbMoveSpec, base: ClimbPieceSpec): ClimbTrack {
    return (ClimbTrackFactory.KINDS[move.track] as (m: ClimbMoveSpec, b: ClimbPieceSpec) => ClimbTrack)(move, base);
  }
}

class MovingPlatform extends PlatformPiece {
  readonly track: ClimbTrack;
  readonly group: string;
  prevX = 0; prevTop = 0; prevZ = 0; prevYaw = 0;
  private prevCos = 1;
  private prevSin = 0;
  private readonly pose = new ClimbPose();

  constructor(spec: ClimbPieceSpec) {
    super(spec);
    if (!spec.move) throw new Error("moving piece without track " + spec.id);
    this.track = ClimbTrackFactory.of(spec.move, spec);
    this.group = spec.move.group;
    this.moveTo(0);
  }

  get moving(): boolean { return true; }
  get lift(): number { return this.top - this.prevTop; }
  get turn(): number { return this.yaw - this.prevYaw; }
  get vx(): number { return (this.x - this.prevX) / ClimbBalance.TICK; }
  get vz(): number { return (this.z - this.prevZ) / ClimbBalance.TICK; }
  get vy(): number { return this.lift / ClimbBalance.TICK; }

  moveTo(seconds: number): void {
    const pose = this.pose;
    this.track.pose(seconds - ClimbBalance.TICK, pose);
    this.prevX = pose.x; this.prevTop = pose.top; this.prevZ = pose.z; this.prevYaw = pose.yaw;
    this.prevCos = Math.cos(pose.yaw); this.prevSin = Math.sin(pose.yaw);
    this.track.pose(seconds, pose);
    this.x = pose.x; this.top = pose.top; this.z = pose.z; this.yaw = pose.yaw;
    this.cos = Math.cos(pose.yaw); this.sin = Math.sin(pose.yaw);
  }

  private fromX(px: number, pz: number): number { return (px - this.prevX) * this.prevCos - (pz - this.prevZ) * this.prevSin; }
  private fromZ(px: number, pz: number): number { return (px - this.prevX) * this.prevSin + (pz - this.prevZ) * this.prevCos; }
  carryX(px: number, pz: number): number { return this.worldX(this.fromX(px, pz), this.fromZ(px, pz)); }
  carryZ(px: number, pz: number): number { return this.worldZ(this.fromX(px, pz), this.fromZ(px, pz)); }
  turnX(vx: number, vz: number): number { const t = this.turn; return vx * Math.cos(t) + vz * Math.sin(t); }
  turnZ(vx: number, vz: number): number { const t = this.turn; return -vx * Math.sin(t) + vz * Math.cos(t); }
}

class MovingJumpPad extends MovingPlatform {
  get ledge(): boolean { return false; }
  stand(rules: ClimbRules): void { rules.bounce(this); }
}

class ClimbWallAxes implements ClimbViewAxes {
  static readonly MIRROR_DOT = -0.3;
  private static readonly shared = new ClimbWallAxes();
  rightX = 0;
  rightZ = 0;
  forwardX = 0;
  forwardZ = 0;

  static of(spot: ClimbGrabSpot, view: ClimbViewAxes): ClimbWallAxes {
    const axes = ClimbWallAxes.shared, faceRightX = spot.nz, faceRightZ = -spot.nx;
    const side = view.rightX * faceRightX + view.rightZ * faceRightZ < ClimbWallAxes.MIRROR_DOT ? -1 : 1;
    axes.forwardX = -spot.nx; axes.forwardZ = -spot.nz;
    axes.rightX = faceRightX * side; axes.rightZ = faceRightZ * side;
    return axes;
  }
}

class ClimbGrabSpot {
  x = 0; y = 0; z = 0; nx = 0; nz = 1;
  piece: PlatformPiece | null = null;
  ledge = false;

  set(x: number, y: number, z: number, nx: number, nz: number, piece: PlatformPiece, ledge: boolean): void {
    this.x = x; this.y = y; this.z = z; this.nx = nx; this.nz = nz; this.piece = piece; this.ledge = ledge;
  }
  copy(other: ClimbGrabSpot): void { if (other.piece) this.set(other.x, other.y, other.z, other.nx, other.nz, other.piece, other.ledge); }
  ride(piece: MovingPlatform): void {
    const x = piece.carryX(this.x, this.z), z = piece.carryZ(this.x, this.z), nx = piece.turnX(this.nx, this.nz), nz = piece.turnZ(this.nx, this.nz);
    this.x = x; this.z = z; this.y += piece.lift; this.nx = nx; this.nz = nz;
  }
  get bodyX(): number { return this.x + this.nx * ClimbBalance.RADIUS; }
  get bodyZ(): number { return this.z + this.nz * ClimbBalance.RADIUS; }
  get bodyY(): number { return this.y - ClimbBalance.HANG_DROP; }
}

class ClimbCollisionWorld {
  readonly pieces: PlatformPiece[];
  private readonly movers: PlatformPiece[];
  private readonly cells = new Map<number, PlatformPiece[]>();
  private readonly marks: Int32Array;
  private stamp = 0;

  constructor(pieces: PlatformPiece[]) {
    this.pieces = pieces;
    this.marks = new Int32Array(pieces.length);
    this.movers = pieces.filter((piece) => piece.moving);
    pieces.forEach((piece, index) => { piece.index = index; if (!piece.moving) this.insert(piece); });
  }

  private static cell(value: number): number { return Math.floor(value / ClimbBalance.GRID_CELL) + 512; }
  private static key(ix: number, iy: number, iz: number): number { return ix + iz * 1024 + iy * 1048576; }

  private insert(piece: PlatformPiece): void {
    const C = ClimbCollisionWorld, span = piece.span;
    for (let ix = C.cell(piece.x - span); ix <= C.cell(piece.x + span); ix++)
      for (let iz = C.cell(piece.z - span); iz <= C.cell(piece.z + span); iz++)
        for (let iy = C.cell(piece.bottom); iy <= C.cell(piece.peak); iy++) {
          const key = C.key(ix, iy, iz), list = this.cells.get(key);
          if (list) list.push(piece); else this.cells.set(key, [piece]);
        }
  }

  near(x: number, z: number, low: number, high: number, reach: number, out: PlatformPiece[]): PlatformPiece[] {
    const C = ClimbCollisionWorld;
    out.length = 0;
    this.stamp++;
    for (let ix = C.cell(x - reach); ix <= C.cell(x + reach); ix++)
      for (let iz = C.cell(z - reach); iz <= C.cell(z + reach); iz++)
        for (let iy = C.cell(low); iy <= C.cell(high); iy++) {
          const list = this.cells.get(C.key(ix, iy, iz));
          if (!list) continue;
          for (const piece of list) if (this.marks[piece.index] !== this.stamp) { this.marks[piece.index] = this.stamp; out.push(piece); }
        }
    for (const piece of this.movers) {
      const room = reach + piece.span + ClimbBalance.GRID_CELL;
      if (Math.abs(piece.x - x) <= room && Math.abs(piece.z - z) <= room && piece.peak >= low - ClimbBalance.GRID_CELL && piece.bottom <= high + ClimbBalance.GRID_CELL) out.push(piece);
    }
    return out;
  }

  floorBelow(x: number, z: number, ceiling: number, out: PlatformPiece[]): number {
    let floor = -Infinity;
    for (const piece of this.near(x, z, ceiling - ClimbBalance.HANG_DROP - 1, ceiling, ClimbBalance.RADIUS, out)) {
      if (!piece.solid || piece instanceof GrabHold || !piece.covers(x, z)) continue;
      const top = piece.topAt(x, z);
      if (top <= ceiling && top > floor) floor = top;
    }
    return floor;
  }

  rayReach(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, limit: number): number {
    let reach = limit;
    for (const piece of this.pieces) if (piece.solid) reach = Math.min(reach, piece.rayEnter(ox, oy, oz, dx, dy, dz, reach));
    return reach;
  }
}

class ClimbGrabSystem {
  private readonly found: PlatformPiece[] = [];
  private readonly probe: ClimbEdgeProbe = { x: 0, z: 0, nx: 0, nz: 0, dist: 0, inside: false };
  private readonly facingSpot = new ClimbGrabSpot();

  constructor(private readonly world: ClimbCollisionWorld) {}

  private scan(x: number, z: number, low: number, high: number, side: number, out: ClimbGrabSpot, faceX = 0, faceZ = 0, skip: PlatformPiece | null = null): boolean {
    let best = Infinity, bestFacing = Infinity;
    const facing = this.facingSpot, judgeFacing = faceX !== 0 || faceZ !== 0;
    const offer = (d: number, sx: number, sz: number, top: number, nx: number, nz: number, piece: PlatformPiece, ledge: boolean): void => {
      if (d < best) { best = d; out.set(sx, top, sz, nx, nz, piece, ledge); }
      if (judgeFacing && d < bestFacing && -(nx * faceX + nz * faceZ) >= ClimbBalance.GRAB_FACE_COS) { bestFacing = d; facing.set(sx, top, sz, nx, nz, piece, ledge); }
    };
    for (const piece of this.world.near(x, z, low, high, side + 0.5, this.found)) {
      if (piece === skip || piece.top < low || piece.top > high) continue;
      if (piece instanceof GrabHold) {
        const d = Math.hypot(piece.x - x, piece.z - z);
        if (d <= side) offer(d, piece.x, piece.z, piece.top, piece.nx, piece.nz, piece, false);
      } else if (piece.ledge && !piece.covers(x, z)) {
        const edge = piece.edge(x, z, this.probe);
        if (edge.dist <= side) offer(edge.dist, edge.x, edge.z, piece.top, edge.nx, edge.nz, piece, true);
      }
    }
    if (bestFacing < Infinity) out.copy(facing);
    return best < Infinity;
  }

  find(x: number, y: number, z: number, out: ClimbGrabSpot): boolean {
    return this.scan(x, z, y + ClimbBalance.GRAB_LOW, y + ClimbBalance.GRAB_HIGH, ClimbBalance.GRAB_SIDE, out);
  }

  findFor(body: ClimbCharacterBody, out: ClimbGrabSpot, skip: PlatformPiece | null = null): boolean {
    const B = ClimbBalance, air = !body.grounded, faceX = Math.sin(body.yaw), faceZ = Math.cos(body.yaw);
    const rising = air && body.vy > 0, apex = rising ? body.y + body.vy * body.vy / (2 * B.GRAVITY) + B.CLEAR_MARGIN : -Infinity;
    const low = air ? Math.max(B.GRAB_LOW_AIR, apex - body.y) : B.GRAB_LOW, high = air ? B.GRAB_HIGH_AIR : B.GRAB_HIGH, side = air ? B.GRAB_SIDE_AIR : B.GRAB_SIDE;
    return this.scan(body.x, body.z, body.y + low, body.y + high, side, out, faceX, faceZ, skip);
  }

  above(from: ClimbGrabSpot, out: ClimbGrabSpot): boolean {
    return this.scan(from.bodyX, from.bodyZ, from.y + ClimbBalance.HOP_MIN, from.y + ClimbBalance.HOP_UP + 1e-6, ClimbBalance.HOP_SIDE, out);
  }

  beside(from: ClimbGrabSpot, moveX: number, moveZ: number, out: ClimbGrabSpot): boolean {
    let best = Infinity;
    const B = ClimbBalance;
    for (const piece of this.world.near(from.x, from.z, from.y - B.SHIFT_LEVEL, from.y + B.SHIFT_LEVEL, B.HOP_SIDE + 0.5, this.found)) {
      if (!(piece instanceof GrabHold) || piece === from.piece || Math.abs(piece.top - from.y) > B.SHIFT_LEVEL) continue;
      const dx = piece.x - from.x, dz = piece.z - from.z, d = Math.hypot(dx, dz);
      if (d < B.HOP_MIN || d > B.HOP_SIDE || (dx * moveX + dz * moveZ) / d < 0.5 || d >= best) continue;
      best = d;
      out.set(piece.x, piece.top, piece.z, piece.nx, piece.nz, piece, false);
    }
    return best < Infinity;
  }
}

class ClimbTimeScale {
  scale = 1;
  active = false;

  update(realDt: number, held: boolean): void {
    const B = ClimbBalance;
    this.active = held;
    const target = this.active ? B.SLOW_SCALE : 1, pace = (1 - B.SLOW_SCALE) / B.SLOW_BLEND * realDt;
    this.scale = this.scale < target ? Math.min(target, this.scale + pace) : Math.max(target, this.scale - pace);
  }
}

abstract class ClimbRunMode {
  abstract readonly name: ClimbRunModeName;
  get stagePortalsUsable(): boolean { return true; }
  get timed(): boolean { return false; }
  get seconds(): number { return 0; }
  get peak(): number { return 0; }
  get restartable(): boolean { return true; }
  tick(_rules: ClimbRules): void {}
  stoodAt(_height: number, _rules: ClimbRules): void {}
  abstract finish(rules: ClimbRules): void;
  abstract switched(rules: ClimbRules): ClimbRunMode;
  abstract restarted(rules: ClimbRules): ClimbRunMode;
}

class ClimbPracticeMode extends ClimbRunMode {
  readonly name = "practice";
  finish(rules: ClimbRules): void { rules.emit({ t: "summit", falls: rules.falls, portals: rules.portalsUsed }); }
  restarted(_rules: ClimbRules): ClimbRunMode { return this; }
  switched(rules: ClimbRules): ClimbRunMode {
    rules.emit({ t: "speedrunStart" });
    return new ClimbSpeedrunMode(rules.falls);
  }
}

class ClimbSpeedrunMode extends ClimbRunMode {
  readonly name = "speedrun";
  readonly splits: number[] = new Array<number>(ClimbBalance.STAGE_COUNT).fill(0);
  finished = false;
  private elapsed = 0;
  private highest = 0;

  constructor(private readonly fallsBefore: number) { super(); }

  get stagePortalsUsable(): boolean { return false; }
  get timed(): boolean { return true; }
  get seconds(): number { return this.elapsed; }
  get peak(): number { return this.highest; }
  get restartable(): boolean { return !this.finished; }

  tick(rules: ClimbRules): void {
    if (this.finished) return;
    this.elapsed += ClimbBalance.TICK;
    const body = rules.body;
    if (body.grounded || body.hanging) this.highest = Math.max(this.highest, body.y);
  }

  stoodAt(height: number, rules: ClimbRules): void {
    for (let stage = 2; stage <= ClimbBalance.STAGE_COUNT; stage++) {
      const start = rules.level.stageStart(stage);
      if (start && height >= start.top - 1e-6) this.markSplit(stage - 1, rules);
    }
  }

  private markSplit(cleared: number, rules: ClimbRules): void {
    const slot = cleared - 1;
    if (this.finished || slot < 0 || slot >= this.splits.length || this.splits[slot] > 0) return;
    this.splits[slot] = this.elapsed;
    rules.emit({ t: "split", stage: cleared, seconds: this.elapsed });
  }

  finish(rules: ClimbRules): void {
    if (this.finished) return;
    this.highest = ClimbBalance.TOP;
    this.markSplit(ClimbBalance.STAGE_COUNT, rules);
    this.finished = true;
    rules.emit({ t: "speedrunFinish", seconds: this.elapsed, splits: this.splits.slice(), falls: rules.falls - this.fallsBefore, peak: this.highest });
  }

  switched(rules: ClimbRules): ClimbRunMode {
    rules.emit({ t: "speedrunExit" });
    return new ClimbPracticeMode();
  }

  restarted(rules: ClimbRules): ClimbRunMode { return new ClimbPracticeMode().switched(rules); }
}

abstract class ClimbPortalKind {
  abstract open(spec: ClimbPortalSpec, rules: ClimbRules): boolean;
  enter(_spec: ClimbPortalSpec, _rules: ClimbRules): void {}
  abstract arrive(spec: ClimbPortalSpec, rules: ClimbRules): void;
}

class ClimbStagePortalKind extends ClimbPortalKind {
  open(spec: ClimbPortalSpec, rules: ClimbRules): boolean { return rules.progress.portalOpen(spec.stage, rules.level, rules.mode); }
  arrive(spec: ClimbPortalSpec, rules: ClimbRules): void {
    const start = rules.level.stageStart(spec.stage);
    if (!start) return;
    rules.dropAt(start.x, start.top, start.z, ClimbBalance.PORTAL_DROP);
    rules.portalsUsed++;
    rules.emit({ t: "portalArrive", stage: spec.stage });
  }
}

class ClimbSpeedrunPortalKind extends ClimbPortalKind {
  open(): boolean { return true; }
  enter(_spec: ClimbPortalSpec, rules: ClimbRules): void { rules.mode = rules.mode.switched(rules); }
  arrive(_spec: ClimbPortalSpec, rules: ClimbRules): void {
    const spawn = rules.level.spawn;
    rules.dropAt(spawn.x, spawn.y, spawn.z, 0);
    rules.body.yaw = spawn.yaw;
    rules.emit({ t: "hubArrive" });
  }
}

class ClimbPortalKinds {
  static readonly KINDS: Readonly<Record<ClimbPortalKindName, ClimbPortalKind>> = { stage: new ClimbStagePortalKind(), speedrun: new ClimbSpeedrunPortalKind() };
  static of(spec: ClimbPortalSpec): ClimbPortalKind { return ClimbPortalKinds.KINDS[spec.kind ?? "stage"]; }
}

class StageProgress {
  constructor(public cleared = 0) {}

  clear(stage: number): boolean {
    if (stage <= this.cleared || stage < 1 || stage > ClimbBalance.STAGE_COUNT) return false;
    this.cleared = stage;
    return true;
  }
  unlocked(portalStage: number): boolean { return portalStage >= 2 && portalStage - 1 <= this.cleared; }
  portalOpen(portalStage: number, level: TowerLevel, mode: ClimbRunMode): boolean { return mode.stagePortalsUsable && this.unlocked(portalStage) && level.hasStage(portalStage); }
}

class TowerStage {
  readonly pieces: PlatformPiece[] = [];
  readonly routes: ClimbRouteSpec[] = [];
  constructor(readonly index: number, readonly name: string, readonly floor: number, readonly ceiling: number) {}
  get built(): boolean { return this.pieces.length > 0; }
}

class TowerLevel {
  static readonly PIECE_KINDS: Readonly<Record<string, new (spec: ClimbPieceSpec) => PlatformPiece>> = {
    static: StaticPlatform, narrow: NarrowPlatform, slope: SlopePlatform, hub: HubIsland,
    rest: StageRest, pad: JumpPad, hold: GrabHold, moving: MovingPlatform, movingPad: MovingJumpPad,
    ice: IcePlatform, crumble: CrumblePlatform, sweeper: SweeperBar, wind: WindZone, summit: SummitGoal,
  };

  readonly pieces: PlatformPiece[];
  readonly stages: TowerStage[];
  readonly portals: readonly ClimbPortalSpec[];
  readonly routes: readonly ClimbRouteSpec[];
  readonly spawn: ClimbSpawnSpec;
  private readonly byId = new Map<string, PlatformPiece>();
  private readonly starts = new Map<number, PlatformPiece>();

  constructor(spec: ClimbLevelSpec) {
    this.stages = spec.stages.map((s) => new TowerStage(s.index, s.name, s.floor, s.ceiling));
    this.pieces = spec.pieces.map((pieceSpec) => {
      const Kind = TowerLevel.PIECE_KINDS[pieceSpec.kind];
      if (!Kind) throw new Error("unknown piece kind " + pieceSpec.kind);
      return new Kind(pieceSpec);
    });
    for (const piece of this.pieces) {
      if (this.byId.has(piece.id)) throw new Error("duplicate piece id " + piece.id);
      this.byId.set(piece.id, piece);
      if (piece.startOf > 0) this.starts.set(piece.startOf, piece);
      this.stageOf(piece.stage)?.pieces.push(piece);
    }
    for (const route of spec.routes) this.stageOf(route.stage)?.routes.push(route);
    this.portals = spec.portals;
    this.routes = spec.routes;
    this.spawn = spec.spawn;
  }

  stageOf(index: number): TowerStage | undefined { return this.stages.find((s) => s.index === index); }
  stageAt(height: number): TowerStage {
    let current = this.stages[0];
    for (const stage of this.stages) if (height >= stage.floor - 1e-6) current = stage;
    return current;
  }
  piece(id: string): PlatformPiece {
    const found = this.byId.get(id);
    if (!found) throw new Error("no piece " + id);
    return found;
  }
  stageStart(index: number): PlatformPiece | null { return this.starts.get(index) ?? null; }
  hasStage(index: number): boolean { return this.starts.has(index); }
}

class ClimbUpPath {
  fromX = 0; fromY = 0; fromZ = 0;
  toX = 0; toY = 0; toZ = 0;
  elapsed = 0;
  piece: PlatformPiece | null = null;

  start(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, piece: PlatformPiece): void {
    this.fromX = fromX; this.fromY = fromY; this.fromZ = fromZ;
    this.toX = toX; this.toY = toY; this.toZ = toZ;
    this.piece = piece;
    this.elapsed = 0;
  }

  ride(piece: MovingPlatform): void {
    const fromX = piece.carryX(this.fromX, this.fromZ), fromZ = piece.carryZ(this.fromX, this.fromZ), toX = piece.carryX(this.toX, this.toZ), toZ = piece.carryZ(this.toX, this.toZ);
    this.fromX = fromX; this.fromZ = fromZ; this.fromY += piece.lift;
    this.toX = toX; this.toZ = toZ; this.toY += piece.lift;
  }

  get progress(): number { return Math.min(1, this.elapsed / ClimbBalance.CLIMB_UP_TIME); }
  get done(): boolean { return this.elapsed >= ClimbBalance.CLIMB_UP_TIME - 1e-9; }
  get rising(): boolean { return this.progress < ClimbBalance.CLIMB_UP_RISE_SHARE; }

  private static ease(t: number): number { return t * t * (3 - 2 * t); }

  advance(seconds: number, body: ClimbCharacterBody): void {
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
  x = 0; y = 0; z = 0;
  prevX = 0; prevY = 0; prevZ = 0;
  vx = 0; vy = 0; vz = 0;
  driftX = 0; driftZ = 0;
  yaw = 0;
  mode: ClimbMode = "free";
  grounded = false;
  ground: PlatformPiece | null = null;
  sliding = false;
  coyote = 0;
  jumpBuffer = 0;
  airPeak = 0;
  readonly spot = new ClimbGrabSpot();
  readonly climbPath = new ClimbUpPath();
  hangTime = 0;
  hopTime = 0;
  shiftCooldown = 0;
  grabCooldown = 0;
  letGo: PlatformPiece | null = null;
  stunTime = 0;
  knockTime = 0;
  knockCooldown = 0;
  windX = 0; windZ = 0;
  portalTime = 0;
  portal: ClimbPortalSpec | null = null;

  place(x: number, y: number, z: number): void {
    this.x = this.prevX = x; this.y = this.prevY = y; this.z = this.prevZ = z;
    this.vx = this.vy = this.vz = 0;
    this.stopDrift();
  }
  respawn(spawn: ClimbSpawnSpec): void {
    this.place(spawn.x, spawn.y, spawn.z);
    this.yaw = spawn.yaw;
    this.mode = "free";
    this.grounded = false;
    this.ground = null;
    this.sliding = false;
    this.coyote = this.jumpBuffer = this.hangTime = this.hopTime = this.shiftCooldown = this.grabCooldown = 0;
    this.stunTime = this.knockTime = this.knockCooldown = this.portalTime = 0;
    this.windX = this.windZ = 0;
    this.letGo = null;
    this.portal = null;
    this.airPeak = spawn.y;
  }
  stopDrift(): void { this.driftX = this.driftZ = 0; }
  remember(): void { this.prevX = this.x; this.prevY = this.y; this.prevZ = this.z; }
  get speed(): number { return Math.hypot(this.vx, this.vz); }
  get hanging(): boolean { return this.mode === "hang"; }
}

class FallReturnWatcher {
  falls = 0;
  constructor(private readonly rules: ClimbRules) {}

  landed(piece: PlatformPiece, drop: number): void {
    if (!piece.hub || drop < ClimbBalance.HOME_FALL) return;
    const body = this.rules.body;
    this.falls++;
    body.mode = "stun";
    body.stunTime = ClimbBalance.STUN;
    body.vx = body.vz = 0;
    this.rules.emit({ t: "fellHome", from: body.airPeak });
  }

  watch(): void {
    const body = this.rules.body, spawn = this.rules.level.spawn;
    if (body.y >= ClimbBalance.VOID_Y) return;
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
  readonly world: ClimbCollisionWorld;
  readonly grab: ClimbGrabSystem;
  readonly time = new ClimbTimeScale();
  readonly body = new ClimbCharacterBody();
  readonly watcher: FallReturnWatcher;
  readonly events: ClimbEvent[] = [];
  readonly movers: MovingPlatform[];
  readonly crumbles: CrumblePlatform[];
  readonly sweepers: SweeperBar[];
  readonly winds: WindZone[];
  summitReached = false;
  ticks = 0;
  peak = 0;
  portalsUsed = 0;
  mode: ClimbRunMode = new ClimbPracticeMode();
  private moveX = 0;
  private moveZ = 0;
  private jumpLatch = false;
  private slowHeld = false;
  private bank = 0;
  private readonly found: PlatformPiece[] = [];
  private readonly probe: ClimbEdgeProbe = { x: 0, z: 0, nx: 0, nz: 0, dist: 0, inside: false };
  private readonly nextSpot = new ClimbGrabSpot();
  private readonly modeSteps: Record<ClimbMode, () => void>;

  constructor(readonly level: TowerLevel, readonly progress: StageProgress) {
    this.world = new ClimbCollisionWorld(level.pieces);
    this.grab = new ClimbGrabSystem(this.world);
    this.watcher = new FallReturnWatcher(this);
    this.movers = level.pieces.filter((piece): piece is MovingPlatform => piece instanceof MovingPlatform);
    this.crumbles = level.pieces.filter((piece): piece is CrumblePlatform => piece instanceof CrumblePlatform);
    this.sweepers = level.pieces.filter((piece): piece is SweeperBar => piece instanceof SweeperBar);
    this.winds = level.pieces.filter((piece): piece is WindZone => piece instanceof WindZone);
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

  steer(x: number, z: number): void {
    const length = Math.hypot(x, z);
    this.moveX = length > 1e-6 ? x / length : 0;
    this.moveZ = length > 1e-6 ? z / length : 0;
  }
  steerStick(stickX: number, stickY: number, view: ClimbViewAxes): void {
    const body = this.body;
    if (!body.hanging) { this.steer(view.rightX * stickX + view.forwardX * stickY, view.rightZ * stickX + view.forwardZ * stickY); return; }
    const axes = ClimbWallAxes.of(body.spot, view);
    this.steer(axes.rightX * stickX + axes.forwardX * stickY, axes.rightZ * stickX + axes.forwardZ * stickY);
  }
  pressJump(): void { this.jumpLatch = true; }
  holdSlow(held: boolean): void { this.slowHeld = held; }
  emit(event: ClimbEvent): void { this.events.push(event); }

  get falls(): number { return this.watcher.falls; }
  get height(): number { return Math.max(0, this.body.y); }
  get blend(): number { return this.bank / ClimbBalance.TICK; }
  get steering(): boolean { return this.moveX !== 0 || this.moveZ !== 0; }

  advance(realDt: number): ClimbEvent[] {
    const B = ClimbBalance, dt = Math.min(Math.max(realDt, 0), B.FRAME_CAP);
    this.events.length = 0;
    this.time.update(dt, this.slowHeld);
    this.bank += dt * this.time.scale;
    while (this.bank >= B.TICK - 1e-12) { this.bank -= B.TICK; this.step(); }
    if (this.bank < 0) this.bank = 0;
    return this.events;
  }

  step(): void {
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
    if (!(body.hanging && body.hopTime > 0)) body.jumpBuffer = Math.max(0, body.jumpBuffer - B.TICK);
    if (this.jumpLatch) { body.jumpBuffer = B.JUMP_BUFFER; this.jumpLatch = false; }
    this.modeSteps[body.mode]();
    this.knockIfSwept();
    this.watcher.watch();
  }

  get worldTime(): number { return this.ticks * ClimbBalance.TICK; }

  private moveMovers(): void {
    const now = this.worldTime, body = this.body;
    for (const mover of this.movers) mover.moveTo(now);
    for (const piece of this.crumbles) piece.update(now, this);
    for (const piece of this.sweepers) piece.update(now);
    body.windX = body.windZ = 0;
    for (const zone of this.winds) {
      zone.update(now);
      if (zone.strength > 0 && zone.holds(body)) { body.windX += zone.dirX * zone.gust.speed * zone.strength; body.windZ += zone.dirZ * zone.gust.speed * zone.strength; }
    }
  }

  private knockIfSwept(): void {
    const B = ClimbBalance, body = this.body;
    if (body.knockCooldown > 0 || body.mode === "portal" || body.mode === "stun") return;
    const bar = this.sweepers.find((piece) => piece.hits(body));
    if (!bar) return;
    if (body.mode === "hang") body.letGo = body.spot.piece;
    body.mode = "free";
    this.leaveGround();
    body.stopDrift();
    body.coyote = 0;
    body.vx = bar.pushX(body) * B.KNOCK_SPEED; body.vz = bar.pushZ(body) * B.KNOCK_SPEED; body.vy = B.KNOCK_UP;
    body.knockTime = B.KNOCK_TIME;
    body.knockCooldown = B.KNOCK_AGAIN;
    body.grabCooldown = B.KNOCK_TIME;
    this.emit({ t: "knock", piece: bar.id });
  }

  reachSummit(): void {
    if (this.summitReached) return;
    this.summitReached = true;
    if (this.progress.clear(ClimbBalance.STAGE_COUNT)) this.emit({ t: "stageClear", stage: ClimbBalance.STAGE_COUNT });
    this.mode.finish(this);
  }

  beginSpeedrun(): void { this.mode = new ClimbPracticeMode().switched(this); }

  restartFromStart(): boolean {
    if (!this.mode.restartable) return false;
    this.body.respawn(this.level.spawn);
    this.crumbles.forEach((piece) => piece.reset());
    this.steer(0, 0);
    this.jumpLatch = false;
    this.bank = 0;
    this.mode = this.mode.restarted(this);
    this.emit({ t: "hubArrive" });
    return true;
  }

  private carrier(): MovingPlatform | null {
    const body = this.body;
    const piece = body.mode === "hang" ? body.spot.piece : body.mode === "climbUp" ? body.climbPath.piece : body.grounded ? body.ground : null;
    return piece instanceof MovingPlatform ? piece : null;
  }

  private carry(): void {
    const body = this.body, piece = this.carrier();
    if (!piece) return;
    const x = piece.carryX(body.x, body.z), z = piece.carryZ(body.x, body.z);
    body.x = x; body.z = z; body.y += piece.lift;
    body.yaw += piece.turn;
    if (body.mode === "hang") body.spot.ride(piece);
    if (body.mode === "climbUp") body.climbPath.ride(piece);
  }

  touchStageStart(stage: number): void {
    if (this.progress.clear(stage - 1)) this.emit({ t: "stageClear", stage: stage - 1 });
  }

  private standOnGround(): void {
    const body = this.body;
    if (!body.ground) return;
    this.mode.stoodAt(body.y, this);
    body.ground.stand(this);
  }

  bounce(pad: PlatformPiece): void {
    this.body.vy = ClimbBalance.PAD_SPEED;
    this.leaveGround();
    this.body.coyote = 0;
    this.emit({ t: "pad", piece: pad.id });
  }

  private leaveGround(): void {
    const body = this.body, ground = body.ground;
    if (ground instanceof MovingPlatform) { body.driftX = ground.vx; body.driftZ = ground.vz; }
    body.grounded = false;
    body.ground = null;
    body.sliding = false;
    body.airPeak = body.y;
  }

  private approach(targetX: number, targetZ: number, maxDelta: number): void {
    const body = this.body, dx = targetX - body.vx, dz = targetZ - body.vz, d = Math.hypot(dx, dz);
    if (d <= maxDelta) { body.vx = targetX; body.vz = targetZ; return; }
    body.vx += dx / d * maxDelta; body.vz += dz / d * maxDelta;
  }

  private stepFree(): void {
    const B = ClimbBalance, T = B.TICK, body = this.body;

    const ground = body.grounded ? body.ground : null;
    body.sliding = !!ground && ground.slopeDeg > B.SLOPE_LIMIT_DEG;
    if (ground && body.sliding) {
      const down = ground.rise > 0 ? -1 : 1, angle = ground.slopeDeg * Math.PI / 180, pull = B.GRAVITY * Math.sin(angle) * Math.cos(angle) * T;
      body.vx += down * ground.cos * pull; body.vz += down * -ground.sin * pull;
    } else if (ground) {
      if (this.steering) this.approach(this.moveX * B.RUN, this.moveZ * B.RUN, ground.accel * T);
      else this.approach(0, 0, ground.brake * T);
    } else if (this.steering && body.knockTime <= 0) this.approach(this.moveX * B.RUN, this.moveZ * B.RUN, B.AIR_ACCEL * T);

    body.coyote = body.grounded ? B.COYOTE : Math.max(0, body.coyote - T);
    if (body.jumpBuffer > 0 && body.coyote > 0 && !body.sliding) {
      body.jumpBuffer = 0;
      body.coyote = 0;
      body.vy = B.JUMP;
      this.leaveGround();
      this.emit({ t: "jump" });
    }
    if (!body.grounded) body.vy = Math.max(body.vy - B.GRAVITY * T, -B.FALL_MAX);

    const blown = ground ? 1 - ground.windGrip : 1;
    let nextX = body.x + (body.vx + body.driftX + body.windX * blown) * T, nextZ = body.z + (body.vz + body.driftZ + body.windZ * blown) * T;
    const near = this.world.near(nextX, nextZ, body.y - 1.5, body.y + B.HEIGHT + 1.5, B.RADIUS + 0.5, this.found);
    for (let pass = 0; pass < 2; pass++)
      for (const piece of near) {
        if (!piece.solid) continue;
        const edge = piece.edge(nextX, nextZ, this.probe);
        if (!edge.inside && edge.dist >= B.RADIUS) continue;
        if (body.y + B.STEP >= piece.topAt(edge.x, edge.z) || body.y + B.HEIGHT <= piece.bottom) continue;
        nextX = edge.x + edge.nx * B.RADIUS; nextZ = edge.z + edge.nz * B.RADIUS;
        const into = body.vx * edge.nx + body.vz * edge.nz;
        if (into < 0) { body.vx -= into * edge.nx; body.vz -= into * edge.nz; }
        const driftInto = body.driftX * edge.nx + body.driftZ * edge.nz;
        if (driftInto < 0) { body.driftX -= driftInto * edge.nx; body.driftZ -= driftInto * edge.nz; }
      }

    const wasGrounded = body.grounded;
    let nextY = body.y + body.vy * T, floor = -Infinity, floorPiece: PlatformPiece | null = null;
    for (const piece of near) {
      if (!piece.solid || !piece.covers(nextX, nextZ)) continue;
      const top = piece.topAt(nextX, nextZ);
      if (top <= body.y + B.STEP + 1e-6) { if (top > floor) { floor = top; floorPiece = piece; } }
      else if (body.vy > 0 && piece.bottom >= body.y + B.HEIGHT - 1e-6 && piece.bottom < nextY + B.HEIGHT) { nextY = piece.bottom - B.HEIGHT; body.vy = 0; }
    }
    body.x = nextX; body.z = nextZ;
    if (body.vy <= 0 && floorPiece && floor >= nextY - (wasGrounded ? B.STEP : 0)) this.land(floorPiece, floor, wasGrounded);
    else {
      body.y = nextY;
      if (wasGrounded) this.leaveGround();
      body.airPeak = Math.max(body.airPeak, body.y);
    }

    if (body.grounded) this.standOnGround();
    if (body.speed > 0.5) body.yaw = Math.atan2(body.vx, body.vz);
    if (body.grounded) { this.peak = Math.max(this.peak, body.y); this.enterPortalIfInside(); }
    else if (this.canAutoGrab()) this.startHang();
  }

  private land(piece: PlatformPiece, top: number, wasGrounded: boolean): void {
    const body = this.body;
    body.y = top;
    body.vy = 0;
    body.grounded = true;
    body.ground = piece;
    body.stopDrift();
    if (wasGrounded) return;
    body.letGo = null;
    const drop = body.airPeak - top;
    this.emit({ t: "land", piece: piece.id, drop });
    this.watcher.landed(piece, drop);
  }

  private enterPortalIfInside(): void {
    const B = ClimbBalance, body = this.body;
    if (body.mode !== "free") return;
    for (const portal of this.level.portals) {
      const kind = ClimbPortalKinds.of(portal);
      if (!kind.open(portal, this)) continue;
      if (Math.hypot(portal.x - body.x, portal.z - body.z) > B.PORTAL_RADIUS || Math.abs(portal.y - body.y) > 1) continue;
      body.mode = "portal";
      body.portalTime = B.PORTAL_TIME;
      body.portal = portal;
      body.vx = body.vy = body.vz = 0;
      this.emit({ t: "portalEnter", stage: portal.stage });
      kind.enter(portal, this);
      return;
    }
  }

  private startHang(): void {
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

  private settleOnSpot(): void {
    const body = this.body, spot = body.spot;
    body.x = spot.bodyX; body.z = spot.bodyZ;
    body.y = Math.max(spot.bodyY, this.world.floorBelow(body.x, body.z, spot.y - ClimbBalance.STEP, this.found));
    body.vx = body.vy = body.vz = 0;
    body.stopDrift();
    body.yaw = Math.atan2(-spot.nx, -spot.nz);
    body.airPeak = body.y;
    this.peak = Math.max(this.peak, body.y);
  }

  private stepHang(): void {
    const B = ClimbBalance, T = B.TICK, body = this.body, spot = body.spot;
    if (spot.piece && !spot.piece.solid && !(spot.piece instanceof GrabHold)) { this.release(false); return; }
    if (body.hopTime > 0) { body.hopTime = Math.max(0, body.hopTime - T); return; }
    if (this.pullingAway(spot)) { this.release(false); return; }
    if (spot.ledge) {
      body.hangTime += T;
      if (body.hangTime >= B.MANTLE_MIN_HANG && (body.jumpBuffer > 0 || this.pushingInto(spot))) { body.jumpBuffer = 0; this.mantle(); }
      return;
    }
    if (body.jumpBuffer > 0) {
      body.jumpBuffer = 0;
      if (this.grab.above(spot, this.nextSpot)) this.hopTo(this.nextSpot); else this.release(true);
      return;
    }
    if (this.steering && body.shiftCooldown <= 0 && this.grab.beside(spot, this.moveX, this.moveZ, this.nextSpot)) {
      this.hopTo(this.nextSpot);
      body.shiftCooldown = B.SHIFT_COOLDOWN;
    }
  }

  private canAutoGrab(): boolean {
    const body = this.body;
    if (body.grounded || body.grabCooldown > 0) return false;
    return this.grab.findFor(body, body.spot, body.letGo) && !this.pullingAway(body.spot);
  }

  private pullingAway(spot: ClimbGrabSpot): boolean {
    return this.moveX * spot.nx + this.moveZ * spot.nz >= ClimbBalance.MANTLE_PUSH;
  }

  private pushingInto(spot: ClimbGrabSpot): boolean {
    return -(this.moveX * spot.nx + this.moveZ * spot.nz) >= ClimbBalance.MANTLE_PUSH;
  }

  private hopTo(next: ClimbGrabSpot): void {
    const body = this.body;
    body.spot.copy(next);
    body.hopTime = ClimbBalance.HOP_TIME;
    body.hangTime = 0;
    this.settleOnSpot();
    this.emit({ t: "hop" });
  }

  private mantle(): void {
    const B = ClimbBalance, body = this.body, spot = body.spot, piece = spot.piece;
    if (!piece) { this.release(false); return; }
    const inset = ClimbBalance.MANTLE_INSETS.find((d) => piece.covers(spot.x - spot.nx * d, spot.z - spot.nz * d));
    const x = inset === undefined ? piece.x : spot.x - spot.nx * inset, z = inset === undefined ? piece.z : spot.z - spot.nz * inset;
    body.climbPath.start(body.x, body.y, body.z, x, piece.top, z, piece);
    body.mode = "climbUp";
    this.emit({ t: "climbUp" });
  }

  private stepClimbUp(): void {
    const body = this.body, path = body.climbPath;
    if (path.piece && !path.piece.solid) { this.dropFromClimb(); return; }
    path.advance(ClimbBalance.TICK, body);
    if (path.done) this.finishMantle();
  }

  private dropFromClimb(): void {
    const body = this.body;
    body.mode = "free";
    body.grounded = false;
    body.ground = null;
    body.vx = body.vy = body.vz = 0;
    body.airPeak = body.y;
    this.emit({ t: "release" });
  }

  private finishMantle(): void {
    const B = ClimbBalance, body = this.body, path = body.climbPath, piece = path.piece;
    if (!piece) { body.mode = "free"; return; }
    body.x = path.toX; body.y = path.toY; body.z = path.toZ;
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

  private release(jump: boolean): void {
    const B = ClimbBalance, body = this.body;
    body.mode = "free";
    body.grabCooldown = B.REGRAB;
    body.letGo = body.spot.piece;
    body.grounded = false;
    body.ground = null;
    body.coyote = 0;
    body.airPeak = body.y;
    body.stopDrift();
    if (jump) { body.vy = B.JUMP; body.vx = this.moveX * B.RUN; body.vz = this.moveZ * B.RUN; this.emit({ t: "jump" }); }
    else this.emit({ t: "release" });
  }

  private stepStun(): void {
    const body = this.body;
    body.stunTime -= ClimbBalance.TICK;
    if (body.stunTime <= 0) body.mode = "free";
    this.standOnGround();
  }

  private stepPortal(): void {
    const B = ClimbBalance, body = this.body;
    body.portalTime -= B.TICK;
    if (body.portalTime > 0) return;
    const portal = body.portal;
    body.mode = "free";
    body.portal = null;
    if (portal) ClimbPortalKinds.of(portal).arrive(portal, this);
  }

  dropAt(x: number, top: number, z: number, lift: number): void {
    const body = this.body;
    body.place(x, top + lift, z);
    body.grounded = false;
    body.ground = null;
    body.airPeak = top;
  }
}
