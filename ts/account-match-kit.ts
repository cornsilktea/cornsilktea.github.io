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
