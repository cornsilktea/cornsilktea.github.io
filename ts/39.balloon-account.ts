/* =====================================================================
   39번 물풍선 대작전 계정 통계 · 최근 20매치 (공용 뼈대 account-match-kit.ts 의 자식, 게임 키 waterballoon)

   집계 규칙(2026-10-26, 선생님 요청 · 항목은 규칙 엔진이 세는 값에서 골랐다)
     - 대상: 온라인 방(방 만들기·코드 입장·랜덤 매칭). 혼자 하기(봇)·관전은 기록하지 않는다.
     - 승: 내 편이 1위(개인전은 최후 생존, 팀전은 팀 순위 1위). 순위는 WbScoreboard.ranks 와 같다.
     - 누적 통계: AI(봇)가 한 명도 없던 판만. 최근 매치: 봇이 섞여도 기록.
     - 경기 진행(탈락한 편 비율 또는 시간)이 절반을 넘긴 뒤 나가면 패배, 절반 전이면 기록 없음.
     - 항목: 가둔 수(traps) · 처치(kills: 가둔 사람을 마무리하거나 시간 초과로 탈락시킨 수) · 구출(rescues, 팀전) · 부술 상자(boxes) · 자폭(selfKills) ·
       평균 생존 시간(탈락 시각, 끝까지 남았으면 경기 끝 시각) · 평균 순위 · 한 판 최다 처치. 갇힌 횟수는 엔진이 세지 않아 넣지 않았다.
     - 모드(개인전/팀전)는 합산하고 판 수만 따로 센다.
     - 랜덤 매칭 칸 rm(2026-10-29 선생님 결정, 대결 화면용): 랜덤 매칭 판만, 봇이 섞인 판도 센다. 판·1위·팀전 판·처치·구출. 이날부터 쌓인다.
       봇이 섞인 랜덤 매칭 판은 rm 만 오르고 위 누적 칸은 그대로다.

   저장:
     users/<uid>/stats/waterballoon  { g, w, l, gs 개인전 판, gt 팀전 판, kl 처치, tp 가둔 수, rs 구출, bx 상자, sk 자폭, sv 생존 초 합, rk 순위 합, mk 한 판 최다 처치, ids,
       rm { g, w, gt, kl, rs } }
     users/<uid>/recent/waterballoon/<0~19>  { v, id, at, r, ai, md 0개인전/1팀전, me, p [[이름, 편, 순위, 생존 초, 처치, 가둔 수, 구출, 상자, 자폭, 나감 0/1, AI 0/1]] }
   ===================================================================== */

interface WbAccountLine {
  name: string;
  team: number;
  rank: number;
  secs: number;
  kills: number;
  traps: number;
  rescues: number;
  boxes: number;
  selfKills: number;
  left: boolean;
  ai: boolean;
}

interface WbAccountReport {
  matchId: string;
  mode: string;
  myIndex: number;
  players: WbAccountLine[];
  progress: number;
  iLeft: boolean;
  random?: boolean;
}

interface WbRandomTally {
  g: number; w: number; gt: number; kl: number; rs: number;
}

interface WbAccountStatsNode {
  g: number; w: number; l: number; gs: number; gt: number;
  kl: number; tp: number; rs: number; bx: number; sk: number; sv: number; rk: number; mk: number;
  ids: Record<string, number>;
  rm: WbRandomTally;
}

interface WbAccountRecentEntry extends AccountRecentHeadEntry {
  withAi: boolean;
  mode: string;
  myIndex: number;
  players: WbAccountLine[];
}

class WbAccountKeys {
  static readonly NUMBERS = ["g", "w", "l", "gs", "gt", "kl", "tp", "rs", "bx", "sk", "sv", "rk", "mk"] as const;
  static readonly MODES = ["solo", "team"];
  static readonly MODE_NAMES = ["개인전", "팀전"];

  static modeIndex(mode: string): number {
    return mode === "team" ? 1 : 0;
  }
}

class WbAccountPlan implements AccountMatchPlanBase {
  readonly recordsRecent: boolean;
  readonly countsStats: boolean;
  readonly win: boolean;
  readonly withAi: boolean;
  readonly countsMain: boolean;
  readonly countsRandom: boolean;

