class FreezeLook {
  static readonly SKY = 0xA9D8F2;
  static readonly GRASS = 0x78B455;
  static readonly LANE_COLORS: readonly number[] = [0xC79A66, 0xD1AC7B];
  static readonly LINE = 0xF4F1E8;
  static readonly POST = 0x6B4A36;
  static readonly EYE = 0xFF2A1A;
  static readonly WARN_FAN = 0xFFB020;
  static readonly LOOK_FAN = 0xFF2A1A;
  static readonly WATCHER_Z = -(FreezeRules.TRACK_LENGTH + 5);
  static readonly WATCHER_SCALE = 2.5;
  static readonly WATCHER_EYE_HEIGHT = 3.3;
  static readonly RUNNER_HEAD_HEIGHT = 1.5;
  static readonly TRACK_WIDTH = FreezeRules.LANE_COUNT * FreezeRules.LANE_WIDTH;
  static readonly TREE_ZONE_LENGTH = 24;
  static readonly TREE_COUNT = 96;
  static readonly TREE_NEAR_EDGE = 13;
  static readonly TREE_FAR_EDGE = 30;
  static readonly LASER_MS = 450;
  static readonly ALERT_MS = 900;
  static readonly FAN_RADIUS = FreezeRules.TRACK_LENGTH + 14;
  static readonly FAN_HALF_ANGLE = 0.42;
}

class FreezeAssets {
  static readonly DIRECTORY = "assets/kaykit/";
  static readonly SKELETON_FILE = "characters/Skeleton_Warrior.glb";
  static readonly FLAG_FILE = "boardgame/flag_A_red.gltf";
  static readonly TREE_FILES: readonly string[] = ["props/Tree_1_A_Color1.gltf", "props/Tree_2_B_Color1.gltf", "props/Tree_3_A_Color1.gltf", "props/Tree_4_B_Color1.gltf"];
  static readonly CHEER_FILE = "animations/rig_medium_simulation.glb";
  static readonly CHEER_CLIP = "Cheering";

  private skeletonTemplate: Three<"Object3D"> | null = null;
  private flagTemplate: Three<"Object3D"> | null = null;
  private readonly treeMeshes: Array<Three<"Mesh">> = [];
  private loading: Promise<void> | null = null;
  private cheerLoading: Promise<void> | null = null;

  constructor(private readonly libs: ThreeLibs, private readonly characters: CharacterAssets) {}

  load(): Promise<void> {
    if (!this.loading) this.loading = this.loadAll();
    return this.loading;
  }

  loadCheer(): Promise<void> {
    if (!this.cheerLoading) this.cheerLoading = this.loadCheerClip().catch(() => undefined);
    return this.cheerLoading;
  }

  skeleton(): Three<"Object3D"> {
    return this.skeletonTemplate as Three<"Object3D">;
  }

  flag(): Three<"Object3D"> {
    return this.flagTemplate as Three<"Object3D">;
  }

  trees(): readonly Three<"Mesh">[] {
    return this.treeMeshes;
  }

  private async loadAll(): Promise<void> {
    const loader = new this.libs.GLTFLoader();
    const directory = FreezeAssets.DIRECTORY;
    const skeleton = loader.loadAsync(directory + FreezeAssets.SKELETON_FILE).then((gltf) => { this.skeletonTemplate = gltf.scene; });
    const flag = loader.loadAsync(directory + FreezeAssets.FLAG_FILE).then((gltf) => { this.flagTemplate = gltf.scene; });
    const trees = FreezeAssets.TREE_FILES.map((file, index) => loader.loadAsync(directory + file).then((gltf) => {
      gltf.scene.traverse((node) => {
        const mesh = node as Three<"Mesh">;
        if (mesh.isMesh && !this.treeMeshes[index]) this.treeMeshes[index] = mesh;
      });
    }));
    await Promise.all([skeleton, flag, ...trees]);
  }

  private async loadCheerClip(): Promise<void> {
    const loader = new this.libs.GLTFLoader();
    const gltf = await loader.loadAsync(FreezeAssets.DIRECTORY + FreezeAssets.CHEER_FILE);
    gltf.animations.filter((clip) => clip.name === FreezeAssets.CHEER_CLIP).forEach((clip) => this.characters.clips.set(clip.name, clip));
  }
}

