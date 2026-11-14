const fs = require("fs"), path = require("path");

class BaseballRuleText {
  static admin() { return "(auth.uid === 'use16pcii5RbEATuPtWhRDArmoj2' || auth.uid === 'HFcjiyXAl1YWzm3AyrZmzo4uMdG3')"; }
  static before() { return "(data.exists() ? data.val() : 0)"; }
  static grows(cap) { return "(newData.isNumber() && newData.val() >= " + BaseballRuleText.before() + " && newData.val() <= " + BaseballRuleText.before() + " + " + cap + ") || " + BaseballRuleText.admin(); }
  static plusOne() { return "(newData.isNumber() && newData.val() === " + BaseballRuleText.before() + " + 1) || " + BaseballRuleText.admin(); }
  static best(cap) { return "(newData.isNumber() && newData.val() >= " + BaseballRuleText.before() + " && newData.val() <= " + cap + ") || " + BaseballRuleText.admin(); }
  static number(low, high) { return "newData.isNumber() && newData.val() >= " + low + " && newData.val() <= " + high; }
  static list(names) { return "[" + names.map((name) => "'" + name + "'").join(", ") + "]"; }
}

class BaseballRules {
  static get BAT() { return { pa: 60, ab: 60, h: 60, d2: 60, d3: 60, hr: 60, bb: 60, k: 60, sf: 60, rbi: 99, r: 99, roe: 60 }; }
  static get PIT() { return { bf: 60, ab: 60, h: 60, d2: 60, d3: 60, hr: 60, bb: 60, k: 60, sf: 60, outs: 50, r: 99, er: 99, pitches: 300, strikes: 300 }; }
  static get RECORD() { return ["g", "w", "l", "t", "rf", "ra"]; }

  static counts(caps, extra) {
    const node = Object.assign({ ".validate": "newData.hasChildren(" + BaseballRuleText.list(Object.keys(caps)) + ")" }, extra || {});
    Object.keys(caps).forEach((key) => { node[key] = { ".validate": BaseballRuleText.grows(caps[key]) }; });
    node.$other = { ".validate": false };
    return node;
  }

  static record(extra) {
    const A = BaseballRuleText.admin();
    const node = {
      ".validate": "(newData.hasChildren(['g', 'w', 'l', 't', 'rf', 'ra', 'bat', 'pit']) && newData.child('w').val() + newData.child('l').val() + newData.child('t').val() === newData.child('g').val()) || " + A,
      g: { ".validate": BaseballRuleText.plusOne() }, w: { ".validate": BaseballRuleText.grows(1) }, l: { ".validate": BaseballRuleText.grows(1) }, t: { ".validate": BaseballRuleText.grows(1) },
      rf: { ".validate": BaseballRuleText.grows(99) }, ra: { ".validate": BaseballRuleText.grows(99) },
      bat: BaseballRules.counts(BaseballRules.BAT), pit: BaseballRules.counts(BaseballRules.PIT)
    };
    Object.assign(node, extra || {});
    node.$other = { ".validate": false };
    return node;
  }

  static ability(caps) {
    const node = BaseballRules.counts(caps);
    node[".validate"] = "$k.matches(/^[1-7]-[1-7]-[1-7]$/) && newData.hasChildren(" + BaseballRuleText.list(["g"].concat(Object.keys(caps))) + ")";
    node.g = { ".validate": BaseballRuleText.plusOne() };
    return { $k: node };
  }

  static stats() {
    const A = BaseballRuleText.admin();
    const zone = BaseballRules.counts({ n: 300, ab: 60, h: 60, tb: 240 });
    zone[".validate"] = "$z.matches(/^[0-9]$/)";
    const kind = BaseballRules.counts({ n: 300, s: 300 });
    kind[".validate"] = "$p.matches(/^(ft|cv|sl|ch|kn)$/)";
    const node = BaseballRules.record({
      bt: { $p: kind },
      bd: { ".validate": BaseballRuleText.best(250) }, be: { ".validate": BaseballRuleText.best(250) }, bs: { ".validate": BaseballRuleText.best(250) },
      zb: { $z: zone },
      zp: { $z: { ".validate": "$z.matches(/^[0-9]$/) && ((newData.isNumber() && newData.val() >= " + BaseballRuleText.before() + " && newData.val() <= " + BaseballRuleText.before() + " + 300) || " + A + ")" } },
      ab: BaseballRules.ability(BaseballRules.BAT),
      ap: BaseballRules.ability(BaseballRules.PIT),
      rm: BaseballRules.record(),
      ids: { $id: { ".validate": "($id.length >= 1 && $id.length <= 60 && newData.isNumber() && !data.exists()) || " + A } }
    });
    return Object.assign({ ".write": "auth != null && " + A }, node);
  }

