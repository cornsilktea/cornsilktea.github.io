/* =====================================================================
   대결(매칭) 화면 공용 틀 — 41번 야구가 처음 쓴다(사양서 14.3절, 2026-11-12 선생님 확정 "대결 막 공용 모듈").

   왜 공용인가: 24·30·31·38·39번이 각자 막을 복사해 만들면서 시간 맞추기(vsAt·최소 표시·자동 닫기)와
   반응형(760px 아래 위아래 쌓기)이 게임마다 조금씩 달라졌다. 틀·시간·줄 부품은 여기 한 곳에 두고,
   어떤 줄을 어떤 값으로 보여 줄지만 게임이 VersusCurtainContent 로 정한다.
   기존 24·30번 등은 41번이 끝난 뒤 따로 옮긴다(옮기기 전과 화면이 같은지 확인 후 선생님께 알림).

   시간 규칙(docs/common/random-match-prompt.md "★ 새 게임 매칭 화면"):
     - 랜덤 매칭: 방에 들어가 대기 중이면 막을 띄우고, 방장은 뜬 지 RANDOM_SHOW_MS 뒤 경기를 시작한다(afterShown).
     - 일반 방: 방장이 시작을 누르면 방에 vsAt(서버 시각)을 쓰고 ROOM_SHOW_MS 뒤 시작(requestRoomStart).
       모두 vsAt 을 구독해 같은 막을 띄우고, vsAt + ROOM_SHOW_MS + SLACK_MS 가 지나면 저절로 닫는다(시작 실패 대비).
     - 경기가 시작되면 닫되, 뜬 지 MIN_MS 가 안 됐으면 채우고 닫는다.
   게임 파일이 아니라 공용 모듈이라 "왜" 주석을 둔다.
   ===================================================================== */

type VersusSideKind = "player" | "ai" | "pending" | "empty";

interface VersusSideData {
  nick: string;
  kind: VersusSideKind;
  me: boolean;
  // 초상화 그림 주소(없으면 닉네임 첫 글자 동그라미)
  portrait: string | null;
  // 그 선수 칸 테두리·초상화 색
  color: string;
  // 게임이 채우는 자료(카드 숫자 등). 틀은 들여다보지 않는다
  payload: unknown;
}

abstract class VersusRow {
  abstract html(): string;

  static esc(value: unknown): string {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[ch]);
  }
}

class VersusTextRow extends VersusRow {
  constructor(private readonly text: string, private readonly muted = false) { super(); }
  html(): string { return '<div class="vcv-text' + (this.muted ? " muted" : "") + '">' + VersusRow.esc(this.text) + "</div>"; }
}

class VersusStatRow extends VersusRow {
  constructor(private readonly title: string, private readonly items: ReadonlyArray<readonly [string, string]>) { super(); }
  html(): string {
    return '<div class="vcv-stats"><small class="vcv-stats-title">' + VersusRow.esc(this.title) + "</small><div class=\"vcv-stats-items\">"
      + this.items.map(([label, value]) => "<span><small>" + VersusRow.esc(label) + "</small><b>" + VersusRow.esc(value) + "</b></span>").join("") + "</div></div>";
  }
}

class VersusChipRow extends VersusRow {
  constructor(private readonly chips: readonly string[]) { super(); }
  html(): string { return '<div class="vcv-chips">' + this.chips.map((chip) => "<span>" + VersusRow.esc(chip) + "</span>").join("") + "</div>"; }
}

class VersusPortraitStripRow extends VersusRow {
  constructor(private readonly items: ReadonlyArray<{ src: string | null; label: string; note: string }>) { super(); }
  html(): string {
    return '<div class="vcv-strip">' + this.items.map((item) => '<span><i>' + (item.src ? '<img alt="" src="' + VersusRow.esc(item.src) + '">' : "") + "</i><b>"
      + VersusRow.esc(item.label) + "</b><small>" + VersusRow.esc(item.note) + "</small></span>").join("") + "</div>";
  }
}

interface VersusCurtainContent {
  title(randomMatch: boolean): string;
  rowsFor(side: VersusSideData): VersusRow[];
  centerBadge(): string;
  footer?(): string;
}

