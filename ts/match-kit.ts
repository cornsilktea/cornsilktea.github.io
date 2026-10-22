// 랜덤 매칭 공용 모듈(Mk*). 모든 대전 게임이 같이 쓴다 — 게임마다 복사하지 않는다.
// 구조와 이유는 random-match-prompt.md. 요약:
//  - 팀 대기실(MkParty): <게임>/parties/<5자리 코드>. 팀원·아군 AI 수·팀장·전적을 둔다.
//    코드는 일반 방(<게임>/rooms/<코드>)과 겹치지 않게 만들어서, 기존 "방 코드로 입장" 칸 하나로 둘 다 받는다.
//  - 대기열(MkQueue): matchQueue/<대기열 이름>/<팀 코드>. 팀 하나가 항목 하나.
//  - 묶기(MkBinder): 대기열에서 가장 먼저 들어온 "준비된" 항목의 팀장만 묶는다. 준비 = 들어온 지 3초가 지남.
//    여러 명이 동시에 묶지 않게 대기열 전체를 transaction 으로 차지(claim)한다. 차지한 사람이 방을 못 만들고
//    사라지면 차지는 CLAIM_EXPIRE 뒤 풀린다.
//  - 묶는 규칙은 MkMatcher 를 이은 클래스(1대1·팀 대 팀 = MkVersusMatcher, 여럿이 한 방 = MkFreeForAllMatcher)가 정한다.
//    일반 방을 실제로 만드는 일은 게임마다 다르므로 게임이 MkRoomMaker 를 넘긴다.
//  - 대기열은 on('value') 구독으로만 본다(폴링 없음). 3초 대기는 기기 안 타이머로 다시 계산만 한다.
// 이 파일은 화면과 무관한 부분(Node 시뮬레이터 tools/match-sim.js 가 그대로 불러 검사)과
// 연승 버튼·전적 창(MkStreakButton·MkHistoryDialog)으로 나뉜다. 모양은 theme.css 의 .mk-* .

type MkResult = "win" | "draw" | "lose";

interface MkClock {
  now(): number;
}

interface MkMember {
  nick: string;
  joinedAt: number;
  look?: CharacterLook | null;
}

interface MkSearch {
  since: number;
}

interface MkTicket {
  matchId: string;
  room: string;
  side: number;
  host: string;
  expect: number;
  at: number;
  rivals: string[];
  map?: string;
}

interface MkHistoryLine {
  n: number;
  matchId: string;
  at: number;
  result: MkResult;
  rivals: string[];
  map?: string;
  rank?: number;
  of?: number;
}

interface MkLastMatch {
  rivals?: string[];
  ai?: boolean;
}

interface MkPartyRecord {
  leaderId: string;
  createdAt: number;
  members?: Record<string, MkMember>;
  bots?: number;
  search?: MkSearch | null;
  match?: MkTicket | null;
  history?: Record<string, MkHistoryLine>;
  last?: MkLastMatch | null;
}

interface MkClaim {
  by: string;
  at: number;
  id: string;
}

// size 0 + busyUntil 인 항목은 "경기 중이라 곧 돌아올 팀" 표지판이다(MkBusySign). 묶이지는 않고,
// 다른 팀이 같은 상대와 또 붙기 전에 잠깐 기다릴지 정하는 데만 쓴다.
interface MkQueueEntry {
  leader: string;
  people: Record<string, MkMember>;
  bots: number;
  size: number;
  at: number;
  claim?: MkClaim | null;
  avoid?: string[];
  owed?: boolean;
  busyUntil?: number;
}

type MkQueueMap = Record<string, MkQueueEntry>;

interface MkPlannedEntry {
  code: string;
  entry: MkQueueEntry;
  side: number;
}

interface MkMatchPlan {
  matchId: string;
  seed: number;
  binder: string;
  groups: MkPlannedEntry[];
}

interface MkRoomMade {
  room: string;
  host: string;
  map?: string;
}

interface MkRoomMaker {
  create(plan: MkMatchPlan): Promise<MkRoomMade | null>;
  discard?(made: MkRoomMade): Promise<void>;
}

interface MkOutcome {
  result: MkResult;
  rank?: number;
  of?: number;
}

interface MkJoinOutcome {
  ok: boolean;
  message: string;
}

interface MkTiming {
  settleMs: number;
  claimExpireMs: number;
  rematchWaitMs?: number;
  busyMs?: number;
  returnGraceMs?: number;
}

interface MkPickContext {
  now: number;
  othersComing: boolean;
  owedComing: boolean;
}

class MkPaths {
  constructor(readonly queue: string, readonly parties: string, readonly rooms: string) {}

  static forGame(gameRoot: string, queueName: string): MkPaths {
    return new MkPaths("matchQueue/" + queueName, gameRoot + "/parties", gameRoot + "/rooms");
  }

  party(code: string): string {
    return this.parties + "/" + code;
  }

  entry(code: string): string {
    return this.queue + "/" + code;
  }
}

// 묶기 규칙의 공통 부분: 누가 준비됐는지, 누가 묶을 차례인지, 다음에 언제 다시 볼지.
// 어떤 항목을 몇 개 고르고 어느 편에 넣는지는 자식 클래스가 정한다.
// 시간 값의 이유:
//  - rematchWaitMs(40초): 방금 붙은 두 팀만 대기열에 있고 다른 팀이 경기 중이면, 그 팀이 돌아올 때까지 이만큼 기다렸다가
//    그래도 없으면 다시 붙인다. AI 와 한 판 한 팀은 AI 대체(30초)만큼 늦게 끝나므로 그보다 길어야 섞인다.
//  - busyMs(4분): 경기 중 표지판이 스스로 사라지는 시간(30번 드래프트+경기+결과가 3분 남짓).
//  - returnGraceMs(25초): 판이 끝나 팀 대기실로 돌아온 팀이 "매칭 시작"을 다시 누를 때까지 기다려 주는 시간.
abstract class MkMatcher {
  static readonly TIMING: MkTiming = { settleMs: 3000, claimExpireMs: 10000, rematchWaitMs: 40000, busyMs: 240000, returnGraceMs: 25000 };

  constructor(readonly partyLimit: number, protected readonly timing: MkTiming = MkMatcher.TIMING) {}

  protected abstract pick(ready: Array<[string, MkQueueEntry]>, context: MkPickContext): Array<[string, MkQueueEntry]> | null;

  protected abstract sides(count: number, random: () => number): number[];

  get rematchWaitMs(): number {
    return this.timing.rematchWaitMs ?? (MkMatcher.TIMING.rematchWaitMs as number);
  }

  get busyMs(): number {
    return this.timing.busyMs ?? (MkMatcher.TIMING.busyMs as number);
  }

  get returnGraceMs(): number {
    return this.timing.returnGraceMs ?? (MkMatcher.TIMING.returnGraceMs as number);
  }

  static metRecently(a: [string, MkQueueEntry], b: [string, MkQueueEntry]): boolean {
    return (a[1].avoid || []).indexOf(b[0]) >= 0 || (b[1].avoid || []).indexOf(a[0]) >= 0;
  }

  static isSign(entry: MkQueueEntry): boolean {
    return !!entry && !(entry.size > 0) && !!entry.busyUntil;
  }

  anchor(entries: MkQueueMap | null, now: number): string | null {
    const ready = this.ready(entries, now);
    return ready.length ? ready[0][0] : null;
  }

  // 나 말고 지금 묶일 수 있는 팀이 대기열에 있는지. 있으면 AI 대체를 미룬다(사람끼리 붙는 게 먼저).
  hasCompany(entries: MkQueueMap | null, now: number, myCode: string): boolean {
    return this.ready(entries, now).some(([code]) => code !== myCode);
  }

