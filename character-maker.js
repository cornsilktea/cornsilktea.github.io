"use strict";
class CharacterMakerPage {
    constructor(loadLibs) {
        this.loadLibs = loadLibs;
        this.modal = CharacterMakerPage.byId("makerModal");
        this.host = CharacterMakerPage.byId("makerHost");
        this.note = CharacterMakerPage.byId("makerNote");
        this.editor = null;
        this.loading = null;
        CharacterMakerPage.byId("makerOpen").addEventListener("click", () => this.open());
        CharacterMakerPage.byId("makerClose").addEventListener("click", () => this.close());
    }
    static byId(id) {
        return document.getElementById(id);
    }
    open() {
        this.modal.hidden = false;
        document.body.style.overflow = "hidden";
        if (this.editor)
            this.editor.setActive(true);
        else
            this.prepare();
    }
    close() {
        this.modal.hidden = true;
        document.body.style.overflow = "";
        if (this.editor)
            this.editor.setActive(false);
    }
    prepare() {
        if (!this.loading)
            this.loading = this.build();
        this.loading.catch(() => {
            this.loading = null;
            this.note.textContent = "캐릭터를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.";
        });
    }
    async build() {
        this.note.textContent = "캐릭터를 불러오는 중…";
        const libs = await this.loadLibs();
        const assets = new CharacterAssets(libs);
        await assets.load();
        const profile = new PlayerProfile();
        const editor = new ProfileEditor(libs, new CharacterModelFactory(libs, assets), assets, profile);
        editor.mount(this.host);
        this.editor = editor;
        this.note.textContent = "바꾸면 이 기기에 자동으로 저장돼요. 게임에서 그대로 쓰여요.";
        if (!this.modal.hidden)
            editor.setActive(true);
    }
}
