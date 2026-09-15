/* =====================================================================
   세계 신기록 (Firebase Realtime Database, 모든 학생 공통)  —  공용 도우미

   사용법
     <script charset="utf-8" src="firebase-config.js"></script>
     <script charset="utf-8" src="world-record.js"></script>
     ...
     var WR = WorldRecord("slidecard", { lower: true });   // lower: 작을수록 좋은 기록(시간)
     WR.load().then(function(){ ... WR.rec ... });        // rec = { score, name, at } 또는 null
     WR.value()   → 표시용 값(점수·시간 등). lower 이면 부호를 되돌려 준다.
     WR.beats(v)  → v 가 세계 신기록을 넘는지
     WR.prompt(v) → 넘으면 이름 입력 창을 띄우고 등록. Promise<등록된 기록 또는 null>
     WR.onChange(fn) → 불러오거나 등록해 기록이 바뀔 때마다 fn 호출

   경로는 records/<게임>/all . 규칙(데이터베이스규칙.json)은 기존보다 큰 score 만 받으므로
   시간처럼 작을수록 좋은 기록은 score = -값 으로 저장한다(lower:true).
   개인 기기의 최고 기록(localStorage)은 각 게임이 따로 계속 관리한다.
   ===================================================================== */
(function () {
  "use strict";

  var CSS =
    ".wr-back{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(27,43,32,.55);padding:16px;font-family:'Nanum Gothic','NanumGothic','나눔고딕','Malgun Gothic','맑은 고딕',sans-serif;}" +
    ".wr-box{background:#FFFFFF;color:#1B2B20;border:2px solid #24402F;border-radius:8px;padding:18px 20px;width:min(360px,100%);" +
      "box-shadow:0 12px 32px rgba(0,0,0,.25);box-sizing:border-box;}" +
    ".wr-box h3{margin:0 0 6px;font-size:18px;font-weight:800;text-align:center;}" +
    ".wr-box .wr-val{text-align:center;font-size:15px;color:#3B4B40;margin-bottom:12px;}" +
    ".wr-box .wr-val b{color:#A8731C;font-size:18px;}" +
    ".wr-row{display:flex;gap:8px;}" +
    ".wr-row input{flex:1;min-width:0;height:44px;font:inherit;font-size:16px;padding:0 12px;border:1px solid #24402F;border-radius:4px;" +
      "background:#FFFFFF;color:#1B2B20;box-sizing:border-box;}" +
    ".wr-row input:focus{outline:2px solid #DCE6D6;}" +
    ".wr-row button{flex:0 0 auto;height:44px;padding:0 16px;font:inherit;font-size:15px;font-weight:700;border-radius:4px;cursor:pointer;" +
      "border:1px solid #24402F;background:#24402F;color:#FFFFFF;}" +
    ".wr-row button.wr-skip{background:#FFFFFF;color:#24402F;}" +
    ".wr-row button:disabled{opacity:.6;cursor:default;}" +
    ".wr-msg{font-size:13px;color:#5B6B5E;min-height:18px;margin-top:8px;text-align:center;}";

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

  function WorldRecord(game, opts) {
    opts = opts || {};
    var lower = !!opts.lower;
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
        return cfg.DB_URL.replace(/\/+$/, "") + "/records/" + game + "/all.json";
      },

      /* 저장된 score → 표시용 값 */
      value: function () {
        if (!api.rec) return null;
        return lower ? -api.rec.score : api.rec.score;
      },
      name: function () { return api.rec ? api.rec.name : ""; },
      /* 표시용 문자열 (형식은 opts.format) */
      text: function () {
        var v = api.value();
        return v === null ? "" : format(v);
      },
      escapeHtml: escapeHtml,

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
        if (!api.rec) return lower ? v > 0 : v > 0;
        return lower ? v < -api.rec.score : v > api.rec.score;
      },

      /* 규칙이 "기존보다 큰 score 만" 받으므로, 그 사이 누가 앞질렀으면 401 로 거부된다 */
      submit: function (v, name) {
        var u = api.url();
        if (!u) return Promise.reject(new Error("no-db"));
        var rec = { score: lower ? -v : v, name: name, at: Date.now() };
        return fetch(u, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) })
          .then(function (r) {
            if (!r.ok) throw new Error(String(r.status));
            api.rec = rec; emit(); return rec;
          });
      },

      onChange: function (fn) { listeners.push(fn); },

      /* 세계 신기록을 넘었으면 이름 입력 창을 띄운다. 등록되면 rec, 아니면 null 로 끝난다. */
      prompt: function (v, title) {
        if (!api.beats(v)) return Promise.resolve(null);
        ensureStyle();
        return new Promise(function (resolve) {
          var back = document.createElement("div");
          back.className = "wr-back";
          back.innerHTML =
            '<div class="wr-box" role="dialog" aria-modal="true">' +
              "<h3>🏆 " + escapeHtml(title || "세계 신기록 달성!") + "</h3>" +
              '<div class="wr-val">기록 <b>' + escapeHtml(format(v)) + "</b> · 이름을 남기세요</div>" +
              '<div class="wr-row">' +
                '<input type="text" maxlength="20" placeholder="이름 (20자 이내)" autocomplete="off">' +
                '<button type="button" class="wr-ok">등록</button>' +
                '<button type="button" class="wr-skip">건너뛰기</button>' +
              "</div>" +
              '<div class="wr-msg"></div>' +
            "</div>";
          document.body.appendChild(back);
          var input = back.querySelector("input"), ok = back.querySelector(".wr-ok"),
              skip = back.querySelector(".wr-skip"), msg = back.querySelector(".wr-msg");
          function close(result) { back.remove(); resolve(result); }
          function stop(e) { e.stopPropagation(); }
          /* 게임의 전역 키 입력(스페이스·방향키)이 입력창을 가로채지 않도록 */
          back.addEventListener("keydown", stop); back.addEventListener("keyup", stop); back.addEventListener("keypress", stop);
          ok.onclick = function () {
            var name = input.value.trim();
            if (!name) { msg.textContent = "이름을 입력하세요."; input.focus(); return; }
            ok.disabled = true; skip.disabled = true; msg.textContent = "등록 중…";
            api.submit(v, name)
              .then(function (rec) { close(rec); })
              .catch(function (err) {
                if (err.message === "401" || err.message === "400") {
                  msg.textContent = "그 사이 더 높은 기록이 등록되었습니다.";
                  api.load().then(function () { setTimeout(function () { close(null); }, 1200); });
                } else {
                  msg.textContent = "네트워크 오류로 등록하지 못했습니다. 다시 눌러 보세요.";
                  ok.disabled = false; skip.disabled = false;
                }
              });
          };
          skip.onclick = function () { close(null); };
          input.addEventListener("keydown", function (e) { if (e.key === "Enter") ok.click(); });
          setTimeout(function () { input.focus(); }, 50);
        });
      }
    };

    function emit() { listeners.forEach(function (fn) { try { fn(api); } catch (e) {} }); }
    return api;
  }

  window.WorldRecord = WorldRecord;
})();
