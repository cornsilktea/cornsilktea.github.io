/* =====================================================================
   설정 파일  —  선생님이 고치는 곳은 아래 세 줄뿐입니다.

   Firebase 콘솔 > 프로젝트 설정(톱니바퀴) > 일반 > 내 앱 > 웹 앱 을 만들면
   아래처럼 생긴 값들이 나옵니다. 그중 세 개만 옮겨 적으면 됩니다.

     apiKey:      "AIza......"                  →  API_KEY
     authDomain:  "class-games-1234.firebaseapp.com"  →  AUTH_DOMAIN
     databaseURL: "https://....firebasedatabase.app"  →  DB_URL
       (databaseURL 이 안 보이면 Realtime Database 화면 맨 위 주소를 씁니다)

   세 값 모두 웹에 공개되어도 괜찮은 값입니다.
   실제 보안은 Realtime Database 규칙(사용법.md 참고)이 담당합니다.
   ===================================================================== */

window.PORTAL_CONFIG = {
  DB_URL:      "https://cornsilktea-default-rtdb.asia-southeast1.firebasedatabase.app/",
  API_KEY:     "AIzaSyBr4X1mAHNeZVUzxfnp4ZAdOo2JXfR7-k8",
  AUTH_DOMAIN: "cornsilktea.firebaseapp.com",

  /* 잠금 상태를 다시 확인하는 주기(초). 5~10 사이를 권합니다. */
  POLL_SECONDS: 5
};

/* 학생 화면과 게임에서 쓰는 값 (DB 주소만 있으면 됩니다) */
window.PORTAL_CONFIG.isReady = function () {
  return /^https:\/\//.test(window.PORTAL_CONFIG.DB_URL);
};

/* 교사 화면에서 로그인까지 하려면 세 값이 모두 필요합니다 */
window.PORTAL_CONFIG.isAdminReady = function () {
  var c = window.PORTAL_CONFIG;
  return c.isReady() &&
         c.API_KEY.indexOf("여기에") === -1 &&
         c.AUTH_DOMAIN.indexOf("여기에") === -1;
};

window.PORTAL_CONFIG.dbPath = function (path) {
  return window.PORTAL_CONFIG.DB_URL.replace(/\/+$/, "") + "/portal/" + path + ".json";
};
