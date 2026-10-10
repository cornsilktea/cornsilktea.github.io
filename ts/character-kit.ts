type PartKey = "top" | "arm" | "pants" | "cape" | "hat" | "skin" | "hair";
type PaintedPartKey = Exclude<PartKey, "skin">;
type TextureCell = [row: number, column: number];
type PartCells = Partial<Record<PaintedPartKey, Record<string, TextureCell[]>>>;

type ColorChoice = number | string;

interface CharacterLook {
  c: number;
  p: Record<PartKey, ColorChoice>;
  cape: 0 | 1;
  hat: 0 | 1;
}

interface RawCharacterLook {
  c?: unknown;
  p?: Partial<Record<PartKey, unknown>>;
  cape?: unknown;
  hat?: unknown;
}

interface CharacterTypeInfo {
  file: string;
  prefix: string;
  name: string;
  rules: PartCells;
  hatMeshes: readonly string[];
  capeMeshes: readonly string[];
  skinCell: TextureCell;
  skinSet: readonly string[];
  labels: Partial<Record<PartKey | "capeToggle" | "hatToggle", string>>;
}

interface ColorPartInfo {
  key: PartKey;
  label: string;
  set: readonly string[];
}

interface AnimationOptions {
  speed?: number;
  once?: boolean;
}

class CharacterCatalog {
  static readonly COLOR_SET: readonly string[] = ["#D94B4B", "#F08A3E", "#F2C93B", "#5DBB63", "#3FB6B0", "#4A86E8", "#7B5CD6", "#D965A8", "#F2F2EE", "#3B3F4A"];
  static readonly SKIN_SET: readonly string[] = ["#FFE0C8", "#F6C09C", "#F2D2B5", "#E2A981", "#C98A62", "#A86A48", "#7E4B33", "#5A3524"];
  static readonly BONE_SET: readonly string[] = ["#F2EBD8", "#E3D9BC", "#CFC6AA", "#B5AE9A", "#F2F2EE", "#E8D08A", "#8FD9C7", "#C94A4A"];
  static readonly HAIR_SET: readonly string[] = ["#1B191B", "#4A3222", "#7A4A2E", "#B0703A", "#E2C36A", "#F2E8C8", "#C94A4A", "#4A86E8", "#7B5CD6", "#9AA0A6"];
  static readonly CUSTOM_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
  static readonly NEUTRAL_CUSTOM_COLOR = "#888888";
  static readonly RANDOM_TYPE_COUNT = 6;

  private static readonly ADVENTURER = { skinCell: [0, 0] as TextureCell, skinSet: CharacterCatalog.SKIN_SET, capeMeshes: ["Cape"] as readonly string[] };
  private static readonly SKELETON = { skinCell: [1, 1] as TextureCell, skinSet: CharacterCatalog.BONE_SET, capeMeshes: [] as readonly string[] };

