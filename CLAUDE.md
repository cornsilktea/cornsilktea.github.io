# 수업 자료 저장소 작업 지침

이 파일은 저장소에 함께 올라가므로 어느 컴퓨터에서 열어도 같은 규칙이 적용된다.
(개별 컴퓨터의 자동 메모리에만 있던 규칙을 여기로 옮겼다.)

## 새 자료(HTML)를 만들 때 — 반드시

1. **잠금 확인 두 줄을 `<head>` 맨 앞에 넣는다.** 이게 없으면 선생님이 제어판에서
   잠가도 학생 화면이 멈추지 않는다. `data-game` 은 `초기데이터.json` 의 아이디와 같아야 한다.
   ```html
   <script charset="utf-8" src="firebase-config.js"></script>
   <script charset="utf-8" src="access-guard.js" data-game="새자료아이디"></script>
   ```
   - 가드가 왼쪽 위에 `← 목록으로` 버튼(높이 32px, top 8px)을 붙이므로 화면 위쪽에
     고정(fixed) HUD 가 있으면 46px 아래로 내린다.
   - 잠금 없이 버튼만 필요한 화면(예: 투표 화면)은 `data-game` 없이 `access-guard.js` 한 줄만.
   - **링크는 반마다 다르다.** 목록은 `index.html?c=1-1`, 자료는 `6.snakegame.html?c=1-1` 처럼 `?c=<학년>-<반>` 이
     붙고, 잠금은 Firebase `portal/classes/<반>/<자료>` 를 본다(`games/<자료>/open` 은 더 이상 안 씀).
     가드가 `window.PORTAL_CLASS`(`{id,grade,cls,label}` 또는 null)를 만들어 주므로 학년·반이 필요한 게임은 이걸 읽는다.
     자료 안에서 다른 자료로 링크할 때는 `location.search` 를 그대로 붙여 반이 유지되게 한다.
     학급 목록(1·2학년 각 5반)은 `data.js` 의 `CLASSES` 한 곳에만 있다.
   - 파일에 `Content-Security-Policy` 가 있으면 `connect-src` 에 Firebase 주소를 허용한다(사용법.md 3절).
2. **파일 이름은 `<번호>.<영문이름>.html`**, 번호는 저장소 최대 번호 + 1 (`ls` 로 확인). 구분자는 점.
3. **`초기데이터.json` 의 `portal.games` 에 항목 추가**(title·url·memo·order·open·units·unitsSet).
   `open` 은 참고용일 뿐이다 — 제어판에서 등록하면 **어떤 자료든 모든 반에서 잠긴 채로** 시작하고
   선생님이 반별로 연다. 단원을 모르면 `units: []`.
4. `pwsh ./링크제목맞추기.ps1` 실행 → 파일의 `<title>`·og: 태그를 제어판 제목으로 채움. `<title>` 은 손으로 고치지 않는다.
5. **커밋·푸시까지** 한다. 학생 노출 여부만 선생님이 제어판(admin.html)에서 정한다.
6. 인라인 스크립트를 고친 뒤에는 파싱 검사(브라우저에서 `<script>` 블록마다 `new Function(src)`)를 한다.
   `ctx.font` 에 글꼴 이름을 넣을 땐 `"Nanum Gothic", "Malgun Gothic", sans-serif` 큰따옴표.
   "버튼이 안 눌린다"는 보고는 콘솔 SyntaxError 부터 의심.

## 디자인·조작 규칙

- **게임 파일(번호.html, court-cases.js)에는 주석을 달지 않고 변수·함수 이름으로 설명한다.** 공용 모듈(access-guard.js·world-record.js·firebase-config.js·data.js·sw.js·theme.css)과
  index.html·admin.html 은 "왜 이렇게 했는지" 주석을 유지한다. 그림은 HTML에 base64로 넣지 말고 `img/<게임>/` 파일로 둔다.
  폴링·요청 빈도(네트워크 동작)는 선생님께 먼저 묻고 바꾼다.

