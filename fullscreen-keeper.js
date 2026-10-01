/* 터치 기기에서 화면을 만졌다 뗄 때 전체화면을 요청해 상태표시줄·주소창·아래 도구모음을 숨기는 공용 모듈.
   브라우저는 사용자 동작 안에서만 전체화면을 허용하므로 손을 뗄 때마다(전체화면이 아닐 때) 다시 요청한다.
   요청이 3번 실패하거나 지원하지 않는 브라우저(아이폰 사파리 등)면 그만 시도한다.
   쓰는 법: <script src="fullscreen-keeper.js" data-watch></script> (data-watch 가 있으면 바로 시작).
   직접 시작하려면 new FullscreenKeeper(document).watch(). */
(function () {
  var FULLSCREEN_MAX_FAILS = 3;

  class FullscreenKeeper {
    constructor(doc) { this.doc = doc; this.fails = 0; }
    supported() { return !!this.doc.documentElement.requestFullscreen && this.fails < FULLSCREEN_MAX_FAILS; }
    isOn() { return !!this.doc.fullscreenElement; }
    enter() {
      var keeper = this;
      if (keeper.isOn() || !keeper.supported()) return;
      try {
        var asked = keeper.doc.documentElement.requestFullscreen({ navigationUI: "hide" });
        if (asked && asked.catch) asked.catch(function () { keeper.fails++; });
      } catch (err) { keeper.fails++; }
    }
    onTouchRelease(e) { if (e.pointerType === "touch") this.enter(); }
    watch() {
      this.doc.addEventListener("pointerup", this.onTouchRelease.bind(this), true);
    }
  }

  window.FullscreenKeeper = FullscreenKeeper;
  var tag = document.currentScript;
  if (tag && tag.hasAttribute("data-watch") && !/[?&](test|sim)(&|$)/.test(location.search)) new FullscreenKeeper(document).watch();
})();
