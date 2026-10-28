/* =====================================================================
   계정별 통계 · 최근 20매치 공용 뼈대 (게임을 모르는 부분, 로그인한 학생만)

   게임마다 복사하지 않고 이 파일을 함께 쓴다. 게임별 모양은 AccountGameProfile 을 이어 받은
   자식 클래스(30번 TeamBattleProfile 등)가 정하고, 읽고 쓰는 일은 AccountMatchStore 한 곳이 한다.

   저장 위치(Realtime Database, 규칙은 데이터베이스규칙.json 의 users/$uid · gameRanks):
     users/<uid>/stats/<게임키>          누적 통계(게임별 모양, ids/<경기열쇠> 로 중복 방지)
     users/<uid>/recent/<게임키>/<0~19>  최근 매치 20칸(2026-10-27 선생님 요청으로 10칸에서 늘림). 칸 이름 규칙으로도 20판을 넘지 못한다.
     gameRanks/<게임키>/<학년-반|none>/<uid> { n 이름, g 판, w 승, x 게임별 숫자 하나 }  교사 화면 반별 순위용 요약(교사만 읽음).
       누적 통계와 같은 PATCH 에서 쓴다. 30번은 예전부터 쓰던 classStats(MVP 포함)를 그대로 쓴다.
   최근 매치 한 판은 공통 머리 {v, id, at(서버 시각), r(1승/0패)} + 게임별 몸통이다.
   랜덤 매칭만 있고 게임별 통계가 없는 게임(32·34·35)은 RandomMatchAccount 가 승패만 같은 구조로 남긴다.

     users/<uid>/pending/<게임키>       랜덤 매칭 판을 시작할 때 미리 적어 두는 패배 보고 {id, rep}(AccountPendingCodec 설명 참고)
   요청 빈도: 랜덤 매칭 판 시작 때 읽기 1번 + 쓰기 1번(미리 적기), 경기 끝 쓰기 1번(읽기-수정-쓰기 + 여러 경로 PATCH 1번, 미리 적은 보고도 같은 PATCH 에서 지움),
   창을 열 때 읽기 1번. 그 외 요청은 만들지 않는다.
   이 파일의 계산 클래스는 화면도 통신도 몰라서 tools/account-stats-unit.js 가 node 에서 직접 검사한다.
   ===================================================================== */

interface AccountDatabaseLike {
  read<T>(path: string): Promise<T | null>;
  updateRoot(values: Record<string, unknown>): Promise<void>;
}

interface AccountRecentHead {
  v: number;
  id: string;
  at: unknown;
  r: number;
}

interface AccountRecentHeadEntry {
  id: string;
  at: number;
  win: boolean;
}

interface AccountMatchPlanBase {
  recordsRecent: boolean;
  countsStats: boolean;
  win: boolean;
}

interface AccountStatsChangeBase<N> {
  node: N;
  patch: Record<string, unknown>;
}

