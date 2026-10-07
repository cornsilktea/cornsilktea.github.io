type RdPropKey = "wall" | "doorway" | "floor" | "pillar" | "column" | "torch" | "banner" | "chest" | "dummy" | "rubble" | "barrel" | "box";

interface RdPose { x: number; z: number; yaw: number; moving: boolean; dash: boolean }
interface RdRosterEntry { slot: number; nick: string; look: CharacterLook; isMe: boolean; isBot: boolean }
interface RdModelPart { geometry: TileGeometry; material: Three<"Material">; matrix: Three<"Matrix4"> }
interface RdWallPiece { x: number; z: number; turn: number; kind: "wall" | "door" | "gate" | "open"; door: number; near: boolean }

class RdViewMath {
  static w(units: number): number {
    return RdUnits.toWorld(units);
  }

  static approachAngle(current: number, target: number, rate: number): number {
    return current + RdMath.angleDiff(target, current) * Math.min(1, rate);
  }
}

class RdModelLibrary {
  static readonly DIRECTORY = "assets/kaykit/";
  static readonly PROPS: Readonly<Record<RdPropKey, string>> = {
    wall: "dungeon/wall.gltf", doorway: "dungeon/wall_doorway.gltf", floor: "dungeon/floor_tile_large.gltf", pillar: "dungeon/pillar.gltf",
    column: "dungeon/column.gltf", torch: "dungeon/torch_lit.gltf", banner: "dungeon/banner_patternA_white.gltf", chest: "dungeon/chest.gltf",
    dummy: "raid/Dummy_Base.gltf", rubble: "dungeon/rubble_large.gltf", barrel: "dungeon/barrel_large.gltf", box: "dungeon/box_large.gltf"
  };
  static readonly SKELETONS: readonly string[] = ["Skeleton_Minion", "Skeleton_Warrior", "Skeleton_Rogue", "Skeleton_Mage"];

  private readonly templates = new Map<string, Three<"Object3D">>();

  constructor(private readonly libs: ThreeLibs) {}

  async load(): Promise<void> {
    const loader = new this.libs.GLTFLoader();
    const props = (Object.keys(RdModelLibrary.PROPS) as RdPropKey[]).map((key) =>
      loader.loadAsync(RdModelLibrary.DIRECTORY + RdModelLibrary.PROPS[key]).then((gltf) => {
        this.lambertize(gltf.scene);
        this.templates.set(key, gltf.scene);
      }).catch(() => undefined)
    );
    const skeletons = RdModelLibrary.SKELETONS.map((name) =>
      loader.loadAsync(RdModelLibrary.DIRECTORY + "characters/" + name + ".glb").then((gltf) => {
        this.lambertize(gltf.scene);
        this.templates.set(name, gltf.scene);
      })
    );
    await Promise.all([...props, ...skeletons]);
  }

  has(key: string): boolean {
    return this.templates.has(key);
  }

  clone(key: string): Three<"Object3D"> {
    const template = this.templates.get(key);
    if (!template) return new this.libs.THREE.Group();
    return this.libs.SkeletonUtils.clone(template);
  }

  parts(key: string): RdModelPart[] {
    const template = this.templates.get(key);
    if (!template) return [];
    template.updateMatrixWorld(true);
    const parts: RdModelPart[] = [];
    template.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      parts.push({ geometry: mesh.geometry as TileGeometry, material: mesh.material, matrix: mesh.matrixWorld.clone() });
    });
    return parts;
  }

  instanced(key: string, placements: readonly Three<"Matrix4">[], material: Three<"Material"> | null = null): Three<"Group"> {
    const THREE = this.libs.THREE;
    const group = new THREE.Group();
    if (!placements.length) return group;
    this.parts(key).forEach((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, material || part.material, placements.length);
      const combined = new THREE.Matrix4();
      placements.forEach((placement, index) => {
        combined.multiplyMatrices(placement, part.matrix);
        mesh.setMatrixAt(index, combined);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    });
    return group;
  }

  placement(x: number, y: number, z: number, turn: number, scaleX: number = 1, scaleY: number = 1, scaleZ: number = 1): Three<"Matrix4"> {
    const THREE = this.libs.THREE;
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0)), new THREE.Vector3(scaleX, scaleY, scaleZ));
  }

  private lambertize(scene: Three<"Object3D">): void {
    const THREE = this.libs.THREE;
    scene.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const source = mesh.material as Three<"MeshStandardMaterial">;
      mesh.material = new THREE.MeshLambertMaterial({ map: source.map, color: source.color, transparent: source.transparent, opacity: source.opacity });
    });
  }
}

class RdCameraRig {
  static readonly PITCH = (55 * Math.PI) / 180;
  static readonly MIN_DISTANCE = 19;
  static readonly MAX_DISTANCE = 34;

  readonly camera: Three<"PerspectiveCamera">;
  private focusX = 0;
  private focusZ = 6;
  private distance = 20;
  private ready = false;
  private shakeLeft = 0;
  private shakePower = 0;

  constructor(libs: ThreeLibs) {
    this.camera = new libs.THREE.PerspectiveCamera(42, 1, 0.5, 260);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 60 : 46;
    this.camera.updateProjectionMatrix();
  }

  snap(): void {
    this.ready = false;
  }

  shake(power: number, seconds: number): void {
    this.shakePower = Math.max(this.shakePower, power);
    this.shakeLeft = Math.max(this.shakeLeft, seconds);
  }

  follow(points: readonly RdPoint[], bias: RdPoint | null, dt: number): void {
    if (!points.length) return;
    let cx = 0, cz = 0;
    points.forEach((point) => { cx += point.x; cz += point.z; });
    cx /= points.length;
    cz /= points.length;
    let spread = 0;
    points.forEach((point) => { spread = Math.max(spread, Math.hypot(point.x - cx, point.z - cz)); });
    const focusX = bias ? cx * 0.55 + bias.x * 0.45 : cx;
    const focusZ = bias ? cz * 0.55 + bias.z * 0.45 : cz;
    const wanted = RdMath.clamp(15 + spread * 1.1, RdCameraRig.MIN_DISTANCE, RdCameraRig.MAX_DISTANCE) * (this.camera.aspect < 1 ? 1.25 : 1);
    if (!this.ready) {
      this.focusX = focusX;
      this.focusZ = focusZ;
      this.distance = wanted;
      this.ready = true;
    }
    const ratio = Math.min(1, dt * 3);
    this.focusX += (focusX - this.focusX) * ratio;
    this.focusZ += (focusZ - this.focusZ) * ratio;
    this.distance += (wanted - this.distance) * Math.min(1, dt * 1.5);
    this.place(dt);
  }

  orbit(radius: number, height: number, angle: number, lookX: number, lookZ: number): void {
    this.camera.position.set(lookX + Math.sin(angle) * radius, height, lookZ + Math.cos(angle) * radius);
    this.camera.lookAt(lookX, 0.8, lookZ);
  }

  private place(dt: number): void {
    let jitterX = 0, jitterY = 0;
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      jitterX = (Math.random() - 0.5) * this.shakePower;
      jitterY = (Math.random() - 0.5) * this.shakePower;
    }
    const up = Math.sin(RdCameraRig.PITCH) * this.distance, back = Math.cos(RdCameraRig.PITCH) * this.distance;
    this.camera.position.set(this.focusX + jitterX, up + jitterY, this.focusZ + back);
    this.camera.lookAt(this.focusX + jitterX * 0.5, 0, this.focusZ);
  }
}

class RdWorldView {
  readonly scene: Three<"Scene">;
  readonly rig: RdCameraRig;
  readonly matchGroup: Three<"Group">;
  playing = false;
  private readonly renderer: Three<"WebGLRenderer">;
  private pixelRatio: number;
  private readonly governor: QualityGovernorHandle | null;

  constructor(private readonly libs: ThreeLibs, readonly canvas: HTMLCanvasElement, touchDevice: boolean) {
    const THREE = libs.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#14101C");
    this.scene.fog = new THREE.Fog("#14101C", 34, 70);
    this.scene.add(new THREE.HemisphereLight(0xC8C2FF, 0x2A2030, 1.35));
    const sun = new THREE.DirectionalLight(0xFFD9A8, 1.15);
    sun.position.set(-8, 20, 12);
    this.scene.add(sun);
    this.matchGroup = new THREE.Group();
    this.scene.add(this.matchGroup);
    this.rig = new RdCameraRig(libs);
    this.governor = window.QualityGovernor
      ? window.QualityGovernor({ steps: [() => this.lowerPixelRatio()], storageKey: "dungeonraid_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 })
      : null;
    if (this.governor) this.governor.restore();
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  get camera(): Three<"PerspectiveCamera"> {
    return this.rig.camera;
  }

  resize(): void {
    const width = window.innerWidth, height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / Math.max(1, height));
  }

  render(dt: number): void {
    this.renderer.render(this.scene, this.rig.camera);
    if (this.governor) this.governor.update(dt);
  }

  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const vector = new this.libs.THREE.Vector3(x, y, z).project(this.rig.camera);
    return { x: (vector.x * 0.5 + 0.5) * window.innerWidth, y: (-vector.y * 0.5 + 0.5) * window.innerHeight, visible: vector.z < 1 && vector.z > -1 };
  }

  groundPoint(clientX: number, clientY: number): RdPoint | null {
    const THREE = this.libs.THREE;
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.rig.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return { x: RdUnits.toUnits(hit.x), z: RdUnits.toUnits(hit.z) };
  }

  private lowerPixelRatio(): boolean {
    if (this.pixelRatio <= 1) return false;
    this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
    return true;
  }
}

class RdWallPlan {
  static pieces(): RdWallPiece[] {
    const hall = RdMapData.HALL, vault = RdMapData.VAULT;
    const pieces: RdWallPiece[] = [];
    const doorAt = (x: number, z: number) => RdMapData.DOORS.findIndex((door) => Math.abs(door.x - x) < 1 && Math.abs(door.z - z) < 1);
    const add = (x: number, z: number, turn: number, near: boolean, kindOverride: RdWallPiece["kind"] | null) => {
      const door = doorAt(x, z);
      const kind = kindOverride || (door >= 0 ? "door" : "wall");
      pieces.push({ x, z, turn, kind, door, near });
    };
    for (let x = hall.minX + 200; x < hall.maxX; x += 400) {
      add(x, hall.minZ, 0, false, x === RdMapData.BOSS_GATE.x ? "gate" : null);
      add(x, hall.maxZ, Math.PI, true, null);
    }
    for (let z = hall.minZ + 200; z < hall.maxZ; z += 400) {
      add(hall.minX, z, Math.PI / 2, false, null);
      const insidePassage = z >= RdMapData.VAULT_PASSAGE.minZ && z <= RdMapData.VAULT_PASSAGE.maxZ;
      add(hall.maxX, z, -Math.PI / 2, false, insidePassage ? "open" : null);
    }
    for (let x = vault.minX + 200; x < vault.maxX; x += 400) {
      pieces.push({ x, z: vault.minZ, turn: 0, kind: "wall", door: -1, near: false });
      pieces.push({ x, z: vault.maxZ, turn: Math.PI, kind: "wall", door: -1, near: true });
    }
    for (let z = vault.minZ + 200; z < vault.maxZ; z += 400) pieces.push({ x: vault.maxX, z, turn: -Math.PI / 2, kind: "wall", door: -1, near: false });
    return pieces;
  }
}

interface RdDoorView { pivot: Three<"Object3D">; amount: number; target: number; closeAt: number; maxTurn: number }

class RdMapView {
  static readonly GATE_SCALE = 1.7;
  readonly group: Three<"Group">;
  private readonly doors = new Map<number, RdDoorView>();
  private readonly bannerMaterial: Three<"MeshLambertMaterial">;
  private readonly flames: Three<"Object3D">[] = [];
  private readonly portcullis: Three<"Group">;
  private readonly vaultGlow: Three<"Group">;
  private readonly beamMaterial: Three<"MeshBasicMaterial">;
  private readonly stripMaterial: Three<"MeshBasicMaterial">;
  private readonly arrowTexture: Three<"CanvasTexture">;
  private vaultOpen = false;
  private built = false;
  private gateDrop = 0;
  private seconds = 0;

