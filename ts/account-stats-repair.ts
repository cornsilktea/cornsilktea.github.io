/* =====================================================================
   게임 계정 통계 정상화 공용 엔진(2026-11-03 선생님 요청) — 교사 제어판(admin.html) 전용

   왜: 한 판을 같이 한 학생들 중 일부만 기록이 남는 일이 있었다(판이 끝난 직후 화면이 닫히거나, 보낸 요청이 한 번 실패한 경우).
       게임 쪽은 account-match-kit.ts 의 보관 상자(AccountOutbox)와 다시 보내기로 막았고,
       이미 빠진 판은 같은 판을 한 다른 학생의 최근 20매치(users/<uid>/recent/<게임>)에 남은 결과표로 되살린다.

   하는 일(게임마다 같은 순서, 게임별로 다른 부분은 AccountRepairGame 자식 클래스가 정한다):
     1. users 전체를 한 번 읽어 모든 학생의 최근 매치를 경기 열쇠(id)로 묶는다.
     2. 그 판 결과표의 사람 줄마다 닉네임(계정 이름에서 학번을 떼고 4자, 게임과 같은 규칙)으로 학생을 찾는다.
        같은 닉네임이 여럿이면 그 판을 가진 학생들의 반과 같은 사람을 고르고, 그래도 여럿이면 건너뛴다(목록에 보임).
     3. 그 판이 최근 매치에도 통계 열쇠(ids)에도 없는 학생에게 게임과 같은 계산(profile.planOf·applyStats·encodeRecent)으로 더한다.
     4. 반 별 통계 요약(gameRanks)도 새 누적값으로 맞추고, 같은 판의 미리 적기(pending)가 남았으면 지운다.
   쓰기는 선생님 계정만 할 수 있다(데이터베이스규칙.json 의 stats·recent·pending 교사 예외 — 콘솔 게시 필요).
   여러 번 실행해도 이미 있는 판은 건너뛰므로 두 번 세지 않는다. 적용 직전에 다시 읽어 그 사이 학생이 한 판을 더 해도 덮어쓰지 않는다.
   ===================================================================== */

interface AccountRepairUserRaw {
  profile?: { name?: unknown; cls?: unknown };
  stats?: Record<string, unknown>;
  recent?: Record<string, unknown>;
  pending?: Record<string, { id?: unknown } | undefined>;
}

interface AccountRepairLine {
  name: string;
  ai: boolean;
  left: boolean;
}

interface AccountRepairAddition {
  key: string;
  at: number;
  win: boolean;
  countsStats: boolean;
  intoRecent: boolean;
  pendingSame: boolean;
}

interface AccountRepairSkip {
  name: string;
  key: string;
  reason: string;
}

interface AccountRepairIo {
  read(path: string): Promise<unknown>;
  patch(values: Record<string, unknown>): Promise<void>;
}

interface AccountRepairResult {
  gameKey: string;
  studentCount: number;
  matchCount: number;
  partialMatches: number;
  additions: Array<{ name: string; list: AccountRepairAddition[] }>;
  skips: AccountRepairSkip[];
  agedOutLines: number;
}

class AccountRepairNames {
  static readonly NICK_MAX = 4;

  /* 게임 닉네임 규칙: AccountPolicy.personName(학번 떼기) → PlayerProfile 닉네임 정리(제어 문자 빼고 4자) */
  static nickOf(accountName: string): string {
    const stripped = accountName.replace(/^\d+[\s._-]*/, "").trim() || accountName;
    return stripped.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, AccountRepairNames.NICK_MAX);
  }

  static nameOf(user: AccountRepairUserRaw): string {
    return typeof user.profile?.name === "string" ? user.profile.name : "";
  }

  static classOf(user: AccountRepairUserRaw): string {
    return AccountClassRank.classKey(user.profile?.cls);
  }
}

/* 게임마다 다른 부분: 최근 매치 한 판에서 사람 줄 목록을 꺼내고, 그 판의 다른 사람 줄을 "그 사람이 쓸 결과 보고"로 바꾼다 */
abstract class AccountRepairGame<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry> {
  constructor(readonly profile: AccountGameProfile<R, P, N, E, null>) {}

  get gameKey(): string {
    return this.profile.gameKey;
  }

  abstract linesOf(entry: E): AccountRepairLine[];
  abstract ownIndex(entry: E): number;
  /* source 는 그 판을 가진 학생 중 한 명의 최근 매치. 승패를 정할 수 없으면 null */
  abstract reportFor(source: E, index: number): R | null;

