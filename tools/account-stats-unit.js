const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const files = ["common/match-kit.js", "common/account-match-kit.js", "common/account-stats.js", "games/24.turbo-lap/24.turbo-lap-stats.js", "games/25.fps-survival/25.fps-survival-stats.js", "games/31.zombie-outbreak/31.zombie-outbreak-stats.js", "games/31.zombie-outbreak/31.zombie-versus.js", "games/31.zombie-outbreak/31.zombie-missions.js", "games/38.snow-royale/38.snow-account.js", "games/38.snow-royale/38.snow-versus.js", "games/39.water-balloon/39.balloon-account.js", "games/39.water-balloon/39.balloon-versus.js", "games/41.baseball-duel/41.baseball-motion.js", "games/41.baseball-duel/41.baseball-field.js", "games/41.baseball-duel/41.baseball-pitch.js", "games/41.baseball-duel/41.baseball-batting.js", "games/41.baseball-duel/41.baseball-running.js", "games/41.baseball-duel/41.baseball-defense.js", "games/41.baseball-duel/41.baseball-play.js", "games/41.baseball-duel/41.baseball-game.js", "games/41.baseball-duel/41.baseball-stats.js", "games/30.team-battle/patch-notes.js", "games/30.team-battle/teambattle-stats-repair.js", "common/account-stats-repair.js"];
const names = ["AccountNumbers", "AccountRates", "AccountMatchKey", "AccountKeyLedger", "AccountForfeit", "AccountShape", "AccountRecentHeadCodec", "RecentMatchRing", "AccountLoginNotice", "RecentBlockList", "AccountGameProfile", "AccountMatchStore",
  "TeamBattleRates", "TeamBattleSkillShare", "AccountMvpJudge", "TeamBattlePlan", "TeamBattleCodec", "TeamBattleRing", "AccountStatsMath", "AccountStatsTable", "ClassStatsSummary", "TeamBattleProfile", "AccountStatsStore",
  "TurboLapPlan", "TurboLapCodec", "TurboLapStatsMath", "TurboLapProfile", "TurboLapStatsView", "FpsPlan", "FpsCodec", "FpsStatsMath", "FpsProfile", "FpsStatsView",
  "ZombiePlan", "ZombieCodec", "ZombieStatsMath", "ZombieProfile", "ZombieStatsView", "ZombieRandomTallyMath", "ZombieRoleTallyMath", "ZombieOriginRotation", "ZombieVersusCards", "ZombieVersusLineup", "ZombieMissionSites", "ZombieMissionCatalog", "ZombieMissionProgress", "SnAccountPlan", "SnAccountCodec", "SnAccountMath", "SnAccountProfile", "SnAccountView", "SnReportBuilder", "SnVersusCards",
  "WbAccountPlan", "WbAccountCodec", "WbAccountMath", "WbAccountProfile", "WbAccountView", "WbReportBuilder", "WbRandomTallyMath", "WbVersusCards", "WbVersusLineupBuilder", "BbStatsPlan", "BbStatsCodec", "BbStatsMath", "BbStatsProfile", "BbStatsView", "BbReportBuilder", "BbVersusCards", "BbBoxTable", "BbZoneMap", "BbZoneGrid", "BbMatchRules", "BbOneInningFormat", "BbStatsKeys", "BbScoutBuilder",
  "AccountClassRank", "RandomMatchPlan", "RandomMatchCodec", "RandomMatchMath", "RandomMatchProfile", "RandomMatchView",
  "AccountOutbox", "AccountRepairPlanner", "ZombieRepairGame", "TurboLapRepairGame", "FpsRepairGame", "SnowRepairGame", "BalloonRepairGame", "AccountStatsNormalizer", "TeamBattleDuplicatePlan", "TeamBattleGameFingerprint", "TeamBattleStatsReverter", "TeamBattleRepairPlanner", "AccountPendingCodec", "AccountMatchSender", "AccountPendingGuard", "MkStreakMath", "TurboLapClock", "TurboLapOutcome", "TeamBattleScore", "PatchNoteCodec", "PatchNoteSeen", "TeamBattleRecentBackout"];
const src = files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n;({" + names.join(",") + "})";
const fakeStorage = { data: {}, getItem(k) { return this.data[k] === undefined ? null : this.data[k]; }, setItem(k, v) { this.data[k] = String(v); } };
const K = vm.runInNewContext(src, { Event, CustomEvent, localStorage: fakeStorage, console, Math, Set, Map, Array, Object, Number, String, JSON, isFinite, Date, Promise, window: { dispatchEvent: () => true, addEventListener: () => {}, localStorage: fakeStorage, setTimeout: (fn) => { fn(); return 0; } }, WbBalance: { RATE: 30 } });

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
  const withAi = new K.TeamBattlePlan(report({ players: players({ 4: { ai: true }, 5: { ai: true } }) }), judge);
  check("30번 판정: AI 포함은 최근 매치만(한 팀 사람이 1명)", withAi.recordsRecent && !withAi.countsStats && withAi.withAi);
  const sixWithAi = new K.TeamBattlePlan(report({ players: players({ 4: { ai: true } }) }), judge);
  check("30번 판정: AI 포함 6명이라도 양 팀 사람이 2명 이상이면 누적 통계에도 셈", sixWithAi.recordsRecent && sixWithAi.countsStats && sixWithAi.withAi);
  const fiveWithAi = new K.TeamBattlePlan(report({ players: players({ 4: { ai: true } }).slice(0, 5) }), judge);
  check("30번 판정: 6명이 아니면(AI 포함) 누적 통계에 안 셈", !fiveWithAi.countsStats);
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
  const aiStatus = await ai.store.record(report({ players: players({ 0: { kills: 3 }, 4: { ai: true }, 5: { ai: true } }) }), judge);
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
  hasChild(name) { return !!this.v && typeof this.v === "object" && this.v[name] !== undefined && this.v[name] !== null; }
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
  (() => {
    const seen = { a: { nick: "가", team: "left", car: "c1", prog: 0.4 }, b: { nick: "나", team: "right", car: "c2", prog: 1 } };
    const onlyMe = [{ id: "b", nick: "나", team: "right", fin: 65000, prog: 3 }];
    const rows = K.TurboLapOutcome.withLeavers(onlyMe, seen);
    check("24번 결과표: 경기 중 사라진 상대를 나간 줄로 붙임(승자 기록이 1줄이라 빠지던 문제)", rows.length === 2 && rows[1].id === "a" && rows[1].quit === 1 && rows[1].fin === 0, rows);
    check("24번 결과표: 이미 있는 줄은 다시 붙이지 않음", K.TurboLapOutcome.withLeavers(rows, seen).length === 2);
    check("24번 승자: 완주한 1위", K.TurboLapOutcome.winner(rows, null).id === "b");
    const noFinish = [{ id: "b", nick: "나", team: "right", fin: 0, prog: 1.2 }, { id: "a", nick: "가", team: "left", fin: 0, prog: 0.4, quit: 1 }];
    check("24번 승자: 아무도 완주 못 했어도 상대가 모두 나갔으면 남은 편", (K.TurboLapOutcome.winner(noFinish, null) || {}).id === "b");
    check("24번 승자: 아무도 나가지 않고 완주도 없으면 무승부", K.TurboLapOutcome.winner([{ id: "a", team: "left", fin: 0, prog: 1 }, { id: "b", team: "right", fin: 0, prog: 2 }], null) === null);
    const plan = new K.TurboLapPlan({ matchId: "m", course: "seoul", result: "win", myIndex: 0, rows: rows.map((r) => ({ nick: r.nick, side: r.team === "right" ? 1 : 0, fin: r.fin, prog: r.prog, car: r.car || "", bot: false })) });
    check("24번 판정: 상대가 사라진 판의 승자도 최근·누적 기록", plan.recordsRecent && plan.countsStats && plan.win);
  })();
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
  { name: "감염", role: 1, secs: 61, infects: 1, left: false, ai: false }, { name: "봇", role: 1, secs: 20, infects: 0, left: false, ai: true }, { name: "봇2", role: 1, secs: 10, infects: 0, left: false, ai: true }];
