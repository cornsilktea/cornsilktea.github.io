const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const files = ["match-kit.js", "account-match-kit.js", "account-stats.js", "24.turbo-lap-stats.js", "25.fps-survival-stats.js", "31.zombie-outbreak-stats.js", "38.snow-account.js", "39.balloon-account.js", "teambattle-stats-repair.js", "teambattle-mvp-lab.js"];
const names = ["AccountNumbers", "AccountRates", "AccountMatchKey", "AccountKeyLedger", "AccountForfeit", "AccountShape", "AccountRecentHeadCodec", "RecentMatchRing", "AccountLoginNotice", "RecentBlockList", "AccountGameProfile", "AccountMatchStore",
  "TeamBattleRates", "AccountMvpJudge", "TeamBattlePlan", "TeamBattleCodec", "TeamBattleRing", "AccountStatsMath", "AccountStatsTable", "ClassStatsSummary", "TeamBattleProfile", "AccountStatsStore",
  "TurboLapPlan", "TurboLapCodec", "TurboLapStatsMath", "TurboLapProfile", "TurboLapStatsView", "FpsPlan", "FpsCodec", "FpsStatsMath", "FpsProfile", "FpsStatsView",
  "ZombiePlan", "ZombieCodec", "ZombieStatsMath", "ZombieProfile", "ZombieStatsView", "SnAccountPlan", "SnAccountCodec", "SnAccountMath", "SnAccountProfile", "SnAccountView", "SnReportBuilder",
  "WbAccountPlan", "WbAccountCodec", "WbAccountMath", "WbAccountProfile", "WbAccountView", "WbReportBuilder",
  "AccountClassRank", "RandomMatchPlan", "RandomMatchCodec", "RandomMatchMath", "RandomMatchProfile", "RandomMatchView",
  "AccountPendingCodec", "AccountMatchSender", "AccountPendingGuard", "MkStreakMath", "TeamBattleRepairPlanner", "TeamBattleRepairNames", "TurboLapClock", "MvpLabCollector", "MvpLabAudit", "MvpLabBackup", "MvpLabStats", "MvpWeightFitter", "MvpFormulaReport", "CurrentMvpFormula", "TeamShareMvpFormula", "MvpLabMatch", "TeamBattleScore"];
const src = files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n;({" + names.join(",") + "})";
const K = vm.runInNewContext(src, { console, Math, Set, Map, Array, Object, Number, String, JSON, isFinite, Date, Promise, window: {}, WbBalance: { RATE: 30 } });

let passed = 0;
const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function line(name, team, char, extra) {
  return Object.assign({ name, team, char, kills: 0, deaths: 0, assists: 0, dmg: 0, heal: 0, blocked: 0, stun: 0, slow: 0, slowWeight: 0, left: false, ai: false }, extra || {});
}
function players(extra) {
  const chars = ["warrior", "knight", "ranger", "mage", "rogue", "necro"];
  return ["가", "나", "다", "라", "마", "바"].map((n, i) => line(n, i < 3 ? 0 : 1, chars[i], (extra || {})[i]));
}
function report(extra) {
  return Object.assign({ matchId: "room1_1000", mode: "cup", winnerTeam: 0, myIndex: 0, players: players({ 0: { kills: 3, dmg: 900 }, 1: { kills: 1, dmg: 300 } }), score: [4, 1], progress: 1, iLeft: false }, extra || {});
}
const judge = new K.AccountMvpJudge((l) => l.kills * 100 + l.dmg);
function fakeStore(data) {
  const writes = [];
  const database = { read: (p) => Promise.resolve(data[p] === undefined ? null : JSON.parse(JSON.stringify(data[p]))), updateRoot: (v) => { writes.push(v); return Promise.resolve(); } };
  return { store: new K.AccountStatsStore(database, { uid: "u1", name: "홍길동", email: "a@b", getToken: () => Promise.resolve("") }), writes };
}

check("숫자: 이동 평균은 0.1 단위", K.AccountNumbers.runningAverage(2, 1, 3) === 2.5 && K.AccountNumbers.runningAverage(0, 0, 4.26) === 4.3);
check("숫자: count 는 음수·비숫자를 0으로", K.AccountNumbers.count(-3) === 0 && K.AccountNumbers.count("x") === 0 && K.AccountNumbers.count(3.9) === 3);
check("비율: 분모 0 이면 null", K.AccountRates.ratio(1, 0) === null && K.AccountRates.winRate({ w: 5, g: 8 }) === 0.625 && K.TeamBattleRates.mvpRate({ m: 2, g: 8 }) === 0.25);
check("경기 열쇠: 금지 문자 치환·60자 제한·빈 값", K.AccountMatchKey.of("a.b#c/d e") === "a_b_c_d_e" && K.AccountMatchKey.of("x".repeat(99)).length === 60 && K.AccountMatchKey.of("") === "match");
check("절반 규칙: 절반 전에 나가면 기록 없음, 절반부터는 기록", K.AccountForfeit.leftEarly(true, 0.49) && !K.AccountForfeit.leftEarly(true, 0.5) && !K.AccountForfeit.leftEarly(false, 0.1));

{
  const ids = {};
  for (let i = 0; i < K.AccountKeyLedger.KEEP + 2; i++) ids["k" + i] = 100 + i;
  check("열쇠 보관: 가장 오래된 것부터 넘침", same(K.AccountKeyLedger.overflowKeys(ids), ["k0", "k1"]));
}

{
  const stored = {};
  let ok = true;
  for (let i = 0; i < K.RecentMatchRing.SLOTS; i++) {
    const slot = K.RecentMatchRing.chooseSlot(stored, "m" + i);
    if (slot !== i) ok = false;
    stored[slot] = Object.assign(K.AccountRecentHeadCodec.encode(1, "m" + i, true), { at: 1000 + (i === 4 ? -500 : i) });
  }
  check("20칸 링: 칸 수 20", K.RecentMatchRing.SLOTS === 20);
  check("20칸 링: 빈 칸부터 채움", ok);
  check("20칸 링: 21번째는 가장 오래된 칸", K.RecentMatchRing.chooseSlot(stored, "m20") === 4);
  check("20칸 링: 같은 열쇠는 무시", K.RecentMatchRing.chooseSlot(stored, "m7") === -1);
  const full = {};
  for (let i = 0; i < 20; i++) full[i] = Object.assign(JSON.parse(JSON.stringify(K.TeamBattleCodec.encode(report(), "m" + i, true))), { at: 1000 + i });
  full[9] = { v: 99, id: "x", at: 5 };
  full[20] = Object.assign(JSON.parse(JSON.stringify(full[0])), { at: 9999 });
  const list = K.TeamBattleRing.entries(full);
  check("20칸 링: 모르는 버전·20번 넘는 칸은 건너뛰고 최신순", list.length === 19 && list[0].at === 1019 && list[18].at === 1000, list.map((e) => e.at));
}

{
  const head = K.AccountRecentHeadCodec.encode(3, "abc", false);
  check("공통 머리: 왕복", head.v === 3 && head.id === "abc" && head.r === 0 && same(head.at, { ".sv": "timestamp" }));
  const back = K.AccountRecentHeadCodec.decode(Object.assign({}, head, { at: 1700 }), 3);
  check("공통 머리: 되살리기와 버전 검사", back.id === "abc" && back.at === 1700 && back.win === false && K.AccountRecentHeadCodec.decode(head, 2) === null);
}

{
  const half = K.TeamBattlePlan.FORFEIT_AT;
  const pure = new K.TeamBattlePlan(report(), judge);
  check("30번 판정: AI 없는 대회모드는 최근 매치·누적 모두", pure.recordsRecent && pure.countsStats && pure.win && pure.mvp);
  const withAi = new K.TeamBattlePlan(report({ players: players({ 4: { ai: true } }) }), judge);
  check("30번 판정: AI 포함은 최근 매치만", withAi.recordsRecent && !withAi.countsStats && withAi.withAi);
  check("30번 판정: 연습·일반 모드는 기록 없음", !new K.TeamBattlePlan(report({ mode: "pvp" }), judge).recordsRecent);
  const late = new K.TeamBattlePlan(report({ iLeft: true, progress: half, winnerTeam: -1 }), judge);
  check("30번 판정: 절반 뒤 나가기 = 패배", late.recordsRecent && late.countsStats && !late.win && !late.mvp);
  check("30번 판정: 절반 전 나가기 = 기록 없음", !new K.TeamBattlePlan(report({ iLeft: true, progress: half - 0.01 }), judge).recordsRecent);
}