class FreezeTrees {
  private readonly meshes: Array<Three<"InstancedMesh">> = [];
  private readonly materials: Array<Three<"MeshLambertMaterial">> = [];

  constructor(libs: ThreeLibs, world: Three<"Group">, sources: readonly Three<"Mesh">[]) {
    const THREE = libs.THREE;
    const random = new SeededRandom(20261005);
    const dummy = new THREE.Object3D();
    const zoneTop = 12;
    const zoneCount = Math.ceil((zoneTop + FreezeRules.TRACK_LENGTH + 32) / FreezeLook.TREE_ZONE_LENGTH);
    const placements = new Map<string, Array<{ x: number; z: number; scale: number; turn: number }>>();
    for (let tree = 0; tree < FreezeLook.TREE_COUNT; tree++) {
      const type = tree % sources.length;
      const side = tree % 2 === 0 ? -1 : 1;
      const x = side * (FreezeLook.TREE_NEAR_EDGE + random.next() * (FreezeLook.TREE_FAR_EDGE - FreezeLook.TREE_NEAR_EDGE));
      const z = zoneTop - random.next() * (zoneTop + FreezeRules.TRACK_LENGTH + 32);
      const zone = Math.min(zoneCount - 1, Math.floor((zoneTop - z) / FreezeLook.TREE_ZONE_LENGTH));
      const key = type + "|" + zone;
      const list = placements.get(key) || [];
      list.push({ x, z, scale: 0.9 + random.next() * 0.6, turn: random.next() * Math.PI * 2 });
      placements.set(key, list);
    }
    sources.forEach((source, type) => {
      const original = source.material as Three<"MeshStandardMaterial">;
      const material = new THREE.MeshLambertMaterial({ map: original.map });
      this.materials.push(material);
      for (let zone = 0; zone < zoneCount; zone++) {
        const list = placements.get(type + "|" + zone);
        if (!list) continue;
        const mesh = new THREE.InstancedMesh(source.geometry, material, list.length);
        list.forEach((placement, index) => {
          dummy.position.set(placement.x, 0, placement.z);
          dummy.rotation.set(0, placement.turn, 0);
          dummy.scale.setScalar(placement.scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        world.add(mesh);
        this.meshes.push(mesh);
      }
    });
  }

  dispose(world: Three<"Group">): void {
    this.meshes.forEach((mesh) => {
      world.remove(mesh);
      mesh.dispose();
    });
    this.materials.forEach((material) => material.dispose());
  }
}

class FreezeFinishGate {
  private static readonly POLE_HEIGHT = 4.2;
  private static readonly POLE_SIZE = 0.35;

  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(libs: ThreeLibs, page: Page, assets: FreezeAssets, private readonly world: Three<"Group">) {
    const THREE = libs.THREE;
    const z = -FreezeRules.TRACK_LENGTH;
    const half = FreezeLook.TRACK_WIDTH / 2 + 0.7;
    const postMaterial = new THREE.MeshLambertMaterial({ color: FreezeLook.POST });
    const poleGeometry = new THREE.BoxGeometry(FreezeFinishGate.POLE_SIZE, FreezeFinishGate.POLE_HEIGHT, FreezeFinishGate.POLE_SIZE);
    const barGeometry = new THREE.BoxGeometry(half * 2 + FreezeFinishGate.POLE_SIZE, 0.5, 0.5);
    [-half, half].forEach((x) => {
      const pole = new THREE.Mesh(poleGeometry, postMaterial);
      pole.position.set(x, FreezeFinishGate.POLE_HEIGHT / 2, z);
      world.add(pole);
      const flag = this.cloneFlag(libs, assets);
      flag.position.set(x, FreezeFinishGate.POLE_HEIGHT, z);
      world.add(flag);
    });
    const bar = new THREE.Mesh(barGeometry, postMaterial);
    bar.position.set(0, FreezeFinishGate.POLE_HEIGHT, z);
    world.add(bar);
    const sign = this.buildSign(libs, page);
    sign.position.set(0, FreezeFinishGate.POLE_HEIGHT + 0.95, z + 0.3);
    world.add(sign);
    this.disposables.push(postMaterial, poleGeometry, barGeometry);
  }

  dispose(): void {
    this.disposables.forEach((entry) => entry.dispose());
  }

  private cloneFlag(libs: ThreeLibs, assets: FreezeAssets): Three<"Object3D"> {
    const flag = libs.SkeletonUtils.clone(assets.flag());
    flag.scale.setScalar(2.2);
    return flag;
  }

  private buildSign(libs: ThreeLibs, page: Page): Three<"Mesh"> {
    const THREE = libs.THREE;
    const canvas = page.createCanvas(512, 96);
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.fillStyle = "#FFF6DC";
    context.fillRect(0, 0, 512, 96);
    context.lineWidth = 8;
    context.strokeStyle = "#D97B4F";
    context.strokeRect(4, 4, 504, 88);
    context.font = '800 56px "Nanum Gothic", "Malgun Gothic", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#3B2A1E";
    context.fillText("결승선", 256, 52);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const geometry = new THREE.PlaneGeometry(6, 1.1);
    this.disposables.push(texture, material, geometry);
    return new THREE.Mesh(geometry, material);
  }
}

class FreezeScene {
  readonly scene: Three<"Scene">;
  readonly camera: Three<"PerspectiveCamera">;
  readonly world: Three<"Group">;
  private readonly trees: FreezeTrees;
  private readonly gate: FreezeFinishGate;

  constructor(libs: ThreeLibs, page: Page, assets: FreezeAssets) {
    const THREE = libs.THREE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(FreezeLook.SKY);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    this.scene.add(new THREE.HemisphereLight(0xFFFFFF, 0x6F8F5A, 1.15));
    const sun = new THREE.DirectionalLight(0xFFF3D6, 1.35);
    sun.position.set(-10, 24, 12);
    this.scene.add(sun);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.buildGround(THREE);
    this.buildLanes(THREE);
    this.buildFinishLine(THREE, page);
    this.gate = new FreezeFinishGate(libs, page, assets, this.world);
    this.trees = new FreezeTrees(libs, this.world, assets.trees());
  }

  releaseMaterials(): void {
    this.trees.dispose(this.world);
    this.gate.dispose();
    this.scene.traverse((object) => {
      const material = (object as { material?: Three<"Material"> | Three<"Material">[] }).material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else if (material) material.dispose();
    });
  }

  private buildGround(THREE: ThreeModule): void {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 340), new THREE.MeshLambertMaterial({ color: FreezeLook.GRASS }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -FreezeRules.TRACK_LENGTH / 2 - 20);
    this.world.add(ground);
  }

  private buildLanes(THREE: ThreeModule): void {
    const length = FreezeRules.TRACK_LENGTH + 10;
    const centerZ = -FreezeRules.TRACK_LENGTH / 2 + 3;
    const laneGeometry = new THREE.PlaneGeometry(FreezeRules.LANE_WIDTH, length);
    const materials = FreezeLook.LANE_COLORS.map((color) => new THREE.MeshLambertMaterial({ color }));
    for (let lane = 0; lane < FreezeRules.LANE_COUNT; lane++) {
      const mesh = new THREE.Mesh(laneGeometry, materials[lane % materials.length]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(FreezeLanes.xOf(lane), 0.02, centerZ);
      this.world.add(mesh);
    }
    const lineMaterial = new THREE.MeshBasicMaterial({ color: FreezeLook.LINE });
    const lineGeometry = new THREE.PlaneGeometry(0.12, length);
    for (let edge = 0; edge <= FreezeRules.LANE_COUNT; edge++) {
      const line = new THREE.Mesh(lineGeometry, lineMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.set((edge - FreezeRules.LANE_COUNT / 2) * FreezeRules.LANE_WIDTH, 0.03, centerZ);
      this.world.add(line);
    }
    const start = new THREE.Mesh(new THREE.PlaneGeometry(FreezeLook.TRACK_WIDTH, 0.5), lineMaterial);
    start.rotation.x = -Math.PI / 2;
    start.position.set(0, 0.035, 0);
    this.world.add(start);
  }

  private buildFinishLine(THREE: ThreeModule, page: Page): void {
    const columns = 30;
    const canvas = page.createCanvas(columns * 4, 8);
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < 2; row++) {
        context.fillStyle = (column + row) % 2 === 0 ? "#FFFFFF" : "#1B1B24";
        context.fillRect(column * 4, row * 4, 4, 4);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    const finish = new THREE.Mesh(new THREE.PlaneGeometry(FreezeLook.TRACK_WIDTH, 0.9), new THREE.MeshBasicMaterial({ map: texture }));
    finish.rotation.x = -Math.PI / 2;
    finish.position.set(0, 0.04, -FreezeRules.TRACK_LENGTH);
    this.world.add(finish);
  }
}

class FreezeCamera {
  private static readonly BEHIND = 22;
  private static readonly HEIGHT = 14;
  private static readonly LOOK_AHEAD = 30;
  private static readonly OVERVIEW_Z = 40;
  private static readonly OVERVIEW_HEIGHT = 20;
  private static readonly OVERVIEW_LOOK_Z = -30;
  private static readonly SIDE_FOLLOW = 0.35;
  private static readonly SMOOTHING = 5;
  private static readonly SHOWCASE_SWAY = 0.9;
  private static readonly SHOWCASE_SPEED = 0.12;
  private static readonly SHOWCASE_RADIUS = 30;
  private static readonly SHOWCASE_HEIGHT = 12;
  private static readonly SHOWCASE_LOOK_Z = -34;

  private readonly eye = { x: 0, y: 0, z: 0 };
  private readonly focus = { x: 0, z: 0 };
  private placed = false;
  private sway = 0;

  constructor(private readonly camera: Three<"PerspectiveCamera">, private readonly env: BrowserEnv) {}

  follow(dt: number, dist: number, laneX: number): void {
    const zoom = this.zoom();
    const x = laneX * FreezeCamera.SIDE_FOLLOW;
    this.approach(dt, x, FreezeCamera.HEIGHT * zoom, -dist + FreezeCamera.BEHIND * zoom, x, -dist - FreezeCamera.LOOK_AHEAD * zoom);
  }

  overview(dt: number): void {
    const zoom = this.zoom();
    this.approach(dt, 0, FreezeCamera.OVERVIEW_HEIGHT * zoom, FreezeCamera.OVERVIEW_Z * zoom, 0, FreezeCamera.OVERVIEW_LOOK_Z);
  }

  showcase(dt: number): void {
    this.sway += dt * FreezeCamera.SHOWCASE_SPEED;
    const angle = Math.sin(this.sway) * FreezeCamera.SHOWCASE_SWAY;
    const zoom = this.zoom();
    const radius = FreezeCamera.SHOWCASE_RADIUS * zoom;
    this.approach(dt, Math.sin(angle) * radius, FreezeCamera.SHOWCASE_HEIGHT * zoom, FreezeCamera.SHOWCASE_LOOK_Z + Math.cos(angle) * radius, 0, FreezeCamera.SHOWCASE_LOOK_Z);
  }

  private zoom(): number {
    const size = this.env.viewport();
    return Math.pow(MathUtil.clamp(1.6 / (size.width / size.height), 1, 2.1), 0.8);
  }

  private approach(dt: number, x: number, y: number, z: number, lookX: number, lookZ: number): void {
    const ratio = this.placed ? Math.min(1, dt * FreezeCamera.SMOOTHING) : 1;
    this.placed = true;
    this.eye.x += (x - this.eye.x) * ratio;
    this.eye.y += (y - this.eye.y) * ratio;
    this.eye.z += (z - this.eye.z) * ratio;
    this.focus.x += (lookX - this.focus.x) * ratio;
    this.focus.z += (lookZ - this.focus.z) * ratio;
    this.camera.position.set(this.eye.x, this.eye.y, this.eye.z);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
  }
}

class FreezeEffectsKit {
  readonly alertMaterial: Three<"SpriteMaterial">;
  readonly laserGeometry: Three<"BoxGeometry">;
  readonly laserMaterial: Three<"MeshBasicMaterial">;

  constructor(libs: ThreeLibs, page: Page) {
    const THREE = libs.THREE;
    const canvas = page.createCanvas(64, 64);
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.fillStyle = "#E24A3A";
    context.beginPath();
    context.arc(32, 32, 28, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = "#FFFFFF";
    context.stroke();
    context.font = '800 44px "Nanum Gothic", "Malgun Gothic", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#FFFFFF";
    context.fillText("!", 32, 36);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.alertMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
    this.laserGeometry = new THREE.BoxGeometry(0.12, 0.12, 1);
    this.laserMaterial = new THREE.MeshBasicMaterial({ color: FreezeLook.EYE });
  }

  dispose(): void {
    if (this.alertMaterial.map) this.alertMaterial.map.dispose();
    this.alertMaterial.dispose();
    this.laserGeometry.dispose();
    this.laserMaterial.dispose();
  }
}

class FreezeWatcherView {
  private static readonly BODY_TURN_RATE = 9;
  private static readonly HEAD_TURN_RATE = 16;
  private static readonly EYE_BLINK_MS = 45;
  private static readonly EYE_RADIUS = 0.11;
  private static readonly EYE_SPREAD = 0.12;
  private static readonly EYE_UP = 0.33;
  private static readonly EYE_FORWARD = 0.25;

  private readonly group: Three<"Group">;
  private readonly inner: Three<"Group">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly head: Three<"Object3D"> | null;
  private readonly eyes: Three<"Mesh">[] = [];
  private readonly eyeMaterial: Three<"MeshBasicMaterial">;
  private bodyTurn = Math.PI;
  private headTurn = Math.PI;

  constructor(libs: ThreeLibs, assets: FreezeAssets, clips: Map<string, Three<"AnimationClip">>, private readonly world: Three<"Group">) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.model = libs.SkeletonUtils.clone(assets.skeleton());
    this.model.scale.setScalar(CharacterModelFactory.SCALE * FreezeLook.WATCHER_SCALE);
    this.model.traverse((node) => { node.frustumCulled = false; });
    this.inner.add(this.model);
    this.group.add(this.inner);
    this.group.position.set(0, 0, FreezeLook.WATCHER_Z);
    this.inner.rotation.y = Math.PI;
    world.add(this.group);
    this.head = this.model.getObjectByName("head") || null;
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: FreezeLook.EYE });
    const eyeGeometry = new THREE.SphereGeometry(FreezeWatcherView.EYE_RADIUS, 8, 6);
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
      eye.position.set(side * FreezeWatcherView.EYE_SPREAD, FreezeWatcherView.EYE_UP, FreezeWatcherView.EYE_FORWARD);
      eye.visible = false;
      (this.head || this.model).add(eye);
      this.eyes.push(eye);
    });
    this.animator = new CharacterAnimator(libs, this.model, clips);
    this.animator.play(FighterClips.IDLE);
  }

