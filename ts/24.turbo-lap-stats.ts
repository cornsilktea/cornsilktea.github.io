/* =====================================================================
   24번 터보 랩 계정 통계 · 최근 10매치 (공용 뼈대 account-match-kit.ts 의 자식, 게임 키 turbolap)

   집계 규칙(2026-10-26, 선생님 요청 · 승 정의는 코드 기준으로 정함)
     - 대상: 랜덤 매칭 1대1 경기만. 방 코드로 만든 대전·타임어택은 기록하지 않는다.
     - 승: 상대보다 먼저 완주했거나 상대가 나가서 이긴 판(화면의 "승리"와 같다). 아무도 완주 못 한 무승부는 기록하지 않는다.
     - 누적 통계: 상대가 사람이었던 판만. 최근 매치: AI 와 한 판도 기록.
     - 경기 절반 뒤에 나가면 패배(누적·최근 매치), 절반 전에 나가면 기록 없음(호출하지 않는다).
     - 개인 최고 기록(PersonalBest·turbolap_best_v1)과 겹치지 않게 코스별 판 수·승·완주 횟수·완주 시간 합계만 둔다.

   저장:
     users/<uid>/stats/turbolap   { g, w, l, f 완주 수, c/<코스> = { g, w, f, tm 완주 시간 합계(ms) }, ids/<경기열쇠> }
     users/<uid>/recent/turbolap/<0~9>  { v, id, at, r, ai, co 코스 번호, me 내 줄, p [[닉네임, 쪽 0왼/1오, 기록ms(0=미완주), 진행‰, 차량, AI 0/1]] }
   ===================================================================== */

interface TurboLapRow {
  nick: string;
  side: number;
  fin: number;
  prog: number;
  car: string;
  bot: boolean;
}

interface TurboLapReport {
  matchId: string;
  course: string;
  myIndex: number;
  rows: TurboLapRow[];
  result: string;
}

interface TurboLapCourseNode {
  g: number; w: number; f: number; tm: number;
}

interface TurboLapStatsNode {
  g: number; w: number; l: number; f: number;
  c: Record<string, TurboLapCourseNode>;
  ids: Record<string, number>;
}

interface TurboLapRecentEntry extends AccountRecentHeadEntry {
  withAi: boolean;
  course: string;
  myIndex: number;
  rows: TurboLapRow[];
}

class TurboLapCourses {
  static readonly KEYS = ["seoul", "singapore", "hongkong"];
  static readonly NAMES: Record<string, string> = { seoul: "서울", singapore: "싱가포르", hongkong: "홍콩" };

  static nameOf(key: string): string {
    return TurboLapCourses.NAMES[key] || key;
  }
}

class TurboLapPlan implements AccountMatchPlanBase {
  readonly recordsRecent: boolean;
  readonly countsStats: boolean;
  readonly win: boolean;
  readonly withAi: boolean;

  constructor(report: TurboLapReport) {
    this.withAi = report.rows.some((row) => row.bot);
    this.recordsRecent = report.result !== "draw" && report.rows.length >= 2 && !!report.rows[report.myIndex] && TurboLapCourses.KEYS.indexOf(report.course) >= 0;
    this.countsStats = this.recordsRecent && !this.withAi;
    this.win = report.result === "win";
  }
}

class TurboLapCodec {
  static readonly VERSION = 1;
  static readonly NAME_MAX = 20;
  static readonly CAR_MAX = 30;

  static encode(report: TurboLapReport, key: string, win: boolean): object {
    return Object.assign(AccountRecentHeadCodec.encode(TurboLapCodec.VERSION, key, win), {
      ai: report.rows.some((row) => row.bot) ? 1 : 0,
      co: TurboLapCourses.KEYS.indexOf(report.course),
      me: report.myIndex,
      p: report.rows.map((row) => [
        String(row.nick || "").slice(0, TurboLapCodec.NAME_MAX), row.side === 1 ? 1 : 0,
        AccountNumbers.count(row.fin), Math.min(1000, Math.round(Math.max(0, row.prog) * 1000)), String(row.car || "").slice(0, TurboLapCodec.CAR_MAX), row.bot ? 1 : 0
      ])
    });
  }

