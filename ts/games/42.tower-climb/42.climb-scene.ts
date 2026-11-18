interface ClimbModelPart { geometry: TileGeometry; material: Three<"Material"> }

class ClimbModel {
  constructor(readonly parts: ClimbModelPart[], readonly min: Three<"Vector3">, readonly max: Three<"Vector3">) {}
  get sizeX(): number { return this.max.x - this.min.x; }
  get sizeY(): number { return this.max.y - this.min.y; }
  get sizeZ(): number { return this.max.z - this.min.z; }
  get centerX(): number { return (this.max.x + this.min.x) / 2; }
  get centerZ(): number { return (this.max.z + this.min.z) / 2; }
}

class ClimbModelLibrary {
  static readonly DIRECTORY = "assets/kaykit/";
  static readonly EXTRA_CLIPS = "animations/glassbridge_anims.glb";
  static readonly FILES: Readonly<Record<string, string>> = {
    grass: "blocks/grass.gltf", dirt: "blocks/dirt_with_grass.gltf", stone: "blocks/stone.gltf", wood: "blocks/wood.gltf",
    yellow: "blocks/striped_block_yellow.gltf", red: "blocks/colored_block_red.gltf",
    barrel: "dungeon/barrel_large.gltf", door: "dungeon/wall_doorway.gltf",
    pebble: "forest/Rock_1_A_Color1.gltf", boulder: "forest/Rock_3_C_Color1.gltf", bush: "forest/Bush_1_C_Color1.gltf",
    tuft: "forest/Grass_1_A_Singlesided_Color1.gltf", treeA: "forest/Tree_1_B_Color1.gltf", treeB: "forest/Tree_2_B_Color1.gltf", treeC: "forest/Tree_4_B_Color1.gltf",
    foundation: "dungeon/floor_foundation_allsides.gltf",
    ruinHouse: "medieval-hexagon/building_destroyed.gltf", houseA: "medieval-hexagon/building_home_A_blue.gltf", houseB: "medieval-hexagon/building_home_B_blue.gltf",
    watchtower: "medieval-hexagon/building_tower_A_blue.gltf", church: "medieval-hexagon/building_church_blue.gltf", rampart: "medieval-hexagon/wall_straight.gltf",
    turret: "medieval-hexagon/building_tower_base_blue.gltf", hexIsle: "medieval-hexagon/hex_grass.gltf", crate: "medieval-hexagon/crate_A_big.gltf", barrelProp: "medieval-hexagon/barrel.gltf",
    boxLarge: "dungeon/box_large.gltf", tile: "dungeon/floor_tile_large.gltf", dungeonWall: "dungeon/wall.gltf", pillar: "dungeon/pillar.gltf", torch: "dungeon/torch_lit.gltf", rubble: "dungeon/rubble_large.gltf",
    kitchenTable: "kitchen/kitchentable_A.gltf", roundTable: "kitchen/table_round_A.gltf", counter: "kitchen/kitchencounter_straight_A.gltf", stove: "kitchen/stove_multi.gltf",
    fridge: "kitchen/fridge_A.gltf", board: "kitchen/cuttingboard.gltf", plate: "kitchen/plate.gltf", oven: "kitchen/oven.gltf", pot: "kitchen/pot_large.gltf",
    tomato: "kitchen/food_ingredient_tomato.gltf", cheese: "kitchen/food_ingredient_cheese.gltf", kitchenFloor: "kitchen/floor_kitchen.gltf",
    gravePillar: "graveyard/pillar.gltf", coffin: "graveyard/coffin.gltf", plaque: "graveyard/plaque.gltf", dirtPlot: "graveyard/floor_dirt.gltf", pumpkin: "graveyard/pumpkin_orange.gltf",
    crypt: "graveyard/crypt.gltf", grave: "graveyard/grave_A.gltf", gravestone: "graveyard/gravestone.gltf", fence: "graveyard/fence.gltf", lantern: "graveyard/pumpkin_orange_jackolantern.gltf",
    deadTree: "graveyard/tree_dead_large.gltf",
    wagon: "holiday/train_wagon.gltf", giftRed: "holiday/present_D_red.gltf", giftGreen: "holiday/present_D_green.gltf", giftBlue: "holiday/present_D_blue.gltf",
    giftTallRed: "holiday/present_B_red.gltf", giftTallGreen: "holiday/present_B_green.gltf", giftLongGreen: "holiday/present_F_green.gltf", giftLongBlue: "holiday/present_F_blue.gltf",
    gingerHouse: "holiday/gingerbread_house_decorated.gltf", holidayLantern: "holiday/lantern.gltf", snowBlock: "blocks/snow.gltf", snowman: "snow/snowman_A.gltf",
    roofPlate: "space-base/roofmodule_base.gltf", marsBlock: "space-base/terrain_low.gltf", marsTall: "space-base/terrain_tall.gltf",
    marsRock: "space-base/rock_B.gltf", marsRocks: "space-base/rocks_B.gltf", frameTall: "space-base/structure_tall.gltf",
    domeModule: "space-base/basemodule_E.gltf", baseModule: "space-base/basemodule_A.gltf", cargoDepot: "space-base/cargodepot_A.gltf",
    landingPad: "space-base/landingpad_large.gltf", lander: "space-base/lander_A.gltf", windTurbine: "space-base/windturbine_tall.gltf",
    solarPanel: "space-base/solarpanel.gltf", spaceTruck: "space-base/spacetruck.gltf", drill: "space-base/drill_structure.gltf", cargoStack: "space-base/cargo_A_stacked.gltf",
  };

  static readonly TINTS: Readonly<Record<string, number>> = { hexIsle: 0x9FB878 };

  readonly clips = new Map<string, Three<"AnimationClip">>();
  readonly progress = new CharacterLoadProgress();
  onProgress: (progress: CharacterLoadProgress) => void = () => undefined;
  private readonly models = new Map<string, ClimbModel>();
  private readonly lambert = new Map<string, Three<"MeshLambertMaterial">>();

  constructor(private readonly libs: ThreeLibs) {}

  async load(baseClips: Map<string, Three<"AnimationClip">>): Promise<void> {
    const loader = new this.libs.GLTFLoader(), D = ClimbModelLibrary.DIRECTORY;
    baseClips.forEach((clip, name) => this.clips.set(name, clip));
    const names = Object.keys(ClimbModelLibrary.FILES);
    this.progress.total = names.length + 1;
    this.onProgress(this.progress);
    const [extra, ...scenes] = await Promise.all([this.fetch(loader, D + ClimbModelLibrary.EXTRA_CLIPS), ...names.map((name) => this.fetch(loader, D + ClimbModelLibrary.FILES[name]))]);
    extra.animations.forEach((clip) => { if (!this.clips.has(clip.name)) this.clips.set(clip.name, clip); });
    scenes.forEach((gltf, index) => this.models.set(names[index], this.flatten(gltf.scene)));
    Object.entries(ClimbModelLibrary.TINTS).forEach(([name, color]) => this.tint(name, color));
    new ClimbSpaceKit(this.libs, this).registerInto(this);
  }

  private fetch(loader: InstanceType<GLTFLoaderClass>, url: string): Promise<CharacterGltf> {
    return loader.loadAsync(url).then((gltf) => {
      this.progress.done++;
      this.onProgress(this.progress);
      return gltf as CharacterGltf;
    });
  }

  private tint(name: string, color: number): void {
    for (const part of this.model(name).parts) {
      const material = (part.material as Three<"MeshLambertMaterial">).clone();
      material.color.setHex(color);
      part.material = material;
    }
  }

  register(name: string, model: ClimbModel): void { this.models.set(name, model); }

  model(name: string): ClimbModel {
    const found = this.models.get(name);
    if (!found) throw new Error("모델이 없어요: " + name);
    return found;
  }

  private flatten(scene: Three<"Object3D">): ClimbModel {
    const THREE = this.libs.THREE, parts: ClimbModelPart[] = [], box = new THREE.Box3();
    scene.updateMatrixWorld(true);
    scene.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (!mesh.isMesh) return;
      const geometry = (mesh.geometry as TileGeometry).clone().applyMatrix4(mesh.matrixWorld);
      geometry.computeBoundingBox();
      box.union(geometry.boundingBox as Three<"Box3">);
      parts.push({ geometry, material: this.lambertOf(mesh.material as Three<"MeshStandardMaterial">) });
    });
    return new ClimbModel(parts, box.min.clone(), box.max.clone());
  }

  private lambertOf(source: Three<"MeshStandardMaterial">): Three<"MeshLambertMaterial"> {
    const key = source.map ? source.map.uuid : "#" + source.color.getHexString();
    let material = this.lambert.get(key);
    if (!material) {
      material = this.closedBelow(new this.libs.THREE.MeshLambertMaterial({ map: source.map, color: source.map ? 0xffffff : source.color }));
      this.lambert.set(key, material);
    }
    return material;
  }

  private closedBelow(material: Three<"MeshLambertMaterial">): Three<"MeshLambertMaterial"> {
    material.side = this.libs.THREE.DoubleSide;
    material.shadowSide = this.libs.THREE.BackSide;
    return material;
  }

  grayOf(material: Three<"Material">): Three<"MeshLambertMaterial"> {
    const THREE = this.libs.THREE, source = material as Three<"MeshLambertMaterial">;
    if (!source.map) return this.closedBelow(new THREE.MeshLambertMaterial({ color: 0x8A8A8A }));
    const image = source.map.image as HTMLImageElement, canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height), pixels = data.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = pixels[i] * 0.3 + pixels[i + 1] * 0.59 + pixels[i + 2] * 0.11;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
    }
    context.putImageData(data, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = source.map.flipY;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = source.map.magFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return this.closedBelow(new THREE.MeshLambertMaterial({ map: texture }));
  }
}

