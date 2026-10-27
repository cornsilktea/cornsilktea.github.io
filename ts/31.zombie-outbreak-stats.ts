/* =====================================================================
   31번 좀비 아웃브레이크 계정 통계 · 최근 20매치 (공용 뼈대 account-match-kit.ts 의 자식, 게임 키 zombieoutbreak)

   집계 규칙(2026-10-26, 선생님 요청 · 정의는 코드 기준으로 정함)
     - 대상: 온라인 방(방 만들기·코드 입장·랜덤 매칭). 관전자는 기록하지 않는다.
     - 개인 승패: 이긴 편에 선 판. 인간이 이기면 끝까지 생존한 사람이 승, 좀비가 이기면 숙주·감염된 사람이 승(감염되면 좀비 편).
     - 인간 승률 = 인간으로 시작한 판(감염되기 전 포함) 중 인간 편이 이긴 판 ÷ 그런 판.
       좀비 승률 = 좀비 편으로 끝난 판(숙주·감염 포함) 중 좀비가 이긴 판 ÷ 그런 판.  (감염된 판은 두 쪽에 모두 셈)
     - 인간 평균 생존 시간 = 인간으로 시작한 판의 생존 초 합계 ÷ 그런 판 수(감염되면 감염된 때까지, 끝까지면 라운드 길이).
     - 감염 수: 내가 감염시킨 사람 수(room.players[].infectedBy). 누적 통계는 AI 가 없던 판만, 최근 매치는 AI 가 섞여도 기록.
     - 경기 절반 뒤에 나가면 패배, 절반 전에 나가면 기록 없음. 승패가 안 가려진 판은 없다(인간·좀비 중 한쪽이 항상 이김).

   저장:
     users/<uid>/stats/zombieoutbreak  { g, w, l, hg, hw, zg, zw, og 숙주 횟수, sv 끝까지 생존 횟수, ik 감염 합, mi 한 판 최다 감염, hs 인간 생존 초 합, ls 최장 생존 초, ids }
     users/<uid>/recent/zombieoutbreak/<0~19>  { v, id, at, r, ai, me, w 0인간/1좀비, p [[닉네임, 0숙주/1감염/2생존, 생존 초, 감염 수, 나감 0/1, AI 0/1]] }
   ===================================================================== */

interface ZombieRow {
  name: string;
  role: number;
  secs: number;
  infects: number;
  left: boolean;
  ai: boolean;
}

interface ZombieReport {
  matchId: string;
  myIndex: number;
  rows: ZombieRow[];
  winner: number;
  progress: number;
  iLeft: boolean;
}

interface ZombieStatsNode {
  g: number; w: number; l: number; hg: number; hw: number; zg: number; zw: number;
  og: number; sv: number; ik: number; mi: number; hs: number; ls: number;
  ids: Record<string, number>;
}

interface ZombieRecentEntry extends AccountRecentHeadEntry {
  withAi: boolean;
  myIndex: number;
  winner: number;
  rows: ZombieRow[];
}

class ZombieRoles {
  static readonly ORIGIN = 0;
  static readonly INFECTED = 1;
  static readonly SURVIVED = 2;
  static readonly LABELS = ["숙주 좀비", "감염", "생존"];
  static readonly SECONDS_MAX = 180;
  static readonly NUMBER_KEYS = ["g", "w", "l", "hg", "hw", "zg", "zw", "og", "sv", "ik", "mi", "hs", "ls"] as const;

  static fromResult(result: string): number {
    return result === "origin" ? ZombieRoles.ORIGIN : result === "infected" ? ZombieRoles.INFECTED : ZombieRoles.SURVIVED;
  }

  static wonBy(role: number, winner: number): boolean {
    return winner === 0 ? role === ZombieRoles.SURVIVED : winner === 1 && role !== ZombieRoles.SURVIVED;
  }
}

class ZombiePlan implements AccountMatchPlanBase {
  readonly recordsRecent: boolean;
  readonly countsStats: boolean;
  readonly win: boolean;
  readonly withAi: boolean;

  constructor(report: ZombieReport) {
    const me = report.rows[report.myIndex];
    this.withAi = report.rows.some((row) => row.ai);
    this.recordsRecent = !!me && !AccountForfeit.leftEarly(report.iLeft, report.progress) && (report.winner === 0 || report.winner === 1 || report.iLeft);
    this.countsStats = this.recordsRecent && !this.withAi;
    this.win = !!me && !report.iLeft && ZombieRoles.wonBy(me.role, report.winner);
  }
}

class ZombieCodec {
  static readonly VERSION = 1;
  static readonly NAME_MAX = 20;

