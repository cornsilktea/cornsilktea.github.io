type FrAvatarClip = "idle" | "run" | "walk" | "chop" | "pickaxe" | "dig" | "work" | "sleep";

class FrToolClips {
  static readonly FILE = "assets/kaykit/animations/rig_medium_tools.glb";
  readonly clips = new Map<string, Three<"AnimationClip">>();
  constructor(private readonly libs: ThreeLibs) {}
  async load(): Promise<void> {
    const gltf = await new this.libs.GLTFLoader().loadAsync(FrToolClips.FILE);
    gltf.animations.forEach((clip) => this.clips.set(clip.name, clip));
  }
}

class FrAvatar {
  private static readonly CLIP_NAMES: Readonly<Record<FrAvatarClip, string>> = {
    idle: "Idle_A", run: "Running_A", walk: "Walking_A", chop: "Chopping", pickaxe: "Pickaxing", dig: "Digging", work: "Working_A", sleep: "Death_A_Pose",
  };
  static readonly SCALE_UP = 2;
  readonly group: Three<"Group">;
  private readonly mixer: Three<"AnimationMixer">;
  private readonly actions = new Map<FrAvatarClip, Three<"AnimationAction">>();
  private current: FrAvatarClip | null = null;

  constructor(private readonly libs: ThreeLibs, model: Three<"Object3D">, clips: Map<string, Three<"AnimationClip">>) {
    this.group = new libs.THREE.Group();
    this.group.add(model);
    this.group.scale.setScalar(FrAvatar.SCALE_UP);
    this.mixer = new libs.THREE.AnimationMixer(model);
    (Object.keys(FrAvatar.CLIP_NAMES) as FrAvatarClip[]).forEach((key) => {
      const clip = clips.get(FrAvatar.CLIP_NAMES[key]);
      if (clip) this.actions.set(key, this.mixer.clipAction(clip));
    });
    this.play("idle");
  }

  play(name: FrAvatarClip): void {
    if (this.current === name) return;
    const next = this.actions.get(name);
    if (!next) return;
    const previous = this.current ? this.actions.get(this.current) : undefined;
    next.reset().fadeIn(0.15).play();
    if (previous) previous.fadeOut(0.15);
    this.current = name;
  }

  update(dt: number): void { this.mixer.update(dt); }
}

class FrSky {
  private static readonly DAY_SKY: [number, number, number] = [0.56, 0.78, 0.95];
  private static readonly NIGHT_SKY: [number, number, number] = [0.03, 0.06, 0.15];
  private static readonly DUSK_SKY: [number, number, number] = [0.96, 0.58, 0.38];

  constructor(private readonly libs: ThreeLibs, private readonly scene: Three<"Scene">, readonly hemi: Three<"HemisphereLight">, readonly sun: Three<"DirectionalLight">) {}

  apply(minuteOfDay: number): number {
    const dayAmount = FrSky.dayAmount(minuteOfDay);
    const twilight = Math.max(0, 1 - Math.abs(minuteOfDay - FrBalance.DAWN_MINUTE) / 70, 1 - Math.abs(minuteOfDay - FrBalance.DUSK_MINUTE) / 70);
    const sky = FrSky.DAY_SKY.map((day, i) => FrSky.NIGHT_SKY[i] + (day - FrSky.NIGHT_SKY[i]) * dayAmount);
    const tinted = sky.map((v, i) => v + (FrSky.DUSK_SKY[i] - v) * twilight * 0.55);
    (this.scene.background as Three<"Color">).setRGB(tinted[0], tinted[1], tinted[2]);
    if (this.scene.fog) (this.scene.fog as Three<"Fog">).color.setRGB(tinted[0], tinted[1], tinted[2]);
    this.hemi.intensity = 0.45 + 0.75 * dayAmount;
    this.sun.intensity = 0.15 + 1.25 * dayAmount;
    this.sun.color.setRGB(1, 0.92 - 0.25 * twilight, 0.82 - 0.32 * twilight);
    this.hemi.color.setRGB(0.82 + 0.18 * dayAmount, 0.9 + 0.1 * dayAmount, 1);
    return 1 - dayAmount;
  }

