type WarSelection =
  | { kind: "none" }
  | { kind: "slot"; index: number }
  | { kind: "building"; id: number }
  | { kind: "unit"; id: number }
  | { kind: "squad"; index: number };

interface WarScenePoint { x: number; z: number }
interface WarUnitLook { shared: boolean; file: string; scale: number; animated: boolean; idleClip: string; runClip: string; attackClip: string; shootsFar: boolean }

class WarPalette {
  static readonly SQUAD_COLORS = ["#4FC3F7", "#B388FF", "#FFD54F"];
  static readonly ENEMY = "#E5484D";
  static readonly MINE = "#7CE0A8";
  static readonly ACCENT = "#D97B4F";
  static readonly KIND_COLORS: Record<WarUnitKind, string> = { melee: "#6BCB77", ranged: "#F2994A", elite: "#E5484D" };
}

class WarViewTransform {
  constructor(readonly team: WarTeam) {}

  get flip(): number {
    return this.team === 0 ? 1 : -1;
  }

  toScene(point: WarPoint): WarScenePoint {
    return { x: (point.x * this.flip) / 100, z: (point.y * this.flip) / 100 };
  }

  sceneToWorld(x: number, z: number): WarPoint {
    return { x: Math.round(x * 100 * this.flip), y: Math.round(z * 100 * this.flip) };
  }

  toMap(point: WarPoint, width: number, height: number): WarPoint {
    let u = (point.x + WarMapData.HALF_W) / (WarMapData.HALF_W * 2);
    let v = (point.y + WarMapData.HALF_H) / (WarMapData.HALF_H * 2);
    if (this.team === 1) {
      u = 1 - u;
      v = 1 - v;
    }
    return { x: u * width, y: v * height };
  }

  mapToWorld(px: number, py: number, width: number, height: number): WarPoint {
    let u = px / width;
    let v = py / height;
    if (this.team === 1) {
      u = 1 - u;
      v = 1 - v;
    }
    return { x: Math.round(u * WarMapData.HALF_W * 2 - WarMapData.HALF_W), y: Math.round(v * WarMapData.HALF_H * 2 - WarMapData.HALF_H) };
  }
}

class WarUnitLooks {
  private static readonly HUMAN = { shared: false, animated: true, idleClip: "Idle", runClip: "Run", shootsFar: false };
  private static readonly SKELETON = { shared: true, animated: true, idleClip: "Idle_A", runClip: "Running_A", shootsFar: false };
  private static readonly LOOKS: Record<string, WarUnitLook> = {
    shieldbearer: { ...WarUnitLooks.HUMAN, file: "quaternius/Knight_Male.gltf", scale: 1, attackClip: "SwordSlash" },
    charger: { ...WarUnitLooks.HUMAN, file: "quaternius/Soldier_Male.gltf", scale: 1, attackClip: "Punch" },
    archer: { ...WarUnitLooks.HUMAN, file: "quaternius/BlueSoldier_Female.gltf", scale: 1, attackClip: "Shoot_OneHanded", shootsFar: true },
    energymage: { shared: false, animated: true, file: "quaternius/Astronaut_BarbaraTheBee.gltf", scale: 0.5, idleClip: "Idle_Gun", runClip: "Run_Gun", attackClip: "Run_Gun_Shoot", shootsFar: true },
    guardknight: { shared: false, animated: true, file: "quaternius/Mech_FinnTheFrog.gltf", scale: 0.8, idleClip: "Idle", runClip: "Run", attackClip: "Kick", shootsFar: false },
    artillerytruck: { shared: false, animated: false, file: "quaternius/Rover_Round.gltf", scale: 1.65, idleClip: "", runClip: "", attackClip: "", shootsFar: true },
    minion: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Minion.glb", scale: 0.7, attackClip: "Melee_1H_Attack_Chop" },
    skelwarrior: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Warrior.glb", scale: 0.85, attackClip: "Melee_1H_Attack_Slice_Horizontal" },
    skelarcher: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Rogue.glb", scale: 0.8, attackClip: "Ranged_Bow_Release", shootsFar: true },
    skelmage: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Mage.glb", scale: 0.8, attackClip: "Ranged_Magic_Shoot", shootsFar: true },
    bonegiant: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Warrior.glb", scale: 1.7, attackClip: "Melee_2H_Attack_Chop" },
    necromancer: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Mage.glb", scale: 1.15, attackClip: "Ranged_Magic_Spellcasting", shootsFar: true },
  };

  static of(unitId: string): WarUnitLook {
    return WarUnitLooks.LOOKS[unitId];
  }

  static files(): string[] {
    return Object.keys(WarUnitLooks.LOOKS).map((key) => WarUnitLooks.LOOKS[key].file);
  }
}

class WarBuildingLooks {
  private static readonly MODELS: Record<WarFactionId, Record<WarBuildingType, { file: string; scale: number }>> = {
    pioneer: {
      hq: { file: "quaternius/Base_Large.gltf", scale: 0.8 },
      barracks: { file: "quaternius/House_Single.gltf", scale: 0.9 },
      range: { file: "quaternius/House_Open.gltf", scale: 0.9 },
      lab: { file: "quaternius/GeodesicDome.gltf", scale: 0.42 },
    },
    grave: {
      hq: { file: "halloween/crypt.gltf", scale: 0.8 },
      barracks: { file: "halloween/coffin_decorated.gltf", scale: 1.2 },
      range: { file: "halloween/arch_gate.gltf", scale: 0.8 },
      lab: { file: "halloween/shrine_candles.gltf", scale: 1.7 },
    },
  };

  static of(type: WarBuildingType, faction: WarFactionId): { file: string; scale: number } {
    return WarBuildingLooks.MODELS[faction][type];
  }

  static files(): string[] {
    const files: string[] = [];
    for (const faction of Object.keys(WarBuildingLooks.MODELS) as WarFactionId[]) {
      for (const type of Object.keys(WarBuildingLooks.MODELS[faction]) as WarBuildingType[]) files.push(WarBuildingLooks.MODELS[faction][type].file);
    }
    return files;
  }
}