  /* 나가지 않은 사람의 기록을 먼저 믿는다(나간 사람의 결과표는 승패를 모를 수 있다) */
  isReliable(entry: E): boolean {
    const line = this.linesOf(entry)[this.ownIndex(entry)];
    return !!line && !line.left;
  }
}

class ZombieRepairGame extends AccountRepairGame<ZombieReport, ZombiePlan, ZombieStatsNode, ZombieRecentEntry> {
  constructor() { super(new ZombieProfile()); }

  linesOf(entry: ZombieRecentEntry): AccountRepairLine[] { return entry.rows.map((row) => ({ name: row.name, ai: row.ai, left: row.left })); }
  ownIndex(entry: ZombieRecentEntry): number { return entry.myIndex; }

  reportFor(source: ZombieRecentEntry, index: number): ZombieReport | null {
    return { matchId: source.id, myIndex: index, rows: source.rows, winner: source.winner, progress: 1, iLeft: !!source.rows[index] && source.rows[index].left };
  }
}

class TurboLapRepairGame extends AccountRepairGame<TurboLapReport, TurboLapPlan, TurboLapStatsNode, TurboLapRecentEntry> {
  constructor() { super(new TurboLapProfile()); }

  linesOf(entry: TurboLapRecentEntry): AccountRepairLine[] { return entry.rows.map((row) => ({ name: row.nick, ai: row.bot, left: false })); }
  ownIndex(entry: TurboLapRecentEntry): number { return entry.myIndex; }

  reportFor(source: TurboLapRecentEntry, index: number): TurboLapReport | null {
    const mine = source.rows[source.myIndex], other = source.rows[index];
    if (!mine || !other) return null;
    const sameSide = other.side === mine.side;
    return { matchId: source.id, course: source.course, myIndex: index, rows: source.rows, result: sameSide === source.win ? "win" : "lose" };
  }
}

class FpsRepairGame extends AccountRepairGame<FpsReport, FpsPlan, FpsStatsNode, FpsRecentEntry> {
  constructor() { super(new FpsProfile()); }

  linesOf(entry: FpsRecentEntry): AccountRepairLine[] { return entry.players.map((line) => ({ name: line.name, ai: line.ai, left: line.left })); }
  ownIndex(entry: FpsRecentEntry): number { return entry.myIndex; }

  reportFor(source: FpsRecentEntry, index: number): FpsReport | null {
    const mine = source.players[source.myIndex], line = source.players[index];
    if (!mine || !line || mine.left) return null;
    const winnerTeam = source.win ? mine.team : 1 - mine.team;
    return { matchId: source.id, myIndex: index, players: source.players, score: source.score, winnerTeam, progress: 1, iLeft: line.left };
  }
}

class SnowRepairGame extends AccountRepairGame<SnAccountReport, SnAccountPlan, SnAccountStatsNode, SnAccountRecentEntry> {
  constructor() { super(new SnAccountProfile()); }

  linesOf(entry: SnAccountRecentEntry): AccountRepairLine[] { return entry.players.map((line) => ({ name: line.name, ai: line.ai, left: line.left })); }
  ownIndex(entry: SnAccountRecentEntry): number { return entry.myIndex; }

  reportFor(source: SnAccountRecentEntry, index: number): SnAccountReport | null {
    const line = source.players[index];
    return line ? { matchId: source.id, mode: source.mode, myIndex: index, players: source.players, progress: 1, iLeft: line.left } : null;
  }
}

class BalloonRepairGame extends AccountRepairGame<WbAccountReport, WbAccountPlan, WbAccountStatsNode, WbAccountRecentEntry> {
  constructor() { super(new WbAccountProfile()); }

  linesOf(entry: WbAccountRecentEntry): AccountRepairLine[] { return entry.players.map((line) => ({ name: line.name, ai: line.ai, left: line.left })); }
  ownIndex(entry: WbAccountRecentEntry): number { return entry.myIndex; }

  reportFor(source: WbAccountRecentEntry, index: number): WbAccountReport | null {
    const line = source.players[index];
    return line ? { matchId: source.id, mode: source.mode, myIndex: index, players: source.players, progress: 1, iLeft: line.left } : null;
  }
}

class AccountRepairMatch<E extends AccountRecentHeadEntry> {
  readonly holders: Array<{ uid: string; entry: E }> = [];

  constructor(readonly key: string) {}

  get at(): number {
    return Math.min(...this.holders.map((holder) => holder.entry.at || 0));
  }