  static dayAmount(minuteOfDay: number): number {
    const t = (minuteOfDay - FrBalance.DAWN_MINUTE) / (FrBalance.DUSK_MINUTE - FrBalance.DAWN_MINUTE);
    if (t < 0 || t > 1) return 0;
    return Math.max(0, Math.min(1, Math.sin(t * Math.PI) * 2.2));
  }
}

class FrTreeLayer {
  private readonly trunks: Three<"InstancedMesh">;
  private readonly crowns: Three<"InstancedMesh">;
  private readonly slots = new Map<number, number>();
  private readonly spots: FrTreeSpot[] = [];
  private static readonly GHOST_LIMIT = 48;
  private static readonly GHOST_RADIUS = 3;
  private readonly ghosts: Three<"InstancedMesh">;
  private ghosted: number[] = [];
  private readonly matrices = new Map<number, Three<"Matrix4">>();

  constructor(private readonly libs: ThreeLibs, private readonly world: FrWorld, readonly group: Three<"Group">) {
    const T = libs.THREE;
    const trunkGeometry = new T.BoxGeometry(0.55, 2.6, 0.55).translate(0, 1.3, 0);
    const crownGeometry = new T.IcosahedronGeometry(1.55, 0).scale(1, 0.92, 1).translate(0, 3.5, 0);
    const spots = Array.from(world.trees.values());
    this.trunks = new T.InstancedMesh(trunkGeometry, new T.MeshLambertMaterial({ color: 0x7a5230 }), spots.length);
    this.crowns = new T.InstancedMesh(crownGeometry, new T.MeshLambertMaterial({ color: 0xffffff }), spots.length);
    this.trunks.frustumCulled = false;
    this.crowns.frustumCulled = false;
    const matrix = new T.Matrix4();
    const color = new T.Color();
    spots.forEach((spot, slot) => {
      this.spots.push(spot);
      this.slots.set(world.terrain.index(spot.x, spot.z), slot);
      const jitterX = (FrTreeField.hash(spot.x, spot.z, 22) - 0.5) * 0.8, jitterZ = (FrTreeField.hash(spot.x, spot.z, 23) - 0.5) * 0.8;
      const scale = 0.85 + FrTreeField.hash(spot.x, spot.z, 24) * 0.4 + (spot.zone >= 0 ? 0.1 : 0);
      matrix.compose(
        new T.Vector3((spot.x + 0.5) * FrTerrainData.BLOCK + jitterX, world.terrain.surfaceY(spot.x, spot.z), (spot.z + 0.5) * FrTerrainData.BLOCK + jitterZ),
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), FrTreeField.hash(spot.x, spot.z, 25) * 6.28),
        new T.Vector3(scale, scale, scale)
      );
      this.trunks.setMatrixAt(slot, matrix);
      this.crowns.setMatrixAt(slot, matrix);
      this.matrices.set(slot, matrix.clone());
      color.setHSL(0.30 + FrTreeField.hash(spot.x, spot.z, 26) * 0.06, 0.5, 0.26 + FrTreeField.hash(spot.x, spot.z, 27) * 0.1);
      this.crowns.setColorAt(slot, color);
      if (world.isFelled(world.terrain.index(spot.x, spot.z))) this.hide(slot);
    });
    this.ghosts = new T.InstancedMesh(crownGeometry, new T.MeshLambertMaterial({ color: 0x3f7a3a, transparent: true, opacity: 0.32, depthWrite: false }), FrTreeLayer.GHOST_LIMIT);
    this.ghosts.count = 0;
    this.ghosts.frustumCulled = false;
    group.add(this.trunks, this.crowns, this.ghosts);
  }

  fadeAround(cellX: number, cellZ: number): void {
    const wanted: number[] = [];
    for (let dz = -1; dz <= FrTreeLayer.GHOST_RADIUS; dz++) {
      for (let dx = -FrTreeLayer.GHOST_RADIUS; dx <= FrTreeLayer.GHOST_RADIUS; dx++) {
        const slot = this.slots.get(this.world.terrain.index(cellX + dx, cellZ + dz));
        if (slot !== undefined && !this.world.isFelled(this.world.terrain.index(cellX + dx, cellZ + dz)) && wanted.length < FrTreeLayer.GHOST_LIMIT) wanted.push(slot);
      }
    }
    if (wanted.length === this.ghosted.length && wanted.every((slot, i) => slot === this.ghosted[i])) return;
    this.ghosted.forEach((slot) => { const m = this.matrices.get(slot); if (m) this.crowns.setMatrixAt(slot, m); });
    wanted.forEach((slot, i) => {
      const m = this.matrices.get(slot) as Three<"Matrix4">;
      this.ghosts.setMatrixAt(i, m);
      this.crowns.setMatrixAt(slot, new this.libs.THREE.Matrix4().makeScale(0, 0, 0));
    });
    this.ghosts.count = wanted.length;
    this.ghosted = wanted;
    this.ghosts.instanceMatrix.needsUpdate = true;
    this.crowns.instanceMatrix.needsUpdate = true;
  }

  private hide(slot: number): void {
    const empty = new this.libs.THREE.Matrix4().makeScale(0, 0, 0);
    this.trunks.setMatrixAt(slot, empty);
    this.crowns.setMatrixAt(slot, empty);
    this.trunks.instanceMatrix.needsUpdate = true;
    this.crowns.instanceMatrix.needsUpdate = true;
  }

  remove(spot: FrTreeSpot): void {
    const slot = this.slots.get(this.world.terrain.index(spot.x, spot.z));
    if (slot === undefined) return;
    this.ghosted.forEach((g) => { const m = this.matrices.get(g); if (m) this.crowns.setMatrixAt(g, m); });
    this.ghosts.count = 0;
    this.ghosted = [];
    this.hide(slot);
  }
}

