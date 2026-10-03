type VbBallKind = "hold" | "toss" | "serve" | "dig" | "set" | "over" | "spike" | "tip" | "net" | "land";
type VbRallyPhase = "serve" | "play" | "point" | "over";
type VbEnginePhase = "idle" | "serve" | "toss" | "play" | "dead" | "point" | "over";
type VbAimKind = "tip" | "drive" | "mid";
type VbAimMode = "random" | "gap" | "weakness";

interface VbVec { x: number; y: number; z: number }
interface VbPoint { x: number; z: number }
interface VbBallState { x: number; y: number; z: number; vx: number; vy: number; vz: number }

interface VbBallRecord extends VbBallState {
  at: number;
  seq: number;
  kind: VbBallKind;
  by: number;
  n: number;
  to: number;
  ry: number;
  next: number;
  hold: number;
}

interface VbRallyRecord {
  n: number;
  phase: VbRallyPhase;
  at: number;
  serveTeam: number;
  server: number;
  sa: number;
  sb: number;
  winner: number;
  why: string;
  lx: number;
  lz: number;
}

interface VbIncoming { team: number; ry: number; atMs: number; x: number; z: number }
interface VbAimChoice { x: number; z: number; kind: VbAimKind }
interface VbCrossing { t: number; x: number; z: number }

type VbEvent = { type: "ball"; ball: VbBallRecord } | { type: "rally"; rally: VbRallyRecord };

class VbConfig {
  static readonly ROOT = "volleyball/rooms";
  static readonly HALF_W = 4.5;
  static readonly HALF_L = 9;
  static readonly NET_TOP = 2.2;
  static readonly BALL_R = 0.3;
  static readonly GRAVITY = 11;
  static readonly WIN_SCORE = 11;
  static readonly MOVE_SPEED = 5.6;
  static readonly RECEIVE_RADIUS = 1.6;
  static readonly REACH: readonly number[] = [1.0, 1.9, 2.4];
  static readonly MAX_TOUCHES = 3;
  static readonly SEAT_COUNT = 4;
  static readonly SPECTATOR_SLOT = 4;
  static readonly COUNTDOWN_MS = 3500;
  static readonly SERVE_PREP_MS = 1300;
  static readonly SERVE_WAIT_MS = 12000;
  static readonly POINT_MS = 2400;
  static readonly TOSS_SPEED = 5.8;
  static readonly SERVE_HAND_Y = 1.3;
  static readonly SERVE_FLIGHT = 1.7;
  static readonly SERVE_SCATTER = 2.8;
  static readonly SERVE_TIMING_WINDOW_MS = 450;
  static readonly INTENT_WINDOW_MS = 700;
  static readonly SPIKE_LEAD_MS = 220;
  static readonly SPIKE_LEAD_WINDOW_MS = 450;
  static readonly NET_MS = 143;
  static readonly BOT_THINK_MS = 100;
  static readonly SUB_STEP = 1 / 90;
  static readonly TEAM_NAMES: readonly string[] = ["빨강 팀", "파랑 팀"];
  static readonly TEAM_COLORS: readonly string[] = ["#E5484D", "#3E8EF0"];
  static readonly TEAM_TOP_COLOR_INDEX: readonly number[] = [0, 5];
  static readonly BOT_NAMES: readonly string[] = ["봇 1", "봇 2", "봇 3", "봇 4"];

  static teamOfSlot(slot: number): number {
    return slot < 2 ? 0 : 1;
  }

  static sideOf(team: number): number {
    return team === 0 ? 1 : -1;
  }
}

class VbMath {
  static clamp(value: number, low: number, high: number): number {
    return value < low ? low : value > high ? high : value;
  }

  static lerp(from: number, to: number, ratio: number): number {
    return from + (to - from) * ratio;
  }

