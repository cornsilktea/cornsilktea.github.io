type WarSelection =
  | { kind: "none" }
  | { kind: "slot"; index: number }
  | { kind: "building"; id: number }
  | { kind: "unit"; id: number }
  | { kind: "squad"; index: number };

interface WarScenePoint { x: number; z: number }
interface WarUnitLook { shared: boolean; file: string; height: number; animated: boolean; idleClip: string; runClip: string; attackClip: string; shootsFar: boolean; altitude: number; turn: number; parts: WarDecor[]; backClip: string; backReverse: boolean; deathClip: string }

class WarPalette {
  static readonly SQUAD_COLORS = ["#4FC3F7", "#B388FF", "#FFD54F", "#FF8A80"];
  static readonly ENEMY = "#E5484D";
  static readonly MINE = "#7CE0A8";
  static readonly ACCENT = "#D97B4F";
  static readonly KIND_COLORS: Record<WarUnitKind, string> = { melee: "#6BCB77", ranged: "#F2994A", elite: "#E5484D", air: "#6FD8FF" };
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

class WarFlight {
  static readonly ALTITUDE = 6;
}

class WarUnitLooks {
  private static readonly BASE = { altitude: 0, turn: 0, parts: [] as WarDecor[], backClip: "", backReverse: false, deathClip: "" };
  private static readonly HUMAN = { ...WarUnitLooks.BASE, shared: false, animated: true, idleClip: "Idle", runClip: "Run", shootsFar: false, backClip: "Walk", backReverse: true, deathClip: "Death" };
  private static readonly SKELETON = { ...WarUnitLooks.BASE, shared: true, animated: true, idleClip: "Idle_A", runClip: "Running_A", shootsFar: false, backClip: "Walking_Backwards", backReverse: false, deathClip: "Death_A" };
  private static readonly SHIP = { ...WarUnitLooks.BASE, shared: false, animated: false, idleClip: "", runClip: "", attackClip: "", shootsFar: true, altitude: WarFlight.ALTITUDE };
  private static readonly LOOKS: Record<string, WarUnitLook> = {
    shieldbearer: { ...WarUnitLooks.HUMAN, file: "quaternius/Knight_Male.gltf", height: 3.4, attackClip: "SwordSlash" },
    archer: { ...WarUnitLooks.HUMAN, file: "quaternius/BlueSoldier_Female.gltf", height: 3.2, attackClip: "Shoot_OneHanded", shootsFar: true },
    guardknight: { ...WarUnitLooks.BASE, shared: false, animated: true, file: "quaternius/Mech_FinnTheFrog.gltf", height: 4.5, idleClip: "Idle", runClip: "Run", attackClip: "Kick", shootsFar: false, backClip: "Walk", backReverse: true, deathClip: "Death" },
    artillerytruck: { ...WarUnitLooks.BASE, shared: false, animated: false, file: "quaternius/Rover_Round.gltf", height: 4.2, idleClip: "", runClip: "", attackClip: "", shootsFar: true },
    striker: { ...WarUnitLooks.SHIP, file: "air/Striker.gltf", height: 1.4 },
    executioner: { ...WarUnitLooks.SHIP, file: "air/Executioner.gltf", height: 1.6 },
    minion: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Minion.glb", height: 2.1, attackClip: "Melee_1H_Attack_Chop" },
    dropminion: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Minion.glb", height: 2.4, attackClip: "Melee_1H_Attack_Chop" },
    skelwarrior: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Warrior.glb", height: 2.9, attackClip: "Melee_1H_Attack_Slice_Horizontal" },
    skelarcher: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Rogue.glb", height: 2.7, attackClip: "Ranged_Bow_Release", shootsFar: true },
    bonegiant: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Warrior.glb", height: 5.0, attackClip: "Melee_2H_Attack_Chop" },
    stormwitch: { ...WarUnitLooks.HUMAN, file: "quaternius/Witch.gltf", height: 3.8, attackClip: "Shoot_OneHanded", shootsFar: true },
    coffinship: {
      ...WarUnitLooks.SHIP, file: "halloween/coffin_decorated.gltf", height: 1.4, turn: Math.PI, shootsFar: false,
      parts: [{ file: "halloween/ribcage.gltf", x: 0, y: 0.7, z: -0.2, scale: 1.5 }, { file: "halloween/skull_candle.gltf", x: 0, y: 0.5, z: 1.0, scale: 0.9 }],
    },
    cursedeye: { ...WarUnitLooks.BASE, shared: false, animated: true, file: "air/Enemy_EyeDrone.gltf", height: 2.0, idleClip: "Idle", runClip: "Idle", attackClip: "Attack", shootsFar: true, altitude: WarFlight.ALTITUDE },
  };

  static of(unitId: string): WarUnitLook {
    return WarUnitLooks.LOOKS[unitId];
  }

  static files(): string[] {
    const files: string[] = [];
    for (const key of Object.keys(WarUnitLooks.LOOKS)) {
      files.push(WarUnitLooks.LOOKS[key].file);
      for (const part of WarUnitLooks.LOOKS[key].parts) files.push(part.file);
    }
    return files;
  }
}
interface WarBuildingModel { file: string; scale: number; top?: number }
interface WarDecor { file: string; x: number; y?: number; z: number; scale: number }

class WarBuildingLooks {
  private static readonly MODELS: Record<WarFactionId, Record<WarBuildingType, WarBuildingModel>> = {
    pioneer: {
      hq: { file: "quaternius/Base_Large.gltf", scale: 0.8 },
      barracks: { file: "quaternius/House_Single.gltf", scale: 0.9 },
      factory: { file: "quaternius/GeodesicDome.gltf", scale: 0.42 },
      airport: { file: "space/landingpad_large.gltf", scale: 1.7 },
    },
    grave: {
      hq: { file: "halloween/crypt.gltf", scale: 1.35, top: 9.5 },
      barracks: { file: "halloween/coffin_decorated.gltf", scale: 1.2 },
      factory: { file: "halloween/shrine_candles.gltf", scale: 1.7 },
      airport: { file: "halloween/arch_gate.gltf", scale: 1.1 },
    },
  };

