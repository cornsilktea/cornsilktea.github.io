/* =====================================================================
   30번 팀 배틀 계정별 통계 · 최근 매치 (공용 뼈대 account-match-kit.ts 를 이어 받은 30번 전용 부분)

   저장 위치(Realtime Database, 규칙은 데이터베이스규칙.json 의 users·classStats):
     users/<uid>/stats/teambattle   { g, w, l, bg, bw, rg, rw, m, ids/<matchKey>, c/<캐릭터> }
       g 유효한 판 수 · w 승 · l 패 · bg/bw 블루 판·승 · rg/rw 레드 판·승 · m MVP 수
       c/<캐릭터> = { n 판, w 승, bg, bw, rg, rw, m MVP 횟수, kn 킬·데스·어시스트 평균 분모,
                      k·d·a 평균 킬·데스·어시스트, dmg·hl·bl 평균 피해·회복·막은 피해, st·sl 평균 기절·둔화(초),
                      scn·sc 평균 환산점수의 판 수·평균(2026-10-28 추가 — 그 전 판은 없어서 n 과 따로 센다) }
       ids = 최근에 올린 경기 열쇠(같은 판을 두 번 올리지 않게, 최근 AccountKeyLedger.KEEP 개만)
     users/<uid>/recent/teambattle/<0~19>  최근 매치 20칸(값 배열, TeamBattleCodec) — 칸 이름 규칙으로도 20판을 넘지 못한다
     classStats/<학년-반|none>/<uid> { n 이름, g, w, m }  교사 화면 반별 승률 순위용 요약(교사만 읽음)

   집계 규칙(2026-10-26 선생님 결정)
     - 누적 통계: 대회모드이고 AI 가 한 명도 없던 경기만. 경기 절반 뒤에 나가면 패배, 절반 전에 나가면 기록 없음.
     - 최근 매치: 대회모드 경기면 AI 가 있어도 기록(절반 전에 나간 판은 없음).
     - MVP: 환산점수 최고점, 동점이면 모두 인정, 나간 사람과 처치·어시스트가 하나도 없는 사람은 후보에서 뺀다.
     - 승률·MVP율 같은 파생값은 저장하지 않고 화면에서 계산한다(TeamBattleRates).

   계산 클래스(TeamBattlePlan·AccountMvpJudge·TeamBattleCodec·TeamBattleRing·AccountStatsMath·AccountStatsTable·ClassStatsSummary)는
   화면도 통신도 모르는 순수 클래스라 30번 &test 가 직접 검사한다. 읽고 쓰는 것은 공용 AccountMatchStore 를 이어 받은
   AccountStatsStore 한 곳이며, TeamBattleProfile 이 30번만의 모양(게임 키·집계 대상·합산·값 배열)을 정한다.
   AccountDatabase 는 personal-records.js(로그인하면 account-login.js 가 불러옴)에 있다.
   ===================================================================== */

interface AccountPlayerLine {
  name: string;
  team: number;
  char: string;
  kills: number;
  deaths: number;
  assists: number;
  dmg: number;
  heal: number;
  blocked: number;
  stun: number;
  slow: number;
  slowWeight: number;
  left: boolean;
  ai: boolean;
}

interface AccountMatchReport {
  matchId: string;
  mode: string;
  winnerTeam: number;
  myIndex: number;
  players: AccountPlayerLine[];
  score: number[];
  progress: number;
  iLeft: boolean;
}

type StoredPlayerLine = Array<string | number>;

interface StoredRecentMatch extends AccountRecentHead {
  ai: number;
  me: number;
  s: number[];
  p: StoredPlayerLine[];
}

interface RecentMatchEntry extends AccountRecentHeadEntry {
  withAi: boolean;
  myIndex: number;
  score: number[];
  players: AccountPlayerLine[];
}