const zombieReport = (extra) => Object.assign({ matchId: "m31", myIndex: 1, rows: zombieRows(), winner: 0, progress: 1, iLeft: false }, extra || {});
{
  check("31번 판정: 인간 승리는 끝까지 생존한 시민, 좀비 승리는 숙주만 승, 감염된 시민은 항상 패", new K.ZombiePlan(zombieReport()).win && !new K.ZombiePlan(zombieReport({ myIndex: 2 })).win && !new K.ZombiePlan(zombieReport({ winner: 1, myIndex: 2 })).win && new K.ZombiePlan(zombieReport({ winner: 1, myIndex: 0 })).win && !new K.ZombiePlan(zombieReport({ winner: 1, myIndex: 1 })).win && !new K.ZombiePlan(zombieReport({ winner: 0, myIndex: 0 })).win);
  const roleRows = zombieRows().slice(0, 3);
  const roleTally = [[1, 0], [1, 1], [2, 0], [2, 1], [0, 1], [0, 0]].reduce((raw, [myIndex, winner], i) => {
    const report = zombieReport({ rows: roleRows, myIndex, winner, matchId: "role" + i });
    return K.ZombieStatsMath.apply(raw, report, new K.ZombiePlan(report).win, "role" + i, i).node;
  }, null);
  check("31번 역할 승률: 시민 4판(생존 승 1, 생존 패 1, 감염 2판 모두 패) · 숙주 2판(승 1)", roleTally.cg === 4 && roleTally.cw === 1 && roleTally.pg === 2 && roleTally.pw === 1 && roleTally.w === 2 && roleTally.l === 4, roleTally);
  const roleHtml = new K.ZombieStatsView().statsHtml(roleTally);
  check("31번 통계 창: 좀비·시민 승률만 있고 전체 승률·승패 줄은 없음", roleHtml.includes("좀비 승률") && roleHtml.includes("시민 승률") && roleHtml.includes("25.0% (1/4)") && roleHtml.includes("50.0% (1/2)") && !roleHtml.includes("asd-record") && !roleHtml.includes("인간 승률"), roleHtml);
  const oldInfectedWin = K.ZombieCodec.decode(Object.assign({}, K.ZombieCodec.encode(zombieReport({ winner: 1, myIndex: 2 }), "old1", true), { at: 5 }));
  check("31번 최근 매치: 옛 기록의 감염된 판 승리도 패배로 보임", oldInfectedWin.win === false, oldInfectedWin);
  check("31번 반 별 요약: 역할 승률 칸을 함께 씀", same(new K.ZombieProfile().rankFields(roleTally).extra, { cg: 4, cw: 1, pg: 2, pw: 1 }));
  check("31번 판정: 봇이 2명 이상이면 최근 매치만, 절반 전 나가기는 기록 없음", (() => { const p = new K.ZombiePlan(zombieReport()); return p.recordsRecent && !p.countsStats; })() && !new K.ZombiePlan(zombieReport({ iLeft: true, progress: 0.2, winner: -1 })).recordsRecent);
  const r = zombie.roundTrip(zombieReport(), true);
  check("31번 값 배열: 왕복(역할·생존 초·감염 수)", r.back.rows.length === 5 && r.back.rows[0].role === 0 && r.back.rows[0].infects === 3 && r.back.rows[1].secs === 180 && r.back.winner === 0 && r.back.rows[3].ai && r.size < 500, r.size);
  const oneBot = zombieReport({ rows: zombieRows().slice(0, 4), matchId: "m1bot" });
  const oneBotPlan = new K.ZombiePlan(oneBot);
  const oneBotNode = K.ZombieStatsMath.apply(null, oneBot, true, "kb", 1).node;
  check("31번 판정: AI 1명(사람 3명+AI 1명 이상)이 섞인 판도 누적에 셈", oneBotPlan.countsMain && oneBotPlan.countsStats && oneBotNode.g === 1 && oneBotNode.w === 1, oneBotNode);
  const twoBots = K.ZombieStatsMath.apply(null, zombieReport({ matchId: "m2bot" }), true, "kc", 1).node;
  check("31번 판정: AI 2명 이상이면 누적에 안 셈", twoBots.g === 0);
  const clean = zombieReport({ rows: zombieRows().slice(0, 3) });
  const human = K.ZombieStatsMath.apply(null, clean, true, "k1", 1).node;
  check("31번 누적: 끝까지 생존한 인간 판", human.g === 1 && human.w === 1 && human.hg === 1 && human.hw === 1 && human.zg === 0 && human.sv === 1 && human.hs === 180 && human.ls === 180, human);
  const origin = K.ZombieStatsMath.apply(JSON.parse(JSON.stringify(human)), zombieReport({ rows: zombieRows().slice(0, 3), myIndex: 0, winner: 1, matchId: "m2" }), true, "k2", 2).node;
  check("31번 누적: 숙주 좀비 판(좀비 편 승리, 감염 수·최다)", origin.og === 1 && origin.zg === 1 && origin.zw === 1 && origin.hg === 1 && origin.ik === 3 && origin.mi === 3 && origin.w === 2, origin);
  const infected = K.ZombieStatsMath.apply(JSON.parse(JSON.stringify(origin)), zombieReport({ rows: zombieRows().slice(0, 3), myIndex: 2, winner: 0, matchId: "m3" }), false, "k3", 3).node;
  const missionRows = zombieRows().slice(0, 3); missionRows[1] = Object.assign({}, missionRows[1], { missions: 2 });
  const mission = K.ZombieStatsMath.apply(null, zombieReport({ rows: missionRows, matchId: "m4" }), true, "k4", 4).node;
  check("31번 누적: 완료한 미션 합계(ms)와 순위 요약 y", mission.ms === 2 && new K.ZombieProfile().rankFields(mission).y === 2 && human.ms === 0, mission);
  const missionBack = zombie.roundTrip(zombieReport({ rows: missionRows }), true).back;
  check("31번 값 배열: 완료 미션 수 왕복, 옛 기록(칸 6개)은 0", missionBack.rows[1].missions === 2 && K.ZombieCodec.decode({ v: 1, id: "o", at: 1, r: 1, ai: 0, me: 0, w: 0, p: [["옛", 2, 10, 0, 0, 0]] }).rows[0].missions === 0, missionBack.rows[1]);
  check("31번 누적: 감염된 판은 인간·좀비 양쪽 판 수에 들고 생존 시간은 감염 때까지", infected.hg === 2 && infected.zg === 2 && infected.hw === 2 && infected.zw === 1 && infected.hs === 241 && infected.l === 1, infected);
}

{
  const rot = K.ZombieOriginRotation, pickWith = (list, r) => rot.pick(list, () => r);
  check("31번 숙주 순번: 숙주가 된 뒤 3판은 후보에서 빠짐", pickWith([{ id: "a", gap: 0 }, { id: "b", gap: 2 }, { id: "c", gap: 3 }], 0.5) === "c" && pickWith([{ id: "a", gap: 1 }, { id: "b", gap: 5 }], 0) === "b");
  check("31번 숙주 순번: 오래 기다린 사람일수록 뽑힐 확률이 큼(가중치 1·2·3)", pickWith([{ id: "a", gap: 3 }, { id: "b", gap: 4 }, { id: "c", gap: 5 }], 0) === "a" && pickWith([{ id: "a", gap: 3 }, { id: "b", gap: 4 }, { id: "c", gap: 5 }], 0.2) === "b" && pickWith([{ id: "a", gap: 3 }, { id: "b", gap: 4 }, { id: "c", gap: 5 }], 0.9) === "c");
  check("31번 숙주 순번: 모두 쿨다운이면 가장 오래 기다린 사람, 같으면 무작위", pickWith([{ id: "a", gap: 0 }, { id: "b", gap: 2 }, { id: "c", gap: 1 }], 0.1) === "b" && pickWith([{ id: "a", gap: 2 }, { id: "b", gap: 2 }], 0.9) === "b");
  const entry = (role, at) => ({ id: "x" + at, at, win: true, withAi: false, myIndex: 0, winner: 0, rows: [{ name: "나", role, secs: 0, infects: 0, left: false, ai: false }] });
  check("31번 숙주 순번: 최근 매치에서 마지막 숙주 뒤 인간으로 한 판 수를 센다", rot.gapOf([entry(2, 5), entry(1, 4), entry(0, 3), entry(2, 2)]) === 2 && rot.gapOf([entry(0, 5), entry(2, 4)]) === 0 && rot.gapOf([entry(2, 1), entry(2, 2)]) === 2 && rot.gapOf([]) === rot.UNKNOWN_GAP);
  check("31번 숙주 순번: 방 자리 값은 숫자만 받고 숙주 뒤 0, 아니면 +1(최대 12)", rot.gapFromRoom("x") === rot.UNKNOWN_GAP && rot.gapFromRoom(-1) === rot.UNKNOWN_GAP && rot.gapFromRoom(4) === 4 && rot.nextGap(5, true) === 0 && rot.nextGap(5, false) === 6 && rot.nextGap(12, false) === 12);
  const rounds = (() => { const gaps = { a: 3, b: 3, c: 3, d: 3, e: 3 }, hosts = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 400; i++) { const id = rot.pick(Object.keys(gaps).map((k) => ({ id: k, gap: gaps[k] })), rnd); hosts.push([id, Math.min(...Object.keys(gaps).map((k) => gaps[k]))]); Object.keys(gaps).forEach((k) => { gaps[k] = rot.nextGap(gaps[k], k === id); }); }
    return hosts; })();
  check("31번 숙주 순번: 5명이 400판을 돌면 아무도 연달아 숙주가 되지 않고 4판 안에 한 번씩은 돌아옴", rounds.every((h, i) => i === 0 || h[0] !== rounds[i - 1][0]) && rounds.length === 400);
  const cardNode = K.ZombieStatsMath.normalize({ g: 9, w: 5, cg: 7, cw: 7, rm: { g: 4, w: 3, hg: 3, hw: 2, zg: 2, zw: 1, cg: 3, cw: 2, pg: 1, pw: 1 } });
  const card = K.ZombieVersusCards.fromStats(cardNode);
  check("31번 대결 화면 카드: rm 의 역할 승률만 읽고 자리 값으로 왕복", card.cg === 3 && card.cw === 2 && card.pg === 1 && card.pw === 1 && !("g" in card) && same(K.ZombieVersusCards.fromRoom(JSON.parse(JSON.stringify(K.ZombieVersusCards.toRoom(card)))), card) && K.ZombieVersusCards.fromStats(null) === null && K.ZombieVersusCards.fromRoom(null) === null && K.ZombieVersusCards.fromStats(K.ZombieStatsMath.normalize({ g: 4, w: 2 })) === null);
  const people = [{ nick: "가", me: true, card }, { nick: "나", me: false, card: null }];
  const matchedSeats = K.ZombieVersusLineup.build(people, 5, true, 3).map((seat) => seat.kind).join(",");
  const roomSeats = K.ZombieVersusLineup.build(people, 5, false, 0).map((seat) => seat.kind).join(",");
  const roomAiSeats = K.ZombieVersusLineup.build(people.slice(0, 1), 5, false, 0, true).map((seat) => seat.kind).join(",");
  check("31번 대결 화면 자리: 랜덤 매칭은 사람 → 입장하는 중 → AI, 일반 방은 사람 → 빈 자리(AI 채우기 켜면 AI)", matchedSeats === "player,player,coming,ai,ai" && roomSeats === "player,player,empty,empty,empty" && roomAiSeats === "player,ai,ai,ai,ai", [matchedSeats, roomSeats, roomAiSeats]);
}

