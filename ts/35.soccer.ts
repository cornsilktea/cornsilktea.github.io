type SocScreenName = "start" | "lobby" | "game" | "end";
type SocButtonKey = "J" | "K";

interface SocPlayerRecord extends RkPlayerRecord {}
interface SocMatchRecord { id: number; startAt: number; seats: Record<string, string> }
interface SocEndRecord { winner: number; sa: number; sb: number; overtime: boolean; at: number }
interface SocPressRecord { n: number; t: number; k: number; p: number; dx: number; dz: number }
interface SocRemoteState { x: number; z: number; yaw: number; moving: boolean; ix: number; iz: number; kind: SocBodyAction; seq: number; age: number }
interface SocAxis { x: number; z: number }
interface SocVec3 { x: number; y: number; z: number }

class SocRoomRules {
  static readonly RULES: RkRoomRules = { root: SocConfig.ROOT, seatCount: SocConfig.SEAT_COUNT, spectatorSlot: SocConfig.SPECTATOR_SLOT };
  static readonly VALUES: readonly string[] = ["match", "ball", "game", "end"];
  static readonly ACTION_KINDS: readonly SocActionKind[] = ["pass", "shot", "tackle", "slide"];
  static readonly BODY_CODES: readonly SocBodyAction[] = ["none", "tackle", "slide"];
}

class SocStateCodec {
  static encode(controller: SocPlayerController, nowMs: number): string {
    const round2 = (value: number) => Math.round(value * 100) / 100;
    const round1 = (value: number) => Math.round(value * 10) / 10;
    const code = SocRoomRules.BODY_CODES.indexOf(controller.actionKind);
    const age = controller.actionKind !== "none" && nowMs - controller.actionStartMs < 1500 ? Math.max(0, Math.round(nowMs - controller.actionStartMs)) : 0;
    return [round2(controller.x), round2(controller.z), round2(controller.yaw), controller.moving ? 1 : 0, round1(controller.ix), round1(controller.iz), code, controller.actionSeq, age].join(",");
  }

  static decode(raw: string): SocRemoteState | null {
    const parts = raw.split(",").map(Number);
    if (parts.length < 9 || parts.some((part) => isNaN(part))) return null;
    return { x: parts[0], z: parts[1], yaw: parts[2], moving: parts[3] === 1, ix: parts[4], iz: parts[5], kind: SocRoomRules.BODY_CODES[parts[6]] || "none", seq: parts[7], age: parts[8] };
  }
}

class SocBotLooks {
  static create(team: number): CharacterLook {
    const look = CharacterLooks.random();
    look.p.top = SocConfig.TEAM_TOP_COLOR_INDEX[team] + 1;
    return look;
  }

  static keeper(team: number): CharacterLook {
    const look = CharacterLooks.createDefault();
    look.c = team === 0 ? 1 : 2;
    look.p.top = SocConfig.TEAM_TOP_COLOR_INDEX[team] + 1;
    look.hat = 0;
    look.cape = 0;
    return look;
  }
}

class SocInput {
  private static readonly JOYSTICK_RADIUS = 55;
  private static readonly DEAD_ZONE = 0.3;

  onButton: (key: SocButtonKey, down: boolean) => void = () => undefined;
  enabled = true;
  private readonly held = new Set<string>();
  private joystickPointer: number | null = null;
  private joystickOriginX = 0;
  private joystickOriginY = 0;
  private joystickX = 0;
  private joystickZ = 0;

  constructor(private readonly zone: HTMLElement, private readonly base: HTMLElement, private readonly knob: HTMLElement) {
    this.bindKeyboard();
    this.bindJoystick();
    this.bindButton("btnJ", "J");
    this.bindButton("btnK", "K");
  }

  axis(): SocAxis {
    if (!this.enabled) return { x: 0, z: 0 };
    let x = this.joystickX, z = this.joystickZ;
    if (this.held.has("KeyA") || this.held.has("ArrowLeft")) x -= 1;
    if (this.held.has("KeyD") || this.held.has("ArrowRight")) x += 1;
    if (this.held.has("KeyW") || this.held.has("ArrowUp")) z -= 1;
    if (this.held.has("KeyS") || this.held.has("ArrowDown")) z += 1;
    const length = Math.hypot(x, z);
    return length > 0.05 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
  }

  releaseAll(): void {
    this.held.clear();
    this.joystickPointer = null;
    this.joystickX = this.joystickZ = 0;
    this.base.hidden = true;
  }

  private bindKeyboard(): void {
    const movementKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
    window.addEventListener("keydown", (event) => {
      if ((event.target as HTMLElement).tagName === "INPUT" || !this.enabled) return;
      const code = this.codeOf(event);
      if (movementKeys.indexOf(code) >= 0) {
        this.held.add(code);
        event.preventDefault();
      } else if (!event.repeat && (code === "KeyJ" || code === "KeyK")) {
        this.onButton(code === "KeyJ" ? "J" : "K", true);
        event.preventDefault();
      }
    });
    window.addEventListener("keyup", (event) => {
      const code = this.codeOf(event);
      this.held.delete(code);
      if (code === "KeyJ" || code === "KeyK") this.onButton(code === "KeyJ" ? "J" : "K", false);
    });
    window.addEventListener("blur", () => {
      this.held.clear();
      this.onButton("J", false);
      this.onButton("K", false);
    });
  }

  private codeOf(event: KeyboardEvent): string {
    return event.key.indexOf("Arrow") === 0 ? event.key : event.code;
  }

  private bindJoystick(): void {
    this.zone.addEventListener("pointerdown", (event) => {
      if (this.joystickPointer !== null) return;
      this.joystickPointer = event.pointerId;
      this.joystickOriginX = event.clientX;
      this.joystickOriginY = event.clientY;
      this.base.style.left = event.clientX + "px";
      this.base.style.top = event.clientY + "px";
      this.base.hidden = false;
      this.knob.style.transform = "translate(0px,0px)";
      this.zone.setPointerCapture(event.pointerId);
    });
    this.zone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.joystickPointer) return;
      const deltaX = event.clientX - this.joystickOriginX, deltaY = event.clientY - this.joystickOriginY;
      const length = Math.hypot(deltaX, deltaY) || 1;
      const reach = Math.min(length, SocInput.JOYSTICK_RADIUS);
      this.knob.style.transform = "translate(" + (deltaX / length) * reach + "px," + (deltaY / length) * reach + "px)";
      const strength = Math.min(1, length / SocInput.JOYSTICK_RADIUS);
      if (strength < SocInput.DEAD_ZONE) this.joystickX = this.joystickZ = 0;
      else {
        this.joystickX = deltaX / length;
        this.joystickZ = deltaY / length;
      }
    });
    const end = (event: PointerEvent) => {
      if (event.pointerId !== this.joystickPointer) return;
      this.joystickPointer = null;
      this.joystickX = this.joystickZ = 0;
      this.base.hidden = true;
    };
    this.zone.addEventListener("pointerup", end);
    this.zone.addEventListener("pointercancel", end);
  }

  private bindButton(id: string, key: SocButtonKey): void {
    const button = RkDom.byId(id);
    button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (this.enabled) this.onButton(key, true);
    });
    const release = (event: PointerEvent) => {
      event.preventDefault();
      if (this.enabled) this.onButton(key, false);
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
  }
}

