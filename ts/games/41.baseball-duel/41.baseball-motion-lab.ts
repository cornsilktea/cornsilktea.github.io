type BbLabView = "auto" | "pitcher" | "batter" | "swing" | "mound" | "wide" | "outfield" | "relay" | "homerun";

interface BbLabOptions {
  scene: number;
  view: BbLabView;
  batsLeft: boolean;
  throwsLeft: boolean;
  speed: number;
  freezeAt: number | null;
  plain: boolean;
}

class BbLabAddress {
  static readonly VIEWS: ReadonlyArray<readonly [BbLabView, string]> = [["auto", "자동 연출"], ["pitcher", "투수 시점"], ["batter", "타자 시점"], ["swing", "스윙 확대"], ["mound", "투구 확대"], ["wide", "내야 전체"], ["outfield", "외야 와이드"], ["relay", "중계 와이드"], ["homerun", "홈런 장면"]];

  static read(): BbLabOptions {
    const query = new URLSearchParams(location.search), view = query.get("cam") as BbLabView | null, freeze = query.get("freeze");
    return {
      scene: BbCurve.clamp(Number(query.get("scene") || 1), 1, 3) - 1,
      view: view && BbLabAddress.VIEWS.some(([name]) => name === view) ? view : "auto",
      batsLeft: query.get("bat") === "L", throwsLeft: query.get("arm") === "L",
      speed: Number(query.get("speed") || 1) || 1,
      freezeAt: freeze === null ? null : Number(freeze),
      plain: query.has("plain")
    };
  }

  static go(options: BbLabOptions, change: Partial<BbLabOptions>): void {
    const next = { ...options, ...change }, query = new URLSearchParams();
    query.set("scene", String(next.scene + 1));
    if (next.view !== "auto") query.set("cam", next.view);
    if (next.batsLeft) query.set("bat", "L");
    if (next.throwsLeft) query.set("arm", "L");
    location.search = query.toString();
  }
}

class BbLabDirector {
  private static readonly HOME_LOOK = BbFieldSpace.toWorld(0, 30, 1);

  constructor(private readonly script: BbDrillScript, private readonly sceneIndex: number, private readonly batsLeft: boolean, private readonly throwsLeft: boolean) {}

  shot(view: BbLabView, seconds: number, ball: BbVec | null): BbCameraShot {
    const side = this.batsLeft ? -1 : 1;
    if (view === "pitcher") return BbBroadcastShots.pitcher();
    if (view === "batter") return BbBroadcastShots.batter();
    if (view === "swing") return { position: BbFieldSpace.toWorld(side * 2.9, 2.3, 1.0), look: BbFieldSpace.toWorld(-side * 0.7, 0.2, 0.62), fieldOfView: 34 };
    if (view === "mound") return { position: BbFieldSpace.toWorld(-3.4, BbFieldGeometry.RUBBER_DISTANCE - 2.6, 1.3), look: BbFieldSpace.toWorld(0, BbFieldGeometry.RUBBER_DISTANCE - 0.3, 0.95), fieldOfView: 34 };
    if (view === "wide") return { position: BbFieldSpace.toWorld(0, -30, 26), look: BbFieldSpace.toWorld(0, 30, 0), fieldOfView: 46 };
    if (view === "outfield") return { position: BbFieldSpace.toWorld(-30, 150, 34), look: BbFieldSpace.toWorld(0, 30, 0), fieldOfView: 44 };
    if (view === "homerun") return { position: BbFieldSpace.toWorld(18, 70, 9), look: BbFieldSpace.toWorld(-12, 122, 9), fieldOfView: 50 };
    if (view === "relay") return this.relayShot();
    return this.autoShot(seconds, ball);
  }

  private relayShot(): BbCameraShot {
    return { position: BbFieldSpace.toWorld(-58, 36, 34), look: BbFieldSpace.toWorld(4, 37, 0), fieldOfView: 55 };
  }

  contactAt(): number {
    const contact = this.script.checkpoints.find((check) => check.kind === "contact");
    return contact ? contact.at : 2.5;
  }

