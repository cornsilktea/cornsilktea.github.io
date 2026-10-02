class Fighter {
  private readonly parts = new FighterParts();
  private phase: FighterPhase;
  private departed = false;

  constructor(readonly id: string) {
    const top = LastTileRules.FLOOR_COUNT - 1;
    this.phase = new GroundedPhase(top);
    this.parts.body.place(0, LastTileGeometry.floorY(top), 0, 0);
  }

  get x(): number { return this.parts.body.x; }
  get y(): number { return this.parts.body.y; }
  get z(): number { return this.parts.body.z; }
  get velocityX(): number { return this.parts.body.velocityX; }
  get velocityZ(): number { return this.parts.body.velocityZ; }
  get yaw(): number { return this.parts.body.yaw; }

  spawnAt(x: number, z: number): void {
    const top = LastTileRules.FLOOR_COUNT - 1;
    this.phase = new GroundedPhase(top);
    this.parts.body.place(x, LastTileGeometry.floorY(top), z, Math.atan2(-x, -z));
  }

  inspect<R>(visitor: PhaseVisitor<R>): R {
    return this.phase.accept(visitor);
  }

  isGrounded(): boolean { return this.phase.isGrounded(); }
  isFalling(): boolean { return this.phase.isFalling(); }
  isOut(): boolean { return this.phase.isOut(); }
  hasLeft(): boolean { return this.departed; }
  floor(): number { return this.phase.floor(); }
  speed(): number { return this.parts.body.speed(); }

  canPush(t: number): boolean { return this.parts.abilities.canPush(t); }
  canDash(t: number): boolean { return this.parts.abilities.canDash(t); }
  pushCooldownLeft(t: number): number { return this.parts.abilities.pushCooldownLeft(t); }
  dashCooldownLeft(t: number): number { return this.parts.abilities.dashCooldownLeft(t); }
  isDashAnimating(t: number): boolean { return this.parts.abilities.isDashAnimating(t); }
  isPushAnimating(t: number): boolean { return this.parts.abilities.isPushAnimating(t); }
  isHitAnimating(t: number): boolean { return this.parts.abilities.isHitAnimating(t); }

  steer(x: number, z: number): void {
    this.parts.steering.steer(x, z);
  }

  releaseSteering(): void {
    this.parts.steering.release();
  }

  setSpeedFactor(factor: number): void {
    this.parts.steering.setSpeedFactor(factor);
  }

  faceYaw(yaw: number): void {
    this.parts.body.faceYaw(yaw);
  }

  stepLocal(dt: number, t: number, env: SimulationEnvironment, listener: FighterListener): void {
    const next = this.phase.stepLocal(this.parts, dt, t, env, listener);
    if (!next) return;
    this.phase = next;
    next.enteredLocally(this.id, t, listener);
  }

  stepObserved(dt: number, t: number, env: SimulationEnvironment): void {
    const next = this.phase.stepObserved(this.parts, dt, t, env);
    if (next) this.phase = next;
  }

  receiveSnapshot(snapshot: RemoteSnapshot): void {
    this.phase = snapshot.applyTo(this.phase, this.parts);
  }

  tryPush(t: number, env: SimulationEnvironment, listener: FighterListener): boolean {
    const event = this.phase.tryPush(this.parts, this.id, t, env);
    if (!event) return false;
    listener.pushLaunched(event);
    listener.stateChanged(t);
    return true;
  }

  tryDash(t: number, env: SimulationEnvironment, listener: FighterListener, yaw: number | null): boolean {
    if (!this.phase.tryDash(this.parts, t, env, yaw)) return false;
    listener.stateChanged(t);
    return true;
  }

  receivePush(event: PushEvent, t: number, env: SimulationEnvironment, listener: FighterListener): void {
    if (this.phase.receivePush(this.parts, this.id, event, t, env)) listener.stateChanged(t);
  }

  markOut(): void {
    if (!this.phase.isOut()) this.phase = new OutPhase();
  }

  markDeparted(): void {
    this.departed = true;
    this.phase = new OutPhase();
  }

  encodeState(t: number): string {
    return FighterStateCodec.encode(this.phase.encode(this.parts, t));
  }
}