class FrProps {
  readonly campfireGlow: Three<"Mesh">;
  readonly flame: Three<"Mesh">;
  private chest: Three<"Object3D"> | null = null;
  private readonly siteMarkers = new Map<string, Three<"Group">>();

  constructor(private readonly libs: ThreeLibs, private readonly world: FrWorld, readonly group: Three<"Group">) {
    const T = libs.THREE;
    const a = world.terrain.anchors;
    const B = FrTerrainData.BLOCK;
    const campfire = new T.Group();
    campfire.position.set((a.campfire.x + 0.5) * B, world.terrain.surfaceY(a.campfire.x, a.campfire.z), (a.campfire.z + 0.5) * B);
    const logMaterial = new T.MeshLambertMaterial({ color: 0x6b4423 });
    for (let i = 0; i < 4; i++) {
      const log = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 1.3, 6), logMaterial);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i * Math.PI) / 4;
      log.position.y = 0.15;
      campfire.add(log);
    }
    this.flame = new T.Mesh(new T.ConeGeometry(0.4, 1.1, 6), new T.MeshBasicMaterial({ color: 0xffa530 }));
    this.flame.position.y = 0.8;
    const core = new T.Mesh(new T.ConeGeometry(0.2, 0.7, 6), new T.MeshBasicMaterial({ color: 0xfff0a0 }));
    core.position.y = 0.65;
    this.campfireGlow = new T.Mesh(new T.CircleGeometry(4.2, 24), new T.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.12, depthWrite: false }));
    this.campfireGlow.rotation.x = -Math.PI / 2;
    this.campfireGlow.position.y = 0.06;
    campfire.add(this.flame, core, this.campfireGlow);
    group.add(campfire);
    this.buildChestPlaceholder();
    FrBuildSites.STAGE_TWO.forEach((site) => this.addSiteMarker(site));
  }

  private buildChestPlaceholder(): void {
    const T = this.libs.THREE;
    const a = this.world.terrain.anchors.publicChest;
    const B = FrTerrainData.BLOCK;
    const holder = new T.Group();
    holder.position.set((a.x + 1) * B, this.world.terrain.surfaceY(a.x, a.z), (a.z + 1) * B);
    const box = new T.Mesh(new T.BoxGeometry(3.8, 2.2, 2.6), new T.MeshLambertMaterial({ color: 0x9a6a38 }));
    box.position.y = 1.1;
    const lid = new T.Mesh(new T.BoxGeometry(3.9, 0.5, 2.7), new T.MeshLambertMaterial({ color: 0x7a4f27 }));
    lid.position.y = 2.35;
    const band = new T.Mesh(new T.BoxGeometry(0.4, 2.8, 2.8), new T.MeshLambertMaterial({ color: 0xd6b34a }));
    band.position.y = 1.3;
    holder.add(box, lid, band);
    this.group.add(holder);
    this.chest = holder;
  }

  private addSiteMarker(site: FrBuildSite): void {
    const T = this.libs.THREE;
    const marker = new T.Group();
    marker.position.set((site.x + 0.5) * FrTerrainData.BLOCK, this.world.terrain.surfaceY(site.x, site.z), (site.z + 0.5) * FrTerrainData.BLOCK);
    const post = new T.Mesh(new T.BoxGeometry(0.25, 2.2, 0.25), new T.MeshLambertMaterial({ color: 0x8a5a2b }));
    post.position.y = 1.1;
    const sign = new T.Mesh(new T.BoxGeometry(1.6, 0.9, 0.12), new T.MeshLambertMaterial({ color: 0xe7c98a }));
    sign.position.y = 2.1;
    marker.add(post, sign);
    this.group.add(marker);
    this.siteMarkers.set(site.id, marker);
    if (this.world.village.builtCount(site.id) > 0) this.showBuilt(site);
  }

  showBuilt(site: FrBuildSite): void {
    const T = this.libs.THREE;
    const marker = this.siteMarkers.get(site.id);
    if (!marker) return;
    marker.clear();
    const top = new T.Mesh(new T.BoxGeometry(3.2, 0.35, 1.8), new T.MeshLambertMaterial({ color: 0xb98a52 }));
    top.position.y = 1.7;
    [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]].forEach(([dx, dz]) => {
      const leg = new T.Mesh(new T.BoxGeometry(0.3, 1.6, 0.3), new T.MeshLambertMaterial({ color: 0x8a5a2b }));
      leg.position.set(dx, 0.8, dz);
      marker.add(leg);
    });
    const saw = new T.Mesh(new T.BoxGeometry(1.2, 0.12, 0.35), new T.MeshLambertMaterial({ color: 0xc9ced6 }));
    saw.position.set(0.3, 1.95, 0);
    marker.add(top, saw);
  }

  flicker(time: number, night: number): void {
    const s = 1 + Math.sin(time * 11) * 0.12 + Math.sin(time * 7.3) * 0.08;
    this.flame.scale.set(s, 0.9 + (s - 1) * 1.6, s);
    (this.campfireGlow.material as Three<"MeshBasicMaterial">).opacity = (0.1 + 0.45 * night) * (0.9 + 0.1 * s);
  }
}

