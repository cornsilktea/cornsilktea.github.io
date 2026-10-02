"use strict";
class PlayerController {
    advance(fighter, dt, t, context) {
        if (this.simulatesHere()) {
            this.decide(fighter, t, context);
            fighter.stepLocal(dt, t, context.env, context.listener);
        }
        else {
            fighter.stepObserved(dt, t, context.env);
        }
    }
}
class LocalPlayerController extends PlayerController {
    constructor(movement) {
        super();
        this.movement = movement;
    }
    simulatesHere() {
        return true;
    }
    decide(fighter, t, context) {
        if (!fighter.isGrounded())
            return;
        const axis = this.movement.axis();
        fighter.steer(axis.x, axis.z);
        fighter.setSpeedFactor(1);
    }
}
class RemotePlayerController extends PlayerController {
    simulatesHere() {
        return false;
    }
    decide(fighter, t, context) {
        return;
    }
}
class AiController extends PlayerController {
    constructor(brain, host) {
        super();
        this.brain = brain;
        this.host = host;
    }
    simulatesHere() {
        return this.host.isHost();
    }
    decide(fighter, t, context) {
        this.brain.step(fighter, t, context);
    }
}
