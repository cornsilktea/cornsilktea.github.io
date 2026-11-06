class MoleLook {
  static readonly SKY = 0x15122E;
  static readonly GROUND = 0x2B3A2A;
  static readonly DIRT = 0x4A3626;
  static readonly HOLE = 0x1B130D;
  static readonly MOON = 0xFFF4C8;
  static readonly EYE_RED = 0xFF2A1A;
  static readonly GOLD = 0xFFD34D;
  static readonly GOLD_GLOW = 0x6B4A00;
  static readonly FLASH_WHITE = 0xF4F1E8;
  static readonly FLASH_DUST = 0x9A8F7A;
  static readonly STAR_COUNT = 110;
  static readonly MOUND_SIZE = 6.1;
  static readonly HOLE_RADIUS = 0.62;
  static readonly STONE_BACK = 0.55;
  static readonly HOLE_FRONT = 0.15;
  static readonly SKELETON_FRONT = 0.2;
  static readonly RISE_MS = 220;
  static readonly SINK_MS = 240;
  static readonly HIT_LINGER_MS = 230;
  static readonly SPAWN_CLIP_SPEED = 2;
  static readonly SINK_DEPTH = 1.9;
  static readonly SHAKE_S = 0.3;
  static readonly SHAKE_ROLL = 0.2;
  static readonly SHAKE_RATE = 38;
  static readonly FLASH_MS = 320;
  static readonly SWING_MS = 450;
  static readonly SWING_SPEED = 3;
  static readonly CHEER_MS = 1300;
  static readonly CHEER_SPEED = 1.4;
  static readonly OUCH_MS = 600;
  static readonly HAMMER_SCALE = 1.4;
  static readonly FRESH_OUTCOME_MS = 600;
}

class MoleBoardPlace {
  static readonly SPACING = 1.7;
  static readonly HALF = 1.5 * MoleBoardPlace.SPACING + 0.5;

  constructor(readonly x: number, readonly z: number, readonly scale: number, readonly mine: boolean) {}

  cellX(cell: number): number {
    return this.x + (cell % MoleRules.COLUMNS - 1) * MoleBoardPlace.SPACING * this.scale;
  }

  cellZ(cell: number): number {
    return this.z + (Math.floor(cell / MoleRules.COLUMNS) - 1) * MoleBoardPlace.SPACING * this.scale;
  }

  keeperX(): number {
    return this.x - (MoleBoardPlace.HALF + 0.9) * this.scale;
  }

  keeperScale(): number {
    return this.mine ? 1.3 : this.scale * 1.35;
  }

  signSize(): number {
    return this.mine ? 4 : Math.max(2.8, this.scale * 3.2);
  }

  signHeight(): number {
    return this.mine ? 4.4 : 2.2;
  }
}

class MoleLayout {
  private static readonly MINE_SCALE = 1.5;
  private static readonly MINE_Z = 5.2;
  private static readonly OTHER_SCALE = 0.5;
  private static readonly ARC_RADIUS = 9.5;
  private static readonly ARC_BASE_Z = -2.5;
  private static readonly ARC_DEPTH = 4.5;
  private static readonly ARC_SPAN = 70 * Math.PI / 180;
  private static readonly GRID_SCALE = 0.9;
  private static readonly GRID_STEP_X = 9;
  private static readonly GRID_FAR_Z = -3;
  private static readonly GRID_NEAR_Z = 6;

  static place(ids: readonly string[], localId: string): Map<string, MoleBoardPlace> {
    const places = new Map<string, MoleBoardPlace>();
    if (ids.indexOf(localId) < 0) {
      ids.forEach((id, index) => places.set(id, MoleLayout.gridPlace(index)));
      return places;
    }
    places.set(localId, new MoleBoardPlace(0, MoleLayout.MINE_Z, MoleLayout.MINE_SCALE, true));
    const others = ids.filter((id) => id !== localId);
    others.forEach((id, index) => places.set(id, MoleLayout.arcPlace(index, others.length)));
    return places;
  }

  private static arcPlace(index: number, count: number): MoleBoardPlace {
    const angle = count <= 1 ? 0 : -MoleLayout.ARC_SPAN + 2 * MoleLayout.ARC_SPAN * index / (count - 1);
    const x = MoleLayout.ARC_RADIUS * Math.sin(angle);
    const z = MoleLayout.ARC_BASE_Z - MoleLayout.ARC_DEPTH * Math.cos(angle);
    return new MoleBoardPlace(x, z, MoleLayout.OTHER_SCALE, false);
  }

  private static gridPlace(index: number): MoleBoardPlace {
    const column = index % 3;
    const row = Math.floor(index / 3);
    return new MoleBoardPlace((column - 1) * MoleLayout.GRID_STEP_X, row === 0 ? MoleLayout.GRID_FAR_Z : MoleLayout.GRID_NEAR_Z, MoleLayout.GRID_SCALE, false);
  }
}

class MoleAssets {
  static readonly DIRECTORY = "assets/kaykit/";
  static readonly MINION_FILE = "characters/Skeleton_Minion.glb";
  static readonly STONE_FILES: readonly string[] = ["halloween/gravestone.gltf", "halloween/gravemarker_B.gltf"];
  static readonly PUMPKIN_FILE = "halloween/pumpkin_orange_jackolantern.gltf";
  static readonly FENCE_FILE = "halloween/fence_seperate.gltf";
  static readonly HAMMER_FILE = "props/hammer_A.gltf";
  static readonly TOOLS_FILE = "animations/rig_medium_tools.glb";
  static readonly GENERAL_FILE = "animations/rig_medium_general.glb";
  static readonly CHEER_FILE = "animations/rig_medium_simulation.glb";
  static readonly SPAWN_CLIP = "Spawn_Ground";
  static readonly HAMMER_CLIP = "Hammering";
  static readonly CHEER_CLIP = "Cheering";