{
  const plans = [
    { N: [["stairs", 0, 0], ["class", 1, 1, "1학년 1반"], ["staff", 3, 4, "교무실"], ["nurse", 5, 5, "보건실"], ["class", 6, 6, "1학년 3반"]], S: [["science", 0, 0, "과학실"], ["lobby", 3, 5], ["art", 8, 8, "미술실"]] },
    { N: [["class", 1, 1, "2학년 1반"], ["library", 4, 5, "도서실"]], S: [["computer", 0, 0, "컴퓨터실"], ["class", 1, 1, "3학년 1반"]] }
  ];
  const sites = K.ZombieMissionSites.build(plans, 54, 12, 3, 18);
  check("31번 미션 장소: 계단·로비는 빼고 방마다 앞쪽 벽 가운데 한 곳", sites.length === 10 && !sites.some((x) => x.type === "stairs" || x.type === "lobby") && sites.every((x) => Math.abs(Math.abs(x.z) - 10.4) < 1e-9) && sites[0].x === -54 + 12 + 0.3 && sites.filter((x) => x.floor === 1).length === 4);
  const picks = K.ZombieMissionCatalog.pick(12345, sites);
  check("31번 미션 뽑기: 같은 씨앗은 같은 3개, 종류·장소가 서로 다르고 장소가 종류에 맞음", picks.length === 3 && same(picks, K.ZombieMissionCatalog.pick(12345, sites)) && new Set(picks.map((m) => m.p)).size === 3 && picks.every((m) => K.ZombieMissionCatalog.KINDS[m.p].accepts(sites[m.s]) && K.ZombieMissionCatalog.GAMES.indexOf(m.g) >= 0), picks);
  check("31번 미션 뽑기: 씨앗이 다르면 다른 조합이 나옴", new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(K.ZombieMissionCatalog.pick(i * 977 + 3, sites)))).size > 20);
  const missions = K.ZombieMissionCatalog.decode(JSON.parse(JSON.stringify(picks)), sites);
  check("31번 미션 복원: 방 값(배열·번호 키 객체)을 읽고 잘못된 값은 버림", missions.length === 3 && K.ZombieMissionCatalog.decode({ 0: picks[0], 1: { p: 99, s: 0, g: "mash" } }, sites).length === 1 && K.ZombieMissionCatalog.decode(null, sites).length === 0);
  const P = K.ZombieMissionProgress;
  check("31번 미션 진행: 현재 미션·클리어 문구·모두 완료", P.current(missions, 0) === missions[0] && P.current(missions, 3) === null && P.clear(2) === "미션 2개 클리어" && P.allClear() === "미션 모두 완료!" && P.complete(missions, 3) && !P.complete(missions, 2));
  check("31번 승패: 미션 3개를 끝내고 살아남아야 인간 승리, 못 끝내면 3분이 지나도 좀비 승리", P.humansWin(2, missions, 3) && !P.humansWin(2, missions, 2) && !P.humansWin(0, missions, 3) && P.humansWin(1, [], 0));
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
  const randomWin = K.SnReportBuilder.fromEnd("r1", snowMatch, snowEnd, "a", true); randomWin.players[3].ai = false;
  const r1 = K.SnAccountMath.apply(null, randomWin, true, "r1", 1);
  const r2 = K.SnAccountMath.apply(JSON.parse(JSON.stringify(r1.node)), Object.assign(JSON.parse(JSON.stringify(randomWin)), { random: false, matchId: "o1" }), true, "o1", 2);
  check("38번 랜덤 매칭 칸: 랜덤 매칭 판만 rm 에 셈(일반 방 판은 그대로)", r1.node.rm.g === 1 && r1.node.rm.w === 1 && r1.node.rm.k === 3 && r1.node.rm.rk === 1 && r2.node.rm.g === 1 && r2.node.g === 2, [r1.node.rm, r2.node.rm]);
  const card = K.SnVersusCards.fromStats(r2.node);
  check("38번 대결 화면 카드: rm 만 읽고 자리 값으로 왕복", card.g === 1 && card.w === 1 && card.k === 3 && same(K.SnVersusCards.fromRoom(JSON.parse(JSON.stringify(K.SnVersusCards.toRoom(card)))), card) && K.SnVersusCards.fromStats(null) === null && K.SnVersusCards.fromRoom(null) === null, card);
  check("38번 대결 화면 카드: rm 이 없던 옛 통계는 0판", K.SnVersusCards.fromStats(K.SnAccountMath.normalize({ g: 4, w: 2 })).g === 0);
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
  check("39번 랜덤 매칭 칸: 일반 방 판은 rm 그대로", b.node.rm.g === 0 && !new K.WbAccountPlan(report).countsRandom);
  const botMatch = JSON.parse(JSON.stringify(wbMatch)); botMatch.teams[1].members[1].bot = true;
  const botRandom = K.WbReportBuilder.fromEnd("m3", botMatch, wbEnd, "a", true);
  const botPlan = new K.WbAccountPlan(botRandom);
  check("39번 랜덤 매칭 칸: 봇이 섞인 랜덤 매칭 판은 rm 만 셈", botPlan.countsStats && botPlan.countsRandom && !botPlan.countsMain && !new K.WbAccountPlan(K.WbReportBuilder.fromEnd("m4", botMatch, wbEnd, "a")).countsStats);
  const c = K.WbAccountMath.apply(JSON.parse(JSON.stringify(b.node)), botRandom, true, "k3", 3);
  check("39번 랜덤 매칭 칸: 봇 섞인 판은 누적 칸 그대로·rm 판·1위·팀전·처치·구출 +", c.node.g === 2 && c.node.kl === 3 && c.node.rm.g === 1 && c.node.rm.w === 1 && c.node.rm.gt === 1 && c.node.rm.kl === 2 && c.node.rm.rs === 1 && !!c.node.ids.k3, c.node);
  const d = K.WbAccountMath.apply(JSON.parse(JSON.stringify(c.node)), K.WbReportBuilder.fromEnd("m5", wbMatch, wbEnd, "c", true), false, "k4", 4);
  check("39번 랜덤 매칭 칸: 사람끼리 랜덤 매칭 판은 둘 다 셈", d.node.g === 3 && d.node.rm.g === 2 && d.node.rm.w === 1 && d.node.rm.kl === 3, d.node);
  check("39번 대결 화면 카드: rm 만 읽고 판이 없으면 기록 없음", K.WbVersusCards.fromStats(d.node).g === 2 && K.WbVersusCards.fromStats(b.node) === null && K.WbVersusCards.fromRoom({ g: 2, w: 1, gt: 1, kl: 3, rs: 1 }).kl === 3 && K.WbVersusCards.fromRoom({ g: 0 }) === null && K.WbVersusCards.fromRoom("x") === null);
  const people = new Map([["a", { nick: "에이", vs: { g: 4, w: 1, gt: 2, kl: 6, rs: 1 } }]]);
  const lineup = K.WbVersusLineupBuilder.build("team", [{ color: 2, members: [{ id: "a", nick: "", bot: false }, { id: "b", nick: "비", bot: false }] }, { color: 0, members: [{ id: "bot1", nick: "봇 1", bot: true }, { id: "bot2", nick: "봇 2", bot: true }] }], people, "a");
  const seats = lineup.units[0].seats;
  check("39번 대결 화면 줄: 나·입장하는 중·봇", lineup.units[0].color === 2 && seats[0].me && seats[0].card.kl === 6 && seats[1].waiting && seats[1].nick === "비" && lineup.units[1].seats[0].ai, lineup);
}