interface WarActor { model: Three<"Object3D">; clips: Map<string, Three<"AnimationClip">> }
interface WarLoadedAsset { scene: Three<"Object3D">; clips: Map<string, Three<"AnimationClip">> }

class WarAssetLibrary {
  static readonly ROOT = "assets/kaykit/war/";
  private static readonly EXTRA_MODELS = ["space/landingpad_large.gltf", "resources/Iron_Nuggets.gltf", "resources/Parts_Pile_Large.gltf"];

  private static readonly RIG_ANIMATIONS = ["General", "MovementBasic", "CombatMelee", "CombatRanged"];

  private readonly assets = new Map<string, WarLoadedAsset>();
  private readonly rigClips = new Map<string, Three<"AnimationClip">>();
  private loading: Promise<void> | null = null;

  constructor(private readonly libs: ThreeLibs) {}

  load(): Promise<void> {
    if (!this.loading) this.loading = this.loadAll();
    return this.loading;
  }

  actor(file: string, shared: boolean): WarActor {
    const asset = this.assetOf(file);
    return { model: this.libs.SkeletonUtils.clone(asset.scene), clips: shared ? this.rigClips : asset.clips };
  }

  model(file: string): Three<"Object3D"> {
    return this.assetOf(file).scene.clone(true);
  }

  template(file: string): Three<"Object3D"> {
    return this.assetOf(file).scene;
  }

  private assetOf(file: string): WarLoadedAsset {
    const found = this.assets.get(file);
    if (!found) throw new Error("모델을 아직 불러오지 못했어요: " + file);
    return found;
  }

  private async loadAll(): Promise<void> {
    const loader = new this.libs.GLTFLoader();
    const files = Array.from(new Set(WarUnitLooks.files().concat(WarBuildingLooks.files(), WarAssetLibrary.EXTRA_MODELS, WarSceneryKit.files())));
    const rig = WarAssetLibrary.RIG_ANIMATIONS.map((name) => loader.loadAsync(WarAssetLibrary.ROOT + "animations/Rig_Medium_" + name + ".glb").then((gltf) => gltf.animations.forEach((clip) => this.rigClips.set(clip.name, clip))));
    await Promise.all(rig.concat(files.map((file) => loader.loadAsync(WarAssetLibrary.ROOT + file).then((gltf) => {
      const clips = new Map<string, Three<"AnimationClip">>();
      gltf.animations.forEach((clip) => clips.set(clip.name, clip));
      this.assets.set(file, { scene: gltf.scene, clips });
    }))));
  }
}

class WarMaterials {
  private readonly rings = new Map<string, Three<"MeshBasicMaterial">>();
  readonly barBack: Three<"MeshBasicMaterial">;
  readonly barMine: Three<"MeshBasicMaterial">;
  readonly barEnemy: Three<"MeshBasicMaterial">;
  readonly ringGeometry: Three<"RingGeometry">;
  readonly barGeometry: Three<"PlaneGeometry">;

  constructor(private readonly libs: ThreeLibs) {
    const THREE = libs.THREE;
    this.barBack = new THREE.MeshBasicMaterial({ color: "#0A0C14", transparent: true, opacity: 0.8, depthTest: false });
    this.barMine = new THREE.MeshBasicMaterial({ color: "#6BE08A", depthTest: false });
    this.barEnemy = new THREE.MeshBasicMaterial({ color: "#FF6B6B", depthTest: false });
    this.ringGeometry = new THREE.RingGeometry(0.52, 0.72, 24);
    this.barGeometry = new THREE.PlaneGeometry(1, 1);
  }

  ring(color: string): Three<"MeshBasicMaterial"> {
    let found = this.rings.get(color);
    if (!found) {
      found = new this.libs.THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, side: this.libs.THREE.DoubleSide });
      this.rings.set(color, found);
    }
    return found;
  }
}

class WarHealthBar {
  readonly group: Three<"Group">;
  private readonly fill: Three<"Mesh">;
  private readonly width: number;

  constructor(libs: ThreeLibs, materials: WarMaterials, width: number, height: number, mine: boolean) {
    const THREE = libs.THREE;
    this.width = width;
    this.group = new THREE.Group();
    const back = new THREE.Mesh(materials.barGeometry, materials.barBack);
    back.scale.set(width + 0.06, height + 0.06, 1);
    this.fill = new THREE.Mesh(materials.barGeometry, mine ? materials.barMine : materials.barEnemy);
    this.fill.scale.set(width, height, 1);
    this.fill.position.z = 0.002;
    back.renderOrder = 20;
    this.fill.renderOrder = 21;
    this.group.add(back, this.fill);
    this.group.visible = false;
  }

  update(hp: number, maxHp: number, alwaysShow: boolean): void {
    const ratio = Math.max(0, hp / maxHp);
    this.group.visible = alwaysShow || ratio < 1;
    this.fill.scale.x = Math.max(0.001, this.width * ratio);
    this.fill.position.x = -(this.width * (1 - ratio)) / 2;
  }
}

class WarUnitView {
  private static readonly ATTACK_HOLD_SECONDS = 0.7;

  readonly group: Three<"Group">;
  readonly bar: WarHealthBar;
  animate = true;
  private readonly look: WarUnitLook;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator | null;
  private readonly ring: Three<"Mesh">;
  private readonly from: WarScenePoint;
  private readonly to: WarScenePoint;
  private yaw = 0;
  private moving = false;
  private lastCooldown = 0;
  private attackHold = 0;
  private bobSeconds = 0;