  // 곧 묶일 수 있게 될 팀: 경기 중 표지판, 또는 막 들어와 아직 준비(settleMs) 중인 팀. onlyOwed 면 AI 와 한 판 한 팀만 센다.
  othersComing(entries: MkQueueMap | null, now: number, onlyOwed: boolean): boolean {
    return Object.keys(entries || {}).some((code) => {
      const entry = (entries as MkQueueMap)[code];
      if (!entry || (onlyOwed && !entry.owed)) return false;
      if (MkMatcher.isSign(entry)) return (entry.busyUntil as number) > now;
      return entry.size > 0 && entry.at + this.timing.settleMs > now;
    });
  }

  plan(entries: MkQueueMap | null, now: number, random: () => number): MkMatchPlan | null {
    const ready = this.ready(entries, now);
    if (!ready.length) return null;
    const picked = this.pick(ready, { now, othersComing: this.othersComing(entries, now, false), owedComing: this.othersComing(entries, now, true) });
    if (!picked || picked[0][0] !== ready[0][0]) return null;
    const sides = this.sides(picked.length, random);
    return {
      matchId: ready[0][0] + "-" + now.toString(36) + "-" + Math.floor(random() * 1e6).toString(36),
      seed: Math.floor(random() * 2147483647),
      binder: ready[0][0],
      groups: picked.map(([code, entry], index) => ({ code, entry, side: sides[index] })),
    };
  }

  isFree(entry: MkQueueEntry, now: number): boolean {
    return !entry.claim || now - entry.claim.at > this.timing.claimExpireMs;
  }

  nextCheck(entries: MkQueueMap | null, now: number): number | null {
    let next: number | null = null;
    Object.keys(entries || {}).forEach((code) => {
      const entry = (entries as MkQueueMap)[code];
      if (!entry) return;
      const moments = MkMatcher.isSign(entry) ? [(entry.busyUntil as number) + 1] : [entry.at + this.timing.settleMs, entry.at + this.timing.settleMs + this.rematchWaitMs + 1];
      if (entry.claim) moments.push(entry.claim.at + this.timing.claimExpireMs + 1);
      moments.forEach((moment) => {
        if (moment > now && (next === null || moment < next)) next = moment;
      });
    });
    return next;
  }

  // 지난 판을 AI 와 한 팀(owed)이 맨 앞 — 팀 수가 홀수일 때 AI 와 하는 차례가 한 팀에 몰리지 않고 돌아가게.
  // 나머지는 먼저 온 순서.
  private ready(entries: MkQueueMap | null, now: number): Array<[string, MkQueueEntry]> {
    return Object.keys(entries || {})
      .map((code) => [code, (entries as MkQueueMap)[code]] as [string, MkQueueEntry])
      .filter(([, entry]) => entry && entry.size > 0 && entry.at + this.timing.settleMs <= now && this.isFree(entry, now))
      .sort((a, b) => (a[1].owed ? 0 : 1) - (b[1].owed ? 0 : 1) || a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1));
  }
}

// 두 편이 맞붙는 게임(24·25·30·34·35): 맨 앞 팀과 그다음 준비된 팀을 묶고 편은 무작위.
// 바로 전 판 상대(avoid)는 건너뛰고, 그 상대밖에 없으면 경기 중인 다른 팀(표지판)이 있을 때만 rematchWaitMs 까지 기다린다.
// AI 와 한 판 한 팀이 곧 돌아오는데 남은 팀이 딱 둘이면, 둘을 묶지 않고 잠깐 기다린다 — 그래야 그 팀이 또 혼자 남아
// AI 를 연달아 만나지 않고, 대신 남은 둘 중 한 팀이 다음 AI 차례가 된다(팀 수가 홀수일 때 AI 차례 돌리기).
class MkVersusMatcher extends MkMatcher {
  protected pick(ready: Array<[string, MkQueueEntry]>, context: MkPickContext): Array<[string, MkQueueEntry]> | null {
    const fitting = ready.filter(([, entry]) => entry.size <= this.partyLimit);
    if (fitting.length < 2 || fitting[0] !== ready[0]) return null;
    const first = fitting[0];
    const holding = context.now - (first[1].at + this.timing.settleMs) < this.rematchWaitMs;
    if (holding && fitting.length === 2 && context.owedComing && !first[1].owed) return null;
    const fresh = fitting.slice(1).find((other) => !MkMatcher.metRecently(first, other));
    if (fresh) return [first, fresh];
    if (holding && context.othersComing) return null;
    return [first, fitting[1]];
  }

  protected sides(count: number, random: () => number): number[] {
    return random() < 0.5 ? [0, 1] : [1, 0];
  }
}

// 여럿이 한 방에 모이는 게임(31·32·38·39): 먼저 온 순서로 정원까지 채우고, 넘치는 항목은 다음 묶음으로.
// maxEntries: 한 방에 들어갈 수 있는 팀(항목) 수 상한(예: 38번 팀전은 3팀).
class MkFreeForAllMatcher extends MkMatcher {
  constructor(partyLimit: number, readonly capacity: number, timing: MkTiming = MkMatcher.TIMING, readonly maxEntries: number = Infinity) {
    super(partyLimit, timing);
  }

  protected pick(ready: Array<[string, MkQueueEntry]>, _context: MkPickContext): Array<[string, MkQueueEntry]> | null {
    const picked: Array<[string, MkQueueEntry]> = [];
    let people = 0;
    ready.forEach((item) => {
      if (picked.length < this.maxEntries && item[1].size <= this.partyLimit && people + item[1].size <= this.capacity) {
        picked.push(item);
        people += item[1].size;
      }
    });
    return picked.length >= 2 && picked[0] === ready[0] ? picked : null;
  }

  protected sides(count: number): number[] {
    const sides: number[] = [];
    for (let index = 0; index < count; index++) sides.push(index);
    return sides;
  }
}

// 전적에서 합계·연승을 계산한다. 연승은 따로 저장하지 않고 전적 끝에서부터 센다(진실은 한 곳).
class MkRecordBook {
  readonly lines: MkHistoryLine[];

  constructor(history: Record<string, MkHistoryLine> | null | undefined) {
    this.lines = Object.keys(history || {}).map((key) => (history as Record<string, MkHistoryLine>)[key]).sort((a, b) => a.n - b.n);
  }

  count(result: MkResult): number {
    return this.lines.filter((line) => line.result === result).length;
  }

  streak(): number {
    let wins = 0;
    for (let index = this.lines.length - 1; index >= 0 && this.lines[index].result === "win"; index--) wins++;
    return wins;
  }

  summary(): string {
    return this.lines.length + "전 " + this.count("win") + "승 " + this.count("draw") + "무 " + this.count("lose") + "패";
  }

  streakLabel(): string {
    const streak = this.streak();
    return streak > 0 ? "🔥 " + streak + "연승" : "연승 없음";
  }

  has(matchId: string): boolean {
    return this.lines.some((line) => line.matchId === matchId);
  }
}

// 팀 대기실 만들기·들어가기. 코드는 일반 방 코드와 겹치지 않게 고른다.
class MkPartyDirectory {
  private static readonly CODE_ATTEMPTS = 12;
  // 사람이 없는 대기실은 대부분 연결이 잠깐 끊긴 것이라 곧 돌아온다(MkParty.restore). 오래된 것만 치운다.
  private static readonly ABANDONED_MS = 3 * 3600000;

  constructor(
    private readonly database: FirebaseDatabase,
    private readonly clock: MkClock,
    private readonly paths: MkPaths,
    private readonly limit: number
  ) {}

