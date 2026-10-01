function collectResults(api) {
  var T0 = 1700000000000;
  var FRAME = 1000 / 60;
  var OPEN_Y = { forest: 575, river: 575, dungeon: 525, windhill: 575 };

  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function seededRandom(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var q = Math.imul(s ^ (s >>> 15), 1 | s); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
  }

  function blockedAt(x, y) {
    if (!isFinite(x) || !isFinite(y)) return "숫자 아님(NaN)";
    var R = api.BODY_R - 1.5, B = api.BOUND, o = api.obstacles();
    if (x < B.l + R || x > B.r - R || y < B.t + R || y > B.b - R) return "맵 밖";
    function touching(list) {
      return list.some(function (q) {
        var cx = clamp(x, q.x - q.w / 2, q.x + q.w / 2), cy = clamp(y, q.y - q.h / 2, q.y + q.h / 2);
        return hyp(x - cx, y - cy) < R;
      });
    }
    if (touching(o.walls)) return "벽 안";
    if (touching(o.water)) return "물 안";
    return null;
  }
  function segmentCrossesWall(ax, ay, bx, by) {
    return api.obstacles().walls.some(function (q) {
      var x0 = q.x - q.w / 2 + 1, x1 = q.x + q.w / 2 - 1, y0 = q.y - q.h / 2 + 1, y1 = q.y + q.h / 2 - 1;
      var tmin = 0, tmax = 1, dx = bx - ax, dy = by - ay;
      function slab(p, d, lo, hi) {
        if (Math.abs(d) < 1e-9) return p > lo && p < hi;
        var t1 = (lo - p) / d, t2 = (hi - p) / d;
        tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
        return tmin < tmax;
      }
      return slab(ax, dx, x0, x1) && slab(ay, dy, y0, y1);
    });
  }
  function singleRowWall() {
    return api.obstacles().walls.filter(function (q) {
      var below = q.y + q.h / 2 + api.BODY_R + 2;
      return q.h === 50 && !blockedAt(q.x, below) && !blockedAt(q.x, below + 100) && !blockedAt(q.x, q.y - q.h / 2 - api.BODY_R - 2);
    })[0];
  }

  function fakeRoom(mapId, log) {
    var n = 0;
    function snap(path, key, val) {
      var parts = path.split("/");
      return { key: key, val: function () { return val; }, ref: { parent: { key: parts[parts.length - 1] }, remove: function () {} } };
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
        push: function (v) { rejectUndefined(v, path); var key = "k" + (++n); dispatch(path, key, v); return { key: key }; },
        set: function () {}, update: function () {}, remove: function () {}, on: function () {}, off: function () {},
        once: function () { return Promise.resolve({ val: function () { return null; } }); }
      };
    }
    return { code: "TEST", ref: node(""), mode: "3v3", map: mapId, status: "playing", host: api.myId, startAt: T0 - 1000,
             winner: null, endedAt: 0, final: null, roster: null, draft: null };
  }

  function world(mapId, list) {
    api.loadMapData(mapId);
    var log = [], players = {}, bots = {}, t = T0;
    list.forEach(function (e, i) {
      players[e.id] = { nickname: e.id, isAI: true, team: e.team, characterType: e.char, slot: e.slot || (i % 3) + 1, joinedAt: i };
    });
    var room = fakeRoom(mapId, log);
    api.begin(room, players, bots, t);
    list.forEach(function (e) {
      var E = api.makeEnt(e.id, players[e.id]);
      if (e.x != null) { E.x = e.x; E.y = e.y; }
      E.angle = e.angle || 0;
      if (e.gauge != null) E.gauge = e.gauge;
      E.bot = { seed: Math.random() * 10, seenAt: 0, target: null, stuck: 0, detour: 0, detourDir: 1 };
      bots[e.id] = E;
    });
    var w = {
      log: log, room: room,
      ent: function (id) { return bots[id]; },
      t: function () { return t; },
      frame: function (ms, driveBots) { t += ms; api.setClock(t); api.stepWorld(t, Math.min(0.05, ms / 1000), !!driveBots); },
      step: function (ms, frameMs, each) {
        var end = t + ms;
        while (t < end - 1e-6) { w.frame(Math.min(frameMs || FRAME, end - t)); if (each) each(t); }
      },
      pushesFrom: function (id, path) { return log.filter(function (p) { return p.path === path && p.v.owner === id; }); }
    };
    return w;
  }
  function angleTo(A, B) { return Math.atan2(B.y - A.y, B.x - A.x); }
  function fullGauge(E) { E.gauge = api.GAUGE_MAX; }

  var results = [];
  function rejectUndefined(v, path) {
    if (v && typeof v === "object") Object.keys(v).forEach(function (k) { if (v[k] === undefined) throw new Error("Firebase 는 undefined 를 받지 않음: " + path + "." + k); else rejectUndefined(v[k], path + "." + k); });
  }
  function report(group, name, status, detail) { results.push({ group: group, name: name, status: status, detail: detail }); }
  function run(group, name, fn) {
    try { fn(function (status, detail) { report(group, name, status, detail); }); }
    catch (err) { report(group, name, "fail", "시험 코드 오류: " + (err && err.message)); }
  }

  var WALL = "벽·물 끼임", STUN = "기절·행동 불가", MOVE = "이동기·넉백", GAUGE = "궁극기 게이지", MISC = "죽음·부활", AUTO = "자동 난전";

  run(WALL, "무작위 위치 5,000곳 × 지도 " + api.MAP_IDS.length + "개를 밀어내기 처리하면 벽·물 밖으로 나오는가", function (done) {
    var rnd = seededRandom(7), bad = [];
    api.MAP_IDS.forEach(function (m) {
      api.loadMapData(m);
      for (var i = 0; i < 5000; i++) {
        var p = { x: api.BOUND.l + rnd() * (api.BOUND.r - api.BOUND.l), y: api.BOUND.t + rnd() * (api.BOUND.b - api.BOUND.t) };
        api.resolve(p);
        var why = blockedAt(p.x, p.y);
        if (why) bad.push(m + " (" + Math.round(p.x) + ", " + Math.round(p.y) + ") " + why);
      }
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.length + "곳 실패. 예: " + bad.slice(0, 3).join(" / ") : (5000 * api.MAP_IDS.length).toLocaleString() + "곳 모두 벽·물 밖으로 나옴");
  });

  function guardianIntoWall(hitchMs) {
    var W = world("forest", []), q = singleRowWall();
    var ty = q.y + q.h / 2 + api.BODY_R + 2;
    W = world("forest", [
      { id: "gd", team: "blue", char: "guardian", x: q.x, y: ty + 80, angle: -Math.PI / 2, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: q.x, y: ty }
    ]);
    api.useUlt(W.ent("gd"), -Math.PI / 2);
    var worst = null;
    function check() { var why = blockedAt(W.ent("foe").x, W.ent("foe").y); if (why && !worst) worst = why; }
    W.frame(FRAME); check();
    if (hitchMs) { W.frame(hitchMs); check(); }
    W.step(700, FRAME, check);
    var foe = W.ent("foe"), wallBottom = q.y + q.h / 2;
    return { crossed: foe.y < q.y, stuck: worst, y: Math.round(foe.y), wallTop: q.y - q.h / 2, wallBottom: wallBottom };
  }
  run(MOVE, "수문장 창벽: 벽 앞의 적을 벽 쪽으로 밀면 벽 앞에서 멈추는가 (보통 속도 60fps)", function (done) {
    var r = guardianIntoWall(0);
    done(r.crossed || r.stuck ? "fail" : "pass", r.crossed ? "벽(" + r.wallTop + "~" + r.wallBottom + ")을 뚫고 y=" + r.y + "로 넘어감" : r.stuck ? r.stuck : "벽 아래 y=" + r.y + "에서 멈춤");
  });
  [120, 250].forEach(function (hitch) {
    run(MOVE, "수문장 창벽: 기기가 " + hitch + "ms 멈칫한 순간 밀리면 벽을 뚫는가 (느린 태블릿 상황)", function (done) {
      var r = guardianIntoWall(hitch);
      done(r.crossed || r.stuck ? "fail" : "pass", r.crossed ? "한 프레임에 크게 밀려 벽(" + r.wallTop + "~" + r.wallBottom + ")을 뚫고 반대편 y=" + r.y + "로 넘어감" : r.stuck ? r.stuck : "벽 아래 y=" + r.y + "에서 멈춤");
    });
  });

  run(MOVE, "자객 돌진: 벽을 향해 돌진하면 벽 앞에서 멈추는가", function (done) {
    var q = singleRowWall(), x0 = q.x - 25, y0 = q.y + q.h / 2 + 130;
    var W = world("forest", [{ id: "hm", team: "blue", char: "hitman", x: x0, y: y0, angle: -Math.PI / 2 }]);
    if (blockedAt(x0, y0)) { done("fail", "시험 준비 실패: 출발 위치가 막혀 있음"); return; }
    api.fireBasic(W.ent("hm"), -Math.PI / 2);
    var worst = null;
    W.step(600, FRAME, function () { var why = blockedAt(W.ent("hm").x, W.ent("hm").y); if (why && !worst) worst = why; });
    var E = W.ent("hm");
    done(worst || E.y < q.y ? "fail" : "pass", worst ? worst : "벽 아래 y=" + Math.round(E.y) + "에서 멈춤 (벽 아래면 " + (q.y + q.h / 2) + ")");
  });

  run(MOVE, "자객 처형: 벽에 붙어 있는 적을 맞히고 순간이동하면 벽에 끼지 않는가", function (done) {
    var q = singleRowWall(), ty = q.y + q.h / 2 + api.BODY_R + 2, x = q.x - 25;
    var W = world("forest", [
      { id: "hm", team: "blue", char: "hitman", x: x, y: ty + 280, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: x, y: ty }
    ]);
    var hm = W.ent("hm"), foe = W.ent("foe");
    api.useUlt(hm, angleTo(hm, foe));
    W.step(800);
    if (foe.hp === foe.maxHp) { done("fail", "시험 준비 실패: 처형이 적에게 맞지 않음"); return; }
    var why = blockedAt(hm.x, hm.y);
    done(why ? "fail" : "pass", why ? "순간이동 후 " + why : "적 위치(" + Math.round(hm.x) + ", " + Math.round(hm.y) + ")로 이동, 벽 밖");
  });

  run(MOVE, "결투가 돌진: 벽을 향해 돌진하면 벽 앞에서 바로 멈추고 찌르기로 넘어가는가", function (done) {
    var q = singleRowWall(), x0 = q.x - 25, y0 = q.y + q.h / 2 + 130, c = api.CHARS.duelist;
    var W = world("forest", [{ id: "du", team: "blue", char: "duelist", x: x0, y: y0, angle: -Math.PI / 2 }]);
    if (blockedAt(x0, y0)) { done("fail", "시험 준비 실패: 출발 위치가 막혀 있음"); return; }
    var E = W.ent("du"), start = W.t(), endedAt = 0, worst = null;
    api.fireBasic(E, -Math.PI / 2);
    W.step(900, FRAME, function (t) { var why = blockedAt(E.x, E.y); if (why && !worst) worst = why; if (!E.dash && !endedAt) endedAt = t; });
    var moved = y0 - E.y, fullMs = c.dashMs * moved / c.dashRange, took = endedAt - start, bad = [];
    if (worst) bad.push(worst);
    if (E.y < q.y) bad.push("벽을 뚫음");
    if (took > fullMs + 60) bad.push(Math.round(moved) + " 움직이는 데 " + Math.round(took) + "ms (벽 앞에서 느리게 미끄러짐)");
    if (!E.stabAt) bad.push("찌르기가 안 나감");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "벽 아래 y=" + Math.round(E.y) + "까지 " + Math.round(moved) + " 돌진, " + Math.round(took) + "ms 만에 끝나고 찌름");
  });

  run(MOVE, "결투가 찌르기: 찌를 적이 없어도 찌르기 범위가 표시되는가 (피해 없음)", function (done) {
    var W = world("forest", [{ id: "du", team: "blue", char: "duelist", x: 200, y: OPEN_Y.forest }]);
    api.fireBasic(W.ent("du"), 0);
    W.step(api.CHARS.duelist.dashMs + 100);
    var hits = W.pushesFrom("du", "meleeHits");
    var ok = hits.length === 1 && hits[0].v.stab && hits[0].v.radius === api.CHARS.duelist.range && !hits[0].v.tgt;
    done(ok ? "pass" : "fail", ok ? "반경 " + hits[0].v.radius + " 범위 표시, 대상 없음" : "찌르기 기록 " + JSON.stringify(hits.map(function (h) { return h.v; })));
  });

  run(MOVE, "결투가 찌르기: 돌진이 끝난 뒤 반경 안의 가장 가까운 적 1명만 찌르고 체력을 회복하는가", function (done) {
    var y = OPEN_Y.forest, c = api.CHARS.duelist;
    var W = world("forest", [
      { id: "du", team: "blue", char: "duelist", x: 200, y: y },
      { id: "near", team: "red", char: "guardian", x: 200 + c.dashRange + 60, y: y },
      { id: "far", team: "red", char: "guardian", x: 200 + c.dashRange + 120, y: y }
    ]);
    var du = W.ent("du"), near = W.ent("near"), far = W.ent("far");
    du.hp = 200;
    api.fireBasic(du, 0);
    W.step(c.dashMs - 50);
    var early = near.hp < near.maxHp || far.hp < far.maxHp;
    W.step(150);
    var bad = [];
    if (early) bad.push("도착 전에 찌름");
    if (near.hp !== near.maxHp - c.dmg) bad.push("가까운 적 피해 " + (near.maxHp - near.hp));
    if (far.hp !== far.maxHp) bad.push("먼 적도 맞음");
    if (du.hp !== 200 + c.selfHeal) bad.push("회복 후 체력 " + du.hp);
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "가까운 적만 " + c.dmg + " 피해, 체력 " + c.selfHeal + " 회복");
  });

  run(MOVE, "결투가 르미즈: 기본 공격 대기시간이 초기화되고 3초간 초당 3회·0.3초 돌진이 되는가", function (done) {
    var y = OPEN_Y.forest, c = api.CHARS.duelist;
    var W = world("forest", [{ id: "du", team: "blue", char: "duelist", x: 150, y: y, gauge: api.GAUGE_MAX }]);
    var du = W.ent("du"), bad = [];
    api.fireBasic(du, 0);
    W.step(c.dashMs + 50);
    api.useUlt(du, 0);
    if (du.cdUntil > W.t()) bad.push("대기시간이 남음");
    var start = W.t();
    api.fireBasic(du, Math.PI);
    if (Math.round(du.cdUntil - start) !== Math.round(1000 / api.ULT.rmRate)) bad.push("공격 간격 " + Math.round(du.cdUntil - start) + "ms");
    var sx = du.x;
    W.step(api.ULT.rmDashMs + 20);
    if (du.dash) bad.push("돌진이 0.3초에 안 끝남");
    if (Math.abs(Math.abs(du.x - sx) - api.ULT.rmDashRange) > 2) bad.push("스킬 중 돌진 거리 " + Math.round(Math.abs(du.x - sx)));
    W.step(api.ULT.rmDur);
    api.fireBasic(du, 0);
    if (Math.round(du.cdUntil - W.t()) !== c.cd) bad.push("스킬 끝난 뒤 공격 간격 " + Math.round(du.cdUntil - W.t()) + "ms");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "초기화 → " + Math.round(1000 / api.ULT.rmRate) + "ms 간격·" + api.ULT.rmDashRange + " 거리 " + api.ULT.rmDashMs + "ms 돌진 → 끝난 뒤 " + c.cd + "ms 간격");
  });

  run(MOVE, "블랙홀 중심을 벽 안에 찍어도 끌려간 적이 벽에 끼지 않는가", function (done) {
    var q = singleRowWall(), ty = q.y + q.h / 2 + api.BODY_R + 40;
    var W = world("forest", [
      { id: "pr", team: "blue", char: "priest", x: q.x, y: ty + 150, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: q.x + 30, y: ty }
    ]);
    var pr = W.ent("pr"), aim = Math.atan2(q.y - pr.y, q.x - pr.x);
    api.useUlt(pr, aim, hyp(q.x - pr.x, q.y - pr.y));
    var worst = null, moved = 0, sx = W.ent("foe").x, sy = W.ent("foe").y;
    W.step(3800, FRAME, function () { var f = W.ent("foe"), why = blockedAt(f.x, f.y); if (why && !worst) worst = why; });
    moved = hyp(W.ent("foe").x - sx, W.ent("foe").y - sy);
    done(worst ? "fail" : (moved < 5 ? "fail" : "pass"), worst ? worst : (moved < 5 ? "시험 준비 실패: 적이 끌려가지 않음" : Math.round(moved) + "만큼 끌려가 벽 앞에 붙음, 끼지 않음"));
  });

  run(MOVE, "블랙홀에 끌려가는 중에 창벽 넉백을 같이 받으면 벽·물에 끼지 않는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "pr", team: "blue", char: "priest", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "gd", team: "blue", char: "guardian", x: 500, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 440, y: y }
    ]);
    api.useUlt(W.ent("pr"), 0, 200);
    W.step(700);
    api.useUlt(W.ent("gd"), Math.PI);
    var worst = null;
    W.step(3000, FRAME, function () { var f = W.ent("foe"), why = blockedAt(f.x, f.y); if (why && !worst) worst = why; });
    done(worst ? "fail" : "pass", worst ? worst : "최종 위치 (" + Math.round(W.ent("foe").x) + ", " + Math.round(W.ent("foe").y) + "), 끼지 않음");
  });

  function lancerDisplaced(push) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "ln", team: "blue", char: "lancer", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 480, y: y },
      { id: "gd", team: "red", char: "guardian", x: 190, y: y, gauge: api.GAUGE_MAX },
      { id: "pr", team: "red", char: "priest", x: 250, y: y + 250, gauge: api.GAUGE_MAX }
    ]);
    if (push === "hole") { api.useUlt(W.ent("pr"), -Math.PI / 2, 120); W.step(api.ULT.bhDelay + 100); }
    var castX = W.ent("ln").x, castY = W.ent("ln").y;
    api.useUlt(W.ent("ln"), 0);
    W.step(50);
    if (push === "guardian") api.useUlt(W.ent("gd"), 0);
    W.step(api.ULT.lnWind + 100);
    var moved = Math.round(hyp(W.ent("ln").x - castX, W.ent("ln").y - castY));
    W.step(500);
    var struck = W.pushesFrom("ln", "meleeHits").filter(function (p) { return !p.v.wind && p.v.dmg; }).length;
    return { struck: struck, hurt: W.ent("foe").hp < W.ent("foe").maxHp, moved: moved, free: api.speedOf(W.ent("ln")) > 0 };
  }
  run(MOVE, "창술사 꿰뚫기: 준비 동작 없이 두면 찌르기가 나가는가 (기준 확인)", function (done) {
    var r = lancerDisplaced(null);
    done(r.struck && r.hurt ? "pass" : "fail", r.struck && r.hurt ? "찌르기가 나가 적이 맞음" : "찌르기가 나가지 않음");
  });
  run(MOVE, "창술사 꿰뚫기: 준비 중 창벽에 밀려나면 취소되는가", function (done) {
    var r = lancerDisplaced("guardian");
    done(!r.struck && !r.hurt && r.free ? "pass" : "fail", r.struck || r.hurt ? r.moved + "만큼 밀렸는데 찌르기가 나감" : !r.free ? "취소됐지만 창술사가 계속 묶여 있음" : r.moved + "만큼 밀려 취소됨, 바로 움직일 수 있음");
  });
  run(MOVE, "창술사 꿰뚫기: 준비 중 블랙홀에 끌려가면 취소되는가", function (done) {
    var r = lancerDisplaced("hole");
    if (!r.moved) { done("fail", "시험 준비 실패: 블랙홀이 창술사를 끌지 못함"); return; }
    done(!r.struck && !r.hurt ? "pass" : "fail", r.struck || r.hurt ? "끌려갔는데 찌르기가 나감" : r.moved + "만큼 끌려 취소됨");
  });

  function lancerStunnedBy(stunMs) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "ln", team: "blue", char: "lancer", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 450, y: y }
    ]);
    api.useUlt(W.ent("ln"), 0);
    W.step(100);
    api.afflict(W.ent("ln"), { stunMs: stunMs });
    W.step(500);
    return W.ent("foe").hp < W.ent("foe").maxHp;
  }
  run(STUN, "창술사 꿰뚫기 준비 중에 기절하면 찌르기가 취소되는가 (기절 시간별)", function (done) {
    var sources = [["자객 처형·주술사 메테오·기사 방어태세", api.ULT.mbStunMs], ["대장장이 내려찍기", api.ULT.bsStunMs], ["창술사 꿰뚫기", api.ULT.lnStunMs]];
    var fired = sources.filter(function (s) { return lancerStunnedBy(s[1]); });
    done(fired.length ? "fail" : "pass", fired.length
      ? "기절했는데도 찌르기가 나감: " + fired.map(function (s) { return s[0] + "(" + s[1] / 1000 + "초 기절)"; }).join(", ")
      : "모든 기절에서 취소됨");
  });

  run(MISC, "부활 보호(" + api.RESPAWN_PROTECT_MS / 1000 + "초) 중에는 모든 공격·기절·둔화·넉백·끌어당김에 면역인가", function (done) {
    var y = OPEN_Y.forest, casters = [
      { id: "mg", team: "blue", char: "mage", x: 300, y: y - 220, gauge: api.GAUGE_MAX },
      { id: "gd", team: "blue", char: "guardian", x: 520, y: y, gauge: api.GAUGE_MAX },
      { id: "bs", team: "blue", char: "blacksmith", x: 420, y: y + 250, gauge: api.GAUGE_MAX },
      { id: "th", team: "blue", char: "thrower", x: 250, y: y + 200, gauge: api.GAUGE_MAX },
      { id: "pr", team: "blue", char: "priest", x: 250, y: y - 150, gauge: api.GAUGE_MAX },
      { id: "hm", team: "blue", char: "hitman", x: 150, y: y, gauge: api.GAUGE_MAX },
      { id: "gb", team: "blue", char: "guardian", x: 360, y: y, slot: 3 }
    ];
    var W = world("forest", casters.concat([{ id: "foe", team: "red", char: "warrior", x: 420, y: y }]));
    var foe = W.ent("foe"), bad = [], sx = foe.x, sy = foe.y, hm = W.ent("hm"), hmX = hm.x;
    foe.protectUntil = W.t() + 3000;
    api.useUlt(W.ent("bs"), -Math.PI / 2, 250);
    api.useUlt(W.ent("mg"), angleTo(W.ent("mg"), foe), hyp(foe.x - W.ent("mg").x, foe.y - W.ent("mg").y));
    api.useUlt(W.ent("gd"), Math.PI);
    api.useUlt(W.ent("th"), angleTo(W.ent("th"), foe), hyp(foe.x - W.ent("th").x, foe.y - W.ent("th").y));
    api.useUlt(W.ent("pr"), angleTo(W.ent("pr"), foe), hyp(foe.x - W.ent("pr").x, foe.y - W.ent("pr").y));
    api.useUlt(hm, 0);
    api.fireBasic(W.ent("gb"), 0);
    W.step(2500, FRAME, function (t) {
      if (api.stunned(foe, t) && bad.indexOf("기절") < 0) bad.push("기절");
      if (api.speedOf(foe) < api.CHARS.warrior.speed && !api.stunned(foe, t) && bad.indexOf("둔화") < 0) bad.push("둔화");
    });
    if (foe.hp < foe.maxHp) bad.push("피해 " + (foe.maxHp - foe.hp));
    if (hyp(foe.x - sx, foe.y - sy) > 1) bad.push("위치가 " + Math.round(hyp(foe.x - sx, foe.y - sy)) + " 움직임(넉백·블랙홀)");
    if (Math.abs(hm.x - hmX) > 100) bad.push("자객이 보호 중인 적에게 순간이동");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "메테오·창벽·내려찍기·독안개·블랙홀·처형·수문장 둔화 모두 면역");
  });

  run(STUN, "둔화가 겹치면 더 강한 둔화만 적용되는가 (20% 4초 + 40% 2초 동시)", function (done) {
    var W = world("forest", [{ id: "kn", team: "red", char: "knight", x: 450, y: OPEN_Y.forest }]);
    var E = W.ent("kn"), base = api.CHARS.knight.speed, seen = [];
    api.afflict(E, { slowMs: 4000, slowMul: 0.8 }); api.afflict(E, { slowMs: 2000, slowMul: 0.6 });
    [1000, 3000, 4200].forEach(function (at, i) {
      W.step(at - (i ? [1000, 3000][i - 1] : 0));
      seen.push(Math.round(api.speedOf(E) / base * 100));
    });
    var ok = seen[0] === 60 && seen[1] === 80 && seen[2] === 100;
    done(ok ? "pass" : "fail", "1초: " + seen[0] + "%, 3초: " + seen[1] + "%, 4.2초: " + seen[2] + "% 속도 (기대 60% → 80% → 100%)");
  });

  run(STUN, "MVP 기절·둔화 기여는 이미 걸린 효과와 겹친 만큼 빼고 쌓이는가", function (done) {
    var W = world("forest", [{ id: "kn", team: "red", char: "knight", x: 450, y: OPEN_Y.forest }]);
    var E = W.ent("kn"), pend = api.ccPending();
    api.afflict(E, { stunMs: 1200 }, "a"); api.afflict(E, { stunMs: 800 }, "b");
    api.afflict(E, { slowMs: 4000, slowMul: 0.8 }, "c"); api.afflict(E, { slowMs: 2000, slowMul: 0.6 }, "d");
    var a = pend.a || {}, c = pend.c || {}, d = pend.d || {}, bad = [];
    if (Math.round(a.stun) !== 1200) bad.push("첫 기절 " + a.stun + "ms (기대 1200)");
    if (pend.b) bad.push("겹친 기절에 기여가 생김 " + pend.b.stun + "ms");
    if (Math.round(c.slow) !== 4000 || Math.round(c.weight) !== 800) bad.push("20% 4초 둔화 " + c.slow + "ms·가중 " + c.weight + " (기대 4000·800)");
    if (Math.round(d.slow || 0) !== 0 || Math.round(d.weight) !== 400) bad.push("겹친 40% 2초 둔화 " + d.slow + "ms·가중 " + d.weight + " (기대 0·400)");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "기절 1.2초만, 둔화는 늘어난 강도만(가중 0.8초 + 0.4초) 기여로 셈");
  });
  run(STUN, "블랙홀에 끌려간 시간은 기절이 아니라 " + Math.round(api.ULT.bhCcRate * 100) + "% 둔화로 MVP 기여에 쌓이는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "pr", team: "blue", char: "priest", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 560, y: y }
    ]);
    var foe = W.ent("foe");
    api.useUlt(W.ent("pr"), 0, 200);
    W.step(api.ULT.bhDelay + 1000 + 20);
    var left = api.ccPending().pr || {}, pulled = { stun: left.stun || 0, slow: left.slow || 0, weight: left.weight || 0 }, bad = [];
    W.log.filter(function (p) { return p.path === "hits/pr"; }).forEach(function (p) {
      pulled.stun += p.v.cs || 0; pulled.slow += p.v.ss || 0; pulled.weight += p.v.sw || 0;
    });
    if (pulled.stun) bad.push("기절 기여 " + Math.round(pulled.stun) + "ms");
    if (api.stunned(foe, W.t())) bad.push("끌려가는 적이 기절 상태");
    if (pulled.slow < 500) bad.push("둔화 " + Math.round(pulled.slow) + "ms (끌림 기여가 거의 없음)");
    if (Math.abs(pulled.weight - pulled.slow * api.ULT.bhCcRate) > 5) bad.push("가중 " + Math.round(pulled.weight) + " (둔화 × " + api.ULT.bhCcRate + " 기대)");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "끌린 " + Math.round(pulled.slow) + "ms → 가중 " + Math.round(pulled.weight) + ", 기절 0");
  });

  run(STUN, "기절 중에는 이동·기본 공격·궁극기를 못 쓰는가", function (done) {
    var W = world("forest", [{ id: "kn", team: "red", char: "knight", x: 450, y: OPEN_Y.forest, gauge: api.GAUGE_MAX }]);
    var E = W.ent("kn");
    api.afflict(E, { stunMs: 1000 });
    var speed = api.speedOf(E), cdBefore = E.cdUntil;
    api.fireBasic(E, 0); api.useUlt(E, 0);
    var bad = [];
    if (speed !== 0) bad.push("이동속도 " + speed);
    if (E.cdUntil !== cdBefore) bad.push("기본 공격이 나감");
    if (E.gauge !== api.GAUGE_MAX) bad.push("궁극기가 나감");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "이동 0, 공격·궁극기 모두 막힘");
  });

  run(STUN, "기절이 겹치면 더 긴 기절이 유지되는가 (1.2초 뒤에 0.8초)", function (done) {
    var W = world("forest", [{ id: "kn", team: "red", char: "knight", x: 450, y: OPEN_Y.forest }]);
    var E = W.ent("kn"), t = W.t();
    api.afflict(E, { stunMs: 1200 }); api.afflict(E, { stunMs: 800 });
    done(E.stunUntil === t + 1200 ? "pass" : "fail", "기절 끝나는 시각: +" + (E.stunUntil - t) + "ms");
  });

  run(STUN, "자객 돌진 중에 기절하면 마무리 공격이 취소되고 벽에 끼지 않는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "hm", team: "blue", char: "hitman", x: 250, y: y },
      { id: "foe", team: "red", char: "knight", x: 600, y: y }
    ]);
    api.fireBasic(W.ent("hm"), 0);
    W.step(100);
    api.afflict(W.ent("hm"), { stunMs: 1000 });
    W.step(700);
    var finish = W.pushesFrom("hm", "meleeHits").filter(function (p) { return p.v.arc; }).length, E = W.ent("hm"), why = blockedAt(E.x, E.y);
    done(finish || why || E.dash ? "fail" : "pass", finish ? "기절했는데 마무리 공격이 나감" : why ? why : E.dash ? "돌진 상태가 안 풀림" : "돌진은 끝까지 미끄러진 뒤 마무리 공격 취소");
  });

  run(STUN, "결투가 돌진 중에 기절하면 찌르기가 취소되는가", function (done) {
    var y = OPEN_Y.forest, c = api.CHARS.duelist;
    var W = world("forest", [
      { id: "du", team: "blue", char: "duelist", x: 200, y: y },
      { id: "foe", team: "red", char: "knight", x: 200 + c.dashRange + 60, y: y }
    ]);
    api.fireBasic(W.ent("du"), 0);
    W.step(200);
    api.afflict(W.ent("du"), { stunMs: 1000 });
    W.step(900);
    var foe = W.ent("foe"), E = W.ent("du"), why = blockedAt(E.x, E.y);
    done(foe.hp < foe.maxHp || why || E.dash ? "fail" : "pass", foe.hp < foe.maxHp ? "기절했는데 찌르기가 나감" : why ? why : E.dash ? "돌진 상태가 안 풀림" : "돌진은 끝까지 미끄러진 뒤 찌르기 취소");
  });

  run(STUN, "대장장이 내려찍기: 도약 중에 기절해도 끝까지 진행되는가 (시전 동작 없음 → 기절 무시)", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "bs", team: "blue", char: "blacksmith", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 500, y: y }
    ]);
    api.useUlt(W.ent("bs"), 0, 250);
    W.step(200);
    api.afflict(W.ent("bs"), { stunMs: 1000 });
    W.step(800);
    var foe = W.ent("foe"), landed = foe.hp < foe.maxHp;
    done(landed ? "pass" : "fail", landed ? "기절해도 착지 피해·기절이 들어감" : "기절하면 착지 공격이 취소됨");
  });
  run(MOVE, "대장장이 내려찍기: 최소 거리는 " + api.ULT.bsLeapMinMs / 1000 + "초, 최대 거리는 " + api.ULT.bsLeapMaxMs / 1000 + "초 뒤에 착지하는가", function (done) {
    var y = OPEN_Y.forest, landedAfter = [];
    [api.ULT.bsMin, api.ULT.bsCast].forEach(function (reach) {
      var W = world("forest", [{ id: "bs", team: "blue", char: "blacksmith", x: 250, y: y, gauge: api.GAUGE_MAX }]);
      var bs = W.ent("bs"), t0 = W.t(), landAt = null;
      api.useUlt(bs, 0, reach);
      W.step(api.ULT.bsLeapMaxMs + 300, FRAME, function (t) { if (landAt == null && !bs.leap) landAt = t; });
      landedAfter.push(landAt == null ? null : landAt - t0);
    });
    var ok = landedAfter.every(function (ms, i) { var want = i ? api.ULT.bsLeapMaxMs : api.ULT.bsLeapMinMs; return ms != null && Math.abs(ms - want) <= FRAME * 2; });
    done(ok ? "pass" : "fail", "최소 거리 " + landedAfter[0] + "ms, 최대 거리 " + landedAfter[1] + "ms 뒤 착지");
  });

  run(STUN, "대장장이 기본 공격: 멈춰 서서 " + api.CHARS.blacksmith.windup + "ms 뒤 타격해 " + api.CHARS.blacksmith.fx.stunMs + "ms 기절시키고, 그 전에 기절하면 취소되는가", function (done) {
    var y = OPEN_Y.forest, c = api.CHARS.blacksmith, bad = [];
    function duel() {
      return world("forest", [
        { id: "bs", team: "blue", char: "blacksmith", x: 250, y: y },
        { id: "foe", team: "red", char: "guardian", x: 250 + c.range - 10, y: y + c.width / 2 - 10 }
      ]);
    }
    var W = duel(), bs = W.ent("bs"), foe = W.ent("foe");
    api.fireBasic(bs, 0);
    if (api.speedOf(bs) !== 0) bad.push("준비 중에 움직일 수 있음");
    W.step(c.windup - 50);
    if (foe.hp < foe.maxHp) bad.push("준비 시간 전에 피해가 들어감");
    W.step(100);
    if (foe.maxHp - foe.hp !== c.dmg) bad.push("타격 피해 " + (foe.maxHp - foe.hp) + " (기대 " + c.dmg + ")");
    if (!api.stunned(foe, W.t())) bad.push("맞은 적이 기절하지 않음");
    W.step(c.fx.stunMs);
    if (api.stunned(foe, W.t())) bad.push("기절이 " + c.fx.stunMs + "ms 넘게 이어짐");
    if (api.speedOf(bs) === 0) bad.push("타격 뒤에도 멈춰 있음");
    W = duel(); bs = W.ent("bs"); foe = W.ent("foe");
    api.fireBasic(bs, 0);
    W.step(100);
    api.afflict(bs, { stunMs: 500 });
    W.step(400);
    if (foe.hp < foe.maxHp) bad.push("기절했는데 타격이 나감");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "준비 중 정지, 범위 끝(" + (c.range - 10) + ", 옆 " + (c.width / 2 - 10) + ")의 적에게 " + c.windup + "ms 뒤 " + c.dmg + " 피해·기절, 준비 중 기절 시 취소");
  });
  run(MOVE, "투척병 물약: 가까이 던질수록 빨리 떨어지는가 (최소 사거리 " + api.ULT.plFlightMin + "ms ~ 최대 사거리 " + api.ULT.plFlight + "ms)", function (done) {
    var c = api.CHARS.thrower, near = api.potionFlightMs(c.minRange), mid = api.potionFlightMs((c.minRange + c.range) / 2), far = api.potionFlightMs(c.range);
    var ok = near === api.ULT.plFlightMin && far === api.ULT.plFlight && mid > near && mid < far;
    done(ok ? "pass" : "fail", "거리 " + c.minRange + " → " + near + "ms, 중간 → " + mid + "ms, 거리 " + c.range + " → " + far + "ms");
  });

  run(STUN, "주술사 메테오: 가운데 " + api.ULT.mbDmg + "·" + api.ULT.mbStunMs / 1000 + "초 ~ 끝 " + api.ULT.mbDmgMin + "·" + api.ULT.mbStunMin / 1000 + "초로 " + api.ULT.mbSteps + "단계로 줄고, 시전 뒤 기절해도 " + api.ULT.mbDelay / 1000 + "초 뒤 떨어지는가", function (done) {
    var y = OPEN_Y.forest, U = api.ULT, reach = U.mbR + api.BODY_R, bad = [], tiers = [];
    for (var i = 0; i < U.mbSteps; i++) { var h = api.meteorHitAt(reach * (i + 0.5) / U.mbSteps, U.mbR); tiers.push(h.dmg + "/" + h.stunMs / 1000); }
    var want = [];
    for (var j = 0; j < U.mbSteps; j++) want.push((U.mbDmg - (U.mbDmg - U.mbDmgMin) * j / (U.mbSteps - 1)) + "/" + (U.mbStunMs - (U.mbStunMs - U.mbStunMin) * j / (U.mbSteps - 1)) / 1000);
    if (tiers.join() !== want.join()) bad.push("단계 " + tiers.join(" · ") + " (기대 " + want.join(" · ") + ")");
    var W = world("forest", [
      { id: "mg", team: "blue", char: "mage", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "guardian", x: 450, y: y }
    ]);
    var foe = W.ent("foe");
    api.useUlt(W.ent("mg"), 0, 200);
    W.step(100);
    api.afflict(W.ent("mg"), { stunMs: 2000 });
    W.step(U.mbDelay - 200);
    if (foe.hp < foe.maxHp) bad.push(U.mbDelay + "ms 전에 떨어짐");
    W.step(200);
    if (foe.maxHp - foe.hp !== U.mbDmg) bad.push("가운데 피해 " + (foe.maxHp - foe.hp) + " (시전자 기절 뒤 취소됐거나 단계 오류)");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "단계 " + tiers.join(" · ") + ", 시전자가 기절해도 " + U.mbDelay + "ms 뒤 가운데 " + U.mbDmg + " 피해");
  });

  run(STUN, "기사 방어태세: 기절해 있어도 끝날 때 주변 기절이 발동하는가 (시전 동작 없음)", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "kn", team: "blue", char: "knight", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "warrior", x: 320, y: y }
    ]);
    api.useUlt(W.ent("kn"), 0);
    W.step(api.ULT.tkDur - 300);
    api.afflict(W.ent("kn"), { stunMs: 1000 });
    var foeStunned = false;
    W.step(600, FRAME, function (t) { if (api.stunned(W.ent("foe"), t)) foeStunned = true; });
    done(foeStunned ? "pass" : "fail", foeStunned ? "기사가 기절한 상태에서도 마무리 기절이 발동함" : "기사가 기절해 있으면 마무리 기절이 취소됨");
  });

  run(STUN, "궁수 난사: 기절하는 순간 남은 화살이 멈추는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "rg", team: "blue", char: "ranger", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 450, y: y }
    ]);
    var stunAt = 120, firedBefore = Math.floor(stunAt / api.ULT.mkGap) + 1;
    api.useUlt(W.ent("rg"), 0);
    W.step(stunAt);
    api.afflict(W.ent("rg"), { stunMs: 1000 });
    W.step(1000);
    var hits = Math.round((W.ent("foe").maxHp - W.ent("foe").hp) / api.ULT.mkDmg);
    done(hits <= firedBefore ? "pass" : "fail", "기절 전에 쏜 " + firedBefore + "발 중 " + hits + "발 적중" + (hits > firedBefore ? " — 기절 뒤에도 " + (hits - firedBefore) + "발 더 나감" : ", 기절 뒤로는 안 나감"));
  });

  run(GAUGE, "광전사 광폭화 중에는 공격해도 게이지가 오르지 않는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "wr", team: "blue", char: "warrior", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 330, y: y }
    ]);
    var wr = W.ent("wr");
    api.useUlt(wr, 0);
    api.fireBasic(wr, 0);
    W.step(300);
    if (W.ent("foe").hp === W.ent("foe").maxHp) { done("fail", "시험 준비 실패: 공격이 맞지 않음"); return; }
    done(wr.gauge === 0 ? "pass" : "fail", "광폭화 중 적중 후 게이지 " + wr.gauge);
  });

  run(GAUGE, "궁수 난사 10발을 모두 맞히면 게이지가 가득 돌아오는가 (의도된 규칙)", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "rg", team: "blue", char: "ranger", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 450, y: y }
    ]);
    W.ent("foe").maxHp = W.ent("foe").hp = 1000;
    api.useUlt(W.ent("rg"), 0);
    W.step(api.ULT.mkCount * api.ULT.mkGap + 500);
    var g = W.ent("rg").gauge, hits = Math.round((W.ent("foe").maxHp - W.ent("foe").hp) / api.ULT.mkDmg);
    done(g === api.GAUGE_MAX && hits === api.ULT.mkCount ? "pass" : "fail", hits + "발 적중 → 게이지 " + g + "/" + api.GAUGE_MAX);
  });

  run(GAUGE, "투척병 독병: 1틱 적중마다 게이지 +1인가 (적 3명, 3틱)", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "th", team: "blue", char: "thrower", x: 250, y: y },
      { id: "a", team: "red", char: "knight", x: 450, y: y },
      { id: "b", team: "red", char: "knight", x: 450, y: y - 35 },
      { id: "c", team: "red", char: "knight", x: 450, y: y + 35 }
    ]);
    api.fireBasic(W.ent("th"), 0, 200);
    W.step(4000);
    var g = W.ent("th").gauge, ticks = Math.round((W.ent("a").maxHp - W.ent("a").hp) / api.CHARS.thrower.dmg);
    done(g === ticks ? "pass" : "fail", ticks + "틱 적중 → 게이지 +" + g + " (여러 명이 같은 틱에 맞아도 +1)");
  });

  run(GAUGE, "게이지가 0~" + api.GAUGE_MAX + " 범위를 벗어나지 않는가 (피격 200번)", function (done) {
    var W = world("forest", [
      { id: "kn", team: "red", char: "knight", x: 450, y: OPEN_Y.forest },
      { id: "wr", team: "blue", char: "warrior", x: 250, y: OPEN_Y.forest }
    ]);
    var kn = W.ent("kn"), wr = W.ent("wr"), bad = 0;
    kn.hp = kn.maxHp = 1e9;
    for (var i = 0; i < 200; i++) {
      api.damage(kn, 1, "wr", 1000 + i, null, null);
      if (kn.gauge < 0 || kn.gauge > api.GAUGE_MAX || wr.gauge < 0 || wr.gauge > api.GAUGE_MAX) bad++;
    }
    done(bad ? "fail" : "pass", "맞은 쪽 게이지 " + kn.gauge + ", 때린 쪽 게이지 " + wr.gauge + (bad ? ", 범위 이탈 " + bad + "번" : ""));
  });

  run(MISC, "기절 중에 죽으면 기절이 풀리고, 부활하면 이동기·넉백 상태가 모두 초기화되는가", function (done) {
    var W = world("forest", [
      { id: "kn", team: "red", char: "knight", x: 450, y: OPEN_Y.forest },
      { id: "mg", team: "blue", char: "mage", x: 250, y: OPEN_Y.forest }
    ]);
    var E = W.ent("kn"), bad = [];
    api.afflict(E, { stunMs: 1000, slowMs: 1000, slowMul: 0.6 });
    E.shove = { ux: 1, uy: 0, dist: 150, at: W.t(), done: 0 };
    api.damage(E, 9999, "mg", false, null, null);
    if (E.alive) bad.push("죽지 않음");
    if (E.stunUntil) bad.push("죽은 뒤에도 기절 남음");
    E.leap = { sx: 0, sy: 0, tx: 0, ty: 0, at: W.t() };
    W.step(api.RESPAWN_MS + 100);
    if (!E.alive) bad.push("부활하지 않음");
    if (E.shove || E.leap || E.dash) bad.push("부활 후 이동 상태 남음");
    if (E.hp !== E.maxHp) bad.push("부활 체력 " + E.hp);
    if (!(E.protectUntil > W.t())) bad.push("부활 보호 없음");
    W.step(api.RESPAWN_PROTECT_MS);
    if (E.protectUntil > W.t()) bad.push("부활 보호가 " + api.RESPAWN_PROTECT_MS + "ms 넘게 이어짐");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "기절·둔화 해제, 부활 시 체력·상태 초기화, 보호 " + api.RESPAWN_PROTECT_MS / 1000 + "초");
  });

  var PASSIVE = "궁수·저격수·네크로 패시브";
  run(PASSIVE, "궁수: 기본 공격 적중마다 이동속도 +" + api.CHARS.ranger.haste.add + ", 최대 +" + api.CHARS.ranger.haste.max + ", " + api.CHARS.ranger.haste.ms + "ms 뒤 사라지는가", function (done) {
    var y = OPEN_Y.forest, h = api.CHARS.ranger.haste, base = api.CHARS.ranger.speed;
    var W = world("forest", [
      { id: "rg", team: "blue", char: "ranger", x: 250, y: y },
      { id: "foe", team: "red", char: "knight", x: 450, y: y }
    ]);
    var rg = W.ent("rg"), foe = W.ent("foe"), got = [];
    function volley() { rg.cdUntil = 0; api.fireBasic(rg, angleTo(rg, foe)); W.step(450); got.push(api.speedOf(rg) - base); }
    volley();
    if (foe.hp === foe.maxHp) { done("fail", "시험 준비 실패: 화살이 맞지 않음"); return; }
    volley(); volley();
    W.step(h.ms - 1000);
    volley();
    W.step(h.ms - 1000);
    got.push(api.speedOf(rg) - base);
    W.step(1200);
    got.push(api.speedOf(rg) - base);
    var ok = got[0] === 2 * h.add && got[1] === Math.min(h.max, 4 * h.add) && got[2] === h.max && got[3] === h.max && got[4] === h.max && got[5] === 0;
    done(ok ? "pass" : "fail", "이동속도 증가 " + got.map(function (v) { return "+" + v; }).join(" → ") + " (기대: +" + 2 * h.add + " → +" + h.max + " ×4 → +0, 적중마다 지속시간 초기화)");
  });
  run(PASSIVE, "저격수: " + api.CHARS.sniper.farDist + "보다 먼 적에게만 피해 +" + Math.round(api.CHARS.sniper.farBonus * 100) + "%인가", function (done) {
    var y = OPEN_Y.forest, c = api.CHARS.sniper;
    function shotAt(dist) {
      var W = world("forest", [
        { id: "sn", team: "blue", char: "sniper", x: 100, y: y },
        { id: "foe", team: "red", char: "guardian", x: 100 + dist, y: y }
      ]);
      var sn = W.ent("sn"), foe = W.ent("foe");
      api.fireBasic(sn, 0);
      W.step(700);
      return foe.maxHp - foe.hp;
    }
    var near = shotAt(300), far = shotAt(600);
    if (!near || !far) { done("fail", "시험 준비 실패: 화살이 맞지 않음 (가까이 " + near + ", 멀리 " + far + ")"); return; }
    var ok = near === c.dmg && far === Math.round(c.dmg * (1 + c.farBonus));
    done(ok ? "pass" : "fail", "거리 300 → " + near + ", 거리 600 → " + far + " (기대: " + c.dmg + " / " + Math.round(c.dmg * (1 + c.farBonus)) + ")");
  });
  run(PASSIVE, "네크로: 체력이 " + api.CHARS.necro.lastStandHp + " 아래로 떨어질 피해는 " + api.CHARS.necro.lastStandHp + "에서 멈추고 은신, 한 목숨에 한 번, 부활하면 다시 되는가", function (done) {
    var y = OPEN_Y.forest, c = api.CHARS.necro, bad = [];
    var W = world("forest", [
      { id: "nc", team: "blue", char: "necro", x: 250, y: y },
      { id: "foe", team: "red", char: "knight", x: 700, y: y }
    ]);
    var nc = W.ent("nc"), foe = W.ent("foe");
    api.damage(nc, 90, "foe", true, null, null);
    if (nc.hp !== c.lastStandHp) bad.push("120에서 90 피해 → 체력 " + nc.hp);
    if (!api.hiddenFrom(nc, W.t()) || api.visibleTo(nc, foe, W.t())) bad.push("발동 후 은신 안 됨");
    W.step(c.lastStandHideMs + 100);
    if (api.hiddenFrom(nc, W.t())) bad.push(c.lastStandHideMs + "ms 뒤에도 은신 유지");
    api.damage(nc, 80, "foe", true, null, null);
    if (nc.alive) bad.push("두 번째에도 발동해 살아남음");
    W.step(api.RESPAWN_MS + 3100);
    nc.hp = 70;
    api.damage(nc, 80, "foe", true, null, null);
    if (!nc.alive || nc.hp !== c.lastStandHp) bad.push("부활 뒤 70에서 80 피해 → " + (nc.alive ? "체력 " + nc.hp : "죽음"));
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "120-90 → 50·은신, 두 번째 치명타에 죽음, 부활 뒤 70-80 → 50");
  });
  run(PASSIVE, "네크로 해골: 공격할 대상이 없으면 네크로에게 다가오는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [{ id: "nc", team: "blue", char: "necro", x: 250, y: y, gauge: api.GAUGE_MAX }]);
    var nc = W.ent("nc");
    api.useUlt(nc, 0);
    W.step(api.ULT.smRiseMs + 100);
    if (!nc.minions || !nc.minions.length) { done("fail", "시험 준비 실패: 해골이 소환되지 않음"); return; }
    nc.x = 600;
    function far() { return Math.max.apply(null, nc.minions.map(function (m) { return hyp(m.x - nc.x, m.y - nc.y); })); }
    var before = far();
    W.step(2500);
    var after = far();
    done(after < before - 100 && after < api.ULT.smFollow + 40 ? "pass" : "fail", "가장 먼 해골과의 거리 " + Math.round(before) + " → " + Math.round(after));
  });

  run(PASSIVE, "네크로 해골: 해골의 공격은 적의 게이지를 채우지 않고 네크로 게이지만 공격마다 " + api.ULT.smGauge + " 채우며, 해골에게 입힌 피해는 피해량에 안 들어가며 기본 공격 게이지는 오르는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "nc", team: "blue", char: "necro", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "wr", team: "red", char: "warrior", x: 330, y: y, angle: Math.PI }
    ]);
    var nc = W.ent("nc"), wr = W.ent("wr"), bad = [];
    api.useUlt(nc, 0);
    nc.x = 150;
    W.step(api.ULT.smRiseMs + 100);
    if (!nc.minions || !nc.minions.length) { done("fail", "시험 준비 실패: 해골이 소환되지 않음"); return; }
    function skeletonSwings() { return W.log.filter(function (p) { return p.path === "meleeHits" && p.v.m && p.v.owner === "nc"; }).length; }
    var ncGauge = nc.gauge, wrHp = wr.hp, swingsBefore = skeletonSwings();
    wr.gauge = 0; wr.cdUntil = Infinity;
    W.step(1500);
    if (wr.hp >= wrHp) bad.push("해골이 광전사를 못 때림");
    if (wr.gauge !== 0) bad.push("해골에게 맞은 광전사 게이지 " + wr.gauge);
    var swings = skeletonSwings() - swingsBefore;
    var wantGauge = Math.min(api.GAUGE_MAX, ncGauge + swings * api.ULT.smGauge);
    if (!swings || nc.gauge !== wantGauge) bad.push("해골 공격 " + swings + "번에 네크로 게이지 " + ncGauge + " → " + nc.gauge + " (기대 " + wantGauge + ")");
    var M = nc.minions.filter(function (m) { return m.alive; })[0];
    if (!M) { done("fail", "시험 준비 실패: 살아 있는 해골 없음"); return; }
    var mHp = M.hp;
    wr.hp = wr.maxHp; wr.gauge = 0; wr.dmg = 0;
    api.damage(M, 5, "wr", W.t(), null, null);
    W.step(50);
    if (M.hp !== mHp - 5) bad.push("해골 체력 " + mHp + " → " + M.hp);
    if (wr.dmg !== 0) bad.push("해골에게 준 피해가 피해량에 " + wr.dmg + " 들어감");
    if (wr.gauge !== api.roleGauge("warrior")) bad.push("해골을 친 광전사 게이지 " + wr.gauge + " (기대 " + api.roleGauge("warrior") + ")");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "해골 공격: 광전사 게이지 그대로·네크로 공격마다 +" + api.ULT.smGauge + " / 해골 타격: 피해량 0, 게이지 +" + api.roleGauge("warrior"));
  });

  var FROST = "얼음술사·은신";
  function frostDuel() {
    var y = OPEN_Y.forest;
    return world("forest", [
      { id: "fr", team: "blue", char: "frost", x: 250, y: y, angle: 0 },
      { id: "foe", team: "red", char: "knight", x: 450, y: y }
    ]);
  }
  function frostShot(W) { var fr = W.ent("fr"); fr.cdUntil = 0; api.fireBasic(fr, angleTo(fr, W.ent("foe"))); W.step(450); }
  run(FROST, "냉기 화살: 1타·2타는 점점 강한 둔화, 3타째에 " + api.ULT.frFreezeMs + "ms 빙결 후 스택이 처음부터 다시 쌓이는가", function (done) {
    var W = frostDuel(), foe = W.ent("foe"), base = api.CHARS.knight.speed, got = [];
    var hpBefore = [];
    for (var i = 0; i < 3; i++) { hpBefore.push(foe.hp); frostShot(W); got.push(api.stunned(foe, W.t()) ? "빙결" : Math.round(api.speedOf(foe) / base * 100) + "%"); }
    var freezeLeft = foe.stunUntil - W.t();
    var armor = api.CHARS.knight.armor, hit1 = hpBefore[0] - hpBefore[1], hit3 = hpBefore[2] - foe.hp;
    var wantFreezeHit = hit1 + Math.max(0, Math.round(foe.maxHp * api.ULT.frFreezeMaxHpRate) - armor);
    W.step(api.ULT.frFreezeMs);
    frostShot(W);
    got.push("다시 " + foe.frostStacks + "스택");
    var want1 = Math.round(api.ULT.frSlowMul * 100) + "%", want2 = Math.round((api.ULT.frSlowMul - api.ULT.frSlowStep) * 100) + "%";
    var ok = got[0] === want1 && got[1] === want2 && got[2] === "빙결" && freezeLeft <= api.ULT.frFreezeMs && foe.frostStacks === 1 && hit3 === wantFreezeHit;
    done(ok ? "pass" : "fail", "이동속도 " + got.join(" → ") + " (기대: " + want1 + " → " + want2 + " → 빙결 → 다시 1스택), 3타 피해 " + hit3 + " (기대 " + wantFreezeHit + ")");
  });
  run(FROST, "냉기 화살: 마지막 적중 후 " + api.ULT.frSlowMs + "ms가 지나면 스택이 초기화되는가", function (done) {
    var W = frostDuel(), foe = W.ent("foe");
    frostShot(W); frostShot(W);
    W.step(api.ULT.frSlowMs + 200);
    frostShot(W);
    done(foe.frostStacks === 1 && !api.stunned(foe, W.t()) ? "pass" : "fail", "2스택 뒤 쉬었다 맞힘 → " + foe.frostStacks + "스택" + (api.stunned(foe, W.t()) ? ", 빙결됨" : ""));
  });
  run(FROST, "눈보라: 시전자를 따라다니고, 범위 안 적은 1초에 " + api.ULT.frBzDmg + " 피해, 아군은 먼 적에게 숨겨지는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "fr", team: "blue", char: "frost", x: 300, y: y, gauge: api.GAUGE_MAX },
      { id: "al", team: "blue", char: "knight", x: 420, y: y },
      { id: "foe", team: "red", char: "guardian", x: 300, y: y + 250 },
      { id: "far", team: "red", char: "ranger", x: 300, y: y + 700 }
    ]);
    var fr = W.ent("fr"), al = W.ent("al"), foe = W.ent("foe"), far = W.ent("far"), bad = [];
    api.useUlt(fr, 0);
    W.step(api.ULT.frBzDelay + 50);
    if (!api.hiddenFrom(al, W.t()) || api.visibleTo(al, far, W.t())) bad.push("범위 안 아군이 먼 적에게 보임");
    var hp0 = foe.hp;
    W.step(3000);
    var lost = hp0 - foe.hp;
    var freezeHit = Math.round(foe.maxHp * api.ULT.frFreezeMaxHpRate);
    if (lost < api.ULT.frBzDmg * 3 || lost > api.ULT.frBzDmg * 4 + freezeHit) bad.push("3초간 피해 " + lost);
    fr.x += 150;
    W.frame(FRAME);
    var c = api.stormCenter(api.storms()[0]);
    if (Math.abs(c.x - fr.x) > 1) bad.push("눈보라가 시전자를 따라가지 않음");
    W.step(api.ULT.frBzDur);
    var hp1 = foe.hp; W.step(2000);
    if (foe.hp !== hp1) bad.push("끝난 뒤에도 피해");
    if (api.hiddenFrom(al, W.t())) bad.push("끝난 뒤에도 숨겨짐");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "3초간 " + lost + " 피해, 따라다님, 끝나면 은신·피해 모두 멈춤");
  });
  run(FROST, "눈보라: 1초마다 냉기 화살 1중첩, 3중첩이면 빙결, 빙결이 끝난 뒤 다음 틱부터 다시 1중첩이 쌓이는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "fr", team: "blue", char: "frost", x: 300, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "guardian", x: 300, y: y + 250 }
    ]);
    var fr = W.ent("fr"), foe = W.ent("foe"), bad = [], seen = [];
    api.useUlt(fr, 0);
    W.step(api.ULT.frBzDelay + 50);
    seen.push(foe.frostStacks);
    W.step(api.ULT.frBzTick);
    seen.push(foe.frostStacks);
    W.step(api.ULT.frBzTick);
    var frozen = api.stunned(foe, W.t());
    seen.push(frozen ? "빙결" : foe.frostStacks);
    W.step(api.ULT.frFreezeMs + 50);
    seen.push(api.stunned(foe, W.t()) ? "빙결 지속" : foe.frostStacks);
    W.step(api.ULT.frBzTick - api.ULT.frFreezeMs);
    seen.push(foe.frostStacks);
    var want = [1, 2, "빙결", 0, 1];
    if (seen.join() !== want.join()) bad.push("중첩 " + seen.join(" → ") + " (기대 " + want.join(" → ") + ")");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "중첩 " + seen.join(" → "));
  });
  run(FROST, "눈보라: 시전자가 지속 중 죽으면 눈보라가 바로 사라지고 피해·아군 은신도 멈추는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "fr", team: "blue", char: "frost", x: 300, y: y, gauge: api.GAUGE_MAX },
      { id: "al", team: "blue", char: "knight", x: 420, y: y },
      { id: "foe", team: "red", char: "knight", x: 300, y: y + 200 },
      { id: "far", team: "red", char: "ranger", x: 300, y: y + 700 }
    ]);
    var fr = W.ent("fr"), al = W.ent("al"), foe = W.ent("foe"), bad = [];
    api.useUlt(fr, 0);
    W.step(api.ULT.frBzDelay + 100);
    api.damage(fr, 9999, "foe", false, null, null);
    W.frame(FRAME);
    if (api.storms().length) bad.push("죽은 뒤에도 눈보라가 남음");
    if (api.hiddenFrom(al, W.t())) bad.push("아군이 계속 숨겨짐");
    var hp0 = foe.hp; W.step(2000);
    if (foe.hp !== hp0) bad.push("죽은 뒤에도 피해 " + (hp0 - foe.hp));
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "죽는 순간 눈보라·피해·아군 은신 모두 사라짐");
  });
  run(FROST, "눈보라 안에서 공격하면 0.5초간 드러났다가 다시 숨고, 장판 도트 피해로는 다시 드러나지 않는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "fr", team: "blue", char: "frost", x: 300, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "ranger", x: 300, y: y + 300 }
    ]);
    var fr = W.ent("fr"), foe = W.ent("foe"), seen = [];
    foe.hp = foe.maxHp = 1e6;
    api.useUlt(fr, 0);
    W.step(api.ULT.frBzDelay + 50);
    seen.push(api.visibleTo(fr, foe, W.t()));
    fr.cdUntil = 0; api.fireBasic(fr, angleTo(fr, foe));
    seen.push(api.visibleTo(fr, foe, W.t()));
    W.step(600);
    seen.push(api.visibleTo(fr, foe, W.t()));
    var revealedByTick = false;
    W.step(2500, FRAME, function (t) { if (api.visibleTo(fr, foe, t)) revealedByTick = true; });
    var ok = !seen[0] && seen[1] && !seen[2] && !revealedByTick;
    done(ok ? "pass" : "fail", "공격 전 " + (seen[0] ? "보임" : "숨음") + " → 공격 순간 " + (seen[1] ? "보임" : "숨음") + " → 0.6초 뒤 " + (seen[2] ? "보임" : "숨음") + (revealedByTick ? ", 도트 피해로 다시 드러남" : ", 도트 피해 중 계속 숨음"));
  });
  run(FROST, "부쉬 안 저격수가 쏘면 0.5초간 거리와 상관없이 보였다가 다시 숨는가", function (done) {
    world("forest", []);
    var tiles = [].concat.apply([], api.bushTiles()), spot = null;
    tiles.forEach(function (b) { if (!spot && !blockedAt(b.x, b.y)) spot = b; });
    if (!spot) { done("fail", "시험 준비 실패: 부쉬를 찾지 못함"); return; }
    var W = world("forest", [
      { id: "sn", team: "blue", char: "sniper", x: spot.x, y: spot.y },
      { id: "foe", team: "red", char: "knight", x: 450, y: OPEN_Y.forest + 400 }
    ]);
    var sn = W.ent("sn"), foe = W.ent("foe"), seen = [];
    seen.push(api.visibleTo(sn, foe, W.t()));
    api.fireBasic(sn, angleTo(sn, foe));
    seen.push(api.visibleTo(sn, foe, W.t()));
    W.step(600);
    seen.push(api.visibleTo(sn, foe, W.t()));
    done(!seen[0] && seen[1] && !seen[2] ? "pass" : "fail", "쏘기 전 " + (seen[0] ? "보임" : "숨음") + " → 쏜 순간 " + (seen[1] ? "보임" : "숨음") + " → 0.6초 뒤 " + (seen[2] ? "보임" : "숨음"));
  });

  var DANCER = "검무희";
  function dancerDuel(foes) {
    return world("forest", [{ id: "dn", team: "blue", char: "dancer", x: 250, y: OPEN_Y.forest, angle: 0 }].concat(foes));
  }
  run(DANCER, "단검 투척: 적에게 맞으면 직격 " + api.CHARS.dancer.dmg + " + 회전 " + api.ULT.bdDmg + " 피해가 한 번씩만 들어가고 게이지는 한 번만 오르는가", function (done) {
    var W = dancerDuel([{ id: "foe", team: "red", char: "guardian", x: 450, y: OPEN_Y.forest }]);
    var dn = W.ent("dn"), foe = W.ent("foe");
    api.fireBasic(dn, 0);
    W.step(800);
    var lost = foe.maxHp - foe.hp, want = api.CHARS.dancer.dmg + api.ULT.bdDmg, gain = api.roleGauge("dancer");
    done(lost === want && dn.gauge === gain ? "pass" : "fail", "피해 " + lost + " (기대 " + want + "), 게이지 +" + dn.gauge + " (기대 +" + gain + ")");
  });
  run(DANCER, "단검 투척: 아무도 못 맞히면 사거리 끝에서 회전해 반경 " + api.ULT.bdR + " 안의 적만 맞히는가", function (done) {
    var y = OPEN_Y.forest, endX = 250 + 20 + api.CHARS.dancer.range;
    var W = dancerDuel([
      { id: "near", team: "red", char: "guardian", x: endX, y: y + 50 },
      { id: "far", team: "red", char: "ranger", x: endX, y: y + 120 }
    ]);
    api.fireBasic(W.ent("dn"), 0);
    W.step(800);
    var near = W.ent("near"), far = W.ent("far"), nearLost = near.maxHp - near.hp, farLost = far.maxHp - far.hp;
    if (!nearLost && !farLost) { done("fail", "회전 피해가 없음 (사거리 끝이 벽에 막혔을 수 있음)"); return; }
    done(nearLost === api.ULT.bdDmg && !farLost ? "pass" : "fail", "끝점 50 옆 적 " + nearLost + " 피해, 120 옆 적 " + farLost + " 피해");
  });
  run(DANCER, "단검 투척: 회전 피해는 적중 " + api.ULT.bdDelay / 1000 + "초 뒤에 들어가는가", function (done) {
    var W = dancerDuel([{ id: "foe", team: "red", char: "guardian", x: 450, y: OPEN_Y.forest }]);
    var dn = W.ent("dn"), foe = W.ent("foe"), hitAt = null, lostAtHit = 0, lostBefore = 0;
    api.fireBasic(dn, 0);
    W.step(800, FRAME, function (t) {
      var lost = foe.maxHp - foe.hp;
      if (hitAt === null && lost > 0) { hitAt = t; lostAtHit = lost; }
      if (hitAt !== null && t < hitAt + api.ULT.bdDelay - FRAME) lostBefore = lost;
    });
    var lost = foe.maxHp - foe.hp, dmg = api.CHARS.dancer.dmg;
    done(lostAtHit === dmg && lostBefore === dmg && lost === dmg + api.ULT.bdDmg ? "pass" : "fail", "적중 순간 " + lostAtHit + ", " + api.ULT.bdDelay / 1000 + "초 전 " + lostBefore + ", 끝 " + lost + " 피해");
  });
  function dancerStormBroken(breaker) {
    var y = OPEN_Y.forest;
    var W = dancerDuel([
      { id: "foe", team: "red", char: "knight", x: 350, y: y },
      { id: "gd", team: "red", char: "guardian", x: 400, y: y, gauge: api.GAUGE_MAX }
    ]);
    var dn = W.ent("dn"), foe = W.ent("foe");
    foe.hp = foe.maxHp = 1e6;
    dn.gauge = api.GAUGE_MAX;
    api.useUlt(dn, 0);
    W.step(500);
    if (breaker === "stun") api.afflict(dn, { stunMs: 1000 });
    else api.useUlt(W.ent("gd"), Math.PI);
    W.step(100);
    var lostAtBreak = foe.maxHp - foe.hp;
    W.step(1500);
    return { storming: dn.buffUntil > W.t(), extra: foe.maxHp - foe.hp - lostAtBreak, gaugeLocked: dn.skillUntil > W.t() };
  }
  [["stun", "기절"], ["knock", "창벽 넉백"]].forEach(function (c) {
    run(DANCER, "칼날 폭풍: " + c[1] + "을 맞으면 그 순간 끊기는가", function (done) {
      var r = dancerStormBroken(c[0]);
      done(!r.storming && !r.extra && !r.gaugeLocked ? "pass" : "fail", (r.storming ? "폭풍 계속됨" : "폭풍 끊김") + ", 끊긴 뒤 피해 " + r.extra + (r.gaugeLocked ? ", 게이지 잠김 남음" : ""));
    });
  });
  run(DANCER, "칼날 폭풍: " + api.ULT.bwDur / 1000 + "초간 이동속도 " + api.CHARS.dancer.ultSpeed + ", 반경 " + api.ULT.bwR + " 안 적에게 " + api.ULT.bwTick / 1000 + "초마다 " + api.ULT.bwDmg + " 피해, 따라다니고 끝나면 멈추는가", function (done) {
    var y = OPEN_Y.forest;
    var W = dancerDuel([
      { id: "foe", team: "red", char: "guardian", x: 350, y: y },
      { id: "out", team: "red", char: "guardian", x: 250, y: y + 260 }
    ]);
    var dn = W.ent("dn"), foe = W.ent("foe"), out = W.ent("out"), bad = [];
    foe.hp = foe.maxHp = 1e6;
    dn.gauge = api.GAUGE_MAX;
    api.useUlt(dn, 0);
    if (api.speedOf(dn) !== api.CHARS.dancer.ultSpeed) bad.push("폭풍 중 이동속도 " + api.speedOf(dn));
    W.step(1000);
    dn.x += 80; foe.x += 80;
    W.step(api.ULT.bwDur - 1000 + 50);
    var lost = foe.maxHp - foe.hp, ticks = api.ULT.bwDur / api.ULT.bwTick;
    if (lost !== ticks * api.ULT.bwDmg) bad.push("피해 " + lost + " (기대 " + ticks * api.ULT.bwDmg + ")");
    if (out.hp !== out.maxHp) bad.push("범위 밖 적이 " + (out.maxHp - out.hp) + " 피해");
    var after = foe.hp; W.step(1000);
    if (foe.hp !== after) bad.push("끝난 뒤에도 피해");
    if (api.speedOf(dn) !== api.CHARS.dancer.speed) bad.push("끝난 뒤 이동속도 " + api.speedOf(dn));
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : ticks + "틱 " + lost + " 피해, 이동해도 따라다님, 끝나면 속도·피해 원래대로");
  });
  run(DANCER, "검무희 패시브: 적을 처치하면 게이지 " + api.ULT.bwKillGauge + " 회복 (기본 공격 적중 게이지와 따로 쌓임)", function (done) {
    var W = dancerDuel([{ id: "foe", team: "red", char: "ranger", x: 450, y: OPEN_Y.forest }]);
    var dn = W.ent("dn"), foe = W.ent("foe");
    foe.hp = 10;
    api.fireBasic(dn, 0);
    W.step(800);
    var want = api.ULT.bwKillGauge + api.roleGauge("dancer");
    done(!foe.alive && dn.gauge === want ? "pass" : "fail", (foe.alive ? "처치 실패, " : "처치 후 ") + "게이지 " + dn.gauge + " (기대 " + want + ")");
  });
  run(DANCER, "검무희 패시브: 칼날 폭풍 중 처치는 폭풍이 끝난 뒤 처치당 게이지 " + api.ULT.bwKillGauge + " 회복", function (done) {
    var y = OPEN_Y.forest;
    var W = dancerDuel([
      { id: "a", team: "red", char: "ranger", x: 320, y: y },
      { id: "b", team: "red", char: "ranger", x: 250, y: y + 70 }
    ]);
    var dn = W.ent("dn"), a = W.ent("a"), b = W.ent("b");
    a.hp = b.hp = 10;
    dn.gauge = api.GAUGE_MAX;
    api.useUlt(dn, 0);
    W.step(600);
    var during = dn.gauge, killed = (a.alive ? 0 : 1) + (b.alive ? 0 : 1);
    W.step(api.ULT.bwDur);
    var want = killed * api.ULT.bwKillGauge;
    done(killed === 2 && during === 0 && dn.gauge === want ? "pass" : "fail", killed + "명 처치, 폭풍 중 게이지 " + during + " → 끝난 뒤 " + dn.gauge + " (기대 " + want + ")");
  });

  function autoMelee(mapId, seconds, seed) {
    var rnd = seededRandom(seed), realRandom = Math.random;
    Math.random = rnd;
    try {
      var chars = api.CHAR_LIST.slice(), list = [];
      function pickFree(team) {
        var used = list.filter(function (e) { return e.team === team; }).map(function (e) { return e.char; });
        var free = chars.filter(function (c) { return used.indexOf(c) < 0; });
        return free[Math.floor(rnd() * free.length)];
      }
      ["blue", "red"].forEach(function (team) {
        for (var s = 1; s <= 3; s++) list.push({ id: team + s, team: team, char: pickFree(team), slot: s });
      });
      var W = world(mapId, list);
      list.forEach(function (e) {
        var E = W.ent(e.id), sp = api.spawnOf(e.team, e.slot);
        E.x = sp.x; E.y = sp.y; E.angle = sp.angle;
      });
      var issues = {}, prev = {}, maxStun = Math.max(api.ULT.lnStunMs, api.ULT.mbStunMs, api.ULT.tkStunMs, api.ULT.bsStunMs, api.ULT.exStunMs);
      function flag(kind, E, t, extra) {
        var k = kind + " · " + api.CHARS[E.char].name;
        if (!issues[k]) issues[k] = { n: 0, first: "" };
        if (!issues[k].n) issues[k].first = Math.round((t - T0) / 100) / 10 + "초, (" + Math.round(E.x) + ", " + Math.round(E.y) + ")" + (extra ? " " + extra : "");
        issues[k].n++;
      }
      function holeActive(t) {
        return W.log.some(function (p) { return p.path === "effects" && p.v.type === "hole" && t >= p.v.createdAt + p.v.delay && t <= p.v.createdAt + p.v.delay + p.v.dur + 50; });
      }
      var logSeen = 0, end = T0 + seconds * 1000;
      while (W.t() < end) {
        var ms = rnd() < 0.02 ? 150 : 33;
        var logStart = W.log.length;
        W.frame(ms, true);
        var t = W.t(), teleported = {};
        for (var i = logStart; i < W.log.length; i++) { var p = W.log[i]; if (p.v.tp) teleported[p.path.split("/")[1]] = 1; }
        list.forEach(function (e) {
          var E = W.ent(e.id), P0 = prev[e.id];
          prev[e.id] = { x: E.x, y: E.y, alive: E.alive, leap: !!E.leap, dash: !!E.dash, stunned: api.stunned(E, t - ms), stunUntil: E.stunUntil };
          if (!isFinite(E.x) || !isFinite(E.y) || !isFinite(E.hp) || !isFinite(E.gauge)) { flag("숫자 아님(NaN)", E, t); return; }
          if (E.hp < 0 || E.hp > E.maxHp) flag("체력 범위 이탈", E, t, "hp " + E.hp);
          if (E.gauge < 0 || E.gauge > api.GAUGE_MAX) flag("게이지 범위 이탈", E, t, "gauge " + E.gauge);
          if (!E.alive) return;
          if (E.stunUntil - t > maxStun + 20) flag("기절이 너무 김", E, t, Math.round(E.stunUntil - t) + "ms");
          if (!E.leap) { var why = blockedAt(E.x, E.y); if (why) flag(why, E, t); }
          if (E.dash && t - E.dash.at > (E.dash.ms || api.CHARS[E.char].dashMs) + (api.CHARS[E.char].finishDelay || 0) + 200) flag("돌진이 안 끝남", E, t);
          if (E.leap && t - E.leap.at > api.ULT.bsLeapMaxMs + 200) flag("도약이 안 끝남", E, t);
          if (E.shove && t - E.shove.at > api.ULT.gdKbMs + 200) flag("넉백이 안 끝남", E, t);
          if (!P0 || !P0.alive) return;
          var jump = hyp(E.x - P0.x, E.y - P0.y);
          if (!E.leap && !P0.leap && !teleported[e.id] && jump > 0.5 && segmentCrossesWall(P0.x, P0.y, E.x, E.y)) flag("벽 통과", E, t, Math.round(jump) + "만큼 이동");
          if (P0.stunned && P0.stunUntil >= t && api.stunned(E, t) && jump > 0.5 && !E.shove && !E.dash && !P0.dash && !E.leap && !P0.leap && !teleported[e.id] && !holeActive(t)) flag("기절 중 이동", E, t, Math.round(jump) + "만큼");
        });
      }
      var ults = W.log.filter(function (p) { return (p.path === "meleeHits" && p.v.u) || (p.path === "effects" && p.v.u !== 0 && p.v.type !== "pool" && p.v.type !== "grace") || (p.path === "shots" && p.v.s); }).length;
      var kills = W.log.filter(function (p) { return p.path === "kills"; }).length;
      return { list: list, issues: issues, kills: kills, ults: ults };
    } finally { Math.random = realRandom; }
  }
  var PASSIVE2 = "주술사·투척병·기사·창술사·광전사 패시브";
  run(PASSIVE2, "주술사: 적중한 적이 " + api.CHARS.mage.burn.ms / 1000 + "초간 불타며 1초당 최대 체력의 " + api.CHARS.mage.burn.maxHpRate * 100 + "%의 피해를 입고, 그동안 회복이 절반인가", function (done) {
    var y = OPEN_Y.forest, burn = api.CHARS.mage.burn;
    var W = world("forest", [
      { id: "mg", team: "blue", char: "mage", x: 250, y: y },
      { id: "foe", team: "red", char: "warrior", x: 450, y: y }
    ]);
    var foe = W.ent("foe"), bad = [];
    api.damage(foe, api.CHARS.mage.dmg, "mg", 1, null);
    if (!api.healCut(foe, W.t())) bad.push("불타는 중 회복 감소 없음");
    if (api.healAmount(foe, 10, W.t()) !== 5) bad.push("회복 10 → " + api.healAmount(foe, 10, W.t()));
    W.step(burn.ms + 500);
    var want = api.CHARS.mage.dmg + Math.round(foe.maxHp * burn.maxHpRate) * burn.ms / 1000, lost = foe.maxHp - foe.hp;
    if (lost !== want) bad.push("받은 피해 " + lost + " (기대 " + want + ")");
    if (api.healCut(foe, W.t())) bad.push("화상이 끝나도 회복 감소 남음");
    var mageDmg = W.log.filter(function (p) { return p.path === "hits/mg"; }).reduce(function (a, p) { return a + (p.v.d || 0); }, 0);
    if (mageDmg !== want) bad.push("주술사 피해 기록 " + mageDmg);
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "기본 공격 " + api.CHARS.mage.dmg + " + 화상 " + (want - api.CHARS.mage.dmg) + " = " + want + ", 화상 중에만 회복 절반");
  });

  run(PASSIVE2, "투척병: 독병·독안개 위의 적만 회복이 절반이고, 화상과 겹쳐도 절반 1회만 적용되는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "th", team: "blue", char: "thrower", x: 250, y: y },
      { id: "mg", team: "blue", char: "mage", x: 250, y: y - 200 },
      { id: "foe", team: "red", char: "knight", x: 450, y: y },
      { id: "al", team: "blue", char: "knight", x: 450, y: y + 20 }
    ]);
    var foe = W.ent("foe"), al = W.ent("al"), bad = [];
    foe.hp = al.hp = 100;
    api.fireBasic(W.ent("th"), 0, 200);
    W.step(900);
    if (!api.healCut(foe, W.t())) bad.push("독병 위의 적 회복 감소 없음");
    if (api.healCut(al, W.t())) bad.push("아군까지 회복 감소");
    api.damage(foe, api.CHARS.mage.dmg, "mg", 2, null);
    if (api.healAmount(foe, 20, W.t()) !== 10) bad.push("독병+화상 회복 20 → " + api.healAmount(foe, 20, W.t()));
    W.step(Math.max(api.ULT.plDur, api.CHARS.mage.burn.ms) + 500);
    if (api.healCut(foe, W.t())) bad.push("독병이 사라져도 회복 감소 남음");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "독병 위 적만 절반, 화상과 겹쳐도 절반");
  });

  run(PASSIVE2, "기사: 모든 피해가 1회마다 " + api.CHARS.knight.armor + " 줄고(방어태세는 배율 먼저), 줄어든 만큼 막은 피해에 쌓이는가", function (done) {
    var y = OPEN_Y.forest, armor = api.CHARS.knight.armor;
    var W = world("forest", [
      { id: "rg", team: "blue", char: "ranger", x: 250, y: y - 200 },
      { id: "th", team: "blue", char: "thrower", x: 250, y: y },
      { id: "kn", team: "red", char: "knight", x: 450, y: y - 200 },
      { id: "k2", team: "red", char: "knight", x: 450, y: y }
    ]);
    var kn = W.ent("kn"), k2 = W.ent("k2"), bad = [];
    api.damage(kn, 15, "rg", 1, null); api.damage(kn, 15, "rg", 2, null);
    if (kn.maxHp - kn.hp !== 2 * (15 - armor)) bad.push("화살 15×2 → " + (kn.maxHp - kn.hp));
    if (kn.blocked !== 2 * armor) bad.push("막은 피해 " + kn.blocked);
    var hp0 = kn.hp, blocked0 = kn.blocked;
    kn.buffUntil = W.t() + 1000;
    api.damage(kn, 30, "rg", 3, null);
    var guarded = Math.round(30 * api.ULT.tkDef) - armor;
    if (hp0 - kn.hp !== guarded) bad.push("방어태세 중 30 → " + (hp0 - kn.hp) + " (기대 " + guarded + ")");
    if (kn.blocked - blocked0 !== 30 - guarded) bad.push("방어태세 막은 피해 " + (kn.blocked - blocked0));
    kn.buffUntil = 0;
    api.fireBasic(W.ent("th"), 0, 200);
    W.step(4000);
    var tick = api.CHARS.thrower.dmg - armor;
    if (k2.maxHp - k2.hp !== tick * api.CHARS.thrower.ticks) bad.push("독병 → " + (k2.maxHp - k2.hp) + " (기대 " + tick * api.CHARS.thrower.ticks + ")");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "화살 " + (15 - armor) + "×2, 독병 " + tick + "×" + api.CHARS.thrower.ticks + ", 방어태세 중 30 → " + (Math.round(30 * api.ULT.tkDef) - armor) + ", 막은 피해 기록");
  });

  run(PASSIVE2, "창술사: 게임 시작·부활할 때 보호막이 생겨 다음 피해 1회만 막고, 함께 온 기절은 그대로 받는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "gd", team: "blue", char: "guardian", x: 250, y: y },
      { id: "ln", team: "red", char: "lancer", x: 450, y: y }
    ]);
    var ln = W.ent("ln"), bad = [];
    if (!ln.shield) bad.push("게임 시작 때 보호막 없음");
    api.damage(ln, 1, "gd", false, null);
    if (ln.shield || ln.hp !== ln.maxHp) bad.push("시작 보호막이 피해를 못 막음");
    api.damage(ln, 9999, "gd", false, null);
    W.step(api.RESPAWN_MS + 100);
    if (!ln.alive || !ln.shield) bad.push("부활 후 보호막 없음");
    W.step(api.RESPAWN_PROTECT_MS);
    api.afflict(ln, { slowMs: 500, slowMul: 0.7 });
    if (!ln.shield) bad.push("피해 없는 둔화에 보호막이 사라짐");
    api.damage(ln, 30, "gd", false, null, { stunMs: 800 });
    if (ln.hp !== ln.maxHp) bad.push("보호막이 피해를 못 막음 (" + (ln.maxHp - ln.hp) + ")");
    if (!api.stunned(ln, W.t())) bad.push("함께 온 기절이 안 걸림");
    if (ln.shield) bad.push("보호막이 남아 있음");
    api.damage(ln, 30, "gd", false, null);
    if (ln.maxHp - ln.hp !== 30) bad.push("두 번째 피해 " + (ln.maxHp - ln.hp));
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "시작·부활 시 보호막, 피해 30 막고 기절은 적용, 다음 피해는 그대로");
  });

  run(PASSIVE2, "광전사: 체력 " + api.CHARS.warrior.rally.hpRate * 100 + "% 미만이 되면 " + api.CHARS.warrior.rally.ms / 1000 + "초간 1초당 " + api.CHARS.warrior.rally.perSec + " 회복하고, 죽기 전까지 다시 발동하지 않는가", function (done) {
    var y = OPEN_Y.forest, R = api.CHARS.warrior.rally;
    var W = world("forest", [
      { id: "kn", team: "blue", char: "knight", x: 250, y: y },
      { id: "wr", team: "red", char: "warrior", x: 450, y: y }
    ]);
    var wr = W.ent("wr"), bad = [], full = R.perSec * R.ms / 1000;
    api.damage(wr, wr.maxHp - (wr.maxHp * R.hpRate - 5), "kn", false, null);
    var h0 = wr.hp, heal0 = wr.heal || 0;
    W.step(R.ms + 500);
    if (wr.hp - h0 !== full) bad.push("회복 " + (wr.hp - h0) + " (기대 " + full + ")");
    if ((wr.heal || 0) - heal0 !== full) bad.push("회복 통계 " + ((wr.heal || 0) - heal0));
    api.damage(wr, 80, "kn", false, null);
    var h1 = wr.hp;
    W.step(R.ms + 500);
    if (wr.hp !== h1) bad.push("같은 목숨에서 다시 발동");
    api.damage(wr, 9999, "kn", false, null);
    W.step(api.RESPAWN_MS + api.RESPAWN_PROTECT_MS + 200);
    api.damage(wr, wr.maxHp - (wr.maxHp * R.hpRate - 5), "kn", false, null);
    var h2 = wr.hp;
    W.step(1500);
    if (wr.hp <= h2) bad.push("부활 뒤 재충전 안 됨");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : R.ms / 1000 + "초간 " + full + " 회복, 한 목숨에 한 번, 부활 시 재충전");
  });

  run(MISC, "연속 킬: 마지막 킬부터 3초 안이면 더블→트리플→쿼드라→펜타, 한 번에 2킬도 이어서 셈", function (done) {
    var W3 = api.MULTI_KILL_MS, chains = {}, got = [];
    [0, W3 - 100, 2 * W3 - 200, 2 * W3 - 200, 3 * W3 - 300].forEach(function (t) { got.push(api.multiKillCount(chains, { k: "a", t: T0 + t })); });
    got.push(api.multiKillCount(chains, { k: "a", t: T0 + 4 * W3 }));
    got.push(api.multiKillCount(chains, { k: "b", t: T0 + 4 * W3 }));
    var want = [1, 2, 3, 4, 5, 1, 1];
    done(got.join() === want.join() ? "pass" : "fail", "나온 순서 " + got.join(",") + " / 기대 " + want.join(","));
  });

  var STORM = "뇌전사수", SB = api.CHARS.stormbow, CH = SB.chain;
  function zapsOf(W, id) { return W.log.filter(function (p) { return p.path === "effects" && p.v.type === "zap" && p.v.owner === id; }); }
  function lostHp(W, id) { var E = W.ent(id); return E.maxHp - E.hp; }
  function inBush(W, ids) { return ids.filter(function (id) { return api.hiddenFrom(W.ent(id), W.t()); }); }
  function shootTimes(W, sb, n, ang) { for (var i = 0; i < n; i++) { api.fireBasic(sb, ang || 0); W.step(SB.cd + 100); } }
  run(STORM, "뇌전사수 기본 공격: 관통하지 않고 첫 적에서 멈추며, 게이지는 기본 적중만큼 오르는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "sb", team: "blue", char: "stormbow", x: 150, y: y },
      { id: "f1", team: "red", char: "ranger", x: 350, y: y },
      { id: "f2", team: "red", char: "sniper", x: 450, y: y }
    ]);
    shootTimes(W, W.ent("sb"), 1);
    var a = lostHp(W, "f1"), b = lostHp(W, "f2"), gauge = W.ent("sb").gauge, want = api.roleGauge("stormbow");
    var ok = a === SB.dmg && b === 0 && gauge === want;
    done(ok ? "pass" : "fail", "첫 적 " + a + " (기대 " + SB.dmg + "), 뒤의 적 " + b + " (기대 0), 게이지 " + gauge + " (기대 " + want + ")");
  });
  run(STORM, "뇌전사수 패시브: " + CH.every + "번째 적중마다 맞은 적과 그 주변 반경 " + CH.r + "의 가까운 적 " + CH.count + "명에게만 " + CH.dmg + "의 번개 피해가 들어가는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "sb", team: "blue", char: "stormbow", x: 150, y: y },
      { id: "tg", team: "red", char: "knight", x: 450, y: y },
      { id: "n1", team: "red", char: "ranger", x: 450, y: y + 110 },
      { id: "n2", team: "red", char: "mage", x: 450, y: y - 160 },
      { id: "n3", team: "red", char: "frost", x: 450, y: y + 220 },
      { id: "out", team: "red", char: "sniper", x: 450 + CH.r + 60, y: y + 60 }
    ]);
    var sb = W.ent("sb"), bad = [], hidden = inBush(W, ["tg", "n1", "n2", "n3", "out"]);
    if (hidden.length) { done("fail", "시험 준비 실패: 부쉬 안 " + hidden.join()); return; }
    shootTimes(W, sb, CH.every - 1);
    if (zapsOf(W, "sb").length) bad.push(CH.every - 1 + "번 적중에 번개가 나감");
    if (lostHp(W, "n1") || lostHp(W, "n2")) bad.push(CH.every + "번 전에 주변 적이 맞음");
    shootTimes(W, sb, 1);
    var zaps = zapsOf(W, "sb");
    if (zaps.length !== 1) bad.push("번개 효과 " + zaps.length + "번 (기대 1)");
    else if (zaps[0].v.pts.length !== CH.count + 1) bad.push("번개 선 꼭짓점 " + zaps[0].v.pts.length + " (기대 " + (CH.count + 1) + ")");
    else if (zaps[0].v.tgt.join() !== "tg,n1,n2") bad.push("번개 대상 " + zaps[0].v.tgt.join() + " (기대 tg,n1,n2 — 맞은 적 다음 가까운 순)");
    if (lostHp(W, "n1") !== CH.dmg || lostHp(W, "n2") !== CH.dmg) bad.push("가까운 두 적 " + lostHp(W, "n1") + "·" + lostHp(W, "n2") + " (기대 " + CH.dmg + "씩)");
    if (lostHp(W, "n3")) bad.push("세 번째로 가까운 적도 맞음 " + lostHp(W, "n3"));
    if (lostHp(W, "out")) bad.push("반경 밖 적이 맞음 " + lostHp(W, "out"));
    var armor = api.CHARS.knight.armor, tgLost = lostHp(W, "tg"), tgWant = CH.every * Math.max(0, SB.dmg - armor) + CH.dmg - armor;
    if (tgLost !== tgWant) bad.push("맞은 적 본인 " + tgLost + " (기대 " + tgWant + ", 기본 " + CH.every + "발 + 번개 1번, 기사 패시브 적용)");
    if (sb.zapHits) bad.push("발동 뒤 적중 수가 0 으로 돌아가지 않음: " + sb.zapHits);
    var dealt = sb.dmg, dealtWant = tgWant + CH.dmg * CH.count;
    if (lostHp(W, "n1") && zaps.length === 1 && zaps[0].v.tgt.indexOf("n3") >= 0) bad.push("세 번째 적이 대상에 들어감");
    if (dealt !== dealtWant) bad.push("딜 기록 " + dealt + " (기대 " + dealtWant + ")");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : CH.every + "번째 적중에 맞은 적과 가까운 두 적 " + CH.dmg + "씩, 세 번째·반경 밖은 제외, 딜 " + dealt);
  });
  run(STORM, "뇌전사수 패시브: 번개는 해골 병사에게도 튕기지만 해골로는 게이지가 오르지 않고, 적 캐릭터로는 오르는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "sb", team: "blue", char: "stormbow", x: 150, y: y },
      { id: "tg", team: "red", char: "knight", x: 450, y: y },
      { id: "n1", team: "red", char: "ranger", x: 450, y: y - 180 },
      { id: "nc", team: "red", char: "necro", x: 750, y: y + 600, gauge: api.GAUGE_MAX }
    ]);
    var sb = W.ent("sb"), nc = W.ent("nc");
    shootTimes(W, sb, CH.every - 1);
    api.useUlt(nc, Math.PI / 2);
    W.step(api.ULT.smRiseMs + 100);
    var minion = (nc.minions || [])[0];
    if (!minion) { done("fail", "시험 준비 실패: 해골이 없음"); return; }
    nc.minions.forEach(function (m, i) { m.x = i ? 800 : 480; m.y = i ? y + 700 : y + 120; });
    var m0 = minion.hp;
    sb.gauge = 0;
    api.fireBasic(sb, 0);
    W.step(500);
    var gauge = sb.gauge, want = api.roleGauge("stormbow") * 3, bad = [];
    if (minion.hp !== Math.max(0, m0 - CH.dmg)) bad.push("해골 체력 " + m0 + " → " + minion.hp + " (기대 " + CH.dmg + " 감소)");
    if (lostHp(W, "n1") !== CH.dmg) bad.push("적 캐릭터 번개 피해 " + lostHp(W, "n1"));
    if (gauge !== want) bad.push("게이지 " + gauge + " (기대 " + want + ": 기본 적중 + 맞은 적·적 캐릭터 번개, 해골 0)");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "해골·적 캐릭터 모두 " + CH.dmg + " 피해, 게이지 " + gauge + "(해골 몫 0)");
  });
  run(STORM, "뇌전사수 패시브: 은신 중인 적·부활 보호 중인 적·아군에게는 튕기지 않는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "sb", team: "blue", char: "stormbow", x: 150, y: y },
      { id: "ally", team: "blue", char: "knight", x: 460, y: y + 60 },
      { id: "tg", team: "red", char: "knight", x: 450, y: y },
      { id: "hid", team: "red", char: "rogue", x: 450, y: y + 90 },
      { id: "safe", team: "red", char: "ranger", x: 450, y: y + 110 },
      { id: "seen", team: "red", char: "mage", x: 450, y: y - 160 }
    ]);
    var sb = W.ent("sb"), hid = W.ent("hid"), safe = W.ent("safe"), bad = [], hidden = inBush(W, ["tg", "hid", "safe", "seen"]);
    if (hidden.length) { done("fail", "시험 준비 실패: 부쉬 안 " + hidden.join()); return; }
    shootTimes(W, sb, CH.every - 1);
    hid.stealthUntil = W.t() + 3000;
    safe.protectUntil = W.t() + 3000;
    if (!api.hiddenFrom(hid, W.t())) { done("fail", "시험 준비 실패: 은신 상태가 아님"); return; }
    shootTimes(W, sb, 1);
    var zaps = zapsOf(W, "sb");
    if (zaps.length !== 1 || zaps[0].v.tgt.join() !== "tg,seen") bad.push("번개 대상 " + (zaps[0] ? zaps[0].v.tgt.join() : "없음") + " (기대 tg,seen)");
    if (lostHp(W, "hid")) bad.push("은신한 적이 맞음 " + lostHp(W, "hid"));
    if (lostHp(W, "safe")) bad.push("부활 보호 중인 적이 맞음 " + lostHp(W, "safe"));
    if (lostHp(W, "ally")) bad.push("아군이 맞음 " + lostHp(W, "ally"));
    if (lostHp(W, "seen") !== CH.dmg) bad.push("보이는 적 " + lostHp(W, "seen") + " (기대 " + CH.dmg + ")");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "가까운 은신·보호·아군은 건너뛰고 더 먼 보이는 적에게만 " + CH.dmg);
  });
  run(STORM, "뇌전사수 스킬 과충전: " + api.ULT.ocDur / 1000 + "초간 매 적중마다 번개, 공격 간격 " + api.ULT.ocRate + "배 빠르게, 적중 수는 그대로 두는가", function (done) {
    var y = OPEN_Y.forest, U = api.ULT;
    var W = world("forest", [
      { id: "sb", team: "blue", char: "stormbow", x: 150, y: y, gauge: api.GAUGE_MAX },
      { id: "tg", team: "red", char: "knight", x: 450, y: y },
      { id: "n1", team: "red", char: "ranger", x: 450, y: y - 160 }
    ]);
    var sb = W.ent("sb"), bad = [], hidden = inBush(W, ["tg", "n1"]);
    if (hidden.length) { done("fail", "시험 준비 실패: 부쉬 안 " + hidden.join()); return; }
    W.ent("tg").hp = W.ent("tg").maxHp = 5000;
    W.ent("n1").hp = W.ent("n1").maxHp = 5000;
    shootTimes(W, sb, CH.every - 2);
    var before = sb.zapHits;
    api.useUlt(sb, 0);
    if (sb.gauge !== 0) bad.push("스킬 뒤 게이지 " + sb.gauge);
    var start = W.t();
    api.fireBasic(sb, 0);
    var cd = sb.cdDur, wantCd = SB.cd / U.ocRate;
    if (Math.abs(cd - wantCd) > 0.01) bad.push("과충전 공격 대기시간 " + cd + " (기대 " + wantCd + ")");
    W.step(wantCd);
    for (var i = 0; i < 2; i++) { api.fireBasic(sb, 0); W.step(wantCd); }
    W.step(300);
    var during = zapsOf(W, "sb").length;
    if (during !== 3) bad.push("과충전 중 3번 적중에 번개 " + during + "번 (기대 3)");
    if (sb.zapHits !== before) bad.push("과충전 중 적중 수가 바뀜 " + before + " → " + sb.zapHits);
    if (sb.gauge !== 0) bad.push("과충전 중 게이지가 오름 " + sb.gauge);
    if (lostHp(W, "n1") !== CH.dmg * 3) bad.push("주변 적 " + lostHp(W, "n1") + " (기대 " + CH.dmg * 3 + ")");
    W.step(start + U.ocDur + 100 - W.t());
    api.fireBasic(sb, 0);
    if (sb.cdDur !== SB.cd) bad.push("과충전이 끝난 뒤 대기시간 " + sb.cdDur + " (기대 " + SB.cd + ")");
    W.step(SB.cd + 100);
    var after = zapsOf(W, "sb").length;
    if (after !== 3 || sb.zapHits !== before + 1) bad.push("끝난 뒤 첫 적중: 번개 " + (after - 3) + "번·적중 수 " + sb.zapHits + " (기대 0번·" + (before + 1) + ")");
    shootTimes(W, sb, 1);
    if (zapsOf(W, "sb").length !== 4) bad.push("끝난 뒤 " + CH.every + "번째 적중에 번개가 안 나감");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "과충전 중 매 적중 번개·대기시간 " + wantCd + "ms, 스킬 전 적중 수 " + before + " 그대로 이어서 " + CH.every + "번째에 발동");
  });

  run(STORM, "뇌전사수 스킬 번개 막: 쓰는 순간 반경 " + api.ULT.ocR + " 안의 적만 " + api.ULT.ocDmg + "의 피해와 " + api.ULT.ocStunMs / 1000 + "초 기절", function (done) {
    var y = OPEN_Y.forest, U = api.ULT;
    var W = world("forest", [
      { id: "sb", team: "blue", char: "stormbow", x: 300, y: y, gauge: api.GAUGE_MAX },
      { id: "near", team: "red", char: "ranger", x: 300 + U.ocR - 20, y: y },
      { id: "far", team: "red", char: "mage", x: 300, y: y + U.ocR + api.BODY_R + 60 },
      { id: "ally", team: "blue", char: "sniper", x: 300, y: y - 120 }
    ]);
    var bad = [], near = W.ent("near"), t0 = W.t();
    api.useUlt(W.ent("sb"), 0);
    W.step(100);
    if (lostHp(W, "near") !== U.ocDmg) bad.push("범위 안 적 " + lostHp(W, "near") + " (기대 " + U.ocDmg + ")");
    if (!api.stunned(near, W.t()) || Math.abs(near.stunUntil - t0 - U.ocStunMs) > 40) bad.push("범위 안 적 기절 끝 " + Math.round(near.stunUntil - t0) + "ms (기대 " + U.ocStunMs + ")");
    if (lostHp(W, "far") || api.stunned(W.ent("far"), W.t())) bad.push("범위 밖 적이 맞음");
    if (lostHp(W, "ally") || api.stunned(W.ent("ally"), W.t())) bad.push("아군이 맞음");
    if (W.ent("sb").gauge !== 0) bad.push("번개 막으로 게이지가 오름 " + W.ent("sb").gauge);
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "범위 안 적 " + U.ocDmg + " 피해·" + U.ocStunMs + "ms 기절, 범위 밖·아군은 그대로");
  });
  var ASSIST = "어시스트", AMS = api.ASSIST_MS;
  run(ASSIST, "피해 어시스트: 쓰러지기 " + AMS / 1000 + "초 안에 피해를 준 사람만 어시스트, 처치한 사람은 처치만 오르는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "old", team: "blue", char: "guardian", x: 200, y: y },
      { id: "helper", team: "blue", char: "knight", x: 300, y: y },
      { id: "killer", team: "blue", char: "sniper", x: 400, y: y },
      { id: "foe", team: "red", char: "ranger", x: 650, y: y }
    ]);
    var foe = W.ent("foe"), bad = [];
    api.damage(foe, 10, "old", false, null);
    W.step(1500);
    api.damage(foe, 10, "helper", false, null);
    api.damage(foe, 10, "killer", false, null);
    W.step(AMS - 1000);
    api.damage(foe, 9999, "killer", false, null);
    W.step(100);
    var kill = W.log.filter(function (p) { return p.path === "kills"; })[0];
    if (!kill) bad.push("처치 기록 없음");
    else if (JSON.stringify(kill.v.a || []) !== JSON.stringify(["helper"])) bad.push("처치 기록의 어시스트 " + JSON.stringify(kill.v.a || []));
    if (W.ent("helper").assists !== 1) bad.push("도운 사람 어시스트 " + W.ent("helper").assists);
    if (W.ent("old").assists) bad.push(AMS / 1000 + "초 넘은 피해가 어시스트 " + W.ent("old").assists);
    if (W.ent("killer").kills !== 1 || W.ent("killer").assists) bad.push("처치한 사람 처치 " + W.ent("killer").kills + " · 어시스트 " + W.ent("killer").assists);
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "5.5초 전 피해는 제외, 4초 전 피해만 어시스트, 처치한 사람은 처치 1");
  });

  function priestHealsThenKill(waitMs) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "pr", team: "blue", char: "priest", x: 250, y: y },
      { id: "ally", team: "blue", char: "sniper", x: 450, y: y },
      { id: "foe", team: "red", char: "ranger", x: 450, y: y + 400 }
    ]);
    var pr = W.ent("pr"), ally = W.ent("ally"), foe = W.ent("foe");
    ally.hp = 50;
    api.damage(foe, 5, "pr", false, null);
    api.fireBasic(pr, 0);
    W.step(800);
    var healed = ally.hp > 50;
    W.step(waitMs);
    api.damage(foe, 9999, "ally", false, null);
    W.step(100);
    return { healed: healed, assists: pr.assists || 0, kills: ally.kills };
  }
  run(ASSIST, "회복 어시스트: 사제가 회복시킨 아군이 " + AMS / 1000 + "초 안에 처치하면 어시스트 1번(사제가 피해도 줬어도 1번만)", function (done) {
    var r = priestHealsThenKill(1000);
    if (!r.healed) { done("fail", "시험 준비 실패: 사제 기본 공격으로 아군이 회복되지 않음"); return; }
    done(r.assists === 1 && r.kills === 1 ? "pass" : "fail", "사제 어시스트 " + r.assists + " (기대 1), 아군 처치 " + r.kills);
  });
  run(ASSIST, "회복 어시스트: 회복 뒤 " + AMS / 1000 + "초가 지나 처치하면 어시스트가 없는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "pr", team: "blue", char: "priest", x: 250, y: y },
      { id: "ally", team: "blue", char: "sniper", x: 450, y: y },
      { id: "foe", team: "red", char: "ranger", x: 450, y: y + 400 }
    ]);
    var ally = W.ent("ally");
    ally.hp = 50;
    api.fireBasic(W.ent("pr"), 0);
    W.step(800);
    if (ally.hp <= 50) { done("fail", "시험 준비 실패: 회복되지 않음"); return; }
    W.step(AMS);
    api.damage(W.ent("foe"), 9999, "ally", false, null);
    W.step(100);
    var n = W.ent("pr").assists || 0;
    done(n === 0 ? "pass" : "fail", "사제 어시스트 " + n + " (기대 0)");
  });
  run(ASSIST, "이로운 효과 어시스트: 얼음술사 눈보라로 은신한 아군이 처치하면 얼음술사가 어시스트를 받는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "fr", team: "blue", char: "frost", x: 300, y: y, gauge: api.GAUGE_MAX },
      { id: "ally", team: "blue", char: "sniper", x: 400, y: y },
      { id: "foe", team: "red", char: "ranger", x: 450, y: y + 500 }
    ]);
    api.useUlt(W.ent("fr"), 0);
    W.step(api.ULT.frBzDelay + 300);
    if (!api.hiddenFrom(W.ent("ally"), W.t())) { done("fail", "시험 준비 실패: 아군이 눈보라 안에서 은신하지 않음"); return; }
    api.damage(W.ent("foe"), 9999, "ally", false, null);
    W.step(100);
    var n = W.ent("fr").assists || 0;
    done(n === 1 ? "pass" : "fail", "얼음술사 어시스트 " + n + " (기대 1)");
  });

  run(ASSIST, "해로운 효과 어시스트: 기절이나 둔화만 건 사람도 " + AMS / 1000 + "초 안에 적이 쓰러지면 어시스트를 받는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "stunner", team: "blue", char: "knight", x: 200, y: y },
      { id: "slower", team: "blue", char: "guardian", x: 300, y: y },
      { id: "late", team: "blue", char: "priest", x: 400, y: y },
      { id: "killer", team: "blue", char: "sniper", x: 500, y: y },
      { id: "foe", team: "red", char: "ranger", x: 650, y: y + 400 }
    ]);
    var foe = W.ent("foe");
    api.afflict(foe, { slowMs: 1000, slowMul: 0.7 }, "late");
    W.step(AMS + 500);
    api.afflict(foe, { stunMs: 500 }, "stunner");
    api.afflict(foe, { slowMs: 1000, slowMul: 0.7 }, "slower");
    W.step(1000);
    api.damage(foe, 9999, "killer", false, null);
    W.step(100);
    var got = ["stunner", "slower", "late"].map(function (id) { return W.ent(id).assists || 0; });
    done(got.join() === "1,1,0" ? "pass" : "fail", "기절 " + got[0] + " · 둔화 " + got[1] + " · " + AMS / 1000 + "초 넘은 둔화 " + got[2] + " (기대 1·1·0)");
  });

  var CLERIC = "클레릭";
  function clericTeam(extra) {
    var y = OPEN_Y.forest;
    return world("forest", [
      { id: "cl", team: "blue", char: "cleric", x: 300, y: y },
      { id: "kn", team: "blue", char: "knight", x: 450, y: y },
      { id: "rg", team: "blue", char: "ranger", x: 300, y: y + 120 },
      { id: "foe", team: "red", char: "guardian", x: 300, y: y + 330 },
      { id: "foe2", team: "red", char: "ranger", x: 600, y: y + 330 }
    ].concat(extra || []));
  }
  function clericSwing(W) { var cl = W.ent("cl"); cl.cdUntil = 0; api.fireBasic(cl, 0); W.frame(FRAME); }
  run(CLERIC, "기본 공격: 반경 " + api.CHARS.cleric.range + " 안에서 체력 비율이 가장 낮은 아군 1명만 " + api.CHARS.cleric.graceHeal + " 회복하고, 자신·먼 아군·부활 보호 중 아군은 고르지 않는가", function (done) {
    var W = clericTeam([{ id: "far", team: "blue", char: "ranger", x: 300, y: OPEN_Y.forest - 480 }]);
    var cl = W.ent("cl"), kn = W.ent("kn"), rg = W.ent("rg"), far = W.ent("far"), bad = [];
    cl.hp = 10; kn.hp = 200; rg.hp = 40; far.hp = 5;
    clericSwing(W);
    if (rg.hp !== 40 + api.CHARS.cleric.graceHeal) bad.push("궁수(가장 낮음) " + rg.hp);
    if (kn.hp !== 200 || cl.hp !== 10 || far.hp !== 5) bad.push("다른 대상도 회복됨(기사 " + kn.hp + "·자신 " + cl.hp + "·먼 아군 " + far.hp + ")");
    rg.hp = rg.maxHp;
    clericSwing(W);
    if (kn.hp !== 200 + api.CHARS.cleric.graceHeal) bad.push("체력이 가득 찬 궁수 대신 깎인 기사를 고르지 않음(기사 " + kn.hp + ")");
    kn.hp = 150; rg.hp = 60;
    clericSwing(W);
    if (kn.hp !== 150 + api.CHARS.cleric.graceHeal || rg.hp !== 60) bad.push("체력 수치(궁수 60)가 아니라 비율(기사 150/400)로 고르지 않음(기사 " + kn.hp + "·궁수 " + rg.hp + ")");
    kn.hp = 20; kn.protectUntil = W.t() + 2000; rg.hp = 30;
    clericSwing(W);
    if (kn.hp !== 20) bad.push("부활 보호 중 아군이 회복됨");
    if (rg.hp !== 30 + api.CHARS.cleric.graceHeal) bad.push("보호 중 아군을 빼고 다음 대상을 고르지 않음(궁수 " + rg.hp + ")");
    var enemyDmg = W.log.filter(function (p) { return p.path === "hits/cl" && p.v.d > 0; }).length;
    if (enemyDmg) bad.push("기본 공격이 적에게 피해를 줌");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "체력 비율이 가장 낮은 아군만 " + api.CHARS.cleric.graceHeal + " 회복, 자신·먼 아군·보호 중 아군 제외");
  });
  run(CLERIC, "게이지: 아군을 " + api.CHARS.cleric.healGauge + " 회복시켜야 가득 차고, 넘친 회복(체력이 가득 찬 부분)은 세지 않는가", function (done) {
    var W = clericTeam(), cl = W.ent("cl"), kn = W.ent("kn"), heal = api.CHARS.cleric.graceHeal, need = api.CHARS.cleric.healGauge, got = [];
    var n = Math.ceil(need / heal) - 1;
    kn.hp = 10; kn.maxHp = 1e6;
    for (var i = 0; i < n; i++) clericSwing(W);
    got.push(Math.round(cl.gauge * 100) / 100);
    clericSwing(W); got.push(Math.round(cl.gauge * 100) / 100);
    cl.gauge = 0; kn.maxHp = api.CHARS.knight.hp; kn.hp = kn.maxHp - 6; W.ent("rg").hp = W.ent("rg").maxHp;
    clericSwing(W); got.push(Math.round(cl.gauge * 100) / 100);
    var want0 = Math.round(n * heal * api.GAUGE_MAX / need * 100) / 100, want2 = Math.round(6 * api.GAUGE_MAX / need * 100) / 100;
    var ok = got[0] === want0 && got[1] === api.GAUGE_MAX && got[2] === want2;
    done(ok ? "pass" : "fail", n + "번 회복(" + n * heal + ") → " + got[0] + ", " + (n + 1) + "번째 → " + got[1] + ", 6만 회복 → " + got[2] + " (기대 " + want0 + "·" + api.GAUGE_MAX + "·" + want2 + ")");
  });
  run(CLERIC, "요한계시록: " + api.ULT.rvDur / 1000 + "초간 아군은 1초당 " + api.ULT.rvHeal + " 회복, 적은 1초당 " + api.ULT.rvDmg + " 피해를 사용 순간·1초·2초에 3번 받고 거리와 상관없으며, 클레릭은 사용 순간 체력이 모두 차는가", function (done) {
    var W = clericTeam(), cl = W.ent("cl"), kn = W.ent("kn"), foe = W.ent("foe"), foe2 = W.ent("foe2"), bad = [], times = [];
    kn.hp = 100; cl.hp = 50; foe.hp = foe.maxHp = 1000; foe2.x = 750; foe2.y = 1250; foe2.hp = foe2.maxHp = 1000;
    cl.gauge = api.GAUGE_MAX;
    var t0 = W.t(), last = foe.hp;
    function mark(t) { if (foe.hp < last) { times.push(Math.round((t - t0) / 100) / 10); last = foe.hp; } }
    api.useUlt(cl, 0);
    W.frame(1); mark(W.t());
    W.step(api.ULT.rvDur + 500, FRAME, mark);
    if (1000 - foe.hp !== api.ULT.rvDmg * 3) bad.push("가까운 적 피해 " + (1000 - foe.hp));
    if (1000 - foe2.hp !== api.ULT.rvDmg * 3) bad.push("먼 적 피해 " + (1000 - foe2.hp));
    if (kn.hp !== 100 + api.ULT.rvHeal * 3) bad.push("아군 회복 " + (kn.hp - 100));
    if (cl.hp !== cl.maxHp) bad.push("사용 시 자신의 체력이 모두 회복되지 않음(" + cl.hp + ")");
    if (times[0] !== 0) bad.push("사용 순간 피해 없음");
    if (cl.gauge !== 0) bad.push("스킬 중 회복으로 게이지가 참(" + cl.gauge + ")");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "적 " + api.ULT.rvDmg * 3 + " 피해·아군 " + api.ULT.rvHeal * 3 + " 회복(" + times.join("초·") + "초), 먼 적도 같음, 자신은 사용 순간 체력 모두 회복");
  });
  run(CLERIC, "요한계시록: 쓰러진 적·아군과 부활 보호 중인 적·아군에게는 피해·회복이 들어가지 않는가", function (done) {
    var W = clericTeam(), cl = W.ent("cl"), kn = W.ent("kn"), rg = W.ent("rg"), foe = W.ent("foe"), foe2 = W.ent("foe2"), bad = [];
    kn.hp = 100; rg.hp = 50; rg.maxHp = 1000; foe.hp = foe.maxHp = 1000;
    kn.protectUntil = W.t() + 5000; foe.protectUntil = W.t() + 5000;
    api.damage(foe2, 9999, "cl", false, null);
    cl.gauge = api.GAUGE_MAX;
    api.useUlt(cl, 0);
    W.step(api.ULT.rvDur + 200);
    var hitDead = W.log.filter(function (p) { return p.path === "hits/cl" && p.v.u === "revelation"; }).length;
    if (kn.hp !== 100) bad.push("보호 중 아군 회복 " + (kn.hp - 100));
    if (foe.hp !== 1000) bad.push("보호 중 적 피해 " + (1000 - foe.hp));
    if (hitDead) bad.push("쓰러진 적(또는 보호 중 적)에게 스킬 피해 " + hitDead + "번");
    if (rg.hp !== 50 + api.ULT.rvHeal * 3) bad.push("보통 아군 회복 " + (rg.hp - 50));
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "보호 중·쓰러진 대상은 그대로, 보통 아군은 " + api.ULT.rvHeal * 3 + " 회복");
  });

  run(CLERIC, "요한계시록: 사용 중에는 움직일 수 없고, 끝나면 다시 움직이는가", function (done) {
    var W = clericTeam(), cl = W.ent("cl"), bad = [];
    cl.gauge = api.GAUGE_MAX;
    api.useUlt(cl, 0);
    W.frame(FRAME);
    if (api.speedOf(cl) !== 0) bad.push("사용 중 이동속도 " + api.speedOf(cl));
    W.step(api.ULT.rvDur + 100);
    if (api.speedOf(cl) !== api.CHARS.cleric.speed) bad.push("끝난 뒤 이동속도 " + api.speedOf(cl));
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "사용 중 이동속도 0, 끝나면 " + api.CHARS.cleric.speed);
  });
  function clericCutBy(label, hurt) {
    run(CLERIC, "요한계시록: " + label + " 그 순간 취소되어 남은 피해·회복이 들어가지 않고 다시 움직이는가", function (done) {
      var W = clericTeam(), cl = W.ent("cl"), foe = W.ent("foe"), bad = [];
      foe.hp = foe.maxHp = 1000;
      cl.gauge = api.GAUGE_MAX;
      api.useUlt(cl, 0);
      W.step(300);
      var afterFirst = foe.hp;
      hurt(W, cl);
      W.step(api.ULT.rvDur);
      if (afterFirst !== 1000 - api.ULT.rvDmg) bad.push("첫 틱 피해 " + (1000 - afterFirst));
      if (foe.hp !== afterFirst) bad.push("취소 뒤에도 피해 " + (afterFirst - foe.hp));
      if (api.revs().length) bad.push("스킬 효과가 남음");
      if (cl.alive && api.speedOf(cl) === 0) bad.push("취소 뒤에도 못 움직임");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "첫 틱 " + api.ULT.rvDmg + " 뒤 취소, 이후 피해 없음");
    });
  }
  clericCutBy("기절하면", function (W, cl) { api.afflict(cl, { stunMs: 300 }, "foe"); });
  clericCutBy("밀려나면(수문장 창벽)", function (W, cl) {
    var gd = W.ent("foe2"); gd.char = "guardian"; gd.x = cl.x + 60; gd.y = cl.y;
    api.onMelee("kbtest", { team: "red", owner: "foe2", x: gd.x, y: gd.y, angle: Math.PI, radius: api.ULT.gdR, arc: Math.PI * 2, dmg: 0, u: 1, slam: 1, kb: api.ULT.gdKb, createdAt: W.t() });
    W.step(api.ULT.gdKbMs + 50);
  });
  clericCutBy("쓰러지면", function (W, cl) { api.damage(cl, 9999, "foe", false, null); });

  var SHAMAN = "주술사";
  function shamanTeam(extra) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "sh", team: "blue", char: "shaman", x: 300, y: y, gauge: api.GAUGE_MAX },
      { id: "al", team: "blue", char: "knight", x: 420, y: y + 20 },
      { id: "near", team: "red", char: "guardian", x: 420, y: y },
      { id: "far", team: "red", char: "guardian", x: 700, y: y }
    ].concat(extra || []));
    W.list = ["near", "far"].concat((extra || []).filter(function (e) { return e.team === "red"; }).map(function (e) { return e.id; }));
    W.list.forEach(function (id) { var E = W.ent(id); E.hp = E.maxHp = 1000; });
    return W;
  }
  run(SHAMAN, "기본 공격: 폭 " + api.CHARS.shaman.width + " 안의 적은 위치와 상관없이 " + api.CHARS.shaman.dmg + "의 피해, 사거리 " + api.CHARS.shaman.range + ", 아군 회복 없음", function (done) {
    var y = OPEN_Y.forest, W = shamanTeam([{ id: "edge", team: "red", char: "guardian", x: 460, y: y + api.CHARS.shaman.width / 2 - 5 }, { id: "wide", team: "red", char: "guardian", x: 460, y: y + api.CHARS.shaman.width / 2 + api.BODY_R + 30 }, { id: "beyond", team: "red", char: "guardian", x: 300 + api.CHARS.shaman.range + api.BODY_R + 30, y: y }]);
    var sh = W.ent("sh"), al = W.ent("al"), near = W.ent("near"), edge = W.ent("edge"), wide = W.ent("wide"), beyond = W.ent("beyond"), bad = [];
    al.hp = 100;
    sh.cdUntil = 0; api.fireBasic(sh, 0);
    W.step(900);
    if (1000 - near.hp !== api.CHARS.shaman.dmg) bad.push("가운데 적 피해 " + (1000 - near.hp));
    if (1000 - edge.hp !== api.CHARS.shaman.dmg) bad.push("가장자리 적 피해 " + (1000 - edge.hp));
    if (wide.hp !== 1000) bad.push("폭 밖 적이 맞음");
    if (beyond.hp !== 1000) bad.push("사거리 밖 적이 맞음");
    if (al.hp !== 100) bad.push("아군 체력이 " + (al.hp - 100) + " 바뀜");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "가운데·가장자리 모두 " + api.CHARS.shaman.dmg + " 피해, 폭·사거리 밖·아군은 그대로");
  });
  run(SHAMAN, "패시브: 적중마다 저주 1회, " + api.ULT.cuStacks + "회 중첩되면 " + api.ULT.cuBoomMs / 1000 + "초 뒤 폭발해 " + api.ULT.cuBoomDmg + " 피해 후 초기화", function (done) {
    var W = shamanTeam(), sh = W.ent("sh"), near = W.ent("near"), far = W.ent("far"), bad = [], stacks = [];
    for (var i = 0; i < api.ULT.cuStacks; i++) {
      sh.cdUntil = 0; api.fireBasic(sh, 0);
      W.step(i < api.ULT.cuStacks - 1 ? 900 : 400);
      stacks.push(near.curse || 0);
    }
    var perHit = api.CHARS.shaman.dmg, before = 1000 - near.hp;
    if (stacks.join() !== "1,2,3") bad.push("저주 쌓임 " + stacks.join());
    if (before !== perHit * api.ULT.cuStacks) bad.push("폭발 전 피해 " + before);
    W.step(api.ULT.cuBoomMs);
    if (1000 - near.hp !== perHit * api.ULT.cuStacks + api.ULT.cuBoomDmg) bad.push("폭발 뒤 피해 " + (1000 - near.hp));
    if (near.curse) bad.push("폭발 뒤 저주가 남음 " + near.curse);
    if (far.curse) bad.push("맞지 않은 적에게 저주 " + far.curse);
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "저주 1·2·3회 쌓임, 3회째 0.5초 뒤 " + api.ULT.cuBoomDmg + " 폭발 피해, 저주 초기화");
  });
  run(SHAMAN, "패시브: 저주가 " + api.ULT.cuExpireMs / 1000 + "초 갱신되지 않으면 사라지고, 그 안에 다시 맞으면 유지되는가", function (done) {
    var W = shamanTeam(), sh = W.ent("sh"), near = W.ent("near"), far = W.ent("far"), bad = [];
    far.x = 700;
    sh.cdUntil = 0; api.fireBasic(sh, 0);
    W.step(600);
    if (near.curse !== 1) bad.push("첫 저주 " + near.curse);
    W.step(api.ULT.cuExpireMs - 900);
    sh.cdUntil = 0; api.fireBasic(sh, 0);
    W.step(600);
    if (near.curse !== 2) bad.push("갱신하면 유지되어야 함 " + near.curse);
    W.step(api.ULT.cuExpireMs - 900);
    if (near.curse !== 2) bad.push("갱신 뒤 3초 안인데 사라짐 " + near.curse);
    W.step(1200);
    if (near.curse) bad.push("3초 넘게 갱신 안 됐는데 남음 " + near.curse);
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "3초 안에 다시 맞으면 유지, 갱신 없이 3초가 지나면 0으로 초기화");
  });
  run(SHAMAN, "영역전개: " + api.ULT.dmGrowMs / 1000 + "초간 반경 " + api.ULT.dmR + "까지 커지며 닿은 적은 " + api.ULT.dmStunMs / 1000 + "초 기절하고, 기절이 풀릴 때 " + api.ULT.dmBoltDmg + " 피해를 한 번 받는가", function (done) {
    var W = shamanTeam(), sh = W.ent("sh"), near = W.ent("near"), far = W.ent("far"), bad = [], at = { nearStun: null, farStun: null, nearBolt: null, nearCurse: 0, farCurse: 0 }, t0;
    far.x = 300 + 380;
    api.useUlt(sh, 0); t0 = W.t();
    W.step(api.ULT.dmDur + 300, FRAME, function (t) {
      if (at.nearStun === null && api.stunned(near, t)) at.nearStun = t - t0;
      if (at.farStun === null && api.stunned(far, t)) at.farStun = t - t0;
      if (at.nearBolt === null && near.hp < 1000) at.nearBolt = t - t0;
      at.nearCurse = Math.max(at.nearCurse, near.curse || 0); at.farCurse = Math.max(at.farCurse, far.curse || 0);
    });
    var growth = function (d) { return (d - api.BODY_R * 0.5) / api.ULT.dmR * api.ULT.dmGrowMs; };
    if (at.nearStun === null || Math.abs(at.nearStun - growth(120)) > 50) bad.push("가까운 적(120) 기절 시점 " + at.nearStun);
    if (at.farStun === null || Math.abs(at.farStun - growth(380)) > 50) bad.push("먼 적(380) 기절 시점 " + at.farStun);
    if (1000 - near.hp !== api.ULT.dmBoltDmg) bad.push("가까운 적 피해 " + (1000 - near.hp));
    if (1000 - far.hp !== api.ULT.dmBoltDmg) bad.push("먼 적 피해 " + (1000 - far.hp));
    if (at.nearCurse !== 1 || at.farCurse !== 1) bad.push("기절 뒤 번개로 저주 1회씩이어야 함: " + at.nearCurse + "·" + at.farCurse);
    if (at.nearBolt === null || Math.abs(at.nearBolt - at.nearStun - api.ULT.dmStunMs) > 40) bad.push("번개가 기절 " + at.nearStun + "ms 뒤 " + at.nearBolt + "ms");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "가까운 적 " + Math.round(at.nearStun) + "ms·먼 적 " + Math.round(at.farStun) + "ms에 기절, 기절이 풀린 " + Math.round(at.nearBolt) + "ms에 " + api.ULT.dmBoltDmg + " 피해 한 번");
  });
  run(SHAMAN, "영역전개: 주술사를 따라다니고, 다 커진 뒤 들어온 적은 기절하지 않지만 번개(최대 체력의 " + api.ULT.dmStrikeMaxHpRate * 100 + "%) 대상이 되는가", function (done) {
    var y = OPEN_Y.forest, W = shamanTeam(), sh = W.ent("sh"), near = W.ent("near"), far = W.ent("far"), bad = [];
    near.x = 300; near.y = y - 480; far.x = 300; far.y = y - 700;
    api.useUlt(sh, 0);
    W.step(api.ULT.dmGrowMs + 200);
    sh.y = y - 300;
    var stunnedLate = false;
    W.step(300, FRAME, function (t) { if (api.stunned(near, t)) stunnedLate = true; });
    if (stunnedLate) bad.push("다 커진 뒤 들어온 적이 기절함");
    var n0 = near.hp, f0 = far.hp;
    sh.cdUntil = 0; api.fireBasic(sh, Math.PI);
    W.step(100);
    if (n0 - near.hp !== Math.round(near.maxHp * api.ULT.dmStrikeMaxHpRate)) bad.push("따라온 영역 안 적 번개 피해(최대 체력 비례) " + (n0 - near.hp));
    if (far.hp !== f0) bad.push("영역 밖 적이 맞음");
    if (near.curse !== 1) bad.push("영역 안 번개로 저주 1회여야 함: " + near.curse);
    var strikeStunLeft = near.stunUntil - W.t();
    if (!api.stunned(near, W.t()) || Math.abs(strikeStunLeft - (api.ULT.dmStrikeStunMs - 100)) > 40) bad.push("번개 기절 남은 시간 " + Math.round(strikeStunLeft) + "ms");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "주술사가 움직이면 영역도 따라감, 늦게 들어온 적은 커질 때 기절 없이 번개(최대 체력의 " + api.ULT.dmStrikeMaxHpRate * 100 + "%) 피해와 " + api.ULT.dmStrikeStunMs + "ms 기절");
  });
  run(SHAMAN, "영역전개: 영역 안의 네크로 해골도 번개 대상(가장 가까운 적)이 되는가", function (done) {
    var y = OPEN_Y.forest, W = shamanTeam([{ id: "nc", team: "red", char: "necro", x: 300, y: y + 340, gauge: api.GAUGE_MAX }]), sh = W.ent("sh"), nc = W.ent("nc"), near = W.ent("near");
    near.x = 300; near.y = y + 300; W.ent("far").y = y + 900;
    api.useUlt(nc, -Math.PI / 2);
    W.step(api.ULT.smRiseMs + 100);
    var minion = (nc.minions || [])[0];
    if (!minion) { done("fail", "시험 준비 실패: 해골이 없음"); return; }
    minion.x = 300; minion.y = y + 120;
    api.useUlt(sh, 0);
    W.step(api.ULT.dmGrowMs + api.ULT.dmStunMs + 200);
    var m0 = minion.hp, n0 = near.hp;
    sh.cdUntil = 0; api.fireBasic(sh, 0);
    W.step(100);
    var ok = minion.hp < m0 && near.hp === n0;
    done(ok ? "pass" : "fail", "해골 체력 " + m0 + " → " + minion.hp + ", 더 먼 적 " + (n0 - near.hp) + " 피해");
  });
  run(SHAMAN, "영역전개: 은신한 적은 번개 대상에서 빠지고, 보이는 적 중 가장 가까운 적이 맞는가", function (done) {
    var y = OPEN_Y.forest, W = shamanTeam([{ id: "rg", team: "red", char: "rogue", x: 360, y: y, gauge: api.GAUGE_MAX }]), sh = W.ent("sh"), rg = W.ent("rg"), near = W.ent("near");
    api.useUlt(sh, 0);
    W.step(api.ULT.dmGrowMs + api.ULT.dmStunMs + 200);
    api.useUlt(rg, 0);
    W.step(api.ULT.asSmokeMs + 100);
    rg.x = 330; rg.y = y + 150; W.frame(FRAME);
    if (api.visibleTo(rg, sh, W.t())) { done("fail", "시험 준비 실패: 은신자가 보임"); return; }
    var r0 = rg.hp, n0 = near.hp;
    sh.cdUntil = 0; api.fireBasic(sh, 0);
    W.step(100);
    var want = Math.round(near.maxHp * api.ULT.dmStrikeMaxHpRate);
    var ok = rg.hp === r0 && n0 - near.hp === want;
    done(ok ? "pass" : "fail", "은신자 피해 " + (r0 - rg.hp) + ", 보이는 적 피해 " + (n0 - near.hp) + " (기대 0·" + want + ")");
  });
  run(SHAMAN, "영역전개: 주술사가 쓰러지면 반구가 바로 사라지고, 부활 보호 중인 적은 기절·번개를 받지 않는가", function (done) {
    var W = shamanTeam(), sh = W.ent("sh"), near = W.ent("near"), far = W.ent("far"), bad = [];
    far.protectUntil = W.t() + api.ULT.dmDur + 500; far.x = 500;
    api.useUlt(sh, 0);
    var stunnedEver = false;
    W.step(api.ULT.dmGrowMs + 100, FRAME, function (t) { if (api.stunned(far, t)) stunnedEver = true; });
    if (stunnedEver || far.hp !== 1000) bad.push("보호 중인 적이 기절하거나 맞음");
    api.damage(sh, 9999, "near", false, null);
    W.frame(FRAME);
    if (api.domains().length) bad.push("쓰러진 뒤에도 반구가 남음");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "보호 중인 적은 그대로, 주술사가 쓰러지자 반구가 사라짐");
  });

  api.MAP_IDS.forEach(function (m, i) {
    var seed = 1000 + i * 17;
    run(AUTO, "AI 6명 60초 난전 — " + m + " (가끔 150ms 멈칫, 시드 " + seed + ")", function (done) {
      var r = autoMelee(m, 60, seed), kinds = Object.keys(r.issues);
      var roster = r.list.map(function (e) { return api.CHARS[e.char].name; }).join("·");
      done(kinds.length ? "fail" : "pass", "출전: " + roster + " / 킬 " + r.kills + ", 궁극기 " + r.ults + "번" +
        (kinds.length ? " / 규칙 위반: " + kinds.map(function (k) { return k + " " + r.issues[k].n + "번 (처음: " + r.issues[k].first + ")"; }).join("; ") : " / 규칙 위반 없음"));
    });
  });

  var DRAFTG = "드래프트", STATSG = "경기 통계 저장", CLOCKG = "시계 맞추기", FLOWG = "방 상태 전이";

  function pathParts(path) { return path ? path.split("/") : []; }
  function getPath(obj, path) {
    var cur = obj;
    pathParts(path).forEach(function (k) { cur = cur == null ? cur : cur[k]; });
    return cur;
  }
  function setPath(obj, path, value) {
    var parts = pathParts(path), cur = obj;
    parts.slice(0, -1).forEach(function (k) { if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {}; cur = cur[k]; });
    var last = parts[parts.length - 1];
    if (value === null || value === undefined) delete cur[last]; else cur[last] = JSON.parse(JSON.stringify(value));
  }
  function recordingRoom(over) {
    var room = { code: "TEST", mode: "cup", map: "forest", status: "lobby", host: "pb1", startAt: null, winner: null, endedAt: null,
                 roster: null, draft: null, arena: null, bans: null, statsNote: null, updates: [], sets: [], listeners: {} };
    Object.keys(over || {}).forEach(function (k) { room[k] = over[k]; });
    function node(path) {
      return {
        child: function (p) { return node(path ? path + "/" + p : p); },
        update: function (u) {
          room.updates.push({ path: path, u: JSON.parse(JSON.stringify(u)) });
          Object.keys(u).forEach(function (k) { setPath(room, path ? path + "/" + k : k, u[k]); });
          return Promise.resolve();
        },
        set: function (v) { room.sets.push({ path: path, v: v }); setPath(room, path, v); return Promise.resolve(); },
        transaction: function (fn) {
          var cur = getPath(room, path), out = fn(cur == null ? cur : JSON.parse(JSON.stringify(cur)));
          if (out === undefined) return Promise.resolve({ committed: false });
          setPath(room, path, out);
          return Promise.resolve({ committed: true });
        },
        on: function (ev, fn) { room.listeners[path] = fn; }, off: function () { delete room.listeners[path]; },
        once: function () { return Promise.resolve({ val: function () { return null; } }); }, remove: function () {}
      };
    }
    room.ref = node("");
    return room;
  }
  function withSeed(seed, fn) {
    var real = Math.random, rnd = seededRandom(seed);
    Math.random = rnd;
    try { return fn(); } finally { Math.random = real; }
  }

  var DR = api.DRAFT, STEPS = api.DRAFT_STEPS, POSITIONS = ["b1", "b2", "b3", "r1", "r2", "r3"], DRAFT_BANS_AND_PICKS = 6;
  function withDraft(aiPositions, fn) {
    var players = {};
    POSITIONS.forEach(function (k, i) {
      players["p" + k] = { nickname: "선수" + k, isAI: (aiPositions || []).indexOf(k) >= 0, team: k.charAt(0) === "b" ? "blue" : "red", joinedAt: i + 1 };
    });
    var room = recordingRoom({ mode: "cup", status: "lobby" }), previousId = api.myId;
    var S = { room: room, players: players, as: function (k) { api.setMyId("p" + k); } };
    api.bindRoom(room, players); api.setClock(T0); S.as("b1");
    try { return fn(S); }
    finally { api.unbindRoom(); api.setMyId(previousId); DR.busy = false; DR.launched = 0; DR.view = null; }
  }
  function startDraft(S) { S.as("b1"); DR.startDraft(); S.room.status = "draft"; return S.room.draft; }
  function tick() { DR.hostDraftTick(); DR.busy = false; }
  function finish(S, draft) { DR.hostDraftFinish(draft || S.room.draft, api.CLOCK.now()); DR.busy = false; }
  function playOut(S) {
    var guard = 0, order = [];
    while (!DR.draftDone(S.room.draft) && guard++ < 20) {
      var d = S.room.draft, waiting = DR.draftWaiting(d, d.step);
      order.push(d.step + ":" + waiting.join("+"));
      waiting.forEach(function (id) { S.as(id.slice(1)); DR.draftPick(DR.draftLeft(S.room.draft)[0]); });
    }
    return order;
  }
  function launchUpdate(S) { return S.room.updates.filter(function (x) { return x.u.status === "countdown"; })[0]; }
  function updatedCount(S) { return S.room.updates.length; }

  run(DRAFTG, "진행 순서: 밴 2단계 뒤 픽 4단계(블루 1 → 레드 1·2 → 블루 2·3 → 레드 3), 단계 이름이 맞는가", function (done) {
    var kinds = STEPS.map(function (s) { return s.ban ? "밴" : "픽"; }).join(","), sides = STEPS.map(function (s, i) { return DR.stepSide(i); }).join("");
    var labels = STEPS.map(function (s, i) { return DR.draftStepLabel(i); }).join(" / ");
    var ok = kinds === "밴,밴,픽,픽,픽,픽" && sides === "brbrbr" && labels === "블루 밴 / 레드 밴 / 블루 1 / 레드 1·2 / 블루 2·3 / 레드 3";
    done(ok ? "pass" : "fail", kinds + " · 진영 " + sides + " · " + labels);
  });

  run(DRAFTG, "드래프트 시작: 팀마다 먼저 들어온 3명이 1·2·3번이 되고 0단계에서 시작하는가", function (done) {
    withDraft([], function (S) {
      S.players.pr1.joinedAt = 9; S.players.pr2.joinedAt = 3; S.players.pr3.joinedAt = 5;
      var extra = { nickname: "넷째", isAI: false, team: "red", joinedAt: 99 };
      S.players.pr4 = extra;
      var d = startDraft(S), u = S.room.updates[0].u;
      var seq = ["b1", "b2", "b3", "r1", "r2", "r3"].map(function (k) { return d.seq[k]; }).join(",");
      var ok = seq === "pb1,pb2,pb3,pr2,pr3,pr1" && d.step === 0 && u.status === "draft" && u.roster === null && !!u.arena;
      done(ok ? "pass" : "fail", "자리 순서 " + seq + ", 단계 " + d.step + ", 방 상태 " + u.status);
    });
  });

  run(DRAFTG, "한 판 끝까지: 차례가 아닌 선수·이미 밴·고른 캐릭터·없는 캐릭터는 거부되고 결과 6픽 2밴이 겹치지 않는가", function (done) {
    withDraft([], function (S) {
      var L = api.CHAR_LIST, bad = [];
      startDraft(S);
      S.as("r2"); DR.draftPick(L[0]);
      if (S.room.draft.bans) bad.push("차례가 아닌 선수의 밴이 들어감");
      S.as("b1"); DR.draftPick("없는캐릭터");
      if (S.room.draft.bans) bad.push("없는 캐릭터가 들어감");
      DR.draftPick(L[0]);
      if (S.room.draft.step !== 1 || S.room.draft.bans.b !== L[0]) bad.push("블루 밴이 안 들어감");
      S.as("r1"); DR.draftPick(L[0]);
      if (S.room.draft.bans.r) bad.push("이미 밴한 캐릭터를 또 밴함");
      DR.draftPick(L[1]);
      S.as("b1"); DR.draftPick(L[0]); DR.draftPick(L[1]);
      if (S.room.draft.picks) bad.push("밴된 캐릭터를 고름");
      DR.draftPick(L[2]);
      S.as("r1"); DR.draftPick(L[2]);
      if (S.room.draft.picks.pr1) bad.push("이미 고른 캐릭터를 또 고름");
      DR.draftPick(L[3]);
      S.as("r2"); DR.draftPick(L[3]);
      if (S.room.draft.picks.pr2) bad.push("같은 단계 동료가 고른 캐릭터를 또 고름");
      DR.draftPick(L[4]);
      if (S.room.draft.step !== 4) bad.push("레드 1·2 가 끝났는데 다음 단계로 안 넘어감(" + S.room.draft.step + ")");
      var order = playOut(S), d = S.room.draft, picked = POSITIONS.map(function (k) { return d.picks["p" + k]; });
      var all = picked.concat([d.bans.b, d.bans.r]);
      if (!DR.draftDone(d)) bad.push("끝나지 않음");
      if (all.filter(function (c, i) { return all.indexOf(c) !== i; }).length) bad.push("겹치는 캐릭터 있음: " + all.join(","));
      if (all.some(function (c) { return L.indexOf(c) < 0; })) bad.push("고를 수 없는 캐릭터가 들어감");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "밴 " + d.bans.b + "·" + d.bans.r + ", 픽 " + picked.join(",") + ", 남은 단계 " + order.join(" ") + " 까지 거부 규칙 모두 지킴");
    });
  });

  run(DRAFTG, "차례 순서: 한 단계의 선수가 모두 골라야 다음 단계 대기자가 바뀌는가", function (done) {
    withDraft([], function (S) {
      startDraft(S);
      var order = playOut(S).join(" ");
      done(order === "0:pb1 1:pr1 2:pb1 3:pr1+pr2 4:pb2+pb3 5:pr3" ? "pass" : "fail", order);
    });
  });

  run(DRAFTG, "나간 선수의 차례(혼자 맡은 단계, 둘 다 나간 단계)는 건너뛰는가", function (done) {
    withDraft([], function (S) {
      startDraft(S);
      delete S.players.pr1;
      S.as("b1"); DR.draftPick(api.CHAR_LIST[0]);
      var afterBan = S.room.draft.step, skippedBan = !S.room.draft.bans.r;
      S.as("b1"); DR.draftPick(api.CHAR_LIST[1]);
      var afterBluePick = S.room.draft.step;
      delete S.players.pr2;
      DR.draftSettle(S.room.draft, T0 + 1);
      var ok = afterBan === 2 && skippedBan && afterBluePick === 3 && S.room.draft.step === 4;
      done(ok ? "pass" : "fail", "레드 1이 나간 뒤 블루 밴 끝나고 단계 " + afterBan + "(기대 2), 블루 픽 뒤 " + afterBluePick + "(기대 3), 레드 2도 나가면 " + S.room.draft.step + "(기대 4)");
    });
  });

  run(DRAFTG, "시간 초과: 고민 중이던(hover) 캐릭터가 밴·픽되고, 아무것도 안 골랐으면 밴 없음·무작위 픽인가", function (done) {
    withDraft([], function (S) {
      var L = api.CHAR_LIST, bad = [], d = startDraft(S);
      S.as("b1"); DR.draftHover(L[5]);
      api.setClock(T0 + api.DRAFT_STEP_MS - 1); tick();
      if (S.room.draft.step !== 0) bad.push("시간이 남았는데 자동으로 골라짐");
      api.setClock(T0 + api.DRAFT_STEP_MS); tick();
      if (S.room.draft.bans.b !== L[5]) bad.push("시간 초과 밴이 hover 가 아님: " + S.room.draft.bans.b);
      if (S.room.draft.step !== 1) bad.push("다음 단계로 안 넘어감");
      api.setClock(T0 + 2 * api.DRAFT_STEP_MS); tick();
      if (S.room.draft.bans.r !== api.NO_BAN) bad.push("고민한 캐릭터 없이 시간 초과면 '밴 없음' 이어야 함: " + S.room.draft.bans.r);
      if (DR.draftBanned(S.room.draft).length !== 1) bad.push("밴 없음이 밴 목록에 들어감");
      api.setClock(T0 + 3 * api.DRAFT_STEP_MS); withSeed(11, tick);
      var pick1 = S.room.draft.picks && S.room.draft.picks.pb1;
      if (!pick1 || L.indexOf(pick1) < 0 || pick1 === L[5]) bad.push("무작위 픽이 올바르지 않음: " + pick1);
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "밴 " + L[5] + " → 밴 없음 → 무작위 픽 " + pick1);
    });
  });

  run(DRAFTG, "AI 자동 선택: 2.5초가 지나야 움직이고, AI 는 밴 없음 없이 남은 캐릭터 중에서 고르는가", function (done) {
    withDraft(["b1", "r1"], function (S) {
      var bad = [];
      startDraft(S);
      api.setClock(T0 + api.DRAFT_AI_MS - 1); tick();
      if (S.room.draft.bans) bad.push("AI 가 너무 일찍 고름");
      api.setClock(T0 + api.DRAFT_AI_MS); withSeed(5, tick);
      var banB = S.room.draft.bans && S.room.draft.bans.b;
      if (!banB || banB === api.NO_BAN || api.CHAR_LIST.indexOf(banB) < 0) bad.push("AI 밴이 올바르지 않음: " + banB);
      api.setClock(T0 + 2 * api.DRAFT_AI_MS); withSeed(6, tick);
      var banR = S.room.draft.bans.r;
      if (!banR || banR === api.NO_BAN || banR === banB) bad.push("레드 AI 밴이 올바르지 않음: " + banR);
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "AI 밴 " + banB + "·" + banR);
    });
  });

  run(DRAFTG, "AI 만 있는 드래프트 50판: 6픽 2밴이 항상 서로 다르고 고를 수 있는 캐릭터뿐인가", function (done) {
    var bad = [];
    for (var seed = 1; seed <= 50 && bad.length < 3; seed++) {
      withDraft(POSITIONS, function (S) {
        withSeed(seed, function () {
          startDraft(S);
          var clock = T0, guard = 0;
          while (!DR.draftDone(S.room.draft) && guard++ < 30) { clock += api.DRAFT_AI_MS; api.setClock(clock); tick(); }
          var d = S.room.draft, all = POSITIONS.map(function (k) { return d.picks["p" + k]; }).concat([d.bans.b, d.bans.r]);
          if (!DR.draftDone(d)) bad.push("시드 " + seed + ": 끝나지 않음");
          else if (all.filter(function (c, i) { return all.indexOf(c) !== i; }).length || all.some(function (c) { return api.CHAR_LIST.indexOf(c) < 0; })) bad.push("시드 " + seed + ": " + all.join(","));
        });
      });
    }
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "50판 모두 겹침·잘못된 캐릭터 없음");
  });

  function tradeScenario(aiPositions, fn) {
    withDraft(aiPositions, function (S) { startDraft(S); playOut(S); fn(S); });
  }
  run(DRAFTG, "교환 자격: 같은 팀·둘 다 고른 뒤·둘 다 준비 전·진행 중인 교환 없을 때만 신청되는가", function (done) {
    tradeScenario([], function (S) {
      var bad = [], d = S.room.draft;
      S.as("b2");
      if (!DR.canTradeWith(d, "pb3")) bad.push("같은 팀 동료인데 안 됨");
      if (DR.canTradeWith(d, "pr1")) bad.push("상대 팀과 교환됨");
      if (DR.canTradeWith(d, "pb2")) bad.push("자기 자신과 교환됨");
      S.as("b3"); DR.draftReady(); S.as("b2");
      if (DR.canTradeWith(S.room.draft, "pb3")) bad.push("준비 완료한 동료와 교환됨");
      S.as("b3"); DR.draftReady(); S.as("b2");
      if (!DR.canTradeWith(S.room.draft, "pb3")) bad.push("준비를 취소했는데 교환이 안 됨");
      DR.draftTradeAsk("pb3");
      if (!S.room.draft.trade || S.room.draft.trade.from !== "pb2" || S.room.draft.trade.to !== "pb3") bad.push("교환 신청이 안 들어감");
      S.as("b1");
      if (DR.canTradeWith(S.room.draft, "pb2")) bad.push("이미 교환 중인 선수와 또 신청됨");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "동료만, 준비 전에만, 한 번에 하나만 신청됨");
    });
  });
  run(DRAFTG, "교환 수락·거절·취소: 받은 사람만 답하고 신청한 사람만 취소하며, 수락하면 두 선수의 캐릭터가 서로 바뀌는가", function (done) {
    tradeScenario([], function (S) {
      var bad = [], before = JSON.parse(JSON.stringify(S.room.draft.picks));
      S.as("b2"); DR.draftTradeAsk("pb3");
      S.as("b1"); DR.draftTradeAnswer(true);
      if (!S.room.draft.trade) bad.push("제3자의 수락이 먹힘");
      S.as("b3"); DR.draftTradeCancel();
      if (!S.room.draft.trade) bad.push("받은 사람이 취소가 됨");
      S.as("b2"); DR.draftTradeCancel();
      if (S.room.draft.trade) bad.push("신청한 사람이 취소 못 함");
      DR.draftTradeAsk("pb3");
      S.as("b3"); DR.draftTradeAnswer(false);
      var d = S.room.draft;
      if (d.trade || !d.denied || d.denied.to !== "pb2") bad.push("거절 기록이 없음");
      if (JSON.stringify(d.picks) !== JSON.stringify(before)) bad.push("거절했는데 캐릭터가 바뀜");
      S.as("b2");
      if (DR.draftTradeBoxHtml(d).indexOf("거절") < 0) bad.push("거절 안내가 안 보임");
      api.setClock(T0 + api.DRAFT_STEP_MS * 3);
      if (DR.draftTradeBoxHtml(d) !== "") bad.push("거절 안내가 안 사라짐");
      api.setClock(T0);
      DR.draftTradeAsk("pb3");
      S.as("b3"); DR.draftTradeAnswer(true);
      d = S.room.draft;
      if (d.trade || d.picks.pb2 !== before.pb3 || d.picks.pb3 !== before.pb2) bad.push("수락했는데 캐릭터가 안 바뀜");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : before.pb2 + " ↔ " + before.pb3 + " 교환 완료, 거절·취소·제3자 규칙 지킴");
    });
  });
  run(DRAFTG, "준비 완료: 시작 전·팀 밖·교환 중인 선수는 못 누르고, 누르면 켜졌다 꺼지며 준비 수가 맞는가", function (done) {
    withDraft([], function (S) {
      var bad = [];
      startDraft(S);
      S.as("b1"); DR.draftReady();
      if (S.room.draft.ready) bad.push("드래프트 중에 준비가 됨");
      playOut(S);
      S.players.pspec = { nickname: "구경꾼", isAI: false, team: "spec", joinedAt: 50 };
      S.as("spec"); DR.draftReady();
      if (S.room.draft.ready) bad.push("선수가 아닌 사람이 준비함");
      S.as("b1"); DR.draftReady(); S.as("r2"); DR.draftReady();
      if (DR.draftReadyCount(S.room.draft) !== 2) bad.push("준비 수 " + DR.draftReadyCount(S.room.draft));
      DR.draftReady();
      if (DR.draftReadyCount(S.room.draft) !== 1) bad.push("다시 눌러도 안 꺼짐");
      S.as("b2"); DR.draftTradeAsk("pb3"); DR.draftReady();
      if (S.room.draft.ready.pb2) bad.push("교환 중인데 준비됨");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "준비 켜기·끄기·제한 모두 맞음, 사람 수 " + DR.draftHumans(S.room.draft).length);
    });
  });
  run(DRAFTG, "AI 와 교환: 신청 후 1.2초가 지나야 AI 가 수락하고, 신청 중 선수가 나가면 교환이 사라지는가", function (done) {
    tradeScenario(["b3"], function (S) {
      var bad = [], before = JSON.parse(JSON.stringify(S.room.draft.picks)), t = T0;
      S.as("b2"); api.setClock(t); DR.draftTradeAsk("pb3");
      api.setClock(t + api.DRAFT_AI_TRADE_MS - 1); finish(S);
      if (!S.room.draft.trade) bad.push("AI 가 너무 일찍 수락함");
      api.setClock(t + api.DRAFT_AI_TRADE_MS); finish(S);
      var d = S.room.draft;
      if (d.trade || d.picks.pb2 !== before.pb3 || d.picks.pb3 !== before.pb2) bad.push("AI 가 수락해서 캐릭터가 안 바뀜");
      S.as("b1"); DR.draftTradeAsk("pb2");
      if (!S.room.draft.trade) bad.push("두 번째 교환 신청이 안 됨");
      delete S.players.pb2;
      finish(S);
      if (S.room.draft.trade) bad.push("선수가 나갔는데 교환이 남음");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "AI 수락 1.2초 뒤, 이탈 시 교환 취소");
    });
  });
  run(DRAFTG, "게임 시작: 사람이 모두 준비해야 한 번만 시작하고 로스터·밴이 맞게 들어가는가", function (done) {
    tradeScenario(["b3", "r3"], function (S) {
      var bad = [], humans = DR.draftHumans(S.room.draft), picks = JSON.parse(JSON.stringify(S.room.draft.picks)), banned = DR.draftBanned(S.room.draft);
      finish(S);
      if (launchUpdate(S)) bad.push("아무도 준비 안 했는데 시작함");
      humans.slice(0, humans.length - 1).forEach(function (id) { S.as(id.slice(1)); DR.draftReady(); });
      finish(S);
      if (launchUpdate(S)) bad.push("한 명이 준비 안 했는데 시작함");
      S.as(humans[humans.length - 1].slice(1)); DR.draftReady();
      var lastDraft = JSON.parse(JSON.stringify(S.room.draft));
      finish(S);
      var launched = launchUpdate(S), count = updatedCount(S);
      if (!launched) { done("fail", "모두 준비했는데 시작 안 함 / " + bad.join(" / ")); return; }
      finish(S, lastDraft);
      if (updatedCount(S) !== count) bad.push("시작을 두 번 보냄");
      var u = launched.u;
      if (u.draft !== null && u.draft !== undefined) bad.push("시작할 때 드래프트가 지워지지 않음");
      POSITIONS.forEach(function (k) { var r = u.roster["p" + k]; if (!r || r.c !== picks["p" + k] || r.team !== (k.charAt(0) === "b" ? "blue" : "red")) bad.push(k + " 로스터가 픽과 다름"); });
      if (JSON.stringify(u.bans) !== JSON.stringify(banned)) bad.push("밴 목록이 다름");
      if (!(u.startAt > 0)) bad.push("시작 시각이 없음");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "사람 " + humans.length + "명 모두 준비 후 한 번만 시작, 로스터 6명·밴 " + banned.length + "개, 상태 " + u.status);
    });
  });

  var STATS = api.STATS;
  function statsFixture() {
    var roster = {}, players = {};
    POSITIONS.forEach(function (k, i) {
      var team = k.charAt(0) === "b" ? "blue" : "red", id = "p" + k;
      players[id] = { nickname: "선수" + k, isAI: false, team: team, slot: (i % 3) + 1, characterType: api.CHAR_LIST[i], joinedAt: i + 1 };
      roster[id] = { team: team, c: api.CHAR_LIST[i], ai: false };
    });
    return { roster: roster, players: players };
  }
  function withStatsEnv(fn) {
    var scale = api.CLOCK.scale, link = api.setTestLink(false), db = api.setDb(null), previousId = api.myId;
    api.MATCH.bots = {}; api.MATCH.remotes = {}; api.MATCH.me = null; api.MATCH.stateByKey = {};
    api.CLOCK.scale = api.DEFAULT_SLOW;
    try { return fn(); }
    finally {
      api.CLOCK.scale = scale; api.setTestLink(link); api.setDb(db); api.setMyId(previousId); api.unbindRoom();
      api.MATCH.remotes = {}; api.MATCH.me = null; api.MATCH.stateByKey = {};
    }
  }
  function fakeDb(initial) {
    var db = { store: initial || {}, paths: [] };
    db.ref = function (path) {
      return { transaction: function (fn) {
        db.paths.push(path);
        var cur = db.store[path] === undefined ? null : JSON.parse(JSON.stringify(db.store[path])), out = fn(cur);
        if (out === undefined) return Promise.resolve({ committed: false });
        db.store[path] = out;
        return Promise.resolve({ committed: true });
      } };
    };
    return db;
  }
  function round1(v) { return Math.round(v * 10) / 10; }

  var SKIP_CASES = [
    ["일반 3대3 방(pvp·cup 아님)", "이 모드는", function (F, a) { a.mode = "3v3"; }],
    ["연습 모드", "이 모드는", function (F, a) { a.mode = "practice"; }],
    ["참가자 정보(roster) 없음", "참가자 정보를 못 받아서", function (F, a) { a.roster = null; }],
    ["배포용(테스트) 링크", "배포용(테스트) 링크", function (F, a, env) { env.testLink = true; }],
    ["옛 속도(시간 배율 1) 경기", "옛 속도", function (F, a, env) { env.scale = 1; }],
    ["로스터에 AI 표시", "AI가 함께해서", function (F) { F.roster.pr2.ai = true; }],
    ["참가자 목록에 AI", "AI가 함께해서", function (F) { F.players.pb3.isAI = true; }],
    ["로스터 선수가 참가자 목록에 없음(나감)", "참가자 정보가 맞지", function (F) { delete F.players.pr1; }],
    ["팀이 다름", "참가자 정보가 맞지", function (F) { F.players.pb1.team = "red"; }],
    ["캐릭터가 다름", "참가자 정보가 맞지", function (F) { F.players.pb2.characterType = "zzz"; }],
    ["존재하지 않는 캐릭터", "참가자 정보가 맞지", function (F) { F.roster.pb2.c = "zzz"; F.players.pb2.characterType = "zzz"; }],
    ["슬롯이 없음", "참가자 정보가 맞지", function (F) { delete F.players.pr3.slot; }],
    ["관전 팀이 섞임", "참가자 정보가 맞지", function (F) { F.roster.pr3.team = "spec"; F.players.pr3.team = "spec"; }],
    ["블루 2명·레드 3명", "3명씩", function (F) { delete F.roster.pb3; }],
    ["4대3", "3명씩", function (F) { F.roster.pb4 = { team: "blue", c: api.CHAR_LIST[7], ai: false }; F.players.pb4 = { team: "blue", slot: 1, characterType: api.CHAR_LIST[7], isAI: false }; }]
  ];
  run(STATSG, "저장 제외 판정: 모드·참가자·AI·인원·테스트 링크·옛 속도 " + SKIP_CASES.length + "가지가 정확한 사유로 걸러지는가", function (done) {
    withStatsEnv(function () {
      var bad = [], base = STATS.skipReason("cup", statsFixture().roster, statsFixture().players);
      if (base !== "") bad.push("정상 6명 경기(cup)가 제외됨: " + base);
      if (STATS.skipReason("pvp", statsFixture().roster, statsFixture().players) !== "") bad.push("정상 6명 경기(pvp)가 제외됨");
      if (!STATS.isFullStudentMatch("cup", statsFixture().roster, statsFixture().players)) bad.push("isFullStudentMatch 가 정상 경기를 거름");
      SKIP_CASES.forEach(function (c) {
        var F = statsFixture(), arg = { mode: "cup", roster: F.roster }, env = { testLink: false, scale: api.DEFAULT_SLOW };
        c[2](F, arg, env);
        api.setTestLink(env.testLink); api.CLOCK.scale = env.scale;
        var why = STATS.skipReason(arg.mode, arg.roster, F.players);
        if (why.indexOf(c[1]) < 0) bad.push(c[0] + ": '" + why + "' (기대 '" + c[1] + "')");
        if (STATS.isFullStudentMatch(arg.mode, arg.roster, F.players)) bad.push(c[0] + ": isFullStudentMatch 가 통과시킴");
        api.setTestLink(false); api.CLOCK.scale = api.DEFAULT_SLOW;
      });
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "정상 경기만 통과하고 " + SKIP_CASES.length + "가지 사유가 모두 제외됨");
    });
  });

  function endedRoom(F, over) {
    var room = recordingRoom({ mode: "cup", status: "ended", winner: "blue", endedAt: T0 + 5000, roster: F.roster });
    Object.keys(over || {}).forEach(function (k) { room[k] = over[k]; });
    return room;
  }
  function battleStats(n) { return { dmg: 100 * n + 3.3, heal: 10 * n, blocked: 5 * n + 0.04, stunDealt: 2 * n, slowDealt: n, assists: n, kills: n + 1, deaths: n }; }
  run(STATSG, "저장 시도 조건: 방이 바뀌었거나 끝나지 않았거나 승패가 없거나 남지 않은 사람이 있으면 저장 안 하고 사유를 남기는가", function (done) {
    withStatsEnv(function () {
      var bad = [], F = statsFixture(), db = fakeDb();
      api.setDb(db);
      var room = endedRoom(F); api.bindRoom(room, F.players);
      STATS.record(recordingRoom({ mode: "cup", status: "ended", winner: "blue", endedAt: T0 + 5000, roster: F.roster }), T0 + 5000, true);
      if (db.paths.length) bad.push("다른 방 결과가 저장됨");
      room.status = "playing"; STATS.record(room, T0 + 5000, true);
      room.status = "ended"; STATS.record(room, T0 + 1, true);
      room.winner = null; STATS.record(room, T0 + 5000, true);
      room.winner = "blue";
      if (db.paths.length) bad.push("끝나지 않았거나 시각·승패가 안 맞는데 저장됨");
      STATS.record(room, T0 + 5000, false);
      var note = room.updates.filter(function (x) { return x.u.statsNote; }).pop();
      if (db.paths.length || !note || note.u.statsNote.indexOf("결과 창까지 남지 않은") < 0) bad.push("남지 않은 사람이 있는데 사유가 안 남음: " + (note && note.u.statsNote));
      F.players.pb1.isAI = true;
      STATS.record(room, T0 + 5000, true);
      note = room.updates.filter(function (x) { return x.u.statsNote; }).pop();
      if (db.paths.length || note.u.statsNote.indexOf("참가자 정보가 맞지") < 0) bad.push("AI 가 있는데 저장되거나 사유가 안 남음");
      F.players.pb1.isAI = false;
      STATS.record(room, T0 + 5000, true);
      if (db.paths.join() !== "teambattle/modestats/cup") bad.push("정상 경기가 저장 경로 teambattle/modestats/cup 에 안 들어감: " + db.paths.join());
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "조건이 어긋나면 저장하지 않고, 정상 경기만 " + db.paths[0] + " 에 저장함");
    });
  });
  run(STATSG, "통계 행 만들기와 평균 갱신: 두 경기를 저장하면 픽·승·피해·회복·막은 피해·기절·둔화·어시스트·킬·죽음이 평균으로 쌓이는가", function (done) {
    withStatsEnv(function () {
      var bad = [], F = statsFixture(), L = api.CHAR_LIST, db = fakeDb(), key = "teambattle/modestats/cup";
      api.setDb(db);
      var room = endedRoom(F, { bans: [L[8], "없는캐릭터"] }); api.bindRoom(room, F.players);
      POSITIONS.forEach(function (k, i) { if (k !== "r3") api.MATCH.remotes["p" + k] = battleStats(i + 1); });
      STATS.save(room, F.players);
      var first = db.store[key];
      room.winner = "red"; room.bans = [L[8]];
      POSITIONS.forEach(function (k, i) { if (k !== "r3") api.MATCH.remotes["p" + k] = battleStats(i + 3); });
      STATS.save(room, F.players);
      var s = db.store[key], c0 = s[L[0]], c5 = s[L[5]];
      if (first.matches !== 1 || s.matches !== 2) bad.push("경기 수 " + first.matches + "→" + s.matches);
      if (s.blue !== 1 || s.red !== 1) bad.push("승패 블루 " + s.blue + "·레드 " + s.red);
      if (c0.picks !== 2 || c0.wins !== 1) bad.push("블루 선수 픽·승 " + c0.picks + "·" + c0.wins);
      if (s[L[3]].picks !== 2 || s[L[3]].wins !== 1) bad.push("레드 선수 픽·승 " + s[L[3]].picks + "·" + s[L[3]].wins);
      var a = battleStats(1), b = battleStats(3);
      var want = { dmg: round1((a.dmg + b.dmg) / 2), heal: round1((a.heal + b.heal) / 2), block: round1((a.blocked + b.blocked) / 2), stun: round1((a.stunDealt + b.stunDealt) / 2),
                   slow: round1((a.slowDealt + b.slowDealt) / 2), assist: round1((a.assists + b.assists) / 2), kills: round1((a.kills + b.kills) / 2), deaths: round1((a.deaths + b.deaths) / 2) };
      Object.keys(want).forEach(function (k) { if (c0[k] !== want[k]) bad.push(L[0] + " " + k + " " + c0[k] + " (기대 " + want[k] + ")"); });
      if (c0.ccPicks !== 2 || c0.asPicks !== 2 || c0.kdPicks !== 2) bad.push("평균 분모 ccPicks·asPicks·kdPicks " + c0.ccPicks + "·" + c0.asPicks + "·" + c0.kdPicks);
      if (c5.picks !== 2 || c5.dmg !== 0 || c5.kills !== 0) bad.push("전투 기록이 없는 선수(레드 3)는 0 으로 쌓여야 함: " + JSON.stringify(c5));
      if (s[L[8]].bans !== 2 || s[L[8]].picks !== 0) bad.push("밴 횟수 " + s[L[8]].bans + " (기대 2, 없는 캐릭터 밴은 무시)");
      if (s["없는캐릭터"]) bad.push("없는 캐릭터가 통계에 들어감");
      var gamesBad = L.filter(function (k) { return s[k].games !== 2; });
      if (gamesBad.length) bad.push("선택 가능 판수(games) 가 2가 아닌 캐릭터 " + gamesBad.length + "명");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "2경기 평균·승수·밴·판수가 모두 계산과 같음 (" + L[0] + " 피해 " + c0.dmg + ")");
    });
  });
  run(STATSG, "옛 통계(games 칸 없음)는 지금까지 판수 + 1 로 이어 세고, 새 캐릭터는 1판째로 시작하는가", function (done) {
    withStatsEnv(function () {
      var bad = [], F = statsFixture(), L = api.CHAR_LIST, key = "teambattle/modestats/cup";
      var old = {}; old.matches = 4; old[L[0]] = { picks: 4, wins: 2, dmg: 50, heal: 0 };
      var db = fakeDb(); db.store[key] = old;
      api.setDb(db);
      var room = endedRoom(F); api.bindRoom(room, F.players);
      STATS.save(room, F.players);
      var s = db.store[key];
      if (s[L[0]].games !== 5) bad.push("옛 칸의 판수 " + s[L[0]].games + " (기대 5)");
      if (s[L[1]].games !== 1) bad.push("새 캐릭터 판수 " + s[L[1]].games + " (기대 1)");
      if (s[L[0]].picks !== 5) bad.push("픽 " + s[L[0]].picks);
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "옛 4경기 뒤 5판째, 새 캐릭터는 1판째");
    });
  });
  run(STATSG, "결과 창 도착 확인(watchDone): 사람이 모두 같은 종료 시각을 쓸 때만 저장하고 구독을 끊는가", function (done) {
    withStatsEnv(function () {
      var bad = [], F = statsFixture(), db = fakeDb();
      var room = endedRoom(F); api.bindRoom(room, F.players);
      api.setDb(null); STATS.watchDone(T0 + 5000);
      if (room.listeners.done) bad.push("db 가 없는데 구독함");
      api.setDb(db); STATS.watchDone(T0 + 5000);
      if (!room.listeners.done) { done("fail", "구독이 안 걸림"); return; }
      var doneMap = {};
      POSITIONS.slice(0, 5).forEach(function (k) { doneMap["p" + k] = T0 + 5000; });
      doneMap.pr3 = T0 + 4000;
      room.listeners.done({ val: function () { return doneMap; } });
      if (db.paths.length) bad.push("한 명이 다른 시각인데 저장됨");
      doneMap.pr3 = T0 + 5000;
      room.listeners.done({ val: function () { return doneMap; } });
      if (db.paths.length !== 1) bad.push("모두 도착했는데 저장 횟수 " + db.paths.length);
      if (room.listeners.done) bad.push("저장 뒤 구독을 안 끊음");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "5명 도착·1명 지연 → 대기, 6명 도착 → 저장 1번 후 구독 해제");
    });
  });
  run(STATSG, "저장 중 잠금(holdActive)·결과 창 도착 기록(markStayed)이 조건대로 동작하는가", function (done) {
    withStatsEnv(function () {
      var bad = [], F = statsFixture();
      var room = endedRoom(F, { statsNote: api.STATS_PENDING }); api.bindRoom(room, F.players); api.setMyId("pb2");
      api.setClock(T0 + 5000 + api.STATS_HOLD_MAX_MS - 1);
      if (!STATS.holdActive()) bad.push("저장 중인데 잠기지 않음");
      api.setClock(T0 + 5000 + api.STATS_HOLD_MAX_MS);
      if (STATS.holdActive()) bad.push("최대 시간이 지났는데 계속 잠김");
      api.setClock(T0 + 5001); room.statsNote = "이 경기는 통계에 반영됐어요";
      if (STATS.holdActive()) bad.push("저장이 끝났는데 잠김");
      room.statsNote = api.STATS_PENDING; room.status = "playing";
      if (STATS.holdActive()) bad.push("끝나지 않은 방이 잠김");
      api.unbindRoom();
      if (STATS.holdActive()) bad.push("방이 없는데 잠김");
      api.bindRoom(room, F.players); room.status = "ended";
      STATS.markStayed();
      var mine = room.sets.filter(function (x) { return x.path === "done/pb2"; })[0];
      if (!mine || mine.v !== T0 + 5000) bad.push("결과 창 도착 기록이 안 남음");
      var count = room.sets.length;
      api.setMyId("pspec"); F.players.pspec = { team: "spec", isAI: false, joinedAt: 80 };
      STATS.markStayed();
      delete F.roster.pb3; api.setMyId("pb3"); STATS.markStayed();
      if (room.sets.length !== count) bad.push("선수가 아닌 사람이 도착 기록을 남김");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "잠금 " + api.STATS_HOLD_MAX_MS + "ms, 선수만 도착 기록");
    });
  });

  function clockLink(isHostNow, roomObj) {
    var link = { hostFlag: isHostNow, roomObj: roomObj || null, id: "me" };
    link.isHost = function () { return link.hostFlag; }; link.room = function () { return link.roomObj; }; link.myId = function () { return link.id; };
    return link;
  }
  function withDateNow(clockMs, fn) {
    var real = Date.now, box = { t: clockMs };
    Date.now = function () { return box.t; };
    try { return fn(box); } finally { Date.now = real; }
  }
  function pong(room, a, t, host) { return { key: "me", val: function () { return { a: a, t: t, h: host || room.host }; } }; }

  run(CLOCKG, "서버 시각: 호스트는 서버 오프셋, 참가자는 호스트와 맞춘 값(없으면 서버 오프셋)을 쓰는가", function (done) {
    withDateNow(1e12, function () {
      var bad = [], room = recordingRoom({ host: "H" }), guest = new api.GameClock(clockLink(false, room)), host = new api.GameClock(clockLink(true, room));
      guest.serverOffset = 40; host.serverOffset = 40;
      if (guest.real() !== 1e12 + 40) bad.push("맞추기 전 참가자 " + (guest.real() - 1e12));
      guest.off = 250;
      if (guest.real() !== 1e12 + 250) bad.push("맞춘 뒤 참가자 " + (guest.real() - 1e12));
      host.off = 250;
      if (host.real() !== 1e12 + 40) bad.push("호스트는 맞춘 값을 무시해야 함 " + (host.real() - 1e12));
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "참가자 40 → 250, 호스트 40 그대로");
    });
  });
  run(CLOCKG, "왕복이 가장 짧은 표본으로 맞추는가 (onPong: 오프셋 = 호스트 시각 − (보낸 시각+받은 시각)/2)", function (done) {
    withDateNow(0, function (box) {
      var bad = [], room = recordingRoom({ host: "H" }), c = new api.GameClock(clockLink(false, room));
      function receive(a, got, t) { box.t = got; c.onPong(pong(room, a, t)); }
      receive(1000, 1300, 2000);
      if (c.off !== 850) bad.push("첫 표본 " + c.off + " (기대 850)");
      receive(5000, 5100, 5500);
      if (c.off !== 450) bad.push("더 빠른 표본 " + c.off + " (기대 450)");
      receive(9000, 9200, 9900);
      if (c.off !== 450) bad.push("더 느린 표본이 덮어씀 " + c.off);
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "왕복 300→100→200ms 중 100ms 표본(450)을 유지");
    });
  });
  run(CLOCKG, "잘못된 응답은 무시하는가 (방 없음·다른 호스트·내가 호스트·왕복 5초 초과·음수)", function (done) {
    withDateNow(0, function (box) {
      var bad = [], room = recordingRoom({ host: "H" }), c = new api.GameClock(clockLink(false, room));
      box.t = 1000; c.onPong(pong(room, 900, 5000, "다른사람"));
      box.t = 7000; c.onPong(pong(room, 1000, 5000));
      box.t = 500; c.onPong(pong(room, 1000, 5000));
      var asHost = new api.GameClock(clockLink(true, room)); box.t = 1100; asHost.onPong(pong(room, 1000, 5000));
      var noRoom = new api.GameClock(clockLink(false, null)); noRoom.onPong(pong(room, 1000, 5000));
      var empty = new api.GameClock(clockLink(false, room)); empty.onPong({ key: "me", val: function () { return null; } });
      [["다른 호스트·5초 초과·음수", c], ["내가 호스트", asHost], ["방 없음", noRoom], ["빈 응답", empty]].forEach(function (x) { if (x[1].samples.length || x[1].off !== null) bad.push(x[0] + " 표본이 들어감"); });
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "6가지 잘못된 응답 모두 표본에 안 들어감");
    });
  });
  run(CLOCKG, "표본은 최근 " + api.CLOCK_KEEP + "개만 보관해서, 가장 빨랐던 옛 표본이 밀려나면 다음 표본으로 바뀌는가", function (done) {
    withDateNow(0, function (box) {
      var bad = [], room = recordingRoom({ host: "H" }), c = new api.GameClock(clockLink(false, room));
      box.t = 150; c.onPong(pong(room, 50, 1100));
      var fastOff = c.off;
      for (var i = 0; i < api.CLOCK_KEEP - 1; i++) { box.t = 1000 + i; c.onPong(pong(room, 600 + i, 5000)); }
      if (c.samples.length !== api.CLOCK_KEEP || c.off !== fastOff) bad.push("꽉 찼는데 빠른 표본이 사라짐 (" + c.samples.length + "개, " + c.off + ")");
      box.t = 2000; c.onPong(pong(room, 1500, 5000));
      var best = c.samples.reduce(function (m, s) { return s.rtt < m.rtt ? s : m; });
      if (c.samples.length !== api.CLOCK_KEEP || c.off !== best.off || c.off === fastOff) bad.push("옛 표본이 안 밀려남 (" + c.samples.length + "개, " + c.off + ")");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "빠른 표본 " + fastOff + " → 밀려난 뒤 " + c.off);
    });
  });
  run(CLOCKG, "ping 응답: 호스트만 pong 에 자기 시각(real)과 호스트 아이디를 적고, 참가자·빈 ping 은 무시하는가", function (done) {
    withDateNow(5000, function () {
      var bad = [], room = recordingRoom({ host: "H" }), host = new api.GameClock(clockLink(true, room)), guest = new api.GameClock(clockLink(false, room));
      host.serverOffset = 30; host.link.id = "H";
      host.onPing({ key: "pX", val: function () { return { a: 4000 }; } });
      var w = room.sets[0];
      if (!w || w.path !== "pong/pX" || w.v.a !== 4000 || w.v.t !== 5030 || w.v.h !== "H") bad.push("pong 내용 " + JSON.stringify(w));
      var n = room.sets.length;
      host.onPing({ key: "pY", val: function () { return {}; } });
      guest.onPing({ key: "pZ", val: function () { return { a: 1 }; } });
      if (room.sets.length !== n) bad.push("무시해야 할 ping 에 답함");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "pong " + JSON.stringify(w.v));
    });
  });
  run(CLOCKG, "방장이 바뀌면 표본을 지우고 새 호스트와 다시 맞추기 시작하는가 (같은 호스트면 유지, 내가 호스트면 ping 안 보냄)", function (done) {
    withDateNow(0, function (box) {
      var bad = [], room = recordingRoom({ host: "A" }), c = new api.GameClock(clockLink(false, room));
      try {
        c.resetSync("A"); box.t = 150; c.onPong(pong(room, 50, 1100, "A"));
        c.hostChanged("A");
        if (c.samples.length !== 1 || c.off === null) bad.push("같은 호스트인데 표본이 지워짐");
        if (room.sets.length) bad.push("같은 호스트인데 ping 보냄");
        c.hostChanged("B");
        if (c.samples.length || c.off !== null || c.host !== "B") bad.push("호스트가 바뀌었는데 표본이 남음");
        var pings = room.sets.filter(function (x) { return x.path === "ping/me"; });
        if (pings.length !== 1) bad.push("새 호스트에게 첫 ping " + pings.length + "번");
        c.stopBurst();
        c.hostChanged(null);
        if (room.sets.length !== 1) bad.push("호스트가 없는데 ping 보냄");
        var self = new api.GameClock(clockLink(true, room)); self.hostChanged("me"); self.stopBurst();
        if (room.sets.length !== 1) bad.push("내가 호스트인데 ping 보냄");
      } finally { c.stopBurst(); }
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "A 유지 → B 로 바뀌면 초기화하고 ping 1번 → 없음·내가 호스트는 ping 없음");
    });
  });
  run(CLOCKG, "느린 모드(배율 0.7): 경기 시작 전엔 실제 시각 그대로, 시작 뒤에만 0.7배로 흐르고 검사용 시계가 우선하는가", function (done) {
    withDateNow(0, function (box) {
      var bad = [], S = 1e12, room = recordingRoom({ host: "H", startAt: S }), c = new api.GameClock(clockLink(false, room));
      c.scale = 0.7;
      box.t = S - 500; if (c.now() !== S - 500) bad.push("시작 전 " + (c.now() - S));
      box.t = S + 1000; var a = c.now();
      box.t = S + 3000; var b = c.now();
      if (a !== S + 700 || Math.round(b - a) !== 1400) bad.push("시작 뒤 0.7배 아님: " + (a - S) + ", 2초 동안 " + Math.round(b - a));
      c.scale = 1;
      if (c.now() !== S + 3000) bad.push("배율 1 인데 시각이 달라짐");
      c.scale = 0.7; room.startAt = null;
      if (c.now() !== S + 3000) bad.push("시작 시각이 없는데 배율 적용");
      c.testTime = 77;
      if (c.now() !== 77) bad.push("검사용 시계가 우선하지 않음");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "시작 전 그대로 · 시작 뒤 1초→0.7초 · 배율 1/시작 없음/검사 시계 처리 맞음");
    });
  });

  function filledMatch() {
    var m = api.MATCH, f = api.FIELD, mark = { marker: true };
    m.game = { mark: 1 }; m.me = mark; m.bots = { a: mark }; m.remotes = { b: mark }; m.remoteShots = { c: 1 }; m.shots = [mark]; m.melee = { d: 1 }; m.fx = [mark];
    m.handled = { e: 1 }; m.ccPending = { f: 1 }; m.stateByKey = { g: "s" }; m.hitSubs = { h: 1 }; m.lastHp = { i: 5 }; m.hudShown = { k: 9, d: 9, a: 9, dmg: 9 };
    f.storms.push(mark); f.pools.push(mark); f.holes.push(mark); f.revs.push(mark); f.graces.push(mark); f.domains.push(mark); f.bursts.push(mark); f.lunges.push(mark); f.waves.push(mark); f.bladeSpins.push(mark);
    f.curses.x = mark; f.poolHit.y = 1;
  }
  function fieldEmpty() {
    var f = api.FIELD;
    return ["storms", "pools", "holes", "revs", "graces", "domains", "bursts", "lunges", "waves", "bladeSpins"].every(function (k) { return f[k].length === 0; }) && !Object.keys(f.curses).length && !Object.keys(f.poolHit).length;
  }
  function isEmpty(v) { return Array.isArray(v) ? v.length === 0 : !Object.keys(v).length; }
  run(FLOWG, "방을 나갈 때(MATCH.leave): 경기 중 목록·내 캐릭터·지속 효과는 비우고 처치 크레딧·HUD 기록은 남기는가", function (done) {
    var bad = [];
    try {
      filledMatch(); api.MATCH.leave();
      var m = api.MATCH;
      if (m.game !== null || m.me !== null) bad.push("game·me 가 안 비워짐");
      ["bots", "remotes", "remoteShots", "shots", "melee", "fx", "stateByKey", "hitSubs"].forEach(function (k) { if (!isEmpty(m[k])) bad.push(k + " 가 안 비워짐"); });
      if (!fieldEmpty()) bad.push("지속 효과(FIELD)가 안 비워짐");
      ["handled", "ccPending", "lastHp"].forEach(function (k) { if (isEmpty(m[k])) bad.push(k + " 는 남아 있어야 하는데 비워짐(현재 동작)"); });
    } finally { api.MATCH.reset(); api.FIELD.reset(); }
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "8개 목록 비움, game·me null, FIELD 비움, handled·ccPending·lastHp 유지");
  });
  run(FLOWG, "라운드를 시작할 때(MATCH.startRound): 봇·원격·연출·처리 기록·지속 효과·HUD 기록을 비우고 game·me·투사체는 유지하는가", function (done) {
    var bad = [];
    try {
      filledMatch(); api.MATCH.startRound();
      var m = api.MATCH;
      ["bots", "remotes", "fx", "ccPending", "handled"].forEach(function (k) { if (!isEmpty(m[k])) bad.push(k + " 가 안 비워짐"); });
      if (JSON.stringify(m.hudShown) !== JSON.stringify({ k: -1, d: -1, a: -1, dmg: -1 })) bad.push("hudShown " + JSON.stringify(m.hudShown));
      if (!fieldEmpty()) bad.push("지속 효과(FIELD)가 안 비워짐");
      if (!m.game || !m.me) bad.push("game·me 가 지워짐");
      ["shots", "remoteShots", "melee", "stateByKey", "hitSubs", "lastHp"].forEach(function (k) { if (isEmpty(m[k])) bad.push(k + " 는 유지돼야 하는데 비워짐(현재 동작)"); });
    } finally { api.MATCH.reset(); api.FIELD.reset(); }
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "5개 목록·hudShown·FIELD 비움, game·me·shots·melee·stateByKey·hitSubs·lastHp 유지");
  });
  run(FLOWG, "MATCH.reset(): 모든 칸이 처음 상태로 돌아오고 처치 크레딧·HUD 기록도 초기값인가", function (done) {
    var bad = [];
    try {
      filledMatch(); api.MATCH.reset();
      var m = api.MATCH;
      if (m.game !== null || m.me !== null) bad.push("game·me");
      ["bots", "remotes", "remoteShots", "shots", "melee", "fx", "handled", "ccPending", "stateByKey", "hitSubs", "lastHp"].forEach(function (k) { if (!isEmpty(m[k])) bad.push(k); });
      if (m.hudShown.k !== -1) bad.push("hudShown");
    } finally { api.FIELD.reset(); }
    done(bad.length ? "fail" : "pass", bad.length ? "안 비워진 칸: " + bad.join(", ") : "13개 칸이 모두 초기값");
  });
  run(FLOWG, "로비 → 드래프트: 지난 판 결과(로스터·승패·통계 메모·투사체)를 지우고 방 상태가 draft 로 바뀌는가", function (done) {
    withDraft([], function (S) {
      var bad = [];
      S.room.roster = { x: 1 }; S.room.winner = "red"; S.room.final = { blue: 1 }; S.room.statsNote = "지난 판"; S.room.endedAt = 5; S.room.startAt = 9; S.room.shots = { z: 1 };
      startDraft(S);
      var u = S.room.updates[0].u;
      if (u.status !== "draft" || S.room.status !== "draft") bad.push("상태 " + u.status);
      ["roster", "st", "winner", "final", "statsNote", "endedAt", "startAt", "shots", "meleeHits", "hits", "effects", "kills", "projectiles"].forEach(function (k) {
        if (!(k in u) || u[k] !== null) bad.push(k + " 가 안 지워짐");
        if (S.room[k] != null) bad.push("방의 " + k + " 가 남음");
      });
      if (!u.draft || u.draft.step !== 0) bad.push("드래프트 초기값");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "13칸을 지우고 draft 상태, 단계 0");
    });
  });
  run(FLOWG, "드래프트 → 카운트다운: 방 상태가 countdown 이 되고 6명의 시작 상태(st)·로스터가 만들어지며 드래프트·지난 결과는 지워지는가", function (done) {
    tradeScenario(["b3"], function (S) {
      var bad = [], before = Date.now();
      POSITIONS.forEach(function (k) { if (k !== "b3") { S.as(k); DR.draftReady(); } });
      finish(S);
      var u = (launchUpdate(S) || {}).u;
      if (!u) { done("fail", "시작하지 않음"); return; }
      if (u.status !== "countdown" || S.room.status !== "countdown") bad.push("상태 " + u.status);
      if (Object.keys(u.st).sort().join() !== "b1,b2,b3,r1,r2,r3") bad.push("시작 상태 칸 " + Object.keys(u.st).join());
      if (u.draft !== null) bad.push("드래프트가 남음");
      if (!(u.startAt >= before + 2900 && u.startAt <= Date.now() + 3100)) bad.push("카운트다운 3초가 아님: " + (u.startAt - before));
      ["winner", "final", "statsNote", "endedAt", "shots", "meleeHits", "hits", "effects", "kills", "projectiles"].forEach(function (k) { if (u[k] !== null) bad.push(k + " 가 안 지워짐"); });
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "countdown, 시작 상태 6칸, 약 3초 뒤 시작");
    });
  });
  run(FLOWG, "결과 → 로비(backToLobby): 방이 lobby 로 돌아가고 판 기록·연습 AI 가 지워지는가", function (done) {
    withDraft([], function (S) {
      var bad = [];
      S.room.status = "ended";
      S.players.aiPracticeBot = { team: "red", isAI: true, practiceBot: true, joinedAt: 90 };
      api.backToLobby();
      var u = S.room.updates[0].u;
      if (u.status !== "lobby" || S.room.status !== "lobby") bad.push("상태 " + u.status);
      ["winner", "final", "statsNote", "startAt", "endedAt", "roster", "draft", "bans", "st", "done", "shots", "meleeHits", "hits", "effects", "kills", "projectiles"].forEach(function (k) { if (!(k in u) || u[k] !== null) bad.push(k + " 가 안 지워짐"); });
      if (!("players/aiPracticeBot" in u) || u["players/aiPracticeBot"] !== null) bad.push("연습 AI 가 안 지워짐");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "lobby, 16칸 + 연습 AI 삭제");
    });
  });


  var INPUTG = "내 캐릭터 조작", VISG = "표적·시야·광선", KILLG = "킬 피드";

  function releaseInput() {
    Object.keys(api.KEY_ON).forEach(function (k) { api.KEY_ON[k] = false; });
    api.joy.id = null; api.aim.id = null;
  }
  function withMe(list, fn) {
    var W = world("forest", list), me = W.ent(api.myId);
    delete me.bot; delete api.MATCH.bots[api.myId]; api.MATCH.me = me;
    releaseInput();
    try { return fn(W, me); }
    finally { releaseInput(); api.MATCH.me = null; }
  }
  function meEntry(char, team, x, y, extra) {
    var e = { id: api.myId, team: team, char: char, x: x, y: y };
    Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }
  function moveOf(W, me, ms) {
    var x0 = me.x, y0 = me.y;
    W.step(ms);
    return { dx: me.x - x0, dy: me.y - y0, dist: hyp(me.x - x0, me.y - y0) };
  }
  function pointer(target, type, id, x, y) {
    target.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }
  function shotsBy(W, id) { return W.log.filter(function (p) { return p.path === "shots" && p.v.o === id; }); }

  run(INPUTG, "방향키·WASD 이동: 빨강은 키 방향 그대로, 파랑은 화면이 뒤집혀 반대로, 대각선도 같은 속도인가", function (done) {
    var bad = [], speed = api.CHARS.ranger.speed, want = speed * 0.2, y = OPEN_Y.forest;
    [["right", "red", 1, 0], ["left", "red", -1, 0], ["down", "red", 0, 1], ["up", "red", 0, -1], ["right", "blue", -1, 0], ["up", "blue", 0, 1]].forEach(function (c) {
      withMe([meEntry("ranger", c[1], 600, y)], function (W, me) {
        api.KEY_ON[c[0]] = true;
        var m = moveOf(W, me, 200);
        if (Math.abs(m.dx - c[2] * want) > 3 || Math.abs(m.dy - c[3] * want) > 3 || !me.mv) bad.push(c[1] + " " + c[0] + " → 이동 (" + Math.round(m.dx) + ", " + Math.round(m.dy) + "), 기대 (" + c[2] * want + ", " + c[3] * want + "), mv " + me.mv);
      });
    });
    withMe([meEntry("ranger", "red", 600, y)], function (W, me) {
      api.KEY_ON.right = true; api.KEY_ON.down = true;
      var m = moveOf(W, me, 200);
      if (Math.abs(m.dist - want) > 3) bad.push("대각선 이동 거리 " + Math.round(m.dist) + " (기대 " + want + ")");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "6방향과 대각선이 0.2초에 " + want + " 만큼(속도 " + speed + ")");
  });

  run(INPUTG, "키를 떼면 멈추고, 반대 키를 함께 누르면 제자리인가", function (done) {
    withMe([meEntry("ranger", "red", 600, OPEN_Y.forest)], function (W, me) {
      var bad = [];
      api.KEY_ON.left = true; api.KEY_ON.right = true;
      var both = moveOf(W, me, 300);
      if (both.dist > 0.5 || me.mv) bad.push("반대 키 동시 입력에 움직임 " + Math.round(both.dist));
      api.KEY_ON.left = false;
      moveOf(W, me, 100);
      api.KEY_ON.right = false;
      var after = moveOf(W, me, 200);
      if (after.dist > 0.5 || me.mv) bad.push("키를 뗐는데 계속 움직임 " + Math.round(after.dist));
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "반대 키 동시 입력은 제자리, 키를 떼면 바로 멈춤");
    });
  });

  run(INPUTG, "조이스틱 이동: 가운데 8px 이하는 무시, 거리에 비례해 빨라지고 반지름 이상이면 최고 속도, 파랑은 뒤집히는가", function (done) {
    var bad = [], speed = api.CHARS.ranger.speed, y = OPEN_Y.forest, R = api.joyRadius();
    [["빨강 가운데", "red", 5, 0, 0], ["빨강 반", "red", R / 2, 0, 0.5], ["빨강 최대", "red", R * 2, 0, 1], ["파랑 최대", "blue", R * 2, 0, -1], ["빨강 아래", "red", 0, R, 1]].forEach(function (c) {
      withMe([meEntry("ranger", c[1], 600, y)], function (W, me) {
        var joy = api.joy;
        joy.id = 1; joy.ox = 100; joy.oy = 100; joy.x = 100 + c[2]; joy.y = 100 + c[3];
        var m = moveOf(W, me, 500), along = c[3] ? m.dy : m.dx, want = c[4] * speed * 0.5;
        if (Math.abs(along - want) > 3 || (c[4] === 0 && me.mv)) bad.push(c[0] + ": " + Math.round(along) + " (기대 " + want + ")");
      });
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "반지름 " + R + " 기준 비례 속도, 가운데 무시, 파랑 반전");
  });

  run(INPUTG, "벽을 향해 계속 걸어도 벽을 뚫지 않고, 기절 중에는 키를 눌러도 못 움직이는가", function (done) {
    world("forest", []);
    var q = singleRowWall(), bad = [], y = OPEN_Y.forest;
    withMe([meEntry("ranger", "red", q.x - 25, q.y + q.h / 2 + 130)], function (W, me) {
      api.KEY_ON.up = true;
      var worst = null;
      W.step(1500, FRAME, function () { var why = blockedAt(me.x, me.y); if (why && !worst) worst = why; });
      if (worst || me.y < q.y) bad.push("벽을 뚫거나 끼임: " + (worst || "y=" + Math.round(me.y)));
    });
    withMe([meEntry("ranger", "red", 600, y), { id: "foe", team: "blue", char: "knight", x: 900, y: y }], function (W, me) {
      W.frame(FRAME);
      api.afflict(me, { stunMs: 400 }, "foe");
      api.KEY_ON.right = true;
      var stunned = moveOf(W, me, 300);
      if (stunned.dist > 0.5 || me.mv) bad.push("기절 중 이동 " + Math.round(stunned.dist));
      var later = moveOf(W, me, 500);
      if (later.dist < 20) bad.push("기절이 끝나도 못 움직임");
    });
    withMe([meEntry("ranger", "red", 600, y)], function (W, me) {
      api.KEY_ON.right = true; me.alive = false; me.diedAt = W.t();
      var dead = moveOf(W, me, 300);
      if (dead.dist > 0.5 || me.mv) bad.push("쓰러졌는데 이동");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "벽 앞에서 멈춤, 기절·쓰러짐 중 이동 불가");
  });

  run(INPUTG, "공격 키(K): 가장 가까운 적을 자동 조준해 쿨타임마다 한 번씩만 쏘는가", function (done) {
    withMe([meEntry("ranger", "red", 200, OPEN_Y.forest), { id: "foe", team: "blue", char: "knight", x: 500, y: OPEN_Y.forest }, { id: "far", team: "blue", char: "knight", x: 900, y: OPEN_Y.forest }], function (W, me) {
      var bad = [], cd = api.CHARS.ranger.cd;
      api.KEY_ON.atk = true;
      W.frame(FRAME);
      var first = shotsBy(W, api.myId);
      if (first.length !== 1 || Math.abs(first[0].v.a) > 0.02) bad.push("첫 프레임 발사 " + first.length + "번, 각도 " + (first[0] && first[0].v.a));
      W.step(cd - 150);
      if (shotsBy(W, api.myId).length !== 1) bad.push("쿨타임 중에 또 쏨 (" + shotsBy(W, api.myId).length + "번)");
      W.step(300);
      if (shotsBy(W, api.myId).length !== 2) bad.push("쿨타임이 지났는데 안 쏨 (" + shotsBy(W, api.myId).length + "번)");
      api.KEY_ON.atk = false;
      W.step(cd * 2);
      if (shotsBy(W, api.myId).length !== 2) bad.push("키를 뗐는데 계속 쏨");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "쿨타임 " + cd + "ms 마다 1번, 가까운 적 방향(0 라디안), 키 떼면 중단");
    });
  });

  run(INPUTG, "키 이름 변환: WASD·방향키·K 는 동작으로, 한글 자판이어도 물리 키(code)로 알아보는가", function (done) {
    var bad = [], table = [[{ code: "KeyW" }, "up"], [{ code: "KeyS" }, "down"], [{ code: "KeyA" }, "left"], [{ code: "KeyD" }, "right"], [{ code: "KeyK" }, "atk"],
      [{ key: "ArrowUp" }, "up"], [{ key: "ArrowDown" }, "down"], [{ code: "ArrowLeft", key: "ArrowLeft" }, "left"], [{ key: "ArrowRight" }, "right"],
      [{ code: "KeyA", key: "ㅁ" }, "left"], [{ code: "KeyQ", key: "q" }, null], [{ code: "Space", key: " " }, null]];
    table.forEach(function (c) { var got = api.keyName(c[0]); if (got !== c[1]) bad.push(JSON.stringify(c[0]) + " → " + got + " (기대 " + c[1] + ")"); });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : table.length + "가지 입력이 모두 맞게 변환됨");
  });

  run(INPUTG, "키보드 이벤트: 경기 화면이 아니면 눌러도 무시하고, 키를 떼거나 창이 포커스를 잃으면 모든 키가 풀리는가", function (done) {
    var bad = [];
    releaseInput();
    try {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true, cancelable: true }));
      if (api.KEY_ON.right) bad.push("경기 화면이 아닌데 키가 눌림");
      api.KEY_ON.right = true; api.KEY_ON.atk = true;
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true }));
      if (api.KEY_ON.right || !api.KEY_ON.atk) bad.push("keyup 이 해당 키만 풀어야 함");
      api.KEY_ON.up = true; api.KEY_ON.left = true;
      window.dispatchEvent(new Event("blur"));
      if (Object.keys(api.KEY_ON).some(function (k) { return api.KEY_ON[k]; })) bad.push("포커스를 잃어도 키가 남음");
    } finally { releaseInput(); }
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "화면 확인·keyup·blur 처리 맞음");
  });

  run(INPUTG, "화면 조이스틱(포인터): 조이스틱 근처에서만 시작하고, 다른 손가락·멀리 누르기·기절 중에는 무시하며 떼면 끝나는가", function (done) {
    var cv = document.getElementById("cv"), y = OPEN_Y.forest;
    withMe([meEntry("ranger", "red", 600, y), { id: "foe", team: "blue", char: "knight", x: 900, y: y }], function (W, me) {
      var bad = [], jb = api.joyBase(), R = api.joyRadius();
      pointer(cv, "pointerdown", 7, jb.x + R * 3, jb.y);
      if (api.joy.id !== null) bad.push("조이스틱에서 먼 곳을 눌렀는데 시작됨");
      pointer(cv, "pointerdown", 7, jb.x, jb.y);
      if (api.joy.id !== 7) bad.push("조이스틱 위치를 눌렀는데 시작 안 됨");
      pointer(cv, "pointerdown", 8, jb.x, jb.y);
      if (api.joy.id !== 7) bad.push("두 번째 손가락이 조이스틱을 가로챔");
      pointer(cv, "pointermove", 8, jb.x + 500, jb.y);
      if (api.joy.x !== jb.x) bad.push("다른 손가락의 움직임이 반영됨");
      pointer(cv, "pointermove", 7, jb.x + R, jb.y);
      var m = moveOf(W, me, 500);
      if (Math.abs(m.dx - api.CHARS.ranger.speed * 0.5) > 3) bad.push("조이스틱 이동 " + Math.round(m.dx));
      pointer(cv, "pointerup", 7, jb.x, jb.y);
      if (api.joy.id !== null) bad.push("손을 뗐는데 조이스틱이 남음");
      api.afflict(me, { stunMs: 800 }, "foe");
      pointer(cv, "pointerdown", 9, jb.x, jb.y);
      if (api.joy.id !== null) bad.push("기절 중인데 조이스틱 시작됨");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "시작·다른 손가락·떼기·기절 규칙 모두 맞음");
    });
  });

  run(INPUTG, "공격 버튼: 짧게 누르면 가장 가까운 적을 자동 조준하고, 끌어서 뗀 방향으로 쏘며 파랑은 방향이 뒤집히는가", function (done) {
    var btn = document.getElementById("btnAtk"), y = OPEN_Y.forest, bad = [];
    withMe([meEntry("ranger", "red", 600, y), { id: "foe", team: "blue", char: "knight", x: 600, y: y - 300 }], function (W, me) {
      pointer(btn, "pointerdown", 3, 100, 100);
      if (api.aim.id !== 3 || api.aim.btn !== "atk") bad.push("공격 버튼이 눌리지 않음");
      pointer(btn, "pointerup", 3, 100, 100);
      var tap = shotsBy(W, api.myId);
      if (tap.length !== 1 || Math.abs(tap[0].v.a - (-Math.PI / 2)) > 0.02 || api.aim.id !== null) bad.push("짧게 누르면 위쪽 적을 향해 쏴야 함: " + JSON.stringify(tap.map(function (p) { return p.v.a; })));
      me.cdUntil = 0;
      pointer(btn, "pointerdown", 4, 100, 100);
      pointer(btn, "pointermove", 4, 100 + api.DRAG_MIN + 40, 100);
      if (!api.aim.drag || Math.abs(me.angle) > 0.02) bad.push("끌었는데 조준 각도가 안 바뀜: " + me.angle);
      pointer(btn, "pointerup", 4, 100 + api.DRAG_MIN + 40, 100);
      var drag = shotsBy(W, api.myId);
      if (drag.length !== 2 || Math.abs(drag[1].v.a) > 0.02) bad.push("끌어서 떼면 오른쪽(0)으로 쏴야 함: " + JSON.stringify(drag.map(function (p) { return p.v.a; })));
    });
    withMe([meEntry("ranger", "blue", 600, y), { id: "foe", team: "red", char: "knight", x: 600, y: y + 300 }], function (W, me) {
      pointer(btn, "pointerdown", 5, 100, 100);
      pointer(btn, "pointermove", 5, 100 + api.DRAG_MIN + 40, 100);
      pointer(btn, "pointerup", 5, 100 + api.DRAG_MIN + 40, 100);
      var shots = shotsBy(W, api.myId);
      if (shots.length !== 1 || Math.abs(Math.abs(shots[0].v.a) - Math.PI) > 0.03) bad.push("파랑은 화면 오른쪽 끌기가 월드 왼쪽(π)이어야 함: " + JSON.stringify(shots.map(function (p) { return p.v.a; })));
    });
    withMe([meEntry("ranger", "red", 600, y), { id: "foe", team: "blue", char: "knight", x: 600, y: y - 300 }], function (W, me) {
      pointer(btn, "pointerdown", 6, 100, 100);
      pointer(btn, "pointermove", 6, 100 + api.DRAG_MIN + 40, 100);
      pointer(btn, "pointercancel", 6, 100, 100);
      if (shotsBy(W, api.myId).length) bad.push("취소(pointercancel)인데 쏨");
      if (api.aim.id !== null) bad.push("취소 뒤에도 조준이 남음");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "자동 조준·끌어서 조준·파랑 반전·취소 모두 맞음");
  });

  run(INPUTG, "스킬 버튼: 조준이 필요 없는 스킬은 누르는 즉시, 조준 스킬은 손을 뗄 때 쓰고 게이지가 비는가 (게이지 부족·기절이면 안 씀)", function (done) {
    var btn = document.getElementById("btnUlt"), y = OPEN_Y.forest, bad = [], C = api.CHARS;
    var instant = api.CHAR_LIST.filter(function (c) { return !C[c].ultAim && !C[c].noAim; })[0], aimed = api.CHAR_LIST.filter(function (c) { return C[c].ultAim; })[0];
    function foe() { return { id: "foe", team: "blue", char: "knight", x: 900, y: y }; }
    withMe([meEntry(instant, "red", 600, y, { gauge: api.GAUGE_MAX }), foe()], function (W, me) {
      pointer(btn, "pointerdown", 2, 100, 100);
      if (me.gauge !== 0 || api.aim.id !== null) bad.push(instant + ": 누르는 즉시 써야 함 (게이지 " + me.gauge + ")");
    });
    withMe([meEntry(aimed, "red", 600, y, { gauge: api.GAUGE_MAX }), foe()], function (W, me) {
      pointer(btn, "pointerdown", 2, 100, 100);
      if (me.gauge !== api.GAUGE_MAX || api.aim.id !== 2) bad.push(aimed + ": 누르는 동안은 조준만 해야 함");
      pointer(btn, "pointerup", 2, 100, 100);
      if (me.gauge !== 0) bad.push(aimed + ": 손을 뗐는데 안 씀 (게이지 " + me.gauge + ")");
    });
    withMe([meEntry(instant, "red", 600, y, { gauge: api.GAUGE_MAX - 1 }), foe()], function (W, me) {
      pointer(btn, "pointerdown", 2, 100, 100);
      if (me.gauge !== api.GAUGE_MAX - 1) bad.push("게이지가 모자란데 씀");
    });
    withMe([meEntry(instant, "red", 600, y, { gauge: api.GAUGE_MAX }), foe()], function (W, me) {
      W.frame(FRAME); api.afflict(me, { stunMs: 800 }, "foe");
      pointer(btn, "pointerdown", 2, 100, 100);
      if (me.gauge !== api.GAUGE_MAX) bad.push("기절 중인데 스킬을 씀");
    });
    var quiet = api.CHAR_LIST.filter(function (c) { return C[c].noAim; })[0];
    if (quiet) withMe([meEntry(quiet, "red", 600, y), foe()], function (W, me) {
      pointer(document.getElementById("btnAtk"), "pointerdown", 2, 100, 100);
      if (me.cdUntil <= W.t() || api.aim.id !== null) bad.push(quiet + ": 조준이 필요 없는 공격은 누르는 즉시 나가야 함");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "즉시형(" + instant + ")·조준형(" + aimed + ")·게이지 부족·기절 규칙 맞음");
  });

  run(VISG, "시야: 은신은 100 안에서만 보이고, 은신이 끝나거나 드러난 동안(revealUntil)에는 멀어도 보이는가", function (done) {
    var y = OPEN_Y.forest, W = world("forest", [{ id: "h", team: "blue", char: "rogue", x: 300, y: y }, { id: "v", team: "red", char: "knight", x: 300, y: y }]);
    var h = W.ent("h"), v = W.ent("v"), t = W.t(), bad = [], near = api.STEALTH_REVEAL_DIST;
    h.stealthUntil = t + api.ULT.asDur;
    v.x = 300 + near - 1; if (!api.visibleTo(h, v, t)) bad.push("가까이(" + (near - 1) + ") 있는데 안 보임");
    v.x = 300 + near + 1; if (api.visibleTo(h, v, t) || !api.hiddenFrom(h, t)) bad.push("멀리(" + (near + 1) + ") 있는데 보임");
    h.revealUntil = t + 500; if (!api.visibleTo(h, v, t)) bad.push("드러난 동안인데 안 보임");
    if (api.visibleTo(h, v, t + 501)) bad.push("드러남이 끝났는데 보임");
    h.revealUntil = 0;
    if (api.revealedTo(h, null, t)) bad.push("보는 사람이 없으면 드러나지 않아야 함");
    if (api.hiddenFrom(h, t + api.ULT.asDur + 1)) bad.push("은신이 끝났는데 숨겨짐");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "은신 거리 " + near + " 경계, 드러남 시간, 은신 종료 모두 맞음");
  });
  run(VISG, "덤불: 덤불 안의 캐릭터는 같은 덤불 안의 상대에게만 보이고 다른 덤불·바깥에서는 안 보이는가", function (done) {
    var y = OPEN_Y.forest, bushes;
    world("forest", []);
    bushes = api.bushTiles();
    if (bushes.length < 2) { done("fail", "시험 준비 실패: 덤불이 2개 미만"); return; }
    var a = bushes[0][0], b = bushes[1][0], bad = [];
    var W = world("forest", [{ id: "h", team: "blue", char: "knight", x: a.x, y: a.y }, { id: "same", team: "red", char: "knight", x: bushes[0][bushes[0].length - 1].x, y: bushes[0][bushes[0].length - 1].y }, { id: "other", team: "red", char: "knight", x: b.x, y: b.y }, { id: "out", team: "red", char: "knight", x: 200, y: y }]);
    var h = W.ent("h"), t = W.t();
    if (!api.inBush(h.x, h.y) || !api.hiddenFrom(h, t)) bad.push("덤불 안인데 숨겨지지 않음");
    if (!api.visibleTo(h, W.ent("same"), t)) bad.push("같은 덤불 안 상대에게 안 보임");
    if (api.visibleTo(h, W.ent("other"), t)) bad.push("다른 덤불 안 상대에게 보임");
    W.ent("out").x = 200; W.ent("out").y = y;
    if (api.inBush(200, y)) { done("fail", "시험 준비 실패: 바깥 위치가 덤불임"); return; }
    if (api.visibleTo(h, W.ent("out"), t)) bad.push("덤불 바깥 상대에게 보임");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "덤불 " + bushes.length + "곳 중 같은 덤불만 서로 보임");
  });

  run(VISG, "표적 목록(localTargets): 살아 있는 내 캐릭터·호스트의 AI 와 준비된 해골만 들어가고, 호스트가 아니면 AI 는 빠지는가", function (done) {
    var y = OPEN_Y.forest;
    withMe([meEntry("ranger", "red", 300, y), { id: "ally", team: "red", char: "knight", x: 400, y: y }, { id: "nc", team: "blue", char: "necro", x: 600, y: y, gauge: api.GAUGE_MAX }, { id: "dead", team: "blue", char: "knight", x: 700, y: y }], function (W, me) {
      var bad = [], ids = function () { return api.localTargets().map(function (T) { return T.id; }).sort().join(","); };
      W.ent("dead").alive = false;
      if (ids() !== ["ally", "nc", api.myId].sort().join(",")) bad.push("기본 목록 " + ids());
      api.useUlt(W.ent("nc"), Math.PI);
      W.step(api.ULT.smRiseMs - 150);
      var minions = api.localTargets().filter(function (T) { return T.minion; }).length;
      if (minions) bad.push("올라오는 중인 해골이 표적에 들어감 " + minions);
      W.step(300);
      var ready = api.localTargets().filter(function (T) { return T.minion; }).length;
      if (ready !== api.ULT.smCount) bad.push("준비된 해골 " + ready + "개 (기대 " + api.ULT.smCount + ")");
      me.alive = false;
      if (api.localTargets().some(function (T) { return T.id === api.myId; })) bad.push("쓰러진 내 캐릭터가 들어감");
      me.alive = true;
      W.room.host = "다른호스트";
      var guest = ids();
      if (guest !== api.myId) bad.push("호스트가 아니면 내 캐릭터만 남아야 함: " + guest);
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "내 캐릭터·AI(호스트)·준비된 해골 " + ready + "개, 쓰러짐 제외, 비호스트는 나만");
    });
  });
  run(VISG, "소리 범위(hear)는 700 미만만 들리고, 지난 투사체·근접 기록(pruneLocal)은 시간이 지나면 지워지는가", function (done) {
    var y = OPEN_Y.forest;
    withMe([meEntry("ranger", "red", 300, y)], function (W, me) {
      var bad = [], t = W.t();
      if (!api.hear({ x: me.x + 699, y: me.y }) || api.hear({ x: me.x + 700, y: me.y }) || !api.hear({ x: me.x, y: me.y + 100 })) bad.push("소리 범위 경계");
      api.MATCH.me = null;
      if (api.hear({ x: me.x, y: me.y })) bad.push("내 캐릭터가 없는데 들림");
      api.MATCH.me = me;
      api.MATCH.remoteShots = { old: { d: { createdAt: t - 5000 }, life: 100 }, fresh: { d: { createdAt: t }, life: 100 }, edge: { d: { createdAt: t - 1100 }, life: 100 } };
      api.MATCH.melee = { stale: { d: {}, at: Date.now() - 2000 }, now: { d: {}, at: Date.now() } };
      api.pruneLocal(t);
      var shots = Object.keys(api.MATCH.remoteShots).sort().join(","), melee = Object.keys(api.MATCH.melee).join(",");
      if (shots !== "edge,fresh") bad.push("투사체 남은 것 " + shots + " (기대 edge,fresh)");
      if (melee !== "now") bad.push("근접 기록 남은 것 " + melee + " (기대 now)");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "700 경계, 오래된 투사체(수명+1초 초과)·근접(1초 초과)만 삭제");
    });
  });
  run(VISG, "광선·시선: 벽 앞에서 멈추고 맵 가장자리에서 끊기며, 벽을 사이에 둔 두 점은 시선이 막히고 선분-원 충돌이 맞는가", function (done) {
    var bad = [], y = OPEN_Y.forest, q;
    world("forest", []);
    q = singleRowWall();
    var wallBottom = q.y + q.h / 2, startY = wallBottom + api.BODY_R + 52, gap = startY - wallBottom;
    var hit = api.rayCast(q.x, startY, 0, -1, 1000, 0);
    if (Math.abs(hit - gap) > 0.5) bad.push("벽까지 거리 " + hit + " (기대 " + gap + ")");
    if (api.rayCast(q.x, startY, 0, -1, 50, 0) !== 50) bad.push("최대 거리 제한이 안 먹음");
    if (Math.abs(api.rayCast(q.x, startY, 0, -1, 1000, 10) - (gap - 10)) > 0.5) bad.push("여유(pad) 10 이면 " + (gap - 10) + " 이어야 함");
    var edge = api.rayCast(api.BOUND.r - 100, y, 1, 0, 1e6, 10);
    if (Math.abs(edge - 90) > 0.01) bad.push("맵 가장자리까지 " + edge + " (기대 90)");
    if (api.losClear(q.x, startY, q.x, q.y - q.h / 2 - 100)) bad.push("벽 너머가 보임");
    if (!api.losClear(q.x, startY, q.x, startY + 40)) bad.push("벽 반대쪽(열린 곳)이 안 보임");
    if (!api.losClear(300, y, 300.5, y)) bad.push("거의 같은 점은 항상 보여야 함");
    if (api.rayRect(0, 0, 1, 0, { x: 100, y: 0, w: 20, h: 20 }, 0) !== 90) bad.push("사각형 광선 거리");
    if (api.rayRect(0, 100, 1, 0, { x: 100, y: 0, w: 20, h: 20 }, 0) !== Infinity) bad.push("빗나간 광선은 Infinity");
    if (api.rayRect(100, 0, 1, 0, { x: 100, y: 0, w: 20, h: 20 }, 0) !== 0) bad.push("안에서 쏘면 0");
    if (!api.segHit(0, 0, 10, 0, 5, 3, 3) || api.segHit(0, 0, 10, 0, 5, 3, 2.9) || !api.segHit(0, 0, 10, 0, 13, 0, 3) || api.segHit(0, 0, 10, 0, 13.1, 0, 3)) bad.push("선분-원 충돌 경계");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "벽·가장자리·시선·사각형·선분-원 12가지 확인");
  });

  function killRow(W, k, killer, victim, t) { return { key: k, val: function () { return { k: killer, v: victim, t: t }; } }; }
  function clearKillFeed() {
    var feed = document.getElementById("killFeed"), banner = document.getElementById("killBanner");
    feed.innerHTML = ""; banner.className = ""; banner.innerHTML = "";
  }
  run(KILLG, "킬 피드: 처치마다 한 줄이 생기고 같은 기록은 한 번만, 너무 오래된 기록은 안 보이며 최대 줄 수를 넘기지 않는가", function (done) {
    var y = OPEN_Y.forest, list = [];
    ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"].forEach(function (id, i) { list.push({ id: id, team: i % 2 ? "red" : "blue", char: "knight", x: 300 + i * 50, y: y }); });
    var W = world("forest", list), t = W.t(), bad = [], feed = document.getElementById("killFeed");
    clearKillFeed();
    try {
      api.onKillFeed(killRow(W, "k1", "alpha", "bravo", t));
      if (feed.children.length !== 1 || feed.textContent.indexOf("alpha") < 0 || feed.textContent.indexOf("bravo") < 0) bad.push("한 줄이 안 생김: " + feed.textContent);
      api.onKillFeed(killRow(W, "k1", "alpha", "bravo", t));
      if (feed.children.length !== 1) bad.push("같은 기록이 두 번 들어감");
      api.onKillFeed(killRow(W, "k2", "charlie", "delta", t - api.KILL_FEED_MS - 1));
      if (feed.children.length !== 1) bad.push("너무 오래된 기록이 보임");
      for (var i = 0; i < 4 + 2; i++) api.onKillFeed(killRow(W, "x" + i, ["charlie", "echo"][i % 2], ["bravo", "delta"][i % 2], t));
      if (feed.children.length !== 4) bad.push("최대 줄 수 " + feed.children.length + " (기대 " + 4 + ")");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "한 줄·중복 무시·오래된 기록 무시·최대 " + 4 + "줄");
    } finally { clearKillFeed(); }
  });
  run(KILLG, "연속 처치 표시: 3초 안의 두 번째 처치에 '더블 킬', 단계가 오르면 이름이 바뀌고 5번째부터는 '펜타 킬'인가", function (done) {
    var y = OPEN_Y.forest, W = world("forest", [{ id: "a", team: "blue", char: "knight", x: 300, y: y }, { id: "b", team: "red", char: "knight", x: 400, y: y }]), t = W.t(), bad = [], feed = document.getElementById("killFeed");
    clearKillFeed();
    try {
      for (var i = 0; i < 6; i++) api.onKillFeed(killRow(W, "m" + i, "a", "b", t + i * 500));
      var tags = ["", "더블 킬", "트리플 킬", "쿼드라 킬", "펜타 킬", "펜타 킬"];
      var all = [];
      for (var s = 1; s <= 6; s++) all.push(api.multiKillTag(s));
      tags.forEach(function (tag, i) { if (tag === "" ? all[i] !== "" : all[i].indexOf(tag) < 0) bad.push((i + 1) + "연속 표시 '" + all[i] + "' (기대 '" + tag + "')"); });
      var last = feed.children[feed.children.length - 1].textContent;
      if (last.indexOf("펜타 킬") < 0) bad.push("여섯 번 연속 처치의 마지막 줄에 펜타 킬이 없음: " + last);
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "1연속 표시 없음 → 더블 → 트리플 → 쿼드라 → 펜타(5·6연속)");
    } finally { clearKillFeed(); }
  });
  run(KILLG, "내 처치 배너: 내가 잡으면 '처치!' 배너가 뜨고 줄이 내 것으로 표시되며, 남이 잡은 건 배너가 안 뜨는가", function (done) {
    var y = OPEN_Y.forest;
    withMe([meEntry("ranger", "red", 300, y), { id: "foe", team: "blue", char: "knight", x: 500, y: y }], function (W, me) {
      var bad = [], banner = document.getElementById("killBanner"), feed = document.getElementById("killFeed"), t = W.t();
      clearKillFeed();
      try {
        api.onKillFeed(killRow(W, "o1", "foe", api.myId, t));
        if (banner.className.indexOf("show") >= 0) bad.push("남이 나를 잡았는데 처치 배너가 뜸");
        if (feed.children[0].className.indexOf("mine") < 0) bad.push("내가 관련된 줄이 강조되지 않음");
        api.onKillFeed(killRow(W, "o2", api.myId, "foe", t + 1));
        if (banner.className.indexOf("show") < 0 || banner.textContent.indexOf("처치") < 0) bad.push("내가 잡았는데 배너가 안 뜸: '" + banner.className + "' " + banner.textContent);
        done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "내가 잡으면 배너(show), 잡힌 줄은 mine 표시");
      } finally { clearKillFeed(); }
    });
  });


  var CONNG = "방 연결", ROSTERG = "로비 규칙", LOBBYG = "로비 화면", MAPG = "맵 데이터";
  var ROOMS = "teambattle/rooms";

  var asyncQueue = [];
  function runAsync(group, name, fn) { asyncQueue.push({ group: group, name: name, fn: fn }); }
  function drainAsync() {
    return asyncQueue.reduce(function (chain, t) {
      return chain.then(function () {
        return new Promise(function (resolve) {
          var finished = false, timer = setTimeout(function () { finish("fail", "5초 안에 끝나지 않음"); }, 5000);
          function finish(status, detail) { if (finished) return; finished = true; clearTimeout(timer); report(t.group, t.name, status, detail); resolve(); }
          try {
            var ret = t.fn(finish);
            if (ret && ret.then) ret.then(function () { if (!finished) finish("fail", "검사가 결과를 내지 않고 끝남"); }, function (err) { finish("fail", "시험 코드 오류: " + (err && err.message)); });
          } catch (err) { finish("fail", "시험 코드 오류: " + (err && err.message)); }
        });
      });
    }, Promise.resolve());
  }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function waitFor(cond, ms) {
    var end = Date.now() + (ms || 1500);
    return new Promise(function (resolve) { (function poll() { if (cond()) { resolve(true); return; } if (Date.now() > end) { resolve(false); return; } setTimeout(poll, 4); })(); });
  }

  function fakeFirebase(initial) {
    var store = initial ? JSON.parse(JSON.stringify(initial)) : {}, listeners = [], counter = 0;
    var fb = { disconnects: [], cancelled: [], writes: [], failTransactions: false, failSets: null };
    function clone(v) { return v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)); }
    function lastSeg(path) { var p = path.split("/"); return p[p.length - 1]; }
    function getAt(path) {
      var cur = store;
      if (path) path.split("/").forEach(function (k) { cur = cur !== null && typeof cur === "object" ? cur[k] : null; if (cur === undefined) cur = null; });
      return cur === undefined ? null : cur;
    }
    function setAt(path, value) {
      var parts = path.split("/"), chain = [store], cur = store;
      for (var i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] === undefined || cur[parts[i]] === null || typeof cur[parts[i]] !== "object") { if (value === null) return; cur[parts[i]] = {}; }
        cur = cur[parts[i]]; chain.push(cur);
      }
      var last = parts[parts.length - 1];
      if (value === null) delete cur[last]; else cur[last] = clone(value);
      for (var j = chain.length - 1; j > 0; j--) if (!Object.keys(chain[j]).length) delete chain[j - 1][parts[j - 1]];
    }
    function snapOf(path, key, value) {
      var v = value === undefined ? getAt(path) : value;
      return { key: key === undefined ? lastSeg(path) : key, val: function () { return clone(v); }, exists: function () { return v !== null; }, ref: refAt(path) };
    }
    function fire() {
      listeners.slice().forEach(function (l) {
        var now = getAt(l.path), nowJson = JSON.stringify(now === undefined ? null : now);
        if (nowJson === l.lastJson && l.started) return;
        var started = l.started; l.started = true;
        var before = l.lastObj, after = now !== null && typeof now === "object" ? now : {};
        l.lastJson = nowJson; l.lastObj = clone(after) || {};
        if (l.ev === "value") { l.fn(snapOf(l.path, undefined, now)); return; }
        var childPath = function (k) { return l.path ? l.path + "/" + k : k; };
        if (l.ev === "child_added") Object.keys(after).forEach(function (k) { if (!started || !(k in before)) l.fn(snapOf(childPath(k), k, after[k])); });
        if (!started) return;
        if (l.ev === "child_changed") Object.keys(after).forEach(function (k) { if (k in before && JSON.stringify(before[k]) !== JSON.stringify(after[k])) l.fn(snapOf(childPath(k), k, after[k])); });
        if (l.ev === "child_removed") Object.keys(before).forEach(function (k) { if (!(k in after)) l.fn(snapOf(childPath(k), k, before[k])); });
      });
    }
    function write(path, value) {
      if (fb.failSets && fb.failSets.test(path) && value !== null) return false;
      fb.writes.push(path); setAt(path, value === undefined ? null : value); return true;
    }
    function refAt(path) {
      var seg = path.split("/");
      return {
        key: lastSeg(path), path: path, parent: { key: seg.length > 1 ? seg[seg.length - 2] : null },
        child: function (p) { return refAt(path ? path + "/" + p : p); },
        once: function () { return Promise.resolve(snapOf(path)); },
        on: function (ev, fn) { listeners.push({ path: path, ev: ev, fn: fn, started: false, lastJson: null, lastObj: {} }); fire(); },
        off: function (ev, fn) { listeners = listeners.filter(function (l) { return !(l.path === path && l.ev === ev && (!fn || l.fn === fn)); }); },
        set: function (v) { if (!write(path, v)) return Promise.reject({ code: "PERMISSION_DENIED" }); fire(); return Promise.resolve(); },
        update: function (u) {
          var ok = true;
          Object.keys(u).forEach(function (k) { if (!write(path ? path + "/" + k : k, u[k])) ok = false; });
          fire();
          return ok ? Promise.resolve() : Promise.reject({ code: "PERMISSION_DENIED" });
        },
        remove: function () { write(path, null); fire(); return Promise.resolve(); },
        push: function (v) { var key = "pk" + (++counter); write(path + "/" + key, v); fire(); return { key: key }; },
        transaction: function (fn) {
          if (fb.failTransactions) return Promise.reject({ code: "PERMISSION_DENIED" });
          var out = fn(clone(getAt(path)));
          if (out === undefined) return Promise.resolve({ committed: false, snapshot: snapOf(path) });
          write(path, out); fire();
          return Promise.resolve({ committed: true, snapshot: snapOf(path) });
        },
        onDisconnect: function () {
          return {
            remove: function () { fb.disconnects.push(path); },
            cancel: function () { fb.cancelled.push(path); fb.disconnects = fb.disconnects.filter(function (p) { return p !== path; }); },
            set: function () {}
          };
        }
      };
    }
    fb.ref = refAt;
    fb.get = function (path) { return clone(getAt(path)); };
    fb.put = function (path, value) { write(path, value); fire(); };
    fb.drop = function () { fb.disconnects.slice().forEach(function (p) { write(p, null); }); fb.disconnects = []; fire(); };
    fb.listenerCount = function () { return listeners.length; };
    setAt(".info/connected", true);
    return fb;
  }

  var HUMAN_CHARS = api.CHAR_LIST;
  function person(nickname, team, joinedAt, charIndex, isAI) { return { nickname: nickname, isAI: !!isAI, team: team, characterType: HUMAN_CHARS[charIndex], joinedAt: joinedAt }; }
  function roomTree(code, players, over) {
    var first = Object.keys(players).filter(function (id) { return !players[id].isAI; })[0];
    var node = { mode: "pvp", map: "forest", arena: "forest", status: "lobby", hostPlayerId: first || null, createdAt: Date.now(), timeScale: 1, players: players };
    Object.keys(over || {}).forEach(function (k) { node[k] = over[k]; });
    var tree = { teambattle: { rooms: {} } };
    tree.teambattle.rooms[code] = node;
    return tree;
  }
  function startMessage() { return document.getElementById("startMsg").textContent; }
  function el(id) { return document.getElementById(id); }

  async function withNet(tree, fn) {
    var fake = fakeFirebase(tree), dbBefore = api.setDb(fake), confBefore = api.setConf({}), nickBefore = api.setNick("나"), idBefore = api.myId, timeBefore = api.CLOCK.testTime;
    api.CLOCK.testTime = null; api.clearHint();
    try { sessionStorage.removeItem(api.RESUME_KEY); } catch (e) {}
    try { return await fn(fake); }
    finally {
      if (api.room()) api.leaveRoom();
      api.setDb(dbBefore); api.setConf(confBefore); api.setNick(nickBefore); api.setMyId(idBefore); api.CLOCK.testTime = timeBefore;
      try { sessionStorage.removeItem(api.RESUME_KEY); } catch (e) {}
      el("joinCode").value = ""; el("btnCreate").disabled = false; el("btnJoin").disabled = false;
    }
  }
  function me() { return api.myId; }
  function playersIn(fake, code) { return fake.get(ROOMS + "/" + code + "/players") || {}; }

  runAsync(CONNG, "방 만들기: 5자리 코드로 방이 만들어지고 나는 방장·블루팀이며 접속이 끊기면 지워지도록 등록되는가", async function (done) {
    await withNet({}, async function (fake) {
      var bad = [];
      el("btnCreate").disabled = false;
      api.createRoom();
      if (!await waitFor(function () { return !!api.room(); })) { done("fail", "방이 안 만들어짐: " + startMessage()); return; }
      var room = api.room(), node = fake.get(ROOMS + "/" + room.code) || {}, mine = (node.players || {})[me()] || {};
      if (!/^\d{5}$/.test(room.code)) bad.push("코드 모양 " + room.code);
      if (node.mode !== "pvp" || node.map !== "forest" || node.arena !== "forest" || node.status !== "lobby") bad.push("기본 설정 " + JSON.stringify([node.mode, node.map, node.arena, node.status]));
      if (node.hostPlayerId !== me() || typeof node.createdAt !== "number" || typeof node.timeScale !== "number") bad.push("방장·시각·시간 배율 기록");
      if (mine.team !== "blue" || mine.isAI !== false || mine.nickname !== "나" || mine.characterType !== api.FALLBACK_CHAR || typeof mine.joinedAt !== "number") bad.push("내 기록 " + JSON.stringify(mine));
      ["players/", "ping/", "pong/"].forEach(function (k) { if (fake.disconnects.indexOf(ROOMS + "/" + room.code + "/" + k + me()) < 0) bad.push(k + " 끊김 정리가 등록 안 됨"); });
      if (api.screen() !== "lobby" || el("lobbyCode").textContent !== room.code) bad.push("화면 " + api.screen() + " / 코드 표시 " + el("lobbyCode").textContent);
      if (el("btnCreate").disabled) bad.push("방을 만든 뒤에도 버튼이 잠겨 있음");
      if (room.host !== me() || room.status !== "lobby" || room.mode !== "pvp" || !api.players()[me()]) bad.push("방 상태가 구독으로 채워지지 않음: " + JSON.stringify([room.host, room.status, room.mode]));
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "코드 " + room.code + ", 일반모드·숲속 공터, 방장 나, 끊김 정리 3종 등록");
    });
  });
  runAsync(CONNG, "방 만들기: 이미 있는 코드와 겹치면 다른 코드로 다시 시도하고 기존 방은 건드리지 않는가", async function (done) {
    var taken = "23456", fresh = "34567", seq = [(23456 - 10000) / 90000 + 1e-9, (34567 - 10000) / 90000 + 1e-9], realRandom = Math.random;
    await withNet(roomTree(taken, { other: person("남", "blue", 1, 0) }), async function (fake) {
      Math.random = function () { return seq.length ? seq.shift() : realRandom(); };
      try { api.createRoom(); if (!await waitFor(function () { return !!api.room(); })) { done("fail", "방이 안 만들어짐: " + startMessage()); return; } }
      finally { Math.random = realRandom; }
      var bad = [];
      if (api.room().code !== fresh) bad.push("새 코드 " + api.room().code + " (기대 " + fresh + ")");
      if (fake.get(ROOMS + "/" + taken + "/hostPlayerId") !== "other" || Object.keys(playersIn(fake, taken)).join() !== "other") bad.push("기존 방이 바뀜");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "겹친 " + taken + " 을 건너뛰고 " + fresh + " 로 만듦");
    });
  });
  runAsync(CONNG, "방 만들기 실패: 연결이 없으면 안내, 데이터베이스가 거절하면 안내하고 버튼을 다시 풀어 주는가", async function (done) {
    var bad = [];
    await withNet({}, async function (fake) {
      api.setDb(null);
      api.createRoom();
      if (startMessage().indexOf("온라인 연결을 할 수 없어요") < 0 || api.room()) bad.push("연결 없음 안내: '" + startMessage() + "'");
      api.setDb(fake); fake.failTransactions = true;
      api.createRoom();
      await waitFor(function () { return startMessage().indexOf("방을 만들지 못했어요") >= 0; });
      if (startMessage().indexOf("데이터베이스 규칙") < 0 || api.room() || el("btnCreate").disabled) bad.push("거절 안내: '" + startMessage() + "', 버튼 잠김 " + el("btnCreate").disabled);
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "연결 없음·데이터베이스 거절 안내, 버튼 복구");
  });

  var JOIN_CASES = [
    ["블루 1명 → 인원이 적은 레드", { b1: person("가", "blue", 1, 0) }, {}, "red"],
    ["블루 1·레드 1 → 같으면 블루", { b1: person("가", "blue", 1, 0), r1: person("나", "red", 2, 1) }, {}, "blue"],
    ["3대3 가득, 관전 비어 있음 → 관전", { b1: person("a", "blue", 1, 0), b2: person("b", "blue", 2, 1), b3: person("c", "blue", 3, 2), r1: person("d", "red", 4, 3), r2: person("e", "red", 5, 4), r3: person("f", "red", 6, 5) }, {}, "spec"],
    ["3대3 가득·관전도 참 → 가득 찼어요", { b1: person("a", "blue", 1, 0), b2: person("b", "blue", 2, 1), b3: person("c", "blue", 3, 2), r1: person("d", "red", 4, 3), r2: person("e", "red", 5, 4), r3: person("f", "red", 6, 5), s1: person("g", "spec", 7, 6) }, {}, "방이 가득 찼어요."],
    ["게임 중 → 관전", { b1: person("가", "blue", 1, 0), r1: person("나", "red", 2, 1) }, { status: "playing" }, "spec"],
    ["게임 중·관전도 참", { b1: person("가", "blue", 1, 0), s1: person("관", "spec", 2, 1) }, { status: "playing" }, "게임 중이고 관전자 자리(1명)도 찼어요."],
    ["연습모드 방", { b1: person("가", "blue", 1, 0) }, { mode: "practice" }, "혼자 연습 중인 방이라 들어갈 수 없어요."],
    ["AI 만 있는 방", { ai1: person("AI1", "blue", 1, 0, true) }, {}, "그런 방이 없어요. 코드를 확인해 주세요."]
  ];
  runAsync(CONNG, "방 입장: 인원이 적은 팀 → 같으면 블루 → 가득 차면 관전 순으로 배정하고, 연습방·없는 방·가득 찬 방은 이유를 안내하는가", async function (done) {
    var bad = [], code = "45678";
    for (var i = 0; i < JOIN_CASES.length; i++) {
      var c = JOIN_CASES[i];
      await withNet(roomTree(code, c[1], c[2]), async function (fake) {
        el("joinCode").value = "45-678 ";
        api.joinRoom();
        await waitFor(function () { return api.room() || startMessage(); }, 400);
        await sleep(10);
        var want = c[3], joined = !!api.room();
        if (want.length <= 5 && /^(red|blue|spec)$/.test(want)) {
          var rec = playersIn(fake, code)[me()];
          if (!joined || !rec || rec.team !== want) bad.push(c[0] + ": 배정 " + (rec && rec.team) + " (기대 " + want + ") " + startMessage());
          else if (rec.nickname !== "나" || rec.isAI !== false || (want !== "spec" && api.takenInMatch(playersIn(fake, code), want, rec.characterType, me()))) bad.push(c[0] + ": 기록 " + JSON.stringify(rec));
        } else if (joined || startMessage().indexOf(want) < 0) bad.push(c[0] + ": 안내 '" + startMessage() + "' (기대 '" + want + "')");
      });
    }
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : JOIN_CASES.length + "가지 입장 규칙이 모두 맞음");
  });

  runAsync(CONNG, "방 입장 입력 검사: 5자리가 아니거나 연결이 없으면 입장하지 않고 안내하는가", async function (done) {
    var bad = [];
    await withNet(roomTree("56789", { b1: person("가", "blue", 1, 0) }), async function (fake) {
      el("joinCode").value = "1234"; api.joinRoom();
      if (startMessage().indexOf("방 코드 5자리") < 0 || api.room()) bad.push("4자리 안내 '" + startMessage() + "'");
      el("joinCode").value = "abcde"; api.joinRoom();
      if (startMessage().indexOf("방 코드 5자리") < 0) bad.push("숫자가 아닌 코드 안내 '" + startMessage() + "'");
      el("joinCode").value = "56789"; api.setDb(null); api.joinRoom();
      if (startMessage().indexOf("온라인 연결을 할 수 없어요") < 0 || api.room()) bad.push("연결 없음 안내 '" + startMessage() + "'");
      api.setDb(fake);
      el("joinCode").value = "99999"; api.joinRoom();
      await waitFor(function () { return startMessage().indexOf("그런 방이 없어요") >= 0; }, 400);
      if (startMessage().indexOf("그런 방이 없어요") < 0 || el("btnJoin").disabled) bad.push("없는 방 안내 '" + startMessage() + "' 버튼 잠김 " + el("btnJoin").disabled);
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "자리수·숫자·연결·없는 방 안내와 버튼 복구");
  });

  runAsync(CONNG, "방장 순서(nextHost): 사람만, 블루 → 레드 → 관전 순으로, 같은 팀이면 먼저 들어온 사람인가", async function (done) {
    var bad = [], ps = { a: person("a", "blue", 5, 0), b: person("b", "blue", 2, 1), c: person("c", "red", 1, 2), d: person("d", "spec", 0, 3), e: person("e", "blue", 0, 4, true) };
    if (api.nextHost(ps) !== "b") bad.push("블루 먼저 " + api.nextHost(ps));
    delete ps.a; delete ps.b;
    if (api.nextHost(ps) !== "c") bad.push("블루가 없으면 레드 " + api.nextHost(ps));
    delete ps.c;
    if (api.nextHost(ps) !== "d") bad.push("관전뿐이면 관전 " + api.nextHost(ps));
    delete ps.d;
    if (api.nextHost(ps) !== undefined) bad.push("AI 만 있으면 없음 " + api.nextHost(ps));
    if (api.nextHost({ x: { nickname: "x", isAI: false, team: "zzz", joinedAt: 1 }, y: person("y", "spec", 9, 0) }) !== "y") bad.push("알 수 없는 팀은 맨 뒤");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "블루 > 레드 > 관전 > 기타, 같은 팀은 입장 순, AI 제외");
  });
  runAsync(CONNG, "방장 이어받기: 방장이 나가도 더 우선인 사람이 있으면 그대로 두고, 내가 다음 차례일 때만 방장을 이어받는가", async function (done) {
    var code = "11111", players = { H: person("방장", "blue", 1, 0), O: person("다른블루", "blue", 3, 1) };
    await withNet(roomTree(code, players), async function (fake) {
      var bad = [], mineRec = person("나", "red", 5, 2);
      fake.put(ROOMS + "/" + code + "/players/" + me(), mineRec);
      api.enterRoom(code);
      await waitFor(function () { return api.players()[me()] && api.room().hostLoaded; });
      if (api.room().host !== "H") bad.push("처음 방장 " + api.room().host);
      fake.put(ROOMS + "/" + code + "/players/H", null);
      await sleep(10);
      if (fake.get(ROOMS + "/" + code + "/hostPlayerId") !== "H") bad.push("블루 O 가 먼저인데 내가 방장을 가져감");
      fake.put(ROOMS + "/" + code + "/players/O", null);
      await waitFor(function () { return fake.get(ROOMS + "/" + code + "/hostPlayerId") === me(); }, 400);
      if (fake.get(ROOMS + "/" + code + "/hostPlayerId") !== me() || api.room().host !== me()) bad.push("마지막 사람인 내가 방장이 안 됨");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "H 이탈 → O 가 다음(변화 없음) → O 이탈 → 내가 방장");
    });
  });
  runAsync(CONNG, "방장이 AI 로 남은 방에 들어가면 사람인 내가 방장을 이어받는가", async function (done) {
    var code = "22222";
    await withNet(roomTree(code, { ai1: person("AI1", "blue", 1, 0, true) }, { hostPlayerId: "ai1" }), async function (fake) {
      fake.put(ROOMS + "/" + code + "/players/" + me(), person("나", "red", 5, 1));
      api.enterRoom(code);
      await waitFor(function () { return fake.get(ROOMS + "/" + code + "/hostPlayerId") === me(); }, 400);
      done(fake.get(ROOMS + "/" + code + "/hostPlayerId") === me() ? "pass" : "fail", "hostPlayerId = " + fake.get(ROOMS + "/" + code + "/hostPlayerId"));
    });
  });

  runAsync(CONNG, "방 나가기: 마지막 사람이면 방을 지우고, 아니면 방장이 나갈 때 다음 사람에게 넘기며, 화면·상태를 처음으로 되돌리는가", async function (done) {
    var bad = [];
    await withNet({}, async function (fake) {
      api.createRoom(); await waitFor(function () { return !!api.room(); });
      var code = api.room().code;
      api.leaveRoom();
      await waitFor(function () { return !fake.get(ROOMS + "/" + code); }, 400);
      if (fake.get(ROOMS + "/" + code)) bad.push("마지막 사람이 나갔는데 방이 남음");
      if (api.room() || api.screen() !== "start" || Object.keys(api.players()).length) bad.push("나간 뒤 상태 " + api.screen());
      if (fake.cancelled.map(String).filter(function (p) { return p.indexOf("players/" + me()) >= 0; }).length !== 1) bad.push("끊김 정리 취소가 안 됨");
      if (sessionStorage.getItem(api.RESUME_KEY)) bad.push("이어하기 기록이 남음");
    });
    await withNet(roomTree("33333", { H: person("방장", "blue", 1, 0), O: person("다음", "red", 2, 1) }), async function (fake) {
      fake.put(ROOMS + "/33333/players/" + me(), person("나", "blue", 3, 2));
      fake.put(ROOMS + "/33333/hostPlayerId", me());
      api.enterRoom("33333"); await waitFor(function () { return api.players()[me()]; });
      api.leaveRoom();
      await waitFor(function () { return fake.get(ROOMS + "/33333/hostPlayerId") === "H"; }, 400);
      if (fake.get(ROOMS + "/33333/hostPlayerId") !== "H" || playersIn(fake, "33333")[me()]) bad.push("방장이 나갔는데 다음 사람(블루 H)에게 안 넘어감: " + fake.get(ROOMS + "/33333/hostPlayerId"));
    });
    await withNet(roomTree("44444", { H: person("방장", "blue", 1, 0) }), async function (fake) {
      fake.put(ROOMS + "/44444/players/" + me(), person("나", "red", 3, 1));
      api.enterRoom("44444"); await waitFor(function () { return api.players()[me()]; });
      api.leaveRoom(); await sleep(20);
      if (fake.get(ROOMS + "/44444/hostPlayerId") !== "H" || playersIn(fake, "44444")[me()]) bad.push("방장이 아닌 내가 나갔는데 방장이 바뀜");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "마지막 사람 → 방 삭제, 방장 이탈 → 다음 사람, 일반 이탈 → 방장 유지");
  });
  runAsync(CONNG, "방이 사라지면(방장이 지움) '방이 종료되었어요' 안내와 함께 첫 화면으로 돌아오는가", async function (done) {
    await withNet(roomTree("55555", { H: person("방장", "blue", 1, 0) }), async function (fake) {
      fake.put(ROOMS + "/55555/players/" + me(), person("나", "red", 3, 1));
      api.enterRoom("55555"); await waitFor(function () { return api.players()[me()]; });
      fake.put(ROOMS + "/55555", null);
      await waitFor(function () { return !api.room(); }, 400);
      var bad = [];
      if (api.room() || api.screen() !== "start" || startMessage().indexOf("방이 종료되었어요") < 0) bad.push("화면 " + api.screen() + " 안내 '" + startMessage() + "'");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "종료 안내 + 첫 화면");
    });
  });
  runAsync(CONNG, "연결이 잠깐 끊겨 내 기록이 지워지면 같은 기록으로 다시 들어가고 끊김 정리를 다시 등록하는가", async function (done) {
    await withNet(roomTree("66666", { H: person("방장", "blue", 1, 0) }), async function (fake) {
      var mine = person("나", "red", 3, 1), bad = [];
      fake.put(ROOMS + "/66666/players/" + me(), mine);
      api.enterRoom("66666"); await waitFor(function () { return api.players()[me()]; });
      var armed = fake.disconnects.length;
      fake.put(ROOMS + "/66666/players/" + me(), null);
      await waitFor(function () { return playersIn(fake, "66666")[me()]; }, 600);
      var back = playersIn(fake, "66666")[me()];
      if (!back || JSON.stringify(back) !== JSON.stringify(mine)) bad.push("다시 들어가지 못함: " + JSON.stringify(back));
      if (!api.room() || api.screen() !== "lobby") bad.push("방에서 쫓겨남 " + api.screen());
      await sleep(10);
      if (fake.disconnects.length <= armed) bad.push("끊김 정리가 다시 등록되지 않음 (" + fake.disconnects.length + " < " + armed + ")");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "같은 기록으로 복귀, 방 유지");
    });
  });

  runAsync(CONNG, "방 상태 구독: 방 설정·방장·참가자 변화가 반영되고 상태에 따라 화면(로비·드래프트·게임)이 바뀌는가", async function (done) {
    var code = "77777";
    await withNet(roomTree(code, { H: person("방장", "blue", 1, 0) }), async function (fake) {
      var bad = [], base = ROOMS + "/" + code + "/";
      fake.put(base + "players/" + me(), person("나", "red", 3, 1));
      api.enterRoom(code); await waitFor(function () { return api.players()[me()]; });
      var room = api.room();
      fake.put(base + "mode", "cup"); if (room.mode !== "cup") bad.push("모드 반영 " + room.mode);
      fake.put(base + "map", "river"); if (room.map !== "river") bad.push("맵 반영 " + room.map);
      fake.put(base + "hostPlayerId", me()); if (room.host !== me()) bad.push("방장 반영 " + room.host);
      fake.put(base + "players/X", person("새", "blue", 9, 3)); if (!api.players().X) bad.push("참가자 추가 반영");
      fake.put(base + "players/X/team", "red"); if (api.players().X.team !== "red") bad.push("참가자 변경 반영");
      fake.put(base + "players/X", null); if (api.players().X) bad.push("참가자 삭제 반영");
      var seen = [];
      ["draft", "lobby", "countdown", "playing", "ended"].forEach(function (st) { fake.put(base + "status", st); seen.push(st + ":" + api.screen()); });
      var want = "draft:draft lobby:lobby countdown:game playing:game ended:game";
      if (seen.join(" ") !== want) bad.push("화면 전이 " + seen.join(" ") + " (기대 " + want + ")");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "모드·맵·방장·참가자 반영, 상태별 화면 " + seen.join(" "));
    });
  });

  runAsync(CONNG, "이어하기 저장: 방에 있을 때만 코드·내 아이디·내 기록을 저장하고, 3분이 지나거나 깨진 기록은 읽지 않는가", async function (done) {
    await withNet(roomTree("88888", { H: person("방장", "blue", 1, 0) }), async function (fake) {
      var bad = [];
      api.saveResume();
      if (sessionStorage.getItem(api.RESUME_KEY)) bad.push("방 밖에서 저장됨");
      fake.put(ROOMS + "/88888/players/" + me(), person("나", "red", 3, 1));
      api.enterRoom("88888"); await waitFor(function () { return api.players()[me()]; });
      api.saveResume();
      var saved = api.readResume();
      if (!saved || saved.code !== "88888" || saved.id !== me() || saved.me.team !== "red" || Math.abs(saved.at - Date.now()) > 2000) bad.push("저장 내용 " + JSON.stringify(saved));
      var raw = JSON.parse(sessionStorage.getItem(api.RESUME_KEY));
      raw.at = Date.now() - api.RESUME_MS - 1; sessionStorage.setItem(api.RESUME_KEY, JSON.stringify(raw));
      if (api.readResume()) bad.push("오래된 기록을 읽음");
      sessionStorage.setItem(api.RESUME_KEY, "{깨짐"); if (api.readResume()) bad.push("깨진 기록을 읽음");
      sessionStorage.setItem(api.RESUME_KEY, JSON.stringify({ code: "1", at: Date.now() })); if (api.readResume()) bad.push("필드가 빠진 기록을 읽음");
      api.clearResume(); if (sessionStorage.getItem(api.RESUME_KEY)) bad.push("지우기");
      done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "방 안에서만 저장, 만료·깨짐·누락 거부, 지우기");
    });
  });
  runAsync(CONNG, "이어하기 팀 정하기(resumeTeam): 로비가 아니면 그대로, 팀이 안 찼으면 그대로, 찼으면 관전, 관전도 차면 못 들어가는가", async function (done) {
    var bad = [], mineRed = person("나", "red", 5, 0), ps = {};
    ps[me()] = mineRed;
    var teamFull = function (team, n) { for (var i = 0; i < n; i++) ps[team + i] = person(team + i, team, i, i + 1); };
    if (api.resumeTeam(mineRed, ps, "playing") !== "red") bad.push("게임 중에는 그대로");
    if (api.resumeTeam(person("관", "spec", 1, 0), ps, "lobby") !== "spec") bad.push("관전은 그대로");
    teamFull("red", 2);
    if (api.resumeTeam(mineRed, ps, "lobby") !== "red") bad.push("레드 2명 + 나 → 그대로");
    teamFull("red", 3);
    if (api.resumeTeam(mineRed, ps, "lobby") !== "spec") bad.push("레드가 찼으면 관전으로");
    ps.spec0 = person("관", "spec", 9, 9);
    if (api.resumeTeam(mineRed, ps, "lobby") !== null) bad.push("관전도 차면 null");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "5가지 경우가 모두 맞음");
  });
  runAsync(CONNG, "이어하기 입장(tryResume): 저장된 방이 있으면 같은 아이디·팀으로 다시 들어가고, 방이 없거나 가득 차면 기록을 지우고 안내하는가", async function (done) {
    var bad = [], mine = person("나", "red", 5, 1);
    function save(code) { sessionStorage.setItem(api.RESUME_KEY, JSON.stringify({ code: code, id: "resumeMe", me: mine, at: Date.now() })); }
    await withNet(roomTree("90001", { H: person("방장", "blue", 1, 0) }), async function (fake) {
      save("90001"); api.tryResume();
      await waitFor(function () { return api.room(); }, 500);
      var rec = playersIn(fake, "90001").resumeMe;
      if (!api.room() || api.room().code !== "90001" || !rec || rec.team !== "red" || !api.players().resumeMe) bad.push("다시 들어가지 못함 " + JSON.stringify(rec));
      api.leaveRoom();
    });
    await withNet({}, async function () {
      save("90002"); api.tryResume();
      await waitFor(function () { return !sessionStorage.getItem(api.RESUME_KEY); }, 500);
      if (api.room() || sessionStorage.getItem(api.RESUME_KEY)) bad.push("없는 방인데 기록이 남음");
    });
    var full = { b0: person("a", "blue", 1, 0), b1: person("b", "blue", 2, 1), b2: person("c", "blue", 3, 2), r0: person("d", "red", 4, 3), r1: person("e", "red", 5, 4), r2: person("f", "red", 6, 5), s0: person("g", "spec", 7, 6) };
    await withNet(roomTree("90003", full), async function () {
      save("90003"); api.tryResume();
      await waitFor(function () { return startMessage().indexOf("가득 차서") >= 0; }, 500);
      if (api.room() || startMessage().indexOf("이전 방이 가득 차서") < 0 || sessionStorage.getItem(api.RESUME_KEY)) bad.push("가득 찬 방 안내 '" + startMessage() + "'");
    });
    await withNet({}, async function () {
      api.setDb(null); save("90004"); api.tryResume();
      if (sessionStorage.getItem(api.RESUME_KEY)) bad.push("연결이 없는데 기록이 남음");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "복귀·없는 방·가득 참·연결 없음 4가지 처리");
  });

  async function lobbyOf(fake, code, others, me0, over) {
    var players = Object.assign({}, others), mineKey = api.myId;
    players[mineKey] = me0;
    fake.put(ROOMS + "/" + code, roomTree(code, players, Object.assign({ hostPlayerId: me() }, over || {})).teambattle.rooms[code]);
    api.enterRoom(code);
    await waitFor(function () { return api.players()[mineKey] && api.room().hostLoaded && api.screen() === "lobby"; });
    await sleep(5);
    return ROOMS + "/" + code + "/";
  }

  runAsync(ROSTERG, "자리 규칙 함수: 정원·인원 세기·같은 캐릭터 금지(관전 제외)·비어 있는 캐릭터 고르기·이동 가능 판정이 맞는가", async function (done) {
    var bad = [], L = HUMAN_CHARS, ps = { a: person("a", "blue", 1, 0), b: person("b", "red", 2, 1), s: person("s", "spec", 3, 2) };
    if (api.capOf("blue") !== api.TEAM_MAX || api.capOf("red") !== 3 || api.capOf("spec") !== api.SPEC_MAX) bad.push("정원");
    if (api.countIn(ps, "blue") !== 1 || api.countIn(ps, "blue", "a") !== 0 || api.countIn(ps, "none") !== 0) bad.push("인원 세기");
    if (!api.isPlayingTeam("blue") || !api.isPlayingTeam("red") || api.isPlayingTeam("spec") || api.isPlayingTeam(undefined)) bad.push("경기 팀 판정");
    if (!api.takenInMatch(ps, "blue", L[1], "a")) bad.push("레드가 고른 캐릭터는 블루도 못 고름");
    if (api.takenInMatch(ps, "blue", L[1], "b")) bad.push("본인 제외");
    if (api.takenInMatch(ps, "blue", L[2], "a")) bad.push("관전이 고른 캐릭터는 막지 않음");
    if (api.takenInMatch(ps, "spec", L[0], "x")) bad.push("관전 팀은 아무 캐릭터나");
    if (api.freeCharOn({}, "blue", "x") !== api.FALLBACK_CHAR) bad.push("비었으면 기본 캐릭터");
    var taken = {}; taken.t1 = { team: "blue", characterType: api.FALLBACK_CHAR };
    var next = api.freeCharOn(taken, "red", "x");
    if (next === api.FALLBACK_CHAR || next !== L.filter(function (c) { return c !== api.FALLBACK_CHAR; })[0]) bad.push("기본 캐릭터가 있으면 목록 순서 첫 번째 " + next);
    var all = {}; L.forEach(function (c, i) { all["z" + i] = { team: i % 2 ? "red" : "blue", characterType: c }; });
    if (api.freeCharOn(all, "blue", "x") !== api.FALLBACK_CHAR) bad.push("모두 찼으면 기본 캐릭터");
    if (api.onlyOneMsg(L[0]).indexOf(api.CHARS[L[0]].name) < 0) bad.push("안내문에 캐릭터 이름");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "정원·세기·경기 팀·중복 금지·빈 캐릭터 11가지 확인");
  });
  runAsync(ROSTERG, "팀 이동(pickTeam): 자리가 있고 로비일 때만 옮기고, 이미 다른 팀이 고른 캐릭터면 비어 있는 캐릭터로 바꾸며 안내하는가", async function (done) {
    var bad = [], code = "10101";
    await withNet({}, async function (fake) {
      var others = { r1: person("레드", "red", 1, 0), r2: person("레드2", "red", 2, 3) };
      var base = await lobbyOf(fake, code, others, person("나", "blue", 3, 0));
      if (api.canMoveTo("blue")) bad.push("같은 팀으로는 이동 불가");
      api.pickTeam("red"); await sleep(20);
      var rec = playersIn(fake, code)[me()];
      if (rec.team !== "red") bad.push("레드로 안 옮겨짐");
      if (rec.characterType === HUMAN_CHARS[0] || api.takenInMatch(playersIn(fake, code), "red", rec.characterType, me())) bad.push("겹친 캐릭터를 안 바꿈: " + rec.characterType);
      if (el("startHint").textContent.indexOf("바꿨어요") < 0) bad.push("바꿈 안내 '" + el("startHint").textContent + "'");
      fake.put(base + "players/b1", person("블1", "blue", 5, 6)); fake.put(base + "players/b2", person("블2", "blue", 6, 7)); fake.put(base + "players/b3", person("블3", "blue", 7, 8));
      await sleep(5);
      if (api.canMoveTo("blue")) bad.push("블루가 가득인데 이동 가능");
      api.pickTeam("blue"); await sleep(10);
      if (playersIn(fake, code)[me()].team !== "red") bad.push("가득 찬 팀으로 옮겨짐");
      fake.put(base + "players/s1", person("관", "spec", 8, 9));
      await sleep(5);
      if (api.canMoveTo("spec")) bad.push("관전이 찼는데 이동 가능");
      fake.put(base + "status", "playing"); await sleep(5);
      fake.put(base + "players/b3", null); await sleep(5);
      if (api.canMoveTo("blue")) bad.push("게임 중에는 이동 불가");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "이동·캐릭터 교체 안내·가득 참·관전 정원·게임 중 잠금");
  });
  runAsync(ROSTERG, "캐릭터 고르기(pickChar): 이미 다른 사람이 고른 캐릭터는 못 고르고 안내하며, 빈 캐릭터와 관전 중에는 고를 수 있는가", async function (done) {
    var bad = [], code = "20202";
    await withNet({}, async function (fake) {
      var L = HUMAN_CHARS, base = await lobbyOf(fake, code, { r1: person("레드", "red", 1, 1) }, person("나", "blue", 3, 0));
      api.pickChar(L[1]); await sleep(10);
      if (playersIn(fake, code)[me()].characterType !== L[0]) bad.push("남이 고른 캐릭터로 바뀜");
      if (el("startHint").textContent.indexOf("이미 다른 사람이 고른 캐릭터") < 0) bad.push("안내 '" + el("startHint").textContent + "'");
      api.pickChar(L[2]); await sleep(10);
      if (playersIn(fake, code)[me()].characterType !== L[2]) bad.push("빈 캐릭터를 못 고름");
      fake.put(base + "players/" + me() + "/team", "spec"); await sleep(5);
      api.pickChar(L[1]); await sleep(10);
      if (playersIn(fake, code)[me()].characterType !== L[1]) bad.push("관전은 겹쳐도 고를 수 있어야 함");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "겹침 거부+안내, 빈 캐릭터 선택, 관전 예외");
  });
  runAsync(ROSTERG, "게임 방식·맵 고르기: 방장·로비에서만 바뀌고, 연습모드는 혼자일 때만 되며 AI 를 치우고 맵을 연습장으로 바꾸는가", async function (done) {
    var bad = [], code = "30303";
    await withNet({}, async function (fake) {
      var base = await lobbyOf(fake, code, { r1: person("레드", "red", 1, 1) }, person("나", "blue", 3, 0));
      var mode = function () { return fake.get(base + "mode"); }, map = function () { return fake.get(base + "map"); };
      api.setMode("cup"); await sleep(5);
      if (mode() !== "cup") bad.push("대회모드로 안 바뀜");
      var writes = fake.writes.length; api.setMode("cup"); if (fake.writes.length !== writes) bad.push("같은 모드를 또 씀");
      api.setMapChoice("river"); await sleep(5); if (map() !== "river") bad.push("맵 안 바뀜");
      writes = fake.writes.length; api.setMapChoice("river"); if (fake.writes.length !== writes) bad.push("같은 맵을 또 씀");
      api.setMode("practice"); await sleep(5);
      if (mode() === "practice" || el("startHint").textContent.indexOf("혼자 있을 때만") < 0) bad.push("둘이 있는데 연습모드가 됨 / 안내 '" + el("startHint").textContent + "'");
      fake.put(base + "players/r1", null); fake.put(base + "players/ai1", person("AI1", "red", 4, 2, true)); fake.put(base + "players/" + me() + "/team", "spec"); await sleep(5);
      api.setMode("practice"); await sleep(10);
      var ps = playersIn(fake, code);
      if (mode() !== "practice" || map() !== "practice" || ps.ai1 || ps[me()].team !== "blue") bad.push("연습모드 전환 결과 " + JSON.stringify([mode(), map(), !!ps.ai1, ps[me()].team]));
      api.setMode("pvp"); await sleep(5);
      if (mode() !== "pvp" || map() !== "forest") bad.push("연습모드를 나오면 맵이 숲속으로 돌아와야 함 " + map());
      fake.put(base + "players/h2", person("방장2", "red", 9, 3)); fake.put(base + "hostPlayerId", "h2"); await sleep(5);
      api.setMode("cup"); api.setMapChoice("dungeon"); await sleep(5);
      if (mode() !== "pvp" || map() !== "forest") bad.push("방장이 아닌데 바뀜");
      fake.put(base + "hostPlayerId", me()); fake.put(base + "status", "playing"); await sleep(5);
      api.setMode("cup"); api.setMapChoice("dungeon"); await sleep(5);
      if (mode() !== "pvp" || map() !== "forest") bad.push("게임 중에 바뀜");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "모드·맵 변경, 연습모드 조건·정리, 방장·로비 제한");
  });
  runAsync(ROSTERG, "AI 추가·삭제: 방장이 팀 정원까지만 추가하고, 이름은 비어 있는 AI번호를, 캐릭터는 겹치지 않게 고르며, 사람은 삭제되지 않는가", async function (done) {
    var bad = [], code = "40404";
    await withNet({}, async function (fake) {
      var base = await lobbyOf(fake, code, { r1: person("레드", "red", 1, 0) }, person("나", "blue", 3, 1));
      for (var i = 0; i < 4; i++) { api.addAi("red"); await sleep(3); }
      var ai = function () { var ps = playersIn(fake, code); return Object.keys(ps).filter(function (id) { return ps[id].isAI; }); };
      if (ai().length !== 2) bad.push("레드 정원(사람 1 + AI " + ai().length + ")을 못 지킴");
      var ps = playersIn(fake, code), names = ai().map(function (id) { return ps[id].nickname; }).sort().join();
      if (names !== "AI1,AI2") bad.push("이름 " + names);
      var dup = ai().some(function (id) { return api.takenInMatch(ps, "red", ps[id].characterType, id); });
      if (dup) bad.push("AI 캐릭터가 겹침");
      var first = ai().filter(function (id) { return ps[id].nickname === "AI1"; })[0];
      api.removeAi(first); await sleep(5);
      api.addAi("red"); await sleep(5);
      ps = playersIn(fake, code);
      if (ai().map(function (id) { return ps[id].nickname; }).sort().join() !== "AI1,AI2") bad.push("지운 번호 AI1 을 다시 쓰지 않음");
      api.removeAi("r1"); await sleep(5);
      if (!playersIn(fake, code).r1) bad.push("사람이 삭제됨");
      fake.put(base + "hostPlayerId", "r1"); await sleep(5);
      var count = ai().length; api.addAi("blue"); await sleep(5);
      if (ai().length !== count) bad.push("방장이 아닌데 AI 추가");
      api.removeAi(ai()[0]); await sleep(5);
      if (ai().length !== count) bad.push("방장이 아닌데 AI 삭제");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "정원·이름·중복 없음·번호 재사용·사람 보호·방장 제한");
  });
  runAsync(ROSTERG, "팀 바꾸기 버튼: 방장이 누르면 블루·레드 전원이 서로 바뀌고 관전은 그대로이며 안내가 뜨는가", async function (done) {
    var bad = [], code = "50505";
    await withNet({}, async function (fake) {
      var base = await lobbyOf(fake, code, { r1: person("레드", "red", 1, 1), s1: person("관", "spec", 2, 2) }, person("나", "blue", 3, 0));
      el("btnSwapTeams").click(); await sleep(15);
      var ps = playersIn(fake, code);
      if (ps[me()].team !== "red" || ps.r1.team !== "blue" || ps.s1.team !== "spec") bad.push("바꾼 결과 " + [ps[me()].team, ps.r1.team, ps.s1.team].join());
      if (el("startHint").textContent.indexOf("블루팀과 레드팀을 바꿨어요") < 0) bad.push("안내 '" + el("startHint").textContent + "'");
      fake.put(base + "hostPlayerId", "r1"); await sleep(5);
      el("btnSwapTeams").click(); await sleep(10);
      if (playersIn(fake, code)[me()].team !== "red") bad.push("방장이 아닌데 바뀜");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "전원 교체·관전 유지·안내·방장 제한");
  });
  runAsync(ROSTERG, "맵 고르기 목록(mapChoices)·무작위 맵(resolveArena)·모드 이름이 맞는가", async function (done) {
    var bad = [], ids = function (l) { return l.map(function (m) { return m.id; }).join(); }, real = Math.random;
    if (ids(api.mapChoices("pvp")) !== api.MAP_IDS.concat(["random"]).join()) bad.push("일반모드 목록 " + ids(api.mapChoices("pvp")));
    if (ids(api.mapChoices("practice")) !== api.MAP_IDS.concat(["practice"]).join()) bad.push("연습모드 목록");
    if (api.resolveArena("river") !== "river" || api.resolveArena("practice") !== "practice") bad.push("정해진 맵은 그대로");
    try {
      Math.random = function () { return 0.99; }; if (api.resolveArena("random") !== api.MAP_IDS[api.MAP_IDS.length - 1]) bad.push("무작위 끝");
      Math.random = function () { return 0; }; if (api.resolveArena("random") !== api.MAP_IDS[0] || api.resolveArena(undefined) !== api.MAP_IDS[0]) bad.push("무작위 처음");
    } finally { Math.random = real; }
    if (api.modeName("pvp") !== "일반모드" || api.modeName("practice") !== "연습모드" || api.modeName("cup") !== "대회모드" || api.modeName(null) !== "모드 선택 중") bad.push("모드 이름");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "목록·무작위·모드 이름 확인");
  });

  runAsync(LOBBYG, "로비 화면(방장): 시작 버튼은 양 팀에 사람이 있어야 켜지고, 인원 안내·자리 버튼·모드 버튼이 방장 기준으로 보이는가", async function (done) {
    var bad = [], code = "60606";
    await withNet({}, async function (fake) {
      var base = await lobbyOf(fake, code, {}, person("나", "blue", 3, 0));
      api.renderLobby();
      if (el("btnStart").hidden || !el("btnStart").disabled || el("startHint").textContent.indexOf("양 팀에 1명 이상") < 0) bad.push("혼자일 때 시작 버튼 " + el("btnStart").hidden + el("btnStart").disabled + " '" + el("startHint").textContent + "'");
      if (el("listBlue").textContent.indexOf("나") < 0 || el("listBlue").innerHTML.indexOf("👑") < 0) bad.push("블루 목록에 내 이름·방장 표시");
      if (el("listRed").querySelectorAll("[data-ai-add=red]").length !== 3) bad.push("레드 빈 자리 AI 추가 버튼 " + el("listRed").querySelectorAll("[data-ai-add=red]").length);
      if (!el("btnJoinBlue").hidden || el("btnJoinRed").hidden || el("btnJoinRed").disabled || el("btnSpec").hidden) bad.push("팀 이동 버튼 표시");
      var modeOn = el("modeBtns").querySelector(".on");
      if (!modeOn || modeOn.getAttribute("data-id") !== "pvp" || el("modeBtns").querySelector("[disabled]")) bad.push("모드 버튼 표시");
      if (el("lobbyMode").textContent !== "일반모드 · 숲속 공터") bad.push("방식 표시 '" + el("lobbyMode").textContent + "'");
      api.addAi("red"); await sleep(10); api.renderLobby();
      if (el("btnStart").disabled || el("startHint").textContent !== "블루 1 vs 레드 1") bad.push("양 팀 1명씩 '" + el("startHint").textContent + "' 잠김 " + el("btnStart").disabled);
      api.addAi("red"); await sleep(10); api.renderLobby();
      if (el("btnStart").disabled || el("startHint").textContent.indexOf("인원이 달라요 (블루 1 vs 레드 2)") < 0) bad.push("인원 다름 안내 '" + el("startHint").textContent + "'");
      if (el("listRed").innerHTML.indexOf("data-ai-del") < 0) bad.push("AI 빼기 버튼");
      fake.put(base + "players/" + me() + "/team", "spec"); await sleep(10); api.renderLobby();
      if (el("btnJoinBlue").hidden || el("btnJoinRed").hidden || !el("btnSpec").hidden) bad.push("관전일 때 버튼");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "시작 조건·인원 안내·AI 버튼·이동 버튼·모드 버튼");
  });
  runAsync(LOBBYG, "로비 화면(방장이 아닐 때): 시작 버튼 숨김, 모드·AI 버튼 잠김, 시작을 기다린다는 안내가 붙는가", async function (done) {
    var bad = [], code = "70707";
    await withNet({}, async function (fake) {
      await lobbyOf(fake, code, { H: person("방장", "blue", 1, 1), r1: person("레드", "red", 2, 2) }, person("나", "blue", 3, 0), { hostPlayerId: "H" });
      api.renderLobby();
      if (!el("btnStart").hidden) bad.push("방장이 아닌데 시작 버튼 보임");
      if (el("startHint").textContent.indexOf("방장이 시작하기를 기다리는 중… ") !== 0) bad.push("안내 '" + el("startHint").textContent + "'");
      if (el("modeBtns").querySelectorAll(".modeBtn:not([disabled])").length) bad.push("모드 버튼이 안 잠김");
      if (el("listBlue").querySelector("[data-ai-add]") || el("listRed").querySelector("[data-ai-add]")) bad.push("AI 추가 버튼이 보임");
      if (!el("btnSwapTeams").hidden) bad.push("팀 바꾸기 버튼이 보임");
      if (el("listBlue").innerHTML.indexOf("👑") < 0 || el("listBlue").innerHTML.indexOf("방장") < 0) bad.push("방장 표시");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "시작·AI·팀 바꾸기 버튼 숨김/잠김, 안내, 방장 표시");
  });
  runAsync(LOBBYG, "로비 화면: 같은 캐릭터를 사람이 겹쳐 고르면(AI 끼리는 제외) 시작을 막고 안내, 연습·대회모드는 모드에 맞게 표시하는가", async function (done) {
    var bad = [], code = "80808";
    await withNet({}, async function (fake) {
      var base = await lobbyOf(fake, code, { r1: person("레드", "red", 2, 0) }, person("나", "blue", 3, 0));
      api.renderLobby();
      if (!el("btnStart").disabled || el("startHint").textContent.indexOf("같은 캐릭터(") < 0) bad.push("겹침 안내 '" + el("startHint").textContent + "'");
      fake.put(base + "players/r1", person("AI", "red", 2, 0, true)); await sleep(10); api.renderLobby();
      if (!el("btnStart").disabled) bad.push("사람과 AI 가 겹치면 사람 쪽이 막혀야 함");
      fake.put(base + "players/" + me() + "/characterType", HUMAN_CHARS[5]); fake.put(base + "players/ai2", person("AI2", "red", 3, 0, true)); await sleep(10); api.renderLobby();
      if (el("btnStart").disabled) bad.push("AI 끼리 겹치는 건 막으면 안 됨: '" + el("startHint").textContent + "'");
      fake.put(base + "mode", "cup"); fake.put(base + "players/r1/isAI", false); await sleep(10); api.renderLobby();
      if (el("btnStart").disabled || el("listBlue").innerHTML.indexOf('class="ch"') >= 0 || el("charHint").textContent.indexOf("대회모드에서는") < 0) bad.push("대회모드 표시(캐릭터 이름 숨김·안내) 시작 잠김 " + el("btnStart").disabled);
      fake.put(base + "mode", "practice"); fake.put(base + "map", "practice"); await sleep(10); api.renderLobby();
      if (el("btnStart").disabled || el("startHint").textContent.indexOf("연습 봇을 상대로") < 0 || el("listSpec").textContent.indexOf("(0/0)") < 0 || !el("btnSpec").disabled) bad.push("연습모드 표시 '" + el("startHint").textContent + "' " + el("listSpec").textContent);
      fake.put(base + "players/" + me() + "/team", "spec"); await sleep(10); api.renderLobby();
      if (!el("btnStart").disabled || el("startHint").textContent.indexOf("블루팀이나 레드팀으로") < 0) bad.push("연습모드에서 관전이면 안내 '" + el("startHint").textContent + "'");
      fake.put(base + "mode", null); await sleep(10); api.renderLobby();
      if (!el("btnStart").disabled || el("startHint").textContent.indexOf("게임 방식을 먼저") < 0) bad.push("모드 없음 안내 '" + el("startHint").textContent + "'");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "겹침·AI 예외·대회·연습·모드 없음 표시");
  });
  runAsync(LOBBYG, "로비 화면: 팀·관전 정원이 차면 이동 버튼이 잠기고, 관전자 목록과 일시 안내(flashHint)가 표시되는가", async function (done) {
    var bad = [], code = "91919";
    await withNet({}, async function (fake) {
      var others = { b1: person("블1", "blue", 1, 1), b2: person("블2", "blue", 2, 2), b3: person("블3", "blue", 3, 3), s1: person("관전러", "spec", 4, 4) };
      await lobbyOf(fake, code, others, person("나", "red", 5, 0), { hostPlayerId: "b1" });
      api.renderLobby();
      if (!el("btnJoinBlue").disabled || el("btnJoinRed").hidden === false || !el("btnSpec").disabled) bad.push("가득 찬 팀·관전 버튼 잠금 " + el("btnJoinBlue").disabled + el("btnSpec").disabled);
      if (el("listSpec").textContent.indexOf("관전러") < 0 || el("listSpec").textContent.indexOf("(1/1)") < 0) bad.push("관전자 목록 '" + el("listSpec").textContent + "'");
      api.flashHint("임시 안내입니다");
      if (el("startHint").textContent !== "임시 안내입니다") bad.push("일시 안내 '" + el("startHint").textContent + "'");
    });
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "정원 잠금·관전자 목록·일시 안내");
  });

  var MAP_CASES = api.MAP_IDS.concat(["practice"]);
  MAP_CASES.forEach(function (id) {
    run(MAPG, "맵 데이터 '" + id + "': 가로 16×세로 25 대칭, 장애물·물·다리·덤불 목록이 맵 글자와 맞고 출발 자리가 비어 있는가", function (done) {
      api.loadMapData(id);
      var bad = [], rows = api.mapRows(), cols = rows[0].length, half = api.MAPS[id].blueHalf;
      if (cols !== 16 || rows.length !== half.length * 2 - 1) bad.push("크기 " + cols + "×" + rows.length);
      rows.forEach(function (row, r) {
        if (row.length !== cols) bad.push((r + 1) + "행 길이 " + row.length);
        if (row !== rows[rows.length - 1 - r].split("").reverse().join("")) bad.push((r + 1) + "행이 점대칭이 아님");
      });
      var o = api.obstacles();
      var blocking = 0; rows.forEach(function (row) { for (var c = 0; c < row.length; c++) if ("#xo".indexOf(row.charAt(c)) >= 0) blocking++; });
      var areaOf = function (list) { return list.reduce(function (s, q) { return s + q.w * q.h; }, 0); };
      if (areaOf(o.walls) !== blocking * api.TILE * api.TILE) bad.push("벽 면적이 글자 수와 다름 " + areaOf(o.walls) + " vs " + blocking * api.TILE * api.TILE);
      var water = 0; rows.forEach(function (row) { for (var c = 0; c < row.length; c++) if (row.charAt(c) === "~") water++; });
      if (areaOf(o.water) !== water * api.TILE * api.TILE) bad.push("물 면적");
      var bridge = 0; rows.forEach(function (row) { for (var c = 0; c < row.length; c++) if (row.charAt(c) === "=") bridge++; });
      if (areaOf(api.bridges()) !== bridge * api.TILE * api.TILE) bad.push("다리 면적");
      var bush = 0; rows.forEach(function (row) { for (var c = 0; c < row.length; c++) if (row.charAt(c) === '"') bush++; });
      var ids = api.bushIds(), tagged = 0; for (var i = 0; i < ids.length; i++) if (ids[i] !== undefined) tagged++;
      var tiles = [].concat.apply([], api.bushTiles()).length;
      if (tagged !== bush || tiles !== bush) bad.push("덤불 칸 수 글자 " + bush + " / 표시 " + tagged + " / 묶음 " + tiles);
      var team;
      ["blue", "red"].forEach(function (t) {
        [1, 2, 3].forEach(function (slot) {
          var sp = api.spawnOf(t, slot, id), why = blockedAt(sp.x, sp.y);
          if (why) bad.push(t + " " + slot + "번 출발 자리가 " + why);
        });
      });
      if (api.tileX(0) !== api.BOUND.l + api.TILE / 2 || api.tileY(2) !== api.BOUND.t + 2.5 * api.TILE) bad.push("칸 좌표 공식");
      var again = JSON.stringify(api.obstacles()); api.loadMapData(id);
      if (JSON.stringify(api.obstacles()) !== again) bad.push("같은 맵을 다시 읽으면 결과가 달라짐");
      done(bad.length ? "fail" : "pass", bad.length ? bad.slice(0, 4).join(" / ") : "벽 " + o.walls.length + "·물 " + o.water.length + "·덤불 " + bush + "칸, 출발 자리 6곳 비어 있음");
    });
  });
  run(MAPG, "맵 데이터: 없는 맵 이름은 숲속 공터로 읽고, 반쪽 지도 합치기(fullMap)는 가운데 줄을 한 번만 쓰는가", function (done) {
    api.loadMapData("없는맵");
    var bad = [];
    if (api.currentMap() !== "forest") bad.push("없는 맵 → " + api.currentMap());
    var full = api.fullMap(["aa", "bc", "de"]);
    if (full.join("|") !== "aa|bc|de|cb|aa") bad.push("합친 결과 " + full.join("|"));
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(" / ") : "숲속 공터로 대체, 합치기 aa|bc|de|cb|aa");
  });
  results.pending = Promise.resolve().then(function () { api.finish(api.currentMap()); }).then(drainAsync);
  return results;
}

var STATUS_LABEL = { pass: "통과", fail: "문제", info: "확인 필요" };
var PANEL_CSS =
  "#tbTest{position:fixed;inset:0;z-index:2147482000;overflow-y:auto;background:rgba(8,14,11,.96);color:#EEF2EE;font-family:var(--sg-font);padding:54px 16px 32px}" +
  "#tbTest .box{max-width:1000px;margin:0 auto}" +
  "#tbTest h2{font-size:24px;font-weight:800;margin-bottom:6px}" +
  "#tbTest .sum{font-size:15px;color:#A3B0A6;margin-bottom:14px}" +
  "#tbTest .btns{display:flex;gap:8px;margin-bottom:16px}" +
  "#tbTest button{height:36px;padding:0 14px;border-radius:6px;border:1px solid rgba(255,255,255,.32);background:rgba(255,255,255,.07);color:#EEF2EE;font:inherit;font-size:14px;font-weight:700;cursor:pointer}" +
  "#tbTest h3{font-size:17px;font-weight:800;margin:18px 0 8px;padding-left:8px;border-left:3px solid #D97B4F}" +
  "#tbTest .row{display:grid;grid-template-columns:86px 1fr;gap:4px 12px;padding:10px 12px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(16,24,19,.82);margin-bottom:6px}" +
  "#tbTest .tag{align-self:start;text-align:center;font-size:13px;font-weight:800;border-radius:4px;padding:3px 0}" +
  "#tbTest .pass .tag{background:rgba(62,142,94,.35);color:#9BE3B5}" +
  "#tbTest .fail .tag{background:rgba(224,71,76,.35);color:#FFB3B3}" +
  "#tbTest .info .tag{background:rgba(242,194,48,.28);color:#FFE08A}" +
  "#tbTest .nm{font-size:15px;font-weight:800;line-height:1.4}" +
  "#tbTest .dt{grid-column:2;font-size:14px;line-height:1.5;color:#CFD8D0;word-break:keep-all}" +
  "@media (max-width:560px){#tbTest .row{grid-template-columns:1fr}#tbTest .dt{grid-column:1}}";

function escHtml(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

function renderPanel(results, ms, rerun) {
  var el = document.getElementById("tbTest");
  if (!el) {
    var st = document.createElement("style"); st.textContent = PANEL_CSS; document.head.appendChild(st);
    el = document.createElement("div"); el.id = "tbTest"; document.body.appendChild(el);
  }
  var count = { pass: 0, fail: 0, info: 0 }, groups = [];
  results.forEach(function (r) { count[r.status]++; if (groups.indexOf(r.group) < 0) groups.push(r.group); });
  el.innerHTML = '<div class="box"><h2>팀 배틀 상호작용 검사</h2>' +
    '<div class="sum">통과 ' + count.pass + " · 문제 " + count.fail + " · 확인 필요 " + count.info + " — " + (ms / 1000).toFixed(1) + "초 걸림</div>" +
    '<div class="btns"><button type="button" data-act="rerun">다시 검사</button><button type="button" data-act="close">닫기</button></div>' +
    groups.map(function (g) {
      return "<h3>" + escHtml(g) + "</h3>" + results.filter(function (r) { return r.group === g; }).map(function (r) {
        return '<div class="row ' + r.status + '"><span class="tag">' + STATUS_LABEL[r.status] + '</span><div class="nm">' + escHtml(r.name) + '</div><div class="dt">' + escHtml(r.detail) + "</div></div>";
      }).join("");
    }).join("") + "</div>";
  el.onclick = function (e) {
    var act = e.target.getAttribute && e.target.getAttribute("data-act");
    if (act === "close") el.remove();
    if (act === "rerun") rerun();
  };
  window.TB_TEST_RESULTS = results;
}

export function runTeamBattleTests(api) {
  function once() {
    if (!api.isIdle()) { alert("방에 들어가 있지 않은 첫 화면에서만 검사할 수 있어요."); return; }
    var mapBefore = api.currentMap(), started = performance.now(), results;
    var retired = Object.keys(api.CHARS).filter(function (c) { return api.CHARS[c].retired; });
    retired.forEach(function (c) { api.CHARS[c].retired = false; });
    function restore() { retired.forEach(function (c) { api.CHARS[c].retired = true; }); api.finish(mapBefore); }
    try { results = collectResults(api); }
    catch (err) { restore(); throw err; }
    results.pending.then(function () { restore(); renderPanel(results, performance.now() - started, once); }, function (err) { restore(); throw err; });
  }
  once();
}
