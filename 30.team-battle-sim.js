class SimSettings {
  static T0 = 1700000000000;
  static FRAME_MS = 33;
  static MATCH_END_MS = 89000;
  static AVOID_MAX_TRIES = 200;
  static DEFAULT_AVOID = ["ACF", "AAF", "AFF"];
  static WEAK_COMBO_MAX_WIN = 0.35;
  static WEAK_COMBO_MIN_TEAMS = 100;
  static ROLE_CODE = { fighter: "F", caster: "C", shooter: "S", assassin: "A" };
}

class SeededRandom {
  constructor(seed) { this.state = seed >>> 0; }
  next() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    var q = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  }
  asFunction() { return () => this.next(); }
}

class HtmlText {
  static escape(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]; }); }
}

export function createSim(api) {
  function fakeRoom(mapId, log) {
    var n = 0;
    function snap(path, key, val) {
      return { key: key, val: function () { return val; }, ref: { parent: { key: path.split("/").pop() }, remove: function () {} } };
    }
    function dispatch(path, key, v) {
      v = JSON.parse(JSON.stringify(v));
      log.push({ path: path, v: v });
      if (path === "shots") api.onShot(snap(path, key, v));
      else if (path === "meleeHits") api.onMelee(key, v);
      else if (path === "effects") api.onEffect(snap(path, key, v));
      else if (path.indexOf("hits/") === 0) api.onHit(snap(path, key, v));
      else if (path === "kills") api.onKill(v);
    }
    function node(path) {
      return {
        child: function (p) { return node(path ? path + "/" + p : p); },
        push: function (v) { var key = "k" + (++n); dispatch(path, key, v); return { key: key }; },
        set: function () {}, update: function () {}, remove: function () {}, on: function () {}, off: function () {},
        once: function () { return Promise.resolve({ val: function () { return null; } }); }
      };
    }
    return { code: "SIM", ref: node(""), mode: "3v3", map: mapId, status: "playing", host: api.myId, startAt: SimSettings.T0 - 1000,
             winner: null, endedAt: 0, final: null, roster: null, draft: null };
  }

  function teamCode(chars) { return chars.map(function (c) { return SimSettings.ROLE_CODE[api.CHARS[c].role]; }).sort().join(""); }
  function pickTeamsOnce(rnd, excludedFromFighterPick) {
    var all = api.CHAR_LIST.slice();
    var fighters = all.filter(function (c) { return api.CHARS[c].role === "fighter" && (excludedFromFighterPick || []).indexOf(c) < 0; });
    function take(list) { return list.splice(Math.floor(rnd() * list.length), 1)[0]; }
    var blueFighter = take(fighters);
    var redFighter = take(fighters);
    var rest = all.filter(function (c) { return c !== blueFighter && c !== redFighter; });
    return {
      blue: [blueFighter, take(rest), take(rest)],
      red: [redFighter, take(rest), take(rest)]
    };
  }
  function pickMatchupTeams(rnd, matchup, swapSides) {
    var pools = {};
    api.CHAR_LIST.forEach(function (c) { var code = SimSettings.ROLE_CODE[api.CHARS[c].role]; (pools[code] = pools[code] || []).push(c); });
    function take(code) { var list = pools[code]; return list.splice(Math.floor(rnd() * list.length), 1)[0]; }
    var firstTeam = matchup[0].split("").map(take), secondTeam = matchup[1].split("").map(take);
    return swapSides ? { blue: secondTeam, red: firstTeam } : { blue: firstTeam, red: secondTeam };
  }
  function pickTeams(rnd, avoid, matchup, swapSides, excludedFromFighterPick) {
    if (matchup) return pickMatchupTeams(rnd, matchup, swapSides);
    var teams = pickTeamsOnce(rnd, excludedFromFighterPick);
    if (!avoid || !avoid.length) return teams;
    for (var tries = 0; tries < SimSettings.AVOID_MAX_TRIES; tries++) {
      if (avoid.indexOf(teamCode(teams.blue)) < 0 && avoid.indexOf(teamCode(teams.red)) < 0) return teams;
      teams = pickTeamsOnce(rnd, excludedFromFighterPick);
    }
    return teams;
  }

  function playOne(mapId, seed, avoid, matchup, excludedFromFighterPick) {
    var rnd = new SeededRandom(seed).asFunction(), realRandom = Math.random;
    Math.random = rnd;
    try {
      var teams = pickTeams(rnd, avoid, matchup, seed % 2 === 1, excludedFromFighterPick), list = [];
      ["blue", "red"].forEach(function (team) {
        teams[team].forEach(function (c, i) { list.push({ id: team + (i + 1), team: team, char: c, slot: i + 1 }); });
      });
      api.loadMapData(mapId);
      var log = [], players = {}, bots = {}, t = SimSettings.T0;
      list.forEach(function (e, i) {
        players[e.id] = { nickname: e.id, isAI: true, team: e.team, characterType: e.char, slot: e.slot, joinedAt: i };
      });
      api.begin(fakeRoom(mapId, log), players, bots, t);
      list.forEach(function (e) {
        var E = api.makeEnt(e.id, players[e.id]), sp = api.spawnOf(e.team, e.slot);
        E.x = sp.x; E.y = sp.y; E.angle = sp.angle;
        E.bot = { seed: Math.random() * 10, seenAt: 0, target: null, stuck: 0, detour: 0, detourDir: 1 };
        bots[e.id] = E;
      });
      var sampled = {};
      list.forEach(function (e) { sampled[e.id] = { aliveN: 0, nearSum: 0, nearN: 0, fullN: 0, movedSum: 0, lastX: bots[e.id].x, lastY: bots[e.id].y, inRangeN: 0, sampleN: 0 }; });
      var frameNo = 0;
      var endMs = SimSettings.MATCH_END_MS * (api.timeScale ? api.timeScale() : 1);
      while (t < SimSettings.T0 + endMs) {
        t += SimSettings.FRAME_MS; api.setClock(t); api.stepWorld(t, SimSettings.FRAME_MS / 1000, true);
        if (++frameNo % 15) continue;
        list.forEach(function (e) {
          var E = bots[e.id], S = sampled[e.id];
          S.sampleN++;
          if (!E.alive) return;
          S.aliveN++;
          if (E.gauge >= api.GAUGE_MAX) S.fullN++;
          S.movedSum += Math.hypot(E.x - S.lastX, E.y - S.lastY); S.lastX = E.x; S.lastY = E.y;
          var near = Infinity;
          list.forEach(function (o) { var O = bots[o.id]; if (O.alive && o.team !== e.team) near = Math.min(near, Math.hypot(O.x - E.x, O.y - E.y)); });
          if (near < Infinity) { S.nearSum += near; S.nearN++; if (near <= api.CHARS[e.char].range) S.inRangeN++; }
        });
      }
      var killsBy = {};
      log.forEach(function (p) { if (p.path === "kills" && p.v.k) killsBy[p.v.k] = (killsBy[p.v.k] || 0) + 1; });
      var score = { blue: 0, red: 0 };
      var chars = list.map(function (e) {
        var E = bots[e.id], S = sampled[e.id];
        score[e.team === "blue" ? "red" : "blue"] += E.deaths || 0;
        var c = { char: e.char, team: e.team, dmg: E.dmg || 0, deaths: E.deaths || 0, kills: killsBy[e.id] || 0,
                  shots: 0, skillShots: 0, melee: 0, skillMelee: 0, effects: 0, basicHits: 0, ultHits: 0, basicDmg: 0, ultDmg: 0,
                  assists: E.assists || 0, heal: E.heal || 0, blocked: E.blocked || 0, taken: E.taken || 0, stun: E.stunDealt || 0, slow: E.slowDealt || 0, slowWeight: E.slowWeight || 0, mvp: api.mvpScore(E),
                  gaugeFull: S.aliveN ? S.fullN / S.aliveN : 0, near: S.nearN ? S.nearSum / S.nearN : 0, inRange: S.nearN ? S.inRangeN / S.nearN : 0, moved: S.movedSum };
        log.forEach(function (p) {
          var v = p.v;
          if (p.path === "shots" && v.o === e.id) { if (v.s) c.skillShots++; else c.shots++; }
          else if (p.path === "meleeHits" && v.owner === e.id) { if (v.u) c.skillMelee++; else c.melee++; }
          else if (p.path === "effects" && v.owner === e.id) c.effects++;
          else if (p.path === "hits/" + e.id && !v.mn) { if (v.u) { c.ultHits++; c.ultDmg += v.d || 0; } else { c.basicHits++; c.basicDmg += v.d || 0; } }
        });
        return c;
      });
      return { map: mapId, seed: seed, blue: score.blue, red: score.red, blueCode: teamCode(teams.blue), redCode: teamCode(teams.red),
               winner: score.blue > score.red ? "blue" : (score.red > score.blue ? "red" : "draw"), chars: chars };
    } finally { Math.random = realRandom; }
  }

  function statRows(results, mapId) {
    var acc = {};
    results.forEach(function (g) {
      if (mapId && g.map !== mapId) return;
      g.chars.forEach(function (c) {
        var a = acc[c.char] || (acc[c.char] = { n: 0, w: 0, d: 0, dmg: 0, skill: 0, heal: 0, blk: 0, taken: 0, stun: 0, slow: 0, k: 0, de: 0, as: 0, mvp: 0 });
        a.n++; if (g.winner === "draw") a.d++; else if (g.winner === c.team) a.w++;
        a.dmg += c.dmg; a.skill += c.ultDmg; a.heal += c.heal; a.blk += c.blocked; a.taken += c.taken; a.stun += c.stun; a.slow += c.slow;
        a.k += c.kills; a.de += c.deaths; a.as += c.assists; a.mvp += c.mvp;
      });
    });
    return Object.keys(acc).map(function (id) {
      var a = acc[id], ch = api.CHARS[id], decided = a.n - a.d, row = { id: id, name: ch.name, role: ch.role, n: a.n, draws: a.d, win: decided ? Math.round(a.w / decided * 10000) / 10000 : 0 };
      ["dmg", "skill", "heal", "blk", "taken", "stun", "slow", "k", "de", "as", "mvp"].forEach(function (key) { row[key] = Math.round(a[key] / a.n * 1000) / 1000; });
      return row;
    }).sort(function (x, y) { return y.win - x.win; });
  }
  function gameTotals(results, mapId) {
    var t = { games: 0, draws: 0, blue: 0, red: 0, kills: 0 };
    results.forEach(function (g) {
      if (mapId && g.map !== mapId) return;
      t.games++; t.kills += g.blue + g.red;
      if (g.winner === "draw") t.draws++; else t[g.winner]++;
    });
    return t;
  }
  function comboRates(results) {
    var acc = {};
    results.forEach(function (g) {
      [["blue", g.blueCode], ["red", g.redCode]].forEach(function (side) {
        if (!side[1]) return;
        var a = acc[side[1]] || (acc[side[1]] = { code: side[1], n: 0, w: 0, d: 0 });
        a.n++; if (g.winner === "draw") a.d++; else if (g.winner === side[0]) a.w++;
      });
    });
    return Object.keys(acc).map(function (k) { var a = acc[k], decided = a.n - a.d; a.win = decided ? Math.round(a.w / decided * 10000) / 10000 : 0; return a; }).sort(function (x, y) { return y.win - x.win; });
  }

  function simOptions(games, seedBase, options) {
    var matchup = options && options.matchup ? options.matchup.map(function (code) { return code.toUpperCase(); }) : null;
    return { games: games, seedBase: seedBase || 5000, avoid: matchup ? [] : (options && options.avoid ? options.avoid : SimSettings.DEFAULT_AVOID.slice()), matchup: matchup, fighterPickExclude: options && options.fighterPickExclude || [] };
  }
  var sim = { results: [], done: false, error: null, startedAt: 0, options: {} };
  sim.run = function (games, seedBase, options) {
    sim.results = []; sim.done = false; sim.error = null; sim.startedAt = Date.now();
    sim.options = simOptions(games, seedBase, options);
    var first = options && options.first || 0, last = options && options.end != null ? options.end : games;
    var i = first, channel = new MessageChannel();
    channel.port1.onmessage = function () { next(); };
    function next() {
      try {
        var sliceEnd = Date.now() + 200;
        while (i < last && Date.now() < sliceEnd) { sim.results.push(playOne(api.MAP_IDS[i % api.MAP_IDS.length], sim.options.seedBase + i, sim.options.avoid, sim.options.matchup, sim.options.fighterPickExclude)); i++; }
      } catch (err) { sim.error = String(err && err.stack || err); return; }
      if (i < last) channel.port2.postMessage(0);
      else { sim.done = true; sim.finishedAt = Date.now(); api.finish(api.MAP_IDS[0]); if (options && options.onDone) options.onDone(sim.results); }
    }
    next();
  };
  sim.runShard = function (index, count, games, seedBase, options) {
    var plan = new SimShardPlan(games, count, index), board = new SimShardChannel(), files = new SimShardFiles(games, seedBase, count);
    sim.run(games, seedBase, Object.assign({}, options, { first: plan.first, end: plan.end, onDone: function (results) {
      board.send(index, results);
      if (options && options.upload) files.save(index, results).then(function (ok) { sim.uploaded = ok; });
    } }));
  };
  sim.loadShards = function (count, games, seedBase, options) {
    sim.results = []; sim.done = false; sim.error = null; sim.startedAt = Date.now();
    sim.options = simOptions(games, seedBase, options);
    return new SimShardFiles(games, seedBase, count).loadAll().then(function (results) {
      sim.results = results; sim.done = true; sim.finishedAt = Date.now();
      return results.length;
    });
  };
  sim.collectShards = function (count, games, seedBase, options) {
    sim.results = []; sim.done = false; sim.error = null; sim.startedAt = Date.now();
    sim.options = simOptions(games, seedBase, options);
    return new SimShardChannel().collect(count).then(function (results) {
      sim.results = results; sim.done = true; sim.finishedAt = Date.now();
      return results.length;
    });
  };
  sim.comboRates = function (results) { return comboRates(results || sim.results); };
  sim.weakCombos = function (maxWin, minTeams, results) {
    maxWin = maxWin == null ? SimSettings.WEAK_COMBO_MAX_WIN : maxWin; minTeams = minTeams || SimSettings.WEAK_COMBO_MIN_TEAMS;
    return comboRates(results || sim.results).filter(function (c) { return c.n >= minTeams && c.win < maxWin; }).map(function (c) { return c.code; });
  };
  sim.summary = function (title, note) {
    var r = sim.results, byMap = {};
    api.MAP_IDS.forEach(function (m) { byMap[m] = { name: api.MAPS[m].name, totals: gameTotals(r, m), rows: statRows(r, m) }; });
    var roles = {};
    api.ROLE_LIST.forEach(function (k) { roles[k] = { name: api.ROLES[k].name, icon: api.ROLES[k].icon }; });
    return { title: title || "팀 배틀 아레나 시뮬레이션", note: note || "", createdAt: new Date().toISOString(), options: sim.options,
             seconds: Math.round(((sim.finishedAt || Date.now()) - sim.startedAt) / 1000), roleOrder: api.ROLE_LIST, roles: roles,
             totals: gameTotals(r), rows: statRows(r), combos: comboRates(r), mapOrder: api.MAP_IDS, maps: byMap };
  };
  sim.reportHtml = function (title, note) {
    return SimReportPage.build(sim.summary(title, note));
  };
  sim.saveReport = function (fileName, title, note) {
    return fetch("/__save-report?name=" + encodeURIComponent(fileName), { method: "POST", body: sim.reportHtml(title, note) })
      .then(function (res) { return res.ok ? "saved sim-reports/" + fileName : "save failed " + res.status; })
      .catch(function (err) { return "save failed " + err; });
  };
  return sim;
}

