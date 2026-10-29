/* =====================================================================
   24번 터보 랩 계정 통계 · 최근 20매치 (공용 뼈대 account-match-kit.ts 의 자식, 게임 키 turbolap)

   집계 규칙(2026-10-26, 선생님 요청 · 승 정의는 코드 기준으로 정함)
     - 대상: 랜덤 매칭 1대1 경기만. 방 코드로 만든 대전·타임어택은 기록하지 않는다.
     - 승: 상대보다 먼저 완주했거나 상대가 나가서 이긴 판(화면의 "승리"와 같다). 아무도 완주 못 한 무승부는 기록하지 않는다.
     - 누적 통계: 상대가 사람이었던 판만. 최근 매치: AI 와 한 판도 기록.
     - 경기 절반 뒤에 나가면 패배(누적·최근 매치), 절반 전에 나가면 기록 없음(호출하지 않는다).
     - 개인 최고 기록(PersonalBest·turbolap_best_v1)과 겹치지 않게 코스별 판 수·승·완주 횟수·완주 시간 합계만 둔다.

   저장:
     users/<uid>/stats/turbolap   { g, w, l, f 완주 수, c/<코스> = { g, w, f, tm 완주 시간 합계(ms) }, ids/<경기열쇠> }
     users/<uid>/recent/turbolap/<0~19>  { v, id, at, r, ai, co 코스 번호, me 내 줄, p [[닉네임, 쪽 0왼/1오, 기록ms(0=미완주), 진행‰, 차량, AI 0/1]] }

   승률 표시·승률 구간 매칭(2026-10-27 선생님 요청)
     - 랜덤 매칭 대기실에 들어갈 때 내 누적 통계를 한 번 읽어(TurboLapRates) 대기열 항목(MkMember.rate)과 경기장 내 자리(players/<id>/rate)에 싣는다.
       판이 끝나면 다시 읽지 않고 기록한 결과를 기기 안에서 더한다(요청을 늘리지 않음).
     - 상대를 찾았을 때 대결 화면(TurboLapVersusView): 왼쪽 자리는 왼쪽, 오른쪽 자리는 오른쪽에 이름·차·전체 승률·그 코스 승률.
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

/* 차량 이름(게임 차고·결과표·교사 화면이 같이 쓰는 한 곳). 차 아이디는 모델 키 + 색 키(예: porscheblue) */
class TurboLapCarNames {
  static readonly MODELS: Record<string, string> = { porsche: "포르쉐 911 GT3", valkyrie: "애스턴마틴 발키리", chiron: "부가티 시론" };
  static readonly COLORS: Record<string, string> = { black: "검정", white: "흰색", yellow: "노랑", green: "초록", blue: "파랑", red: "빨강" };
  static readonly DEFAULT_MODEL = "porsche";
  static readonly DEFAULT_COLOR = "blue";

  static parse(id: unknown): { model: string; color: string } {
    const text = String(id || "");
    const model = Object.keys(TurboLapCarNames.MODELS).find((key) => text.startsWith(key));
    const color = model ? text.slice(model.length) : text;
    return { model: model || TurboLapCarNames.DEFAULT_MODEL, color: TurboLapCarNames.COLORS[color] ? color : TurboLapCarNames.DEFAULT_COLOR };
  }

  static label(id: unknown): string {
    const car = TurboLapCarNames.parse(id);
    return TurboLapCarNames.MODELS[car.model] + " · " + TurboLapCarNames.COLORS[car.color];
  }
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
  rankFields(node: TurboLapStatsNode): AccountRankFields { return { g: node.g, w: node.w, x: node.f }; }
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
      const record = row.fin ? TurboLapClock.text(row.fin, entry.rows.map((other) => other.fin)) : "미완주 · " + Math.round(row.prog * 100) + "%";
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

class TurboLapAccount extends AccountGameAccount<TurboLapReport, TurboLapPlan, TurboLapStatsNode, TurboLapRecentEntry> {
  constructor(carLabel: (id: string) => string) {
    super(new TurboLapProfile(), new TurboLapStatsView(carLabel));
  }
}

interface TurboLapWinPair {
  g: number;
  w: number;
}

interface TurboLapRateCard extends TurboLapWinPair {
  c: Record<string, TurboLapWinPair>;
}

class TurboLapRates {
  private node: TurboLapStatsNode | null = null;
  private loaded = false;