  static readonly TYPES: readonly CharacterTypeInfo[] = [
    {
      file: "Knight", prefix: "Knight", name: "기사", ...CharacterCatalog.ADVENTURER, labels: {},
      hatMeshes: ["Helmet", "HelmetVisor"],
      rules: { top: { Body: [[0, 3]] }, arm: { ArmLeft: [[0, 3]], ArmRight: [[0, 3]] }, pants: { LegLeft: [[0, 3]], LegRight: [[0, 3]] }, cape: { Cape: [[1, 0]] }, hat: { Helmet: [[0, 3]], HelmetVisor: [[0, 3]] }, hair: { Head: [[0, 1]] } }
    },
    {
      file: "Barbarian", prefix: "Barbarian", name: "바바리안", ...CharacterCatalog.ADVENTURER, labels: {},
      hatMeshes: ["BearHat"], capeMeshes: [],
      rules: { top: { Body: [[0, 7]] }, arm: { ArmLeft: [[0, 6]], ArmRight: [[0, 6]] }, pants: { LegLeft: [[2, 3]], LegRight: [[2, 3]] }, hat: { BearHat: [[0, 7]] }, hair: { Head: [[0, 1]] } }
    },
    {
      file: "Mage", prefix: "Mage", name: "마법사", ...CharacterCatalog.ADVENTURER, labels: {},
      hatMeshes: ["Hat"],
      rules: { top: { Body: [[1, 0]] }, arm: { ArmLeft: [[1, 0]], ArmRight: [[1, 0]] }, pants: { LegLeft: [[2, 3]], LegRight: [[2, 3]] }, cape: { Cape: [[1, 2]] }, hat: { Hat: [[1, 1]] }, hair: { Head: [[0, 1]] } }
    },
    {
      file: "Ranger", prefix: "Ranger", name: "레인저", ...CharacterCatalog.ADVENTURER, labels: {},
      hatMeshes: [],
      rules: { top: { Body: [[0, 5], [0, 6]] }, arm: { ArmLeft: [[0, 6]], ArmRight: [[0, 6]] }, pants: { LegLeft: [[2, 3]], LegRight: [[2, 3]] }, cape: { Cape: [[1, 0]] }, hair: { Head: [[0, 1]] } }
    },
    {
      file: "Rogue", prefix: "Rogue", name: "도적", ...CharacterCatalog.ADVENTURER, labels: {},
      hatMeshes: [],
      rules: { top: { Body: [[1, 0]] }, arm: { ArmLeft: [[1, 0]], ArmRight: [[1, 0]] }, pants: { LegLeft: [[2, 3]], LegRight: [[2, 3]] }, cape: { Cape: [[1, 1]] }, hair: { Head: [[0, 1]] } }
    },
    {
      file: "Rogue_Hooded", prefix: "RogueHooded", name: "후드 도적", ...CharacterCatalog.ADVENTURER, labels: { hat: "후드" },
      hatMeshes: [],
      rules: { top: { Body: [[1, 0]] }, arm: { ArmLeft: [[1, 0]], ArmRight: [[1, 0]] }, pants: { LegLeft: [[2, 3]], LegRight: [[2, 3]] }, cape: { Cape: [[1, 1]] }, hat: { Head: [[1, 1]], Body: [[1, 1]] }, hair: { Head: [[0, 1]] } }
    },
    {
      file: "Druid", prefix: "Druid", name: "드루이드", ...CharacterCatalog.ADVENTURER,
      labels: { cape: "배낭", capeToggle: "배낭", hair: "후드" },
      hatMeshes: [], capeMeshes: ["Backpack"],
      rules: { top: { Body: [[2, 1], [1, 0]] }, arm: { ArmLeft: [[1, 0]], ArmRight: [[1, 0]] }, pants: { LegLeft: [[1, 7]], LegRight: [[1, 7]] }, cape: { Backpack: [[0, 5]] }, hair: { Head: [[1, 0]] } }
    },
    {
      file: "Engineer", prefix: "Engineer", name: "공학자", ...CharacterCatalog.ADVENTURER,
      labels: { cape: "배낭", capeToggle: "배낭", hat: "고글", hatToggle: "고글" },
      hatMeshes: ["Goggles"], capeMeshes: ["Backpack"],
      rules: { top: { Body: [[1, 7]] }, arm: { ArmLeft: [[0, 7]], ArmRight: [[0, 7]] }, pants: { LegLeft: [[1, 7]], LegRight: [[1, 7]] }, cape: { Backpack: [[0, 6]] }, hat: { Goggles: [[0, 7]] }, hair: { Head: [[0, 1]] } }
    },
    {
      file: "Necromancer", prefix: "Necromancer", name: "네크로맨서", skinCell: [0, 1], skinSet: CharacterCatalog.BONE_SET, capeMeshes: [],
      labels: { skin: "두개골", hat: "왕관", hatToggle: "왕관" },
      hatMeshes: ["Crown"],
      rules: { top: { Body: [[2, 2]] }, arm: { ArmLeft: [[2, 2]], ArmRight: [[2, 2]] }, pants: { LegLeft: [[1, 3]], LegRight: [[1, 3]] }, hat: { Crown: [[1, 1]] } }
    },
    {
      file: "Skeleton_Warrior", prefix: "Skeleton_Warrior", name: "해골 전사", ...CharacterCatalog.SKELETON,
      labels: { skin: "뼈 색", top: "갑옷", cape: "천", capeToggle: "천", hat: "투구", hatToggle: "투구" },
      hatMeshes: ["Helmet"], capeMeshes: ["Cloak"],
      rules: { top: { Body: [[0, 3]] }, arm: { ArmLeft: [[0, 3]], ArmRight: [[0, 3]] }, pants: { LegLeft: [[0, 3]], LegRight: [[0, 3]] }, cape: { Cloak: [[2, 2]] }, hat: { Helmet: [[0, 4]] } }
    },
    {
      file: "Skeleton_Rogue", prefix: "Skeleton_Rogue", name: "해골 도적", ...CharacterCatalog.SKELETON,
      labels: { skin: "뼈 색", capeToggle: "망토", hat: "후드", hatToggle: "후드" },
      hatMeshes: ["Hood"], capeMeshes: ["Cape"],
      rules: { top: { Body: [[0, 7]] }, arm: { ArmLeft: [[0, 3]], ArmRight: [[0, 3]] }, pants: { LegLeft: [[0, 3]], LegRight: [[0, 3]] }, cape: { Cape: [[2, 2]] }, hat: { Hood: [[2, 2]] } }
    },
    {
      file: "Skeleton_Mage", prefix: "Skeleton_Mage", name: "해골 마법사", ...CharacterCatalog.SKELETON,
      labels: { skin: "뼈 색", hat: "모자", hatToggle: "모자" },
      hatMeshes: ["Hat"],
      rules: { top: { Body: [[2, 2]] }, arm: { ArmLeft: [[0, 7]], ArmRight: [[0, 7]] }, pants: { LegLeft: [[0, 7]], LegRight: [[0, 7]] }, hat: { Hat: [[2, 2]] } }
    },
    {
      file: "Skeleton_Minion", prefix: "Skeleton_Minion", name: "해골 미니언", ...CharacterCatalog.SKELETON,
      labels: { skin: "뼈 색", cape: "천", capeToggle: "천" },
      hatMeshes: [], capeMeshes: ["Cloak"],
      rules: { top: { Body: [[0, 7], [0, 6]] }, pants: { LegLeft: [[0, 7], [0, 6]], LegRight: [[0, 7], [0, 6]] }, cape: { Cloak: [[0, 5]] } }
    }
  ];