{
  const ch = "warrior";
  const l1 = line("나", 0, ch, { kills: 3, deaths: 1, assists: 2, dmg: 1000, blocked: 10, stun: 1.2, slow: 0.4 });
  const l2 = line("나", 1, ch, { kills: 1, deaths: 3, dmg: 501, slow: 1 });
  const c1 = K.AccountStatsMath.apply(null, l1, { key: "k1", win: true, side: 0, mvp: true, at: 1 });
  const c2 = K.AccountStatsMath.apply(JSON.parse(JSON.stringify(c1.node)), l2, { key: "k2", win: false, side: 1, mvp: false, at: 2 });
  const n = c2.node, c = n.c[ch];
  check("누적: 판·승·진영·MVP 합산", n.g === 2 && n.w === 1 && n.l === 1 && n.bg === 1 && n.bw === 1 && n.rg === 1 && n.rw === 0 && n.m === 1, n);
  check("누적: 캐릭터 이동 평균", c.n === 2 && c.k === 2 && c.d === 2 && c.a === 1 && c.dmg === 750.5 && c.bl === 5 && c.st === 0.6 && c.sl === 0.7, c);
  check("누적: 같은 열쇠는 두 번 올라가지 않음", K.AccountStatsMath.apply(n, l2, { key: "k1", win: true, side: 0, mvp: true, at: 3 }) === null);
}

{
  const entries = [report(), report({ players: players({ 0: { kills: 2 }, 4: { ai: true }, 2: { left: true } }), winnerTeam: 1, score: [1, 6] })];
  let ok = true;
  entries.forEach((r, i) => {
    const stored = JSON.parse(JSON.stringify(K.TeamBattleCodec.encode(r, "k" + i, i === 0)));
    stored.at = 1700000000000;
    const back = K.TeamBattleCodec.decode(stored);
    const lines = back.players;
    if (!back || back.win !== (i === 0) || back.myIndex !== r.myIndex || back.score.join() !== r.score.join() || back.withAi !== r.players.some((p) => p.ai)) ok = false;
    r.players.forEach((p, j) => { Object.keys(p).forEach((key) => { if (lines[j][key] !== p[key]) ok = false; }); });
    if (JSON.stringify(stored).length > 500) ok = false;
    if (K.TeamBattleCodec.decode(Object.assign({}, stored, { v: 2 })) !== null) ok = false;
  });
  check("30번 값 배열: 저장 → 되살리기가 원래와 같고 500바이트 이하", ok);
}

{
  const lineWithLongName = line("가".repeat(30), 0, "warrior", { dmg: 1234.6, stun: 1.26, slowWeight: 0.4567 });
  const back = K.TeamBattleCodec.decodeLine(JSON.parse(JSON.stringify(K.TeamBattleCodec.encodeLine(lineWithLongName))));
  check("30번 값 배열: 이름 20자·소수 자릿수 반올림", back.name.length === 20 && back.dmg === 1235 && back.stun === 1.3 && back.slowWeight === 0.46, back);
}

{
  const html = K.RecentBlockList.html([{ id: "a", at: 0, win: true }, { id: "b", at: 0, win: false }], (e, i) => "<i>" + i + "</i>");
  check("최근 매치 블록: 승리·패배 클래스와 순번", html.indexOf('class="rmItem win" data-recent="0"') >= 0 && html.indexOf('class="rmItem lose" data-recent="1"') >= 0 && html.indexOf("<b>승리</b>") >= 0 && html.indexOf("<b>패배</b>") >= 0);
}

const done = (async () => {
  const first = fakeStore({ "profile/cls": "2-5" });
  const status = await first.store.record(report(), judge);
  const w = first.writes[0] || {};
  check("저장: 쓰기 1번에 최근 매치·누적·반 요약", status === "stats" && first.writes.length === 1);
  check("저장: 최근 매치 경로는 recent/teambattle/<칸>", !!w["users/u1/recent/teambattle/0"] && w["users/u1/recent/teambattle/0"].r === 1 && !w["users/u1/recent/0"]);
  check("저장: 누적 경로는 stats/teambattle", w["users/u1/stats/teambattle/g"] === 1 && !!w["users/u1/stats/teambattle/ids/room1_1000"]);
  check("저장: 반 요약", !!w["classStats/2-5/u1"] && w["classStats/none/u1"] === null && w["classStats/2-5/u1"].n === "홍길동");

  const ai = fakeStore({});
  const aiStatus = await ai.store.record(report({ players: players({ 0: { kills: 3 }, 5: { ai: true } }) }), judge);
  check("저장: AI 경기는 최근 매치만", aiStatus === "recent" && same(Object.keys(ai.writes[0]), ["users/u1/recent/teambattle/0"]));

  const dup = fakeStore({ "recent/teambattle": { 0: first.writes[0]["users/u1/recent/teambattle/0"] } });
  const dupStatus = await dup.store.record(report(), judge);
  check("저장: 같은 경기는 쓰기 없음", dupStatus === "duplicate" && dup.writes.length === 0);

  const early = fakeStore({});
  const earlyStatus = await early.store.record(report({ iLeft: true, progress: 0.3 }), judge);
  check("저장: 절반 전 나가기는 쓰기 없음", earlyStatus === "skip" && early.writes.length === 0);

  const loaded = await fakeStore({ "stats/teambattle": { g: 2, w: 1, l: 1, bg: 2, bw: 1, rg: 0, rw: 0, m: 1 } }).store.loadStats();
  check("읽기: 누적 통계 불러오기", loaded && loaded.g === 2 && loaded.w === 1);
  check("읽기: 통계가 없으면 null", (await fakeStore({}).store.loadStats()) === null);
  const stored = Object.assign(JSON.parse(JSON.stringify(K.TeamBattleCodec.encode(report(), "k", true))), { at: 5 });
  const recent = await fakeStore({ "recent/teambattle": { 3: stored } }).store.loadRecent();
  check("읽기: 최근 매치 불러오기", recent.length === 1 && recent[0].win === true && recent[0].players.length === 6);
})();


const RULES = JSON.parse(fs.readFileSync(path.join(root, "데이터베이스규칙.json"), "utf8")).rules.users.$uid;
String.prototype.matches = function (re) { return re.test(String(this)); };
const RULE_NOW = 1700000000000;
const RANK_RULES = JSON.parse(fs.readFileSync(path.join(root, "데이터베이스규칙.json"), "utf8")).rules.gameRanks;

class RuleNode {
  constructor(v) { this.v = v === null ? undefined : v; }
  val() { return this.v && this.v[".sv"] ? RULE_NOW : this.v === undefined ? null : this.v; }
  exists() { return this.v !== undefined; }
  child(name) { return new RuleNode(this.v && typeof this.v === "object" ? this.v[name] : undefined); }
  hasChildren(list) { return !!this.v && typeof this.v === "object" && list.every((k) => this.v[k] !== undefined && this.v[k] !== null); }
  isNumber() { return typeof this.v === "number"; }
  isString() { return typeof this.v === "string"; }
  isBoolean() { return typeof this.v === "boolean"; }
}