class SocLocalController extends SocPlayerController {
  constructor(slot: number, private readonly input: SocInput) {
    super(slot);
  }

  poll(engine: SocEngine | null, dtSec: number, nowMs: number): void {
    const axis = this.input.axis();
    const side = SocConfig.sideOf(this.team);
    this.ix = axis.x * side;
    this.iz = axis.z * side;
    this.step(dtSec, nowMs);
  }
}

class SocChargeTracker {
  private key: SocButtonKey | null = null;
  private startMs = 0;

  begin(key: SocButtonKey, nowMs: number): void {
    this.key = key;
    this.startMs = nowMs;
  }

  cancel(): void {
    this.key = null;
  }

  isCharging(key?: SocButtonKey): boolean {
    return this.key !== null && (key === undefined || this.key === key);
  }

  power(nowMs: number): number {
    return this.key === null ? 0 : SocMath.clamp((nowMs - this.startMs) / SocConfig.CHARGE_MS, 0, 1);
  }
}

class SocBallSmoother {
  private static readonly SNAP_DISTANCE = 3;
  private static readonly DECAY_PER_SECOND = 11;

  private offsetX = 0;
  private offsetY = 0;
  private offsetZ = 0;
  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;
  private pending = false;

  markChange(): void {
    this.pending = true;
  }

  shown(): SocPoint {
    return { x: this.lastX, z: this.lastZ };
  }

  smooth(target: SocVec3, deltaSeconds: number): SocVec3 {
    if (this.pending) {
      this.pending = false;
      const dx = this.lastX - target.x, dy = this.lastY - target.y, dz = this.lastZ - target.z;
      const near = Math.hypot(dx, dy, dz) < SocBallSmoother.SNAP_DISTANCE;
      this.offsetX = near ? dx : 0;
      this.offsetY = near ? dy : 0;
      this.offsetZ = near ? dz : 0;
    }
    const keep = Math.exp(-deltaSeconds * SocBallSmoother.DECAY_PER_SECOND);
    this.offsetX *= keep;
    this.offsetY *= keep;
    this.offsetZ *= keep;
    this.lastX = target.x + this.offsetX;
    this.lastY = target.y + this.offsetY;
    this.lastZ = target.z + this.offsetZ;
    return { x: this.lastX, y: this.lastY, z: this.lastZ };
  }
}

class SocBallTracker {
  readonly physics = new SocBallPhysics();
  readonly smoother = new SocBallSmoother();
  readonly follower = new SocDribbleFollower();
  ownerSlot = -1;
  ownerSince = 0;
  kind: SocBallKind = "kickoff";
  seq = -1;

  apply(record: SocBallRecord, nowMs: number): void {
    this.seq = record.seq;
    this.ownerSlot = record.owner;
    this.ownerSince = record.at;
    this.kind = record.kind;
    this.smoother.markChange();
    if (record.owner >= 0) {
      this.follower.reset();
      return;
    }
    this.physics.load(record);
    this.physics.advance(SocMath.clamp((nowMs - record.at) / 1000, 0, 6));
    this.physics.impacts.length = 0;
  }

  advance(deltaSeconds: number): void {
    if (this.ownerSlot < 0) this.physics.advance(deltaSeconds);
  }
}

interface SocHudModel {
  score: number[];
  myTeam: number;
  timeText: string;
  overtime: boolean;
  banner: string;
  hint: string;
  charge: number;
  labelJ: string;
  labelK: string;
  canAct: boolean;
}

class SocHud {
  private readonly teamScore = [RkDom.byId("hudScore0"), RkDom.byId("hudScore1")];
  private readonly teamBox = [RkDom.byId("hudTeam0"), RkDom.byId("hudTeam1")];
  private readonly time = RkDom.byId("hudTime");
  private readonly overtime = RkDom.byId("hudOvertime");
  private readonly banner = RkDom.byId("banner");
  private readonly bannerBox = RkDom.byId("bannerBox");
  private readonly hint = RkDom.byId("hudHint");
  private readonly chargeBox = RkDom.byId("chargeBox");
  private readonly chargeFill = RkDom.byId("chargeFill");
  private readonly buttonJ = RkDom.byId<HTMLButtonElement>("btnJ");
  private readonly buttonK = RkDom.byId<HTMLButtonElement>("btnK");

  update(model: SocHudModel): void {
    RkDom.setText(this.teamScore[0], String(model.score[0]));
    RkDom.setText(this.teamScore[1], String(model.score[1]));
    this.teamBox.forEach((box, team) => box.classList.toggle("mine", model.myTeam === team));
    RkDom.setText(this.time, model.timeText);
    RkDom.show(this.overtime, model.overtime);
    RkDom.show(this.banner, model.banner !== "");
    RkDom.setText(this.bannerBox, model.banner);
    RkDom.show(this.hint, model.hint !== "");
    RkDom.setText(this.hint, model.hint);
    RkDom.show(this.chargeBox, model.charge >= 0);
    this.chargeFill.style.width = Math.round(Math.max(0, model.charge) * 100) + "%";
    RkDom.show(this.buttonJ, model.canAct);
    RkDom.show(this.buttonK, model.canAct);
    RkDom.setText(this.buttonJ, model.labelJ);
    RkDom.setText(this.buttonK, model.labelK);
    this.buttonJ.classList.toggle("charging", model.charge >= 0);
  }
}

interface SocSeatActor {
  id: string;
  seenActionSeq: number;
  controller: SocPlayerController;
  view: SocPlayerView;
}

interface SocMatchServices {
  libs: ThreeLibs;
  assets: CharacterAssets;
  factory: CharacterModelFactory;
  labels: RkLabelFactory;
  world: SocWorldView;
  hud: SocHud;
  input: SocInput;
  backend: RkBackend;
  court: SocCourtView;
  textures: SocCourtTextures;
}

class SocHostDirector {
  private static readonly MAX_TICK_SEC = 0.5;

