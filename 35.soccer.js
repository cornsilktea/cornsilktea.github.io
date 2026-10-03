"use strict";
class SocRoomRules {
}
SocRoomRules.RULES = { root: SocConfig.ROOT, seatCount: SocConfig.SEAT_COUNT, spectatorSlot: SocConfig.SPECTATOR_SLOT };
SocRoomRules.VALUES = ["match", "ball", "game", "end"];
SocRoomRules.ACTION_KINDS = ["pass", "shot", "tackle", "slide"];
SocRoomRules.BODY_CODES = ["none", "tackle", "slide"];
class SocStateCodec {
    static encode(controller, nowMs) {
        const round2 = (value) => Math.round(value * 100) / 100;
        const round1 = (value) => Math.round(value * 10) / 10;
        const code = SocRoomRules.BODY_CODES.indexOf(controller.actionKind);
        const age = controller.actionKind !== "none" && nowMs - controller.actionStartMs < 1500 ? Math.max(0, Math.round(nowMs - controller.actionStartMs)) : 0;
        return [round2(controller.x), round2(controller.z), round2(controller.yaw), controller.moving ? 1 : 0, round1(controller.ix), round1(controller.iz), code, controller.actionSeq, age].join(",");
    }
    static decode(raw) {
        const parts = raw.split(",").map(Number);
        if (parts.length < 9 || parts.some((part) => isNaN(part)))
            return null;
        return { x: parts[0], z: parts[1], yaw: parts[2], moving: parts[3] === 1, ix: parts[4], iz: parts[5], kind: SocRoomRules.BODY_CODES[parts[6]] || "none", seq: parts[7], age: parts[8] };
    }
}
class SocBotLooks {
    static create(team) {
        const look = CharacterLooks.random();
        look.p.top = SocConfig.TEAM_TOP_COLOR_INDEX[team] + 1;
        return look;
    }
    static keeper(team) {
        const look = CharacterLooks.createDefault();
        look.c = team === 0 ? 1 : 2;
        look.p.top = SocConfig.TEAM_TOP_COLOR_INDEX[team] + 1;
        look.hat = 0;
        look.cape = 0;
        return look;
    }
}
class SocInput {
    constructor(zone, base, knob) {
        this.zone = zone;
        this.base = base;
        this.knob = knob;
        this.onButton = () => undefined;
        this.enabled = true;
        this.held = new Set();
        this.joystickPointer = null;
        this.joystickOriginX = 0;
        this.joystickOriginY = 0;
        this.joystickX = 0;
        this.joystickZ = 0;
        this.bindKeyboard();
        this.bindJoystick();
        this.bindButton("btnJ", "J");
        this.bindButton("btnK", "K");
    }
    axis() {
        if (!this.enabled)
            return { x: 0, z: 0 };
        let x = this.joystickX, z = this.joystickZ;
        if (this.held.has("KeyA") || this.held.has("ArrowLeft"))
            x -= 1;
        if (this.held.has("KeyD") || this.held.has("ArrowRight"))
            x += 1;
        if (this.held.has("KeyW") || this.held.has("ArrowUp"))
            z -= 1;
        if (this.held.has("KeyS") || this.held.has("ArrowDown"))
            z += 1;
        const length = Math.hypot(x, z);
        return length > 0.05 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
    }
    releaseAll() {
        this.held.clear();
        this.joystickPointer = null;
        this.joystickX = this.joystickZ = 0;
        this.base.hidden = true;
    }
    bindKeyboard() {
        const movementKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
        window.addEventListener("keydown", (event) => {
            if (event.target.tagName === "INPUT" || !this.enabled)
                return;
            const code = this.codeOf(event);
            if (movementKeys.indexOf(code) >= 0) {
                this.held.add(code);
                event.preventDefault();
            }
            else if (!event.repeat && (code === "KeyJ" || code === "KeyK")) {
                this.onButton(code === "KeyJ" ? "J" : "K", true);
                event.preventDefault();
            }
        });
        window.addEventListener("keyup", (event) => {
            const code = this.codeOf(event);
            this.held.delete(code);
            if (code === "KeyJ" || code === "KeyK")
                this.onButton(code === "KeyJ" ? "J" : "K", false);
        });
        window.addEventListener("blur", () => {
            this.held.clear();
            this.onButton("J", false);
            this.onButton("K", false);
        });
    }
    codeOf(event) {
        return event.key.indexOf("Arrow") === 0 ? event.key : event.code;
    }
    bindJoystick() {
        this.zone.addEventListener("pointerdown", (event) => {
            if (this.joystickPointer !== null)
                return;
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
            if (event.pointerId !== this.joystickPointer)
                return;
            const deltaX = event.clientX - this.joystickOriginX, deltaY = event.clientY - this.joystickOriginY;
            const length = Math.hypot(deltaX, deltaY) || 1;
            const reach = Math.min(length, SocInput.JOYSTICK_RADIUS);
            this.knob.style.transform = "translate(" + (deltaX / length) * reach + "px," + (deltaY / length) * reach + "px)";
            const strength = Math.min(1, length / SocInput.JOYSTICK_RADIUS);
            if (strength < SocInput.DEAD_ZONE)
                this.joystickX = this.joystickZ = 0;
            else {
                this.joystickX = deltaX / length;
                this.joystickZ = deltaY / length;
            }
        });
        const end = (event) => {
            if (event.pointerId !== this.joystickPointer)
                return;
            this.joystickPointer = null;
            this.joystickX = this.joystickZ = 0;
            this.base.hidden = true;
        };
        this.zone.addEventListener("pointerup", end);
        this.zone.addEventListener("pointercancel", end);
    }
    bindButton(id, key) {
        const button = RkDom.byId(id);
        button.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            if (this.enabled)
                this.onButton(key, true);
        });
        const release = (event) => {
            event.preventDefault();
            if (this.enabled)
                this.onButton(key, false);
        };
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
    }
}
SocInput.JOYSTICK_RADIUS = 55;
SocInput.DEAD_ZONE = 0.3;
class SocLocalController extends SocPlayerController {
    constructor(slot, input) {
        super(slot);
        this.input = input;
    }
    poll(engine, dtSec, nowMs) {
        const axis = this.input.axis();
        const side = SocConfig.sideOf(this.team);
        this.ix = axis.x * side;
        this.iz = axis.z * side;
        this.step(dtSec, nowMs);
    }
}
class SocChargeTracker {
    constructor() {
        this.key = null;
        this.startMs = 0;
    }
    begin(key, nowMs) {
        this.key = key;
        this.startMs = nowMs;
    }
    cancel() {
        this.key = null;
    }
    isCharging(key) {
        return this.key !== null && (key === undefined || this.key === key);
    }
    power(nowMs) {
        return this.key === null ? 0 : SocMath.clamp((nowMs - this.startMs) / SocConfig.CHARGE_MS, 0, 1);
    }
}
class SocBallSmoother {
    constructor() {
        this.offsetX = 0;
        this.offsetY = 0;
        this.offsetZ = 0;
        this.lastX = 0;
        this.lastY = 0;
        this.lastZ = 0;
        this.pending = false;
    }
    markChange() {
        this.pending = true;
    }
    shown() {
        return { x: this.lastX, z: this.lastZ };
    }
    smooth(target, deltaSeconds) {
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
SocBallSmoother.SNAP_DISTANCE = 3;
SocBallSmoother.DECAY_PER_SECOND = 11;
class SocBallTracker {
    constructor() {
        this.physics = new SocBallPhysics();
        this.smoother = new SocBallSmoother();
        this.follower = new SocDribbleFollower();
        this.ownerSlot = -1;
        this.ownerSince = 0;
        this.kind = "kickoff";
        this.seq = -1;
    }
    apply(record, nowMs) {
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
    advance(deltaSeconds) {
        if (this.ownerSlot < 0)
            this.physics.advance(deltaSeconds);
    }
}
class SocHud {
    constructor() {
        this.teamScore = [RkDom.byId("hudScore0"), RkDom.byId("hudScore1")];
        this.teamBox = [RkDom.byId("hudTeam0"), RkDom.byId("hudTeam1")];
        this.time = RkDom.byId("hudTime");
        this.overtime = RkDom.byId("hudOvertime");
        this.banner = RkDom.byId("banner");
        this.bannerBox = RkDom.byId("bannerBox");
        this.hint = RkDom.byId("hudHint");
        this.chargeBox = RkDom.byId("chargeBox");
        this.chargeFill = RkDom.byId("chargeFill");
        this.buttonJ = RkDom.byId("btnJ");
        this.buttonK = RkDom.byId("btnK");
    }
    update(model) {
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
class SocHostDirector {
    constructor(engine, onEvents) {
        this.engine = engine;
        this.onEvents = onEvents;
        this.started = false;
        this.lastTickMs = 0;
        this.lastPressSeq = new Map();
    }
    get hasStarted() {
        return this.started;
    }
    begin(nowMs) {
        this.started = true;
        this.lastTickMs = nowMs;
        this.onEvents(this.engine.begin(nowMs));
    }
    tick(nowMs) {
        if (!this.started)
            return;
        const elapsed = Math.min(SocHostDirector.MAX_TICK_SEC, Math.max(0, (nowMs - this.lastTickMs) / 1000));
        this.lastTickMs = nowMs;
        this.engine.players.forEach((controller) => controller.poll(this.engine, elapsed, nowMs));
        this.onEvents(this.engine.update(elapsed, nowMs));
    }
    receivePress(controller, id, record) {
        const last = this.lastPressSeq.get(id) || 0;
        if (record.n <= last)
            return;
        this.lastPressSeq.set(id, record.n);
        const kind = SocRoomRules.ACTION_KINDS[record.k];
        if (!kind)
            return;
        controller.queueAction({ kind, power: SocMath.clamp(record.p / 100, 0, 1), atMs: record.t, dirX: record.dx, dirZ: record.dz });
    }
}
SocHostDirector.MAX_TICK_SEC = 0.5;
class SoccerMatch {
    constructor(services, session) {
        this.services = services;
        this.session = session;
        this.seats = [null, null, null, null, null, null];
        this.controllers = [];
        this.bodies = [];
        this.tracker = new SocBallTracker();
        this.charge = new SocChargeTracker();
        this.local = null;
        this.director = null;
        this.engine = null;
        this.game = null;
        this.seatsDirty = true;
        this.lastSentMs = 0;
        this.botSent = new Map();
        this.localSent = { text: "", at: 0 };
        this.lastGameNo = 0;
        this.pressCounter = 0;
        this.ended = false;
        this.cheeringTeam = -2;
        const THREE = services.libs.THREE;
        this.group = new THREE.Group();
        services.world.matchGroup.add(this.group);
        this.ballView = new SocBallView(services.libs, services.textures);
        this.group.add(this.ballView.group);
        this.ballView.loadModel();
        const seatIds = new RkSeatPlan(SocRoomRules.RULES).matchSeats(session.value("match"));
        this.mySlot = seatIds.indexOf(session.myId);
        if (this.mySlot >= 0)
            this.local = new SocLocalController(this.mySlot, services.input);
        services.world.playing = true;
        services.world.rig.snap();
        services.input.enabled = this.mySlot >= 0;
        services.input.onButton = (key, down) => this.buttonChanged(key, down);
        this.game = session.value("game");
        const ball = session.value("ball");
        if (ball)
            this.tracker.apply(ball, services.backend.now());
        this.syncSeats();
        if (session.isHost()) {
            this.engine = new SocEngine(this.controllers, Math.random);
            this.director = new SocHostDirector(this.engine, (events) => this.applyEvents(events));
        }
        this.createKeepers();
    }
    createKeepers() {
        for (let index = 0; index < 2; index++) {
            const slot = SocConfig.SEAT_COUNT + index;
            const team = SocConfig.teamOfSlot(slot);
            const controller = this.engine ? this.engine.keepers[index] : new SocRemoteController(slot);
            const home = SocCourtLayout.keeperHome(slot);
            controller.teleport(home.x, home.z);
            this.bodies[slot] = controller;
            controller.obstacles = this.bodies;
            const record = { nick: SocConfig.KEEPER_NAME, isBot: true, joinedAt: 0, slot, look: SocBotLooks.keeper(team) };
            const view = new SocPlayerView(this.services.libs, this.services.factory, this.services.assets, this.services.labels, this.group, slot, record, false);
            this.seats[slot] = { id: "gk" + index, seenActionSeq: controller.actionSeq, controller, view };
        }
    }
    isHostAi(actor) {
        return this.isHost() && actor.id !== this.session.myId && !(actor.controller instanceof SocRemoteController);
    }
    applyChange(kind) {
        if (kind === "players" || kind === "match")
            this.seatsDirty = true;
        if (kind === "ball" && !this.isHost())
            this.applyBall(this.session.value("ball"));
        if (kind === "game" && !this.isHost())
            this.applyGame(this.session.value("game"));
    }
    receiveRemote(id, state) {
        const seat = this.seats.find((actor) => !!actor && actor.id === id);
        if (!seat || !(seat.controller instanceof SocRemoteController))
            return;
        seat.controller.receive(state.x, state.z, state.yaw, state.moving, state.ix, state.iz);
        if (!this.isHost())
            seat.controller.receiveAction(state.kind, state.seq, state.age, this.services.backend.now());
    }
    receivePress(id, record) {
        if (!this.director)
            return;
        const seat = this.seats.find((actor) => !!actor && actor.id === id);
        if (seat)
            this.director.receivePress(seat.controller, id, record);
    }
    playerRemoved(id) {
        if (!this.isHost())
            return;
        const slot = this.seats.findIndex((actor) => !!actor && actor.id === id);
        if (slot < 0 || !this.session.value("match"))
            return;
        const botId = "bot" + Math.random().toString(36).slice(2, 8);
        const record = { nick: SocConfig.BOT_NAMES[slot], isBot: true, joinedAt: this.services.backend.now(), slot, look: SocBotLooks.create(SocConfig.teamOfSlot(slot)) };
        this.session.ref.update({ ["players/" + botId]: record, ["match/seats/s" + slot]: botId });
    }
    markEnded() {
        this.ended = true;
    }
    dispose() {
        this.services.world.playing = false;
        this.services.input.releaseAll();
        this.services.input.onButton = () => undefined;
        this.seats.forEach((actor) => { if (actor)
            actor.view.dispose(); });
        this.services.world.matchGroup.remove(this.group);
    }
    update(deltaSeconds) {
        const now = this.services.backend.now();
        if (this.seatsDirty)
            this.syncSeats();
        this.tryBeginHost(now);
        this.driveControllers(deltaSeconds, now);
        this.keepChargeValid();
        this.sendStates(now);
        this.renderWorld(deltaSeconds, now);
        this.services.hud.update(this.hudModel(now));
        this.services.world.render(deltaSeconds);
    }
    isHost() {
        return this.session.isHost();
    }
    syncSeats() {
        const seatIds = new RkSeatPlan(SocRoomRules.RULES).matchSeats(this.session.value("match"));
        let complete = true;
        for (let slot = 0; slot < SocConfig.SEAT_COUNT; slot++) {
            const id = seatIds[slot];
            const record = id ? this.session.players.get(id) : undefined;
            const current = this.seats[slot];
            if (!id || !record) {
                complete = false;
                continue;
            }
            if (current && current.id === id)
                continue;
            const previous = current ? current.controller : null;
            if (current)
                current.view.dispose();
            const controller = this.makeController(slot, id, record, previous);
            const view = new SocPlayerView(this.services.libs, this.services.factory, this.services.assets, this.services.labels, this.group, slot, record, id === this.session.myId);
            this.seats[slot] = { id, seenActionSeq: controller.actionSeq, controller, view };
            this.controllers[slot] = controller;
            this.bodies[slot] = controller;
            controller.obstacles = this.bodies;
        }
        this.seatsDirty = !complete;
    }
    makeController(slot, id, record, previous) {
        let controller;
        if (id === this.session.myId && this.local)
            controller = this.local;
        else if (this.isHost() && record.isBot)
            controller = new SocBot(slot, Math.random);
        else
            controller = new SocRemoteController(slot);
        if (previous) {
            controller.x = previous.x;
            controller.z = previous.z;
            controller.yaw = previous.yaw;
            if (controller instanceof SocRemoteController)
                controller.teleport(previous.x, previous.z);
        }
        else {
            const spot = SocCourtLayout.kickoffSpot(slot, this.game ? this.game.kickoff : 0);
            controller.teleport(spot.x, spot.z);
        }
        return controller;
    }
    tryBeginHost(now) {
        if (!this.director || this.director.hasStarted || this.seatsDirty)
            return;
        this.director.begin(now);
    }
    driveControllers(deltaSeconds, now) {
        if (this.engine && this.director && this.director.hasStarted) {
            this.director.tick(now);
            return;
        }
        if (this.local) {
            this.local.frozen = !this.game || this.game.phase !== "play";
            this.local.carrying = this.tracker.ownerSlot === this.local.slot;
        }
        this.seats.forEach((actor) => { if (actor)
            actor.controller.poll(null, deltaSeconds, now); });
        if (!this.isHost())
            this.tracker.advance(deltaSeconds);
    }
    sendStates(now) {
        if (now - this.lastSentMs < SocConfig.NET_MS)
            return;
        this.lastSentMs = now;
        if (this.local)
            this.sendIfNeeded(this.localSent, SocStateCodec.encode(this.local, now), now, this.session.myId);
        if (!this.isHost())
            return;
        this.seats.forEach((actor) => {
            if (!actor || !this.isHostAi(actor))
                return;
            let sent = this.botSent.get(actor.id);
            if (!sent) {
                sent = { text: "", at: 0 };
                this.botSent.set(actor.id, sent);
            }
            this.sendIfNeeded(sent, SocStateCodec.encode(actor.controller, now), now, actor.id);
        });
    }
    sendIfNeeded(sent, text, now, id) {
        if (text === sent.text && now - sent.at < SoccerMatch.STATE_KEEPALIVE_MS)
            return;
        sent.text = text;
        sent.at = now;
        this.session.writeState(text, id);
    }
    ownerSlot() {
        return this.engine ? this.engine.ownerSlot : this.tracker.ownerSlot;
    }
    phase() {
        return this.game ? this.game.phase : "none";
    }
    localHasBall() {
        return !!this.local && this.ownerSlot() === this.local.slot;
    }
    keepChargeValid() {
        if (this.charge.isCharging() && (!this.localHasBall() || this.phase() !== "play"))
            this.charge.cancel();
    }
    buttonChanged(key, down) {
        const local = this.local;
        if (!local || this.ended)
            return;
        const now = this.services.backend.now();
        if (this.phase() !== "play") {
            this.charge.cancel();
            return;
        }
        if (down) {
            if (this.localHasBall())
                this.charge.begin(key, now);
            else
                this.fireBody(key === "J" ? "tackle" : "slide", now);
            return;
        }
        if (!this.charge.isCharging(key))
            return;
        const power = this.charge.power(now);
        this.charge.cancel();
        this.fireKick(key === "J" ? "pass" : "shot", power, now);
    }
    fireKick(kind, power, now) {
        const local = this.local;
        if (this.isHost()) {
            local.queueAction({ kind, power, atMs: now, dirX: 0, dirZ: 0 });
            return;
        }
        this.sendPress(kind, power, now, 0, 0);
    }
    fireBody(kind, now) {
        const local = this.local;
        const ownerSlot = this.ownerSlot();
        const opponentOwner = ownerSlot >= 0 && SocConfig.teamOfSlot(ownerSlot) !== local.team ? this.ballPoint(now) : null;
        const aim = SocActionAim.direction(kind, local, opponentOwner);
        if (this.isHost()) {
            local.queueAction({ kind, power: 0, atMs: now, dirX: aim.x, dirZ: aim.z });
            return;
        }
        if (local.isBusy(now))
            return;
        local.beginBodyAction(kind === "tackle" ? "tackle" : "slide", now, aim.x, aim.z);
        this.sendPress(kind, 0, now, aim.x, aim.z);
    }
    sendPress(kind, power, now, dirX, dirZ) {
        this.pressCounter++;
        const round2 = (value) => Math.round(value * 100) / 100;
        this.session.writePress({ n: this.pressCounter, t: now, k: SocRoomRules.ACTION_KINDS.indexOf(kind), p: Math.round(power * 100), dx: round2(dirX), dz: round2(dirZ) });
    }
    applyEvents(events) {
        for (const event of events) {
            if (event.type === "ball") {
                this.session.writeValue("ball", event.ball);
                this.showBallEvent(event.ball);
            }
            else {
                this.session.writeValue("game", event.game);
                this.applyGame(event.game);
                if (event.game.phase === "over")
                    this.finishMatch(event.game);
            }
        }
    }
    finishMatch(game) {
        this.session.ref.update({ end: { winner: game.winner, sa: game.sa, sb: game.sb, overtime: game.overtime, at: this.services.backend.now() }, status: "end" });
    }
    applyBall(record) {
        if (!record || record.seq === this.tracker.seq)
            return;
        this.tracker.apply(record, this.services.backend.now());
        this.showBallEvent(record);
        if (record.kind === "tackled" && this.local && record.by === this.local.slot)
            this.local.winRecover(this.services.backend.now());
    }
    showBallEvent(record) {
        const now = this.services.backend.now();
        if (Math.abs(now - record.at) > 1500)
            return;
        const actor = record.by >= 0 && record.by < SocConfig.SEAT_COUNT ? this.seats[record.by] : null;
        if (actor && (record.kind === "pass" || record.kind === "shot"))
            actor.view.play("kick", now, SoccerMatch.ACTION_VIEW_MS);
        const victim = record.victim >= 0 && record.victim < SocConfig.SEAT_COUNT ? this.seats[record.victim] : null;
        if (victim && record.kind === "tackled")
            victim.view.play("hit", now, SoccerMatch.HIT_VIEW_MS);
    }
    applyGame(record) {
        if (!record)
            return;
        this.game = record;
        if (record.n !== this.lastGameNo && record.phase === "ready") {
            this.lastGameNo = record.n;
            this.charge.cancel();
            if (!this.isHost())
                this.seats.forEach((actor) => {
                    if (!actor)
                        return;
                    const spot = SocCourtLayout.spotFor(actor.controller.slot, record.kickoff);
                    actor.controller.teleport(spot.x, spot.z);
                });
        }
        if (record.phase === "goal")
            this.services.court.crowd.cheer();
    }
    ballPoint(now) {
        const target = this.ballTarget(now);
        return { x: target.x, z: target.z };
    }
    ballTarget(now) {
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
    ballVelocity() {
        if (this.engine)
            return this.engine.ballVelocity();
        const ownerSlot = this.tracker.ownerSlot;
        const owner = ownerSlot >= 0 ? this.seats[ownerSlot] : null;
        if (owner) {
            const velocity = owner.controller.velocity();
            return { x: velocity.vx, z: velocity.vz };
        }
        return { x: this.tracker.physics.vx, z: this.tracker.physics.vz };
    }
    renderWorld(deltaSeconds, now) {
        const target = this.ballTarget(now);
        const shown = this.engine ? target : this.tracker.smoother.smooth(target, deltaSeconds);
        const velocity = this.ballVelocity();
        this.ballView.place(shown.x, shown.y, shown.z, velocity.x, velocity.z, deltaSeconds);
        const physics = this.engine ? this.engine.physics : this.tracker.physics;
        physics.impacts.splice(0).forEach((impact) => this.services.court.impact(impact));
        const cheeringTeam = this.cheeringTeamNow();
        this.seats.forEach((actor) => {
            if (!actor)
                return;
            const controller = actor.controller;
            if (controller.actionSeq !== actor.seenActionSeq) {
                actor.seenActionSeq = controller.actionSeq;
                if (controller.actionKind !== "none" && now - controller.actionStartMs < 600)
                    actor.view.play(controller.actionKind === "slide" ? "slide" : "tackle", controller.actionStartMs, controller.activeMs());
            }
            actor.view.setCheering(cheeringTeam === controller.team);
            actor.view.render(controller.x, controller.z, controller.yaw, controller.moving, deltaSeconds, now);
        });
        this.services.court.update(deltaSeconds);
        const rig = this.services.world.rig;
        if (this.local)
            rig.followPlayer(this.local.team, shown, this.local, deltaSeconds);
        else
            rig.watchFromSide(shown.x, shown.z, deltaSeconds);
    }
    cheeringTeamNow() {
        const game = this.game;
        if (!game)
            return -2;
        if (game.phase === "goal")
            return game.own ? 1 - SocConfig.teamOfSlot(game.scorer) : game.scorer >= 0 ? SocConfig.teamOfSlot(game.scorer) : -2;
        if (game.phase === "over")
            return game.winner;
        return -2;
    }
    timeText(now) {
        const game = this.game;
        if (!game)
            return "2:00";
        const left = game.phase === "play" && !game.overtime ? game.leftMs - (now - game.at) : game.leftMs;
        const seconds = Math.max(0, Math.ceil(left / 1000));
        return Math.floor(seconds / 60) + ":" + (seconds % 60 < 10 ? "0" : "") + (seconds % 60);
    }
    hudModel(now) {
        const game = this.game;
        const holding = this.localHasBall();
        const model = {
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
        if (!this.local)
            model.hint = "관전 중";
        else if (game.phase === "play")
            model.hint = holding ? "J 패스 · K 슛 (꾹 누르면 더 세게)" : "J 태클 · K 슬라이딩";
        return model;
    }
    nickOfSlot(slot) {
        const id = slot >= 0 && slot < SocConfig.SEAT_COUNT ? this.seats[slot] : null;
        return id ? id.view.record.nick : "";
    }
    bannerText(game, now) {
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
        if (game.phase === "over")
            return "경기 종료";
        return "";
    }
}
SoccerMatch.STATE_KEEPALIVE_MS = 1000;
SoccerMatch.ACTION_VIEW_MS = 420;
SoccerMatch.HIT_VIEW_MS = 520;
class SocScreens {
    constructor(touchDevice) {
        this.touchDevice = touchDevice;
        this.start = RkDom.byId("startScreen");
        this.lobby = RkDom.byId("lobbyScreen");
        this.end = RkDom.byId("endScreen");
        this.gameUi = RkDom.byId("gameUi");
        this.joystickZone = RkDom.byId("joyZone");
        this.current = "start";
    }
    show(name, canControl = true) {
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
    constructor() {
        this.code = RkDom.byId("lobbyCode");
        this.seatBoard = RkDom.byId("seatBoard");
        this.spectatorLine = RkDom.byId("spectatorLine");
        this.startButton = RkDom.byId("btnStart");
        this.modeButton = RkDom.byId("btnSeatMode");
        this.hint = RkDom.byId("lobbyHint");
        this.seatPlan = new RkSeatPlan(SocRoomRules.RULES);
        this.onSeatClick = () => undefined;
        this.selectedSlot = -1;
        this.seatBoard.addEventListener("click", (event) => {
            const seat = event.target.closest("[data-slot]");
            if (seat)
                this.onSeatClick(Number(seat.dataset.slot));
        });
    }
    render(session) {
        const isHost = session.isHost();
        const seats = this.seatPlan.humanSeats(session.players);
        RkDom.setText(this.code, session.code);
        this.seatBoard.innerHTML = [0, 1].map((team) => {
            const rows = [team * 2, team * 2 + 1].map((slot) => this.seatHtml(session, seats[slot], slot)).join("");
            return "<div class='socTeam' style='--team:" + SocConfig.TEAM_COLORS[team] + "'><h3>" + SocConfig.TEAM_NAMES[team] + "</h3>" + rows + "</div>";
        }).join("");
        const spectatorNames = this.seatPlan.spectators(session.players).map((id) => session.players.get(id).nick + (id === session.myId ? " (나)" : ""));
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
    seatHtml(session, id, slot) {
        const selected = this.selectedSlot === slot ? " selected" : "";
        if (!id)
            return "<button type='button' class='socSeat empty" + selected + "' data-slot='" + slot + "'><b>AI</b><small>빈 자리</small></button>";
        const record = session.players.get(id);
        const tag = id === session.hostId ? "방장" : "";
        const mine = id === session.myId ? " me" : "";
        return "<button type='button' class='socSeat" + mine + selected + "' data-slot='" + slot + "'><b>" + RkDom.escape(record.nick) + "</b><small>" + tag + (id === session.myId ? " 나" : "") + "</small></button>";
    }
}
class SocEndView {
    constructor() {
        this.title = RkDom.byId("endTitle");
        this.reason = RkDom.byId("endReason");
        this.rows = RkDom.byId("endRows");
        this.seatPlan = new RkSeatPlan(SocRoomRules.RULES);
    }
    render(session, end) {
        const seats = this.seatPlan.matchSeats(session.value("match"));
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
    constructor(libs) {
        this.libs = libs;
        this.touchDevice = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
        this.profile = new PlayerProfile();
        this.backend = new RkBackend();
        this.directory = new RkDirectory(this.backend, SocRoomRules.RULES);
        this.seatPlan = new RkSeatPlan(SocRoomRules.RULES);
        this.screens = new SocScreens(this.touchDevice);
        this.lobbyView = new SocLobbyView();
        this.endView = new SocEndView();
        this.myId = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        this.session = null;
        this.match = null;
        this.assetsReady = false;
        this.lastFrameMs = 0;
        this.loop = (timeMs) => {
            this.step(timeMs);
            requestAnimationFrame(this.loop);
        };
        this.assets = new CharacterAssets(libs);
        this.factory = new CharacterModelFactory(libs, this.assets);
        this.textures = new SocCourtTextures(libs);
        this.court = new SocCourtView(libs, this.textures);
        this.editor = new ProfileEditor(libs, this.factory, this.assets, this.profile);
        FoldCard.bindAll(document);
        const input = new SocInput(RkDom.byId("joyZone"), RkDom.byId("joyBase"), RkDom.byId("joyKnob"));
        this.services = {
            libs, assets: this.assets, factory: this.factory, labels: new RkLabelFactory(libs),
            world: new SocWorldView(libs, RkDom.byId("view"), this.touchDevice),
            hud: new SocHud(), input, backend: this.backend, court: this.court, textures: this.textures
        };
        this.services.world.scene.add(this.court.group);
        this.backdrop = new SocMenuBackdrop(this.services.world, libs, this.textures);
        this.bindMenus();
        this.screens.show("start");
        this.updateStartButtons();
        this.loadAssets();
        requestAnimationFrame(this.loop);
        window.setInterval(() => { if (document.hidden)
            this.step(performance.now()); }, 250);
        window.addEventListener("pagehide", () => { if (this.session)
            this.session.removeMineOnUnload(); });
    }
    async loadAssets() {
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
        }
        catch (error) {
            RkDom.setText(RkDom.byId("loadNote"), "캐릭터를 불러오지 못했어요. 새로고침해 주세요.");
        }
    }
    async loadExtraClips() {
        try {
            const gltf = await new this.libs.GLTFLoader().loadAsync("assets/kaykit/animations/soccer_anims.glb");
            gltf.animations.forEach((clip) => this.assets.clips.set(clip.name, clip));
        }
        catch (error) {
            return;
        }
    }
    bindMenus() {
        RkDom.byId("btnCreate").addEventListener("click", () => this.createRoom());
        RkDom.byId("btnJoin").addEventListener("click", () => this.joinRoom(false));
        RkDom.byId("btnWatch").addEventListener("click", () => this.joinRoom(true));
        RkDom.byId("joinCode").addEventListener("keydown", (event) => { if (event.key === "Enter")
            this.joinRoom(false); });
        RkDom.byId("btnStart").addEventListener("click", () => this.startMatch());
        RkDom.byId("btnLeave").addEventListener("click", () => this.leaveRoom());
        RkDom.byId("btnEndLeave").addEventListener("click", () => this.leaveRoom());
        RkDom.byId("btnGameLeave").addEventListener("click", () => this.leaveRoom());
        RkDom.byId("btnToLobby").addEventListener("click", () => this.returnToLobby());
        RkDom.byId("btnSeatMode").addEventListener("click", () => this.toggleSeatMode());
        this.lobbyView.onSeatClick = (slot) => this.clickSeat(slot);
    }
    updateStartButtons() {
        const ok = !!this.backend.database && this.assetsReady;
        ["btnCreate", "btnJoin", "btnWatch"].forEach((id) => { RkDom.byId(id).disabled = !ok; });
        if (!this.backend.database)
            this.showStartMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인)");
    }
    showStartMessage(text) {
        RkDom.setText(RkDom.byId("startMsg"), text);
    }
    myRecord() {
        return { nick: this.profile.nickOrDefault(), isBot: false, joinedAt: this.backend.now(), slot: 0, look: this.profile.look, spectator: false };
    }
    pushProfile() {
        if (this.session)
            this.session.pushProfile({ nick: this.profile.nickOrDefault(), look: this.profile.look });
    }
    async createRoom() {
        if (!this.backend.database)
            return;
        this.showStartMessage("");
        const button = RkDom.byId("btnCreate");
        button.disabled = true;
        try {
            const code = await this.directory.create(this.myId, this.myRecord());
            if (code)
                this.enterRoom(code, true, "");
            else
                this.showStartMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
        }
        catch (error) {
            this.showStartMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
        }
        button.disabled = false;
    }
    async joinRoom(asSpectator) {
        if (!this.backend.database)
            return;
        const code = RkDom.byId("joinCode").value.replace(/\D/g, "");
        if (code.length !== 5) {
            this.showStartMessage("방 코드 5자리를 입력해 주세요.");
            return;
        }
        this.showStartMessage("");
        try {
            const outcome = await this.directory.join(code, this.myId, this.myRecord(), asSpectator);
            if (outcome.ok)
                this.enterRoom(code, false, outcome.message);
            else
                this.showStartMessage(outcome.message);
        }
        catch (error) {
            this.showStartMessage("방을 불러오지 못했어요.");
        }
    }
    enterRoom(code, hosting, notice) {
        const session = new RkSession(this.backend, SocRoomRules.RULES, code, this.myId, hosting, SocRoomRules.VALUES);
        this.session = session;
        session.onChange = (kind) => this.onSessionChange(kind);
        session.onRemoteState = (id, raw) => {
            const state = SocStateCodec.decode(raw);
            if (state && this.match)
                this.match.receiveRemote(id, state);
        };
        session.onPress = (id, record) => { if (this.match)
            this.match.receivePress(id, record); };
        session.onPlayerRemoved = (id) => { if (this.match)
            this.match.playerRemoved(id); };
        session.onClosed = (message) => this.exitToStart(message);
        session.connect();
        this.lobbyView.selectedSlot = -1;
        this.showLobby();
        RkDom.setText(RkDom.byId("lobbyNotice"), notice);
    }
    showLobby() {
        this.screens.show("lobby");
        this.editor.mount(RkDom.byId("lobbyProfileHost"));
        this.editor.setActive(true);
        if (this.session)
            this.lobbyView.render(this.session);
    }
    showStart(message) {
        this.screens.show("start");
        this.editor.mount(RkDom.byId("profileHost"));
        this.editor.setActive(true);
        this.showStartMessage(message);
    }
    onSessionChange(kind) {
        const session = this.session;
        if (!session)
            return;
        if (this.screens.current === "lobby" && (kind === "players" || kind === "host" || kind === "status"))
            this.lobbyView.render(session);
        if (kind === "status" || kind === "match" || kind === "end" || (kind === "players" && session.status === "play" && !this.match))
            this.syncPhase();
        if (this.match)
            this.match.applyChange(kind);
    }
    syncPhase() {
        const session = this.session;
        if (!session)
            return;
        const end = session.value("end");
        if (session.status === "lobby") {
            if (this.match)
                this.disposeMatch();
            if (this.screens.current !== "lobby")
                this.showLobby();
            this.lobbyView.render(session);
        }
        else if (session.status === "play" && session.value("match") && !this.match && session.me()) {
            this.editor.setActive(false);
            this.match = new SoccerMatch(this.services, session);
            this.screens.show("game", !session.isSpectator());
        }
        else if (session.status === "end" && end && this.screens.current !== "end") {
            if (this.match)
                this.match.markEnded();
            this.endView.render(session, end);
            this.screens.show("end");
            RkDom.show(RkDom.byId("btnToLobby"), session.isHost());
            RkDom.setText(RkDom.byId("endHint"), session.isHost() ? "" : "방장이 대기실로 돌아가길 기다려요…");
        }
    }
    disposeMatch() {
        if (this.match)
            this.match.dispose();
        this.match = null;
    }
    clickSeat(slot) {
        const session = this.session;
        if (!session || session.status !== "lobby")
            return;
        const seats = this.seatPlan.humanSeats(session.players);
        if (session.isHost()) {
            const picked = this.lobbyView.selectedSlot;
            if (picked < 0)
                this.lobbyView.selectedSlot = slot;
            else if (picked === slot)
                this.lobbyView.selectedSlot = -1;
            else {
                const updates = this.seatPlan.swapUpdates(session.players, picked, slot);
                if (Object.keys(updates).length)
                    session.ref.update(updates);
                this.lobbyView.selectedSlot = -1;
            }
            this.lobbyView.render(session);
            return;
        }
        const me = session.me();
        if (me && !seats[slot])
            session.ref.child("players/" + session.myId).update({ slot, spectator: false });
    }
    toggleSeatMode() {
        const session = this.session;
        if (!session || session.status !== "lobby")
            return;
        if (session.isSpectator()) {
            const seat = this.seatPlan.freeSeat(session.players);
            if (seat >= 0)
                session.ref.child("players/" + session.myId).update({ slot: seat, spectator: false });
        }
        else if (this.seatPlan.spectators(session.players).length === 0) {
            session.ref.child("players/" + session.myId).update({ slot: SocConfig.SPECTATOR_SLOT, spectator: true });
        }
    }
    startMatch() {
        const session = this.session;
        if (!session || !session.isHost() || session.status !== "lobby")
            return;
        const humans = this.seatPlan.humanSeats(session.players);
        const seats = {};
        const updates = {};
        for (let slot = 0; slot < SocConfig.SEAT_COUNT; slot++) {
            const human = humans[slot];
            if (human) {
                seats["s" + slot] = human;
                continue;
            }
            const botId = "bot" + Math.random().toString(36).slice(2, 8);
            seats["s" + slot] = botId;
            const record = { nick: SocConfig.BOT_NAMES[slot], isBot: true, joinedAt: this.backend.now() + 1 + slot, slot, look: SocBotLooks.create(SocConfig.teamOfSlot(slot)) };
            updates["players/" + botId] = record;
        }
        const match = { id: 1 + Math.floor(Math.random() * 1000000000), startAt: this.backend.now(), seats };
        Object.assign(updates, { match, status: "play", st: null, in: null, ball: null, game: null, end: null });
        session.ref.update(updates);
    }
    returnToLobby() {
        const session = this.session;
        if (!session || !session.isHost())
            return;
        const updates = { status: "lobby", match: null, ball: null, game: null, end: null, st: null, in: null };
        session.players.forEach((record, id) => { if (record.isBot)
            updates["players/" + id] = null; });
        session.ref.update(updates);
    }
    leaveRoom() {
        if (this.session)
            this.session.leave();
        this.session = null;
        this.disposeMatch();
        this.showStart("");
    }
    exitToStart(message) {
        if (this.session)
            this.session.silentClose();
        this.session = null;
        this.disposeMatch();
        this.showStart(message);
    }
    step(timeMs) {
        const deltaSeconds = Math.min(0.1, Math.max(0, (timeMs - this.lastFrameMs) / 1000));
        this.lastFrameMs = timeMs;
        if (this.match) {
            this.backdrop.hide();
            this.match.update(deltaSeconds);
        }
        else {
            this.backdrop.show();
            this.backdrop.render(deltaSeconds);
        }
    }
}