  private static readonly DECOR: Record<string, WarDecor[]> = {
    "grave:airport": [
      { file: "halloween/lantern_standing.gltf", x: -2.6, z: 0.8, scale: 1.6 }, { file: "halloween/lantern_standing.gltf", x: 2.6, z: 0.8, scale: 1.6 },
      { file: "halloween/skull_candle.gltf", x: -1.6, z: 1.8, scale: 1.4 }, { file: "halloween/skull_candle.gltf", x: 1.6, z: 1.8, scale: 1.4 },
    ],
    "grave:hq": [
      { file: "halloween/pillar.gltf", x: -4.2, z: -3, scale: 1.8 }, { file: "halloween/pillar.gltf", x: 4.2, z: -3, scale: 1.8 },
      { file: "halloween/pillar.gltf", x: -4.2, z: 3, scale: 1.8 }, { file: "halloween/pillar.gltf", x: 4.2, z: 3, scale: 1.8 },
      { file: "halloween/gravestone.gltf", x: -5.4, z: 0.4, scale: 1.6 }, { file: "halloween/gravestone.gltf", x: 5.4, z: -0.4, scale: 1.6 },
      { file: "halloween/lantern_standing.gltf", x: -2.4, z: 4.6, scale: 1.8 }, { file: "halloween/lantern_standing.gltf", x: 2.4, z: 4.6, scale: 1.8 },
      { file: "halloween/skull_candle.gltf", x: -1.2, z: 5, scale: 2 }, { file: "halloween/skull_candle.gltf", x: 1.2, z: 5, scale: 2 },
    ],
  };

  static decorOf(type: WarBuildingType, faction: WarFactionId): WarDecor[] {
    return WarBuildingLooks.DECOR[faction + ":" + type] ?? [];
  }

  static of(type: WarBuildingType, faction: WarFactionId): WarBuildingModel {
    return WarBuildingLooks.MODELS[faction][type];
  }

  static files(): string[] {
    const files: string[] = [];
    for (const faction of Object.keys(WarBuildingLooks.MODELS) as WarFactionId[]) {
      for (const type of Object.keys(WarBuildingLooks.MODELS[faction]) as WarBuildingType[]) files.push(WarBuildingLooks.MODELS[faction][type].file);
    }
    for (const key of Object.keys(WarBuildingLooks.DECOR)) for (const decor of WarBuildingLooks.DECOR[key]) files.push(decor.file);
    return files;
  }
}

interface WarActor { model: Three<"Object3D">; clips: Map<string, Three<"AnimationClip">> }
interface WarLoadedAsset { scene: Three<"Object3D">; clips: Map<string, Three<"AnimationClip">> }

class WarAssetLibrary {
  static readonly ROOT = "assets/kaykit/war/";
  private static readonly EXTRA_MODELS = ["space/landingpad_large.gltf", "resources/Iron_Nuggets.gltf", "resources/Parts_Pile_Large.gltf", "resources/Iron_Nugget_Large.gltf", "gear/pickaxe.gltf", "quaternius/Worker_Male.gltf", "quaternius/Worker_Female.gltf"];

  private static readonly RIG_ANIMATIONS = ["General", "MovementBasic", "CombatMelee", "CombatRanged"];

  private readonly assets = new Map<string, WarLoadedAsset>();
  private readonly rigClips = new Map<string, Three<"AnimationClip">>();
  private readonly heights = new Map<string, number>();
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

  grounded(file: string): Three<"Group"> {
    const THREE = this.libs.THREE;
    const model = this.model(file);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const holder = new THREE.Group();
    holder.add(model);
    return holder;
  }

  heightOf(file: string): number {
    const cached = this.heights.get(file);
    if (cached !== undefined) return cached;
    const THREE = this.libs.THREE;
    const template = this.template(file);
    template.updateMatrixWorld(true);
    const height = Math.max(0.01, new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).y);
    this.heights.set(file, height);
    return height;
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
  private static readonly RUN_REFERENCE = 4;
  private static readonly DEATH_SECONDS = 0.9;

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
  private backward = false;
  private paceRate = 1;
  private tilt = 0;
  private roll = 0;
  private dyingLeft = -1;