interface AccountCharNode {
  n: number; w: number; bg: number; bw: number; rg: number; rw: number; m: number;
  kn: number; k: number; d: number; a: number; dmg: number; hl: number; bl: number; st: number; sl: number;
  scn: number; sc: number;
}

interface AccountStatsNode {
  g: number; w: number; l: number; bg: number; bw: number; rg: number; rw: number; m: number;
  ids?: Record<string, number>;
  c?: Record<string, AccountCharNode>;
}

interface AccountMatchOutcome {
  key: string;
  win: boolean;
  side: number;
  mvp: boolean;
  at: number;
}

interface AccountStatsChange {
  node: AccountStatsNode;
  charId: string;
  addedKey: string;
  evictedKeys: string[];
}

interface ClassStatsRow {
  n: string;
  g: number;
  w: number;
  m: number;
}

interface AccountLegacyCharRow {
  picks: number; wins: number; draws: number; mvpCount: number; scPicks: number; mvpScore: number;
  kills: number; deaths: number; assist: number; kdPicks: number; asPicks: number; ccPicks: number;
  dmg: number; heal: number; block: number; stun: number; slow: number;
}

class TeamBattleRates extends AccountRates {
  static mvpRate(node: AccountStatsNode | null): number | null {
    return node ? AccountRates.ratio(node.m, node.g) : null;
  }
}

class AccountMvpJudge {
  constructor(private readonly scoreOf: (line: AccountPlayerLine) => number) {}

  winners(players: AccountPlayerLine[]): number[] {
    let best: number[] = [];
    let bestScore = -Infinity;
    players.forEach((line, index) => {
      if (line.left || line.kills + line.assists <= 0) return;
      const score = this.scoreOf(line);
      if (score > bestScore) {
        bestScore = score;
        best = [index];
      } else if (score === bestScore) {
        best.push(index);
      }
    });
    return best;
  }

  isMvp(players: AccountPlayerLine[], index: number): boolean {
    return this.winners(players).indexOf(index) >= 0;
  }
}

class TeamBattlePlan implements AccountMatchPlanBase {
  static readonly CUP_MODE = "cup";
  static readonly FORFEIT_AT = AccountForfeit.AT;

  readonly recordsRecent: boolean;
  readonly countsStats: boolean;
  readonly win: boolean;
  readonly mvp: boolean;
  readonly withAi: boolean;

  constructor(report: AccountMatchReport, judge: AccountMvpJudge) {
    const me = report.players[report.myIndex];
    const leftEarly = AccountForfeit.leftEarly(report.iLeft, report.progress);
    this.withAi = report.players.some((line) => line.ai);
    this.recordsRecent = report.mode === TeamBattlePlan.CUP_MODE && !!me && !leftEarly && (report.winnerTeam === 0 || report.winnerTeam === 1 || report.iLeft);
    this.countsStats = this.recordsRecent && !this.withAi;
    this.win = !!me && !report.iLeft && me.team === report.winnerTeam;
    this.mvp = !!me && !report.iLeft && judge.isMvp(report.players, report.myIndex);
  }
}

class TeamBattleCodec {
  static readonly VERSION = 1;
  static readonly NAME_MAX = 20;
  private static readonly FIELDS = 14;

  static encode(report: AccountMatchReport, key: string, win: boolean): StoredRecentMatch {
    return Object.assign(AccountRecentHeadCodec.encode(TeamBattleCodec.VERSION, key, win), {
      ai: report.players.some((line) => line.ai) ? 1 : 0,
      me: report.myIndex,
      s: [AccountNumbers.count(report.score[0]), AccountNumbers.count(report.score[1])],
      p: report.players.map((line) => TeamBattleCodec.encodeLine(line))
    });
  }

