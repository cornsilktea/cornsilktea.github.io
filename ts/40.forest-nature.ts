interface FrModelPart { geometry: Three<"Mesh">["geometry"]; material: Three<"Material"> }

class FrNatureModels {
  static readonly FOLDER = "assets/kaykit/forest/";
  static readonly FILES: readonly string[] = [
    "Tree_1_A_Color1", "Tree_1_B_Color1", "Tree_2_A_Color1", "Tree_2_B_Color1", "Tree_4_A_Color1", "Tree_4_B_Color1",
    "Bush_1_C_Color1", "Bush_2_C_Color1", "Rock_1_A_Color1", "Rock_1_C_Color1", "Rock_3_A_Color1", "Rock_3_C_Color1",
    "Grass_1_A_Singlesided_Color1", "Grass_2_A_Singlesided_Color1", "Grass_1_C_Singlesided_Color1",
    "chest", "table_medium", "barrel_small", "crates_stacked", "oven", "stove_multi", "kitchencounter_straight_A", "anvil", "lantern", "Wood_Log_Stack",
  ];
  private readonly parts = new Map<string, FrModelPart[]>();
  private readonly heights = new Map<string, number>();
  private readonly materials = new Map<string, Three<"MeshLambertMaterial">>();

  constructor(private readonly libs: ThreeLibs) {}

  async load(): Promise<void> {
    const loader = new this.libs.GLTFLoader();
    await Promise.all(FrNatureModels.FILES.map((name) => loader.loadAsync(FrNatureModels.FOLDER + name + ".gltf").then((gltf) => this.store(name, gltf.scene)).catch(() => undefined)));
  }

  has(name: string): boolean { return this.parts.has(name); }
  partsOf(name: string): FrModelPart[] { return this.parts.get(name) || []; }
  height(name: string): number { return this.heights.get(name) || 1; }

  build(name: string, shadows = true): Three<"Group"> {
    const group = new this.libs.THREE.Group();
    this.partsOf(name).forEach((part) => {
      const mesh = new this.libs.THREE.Mesh(part.geometry, part.material);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    return group;
  }

  private store(name: string, root: Three<"Object3D">): void {
    const T = this.libs.THREE;
    root.updateMatrixWorld(true);
    const list: FrModelPart[] = [];
    root.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      list.push({ geometry, material: this.lambertOf(sources[0] as Three<"MeshStandardMaterial">) });
    });
    this.parts.set(name, list);
    this.heights.set(name, new T.Box3().setFromObject(root).max.y);
  }

  private lambertOf(source: Three<"MeshStandardMaterial">): Three<"MeshLambertMaterial"> {
    const cached = this.materials.get(source.uuid);
    if (cached) return cached;
    const material = new this.libs.THREE.MeshLambertMaterial({ map: source.map, color: source.color.clone(), side: source.side, transparent: source.transparent, alphaTest: source.alphaTest });
    this.materials.set(source.uuid, material);
    return material;
  }
}

class FrInstancedModel {
  readonly meshes: Array<Three<"InstancedMesh">>;
  private static readonly HIDDEN_SCALE = 0;

  constructor(private readonly libs: ThreeLibs, parts: FrModelPart[], capacity: number, castShadow: boolean, ghostOpacity = 1) {
    const T = libs.THREE;
    this.meshes = parts.map((part) => {
      const material = ghostOpacity < 1 ? FrInstancedModel.ghostOf(part.material, ghostOpacity) : part.material;
      const mesh = new T.InstancedMesh(part.geometry, material, Math.max(1, capacity));
      mesh.castShadow = castShadow && ghostOpacity >= 1;
      mesh.receiveShadow = ghostOpacity >= 1;
      return mesh;
    });
  }

  static ghostOf(source: Three<"Material">, opacity: number): Three<"Material"> {
    const material = source.clone();
    material.transparent = true;
    material.opacity = opacity;
    material.depthWrite = false;
    return material;
  }

