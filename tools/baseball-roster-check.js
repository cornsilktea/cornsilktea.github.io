// 41번 야구 선수단 저장 검사: 계정 DB 모양(BbRosterCodec) 왕복·크기·옛 v2 옮기기·데이터베이스 규칙(users/$uid/roster/baseballduel) 통과/거절.
// 사용: npx tsc -p . 다음에 node tools/baseball-roster-check.js
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");

class RosterCode {
  static FILES = ["games/41.baseball-duel/41.baseball-motion.js", "games/41.baseball-duel/41.baseball-field.js", "games/41.baseball-duel/41.baseball-pitch.js", "games/41.baseball-duel/41.baseball-batting.js",
    "games/41.baseball-duel/41.baseball-running.js", "games/41.baseball-duel/41.baseball-defense.js", "games/41.baseball-duel/41.baseball-play.js", "games/41.baseball-duel/41.baseball-game.js",
    "games/41.baseball-duel/41.baseball-ai.js", "common/character-kit.js", "games/41.baseball-duel/41.baseball-sheet.js"];

  static load() {
    const store = new Map();
    const localStorage = { getItem: (key) => store.has(key) ? store.get(key) : null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
    const window = { localStorage, addEventListener() {}, PORTAL_USER: null };
    const document = { addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, appendChild() {} }) };
    const source = RosterCode.FILES.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n") + "\n;({BbRosterCodec, BbProfileStore, BbRosterPlan, BbAiLevel, CharacterLooks})";
    const code = vm.runInNewContext(source, { console, Math, Map, Set, Array, Object, Number, Infinity, JSON, String, RegExp, window, document, localStorage });
    code.storage = store;
    return code;
  }
}

class RuleNode {
  constructor(value) { this.value = value === null ? undefined : value; }
  val() { return this.value === undefined ? null : this.value; }
  exists() { return this.value !== undefined; }
  child(name) { return new RuleNode(this.value && typeof this.value === "object" ? this.value[name] : undefined); }
  hasChildren(list) { return !!this.value && typeof this.value === "object" && list.every((key) => this.value[key] !== undefined && this.value[key] !== null); }
  isNumber() { return typeof this.value === "number"; }
  isString() { return typeof this.value === "string"; }
}

class RosterRules {
  constructor() {
    String.prototype.matches = function (re) { return re.test(String(this)); };
    this.rule = JSON.parse(fs.readFileSync(path.join(root, "데이터베이스규칙.json"), "utf8")).rules.users.$uid.roster;
  }

  errors(value) {
    const found = [];
    this.walk(this.rule, { baseballduel: value }, {}, "roster", found);
    return found;
  }

  walk(rule, value, vars, label, found) {
    if (rule[".validate"] === false) found.push(label);
    if (typeof rule[".validate"] === "string") {
      const names = Object.keys(vars), test = new Function("newData", "data", ...names, "return (" + rule[".validate"] + ");");
      if (!test(new RuleNode(value), new RuleNode(undefined), ...names.map((name) => vars[name]))) found.push(label);
    }
    if (!value || typeof value !== "object") return;
    Object.keys(value).forEach((key) => {
      const exact = rule[key], wild = Object.keys(rule).find((name) => name[0] === "$");
      const child = exact && typeof exact === "object" ? exact : wild ? rule[wild] : null;
      if (child) this.walk(child, value[key], Object.assign({}, vars, !exact && wild ? { [wild]: key } : {}), label + "/" + key, found);
    });
  }
}

class RosterCheck {
  constructor() { this.code = RosterCode.load(); this.rules = new RosterRules(); this.passed = 0; this.failed = []; }
  ok(condition, label, detail) { if (condition) this.passed++; else this.failed.push(label + (detail ? " — " + JSON.stringify(detail).slice(0, 200) : "")); }
  clone(value) { return JSON.parse(JSON.stringify(value)); }

  sample() {
    const c = this.code, profile = c.BbProfileStore.blank();
    profile.lineup[0].abilities = { contact: 5, power: 2, speed: 1, defense: 4 };
    profile.lineup[0].hand = "L";
    c.BbRosterPlan.swapPosition(profile.lineup, 0, "SS");
    profile.pitchers[2].abilities = { control: 2, power: 2, breaking: 7, stamina: 1 };
    profile.pitchers[2].pitches = ["ft", "cv", "sl", "ch", "kn"];
    const look = c.CharacterLooks.createDefault();
    look.c = 3; look.p.top = "#d97b4f"; look.p.hair = 2;
    profile.looks.b[0] = look; profile.looks.p[1] = look;
    return profile;
  }