  private started = false;
  private lastTickMs = 0;
  private readonly lastPressSeq = new Map<string, number>();

  constructor(private readonly engine: SocEngine, private readonly onEvents: (events: SocEvent[]) => void) {}

  get hasStarted(): boolean {
    return this.started;
  }

  begin(nowMs: number): void {
    this.started = true;
    this.lastTickMs = nowMs;
    this.onEvents(this.engine.begin(nowMs));
  }

  tick(nowMs: number): void {
    if (!this.started) return;
    const elapsed = Math.min(SocHostDirector.MAX_TICK_SEC, Math.max(0, (nowMs - this.lastTickMs) / 1000));
    this.lastTickMs = nowMs;
    this.engine.players.forEach((controller) => controller.poll(this.engine, elapsed, nowMs));
    this.onEvents(this.engine.update(elapsed, nowMs));
  }

  receivePress(controller: SocPlayerController, id: string, record: SocPressRecord): void {
    const last = this.lastPressSeq.get(id) || 0;
    if (record.n <= last) return;
    this.lastPressSeq.set(id, record.n);
    const kind = SocRoomRules.ACTION_KINDS[record.k];
    if (!kind) return;
    controller.queueAction({ kind, power: SocMath.clamp(record.p / 100, 0, 1), atMs: record.t, dirX: record.dx, dirZ: record.dz });
  }
}

class SoccerMatch {
  private static readonly STATE_KEEPALIVE_MS = 1000;
  private static readonly ACTION_VIEW_MS = 420;
  private static readonly HIT_VIEW_MS = 520;

  private readonly group: Three<"Group">;
  private readonly seats: Array<SocSeatActor | null> = [null, null, null, null, null, null];
  private readonly controllers: SocPlayerController[] = [];
  private readonly bodies: SocPlayerController[] = [];
  private readonly ballView: SocBallView;
  private readonly tracker = new SocBallTracker();
  private readonly charge = new SocChargeTracker();
  private readonly local: SocLocalController | null = null;
  private readonly mySlot: number;
  private director: SocHostDirector | null = null;
  private engine: SocEngine | null = null;
  private game: SocGameRecord | null = null;
  private seatsDirty = true;
  private lastSentMs = 0;
  private readonly botSent = new Map<string, { text: string; at: number }>();
  private localSent = { text: "", at: 0 };
  private lastGameNo = 0;
  private pressCounter = 0;
  private ended = false;
  private cheeringTeam = -2;

  constructor(private readonly services: SocMatchServices, private readonly session: RkSession<SocPlayerRecord>) {
    const THREE = services.libs.THREE;
    this.group = new THREE.Group();
    services.world.matchGroup.add(this.group);
    this.ballView = new SocBallView(services.libs, services.textures);
    this.group.add(this.ballView.group);
    this.ballView.loadModel();
    const seatIds = new RkSeatPlan(SocRoomRules.RULES).matchSeats(session.value<SocMatchRecord>("match"));
    this.mySlot = seatIds.indexOf(session.myId);
    if (this.mySlot >= 0) this.local = new SocLocalController(this.mySlot, services.input);
    services.world.playing = true;
    services.world.rig.snap();
    services.input.enabled = this.mySlot >= 0;
    services.input.onButton = (key, down) => this.buttonChanged(key, down);
    this.game = session.value<SocGameRecord>("game");
    const ball = session.value<SocBallRecord>("ball");
    if (ball) this.tracker.apply(ball, services.backend.now());
    this.syncSeats();
    if (session.isHost()) {
      this.engine = new SocEngine(this.controllers, Math.random);
      this.director = new SocHostDirector(this.engine, (events) => this.applyEvents(events));
    }
    this.createKeepers();
  }

  private createKeepers(): void {
    for (let index = 0; index < 2; index++) {
      const slot = SocConfig.SEAT_COUNT + index;
      const team = SocConfig.teamOfSlot(slot);
      const controller: SocPlayerController = this.engine ? this.engine.keepers[index] : new SocRemoteController(slot);
      const home = SocCourtLayout.keeperHome(slot);
      controller.teleport(home.x, home.z);
      this.bodies[slot] = controller;
      controller.obstacles = this.bodies;
      const record: SocPlayerRecord = { nick: SocConfig.KEEPER_NAME, isBot: true, joinedAt: 0, slot, look: SocBotLooks.keeper(team) };
      const view = new SocPlayerView(this.services.libs, this.services.factory, this.services.assets, this.services.labels, this.group, slot, record, false);
      this.seats[slot] = { id: "gk" + index, seenActionSeq: controller.actionSeq, controller, view };
    }
  }

  private isHostAi(actor: SocSeatActor): boolean {
    return this.isHost() && actor.id !== this.session.myId && !(actor.controller instanceof SocRemoteController);
  }

  applyChange(kind: string): void {
    if (kind === "players" || kind === "match") this.seatsDirty = true;
    if (kind === "ball" && !this.isHost()) this.applyBall(this.session.value<SocBallRecord>("ball"));
    if (kind === "game" && !this.isHost()) this.applyGame(this.session.value<SocGameRecord>("game"));
  }

  receiveRemote(id: string, state: SocRemoteState): void {
    const seat = this.seats.find((actor) => !!actor && actor.id === id);
    if (!seat || !(seat.controller instanceof SocRemoteController)) return;
    seat.controller.receive(state.x, state.z, state.yaw, state.moving, state.ix, state.iz);
    if (!this.isHost()) seat.controller.receiveAction(state.kind, state.seq, state.age, this.services.backend.now());
  }

  receivePress(id: string, record: SocPressRecord): void {
    if (!this.director) return;
    const seat = this.seats.find((actor) => !!actor && actor.id === id);
    if (seat) this.director.receivePress(seat.controller, id, record);
  }

  playerRemoved(id: string): void {
    if (!this.isHost()) return;
    const slot = this.seats.findIndex((actor) => !!actor && actor.id === id);
    if (slot < 0 || !this.session.value<SocMatchRecord>("match")) return;
    const botId = "bot" + Math.random().toString(36).slice(2, 8);
    const record: SocPlayerRecord = { nick: SocConfig.BOT_NAMES[slot], isBot: true, joinedAt: this.services.backend.now(), slot, look: SocBotLooks.create(SocConfig.teamOfSlot(slot)) };
    this.session.ref.update({ ["players/" + botId]: record, ["match/seats/s" + slot]: botId });
  }

  markEnded(): void {
    this.ended = true;
  }