  addTo(parent: Three<"Object3D">): void { this.meshes.forEach((m) => parent.add(m)); }
  set(index: number, matrix: Three<"Matrix4">): void { this.meshes.forEach((m) => m.setMatrixAt(index, matrix)); }
  hide(index: number): void {
    if (this.meshes.length === 0) return;
    const T = this.libs.THREE;
    const current = new T.Matrix4();
    this.meshes[0].getMatrixAt(index, current);
    const at = new T.Vector3().setFromMatrixPosition(current);
    this.set(index, new T.Matrix4().compose(at, new T.Quaternion(), new T.Vector3(FrInstancedModel.HIDDEN_SCALE, FrInstancedModel.HIDDEN_SCALE, FrInstancedModel.HIDDEN_SCALE)));
  }
  setCount(count: number): void { this.meshes.forEach((m) => { m.count = count; }); }
  owns(object: Three<"Object3D">): boolean { return this.meshes.indexOf(object as Three<"InstancedMesh">) >= 0; }

  commit(bounds = true): void {
    this.meshes.forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (bounds) m.computeBoundingSphere();
    });
  }
}

class FrRegionGrid {
  static readonly TREE_CELLS = 12;
  static readonly DECOR_CELLS = 24;
  static keyOf(x: number, z: number, size: number): string { return Math.floor(x / size) + "_" + Math.floor(z / size); }
}

interface FrTilePaint { base: string; dots: string[]; pattern?: "fringe" | "plank" | "cobble" | "ripple" | "glow"; fringe?: string }

class FrTerrainAtlas {
  private static readonly PAINTS: Readonly<Record<string, FrTilePaint>> = {
    grassTop: { base: "#62a83f", dots: ["#579a37", "#73b84c", "#4f8f33", "#82c45a"] },
    grassSide: { base: "#8a6038", dots: ["#7a5230", "#966a40", "#6f4b2b"], pattern: "fringe", fringe: "#62a83f" },
    dirt: { base: "#8a6038", dots: ["#7a5230", "#966a40", "#6f4b2b", "#a07448"] },
    stone: { base: "#9a9da4", dots: ["#8a8d95", "#a9acb3", "#80838b"], pattern: "cobble" },
    stoneDark: { base: "#83868e", dots: ["#74777f", "#8f929a"], pattern: "cobble" },
    sand: { base: "#e6d394", dots: ["#d9c487", "#f0dfa6", "#d1bb7a"] },
    snowTop: { base: "#f4f7fb", dots: ["#e4ebf3", "#ffffff", "#dbe4ee"] },
    snowSide: { base: "#9a9da4", dots: ["#8a8d95", "#a9acb3"], pattern: "fringe", fringe: "#f4f7fb" },
    riverBed: { base: "#7d6f52", dots: ["#6e6247", "#8c7d5e"] },
    plank: { base: "#c99a62", dots: ["#b8884f", "#d4a670"], pattern: "plank" },
    caveFloor: { base: "#8f7b62", dots: ["#7f6c55", "#9c886d"], pattern: "cobble" },
    caveRock: { base: "#5c5a63", dots: ["#504e57", "#68666f"], pattern: "cobble" },
    crystal: { base: "#5fb8c8", dots: ["#7fd8e8", "#4a9aaa"], pattern: "glow" },
    dark: { base: "#1f1d24", dots: ["#28252e", "#17151b"] },
    lava: { base: "#f26a1a", dots: ["#ffb02e", "#d94a10"], pattern: "glow" },
    seaBed: { base: "#4a5a66", dots: ["#3f4e59", "#566672"], pattern: "ripple" },
  };
  private static texture: Three<"CanvasTexture"> | null = null;

  static get(libs: ThreeLibs): Three<"CanvasTexture"> {
    if (FrTerrainAtlas.texture) return FrTerrainAtlas.texture;
    const S = FrTerrainTiles.SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = FrTerrainTiles.COLUMNS * S;
    canvas.height = FrTerrainTiles.ROWS * S;
    const g = canvas.getContext("2d") as CanvasRenderingContext2D;
    FrTerrainTiles.NAMES.forEach((name, index) => {
      const ox = (index % FrTerrainTiles.COLUMNS) * S, oy = Math.floor(index / FrTerrainTiles.COLUMNS) * S;
      FrTerrainAtlas.paint(g, ox, oy, S, FrTerrainAtlas.PAINTS[name], new FrRandom(1000 + index * 17));
    });
    const texture = new libs.THREE.CanvasTexture(canvas);
    texture.magFilter = libs.THREE.NearestFilter;
    texture.minFilter = libs.THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = libs.THREE.SRGBColorSpace;
    FrTerrainAtlas.texture = texture;
    return texture;
  }