class ClimbInstanceBatcher {
  private readonly lists = new Map<string, Three<"Matrix4">[]>();

  constructor(private readonly libs: ThreeLibs, private readonly library: ClimbModelLibrary) {}

  add(model: string, matrix: Three<"Matrix4">): void {
    const list = this.lists.get(model);
    if (list) list.push(matrix); else this.lists.set(model, [matrix]);
  }

  build(parent: Three<"Object3D">, castShadow: boolean): void {
    this.lists.forEach((matrices, name) => {
      for (const part of this.library.model(name).parts) {
        const mesh = new this.libs.THREE.InstancedMesh(part.geometry, part.material, matrices.length);
        matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    });
    this.lists.clear();
  }
}

interface ClimbRiderEntry { piece: PlatformPiece; local: Three<"Matrix4"> }

class ClimbSpaceKit {
  static readonly STEEL = 0x56636F;
  static readonly PLATE = 0xD5DDE3;
  static readonly GLOW = 0x6EE0FF;
  static readonly ICE = 0x9FD8F2;
  static readonly ICE_TOP = 0xEAF8FF;
  static readonly WARN = 0xD97B4F;
  static readonly DARK = 0x2A2E36;
  static readonly RED = 0xE0483A;
  static readonly ISLE_DEPTH = 3.5;

  constructor(private readonly libs: ThreeLibs, private readonly source: ClimbModelLibrary) {}

  private lambert(color: number, opacity = 1): Three<"MeshLambertMaterial"> {
    return new this.libs.THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  }
  private glow(color: number): Three<"MeshBasicMaterial"> { return new this.libs.THREE.MeshBasicMaterial({ color }); }

  private box(width: number, height: number, depth: number, y: number, material: Three<"Material">): ClimbModelPart {
    return { geometry: new this.libs.THREE.BoxGeometry(width, height, depth).translate(0, y, 0) as unknown as TileGeometry, material };
  }

  private model(parts: ClimbModelPart[]): ClimbModel {
    const THREE = this.libs.THREE, box = new THREE.Box3();
    for (const part of parts) { part.geometry.computeBoundingBox(); box.union(part.geometry.boundingBox as Three<"Box3">); }
    return new ClimbModel(parts, box.min.clone(), box.max.clone());
  }

  private fitted(name: string, low: readonly number[], high: readonly number[], upsideDown = false, material?: Three<"Material">): ClimbModelPart[] {
    const THREE = this.libs.THREE, source = this.source.model(name), bounds = new THREE.Box3();
    const geometries = source.parts.map((part) => {
      const geometry = part.geometry.clone();
      if (upsideDown) geometry.rotateX(Math.PI);
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox as Three<"Box3">);
      return geometry;
    });
    const size = bounds.getSize(new THREE.Vector3());
    return geometries.map((geometry, index) => {
      geometry.translate(-bounds.min.x, -bounds.min.y, -bounds.min.z);
      geometry.scale((high[0] - low[0]) / size.x, (high[1] - low[1]) / size.y, (high[2] - low[2]) / size.z);
      geometry.translate(low[0], low[1], low[2]);
      return { geometry, material: material ?? source.parts[index].material };
    });
  }

  private deck(): ClimbModel {
    return this.model([...this.fitted("roofPlate", [-0.44, -0.1, -0.44], [0.44, 0, 0.44]), this.box(1, 0.06, 1, -0.07, this.lambert(ClimbSpaceKit.STEEL)), ...this.fitted("marsBlock", [-0.5, -1, -0.5], [0.5, -0.1, 0.5])]);
  }

  private ice(): ClimbModel {
    const K = ClimbSpaceKit;
    return this.model([...this.fitted("marsBlock", [-0.5, -1, -0.5], [0.5, 0, 0.5], false, this.lambert(K.ICE, 0.78)), this.box(0.9, 0.04, 0.9, -0.03, this.lambert(K.ICE_TOP)), this.box(1.02, 0.08, 1.02, -0.5, this.glow(0xFFFFFF))]);
  }

  private crumble(): ClimbModel {
    const K = ClimbSpaceKit;
    return this.model([...this.fitted("marsRock", [-0.5, -1, -0.5], [0.5, -0.1, 0.5], true), this.box(1, 0.06, 1, -0.11, this.lambert(K.DARK)), this.box(0.96, 0.08, 0.96, -0.04, this.lambert(K.WARN))]);
  }

  private mast(): ClimbModel {
    const K = ClimbSpaceKit;
    return this.model([...this.fitted("frameTall", [-0.5, -1, -0.5], [0.5, 0, 0.5]), ...[-0.25, -0.6].map((y) => this.box(1.03, 0.06, 1.03, y, this.glow(K.RED)))]);
  }

  registerInto(library: ClimbModelLibrary): void {
    const K = ClimbSpaceKit;
    library.register("spaceDeck", this.deck());
    library.register("spaceIce", this.ice());
    library.register("spaceCrumble", this.crumble());
    library.register("spaceMast", this.mast());
    library.register("spaceIsle", this.model(this.fitted("marsTall", [-4.6, -K.ISLE_DEPTH, -4.2], [4.6, 0, 4.2])));
  }
}

abstract class ClimbPiecePoser {
  abstract place(piece: PlatformPiece, blend: number, out: Three<"Matrix4">): void;
}

class ClimbRidePoser extends ClimbPiecePoser {
  place(piece: PlatformPiece, blend: number, out: Three<"Matrix4">): void {
    const p = piece as MovingPlatform;
    out.makeRotationY(p.prevYaw + (p.yaw - p.prevYaw) * blend);
    out.setPosition(p.prevX + (p.x - p.prevX) * blend, p.prevTop + (p.top - p.prevTop) * blend, p.prevZ + (p.z - p.prevZ) * blend);
  }
}

class ClimbCrumblePoser extends ClimbPiecePoser {
  static readonly SHAKE = 0.07;
  static readonly SHAKE_RATE = 55;
  static readonly FALL_GRAVITY = 18;
  static readonly FALL_SHOWN = 1.1;

  place(piece: PlatformPiece, _blend: number, out: Three<"Matrix4">): void {
    const P = ClimbCrumblePoser, p = piece as CrumblePlatform, wobble = p.shaking * P.SHAKE, age = Math.max(0, p.age), fall = p.fallTime;
    if (p.gone && fall > P.FALL_SHOWN) { out.makeScale(0, 0, 0); return; }
    const drop = P.FALL_GRAVITY * fall * fall / 2;
    out.makeRotationY(p.yaw + (p.gone ? fall * 0.8 : 0));
    out.setPosition(p.x + Math.sin(age * P.SHAKE_RATE) * wobble, p.top - drop, p.z + Math.cos(age * P.SHAKE_RATE * 1.3) * wobble);
  }
}

class ClimbRiderBatch {
  private readonly meshes: Three<"InstancedMesh">[] = [];
  private readonly pose: Three<"Matrix4">;
  private readonly world: Three<"Matrix4">;

  constructor(libs: ThreeLibs, model: ClimbModel, private readonly entries: ClimbRiderEntry[], readonly stage: number, parent: Three<"Object3D">, private readonly poser: ClimbPiecePoser) {
    const THREE = libs.THREE;
    this.pose = new THREE.Matrix4();
    this.world = new THREE.Matrix4();
    for (const part of model.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, entries.length);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes.push(mesh);
      parent.add(mesh);
    }
    this.follow(1);
  }

  follow(blend: number): void {
    this.entries.forEach((entry, index) => {
      this.poser.place(entry.piece, blend, this.pose);
      this.world.multiplyMatrices(this.pose, entry.local);
      for (const mesh of this.meshes) mesh.setMatrixAt(index, this.world);
    });
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
}

class ClimbDecorDice {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 1; }
  next(): number {
    let s = this.state;
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    this.state = s;
    return s / 4294967296;
  }
  between(low: number, high: number): number { return low + (high - low) * this.next(); }
}