  constructor(private readonly libs: ThreeLibs, private readonly library: RdModelLibrary) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.bannerMaterial = new THREE.MeshLambertMaterial({ color: "#C04848" });
    this.beamMaterial = new THREE.MeshBasicMaterial({ color: "#FFD27A", transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.stripMaterial = new THREE.MeshBasicMaterial({ color: "#FFC85A", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    this.arrowTexture = this.makeArrowTexture();
    this.portcullis = new THREE.Group();
    this.vaultGlow = new THREE.Group();
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    const THREE = this.libs.THREE;
    const w = RdViewMath.w;
    const floorSpots: Three<"Matrix4">[] = [];
    const tile = (rect: RdRect) => {
      for (let x = rect.minX + 200; x < rect.maxX; x += 400) for (let z = rect.minZ + 200; z < rect.maxZ; z += 400) floorSpots.push(this.library.placement(w(x), 0, w(z), 0));
    };
    tile(RdMapData.HALL);
    tile(RdMapData.VAULT);
    floorSpots.push(this.library.placement(w(1800), 0, 0, 0));
    this.group.add(this.library.instanced("floor", floorSpots));
    const under = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshBasicMaterial({ color: "#0B0910" }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -0.12;
    this.group.add(under);
    const pieces = RdWallPlan.pieces();
    const far: Three<"Matrix4">[] = [], near: Three<"Matrix4">[] = [];
    const nearMaterial = new THREE.MeshLambertMaterial({ color: "#8E86A0", transparent: true, opacity: 0.22, depthWrite: false });
    pieces.forEach((piece) => {
      const offsetX = Math.sin(piece.turn) * -50, offsetZ = Math.cos(piece.turn) * -50;
      const x = w(piece.x + offsetX), z = w(piece.z + offsetZ);
      if (piece.kind === "wall") (piece.near ? near : far).push(this.library.placement(x, 0, z, piece.turn));
      else if (piece.kind === "door" || piece.kind === "gate") this.addDoor(piece, x, z, piece.near ? nearMaterial : null);
      else this.addPassage(x, z, piece.turn);
    });
    this.group.add(this.library.instanced("wall", far));
    this.group.add(this.library.instanced("wall", near, nearMaterial));
    const corners: Three<"Matrix4">[] = [];
    [[RdMapData.HALL.minX, RdMapData.HALL.minZ], [RdMapData.HALL.maxX, RdMapData.HALL.minZ], [RdMapData.VAULT.maxX, RdMapData.VAULT.minZ]].forEach((corner) => corners.push(this.library.placement(w(corner[0]), 0, w(corner[1]), 0, 0.7, 1.05, 0.7)));
    this.group.add(this.library.instanced("pillar", corners));
    this.addDecor();
    this.buildVaultGlow();
  }

  private addDoor(piece: RdWallPiece, x: number, z: number, override: Three<"Material"> | null): void {
    const frame = this.library.clone("doorway");
    if (override) frame.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (mesh.isMesh) mesh.material = override;
    });
    const holder = new this.libs.THREE.Group();
    holder.add(frame);
    holder.position.set(x, 0, z);
    holder.rotation.y = piece.turn;
    const scale = piece.kind === "gate" ? RdMapView.GATE_SCALE : 1;
    holder.scale.set(scale, scale, 1);
    this.group.add(holder);
    const leaf = frame.getObjectByName("wall_doorway_door");
    if (leaf) this.doors.set(piece.kind === "gate" ? 99 : piece.door, { pivot: leaf, amount: 0, target: 0, closeAt: 0, maxTurn: 1.75 });
    if (piece.kind === "gate") {
      [-1, 1].forEach((side) => {
        const torch = this.library.clone("torch");
        torch.position.set(x + side * 2.8, 2.3, z + 0.7);
        torch.scale.setScalar(1.3);
        this.group.add(torch);
        this.flames.push(torch);
      });
    }
  }

  private addPassage(x: number, z: number, turn: number): void {
    const THREE = this.libs.THREE;
    [-1, 1].forEach((side) => {
      const column = this.library.clone("pillar");
      column.position.set(x, 0, z + side * 2.15);
      column.scale.set(0.55, 1, 0.55);
      this.group.add(column);
    });
    const bar = new THREE.MeshLambertMaterial({ color: "#3A3540" });
    for (let index = 0; index < 8; index++) {
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, 0.12), bar);
      rod.position.set(0, 1.8, -1.75 + index * 0.5);
      this.portcullis.add(rod);
    }
    [0.6, 2.0, 3.3].forEach((height) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3.9), bar);
      rail.position.set(0, height, 0);
      this.portcullis.add(rail);
    });
    this.portcullis.position.set(x, 0, z);
    this.portcullis.rotation.y = turn + Math.PI / 2;
    this.group.add(this.portcullis);
  }

  private addDecor(): void {
    const w = RdViewMath.w;
    const torchSpots: Array<[number, number, number]> = [[-600, RdMapData.HALL.minZ + 70, 0], [600, RdMapData.HALL.minZ + 70, 0], [RdMapData.HALL.minX + 70, -400, Math.PI / 2], [RdMapData.HALL.minX + 70, 400, Math.PI / 2], [RdMapData.HALL.maxX - 70, -600, -Math.PI / 2], [RdMapData.HALL.maxX - 70, 600, -Math.PI / 2], [2400, RdMapData.VAULT.minZ + 70, 0]];
    torchSpots.forEach((spot) => {
      const torch = this.library.clone("torch");
      torch.position.set(w(spot[0]), 2.3, w(spot[1]));
      torch.rotation.y = spot[2];
      this.group.add(torch);
      this.flames.push(torch);
    });
    [-400, 400, -1600, 1600].forEach((x) => {
      const banner = this.library.clone("banner");
      banner.traverse((node) => {
        const mesh = node as Three<"Mesh">;
        if (mesh.isMesh) mesh.material = this.bannerMaterial;
      });
      banner.position.set(w(x), 0.2, w(RdMapData.HALL.minZ));
      this.group.add(banner);
    });
    const props: Array<[RdPropKey, number, number, number, number]> = [["rubble", -1650, -1250, 0.4, 1], ["rubble", 1650, 1250, 2.1, 1], ["barrel", -1680, 1250, 0, 1], ["box", 1680, -1260, 0.3, 1], ["barrel", 2900, 700, 0.7, 1], ["box", 2900, -700, 0.2, 1]];
    props.forEach((entry) => {
      if (!this.library.has(entry[0])) return;
      const prop = this.library.clone(entry[0]);
      prop.position.set(w(entry[1]), 0, w(entry[2]));
      prop.rotation.y = entry[3];
      prop.scale.setScalar(entry[4]);
      this.group.add(prop);
    });
  }

  private makeArrowTexture(): Three<"CanvasTexture"> {
    const THREE = this.libs.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.fillStyle = "rgba(255,210,120,0.95)";
    context.beginPath();
    context.moveTo(30, 12);
    context.lineTo(70, 32);
    context.lineTo(30, 52);
    context.lineTo(44, 32);
    context.closePath();
    context.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private buildVaultGlow(): void {
    const THREE = this.libs.THREE;
    const w = RdViewMath.w;
    const centerX = w((RdMapData.VAULT.minX + RdMapData.VAULT.maxX) / 2);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 16, 24, 1, true), this.beamMaterial);
    beam.position.set(centerX, 8, 0);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 18, 18, 1, true), this.beamMaterial);
    inner.position.set(centerX, 9, 0);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w(RdMapData.VAULT.maxX - RdMapData.VAULT.minX) - 0.6, 0.35), this.stripMaterial);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(centerX, 0.07, w(RdMapData.VAULT.minZ) + 0.35);
    const strip2 = strip.clone();
    strip2.position.z = w(RdMapData.VAULT.maxZ) - 0.35;
    const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4), this.stripMaterial);
    doorGlow.rotation.x = -Math.PI / 2;
    doorGlow.position.set(w(RdMapData.HALL.maxX), 0.07, 0);
    const arrowMaterial = new THREE.MeshBasicMaterial({ map: this.arrowTexture, transparent: true, depthWrite: false, opacity: 0.85 });
    this.arrowTexture.repeat.set(4, 1);
    const arrows = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), arrowMaterial);
    arrows.rotation.x = -Math.PI / 2;
    arrows.position.set(w(RdMapData.HALL.maxX) - 3.3, 0.08, 0);
    this.vaultGlow.add(beam, inner, strip, strip2, doorGlow, arrows);
    this.vaultGlow.visible = false;
    this.group.add(this.vaultGlow);
  }

  setTheme(color: string): void {
    this.bannerMaterial.color.set(color);
  }

  setVaultOpen(open: boolean): void {
    this.vaultOpen = open;
    this.vaultGlow.visible = open;
  }

  openDoor(index: number, seconds: number): void {
    const door = this.doors.get(index);
    if (!door) return;
    door.target = 1;
    door.closeAt = this.seconds + seconds;
  }

  closeAll(): void {
    this.doors.forEach((door) => { door.target = 0; door.amount = 0; door.pivot.rotation.y = 0; });
  }

  update(dt: number): void {
    this.seconds += dt;
    this.doors.forEach((door) => {
      if (door.target > 0 && this.seconds > door.closeAt) door.target = 0;
      door.amount += (door.target - door.amount) * Math.min(1, dt * 4);
      door.pivot.rotation.y = -door.amount * door.maxTurn;
    });
    this.flames.forEach((torch, index) => {
      const flicker = 1 + Math.sin(this.seconds * 13 + index * 1.7) * 0.05 + Math.sin(this.seconds * 23 + index) * 0.03;
      torch.scale.y = torch.scale.x * flicker;
    });
    const dropTarget = this.vaultOpen ? 1 : 0;
    this.gateDrop += (dropTarget - this.gateDrop) * Math.min(1, dt * 2.5);
    this.portcullis.position.y = -this.gateDrop * 3.7;
    this.portcullis.visible = this.gateDrop < 0.98;
    if (this.vaultOpen) {
      const pulse = 0.5 + 0.5 * Math.sin(this.seconds * 2.2);
      this.beamMaterial.opacity = 0.035 + pulse * 0.06;
      this.stripMaterial.opacity = 0.35 + pulse * 0.35;
      this.arrowTexture.offset.x -= dt * 0.8;
    }
  }
}