  static encodeLine(line: AccountPlayerLine): StoredPlayerLine {
    return [
      String(line.name || "").slice(0, TeamBattleCodec.NAME_MAX), line.team === 1 ? 1 : 0, line.char,
      AccountNumbers.count(line.kills), AccountNumbers.count(line.deaths), AccountNumbers.count(line.assists),
      Math.max(0, AccountNumbers.whole(line.dmg)), Math.max(0, AccountNumbers.whole(line.heal)), Math.max(0, AccountNumbers.whole(line.blocked)),
      Math.max(0, AccountNumbers.oneDecimal(line.stun)), Math.max(0, AccountNumbers.oneDecimal(line.slow)),
      line.left ? 1 : 0, line.ai ? 1 : 0, Math.max(0, AccountNumbers.twoDecimals(line.slowWeight))
    ];
  }

  static decode(raw: unknown): RecentMatchEntry | null {
    const head = AccountRecentHeadCodec.decode(raw, TeamBattleCodec.VERSION);
    if (!head) return null;
    const stored = raw as StoredRecentMatch;
    const lines = AccountShape.list(stored.p).map((item) => TeamBattleCodec.decodeLine(item));
    if (!lines.length || lines.some((line) => !line)) return null;
    const players = lines as AccountPlayerLine[];
    const myIndex = AccountNumbers.count(stored.me);
    if (myIndex >= players.length) return null;
    const score = AccountShape.list(stored.s).map((value) => AccountNumbers.count(value));
    return {
      id: head.id,
      at: head.at,
      win: head.win,
      withAi: stored.ai === 1,
      myIndex,
      score: [score[0] || 0, score[1] || 0],
      players
    };
  }

  static decodeLine(raw: unknown): AccountPlayerLine | null {
    const item = AccountShape.list(raw);
    if (item.length < TeamBattleCodec.FIELDS - 1 || typeof item[2] !== "string") return null;
    const number = (index: number) => Number(item[index]) || 0;
    return {
      name: String(item[0] == null ? "" : item[0]), team: number(1) === 1 ? 1 : 0, char: String(item[2]),
      kills: number(3), deaths: number(4), assists: number(5), dmg: number(6), heal: number(7), blocked: number(8),
      stun: number(9), slow: number(10), left: number(11) === 1, ai: number(12) === 1, slowWeight: number(13)
    };
  }
}

class TeamBattleRing extends RecentMatchRing {
  static entries(stored: unknown): RecentMatchEntry[] {
    return RecentMatchRing.decodeAll(stored, TeamBattleCodec.decode);
  }
}

class AccountStatsMath {
  static readonly IDS_KEEP = AccountKeyLedger.KEEP;

  static empty(): AccountStatsNode {
    return { g: 0, w: 0, l: 0, bg: 0, bw: 0, rg: 0, rw: 0, m: 0 };
  }

  static emptyChar(): AccountCharNode {
    return { n: 0, w: 0, bg: 0, bw: 0, rg: 0, rw: 0, m: 0, kn: 0, k: 0, d: 0, a: 0, dmg: 0, hl: 0, bl: 0, st: 0, sl: 0, scn: 0, sc: 0 };
  }

  static normalize(raw: unknown): AccountStatsNode {
    const node = AccountStatsMath.empty();
    if (!raw || typeof raw !== "object") return node;
    const source = raw as Record<string, unknown>;
    (["g", "w", "l", "bg", "bw", "rg", "rw", "m"] as const).forEach((key) => { node[key] = AccountNumbers.count(source[key]); });
    const ids = AccountShape.slots(source.ids);
    node.ids = {};
    Object.keys(ids).forEach((key) => { node.ids![key] = Number(ids[key]) || 0; });
    const chars = AccountShape.slots(source.c);
    node.c = {};
    Object.keys(chars).forEach((key) => { node.c![key] = AccountStatsMath.normalizeChar(chars[key]); });
    return node;
  }

  static normalizeChar(raw: unknown): AccountCharNode {
    const node = AccountStatsMath.emptyChar();
    const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    (Object.keys(node) as Array<keyof AccountCharNode>).forEach((key) => { node[key] = Number(source[key]) || 0; });
    return node;
  }

