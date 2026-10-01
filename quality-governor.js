/* =====================================================================
   화질 자동 조절 (3D 자료 공용)  —  14·24·25·31번이 따로 갖고 있던 adaptQuality 를 한 곳으로 모은 것

   학생 기기(갤럭시탭 S7 등)에서 게임 중 프레임이 오래 느리면 화질 단계를 하나씩 낮춘다.

   사용법
     <script charset="utf-8" src="quality-governor.js"></script>
     const QG = QualityGovernor({
       steps: [ ...단계 함수... ],      // 앞에서부터 시도. 함수는 "낮췄으면 true, 더 낮출 게 없으면 false" 를 돌려준다.
                                        // true 를 돌려주는 동안 같은 단계가 반복된다(배율을 0.25씩 내리는 식).
       storageKey: "turbolap_quality_v1",  // 있으면 내린 횟수를 기기에 저장(없으면 저장 안 함)
       isPlaying: () => state === "race",  // 이 때만 프레임을 센다(생략하면 항상)
       slowSec: 0.022, slowLimit: 90        // 한 프레임이 slowSec 보다 느린 횟수가 slowLimit 을 넘으면 한 단계 내림
     });
     QG.restore(최소횟수?)   // 저장된 횟수만큼(또는 최소횟수만큼) 미리 내려 두고 시작 — 장면이 만들어진 뒤에 부른다
     QG.update(프레임초)      // 매 프레임 호출
     QG.lower()              // 즉시 한 단계 내림(내렸으면 true)

   QualityGovernor.times(n, 함수)  — 함수를 최대 n 번만 적용하는 단계로 감싼다(한 번만이면 times(1, …))
   ===================================================================== */
(function (root) {
  var MAX_FRAME_SEC = 0.25;

  function times(limit, applyOnce) {
    var used = 0;
    return function () {
      if (used >= limit || applyOnce() === false) return false;
      used++;
      return true;
    };
  }

  function QualityGovernor(options) {
    var steps = options.steps;
    var storageKey = options.storageKey || null;
    var isPlaying = options.isPlaying || function () { return true; };
    var slowSec = options.slowSec;
    var slowLimit = options.slowLimit;
    var slowFrames = 0;
    var stepsTaken = 0;

    function saveSteps() {
      if (!storageKey) return;
      try { localStorage.setItem(storageKey, String(stepsTaken)); } catch (e) {}
    }

    function savedSteps() {
      if (!storageKey) return 0;
      try { return Math.max(0, parseInt(localStorage.getItem(storageKey), 10) || 0); } catch (e) { return 0; }
    }

    function lower() {
      for (var i = 0; i < steps.length; i++) {
        if (steps[i]()) {
          stepsTaken++;
          saveSteps();
          return true;
        }
      }
      return false;
    }

    function restore(minimumSteps) {
      var target = Math.max(savedSteps(), minimumSteps || 0);
      for (var k = 0; k < target && lower(); k++);
    }

    function update(frameSec) {
      if (!isPlaying() || frameSec > MAX_FRAME_SEC) return;
      if (frameSec > slowSec) slowFrames++;
      else if (slowFrames > 0) slowFrames--;
      if (slowFrames <= slowLimit) return;
      slowFrames = 0;
      lower();
    }

    return {
      update: update,
      lower: lower,
      restore: restore,
      get stepsTaken() { return stepsTaken; }
    };
  }

  QualityGovernor.times = times;
  root.QualityGovernor = QualityGovernor;
  if (typeof module !== "undefined" && module.exports) module.exports = QualityGovernor;
})(typeof window !== "undefined" ? window : globalThis);