class SimShardPlan {
  constructor(totalGames, shardCount, shardIndex) { this.total = totalGames; this.count = shardCount; this.index = shardIndex; }
  get first() { return Math.floor(this.total * this.index / this.count); }
  get end() { return Math.floor(this.total * (this.index + 1) / this.count); }
}

class SimShardChannel {
  constructor() { this.channel = new BroadcastChannel("tb-sim-shards"); this.parts = {}; }
  send(index, results) { this.channel.postMessage({ index: index, results: results }); }
  merged(count) {
    var all = [];
    for (var i = 0; i < count; i++) all = all.concat(this.parts[i]);
    return all;
  }
  collect(count) {
    var board = this;
    return new Promise(function (resolve) {
      board.channel.onmessage = function (e) {
        board.parts[e.data.index] = e.data.results;
        if (Object.keys(board.parts).length === count) resolve(board.merged(count));
      };
    });
  }
}

class SimShardFiles {
  constructor(games, seedBase, count) { this.prefix = "sim-shard-" + games + "-" + seedBase + "-" + count + "-"; this.count = count; }
  nameOf(index) { return this.prefix + index + ".html"; }
  save(index, results) {
    return fetch("/__save-report?name=" + encodeURIComponent(this.nameOf(index)), { method: "POST", body: JSON.stringify(results) }).then(function (res) { return res.ok; });
  }
  loadAll() {
    var files = this;
    var parts = [];
    for (var i = 0; i < this.count; i++) parts.push(fetch("/sim-reports/" + encodeURIComponent(files.nameOf(i)), { cache: "no-store" }).then(function (res) { return res.json(); }));
    return Promise.all(parts).then(function (lists) { return [].concat.apply([], lists); });
  }
}