  static apply(raw: unknown, line: AccountPlayerLine, outcome: AccountMatchOutcome): AccountStatsChange | null {
    const before = AccountStatsMath.normalize(raw);
    const ids = before.ids || {};
    if (ids[outcome.key] != null) return null;
    const blue = outcome.side === 0;
    const node: AccountStatsNode = {
      g: before.g + 1,
      w: before.w + (outcome.win ? 1 : 0),
      l: before.l + (outcome.win ? 0 : 1),
      bg: before.bg + (blue ? 1 : 0),
      bw: before.bw + (blue && outcome.win ? 1 : 0),
      rg: before.rg + (blue ? 0 : 1),
      rw: before.rw + (!blue && outcome.win ? 1 : 0),
      m: before.m + (outcome.mvp ? 1 : 0),
      ids: Object.assign({}, ids),
      c: Object.assign({}, before.c || {})
    };
    node.ids![outcome.key] = outcome.at;
    const evictedKeys = AccountKeyLedger.overflowKeys(node.ids!);
    evictedKeys.forEach((key) => { delete node.ids![key]; });
    node.c![line.char] = AccountStatsMath.applyChar(node.c![line.char] || AccountStatsMath.emptyChar(), line, outcome);
    return { node, charId: line.char, addedKey: outcome.key, evictedKeys };
  }

  static applyChar(before: AccountCharNode, line: AccountPlayerLine, outcome: AccountMatchOutcome): AccountCharNode {
    const blue = outcome.side === 0;
    const n = before.n;
    const kn = before.kn;
    return {
      n: n + 1,
      w: before.w + (outcome.win ? 1 : 0),
      bg: before.bg + (blue ? 1 : 0),
      bw: before.bw + (blue && outcome.win ? 1 : 0),
      rg: before.rg + (blue ? 0 : 1),
      rw: before.rw + (!blue && outcome.win ? 1 : 0),
      m: before.m + (outcome.mvp ? 1 : 0),
      kn: kn + 1,
      k: AccountNumbers.runningAverage(before.k, kn, AccountNumbers.count(line.kills)),
      d: AccountNumbers.runningAverage(before.d, kn, AccountNumbers.count(line.deaths)),
      a: AccountNumbers.runningAverage(before.a, kn, AccountNumbers.count(line.assists)),
      dmg: AccountNumbers.runningAverage(before.dmg, n, Math.max(0, Number(line.dmg) || 0)),
      hl: AccountNumbers.runningAverage(before.hl, n, Math.max(0, Number(line.heal) || 0)),
      bl: AccountNumbers.runningAverage(before.bl, n, Math.max(0, Number(line.blocked) || 0)),
      st: AccountNumbers.runningAverage(before.st, n, Math.max(0, Number(line.stun) || 0)),
      sl: AccountNumbers.runningAverage(before.sl, n, Math.max(0, Number(line.slow) || 0)),
      scn: before.scn + 1,
      sc: AccountNumbers.runningAverage(before.sc, before.scn, TeamBattleScore.of(line))
    };
  }
}

class AccountStatsTable {
  static legacyRows(node: AccountStatsNode | null): Record<string, AccountLegacyCharRow> {
    const rows: Record<string, AccountLegacyCharRow> = {};
    const chars = (node && node.c) || {};
    Object.keys(chars).forEach((id) => {
      const c = chars[id];
      rows[id] = {
        picks: c.n, wins: c.w, draws: 0, mvpCount: c.m, scPicks: c.scn, mvpScore: c.sc,
        kills: c.k, deaths: c.d, assist: c.a, kdPicks: c.kn, asPicks: c.kn, ccPicks: c.n,
        dmg: c.dmg, heal: c.hl, block: c.bl, stun: c.st, slow: c.sl
      };
    });
    return rows;
  }
}

class ClassStatsSummary {
  static readonly NONE = "none";
  static readonly CLASS_PATTERN = /^[12]-[1-5]$/;
  static readonly NAME_MAX = 40;

