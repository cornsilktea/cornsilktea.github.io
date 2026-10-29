interface SnVersusCard {
  g: number;
  w: number;
  k: number;
  rk: number;
}

interface SnVersusEntrant {
  id: string;
  slot: number;
  nick: string;
  me: boolean;
  coming: boolean;
  card: SnVersusCard | null;
}

type SnVersusSeat = { kind: "ai" } | { kind: "coming" } | { kind: "player"; nick: string; me: boolean; card: SnVersusCard | null };

interface SnVersusTeam {
  color: string;
  name: string;
  seats: SnVersusSeat[];
}

class SnVersusCards {
  static fromStats(node: SnAccountStatsNode | null): SnVersusCard | null {
    return node ? SnAccountMath.tallyOf(node.rm) : null;
  }

  static toRoom(card: SnVersusCard): SnVersusCard {
    return { g: card.g, w: card.w, k: card.k, rk: card.rk };
  }

  static fromRoom(raw: unknown): SnVersusCard | null {
    return raw && typeof raw === "object" ? SnAccountMath.tallyOf(raw) : null;
  }
}

class SnVersusLineup {
  static build(mode: SnMode, entrants: readonly SnVersusEntrant[]): SnVersusTeam[] {
    const byId = new Map(entrants.map((entrant) => [entrant.id, entrant]));
    const humans: SnHumanSeat[] = entrants.slice().sort((a, b) => a.slot - b.slot)
      .map((entrant) => ({ id: entrant.id, nick: entrant.nick, team: SnRoomRules.teamOfSlot(mode, entrant.slot) }));
    const colors = mode === "solo" ? SnBalance.TEAM_COLORS_SOLO : SnBalance.TEAM_COLORS_DUOS;
    return SnRosterPlanner.fill(mode, humans).map((team, index) => ({
      color: colors[index % colors.length],
      name: mode === "solo" ? "" : SnBalance.TEAM_NAMES_DUOS[index] + " 팀",
      seats: team.members.map((member) => SnVersusLineup.seatOf(member, byId.get(member.id)))
    }));
  }

  private static seatOf(member: SnRosterMember, entrant: SnVersusEntrant | undefined): SnVersusSeat {
    if (member.bot || !entrant) return { kind: "ai" };
    if (entrant.coming) return { kind: "coming" };
    return { kind: "player", nick: entrant.nick, me: entrant.me, card: entrant.card };
  }
}

class SnVersusView {
  static readonly ENTER_MS = 1200;
  private static readonly VS_HTML = '<div class="snv-vs"><span class="snv-spark"></span><b>VS</b></div>';
  private shownKey = "";

  constructor(private readonly root: HTMLElement) {}

  reset(): void {
    this.shownKey = "";
    this.root.textContent = "";
  }

  render(mode: SnMode, teams: readonly SnVersusTeam[]): void {
    const key = JSON.stringify([mode, teams]);
    if (key === this.shownKey) return;
    const animate = !this.shownKey;
    this.shownKey = key;
    this.root.classList.toggle("snv-enter", animate);
    this.root.innerHTML = mode === "solo" ? this.soloHtml(teams) : this.duosHtml(teams);
    if (animate) window.setTimeout(() => this.root.classList.remove("snv-enter"), SnVersusView.ENTER_MS);
  }

  private duosHtml(teams: readonly SnVersusTeam[]): string {
    const columns = teams.map((team, index) => '<div class="snv-team" style="--snv-team:' + team.color + ";--snv-delay:" + (index * 0.12) + 's"><div class="snv-team-name">' + AccountHtml.esc(team.name) + "</div>"
      + team.seats.map((seat) => this.seatHtml(seat, team.color)).join("") + "</div>");
    return '<div class="snv-mode">팀전 · ' + teams.length + "팀</div>"
      + '<div class="snv-arena duos">' + columns.join(SnVersusView.VS_HTML) + "</div>";
  }

  private soloHtml(teams: readonly SnVersusTeam[]): string {
    const cells = teams.map((team, index) => '<div class="snv-cell" style="--snv-delay:' + (index * 0.08) + 's">' + this.seatHtml(team.seats[0] || { kind: "ai" }, team.color) + "</div>");
    return '<div class="snv-mode">개인전 · ' + teams.length + "명</div>"
      + '<div class="snv-arena solo' + (teams.length > 4 ? " wide" : "") + '">' + cells.join("") + "</div>"
      + '<div class="snv-last">' + SnVersusView.VS_HTML + "<span>최후의 1명은 누구?</span></div>";
  }

  private seatHtml(seat: SnVersusSeat, color: string): string {
    const style = ' style="--snv-team:' + color + '"';
    if (seat.kind === "ai") return '<div class="snv-seat ai"' + style + "><b>🤖 AI</b><span class=\"snv-line\">컴퓨터</span><span class=\"snv-line\">&nbsp;</span></div>";
    if (seat.kind === "coming") return '<div class="snv-seat waiting"' + style + "><b>입장하는 중…</b><span class=\"snv-line\">&nbsp;</span><span class=\"snv-line\">&nbsp;</span></div>";
    return '<div class="snv-seat' + (seat.me ? " me" : "") + '"' + style + "><b>" + AccountHtml.esc(seat.nick) + (seat.me ? " <small>(나)</small>" : "") + "</b>" + this.cardHtml(seat.card) + "</div>";
  }

  private cardHtml(card: SnVersusCard | null): string {
    if (!card || !card.g) return '<span class="snv-line"><em>기록 없음</em></span><span class="snv-line">&nbsp;</span>';
    return '<span class="snv-line">1위 비율 <em>' + Math.round(card.w / card.g * 100) + "%</em> <small>" + card.w + "승 " + (card.g - card.w) + "패</small></span>"
      + '<span class="snv-line">판당 처치 <em>' + (card.k / card.g).toFixed(1) + "</em> · 평균 <em>" + (card.rk / card.g).toFixed(1) + "위</em></span>";
  }
}