class AccountNumbers {
  static oneDecimal(value: unknown): number {
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  static twoDecimals(value: unknown): number {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  static whole(value: unknown): number {
    return Math.round(Number(value) || 0);
  }

  static count(value: unknown): number {
    const number = Number(value);
    return isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  static runningAverage(average: number, samples: number, value: number): number {
    return AccountNumbers.oneDecimal((average * samples + value) / (samples + 1));
  }
}

class AccountRates {
  static ratio(part: number, whole: number): number | null {
    return whole > 0 ? part / whole : null;
  }

  static winRate(node: { w: number; g: number } | null): number | null {
    return node ? AccountRates.ratio(node.w, node.g) : null;
  }
}

class AccountMatchKey {
  private static readonly MAX_LENGTH = 60;

  static of(matchId: unknown): string {
    const key = String(matchId == null ? "" : matchId).replace(/[.#$\[\]\/\s]/g, "_").slice(0, AccountMatchKey.MAX_LENGTH);
    return key || "match";
  }
}

class AccountKeyLedger {
  static readonly KEEP = 20;

  static overflowKeys(ids: Record<string, number>): string[] {
    const keys = Object.keys(ids).sort((a, b) => ids[a] - ids[b]);
    return keys.slice(0, Math.max(0, keys.length - AccountKeyLedger.KEEP));
  }
}

class AccountForfeit {
  static readonly AT = 0.5;

  static leftEarly(iLeft: boolean, progress: number): boolean {
    return iLeft && progress < AccountForfeit.AT;
  }

  /* 랜덤 매칭 판은 언제 나가도 패배로 남긴다(2026-10-27 선생님 요청). 방 만들기·코드 입장 방은 절반 규칙 그대로 */
  static progressOnLeave(randomMatch: boolean, progress: number): number {
    return randomMatch ? 1 : progress;
  }
}

class AccountShape {
  static list(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    return Object.keys(record).filter((key) => /^[0-9]+$/.test(key)).sort((a, b) => Number(a) - Number(b)).map((key) => record[key]);
  }

  static slots(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object") return {};
    const record = value as Record<string, unknown>;
    const slots: Record<string, unknown> = {};
    Object.keys(record).forEach((key) => { if (record[key] != null) slots[key] = record[key]; });
    return slots;
  }
}

class AccountRecentHeadCodec {
  static encode(version: number, key: string, win: boolean): AccountRecentHead {
    return { v: version, id: key, at: { ".sv": "timestamp" }, r: win ? 1 : 0 };
  }

  static decode(raw: unknown, version: number): AccountRecentHeadEntry | null {
    const stored = raw as AccountRecentHead | null;
    if (!stored || typeof stored !== "object" || stored.v !== version) return null;
    return { id: String(stored.id || ""), at: typeof stored.at === "number" ? stored.at : 0, win: stored.r === 1 };
  }
}

class RecentMatchRing {
  static readonly SLOTS = 20;

  static chooseSlot(stored: unknown, key: string): number {
    const slots = AccountShape.slots(stored);
    let oldestSlot = -1;
    let oldestAt = Infinity;
    for (let slot = 0; slot < RecentMatchRing.SLOTS; slot++) {
      const entry = slots[String(slot)] as AccountRecentHead | undefined;
      if (entry && entry.id === key) return -1;
    }
    for (let slot = 0; slot < RecentMatchRing.SLOTS; slot++) {
      const entry = slots[String(slot)] as AccountRecentHead | undefined;
      if (!entry) return slot;
      const at = typeof entry.at === "number" ? entry.at : 0;
      if (at < oldestAt) {
        oldestAt = at;
        oldestSlot = slot;
      }
    }
    return oldestSlot;
  }

  static decodeAll<E extends AccountRecentHeadEntry>(stored: unknown, decode: (raw: unknown) => E | null): E[] {
    const slots = AccountShape.slots(stored);
    return Object.keys(slots)
      .filter((key) => /^[0-9]{1,2}$/.test(key) && Number(key) < RecentMatchRing.SLOTS)
      .map((key) => decode(slots[key]))
      .filter((entry): entry is E => !!entry)
      .sort((a, b) => b.at - a.at);
  }
}

class AccountLoginNotice {
  static readonly STATS_LOGIN_NEEDED = "로그인하면 내 통계를 볼 수 있어요.";
  static readonly RECENT_LOGIN_NEEDED = "로그인하면 최근 매치를 볼 수 있어요.";
  static readonly NOT_READY = "로그인 정보를 준비하는 중이에요. 잠시 뒤 다시 열어 주세요.";
  static readonly STATS_FAILED = "내 통계를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.";
  static readonly RECENT_FAILED = "최근 매치를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.";
  static readonly LOADING = "불러오는 중…";
}

class RecentBlockList {
  static whenText(at: number): string {
    if (!at) return "";
    const date = new Date(at);
    const two = (n: number) => (n < 10 ? "0" : "") + n;
    return (date.getMonth() + 1) + "월 " + date.getDate() + "일 " + two(date.getHours()) + ":" + two(date.getMinutes());
  }

  static html<E extends AccountRecentHeadEntry>(entries: E[], bodyOf: (entry: E, index: number) => string): string {
    return entries.map((entry, index) =>
      '<button type="button" class="rmItem ' + (entry.win ? "win" : "lose") + '" data-recent="' + index + '">' +
      '<span class="rmHead"><b>' + (entry.win ? "승리" : "패배") + "</b><small>" + RecentBlockList.whenText(entry.at) + "</small></span>" +
      bodyOf(entry, index) + "</button>"
    ).join("");
  }
}

interface AccountRankFields {
  g: number;
  w: number;
  x: number;
}

/* 교사 화면 반별 순위 요약(gameRanks). 반은 학생이 반 링크로 처음 로그인할 때 profile/cls 에 적힌다(없으면 none = 미분류).
   선생님 계정은 순위에 넣지 않고, 반이 정해진 학생은 미분류 칸의 옛 요약을 함께 지운다(30번 classStats 와 같은 방식). */
class AccountClassRank {
  static readonly ROOT = "gameRanks";
  static readonly CLASS_PATH = "profile/cls";
  static readonly NONE = "none";
  static readonly CLASS_PATTERN = /^[12]-[1-5]$/;
  static readonly NAME_MAX = 40;

  static classKey(cls: unknown): string {
    return typeof cls === "string" && AccountClassRank.CLASS_PATTERN.test(cls) ? cls : AccountClassRank.NONE;
  }

  static patch(gameKey: string, user: PortalUser, cls: unknown, fields: AccountRankFields): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    const admins = typeof AccountPolicy === "function" ? AccountPolicy.ADMIN_UIDS : [];
    if (admins.indexOf(user.uid) >= 0) return values;
    const classKey = AccountClassRank.classKey(cls);
    const root = AccountClassRank.ROOT + "/" + gameKey + "/";
    values[root + classKey + "/" + user.uid] = { n: String(user.name || "학생").slice(0, AccountClassRank.NAME_MAX) || "학생", g: fields.g, w: fields.w, x: AccountNumbers.count(fields.x) };
    if (classKey !== AccountClassRank.NONE) values[root + AccountClassRank.NONE + "/" + user.uid] = null;
    return values;
  }
}

abstract class AccountGameProfile<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry, C> {
  abstract readonly gameKey: string;

  get statsPath(): string {
    return "stats/" + this.gameKey;
  }

  get recentPath(): string {
    return "recent/" + this.gameKey;
  }

  get pendingPath(): string {
    return "pending/" + this.gameKey;
  }

  abstract matchIdOf(report: R): string;
  abstract planOf(report: R, context: C): P;
  abstract encodeRecent(report: R, key: string, win: boolean): object;
  abstract decodeRecent(raw: unknown): E | null;
  abstract normalizeStats(raw: unknown): N;
  abstract applyStats(raw: unknown, report: R, plan: P, key: string, at: number): AccountStatsChangeBase<N> | null;

  /* 교사 화면 반별 순위에 보일 판·승·게임별 숫자 하나(x). 자식이 정하지 않으면 순위 요약을 쓰지 않는다 */
  rankFields(node: N): AccountRankFields | null {
    return null;
  }

  extraReadPath(): string | null {
    return AccountClassRank.CLASS_PATH;
  }

  extraPatch(user: PortalUser, extraRaw: unknown, node: N): Record<string, unknown> {
    const fields = this.rankFields(node);
    return fields ? AccountClassRank.patch(this.gameKey, user, extraRaw, fields) : {};
  }

  /* 미리 적어 둔 패배를 나중에 정산할 때 쓰는 기록 맥락. 나간 판이라 맥락이 결과를 바꾸지 않는 게임은 null 로 충분하다 */
  abandonedContext(): C {
    return null as C;
  }
}

interface AccountPendingRecord {
  id: string;
  rep: string;
}

/* 랜덤 매칭 판을 시작할 때 "이 판을 나가면 남을 패배 보고"를 users/<uid>/pending/<게임키> 에 미리 적어 둔다(2026-10-27 선생님 요청).
   판이 정상으로 끝나면 진짜 결과를 기록하는 같은 PATCH 에서 지우고, ← 목록으로·탭 닫기·기기 꺼짐처럼 결과를 못 남기고 사라지면
   다음에 그 게임을 기록할 때(다음 판 시작·끝, 랜덤 매칭 대기실 입장) 그 보고를 패배로 정산한다.
   통계 칸에 바로 패배를 더했다가 고치는 대신 이렇게 하는 까닭: 규칙이 판 수·승·패를 줄이는 쓰기를 막아(점수 조작 방지) 패배를 승리로 바꿀 수 없다.
   보고는 JSON 글자 하나로 저장한다 — 빈 배열·null 이 데이터베이스에서 사라져 모양이 바뀌지 않게. */
class AccountPendingCodec {
  static readonly REPORT_MAX = 6000;

  static encode(key: string, report: unknown): AccountPendingRecord | null {
    const rep = JSON.stringify(report);
    return rep && rep.length <= AccountPendingCodec.REPORT_MAX ? { id: key, rep } : null;
  }

  static decode<R>(raw: unknown): { id: string; report: R | null } | null {
    const stored = raw as Partial<AccountPendingRecord> | null;
    if (!stored || typeof stored !== "object" || typeof stored.id !== "string" || !stored.id) return null;
    try {
      return { id: stored.id, report: typeof stored.rep === "string" ? (JSON.parse(stored.rep) as R) : null };
    } catch (error) {
      return { id: stored.id, report: null };
    }
  }
}

class AccountMatchStore<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry, C> {
  constructor(
    private readonly database: AccountDatabaseLike,
    private readonly user: PortalUser,
    private readonly profile: AccountGameProfile<R, P, N, E, C>
  ) {}

  static forProfile<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry, C>(profile: AccountGameProfile<R, P, N, E, C>): AccountMatchStore<R, P, N, E, C> | null {
    const user = window.PORTAL_USER;
    if (!user || typeof AccountDatabase !== "function") return null;
    return new AccountMatchStore<R, P, N, E, C>(new AccountDatabase(user), user, profile);
  }

  loadStats(): Promise<N | null> {
    return this.database.read<unknown>(this.profile.statsPath).then((raw) => (raw ? this.profile.normalizeStats(raw) : null));
  }

  loadRecent(): Promise<E[]> {
    return this.database.read<unknown>(this.profile.recentPath).then((raw) => RecentMatchRing.decodeAll(raw, (item) => this.profile.decodeRecent(item)));
  }

  keyOf(report: R): string {
    return AccountMatchKey.of(this.profile.matchIdOf(report));
  }

  async record(report: R, context: C): Promise<string> {
    const key = this.keyOf(report);
    const pending = await this.settleOtherThan(key);
    return this.write(report, context, !!pending && pending.id === key);
  }

  async arm(report: R): Promise<string> {
    const key = this.keyOf(report);
    const pending = await this.settleOtherThan(key);
    if (pending && pending.id === key) return "armed";
    const stored = AccountPendingCodec.encode(key, report);
    if (!stored) return "skip";
    await this.database.updateRoot({ [this.pendingAddress()]: stored });
    return "armed";
  }

  async disarm(key: string): Promise<void> {
    const pending = await this.readPending();
    if (pending && pending.id === key) await this.database.updateRoot({ [this.pendingAddress()]: null });
  }

  async settlePending(): Promise<void> {
    await this.settleOtherThan("");
  }

  private readPending(): Promise<{ id: string; report: R | null } | null> {
    return this.database.read<unknown>(this.profile.pendingPath).then((raw) => AccountPendingCodec.decode<R>(raw));
  }

  private pendingAddress(): string {
    return "users/" + this.user.uid + "/" + this.profile.pendingPath;
  }

  /* 다른 판의 패배 보고가 남아 있으면 먼저 패배로 기록하고 지운다. 지금 판의 보고면 그대로 돌려준다 */
  private async settleOtherThan(key: string): Promise<{ id: string; report: R | null } | null> {
    const pending = await this.readPending();
    if (!pending || pending.id === key) return pending;
    if (pending.report) await this.write(pending.report, this.profile.abandonedContext(), true);
    else await this.database.updateRoot({ [this.pendingAddress()]: null });
    return null;
  }

  private async write(report: R, context: C, clearPending: boolean): Promise<string> {
    const profile = this.profile;
    const plan = profile.planOf(report, context);
    const values: Record<string, unknown> = {};
    if (clearPending) values[this.pendingAddress()] = null;
    const finish = async (result: string) => {
      if (Object.keys(values).length) await this.database.updateRoot(values);
      return result;
    };
    if (!plan.recordsRecent) return finish("skip");
    const key = AccountMatchKey.of(profile.matchIdOf(report));
    const extraPath = profile.extraReadPath();
    const [statsRaw, recentRaw, extraRaw] = await Promise.all([
      plan.countsStats ? this.database.read<unknown>(profile.statsPath) : Promise.resolve(null),
      this.database.read<unknown>(profile.recentPath),
      plan.countsStats && extraPath ? this.database.read<unknown>(extraPath) : Promise.resolve(null)
    ]);
    const slot = RecentMatchRing.chooseSlot(recentRaw, key);
    if (slot < 0) return finish("duplicate");
    const userRoot = "users/" + this.user.uid + "/";
    const recent: Record<string, unknown> = {};
    recent[userRoot + profile.recentPath + "/" + slot] = profile.encodeRecent(report, key, plan.win);
    if (plan.countsStats) {
      const change = profile.applyStats(statsRaw, report, plan, key, Date.now());
      if (!change) return finish("duplicate");
      const statsRoot = userRoot + profile.statsPath + "/";
      Object.keys(change.patch).forEach((path) => { recent[statsRoot + path] = change.patch[path]; });
      Object.assign(recent, profile.extraPatch(this.user, extraRaw, change.node));
    }
    Object.assign(values, recent);
    return finish(plan.countsStats ? "stats" : "recent");
  }
}

/* 한 게임 화면이 쓰는 계정 기록 창구. 미리 적기·지우기·진짜 기록을 차례대로 보내(앞 요청이 끝난 뒤 다음 요청)
   "진짜 결과를 쓴 뒤에 늦게 도착한 미리 적기"가 남아 거짓 패배가 되는 일을 막고, 같은 판을 두 번 보내지 않는다 */
class AccountMatchSender<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry, C> {
  private sentKey = "";
  private armedKey = "";
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly storeOf: () => AccountMatchStore<R, P, N, E, C> | null) {}

  record(report: R, context: C): void {
    const store = this.storeOf();
    if (!store) return;
    const key = store.keyOf(report);
    if (key === this.sentKey) return;
    this.sentKey = key;
    this.armedKey = "";
    this.enqueue(() => store.record(report, context));
  }

  arm(report: R): void {
    const store = this.storeOf();
    if (!store) return;
    const key = store.keyOf(report);
    if (key === this.sentKey || key === this.armedKey) return;
    this.armedKey = key;
    this.enqueue(() => store.arm(report));
  }

  disarm(matchId: string): void {
    const store = this.storeOf();
    const key = AccountMatchKey.of(matchId);
    if (!store || key !== this.armedKey) return;
    this.armedKey = "";
    this.enqueue(() => store.disarm(key));
  }

  settle(): void {
    const store = this.storeOf();
    if (store) this.enqueue(() => store.settlePending());
  }

  private enqueue(task: () => Promise<unknown>): void {
    this.queue = this.queue.then(task).catch(() => undefined);
  }
}

/* 랜덤 매칭 판의 패배 보고를 만들 줄 아는 게임 쪽 연결. buildForfeit 가 null 이면 아직 경기 전이라 다음 기회에 다시 시도한다 */
class AccountPendingGuard<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry, C> implements MkMatchGuard {
  constructor(
    private readonly sender: AccountMatchSender<R, P, N, E, C>,
    private readonly buildForfeit: (ticket: MkTicket) => R | null
  ) {}

  arm(ticket: MkTicket): boolean {
    const report = this.buildForfeit(ticket);
    if (!report) return false;
    this.sender.arm(report);
    return true;
  }

  disarm(ticket: MkTicket): void {
    this.sender.disarm(ticket.matchId);
  }

  settle(): void {
    this.sender.settle();
  }
}

class AccountHtml {
  static esc(value: unknown): string {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[ch]);
  }

  static percent(part: number, whole: number): string {
    const ratio = AccountRates.ratio(part, whole);
    return ratio == null ? "—" : (ratio * 100).toFixed(1) + "%";
  }

  static average(sum: number, count: number, digits: number): string {
    return count > 0 ? (sum / count).toFixed(digits) : "—";
  }

  static record(games: number, wins: number, losses: number): string {
    return '<div class="asd-record"><b>' + wins + '</b>승 <b>' + losses + '</b>패<small> · ' + games + '판 · 승률 ' + AccountHtml.percent(wins, games) + "</small></div>";
  }

  static grid(cells: Array<[string, string]>): string {
    return '<div class="asd-grid">' + cells.map((cell) => "<div><small>" + AccountHtml.esc(cell[0]) + "</small><b>" + cell[1] + "</b></div>").join("") + "</div>";
  }

  static table(head: string[], rows: string[][]): string {
    return '<table class="asd-table"><thead><tr>' + head.map((cell) => "<th>" + cell + "</th>").join("") + "</tr></thead><tbody>"
      + rows.map((row) => "<tr>" + row.map((cell) => "<td>" + cell + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  }

  static minutes(seconds: number): string {
    const whole = Math.max(0, Math.round(seconds));
    const rest = whole % 60;
    return Math.floor(whole / 60) + ":" + (rest < 10 ? "0" : "") + rest;
  }

  static clock(ms: number): string {
    const whole = Math.max(0, Math.round(ms));
    const minutes = Math.floor(whole / 60000);
    const seconds = Math.floor(whole % 60000 / 1000);
    const hundredths = Math.floor(whole % 1000 / 10);
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds + "." + (hundredths < 10 ? "0" : "") + hundredths;
  }
}

interface AccountStatsReader<N, E> {
  loadStats(): Promise<N | null>;
  loadRecent(): Promise<E[]>;
}

interface AccountDialogView<N, E extends AccountRecentHeadEntry> {
  readonly title: string;
  readonly emptyRecent: string;
  statsHtml(node: N | null): string;
  blockBodyHtml(entry: E): string;
  resultTitle(entry: E): string;
  resultHtml(entry: E): string;
}

/* 모든 게임의 통계 입구는 버튼 하나다(2026-10-28 선생님 요청, 24번 터보 랩 모양이 기준).
   시작 화면 실행 버튼 아래에 <button class="st-btn" data-account-open="stats">📊 내 통계 · 최근 20매치</button> 를 두면
   그 게임의 AccountStatsDialog 가 열고, 창 안 탭으로 내 통계 ↔ 최근 20매치를 오간다. 한 버튼은 한 창에만 묶인다 */
class AccountStatsDialog<N, E extends AccountRecentHeadEntry> {
  private static readonly BOUND_ATTR = "data-account-bound";
  private static readonly STYLE_ID = "asdStyle";
  private static readonly STYLE = [
    ".asd-back{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(0,0,0,.62);}",
    ".asd-back[hidden]{display:none;}",
    ".asd-box{width:100%;max-width:580px;max-height:90vh;overflow:auto;padding:16px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(var(--asd-bg),.97);color:#EEF2EE;font-family:var(--sg-font,'Nanum Gothic','Malgun Gothic',sans-serif);line-height:1.5;box-sizing:border-box;}",
    ".asd-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;}",
    ".asd-head h2{flex:1;margin:0;font-size:20px;font-weight:800;color:#F4F1E8;}",
    ".asd-box button{font:inherit;color:inherit;cursor:pointer;}",
    ".asd-x,.asd-back-btn{min-height:40px;padding:4px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);font-weight:800;}",
    ".asd-tabs{display:flex;gap:6px;margin-bottom:10px;}",
    ".asd-tabs button{flex:1;min-height:44px;border-radius:6px;border:2px solid rgba(255,255,255,.25);background:rgba(255,255,255,.05);font-size:16px;font-weight:800;}",
    ".asd-tabs button.on{background:var(--asd-accent,#D97B4F);border-color:var(--asd-accent,#D97B4F);color:#fff;}",
    ".asd-msg{min-height:22px;margin:0 0 8px;font-size:14px;color:#CFD8D0;}",
    ".asd-record{font-size:20px;margin:4px 0 10px;}",
    ".asd-record b{font-size:40px;color:#F4F1E8;}.asd-record small{font-size:14px;color:#A3B0A6;}",
    ".asd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin:0 0 10px;}",
    ".asd-grid div{padding:8px 10px;border-radius:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);}",
    ".asd-grid small{display:block;font-size:12px;color:#A3B0A6;}.asd-grid b{font-size:19px;color:#F4F1E8;}",
    ".asd-table{width:100%;border-collapse:collapse;font-size:14px;margin:0 0 10px;}",
    ".asd-table th,.asd-table td{padding:6px 8px;text-align:left;border-bottom:1px solid rgba(255,255,255,.12);}",
    ".asd-table th{font-size:12px;color:#A3B0A6;font-weight:700;}",
    ".asd-sec{margin:12px 0 6px;font-size:15px;font-weight:800;color:#CFD8D0;}",
    ".asd-list{display:flex;flex-direction:column;gap:8px;}",
    ".asd-item{display:block;width:100%;text-align:left;padding:10px 12px;border-radius:8px;border:2px solid;color:#fff;}",
    ".asd-item.win{background:rgba(52,110,200,.34);border-color:#5C93E8;}",
    ".asd-item.lose{background:rgba(200,70,60,.32);border-color:#E8756A;}",
    ".asd-item .asd-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:17px;}",
    ".asd-item .asd-top small{font-size:12px;color:rgba(255,255,255,.75);font-weight:400;}",
    ".asd-item .asd-body{display:block;margin-top:2px;font-size:14px;color:rgba(255,255,255,.92);}",
    ".asd-result-mine td{background:rgba(255,255,255,.1);font-weight:800;}"
  ].join("\n");

  private back: HTMLElement | null = null;
  private tab: "stats" | "recent" = "stats";
  private seq = 0;
  private entries: E[] = [];

  private heading = "";

  // requireLogin 이 false 면(교사 화면) 로그인 확인 없이 읽는 쪽(reader)에 맡긴다
  constructor(private readonly open_: () => AccountStatsReader<N, E> | null, private readonly view: AccountDialogView<N, E>, private readonly requireLogin: boolean = true) {}

  setHeading(text: string): void {
    this.heading = text;
  }

  private titleText(): string {
    return this.heading || this.titleText();
  }

  bindButtons(root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>("[data-account-open]").forEach((button) => {
      if (button.hasAttribute(AccountStatsDialog.BOUND_ATTR)) return;
      button.setAttribute(AccountStatsDialog.BOUND_ATTR, "");
      button.addEventListener("click", () => this.open(button.getAttribute("data-account-open") === "recent" ? "recent" : "stats"));
    });
  }

  open(tab: "stats" | "recent"): void {
    this.tab = tab;
    this.ensureDom().hidden = false;
    this.load();
  }

  close(): void {
    if (this.back) this.back.hidden = true;
  }

  private ensureDom(): HTMLElement {
    if (this.back) return this.back;
    if (!document.getElementById(AccountStatsDialog.STYLE_ID)) {
      const style = document.createElement("style");
      style.id = AccountStatsDialog.STYLE_ID;
      style.textContent = AccountStatsDialog.STYLE;
      document.head.appendChild(style);
    }
    const screen = document.querySelector(".st-screen");
    const computed = screen ? getComputedStyle(screen) : null;
    const back = document.createElement("div");
    back.className = "asd-back";
    back.hidden = true;
    back.style.setProperty("--asd-bg", (computed && computed.getPropertyValue("--st-bg").trim()) || "14,20,17");
    back.style.setProperty("--asd-accent", (computed && computed.getPropertyValue("--st-accent").trim()) || "#D97B4F");
    back.innerHTML = '<div class="asd-box" role="dialog" aria-modal="true"><div class="asd-head"><h2></h2><button type="button" class="asd-x">닫기</button></div>'
      + '<div class="asd-tabs"><button type="button" data-tab="stats">내 통계</button><button type="button" data-tab="recent">최근 20매치</button></div>'
      + '<p class="asd-msg"></p><div class="asd-body"></div></div>';
    (back.querySelector("h2") as HTMLElement).textContent = this.titleText();
    back.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target === back || target.closest(".asd-x")) { this.close(); return; }
      const tabButton = target.closest("[data-tab]");
      if (tabButton) { this.tab = tabButton.getAttribute("data-tab") === "recent" ? "recent" : "stats"; this.load(); return; }
      const item = target.closest("[data-recent]");
      if (item) { this.showResult(Number(item.getAttribute("data-recent"))); return; }
      if (target.closest(".asd-back-btn")) this.renderRecent();
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !back.hidden) this.close(); });
    document.body.appendChild(back);
    this.back = back;
    return back;
  }

