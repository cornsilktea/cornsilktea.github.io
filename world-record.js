/* =====================================================================
   세계 신기록 (Firebase Realtime Database, 모든 학생 공통)  —  공용 도우미

   사용법
     <script charset="utf-8" src="firebase-config.js"></script>
     <script charset="utf-8" src="world-record.js"></script>
     ...
     var WR = WorldRecord("slidecard", { lower: true });   // lower: 작을수록 좋은 기록(시간)
     WR.load().then(function(){ ... WR.rec ... });        // rec = { score, name, grade, cls, at } 또는 null
     WR.value()   → 표시용 값(점수·시간 등). lower 이면 부호를 되돌려 준다.
     WR.text()    → 표시용 문자열 (opts.format 적용)
     WR.who()     → "1학년 3반 홍길동" (학년·반이 없으면 이름만)
     WR.beats(v)  → v 가 세계 신기록을 넘는지
     WR.prompt(v) → 넘으면 학년·반·이름 입력 창을 띄우고 등록. Promise<등록된 기록 또는 null>
                    (등록하거나, 그 사이 누가 앞질러 거부될 때까지 닫히지 않는다)
     WR.onChange(fn) → 불러오거나 등록해 기록이 바뀔 때마다 fn 호출

   옵션: lower(작을수록 좋음), format(값→문자열), key(기본 "all" — 곡별 기록처럼 여러 개면 지정)
   경로는 records/<게임>/<key> . 규칙(데이터베이스규칙.json)은 기존보다 큰 score 만 받으므로
   시간처럼 작을수록 좋은 기록은 score = LOWER_BASE - 값 으로 저장한다(lower:true. 규칙이 score >= 0 만 받으므로 음수 대신).
   개인 기기의 최고 기록(localStorage)은 각 게임이 따로 계속 관리한다.
   ===================================================================== */