  static round3(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  static gaussian(random: () => number): number {
    return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  }

  static discOffset(radius: number, random: () => number): VbPoint {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius;
    return { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
  }

  static angleDifference(a: number, b: number): number {
    let difference = a - b;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    return difference;
  }
}

class VbBallPhysics {
  static positionAt(ball: VbBallState, seconds: number): VbVec {
    const g = VbConfig.GRAVITY;
    return {
      x: ball.x + ball.vx * seconds,
      y: ball.y + ball.vy * seconds - 0.5 * g * seconds * seconds,
      z: ball.z + ball.vz * seconds
    };
  }

  static crossing(ball: VbBallState, height: number): VbCrossing | null {
    const g = VbConfig.GRAVITY;
    const discriminant = ball.vy * ball.vy + 2 * g * (ball.y - height);
    if (discriminant < 0) return null;
    const seconds = (ball.vy + Math.sqrt(discriminant)) / g;
    if (seconds < 0) return null;
    return { t: seconds, x: ball.x + ball.vx * seconds, z: ball.z + ball.vz * seconds };
  }
}

class ShotAimer {
  private static readonly COARSE_X: readonly number[] = [-3.4, -1.7, 0, 1.7, 3.4];
  private static readonly FINE_X: readonly number[] = [-3.6, -2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7, 3.6];
  private static readonly MID_DEPTHS: readonly number[] = [2.5, 4.5, 6.5];
  private static readonly DEEP_DEPTHS: readonly number[] = [6.5, 7.8];
  private static readonly TIP_DEPTH = 1.6;

  static velocity(start: VbVec, target: VbVec, seconds: number): VbVec {
    const g = VbConfig.GRAVITY;
    return {
      x: (target.x - start.x) / seconds,
      y: (target.y - start.y + 0.5 * g * seconds * seconds) / seconds,
      z: (target.z - start.z) / seconds
    };
  }

  static clearance(start: VbVec, velocity: VbVec): number {
    if (Math.abs(velocity.z) < 1e-6) return Infinity;
    const seconds = -start.z / velocity.z;
    if (seconds <= 0) return Infinity;
    const height = start.y + velocity.y * seconds - 0.5 * VbConfig.GRAVITY * seconds * seconds;
    return height - (VbConfig.NET_TOP + VbConfig.BALL_R);
  }

  static clearingFlight(start: VbVec, target: VbVec, minSeconds: number): number {
    let seconds = minSeconds;
    while (seconds < 1.7 && ShotAimer.clearance(start, ShotAimer.velocity(start, target, seconds)) < 0.12) seconds += 0.05;
    return seconds;
  }

  static chooseTarget(team: number, playerX: number, playerZ: number, stickX: number, stickZ: number, opponents: readonly VbPoint[], assist: boolean, fine: boolean = false): VbAimChoice {
    const side = VbConfig.sideOf(team);
    const forward = -stickZ * side;
    const kind: VbAimKind = forward < -0.45 ? "tip" : forward > 0.45 ? "drive" : "mid";
    const depths = kind === "tip" ? [ShotAimer.TIP_DEPTH] : kind === "drive" ? ShotAimer.DEEP_DEPTHS : ShotAimer.MID_DEPTHS;
    const forcedX = Math.abs(stickX) > 0.3 ? VbMath.clamp(stickX * 3.8, -3.8, 3.8) : null;
    const columns = forcedX !== null ? [forcedX] : fine ? ShotAimer.FINE_X : ShotAimer.COARSE_X;
    if (!assist) return { x: forcedX !== null ? forcedX : 0, z: -side * (kind === "tip" ? ShotAimer.TIP_DEPTH : kind === "drive" ? 7 : 4.5), kind };
    let best: VbAimChoice = { x: columns[0], z: -side * depths[0], kind };
    let bestScore = -1;
    for (const x of columns) {
      for (const depth of depths) {
        const z = -side * depth;
        let score = opponents.length ? Infinity : 10;
        for (const opponent of opponents) score = Math.min(score, Math.hypot(x - opponent.x, z - opponent.z));
        score -= Math.abs(x - playerX) * 0.02;
        if (score > bestScore) {
          bestScore = score;
          best = { x, z, kind };
        }
      }
    }
    return best;
  }
}

class VbCourtLayout {
  static homeSpot(slot: number, serveTeam: number, serverSlot: number): VbPoint {
    const team = VbConfig.teamOfSlot(slot);
    const side = VbConfig.sideOf(team);
    if (team === serveTeam) {
      return slot === serverSlot ? { x: 3.4, z: side * 8.7 } : { x: -2.0, z: side * 4.5 };
    }
    return VbCourtLayout.defendSpot(slot);
  }

  static defendSpot(slot: number): VbPoint {
    const side = VbConfig.sideOf(VbConfig.teamOfSlot(slot));
    return { x: slot % 2 === 0 ? -2.1 : 2.1, z: side * 5.2 };
  }

  static supportSpot(slot: number, ballX: number): VbPoint {
    const side = VbConfig.sideOf(VbConfig.teamOfSlot(slot));
    return { x: ballX > 0 ? -1.6 : 1.6, z: side * 2.7 };
  }

  static facingYaw(team: number): number {
    return VbConfig.sideOf(team) > 0 ? Math.PI : 0;
  }
}

abstract class VbPlayerController {
  x = 0;
  z = 0;
  yaw = 0;
  moving = false;
  ix = 0;
  iz = 0;
  aimX = 0;
  aimZ = 0;
  locked = false;
  botTarget: VbPoint | null = null;
  pressMs = -1;
  pressSeq = 0;
  consumedSeq = 0;
  pressAimX = 0;
  pressAimZ = 0;

  constructor(readonly slot: number) {}

  get team(): number {
    return VbConfig.teamOfSlot(this.slot);
  }

  abstract poll(engine: VbRallyEngine | null, dtSec: number, nowMs: number): void;

  step(dtSec: number): void {
    if (this.locked) {
      this.moving = false;
      return;
    }
    const length = Math.hypot(this.ix, this.iz);
    if (length > 0.05) {
      const strength = Math.min(1, length);
      this.x += (this.ix / length) * strength * VbConfig.MOVE_SPEED * dtSec;
      this.z += (this.iz / length) * strength * VbConfig.MOVE_SPEED * dtSec;
      this.yaw = Math.atan2(this.ix, this.iz);
      this.moving = true;
    } else {
      this.moving = false;
    }
    this.clampToHalf();
  }

  clampToHalf(): void {
    const side = VbConfig.sideOf(this.team);
    this.x = VbMath.clamp(this.x, -VbConfig.HALF_W + 0.2, VbConfig.HALF_W - 0.2);
    const near = 0.5, far = VbConfig.HALF_L + 0.4;
    this.z = side > 0 ? VbMath.clamp(this.z, near, far) : VbMath.clamp(this.z, -far, -near);
  }

  teleport(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.ix = this.iz = 0;
    this.moving = false;
    this.yaw = VbCourtLayout.facingYaw(this.team);
  }

  registerPress(ms: number, aimX: number, aimZ: number): void {
    this.pressMs = ms;
    this.pressAimX = aimX;
    this.pressAimZ = aimZ;
    this.pressSeq++;
  }

  hasPendingPress(): boolean {
    return this.pressSeq > this.consumedSeq;
  }

  hasIntent(nowMs: number): boolean {
    return this.hasPendingPress() && this.pressMs >= nowMs - VbConfig.INTENT_WINDOW_MS && this.pressMs <= nowMs + 120;
  }

  consumePress(): number {
    this.consumedSeq = this.pressSeq;
    return this.pressMs;
  }

  discardOldPress(): void {
    this.consumedSeq = this.pressSeq;
  }
}

class VbRemoteController extends VbPlayerController {
  targetX = 0;
  targetZ = 0;

  poll(engine: VbRallyEngine | null, dtSec: number): void {
    const follow = Math.min(1, dtSec * 12);
    this.x = VbMath.lerp(this.x, this.targetX, follow);
    this.z = VbMath.lerp(this.z, this.targetZ, follow);
  }

  step(): void {}

  receive(x: number, z: number, yaw: number, moving: boolean, ix: number, iz: number, aimX: number, aimZ: number): void {
    this.targetX = x;
    this.targetZ = z;
    this.yaw = yaw;
    this.moving = moving;
    this.ix = ix;
    this.iz = iz;
    this.aimX = aimX;
    this.aimZ = aimZ;
  }

  teleport(x: number, z: number): void {
    super.teleport(x, z);
    this.targetX = x;
    this.targetZ = z;
  }
}

class VbBotDifficulty {
  static readonly LEVELS: readonly VbBotDifficulty[] = [
    new VbBotDifficulty("쉬움", 0.35, 0.8, 160, 0.55, 0, 0.1, "random"),
    new VbBotDifficulty("보통", 0.2, 0.5, 90, 0.8, 0.1, 0.12, "gap"),
    new VbBotDifficulty("어려움", 0.1, 0.3, 40, 1, 0.35, 0.09, "weakness")
  ];

  constructor(
    readonly name: string,
    readonly reactionSec: number,
    readonly predictError: number,
    readonly timingErrorMs: number,
    readonly spikeChance: number,
    readonly overChance: number,
    readonly missChance: number,
    readonly aimMode: VbAimMode
  ) {}

  static byIndex(index: number): VbBotDifficulty {
    return VbBotDifficulty.LEVELS[VbMath.clamp(Math.floor(index) || 0, 0, VbBotDifficulty.LEVELS.length - 1)];
  }
}

class VbBotAimer {
  static choose(bot: VbPlayerController, difficulty: VbBotDifficulty, opponents: readonly VbPoint[], random: () => number): VbPoint {
    if (difficulty.aimMode === "random") {
      const side = VbConfig.sideOf(bot.team);
      return { x: (random() * 2 - 1) * 3.6, z: -side * (2 + random() * 5.5) };
    }
    const choice = ShotAimer.chooseTarget(bot.team, bot.x, bot.z, 0, 0, opponents, true, difficulty.aimMode === "weakness");
    return { x: choice.x, z: choice.z };
  }
}

class VolleyballBot extends VbPlayerController {
  private nextThinkMs = 0;
  private goal: VbPoint | null = null;
  private seenBallSeq = -1;
  private readyAtMs = 0;
  private noiseX = 0;
  private noiseZ = 0;
  private wantsPress = false;
  private pressLeadMs = VbConfig.SPIKE_LEAD_MS;
  private pressedForSeq = -1;
  private serveRally = -1;
  private tossReadyMs = 0;
  private tossed = false;
  private hitOffsetMs = 0;

  constructor(slot: number, readonly difficulty: VbBotDifficulty, private readonly random: () => number) {
    super(slot);
  }

  poll(engine: VbRallyEngine | null, dtSec: number, nowMs: number): void {
    if (!engine) return;
    if (nowMs >= this.nextThinkMs) {
      this.nextThinkMs = nowMs + VbConfig.BOT_THINK_MS;
      this.think(engine, nowMs);
    }
    if (engine.phase === "toss" && engine.serverSlot() === this.slot) this.finishServe(engine, nowMs);
    this.steer();
    this.step(dtSec);
  }

  private think(engine: VbRallyEngine, nowMs: number): void {
    if (engine.phase === "serve" || engine.phase === "toss") {
      if (engine.serverSlot() === this.slot) {
        this.thinkServe(engine, nowMs);
        return;
      }
      this.goal = VbCourtLayout.homeSpot(this.slot, engine.serveTeam, engine.serverSlot());
      return;
    }
    if (engine.phase !== "play") {
      this.goal = null;
      return;
    }
    const incoming = engine.incoming;
    if (!incoming || incoming.team !== this.team) {
      this.goal = VbCourtLayout.defendSpot(this.slot);
      return;
    }
    if (engine.ballSeq !== this.seenBallSeq) this.onNewBall(engine, nowMs);
    if (engine.canTouch(this.slot) && this.isDesignatedReceiver(engine, incoming)) {
      if (nowMs >= this.readyAtMs) this.goal = { x: incoming.x + this.noiseX, z: incoming.z + this.noiseZ };
      this.thinkPress(engine, incoming, nowMs);
    } else {
      this.goal = VbCourtLayout.supportSpot(this.slot, engine.ball.x);
    }
  }

  private onNewBall(engine: VbRallyEngine, nowMs: number): void {
    const level = this.difficulty;
    this.seenBallSeq = engine.ballSeq;
    this.readyAtMs = nowMs + level.reactionSec * 1000 * (0.8 + this.random() * 0.4);
    this.noiseX = VbMath.gaussian(this.random) * level.predictError;
    this.noiseZ = VbMath.gaussian(this.random) * level.predictError;
    if (this.random() < level.missChance) {
      this.noiseX += (this.random() < 0.5 ? -1 : 1) * (2.2 + this.random());
      this.noiseZ += (this.random() < 0.5 ? -1 : 1) * (1.5 + this.random());
    }
    const done = engine.possTouches;
    this.wantsPress = done === 2 ? this.random() < level.spikeChance : done === 1 ? this.wantsOver(engine, level) : false;
    this.pressLeadMs = VbConfig.SPIKE_LEAD_MS + VbMath.gaussian(this.random) * level.timingErrorMs;
  }

  private wantsOver(engine: VbRallyEngine, level: VbBotDifficulty): boolean {
    if (level.overChance <= 0) return false;
    if (level.aimMode !== "weakness") return this.random() < level.overChance;
    const partner = engine.partnerOf(this.slot);
    return !!partner && Math.hypot(partner.x - engine.ball.x, partner.z - engine.ball.z) > 5.5;
  }

  private isDesignatedReceiver(engine: VbRallyEngine, incoming: VbIncoming): boolean {
    let nearest = -1;
    let nearestDistance = Infinity;
    for (const other of engine.players) {
      if (!engine.canTouch(other.slot)) continue;
      const distance = Math.hypot(other.x - incoming.x, other.z - incoming.z);
      if (distance < nearestDistance - 1e-6) {
        nearestDistance = distance;
        nearest = other.slot;
      }
    }
    return nearest === this.slot;
  }

  private thinkPress(engine: VbRallyEngine, incoming: VbIncoming, nowMs: number): void {
    if (!this.wantsPress || this.pressedForSeq === engine.ballSeq) return;
    if (incoming.atMs - nowMs > this.pressLeadMs) return;
    this.pressedForSeq = engine.ballSeq;
    this.botTarget = VbBotAimer.choose(this, this.difficulty, engine.opponentsOf(this.team), this.random);
    this.registerPress(nowMs, this.botTarget.x, this.botTarget.z);
  }

  private thinkServe(engine: VbRallyEngine, nowMs: number): void {
    this.goal = null;
    if (this.serveRally !== engine.rallyNo) {
      this.serveRally = engine.rallyNo;
      this.tossed = false;
      this.tossReadyMs = engine.serveReadyMs + 600 + this.random() * 800;
      this.hitOffsetMs = VbMath.gaussian(this.random) * this.difficulty.timingErrorMs;
    }
    if (engine.phase === "serve" && !this.tossed && nowMs >= this.tossReadyMs) {
      this.tossed = true;
      this.registerPress(nowMs, 0, 0);
    }
  }

  private finishServe(engine: VbRallyEngine, nowMs: number): void {
    if (this.pressSeq > this.consumedSeq || nowMs < engine.tossApexMs + this.hitOffsetMs) return;
    this.botTarget = VbBotAimer.choose(this, this.difficulty, engine.opponentsOf(this.team), this.random);
    this.registerPress(nowMs, this.botTarget.x, this.botTarget.z);
  }

  private steer(): void {
    if (this.locked || !this.goal) {
      this.ix = this.iz = 0;
      return;
    }
    const dx = this.goal.x - this.x, dz = this.goal.z - this.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.12) {
      this.ix = this.iz = 0;
      return;
    }
    const strength = Math.min(1, distance / 0.6);
    this.ix = (dx / distance) * strength;
    this.iz = (dz / distance) * strength;
  }
}

class VbRallyEngine {
  readonly score: number[] = [0, 0];
  readonly ball: VbBallState = { x: 0, y: 1.3, z: 0, vx: 0, vy: 0, vz: 0 };
  phase: VbEnginePhase = "idle";
  serveTeam = 0;
  rallyNo = 0;
  ballSeq = 0;
  serveReadyMs = 0;
  tossApexMs = 0;
  touchTeam = -1;
  possTouches = 0;
  lastBy = -1;
  lastTouchTeam = -1;
  incoming: VbIncoming | null = null;
  winner = -1;
  private readonly serverIndex: number[] = [0, 0];
  private readonly events: VbEvent[] = [];
  private tossStartMs = 0;
  private tossBall: VbBallState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  private autoServe = false;
  private deadReason = "";
  private pointAtMs = 0;
  private ballKind: VbBallKind = "hold";
  private ballTo = -1;
  private ballRy = 0;
  private ballNext = -1;
  private ballBy = -1;
  private ballCount = 0;