  constructor(private readonly account: TurboLapAccount) {}

  load(): Promise<void> {
    return this.account.loadStats().then((node) => { this.node = node; this.loaded = true; }).catch(() => undefined);
  }

  loadOnce(): Promise<void> {
    return this.loaded ? Promise.resolve() : this.load();
  }

  static cardOf(raw: unknown): TurboLapRateCard | null {
    if (!raw || typeof raw !== "object") return null;
    const source = raw as Record<string, unknown>, courses = AccountShape.slots(source.c), card: TurboLapRateCard = { g: AccountNumbers.count(source.g), w: AccountNumbers.count(source.w), c: {} };
    Object.keys(courses).forEach((key) => {
      const item = (courses[key] && typeof courses[key] === "object" ? courses[key] : {}) as Record<string, unknown>;
      card.c[key] = { g: AccountNumbers.count(item.g), w: AccountNumbers.count(item.w) };
    });
    return card;
  }

  forMatching(): MkWinRate | null {
    return this.node && this.node.g > 0 ? { g: this.node.g, w: this.node.w } : null;
  }

  forRoom(): TurboLapRateCard | null {
    if (!this.node) return null;
    const node = this.node, courses: Record<string, TurboLapWinPair> = {};
    TurboLapCourses.KEYS.forEach((key) => { if (node.c[key]) courses[key] = { g: node.c[key].g, w: node.c[key].w }; });
    return { g: node.g, w: node.w, c: courses };
  }

  note(report: TurboLapReport): void {
    const plan = new TurboLapPlan(report);
    if (!window.PORTAL_USER || !plan.countsStats) return;
    const change = TurboLapStatsMath.apply(this.node, report, plan.win, AccountMatchKey.of(report.matchId), Date.now());
    if (change) this.node = change.node;
  }
}

interface TurboLapVersusSide {
  nick: string;
  car: string;
  bot: boolean;
  me: boolean;
  rate: TurboLapRateCard | null;
}

class TurboLapVersusView {
  private shownKey = "";
  private course = "";

  constructor(private readonly root: HTMLElement, private readonly carLabel: (id: string) => string) {}

  reset(): void {
    this.shownKey = "";
    this.root.textContent = "";
  }

  render(course: string, left: TurboLapVersusSide | null, right: TurboLapVersusSide | null, rivalHint: string): void {
    const key = JSON.stringify([course, left, right, rivalHint]);
    if (key === this.shownKey) return;
    const animate = !this.shownKey;
    this.shownKey = key;
    this.course = course;
    this.root.classList.toggle("tv-enter", animate);
    this.root.innerHTML = '<div class="tv-course">🗺️ ' + AccountHtml.esc(TurboLapCourses.nameOf(course)) + "</div>"
      + '<div class="tv-arena">' + this.sideHtml("left", left, rivalHint)
      + '<div class="tv-vs"><span class="tv-spark"></span><b>VS</b></div>'
      + this.sideHtml("right", right, rivalHint) + "</div>"
      + '<div class="tv-road"><span class="tv-dash left"></span><span class="tv-dash right"></span></div>';
    if (animate) window.setTimeout(() => this.root.classList.remove("tv-enter"), 1200);
  }

  private sideHtml(side: "left" | "right", racer: TurboLapVersusSide | null, rivalHint: string): string {
    const label = side === "left" ? "왼쪽 자리" : "오른쪽 자리";
    if (!racer) {
      return '<div class="tv-side ' + side + ' waiting"><small>' + label + '</small><b>' + AccountHtml.esc(rivalHint || "상대") + '</b><span class="tv-car-name">입장하는 중…</span>'
        + '<span class="tv-rate">&nbsp;</span><span class="tv-rate">&nbsp;</span></div>';
    }
    const lines = racer.bot ? ["🤖 컴퓨터가 운전해요", "&nbsp;"] : [this.rateLine("전체 승률", racer.rate), this.rateLine(TurboLapCourses.nameOf(this.course) + " 승률", racer.rate ? racer.rate.c[this.course] || { g: 0, w: 0 } : null)];
    return '<div class="tv-side ' + side + (racer.me ? " me" : "") + '"><small>' + label + (racer.me ? " · 나" : "") + "</small>"
      + "<b>" + (racer.bot ? "🤖 " : "") + AccountHtml.esc(racer.nick) + "</b>"
      + '<span class="tv-car-name">🚗 ' + AccountHtml.esc(this.carLabel(racer.car)) + "</span>"
      + lines.map((line) => '<span class="tv-rate">' + line + "</span>").join("") + "</div>";
  }

