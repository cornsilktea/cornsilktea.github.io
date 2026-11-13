"use strict";
class BbSceneFactory {
    constructor(metrics) {
        this.metrics = metrics;
    }
    setup(hands) { return { metrics: this.metrics(), batsLeft: hands.batsLeft, throwsLeft: hands.throwsLeft }; }
    pitch(cue, fielding, hands) {
        const play = new BbPlayChoreographer(cue), script = play.build(this.setup(hands));
        return { script, director: new BbCameraDirector(play.cameraCues), calls: play.calls, sparks: play.sparks, tracks: play.runnerTracks, mark: play.crossedAt, arriveAt: play.arriveAt, fielding, title: play.title };
    }
    swap(leaving, hands) {
        const entering = leaving === 0 ? 1 : 0;
        return [[false, leaving], [true, entering]].map(([comesIn, team]) => {
            const swap = new BbSwapChoreographer(comesIn, BbSceneFactory.DUGOUT_SIDES[team]);
            return { script: swap.build(this.setup(hands)), director: new BbCameraDirector(swap.cameraCues), calls: swap.calls, sparks: [], tracks: swap.runnerTracks, mark: null, arriveAt: swap.arriveAt, fielding: team, title: swap.title };
        });
    }
}
BbSceneFactory.DUGOUT_SIDES = [-1, 1];
class BbScenePlayer {
    constructor(stage, hud, onCall) {
        this.stage = stage;
        this.hud = hud;
        this.onCall = onCall;
        this.view = "pitcher";
        this.clock = 0;
        this.cut = true;
    }
    get seconds() { return this.clock; }
    get arriveAt() { return this.scene.arriveAt; }
    get finished() { return this.clock > this.scene.script.duration; }
    get title() { return this.scene.title; }
    play(scene, lead = 0) {
        this.scene = scene;
        this.clock = -lead;
        this.cut = true;
        this.stage.field(scene.fielding);
        this.stage.reset(scene.script);
        this.advance(0);
    }
    replace(scene) {
        this.scene = scene;
        this.advance(0);
    }
    idle(frameSeconds) { this.draw(frameSeconds); }
    skip() { if (!this.finished)
        this.advance(this.scene.script.duration - this.clock + 0.001); }
    advance(deltaSeconds) {
        const before = this.clock, scene = this.scene;
        this.clock += deltaSeconds;
        this.draw(deltaSeconds);
        scene.sparks.forEach((spark) => { if (before < spark.at && this.clock >= spark.at)
            this.stage.spark(spark.point); });
        scene.calls.forEach((call) => { if (before < call.at && this.clock >= call.at)
            this.onCall(call); });
    }
    draw(deltaSeconds) {
        const scene = this.scene, shown = Math.max(0, this.clock);
        const state = scene.script.ballAt(shown);
        this.directed = scene.director.direct(this.view, shown, state ? state.point : null);
        this.cut = this.cut || this.directed.cut;
        const pitching = this.directed.kind === "pitch", passed = this.clock >= scene.arriveAt;
        this.stage.advance(scene.script, shown, deltaSeconds, this.view === "batter" && pitching ? BbStage.HIDDEN_BEHIND_PLATE : [], pitching && this.clock < scene.arriveAt + BbScenePlayer.ZONE_LINGER_SECONDS, pitching && passed ? scene.mark : null);
        this.hud.follow(scene.script, scene.tracks, shown);
    }
    frame(frameSeconds) {
        this.stage.aim(this.directed.shot, frameSeconds, this.cut);
        this.cut = false;
    }
}
BbScenePlayer.ZONE_LINGER_SECONDS = 0.15;