  constructor(readonly players: readonly VbPlayerController[], private readonly random: () => number) {}

  serverSlot(): number {
    return this.serveTeam * 2 + this.serverIndex[this.serveTeam];
  }

  partnerOf(slot: number): VbPlayerController | null {
    return this.players.find((other) => other.team === VbConfig.teamOfSlot(slot) && other.slot !== slot) || null;
  }

  opponentsOf(team: number): VbPoint[] {
    return this.players.filter((other) => other.team !== team).map((other) => ({ x: other.x, z: other.z }));
  }

  canTouch(slot: number): boolean {
    const player = this.players[slot];
    if (!player || this.touchTeam !== player.team) return false;
    return !(this.lastTouchTeam === this.touchTeam && this.lastBy === slot);
  }

  begin(nowMs: number): VbEvent[] {
    this.events.length = 0;
    this.score[0] = this.score[1] = 0;
    this.serverIndex[0] = this.serverIndex[1] = 0;
    this.serveTeam = 0;
    this.rallyNo = 0;
    this.winner = -1;
    this.startRally(nowMs, nowMs + VbConfig.COUNTDOWN_MS);
    return this.events;
  }

  update(dtSec: number, nowMs: number): VbEvent[] {
    this.events.length = 0;
    if (this.phase === "serve") this.updateServe(nowMs);
    else if (this.phase === "toss") {
      this.advance(dtSec, nowMs);
      if (this.phase === "toss") this.updateToss(nowMs);
    } else if (this.phase === "play" || this.phase === "dead") this.advance(dtSec, nowMs);
    else if (this.phase === "point") this.updatePoint(nowMs);
    return this.events;
  }