  private autoShot(seconds: number, ball: BbVec | null): BbCameraShot {
    const contactAt = this.contactAt(), side = this.batsLeft ? -1 : 1;
    if (seconds < contactAt + 0.12 || !ball) return { position: BbFieldSpace.toWorld(side * 2.7, -3.9, 1.55), look: BbFieldSpace.toWorld(-side * 0.35, 6, 0.8), fieldOfView: 40 };
    if (this.sceneIndex === 1) {
      if (seconds < contactAt + 1.3) return { position: BbFieldSpace.toWorld(4, -9, 5.5), look: ball.lerp(BbFieldSpace.toWorld(-7, 27, 0.6), 0.5), fieldOfView: 40 };
      if (seconds < contactAt + 2.05) return { position: BbFieldSpace.toWorld(-11.5, 23.5, 1.5), look: BbFieldSpace.toWorld(-7.3, 28.3, 0.55), fieldOfView: 36 };
      return { position: BbFieldSpace.toWorld(24, 2, 5), look: ball.lerp(BbFieldGeometry.FIRST.withY(0.8), 0.6), fieldOfView: 34 };
    }
    if (this.sceneIndex === 2) {
      const caught = this.script.checkpoints.find((check) => check.label === "중견수 플라이 포구"), catchAt = caught ? caught.at : contactAt + 4.6;
      if (seconds < catchAt + 0.45) return { position: BbFieldSpace.toWorld(-12, 34, 13), look: ball.lerp(BbFieldSpace.toWorld(7, 73, 1), 0.45), fieldOfView: 46 };
      if (seconds < catchAt + 2.0) return this.relayShot();
      return { position: BbFieldSpace.toWorld(5.5, -5.5, 2.4), look: BbFieldSpace.toWorld(-1.6, 3, 0.5), fieldOfView: 42 };
    }
    const flat = ball.flat(), away = flat.length() > 1 ? flat.unit() : new BbVec(0, 0, -1);
    const landed = seconds > contactAt + 3.4;
    if (landed) return { position: BbFieldSpace.toWorld(-2, 46, 13), look: ball.lerp(BbFieldGeometry.SECOND, 0.5), fieldOfView: 46 };
    return { position: flat.minus(away.times(24)).withY(8 + ball.y * 0.4), look: ball.lerp(BbLabDirector.HOME_LOOK, 0.12), fieldOfView: 46 };
  }
}

class BbSyncBoard {
  private readonly rows = new Map<BbCheckpoint, HTMLElement>();
  private readonly gripCell: HTMLElement;
  private worstGrip = 0;

  constructor(private readonly box: HTMLElement, script: BbDrillScript) {
    box.textContent = "";
    const title = document.createElement("div");
    title.className = "lab-sync-title";
    title.textContent = "동작 동기 (사건 시각 대비)";
    box.appendChild(title);
    script.checkpoints.forEach((check) => {
      const row = document.createElement("div");
      row.className = "lab-sync-row";
      row.textContent = check.label + " · " + check.at.toFixed(2) + "초 · 대기";
      box.appendChild(row);
      this.rows.set(check, row);
    });
    this.gripCell = document.createElement("div");
    this.gripCell.className = "lab-sync-row";
    box.appendChild(this.gripCell);
  }

  reset(): void {
    this.worstGrip = 0;
    this.rows.forEach((row, check) => { row.textContent = check.label + " · " + check.at.toFixed(2) + "초 · 대기"; row.classList.remove("ok", "bad"); });
    this.gripCell.textContent = "";
  }

  record(check: BbCheckpoint, delaySeconds: number, gapMeters: number, limitMeters: number): void {
    const row = this.rows.get(check);
    if (!row) return;
    const delay = delaySeconds * 1000, good = delay <= 17 && gapMeters <= limitMeters;
    row.textContent = check.label + " · 화면 지연 " + delay.toFixed(1) + "ms · 위치 오차 " + (gapMeters * 100).toFixed(1) + "cm";
    row.classList.toggle("ok", good);
    row.classList.toggle("bad", !good);
  }

