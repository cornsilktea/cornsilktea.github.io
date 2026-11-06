abstract class FighterPhase {
  abstract readonly wireCode: string;

  abstract accept<R>(visitor: PhaseVisitor<R>): R;
  abstract stepLocal(parts: FighterParts, dt: number, t: number, env: SimulationEnvironment, listener: FighterListener): FighterPhase | null;
  abstract stepObserved(parts: FighterParts, dt: number, t: number, env: SimulationEnvironment): FighterPhase | null;
  abstract receiveGrounded(snapshot: GroundedSnapshot, parts: FighterParts): FighterPhase;
  abstract receiveFalling(snapshot: FallingSnapshot, parts: FighterParts): FighterPhase;
  abstract encode(parts: FighterParts, t: number): EncodedState;

  receiveOut(snapshot: OutSnapshot, parts: FighterParts): FighterPhase {
    return new OutPhase();
  }

  enteredLocally(fighterId: string, t: number, listener: FighterListener): void {
    listener.stateChanged(t);
  }

  tryPush(parts: FighterParts, fighterId: string, t: number, env: SimulationEnvironment): PushEvent | null {
    return null;
  }

  tryDash(parts: FighterParts, t: number, env: SimulationEnvironment, yaw: number | null): boolean {
    return false;
  }

  receivePush(parts: FighterParts, fighterId: string, event: PushEvent, t: number, env: SimulationEnvironment): boolean {
    return false;
  }

  isGrounded(): boolean { return false; }
  isFalling(): boolean { return false; }
  isOut(): boolean { return false; }
  floor(): number { return -1; }
}

class DashRun {
  private left: number;

  constructor(readonly dx: number, readonly dz: number, distance: number) {
    this.left = distance;
  }

  nextStep(dt: number): number {
    return Math.min(this.left, LastTileRules.DASH_SPEED * dt);
  }

  consume(distance: number): void {
    this.left -= distance;
  }

  isFinished(): boolean {
    return this.left <= 0.0001;
  }
}

class GroundedPhase extends FighterPhase {
  private static readonly MAX_EXTRAPOLATION_S = 0.35;
  private static readonly SMOOTH_POSITION_RATE = 14;
  private static readonly SMOOTH_HEIGHT_RATE = 18;
  private static readonly REPOSITION_DISTANCE = 2.5;
  static readonly REPOSITION_LEAD_S = 0.05;

  readonly wireCode = "G";
  private dash: DashRun | null = null;

  constructor(private groundFloor: number, private observed: GroundedSnapshot | null = null) {
    super();
  }

  accept<R>(visitor: PhaseVisitor<R>): R { return visitor.grounded(this.groundFloor); }
  isGrounded(): boolean { return true; }
  floor(): number { return this.groundFloor; }

  stepLocal(parts: FighterParts, dt: number, t: number, env: SimulationEnvironment, listener: FighterListener): FighterPhase | null {
    return this.dash ? this.stepDash(parts, dt, t, env, listener) : this.stepWalk(parts, dt, t, env, listener);
  }

  stepObserved(parts: FighterParts, dt: number, t: number, env: SimulationEnvironment): FighterPhase | null {
    const seen = this.observed;
    if (!seen) return null;
    const age = MathUtil.clamp((t - seen.sentAt) / 1000, 0, GroundedPhase.MAX_EXTRAPOLATION_S);
    const ratio = Math.min(1, dt * GroundedPhase.SMOOTH_POSITION_RATE);
    parts.body.easeToward(seen.x + seen.vx * age, seen.z + seen.vz * age, ratio);
    parts.body.easeHeight(LastTileGeometry.floorY(this.groundFloor), Math.min(1, dt * GroundedPhase.SMOOTH_HEIGHT_RATE));
    parts.body.setVelocity(seen.vx, seen.vz);
    parts.body.faceYaw(seen.yaw);
    parts.abilities.mirror(seen.dashEndsAt, seen.pushedAt);
    return null;
  }