  dispose(): void {
    this.services.world.playing = false;
    this.services.input.releaseAll();
    this.services.input.onButton = () => undefined;
    this.seats.forEach((actor) => { if (actor) actor.view.dispose(); });
    this.services.world.matchGroup.remove(this.group);
  }

  update(deltaSeconds: number): void {
    const now = this.services.backend.now();
    if (this.seatsDirty) this.syncSeats();
    this.tryBeginHost(now);
    this.driveControllers(deltaSeconds, now);
    this.keepChargeValid();
    this.sendStates(now);
    this.renderWorld(deltaSeconds, now);
    this.services.hud.update(this.hudModel(now));
    this.services.world.render(deltaSeconds);
  }

  private isHost(): boolean {
    return this.session.isHost();
  }

  private syncSeats(): void {
    const seatIds = new RkSeatPlan(SocRoomRules.RULES).matchSeats(this.session.value<SocMatchRecord>("match"));
    let complete = true;
    for (let slot = 0; slot < SocConfig.SEAT_COUNT; slot++) {
      const id = seatIds[slot];
      const record = id ? this.session.players.get(id) : undefined;
      const current = this.seats[slot];
      if (!id || !record) {
        complete = false;
        continue;
      }
      if (current && current.id === id) continue;
      const previous = current ? current.controller : null;
      if (current) current.view.dispose();
      const controller = this.makeController(slot, id, record, previous);
      const view = new SocPlayerView(this.services.libs, this.services.factory, this.services.assets, this.services.labels, this.group, slot, record, id === this.session.myId);
      this.seats[slot] = { id, seenActionSeq: controller.actionSeq, controller, view };
      this.controllers[slot] = controller;
      this.bodies[slot] = controller;
      controller.obstacles = this.bodies;
    }
    this.seatsDirty = !complete;
  }

  private makeController(slot: number, id: string, record: SocPlayerRecord, previous: SocPlayerController | null): SocPlayerController {
    let controller: SocPlayerController;
    if (id === this.session.myId && this.local) controller = this.local;
    else if (this.isHost() && record.isBot) controller = new SocBot(slot, Math.random);
    else controller = new SocRemoteController(slot);
    if (previous) {
      controller.x = previous.x;
      controller.z = previous.z;
      controller.yaw = previous.yaw;
      if (controller instanceof SocRemoteController) controller.teleport(previous.x, previous.z);
    } else {
      const spot = SocCourtLayout.kickoffSpot(slot, this.game ? this.game.kickoff : 0);
      controller.teleport(spot.x, spot.z);
    }
    return controller;
  }

  private tryBeginHost(now: number): void {
    if (!this.director || this.director.hasStarted || this.seatsDirty) return;
    this.director.begin(now);
  }

  private driveControllers(deltaSeconds: number, now: number): void {
    if (this.engine && this.director && this.director.hasStarted) {
      this.director.tick(now);
      return;
    }
    if (this.local) {
      this.local.frozen = !this.game || this.game.phase !== "play";
      this.local.carrying = this.tracker.ownerSlot === this.local.slot;
    }
    this.seats.forEach((actor) => { if (actor) actor.controller.poll(null, deltaSeconds, now); });
    if (!this.isHost()) this.tracker.advance(deltaSeconds);
  }

  private sendStates(now: number): void {
    if (now - this.lastSentMs < SocConfig.NET_MS) return;
    this.lastSentMs = now;
    if (this.local) this.sendIfNeeded(this.localSent, SocStateCodec.encode(this.local, now), now, this.session.myId);
    if (!this.isHost()) return;
    this.seats.forEach((actor) => {
      if (!actor || !this.isHostAi(actor)) return;
      let sent = this.botSent.get(actor.id);
      if (!sent) {
        sent = { text: "", at: 0 };
        this.botSent.set(actor.id, sent);
      }
      this.sendIfNeeded(sent, SocStateCodec.encode(actor.controller, now), now, actor.id);
    });
  }

  private sendIfNeeded(sent: { text: string; at: number }, text: string, now: number, id: string): void {
    if (text === sent.text && now - sent.at < SoccerMatch.STATE_KEEPALIVE_MS) return;
    sent.text = text;
    sent.at = now;
    this.session.writeState(text, id);
  }

  private ownerSlot(): number {
    return this.engine ? this.engine.ownerSlot : this.tracker.ownerSlot;
  }

  private phase(): SocGamePhase | "none" {
    return this.game ? this.game.phase : "none";
  }

  private localHasBall(): boolean {
    return !!this.local && this.ownerSlot() === this.local.slot;
  }

  private keepChargeValid(): void {
    if (this.charge.isCharging() && (!this.localHasBall() || this.phase() !== "play")) this.charge.cancel();
  }

  private buttonChanged(key: SocButtonKey, down: boolean): void {
    const local = this.local;
    if (!local || this.ended) return;
    const now = this.services.backend.now();
    if (this.phase() !== "play") {
      this.charge.cancel();
      return;
    }
    if (down) {
      if (this.localHasBall()) this.charge.begin(key, now);
      else this.fireBody(key === "J" ? "tackle" : "slide", now);
      return;
    }
    if (!this.charge.isCharging(key)) return;
    const power = this.charge.power(now);
    this.charge.cancel();
    this.fireKick(key === "J" ? "pass" : "shot", power, now);
  }

  private fireKick(kind: SocActionKind, power: number, now: number): void {
    const local = this.local as SocLocalController;
    if (this.isHost()) {
      local.queueAction({ kind, power, atMs: now, dirX: 0, dirZ: 0 });
      return;
    }
    this.sendPress(kind, power, now, 0, 0);
  }

  private fireBody(kind: SocActionKind, now: number): void {
    const local = this.local as SocLocalController;
    const ownerSlot = this.ownerSlot();
    const opponentOwner = ownerSlot >= 0 && SocConfig.teamOfSlot(ownerSlot) !== local.team ? this.ballPoint(now) : null;
    const aim = SocActionAim.direction(kind, local, opponentOwner);
    if (this.isHost()) {
      local.queueAction({ kind, power: 0, atMs: now, dirX: aim.x, dirZ: aim.z });
      return;
    }
    if (local.isBusy(now)) return;
    local.beginBodyAction(kind === "tackle" ? "tackle" : "slide", now, aim.x, aim.z);
    this.sendPress(kind, 0, now, aim.x, aim.z);
  }

  private sendPress(kind: SocActionKind, power: number, now: number, dirX: number, dirZ: number): void {
    this.pressCounter++;
    const round2 = (value: number) => Math.round(value * 100) / 100;
    this.session.writePress({ n: this.pressCounter, t: now, k: SocRoomRules.ACTION_KINDS.indexOf(kind), p: Math.round(power * 100), dx: round2(dirX), dz: round2(dirZ) });
  }