  constructor(report: WbAccountReport) {
    const me = report.players[report.myIndex];
    this.withAi = report.players.some((line) => line.ai);
    this.recordsRecent = !!me && !AccountForfeit.leftEarly(report.iLeft, report.progress);
    this.countsMain = this.recordsRecent && !this.withAi;
    this.countsRandom = this.recordsRecent && !!report.random;
    this.countsStats = this.countsMain || this.countsRandom;
    this.win = !!me && !report.iLeft && me.rank === 1;
  }
}

class WbAccountCodec {
  static readonly VERSION = 1;
  static readonly NAME_MAX = 20;
  static readonly CELLS = 11;

  static encode(report: WbAccountReport, key: string, win: boolean): object {
    return Object.assign(AccountRecentHeadCodec.encode(WbAccountCodec.VERSION, key, win), {
      ai: report.players.some((line) => line.ai) ? 1 : 0,
      md: WbAccountKeys.modeIndex(report.mode),
      me: report.myIndex,
      p: report.players.map((line) => [
        String(line.name || "").slice(0, WbAccountCodec.NAME_MAX), AccountNumbers.count(line.team), Math.max(1, AccountNumbers.count(line.rank)),
        AccountNumbers.whole(Math.max(0, line.secs)), AccountNumbers.count(line.kills), AccountNumbers.count(line.traps), AccountNumbers.count(line.rescues),
        AccountNumbers.count(line.boxes), AccountNumbers.count(line.selfKills), line.left ? 1 : 0, line.ai ? 1 : 0
      ])
    });
  }

  static decode(raw: unknown): WbAccountRecentEntry | null {
    const head = AccountRecentHeadCodec.decode(raw, WbAccountCodec.VERSION);
    if (!head) return null;
    const stored = raw as { ai: number; md: number; me: number; p: unknown };
    const players: WbAccountLine[] = [];
    for (const item of AccountShape.list(stored.p)) {
      const cells = AccountShape.list(item);
      if (cells.length < WbAccountCodec.CELLS || typeof cells[0] !== "string") return null;
      const n = (index: number) => Number(cells[index]) || 0;
      players.push({ name: String(cells[0]), team: n(1), rank: n(2), secs: n(3), kills: n(4), traps: n(5), rescues: n(6), boxes: n(7), selfKills: n(8), left: n(9) === 1, ai: n(10) === 1 });
    }
    const myIndex = AccountNumbers.count(stored.me);
    if (!players.length || myIndex >= players.length) return null;
    return { id: head.id, at: head.at, win: head.win, withAi: stored.ai === 1, mode: WbAccountKeys.MODES[stored.md === 1 ? 1 : 0], myIndex, players };
  }
}

class WbRandomTallyMath {
  static readonly NUMBERS = ["g", "w", "gt", "kl", "rs"] as const;

  static empty(): WbRandomTally {
    return { g: 0, w: 0, gt: 0, kl: 0, rs: 0 };
  }

  static normalize(raw: unknown): WbRandomTally {
    const tally = WbRandomTallyMath.empty();
    if (!raw || typeof raw !== "object") return tally;
    const source = raw as Record<string, unknown>;
    WbRandomTallyMath.NUMBERS.forEach((key) => { tally[key] = AccountNumbers.count(source[key]); });
    return tally;
  }

  static add(before: WbRandomTally, report: WbAccountReport, win: boolean): WbRandomTally {
    const me = report.players[report.myIndex];
    return { g: before.g + 1, w: before.w + (win ? 1 : 0), gt: before.gt + (WbAccountKeys.modeIndex(report.mode) === 1 ? 1 : 0),
      kl: before.kl + AccountNumbers.count(me.kills), rs: before.rs + AccountNumbers.count(me.rescues) };
  }
}

class WbAccountMath {
  static empty(): WbAccountStatsNode {
    return { g: 0, w: 0, l: 0, gs: 0, gt: 0, kl: 0, tp: 0, rs: 0, bx: 0, sk: 0, sv: 0, rk: 0, mk: 0, ids: {}, rm: WbRandomTallyMath.empty() };
  }

  static normalize(raw: unknown): WbAccountStatsNode {
    const node = WbAccountMath.empty();
    if (!raw || typeof raw !== "object") return node;
    const source = raw as Record<string, unknown>;
    WbAccountKeys.NUMBERS.forEach((key) => { node[key] = AccountNumbers.count(source[key]); });
    const ids = AccountShape.slots(source.ids);
    Object.keys(ids).forEach((key) => { node.ids[key] = Number(ids[key]) || 0; });
    node.rm = WbRandomTallyMath.normalize(source.rm);
    return node;
  }