  private static paint(g: CanvasRenderingContext2D, ox: number, oy: number, S: number, paint: FrTilePaint, random: FrRandom): void {
    g.fillStyle = paint.base;
    g.fillRect(ox, oy, S, S);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = paint.dots[Math.floor(random.next() * paint.dots.length)];
      g.fillRect(ox + Math.floor(random.next() * S), oy + Math.floor(random.next() * S), 1 + Math.floor(random.next() * 2), 1);
    }
    if (paint.pattern === "fringe" && paint.fringe) {
      g.fillStyle = paint.fringe;
      g.fillRect(ox, oy, S, 3);
      for (let x = 0; x < S; x++) if (random.next() < 0.6) g.fillRect(ox + x, oy + 3, 1, 1 + Math.floor(random.next() * 3));
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.fillRect(ox, oy, S, 1);
    } else if (paint.pattern === "plank") {
      g.fillStyle = "rgba(60,35,15,0.35)";
      [4, 8, 12].forEach((y) => g.fillRect(ox, oy + y, S, 1));
      [[3, 0], [11, 4], [6, 8], [13, 12]].forEach(([x, y]) => g.fillRect(ox + x, oy + y, 1, 4));
    } else if (paint.pattern === "cobble") {
      g.fillStyle = "rgba(30,30,40,0.28)";
      [[0, 5], [0, 11]].forEach(([x, y]) => g.fillRect(ox + x, oy + y, S, 1));
      [[5, 0, 5], [12, 0, 5], [2, 6, 5], [9, 6, 5], [6, 12, 4], [14, 12, 4]].forEach(([x, y, h]) => g.fillRect(ox + x, oy + y, 1, h));
      g.fillStyle = "rgba(255,255,255,0.14)";
      [[1, 1], [7, 7], [3, 13]].forEach(([x, y]) => g.fillRect(ox + x, oy + y, 3, 1));
    } else if (paint.pattern === "ripple") {
      g.fillStyle = "rgba(255,255,255,0.12)";
      [[2, 3], [8, 7], [4, 12]].forEach(([x, y]) => g.fillRect(ox + x, oy + y, 5, 1));
    } else if (paint.pattern === "glow") {
      g.fillStyle = "rgba(255,255,220,0.45)";
      for (let i = 0; i < 6; i++) g.fillRect(ox + Math.floor(random.next() * S), oy + Math.floor(random.next() * S), 2, 2);
    }
    g.fillStyle = "rgba(0,0,0,0.13)";
    g.fillRect(ox, oy + S - 1, S, 1);
    g.fillRect(ox + S - 1, oy, 1, S);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(ox, oy, S, 1);
    g.fillRect(ox, oy, 1, S);
  }
}

class FrSignTexture {
  private static readonly cache = new Map<string, Three<"CanvasTexture">>();

  static of(libs: ThreeLibs, text: string): Three<"CanvasTexture"> {
    const cached = FrSignTexture.cache.get(text);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const g = canvas.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#e2bf86";
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "rgba(120,80,40,0.25)";
    [32, 64, 96].forEach((y) => g.fillRect(0, y, 256, 3));
    g.strokeStyle = "#7a5230";
    g.lineWidth = 10;
    g.strokeRect(5, 5, 246, 118);
    g.fillStyle = "#4a2e16";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const size = text.length > 5 ? 34 : 44;
    g.font = "900 " + size + "px \"Nanum Gothic\", \"Malgun Gothic\", sans-serif";
    g.fillText(text, 128, 56);
    g.font = "800 22px \"Nanum Gothic\", \"Malgun Gothic\", sans-serif";
    g.fillStyle = "#7a4a20";
    g.fillText("🔨 눌러서 짓기", 128, 96);
    const texture = new libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = libs.THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    FrSignTexture.cache.set(text, texture);
    return texture;
  }
}

class FrSurfaceTextures {
  private static readonly cache = new Map<string, Three<"CanvasTexture">>();