  receiveGrounded(snapshot: GroundedSnapshot, parts: FighterParts): FighterPhase {
    const body = parts.body;
    const needsReposition = this.groundFloor !== snapshot.floor || body.distanceTo(snapshot.x, snapshot.z) > GroundedPhase.REPOSITION_DISTANCE;
    this.groundFloor = snapshot.floor;
    this.observed = snapshot;
    this.dash = null;
    if (needsReposition) body.setPosition(snapshot.x + snapshot.vx * GroundedPhase.REPOSITION_LEAD_S, LastTileGeometry.floorY(snapshot.floor), snapshot.z + snapshot.vz * GroundedPhase.REPOSITION_LEAD_S);
    body.faceYaw(snapshot.yaw);
    parts.abilities.mirror(snapshot.dashEndsAt, snapshot.pushedAt);
    return this;
  }

  receiveFalling(snapshot: FallingSnapshot, parts: FighterParts): FighterPhase {
    return FallingPhase.fromSnapshot(snapshot, parts);
  }

  encode(parts: FighterParts, t: number): EncodedState {
    const body = parts.body;
    return {
      code: this.wireCode, floor: this.groundFloor, x: body.x, y: body.y, z: body.z, vx: body.velocityX, vz: body.velocityZ, yaw: body.yaw,
      fallId: parts.falls.current, passedFloor: 0, sentAt: t, dashEndsAt: parts.abilities.dashingUntil, pushedAt: parts.abilities.lastPushAt, fallStartedAt: 0
    };
  }

  tryPush(parts: FighterParts, fighterId: string, t: number, env: SimulationEnvironment): PushEvent | null {
    if (this.dash || !parts.abilities.canPush(t) || !env.isPlaying(t)) return null;
    parts.abilities.startPush(t);
    const body = parts.body;
    return { by: fighterId, x: MathUtil.round2(body.x), z: MathUtil.round2(body.z), f: this.groundFloor, a: MathUtil.round2(body.yaw), t: Math.round(t) };
  }

  tryDash(parts: FighterParts, t: number, env: SimulationEnvironment, yaw: number | null): boolean {
    if (this.dash || !parts.abilities.canDash(t) || !env.isPlaying(t)) return false;
    const direction = this.dashDirection(parts, yaw);
    this.dash = new DashRun(direction.x, direction.z, LastTileRules.DASH_DISTANCE);
    parts.body.faceYaw(Math.atan2(direction.x, direction.z));
    parts.abilities.startDash(t);
    return true;
  }

  receivePush(parts: FighterParts, fighterId: string, event: PushEvent, t: number, env: SimulationEnvironment): boolean {
    if (fighterId === event.by || this.groundFloor !== event.f || this.dash || !env.isPlaying(t)) return false;
    const body = parts.body;
    const dx = body.x - event.x, dz = body.z - event.z, distance = Math.hypot(dx, dz);
    if (distance > LastTileRules.PUSH_RANGE) return false;
    const angle = Math.atan2(dx, dz);
    if (distance > LastTileRules.PUSH_MIN_SPREAD_DISTANCE && Math.abs(MathUtil.angleDifference(angle, event.a)) > LastTileRules.PUSH_HALF_ANGLE) return false;
    const radialX = distance > 0.001 ? dx / distance : Math.sin(event.a);
    const radialZ = distance > 0.001 ? dz / distance : Math.cos(event.a);
    const blend = LastTileRules.PUSH_BLEND_RADIAL;
    const directionX = Math.sin(event.a) * (1 - blend) + radialX * blend;
    const directionZ = Math.cos(event.a) * (1 - blend) + radialZ * blend;
    const length = Math.hypot(directionX, directionZ) || 1;
    body.addVelocity(directionX / length * LastTileRules.PUSH_IMPULSE, directionZ / length * LastTileRules.PUSH_IMPULSE);
    parts.abilities.registerHit(t);
    return true;
  }

  isDashing(): boolean {
    return this.dash !== null;
  }

  private dashDirection(parts: FighterParts, yaw: number | null): { x: number; z: number } {
    if (yaw !== null) return { x: Math.sin(yaw), z: Math.cos(yaw) };
    const steering = parts.steering;
    if (steering.isActive()) {
      const length = Math.hypot(steering.x, steering.z);
      return { x: steering.x / length, z: steering.z / length };
    }
    return { x: Math.sin(parts.body.yaw), z: Math.cos(parts.body.yaw) };
  }