  private applyEvents(events: SocEvent[]): void {
    for (const event of events) {
      if (event.type === "ball") {
        this.session.writeValue("ball", event.ball);
        this.showBallEvent(event.ball);
      } else {
        this.session.writeValue("game", event.game);
        this.applyGame(event.game);
        if (event.game.phase === "over") this.finishMatch(event.game);
      }
    }
  }

  private finishMatch(game: SocGameRecord): void {
    this.session.ref.update({ end: { winner: game.winner, sa: game.sa, sb: game.sb, overtime: game.overtime, at: this.services.backend.now() }, status: "end" });
  }

  private applyBall(record: SocBallRecord | null): void {
    if (!record || record.seq === this.tracker.seq) return;
    this.tracker.apply(record, this.services.backend.now());
    this.showBallEvent(record);
    if (record.kind === "tackled" && this.local && record.by === this.local.slot) this.local.winRecover(this.services.backend.now());
  }

  private showBallEvent(record: SocBallRecord): void {
    const now = this.services.backend.now();
    if (Math.abs(now - record.at) > 1500) return;
    const actor = record.by >= 0 && record.by < SocConfig.SEAT_COUNT ? this.seats[record.by] : null;
    if (actor && (record.kind === "pass" || record.kind === "shot")) actor.view.play("kick", now, SoccerMatch.ACTION_VIEW_MS);
    const victim = record.victim >= 0 && record.victim < SocConfig.SEAT_COUNT ? this.seats[record.victim] : null;
    if (victim && record.kind === "tackled") victim.view.play("hit", now, SoccerMatch.HIT_VIEW_MS);
  }

  private applyGame(record: SocGameRecord | null): void {
    if (!record) return;
    this.game = record;
    if (record.n !== this.lastGameNo && record.phase === "ready") {
      this.lastGameNo = record.n;
      this.charge.cancel();
      if (!this.isHost()) this.seats.forEach((actor) => {
        if (!actor) return;
        const spot = SocCourtLayout.spotFor(actor.controller.slot, record.kickoff);
        actor.controller.teleport(spot.x, spot.z);
      });
    }
    if (record.phase === "goal") this.services.court.crowd.cheer();
  }

  private ballPoint(now: number): SocPoint {
    const target = this.ballTarget(now);
    return { x: target.x, z: target.z };
  }

  private ballTarget(now: number): SocVec3 {
    if (this.engine) {
      const point = this.engine.ballPoint(now);
      const ownerSlot = this.engine.ownerSlot;
      return { x: point.x, y: ownerSlot >= 0 ? SocConfig.BALL_R : this.engine.physics.y, z: point.z };
    }
    const ownerSlot = this.tracker.ownerSlot;
    const owner = ownerSlot >= 0 ? this.seats[ownerSlot] : null;
    if (owner) {
      const point = this.tracker.follower.position(owner.controller.x, owner.controller.z, owner.controller.yaw, owner.controller.moving, this.tracker.ownerSince, now, this.tracker.smoother.shown());
      return { x: point.x, y: SocConfig.BALL_R, z: point.z };
    }
    return { x: this.tracker.physics.x, y: this.tracker.physics.y, z: this.tracker.physics.z };
  }

  private ballVelocity(): SocPoint {
    if (this.engine) return this.engine.ballVelocity();
    const ownerSlot = this.tracker.ownerSlot;
    const owner = ownerSlot >= 0 ? this.seats[ownerSlot] : null;
    if (owner) {
      const velocity = owner.controller.velocity();
      return { x: velocity.vx, z: velocity.vz };
    }
    return { x: this.tracker.physics.vx, z: this.tracker.physics.vz };
  }

  private renderWorld(deltaSeconds: number, now: number): void {
    const target = this.ballTarget(now);
    const shown = this.engine ? target : this.tracker.smoother.smooth(target, deltaSeconds);
    const velocity = this.ballVelocity();
    this.ballView.place(shown.x, shown.y, shown.z, velocity.x, velocity.z, deltaSeconds);
    const physics = this.engine ? this.engine.physics : this.tracker.physics;
    physics.impacts.splice(0).forEach((impact) => this.services.court.impact(impact));
    const cheeringTeam = this.cheeringTeamNow();
    this.seats.forEach((actor) => {
      if (!actor) return;
      const controller = actor.controller;
      if (controller.actionSeq !== actor.seenActionSeq) {
        actor.seenActionSeq = controller.actionSeq;
        if (controller.actionKind !== "none" && now - controller.actionStartMs < 600) actor.view.play(controller.actionKind === "slide" ? "slide" : "tackle", controller.actionStartMs, controller.activeMs());
      }
      actor.view.setCheering(cheeringTeam === controller.team);
      actor.view.render(controller.x, controller.z, controller.yaw, controller.moving, deltaSeconds, now);
    });
    this.services.court.update(deltaSeconds);
    const rig = this.services.world.rig;
    if (this.local) rig.followPlayer(this.local.team, shown, this.local, deltaSeconds);
    else rig.watchFromSide(shown.x, shown.z, deltaSeconds);
  }

  private cheeringTeamNow(): number {
    const game = this.game;
    if (!game) return -2;
    if (game.phase === "goal") return game.own ? 1 - SocConfig.teamOfSlot(game.scorer) : game.scorer >= 0 ? SocConfig.teamOfSlot(game.scorer) : -2;
    if (game.phase === "over") return game.winner;
    return -2;
  }

  private timeText(now: number): string {
    const game = this.game;
    if (!game) return "2:00";
    const left = game.phase === "play" && !game.overtime ? game.leftMs - (now - game.at) : game.leftMs;
    const seconds = Math.max(0, Math.ceil(left / 1000));
    return Math.floor(seconds / 60) + ":" + (seconds % 60 < 10 ? "0" : "") + (seconds % 60);
  }

  private hudModel(now: number): SocHudModel {
    const game = this.game;
    const holding = this.localHasBall();
    const model: SocHudModel = {
      score: game ? [game.sa, game.sb] : [0, 0], myTeam: this.local ? this.local.team : -1,
      timeText: this.timeText(now), overtime: !!game && game.overtime, banner: "", hint: "",
      charge: this.charge.isCharging() ? this.charge.power(now) : -1,
      labelJ: holding ? "패스" : "태클", labelK: holding ? "슛" : "슬라이딩", canAct: !!this.local
    };
    if (!game) {
      model.banner = "경기를 준비하고 있어요…";
      return model;
    }
    model.banner = this.bannerText(game, now);
    if (!this.local) model.hint = "관전 중";
    else if (game.phase === "play") model.hint = holding ? "J 패스 · K 슛 (꾹 누르면 더 세게)" : "J 태클 · K 슬라이딩";
    return model;
  }