class RuleChecker {
  static evaluate(expr, nv, ov, given) {
    const vars = Object.assign({ auth: { uid: "u1" } }, given);
    const names = Object.keys(vars);
    return !!new Function("newData", "data", "now", ...names, "return (" + expr + ");")(new RuleNode(nv), new RuleNode(ov), RULE_NOW, ...names.map((n) => vars[n]));
  }
  static validate(rule, nv, ov, vars, label, errors) {
    if (typeof rule[".validate"] === "string" && !RuleChecker.evaluate(rule[".validate"], nv, ov, vars)) errors.push(label + " :: " + rule[".validate"].slice(0, 90));
    if (!nv || typeof nv !== "object" || nv[".sv"]) return;
    Object.keys(nv).forEach((key) => {
      const exact = rule[key], wild = Object.keys(rule).find((k) => k[0] === "$");
      const childRule = exact && typeof exact === "object" ? exact : wild ? rule[wild] : null;
      if (!childRule) return;
      const old = ov && typeof ov === "object" ? ov[key] : undefined;
      if (old !== undefined && JSON.stringify(old) === JSON.stringify(nv[key])) return;
      RuleChecker.validate(childRule, nv[key], old, Object.assign({}, vars, !exact && wild ? { [wild]: key } : {}), label + "/" + key, errors);
    });
  }
  static checkRanks(key, writes, errors) {
    const rule = RANK_RULES.$game.$cls.$uid;
    Object.keys(writes).filter((k) => k.indexOf("gameRanks/") === 0 && writes[k] !== null).forEach((k) => {
      const [, game, cls, uid] = k.split("/");
      const stats = RuleChecker.after({}, writes, "users/u1/stats/" + key + "/");
      const parentChain = { parent: () => ({ parent: () => ({ parent: () => ({ parent: () => ({ child: (n) => new RuleNode(n === "users" ? { u1: { stats: { [key]: stats } } } : undefined) }) }) }) }) };
      const node = new RuleNode(writes[k]);
      node.parent = parentChain.parent;
      const ok = new Function("newData", "auth", "$game", "$cls", "$uid", "return (" + rule[".validate"] + ");")(node, { uid: "u1" }, game, cls, uid);
      if (!ok) errors.push("gameRanks/" + game + "/" + cls + " :: 순위 요약이 누적 통계와 다름");
    });
  }
  static after(base, writes, prefix) {
    const out = JSON.parse(JSON.stringify(base === undefined ? {} : base));
    Object.keys(writes).filter((k) => k.indexOf(prefix) === 0).forEach((k) => {
      const parts = k.slice(prefix.length).split("/");
      let node = out;
      parts.slice(0, -1).forEach((part) => { node = node[part] = node[part] || {}; });
      if (writes[k] === null) delete node[parts[parts.length - 1]]; else node[parts[parts.length - 1]] = JSON.parse(JSON.stringify(writes[k]));
    });
    return out;
  }
  static check(key, writes, baseStats, baseRecent) {
    const errors = [];
    RuleChecker.checkRanks(key, writes, errors);
    const stats = RuleChecker.after(baseStats, writes, "users/u1/stats/" + key + "/");
    if (Object.keys(writes).some((k) => k.indexOf("users/u1/stats/" + key + "/") === 0)) RuleChecker.validate(RULES.stats[key], stats, baseStats, {}, "stats/" + key, errors);
    const slots = {};
    Object.keys(writes).filter((k) => k.indexOf("users/u1/recent/" + key + "/") === 0).forEach((k) => { slots[k.split("/").pop()] = JSON.parse(JSON.stringify(writes[k])); });
    RuleChecker.validate(RULES.recent[key], slots, baseRecent || {}, {}, "recent/" + key, errors);
    return { errors, stats, slots };
  }
}
class GameCase {
  constructor(name, profile, codec, key) { this.name = name; this.profile = profile; this.codec = codec; this.key = key; }
  roundTrip(report, win) {
    const stored = JSON.parse(JSON.stringify(this.codec.encode(report, "k1", win)));
    stored.at = 1700000000000;
    return { stored, back: this.codec.decode(stored), size: JSON.stringify(stored).length };
  }
  store(data) {
    const writes = [];
    const database = { read: (p) => Promise.resolve(data[p] === undefined ? null : JSON.parse(JSON.stringify(data[p]))), updateRoot: (v) => { writes.push(v); return Promise.resolve(); } };
    return { store: new K.AccountMatchStore(database, { uid: "u1", name: "홍", email: "a@b", getToken: () => Promise.resolve("") }, this.profile), writes };
  }
  async verifyStore(report, ctx) {
    const first = this.store({});
    const status = await first.store.record(report, null);
    const w = first.writes[0] || {};
    check(this.name + " 저장: 쓰기 1번·경로 recent/" + this.key + "/0 · stats/" + this.key, status === "stats" && first.writes.length === 1 && !!w["users/u1/recent/" + this.key + "/0"] && Object.keys(w).some((k) => k.indexOf("users/u1/stats/" + this.key + "/g") === 0), Object.keys(w));
    const rank = w["gameRanks/" + this.key + "/none/u1"];
    check(this.name + " 저장: 같은 PATCH 에 반별 순위 요약(gameRanks/" + this.key + "/none)", !!rank && rank.g === 1 && rank.n === "홍" && typeof rank.x === "number", rank);
    const dup = this.store({ ["recent/" + this.key]: { 0: w["users/u1/recent/" + this.key + "/0"] } });
    check(this.name + " 저장: 같은 경기는 쓰기 없음", (await dup.store.record(report, null)) === "duplicate" && dup.writes.length === 0);
    const loaded = await this.store({ ["recent/" + this.key]: { 3: Object.assign(JSON.parse(JSON.stringify(w["users/u1/recent/" + this.key + "/0"])), { at: 5 }) } }).store.loadRecent();
    check(this.name + " 읽기: 최근 매치 불러오기", loaded.length === 1);
    const ruled = RuleChecker.check(this.key, w, undefined, undefined);
    check(this.name + " 규칙: 첫 판 쓰기가 데이터베이스규칙.json 을 통과", ruled.errors.length === 0, ruled.errors);
    const second = this.store({ ["stats/" + this.key]: ruled.stats, ["recent/" + this.key]: ruled.slots });
    await second.store.record(Object.assign({}, report, { matchId: "second" }), null);
    const w2 = second.writes[0] || {};
    const ruled2 = RuleChecker.check(this.key, w2, ruled.stats, ruled.slots);
    check(this.name + " 규칙: 둘째 판 쓰기도 통과(판 수 +1)", second.writes.length === 1 && ruled2.errors.length === 0 && ruled2.stats.g === 2, ruled2.errors);
    const cheat = JSON.parse(JSON.stringify(w2));
    cheat["users/u1/stats/" + this.key + "/g"] = 5;
    check(this.name + " 규칙: 판 수를 한 번에 3 올리면 거부", RuleChecker.check(this.key, cheat, ruled.stats, ruled.slots).errors.length > 0);
  }}

const turbo = new GameCase("24번", new K.TurboLapProfile(), K.TurboLapCodec, "turbolap");
const turboReport = (extra) => Object.assign({ matchId: "m24", course: "seoul", result: "win", myIndex: 0,
  rows: [{ nick: "가".repeat(25), side: 0, fin: 65432, prog: 1, car: "porsche:blue", bot: false }, { nick: "나", side: 1, fin: 0, prog: 0.4217, car: "audi:red", bot: false }] }, extra || {});
{
  check("24번 판정: 사람끼리 승리는 최근·누적 모두", (() => { const p = new K.TurboLapPlan(turboReport()); return p.recordsRecent && p.countsStats && p.win; })());
  check("24번 판정: 무승부는 기록 없음", !new K.TurboLapPlan(turboReport({ result: "draw" })).recordsRecent);
  const withBot = turboReport(); withBot.rows[1].bot = true;
  check("24번 판정: AI 상대는 최근 매치만", (() => { const p = new K.TurboLapPlan(withBot); return p.recordsRecent && !p.countsStats && p.withAi; })());
  const r = turbo.roundTrip(turboReport(), true);
  check("24번 값 배열: 왕복(이름 20자·진행률 ‰·차량·완주 기록)", r.back.course === "seoul" && r.back.rows[0].nick.length === 20 && r.back.rows[0].fin === 65432 && Math.abs(r.back.rows[1].prog - 0.422) < 1e-9 && r.back.rows[0].car === "porsche:blue" && r.back.win && r.size < 500, r.size);
  const a = K.TurboLapStatsMath.apply(null, turboReport(), true, "k1", 1);
  const b = K.TurboLapStatsMath.apply(JSON.parse(JSON.stringify(a.node)), turboReport({ myIndex: 1, matchId: "m2" }), false, "k2", 2);
  check("24번 누적: 판·승·패·완주·코스별 시간 합계", b.node.g === 2 && b.node.w === 1 && b.node.l === 1 && b.node.f === 1 && b.node.c.seoul.g === 2 && b.node.c.seoul.tm === 65432, b.node);
  check("24번 누적: 같은 열쇠는 무시", K.TurboLapStatsMath.apply(b.node, turboReport(), true, "k1", 3) === null);
}