  grip(gapMeters: number, seconds: number): void {
    if (gapMeters <= this.worstGrip) return;
    this.worstGrip = gapMeters;
    this.gripCell.textContent = "두 손–배트 최대 간격 " + (gapMeters * 100).toFixed(1) + "cm (" + seconds.toFixed(2) + "초)";
    this.gripCell.classList.toggle("ok", gapMeters <= 0.03);
    this.gripCell.classList.toggle("bad", gapMeters > 0.03);
  }
}

class BbMotionLab {
  private static readonly ASSET_DIRECTORY = "../assets/kaykit/";
  private static readonly ZONE_LINGER_SECONDS = 0.15;

  private readonly options = BbLabAddress.read();
  private readonly bar = document.getElementById("labBar") as HTMLElement;
  private readonly status = document.getElementById("labStatus") as HTMLElement;
  private readonly stage: BbStage;
  private readonly probe: Three<"Vector3">;
  private readonly probeOther: Three<"Vector3">;
  private script!: BbDrillScript;
  private director!: BbLabDirector;
  private board!: BbSyncBoard;
  private seconds = 0;
  private speed: number;
  private paused = false;
  private view: BbLabView;
  private lastView: BbLabView | null = null;

  constructor(libs: ThreeLibs) {
    this.speed = this.options.speed;
    this.view = this.options.view;
    this.stage = new BbStage(libs, document.getElementById("labView") as HTMLCanvasElement);
    this.probe = new libs.THREE.Vector3();
    this.probeOther = new libs.THREE.Vector3();
    this.start().catch((error: Error) => { this.status.textContent = "불러오지 못했어요: " + error.message; });
  }

  private async start(): Promise<void> {
    await this.stage.load(BbMotionLab.ASSET_DIRECTORY, BbBallparkRegistry.MAIN, this.options);
    const metrics = this.stage.metrics;
    this.script = BbDrillCatalog.all()[this.options.scene].build({ metrics, batsLeft: this.options.batsLeft, throwsLeft: this.options.throwsLeft });
    this.director = new BbLabDirector(this.script, this.options.scene, this.options.batsLeft, this.options.throwsLeft);
    this.board = new BbSyncBoard(document.getElementById("labSync") as HTMLElement, this.script);
    this.buildBar();
    if (this.options.plain) document.body.classList.add("plain");
    this.status.textContent = this.script.title + " · 팔 길이 " + metrics.armReach.toFixed(2) + "m · 어깨 높이 " + BbBodyDefaults.standingShoulderHeight(metrics).toFixed(2) + "m";
    this.restart();
    if (this.options.freezeAt !== null) this.freeze(this.options.freezeAt);
    this.stage.run((frameSeconds) => this.tick(frameSeconds));
  }

  private button(label: string, active: boolean, onPress: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = label;
    button.classList.toggle("on", active);
    button.addEventListener("click", onPress);
    this.bar.appendChild(button);
    return button;
  }

  private gap(): void {
    const spacer = document.createElement("span");
    spacer.className = "lab-gap";
    this.bar.appendChild(spacer);
  }

  private buildBar(): void {
    this.bar.textContent = "";
    BbDrillCatalog.all().forEach((drill, index) => this.button(drill.title, index === this.options.scene, () => BbLabAddress.go(this.options, { scene: index, view: this.view })));
    this.gap();
    const viewButtons = BbLabAddress.VIEWS.map(([name, label]) => this.button(label, name === this.view, () => {
      this.view = name;
      viewButtons.forEach((button, index) => button.classList.toggle("on", BbLabAddress.VIEWS[index][0] === name));
    }));
    this.gap();
    this.button(this.options.batsLeft ? "좌타" : "우타", this.options.batsLeft, () => BbLabAddress.go(this.options, { batsLeft: !this.options.batsLeft, view: this.view }));
    this.button(this.options.throwsLeft ? "좌투" : "우투", this.options.throwsLeft, () => BbLabAddress.go(this.options, { throwsLeft: !this.options.throwsLeft, view: this.view }));
    this.gap();
    const speeds: ReadonlyArray<readonly [number, string]> = [[1, "×1"], [0.5, "×0.5"], [0.2, "×0.2"]];
    const speedButtons = speeds.map(([value, label]) => this.button(label, value === this.speed, () => {
      this.speed = value;
      speedButtons.forEach((button, index) => button.classList.toggle("on", speeds[index][0] === value));
    }));
    const pause = this.button("일시정지", false, () => { this.paused = !this.paused; pause.classList.toggle("on", this.paused); });
    this.button("한 프레임 ▶", false, () => { this.paused = true; pause.classList.add("on"); this.advance(BbActionSync.FRAME_SECONDS); });
    this.button("↻ 다시", false, () => this.restart());
  }

