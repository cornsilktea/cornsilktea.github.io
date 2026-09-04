/* 홈 화면 아이콘을 앱처럼(주소창 없이) 열기 위해 필요한 최소 서비스 워커입니다.
   내용을 저장(캐시)하지 않고 그대로 통과시키기만 하므로,
   게임 파일을 수정해 올리면 학생 기기에도 바로 반영됩니다. */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  event.respondWith(fetch(event.request));
});