class ClimbSweeperView {
  static readonly BEAM = 0xE0483A;
  static readonly CAP = 0xFFF1E0;
  static readonly POST = 0x6A7480;
  static readonly POST_HEIGHT = 0.5;

  private readonly spins: { piece: SweeperBar; beam: Three<"Group"> }[] = [];

  constructor(libs: ThreeLibs, pieces: readonly PlatformPiece[], groupOf: (stage: number) => Three<"Group">) {
    const THREE = libs.THREE, V = ClimbSweeperView;
    const beamMaterial = new THREE.MeshLambertMaterial({ color: V.BEAM }), capMaterial = new THREE.MeshBasicMaterial({ color: V.CAP }), postMaterial = new THREE.MeshLambertMaterial({ color: V.POST });
    for (const piece of pieces) {
      if (!(piece instanceof SweeperBar)) continue;
      const height = piece.top - piece.bottom, beam = new THREE.Group(), length = piece.halfX * 2, width = piece.halfZ * 2;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), beamMaterial);
      bar.castShadow = true;
      beam.add(bar);
      for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, height + 0.04, width + 0.04), capMaterial);
        cap.position.x = side * (length / 2 - 0.15);
        beam.add(cap);
      }
      beam.position.set(piece.x, piece.top - height / 2, piece.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, V.POST_HEIGHT, 10), postMaterial);
      post.position.set(piece.x, piece.bottom - V.POST_HEIGHT / 2, piece.z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 14), postMaterial);
      base.position.set(piece.x, piece.bottom - V.POST_HEIGHT + 0.06, piece.z);
      groupOf(piece.stage).add(beam, post, base);
      this.spins.push({ piece, beam });
    }
  }

  follow(seconds: number): void { for (const spin of this.spins) spin.beam.rotation.y = spin.piece.angleAt(seconds); }
}

class ClimbWindView {
  static readonly STREAKS = 40;
  static readonly STREAK_LENGTH = 1.4;
  static readonly FLOW = 9;

  private readonly zones: { piece: WindZone; mesh: Three<"InstancedMesh">; material: Three<"MeshBasicMaterial">; seeds: number[][] }[] = [];
  private readonly matrix: Three<"Matrix4">;
  private readonly hidden: Three<"Matrix4">;