  constructor(libs: ThreeLibs, assets: WarAssetLibrary, private readonly materials: WarMaterials, unit: WarUnit, start: WarScenePoint, mine: boolean) {
    const THREE = libs.THREE;
    this.look = WarUnitLooks.of(unit.def.id);
    this.group = new THREE.Group();
    const actor = assets.actor(this.look.file, this.look.shared);
    this.model = actor.model;
    for (const part of this.look.parts) {
      const piece = assets.grounded(part.file);
      piece.position.set(part.x, part.y ?? 0, part.z);
      piece.scale.setScalar(part.scale);
      this.model.add(piece);
    }
    this.model.scale.setScalar(this.look.height / assets.heightOf(this.look.file));
    if (this.look.altitude > 0) this.model.rotation.order = "YXZ";
    WarShadows.cast(this.model);
    this.group.add(this.model);
    this.animator = this.look.animated ? new CharacterAnimator(libs, this.model, actor.clips) : null;
    this.ring = new THREE.Mesh(materials.ringGeometry, materials.ring(mine ? WarPalette.SQUAD_COLORS[Math.max(0, unit.squadIndex)] : WarPalette.ENEMY));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.ring.scale.setScalar(unit.collisionRadius() / 52);
    this.bar = new WarHealthBar(libs, materials, 1.1, 0.14, mine);
    this.bar.group.position.y = this.look.height * 0.65 + 0.6 + this.look.altitude;
    this.group.add(this.ring, this.bar.group);
    this.from = { x: start.x, z: start.z };
    this.to = { x: start.x, z: start.z };
    this.group.position.set(start.x, 0, start.z);
    this.yaw = mine ? Math.PI : 0;
    if (this.animator) this.animator.play(this.look.idleClip);
    this.model.position.y = this.look.altitude;
  }

  get altitude(): number {
    return this.look.altitude;
  }

  onTick(unit: WarUnit, target: WarScenePoint, facing: WarScenePoint | null, squadColor: string | null): void {
    this.from.x = this.to.x;
    this.from.z = this.to.z;
    this.to.x = target.x;
    this.to.z = target.z;
    const dx = this.to.x - this.from.x, dz = this.to.z - this.from.z;
    this.moving = dx * dx + dz * dz > 0.0004;
    const stepMeters = Math.sqrt(dx * dx + dz * dz);
    this.paceRate = Math.max(0.7, Math.min(1.7, (stepMeters * 10) / WarUnitView.RUN_REFERENCE));
    this.backward = this.moving && facing !== null && dx * (facing.x - this.to.x) + dz * (facing.z - this.to.z) < -0.35 * stepMeters * Math.max(0.01, Math.hypot(facing.x - this.to.x, facing.z - this.to.z));
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
    const aim = this.yaw + this.look.turn;
    const turn = Math.atan2(Math.sin(aim - this.model.rotation.y), Math.cos(aim - this.model.rotation.y));
    this.model.rotation.y += turn * Math.min(1, deltaSeconds * 26);
    this.bar.group.quaternion.copy(cameraQuaternion);
    this.bobSeconds += deltaSeconds;
    if (this.dyingLeft >= 0) {
      this.renderDeath(deltaSeconds);
      return;
    }
    if (this.look.altitude > 0) this.banking(turn, deltaSeconds);
    if (!this.animator) {
      this.model.position.y = this.look.altitude > 0 ? this.look.altitude + Math.sin(this.bobSeconds * 2 + this.yaw) * 0.25 : this.moving ? Math.abs(Math.sin(this.bobSeconds * 9)) * 0.06 : 0;
      return;
    }
    if (this.look.altitude > 0) this.model.position.y = this.look.altitude + Math.sin(this.bobSeconds * 2 + this.yaw) * 0.25;
    if (!this.animate) return;
    if (this.attackHold > 0) {
      this.attackHold -= deltaSeconds;
      this.animator.play(this.look.attackClip, { once: true });
    } else if (this.moving && this.backward && this.look.backClip !== "") {
      this.animator.play(this.look.backClip, { speed: this.look.backReverse ? -this.paceRate : this.paceRate });
    } else {
      this.animator.play(this.moving ? this.look.runClip : this.look.idleClip, { speed: this.moving ? this.paceRate : 1 });
    }
    this.animator.update(deltaSeconds);
  }

  private banking(turn: number, deltaSeconds: number): void {
    const wantTilt = this.moving ? 0.14 : 0;
    const wantRoll = Math.max(-0.45, Math.min(0.45, -turn * 0.9)) * (this.moving ? 1 : 0.3);
    const follow = Math.min(1, deltaSeconds * 6);
    this.tilt += (wantTilt - this.tilt) * follow;
    this.roll += (wantRoll - this.roll) * follow;
    this.model.rotation.x = this.tilt;
    this.model.rotation.z = this.roll;
  }

  beginDeath(): void {
    this.dyingLeft = WarUnitView.DEATH_SECONDS;
    this.bar.group.visible = false;
    this.ring.visible = false;
    if (this.animator && this.look.deathClip !== "") this.animator.play(this.look.deathClip, { once: true });
  }

  get finishedDying(): boolean {
    return this.dyingLeft >= 0 && this.dyingLeft <= 0.0001;
  }