  heldBy(uid: string): boolean {
    return this.holders.some((holder) => holder.uid === uid);
  }
}

/* 한 학생에게 더할 판들을 차례로 계산해 PATCH 값으로 모은다(게임의 profile 이 쓰는 계산을 그대로 쓴다) */
class AccountRepairFix<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry> {
  readonly additions: AccountRepairAddition[] = [];
  private nodeRaw: unknown;
  private readonly slots: Record<string, unknown>;
  private readonly values: Record<string, unknown> = {};

  constructor(readonly uid: string, private readonly user: AccountRepairUserRaw, private readonly game: AccountRepairGame<R, P, N, E>) {
    this.nodeRaw = user.stats ? user.stats[game.gameKey] : null;
    this.slots = Object.assign({}, AccountShape.slots(user.recent ? user.recent[game.gameKey] : null));
  }

  get name(): string {
    return AccountRepairNames.nameOf(this.user) || this.uid;
  }

  has(key: string): boolean {
    const ids = (this.nodeRaw && typeof this.nodeRaw === "object" ? (this.nodeRaw as { ids?: unknown }).ids : null) as Record<string, unknown> | null;
    if (ids && ids[key] != null) return true;
    return Object.keys(this.slots).some((slot) => (this.slots[slot] as AccountRecentHead | null)?.id === key);
  }

  /* 최근 20칸이 다 찼는데 이 판이 그보다 오래됐으면 예전에 이미 세고 밀려난 판일 수 있어 넣지 않는다(두 번 세지 않게) */
  fitsRecent(at: number): boolean {
    return this.slotFor(at) !== null;
  }

  add(key: string, at: number, report: R): boolean {
    const profile = this.game.profile;
    const plan = profile.planOf(report, null as never);
    if (!plan.recordsRecent) return false;
    const root = "users/" + this.uid + "/";
    if (plan.countsStats) {
      const change = profile.applyStats(this.nodeRaw, report, plan, key, at);
      if (change) {
        this.nodeRaw = change.node;
        Object.keys(change.patch).forEach((path) => { this.values[root + profile.statsPath + "/" + path] = change.patch[path]; });
        const user = { uid: this.uid, name: this.name } as PortalUser;
        Object.assign(this.values, profile.extraPatch(user, this.user.profile?.cls, change.node));
      }
    }
    const slot = this.slotFor(at);
    if (slot !== null) {
      const stored = Object.assign(profile.encodeRecent(report, key, plan.win), { at });
      this.slots[slot] = stored;
      this.values[root + profile.recentPath + "/" + slot] = stored;
    }
    const pendingId = this.user.pending ? this.user.pending[this.game.gameKey]?.id : undefined;
    const pendingSame = pendingId === key;
    if (pendingSame) this.values[root + profile.pendingPath] = null;
    this.additions.push({ key, at, win: plan.win, countsStats: plan.countsStats, intoRecent: slot !== null, pendingSame });
    return true;
  }

  patch(): Record<string, unknown> {
    return this.values;
  }

  private slotFor(at: number): string | null {
    let oldest: string | null = null;
    let oldestAt = Infinity;
    for (let slot = 0; slot < RecentMatchRing.SLOTS; slot++) {
      const entry = this.slots[String(slot)] as AccountRecentHead | undefined;
      if (!entry) return String(slot);
      const entryAt = typeof entry.at === "number" ? entry.at : 0;
      if (entryAt < oldestAt) {
        oldestAt = entryAt;
        oldest = String(slot);
      }
    }
    return oldestAt < at ? oldest : null;
  }
}

class AccountRepairPlan<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry> {
  matchCount = 0;
  readonly fixes: Array<AccountRepairFix<R, P, N, E>> = [];
  readonly skips: AccountRepairSkip[] = [];
  agedOutLines = 0;

  get partialMatches(): number {
    const keys = new Set<string>();
    this.fixes.forEach((fix) => fix.additions.forEach((addition) => keys.add(addition.key)));
    this.skips.forEach((skip) => keys.add(skip.key));
    return keys.size;
  }

  get addedCount(): number {
    return this.fixes.reduce((sum, fix) => sum + fix.additions.length, 0);
  }

  patch(): Record<string, unknown> {
    return Object.assign({}, ...this.fixes.map((fix) => fix.patch()));
  }

  summary(gameKey: string): AccountRepairResult {
    return {
      gameKey, studentCount: this.fixes.length, matchCount: this.matchCount, partialMatches: this.partialMatches,
      additions: this.fixes.map((fix) => ({ name: fix.name, list: fix.additions })), skips: this.skips, agedOutLines: this.agedOutLines
    };
  }
}