  private restart(): void {
    this.seconds = 0;
    this.board.reset();
    this.stage.reset(this.script);
    this.advance(0);
  }

  private freeze(seconds: number): void {
    this.paused = true;
    for (let time = 0; time < seconds - 1e-9; time += BbActionSync.FRAME_SECONDS) this.advance(Math.min(BbActionSync.FRAME_SECONDS, seconds - time));
    this.advance(0);
  }

  private advance(deltaSeconds: number): void {
    const before = this.seconds;
    this.seconds += deltaSeconds;
    this.measure(before, this.seconds);
    this.stage.advance(this.script, this.seconds, deltaSeconds, this.view === "batter" ? BbStage.HIDDEN_BEHIND_PLATE : [], this.seconds < this.director.contactAt() + BbMotionLab.ZONE_LINGER_SECONDS);
    this.watchGrip();
  }

  private measure(before: number, now: number): void {
    this.script.checkpoints.forEach((check) => {
      if (!(before < check.at && check.at <= now)) return;
      const actor = this.stage.actor(check.role), placement = this.script.placementOf(check.role, check.at), frame = this.script.frameOf(check.role, check.at);
      actor.snapTo(frame);
      actor.update(0, placement, frame, null, 0);
      let gap = 0, limit = 0.02;
      if (check.kind === "contact") {
        const sweet = actor.batPointWorld(BbBatShape.SWEET_SPOT_AT, this.probe);
        gap = sweet ? sweet.distanceTo(this.probeOther.set(check.point.x, check.point.y, check.point.z)) : 9;
        limit = 0.05;
      } else if (check.kind === "touch") {
        gap = actor.root.position.distanceTo(this.probeOther.set(check.point.x, check.point.y, check.point.z));
      } else {
        actor.slotWorld(this.script.sideOf(check.role, check.kind === "catch" ? "glove" : "throw"), this.probe);
        gap = this.probe.distanceTo(this.probeOther.set(check.point.x, check.point.y, check.point.z));
      }
      this.board.record(check, (now - check.at) / Math.max(this.speed, 0.01), gap, limit);
    });
  }

  private watchGrip(): void {
    const batter = this.stage.actor("batter"), frame = this.script.frameOf("batter", this.seconds);
    if (!frame || !frame.bat) return;
    const bottom = this.script.sideOf("batter", "glove"), top = this.script.sideOf("batter", "throw");
    const bottomGrip = batter.batPointWorld(BbBatShape.BOTTOM_HAND_AT, this.probe);
    if (!bottomGrip) return;
    const bottomGap = bottomGrip.distanceTo(batter.slotWorld(bottom, this.probeOther));
    const topGrip = batter.batPointWorld(BbBatShape.TOP_HAND_AT, this.probe) as Three<"Vector3">;
    this.board.grip(Math.max(bottomGap, topGrip.distanceTo(batter.slotWorld(top, this.probeOther))), this.seconds);
  }

  private tick(frameSeconds: number): void {
    if (!this.paused) {
      this.advance(frameSeconds * this.speed);
      if (this.seconds > this.script.duration) this.restart();
    }
    const state = this.script.ballAt(this.seconds);
    this.stage.aim(this.director.shot(this.view, this.seconds, state ? state.point : null), frameSeconds, this.lastView !== this.view || this.paused);
    this.lastView = this.view;
  }
}
