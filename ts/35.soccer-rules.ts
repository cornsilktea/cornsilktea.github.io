type SocBallKind = "kickoff" | "dribble" | "pass" | "shot" | "loose" | "deflect" | "tackled";
type SocActionKind = "pass" | "shot" | "tackle" | "slide";
type SocBodyAction = "none" | "tackle" | "slide";
type SocGamePhase = "ready" | "play" | "goal" | "over";
type SocEnginePhase = "idle" | SocGamePhase;

interface SocPoint { x: number; z: number }
interface SocMover extends SocPoint { vx: number; vz: number }
interface SocBallState { x: number; y: number; z: number; vx: number; vy: number; vz: number }

interface SocBallRecord extends SocBallState {
  at: number;
  seq: number;
  kind: SocBallKind;
  by: number;
  owner: number;
  victim: number;
}

interface SocGameRecord {
  n: number;
  phase: SocGamePhase;
  at: number;
  leftMs: number;
  overtime: boolean;
  sa: number;
  sb: number;
  kickoff: number;
  scorer: number;
  own: boolean;
  winner: number;
}

interface SocNetImpact { surface: "back" | "side" | "roof"; x: number; y: number; z: number; strength: number }
interface SocActionRequest { kind: SocActionKind; power: number; atMs: number; dirX: number; dirZ: number }
interface SocLaunch { vx: number; vy: number; vz: number; startX: number; startZ: number; target: SocPoint }

type SocEvent = { type: "ball"; ball: SocBallRecord } | { type: "game"; game: SocGameRecord };

class SocConfig {
  static readonly ROOT = "soccer/rooms";
  static readonly HALF_W = 7.5;
  static readonly HALF_L = 12;
  static readonly GOAL_HALF_W = 2.6;
  static readonly GOAL_H = 2.2;
  static readonly GOAL_DEPTH = 2.2;
  static readonly BALL_R = 0.3;
  static readonly BODY_R = 0.45;
  static readonly BODY_H = 1.8;
  static readonly GRAVITY = 11;
  static readonly SUB_STEP = 1 / 120;
  static readonly SEAT_COUNT = 4;
  static readonly SPECTATOR_SLOT = 4;
  static readonly NET_MS = 143;
  static readonly THINK_MS = 100;
  static readonly MATCH_MS = 120000;
  static readonly READY_MS = 3200;
  static readonly OVERTIME_READY_MS = 3600;
  static readonly GOAL_MS = 4200;
  static readonly MOVE_SPEED = 6.2;
  static readonly DRIBBLE_SPEED_FACTOR = 0.9;
  static readonly DRIBBLE_NEAR = 0.8;
  static readonly DRIBBLE_FAR = 1.05;
  static readonly DRIBBLE_TOUCH_MS = 190;
  static readonly DRIBBLE_TURN_RATE = 8;
  static readonly DRIBBLE_TURN_RATE_STANDING = 4;
  static readonly PLAYER_SEPARATION = 0.9;
  static readonly KEEPER_HALF_W = 2;
  static readonly KEEPER_NEAR = 0.7;
  static readonly KEEPER_FAR = 2.1;
  static readonly KEEPER_SPEED_SCALE = 0.72;
  static readonly KEEPER_THINK_MS = 140;
  static readonly KEEPER_REACH = 1.2;
  static readonly KEEPER_CATCH_SPEED = 11;
  static readonly KEEPER_HOLD_MS = 1300;
  static readonly KEEPER_KICK_POWER = 0.8;
  static readonly KEEPER_COME_OUT_DISTANCE = 3.2;
  static readonly PICKUP_RADIUS = 0.92;
  static readonly PICKUP_HEIGHT = 1.2;
  static readonly CAPTURE_MAX_SPEED = 7;
  static readonly KICK_IMMUNE_MS = 380;
  static readonly OWNER_PROTECT_MS = 700;
  static readonly KICKOFF_PROTECT_MS = 1500;
  static readonly ROLL_DRAG = 0.5;
  static readonly AIR_DRAG = 0.06;
  static readonly STOP_SPEED = 0.18;
  static readonly BOUNCE_REST = 0.5;
  static readonly BOUNCE_MIN_SPEED = 1.3;
  static readonly BOUNCE_FRICTION = 0.88;
  static readonly WALL_REST = 0.62;
  static readonly NET_REST = 0.28;
  static readonly BODY_REST = 0.55;
  static readonly PASS_MIN_SPEED = 6.5;
  static readonly PASS_MAX_SPEED = 18;
  static readonly PASS_ARRIVE_SPEED = 4.5;
  static readonly PASS_POWER_BOOST = 0.9;
  static readonly PASS_LEAD_FACTOR = 0.9;
  static readonly PASS_LEAD_MAX_S = 0.9;
  static readonly SHOT_SPEED_MIN = 13;
  static readonly SHOT_SPEED_MAX = 24;
  static readonly SHOT_ARRIVE_SPEED = 3.2;
  static readonly SHOT_FALLOFF_START = 6;
  static readonly SHOT_FALLOFF_RANGE = 12;
  static readonly SHOT_FALLOFF_MAX = 0.55;
  static readonly SHOT_ERROR_BASE = 0.012;
  static readonly SHOT_ERROR_PER_M = 0.016;
  static readonly SHOT_ERROR_FREE_M = 3;
  static readonly SHOT_MISS_FREE_M = 2.8;
  static readonly SHOT_MISS_SPAN_M = 4.6;
  static readonly SHOT_MISS_MAX = 0.95;
  static readonly SHOT_MISS_MIN_OFFSET = 0.45;
  static readonly SHOT_MISS_OFFSET_SPAN = 1.6;
  static readonly SHOT_CORNER_INSET = 0.6;
  static readonly SHOT_TARGET_H = 0.7;
  static readonly SHOT_MAX_VY = 4.2;
  static readonly CHARGE_MS = 900;
  static readonly TACKLE_ACTIVE_MS = 300;
  static readonly TACKLE_LUNGE_SPEED = 1.5;
  static readonly TACKLE_RANGE = 1.15;
  static readonly TACKLE_HALF_ANGLE = 0.75;
  static readonly TACKLE_CLOSE_RANGE = 0.6;
  static readonly TACKLE_ASSIST_RANGE = 2.2;
  static readonly TACKLE_FAIL_RECOVER_MS = 220;
  static readonly TACKLE_WIN_RECOVER_MS = 60;
  static readonly TACKLE_POP_SPEED = 4.6;
  static readonly SLIDE_MS = 650;
  static readonly SLIDE_SPEED = 10.5;
  static readonly SLIDE_HIT_RADIUS = 1.15;
  static readonly SLIDE_FAIL_RECOVER_MS = 650;
  static readonly SLIDE_WIN_RECOVER_MS = 120;
  static readonly SLIDE_POP_SPEED = 6.6;
  static readonly SLIDE_KICK_SPEED = 8.5;
  static readonly DISLODGE_STUN_MS = 750;
  static readonly TEAM_NAMES: readonly string[] = ["빨강 팀", "파랑 팀"];
  static readonly TEAM_COLORS: readonly string[] = ["#E5484D", "#3E8EF0"];
  static readonly TEAM_TOP_COLOR_INDEX: readonly number[] = [0, 5];
  static readonly BOT_NAMES: readonly string[] = ["봇 1", "봇 2", "봇 3", "봇 4"];
  static readonly KEEPER_NAME = "골키퍼";

  static teamOfSlot(slot: number): number {
    if (slot >= SocConfig.SEAT_COUNT) return slot - SocConfig.SEAT_COUNT;
    return slot < 2 ? 0 : 1;
  }

  static sideOf(team: number): number {
    return team === 0 ? 1 : -1;
  }

  static attackOf(team: number): number {
    return -SocConfig.sideOf(team);
  }
}

class SocMath {
  static clamp(value: number, low: number, high: number): number {
    return value < low ? low : value > high ? high : value;
  }

  static lerp(from: number, to: number, ratio: number): number {
    return from + (to - from) * ratio;
  }

  static gaussian(random: () => number): number {
    return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  }

  static angleDifference(a: number, b: number): number {
    let difference = a - b;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    return difference;
  }