class AccountRepairPlanner<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry> {
  constructor(private readonly game: AccountRepairGame<R, P, N, E>) {}

  plan(users: Record<string, AccountRepairUserRaw>): AccountRepairPlan<R, P, N, E> {
    const plan = new AccountRepairPlan<R, P, N, E>();
    const game = this.game;
    const byKey = this.collect(users);
    const byNick = this.nickIndex(users);
    const fixes: Record<string, AccountRepairFix<R, P, N, E>> = {};
    const matches = Object.keys(byKey).map((key) => byKey[key]).sort((a, b) => a.at - b.at);
    plan.matchCount = matches.length;
    matches.forEach((match) => {
      const source = match.holders.filter((holder) => game.isReliable(holder.entry))[0] || match.holders[0];
      const heldIndexes = match.holders.map((holder) => game.ownIndex(holder.entry));
      game.linesOf(source.entry).forEach((line, index) => {
        if (line.ai || heldIndexes.indexOf(index) >= 0) return;
        const skip = (reason: string) => plan.skips.push({ name: line.name, key: match.key, reason });
        const uids = this.findUid(line.name, match, byNick, users);
        if (!uids.length) return skip("계정을 찾지 못함(로그인하지 않았거나 닉네임이 다름)");
        if (uids.length > 1) return skip("같은 닉네임 학생이 " + uids.length + "명이라 누구인지 정할 수 없음");
        if (match.heldBy(uids[0])) return;
        const report = game.reportFor(source.entry, index);
        if (!report) return skip("이 판의 승패를 알 수 없음");
        const fix = fixes[uids[0]] = fixes[uids[0]] || new AccountRepairFix<R, P, N, E>(uids[0], users[uids[0]], game);
        if (fix.has(match.key)) return;
        if (!fix.fitsRecent(match.at)) { plan.agedOutLines++; return; }
        fix.add(match.key, match.at, report);
      });
    });
    plan.fixes.push(...Object.keys(fixes).map((uid) => fixes[uid]).filter((fix) => fix.additions.length > 0));
    return plan;
  }

  private collect(users: Record<string, AccountRepairUserRaw>): Record<string, AccountRepairMatch<E>> {
    const byKey: Record<string, AccountRepairMatch<E>> = {};
    Object.keys(users).forEach((uid) => {
      const slots = AccountShape.slots(users[uid]?.recent ? users[uid].recent![this.game.gameKey] : null);
      Object.keys(slots).forEach((slot) => {
        const entry = this.game.profile.decodeRecent(slots[slot]);
        if (!entry || !entry.id) return;
        (byKey[entry.id] = byKey[entry.id] || new AccountRepairMatch<E>(entry.id)).holders.push({ uid, entry });
      });
    });
    return byKey;
  }

  private nickIndex(users: Record<string, AccountRepairUserRaw>): Record<string, string[]> {
    const index: Record<string, string[]> = {};
    Object.keys(users).forEach((uid) => {
      const name = AccountRepairNames.nameOf(users[uid] || {});
      if (!name) return;
      const nick = AccountRepairNames.nickOf(name);
      (index[nick] = index[nick] || []).push(uid);
    });
    return index;
  }

  /* 같은 닉네임이 여럿이면 이미 그 판을 가진 학생은 빼고, 그 판 학생들의 반과 같은 사람만 남긴다 */
  private findUid(name: string, match: AccountRepairMatch<E>, byNick: Record<string, string[]>, users: Record<string, AccountRepairUserRaw>): string[] {
    const candidates = byNick[String(name || "").trim()] || [];
    if (candidates.length <= 1) return candidates;
    const notHolding = candidates.filter((uid) => !match.heldBy(uid));
    if (notHolding.length <= 1) return notHolding.length ? notHolding : candidates.slice(0, 1);
    const classes = match.holders.map((holder) => AccountRepairNames.classOf(users[holder.uid] || {}));
    const sameClass = notHolding.filter((uid) => classes.indexOf(AccountRepairNames.classOf(users[uid] || {})) >= 0);
    return sameClass.length ? sameClass : notHolding;
  }
}

/* 한 게임의 정상화를 한 번 해 보고 결과를 돌려준다. 반 별 통계의 새로고침 버튼이 누를 때마다 부른다(2026-11-03).
   users 를 읽어 빠진 판을 찾고 → 바로 채우고(다시 읽어 확인) → 무엇을 채웠는지 요약을 돌려준다. 채울 게 없으면 쓰지 않는다. */