  rallyRecord(phase: VbRallyPhase, atMs: number, winner: number, why: string, lx: number, lz: number): VbRallyRecord {
    return { n: this.rallyNo, phase, at: Math.round(atMs), serveTeam: this.serveTeam, server: this.serverSlot(), sa: this.score[0], sb: this.score[1], winner, why, lx: VbMath.round3(lx), lz: VbMath.round3(lz) };
  }

  private startRally(nowMs: number, readyMs: number): void {
    this.rallyNo++;
    this.phase = "serve";
    this.serveReadyMs = readyMs;
    this.autoServe = false;
    this.deadReason = "";
    this.touchTeam = -1;
    this.possTouches = 0;
    this.lastBy = -1;
    this.lastTouchTeam = -1;
    this.incoming = null;
    const server = this.serverSlot();
    for (const player of this.players) {
      const spot = VbCourtLayout.homeSpot(player.slot, this.serveTeam, server);
      player.teleport(spot.x, spot.z);
      player.locked = player.slot === server;
      player.botTarget = null;
      player.discardOldPress();
    }
    const hand = this.players[server];
    this.ball.x = hand.x;
    this.ball.y = VbConfig.SERVE_HAND_Y;
    this.ball.z = hand.z;
    this.ball.vx = this.ball.vy = this.ball.vz = 0;
    this.events.push({ type: "rally", rally: this.rallyRecord("serve", readyMs, -1, "", 0, 0) });
    this.emitBall("hold", -1, 0, -1, 0, -1, nowMs, 1);
  }