class RdHealthBar {
  readonly group: Three<"Group">;
  private readonly fill: Three<"Sprite">;
  private readonly fillMaterial: Three<"SpriteMaterial">;
  private shown = -1;

  constructor(libs: ThreeLibs, private readonly width: number, color: string) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: "#14121A", transparent: true, opacity: 0.8, depthTest: false }));
    back.scale.set(width + 0.08, 0.16, 1);
    back.renderOrder = 10;
    this.fillMaterial = new THREE.SpriteMaterial({ color, depthTest: false });
    this.fill = new THREE.Sprite(this.fillMaterial);
    this.fill.center.set(0, 0.5);
    this.fill.position.x = -width / 2;
    this.fill.scale.set(width, 0.1, 1);
    this.fill.renderOrder = 11;
    this.group.add(back, this.fill);
  }

  set(ratio: number): void {
    const clamped = RdMath.clamp(ratio, 0, 1);
    if (Math.abs(clamped - this.shown) < 0.002) return;
    this.shown = clamped;
    this.fill.scale.x = Math.max(0.001, this.width * clamped);
  }

  setColor(color: string): void {
    this.fillMaterial.color.set(color);
  }
}

abstract class RdActor {
  readonly group: Three<"Group">;
  protected readonly bar: RdHealthBar;
  protected shownX = 0;
  protected shownZ = 0;
  protected shownYaw = 0;
  protected placed = false;
  hitFlash = 0;

  constructor(protected readonly libs: ThreeLibs, protected readonly parent: Three<"Object3D">, barWidth: number, barColor: string, protected readonly barHeight: number) {
    this.group = new libs.THREE.Group();
    this.bar = new RdHealthBar(libs, barWidth, barColor);
    this.bar.group.position.y = barHeight;
    this.group.add(this.bar.group);
    parent.add(this.group);
  }

  get worldX(): number {
    return this.shownX;
  }

  get worldZ(): number {
    return this.shownZ;
  }

  moveTo(x: number, z: number, yaw: number, dt: number, snapDistance: number): void {
    const wx = RdViewMath.w(x), wz = RdViewMath.w(z);
    if (!this.placed || Math.hypot(wx - this.shownX, wz - this.shownZ) > snapDistance) {
      this.shownX = wx;
      this.shownZ = wz;
      this.shownYaw = yaw;
      this.placed = true;
    } else {
      const ratio = Math.min(1, dt * 12);
      this.shownX += (wx - this.shownX) * ratio;
      this.shownZ += (wz - this.shownZ) * ratio;
      this.shownYaw = RdViewMath.approachAngle(this.shownYaw, yaw, dt * 12);
    }
    this.group.position.set(this.shownX, 0, this.shownZ);
  }

  dispose(): void {
    this.parent.remove(this.group);
  }

  abstract render(dt: number, nowMs: number): void;
}

class RdHeroActor extends RdActor {
  static readonly CLIPS: Readonly<Record<string, readonly string[]>> = {
    idle: ["Idle_A"], run: ["Running_A"], hit: ["Hit_A", "Hit_B"], down: ["Death_A"], revive: ["Spawn_Ground", "Idle_A"],
    attack0: ["Melee_1H_Attack_Chop"], attack1: ["Melee_2H_Attack_Slice", "Melee_1H_Attack_Slice_Horizontal"],
    shoot2: ["Ranged_Magic_Shoot"], shoot3: ["Ranged_Bow_Release", "Ranged_2H_Shoot"], shoot4: ["Ranged_Magic_Spellcasting", "Ranged_Magic_Shoot"],
    taunt: ["Melee_Block", "Cheering"], charge: ["Melee_2H_Attack_Spinning", "Running_A"], fireball: ["Ranged_Magic_Spellcasting", "Ranged_Magic_Shoot"],
    roll: ["Dodge_Forward", "Running_A"], heal: ["Ranged_Magic_Raise", "Ranged_Magic_Spellcasting"], cheer: ["Cheering"]
  };

  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly marker: Three<"Mesh"> | null;
  private readonly ring: Three<"Mesh">;
  private actionUntil = 0;
  private down = false;
  private moving = false;
  private seconds = 0;
  private ghost = false;

  constructor(libs: ThreeLibs, parent: Three<"Object3D">, factory: CharacterModelFactory, private readonly clips: Map<string, Three<"AnimationClip">>, labels: RkLabelFactory, readonly entry: RdRosterEntry) {
    super(libs, parent, 0.9, RdBalance.heroSpec(entry.slot).color, 2.35);
    const THREE = libs.THREE;
    const spec = RdBalance.heroSpec(entry.slot);
    const look = CharacterLooks.clean(entry.look);
    look.c = spec.lookType;
    this.model = factory.build(look);
    this.group.add(this.model);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 28), new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    const label = labels.create(entry.nick, spec.color);
    label.position.y = 2.75;
    label.scale.multiplyScalar(0.8);
    this.group.add(this.ring, label);
    if (entry.isMe) {
      this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshBasicMaterial({ color: "#FFD23F" }));
      this.marker.rotation.x = Math.PI;
      this.marker.position.y = 3.25;
      this.group.add(this.marker);
    } else {
      this.marker = null;
    }
    this.animator = new CharacterAnimator(libs, this.model, clips);
    this.animator.play("Idle_A");
    this.shownYaw = Math.PI;
  }

  pick(key: string): string | null {
    const list = RdHeroActor.CLIPS[key] || [];
    for (const name of list) if (this.clips.has(name)) return name;
    return null;
  }

  playAction(key: string, seconds: number, nowMs: number): void {
    if (this.down) return;
    const clip = this.pick(key);
    if (!clip) return;
    this.animator.play(clip, { once: true, speed: key === "heal" ? 1.8 : key === "roll" ? 1 : 1.25 });
    this.actionUntil = nowMs + seconds * 1000;
  }

  setPose(pose: RdPose, downed: boolean, hpRatio: number, dt: number, nowMs: number): void {
    this.moveTo(pose.x, pose.z, pose.yaw, dt, 3);
    this.bar.set(hpRatio);
    this.bar.group.visible = !downed;
    this.moving = pose.moving;
    if (downed !== this.down) {
      this.down = downed;
      if (downed) {
        const clip = this.pick("down");
        if (clip) this.animator.play(clip, { once: true });
        this.actionUntil = Infinity;
      } else {
        const clip = this.pick("revive");
        if (clip) this.animator.play(clip, { once: true, speed: 1.4 });
        this.actionUntil = nowMs + 900;
      }
    }
  }

  setGhost(ghost: boolean): void {
    if (ghost === this.ghost) return;
    this.ghost = ghost;
    this.ring.visible = !ghost;
  }

  render(dt: number, nowMs: number): void {
    this.seconds += dt;
    this.group.rotation.y = this.shownYaw;
    if (!this.down && nowMs >= this.actionUntil) this.animator.play(this.moving ? "Running_A" : "Idle_A");
    this.animator.update(dt);
    if (this.marker) this.marker.position.y = 3.25 + Math.sin(this.seconds * 5) * 0.1;
    this.ring.rotation.z += dt * 0.6;
    this.model.position.y = this.hitFlash > 0 ? Math.sin(this.hitFlash * 40) * 0.03 : 0;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
  }

  dispose(): void {
    super.dispose();
  }
}

interface RdFoeLook { model: string; scale: number; tint: string | null; emissive: string | null; barWidth: number; barHeight: number; barColor: string }