  static recent() {
    const A = BaseballRuleText.admin(), cell = (pattern, high) => ({ $i: { ".validate": "$i.matches(/^[01]$/)", $j: { ".validate": "$j.matches(" + pattern + ") && " + BaseballRuleText.number(0, high) } } });
    return {
      ".write": "auth != null && " + A,
      $slot: {
        ".validate": "$slot.matches(/^([0-9]|1[0-9])$/) && newData.hasChildren(['v', 'id', 'at', 'r', 't', 'rd', 'me', 'st', 'n', 's', 'b', 'p'])",
        v: { ".validate": BaseballRuleText.number(1, 99) },
        id: { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 60" },
        at: { ".validate": "(newData.val() === now) || (" + A + " && newData.isNumber() && newData.val() <= now)" },
        r: { ".validate": "newData.val() === 0 || newData.val() === 1" },
        t: { ".validate": "newData.val() === 0 || newData.val() === 1" },
        rd: { ".validate": "newData.val() === 0 || newData.val() === 1" },
        me: { ".validate": "newData.val() === 0 || newData.val() === 1" },
        st: { ".validate": BaseballRuleText.number(1, 15) },
        n: { $i: { ".validate": "$i.matches(/^[01]$/) && newData.isString() && newData.val().length <= 20" } },
        s: { $i: { ".validate": "$i.matches(/^[01]$/) && " + BaseballRuleText.number(0, 999) } },
        ls: { $i: { ".validate": "$i.matches(/^([0-9]|1[0-4])$/)", $j: { ".validate": "$j.matches(/^[01]$/) && " + BaseballRuleText.number(0, 999) } } },
        b: cell("/^[0-7]$/", 999),
        p: cell("/^[0-7]$/", 999),
        bd: { ".validate": BaseballRuleText.number(0, 300) },
        bs: { ".validate": BaseballRuleText.number(0, 300) },
        $other: { ".validate": false }
      }
    };
  }

  static roster(code) {
    const plan = code.BbRosterPlan, closed = { ".validate": false };
    const points = (abilityPlan) => {
      const keys = abilityPlan.items.map((item, index) => String(index)), node = { ".validate": "newData.hasChildren(" + BaseballRuleText.list(keys) + ") && " + keys.map((key) => "newData.child('" + key + "').val()").join(" + ") + " <= " + abilityPlan.total };
      keys.forEach((key) => { node[key] = { ".validate": "newData.isNumber() && newData.val() >= " + abilityPlan.least + " && newData.val() <= " + abilityPlan.most + " && newData.val() % 1 === 0" }; });
      node.$other = closed;
      return node;
    };
    const player = (abilityPlan, extra) => Object.assign({
      ".validate": "newData.hasChildren(" + BaseballRuleText.list(["a", "h"].concat(Object.keys(extra))) + ")",
      a: points(abilityPlan),
      h: { ".validate": "newData.val() === 'R' || newData.val() === 'L'" },
      l: { ".validate": "newData.isString() && newData.val().length <= 400" }
    }, extra, { $other: closed });
    const list = (count, item) => ({ ".validate": "newData.hasChildren(" + BaseballRuleText.list(Array.from({ length: count }, (_, index) => String(index))) + ")", $i: Object.assign({}, item, { ".validate": "$i.matches(/^[0-" + (count - 1) + "]$/) && " + item[".validate"] }) });
    const pitcher = player(code.BbAbilityAllocator.PITCHER, { k: { ".validate": "newData.isString() && newData.val().matches(/^ft(,(cv|sl|ch|kn)){0,4}$/)" } });
    const batter = player(code.BbAbilityAllocator.BATTER, { o: { ".validate": "newData.isString() && newData.val().matches(/^(" + plan.BATTING_ORDER.join("|") + ")$/)" } });
    return {
      baseballduel: {
        ".validate": "newData.hasChildren(['v', 'p', 'b'])",
        v: { ".validate": "newData.val() === 3" },
        p: list(plan.pitcherCount(), pitcher),
        b: list(plan.batterCount(), batter),
        $other: closed
      },
      $other: closed
    };
  }

  static top() {
    const A = BaseballRuleText.admin(), school = "auth.token.email_verified === true && auth.token.email.endsWith('@dongma.sen.ms.kr')";
    const numbers = { $k: { ".validate": "newData.isNumber() && newData.val() >= 0" } };
    return {
      ".read": true,
      rooms: { $room: { ".write": "$room.matches(/^[0-9]{5}$/)" } },
      parties: { $party: { ".write": "$party.matches(/^[0-9]{5}$/)" } },
      board: {
        $uid: {
          ".write": "auth != null && ((auth.uid === $uid && " + school + ") || " + A + ")",
          ".validate": "!newData.exists() || " + A + " || (newData.hasChildren(['n', 'c', 'g', 'bat', 'pit']) && newData.child('g').val() === newData.parent().parent().parent().child('users').child($uid).child('stats').child('baseballduel').child('g').val())",
          n: { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 40" },
          c: { ".validate": "newData.isString() && newData.val().matches(/^([1-3]-[1-5]|none)$/)" },
          g: { ".validate": "newData.isNumber() && newData.val() >= 0" },
          bat: numbers, pit: numbers,
          $other: { ".validate": false }
        }
      },
      settings: { ".write": "auth != null && " + A, zones: { ".validate": "newData.isBoolean()" }, $other: { ".validate": false } }
    };
  }
}

class BaseballRulesPatch {
  constructor(file) {
    this.file = file;
    this.raw = fs.readFileSync(file, "utf8");
    this.eol = this.raw.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
    this.text = this.raw.replace(/\r\n/g, "\n");
  }

  static block(name, value, indent) {
    const pad = " ".repeat(indent);
    const body = JSON.stringify(value, null, 2).split("\n").map((line, i) => (i === 0 ? line : pad + line)).join("\n");
    return pad + JSON.stringify(name) + ": " + body;
  }

  removeBlock(startText) {
    const found = this.text.indexOf("\n" + startText);
    if (found < 0) return false;
    const start = found + 1;
    let depth = 0, index = this.text.indexOf("{", start), inString = false;
    for (; index < this.text.length; index++) {
      const ch = this.text[index];
      if (inString) { if (ch === "\\") index++; else if (ch === '"') inString = false; continue; }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) break;
    }
    let end = index + 1;
    if (this.text[end] === ",") end++;
    if (this.text[end] === "\n") end++;
    this.text = this.text.slice(0, start) + this.text.slice(end);
    return true;
  }

  insertBefore(anchor, block) {
    const found = this.text.indexOf("\n" + anchor);
    if (found < 0) throw new Error("자리를 찾지 못했어요: " + anchor.slice(0, 60));
    const at = found + 1;
    this.text = this.text.slice(0, at) + block + ",\n" + this.text.slice(at);
  }

  addToGameLists() {
    this.text = this.text.replace(/\|soccer\)\$\//g, "|soccer|baseballduel)$/");
    this.text = this.text.replace(/\|soccer\|baseballduel\|baseballduel\)/g, "|soccer|baseballduel)");
  }