  constructor(libs: ThreeLibs, assets: WarAssetLibrary, private readonly materials: WarMaterials, unit: WarUnit, start: WarScenePoint, mine: boolean) {
    const THREE = libs.THREE;
    this.look = WarUnitLooks.of(unit.def.id);
    this.group = new THREE.Group();
    const actor = assets.actor(this.look.file, this.look.shared);
    this.model = actor.model;
    this.model.scale.setScalar(this.look.scale);
    this.group.add(this.model);
    this.animator = this.look.animated ? new CharacterAnimator(libs, this.model, actor.clips) : null;
    this.ring = new THREE.Mesh(materials.ringGeometry, materials.ring(mine ? WarPalette.SQUAD_COLORS[Math.max(0, unit.squadIndex)] : WarPalette.ENEMY));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.ring.scale.setScalar(this.look.scale > 1 ? 1.5 : 1);
    this.bar = new WarHealthBar(libs, materials, 1.1, 0.14, mine);
    this.bar.group.position.y = 2.7 * Math.max(1, this.look.scale * 0.8);
    this.group.add(this.ring, this.bar.group);
    this.from = { x: start.x, z: start.z };
    this.to = { x: start.x, z: start.z };
    this.group.position.set(start.x, 0, start.z);
    this.yaw = mine ? Math.PI : 0;
    if (this.animator) this.animator.play(this.look.idleClip);
  }

  onTick(unit: WarUnit, target: WarScenePoint, facing: WarScenePoint | null, squadColor: string | null): void {
    this.from.x = this.to.x;
    this.from.z = this.to.z;
    this.to.x = target.x;
    this.to.z = target.z;
    const dx = this.to.x - this.from.x, dz = this.to.z - this.from.z;
    this.moving = dx * dx + dz * dz > 0.0004;
    if (facing) this.yaw = Math.atan2(facing.x - this.to.x, facing.z - this.to.z);
    else if (this.moving) this.yaw = Math.atan2(dx, dz);
    if (unit.cooldownLeft > this.lastCooldown) this.attackHold = WarUnitView.ATTACK_HOLD_SECONDS;
    this.lastCooldown = unit.cooldownLeft;
    if (squadColor) this.ring.material = this.materials.ring(squadColor);
    this.bar.update(unit.hp, unit.maxHp, false);
  }

  render(alpha: number, deltaSeconds: number, cameraQuaternion: Three<"Quaternion">): void {
    const x = this.from.x + (this.to.x - this.from.x) * alpha;
    const z = this.from.z + (this.to.z - this.from.z) * alpha;
    this.group.position.set(x, 0, z);
    const turn = Math.atan2(Math.sin(this.yaw - this.model.rotation.y), Math.cos(this.yaw - this.model.rotation.y));
    this.model.rotation.y += turn * Math.min(1, deltaSeconds * 14);
    this.bar.group.quaternion.copy(cameraQuaternion);
    this.bobSeconds += deltaSeconds;
    if (!this.animator) {
      this.model.position.y = this.moving ? Math.abs(Math.sin(this.bobSeconds * 9)) * 0.06 : 0;
      return;
    }
    if (!this.animate) return;
    if (this.attackHold > 0) {
      this.attackHold -= deltaSeconds;
      this.animator.play(this.look.attackClip, { once: true });
    } else {
      this.animator.play(this.moving ? this.look.runClip : this.look.idleClip);
    }
    this.animator.update(deltaSeconds);
  }

  show(visible: boolean): void {
    this.group.visible = visible;
  }
}

class WarBuildingView {
  readonly group: Three<"Group">;
  readonly bar: WarHealthBar;
  private readonly model: Three<"Object3D">;
  private readonly disc: Three<"Mesh">;

  constructor(libs: ThreeLibs, assets: WarAssetLibrary, materials: WarMaterials, building: WarBuilding, position: WarScenePoint, mine: boolean, private readonly faction: WarFactionId) {
    const THREE = libs.THREE;
    const look = WarBuildingLooks.of(building.def.type, faction);
    this.group = new THREE.Group();
    this.model = assets.model(look.file);
    this.model.scale.setScalar(look.scale);
    this.disc = new THREE.Mesh(new THREE.CircleGeometry((building.def.radius / 100) * 1.05, 28), materials.ring(mine ? "#2E8F6B" : "#A02A30"));
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.03;
    (this.disc.material as Three<"MeshBasicMaterial">).opacity = 0.55;
    this.bar = new WarHealthBar(libs, materials, building.def.type === "hq" ? 4 : 2.2, 0.22, mine);
    this.bar.group.position.y = building.def.type === "hq" ? 6.2 : 3.4;
    this.group.add(this.disc, this.model, this.bar.group);
    this.group.position.set(position.x, 0, position.z);
    this.group.rotation.y = mine ? Math.PI : 0;
    this.bar.group.rotation.y = -this.group.rotation.y;
  }

  onTick(building: WarBuilding): void {
    const progress = building.complete ? 1 : 1 - building.buildLeft / building.def.buildTicks;
    this.model.scale.y = (WarBuildingLooks.of(building.def.type, this.faction).scale) * (0.25 + 0.75 * progress);
    this.bar.update(building.hp, building.maxHp, !building.complete);
  }

  faceCamera(cameraQuaternion: Three<"Quaternion">): void {
    this.bar.group.quaternion.copy(cameraQuaternion);
    this.bar.group.quaternion.premultiply(this.group.quaternion.clone().invert());
  }

  show(visible: boolean): void {
    this.group.visible = visible;
  }
}

class WarGroundView {
  readonly group: Three<"Group">;
  readonly detail: Three<"Group">;

  constructor(private readonly libs: ThreeLibs, assets: WarAssetLibrary, private readonly transform: WarViewTransform) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    const noise = new WarValueNoise(4242);
    const field = new WarLaneField();
    const texture = new THREE.CanvasTexture(new WarTerrainPainter(noise, field).paint());
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const widthM = (WarMapData.HALF_W * 2) / 100, heightM = (WarMapData.HALF_H * 2) / 100;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), new THREE.MeshLambertMaterial({ map: texture }));
    plane.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.rotation.y = transform.team === 1 ? Math.PI : 0;
    holder.add(plane);
    this.group.add(holder);
    const scenery = new WarSceneryBuilder(libs, assets, transform, noise, field).build();
    this.detail = scenery.detail;
    this.group.add(scenery.core, scenery.detail);
    this.placeResources(assets);
  }

  private placeResources(assets: WarAssetLibrary): void {
    for (const team of [0, 1] as WarTeam[]) {
      for (const point of WarMapData.orePoints(team)) {
        const node = assets.model("resources/Iron_Nuggets.gltf");
        const scene = this.transform.toScene(point);
        node.position.set(scene.x, 0, scene.z);
        node.scale.setScalar(5.2);
        node.rotation.y = point.x * 0.01;
        this.group.add(node);
      }
      for (const point of WarMapData.crystalPoints(team)) {
        const crystal = assets.model("scenery/rock_crystalsLargeA.glb");
        const scene = this.transform.toScene(point);
        crystal.position.set(scene.x, 0, scene.z);
        crystal.scale.setScalar(4.2);
        crystal.rotation.y = point.y * 0.013;
        this.group.add(crystal);
      }
    }
  }
}