const fps = new GameCase("25번", new K.FpsProfile(), K.FpsCodec, "fpsbattle");
const fpsReport = (extra) => Object.assign({ matchId: "m25", myIndex: 0, winnerTeam: 0, score: [9, 5], progress: 1, iLeft: false,
  players: [{ name: "가", team: 0, kills: 5, deaths: 2, dmg: 910.4, left: false, ai: false }, { name: "나", team: 0, kills: 4, deaths: 3, dmg: 700, left: false, ai: false },
    { name: "다", team: 1, kills: 3, deaths: 5, dmg: 400, left: false, ai: false }, { name: "라", team: 1, kills: 2, deaths: 4, dmg: 300, left: false, ai: false }] }, extra || {});
{
  check("25번 판정: 사람끼리 팀 승리", (() => { const p = new K.FpsPlan(fpsReport()); return p.recordsRecent && p.countsStats && p.win; })());
  check("25번 판정: 무승부는 기록 없음, 절반 전 나가기도 없음, 절반 뒤 나가기는 패배",
    !new K.FpsPlan(fpsReport({ winnerTeam: -1 })).recordsRecent && !new K.FpsPlan(fpsReport({ iLeft: true, progress: 0.3, winnerTeam: -1 })).recordsRecent
    && (() => { const p = new K.FpsPlan(fpsReport({ iLeft: true, progress: 0.6, winnerTeam: -1 })); return p.recordsRecent && p.countsStats && !p.win; })());
  const ai = fpsReport(); ai.players[3].ai = true;
  check("25번 판정: AI 포함은 최근 매치만", (() => { const p = new K.FpsPlan(ai); return p.recordsRecent && !p.countsStats; })());
  const r = fps.roundTrip(fpsReport(), true);
  check("25번 값 배열: 왕복", r.back.players.length === 4 && r.back.players[0].dmg === 910 && r.back.players[0].kills === 5 && r.back.score.join() === "9,5" && r.size < 500, r.size);
  const a = K.FpsStatsMath.apply(null, fpsReport().players[0], true, "k1", 1);
  const b = K.FpsStatsMath.apply(JSON.parse(JSON.stringify(a.node)), fpsReport().players[1], false, "k2", 2);
  check("25번 누적: 처치·쓰러짐·피해 합계와 KDA", b.node.g === 2 && b.node.k === 9 && b.node.d === 5 && b.node.dm === 1610 && K.FpsStatsMath.kda(9, 5) === "1.80" && K.FpsStatsMath.kda(4, 0) === "Perfect" && K.FpsStatsMath.kda(0, 0) === "—", b.node);
}

const zombie = new GameCase("31번", new K.ZombieProfile(), K.ZombieCodec, "zombieoutbreak");
const zombieRows = () => [{ name: "숙주", role: 0, secs: 0, infects: 3, left: false, ai: false }, { name: "나", role: 2, secs: 180, infects: 0, left: false, ai: false },
  { name: "감염", role: 1, secs: 61, infects: 1, left: false, ai: false }, { name: "봇", role: 1, secs: 20, infects: 0, left: false, ai: true }];
const zombieReport = (extra) => Object.assign({ matchId: "m31", myIndex: 1, rows: zombieRows(), winner: 0, progress: 1, iLeft: false }, extra || {});
{
  check("31번 판정: 인간 승리 때 끝까지 생존한 사람이 승", new K.ZombiePlan(zombieReport()).win && !new K.ZombiePlan(zombieReport({ myIndex: 2 })).win && new K.ZombiePlan(zombieReport({ winner: 1, myIndex: 2 })).win && new K.ZombiePlan(zombieReport({ winner: 1, myIndex: 0 })).win);
  check("31번 판정: 봇이 있으면 최근 매치만, 절반 전 나가기는 기록 없음", (() => { const p = new K.ZombiePlan(zombieReport()); return p.recordsRecent && !p.countsStats; })() && !new K.ZombiePlan(zombieReport({ iLeft: true, progress: 0.2, winner: -1 })).recordsRecent);
  const r = zombie.roundTrip(zombieReport(), true);
  check("31번 값 배열: 왕복(역할·생존 초·감염 수)", r.back.rows.length === 4 && r.back.rows[0].role === 0 && r.back.rows[0].infects === 3 && r.back.rows[1].secs === 180 && r.back.winner === 0 && r.back.rows[3].ai && r.size < 500, r.size);
  const clean = zombieReport({ rows: zombieRows().slice(0, 3) });
  const human = K.ZombieStatsMath.apply(null, clean, true, "k1", 1).node;
  check("31번 누적: 끝까지 생존한 인간 판", human.g === 1 && human.w === 1 && human.hg === 1 && human.hw === 1 && human.zg === 0 && human.sv === 1 && human.hs === 180 && human.ls === 180, human);
  const origin = K.ZombieStatsMath.apply(JSON.parse(JSON.stringify(human)), zombieReport({ rows: zombieRows().slice(0, 3), myIndex: 0, winner: 1, matchId: "m2" }), true, "k2", 2).node;
  check("31번 누적: 숙주 좀비 판(좀비 편 승리, 감염 수·최다)", origin.og === 1 && origin.zg === 1 && origin.zw === 1 && origin.hg === 1 && origin.ik === 3 && origin.mi === 3 && origin.w === 2, origin);
  const infected = K.ZombieStatsMath.apply(JSON.parse(JSON.stringify(origin)), zombieReport({ rows: zombieRows().slice(0, 3), myIndex: 2, winner: 0, matchId: "m3" }), false, "k3", 3).node;
  check("31번 누적: 감염된 판은 인간·좀비 양쪽 판 수에 들고 생존 시간은 감염 때까지", infected.hg === 2 && infected.zg === 2 && infected.hw === 2 && infected.zw === 1 && infected.hs === 241 && infected.l === 1, infected);
}

const snow = new GameCase("38번", new K.SnAccountProfile(), K.SnAccountCodec, "snowroyale");
const snowMatch = { id: 1, seed: 2, mode: "duos", startAt: 0, teams: [{ members: [{ id: "a", nick: "A", bot: false }, { id: "b", nick: "B", bot: false }] }, { members: [{ id: "c", nick: "C", bot: false }, { id: "d", nick: "D", bot: true }] }] };
const snowEnd = { match: 1, ranks: [1, 2], at: 1, stats: [[3, 120.6, 5, 200.46, 2, 1], [1, 40, 2, 150, 0, 2], [2, 90, 3, 80, 1, 0], [0, 10, 0, 60, 0, 0]] };
{
  const report = K.SnReportBuilder.fromEnd("m38", snowMatch, snowEnd, "a");
  check("38번 보고서: 끝 기록에서 선수 줄·순위·어시스트·AI 읽기", report.players.length === 4 && report.myIndex === 0 && report.players[0].rank === 1 && report.players[2].rank === 2 && report.players[0].assists === 1 && report.players[3].ai && report.players[0].secs === 200.46, report.players[0]);
  check("38번 판정: 1위만 승, AI 포함이면 최근 매치만", (() => { const p = new K.SnAccountPlan(report); const lose = new K.SnAccountPlan(K.SnReportBuilder.fromEnd("m", snowMatch, snowEnd, "c")); return p.win && p.recordsRecent && !p.countsStats && !lose.win; })());
  const clean = JSON.parse(JSON.stringify(report)); clean.players[3].ai = false;
  const r = snow.roundTrip(clean, true);
  check("38번 값 배열: 왕복(생존 초 0.1 단위·어시스트)", r.back.players[0].secs === 200.5 && r.back.players[0].assists === 1 && r.back.players[0].dealt === 121 && r.back.mode === "duos" && r.size < 600, r.size);
  const a = K.SnAccountMath.apply(null, clean, true, "k1", 1);
  const b = K.SnAccountMath.apply(JSON.parse(JSON.stringify(a.node)), K.SnReportBuilder.fromEnd("m2", snowMatch, snowEnd, "c"), false, "k2", 2);
  check("38번 누적: 킬·어시·피해·벽·생존·순위 합계", b.node.g === 2 && b.node.w === 1 && b.node.k === 5 && b.node.a === 1 && b.node.dm === 211 && b.node.wl === 3 && b.node.sv === 280 && b.node.rk === 3 && b.node.t3 === 2 && b.node.mk === 3 && b.node.gd === 2, b.node);
  const forfeit = K.SnReportBuilder.fromEnd("m3", snowMatch, snowEnd, "a"); forfeit.iLeft = true; forfeit.progress = 0.3;
  check("38번 판정: 절반 전 나가기는 기록 없음", !new K.SnAccountPlan(forfeit).recordsRecent);
}

