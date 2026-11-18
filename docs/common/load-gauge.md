# 공용 로딩 게이지 (`common/load-gauge.js`)

2026-11-18 선생님 요청. 41번 야구의 로딩 게이지(`BbLoadGauge`)를 공용 모듈로 뽑아 **3D 에셋(모델·애니메이션·텍스처)을 받는 모든 게임**이 같은 모양으로 쓴다.
**앞으로 만드는 게임도 에셋을 받으면 처음부터 이 게이지를 붙인다.** 문구는 게임마다 그 게임에 맞게 쓴다.

- 소스: `ts/common/load-gauge.ts` → 컴파일 결과 `common/load-gauge.js`
- 모양: `common/theme.css` 의 `.lg-*` (어두운 판, 주황 막대, 실패하면 빨간 막대 + `다시 불러오기`)
- HTML: `common/character-kit.js` 앞(게임 스크립트보다 먼저)에 한 줄
  ```html
  <script charset="utf-8" src="common/load-gauge.js?v=20261118a"></script>
  ```

## 클래스

| 클래스 | 하는 일 |
| --- | --- |
| `LoadGauge<K>` | 게이지 판. `phase(단계)` 는 그 단계 문구·위치를 보이고 한 프레임 쉰다(뒤에 무거운 장면 만들기가 와도 문구가 먼저 그려짐). `count(단계, {done,total})` 는 `문구 n / 전체` 와 함께 `at → at+span` 사이를 채운다. 15초가 넘으면 "인터넷이 느리면…" 을 덧붙인다. `fail(문구, 다시하기?)` 는 빨간 막대·기기 이름·`다시 불러오기`(주지 않으면 새로고침). `finish()` 는 숨긴다(다시 `phase`·`count` 하면 또 보임). `contextLost(lost)` 는 WebGL 이 꺼졌을 때 안내. `say(글, 위치)`·`title(글)` 은 표에 없는 문구용. |
| `LoadCounter` | 여러 파일을 한꺼번에 받을 때 센다. `counter.track(약속, 이름)` 으로 감싸면 끝날 때마다 `onChange` 를 부른다. `CharacterAssets.progress`(캐릭터 파일)와 같은 `{done,total}` 모양이라 그대로 `count` 에 넘긴다. |
| `ThreeBoot<K, T>` | three.js 를 동적으로 가져오는 시작점. 라이브러리를 받는 동안에도 게이지를 보이고 30초 안에 못 받으면 안내·다시 불러오기. 만든 게임 객체는 `started` 에 남는다(확인용 화면의 `window.__game`). |

## 새 게임에 붙이는 순서 (TS 게임)

1. 게임 `.ts` 에 단계 표와 시작 클래스를 둔다(문구는 게임에 맞게):
   ```ts
   type XxLoadStep = "library" | "characters" | "models" | "world";

   class XxLoading {
     static readonly PHASES: Readonly<Record<XxLoadStep, LoadGaugePhase>> = {
       library: { at: 0.06, text: "그래픽 라이브러리 받는 중…" },
       characters: { at: 0.1, span: 0.35, text: "캐릭터 파일 받는 중…" },
       models: { at: 0.45, span: 0.4, text: "○○ 경기장 블록 받는 중…" },
       world: { at: 0.9, text: "○○ 경기장 만드는 중…" },
     };
     static gauge(): LoadGauge<XxLoadStep> { return new LoadGauge({ title: "○○ 준비 중", phases: XxLoading.PHASES }); }
   }

   class XxBoot {
     private readonly three: ThreeBoot<string, XxGame>;
     constructor(importer: () => Promise<ThreeLibs>) {
       const gauge = XxLoading.gauge();
       this.three = new ThreeBoot(gauge, "library", importer, (libs) => new XxGame(libs, gauge));
     }
     get game(): XxGame | null { return this.three.started; }
   }
   ```
2. 게임 클래스는 `constructor(libs, private readonly gauge: LoadGauge<XxLoadStep>)` 로 받아
   - `assets.onProgress = (p) => this.gauge.count("characters", p);`
   - 모델 묶음은 `load(…, counter = new LoadCounter())` 처럼 받아 `counter.track(loader.loadAsync(…), 이름)` 으로 감싼다. 게임은 `new LoadCounter((c) => this.gauge.count("models", c))` 를 넘긴다.
   - 장면 만들기 앞에 `await this.gauge.phase("world");`, 다 되면 `this.gauge.finish();`, 실패는 `this.gauge.fail("불러오지 못했어요: " + LoadGauge.describe(error))`.