class WarFogView {
  readonly mesh: Three<"Mesh">;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: Three<"CanvasTexture">;

  constructor(libs: ThreeLibs, private readonly transform: WarViewTransform, private readonly vision: WarVision) {
    const THREE = libs.THREE;
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.ceil((WarMapData.HALF_W * 2) / WarMapData.VISION_CELL);
    this.canvas.height = Math.ceil((WarMapData.HALF_H * 2) / WarMapData.VISION_CELL);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, depthTest: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry((this.canvas.width * WarMapData.VISION_CELL) / 100, (this.canvas.height * WarMapData.VISION_CELL) / 100), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.08;
    this.mesh.renderOrder = 5;
  }

  refresh(): void {
    const context = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.fillStyle = "rgba(0, 0, 0, 0.88)";
    const cell = WarMapData.VISION_CELL;
    for (let row = 0; row < this.canvas.height; row++) {
      for (let col = 0; col < this.canvas.width; col++) {
        const wx = col * cell + cell / 2 - WarMapData.HALF_W;
        const wy = row * cell + cell / 2 - WarMapData.HALF_H;
        if (this.vision.isVisible(this.transform.team, wx, wy)) continue;
        const drawCol = this.transform.team === 0 ? col : this.canvas.width - 1 - col;
        const drawRow = this.transform.team === 0 ? row : this.canvas.height - 1 - row;
        context.fillRect(drawCol, drawRow, 1, 1);
      }
    }
    this.texture.needsUpdate = true;
  }
}

class WarWorkerCrowd {
  private static readonly MAX = 56;
  private static readonly MINE_END = 0.38;
  private static readonly GO_END = 0.62;
  private static readonly DROP_END = 0.72;

  private static progress(phase: number): number {
    if (phase < WarWorkerCrowd.MINE_END) return 0;
    if (phase < WarWorkerCrowd.GO_END) return (phase - WarWorkerCrowd.MINE_END) / (WarWorkerCrowd.GO_END - WarWorkerCrowd.MINE_END);
    if (phase < WarWorkerCrowd.DROP_END) return 1;
    return 1 - (phase - WarWorkerCrowd.DROP_END) / (1 - WarWorkerCrowd.DROP_END);
  }

  readonly group: Three<"Group">;
  private readonly instances: WarInstanceSet;

  constructor(libs: ThreeLibs, assets: WarAssetLibrary, private readonly transform: WarViewTransform, private readonly team: WarTeam, color: string) {
    this.instances = new WarInstanceSet(libs, assets.template(WarSceneryKit.WORKER), WarWorkerCrowd.MAX);
    this.group = this.instances.group;
    const tint = new libs.THREE.Color(color);
    for (let i = 0; i < WarWorkerCrowd.MAX; i++) this.instances.tint(i, tint);
  }

  update(oreWorkers: number, crystalWorkers: number, seconds: number): void {
    const ore = WarMapData.orePoints(this.team), crystal = WarMapData.crystalPoints(this.team);
    const hq = this.transform.toScene(WarMapData.hq(this.team));
    const total = Math.min(WarWorkerCrowd.MAX, oreWorkers + crystalWorkers);
    for (let i = 0; i < total; i++) {
      const points = i < oreWorkers ? ore : crystal;
      const node = this.transform.toScene(points[i % points.length]);
      const phase = (seconds * 0.11 + i * 0.173) % 1;
      const along = WarWorkerCrowd.progress(phase);
      const mining = phase < WarWorkerCrowd.MINE_END;
      const carryingHome = phase >= WarWorkerCrowd.MINE_END && phase < WarWorkerCrowd.DROP_END;
      const reach = 0.15 + along * 0.7;
      const x = node.x + (hq.x - node.x) * reach;
      const z = node.z + (hq.z - node.z) * reach;
      const towardHq = Math.atan2(hq.x - node.x, hq.z - node.z);
      const yaw = mining ? towardHq + Math.PI : carryingHome || phase < WarWorkerCrowd.DROP_END ? towardHq : towardHq + Math.PI;
      const bob = mining ? Math.abs(Math.sin(seconds * 6 + i * 1.7)) * 0.22 : Math.abs(Math.sin(seconds * 9 + i)) * 0.06;
      this.instances.set(i, { x, z, yaw, scale: 2.4, y: bob });
    }
    this.instances.finish(total);
  }
}

class WarCameraRig {
  private static readonly DISTANCE = 24;
  private static readonly HEIGHT = 30;
  private static readonly LIMIT_X = 58;
  private static readonly LIMIT_Z = 92;

  private readonly camera: Three<"PerspectiveCamera">;
  private focusX = 0;
  private focusZ = 0;
  private zoom = 1;

  constructor(libs: ThreeLibs) {
    this.camera = new libs.THREE.PerspectiveCamera(45, 1, 0.5, 400);
    this.apply();
  }

  get perspective(): Three<"PerspectiveCamera"> {
    return this.camera;
  }