  codec() {
    const c = this.code, profile = this.sample(), row = this.clone(c.BbRosterCodec.toRow(profile)), back = c.BbRosterCodec.fromRow(row);
    this.ok(!!back, "DB 모양 → 선수단으로 되돌림");
    this.ok(back && JSON.stringify(back.lineup) === JSON.stringify(profile.lineup) && JSON.stringify(back.pitchers) === JSON.stringify(profile.pitchers), "능력치·손·포지션·구종이 그대로");
    this.ok(back && JSON.stringify(back.looks) === JSON.stringify(profile.looks), "선수별 외형(바꾼 선수만)이 그대로", back && back.looks);
    this.ok(!row.b[1].l && !!row.b[0].l && !!row.p[1].l, "바꾸지 않은 선수의 외형은 저장하지 않음");
    const bytes = Buffer.byteLength(JSON.stringify(row), "utf8");
    this.ok(bytes < 3000, "12명 전부 3KB 안 (" + bytes + "B)");
    const keyed = this.clone(row);
    keyed.p = Object.assign({}, keyed.p); keyed.b = Object.assign({}, keyed.b);
    this.ok(!!c.BbRosterCodec.fromRow(keyed), "Firebase 가 배열을 번호 열쇠 객체로 돌려줘도 읽음");
    const broken = (change) => { const copy = this.clone(row); change(copy); return c.BbRosterCodec.fromRow(copy); };
    this.ok(!broken((copy) => copy.b.pop()), "타자 8명이면 거절");
    this.ok(!broken((copy) => { copy.b[1].o = copy.b[2].o; }), "포지션이 겹치면 거절");
    this.ok(!broken((copy) => { copy.p[0].a = [4, 4, 4, 4]; }), "합 16 이면 거절");
    this.ok(!broken((copy) => { copy.v = 2; }), "버전이 다르면 거절");
  }

  migration() {
    const c = this.code;
    c.storage.clear();
    c.storage.set("baseballduel_profile_v2", JSON.stringify({ version: 2, ballpark: "main", lineup: [{ abilities: { contact: 5, power: 2, speed: 2 }, hand: "L" }], pitchers: [{ abilities: { control: 2, power: 5, breaking: 2 }, hand: "R", pitches: ["ft", "cv"], role: "starter" }] }));
    const moved = c.BbProfileStore.load();
    this.ok(moved.lineup.length === 9 && moved.lineup.every((sheet) => sheet.hand === "L" && sheet.abilities.contact === 5 && sheet.abilities.defense === 3), "v2 타자 1명 → 9명, 3종 그대로 + 수비 3");
    this.ok(moved.lineup.map((sheet) => sheet.position).join() === c.BbRosterPlan.BATTING_ORDER.join(), "옮긴 타순은 기본 포지션 순서");
    this.ok(moved.pitchers.map((sheet) => sheet.role).join() === "starter,reliever,closer" && moved.pitchers.every((sheet) => sheet.abilities.power === 5 && sheet.abilities.stamina === 3 && sheet.pitches.join() === "ft,cv"), "v2 투수 1명 → 선발·중간·마무리, 체력 3");
    this.ok(moved.looks.b.length === 9 && moved.looks.p.length === 3 && moved.looks.b.every((look) => look === null), "외형은 비어 있음(학생 본인 외형을 씀)");
    c.storage.set("baseballduel_profile_v3", JSON.stringify({ version: 3, ballpark: "main", lineup: moved.lineup, pitchers: moved.pitchers }));
    this.ok(c.BbProfileStore.load().looks.b.length === 9, "외형 칸이 없던 v3 도 칸을 채워 읽음");
  }

  databaseRules() {
    const c = this.code, row = this.clone(c.BbRosterCodec.toRow(this.sample()));
    this.ok(this.rules.errors(row).length === 0, "정상 선수단은 규칙 통과", this.rules.errors(row));
    const rejected = (label, change) => { const copy = this.clone(row); change(copy); this.ok(this.rules.errors(copy).length > 0, "규칙이 거절: " + label); };
    rejected("능력치 합 13", (copy) => { copy.b[2].a = [4, 3, 3, 3]; });
    rejected("능력치 8", (copy) => { copy.p[0].a = [8, 1, 1, 1]; });
    rejected("능력치 0", (copy) => { copy.p[0].a = [0, 4, 4, 4]; });
    rejected("소수 능력치", (copy) => { copy.p[0].a = [2.5, 3, 3, 3]; });
    rejected("투수 2명", (copy) => { copy.p = copy.p.slice(0, 2); });
    rejected("타자 10명", (copy) => { copy.b.push(copy.b[0]); });
    rejected("없는 포지션 P", (copy) => { copy.b[0].o = "P"; });
    rejected("손 X", (copy) => { copy.b[0].h = "X"; });
    rejected("모르는 구종", (copy) => { copy.p[0].k = "ft,zz"; });
    rejected("너무 긴 외형", (copy) => { copy.p[0].l = "x".repeat(401); });
    rejected("모르는 칸", (copy) => { copy.extra = 1; });
    rejected("선수 안의 모르는 칸", (copy) => { copy.b[0].nick = "a"; });
  }

  run() {
    this.codec();
    this.migration();
    this.databaseRules();
    this.failed.forEach((line) => console.log("실패  " + line));
    console.log(this.failed.length ? "실패 " + this.failed.length + "건 / 통과 " + this.passed + "건" : "모두 통과 (" + this.passed + "항목)");
    process.exit(this.failed.length ? 1 : 0);
  }
}

new RosterCheck().run();