3. HTML 끝의 모듈은 정적 `import` 대신 함수로 넘긴다(라이브러리 받는 동안에도 게이지가 보이게):
   ```html
   <script type="module">
   new XxBoot(async () => {
     const [THREE, loaders, SkeletonUtils] = await Promise.all([import("three"), import("three/addons/loaders/GLTFLoader.js"), import("three/addons/utils/SkeletonUtils.js")]);
     return { THREE, GLTFLoader: loaders.GLTFLoader, SkeletonUtils };
   });
   </script>
   ```
4. 예전 `<div id="loading">` 와 그 CSS 는 지운다. 확인용 화면 도구(`tools/*-test-page.js`)가 `new XxGame(` 을 찾아 바꾸던 곳은 `new XxBoot(` → `window.__boot` + `__game` 게터로 바꾼다(`tools/climb-test-page.js` 참고).

## 자리(`place`)

- `center`(기본): 받는 동안 할 게 없는 게임(38·39·40·42) — 화면 가운데.
- `bottom`: 받는 동안에도 시작 화면을 볼 수 있는 게임(24·25·30·31·32·41) — 아래쪽 가운데. 게임 화면(경기 중)에서는 숨긴다(24·25·30 은 메뉴가 안 보이면 `finish()`).

## 게임별 단계·문구 (2026-11-18)

| 게임 | 제목 | 단계 |
| --- | --- | --- |
| 24 터보 랩 | 서킷 준비 중 | 서킷 그래픽 받는 중 n/N → 코스 준비 중 / 자동차 모델 받는 중. 실패하면 자동차 모델·일부 자료 안내 + `다시 불러오기`(`LoadRetry.retryAll`, 새로고침 안 함) |
| 25 서바이벌 | 전장 준비 중 | 병사·총·탄약 모델 받는 중 n/N (`SurvivalLoading`, `loadModel` 이 셈) |
| 30 팀 배틀 | 아레나 준비 중 | 캐릭터·무기·아레나 장식 받는 중 n/N. 실패하면 "단순한 모양으로 보여요…" + `다시 불러오기`(`models.loadKit`, 새로고침 안 함). `KitLoadNote` 가 그린다. `&test`·`&sim` 에서는 만들지 않는다 |
| 31 좀비 | 3D 학교 준비 중 | 그래픽 라이브러리 → 학생·좀비 모델 받는 중 n/N (`ZombieLoading`) |
| 32 미니게임 모음 | 미니게임 모음 준비 중 | 그래픽 라이브러리 → 캐릭터 파일 n/N → 미니게임 경기장 준비 중 n/7 → 대기실 꾸미는 중 |
| 38 눈싸움 | 눈싸움장 준비 중 | 라이브러리 → 캐릭터 파일 → 눈 덮인 마을 건물 받는 중 → 눈싸움 마을 만드는 중 |
| 39 물풍선 | 물풍선 놀이터 준비 중 | 라이브러리 → 캐릭터 파일 → 물풍선 놀이터 블록 받는 중 → 물풍선 놀이터 만드는 중 |
| 40 동마의 숲 | 동마의 숲 준비 중 | 라이브러리 → 섬 지도 받는 중 → 캐릭터·나무·가구 받는 중 n/N → 숲과 마을 꾸미는 중 → 계정 확인하는 중 |
| 41 야구 | 야구장 준비 중 | 라이브러리 → 선수 파일 받는 중 n/N → 야구장 만드는 중 → 선수 준비하는 중 (`BbLoading`, 아래쪽) |
| 42 타워 클라임 | 타워 준비 중 | 라이브러리 → 캐릭터 파일 → 탑 블록·소품 받는 중 → 탑 쌓는 중 → 캐릭터 준비하는 중 |

수치(`at`·`span`)는 받는 파일 수에 맞춘 대략값이다. 막대가 한 단계에서 오래 멈춰 보이면 그 단계의 `span` 을 늘린다.