  private part(selector: string): HTMLElement {
    return (this.back as HTMLElement).querySelector(selector) as HTMLElement;
  }

  private load(): void {
    const seq = ++this.seq;
    this.part(".asd-tabs").style.display = "";
    this.part("h2").textContent = this.titleText();
    this.part(".asd-body").innerHTML = "";
    this.part("[data-tab=stats]").classList.toggle("on", this.tab === "stats");
    this.part("[data-tab=recent]").classList.toggle("on", this.tab === "recent");
    const stats = this.tab === "stats";
    if (this.requireLogin && !window.PORTAL_USER) { this.setMessage(stats ? AccountLoginNotice.STATS_LOGIN_NEEDED : AccountLoginNotice.RECENT_LOGIN_NEEDED); return; }
    const reader = this.open_();
    if (!reader) { this.setMessage(AccountLoginNotice.NOT_READY); return; }
    this.setMessage(AccountLoginNotice.LOADING);
    if (stats) {
      reader.loadStats().then((node) => { if (seq === this.seq) { this.setMessage(""); this.part(".asd-body").innerHTML = this.view.statsHtml(node); } })
        .catch(() => { if (seq === this.seq) this.setMessage(AccountLoginNotice.STATS_FAILED); });
    } else {
      reader.loadRecent().then((list) => { if (seq === this.seq) { this.entries = list; this.renderRecent(); } })
        .catch(() => { if (seq === this.seq) this.setMessage(AccountLoginNotice.RECENT_FAILED); });
    }
  }

