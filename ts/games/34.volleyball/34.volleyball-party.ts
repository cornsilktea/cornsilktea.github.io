interface VbGamePort {
  enterTicketRoom(code: string, hosting: boolean): Promise<boolean>;
  leaveRoomQuietly(): void;
  startMatch(): void;
  showParty(): void;
  showStart(message: string): void;
  myRecord(): VbPlayerRecord;
  presentIds(): string[];
}

class VbPartyPaths {
  static readonly GAME_ROOT = "volleyball";
  static readonly PARTIES = "volleyball/parties";
}

class VbMatchHooks implements MkGameHooks {
  constructor(
    private readonly directory: VbRoomDirectory,
    private readonly database: FirebaseDatabase,
    private readonly myId: string,
    private readonly port: VbGamePort
  ) {}

  member(): MkMember {
    const record = this.port.myRecord();
    return { nick: record.nick, joinedAt: record.joinedAt, look: record.look };
  }

  async create(plan: MkMatchPlan): Promise<MkRoomMade | null> {
    const assign = MkSeatAssign.bySide(plan, VbRandomSetup.PARTY_LIMIT);
    const record = this.port.myRecord();
    record.slot = assign[this.myId] === undefined ? 0 : assign[this.myId];
    const code = await this.directory.create(this.myId, record, { assign, matchId: plan.matchId });
    return code ? { room: code, host: this.myId } : null;
  }

  async discard(made: MkRoomMade): Promise<void> {
    await this.database.ref(VbConfig.ROOT + "/" + made.room).remove();
  }

  enterRoom(ticket: MkTicket, hosting: boolean): Promise<boolean> {
    return this.port.enterTicketRoom(ticket.room, hosting);
  }

  leaveRoom(): void {
    this.port.leaveRoomQuietly();
  }

  startMatch(): void {
    this.port.startMatch();
  }

  showParty(): void {
    this.port.showParty();
  }

  showStart(message: string): void {
    this.port.showStart(message);
  }

  presentIds(): string[] {
    return this.port.presentIds();
  }
}

class VbRandomSetup {
  static readonly PARTY_LIMIT = 2;

  static create(backend: VbBackend, directory: VbRoomDirectory, myId: string, port: VbGamePort): MkRandomFlow {
    const database = backend.database as FirebaseDatabase;
    const options: MkFlowOptions = {
      gameRoot: VbPartyPaths.GAME_ROOT,
      queue: "volleyball",
      partyLimit: VbRandomSetup.PARTY_LIMIT,
      matcher: new MkVersusMatcher(VbRandomSetup.PARTY_LIMIT),
      intro: "매칭 시작을 누르면 아무 팀과 2대2로 만나요.",
      allowBots: true,
      stats: new RandomMatchAccount(VbPartyPaths.GAME_ROOT, "배구 랜덤 매칭 통계", false)
    };
    const panel = new MkPartyPanel(VbDom.byId("partyScreen"), VbDom.byId("partyMount"), options);
    return new MkRandomFlow(database, backend, myId, options, new VbMatchHooks(directory, database, myId, port), panel);
  }
}
