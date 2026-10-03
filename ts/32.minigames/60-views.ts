type CollectionScreenName = "start" | "lobby" | "game" | "result";

class CollectionScreens {
  private readonly start: HTMLElement;
  private readonly lobby: HTMLElement;
  private readonly result: HTMLElement;
  private readonly hudList: HTMLElement;
  private readonly hudRight: HTMLElement;
  private shown: CollectionScreenName = "start";

  constructor(private readonly page: Page, private readonly touchDevice: boolean, private readonly messages: MessageView, private readonly hub: ActionHub) {
    this.start = page.byId("startScreen");
    this.lobby = page.byId("lobbyScreen");
    this.result = page.byId("resultScreen");
    this.hudList = page.byId("hudList");
    this.hudRight = page.byId("hudRight");
  }

  get current(): CollectionScreenName { return this.shown; }

  show(name: CollectionScreenName): void {
    this.shown = name;
    this.page.show(this.start, name === "start");
    this.page.show(this.lobby, name === "lobby");
    this.page.show(this.result, name === "result");
    const playing = name === "game";
    this.page.show(this.hudList, playing);
    this.page.show(this.hudRight, playing);
    this.hub.showTouchControls(playing && this.touchDevice);
    if (!playing) this.messages.clear();
  }
}

class CollectionHud {
  private readonly players: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly spectators: HTMLElement;
  private readonly round: HTMLElement;
  private readonly alive: HTMLElement;
  private readonly time: HTMLElement;
  private readonly cooldowns: HTMLElement;
  private cooldownSignature = "";

  constructor(private readonly page: Page) {
    this.players = page.byId("hudPlayers");
    this.summary = page.byId("hudFloors");
    this.spectators = page.byId("hudSpectators");
    this.round = page.byId("hudRound");
    this.alive = page.byId("hudAlive");
    this.time = page.byId("hudTime");
    this.cooldowns = page.byId("hudCooldowns");
  }

  renderRoster(model: HudModel, localId: string, roundLabel: string, spectatorNames: readonly string[]): void {
    this.players.innerHTML = model.rows.map((row) => this.rosterRow(row, localId)).join("");
    this.page.setText(this.summary, model.summary);
    this.page.setText(this.round, roundLabel);
    this.page.setText(this.alive, model.footer);
    this.page.setText(this.spectators, spectatorNames.length ? "관전 중: " + spectatorNames.join(", ") : "");
  }

  renderLive(model: HudModel): void {
    this.page.setText(this.time, model.clock);
    this.syncCooldownRows(model.cooldowns);
    model.cooldowns.forEach((cooldown) => {
      const bar = this.cooldowns.querySelector<HTMLElement>("i[data-action='" + cooldown.action + "']");
      if (bar) bar.style.transform = "scaleX(" + (1 - cooldown.left) + ")";
    });
  }

  private syncCooldownRows(cooldowns: readonly HudCooldown[]): void {
    const signature = cooldowns.map((cooldown) => cooldown.action).join(",");
    if (signature === this.cooldownSignature) return;
    this.cooldownSignature = signature;
    this.cooldowns.innerHTML = cooldowns.map((cooldown) =>
      "<div class='cdRow'><span>" + Html.escape(cooldown.label) + "</span><div class='cdBar'><i data-action='" + cooldown.action + "'></i></div></div>"
    ).join("");
    this.page.show(this.cooldowns, cooldowns.length > 0);
  }

  private rosterRow(row: HudRow, localId: string): string {
    const classes = "pl" + (row.id === localId ? " me" : "") + (row.dead ? " dead" : "");
    return "<div class='" + classes + "'><i style='background:" + Palette.slotColor(row.slot) + "'></i><b>" + Html.escape(row.nick) + (row.ai ? " (AI)" : "") + "</b><span>" + Html.escape(row.detail) + "</span></div>";
  }
}

class CatalogView {
  constructor(private readonly page: Page) {}

  render(catalog: GameCatalog): void {
    const host = this.page.byId("catalogHost");
    host.innerHTML = catalog.all().map((definition, index) => this.card(definition, index + 1)).join("");
    FoldCard.bindAll(host);
  }

  private card(definition: GameDefinition, order: number): string {
    const keys = definition.keyHelp.map((help) => "<span>" + help.keys.map((key) => "<kbd>" + Html.escape(key) + "</kbd>").join(" ") + "</span><span>" + Html.escape(help.text) + "</span>").join("");
    const rules = definition.rules.map((rule) => "<li>" + rule + "</li>").join("");
    return "<div class='st-card st-fold'><h2>종목 " + order + " · " + Html.escape(definition.title) + "</h2><div class='st-hint'>" + Html.escape(definition.summary) + "</div><h3 class='subHead'>조작 방법</h3><div class='st-keys'>" + keys + "</div><h3 class='subHead'>규칙</h3><ul class='st-rules'>" + rules + "</ul></div>";
  }
}

class CollectionLobbyView {
  private readonly code: HTMLElement;
  private readonly playerBox: HTMLElement;
  private readonly aiNote: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly planBox: HTMLElement;
  private readonly recordCard: HTMLElement;
  private readonly records: HTMLElement;

  constructor(private readonly page: Page, private readonly catalog: GameCatalog) {
    this.code = page.byId("lobbyCode");
    this.playerBox = page.byId("lobbyPlayers");
    this.aiNote = page.byId("aiNote");
    this.startButton = page.byId<HTMLButtonElement>("btnStart");
    this.hint = page.byId("lobbyHint");
    this.planBox = page.byId("lobbyPlan");
    this.recordCard = page.byId("recCard");
    this.records = page.byId("lobbyRecs");
  }

