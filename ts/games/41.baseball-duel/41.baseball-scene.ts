interface BbScene {
  script: BbDrillScript;
  director: BbCameraDirector;
  calls: readonly BbCallCue[];
  sparks: readonly BbEffectCue[];
  tracks: readonly BbRunnerTrack[];
  mark: BbVec | null;
  arriveAt: number;
  fielding: 0 | 1;
  title: string;
}

class BbSceneFactory {
  private static readonly DUGOUT_SIDES: readonly number[] = [-1, 1];

  constructor(private readonly metrics: () => BbBodyMetrics) {}

  private setup(hands: BbStageCast): BbDrillSetup { return { metrics: this.metrics(), batsLeft: hands.batsLeft, throwsLeft: hands.throwsLeft }; }

  pitch(cue: BbPitchCue, fielding: 0 | 1, hands: BbStageCast): BbScene {
    const play = new BbPlayChoreographer(cue), script = play.build(this.setup(hands));
    return { script, director: new BbCameraDirector(play.cameraCues), calls: play.calls, sparks: play.sparks, tracks: play.runnerTracks, mark: play.crossedAt, arriveAt: play.arriveAt, fielding, title: play.title };
  }

  swap(leaving: 0 | 1, hands: BbStageCast): BbScene[] {
    const entering: 0 | 1 = leaving === 0 ? 1 : 0;
    return ([[false, leaving], [true, entering]] as Array<[boolean, 0 | 1]>).map(([comesIn, team]) => {
      const swap = new BbSwapChoreographer(comesIn, BbSceneFactory.DUGOUT_SIDES[team]);
      return { script: swap.build(this.setup(hands)), director: new BbCameraDirector(swap.cameraCues), calls: swap.calls, sparks: [], tracks: swap.runnerTracks, mark: null, arriveAt: swap.arriveAt, fielding: team, title: swap.title };
    });
  }
}

class BbScenePlayer {
  private static readonly ZONE_LINGER_SECONDS = 0.15;

  view: BbLiveView = "pitcher";
  private scene!: BbScene;
  private directed!: BbDirectedShot;
  private clock = 0;
  private cut = true;

  constructor(private readonly stage: BbStage, private readonly hud: BbScoreHud, private readonly onCall: (call: BbCallCue) => void) {}

  get seconds(): number { return this.clock; }
  get arriveAt(): number { return this.scene.arriveAt; }
  get finished(): boolean { return this.clock > this.scene.script.duration; }
  get title(): string { return this.scene.title; }

  play(scene: BbScene): void {
    this.scene = scene;
    this.clock = 0;
    this.cut = true;
    this.stage.field(scene.fielding);
    this.stage.reset(scene.script);
    this.advance(0);
  }

  replace(scene: BbScene): void {
    this.scene = scene;
    this.advance(0);
  }

  idle(frameSeconds: number): void { this.draw(frameSeconds); }

  advance(deltaSeconds: number): void {
    const before = this.clock, scene = this.scene;
    this.clock += deltaSeconds;
    this.draw(deltaSeconds);
    scene.sparks.forEach((spark) => { if (before < spark.at && this.clock >= spark.at) this.stage.spark(spark.point); });
    scene.calls.forEach((call) => { if (before < call.at && this.clock >= call.at) this.onCall(call); });
  }

  private draw(deltaSeconds: number): void {
    const scene = this.scene;
    const state = scene.script.ballAt(this.clock);
    this.directed = scene.director.direct(this.view, this.clock, state ? state.point : null);
    this.cut = this.cut || this.directed.cut;
    const pitching = this.directed.kind === "pitch", passed = this.clock >= scene.arriveAt;
    this.stage.advance(scene.script, this.clock, deltaSeconds, this.view === "batter" && pitching ? BbStage.HIDDEN_BEHIND_PLATE : [], pitching && this.clock < scene.arriveAt + BbScenePlayer.ZONE_LINGER_SECONDS, pitching && passed ? scene.mark : null);
    this.hud.follow(scene.script, scene.tracks, this.clock);
  }

  frame(frameSeconds: number): void {
    this.stage.aim(this.directed.shot, frameSeconds, this.cut);
    this.cut = false;
  }
}
