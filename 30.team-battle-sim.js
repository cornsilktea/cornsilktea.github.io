var T0 = 1700000000000;
var FRAME_MS = 33;
var MATCH_END_MS = 89000;

function seededRandom(seed) {
  var s = seed >>> 0;
  return function () { s = (s + 0x6D2B79F5) >>> 0; var q = Math.imul(s ^ (s >>> 15), 1 | s); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
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
    return { code: "SIM", ref: node(""), mode: "3v3", map: mapId, status: "playing", host: api.myId, startAt: T0 - 1000,
             winner: null, endedAt: 0, final: null, roster: null, draft: null };
  }

  function teamCode(chars) { return chars.map(function (c) { return ROLE_CODE[api.CHARS[c].role]; }).sort().join(""); }
  function pickTeamsOnce(rnd) {
    var all = api.CHAR_LIST.slice();
    var fighters = all.filter(function (c) { return api.CHARS[c].role === "fighter"; });
    function take(list) { return list.splice(Math.floor(rnd() * list.length), 1)[0]; }
    var blueFighter = take(fighters);
    var redFighter = take(fighters);
    var rest = all.filter(function (c) { return c !== blueFighter && c !== redFighter; });
    return {
      blue: [blueFighter, take(rest), take(rest)],
      red: [redFighter, take(rest), take(rest)]
    };
  }
  function pickTeams(rnd, avoid) {
    var teams = pickTeamsOnce(rnd);
    if (!avoid || !avoid.length) return teams;
    for (var tries = 0; tries < AVOID_MAX_TRIES; tries++) {
      if (avoid.indexOf(teamCode(teams.blue)) < 0 && avoid.indexOf(teamCode(teams.red)) < 0) return teams;
      teams = pickTeamsOnce(rnd);
    }
    return teams;
  }

  function playOne(mapId, seed, avoid) {
    var rnd = seededRandom(seed), realRandom = Math.random;
    Math.random = rnd;
    try {
      var teams = pickTeams(rnd, avoid), list = [];
      ["blue", "red"].forEach(function (team) {
        teams[team].forEach(function (c, i) { list.push({ id: team + (i + 1), team: team, char: c, slot: i + 1 }); });
      });
      api.loadMapData(mapId);
      var log = [], players = {}, bots = {}, t = T0;
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
      while (t < T0 + MATCH_END_MS) {
        t += FRAME_MS; api.setClock(t); api.stepWorld(t, FRAME_MS / 1000, true);
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
                  assists: E.assists || 0, heal: E.heal || 0, blocked: E.blocked || 0, stun: E.stunDealt || 0, slow: E.slowDealt || 0, slowWeight: E.slowWeight || 0, mvp: api.mvpScore(E),
                  alive: S.aliveN / S.sampleN, gaugeFull: S.aliveN ? S.fullN / S.aliveN : 0, near: S.nearN ? S.nearSum / S.nearN : 0, inRange: S.nearN ? S.inRangeN / S.nearN : 0, moved: S.movedSum };
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
        var a = acc[c.char] || (acc[c.char] = { n: 0, w: 0, dmg: 0, skill: 0, heal: 0, blk: 0, stun: 0, slow: 0, k: 0, de: 0, as: 0, alive: 0, mvp: 0 });
        a.n++; if (g.winner === c.team) a.w++;
        a.dmg += c.dmg; a.skill += c.ultDmg; a.heal += c.heal; a.blk += c.blocked; a.stun += c.stun; a.slow += c.slow;
        a.k += c.kills; a.de += c.deaths; a.as += c.assists; a.alive += c.alive; a.mvp += c.mvp;
      });
    });
    return Object.keys(acc).map(function (id) {
      var a = acc[id], ch = api.CHARS[id], row = { id: id, name: ch.name, role: ch.role, n: a.n, win: Math.round(a.w / a.n * 10000) / 10000 };
      ["dmg", "skill", "heal", "blk", "stun", "slow", "k", "de", "as", "alive", "mvp"].forEach(function (key) { row[key] = Math.round(a[key] / a.n * 1000) / 1000; });
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
        var a = acc[side[1]] || (acc[side[1]] = { code: side[1], n: 0, w: 0 });
        a.n++; if (g.winner === side[0]) a.w++;
      });
    });
    return Object.keys(acc).map(function (k) { var a = acc[k]; a.win = Math.round(a.w / a.n * 10000) / 10000; return a; }).sort(function (x, y) { return y.win - x.win; });
  }

  var sim = { results: [], done: false, error: null, startedAt: 0, options: {} };
  sim.run = function (games, seedBase, options) {
    sim.results = []; sim.done = false; sim.error = null; sim.startedAt = Date.now();
    sim.options = { games: games, seedBase: seedBase || 5000, avoid: options && options.avoid ? options.avoid : DEFAULT_AVOID.slice() };
    var i = 0;
    function next() {
      try {
        var end = Date.now() + 200;
        while (i < games && Date.now() < end) { sim.results.push(playOne(api.MAP_IDS[i % api.MAP_IDS.length], sim.options.seedBase + i, sim.options.avoid)); i++; }
      } catch (err) { sim.error = String(err && err.stack || err); return; }
      if (i < games) setTimeout(next, 0); else { sim.done = true; sim.finishedAt = Date.now(); api.finish(api.MAP_IDS[0]); }
    }
    next();
  };
  sim.comboRates = function (results) { return comboRates(results || sim.results); };
  sim.weakCombos = function (maxWin, minTeams, results) {
    maxWin = maxWin == null ? WEAK_COMBO_MAX_WIN : maxWin; minTeams = minTeams || WEAK_COMBO_MIN_TEAMS;
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
    var data = sim.summary(title, note);
    return "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>" + escapeHtml(data.title) + "</title><style>" + REPORT_CSS + "</style></head><body><div id=\"app\"></div><script>var DATA=" +
      JSON.stringify(data).replace(/</g, "\\u003c") + ";(" + renderReport.toString() + ")();</script></body></html>";
  };
  sim.saveReport = function (fileName, title, note) {
    return fetch("/__save-report?name=" + encodeURIComponent(fileName), { method: "POST", body: sim.reportHtml(title, note) })
      .then(function (res) { return res.ok ? "saved sim-reports/" + fileName : "save failed " + res.status; })
      .catch(function (err) { return "save failed " + err; });
  };
  return sim;
}

