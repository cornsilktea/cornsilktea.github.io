interface CollectionVersusCard {
  g: number;
  w: number;
  t: number;
}

interface CollectionVersusPlayer {
  nick: string;
  ai: boolean;
  me: boolean;
  ally: boolean;
  card: CollectionVersusCard | null;
}

type CollectionVersusSeat = CollectionVersusPlayer | "coming" | "empty";

interface CollectionVersusMatch {
  allyIds: readonly string[];
  expect: number;
}

interface CollectionVersusPort {
  session(): CollectionSession | null;
  match(): CollectionVersusMatch | null;
  screen(): CollectionScreenName;
}

class CollectionVersusCards {
  static fromStats(node: RandomMatchStatsNode | null): CollectionVersusCard | null {
    return node ? { g: node.g, w: node.w, t: node.t } : null;
  }

  static fromRoom(raw: unknown): CollectionVersusCard | null {
    if (!raw || typeof raw !== "object") return null;
    const source = raw as Record<string, unknown>;
    const games = AccountNumbers.count(source.g);
    return { g: games, w: Math.min(games, AccountNumbers.count(source.w)), t: Math.min(games, AccountNumbers.count(source.t)) };
  }
}

class CollectionVersusRates {
  static readonly RELOAD_MS = 6000;

  private card: CollectionVersusCard | null = null;
  private loaded = false;
  private loading = false;
  private reloadedFor = "";

  constructor(private readonly env: BrowserEnv, private readonly gameKey: string) {}

  mine(): CollectionVersusCard | null {
    return this.card;
  }

  loadOnce(): void {
    if (!this.loaded) this.load();
  }

  reloadAfter(matchId: string): void {
    if (!matchId || this.reloadedFor === matchId) return;
    this.reloadedFor = matchId;
    this.env.afterMs(CollectionVersusRates.RELOAD_MS, () => this.load());
  }

  private load(): void {
    const store = AccountMatchStore.forProfile(new RandomMatchProfile(this.gameKey));
    if (!store || this.loading) return;
    this.loading = true;
    store.loadStats()
      .then((node) => { this.card = CollectionVersusCards.fromStats(node); this.loaded = true; })
      .catch(() => undefined)
      .then(() => { this.loading = false; });
  }
}

class CollectionVersusLineup {
  static readonly FILLER_NICK = "AI";

  static seats(session: CollectionSession, match: CollectionVersusMatch | null): CollectionVersusSeat[] {
    const records = session.playerRecords();
    const allies = new Set(match ? match.allyIds : []);
    allies.add(session.myId);
    const order = (id: string): number => (id === session.myId ? 0 : allies.has(id) ? 1 : 2);
    const seated = session.seatedIds().filter((id) => !(records.get(id) as CollectionPlayerRecord).isAI)
      .sort((a, b) => order(a) - order(b) || ((records.get(a) as CollectionPlayerRecord).slot || 0) - ((records.get(b) as CollectionPlayerRecord).slot || 0));
    const seats: CollectionVersusSeat[] = seated.map((id) => CollectionVersusLineup.person(records.get(id) as CollectionPlayerRecord, id === session.myId, allies.has(id)));
    if (!match) {
      while (seats.length < CollectionRules.MAX_PLAYERS) seats.push("empty");
      return seats;
    }
    for (let missing = match.expect - seated.length; missing > 0; missing--) seats.push("coming");
    session.seatedIds().filter((id) => (records.get(id) as CollectionPlayerRecord).isAI)
      .forEach((id) => seats.push(CollectionVersusLineup.computer((records.get(id) as CollectionPlayerRecord).nick)));
    while (seats.length < CollectionRules.MIN_FIELD_SIZE) seats.push(CollectionVersusLineup.computer(CollectionVersusLineup.FILLER_NICK));
    return seats.slice(0, CollectionRules.MAX_PLAYERS);
  }

  private static person(record: CollectionPlayerRecord, me: boolean, ally: boolean): CollectionVersusPlayer {
    return { nick: record.nick || "학생", ai: false, me, ally, card: CollectionVersusCards.fromRoom(record.vs) };
  }