  private minion: Three<"Object3D"> | null = null;
  private hammerModel: Three<"Object3D"> | null = null;
  private readonly stoneMeshes: Array<Three<"Mesh">> = [];
  private pumpkinMesh: Three<"Mesh"> | null = null;
  private fenceMesh: Three<"Mesh"> | null = null;
  private loading: Promise<void> | null = null;
  private clipLoading: Promise<void> | null = null;

  constructor(private readonly libs: ThreeLibs, private readonly characters: CharacterAssets) {}

  load(): Promise<void> {
    if (!this.loading) this.loading = this.loadModels();
    return this.loading;
  }

  loadClips(): Promise<void> {
    if (!this.clipLoading) {
      this.clipLoading = Promise.all([
        this.loadClip(MoleAssets.GENERAL_FILE, MoleAssets.SPAWN_CLIP),
        this.loadClip(MoleAssets.TOOLS_FILE, MoleAssets.HAMMER_CLIP),
        this.loadClip(MoleAssets.CHEER_FILE, MoleAssets.CHEER_CLIP)
      ]).then(() => undefined);
    }
    return this.clipLoading;
  }

  minionTemplate(): Three<"Object3D"> {
    return this.minion as Three<"Object3D">;
  }

  hammer(): Three<"Object3D"> {
    return this.hammerModel as Three<"Object3D">;
  }

  stones(): readonly Three<"Mesh">[] {
    return this.stoneMeshes;
  }

  pumpkin(): Three<"Mesh"> {
    return this.pumpkinMesh as Three<"Mesh">;
  }

  fence(): Three<"Mesh"> {
    return this.fenceMesh as Three<"Mesh">;
  }

  private async loadModels(): Promise<void> {
    const loader = new this.libs.GLTFLoader();
    const directory = MoleAssets.DIRECTORY;
    const minion = loader.loadAsync(directory + MoleAssets.MINION_FILE).then((gltf) => { this.minion = gltf.scene; });
    const hammer = loader.loadAsync(directory + MoleAssets.HAMMER_FILE).then((gltf) => { this.hammerModel = gltf.scene; });
    const stones = MoleAssets.STONE_FILES.map((file, index) => loader.loadAsync(directory + file).then((gltf) => { this.stoneMeshes[index] = MoleAssets.firstMesh(gltf.scene); }));
    const pumpkin = loader.loadAsync(directory + MoleAssets.PUMPKIN_FILE).then((gltf) => { this.pumpkinMesh = MoleAssets.firstMesh(gltf.scene); });
    const fence = loader.loadAsync(directory + MoleAssets.FENCE_FILE).then((gltf) => { this.fenceMesh = MoleAssets.firstMesh(gltf.scene); });
    await Promise.all([minion, hammer, pumpkin, fence, ...stones]);
  }

  private async loadClip(file: string, wanted: string): Promise<void> {
    try {
      const loader = new this.libs.GLTFLoader();
      const gltf = await loader.loadAsync(MoleAssets.DIRECTORY + file);
      gltf.animations.filter((clip) => clip.name === wanted && !this.characters.clips.has(clip.name)).forEach((clip) => this.characters.clips.set(clip.name, clip));
    } catch (error) {
      return;
    }
  }

  static firstMesh(root: Three<"Object3D">): Three<"Mesh"> {
    let found: Three<"Mesh"> | null = null;
    root.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (mesh.isMesh && !found) found = mesh;
    });
    return found as unknown as Three<"Mesh">;
  }
}

class MoleActorParts {
  readonly goldMaterial: Three<"MeshLambertMaterial">;
  readonly pumpkinMaterial: Three<"MeshLambertMaterial">;
  readonly eyeMaterial: Three<"MeshBasicMaterial">;
  readonly eyeGeometry: Three<"SphereGeometry">;
  readonly ringGeometry: Three<"RingGeometry">;

  constructor(readonly libs: ThreeLibs, readonly assets: MoleAssets, readonly clips: Map<string, Three<"AnimationClip">>) {
    const THREE = libs.THREE;
    const minionMesh = MoleAssets.firstMesh(assets.minionTemplate());
    const minionMap = (minionMesh.material as Three<"MeshStandardMaterial">).map;
    this.goldMaterial = new THREE.MeshLambertMaterial({ map: minionMap, color: MoleLook.GOLD, emissive: MoleLook.GOLD_GLOW });
    const pumpkinMap = (assets.pumpkin().material as Three<"MeshStandardMaterial">).map;
    this.pumpkinMaterial = new THREE.MeshLambertMaterial({ map: pumpkinMap });
    this.eyeMaterial = new THREE.MeshBasicMaterial({ color: MoleLook.EYE_RED });
    this.eyeGeometry = new THREE.SphereGeometry(0.1, 8, 6);
    this.ringGeometry = new THREE.RingGeometry(0.3, 0.55, 24);
  }

  dispose(): void {
    this.goldMaterial.dispose();
    this.pumpkinMaterial.dispose();
    this.eyeMaterial.dispose();
    this.eyeGeometry.dispose();
    this.ringGeometry.dispose();
  }
}

class MoleScenery {
  readonly scene: Three<"Scene">;
  readonly camera: Three<"PerspectiveCamera">;
  readonly world: Three<"Group">;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(libs: ThreeLibs, assets: MoleAssets) {
    const THREE = libs.THREE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(MoleLook.SKY);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    this.scene.add(new THREE.HemisphereLight(0x8E9DFF, 0x2A2236, 1.0));
    const moonLight = new THREE.DirectionalLight(0xB9C6FF, 0.9);
    moonLight.position.set(-8, 20, 10);
    this.scene.add(moonLight);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.buildGround(THREE);
    this.buildMoon(THREE);
    this.buildStars(THREE);
    this.buildFence(THREE, assets);
  }