var AVOID_MAX_TRIES = 200;
var DEFAULT_AVOID = ["ACF", "AAF", "AFF"];
var WEAK_COMBO_MAX_WIN = 0.35;
var WEAK_COMBO_MIN_TEAMS = 100;
var ROLE_CODE = { fighter: "F", caster: "C", shooter: "S", assassin: "A" };

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]; }); }

var REPORT_CSS = [
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

function renderReport() {
  var D = DATA, app = document.getElementById("app");
  var ICON = { F: D.roles.fighter.icon, C: D.roles.caster.icon, S: D.roles.shooter.icon, A: D.roles.assassin.icon };
  function fixed(v, d) { return (+v).toFixed(d); }
  var COLS = [
    ["win", "승률", function (v) { return fixed(v * 100, 1) + "%"; }],
    ["n", "판 수", function (v) { return Math.round(v); }],
    ["dmg", "피해량", function (v) { return Math.round(v); }],
    ["skill", "그중 스킬 피해", function (v) { return v > 0 ? Math.round(v) : "–"; }],
    ["heal", "회복량", function (v) { return Math.round(v); }],
    ["blk", "막은 피해", function (v) { return Math.round(v); }],
    ["stun", "기절(초)", function (v) { return fixed(v, 1); }],
    ["slow", "둔화(초)", function (v) { return fixed(v, 1); }],
    ["k", "처치", function (v) { return fixed(v, 2); }],
    ["de", "죽음", function (v) { return fixed(v, 2); }],
    ["as", "어시스트", function (v) { return fixed(v, 2); }],
    ["alive", "생존율", function (v) { return Math.round(v * 100) + "%"; }],
    ["mvp", "MVP", function (v) { return Math.round(v); }]
  ];
  var tables = [];
  function statTable(rows) {
    var id = tables.length;
    tables.push({ rows: rows.slice(), key: "win", desc: true });
    return "<div class=\"wrap\"><table data-t=\"" + id + "\"></table></div>";
  }
  function drawTable(id) {
    var T = tables[id], el = document.querySelector("table[data-t=\"" + id + "\"]");
    T.rows.sort(function (a, b) { return T.key === "name" ? a.name.localeCompare(b.name, "ko") * (T.desc ? -1 : 1) : (T.desc ? b[T.key] - a[T.key] : a[T.key] - b[T.key]); });
    var head = "<tr><th data-k=\"name\"" + (T.key === "name" ? " class=\"sorted\"" : "") + ">직업명</th>" +
      COLS.map(function (c) { return "<th data-k=\"" + c[0] + "\"" + (T.key === c[0] ? " class=\"sorted\"" : "") + ">" + c[1] + "</th>"; }).join("") + "</tr>";
    el.innerHTML = "<thead>" + head + "</thead><tbody>" + T.rows.map(function (r) {
      var tint = r.win >= 0.55 ? " hi" : (r.win < 0.40 ? " lo" : "");
      return "<tr><td>" + D.roles[r.role].icon + " " + r.name + "</td>" + COLS.map(function (c) {
        return "<td class=\"" + (c[0] === "win" ? "win" + tint : "") + "\">" + c[2](r[c[0]]) + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody>";
  }
  function totalsCards(t, extra) {
    function pct(v) { return t.games ? fixed(v / t.games * 100, 1) + "%" : "-"; }
    return "<div class=\"cards\"><div class=\"card\"><b>" + t.games.toLocaleString() + "</b><span>경기 수</span></div>" +
      "<div class=\"card\"><b>" + pct(t.draws) + "</b><span>무승부 (" + t.draws + "판)</span></div>" +
      "<div class=\"card\"><b>" + pct(t.blue) + "</b><span>블루팀 승률</span></div>" +
      "<div class=\"card\"><b>" + pct(t.red) + "</b><span>레드팀 승률</span></div>" +
      "<div class=\"card\"><b>" + (t.games ? fixed(t.kills / t.games, 1) : "-") + "</b><span>경기당 킬(양 팀 합)</span></div>" + (extra || "") + "</div>";
  }
  function comboName(code) { return code.split("").map(function (ch) { return ICON[ch]; }).join(""); }
  var avoid = D.options.avoid || [];
  var optCard = "<div class=\"card\"><b>" + (avoid.length ? avoid.map(comboName).join(" ") : "없음") + "</b><span>AI가 피한 조합</span></div>";
  var comboRows = D.combos.map(function (c) {
    var tint = c.win >= 0.55 ? " hi" : (c.win < 0.40 ? " lo" : "");
    return "<tr><td>" + comboName(c.code) + "</td><td>" + c.n + "</td><td class=\"win" + tint + "\">" + fixed(c.win * 100, 1) + "%</td></tr>";
  }).join("");
  var tab1 = totalsCards(D.totals, optCard) + "<h2>캐릭터별 메인 통계</h2>" + statTable(D.rows) +
    "<h2>팀 구성별 승률</h2><div class=\"wrap\" style=\"max-width:420px\"><table><thead><tr><th>팀 구성</th><th>팀 수</th><th>승률</th></tr></thead><tbody>" + comboRows + "</tbody></table></div>" +
    "<p class=\"note\">숫자는 모두 한 판(90초) 평균입니다. 승률 = 승리 ÷ 판 수(무승부 포함). 기절·둔화는 적에게 건 시간. " +
    "그중 스킬 피해가 \"–\"인 캐릭터는 스킬 피해가 따로 집계되지 않는 캐릭터입니다(스킬이 기본 공격을 강화하는 방식 등). 제목을 누르면 정렬됩니다.</p>";
  var tab2 = D.roleOrder.map(function (role) {
    var rows = D.rows.filter(function (r) { return r.role === role; });
    return "<h2>" + D.roles[role].icon + " " + D.roles[role].name + "</h2>" + statTable(rows);
  }).join("");
  var tab3 = D.mapOrder.map(function (m) {
    var M = D.maps[m];
    return "<h2>" + M.name + "</h2>" + totalsCards(M.totals) + statTable(M.rows);
  }).join("");
  var when = new Date(D.createdAt);
  app.innerHTML = "<h1>" + D.title + "</h1><div class=\"sub\">" + when.toLocaleString("ko-KR") + " · " + D.totals.games.toLocaleString() + "판 · 시드 " + D.options.seedBase +
    " · 약 " + Math.round(D.seconds / 60) + "분" + (D.note ? " · " + D.note : "") + "</div>" +
    "<div class=\"tabs\"><button data-tab=\"0\" class=\"on\">1. 전체 통계</button><button data-tab=\"1\">2. 직업군별</button><button data-tab=\"2\">3. 맵별</button></div>" +
    "<section>" + tab1 + "</section><section hidden>" + tab2 + "</section><section hidden>" + tab3 + "</section>";
  tables.forEach(function (T, i) { drawTable(i); });
  app.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-tab]");
    if (tab) {
      [].forEach.call(app.querySelectorAll("[data-tab]"), function (b) { b.classList.toggle("on", b === tab); });
      [].forEach.call(app.querySelectorAll("section"), function (s, i) { s.hidden = String(i) !== tab.getAttribute("data-tab"); });
      return;
    }
    var th = e.target.closest("th[data-k]"), table = th && th.closest("table[data-t]");
    if (!table) return;
    var T = tables[+table.getAttribute("data-t")], key = th.getAttribute("data-k");
    T.desc = T.key === key ? !T.desc : key !== "name"; T.key = key;
    drawTable(+table.getAttribute("data-t"));
  });
}