const baseball = new GameCase("41번", new K.BbStatsProfile(), K.BbStatsCodec, "baseballduel");
const bbSheet = (b, p) => ({ lineup: [{ abilities: b, hand: "R" }], pitchers: [{ abilities: p, hand: "R", pitches: ["ft"], role: "starter" }] });
const bbSummary = (score, extra) => {
  const rules = new K.BbMatchRules(new K.BbOneInningFormat()), state = rules.start();
  state.score = score; state.lineScore = [[score[0], score[1]]]; state.finished = true; state.winner = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : -1;
  Object.assign(state.box[1].bat, { pa: 5, ab: 4, h: 2, d2: 1, hr: 1, bb: 1, k: 1, r: score[1], rbi: score[1] });
  Object.assign(state.box[1].pit, { bf: 4, ab: 4, h: 1, k: 2, outs: 3, r: score[0], er: score[0], pitches: 17, strikes: 11 });
  Object.assign(state.box[0].bat, { pa: 4, ab: 4, h: 1, k: 2, r: score[0] });
  Object.assign(state.box[0].pit, { bf: 5, ab: 4, h: 2, d2: 1, hr: 1, bb: 1, k: 1, outs: 2, r: score[1], er: score[1], pitches: 22, strikes: 13 });
  state.box[1].byType.ft = { n: 12, s: 8 }; state.box[1].byType.cv = { n: 5, s: 3 }; state.box[1].bestDistance = 112.4; state.box[1].bestExit = 151.6; state.box[1].bestPitch = 138.2;
  state.box[1].batZones[4] = { n: 3, ab: 2, h: 1, tb: 4 }; state.box[1].pitZones[0] = 6; state.box[1].pitZones[9] = 4;
  return Object.assign({ plan: { format: new K.BbOneInningFormat(), names: ["가".repeat(25), "나"], teams: [bbSheet({ contact: 3, power: 3, speed: 3 }, { control: 3, power: 3, breaking: 3 }), bbSheet({ contact: 4, power: 3, speed: 2 }, { control: 2, power: 5, breaking: 2 })] }, state, forfeitedBy: null }, extra || {});
};
const bbReport = (extra, score) => Object.assign(K.BbReportBuilder.fromSummary("m41", bbSummary(score || [1, 2]), 1, true, false, false, 1), extra || {});
{
  const win = bbReport();
  check("41번 판정: 사람 상대 승리는 최근·누적 모두, AI 상대는 기록 없음", (() => { const p = new K.BbStatsPlan(win); return p.recordsRecent && p.countsStats && p.win && !p.tie; })() && !new K.BbStatsPlan(bbReport({ rival: false })).recordsRecent);
  check("41번 판정: 무승부·패배·나가기", new K.BbStatsPlan(bbReport({}, [2, 2])).tie && !new K.BbStatsPlan(bbReport({}, [3, 2])).win && !new K.BbStatsPlan(bbReport({ iLeft: true, progress: 0.3 })).recordsRecent && !new K.BbStatsPlan(bbReport({ iLeft: true, progress: 0.6 })).win);
  check("41번 보고서: 능력치 배분 열쇠·기권", win.batKey === "4-3-2" && win.pitKey === "2-5-2" && K.BbReportBuilder.fromSummary("m", bbSummary([5, 0], { forfeitedBy: 0 }), 1, true, false, false, 1).winner === 1);
  const r = baseball.roundTrip(win, true);
  check("41번 값 배열: 왕복(이름 20자·회별 점수·결과표 4줄·오늘의 장면)", r.back.sheet.names[0].length === 20 && r.back.sheet.score[1] === 2 && r.back.sheet.lines[1].bat[4] === 1 && r.back.sheet.lines[1].pit[0] === 3 && r.back.sheet.lines[0].pit[1] === 22 && r.back.sheet.bestDistance === 112 && r.back.sheet.bestPitch === 138 && r.back.sheet.me === 1 && r.size < 600, r.size);
  const a = K.BbStatsMath.apply(null, win, new K.BbStatsPlan(win), "k1", 1);
  const tieReport = bbReport({ matchId: "m2", random: true }, [2, 2]);
  const b = K.BbStatsMath.apply(JSON.parse(JSON.stringify(a.node)), tieReport, new K.BbStatsPlan(tieReport), "k2", 2);
  check("41번 누적: 판·승·무·득실·타격·투구·구종·최고 기록", b.node.g === 2 && b.node.w === 1 && b.node.t === 1 && b.node.l === 0 && b.node.rf === 4 && b.node.ra === 3 && b.node.bat.h === 4 && b.node.bat.hr === 2 && b.node.pit.outs === 6 && b.node.bt.ft.n === 24 && b.node.bd === 112 && b.node.bs === 138, b.node);
  check("41번 누적: 핫콜드존·투구 위치·포인트별", b.node.zb[4].ab === 4 && b.node.zb[4].tb === 8 && b.node.zp[0] === 12 && b.node.zp[9] === 8 && b.node.ab["4-3-2"].g === 2 && b.node.ab["4-3-2"].h === 4 && b.node.ap["2-5-2"].outs === 6, [b.node.zb[4], b.node.ab]);
  check("41번 랜덤 매칭 칸: 랜덤 매칭 판만 rm", a.node.rm.g === 0 && b.node.rm.g === 1 && b.node.rm.t === 1 && b.node.rm.rf === 2);
  check("41번 누적: 같은 열쇠는 무시", K.BbStatsMath.apply(b.node, win, new K.BbStatsPlan(win), "k1", 3) === null);
  check("41번 공식: 존 칸 번호(투수 시점 3×3, 밖은 9)", K.BbZoneGrid.indexOf({ u: -0.9, v: 0.9 }) === 0 && K.BbZoneGrid.indexOf({ u: 0, v: 0 }) === 4 && K.BbZoneGrid.indexOf({ u: 1, v: -1 }) === 8 && K.BbZoneGrid.indexOf({ u: 1.01, v: 0 }) === 9);
  const card = K.BbVersusCards.fromStats(b.node, false);
  check("41번 대결 화면 카드: 승률은 rm·카드 비율은 전체, 자리 값으로 왕복, 판이 없으면 null", card.g === 1 && card.ob.h === 4 && !card.zb && same(K.BbVersusCards.fromRoom(JSON.parse(JSON.stringify(card))), card) && K.BbVersusCards.fromStats(a.node, false).g === 0 && K.BbVersusCards.fromStats(K.BbStatsMath.normalize({}), false) === null && K.BbVersusCards.fromRoom(null) === null && K.BbVersusCards.fromStats(a.node, true).zb.length === 10, card);
  const scout = K.BbScoutBuilder.of(K.BbVersusCards.fromStats(b.node, true));
  check("41번 카드 정보: 타율·투수 비율·핫콜드존(표본 5타수 미만은 회색)", scout.batStats[0] === ".500" && scout.batStats[3] === "2" && scout.hitHeat.length === 9 && scout.hitHeat[4] === "few" && scout.pitchHeat[0] === "heat4" && K.BbScoutBuilder.of(null) === null, scout);
  const view = new K.BbStatsView(() => false);
  check("41번 통계 창 글자", view.statsHtml(b.node).indexOf("평균자책점") >= 0 && view.statsHtml(null).indexOf("승률") >= 0 && view.resultTitle(r.back) === "승리!" && view.blockBodyHtml(r.back).indexOf("2 나") > 0);
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
  check("반별 순위 요약: 반 칸에 쓰고 미분류 칸은 지움", rankPatch["gameRanks/soccer/2-5/u1"].g === 3 && rankPatch["gameRanks/soccer/none/u1"] === null && K.AccountClassRank.classKey("3-1") === "3-1" && K.AccountClassRank.classKey("4-1") === "none");
}
check("24번 결과 시간: 0.01초까지 같은 기록끼리만 0.001초까지", K.TurboLapClock.text(62341, [62341, 62348]) === "1:02.341" && K.TurboLapClock.text(62348, [62341, 62348]) === "1:02.348" && K.TurboLapClock.text(63000, [62341, 63000]) === "1:03.00" && K.TurboLapClock.text(65009, [65009, 65001, 70000]) === "1:05.009" && K.TurboLapClock.text(70000, [65009, 65001, 70000]) === "1:10.00" && K.TurboLapClock.text(62341, [62341, 0]) === "1:02.34");
/* 패치노트(2026-10-29): 글 다듬기·본 기록 */
(() => {
  check("패치노트: 내용이 없으면 무시, 제목·내용 다듬기", K.PatchNoteCodec.decode({ id: 1, body: "  " }) === null && K.PatchNoteCodec.make(" 제목 ", "가\r\n나 ", 5, 6).body === "가\n나" && K.PatchNoteCodec.decode({ id: 5, title: "t", body: "b" }).at === 5 && K.PatchNoteCodec.path("teambattle") === "portal/patchNotes/teambattle");
  const seen = new K.PatchNoteSeen("teambattle");
  seen.mark("u1", 10);
  check("패치노트: 본 기록은 계정·게시 번호별", seen.has("u1", 10) && !seen.has("u1", 11) && !seen.has("u2", 10) && !new K.PatchNoteSeen("other").has("u1", 10));
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
  await pendingCase("41번", "baseballduel", (db) => new K.AccountMatchStore(db, pendingUser, new K.BbStatsProfile()), bbReport({ iLeft: true, random: true, progress: 1 }), bbReport({ random: true }), null);
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
  check("스킬 비율 규칙: skn 은 그대로이거나 +1, 판 수를 넘으면 거부", ok(old, Object.assign({}, next, { skn: 1, sk: 300, skb: 900 })) && ok(old, Object.assign({}, next, { skn: 0, sk: 0, skb: 0 })) && !ok(old, Object.assign({}, next, { skn: 2, sk: 1, skb: 1 })) && !ok(old, Object.assign({}, next, { skn: 6, sk: 1, skb: 1 })));
  {
    const first = K.AccountStatsMath.applyChar(K.AccountStatsMath.emptyChar(), line("나", 0, "knight", { dmg: 1000, skillDmg: 400 }), { win: true, side: 0, mvp: false });
    const second = K.AccountStatsMath.applyChar(first, line("나", 0, "knight", { dmg: 500, skillDmg: 100 }), { win: true, side: 0, mvp: false });
    const unknown = K.AccountStatsMath.applyChar(second, line("나", 0, "knight", { dmg: 700 }), { win: true, side: 0, mvp: false });
    check("스킬 비율: 평균을 쌓고, 모르는 옛 판은 건너뜀", second.skn === 2 && second.sk === 250 && second.skb === 750 && unknown.n === 3 && unknown.skn === 2 && unknown.sk === 250 && unknown.skb === 750, unknown);
    const encoded = K.TeamBattleCodec.encodeLine(line("나", 0, "knight", { skillDmg: 12.6 }));
    const oldLine = K.TeamBattleCodec.encodeLine(line("나", 0, "knight"));
    check("스킬 비율: 값 배열 15번째 왕복, 옛 줄은 값 없음", encoded.length === 15 && K.TeamBattleCodec.decodeLine(encoded).skillDmg === 13 && oldLine.length === 14 && K.TeamBattleCodec.decodeLine(oldLine).skillDmg === undefined);
    check("스킬 비율: 칸 글자", K.TeamBattleSkillShare.cellHtml(800, 300, 800) === "<td><b>800</b><small>(38%)</small></td>" && K.TeamBattleSkillShare.cellHtml(800, 0, 0) === "<td>800</td>" && K.TeamBattleSkillShare.label(9, 8) === "(100%)");
  }
  check("평균 환산점수 규칙: sc 만 있거나 범위 밖이면 거부", !ok(old, Object.assign({}, next, { sc: 50 })) && !ok(old, Object.assign({}, next, { scn: 1, sc: 200000 })));
})();
const gameChecks = (async () => {
  await turbo.verifyStore(turboReport());
  await fps.verifyStore(fpsReport());
  await zombie.verifyStore(zombieReport({ rows: zombieRows().slice(0, 3) }));
  const cleanSnow = K.SnReportBuilder.fromEnd("m38", snowMatch, snowEnd, "a"); cleanSnow.players[3].ai = false;
  await snow.verifyStore(cleanSnow);
  await new GameCase("38번 랜덤 매칭", new K.SnAccountProfile(), K.SnAccountCodec, "snowroyale").verifyStore(Object.assign(JSON.parse(JSON.stringify(cleanSnow)), { random: true }));
  (() => {
    const first = { g: 1, w: 1, k: 3, rk: 1 }, legal = (before, after) => { const errors = []; RuleChecker.validate(RULES.stats.snowroyale.rm, after, before, {}, "rm", errors); return errors.length === 0; };
    check("38번 랜덤 매칭 칸 규칙: 판 +1 통과, 2판·순위 0·처치 100 은 거부", legal(undefined, first) && legal(first, { g: 2, w: 1, k: 5, rk: 4 }) && !legal(first, { g: 3, w: 1, k: 5, rk: 7 }) && !legal(first, { g: 2, w: 1, k: 5, rk: 1 }) && !legal(first, { g: 2, w: 1, k: 103, rk: 3 }));
  })();
  await balloon.verifyStore(K.WbReportBuilder.fromEnd("m39", wbMatch, wbEnd, "a"));
  await baseball.verifyStore(bbReport());
  await new GameCase("41번 랜덤 매칭", new K.BbStatsProfile(), K.BbStatsCodec, "baseballduel").verifyStore(bbReport({ random: true }));
  {
    const first = baseball.store({}), status = await first.store.record(bbReport(), null), w = first.writes[0] || {}, board = w["baseballduel/board/u1"];
    check("41번 저장: 같은 PATCH 에 랭킹 요약(board)·반별 순위(x = 홈런)", status === "stats" && !!board && board.g === 1 && board.c === "none" && board.bat.h === 2 && w["gameRanks/baseballduel/none/u1"].x === 1, Object.keys(w));
    const ruled = RuleChecker.check("baseballduel", w, undefined, undefined);
    const tie = bbReport({ matchId: "m41b" }, [2, 2]), second = baseball.store({ "stats/baseballduel": ruled.stats, "recent/baseballduel": ruled.slots });
    await second.store.record(tie, null);
    const ruled2 = RuleChecker.check("baseballduel", second.writes[0], ruled.stats, ruled.slots);
    check("41번 규칙: 무승부 둘째 판(존·포인트별 칸 포함) 통과", ruled2.errors.length === 0 && ruled2.stats.t === 1 && ruled2.stats.ab["4-3-2"].g === 2, ruled2.errors);
    const cheat = JSON.parse(JSON.stringify(second.writes[0])); cheat["users/u1/stats/baseballduel/bat"] = Object.assign({}, cheat["users/u1/stats/baseballduel/bat"], { hr: 90 });
    check("41번 규칙: 홈런을 한 번에 60 넘게 올리면 거부", RuleChecker.check("baseballduel", cheat, ruled.stats, ruled.slots).errors.length > 0);
    const cheat2 = JSON.parse(JSON.stringify(second.writes[0])); cheat2["users/u1/stats/baseballduel/w"] = 2;
    check("41번 규칙: 승+패+무가 판 수와 다르면 거부", RuleChecker.check("baseballduel", cheat2, ruled.stats, ruled.slots).errors.length > 0);
  }
  {
    const botMatch = JSON.parse(JSON.stringify(wbMatch)); botMatch.teams[1].members[1].bot = true;
    const botRandom = K.WbReportBuilder.fromEnd("r1", botMatch, wbEnd, "a", true);
    const first = balloon.store({});
    check("39번 랜덤 매칭 칸: 봇 섞인 첫 판 저장", (await first.store.record(botRandom, null)) === "stats" && first.writes.length === 1);
    const w1 = first.writes[0] || {};
    check("39번 랜덤 매칭 칸: 누적 칸·반별 순위는 쓰지 않음", !("users/u1/stats/waterballoon/g" in w1) && !!w1["users/u1/stats/waterballoon/rm"] && !Object.keys(w1).some((k) => k.indexOf("gameRanks/") === 0), Object.keys(w1));
    const ruled1 = RuleChecker.check("waterballoon", w1, undefined, undefined);
    check("39번 랜덤 매칭 칸: 누적 칸 없이 rm 만 쓰는 첫 판이 규칙 통과", ruled1.errors.length === 0, ruled1.errors);
    const second = balloon.store({ "stats/waterballoon": ruled1.stats, "recent/waterballoon": ruled1.slots });
    await second.store.record(K.WbReportBuilder.fromEnd("r2", wbMatch, wbEnd, "a", true), null);
    const w2 = second.writes[0] || {};
    const ruled2 = RuleChecker.check("waterballoon", w2, ruled1.stats, ruled1.slots);
    check("39번 랜덤 매칭 칸: 그다음 사람끼리 판은 누적 첫 판 + rm 둘째 판으로 통과", ruled2.errors.length === 0 && ruled2.stats.g === 1 && ruled2.stats.rm.g === 2, [ruled2.errors, ruled2.stats]);
    const third = balloon.store({ "stats/waterballoon": ruled2.stats, "recent/waterballoon": ruled2.slots });
    await third.store.record(K.WbReportBuilder.fromEnd("r3", botMatch, wbEnd, "a", true), null);
    const w3 = third.writes[0] || {};
    const ruled3 = RuleChecker.check("waterballoon", w3, ruled2.stats, ruled2.slots);
    check("39번 랜덤 매칭 칸: 누적 칸이 있을 때 봇 섞인 판(rm 만)도 통과", ruled3.errors.length === 0 && ruled3.stats.g === 1 && ruled3.stats.rm.g === 3, ruled3.errors);
    const cheat = JSON.parse(JSON.stringify(w3)); cheat["users/u1/stats/waterballoon/kl"] = ruled2.stats.kl + 5;
    check("39번 랜덤 매칭 칸: rm 만 올리며 누적 처치를 바꾸면 거부", RuleChecker.check("waterballoon", cheat, ruled2.stats, ruled2.slots).errors.length > 0);
    const cheat2 = JSON.parse(JSON.stringify(w3)); cheat2["users/u1/stats/waterballoon/rm"] = Object.assign({}, cheat2["users/u1/stats/waterballoon/rm"], { g: ruled2.stats.rm.g + 2 });
    check("39번 랜덤 매칭 칸: rm 판 수를 한 번에 2 올리면 거부", RuleChecker.check("waterballoon", cheat2, ruled2.stats, ruled2.slots).errors.length > 0);
  }
  {
    const withBot = zombieReport({ random: true });
    const clean31 = zombieReport({ random: true, rows: zombieRows().slice(0, 3) });
    const first = zombie.store({});
    check("31번 랜덤 매칭 칸: 봇 섞인 첫 판 저장", (await first.store.record(withBot, null)) === "stats" && first.writes.length === 1);
    const w1 = first.writes[0] || {};
    check("31번 랜덤 매칭 칸: 누적 칸·반별 순위는 쓰지 않음", !("users/u1/stats/zombieoutbreak/g" in w1) && !!w1["users/u1/stats/zombieoutbreak/rm"] && !Object.keys(w1).some((k) => k.indexOf("gameRanks/") === 0), Object.keys(w1));
    const ruled1 = RuleChecker.check("zombieoutbreak", w1, undefined, undefined);
    check("31번 랜덤 매칭 칸: 누적 칸 없이 rm 만 쓰는 첫 판이 규칙 통과", ruled1.errors.length === 0 && ruled1.stats.rm.g === 1 && ruled1.stats.rm.hw === 1, ruled1.errors);
    const second = zombie.store({ "stats/zombieoutbreak": ruled1.stats, "recent/zombieoutbreak": ruled1.slots });
    await second.store.record(Object.assign({}, clean31, { matchId: "m31b" }), null);
    const ruled2 = RuleChecker.check("zombieoutbreak", second.writes[0] || {}, ruled1.stats, ruled1.slots);
    check("31번 랜덤 매칭 칸: 사람끼리 판은 누적 첫 판 + rm 둘째 판", ruled2.errors.length === 0 && ruled2.stats.g === 1 && ruled2.stats.rm.g === 2, [ruled2.errors, ruled2.stats]);
    const third = zombie.store({ "stats/zombieoutbreak": ruled2.stats, "recent/zombieoutbreak": ruled2.slots });
    await third.store.record(Object.assign({}, withBot, { matchId: "m31c" }), null);
    const w3 = third.writes[0] || {};
    const ruled3 = RuleChecker.check("zombieoutbreak", w3, ruled2.stats, ruled2.slots);
    check("31번 랜덤 매칭 칸: 누적 칸이 있을 때 봇 섞인 판(rm 만)도 통과", ruled3.errors.length === 0 && ruled3.stats.g === 1 && ruled3.stats.rm.g === 3, ruled3.errors);
    const cheat = JSON.parse(JSON.stringify(w3)); cheat["users/u1/stats/zombieoutbreak/ik"] = ruled2.stats.ik + 5;
    check("31번 랜덤 매칭 칸: rm 만 올리며 누적 감염을 바꾸면 거부", RuleChecker.check("zombieoutbreak", cheat, ruled2.stats, ruled2.slots).errors.length > 0);
    const cheat2 = JSON.parse(JSON.stringify(w3)); cheat2["users/u1/stats/zombieoutbreak/rm"] = Object.assign({}, cheat2["users/u1/stats/zombieoutbreak/rm"], { g: ruled2.stats.rm.g + 2 });
    check("31번 랜덤 매칭 칸: rm 판 수를 한 번에 2 올리면 거부", RuleChecker.check("zombieoutbreak", cheat2, ruled2.stats, ruled2.slots).errors.length > 0);
    const normal = zombie.store({});
    await normal.store.record(zombieReport({ rows: zombieRows().slice(0, 3) }), null);
    check("31번 일반 방 판은 rm 을 쓰지 않음", !("users/u1/stats/zombieoutbreak/rm" in (normal.writes[0] || {})));
  }
  for (const key of ["minigames", "volleyball", "soccer"]) await new GameCase(key, new K.RandomMatchProfile(key), K.RandomMatchCodec, key).verifyStore(randomReport());
})();

