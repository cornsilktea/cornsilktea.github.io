(function () {
  var tree = {};
  var chan = new BroadcastChannel("fbmock");
  var listeners = [];
  var seq = 0;
  var LAG = +(new URLSearchParams(location.search).get("lag") || 0);

  function split(p) { return String(p || "").split("/").filter(Boolean); }
  function getAt(path, root) {
    var n = root === undefined ? tree : root, parts = split(path);
    for (var i = 0; i < parts.length; i++) { if (n == null || typeof n !== "object") return null; n = n[parts[i]]; }
    return n === undefined ? null : n;
  }
  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
  function prune(o) {
    if (o && typeof o === "object") {
      Object.keys(o).forEach(function (k) { o[k] = prune(o[k]); if (o[k] == null) delete o[k]; });
      return Object.keys(o).length ? o : null;
    }
    return o;
  }
  function setAt(path, val) {
    var parts = split(path);
    if (!parts.length) { tree = val || {}; return; }
    var n = tree;
    for (var i = 0; i < parts.length - 1; i++) {
      if (n[parts[i]] == null || typeof n[parts[i]] !== "object") n[parts[i]] = {};
      n = n[parts[i]];
    }
    if (val == null) delete n[parts[parts.length - 1]]; else n[parts[parts.length - 1]] = val;
    prune(tree);
  }
  function snap(path, val) { var parts = split(path); return { key: parts.length ? parts[parts.length - 1] : null, val: function () { return clone(val); }, exists: function () { return val != null; } }; }
  function fire(l, fn) { if (LAG) setTimeout(fn, LAG); else setTimeout(fn, 0); }
  function dispatch() {
    listeners.slice().forEach(function (l) {
      var cur = getAt(l.path), curJ = JSON.stringify(cur);
      if (l.ev === "value") {
        if (curJ !== l.last) { l.last = curJ; fire(l, function () { if (l.on) l.fn(snap(l.path, JSON.parse(curJ))); }); }
        return;
      }
      var prev = l.last ? JSON.parse(l.last) : {}, now = cur && typeof cur === "object" ? cur : {};
      Object.keys(now).forEach(function (k) {
        var pj = JSON.stringify(prev[k]), nj = JSON.stringify(now[k]);
        if (prev[k] === undefined && l.ev === "child_added") fire(l, function () { if (l.on) l.fn(snap(l.path + "/" + k, JSON.parse(nj))); });
        else if (pj !== nj && l.ev === "child_changed") fire(l, function () { if (l.on) l.fn(snap(l.path + "/" + k, JSON.parse(nj))); });
      });
      Object.keys(prev).forEach(function (k) {
        if (now[k] === undefined && l.ev === "child_removed") { var pv = prev[k]; fire(l, function () { if (l.on) l.fn(snap(l.path + "/" + k, pv)); }); }
      });
      l.last = curJ === "null" ? "" : curJ;
    });
  }
  function applyLocal(path, val, broadcast) {
    setAt(path, clone(val));
    if (broadcast) chan.postMessage({ t: "set", path: path, val: val === undefined ? null : val });
    dispatch();
  }
  chan.onmessage = function (m) {
    var d = m.data;
    if (d.t === "set") { setAt(d.path, clone(d.val)); dispatch(); }
    else if (d.t === "hello") chan.postMessage({ t: "tree", tree: tree });
    else if (d.t === "tree" && !gotTree) { gotTree = true; tree = d.tree || {}; dispatch(); }
  };
  var gotTree = false;
  chan.postMessage({ t: "hello" });

  function Ref(path) { this.path = split(path).join("/"); this.key = split(path).pop() || null; }
  Ref.prototype.child = function (p) { return new Ref(this.path + "/" + p); };
  Ref.prototype.set = function (v) { applyLocal(this.path, v, true); return Promise.resolve(); };
  Ref.prototype.remove = function () { applyLocal(this.path, null, true); return Promise.resolve(); };
  Ref.prototype.update = function (o) {
    var self = this;
    Object.keys(o).forEach(function (k) { applyLocal(self.path + "/" + k, o[k], true); });
    return Promise.resolve();
  };
  Ref.prototype.push = function (v) {
    var k = "-" + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
    var r = this.child(k);
    if (v !== undefined) r.set(v);
    return r;
  };
  Ref.prototype.once = function () { return Promise.resolve(snap(this.path, getAt(this.path))); };
  Ref.prototype.transaction = function (fn) {
    var cur = clone(getAt(this.path)), res = fn(cur), self = this;
    if (res === undefined) return Promise.resolve({ committed: false, snapshot: snap(this.path, cur) });
    applyLocal(this.path, res, true);
    return Promise.resolve({ committed: true, snapshot: snap(self.path, res) });
  };
  Ref.prototype.onDisconnect = function () { return { remove: function () {}, cancel: function () {}, set: function () {} }; };
  Ref.prototype.on = function (ev, fn) {
    var path = this.path;
    if (path === ".info/serverTimeOffset") { setTimeout(function () { fn(snap(path, 0)); }, 0); return fn; }
    if (path === ".info/connected") { setTimeout(function () { fn(snap(path, true)); }, 0); return fn; }
    var l = { path: path, ev: ev, fn: fn, on: true, last: "" };
    listeners.push(l);
    var cur = getAt(path);
    if (ev === "value") { l.last = JSON.stringify(cur); setTimeout(function () { if (l.on) fn(snap(path, clone(cur))); }, 0); }
    else {
      l.last = cur && typeof cur === "object" ? JSON.stringify(cur) : "";
      if (ev === "child_added" && cur && typeof cur === "object") Object.keys(cur).forEach(function (k) { var v = clone(cur[k]); setTimeout(function () { if (l.on) fn(snap(path + "/" + k, v)); }, 0); });
    }
    return fn;
  };
  Ref.prototype.off = function (ev, fn) {
    var path = this.path;
    listeners.forEach(function (l) { if (l.path === path && l.ev === ev && l.fn === fn) l.on = false; });
    listeners = listeners.filter(function (l) { return l.on; });
  };
  window.__fbTree = function () { return tree; };
  window.firebase = {
    initializeApp: function () {},
    database: function () { return { ref: function (p) { return new Ref(p); } }; }
  };
})();