  static distance(a: SocPoint, b: SocPoint): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  static segmentDistance(point: SocPoint, from: SocPoint, to: SocPoint): number {
    const dx = to.x - from.x, dz = to.z - from.z;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < 1e-9) return SocMath.distance(point, from);
    const ratio = SocMath.clamp(((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared, 0, 1);
    return Math.hypot(point.x - (from.x + dx * ratio), point.z - (from.z + dz * ratio));
  }
}

class SocBallPhysics {
  x: number = 0;
  y: number = SocConfig.BALL_R;
  z: number = 0;
  vx: number = 0;
  vy: number = 0;
  vz: number = 0;
  scoredTeam = -1;
  readonly impacts: SocNetImpact[] = [];
  private carry = 0;

  static projectedDistanceFactor(seconds: number): number {
    return (1 - Math.exp(-SocConfig.ROLL_DRAG * seconds)) / SocConfig.ROLL_DRAG;
  }

  load(state: SocBallState): void {
    this.x = state.x;
    this.y = state.y;
    this.z = state.z;
    this.vx = state.vx;
    this.vy = state.vy;
    this.vz = state.vz;
    this.carry = 0;
  }

  state(): SocBallState {
    return { x: this.x, y: this.y, z: this.z, vx: this.vx, vy: this.vy, vz: this.vz };
  }

  speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  advance(seconds: number): void {
    this.carry += seconds;
    while (this.carry >= SocConfig.SUB_STEP) {
      this.substep(SocConfig.SUB_STEP);
      this.carry -= SocConfig.SUB_STEP;
    }
  }

  substep(dt: number): void {
    this.vy -= SocConfig.GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.resolveGround();
    this.resolveBounds();
    this.applyDrag(dt);
    this.detectGoal();
  }

  private resolveGround(): void {
    if (this.y > SocConfig.BALL_R) return;
    this.y = SocConfig.BALL_R;
    if (this.vy < -SocConfig.BOUNCE_MIN_SPEED) {
      this.vy = -this.vy * SocConfig.BOUNCE_REST;
      this.vx *= SocConfig.BOUNCE_FRICTION;
      this.vz *= SocConfig.BOUNCE_FRICTION;
    } else if (this.vy < 0) {
      this.vy = 0;
    }
  }

  private resolveBounds(): void {
    const radius = SocConfig.BALL_R;
    const inPocket = Math.abs(this.z) > SocConfig.HALF_L;
    const limitX = (inPocket ? SocConfig.GOAL_HALF_W : SocConfig.HALF_W) - radius;
    if (Math.abs(this.x) > limitX) {
      const sign = Math.sign(this.x);
      this.x = sign * limitX;
      if (this.vx * sign > 0) {
        this.recordImpact(inPocket ? "side" : "", Math.abs(this.vx));
        this.vx = -this.vx * (inPocket ? SocConfig.NET_REST : SocConfig.WALL_REST);
      }
    }
    const mouthOpen = Math.abs(this.x) <= SocConfig.GOAL_HALF_W - radius && this.y <= SocConfig.GOAL_H - radius;
    const deep = inPocket || mouthOpen;
    const limitZ = deep ? SocConfig.HALF_L + SocConfig.GOAL_DEPTH - radius : SocConfig.HALF_L - radius;
    if (Math.abs(this.z) > limitZ) {
      const sign = Math.sign(this.z);
      this.z = sign * limitZ;
      if (this.vz * sign > 0) {
        this.recordImpact(deep ? "back" : "", Math.abs(this.vz));
        this.vz = -this.vz * (deep ? SocConfig.NET_REST : SocConfig.WALL_REST);
      }
    }
    if (Math.abs(this.z) > SocConfig.HALF_L && this.y > SocConfig.GOAL_H - radius) {
      this.y = SocConfig.GOAL_H - radius;
      if (this.vy > 0) {
        this.recordImpact("roof", this.vy);
        this.vy = -this.vy * SocConfig.NET_REST;
      }
    }
  }

  settle(): void {
    this.resolveBounds();
  }

  private recordImpact(surface: SocNetImpact["surface"] | "", strength: number): void {
    if (surface === "" || strength < 0.8) return;
    this.impacts.push({ surface, x: this.x, y: this.y, z: this.z, strength });
    if (this.impacts.length > 8) this.impacts.shift();
  }

  private applyDrag(dt: number): void {
    const grounded = this.y <= SocConfig.BALL_R + 1e-4 && this.vy <= 0.001;
    const factor = Math.exp(-(grounded ? SocConfig.ROLL_DRAG : SocConfig.AIR_DRAG) * dt);
    this.vx *= factor;
    this.vz *= factor;
    if (grounded && Math.hypot(this.vx, this.vz) < SocConfig.STOP_SPEED) {
      this.vx = 0;
      this.vz = 0;
    }
  }

  private detectGoal(): void {
    if (this.scoredTeam >= 0) return;
    if (Math.abs(this.z) > SocConfig.HALF_L + SocConfig.BALL_R && this.y < SocConfig.GOAL_H) this.scoredTeam = this.z < 0 ? 0 : 1;
  }
}

class SocDribbleFollower {
  private angle = 0;
  private ready = false;
  private lastMs = 0;

  reset(): void {
    this.ready = false;
  }

  position(x: number, z: number, yaw: number, moving: boolean, sinceMs: number, nowMs: number, seed?: SocPoint): SocPoint {
    if (!this.ready) {
      this.ready = true;
      this.angle = seed && Math.hypot(seed.x - x, seed.z - z) > 0.05 ? Math.atan2(seed.x - x, seed.z - z) : yaw;
      this.lastMs = nowMs;
    }
    const seconds = Math.max(0, Math.min(0.25, (nowMs - this.lastMs) / 1000));
    this.lastMs = nowMs;
    const rate = (moving ? SocConfig.DRIBBLE_TURN_RATE : SocConfig.DRIBBLE_TURN_RATE_STANDING) * seconds;
    this.angle += SocMath.clamp(SocMath.angleDifference(yaw, this.angle), -rate, rate);
    const touch = SocConfig.DRIBBLE_TOUCH_MS;
    const phase = moving ? (((nowMs - sinceMs) % touch) + touch) % touch / touch : 0.5;
    const offset = SocConfig.DRIBBLE_NEAR + (SocConfig.DRIBBLE_FAR - SocConfig.DRIBBLE_NEAR) * Math.abs(1 - 2 * phase);
    const limitX = SocConfig.HALF_W - SocConfig.BALL_R, limitZ = SocConfig.HALF_L - SocConfig.BALL_R;
    return {
      x: SocMath.clamp(x + Math.sin(this.angle) * offset, -limitX, limitX),
      z: SocMath.clamp(z + Math.cos(this.angle) * offset, -limitZ, limitZ)
    };
  }
}
class SocPlanner {
  static clampToField(point: SocPoint): SocPoint {
    return { x: SocMath.clamp(point.x, -SocConfig.HALF_W + 0.5, SocConfig.HALF_W - 0.5), z: SocMath.clamp(point.z, -SocConfig.HALF_L + 0.5, SocConfig.HALF_L - 0.5) };
  }

  static laneClear(from: SocPoint, to: SocPoint, opponents: readonly SocPoint[], radius: number): boolean {
    return opponents.every((opponent) => SocMath.segmentDistance(opponent, from, to) > radius);
  }

  static baseSpeed(distance: number, arriveSpeed: number): number {
    return SocConfig.ROLL_DRAG * distance + arriveSpeed;
  }

  static pass(from: SocPoint, mate: SocMover, power: number, errorAngle: number): SocLaunch {
    const drag = SocConfig.ROLL_DRAG;
    let target: SocPoint = { x: mate.x, z: mate.z };
    let speed = SocConfig.PASS_MIN_SPEED;
    for (let round = 0; round < 3; round++) {
      const distance = Math.max(0.5, SocMath.distance(from, target));
      const base = Math.max(SocConfig.PASS_MIN_SPEED, SocPlanner.baseSpeed(distance, SocConfig.PASS_ARRIVE_SPEED));
      speed = SocMath.clamp(base * (1 + power * SocConfig.PASS_POWER_BOOST), SocConfig.PASS_MIN_SPEED, SocConfig.PASS_MAX_SPEED);
      const ratio = Math.min(0.95, (drag * distance) / base);
      const arrive = -Math.log(1 - ratio) / drag;
      const lead = Math.min(arrive, SocConfig.PASS_LEAD_MAX_S) * SocConfig.PASS_LEAD_FACTOR;
      target = SocPlanner.clampToField({ x: mate.x + mate.vx * lead, z: mate.z + mate.vz * lead });
    }
    const angle = Math.atan2(target.x - from.x, target.z - from.z) + errorAngle;
    return { vx: Math.sin(angle) * speed, vy: 0, vz: Math.cos(angle) * speed, startX: from.x, startZ: from.z, target };
  }

