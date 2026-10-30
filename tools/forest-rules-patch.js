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
      "home": { ".validate": "newData.isString() && newData.val().matches(/^([1-3]-[1-5]|test)_[12]$/) && (!data.exists() || " + A + ") && (!(" + ForestRulesPatch.anonymous() + ") || newData.val() === 'test_1')" },
      "probe": { ".validate": "newData.isNumber() && newData.val() === now" },
      "save": {
        ".validate": "newData.hasChildren(['bag', 'ap', 'ring']) && newData.child('ap').isNumber() && newData.child('ap').val() >= 0 && newData.child('ap').val() <= 200 && newData.child('ring').isNumber() && newData.child('ring').val() >= 0 && newData.child('ring').val() <= 10",
        "ap": { ".validate": "newData.isNumber()" },
        "ring": { ".validate": "newData.isNumber()" },
        "lastAt": { ".validate": "newData.isNumber()" },
        "bag": { "$i": { ".validate": "$i.matches(/^([0-9]|[1-3][0-9])$/) && newData.hasChildren(['id', 'count', 'uses']) && newData.child('id').isString() && newData.child('id').val().length <= 40 && newData.child('count').isNumber() && newData.child('count').val() >= 1 && newData.child('count').val() <= 30 && newData.child('uses').isNumber() && newData.child('uses').val() >= 0 && newData.child('uses').val() <= 200" } },
        "pity": { "$k": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000" } },
        "seen": { "$i": { ".validate": "newData.isString() && newData.val().length <= 40" } },
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
          ".validate": "newData.hasChildren(['cls', 'island']) && newData.child('cls').isString() && newData.child('cls').val().matches(/^([1-3]-[1-5]|test)$/) && newData.child('island').isNumber() && (newData.child('island').val() === 1 || newData.child('island').val() === 2)",
        },
      },
      "forest": {
        "$island": {
          "members": { "$uid": { ".read": M, ".write": M + " && $uid === auth.uid", ".validate": "newData.hasChildren(['no', 'name'])" } },
          "clock": {
            ".read": M, ".write": M,
            ".validate": "newData.hasChildren(['day', 'dawnAt', 'lastSeen']) && newData.child('day').isNumber() && newData.child('day').val() >= 1",
            "frozen": { ".validate": "newData.isBoolean()" },
            "$other": { ".validate": "newData.isNumber()" },
          },
          "jungle": { ".read": M, ".write": M, "$cell": { ".validate": "$cell.matches(/^[0-9]{1,5}$/) && newData.val() === 1" } },
          "terrain": { ".read": M, ".write": M, "$chunk": { "$cell": { ".validate": "$cell.matches(/^[0-9]{1,5}$/) && newData.hasChildren(['0', '1']) && newData.child('0').isNumber() && newData.child('0').val() >= -2 && newData.child('0').val() <= 14 && newData.child('1').isString() && newData.child('1').val().length === 1" } } },
          "snow": { ".read": M, ".write": M, "$cell": { ".validate": "newData.isNumber()" } },
          "build": { ".read": M, "$id": { ".write": M + " && (!data.exists() || " + A + ")", ".validate": "$id.matches(/^[a-z_]{2,24}_[0-9]{1,2}$/) && newData.hasChildren(['at', 'by'])" } },
          "public": { ".read": M, ".write": M, "$id": { ".validate": "$id.matches(/^[a-z_0-9]{1,30}$/) && newData.isNumber() && newData.val() >= 0 && newData.val() <= 5400" } },
          "publicLog": { ".read": M, ".write": M, "$key": { ".validate": "newData.hasChildren(['at', 'who', 'verb', 'item', 'count']) && newData.child('who').isString() && newData.child('who').val().length <= 12 && newData.child('count').isNumber() && newData.child('count').val() >= 1 && newData.child('count').val() <= 5400" } },
          "admin": { ".read": M, ".write": "auth != null && " + A },
          "adminLog": { ".read": "auth != null && " + A, ".write": "auth != null && " + A },
          "$other": { ".validate": false },
        },
      },
      "forestArchive": { ".read": "auth != null && " + A, ".write": "auth != null && " + A },
    };
  }

  static block(name, value, indent) {
    const pad = " ".repeat(indent);
    const body = JSON.stringify(value, null, 2).split("\n").map((line, i) => (i === 0 ? line : pad + line)).join("\n");
    return pad + JSON.stringify(name) + ": " + body;
  }

  apply() {
    if (this.text.indexOf('"forestCodes"') >= 0) return false;
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