  async create(myId: string, member: MkMember): Promise<string | null> {
    await this.sweep();
    for (let attempt = 0; attempt < MkPartyDirectory.CODE_ATTEMPTS; attempt++) {
      const code = String(10000 + Math.floor(Math.random() * 90000));
      const room = await this.database.ref(this.paths.rooms + "/" + code + "/status").once("value");
      if (room.exists()) continue;
      const record: MkPartyRecord = { leaderId: myId, createdAt: this.clock.now(), members: { [myId]: member }, bots: 0 };
      const result = await this.database.ref(this.paths.party(code)).transaction((current) => (MkPartyDirectory.isAlive(current as MkPartyRecord | null) ? undefined : record));
      if (result.committed) return code;
    }
    return null;
  }

  async exists(code: string): Promise<boolean> {
    const snapshot = await this.database.ref(this.paths.party(code) + "/members").once("value");
    return snapshot.exists();
  }

  // transaction 은 처음에 기기 캐시(비어 있으면 null)로 한 번 돌기 때문에, null 일 때 그만두면(undefined)
  // 서버에 있는 팀을 못 찾는다. null 은 null 로 돌려줘서 서버 값으로 다시 돌게 하고, 실제로 넣었는지는 joined 로 본다.
  async join(code: string, myId: string, member: MkMember): Promise<MkJoinOutcome> {
    let joined = false;
    let message = "그런 팀이 없어요. 코드를 확인해 주세요.";
    await this.database.ref(this.paths.party(code)).transaction((current) => {
      joined = false;
      message = "그런 팀이 없어요. 코드를 확인해 주세요.";
      const record = current as MkPartyRecord | null;
      if (record === null) return null;
      if (!MkPartyDirectory.isAlive(record)) return undefined;
      const members = record.members as Record<string, MkMember>;
      if (members[myId]) {
        joined = true;
        return record;
      }
      if (record.search) {
        message = "이 팀은 지금 상대를 찾는 중이에요. 잠시 뒤에 다시 해 주세요.";
        return undefined;
      }
      const humans = Object.keys(members).length;
      if (humans >= this.limit) {
        message = "팀 자리가 가득 찼어요.";
        return undefined;
      }
      members[myId] = member;
      record.bots = Math.min(record.bots || 0, this.limit - humans - 1);
      joined = true;
      return record;
    });
    return joined ? { ok: true, message: "" } : { ok: false, message };
  }

  static isAlive(record: MkPartyRecord | null): boolean {
    return !!record && !!record.members && Object.keys(record.members).length > 0;
  }

  private async sweep(): Promise<void> {
    try {
      const snapshot = await this.database.ref(this.paths.parties).once("value");
      const all = snapshot.val<Record<string, MkPartyRecord>>() || {};
      const updates: Record<string, null> = {};
      const now = this.clock.now();
      Object.keys(all).forEach((code) => {
        const record = all[code];
        if (!MkPartyDirectory.isAlive(record) && !(now - ((record && record.createdAt) || 0) < MkPartyDirectory.ABANDONED_MS)) updates[code] = null;
      });
      if (Object.keys(updates).length) await this.database.ref(this.paths.parties).update(updates);
    } catch (error) {
      return;
    }
  }
}

// 팀 대기실 하나에 붙어 있는 동안의 상태. 판 중에도 연결을 유지해서 끝나면 같은 대기실로 돌아온다.
class MkParty {
  record: MkPartyRecord | null = null;
  onChange: () => void = () => undefined;
  onTicket: (ticket: MkTicket) => void = () => undefined;
  onClosed: (message: string) => void = () => undefined;
  private readonly ref: FirebaseRef;
  private readonly handled = new Set<string>();
  private listener: ((snapshot: FirebaseSnapshot) => void) | null = null;
  private leaving = false;
  private handingOff = false;
  private restoring = false;
  private lastMe: MkMember | null = null;

  constructor(
    private readonly database: FirebaseDatabase,
    private readonly clock: MkClock,
    readonly paths: MkPaths,
    readonly code: string,
    readonly myId: string,
    readonly limit: number
  ) {
    this.ref = database.ref(paths.party(code));
  }

  connect(): void {
    this.ref.child("members/" + this.myId).onDisconnect().remove();
    this.listener = this.ref.on("value", (snapshot) => this.apply(snapshot.val<MkPartyRecord>()));
  }

  isLeader(): boolean {
    return !!this.record && this.record.leaderId === this.myId;
  }

  members(): Array<[string, MkMember]> {
    const members = (this.record && this.record.members) || {};
    return Object.keys(members).map((id) => [id, members[id]] as [string, MkMember]).sort((a, b) => a[1].joinedAt - b[1].joinedAt || (a[0] < b[0] ? -1 : 1));
  }

  bots(): number {
    return (this.record && this.record.bots) || 0;
  }

  size(): number {
    return this.members().length + this.bots();
  }

  searching(): MkSearch | null {
    return (this.record && this.record.search) || null;
  }

  searchSeconds(): number {
    const search = this.searching();
    return search ? Math.max(0, Math.floor((this.clock.now() - search.since) / 1000)) : 0;
  }

  ticket(): MkTicket | null {
    return (this.record && this.record.match) || null;
  }

  book(): MkRecordBook {
    return new MkRecordBook(this.record && this.record.history);
  }

  lastMatch(): MkLastMatch {
    return (this.record && this.record.last) || {};
  }

  setBots(count: number): void {
    if (!this.isLeader() || this.searching()) return;
    const allowed = Math.max(0, Math.min(count, this.limit - this.members().length));
    this.ref.child("bots").set(allowed);
  }

  updateMe(member: Pick<MkMember, "nick" | "look">): void {
    if (this.record && this.record.members && this.record.members[this.myId]) this.ref.child("members/" + this.myId).update({ nick: member.nick, look: member.look || null });
  }

  markSearching(since: number | null): Promise<void> {
    return this.ref.child("search").set(since === null ? null : { since });
  }

  // 판 결과를 전적에 한 줄 쌓는다. 팀장만 쓰고, 같은 판 아이디는 한 번만 들어간다.
  async report(ticket: MkTicket, outcome: MkOutcome): Promise<boolean> {
    if (!this.isLeader()) return false;
    let added = false;
    const at = this.clock.now();
    await this.ref.child("history").transaction((current) => {
      added = false;
      const history = (current as Record<string, MkHistoryLine> | null) || {};
      if (new MkRecordBook(history).has(ticket.matchId)) return undefined;
      const line: MkHistoryLine = { n: Object.keys(history).length + 1, matchId: ticket.matchId, at, result: outcome.result, rivals: ticket.rivals || [] };
      if (ticket.map) line.map = ticket.map;
      if (outcome.rank !== undefined) line.rank = outcome.rank;
      if (outcome.of !== undefined) line.of = outcome.of;
      history[MkParty.historyKey(ticket.matchId)] = line;
      added = true;
      return history;
    });
    const match = this.ticket();
    if (match && match.matchId === ticket.matchId) await this.ref.child("match").set(null);
    return added;
  }

  // 표를 받았는데 그 방에 못 들어갔을 때(방장이 사라짐 등) 팀장이 표를 지워 다시 매칭할 수 있게 한다.
  clearTicket(matchId: string): void {
    const match = this.ticket();
    if (this.isLeader() && match && match.matchId === matchId) this.ref.child("match").set(null);
  }

  async leave(): Promise<void> {
    this.leaving = true;
    this.stopListening();
    try { this.ref.child("members/" + this.myId).onDisconnect().cancel(); } catch (error) { /* 이미 끊긴 연결 */ }
    const wasLeader = this.isLeader();
    await this.ref.transaction((current) => {
      const record = current as MkPartyRecord | null;
      if (!record || !record.members || !record.members[this.myId]) return record === null ? null : undefined;
      delete record.members[this.myId];
      if (!Object.keys(record.members).length) return null;
      if (record.leaderId === this.myId) {
        record.leaderId = MkParty.firstMember(record.members);
        record.search = null;
      }
      return record;
    });
    if (wasLeader) await this.database.ref(this.paths.entry(this.code)).remove();
  }