  get focus(): WarScenePoint {
    return { x: this.focusX, z: this.focusZ };
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  focusOn(x: number, z: number): void {
    this.focusX = x;
    this.focusZ = z;
    this.clampFocus();
    this.apply();
  }

  pan(dx: number, dz: number): void {
    this.focusOn(this.focusX + dx, this.focusZ + dz);
  }

  setZoom(value: number): void {
    this.zoom = value;
    this.apply();
  }

  zoomBy(factor: number): void {
    this.zoom = Math.min(1.5, Math.max(0.55, this.zoom * factor));
    this.apply();
  }

  orbit(radius: number, height: number, angle: number, centerX: number, centerZ: number): void {
    this.camera.position.set(centerX + Math.sin(angle) * radius, height, centerZ + Math.cos(angle) * radius);
    this.camera.lookAt(centerX, 1.5, centerZ);
  }

  private clampFocus(): void {
    this.focusX = Math.min(WarCameraRig.LIMIT_X, Math.max(-WarCameraRig.LIMIT_X, this.focusX));
    this.focusZ = Math.min(WarCameraRig.LIMIT_Z, Math.max(-WarCameraRig.LIMIT_Z, this.focusZ));
  }

  private apply(): void {
    this.camera.position.set(this.focusX, WarCameraRig.HEIGHT * this.zoom, this.focusZ + WarCameraRig.DISTANCE * this.zoom);
    this.camera.lookAt(this.focusX, 0, this.focusZ);
  }
}

class WarWorldView {
  readonly scene: Three<"Scene">;
  readonly rig: WarCameraRig;
  playing = false;
  private readonly renderer: Three<"WebGLRenderer">;
  private readonly raycaster: Three<"Raycaster">;
  private readonly ground: Three<"Plane">;
  private readonly governor: QualityGovernorHandle | null;
  private pixelRatio: number;
  private readonly detailGroups: Three<"Group">[] = [];
  private detailHidden = false;
  private readonly statsWanted = window.location.search.indexOf("stats") >= 0;
  private statsFrames = 0;