  static readonly HIDDEN_MESHES: readonly string[] = ["Mask"];
  static readonly PAINTED_PARTS: readonly PaintedPartKey[] = ["top", "arm", "pants", "cape", "hat", "hair"];

  static readonly COLOR_PARTS: readonly ColorPartInfo[] = [
    { key: "top", label: "옷", set: CharacterCatalog.COLOR_SET },
    { key: "arm", label: "팔", set: CharacterCatalog.COLOR_SET },
    { key: "pants", label: "바지", set: CharacterCatalog.COLOR_SET },
    { key: "cape", label: "망토", set: CharacterCatalog.COLOR_SET },
    { key: "hat", label: "모자", set: CharacterCatalog.COLOR_SET },
    { key: "skin", label: "피부", set: CharacterCatalog.SKIN_SET },
    { key: "hair", label: "머리색", set: CharacterCatalog.HAIR_SET }
  ];

  static colorPart(key: PartKey): ColorPartInfo {
    return CharacterCatalog.COLOR_PARTS.filter((part) => part.key === key)[0];
  }

  static type(typeIndex: number): CharacterTypeInfo {
    return CharacterCatalog.TYPES[typeIndex];
  }

  static setOf(typeIndex: number, key: PartKey): readonly string[] {
    return key === "skin" ? CharacterCatalog.type(typeIndex).skinSet : CharacterCatalog.colorPart(key).set;
  }

  static labelOf(typeIndex: number, key: PartKey): string {
    return CharacterCatalog.type(typeIndex).labels[key] || CharacterCatalog.colorPart(key).label;
  }

  static isCustomColor(choice: ColorChoice): choice is string {
    return typeof choice === "string" && CharacterCatalog.CUSTOM_COLOR_PATTERN.test(choice);
  }

  static colorOf(look: CharacterLook, key: PartKey): string | null {
    const choice = look.p[key];
    if (CharacterCatalog.isCustomColor(choice)) return choice;
    return typeof choice === "number" && choice ? CharacterCatalog.setOf(look.c, key)[choice - 1] : null;
  }

  static hasCape(typeIndex: number): boolean {
    return CharacterCatalog.type(typeIndex).capeMeshes.length > 0;
  }

  static hasHat(typeIndex: number): boolean {
    return CharacterCatalog.type(typeIndex).hatMeshes.length > 0;
  }

  static toggleLabel(typeIndex: number, which: "cape" | "hat"): string {
    const labels = CharacterCatalog.type(typeIndex).labels;
    return (which === "cape" ? labels.capeToggle : labels.hatToggle) || (which === "cape" ? "망토" : "모자");
  }

  static isPartAvailable(typeIndex: number, key: PartKey): boolean {
    return key === "skin" || !!CharacterCatalog.type(typeIndex).rules[key as PaintedPartKey];
  }
}

class CharacterLooks {
  static createDefault(): CharacterLook {
    return { c: 0, p: { top: 0, arm: 0, pants: 0, cape: 0, hat: 0, skin: 0, hair: 0 }, cape: 1, hat: 1 };
  }