  private setMessage(text: string): void {
    this.part(".asd-msg").textContent = text;
  }

  private renderRecent(): void {
    this.part(".asd-tabs").style.display = "";
    this.part("h2").textContent = this.titleText();
    this.setMessage(this.entries.length ? "최근 " + this.entries.length + "경기 · 최신순 · 누르면 그 경기 결과가 열려요" : this.view.emptyRecent);
    const list = RecentBlockList.html(this.entries, (entry) => '<span class="asd-body">' + this.view.blockBodyHtml(entry) + "</span>")
      .replace(/class="rmItem (win|lose)"/g, 'class="asd-item $1"')
      .replace(/<span class="rmHead">/g, '<span class="asd-top">');
    this.part(".asd-body").innerHTML = '<div class="asd-list">' + list + "</div>";
  }

  private showResult(index: number): void {
    const entry = this.entries[index];
    if (!entry) return;
    this.part(".asd-tabs").style.display = "none";
    this.part("h2").textContent = this.view.resultTitle(entry);
    this.setMessage((entry.win ? "내 결과: 승리" : "내 결과: 패배") + " · " + RecentBlockList.whenText(entry.at));
    this.part(".asd-body").innerHTML = this.view.resultHtml(entry) + '<button type="button" class="asd-back-btn">← 최근 매치 목록</button>';
  }
}
/* ---------------------------------------------------------------------
   랜덤 매칭 승패만 남기는 게임(32 미니게임 모음 · 34 배구 · 35 축구, 2026-10-27 선생님 요청)
   게임별 통계 화면이 없는 게임도 팀 대기실의 "📊 내 통계"·교사 화면 반별 순위가 보이도록, 랜덤 매칭 판의 승패를 같은 구조로 남긴다.
     users/<uid>/stats/<게임키>   { g, w, l, t 3위 안 횟수(순위전만), ids }
     users/<uid>/recent/<게임키>/<0~19>  { v, id, at, r, ai, rk 순위(0 = 순위 없음), of 몇 명/팀 중, mp 맵, rv [상대 이름] }
   비긴 판은 남기지 않는다. 상대가 모두 AI(사람이 안 들어옴)면 최근 매치만 남기고 누적·순위에는 넣지 않는다.
   --------------------------------------------------------------------- */

