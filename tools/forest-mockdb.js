const http = require("http"), fs = require("fs"), path = require("path");

class MockTree {
  constructor() { this.root = null; }

  parts(path) { return String(path || "").split("/").filter(Boolean); }

  get(path) {
    let node = this.root;
    for (const part of this.parts(path)) {
      if (node === null || typeof node !== "object") return null;
      node = node[part];
      if (node === undefined) return null;
    }
    return node === undefined ? null : node;
  }

  set(path, value) {
    const parts = this.parts(path);
    if (parts.length === 0) { this.root = value; return; }
    if (this.root === null || typeof this.root !== "object") this.root = {};
    let node = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] === null || typeof node[parts[i]] !== "object" || node[parts[i]] === undefined) node[parts[i]] = {};
      node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (value === null) delete node[last]; else node[last] = value;
    this.prune(this.root, null, null);
  }

  prune(node, parent, key) {
    if (node && typeof node === "object") {
      Object.keys(node).forEach((k) => this.prune(node[k], node, k));
      if (Object.keys(node).length === 0 && parent) delete parent[key];
    }
  }

  etag(path) {
    const value = this.get(path);
    if (value === null) return "null_etag";
    const text = JSON.stringify(value);
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
    return String(h >>> 0);
  }
}

class MockStats {
  constructor() { this.bytes = {}; this.requests = {}; this.events = {}; this.started = Date.now(); }
  bump(table, key, n) { table[key] = (table[key] || 0) + n; }
  category(path) { const p = path.split("/").filter(Boolean); return p[0] === "forest" ? (p[2] || "root") : p[0] || "root"; }
  snapshot() {
    const total = Object.values(this.bytes).reduce((a, b) => a + b, 0);
    return { seconds: Math.round((Date.now() - this.started) / 1000), totalBytes: total, bytes: this.bytes, requests: this.requests, events: this.events };
  }
}

class MockDbServer {
  constructor(port, staticRoot) {
    this.port = port;
    this.staticRoot = staticRoot || null;
    this.tree = new MockTree();
    this.stats = new MockStats();
    this.streams = [];
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  resolveServerValues(value) {
    if (value && typeof value === "object") {
      if (value[".sv"] === "timestamp") return Date.now();
      Object.keys(value).forEach((k) => { value[k] = this.resolveServerValues(value[k]); });
    }
    return value;
  }

  cors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type,if-match,x-firebase-etag,accept,cache-control");
    res.setHeader("Access-Control-Expose-Headers", "ETag");
  }

  rel(base, path) {
    const b = this.tree.parts(base), p = this.tree.parts(path);
    return p.slice(b.length);
  }

  startsWith(parts, prefix) { return prefix.every((v, i) => parts[i] === v); }

  notify(path, kind, data) {
    const writeParts = this.tree.parts(path);
    this.streams.forEach((stream) => {
      const base = this.tree.parts(stream.path);
      if (this.startsWith(writeParts, base)) {
        const relPath = "/" + writeParts.slice(base.length).join("/");
        this.send(stream, kind, { path: relPath, data });
      } else if (this.startsWith(base, writeParts)) {
        this.send(stream, "put", { path: "/", data: this.tree.get(stream.path) });
      }
    });
  }

  send(stream, kind, payload) {
    const text = "event: " + kind + "\ndata: " + JSON.stringify(payload) + "\n\n";
    stream.res.write(text);
    this.stats.bump(this.stats.bytes, this.stats.category(stream.path + payload.path), Buffer.byteLength(text));
    this.stats.bump(this.stats.events, this.stats.category(stream.path + payload.path), 1);
  }

  handle(req, res) {
    this.cors(res);
    if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
    const url = new URL(req.url, "http://localhost");
    if (this.staticRoot && url.pathname.indexOf("/db/") !== 0 && url.pathname.indexOf("/__") !== 0) { this.serveFile(url, res); return; }
    if (url.pathname.indexOf("/db/") === 0) url.pathname = url.pathname.slice(3);
    if (url.pathname === "/__stats") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(this.stats.snapshot())); return; }
    if (url.pathname === "/__reset") { this.tree = new MockTree(); this.stats = new MockStats(); res.end("ok"); return; }
    const path = decodeURIComponent(url.pathname).replace(/\.json$/, "");
    const accept = req.headers.accept || "";
    if (req.method === "GET" && accept.indexOf("text/event-stream") >= 0) { this.openStream(req, res, path); return; }
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => this.respond(req, res, url, path, body));
  }

  serveFile(url, res) {
    const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const file = path.join(this.staticRoot, rel);
    if (file.indexOf(this.staticRoot) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.end(fs.readFileSync(file));
  }

  openStream(req, res, path) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const stream = { res, path };
    this.streams.push(stream);
    this.send(stream, "put", { path: "/", data: this.tree.get(path) });
    const timer = setInterval(() => res.write("event: keep-alive\ndata: null\n\n"), 20000);
    req.on("close", () => { clearInterval(timer); this.streams = this.streams.filter((s) => s !== stream); });
  }

  respond(req, res, url, path, body) {
    this.stats.bump(this.stats.requests, req.method + " " + this.stats.category(path), 1);
    if (req.method === "GET") {
      let value = this.tree.get(path);
      if (url.searchParams.get("orderBy") && value && typeof value === "object") {
        const limit = Number(url.searchParams.get("limitToLast")) || 100;
        const keys = Object.keys(value).sort().slice(-limit);
        value = Object.fromEntries(keys.map((k) => [k, value[k]]));
      }
      res.setHeader("ETag", this.tree.etag(path));
      res.setHeader("Content-Type", "application/json");
      const text = JSON.stringify(value);
      this.stats.bump(this.stats.bytes, "GET " + this.stats.category(path), Buffer.byteLength(text));
      res.end(text);
      return;
    }
    let data = body ? JSON.parse(body) : null;
    data = this.resolveServerValues(data);
    this.stats.bump(this.stats.bytes, "WRITE " + this.stats.category(path), Buffer.byteLength(body));
    if (req.method === "PUT") {
      const match = req.headers["if-match"];
      if (match !== undefined && match !== this.tree.etag(path)) { res.statusCode = 412; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(this.tree.get(path))); return; }
      this.tree.set(path, data);
      this.notify(path, "put", data);
    } else if (req.method === "PATCH") {
      Object.keys(data || {}).forEach((k) => this.tree.set(path + "/" + k, data[k]));
      this.notify(path, "patch", data);
    } else if (req.method === "DELETE") {
      this.tree.set(path, null);
      this.notify(path, "put", null);
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  }

  start() { return new Promise((resolve) => this.server.listen(this.port, () => resolve(this))); }
  stop() { this.streams.forEach((s) => s.res.end()); this.server.close(); }
}

module.exports = { MockDbServer };

if (require.main === module) {
  const port = Number(process.argv[2] || 8790);
  const staticRoot = process.argv.indexOf("--static") >= 0 ? path.join(__dirname, "..") : null;
  new MockDbServer(port, staticRoot).start().then(() => console.log("가짜 Firebase 서버: http://localhost:" + port + (staticRoot ? " (저장소 파일도 같이 제공, 데이터베이스는 /db/)" : "") + "  (/__stats 로 전송량, /__reset 으로 비우기)"));
}