  private renderDeath(deltaSeconds: number): void {
    this.dyingLeft = Math.max(0.00001, this.dyingLeft - deltaSeconds);
    const t = 1 - this.dyingLeft / WarUnitView.DEATH_SECONDS;
    if (this.animator && this.look.deathClip !== "") {
      this.animator.update(deltaSeconds);
      if (t > 0.7) this.model.scale.multiplyScalar(0.96);
      return;
    }
    this.model.position.y = Math.max(0, this.look.altitude * (1 - t * t * 1.6));
    this.model.rotation.z += deltaSeconds * (this.look.altitude > 0 ? 2.4 : 0);
    this.model.scale.multiplyScalar(this.look.altitude > 0 ? 0.985 : 0.93);
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
    WarShadows.cast(this.model);
    this.disc = new THREE.Mesh(new THREE.CircleGeometry((building.def.radius / 100) * 1.05, 28), materials.ring(mine ? "#2E8F6B" : "#A02A30"));
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.03;
    (this.disc.material as Three<"MeshBasicMaterial">).opacity = 0.55;
    this.bar = new WarHealthBar(libs, materials, building.def.type === "hq" ? 4 : 2.2, 0.22, mine);
    this.bar.group.position.y = look.top ?? (building.def.type === "hq" ? 6.2 : 3.4);
    this.group.add(this.disc, this.model, this.bar.group);
    for (const decor of WarBuildingLooks.decorOf(building.def.type, faction)) {
      const piece = assets.grounded(decor.file);
      piece.position.set(decor.x, decor.y ?? 0, decor.z);
      piece.scale.setScalar(decor.scale);
      WarShadows.cast(piece);
      this.group.add(piece);
    }
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
    plane.receiveShadow = true;
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
        WarShadows.cast(node);
        this.group.add(node);
      }
      for (const point of WarMapData.crystalPoints(team)) {
        const crystal = assets.grounded("scenery/rock_crystalsLargeA.glb");
        const scene = this.transform.toScene(point);
        crystal.position.set(scene.x, 0, scene.z);
        crystal.scale.setScalar(4.6);
        WarGlow.crystal(crystal);
        WarShadows.cast(crystal);
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

interface WarWorkerRoute { drop: WarScenePoint; spot: WarScenePoint; node: WarScenePoint; walkSeconds: number; cycleSeconds: number }

class WarWorker {
  private static readonly HEIGHT = 3.0;
  private static readonly CARRY_SIZE = 0.9;
  private static readonly PICK_SIZE = 1.25;

  readonly group: Three<"Group">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly oreItem: Three<"Object3D">;
  private readonly crystalItem: Three<"Object3D">;
  private readonly pickaxe: Three<"Object3D">;
  private yaw = 0;

  constructor(libs: ThreeLibs, assets: WarAssetLibrary, index: number, tint: string) {
    const file = index % 2 === 0 ? "quaternius/Worker_Male.gltf" : "quaternius/Worker_Female.gltf";
    const actor = assets.actor(file, false);
    this.model = actor.model;
    this.model.scale.setScalar(WarWorker.HEIGHT / assets.heightOf(file));
    this.model.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const material = (mesh.material as Three<"MeshStandardMaterial">).clone();
      material.color.multiply(new libs.THREE.Color(tint));
      mesh.material = material;
    });
    this.group = new libs.THREE.Group();
    this.group.add(this.model);
    this.animator = new CharacterAnimator(libs, this.model, actor.clips);
    this.model.updateMatrixWorld(true);
    const hand = this.model.getObjectByName("Fist.R") ?? this.model;
    this.oreItem = this.holdable(libs, assets, hand, "resources/Iron_Nugget_Large.gltf", WarWorker.CARRY_SIZE, 0);
    this.crystalItem = this.holdable(libs, assets, hand, "scenery/rock_crystals.glb", WarWorker.CARRY_SIZE, 0);
    WarGlow.crystal(this.crystalItem);
    this.pickaxe = this.holdable(libs, assets, hand, "gear/pickaxe.gltf", WarWorker.PICK_SIZE, Math.PI / 2);
  }

  private holdable(libs: ThreeLibs, assets: WarAssetLibrary, hand: Three<"Object3D">, file: string, size: number, tilt: number): Three<"Object3D"> {
    const item = assets.grounded(file);
    const world = new libs.THREE.Vector3();
    hand.getWorldScale(world);
    item.scale.setScalar(size / assets.heightOf(file) / Math.max(0.0001, world.x));
    item.rotation.x = tilt;
    item.visible = false;
    WarShadows.cast(item);
    hand.add(item);
    return item;
  }

  show(visible: boolean): void {
    this.group.visible = visible;
  }

  update(route: WarWorkerRoute, crystal: boolean, seconds: number, offset: number, animate: boolean, deltaSeconds: number): void {
    const t = (seconds + offset) % route.cycleSeconds;
    const mineEnd = WarWorkerCrowd.MINE_SECONDS;
    const carryEnd = mineEnd + route.walkSeconds;
    const dropEnd = carryEnd + WarWorkerCrowd.DROP_SECONDS;
    let from = route.spot, to = route.spot, along = 0, clip = "Idle", pace = 1, facing = route.node, holdsLoad = false, holdsPick = false;
    if (t < mineEnd) {
      clip = "SwordSlash";
      pace = 1.1;
      holdsPick = true;
    } else if (t < carryEnd) {
      from = route.spot;
      to = route.drop;
      along = (t - mineEnd) / route.walkSeconds;
      clip = "Walk_Carry";
      holdsLoad = true;
      facing = route.drop;
    } else if (t < dropEnd) {
      from = route.drop;
      to = route.drop;
      clip = "PickUp";
      holdsLoad = t < carryEnd + WarWorkerCrowd.DROP_SECONDS * 0.55;
      facing = route.drop;
    } else {
      from = route.drop;
      to = route.spot;
      along = (t - dropEnd) / route.walkSeconds;
      clip = "Walk";
      holdsPick = true;
      facing = route.spot;
    }
    const x = from.x + (to.x - from.x) * along;
    const z = from.z + (to.z - from.z) * along;
    this.group.position.set(x, 0, z);
    const aimX = facing === route.drop && t >= carryEnd && t < dropEnd ? route.drop.x : facing.x;
    const heading = clip === "Walk" || clip === "Walk_Carry" ? Math.atan2(to.x - from.x, to.z - from.z) : Math.atan2(aimX - x, facing.z - z);
    this.yaw = heading;
    const turn = Math.atan2(Math.sin(this.yaw - this.model.rotation.y), Math.cos(this.yaw - this.model.rotation.y));
    this.model.rotation.y += turn * Math.min(1, deltaSeconds * 12);
    this.oreItem.visible = holdsLoad && !crystal;
    this.crystalItem.visible = holdsLoad && crystal;
    this.pickaxe.visible = holdsPick;
    if (!animate) return;
    this.animator.play(clip, { speed: pace });
    this.animator.update(deltaSeconds);
  }
}

class WarWorkerCrowd {
  static readonly MINE_SECONDS = 3.2;
  static readonly DROP_SECONDS = 0.9;
  private static readonly MAX = 16;
  private static readonly SPEED = 3.4;
  private static readonly HQ_REACH = 4.2;
  private static readonly NODE_GAP = 1.9;