  apply() {
    const game = "baseballduel";
    this.removeBlock('    "' + game + '": {');
    this.removeBlock('          "' + game + '": {');
    this.removeBlock('         "' + game + '": {');
    this.insertBefore('    "waterballoon": {\n      ".read": true,', BaseballRulesPatch.block(game, BaseballRules.top(), 4));
    this.insertBefore('          "$game": { ".validate": "$game.matches(/^(teambattle|', BaseballRulesPatch.block(game, BaseballRules.stats(), 10));
    this.insertBefore('         "$game": { ".validate": "$game.matches(/^(teambattle|', BaseballRulesPatch.block(game, BaseballRules.recent(), 9));
    this.removeBlock('        "roster": {');
    this.insertBefore('        "personal": {', BaseballRulesPatch.block("roster", BaseballRules.roster(require("./baseball-load.js").load()), 8));
    this.addToGameLists();
  }

  save() { fs.writeFileSync(this.file, this.text.replace(/\n/g, this.eol), "utf8"); }
}

const file = path.join(__dirname, "..", "데이터베이스규칙.json");
const patch = new BaseballRulesPatch(file);
patch.apply();
patch.save();
const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
const users = parsed.rules.users.$uid;
console.log("데이터베이스규칙.json 에 baseballduel 규칙을 넣었어요. JSON 문법 OK ·",
  "stats:", !!users.stats.baseballduel, "recent:", !!users.recent.baseballduel, "roster:", !!(users.roster && users.roster.baseballduel), "board:", !!parsed.rules.baseballduel.board,
  "목록:", users.stats.$game[".validate"].indexOf("baseballduel") > 0 && users.recent.$game[".validate"].indexOf("baseballduel") > 0 && users.pending.$game[".validate"].indexOf("baseballduel") > 0 && parsed.rules.gameRanks.$game.$cls.$uid[".validate"].indexOf("baseballduel") > 0);
