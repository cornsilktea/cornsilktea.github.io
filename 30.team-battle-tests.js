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
    }
    function node(path) {
      return {
        child: function (p) { return node(path ? path + "/" + p : p); },
        push: function (v) { var key = "k" + (++n); dispatch(path, key, v); return { key: key }; },
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
    api.begin(fakeRoom(mapId, log), players, bots, t);
    list.forEach(function (e) {
      var E = api.makeEnt(e.id, players[e.id]);
      if (e.x != null) { E.x = e.x; E.y = e.y; }
      E.angle = e.angle || 0;
      if (e.gauge != null) E.gauge = e.gauge;
      E.bot = { seed: Math.random() * 10, seenAt: 0, target: null, stuck: 0, detour: 0, detourDir: 1 };
      bots[e.id] = E;
    });
    var w = {
      log: log,
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
  run(MOVE, "창기사 꿰뚫기: 준비 동작 없이 두면 찌르기가 나가는가 (기준 확인)", function (done) {
    var r = lancerDisplaced(null);
    done(r.struck && r.hurt ? "pass" : "fail", r.struck && r.hurt ? "찌르기가 나가 적이 맞음" : "찌르기가 나가지 않음");
  });
  run(MOVE, "창기사 꿰뚫기: 준비 중 창벽에 밀려나면 취소되는가", function (done) {
    var r = lancerDisplaced("guardian");
    done(!r.struck && !r.hurt && r.free ? "pass" : "fail", r.struck || r.hurt ? r.moved + "만큼 밀렸는데 찌르기가 나감" : !r.free ? "취소됐지만 창기사가 계속 묶여 있음" : r.moved + "만큼 밀려 취소됨, 바로 움직일 수 있음");
  });
  run(MOVE, "창기사 꿰뚫기: 준비 중 블랙홀에 끌려가면 취소되는가", function (done) {
    var r = lancerDisplaced("hole");
    if (!r.moved) { done("fail", "시험 준비 실패: 블랙홀이 창기사를 끌지 못함"); return; }
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
  run(STUN, "창기사 꿰뚫기 준비 중에 기절하면 찌르기가 취소되는가 (기절 시간별)", function (done) {
    var sources = [["자객 처형·주술사 메테오·기사 방어태세", api.ULT.mbStunMs], ["대장장이 내려찍기", api.ULT.bsStunMs], ["창기사 꿰뚫기", api.ULT.lnStunMs]];
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

  run(PASSIVE, "네크로 해골: 해골의 공격은 누구의 게이지도 채우지 않고, 해골에게 입힌 피해는 피해량에 안 들어가며 기본 공격 게이지는 오르는가", function (done) {
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
    var ncGauge = nc.gauge, wrHp = wr.hp;
    wr.gauge = 0; wr.cdUntil = Infinity;
    W.step(1500);
    if (wr.hp >= wrHp) bad.push("해골이 광전사를 못 때림");
    if (wr.gauge !== 0) bad.push("해골에게 맞은 광전사 게이지 " + wr.gauge);
    if (nc.gauge !== ncGauge) bad.push("해골이 때렸는데 네크로 게이지 " + ncGauge + " → " + nc.gauge);
    var M = nc.minions.filter(function (m) { return m.alive; })[0];
    if (!M) { done("fail", "시험 준비 실패: 살아 있는 해골 없음"); return; }
    var mHp = M.hp;
    wr.hp = wr.maxHp; wr.gauge = 0; wr.dmg = 0;
    api.damage(M, 5, "wr", W.t(), null, null);
    W.step(50);
    if (M.hp !== mHp - 5) bad.push("해골 체력 " + mHp + " → " + M.hp);
    if (wr.dmg !== 0) bad.push("해골에게 준 피해가 피해량에 " + wr.dmg + " 들어감");
    if (wr.gauge !== api.roleGauge("warrior")) bad.push("해골을 친 광전사 게이지 " + wr.gauge + " (기대 " + api.roleGauge("warrior") + ")");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "해골 공격: 광전사·네크로 게이지 그대로 / 해골 타격: 피해량 0, 게이지 +" + api.roleGauge("warrior"));
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
    for (var i = 0; i < 3; i++) { frostShot(W); got.push(api.stunned(foe, W.t()) ? "빙결" : Math.round(api.speedOf(foe) / base * 100) + "%"); }
    var freezeLeft = foe.stunUntil - W.t();
    W.step(api.ULT.frFreezeMs);
    frostShot(W);
    got.push("다시 " + foe.frostStacks + "스택");
    var want1 = Math.round(api.ULT.frSlowMul * 100) + "%", want2 = Math.round((api.ULT.frSlowMul - api.ULT.frSlowStep) * 100) + "%";
    var ok = got[0] === want1 && got[1] === want2 && got[2] === "빙결" && freezeLeft <= api.ULT.frFreezeMs && foe.frostStacks === 1;
    done(ok ? "pass" : "fail", "이동속도 " + got.join(" → ") + " (기대: " + want1 + " → " + want2 + " → 빙결 → 다시 1스택)");
  });
  run(FROST, "냉기 화살: 마지막 적중 후 " + api.ULT.frSlowMs + "ms가 지나면 스택이 초기화되는가", function (done) {
    var W = frostDuel(), foe = W.ent("foe");
    frostShot(W); frostShot(W);
    W.step(api.ULT.frSlowMs + 200);
    frostShot(W);
    done(foe.frostStacks === 1 && !api.stunned(foe, W.t()) ? "pass" : "fail", "2스택 뒤 쉬었다 맞힘 → " + foe.frostStacks + "스택" + (api.stunned(foe, W.t()) ? ", 빙결됨" : ""));
  });
  run(FROST, "눈보라: 시전자를 따라다니고, 범위 안 적은 1초에 " + api.ULT.frBzDmg + " 피해·이동속도 " + Math.round((1 - api.ULT.frBzSlowMul) * 100) + "% 감소, 아군은 먼 적에게 숨겨지는가", function (done) {
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
    if (lost < api.ULT.frBzDmg * 3 || lost > api.ULT.frBzDmg * 4) bad.push("3초간 피해 " + lost);
    var slowRatio = api.speedOf(foe) / api.CHARS.knight.speed;
    if (Math.abs(slowRatio - api.ULT.frBzSlowMul) > 0.01) bad.push("범위 안 적 이동속도 " + Math.round(slowRatio * 100) + "%");
    fr.x += 150;
    W.frame(FRAME);
    var c = api.stormCenter(api.storms()[0]);
    if (Math.abs(c.x - fr.x) > 1) bad.push("눈보라가 시전자를 따라가지 않음");
    W.step(api.ULT.frBzDur);
    var hp1 = foe.hp; W.step(2000);
    if (foe.hp !== hp1) bad.push("끝난 뒤에도 피해");
    if (api.hiddenFrom(al, W.t())) bad.push("끝난 뒤에도 숨겨짐");
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "3초간 " + lost + " 피해, 이동속도 " + Math.round(slowRatio * 100) + "%, 따라다님, 끝나면 은신·피해 모두 멈춤");
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
      var ults = W.log.filter(function (p) { return (p.path === "meleeHits" && p.v.u) || (p.path === "effects" && p.v.u !== 0 && p.v.type !== "pool") || (p.path === "shots" && p.v.s); }).length;
      var kills = W.log.filter(function (p) { return p.path === "kills"; }).length;
      return { list: list, issues: issues, kills: kills, ults: ults };
    } finally { Math.random = realRandom; }
  }
  var PASSIVE2 = "주술사·투척병·기사·창기사·광전사 패시브";
  run(PASSIVE2, "주술사: 적중한 적이 " + api.CHARS.mage.burn.ms / 1000 + "초간 불타며 1초당 " + api.CHARS.mage.burn.perSec + "의 피해를 입고, 그동안 회복이 절반인가", function (done) {
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
    var want = api.CHARS.mage.dmg + burn.perSec * burn.ms / 1000, lost = foe.maxHp - foe.hp;
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
    W.step(api.ULT.plDur + 500);
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

  run(PASSIVE2, "창기사: 게임 시작·부활할 때 보호막이 생겨 다음 피해 1회만 막고, 함께 온 기절은 그대로 받는가", function (done) {
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
    api.damage(wr, wr.maxHp - 130, "kn", false, null);
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
    api.damage(wr, wr.maxHp - 130, "kn", false, null);
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

  api.MAP_IDS.forEach(function (m, i) {
    var seed = 1000 + i * 17;
    run(AUTO, "AI 6명 60초 난전 — " + m + " (가끔 150ms 멈칫, 시드 " + seed + ")", function (done) {
      var r = autoMelee(m, 60, seed), kinds = Object.keys(r.issues);
      var roster = r.list.map(function (e) { return api.CHARS[e.char].name; }).join("·");
      done(kinds.length ? "fail" : "pass", "출전: " + roster + " / 킬 " + r.kills + ", 궁극기 " + r.ults + "번" +
        (kinds.length ? " / 규칙 위반: " + kinds.map(function (k) { return k + " " + r.issues[k].n + "번 (처음: " + r.issues[k].first + ")"; }).join("; ") : " / 규칙 위반 없음"));
    });
  });

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
    try { results = collectResults(api); }
    finally { api.finish(mapBefore); }
    renderPanel(results, performance.now() - started, once);
  }
  once();
}