class AccountStatsNormalizer {
  private readonly planners: Record<string, (users: Record<string, AccountRepairUserRaw>) => { patch(): Record<string, unknown>; summary(): AccountRepairResult }> = {};

  constructor(private readonly io: AccountRepairIo) {
    this.register(new ZombieRepairGame());
    this.register(new TurboLapRepairGame());
    this.register(new FpsRepairGame());
    this.register(new SnowRepairGame());
    this.register(new BalloonRepairGame());
    this.planners["teambattle"] = (users) => {
      const plan = new TeamBattleRepairPlanner(true).plan(users as unknown as Record<string, TeamBattleRepairUserRaw>);
      return { patch: () => plan.patch(), summary: () => AccountStatsNormalizer.teamSummary(plan) };
    };
  }

  /* 정상화를 지원하는 게임인가(32·34·35 랜덤 매칭은 결과표에 상대 이름만 남아 되살릴 수 없다) */
  supports(gameKey: string): boolean {
    return !!this.planners[gameKey];
  }

  async normalize(gameKey: string): Promise<AccountRepairResult | null> {
    const make = this.planners[gameKey];
    if (!make) return null;
    const first = make(await this.readUsers());
    if (!first.summary().studentCount) return first.summary();
    const fresh = make(await this.readUsers());
    const values = fresh.patch();
    if (Object.keys(values).length) await this.io.patch(values);
    return fresh.summary();
  }

  private async readUsers(): Promise<Record<string, AccountRepairUserRaw>> {
    return ((await this.io.read("users")) as Record<string, AccountRepairUserRaw> | null) || {};
  }

  private register<R, P extends AccountMatchPlanBase, N, E extends AccountRecentHeadEntry>(game: AccountRepairGame<R, P, N, E>): void {
    this.planners[game.gameKey] = (users) => {
      const plan = new AccountRepairPlanner(game).plan(users);
      return { patch: () => plan.patch(), summary: () => plan.summary(game.gameKey) };
    };
  }

  private static teamSummary(plan: TeamBattleRepairPlan): AccountRepairResult {
    const by: Record<string, { name: string; list: AccountRepairAddition[] }> = {};
    plan.fixes.forEach((fix) => {
      by[fix.uid] = { name: fix.name, list: fix.additions.map((addition) => ({ key: addition.key, at: addition.at, win: addition.win, countsStats: addition.countsStats, intoRecent: addition.intoRecent, pendingSame: addition.pendingSame })) };
    });
    return {
      gameKey: "teambattle", studentCount: plan.fixes.length, matchCount: plan.matches.length, partialMatches: plan.partialMatches,
      additions: Object.keys(by).map((uid) => by[uid]), skips: plan.skips.map((skip) => ({ name: skip.name, key: skip.key, reason: skip.reason })), agedOutLines: plan.agedOutLines
    };
  }
}

/* 새로고침 버튼 아래에 정상화 결과를 보여 준다 */
class AccountRepairReport {
  static line(result: AccountRepairResult | null): string {
    if (!result) return "";
    const added = result.additions.reduce((sum, item) => sum + item.list.length, 0);
    if (!added) return "통계 정상화: 빠진 기록이 없습니다.";
    return "통계 정상화: 학생 " + result.studentCount + "명의 빠진 판 " + added + "개를 채웠습니다." + (result.skips.length ? " (건너뜀 " + result.skips.length + "줄)" : "");
  }

  static html(result: AccountRepairResult | null): string {
    if (!result || (!result.additions.length && !result.skips.length)) return "";
    const rows = result.additions.map((item) => {
      const list = item.list.map((addition) => RecentBlockList.whenText(addition.at) + " " + (addition.win ? "승" : "패") + (addition.countsStats ? "" : "(AI 판)")).join(", ");
      return "<tr><td>" + AccountHtml.esc(item.name) + "</td><td>" + item.list.length + "</td><td>" + AccountHtml.esc(list) + "</td></tr>";
    });
    const skipRows = result.skips.map((skip) => "<tr><td>" + AccountHtml.esc(skip.name) + "</td><td>-</td><td>" + AccountHtml.esc(skip.reason) + "</td></tr>");
    return "<table><thead><tr><th>학생</th><th>판</th><th>채운 판 / 건너뛴 까닭</th></tr></thead><tbody>" + rows.join("") + skipRows.join("") + "</tbody></table>";
  }
}
