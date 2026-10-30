const fs = require("fs"), path = require("path");

class ForestRulesPatch {
  constructor(file) {
    this.file = file;
    this.raw = fs.readFileSync(file, "utf8");
    this.eol = this.raw.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
    this.text = this.raw.replace(/\r\n/g, "\n");
  }

  static admin() { return "(auth.uid === 'use16pcii5RbEATuPtWhRDArmoj2' || auth.uid === 'HFcjiyXAl1YWzm3AyrZmzo4uMdG3')"; }
  static member() { return "auth != null && (" + ForestRulesPatch.admin() + " || root.child('users').child(auth.uid).child('forest').child('home').val() === $island)"; }
  static anonymous() { return "auth.token.firebase.sign_in_provider === 'anonymous'"; }
  static school() { return "(auth.token.email_verified === true && auth.token.email.endsWith('@dongma.sen.ms.kr'))"; }

  userForest() {
    const A = ForestRulesPatch.admin();
    return {
      ".write": "auth != null && auth.uid === $uid && (" + ForestRulesPatch.school() + " || " + ForestRulesPatch.anonymous() + " || " + A + ")",
      "home": { ".write": "auth != null && " + A, ".validate": "newData.isString() && newData.val().matches(/^([1-3]-[1-5]|test)_[123]$/) && (!data.exists() || " + A + ") && (!(" + ForestRulesPatch.anonymous() + ") || newData.val() === 'test_1')" },
      "probe": { ".validate": "newData.isNumber() && newData.val() === now" },
      "save": {
        ".validate": "newData.hasChildren(['bag', 'ap', 'ring']) && newData.child('ap').isNumber() && newData.child('ap').val() >= 0 && newData.child('ap').val() <= 200 && newData.child('ring').isNumber() && newData.child('ring').val() >= 0 && newData.child('ring').val() <= 10",
        "ap": { ".validate": "newData.isNumber()" },
        "ring": { ".validate": "newData.isNumber()" },
        "bonus": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100" },
        "lastAt": { ".validate": "newData.isNumber()" },
        "bag": { "$i": { ".validate": "$i.matches(/^([0-9]|[1-3][0-9])$/) && newData.hasChildren(['id', 'count', 'uses']) && newData.child('id').isString() && newData.child('id').val().length <= 40 && newData.child('count').isNumber() && newData.child('count').val() >= 1 && newData.child('count').val() <= 30 && newData.child('uses').isNumber() && newData.child('uses').val() >= 0 && newData.child('uses').val() <= 200" } },
        "pity": { "$k": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000" } },
        "seen": { "$i": { ".validate": "newData.isString() && newData.val().length <= 40" } },
        "stats": { ".validate": "newData.hasChildren(['all'])" },
        "chest": { "$id": { ".validate": "$id.matches(/^[a-z_0-9]{1,40}$/) && newData.isNumber() && newData.val() >= 1 && newData.val() <= 3600" } },
        "$other": { ".validate": false },
      },
      "$other": { ".validate": false },
    };
  }

  topLevel() {
    const A = ForestRulesPatch.admin();
    const M = ForestRulesPatch.member();
    return {
      "forestCodes": {
        "$code": {
          ".read": "auth != null",
          ".write": "auth != null && " + A,
          ".validate": "newData.hasChildren(['cls', 'island']) && newData.child('cls').isString() && newData.child('cls').val().matches(/^([1-3]-[1-5]|test)$/) && newData.child('island').isNumber() && (newData.child('island').val() === 1 || newData.child('island').val() === 2 || newData.child('island').val() === 3)",
        },
      },
      "forest": {
        "$island": {
          ".read": M,
          "members": { ".write": M + " && false", "$uid": { ".write": M + " && $uid === auth.uid", ".validate": "newData.hasChildren(['no', 'name']) && newData.child('name').isString() && newData.child('name').val().length <= 12" } },
          "presence": { "$uid": { ".write": M + " && $uid === auth.uid", ".validate": "newData.hasChildren(['a', 's', 'd', 'at']) && newData.child('a').isString() && newData.child('a').val().length <= 12 && (newData.child('s').val() === 0 || newData.child('s').val() === 1) && newData.child('at').val() === now" } },
          "pos": { "$uid": { ".write": M + " && $uid === auth.uid", ".validate": "newData.isString() && newData.val().length <= 48" } },
          "clock": {
            ".write": M,
            ".validate": "newData.hasChildren(['day', 'dawnAt', 'lastSeen']) && newData.child('day').isNumber() && newData.child('day').val() >= 1",
            "frozen": { ".validate": "newData.isBoolean()" },
            "slept": { ".validate": "newData.isBoolean()" },
            "$other": { ".validate": "newData.isNumber()" },
          },
          "jungle": { ".write": M, "$cell": { ".validate": "$cell.matches(/^[0-9]{1,5}$/) && newData.val() === 1" } },
          "terrain": { ".write": M, "$chunk": { "$cell": { ".validate": "$cell.matches(/^[0-9]{1,5}$/) && newData.hasChildren(['0', '1']) && newData.child('0').isNumber() && newData.child('0').val() >= -2 && newData.child('0').val() <= 14 && newData.child('1').isString() && newData.child('1').val().length === 1" } } },
          "snow": { ".write": M, "$cell": { ".validate": "newData.isNumber()" } },
          "build": { "$id": { ".write": M + " && (!data.exists() || " + A + ")", ".validate": "$id.matches(/^[a-z_]{2,24}_[0-9]{1,2}$/) && newData.hasChildren(['at', 'by'])" } },
          "public": { ".write": M, "$id": { ".validate": "$id.matches(/^[a-z_0-9]{1,30}$/) && newData.isNumber() && newData.val() >= 0 && newData.val() <= 5400" } },
          "blocks": { "$chunk": { "$cell": {
            ".write": M + " && (newData.exists() ? newData.child('n').val() === root.child('forest').child($island).child('members').child(auth.uid).child('no').val() : (data.child('n').val() === root.child('forest').child($island).child('members').child(auth.uid).child('no').val() || " + A + "))",
            ".validate": "$cell.matches(/^[0-9]{1,5}_[0-7]$/) && newData.hasChildren(['t', 'n', 'r']) && newData.child('t').isString() && newData.child('t').val().matches(/^[a-z_0-9]{2,20}$/) && newData.child('n').isNumber() && newData.child('r').isNumber() && newData.child('r').val() >= 0 && newData.child('r').val() <= 3",
          } } },
          "lots": { "$n": { ".write": M + " && (!data.exists() || " + A + ")", ".validate": "$n.matches(/^[0-7]$/) && newData.hasChildren(['uid', 'no', 'name']) && newData.child('uid').val() === auth.uid" } },
          "farm": { "$cell": {
            ".write": M + " && (newData.exists() ? newData.child('uid').val() === auth.uid : (data.child('uid').val() === auth.uid || " + A + "))",
            ".validate": "$cell.matches(/^[0-9]{1,5}$/) && newData.hasChildren(['uid', 'no', 'crop', 'at']) && newData.child('crop').isString() && newData.child('crop').val().matches(/^[a-z]{3,12}$/) && newData.child('at').isNumber()",
          } },
          "stats": { "$uid": { ".write": M + " && $uid === auth.uid", ".validate": "newData.hasChildren(['all'])" } },
          "publicLog": { ".write": M, "$key": { ".validate": "newData.hasChildren(['at', 'who', 'verb', 'item', 'count']) && newData.child('who').isString() && newData.child('who').val().length <= 12 && newData.child('count').isNumber() && newData.child('count').val() >= 1 && newData.child('count').val() <= 5400" } },
          "admin": {
            ".write": "auth != null && " + A,
            "cmd": { "$uid": { ".write": M + " && $uid === auth.uid && !newData.exists()" } },
          },
          "$other": { ".validate": false },
        },
      },
      "forestAdminLog": { ".read": "auth != null && " + A, ".write": "auth != null && " + A },
      "forestArchive": { ".read": "auth != null && " + A, ".write": "auth != null && " + A },
    };
  }

  static block(name, value, indent) {
    const pad = " ".repeat(indent);
    const body = JSON.stringify(value, null, 2).split("\n").map((line, i) => (i === 0 ? line : pad + line)).join("\n");
    return pad + JSON.stringify(name) + ": " + body;
  }

  strip() {
    const classAnchor = '    "classStats": {';
    const start = this.text.indexOf('    "forestCodes": {');
    if (start >= 0) this.text = this.text.slice(0, start) + this.text.slice(this.text.indexOf(classAnchor));
    const userStart = this.text.indexOf('        "forest": {');
    const userEnd = this.text.indexOf('        "$other": { ".validate": false }' + String.fromCharCode(10) + '      }' + String.fromCharCode(10) + '    },' + String.fromCharCode(10) + '    "classStats"');
    if (userStart >= 0 && userEnd > userStart) this.text = this.text.slice(0, userStart) + this.text.slice(userEnd);
  }

  apply() {
    this.strip();
    const userAnchor = '        "$other": { ".validate": false }\n      }\n    },\n    "classStats": {';
    if (this.text.indexOf(userAnchor) < 0) throw new Error("users 끝 자리를 찾지 못했어요");
    const userBlock = ForestRulesPatch.block("forest", this.userForest(), 8) + ",\n";
    this.text = this.text.replace(userAnchor, userBlock + userAnchor);
    const top = this.topLevel();
    const blocks = Object.keys(top).map((k) => ForestRulesPatch.block(k, top[k], 4)).join(",\n") + ",\n";
    const classAnchor = '    "classStats": {';
    this.text = this.text.replace(classAnchor, blocks + classAnchor);
    return true;
  }

  save() { fs.writeFileSync(this.file, this.text.replace(/\n/g, this.eol), "utf8"); }
}

const patch = new ForestRulesPatch(path.join(__dirname, "..", "데이터베이스규칙.json"));
if (patch.apply()) { patch.save(); console.log("데이터베이스규칙.json 에 forest 규칙을 더했어요."); } else console.log("이미 들어 있어요.");
JSON.parse(fs.readFileSync(path.join(__dirname, "..", "데이터베이스규칙.json"), "utf8"));
console.log("JSON 문법 OK");