  private rateLine(label: string, pair: TurboLapWinPair | null): string {
    if (!pair || !pair.g) return AccountHtml.esc(label) + " <em>기록 없음</em>";
    return AccountHtml.esc(label) + " <em>" + Math.round(pair.w / pair.g * 100) + "%</em> <small>" + pair.w + "승 " + (pair.g - pair.w) + "패</small>";
  }
}

interface TurboLapResultLine {
  id: string;
  nick: string;
  team: string;
  car?: string;
  fin: number;
  prog: number;
  quit?: number;
}

interface TurboLapSeenRacer {
  nick: string;
  team: string;
  car: string;
  prog: number;
}

/* 결과표 정리와 승자 판정(2026-10-29, 랜덤 매칭 승자 기록이 사라진 문제).
   상대가 경기 중에 사라졌는데 방장이 '나간 편'(quitSide)으로 판정하지 못하면 결과표에 승자 한 줄만 남았다.
   그러면 승자의 보고는 "2명 이상인 판만 기록"에 걸려 저장되지 않고 미리 적은 칸까지 지워졌다(나간 학생은 미리 적은 패배로 남음).
   경기 중에 본 선수가 결과표에 없으면 나간 줄로 붙이고, 완주한 사람이 없어도 상대 편이 모두 나갔으면 남은 편이 이긴 것으로 본다 */
class TurboLapOutcome {
  static readonly RACING_TEAMS = ["left", "right"];

  static withLeavers(rows: TurboLapResultLine[], seen: Record<string, TurboLapSeenRacer>): TurboLapResultLine[] {
    const listed: Record<string, boolean> = {};
    rows.forEach((row) => { listed[row.id] = true; });
    const leavers = Object.keys(seen).filter((id) => !listed[id] && TurboLapOutcome.RACING_TEAMS.indexOf(seen[id].team) >= 0)
      .map((id) => ({ id, nick: seen[id].nick, team: seen[id].team, car: seen[id].car, fin: 0, prog: seen[id].prog, quit: 1 }));
    return rows.concat(leavers);
  }

  static winner(rows: TurboLapResultLine[], quitWinner: TurboLapResultLine | null | undefined): TurboLapResultLine | null {
    if (quitWinner) return quitWinner;
    if (rows.length && rows[0].fin && !rows[0].quit) return rows[0];
    if (!rows.some((row) => row.quit)) return null;
    const staying = rows.filter((row) => !row.quit && TurboLapOutcome.RACING_TEAMS.indexOf(row.team) >= 0);
    return staying.length && staying.every((row) => row.team === staying[0].team) ? staying[0] : null;
  }
}

/* 결과표의 완주 시간: 보통은 0.01초까지, 0.01초까지 같은 완주 기록이 둘 이상이면 그 기록들만 0.001초까지(2026-10-29 선생님 요청).
   순위는 원래 0.001초 단위로 정해지는데 화면이 같은 시간으로 보여 왜 졌는지 알 수 없었다. 게임 결과 화면과 최근 매치 결과 창이 함께 쓴다 */
class TurboLapClock {
  static text(ms: number, allFinishes: number[]): string {
    return TurboLapClock.tied(ms, allFinishes) ? TurboLapClock.millis(ms) : AccountHtml.clock(ms);
  }

  static tied(ms: number, allFinishes: number[]): boolean {
    const shown = AccountHtml.clock(ms);
    return allFinishes.filter((other) => other > 0 && AccountHtml.clock(other) === shown).length > 1;
  }

  static millis(ms: number): string {
    const whole = Math.max(0, Math.round(ms));
    const seconds = Math.floor(whole % 60000 / 1000);
    return Math.floor(whole / 60000) + ":" + (seconds < 10 ? "0" : "") + seconds + "." + String(whole % 1000).padStart(3, "0");
  }
}