  silentClose(): void {
    this.leaving = true;
    this.stopListening();
  }

  static historyKey(matchId: string): string {
    return "m" + matchId.replace(/[^A-Za-z0-9_-]/g, "_");
  }

  static firstMember(members: Record<string, MkMember>): string {
    return Object.keys(members).sort((a, b) => members[a].joinedAt - members[b].joinedAt || (a < b ? -1 : 1))[0];
  }

  private apply(record: MkPartyRecord | null): void {
    if (this.leaving || this.restoring) return;
    const mine = record && record.members ? record.members[this.myId] : undefined;
    if (!mine && record && this.lastMe) {
      this.restore(this.lastMe);
      return;
    }
    if (!MkPartyDirectory.isAlive(record) || !mine) {
      this.close();
      return;
    }
    this.lastMe = mine;
    this.record = record;
    this.handOffIfLeaderGone();
    this.onChange();
    const ticket = this.ticket();
    if (ticket && !this.handled.has(ticket.matchId) && !this.book().has(ticket.matchId)) {
      this.handled.add(ticket.matchId);
      this.onTicket(ticket);
    }
  }

  // 팀장이 끊기면 가장 먼저 들어온 사람이 팀장을 이어받는다. 연승(전적)은 대기실에 있으니 그대로 이어진다.
  private handOffIfLeaderGone(): void {
    const record = this.record as MkPartyRecord;
    const members = record.members as Record<string, MkMember>;
    if (members[record.leaderId] || this.handingOff || MkParty.firstMember(members) !== this.myId) return;
    this.handingOff = true;
    this.ref.transaction((current) => {
      const latest = current as MkPartyRecord | null;
      if (!MkPartyDirectory.isAlive(latest)) return undefined;
      const party = latest as MkPartyRecord;
      if (party.members![party.leaderId]) return undefined;
      party.leaderId = MkParty.firstMember(party.members as Record<string, MkMember>);
      party.search = null;
      return party;
    }).then(() => { this.handingOff = false; }, () => { this.handingOff = false; });
  }

  private close(): void {
    this.record = null;
    this.lastMe = null;
    this.stopListening();
    this.onClosed("팀 대기실에서 나왔어요.");
  }

  // 태블릿이 잠깐 잠들거나 와이파이가 끊기면 서버의 onDisconnect 가 내 자리를 지운다.
  // 스스로 나간 게 아니고 대기실이 아직 남아 있으면 그 자리를 되살려 전적·연승을 지킨다.
  private restore(me: MkMember): void {
    this.restoring = true;
    let back = false;
    this.ref.transaction((current) => {
      back = false;
      const record = current as MkPartyRecord | null;
      if (!record || !record.leaderId) return undefined;
      const members = record.members || {};
      if (members[this.myId]) {
        back = true;
        return undefined;
      }
      if (Object.keys(members).length >= this.limit) return undefined;
      members[this.myId] = me;
      record.members = members;
      back = true;
      return record;
    }).then(() => back, () => false).then((ok) => {
      this.restoring = false;
      if (this.leaving) return;
      if (!ok) {
        this.close();
        return;
      }
      this.ref.child("members/" + this.myId).onDisconnect().remove();
      this.ref.once("value").then((snapshot) => this.apply(snapshot.val<MkPartyRecord>()), () => undefined);
    });
  }

  private stopListening(): void {
    if (!this.listener) return;
    try { this.ref.off("value", this.listener); } catch (error) { /* 이미 끊긴 연결 */ }
    this.listener = null;
  }
}

// 팀장 기기에서만 돈다: 대기열 항목 올리기·내리기와, 내 차례면 묶어서 일반 방을 만들고 각 팀에 표를 나눠 주기.
class MkQueue {
  private static readonly RETRY_MS = 250;
  private static readonly LOST_GRACE_MS = 4000;
  private entries: MkQueueMap | null = null;
  private listener: ((snapshot: FirebaseSnapshot) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private binding = false;
  private restUntil = 0;
  private active = false;
  private cancelling = false;
  private since = 0;
  onBound: (plan: MkMatchPlan) => void = () => undefined;
  onError: (message: string) => void = () => undefined;
  onEntries: () => void = () => undefined;

  constructor(
    private readonly database: FirebaseDatabase,
    private readonly clock: MkClock,
    private readonly paths: MkPaths,
    private readonly matcher: MkMatcher,
    private readonly maker: MkRoomMaker,
    private readonly random: () => number = Math.random
  ) {}

  async enter(party: MkParty): Promise<void> {
    const since = this.clock.now();
    this.since = since;
    const people: Record<string, MkMember> = {};
    party.members().forEach(([id, member]) => { people[id] = { nick: member.nick, joinedAt: member.joinedAt, look: member.look || null }; });
    const last = party.lastMatch();
    const entry: MkQueueEntry = { leader: party.myId, people, bots: party.bots(), size: party.size(), at: since, claim: null };
    if (last.rivals && last.rivals.length) entry.avoid = last.rivals.slice();
    if (last.ai) entry.owed = true;
    const ref = this.database.ref(this.paths.entry(party.code));
    ref.onDisconnect().remove();
    await ref.set(entry);
    await party.markSearching(since);
    this.watch(party);
  }

  // 내 항목을 실제로 뺐을 때만 true. 누가 묶어 가는 중(claim)이거나 이미 묶여 빠졌으면 false — 곧 표가 온다.
  async cancel(party: MkParty): Promise<boolean> {
    const ref = this.database.ref(this.paths.entry(party.code));
    let removed = false;
    // 실제 Firebase 는 transaction 을 부르는 순간 내 기기 구독에 "항목 없음"을 먼저 보여 준다.
    // 그걸 "표 없이 사라짐"으로 오해해 복구 타이머를 걸면, 4초 안에 다시 매칭했을 때 새 '찾는 중'을 지워
    // 대기열에 항목이 남은 채 또 매칭하게 되고 표가 두 번 온다(24번 "방이 두 번 잡힘" 보고).
    this.cancelling = true;
    let result: FirebaseTransactionResult;
    try {
      result = await ref.transaction((current) => {
        removed = false;
        const entry = current as MkQueueEntry | null;
        if (!entry) return null;
        if (!this.matcher.isFree(entry, this.clock.now())) return undefined;
        removed = true;
        return null;
      });
    } finally {
      this.cancelling = false;
    }
    if (!result.committed) return false;
    this.stop();
    try { ref.onDisconnect().cancel(); } catch (error) { /* 이미 끊긴 연결 */ }
    if (removed) await party.markSearching(null);
    else this.recoverIfLost(party);
    return removed;
  }

  hasCompany(myCode: string): boolean {
    return this.matcher.hasCompany(this.entries, this.clock.now(), myCode);
  }

  // 대기 화면의 "지금 기다리는 학생 n명". 이미 보고 있는 대기열 구독 값만 세므로 요청이 늘지 않는다.
  // 누가 묶어 가는 중(차지된) 항목은 곧 빠지므로 세지 않는다. 대기열을 아직 못 받았으면 null.
  othersWaiting(myCode: string): number | null {
    if (!this.active || !this.entries) return null;
    const entries = this.entries, now = this.clock.now();
    return Object.keys(entries)
      .filter((code) => code !== myCode && !!entries[code] && entries[code].size > 0 && this.matcher.isFree(entries[code], now))
      .reduce((sum, code) => sum + Object.keys(entries[code].people || {}).length, 0);
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.listener) {
      try { this.database.ref(this.paths.queue).off("value", this.listener); } catch (error) { /* 이미 끊긴 연결 */ }
      this.listener = null;
    }
  }