  onStart(handler: () => void): void { this.startButton.onclick = handler; }
  onLeave(handler: () => void): void { this.page.byId("btnLeave").onclick = handler; }

  showCode(code: string): void {
    this.page.setText(this.code, code);
  }

  render(session: CollectionSession): void {
    const order = session.playerIds();
    this.playerBox.innerHTML = order.map((id) => this.playerRow(session, id)).join("");
    const humanCount = session.humanIds().length;
    this.page.show(this.aiNote, humanCount === 1);
    const host = session.isHost();
    this.startButton.disabled = !host;
    this.page.setText(this.startButton, host ? (humanCount === 1 ? "AI와 게임 시작" : "게임 시작") : "방장이 시작하기를 기다리는 중");
    this.page.setText(this.hint, host ? "참가자 " + order.length + "명 · 최대 " + CollectionRules.MAX_PLAYERS + "명" : "");
    this.planBox.innerHTML = PlanBuilder.build(this.catalog.ids(), CollectionRules.ROUNDS_PER_GAME)
      .map((id, index) => "<div class='plRow'><b>" + (index + 1) + ". " + Html.escape((this.catalog.find(id) as GameDefinition).title) + "</b></div>").join("");
    const winners = order.filter((id) => session.winsOf(id));
    this.page.show(this.recordCard, winners.length > 0);
    this.records.innerHTML = winners.map((id) => "<div class='st-rec'><span>" + Html.escape(session.player(id).nick) + "</span><b>" + session.winsOf(id) + "승</b></div>").join("");
  }

  private playerRow(session: CollectionSession, id: string): string {
    const record = session.player(id);
    const tag = id === session.hostId ? "방장" : "";
    return "<div class='plRow" + (id === session.myId ? " me" : "") + "'><i style='background:" + Palette.slotColor(record.slot || 0) + "'></i><b>" + Html.escape(record.nick) + (record.isAI ? " (AI)" : "") + "</b><small>" + tag + "</small></div>";
  }
}

class CollectionResultView {
  private readonly title: HTMLElement;
  private readonly head: HTMLElement;
  private readonly body: HTMLElement;
  private readonly nextIn: HTMLElement;
  private readonly toLobbyButton: HTMLElement;
  private readonly leaveButton: HTMLElement;

  constructor(private readonly page: Page, private readonly catalog: GameCatalog) {
    this.title = page.byId("resultTitle");
    this.head = page.byId("resultHead");
    this.body = page.byId("resultBody");
    this.nextIn = page.byId("nextIn");
    this.toLobbyButton = page.byId("btnToLobby");
    this.leaveButton = page.byId("btnResultLeave");
  }

  onToLobby(handler: () => void): void { this.toLobbyButton.onclick = handler; }
  onLeave(handler: () => void): void { this.leaveButton.onclick = handler; }

  renderRound(round: CollectionRound, totalRounds: number, scores: TournamentScores, result: CollectionRoundResult, localId: string, directory: ParticipantDirectory): void {
    const ranks = result.ranks || {}, names = result.names || {};
    const definition = this.catalog.find(round.kind);
    this.page.setText(this.title, (definition ? definition.title : "") + " 결과 (" + round.n + " / " + totalRounds + ")");
    const ids = Object.keys(ranks).sort((a, b) => ranks[a] - ranks[b]);
    this.head.innerHTML = "<tr><th>순위</th><th>이름</th><th class='n'>이번 종목</th><th class='n'>누적 점수</th></tr>";
    this.body.innerHTML = ids.map((id) =>
      "<tr class='" + (id === localId ? "meRow" : "") + "'><td><b>" + ranks[id] + "</b></td><td>" + this.nameCell(id, names[id], directory) + "</td><td class='n'>+" + ScoreTable.pointsFor(ranks[id]) + "</td><td class='n'><b>" + scores.total(id) + "</b>점</td></tr>"
    ).join("");
  }

  renderFinal(scores: TournamentScores, localId: string, directory: ParticipantDirectory): void {
    this.page.setText(this.title, "최종 결과");
    const ids = scores.idsByTotal();
    this.head.innerHTML = "<tr><th>순위</th><th>이름</th><th class='n'>누적 점수</th></tr>";
    let place = 0, previous: number | null = null;
    this.body.innerHTML = ids.map((id, index) => {
      if (scores.total(id) !== previous) {
        place = index + 1;
        previous = scores.total(id);
      }
      return "<tr class='" + (id === localId ? "meRow" : "") + "'><td><b>" + place + "</b></td><td>" + this.nameCell(id, scores.nick(id), directory) + "</td><td class='n'><b>" + scores.total(id) + "</b>점</td></tr>";
    }).join("");
    const winners = scores.topIds().map((id) => scores.nick(id));
    this.page.setText(this.nextIn, winners.length ? "🏆 최종 우승: " + winners.join(", ") : "");
  }

  showButtons(final: boolean, host: boolean): void {
    this.page.show(this.toLobbyButton, final && host);
    this.page.show(this.leaveButton, final);
    if (final && !host) this.page.setText(this.nextIn, (this.nextIn.textContent || "") + " · 방장이 대기실로 이동할 때까지 기다려 주세요");
  }

  showCountdown(text: string): void {
    this.page.setText(this.nextIn, text);
  }

  private nameCell(id: string, nick: string | undefined, directory: ParticipantDirectory): string {
    const info = directory.lookup(id);
    const slot = info ? info.slot : 0, ai = info ? info.ai : false;
    return "<i class='rankDot' style='background:" + Palette.slotColor(slot || 0) + "'></i>" + Html.escape(nick || "?") + (ai ? " (AI)" : "");
  }
}