interface RandomMatchReport {
  matchId: string;
  result: string;
  rank: number;
  of: number;
  map: string;
  rivals: string[];
}

interface RandomMatchStatsNode {
  g: number; w: number; l: number; t: number;
  ids: Record<string, number>;
}

interface RandomMatchEntry extends AccountRecentHeadEntry {
  withAi: boolean;
  rank: number;
  of: number;
  map: string;
  rivals: string[];
}

class RandomMatchPlan implements AccountMatchPlanBase {
  readonly recordsRecent: boolean;
  readonly countsStats: boolean;
  readonly win: boolean;

  constructor(report: RandomMatchReport) {
    this.recordsRecent = report.result === "win" || report.result === "lose";
    this.countsStats = this.recordsRecent && report.rivals.length > 0;
    this.win = report.result === "win";
  }
}

class RandomMatchCodec {
  static readonly VERSION = 1;
  static readonly NAME_MAX = 20;
  static readonly RIVALS_MAX = 10;
  static readonly NUMBER_MAX = 99;

  static fromOutcome(ticket: MkTicket, outcome: MkOutcome): RandomMatchReport {
    return {
      matchId: ticket.matchId, result: outcome.result, rank: AccountNumbers.count(outcome.rank), of: AccountNumbers.count(outcome.of),
      map: String(ticket.map || ""), rivals: (outcome.rivals || ticket.rivals || []).map((name) => String(name))
    };
  }