  private nickOfSlot(slot: number): string {
    const id = slot >= 0 && slot < SocConfig.SEAT_COUNT ? this.seats[slot] : null;
    return id ? id.view.record.nick : "";
  }

  private bannerText(game: SocGameRecord, now: number): string {
    if (game.phase === "goal") {
      const name = this.nickOfSlot(game.scorer);
      const suffix = game.own ? " (자책골)" : "";
      return (game.overtime ? "골든골!  " : "골!!  ") + name + suffix + "  " + game.sa + " : " + game.sb;
    }
    if (game.phase === "ready") {
      const length = game.overtime ? SocConfig.OVERTIME_READY_MS : SocConfig.READY_MS;
      const seconds = Math.max(1, Math.ceil((game.at + length - now) / 1000));
      const team = SocConfig.TEAM_NAMES[game.kickoff];
      return (game.overtime ? "연장 골든골! " : game.n === 1 ? "경기 시작! " : "킥오프 ") + team + " 공격 " + seconds;
    }
    if (game.phase === "over") return "경기 종료";
    return "";
  }
}

class SocScreens {
  private readonly start = RkDom.byId("startScreen");
  private readonly lobby = RkDom.byId("lobbyScreen");
  private readonly end = RkDom.byId("endScreen");
  private readonly gameUi = RkDom.byId("gameUi");
  private readonly joystickZone = RkDom.byId("joyZone");
  current: SocScreenName = "start";

  constructor(private readonly touchDevice: boolean) {}

  show(name: SocScreenName, canControl: boolean = true): void {
    this.current = name;
    RkDom.show(this.start, name === "start");
    RkDom.show(this.lobby, name === "lobby");
    RkDom.show(this.end, name === "end");
    RkDom.show(this.gameUi, name === "game");
    RkDom.show(this.joystickZone, name === "game" && this.touchDevice && canControl);
    document.body.classList.toggle("in-game", name === "game");
  }
}

class SocLobbyView {
  private readonly code = RkDom.byId("lobbyCode");
  private readonly seatBoard = RkDom.byId("seatBoard");
  private readonly spectatorLine = RkDom.byId("spectatorLine");
  private readonly startButton = RkDom.byId<HTMLButtonElement>("btnStart");
  private readonly modeButton = RkDom.byId<HTMLButtonElement>("btnSeatMode");
  private readonly hint = RkDom.byId("lobbyHint");
  private readonly seatPlan = new RkSeatPlan(SocRoomRules.RULES);
  onSeatClick: (slot: number) => void = () => undefined;
  selectedSlot = -1;

  constructor() {
    this.seatBoard.addEventListener("click", (event) => {
      const seat = (event.target as HTMLElement).closest("[data-slot]") as HTMLElement | null;
      if (seat) this.onSeatClick(Number(seat.dataset.slot));
    });
  }

  render(session: RkSession<SocPlayerRecord>): void {
    const isHost = session.isHost();
    const seats = this.seatPlan.humanSeats(session.players);
    RkDom.setText(this.code, session.code);
    this.seatBoard.innerHTML = [0, 1].map((team) => {
      const rows = [team * 2, team * 2 + 1].map((slot) => this.seatHtml(session, seats[slot], slot)).join("");
      return "<div class='socTeam' style='--team:" + SocConfig.TEAM_COLORS[team] + "'><h3>" + SocConfig.TEAM_NAMES[team] + "</h3>" + rows + "</div>";
    }).join("");
    const spectatorNames = this.seatPlan.spectators(session.players).map((id) => (session.players.get(id) as SocPlayerRecord).nick + (id === session.myId ? " (나)" : ""));
    RkDom.setText(this.spectatorLine, "관전: " + (spectatorNames.length ? spectatorNames.join(", ") : "없음"));
    const humans = seats.filter((id) => !!id).length;
    RkDom.show(this.startButton, isHost);
    const spectating = session.isSpectator();
    this.modeButton.textContent = spectating ? "선수로 참가하기" : "관전자로 바꾸기";
    this.modeButton.disabled = spectating ? this.seatPlan.freeSeat(session.players) < 0 : this.seatPlan.spectators(session.players).length > 0;
    RkDom.setText(this.hint, isHost
      ? "사람 " + humans + "명 · 빈 자리 " + (SocConfig.SEAT_COUNT - humans) + "곳은 AI가 채워요. 자리를 눌러 두 칸을 바꿀 수 있어요."
      : "방장이 시작하길 기다리는 중이에요… 빈 자리를 누르면 옮길 수 있어요.");
  }

  private seatHtml(session: RkSession<SocPlayerRecord>, id: string | null, slot: number): string {
    const selected = this.selectedSlot === slot ? " selected" : "";
    if (!id) return "<button type='button' class='socSeat empty" + selected + "' data-slot='" + slot + "'><b>AI</b><small>빈 자리</small></button>";
    const record = session.players.get(id) as SocPlayerRecord;
    const tag = id === session.hostId ? "방장" : "";
    const mine = id === session.myId ? " me" : "";
    return "<button type='button' class='socSeat" + mine + selected + "' data-slot='" + slot + "'><b>" + RkDom.escape(record.nick) + "</b><small>" + tag + (id === session.myId ? " 나" : "") + "</small></button>";
  }
}

class SocEndView {
  private readonly title = RkDom.byId("endTitle");
  private readonly reason = RkDom.byId("endReason");
  private readonly rows = RkDom.byId("endRows");
  private readonly seatPlan = new RkSeatPlan(SocRoomRules.RULES);

  render(session: RkSession<SocPlayerRecord>, end: SocEndRecord): void {
    const seats = this.seatPlan.matchSeats(session.value<SocMatchRecord>("match"));
    const mySlot = seats.indexOf(session.myId);
    const myTeam = mySlot >= 0 ? SocConfig.teamOfSlot(mySlot) : -1;
    RkDom.setText(this.title, SocConfig.TEAM_NAMES[end.winner] + " 승리!" + (myTeam >= 0 ? (myTeam === end.winner ? "  (우리가 이겼어요)" : "  (아쉬워요)") : ""));
    RkDom.setText(this.reason, SocConfig.TEAM_NAMES[0] + " " + end.sa + " : " + end.sb + " " + SocConfig.TEAM_NAMES[1] + (end.overtime ? "  · 연장 골든골" : ""));
    this.rows.innerHTML = [0, 1, 2, 3].map((slot) => {
      const id = seats[slot];
      const record = id ? session.players.get(id) : undefined;
      const team = SocConfig.teamOfSlot(slot);
      const name = record ? record.nick + (record.isBot ? " (AI)" : "") : "(나감)";
      const result = team === end.winner ? "승리" : "패배";
      return "<tr" + (id === session.myId ? " class='meRow'" : "") + "><td><span class='rankDot' style='background:" + SocConfig.TEAM_COLORS[team] + "'></span>" + RkDom.escape(name) + "</td><td>" + SocConfig.TEAM_NAMES[team] + "</td><td>" + result + "</td></tr>";
    }).join("");
  }
}