- **색감은 `theme.css` 의 `--sg-*` 토큰(스네이크 톤), 글꼴은 나눔고딕(`var(--sg-font)`)으로 고정.**
  보색이 필요하면 `#D97B4F` 만 쓴다. 캔버스 안에서는 CSS 변수가 안 먹으니 hex 값 그대로.
  예외: 14(어두운 청록)·19(라면가게 크림) 배경과 게임 안 그림은 색을 건드리지 않음.
  14번 3D 장면의 하늘·안개 틴트(`C_DAWN/C_NOON/C_DUSK`)는 정글 그린 톤으로 정했다(2026-09-24 리마스터).
- **3D(three.js) 자료는 학생 기기 갤럭시탭 S7(가장 느림)·S9 기준으로 맞춘다.** 터치 기기는 픽셀 배율 상한을
  1.25~1.5 로 두고, 게임 중 프레임이 오래 느리면 배율을 0.25씩 1.0까지 내린 뒤 블룸을 끄는 `adaptQuality`
  (14·24·25번, 45fps 아래가 3초쯤 이어지면 한 단계)를 넣는다. 24번은 맨 먼저 바닥 효과(타이어 자국·연기·흙먼지·불꽃, `GFX`)를 끄고 그다음 배율·블룸·그림자 순으로 내리며, 태블릿에서는 블룸 없이 시작한다.
  24번은 내린 단계 수를 기기 `localStorage`(`turbolap_quality_v1`)에 저장해 다음 접속 때 그 단계부터 시작한다(첫 판 버벅임은 기기당 한 번).
  31번(좀비)도 같은 방식(`zombieoutbreak_quality_v1`)이고 단계는 실내 안개 너머 안 그리기 → 배율 → 잔상 → 형광등 번짐 → 커튼 → 달빛 순. 터치 기기는 첫 단계를 켠 채 시작한다.
  같은 모델을 수백 개 까는 InstancedMesh 는 `frustumCulled=false` 로 통째로 그리지 말고 구역(24번 `TREE_CELL`)별로 나눠 화면·그림자 밖 구역을 건너뛰게 한다.
  M2 맥북 에어 대비 대략 S7 은 1/5, S9 은 1/2 성능으로 본다. 실시간 조명(PointLight·SpotLight)은 개수만큼 모든 화소가 계산하므로 몇 개로 합치고,
  빛나는 표지·전등은 MeshBasicMaterial 로만 표현한다. 조명의 `visible` 을 켜고 끄면 셰이더를 다시 만들어 화면이
  멈추므로 `intensity` 로 끈다. 텍스처는 2048px 이하. 주소 끝에 `&fps` 를 붙이면 `access-guard.js` 가 초당 화면 수를 띄운다.
- **게임 시작 화면은 30·31번 모양으로 만든다.** 게임 화면 위에 어두운 반투명 판(`theme.css` 의 `st-*` 클래스:
  `.st-screen > .st-wrap > .st-hero(.st-title·.st-sub) + .st-card…`)을 깔고, 위에서부터
  제목 → **게임 실행 관련(시작·방 만들기·난이도 선택 등 버튼)** → 기록(`.st-recs`) → **조작 방법(`.st-keys`+`kbd`)** → **규칙(`.st-rules`)** 순.
  **제목 아래에는 게임 이름만 둔다** — "튕겨서 떨어뜨려라" 같은 부제·소개 문장(`.st-sub`)은 넣지 않고, 필요한 내용은 규칙 칸으로 옮긴다.
  (`.st-title span` 둘째 줄은 "타워 디펜스"·"챌린지"처럼 이름의 일부일 때만 쓴다.)
  색은 그 게임의 `.st-screen` 에서 `--st-*` 변수(판 색 `--st-bg`, 강조 `--st-accent`, 제목 둘째 줄 `--st-title2`, 번짐 `--st-glow`)만 바꿔 분위기를 맞춘다.