  static shotTarget(from: SocPoint, team: number, opponents: readonly SocPoint[]): SocPoint {
    const attack = SocConfig.attackOf(team);
    const goalZ = attack * (SocConfig.HALF_L + 0.6);
    const cornerX = SocConfig.GOAL_HALF_W - SocConfig.SHOT_CORNER_INSET;
    let best: SocPoint = { x: cornerX, z: goalZ };
    let bestScore = -1;
    [-cornerX, cornerX].forEach((x) => {
      const corner = { x, z: goalZ };
      let score = 99;
      opponents.forEach((opponent) => {
        score = Math.min(score, SocMath.segmentDistance(opponent, from, corner), SocMath.distance(opponent, corner));
      });
      if (score > bestScore) {
        bestScore = score;
        best = corner;
      }
    });
    return best;
  }

  static shotSpeed(distance: number, power: number): number {
    const raw = SocMath.lerp(SocConfig.SHOT_SPEED_MIN, SocConfig.SHOT_SPEED_MAX, power);
    const falloff = 1 - SocConfig.SHOT_FALLOFF_MAX * SocMath.clamp((distance - SocConfig.SHOT_FALLOFF_START) / SocConfig.SHOT_FALLOFF_RANGE, 0, 1);
    return Math.max(SocPlanner.baseSpeed(distance, SocConfig.SHOT_ARRIVE_SPEED), raw * falloff);
  }

  static shotError(distance: number): number {
    return SocConfig.SHOT_ERROR_BASE + SocConfig.SHOT_ERROR_PER_M * Math.max(0, distance - SocConfig.SHOT_ERROR_FREE_M);
  }

  static missChance(distance: number): number {
    return SocMath.clamp((distance - SocConfig.SHOT_MISS_FREE_M) / SocConfig.SHOT_MISS_SPAN_M, 0, SocConfig.SHOT_MISS_MAX);
  }

  static shot(from: SocPoint, team: number, opponents: readonly SocPoint[], power: number, random: () => number, errorScale: number = 1): SocLaunch {
    const corner = SocPlanner.shotTarget(from, team, opponents);
    const distance = Math.max(1, SocMath.distance(from, corner));
    const wide = random() < SocPlanner.missChance(distance) ? Math.sign(corner.x) * (SocConfig.SHOT_MISS_MIN_OFFSET + random() * SocConfig.SHOT_MISS_OFFSET_SPAN) : 0;
    const target: SocPoint = { x: corner.x + wide, z: corner.z };
    const speed = SocPlanner.shotSpeed(distance, power);
    const angle = Math.atan2(target.x - from.x, target.z - from.z) + SocMath.gaussian(random) * SocPlanner.shotError(distance) * errorScale;
    const average = Math.max(2, speed - (SocConfig.ROLL_DRAG * distance) / 2);
    const seconds = distance / average;
    const lift = (SocConfig.SHOT_TARGET_H - SocConfig.BALL_R + 0.5 * SocConfig.GRAVITY * seconds * seconds) / seconds;
    return { vx: Math.sin(angle) * speed, vy: SocMath.clamp(lift, 0, SocConfig.SHOT_MAX_VY), vz: Math.cos(angle) * speed, startX: from.x, startZ: from.z, target };
  }
}

class SocCourtLayout {
  static takerSlot(team: number): number {
    return team * 2;
  }

  static kickoffSpot(slot: number, kickoffTeam: number): SocPoint {
    const team = SocConfig.teamOfSlot(slot);
    const side = SocConfig.sideOf(team);
    const first = slot % 2 === 0;
    if (team === kickoffTeam) return first ? { x: 0, z: side * 1.1 } : { x: 3.4 * side, z: side * 5.5 };
    return first ? { x: -2.8 * side, z: side * 4.6 } : { x: 2.8 * side, z: side * 7.4 };
  }

  static keeperHome(slot: number): SocPoint {
    const side = SocConfig.sideOf(SocConfig.teamOfSlot(slot));
    return { x: 0, z: side * (SocConfig.HALF_L - (SocConfig.KEEPER_NEAR + SocConfig.KEEPER_FAR) / 2) };
  }

  static spotFor(slot: number, kickoffTeam: number): SocPoint {
    return slot >= SocConfig.SEAT_COUNT ? SocCourtLayout.keeperHome(slot) : SocCourtLayout.kickoffSpot(slot, kickoffTeam);
  }

  static facingYaw(team: number): number {
    return SocConfig.sideOf(team) > 0 ? Math.PI : 0;
  }

  static clampPlayer(x: number, z: number): SocPoint {
    return {
      x: SocMath.clamp(x, -SocConfig.HALF_W + SocConfig.BODY_R, SocConfig.HALF_W - SocConfig.BODY_R),
      z: SocMath.clamp(z, -SocConfig.HALF_L + SocConfig.BODY_R, SocConfig.HALF_L - SocConfig.BODY_R)
    };
  }
}

abstract class SocPlayerController {
  x = 0;
  z = 0;
  yaw = 0;
  moving = false;
  ix = 0;
  iz = 0;
  frozen = false;
  carrying = false;
  actionKind: SocBodyAction = "none";
  actionStartMs = -1e9;
  actionDirX = 0;
  actionDirZ = 1;
  actionSeq = 0;
  actionResolved = true;
  slideKicked = false;
  recoverUntilMs = 0;
  noPickupUntilMs = 0;
  protectUntilMs = 0;
  speedScale = 1;
  obstacles: readonly SocPlayerController[] = [];
  private queued: SocActionRequest | null = null;

  constructor(readonly slot: number) {}

  get team(): number {
    return SocConfig.teamOfSlot(this.slot);
  }

  abstract poll(engine: SocEngine | null, dtSec: number, nowMs: number): void;

  queueAction(request: SocActionRequest): void {
    this.queued = request;
  }

  takeQueued(): SocActionRequest | null {
    const request = this.queued;
    this.queued = null;
    return request;
  }

  velocity(): SocMover {
    const length = Math.hypot(this.ix, this.iz);
    if (!this.moving || length < 0.05) return { x: this.x, z: this.z, vx: 0, vz: 0 };
    const speed = SocConfig.MOVE_SPEED * this.speedScale * (this.carrying ? SocConfig.DRIBBLE_SPEED_FACTOR : 1);
    return { x: this.x, z: this.z, vx: (this.ix / length) * speed, vz: (this.iz / length) * speed };
  }

  activeMs(): number {
    return this.actionKind === "tackle" ? SocConfig.TACKLE_ACTIVE_MS : this.actionKind === "slide" ? SocConfig.SLIDE_MS : 0;
  }

  isActing(nowMs: number): boolean {
    return this.actionKind !== "none" && nowMs >= this.actionStartMs && nowMs < this.actionStartMs + this.activeMs();
  }

  isBusy(nowMs: number): boolean {
    return this.isActing(nowMs) || nowMs < this.recoverUntilMs;
  }

  beginBodyAction(kind: SocBodyAction, nowMs: number, dirX: number, dirZ: number): void {
    const length = Math.hypot(dirX, dirZ) || 1;
    this.actionKind = kind;
    this.actionStartMs = nowMs;
    this.actionDirX = dirX / length;
    this.actionDirZ = dirZ / length;
    this.actionSeq++;
    this.actionResolved = false;
    this.slideKicked = false;
    this.yaw = Math.atan2(this.actionDirX, this.actionDirZ);
    const failRecover = kind === "tackle" ? SocConfig.TACKLE_FAIL_RECOVER_MS : SocConfig.SLIDE_FAIL_RECOVER_MS;
    this.recoverUntilMs = nowMs + this.activeMs() + failRecover;
  }

  winRecover(nowMs: number): void {
    const recover = this.actionKind === "slide" ? SocConfig.SLIDE_WIN_RECOVER_MS : SocConfig.TACKLE_WIN_RECOVER_MS;
    this.recoverUntilMs = Math.min(this.recoverUntilMs, nowMs + recover);
    this.actionResolved = true;
  }