  static stone(libs: ThreeLibs): Three<"CanvasTexture"> {
    return FrSurfaceTextures.make(libs, "stone", 128, (g, size) => {
      g.fillStyle = "#d8d8dc";
      g.fillRect(0, 0, size, size);
      const random = new FrRandom(33);
      const rows = 4, height = size / rows;
      for (let row = 0; row < rows; row++) {
        const offset = row % 2 ? size / 4 : 0;
        for (let col = -1; col < 3; col++) {
          const x = col * (size / 2) + offset, y = row * height;
          const shade = 200 + Math.floor(random.next() * 50);
          g.fillStyle = "rgb(" + shade + "," + shade + "," + (shade + 4) + ")";
          g.fillRect(x + 3, y + 3, size / 2 - 6, height - 6);
          g.fillStyle = "rgba(255,255,255,0.35)";
          g.fillRect(x + 3, y + 3, size / 2 - 6, 3);
        }
      }
      g.fillStyle = "rgba(60,60,70,0.25)";
      for (let i = 0; i < 260; i++) g.fillRect(Math.floor(random.next() * size), Math.floor(random.next() * size), 2, 2);
    });
  }

  static wood(libs: ThreeLibs): Three<"CanvasTexture"> {
    return FrSurfaceTextures.make(libs, "wood", 64, (g, size) => {
      g.fillStyle = "#e8d2b0";
      g.fillRect(0, 0, size, size);
      const random = new FrRandom(19);
      for (let plank = 0; plank < 4; plank++) {
        const y = plank * (size / 4);
        const shade = 200 + Math.floor(random.next() * 40);
        g.fillStyle = "rgb(" + shade + "," + Math.floor(shade * 0.86) + "," + Math.floor(shade * 0.7) + ")";
        g.fillRect(0, y + 1, size, size / 4 - 2);
        g.fillStyle = "rgba(90,60,30,0.25)";
        for (let k = 0; k < 6; k++) g.fillRect(Math.floor(random.next() * size), y + 3 + Math.floor(random.next() * (size / 4 - 6)), 8 + Math.floor(random.next() * 14), 1);
      }
    });
  }

  static water(libs: ThreeLibs): Three<"CanvasTexture"> {
    return FrSurfaceTextures.make(libs, "water", 128, (g, size) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, size, size);
      const random = new FrRandom(5);
      g.strokeStyle = "rgba(170,215,255,0.9)";
      g.lineWidth = 2;
      for (let i = 0; i < 22; i++) {
        const x = random.next() * size, y = random.next() * size, w = 10 + random.next() * 18;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + w / 2, y - 3, x + w, y);
        g.stroke();
      }
    });
  }

  private static make(libs: ThreeLibs, key: string, size: number, paint: (g: CanvasRenderingContext2D, size: number) => void): Three<"CanvasTexture"> {
    const cached = FrSurfaceTextures.cache.get(key);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    paint(canvas.getContext("2d") as CanvasRenderingContext2D, size);
    const texture = new libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = libs.THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = libs.THREE.RepeatWrapping;
    texture.anisotropy = 4;
    FrSurfaceTextures.cache.set(key, texture);
    return texture;
  }
}

interface FrDecorEntry { model: FrInstancedModel; index: number }

class FrGroundDecor {
  private static readonly KINDS: ReadonlyArray<{ name: string; tops: string; chance: number; scale: number; perCell: number }> = [
    { name: "Grass_1_A_Singlesided_Color1", tops: "G", chance: 0.34, scale: 2.4, perCell: 3 },
    { name: "Grass_2_A_Singlesided_Color1", tops: "G", chance: 0.22, scale: 2.2, perCell: 2 },
    { name: "Grass_1_C_Singlesided_Color1", tops: "G", chance: 0.07, scale: 2.0, perCell: 1 },
    { name: "Bush_1_C_Color1", tops: "G", chance: 0.022, scale: 1.6, perCell: 1 },
    { name: "Bush_2_C_Color1", tops: "G", chance: 0.014, scale: 1.4, perCell: 1 },
    { name: "Rock_1_A_Color1", tops: "SGD", chance: 0.02, scale: 2.0, perCell: 1 },
    { name: "Rock_1_C_Color1", tops: "SDN", chance: 0.03, scale: 1.8, perCell: 1 },
    { name: "Rock_3_A_Color1", tops: "S", chance: 0.07, scale: 1.7, perCell: 1 },
    { name: "Rock_3_C_Color1", tops: "SW", chance: 0.05, scale: 1.6, perCell: 1 },
  ];
  private static readonly FLOWER_CHANCE = 0.05;
  private static readonly FLOWER_COLORS = [0xf06a7a, 0xffd34a, 0xffffff, 0x8fb8ff, 0xf29a4e];
  private readonly byCell = new Map<number, FrDecorEntry[]>();
  private readonly models: FrInstancedModel[] = [];