  static apply(raw: unknown, report: WbAccountReport, win: boolean, key: string, at: number): { node: WbAccountStatsNode; evicted: string[] } | null {
    const before = WbAccountMath.normalize(raw);
    if (before.ids[key] != null) return null;
    const me = report.players[report.myIndex];
    const team = WbAccountKeys.modeIndex(report.mode) === 1;
    const kills = AccountNumbers.count(me.kills);
    const main = !report.players.some((line) => line.ai);
    const rm = report.random ? WbRandomTallyMath.add(before.rm, report, win) : before.rm;
    const node: WbAccountStatsNode = !main ? Object.assign({}, before, { ids: Object.assign({}, before.ids), rm }) : {
      g: before.g + 1, w: before.w + (win ? 1 : 0), l: before.l + (win ? 0 : 1), gs: before.gs + (team ? 0 : 1), gt: before.gt + (team ? 1 : 0),
      kl: before.kl + kills, tp: before.tp + AccountNumbers.count(me.traps), rs: before.rs + AccountNumbers.count(me.rescues), bx: before.bx + AccountNumbers.count(me.boxes),
      sk: before.sk + AccountNumbers.count(me.selfKills), sv: before.sv + AccountNumbers.whole(Math.max(0, me.secs)), rk: before.rk + Math.max(1, AccountNumbers.count(me.rank)), mk: Math.max(before.mk, kills),
      ids: Object.assign({}, before.ids), rm
    };
    node.ids[key] = at;
    const evicted = AccountKeyLedger.overflowKeys(node.ids);
    evicted.forEach((id) => { delete node.ids[id]; });
    return { node, evicted };
  }
}

class WbAccountProfile extends AccountGameProfile<WbAccountReport, WbAccountPlan, WbAccountStatsNode, WbAccountRecentEntry, null> {
  readonly gameKey = "waterballoon";
  private mainChanged = true;

  matchIdOf(report: WbAccountReport): string { return report.matchId; }
  rankFields(node: WbAccountStatsNode): AccountRankFields { return { g: node.g, w: node.w, x: node.kl }; }
  extraPatch(user: PortalUser, extraRaw: unknown, node: WbAccountStatsNode): Record<string, unknown> { return this.mainChanged ? super.extraPatch(user, extraRaw, node) : {}; }
  planOf(report: WbAccountReport): WbAccountPlan { return new WbAccountPlan(report); }
  encodeRecent(report: WbAccountReport, key: string, win: boolean): object { return WbAccountCodec.encode(report, key, win); }
  decodeRecent(raw: unknown): WbAccountRecentEntry | null { return WbAccountCodec.decode(raw); }
  normalizeStats(raw: unknown): WbAccountStatsNode { return WbAccountMath.normalize(raw); }

  applyStats(raw: unknown, report: WbAccountReport, plan: WbAccountPlan, key: string, at: number): AccountStatsChangeBase<WbAccountStatsNode> | null {
    const change = WbAccountMath.apply(raw, report, plan.win, key, at);
    if (!change) return null;
    this.mainChanged = plan.countsMain;
    const node = change.node;
    const patch: Record<string, unknown> = {};
    if (plan.countsMain) WbAccountKeys.NUMBERS.forEach((name) => { patch[name] = node[name]; });
    if (plan.countsRandom) patch.rm = Object.assign({}, node.rm);
    patch["ids/" + key] = node.ids[key];
    change.evicted.forEach((id) => { patch["ids/" + id] = null; });
    return { node, patch };
  }
}

class WbAccountView implements AccountDialogView<WbAccountStatsNode, WbAccountRecentEntry> {
  readonly title = "물풍선 대작전";
  readonly emptyRecent = "아직 기록된 온라인 경기가 없어요.";