  static classKey(cls: unknown): string {
    return typeof cls === "string" && ClassStatsSummary.CLASS_PATTERN.test(cls) ? cls : ClassStatsSummary.NONE;
  }

  static build(name: string, node: AccountStatsNode): ClassStatsRow {
    return { n: String(name || "학생").slice(0, ClassStatsSummary.NAME_MAX) || "학생", g: node.g, w: node.w, m: node.m };
  }
}

class TeamBattleProfile extends AccountGameProfile<AccountMatchReport, TeamBattlePlan, AccountStatsNode, RecentMatchEntry, AccountMvpJudge> {
  static readonly CLASS_PATH = "profile/cls";
  static readonly CLASS_STATS_ROOT = "classStats";

  readonly gameKey = "teambattle";

  matchIdOf(report: AccountMatchReport): string {
    return report.matchId;
  }

  planOf(report: AccountMatchReport, judge: AccountMvpJudge): TeamBattlePlan {
    return new TeamBattlePlan(report, judge);
  }

  /* 미리 적기 칸에는 나간 판의 패배뿐 아니라 끝난 판의 진짜 결과(stash)도 남으므로 MVP 를 결과 창과 같은 점수로 판정한다 */
  abandonedContext(): AccountMvpJudge {
    return new AccountMvpJudge((line) => TeamBattleScore.of(line));
  }

  encodeRecent(report: AccountMatchReport, key: string, win: boolean): object {
    return TeamBattleCodec.encode(report, key, win);
  }

  decodeRecent(raw: unknown): RecentMatchEntry | null {
    return TeamBattleCodec.decode(raw);
  }

  normalizeStats(raw: unknown): AccountStatsNode {
    return AccountStatsMath.normalize(raw);
  }

  applyStats(raw: unknown, report: AccountMatchReport, plan: TeamBattlePlan, key: string, at: number): AccountStatsChangeBase<AccountStatsNode> | null {
    const me = report.players[report.myIndex];
    const change = AccountStatsMath.apply(raw, me, { key, win: plan.win, side: me.team, mvp: plan.mvp, at });
    return change ? { node: change.node, patch: this.statsPatch(change) } : null;
  }

  extraReadPath(): string | null {
    return TeamBattleProfile.CLASS_PATH;
  }

  /* 선생님 계정은 반별 순위에 넣지 않는다. 반이 정해진 학생은 미분류(none) 칸의 옛 요약을 함께 지운다 */
  extraPatch(user: PortalUser, cls: unknown, node: AccountStatsNode): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    const admins = typeof AccountPolicy === "function" ? AccountPolicy.ADMIN_UIDS : [];
    if (admins.indexOf(user.uid) >= 0) return values;
    const classKey = ClassStatsSummary.classKey(cls);
    const root = TeamBattleProfile.CLASS_STATS_ROOT + "/";
    values[root + classKey + "/" + user.uid] = ClassStatsSummary.build(user.name, node);
    if (classKey !== ClassStatsSummary.NONE) values[root + ClassStatsSummary.NONE + "/" + user.uid] = null;
    return values;
  }

  private statsPatch(change: AccountStatsChange): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    const node = change.node;
    (["g", "w", "l", "bg", "bw", "rg", "rw", "m"] as const).forEach((key) => { values[key] = node[key]; });
    values["c/" + change.charId] = node.c![change.charId];
    values["ids/" + change.addedKey] = node.ids![change.addedKey];
    change.evictedKeys.forEach((key) => { values["ids/" + key] = null; });
    return values;
  }
}

class AccountStatsStore extends AccountMatchStore<AccountMatchReport, TeamBattlePlan, AccountStatsNode, RecentMatchEntry, AccountMvpJudge> {
  constructor(database: AccountDatabaseLike, user: PortalUser) {
    super(database, user, new TeamBattleProfile());
  }

