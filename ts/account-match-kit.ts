/* =====================================================================
   계정별 통계 · 최근 10매치 공용 뼈대 (게임을 모르는 부분, 로그인한 학생만)

   게임마다 복사하지 않고 이 파일을 함께 쓴다. 게임별 모양은 AccountGameProfile 을 이어 받은
   자식 클래스(30번 TeamBattleProfile 등)가 정하고, 읽고 쓰는 일은 AccountMatchStore 한 곳이 한다.

   저장 위치(Realtime Database, 규칙은 데이터베이스규칙.json 의 users/$uid):
     users/<uid>/stats/<게임키>          누적 통계(게임별 모양, ids/<경기열쇠> 로 중복 방지)
     users/<uid>/recent/<게임키>/<0~9>   최근 매치 10칸. 칸이 10개뿐이라 규칙으로도 10판을 넘지 못한다.
   최근 매치 한 판은 공통 머리 {v, id, at(서버 시각), r(1승/0패)} + 게임별 몸통이다.

   요청 빈도: 경기 끝 쓰기 1번(읽기-수정-쓰기 + 여러 경로 PATCH 1번), 창을 열 때 읽기 1번. 그 외 요청은 만들지 않는다.
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
  static readonly SLOTS = 10;

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
      .filter((key) => /^[0-9]$/.test(key))
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

abstract class AccountGameProfile<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry, C> {
  abstract readonly gameKey: string;

  get statsPath(): string {
    return "stats/" + this.gameKey;
  }

  get recentPath(): string {
    return "recent/" + this.gameKey;
  }

  abstract matchIdOf(report: R): string;
  abstract planOf(report: R, context: C): P;
  abstract encodeRecent(report: R, key: string, win: boolean): object;
  abstract decodeRecent(raw: unknown): E | null;
  abstract normalizeStats(raw: unknown): N;
  abstract applyStats(raw: unknown, report: R, plan: P, key: string, at: number): AccountStatsChangeBase<N> | null;

  extraReadPath(): string | null {
    return null;
  }

  extraPatch(user: PortalUser, extraRaw: unknown, node: N): Record<string, unknown> {
    return {};
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

  async record(report: R, context: C): Promise<string> {
    const profile = this.profile;
    const plan = profile.planOf(report, context);
    if (!plan.recordsRecent) return "skip";
    const key = AccountMatchKey.of(profile.matchIdOf(report));
    const extraPath = profile.extraReadPath();
    const [statsRaw, recentRaw, extraRaw] = await Promise.all([
      plan.countsStats ? this.database.read<unknown>(profile.statsPath) : Promise.resolve(null),
      this.database.read<unknown>(profile.recentPath),
      plan.countsStats && extraPath ? this.database.read<unknown>(extraPath) : Promise.resolve(null)
    ]);
    const slot = RecentMatchRing.chooseSlot(recentRaw, key);
    if (slot < 0) return "duplicate";
    const userRoot = "users/" + this.user.uid + "/";
    const values: Record<string, unknown> = {};
    values[userRoot + profile.recentPath + "/" + slot] = profile.encodeRecent(report, key, plan.win);
    if (plan.countsStats) {
      const change = profile.applyStats(statsRaw, report, plan, key, Date.now());
      if (!change) return "duplicate";
      const statsRoot = userRoot + profile.statsPath + "/";
      Object.keys(change.patch).forEach((path) => { values[statsRoot + path] = change.patch[path]; });
      Object.assign(values, profile.extraPatch(this.user, extraRaw, change.node));
    }
    await this.database.updateRoot(values);
    return plan.countsStats ? "stats" : "recent";
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

class AccountStatsDialog<N, E extends AccountRecentHeadEntry> {
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

  constructor(private readonly open_: () => AccountStatsReader<N, E> | null, private readonly view: AccountDialogView<N, E>) {}

  bindButtons(root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>("[data-account-open]").forEach((button) => {
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
      + '<div class="asd-tabs"><button type="button" data-tab="stats">내 통계</button><button type="button" data-tab="recent">최근 10매치</button></div>'
      + '<p class="asd-msg"></p><div class="asd-body"></div></div>';
    (back.querySelector("h2") as HTMLElement).textContent = this.view.title;
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
    this.part("h2").textContent = this.view.title;
    this.part(".asd-body").innerHTML = "";
    this.part("[data-tab=stats]").classList.toggle("on", this.tab === "stats");
    this.part("[data-tab=recent]").classList.toggle("on", this.tab === "recent");
    const stats = this.tab === "stats";
    if (!window.PORTAL_USER) { this.setMessage(stats ? AccountLoginNotice.STATS_LOGIN_NEEDED : AccountLoginNotice.RECENT_LOGIN_NEEDED); return; }
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
    this.part("h2").textContent = this.view.title;
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