class RdFoeLooks {
  static readonly SKELETON_SCALE = 0.8;
  static readonly LOOKS: Readonly<Record<RdMobKind | RdBossKind, RdFoeLook>> = {
    minion: { model: "Skeleton_Minion", scale: 0.72, tint: null, emissive: null, barWidth: 0.7, barHeight: 1.85, barColor: "#E25B4B" },
    warrior: { model: "Skeleton_Warrior", scale: 0.85, tint: null, emissive: null, barWidth: 1.0, barHeight: 2.25, barColor: "#E25B4B" },
    rogue: { model: "Skeleton_Rogue", scale: 0.8, tint: null, emissive: null, barWidth: 0.85, barHeight: 2.1, barColor: "#E25B4B" },
    mage: { model: "Skeleton_Mage", scale: 0.8, tint: null, emissive: null, barWidth: 0.85, barHeight: 2.15, barColor: "#E25B4B" },
    giant: { model: "Skeleton_Warrior", scale: 1.6, tint: "#FF6A5C", emissive: "#3A0804", barWidth: 0, barHeight: 0, barColor: "#E25B4B" },
    archmage: { model: "Skeleton_Mage", scale: 1.44, tint: "#B58BFF", emissive: "#1E0838", barWidth: 0, barHeight: 0, barColor: "#E25B4B" },
    lord: { model: "Skeleton_Warrior", scale: 1.92, tint: "#5A4E40", emissive: "#3A2A06", barWidth: 0, barHeight: 0, barColor: "#E25B4B" }
  };
  static readonly ATTACKS: Readonly<Record<string, readonly string[]>> = {
    minion: ["Melee_Unarmed_Attack_Punch_A", "Melee_1H_Attack_Chop"], warrior: ["Melee_1H_Attack_Chop"], rogue: ["Melee_Dualwield_Attack_Slice", "Melee_1H_Attack_Slice_Diagonal"],
    mage: ["Ranged_Magic_Shoot"], giant: ["Melee_2H_Attack_Slice", "Melee_1H_Attack_Chop"], archmage: ["Ranged_Magic_Shoot"], lord: ["Melee_2H_Attack_Spin", "Melee_2H_Attack_Slice"]
  };
  static readonly ACTIONS: Readonly<Record<string, readonly string[]>> = {
    slam: ["Melee_2H_Attack_Slice", "Melee_1H_Attack_Chop"], leap: ["Melee_1H_Attack_Jump_Chop"], rush: ["Running_A"], roar: ["Skeletons_Taunt"],
    channel: ["Ranged_Magic_Spellcasting_Long", "Ranged_Magic_Spellcasting"], summon: ["Ranged_Magic_Summon", "Ranged_Magic_Raise"], cast: ["Ranged_Magic_Shoot"]
  };
}

class RdFoeActor extends RdActor {
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly stars: Three<"Mesh">;
  private actionUntil = 0;
  private dying = -1;
  private spawnShown = 0;
  private moving = false;
  private seconds = 0;
  private stunned = false;
  readonly boss: boolean;

  constructor(libs: ThreeLibs, parent: Three<"Object3D">, library: RdModelLibrary, private readonly clips: Map<string, Three<"AnimationClip">>, readonly kind: RdMobKind | RdBossKind, readonly id: number) {
    super(libs, parent, RdFoeLooks.LOOKS[kind].barWidth || 0.1, RdFoeLooks.LOOKS[kind].barColor, RdFoeLooks.LOOKS[kind].barHeight);
    const THREE = libs.THREE;
    const look = RdFoeLooks.LOOKS[kind];
    this.boss = kind === "giant" || kind === "archmage" || kind === "lord";
    this.bar.group.visible = !this.boss;
    this.model = library.clone(look.model);
    this.model.scale.setScalar(look.scale);
    if (look.tint) {
      this.model.traverse((node) => {
        const mesh = node as Three<"Mesh">;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const material = (mesh.material as Three<"MeshLambertMaterial">).clone();
        material.color.set(look.tint as string);
        if (look.emissive) material.emissive.set(look.emissive);
        mesh.material = material;
      });
    }
    this.model.traverse((node) => { (node as Three<"Mesh">).frustumCulled = false; });
    this.group.add(this.model);
    this.stars = new THREE.Mesh(new THREE.TorusGeometry(0.35 * look.scale, 0.05, 6, 18), new THREE.MeshBasicMaterial({ color: "#FFE066" }));
    this.stars.rotation.x = Math.PI / 2;
    this.stars.position.y = 2.2 * look.scale / 0.8;
    this.stars.visible = false;
    this.group.add(this.stars);
    this.animator = new CharacterAnimator(libs, this.model, clips);
    this.animator.play(this.has("Skeletons_Idle") ? "Skeletons_Idle" : "Idle_A");
  }

  private has(name: string): boolean {
    return this.clips.has(name);
  }

  private first(list: readonly string[] | undefined): string | null {
    for (const name of list || []) if (this.clips.has(name)) return name;
    return null;
  }

  playAttack(nowMs: number): void {
    const clip = this.first(RdFoeLooks.ATTACKS[this.kind]);
    if (!clip || this.dying >= 0) return;
    this.animator.play(clip, { once: true, speed: this.boss ? 1.1 : 1.4 });
    this.actionUntil = nowMs + 650;
  }

  playAction(key: string, nowMs: number, seconds: number): void {
    const clip = this.first(RdFoeLooks.ACTIONS[key]);
    if (!clip || this.dying >= 0) return;
    const loop = key === "channel";
    this.animator.play(clip, { once: !loop, speed: key === "summon" ? 2.6 : 1 });
    this.actionUntil = nowMs + seconds * 1000;
  }

  beginRise(nowMs: number): void {
    const clip = this.first(["Skeletons_Spawn_Ground", "Skeletons_Awaken_Floor", "Spawn_Ground"]);
    if (!clip) return;
    const length = (this.clips.get(clip) as Three<"AnimationClip">).duration;
    this.animator.play(clip, { once: true, speed: Math.max(1, length / RdGroundSpawn.RISE_SECONDS) });
    this.actionUntil = nowMs + RdGroundSpawn.RISE_SECONDS * 1000;
  }

  die(nowMs: number): void {
    if (this.dying >= 0) return;
    this.dying = nowMs;
    this.bar.group.visible = false;
    this.stars.visible = false;
    const clip = this.first(["Skeletons_Death", "Death_A"]);
    if (clip) this.animator.play(clip, { once: true, speed: 1.3 });
  }

  get finished(): boolean {
    return this.dying >= 0 && this.seconds * 1000 - this.dying > 0;
  }

  dyingFor(nowMs: number): number {
    return this.dying < 0 ? -1 : nowMs - this.dying;
  }

  sync(shot: RdFoeShot, dt: number, nowMs: number): void {
    const hidden = (shot.flags & RdFoeFlags.HIDDEN) !== 0;
    const spawning = (shot.flags & RdFoeFlags.SPAWNING) !== 0;
    this.moveTo(shot.x, shot.z, shot.yaw, dt, this.boss ? 6 : 3);
    this.group.visible = !hidden;
    if (!hidden && spawning && this.spawnShown === 0) this.spawnShown = 1;
    this.moving = (shot.flags & RdFoeFlags.MOVING) !== 0;
    this.stunned = (shot.flags & RdFoeFlags.STUNNED) !== 0;
    this.bar.set(shot.hp / 1000);
    if (!this.boss) this.bar.group.visible = !spawning && this.dying < 0;
  }

  render(dt: number, nowMs: number): void {
    this.seconds += dt;
    this.group.rotation.y = this.shownYaw;
    if (this.dying < 0 && nowMs >= this.actionUntil) {
      const walk = this.has("Skeletons_Walking") ? "Skeletons_Walking" : "Walking_A";
      const idle = this.has("Skeletons_Idle") ? "Skeletons_Idle" : "Idle_A";
      this.animator.play(this.moving ? walk : idle, { speed: this.moving ? (this.boss ? 1.1 : 1.5) : 1 });
    }
    this.stars.visible = this.stunned && this.dying < 0;
    if (this.stars.visible) this.stars.rotation.z += dt * 4;
    this.animator.update(dt);
    if (this.hitFlash > 0) {
      this.model.position.x = Math.sin(this.hitFlash * 60) * 0.04;
      this.hitFlash = Math.max(0, this.hitFlash - dt);
    } else {
      this.model.position.x = 0;
    }
  }
}

class RdPropActor extends RdActor {
  private readonly body: Three<"Object3D">;
  private readonly lid: Three<"Object3D"> | null;
  private readonly crystal: Three<"Mesh"> | null;
  private readonly crystalMaterial: Three<"MeshBasicMaterial"> | null;
  private readonly timer: Three<"Sprite"> | null;
  private readonly timerCanvas: HTMLCanvasElement | null;
  private timerText = "";
  private opened = false;
  private lidTurn = 0;
  private wobble = 0;
  private broken = false;
  private seconds = 0;
  removedSince = -1;

  constructor(libs: ThreeLibs, parent: Three<"Object3D">, library: RdModelLibrary, labels: RkLabelFactory, readonly kind: "pillar" | "dummy" | "chest", readonly id: number, owner: number, ownerName: string) {
    super(libs, parent, kind === "chest" ? 0.9 : 1.0, kind === "pillar" ? "#B07CFF" : "#F2C14E", kind === "pillar" ? 4.2 : kind === "chest" ? 1.6 : 2.4);
    const THREE = libs.THREE;
    this.lid = null;
    this.crystal = null;
    this.crystalMaterial = null;
    this.timer = null;
    this.timerCanvas = null;
    if (kind === "chest") {
      this.body = library.clone("chest");
      this.body.scale.setScalar(0.62);
      this.lid = this.body.getObjectByName("chest_lid") || null;
      const color = owner >= 0 ? RdBalance.heroSpec(owner).color : "#FFFFFF";
      const label = labels.create(ownerName, color);
      label.position.y = 1.25;
      label.scale.multiplyScalar(0.7);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 30), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      this.group.add(label, ring);
    } else if (kind === "dummy") {
      this.body = library.clone("dummy");
      this.body.scale.setScalar(1.15);
      this.bar.group.visible = false;
    } else {
      this.body = new THREE.Group();
      const base = library.clone("column");
      base.scale.set(1.4, 0.5, 1.4);
      this.body.add(base);
      const material = new THREE.MeshBasicMaterial({ color: "#B07CFF", transparent: true, opacity: 0.88 });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), material);
      crystal.scale.set(1, 2.6, 1);
      crystal.position.y = 2.2;
      this.body.add(crystal);
      this.crystal = crystal;
      this.crystalMaterial = material;
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
      sprite.scale.set(1.4, 0.7, 1);
      sprite.position.y = 4.9;
      sprite.visible = false;
      sprite.renderOrder = 12;
      this.group.add(sprite);
      this.timer = sprite;
      this.timerCanvas = canvas;
    }
    this.group.add(this.body);
  }

  sync(shot: RdFoeShot, dt: number, windowLeft: number): void {
    this.moveTo(shot.x, shot.z, shot.yaw, dt, 1);
    const ratio = shot.hp / 1000;
    this.bar.set(ratio);
    if (this.kind === "pillar" && this.crystal && this.crystalMaterial) {
      this.broken = (shot.flags & RdFoeFlags.BROKEN) !== 0;
      this.crystal.visible = !this.broken;
      this.bar.group.visible = !this.broken;
      this.crystalMaterial.color.setRGB(0.69 + (1 - ratio) * 0.31, 0.49 * ratio + 0.15, 1 * ratio + 0.2 * (1 - ratio));
      this.setTimer(this.broken && windowLeft >= 0 ? windowLeft.toFixed(1) : "");
    }
  }

  private setTimer(text: string): void {
    if (!this.timer || !this.timerCanvas || text === this.timerText) return;
    this.timerText = text;
    this.timer.visible = text !== "";
    const context = this.timerCanvas.getContext("2d") as CanvasRenderingContext2D;
    context.clearRect(0, 0, 128, 64);
    context.font = '800 40px "Nanum Gothic", "Malgun Gothic", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 7;
    context.strokeStyle = "rgba(10,10,20,.9)";
    context.strokeText(text, 64, 34);
    context.fillStyle = "#FFD27A";
    context.fillText(text, 64, 34);
    ((this.timer.material as Three<"SpriteMaterial">).map as Three<"CanvasTexture">).needsUpdate = true;
  }

  open(): void {
    this.opened = true;
    this.bar.group.visible = false;
  }

  hit(): void {
    this.wobble = 0.35;
  }

  render(dt: number): void {
    this.seconds += dt;
    this.group.rotation.y = this.shownYaw;
    if (this.lid) {
      this.lidTurn += ((this.opened ? -1.25 : 0) - this.lidTurn) * Math.min(1, dt * 6);
      this.lid.rotation.x = this.lidTurn;
    }
    if (this.wobble > 0) {
      this.wobble = Math.max(0, this.wobble - dt);
      this.body.rotation.z = Math.sin(this.wobble * 40) * this.wobble * 0.3;
    } else {
      this.body.rotation.z = 0;
    }
    if (this.crystal && !this.broken) {
      this.crystal.rotation.y += dt * 1.4;
      this.crystal.position.y = 2.2 + Math.sin(this.seconds * 2) * 0.12;
    }
  }
}