class SoccerGame {
  private readonly backdrop: SocMenuBackdrop;
  private readonly touchDevice = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  private readonly profile = new PlayerProfile();
  private readonly backend = new RkBackend();
  private readonly directory = new RkDirectory<SocPlayerRecord>(this.backend, SocRoomRules.RULES);
  private readonly seatPlan = new RkSeatPlan(SocRoomRules.RULES);
  private readonly assets: CharacterAssets;
  private readonly factory: CharacterModelFactory;
  private readonly textures: SocCourtTextures;
  private readonly court: SocCourtView;
  private readonly services: SocMatchServices;
  private readonly screens = new SocScreens(this.touchDevice);
  private readonly lobbyView = new SocLobbyView();
  private readonly endView = new SocEndView();
  private readonly editor: ProfileEditor;
  private readonly myId = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  private session: RkSession<SocPlayerRecord> | null = null;
  private match: SoccerMatch | null = null;
  private assetsReady = false;
  private lastFrameMs = 0;

  constructor(private readonly libs: ThreeLibs) {
    this.assets = new CharacterAssets(libs);
    this.factory = new CharacterModelFactory(libs, this.assets);
    this.textures = new SocCourtTextures(libs);
    this.court = new SocCourtView(libs, this.textures);
    this.editor = new ProfileEditor(libs, this.factory, this.assets, this.profile);
    FoldCard.bindAll(document);
    const input = new SocInput(RkDom.byId("joyZone"), RkDom.byId("joyBase"), RkDom.byId("joyKnob"));
    this.services = {
      libs, assets: this.assets, factory: this.factory, labels: new RkLabelFactory(libs),
      world: new SocWorldView(libs, RkDom.byId<HTMLCanvasElement>("view"), this.touchDevice),
      hud: new SocHud(), input, backend: this.backend, court: this.court, textures: this.textures
    };
    this.services.world.scene.add(this.court.group);
    this.backdrop = new SocMenuBackdrop(this.services.world, libs, this.textures);
    this.bindMenus();
    this.screens.show("start");
    this.updateStartButtons();
    this.loadAssets();
    requestAnimationFrame(this.loop);
    window.setInterval(() => { if (document.hidden) this.step(performance.now()); }, 250);
    window.addEventListener("pagehide", () => { if (this.session) this.session.removeMineOnUnload(); });
  }

  private async loadAssets(): Promise<void> {
    try {
      await Promise.all([this.assets.load(), this.court.loadDecor(), this.loadExtraClips()]);
      this.assetsReady = true;
      this.backdrop.prepare(this.factory, this.assets, this.services.labels);
      this.backdrop.loadBall();
      RkDom.setText(RkDom.byId("loadNote"), "");
      this.editor.mount(RkDom.byId("profileHost"));
      this.editor.setActive(true);
      this.editor.onChange(() => this.pushProfile());
      this.updateStartButtons();
    } catch (error) {
      RkDom.setText(RkDom.byId("loadNote"), "캐릭터를 불러오지 못했어요. 새로고침해 주세요.");
    }
  }

  private async loadExtraClips(): Promise<void> {
    try {
      const gltf = await new this.libs.GLTFLoader().loadAsync("assets/kaykit/animations/soccer_anims.glb");
      gltf.animations.forEach((clip) => this.assets.clips.set(clip.name, clip));
    } catch (error) {
      return;
    }
  }

  private bindMenus(): void {
    RkDom.byId("btnCreate").addEventListener("click", () => this.createRoom());
    RkDom.byId("btnJoin").addEventListener("click", () => this.joinRoom(false));
    RkDom.byId("btnWatch").addEventListener("click", () => this.joinRoom(true));
    RkDom.byId("joinCode").addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") this.joinRoom(false); });
    RkDom.byId("btnStart").addEventListener("click", () => this.startMatch());
    RkDom.byId("btnLeave").addEventListener("click", () => this.leaveRoom());
    RkDom.byId("btnEndLeave").addEventListener("click", () => this.leaveRoom());
    RkDom.byId("btnGameLeave").addEventListener("click", () => this.leaveRoom());
    RkDom.byId("btnToLobby").addEventListener("click", () => this.returnToLobby());
    RkDom.byId("btnSeatMode").addEventListener("click", () => this.toggleSeatMode());
    this.lobbyView.onSeatClick = (slot) => this.clickSeat(slot);
  }