  static clean(raw: unknown): CharacterLook {
    const look = CharacterLooks.createDefault();
    if (!raw || typeof raw !== "object") return look;
    const source = raw as RawCharacterLook;
    look.c = CharacterLooks.clamp(Math.floor(Number(source.c) || 0), 0, CharacterCatalog.TYPES.length - 1);
    CharacterCatalog.COLOR_PARTS.forEach((part) => {
      look.p[part.key] = CharacterLooks.cleanChoice(source.p ? source.p[part.key] : 0, part.set.length);
    });
    look.cape = source.cape === 0 ? 0 : 1;
    look.hat = source.hat === 0 ? 0 : 1;
    return look;
  }

  static random(): CharacterLook {
    const look = CharacterLooks.createDefault();
    look.c = Math.floor(Math.random() * CharacterCatalog.RANDOM_TYPE_COUNT);
    CharacterCatalog.COLOR_PARTS.forEach((part) => {
      look.p[part.key] = Math.random() < 0.15 ? 0 : 1 + Math.floor(Math.random() * part.set.length);
    });
    return look;
  }

  private static cleanChoice(raw: unknown, paletteSize: number): ColorChoice {
    if (CharacterCatalog.isCustomColor(raw as ColorChoice)) return (raw as string).toLowerCase();
    return CharacterLooks.clamp(Math.floor(Number(raw) || 0), 0, paletteSize);
  }

  private static clamp(value: number, low: number, high: number): number {
    return value < low ? low : value > high ? high : value;
  }
}

class PlayerProfile {
  static readonly STORAGE_KEY = "portal_profile_v1";
  static readonly CHANGE_EVENT = "portal-profile-changed";
  static readonly SETTLED_EVENT = "portal-profile-settled";
  static readonly MAX_NICK_LENGTH = 8;
  static readonly REAL_NAME_NOTICE = "닉네임은 본명으로 입력합니다";
  static readonly NICK_REQUIRED_NOTICE = "캐릭터 만들기에서 닉네임(본명)을 먼저 정해 주세요.";

  nick = "";
  look: CharacterLook = CharacterLooks.createDefault();
  private fallbackNick = "";
  private broadcasting = false;
  private readonly listeners: Array<() => void> = [];

  constructor() {
    this.load();
    document.addEventListener(PlayerProfile.CHANGE_EVENT, () => {
      if (this.broadcasting) return;
      this.load();
      this.notify();
    });
  }

  static cleanNick(text: string): string {
    return String(text || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, PlayerProfile.MAX_NICK_LENGTH);
  }

  static storedNick(): string {
    try {
      const stored = localStorage.getItem(PlayerProfile.STORAGE_KEY);
      return stored ? PlayerProfile.cleanNick((JSON.parse(stored) as { nick?: string }).nick || "") : "";
    } catch (error) {
      return "";
    }
  }

  nickOrDefault(): string {
    if (this.nick) return this.nick;
    if (!this.fallbackNick) this.fallbackNick = "학생" + (10 + Math.floor(Math.random() * 90));
    return this.fallbackNick;
  }

  setNick(text: string): void {
    this.nick = PlayerProfile.cleanNick(text);
    this.save();
    this.notify();
  }

  setLook(look: CharacterLook): void {
    this.look = CharacterLooks.clean(look);
    this.save();
    this.notify();
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(PlayerProfile.STORAGE_KEY);
      const data = stored ? JSON.parse(stored) as { nick?: string; look?: unknown } : {};
      this.nick = PlayerProfile.cleanNick(data.nick || "");
      this.look = CharacterLooks.clean(data.look);
    } catch (error) {
      this.nick = "";
      this.look = CharacterLooks.createDefault();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(PlayerProfile.STORAGE_KEY, JSON.stringify({ nick: this.nick, look: this.look }));
    } catch (error) {
      return;
    }
    this.broadcasting = true;
    document.dispatchEvent(new CustomEvent(PlayerProfile.CHANGE_EVENT));
    this.broadcasting = false;
  }
}

class CharacterAssets {
  static readonly DEFAULT_DIRECTORY = "assets/kaykit/";
  static readonly ANIMATION_FILE = "animations/teambattle_anims.glb?v=crossbow";

  readonly clips = new Map<string, Three<"AnimationClip">>();
  private readonly templates = new Map<string, Three<"Object3D">>();
  private loading: Promise<void> | null = null;

  constructor(private readonly libs: ThreeLibs, private readonly directory: string = CharacterAssets.DEFAULT_DIRECTORY) {}

  load(): Promise<void> {
    if (!this.loading) this.loading = this.loadAll();
    return this.loading;
  }

