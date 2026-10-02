class ProfilePanel {
  private ready = false;
  private host: HTMLElement | null = null;
  private active = false;

  constructor(private readonly editor: ProfileEditor) {}

  markReady(): void {
    this.ready = true;
    if (this.host) this.show(this.host);
  }

  mountInto(host: HTMLElement): void {
    this.host = host;
    if (this.ready) this.show(host);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (this.ready) this.editor.setActive(active);
  }

  private show(host: HTMLElement): void {
    this.editor.mount(host);
    this.editor.setActive(this.active);
  }
}

interface SessionAccess {
  session(): LastTileRoomSession | null;
}

interface PhaseServices extends SessionAccess {
  readonly clock: Clock;
  readonly page: Page;
  readonly screens: LastTileScreens;
  readonly runtime: MatchRuntime;
  readonly stage: StageRenderer;
  readonly hud: HudView;
  readonly messages: MessageView;
  readonly lobbyView: LastTileLobbyView;
  readonly resultView: ResultView;
  readonly profilePanel: ProfilePanel;
  readonly startProfileHost: HTMLElement;
  readonly lobbyProfileHost: HTMLElement;
  readonly localId: string;
  readonly directory: ParticipantDirectory;
}

abstract class GamePhase {
  constructor(protected readonly services: PhaseServices) {}

  abstract enter(): void;
  abstract update(dt: number, draw: boolean): void;

  exit(): void {
    return;
  }

  refresh(): void {
    return;
  }
}

class PhaseMachine {
  private current: GamePhase | null = null;

  goTo(phase: GamePhase): void {
    if (this.current === phase) {
      phase.refresh();
      return;
    }
    if (this.current) this.current.exit();
    this.current = phase;
    phase.enter();
  }

  update(dt: number, draw: boolean): void {
    if (this.current) this.current.update(dt, draw);
  }
}

abstract class MenuPhase extends GamePhase {
  update(dt: number, draw: boolean): void {
    if (draw) this.services.stage.renderBackdrop(this.services.clock.now());
  }

  protected showMenu(screen: LastTileScreenName, profileHost: HTMLElement): void {
    this.services.screens.show(screen);
    this.services.stage.showMenuFloor();
    this.services.profilePanel.setActive(true);
    this.services.profilePanel.mountInto(profileHost);
  }
}

class StartPhase extends MenuPhase {
  enter(): void {
    this.showMenu("start", this.services.startProfileHost);
  }
}

class LobbyPhase extends MenuPhase {
  enter(): void {
    this.showMenu("lobby", this.services.lobbyProfileHost);
    this.refresh();
  }

  refresh(): void {
    const session = this.services.session();
    if (session && this.services.screens.current === "lobby") this.services.lobbyView.render(session);
  }
}

abstract class ActiveMatchPhase extends GamePhase {
  private static readonly ROSTER_REFRESH_SECONDS = 0.2;
  private rosterClock = 0;

  enter(): void {
    this.services.screens.show("game");
    this.services.profilePanel.setActive(false);
  }

  update(dt: number, draw: boolean): void {
    const match = this.services.runtime.match;
    if (!match) return;
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

  protected afterUpdate(t: number, match: LastTileMatch): void {
    return;
  }

  protected abstract showMessages(t: number, match: LastTileMatch, subject: Fighter | null): void;
}

class CountdownPhase extends ActiveMatchPhase {
  constructor(services: PhaseServices, private readonly transitions: { goTo(phase: GamePhase): void }, private readonly playPhase: () => GamePhase) {
    super(services);
  }

  protected showMessages(t: number, match: LastTileMatch, subject: Fighter | null): void {
    const left = match.startAt() - t;
    this.services.messages.showBanner("", false);
    this.services.messages.showCenter(left > 0 ? String(Math.ceil(left / 1000)) : "");
    this.services.messages.showSpectateButton(false);
  }

  protected afterUpdate(t: number, match: LastTileMatch): void {
    if (match.hasStarted(t)) this.transitions.goTo(this.playPhase());
  }
}

class PlayPhase extends ActiveMatchPhase {
  private static readonly SUDDEN_DEATH_MESSAGE = "서든데스! 위층 바깥부터 무너집니다";

  protected showMessages(t: number, match: LastTileMatch, subject: Fighter | null): void {
    const mine = match.contestant(this.services.localId);
    const out = !!mine && mine.fighter.isOut();
    const suddenDeath = t - match.startAt() > LastTileRules.SUDDEN_START_S * 1000;
    let banner = suddenDeath ? PlayPhase.SUDDEN_DEATH_MESSAGE : "";
    if (out) banner = "탈락! " + this.spectatingText(match, subject, mine as Contestant);
    this.services.messages.showBanner(banner, suddenDeath);
    this.services.messages.showCenter("");
    this.services.messages.showSpectateButton(out);
  }

  private spectatingText(match: LastTileMatch, subject: Fighter | null, mine: Contestant): string {
    const watched = subject && subject !== mine.fighter ? match.contestant(subject.id) : null;
    return watched ? Html.escape(watched.participant.nick) + " 관전 중" : "관전 중";
  }
}

class ResultPhase extends GamePhase {
  enter(): void {
    this.services.screens.show("result");
    this.services.runtime.conclude();
    this.services.profilePanel.setActive(false);
    this.refresh();
  }

  update(dt: number, draw: boolean): void {
    this.services.runtime.step(dt, draw);
    this.showCountdown();
  }

  refresh(): void {
    const session = this.services.session();
    if (!session || !session.round) return;
    const view = this.services.resultView;
    const final = session.status === "final";
    const scores = new TournamentScores(session.resultsRecord());
    if (final) view.renderFinal(scores, this.services.localId, this.services.directory);
    else view.renderRound(session.round.n, scores, (session.resultsRecord() || {})[session.round.n] || {}, this.services.localId, this.services.directory);
    view.showButtons(final, session.isHost());
  }

  private showCountdown(): void {
    const session = this.services.session();
    if (!session || session.status !== "roundEnd" || !session.round) return;
    const left = Math.max(0, Math.ceil((session.nextAt - session.now()) / 1000));
    this.services.resultView.showCountdown(session.round.n < LastTileRules.TOTAL_ROUNDS ? "다음 판 " + left + "초 후 시작" : "최종 결과 " + left + "초 후");
  }
}