  constructor(libs: ThreeLibs, pieces: readonly PlatformPiece[], groupOf: (stage: number) => Three<"Group">) {
    const THREE = libs.THREE, V = ClimbWindView, dice = new ClimbDecorDice(77), geometry = new THREE.BoxGeometry(0.05, 0.05, V.STREAK_LENGTH);
    this.matrix = new THREE.Matrix4();
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const piece of pieces) {
      if (!(piece instanceof WindZone)) continue;
      const material = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.InstancedMesh(geometry, material, V.STREAKS);
      mesh.frustumCulled = false;
      const seeds = Array.from({ length: V.STREAKS }, () => [dice.between(-piece.halfX, piece.halfX), dice.between(-piece.halfZ, piece.halfZ), dice.between(piece.bottom, piece.top), dice.next()]);
      groupOf(piece.stage).add(mesh);
      this.zones.push({ piece, mesh, material, seeds });
    }
  }

  follow(seconds: number): void {
    const V = ClimbWindView;
    for (const zone of this.zones) {
      const piece = zone.piece, strength = piece.strengthAt(seconds), reach = (piece.halfX + piece.halfZ) * 2, yaw = piece.gust.dirDeg * Math.PI / 180;
      zone.material.opacity = 0.06 + 0.5 * strength;
      zone.seeds.forEach((seed, index) => {
        const travel = ((seed[3] * reach + seconds * V.FLOW) % reach) - reach / 2;
        const x = piece.worldX(seed[0], seed[1]) + piece.dirX * travel, z = piece.worldZ(seed[0], seed[1]) + piece.dirZ * travel;
        if (!piece.covers(x, z)) { zone.mesh.setMatrixAt(index, this.hidden); return; }
        this.matrix.makeRotationY(yaw);
        this.matrix.setPosition(x, seed[2], z);
        zone.mesh.setMatrixAt(index, this.matrix);
      });
      zone.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

class ClimbSkyTint {
  static readonly SPACE = 0x3B2440;
  static readonly FROM = 178;
  static readonly TO = 194;

  private readonly ground: Three<"Color">;
  private readonly space: Three<"Color">;
  private shown = -1;

  constructor(libs: ThreeLibs, private readonly scene: Three<"Scene">, sky: number) {
    this.ground = new libs.THREE.Color(sky);
    this.space = new libs.THREE.Color(ClimbSkyTint.SPACE);
  }

  follow(height: number): void {
    const S = ClimbSkyTint, mix = Math.round(Math.max(0, Math.min(1, (height - S.FROM) / (S.TO - S.FROM))) * 50) / 50;
    if (mix === this.shown) return;
    this.shown = mix;
    const background = this.scene.background as Three<"Color">, fog = this.scene.fog as Three<"Fog">;
    background.copy(this.ground).lerp(this.space, mix);
    fog.color.copy(background);
  }
}

class TowerLevelBuilder {
  static readonly BLOCK_OF_LOOK: Readonly<Record<string, string>> = {
    deck: "grass", block: "dirt", root: "dirt", rock: "stone", stump: "dirt", log: "wood", ramp: "wood", pad: "yellow",
    ruin: "foundation", slab: "stone", beam: "wood",
    deck7: "spaceDeck", ice7: "spaceIce", crumble7: "spaceCrumble", mast7: "spaceMast",
  };
  static readonly SPACE_ISLANDS: readonly (readonly [number, number, number])[] = [
    [20, 34, 184], [80, 36, 192], [140, 33, 198], [200, 35, 188], [255, 34, 195], [330, 36, 186],
  ];
  static readonly HAZARD_LOOKS: readonly string[] = ["sweeper7", "wind7"];
  static readonly RUIN_ISLANDS: readonly (readonly [number, number, number, string])[] = [
    [15, 34, 33, "church"], [75, 36, 39, "ruinHouse"], [130, 33, 45, "watchtower"], [195, 35, 50, "ruinHouse"], [285, 34, 42, "watchtower"], [330, 36, 54, "church"],
  ];
  static readonly HOUSE_SCALE = 4.2;
  static readonly DUNGEON_ISLANDS: readonly (readonly [number, number, number])[] = [
    [20, 34, 64], [80, 36, 72], [140, 33, 80], [200, 35, 68], [260, 34, 84], [320, 36, 76],
  ];
  static readonly KITCHEN_ISLANDS: readonly (readonly [number, number, number])[] = [
    [10, 35, 96], [70, 33, 104], [130, 36, 112], [190, 34, 100], [250, 36, 108], [310, 33, 116],
  ];
  static readonly GRAVE_ISLANDS: readonly (readonly [number, number, number])[] = [
    [40, 34, 126], [100, 36, 134], [160, 33, 142], [220, 35, 130], [280, 36, 138], [340, 33, 146],
  ];
  static readonly TRUNK_SEGMENT = 5.9;
  static readonly MARK_COLOR = 0xFF9A4A;
  static readonly TREES: readonly string[] = ["treeA", "treeB", "treeC"];

  static readonly SNOW_ISLANDS: readonly (readonly [number, number, number])[] = [
    [30, 34, 156], [90, 36, 164], [150, 33, 172], [210, 35, 160], [270, 34, 168], [330, 36, 176],
  ];

  readonly root: Three<"Group">;
  readonly stageGroups = new Map<number, Three<"Group">>();
  private readonly batchers = new Map<number, ClimbInstanceBatcher>();
  private readonly riderLists = new Map<string, { stage: number; model: string; entries: ClimbRiderEntry[]; poser: ClimbPiecePoser }>();
  private readonly riders: ClimbRiderBatch[] = [];
  private readonly ridePoser = new ClimbRidePoser();
  private readonly crumblePoser = new ClimbCrumblePoser();
  private readonly sweepers: ClimbSweeperView;
  private readonly winds: ClimbWindView;
  private riding: PlatformPiece | null = null;
  private readonly ridingInverse: Three<"Matrix4">;
  private readonly marks = new Map<number, Three<"Matrix4">[]>();
  private readonly specials: Record<string, (piece: PlatformPiece) => void>;

  constructor(private readonly libs: ThreeLibs, private readonly library: ClimbModelLibrary, private readonly level: TowerLevel) {
    this.root = new libs.THREE.Group();
    this.ridingInverse = new libs.THREE.Matrix4();
    this.specials = {
      island: (piece) => this.island(piece),
      trunk: (piece) => this.trunk(piece),
      hold: (piece) => this.hold(piece as GrabHold),
      rest: (piece) => this.rest(piece),
      summit: (piece) => this.summit(piece),
    };
    for (const piece of level.pieces) this.draw(piece);
    this.sweepers = new ClimbSweeperView(libs, level.pieces, (stage) => this.groupOf(stage));
    this.winds = new ClimbWindView(libs, level.pieces, (stage) => this.groupOf(stage));
    this.decorate();
    this.decorateSpace();
    this.decorateRuins();
    this.decorateDungeon();
    this.decorateKitchen();
    this.decorateGraveyard();
    this.decorateSnow();
    this.batchers.forEach((batcher, stage) => batcher.build(this.groupOf(stage), true));
    this.riderLists.forEach((list) => this.riders.push(new ClimbRiderBatch(libs, library.model(list.model), list.entries, list.stage, this.groupOf(list.stage), list.poser)));
    this.buildMarks();
  }

  showAround(stage: number): void {
    this.stageGroups.forEach((group, index) => { group.visible = index === 0 || Math.abs(index - stage) <= 1; });
  }

  showEvery(): void { this.stageGroups.forEach((group) => { group.visible = true; }); }

  followRiders(blend: number, seconds: number): void {
    for (const rider of this.riders) if (this.groupOf(rider.stage).visible) rider.follow(blend);
    if (this.groupOf(ClimbBalance.STAGE_COUNT).visible) { this.sweepers.follow(seconds); this.winds.follow(seconds); }
  }

  private poserOf(piece: PlatformPiece): ClimbPiecePoser { return piece instanceof MovingPlatform ? this.ridePoser : this.crumblePoser; }

  private addModel(stage: number, name: string, matrix: Three<"Matrix4">): void {
    if (!this.riding) { this.batcherOf(stage).add(name, matrix); return; }
    const poser = this.poserOf(this.riding), key = stage + "|" + name + "|" + (poser === this.ridePoser ? "ride" : "crumble"), local = matrix.clone().premultiply(this.ridingInverse);
    const list = this.riderLists.get(key);
    if (list) list.entries.push({ piece: this.riding, local });
    else this.riderLists.set(key, { stage, model: name, entries: [{ piece: this.riding, local }], poser });
  }

  private drawRider(piece: PlatformPiece): void {
    const THREE = this.libs.THREE;
    this.ridingInverse.copy(new THREE.Matrix4().makeRotationY(piece.yaw).setPosition(piece.x, piece.top, piece.z)).invert();
    this.riding = piece;
    this.drawShape(piece);
    this.riding = null;
  }

  private groupOf(stage: number): Three<"Group"> {
    let group = this.stageGroups.get(stage);
    if (!group) { group = new this.libs.THREE.Group(); this.stageGroups.set(stage, group); this.root.add(group); }
    return group;
  }

  private batcherOf(stage: number): ClimbInstanceBatcher {
    let batcher = this.batchers.get(stage);
    if (!batcher) { batcher = new ClimbInstanceBatcher(this.libs, this.library); this.batchers.set(stage, batcher); }
    return batcher;
  }

  private fit(model: ClimbModel, x: number, top: number, z: number, yaw: number, tilt: number, sx: number, sy: number, sz: number): Three<"Matrix4"> {
    const THREE = this.libs.THREE;
    const matrix = new THREE.Matrix4().makeTranslation(x, top, z);
    matrix.multiply(new THREE.Matrix4().makeRotationY(yaw));
    if (tilt) matrix.multiply(new THREE.Matrix4().makeRotationZ(tilt));
    matrix.multiply(new THREE.Matrix4().makeScale(sx / model.sizeX, sy / model.sizeY, sz / model.sizeZ));
    matrix.multiply(new THREE.Matrix4().makeTranslation(-model.centerX, -model.max.y, -model.centerZ));
    return matrix;
  }

  private draw(piece: PlatformPiece): void {
    if (piece.look === TowerPropShapes.HIDDEN || TowerLevelBuilder.HAZARD_LOOKS.includes(piece.look)) return;
    if (piece instanceof MovingPlatform || piece instanceof CrumblePlatform) this.drawRider(piece); else this.drawShape(piece);
  }

  private drawShape(piece: PlatformPiece): void {
    const shape = TowerPropShapes.of(piece.look), special = this.specials[piece.look];
    if (shape) this.prop(piece, shape); else if (special) special(piece); else this.block(piece);
  }

  private prop(piece: PlatformPiece, shape: ClimbPropShape): void {
    const THREE = this.libs.THREE;
    const wide = (piece.round ? piece.radius * 2 : piece.halfX * 2) / shape.span, tall = piece.depth / (shape.top - shape.base);
    const matrix = new THREE.Matrix4().makeTranslation(piece.x, piece.top, piece.z);
    matrix.multiply(new THREE.Matrix4().makeRotationY(piece.yaw + shape.turn));
    matrix.multiply(new THREE.Matrix4().makeScale(wide, tall, wide));
    matrix.multiply(new THREE.Matrix4().makeTranslation(-shape.cx, -shape.top, -shape.cz));
    this.addModel(piece.stage, shape.model, matrix);
    if (shape.cap) this.capOn(piece, shape.cap, wide, tall);
  }

  private capOn(piece: PlatformPiece, name: string, wide: number, tall: number): void {
    const THREE = this.libs.THREE, model = this.library.model(name);
    const matrix = new THREE.Matrix4().makeTranslation(piece.x, piece.top, piece.z);
    matrix.multiply(new THREE.Matrix4().makeRotationY(piece.yaw));
    matrix.multiply(new THREE.Matrix4().makeScale(wide, tall, wide));
    matrix.multiply(new THREE.Matrix4().makeTranslation(-model.centerX, -model.max.y, -model.centerZ));
    this.addModel(piece.stage, name, matrix);
  }

  private block(piece: PlatformPiece): void {
    const name = TowerLevelBuilder.BLOCK_OF_LOOK[piece.look] ?? "grass", model = this.library.model(name);
    const tilt = Math.atan2(piece.rise, piece.halfX * 2), length = piece.halfX * 2 / Math.cos(tilt);
    this.addModel(piece.stage, name, this.fit(model, piece.x, piece.top, piece.z, piece.yaw, tilt, length, piece.depth, piece.halfZ * 2));
  }

  private trunk(piece: PlatformPiece): void {
    const model = this.library.model("barrel"), T = TowerLevelBuilder, height = piece.top - piece.bottom, count = Math.ceil(height / T.TRUNK_SEGMENT), each = height / count;
    for (let i = 0; i < count; i++)
      this.batcherOf(piece.stage).add("barrel", this.fit(model, piece.x, piece.top - each * i, piece.z, i * 0.7, 0, piece.radius * 2, each, piece.radius * 2));
  }

  private marksOf(stage: number): Three<"Matrix4">[] {
    let list = this.marks.get(stage);
    if (!list) { list = []; this.marks.set(stage, list); }
    return list;
  }

  private rest(piece: PlatformPiece): void {
    const THREE = this.libs.THREE, group = this.groupOf(piece.stage);
    this.batcherOf(piece.stage).add("barrel", this.fit(this.library.model("barrel"), piece.x, piece.top, piece.z, 0, 0, piece.radius * 2, piece.depth, piece.radius * 2));
    this.batcherOf(piece.stage).add("wood", this.fit(this.library.model("wood"), piece.x, piece.top + 3.2, piece.z, 0, 0, 0.16, 3.2, 0.16));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshBasicMaterial({ color: 0xD97B4F, side: THREE.DoubleSide }));
    flag.position.set(piece.x + 0.73, piece.top + 2.75, piece.z);
    group.add(flag);
  }

  private summit(piece: PlatformPiece): void {
    const THREE = this.libs.THREE, group = this.groupOf(piece.stage), K = ClimbSpaceKit;
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(piece.radius, piece.radius * 0.7, piece.depth, 40), new THREE.MeshLambertMaterial({ color: K.STEEL }));
    deck.position.set(piece.x, piece.top - piece.depth / 2, piece.z);
    deck.receiveShadow = true;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(piece.radius - 0.15, piece.radius - 0.15, 0.06, 40), new THREE.MeshLambertMaterial({ color: K.PLATE }));
    plate.position.set(piece.x, piece.top - 0.03, piece.z);
    plate.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(piece.radius, 0.08, 6, 48), new THREE.MeshBasicMaterial({ color: K.GLOW }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(piece.x, piece.top - 0.2, piece.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 8), new THREE.MeshLambertMaterial({ color: K.PLATE }));
    pole.position.set(piece.x, piece.top + 3, piece.z);
    pole.castShadow = true;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshBasicMaterial({ color: K.WARN, side: THREE.DoubleSide }));
    flag.position.set(piece.x + 1.4, piece.top + 5.1, piece.z);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xFFE7A8 }));
    star.position.set(piece.x, piece.top + 6.3, piece.z);
    group.add(deck, plate, ring, pole, flag, star);
  }

  private decorateSpace(): void {
    const add = this.placer(ClimbBalance.STAGE_COUNT);
    for (const [index, [deg, rho, top]] of TowerLevelBuilder.SPACE_ISLANDS.entries()) {
      const angle = deg * Math.PI / 180, x = Math.sin(angle) * rho, z = Math.cos(angle) * rho, sideX = Math.cos(angle), sideZ = -Math.sin(angle), outX = Math.sin(angle), outZ = Math.cos(angle);
      add("spaceIsle", x, top - ClimbSpaceKit.ISLE_DEPTH, z, angle, 1);
      add(index % 2 ? "domeModule" : "baseModule", x + outX * 1.6, top, z + outZ * 1.6, angle + Math.PI, 1.7);
      add("landingPad", x - sideX * 2.3 - outX * 1.3, top, z - sideZ * 2.3 - outZ * 1.3, angle, 1.4);
      add("lander", x - sideX * 2.3 - outX * 1.3, top + 0.7, z - sideZ * 2.3 - outZ * 1.3, angle + 0.5, 1.4);
      add(index % 3 ? "windTurbine" : "drill", x + sideX * 2.9 + outX * 0.4, top, z + sideZ * 2.9 + outZ * 0.4, angle + Math.PI, 1.6);
      add("solarPanel", x + sideX * 2.4 - outX * 2.4, top, z + sideZ * 2.4 - outZ * 2.4, angle + Math.PI, 2);
      add("spaceTruck", x - outX * 2.8, top, z - outZ * 2.8, angle + 1.2, 2.2);
      add("cargoStack", x + sideX * 0.8 - outX * 3.1, top, z + sideZ * 0.8 - outZ * 3.1, angle + 0.3, 1.2);
      add("marsRocks", x + sideX * 3.3 - outX * 3, top, z + sideZ * 3.3 - outZ * 3, angle * 3, 1.3);
    }
  }

  private hold(piece: GrabHold): void {
    const THREE = this.libs.THREE, model = this.library.model("pebble");
    this.batcherOf(piece.stage).add("pebble", this.fit(model, piece.x - piece.nx * 0.1, piece.top + 0.05, piece.z - piece.nz * 0.1, piece.yaw, 0, 0.8, 0.55, 0.7));
    this.marksOf(piece.stage).push(new THREE.Matrix4().makeTranslation(piece.x + piece.nx * 0.28, piece.top + 0.12, piece.z + piece.nz * 0.28));
  }

  private island(piece: PlatformPiece): void {
    const THREE = this.libs.THREE;
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(piece.radius, piece.radius - 2.5, piece.depth, 56), new THREE.MeshLambertMaterial({ color: 0x6FAE4E }));
    ground.position.set(piece.x, piece.top - piece.depth / 2, piece.z);
    ground.receiveShadow = true;
    this.groupOf(piece.stage).add(ground);
  }

  private buildMarks(): void {
    const THREE = this.libs.THREE, T = TowerLevelBuilder, geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2), material = new THREE.MeshBasicMaterial({ color: T.MARK_COLOR });
    this.marks.forEach((list, stage) => {
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.computeBoundingSphere();
      this.groupOf(stage).add(mesh);
    });
  }

  private decorateRuins(): void {
    const T = TowerLevelBuilder, batcher = this.batcherOf(2), base = this.library.model("foundation");
    for (const [deg, rho, top, house] of T.RUIN_ISLANDS) {
      const angle = deg * Math.PI / 180, x = Math.sin(angle) * rho, z = Math.cos(angle) * rho, model = this.library.model(house), scale = T.HOUSE_SCALE;
      batcher.add("foundation", this.fit(base, x, top, z, angle, 0, 6, 3, 6));
      batcher.add(house, this.fit(model, x, top + model.sizeY * scale, z, angle + Math.PI, 0, model.sizeX * scale, model.sizeY * scale, model.sizeZ * scale));
      const wall = this.library.model("rampart");
      batcher.add("rampart", this.fit(wall, x + Math.sin(angle) * 2.6, top + wall.sizeY * 2, z + Math.cos(angle) * 2.6, angle + Math.PI / 2, 0, wall.sizeX * 2.4, wall.sizeY * 2, wall.sizeZ * 2));
    }
  }

  private decorateDungeon(): void {
    const batcher = this.batcherOf(3), tile = this.library.model("tile"), wall = this.library.model("dungeonWall"), pillar = this.library.model("pillar"), torch = this.library.model("torch"), rubble = this.library.model("rubble");
    for (const [deg, rho, top] of TowerLevelBuilder.DUNGEON_ISLANDS) {
      const angle = deg * Math.PI / 180, x = Math.sin(angle) * rho, z = Math.cos(angle) * rho, sideX = Math.cos(angle), sideZ = -Math.sin(angle);
      batcher.add("tile", this.fit(tile, x, top, z, angle, 0, 8, 0.6, 8));
      batcher.add("dungeonWall", this.fit(wall, x + Math.sin(angle) * 2.8, top + 4.8, z + Math.cos(angle) * 2.8, angle, 0, 7.2, 4.8, 1.2));
      for (const side of [-1, 1]) batcher.add("pillar", this.fit(pillar, x + sideX * side * 3.2, top + 5.4, z + sideZ * side * 3.2, angle, 0, 1.4, 5.4, 1.4));
      batcher.add("torch", this.fit(torch, x + Math.sin(angle) * 2.1, top + 3.4, z + Math.cos(angle) * 2.1, angle + Math.PI, 0, torch.sizeX * 2, torch.sizeY * 2, torch.sizeZ * 2));
      batcher.add("rubble", this.fit(rubble, x - sideX * 1.2, top + 1.2, z - sideZ * 1.2, angle + 0.4, 0, 4, 1.2, 1.6));
    }
  }

  private placer(stage: number): (name: string, x: number, top: number, z: number, yaw: number, scale: number) => void {
    const batcher = this.batcherOf(stage);
    return (name, x, top, z, yaw, scale) => {
      const model = this.library.model(name);
      batcher.add(name, this.fit(model, x, top + model.sizeY * scale, z, yaw, 0, model.sizeX * scale, model.sizeY * scale, model.sizeZ * scale));
    };
  }

  private decorateKitchen(): void {
    const add = this.placer(4);
    for (const [deg, rho, top] of TowerLevelBuilder.KITCHEN_ISLANDS) {
      const angle = deg * Math.PI / 180, x = Math.sin(angle) * rho, z = Math.cos(angle) * rho, sideX = Math.cos(angle), sideZ = -Math.sin(angle), outX = Math.sin(angle), outZ = Math.cos(angle);
      add("kitchenFloor", x, top - 1, z, angle, 2);
      add("oven", x + outX * 2.2, top, z + outZ * 2.2, angle + Math.PI, 2);
      add("roundTable", x - sideX * 1.8 - outX * 1.2, top, z - sideZ * 1.8 - outZ * 1.2, angle, 1.4);
      add("pot", x - sideX * 1.8 - outX * 1.2, top + 1.4, z - sideZ * 1.8 - outZ * 1.2, angle + 0.6, 1.4);
      add("tomato", x + sideX * 2.4 - outX * 1.5, top, z + sideZ * 2.4 - outZ * 1.5, angle, 2.6);
      add("cheese", x + sideX * 1.2 - outX * 2.6, top, z + sideZ * 1.2 - outZ * 2.6, angle + 1.1, 2.4);
    }
  }

  private decorateGraveyard(): void {
    const add = this.placer(5);
    for (const [deg, rho, top] of TowerLevelBuilder.GRAVE_ISLANDS) {
      const angle = deg * Math.PI / 180, x = Math.sin(angle) * rho, z = Math.cos(angle) * rho, sideX = Math.cos(angle), sideZ = -Math.sin(angle), outX = Math.sin(angle), outZ = Math.cos(angle);
      add("dirtPlot", x, top - 1, z, angle, 2);
      add("crypt", x + outX * 1.5, top, z + outZ * 1.5, angle + Math.PI, 0.7);
      add("deadTree", x - sideX * 2.6 - outX * 1.2, top, z - sideZ * 2.6 - outZ * 1.2, angle + 0.8, 1.2);
      add("grave", x + sideX * 2.4 - outX * 2, top, z + sideZ * 2.4 - outZ * 2, angle + Math.PI, 0.8);
      add("gravestone", x + sideX * 0.6 - outX * 2.6, top, z + sideZ * 0.6 - outZ * 2.6, angle + Math.PI + 0.2, 0.9);
      add("lantern", x - sideX * 1 - outX * 2.8, top, z - sideZ * 1 - outZ * 2.8, angle + Math.PI, 1);
      add("fence", x - outX * 3.7, top, z - outZ * 3.7, angle, 1);
    }
  }

  private decorateSnow(): void {
    const add = this.placer(6), ground = this.library.model("snowBlock"), batcher = this.batcherOf(6);
    for (const [deg, rho, top] of TowerLevelBuilder.SNOW_ISLANDS) {
      const angle = deg * Math.PI / 180, x = Math.sin(angle) * rho, z = Math.cos(angle) * rho, sideX = Math.cos(angle), sideZ = -Math.sin(angle), outX = Math.sin(angle), outZ = Math.cos(angle);
      batcher.add("snowBlock", this.fit(ground, x, top, z, angle, 0, 8, 1.4, 8));
      add("gingerHouse", x + outX * 1.4, top, z + outZ * 1.4, angle + Math.PI, 2.4);
      add("snowman", x - sideX * 2.4 - outX * 1.6, top, z - sideZ * 2.4 - outZ * 1.6, angle + Math.PI + 0.3, 1.1);
      add("holidayLantern", x + sideX * 2.9 - outX * 2.2, top, z + sideZ * 2.9 - outZ * 2.2, angle, 0.9);
      add("giftRed", x + sideX * 1.6 - outX * 2.8, top, z + sideZ * 1.6 - outZ * 2.8, angle + 0.5, 1.2);
      add("giftTallGreen", x + sideX * 0.6 - outX * 3, top, z + sideZ * 0.6 - outZ * 3, angle - 0.3, 1.3);
    }
  }

  private decorate(): void {
    const dice = new ClimbDecorDice(4242), batcher = this.batcherOf(0), hub = this.level.pieces.find((p) => p.hub);
    if (!hub) return;
    const clear = (x: number, z: number, room: number): boolean =>
      Math.hypot(x - this.level.spawn.x, z - this.level.spawn.z) > room && this.level.portals.every((p) => Math.hypot(x - p.x, z - p.z) > room + 1);
    const scatter = (count: number, names: readonly string[], low: number, high: number, room: number, scaleLow: number, scaleHigh: number): void => {
      for (let i = 0; i < count; i++) {
        const angle = dice.between(0, Math.PI * 2), rho = dice.between(low, high), x = Math.sin(angle) * rho, z = Math.cos(angle) * rho;
        const name = names[Math.floor(dice.next() * names.length)], model = this.library.model(name), scale = dice.between(scaleLow, scaleHigh), yaw = dice.between(0, Math.PI * 2);
        if (!clear(x, z, room)) continue;
        batcher.add(name, this.fit(model, x, hub.top + model.sizeY * scale, z, yaw, 0, model.sizeX * scale, model.sizeY * scale, model.sizeZ * scale));
      }
    };
    scatter(16, TowerLevelBuilder.TREES, hub.radius - 4, hub.radius - 1.2, 4, 1.2, 1.9);
    scatter(18, ["bush", "boulder"], 10.5, hub.radius - 1.5, 3, 1, 1.8);
    scatter(60, ["tuft"], 9, hub.radius - 1, 1, 1, 1.6);
  }
}