  step(dtSec: number, nowMs: number = 0): void {
    if (this.frozen) {
      this.moving = false;
      return;
    }
    if (this.isActing(nowMs)) {
      const progress = (nowMs - this.actionStartMs) / this.activeMs();
      const speed = this.actionKind === "slide" ? SocConfig.SLIDE_SPEED * (1 - progress * 0.85) : SocConfig.TACKLE_LUNGE_SPEED;
      this.applyMove(this.actionDirX * speed * dtSec, this.actionDirZ * speed * dtSec);
      this.moving = true;
      return;
    }
    if (nowMs < this.recoverUntilMs) {
      this.moving = false;
      return;
    }
    const length = Math.hypot(this.ix, this.iz);
    if (length > 0.05) {
      const speed = SocConfig.MOVE_SPEED * this.speedScale * (this.carrying ? SocConfig.DRIBBLE_SPEED_FACTOR : 1);
      this.applyMove((this.ix / length) * speed * dtSec, (this.iz / length) * speed * dtSec);
      this.yaw = Math.atan2(this.ix, this.iz);
      this.moving = true;
    } else {
      this.moving = false;
    }
  }

  teleport(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.ix = this.iz = 0;
    this.moving = false;
    this.yaw = SocCourtLayout.facingYaw(this.team);
    this.actionKind = "none";
    this.recoverUntilMs = 0;
  }

  private applyMove(dx: number, dz: number): void {
    const next = SocCourtLayout.clampPlayer(this.x + dx, this.z + dz);
    this.x = next.x;
    this.z = next.z;
    this.separateFromObstacles();
  }

  protected separateFromObstacles(): void {
    for (const other of this.obstacles) {
      if (other === this) continue;
      const dx = this.x - other.x, dz = this.z - other.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= SocConfig.PLAYER_SEPARATION) continue;
      const normalX = distance > 1e-4 ? dx / distance : 1, normalZ = distance > 1e-4 ? dz / distance : 0;
      const pushed = SocCourtLayout.clampPlayer(other.x + normalX * SocConfig.PLAYER_SEPARATION, other.z + normalZ * SocConfig.PLAYER_SEPARATION);
      this.x = pushed.x;
      this.z = pushed.z;
    }
  }
}

class SocRemoteController extends SocPlayerController {
  targetX = 0;
  targetZ = 0;
  seenActionSeq = 0;

  poll(engine: SocEngine | null, dtSec: number): void {
    const follow = Math.min(1, dtSec * 12);
    this.x = SocMath.lerp(this.x, this.targetX, follow);
    this.z = SocMath.lerp(this.z, this.targetZ, follow);
  }

  step(): void {}

  receive(x: number, z: number, yaw: number, moving: boolean, ix: number, iz: number): void {
    this.targetX = x;
    this.targetZ = z;
    this.yaw = yaw;
    this.moving = moving;
    this.ix = ix;
    this.iz = iz;
  }

  receiveAction(kind: SocBodyAction, seq: number, ageMs: number, nowMs: number): void {
    if (seq === this.seenActionSeq) return;
    this.seenActionSeq = seq;
    if (kind === "none") return;
    this.actionKind = kind;
    this.actionStartMs = nowMs - ageMs;
    this.actionSeq++;
  }

  teleport(x: number, z: number): void {
    super.teleport(x, z);
    this.targetX = x;
    this.targetZ = z;
  }
}

class SocActionAim {
  static direction(kind: SocActionKind, me: SocPlayerController, opponentOwner: SocPoint | null): SocPoint {
    const facing = { x: Math.sin(me.yaw), z: Math.cos(me.yaw) };
    if (kind !== "tackle" || !opponentOwner) return facing;
    const dx = opponentOwner.x - me.x, dz = opponentOwner.z - me.z;
    const distance = Math.hypot(dx, dz);
    if (distance > SocConfig.TACKLE_ASSIST_RANGE || distance < 0.01) return facing;
    return { x: dx / distance, z: dz / distance };
  }
}

class SocBotTuning {
  static readonly REACTION_SEC = 0.22;
  static readonly SHOT_RANGE = 7.5;
  static readonly SHOT_CHANCE = 0.3;
  static readonly SHOT_POWER_MIN = 0.35;
  static readonly SHOT_POWER_SPAN = 0.55;
  static readonly SHOT_SPOT_DEPTH = 5;
  static readonly SHOT_MIN_ANGLE_RATIO = 0.6;
  static readonly PASS_CHANCE = 0.7;
  static readonly PASS_PRESSURED_CHANCE = 0.85;
  static readonly PASS_ERROR = 0.05;
  static readonly PASS_POWER = 0.2;
  static readonly PASS_MIN_DISTANCE = 2.8;
  static readonly PASS_ADVANCE = 1.6;
  static readonly LANE_RADIUS = 1.1;
  static readonly MARKED_RADIUS = 2;
  static readonly PRESSURE_RADIUS = 2.8;
  static readonly AVOID_RADIUS = 3.2;
  static readonly TACKLE_CHANCE = 0.16;
  static readonly SLIDE_CHANCE = 0.05;
  static readonly SLIDE_MIN = 2.3;
  static readonly SLIDE_MAX = 3.7;
  static readonly MISS_CHANCE = 0.15;
  static readonly COVER_RATIO = 0.5;
}

class SocBot extends SocPlayerController {
  private nextThinkMs = 0;
  private reactUntilMs = 0;
  private seenOwner = -2;
  private goal: SocPoint | null = null;

  constructor(slot: number, private readonly random: () => number) {
    super(slot);
  }

  poll(engine: SocEngine | null, dtSec: number, nowMs: number): void {
    if (!engine) return;
    if (engine.phase !== "play") {
      this.goal = null;
      this.ix = this.iz = 0;
      this.step(dtSec, nowMs);
      return;
    }
    if (nowMs >= this.nextThinkMs) {
      this.nextThinkMs = nowMs + SocConfig.THINK_MS;
      this.think(engine, nowMs);
    }
    this.steer();
    this.step(dtSec, nowMs);
  }