  private updateServe(nowMs: number): void {
    if (nowMs < this.serveReadyMs) return;
    const server = this.players[this.serverSlot()];
    if (server.hasPendingPress()) {
      const ms = server.consumePress();
      if (ms >= this.serveReadyMs) {
        this.startToss(Math.min(ms, nowMs), nowMs);
        return;
      }
    }
    if (nowMs >= this.serveReadyMs + VbConfig.SERVE_WAIT_MS) {
      this.autoServe = true;
      this.startToss(nowMs, nowMs);
    }
  }

  private startToss(startMs: number, nowMs: number): void {
    const server = this.players[this.serverSlot()];
    this.phase = "toss";
    this.tossStartMs = startMs;
    this.tossApexMs = startMs + (VbConfig.TOSS_SPEED / VbConfig.GRAVITY) * 1000;
    this.tossBall = { x: server.x, y: VbConfig.SERVE_HAND_Y, z: server.z, vx: 0, vy: VbConfig.TOSS_SPEED, vz: 0 };
    this.setBall(this.tossBall);
    this.emitBall("toss", server.slot, 0, -1, 0, -1, startMs, 0);
    this.advance((nowMs - startMs) / 1000, nowMs);
  }

  private updateToss(nowMs: number): void {
    const server = this.players[this.serverSlot()];
    if (server.hasPendingPress()) {
      const ms = server.consumePress();
      if (ms >= this.tossStartMs + 100) {
        const quality = VbMath.clamp(1 - Math.abs(ms - this.tossApexMs) / VbConfig.SERVE_TIMING_WINDOW_MS, 0, 1);
        this.serveHit(ms, quality, nowMs);
        return;
      }
    }
    if (this.autoServe && nowMs >= this.tossApexMs) this.serveHit(this.tossApexMs, 0.55, nowMs);
  }

