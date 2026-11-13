// 41번 야구 시험용 사본 만들기.
// 본 화면(41.baseball-duel.html)은 잠금 확인 줄 때문에 제어판에 등록하기 전에는 열리지 않는다.
// 잠금·전체화면 줄만 뺀 사본을 .claude/baseball-test.html 로 만들어 미리보기 서버에서 본다(.claude 는 커밋되지 않음).
// 사용: node tools/baseball-test-page.js  →  http://localhost:<포트>/.claude/baseball-test.html
const fs = require("fs"), path = require("path");

class TestPage {
  static SKIP = ["common/firebase-config.js", "common/access-guard.js", "common/fullscreen-keeper.js"];

  static write() {
    const root = path.join(__dirname, ".."), source = fs.readFileSync(path.join(root, "41.baseball-duel.html"), "utf8");
    const kept = source.split(/\r?\n/).filter((line) => !TestPage.SKIP.some((name) => line.includes(name)));
    const page = kept.join("\n").replace("<head>", "<head>\n<base href=\"../\">").replace(/\?v=[0-9a-z]+/g, "?v=" + Date.now());
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(root, ".claude", "baseball-test.html"), page);
    console.log("만듦: .claude/baseball-test.html");
  }
}

TestPage.write();