  readonly group: Three<"Group">;
  private readonly workers: WarWorker[] = [];
  private readonly routes = new Map<string, WarWorkerRoute>();
  private lastSeconds = 0;

  constructor(private readonly libs: ThreeLibs, private readonly assets: WarAssetLibrary, private readonly transform: WarViewTransform, private readonly team: WarTeam, private readonly tint: string) {
    this.group = new libs.THREE.Group();
  }

  private routeFor(point: WarPoint, key: string): WarWorkerRoute {
    const cached = this.routes.get(key);
    if (cached) return cached;
    const hq = this.transform.toScene(WarMapData.hq(this.team));
    const node = this.transform.toScene(point);
    const length = Math.hypot(node.x - hq.x, node.z - hq.z);
    const ux = (node.x - hq.x) / length, uz = (node.z - hq.z) / length;
    const drop = { x: hq.x + ux * WarWorkerCrowd.HQ_REACH, z: hq.z + uz * WarWorkerCrowd.HQ_REACH };
    const spot = { x: node.x - ux * WarWorkerCrowd.NODE_GAP, z: node.z - uz * WarWorkerCrowd.NODE_GAP };
    const walkSeconds = Math.max(1, Math.hypot(spot.x - drop.x, spot.z - drop.z) / WarWorkerCrowd.SPEED);
    const route = { drop, spot, node, walkSeconds, cycleSeconds: WarWorkerCrowd.MINE_SECONDS + WarWorkerCrowd.DROP_SECONDS + walkSeconds * 2 };
    this.routes.set(key, route);
    return route;
  }

  update(oreWorkers: number, crystalWorkers: number, seconds: number, focus: WarScenePoint | null = null): void {
    const deltaSeconds = Math.min(0.1, Math.max(0.001, seconds - this.lastSeconds));
    this.lastSeconds = seconds;
    const ore = WarMapData.orePoints(this.team), crystal = WarMapData.crystalPoints(this.team);
    const total = Math.min(WarWorkerCrowd.MAX, oreWorkers + crystalWorkers);
    while (this.workers.length < total) {
      const worker = new WarWorker(this.libs, this.assets, this.workers.length, this.tint);
      this.workers.push(worker);
      this.group.add(worker.group);
    }
    this.workers.forEach((worker, i) => {
      worker.show(i < total);
      if (i >= total) return;
      const isCrystal = i >= oreWorkers;
      const points = isCrystal ? crystal : ore;
      const slot = (isCrystal ? i - oreWorkers : i) % points.length;
      const route = this.routeFor(points[slot], (isCrystal ? "c" : "o") + slot);
      const position = worker.group.position;
      const near = focus === null || (Math.abs(position.x - focus.x) < 45 && Math.abs(position.z - focus.z) < 45);
      worker.update(route, isCrystal, seconds, i * 1.3, near, deltaSeconds);
    });
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

class WarGlow {
  static crystal(holder: Three<"Object3D">): void {
    holder.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (!mesh.isMesh) return;
      const material = (mesh.material as Three<"MeshStandardMaterial">).clone();
      material.color.set("#8FEFFF");
      material.emissive.set("#1E9ACB");
      material.emissiveIntensity = 0.9;
      mesh.material = material;
    });
  }
}

class WarShadows {
  static cast(object: Three<"Object3D">): void {
    object.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (mesh.isMesh) mesh.castShadow = true;
    });
  }
}

class WarWorldView {
  private static readonly SUN_OFFSET = { x: -20, y: 40, z: 15 };
  private static readonly SHADOW_HALF_SIZE = 42;