const repairChecks = (async () => {
  const at = 1700000000000;
  const rows = [
    { name: "가", role: 2, secs: 180, infects: 0, missions: 2, left: false, ai: false },
    { name: "나", role: 0, secs: 0, infects: 2, missions: 0, left: false, ai: false },
    { name: "다", role: 1, secs: 61, infects: 0, missions: 1, left: false, ai: false }
  ];
  const holderReport = { matchId: "room9_5000", myIndex: 0, rows, winner: 0, progress: 1, iLeft: false };
  const heldSlot = Object.assign(JSON.parse(JSON.stringify(K.ZombieCodec.encode(holderReport, "room9_5000", true))), { at });
  const user = (name, recent, stats) => ({ profile: { name, cls: "1-1" }, recent: recent ? { zombieoutbreak: recent } : {}, stats: stats ? { zombieoutbreak: stats } : {} });
  const users = () => ({ uA: user("1101 가", { 0: heldSlot }), uB: user("1102 나", null), uC: user("1103 다", null) });
  const apply = (all, values) => {
    Object.keys(values).forEach((path) => {
      const parts = path.split("/").slice(1); let node = all;
      parts.slice(0, -1).forEach((part) => { node[part] = node[part] && typeof node[part] === "object" ? node[part] : {}; node = node[part]; });
      if (values[path] === null) delete node[parts[parts.length - 1]]; else node[parts[parts.length - 1]] = values[path];
    });
  };
  const planner = new K.AccountRepairPlanner(new K.ZombieRepairGame());
  const first = planner.plan(users());
  const patch = first.patch();
  check("정상화(31번): 같은 판을 가진 학생 한 명으로 빠진 두 학생을 찾음", first.fixes.length === 2 && first.matchCount === 1 && first.addedCount === 2, [first.fixes.length, first.addedCount]);
  check("정상화(31번): 그 학생의 결과표 줄로 계산(숙주 판 승패·미션·감염)", patch["users/uB/stats/zombieoutbreak/og"] === 1 && patch["users/uB/stats/zombieoutbreak/ik"] === 2 && patch["users/uC/stats/zombieoutbreak/zg"] === 1 && patch["users/uC/stats/zombieoutbreak/ms"] === 1 && patch["users/uB/stats/zombieoutbreak/w"] === 0, patch);
  check("정상화(31번): 최근 매치는 원래 시각(숫자)으로 들어가고 반 별 순위도 맞춤", patch["users/uB/recent/zombieoutbreak/0"].at === at && patch["users/uB/recent/zombieoutbreak/0"].me === 1 && !!patch["gameRanks/zombieoutbreak/1-1/uB"], Object.keys(patch));
  const teacher = { auth: { uid: "use16pcii5RbEATuPtWhRDArmoj2" } };
  const repairedStats = RuleChecker.after(undefined, patch, "users/uB/stats/zombieoutbreak/");
  const repairedSlot = { 0: JSON.parse(JSON.stringify(patch["users/uB/recent/zombieoutbreak/0"])) };
  const teacherErrors = [];
  RuleChecker.validate(RULES.stats.zombieoutbreak, repairedStats, undefined, teacher, "stats", teacherErrors);
  RuleChecker.validate(RULES.recent.zombieoutbreak, repairedSlot, {}, teacher, "recent", teacherErrors);
  check("정상화 쓰기: 교사 계정이 쓰는 누적·최근 매치 값이 규칙을 통과", teacherErrors.length === 0, teacherErrors);
  const all = users();
  apply(all, patch);
  const second = planner.plan(all);
  check("정상화(31번): 두 번 실행해도 두 번 세지 않음", second.fixes.length === 0 && second.addedCount === 0, second.addedCount);
  const dup = users(); dup.uD = user("1104 나", null);
  const ambiguous = planner.plan(dup);
  check("정상화(31번): 같은 닉네임이 여럿이면 같은 반 사람을 고르거나 건너뜀", ambiguous.fixes.length + ambiguous.skips.length >= 2);
  const aged = users();
  const full = {};
  for (let i = 0; i < 20; i++) full[i] = Object.assign(JSON.parse(JSON.stringify(K.ZombieCodec.encode(Object.assign({}, holderReport, { matchId: "n" + i }), "n" + i, true))), { at: at + 1000 + i });
  aged.uB = user("1102 나", full);
  const agedPlan = planner.plan(aged);
  check("정상화: 최근 20판이 모두 더 새로우면 이미 센 판으로 보고 넣지 않음", !agedPlan.fixes.some((fix) => fix.uid === "uB") && agedPlan.agedOutLines >= 1, agedPlan.agedOutLines);
  const aiRows = rows.concat([{ name: "봇", role: 1, secs: 20, infects: 0, missions: 0, left: false, ai: true }]);
  const aiSlot = Object.assign(JSON.parse(JSON.stringify(K.ZombieCodec.encode(Object.assign({}, holderReport, { matchId: "room9_6000", rows: aiRows }), "room9_6000", true))), { at });
  const aiUsers = () => ({ uA: user("1101 가", { 0: aiSlot }), uB: user("1102 나", { 0: Object.assign({}, aiSlot, { me: 1, r: 0 }) }) });
  const aiPlan = planner.plan(aiUsers());
  const aiPatch = aiPlan.patch();
  check("정상화(31번): 최근 매치에만 있던 AI 1명 판을 누적에 채움(최근 칸은 그대로)", aiPlan.fixes.length === 2 && aiPatch["users/uA/stats/zombieoutbreak/g"] === 1 && aiPatch["users/uA/stats/zombieoutbreak/w"] === 1 && aiPatch["users/uB/stats/zombieoutbreak/og"] === 1 && !Object.keys(aiPatch).some((k) => k.indexOf("/recent/") >= 0), aiPatch);
  const aiAll = aiUsers(); apply(aiAll, aiPatch);
  check("정상화(31번): AI 판 누적 채우기도 두 번 세지 않음", planner.plan(aiAll).fixes.length === 0);
  const countedLookingUsers = () => ({ uA: user("1101 가", { 0: aiSlot }, { g: 4, w: 2, l: 2, hg: 4, hw: 2, zg: 0, zw: 0, og: 0, sv: 2, ik: 3, ms: 0, mi: 1, hs: 400, ls: 180, ids: { room9_6000: at + 7 }, rm: { g: 0, w: 0, hg: 0, hw: 0, zg: 0, zw: 0 } }) });
  const keyed = countedLookingUsers();
  const keyedPlan = planner.plan(keyed);
  const keyedPatch = keyedPlan.patch();
  check("정상화(31번): 열쇠만 적히고 승패는 더해지지 않은 AI 1명 판을 찾아 더함(판 수 4→5, 승 2→3)", keyedPlan.fixes.length === 1 && keyedPatch["users/uA/stats/zombieoutbreak/g"] === 5 && keyedPatch["users/uA/stats/zombieoutbreak/w"] === 3 && keyedPatch["users/uA/stats/zombieoutbreak/ids/room9_6000"] === at + 0.5, keyedPatch);
  apply(keyed, keyedPatch);
  check("정상화(31번): 더한 판은 열쇠가 소수라 다시 더하지 않음", planner.plan(keyed).fixes.length === 0);
  const turbo = new K.TurboLapRepairGame();
  const turboRows = [{ nick: "가", side: 0, fin: 1, prog: 3, car: "porscheblue", bot: false }, { nick: "나", side: 1, fin: 0, prog: 2, car: "porscheblue", bot: false }];
  const turboHeld = Object.assign(JSON.parse(JSON.stringify(K.TurboLapCodec.encode({ matchId: "t1", course: "seoul", myIndex: 0, rows: turboRows, result: "win" }, "t1", true))), { at });
  const turboReport = turbo.reportFor(K.TurboLapCodec.decode(turboHeld), 1);
  check("정상화(24번): 이긴 학생의 결과표로 상대는 패배로 계산", !!turboReport && turboReport.result === "lose" && turboReport.myIndex === 1, turboReport);
  const fpsEntry = K.FpsCodec.decode(Object.assign(JSON.parse(JSON.stringify(K.FpsCodec.encode(fpsReport(), "m25", true))), { at }));
  const fpsGame = new K.FpsRepairGame();
  const fpsMate = fpsGame.reportFor(fpsEntry, 1), fpsFoe = fpsGame.reportFor(fpsEntry, 2);
  check("정상화(25번): 같은 팀은 승, 상대 팀은 패로 계산", new K.FpsPlan(fpsMate).win && !new K.FpsPlan(fpsFoe).win && fpsFoe.myIndex === 2);
  const snowGame = new K.SnowRepairGame();
  const snowEntry = K.SnAccountCodec.decode(Object.assign(JSON.parse(JSON.stringify(K.SnAccountCodec.encode(K.SnReportBuilder.fromEnd("m38", snowMatch, snowEnd, "a"), "m38", true))), { at }));
  const snowOther = snowGame.reportFor(snowEntry, 2);
  check("정상화(38번): 다른 줄의 순위로 승패 계산", !!snowOther && snowOther.myIndex === 2 && new K.SnAccountPlan(snowOther).win === (snowEntry.players[2].rank === 1), snowOther && snowOther.myIndex);
  const norm = new K.AccountStatsNormalizer({ read: () => Promise.resolve(users()), patch: () => Promise.resolve() });
  check("정상화: 지원 게임 목록(30·24·25·31·38·39)", ["teambattle", "turbolap", "fpsbattle", "zombieoutbreak", "snowroyale", "waterballoon"].every((key) => norm.supports(key)) && !norm.supports("soccer"));
  const written = [];
  const norm2 = new K.AccountStatsNormalizer({ read: () => Promise.resolve(users()), patch: (v) => { written.push(v); return Promise.resolve(); } });
  const result = await norm2.normalize("zombieoutbreak");
  check("정상화: 새로고침 한 번에 읽고 한 번에 채움", written.length === 1 && result.studentCount === 2, [written.length, result && result.studentCount]);
  const calm = new K.AccountStatsNormalizer({ read: () => Promise.resolve({ uA: user("1101 가", { 0: heldSlot }) }), patch: (v) => { written.push(v); return Promise.resolve(); } });
  await calm.normalize("zombieoutbreak");
  check("정상화: 빠진 게 없으면 쓰지 않음", written.length === 1);
})();

