/* =====================================================================
   수업 자료 접근 가드
   각 수업 자료 HTML의 <head> 맨 앞에 아래 두 줄을 넣어 사용합니다.

     <script src="firebase-config.js"></script>
     <script src="access-guard.js" data-game="slidecard"></script>

   data-game 값(slug)이 교사용 화면에 등록된 자료 아이디와 같아야 합니다.
   이 두 줄만 넣으면 잠금 확인과 '목록으로' 버튼이 함께 붙습니다.

   잠금 없이 '목록으로' 버튼만 필요한 화면(예: 투표 화면)은
   data-game 없이 access-guard.js 한 줄만 넣으면 됩니다.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- 구형 전자칠판·태블릿 브라우저 대응 ----------
     이 파일은 모든 수업 자료의 <head> 맨 앞에서 실행되므로,
     오래된 브라우저에 없는 기능을 여기서 한 번만 채워 넣습니다.

     ctx.roundRect() 는 2022년 무렵(Chrome 99)에 추가된 기능이라
     구형 기기에는 없습니다. 없으면 캔버스를 그리다 오류가 나서
     화면이 검게(또는 비어) 나옵니다. 없을 때만 같은 동작을 만들어 넣습니다. */
  if (typeof CanvasRenderingContext2D !== "undefined" &&
      !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === "undefined") { r = 0; }
      if (r && r.length) { r = r[0]; }          /* 배열로 넘어와도 첫 값만 사용 */
      if (typeof r === "object") { r = r.x || 0; }
      var max = Math.min(Math.abs(w), Math.abs(h)) / 2;
      if (r > max) { r = max; }
      if (r < 0) { r = 0; }
      this.moveTo(x + r, y);
      this.lineTo(x + w - r, y);
      this.quadraticCurveTo(x + w, y, x + w, y + r);
      this.lineTo(x + w, y + h - r);
      this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      this.lineTo(x + r, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r);
      this.lineTo(x, y + r);
      this.quadraticCurveTo(x, y, x + r, y);
      this.closePath();
    };
  }

  /* ---------- 태블릿·휴대폰 길게 누르기 대응 ----------
     손가락으로 꾹 누르면 기기가 '글자 복사·선택' 동작으로 받아들여
     복사 풍선이 뜨거나 화면이 파랗게 선택됩니다. 모든 수업 자료에서
     이를 막습니다. 글자를 직접 입력하는 칸(input·textarea 등)은 예외입니다. */
  var touchStyle = document.createElement("style");
  touchStyle.textContent =
    "html,body{-webkit-touch-callout:none;-webkit-user-select:none;-moz-user-select:none;user-select:none;" +
    "-webkit-tap-highlight-color:transparent;}" +
    "input,textarea,select,[contenteditable],[contenteditable] *{-webkit-user-select:text;-moz-user-select:text;user-select:text;}" +
    "img,canvas,svg{-webkit-user-drag:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;}";
  (document.head || document.documentElement).appendChild(touchStyle);

  /* 아이폰(iOS 17 이후 사파리)은 user-select:none 을 줘도 캔버스를 꾹 누르면
     글자 선택용 '돋보기(확대 창)'를 띄웁니다. pointerdown 의 preventDefault 로는
     안 막히고, touchstart 에서 preventDefault 를 해야만 막힙니다.
     단 touchstart 를 막으면 그 자리의 click 이 안 생기므로, 게임이 직접 손가락을
     다루겠다고 선언한(touch-action:none) <canvas> 에서만 막습니다. */
  var lastPointerTouch = false;
  window.addEventListener("pointerdown", function (e) {
    lastPointerTouch = (e.pointerType === "touch" || e.pointerType === "pen");
  }, true);
  window.addEventListener("touchstart", function (e) {
    lastPointerTouch = true;
    var t = e.target;
    if (!t || !t.tagName || t.tagName.toLowerCase() !== "canvas") return;
    if (!e.cancelable) return;
    var ta = "";
    try { ta = getComputedStyle(t).touchAction || ""; } catch (err) { ta = ""; }
    if (ta === "none") e.preventDefault();
  }, { capture: true, passive: false });
  /* 손가락·펜으로 길게 눌러 뜨는 메뉴만 막고, 마우스 오른쪽 클릭은 그대로 둡니다. */
  window.addEventListener("contextmenu", function (e) {
    if (!lastPointerTouch) return;
    var t = e.target;
    if (t && t.closest && t.closest("input,textarea,[contenteditable]")) return;
    e.preventDefault();
  }, true);
  window.addEventListener("selectstart", function (e) {
    if (!lastPointerTouch) return;
    var t = e.target;
    if (t && t.closest && t.closest("input,textarea,[contenteditable]")) return;
    e.preventDefault();
  }, true);

  var script = document.currentScript;
  var slug = script ? script.getAttribute("data-game") : null;

  /* 자료 아이디를 바꾼 직후(예: drowing → drawing)에도 화면이 멈추지 않도록,
     새 아이디로 못 찾으면 예전 아이디로 한 번 더 찾아봅니다.
     제어판의 '자료 아이디 정리'를 누르면 이 줄은 더 이상 쓰이지 않습니다. */
  var legacySlug = script ? script.getAttribute("data-game-legacy") : null;

  /* ---------- 학급 ----------
     반마다 링크가 다릅니다: 목록은 index.html?c=1-1, 자료는 6.snakegame.html?c=1-1.
     잠금도 반마다 따로 두므로(제어판 → 반 버튼), 주소의 ?c= 값이 어느 반인지 알려 줍니다.
     게임에서도 window.PORTAL_CLASS 로 읽을 수 있습니다({ id:"1-1", grade:1, cls:1, label:"1학년 1반" } 또는 null).
     배포용 링크(?c=test)는 선생님·지인 테스트용 열한 번째 반입니다: 잠금은 portal/classes/test 를 보고,
     PORTAL_CLASS 는 { id:"test", grade:0, cls:0, label:"배포용", test:true } 가 되며
     세계·반 신기록은 등록하지 않습니다(world-record.js 가 test 를 보고 막음). */
  var classMatch = /[?&]c=([12])-([1-5])(?:&|$)/.exec(location.search);
  var klass = classMatch ? {
    id: classMatch[1] + "-" + classMatch[2],
    grade: parseInt(classMatch[1], 10),
    cls: parseInt(classMatch[2], 10),
    label: classMatch[1] + "학년 " + classMatch[2] + "반"      /* 1학년 1반 */
  } : (/[?&]c=test(?:&|$)/.test(location.search)
    ? { id: "test", grade: 0, cls: 0, label: "배포용", test: true }
    : null);
  window.PORTAL_CLASS = klass;
  var homeHref = klass ? "index.html?c=" + klass.id : "index.html";

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
    home.href = homeHref;
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
      "border:1.5px solid #24402F",
      "border-radius:4px",
      "color:#1B2B20",
      "font-size:13px",
      "font-weight:600",
      "line-height:1",
      "text-decoration:none",
      "box-shadow:0 1px 3px rgba(0,0,0,0.08)",
      "-webkit-tap-highlight-color:transparent",
      "font-family:'Nanum Gothic','Malgun Gothic','맑은 고딕',sans-serif"
    ].join(";");
    document.body.appendChild(home);
  }

  /* ---------- 저작권 표시 ----------
     모든 수업 자료 화면 오른쪽 아래에 작게 붙습니다.
     (목록·제어판 화면은 이 파일을 쓰지 않으므로 index.html·admin.html 에 같은 표시가 따로 있습니다.) */
  function addCopyright() {
    if (document.querySelector("[data-guard-copyright]")) return;
    var c = document.createElement("a");
    c.setAttribute("data-guard-copyright", "1");
    c.href = "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ko";
    c.target = "_blank";
    c.rel = "license noopener";
    c.title = "저작자를 밝히고, 비영리로, 같은 조건이면 자유롭게 쓸 수 있어요";
    c.textContent = "© 2026 cornsilktea · CC BY-NC-SA 4.0";
    c.style.cssText = [
      "position:fixed",
      "right:8px",
      "bottom:calc(4px + env(safe-area-inset-bottom, 0px))",
      "z-index:2147483000",
      "padding:2px 8px",
      "border-radius:4px",
      "background:rgba(244,246,241,0.85)",
      "color:#5B6B5E",
      "font-size:11px",
      "line-height:1.4",
      "text-decoration:none",
      "white-space:nowrap",
      "-webkit-tap-highlight-color:transparent",
      "font-family:'Nanum Gothic','Malgun Gothic','맑은 고딕',sans-serif"
    ].join(";");
    document.body.appendChild(c);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { addHomeButton(); addCopyright(); });
  } else {
    addHomeButton();
    addCopyright();
  }

  /* data-game 이 없으면 잠금 확인은 하지 않고 버튼만 붙입니다. */
  if (!slug) return;

  /* 인터넷 주소로 열었을 때만 잠금을 검사합니다.
     (내 컴퓨터에서 파일을 직접 열어보는 file:// 미리보기는 그대로 실행) */
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  var cfg = window.PORTAL_CONFIG || {};
  var POLL = (cfg.POLL_SECONDS || 10) * 1000;

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
      "position:fixed", "top:0; right:0; bottom:0; left:0", "z-index:2147483647",
      "display:flex", "flex-direction:column",
      "align-items:center", "justify-content:center", "gap:14px",
      "background:#F4F6F1", "color:#1B2B20", "text-align:center",
      "padding:24px", "visibility:visible",
      "font-family:'Nanum Gothic','Malgun Gothic','맑은 고딕',sans-serif"
    ].join(";");
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function paint(icon, title, desc, showHome) {
    var el = makeOverlay();
    el.innerHTML = "";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;border:1px solid #C9D2C3;border-radius:4px;" +
      "padding:28px 24px;max-width:360px;width:100%";
    box.appendChild(txt("div", icon, "font-size:40px;line-height:1;margin-bottom:12px"));
    box.appendChild(txt("p", title, "font-size:18px;font-weight:600;margin:0 0 6px"));
    box.appendChild(txt("p", desc, "font-size:14px;color:#5B6B5E;margin:0;line-height:1.6"));
    if (showHome) {
      var a = document.createElement("a");
      a.href = homeHref;
      a.textContent = "목록으로 돌아가기";
      a.style.cssText = "display:block;margin-top:18px;padding:10px 14px;border:1.5px solid #24402F;" +
        "border-radius:4px;text-decoration:none;color:#1B2B20;font-size:14px;background:#fff";
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

  /* ---------- 상태 확인 ----------
     잠금은 반마다 따로입니다: portal/classes/<반>/<자료> 가 true 일 때만 열립니다.
     자료 정보(games/<자료>)는 제목을 맞추고 등록 여부를 확인하는 데만 쓰므로 처음 한 번만 읽습니다. */
  var gameId = null;          /* 실제로 등록된 자료 아이디(예전 아이디로 찾았으면 그 이름) */

  function check() {
    if (!cfg.isReady || !cfg.isReady()) {
      lock("🔧", "설정이 아직 끝나지 않았어요",
           "firebase-config.js 에 주소와 키를 넣어야 수업 자료를 열 수 있습니다.");
      return;
    }
    if (!klass) {
      lock("🏫", "학년·반이 정해지지 않았어요",
           "전자칠판의 QR 코드를 찍거나, 목록 화면에서 우리 반을 고른 뒤 들어와 주세요.");
      return;
    }
    function read(path) {
      return fetch(cfg.dbPath(path), { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        });
    }

    var meta = gameId
      ? Promise.resolve(gameId)
      : read("games/" + slug)
          .then(function (game) {
            if (game) return { id: slug, game: game };
            if (!legacySlug) return null;
            return read("games/" + legacySlug).then(function (g2) { return g2 ? { id: legacySlug, game: g2 } : null; });
          })
          .then(function (found) {
            if (!found) return null;
            var game = found.game;
            /* 탭 제목과 브라우저 공유 제목은 제어판에서 적은 제목을 따릅니다.
               (카카오톡 등 링크 미리보기는 파일 안의 <title>을 읽으므로
                링크제목맞추기.ps1 로 따로 맞춥니다.) */
            if (game.title && document.title !== game.title) {
              document.title = game.title;
              var og = document.querySelector("meta[property=\"og:title\"]");
              if (og) og.setAttribute("content", game.title);
            }
            gameId = found.id;
            return gameId;
          });

    meta
      .then(function (id) {
        if (!id) {
          lock("🔒", "아직 등록되지 않은 자료예요",
               "선생님 화면에서 이 자료를 등록하면 열립니다.");
          return null;
        }
        return read("classes/" + klass.id + "/" + id).then(function (open) {
          if (open === true) {
            unlock();
          } else if (played) {
            lock("✋", "선생님이 종료했어요",
                 "지금은 계속할 수 없어요. 다시 열리면 이어서 할 수 있어요.");
          } else {
            lock("🔒", klass.label + "은 아직 열리지 않았어요",
                 "수업 시간에 선생님이 열어주면 바로 시작할 수 있어요.");
          }
        });
      })
      .catch(function () {
        lock("📡", "연결을 확인하는 중이에요",
             "인터넷 연결을 확인해 주세요. 연결되면 자동으로 열립니다.");
      });
  }

  check();
  setInterval(check, POLL);
})();