  constructor(private readonly libs: ThreeLibs, canvas: HTMLCanvasElement, touchDevice: boolean) {
    const THREE = libs.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#150E1F");
    this.scene.fog = new THREE.Fog(0x150E1F, 85, 230);
    this.scene.add(new THREE.HemisphereLight(0xFFE9D2, 0x4A3A66, 1.75));
    const sun = new THREE.DirectionalLight(0xFFD9A8, 1.45);
    sun.position.set(-20, 40, 15);
    this.scene.add(sun);
    this.rig = new WarCameraRig(libs);
    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.governor = window.QualityGovernor
      ? window.QualityGovernor({ steps: [() => this.lowerPixelRatio(), () => this.hideDetail()], storageKey: "spacewar_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 })
      : null;
    if (this.governor) this.governor.restore();
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  groundPoint(clientX: number, clientY: number): WarScenePoint | null {
    const THREE = this.libs.THREE;
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.perspective);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  resize(): void {
    const width = window.innerWidth, height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / height);
  }

  render(deltaSeconds: number): void {
    this.renderer.render(this.scene, this.rig.perspective);
    if (this.governor) this.governor.update(deltaSeconds);
    this.reportStats();
  }

  private reportStats(): void {
    if (!this.statsWanted) return;
    this.statsFrames++;
    if (this.statsFrames % 120 !== 0) return;
    const info = this.renderer.info.render;
    console.log("그리기 호출 " + info.calls + " · 삼각형 " + info.triangles + " · 화면 배율 " + this.pixelRatio);
  }

  private hideDetail(): boolean {
    if (this.detailHidden) return false;
    this.detailHidden = true;
    this.detailGroups.forEach((group) => { group.visible = false; });
    return true;
  }

  registerDetail(group: Three<"Group">): void {
    this.detailGroups.push(group);
    group.visible = !this.detailHidden;
  }

  private lowerPixelRatio(): boolean {
    if (this.pixelRatio <= 1) return false;
    this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
    return true;
  }
}

class WarSelectionMarker {
  readonly mesh: Three<"Mesh">;

  constructor(libs: ThreeLibs) {
    const THREE = libs.THREE;
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.12;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  place(point: WarScenePoint | null, radius: number): void {
    this.mesh.visible = point !== null;
    if (!point) return;
    this.mesh.position.set(point.x, 0.12, point.z);
    this.mesh.scale.setScalar(radius);
  }
}

class WarSlotMarkers {
  readonly group: Three<"Group">;
  private readonly markers = new Map<number, Three<"Mesh">>();

  constructor(private readonly libs: ThreeLibs, slots: WarSlotDef[], transform: WarViewTransform) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    const geometry = new THREE.RingGeometry(1.1, 1.4, 6);
    const material = new THREE.MeshBasicMaterial({ color: "#8FB4FF", transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    for (const slot of slots) {
      if (!slot.enabled) continue;
      const marker = new THREE.Mesh(geometry, material);
      const scene = transform.toScene(slot);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(scene.x, 0.06, scene.z);
      this.group.add(marker);
      this.markers.set(slot.index, marker);
    }
  }

  setOccupied(index: number, occupied: boolean): void {
    const marker = this.markers.get(index);
    if (marker) marker.visible = !occupied;
  }
}

interface WarEffectStyle { projectile: boolean; color: string; size: number; speed: number; arc: number; hit: number }

class WarEffectStyles {
  private static readonly DEFAULT: WarEffectStyle = { projectile: false, color: "#FFE9B0", size: 0.12, speed: 20, arc: 0, hit: 0.9 };
  private static readonly STYLES: Record<string, WarEffectStyle> = {
    shieldbearer: { projectile: false, color: "#FFE9B0", size: 0, speed: 0, arc: 0, hit: 0.9 },
    charger: { projectile: false, color: "#FFB070", size: 0, speed: 0, arc: 0, hit: 1 },
    archer: { projectile: true, color: "#FFF27A", size: 0.11, speed: 30, arc: 0.4, hit: 0.55 },
    energymage: { projectile: true, color: "#6FE7FF", size: 0.26, speed: 20, arc: 0, hit: 1.5 },
    guardknight: { projectile: false, color: "#FFD070", size: 0, speed: 0, arc: 0, hit: 1.4 },
    artillerytruck: { projectile: true, color: "#FF9A3C", size: 0.34, speed: 15, arc: 3.2, hit: 2.8 },
    minion: { projectile: false, color: "#E8E8D0", size: 0, speed: 0, arc: 0, hit: 0.75 },
    skelwarrior: { projectile: false, color: "#E8E8D0", size: 0, speed: 0, arc: 0, hit: 0.9 },
    skelarcher: { projectile: true, color: "#C8FFB0", size: 0.11, speed: 30, arc: 0.4, hit: 0.55 },
    skelmage: { projectile: true, color: "#C77DFF", size: 0.24, speed: 22, arc: 0, hit: 1.1 },
    bonegiant: { projectile: false, color: "#D8C8A0", size: 0, speed: 0, arc: 0, hit: 2.1 },
    necromancer: { projectile: true, color: "#A0FF9A", size: 0.22, speed: 22, arc: 0, hit: 1 },
  };

  static of(unitId: string): WarEffectStyle {
    return WarEffectStyles.STYLES[unitId] ?? WarEffectStyles.DEFAULT;
  }
}

interface WarShot { mesh: Three<"Mesh">; active: boolean; from: WarScenePoint; to: WarScenePoint; age: number; duration: number; arc: number; style: WarEffectStyle }
interface WarBurst { mesh: Three<"Mesh">; active: boolean; age: number; life: number; size: number }

class WarEffects {
  private static readonly POOL = 90;
  private static readonly BURST_LIFE = 0.3;

  readonly group: Three<"Group">;
  private readonly shots: WarShot[] = [];
  private readonly bursts: WarBurst[] = [];

  constructor(private readonly libs: ThreeLibs, private readonly transform: WarViewTransform, private readonly isVisible: (x: number, y: number) => boolean) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    const shotGeometry = new THREE.SphereGeometry(1, 8, 6);
    const burstGeometry = new THREE.SphereGeometry(0.5, 10, 8);
    for (let i = 0; i < WarEffects.POOL; i++) {
      const shot = new THREE.Mesh(shotGeometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF" }));
      shot.visible = false;
      this.group.add(shot);
      this.shots.push({ mesh: shot, active: false, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, age: 0, duration: 1, arc: 0, style: WarEffectStyles.of("") });
      const burst = new THREE.Mesh(burstGeometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.9, depthWrite: false }));
      burst.visible = false;
      this.group.add(burst);
      this.bursts.push({ mesh: burst, active: false, age: 0, life: 1, size: 1 });
    }
  }

  handle(event: WarEvent): void {
    if (event.x === undefined || event.y === undefined) return;
    if (event.kind === "strike" && event.tx !== undefined && event.ty !== undefined) {
      if (!this.isVisible(event.x, event.y) && !this.isVisible(event.tx, event.ty)) return;
      this.strike(WarEffectStyles.of(event.text), this.transform.toScene({ x: event.x, y: event.y }), this.transform.toScene({ x: event.tx, y: event.ty }));
    } else if (event.kind === "unitDied" && this.isVisible(event.x, event.y)) {
      this.burst(this.transform.toScene({ x: event.x, y: event.y }), "#B9B2A6", 1.6, 0.5, 0.8);
    } else if (event.kind === "buildingDestroyed") {
      const at = this.transform.toScene({ x: event.x, y: event.y });
      this.burst(at, "#FF8A3C", 6, 0.9, 1.5);
      this.burst(at, "#FFE08A", 3.4, 0.6, 2);
    } else if (event.kind === "revived" || event.kind === "raised") {
      if (this.isVisible(event.x, event.y)) this.burst(this.transform.toScene({ x: event.x, y: event.y }), "#9CFF9A", 2.2, 0.7, 0.2);
    }
  }

  update(deltaSeconds: number): void {
    for (const shot of this.shots) {
      if (!shot.active) continue;
      shot.age += deltaSeconds;
      const t = Math.min(1, shot.age / shot.duration);
      const x = shot.from.x + (shot.to.x - shot.from.x) * t;
      const z = shot.from.z + (shot.to.z - shot.from.z) * t;
      const y = 1.5 + (1.1 - 1.5) * t + shot.arc * 4 * t * (1 - t);
      shot.mesh.position.set(x, y, z);
      shot.mesh.lookAt(shot.to.x, 1.1, shot.to.z);
      if (t >= 1) {
        shot.active = false;
        shot.mesh.visible = false;
        this.burst(shot.to, shot.style.color, shot.style.hit, WarEffects.BURST_LIFE, 1.1);
      }
    }
    for (const burst of this.bursts) {
      if (!burst.active) continue;
      burst.age += deltaSeconds;
      const t = burst.age / burst.life;
      if (t >= 1) {
        burst.active = false;
        burst.mesh.visible = false;
        continue;
      }
      burst.mesh.scale.setScalar(burst.size * (0.35 + 0.65 * t));
      (burst.mesh.material as Three<"MeshBasicMaterial">).opacity = 0.85 * (1 - t);
    }
  }

  private strike(style: WarEffectStyle, from: WarScenePoint, to: WarScenePoint): void {
    if (!style.projectile) {
      this.burst(to, style.color, style.hit, WarEffects.BURST_LIFE, 1.1);
      return;
    }
    const shot = this.shots.find((candidate) => !candidate.active);
    if (!shot) return;
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    shot.active = true;
    shot.age = 0;
    shot.duration = Math.max(0.08, distance / style.speed);
    shot.from = from;
    shot.to = to;
    shot.arc = style.arc;
    shot.style = style;
    (shot.mesh.material as Three<"MeshBasicMaterial">).color.set(style.color);
    shot.mesh.scale.set(style.size, style.size, style.size * (style.arc > 1 ? 1 : 3.2));
    shot.mesh.position.set(from.x, 1.5, from.z);
    shot.mesh.visible = true;
  }

  private burst(at: WarScenePoint, color: string, size: number, life: number, height: number): void {
    const burst = this.bursts.find((candidate) => !candidate.active);
    if (!burst) return;
    burst.active = true;
    burst.age = 0;
    burst.life = life;
    burst.size = size;
    (burst.mesh.material as Three<"MeshBasicMaterial">).color.set(color);
    burst.mesh.position.set(at.x, height, at.z);
    burst.mesh.scale.setScalar(size * 0.35);
    burst.mesh.visible = true;
  }
}

class WarMatchView {
  private static readonly UNIT_PICK_PIXELS = 30;
  private static readonly BUILDING_PICK_PIXELS = 52;

  readonly transform: WarViewTransform;
  private readonly root: Three<"Group">;
  private readonly materials: WarMaterials;
  private readonly units = new Map<number, WarUnitView>();
  private readonly buildings = new Map<number, WarBuildingView>();
  private readonly seenBuildings = new Set<number>();
  private readonly fog: WarFogView;
  private readonly slotMarkers: WarSlotMarkers;
  private readonly crowds: WarWorkerCrowd[];
  private readonly marker: WarSelectionMarker;
  private readonly effects: WarEffects;
  private selection: WarSelection = { kind: "none" };
  private seconds = 0;
  private lastFogTick = -99;

  constructor(private readonly libs: ThreeLibs, private readonly assets: WarAssetLibrary, private readonly world: WarWorldView, private readonly engine: WarEngine, readonly viewer: WarTeam) {
    const THREE = libs.THREE;
    this.transform = new WarViewTransform(viewer);
    this.materials = new WarMaterials(libs);
    this.root = new THREE.Group();
    const ground = new WarGroundView(libs, assets, this.transform);
    this.root.add(ground.group);
    world.registerDetail(ground.detail);
    this.fog = new WarFogView(libs, this.transform, engine.vision);
    this.root.add(this.fog.mesh);
    this.slotMarkers = new WarSlotMarkers(libs, engine.players[viewer].slotDefs, this.transform);
    this.root.add(this.slotMarkers.group);
    this.crowds = [new WarWorkerCrowd(libs, assets, this.transform, 0, viewer === 0 ? "#E4FFEE" : "#FFC4C4"), new WarWorkerCrowd(libs, assets, this.transform, 1, viewer === 1 ? "#E4FFEE" : "#FFC4C4")];
    this.crowds.forEach((crowd) => this.root.add(crowd.group));
    this.marker = new WarSelectionMarker(libs);
    this.root.add(this.marker.mesh);
    this.effects = new WarEffects(libs, this.transform, (x, y) => this.engine.vision.isVisible(this.viewer, x, y));
    this.root.add(this.effects.group);
    world.scene.add(this.root);
    const home = this.transform.toScene(WarMapData.hq(viewer));
    world.rig.setZoom(1.6);
    world.rig.focusOn(home.x, home.z + 6);
    this.onTick();
  }

  handleEvent(event: WarEvent): void {
    this.effects.handle(event);
  }

  setSelection(selection: WarSelection): void {
    this.selection = selection;
  }

  pick(clientX: number, clientY: number): WarSelection {
    const best = this.pickEntity(clientX, clientY);
    if (best.kind !== "none") return best;
    const hit = this.world.groundPoint(clientX, clientY);
    if (!hit) return { kind: "none" };
    const point = this.transform.sceneToWorld(hit.x, hit.z);
    for (const slot of this.engine.players[this.viewer].slotDefs) {
      if (!slot.enabled || this.engine.players[this.viewer].slotBuildings[slot.index]) continue;
      if (WarMath.dist(point.x, point.y, slot.x, slot.y) <= 190) return { kind: "slot", index: slot.index };
    }
    return { kind: "none" };
  }

  private pickEntity(clientX: number, clientY: number): WarSelection {
    const camera = this.world.rig.perspective;
    const vector = new this.libs.THREE.Vector3();
    let best: WarSelection = { kind: "none" };
    let bestDistance = Number.MAX_SAFE_INTEGER;
    for (const entity of this.engine.entities) {
      if (!entity.alive || !this.isShown(entity)) continue;
      const isUnit = entity instanceof WarUnit;
      const scene = this.transform.toScene(entity);
      vector.set(scene.x, isUnit ? 1 : 1.6, scene.z).project(camera);
      const dx = ((vector.x + 1) / 2) * window.innerWidth - clientX;
      const dy = ((1 - vector.y) / 2) * window.innerHeight - clientY;
      const reach = isUnit ? WarMatchView.UNIT_PICK_PIXELS : WarMatchView.BUILDING_PICK_PIXELS * (entity.bodyRadius() / 200 + 0.5);
      const distance = Math.hypot(dx, dy);
      if (distance > reach || distance >= bestDistance) continue;
      bestDistance = distance;
      best = isUnit ? { kind: "unit", id: entity.id } : { kind: "building", id: entity.id };
    }
    return best;
  }

  onTick(): void {
    const player = this.engine.players[this.viewer];
    const alive = new Set<number>();
    for (const entity of this.engine.entities) {
      if (!entity.alive) continue;
      alive.add(entity.id);
      if (entity instanceof WarUnit) this.syncUnit(entity);
      else if (entity instanceof WarBuilding) this.syncBuilding(entity);
    }
    this.dropMissing(this.units, alive);
    this.dropMissing(this.buildings, alive);
    player.slotDefs.forEach((slot) => this.slotMarkers.setOccupied(slot.index, !!player.slotBuildings[slot.index]));
    if (this.engine.tick - this.lastFogTick >= 3) {
      this.fog.refresh();
      this.lastFogTick = this.engine.tick;
    }
  }

  render(alpha: number, deltaSeconds: number): void {
    this.seconds += deltaSeconds;
    const camera = this.world.rig.perspective;
    const focus = this.world.rig.focus;
    this.units.forEach((view) => {
      const near = Math.abs(view.group.position.x - focus.x) < 45 && Math.abs(view.group.position.z - focus.z) < 45;
      view.animate = near;
      view.render(alpha, deltaSeconds, camera.quaternion);
    });
    this.buildings.forEach((view) => view.faceCamera(camera.quaternion));
    for (const crowd of this.crowds) {
      const team = crowd === this.crowds[0] ? 0 : 1;
      const economy = this.engine.players[team].economy;
      crowd.update(economy.oreWorkers, economy.crystalWorkers, this.seconds);
      const base = WarMapData.hq(team as WarTeam);
      crowd.group.visible = team === this.viewer || this.engine.vision.isVisible(this.viewer, base.x, base.y);
    }
    this.effects.update(deltaSeconds);
    this.placeMarker();
  }

  dispose(): void {
    this.world.scene.remove(this.root);
  }

  private isShown(entity: WarEntity): boolean {
    if (entity.team === this.viewer) return true;
    if (entity instanceof WarBuilding) return this.seenBuildings.has(entity.id) || this.engine.vision.isVisible(this.viewer, entity.x, entity.y);
    return this.engine.vision.isVisible(this.viewer, entity.x, entity.y);
  }

  private syncUnit(unit: WarUnit): void {
    const mine = unit.team === this.viewer;
    const scene = this.transform.toScene(unit);
    let view = this.units.get(unit.id);
    if (!view) {
      view = new WarUnitView(this.libs, this.assets, this.materials, unit, scene, mine);
      this.units.set(unit.id, view);
      this.root.add(view.group);
    }
    const target = unit.targetId >= 0 ? this.engine.entityById(unit.targetId) : null;
    const facing = target ? this.transform.toScene(target) : null;
    view.onTick(unit, scene, facing, mine ? WarPalette.SQUAD_COLORS[Math.max(0, unit.squadIndex)] : null);
    view.show(this.isShown(unit));
  }

  private syncBuilding(building: WarBuilding): void {
    const mine = building.team === this.viewer;
    let view = this.buildings.get(building.id);
    if (!view) {
      view = new WarBuildingView(this.libs, this.assets, this.materials, building, this.transform.toScene(building), mine, this.engine.players[building.team].faction);
      this.buildings.set(building.id, view);
      this.root.add(view.group);
    }
    if (this.engine.vision.isVisible(this.viewer, building.x, building.y)) this.seenBuildings.add(building.id);
    view.onTick(building);
    view.show(this.isShown(building));
  }

  private dropMissing<T extends { group: Three<"Group"> }>(views: Map<number, T>, alive: Set<number>): void {
    for (const id of Array.from(views.keys())) {
      if (alive.has(id)) continue;
      const view = views.get(id) as T;
      this.root.remove(view.group);
      views.delete(id);
    }
  }

  private placeMarker(): void {
    const selection = this.selection;
    if (selection.kind === "slot") {
      const slot = this.engine.players[this.viewer].slotDefs[selection.index];
      this.marker.place(this.transform.toScene(slot), 1.5);
    } else if (selection.kind === "unit") {
      const view = this.units.get(selection.id);
      const entity = this.engine.entityById(selection.id);
      this.marker.place(view && entity && entity.alive ? { x: view.group.position.x, z: view.group.position.z } : null, 0.9);
    } else if (selection.kind === "building") {
      const entity = this.engine.entityById(selection.id);
      this.marker.place(entity && entity.alive ? this.transform.toScene(entity) : null, entity ? Math.max(0.9, entity.bodyRadius() / 100 + 0.35) : 1);
    } else {
      this.marker.place(null, 1);
    }
  }
}

class WarMenuBackdrop {
  private static readonly ORBIT_SECONDS = 90;
  private static readonly RADIUS = 20;
  private static readonly HEIGHT = 9;

  private readonly root: Three<"Group">;
  private readonly units: WarUnitView[] = [];
  private crowd: WarWorkerCrowd | null = null;
  private seconds = 0;
  private built = false;

  constructor(private readonly libs: ThreeLibs, private readonly assets: WarAssetLibrary, private readonly world: WarWorldView) {
    this.root = new libs.THREE.Group();
  }

  show(): void {
    if (!this.built) this.build();
    this.root.visible = true;
    if (!this.root.parent) this.world.scene.add(this.root);
  }

  hide(): void {
    this.root.visible = false;
  }

  render(deltaSeconds: number): void {
    this.seconds += deltaSeconds;
    const transform = new WarViewTransform(0);
    const hq = transform.toScene(WarMapData.hq(0));
    this.world.rig.orbit(WarMenuBackdrop.RADIUS, WarMenuBackdrop.HEIGHT, (this.seconds / WarMenuBackdrop.ORBIT_SECONDS) * Math.PI * 2, hq.x, hq.z - 2);
    if (this.crowd) this.crowd.update(8, 3, this.seconds);
    for (const view of this.units) view.render(1, deltaSeconds, this.world.rig.perspective.quaternion);
  }

  private build(): void {
    this.built = true;
    const transform = new WarViewTransform(0);
    const materials = new WarMaterials(this.libs);
    this.root.add(new WarGroundView(this.libs, this.assets, transform).group);
    this.crowd = new WarWorkerCrowd(this.libs, this.assets, transform, 0, "#E4FFEE");
    this.root.add(this.crowd.group);
    const engine = new WarEngine({ seed: 1, factions: ["pioneer", "pioneer"] });
    const player = engine.players[0];
    ["barracks", "range", "lab", "barracks"].forEach((type, i) => {
      engine.build(0, [1, 3, 5, 7][i], type as WarBuildingType);
    });
    const hq = player.hq as WarBuilding;
    const buildings: WarBuilding[] = [hq, ...player.buildings().filter((b) => b !== hq)];
    for (const building of buildings) {
      building.buildLeft = 0;
      const view = new WarBuildingView(this.libs, this.assets, materials, building, transform.toScene(building), true, "pioneer");
      view.onTick(building);
      this.root.add(view.group);
    }
    const roster = ["shieldbearer", "charger", "archer", "energymage", "guardknight", "shieldbearer", "archer"];
    const post = WarMapData.post(0, 1);
    roster.forEach((id, i) => {
      const def = WarUnitCatalog.byId(id);
      const unit = new WarUnit(100 + i, 0, post.x + (i - 3) * 260, post.y - (def.kind === "ranged" ? -300 : 150) , def);
      const view = new WarUnitView(this.libs, this.assets, materials, unit, transform.toScene(unit), true);
      view.onTick(unit, transform.toScene(unit), { x: 0, z: -40 }, WarPalette.SQUAD_COLORS[i % 3]);
      view.onTick(unit, transform.toScene(unit), { x: 0, z: -40 }, null);
      this.units.push(view);
      this.root.add(view.group);
    });
  }
}