const balloon = new GameCase("39번", new K.WbAccountProfile(), K.WbAccountCodec, "waterballoon");
const wbMatch = { id: 1, seed: 2, mode: "team", map: "classroom", startAt: 0, teams: [{ color: 0, members: [{ id: "a", nick: "A", bot: false }, { id: "b", nick: "B", bot: false }] }, { color: 1, members: [{ id: "c", nick: "C", bot: false }, { id: "d", nick: "D", bot: false }] }] };
const wbEnd = { match: 1, ranks: [1, 1, 2, 2], outTicks: [-1, 600, 300, 450], at: 1, stats: [[2, 3, 1, 4, 0], [0, 1, 0, 2, 1], [1, 1, 0, 0, 0], [0, 0, 1, 1, 0]], endTick: 900 };
{
  const report = K.WbReportBuilder.fromEnd("m39", wbMatch, wbEnd, "a");
  check("39번 보고서: 끝 기록에서 순위·생존 초·항목 읽기(끝까지 남은 사람은 끝 시각)", report.players.length === 4 && report.players[0].secs === 30 && report.players[1].secs === 20 && report.players[0].traps === 3 && report.players[0].rescues === 1 && report.players[2].rank === 2 && report.players[2].team === 1, report.players);
  check("39번 판정: 1위 편이 승", new K.WbAccountPlan(report).win && new K.WbAccountPlan(report).countsStats && !new K.WbAccountPlan(K.WbReportBuilder.fromEnd("m", wbMatch, wbEnd, "c")).win);
  const r = balloon.roundTrip(report, true);
  check("39번 값 배열: 왕복", r.back.players[0].traps === 3 && r.back.players[0].boxes === 4 && r.back.mode === "team" && r.back.players[1].secs === 20 && r.size < 600, r.size);
  const a = K.WbAccountMath.apply(null, report, true, "k1", 1);
  const b = K.WbAccountMath.apply(JSON.parse(JSON.stringify(a.node)), K.WbReportBuilder.fromEnd("m2", wbMatch, wbEnd, "c"), false, "k2", 2);
  check("39번 누적: 가둔 수·처치·구출·상자·생존·순위 합계", b.node.g === 2 && b.node.tp === 4 && b.node.kl === 3 && b.node.rs === 1 && b.node.bx === 4 && b.node.sv === 40 && b.node.rk === 3 && b.node.gt === 2 && b.node.mk === 2, b.node);
}