  static encode(report: RandomMatchReport, key: string, win: boolean): object {
    return Object.assign(AccountRecentHeadCodec.encode(RandomMatchCodec.VERSION, key, win), {
      ai: report.rivals.length ? 0 : 1, rk: Math.min(RandomMatchCodec.NUMBER_MAX, report.rank), of: Math.min(RandomMatchCodec.NUMBER_MAX, report.of),
      mp: report.map.slice(0, RandomMatchCodec.NAME_MAX),
      rv: report.rivals.slice(0, RandomMatchCodec.RIVALS_MAX).map((name) => name.slice(0, RandomMatchCodec.NAME_MAX) || "학생")
    });
  }

  static decode(raw: unknown): RandomMatchEntry | null {
    const head = AccountRecentHeadCodec.decode(raw, RandomMatchCodec.VERSION);
    if (!head) return null;
    const stored = raw as { ai: number; rk: unknown; of: unknown; mp: unknown; rv: unknown };
    return {
      id: head.id, at: head.at, win: head.win, withAi: stored.ai === 1, rank: AccountNumbers.count(stored.rk), of: AccountNumbers.count(stored.of),
      map: typeof stored.mp === "string" ? stored.mp : "", rivals: AccountShape.list(stored.rv).map((name) => String(name))
    };
  }
}

