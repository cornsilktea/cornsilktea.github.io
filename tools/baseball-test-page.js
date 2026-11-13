// 41번 야구 시험용 사본 만들기.
// 본 화면(41.baseball-duel.html)은 잠금 확인 줄 때문에 제어판에 등록하기 전에는 열리지 않는다.
// 잠금·전체화면 줄을 뺀 사본을 .claude/ 에 만든다(.claude 는 커밋되지 않음). 미리보기 서버로 연다.
//   .claude/baseball-test.html   혼자 하기 확인용(서버 없음 → 방은 기기 안에서만)
//   .claude/baseball-mock.html   가짜 Firebase(tools/fbmock.js, 같은 브라우저 창끼리만 통함)
//   .claude/baseball-multi.html  가짜 Firebase 화면 3개(a 방장 · b 손님 · c 관전)를 한 장에
// 사용: node tools/baseball-test-page.js
const fs = require("fs"), path = require("path");

class TestPage {
  static GUARD = ["common/access-guard.js", "common/fullscreen-keeper.js"];
  static SERVER = ["common/firebase-config.js", "firebasejs/"];
  static NEWLINE = String.fromCharCode(10);

  constructor() {
    this.root = path.join(__dirname, "..");
    this.lines = fs.readFileSync(path.join(this.root, "41.baseball-duel.html"), "utf8").split(String.fromCharCode(13)).join("").split(TestPage.NEWLINE);
    fs.mkdirSync(path.join(this.root, ".claude"), { recursive: true });
  }

  page(skipped, extraHead) {
    const kept = this.lines.filter((line) => !skipped.some((name) => line.includes(name)));
    const stamp = "?v=" + Date.now();
    return kept.join(TestPage.NEWLINE).replace("<head>", "<head>" + TestPage.NEWLINE + '<base href="../">' + extraHead).replace(/[?]v=[0-9a-z]+/g, stamp);
  }

  save(name, text) {
    fs.writeFileSync(path.join(this.root, ".claude", name), text);
    console.log("만듦: .claude/" + name);
  }

  write() {
    this.save("baseball-test.html", this.page(TestPage.GUARD.concat(TestPage.SERVER), ""));
    this.save("baseball-mock.html", this.page(TestPage.GUARD.concat(["firebasejs/"]), TestPage.NEWLINE + '<script src="/tools/fbmock.js"></script>'));
    const frames = ["a", "b", "c"].map((id) => '<iframe id="' + id + '" src="/.claude/baseball-mock.html"></iframe>').join("");
    this.save("baseball-multi.html", '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;display:flex;flex-wrap:wrap;background:#000}iframe{width:50vw;height:50vh;border:0}</style></head><body>' + frames + "</body></html>");
  }
}

new TestPage().write();
