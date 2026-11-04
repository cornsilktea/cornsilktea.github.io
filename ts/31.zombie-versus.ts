type ZombieVersusSeat =
  | { kind: "ai" }
  | { kind: "coming" }
  | { kind: "empty" }
  | { kind: "player"; nick: string; me: boolean; zombie: boolean; card: ZombieRoleTally | null };

interface ZombieVersusHuman {
  nick: string;
  me: boolean;
  zombie: boolean;
  card: ZombieRoleTally | null;
}

class ZombieVersusCards {
  static fromStats(node: ZombieStatsNode | null): ZombieRoleTally | null {
    return node ? ZombieVersusCards.fromRoom(node.rm) : null;
  }

  static toRoom(card: ZombieRoleTally): ZombieRoleTally {
    return ZombieRoleTallyMath.normalize(card);
  }

  static fromRoom(raw: unknown): ZombieRoleTally | null {
    const tally = ZombieRoleTallyMath.normalize(raw);
    return tally.cg || tally.pg ? tally : null;
  }
}

class ZombieVersusLineup {
  static build(humans: readonly ZombieVersusHuman[], capacity: number, matched: boolean, expected: number, fillWithAi: boolean = matched): ZombieVersusSeat[] {
    const seats: ZombieVersusSeat[] = humans.slice(0, capacity).map((human) => ({ kind: "player", nick: human.nick, me: human.me, zombie: human.zombie, card: human.card }));
    const coming = matched ? Math.max(0, Math.min(capacity, expected) - seats.length) : 0;
    while (seats.length < capacity && seats.length < humans.length + coming) seats.push({ kind: "coming" });
    while (seats.length < capacity) seats.push(fillWithAi ? { kind: "ai" } : { kind: "empty" });
    return seats;
  }
}

class ZombieVersusView {
  static readonly ENTER_MS = 1200;
  private shownKey = "";

  constructor(private readonly root: HTMLElement) {}

  reset(): void {
    this.shownKey = "";
    this.root.textContent = "";
  }

  render(seats: readonly ZombieVersusSeat[]): void {
    const key = JSON.stringify(seats);
    if (key === this.shownKey) return;
    const animate = !this.shownKey;
    this.shownKey = key;
    this.root.classList.toggle("zv-enter", animate);
    const cells = seats.map((seat, index) => '<div class="zv-cell" style="--zv-delay:' + (index * 0.08) + 's">' + this.seatHtml(seat) + "</div>");
    this.root.innerHTML = '<div class="zv-arena' + (seats.length > 4 ? " wide" : "") + '">' + cells.join("") + "</div>";
    if (animate) window.setTimeout(() => this.root.classList.remove("zv-enter"), ZombieVersusView.ENTER_MS);
  }

  private seatHtml(seat: ZombieVersusSeat): string {
    const blank = '<span class="zv-line">&nbsp;</span>';
    if (seat.kind === "ai") return '<div class="zv-seat ai"><b>🤖 AI</b><span class="zv-line">컴퓨터</span>' + blank + "</div>";
    if (seat.kind === "coming") return '<div class="zv-seat waiting"><b>입장하는 중…</b>' + blank + blank + "</div>";
    if (seat.kind === "empty") return '<div class="zv-seat empty"><b>빈 자리</b>' + blank + blank + "</div>";
    return '<div class="zv-seat' + (seat.me ? " me" : "") + (seat.zombie ? " zombie" : "") + '"><b>' + (seat.zombie ? "🧟 " : "") + AccountHtml.esc(seat.nick) + (seat.me ? " <small>(나)</small>" : "") + "</b>" + this.cardHtml(seat.card) + "</div>";
  }

  private cardHtml(card: ZombieRoleTally | null): string {
    if (!card) return '<span class="zv-line"><em>기록 없음</em></span><span class="zv-line">&nbsp;</span>';
    return this.rateLine("좀비", card.pw, card.pg) + this.rateLine("시민", card.cw, card.cg);
  }

  private rateLine(label: string, wins: number, games: number): string {
    return '<span class="zv-line">' + label + " <em>" + ZombieVersusView.percent(wins, games) + "</em> <small>" + wins + "승 " + (games - wins) + "패</small></span>";
  }

  private static percent(part: number, total: number): string {
    return total ? Math.round(part / total * 100) + "%" : "—";
  }
}