  static decode(raw: unknown): TurboLapRecentEntry | null {
    const head = AccountRecentHeadCodec.decode(raw, TurboLapCodec.VERSION);
    if (!head) return null;
    const stored = raw as { ai: number; co: number; me: number; p: unknown };
    const rows: TurboLapRow[] = [];
    for (const item of AccountShape.list(stored.p)) {
      const cells = AccountShape.list(item);
      if (cells.length < 5 || typeof cells[0] !== "string") return null;
      rows.push({ nick: String(cells[0]), side: Number(cells[1]) === 1 ? 1 : 0, fin: AccountNumbers.count(cells[2]), prog: AccountNumbers.count(cells[3]) / 1000, car: String(cells[4]), bot: Number(cells[5]) === 1 });
    }
    const myIndex = AccountNumbers.count(stored.me);
    const course = TurboLapCourses.KEYS[AccountNumbers.count(stored.co)];
    if (rows.length < 2 || myIndex >= rows.length || !course) return null;
    return { id: head.id, at: head.at, win: head.win, withAi: stored.ai === 1, course, myIndex, rows };
  }
}

class TurboLapStatsMath {
  static empty(): TurboLapStatsNode {
    return { g: 0, w: 0, l: 0, f: 0, c: {}, ids: {} };
  }

  static normalize(raw: unknown): TurboLapStatsNode {
    const node = TurboLapStatsMath.empty();
    if (!raw || typeof raw !== "object") return node;
    const source = raw as Record<string, unknown>;
    (["g", "w", "l", "f"] as const).forEach((key) => { node[key] = AccountNumbers.count(source[key]); });
    const courses = AccountShape.slots(source.c);
    Object.keys(courses).forEach((key) => {
      const item = (courses[key] && typeof courses[key] === "object" ? courses[key] : {}) as Record<string, unknown>;
      node.c[key] = { g: AccountNumbers.count(item.g), w: AccountNumbers.count(item.w), f: AccountNumbers.count(item.f), tm: AccountNumbers.count(item.tm) };
    });
    const ids = AccountShape.slots(source.ids);
    Object.keys(ids).forEach((key) => { node.ids[key] = Number(ids[key]) || 0; });
    return node;
  }

  static apply(raw: unknown, report: TurboLapReport, win: boolean, key: string, at: number): { node: TurboLapStatsNode; evicted: string[] } | null {
    const before = TurboLapStatsMath.normalize(raw);
    if (before.ids[key] != null) return null;
    const me = report.rows[report.myIndex];
    const finished = me.fin > 0;
    const course = before.c[report.course] || { g: 0, w: 0, f: 0, tm: 0 };
    const node: TurboLapStatsNode = {
      g: before.g + 1, w: before.w + (win ? 1 : 0), l: before.l + (win ? 0 : 1), f: before.f + (finished ? 1 : 0),
      c: Object.assign({}, before.c), ids: Object.assign({}, before.ids)
    };
    node.c[report.course] = { g: course.g + 1, w: course.w + (win ? 1 : 0), f: course.f + (finished ? 1 : 0), tm: course.tm + (finished ? me.fin : 0) };
    node.ids[key] = at;
    const evicted = AccountKeyLedger.overflowKeys(node.ids);
    evicted.forEach((id) => { delete node.ids[id]; });
    return { node, evicted };
  }
}

class TurboLapProfile extends AccountGameProfile<TurboLapReport, TurboLapPlan, TurboLapStatsNode, TurboLapRecentEntry, null> {
  readonly gameKey = "turbolap";

  matchIdOf(report: TurboLapReport): string { return report.matchId; }
  planOf(report: TurboLapReport): TurboLapPlan { return new TurboLapPlan(report); }
  encodeRecent(report: TurboLapReport, key: string, win: boolean): object { return TurboLapCodec.encode(report, key, win); }
  decodeRecent(raw: unknown): TurboLapRecentEntry | null { return TurboLapCodec.decode(raw); }
  normalizeStats(raw: unknown): TurboLapStatsNode { return TurboLapStatsMath.normalize(raw); }

  applyStats(raw: unknown, report: TurboLapReport, plan: TurboLapPlan, key: string, at: number): AccountStatsChangeBase<TurboLapStatsNode> | null {
    const change = TurboLapStatsMath.apply(raw, report, plan.win, key, at);
    if (!change) return null;
    const node = change.node;
    const patch: Record<string, unknown> = { g: node.g, w: node.w, l: node.l, f: node.f };
    patch["c/" + report.course] = node.c[report.course];
    patch["ids/" + key] = node.ids[key];
    change.evicted.forEach((id) => { patch["ids/" + id] = null; });
    return { node, patch };
  }
}

