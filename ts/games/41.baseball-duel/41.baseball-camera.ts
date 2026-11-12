type BbLiveView = "pitcher" | "batter";

abstract class BbShot {
  abstract frame(cue: BbCameraCue, view: BbLiveView, ball: BbVec | null): BbCameraShot;

  protected sideOf(from: BbVec, to: BbVec): BbVec {
    const along = to.minus(from).flat().unit(), side = new BbVec(along.z, 0, -along.x), middle = from.lerp(to, 0.5), mound = BbFieldGeometry.RUBBER.flat();
    return middle.plus(side).distanceTo(mound) >= middle.minus(side).distanceTo(mound) ? side : side.times(-1);
  }
}

class BbPitchShot extends BbShot {
  frame(cue: BbCameraCue, view: BbLiveView): BbCameraShot { return view === "batter" ? BbBroadcastShots.batter() : BbBroadcastShots.pitcher(); }
}

class BbBallChaseShot extends BbShot {
  private static readonly BOOTH = BbFieldSpace.toWorld(0, -14, 10);
  private static readonly CHASE_SHARE = 0.4;
  private static readonly RISE_PER_METER = 0.12;
  private static readonly LOOK_HEIGHT_SHARE = 0.35;
  private static readonly WALL_CLEARANCE = 5;
  private static readonly BOUNDS = new BbParkBounds(BbBallparkRegistry.MAIN.dimensions);

  frame(cue: BbCameraCue, view: BbLiveView, ball: BbVec | null): BbCameraShot {
    const target = ball || cue.to, flat = target.flat(), booth = BbBallChaseShot.BOOTH;
    let share = BbBallChaseShot.CHASE_SHARE;
    while (share > 0 && BbBallChaseShot.BOUNDS.beyond(booth.lerp(flat, share)) > -BbBallChaseShot.WALL_CLEARANCE) share -= 0.05;
    return { position: booth.lerp(flat, Math.max(0, share)).withY(booth.y + flat.length() * BbBallChaseShot.RISE_PER_METER), look: flat.withY(target.y * BbBallChaseShot.LOOK_HEIGHT_SHARE), fieldOfView: 44 };
  }
}

class BbThrowChaseShot extends BbShot {
  frame(cue: BbCameraCue): BbCameraShot {
    const length = cue.from.distanceTo(cue.to), middle = cue.from.lerp(cue.to, 0.5).flat();
    return { position: middle.plus(this.sideOf(cue.from, cue.to).times(Math.max(16, length * 0.85))).withY(5.5), look: middle.withY(0.9), fieldOfView: 44, keepsWidth: true };
  }
}

class BbRelayShot extends BbShot {
  frame(cue: BbCameraCue): BbCameraShot {
    const length = cue.from.distanceTo(cue.to), middle = cue.from.lerp(cue.to, 0.5).flat();
    return { position: middle.plus(this.sideOf(cue.from, cue.to).times(length * 0.8)).withY(Math.max(22, length * 0.4)), look: middle, fieldOfView: 55, keepsWidth: true };
  }
}

class BbBasesShot extends BbShot {
  frame(): BbCameraShot { return { position: BbFieldSpace.toWorld(0, -30, 26), look: BbFieldSpace.toWorld(0, 30, 0), fieldOfView: 46, keepsWidth: true }; }
}

class BbTopShot extends BbShot {
  frame(): BbCameraShot { return { position: BbFieldSpace.toWorld(0, 12, 150), look: BbFieldSpace.toWorld(0, 46, 0), fieldOfView: 50, keepsWidth: true }; }
}

interface BbDirectedShot {
  shot: BbCameraShot;
  cut: boolean;
  kind: BbShotKind;
}

class BbCameraDirector {
  private static readonly SHORTEST_HOLD = 0.8;
  private static readonly SHOTS: Readonly<Record<BbShotKind, BbShot>> = { pitch: new BbPitchShot(), chase: new BbBallChaseShot(), throw: new BbThrowChaseShot(), relay: new BbRelayShot(), bases: new BbBasesShot(), top: new BbTopShot() };
  private readonly cues: BbCameraCue[] = [];
  private shown: BbCameraCue | null = null;
  private lastBall: BbVec | null = null;

  constructor(cues: readonly BbCameraCue[]) {
    cues.slice().sort((a, b) => a.at - b.at).forEach((cue) => {
      const last = this.cues[this.cues.length - 1];
      this.cues.push(last ? { ...cue, at: Math.max(cue.at, last.at + BbCameraDirector.SHORTEST_HOLD) } : cue);
    });
  }

  direct(view: BbLiveView, seconds: number, ball: BbVec | null): BbDirectedShot {
    let cue = this.cues[0];
    for (const next of this.cues) if (next.at <= seconds) cue = next;
    const cut = cue !== this.shown;
    this.shown = cue;
    this.lastBall = ball || (cut ? null : this.lastBall);
    return { shot: BbCameraDirector.SHOTS[cue.kind].frame(cue, view, this.lastBall), cut, kind: cue.kind };
  }
}