  private steer(): void {
    if (!this.goal) {
      this.ix = this.iz = 0;
      return;
    }
    const dx = this.goal.x - this.x, dz = this.goal.z - this.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.3) {
      this.ix = dx / distance;
      this.iz = dz / distance;
    } else {
      this.ix = this.iz = 0;
    }
  }

  private think(engine: SocEngine, nowMs: number): void {
    if (engine.ownerSlot !== this.seenOwner) {
      this.seenOwner = engine.ownerSlot;
      this.reactUntilMs = nowMs + SocBotTuning.REACTION_SEC * 1000 * (0.8 + this.random() * 0.4);
    }
    const owner = engine.ownerSlot;
    const ball = engine.ballPoint(nowMs);
    const mate = engine.players[this.slot ^ 1];
    if (owner === this.slot) this.thinkAttack(engine, nowMs, ball, mate);
    else if (owner >= SocConfig.SEAT_COUNT && SocConfig.teamOfSlot(owner) === this.team) this.thinkOutlet();
    else if (owner >= 0 && SocConfig.teamOfSlot(owner) === this.team) this.thinkSupport(engine, mate);
    else if (owner >= SocConfig.SEAT_COUNT) this.thinkRetreat();
    else if (owner >= 0) this.thinkDefend(engine, nowMs, ball, mate, engine.bodies[owner]);
    else this.thinkLoose(engine, nowMs, ball, mate);
  }

  private opponentPoints(engine: SocEngine): SocPoint[] {
    return engine.opponentsOf(this.team).map((opponent) => ({ x: opponent.x, z: opponent.z }));
  }

  private thinkAttack(engine: SocEngine, nowMs: number, ball: SocPoint, mate: SocPlayerController): void {
    const me: SocPoint = { x: this.x, z: this.z };
    const attack = SocConfig.attackOf(this.team);
    const opponents = this.opponentPoints(engine);
    const goalCenter: SocPoint = { x: 0, z: attack * SocConfig.HALF_L };
    const goalDistance = SocMath.distance(me, goalCenter);
    const nearest = opponents.reduce((best, opponent) => Math.min(best, SocMath.distance(me, opponent)), 99);
    const pressured = nearest < SocBotTuning.PRESSURE_RADIUS;
    const ready = nowMs >= this.reactUntilMs && !this.isBusy(nowMs);
    if (ready && goalDistance <= SocBotTuning.SHOT_RANGE && this.random() < SocBotTuning.SHOT_CHANCE) {
      const target = SocPlanner.shotTarget(me, this.team, opponents);
      const openAngle = Math.abs(target.z - me.z) >= Math.abs(target.x - me.x) * SocBotTuning.SHOT_MIN_ANGLE_RATIO;
      if (openAngle && SocPlanner.laneClear(me, target, opponents, 0.9)) {
        this.queueAction({ kind: "shot", power: SocBotTuning.SHOT_POWER_MIN + this.random() * SocBotTuning.SHOT_POWER_SPAN, atMs: nowMs, dirX: 0, dirZ: 0 });
        return;
      }
    }
    if (ready && this.wantsPass(mate, me, opponents, attack, pressured)) {
      this.queueAction({ kind: "pass", power: SocBotTuning.PASS_POWER, atMs: nowMs, dirX: 0, dirZ: 0 });
      return;
    }
    this.goal = this.dribbleGoal(me, goalCenter, attack, opponents);
  }

  private wantsPass(mate: SocPlayerController, me: SocPoint, opponents: readonly SocPoint[], attack: number, pressured: boolean): boolean {
    const distance = SocMath.distance(me, mate);
    if (distance < SocBotTuning.PASS_MIN_DISTANCE) return false;
    const advance = (mate.z - me.z) * attack;
    if (!pressured && advance < SocBotTuning.PASS_ADVANCE) return false;
    const launch = SocPlanner.pass(me, mate.velocity(), 0, 0);
    if (!SocPlanner.laneClear(me, launch.target, opponents, SocBotTuning.LANE_RADIUS)) return false;
    if (opponents.some((opponent) => SocMath.distance(opponent, launch.target) < SocBotTuning.MARKED_RADIUS)) return false;
    return this.random() < (pressured ? SocBotTuning.PASS_PRESSURED_CHANCE : SocBotTuning.PASS_CHANCE);
  }

  private dribbleGoal(me: SocPoint, goalCenter: SocPoint, attack: number, opponents: readonly SocPoint[]): SocPoint {
    const spot: SocPoint = { x: 0, z: goalCenter.z - attack * SocBotTuning.SHOT_SPOT_DEPTH };
    let dx = spot.x - me.x, dz = spot.z - me.z;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    let steerX = dx, steerZ = dz;
    opponents.forEach((opponent) => {
      const relX = opponent.x - me.x, relZ = opponent.z - me.z;
      const distance = Math.hypot(relX, relZ);
      if (distance > SocBotTuning.AVOID_RADIUS || relX * dx + relZ * dz < -0.3) return;
      const side = relX * dz - relZ * dx > 0 ? 1 : -1;
      const weight = (1 - distance / SocBotTuning.AVOID_RADIUS) * 1.7;
      steerX -= dz * side * weight;
      steerZ += dx * side * weight;
    });
    const edge = SocConfig.HALF_W - 1.3;
    if (Math.abs(me.x) > edge) steerX -= Math.sign(me.x) * 0.8;
    const steerLength = Math.hypot(steerX, steerZ) || 1;
    return SocPlanner.clampToField({ x: me.x + (steerX / steerLength) * 3, z: me.z + (steerZ / steerLength) * 3 });
  }

  private thinkOutlet(): void {
    const attack = SocConfig.attackOf(this.team);
    this.goal = SocPlanner.clampToField({ x: (this.slot % 2 === 0 ? 3.6 : -3.6) * attack, z: -attack * 1 });
  }

  private thinkRetreat(): void {
    const attack = SocConfig.attackOf(this.team);
    this.goal = SocPlanner.clampToField({ x: (this.slot % 2 === 0 ? 2.8 : -2.8) * attack, z: -attack * 3 });
  }

  private thinkSupport(engine: SocEngine, mate: SocPlayerController): void {
    const attack = SocConfig.attackOf(this.team);
    const lateral = mate.x > 0.5 ? -3.6 : mate.x < -0.5 ? 3.6 : (this.slot % 2 === 0 ? 3.6 : -3.6) * attack;
    const limit = attack * (SocConfig.HALF_L - 3.5);
    const z = attack > 0 ? Math.min(mate.z + attack * 4.8, limit) : Math.max(mate.z + attack * 4.8, limit);
    let spot = SocPlanner.clampToField({ x: lateral, z });
    this.opponentPoints(engine).forEach((opponent) => {
      const distance = SocMath.distance(spot, opponent);
      if (distance < 2 && distance > 0.01) spot = SocPlanner.clampToField({ x: spot.x + ((spot.x - opponent.x) / distance) * 2, z: spot.z + ((spot.z - opponent.z) / distance) * 2 });
    });
    this.goal = spot;
  }

  private thinkDefend(engine: SocEngine, nowMs: number, ball: SocPoint, mate: SocPlayerController, owner: SocPlayerController): void {
    const myDistance = SocMath.distance(this, ball);
    const mateDistance = SocMath.distance(mate, ball);
    const chaser = myDistance < mateDistance || (myDistance === mateDistance && this.slot < mate.slot);
    if (!chaser) {
      const partner = engine.players[owner.slot ^ 1];
      const lane = { x: SocMath.lerp(owner.x, partner.x, SocBotTuning.COVER_RATIO), z: SocMath.lerp(owner.z, partner.z, SocBotTuning.COVER_RATIO) };
      const ownGoalZ = -SocConfig.attackOf(this.team) * SocConfig.HALF_L;
      const nearGoal = Math.abs(lane.z - ownGoalZ) < 3;
      this.goal = SocPlanner.clampToField(nearGoal ? { x: lane.x, z: ownGoalZ + SocConfig.attackOf(this.team) * 3.2 } : lane);
      return;
    }
    const velocity = owner.velocity();
    this.goal = SocPlanner.clampToField({ x: ball.x + velocity.vx * 0.25, z: ball.z + velocity.vz * 0.25 });
    if (nowMs < this.reactUntilMs || this.isBusy(nowMs)) return;
    if (this.random() < SocBotTuning.MISS_CHANCE) return;
    const distance = SocMath.distance(this, ball);
    if (distance <= SocConfig.TACKLE_RANGE && this.random() < SocBotTuning.TACKLE_CHANCE) {
      this.queueAction({ kind: "tackle", power: 0, atMs: nowMs, dirX: 0, dirZ: 0 });
    } else if (distance >= SocBotTuning.SLIDE_MIN && distance <= SocBotTuning.SLIDE_MAX && this.random() < SocBotTuning.SLIDE_CHANCE) {
      const dx = ball.x - this.x, dz = ball.z - this.z;
      this.queueAction({ kind: "slide", power: 0, atMs: nowMs, dirX: dx, dirZ: dz });
    }
  }

  private thinkLoose(engine: SocEngine, nowMs: number, ball: SocPoint, mate: SocPlayerController): void {
    const velocity = engine.ballVelocity();
    const myDistance = SocMath.distance(this, ball);
    const seconds = SocMath.clamp(myDistance / SocConfig.MOVE_SPEED, 0, 1.2);
    const factor = SocBallPhysics.projectedDistanceFactor(seconds);
    const predicted = SocPlanner.clampToField({ x: ball.x + velocity.x * factor, z: ball.z + velocity.z * factor });
    const mateDistance = SocMath.distance(mate, predicted);
    const myPredicted = SocMath.distance(this, predicted);
    const chase = myPredicted < mateDistance - 0.3 || (Math.abs(myPredicted - mateDistance) <= 0.3 && this.slot % 2 === 0);
    if (chase) {
      this.goal = predicted;
      return;
    }
    const attack = SocConfig.attackOf(this.team);
    this.goal = SocPlanner.clampToField({ x: ball.x * 0.4 + (this.slot % 2 === 0 ? 2.5 : -2.5) * attack, z: ball.z - attack * 3.5 });
  }
}

class SocKeeper extends SocPlayerController {
  private nextThinkMs = 0;
  private holdSinceMs = -1;
  private targetX = 0;
  private targetDepth = (SocConfig.KEEPER_NEAR + SocConfig.KEEPER_FAR) / 2;