  private stepDash(parts: FighterParts, dt: number, t: number, env: SimulationEnvironment, listener: FighterListener): FighterPhase | null {
    const dash = this.dash as DashRun;
    const step = dash.nextStep(dt);
    parts.body.moveBy(dash.dx * step, dash.dz * step);
    dash.consume(step);
    if (!dash.isFinished()) return null;
    this.dash = null;
    parts.body.setVelocity(dash.dx * LastTileRules.DASH_EXIT_SPEED, dash.dz * LastTileRules.DASH_EXIT_SPEED);
    return this.settleAfterMove(parts, t, env, listener);
  }

  private stepWalk(parts: FighterParts, dt: number, t: number, env: SimulationEnvironment, listener: FighterListener): FighterPhase | null {
    const live = env.isPlaying(t);
    const wantX = live ? parts.steering.x : 0, wantZ = live ? parts.steering.z : 0;
    const topSpeed = LastTileRules.MAX_SPEED * parts.steering.speedFactor;
    const pushing = wantX !== 0 || wantZ !== 0;
    parts.body.accelerateToward(wantX * topSpeed, wantZ * topSpeed, pushing ? LastTileRules.ACCEL : LastTileRules.FRICTION, dt);
    parts.body.glide(dt);
    if (live && pushing) parts.body.faceYaw(Math.atan2(wantX, wantZ));
    return this.settleAfterMove(parts, t, env, listener);
  }

  private settleAfterMove(parts: FighterParts, t: number, env: SimulationEnvironment, listener: FighterListener): FighterPhase | null {
    parts.body.keepInsideBoard();
    const index = LastTileGeometry.tileIndexAt(parts.body.x, parts.body.z);
    if (!env.board.isSolid(this.groundFloor, index, t)) return FallingPhase.startFrom(parts, this.groundFloor, t);
    if (t >= env.board.startAt() && env.board.recordStep(this.groundFloor, index, t)) listener.tileStepped(this.groundFloor, index, t);
    return null;
  }
}

class FallingPhase extends FighterPhase {
  readonly wireCode = "F";

  constructor(private readonly trajectory: FallTrajectory) {
    super();
  }

  static startFrom(parts: FighterParts, floor: number, t: number): FallingPhase {
    parts.falls.advance();
    return new FallingPhase(FallTrajectory.from(parts.body, floor, t));
  }

  static fromSnapshot(snapshot: FallingSnapshot, parts: FighterParts): FallingPhase {
    parts.falls.adopt(snapshot.fallId);
    snapshot.faceFrom(parts);
    return new FallingPhase(snapshot.startTrajectory());
  }

  accept<R>(visitor: PhaseVisitor<R>): R { return visitor.falling(); }
  isFalling(): boolean { return true; }

  stepLocal(parts: FighterParts, dt: number, t: number, env: SimulationEnvironment, listener: FighterListener): FighterPhase | null {
    const resolution = this.trajectory.resolve(t, env.board);
    if (resolution.landing) return this.landLocally(parts, resolution.landing);
    parts.body.setPosition(resolution.position.x, resolution.position.y, resolution.position.z);
    return resolution.position.y < LastTileGeometry.floorY(0) - LastTileRules.DEATH_DEPTH ? new OutPhase(t) : null;
  }

  stepObserved(parts: FighterParts, dt: number, t: number, env: SimulationEnvironment): FighterPhase | null {
    const resolution = this.trajectory.resolve(t, env.board);
    if (resolution.landing) return this.landObserved(parts, resolution.landing, t);
    parts.body.setPosition(resolution.position.x, resolution.position.y, resolution.position.z);
    return null;
  }

  receiveGrounded(snapshot: GroundedSnapshot, parts: FighterParts): FighterPhase {
    const body = parts.body;
    body.setPosition(snapshot.x + snapshot.vx * GroundedPhase.REPOSITION_LEAD_S, LastTileGeometry.floorY(snapshot.floor), snapshot.z + snapshot.vz * GroundedPhase.REPOSITION_LEAD_S);
    body.faceYaw(snapshot.yaw);
    parts.abilities.mirror(snapshot.dashEndsAt, snapshot.pushedAt);
    return new GroundedPhase(snapshot.floor, snapshot);
  }