interface RdPooled { mesh: Three<"Mesh">; until: number; start: number; busy: boolean; kind: string; update: (progress: number) => void }

class RdEffectManager {
  readonly group: Three<"Group">;
  private readonly pool: RdPooled[] = [];
  private readonly projectiles = new Map<number, { mesh: Three<"Mesh">; x: number; z: number; speed: number; target: () => RdPoint | null; tx: number; tz: number; style: RdProjStyle; until: number }>();
  private readonly projectilePool: Three<"Mesh">[] = [];
  private readonly ringGeometry: Three<"RingGeometry">;
  private readonly discGeometry: Three<"CircleGeometry">;
  private readonly sphereGeometry: Three<"SphereGeometry">;
  private readonly beamGeometry: Three<"CylinderGeometry">;
  private readonly crackTexture: Three<"CanvasTexture">;
  private seconds = 0;

  constructor(private readonly libs: ThreeLibs) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.ringGeometry = new THREE.RingGeometry(0.86, 1, 40);
    this.ringGeometry.rotateX(-Math.PI / 2);
    this.discGeometry = new THREE.CircleGeometry(1, 40);
    this.discGeometry.rotateX(-Math.PI / 2);
    this.sphereGeometry = new THREE.SphereGeometry(1, 14, 10);
    this.beamGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true);
    this.beamGeometry.rotateX(Math.PI / 2);
    this.beamGeometry.translate(0, 0, 0.5);
    this.crackTexture = this.makeCrackTexture();
  }

  private makeCrackTexture(): Three<"CanvasTexture"> {
    const THREE = this.libs.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, "rgba(20,12,8,.85)");
    gradient.addColorStop(0.7, "rgba(40,28,20,.45)");
    gradient.addColorStop(1, "rgba(40,28,20,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = "rgba(10,6,4,.95)";
    context.lineWidth = 3;
    for (let index = 0; index < 7; index++) {
      const angle = (index / 7) * Math.PI * 2 + 0.3;
      context.beginPath();
      context.moveTo(64, 64);
      context.lineTo(64 + Math.cos(angle) * 30, 64 + Math.sin(angle) * 30);
      context.lineTo(64 + Math.cos(angle + 0.2) * 58, 64 + Math.sin(angle + 0.2) * 58);
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private acquire(kind: string, geometry: TileGeometry, additive: boolean, map: Three<"Texture"> | null = null): RdPooled {
    const THREE = this.libs.THREE;
    let entry = this.pool.filter((item) => !item.busy && item.kind === kind)[0];
    if (!entry) {
      const material = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, map });
      const mesh = new THREE.Mesh(geometry, material);
      this.group.add(mesh);
      entry = { mesh, until: 0, start: 0, busy: false, kind, update: () => undefined };
      this.pool.push(entry);
    }
    entry.busy = true;
    entry.mesh.visible = true;
    entry.mesh.rotation.set(0, 0, 0);
    entry.mesh.scale.set(1, 1, 1);
    entry.start = this.seconds;
    return entry;
  }

  private play(entry: RdPooled, seconds: number, update: (progress: number) => void): void {
    entry.until = this.seconds + seconds;
    entry.update = update;
    update(0);
  }

  ring(x: number, z: number, radius: number, color: string, seconds: number, grow: boolean = true, height: number = 0.08): void {
    const entry = this.acquire("ring", this.ringGeometry, true);
    const material = entry.mesh.material as Three<"MeshBasicMaterial">;
    material.color.set(color);
    entry.mesh.position.set(x, height, z);
    this.play(entry, seconds, (progress) => {
      const scale = grow ? radius * (0.3 + 0.7 * progress) : radius;
      entry.mesh.scale.set(scale, 1, scale);
      material.opacity = 0.9 * (1 - progress);
    });
  }

  disc(x: number, z: number, radius: number, color: string, seconds: number, opacity: number): void {
    const entry = this.acquire("disc", this.discGeometry, true);
    const material = entry.mesh.material as Three<"MeshBasicMaterial">;
    material.color.set(color);
    entry.mesh.position.set(x, 0.06, z);
    this.play(entry, seconds, (progress) => {
      entry.mesh.scale.set(radius * progress, 1, radius * progress);
      material.opacity = opacity * (progress < 0.85 ? 1 : (1 - progress) / 0.15);
    });
  }

  burst(x: number, z: number, radius: number, color: string, seconds: number): void {
    const entry = this.acquire("burst", this.sphereGeometry, true);
    const material = entry.mesh.material as Three<"MeshBasicMaterial">;
    material.color.set(color);
    entry.mesh.position.set(x, radius * 0.25, z);
    this.play(entry, seconds, (progress) => {
      const scale = radius * (0.35 + 0.65 * Math.sqrt(progress));
      entry.mesh.scale.set(scale, scale * 0.55, scale);
      material.opacity = 0.75 * (1 - progress);
    });
  }

  crack(x: number, z: number, radius: number, seconds: number): void {
    const entry = this.acquire("crack", this.discGeometry, false, this.crackTexture);
    const material = entry.mesh.material as Three<"MeshBasicMaterial">;
    material.color.set("#FFFFFF");
    entry.mesh.position.set(x, 0.07, z);
    this.play(entry, seconds, (progress) => {
      const scale = radius * Math.min(1, 0.4 + progress * 1.2);
      entry.mesh.scale.set(scale, 1, scale);
      material.opacity = progress < 0.7 ? 0.95 : (1 - progress) / 0.3;
    });
    this.ring(x, z, radius * 1.3, "#8A7560", seconds * 0.8);
  }

  beam(fromX: number, fromZ: number, toX: number, toZ: number, color: string, seconds: number): void {
    const entry = this.acquire("beam", this.beamGeometry as TileGeometry, true);
    const material = entry.mesh.material as Three<"MeshBasicMaterial">;
    material.color.set(color);
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    entry.mesh.position.set(fromX, 1.2, fromZ);
    entry.mesh.lookAt(toX, 1.0, toZ);
    this.play(entry, seconds, (progress) => {
      entry.mesh.scale.set(1.2 * (1 - progress) + 0.4, 1.2 * (1 - progress) + 0.4, length);
      material.opacity = 0.75 * (1 - progress);
    });
  }

  swing(x: number, z: number, dir: number, radius: number, arc: number, color: string): void {
    const THREE = this.libs.THREE;
    const geometry = new THREE.RingGeometry(radius * 0.55, radius, 18, 1, Math.PI / 2 - dir - arc / 2, arc);
    geometry.rotateX(-Math.PI / 2);
    const entry = this.acquire("swing-" + Math.round(radius * 10) + "-" + Math.round(arc * 10), geometry as TileGeometry, true);
    const material = entry.mesh.material as Three<"MeshBasicMaterial">;
    material.color.set(color);
    entry.mesh.position.set(x, 0.9, z);
    entry.mesh.rotation.y = 0;
    const mesh = entry.mesh;
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    this.play(entry, 0.18, (progress) => { material.opacity = 0.7 * (1 - progress); });
  }

  meteor(x: number, z: number, radius: number): void {
    this.burst(x, z, radius * 1.1, "#FF7A2E", 0.7);
    this.ring(x, z, radius * 1.25, "#FFB35A", 0.6);
  }

  launch(id: number, style: RdProjStyle, x: number, z: number, speed: number, target: () => RdPoint | null, tx: number, tz: number): void {
    const THREE = this.libs.THREE;
    let mesh = this.projectilePool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this.sphereGeometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.group.add(mesh);
    }
    const color = style === "arrow" ? "#FFE7A0" : style === "orb" ? "#C58BFF" : "#7CFF9C";
    (mesh.material as Three<"MeshBasicMaterial">).color.set(color);
    if (style === "arrow") mesh.scale.set(0.06, 0.06, 0.55);
    else mesh.scale.setScalar(style === "orb" ? 0.22 : 0.2);
    mesh.visible = true;
    mesh.position.set(x, 1.2, z);
    this.projectiles.set(id, { mesh, x, z, speed: RdViewMath.w(speed), target, tx, tz, style, until: this.seconds + 4 });
  }

  land(id: number): void {
    const projectile = this.projectiles.get(id);
    if (!projectile) return;
    this.projectiles.delete(id);
    projectile.mesh.visible = false;
    this.projectilePool.push(projectile.mesh);
    if (projectile.style !== "arrow") this.burst(projectile.mesh.position.x, projectile.mesh.position.z, 0.45, projectile.style === "orb" ? "#C58BFF" : "#7CFF9C", 0.25);
  }

  clear(): void {
    this.pool.forEach((entry) => { entry.busy = false; entry.mesh.visible = false; });
    Array.from(this.projectiles.keys()).forEach((id) => this.land(id));
  }

  update(dt: number): void {
    this.seconds += dt;
    this.pool.forEach((entry) => {
      if (!entry.busy) return;
      const total = entry.until - entry.start;
      const progress = total > 0 ? (this.seconds - entry.start) / total : 1;
      if (progress >= 1) {
        entry.busy = false;
        entry.mesh.visible = false;
        return;
      }
      entry.update(progress);
    });
    this.projectiles.forEach((projectile, id) => {
      const target = projectile.target();
      if (target) {
        projectile.tx = target.x;
        projectile.tz = target.z;
      }
      const dx = projectile.tx - projectile.x, dz = projectile.tz - projectile.z;
      const distance = Math.hypot(dx, dz);
      const step = projectile.speed * dt;
      if (distance <= step || this.seconds > projectile.until) {
        this.land(id);
        return;
      }
      projectile.x += (dx / distance) * step;
      projectile.z += (dz / distance) * step;
      projectile.mesh.position.set(projectile.x, 1.2, projectile.z);
      if (projectile.style === "arrow") projectile.mesh.rotation.y = Math.atan2(dx, dz);
    });
  }
}