  /* 로그인 전이거나 personal-records.js 가 아직 안 불렸으면 null — 화면은 안내 문구를 보인다 */
  static open(): AccountStatsStore | null {
    const user = window.PORTAL_USER;
    if (!user || typeof AccountDatabase !== "function") return null;
    return new AccountStatsStore(new AccountDatabase(user), user);
  }
}

interface TeamBattleCharLabel {
  name: string;
  heals: boolean;
  blocks: boolean;
}

/* 결과 창 환산점수 식(30번 ResultBoard.mvpScore 와 같은 식 — &test 가 둘이 같은 값을 내는지 본다).
   최근 매치 목록·교사 화면은 저장된 줄로 다시 계산한다(점수는 저장하지 않음, 5-2b).
   2026-10-29 v3 패치에서 어시스트 50→80·회복 1→0.7·기절 60→40·둔화 40→20 으로 바꿨다(선생님 결정).
   예전 식은 LegacyTeamBattleScore — 이미 저장된 MVP 수를 새 식으로 다시 셀 때 "그때 누가 MVP 였나"를 되짚는 데만 쓴다 */
class TeamBattleScore {
  static readonly KILL = 100;
  static readonly ASSIST = 80;
  static readonly DEATH = 100;
  static readonly HEAL = 0.7;
  static readonly STUN_PER_SEC = 40;
  static readonly SLOW_PER_SEC = 20;

  static of(line: AccountPlayerLine): number {
    return line.kills * TeamBattleScore.KILL + (line.assists || 0) * TeamBattleScore.ASSIST
      + Math.round(line.dmg) + Math.round(Math.round(line.heal || 0) * TeamBattleScore.HEAL) + Math.round(line.blocked || 0)
      + Math.round(AccountNumbers.oneDecimal(line.stun) * TeamBattleScore.STUN_PER_SEC)
      + Math.round(AccountNumbers.twoDecimals(line.slowWeight) * TeamBattleScore.SLOW_PER_SEC)
      - line.deaths * TeamBattleScore.DEATH;
  }

  /* 결과 창의 MVP 표시와 같은 규칙: 처치·어시스트가 있는 사람 중 점수 최고, 같으면 피해량이 큰 사람, 그래도 같으면 공동 */
  static shownMvp(players: AccountPlayerLine[]): number[] {
    let best: number[] = [];
    let bestScore = 0;
    let bestDmg = 0;
    players.forEach((line, index) => {
      if (line.kills + (line.assists || 0) <= 0) return;
      const score = TeamBattleScore.of(line);
      const dmg = Math.round(line.dmg);
      if (!best.length || score > bestScore || (score === bestScore && dmg > bestDmg)) {
        best = [index];
        bestScore = score;
        bestDmg = dmg;
      } else if (score === bestScore && dmg === bestDmg) {
        best.push(index);
      }
    });
    return best;
  }
}

class LegacyTeamBattleScore {
  static readonly ASSIST = 50;
  static readonly STUN_PER_SEC = 60;
  static readonly SLOW_PER_SEC = 40;

  static of(line: AccountPlayerLine): number {
    return line.kills * TeamBattleScore.KILL + (line.assists || 0) * LegacyTeamBattleScore.ASSIST
      + Math.round(line.dmg) + Math.round(line.heal || 0) + Math.round(line.blocked || 0)
      + Math.round(AccountNumbers.oneDecimal(line.stun) * LegacyTeamBattleScore.STUN_PER_SEC)
      + Math.round(AccountNumbers.twoDecimals(line.slowWeight) * LegacyTeamBattleScore.SLOW_PER_SEC)
      - line.deaths * TeamBattleScore.DEATH;
  }
}

/* 최근 매치 한 판에서 내 쪽 요약: 환산점수와 그 판 전체 순위, MVP(계정 통계와 같은 AccountMvpJudge), 우리·상대 팀 처치 */
class TeamBattleMatchSummary {
  readonly me: AccountPlayerLine;
  readonly score: number;
  readonly rank: number;
  readonly mvp: boolean;
  readonly ours: number;
  readonly theirs: number;

