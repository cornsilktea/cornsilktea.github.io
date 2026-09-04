/* =====================================================================
   교과 단원 구조 (하나뿐인 원본)

   목록 화면(index.html)과 제어판(admin.html)이 모두 이 파일만 봅니다.
   단원을 고치려면 여기만 고치면 두 화면에 동시에 반영됩니다.

   ── 수업 자료는 어디에 있나요? ────────────────────────────────────
   수업 자료(제목·파일 이름·순서·잠금)는 이 파일이 아니라 Firebase 에
   저장됩니다. 제어판에서 추가·수정하면 커밋 없이 바로 반영됩니다.
   "이 자료가 어느 단원에 들어가는지"도 Firebase 의 units 항목에
   같이 저장되므로, 자료 목록과 단원 배치가 항상 한 곳에서 관리됩니다.

   아래 DEFAULT_UNITS 는 units 항목이 아직 없는 예전 자료를 위한
   기본값일 뿐입니다. 제어판에서 한 번 저장하면 그 값이 우선합니다.
   ===================================================================== */
(function () {
  "use strict";

  /* 학년·학기 (구조도의 첫 화면) */
  var SEMESTERS = [
    { id: "g1s1", grade: 1, semester: 1, short: "1학년 1학기", label: "1학년 1학기 (정보)" },
    { id: "g1s2", grade: 1, semester: 2, short: "1학년 2학기", label: "1학년 2학기 (인공지능과 미래사회)" },
    { id: "g2s1", grade: 2, semester: 1, short: "2학년 1학기", label: "2학년 1학기 (정보)" },
    { id: "g2s2", grade: 2, semester: 2, short: "2학년 2학기", label: "2학년 2학기 (정보)" }
  ];

  /* 모든 단원 (자료가 없는 단원도 전부 적어 둡니다)
     path 가 1개면 대단원, 2개면 대단원 > 소단원 구조입니다. */
  var UNITS = [
    { id: "g1s1-1",   sem: "g1s1", path: ["1. 컴퓨팅 시스템"] },

    { id: "g1s2-1",   sem: "g1s2", path: ["1. 인공지능의 이해"] },
    { id: "g1s2-2",   sem: "g1s2", path: ["2. 인공지능과 데이터"] },
    { id: "g1s2-3",   sem: "g1s2", path: ["3. 인공지능 학습"] },
    { id: "g1s2-4",   sem: "g1s2", path: ["4. 인공지능과 문제해결"] },
    { id: "g1s2-5",   sem: "g1s2", path: ["5. 인공지능과 사회적 영향"] },

    { id: "g2s1-4-1", sem: "g2s1", path: ["4. 인공지능", "4-1. 인공지능 시스템"] },
    { id: "g2s1-4-2", sem: "g2s1", path: ["4. 인공지능", "4-2. 인공지능 시스템 활용"] },
    { id: "g2s1-5-1", sem: "g2s1", path: ["5. 디지털 문화", "5-1. 디지털 사회"] },
    { id: "g2s1-5-2", sem: "g2s1", path: ["5. 디지털 문화", "5-2. 디지털 윤리"] },

    { id: "g2s2-2-1", sem: "g2s2", path: ["2. 데이터", "2-1. 디지털 데이터의 표현"] },
    { id: "g2s2-2-2", sem: "g2s2", path: ["2. 데이터", "2-2. 데이터의 수집과 분석"] },
    { id: "g2s2-3-1", sem: "g2s2", path: ["3. 알고리즘과 프로그래밍", "3-1. 알고리즘"] },
    { id: "g2s2-3-2", sem: "g2s2", path: ["3. 알고리즘과 프로그래밍", "3-2. 프로그래밍"] }
  ];

  /* units 항목이 저장되기 전(예전 자료)에 쓰는 기본 배치 */
  var DEFAULT_UNITS = {
    slidecard:    ["g1s2-1", "g2s2-3-1"],
    robotmaze:    ["g1s2-1", "g2s2-3-1"],
    brickbreak:   ["g1s2-3", "g2s1-4-2"],
    "function":   ["g2s2-3-2"],
    cardauction:  ["g2s2-2-2"],
    snakegame:    ["g2s2-3-1"],
    drawing:      ["g2s2-3-1"],
    datasorting:  ["g1s2-2", "g2s2-2-1"],
    graphreading: ["g1s2-2", "g2s2-2-2"],
    aiorhuman:    ["g1s2-1", "g2s1-4-1"]
  };

  /* 예전 오타(drowing)를 쓰던 자료를 자동으로 바로잡기 위한 표입니다.
     제어판의 '자료 아이디 정리'를 한 번 누르면 더 이상 쓰이지 않습니다. */
  var LEGACY_SLUGS = { drowing: "drawing" };
  var LEGACY_URLS  = { "7.drowing.html": "7.drawing.html" };

  var unitIndex = {};
  UNITS.forEach(function (u) { unitIndex[u.id] = u; });

  var semIndex = {};
  SEMESTERS.forEach(function (s) { semIndex[s.id] = s; });

  function unitById(id) { return unitIndex[id] || null; }
  function semesterById(id) { return semIndex[id] || null; }

  /* "1학년 2학기 · 3. 알고리즘과 프로그래밍 > 3-1. 알고리즘" 형태의 한 줄 */
  function unitLabel(id) {
    var u = unitById(id);
    if (!u) return "";
    var s = semesterById(u.sem);
    return (s ? s.short + " · " : "") + u.path.join(" > ");
  }

  /* 자료 하나가 속한 단원들을 한 문장으로 */
  function unitsLabel(ids) {
    return (ids || []).map(unitLabel).filter(Boolean).join(" / ");
  }

  /* 오타가 있던 예전 자료 아이디/파일 이름을 바로잡아 줍니다. */
  function fixSlug(slug) { return LEGACY_SLUGS[slug] || slug; }
  function fixUrl(url) { return LEGACY_URLS[url] || url; }

  /* Firebase 는 빈 배열을 저장하지 않고 항목 자체를 지웁니다.
     그래서 "단원을 하나도 고르지 않음"과 "아직 정한 적 없음"을 구분하려고
     unitsSet 이라는 표시를 함께 저장합니다. */
  function readUnits(v) {
    if (Array.isArray(v)) return v;
    /* 배열이 객체 형태로 돌아오는 경우까지 받아 줍니다 */
    if (v && typeof v === "object") return Object.keys(v).map(function (k) { return v[k]; });
    return [];
  }

  /* Firebase 에서 읽은 자료 한 건을 화면에서 쓰는 형태로 정리합니다.
     한 번도 단원을 정한 적이 없으면 DEFAULT_UNITS 를 씁니다. */
  function normalize(slug, raw) {
    var g = raw || {};
    var fixed = fixSlug(slug);
    var decided = g.unitsSet === true || g.units !== undefined;
    var units = decided
      ? readUnits(g.units).filter(function (id) { return !!unitById(id); })
      : (DEFAULT_UNITS[fixed] || []).slice();
    return {
      slug: fixed,
      rawSlug: slug,
      title: g.title || fixed,
      url: fixUrl(g.url || ""),
      memo: g.memo || "",
      open: g.open === true,
      order: typeof g.order === "number" ? g.order : 999,
      units: units,
      hasUnits: decided
    };
  }

  /* Firebase 응답(객체) 전체를 순서대로 정렬된 배열로 */
  function toList(data) {
    var out = [];
    Object.keys(data || {}).forEach(function (slug) {
      var g = normalize(slug, data[slug]);
      if (!g.title || !g.url) return;
      out.push(g);
    });
    out.sort(function (a, b) {
      return a.order - b.order || a.title.localeCompare(b.title, "ko");
    });
    return out;
  }

  /* ---------- 구조도(폴더) 탐색 ----------
     prefix 아래에 무엇이 있는지 알려 줍니다.
       - terminal 이면 그 자리가 최하위 단원(자료가 놓이는 곳)
       - 아니면 children 이 다음 단계 폴더 이름 목록 */
  function browse(semId, prefix) {
    var p = prefix || [];
    var under = UNITS.filter(function (u) {
      if (u.sem !== semId) return false;
      for (var i = 0; i < p.length; i++) if (u.path[i] !== p[i]) return false;
      return true;
    });

    var exact = under.filter(function (u) { return u.path.length === p.length; })[0];
    if (exact) return { terminal: true, unit: exact, children: [] };

    var seen = {}, children = [];
    under.forEach(function (u) {
      var name = u.path[p.length];
      if (name === undefined || seen[name]) return;
      seen[name] = true;
      children.push(name);
    });
    return { terminal: false, unit: null, children: children };
  }

  window.PORTAL_DATA = {
    SEMESTERS: SEMESTERS,
    UNITS: UNITS,
    DEFAULT_UNITS: DEFAULT_UNITS,
    LEGACY_SLUGS: LEGACY_SLUGS,
    LEGACY_URLS: LEGACY_URLS,
    unitById: unitById,
    semesterById: semesterById,
    unitLabel: unitLabel,
    unitsLabel: unitsLabel,
    fixSlug: fixSlug,
    fixUrl: fixUrl,
    normalize: normalize,
    toList: toList,
    browse: browse
  };
})();
