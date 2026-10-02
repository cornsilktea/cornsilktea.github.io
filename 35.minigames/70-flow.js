"use strict";
class GameRuntime {
    constructor(catalog, shell, hub) {
        this.catalog = catalog;
        this.shell = shell;
        this.hub = hub;
        this.active = null;
        this.activeRound = null;
        this.activeSession = null;
    }
    get game() { return this.active; }
    get round() { return this.activeRound; }
    isRoundStarted(startAt) {
        return this.activeRound !== null && this.activeRound.startAt === startAt;
    }
    begin(round, participants, looks, session) {
        this.dispose();
        const definition = this.catalog.find(round.kind);
        if (!definition)
            return false;
        const shell = this.shell;
        const game = definition.create({
            seed: round.seed, startAt: round.startAt, participants, looks,
            localId: shell.localId, clock: shell.clock, wire: session.wireFor(round.kind), host: shell.host, render: shell.render,
            movement: this.hub, libs: shell.libs, page: shell.page, env: shell.env, characters: shell.characters
        });
        this.active = game;
        this.activeRound = round;
        this.activeSession = session;
        session.listenGame(round.kind, game.streams(), (stream, key, value) => game.receive(stream, key, value));
        this.hub.configure(game.controls(), this);
        return true;
    }
    step(dt, draw) {
        if (this.active)
            this.active.tick(dt, draw);
    }
    conclude() {
        if (this.active)
            this.active.conclude();
    }
    playerDeparted(id) {
        if (this.active)
            this.active.playerDeparted(id);
    }
    onAction(action) {
        if (this.active)
            this.active.perform(action);
    }
    onSpectateNext() {
        if (this.active)
            this.active.spectateNext();
    }
    dispose() {
        if (this.activeSession)
            this.activeSession.closeGame();
        if (this.active)
            this.active.dispose();
        this.active = null;
        this.activeRound = null;
        this.activeSession = null;
        this.hub.clear();
        this.shell.render.clear();
    }
}
class CollectionPhase {
    constructor(services) {
        this.services = services;
    }
    exit() {
        return;
    }
    refresh() {
        return;
    }
}
class CollectionPhaseMachine {
    constructor() {
        this.current = null;
    }
    goTo(phase) {
        if (this.current === phase) {
            phase.refresh();
            return;
        }
        if (this.current)
            this.current.exit();
        this.current = phase;
        phase.enter();
    }
    update(dt, draw) {
        if (this.current)
            this.current.update(dt, draw);
    }
}
class MenuScreenPhase extends CollectionPhase {
    update(dt, draw) {
        if (draw)
            this.services.render.clear();
    }
    showMenu(screen, profileHost) {
        this.services.screens.show(screen);
        this.services.profilePanel.setActive(true);
        this.services.profilePanel.mountInto(profileHost);
    }
}
class StartScreenPhase extends MenuScreenPhase {
    enter() {
        this.showMenu("start", this.services.startProfileHost);
    }
}
class LobbyScreenPhase extends MenuScreenPhase {
    enter() {
        this.showMenu("lobby", this.services.lobbyProfileHost);
        this.refresh();
    }
    refresh() {
        const session = this.services.session();
        if (session && this.services.screens.current === "lobby")
            this.services.lobbyView.render(session);
    }
}
class PlayScreenPhase extends CollectionPhase {
    constructor() {
        super(...arguments);
        this.rosterClock = 0;
    }
    enter() {
        this.services.screens.show("game");
        this.services.profilePanel.setActive(false);
        this.rosterClock = PlayScreenPhase.ROSTER_REFRESH_SECONDS;
    }
    update(dt, draw) {
        const game = this.services.runtime.game;
        const session = this.services.session();
        if (!game || !session || !session.round)
            return;
        this.services.runtime.step(dt, draw);
        const model = game.hud(this.services.clock.now());
        this.rosterClock += dt;
        if (this.rosterClock > PlayScreenPhase.ROSTER_REFRESH_SECONDS) {
            this.rosterClock = 0;
            this.services.hud.renderRoster(model, this.services.localId, this.roundLabel(session, session.round), this.spectatorNames(session, session.round));
        }
        this.services.hud.renderLive(model);
        model.cooldowns.forEach((cooldown) => this.services.hub.setCooldown(cooldown.action, cooldown.left));
        this.services.messages.showBanner(model.bannerHtml, model.bannerWarning);
        this.services.messages.showCenter(model.centerText);
        this.services.messages.showSpectateButton(model.spectateButton);
    }
    roundLabel(session, round) {
        const definition = this.services.catalog.find(round.kind);
        return round.n + " / " + session.plan.length + " · " + (definition ? definition.title : "");
    }
    spectatorNames(session, round) {
        return session.playerIds().filter((id) => round.roster.indexOf(id) < 0).map((id) => session.player(id).nick);
    }
}
PlayScreenPhase.ROSTER_REFRESH_SECONDS = 0.2;
class ResultScreenPhase extends CollectionPhase {
    enter() {
        this.services.screens.show("result");
        this.services.runtime.conclude();
        this.services.profilePanel.setActive(false);
        this.refresh();
    }
    update(dt, draw) {
        this.services.runtime.step(dt, draw);
        this.showCountdown();
    }
    refresh() {
        const session = this.services.session();
        if (!session || !session.round)
            return;
        const view = this.services.resultView;
        const final = session.status === "final";
        const scores = new TournamentScores(session.resultsRecord());
        if (final)
            view.renderFinal(scores, this.services.localId, this.services.directory);
        else
            view.renderRound(session.round, session.plan.length, scores, (session.resultsRecord() || {})[session.round.n] || {}, this.services.localId, this.services.directory);
        view.showButtons(final, session.isHost());
    }
    showCountdown() {
        const session = this.services.session();
        if (!session || session.status !== "roundEnd" || !session.round)
            return;
        const left = Math.max(0, Math.ceil((session.nextAt - session.now()) / 1000));
        const next = this.services.catalog.find(session.plan[session.round.n] || "");
        this.services.resultView.showCountdown(next ? "다음 종목 · " + next.title + " · " + left + "초 후 시작" : "최종 결과 " + left + "초 후");
    }
}
class CollectionFlow {
    constructor(services) {
        this.services = services;
        this.current = null;
        this.director = null;
        this.statusHandlers = {
            lobby: () => this.openLobby(),
            play: () => this.openRound(),
            roundEnd: () => this.services.phases.goTo(this.services.resultPhase),
            final: () => this.services.phases.goTo(this.services.resultPhase)
        };
        services.startView.onCreate(() => this.createRoom());
        services.startView.onJoin(() => this.joinRoom());
        services.startView.onEnterInCode(() => this.joinRoom());
        services.lobbyView.onStart(() => { if (this.director)
            this.director.startCollection(); });
        services.lobbyView.onLeave(() => this.leaveRoom());
        services.resultView.onLeave(() => this.leaveRoom());
        services.resultView.onToLobby(() => { if (this.director)
            this.director.backToLobby(); });
        services.env.onPageHide(() => { if (this.current)
            this.current.removeMineOnUnload(); });
    }
    session() {
        return this.current;
    }
    isHost() {
        return !!this.current && this.current.isHost();
    }
    lookup(id) {
        const session = this.current;
        if (!session || !session.hasPlayer(id))
            return null;
        const record = session.player(id);
        return { nick: record.nick, slot: record.slot, ai: record.isAI };
    }
    tickHost() {
        if (this.director)
            this.director.tick(this.services.runtime.game);
    }
    pushProfile() {
        const session = this.current;
        if (!session || !session.hasPlayer(session.myId))
            return;
        session.pushProfile(this.services.profile.nick || session.player(session.myId).nick, this.services.profile.look);
    }
    playersChanged() { this.services.lobbyPhase.refresh(); }
    hostChanged() {
        this.services.lobbyPhase.refresh();
        this.settleDepartures();
    }
    winsChanged() { this.services.lobbyPhase.refresh(); }
    statusChanged() { this.syncPhase(); }
    roundChanged() { this.syncPhase(); }
    closed(message) { this.exitToStart(message); }
    playerLeft(id) {
        this.services.runtime.playerDeparted(id);
    }
    resultsChanged() {
        const session = this.current;
        if (session && (session.status === "roundEnd" || session.status === "final"))
            this.services.resultPhase.refresh();
    }
    settleDepartures() {
        const session = this.current;
        const round = this.services.runtime.round;
        if (!session || !round || !session.isHost() || session.status !== "play")
            return;
        round.roster.filter((id) => !session.hasPlayer(id)).forEach((id) => this.services.runtime.playerDeparted(id));
    }
    myRecord(slot) {
        const profile = this.services.profile;
        return { nick: PlayerProfile.cleanNick(profile.nick) || profile.nickOrDefault(), isAI: false, joinedAt: this.services.backend.clock.now(), slot, look: profile.look };
    }
    async createRoom() {
        const view = this.services.startView;
        if (!this.services.backend.isOnline())
            return;
        view.setCreateEnabled(false);
        view.showMessage("");
        try {
            const code = await this.services.directory.create(this.services.localId, this.myRecord(0));
            if (code)
                this.enterRoom(code);
            else
                view.showMessage("방을 만들지 못했어요. 다시 눌러 주세요.");
        }
        catch (error) {
            view.showMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
        }
        view.setCreateEnabled(true);
    }
    async joinRoom() {
        const view = this.services.startView;
        if (!this.services.backend.isOnline())
            return;
        const code = view.enteredCode();
        if (code.length !== CollectionRules.ROOM_CODE_LENGTH) {
            view.showMessage("방 코드 5자리를 입력해 주세요.");
            return;
        }
        view.setJoinEnabled(false);
        view.showMessage("");
        try {
            const outcome = await this.services.directory.join(code, this.services.localId, (existing) => this.myRecord(SlotAllocator.freeSlot(existing.values())));
            view.setJoinEnabled(true);
            if (outcome.ok)
                this.enterRoom(code);
            else
                view.showMessage(outcome.message);
        }
        catch (error) {
            view.setJoinEnabled(true);
            view.showMessage("방을 불러오지 못했어요.");
        }
    }
    enterRoom(code) {
        this.services.runtime.dispose();
        const session = new CollectionSession(this.services.backend, this.services.env, code, this.services.localId, this);
        this.current = session;
        this.director = new CollectionDirector(session, this.services.catalog, this.services.random);
        session.connect();
        this.services.lobbyView.showCode(code);
        this.services.phases.goTo(this.services.lobbyPhase);
    }
    leaveRoom() {
        if (this.current)
            this.current.leave();
        this.returnToStart("");
    }
    exitToStart(message) {
        if (this.current)
            this.current.silentClose();
        this.returnToStart(message);
    }
    returnToStart(message) {
        this.current = null;
        this.director = null;
        this.services.runtime.dispose();
        this.services.hub.releaseAll();
        this.services.phases.goTo(this.services.startPhase);
        this.services.startView.showMessage(message);
    }
    syncPhase() {
        if (this.current)
            this.statusHandlers[this.current.status]();
    }
    openLobby() {
        this.services.runtime.dispose();
        this.services.phases.goTo(this.services.lobbyPhase);
    }
    openRound() {
        const session = this.current;
        const round = session ? session.round : null;
        if (!session || !round || this.services.runtime.isRoundStarted(round.startAt))
            return;
        const participants = [];
        const looks = new Map();
        round.roster.forEach((id, index) => {
            const record = session.hasPlayer(id) ? session.player(id) : null;
            participants.push({ id, nick: record ? record.nick || "?" : "?", ai: !!(record && (record.ai || record.isAI)), slot: record ? record.slot || 0 : index });
            looks.set(id, record ? record.look : CharacterLooks.createDefault());
        });
        if (this.services.runtime.begin(round, participants, looks, session))
            this.services.phases.goTo(this.services.playPhase);
    }
}
