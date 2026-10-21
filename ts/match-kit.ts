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

interface MkPartyRecord {
  leaderId: string;
  createdAt: number;
  members?: Record<string, MkMember>;
  bots?: number;
  search?: MkSearch | null;
  match?: MkTicket | null;
  history?: Record<string, MkHistoryLine>;
}

interface MkClaim {
  by: string;
  at: number;
  id: string;
}

interface MkQueueEntry {
  leader: string;
  people: Record<string, MkMember>;
  bots: number;
  size: number;
  at: number;
  claim?: MkClaim | null;
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
abstract class MkMatcher {
  static readonly TIMING: MkTiming = { settleMs: 3000, claimExpireMs: 10000 };

  constructor(readonly partyLimit: number, protected readonly timing: MkTiming = MkMatcher.TIMING) {}

  protected abstract pick(ready: Array<[string, MkQueueEntry]>): Array<[string, MkQueueEntry]> | null;

  protected abstract sides(count: number, random: () => number): number[];

  anchor(entries: MkQueueMap | null, now: number): string | null {
    const ready = this.ready(entries, now);
    return ready.length ? ready[0][0] : null;
  }

  plan(entries: MkQueueMap | null, now: number, random: () => number): MkMatchPlan | null {
    const ready = this.ready(entries, now);
    if (!ready.length) return null;
    const picked = this.pick(ready);
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
      const moments = [entry.at + this.timing.settleMs];
      if (entry.claim) moments.push(entry.claim.at + this.timing.claimExpireMs + 1);
      moments.forEach((moment) => {
        if (moment > now && (next === null || moment < next)) next = moment;
      });
    });
    return next;
  }

  private ready(entries: MkQueueMap | null, now: number): Array<[string, MkQueueEntry]> {
    return Object.keys(entries || {})
      .map((code) => [code, (entries as MkQueueMap)[code]] as [string, MkQueueEntry])
      .filter(([, entry]) => entry && entry.size > 0 && entry.at + this.timing.settleMs <= now && this.isFree(entry, now))
      .sort((a, b) => a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1));
  }
}

// 두 편이 맞붙는 게임(24·25·30·34·35): 가장 먼저 온 팀과 그다음 준비된 팀을 묶고 편은 무작위.
class MkVersusMatcher extends MkMatcher {
  protected pick(ready: Array<[string, MkQueueEntry]>): Array<[string, MkQueueEntry]> | null {
    const fitting = ready.filter(([, entry]) => entry.size <= this.partyLimit);
    if (fitting.length < 2 || fitting[0] !== ready[0]) return null;
    return [fitting[0], fitting[1]];
  }

  protected sides(count: number, random: () => number): number[] {
    return random() < 0.5 ? [0, 1] : [1, 0];
  }
}

// 여럿이 한 방에 모이는 게임(31·32·38·39): 먼저 온 순서로 정원까지 채우고, 넘치는 항목은 다음 묶음으로.
class MkFreeForAllMatcher extends MkMatcher {
  constructor(partyLimit: number, readonly capacity: number, timing: MkTiming = MkMatcher.TIMING) {
    super(partyLimit, timing);
  }

  protected pick(ready: Array<[string, MkQueueEntry]>): Array<[string, MkQueueEntry]> | null {
    const picked: Array<[string, MkQueueEntry]> = [];
    let people = 0;
    ready.forEach((item) => {
      if (item[1].size <= this.partyLimit && people + item[1].size <= this.capacity) {
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
      Object.keys(all).forEach((code) => {
        if (!MkPartyDirectory.isAlive(all[code])) updates[code] = null;
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
    const searching = !!this.searching();
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
    if (wasLeader && searching) await this.database.ref(this.paths.entry(this.code)).remove();
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
    if (this.leaving) return;
    if (!MkPartyDirectory.isAlive(record) || !(record as MkPartyRecord).members![this.myId]) {
      this.record = null;
      this.stopListening();
      this.onClosed("팀 대기실에서 나왔어요.");
      return;
    }
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
  onBound: (plan: MkMatchPlan) => void = () => undefined;
  onError: (message: string) => void = () => undefined;

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
    const people: Record<string, MkMember> = {};
    party.members().forEach(([id, member]) => { people[id] = { nick: member.nick, joinedAt: member.joinedAt, look: member.look || null }; });
    const entry: MkQueueEntry = { leader: party.myId, people, bots: party.bots(), size: party.size(), at: since, claim: null };
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
    const result = await ref.transaction((current) => {
      removed = false;
      const entry = current as MkQueueEntry | null;
      if (!entry) return null;
      if (!this.matcher.isFree(entry, this.clock.now())) return undefined;
      removed = true;
      return null;
    });
    if (!result.committed) return false;
    this.stop();
    try { ref.onDisconnect().cancel(); } catch (error) { /* 이미 끊긴 연결 */ }
    if (removed) await party.markSearching(null);
    return removed;
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
        this.stop();
        this.recoverIfLost(party);
        return;
      }
      this.consider(myCode);
    });
  }

  // 내 항목이 표 없이 사라지면(묶던 사람이 표를 못 나눠 줌·연결 끊김) "찾는 중"에 갇히지 않게 잠시 뒤 풀어 준다.
  private recoverIfLost(party: MkParty): void {
    setTimeout(() => {
      if (this.active || !party.searching() || party.ticket()) return;
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
