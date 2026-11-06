class Body {
  private px = 0;
  private py = 0;
  private pz = 0;
  private vx = 0;
  private vz = 0;
  private heading = 0;

  get x(): number { return this.px; }
  get y(): number { return this.py; }
  get z(): number { return this.pz; }
  get velocityX(): number { return this.vx; }
  get velocityZ(): number { return this.vz; }
  get yaw(): number { return this.heading; }

  place(x: number, y: number, z: number, yaw: number): void {
    this.px = x;
    this.py = y;
    this.pz = z;
    this.heading = yaw;
  }

  setPosition(x: number, y: number, z: number): void {
    this.px = x;
    this.py = y;
    this.pz = z;
  }

  setVelocity(vx: number, vz: number): void {
    this.vx = vx;
    this.vz = vz;
  }

  addVelocity(dx: number, dz: number): void {
    this.vx += dx;
    this.vz += dz;
  }

  faceYaw(yaw: number): void {
    this.heading = yaw;
  }

  moveBy(dx: number, dz: number): void {
    this.px += dx;
    this.pz += dz;
  }

  glide(dt: number): void {
    this.px += this.vx * dt;
    this.pz += this.vz * dt;
  }

  accelerateToward(targetVx: number, targetVz: number, rate: number, dt: number): void {
    const deltaX = targetVx - this.vx, deltaZ = targetVz - this.vz;
    const length = Math.hypot(deltaX, deltaZ), step = rate * dt;
    if (length <= step) {
      this.vx = targetVx;
      this.vz = targetVz;
    } else {
      this.vx += deltaX / length * step;
      this.vz += deltaZ / length * step;
    }
  }

  keepInsideBoard(): void {
    const limit = LastTileRules.BOARD_LIMIT;
    if (this.px > limit) { this.px = limit; if (this.vx > 0) this.vx = 0; }
    else if (this.px < -limit) { this.px = -limit; if (this.vx < 0) this.vx = 0; }
    if (this.pz > limit) { this.pz = limit; if (this.vz > 0) this.vz = 0; }
    else if (this.pz < -limit) { this.pz = -limit; if (this.vz < 0) this.vz = 0; }
  }

  easeToward(targetX: number, targetZ: number, ratio: number): void {
    this.px += (targetX - this.px) * ratio;
    this.pz += (targetZ - this.pz) * ratio;
  }

  easeHeight(targetY: number, ratio: number): void {
    this.py = MathUtil.lerp(this.py, targetY, ratio);
  }

  distanceTo(x: number, z: number): number {
    return MathUtil.distance(this.px, this.pz, x, z);
  }

  speed(): number {
    return Math.hypot(this.vx, this.vz);
  }
}

class Steering {
  private axisX = 0;
  private axisZ = 0;
  private factor = 1;

  get x(): number { return this.axisX; }
  get z(): number { return this.axisZ; }
  get speedFactor(): number { return this.factor; }

  steer(x: number, z: number): void {
    this.axisX = x;
    this.axisZ = z;
  }

  release(): void {
    this.axisX = 0;
    this.axisZ = 0;
  }

  setSpeedFactor(factor: number): void {
    this.factor = factor;
  }

  isActive(): boolean {
    return this.axisX !== 0 || this.axisZ !== 0;
  }
}

class Abilities {
  private pushedAt = 0;
  private pushReadyAt = 0;
  private dashEndsAt = 0;
  private dashReadyAt = 0;
  private hitAt = 0;

  get lastPushAt(): number { return this.pushedAt; }
  get lastHitAt(): number { return this.hitAt; }
  get dashingUntil(): number { return this.dashEndsAt; }

  canPush(t: number): boolean {
    return t >= this.pushReadyAt;
  }

  canDash(t: number): boolean {
    return t >= this.dashReadyAt;
  }

  startPush(t: number): void {
    this.pushedAt = t;
    this.pushReadyAt = t + LastTileRules.PUSH_COOLDOWN_MS;
  }

  startDash(t: number): void {
    this.dashEndsAt = t + LastTileRules.DASH_TIME_S * 1000;
    this.dashReadyAt = t + LastTileRules.DASH_COOLDOWN_MS;
  }

  registerHit(t: number): void {
    this.hitAt = t;
  }

  mirror(dashEndsAt: number, pushedAt: number): void {
    this.dashEndsAt = dashEndsAt;
    this.pushedAt = pushedAt;
  }

  pushCooldownLeft(t: number): number {
    return MathUtil.clamp((this.pushReadyAt - t) / LastTileRules.PUSH_COOLDOWN_MS, 0, 1);
  }

  dashCooldownLeft(t: number): number {
    return MathUtil.clamp((this.dashReadyAt - t) / LastTileRules.DASH_COOLDOWN_MS, 0, 1);
  }

  isDashAnimating(t: number): boolean {
    return t < this.dashEndsAt;
  }

  isPushAnimating(t: number): boolean {
    return t - this.pushedAt < 400 && this.pushedAt > 0;
  }

  isHitAnimating(t: number): boolean {
    return t - this.hitAt < 500 && this.hitAt > 0;
  }
}

class FallSequence {
  private count = 0;

  get current(): number { return this.count; }

  advance(): number {
    this.count++;
    return this.count;
  }

  adopt(count: number): void {
    this.count = count;
  }
}

class FighterParts {
  readonly body = new Body();
  readonly steering = new Steering();
  readonly abilities = new Abilities();
  readonly falls = new FallSequence();
}

interface PhaseVisitor<R> {
  grounded(floor: number): R;
  falling(): R;
  out(): R;
}

interface PushEvent {
  by: string;
  x: number;
  z: number;
  f: number;
  a: number;
  t: number;
}

interface SimulationEnvironment {
  readonly board: TileBoard;
  isPlaying(t: number): boolean;
}

interface FighterListener {
  tileStepped(floor: number, index: number, t: number): void;
  stateChanged(t: number): void;
  pushLaunched(event: PushEvent): void;
  eliminated(fighterId: string, t: number): void;
}