  private serveHit(atMs: number, quality: number, nowMs: number): void {
    const server = this.players[this.serverSlot()];
    const team = server.team;
    const side = VbConfig.sideOf(team);
    const start = VbBallPhysics.positionAt(this.tossBall, Math.max(0, (atMs - this.tossStartMs) / 1000));
    start.y = Math.max(start.y, 0.9);
    let aim: VbPoint | null = server.botTarget;
    if (!aim && -side * server.pressAimZ > 0.5 && Math.abs(server.pressAimX) < 6) aim = { x: server.pressAimX, z: server.pressAimZ };
    if (!aim) {
      const choice = ShotAimer.chooseTarget(team, server.x, server.z, 0, 0, this.opponentsOf(team), true);
      aim = { x: choice.x, z: choice.z };
    }
    const scatter = VbMath.discOffset((1 - quality) * VbConfig.SERVE_SCATTER, this.random);
    const target: VbVec = {
      x: VbMath.clamp(aim.x + scatter.x, -VbConfig.HALF_W - 1.5, VbConfig.HALF_W + 1.5),
      y: VbConfig.BALL_R,
      z: VbMath.clamp(aim.z + scatter.z, -VbConfig.HALF_L - 2, VbConfig.HALF_L + 2)
    };
    let flight = VbConfig.SERVE_FLIGHT;
    if (quality < 0.25 && this.random() < 0.6) {
      target.z = -side * 0.5;
      flight = 1.1;
    } else if (quality >= 0.25) {
      flight = ShotAimer.clearingFlight(start, target, VbConfig.SERVE_FLIGHT);
    }
    const velocity = ShotAimer.velocity(start, target, flight);
    this.setBall({ x: start.x, y: start.y, z: start.z, vx: velocity.x, vy: velocity.y, vz: velocity.z });
    this.lastBy = server.slot;
    this.lastTouchTeam = team;
    this.touchTeam = 1 - team;
    this.possTouches = 0;
    server.locked = false;
    server.botTarget = null;
    this.phase = "play";
    this.events.push({ type: "rally", rally: this.rallyRecord("play", atMs, -1, "", 0, 0) });
    this.emitBall("serve", server.slot, 0, this.touchTeam, VbConfig.REACH[0], -1, atMs, 0);
    this.recomputeIncoming(atMs);
    this.advance((nowMs - atMs) / 1000, nowMs);
  }

  private advance(dtSec: number, nowMs: number): void {
    if (dtSec <= 0) return;
    const count = Math.max(1, Math.ceil(dtSec / VbConfig.SUB_STEP));
    const step = dtSec / count;
    const startMs = nowMs - dtSec * 1000;
    for (let index = 0; index < count; index++) {
      const ms = startMs + (index + 1) * step * 1000;
      this.stepBall(step, ms);
      if (this.phase === "point" || this.phase === "over") return;
    }
  }

  private stepBall(step: number, ms: number): void {
    const ball = this.ball;
    const g = VbConfig.GRAVITY;
    const previousX = ball.x, previousY = ball.y, previousZ = ball.z;
    ball.x += ball.vx * step;
    ball.z += ball.vz * step;
    ball.y += ball.vy * step - 0.5 * g * step * step;
    ball.vy -= g * step;
    if (this.phase === "toss") {
      if (ball.vy < 0 && ball.y < 0.85) this.settlePoint(this.serveTeam, "서브 실패", ball.x, ball.z, ms);
      return;
    }
    if (this.phase === "play" && previousZ * ball.z < 0) this.checkNet(previousX, previousY, previousZ, ms);
    if (ball.y <= VbConfig.BALL_R && ball.vy < 0) {
      this.land(ms);
      return;
    }
    if (this.phase === "play") this.checkTouch(ms);
  }