  private readonly sun: Three<"DirectionalLight">;
  private shadowsOn = true;
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
    this.sun = new THREE.DirectionalLight(0xFFD9A8, 1.45);
    this.sun.position.set(WarWorldView.SUN_OFFSET.x, WarWorldView.SUN_OFFSET.y, WarWorldView.SUN_OFFSET.z);
    this.sun.castShadow = true;
    const half = WarWorldView.SHADOW_HALF_SIZE;
    this.sun.shadow.mapSize.set(touchDevice ? 1024 : 2048, touchDevice ? 1024 : 2048);
    this.sun.shadow.camera.left = -half;
    this.sun.shadow.camera.right = half;
    this.sun.shadow.camera.top = half;
    this.sun.shadow.camera.bottom = -half;
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(this.sun, this.sun.target);
    this.rig = new WarCameraRig(libs);
    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.governor = window.QualityGovernor
      ? window.QualityGovernor({ steps: [() => this.disableShadows(), () => this.lowerPixelRatio(), () => this.hideDetail()], storageKey: "spacewar_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 })
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

  private disableShadows(): boolean {
    if (!this.shadowsOn) return false;
    this.shadowsOn = false;
    this.sun.castShadow = false;
    return true;
  }

  private followSun(): void {
    const focus = this.rig.focus;
    const offset = WarWorldView.SUN_OFFSET;
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.position.set(focus.x + offset.x, offset.y, focus.z + offset.z);
  }

  render(deltaSeconds: number): void {
    this.followSun();
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

interface WarEffectStyle { projectile: boolean; color: string; size: number; speed: number; arc: number; hit: number; beam: number; lightning: boolean; ring: number }

class WarEffectStyles {
  private static readonly DEFAULT: WarEffectStyle = { projectile: false, color: "#FFE9B0", size: 0.12, speed: 20, arc: 0, hit: 0.9, beam: 0, lightning: false, ring: 0 };
  private static readonly STYLES: Record<string, Partial<WarEffectStyle>> = {
    shieldbearer: { color: "#FFE9B0", size: 0, hit: 0.9 },
    archer: { projectile: true, color: "#FFF27A", size: 0.11, speed: 30, arc: 0.4, hit: 0.55 },
    guardknight: { color: "#FFD070", size: 0, hit: 1.4 },
    artillerytruck: { projectile: true, color: "#FF9A3C", size: 0.4, speed: 15, arc: 3.2, hit: 3.2, ring: 2.5 },
    striker: { projectile: true, color: "#FFE066", size: 0.16, speed: 48, arc: 0, hit: 0.9 },
    executioner: { projectile: true, color: "#FF7A2E", size: 0.5, speed: 38, arc: 0, hit: 2.6, ring: 0 },
    minion: { color: "#E8E8D0", size: 0, hit: 0.75 },
    dropminion: { color: "#E8E8D0", size: 0, hit: 0.75 },
    skelwarrior: { color: "#E8E8D0", size: 0, hit: 0.9 },
    skelarcher: { projectile: true, color: "#C8FFB0", size: 0.11, speed: 30, arc: 0.4, hit: 0.55 },
    bonegiant: { color: "#D8C8A0", size: 0, hit: 2.1, ring: 2.5 },
    stormwitch: { color: "#C9B8FF", size: 0, hit: 1.6, lightning: true, ring: 3 },
    cursedeye: { color: "#FF3B6B", size: 0, hit: 1.5, beam: 0.16 },
  };

  static of(unitId: string): WarEffectStyle {
    return { ...WarEffectStyles.DEFAULT, ...(WarEffectStyles.STYLES[unitId] ?? {}) };
  }
}

interface WarShot { mesh: Three<"Mesh">; active: boolean; from: WarScenePoint; to: WarScenePoint; fromY: number; toY: number; age: number; duration: number; arc: number; style: WarEffectStyle }
interface WarBurst { mesh: Three<"Mesh">; active: boolean; age: number; life: number; size: number }
interface WarRing { ring: Three<"Mesh">; disc: Three<"Mesh">; active: boolean; age: number; life: number; radius: number }
interface WarBeam { mesh: Three<"Mesh">; active: boolean; age: number; life: number }
interface WarBolt { lines: Three<"Line">[]; active: boolean; age: number; life: number }

class WarEffects {
  private static readonly POOL = 90;
  private static readonly BURST_LIFE = 0.3;
  private static readonly RING_POOL = 10;
  private static readonly BEAM_POOL = 10;
  private static readonly BOLT_POOL = 8;
  private static readonly BOLT_POINTS = 9;
  private static readonly SKY = 18;

  readonly group: Three<"Group">;
  private readonly shots: WarShot[] = [];
  private readonly bursts: WarBurst[] = [];
  private readonly rings: WarRing[] = [];
  private readonly beams: WarBeam[] = [];
  private readonly bolts: WarBolt[] = [];

  constructor(private readonly libs: ThreeLibs, private readonly transform: WarViewTransform, private readonly isVisible: (x: number, y: number) => boolean) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    const shotGeometry = new THREE.SphereGeometry(1, 8, 6);
    const burstGeometry = new THREE.SphereGeometry(0.5, 10, 8);
    for (let i = 0; i < WarEffects.POOL; i++) {
      const shot = new THREE.Mesh(shotGeometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF" }));
      shot.visible = false;
      this.group.add(shot);
      this.shots.push({ mesh: shot, active: false, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, fromY: 1.5, toY: 1.1, age: 0, duration: 1, arc: 0, style: WarEffectStyles.of("") });
      const burst = new THREE.Mesh(burstGeometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.9, depthWrite: false }));
      burst.visible = false;
      this.group.add(burst);
      this.bursts.push({ mesh: burst, active: false, age: 0, life: 1, size: 1 });
    }
    this.buildRings();
    this.buildBeams();
    this.buildBolts();
  }

  private buildRings(): void {
    const THREE = this.libs.THREE;
    const ringGeometry = new THREE.RingGeometry(0.82, 1, 40);
    const discGeometry = new THREE.CircleGeometry(1, 40);
    for (let i = 0; i < WarEffects.RING_POOL; i++) {
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      const disc = new THREE.Mesh(discGeometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
      for (const mesh of [ring, disc]) {
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.16;
        mesh.visible = false;
        this.group.add(mesh);
      }
      this.rings.push({ ring, disc, active: false, age: 0, life: 0.55, radius: 1 });
    }
  }

  private buildBeams(): void {
    const THREE = this.libs.THREE;
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 8);
    geometry.rotateX(Math.PI / 2);
    for (let i = 0; i < WarEffects.BEAM_POOL; i++) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.95, depthWrite: false }));
      mesh.visible = false;
      this.group.add(mesh);
      this.beams.push({ mesh, active: false, age: 0, life: 0.22 });
    }
  }

  private buildBolts(): void {
    const THREE = this.libs.THREE;
    for (let i = 0; i < WarEffects.BOLT_POOL; i++) {
      const lines: Three<"Line">[] = [];
      for (let k = 0; k < 3; k++) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(WarEffects.BOLT_POINTS * 3), 3));
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 1 }));
        line.frustumCulled = false;
        line.visible = false;
        this.group.add(line);
        lines.push(line);
      }
      this.bolts.push({ lines, active: false, age: 0, life: 0.3 });
    }
  }

  private static heightOf(air: boolean | undefined, ground: number): number {
    return air ? WarFlight.ALTITUDE : ground;
  }

  handle(event: WarEvent): void {
    if (event.x === undefined || event.y === undefined) return;
    if (event.kind === "strike" && event.tx !== undefined && event.ty !== undefined) {
      if (!this.isVisible(event.x, event.y) && !this.isVisible(event.tx, event.ty)) return;
      this.strike(WarEffectStyles.of(event.text), this.transform.toScene({ x: event.x, y: event.y }), this.transform.toScene({ x: event.tx, y: event.ty }), WarEffects.heightOf(event.air, 1.5), WarEffects.heightOf(event.toAir, 1.1));
    } else if (event.kind === "splash") {
      if (this.isVisible(event.x, event.y)) this.burst(this.transform.toScene({ x: event.x, y: event.y }), "#FFD27A", 1.4, 0.4, WarEffects.heightOf(event.toAir, 1.1));
    } else if (event.kind === "unitDied" && this.isVisible(event.x, event.y)) {
      const air = event.air === true;
      this.burst(this.transform.toScene({ x: event.x, y: event.y }), air ? "#FF9A5A" : "#B9B2A6", air ? 3.2 : 1.6, air ? 0.8 : 0.5, WarEffects.heightOf(air, 0.8));
    } else if (event.kind === "buildingDestroyed") {
      const at = this.transform.toScene({ x: event.x, y: event.y });
      this.burst(at, "#FF8A3C", 6, 0.9, 1.5);
      this.burst(at, "#FFE08A", 3.4, 0.6, 2);
    } else if (event.kind === "revived" || event.kind === "raised") {
      if (this.isVisible(event.x, event.y)) this.burst(this.transform.toScene({ x: event.x, y: event.y }), "#9CFF9A", 2.2, 0.7, WarEffects.heightOf(event.air, 0.2));
    }
  }

  update(deltaSeconds: number): void {
    for (const shot of this.shots) {
      if (!shot.active) continue;
      shot.age += deltaSeconds;
      const t = Math.min(1, shot.age / shot.duration);
      const x = shot.from.x + (shot.to.x - shot.from.x) * t;
      const z = shot.from.z + (shot.to.z - shot.from.z) * t;
      const y = shot.fromY + (shot.toY - shot.fromY) * t + shot.arc * 4 * t * (1 - t);
      shot.mesh.position.set(x, y, z);
      shot.mesh.lookAt(shot.to.x, shot.toY, shot.to.z);
      if (t >= 1) {
        shot.active = false;
        shot.mesh.visible = false;
        this.burst(shot.to, shot.style.color, shot.style.hit, WarEffects.BURST_LIFE, shot.toY);
        if (shot.style.ring > 0) this.ring(shot.to, shot.style.color, shot.style.ring);
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
    this.updateRings(deltaSeconds);
    this.updateBeams(deltaSeconds);
    this.updateBolts(deltaSeconds);
  }

  private updateRings(deltaSeconds: number): void {
    for (const entry of this.rings) {
      if (!entry.active) continue;
      entry.age += deltaSeconds;
      const t = entry.age / entry.life;
      if (t >= 1) {
        entry.active = false;
        entry.ring.visible = false;
        entry.disc.visible = false;
        continue;
      }
      const grow = 0.25 + 0.75 * (1 - (1 - t) * (1 - t));
      entry.ring.scale.setScalar(entry.radius * grow);
      entry.disc.scale.setScalar(entry.radius * grow);
      (entry.ring.material as Three<"MeshBasicMaterial">).opacity = 0.9 * (1 - t);
      (entry.disc.material as Three<"MeshBasicMaterial">).opacity = 0.42 * (1 - t);
    }
  }

  private updateBeams(deltaSeconds: number): void {
    for (const beam of this.beams) {
      if (!beam.active) continue;
      beam.age += deltaSeconds;
      const t = beam.age / beam.life;
      if (t >= 1) {
        beam.active = false;
        beam.mesh.visible = false;
        continue;
      }
      (beam.mesh.material as Three<"MeshBasicMaterial">).opacity = 0.95 * (1 - t);
    }
  }

  private updateBolts(deltaSeconds: number): void {
    for (const bolt of this.bolts) {
      if (!bolt.active) continue;
      bolt.age += deltaSeconds;
      const t = bolt.age / bolt.life;
      if (t >= 1) {
        bolt.active = false;
        bolt.lines.forEach((line) => { line.visible = false; });
        continue;
      }
      bolt.lines.forEach((line) => { (line.material as Three<"LineBasicMaterial">).opacity = 1 - t; });
    }
  }

  private strike(style: WarEffectStyle, from: WarScenePoint, to: WarScenePoint, fromY: number, toY: number): void {
    if (style.lightning) {
      this.lightning(to, toY, style.color);
      this.ring(to, style.color, style.ring);
      this.burst(to, style.color, style.hit, WarEffects.BURST_LIFE, toY);
      return;
    }
    if (style.beam > 0) {
      this.beam(from, fromY, to, toY, style.color, style.beam);
      this.burst(to, style.color, style.hit, WarEffects.BURST_LIFE, toY);
      return;
    }
    if (!style.projectile) {
      this.burst(to, style.color, style.hit, WarEffects.BURST_LIFE, toY);
      if (style.ring > 0) this.ring(to, style.color, style.ring);
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
    shot.fromY = fromY;
    shot.toY = toY;
    shot.arc = style.arc;
    shot.style = style;
    (shot.mesh.material as Three<"MeshBasicMaterial">).color.set(style.color);
    shot.mesh.scale.set(style.size, style.size, style.size * (style.arc > 1 ? 1 : 3.2));
    shot.mesh.position.set(from.x, fromY, from.z);
    shot.mesh.visible = true;
  }

  private ring(at: WarScenePoint, color: string, radius: number): void {
    const entry = this.rings.find((candidate) => !candidate.active);
    if (!entry) return;
    entry.active = true;
    entry.age = 0;
    entry.radius = radius;
    for (const mesh of [entry.ring, entry.disc]) {
      (mesh.material as Three<"MeshBasicMaterial">).color.set(color);
      mesh.position.set(at.x, 0.16, at.z);
      mesh.scale.setScalar(radius * 0.25);
      mesh.visible = true;
    }
  }

  private beam(from: WarScenePoint, fromY: number, to: WarScenePoint, toY: number, color: string, width: number): void {
    const beam = this.beams.find((candidate) => !candidate.active);
    if (!beam) return;
    const THREE = this.libs.THREE;
    const start = new THREE.Vector3(from.x, fromY, from.z);
    const end = new THREE.Vector3(to.x, toY, to.z);
    beam.active = true;
    beam.age = 0;
    beam.mesh.position.copy(start).add(end).multiplyScalar(0.5);
    beam.mesh.lookAt(end);
    beam.mesh.scale.set(width, width, start.distanceTo(end));
    (beam.mesh.material as Three<"MeshBasicMaterial">).color.set(color);
    beam.mesh.visible = true;
  }

  private lightning(at: WarScenePoint, toY: number, color: string): void {
    const bolt = this.bolts.find((candidate) => !candidate.active);
    if (!bolt) return;
    bolt.active = true;
    bolt.age = 0;
    bolt.lines.forEach((line, k) => {
      const position = (line.geometry.getAttribute("position") as Three<"BufferAttribute">);
      const spread = k === 0 ? 0 : 0.18;
      for (let i = 0; i < WarEffects.BOLT_POINTS; i++) {
        const t = i / (WarEffects.BOLT_POINTS - 1);
        const jitter = i === 0 || i === WarEffects.BOLT_POINTS - 1 ? 0 : 0.9;
        position.setXYZ(i, at.x + (Math.random() - 0.5) * jitter + (k - 1) * spread, WarEffects.SKY + (toY - WarEffects.SKY) * t, at.z + (Math.random() - 0.5) * jitter);
      }
      position.needsUpdate = true;
      (line.material as Three<"LineBasicMaterial">).color.set(k === 0 ? "#FFFFFF" : color);
      line.visible = true;
    });
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
  private readonly dying: WarUnitView[] = [];
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

  groundWorld(clientX: number, clientY: number): WarPoint | null {
    const hit = this.world.groundPoint(clientX, clientY);
    return hit ? this.transform.sceneToWorld(hit.x, hit.z) : null;
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
      const flightHeight = isUnit ? (this.units.get(entity.id)?.altitude ?? 0) : 0;
      vector.set(scene.x, (isUnit ? 1 : 1.6) + flightHeight, scene.z).project(camera);
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
    this.retireUnits(alive);
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
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const view = this.dying[i];
      view.render(alpha, deltaSeconds, camera.quaternion);
      if (!view.finishedDying) continue;
      this.root.remove(view.group);
      this.dying.splice(i, 1);
    }
    for (const crowd of this.crowds) {
      const team = crowd === this.crowds[0] ? 0 : 1;
      const economy = this.engine.players[team].economy;
      crowd.update(economy.oreWorkers, economy.crystalWorkers, this.seconds, focus);
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

  private retireUnits(alive: Set<number>): void {
    for (const id of Array.from(this.units.keys())) {
      if (alive.has(id)) continue;
      const view = this.units.get(id) as WarUnitView;
      this.units.delete(id);
      if (view.group.visible) {
        view.beginDeath();
        this.dying.push(view);
      } else {
        this.root.remove(view.group);
      }
    }
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
    ["barracks", "factory", "airport", "barracks"].forEach((type, i) => {
      engine.build(0, [0, 2, 4, 1][i], type as WarBuildingType);
    });
    const hq = player.hq as WarBuilding;
    const buildings: WarBuilding[] = [hq, ...player.buildings().filter((b) => b !== hq)];
    for (const building of buildings) {
      building.buildLeft = 0;
      const view = new WarBuildingView(this.libs, this.assets, materials, building, transform.toScene(building), true, "pioneer");
      view.onTick(building);
      this.root.add(view.group);
    }
    const roster = ["shieldbearer", "archer", "guardknight", "shieldbearer", "archer", "artillerytruck", "striker"];
    const post = WarMapData.post(0, 1);
    roster.forEach((id, i) => {
      const def = WarUnitCatalog.byId(id);
      const unit = new WarUnit(100 + i, 0, post.x + (i - 3) * 260, post.y - (def.kind === "ranged" ? -300 : 150) , def);
      const view = new WarUnitView(this.libs, this.assets, materials, unit, transform.toScene(unit), true);
      view.onTick(unit, transform.toScene(unit), { x: 0, z: -40 }, WarPalette.SQUAD_COLORS[i % 4]);
      view.onTick(unit, transform.toScene(unit), { x: 0, z: -40 }, null);
      this.units.push(view);
      this.root.add(view.group);
    });
  }
}