  private watch(party: MkParty): void {
    const myCode = party.code;
    this.stop();
    this.active = true;
    this.listener = this.database.ref(this.paths.queue).on("value", (snapshot) => {
      this.entries = snapshot.val<MkQueueMap>();
      if (!this.entries || !this.entries[myCode]) {
        if (this.cancelling) return;
        this.stop();
        this.recoverIfLost(party);
        this.onEntries();
        return;
      }
      this.consider(myCode);
      this.onEntries();
    });
  }

  // 내 항목이 표 없이 사라지면(묶던 사람이 표를 못 나눠 줌·연결 끊김) "찾는 중"에 갇히지 않게 잠시 뒤 풀어 준다.
  // 그 사이 다시 매칭을 눌렀으면(찾기 시작 시각이 다름) 새 매칭이므로 건드리지 않는다.
  private recoverIfLost(party: MkParty): void {
    const since = this.since;
    setTimeout(() => {
      const search = party.searching();
      if (this.active || !search || search.since !== since || party.ticket()) return;
      party.markSearching(null).catch(() => undefined);
      this.onError("매칭이 끊겼어요. 다시 매칭 시작을 눌러 주세요.");
    }, MkQueue.LOST_GRACE_MS);
  }

  private consider(myCode: string): void {
    if (!this.active) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const now = this.clock.now();
    if (this.binding) return;
    if (now < this.restUntil) {
      this.timer = setTimeout(() => this.consider(myCode), this.restUntil - now + 5);
      return;
    }
    if (this.matcher.anchor(this.entries, now) === myCode && this.matcher.plan(this.entries, now, this.random)) {
      this.bind(myCode);
      return;
    }
    const next = this.matcher.nextCheck(this.entries, now);
    if (next !== null) this.timer = setTimeout(() => this.consider(myCode), next - now + 5);
  }

  private async bind(myCode: string): Promise<void> {
    this.binding = true;
    let plan: MkMatchPlan | null = null;
    try {
      const result = await this.database.ref(this.paths.queue).transaction((current) => {
        plan = null;
        const entries = current as MkQueueMap | null;
        const now = this.clock.now();
        if (!entries || this.matcher.anchor(entries, now) !== myCode) return undefined;
        plan = this.matcher.plan(entries, now, this.random);
        if (!plan) return undefined;
        const claim: MkClaim = { by: myCode, at: now, id: plan.matchId };
        plan.groups.forEach((group) => { entries[group.code].claim = claim; });
        return entries;
      });
      const claimed = plan as MkMatchPlan | null;
      if (result.committed && claimed && (await this.deliver(claimed))) {
        this.binding = false;
        this.consider(myCode);
        return;
      }
    } catch (error) {
      this.onError("매칭 중 연결이 끊겼어요. 다시 시도해 주세요.");
    }
    this.retryLater(myCode);
  }

  // 오래 기다려도 상대가 없을 때(aiFallbackMs): 내 항목만 차지해 우리 팀만 든 방을 만든다(상대 편은 게임이 AI 로 채움).
  // 그 사이 다른 팀장이 나를 묶어 가는 중(claim)이면 그만두고 사람끼리 매칭을 따른다.
  async goSolo(myCode: string): Promise<boolean> {
    if (this.binding) return false;
    this.binding = true;
    let plan: MkMatchPlan | null = null;
    let delivered = false;
    try {
      const result = await this.database.ref(this.paths.queue).transaction((current) => {
        plan = null;
        const entries = current as MkQueueMap | null;
        const now = this.clock.now();
        const mine = entries ? entries[myCode] : null;
        if (!entries || !mine || !this.matcher.isFree(mine, now)) return undefined;
        const solo: MkMatchPlan = {
          matchId: myCode + "-ai-" + now.toString(36),
          seed: Math.floor(this.random() * 2147483647),
          binder: myCode,
          groups: [{ code: myCode, entry: mine, side: this.random() < 0.5 ? 0 : 1 }]
        };
        mine.claim = { by: myCode, at: now, id: solo.matchId };
        plan = solo;
        return entries;
      });
      const claimed = plan as MkMatchPlan | null;
      delivered = result.committed && !!claimed && (await this.deliver(claimed));
    } catch (error) {
      delivered = false;
    }
    this.binding = false;
    if (!delivered) this.consider(myCode);
    return delivered;
  }

  // 묶기가 그만둬졌다는 건 내 기기가 본 대기열이 서버보다 늦다는 뜻이다. 바로 다시 하면
  // 같은 판단을 끝없이 되풀이하므로, 잠깐 쉬었다가(그 사이 새 대기열 값이 오면 그걸로) 다시 본다.
  private retryLater(myCode: string): void {
    this.binding = false;
    this.restUntil = this.clock.now() + MkQueue.RETRY_MS;
    this.consider(myCode);
  }

  // 방을 만드는 사이 차지가 만료돼 다른 사람이 가져갔거나 취소됐을 수 있다. 그래서 표를 나눠 주기 전에
  // 내 차지가 그대로인 항목만 transaction 으로 대기열에서 한꺼번에 빼고, 하나라도 빠졌으면 방을 버리고 다시 한다.
  private async deliver(plan: MkMatchPlan): Promise<boolean> {
    const made = await this.maker.create(plan).catch(() => null);
    if (!made) {
      await this.release(plan);
      return false;
    }
    let confirmed = false;
    const sealed = await this.database.ref(this.paths.queue).transaction((current) => {
      confirmed = false;
      const entries = current as MkQueueMap | null;
      if (!entries) return undefined;
      const held = plan.groups.every((group) => {
        const entry = entries[group.code];
        return !!entry && !!entry.claim && entry.claim.id === plan.matchId;
      });
      if (!held) return undefined;
      plan.groups.forEach((group) => { delete entries[group.code]; });
      confirmed = true;
      return entries;
    }).catch(() => null);
    if (!sealed || !sealed.committed || !confirmed) {
      if (this.maker.discard) await this.maker.discard(made).catch(() => undefined);
      await this.release(plan);
      return false;
    }
    const at = this.clock.now();
    const expect = plan.groups.reduce((sum, group) => sum + Object.keys(group.entry.people || {}).length, 0);
    const updates: Record<string, unknown> = {};
    plan.groups.forEach((group) => {
      const rivals: string[] = [];
      plan.groups.forEach((other) => {
        if (other !== group) Object.keys(other.entry.people || {}).forEach((id) => rivals.push(other.entry.people[id].nick));
      });
      const ticket: MkTicket = { matchId: plan.matchId, room: made.room, side: group.side, host: made.host, expect, at, rivals };
      if (made.map) ticket.map = made.map;
      updates[this.paths.party(group.code) + "/match"] = ticket;
      updates[this.paths.party(group.code) + "/search"] = null;
      updates[this.paths.party(group.code) + "/last"] = { rivals: plan.groups.filter((other) => other !== group).map((other) => other.code), ai: plan.groups.length === 1 };
    });
    // 실제 Firebase 는 ref("") 를 잘못된 경로로 거절한다. 루트는 "/" 로 연다.
    try {
      await this.database.ref("/").update(updates);
    } catch (error) {
      if (this.maker.discard) await this.maker.discard(made).catch(() => undefined);
      this.onError("상대에게 경기장을 알리지 못했어요. 다시 매칭해 주세요.");
      return true;
    }
    this.onBound(plan);
    return true;
  }

  private async release(plan: MkMatchPlan): Promise<void> {
    await this.database.ref(this.paths.queue).transaction((current) => {
      const entries = current as MkQueueMap | null;
      if (!entries) return undefined;
      plan.groups.forEach((group) => {
        const entry = entries[group.code];
        if (entry && entry.claim && entry.claim.id === plan.matchId) entry.claim = null;
      });
      return entries;
    });
  }
}

