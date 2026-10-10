"use strict";
class CharacterCatalog {
    static colorPart(key) {
        return CharacterCatalog.COLOR_PARTS.filter((part) => part.key === key)[0];
    }
    static type(typeIndex) {
        return CharacterCatalog.TYPES[typeIndex];
    }
    static setOf(typeIndex, key) {
        return key === "skin" ? CharacterCatalog.type(typeIndex).skinSet : CharacterCatalog.colorPart(key).set;
    }
    static labelOf(typeIndex, key) {
        return CharacterCatalog.type(typeIndex).labels[key] || CharacterCatalog.colorPart(key).label;
    }
    static isCustomColor(choice) {
        return typeof choice === "string" && CharacterCatalog.CUSTOM_COLOR_PATTERN.test(choice);
    }
    static colorOf(look, key) {
        const choice = look.p[key];
        if (CharacterCatalog.isCustomColor(choice))
            return choice;
        return typeof choice === "number" && choice ? CharacterCatalog.setOf(look.c, key)[choice - 1] : null;
    }
    static hasCape(typeIndex) {
        return CharacterCatalog.type(typeIndex).capeMeshes.length > 0;
    }
    static hasHat(typeIndex) {
        return CharacterCatalog.type(typeIndex).hatMeshes.length > 0;
    }
    static toggleLabel(typeIndex, which) {
        const labels = CharacterCatalog.type(typeIndex).labels;
        return (which === "cape" ? labels.capeToggle : labels.hatToggle) || (which === "cape" ? "망토" : "모자");
    }
    static isPartAvailable(typeIndex, key) {
        return key === "skin" || !!CharacterCatalog.type(typeIndex).rules[key];
    }
}
CharacterCatalog.COLOR_SET = ["#D94B4B", "#F08A3E", "#F2C93B", "#5DBB63", "#3FB6B0", "#4A86E8", "#7B5CD6", "#D965A8", "#F2F2EE", "#3B3F4A"];
CharacterCatalog.SKIN_SET = ["#FFE0C8", "#F6C09C", "#F2D2B5", "#E2A981", "#C98A62", "#A86A48", "#7E4B33", "#5A3524"];
CharacterCatalog.BONE_SET = ["#F2EBD8", "#E3D9BC", "#CFC6AA", "#B5AE9A", "#F2F2EE", "#E8D08A", "#8FD9C7", "#C94A4A"];
CharacterCatalog.HAIR_SET = ["#1B191B", "#4A3222", "#7A4A2E", "#B0703A", "#E2C36A", "#F2E8C8", "#C94A4A", "#4A86E8", "#7B5CD6", "#9AA0A6"];
CharacterCatalog.CUSTOM_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
CharacterCatalog.NEUTRAL_CUSTOM_COLOR = "#888888";
CharacterCatalog.RANDOM_TYPE_COUNT = 6;
CharacterCatalog.ADVENTURER = { skinCell: [0, 0], skinSet: CharacterCatalog.SKIN_SET, capeMeshes: ["Cape"] };
CharacterCatalog.SKELETON = { skinCell: [1, 1], skinSet: CharacterCatalog.BONE_SET, capeMeshes: [] };
CharacterCatalog.TYPES = [
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
CharacterCatalog.HIDDEN_MESHES = ["Mask"];
CharacterCatalog.PAINTED_PARTS = ["top", "arm", "pants", "cape", "hat", "hair"];
CharacterCatalog.COLOR_PARTS = [
    { key: "top", label: "옷", set: CharacterCatalog.COLOR_SET },
    { key: "arm", label: "팔", set: CharacterCatalog.COLOR_SET },
    { key: "pants", label: "바지", set: CharacterCatalog.COLOR_SET },
    { key: "cape", label: "망토", set: CharacterCatalog.COLOR_SET },
    { key: "hat", label: "모자", set: CharacterCatalog.COLOR_SET },
    { key: "skin", label: "피부", set: CharacterCatalog.SKIN_SET },
    { key: "hair", label: "머리색", set: CharacterCatalog.HAIR_SET }
];
class CharacterLooks {
    static createDefault() {
        return { c: 0, p: { top: 0, arm: 0, pants: 0, cape: 0, hat: 0, skin: 0, hair: 0 }, cape: 1, hat: 1 };
    }
    static clean(raw) {
        const look = CharacterLooks.createDefault();
        if (!raw || typeof raw !== "object")
            return look;
        const source = raw;
        look.c = CharacterLooks.clamp(Math.floor(Number(source.c) || 0), 0, CharacterCatalog.TYPES.length - 1);
        CharacterCatalog.COLOR_PARTS.forEach((part) => {
            look.p[part.key] = CharacterLooks.cleanChoice(source.p ? source.p[part.key] : 0, part.set.length);
        });
        look.cape = source.cape === 0 ? 0 : 1;
        look.hat = source.hat === 0 ? 0 : 1;
        return look;
    }
    static random() {
        const look = CharacterLooks.createDefault();
        look.c = Math.floor(Math.random() * CharacterCatalog.RANDOM_TYPE_COUNT);
        CharacterCatalog.COLOR_PARTS.forEach((part) => {
            look.p[part.key] = Math.random() < 0.15 ? 0 : 1 + Math.floor(Math.random() * part.set.length);
        });
        return look;
    }
    static cleanChoice(raw, paletteSize) {
        if (CharacterCatalog.isCustomColor(raw))
            return raw.toLowerCase();
        return CharacterLooks.clamp(Math.floor(Number(raw) || 0), 0, paletteSize);
    }
    static clamp(value, low, high) {
        return value < low ? low : value > high ? high : value;
    }
}
class PlayerProfile {
    constructor() {
        this.nick = "";
        this.look = CharacterLooks.createDefault();
        this.fallbackNick = "";
        this.broadcasting = false;
        this.listeners = [];
        this.load();
        document.addEventListener(PlayerProfile.CHANGE_EVENT, () => {
            if (this.broadcasting)
                return;
            this.load();
            this.notify();
        });
    }
    static cleanNick(text) {
        return String(text || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, PlayerProfile.MAX_NICK_LENGTH);
    }
    static storedNick() {
        try {
            const stored = localStorage.getItem(PlayerProfile.STORAGE_KEY);
            return stored ? PlayerProfile.cleanNick(JSON.parse(stored).nick || "") : "";
        }
        catch (error) {
            return "";
        }
    }
    nickOrDefault() {
        if (this.nick)
            return this.nick;
        if (!this.fallbackNick)
            this.fallbackNick = "학생" + (10 + Math.floor(Math.random() * 90));
        return this.fallbackNick;
    }
    setNick(text) {
        this.nick = PlayerProfile.cleanNick(text);
        this.save();
        this.notify();
    }
    setLook(look) {
        this.look = CharacterLooks.clean(look);
        this.save();
        this.notify();
    }
    onChange(listener) {
        this.listeners.push(listener);
    }
    notify() {
        this.listeners.forEach((listener) => listener());
    }
    load() {
        try {
            const stored = localStorage.getItem(PlayerProfile.STORAGE_KEY);
            const data = stored ? JSON.parse(stored) : {};
            this.nick = PlayerProfile.cleanNick(data.nick || "");
            this.look = CharacterLooks.clean(data.look);
        }
        catch (error) {
            this.nick = "";
            this.look = CharacterLooks.createDefault();
        }
    }
    save() {
        try {
            localStorage.setItem(PlayerProfile.STORAGE_KEY, JSON.stringify({ nick: this.nick, look: this.look }));
        }
        catch (error) {
            return;
        }
        this.broadcasting = true;
        document.dispatchEvent(new CustomEvent(PlayerProfile.CHANGE_EVENT));
        this.broadcasting = false;
    }
}
PlayerProfile.STORAGE_KEY = "portal_profile_v1";
PlayerProfile.CHANGE_EVENT = "portal-profile-changed";
PlayerProfile.SETTLED_EVENT = "portal-profile-settled";
PlayerProfile.MAX_NICK_LENGTH = 4;
PlayerProfile.REAL_NAME_NOTICE = "닉네임은 본명으로 입력합니다";
PlayerProfile.NICK_REQUIRED_NOTICE = "닉네임(본명)을 먼저 정해 주세요.";
class CharacterAssets {
    constructor(libs, directory = CharacterAssets.DEFAULT_DIRECTORY) {
        this.libs = libs;
        this.directory = directory;
        this.clips = new Map();
        this.templates = new Map();
        this.loading = null;
    }
    load() {
        if (!this.loading)
            this.loading = this.loadAll();
        return this.loading;
    }
    template(file) {
        const template = this.templates.get(file);
        if (!template)
            throw new Error("캐릭터 모델을 아직 불러오지 못했어요: " + file);
        return template;
    }
    async loadAll() {
        const loader = new this.libs.GLTFLoader();
        const animations = loader.loadAsync(this.directory + CharacterAssets.ANIMATION_FILE).then((gltf) => {
            gltf.animations.forEach((clip) => this.clips.set(clip.name, clip));
        });
        const characters = CharacterCatalog.TYPES.map((type) => loader.loadAsync(this.directory + "characters/" + type.file + ".glb").then((gltf) => {
            this.templates.set(type.file, gltf.scene);
        }));
        await Promise.all([animations, ...characters]);
    }
}
CharacterAssets.DEFAULT_DIRECTORY = "assets/kaykit/";
CharacterAssets.ANIMATION_FILE = "animations/teambattle_anims.glb?v=crossbow";
class CharacterModelFactory {
    constructor(libs, assets) {
        this.libs = libs;
        this.assets = assets;
        this.textureCache = new Map();
    }
    build(look) {
        const typeIndex = look.c;
        const type = CharacterCatalog.type(typeIndex);
        const template = this.assets.template(type.file);
        const model = this.libs.SkeletonUtils.clone(template);
        const sourceImage = this.sourceImageOf(template);
        model.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh)
                return;
            const suffix = this.meshSuffix(mesh.name, type.prefix);
            mesh.material = new this.libs.THREE.MeshLambertMaterial({ map: this.textureFor(typeIndex, suffix, look, sourceImage) });
            mesh.frustumCulled = false;
            if (CharacterCatalog.HIDDEN_MESHES.indexOf(suffix) >= 0)
                mesh.visible = false;
            if (type.capeMeshes.indexOf(suffix) >= 0 && !look.cape)
                mesh.visible = false;
            if (type.hatMeshes.indexOf(suffix) >= 0 && !look.hat)
                mesh.visible = false;
        });
        model.scale.setScalar(CharacterModelFactory.SCALE);
        return model;
    }
    disposeModel(model) {
        model.traverse((node) => {
            const mesh = node;
            if (mesh.isMesh && !Array.isArray(mesh.material))
                mesh.material.dispose();
        });
    }
    sourceImageOf(template) {
        const mesh = template.getObjectByProperty("isMesh", true);
        const material = mesh.material;
        return material.map.image;
    }
    meshSuffix(name, prefix) {
        return name.indexOf(prefix + "_") === 0 ? name.slice(prefix.length + 1) : name;
    }
    shade(hex, factor) {
        const value = parseInt(hex.slice(1), 16);
        const red = (value >> 16) & 255, green = (value >> 8) & 255, blue = value & 255;
        return "rgb(" + Math.round(red * factor) + "," + Math.round(green * factor) + "," + Math.round(blue * factor) + ")";
    }
    paintListFor(typeIndex, suffix, look) {
        const type = CharacterCatalog.type(typeIndex);
        const paint = [];
        CharacterCatalog.PAINTED_PARTS.forEach((part) => {
            const cells = type.rules[part] ? type.rules[part][suffix] : undefined;
            const color = CharacterCatalog.colorOf(look, part);
            if (cells && color)
                cells.forEach((cell) => paint.push([cell[0], cell[1], color]));
        });
        const skin = CharacterCatalog.colorOf(look, "skin");
        if (skin)
            paint.push([type.skinCell[0], type.skinCell[1], skin]);
        return paint;
    }
    textureFor(typeIndex, suffix, look, sourceImage) {
        const paint = this.paintListFor(typeIndex, suffix, look);
        const key = typeIndex + "|" + suffix + "|" + paint.map((cell) => cell.join(":")).join("/");
        const cached = this.textureCache.get(key);
        if (cached)
            return cached;
        const size = CharacterModelFactory.TEXTURE_SIZE;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d");
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
    rememberTexture(key, texture) {
        this.textureCache.set(key, texture);
        if (this.textureCache.size <= CharacterModelFactory.TEXTURE_CACHE_LIMIT)
            return;
        const oldest = this.textureCache.keys().next().value;
        this.textureCache.get(oldest).dispose();
        this.textureCache.delete(oldest);
    }
}
CharacterModelFactory.SCALE = 0.8;
CharacterModelFactory.TEXTURE_SIZE = 256;
CharacterModelFactory.TEXTURE_COLUMNS = 8;
CharacterModelFactory.TEXTURE_ROWS = 4;
CharacterModelFactory.TEXTURE_CACHE_LIMIT = 400;
class CharacterAnimator {
    constructor(libs, model, clips) {
        this.libs = libs;
        this.clips = clips;
        this.actions = new Map();
        this.currentKey = "";
        this.mixer = new libs.THREE.AnimationMixer(model);
    }
    play(clipName, options = {}) {
        const key = clipName + (options.once ? "#once" : "");
        const action = this.actionFor(key, clipName, !!options.once);
        if (!action)
            return;
        if (this.currentKey !== key) {
            const previous = this.actions.get(this.currentKey);
            action.reset().setEffectiveWeight(1).play();
            if (previous && previous !== action)
                previous.crossFadeTo(action, 0.12, false);
            this.currentKey = key;
        }
        action.timeScale = options.speed || 1;
    }
    update(deltaSeconds) {
        this.mixer.update(deltaSeconds);
    }
    actionFor(key, clipName, once) {
        const existing = this.actions.get(key);
        if (existing)
            return existing;
        const clip = this.clips.get(clipName);
        if (!clip)
            return null;
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
    constructor(libs, factory, assets, canvas) {
        this.libs = libs;
        this.factory = factory;
        this.assets = assets;
        this.canvas = canvas;
        this.model = null;
        this.animator = null;
        this.yaw = 0.4;
        this.dragPointer = null;
        this.dragX = 0;
        this.running = false;
        this.lastFrameMs = 0;
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
    setLook(look) {
        if (this.model) {
            this.pivot.remove(this.model);
            this.factory.disposeModel(this.model);
        }
        this.model = this.factory.build(look);
        this.pivot.add(this.model);
        this.animator = new CharacterAnimator(this.libs, this.model, this.assets.clips);
        this.animator.play("Idle_A");
    }
    turn(radians) {
        this.yaw += radians;
    }
    setActive(active) {
        if (active && !this.running) {
            this.running = true;
            this.clock.getDelta();
            requestAnimationFrame(() => this.frame());
        }
        else if (!active) {
            this.running = false;
        }
    }
    bindDrag() {
        this.canvas.style.touchAction = "pan-y";
        this.canvas.addEventListener("pointerdown", (event) => {
            this.dragPointer = event.pointerId;
            this.dragX = event.clientX;
            this.canvas.setPointerCapture(event.pointerId);
        });
        this.canvas.addEventListener("pointermove", (event) => {
            if (event.pointerId !== this.dragPointer)
                return;
            this.yaw += (event.clientX - this.dragX) * 0.012;
            this.dragX = event.clientX;
        });
        const end = (event) => {
            if (event.pointerId === this.dragPointer)
                this.dragPointer = null;
        };
        this.canvas.addEventListener("pointerup", end);
        this.canvas.addEventListener("pointercancel", end);
    }
    fitToCanvas() {
        const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
        if (!width || !height)
            return;
        const target = this.renderer.getSize(new this.libs.THREE.Vector2());
        if (target.x !== width || target.y !== height) {
            this.renderer.setSize(width, height, false);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
    }
    frame() {
        if (!this.running)
            return;
        if (!this.canvas.clientWidth) {
            requestAnimationFrame(() => this.frame());
            return;
        }
        this.fitToCanvas();
        const delta = Math.min(this.clock.getDelta(), 0.1);
        if (this.animator)
            this.animator.update(delta);
        this.pivot.rotation.y = this.yaw;
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(() => this.frame());
    }
}
class NickEditor {
    constructor(profile) {
        this.profile = profile;
        this.onSettledListener = () => undefined;
        this.root = document.createElement("div");
        this.root.className = "ce-nickbox";
        this.root.innerHTML =
            "<label class='st-label'>닉네임</label>" +
                "<input type='text' class='ce-nick' maxlength='" + PlayerProfile.MAX_NICK_LENGTH + "' autocomplete='off' placeholder='닉네임 (최대 " + PlayerProfile.MAX_NICK_LENGTH + "글자)'>" +
                "<div class='ce-notice'>" + PlayerProfile.REAL_NAME_NOTICE + "</div>";
        this.input = this.root.querySelector(".ce-nick");
        this.input.addEventListener("input", () => this.profile.setNick(this.input.value));
        this.input.addEventListener("change", () => {
            document.dispatchEvent(new CustomEvent(PlayerProfile.SETTLED_EVENT));
            this.onSettledListener();
        });
        this.refresh();
    }
    get element() {
        return this.root;
    }
    onSettled(listener) {
        this.onSettledListener = listener;
    }
    refresh() {
        if (document.activeElement !== this.input)
            this.input.value = this.profile.nick;
    }
    focus() {
        this.input.focus();
    }
}
class ProfileEditor {
    constructor(libs, factory, assets, profile) {
        this.profile = profile;
        this.onLookChanged = () => undefined;
        this.customTimer = 0;
        this.root = document.createElement("div");
        this.root.className = "ce-editor";
        this.root.innerHTML =
            "<div class='ce-nickslot'></div>" +
                "<canvas class='ce-preview'></canvas>" +
                "<div class='ce-hint'>끌어서 돌려 보기</div>" +
                "<label class='st-label'>캐릭터</label><div class='st-opts ce-types'></div>" +
                "<div class='ce-palettes'></div>" +
                "<div class='ce-toggles'><button type='button' class='ce-cape'></button><button type='button' class='ce-hat'></button>" +
                "<button type='button' class='ce-turn-left'>◀ 돌리기</button><button type='button' class='ce-turn-right'>돌리기 ▶</button></div>";
        this.nickEditor = new NickEditor(profile);
        this.nickEditor.onSettled(() => this.onLookChanged());
        this.root.querySelector(".ce-nickslot").appendChild(this.nickEditor.element);
        this.typeButtons = this.root.querySelector(".ce-types");
        this.paletteBox = this.root.querySelector(".ce-palettes");
        this.capeButton = this.root.querySelector(".ce-cape");
        this.hatButton = this.root.querySelector(".ce-hat");
        this.preview = new CharacterPreview(libs, factory, assets, this.root.querySelector(".ce-preview"));
        this.buildTypeButtons();
        this.buildPalettes();
        this.bindEvents();
        this.syncControls();
    }
    mount(container) {
        container.appendChild(this.root);
        this.preview.setLook(this.profile.look);
        this.nickEditor.refresh();
        this.syncControls();
    }
    setActive(active) {
        this.preview.setActive(active);
    }
    focusNick() {
        this.nickEditor.focus();
    }
    onChange(listener) {
        this.onLookChanged = listener;
    }
    refreshFromProfile() {
        this.nickEditor.refresh();
        this.preview.setLook(this.profile.look);
        this.syncControls();
    }
    buildTypeButtons() {
        this.typeButtons.innerHTML = CharacterCatalog.TYPES.map((type, index) => "<button type='button' data-type='" + index + "'>" + type.name + "</button>").join("");
    }
    buildPalettes() {
        this.paletteBox.innerHTML = CharacterCatalog.COLOR_PARTS.map((part) => {
            const defaultSwatch = "<button type='button' class='ce-sw ce-sw-default' data-part='" + part.key + "' data-index='0' title='기본'></button>";
            const swatches = part.set.map((color, index) => "<button type='button' class='ce-sw' data-part='" + part.key + "' data-index='" + (index + 1) + "'></button>").join("");
            const custom = "<label class='ce-sw ce-custom' title='직접 고르기'><input type='color' data-custom='" + part.key + "' value='" + CharacterCatalog.NEUTRAL_CUSTOM_COLOR + "'></label>";
            return "<div class='ce-row' data-row='" + part.key + "'><span></span><div>" + defaultSwatch + swatches + custom + "</div></div>";
        }).join("");
    }
    bindEvents() {
        this.typeButtons.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-type]");
            if (!button)
                return;
            this.changeLook((look) => { look.c = Number(button.dataset.type); });
        });
        this.paletteBox.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-part]");
            if (!button)
                return;
            this.changeLook((look) => { look.p[button.dataset.part] = Number(button.dataset.index); });
        });
        this.paletteBox.addEventListener("input", (event) => {
            const input = event.target;
            if (!input.dataset.custom)
                return;
            this.applyCustomColorSoon(input.dataset.custom, input.value);
        });
        this.capeButton.addEventListener("click", () => this.changeLook((look) => { look.cape = look.cape ? 0 : 1; }));
        this.hatButton.addEventListener("click", () => this.changeLook((look) => { look.hat = look.hat ? 0 : 1; }));
        this.root.querySelector(".ce-turn-left").addEventListener("click", () => this.preview.turn(-0.8));
        this.root.querySelector(".ce-turn-right").addEventListener("click", () => this.preview.turn(0.8));
    }
    announceSettled() {
        document.dispatchEvent(new CustomEvent(PlayerProfile.SETTLED_EVENT));
        this.onLookChanged();
    }
    applyCustomColorSoon(part, hex) {
        window.clearTimeout(this.customTimer);
        this.customTimer = window.setTimeout(() => {
            this.changeLook((look) => { look.p[part] = hex.toLowerCase(); }, part);
        }, ProfileEditor.CUSTOM_APPLY_DELAY_MS);
    }
    changeLook(edit, keepPickerOpenFor) {
        const look = CharacterLooks.clean(this.profile.look);
        edit(look);
        this.profile.setLook(look);
        this.preview.setLook(this.profile.look);
        this.syncControls(keepPickerOpenFor);
        this.announceSettled();
    }
    syncControls(editingPart) {
        const look = this.profile.look;
        Array.prototype.forEach.call(this.typeButtons.children, (button) => {
            button.classList.toggle("on", Number(button.dataset.type) === look.c);
        });
        CharacterCatalog.COLOR_PARTS.forEach((part) => this.syncRow(part, look, editingPart));
        this.syncToggle(this.capeButton, "cape", CharacterCatalog.hasCape(look.c), !!look.cape);
        this.syncToggle(this.hatButton, "hat", CharacterCatalog.hasHat(look.c), !!look.hat);
    }
    syncRow(part, look, editingPart) {
        const row = this.paletteBox.querySelector("[data-row='" + part.key + "']");
        row.hidden = !CharacterCatalog.isPartAvailable(look.c, part.key);
        row.firstChild.textContent = CharacterCatalog.labelOf(look.c, part.key);
        const choice = look.p[part.key];
        const colors = CharacterCatalog.setOf(look.c, part.key);
        Array.prototype.forEach.call(row.querySelectorAll("button"), (button) => {
            const index = Number(button.dataset.index);
            if (index)
                button.style.background = colors[index - 1];
            button.classList.toggle("on", index === choice);
        });
        const custom = row.querySelector(".ce-custom");
        const picker = custom.querySelector("input");
        const isCustom = CharacterCatalog.isCustomColor(choice);
        custom.classList.toggle("on", isCustom);
        custom.style.background = isCustom ? choice : "";
        if (part.key !== editingPart)
            picker.value = CharacterCatalog.colorOf(look, part.key) || CharacterCatalog.NEUTRAL_CUSTOM_COLOR;
    }
    syncToggle(button, which, available, enabled) {
        const name = CharacterCatalog.toggleLabel(this.profile.look.c, which);
        button.hidden = !available;
        button.classList.toggle("on", enabled);
        button.textContent = name + (enabled ? " 켜짐" : " 꺼짐");
    }
}
ProfileEditor.CUSTOM_APPLY_DELAY_MS = 90;