  static encode(report: ZombieReport, key: string, win: boolean): object {
    return Object.assign(AccountRecentHeadCodec.encode(ZombieCodec.VERSION, key, win), {
      ai: report.rows.some((row) => row.ai) ? 1 : 0,
      me: report.myIndex,
      w: report.winner === 1 ? 1 : 0,
      p: report.rows.map((row) => [
        String(row.name || "").slice(0, ZombieCodec.NAME_MAX), Math.min(2, AccountNumbers.count(row.role)),
        Math.min(ZombieRoles.SECONDS_MAX, AccountNumbers.count(row.secs)), Math.min(9, AccountNumbers.count(row.infects)), row.left ? 1 : 0, row.ai ? 1 : 0
      ])
    });
  }

  static decode(raw: unknown): ZombieRecentEntry | null {
    const head = AccountRecentHeadCodec.decode(raw, ZombieCodec.VERSION);
    if (!head) return null;
    const stored = raw as { ai: number; me: number; w: number; p: unknown };
    const rows: ZombieRow[] = [];
    for (const item of AccountShape.list(stored.p)) {
      const cells = AccountShape.list(item);
      if (cells.length < 6 || typeof cells[0] !== "string") return null;
      rows.push({ name: String(cells[0]), role: Math.min(2, AccountNumbers.count(cells[1])), secs: AccountNumbers.count(cells[2]), infects: AccountNumbers.count(cells[3]), left: Number(cells[4]) === 1, ai: Number(cells[5]) === 1 });
    }
    const myIndex = AccountNumbers.count(stored.me);
    if (!rows.length || myIndex >= rows.length) return null;
    return { id: head.id, at: head.at, win: head.win, withAi: stored.ai === 1, myIndex, winner: stored.w === 1 ? 1 : 0, rows };
  }
}

class ZombieStatsMath {
  static empty(): ZombieStatsNode {
    return { g: 0, w: 0, l: 0, hg: 0, hw: 0, zg: 0, zw: 0, og: 0, sv: 0, ik: 0, mi: 0, hs: 0, ls: 0, ids: {} };
  }

  static normalize(raw: unknown): ZombieStatsNode {
    const node = ZombieStatsMath.empty();
    if (!raw || typeof raw !== "object") return node;
    const source = raw as Record<string, unknown>;
    ZombieRoles.NUMBER_KEYS.forEach((key) => { node[key] = AccountNumbers.count(source[key]); });
    const ids = AccountShape.slots(source.ids);
    Object.keys(ids).forEach((key) => { node.ids[key] = Number(ids[key]) || 0; });
    return node;
  }

  static apply(raw: unknown, report: ZombieReport, win: boolean, key: string, at: number): { node: ZombieStatsNode; evicted: string[] } | null {
    const before = ZombieStatsMath.normalize(raw);
    if (before.ids[key] != null) return null;
    const me = report.rows[report.myIndex];
    const startedHuman = me.role !== ZombieRoles.ORIGIN;
    const endedZombie = me.role !== ZombieRoles.SURVIVED;
    const secs = Math.min(ZombieRoles.SECONDS_MAX, AccountNumbers.count(me.secs));
    const infects = Math.min(9, AccountNumbers.count(me.infects));
    const node: ZombieStatsNode = {
      g: before.g + 1, w: before.w + (win ? 1 : 0), l: before.l + (win ? 0 : 1),
      hg: before.hg + (startedHuman ? 1 : 0), hw: before.hw + (startedHuman && report.winner === 0 ? 1 : 0),
      zg: before.zg + (endedZombie ? 1 : 0), zw: before.zw + (endedZombie && report.winner === 1 ? 1 : 0),
      og: before.og + (me.role === ZombieRoles.ORIGIN ? 1 : 0), sv: before.sv + (me.role === ZombieRoles.SURVIVED ? 1 : 0),
      ik: before.ik + infects, mi: Math.max(before.mi, infects),
      hs: before.hs + (startedHuman ? secs : 0), ls: Math.max(before.ls, startedHuman ? secs : 0),
      ids: Object.assign({}, before.ids)
    };
    node.ids[key] = at;
    const evicted = AccountKeyLedger.overflowKeys(node.ids);
    evicted.forEach((id) => { delete node.ids[id]; });
    return { node, evicted };
  }
}

class ZombieProfile extends AccountGameProfile<ZombieReport, ZombiePlan, ZombieStatsNode, ZombieRecentEntry, null> {
  readonly gameKey = "zombieoutbreak";

