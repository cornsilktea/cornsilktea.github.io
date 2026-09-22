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

- **색감은 `theme.css` 의 `--sg-*` 토큰(스네이크 톤), 글꼴은 나눔고딕(`var(--sg-font)`)으로 고정.**
  보색이 필요하면 `#D97B4F` 만 쓴다. 캔버스 안에서는 CSS 변수가 안 먹으니 hex 값 그대로.
  예외: 14(어두운 청록)·19(라면가게 크림) 배경과 게임 안 그림은 색을 건드리지 않음.
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