  receiveFalling(snapshot: FallingSnapshot, parts: FighterParts): FighterPhase {
    if (parts.falls.current !== snapshot.fallId) return FallingPhase.fromSnapshot(snapshot, parts);
    this.trajectory.lowerPassedFloor(snapshot.passedFloor);
    snapshot.faceFrom(parts);
    return this;
  }

  encode(parts: FighterParts, t: number): EncodedState {
    const fall = this.trajectory;
    return {
      code: this.wireCode, floor: -1, x: fall.x, y: fall.y, z: fall.z, vx: fall.velocityX, vz: fall.velocityZ, yaw: parts.body.yaw,
      fallId: parts.falls.current, passedFloor: fall.passed, sentAt: t, dashEndsAt: parts.abilities.dashingUntil, pushedAt: parts.abilities.lastPushAt, fallStartedAt: fall.startTime
    };
  }

  private landLocally(parts: FighterParts, landing: FallLanding): FighterPhase {
    this.placeOnFloor(parts, landing);
    return new GroundedPhase(landing.floor);
  }

  private landObserved(parts: FighterParts, landing: FallLanding, t: number): FighterPhase {
    this.placeOnFloor(parts, landing);
    const body = parts.body;
    const seen = GroundedSnapshot.landedFrom(landing.floor, body.x, body.z, body.velocityX, body.velocityZ, body.yaw, t);
    parts.abilities.mirror(0, 0);
    return new GroundedPhase(landing.floor, seen);
  }

  private placeOnFloor(parts: FighterParts, landing: FallLanding): void {
    parts.body.setPosition(landing.x, LastTileGeometry.floorY(landing.floor), landing.z);
    parts.body.setVelocity(landing.vx * LastTileRules.LAND_KEEP, landing.vz * LastTileRules.LAND_KEEP);
  }
}

class OutPhase extends FighterPhase {
  readonly wireCode = "O";

  constructor(private readonly outAt: number = 0) {
    super();
  }

  accept<R>(visitor: PhaseVisitor<R>): R { return visitor.out(); }
  isOut(): boolean { return true; }
  stepLocal(parts: FighterParts, dt: number, t: number, env: SimulationEnvironment, listener: FighterListener): FighterPhase | null { return null; }
  stepObserved(parts: FighterParts, dt: number, t: number, env: SimulationEnvironment): FighterPhase | null { return null; }

  receiveOut(snapshot: OutSnapshot, parts: FighterParts): FighterPhase {
    return this;
  }

  receiveGrounded(snapshot: GroundedSnapshot, parts: FighterParts): FighterPhase {
    const body = parts.body;
    body.setPosition(snapshot.x + snapshot.vx * GroundedPhase.REPOSITION_LEAD_S, LastTileGeometry.floorY(snapshot.floor), snapshot.z + snapshot.vz * GroundedPhase.REPOSITION_LEAD_S);
    body.faceYaw(snapshot.yaw);
    parts.abilities.mirror(snapshot.dashEndsAt, snapshot.pushedAt);
    return new GroundedPhase(snapshot.floor, snapshot);
  }

  receiveFalling(snapshot: FallingSnapshot, parts: FighterParts): FighterPhase {
    return FallingPhase.fromSnapshot(snapshot, parts);
  }

  enteredLocally(fighterId: string, t: number, listener: FighterListener): void {
    listener.eliminated(fighterId, t);
    listener.stateChanged(t);
  }

  encode(parts: FighterParts, t: number): EncodedState {
    const body = parts.body;
    return {
      code: this.wireCode, floor: -1, x: body.x, y: body.y, z: body.z, vx: body.velocityX, vz: body.velocityZ, yaw: body.yaw,
      fallId: parts.falls.current, passedFloor: 0, sentAt: t, dashEndsAt: parts.abilities.dashingUntil, pushedAt: parts.abilities.lastPushAt, fallStartedAt: 0
    };
  }
}