class PortalLooks {
  static readonly STAGE_COLORS: Readonly<Record<number, string>> = { 2: "#E0A05A", 3: "#9B7BE0", 4: "#F0C04A", 5: "#7FCB5E", 6: "#6EC8FF", 7: "#F07AA8" };
  static readonly GRAY = "#9A9A9A";
  static readonly GOLD = "#FFC83D";
  static readonly GOLD_DOOR = 0xFFD66B;

  readonly doorOpen: Three<"Material">[];
  readonly doorLocked: Three<"Material">[];
  readonly doorGold: Three<"Material">[];
  readonly door: ClimbModel;
  readonly blank: Three<"MeshBasicMaterial">;

  constructor(private readonly libs: ThreeLibs, library: ClimbModelLibrary) {
    this.door = library.model("door");
    this.doorOpen = this.door.parts.map((part) => part.material);
    this.doorLocked = this.copies(this.doorOpen, (material) => library.grayOf(material));
    this.doorGold = this.copies(this.doorOpen, (material) => {
      const gold = (material as Three<"MeshLambertMaterial">).clone();
      gold.color.setHex(PortalLooks.GOLD_DOOR);
      return gold;
    });
    this.blank = new libs.THREE.MeshBasicMaterial({ color: 0x101826 });
  }

  private copies(materials: Three<"Material">[], make: (material: Three<"Material">) => Three<"Material">): Three<"Material">[] {
    const made = new Map<Three<"Material">, Three<"Material">>();
    return materials.map((material) => {
      if (!made.has(material)) made.set(material, make(material));
      return made.get(material) as Three<"Material">;
    });
  }

