// 랜덤 매칭이 붙은 게임마다 가짜 Firebase 사본(.claude/mk-check-<파일>)을 만든다. 잠금 줄(data-game)은 뺀다.
// 브라우저에서 http://localhost:<포트>/.claude/mk-check-24.turbo-lap.html?c=test 를 열고
//   __mkCheck.run("turbo", ["win","draw","win","lose"])  → 끝나면 __mkCheck.done, 결과는 __mkCheck.log
// 게임 이름: turbo(24) fps(25) arena(30) zombie(31) minigames(32) volley(34) soccer(35) snowSolo·snowDuos(38) balloonSolo·balloonTeam(39)
const fs = require("fs"), path = require("path");

class MatchResultCopies {
  static FILES = ["24.turbo-lap.html", "25.fps-survival.html", "30.team-battle-arena.html", "31.zombie-outbreak.html", "32.minigames.html",
    "34.volleyball.html", "35.soccer.html", "38.snow-royale.html", "39.water-balloon.html"];
  static HEAD = '<base href="../">\n<script src="tools/fbmock.js"></script>\n<script>firebase.apps = [];</script>\n';
  static TAIL = '<script src="tools/match-result-harness.js"></script>\n</body>';

  static build(root) {
    const out = path.join(root, ".claude");
    fs.mkdirSync(out, { recursive: true });
    return MatchResultCopies.FILES.map((file) => {
      let html = fs.readFileSync(path.join(root, file), "utf8");
      html = html.replace(/<head>\r?\n/, "<head>\n" + MatchResultCopies.HEAD).replace(/ data-game="[^"]*"/, "").replace(/<\/body>(?![\s\S]*<\/body>)/, MatchResultCopies.TAIL);
      // 진짜 Firebase SDK 를 불러오면 가짜(fbmock)를 덮어써서 실제 DB 에 쓰게 된다. 반드시 뺀다.
      html = html.replace(/<script[^>]*src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]*"[^>]*><\/script>\r?\n?/g, "");
      if (/<script[^>]*gstatic\.com\/firebasejs/.test(html)) throw new Error(file + ": 진짜 Firebase SDK 줄이 남아 있음");
      const target = path.join(out, "mk-check-" + file);
      fs.writeFileSync(target, html);
      return target;
    });
  }
}

MatchResultCopies.build(path.join(__dirname, "..")).forEach((file) => console.log(file));
