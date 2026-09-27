function collectResults(api) {
  var T0 = 1700000000000;
  var FRAME = 1000 / 60;
  var OPEN_Y = { forest: 575, river: 575, dungeon: 525 };

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

  run(WALL, "무작위 위치 5,000곳 × 지도 3개를 밀어내기 처리하면 벽·물 밖으로 나오는가", function (done) {
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
    done(bad.length ? "fail" : "pass", bad.length ? bad.length + "곳 실패. 예: " + bad.slice(0, 3).join(" / ") : "15,000곳 모두 벽·물 밖으로 나옴");
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

  run(MOVE, "창기사 꿰뚫기 준비(0.3초) 중에 밀려나면 찌르기가 어디서 나가는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "ln", team: "blue", char: "lancer", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "gd", team: "red", char: "guardian", x: 190, y: y, gauge: api.GAUGE_MAX }
    ]);
    api.useUlt(W.ent("ln"), 0);
    api.useUlt(W.ent("gd"), 0);
    W.step(400);
    var lance = W.pushesFrom("ln", "meleeHits").filter(function (p) { return p.v.wind; })[0];
    var gap = lance ? Math.round(hyp(W.ent("ln").x - lance.v.x, W.ent("ln").y - lance.v.y)) : 0;
    done(gap > 30 ? "info" : "pass", gap > 30 ? "창기사는 " + gap + "만큼 밀려났는데 찌르기는 처음 서 있던 자리에서 나감 (화면에서는 빈 곳에서 창이 나가 보임)" : "밀린 거리 " + gap);
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
      ? "기절했는데도 찌르기가 나감: " + fired.map(function (s) { return s[0] + "(" + s[1] / 1000 + "초 기절)"; }).join(", ") + ". 창기사 꿰뚫기 기절(1.2초)만 취소됨"
      : "모든 기절에서 취소됨");
  });

  run(STUN, "부활 보호(3초) 중인 적이 주술사 메테오에 기절하는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "mg", team: "blue", char: "mage", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 450, y: y }
    ]);
    var foe = W.ent("foe");
    foe.protectUntil = W.t() + 3000;
    api.useUlt(W.ent("mg"), 0, 200);
    var wasStunned = false;
    W.step(1000, FRAME, function (t) { if (api.stunned(foe, t)) wasStunned = true; });
    var hurt = foe.hp < foe.maxHp;
    done(wasStunned || hurt ? "fail" : "pass", wasStunned ? "피해는 안 받았지만 1초 기절함 (다른 기절 기술은 부활 보호 중에는 안 걸림)" : hurt ? "피해를 받음" : "피해·기절 모두 없음");
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

  run(STUN, "대장장이 내려찍기 도약 중에 기절하면 어떻게 되는가", function (done) {
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
    done("info", landed ? "기절해도 도약이 끝까지 이어져 착지 피해·기절이 들어감 (창기사는 기절하면 취소됨 — 규칙을 맞출지 정해야 함)" : "기절하면 착지 공격이 취소됨");
  });

  run(STUN, "기사 방어태세 중에 기절해 있으면 끝날 때 주변 기절이 발동하는가", function (done) {
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
    done("info", foeStunned ? "기사가 기절한 상태에서도 마무리 기절이 발동함" : "기사가 기절해 있으면 마무리 기절이 취소됨");
  });

  run(STUN, "궁수 난사 도중 기절하면 남은 화살이 멈추는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "rg", team: "blue", char: "ranger", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 450, y: y }
    ]);
    api.useUlt(W.ent("rg"), 0);
    W.step(120);
    var hpAtStun = W.ent("foe").hp;
    api.afflict(W.ent("rg"), { stunMs: 1000 });
    W.step(1000);
    var after = Math.round((hpAtStun - W.ent("foe").hp) / api.ULT.mkDmg);
    done(after > 1 ? "info" : "pass", after > 1 ? "기절한 뒤에도 화살 " + after + "발이 계속 나가 맞음 (궁수 자세만 풀림)" : "기절 후 화살이 멈춤");
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

  run(GAUGE, "궁수 난사 10발을 모두 맞히면 게이지가 얼마나 돌아오는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "rg", team: "blue", char: "ranger", x: 250, y: y, gauge: api.GAUGE_MAX },
      { id: "foe", team: "red", char: "knight", x: 450, y: y }
    ]);
    api.useUlt(W.ent("rg"), 0);
    W.step(1200);
    var g = W.ent("rg").gauge, hits = Math.round((W.ent("foe").maxHp - W.ent("foe").hp) / api.ULT.mkDmg);
    done(g > api.GAUGE_MAX ? "fail" : (g >= api.GAUGE_MAX ? "info" : "pass"),
      hits + "발 적중 → 게이지 " + g + "/" + api.GAUGE_MAX + (g >= api.GAUGE_MAX ? " — 다 맞히면 곧바로 난사를 다시 쓸 수 있음" : ""));
  });

  run(GAUGE, "투척병 독병 1개가 적 3명에게 맞으면 게이지가 얼마나 오르는가", function (done) {
    var y = OPEN_Y.forest;
    var W = world("forest", [
      { id: "th", team: "blue", char: "thrower", x: 250, y: y },
      { id: "a", team: "red", char: "knight", x: 450, y: y },
      { id: "b", team: "red", char: "knight", x: 450, y: y - 35 },
      { id: "c", team: "red", char: "knight", x: 450, y: y + 35 }
    ]);
    api.fireBasic(W.ent("th"), 0, 200);
    W.step(4000);
    var g = W.ent("th").gauge;
    done(g > 2 ? "info" : "pass", "독병 1개로 게이지 +" + g + " (다른 원거리 딜러는 공격 1번 적중에 +2, 여러 명을 맞혀도 +2)");
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
    done(bad.length ? "fail" : "pass", bad.length ? bad.join(", ") : "기절·둔화 해제, 부활 시 체력·상태 초기화, 보호 3초");
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
          prev[e.id] = { x: E.x, y: E.y, alive: E.alive, leap: !!E.leap, stunned: api.stunned(E, t - ms) };
          if (!isFinite(E.x) || !isFinite(E.y) || !isFinite(E.hp) || !isFinite(E.gauge)) { flag("숫자 아님(NaN)", E, t); return; }
          if (E.hp < 0 || E.hp > E.maxHp) flag("체력 범위 이탈", E, t, "hp " + E.hp);
          if (E.gauge < 0 || E.gauge > api.GAUGE_MAX) flag("게이지 범위 이탈", E, t, "gauge " + E.gauge);
          if (!E.alive) return;
          if (E.stunUntil - t > maxStun + 20) flag("기절이 너무 김", E, t, Math.round(E.stunUntil - t) + "ms");
          if (!E.leap) { var why = blockedAt(E.x, E.y); if (why) flag(why, E, t); }
          if (E.dash && t - E.dash.at > api.CHARS.hitman.dashMs + api.CHARS.hitman.finishDelay + 200) flag("돌진이 안 끝남", E, t);
          if (E.leap && t - E.leap.at > api.ULT.bsDelay + 200) flag("도약이 안 끝남", E, t);
          if (E.shove && t - E.shove.at > api.ULT.gdKbMs + 200) flag("넉백이 안 끝남", E, t);
          if (!P0 || !P0.alive) return;
          var jump = hyp(E.x - P0.x, E.y - P0.y);
          if (!E.leap && !P0.leap && !teleported[e.id] && jump > 0.5 && segmentCrossesWall(P0.x, P0.y, E.x, E.y)) flag("벽 통과", E, t, Math.round(jump) + "만큼 이동");
          if (P0.stunned && api.stunned(E, t) && jump > 0.5 && !E.shove && !E.dash && !E.leap && !teleported[e.id] && !holeActive(t)) flag("기절 중 이동", E, t, Math.round(jump) + "만큼");
        });
      }
      var ults = W.log.filter(function (p) { return (p.path === "meleeHits" && p.v.u) || (p.path === "effects" && p.v.u !== 0 && p.v.type !== "pool") || (p.path === "shots" && p.v.s); }).length;
      var kills = W.log.filter(function (p) { return p.path === "kills"; }).length;
      return { list: list, issues: issues, kills: kills, ults: ults };
    } finally { Math.random = realRandom; }
  }
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