  private checkNet(previousX: number, previousY: number, previousZ: number, ms: number): void {
    const ball = this.ball;
    const fraction = previousZ / (previousZ - ball.z);
    const crossingX = previousX + (ball.x - previousX) * fraction;
    const crossingY = previousY + (ball.y - previousY) * fraction;
    if (Math.abs(crossingX) > VbConfig.HALF_W + 0.6) return;
    if (crossingY - VbConfig.BALL_R >= VbConfig.NET_TOP) return;
    this.phase = "dead";
    this.deadReason = "네트";
    this.touchTeam = -1;
    ball.x = crossingX;
    ball.y = Math.max(crossingY, 0.6);
    ball.z = 0;
    ball.vx *= 0.15;
    ball.vz = (previousZ > 0 ? 1 : -1) * 0.5;
    ball.vy = Math.min(ball.vy, 0);
    this.incoming = null;
    this.emitBall("net", this.lastBy, this.possTouches, -1, 0, -1, ms, 0);
  }

  private land(ms: number): void {
    const ball = this.ball;
    const outside = Math.abs(ball.x) > VbConfig.HALF_W || Math.abs(ball.z) > VbConfig.HALF_L;
    if (this.deadReason) this.settlePoint(this.lastTouchTeam, this.deadReason, ball.x, ball.z, ms);
    else if (outside) this.settlePoint(this.lastTouchTeam, "아웃", ball.x, ball.z, ms);
    else this.settlePoint(ball.z > 0 ? 0 : 1, "바닥", ball.x, ball.z, ms);
  }

  private settlePoint(loser: number, why: string, landX: number, landZ: number, ms: number): void {
    const winner = 1 - loser;
    this.score[winner]++;
    if (winner !== this.serveTeam) {
      this.serveTeam = winner;
      this.serverIndex[winner] = 1 - this.serverIndex[winner];
    }
    this.phase = "point";
    this.pointAtMs = ms;
    this.touchTeam = -1;
    this.incoming = null;
    this.ball.x = landX;
    this.ball.y = VbConfig.BALL_R;
    this.ball.z = landZ;
    this.ball.vx = this.ball.vy = this.ball.vz = 0;
    for (const player of this.players) player.locked = false;
    this.winner = winner;
    this.emitBall("land", this.lastBy, 0, -1, 0, -1, ms, 1);
    this.events.push({ type: "rally", rally: this.rallyRecord("point", ms, winner, why, landX, landZ) });
  }

  private updatePoint(nowMs: number): void {
    if (nowMs - this.pointAtMs < VbConfig.POINT_MS) return;
    if (this.score[0] >= VbConfig.WIN_SCORE || this.score[1] >= VbConfig.WIN_SCORE) {
      this.phase = "over";
      this.winner = this.score[0] > this.score[1] ? 0 : 1;
      this.events.push({ type: "rally", rally: this.rallyRecord("over", nowMs, this.winner, "", 0, 0) });
      return;
    }
    this.startRally(nowMs, nowMs + VbConfig.SERVE_PREP_MS);
  }

  private checkTouch(ms: number): void {
    const ball = this.ball;
    if (this.touchTeam < 0 || ball.vy >= 0 || this.possTouches >= VbConfig.MAX_TOUCHES) return;
    if ((ball.z > 0 ? 0 : 1) !== this.touchTeam) return;
    if (ball.y > VbConfig.REACH[this.possTouches] || ball.y < 0.35) return;
    const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
    const radius = VbConfig.RECEIVE_RADIUS * (1 - 0.6 * VbMath.clamp((speed - 8) / 8, 0, 1));
    let best: VbPlayerController | null = null;
    let bestDistance = Infinity;
    for (const player of this.players) {
      if (!this.canTouch(player.slot)) continue;
      const distance = Math.hypot(player.x - ball.x, player.z - ball.z);
      if (distance <= radius && distance < bestDistance) {
        best = player;
        bestDistance = distance;
      }
    }
    if (best) this.touch(best, bestDistance, radius, ms);
  }

  private touch(player: VbPlayerController, distance: number, radius: number, ms: number): void {
    const team = player.team;
    const count = this.possTouches;
    const quality = VbMath.clamp(1 - distance / radius, 0, 1);
    const intent = count >= 1 && player.hasIntent(ms);
    const lead = intent ? ms - player.consumePress() : 0;
    const from: VbVec = { x: this.ball.x, y: this.ball.y, z: this.ball.z };
    const partner = this.partnerOf(player.slot) as VbPlayerController;
    if (count === 0 || (count === 1 && !intent)) {
      this.passToPartner(player, partner, from, count, quality, ms);
      return;
    }
    const opponents = this.opponentsOf(team);
    if (count === 2 && intent) this.attack(player, from, opponents, quality, lead, ms);
    else this.sendOver(player, from, opponents, quality, ms, "over");
  }

  private passToPartner(player: VbPlayerController, partner: VbPlayerController, from: VbVec, count: number, quality: number, ms: number): void {
    const side = VbConfig.sideOf(player.team);
    const spread = VbMath.discOffset(0.25 + (1 - quality) * 2.2, this.random);
    const baseZ = VbMath.clamp(Math.abs(partner.z) - 0.9, 1.2, 8.4);
    const target: VbVec = {
      x: VbMath.clamp(partner.x + spread.x, -VbConfig.HALF_W + 0.2, VbConfig.HALF_W - 0.2),
      y: VbConfig.REACH[count + 1],
      z: side * VbMath.clamp(Math.abs(side * baseZ + spread.z), 0.8, VbConfig.HALF_L - 0.3)
    };
    const flight = count === 0 ? 1.35 : 1.25;
    this.release(player, from, target, flight, count === 0 ? "dig" : "set", player.team, VbConfig.REACH[count + 1], partner.slot, ms);
  }