  private static computer(nick: string): CollectionVersusPlayer {
    return { nick: nick || CollectionVersusLineup.FILLER_NICK, ai: true, me: false, ally: false, card: null };
  }
}

class CollectionVersusView {
  static readonly ENTER_MS = 1200;

  private shownKey = "";

  constructor(private readonly root: HTMLElement, private readonly env: BrowserEnv) {}

  reset(): void {
    this.shownKey = "";
    this.root.textContent = "";
  }

  render(seats: readonly CollectionVersusSeat[], matched: boolean): void {
    const key = JSON.stringify([seats, matched]);
    if (key === this.shownKey) return;
    const animate = !this.shownKey;
    this.shownKey = key;
    const half = Math.ceil(seats.length / 2);
    this.root.classList.toggle("mgv-enter", animate);
    this.root.innerHTML = '<div class="mgv-arena">' + this.sideHtml("left", seats.slice(0, half), matched)
      + '<div class="mgv-vs"><span class="mgv-spark"></span><b>VS</b></div>'
      + this.sideHtml("right", seats.slice(half), matched) + "</div>";
    if (animate) this.env.afterMs(CollectionVersusView.ENTER_MS, () => this.root.classList.remove("mgv-enter"));
  }

  private sideHtml(side: "left" | "right", seats: readonly CollectionVersusSeat[], matched: boolean): string {
    return '<div class="mgv-side ' + side + '">' + seats.map((seat) => this.rowHtml(seat, matched)).join("") + "</div>";
  }

  private rowHtml(seat: CollectionVersusSeat, matched: boolean): string {
    if (seat === "empty") return this.waitingHtml("빈 자리");
    if (seat === "coming") return this.waitingHtml("입장하는 중…");
    const tag = seat.me ? "나" : matched && seat.ally ? "우리 팀" : "";
    const classes = "mgv-row" + (seat.me ? " me" : "") + (matched && seat.ally ? " ally" : "") + (matched && !seat.ally && !seat.ai ? " rival" : "") + (seat.ai ? " ai" : "");
    return '<div class="' + classes + '"><div class="mgv-who"><b>' + (seat.ai ? "🤖 " : "") + AccountHtml.esc(seat.nick)
      + (tag ? ' <i class="mgv-tag">' + tag + "</i>" : "") + "</b>"
      + '<span class="mgv-rate">' + this.rateHtml(seat) + "</span></div>"
      + this.recordsHtml(seat.ai ? null : seat.card) + "</div>";
  }

  private waitingHtml(label: string): string {
    return '<div class="mgv-row waiting"><div class="mgv-who"><b>' + label + '</b><span class="mgv-rate">&nbsp;</span></div>' + this.recordsHtml(null) + "</div>";
  }

  private rateHtml(seat: CollectionVersusPlayer): string {
    if (seat.ai) return "컴퓨터";
    if (!seat.card || !seat.card.g) return "총 승률 <em>기록 없음</em>";
    return "총 승률 <em>" + Math.round(seat.card.w / seat.card.g * 100) + "%</em> <small>" + seat.card.w + "승 " + (seat.card.g - seat.card.w) + "패</small>";
  }

  private recordsHtml(card: CollectionVersusCard | null): string {
    const ready = card !== null && card.g > 0;
    const first = card && ready ? card.w + "회" : "&nbsp;";
    const top = card && ready ? Math.round(card.t / card.g * 100) + "%" : "&nbsp;";
    return '<div class="mgv-recs' + (ready ? "" : " empty") + '">'
      + '<div class="mgv-rec"><span>🥇 1등</span><b>' + first + "</b></div>"
      + '<div class="mgv-rec"><span>🏅 3위 안</span><b>' + top + "</b></div></div>";
  }
}

class CollectionVersusScreen {
  static readonly FADE_MS = 350;

  private readonly root: HTMLElement;
  private readonly head: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly view: CollectionVersusView;
  private fadeTicket = 0;

  constructor(private readonly page: Page, private readonly env: BrowserEnv) {
    this.root = page.byId("versusCurtain");
    this.head = page.byId("mgvHead");
    this.hint = page.byId("mgvHint");
    this.view = new CollectionVersusView(page.byId("mgvBody"), env);
  }