class TurboLapStatsView implements AccountDialogView<TurboLapStatsNode, TurboLapRecentEntry> {
  readonly title = "터보 랩 랜덤 매칭";
  readonly emptyRecent = "아직 기록된 랜덤 매칭 경기가 없어요.";

  constructor(private readonly carLabel: (id: string) => string) {}

  statsHtml(node: TurboLapStatsNode | null): string {
    const stats = node || TurboLapStatsMath.empty();
    const rows = TurboLapCourses.KEYS.map((key) => {
      const c = stats.c[key] || { g: 0, w: 0, f: 0, tm: 0 };
      return [TurboLapCourses.nameOf(key), String(c.g), String(c.w), AccountHtml.percent(c.w, c.g), c.f ? AccountHtml.clock(c.tm / c.f) : "—"];
    });
    return AccountHtml.record(stats.g, stats.w, stats.l)
      + AccountHtml.grid([["완주 횟수", String(stats.f)], ["완주율", AccountHtml.percent(stats.f, stats.g)]])
      + '<div class="asd-sec">코스별</div>' + AccountHtml.table(["코스", "판", "승", "승률", "평균 완주"], rows)
      + '<div class="asd-sec">사람과 한 랜덤 매칭만 세요. 최고 기록은 시작 화면의 개인 기록을 보세요.</div>';
  }

  blockBodyHtml(entry: TurboLapRecentEntry): string {
    const me = entry.rows[entry.myIndex];
    const place = this.placeOf(entry);
    const time = me.fin ? AccountHtml.clock(me.fin) : "미완주 " + Math.round(me.prog * 100) + "%";
    const rival = entry.rows.filter((_, index) => index !== entry.myIndex).map((row) => (row.bot ? "🤖 " : "") + AccountHtml.esc(row.nick)).join(" · ");
    return AccountHtml.esc(TurboLapCourses.nameOf(entry.course)) + " · " + AccountHtml.esc(this.carLabel(me.car)) + "<br>" + place + "위/" + entry.rows.length + "명 · " + time + " · vs " + rival;
  }

  resultTitle(entry: TurboLapRecentEntry): string {
    return "🏁 " + TurboLapCourses.nameOf(entry.course) + " 경기 결과";
  }

  resultHtml(entry: TurboLapRecentEntry): string {
    const order = entry.rows.map((row, index) => ({ row, index })).sort((a, b) => TurboLapStatsView.compare(a.row, b.row));
    const rows = order.map((item, place) => {
      const row = item.row;
      const record = row.fin ? AccountHtml.clock(row.fin) : "미완주 · " + Math.round(row.prog * 100) + "%";
      const cells = [(place + 1) + "위", AccountHtml.esc(row.nick) + (item.index === entry.myIndex ? " (나)" : ""), record, AccountHtml.esc(this.carLabel(row.car))];
      return item.index === entry.myIndex ? cells.map((cell) => '<b class="asd-result-mine">' + cell + "</b>") : cells;
    });
    return AccountHtml.table(["순위", "닉네임", "기록", "차량"], rows);
  }

  private placeOf(entry: TurboLapRecentEntry): number {
    const sorted = entry.rows.map((row, index) => ({ row, index })).sort((a, b) => TurboLapStatsView.compare(a.row, b.row));
    return sorted.findIndex((item) => item.index === entry.myIndex) + 1;
  }

  private static compare(a: TurboLapRow, b: TurboLapRow): number {
    if (a.fin && b.fin) return a.fin - b.fin;
    if (a.fin) return -1;
    if (b.fin) return 1;
    return b.prog - a.prog;
  }
}

class TurboLapAccount {
  private readonly profile = new TurboLapProfile();
  private readonly dialog: AccountStatsDialog<TurboLapStatsNode, TurboLapRecentEntry>;
  private sentKey = "";

  constructor(carLabel: (id: string) => string) {
    this.dialog = new AccountStatsDialog<TurboLapStatsNode, TurboLapRecentEntry>(() => AccountMatchStore.forProfile(this.profile), new TurboLapStatsView(carLabel));
  }

  bind(): void {
    this.dialog.bindButtons();
  }

  record(report: TurboLapReport): void {
    const key = AccountMatchKey.of(report.matchId);
    const store = AccountMatchStore.forProfile(this.profile);
    if (!window.PORTAL_USER || !store || key === this.sentKey) return;
    this.sentKey = key;
    store.record(report, null).catch(() => {});
  }
}