class FrCameraRig {
  static readonly OFFSET_Y = 38;
  static readonly OFFSET_Z = 28;
  readonly camera: Three<"PerspectiveCamera">;
  private readonly focus: Three<"Vector3">;

  constructor(private readonly libs: ThreeLibs) {
    this.camera = new libs.THREE.PerspectiveCamera(42, 1, 0.5, 500);
    this.focus = new libs.THREE.Vector3();
  }

  follow(target: Three<"Vector3">, dt: number): void {
    const k = Math.min(1, dt * 6);
    this.focus.lerp(target, k);
    this.camera.position.set(this.focus.x, this.focus.y + FrCameraRig.OFFSET_Y, this.focus.z + FrCameraRig.OFFSET_Z);
    this.camera.lookAt(this.focus.x, this.focus.y + 2.5, this.focus.z);
  }

  snap(target: Three<"Vector3">): void { this.focus.copy(target); this.follow(target, 1); }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.fov = this.camera.aspect < 1 ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }
}

class FrWorldView implements FrWorldListener {
  static readonly MAX_PIXEL_RATIO_TOUCH = 1.5;
  static readonly MAX_PIXEL_RATIO_DESKTOP = 2;

  readonly renderer: Three<"WebGLRenderer">;
  readonly scene: Three<"Scene">;
  readonly rig: FrCameraRig;
  readonly sky: FrSky;
  readonly marker: Three<"Mesh">;
  props!: FrProps;
  private world!: FrWorld;
  private mesher!: FrTerrainMesher;
  private readonly chunks = new Map<string, Three<"Mesh">>();
  private trees!: FrTreeLayer;
  private readonly terrainGroup: Three<"Group">;
  private readonly terrainMaterial: Three<"MeshLambertMaterial">;
  private readonly treeGroup: Three<"Group">;
  private readonly propGroup: Three<"Group">;
  private readonly water: Three<"Mesh">;
  private governor: QualityGovernorHandle | null = null;
  private pixelRatioCap: number;
  private avatar: FrAvatar | null = null;
  private night = 0;

