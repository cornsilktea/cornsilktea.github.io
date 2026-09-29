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

  function pickTeams(rnd) {
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

  function playOne(mapId, seed) {
    var rnd = seededRandom(seed), realRandom = Math.random;
    Math.random = rnd;
    try {
      var teams = pickTeams(rnd), list = [];
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
      while (t < T0 + MATCH_END_MS) { t += FRAME_MS; api.setClock(t); api.stepWorld(t, FRAME_MS / 1000, true); }
      var killsBy = {};
      log.forEach(function (p) { if (p.path === "kills" && p.v.k) killsBy[p.v.k] = (killsBy[p.v.k] || 0) + 1; });
      var score = { blue: 0, red: 0 };
      var chars = list.map(function (e) {
        var E = bots[e.id];
        score[e.team === "blue" ? "red" : "blue"] += E.deaths || 0;
        return { char: e.char, team: e.team, dmg: E.dmg || 0, deaths: E.deaths || 0, kills: killsBy[e.id] || 0 };
      });
      return { map: mapId, seed: seed, blue: score.blue, red: score.red,
               winner: score.blue > score.red ? "blue" : (score.red > score.blue ? "red" : "draw"), chars: chars };
    } finally { Math.random = realRandom; }
  }

  var sim = { results: [], done: false, error: null, startedAt: 0 };
  sim.run = function (games, seedBase) {
    sim.results = []; sim.done = false; sim.error = null; sim.startedAt = Date.now();
    var i = 0;
    function next() {
      try {
        var end = Date.now() + 200;
        while (i < games && Date.now() < end) { sim.results.push(playOne(api.MAP_IDS[i % api.MAP_IDS.length], (seedBase || 5000) + i)); i++; }
      } catch (err) { sim.error = String(err && err.stack || err); return; }
      if (i < games) setTimeout(next, 0); else { sim.done = true; api.finish(api.MAP_IDS[0]); }
    }
    next();
  };
  return sim;
}