  private texture(size: number, heightRatio: number, paint: (context: CanvasRenderingContext2D, width: number, height: number) => void): Three<"CanvasTexture"> {
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = Math.round(size * heightRatio);
    paint(canvas.getContext("2d") as CanvasRenderingContext2D, canvas.width, canvas.height);
    const texture = new this.libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = this.libs.THREE.SRGBColorSpace;
    return texture;
  }

  swirl(color: string): Three<"MeshBasicMaterial"> {
    const map = this.texture(256, 1, (context, width) => {
      const half = width / 2;
      context.fillStyle = "#101826";
      context.fillRect(0, 0, width, width);
      context.translate(half, half);
      context.strokeStyle = color;
      context.lineCap = "round";
      for (let arm = 0; arm < 3; arm++) {
        context.rotate(Math.PI * 2 / 3);
        context.beginPath();
        for (let step = 0; step <= 60; step++) {
          const turn = step / 60 * Math.PI * 2.4, reach = half * 0.95 * step / 60;
          context.lineTo(Math.cos(turn) * reach, Math.sin(turn) * reach);
        }
        context.lineWidth = 16;
        context.stroke();
      }
    });
    return new this.libs.THREE.MeshBasicMaterial({ map, side: this.libs.THREE.DoubleSide });
  }

  plate(title: string, color: string, caption: string): Three<"MeshBasicMaterial"> {
    const map = this.texture(256, 0.75, (context, width, height) => {
      context.fillStyle = "rgba(16,24,38,.92)";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = color;
      context.lineWidth = 10;
      context.strokeRect(5, 5, width - 10, height - 10);
      context.fillStyle = color;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const big = title.length > 1 ? Math.min(64, Math.floor(400 / title.length)) : caption ? 112 : 140;
      context.font = '800 ' + big + 'px "Nanum Gothic", "Malgun Gothic", sans-serif';
      context.fillText(title, width / 2, caption ? height * 0.4 : height * 0.53);
      if (!caption) return;
      context.font = '800 34px "Nanum Gothic", "Malgun Gothic", sans-serif';
      context.fillText(caption, width / 2, height * 0.82);
    });
    return new this.libs.THREE.MeshBasicMaterial({ map, side: this.libs.THREE.DoubleSide });
  }
}

abstract class ClimbPortalView {
  static readonly DOOR_SCALE = 0.75;
  static readonly SPIN = 1.6;

  readonly group: Three<"Group">;
  open = false;
  private readonly doorMeshes: Three<"Mesh">[] = [];
  private readonly swirl: Three<"Mesh">;
  private readonly plate: Three<"Mesh">;

  constructor(libs: ThreeLibs, protected readonly looks: PortalLooks, readonly spec: ClimbPortalSpec) {
    const THREE = libs.THREE, door = looks.door, scale = ClimbPortalView.DOOR_SCALE;
    this.group = new THREE.Group();
    this.group.position.set(spec.x, spec.y, spec.z);
    this.group.rotation.y = spec.yaw;
    door.parts.forEach((part) => {
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.scale.setScalar(scale);
      mesh.position.set(-door.centerX * scale, -door.min.y * scale, -door.centerZ * scale);
      mesh.castShadow = true;
      this.doorMeshes.push(mesh);
      this.group.add(mesh);
    });
    this.swirl = new THREE.Mesh(new THREE.CircleGeometry(1.05, 28), looks.blank);
    this.swirl.position.set(0, door.sizeY * scale * 0.42, door.sizeZ * scale / 2 + 0.06);
    this.plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.125), looks.blank);
    this.plate.position.y = door.sizeY * scale + 0.75;
    this.group.add(this.swirl, this.plate);
  }

  protected paint(open: boolean, doors: Three<"Material">[], swirl: Three<"Material">, plate: Three<"Material">): void {
    this.open = open;
    this.doorMeshes.forEach((mesh, index) => { mesh.material = doors[index]; });
    this.swirl.material = swirl;
    this.plate.material = plate;
  }

  abstract sync(progress: StageProgress, mode: ClimbRunMode, level: TowerLevel): void;
  abstract preview(variant: boolean): void;
  hint(_progress: StageProgress, _mode: ClimbRunMode, _level: TowerLevel): string { return ""; }
  update(dt: number): void { if (this.open) this.swirl.rotation.z -= ClimbPortalView.SPIN * dt; }
}

class StagePortal extends ClimbPortalView {
  private readonly swirlOpen: Three<"Material">;
  private readonly swirlLocked: Three<"Material">;
  private readonly plateOpen: Three<"Material">;
  private readonly plateLocked: Three<"Material">;