  private aimFor(player: VbPlayerController, opponents: readonly VbPoint[]): VbAimChoice {
    if (player.botTarget) return { x: player.botTarget.x, z: player.botTarget.z, kind: "mid" };
    return ShotAimer.chooseTarget(player.team, player.x, player.z, player.ix, player.iz, opponents, true);
  }

  private sendOver(player: VbPlayerController, from: VbVec, opponents: readonly VbPoint[], quality: number, ms: number, kind: VbBallKind): void {
    const aim = this.aimFor(player, opponents);
    const spread = VbMath.discOffset(0.3 + (1 - quality) * 1.4, this.random);
    const target: VbVec = { x: aim.x + spread.x, y: VbConfig.BALL_R, z: aim.z + spread.z };
    const flight = ShotAimer.clearingFlight(from, target, 1.65);
    this.release(player, from, target, flight, kind, 1 - player.team, VbConfig.REACH[0], -1, ms);
  }

  private attack(player: VbPlayerController, from: VbVec, opponents: readonly VbPoint[], quality: number, lead: number, ms: number): void {
    const aim = this.aimFor(player, opponents);
    const timing = VbMath.clamp(1 - Math.abs(lead - VbConfig.SPIKE_LEAD_MS) / VbConfig.SPIKE_LEAD_WINDOW_MS, 0, 1);
    const finalQuality = timing * (0.6 + 0.4 * quality);
    if (aim.kind === "tip" && !player.botTarget) {
      const spread = VbMath.discOffset(0.3 + (1 - finalQuality) * 0.8, this.random);
      const target: VbVec = { x: aim.x + spread.x, y: VbConfig.BALL_R, z: aim.z + spread.z };
      const flight = ShotAimer.clearingFlight(from, target, 1.0);
      this.release(player, from, target, flight, "tip", 1 - player.team, VbConfig.REACH[0], -1, ms);
      return;
    }
    const spread = VbMath.discOffset(0.2 + (1 - finalQuality) * 2.2, this.random);
    const target: VbVec = { x: aim.x + spread.x, y: VbConfig.BALL_R, z: aim.z + spread.z };
    const minimum = 0.4 + (1 - finalQuality) * 0.35;
    const flight = finalQuality < 0.2 ? minimum : ShotAimer.clearingFlight(from, target, minimum);
    this.release(player, from, target, flight, "spike", 1 - player.team, VbConfig.REACH[0], -1, ms);
  }

  private release(player: VbPlayerController, from: VbVec, target: VbVec, flight: number, kind: VbBallKind, to: number, reachHeight: number, next: number, ms: number): void {
    const velocity = ShotAimer.velocity(from, target, flight);
    this.ball.vx = velocity.x;
    this.ball.vy = velocity.y;
    this.ball.vz = velocity.z;
    const count = this.possTouches + 1;
    this.lastBy = player.slot;
    this.lastTouchTeam = player.team;
    this.touchTeam = to;
    this.possTouches = to === player.team ? count : 0;
    player.botTarget = null;
    this.emitBall(kind, player.slot, count, to, reachHeight, next, ms, 0);
    this.recomputeIncoming(ms);
  }

  private recomputeIncoming(ms: number): void {
    const crossing = this.ballTo >= 0 ? VbBallPhysics.crossing(this.ball, this.ballRy) : null;
    this.incoming = crossing ? { team: this.ballTo, ry: this.ballRy, atMs: ms + crossing.t * 1000, x: crossing.x, z: crossing.z } : null;
  }

  private setBall(state: VbBallState): void {
    this.ball.x = state.x;
    this.ball.y = state.y;
    this.ball.z = state.z;
    this.ball.vx = state.vx;
    this.ball.vy = state.vy;
    this.ball.vz = state.vz;
  }

  private emitBall(kind: VbBallKind, by: number, count: number, to: number, reachHeight: number, next: number, ms: number, hold: number): void {
    this.ballKind = kind;
    this.ballBy = by;
    this.ballCount = count;
    this.ballTo = to;
    this.ballRy = reachHeight;
    this.ballNext = next;
    this.ballSeq++;
    const ball = this.ball;
    this.events.push({
      type: "ball",
      ball: {
        x: VbMath.round3(ball.x), y: VbMath.round3(ball.y), z: VbMath.round3(ball.z),
        vx: VbMath.round3(ball.vx), vy: VbMath.round3(ball.vy), vz: VbMath.round3(ball.vz),
        at: Math.round(ms), seq: this.ballSeq, kind, by, n: count, to, ry: reachHeight, next, hold
      }
    });
  }
}