export class SimLauncher {
  constructor(sim, search) { this.sim = sim; this.query = new URLSearchParams(search); }
  start() {
    var shard = (this.query.get("shard") || "").split("/");
    if (shard.length !== 2) return false;
    this.sim.runShard(+shard[0], +shard[1], +this.query.get("games") || 5000, +this.query.get("seed") || 5000, { upload: this.query.get("upload") === "1", fighterPickExclude: (this.query.get("nofighter") || "").split(",").filter(Boolean) });
    return true;
  }
}
class SimReportPage {
  static CSS = [
    "body{margin:0;background:#F4F1E8;color:#23302A;font-family:'Nanum Gothic','Malgun Gothic',sans-serif}",
    "#app{max-width:1280px;margin:0 auto;padding:20px 16px 48px}",
    "h1{font-size:22px;margin:0 0 4px}.sub{color:#5B6B62;font-size:13px;margin-bottom:14px}",
    ".tabs{display:flex;gap:6px;border-bottom:2px solid #2F5D46;margin-bottom:16px;flex-wrap:wrap}",
    ".tabs button{font:inherit;font-weight:700;padding:9px 16px;border:0;border-radius:8px 8px 0 0;background:#DCE5DD;color:#2F5D46;cursor:pointer}",
    ".tabs button.on{background:#2F5D46;color:#fff}",
    ".cards{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}.card{background:#fff;border-radius:10px;padding:10px 14px;min-width:120px;box-shadow:0 1px 3px rgba(0,0,0,.08)}",
    ".card b{display:block;font-size:20px}.card span{font-size:12px;color:#5B6B62}",
    "h2{font-size:17px;margin:22px 0 8px}.wrap{overflow-x:auto;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}",
    "table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}",
    "th,td{padding:7px 9px;text-align:right;border-bottom:1px solid #E6E1D3}th{background:#EEF2EC;cursor:pointer;user-select:none;position:sticky;top:0}",
    "th:first-child,td:first-child{text-align:left}th.sorted{color:#D97B4F}td.win{font-weight:700}",
    ".hi{background:#DDF1E2}.lo{background:#F8DDD3}.muted{color:#9AA59F}",
    ".grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(560px,1fr));gap:0 18px}",
    ".note{font-size:12px;color:#5B6B62;margin-top:8px;line-height:1.6}",
    "@media (max-width:640px){.grid2{grid-template-columns:1fr}}"
  ].join("");

