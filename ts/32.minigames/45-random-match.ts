interface CollectionRandomPort {
  member(): MkMember;
  createMatchedRoom(matchId: string): Promise<string | null>;
  discardRoom(code: string): Promise<void>;
  enterTicketRoom(code: string, hosting: boolean): Promise<boolean>;
  leaveRoomQuietly(): void;
  startCollection(): void;
  showParty(): void;
  showStart(message: string): void;
  presentIds(): string[];
}

interface MatchedResultInfo {
  matched(): boolean;
  streakText(): string;
}

class CollectionMatchHooks implements MkGameHooks {
  constructor(private readonly port: CollectionRandomPort, private readonly myId: string) {}

  member(): MkMember {
    return this.port.member();
  }

  async create(plan: MkMatchPlan): Promise<MkRoomMade | null> {
    const code = await this.port.createMatchedRoom(plan.matchId);
    return code ? { room: code, host: this.myId } : null;
  }

  discard(made: MkRoomMade): Promise<void> {
    return this.port.discardRoom(made.room);
  }

  enterRoom(ticket: MkTicket, hosting: boolean): Promise<boolean> {
    return this.port.enterTicketRoom(ticket.room, hosting);
  }

  leaveRoom(): void {
    this.port.leaveRoomQuietly();
  }

  startMatch(): void {
    this.port.startCollection();
  }

  showParty(): void {
    this.port.showParty();
  }

  presentIds(): string[] {
    return this.port.presentIds();
  }

  showStart(message: string): void {
    this.port.showStart(message);
  }
}

class CollectionFinalOutcome {
  static of(scores: TournamentScores, memberIds: readonly string[]): MkOutcome | null {
    const mine = memberIds.filter((id) => scores.ids().indexOf(id) >= 0);
    if (!mine.length) return null;
    const rank = Math.min(...mine.map((id) => 1 + scores.ids().filter((other) => scores.total(other) > scores.total(id)).length));
    return { result: rank === 1 ? "win" : "lose", rank, of: scores.ids().length };
  }
}

class CollectionRandomMatch implements MatchedResultInfo {
  static readonly PARTY_LIMIT = 3;

  readonly flow: MkRandomFlow | null = null;

  constructor(database: FirebaseDatabase | null, clock: MkClock, myId: string, port: CollectionRandomPort, screen: HTMLElement, mount: HTMLElement) {
    if (!database) return;
    const options: MkFlowOptions = {
      gameRoot: "minigames",
      queue: "minigames",
      partyLimit: CollectionRandomMatch.PARTY_LIMIT,
      matcher: new MkFreeForAllMatcher(CollectionRandomMatch.PARTY_LIMIT, CollectionRules.MAX_PLAYERS),
      intro: "매칭 시작을 누르면 다른 학생들과 최대 " + CollectionRules.MAX_PLAYERS + "명이 모여 미니게임 모음을 해요. 모자란 자리는 AI가 채워요.",
      showRank: true,
      stats: new RandomMatchAccount("minigames", "미니게임 랜덤 매칭 통계", true)
    };
    this.flow = new MkRandomFlow(database, clock, myId, options, new CollectionMatchHooks(port, myId), new MkPartyPanel(screen, mount, options));
  }

  inParty(): boolean {
    return !!this.flow && this.flow.inParty();
  }

  matched(): boolean {
    return !!this.flow && this.flow.hasTicket();
  }

  streakText(): string {
    return this.flow ? this.flow.endHint() : "";
  }

  async codeTaken(code: string): Promise<boolean> {
    return this.flow ? this.flow.codeTaken(code).catch(() => false) : false;
  }

  reportFinal(scores: TournamentScores, onStreak: () => void): void {
    const flow = this.flow;
    if (!flow || !flow.hasTicket()) return;
    const outcome = CollectionFinalOutcome.of(scores, flow.memberIds());
    if (outcome) flow.matchEnded(outcome, onStreak);
  }
}
