// 39번 확인용 페이지를 .claude/ 에 만든다(.claude 는 커밋 안 됨 — 다른 컴퓨터에서는 이 스크립트를 한 번 돌린다).
//   balloon-test.html  : 잠금 줄을 뺀 사본(혼자 하기·봇 관전, 주소값은 39번 노트 18-4·19-3절)
//   balloon-mock.html  : 가짜 Firebase(tools/fbmock.js, 같은 브라우저 창끼리 BroadcastChannel 로 공유)
//   balloon-multi.html : balloon-mock 네 칸. 콘솔 도우미 join('b', 코드)·keys('b', ['KeyD'], 1000)·room()·click('a','btnStart')
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const out = path.join(root, ".claude");
fs.mkdirSync(out, { recursive: true });
const page = fs.readFileSync(path.join(root, "39.water-balloon.html"), "utf8")
  .replace('<script charset="utf-8" src="access-guard.js" data-game="waterballoon"></script>', "")
  .replace("<head>", '<head><base href="/">');
fs.writeFileSync(path.join(out, "balloon-test.html"), page);
const mock = page
  .replace('<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>', '<script src="/tools/fbmock.js"></script>')
  .replace('<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>', "");
fs.writeFileSync(path.join(out, "balloon-mock.html"), mock);
const multi = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body{margin:0;display:flex;flex-wrap:wrap;background:#000}iframe{width:50vw;height:50vh;border:0}</style></head>
<body><iframe id="a" src="/.claude/balloon-mock.html?net"></iframe><iframe id="b" src="/.claude/balloon-mock.html?net"></iframe><iframe id="c" src="/.claude/balloon-mock.html?net"></iframe><iframe id="d" src="/.claude/balloon-mock.html?net"></iframe>
<script>
window.frame = (id) => document.getElementById(id).contentWindow;
window.click = (id, el) => frame(id).document.getElementById(el).click();
window.text = (id, el) => frame(id).document.getElementById(el).textContent;
window.keys = (id, codes, ms) => new Promise((resolve) => {
  const w = frame(id);
  const ev = (type, c) => new w.KeyboardEvent(type, { code: c, key: c.startsWith('Key') ? c.slice(3).toLowerCase() : c, bubbles: true });
  codes.forEach((c) => w.dispatchEvent(ev('keydown', c)));
  setTimeout(() => { codes.forEach((c) => w.dispatchEvent(ev('keyup', c))); resolve(); }, ms);
});
window.join = (id, code, watch) => { const d = frame(id).document; d.getElementById('joinCode').value = code; d.getElementById(watch ? 'btnWatch' : 'btnJoin').click(); };
window.room = async () => { const w = frame('a'); const code = w.document.getElementById('lobbyCode').textContent; const snap = await w.firebase.database().ref('waterballoon/rooms/' + code).once('value'); return { code, data: snap.val() }; };
</script></body></html>`;
fs.writeFileSync(path.join(out, "balloon-multi.html"), multi);
console.log("made .claude/balloon-test.html, balloon-mock.html, balloon-multi.html");