  static build(data) {
    return "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>" + HtmlText.escape(data.title) + "</title><style>" + SimReportPage.CSS + "</style></head><body><div id=\"app\"></div><script>" +
      ReportRenderer.toString() + ";new ReportRenderer(" + JSON.stringify(data).replace(/</g, "\\u003c") + ").render();</script></body></html>";
  }
}

class ReportRenderer {
  constructor(data) {
    this.data = data;
    this.app = document.getElementById("app");
    this.tables = [];
    this.icon = { F: data.roles.fighter.icon, C: data.roles.caster.icon, S: data.roles.shooter.icon, A: data.roles.assassin.icon };
    this.columns = ReportRenderer.makeColumns();
  }

  static fixed(v, d) { return (+v).toFixed(d); }

  static makeColumns() {
    var fixed = ReportRenderer.fixed;
    return [
      ["win", "승률(무승부 제외)", function (v) { return fixed(v * 100, 1) + "%"; }],
      ["n", "판 수", function (v) { return Math.round(v); }],
      ["dmg", "피해량", function (v) { return Math.round(v); }],
      ["skill", "스킬 피해(비중)", function (v, r) { return v > 0 ? Math.round(v) + " (" + Math.round(v / Math.max(1, r.dmg) * 100) + "%)" : "–"; }],
      ["heal", "회복량", function (v) { return Math.round(v); }],
      ["blk", "막은 피해", function (v) { return Math.round(v); }],
      ["taken", "받은 피해", function (v) { return Math.round(v); }],
      ["stun", "기절(초)", function (v) { return fixed(v, 1); }],
      ["slow", "둔화(초)", function (v) { return fixed(v, 1); }],
      ["k", "처치", function (v) { return fixed(v, 2); }],
      ["de", "죽음", function (v) { return fixed(v, 2); }],
      ["as", "어시스트", function (v) { return fixed(v, 2); }],
      ["mvp", "MVP", function (v) { return Math.round(v); }]
    ];
  }

