type ThreeLibsLoader = () => Promise<ThreeLibs>;

class CharacterMakerPage {
  private readonly modal = CharacterMakerPage.byId("makerModal");
  private readonly host = CharacterMakerPage.byId("makerHost");
  private readonly note = CharacterMakerPage.byId("makerNote");
  private editor: ProfileEditor | null = null;
  private loading: Promise<void> | null = null;

  constructor(private readonly loadLibs: ThreeLibsLoader) {
    CharacterMakerPage.byId("makerOpen").addEventListener("click", () => this.open());
    CharacterMakerPage.byId("makerClose").addEventListener("click", () => this.close());
  }

  private static byId(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
  }

  private open(): void {
    this.modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (this.editor) this.editor.setActive(true);
    else this.prepare();
  }

  private close(): void {
    this.modal.hidden = true;
    document.body.style.overflow = "";
    if (this.editor) this.editor.setActive(false);
  }

  private prepare(): void {
    if (!this.loading) this.loading = this.build();
    this.loading.catch(() => {
      this.loading = null;
      this.note.textContent = "캐릭터를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.";
    });
  }

  private async build(): Promise<void> {
    this.note.textContent = "캐릭터를 불러오는 중…";
    const libs = await this.loadLibs();
    const assets = new CharacterAssets(libs);
    await assets.load();
    const profile = new PlayerProfile();
    const editor = new ProfileEditor(libs, new CharacterModelFactory(libs, assets), assets, profile);
    editor.mount(this.host);
    this.editor = editor;
    this.note.textContent = "바꾸면 이 기기에 자동으로 저장돼요. 게임에서 그대로 쓰여요.";
    if (!this.modal.hidden) editor.setActive(true);
  }
}
