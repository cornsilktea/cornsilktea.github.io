"use strict";
class VbConfig {
    static teamOfSlot(slot) {
        return slot < 2 ? 0 : 1;
    }
    static sideOf(team) {
        return team === 0 ? 1 : -1;
    }
}
VbConfig.ROOT = "volleyball/rooms";
VbConfig.HALF_W = 4.5;
VbConfig.HALF_L = 9;
VbConfig.NET_TOP = 2.2;
VbConfig.BALL_R = 0.3;
VbConfig.GRAVITY = 11;
VbConfig.WIN_SCORE = 11;
VbConfig.MOVE_SPEED = 5.6;
VbConfig.RECEIVE_RADIUS = 1.6;
VbConfig.REACH = [1.0, 1.9, 3.0];
VbConfig.MAX_TOUCHES = 3;
VbConfig.SEAT_COUNT = 4;
VbConfig.SPECTATOR_SLOT = 4;
VbConfig.COUNTDOWN_MS = 3500;
VbConfig.SERVE_PREP_MS = 1300;
VbConfig.SERVE_WAIT_MS = 12000;
VbConfig.POINT_MS = 2400;
VbConfig.TOSS_SPEED = 5.8;
VbConfig.SERVE_HAND_Y = 1.3;
VbConfig.SERVE_FLIGHT = 1.7;
VbConfig.SERVE_SCATTER = 2.8;
VbConfig.SERVE_TIMING_WINDOW_MS = 450;
VbConfig.INTENT_WINDOW_MS = 700;
VbConfig.SPIKE_LEAD_MS = 220;
VbConfig.SPIKE_LEAD_WINDOW_MS = 450;
VbConfig.JUMP_MS = 700;
VbConfig.JUMP_HEIGHT = 0.9;
VbConfig.BLOCK_REACH = 2.4;
VbConfig.BLOCK_RADIUS = 0.95;
VbConfig.BLOCK_DISTANCE = 2.6;
VbConfig.BLOCK_FLIGHT = 0.8;
VbConfig.BLOCK_WINDOW_FROM = 0.05;
VbConfig.BLOCK_WINDOW_TO = 0.95;
VbConfig.QUICK_NET_CLEARANCE = 1.1;
VbConfig.NET_MS = 143;
VbConfig.BOT_THINK_MS = 100;
VbConfig.SUB_STEP = 1 / 90;
VbConfig.TEAM_NAMES = ["빨강 팀", "파랑 팀"];
VbConfig.TEAM_COLORS = ["#E5484D", "#3E8EF0"];
VbConfig.TEAM_TOP_COLOR_INDEX = [0, 5];
VbConfig.BOT_NAMES = ["봇 1", "봇 2", "봇 3", "봇 4"];
class VbMath {
    static clamp(value, low, high) {
        return value < low ? low : value > high ? high : value;
    }
    static lerp(from, to, ratio) {
        return from + (to - from) * ratio;
    }
    static round3(value) {
        return Math.round(value * 1000) / 1000;
    }
    static gaussian(random) {
        return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    }
    static discOffset(radius, random) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * radius;
        return { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
    }
    static angleDifference(a, b) {
        let difference = a - b;
        while (difference > Math.PI)
            difference -= Math.PI * 2;
        while (difference < -Math.PI)
            difference += Math.PI * 2;
        return difference;
    }
}
class VbBallPhysics {
    static positionAt(ball, seconds) {
        const g = VbConfig.GRAVITY;
        return {
            x: ball.x + ball.vx * seconds,
            y: ball.y + ball.vy * seconds - 0.5 * g * seconds * seconds,
            z: ball.z + ball.vz * seconds
        };
    }
    static crossing(ball, height) {
        const g = VbConfig.GRAVITY;
        const discriminant = ball.vy * ball.vy + 2 * g * (ball.y - height);
        if (discriminant < 0)
            return null;
        const seconds = (ball.vy + Math.sqrt(discriminant)) / g;
        if (seconds < 0)
            return null;
        return { t: seconds, x: ball.x + ball.vx * seconds, z: ball.z + ball.vz * seconds };
    }
}
class ShotAimer {
    static velocity(start, target, seconds) {
        const g = VbConfig.GRAVITY;
        return {
            x: (target.x - start.x) / seconds,
            y: (target.y - start.y + 0.5 * g * seconds * seconds) / seconds,
            z: (target.z - start.z) / seconds
        };
    }
    static clearance(start, velocity) {
        if (Math.abs(velocity.z) < 1e-6)
            return Infinity;
        const seconds = -start.z / velocity.z;
        if (seconds <= 0)
            return Infinity;
        const height = start.y + velocity.y * seconds - 0.5 * VbConfig.GRAVITY * seconds * seconds;
        return height - (VbConfig.NET_TOP + VbConfig.BALL_R);
    }
    static clearingFlight(start, target, minSeconds, requiredClearance = 0.12) {
        let seconds = minSeconds;
        while (seconds < 2 && ShotAimer.clearance(start, ShotAimer.velocity(start, target, seconds)) < requiredClearance)
            seconds += 0.05;
        return seconds;
    }
    static emptySpot(team, opponents, depths, fine = true) {
        const side = VbConfig.sideOf(team);
        const columns = fine ? ShotAimer.FINE_X : ShotAimer.COARSE_X;
        let best = { x: columns[0], z: -side * depths[0] };
        let bestScore = -1;
        for (const x of columns) {
            for (const depth of depths) {
                const z = -side * depth;
                let score = opponents.length ? Infinity : 10;
                for (const opponent of opponents)
                    score = Math.min(score, Math.hypot(x - opponent.x, z - opponent.z));
                if (score > bestScore) {
                    bestScore = score;
                    best = { x, z };
                }
            }
        }
        return best;
    }
}
ShotAimer.COARSE_X = [-3.4, -1.7, 0, 1.7, 3.4];
ShotAimer.FINE_X = [-3.6, -2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7, 3.6];
ShotAimer.SPIKE_DEPTHS = [5.5, 7.0, 8.0];
ShotAimer.NEAR_SPIKE_DEPTHS = [2.0, 3.0, 4.0];
ShotAimer.QUICK_DEPTHS = [3.5, 5.0, 6.5];
ShotAimer.LOB_DEPTHS = [2.5, 4.5, 6.5];
ShotAimer.SERVE_DEPTHS = [3.5, 5.5, 7.5];
class VbCourtLayout {
    static homeSpot(slot, serveTeam, serverSlot) {
        const team = VbConfig.teamOfSlot(slot);
        const side = VbConfig.sideOf(team);
        if (team === serveTeam) {
            return slot === serverSlot ? { x: 3.4, z: side * 8.7 } : { x: -2.0, z: side * 4.5 };
        }
        return VbCourtLayout.defendSpot(slot);
    }
    static defendSpot(slot) {
        const side = VbConfig.sideOf(VbConfig.teamOfSlot(slot));
        return { x: slot % 2 === 0 ? -2.1 : 2.1, z: side * 5.2 };
    }
    static supportSpot(slot, ballX) {
        const side = VbConfig.sideOf(VbConfig.teamOfSlot(slot));
        return { x: ballX > 0 ? -1.6 : 1.6, z: side * 2.7 };
    }
    static facingYaw(team) {
        return VbConfig.sideOf(team) > 0 ? Math.PI : 0;
    }
}
class VbPlayerController {
    constructor(slot) {
        this.slot = slot;
        this.x = 0;
        this.z = 0;
        this.yaw = 0;
        this.moving = false;
        this.ix = 0;
        this.iz = 0;
        this.aimX = 0;
        this.aimZ = 0;
        this.locked = false;
        this.jumpStartMs = -1e9;
        this.pressMs = -1;
        this.pressSeq = 0;
        this.consumedSeq = 0;
        this.pressAimX = 0;
        this.pressAimZ = 0;
    }
    get team() {
        return VbConfig.teamOfSlot(this.slot);
    }
    isJumping(nowMs) {
        return nowMs >= this.jumpStartMs && nowMs < this.jumpStartMs + VbConfig.JUMP_MS;
    }
    step(dtSec, nowMs = 0) {
        if (this.locked || this.isJumping(nowMs)) {
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
        }
        else {
            this.moving = false;
        }
        this.clampToHalf();
    }
    clampToHalf() {
        const side = VbConfig.sideOf(this.team);
        this.x = VbMath.clamp(this.x, -VbConfig.HALF_W + 0.2, VbConfig.HALF_W - 0.2);
        const near = 0.5, far = VbConfig.HALF_L + 0.4;
        this.z = side > 0 ? VbMath.clamp(this.z, near, far) : VbMath.clamp(this.z, -far, -near);
    }
    teleport(x, z) {
        this.x = x;
        this.z = z;
        this.ix = this.iz = 0;
        this.moving = false;
        this.yaw = VbCourtLayout.facingYaw(this.team);
    }
    registerPress(ms, aimX, aimZ) {
        this.pressMs = ms;
        this.pressAimX = aimX;
        this.pressAimZ = aimZ;
        this.pressSeq++;
    }
    hasPendingPress() {
        return this.pressSeq > this.consumedSeq;
    }
    hasIntent(nowMs) {
        return this.hasPendingPress() && this.pressMs >= nowMs - VbConfig.INTENT_WINDOW_MS && this.pressMs <= nowMs + 120;
    }
    consumePress() {
        this.consumedSeq = this.pressSeq;
        return this.pressMs;
    }
    discardOldPress() {
        this.consumedSeq = this.pressSeq;
    }
}
class VbRemoteController extends VbPlayerController {
    constructor() {
        super(...arguments);
        this.targetX = 0;
        this.targetZ = 0;
    }
    poll(engine, dtSec) {
        const follow = Math.min(1, dtSec * 12);
        this.x = VbMath.lerp(this.x, this.targetX, follow);
        this.z = VbMath.lerp(this.z, this.targetZ, follow);
    }
    step() { }
    receive(x, z, yaw, moving, ix, iz, aimX, aimZ, jumpStartMs) {
        if (jumpStartMs > this.jumpStartMs)
            this.jumpStartMs = jumpStartMs;
        this.targetX = x;
        this.targetZ = z;
        this.yaw = yaw;
        this.moving = moving;
        this.ix = ix;
        this.iz = iz;
        this.aimX = aimX;
        this.aimZ = aimZ;
    }
    teleport(x, z) {
        super.teleport(x, z);
        this.targetX = x;
        this.targetZ = z;
    }
}
class VbBotTuning {
}
VbBotTuning.REACTION_SEC = 0.1;
VbBotTuning.PREDICT_ERROR = 0.3;
VbBotTuning.TIMING_ERROR_MS = 40;
VbBotTuning.SPIKE_CHANCE = 1;
VbBotTuning.MISS_CHANCE = 0.03;
VbBotTuning.URGENT_PARTNER_DISTANCE = 5.5;
VbBotTuning.BLOCK_CHANCE = 0.4;
VbBotTuning.BLOCK_THREAT_DISTANCE = 2.2;
VbBotTuning.SPIKE_CHANCE_VS_BLOCK = 0.35;
VbBotTuning.BLOCK_NOISE = 0.4;
VbBotTuning.BLOCK_LEAD_MS = 200;
class VolleyballBot extends VbPlayerController {
    constructor(slot, random) {
        super(slot);
        this.random = random;
        this.nextThinkMs = 0;
        this.goal = null;
        this.seenBallSeq = -1;
        this.readyAtMs = 0;
        this.noiseX = 0;
        this.noiseZ = 0;
        this.wantsPress = false;
        this.pressLeadMs = VbConfig.SPIKE_LEAD_MS;
        this.pressedForSeq = -1;
        this.serveRally = -1;
        this.tossReadyMs = 0;
        this.tossed = false;
        this.hitOffsetMs = 0;
        this.blockPlanSeq = -1;
        this.blocks = false;
        this.blockNoise = 0;
        this.blockLeadMs = VbBotTuning.BLOCK_LEAD_MS;
    }
    poll(engine, dtSec, nowMs) {
        if (!engine)
            return;
        if (nowMs >= this.nextThinkMs) {
            this.nextThinkMs = nowMs + VbConfig.BOT_THINK_MS;
            this.think(engine, nowMs);
        }
        if (engine.phase === "toss" && engine.serverSlot() === this.slot)
            this.finishServe(engine, nowMs);
        this.steer();
        this.step(dtSec, nowMs);
    }
    think(engine, nowMs) {
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
        if (incoming && incoming.team !== this.team && engine.possTouches === 2 && engine.touchTeam === incoming.team && this.thinkBlock(engine, incoming, nowMs))
            return;
        if (!incoming || incoming.team !== this.team) {
            this.goal = VbCourtLayout.defendSpot(this.slot);
            return;
        }
        if (engine.ballSeq !== this.seenBallSeq)
            this.onNewBall(engine, nowMs);
        if (engine.canTouch(this.slot) && this.isDesignatedReceiver(engine, incoming)) {
            if (nowMs >= this.readyAtMs)
                this.goal = { x: incoming.x + this.noiseX, z: incoming.z + this.noiseZ };
            this.thinkPress(engine, incoming, nowMs);
        }
        else {
            this.goal = VbCourtLayout.supportSpot(this.slot, engine.ball.x);
        }
    }
    onNewBall(engine, nowMs) {
        this.seenBallSeq = engine.ballSeq;
        this.readyAtMs = nowMs + VbBotTuning.REACTION_SEC * 1000 * (0.8 + this.random() * 0.4);
        this.noiseX = VbMath.gaussian(this.random) * VbBotTuning.PREDICT_ERROR;
        this.noiseZ = VbMath.gaussian(this.random) * VbBotTuning.PREDICT_ERROR;
        if (this.random() < VbBotTuning.MISS_CHANCE) {
            this.noiseX += (this.random() < 0.5 ? -1 : 1) * (2.2 + this.random());
            this.noiseZ += (this.random() < 0.5 ? -1 : 1) * (1.5 + this.random());
        }
        const done = engine.possTouches;
        this.wantsPress = done === 2 ? this.random() < VbBotTuning.SPIKE_CHANCE : done === 1 ? this.wantsOver(engine) : false;
        this.pressLeadMs = VbConfig.SPIKE_LEAD_MS + VbMath.gaussian(this.random) * VbBotTuning.TIMING_ERROR_MS;
    }
    blockThreatened(engine, nowMs) {
        return engine.players.some((other) => other.team !== this.team && (other.isJumping(nowMs) || Math.abs(other.z) < VbBotTuning.BLOCK_THREAT_DISTANCE));
    }
    wantsOver(engine) {
        const partner = engine.partnerOf(this.slot);
        return !!partner && Math.hypot(partner.x - engine.ball.x, partner.z - engine.ball.z) > VbBotTuning.URGENT_PARTNER_DISTANCE;
    }
    thinkBlock(engine, incoming, nowMs) {
        if (engine.ballSeq !== this.blockPlanSeq) {
            this.blockPlanSeq = engine.ballSeq;
            this.blocks = this.random() < VbBotTuning.BLOCK_CHANCE;
            this.blockNoise = VbMath.gaussian(this.random) * VbBotTuning.BLOCK_NOISE;
            this.blockLeadMs = VbBotTuning.BLOCK_LEAD_MS + VbMath.gaussian(this.random) * VbBotTuning.TIMING_ERROR_MS;
        }
        if (!this.blocks || !this.isNearestBlocker(engine, incoming, nowMs))
            return false;
        const side = VbConfig.sideOf(this.team);
        this.goal = { x: VbMath.clamp(incoming.x + this.blockNoise, -3.8, 3.8), z: side * 1.3 };
        const ready = Math.hypot(this.goal.x - this.x, this.goal.z - this.z) < 0.5;
        if (ready && !this.isJumping(nowMs) && incoming.atMs - nowMs <= this.blockLeadMs)
            this.jumpStartMs = nowMs;
        return true;
    }
    isNearestBlocker(engine, incoming, nowMs) {
        let nearest = -1;
        let nearestDistance = Infinity;
        for (const other of engine.players) {
            if (!(other instanceof VolleyballBot) || other.team !== this.team || other.isJumping(nowMs))
                continue;
            const distance = Math.abs(other.x - incoming.x) + Math.abs(Math.abs(other.z) - 1.3) * 0.5;
            if (distance < nearestDistance - 1e-6) {
                nearestDistance = distance;
                nearest = other.slot;
            }
        }
        return nearest === this.slot;
    }
    isDesignatedReceiver(engine, incoming) {
        let nearest = -1;
        let nearestDistance = Infinity;
        for (const other of engine.players) {
            if (!(other instanceof VolleyballBot) || !engine.canTouch(other.slot) || other.isJumping(incoming.atMs - 400))
                continue;
            const distance = Math.hypot(other.x - incoming.x, other.z - incoming.z);
            if (distance < nearestDistance - 1e-6) {
                nearestDistance = distance;
                nearest = other.slot;
            }
        }
        return nearest === this.slot;
    }
    thinkPress(engine, incoming, nowMs) {
        if (!this.wantsPress || this.pressedForSeq === engine.ballSeq)
            return;
        if (incoming.atMs - nowMs > this.pressLeadMs)
            return;
        this.pressedForSeq = engine.ballSeq;
        if (engine.possTouches === 2 && this.blockThreatened(engine, nowMs) && this.random() > VbBotTuning.SPIKE_CHANCE_VS_BLOCK)
            return;
        this.registerPress(nowMs, 0, 0);
    }
    thinkServe(engine, nowMs) {
        this.goal = null;
        if (this.serveRally !== engine.rallyNo) {
            this.serveRally = engine.rallyNo;
            this.tossed = false;
            this.tossReadyMs = engine.serveReadyMs + 600 + this.random() * 800;
            this.hitOffsetMs = VbMath.gaussian(this.random) * VbBotTuning.TIMING_ERROR_MS;
        }
        if (engine.phase === "serve" && !this.tossed && nowMs >= this.tossReadyMs) {
            this.tossed = true;
            this.registerPress(nowMs, 0, 0);
        }
    }
    finishServe(engine, nowMs) {
        if (this.pressSeq > this.consumedSeq || nowMs < engine.tossApexMs + this.hitOffsetMs)
            return;
        const aim = ShotAimer.emptySpot(this.team, engine.opponentsOf(this.team), ShotAimer.SERVE_DEPTHS);
        this.registerPress(nowMs, aim.x, aim.z);
    }
    steer() {
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
    constructor(players, random) {
        this.players = players;
        this.random = random;
        this.score = [0, 0];
        this.ball = { x: 0, y: 1.3, z: 0, vx: 0, vy: 0, vz: 0 };
        this.phase = "idle";
        this.serveTeam = 0;
        this.rallyNo = 0;
        this.ballSeq = 0;
        this.serveReadyMs = 0;
        this.tossApexMs = 0;
        this.touchTeam = -1;
        this.possTouches = 0;
        this.lastBy = -1;
        this.lastTouchTeam = -1;
        this.incoming = null;
        this.winner = -1;
        this.serverIndex = [0, 0];
        this.events = [];
        this.tossStartMs = 0;
        this.tossBall = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        this.autoServe = false;
        this.deadReason = "";
        this.pointAtMs = 0;
        this.ballKind = "hold";
        this.ballTo = -1;
        this.ballRy = 0;
        this.ballNext = -1;
        this.ballBy = -1;
        this.ballCount = 0;
    }
    serverSlot() {
        return this.serveTeam * 2 + this.serverIndex[this.serveTeam];
    }
    partnerOf(slot) {
        return this.players.find((other) => other.team === VbConfig.teamOfSlot(slot) && other.slot !== slot) || null;
    }
    opponentsOf(team) {
        return this.players.filter((other) => other.team !== team).map((other) => ({ x: other.x, z: other.z }));
    }
    canTouch(slot) {
        const player = this.players[slot];
        if (!player || this.touchTeam !== player.team)
            return false;
        return !(this.lastTouchTeam === this.touchTeam && this.lastBy === slot);
    }
    begin(nowMs) {
        this.events.length = 0;
        this.score[0] = this.score[1] = 0;
        this.serverIndex[0] = this.serverIndex[1] = 0;
        this.serveTeam = 0;
        this.rallyNo = 0;
        this.winner = -1;
        this.startRally(nowMs, nowMs + VbConfig.COUNTDOWN_MS);
        return this.events;
    }
    update(dtSec, nowMs) {
        this.events.length = 0;
        if (this.phase === "serve")
            this.updateServe(nowMs);
        else if (this.phase === "toss") {
            this.advance(dtSec, nowMs);
            if (this.phase === "toss")
                this.updateToss(nowMs);
        }
        else if (this.phase === "play" || this.phase === "dead")
            this.advance(dtSec, nowMs);
        else if (this.phase === "point")
            this.updatePoint(nowMs);
        return this.events;
    }
    rallyRecord(phase, atMs, winner, why, lx, lz) {
        return { n: this.rallyNo, phase, at: Math.round(atMs), serveTeam: this.serveTeam, server: this.serverSlot(), sa: this.score[0], sb: this.score[1], winner, why, lx: VbMath.round3(lx), lz: VbMath.round3(lz) };
    }
    startRally(nowMs, readyMs) {
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
            player.jumpStartMs = -1e9;
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
    updateServe(nowMs) {
        if (nowMs < this.serveReadyMs)
            return;
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
    startToss(startMs, nowMs) {
        const server = this.players[this.serverSlot()];
        this.phase = "toss";
        this.tossStartMs = startMs;
        this.tossApexMs = startMs + (VbConfig.TOSS_SPEED / VbConfig.GRAVITY) * 1000;
        this.tossBall = { x: server.x, y: VbConfig.SERVE_HAND_Y, z: server.z, vx: 0, vy: VbConfig.TOSS_SPEED, vz: 0 };
        this.setBall(this.tossBall);
        this.emitBall("toss", server.slot, 0, -1, 0, -1, startMs, 0);
        this.advance((nowMs - startMs) / 1000, nowMs);
    }
    updateToss(nowMs) {
        const server = this.players[this.serverSlot()];
        if (server.hasPendingPress()) {
            const ms = server.consumePress();
            if (ms >= this.tossStartMs + 100) {
                const quality = VbMath.clamp(1 - Math.abs(ms - this.tossApexMs) / VbConfig.SERVE_TIMING_WINDOW_MS, 0, 1);
                this.serveHit(ms, quality, nowMs);
                return;
            }
        }
        if (this.autoServe && nowMs >= this.tossApexMs)
            this.serveHit(this.tossApexMs, 0.55, nowMs);
    }
    serveHit(atMs, quality, nowMs) {
        const server = this.players[this.serverSlot()];
        const team = server.team;
        const side = VbConfig.sideOf(team);
        const start = VbBallPhysics.positionAt(this.tossBall, Math.max(0, (atMs - this.tossStartMs) / 1000));
        start.y = Math.max(start.y, 0.9);
        let aim = null;
        if (-side * server.pressAimZ > 0.5 && Math.abs(server.pressAimX) < 6)
            aim = { x: server.pressAimX, z: server.pressAimZ };
        if (!aim)
            aim = ShotAimer.emptySpot(team, this.opponentsOf(team), ShotAimer.SERVE_DEPTHS);
        const scatter = VbMath.discOffset((1 - quality) * VbConfig.SERVE_SCATTER, this.random);
        const target = {
            x: VbMath.clamp(aim.x + scatter.x, -VbConfig.HALF_W - 1.5, VbConfig.HALF_W + 1.5),
            y: VbConfig.BALL_R,
            z: VbMath.clamp(aim.z + scatter.z, -VbConfig.HALF_L - 2, VbConfig.HALF_L + 2)
        };
        let flight = VbConfig.SERVE_FLIGHT;
        if (quality < 0.25 && this.random() < 0.6) {
            target.z = -side * 0.5;
            flight = 1.1;
        }
        else if (quality >= 0.25) {
            flight = ShotAimer.clearingFlight(start, target, VbConfig.SERVE_FLIGHT);
        }
        const velocity = ShotAimer.velocity(start, target, flight);
        this.setBall({ x: start.x, y: start.y, z: start.z, vx: velocity.x, vy: velocity.y, vz: velocity.z });
        this.lastBy = server.slot;
        this.lastTouchTeam = team;
        this.touchTeam = 1 - team;
        this.possTouches = 0;
        server.locked = false;
        this.phase = "play";
        this.events.push({ type: "rally", rally: this.rallyRecord("play", atMs, -1, "", 0, 0) });
        this.emitBall("serve", server.slot, 0, this.touchTeam, VbConfig.REACH[0], -1, atMs, 0);
        this.recomputeIncoming(atMs);
        this.advance((nowMs - atMs) / 1000, nowMs);
    }
    advance(dtSec, nowMs) {
        if (dtSec <= 0)
            return;
        const count = Math.max(1, Math.ceil(dtSec / VbConfig.SUB_STEP));
        const step = dtSec / count;
        const startMs = nowMs - dtSec * 1000;
        for (let index = 0; index < count; index++) {
            const ms = startMs + (index + 1) * step * 1000;
            this.stepBall(step, ms);
            if (this.phase === "point" || this.phase === "over")
                return;
        }
    }
    stepBall(step, ms) {
        const ball = this.ball;
        const g = VbConfig.GRAVITY;
        const previousX = ball.x, previousY = ball.y, previousZ = ball.z;
        ball.x += ball.vx * step;
        ball.z += ball.vz * step;
        ball.y += ball.vy * step - 0.5 * g * step * step;
        ball.vy -= g * step;
        if (this.phase === "toss") {
            if (ball.vy < 0 && ball.y < 0.85)
                this.settlePoint(this.serveTeam, "서브 실패", ball.x, ball.z, ms);
            return;
        }
        if (this.phase === "play" && previousZ * ball.z < 0)
            this.checkNet(previousX, previousY, previousZ, ms);
        if (ball.y <= VbConfig.BALL_R && ball.vy < 0) {
            this.land(ms);
            return;
        }
        if (this.phase === "play")
            this.checkTouch(ms);
    }
    checkNet(previousX, previousY, previousZ, ms) {
        const ball = this.ball;
        const fraction = previousZ / (previousZ - ball.z);
        const crossingX = previousX + (ball.x - previousX) * fraction;
        const crossingY = previousY + (ball.y - previousY) * fraction;
        if (this.tryBlock(crossingX, crossingY, ms))
            return;
        if (Math.abs(crossingX) > VbConfig.HALF_W + 0.6)
            return;
        if (crossingY - VbConfig.BALL_R >= VbConfig.NET_TOP)
            return;
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
    tryBlock(crossingX, crossingY, ms) {
        if (this.ballKind !== "spike")
            return false;
        const defender = this.touchTeam;
        if (defender < 0)
            return false;
        for (const player of this.players) {
            if (player.team !== defender)
                continue;
            const progress = (ms - player.jumpStartMs) / VbConfig.JUMP_MS;
            if (progress < VbConfig.BLOCK_WINDOW_FROM || progress > VbConfig.BLOCK_WINDOW_TO)
                continue;
            if (Math.abs(player.z) > VbConfig.BLOCK_DISTANCE || Math.abs(player.x - crossingX) > VbConfig.BLOCK_RADIUS)
                continue;
            const reach = VbConfig.BLOCK_REACH + VbConfig.JUMP_HEIGHT * Math.sin(Math.PI * progress);
            if (crossingY - VbConfig.BALL_R > reach)
                continue;
            this.deflect(player, crossingX, crossingY, ms);
            return true;
        }
        return false;
    }
    deflect(blocker, crossingX, crossingY, ms) {
        const attacker = 1 - blocker.team;
        const side = VbConfig.sideOf(attacker);
        const spread = VbMath.discOffset(1.4, this.random);
        const from = { x: crossingX, y: Math.max(crossingY, 0.8), z: side * 0.05 };
        const target = { x: VbMath.clamp(crossingX + spread.x, -3.8, 3.8), y: VbConfig.BALL_R, z: side * (1.2 + this.random() * 3) };
        const velocity = ShotAimer.velocity(from, target, VbConfig.BLOCK_FLIGHT);
        this.setBall({ x: from.x, y: from.y, z: from.z, vx: velocity.x, vy: velocity.y, vz: velocity.z });
        this.lastBy = blocker.slot;
        this.lastTouchTeam = blocker.team;
        this.touchTeam = attacker;
        this.possTouches = 0;
        this.emitBall("block", blocker.slot, 0, attacker, VbConfig.REACH[0], -1, ms, 0);
        this.recomputeIncoming(ms);
    }
    land(ms) {
        const ball = this.ball;
        const outside = Math.abs(ball.x) > VbConfig.HALF_W || Math.abs(ball.z) > VbConfig.HALF_L;
        if (this.deadReason)
            this.settlePoint(this.lastTouchTeam, this.deadReason, ball.x, ball.z, ms);
        else if (outside)
            this.settlePoint(this.lastTouchTeam, "아웃", ball.x, ball.z, ms);
        else
            this.settlePoint(ball.z > 0 ? 0 : 1, "바닥", ball.x, ball.z, ms);
    }
    settlePoint(loser, why, landX, landZ, ms) {
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
        for (const player of this.players)
            player.locked = false;
        this.winner = winner;
        this.emitBall("land", this.lastBy, 0, -1, 0, -1, ms, 1);
        this.events.push({ type: "rally", rally: this.rallyRecord("point", ms, winner, why, landX, landZ) });
    }
    updatePoint(nowMs) {
        if (nowMs - this.pointAtMs < VbConfig.POINT_MS)
            return;
        if (this.score[0] >= VbConfig.WIN_SCORE || this.score[1] >= VbConfig.WIN_SCORE) {
            this.phase = "over";
            this.winner = this.score[0] > this.score[1] ? 0 : 1;
            this.events.push({ type: "rally", rally: this.rallyRecord("over", nowMs, this.winner, "", 0, 0) });
            return;
        }
        this.startRally(nowMs, nowMs + VbConfig.SERVE_PREP_MS);
    }
    checkTouch(ms) {
        const ball = this.ball;
        if (this.touchTeam < 0 || ball.vy >= 0 || this.possTouches >= VbConfig.MAX_TOUCHES)
            return;
        if ((ball.z > 0 ? 0 : 1) !== this.touchTeam)
            return;
        if (ball.y > VbConfig.REACH[this.possTouches] || ball.y < 0.35)
            return;
        const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
        const radius = VbConfig.RECEIVE_RADIUS * (1 - 0.5 * VbMath.clamp((speed - 8) / 7, 0, 1));
        let best = null;
        let bestDistance = Infinity;
        for (const player of this.players) {
            if (!this.canTouch(player.slot))
                continue;
            const distance = Math.hypot(player.x - ball.x, player.z - ball.z);
            if (distance <= radius && distance < bestDistance) {
                best = player;
                bestDistance = distance;
            }
        }
        if (best)
            this.touch(best, bestDistance, radius, ms);
    }
    touch(player, distance, radius, ms) {
        const team = player.team;
        const count = this.possTouches;
        const quality = VbMath.clamp(1 - distance / radius, 0, 1);
        const intent = count >= 1 && player.hasIntent(ms);
        const lead = intent ? ms - player.consumePress() : 0;
        const from = { x: this.ball.x, y: this.ball.y, z: this.ball.z };
        const partner = this.partnerOf(player.slot);
        if (count === 0 || (count === 1 && !intent)) {
            this.passToPartner(player, partner, from, count, quality, ms);
            return;
        }
        const opponents = this.opponentsOf(team);
        if (count === 1)
            this.sendShot(player, from, opponents, ShotAimer.LOB_DEPTHS, quality, 1.65, "over", ms);
        else if (intent)
            this.attack(player, from, opponents, quality, lead, ms);
        else
            this.sendShot(player, from, opponents, ShotAimer.QUICK_DEPTHS, quality, 0.75, "quick", ms, VbConfig.QUICK_NET_CLEARANCE);
    }
    passToPartner(player, partner, from, count, quality, ms) {
        const side = VbConfig.sideOf(player.team);
        const spread = VbMath.discOffset(0.25 + (1 - quality) * 2.2, this.random);
        const baseZ = VbMath.clamp(Math.abs(partner.z) - 0.9, 1.2, 8.4);
        const target = {
            x: VbMath.clamp(partner.x + spread.x, -VbConfig.HALF_W + 0.2, VbConfig.HALF_W - 0.2),
            y: VbConfig.REACH[count + 1],
            z: side * VbMath.clamp(Math.abs(side * baseZ + spread.z), 0.8, VbConfig.HALF_L - 0.3)
        };
        const flight = count === 0 ? 1.35 : 1.25;
        this.release(player, from, target, flight, count === 0 ? "dig" : "set", player.team, VbConfig.REACH[count + 1], partner.slot, ms);
    }
    sendShot(player, from, opponents, depths, quality, minimumFlight, kind, ms, requiredClearance = 0.12) {
        const aim = ShotAimer.emptySpot(player.team, opponents, depths);
        const spread = VbMath.discOffset(0.3 + (1 - quality) * 1.4, this.random);
        const target = { x: aim.x + spread.x, y: VbConfig.BALL_R, z: aim.z + spread.z };
        const flight = ShotAimer.clearingFlight(from, target, minimumFlight, requiredClearance);
        this.release(player, from, target, flight, kind, 1 - player.team, VbConfig.REACH[0], -1, ms);
    }
    attack(player, from, opponents, quality, lead, ms) {
        const near = -player.iz * VbConfig.sideOf(player.team) < -0.45;
        const aim = ShotAimer.emptySpot(player.team, opponents, near ? ShotAimer.NEAR_SPIKE_DEPTHS : ShotAimer.SPIKE_DEPTHS);
        const timing = VbMath.clamp(1 - Math.abs(lead - VbConfig.SPIKE_LEAD_MS) / VbConfig.SPIKE_LEAD_WINDOW_MS, 0, 1);
        const finalQuality = timing * (0.6 + 0.4 * quality);
        const spread = VbMath.discOffset(0.2 + (1 - finalQuality) * 2.2, this.random);
        const target = { x: aim.x + spread.x, y: VbConfig.BALL_R, z: aim.z + spread.z };
        const minimum = (near ? 0.42 : 0.52) + (1 - finalQuality) * 0.3;
        const flight = finalQuality < 0.2 ? minimum : ShotAimer.clearingFlight(from, target, minimum);
        this.release(player, from, target, flight, "spike", 1 - player.team, VbConfig.REACH[0], -1, ms);
    }
    release(player, from, target, flight, kind, to, reachHeight, next, ms) {
        const velocity = ShotAimer.velocity(from, target, flight);
        this.ball.vx = velocity.x;
        this.ball.vy = velocity.y;
        this.ball.vz = velocity.z;
        const count = this.possTouches + 1;
        this.lastBy = player.slot;
        this.lastTouchTeam = player.team;
        this.touchTeam = to;
        this.possTouches = to === player.team ? count : 0;
        this.emitBall(kind, player.slot, count, to, reachHeight, next, ms, 0);
        this.recomputeIncoming(ms);
    }
    recomputeIncoming(ms) {
        const crossing = this.ballTo >= 0 ? VbBallPhysics.crossing(this.ball, this.ballRy) : null;
        this.incoming = crossing ? { team: this.ballTo, ry: this.ballRy, atMs: ms + crossing.t * 1000, x: crossing.x, z: crossing.z } : null;
    }
    setBall(state) {
        this.ball.x = state.x;
        this.ball.y = state.y;
        this.ball.z = state.z;
        this.ball.vx = state.vx;
        this.ball.vy = state.vy;
        this.ball.vz = state.vz;
    }
    emitBall(kind, by, count, to, reachHeight, next, ms, hold) {
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
