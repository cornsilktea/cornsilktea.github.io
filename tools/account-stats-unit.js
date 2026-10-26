const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const files = ["account-match-kit.js", "account-stats.js"];
const names = ["AccountNumbers", "AccountRates", "AccountMatchKey", "AccountKeyLedger", "AccountForfeit", "AccountShape", "AccountRecentHeadCodec", "RecentMatchRing", "AccountLoginNotice", "RecentBlockList", "AccountGameProfile", "AccountMatchStore",
  "TeamBattleRates", "AccountMvpJudge", "TeamBattlePlan", "TeamBattleCodec", "TeamBattleRing", "AccountStatsMath", "AccountStatsTable", "ClassStatsSummary", "TeamBattleProfile", "AccountStatsStore"];
const src = files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\n;({" + names.join(",") + "})";
const K = vm.runInNewContext(src, { console, Math, Set, Map, Array, Object, Number, String, JSON, isFinite, Date, Promise, window: {} });

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
  check("10칸 링: 빈 칸부터 채움", ok);
  check("10칸 링: 11번째는 가장 오래된 칸", K.RecentMatchRing.chooseSlot(stored, "m10") === 4);
  check("10칸 링: 같은 열쇠는 무시", K.RecentMatchRing.chooseSlot(stored, "m7") === -1);
  const full = {};
  for (let i = 0; i < 10; i++) full[i] = Object.assign(JSON.parse(JSON.stringify(K.TeamBattleCodec.encode(report(), "m" + i, true))), { at: 1000 + i });
  full[9] = { v: 99, id: "x", at: 5 };
  const list = K.TeamBattleRing.entries(full);
  check("10칸 링: 모르는 버전은 건너뛰고 최신순", list.length === 9 && list[0].at === 1008 && list[8].at === 1000, list.map((e) => e.at));
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

done.then(() => {
  if (failures.length) { console.log("실패 " + failures.length + "개\n" + failures.join("\n")); process.exit(1); }
  console.log("통과 " + passed + " · 문제 0");
}).catch((e) => { console.log("오류", e); process.exit(1); });