// 경기 중인 팀이 대기열 자기 자리에 세워 두는 표지판(size 0, busyUntil). 다른 팀이 "방금 붙은 상대와 또 붙을지,
// 곧 돌아올 팀을 잠깐 기다릴지" 판단하는 데 쓴다. 팀장 기기만 세우고, 끊기면 onDisconnect 로 사라지며,
// 시간이 지나면 스스로 무시된다. 진짜 대기 항목(매칭 시작)이 이미 있으면 덮어쓰지 않는다.
class MkBusySign {
  constructor(private readonly database: FirebaseDatabase, private readonly clock: MkClock, private readonly paths: MkPaths) {}

  // owed: AI 와 하는 판이면 true. 돌아오는 이 팀이 또 혼자 남지 않게 다른 팀이 잠깐 기다려 준다.
  async put(party: MkParty, forMs: number, owed: boolean): Promise<void> {
    if (!party.isLeader()) return;
    const ref = this.database.ref(this.paths.entry(party.code));
    const now = this.clock.now();
    const sign: MkQueueEntry = { leader: party.myId, people: {}, bots: 0, size: 0, at: now, claim: null, busyUntil: now + forMs };
    if (owed) sign.owed = true;
    try {
      ref.onDisconnect().remove();
      await ref.transaction((current) => {
        const entry = current as MkQueueEntry | null;
        if (entry && entry.size > 0) return undefined;
        return sign;
      });
    } catch (error) { /* 표지판은 없어도 매칭은 된다 */ }
  }
}

// ───── 게임에 붙이는 부분: 팀 대기실 화면(MkPartyPanel)과 흐름(MkRandomFlow) ─────
// 게임마다 다른 것(방 만들기·표로 입장·경기 시작·화면 전환)은 MkGameHooks 로 받고, 나머지
// (팀 대기실 만들기·들어가기, 매칭 시작/취소, 표 받기, 모이면 시작, 결과 반영, 팀 대기실로 돌아오기)는 여기 한 곳에 둔다.

interface MkGameHooks extends MkRoomMaker {
  member(): MkMember;
  enterRoom(ticket: MkTicket, hosting: boolean): Promise<boolean>;
  leaveRoom(): void;
  startMatch(): void;
  showParty(): void;
  showStart(message: string): void;
}

interface MkFlowOptions {
  gameRoot: string;
  queue: string;
  partyLimit: number;
  matcher: MkMatcher;
  intro: string;
  showRank?: boolean;
  solo?: boolean;
  allowBots?: boolean;
  startWaitMs?: number;
  aiFallbackMs?: number;
}

interface MkPartyLookup {
  handled: boolean;
  message: string;
}

// 편(side)마다 자리 번호를 정해 준다. 일반 방에 assign/<id> 로 넣어 두면 들어오는 사람이 그 자리에 앉는다.
class MkSeatAssign {
  static bySide(plan: MkMatchPlan, perSide: number): Record<string, number> {
    const assign: Record<string, number> = {};
    plan.groups.forEach((group) => {
      MkSeatAssign.peopleOf(group).slice(0, perSide).forEach((id, index) => { assign[id] = group.side * perSide + index; });
    });
    return assign;
  }

  static peopleOf(group: MkPlannedEntry): string[] {
    const people = group.entry.people || {};
    return Object.keys(people).sort((a, b) => people[a].joinedAt - people[b].joinedAt || (a < b ? -1 : 1));
  }

  static sideOf(plan: MkMatchPlan, id: string): number {
    const group = plan.groups.find((item) => !!(item.entry.people || {})[id]);
    return group ? group.side : -1;
  }
}

class MkPartyPanel {
  onMatch: () => void = () => undefined;
  onLeave: () => void = () => undefined;
  onAddBot: () => void = () => undefined;
  onRemoveBot: () => void = () => undefined;
  onAiNow: () => void = () => undefined;
  private readonly code: HTMLSpanElement;
  private readonly crowd: HTMLDivElement;
  private readonly aiNowButton: HTMLButtonElement;
  private readonly head: HTMLHeadingElement;
  private readonly seats: HTMLDivElement;
  private readonly notice: HTMLDivElement;
  private readonly matchButton: HTMLButtonElement;
  private readonly hint: HTMLDivElement;
  private readonly streak: MkStreakButton;

  constructor(screen: HTMLElement, mount: HTMLElement, private readonly options: MkFlowOptions) {
    this.streak = new MkStreakButton(screen, !!options.showRank);
    this.head = document.createElement("h2");
    this.head.className = "mk-head";
    this.code = document.createElement("span");
    this.code.className = "mk-code";
    if (options.solo) this.head.append("랜덤 매칭 ", this.streak.element);
    else this.head.append("팀 코드 ", this.code, this.streak.element);
    this.seats = document.createElement("div");
    this.seats.className = "mk-team";
    this.seats.addEventListener("click", (event) => {
      const seat = (event.target as HTMLElement).closest("[data-mk-seat]") as HTMLButtonElement | null;
      if (!seat || seat.disabled) return;
      if (seat.dataset.mkSeat === "bot") this.onRemoveBot();
      if (seat.dataset.mkSeat === "empty") this.onAddBot();
    });
    this.notice = document.createElement("div");
    this.notice.className = "mk-notice";
    this.crowd = document.createElement("div");
    this.crowd.className = "mk-crowd";
    this.matchButton = MkPartyPanel.button("st-btn primary mk-match", "매칭 시작", () => this.onMatch());
    this.aiNowButton = MkPartyPanel.button("st-btn primary mk-ai-now", "🤖 AI와 바로 시작", () => this.onAiNow());
    this.aiNowButton.hidden = true;
    this.hint = document.createElement("div");
    this.hint.className = "st-hint mk-hint";
    const leave = MkPartyPanel.button("st-btn mk-leave", options.solo ? "나가기" : "팀 나가기", () => this.onLeave());
    mount.textContent = "";
    const buttons = document.createElement("div");
    buttons.className = "st-row mk-buttons";
    buttons.append(this.aiNowButton, this.matchButton);
    mount.append(this.head, this.seats, this.notice, this.crowd, buttons, this.hint, leave);
  }

  setNotice(text: string): void {
    if (this.notice.textContent !== text) this.notice.textContent = text;
  }

  setBusy(busy: boolean): void {
    this.matchButton.disabled = busy;
    this.aiNowButton.disabled = busy;
  }