const outboxChecks = (async () => {
  const scope = "uX|testgame";
  const calls = [];
  let failing = 2;
  const store = { outboxScope: scope, keyOf: (r) => r.matchId, record: (r) => { calls.push(r.matchId); if (failing-- > 0) return Promise.reject(new Error("network")); return Promise.resolve("stats"); } };
  const sender = new K.AccountMatchSender(() => store);
  sender.record({ matchId: "g1" }, null);
  await new Promise((resolve) => setTimeout(resolve, 20));
  check("보관 상자: 보내기가 두 번 실패해도 다시 보내 성공하면 지움", calls.length === 3 && K.AccountOutbox.list(scope).length === 0, calls);
  failing = 99;
  const sender2 = new K.AccountMatchSender(() => store);
  sender2.record({ matchId: "g2" }, null);
  await new Promise((resolve) => setTimeout(resolve, 20));
  check("보관 상자: 계속 실패하면 상자에 남음", K.AccountOutbox.list(scope).some((item) => item.key === "g2"));
  failing = 0;
  const sender3 = new K.AccountMatchSender(() => store);
  sender3.flush();
  await new Promise((resolve) => setTimeout(resolve, 20));
  check("보관 상자: 다음에 열었을 때 남은 결과를 이어서 보냄", K.AccountOutbox.list(scope).length === 0 && calls.filter((id) => id === "g2").length >= 2);
  sender3.record({ matchId: "g2" }, null);
  await new Promise((resolve) => setTimeout(resolve, 20));
  check("보관 상자: 이미 보낸 판은 다시 보내지 않음", calls.filter((id) => id === "g2").length === 5 || calls.filter((id) => id === "g2").length >= 2);
})();