  constructor(slot: number, private readonly random: () => number) {
    super(slot);
    this.speedScale = SocConfig.KEEPER_SPEED_SCALE;
  }

  poll(engine: SocEngine | null, dtSec: number, nowMs: number): void {
    if (!engine) return;
    if (engine.phase === "play") {
      if (nowMs >= this.nextThinkMs) {
        this.nextThinkMs = nowMs + SocConfig.KEEPER_THINK_MS;
        this.think(engine, nowMs);
      }
    } else {
      this.holdSinceMs = -1;
      this.targetX = 0;
      this.targetDepth = (SocConfig.KEEPER_NEAR + SocConfig.KEEPER_FAR) / 2;
    }
    this.steer();
    this.step(dtSec, nowMs);
    this.confine();
    this.yaw = SocCourtLayout.facingYaw(this.team);
  }

  private get side(): number {
    return SocConfig.sideOf(this.team);
  }

  private steer(): void {
    const dx = this.targetX - this.x;
    const dz = this.side * (SocConfig.HALF_L - this.targetDepth) - this.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.18) {
      this.ix = dx / distance;
      this.iz = dz / distance;
    } else {
      this.ix = this.iz = 0;
    }
  }

  private confine(): void {
    this.x = SocMath.clamp(this.x, -SocConfig.KEEPER_HALF_W, SocConfig.KEEPER_HALF_W);
    const depth = SocMath.clamp(SocConfig.HALF_L - this.side * this.z, SocConfig.KEEPER_NEAR, SocConfig.KEEPER_FAR);
    this.z = this.side * (SocConfig.HALF_L - depth);
  }

  private think(engine: SocEngine, nowMs: number): void {
    if (engine.ownerSlot === this.slot) {
      this.targetX = this.x;
      this.targetDepth = SocConfig.HALF_L - this.side * this.z;
      if (this.holdSinceMs < 0) this.holdSinceMs = nowMs;
      if (nowMs - this.holdSinceMs > SocConfig.KEEPER_HOLD_MS && !this.isBusy(nowMs)) {
        this.queueAction({ kind: "pass", power: SocConfig.KEEPER_KICK_POWER, atMs: nowMs, dirX: 0, dirZ: 0 });
        this.holdSinceMs = nowMs;
      }
      return;
    }
    this.holdSinceMs = -1;
    const ball = engine.ballPoint(nowMs);
    const velocity = engine.ballVelocity();
    const incoming = velocity.z * this.side > 1.5;
    const middle = (SocConfig.KEEPER_NEAR + SocConfig.KEEPER_FAR) / 2;
    let x = ball.x * 0.45;
    let depth = middle;
    if (incoming) {
      const seconds = (this.side * SocConfig.HALF_L - ball.z) / velocity.z;
      x = ball.x + velocity.x * Math.max(0, seconds) + SocMath.gaussian(this.random) * 0.25;
    } else if (engine.ownerSlot < 0 && engine.physics.speed() < 3 && Math.hypot(ball.x - this.x, ball.z - this.z) < SocConfig.KEEPER_COME_OUT_DISTANCE) {
      x = ball.x;
      depth = SocConfig.KEEPER_FAR;
    }
    this.targetX = SocMath.clamp(x, -SocConfig.KEEPER_HALF_W, SocConfig.KEEPER_HALF_W);
    this.targetDepth = depth;
  }
}

class SocEngine {
  readonly physics = new SocBallPhysics();
  readonly keepers: SocKeeper[];
  private readonly dribble = new SocDribbleFollower();
  private readonly bodyCache: SocPlayerController[];
  phase: SocEnginePhase = "idle";
  score: number[] = [0, 0];
  ownerSlot = -1;
  ballKind: SocBallKind = "kickoff";
  lastToucher = -1;
  lastKickerSlot = -1;
  leftMs = SocConfig.MATCH_MS;
  overtime = false;
  kickoffTeam = 0;
  gameNo = 0;
  scorer = -1;
  ownGoal = false;
  winner = -1;
  private concedingTeam = 0;
  private ownerSinceMs = 0;
  private ballSeq = 0;
  private phaseEndMs = 0;
  private kickerImmuneUntilMs = 0;
  private accumulator = 0;
  private lastBallWriteMs = 0;
  private events: SocEvent[] = [];

  constructor(readonly players: SocPlayerController[], private readonly random: () => number) {
    this.keepers = [new SocKeeper(SocConfig.SEAT_COUNT, random), new SocKeeper(SocConfig.SEAT_COUNT + 1, random)];
    this.bodyCache = players.concat(this.keepers);
    this.bodyCache.forEach((body) => { body.obstacles = this.bodyCache; });
  }

  get bodies(): SocPlayerController[] {
    for (let index = 0; index < SocConfig.SEAT_COUNT; index++) {
      if (this.bodyCache[index] !== this.players[index]) {
        this.bodyCache[index] = this.players[index];
        this.players[index].obstacles = this.bodyCache;
      }
    }
    return this.bodyCache;
  }

  opponentsOf(team: number): SocPlayerController[] {
    return this.bodies.filter((body) => body.team !== team);
  }

  ballPoint(nowMs: number): SocPoint {
    if (this.ownerSlot >= 0) return this.dribblePoint(nowMs);
    return { x: this.physics.x, z: this.physics.z };
  }

  ballVelocity(): SocPoint {
    if (this.ownerSlot >= 0) {
      const velocity = this.bodies[this.ownerSlot].velocity();
      return { x: velocity.vx, z: velocity.vz };
    }
    return { x: this.physics.vx, z: this.physics.vz };
  }

  begin(nowMs: number): SocEvent[] {
    this.events = [];
    this.kickoffTeam = this.random() < 0.5 ? 0 : 1;
    this.startReady(nowMs, SocConfig.READY_MS);
    return this.flush();
  }

  update(dtSec: number, nowMs: number): SocEvent[] {
    this.events = [];
    const playing = this.phase === "play";
    this.bodies.forEach((body) => {
      body.frozen = !playing;
      body.carrying = body.slot === this.ownerSlot;
    });
    this.keepers.forEach((keeper) => keeper.poll(this, dtSec, nowMs));
    if (this.phase === "ready" && nowMs >= this.phaseEndMs) this.startPlay(nowMs);
    else if (this.phase === "play") this.updatePlay(dtSec, nowMs);
    else if (this.phase === "goal") this.updateGoal(dtSec, nowMs);
    return this.flush();
  }

  private flush(): SocEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  private dribblePoint(nowMs: number): SocPoint {
    const owner = this.bodies[this.ownerSlot];
    return this.dribble.position(owner.x, owner.z, owner.yaw, owner.moving, this.ownerSinceMs, nowMs, this.physics);
  }

  private startReady(nowMs: number, durationMs: number): void {
    this.phase = "ready";
    this.gameNo++;
    this.phaseEndMs = nowMs + durationMs;
    this.bodies.forEach((body) => {
      const spot = SocCourtLayout.spotFor(body.slot, this.kickoffTeam);
      body.teleport(spot.x, spot.z);
      body.frozen = true;
    });
    this.physics.load({ x: 0, y: SocConfig.BALL_R, z: 0, vx: 0, vy: 0, vz: 0 });
    this.physics.scoredTeam = -1;
    this.physics.impacts.length = 0;
    this.ownerSlot = SocCourtLayout.takerSlot(this.kickoffTeam);
    this.ownerSinceMs = nowMs;
    this.dribble.reset();
    this.ballKind = "kickoff";
    this.lastToucher = this.ownerSlot;
    this.players[this.ownerSlot].protectUntilMs = nowMs + durationMs + SocConfig.KICKOFF_PROTECT_MS;
    this.emitGame(nowMs);
    this.emitBall(nowMs, "kickoff", this.ownerSlot, -1);
  }

  private startPlay(nowMs: number): void {
    this.phase = "play";
    this.ownerSinceMs = nowMs;
    this.dribble.reset();
    this.emitGame(nowMs);
    this.emitBall(nowMs, "kickoff", this.ownerSlot, -1);
  }

  private updatePlay(dtSec: number, nowMs: number): void {
    if (!this.overtime) {
      this.leftMs -= dtSec * 1000;
      if (this.leftMs <= 0) {
        this.leftMs = 0;
        this.timeUp(nowMs);
        return;
      }
    }
    this.processRequests(nowMs);
    this.stepBall(dtSec, nowMs);
    this.resolveBodyActions(nowMs);
    this.checkGoal(nowMs);
    if (this.ownerSlot < 0 && this.physics.speed() > 0.4 && nowMs - this.lastBallWriteMs > 800) this.emitBall(nowMs, "loose", -1, -1);
  }