  constructor(private readonly libs: ThreeLibs, readonly canvas: HTMLCanvasElement, world: FrWorld, private readonly touchDevice: boolean) {
    const T = libs.THREE;
    this.pixelRatioCap = touchDevice ? FrWorldView.MAX_PIXEL_RATIO_TOUCH : FrWorldView.MAX_PIXEL_RATIO_DESKTOP;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x8fc7f2);
    this.scene.fog = new T.Fog(0x8fc7f2, 90, 200);
    const hemi = new T.HemisphereLight(0xffffff, 0x6a5a45, 1);
    const sun = new T.DirectionalLight(0xffffff, 1.3);
    sun.position.set(-40, 90, 30);
    this.scene.add(hemi, sun);
    this.sky = new FrSky(libs, this.scene, hemi, sun);
    this.rig = new FrCameraRig(libs);
    this.terrainGroup = new T.Group();
    this.scene.add(this.terrainGroup);
    this.terrainMaterial = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
    this.water = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshLambertMaterial({ color: 0x3f86d0, transparent: true, opacity: 0.78, depthWrite: false }));
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);
    this.treeGroup = new T.Group();
    this.propGroup = new T.Group();
    this.scene.add(this.treeGroup, this.propGroup);
    this.marker = new T.Mesh(new T.BoxGeometry(FrTerrainData.BLOCK, 0.18, FrTerrainData.BLOCK), new T.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.55, depthWrite: false }));
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.useWorld(world);
    const steps = [() => this.lowerPixelRatio()];
    this.governor = window.QualityGovernor ? window.QualityGovernor({ steps, storageKey: "dongmaforest_quality_v1", isPlaying: () => true, slowSec: 0.022, slowLimit: 90 }) : null;
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  terrainData(): FrTerrainData { return this.world.terrain; }

  useWorld(world: FrWorld): void {
    this.world = world;
    this.chunks.forEach((mesh) => { this.terrainGroup.remove(mesh); mesh.geometry.dispose(); });
    this.chunks.clear();
    this.mesher = new FrTerrainMesher(this.libs, world.terrain, this.terrainMaterial);
    const counts = this.mesher.chunkCount();
    for (let cz = 0; cz < counts.z; cz++) for (let cx = 0; cx < counts.x; cx++) this.rebuildChunk(cx, cz);
    const size = world.terrain.w * FrTerrainData.BLOCK;
    this.water.scale.set(size * 3, size * 3, 1);
    this.water.position.set(size / 2, -0.9, size / 2);
    this.treeGroup.clear();
    this.propGroup.clear();
    this.trees = new FrTreeLayer(this.libs, world, this.treeGroup);
    this.props = new FrProps(this.libs, world, this.propGroup);
    world.listen(this);
  }

  private lowerPixelRatio(): boolean {
    if (this.pixelRatioCap <= 1) return false;
    this.pixelRatioCap = Math.max(1, this.pixelRatioCap - 0.25);
    this.resize();
    return true;
  }

  private rebuildChunk(cx: number, cz: number): void {
    const key = cx + "_" + cz;
    const old = this.chunks.get(key);
    if (old) { this.terrainGroup.remove(old); old.geometry.dispose(); this.chunks.delete(key); }
    const mesh = this.mesher.build(cx, cz);
    if (!mesh) return;
    this.chunks.set(key, mesh);
    this.terrainGroup.add(mesh);
  }

  onTreeFelled(spot: FrTreeSpot): void { this.trees.remove(spot); }
  onBuilt(id: string): void { const site = FrBuildSites.find(id); if (site) this.props.showBuilt(site); }
  onPublicChanged(): void { return; }

  onTerrainEdited(x: number, z: number): void {
    const cx = Math.floor(x / FrTerrainMesher.CHUNK), cz = Math.floor(z / FrTerrainMesher.CHUNK);
    this.rebuildChunk(cx, cz);
    if (x % FrTerrainMesher.CHUNK === 0) this.rebuildChunk(cx - 1, cz);
    if (x % FrTerrainMesher.CHUNK === FrTerrainMesher.CHUNK - 1) this.rebuildChunk(cx + 1, cz);
    if (z % FrTerrainMesher.CHUNK === 0) this.rebuildChunk(cx, cz - 1);
    if (z % FrTerrainMesher.CHUNK === FrTerrainMesher.CHUNK - 1) this.rebuildChunk(cx, cz + 1);
  }

  attachAvatar(avatar: FrAvatar): void {
    this.avatar = avatar;
    this.scene.add(avatar.group);
  }

  setMarker(cell: FrPoint | null): void {
    if (!cell) { this.marker.visible = false; return; }
    this.marker.visible = true;
    this.marker.position.set((cell.x + 0.5) * FrTerrainData.BLOCK, this.world.terrain.surfaceY(cell.x, cell.z) + 0.12, (cell.z + 0.5) * FrTerrainData.BLOCK);
  }

  fadeTreesAround(cell: FrPoint): void { this.trees.fadeAround(cell.x, cell.z); }

  applyClock(minuteOfDay: number): void { this.night = this.sky.apply(minuteOfDay); }

  resize(): void {
    const width = window.innerWidth, height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
    this.renderer.setSize(width, height, false);
    this.rig.resize(width, height);
  }

  render(dt: number, time: number): void {
    if (this.avatar) this.avatar.update(dt);
    this.props.flicker(time, this.night);
    this.renderer.render(this.scene, this.rig.camera);
    if (this.governor) this.governor.update(dt);
  }
}

