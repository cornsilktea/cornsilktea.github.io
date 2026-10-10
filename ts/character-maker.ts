type ThreeLibsLoader = () => Promise<ThreeLibs>;

class ThreeLibsImporter {
  private static readonly SHIM_URL = "https://cdn.jsdelivr.net/npm/es-module-shims@1.10.1/dist/es-module-shims.js";

  static load(): Promise<ThreeLibs> {
    return ThreeLibsImporter.loadAll();
  }

  private static async loadAll(): Promise<ThreeLibs> {
    const THREE = await ThreeLibsImporter.importModule("three") as ThreeModule;
    const loaders = await ThreeLibsImporter.importModule("three/addons/loaders/GLTFLoader.js") as { GLTFLoader: GLTFLoaderClass };
    const SkeletonUtils = await ThreeLibsImporter.importModule("three/addons/utils/SkeletonUtils.js") as SkeletonUtilsModule;
    return { THREE, GLTFLoader: loaders.GLTFLoader, SkeletonUtils };
  }

  private static importModule(specifier: string): Promise<unknown> {
    const nativeImportMap = !!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports("importmap"));
    if (nativeImportMap) return import(specifier);
    return ThreeLibsImporter.loadShim().then(() => (window.importShim as (specifier: string) => Promise<unknown>)(specifier));
  }

  private static loadShim(): Promise<void> {
    if (window.importShim) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = ThreeLibsImporter.SHIM_URL;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("모듈 도우미를 불러오지 못했어요"));
      document.head.appendChild(script);
    });
  }
}

class CharacterMakerDialog {
  static readonly OPEN_EVENT = "portal-maker-open";
  static readonly TRIGGER_SELECTOR = "[data-maker-open]";

  private readonly modal: HTMLDivElement;
  private readonly host: HTMLDivElement;
  private readonly note: HTMLDivElement;
  private editor: ProfileEditor | NickEditor | null = null;
  private loading: Promise<void> | null = null;

  constructor(private readonly loadLibs: ThreeLibsLoader = ThreeLibsImporter.load, private readonly withLook = true) {
    this.modal = document.createElement("div");
    this.modal.className = "st-screen maker-modal";
    this.modal.hidden = true;
    this.modal.innerHTML =
      "<div class='st-wrap'><div class='st-card'>" +
      "<div class='maker-head'><h2>" + (withLook ? "캐릭터 만들기" : "닉네임 설정") + "</h2><button type='button' class='st-btn sub maker-close'>닫기</button></div>" +
      "<div class='maker-host'></div><div class='st-hint maker-note'></div></div></div>";
    document.body.appendChild(this.modal);
    this.host = this.modal.querySelector(".maker-host") as HTMLDivElement;
    this.note = this.modal.querySelector(".maker-note") as HTMLDivElement;
    this.bindEvents();
  }

  static requestOpen(): void {
    document.dispatchEvent(new CustomEvent(CharacterMakerDialog.OPEN_EVENT));
  }

  open(): void {
    this.modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (this.editor instanceof ProfileEditor) this.editor.setActive(true);
    else if (!this.editor) this.prepare();
  }

  close(): void {
    this.modal.hidden = true;
    document.body.style.overflow = "";
    if (this.editor instanceof ProfileEditor) this.editor.setActive(false);
    document.dispatchEvent(new CustomEvent(PlayerProfile.SETTLED_EVENT));
  }

  private bindEvents(): void {
    (this.modal.querySelector(".maker-close") as HTMLButtonElement).addEventListener("click", () => this.close());
    document.addEventListener(CharacterMakerDialog.OPEN_EVENT, () => this.open());
    document.addEventListener("click", (event) => {
      const trigger = (event.target as HTMLElement).closest(CharacterMakerDialog.TRIGGER_SELECTOR);
      if (!trigger) return;
      event.preventDefault();
      this.open();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.modal.hidden) this.close();
    });
  }

  private prepare(): void {
    if (!this.loading) this.loading = this.build();
    this.loading.catch(() => {
      this.loading = null;
      this.note.textContent = "캐릭터를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.";
    });
  }

  private buildNickOnly(): void {
    const editor = new NickEditor(new PlayerProfile());
    this.host.appendChild(editor.element);
    this.editor = editor;
    this.note.textContent = "바꾸면 이 기기에 자동으로 저장돼요. 모든 게임에서 같은 이름으로 쓰여요.";
    if (!this.modal.hidden) editor.focus();
  }

  private async build(): Promise<void> {
    if (!this.withLook) {
      this.buildNickOnly();
      return;
    }
    this.note.textContent = "캐릭터를 불러오는 중…";
    const libs = await this.loadLibs();
    const assets = new CharacterAssets(libs);
    await assets.load();
    const profile = new PlayerProfile();
    const editor = new ProfileEditor(libs, new CharacterModelFactory(libs, assets), assets, profile);
    editor.mount(this.host);
    this.editor = editor;
    this.note.textContent = "바꾸면 이 기기에 자동으로 저장돼요. 모든 게임에서 같은 이름과 모습으로 쓰여요.";
    if (this.modal.hidden) return;
    editor.setActive(true);
    if (!profile.nick) editor.focusNick();
  }
}