  private updateGoal(dtSec: number, nowMs: number): void {
    this.accumulator += dtSec;
    while (this.accumulator >= SocConfig.SUB_STEP) {
      this.physics.substep(SocConfig.SUB_STEP);
      this.accumulator -= SocConfig.SUB_STEP;
    }
    if (nowMs < this.phaseEndMs) return;
    if (this.overtime) {
      this.finish(nowMs, this.score[0] > this.score[1] ? 0 : 1);
      return;
    }
    this.kickoffTeam = this.concedingTeam;
    this.startReady(nowMs, SocConfig.READY_MS);
  }

  private timeUp(nowMs: number): void {
    if (this.score[0] === this.score[1]) {
      this.overtime = true;
      this.kickoffTeam = this.random() < 0.5 ? 0 : 1;
      this.startReady(nowMs, SocConfig.OVERTIME_READY_MS);
      return;
    }
    this.finish(nowMs, this.score[0] > this.score[1] ? 0 : 1);
  }

  private finish(nowMs: number, winner: number): void {
    this.phase = "over";
    this.winner = winner;
    this.bodies.forEach((body) => { body.frozen = true; });
    this.emitGame(nowMs);
  }

  private checkGoal(nowMs: number): void {
    const team = this.physics.scoredTeam;
    if (team < 0) return;
    this.physics.scoredTeam = -1;
    this.score[team]++;
    this.scorer = this.lastToucher;
    this.ownGoal = this.scorer >= 0 && SocConfig.teamOfSlot(this.scorer) !== team;
    this.concedingTeam = 1 - team;
    this.phase = "goal";
    this.phaseEndMs = nowMs + SocConfig.GOAL_MS;
    this.ownerSlot = -1;
    this.bodies.forEach((body) => { body.frozen = true; });
    this.emitGame(nowMs);
    this.emitBall(nowMs, "loose", -1, -1);
  }

  private processRequests(nowMs: number): void {
    this.bodies.forEach((player) => {
      const request = player.takeQueued();
      if (!request || nowMs - request.atMs > 900 || player.isBusy(nowMs)) return;
      if (request.kind === "pass") this.executePass(player, request, nowMs);
      else if (request.kind === "shot") this.executeShot(player, request, nowMs);
      else this.beginBodyAction(player, request, nowMs);
    });
  }

  private beginBodyAction(player: SocPlayerController, request: SocActionRequest, nowMs: number): void {
    let dirX = request.dirX, dirZ = request.dirZ;
    if (Math.hypot(dirX, dirZ) < 0.01) {
      const owner = this.ownerSlot >= 0 && this.bodies[this.ownerSlot].team !== player.team ? this.bodies[this.ownerSlot] : null;
      const aim = SocActionAim.direction(request.kind, player, owner ? this.ballPoint(nowMs) : null);
      dirX = aim.x;
      dirZ = aim.z;
    }
    player.beginBodyAction(request.kind === "tackle" ? "tackle" : "slide", nowMs, dirX, dirZ);
  }

  private executePass(player: SocPlayerController, request: SocActionRequest, nowMs: number): void {
    if (this.ownerSlot !== player.slot) return;
    const mate = this.passTarget(player);
    const from = this.dribblePoint(nowMs);
    const error = player instanceof SocBot ? SocMath.gaussian(this.random) * SocBotTuning.PASS_ERROR : 0;
    const launch = SocPlanner.pass(from, mate.velocity(), request.power, error);
    this.kick(player, launch, "pass", nowMs);
  }

  private passTarget(player: SocPlayerController): SocPlayerController {
    if (player.slot < SocConfig.SEAT_COUNT) return this.players[player.slot ^ 1];
    const attack = SocConfig.attackOf(player.team);
    const mates = this.players.filter((candidate) => candidate.team === player.team);
    return mates.reduce((best, candidate) => (candidate.z * attack > best.z * attack ? candidate : best), mates[0]);
  }

  private executeShot(player: SocPlayerController, request: SocActionRequest, nowMs: number): void {
    if (this.ownerSlot !== player.slot) return;
    const from = this.dribblePoint(nowMs);
    const opponents = this.opponentsOf(player.team).map((opponent) => ({ x: opponent.x, z: opponent.z }));
    const launch = SocPlanner.shot(from, player.team, opponents, request.power, this.random);
    this.kick(player, launch, "shot", nowMs);
  }

  private kick(player: SocPlayerController, launch: SocLaunch, kind: SocBallKind, nowMs: number): void {
    const speed = Math.hypot(launch.vx, launch.vz) || 1;
    const startX = launch.startX + (launch.vx / speed) * 0.2;
    const startZ = launch.startZ + (launch.vz / speed) * 0.2;
    this.physics.load({ x: startX, y: SocConfig.BALL_R, z: startZ, vx: launch.vx, vy: launch.vy, vz: launch.vz });
    this.ownerSlot = -1;
    this.ballKind = kind;
    this.lastToucher = player.slot;
    this.lastKickerSlot = player.slot;
    this.kickerImmuneUntilMs = nowMs + SocConfig.KICK_IMMUNE_MS;
    player.yaw = Math.atan2(launch.vx, launch.vz);
    this.emitBall(nowMs, kind, player.slot, -1);
  }

  private stepBall(dtSec: number, nowMs: number): void {
    if (this.ownerSlot >= 0) {
      const point = this.dribblePoint(nowMs);
      const velocity = this.bodies[this.ownerSlot].velocity();
      this.physics.load({ x: point.x, y: SocConfig.BALL_R, z: point.z, vx: velocity.vx, vy: 0, vz: velocity.vz });
      return;
    }
    this.collideBall(nowMs);
    if (this.ownerSlot >= 0) return;
    this.accumulator += dtSec;
    while (this.accumulator >= SocConfig.SUB_STEP) {
      this.physics.substep(SocConfig.SUB_STEP);
      this.accumulator -= SocConfig.SUB_STEP;
      this.collideBall(nowMs);
      if (this.ownerSlot >= 0 || this.physics.scoredTeam >= 0) {
        this.accumulator = 0;
        return;
      }
    }
    this.collideBall(nowMs);
  }