interface RdShapeView { group: Three<"Group">; fill: Three<"Mesh">; edge: Three<"Mesh">; id: number; meteor: Three<"Mesh"> | null }

class RdTelegraphView {
  readonly group: Three<"Group">;
  private readonly shapes = new Map<number, RdShapeView>();
  private readonly areas = new Map<number, RdShapeView>();
  private readonly fillMaterial: Three<"MeshBasicMaterial">;
  private readonly edgeMaterial: Three<"MeshBasicMaterial">;
  private readonly areaMaterial: Three<"MeshBasicMaterial">;
  private readonly areaEdgeMaterial: Three<"MeshBasicMaterial">;
  private readonly meteorMaterial: Three<"MeshBasicMaterial">;
  private seconds = 0;

  constructor(private readonly libs: ThreeLibs) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.fillMaterial = new THREE.MeshBasicMaterial({ color: "#FF3B30", transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    this.edgeMaterial = new THREE.MeshBasicMaterial({ color: "#FF5A4A", transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.areaMaterial = new THREE.MeshBasicMaterial({ color: "#8E3BFF", transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
    this.areaEdgeMaterial = new THREE.MeshBasicMaterial({ color: "#D6A8FF", transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    this.meteorMaterial = new THREE.MeshBasicMaterial({ color: "#FF8A3C" });
  }

  private build(shape: RdShape, fillMaterial: Three<"MeshBasicMaterial">, edgeMaterial: Three<"MeshBasicMaterial">): { fill: Three<"Mesh">; edge: Three<"Mesh"> } {
    const THREE = this.libs.THREE;
    const w = RdViewMath.w;
    let fillGeometry: TileGeometry, edgeGeometry: TileGeometry;
    if (shape.kind === "circle") {
      fillGeometry = new THREE.CircleGeometry(1, 44) as TileGeometry;
      edgeGeometry = new THREE.RingGeometry(0.94, 1, 44) as TileGeometry;
    } else if (shape.kind === "cone") {
      const start = Math.PI / 2 - shape.dir - shape.arc / 2;
      fillGeometry = new THREE.CircleGeometry(1, 30, start, shape.arc) as TileGeometry;
      edgeGeometry = new THREE.RingGeometry(0.94, 1, 30, 1, start, shape.arc) as TileGeometry;
    } else {
      fillGeometry = new THREE.PlaneGeometry(1, 1) as TileGeometry;
      fillGeometry.translate(0, 0.5, 0);
      edgeGeometry = new THREE.PlaneGeometry(1, 1) as TileGeometry;
      edgeGeometry.translate(0, 0.5, 0);
    }
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    [fill, edge].forEach((mesh) => {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(w(shape.x), 0.09, w(shape.z));
    });
    if (shape.kind === "line") {
      fill.rotation.z = shape.dir + Math.PI;
      edge.rotation.z = shape.dir + Math.PI;
      fill.scale.set(w(shape.width), w(shape.length), 1);
      edge.scale.set(w(shape.width) + 0.1, w(shape.length) + 0.1, 1);
      fill.rotation.order = edge.rotation.order = "XYZ";
    } else {
      const radius = w(shape.r);
      fill.scale.set(radius, radius, 1);
      edge.scale.set(radius, radius, 1);
    }
    edge.position.y = 0.1;
    return { fill, edge };
  }

  sync(tele: readonly RdTimedShape[], areas: readonly RdTimedShape[], now: number): void {
    this.reconcile(this.shapes, tele, now, false);
    this.reconcile(this.areas, areas, now, true);
  }

  private reconcile(store: Map<number, RdShapeView>, list: readonly RdTimedShape[], now: number, area: boolean): void {
    const THREE = this.libs.THREE;
    const keep = new Set<number>();
    list.forEach((entry) => {
      if (entry.end <= now) return;
      keep.add(entry.id);
      let view = store.get(entry.id);
      if (!view) {
        const meshes = this.build(entry.shape, area ? this.areaMaterial : this.fillMaterial.clone(), area ? this.areaEdgeMaterial : this.edgeMaterial);
        const group = new THREE.Group();
        group.add(meshes.fill, meshes.edge);
        let meteor: Three<"Mesh"> | null = null;
        if (!area && entry.shape.kind === "circle" && entry.end - entry.start >= 2.9) {
          meteor = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), this.meteorMaterial);
          meteor.visible = false;
          group.add(meteor);
        }
        this.group.add(group);
        view = { group, fill: meshes.fill, edge: meshes.edge, id: entry.id, meteor };
        store.set(entry.id, view);
      }
      if (area) return;
      const progress = RdMath.clamp((now - entry.start) / Math.max(0.05, entry.end - entry.start), 0, 1);
      const material = view.fill.material as Three<"MeshBasicMaterial">;
      material.opacity = 0.18 + 0.35 * progress;
      if (entry.shape.kind !== "line") {
        const radius = RdViewMath.w(entry.shape.r) * (0.15 + 0.85 * progress);
        view.fill.scale.set(radius, radius, 1);
      } else {
        view.fill.scale.y = RdViewMath.w(entry.shape.length) * progress;
      }
      if (view.meteor) {
        const left = entry.end - now;
        view.meteor.visible = left < 0.7;
        view.meteor.position.set(RdViewMath.w(entry.shape.x), 0.5 + left * 14, RdViewMath.w(entry.shape.z));
        view.meteor.rotation.x += 0.2;
      }
    });
    store.forEach((view, id) => {
      if (keep.has(id)) return;
      this.group.remove(view.group);
      view.fill.geometry.dispose();
      view.edge.geometry.dispose();
      store.delete(id);
    });
  }

  update(dt: number): void {
    this.seconds += dt;
    this.areaMaterial.opacity = 0.3 + Math.sin(this.seconds * 5) * 0.08;
    this.areas.forEach((view) => { view.edge.rotation.z += dt * 0.8; });
  }

  clear(): void {
    this.sync([], [], Infinity);
  }
}

class RdZoneView {
  readonly group: Three<"Group">;
  private readonly readyRing: Three<"Mesh">;
  private readonly readyDisc: Three<"Mesh">;
  private readonly readyMaterial: Three<"MeshBasicMaterial">;
  private readonly readyDiscMaterial: Three<"MeshBasicMaterial">;
  private readonly zones: Array<{ ring: Three<"Mesh">; disc: Three<"Mesh">; material: Three<"MeshBasicMaterial">; discMaterial: Three<"MeshBasicMaterial"> }> = [];
  private seconds = 0;

  constructor(private readonly libs: ThreeLibs) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.readyMaterial = new THREE.MeshBasicMaterial({ color: "#FFD23F", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    this.readyDiscMaterial = new THREE.MeshBasicMaterial({ color: "#FFD23F", transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
    const ringGeometry = new THREE.RingGeometry(0.9, 1, 48);
    ringGeometry.rotateX(-Math.PI / 2);
    const discGeometry = new THREE.CircleGeometry(1, 48);
    discGeometry.rotateX(-Math.PI / 2);
    this.readyRing = new THREE.Mesh(ringGeometry, this.readyMaterial);
    this.readyDisc = new THREE.Mesh(discGeometry, this.readyDiscMaterial);
    this.readyRing.visible = this.readyDisc.visible = false;
    this.group.add(this.readyRing, this.readyDisc);
    for (let index = 0; index < RdRules.SEATS; index++) {
      const material = new THREE.MeshBasicMaterial({ color: "#FFD23F", transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
      const discMaterial = new THREE.MeshBasicMaterial({ color: "#FFD23F", transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(ringGeometry, material);
      const disc = new THREE.Mesh(discGeometry, discMaterial);
      ring.visible = disc.visible = false;
      this.group.add(ring, disc);
      this.zones.push({ ring, disc, material, discMaterial });
    }
  }

  setReady(zone: RdCircle | null, inside: boolean): void {
    this.readyRing.visible = this.readyDisc.visible = !!zone;
    if (!zone) return;
    const color = inside ? "#4CE38A" : "#FFD23F";
    this.readyMaterial.color.set(color);
    this.readyDiscMaterial.color.set(color);
    const radius = RdViewMath.w(zone.r);
    [this.readyRing, this.readyDisc].forEach((mesh) => {
      mesh.position.set(RdViewMath.w(zone.x), 0.08, RdViewMath.w(zone.z));
      mesh.scale.set(radius, 1, radius);
    });
  }

  setZones(zones: readonly number[][]): void {
    this.zones.forEach((zone, index) => {
      const data = zones[index];
      zone.ring.visible = zone.disc.visible = !!data;
      if (!data) return;
      const color = data[2] === 0 ? "#FFD23F" : data[2] === 1 ? "#4C9BFF" : "#FF4040";
      zone.material.color.set(color);
      zone.discMaterial.color.set(color);
      const radius = RdViewMath.w(RdBalance.SAFE_ZONE.radius);
      [zone.ring, zone.disc].forEach((mesh) => {
        mesh.position.set(RdViewMath.w(data[0]), 0.1, RdViewMath.w(data[1]));
        mesh.scale.set(radius, 1, radius);
      });
    });
  }

  update(dt: number): void {
    this.seconds += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.seconds * 4);
    this.readyDiscMaterial.opacity = 0.12 + pulse * 0.12;
    this.zones.forEach((zone) => { zone.discMaterial.opacity = 0.18 + pulse * 0.16; });
  }
}

class RdDamageNumbers {
  private static readonly POOL = 36;
  private readonly items: Array<{ element: HTMLDivElement; x: number; y: number; z: number; age: number; life: number; busy: boolean }> = [];

  constructor(private readonly world: RdWorldView, container: HTMLElement) {
    for (let index = 0; index < RdDamageNumbers.POOL; index++) {
      const element = document.createElement("div");
      element.className = "rd-num";
      element.hidden = true;
      container.appendChild(element);
      this.items.push({ element, x: 0, y: 0, z: 0, age: 0, life: 0.9, busy: false });
    }
  }

  show(x: number, z: number, text: string, kind: "foe" | "hero" | "heal" | "big"): void {
    let item = this.items.filter((entry) => !entry.busy)[0];
    if (!item) item = this.items.reduce((oldest, entry) => (entry.age > oldest.age ? entry : oldest), this.items[0]);
    item.busy = true;
    item.age = 0;
    item.x = x + (Math.random() - 0.5) * 0.5;
    item.z = z;
    item.y = 2.2;
    item.element.className = "rd-num " + kind;
    item.element.textContent = text;
    item.element.hidden = false;
  }

  clear(): void {
    this.items.forEach((item) => { item.busy = false; item.element.hidden = true; });
  }

  update(dt: number): void {
    this.items.forEach((item) => {
      if (!item.busy) return;
      item.age += dt;
      if (item.age >= item.life) {
        item.busy = false;
        item.element.hidden = true;
        return;
      }
      const point = this.world.project(item.x, item.y + item.age * 1.4, item.z);
      if (!point.visible) {
        item.element.style.opacity = "0";
        return;
      }
      item.element.style.opacity = String(1 - Math.max(0, item.age - 0.55) / 0.35);
      item.element.style.transform = "translate(" + point.x.toFixed(1) + "px," + point.y.toFixed(1) + "px) translate(-50%,-50%)";
    });
  }
}

interface RdViewKit {
  libs: ThreeLibs;
  world: RdWorldView;
  library: RdModelLibrary;
  factory: CharacterModelFactory;
  clips: Map<string, Three<"AnimationClip">>;
  labels: RkLabelFactory;
  numbers: RdDamageNumbers;
}

class RdSceneView {
  readonly map: RdMapView;
  readonly effects: RdEffectManager;
  private readonly telegraphs: RdTelegraphView;
  private readonly zones: RdZoneView;
  private readonly root: Three<"Group">;
  private readonly heroes: Array<RdHeroActor | null> = [null, null, null, null, null];
  private readonly foes = new Map<number, RdFoeActor | RdPropActor>();
  private readonly dying: RdFoeActor[] = [];
  private roster: RdRosterEntry[] = [];
  private snapshot: RdSnapshot | null = null;
  private flow: RdFlowShot | null = null;
  private theme = "";
  private slowMo = 0;
  private stage = "";
  private nowMs = 0;

  constructor(private readonly kit: RdViewKit) {
    const THREE = kit.libs.THREE;
    this.root = new THREE.Group();
    this.map = new RdMapView(kit.libs, kit.library);
    this.effects = new RdEffectManager(kit.libs);
    this.telegraphs = new RdTelegraphView(kit.libs);
    this.zones = new RdZoneView(kit.libs);
    this.map.build();
    this.root.add(this.map.group, this.zones.group, this.telegraphs.group, this.effects.group);
    this.root.visible = false;
    kit.world.matchGroup.add(this.root);
  }

  setRoster(roster: readonly RdRosterEntry[]): void {
    this.roster = roster.slice();
    roster.forEach((entry) => {
      const current = this.heroes[entry.slot];
      if (current && current.entry.nick === entry.nick && JSON.stringify(current.entry.look) === JSON.stringify(entry.look) && current.entry.isMe === entry.isMe) return;
      if (current) current.dispose();
      this.heroes[entry.slot] = new RdHeroActor(this.kit.libs, this.root, this.kit.factory, this.kit.clips, this.kit.labels, entry);
    });
  }

  heroWorld(slot: number): RdPoint | null {
    const actor = this.heroes[slot];
    return actor ? { x: actor.worldX, z: actor.worldZ } : null;
  }

  unitWorld(id: number): RdPoint | null {
    if (id >= 1 && id <= RdRules.SEATS) return this.heroWorld(id - 1);
    const foe = this.foes.get(id);
    return foe ? { x: foe.worldX, z: foe.worldZ } : null;
  }

  get slowFactor(): number {
    return this.slowMo > 0 ? 0.35 : 1;
  }

  apply(state: RdMatchState, time: number, poses: (slot: number) => RdPose, localSlot: number, dt: number): void {
    this.root.visible = true;
    this.snapshot = state.snap;
    this.flow = state.flow;
    this.nowMs += dt * 1000;
    const flow = state.flow;
    const theme = RdFloorPlan.spec(flow.floor).theme;
    if (theme !== this.theme) {
      this.theme = theme;
      this.map.setTheme(theme);
    }
    const stageKey = flow.n + ":" + flow.stage;
    if (stageKey !== this.stage) {
      this.stage = stageKey;
      this.foes.forEach((actor) => actor.dispose());
      this.foes.clear();
      this.dying.forEach((actor) => actor.dispose());
      this.dying.length = 0;
      this.effects.clear();
      this.telegraphs.clear();
      this.map.closeAll();
    }
    this.map.setVaultOpen(flow.vault);
    state.snap.heroes.forEach((shot) => {
      const actor = this.heroes[shot.slot];
      if (!actor) return;
      const pose = poses(shot.slot);
      const downed = (shot.flags & RdHeroFlags.DOWN) !== 0;
      actor.setPose(pose, downed, shot.max > 0 ? shot.hp / shot.max : 0, dt, this.nowMs);
      actor.setGhost((shot.flags & RdHeroFlags.GONE) !== 0);
    });
    const seen = new Set<number>();
    state.snap.foes.forEach((shot) => {
      seen.add(shot.id);
      let actor = this.foes.get(shot.id);
      if (!actor) {
        actor = this.createFoe(shot);
        this.foes.set(shot.id, actor);
        if (actor instanceof RdFoeActor && (shot.flags & RdFoeFlags.SPAWNING) && !(shot.flags & RdFoeFlags.HIDDEN) && RdBalance.MOBS[shot.kind as RdMobKind] && RdBalance.MOBS[shot.kind as RdMobKind].spawn === "ground") actor.beginRise(this.nowMs);
      }
      if (actor instanceof RdFoeActor) actor.sync(shot, dt, this.nowMs);
      else actor.sync(shot, dt, flow.mech && flow.mech.window >= 0 ? Math.max(0, flow.mech.window - time) : -1);
    });
    this.foes.forEach((actor, id) => {
      if (seen.has(id)) return;
      if (actor instanceof RdPropActor && actor.kind === "chest" && flow.stage === "reward") return;
      this.foes.delete(id);
      if (actor instanceof RdFoeActor) {
        actor.die(this.nowMs);
        this.dying.push(actor);
      } else {
        actor.dispose();
      }
    });
    this.telegraphs.sync(state.snap.tele, state.snap.areas, time);
    const inside = localSlot >= 0 && flow.inZone.indexOf(localSlot) >= 0;
    this.zones.setReady(flow.zone, inside);
    this.zones.setZones(flow.mech && flow.mech.kind === "zones" ? flow.mech.zones : []);
  }

  private createFoe(shot: RdFoeShot): RdFoeActor | RdPropActor {
    if (shot.kind === "pillar" || shot.kind === "dummy" || shot.kind === "chest") {
      const owner = this.roster.filter((entry) => entry.slot === shot.owner)[0];
      return new RdPropActor(this.kit.libs, this.root, this.kit.library, this.kit.labels, shot.kind, shot.id, shot.owner, owner ? owner.nick : "");
    }
    return new RdFoeActor(this.kit.libs, this.root, this.kit.library, this.kit.clips, shot.kind, shot.id);
  }

  handle(events: readonly RdEvent[], localSlot: number): void {
    const w = RdViewMath.w;
    events.forEach((event) => {
      if (event.t === "dmg") {
        const point = this.unitWorld(event.id);
        if (!point) return;
        const isHero = event.id >= 1 && event.id <= RdRules.SEATS;
        this.kit.numbers.show(point.x, point.z, (event.heal ? "+" : "") + event.v, event.heal ? "heal" : isHero ? "hero" : event.v >= 60 ? "big" : "foe");
        if (event.heal) return;
        if (isHero) {
          const actor = this.heroes[event.id - 1];
          if (actor) actor.hitFlash = 0.25;
          if (event.id - 1 === localSlot) this.kit.world.rig.shake(0.12, 0.15);
        } else {
          const actor = this.foes.get(event.id);
          if (actor instanceof RdFoeActor) actor.hitFlash = 0.18;
          else if (actor) actor.hit();
        }
      } else if (event.t === "act") {
        this.animate(event.id, event.a);
      } else if (event.t === "proj") {
        this.effects.launch(event.p, event.s, w(event.x), w(event.z), event.v, () => this.unitWorld(event.to), w(event.tx), w(event.tz));
      } else if (event.t === "hitp") {
        this.effects.land(event.p);
      } else if (event.t === "fx") {
        this.effect(event);
      } else if (event.t === "spawn") {
        if (event.door >= 0) this.map.openDoor(event.door, event.door === 99 ? 3.4 : 1.8);
      } else if (event.t === "chest") {
        const actor = this.foes.get(event.id);
        if (actor instanceof RdPropActor) actor.open();
        const point = this.unitWorld(event.id);
        if (point) this.effects.burst(point.x, point.z, 1.2, "#FFD27A", 0.6);
      }
    });
  }

  private animate(id: number, action: RdAnimKey): void {
    if (id >= 1 && id <= RdRules.SEATS) {
      const actor = this.heroes[id - 1];
      if (!actor) return;
      const slot = id - 1;
      const key = action === "attack" ? "attack" + slot : action === "shoot" ? "shoot" + slot : action;
      actor.playAction(key, action === "roll" ? RdBalance.ROLL.seconds : action === "heal" ? 0.8 : 0.55, this.nowMs);
      return;
    }
    const actor = this.foes.get(id);
    if (!(actor instanceof RdFoeActor)) {
      if (actor) actor.hit();
      return;
    }
    if (action === "attack" || action === "cast" && !actor.boss) actor.playAttack(this.nowMs);
    else actor.playAction(action, this.nowMs, action === "channel" ? 30 : action === "roar" ? 1.1 : action === "rush" ? 0.8 : 0.9);
  }

  private effect(event: Extract<RdEvent, { t: "fx" }>): void {
    const handler = this.fxHandlers[event.k];
    if (!handler) return;
    const w = RdViewMath.w;
    handler(w(event.x), w(event.z), event);
  }

  private readonly fxHandlers: Partial<Record<RdFxKind, (x: number, z: number, event: Extract<RdEvent, { t: "fx" }>) => void>> = {
    taunt: (x, z, event) => { this.effects.ring(x, z, RdViewMath.w(event.r), "#5B8DEF", 0.7); this.effects.ring(x, z, 1.2, "#FFFFFF", 0.4); },
    charge: (x, z) => this.effects.ring(x, z, 1.4, "#E5604D", 0.35),
    "blast-mark": (x, z, event) => this.effects.disc(x, z, RdViewMath.w(event.r), "#FF8A3C", event.d, 0.35),
    blast: (x, z, event) => { this.effects.burst(x, z, RdViewMath.w(event.r), "#FF7A2E", 0.55); this.effects.ring(x, z, RdViewMath.w(event.r), "#FFC266", 0.45); },
    roll: (x, z) => this.effects.ring(x, z, 0.8, "#4FBF7A", 0.35),
    heal: (x, z, event) => {
      this.effects.ring(x, z, 1.1, "#7CFFB0", 0.7);
      this.effects.burst(x, z, 0.9, "#7CFFB0", 0.5);
      const from = this.heroWorld(event.d - 1);
      if (from) this.effects.beam(from.x, from.z, x, z, "#B8FFD6", 0.35);
    },
    beam: (x, z, event) => {
      const from = event.id >= 1 && event.id <= RdRules.SEATS ? this.heroWorld(event.id - 1) : null;
      if (from) this.effects.beam(from.x, from.z, x, z, "#FFE38A", 0.18);
    },
    swing: (x, z, event) => {
      const hero = event.id >= 1 && event.id <= RdRules.SEATS ? RdBalance.heroSpec(event.id - 1) : null;
      this.effects.swing(x, z, event.d, RdViewMath.w(event.r) + 0.5, hero && hero.style === "cleave" ? hero.arc : Math.PI / 2, hero ? hero.color : "#FFFFFF");
    },
    stun: (x, z) => this.effects.ring(x, z, 0.9, "#FFE066", 0.4),
    meteor: (x, z, event) => { this.effects.meteor(x, z, RdViewMath.w(event.r)); this.kit.world.rig.shake(0.35, 0.4); },
    slam: (x, z, event) => { this.effects.ring(x, z, RdViewMath.w(event.r), "#FF9A6A", 0.4); this.kit.world.rig.shake(0.18, 0.2); },
    leap: (x, z, event) => { this.effects.burst(x, z, RdViewMath.w(event.r), "#FFB27A", 0.5); this.effects.ring(x, z, RdViewMath.w(event.r), "#FFFFFF", 0.4); this.kit.world.rig.shake(0.3, 0.35); },
    "wall-stun": (x, z) => { this.effects.ring(x, z, 2.6, "#FFE066", 0.6); this.kit.world.rig.shake(0.4, 0.35); },
    crack: (x, z, event) => this.effects.crack(x, z, RdViewMath.w(event.r), event.d + RdGroundSpawn.RISE_SECONDS * 0.6),
    "pillar-break": (x, z) => this.effects.burst(x, z, 1.6, "#C58BFF", 0.6),
    "pillar-restore": (x, z) => this.effects.ring(x, z, 1.6, "#C58BFF", 0.6),
    "zone-ok": (x, z) => this.effects.ring(x, z, 6, "#4C9BFF", 1.0),
    "zone-fail": (x, z) => { this.effects.ring(x, z, 10, "#FF4040", 1.0); this.kit.world.rig.shake(0.45, 0.5); },
    "pillars-fail": (x, z) => { this.effects.ring(x, z, 10, "#FF4040", 1.0); this.kit.world.rig.shake(0.45, 0.5); },
    revive: (x, z) => this.effects.ring(x, z, 1.2, "#FFF2B0", 0.9),
    "boss-enter": () => this.kit.world.rig.shake(0.25, 1.4),
    "boss-down": () => { this.slowMo = 0.9; this.kit.world.rig.shake(0.5, 0.6); }
  };
  clearTransient(): void {
    this.effects.clear();
    this.kit.numbers.clear();
  }

  render(dt: number): void {
    this.slowMo = Math.max(0, this.slowMo - dt);
    this.kit.numbers.update(dt);
    this.map.update(dt);
    this.effects.update(dt);
    this.telegraphs.update(dt);
    this.zones.update(dt);
    this.heroes.forEach((actor) => { if (actor) actor.render(dt, this.nowMs); });
    this.foes.forEach((actor) => actor.render(dt, this.nowMs));
    for (let index = this.dying.length - 1; index >= 0; index--) {
      const actor = this.dying[index];
      actor.render(dt, this.nowMs);
      if (actor.dyingFor(this.nowMs) > 1700) {
        actor.dispose();
        this.dying.splice(index, 1);
      }
    }
  }

  dispose(): void {
    this.heroes.forEach((actor) => { if (actor) actor.dispose(); });
    this.foes.forEach((actor) => actor.dispose());
    this.dying.forEach((actor) => actor.dispose());
    this.kit.world.matchGroup.remove(this.root);
  }
}

class RdMenuBackdrop {
  private static readonly ORBIT_SECONDS = 90;
  private static readonly CYCLE = 7;

  private readonly root: Three<"Group">;
  private readonly map: RdMapView;
  private readonly effects: RdEffectManager;
  private readonly heroes: RdHeroActor[] = [];
  private readonly foes: RdFoeActor[] = [];
  private seconds = 0;
  private lastBeat = -1;
  private ready = false;

  constructor(private readonly world: RdWorldView, private readonly libs: ThreeLibs, private readonly library: RdModelLibrary) {
    this.root = new libs.THREE.Group();
    this.map = new RdMapView(libs, library);
    this.map.setTheme("#D9534F");
    this.effects = new RdEffectManager(libs);
    this.root.add(this.map.group, this.effects.group);
    world.scene.add(this.root);
  }

  prepare(factory: CharacterModelFactory, clips: Map<string, Three<"AnimationClip">>, labels: RkLabelFactory): void {
    if (this.ready) return;
    this.ready = true;
    this.map.build();
    for (let slot = 0; slot < RdRules.SEATS; slot++) {
      const look = CharacterLooks.random();
      this.heroes.push(new RdHeroActor(this.libs, this.root, factory, clips, labels, { slot, nick: RdBalance.heroSpec(slot).name, look, isMe: false, isBot: true }));
    }
    const kinds: RdMobKind[] = ["warrior", "minion", "rogue", "mage"];
    kinds.forEach((kind, index) => this.foes.push(new RdFoeActor(this.libs, this.root, this.library, clips, kind, 1000 + index)));
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  render(dt: number): void {
    this.seconds += dt;
    if (!this.ready) {
      this.map.update(dt);
      this.world.rig.orbit(17, 11, (this.seconds / RdMenuBackdrop.ORBIT_SECONDS) * Math.PI * 2, 0, 1.5);
      this.world.render(dt);
      return;
    }
    const nowMs = this.seconds * 1000;
    const phase = (this.seconds % RdMenuBackdrop.CYCLE) / RdMenuBackdrop.CYCLE;
    const beat = Math.floor(this.seconds / 0.9);
    const heroSpots: RdPoint[] = [{ x: -100, z: 250 }, { x: 150, z: 180 }, { x: -650, z: 650 }, { x: 600, z: 700 }, { x: 0, z: 850 }];
    this.heroes.forEach((actor, slot) => {
      const base = heroSpots[slot];
      const sway = Math.sin(this.seconds * 0.8 + slot) * 60;
      const x = base.x + sway, z = base.z + Math.cos(this.seconds * 0.6 + slot * 2) * 40;
      const target = this.foes[slot % this.foes.length];
      const yaw = RdMath.yawOf(target.worldX - RdViewMath.w(x), target.worldZ - RdViewMath.w(z));
      actor.setPose({ x, z, yaw, moving: Math.abs(Math.cos(this.seconds * 0.8 + slot)) > 0.7, dash: false }, false, 0.6 + 0.4 * Math.abs(Math.sin(this.seconds * 0.2 + slot)), dt, nowMs);
    });
    this.foes.forEach((actor, index) => {
      const angle = -Math.PI / 2 + (index - 1.5) * 0.45;
      const radius = 900 - phase * 300;
      const x = Math.cos(angle) * radius * 0.8, z = -200 + Math.sin(angle) * radius * 0.6;
      actor.sync({ id: actor.id, kind: actor.kind, x, z, yaw: RdMath.yawOf(-x, 400 - z), hp: Math.round(1000 * (1 - phase * 0.8)), flags: RdFoeFlags.MOVING, owner: -1 }, dt, nowMs);
    });
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      const slot = beat % RdRules.SEATS;
      const actor = this.heroes[slot];
      const foe = this.foes[beat % this.foes.length];
      const spec = RdBalance.heroSpec(slot);
      actor.playAction(spec.style === "slash" || spec.style === "cleave" ? "attack" + slot : "shoot" + slot, 0.55, nowMs);
      if (spec.style === "orb" || spec.style === "arrow") this.effects.launch(beat, spec.style === "orb" ? "orb" : "arrow", actor.worldX, actor.worldZ, 1600, () => ({ x: foe.worldX, z: foe.worldZ }), foe.worldX, foe.worldZ);
      if (spec.style === "beam") this.effects.beam(actor.worldX, actor.worldZ, foe.worldX, foe.worldZ, "#FFE38A", 0.2);
      if (beat % 3 === 0) foe.playAttack(nowMs);
      if (beat % 7 === 0) this.effects.burst(foe.worldX, foe.worldZ, 2.2, "#FF7A2E", 0.5);
    }
    this.heroes.forEach((actor) => actor.render(dt, nowMs));
    this.foes.forEach((actor) => actor.render(dt, nowMs));
    this.effects.update(dt);
    this.map.update(dt);
    this.world.rig.orbit(17, 11, (this.seconds / RdMenuBackdrop.ORBIT_SECONDS) * Math.PI * 2, 0, 1.5);
    this.world.render(dt);
  }
}