  winTint(win) { return win >= 0.55 ? " hi" : (win < 0.40 ? " lo" : ""); }

  statTable(rows) {
    var id = this.tables.length;
    this.tables.push({ rows: rows.slice(), key: "win", desc: true });
    return "<div class=\"wrap\"><table data-t=\"" + id + "\"></table></div>";
  }

  drawTable(id) {
    var D = this.data, COLS = this.columns;
    var T = this.tables[id], el = document.querySelector("table[data-t=\"" + id + "\"]");
    T.rows.sort(function (a, b) { return T.key === "name" ? a.name.localeCompare(b.name, "ko") * (T.desc ? -1 : 1) : (T.desc ? b[T.key] - a[T.key] : a[T.key] - b[T.key]); });
    var head = "<tr><th data-k=\"name\"" + (T.key === "name" ? " class=\"sorted\"" : "") + ">직업명</th>" +
      COLS.map(function (c) { return "<th data-k=\"" + c[0] + "\"" + (T.key === c[0] ? " class=\"sorted\"" : "") + ">" + c[1] + "</th>"; }).join("") + "</tr>";
    el.innerHTML = "<thead>" + head + "</thead><tbody>" + T.rows.map(function (r) {
      var tint = this.winTint(r.win);
      return "<tr><td>" + D.roles[r.role].icon + " " + r.name + "</td>" + COLS.map(function (c) {
        return "<td class=\"" + (c[0] === "win" ? "win" + tint : "") + "\">" + c[2](r[c[0]], r) + "</td>";
      }).join("") + "</tr>";
    }, this).join("") + "</tbody>";
  }