  statsHtml(node: WbAccountStatsNode | null): string {
    const s = node || WbAccountMath.empty();
    const rows = [
      ["가둔 수", String(s.tp), AccountHtml.average(s.tp, s.g, 1)],
      ["처치", String(s.kl), AccountHtml.average(s.kl, s.g, 1)],
      ["구출 (팀전)", String(s.rs), AccountHtml.average(s.rs, s.gt, 1)],
      ["부순 상자", String(s.bx), AccountHtml.average(s.bx, s.g, 1)],
      ["자폭", String(s.sk), AccountHtml.average(s.sk, s.g, 1)]
    ];
    return AccountHtml.record(s.g, s.w, s.l)
      + AccountHtml.grid([
        ["평균 순위", s.g ? AccountHtml.average(s.rk, s.g, 1) + "위" : "—"],
        ["평균 생존 시간", s.g ? AccountHtml.minutes(s.sv / s.g) : "—"],
        ["한 판 최다 처치", String(s.mk)],
        ["개인전 / 팀전", s.gs + "판 / " + s.gt + "판"]
      ])
      + AccountHtml.table(["항목", "합계", "판당 평균"], rows)
      + '<div class="asd-sec">봇 없이 사람끼리 한 온라인 경기만 세요. 1위가 승리예요.</div>';
  }

  blockBodyHtml(entry: WbAccountRecentEntry): string {
    const me = entry.players[entry.myIndex];
    const units = entry.mode === "team" ? new Set(entry.players.map((p) => p.team)).size : entry.players.length;
    return WbAccountKeys.MODE_NAMES[WbAccountKeys.modeIndex(entry.mode)] + " · " + me.rank + "위/" + units + (entry.mode === "team" ? "팀" : "명") + " · 생존 " + AccountHtml.minutes(me.secs)
      + "<br>가둔 수 " + me.traps + " · 처치 " + me.kills + (entry.mode === "team" ? " · 구출 " + me.rescues : "");
  }

  resultTitle(entry: WbAccountRecentEntry): string {
    const rank = entry.players[entry.myIndex].rank;
    return rank === 1 ? "우승! 🏆" : rank + "위";
  }

  resultHtml(entry: WbAccountRecentEntry): string {
    const team = entry.mode === "team";
    const order = entry.players.map((p, index) => ({ p, index })).sort((a, b) => (a.p.rank - b.p.rank) || (a.index - b.index));
    const rows = order.map((item) => {
      const p = item.p;
      const cells = [String(p.rank), (p.ai ? "🤖 " : "") + AccountHtml.esc(p.name) + (item.index === entry.myIndex ? " (나)" : ""), String(p.traps), String(p.kills)]
        .concat(team ? [String(p.rescues)] : []).concat([String(p.boxes), String(p.selfKills)]);
      return item.index === entry.myIndex ? cells.map((cell) => '<b class="asd-result-mine">' + cell + "</b>") : cells;
    });
    return AccountHtml.table(["순위", "이름", "가둔 수", "처치"].concat(team ? ["구출"] : []).concat(["상자", "자폭"]), rows);
  }
}

class WbReportBuilder {
  static fromEnd(matchId: string, match: WbMatchRecord, end: WbEndRecord, myId: string, random = false): WbAccountReport {
    const members = match.teams.flatMap((team) => team.members.map((member) => ({ member, team: team.color })));
    const players = members.map((item, index) => {
      const stat = (end.stats && end.stats[index]) || [];
      const out = end.outTicks[index];
      const ticks = out >= 0 ? out : end.endTick || 0;
      return { name: item.member.nick, team: item.team, rank: end.ranks[index] || members.length, secs: ticks / WbBalance.RATE, kills: stat[0] || 0, traps: stat[1] || 0,
        rescues: stat[2] || 0, boxes: stat[3] || 0, selfKills: stat[4] || 0, left: false, ai: item.member.bot };
    });
    return { matchId, mode: match.mode, myIndex: members.findIndex((item) => item.member.id === myId), players, progress: 1, iLeft: false, random };
  }

  static fromEngine(matchId: string, engine: WbEngine, myIndex: number, progress: number, random = false): WbAccountReport {
    const ranks = WbScoreboard.ranks(engine);
    const players = engine.players.map((p) => ({ name: p.nick, team: p.team, rank: ranks[p.index], secs: (p.outTick >= 0 ? p.outTick : engine.tick) / WbBalance.RATE, kills: p.kills, traps: p.traps,
      rescues: p.rescues, boxes: p.boxes, selfKills: p.selfKills, left: p.index === myIndex, ai: p.bot }));
    return { matchId, mode: engine.mode, myIndex, players, progress, iLeft: true, random };
  }
}

class WbAccount extends AccountGameAccount<WbAccountReport, WbAccountPlan, WbAccountStatsNode, WbAccountRecentEntry> {
  constructor() {
    super(new WbAccountProfile(), new WbAccountView());
  }
}