  open(matched: boolean): void {
    this.fadeTicket++;
    this.view.reset();
    this.page.setText(this.head, matched ? "⚔️ 상대를 찾았어요!" : "⚔️ 곧 대결이 시작돼요!");
    this.page.setText(this.hint, "종목 " + CollectionRules.GAMES_PER_COLLECTION + "개를 무작위로 뽑아 겨뤄요 · 곧 첫 종목이 시작돼요.");
    this.root.classList.remove("out");
    this.page.show(this.root, true);
  }

  render(seats: readonly CollectionVersusSeat[], matched: boolean): void {
    this.view.render(seats, matched);
  }

  close(): void {
    const ticket = ++this.fadeTicket;
    this.root.classList.add("out");
    this.env.afterMs(CollectionVersusScreen.FADE_MS, () => {
      if (ticket !== this.fadeTicket) return;
      this.page.show(this.root, false);
      this.root.classList.remove("out");
    });
  }
}

class CollectionVersusCurtain {
  static readonly SHOW_MS = 4500;
  static readonly ROOM_SLACK_MS = 3000;
  static readonly MIN_MS = 2000;

  private shownAt = -1;
  private pendingAt = 0;
  private pendingStart: (() => void) | null = null;
  private pendingSession: CollectionSession | null = null;

  constructor(private readonly env: BrowserEnv, private readonly screen: CollectionVersusScreen, private readonly rates: CollectionVersusRates, private readonly port: CollectionVersusPort) {}

  seatExtra(): { vs?: CollectionVersusCard } {
    const card = this.rates.mine();
    return card ? { vs: card } : {};
  }

  hostStart(start: () => void): void {
    const session = this.port.session();
    if (!session || !session.isHost()) return;
    if (session.practice || this.port.match()) {
      start();
      return;
    }
    if (this.pendingStart || this.roomLeftMs(session) > 0) return;
    session.updateRoom({ vsAt: session.now() });
    this.schedule(session, CollectionVersusCurtain.SHOW_MS, start);
  }

  startAfterShow(start: () => void): void {
    const session = this.port.session();
    if (!session) return;
    const wait = this.visible() ? this.shownAt + CollectionVersusCurtain.SHOW_MS - this.env.nowMs() : CollectionVersusCurtain.SHOW_MS;
    if (wait <= 0) start();
    else this.schedule(session, wait, start);
  }

  update(): void {
    const now = this.env.nowMs();
    this.runPending(now);
    const session = this.port.session();
    const match = this.port.match();
    if (session && this.wanted(session, match)) {
      if (!this.visible()) {
        this.shownAt = now;
        this.screen.open(!!match);
      }
      this.screen.render(CollectionVersusLineup.seats(session, match), !!match);
      return;
    }
    if (!this.visible()) return;
    const screen = this.port.screen();
    if (!session || screen === "start" || screen === "party" || now - this.shownAt >= CollectionVersusCurtain.MIN_MS) this.hide();
  }

  private wanted(session: CollectionSession, match: CollectionVersusMatch | null): boolean {
    if (session.practice || session.status !== "lobby" || this.port.screen() !== "lobby") return false;
    return !!match || this.roomLeftMs(session) > 0;
  }

  private roomLeftMs(session: CollectionSession): number {
    return session.vsAt ? session.vsAt + CollectionVersusCurtain.SHOW_MS + CollectionVersusCurtain.ROOM_SLACK_MS - session.now() : 0;
  }

  private visible(): boolean {
    return this.shownAt >= 0;
  }

  private hide(): void {
    this.shownAt = -1;
    this.screen.close();
  }

  private schedule(session: CollectionSession, waitMs: number, start: () => void): void {
    this.pendingSession = session;
    this.pendingStart = start;
    this.pendingAt = this.env.nowMs() + waitMs;
  }

  private runPending(now: number): void {
    if (!this.pendingStart || now < this.pendingAt) return;
    const start = this.pendingStart;
    const session = this.pendingSession;
    this.pendingStart = null;
    this.pendingSession = null;
    if (session && session === this.port.session() && session.status === "lobby") start();
  }
}
