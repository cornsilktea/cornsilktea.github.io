"use strict";
class LocalControllerRule {
    constructor(localId, movement) {
        this.localId = localId;
        this.movement = movement;
    }
    matches(participant) { return participant.id === this.localId; }
    create(participant) { return new LocalPlayerController(this.movement); }
}
class AiControllerRule {
    constructor(host, random) {
        this.host = host;
        this.random = random;
    }
    matches(participant) { return participant.ai; }
    create(participant) { return new AiController(new AiBrain(new RandomRange(this.random)), this.host); }
}
class RemoteControllerRule {
    matches(participant) { return true; }
    create(participant) { return new RemotePlayerController(); }
}
class RoundControllers {
    constructor(localId, movement, host, random) {
        this.rules = [new LocalControllerRule(localId, movement), new AiControllerRule(host, random), new RemoteControllerRule()];
    }
    controllerFor(participant) {
        return this.rules.find((rule) => rule.matches(participant)).create(participant);
    }
}
class FighterViews {
    constructor(kit, factory, assets, world) {
        this.kit = kit;
        this.factory = factory;
        this.assets = assets;
        this.world = world;
        this.views = new Map();
    }
    rebuild(match, looks) {
        this.clear();
        match.contestants().forEach((contestant) => {
            const look = looks.get(contestant.id) || CharacterLooks.createDefault();
            this.views.set(contestant.id, new FighterView(this.kit, this.factory, this.assets.clips, this.world, contestant.participant, look, contestant.fighter.yaw));
        });
    }
    update(match, dt, t, subject, shownFloor) {
        match.contestants().forEach((contestant) => {
            const view = this.views.get(contestant.id);
            if (view)
                view.update(contestant.fighter, { t, dt, subject, shownFloor, simulatedHere: contestant.controller.simulatesHere() });
        });
    }
    clear() {
        this.views.forEach((view) => view.dispose());
        this.views.clear();
    }
}
class StageRenderer {
    constructor(world, board, floors, camera, subjects, views) {
        this.world = world;
        this.board = board;
        this.floors = floors;
        this.camera = camera;
        this.subjects = subjects;
        this.views = views;
        this.backdropBoard = TileBoard.inactive();
    }
    get shownFloor() { return this.floors.shownFloor; }
    isReady() {
        return this.board.isBuilt();
    }
    showMenuFloor() {
        this.floors.showTop();
        this.board.showUpTo(LastTileRules.FLOOR_COUNT - 1);
    }
    prepareForMatch(match, looks) {
        this.views.rebuild(match, looks);
        this.floors.showTop();
        this.camera.reset();
        this.subjects.reset();
    }
    releaseMatch() {
        this.views.clear();
        this.floors.showTop();
        this.camera.reset();
    }
    subjectOf(match) {
        return this.subjects.subject(match);
    }
    spectateNext(match) {
        this.subjects.cycle(match);
    }
    renderBackdrop(t) {
        if (this.board.isBuilt()) {
            this.board.showUpTo(LastTileRules.FLOOR_COUNT - 1);
            this.board.render(this.backdropBoard, t, LastTileRules.FLOOR_COUNT - 1);
        }
        this.camera.showcase();
        this.world.render();
    }
    renderMatch(match, dt, t, subject) {
        this.floors.follow(subject);
        this.views.update(match, dt, t, subject, this.floors.shownFloor);
        if (this.board.isBuilt())
            this.board.render(match.board, t, this.floors.shownFloor);
        this.camera.follow(dt, subject, this.floors.shownFloor);
        this.world.render();
    }
}
class MatchRuntime {
    constructor(stage, clock, localId, movement, host, random) {
        this.stage = stage;
        this.clock = clock;
        this.localId = localId;
        this.movement = movement;
        this.host = host;
        this.random = random;
        this.active = null;
        this.startedRound = null;
    }
    get match() { return this.active; }
    get roundNumber() { return this.startedRound ? this.startedRound.n : 0; }
    isRoundStarted(startAt) {
        return this.startedRound !== null && this.startedRound.startAt === startAt;
    }
    begin(round, participants, looks, channel) {
        this.dispose();
        const services = {
            clock: this.clock,
            channel,
            controllers: new RoundControllers(this.localId, this.movement, this.host, this.random),
            localId: this.localId
        };
        this.startedRound = round;
        this.active = new LastTileMatch({ seed: round.seed, startAt: round.startAt, participants }, services);
        this.stage.prepareForMatch(this.active, looks);
    }
    step(dt, draw) {
        const match = this.active;
        if (!match)
            return null;
        match.tick(dt);
        const subject = this.stage.subjectOf(match);
        if (draw)
            this.stage.renderMatch(match, dt, this.clock.now(), subject);
        return subject;
    }
    conclude() {
        if (this.active)
            this.active.conclude();
    }
    localPush() {
        if (this.active)
            this.active.localPush();
    }
    localDash() {
        if (this.active)
            this.active.localDash();
    }
    spectateNext() {
        if (this.active)
            this.stage.spectateNext(this.active);
    }
    receiveRemoteState(id, snapshot) {
        if (this.active)
            this.active.receiveRemoteState(id, snapshot);
    }
    receivePush(event) {
        if (this.active)
            this.active.receivePush(event);
    }
    receiveTileStep(floor, index, t) {
        if (this.active)
            this.active.receiveTileStep(floor, index, t);
    }
    arbitrateTile(floor, index, requestedAt) {
        return this.active ? this.active.arbitrateTileRequest(floor, index, requestedAt) : null;
    }
    receiveOut(id, record) {
        if (this.active)
            this.active.receiveOut(id, record.t);
    }
    markDeparted(id) {
        if (this.active)
            this.active.markDeparted(id);
    }
    hasUnrecordedFighter(id) {
        return !!this.active && !!this.active.contestant(id) && !this.active.isOut(id);
    }
    dispose() {
        if (this.active)
            this.active.dispose();
        this.active = null;
        this.startedRound = null;
        this.stage.releaseMatch();
    }
}