  constructor(readonly entry: RecentMatchEntry) {
    this.me = entry.players[entry.myIndex];
    this.score = TeamBattleScore.of(this.me);
    this.rank = 1 + entry.players.filter((line) => TeamBattleScore.of(line) > this.score).length;
    this.mvp = !this.me.left && new AccountMvpJudge((line) => TeamBattleScore.of(line)).isMvp(entry.players, entry.myIndex);
    this.ours = entry.score[this.me.team] || 0;
    this.theirs = entry.score[1 - this.me.team] || 0;
  }
}

/* 최근 매치 목록 위 한 줄 요약: "9승 5패 · MVP 3번 · 평균 환산점수 812" */
class TeamBattleRecentDigest {
  static text(entries: RecentMatchEntry[]): string {
    if (!entries.length) return "";
    const summaries = entries.map((entry) => new TeamBattleMatchSummary(entry));
    const wins = entries.filter((entry) => entry.win).length;
    const mvps = summaries.filter((summary) => summary.mvp).length;
    const average = Math.round(summaries.reduce((sum, summary) => sum + summary.score, 0) / summaries.length);
    return wins + "승 " + (entries.length - wins) + "패 · MVP " + mvps + "번 · 평균 환산점수 " + average;
  }
}

/* 최근 20매치 블록(30번 게임 창과 교사 제어판이 같이 쓴다, 2026-10-28 선생님 요청). 승패를 크게, 내 캐릭터·K/D/A,
   환산점수와 그 판 순위·MVP, 우리:상대 처치, 두 팀 명단을 한 블록에. 모양은 처음 그릴 때 <style id="tbrStyle"> 로 한 번 넣는다 */
class TeamBattleRecentBlock {
  static readonly CLASS = "tbr-item";
  private static readonly STYLE_ID = "tbrStyle";
  private static readonly STYLE = [
    ".rmItem.tbr-item{display:grid;grid-template-columns:104px minmax(0,1.15fr) minmax(0,1fr) minmax(0,1fr);grid-template-areas:'head me score kills' 'head teams teams teams';align-items:center;gap:6px 14px;width:100%;padding:12px 14px;border-radius:10px;border:2px solid transparent;text-align:left;color:#EEF2EE;font:inherit;cursor:pointer;box-sizing:border-box;}",
    ".rmItem.tbr-item.win{background:rgba(47,111,214,.24);border-color:rgba(111,168,255,.6);}",
    ".rmItem.tbr-item.lose{background:rgba(214,69,61,.22);border-color:rgba(255,122,112,.55);}",
    ".rmItem.tbr-item:hover{filter:brightness(1.15);}",
    ".rmItem.tbr-item .rmHead{grid-area:head;}",
    ".rmItem.tbr-item .rmHead b{display:block;font-size:28px;font-weight:800;line-height:1.15;}",
    ".rmItem.tbr-item.win .rmHead b{color:#8DB8FF;}",
    ".rmItem.tbr-item.lose .rmHead b{color:#FF9A92;}",
    ".rmItem.tbr-item .rmHead small{display:block;font-size:12px;color:#C3CCC5;}",
    ".tbr-col{display:block;min-width:0;}",
    ".tbr-me{grid-area:me;}.tbr-score{grid-area:score;}.tbr-kills{grid-area:kills;}",
    ".tbr-col i{display:block;font-style:normal;font-size:11px;font-weight:700;color:#A3B0A6;}",
    ".tbr-col b{font-size:21px;font-weight:800;color:#F4F1E8;white-space:nowrap;}",
    ".tbr-col em{display:block;font-style:normal;font-size:14px;font-weight:800;color:#DCE3DD;}",
    ".tbr-col em small{font-size:11px;font-weight:700;color:#A3B0A6;}",
    ".tbr-score b{color:#F2D06B;}",
    ".tbr-mvp{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:#F2D06B;color:#3A2A00;font-size:12px;font-weight:800;vertical-align:3px;}",
    ".tbr-kills .b{color:#8DB8FF;}.tbr-kills .r{color:#FF9A92;}",
    ".tbr-teams{grid-area:teams;display:flex;flex-wrap:wrap;gap:2px 18px;font-size:13px;font-weight:700;color:#DCE3DD;word-break:keep-all;}",
    ".tbr-teams i{font-style:normal;font-size:11px;color:#A3B0A6;margin-right:6px;}",
    ".tbr-teams .mine{color:#F2D06B;}.tbr-teams .ai{color:#FFCF5A;}",
    "@media (max-width:640px){.rmItem.tbr-item{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-areas:'head head head' 'me score kills' 'teams teams teams';}.rmItem.tbr-item .rmHead b{display:inline;margin-right:8px;}.rmItem.tbr-item .rmHead small{display:inline;}}"
  ].join("\n");