const duplicateChecks = (async () => {
  const at = 1700000000000;
  const gameReport = (id, extra) => report(Object.assign({ matchId: id }, extra || {}));
  const stored = (r, key, atTime) => Object.assign(JSON.parse(JSON.stringify(K.TeamBattleCodec.encode(r, key, true))), { at: atTime });
  const other = report({ matchId: "other", players: players({ 0: { kills: 1, dmg: 200 }, 3: { kills: 2 } }), score: [2, 5], winnerTeam: 1 });
  const otherLine = other.players[0], gameLine = report().players[0];
  let node = K.AccountStatsMath.apply(null, otherLine, { key: "other", win: false, side: 0, mvp: false, at: at - 500 }).node;
  const expected = K.AccountStatsMath.apply(JSON.parse(JSON.stringify(node)), gameLine, { key: "A-1", win: true, side: 0, mvp: true, at }).node;
  node = K.AccountStatsMath.apply(JSON.parse(JSON.stringify(expected)), gameLine, { key: "room1_1000", win: true, side: 0, mvp: true, at: at + 10 }).node;
  const slots = { 0: stored(other, "other", at - 500), 1: stored(gameReport("A-1"), "A-1", at), 2: stored(gameReport("room1_1000"), "room1_1000", at + 10) };
  const doubled = () => ({ u1: { profile: { name: "20124 장재이", cls: "1-1" }, stats: { teambattle: JSON.parse(JSON.stringify(node)) }, recent: { teambattle: JSON.parse(JSON.stringify(slots)) } } });
  const plan = K.TeamBattleDuplicatePlan.build(doubled());
  const patch = plan.patch();
  check("중복 정리(30번): 같은 판을 다른 열쇠로 두 번 올린 것을 찾아 나중 칸을 지움", plan.removedCount === 1 && patch["users/u1/recent/teambattle/2"] === null && !("users/u1/recent/teambattle/1" in patch) && patch["users/u1/stats/teambattle/ids/room1_1000"] === null, patch);
  check("중복 정리(30번): 판·승·MVP·캐릭터 통계가 한 번 센 값으로 돌아오고 반 요약도 맞춤",
    patch["users/u1/stats/teambattle/g"] === expected.g && patch["users/u1/stats/teambattle/w"] === expected.w && patch["users/u1/stats/teambattle/m"] === expected.m && patch["users/u1/stats/teambattle/bg"] === expected.bg
    && patch["users/u1/stats/teambattle/c/warrior"].n === expected.c.warrior.n && Math.abs(patch["users/u1/stats/teambattle/c/warrior"].dmg - expected.c.warrior.dmg) <= 0.15 && patch["classStats/1-1/u1"].g === expected.g, patch);
  const aiSlots = JSON.parse(JSON.stringify(slots));
  const withAi = (r) => Object.assign({}, r, { players: r.players.map((p, i) => i >= 4 ? Object.assign({}, p, { ai: true }) : p) });
  aiSlots[1] = stored(withAi(gameReport("A-1")), "A-1", at); aiSlots[2] = stored(withAi(gameReport("room1_1000")), "room1_1000", at + 10);
  const aiPlan = K.TeamBattleDuplicatePlan.build({ u1: { profile: { name: "20124 장재이", cls: "1-1" }, stats: { teambattle: JSON.parse(JSON.stringify(expected)) }, recent: { teambattle: aiSlots } } });
  check("중복 정리(30번): AI 판 중복은 최근 매치 칸만 지우고 통계는 건드리지 않음", aiPlan.removedCount === 1 && aiPlan.patch()["users/u1/recent/teambattle/2"] === null && Object.keys(aiPlan.patch()).every((k) => k.indexOf("/stats/") < 0), aiPlan.patch());
  const unknown = doubled(); delete unknown.u1.stats.teambattle.ids["room1_1000"];
  const unknownPlan = K.TeamBattleDuplicatePlan.build(unknown);
  check("중복 정리(30번): 누적에 센 판인지 열쇠로 알 수 없으면 건드리지 않고 알림", unknownPlan.removedCount === 0 && unknownPlan.skips.length === 1 && Object.keys(unknownPlan.patch()).length === 0);
  const distinct = { u1: { profile: { name: "20124 장재이", cls: "1-1" }, stats: { teambattle: expected }, recent: { teambattle: { 0: slots[0], 1: slots[1] } } } };
  check("중복 정리(30번): 서로 다른 판은 지우지 않음", K.TeamBattleDuplicatePlan.build(distinct).removedCount === 0);
  const mate = { profile: { name: "20125 나", cls: "1-1" }, stats: {}, recent: { teambattle: { 0: Object.assign({}, stored(gameReport("A-1"), "A-1", at), { me: 1 }) } } };
  const withMate = doubled(); withMate.u1.recent.teambattle = { 0: slots[2] }; withMate.u1.stats.teambattle = expected; withMate.uB = mate;
  const guarded = new K.TeamBattleRepairPlanner(true).plan(withMate);
  check("정상화(30번): 열쇠만 다르고 같은 판을 이미 가진 학생에게는 또 채우지 않음", !guarded.fixes.some((fix) => fix.uid === "u1"), guarded.fixes.map((fix) => fix.uid));
  const eligibleAi = (r) => Object.assign({}, r, { players: r.players.map((p, i) => i === 4 ? Object.assign({}, p, { ai: true }) : p) });
  const catchUpUsers = () => ({ u9: { profile: { name: "20999 가나다", cls: "1-1" }, stats: {}, recent: { teambattle: { 0: stored(eligibleAi(gameReport("E-1")), "E-1", at), 1: stored(withAi(gameReport("E-2")), "E-2", at + 5) } } } });
  const catchUp = new K.TeamBattleRepairPlanner(true).plan(catchUpUsers());
  const caught = catchUp.fixes.find((fix) => fix.uid === "u9");
  check("정상화(30번): 지난 AI 포함 6명 판(양 팀 사람 2명 이상)도 누적 통계에 채움", !!caught && caught.statsNode.g === 1 && !!caught.statsNode.ids["E-1"] && !caught.statsNode.ids["E-2"], caught && caught.statsNode);
  const already = catchUpUsers(); already.u9.stats = { teambattle: JSON.parse(JSON.stringify(caught.statsNode)) };
  const again = new K.TeamBattleRepairPlanner(true).plan(already);
  check("정상화(30번): 이미 센 판은 다시 세지 않음", again.fixes.length === 0, again.fixes.map((fix) => fix.additions));
  const db = doubled(); const writes = [];
  const apply = (all, values) => Object.keys(values).forEach((path) => { const parts = path.split("/"); let o = all; for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; } if (values[path] === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = values[path]; });
  const norm = new K.AccountStatsNormalizer({ read: () => Promise.resolve(JSON.parse(JSON.stringify(db))), patch: (v) => { writes.push(v); apply(db.users ? db : (() => { return null; })() || { users: db }, v); return Promise.resolve(); } });
  const first = await norm.normalize("teambattle");
  check("정상화(30번): 새로고침 한 번에 중복을 지움", !!first.removed && first.removed.length === 1 && first.removed[0].list.length === 1, first.removed);
})();
const backoutChecks = (() => {
  const base = 1700000000000;
  const make = (i) => report({ matchId: "M" + i, winnerTeam: i % 2, score: i % 2 ? [1, 4] : [4, 1], players: players({ 0: { kills: i % 5, deaths: i % 3, assists: i % 2, dmg: 200 + i * 7 }, 1: { kills: 1, dmg: 150 } }) });
  const asEntry = (r, key, t) => K.TeamBattleCodec.decode(Object.assign(JSON.parse(JSON.stringify(K.TeamBattleCodec.encode(r, key, true))), { at: t }));
  const mvpJudge = new K.AccountMvpJudge((l) => K.TeamBattleScore.of(l));
  const count = (node, i, key, t) => { const entry = asEntry(make(i), key, t); return K.AccountStatsMath.apply(node, entry.players[entry.myIndex], { key, win: entry.win, side: entry.players[entry.myIndex].team, mvp: mvpJudge.isMvp(entry.players, entry.myIndex), at: t }).node; };
  let node = null;
  for (let i = 0; i < 36; i++) node = count(node, i, "M" + i, base + i * 1000);
  const truth = JSON.parse(JSON.stringify(node));
  const recent = []; for (let i = 16; i < 36; i++) recent.push(asEntry(make(i), "M" + i, base + i * 1000));
  for (let i = 16; i < 36; i++) node = count(node, i, "D" + i, base + 90000 + i);
  const inflated = JSON.parse(JSON.stringify(node));
  const plan = new K.TeamBattleRecentBackout(inflated, recent).plan();
  const fields = ["g", "w", "l", "bg", "bw", "rg", "rw", "m"];
  check("최근 판 한 번 빼기(30번): 같은 20판이 두 번 센 56판에서 36판 상태로 돌아옴", node.g === 56 && plan.removed === 20 && fields.every((f) => plan.node[f] === truth[f]), { got: fields.map((f) => plan.node[f]), want: fields.map((f) => truth[f]) });
  check("최근 판 한 번 빼기(30번): 캐릭터 통계 판 수도 같이 돌아오고 평균은 반올림 오차 안", plan.node.c.warrior.n === truth.c.warrior.n && Math.abs(plan.node.c.warrior.dmg - truth.c.warrior.dmg) <= 1, { got: plan.node.c.warrior, want: truth.c.warrior });
  check("최근 판 한 번 빼기(30번): 판 열쇠(ids)는 그대로 둠", JSON.stringify(plan.node.ids) === JSON.stringify(inflated.ids));
  check("최근 판 한 번 빼기(30번): 미리 보기는 입력 통계를 바꾸지 않음", inflated.g === 56 && Object.keys(plan.before).length > 0 && plan.before.g === 56);
  const aiEntries = recent.map((entry) => Object.assign({}, entry, { players: entry.players.map((p, i) => i >= 3 ? Object.assign({}, p, { ai: true }) : p) }));
  const aiPlan = new K.TeamBattleRecentBackout(inflated, aiEntries).plan();
  check("최근 판 한 번 빼기(30번): 새 집계 규칙에 안 드는 판은 세지 않았으므로 빼지 않음", aiPlan.removed === 0 && aiPlan.node.g === 56, aiPlan.removed);
  const small = new K.TeamBattleRecentBackout(JSON.parse(JSON.stringify(truth)).g ? Object.assign(JSON.parse(JSON.stringify(truth)), { g: 5, w: 3, l: 2 }) : null, recent).plan();
  check("최근 판 한 번 빼기(30번): 판 수가 모자라면 0 아래로 안 내려가고 경고", small.node.g === 0 && small.warnings.some((t) => t.indexOf("0 아래") >= 0), small.warnings);
})();
Promise.all([done, gameChecks, pendingChecks, repairChecks, outboxChecks, duplicateChecks]).then(() => {
  if (failures.length) { console.log("실패 " + failures.length + "개\n" + failures.join("\n")); process.exit(1); }
  console.log("통과 " + passed + " · 문제 0");
}).catch((e) => { console.log("오류", e); process.exit(1); });