  update(phase: FreezePhase, now: number, dt: number): void {
    const bodyTarget = phase.kind === "look" ? 0 : Math.PI;
    const headTarget = phase.kind === "look" || phase.kind === "warning" ? 0 : Math.PI;
    this.bodyTurn += (bodyTarget - this.bodyTurn) * Math.min(1, dt * FreezeWatcherView.BODY_TURN_RATE);
    this.headTurn += (headTarget - this.headTurn) * Math.min(1, dt * FreezeWatcherView.HEAD_TURN_RATE);
    this.inner.rotation.y = this.bodyTurn;
    this.animator.update(dt);
    if (this.head) this.head.rotateY(this.headTurn - this.bodyTurn);
    const glowing = phase.kind === "look" || (phase.kind === "warning" && Math.sin(now / FreezeWatcherView.EYE_BLINK_MS) > 0);
    this.eyes.forEach((eye) => { eye.visible = glowing; });
  }

  dispose(): void {
    this.world.remove(this.group);
    this.eyeMaterial.dispose();
    this.eyes.forEach((eye) => eye.geometry.dispose());
  }
}

class FreezeVisionCone {
  private readonly mesh: Three<"Mesh">;
  private readonly material: Three<"MeshBasicMaterial">;

  constructor(libs: ThreeLibs, private readonly world: Three<"Group">) {
    const THREE = libs.THREE;
    this.material = new THREE.MeshBasicMaterial({ color: FreezeLook.LOOK_FAN, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    const geometry = new THREE.CircleGeometry(FreezeLook.FAN_RADIUS, 28, -Math.PI / 2 - FreezeLook.FAN_HALF_ANGLE, FreezeLook.FAN_HALF_ANGLE * 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, 0.06, FreezeLook.WATCHER_Z);
    this.mesh.visible = false;
    world.add(this.mesh);
  }

  update(phase: FreezePhase, now: number): void {
    const looking = phase.kind === "look";
    this.mesh.visible = looking || phase.kind === "warning";
    if (!this.mesh.visible) return;
    this.material.color.setHex(looking ? FreezeLook.LOOK_FAN : FreezeLook.WARN_FAN);
    this.material.opacity = looking ? 0.36 + Math.sin(now / 120) * 0.08 : 0.16;
  }

  dispose(): void {
    this.world.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

interface FreezeRunnerFrame {
  readonly x: number;
  readonly z: number;
  readonly pose: FreezePose;
  readonly runSpeed: number;
  readonly sinceCatchMs: number;
}

interface FreezePoseClip {
  readonly clip: string;
  readonly once: boolean;
}

class FreezePoseClips {
  private static readonly BY_POSE: Readonly<Record<FreezePose, FreezePoseClip>> = {
    idle: { clip: FighterClips.IDLE, once: false },
    run: { clip: FighterClips.RUN, once: false },
    hit: { clip: FighterClips.HIT, once: true },
    cheer: { clip: FreezeAssets.CHEER_CLIP, once: false }
  };

  static of(pose: FreezePose): FreezePoseClip {
    return FreezePoseClips.BY_POSE[pose];
  }
}

class FreezeRunnerView {
  private static readonly ALERT_HEIGHT = 3.3;
  private static readonly LABEL_HEIGHT = 2.75;
  private static readonly LOCAL_RING_SCALE = 1.5;

  private readonly group: Three<"Group">;
  private readonly model: Three<"Object3D">;
  private readonly blob: Three<"Mesh">;
  private readonly ring: Three<"Mesh">;
  private readonly ringMaterial: Three<"MeshBasicMaterial">;
  private readonly label: Three<"Sprite"> | null;
  private readonly alert: Three<"Sprite">;
  private readonly laser: Three<"Mesh">;
  private readonly animator: CharacterAnimator;

  constructor(
    private readonly kit: FighterViewKit,
    private readonly effects: FreezeEffectsKit,
    private readonly factory: CharacterModelFactory,
    clips: Map<string, Three<"AnimationClip">>,
    private readonly world: Three<"Group">,
    participant: MatchParticipant,
    look: CharacterLook,
    mine: boolean,
    showLabel: boolean
  ) {
    const THREE = kit.libs.THREE;
    const color = Palette.slotColor(participant.slot);
    this.group = new THREE.Group();
    this.model = factory.build(look);
    this.model.rotation.y = Math.PI;
    this.group.add(this.model);
    this.ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
    this.ring = new THREE.Mesh(kit.ringGeometry, this.ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    if (mine) this.ring.scale.setScalar(FreezeRunnerView.LOCAL_RING_SCALE);
    this.label = showLabel ? kit.labels.create(participant.nick + (participant.ai ? " (AI)" : ""), color) : null;
    if (this.label) {
      this.label.position.y = FreezeRunnerView.LABEL_HEIGHT;
      this.group.add(this.label);
    }
    this.alert = new THREE.Sprite(effects.alertMaterial);
    this.alert.scale.set(0.9, 0.9, 1);
    this.alert.visible = false;
    this.group.add(this.ring, this.alert);
    this.blob = new THREE.Mesh(kit.blobGeometry, kit.blobMaterial);
    this.blob.rotation.x = -Math.PI / 2;
    this.laser = new THREE.Mesh(effects.laserGeometry, effects.laserMaterial);
    this.laser.visible = false;
    world.add(this.group, this.blob, this.laser);
    this.animator = new CharacterAnimator(kit.libs, this.model, clips);
    this.animator.play(FighterClips.IDLE);
  }

  update(frame: FreezeRunnerFrame, dt: number): void {
    this.group.position.set(frame.x, 0, frame.z);
    this.blob.position.set(frame.x, 0.03, frame.z);
    this.showAlert(frame.sinceCatchMs);
    this.showLaser(frame);
    const plan = FreezePoseClips.of(frame.pose);
    const speed = frame.pose === "run" ? MathUtil.clamp(frame.runSpeed / 3.6, 0.7, 1.3) : 1;
    this.animator.play(plan.clip, { once: plan.once, speed });
    this.animator.update(dt);
  }

  dispose(): void {
    this.world.remove(this.group);
    this.world.remove(this.blob);
    this.world.remove(this.laser);
    this.factory.disposeModel(this.model);
    this.ringMaterial.dispose();
    if (this.label) {
      const labelMaterial = this.label.material;
      if (labelMaterial.map) labelMaterial.map.dispose();
      labelMaterial.dispose();
    }
  }

  private showAlert(sinceCatchMs: number): void {
    const active = sinceCatchMs < FreezeLook.ALERT_MS;
    this.alert.visible = active;
    if (active) this.alert.position.y = FreezeRunnerView.ALERT_HEIGHT + Math.sin(sinceCatchMs / 70) * 0.12;
  }

  private showLaser(frame: FreezeRunnerFrame): void {
    const active = frame.sinceCatchMs < FreezeLook.LASER_MS;
    this.laser.visible = active;
    if (!active) return;
    const fromY = FreezeLook.WATCHER_EYE_HEIGHT;
    const toY = FreezeLook.RUNNER_HEAD_HEIGHT;
    const dx = frame.x, dy = toY - fromY, dz = frame.z - FreezeLook.WATCHER_Z;
    const length = Math.hypot(dx, dy, dz);
    this.laser.position.set(dx / 2, fromY + dy / 2, FreezeLook.WATCHER_Z + dz / 2);
    this.laser.scale.set(1, 1, length);
    this.laser.lookAt(frame.x, toY, frame.z);
  }
}

class FreezeRunnerViews {
  private readonly views = new Map<string, FreezeRunnerView>();

  constructor(
    private readonly kit: FighterViewKit,
    private readonly effects: FreezeEffectsKit,
    private readonly factory: CharacterModelFactory,
    private readonly characters: CharacterAssets,
    private readonly world: Three<"Group">
  ) {}

  build(runners: readonly FreezeRunnerState[], looks: ReadonlyMap<string, CharacterLook>, localId: string, showLabels: boolean): void {
    this.clear();
    runners.forEach((runner) => {
      const look = looks.get(runner.id) || CharacterLooks.createDefault();
      this.views.set(runner.id, new FreezeRunnerView(this.kit, this.effects, this.factory, this.characters.clips, this.world, runner.participant, look, runner.id === localId, showLabels));
    });
  }

  update(runners: readonly FreezeRunnerState[], now: number, dt: number): void {
    runners.forEach((runner) => {
      const view = this.views.get(runner.id);
      if (!view) return;
      view.update({
        x: FreezeLanes.xOf(runner.lane),
        z: -runner.dist,
        pose: runner.pose(now),
        runSpeed: runner.speed || FreezeRules.RUN_SPEED,
        sinceCatchMs: runner.caughtAt > 0 ? now - runner.caughtAt : Infinity
      }, dt);
    });
  }

  clear(): void {
    this.views.forEach((view) => view.dispose());
    this.views.clear();
  }
}

class FreezeSignalStyle {
  constructor(readonly css: string, readonly headline: string) {}
}

class FreezeSignalHud {
  private static readonly STYLES: Readonly<Record<FreezePhaseKind, FreezeSignalStyle>> = {
    idle: new FreezeSignalStyle("idle", "준비"),
    safe: new FreezeSignalStyle("go", "달려!"),
    warning: new FreezeSignalStyle("warn", "!"),
    look: new FreezeSignalStyle("stop", "멈춰!")
  };

  private readonly signal: HTMLElement;
  private readonly edge: HTMLElement;
  private signature = "";

  constructor(private readonly page: Page) {
    this.signal = page.byId("fzSignal");
    this.edge = page.byId("fzEdge");
  }

  update(started: boolean, phase: FreezePhase, now: number, note: string): void {
    this.page.show(this.signal, started);
    this.page.show(this.edge, started);
    if (!started) return;
    const style = FreezeSignalHud.STYLES[phase.kind];
    const cheer = phase.kind === "safe" && phase.cycle ? phase.cycle.cheerAt(now) : phase.kind === "idle" ? "" : FreezeRules.CHEER_TEXT;
    const signature = style.css + "|" + cheer + "|" + note;
    if (signature === this.signature) return;
    this.signature = signature;
    this.edge.className = phase.kind === "look" ? "pulse" : "";
    this.signal.className = style.css;
    this.signal.innerHTML = "<b>" + style.headline + "</b><span>" + Html.escape(cheer) + "</span>" + (note ? "<small>" + Html.escape(note) + "</small>" : "");
  }

  hide(): void {
    this.signature = "";
    this.page.show(this.signal, false);
    this.page.show(this.edge, false);
  }
}