class RandomMatchMath {
  static readonly TOP = 3;

  static empty(): RandomMatchStatsNode {
    return { g: 0, w: 0, l: 0, t: 0, ids: {} };
  }

  static normalize(raw: unknown): RandomMatchStatsNode {
    const node = RandomMatchMath.empty();
    if (!raw || typeof raw !== "object") return node;
    const source = raw as Record<string, unknown>;
    (["g", "w", "l", "t"] as const).forEach((key) => { node[key] = AccountNumbers.count(source[key]); });
    const ids = AccountShape.slots(source.ids);
    Object.keys(ids).forEach((key) => { node.ids[key] = Number(ids[key]) || 0; });
    return node;
  }

  static apply(raw: unknown, report: RandomMatchReport, win: boolean, key: string, at: number): { node: RandomMatchStatsNode; evicted: string[] } | null {
    const before = RandomMatchMath.normalize(raw);
    if (before.ids[key] != null) return null;
    const top = report.rank > 0 && report.rank <= RandomMatchMath.TOP;
    const node: RandomMatchStatsNode = {
      g: before.g + 1, w: before.w + (win ? 1 : 0), l: before.l + (win ? 0 : 1), t: before.t + (top ? 1 : 0), ids: Object.assign({}, before.ids)
    };
    node.ids[key] = at;
    const evicted = AccountKeyLedger.overflowKeys(node.ids);
    evicted.forEach((id) => { delete node.ids[id]; });
    return { node, evicted };
  }
}

class RandomMatchProfile extends AccountGameProfile<RandomMatchReport, RandomMatchPlan, RandomMatchStatsNode, RandomMatchEntry, null> {
  constructor(readonly gameKey: string) {
    super();
  }

  matchIdOf(report: RandomMatchReport): string { return report.matchId; }
  planOf(report: RandomMatchReport): RandomMatchPlan { return new RandomMatchPlan(report); }
  encodeRecent(report: RandomMatchReport, key: string, win: boolean): object { return RandomMatchCodec.encode(report, key, win); }
  decodeRecent(raw: unknown): RandomMatchEntry | null { return RandomMatchCodec.decode(raw); }
  normalizeStats(raw: unknown): RandomMatchStatsNode { return RandomMatchMath.normalize(raw); }

  applyStats(raw: unknown, report: RandomMatchReport, plan: RandomMatchPlan, key: string, at: number): AccountStatsChangeBase<RandomMatchStatsNode> | null {
    const change = RandomMatchMath.apply(raw, report, plan.win, key, at);
    if (!change) return null;
    const patch: Record<string, unknown> = { g: change.node.g, w: change.node.w, l: change.node.l, t: change.node.t };
    patch["ids/" + key] = at;
    change.evicted.forEach((id) => { patch["ids/" + id] = null; });
    return { node: change.node, patch };
  }

  rankFields(node: RandomMatchStatsNode): AccountRankFields {
    return { g: node.g, w: node.w, x: node.t };
  }
}

class RandomMatchView implements AccountDialogView<RandomMatchStatsNode, RandomMatchEntry> {
  readonly emptyRecent = "아직 랜덤 매칭 기록이 없어요. 랜덤 매칭으로 경기를 끝내면 여기에 남아요.";

  constructor(readonly title: string, private readonly ranked: boolean) {}

  statsHtml(node: RandomMatchStatsNode | null): string {
    if (!node || !node.g) return '<p class="asd-msg">아직 기록이 없어요. 사람과 함께한 랜덤 매칭 경기가 끝나면 쌓여요.</p>';
    const cells: Array<[string, string]> = [["판 수", String(node.g)], ["승률", AccountHtml.percent(node.w, node.g)]];
    if (this.ranked) cells.push(["3위 안", node.t + "번"]);
    return AccountHtml.record(node.g, node.w, node.l) + AccountHtml.grid(cells)
      + '<p class="asd-msg">랜덤 매칭 경기만 셉니다. 경기 중에 나가면 패배, 상대가 나가서 이긴 판은 승리예요. 상대가 모두 AI였던 판은 최근 매치에만 남아요.</p>';
  }

  blockBodyHtml(entry: RandomMatchEntry): string {
    return AccountHtml.esc(this.parts(entry).join(" · "));
  }

  resultTitle(entry: RandomMatchEntry): string {
    return entry.win ? "승리" : "패배";
  }

  resultHtml(entry: RandomMatchEntry): string {
    const cells: Array<[string, string]> = [["상대", AccountHtml.esc(entry.rivals.length ? entry.rivals.join(", ") : "AI")]];
    if (entry.rank) cells.push(["순위", entry.rank + "위" + (entry.of ? " / " + entry.of : "")]);
    if (entry.map) cells.push(["맵", AccountHtml.esc(entry.map)]);
    return AccountHtml.grid(cells) + (entry.withAi ? '<p class="asd-msg">AI와 한 경기라 내 통계에는 들어가지 않아요.</p>' : "");
  }