- 칠판(전자칠판) 형식 퀴즈는 `7.drawing.html` 형식을 따르고 `theme.css` 를 링크하지 않는다(15번도 같은 형식).
- 손가락으로 **꾹 누르는(길게 누르는) 조작**은 `<canvas>` 에 `touch-action:none` 을 주면 `access-guard.js` 가
  아이폰 돋보기(확대 창)·복사 풍선을 알아서 막는다. 캔버스가 아닌 요소(div 버튼 등)를 길게 누르는 조작은
  23번처럼 그 요소에 `touchstart` → `preventDefault()`(`{passive:false}`) 를 직접 붙인다(click 은 안 생기니 pointerdown 으로 처리).
- 방향키를 쓰는 프로그램은 **WASD 도 함께** 받는다. 방향키는 `e.key`, WASD 는 한글 IME 대비 `e.code`(KeyW…)로 판정.
- 개인전(1인) 게임은 **최고 기록**을 `localStorage`(`<게임>_best_v1`, try/catch)에 저장하고
  시작 카드·HUD·결과 화면(갱신 시 `NEW`) 세 곳에 표시한다. 패턴은 18·19번 참고.
- 개인전 게임은 **세계 신기록**(Firebase `records/<게임>/all`, 모든 학생 공통)도 함께 둔다.
  `world-record.js` 를 `access-guard.js` 다음 줄에 넣고 `WorldRecord("<게임>", {lower, format})` 로 만든다
  (시간처럼 작을수록 좋은 기록은 `lower:true` — 규칙이 0 이상만 받아 `10억 - 값` 으로 저장). 게임 종료 시 `WR.prompt(값)` 을 부르면 신기록일 때만
  학년·반·이름 입력 창이 뜬다(다 채우기 전엔 안 닫힘). 화면 표기는 "개인 최고 기록" / "세계 신기록" + 아래 작게 `WR.who()`. 게임 이름은 규칙상
  소문자 영문만(`^[a-z]+$`). 새 게임은 `데이터베이스규칙.json` 의 `.validate` 에 **점수 상한 한 줄**을 추가하고
  선생님이 콘솔에 다시 게시하도록 알린다(없으면 F12 로 아무 점수나 넣을 수 있음).
  개인 기기의 localStorage 최고 기록은 그대로 유지한다. 패턴은 1·19·20번 참고.
- 개인전 게임은 **우리 반 신기록**도 함께 둔다. 반별 링크(`?c=`)로 들어오면 `WorldRecord()` 가 알아서
  `WR.cls`(같은 모양: `rec·loaded·text()·who()·beats()`)를 만들고, `WR.prompt(값)` 이 세계 신기록이면 학년·반·이름 창을,
  우리 반 신기록만이면 이름 창을 띄운다(둘 다 등록). 저장 경로는 `records/<게임>/<key>cls<학년글자><반글자>`
  (1학년→a·2학년→b, 1반→a…5반→e. 예: `allclsbc` = 2학년 3반) — 규칙이 소문자 영문만 받아 숫자 대신 글자.
  화면에는 세계 신기록 옆에 "우리 반 신기록" 칸을 `hidden` 으로 두고 `WR.cls` 가 있을 때만 보인다(`[hidden]{display:none !important}` 필요).
  `wrBeat` 로 prompt 를 가리는 게임은 `WR.beatsClass(값)` 도 함께 본다. 패턴은 6·20·25번 참고.

## 환경

- 로컬 미리보기: `.claude/launch.json` 의 `static`(pwsh 정적 서버, 8765 포트). `.claude/` 는 gitignore 되어 있다.
- 잠금 검사는 http(s) 로 열었을 때만 동작하고 `file://` 미리보기는 그대로 실행된다.
- `git push` 가 샌드박스 네트워크 차단으로 멈추면 샌드박스를 끄고 실행한다.
- 이미 등록된 자료의 파일 이름을 바꾸면 학생 링크가 끊어진다. 제어판에서 선생님이 직접 고쳐야 한다고 알린다.
