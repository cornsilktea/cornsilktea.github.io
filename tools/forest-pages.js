const fs = require("fs"), path = require("path");

class ForestTestPages {
  constructor(root) {
    this.root = root;
    this.html = fs.readFileSync(path.join(root, "40.dongma-forest.html"), "utf8");
  }

  withoutGuard() {
    return this.html
      .replace(/<script charset="utf-8" src="firebase-config.js"><\/script>\r?\n/, "")
      .replace(/<script charset="utf-8" src="access-guard.js" data-game="dongmaforest"><\/script>\r?\n/, "")
      .replace(/<script charset="utf-8" src="fullscreen-keeper.js" data-watch><\/script>\r?\n/, "")
      .replace(/<script charset="utf-8" src="quality-governor.js"><\/script>\r?\n/, "");
  }

  restMockScript() {
    return `<script>
(function () {
  var db = {}; var etagSeq = 1; var etags = {};
  function parts(p) { return p.split("/").filter(Boolean); }
  function get(path) { var n = db; var ps = parts(path); for (var i = 0; i < ps.length; i++) { if (n == null || typeof n !== "object") return null; n = n[ps[i]]; } return n === undefined ? null : n; }
  function set(path, v) { var ps = parts(path); var n = db; for (var i = 0; i < ps.length - 1; i++) { if (n[ps[i]] == null || typeof n[ps[i]] !== "object") n[ps[i]] = {}; n = n[ps[i]]; } if (v === null) delete n[ps[ps.length - 1]]; else n[ps[ps.length - 1]] = v; etags[path] = String(etagSeq++); }
  function patch(path, v) { Object.keys(v).forEach(function (k) { set(path + "/" + k, v[k]); }); }
  window.__fb = { db: function () { return db; }, seed: function (path, v) { set(path, v); } };
  window.PORTAL_USER = { uid: "u_test", email: "t@dongma.sen.ms.kr", name: "20104 홍길동", nick: "길동", getToken: function () { return Promise.resolve("tok"); } };
  window.PORTAL_CONFIG = { DB_URL: "https://mock.local", isReady: function () { return true; } };
  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    if (String(url).indexOf("https://mock.local") !== 0) return realFetch(url, opts);
    var u = new URL(url); var path = decodeURIComponent(u.pathname).replace(/\\.json$/, "");
    var method = (opts && opts.method) || "GET"; var headers = (opts && opts.headers) || {};
    function respond(status, body, extra) { var h = new Headers(extra || {}); return Promise.resolve(new Response(body === undefined ? "" : JSON.stringify(body), { status: status, headers: h })); }
    if (method === "GET") {
      var cur = get(path);
      if (u.searchParams.get("orderBy")) { var limit = +u.searchParams.get("limitToLast"); if (cur && typeof cur === "object") { var keys = Object.keys(cur).sort().slice(-limit); var out = {}; keys.forEach(function (k) { out[k] = cur[k]; }); cur = out; } }
      return respond(200, cur, { ETag: etags[path] || "null_etag" });
    }
    var body = opts && opts.body ? JSON.parse(opts.body) : null;
    if (method === "PUT") {
      if (headers["if-match"] !== undefined && headers["if-match"] !== (etags[path] || "null_etag")) return respond(412, get(path));
      if (body && body[".sv"] === "timestamp") body = Date.now() + 2500;
      set(path, body); return respond(200, body);
    }
    if (method === "PATCH") { patch(path, body); return respond(200, body); }
    return respond(400, null);
  };
})();
</script>
`;
  }

  write(name, html) {
    const dir = path.join(this.root, ".claude");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), html, "utf8");
  }

  build() {
    const fixed = this.withoutGuard().replace("new FrGame(", "window.__game = new FrGame(");
    this.write("forest-test.html", fixed.replace("<head>", '<head><base href="../">'));
    this.write("forest-rest.html", fixed.replace("<head>", '<head><base href="../">' + this.restMockScript()));
  }
}

new ForestTestPages(path.join(__dirname, "..")).build();
console.log(".claude/forest-test.html (혼자, 저장은 localStorage) · .claude/forest-rest.html (가짜 로그인 + 가짜 Firebase REST) 를 만들었어요.");
