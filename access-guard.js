/* =====================================================================
   수업 자료 접근 가드
   각 수업 자료 HTML의 <head> 맨 앞에 아래 두 줄을 넣어 사용합니다.

     <script src="firebase-config.js"></script>
     <script src="access-guard.js" data-game="slidecard"></script>

   data-game 값(slug)이 교사용 화면에 등록된 자료 아이디와 같아야 합니다.
   이 두 줄만 넣으면 잠금 확인과 '목록으로' 버튼이 함께 붙습니다.
   ===================================================================== */
(function () {
  "use strict";

  var script = document.currentScript;
  var slug = script ? script.getAttribute("data-game") : null;
  if (!slug) return;

  /* ---------- 목록으로 돌아가는 버튼 ----------
     학생 기기는 전체화면으로 열려 있어 브라우저 뒤로가기가 없습니다.
     그래서 모든 수업 자료 화면 왼쪽 위에 목록으로 가는 버튼을 띄웁니다. */
  function addHomeButton() {
    if (document.querySelector("[data-guard-home]")) return;

    /* 자료 화면을 가리지 않도록 본문 위쪽에 자리를 만들고, 그 자리에 버튼을 띄웁니다. */
    var space = document.createElement("style");
    space.textContent =
      "body{padding-top:calc(46px + env(safe-area-inset-top, 0px)) !important;}";
    (document.head || document.documentElement).appendChild(space);

    var home = document.createElement("a");
    home.setAttribute("data-guard-home", "1");
    home.href = "index.html";
    home.textContent = "\u2190 \uBAA9\uB85D\uC73C\uB85C";   /* ← 목록으로 */
    home.style.cssText = [
      "position:fixed",
      "top:calc(8px + env(safe-area-inset-top, 0px))",
      "left:10px",
      "z-index:2147483000",
      "display:inline-flex",
      "align-items:center",
      "height:32px",
      "padding:0 12px",
      "background:#ffffff",
      "border:1px solid #d1d5db",
      "border-radius:999px",
      "color:#111827",
      "font-size:13px",
      "font-weight:600",
      "line-height:1",
      "text-decoration:none",
      "box-shadow:0 1px 3px rgba(0,0,0,0.08)",
      "-webkit-tap-highlight-color:transparent",
      "font-family:Pretendard,-apple-system,'Segoe UI','\uB9D1\uC740 \uACE0\uB515',sans-serif"
    ].join(";");
    document.body.appendChild(home);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addHomeButton);
  } else {
    addHomeButton();
  }

  /* 인터넷 주소로 열었을 때만 잠금을 검사합니다.
     (내 컴퓨터에서 파일을 직접 열어보는 file:// 미리보기는 그대로 실행) */
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  var cfg = window.PORTAL_CONFIG || {};
  var POLL = (cfg.POLL_SECONDS || 5) * 1000;

  var locked = true;          /* 판정 전에는 무조건 잠금 */
  var played = false;         /* 한 번이라도 자료가 열렸는지 */
  var overlay = null;
  var keepAlive = null;

  /* ---------- 화면 가리기 ---------- */
  var hideStyle = document.createElement("style");
  hideStyle.textContent = "body{visibility:hidden !important}";
  (document.head || document.documentElement).appendChild(hideStyle);

  function makeOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.setAttribute("data-guard", "1");
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483647",
      "display:flex", "flex-direction:column",
      "align-items:center", "justify-content:center", "gap:14px",
      "background:#f5f6f8", "color:#111827", "text-align:center",
      "padding:24px", "visibility:visible",
      "font-family:Pretendard,-apple-system,'Segoe UI','맑은 고딕',sans-serif"
    ].join(";");
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function paint(icon, title, desc, showHome) {
    var el = makeOverlay();
    el.innerHTML = "";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;border:1px solid #d1d5db;border-radius:12px;" +
      "padding:28px 24px;max-width:360px;width:100%";
    box.appendChild(txt("div", icon, "font-size:40px;line-height:1;margin-bottom:12px"));
    box.appendChild(txt("p", title, "font-size:18px;font-weight:600;margin:0 0 6px"));
    box.appendChild(txt("p", desc, "font-size:14px;color:#6b7280;margin:0;line-height:1.6"));
    if (showHome) {
      var a = document.createElement("a");
      a.href = "index.html";
      a.textContent = "목록으로 돌아가기";
      a.style.cssText = "display:block;margin-top:18px;padding:10px 14px;border:1px solid #d1d5db;" +
        "border-radius:8px;text-decoration:none;color:#111827;font-size:14px;background:#fff";
      box.appendChild(a);
    }
    el.appendChild(box);
  }

  function txt(tag, text, css) {
    var n = document.createElement(tag);
    n.textContent = text;
    n.style.cssText = css;
    return n;
  }

  /* ---------- 잠금/해제 ---------- */
  function lock(icon, title, desc) {
    locked = true;
    if (!hideStyle.isConnected) (document.head || document.documentElement).appendChild(hideStyle);
    paint(icon, title, desc, true);
    if (!keepAlive) keepAlive = setInterval(function () {
      if (!locked) return;
      if (!hideStyle.isConnected) (document.head || document.documentElement).appendChild(hideStyle);
      if (!overlay || !overlay.isConnected) paint(icon, title, desc, true);
    }, 1000);
  }

  function unlock() {
    locked = false;
    played = true;
    if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
    if (hideStyle.isConnected) hideStyle.remove();
    if (overlay && overlay.isConnected) overlay.remove();
    overlay = null;
  }

  /* 잠긴 동안에는 키보드 입력이 자료에 닿지 않게 막습니다. */
  ["keydown", "keypress", "keyup"].forEach(function (type) {
    window.addEventListener(type, function (e) {
      if (locked) { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  });

  /* ---------- 상태 확인 ---------- */
  function check() {
    if (!cfg.isReady || !cfg.isReady()) {
      lock("🔧", "설정이 아직 끝나지 않았어요",
           "firebase-config.js 에 주소와 키를 넣어야 수업 자료를 열 수 있습니다.");
      return;
    }
    fetch(cfg.dbPath("games/" + slug), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (game) {
        if (!game) {
          lock("🔒", "아직 등록되지 않은 자료예요",
               "선생님 화면에서 이 자료를 등록하면 열립니다.");
          return;
        }
        if (game.open === true) {
          unlock();
        } else if (played) {
          lock("✋", "선생님이 종료했어요",
               "지금은 계속할 수 없어요. 다시 열리면 이어서 할 수 있어요.");
        } else {
          lock("🔒", "선생님이 아직 열지 않았어요",
               "수업 시간에 선생님이 열어주면 바로 시작할 수 있어요.");
        }
      })
      .catch(function () {
        lock("📡", "연결을 확인하는 중이에요",
             "인터넷 연결을 확인해 주세요. 연결되면 자동으로 열립니다.");
      });
  }

  check();
  setInterval(check, POLL);
})();