  // waitingForOthers: 대기열에 상대가 있는데 바로 전 판 상대라, 경기 중인 다른 팀이 돌아오길 잠깐 기다리는 중.
  // waiting: 대기열에서 나 말고 기다리는 학생 수(찾는 중이 아니거나 아직 모르면 null).
  render(party: MkParty, waitingForOthers: boolean = false, waiting: number | null = null): void {
    const leader = party.isLeader();
    const searching = !!party.searching();
    const book = party.book();
    this.code.textContent = party.code;
    this.streak.render(book);
    this.seats.textContent = "";
    const title = document.createElement("h3");
    title.textContent = this.options.solo ? "나" : "우리 팀";
    this.seats.appendChild(title);
    const leaderId = party.record ? party.record.leaderId : "";
    party.members().forEach(([id, member]) => {
      const tags = [id === leaderId && !this.options.solo ? "팀장" : "", id === party.myId ? "나" : ""].filter(Boolean).join(" ");
      this.seats.appendChild(MkPartyPanel.seat("div", "mk-seat" + (id === party.myId ? " me" : ""), member.nick, tags, ""));
    });
    const editable = leader && !searching;
    if (this.options.allowBots) {
      for (let index = 0; index < party.bots(); index++) {
        const seat = MkPartyPanel.seat("button", "mk-seat bot", "🤖 AI", editable ? "눌러서 빼기" : "", "bot") as HTMLButtonElement;
        seat.disabled = !editable;
        this.seats.appendChild(seat);
      }
    }
    for (let count = party.members().length + (this.options.allowBots ? party.bots() : 0); count < this.options.partyLimit; count++) {
      if (this.options.allowBots && editable) this.seats.appendChild(MkPartyPanel.seat("button", "mk-seat empty", "🤖 AI 추가", "빈 자리 · 친구는 팀 코드로 들어와요", "empty"));
      else this.seats.appendChild(MkPartyPanel.seat("div", "mk-seat empty", "빈 자리", this.options.allowBots ? "친구는 팀 코드로 들어와요" : "친구는 팀 코드로 들어와요 · 비면 AI가 채워요", ""));
    }
    this.matchButton.textContent = searching ? "매칭 취소" : "매칭 시작";
    this.matchButton.classList.toggle("primary", !searching);
    this.matchButton.classList.toggle("cancel", searching);
    this.matchButton.disabled = !leader;
    this.aiNowButton.hidden = !this.options.aiFallbackMs || !searching || !leader;
    this.aiNowButton.disabled = false;
    const crowdText = !searching || waiting === null ? "" : waiting > 0 ? "👥 지금 다른 학생 " + waiting + "명이 기다리는 중" : "👥 지금 기다리는 다른 학생이 없어요";
    if (this.crowd.textContent !== crowdText) this.crowd.textContent = crowdText;
    this.crowd.classList.toggle("alone", searching && waiting === 0);
    const streakNote = book.streak() > 0 ? " · 지금 " + book.streak() + "연승 중" : "";
    const fallback = this.options.aiFallbackMs ? Math.ceil(this.options.aiFallbackMs / 1000) - party.searchSeconds() : 0;
    const fallbackNote = waitingForOthers ? " · 다른 팀 경기가 끝나길 기다리는 중(같은 상대와 연달아 만나지 않게)"
      : !this.options.aiFallbackMs ? "" : fallback > 0 ? " · " + fallback + "초 뒤 AI와 시작해요" : " · AI와 시작하는 중…";
    this.hint.textContent = searching
      ? "상대를 찾는 중… " + party.searchSeconds() + "초" + fallbackNote + streakNote
      : (leader ? this.options.intro : "팀장이 매칭을 시작하길 기다리는 중이에요…") + streakNote;
  }

  private static button(className: string, text: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", () => { button.blur(); onClick(); });
    return button;
  }

  private static seat(tag: "div" | "button", className: string, name: string, note: string, kind: string): HTMLElement {
    const seat = document.createElement(tag);
    seat.className = className;
    if (tag === "button") (seat as HTMLButtonElement).type = "button";
    if (kind) seat.dataset.mkSeat = kind;
    const bold = document.createElement("b");
    bold.textContent = name;
    const small = document.createElement("small");
    small.textContent = note;
    seat.append(bold, small);
    return seat;
  }
}

class MkRandomFlow {
  private static readonly START_WAIT_MS = 15000;
  // 사람 상대가 대기열에 있어 AI 대체를 미뤄도, 묶는 팀장 기기가 잠들어 묶지 못할 수 있으니 이만큼 더 지나면 AI 와 시작한다.
  private static readonly COMPANY_GRACE_MS = 15000;

  readonly paths: MkPaths;
  private readonly directory: MkPartyDirectory;
  private readonly sign: MkBusySign;
  private party: MkParty | null = null;
  private queue: MkQueue | null = null;
  private current: MkTicket | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private secondsTimer: ReturnType<typeof setInterval> | null = null;
  private startedFor = "";
  private reported = false;
  private fallbackFor = 0;
  private onResult: () => void = () => undefined;

  constructor(
    private readonly database: FirebaseDatabase,
    private readonly clock: MkClock,
    private readonly myId: string,
    private readonly options: MkFlowOptions,
    private readonly hooks: MkGameHooks,
    private readonly panel: MkPartyPanel
  ) {
    this.paths = MkPaths.forGame(options.gameRoot, options.queue);
    this.directory = new MkPartyDirectory(database, clock, this.paths, options.partyLimit);
    this.sign = new MkBusySign(database, clock, this.paths);
    panel.onMatch = () => this.toggleSearch();
    panel.onLeave = () => this.leaveParty();
    panel.onAddBot = () => { if (this.party) this.party.setBots(this.party.bots() + 1); };
    panel.onRemoveBot = () => { if (this.party) this.party.setBots(this.party.bots() - 1); };
    panel.onAiNow = () => this.startWithAiNow();
  }

  inParty(): boolean {
    return !!this.party;
  }

  ticket(): MkTicket | null {
    return this.current;
  }

  // 여럿이 한 방에 모이는 게임에서 "우리 팀 누군가 1등"을 판단할 때 쓴다.
  memberIds(): string[] {
    return this.party ? this.party.members().map(([id]) => id) : [];
  }

  hasTicket(): boolean {
    return !!this.current;
  }

  async create(): Promise<string> {
    const code = await this.directory.create(this.myId, this.hooks.member());
    if (!code) return "랜덤 매칭 방을 만들지 못했어요. 다시 눌러 주세요.";
    this.attach(code);
    return "";
  }

  async tryJoin(code: string): Promise<MkPartyLookup> {
    if (this.options.solo || !(await this.directory.exists(code))) return { handled: false, message: "" };
    const outcome = await this.directory.join(code, this.myId, this.hooks.member());
    if (outcome.ok) this.attach(code);
    return { handled: true, message: outcome.message };
  }

  async codeTaken(code: string): Promise<boolean> {
    return this.directory.exists(code);
  }

  updateMe(): void {
    if (this.party) this.party.updateMe(this.hooks.member());
  }

  render(): void {
    if (!this.party) return;
    const searching = !!this.queue && !!this.party.searching();
    this.panel.render(this.party, searching && this.queue!.hasCompany(this.party.code), this.queue ? this.queue.othersWaiting(this.party.code) : null);
  }

  setNotice(text: string): void {
    this.panel.setNotice(text);
  }

  // 방장 기기에서 일반 방 사람 수가 바뀔 때마다 부른다. 표에 적힌 사람이 다 모이면 바로 시작한다.
  roomChanged(humans: number, hosting: boolean, inLobby: boolean): void {
    if (this.current && hosting && inLobby && humans >= this.current.expect) this.startNow();
  }

  // 판이 끝났을 때 모두 부른다(전적에 쓰는 건 팀장만, 같은 판은 한 번만).
  matchEnded(outcome: MkOutcome, onStreak: () => void = () => undefined): void {
    const ticket = this.current;
    if (!ticket || !this.party || this.reported) return;
    this.reported = true;
    this.onResult = onStreak;
    this.party.report(ticket, outcome);
  }

  endHint(): string {
    return this.party ? "지금 " + this.party.book().streakLabel().replace("🔥 ", "") : "";
  }

  backToParty(message: string): void {
    const note = this.reported ? "" : message;
    this.clearStartTimer();
    this.current = null;
    this.reported = false;
    this.onResult = () => undefined;
    this.hooks.leaveRoom();
    if (this.party) {
      if (!this.party.searching()) this.sign.put(this.party, this.options.matcher.returnGraceMs, !!this.party.lastMatch().ai);
      this.hooks.showParty();
      this.panel.setNotice(note);
      this.render();
    } else this.hooks.showStart(note);
  }

  private attach(code: string): void {
    const party = new MkParty(this.database, this.clock, this.paths, code, this.myId, this.options.partyLimit);
    this.party = party;
    party.onChange = () => {
      this.render();
      this.tickSeconds(!!party.searching());
      if (this.reported) this.onResult();
    };
    party.onTicket = (ticket) => this.receiveTicket(ticket);
    party.onClosed = (message) => this.dropParty(message);
    party.connect();
    this.panel.setNotice("");
    this.hooks.showParty();
  }

