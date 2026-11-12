"use strict";
class BbShot {
    sideOf(from, to) {
        const along = to.minus(from).flat().unit(), side = new BbVec(along.z, 0, -along.x), middle = from.lerp(to, 0.5), mound = BbFieldGeometry.RUBBER.flat();
        return middle.plus(side).distanceTo(mound) >= middle.minus(side).distanceTo(mound) ? side : side.times(-1);
    }
}
class BbPitchShot extends BbShot {
    frame(cue, view) { return view === "batter" ? BbBroadcastShots.batter() : BbBroadcastShots.pitcher(); }
}
class BbBallChaseShot extends BbShot {
    frame(cue, view, ball) {
        const target = ball || cue.to, flat = target.flat(), booth = BbBallChaseShot.BOOTH;
        return { position: booth.lerp(flat, BbBallChaseShot.CHASE_SHARE).withY(booth.y + flat.length() * BbBallChaseShot.RISE_PER_METER), look: flat.withY(target.y * BbBallChaseShot.LOOK_HEIGHT_SHARE), fieldOfView: 44 };
    }
}
BbBallChaseShot.BOOTH = BbFieldSpace.toWorld(0, -14, 10);
BbBallChaseShot.CHASE_SHARE = 0.4;
BbBallChaseShot.RISE_PER_METER = 0.12;
BbBallChaseShot.LOOK_HEIGHT_SHARE = 0.35;
class BbThrowChaseShot extends BbShot {
    frame(cue) {
        const length = cue.from.distanceTo(cue.to), middle = cue.from.lerp(cue.to, 0.5).flat();
        return { position: middle.plus(this.sideOf(cue.from, cue.to).times(Math.max(16, length * 0.85))).withY(5.5), look: middle.withY(0.9), fieldOfView: 44, keepsWidth: true };
    }
}
class BbRelayShot extends BbShot {
    frame(cue) {
        const length = cue.from.distanceTo(cue.to), middle = cue.from.lerp(cue.to, 0.5).flat();
        return { position: middle.plus(this.sideOf(cue.from, cue.to).times(length * 0.8)).withY(Math.max(22, length * 0.4)), look: middle, fieldOfView: 55, keepsWidth: true };
    }
}
class BbBasesShot extends BbShot {
    frame() { return { position: BbFieldSpace.toWorld(0, -30, 26), look: BbFieldSpace.toWorld(0, 30, 0), fieldOfView: 46, keepsWidth: true }; }
}
class BbTopShot extends BbShot {
    frame() { return { position: BbFieldSpace.toWorld(0, 12, 150), look: BbFieldSpace.toWorld(0, 46, 0), fieldOfView: 50, keepsWidth: true }; }
}
class BbCameraDirector {
    constructor(cues) {
        this.cues = [];
        this.shown = null;
        cues.slice().sort((a, b) => a.at - b.at).forEach((cue) => {
            const last = this.cues[this.cues.length - 1];
            this.cues.push(last ? { ...cue, at: Math.max(cue.at, last.at + BbCameraDirector.SHORTEST_HOLD) } : cue);
        });
    }
    direct(view, seconds, ball) {
        let cue = this.cues[0];
        for (const next of this.cues)
            if (next.at <= seconds)
                cue = next;
        const cut = cue !== this.shown;
        this.shown = cue;
        return { shot: BbCameraDirector.SHOTS[cue.kind].frame(cue, view, ball), cut, kind: cue.kind };
    }
}
BbCameraDirector.SHORTEST_HOLD = 0.8;
BbCameraDirector.SHOTS = { pitch: new BbPitchShot(), chase: new BbBallChaseShot(), throw: new BbThrowChaseShot(), relay: new BbRelayShot(), bases: new BbBasesShot(), top: new BbTopShot() };
