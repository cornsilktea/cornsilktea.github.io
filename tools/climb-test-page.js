// 42번 동마 타워 클라임: 잠금 없이 여는 확인용 화면을 만든다. 실행: node tools/climb-test-page.js
// 결과: .claude/climb-test.html (gitignore). 로컬 서버에서 /.claude/climb-test.html 로 연다.
// 콘솔에서 __game 으로 게임 객체를 볼 수 있다(확인용 화면에만 있음).
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(root, "42.tower-climb.html"), "utf8");
html = html.replace(/<script[^>]*common\/firebase-config\.js[^>]*><\/script>\r?\n/, "").replace(/<script[^>]*common\/access-guard\.js[^>]*><\/script>\r?\n/, "");
html = html.replace("<head>", '<head>\n<base href="/">').replace("new TowerClimbGame(", "window.__game = new TowerClimbGame(");
fs.writeFileSync(path.join(root, ".claude", "climb-test.html"), html, "utf8");
console.log("만듦: .claude/climb-test.html");