  private updateStartButtons(): void {
    const ok = !!this.backend.database && this.assetsReady;
    ["btnCreate", "btnJoin", "btnWatch"].forEach((id) => { RkDom.byId<HTMLButtonElement>(id).disabled = !ok; });
    if (!this.backend.database) this.showStartMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인)");
  }

  private showStartMessage(text: string): void {
    RkDom.setText(RkDom.byId("startMsg"), text);
  }

  private myRecord(): SocPlayerRecord {
    return { nick: this.profile.nickOrDefault(), isBot: false, joinedAt: this.backend.now(), slot: 0, look: this.profile.look, spectator: false };
  }

  private pushProfile(): void {
    if (this.session) this.session.pushProfile({ nick: this.profile.nickOrDefault(), look: this.profile.look });
  }

  private async createRoom(): Promise<void> {
    if (!this.backend.database) return;
    this.showStartMessage("");
    const button = RkDom.byId<HTMLButtonElement>("btnCreate");
    button.disabled = true;
    try {
      const code = await this.directory.create(this.myId, this.myRecord());
      if (code) this.enterRoom(code, true, "");
      else this.showStartMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
    } catch (error) {
      this.showStartMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
    }
    button.disabled = false;
  }

  private async joinRoom(asSpectator: boolean): Promise<void> {
    if (!this.backend.database) return;
    const code = RkDom.byId<HTMLInputElement>("joinCode").value.replace(/\D/g, "");
    if (code.length !== 5) {
      this.showStartMessage("방 코드 5자리를 입력해 주세요.");
      return;
    }
    this.showStartMessage("");
    try {
      const outcome = await this.directory.join(code, this.myId, this.myRecord(), asSpectator);
      if (outcome.ok) this.enterRoom(code, false, outcome.message);
      else this.showStartMessage(outcome.message);
    } catch (error) {
      this.showStartMessage("방을 불러오지 못했어요.");
    }
  }

  private enterRoom(code: string, hosting: boolean, notice: string): void {
    const session = new RkSession<SocPlayerRecord>(this.backend, SocRoomRules.RULES, code, this.myId, hosting, SocRoomRules.VALUES);
    this.session = session;
    session.onChange = (kind) => this.onSessionChange(kind);
    session.onRemoteState = (id, raw) => {
      const state = SocStateCodec.decode(raw);
      if (state && this.match) this.match.receiveRemote(id, state);
    };
    session.onPress = (id, record) => { if (this.match) this.match.receivePress(id, record as SocPressRecord); };
    session.onPlayerRemoved = (id) => { if (this.match) this.match.playerRemoved(id); };
    session.onClosed = (message) => this.exitToStart(message);
    session.connect();
    this.lobbyView.selectedSlot = -1;
    this.showLobby();
    RkDom.setText(RkDom.byId("lobbyNotice"), notice);
  }

  private showLobby(): void {
    this.screens.show("lobby");
    this.editor.mount(RkDom.byId("lobbyProfileHost"));
    this.editor.setActive(true);
    if (this.session) this.lobbyView.render(this.session);
  }

  private showStart(message: string): void {
    this.screens.show("start");
    this.editor.mount(RkDom.byId("profileHost"));
    this.editor.setActive(true);
    this.showStartMessage(message);
  }

  private onSessionChange(kind: string): void {
    const session = this.session;
    if (!session) return;
    if (this.screens.current === "lobby" && (kind === "players" || kind === "host" || kind === "status")) this.lobbyView.render(session);
    if (kind === "status" || kind === "match" || kind === "end" || (kind === "players" && session.status === "play" && !this.match)) this.syncPhase();
    if (this.match) this.match.applyChange(kind);
  }

  private syncPhase(): void {
    const session = this.session;
    if (!session) return;
    const end = session.value<SocEndRecord>("end");
    if (session.status === "lobby") {
      if (this.match) this.disposeMatch();
      if (this.screens.current !== "lobby") this.showLobby();
      this.lobbyView.render(session);
    } else if (session.status === "play" && session.value<SocMatchRecord>("match") && !this.match && session.me()) {
      this.editor.setActive(false);
      this.match = new SoccerMatch(this.services, session);
      this.screens.show("game", !session.isSpectator());
    } else if (session.status === "end" && end && this.screens.current !== "end") {
      if (this.match) this.match.markEnded();
      this.endView.render(session, end);
      this.screens.show("end");
      RkDom.show(RkDom.byId("btnToLobby"), session.isHost());
      RkDom.setText(RkDom.byId("endHint"), session.isHost() ? "" : "방장이 대기실로 돌아가길 기다려요…");
    }
  }

  private disposeMatch(): void {
    if (this.match) this.match.dispose();
    this.match = null;
  }

  private clickSeat(slot: number): void {
    const session = this.session;
    if (!session || session.status !== "lobby") return;
    const seats = this.seatPlan.humanSeats(session.players);
    if (session.isHost()) {
      const picked = this.lobbyView.selectedSlot;
      if (picked < 0) this.lobbyView.selectedSlot = slot;
      else if (picked === slot) this.lobbyView.selectedSlot = -1;
      else {
        const updates = this.seatPlan.swapUpdates(session.players, picked, slot);
        if (Object.keys(updates).length) session.ref.update(updates);
        this.lobbyView.selectedSlot = -1;
      }
      this.lobbyView.render(session);
      return;
    }
    const me = session.me();
    if (me && !seats[slot]) session.ref.child("players/" + session.myId).update({ slot, spectator: false });
  }

  private toggleSeatMode(): void {
    const session = this.session;
    if (!session || session.status !== "lobby") return;
    if (session.isSpectator()) {
      const seat = this.seatPlan.freeSeat(session.players);
      if (seat >= 0) session.ref.child("players/" + session.myId).update({ slot: seat, spectator: false });
    } else if (this.seatPlan.spectators(session.players).length === 0) {
      session.ref.child("players/" + session.myId).update({ slot: SocConfig.SPECTATOR_SLOT, spectator: true });
    }
  }

  private startMatch(): void {
    const session = this.session;
    if (!session || !session.isHost() || session.status !== "lobby") return;
    const humans = this.seatPlan.humanSeats(session.players);
    const seats: Record<string, string> = {};
    const updates: Record<string, unknown> = {};
    for (let slot = 0; slot < SocConfig.SEAT_COUNT; slot++) {
      const human = humans[slot];
      if (human) {
        seats["s" + slot] = human;
        continue;
      }
      const botId = "bot" + Math.random().toString(36).slice(2, 8);
      seats["s" + slot] = botId;
      const record: SocPlayerRecord = { nick: SocConfig.BOT_NAMES[slot], isBot: true, joinedAt: this.backend.now() + 1 + slot, slot, look: SocBotLooks.create(SocConfig.teamOfSlot(slot)) };
      updates["players/" + botId] = record;
    }
    const match: SocMatchRecord = { id: 1 + Math.floor(Math.random() * 1000000000), startAt: this.backend.now(), seats };
    Object.assign(updates, { match, status: "play", st: null, in: null, ball: null, game: null, end: null });
    session.ref.update(updates);
  }

  private returnToLobby(): void {
    const session = this.session;
    if (!session || !session.isHost()) return;
    const updates: Record<string, unknown> = { status: "lobby", match: null, ball: null, game: null, end: null, st: null, in: null };
    session.players.forEach((record, id) => { if (record.isBot) updates["players/" + id] = null; });
    session.ref.update(updates);
  }

  private leaveRoom(): void {
    if (this.session) this.session.leave();
    this.session = null;
    this.disposeMatch();
    this.showStart("");
  }

  private exitToStart(message: string): void {
    if (this.session) this.session.silentClose();
    this.session = null;
    this.disposeMatch();
    this.showStart(message);
  }

  private readonly loop = (timeMs: number): void => {
    this.step(timeMs);
    requestAnimationFrame(this.loop);
  };

  private step(timeMs: number): void {
    const deltaSeconds = Math.min(0.1, Math.max(0, (timeMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = timeMs;
    if (this.match) {
      this.backdrop.hide();
      this.match.update(deltaSeconds);
    } else {
      this.backdrop.show();
      this.backdrop.render(deltaSeconds);
    }
  }
}