  matchIdOf(report: ZombieReport): string { return report.matchId; }
  rankFields(node: ZombieStatsNode): AccountRankFields { return { g: node.g, w: node.w, x: node.ik }; }
  planOf(report: ZombieReport): ZombiePlan { return new ZombiePlan(report); }
  encodeRecent(report: ZombieReport, key: string, win: boolean): object { return ZombieCodec.encode(report, key, win); }
  decodeRecent(raw: unknown): ZombieRecentEntry | null { return ZombieCodec.decode(raw); }
  normalizeStats(raw: unknown): ZombieStatsNode { return ZombieStatsMath.normalize(raw); }

  applyStats(raw: unknown, report: ZombieReport, plan: ZombiePlan, key: string, at: number): AccountStatsChangeBase<ZombieStatsNode> | null {
    const change = ZombieStatsMath.apply(raw, report, plan.win, key, at);
    if (!change) return null;
    const node = change.node;
    const patch: Record<string, unknown> = {};
    ZombieRoles.NUMBER_KEYS.forEach((name) => { patch[name] = node[name]; });
    patch["ids/" + key] = node.ids[key];
    change.evicted.forEach((id) => { patch["ids/" + id] = null; });
    return { node, patch };
  }
}

class ZombieStatsView implements AccountDialogView<ZombieStatsNode, ZombieRecentEntry> {
  readonly title = "좀비 아웃브레이크";
  readonly emptyRecent = "아직 기록된 온라인 경기가 없어요.";

  statsHtml(node: ZombieStatsNode | null): string {
    const s = node || ZombieStatsMath.empty();
    return AccountHtml.record(s.g, s.w, s.l)
      + AccountHtml.grid([
        ["인간 승률", AccountHtml.percent(s.hw, s.hg) + " (" + s.hw + "/" + s.hg + ")"],
        ["좀비 승률", AccountHtml.percent(s.zw, s.zg) + " (" + s.zw + "/" + s.zg + ")"],
        ["인간 평균 생존", s.hg ? AccountHtml.average(s.hs, s.hg, 1) + "초" : "—"],
        ["최장 생존", s.ls ? s.ls + "초" : "—"],
        ["감염시킨 수 합계", String(s.ik)],
        ["한 판 최다 감염", String(s.mi)],
        ["숙주 좀비", s.og + "번"],
        ["끝까지 생존", s.sv + "번 (" + AccountHtml.percent(s.sv, s.g) + ")"]
      ])
      + '<div class="asd-sec">AI 없이 사람끼리 한 판만 세요. 감염되면 좀비 편으로 계산해요.</div>';
  }

  blockBodyHtml(entry: ZombieRecentEntry): string {
    const me = entry.rows[entry.myIndex];
    const secs = me.role === ZombieRoles.ORIGIN ? "" : " · 생존 " + me.secs + "초";
    return ZombieRoles.LABELS[me.role] + secs + (me.infects ? " · 감염시킴 " + me.infects : "") + " · " + (entry.winner === 0 ? "인간 승리" : "좀비 승리");
  }

  resultTitle(entry: ZombieRecentEntry): string {
    return entry.winner === 0 ? "인간 승리!" : "좀비 승리!";
  }

  resultHtml(entry: ZombieRecentEntry): string {
    const order = entry.rows.map((row, index) => ({ row, index })).sort((a, b) => (b.row.secs - a.row.secs) || (a.index - b.index));
    const rows = order.map((item) => {
      const row = item.row;
      const cells = [(row.ai ? "🤖 " : "") + AccountHtml.esc(row.name) + (item.index === entry.myIndex ? " (나)" : ""), ZombieRoles.LABELS[row.role], row.role === ZombieRoles.ORIGIN ? "-" : row.secs + "초", String(row.infects)];
      return item.index === entry.myIndex ? cells.map((cell) => '<b class="asd-result-mine">' + cell + "</b>") : cells;
    });
    return AccountHtml.table(["닉네임", "결과", "생존 시간", "감염"], rows);
  }
}

class ZombieAccount {
  private readonly profile = new ZombieProfile();
  private readonly dialog = new AccountStatsDialog<ZombieStatsNode, ZombieRecentEntry>(() => AccountMatchStore.forProfile(this.profile), new ZombieStatsView());
  private sentKey = "";

  bind(): void {
    this.dialog.bindButtons();
  }

  openStats(): void {
    this.dialog.open("stats");
  }

  record(report: ZombieReport): void {
    const key = AccountMatchKey.of(report.matchId);
    const store = AccountMatchStore.forProfile(this.profile);
    if (!window.PORTAL_USER || !store || key === this.sentKey) return;
    this.sentKey = key;
    store.record(report, null).catch(() => {});
  }
}