  constructor(private readonly libs: ThreeLibs, private readonly world: FrWorld, nature: FrNatureModels, readonly group: Three<"Group">, private readonly skip: (x: number, z: number) => boolean) {
    const T = libs.THREE;
    const plans = new Map<string, Array<{ x: number; z: number; matrix: Three<"Matrix4"> }>>();
    const terrain = world.terrain;
    const B = FrTerrainData.BLOCK;
    for (let z = 0; z < terrain.d; z++) {
      for (let x = 0; x < terrain.w; x++) {
        if (this.skip(x, z)) continue;
        const top = terrain.top(x, z);
        FrGroundDecor.KINDS.forEach((kind, k) => {
          if (kind.tops.indexOf(top) < 0 || !nature.has(kind.name)) return;
          for (let n = 0; n < kind.perCell; n++) {
            if (FrTreeField.hash(x, z, 300 + k * 7 + n) > kind.chance) continue;
            const px = (x + 0.15 + FrTreeField.hash(x, z, 400 + k + n) * 0.7) * B, pz = (z + 0.15 + FrTreeField.hash(x, z, 500 + k + n) * 0.7) * B;
            const size = kind.scale * (0.75 + FrTreeField.hash(x, z, 600 + k + n) * 0.5);
            const matrix = new T.Matrix4().compose(new T.Vector3(px, terrain.surfaceY(x, z), pz), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), FrTreeField.hash(x, z, 700 + k + n) * 6.28), new T.Vector3(size, size, size));
            const key = kind.name + "|" + FrRegionGrid.keyOf(x, z, FrRegionGrid.DECOR_CELLS);
            if (!plans.has(key)) plans.set(key, []);
            (plans.get(key) as Array<{ x: number; z: number; matrix: Three<"Matrix4"> }>).push({ x, z, matrix });
          }
        });
        if (top === "G" && FrTreeField.hash(x, z, 801) < FrGroundDecor.FLOWER_CHANCE) {
          const key = "flower|" + FrRegionGrid.keyOf(x, z, FrRegionGrid.DECOR_CELLS);
          if (!plans.has(key)) plans.set(key, []);
          const px = (x + 0.2 + FrTreeField.hash(x, z, 802) * 0.6) * B, pz = (z + 0.2 + FrTreeField.hash(x, z, 803) * 0.6) * B;
          (plans.get(key) as Array<{ x: number; z: number; matrix: Three<"Matrix4"> }>).push({ x, z, matrix: new T.Matrix4().makeTranslation(px, terrain.surfaceY(x, z), pz) });
        }
      }
    }
    const flowerParts = this.flowerParts();
    plans.forEach((list, key) => {
      const name = key.split("|")[0];
      const parts = name === "flower" ? flowerParts : nature.partsOf(name);
      const model = new FrInstancedModel(libs, parts, list.length, name.indexOf("Rock") === 0 || name.indexOf("Bush") === 0);
      list.forEach((entry, i) => {
        model.set(i, entry.matrix);
        const cell = terrain.index(entry.x, entry.z);
        if (!this.byCell.has(cell)) this.byCell.set(cell, []);
        (this.byCell.get(cell) as FrDecorEntry[]).push({ model, index: i });
      });
      if (name === "flower") list.forEach((_entry, i) => model.meshes[1].setColorAt(i, new T.Color(FrGroundDecor.FLOWER_COLORS[i % FrGroundDecor.FLOWER_COLORS.length])));
      model.commit();
      model.addTo(group);
      this.models.push(model);
    });
  }

  private flowerParts(): FrModelPart[] {
    const T = this.libs.THREE;
    const stem = new T.CylinderGeometry(0.05, 0.06, 0.8, 4).translate(0, 0.4, 0);
    const petals = new T.IcosahedronGeometry(0.26, 0).scale(1, 0.55, 1).translate(0, 0.85, 0);
    return [
      { geometry: stem, material: new T.MeshLambertMaterial({ color: 0x4f9a3f }) },
      { geometry: petals, material: new T.MeshLambertMaterial({ color: 0xffffff }) },
    ];
  }

  clearCell(x: number, z: number): void {
    const cell = this.world.terrain.index(x, z);
    const list = this.byCell.get(cell);
    if (!list) return;
    list.forEach((entry) => { entry.model.hide(entry.index); entry.model.commit(false); });
    this.byCell.delete(cell);
  }
}