// 게임이 넘기는 지금 상황. 틀은 방·표의 모양을 모르고 이 질문만 한다
interface VersusSource {
  inRoom(): boolean;
  waiting(): boolean;
  randomMatch(): boolean;
  roomShownAt(): number;
  sides(): [VersusSideData, VersusSideData] | null;
  now(): number;
}

class VersusCurtainLook {
  private static readonly STYLE_ID = "vcvStyle";
  private static readonly STYLE = [
    ".vcv{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.4vh;padding:3vh 3vw;box-sizing:border-box;background:radial-gradient(circle at 50% 45%,rgba(var(--vcv-bg,14,26,20),.88),rgba(0,0,0,.94));color:#fff;font-family:var(--sg-font,'Nanum Gothic','Malgun Gothic',sans-serif);overflow:hidden;transition:opacity .35s;}",
    ".vcv[hidden]{display:none;}.vcv.out{opacity:0;}",
    ".vcv-head{font-size:clamp(20px,3.6vh,38px);font-weight:900;letter-spacing:.04em;text-shadow:0 0 18px var(--vcv-glow,rgba(217,123,79,.5));}",
    ".vcv-body{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:3vw;width:min(96vw,1500px);}",
    ".vcv-side{display:flex;flex-direction:column;gap:1.4vh;padding:2.4vh 2vw;border-radius:14px;border:3px solid var(--vcv-c,#D97B4F);background:rgba(0,0,0,.38);box-shadow:0 0 28px rgba(0,0,0,.5);min-width:0;}",
    ".vcv-side.right{text-align:right;}",
    ".vcv-who{display:flex;align-items:center;gap:1.4vw;min-width:0;}.vcv-side.right .vcv-who{flex-direction:row-reverse;}",
    ".vcv-face{flex:none;display:flex;align-items:center;justify-content:center;width:clamp(56px,11vh,120px);height:clamp(56px,11vh,120px);border-radius:50%;border:3px solid var(--vcv-c,#D97B4F);background:rgba(255,255,255,.08);font-size:clamp(24px,5vh,54px);font-weight:900;overflow:hidden;}",
    ".vcv-face img{width:100%;height:100%;object-fit:cover;}",
    ".vcv-name{display:flex;flex-direction:column;min-width:0;}.vcv-name b{font-size:clamp(20px,4.2vh,46px);font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".vcv-name small{font-size:clamp(12px,1.9vh,18px);color:var(--vcv-c,#D97B4F);font-weight:800;}",
    ".vcv-side.me .vcv-name small::after{content:' · 나';color:#fff;}",
    ".vcv-text{font-size:clamp(15px,2.6vh,26px);font-weight:800;}.vcv-text.muted{color:#A3B0A6;}",
    ".vcv-stats{display:flex;flex-direction:column;gap:.4vh;}.vcv-stats-title{font-size:clamp(11px,1.7vh,16px);color:#A3B0A6;font-weight:800;}",
    ".vcv-stats-items{display:flex;gap:1.6vw;flex-wrap:wrap;}.vcv-side.right .vcv-stats-items{justify-content:flex-end;}",
    ".vcv-stats-items span{display:flex;flex-direction:column;min-width:clamp(52px,7vw,110px);padding:.6vh .8vw;border-radius:8px;background:rgba(255,255,255,.07);}",
    ".vcv-stats-items small{font-size:clamp(10px,1.5vh,14px);color:#CFD8D0;}.vcv-stats-items b{font-size:clamp(17px,3.2vh,34px);font-weight:900;}",
    ".vcv-chips{display:flex;gap:.6vw;flex-wrap:wrap;}.vcv-side.right .vcv-chips{justify-content:flex-end;}",
    ".vcv-chips span{padding:.3vh .8vw;border-radius:999px;background:rgba(255,255,255,.12);font-size:clamp(11px,1.7vh,16px);font-weight:800;}",
    ".vcv-strip{display:flex;gap:1vw;}.vcv-side.right .vcv-strip{justify-content:flex-end;}",
    ".vcv-strip span{display:flex;flex-direction:column;align-items:center;}.vcv-strip i{width:7vh;height:7vh;border-radius:8px;background:rgba(255,255,255,.08);overflow:hidden;}.vcv-strip img{width:100%;height:100%;object-fit:cover;}",
    ".vcv-strip b{font-size:clamp(11px,1.6vh,15px);}.vcv-strip small{font-size:clamp(10px,1.4vh,13px);color:#CFD8D0;}",
    ".vcv-vs{font-size:clamp(40px,11vh,130px);font-weight:900;font-style:italic;color:var(--vcv-accent,#D97B4F);text-shadow:0 0 30px var(--vcv-glow,rgba(217,123,79,.6));animation:vcvPulse 1.2s ease-in-out infinite;}",
    ".vcv-foot{font-size:clamp(12px,1.9vh,18px);color:#CFD8D0;}",
    ".vcv.enter .vcv-side.left{animation:vcvLeft .7s cubic-bezier(.2,.9,.3,1.2) both;}.vcv.enter .vcv-side.right{animation:vcvRight .7s cubic-bezier(.2,.9,.3,1.2) both;}",
    ".vcv.enter .vcv-vs{animation:vcvIn .6s .35s both, vcvPulse 1.2s 1s ease-in-out infinite;}",
    "@keyframes vcvLeft{from{transform:translateX(-60vw);opacity:0;}to{transform:none;opacity:1;}}",
    "@keyframes vcvRight{from{transform:translateX(60vw);opacity:0;}to{transform:none;opacity:1;}}",
    "@keyframes vcvIn{from{transform:scale(3);opacity:0;}to{transform:scale(1);opacity:1;}}",
    "@keyframes vcvPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.08);}}",
    "@media (max-width:760px){.vcv{justify-content:flex-start;overflow-y:auto;}.vcv-body{grid-template-columns:1fr;gap:1.6vh;}.vcv-side.right{text-align:left;}.vcv-side.right .vcv-who{flex-direction:row;}",
    ".vcv-side.right .vcv-stats-items,.vcv-side.right .vcv-chips,.vcv-side.right .vcv-strip{justify-content:flex-start;}.vcv-vs{font-size:clamp(34px,7vh,70px);text-align:center;}",
    ".vcv.enter .vcv-side.left,.vcv.enter .vcv-side.right{animation:vcvIn .5s both;}}"
  ].join("\n");

  static ensure(): void {
    if (document.getElementById(VersusCurtainLook.STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = VersusCurtainLook.STYLE_ID;
    style.textContent = VersusCurtainLook.STYLE;
    document.head.appendChild(style);
  }

  static sideHtml(side: VersusSideData, place: "left" | "right", label: string, rows: readonly VersusRow[]): string {
    const face = side.portrait ? '<img alt="" src="' + VersusRow.esc(side.portrait) + '">' : VersusRow.esc((side.kind === "ai" ? "🤖" : Array.from(side.nick || "?")[0]) || "?");
    return '<div class="vcv-side ' + place + (side.me ? " me" : "") + '" style="--vcv-c:' + VersusRow.esc(side.color) + '"><div class="vcv-who"><span class="vcv-face">' + face + '</span><span class="vcv-name"><b>'
      + VersusRow.esc(side.nick) + "</b><small>" + VersusRow.esc(label) + "</small></span></div>" + rows.map((row) => row.html()).join("") + "</div>";
  }
}

class VersusCurtain {
  static readonly RANDOM_SHOW_MS = 4000;
  static readonly ROOM_SHOW_MS = 4000;
  static readonly SLACK_MS = 3000;
  static readonly MIN_MS = 2000;
  static readonly FADE_MS = 350;
  static readonly ENTER_MS = 1400;
  private shownAt = 0;
  private shownKey = "";
  private closeTimer = 0;
  private fadeTimer = 0;
  private startTimer = 0;

  constructor(private readonly root: HTMLElement, private readonly content: VersusCurtainContent, private readonly source: VersusSource, private readonly labels: readonly [string, string]) {
    VersusCurtainLook.ensure();
    root.classList.add("vcv");
    root.hidden = true;
    const screen = document.querySelector(".st-screen"), computed = screen ? getComputedStyle(screen) : null;
    if (computed) {
      ["bg", "accent", "glow"].forEach((name) => { const value = computed.getPropertyValue("--st-" + name).trim(); if (value) root.style.setProperty("--vcv-" + name, value); });
    }
  }

  get shown(): boolean { return !this.root.hidden && !this.root.classList.contains("out"); }

  // 방·표·자리가 바뀔 때마다 부른다. 지금 막을 띄울지·닫을지는 여기서만 정한다
  sync(): void {
    window.clearTimeout(this.closeTimer);
    const source = this.source;
    if (!source.inRoom()) { window.clearTimeout(this.startTimer); this.hide(); return; }
    if (!source.waiting()) { this.hideAfterMin(); return; }
    const random = source.randomMatch(), left = random ? Infinity : this.roomLeftMs();
    const sides = left > 0 ? source.sides() : null;
    if (!sides) { this.hide(); return; }
    this.show();
    this.render(random, sides);
    if (isFinite(left)) this.closeTimer = window.setTimeout(() => this.sync(), left);
  }

  // 랜덤 매칭 방장: 막이 뜬 지 RANDOM_SHOW_MS 가 지나야 시작한다
  afterShown(run: () => void): void {
    window.clearTimeout(this.startTimer);
    const wait = this.root.hidden ? VersusCurtain.RANDOM_SHOW_MS : this.shownAt + VersusCurtain.RANDOM_SHOW_MS - performance.now();
    if (wait > 0) this.startTimer = window.setTimeout(run, wait);
    else run();
  }

  // 일반 방 방장: vsAt 을 쓰고 ROOM_SHOW_MS 뒤 시작한다. 이미 막이 떠 있으면(두 번 누름) 무시
  requestRoomStart(writeShownAt: (at: number) => void, run: () => void): void {
    if (this.roomLeftMs() > 0) return;
    writeShownAt(this.source.now());
    window.clearTimeout(this.startTimer);
    this.startTimer = window.setTimeout(run, VersusCurtain.ROOM_SHOW_MS);
  }

  cancelStart(): void { window.clearTimeout(this.startTimer); }

  private roomLeftMs(): number {
    const at = this.source.roomShownAt();
    return at ? at + VersusCurtain.ROOM_SHOW_MS + VersusCurtain.SLACK_MS - this.source.now() : 0;
  }

  private render(random: boolean, sides: [VersusSideData, VersusSideData]): void {
    const content = this.content, title = content.title(random);
    const html = '<div class="vcv-head">' + VersusRow.esc(title) + '</div><div class="vcv-body">'
      + VersusCurtainLook.sideHtml(sides[0], "left", this.labels[0], content.rowsFor(sides[0]))
      + '<div class="vcv-vs">' + VersusRow.esc(content.centerBadge()) + "</div>"
      + VersusCurtainLook.sideHtml(sides[1], "right", this.labels[1], content.rowsFor(sides[1])) + "</div>"
      + (content.footer ? '<div class="vcv-foot">' + VersusRow.esc(content.footer()) + "</div>" : "");
    if (html === this.shownKey) return;
    const animate = !this.shownKey;
    this.shownKey = html;
    this.root.innerHTML = html;
    if (animate) {
      this.root.classList.add("enter");
      window.setTimeout(() => this.root.classList.remove("enter"), VersusCurtain.ENTER_MS);
    }
  }

  private show(): void {
    window.clearTimeout(this.fadeTimer);
    if (this.root.hidden || this.root.classList.contains("out")) { this.shownAt = performance.now(); this.shownKey = ""; }
    this.root.classList.remove("out");
    this.root.hidden = false;
  }

  private hideAfterMin(): void {
    if (this.root.hidden) return;
    const left = this.shownAt + VersusCurtain.MIN_MS - performance.now();
    if (left > 0) this.closeTimer = window.setTimeout(() => this.hide(), left);
    else this.hide();
  }

  private hide(): void {
    if (this.root.hidden || this.root.classList.contains("out")) return;
    this.root.classList.add("out");
    this.fadeTimer = window.setTimeout(() => { this.root.hidden = true; this.root.classList.remove("out", "enter"); this.root.textContent = ""; this.shownKey = ""; }, VersusCurtain.FADE_MS);
  }
}