  totalsCards(t, extra) {
    var fixed = ReportRenderer.fixed;
    function pct(v) { return t.games ? fixed(v / t.games * 100, 1) + "%" : "-"; }
    function winPct(v) { var decided = t.games - t.draws; return decided ? fixed(v / decided * 100, 1) + "%" : "-"; }
    return "<div class=\"cards\"><div class=\"card\"><b>" + t.games.toLocaleString() + "</b><span>경기 수</span></div>" +
      "<div class=\"card\"><b>" + pct(t.draws) + "</b><span>무승부 (" + t.draws + "판)</span></div>" +
      "<div class=\"card\"><b>" + winPct(t.blue) + "</b><span>블루팀 승률(무승부 제외)</span></div>" +
      "<div class=\"card\"><b>" + winPct(t.red) + "</b><span>레드팀 승률(무승부 제외)</span></div>" +
      "<div class=\"card\"><b>" + (t.games ? fixed(t.kills / t.games, 1) : "-") + "</b><span>경기당 킬(양 팀 합)</span></div>" + (extra || "") + "</div>";
  }
  comboName(code) { return code.split("").map(function (ch) { return this.icon[ch]; }, this).join(""); }

  render() {
    var D = this.data, app = this.app, tables = this.tables, fixed = ReportRenderer.fixed;
    var comboName = this.comboName.bind(this);
    var avoid = D.options.avoid || [];
    var optCard = D.options.matchup
      ? "<div class=\"card\"><b>" + D.options.matchup.map(comboName).join(" vs ") + "</b><span>고정 대결(판마다 진영 바꿈)</span></div>"
      : "<div class=\"card\"><b>" + (avoid.length ? avoid.map(comboName).join(" ") : "없음") + "</b><span>AI가 피한 조합" + (D.options.fighterPickExclude && D.options.fighterPickExclude.length ? " · 팀 전사 고르기에서 제외: " + D.options.fighterPickExclude.join(", ") : "") + "</span></div>";
    var comboRows = D.combos.map(function (c) {
      var tint = this.winTint(c.win);
      return "<tr><td>" + comboName(c.code) + "</td><td>" + c.n + "</td><td class=\"win" + tint + "\">" + fixed(c.win * 100, 1) + "%</td></tr>";
    }, this).join("");
    var tab1 = this.totalsCards(D.totals, optCard) + "<h2>캐릭터별 메인 통계</h2>" + this.statTable(D.rows) +
    "<h2>팀 구성별 승률</h2><div class=\"wrap\" style=\"max-width:420px\"><table><thead><tr><th>팀 구성</th><th>팀 수</th><th>승률(무승부 제외)</th></tr></thead><tbody>" + comboRows + "</tbody></table></div>" +
    "<p class=\"note\">숫자는 모두 무승부 판을 포함한 한 판(90초) 평균입니다. 승률만 무승부 판을 분모에서 뺍니다(승리 ÷ (판 수 - 무승부 판)). 기절·둔화는 적에게 건 시간. " +
    "스킬 피해(비중)은 입힌 피해 중 스킬로 준 피해와 그 비율. 네크로 해골 병사의 공격, 광전사 광폭화 중 기본 공격, 결투가 스킬 중 공격, 은신자 스킬 뒤 첫 공격도 스킬 피해로 셉니다. 받은 피해는 방어·보호막 등을 뺀 뒤 실제로 줄어든 체력의 양이고(해골 병사가 맞은 피해는 네크로의 막은 피해). 제목을 누르면 정렬됩니다.</p>";
    var tab2 = D.roleOrder.map(function (role) {
      var rows = D.rows.filter(function (r) { return r.role === role; });
      return "<h2>" + D.roles[role].icon + " " + D.roles[role].name + "</h2>" + this.statTable(rows);
    }, this).join("");
    var tab3 = D.mapOrder.map(function (m) {
      var M = D.maps[m];
      return "<h2>" + M.name + "</h2>" + this.totalsCards(M.totals) + this.statTable(M.rows);
    }, this).join("");
    var when = new Date(D.createdAt);
    app.innerHTML ="<h1>" + D.title + "</h1><div class=\"sub\">" + when.toLocaleString("ko-KR") + " · " + D.totals.games.toLocaleString() + "판 · 시드 " + D.options.seedBase +
    " · 약 " + Math.round(D.seconds / 60) + "분" + (D.note ? " · " + D.note : "") + "</div>" +
    "<div class=\"tabs\"><button data-tab=\"0\" class=\"on\">1. 전체 통계</button><button data-tab=\"1\">2. 직업군별</button><button data-tab=\"2\">3. 맵별</button></div>" +
    "<section>" + tab1 + "</section><section hidden>" + tab2 + "</section><section hidden>" + tab3 + "</section>";
    tables.forEach(function (T, i) { this.drawTable(i); }, this);
    app.addEventListener("click", this.onClick.bind(this));
  }

  onClick(e) {
    var app = this.app;
    var tab = e.target.closest("[data-tab]");
    if (tab) {
      [].forEach.call(app.querySelectorAll("[data-tab]"), function (b) { b.classList.toggle("on", b === tab); });
      [].forEach.call(app.querySelectorAll("section"), function (s, i) { s.hidden = String(i) !== tab.getAttribute("data-tab"); });
      return;
    }
    var th = e.target.closest("th[data-k]"), table = th && th.closest("table[data-t]");
    if (!table) return;
    var T = this.tables[+table.getAttribute("data-t")], key = th.getAttribute("data-k");
    T.desc = T.key === key ? !T.desc : key !== "name"; T.key = key;
    this.drawTable(+table.getAttribute("data-t"));
  }
}