  private collideBall(nowMs: number): void {
    const ball = this.physics;
    const speed = ball.speed();
    let taker: SocPlayerController | null = null;
    let takerDistance = Infinity;
    for (const player of this.bodies) {
      if (player.slot === this.lastKickerSlot && nowMs < this.kickerImmuneUntilMs) continue;
      const distance = Math.hypot(ball.x - player.x, ball.z - player.z);
      const keeper = player.slot >= SocConfig.SEAT_COUNT;
      const canTake = this.ballKind === "pass" || speed <= (keeper ? SocConfig.KEEPER_CATCH_SPEED : SocConfig.CAPTURE_MAX_SPEED);
      const overlapping = distance < SocConfig.BODY_R + SocConfig.BALL_R;
      const stunned = nowMs < player.noPickupUntilMs;
      const deep = distance < (SocConfig.BODY_R + SocConfig.BALL_R) * 0.85;
      const available = overlapping ? !stunned || deep || this.nearWall() : !stunned && !player.isBusy(nowMs);
      if (canTake && distance < (keeper ? SocConfig.KEEPER_REACH : SocConfig.PICKUP_RADIUS) && ball.y < (keeper ? SocConfig.BODY_H : SocConfig.PICKUP_HEIGHT) && available && distance < takerDistance) {
        taker = player;
        takerDistance = distance;
      }
    }
    if (taker) {
      this.capture(taker, nowMs);
      return;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const player of this.bodies) {
        if (player.slot === this.lastKickerSlot && nowMs < this.kickerImmuneUntilMs) continue;
        this.bounceOffBody(player, nowMs);
      }
    }
    this.captureTrappedBall(nowMs);
  }

  private captureTrappedBall(nowMs: number): void {
    const reach = SocConfig.BODY_R + SocConfig.BALL_R - 0.02;
    let taker: SocPlayerController | null = null;
    let takerDistance = Infinity;
    for (const player of this.bodies) {
      if (player.slot === this.lastKickerSlot && nowMs < this.kickerImmuneUntilMs) continue;
      const distance = Math.hypot(this.physics.x - player.x, this.physics.z - player.z);
      if (nowMs < player.noPickupUntilMs || this.physics.y > SocConfig.BODY_H) continue;
      if (distance < reach && distance < takerDistance) {
        taker = player;
        takerDistance = distance;
      }
    }
    if (taker) this.capture(taker, nowMs);
  }

  private nearWall(): boolean {
    const margin = SocConfig.BALL_R + 0.4;
    return Math.abs(this.physics.x) > SocConfig.HALF_W - margin || Math.abs(this.physics.z) > SocConfig.HALF_L - margin;
  }

  private capture(player: SocPlayerController, nowMs: number): void {
    this.ownerSlot = player.slot;
    this.ownerSinceMs = nowMs;
    this.dribble.reset();
    this.ballKind = "dribble";
    this.lastToucher = player.slot;
    player.protectUntilMs = nowMs + (player.slot >= SocConfig.SEAT_COUNT ? SocConfig.KEEPER_HOLD_MS * 4 : SocConfig.OWNER_PROTECT_MS);
    this.emitBall(nowMs, "dribble", player.slot, -1);
  }

  private bounceOffBody(player: SocPlayerController, nowMs: number): void {
    const ball = this.physics;
    const reach = SocConfig.BODY_R + SocConfig.BALL_R;
    const dx = ball.x - player.x, dz = ball.z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= reach || ball.y > SocConfig.BODY_H + SocConfig.BALL_R) return;
    let normalX = 1, normalZ = 0;
    if (distance > 1e-4) {
      normalX = dx / distance;
      normalZ = dz / distance;
    } else if (ball.speed() > 1e-3) {
      normalX = -ball.vx / ball.speed();
      normalZ = -ball.vz / ball.speed();
    }
    const relative = ball.vx * normalX + ball.vz * normalZ;
    ball.x = player.x + normalX * (reach + 0.01);
    ball.z = player.z + normalZ * (reach + 0.01);
    ball.settle();
    if (relative >= 0) return;
    ball.vx -= (1 + SocConfig.BODY_REST) * relative * normalX;
    ball.vz -= (1 + SocConfig.BODY_REST) * relative * normalZ;
    this.ballKind = "deflect";
    this.emitBall(nowMs, "deflect", player.slot, -1);
  }

  private resolveBodyActions(nowMs: number): void {
    this.players.forEach((player) => {
      if (player.actionKind === "none" || player.actionResolved) return;
      if (!player.isActing(nowMs)) {
        player.actionResolved = true;
        return;
      }
      if (this.ownerSlot >= 0 && this.tryDislodge(player, nowMs)) return;
      if (player.actionKind === "slide" && this.ownerSlot < 0 && !player.slideKicked) this.tryKickLoose(player, nowMs);
    });
  }

  private tryDislodge(player: SocPlayerController, nowMs: number): boolean {
    const victim = this.bodies[this.ownerSlot];
    if (victim.slot >= SocConfig.SEAT_COUNT || victim.team === player.team || nowMs < victim.protectUntilMs) return false;
    const ball = this.dribblePoint(nowMs);
    const dx = ball.x - player.x, dz = ball.z - player.z;
    const distance = Math.hypot(dx, dz);
    let hit = false;
    if (player.actionKind === "tackle") {
      const angle = Math.abs(SocMath.angleDifference(Math.atan2(dx, dz), Math.atan2(player.actionDirX, player.actionDirZ)));
      hit = distance <= SocConfig.TACKLE_CLOSE_RANGE || (distance <= SocConfig.TACKLE_RANGE && angle <= SocConfig.TACKLE_HALF_ANGLE);
    } else {
      const bodyDistance = Math.hypot(victim.x - player.x, victim.z - player.z);
      const front = dx * player.actionDirX + dz * player.actionDirZ > -0.2;
      hit = front && (distance <= SocConfig.SLIDE_HIT_RADIUS || bodyDistance <= SocConfig.SLIDE_HIT_RADIUS);
    }
    if (!hit) return false;
    const pop = player.actionKind === "slide" ? SocConfig.SLIDE_POP_SPEED : SocConfig.TACKLE_POP_SPEED;
    const turn = (this.random() < 0.5 ? -1 : 1) * (0.7 + this.random() * 0.5);
    const base = Math.atan2(player.actionDirX, player.actionDirZ) + turn;
    const popZ = Math.cos(base) * pop;
    const forwardZ = Math.abs(popZ) * SocConfig.attackOf(player.team);
    const popX = Math.sin(base) * pop;
    const popLength = Math.hypot(popX, forwardZ) || 1;
    const edge = SocConfig.BODY_R + SocConfig.BALL_R + 0.02;
    this.physics.load({ x: victim.x + (popX / popLength) * edge, y: SocConfig.BALL_R, z: victim.z + (forwardZ / popLength) * edge, vx: popX, vy: 0, vz: forwardZ });
    this.pushOutOfBodies();
    this.ownerSlot = -1;
    this.ballKind = "tackled";
    this.lastToucher = player.slot;
    this.lastKickerSlot = -1;
    victim.noPickupUntilMs = nowMs + SocConfig.DISLODGE_STUN_MS;
    player.winRecover(nowMs);
    this.emitBall(nowMs, "tackled", player.slot, victim.slot);
    this.ballKind = "loose";
    const squeezed = Math.hypot(this.physics.x - victim.x, this.physics.z - victim.z) < SocConfig.BODY_R + SocConfig.BALL_R - 0.05;
    if (squeezed) this.capture(player, nowMs);
    else this.captureTrappedBall(nowMs);
    return true;
  }

  private pushOutOfBodies(): void {
    const reach = SocConfig.BODY_R + SocConfig.BALL_R + 0.01;
    this.bodies.forEach((player) => {
      const dx = this.physics.x - player.x, dz = this.physics.z - player.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= reach || distance < 1e-4) return;
      this.physics.x = player.x + (dx / distance) * reach;
      this.physics.z = player.z + (dz / distance) * reach;
    });
    this.physics.settle();
  }

  private tryKickLoose(player: SocPlayerController, nowMs: number): void {
    const ball = this.physics;
    if (ball.y > 0.9 || Math.hypot(ball.x - player.x, ball.z - player.z) > SocConfig.SLIDE_HIT_RADIUS) return;
    player.slideKicked = true;
    ball.vx = player.actionDirX * SocConfig.SLIDE_KICK_SPEED;
    ball.vz = player.actionDirZ * SocConfig.SLIDE_KICK_SPEED;
    this.ballKind = "loose";
    this.lastToucher = player.slot;
    this.lastKickerSlot = player.slot;
    this.kickerImmuneUntilMs = nowMs + SocConfig.KICK_IMMUNE_MS;
    this.emitBall(nowMs, "loose", player.slot, -1);
  }

  private emitBall(nowMs: number, kind: SocBallKind, by: number, victim: number): void {
    const state = this.physics.state();
    if (this.ownerSlot >= 0) {
      const point = this.dribblePoint(nowMs);
      state.x = point.x;
      state.z = point.z;
      state.y = SocConfig.BALL_R;
      state.vx = state.vy = state.vz = 0;
    }
    this.lastBallWriteMs = nowMs;
    this.ballSeq++;
    const ball: SocBallRecord = {
      x: Math.round(state.x * 100) / 100, y: Math.round(state.y * 100) / 100, z: Math.round(state.z * 100) / 100,
      vx: Math.round(state.vx * 100) / 100, vy: Math.round(state.vy * 100) / 100, vz: Math.round(state.vz * 100) / 100,
      at: Math.round(nowMs), seq: this.ballSeq, kind, by, owner: this.ownerSlot, victim
    };
    this.events.push({ type: "ball", ball });
  }

  private emitGame(nowMs: number): void {
    this.events.push({
      type: "game",
      game: {
        n: this.gameNo, phase: this.phase === "idle" ? "ready" : this.phase, at: Math.round(nowMs), leftMs: Math.round(this.leftMs), overtime: this.overtime,
        sa: this.score[0], sb: this.score[1], kickoff: this.kickoffTeam, scorer: this.scorer, own: this.ownGoal, winner: this.winner
      }
    });
  }
}