  template(file: string): Three<"Object3D"> {
    const template = this.templates.get(file);
    if (!template) throw new Error("캐릭터 모델을 아직 불러오지 못했어요: " + file);
    return template;
  }

  private async loadAll(): Promise<void> {
    const loader = new this.libs.GLTFLoader();
    const animations = loader.loadAsync(this.directory + CharacterAssets.ANIMATION_FILE).then((gltf) => {
      gltf.animations.forEach((clip) => this.clips.set(clip.name, clip));
    });
    const characters = CharacterCatalog.TYPES.map((type) =>
      loader.loadAsync(this.directory + "characters/" + type.file + ".glb").then((gltf) => {
        this.templates.set(type.file, gltf.scene);
      })
    );
    await Promise.all([animations, ...characters]);
  }
}

class CharacterModelFactory {
  static readonly SCALE = 0.8;
  private static readonly TEXTURE_SIZE = 256;
  private static readonly TEXTURE_COLUMNS = 8;
  private static readonly TEXTURE_ROWS = 4;
  private static readonly TEXTURE_CACHE_LIMIT = 400;

  private readonly textureCache = new Map<string, Three<"CanvasTexture">>();

  constructor(private readonly libs: ThreeLibs, private readonly assets: CharacterAssets) {}

  build(look: CharacterLook): Three<"Object3D"> {
    const typeIndex = look.c;
    const type = CharacterCatalog.type(typeIndex);
    const template = this.assets.template(type.file);
    const model = this.libs.SkeletonUtils.clone(template);
    const sourceImage = this.sourceImageOf(template);
    model.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (!mesh.isMesh) return;
      const suffix = this.meshSuffix(mesh.name, type.prefix);
      mesh.material = new this.libs.THREE.MeshLambertMaterial({ map: this.textureFor(typeIndex, suffix, look, sourceImage) });
      mesh.frustumCulled = false;
      if (CharacterCatalog.HIDDEN_MESHES.indexOf(suffix) >= 0) mesh.visible = false;
      if (type.capeMeshes.indexOf(suffix) >= 0 && !look.cape) mesh.visible = false;
      if (type.hatMeshes.indexOf(suffix) >= 0 && !look.hat) mesh.visible = false;
    });
    model.scale.setScalar(CharacterModelFactory.SCALE);
    return model;
  }

  disposeModel(model: Three<"Object3D">): void {
    model.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (mesh.isMesh && !Array.isArray(mesh.material)) mesh.material.dispose();
    });
  }

  private sourceImageOf(template: Three<"Object3D">): CanvasImageSource {
    const mesh = template.getObjectByProperty("isMesh", true) as Three<"Mesh">;
    const material = mesh.material as Three<"MeshStandardMaterial">;
    return (material.map as Three<"Texture">).image as CanvasImageSource;
  }

  private meshSuffix(name: string, prefix: string): string {
    return name.indexOf(prefix + "_") === 0 ? name.slice(prefix.length + 1) : name;
  }

  private shade(hex: string, factor: number): string {
    const value = parseInt(hex.slice(1), 16);
    const red = (value >> 16) & 255, green = (value >> 8) & 255, blue = value & 255;
    return "rgb(" + Math.round(red * factor) + "," + Math.round(green * factor) + "," + Math.round(blue * factor) + ")";
  }

  private paintListFor(typeIndex: number, suffix: string, look: CharacterLook): Array<[number, number, string]> {
    const type = CharacterCatalog.type(typeIndex);
    const paint: Array<[number, number, string]> = [];
    CharacterCatalog.PAINTED_PARTS.forEach((part) => {
      const cells = type.rules[part] ? type.rules[part]![suffix] : undefined;
      const color = CharacterCatalog.colorOf(look, part);
      if (cells && color) cells.forEach((cell) => paint.push([cell[0], cell[1], color]));
    });
    const skin = CharacterCatalog.colorOf(look, "skin");
    if (skin) paint.push([type.skinCell[0], type.skinCell[1], skin]);
    return paint;
  }

  private textureFor(typeIndex: number, suffix: string, look: CharacterLook, sourceImage: CanvasImageSource): Three<"CanvasTexture"> {
    const paint = this.paintListFor(typeIndex, suffix, look);
    const key = typeIndex + "|" + suffix + "|" + paint.map((cell) => cell.join(":")).join("/");
    const cached = this.textureCache.get(key);
    if (cached) return cached;
    const size = CharacterModelFactory.TEXTURE_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    const cellWidth = size / CharacterModelFactory.TEXTURE_COLUMNS, cellHeight = size / CharacterModelFactory.TEXTURE_ROWS;
    context.drawImage(sourceImage, 0, 0, size, size);
    paint.forEach(([row, column, color]) => {
      const x = column * cellWidth, y = row * cellHeight;
      const gradient = context.createLinearGradient(0, y, 0, y + cellHeight);
      gradient.addColorStop(0, this.shade(color, 1));
      gradient.addColorStop(1, this.shade(color, 0.82));
      context.fillStyle = gradient;
      context.fillRect(x, y, cellWidth, cellHeight);
    });
    const THREE = this.libs.THREE;
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.rememberTexture(key, texture);
    return texture;
  }

  private rememberTexture(key: string, texture: Three<"CanvasTexture">): void {
    this.textureCache.set(key, texture);
    if (this.textureCache.size <= CharacterModelFactory.TEXTURE_CACHE_LIMIT) return;
    const oldest = this.textureCache.keys().next().value as string;
    (this.textureCache.get(oldest) as Three<"CanvasTexture">).dispose();
    this.textureCache.delete(oldest);
  }
}