  static listHtml(entries: RecentMatchEntry[], labelOf: (charId: string) => TeamBattleCharLabel): string {
    TeamBattleRecentBlock.ensureStyle();
    return RecentBlockList.html(entries, (entry) => TeamBattleRecentBlock.bodyHtml(entry, labelOf), TeamBattleRecentBlock.CLASS);
  }

  private static bodyHtml(entry: RecentMatchEntry, labelOf: (charId: string) => TeamBattleCharLabel): string {
    const summary = new TeamBattleMatchSummary(entry);
    const me = summary.me;
    const ourClass = me.team === 0 ? "b" : "r";
    const theirClass = me.team === 0 ? "r" : "b";
    return '<span class="tbr-col tbr-me"><i>내 캐릭터</i><b>' + AccountHtml.esc(labelOf(me.char).name) + "</b>"
      + "<em>" + me.kills + " / " + me.deaths + " / " + me.assists + " <small>처치·쓰러짐·어시스트</small></em></span>"
      + '<span class="tbr-col tbr-score"><i>환산점수</i><b>' + summary.score + "</b>" + (summary.mvp ? '<span class="tbr-mvp">🏆 MVP</span>' : "")
      + "<em>" + entry.players.length + "명 중 " + summary.rank + "위" + (me.left ? " · 나감" : "") + "</em></span>"
      + '<span class="tbr-col tbr-kills"><i>팀 처치</i><b><span class="' + ourClass + '">' + summary.ours + '</span> : <span class="' + theirClass + '">' + summary.theirs + "</span></b>"
      + "<em>우리 " + (me.team === 0 ? "블루" : "레드") + "팀 : 상대</em></span>"
      + '<span class="tbr-teams"><span><i>우리 팀</i>' + TeamBattleRecentBlock.namesHtml(entry, me.team) + "</span>"
      + "<span><i>상대 팀</i>" + TeamBattleRecentBlock.namesHtml(entry, 1 - me.team) + "</span>"
      + (entry.withAi ? '<span class="ai">🤖 AI 포함 · 내 통계 제외</span>' : "") + "</span>";
  }

  private static namesHtml(entry: RecentMatchEntry, team: number): string {
    return entry.players.map((line, index) => ({ line, index })).filter((item) => item.line.team === team).map((item) => {
      const text = (item.line.ai ? "🤖 " : "") + AccountHtml.esc(item.line.name) + (item.line.left ? "(나감)" : "");
      return item.index === entry.myIndex ? '<span class="mine">' + text + "</span>" : text;
    }).join(" · ");
  }

  private static ensureStyle(): void {
    if (typeof document === "undefined" || document.getElementById(TeamBattleRecentBlock.STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = TeamBattleRecentBlock.STYLE_ID;
    style.textContent = TeamBattleRecentBlock.STYLE;
    document.head.appendChild(style);
  }
}