  constructor(libs: ThreeLibs, looks: PortalLooks, spec: ClimbPortalSpec, built: boolean) {
    super(libs, looks, spec);
    const color = PortalLooks.STAGE_COLORS[spec.stage] ?? "#FFFFFF", caption = built ? "" : "공사 중";
    this.swirlOpen = looks.swirl(color);
    this.swirlLocked = looks.swirl(PortalLooks.GRAY);
    this.plateOpen = looks.plate(String(spec.stage), color, caption);
    this.plateLocked = looks.plate(String(spec.stage), PortalLooks.GRAY, caption);
    this.show(false);
  }

  show(open: boolean): void {
    this.paint(open, open ? this.looks.doorOpen : this.looks.doorLocked, open ? this.swirlOpen : this.swirlLocked, open ? this.plateOpen : this.plateLocked);
  }

  sync(progress: StageProgress, mode: ClimbRunMode, level: TowerLevel): void { this.show(progress.portalOpen(this.spec.stage, level, mode)); }
  preview(variant: boolean): void { this.show(variant); }

  hint(progress: StageProgress, mode: ClimbRunMode, level: TowerLevel): string {
    const stage = this.spec.stage;
    if (this.open) return "";
    if (!mode.stagePortalsUsable) return "스피드런 중에는 포탈을 쓸 수 없어요";
    if (!level.hasStage(stage)) return "스테이지 " + stage + " 은 공사 중이에요";
    if (!progress.unlocked(stage)) return "스테이지 " + (stage - 1) + " 을 클리어하면 열려요";
    return "";
  }
}

class SpeedrunPortal extends ClimbPortalView {
  static readonly CAPTIONS: Readonly<Record<ClimbRunModeName, string>> = { practice: "스피드런", speedrun: "나가기" };

  private readonly swirlGold: Three<"Material">;
  private readonly plates: Record<ClimbRunModeName, Three<"Material">>;

  constructor(libs: ThreeLibs, looks: PortalLooks, spec: ClimbPortalSpec) {
    super(libs, looks, spec);
    const C = SpeedrunPortal.CAPTIONS, gold = PortalLooks.GOLD;
    this.swirlGold = looks.swirl(gold);
    this.plates = { practice: looks.plate(C.practice, gold, ""), speedrun: looks.plate(C.speedrun, gold, "") };
    this.face("practice");
  }

  private face(name: ClimbRunModeName): void { this.paint(true, this.looks.doorGold, this.swirlGold, this.plates[name]); }
  sync(_progress: StageProgress, mode: ClimbRunMode): void { this.face(mode.name); }
  preview(variant: boolean): void { this.face(variant ? "practice" : "speedrun"); }
}

class PortalHub {
  static readonly HINT_RANGE = 3;
  static readonly VIEWS: Readonly<Record<ClimbPortalKindName, (libs: ThreeLibs, looks: PortalLooks, spec: ClimbPortalSpec, level: TowerLevel) => ClimbPortalView>> = {
    stage: (libs, looks, spec, level) => new StagePortal(libs, looks, spec, level.hasStage(spec.stage)),
    speedrun: (libs, looks, spec) => new SpeedrunPortal(libs, looks, spec),
  };

  readonly group: Three<"Group">;
  readonly portals: ClimbPortalView[];

  constructor(libs: ThreeLibs, library: ClimbModelLibrary, private readonly level: TowerLevel) {
    const looks = new PortalLooks(libs, library);
    this.group = new libs.THREE.Group();
    this.portals = level.portals.map((spec) => PortalHub.VIEWS[spec.kind ?? "stage"](libs, looks, spec, level));
    this.portals.forEach((portal) => this.group.add(portal.group));
  }

  sync(progress: StageProgress, mode: ClimbRunMode): void { this.portals.forEach((portal) => portal.sync(progress, mode, this.level)); }
  preview(variant: boolean): void { this.portals.forEach((portal) => portal.preview(variant)); }
  update(dt: number): void { this.portals.forEach((portal) => portal.update(dt)); }

  hintNear(x: number, y: number, z: number, progress: StageProgress, mode: ClimbRunMode): string {
    if (Math.abs(y) > 1.5) return "";
    for (const portal of this.portals) {
      const spec = portal.spec;
      if (Math.hypot(spec.x - x, spec.z - z) > PortalHub.HINT_RANGE) continue;
      const hint = portal.hint(progress, mode, this.level);
      if (hint) return hint;
    }
    return "";
  }
}

class ClimbAvatar {
  static readonly MODEL_SCALE = 0.9;
  static readonly TURN_RATE = 14;
  static readonly SWING_TURN_RATE = 9;
  static readonly HANG_FOLLOW = 16;
  static readonly SHADOW_REACH = 45;
  static readonly CLIMB_LEAN = 0.45;
  static readonly LEAN_RATE = 12;

  readonly root: Three<"Group">;
  private model: Three<"Object3D"> | null = null;
  private animator: CharacterAnimator | null = null;
  private readonly shadow: Three<"Mesh">;
  private readonly below: PlatformPiece[] = [];
  private readonly aim: Three<"Vector3">;
  private yaw = Math.PI;
  private onceClip = "";
  private onceLeft = 0;
  private lean = 0;

  constructor(private readonly libs: ThreeLibs, private readonly factory: CharacterModelFactory, private readonly clips: Map<string, Three<"AnimationClip">>, scene: Three<"Scene">) {
    const THREE = libs.THREE;
    this.root = new THREE.Group();
    this.aim = new THREE.Vector3();
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.root, this.shadow);
  }

  wear(look: CharacterLook): void {
    if (this.model) { this.root.remove(this.model); this.factory.disposeModel(this.model); }
    this.model = this.factory.build(look);
    this.model.scale.setScalar(ClimbAvatar.MODEL_SCALE);
    this.model.traverse((node) => { node.castShadow = true; });
    this.root.add(this.model);
    this.animator = new CharacterAnimator(this.libs, this.model, this.clips);
    this.animator.play("Idle_A");
  }

  playOnce(clip: string, seconds: number): void { this.onceClip = clip; this.onceLeft = seconds; if (this.animator) this.animator.play(clip, { once: true }); }

  private clipFor(body: ClimbCharacterBody): string {
    if (body.mode === "stun") return "Hit_A";
    if (body.mode === "climbUp") return body.climbPath.rising ? "Jump_Idle" : "Jump_Land";
    if (body.mode === "hang" || !body.grounded) return "Jump_Idle";
    return body.speed > 0.6 ? "Running_A" : "Idle_A";
  }

  follow(rules: ClimbRules, dt: number): void {
    const body = rules.body, blend = rules.blend, A = ClimbAvatar, position = this.root.position;
    const x = body.prevX + (body.x - body.prevX) * blend, y = body.prevY + (body.y - body.prevY) * blend, z = body.prevZ + (body.z - body.prevZ) * blend;
    if (body.hanging && body.hopTime > 0) position.lerp(this.aim.set(x, y, z), Math.min(1, A.HANG_FOLLOW * dt));
    else position.set(x, y, z);
    let turn = body.yaw - this.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const swinging = body.hanging && body.hopTime > 0;
    this.yaw += turn * Math.min(1, (swinging ? A.SWING_TURN_RATE : A.TURN_RATE) * dt);
    this.root.rotation.y = this.yaw;
    this.leanForClimb(body, dt);
    this.root.visible = body.mode !== "portal" || body.portalTime > ClimbBalance.PORTAL_TIME * 0.45;
    const scaled = dt * rules.time.scale;
    if (this.onceLeft > 0) this.onceLeft -= scaled;
    else if (this.animator) this.animator.play(this.clipFor(body), body.mode === "stun" || body.mode === "climbUp" ? { once: true } : {});
    if (this.animator) this.animator.update(scaled);
    this.dropShadow(rules, position.x, position.y, position.z);
  }

  private leanForClimb(body: ClimbCharacterBody, dt: number): void {
    const A = ClimbAvatar, path = body.climbPath;
    const goal = body.mode === "climbUp" ? A.CLIMB_LEAN * Math.sin(Math.PI * path.progress) : 0;
    this.lean += (goal - this.lean) * Math.min(1, A.LEAN_RATE * dt);
    if (this.model) this.model.rotation.x = this.lean;
  }

  private dropShadow(rules: ClimbRules, x: number, y: number, z: number): void {
    let floor = -Infinity;
    for (const piece of rules.world.near(x, z, y - ClimbAvatar.SHADOW_REACH, y + 0.5, 0.5, this.below)) {
      if (!piece.solid || !piece.covers(x, z)) continue;
      const top = piece.topAt(x, z);
      if (top <= y + 0.4 && top > floor) floor = top;
    }
    this.shadow.visible = floor > -Infinity;
    if (!this.shadow.visible) return;
    const shrink = Math.max(0.45, 1 - (y - floor) / 30);
    this.shadow.position.set(x, floor + 0.04, z);
    this.shadow.scale.setScalar(shrink);
  }

  idleShow(spawn: ClimbSpawnSpec, seconds: number, dt: number): void {
    this.root.position.set(spawn.x, spawn.y, spawn.z);
    this.root.rotation.y = 0;
    this.root.visible = true;
    this.shadow.visible = true;
    this.shadow.position.set(spawn.x, spawn.y + 0.04, spawn.z);
    this.shadow.scale.setScalar(1);
    if (!this.animator) return;
    this.animator.play(seconds % 7 < 4.4 ? "Idle_A" : "Cheering");
    this.animator.update(dt);
  }
}

