"use strict";
/* =====================================================================
   패치노트(2026-10-29 선생님 요청, 30번 팀 배틀이 첫 사용)

   선생님이 제어판(admin.html)에서 게임별 패치노트를 쓰면, 로그인한 학생이 그 게임에 처음 들어올 때 한 번 창으로 보여 준다.
   창을 닫으면 그 계정은 이 기기에서 같은 패치노트를 다시 보지 않는다(새 패치노트를 게시하면 다시 뜬다).

   저장 위치: portal/patchNotes/<게임 키> = { id 게시 번호(시각), title 제목, body 내용(글자 그대로), at 게시 시각 }
     portal 은 누구나 읽고 선생님 계정만 쓰는 곳이라 데이터베이스 규칙을 바꾸지 않아도 된다(패치노트는 공개 글이라 괜찮음).
   읽기: 게임 화면이 열리고 로그인이 끝났을 때 REST 로 한 번만(폴링 없음).
   본 기록: 기기 localStorage(PatchNoteSeen.STORAGE_KEY) = { <게임>: { <uid>: 본 게시 번호 } } — 다른 기기에서는 한 번 더 뜰 수 있다.
   ===================================================================== */
class PatchNoteCodec {
    static path(game) {
        return "portal/patchNotes/" + game;
    }
    static decode(raw) {
        if (!raw || typeof raw !== "object")
            return null;
        const note = raw;
        const id = Number(note.id);
        const body = typeof note.body === "string" ? note.body : "";
        if (!id || !body.trim())
            return null;
        return { id, title: typeof note.title === "string" ? note.title : "", body, at: Number(note.at) || id };
    }
    static make(title, body, id, at) {
        return { id, title: title.trim().slice(0, PatchNoteCodec.TITLE_MAX), body: body.replace(/\r\n/g, "\n").trim().slice(0, PatchNoteCodec.BODY_MAX), at };
    }
}
PatchNoteCodec.TITLE_MAX = 80;
PatchNoteCodec.BODY_MAX = 4000;
class PatchNoteSeen {
    constructor(game) {
        this.game = game;
    }
    has(uid, id) {
        const all = this.read();
        return Number(all[this.game]?.[uid]) === id;
    }
    mark(uid, id) {
        const all = this.read();
        all[this.game] = Object.assign({}, all[this.game], { [uid]: id });
        try {
            localStorage.setItem(PatchNoteSeen.STORAGE_KEY, JSON.stringify(all));
        }
        catch (error) { /* 저장이 막힌 기기는 다음에 한 번 더 뜬다 */ }
    }
    read() {
        try {
            const parsed = JSON.parse(localStorage.getItem(PatchNoteSeen.STORAGE_KEY) || "{}");
            return parsed && typeof parsed === "object" ? parsed : {};
        }
        catch (error) {
            return {};
        }
    }
}
PatchNoteSeen.STORAGE_KEY = "patchnote_seen_v1";
class PatchNoteText {
    static esc(value) {
        return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    }
    static when(at) {
        const d = new Date(at);
        return (d.getMonth() + 1) + "월 " + d.getDate() + "일";
    }
}
/* 게임 화면 위 창: 30번 결과 창과 같은 어두운 반투명 판·주황 윗선(theme.css 색 토큰과 나눔고딕) */
class PatchNoteDialog {
    show(gameTitle, note, onClose) {
        PatchNoteDialog.ensureStyle();
        const back = document.createElement("div");
        back.className = "pn-back";
        back.setAttribute("role", "dialog");
        back.setAttribute("aria-modal", "true");
        back.innerHTML = '<div class="pn-box"><div class="pn-head"><div class="pn-tag">📢 ' + PatchNoteText.esc(gameTitle) + " 패치노트 · " + PatchNoteText.when(note.at) + "</div>" +
            '<div class="pn-title">' + PatchNoteText.esc(note.title || "새 패치 안내") + "</div></div>" +
            '<div class="pn-body">' + PatchNoteText.esc(note.body) + "</div>" +
            '<div class="pn-foot"><button class="pn-ok" type="button">확인</button></div></div>';
        const close = () => { back.remove(); onClose(); };
        back.querySelector(".pn-ok").addEventListener("click", close);
        document.body.appendChild(back);
    }
    static ensureStyle() {
        if (document.getElementById(PatchNoteDialog.STYLE_ID))
            return;
        const style = document.createElement("style");
        style.id = PatchNoteDialog.STYLE_ID;
        style.textContent = PatchNoteDialog.STYLE;
        document.head.appendChild(style);
    }
}
PatchNoteDialog.STYLE_ID = "patchNoteStyle";
PatchNoteDialog.STYLE = [
    ".pn-back{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.55);}",
    ".pn-box{width:100%;max-width:560px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;border-radius:14px;background:rgba(16,24,19,.96);",
    "border:1px solid rgba(255,255,255,.16);border-top:3px solid #D97B4F;color:#EEF2EE;font-family:var(--sg-font,\"Nanum Gothic\",\"Malgun Gothic\",sans-serif);box-shadow:0 12px 40px rgba(0,0,0,.5);}",
    ".pn-head{padding:18px 22px 8px;}",
    ".pn-tag{font-size:13px;font-weight:800;color:#D97B4F;}",
    ".pn-title{margin-top:4px;font-size:22px;font-weight:800;line-height:1.35;}",
    ".pn-body{padding:6px 22px 4px;overflow:auto;white-space:pre-wrap;word-break:keep-all;font-size:16px;line-height:1.7;color:#DDE4DE;}",
    ".pn-foot{padding:14px 22px 18px;text-align:right;}",
    ".pn-ok{min-width:120px;padding:10px 18px;border:0;border-radius:10px;background:#D97B4F;color:#fff;font:800 16px var(--sg-font,\"Nanum Gothic\",sans-serif);cursor:pointer;}"
].join("");
/* 게임 쪽: 로그인이 끝나면 패치노트를 한 번 읽고, 이 계정이 아직 안 본 것이면 창을 띄운다 */
class PatchNoteNotice {
    constructor(game, gameTitle, dialog = new PatchNoteDialog()) {
        this.game = game;
        this.gameTitle = gameTitle;
        this.dialog = dialog;
        this.checkedFor = "";
        this.seen = new PatchNoteSeen(game);
    }
    watch() {
        document.addEventListener(PatchNoteNotice.USER_EVENT, () => { void this.check(); });
        void this.check();
    }
    async check() {
        const user = window.PORTAL_USER, config = window.PORTAL_CONFIG;
        if (!user || !config || this.checkedFor === user.uid)
            return;
        this.checkedFor = user.uid;
        try {
            const response = await fetch(config.DB_URL.replace(/\/+$/, "") + "/" + PatchNoteCodec.path(this.game) + ".json", { cache: "no-store" });
            const note = response.ok ? PatchNoteCodec.decode(await response.json()) : null;
            if (!note || this.seen.has(user.uid, note.id))
                return;
            this.dialog.show(this.gameTitle, note, () => this.seen.mark(user.uid, note.id));
        }
        catch (error) {
            this.checkedFor = "";
        }
    }
}
PatchNoteNotice.USER_EVENT = "portal-user-changed";
/* 제어판 쪽: 게임별 패치노트 쓰기·고치기·내리기 */
class PatchNoteEditor {
    constructor(io, ids) {
        this.io = io;
        this.ids = ids;
        this.current = null;
    }
    bind() {
        const select = this.el(this.ids.game);
        select.innerHTML = PatchNoteEditor.GAMES.map((game) => '<option value="' + game.key + '">' + PatchNoteText.esc(game.title) + "</option>").join("");
        select.addEventListener("change", () => { void this.load(); });
        this.el(this.ids.publish).addEventListener("click", () => { void this.publish(); });
        this.el(this.ids.remove).addEventListener("click", () => { void this.remove(); });
        this.el(this.ids.title).addEventListener("input", () => this.preview());
        this.el(this.ids.body).addEventListener("input", () => this.preview());
    }
    async load() {
        this.say("불러오는 중…");
        try {
            this.current = PatchNoteCodec.decode(await this.io.read(PatchNoteCodec.path(this.game())));
            this.el(this.ids.title).value = this.current ? this.current.title : "";
            this.el(this.ids.body).value = this.current ? this.current.body : "";
            this.el(this.ids.again).checked = true;
            this.say(this.current ? PatchNoteText.when(this.current.at) + "에 게시한 패치노트가 학생에게 보이고 있습니다." : "게시된 패치노트가 없습니다.");
            this.preview();
        }
        catch (error) {
            this.say("불러오지 못했습니다: " + PatchNoteEditor.errorText(error));
        }
    }
    el(id) {
        return document.getElementById(id);
    }
    game() {
        return this.el(this.ids.game).value || PatchNoteEditor.GAMES[0].key;
    }
    gameTitle() {
        return (PatchNoteEditor.GAMES.find((game) => game.key === this.game()) || PatchNoteEditor.GAMES[0]).title;
    }
    say(text) {
        this.el(this.ids.msg).textContent = text;
    }
    preview() {
        const title = this.el(this.ids.title).value.trim() || "새 패치 안내";
        const body = this.el(this.ids.body).value.trim();
        this.el(this.ids.preview).innerHTML = body
            ? '<div class="pn-tag">📢 ' + PatchNoteText.esc(this.gameTitle()) + ' 패치노트</div><div class="pn-title">' + PatchNoteText.esc(title) + '</div><div class="pn-body">' + PatchNoteText.esc(body) + "</div>"
            : "";
    }
    async publish() {
        const title = this.el(this.ids.title).value;
        const body = this.el(this.ids.body).value;
        if (!body.trim()) {
            this.say("내용을 먼저 써 주세요.");
            return;
        }
        const again = this.el(this.ids.again).checked || !this.current;
        const now = Date.now();
        const note = PatchNoteCodec.make(title, body, again ? now : this.current.id, now);
        if (!confirm(again ? "패치노트를 게시할까요? 학생이 다음에 들어올 때 한 번 보게 됩니다." : "글자만 고칠까요? 이미 본 학생에게는 다시 뜨지 않습니다."))
            return;
        try {
            await this.io.patch({ [PatchNoteCodec.path(this.game())]: note });
            this.current = note;
            this.say("게시했습니다. " + (again ? "학생이 다음에 들어올 때 한 번 보입니다." : "이미 본 학생에게는 다시 뜨지 않습니다."));
        }
        catch (error) {
            this.say("게시하지 못했습니다: " + PatchNoteEditor.errorText(error));
        }
    }
    async remove() {
        if (!this.current || !confirm("게시된 패치노트를 내릴까요? 아직 안 본 학생에게도 더 이상 뜨지 않습니다."))
            return;
        try {
            await this.io.patch({ [PatchNoteCodec.path(this.game())]: null });
            this.current = null;
            this.say("패치노트를 내렸습니다.");
        }
        catch (error) {
            this.say("내리지 못했습니다: " + PatchNoteEditor.errorText(error));
        }
    }
    static errorText(error) {
        return error instanceof Error ? error.message : String(error);
    }
}
PatchNoteEditor.GAMES = [{ key: "teambattle", title: "30번 팀 배틀 아레나" }];
