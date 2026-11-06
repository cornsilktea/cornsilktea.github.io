"use strict";
class ProfilePanel {
    constructor(editor) {
        this.editor = editor;
        this.ready = false;
        this.host = null;
        this.active = false;
    }
    markReady() {
        this.ready = true;
        if (this.host)
            this.show(this.host);
    }
    mountInto(host) {
        this.host = host;
        if (this.ready)
            this.show(host);
    }
    setActive(active) {
        this.active = active;
        if (this.ready)
            this.editor.setActive(active);
    }
    show(host) {
        this.editor.mount(host);
        this.editor.setActive(this.active);
    }
}
class GamePhase {
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
class PhaseMachine {
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
class MenuPhase extends GamePhase {
    update(dt, draw) {
        if (draw)
            this.services.stage.renderBackdrop(this.services.clock.now());
    }
    showMenu(screen, profileHost) {
        this.services.screens.show(screen);
        this.services.stage.showMenuFloor();
        this.services.profilePanel.setActive(true);
        this.services.profilePanel.mountInto(profileHost);
    }
}
class StartPhase extends MenuPhase {
    enter() {
        this.showMenu("start", this.services.startProfileHost);
    }
}
class LobbyPhase extends MenuPhase {
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
class ActiveMatchPhase extends GamePhase {
    constructor() {
        super(...arguments);
        this.rosterClock = 0;
    }
    enter() {
        this.services.screens.show("game");
        this.services.profilePanel.setActive(false);
    }
    update(dt, draw) {
        const match = this.services.runtime.match;
        if (!match)
            return;
        const subject = this.services.runtime.step(dt, draw);
        const t = this.services.clock.now();
        this.rosterClock += dt;
        if (this.rosterClock > ActiveMatchPhase.ROSTER_REFRESH_SECONDS) {
            this.rosterClock = 0;
            this.services.hud.renderRoster(match, this.services.localId, this.services.runtime.roundNumber);
        }
        this.services.hud.renderTimers(t, match, this.services.localId);
        this.showMessages(t, match, subject);
        this.afterUpdate(t, match);
    }
    afterUpdate(t, match) {
        return;
    }
}
ActiveMatchPhase.ROSTER_REFRESH_SECONDS = 0.2;
class CountdownPhase extends ActiveMatchPhase {
    constructor(services, transitions, playPhase) {
        super(services);
        this.transitions = transitions;
        this.playPhase = playPhase;
    }
    showMessages(t, match, subject) {
        const left = match.startAt() - t;
        this.services.messages.showBanner("", false);
        this.services.messages.showCenter(left > 0 ? String(Math.ceil(left / 1000)) : "");
        this.services.messages.showSpectateButton(false);
    }
    afterUpdate(t, match) {
        if (match.hasStarted(t))
            this.transitions.goTo(this.playPhase());
    }
}
class PlayPhase extends ActiveMatchPhase {
    showMessages(t, match, subject) {
        const mine = match.contestant(this.services.localId);
        const out = !!mine && mine.fighter.isOut();
        const suddenDeath = t - match.startAt() > LastTileRules.SUDDEN_START_S * 1000;
        let banner = suddenDeath ? PlayPhase.SUDDEN_DEATH_MESSAGE : "";
        if (out)
            banner = "탈락! " + this.spectatingText(match, subject, mine);
        this.services.messages.showBanner(banner, suddenDeath);
        this.services.messages.showCenter("");
        this.services.messages.showSpectateButton(out);
    }
    spectatingText(match, subject, mine) {
        const watched = subject && subject !== mine.fighter ? match.contestant(subject.id) : null;
        return watched ? Html.escape(watched.participant.nick) + " 관전 중" : "관전 중";
    }
}
PlayPhase.SUDDEN_DEATH_MESSAGE = "서든데스! 위층 바깥부터 무너집니다";
class ResultPhase extends GamePhase {
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
            view.renderRound(session.round.n, scores, (session.resultsRecord() || {})[session.round.n] || {}, this.services.localId, this.services.directory);
        view.showButtons(final, session.isHost());
    }
    showCountdown() {
        const session = this.services.session();
        if (!session || session.status !== "roundEnd" || !session.round)
            return;
        const left = Math.max(0, Math.ceil((session.nextAt - session.now()) / 1000));
        this.services.resultView.showCountdown(session.round.n < LastTileRules.TOTAL_ROUNDS ? "다음 판 " + left + "초 후 시작" : "최종 결과 " + left + "초 후");
    }
}