class CharacterAnimator {
  private readonly mixer: Three<"AnimationMixer">;
  private readonly actions = new Map<string, Three<"AnimationAction">>();
  private currentKey = "";

  constructor(private readonly libs: ThreeLibs, model: Three<"Object3D">, private readonly clips: Map<string, Three<"AnimationClip">>) {
    this.mixer = new libs.THREE.AnimationMixer(model);
  }

  play(clipName: string, options: AnimationOptions = {}): void {
    const key = clipName + (options.once ? "#once" : "");
    const action = this.actionFor(key, clipName, !!options.once);
    if (!action) return;
    if (this.currentKey !== key) {
      const previous = this.actions.get(this.currentKey);
      action.reset().setEffectiveWeight(1).play();
      if (previous && previous !== action) previous.crossFadeTo(action, 0.12, false);
      this.currentKey = key;
    }
    action.timeScale = options.speed || 1;
  }

  update(deltaSeconds: number): void {
    this.mixer.update(deltaSeconds);
  }

  private actionFor(key: string, clipName: string, once: boolean): Three<"AnimationAction"> | null {
    const existing = this.actions.get(key);
    if (existing) return existing;
    const clip = this.clips.get(clipName);
    if (!clip) return null;
    const action = this.mixer.clipAction(once ? clip.clone() : clip);
    if (once) {
      action.setLoop(this.libs.THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    this.actions.set(key, action);
    return action;
  }
}

class CharacterPreview {
  private readonly renderer: Three<"WebGLRenderer">;
  private readonly scene: Three<"Scene">;
  private readonly camera: Three<"PerspectiveCamera">;
  private readonly pivot: Three<"Group">;
  private model: Three<"Object3D"> | null = null;
  private animator: CharacterAnimator | null = null;
  private yaw = 0.4;
  private dragPointer: number | null = null;
  private dragX = 0;
  private running = false;
  private lastFrameMs = 0;
  private readonly clock: Three<"Clock">;

  constructor(
    private readonly libs: ThreeLibs,
    private readonly factory: CharacterModelFactory,
    private readonly assets: CharacterAssets,
    private readonly canvas: HTMLCanvasElement
  ) {
    const THREE = libs.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xDCE6FF, 0x40324A, 1.2));
    const sun = new THREE.DirectionalLight(0xFFF0D2, 1.6);
    sun.position.set(3, 6, 5);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 1.25, 5.4);
    this.camera.lookAt(0, 0.85, 0);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.clock = new THREE.Clock();
    this.bindDrag();
  }

  setLook(look: CharacterLook): void {
    if (this.model) {
      this.pivot.remove(this.model);
      this.factory.disposeModel(this.model);
    }
    this.model = this.factory.build(look);
    this.pivot.add(this.model);
    this.animator = new CharacterAnimator(this.libs, this.model, this.assets.clips);
    this.animator.play("Idle_A");
  }

  turn(radians: number): void {
    this.yaw += radians;
  }

  setActive(active: boolean): void {
    if (active && !this.running) {
      this.running = true;
      this.clock.getDelta();
      requestAnimationFrame(() => this.frame());
    } else if (!active) {
      this.running = false;
    }
  }

  private bindDrag(): void {
    this.canvas.style.touchAction = "pan-y";
    this.canvas.addEventListener("pointerdown", (event) => {
      this.dragPointer = event.pointerId;
      this.dragX = event.clientX;
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.dragPointer) return;
      this.yaw += (event.clientX - this.dragX) * 0.012;
      this.dragX = event.clientX;
    });
    const end = (event: PointerEvent) => {
      if (event.pointerId === this.dragPointer) this.dragPointer = null;
    };
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);
  }

  private fitToCanvas(): void {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (!width || !height) return;
    const target = this.renderer.getSize(new this.libs.THREE.Vector2());
    if (target.x !== width || target.y !== height) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  private frame(): void {
    if (!this.running) return;
    if (!this.canvas.clientWidth) {
      requestAnimationFrame(() => this.frame());
      return;
    }
    this.fitToCanvas();
    const delta = Math.min(this.clock.getDelta(), 0.1);
    if (this.animator) this.animator.update(delta);
    this.pivot.rotation.y = this.yaw;
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.frame());
  }
}


