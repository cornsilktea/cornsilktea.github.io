class FloorLabel implements PhaseVisitor<string> {
  constructor(private readonly outLabel: string) {}

  grounded(floor: number): string { return (floor + 1) + "층"; }
  falling(): string { return "낙하"; }
  out(): string { return this.outLabel; }
}

class FloorCensus implements PhaseVisitor<void> {
  private readonly perFloor = new Map<number, number>();
  private fallingCount = 0;

  grounded(floor: number): void { this.perFloor.set(floor, (this.perFloor.get(floor) || 0) + 1); }
  falling(): void { this.fallingCount++; }
  out(): void { return; }

  summary(): string {
    const parts: string[] = [];
    for (let floor = LastTileRules.FLOOR_COUNT - 1; floor >= 0; floor--) {
      const count = this.perFloor.get(floor);
      if (count) parts.push((floor + 1) + "층 " + count + "명");
    }
    if (this.fallingCount) parts.push("낙하 " + this.fallingCount + "명");
    return parts.join(" · ");
  }
}

class HudView {
  private readonly players: HTMLElement;
  private readonly floors: HTMLElement;
  private readonly round: HTMLElement;
  private readonly alive: HTMLElement;
  private readonly time: HTMLElement;
  private readonly pushBar: HTMLElement;
  private readonly dashBar: HTMLElement;
  private readonly pushButtonCooldown: HTMLElement;
  private readonly dashButtonCooldown: HTMLElement;

  constructor(private readonly page: Page) {
    this.players = page.byId("hudPlayers");
    this.floors = page.byId("hudFloors");
    this.round = page.byId("hudRound");
    this.alive = page.byId("hudAlive");
    this.time = page.byId("hudTime");
    this.pushBar = page.byId("cdPush");
    this.dashBar = page.byId("cdDash");
    this.pushButtonCooldown = page.byId("btnPushCd");
    this.dashButtonCooldown = page.byId("btnDashCd");
  }

  renderRoster(match: LastTileMatch, localId: string, roundNumber: number): void {
    const contestants = match.contestants();
    this.players.innerHTML = contestants.map((contestant) => this.rosterRow(match, contestant, localId)).join("");
    const census = new FloorCensus();
    contestants.forEach((contestant) => contestant.fighter.inspect(census));
    this.page.setText(this.floors, census.summary());
    this.page.setText(this.round, roundNumber + " / " + LastTileRules.TOTAL_ROUNDS + " 판");
    const alive = contestants.filter((contestant) => !contestant.fighter.isOut()).length;
    this.page.setText(this.alive, "남은 인원 " + alive + "명");
  }

  renderTimers(t: number, match: LastTileMatch, localId: string): void {
    const elapsed = Math.max(0, (t - match.startAt()) / 1000);
    const waiting = !match.hasStarted(t);
    this.page.setText(this.time, waiting ? "0:00" : Math.floor(elapsed / 60) + ":" + ("0" + Math.floor(elapsed % 60)).slice(-2));
    const mine = match.contestant(localId);
    const push = mine ? mine.fighter.pushCooldownLeft(t) : 0, dash = mine ? mine.fighter.dashCooldownLeft(t) : 0;
    this.pushBar.style.transform = "scaleX(" + (1 - push) + ")";
    this.dashBar.style.transform = "scaleX(" + (1 - dash) + ")";
    this.pushButtonCooldown.style.height = push * 100 + "%";
    this.dashButtonCooldown.style.height = dash * 100 + "%";
  }

  private rosterRow(match: LastTileMatch, contestant: Contestant, localId: string): string {
    const fighter = contestant.fighter;
    const outLabel = match.isOut(contestant.id) ? match.provisionalRank(contestant.id) + "위" : "탈락";
    const classes = "pl" + (contestant.id === localId ? " me" : "") + (fighter.isOut() ? " dead" : "");
    const participant = contestant.participant;
    return "<div class='" + classes + "'><i style='background:" + Palette.slotColor(participant.slot) + "'></i><b>" + Html.escape(participant.nick) + (participant.ai ? " (AI)" : "") + "</b><span>" + fighter.inspect(new FloorLabel(outLabel)) + "</span></div>";
  }
}

class MessageView {
  private readonly banner: HTMLElement;
  private readonly bannerBox: HTMLElement;
  private readonly center: HTMLElement;
  private readonly spectateBox: HTMLElement;
  private lastBanner = "";
  private lastCenter = "";

  constructor(private readonly page: Page) {
    this.banner = page.byId("banner");
    this.bannerBox = page.byId("bannerBox");
    this.center = page.byId("centerMsg");
    this.spectateBox = page.byId("specBox");
  }

  onSpectateNext(handler: () => void): void {
    const button = this.page.byId("btnSpec");
    button.onclick = handler;
    button.addEventListener("touchstart", (event) => event.stopPropagation(), { passive: true });
  }

  showBanner(html: string, warning: boolean): void {
    const key = html + warning;
    if (key === this.lastBanner) return;
    this.lastBanner = key;
    this.page.show(this.banner, !!html);
    this.bannerBox.innerHTML = html;
    this.bannerBox.classList.toggle("warn", warning);
  }

  showCenter(text: string): void {
    if (text === this.lastCenter) return;
    this.lastCenter = text;
    this.page.show(this.center, !!text);
    this.center.textContent = text;
  }

  showSpectateButton(visible: boolean): void {
    this.page.show(this.spectateBox, visible);
  }

  clear(): void {
    this.lastBanner = "";
    this.lastCenter = "";
    this.page.show(this.banner, false);
    this.page.show(this.center, false);
    this.page.show(this.spectateBox, false);
  }
}

type LastTileScreenName = "start" | "lobby" | "game" | "result";

class LastTileScreens {
  private readonly start: HTMLElement;
  private readonly lobby: HTMLElement;
  private readonly result: HTMLElement;
  private readonly hudList: HTMLElement;
  private readonly hudRight: HTMLElement;
  private readonly joystickZone: HTMLElement;
  private readonly joystickBase: HTMLElement;
  private readonly pushButton: HTMLElement;
  private readonly dashButton: HTMLElement;
  private shown: LastTileScreenName = "start";

  constructor(private readonly page: Page, private readonly touchDevice: boolean, private readonly messages: MessageView) {
    this.start = page.byId("startScreen");
    this.lobby = page.byId("lobbyScreen");
    this.result = page.byId("resultScreen");
    this.hudList = page.byId("hudList");
    this.hudRight = page.byId("hudRight");
    this.joystickZone = page.byId("joyZone");
    this.joystickBase = page.byId("joyBase");
    this.pushButton = page.byId("btnPush");
    this.dashButton = page.byId("btnDash");
  }

  get current(): LastTileScreenName { return this.shown; }

  isMenuScreen(): boolean {
    return this.shown === "start" || this.shown === "lobby";
  }

  show(name: LastTileScreenName): void {
    this.shown = name;
    this.page.show(this.start, name === "start");
    this.page.show(this.lobby, name === "lobby");
    this.page.show(this.result, name === "result");
    const playing = name === "game";
    this.page.show(this.hudList, playing);
    this.page.show(this.hudRight, playing);
    const touchControls = playing && this.touchDevice;
    this.page.show(this.joystickZone, touchControls);
    this.page.show(this.pushButton, touchControls);
    this.page.show(this.dashButton, touchControls);
    if (!touchControls) this.page.show(this.joystickBase, false);
    if (!playing) this.messages.clear();
  }
}