class ClimbCameraRig {
  static readonly DISTANCE = 6;
  static readonly MIN_DISTANCE = 1.2;
  static readonly PITCH_LOW = -0.35;
  static readonly PITCH_HIGH = 1.25;
  static readonly BASE_PITCH = 0.26;
  static readonly EYE = 1.5;
  static readonly WALL_GAP = 0.3;
  static readonly AUTO_DELAY = 1.6;
  static readonly AUTO_RATE = 0.9;
  static readonly EASE_OUT = 5;
  static readonly FALL_SPEED = 12;
  static readonly FALL_LIFT = 0.09;

  yaw = 0;
  pitch = ClimbCameraRig.BASE_PITCH;
  autoAlign = true;
  private reach = ClimbCameraRig.DISTANCE;
  private idle = 0;

  constructor(readonly camera: Three<"PerspectiveCamera">) {}

  reset(yaw: number): void { this.yaw = yaw; this.pitch = ClimbCameraRig.BASE_PITCH; this.reach = ClimbCameraRig.DISTANCE; }

  turn(deltaYaw: number, deltaPitch: number): void {
    const C = ClimbCameraRig;
    if (deltaYaw === 0 && deltaPitch === 0) return;
    this.yaw -= deltaYaw;
    this.pitch = Math.max(C.PITCH_LOW, Math.min(C.PITCH_HIGH, this.pitch + deltaPitch));
    this.idle = 0;
  }

  get forwardX(): number { return -Math.sin(this.yaw); }
  get forwardZ(): number { return -Math.cos(this.yaw); }
  get rightX(): number { return Math.cos(this.yaw); }
  get rightZ(): number { return -Math.sin(this.yaw); }

  follow(rules: ClimbRules, target: Three<"Vector3">, dt: number): void {
    const C = ClimbCameraRig, body = rules.body;
    this.idle += dt;
    if (this.autoAlign && this.idle > C.AUTO_DELAY && body.grounded && body.speed > 3) {
      let turn = body.yaw + Math.PI - this.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      this.yaw += turn * Math.min(1, C.AUTO_RATE * dt);
    }
    const pitch = Math.min(C.PITCH_HIGH, this.pitch + (!body.grounded && body.vy < -C.FALL_SPEED ? C.FALL_LIFT : 0));
    const dx = Math.sin(this.yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(this.yaw) * Math.cos(pitch);
    const eyeX = target.x, eyeY = target.y + C.EYE, eyeZ = target.z;
    const free = Math.max(C.MIN_DISTANCE, rules.world.rayReach(eyeX, eyeY, eyeZ, dx, dy, dz, C.DISTANCE + C.WALL_GAP) - C.WALL_GAP);
    this.reach = free < this.reach ? free : Math.min(free, this.reach + C.EASE_OUT * dt);
    this.camera.position.set(eyeX + dx * this.reach, eyeY + dy * this.reach, eyeZ + dz * this.reach);
    this.camera.lookAt(eyeX, eyeY, eyeZ);
  }
}

class TowerMenuBackdrop {
  static readonly ORBIT_SPEED = 0.12;
  static readonly RADIUS = 34;
  static readonly HEIGHT = 15;
  static readonly LOOK_HEIGHT = 12;
  private angle = 0.5;
  private seconds = 0;

  constructor(private readonly camera: Three<"PerspectiveCamera">, private readonly avatar: ClimbAvatar, private readonly level: TowerLevel) {}

  update(dt: number): void {
    const M = TowerMenuBackdrop;
    this.angle += M.ORBIT_SPEED * dt;
    this.seconds += dt;
    this.camera.position.set(Math.sin(this.angle) * M.RADIUS, M.HEIGHT, Math.cos(this.angle) * M.RADIUS);
    this.camera.lookAt(0, M.LOOK_HEIGHT, 0);
    this.avatar.idleShow(this.level.spawn, this.seconds, dt);
  }
}

class ClimbQualityPlan {
  static readonly STORAGE_KEY = "towerclimb_quality_v1";
  static readonly TOUCH_RATIO = 1.5;
  static readonly DESKTOP_RATIO = 2;
  static readonly RATIO_STEP = 0.25;

  private ratio: number;
  private readonly governor: QualityGovernorHandle | null;

  constructor(private readonly renderer: Three<"WebGLRenderer">, private readonly sun: Three<"DirectionalLight">, touch: boolean, isPlaying: () => boolean) {
    const Q = ClimbQualityPlan;
    this.ratio = Math.min(window.devicePixelRatio || 1, touch ? Q.TOUCH_RATIO : Q.DESKTOP_RATIO);
    renderer.setPixelRatio(this.ratio);
    const steps = [() => this.lowerRatio(), () => this.dropShadows()];
    this.governor = window.QualityGovernor ? window.QualityGovernor({ steps, storageKey: Q.STORAGE_KEY, isPlaying, slowSec: 0.022, slowLimit: 90 }) : null;
  }

  restore(): void { if (this.governor) this.governor.restore(); }
  update(frameSeconds: number): void { if (this.governor) this.governor.update(frameSeconds); }

  private lowerRatio(): boolean {
    if (this.ratio <= 1) return false;
    this.ratio = Math.max(1, this.ratio - ClimbQualityPlan.RATIO_STEP);
    this.renderer.setPixelRatio(this.ratio);
    return true;
  }

  private dropShadows(): boolean {
    if (!this.sun.castShadow) return false;
    this.sun.castShadow = false;
    this.renderer.shadowMap.needsUpdate = true;
    return true;
  }
}

class ClimbWorldView {
  static readonly SKY = 0x9FD3F2;
  static readonly SHADOW_BOX = 16;
  static readonly SUN_OFFSET: readonly number[] = [14, 30, 10];

  readonly renderer: Three<"WebGLRenderer">;
  readonly scene: Three<"Scene">;
  readonly camera: Three<"PerspectiveCamera">;
  readonly rig: ClimbCameraRig;
  readonly avatar: ClimbAvatar;
  readonly portals: PortalHub;
  readonly builder: TowerLevelBuilder;
  readonly backdrop: TowerMenuBackdrop;
  readonly quality: ClimbQualityPlan;
  private readonly sun: Three<"DirectionalLight">;
  private readonly sky: ClimbSkyTint;

  constructor(libs: ThreeLibs, canvas: HTMLCanvasElement, library: ClimbModelLibrary, factory: CharacterModelFactory, level: TowerLevel, touch: boolean, isPlaying: () => boolean) {
    const THREE = libs.THREE, V = ClimbWorldView;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(V.SKY);
    this.scene.fog = new THREE.Fog(V.SKY, 45, 150);
    this.sky = new ClimbSkyTint(libs, this.scene, V.SKY);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.2, 260);
    this.scene.add(new THREE.HemisphereLight(0xDFF3FF, 0x6E7F5A, 1.5));
    this.sun = new THREE.DirectionalLight(0xFFF2D8, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = shadowCamera.bottom = -V.SHADOW_BOX;
    shadowCamera.right = shadowCamera.top = V.SHADOW_BOX;
    shadowCamera.near = 1; shadowCamera.far = 90;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);
    this.builder = new TowerLevelBuilder(libs, library, level);
    this.portals = new PortalHub(libs, library, level);
    this.scene.add(this.builder.root, this.portals.group);
    this.avatar = new ClimbAvatar(libs, factory, library.clips, this.scene);
    this.rig = new ClimbCameraRig(this.camera);
    this.backdrop = new TowerMenuBackdrop(this.camera, this.avatar, level);
    this.quality = new ClimbQualityPlan(this.renderer, this.sun, touch, isPlaying);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const width = window.innerWidth, height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  private aimSun(): void {
    const at = this.avatar.root.position, V = ClimbWorldView;
    this.sun.target.position.copy(at);
    this.sun.position.set(at.x + V.SUN_OFFSET[0], at.y + V.SUN_OFFSET[1], at.z + V.SUN_OFFSET[2]);
  }

  render(): void { this.aimSun(); this.sky.follow(this.camera.position.y); this.renderer.render(this.scene, this.camera); }

  warmUp(progress: StageProgress, mode: ClimbRunMode): void {
    this.builder.showEvery();
    this.portals.preview(true);
    this.render();
    this.builder.showAround(1);
    this.portals.preview(false);
    this.render();
    this.portals.sync(progress, mode);
  }
}