class FrRemoteAvatars {
  private readonly entries = new Map<string, { avatar: FrAvatar; label: Three<"Sprite">; look: string; lastX: number; lastZ: number }>();
  static readonly LABEL_HEIGHT = 2.4;
  static readonly MAX_EXTRAPOLATE = 3.2;

  constructor(private readonly libs: ThreeLibs, private readonly scene: Three<"Scene">, private readonly factory: CharacterModelFactory, private readonly clips: Map<string, Three<"AnimationClip">>, private readonly labels: RkLabelFactory, private readonly roster: FrRoster, private readonly selfUid: string) {}

  update(dt: number): void {
    const alive = new Set(this.roster.aliveUids().filter((uid) => uid !== this.selfUid && this.roster.poses.has(uid) && this.roster.members.has(uid) && !(this.roster.members.get(uid) as FrMember).adm));
    this.entries.forEach((entry, uid) => { if (!alive.has(uid)) this.drop(uid, entry); });
    alive.forEach((uid) => this.show(uid, dt));
  }

  private drop(uid: string, entry: { avatar: FrAvatar }): void {
    this.scene.remove(entry.avatar.group);
    this.factory.disposeModel(entry.avatar.group);
    this.entries.delete(uid);
  }

  private show(uid: string, dt: number): void {
    const member = this.roster.members.get(uid) as FrMember;
    const pose = this.roster.poses.get(uid) as FrRemotePose;
    const lookKey = JSON.stringify(member.look);
    let entry = this.entries.get(uid);
    if (entry && entry.look !== lookKey) { this.drop(uid, entry); entry = undefined; }
    if (!entry) {
      const model = this.factory.build(CharacterLooks.clean(member.look));
      const avatar = new FrAvatar(this.libs, model, this.clips);
      const label = this.labels.create(member.name, "#FFFFFF");
      label.scale.set(1.4, 0.35, 1);
      label.position.y = FrRemoteAvatars.LABEL_HEIGHT;
      avatar.group.add(label);
      avatar.group.position.set(pose.x, pose.y, pose.z);
      this.scene.add(avatar.group);
      entry = { avatar, label, look: lookKey, lastX: pose.x, lastZ: pose.z };
      this.entries.set(uid, entry);
    }
    const group = entry.avatar.group;
    const k = Math.min(1, dt * 9);
    const elapsed = Math.min(FrRemoteAvatars.MAX_EXTRAPOLATE, (Date.now() - pose.at) / 1000);
    group.position.x += (pose.x + pose.vx * elapsed - group.position.x) * k;
    group.position.z += (pose.z + pose.vz * elapsed - group.position.z) * k;
    group.position.y += (pose.y - group.position.y) * k;
    let turn = pose.dir - group.rotation.y;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    group.rotation.y += turn * k;
    entry.avatar.play(FrWire.ANIMS[pose.anim] as FrAvatarClip || "idle");
    entry.avatar.update(dt);
  }
}