  private async toggleSearch(): Promise<void> {
    const party = this.party;
    if (!party || !party.isLeader()) return;
    this.panel.setBusy(true);
    try {
      if (party.searching()) {
        const cancelled = this.queue ? await this.queue.cancel(party) : (await party.markSearching(null), true);
        if (!cancelled) this.panel.setNotice("상대를 찾았어요! 곧 경기장으로 가요.");
      } else {
        this.panel.setNotice("");
        if (this.queue) this.queue.stop();
        this.queue = new MkQueue(this.database, this.clock, this.paths, this.options.matcher, this.hooks);
        this.queue.onError = (message) => this.panel.setNotice(message);
        this.queue.onEntries = () => this.render();
        await this.queue.enter(party);
      }
    } catch (error) {
      this.panel.setNotice("매칭 서버에 연결하지 못했어요. (인터넷·데이터베이스 규칙 확인)");
    }
    this.render();
  }

  private async receiveTicket(ticket: MkTicket): Promise<void> {
    if (this.queue) this.queue.stop();
    this.tickSeconds(false);
    this.hooks.leaveRoom();
    this.current = ticket;
    this.reported = false;
    if (this.party) this.sign.put(this.party, this.options.matcher.busyMs, !(ticket.rivals || []).length);
    const hosting = ticket.host === this.myId;
    const entered = await this.hooks.enterRoom(ticket, hosting).catch(() => false);
    if (!entered) {
      this.current = null;
      if (this.party) this.party.clearTicket(ticket.matchId);
      this.hooks.showParty();
      this.panel.setNotice("경기장에 들어가지 못했어요. 다시 매칭해 주세요.");
      return;
    }
    if (hosting) {
      this.clearStartTimer();
      this.startTimer = setTimeout(() => this.startNow(), this.options.startWaitMs || MkRandomFlow.START_WAIT_MS);
    }
  }

  private startNow(): void {
    this.clearStartTimer();
    if (!this.current || this.startedFor === this.current.matchId) return;
    this.startedFor = this.current.matchId;
    this.hooks.startMatch();
  }

  private clearStartTimer(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = null;
  }

  private tickSeconds(on: boolean): void {
    if (on && !this.secondsTimer) this.secondsTimer = setInterval(() => { this.render(); this.checkAiFallback(); }, 1000);
    if (!on && this.secondsTimer) {
      clearInterval(this.secondsTimer);
      this.secondsTimer = null;
    }
  }

  private checkAiFallback(): void {
    const party = this.party, wait = this.options.aiFallbackMs;
    const search = party ? party.searching() : null;
    if (!wait || !party || !search || !party.isLeader() || !this.queue || this.fallbackFor === search.since) return;
    const waited = this.clock.now() - search.since;
    if (waited < wait) return;
    if (this.queue.hasCompany(party.code) && waited < wait + this.options.matcher.rematchWaitMs + MkRandomFlow.COMPANY_GRACE_MS) return;
    this.fallbackFor = search.since;
    this.queue.goSolo(party.code);
  }

  // 기다리기 싫으면 aiFallbackMs 를 기다리지 않고 바로 AI 대전. 그 사이 사람과 묶이는 중이면 사람 매칭을 따른다.
  private async startWithAiNow(): Promise<void> {
    const party = this.party;
    const search = party ? party.searching() : null;
    if (!party || !search || !party.isLeader() || !this.queue) return;
    this.fallbackFor = search.since;
    this.panel.setBusy(true);
    const started = await this.queue.goSolo(party.code).catch(() => false);
    if (!started && !party.ticket()) this.panel.setNotice("다른 학생과 연결되는 중이에요. 잠시만 기다려 주세요.");
    this.render();
  }

  private async leaveParty(): Promise<void> {
    const party = this.party;
    if (!party) return;
    if (this.queue) this.queue.stop();
    this.tickSeconds(false);
    this.party = null;
    await party.leave().catch(() => undefined);
    this.hooks.showStart("");
  }

  private dropParty(message: string): void {
    if (this.queue) this.queue.stop();
    this.tickSeconds(false);
    this.party = null;
    if (!this.current) this.hooks.showStart(message);
  }
}

// 연승 표시 버튼. 누르면 이 팀 대기실의 모든 전적 창을 띄운다.
class MkStreakButton {
  readonly element: HTMLButtonElement;
  private book = new MkRecordBook(null);
  private readonly dialog: MkHistoryDialog;

  constructor(host: HTMLElement, private readonly showRank: boolean) {
    this.element = document.createElement("button");
    this.element.type = "button";
    this.element.className = "mk-streak";
    this.element.addEventListener("click", () => this.dialog.show(this.book, this.showRank));
    this.dialog = new MkHistoryDialog(host);
    this.render(this.book);
  }

  render(book: MkRecordBook): void {
    this.book = book;
    const label = book.streakLabel();
    if (this.element.textContent !== label) this.element.textContent = label;
    this.element.classList.toggle("hot", book.streak() > 0);
  }
}

// 전적 창. 그 게임 .st-screen 안에 붙어서 --st-* 색을 그대로 받는다.
class MkHistoryDialog {
  private static readonly MARKS: Record<MkResult, string> = { win: "승", draw: "무", lose: "패" };
  private readonly backdrop: HTMLDivElement;
  private readonly summary: HTMLParagraphElement;
  private readonly list: HTMLOListElement;
  private readonly onKey = (event: KeyboardEvent) => { if (event.key === "Escape") this.hide(); };

  constructor(host: HTMLElement) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "mk-backdrop";
    this.backdrop.hidden = true;
    const card = document.createElement("div");
    card.className = "st-card mk-dialog";
    card.setAttribute("role", "dialog");
    const title = document.createElement("h2");
    title.textContent = "우리 팀 전적";
    this.summary = document.createElement("p");
    this.summary.className = "mk-summary";
    this.list = document.createElement("ol");
    this.list.className = "mk-history";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "st-btn";
    close.textContent = "닫기";
    close.addEventListener("click", () => this.hide());
    card.append(title, this.summary, this.list, close);
    this.backdrop.appendChild(card);
    this.backdrop.addEventListener("click", (event) => { if (event.target === this.backdrop) this.hide(); });
    host.appendChild(this.backdrop);
  }

  show(book: MkRecordBook, showRank: boolean): void {
    this.summary.textContent = book.lines.length ? book.summary() + " · 지금 " + (book.streak() > 0 ? book.streak() + "연승" : "연승 없음") : "아직 경기가 없어요";
    this.list.textContent = "";
    book.lines.forEach((line) => this.list.appendChild(this.row(line, showRank)));
    this.backdrop.hidden = false;
    document.addEventListener("keydown", this.onKey);
  }

  hide(): void {
    this.backdrop.hidden = true;
    document.removeEventListener("keydown", this.onKey);
  }

  private row(line: MkHistoryLine, showRank: boolean): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "mk-line " + line.result;
    const order = document.createElement("span");
    order.className = "mk-n";
    order.textContent = line.n + "판";
    const mark = document.createElement("b");
    mark.className = "mk-mark";
    mark.textContent = MkHistoryDialog.MARKS[line.result] + (showRank && line.rank ? " " + line.rank + "위/" + (line.of || "?") : "");
    const detail = document.createElement("span");
    detail.className = "mk-detail";
    const parts = [line.rivals && line.rivals.length ? "vs " + line.rivals.join(", ") : "vs AI"];
    if (line.map) parts.push(line.map);
    detail.textContent = parts.join(" · ");
    const time = document.createElement("span");
    time.className = "mk-time";
    time.textContent = MkHistoryDialog.clock(line.at);
    item.append(order, mark, detail, time);
    return item;
  }

  private static clock(at: number): string {
    const date = new Date(at);
    return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
  }
}