  private parts(entry: RandomMatchEntry): string[] {
    const parts = [entry.rivals.length ? "vs " + entry.rivals.join(", ") : "vs AI"];
    if (entry.rank) parts.push(entry.rank + "위" + (entry.of ? "/" + entry.of : ""));
    if (entry.map) parts.push(entry.map);
    return parts;
  }
}

/* 교사 화면(admin.html 반 별 통계에서 학생 이름 누르기, 2026-10-28 선생님 요청)이 그 학생의 통계를 학생 화면과 같은 해석으로 읽는다.
   readPath 는 교사 화면이 넘기는 읽기 함수(교사 인증 토큰으로 경로 → JSON). 저장은 하지 않는다 */
class AccountTeacherReader<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry, C> implements AccountStatsReader<N, E> {
  constructor(private readonly readPath: (path: string) => Promise<unknown>, private readonly uid: string, private readonly profile: AccountGameProfile<R, P, N, E, C>) {}

  private path(part: string): string {
    return "users/" + this.uid + "/" + part;
  }

  loadStats(): Promise<N | null> {
    return this.readPath(this.path(this.profile.statsPath)).then((raw) => (raw ? this.profile.normalizeStats(raw) : null));
  }

  loadRecent(): Promise<E[]> {
    return this.readPath(this.path(this.profile.recentPath)).then((raw) => RecentMatchRing.decodeAll(raw, (item) => this.profile.decodeRecent(item)));
  }
}

/* match-kit 의 MkStatsLink: 팀 대기실 "📊 내 통계" 버튼이 open, 판이 끝나면 MkRandomFlow 가 recordOutcome 을 부른다 */
class RandomMatchAccount implements MkStatsLink {
  private readonly profile: RandomMatchProfile;
  private readonly dialog: AccountStatsDialog<RandomMatchStatsNode, RandomMatchEntry>;
  private readonly sender: AccountMatchSender<RandomMatchReport, RandomMatchPlan, RandomMatchStatsNode, RandomMatchEntry, null>;
  readonly guard: MkMatchGuard;

  constructor(gameKey: string, title: string, ranked: boolean) {
    this.profile = new RandomMatchProfile(gameKey);
    this.dialog = new AccountStatsDialog(() => AccountMatchStore.forProfile(this.profile), new RandomMatchView(title, ranked));
    this.sender = new AccountMatchSender(() => AccountMatchStore.forProfile(this.profile));
    this.guard = new AccountPendingGuard(this.sender, (ticket) => RandomMatchCodec.fromOutcome(ticket, { result: "lose" }));
    this.dialog.bindButtons();
  }

  open(): void {
    this.dialog.open("stats");
  }

  recordOutcome(ticket: MkTicket, outcome: MkOutcome): void {
    this.sender.record(RandomMatchCodec.fromOutcome(ticket, outcome), null);
  }
}

/* 게임별 통계 창이 이미 있는 게임(24·25·30·31·38·39)은 팀 대기실 버튼이 그 창을 열고, 미리 적는 패배는 게임이 넘긴 guard 가 맡는다 */
class AccountStatsOpener implements MkStatsLink {
  constructor(private readonly opener: () => void, readonly guard?: MkMatchGuard) {}

  open(): void {
    this.opener();
  }
}

/* 게임별 통계 창이 있는 게임(24·25·31·38·39)의 계정 쪽 묶음: 통계 창 + 기록 창구 + 미리 적는 패배 연결.
   자식은 자기 profile·view 만 넘긴다. 30번은 맥락(MVP 판정)이 있어 AccountMatchSender 를 직접 쓴다 */
class AccountGameAccount<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry> {
  private readonly dialog: AccountStatsDialog<N, E>;
  private readonly sender: AccountMatchSender<R, P, N, E, null>;

  constructor(private readonly profile: AccountGameProfile<R, P, N, E, null>, view: AccountDialogView<N, E>) {
    this.dialog = new AccountStatsDialog<N, E>(() => AccountMatchStore.forProfile(profile), view);
    this.sender = new AccountMatchSender<R, P, N, E, null>(() => AccountMatchStore.forProfile(profile));
  }

  bind(): void {
    this.dialog.bindButtons();
  }

  openStats(): void {
    this.dialog.open("stats");
  }

  /* 화면에 승률을 보여 주거나 매칭에 쓰려고 내 누적 통계를 한 번 읽는다(로그인 전이면 null) */
  loadStats(): Promise<N | null> {
    const store = AccountMatchStore.forProfile(this.profile);
    return store ? store.loadStats() : Promise.resolve(null);
  }

  record(report: R): void {
    this.sender.record(report, null);
  }

  pendingGuard(buildForfeit: (ticket: MkTicket) => R | null): MkMatchGuard {
    return new AccountPendingGuard<R, P, N, E, null>(this.sender, buildForfeit);
  }
}

/* 랜덤 매칭 설정을 만들 때 아직 기록 쪽 객체가 없는 게임(31번 등)이 나중에 guard 를 넘기게 한다 */
class AccountLazyGuard implements MkMatchGuard {
  private target: MkMatchGuard | null = null;

  constructor(private readonly make: () => MkMatchGuard) {}

  arm(ticket: MkTicket): boolean {
    return this.guard().arm(ticket);
  }

  disarm(ticket: MkTicket): void {
    this.guard().disarm(ticket);
  }

  settle(): void {
    this.guard().settle();
  }

  private guard(): MkMatchGuard {
    if (!this.target) this.target = this.make();
    return this.target;
  }
}