class ProfileEditor {
  private static readonly CUSTOM_APPLY_DELAY_MS = 90;

  private readonly preview: CharacterPreview;
  private readonly root: HTMLDivElement;
  private readonly nickInput: HTMLInputElement;
  private readonly typeButtons: HTMLDivElement;
  private readonly paletteBox: HTMLDivElement;
  private readonly capeButton: HTMLButtonElement;
  private readonly hatButton: HTMLButtonElement;
  private onLookChanged: () => void = () => undefined;
  private customTimer = 0;

  constructor(libs: ThreeLibs, factory: CharacterModelFactory, assets: CharacterAssets, private readonly profile: PlayerProfile) {
    this.root = document.createElement("div");
    this.root.className = "ce-editor";
    this.root.innerHTML =
      "<label class='st-label'>닉네임</label>" +
      "<input type='text' class='ce-nick' maxlength='" + PlayerProfile.MAX_NICK_LENGTH + "' autocomplete='off' placeholder='닉네임 (최대 " + PlayerProfile.MAX_NICK_LENGTH + "글자)'>" +
      "<div class='ce-notice'>" + PlayerProfile.REAL_NAME_NOTICE + "</div>" +
      "<canvas class='ce-preview'></canvas>" +
      "<div class='ce-hint'>끌어서 돌려 보기</div>" +
      "<label class='st-label'>캐릭터</label><div class='st-opts ce-types'></div>" +
      "<div class='ce-palettes'></div>" +
      "<div class='ce-toggles'><button type='button' class='ce-cape'></button><button type='button' class='ce-hat'></button>" +
      "<button type='button' class='ce-turn-left'>◀ 돌리기</button><button type='button' class='ce-turn-right'>돌리기 ▶</button></div>";
    this.nickInput = this.root.querySelector(".ce-nick") as HTMLInputElement;
    this.typeButtons = this.root.querySelector(".ce-types") as HTMLDivElement;
    this.paletteBox = this.root.querySelector(".ce-palettes") as HTMLDivElement;
    this.capeButton = this.root.querySelector(".ce-cape") as HTMLButtonElement;
    this.hatButton = this.root.querySelector(".ce-hat") as HTMLButtonElement;
    this.preview = new CharacterPreview(libs, factory, assets, this.root.querySelector(".ce-preview") as HTMLCanvasElement);
    this.buildTypeButtons();
    this.buildPalettes();
    this.bindEvents();
    this.syncControls();
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root);
    this.preview.setLook(this.profile.look);
    this.nickInput.value = this.profile.nick;
    this.syncControls();
  }

  setActive(active: boolean): void {
    this.preview.setActive(active);
  }

  focusNick(): void {
    this.nickInput.focus();
  }

  onChange(listener: () => void): void {
    this.onLookChanged = listener;
  }

  refreshFromProfile(): void {
    if (document.activeElement !== this.nickInput) this.nickInput.value = this.profile.nick;
    this.preview.setLook(this.profile.look);
    this.syncControls();
  }

  private buildTypeButtons(): void {
    this.typeButtons.innerHTML = CharacterCatalog.TYPES.map((type, index) =>
      "<button type='button' data-type='" + index + "'>" + type.name + "</button>"
    ).join("");
  }

  private buildPalettes(): void {
    this.paletteBox.innerHTML = CharacterCatalog.COLOR_PARTS.map((part) => {
      const defaultSwatch = "<button type='button' class='ce-sw ce-sw-default' data-part='" + part.key + "' data-index='0' title='기본'></button>";
      const swatches = part.set.map((color, index) =>
        "<button type='button' class='ce-sw' data-part='" + part.key + "' data-index='" + (index + 1) + "'></button>"
      ).join("");
      const custom = "<label class='ce-sw ce-custom' title='직접 고르기'><input type='color' data-custom='" + part.key + "' value='" + CharacterCatalog.NEUTRAL_CUSTOM_COLOR + "'></label>";
      return "<div class='ce-row' data-row='" + part.key + "'><span></span><div>" + defaultSwatch + swatches + custom + "</div></div>";
    }).join("");
  }

  private bindEvents(): void {
    this.nickInput.addEventListener("input", () => {
      this.profile.setNick(this.nickInput.value);
    });
    this.nickInput.addEventListener("change", () => this.announceSettled());
    this.typeButtons.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest("button[data-type]") as HTMLButtonElement | null;
      if (!button) return;
      this.changeLook((look) => { look.c = Number(button.dataset.type); });
    });
    this.paletteBox.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest("button[data-part]") as HTMLButtonElement | null;
      if (!button) return;
      this.changeLook((look) => { look.p[button.dataset.part as PartKey] = Number(button.dataset.index); });
    });
    this.paletteBox.addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement;
      if (!input.dataset.custom) return;
      this.applyCustomColorSoon(input.dataset.custom as PartKey, input.value);
    });
    this.capeButton.addEventListener("click", () => this.changeLook((look) => { look.cape = look.cape ? 0 : 1; }));
    this.hatButton.addEventListener("click", () => this.changeLook((look) => { look.hat = look.hat ? 0 : 1; }));
    (this.root.querySelector(".ce-turn-left") as HTMLButtonElement).addEventListener("click", () => this.preview.turn(-0.8));
    (this.root.querySelector(".ce-turn-right") as HTMLButtonElement).addEventListener("click", () => this.preview.turn(0.8));
  }

  private announceSettled(): void {
    document.dispatchEvent(new CustomEvent(PlayerProfile.SETTLED_EVENT));
    this.onLookChanged();
  }

  private applyCustomColorSoon(part: PartKey, hex: string): void {
    window.clearTimeout(this.customTimer);
    this.customTimer = window.setTimeout(() => {
      this.changeLook((look) => { look.p[part] = hex.toLowerCase(); }, part);
    }, ProfileEditor.CUSTOM_APPLY_DELAY_MS);
  }

  private changeLook(edit: (look: CharacterLook) => void, keepPickerOpenFor?: PartKey): void {
    const look = CharacterLooks.clean(this.profile.look);
    edit(look);
    this.profile.setLook(look);
    this.preview.setLook(this.profile.look);
    this.syncControls(keepPickerOpenFor);
    this.announceSettled();
  }

  private syncControls(editingPart?: PartKey): void {
    const look = this.profile.look;
    Array.prototype.forEach.call(this.typeButtons.children, (button: HTMLButtonElement) => {
      button.classList.toggle("on", Number(button.dataset.type) === look.c);
    });
    CharacterCatalog.COLOR_PARTS.forEach((part) => this.syncRow(part, look, editingPart));
    this.syncToggle(this.capeButton, "cape", CharacterCatalog.hasCape(look.c), !!look.cape);
    this.syncToggle(this.hatButton, "hat", CharacterCatalog.hasHat(look.c), !!look.hat);
  }

  private syncRow(part: ColorPartInfo, look: CharacterLook, editingPart?: PartKey): void {
    const row = this.paletteBox.querySelector("[data-row='" + part.key + "']") as HTMLDivElement;
    row.hidden = !CharacterCatalog.isPartAvailable(look.c, part.key);
    (row.firstChild as HTMLSpanElement).textContent = CharacterCatalog.labelOf(look.c, part.key);
    const choice = look.p[part.key];
    const colors = CharacterCatalog.setOf(look.c, part.key);
    Array.prototype.forEach.call(row.querySelectorAll("button"), (button: HTMLButtonElement) => {
      const index = Number(button.dataset.index);
      if (index) button.style.background = colors[index - 1];
      button.classList.toggle("on", index === choice);
    });
    const custom = row.querySelector(".ce-custom") as HTMLLabelElement;
    const picker = custom.querySelector("input") as HTMLInputElement;
    const isCustom = CharacterCatalog.isCustomColor(choice);
    custom.classList.toggle("on", isCustom);
    custom.style.background = isCustom ? (choice as string) : "";
    if (part.key !== editingPart) picker.value = CharacterCatalog.colorOf(look, part.key) || CharacterCatalog.NEUTRAL_CUSTOM_COLOR;
  }

  private syncToggle(button: HTMLButtonElement, which: "cape" | "hat", available: boolean, enabled: boolean): void {
    const name = CharacterCatalog.toggleLabel(this.profile.look.c, which);
    button.hidden = !available;
    button.classList.toggle("on", enabled);
    button.textContent = name + (enabled ? " 켜짐" : " 꺼짐");
  }
}
