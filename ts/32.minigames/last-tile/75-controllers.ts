interface MovementSource {
  axis(): { x: number; z: number };
}

interface HostGate {
  isHost(): boolean;
}

abstract class PlayerController {
  abstract simulatesHere(): boolean;

  protected abstract decide(fighter: Fighter, t: number, context: ControlContext): void;

  advance(fighter: Fighter, dt: number, t: number, context: ControlContext): void {
    if (this.simulatesHere()) {
      this.decide(fighter, t, context);
      fighter.stepLocal(dt, t, context.env, context.listener);
    } else {
      fighter.stepObserved(dt, t, context.env);
    }
  }
}

class LocalPlayerController extends PlayerController {
  constructor(private readonly movement: MovementSource) {
    super();
  }

  simulatesHere(): boolean {
    return true;
  }

  protected decide(fighter: Fighter, t: number, context: ControlContext): void {
    if (!fighter.isGrounded()) return;
    const axis = this.movement.axis();
    fighter.steer(axis.x, axis.z);
    fighter.setSpeedFactor(1);
  }
}

class RemotePlayerController extends PlayerController {
  simulatesHere(): boolean {
    return false;
  }

  protected decide(fighter: Fighter, t: number, context: ControlContext): void {
    return;
  }
}

class AiController extends PlayerController {
  constructor(private readonly brain: AiBrain, private readonly host: HostGate) {
    super();
  }

  simulatesHere(): boolean {
    return this.host.isHost();
  }

  protected decide(fighter: Fighter, t: number, context: ControlContext): void {
    this.brain.step(fighter, t, context);
  }
}