  dispose(): void {
    this.disposables.forEach((entry) => entry.dispose());
  }

  private buildGround(THREE: ThreeModule): void {
    const material = new THREE.MeshLambertMaterial({ color: MoleLook.GROUND });
    const geometry = new THREE.PlaneGeometry(160, 160);
    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -20);
    this.world.add(ground);
    this.disposables.push(material, geometry);
  }

  private buildMoon(THREE: ThreeModule): void {
    const material = new THREE.MeshBasicMaterial({ color: MoleLook.MOON });
    const haloMaterial = new THREE.MeshBasicMaterial({ color: MoleLook.MOON, transparent: true, opacity: 0.16, depthWrite: false });
    const geometry = new THREE.SphereGeometry(2.6, 20, 14);
    const haloGeometry = new THREE.SphereGeometry(4, 20, 14);
    const moon = new THREE.Mesh(geometry, material);
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    moon.position.set(-16, 17, -42);
    halo.position.copy(moon.position);
    this.world.add(moon, halo);
    this.disposables.push(material, haloMaterial, geometry, haloGeometry);
  }

  private buildStars(THREE: ThreeModule): void {
    const random = new SeededRandom(20261005);
    const positions = new Float32Array(MoleLook.STAR_COUNT * 3);
    for (let star = 0; star < MoleLook.STAR_COUNT; star++) {
      const angle = random.next() * Math.PI * 2;
      const height = 10 + random.next() * 34;
      positions[star * 3] = Math.cos(angle) * 70;
      positions[star * 3 + 1] = height;
      positions[star * 3 + 2] = -Math.abs(Math.sin(angle)) * 70 - 6;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 0.55, sizeAttenuation: true });
    this.world.add(new THREE.Points(geometry, material));
    this.disposables.push(geometry, material);
  }

  private buildFence(THREE: ThreeModule, assets: MoleAssets): void {
    const source = assets.fence();
    const original = source.material as Three<"MeshStandardMaterial">;
    const material = new THREE.MeshLambertMaterial({ map: original.map, color: 0xBFB6D8 });
    const spots: Array<{ x: number; z: number; turn: number }> = [];
    for (let x = -16; x <= 16; x += 4) spots.push({ x, z: -13, turn: 0 });
    for (let z = -9; z <= 11; z += 4) {
      spots.push({ x: -17, z, turn: Math.PI / 2 });
      spots.push({ x: 17, z, turn: Math.PI / 2 });
    }
    const mesh = new THREE.InstancedMesh(source.geometry, material, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach((spot, index) => {
      dummy.position.set(spot.x, 0, spot.z);
      dummy.rotation.set(0, spot.turn, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.world.add(mesh);
    this.disposables.push(material, mesh);
  }
}

interface MoleStoneSlot {
  readonly mesh: Three<"InstancedMesh">;
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly turn: number;
}

class MoleGraveyard {
  private static readonly STONE_SCALES: readonly number[] = [0.95, 1.25];
  private static readonly FOOT_SCALE = 0.9;

  private readonly slots = new Map<number, MoleStoneSlot>();
  private readonly shaking = new Map<number, number>();
  private readonly dummy: Three<"Object3D">;
  private readonly meshes: Array<Three<"InstancedMesh">> = [];
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(libs: ThreeLibs, assets: MoleAssets, private readonly world: Three<"Group">, places: readonly MoleBoardPlace[]) {
    const THREE = libs.THREE;
    this.dummy = new THREE.Object3D();
    this.buildMounds(THREE, places);
    this.buildHoles(THREE, places);
    this.buildStones(THREE, assets, places);
  }

  shake(boardIndex: number, cell: number): void {
    const key = boardIndex * MoleRules.CELL_COUNT + cell;
    if (this.slots.has(key)) this.shaking.set(key, 0);
  }

  update(dt: number): void {
    this.shaking.forEach((elapsed, key) => {
      const next = elapsed + dt;
      const slot = this.slots.get(key) as MoleStoneSlot;
      if (next >= MoleLook.SHAKE_S) {
        this.shaking.delete(key);
        this.place(slot, 0);
      } else {
        this.shaking.set(key, next);
        this.place(slot, Math.sin(next * MoleLook.SHAKE_RATE) * MoleLook.SHAKE_ROLL * (1 - next / MoleLook.SHAKE_S));
      }
      slot.mesh.instanceMatrix.needsUpdate = true;
    });
  }

  dispose(): void {
    this.meshes.forEach((mesh) => this.world.remove(mesh));
    this.disposables.forEach((entry) => entry.dispose());
  }

  private place(slot: MoleStoneSlot, roll: number): void {
    this.dummy.position.set(slot.x, 0, slot.z);
    this.dummy.rotation.set(0, slot.turn, roll);
    this.dummy.scale.setScalar(slot.scale);
    this.dummy.updateMatrix();
    slot.mesh.setMatrixAt(slot.index, this.dummy.matrix);
  }

  private addInstanced(THREE: ThreeModule, geometry: Three<"Mesh">["geometry"], material: Three<"Material">, count: number): Three<"InstancedMesh"> {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    this.world.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  private buildMounds(THREE: ThreeModule, places: readonly MoleBoardPlace[]): void {
    const geometry = new THREE.PlaneGeometry(MoleLook.MOUND_SIZE, MoleLook.MOUND_SIZE);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshLambertMaterial({ color: MoleLook.DIRT });
    const mesh = this.addInstanced(THREE, geometry, material, places.length);
    places.forEach((place, index) => {
      this.dummy.position.set(place.x, 0.02, place.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(place.scale);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.disposables.push(geometry, material);
  }

  private buildHoles(THREE: ThreeModule, places: readonly MoleBoardPlace[]): void {
    const geometry = new THREE.CircleGeometry(MoleLook.HOLE_RADIUS, 16);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: MoleLook.HOLE });
    const mesh = this.addInstanced(THREE, geometry, material, places.length * MoleRules.CELL_COUNT);
    places.forEach((place, boardIndex) => {
      for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++) {
        this.dummy.position.set(place.cellX(cell), 0.04, place.cellZ(cell) + MoleLook.HOLE_FRONT * place.scale);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(place.scale, place.scale, place.scale * 0.8);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(boardIndex * MoleRules.CELL_COUNT + cell, this.dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.disposables.push(geometry, material);
  }

  private buildStones(THREE: ThreeModule, assets: MoleAssets, places: readonly MoleBoardPlace[]): void {
    const random = new SeededRandom(1031);
    const sources = assets.stones();
    const perModel = sources.map((source, model) => {
      let count = 0;
      places.forEach(() => {
        for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++) if (cell % sources.length === model) count++;
      });
      const original = source.material as Three<"MeshStandardMaterial">;
      const material = new THREE.MeshLambertMaterial({ map: original.map });
      this.disposables.push(material);
      return { mesh: this.addInstanced(THREE, source.geometry, material, count), used: 0 };
    });
    places.forEach((place, boardIndex) => {
      for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++) {
        const model = cell % sources.length;
        const target = perModel[model];
        const slot: MoleStoneSlot = {
          mesh: target.mesh,
          index: target.used++,
          x: place.cellX(cell),
          z: place.cellZ(cell) - MoleLook.STONE_BACK * place.scale,
          scale: MoleGraveyard.STONE_SCALES[model] * MoleGraveyard.FOOT_SCALE * place.scale,
          turn: (random.next() - 0.5) * 0.25
        };
        this.slots.set(boardIndex * MoleRules.CELL_COUNT + cell, slot);
        this.place(slot, 0);
      }
    });
    perModel.forEach((entry) => { entry.mesh.instanceMatrix.needsUpdate = true; });
  }
}

interface MoleActorFrame {
  readonly look: MoleKindLook;
  readonly leftMs: number;
  readonly sinceAppearMs: number;
  readonly sinceCaughtMs: number;
  readonly dt: number;
}

class MoleMotion {
  static rise(sinceAppearMs: number): number {
    const ratio = MathUtil.clamp(sinceAppearMs / MoleLook.RISE_MS, 0, 1);
    return 1 - (1 - ratio) * (1 - ratio);
  }

  static sink(frame: MoleActorFrame): number {
    if (isFinite(frame.sinceCaughtMs)) return 0;
    return MathUtil.clamp(1 - frame.leftMs / MoleLook.SINK_MS, 0, 1);
  }

  static pop(sinceCaughtMs: number): number {
    if (!isFinite(sinceCaughtMs)) return 1;
    const half = MoleLook.HIT_LINGER_MS / 2;
    if (sinceCaughtMs < half) return 1 + 0.35 * (sinceCaughtMs / half);
    return Math.max(0, 1.35 * (1 - (sinceCaughtMs - half) / half));
  }
}

abstract class MoleActor {
  protected readonly group: Three<"Group">;

  constructor(protected readonly parts: MoleActorParts, private readonly world: Three<"Group">, x: number, z: number, protected readonly boardScale: number) {
    this.group = new parts.libs.THREE.Group();
    this.group.position.set(x, 0, z);
    this.group.visible = false;
    world.add(this.group);
  }

  abstract update(frame: MoleActorFrame): void;

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.world.remove(this.group);
  }
}

class MoleSkeletonActor extends MoleActor {
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly meshes: Array<Three<"Mesh">> = [];
  private readonly originals = new Map<Three<"Mesh">, Three<"Material"> | Three<"Material">[]>();
  private readonly hasSpawnClip: boolean;
  private golden = false;

  constructor(parts: MoleActorParts, world: Three<"Group">, x: number, z: number, boardScale: number) {
    super(parts, world, x, z, boardScale);
    this.model = parts.libs.SkeletonUtils.clone(parts.assets.minionTemplate());
    this.model.scale.setScalar(CharacterModelFactory.SCALE);
    this.model.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      node.frustumCulled = false;
      if (mesh.isMesh) {
        this.meshes.push(mesh);
        this.originals.set(mesh, mesh.material);
      }
    });
    this.group.add(this.model);
    this.animator = new CharacterAnimator(parts.libs, this.model, parts.clips);
    this.animator.play(FighterClips.IDLE);
    this.hasSpawnClip = parts.clips.has(MoleAssets.SPAWN_CLIP);
  }

  update(frame: MoleActorFrame): void {
    this.group.visible = true;
    this.paint(frame.look.golden);
    const rise = this.hasSpawnClip ? 1 : MoleMotion.rise(frame.sinceAppearMs);
    this.model.position.y = -(1 - rise + MoleMotion.sink(frame)) * MoleLook.SINK_DEPTH;
    this.group.scale.setScalar(this.boardScale * MoleMotion.pop(frame.sinceCaughtMs));
    this.animator.play(...this.clipFor(frame));
    this.animator.update(frame.dt);
  }

  hide(): void {
    super.hide();
    this.animator.play(FighterClips.IDLE);
  }

  private clipFor(frame: MoleActorFrame): [string, AnimationOptions] {
    if (isFinite(frame.sinceCaughtMs)) return [FighterClips.HIT, { once: true, speed: 1.8 }];
    if (frame.sinceAppearMs < 1300 / MoleLook.SPAWN_CLIP_SPEED) return [MoleAssets.SPAWN_CLIP, { once: true, speed: MoleLook.SPAWN_CLIP_SPEED }];
    return [FighterClips.IDLE, {}];
  }

  private paint(golden: boolean): void {
    if (golden === this.golden) return;
    this.golden = golden;
    this.meshes.forEach((mesh) => {
      const original = this.originals.get(mesh) as Three<"Material">;
      mesh.material = golden && mesh.name.indexOf("Eyes") < 0 ? this.parts.goldMaterial : original;
    });
  }
}

class MolePumpkinActor extends MoleActor {
  private static readonly BASE_SCALE = 0.85;
  private static readonly EYE_SPOTS: ReadonlyArray<readonly [number, number, number]> = [[-0.3, 0.68, 0.62], [0.3, 0.68, 0.62]];
  private static readonly SINK_DEPTH = 1.1;

  private readonly model: Three<"Object3D">;
  private readonly eyes: Array<Three<"Mesh">> = [];

  constructor(parts: MoleActorParts, world: Three<"Group">, x: number, z: number, boardScale: number) {
    super(parts, world, x, z, boardScale);
    const THREE = parts.libs.THREE;
    this.model = new THREE.Group();
    const body = new THREE.Mesh(parts.assets.pumpkin().geometry, parts.pumpkinMaterial);
    body.scale.setScalar(MolePumpkinActor.BASE_SCALE);
    this.model.add(body);
    MolePumpkinActor.EYE_SPOTS.forEach((spot) => {
      const eye = new THREE.Mesh(parts.eyeGeometry, parts.eyeMaterial);
      eye.position.set(spot[0] * MolePumpkinActor.BASE_SCALE, spot[1] * MolePumpkinActor.BASE_SCALE, spot[2] * MolePumpkinActor.BASE_SCALE);
      this.model.add(eye);
      this.eyes.push(eye);
    });
    this.group.add(this.model);
  }

  update(frame: MoleActorFrame): void {
    this.group.visible = true;
    const rise = MoleMotion.rise(frame.sinceAppearMs);
    this.model.position.y = -(1 - rise + MoleMotion.sink(frame)) * MolePumpkinActor.SINK_DEPTH;
    this.group.scale.setScalar(this.boardScale * MoleMotion.pop(frame.sinceCaughtMs));
    const glow = 1.15 + Math.sin(frame.sinceAppearMs / 90) * 0.35;
    this.eyes.forEach((eye) => eye.scale.setScalar(glow));
  }
}

abstract class MoleKindLook {
  abstract readonly actorKey: string;
  abstract readonly golden: boolean;
  abstract readonly flashColor: number;

  abstract createActor(parts: MoleActorParts, world: Three<"Group">, x: number, z: number, boardScale: number): MoleActor;
}

class MoleSkeletonLook extends MoleKindLook {
  readonly actorKey: string = "skeleton";
  readonly golden: boolean = false;
  readonly flashColor: number = MoleLook.FLASH_WHITE;

  createActor(parts: MoleActorParts, world: Three<"Group">, x: number, z: number, boardScale: number): MoleActor {
    return new MoleSkeletonActor(parts, world, x, z, boardScale);
  }
}

class MoleGoldenLook extends MoleSkeletonLook {
  readonly golden: boolean = true;
  readonly flashColor: number = MoleLook.GOLD;
}

class MolePumpkinLook extends MoleKindLook {
  readonly actorKey: string = "pumpkin";
  readonly golden: boolean = false;
  readonly flashColor: number = MoleLook.EYE_RED;

  createActor(parts: MoleActorParts, world: Three<"Group">, x: number, z: number, boardScale: number): MoleActor {
    return new MolePumpkinActor(parts, world, x, z, boardScale);
  }
}

class MoleKindLooks {
  private static readonly BY_CODE: Readonly<Record<string, MoleKindLook>> = {
    [MoleKinds.SKELETON.code]: new MoleSkeletonLook(),
    [MoleKinds.GOLDEN.code]: new MoleGoldenLook(),
    [MoleKinds.PUMPKIN.code]: new MolePumpkinLook()
  };

  static of(kind: MoleKind): MoleKindLook {
    return MoleKindLooks.BY_CODE[kind.code];
  }
}

class MoleCellFlash {
  private readonly mesh: Three<"Mesh">;
  private readonly material: Three<"MeshBasicMaterial">;
  private age = Infinity;

  constructor(parts: MoleActorParts, private readonly world: Three<"Group">, x: number, z: number, private readonly boardScale: number) {
    const THREE = parts.libs.THREE;
    this.material = new THREE.MeshBasicMaterial({ color: MoleLook.FLASH_WHITE, transparent: true, opacity: 0, depthWrite: false });
    this.mesh = new THREE.Mesh(parts.ringGeometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(x, 0.09, z);
    this.mesh.visible = false;
    world.add(this.mesh);
  }

  start(color: number): void {
    this.material.color.setHex(color);
    this.age = 0;
  }

  update(dt: number): void {
    if (!isFinite(this.age)) return;
    this.age += dt * 1000;
    const ratio = this.age / MoleLook.FLASH_MS;
    this.mesh.visible = ratio < 1;
    if (ratio >= 1) {
      this.age = Infinity;
      return;
    }
    this.mesh.scale.setScalar(this.boardScale * (0.6 + ratio * 2.4));
    this.material.opacity = 0.9 * (1 - ratio);
  }

  dispose(): void {
    this.world.remove(this.mesh);
    this.material.dispose();
  }
}

class MoleCellView {
  private readonly actors = new Map<string, MoleActor>();
  private flashView: MoleCellFlash | null = null;
  private lastSpawn: MoleSpawn | null = null;
  private active: MoleActor | null = null;
  private readonly x: number;
  private readonly z: number;
  private readonly scale: number;

  constructor(private readonly parts: MoleActorParts, private readonly world: Three<"Group">, place: MoleBoardPlace, cell: number) {
    this.x = place.cellX(cell);
    this.z = place.cellZ(cell) + MoleLook.SKELETON_FRONT * place.scale;
    this.scale = place.scale;
  }

  show(spawn: MoleSpawn | null, caughtAt: ReadonlyMap<number, number>, rel: number, dt: number): void {
    if (spawn) this.lastSpawn = spawn;
    const candidate = spawn || this.lastSpawn;
    const caughtTime = candidate ? caughtAt.get(candidate.index) : undefined;
    const sinceCaught = candidate && caughtTime !== undefined ? rel - caughtTime : Infinity;
    const visible = candidate !== null && rel >= candidate.appearMs && (isFinite(sinceCaught) ? sinceCaught < MoleLook.HIT_LINGER_MS : rel < candidate.disappearMs);
    if (!visible || !candidate) {
      this.release();
    } else {
      this.present(candidate, sinceCaught, rel, dt);
    }
    if (this.flashView) this.flashView.update(dt);
  }

  flash(color: number): void {
    if (!this.flashView) this.flashView = new MoleCellFlash(this.parts, this.world, this.x, this.z, this.scale);
    this.flashView.start(color);
  }

  dispose(): void {
    this.actors.forEach((actor) => actor.dispose());
    if (this.flashView) this.flashView.dispose();
  }

  private present(spawn: MoleSpawn, sinceCaught: number, rel: number, dt: number): void {
    const look = MoleKindLooks.of(spawn.kind);
    let actor = this.actors.get(look.actorKey);
    if (!actor) {
      actor = look.createActor(this.parts, this.world, this.x, this.z, this.scale);
      this.actors.set(look.actorKey, actor);
    }
    if (this.active && this.active !== actor) this.active.hide();
    this.active = actor;
    actor.update({ look, leftMs: spawn.disappearMs - rel, sinceAppearMs: rel - spawn.appearMs, sinceCaughtMs: sinceCaught, dt });
  }

  private release(): void {
    if (!this.active) return;
    this.active.hide();
    this.active = null;
  }
}

class MoleBoardSign {
  private static readonly WIDTH = 384;
  private static readonly HEIGHT = 112;

  private readonly context: CanvasRenderingContext2D;
  private readonly texture: Three<"CanvasTexture">;
  private readonly sprite: Three<"Sprite">;
  private signature = "";

  constructor(private readonly libs: ThreeLibs, page: Page, private readonly world: Three<"Group">, private readonly participant: MatchParticipant, place: MoleBoardPlace) {
    const THREE = libs.THREE;
    const canvas = page.createCanvas(MoleBoardSign.WIDTH, MoleBoardSign.HEIGHT);
    this.context = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    const width = place.signSize();
    this.sprite.scale.set(width, width * MoleBoardSign.HEIGHT / MoleBoardSign.WIDTH, 1);
    this.sprite.position.set(place.x, place.signHeight(), place.z - 1.9 * place.scale);
    world.add(this.sprite);
  }

  update(tally: MoleTally, departed: boolean): void {
    const signature = tally.score + "|" + tally.combo + "|" + departed;
    if (signature === this.signature) return;
    this.signature = signature;
    this.draw(tally, departed);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.world.remove(this.sprite);
    this.texture.dispose();
    this.sprite.material.dispose();
  }

  private draw(tally: MoleTally, departed: boolean): void {
    const context = this.context;
    const width = MoleBoardSign.WIDTH, height = MoleBoardSign.HEIGHT;
    context.clearRect(0, 0, width, height);
    context.fillStyle = Palette.LABEL_BACKGROUND;
    context.strokeStyle = Palette.slotColor(this.participant.slot);
    context.lineWidth = 6;
    context.beginPath();
    context.rect(5, 5, width - 10, height - 10);
    context.fill();
    context.stroke();
    context.textBaseline = "middle";
    context.fillStyle = "#FFFFFF";
    context.textAlign = "left";
    context.font = '800 34px "Nanum Gothic", "Malgun Gothic", sans-serif';
    context.fillText(this.participant.nick + (this.participant.ai ? " (AI)" : "") + (departed ? " (나감)" : ""), 22, 34, width - 44);
    context.font = '800 38px "Nanum Gothic", "Malgun Gothic", sans-serif';
    context.fillStyle = "#FFD9A8";
    context.fillText(tally.score + "점", 22, 80);
    if (tally.combo > 1) {
      context.textAlign = "right";
      context.fillStyle = tally.multiplier() > 1 ? "#FFD34D" : "#DCE6D6";
      context.font = '800 30px "Nanum Gothic", "Malgun Gothic", sans-serif';
      context.fillText(tally.combo + "콤보" + (tally.multiplier() > 1 ? " ×" + tally.multiplier() : ""), width - 22, 80);
    }
  }
}

class MoleBoardView {
  private readonly cells: MoleCellView[] = [];
  private readonly handled = new Set<string>();
  private caughtAt = new Map<number, number>();
  private lastTally: MoleTally | null = null;

  constructor(
    parts: MoleActorParts,
    world: Three<"Group">,
    private readonly graveyard: MoleGraveyard,
    private readonly boardIndex: number,
    place: MoleBoardPlace,
    private readonly schedule: MoleSchedule,
    private readonly sign: MoleBoardSign
  ) {
    for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++) this.cells.push(new MoleCellView(parts, world, place, cell));
  }

  update(rel: number, tally: MoleTally, departed: boolean, dt: number): MoleOutcome[] {
    if (tally !== this.lastTally) {
      this.lastTally = tally;
      this.caughtAt = new Map<number, number>();
      tally.outcomes.forEach((outcome) => {
        if (outcome.kind === "hit" && outcome.spawn) this.caughtAt.set(outcome.spawn.index, outcome.t);
      });
    }
    const fresh = this.freshOutcomes(rel, tally);
    fresh.forEach((outcome) => this.react(outcome));
    this.cells.forEach((cell, index) => {
      cell.show(this.schedule.spawnAt(index, rel), this.caughtAt, rel, dt);
    });
    this.sign.update(tally, departed);
    return fresh;
  }

  dispose(): void {
    this.cells.forEach((cell) => cell.dispose());
    this.sign.dispose();
  }


  private freshOutcomes(rel: number, tally: MoleTally): MoleOutcome[] {
    const fresh: MoleOutcome[] = [];
    tally.outcomes.forEach((outcome) => {
      const key = outcome.t + ":" + outcome.cell + ":" + (outcome.spawn ? outcome.spawn.index : -1);
      if (this.handled.has(key)) return;
      this.handled.add(key);
      if (rel - outcome.t < MoleLook.FRESH_OUTCOME_MS) fresh.push(outcome);
    });
    return fresh;
  }

  private react(outcome: MoleOutcome): void {
    const cell = this.cells[outcome.cell];
    if (!cell) return;
    if (outcome.kind === "miss") {
      this.graveyard.shake(this.boardIndex, outcome.cell);
      cell.flash(MoleLook.FLASH_DUST);
    } else if (outcome.spawn) {
      cell.flash(MoleKindLooks.of(outcome.spawn.kind).flashColor);
    }
  }
}

class MoleHammerer {
  private pose: { clip: string; speed: number; untilMs: number } | null = null;
  private restart = false;
  private readonly group: Three<"Group">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly hammer: Three<"Object3D">;

  constructor(
    private readonly libs: ThreeLibs,
    private readonly factory: CharacterModelFactory,
    private readonly world: Three<"Group">,
    clips: Map<string, Three<"AnimationClip">>,
    assets: MoleAssets,
    look: CharacterLook,
    place: MoleBoardPlace
  ) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.model = factory.build(look);
    this.model.rotation.y = Math.PI / 2;
    this.group.add(this.model);
    this.group.position.set(place.keeperX(), 0, place.z);
    this.group.scale.setScalar(place.keeperScale());
    this.hammer = assets.hammer().clone(true);
    const slot = this.model.getObjectByName("handslotr") || this.model.getObjectByName("handslot.r");
    if (slot) {
      this.hammer.rotation.set(-Math.PI / 2, 0, 0);
      this.hammer.scale.setScalar(MoleLook.HAMMER_SCALE);
      slot.add(this.hammer);
    }
    world.add(this.group);
    this.animator = new CharacterAnimator(libs, this.model, clips);
    this.animator.play(FighterClips.IDLE);
  }

  react(outcomes: readonly MoleOutcome[], nowMs: number): void {
    outcomes.forEach((outcome) => this.reactTo(outcome, nowMs));
  }

  update(dt: number, nowMs: number): void {
    const pose = this.pose && nowMs < this.pose.untilMs ? this.pose : null;
    if (this.restart) {
      this.animator.play(FighterClips.IDLE);
      this.restart = false;
    }
    if (pose) this.animator.play(pose.clip, { once: true, speed: pose.speed });
    else this.animator.play(FighterClips.IDLE);
    this.animator.update(dt);
  }

  dispose(): void {
    this.world.remove(this.group);
    this.factory.disposeModel(this.model);
  }

  private reactTo(outcome: MoleOutcome, nowMs: number): void {
    if (outcome.kind === "hit" && outcome.points < 0) {
      this.start(FighterClips.HIT, 1.5, MoleLook.OUCH_MS, nowMs);
    } else if (this.isCheerCombo(outcome)) {
      this.start(MoleAssets.CHEER_CLIP, MoleLook.CHEER_SPEED, MoleLook.CHEER_MS, nowMs);
    } else {
      this.start(MoleAssets.HAMMER_CLIP, MoleLook.SWING_SPEED, MoleLook.SWING_MS, nowMs);
    }
  }

  private isCheerCombo(outcome: MoleOutcome): boolean {
    if (outcome.kind !== "hit" || outcome.points <= 0) return false;
    return outcome.combo === MoleRules.COMBO_DOUBLE || outcome.combo === MoleRules.COMBO_TRIPLE || (outcome.combo > MoleRules.COMBO_TRIPLE && outcome.combo % 10 === 0);
  }

  private start(clip: string, speed: number, durationMs: number, nowMs: number): void {
    this.pose = { clip, speed, untilMs: nowMs + durationMs };
    this.restart = true;
  }
}

class MoleCamera {
  private static readonly EYE_Y = 17;
  private static readonly EYE_Z = 16.5;
  private static readonly LOOK_Z = 1.5;
  private static readonly OVERVIEW_Y = 17;
  private static readonly OVERVIEW_Z = 22;
  private static readonly OVERVIEW_LOOK_Z = 0.5;
  private static readonly SHOWCASE_SWAY = 0.3;
  private static readonly SHOWCASE_SPEED = 0.12;
  private static readonly SHOWCASE_RADIUS = 30;
  private static readonly SMOOTHING = 5;

  private readonly eye = { x: 0, y: 0, z: 0 };
  private readonly focus = { x: 0, z: 0 };
  private placed = false;
  private sway = 0;

  constructor(private readonly camera: Three<"PerspectiveCamera">, private readonly env: BrowserEnv) {}

  player(dt: number): void {
    const zoom = this.zoom();
    this.approach(dt, 0, MoleCamera.EYE_Y * zoom, MoleCamera.EYE_Z * zoom, MoleCamera.LOOK_Z);
  }

  overview(dt: number): void {
    const zoom = this.zoom();
    this.approach(dt, 0, MoleCamera.OVERVIEW_Y * zoom, MoleCamera.OVERVIEW_Z * zoom, MoleCamera.OVERVIEW_LOOK_Z);
  }

  showcase(dt: number): void {
    this.sway += dt * MoleCamera.SHOWCASE_SPEED;
    const angle = Math.sin(this.sway) * MoleCamera.SHOWCASE_SWAY;
    const zoom = this.zoom();
    const radius = MoleCamera.SHOWCASE_RADIUS * zoom;
    this.approach(dt, Math.sin(angle) * radius, 13 * zoom, MoleCamera.OVERVIEW_LOOK_Z + Math.cos(angle) * radius, MoleCamera.OVERVIEW_LOOK_Z);
  }

  private zoom(): number {
    const size = this.env.viewport();
    if (size.width <= 0 || size.height <= 0) return 1;
    return Math.pow(MathUtil.clamp(1.6 / (size.width / size.height), 1, 2.1), 0.8);
  }

  private approach(dt: number, x: number, y: number, z: number, lookZ: number): void {
    const ratio = this.placed ? Math.min(1, dt * MoleCamera.SMOOTHING) : 1;
    this.placed = true;
    this.eye.x += (x - this.eye.x) * ratio;
    this.eye.y += (y - this.eye.y) * ratio;
    this.eye.z += (z - this.eye.z) * ratio;
    this.focus.x += (0 - this.focus.x) * ratio;
    this.focus.z += (lookZ - this.focus.z) * ratio;
    this.camera.position.set(this.eye.x, this.eye.y, this.eye.z);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
  }
}

class MoleStage {
  readonly scenery: MoleScenery;
  readonly camera: MoleCamera;
  private readonly parts: MoleActorParts;
  private readonly graveyard: MoleGraveyard;
  private readonly boards: MoleBoardView[] = [];
  private readonly hammerers: MoleHammerer[] = [];
  private readonly placeById: Map<string, MoleBoardPlace>;

  constructor(
    libs: ThreeLibs,
    page: Page,
    env: BrowserEnv,
    assets: MoleAssets,
    characters: CharacterSet,
    private readonly match: MoleMatch,
    looks: ReadonlyMap<string, CharacterLook>,
    private readonly localId: string
  ) {
    this.scenery = new MoleScenery(libs, assets);
    this.camera = new MoleCamera(this.scenery.camera, env);
    this.parts = new MoleActorParts(libs, assets, characters.assets.clips);
    const ids = match.contestants().map((contestant) => contestant.id);
    this.placeById = MoleLayout.place(ids, localId);
    const places = ids.map((id) => this.placeById.get(id) as MoleBoardPlace);
    this.graveyard = new MoleGraveyard(libs, assets, this.scenery.world, places);
    match.contestants().forEach((contestant, index) => {
      const place = places[index];
      const sign = new MoleBoardSign(libs, page, this.scenery.world, contestant.participant, place);
      this.boards.push(new MoleBoardView(this.parts, this.scenery.world, this.graveyard, index, place, match.schedule, sign));
      this.hammerers.push(new MoleHammerer(libs, characters.factory, this.scenery.world, characters.assets.clips, assets, looks.get(contestant.id) || CharacterLooks.createDefault(), place));
    });
  }

  localPlace(): MoleBoardPlace | null {
    const place = this.placeById.get(this.localId);
    return place && place.mine ? place : null;
  }

  update(rel: number, dt: number): MoleOutcome[] {
    const contestants = this.match.contestants();
    const lines = this.match.lines(rel);
    let localFresh: MoleOutcome[] = [];
    contestants.forEach((contestant, index) => {
      const fresh = this.boards[index].update(rel, lines[index].tally, contestant.hasDeparted(), dt);
      this.hammerers[index].react(fresh, rel);
      this.hammerers[index].update(dt, rel);
      if (contestant.id === this.localId) localFresh = fresh;
    });
    this.graveyard.update(dt);
    return localFresh;
  }

  dispose(): void {
    this.boards.forEach((board) => board.dispose());
    this.hammerers.forEach((hammerer) => hammerer.dispose());
    this.graveyard.dispose();
    this.parts.dispose();
    this.scenery.dispose();
  }
}

class MoleBoardPicker {
  private static readonly PLANE_HEIGHT = 1.0;
  private static readonly FRONT_SHIFT = 0.2;
  private static readonly EDGE_MARGIN = 0.9;

  private readonly raycaster: Three<"Raycaster">;
  private readonly plane: Three<"Plane">;
  private readonly spot: Three<"Vector3">;
  private readonly handler = (event: PointerEvent): void => this.pick(event);

  constructor(
    private readonly libs: ThreeLibs,
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Three<"PerspectiveCamera">,
    private readonly place: MoleBoardPlace,
    private readonly onCell: (cell: number) => void
  ) {
    const THREE = libs.THREE;
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -MoleBoardPicker.PLANE_HEIGHT * place.scale);
    this.spot = new THREE.Vector3();
    canvas.addEventListener("pointerdown", this.handler);
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.handler);
  }

  private pick(event: PointerEvent): void {
    const bounds = this.canvas.getBoundingClientRect();
    const ndc = new this.libs.THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.plane, this.spot)) return;
    const cell = this.nearestCell(this.spot.x, this.spot.z);
    if (cell < 0) return;
    event.preventDefault();
    this.onCell(cell);
  }

  private nearestCell(x: number, z: number): number {
    const place = this.place;
    const reach = (MoleBoardPlace.SPACING * 1.5 + MoleBoardPicker.EDGE_MARGIN) * place.scale;
    if (Math.abs(x - place.x) > reach || Math.abs(z - place.z) > reach) return -1;
    let best = -1;
    let bestDistance = Infinity;
    for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++) {
      const distance = MathUtil.distance(x, z, place.cellX(cell), place.cellZ(cell) + MoleBoardPicker.FRONT_SHIFT * place.scale);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = cell;
      }
    }
    return best;
  }
}

class MoleScreenFlash {
  private static readonly SHOW_MS = 220;

  private readonly element: HTMLElement;

  constructor(private readonly page: Page, private readonly env: BrowserEnv) {
    this.element = page.byId("moleFlash");
  }

  pulse(): void {
    this.page.show(this.element, true);
    this.env.afterMs(MoleScreenFlash.SHOW_MS, () => this.page.show(this.element, false));
  }

  hide(): void {
    this.page.show(this.element, false);
  }
}