(function () {
  "use strict";

  var LOWER_BASE = 1000000000;   // 작을수록 좋은 기록의 저장값 = LOWER_BASE - 값 (규칙이 0 이상만 받음)
  var GRADES = [1, 2];
  var CLASSES = [1, 2, 3, 4, 5];

  var CSS =
    ".wr-back{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(27,43,32,.55);padding:16px;font-family:'Nanum Gothic','NanumGothic','나눔고딕','Malgun Gothic','맑은 고딕',sans-serif;}" +
    ".wr-box{background:#FFFFFF;color:#1B2B20;border:2px solid #24402F;border-radius:8px;padding:18px 20px;width:min(380px,100%);" +
      "box-shadow:0 12px 32px rgba(0,0,0,.25);box-sizing:border-box;max-height:100%;overflow-y:auto;}" +
    ".wr-box h3{margin:0 0 6px;font-size:18px;font-weight:800;text-align:center;}" +
    ".wr-box .wr-val{text-align:center;font-size:15px;color:#3B4B40;margin-bottom:12px;}" +
    ".wr-box .wr-val b{color:#A8731C;font-size:18px;}" +
    ".wr-lab{font-size:12px;font-weight:700;color:#5B6B5E;margin:10px 0 4px;}" +
    ".wr-pick{display:flex;gap:6px;}" +
    ".wr-pick button{flex:1 1 0;min-width:0;height:40px;font:inherit;font-size:15px;font-weight:700;border-radius:4px;cursor:pointer;" +
      "border:1px solid #C9D2C3;background:#FFFFFF;color:#1B2B20;}" +
    ".wr-pick button.on{background:#24402F;border-color:#24402F;color:#FFFFFF;}" +
    ".wr-row{display:flex;gap:8px;}" +
    ".wr-row input{flex:1;min-width:0;height:44px;font:inherit;font-size:16px;padding:0 12px;border:1px solid #24402F;border-radius:4px;" +
      "background:#FFFFFF;color:#1B2B20;box-sizing:border-box;}" +
    ".wr-row input:focus{outline:2px solid #DCE6D6;}" +
    ".wr-row button{flex:0 0 auto;height:44px;padding:0 18px;font:inherit;font-size:15px;font-weight:700;border-radius:4px;cursor:pointer;" +
      "border:1px solid #24402F;background:#24402F;color:#FFFFFF;}" +
    ".wr-row button:disabled{opacity:.6;cursor:default;}" +
    ".wr-warn{font-size:12px;color:#B33951;font-weight:700;margin-top:10px;text-align:center;line-height:1.5;}" +
    ".wr-msg{font-size:13px;color:#5B6B5E;min-height:18px;margin-top:6px;text-align:center;}";

  var styleDone = false;
  function ensureStyle() {
    if (styleDone) return;
    styleDone = true;
    var st = document.createElement("style");
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function escapeHtml(t) {
    return String(t).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  /* 기록 → "1학년 3반 홍길동" (학년·반이 없는 옛 기록은 이름만) */
  function whoOf(rec) {
    if (!rec) return "";
    var p = [];
    if (rec.grade) p.push(rec.grade + "학년");
    if (rec.cls) p.push(rec.cls + "반");
    p.push(rec.name);
    return p.join(" ");
  }

  function pickRow(list, unit) {
    return '<div class="wr-pick">' + list.map(function (n) {
      return '<button type="button" data-v="' + n + '">' + n + unit + "</button>";
    }).join("") + "</div>";
  }

  function WorldRecord(game, opts) {
    opts = opts || {};
    var lower = !!opts.lower;
    var key = opts.key || "all";
    var format = opts.format || function (v) { return String(v); };  // 표시용 값 → 문자열
    var listeners = [];

    var api = {
      game: game,
      rec: null,
      loaded: false,
      lower: lower,

      url: function () {
        var cfg = window.PORTAL_CONFIG;
        if (!cfg || !cfg.isReady || !cfg.isReady()) return null;
        return cfg.DB_URL.replace(/\/+$/, "") + "/records/" + game + "/" + key + ".json";
      },

      /* 저장된 score → 표시용 값 */
      value: function () {
        if (!api.rec) return null;
        return lower ? LOWER_BASE - api.rec.score : api.rec.score;
      },
      name: function () { return api.rec ? api.rec.name : ""; },
      who: function () { return whoOf(api.rec); },
      /* 표시용 문자열 (형식은 opts.format) */
      text: function () {
        var v = api.value();
        return v === null ? "" : format(v);
      },
      escapeHtml: escapeHtml,
      whoOf: whoOf,

      load: function () {
        var u = api.url();
        if (!u) return Promise.resolve(null);
        return fetch(u, { cache: "no-store" })
          .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
          .then(function (j) {
            api.rec = (j && typeof j.score === "number") ? j : null;
            api.loaded = true;
            emit();
            return api.rec;
          })
          .catch(function () { return null; });
      },

      beats: function (v) {
        if (!api.loaded || typeof v !== "number" || !isFinite(v)) return false;
        if (!api.rec) return v > 0;
        return lower ? v < LOWER_BASE - api.rec.score : v > api.rec.score;
      },

      /* 규칙이 "기존보다 큰 score 만" 받으므로, 그 사이 누가 앞질렀으면 401 로 거부된다 */
      submit: function (v, name, grade, cls) {
        var u = api.url();
        if (!u) return Promise.reject(new Error("no-db"));
        /* at 은 서버 시각(.sv) — 학생 기기의 시계가 틀려도 규칙의 시각 검사에 걸리지 않게 */
        var rec = { score: lower ? LOWER_BASE - v : v, name: name, grade: grade, cls: cls, at: { ".sv": "timestamp" } };
        return fetch(u, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) })
          .then(function (r) {
            if (!r.ok) throw new Error(String(r.status));
            rec.at = Date.now(); api.rec = rec; emit(); return rec;
          });
      },

      onChange: function (fn) { listeners.push(fn); },

      /* 세계 신기록을 넘었으면 학년·반·이름 입력 창을 띄운다.
         셋을 다 채워 등록하기 전에는 닫히지 않는다(그 사이 누가 앞질러 거부되면 자동으로 닫힘). */
      prompt: function (v, title) {
        if (!api.beats(v)) return Promise.resolve(null);
        ensureStyle();
        return new Promise(function (resolve) {
          var back = document.createElement("div");
          back.className = "wr-back";
          back.innerHTML =
            '<div class="wr-box" role="dialog" aria-modal="true">' +
              "<h3>🏆 " + escapeHtml(title || "세계 신기록 달성!") + "</h3>" +
              '<div class="wr-val">기록 <b>' + escapeHtml(format(v)) + "</b></div>" +
              '<div class="wr-lab">학년</div>' + pickRow(GRADES, "학년") +
              '<div class="wr-lab">반</div>' + pickRow(CLASSES, "반") +
              '<div class="wr-lab">이름</div>' +
              '<div class="wr-row">' +
                '<input type="text" maxlength="20" placeholder="이름 (20자 이내)" autocomplete="off">' +
                '<button type="button" class="wr-ok">등록</button>' +
              "</div>" +
              '<div class="wr-warn">자신의 인적사항을 제대로 입력하지 않으면<br>데이터베이스에서 기록이 삭제됩니다.</div>' +
              '<div class="wr-msg"></div>' +
            "</div>";
          document.body.appendChild(back);
          var picks = back.querySelectorAll(".wr-pick");
          var input = back.querySelector("input"), ok = back.querySelector(".wr-ok"), msg = back.querySelector(".wr-msg");
          var grade = 0, cls = 0;
          function wirePick(row, setter) {
            row.addEventListener("click", function (e) {
              var b = e.target.closest("button"); if (!b) return;
              row.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
              setter(parseInt(b.getAttribute("data-v"), 10));
              msg.textContent = "";
            });
          }
          wirePick(picks[0], function (n) { grade = n; });
          wirePick(picks[1], function (n) { cls = n; });
          /* 반별 링크(?c=1-1)로 들어왔으면 학년·반을 미리 골라 둔다(access-guard.js 가 읽어 둠) */
          var pc = window.PORTAL_CLASS;
          if (pc && pc.grade && pc.cls) {
            var gb = picks[0].querySelector('button[data-v="' + pc.grade + '"]');
            var cb = picks[1].querySelector('button[data-v="' + pc.cls + '"]');
            if (gb) gb.click();
            if (cb) cb.click();
          }
          function close(result) { back.remove(); resolve(result); }
          function stop(e) { e.stopPropagation(); }
          /* 게임의 전역 키 입력(스페이스·방향키)이 입력창을 가로채지 않도록 */
          back.addEventListener("keydown", stop); back.addEventListener("keyup", stop); back.addEventListener("keypress", stop);
          ok.onclick = function () {
            var name = input.value.trim();
            if (!grade) { msg.textContent = "학년을 선택하세요."; return; }
            if (!cls) { msg.textContent = "반을 선택하세요."; return; }
            if (!name) { msg.textContent = "이름을 입력하세요."; input.focus(); return; }
            ok.disabled = true; msg.textContent = "등록 중…";
            api.submit(v, name, grade, cls)
              .then(function (rec) { close(rec); })
              .catch(function (err) {
                if (err.message === "401" || err.message === "400") {
                  msg.textContent = "그 사이 더 높은 기록이 등록되었습니다.";
                  api.load().then(function () { setTimeout(function () { close(null); }, 1500); });
                } else {
                  msg.textContent = "네트워크 오류로 등록하지 못했습니다. 다시 눌러 보세요.";
                  ok.disabled = false;
                }
              });
          };
          input.addEventListener("keydown", function (e) { if (e.key === "Enter") ok.click(); });
        });
      }
    };

    function emit() { listeners.forEach(function (fn) { try { fn(api); } catch (e) {} }); }
    return api;
  }

  window.WorldRecord = WorldRecord;
})();