const randomReport = (extra) => Object.assign({ matchId: "rm1", result: "win", rank: 2, of: 6, map: "맵".repeat(25), rivals: ["가".repeat(25), "나"] }, extra || {});
{
  const p = (extra) => new K.RandomMatchPlan(randomReport(extra));
  check("랜덤 매칭 승패: 승리는 최근·누적 모두", p().recordsRecent && p().countsStats && p().win);
  check("랜덤 매칭 승패: 무승부는 기록 없음, 상대가 모두 AI 면 최근 매치만", !p({ result: "draw" }).recordsRecent && p({ rivals: [] }).recordsRecent && !p({ rivals: [] }).countsStats);
  const stored = JSON.parse(JSON.stringify(K.RandomMatchCodec.encode(randomReport(), "k1", true))); stored.at = 1700000000000;
  const back = K.RandomMatchCodec.decode(stored);
  check("랜덤 매칭 승패: 값 배열 왕복(이름·맵 20자, 순위)", back.rank === 2 && back.of === 6 && back.map.length === 20 && back.rivals[0].length === 20 && back.rivals[1] === "나" && back.win && !back.withAi, back);
  const a = K.RandomMatchMath.apply(null, randomReport(), true, "k1", 1), b = K.RandomMatchMath.apply(a.node, randomReport({ rank: 5 }), false, "k2", 2);
  check("랜덤 매칭 승패: 누적 판·승·패·3위 안", b.node.g === 2 && b.node.w === 1 && b.node.l === 1 && b.node.t === 1 && K.RandomMatchMath.apply(b.node, randomReport(), true, "k1", 3) === null, b.node);
  const ticket = { matchId: "t1", room: "12345", side: 0, host: "h", expect: 2, rivals: ["표상대"], map: "해변" };
  const fromTicket = K.RandomMatchCodec.fromOutcome(ticket, { result: "lose", rank: 3, of: 4 });
  check("랜덤 매칭 승패: 표·결과에서 보고서 만들기(상대 없으면 표의 상대)", fromTicket.matchId === "t1" && fromTicket.rivals[0] === "표상대" && fromTicket.map === "해변" && fromTicket.rank === 3, fromTicket);
  const view = new K.RandomMatchView("제목", true);
  check("랜덤 매칭 승패: 통계 창 글자(승패·3위 안)", view.statsHtml(b.node).indexOf("3위 안") >= 0 && view.blockBodyHtml(back).indexOf("vs ") === 0);
  const user = { uid: "u1", name: "20104 홍길동", email: "a@b" };
  const rankPatch = K.AccountClassRank.patch("soccer", user, "2-5", { g: 3, w: 2, x: 0 });
  check("반별 순위 요약: 반 칸에 쓰고 미분류 칸은 지움", rankPatch["gameRanks/soccer/2-5/u1"].g === 3 && rankPatch["gameRanks/soccer/none/u1"] === null && K.AccountClassRank.classKey("3-1") === "none");
}
check("24번 결과 시간: 0.01초까지 같은 기록끼리만 0.001초까지", K.TurboLapClock.text(62341, [62341, 62348]) === "1:02.341" && K.TurboLapClock.text(62348, [62341, 62348]) === "1:02.348" && K.TurboLapClock.text(63000, [62341, 63000]) === "1:03.00" && K.TurboLapClock.text(65009, [65009, 65001, 70000]) === "1:05.009" && K.TurboLapClock.text(70000, [65009, 65001, 70000]) === "1:10.00" && K.TurboLapClock.text(62341, [62341, 0]) === "1:02.34");
/* 30번 통계 정상화(2026-10-29): 다른 학생의 최근 매치에 남은 판으로 빠진 학생을 채운다 */
(() => {
  const TEACHER = { uid: "use16pcii5RbEATuPtWhRDArmoj2" };
  const base = report({ players: players({ 0: { kills: 3, dmg: 900 }, 2: { kills: 1, dmg: 200 }, 4: { left: true, dmg: 50 } }) });
  const stored = (me, win, at) => Object.assign(JSON.parse(JSON.stringify(K.TeamBattleCodec.encode(Object.assign({}, base, { myIndex: me }), "room1_1000", win))), { at });
  const user = (name, cls, extra) => Object.assign({ profile: { name, cls } }, extra || {});
  const users = {
    ua: user("20101 가", "2-1", { recent: { teambattle: { 0: stored(0, true, 5000) } }, stats: { teambattle: { g: 1, w: 1, l: 0, bg: 1, bw: 1, rg: 0, rw: 0, m: 1, ids: { room1_1000: 5000 } } } }),
    ub: user("20102 나", "2-1", { recent: { teambattle: { 0: stored(1, true, 5001) } } }),
    uc: user("20103 다", "2-1", { pending: { teambattle: { id: "room1_1000", rep: "{}" } } }),
    ud: user("20104 라", "2-1"),
    ue: user("20105 마", "2-1"),
    ue2: user("20201 마", "2-2"),
    uf: user("20106 바", "2-1"),
    uf2: user("20107 바", "2-1")
  };
  const plan = new K.TeamBattleRepairPlanner(true).plan(users);
  const fixOf = (uid) => plan.fixes.find((f) => f.uid === uid);
  const patch = plan.patch();
  const c = fixOf("uc"), d = fixOf("ud"), e = fixOf("ue");
  check("정상화: 닉네임은 학번 떼고 4자", K.TeamBattleRepairNames.nickOf("20101 홍길동전설") === "홍길동전" && K.TeamBattleRepairNames.nickOf("교사") === "교사");
  check("정상화: 판을 가진 학생(가·나)은 그대로, 빠진 다·라·마(같은 반)만 채움, 바는 같은 닉네임 둘이라 건너뜀",
    !fixOf("ua") && !fixOf("ub") && !!c && !!d && !!e && !fixOf("ue2") && !fixOf("uf") && plan.skips.some((x) => x.name === "바"), [plan.fixes.map((f) => f.uid), plan.skips]);
  check("정상화: 블루 다는 승리·MVP 아님(가가 MVP), 레드 라는 패배", c.additions[0].win && !c.additions[0].mvp && !d.additions[0].win && c.statsNode.g === 1 && c.statsNode.w === 1 && d.statsNode.l === 1, [c.additions, d.additions]);
  check("정상화: 나간 학생(마)은 패배로, 최근 매치 me·r 은 그 학생 기준, 시각은 원래 판 시각",
    e.additions[0].left && !e.additions[0].win && patch["users/ue/recent/teambattle/0"].me === 4 && patch["users/ue/recent/teambattle/0"].r === 0 && patch["users/uc/recent/teambattle/0"].at === 5000, patch["users/ue/recent/teambattle/0"]);
  check("정상화: 반 별 통계도 새 누적값, 같은 판 미리 적기는 지움",
    patch["classStats/2-1/uc"].g === 1 && patch["classStats/2-1/uc"].w === 1 && patch["classStats/none/uc"] === null && patch["users/uc/pending/teambattle"] === null && patch["users/ud/pending/teambattle"] === undefined);
  const noLeft = new K.TeamBattleRepairPlanner(false).plan(users);
  check("정상화: '나간 학생 넣기'를 끄면 마는 건너뜀", !noLeft.fixes.some((f) => f.uid === "ue") && noLeft.skips.some((x) => x.name === "마"));
  const again = new K.TeamBattleRepairPlanner(true).plan(Object.assign({}, users, { uc: Object.assign({}, users.uc, { stats: { teambattle: c.statsNode } }) }));
  check("정상화: 이미 채운 학생은 다시 채우지 않음", !again.fixes.some((f) => f.uid === "uc"));
  const withAi = report({ players: players({ 5: { ai: true } }) });
  const aiUsers = { ua: user("20101 가", "2-1", { recent: { teambattle: { 0: Object.assign(JSON.parse(JSON.stringify(K.TeamBattleCodec.encode(withAi, "ai_1", true))), { at: 7000 }) } } }), ub: user("20102 나", "2-1") };
  const aiFix = new K.TeamBattleRepairPlanner(true).plan(aiUsers).fixes[0];
  check("정상화: AI 판은 최근 매치만(누적 통계 그대로)", aiFix && aiFix.uid === "ub" && !aiFix.statsNode && !aiFix.additions[0].countsStats && aiFix.additions[0].intoRecent);
  const full = {}; for (let i = 0; i < 20; i++) full[i] = Object.assign({}, stored(0, true, 9000 + i), { id: "x" + i });
  const old = new K.TeamBattleRepairPlanner(true).plan(Object.assign({}, users, { uc: user("20103 다", "2-1", { recent: { teambattle: full } }) }));
  check("정상화: 최근 20칸이 모두 더 새로운 판이면 두 번 세지 않게 건너뜀", !old.fixes.some((f) => f.uid === "uc") && old.skips.some((x) => x.name === "다"));
  const errors = [];
  const before = { g: 2, w: 1, l: 1, bg: 1, bw: 1, rg: 1, rw: 0, m: 0, ids: { a: 1, b: 2 }, c: { knight: { n: 2, w: 1, bg: 1, bw: 1, rg: 1, rw: 0, m: 0, kn: 2, k: 1, d: 1, a: 1, dmg: 100, hl: 0, bl: 0, st: 0, sl: 0 } } };
  const fixed = new K.TeamBattleRepairPlanner(true).plan(Object.assign({}, users, { uc: Object.assign({}, users.uc, { stats: { teambattle: before } }) })).fixes.find((f) => f.uid === "uc").statsNode;
  RuleChecker.validate(RULES.stats.teambattle, fixed, before, { auth: TEACHER }, "stats/teambattle", errors);
  RuleChecker.validate(RULES.recent.teambattle, { 0: patch["users/uc/recent/teambattle/0"] }, {}, { auth: TEACHER }, "recent/teambattle", errors);
  check("정상화 규칙: 선생님 계정은 기존 통계에 한 번에 여러 판·옛 시각으로 써도 통과", errors.length === 0 && fixed.g === 3, errors);
  const studentErrors = [];
  RuleChecker.validate(RULES.stats.teambattle, Object.assign({}, fixed, { g: 9, l: 8 }), before, {}, "stats/teambattle", studentErrors);
  RuleChecker.validate(RULES.recent.teambattle, { 0: patch["users/uc/recent/teambattle/0"] }, {}, {}, "recent/teambattle", studentErrors);
  check("정상화 규칙: 학생 계정은 여전히 판 수 건너뛰기·옛 시각 쓰기 거부", studentErrors.length >= 2, studentErrors);
})();
/* 30번 MVP 공식 비교(2026-10-29): 결과표를 판 하나로 묶고, 공식별 점수·MVP·점검을 계산한다(읽기만) */
(() => {
  const user = (name, cls, extra) => Object.assign({ profile: { name, cls } }, extra || {});
  const base = report({ players: players({ 0: { kills: 3, dmg: 900, slowWeight: 1.5, stun: 1 }, 1: { kills: 1, assists: 2, heal: 400 }, 3: { kills: 1, dmg: 300, deaths: 2 } }) });
  const stored = (me, win, at, id, withAi) => Object.assign(JSON.parse(JSON.stringify(K.TeamBattleCodec.encode(Object.assign({}, withAi ? report({ players: players({ 5: { ai: true } }) }) : base, { myIndex: me }), id, win))), { at });
  const users = {
    ua: user("20101 가", "2-1", { recent: { teambattle: { 0: stored(0, true, 5000, "m1"), 1: stored(0, true, 6000, "m2", true) } }, stats: { teambattle: { g: 1, w: 1, l: 0, bg: 1, bw: 1, rg: 0, rw: 0, m: 1 } } }),
    ub: user("20102 나", "2-1", { recent: { teambattle: { 0: stored(1, true, 5001, "m1") } }, stats: { teambattle: { g: 2, w: 1, l: 1, bg: 1, bw: 1, rg: 1, rw: 0, m: 0 } } }),
    ud: user("20104 라", "2-1")
  };
  const lab = new K.MvpLabCollector(users);
  check("MVP 비교: 두 학생이 가진 같은 판은 한 번만, AI 판은 뺌", lab.matches.length === 1 && lab.skippedAi === 1, [lab.matches.length, lab.skippedAi]);
  const m = lab.matches[0];
  check("MVP 비교: 판의 사람은 결과표 주인 uid, 아니면 유일한 닉네임으로 uid, 없으면 닉네임", m.playerIds[0] === "ua" && m.playerIds[1] === "ub" && m.playerIds[3] === "ud" && m.playerIds[2] === "nick:다", m.playerIds);
  const current = new K.CurrentMvpFormula();
  check("MVP 비교: 지금 식은 게임 환산점수와 같은 값, 승리 보너스는 이긴 팀만", m.players.every((l) => current.score(l, m, 0) === K.TeamBattleScore.of(l)) && current.score(m.players[0], m, 0.1) === Math.round(K.TeamBattleScore.of(m.players[0]) * 1.1) && current.score(m.players[3], m, 0.1) === K.TeamBattleScore.of(m.players[3]));
  const share = new K.TeamShareMvpFormula();
  check("MVP 비교: 팀 비중 — 처치·피해를 다 한 가가 같은 팀 다보다 높음", share.score(m.players[0], m, 0) > share.score(m.players[2], m, 0) && share.score(m.players[2], m, 0) === 0, m.players.map((l) => share.score(l, m, 0)));
  const rep = new K.MvpFormulaReport(current, lab.matches, 0);
  check("MVP 비교: 보고서 — MVP 가 이긴 팀, 캐릭터별 판 수", rep.winnerMvpRate === 1 && rep.chars.warrior.games === 1 && rep.chars.warrior.mvp === 1, rep);
  check("MVP 비교: 상관 계산", Math.abs(K.MvpLabStats.pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9 && K.MvpLabStats.pearson([1, 2], [1, 2]) === null);
  const fake = [];
  for (let i = 0; i < 40; i++) {
    const dmg = (i % 7) * 120 - 300, heal = ((i * 3) % 5) * 80 - 160;
    const kills = Math.round(dmg / 200 + heal / 400 + 5);
    fake.push(new K.MvpLabMatch("f" + i, [line("a", 0, "warrior", { dmg: 1000 + dmg, heal: 500 + heal, kills: kills }), line("b", 1, "knight", { dmg: 1000, heal: 500, kills: 5 })], 0, ["a", "b"]));
  }
  const fit = K.MvpWeightFitter.fit(fake);
  check("MVP 비교: 처치 차이로 가중치 찾기(피해 0.5점·회복 0.25점 근처, 음수 없음)", fit && Math.abs(fit.weights.dmg - 0.5) < 0.08 && Math.abs(fit.weights.heal - 0.25) < 0.08 && fit.weights.blocked === 0 && fit.rSquared > 0.8, fit);
  check("MVP 비교: 판이 적으면 가중치를 찾지 않음", K.MvpWeightFitter.fit(fake.slice(0, 5)) === null);
  const audit = new K.MvpLabAudit(users);
  check("MVP 비교 점검: 누적 판 수와 AI 없는 결과표 수가 다른 학생만 표시", audit.rows.length === 2 && audit.flagged.length === 1 && audit.flagged[0].name === "20102 나", audit.rows);
  const full = {}; for (let i = 0; i < 20; i++) full[i] = stored(0, true, 9000 + i, "x" + i);
  const fullAudit = new K.MvpLabAudit({ ua: user("20101 가", "2-1", { recent: { teambattle: full }, stats: { teambattle: { g: 20, w: 20, l: 0, bg: 20, bw: 20, rg: 0, rw: 0, m: 0 } } }) });
  check("MVP 비교 점검: 결과표 20칸이 다 찬 학생 표시", fullAudit.flagged.length === 1 && fullAudit.flagged[0].full && !fullAudit.flagged[0].mismatch);
  const backup = K.MvpLabBackup.build(users, { "2-1": { ua: { n: "가", g: 1, w: 1, m: 1 } } }, Date.UTC(2026, 9, 29));
  check("MVP 비교 백업: 30번 기록이 있는 학생만, 반 별 통계 포함", Object.keys(backup.users).join() === "ua,ub" && backup.users.ua.recent.teambattle[0].id === "m1" && backup.classStats["2-1"].ua.g === 1 && /^teambattle-backup-\d{8}-\d{4}\.json$/.test(K.MvpLabBackup.fileName(Date.now())));
})();
/* 미리 적어 둔 패배(2026-10-27): 쓰기를 실제로 반영하는 가짜 데이터베이스로 판 시작 → 정상 종료 / 결과 없이 사라짐 → 정산을 흉내 낸다 */
class LiveDb {
  constructor(seed) { this.tree = { users: { u1: JSON.parse(JSON.stringify(seed || {})) } }; this.writes = []; }
  read(p) { return Promise.resolve(this.at("users/u1/" + p)); }
  at(p) { let node = this.tree; for (const part of p.split("/")) { node = node && typeof node === "object" ? node[part] : undefined; } return node === undefined ? null : JSON.parse(JSON.stringify(node)); }
  updateRoot(values) {
    this.writes.push(values);
    Object.keys(values).forEach((k) => {
      const parts = k.split("/"); let node = this.tree;
      parts.slice(0, -1).forEach((part) => { node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {}; });
      const v = values[k];
      if (v === null) delete node[parts[parts.length - 1]]; else node[parts[parts.length - 1]] = JSON.parse(JSON.stringify(v, (key, value) => (value && value[".sv"] ? RULE_NOW : value)));
    });
    return Promise.resolve();
  }
}
const pendingUser = { uid: "u1", name: "홍", email: "a@b", getToken: () => Promise.resolve("") };
async function pendingCase(name, key, makeStore, lossReport, winReport, context) {
  const db = new LiveDb();
  const store = makeStore(db);
  await store.arm(lossReport);
  const armed = db.at("users/u1/pending/" + key);
  const pendErrors = [];
  RuleChecker.validate(RULES.pending.$game, armed, undefined, { $game: key }, "pending/" + key, pendErrors);
  check(name + " 미리 적기: pending 에 보고 1개, 통계는 아직 그대로, 규칙 통과", !!armed && armed.id === store.keyOf(lossReport) && !db.at("users/u1/stats/" + key) && pendErrors.length === 0, pendErrors);
  await store.record(winReport, context);
  const recent = db.at("users/u1/recent/" + key) || {};
  check(name + " 정상 종료: 진짜 결과로 기록하고 pending 지움", !db.at("users/u1/pending/" + key) && Object.keys(recent).length === 1 && recent[0].r === 1, recent);

  const gone = new LiveDb();
  await makeStore(gone).arm(lossReport);
  const later = makeStore(gone);
  await later.settlePending();
  const lost = gone.at("users/u1/recent/" + key) || {};
  const stats = gone.at("users/u1/stats/" + key);
  check(name + " 사라진 판: 다음에 정산하면 패배 1판, pending 지움", !gone.at("users/u1/pending/" + key) && lost[0] && lost[0].r === 0 && stats && stats.g === 1 && stats.w === 0, [lost, stats]);
  const settleRule = RuleChecker.check(key, gone.writes[gone.writes.length - 1], undefined, undefined);
  check(name + " 사라진 판: 정산 쓰기가 규칙 통과", settleRule.errors.length === 0, settleRule.errors);

  const twice = new LiveDb();
  const s2 = makeStore(twice);
  await s2.arm(lossReport);
  const next = Object.assign(JSON.parse(JSON.stringify(winReport)), { matchId: "next_match" });
  await s2.record(next, context);
  const rows = Object.values(twice.at("users/u1/recent/" + key) || {});
  check(name + " 사라진 판 뒤 다음 판: 먼저 패배 정산, 다음 판 승리, 판 수 2", rows.length === 2 && rows.filter((r) => r.r === 0).length === 1 && twice.at("users/u1/stats/" + key).g === 2 && !twice.at("users/u1/pending/" + key), rows);

  const quiet = new LiveDb();
  const s3 = makeStore(quiet);
  await s3.arm(lossReport);
  await s3.disarm(s3.keyOf(lossReport));
  check(name + " 취소된 판: disarm 하면 아무것도 안 남음", !quiet.at("users/u1/pending/" + key) && !quiet.at("users/u1/recent/" + key));
}
const pendingChecks = (async () => {
  await pendingCase("24번", "turbolap", (db) => new K.AccountMatchStore(db, pendingUser, new K.TurboLapProfile()), turboReport({ result: "lose" }), turboReport(), null);
  await pendingCase("랜덤 승패(축구)", "soccer", (db) => new K.AccountMatchStore(db, pendingUser, new K.RandomMatchProfile("soccer")), randomReport({ result: "lose" }), randomReport(), null);
  const leftReport = report({ iLeft: true, progress: 1, players: players({ 0: { left: true } }) });
  await pendingCase("30번", "teambattle", (db) => new K.AccountStatsStore(db, pendingUser), leftReport, report(), judge);
  const closed = new LiveDb();
  await new K.AccountStatsStore(closed, pendingUser).arm(leftReport);
  await new K.AccountStatsStore(closed, pendingUser).stash(report());
  await new K.AccountStatsStore(closed, pendingUser).settlePending();
  const closedRecent = closed.at("users/u1/recent/teambattle") || {}, closedStats = closed.at("users/u1/stats/teambattle");
  const closedRule = RuleChecker.check("teambattle", closed.writes[closed.writes.length - 1], undefined, undefined);
  check("30번 끝난 직후 화면이 닫힘: 진짜 결과(승·MVP)로 정산, pending 지움, 규칙 통과",
    !closed.at("users/u1/pending/teambattle") && closedRecent[0] && closedRecent[0].r === 1 && closedStats.w === 1 && closedStats.m === 1 && closedStats.c.warrior.k === 3 && closedRule.errors.length === 0, [closedStats, closedRule.errors]);

  const turboClosed = new LiveDb();
  const turboSender = new K.AccountMatchSender(() => new K.AccountMatchStore(turboClosed, pendingUser, new K.TurboLapProfile()));
  turboSender.arm(turboReport({ result: "lose" }));
  turboSender.stash(turboReport());
  await new Promise((r) => setTimeout(r, 20));
  await new K.AccountMatchStore(turboClosed, pendingUser, new K.TurboLapProfile()).settlePending();
  check("24번 끝난 직후 화면이 닫힘: 미리 적은 패배 대신 진짜 승리로 정산", !turboClosed.at("users/u1/pending/turbolap") && turboClosed.at("users/u1/stats/turbolap").w === 1 && turboClosed.at("users/u1/stats/turbolap").l === 0, turboClosed.at("users/u1/stats/turbolap"));

  const ordered = new LiveDb();
  const tbSender = new K.AccountMatchSender(() => new K.AccountStatsStore(ordered, pendingUser));
  tbSender.arm(leftReport);
  tbSender.stash(report());
  tbSender.disarm("room1_1000");
  tbSender.record(report(), judge);
  await new Promise((r) => setTimeout(r, 20));
  check("30번 기록 창구: 미리 적기 → 결과 미리 적기 → 늦은 disarm → 진짜 기록 = 승 1판, pending 없음",
    !ordered.at("users/u1/pending/teambattle") && ordered.at("users/u1/stats/teambattle").g === 1 && ordered.at("users/u1/stats/teambattle").w === 1, ordered.at("users/u1/stats/teambattle"));

  class RejectingDb extends LiveDb {
    updateRoot(values) {
      if (Object.keys(values).some((k) => k.indexOf("/recent/") >= 0) && Object.keys(values).some((k) => values[k] && values[k].id === "bad_match")) return Promise.reject(new Error("401"));
      return super.updateRoot(values);
    }
  }
  const stuck = new RejectingDb();
  await new K.AccountStatsStore(stuck, pendingUser).arm(report({ matchId: "bad_match", iLeft: true }));
  await new K.AccountStatsStore(stuck, pendingUser).record(report({ matchId: "next_match" }), judge);
  check("30번 규칙이 거부하는 남은 보고: 지우고 다음 판은 기록(막히지 않음)",
    !stuck.at("users/u1/pending/teambattle") && stuck.at("users/u1/stats/teambattle").g === 1 && Object.values(stuck.at("users/u1/recent/teambattle")).map((r) => r.id).join() === "next_match");

  check("보고 묶음: 너무 긴 보고는 미리 적지 않음", K.AccountPendingCodec.encode("k", { x: "가".repeat(7000) }) === null && K.AccountPendingCodec.decode({ id: "k", rep: "{bad" }).report === null);

  const order = new LiveDb();
  const sender = new K.AccountMatchSender(() => new K.AccountMatchStore(order, pendingUser, new K.TurboLapProfile()));
  sender.arm(turboReport({ result: "lose" }));
  sender.record(turboReport(), null);
  sender.arm(turboReport({ result: "lose" }));
  await new Promise((r) => setTimeout(r, 20));
  check("기록 창구: 미리 적기 직후 진짜 결과 — 순서대로 보내 pending 이 남지 않고, 같은 판 다시 미리 적기는 무시", !order.at("users/u1/pending/turbolap") && order.at("users/u1/stats/turbolap").w === 1, order.writes.map((w) => Object.keys(w).length));

  const S = K.MkStreakMath, rule = RULES.streak.$game;
  const legal = (before, after) => { const errors = []; RuleChecker.validate(rule, after, before.id ? before : undefined, { $game: "soccer" }, "streak", errors); return errors.length === 0; };
  const three = { n: 3, b: 5, id: "m3" };
  const armed = S.arm(three, "m4");
  check("연승 미리 적기: 연승은 그대로, p 에 이번 판", armed.n === 3 && armed.p === "m4" && legal(three, armed), armed);
  const won = S.next(armed, "m4", "win");
  check("연승 미리 적기 → 승리: 4연승, p 지움, 규칙 통과", won.n === 4 && !won.p && won.id === "m4" && legal(armed, won), won);
  const settled = S.settle(armed);
  check("연승 사라진 판: 정산하면 0연승(최고 5 유지), 규칙 통과", settled.n === 0 && settled.b === 5 && settled.id === "m4" && legal(armed, settled), settled);
  const rearm = S.arm(armed, "m5");
  check("연승 사라진 판 뒤 다음 판 미리 적기: 정산과 함께 한 번에", rearm.n === 0 && rearm.id === "m4" && rearm.p === "m5" && legal(armed, rearm), rearm);
  const undone = S.disarm(armed, "m4");
  check("연승 취소된 판: p 만 지움, 규칙 통과", undone.n === 3 && !undone.p && legal(armed, undone) && S.disarm(three, "m4") === null, undone);
  check("연승 규칙: 같은 판 표시로 연승을 올리면 거부", !legal(three, { n: 9, b: 9, id: "m3", p: "x" }) && S.arm(armed, "m4") === null && S.normalize({ n: 1, b: 1, id: "a", p: "a" }).p === undefined);
})();
(() => {
  const rule = RULES.stats.teambattle.c.$char;
  const ok = (before, after) => { const errors = []; RuleChecker.validate(rule, after, before, { $char: "knight" }, "c/knight", errors); return errors.length === 0; };
  const old = { n: 4, w: 2, bg: 2, bw: 1, rg: 2, rw: 1, m: 1, kn: 4, k: 2, d: 1, a: 3, dmg: 500, hl: 0, bl: 0, st: 1, sl: 0 };
  const next = Object.assign({}, old, { n: 5, bg: 3 });
  check("평균 환산점수 규칙: 옛 기록에 처음 쓰면 scn 1 로 시작", ok(old, Object.assign({}, next, { scn: 1, sc: 1234.5 })));
  check("평균 환산점수 규칙: 옛 화면(점수 없이 쓰기)도 받음", ok(old, next));
  check("평균 환산점수 규칙: 이어 쓰면 scn +1, 음수 점수도 받음", ok(Object.assign({}, next, { scn: 1, sc: 900 }), Object.assign({}, next, { n: 6, bg: 4, scn: 2, sc: -150 })));
  check("평균 환산점수 규칙: scn 을 2 올리거나 판 수보다 크게 하면 거부", !ok(Object.assign({}, next, { scn: 1, sc: 900 }), Object.assign({}, next, { n: 6, bg: 4, scn: 3, sc: 900 })) && !ok(undefined, { n: 1, w: 0, bg: 1, bw: 0, rg: 0, rw: 0, m: 0, kn: 1, k: 0, d: 0, a: 0, dmg: 0, hl: 0, bl: 0, st: 0, sl: 0, scn: 2, sc: 1 }));
  check("평균 환산점수 규칙: sc 만 있거나 범위 밖이면 거부", !ok(old, Object.assign({}, next, { sc: 50 })) && !ok(old, Object.assign({}, next, { scn: 1, sc: 200000 })));
})();
const gameChecks = (async () => {
  await turbo.verifyStore(turboReport());
  await fps.verifyStore(fpsReport());
  await zombie.verifyStore(zombieReport({ rows: zombieRows().slice(0, 3) }));
  const cleanSnow = K.SnReportBuilder.fromEnd("m38", snowMatch, snowEnd, "a"); cleanSnow.players[3].ai = false;
  await snow.verifyStore(cleanSnow);
  await balloon.verifyStore(K.WbReportBuilder.fromEnd("m39", wbMatch, wbEnd, "a"));
  for (const key of ["minigames", "volleyball", "soccer"]) await new GameCase(key, new K.RandomMatchProfile(key), K.RandomMatchCodec, key).verifyStore(randomReport());
})();
Promise.all([done, gameChecks, pendingChecks]).then(() => {
  if (failures.length) { console.log("실패 " + failures.length + "개\n" + failures.join("\n")); process.exit(1); }
  console.log("통과 " + passed + " · 문제 0");
}).catch((e) => { console.log("오류", e); process.exit(1); });
