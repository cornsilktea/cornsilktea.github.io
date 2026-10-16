type SnModelKey = "snowball" | "pile" | "snowman" | "giftWhite" | "giftBlue" | "giftYellow" | "giftRound" | "rockE" | "rockG" | "rockH" | "homeA" | "homeB" | "tavern" | "mill" | "well" | "tent" | "fence" | "fenceBroken" | "log" | "logStack";

interface SnActorSource {
  readonly num: number; readonly team: number; readonly nick: string;
  readonly x: number; readonly z: number; readonly yaw: number;
  readonly life: SnLife; readonly hp: number; readonly maxHp: number;
  readonly gear: readonly number[]; readonly bigBall: boolean;
  readonly vx: number; readonly vz: number; readonly landAt: number;
  readonly revivesUsed: number; readonly reviveTarget: number; readonly buildUntil: number;
}

interface SnWallSource { readonly id: number; readonly team: number; readonly owner: number; readonly x: number; readonly z: number; readonly yaw: number; readonly hp: number; readonly readyAt: number; readonly expireAt: number }
interface SnShotSource { readonly id: number; readonly x: number; readonly z: number; readonly big: boolean; readonly level: number; readonly traveled: number; readonly dirX: number; readonly dirZ: number }
interface SnCrateSource { readonly num: number; readonly x: number; readonly z: number; readonly item: SnItem; readonly opened: boolean; readonly taken: boolean }
interface SnPileSource { readonly num: number; readonly x: number; readonly z: number; readonly taken: boolean }

interface SnSceneSource {
  readonly time: number;
  readonly mode: SnMode;
  readonly players: readonly SnActorSource[];
  readonly walls: readonly SnWallSource[];
  readonly shots: readonly SnShotSource[];
  readonly crates: readonly SnCrateSource[];
  readonly piles: readonly SnPileSource[];
  stormNow(): SnStormState;
}

class SnPalette {
  static readonly SNOW = "#EEF3F8";
  static readonly BARE = "#6E6258";
  static readonly BLOCKED = "#5C534B";
  static readonly CLIFF = "#8C8A93";
  static readonly ROCK = "#8B8683";
  static readonly SKY = "#C9D8E6";
  static readonly WALL = "#F2F7FB";
  static readonly WALL_HURT = "#AFC3D2";
  static readonly PINE = "#2E5845";
  static readonly PINE_DARK = "#24473A";
  static readonly TRUNK = "#5A4232";
  static teamColor(mode: SnMode, team: number): string {
    const list = mode === "solo" ? SnBalance.TEAM_COLORS_SOLO : SnBalance.TEAM_COLORS_DUOS;
    return list[team % list.length];
  }
}

class SnModelLibrary {
  static readonly DIRECTORY = "assets/kaykit/snow/";
  static readonly FILES: Readonly<Record<SnModelKey, string>> = {
    snowball: "snowball.gltf", pile: "snowball_pile.gltf", snowman: "snowman_A.gltf",
    giftWhite: "present_A_white.gltf", giftBlue: "present_A_blue.gltf", giftYellow: "present_A_yellow.gltf", giftRound: "present_sphere_A_white.gltf",
    rockE: "Rock_1_E_Color1.gltf", rockG: "Rock_1_G_Color1.gltf", rockH: "Rock_1_H_Color1.gltf",
    homeA: "building_home_A_blue.gltf", homeB: "building_home_B_blue.gltf", tavern: "building_tavern_blue.gltf", mill: "building_lumbermill_blue.gltf",
    well: "building_well_blue.gltf", tent: "tent.gltf", fence: "fence.gltf", fenceBroken: "fence_broken.gltf", log: "Wood_Log_A.gltf", logStack: "Wood_Log_Stack.gltf",
  };
  static readonly SNOW_ROOFED: readonly SnModelKey[] = ["homeA", "homeB", "tavern", "mill", "well", "tent"];
  static readonly ANIMATION_FILE = "assets/kaykit/animations/snow_anims.glb";

  readonly clips = new Map<string, Three<"AnimationClip">>();
  private readonly templates = new Map<SnModelKey, Three<"Object3D">>();
  private readonly bounds = new Map<SnModelKey, Three<"Box3">>();
  private readonly snowyMaps = new Map<unknown, Three<"Texture">>();

  constructor(private readonly libs: ThreeLibs) {}

  async load(characterClips: Map<string, Three<"AnimationClip">>): Promise<void> {
    characterClips.forEach((clip, name) => this.clips.set(name, clip));
    const loader = new this.libs.GLTFLoader();
    const models = (Object.keys(SnModelLibrary.FILES) as SnModelKey[]).map((key) =>
      loader.loadAsync(SnModelLibrary.DIRECTORY + SnModelLibrary.FILES[key]).then((gltf) => {
        this.prepare(key, gltf.scene);
        this.templates.set(key, gltf.scene);
        this.bounds.set(key, new this.libs.THREE.Box3().setFromObject(gltf.scene));
      })
    );
    const clips = loader.loadAsync(SnModelLibrary.ANIMATION_FILE).then((gltf) => gltf.animations.forEach((clip) => this.clips.set(clip.name, clip)));
    await Promise.all([...models, clips]);
  }

  size(key: SnModelKey): Three<"Vector3"> {
    const box = this.bounds.get(key);
    return box ? box.getSize(new this.libs.THREE.Vector3()) : new this.libs.THREE.Vector3(1, 1, 1);
  }

  baseOffset(key: SnModelKey): number {
    const box = this.bounds.get(key);
    return box ? -box.min.y : 0;
  }

  clone(key: SnModelKey): Three<"Object3D"> {
    const template = this.templates.get(key);
    if (!template) return new this.libs.THREE.Group();
    return template.clone(true);
  }

  fitted(key: SnModelKey, width: number, depth: number): Three<"Group"> {
    const holder = new this.libs.THREE.Group();
    const model = this.clone(key), size = this.size(key);
    const scale = Math.min(width / Math.max(0.01, size.x), depth / Math.max(0.01, size.z));
    model.scale.setScalar(scale);
    model.position.y = this.baseOffset(key) * scale;
    holder.add(model);
    return holder;
  }

  tinted(key: SnModelKey, color: string): Three<"Object3D"> {
    const model = this.clone(key);
    model.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const material = (mesh.material as Three<"MeshLambertMaterial">).clone();
      material.color = new this.libs.THREE.Color(color);
      mesh.material = material;
    });
    return model;
  }

  private prepare(key: SnModelKey, scene: Three<"Object3D">): void {
    const THREE = this.libs.THREE;
    const snowy = SnModelLibrary.SNOW_ROOFED.indexOf(key) >= 0;
    scene.traverse((node) => {
      const mesh = node as Three<"Mesh">;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const source = mesh.material as Three<"MeshStandardMaterial">;
      const map = snowy && source.map ? this.snowyMap(source.map) : source.map;
      const tint = key.indexOf("rock") === 0 ? new THREE.Color("#E3E9EF") : source.color;
      mesh.material = new THREE.MeshLambertMaterial({ map, color: tint });
      mesh.castShadow = true;
    });
  }

  private snowyMap(texture: Three<"Texture">): Three<"Texture"> {
    const image = texture.image as HTMLImageElement | ImageBitmap;
    const cached = this.snowyMaps.get(image);
    if (cached) return cached;
    const THREE = this.libs.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.drawImage(image as CanvasImageSource, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let k = 0; k < px.length; k += 4) {
      const r = px[k], g = px[k + 1], b = px[k + 2];
      if (b > r + 25 && b >= g) {
        const light = 205 + Math.round((r + g + b) / 3 / 255 * 50);
        px[k] = light - 6; px[k + 1] = light - 2; px[k + 2] = Math.min(255, light + 6);
      }
    }
    context.putImageData(data, 0, 0);
    const result = new THREE.CanvasTexture(canvas);
    result.flipY = texture.flipY;
    result.colorSpace = THREE.SRGBColorSpace;
    result.magFilter = texture.magFilter;
    result.minFilter = texture.minFilter;
    this.snowyMaps.set(image, result);
    return result;
  }
}

class SnMeshBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  get vertexCount(): number { return this.positions.length / 3; }

  vertex(x: number, y: number, z: number, color: Three<"Color">): number {
    this.positions.push(x, y, z);
    this.colors.push(color.r, color.g, color.b);
    return this.vertexCount - 1;
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, c, b, b, c, d);
  }

  geometry(libs: ThreeLibs): TileGeometry {
    const THREE = libs.THREE;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

class SnTerrainView {
  static readonly MOUNTAIN_BASE = 2.4;
  static readonly MOUNTAIN_SLOPE = 2.3;
  static readonly MOUNTAIN_PEAK = 17;
  static readonly SNOWLINE = 7;

  readonly mesh: Three<"Mesh">;
  private readonly tileVertex = new Int32Array(SnGridMath.COUNT).fill(-1);
  private readonly snowTone = new Float32Array(SnGridMath.COUNT);
  private readonly cornerHeight = new Float32Array((SnGridMath.SIZE + 1) * (SnGridMath.SIZE + 1));
  private readonly colorAttribute: Three<"BufferAttribute">;
  private readonly snowColor: Three<"Color">;
  private readonly bareColor: Three<"Color">;
  private dirtyFrom = Infinity;
  private dirtyTo = -1;

  constructor(private readonly libs: ThreeLibs, private readonly map: SnMap) {
    const THREE = libs.THREE;
    this.snowColor = new THREE.Color(SnPalette.SNOW);
    this.bareColor = new THREE.Color(SnPalette.BARE);
    this.computeMountains();
    const builder = new SnMeshBuilder();
    this.buildTops(builder);
    this.buildSides(builder);
    const geometry = builder.geometry(libs);
    this.colorAttribute = geometry.getAttribute("color") as Three<"BufferAttribute">;
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.receiveShadow = true;
  }

  private cornerIndex(ci: number, cj: number): number { return cj * (SnGridMath.SIZE + 1) + ci; }

  private computeMountains(): void {
    const n = SnGridMath.SIZE, map = this.map;
    const distance = new Float32Array(SnGridMath.COUNT).fill(Infinity);
    const queue: number[] = [];
    for (let idx = 0; idx < SnGridMath.COUNT; idx++) if (map.kind[idx] !== SnTile.MOUNTAIN) { distance[idx] = 0; queue.push(idx); }
    for (let head = 0; head < queue.length; head++) {
      const a = queue[head], i = SnGridMath.colOf(a), j = SnGridMath.rowOf(a);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!SnGridMath.inside(i + di, j + dj)) continue;
        const b = SnGridMath.index(i + di, j + dj);
        if (distance[b] > distance[a] + 1) { distance[b] = distance[a] + 1; queue.push(b); }
      }
    }
    for (let cj = 0; cj <= n; cj++) for (let ci = 0; ci <= n; ci++) {
      let mountain = true, ground = -Infinity, far = Infinity;
      for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const i = ci + di, j = cj + dj;
        if (!SnGridMath.inside(i, j)) continue;
        const idx = SnGridMath.index(i, j);
        if (map.kind[idx] === SnTile.MOUNTAIN) { far = Math.min(far, distance[idx]); continue; }
        mountain = false;
        const corners = map.corners(idx);
        const k = (di === -1 ? 1 : 0) + (dj === -1 ? 2 : 0);
        ground = Math.max(ground, corners[k]);
      }
      if (mountain) {
        const noise = Math.sin(ci * 1.7 + cj * 0.9) * 0.6 + Math.sin(ci * 0.43 - cj * 1.31) * 0.9;
        this.cornerHeight[this.cornerIndex(ci, cj)] = Math.min(SnTerrainView.MOUNTAIN_PEAK, SnTerrainView.MOUNTAIN_BASE + (far === Infinity ? 1 : far) * SnTerrainView.MOUNTAIN_SLOPE + noise);
      } else this.cornerHeight[this.cornerIndex(ci, cj)] = ground === -Infinity ? 0 : ground;
    }
  }

  private topCorners(idx: number): [number, number, number, number] {
    if (this.map.kind[idx] !== SnTile.MOUNTAIN) return this.map.corners(idx);
    const i = SnGridMath.colOf(idx), j = SnGridMath.rowOf(idx);
    return [this.cornerHeight[this.cornerIndex(i, j)], this.cornerHeight[this.cornerIndex(i + 1, j)], this.cornerHeight[this.cornerIndex(i, j + 1)], this.cornerHeight[this.cornerIndex(i + 1, j + 1)]];
  }

  private mountainColor(h: number): Three<"Color"> {
    const rock = new this.libs.THREE.Color(SnPalette.ROCK);
    const t = Math.min(1, Math.max(0, (h - SnTerrainView.SNOWLINE) / 3));
    return rock.lerp(this.snowColor, t);
  }

  private buildTops(builder: SnMeshBuilder): void {
    const THREE = this.libs.THREE, map = this.map, cell = SnGridMath.CELL;
    for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
      const x0 = SnGridMath.minX(idx), z0 = SnGridMath.minZ(idx), c = this.topCorners(idx);
      this.snowTone[idx] = 0.965 + ((Math.sin(idx * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.035;
      const mountain = map.kind[idx] === SnTile.MOUNTAIN;
      const base = mountain ? null : map.kind[idx] === SnTile.BLOCK ? new THREE.Color(SnPalette.SNOW).multiplyScalar(0.93) : this.toneColor(idx, true);
      const pts: Array<[number, number, number]> = [[x0, c[0], z0], [x0 + cell, c[1], z0], [x0, c[2], z0 + cell], [x0 + cell, c[3], z0 + cell]];
      const v = pts.map((p) => builder.vertex(p[0], p[1], p[2], base || this.mountainColor(p[1])));
      if (!mountain && map.kind[idx] !== SnTile.BLOCK) this.tileVertex[idx] = v[0];
      builder.quad(v[0], v[1], v[2], v[3]);
    }
  }

  private buildSides(builder: SnMeshBuilder): void {
    const THREE = this.libs.THREE, cell = SnGridMath.CELL;
    const cliffTop = new THREE.Color(SnPalette.SNOW).multiplyScalar(0.9), cliffLow = new THREE.Color(SnPalette.CLIFF).multiplyScalar(0.62);
    const sides: Array<{ di: number; dj: number; mine: [number, number]; theirs: [number, number]; edge: (x0: number, z0: number) => [number, number, number, number] }> = [
      { di: 1, dj: 0, mine: [1, 3], theirs: [0, 2], edge: (x0, z0) => [x0 + cell, z0, x0 + cell, z0 + cell] },
      { di: -1, dj: 0, mine: [2, 0], theirs: [3, 1], edge: (x0, z0) => [x0, z0 + cell, x0, z0] },
      { di: 0, dj: 1, mine: [3, 2], theirs: [1, 0], edge: (x0, z0) => [x0 + cell, z0 + cell, x0, z0 + cell] },
      { di: 0, dj: -1, mine: [0, 1], theirs: [2, 3], edge: (x0, z0) => [x0, z0, x0 + cell, z0] },
    ];
    for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
      const i = SnGridMath.colOf(idx), j = SnGridMath.rowOf(idx), c = this.topCorners(idx);
      const x0 = SnGridMath.minX(idx), z0 = SnGridMath.minZ(idx);
      const mountain = this.map.kind[idx] === SnTile.MOUNTAIN;
      for (const side of sides) {
        const outside = !SnGridMath.inside(i + side.di, j + side.dj);
        const other = outside ? [0, 0, 0, 0] : this.topCorners(SnGridMath.index(i + side.di, j + side.dj));
        const h1 = c[side.mine[0]], h2 = c[side.mine[1]], g1 = other[side.theirs[0]], g2 = other[side.theirs[1]];
        if (h1 <= g1 + 0.01 && h2 <= g2 + 0.01) continue;
        const e = side.edge(x0, z0);
        const top1 = mountain ? this.mountainColor(h1) : cliffTop, top2 = mountain ? this.mountainColor(h2) : cliffTop;
        const a = builder.vertex(e[0], Math.min(h1, g1), e[1], cliffLow), b = builder.vertex(e[2], Math.min(h2, g2), e[3], cliffLow);
        const t1 = builder.vertex(e[0], h1, e[1], top1), t2 = builder.vertex(e[2], h2, e[3], top2);
        builder.indices.push(a, t1, b, b, t1, t2);
      }
    }
  }

  private toneColor(idx: number, snow: boolean): Three<"Color"> {
    const tone = this.snowTone[idx];
    return (snow ? this.snowColor : this.bareColor).clone().multiplyScalar(snow ? tone : 0.9 + (tone - 0.965) * 4);
  }

  setSnow(idx: number, hasSnow: boolean): void {
    const v = this.tileVertex[idx];
    if (v < 0) return;
    const color = this.toneColor(idx, hasSnow);
    for (let k = 0; k < 4; k++) this.colorAttribute.setXYZ(v + k, color.r, color.g, color.b);
    this.dirtyFrom = Math.min(this.dirtyFrom, v);
    this.dirtyTo = Math.max(this.dirtyTo, v + 3);
  }

  syncAll(amount: Uint8Array | readonly number[]): void {
    for (let idx = 0; idx < SnGridMath.COUNT; idx++) this.setSnow(idx, amount[idx] > 0);
  }

  flush(): void {
    if (this.dirtyTo < 0) return;
    this.colorAttribute.clearUpdateRanges();
    this.colorAttribute.addUpdateRange(this.dirtyFrom * 3, (this.dirtyTo - this.dirtyFrom + 1) * 3);
    this.colorAttribute.needsUpdate = true;
    this.dirtyFrom = Infinity; this.dirtyTo = -1;
  }
}

class SnPineGeometry {
  static build(libs: ThreeLibs): TileGeometry {
    const THREE = libs.THREE;
    const parts: Array<{ geometry: TileGeometry; y: number; color: string }> = [
      { geometry: new THREE.CylinderGeometry(0.16, 0.22, 1.3, 6), y: 0.65, color: SnPalette.TRUNK },
      { geometry: new THREE.ConeGeometry(1.7, 2.2, 8), y: 2.0, color: SnPalette.PINE_DARK },
      { geometry: new THREE.ConeGeometry(1.25, 0.9, 8), y: 2.75, color: SnPalette.SNOW },
      { geometry: new THREE.ConeGeometry(1.35, 2.0, 8), y: 3.3, color: SnPalette.PINE },
      { geometry: new THREE.ConeGeometry(1.0, 0.85, 8), y: 4.0, color: SnPalette.SNOW },
      { geometry: new THREE.ConeGeometry(0.95, 1.7, 8), y: 4.5, color: SnPalette.PINE },
      { geometry: new THREE.ConeGeometry(0.7, 1.0, 8), y: 5.05, color: SnPalette.SNOW },
    ];
    const positions: number[] = [], normals: number[] = [], colors: number[] = [];
    for (const part of parts) {
      const g = part.geometry.toNonIndexed();
      g.translate(0, part.y, 0);
      const p = g.getAttribute("position") as Three<"BufferAttribute">, n = g.getAttribute("normal") as Three<"BufferAttribute">, c = new THREE.Color(part.color);
      for (let k = 0; k < p.count; k++) {
        positions.push(p.getX(k), p.getY(k), p.getZ(k));
        normals.push(n.getX(k), n.getY(k), n.getZ(k));
        colors.push(c.r, c.g, c.b);
      }
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    merged.computeBoundingSphere();
    return merged;
  }
}

class SnPropsView {
  static readonly SECTORS = 4;
  readonly group: Three<"Group">;

  constructor(private readonly libs: ThreeLibs, private readonly library: SnModelLibrary, private readonly map: SnMap) {
    this.group = new libs.THREE.Group();
    this.buildPines();
    this.buildModels();
  }

  private sectorOf(x: number, z: number): number {
    const s = SnPropsView.SECTORS, size = SnGridMath.HALF * 2 / s;
    const i = Math.min(s - 1, Math.max(0, Math.floor((x + SnGridMath.HALF) / size))), j = Math.min(s - 1, Math.max(0, Math.floor((z + SnGridMath.HALF) / size)));
    return j * s + i;
  }

  private pineMaterial: Three<"MeshLambertMaterial"> | null = null;
  private pineFade = 1;

  fadePines(wanted: boolean, dt: number): void {
    if (!this.pineMaterial) return;
    const target = wanted ? 0.38 : 1;
    this.pineFade += (target - this.pineFade) * Math.min(1, dt * 6);
    this.pineMaterial.opacity = this.pineFade;
    this.pineMaterial.depthWrite = this.pineFade > 0.95;
  }

  private buildPines(): void {
    const THREE = this.libs.THREE;
    const geometry = SnPineGeometry.build(this.libs);
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 });
    this.pineMaterial = material;
    const buckets = new Map<number, SnObstacle[]>();
    for (const o of this.map.obstacles) {
      if (o.model !== "pine") continue;
      const key = this.sectorOf(o.x, o.z);
      if (!buckets.has(key)) buckets.set(key, []);
      (buckets.get(key) as SnObstacle[]).push(o);
    }
    buckets.forEach((list) => {
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
      list.forEach((o, k) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.yaw);
        matrix.compose(new THREE.Vector3(o.x, this.map.heightAt(o.x, o.z), o.z), q, new THREE.Vector3(o.scale, o.scale, o.scale));
        mesh.setMatrixAt(k, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      this.group.add(mesh);
    });
  }

  private modelFor(o: SnObstacle, index: number): Three<"Object3D"> | null {
    const lib = this.library;
    switch (o.model) {
      case "rock": { const rock = lib.fitted((["rockG", "rockH", "rockE"] as SnModelKey[])[index % 3], o.radius * 2.2, o.radius * 2.2); rock.scale.y = 0.7; return rock; }
      case "house": return lib.fitted(index % 2 ? "homeB" : "homeA", o.halfX * 2, o.halfZ * 2);
      case "tavern": return lib.fitted("tavern", o.halfX * 2, o.halfZ * 2);
      case "mill": return lib.fitted("mill", o.halfX * 2, o.halfZ * 2);
      case "well": return lib.fitted("well", o.radius * 2, o.radius * 2);
      case "tent": return lib.fitted("tent", o.radius * 2, o.radius * 2);
      case "fence": return lib.fitted(index % 3 === 2 ? "fenceBroken" : "fence", o.halfX * 2, o.halfZ * 2 + 0.3);
      case "woodpile": return lib.fitted("logStack", o.halfX * 2, o.halfZ * 2);
      case "log": {
        const holder = new this.libs.THREE.Group(), inner = lib.fitted("log", o.halfZ * 2, o.halfX * 2);
        inner.rotation.y = Math.PI / 2;
        holder.add(inner);
        return holder;
      }
      default: return null;
    }
  }

  private buildModels(): void {
    this.map.obstacles.forEach((o, index) => {
      if (o.model === "pine") return;
      const model = this.modelFor(o, index);
      if (!model) return;
      model.position.set(o.x, this.map.heightAt(o.x, o.z), o.z);
      model.rotation.y += o.yaw;
      model.traverse((node) => { const mesh = node as Three<"Mesh">; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
      this.group.add(model);
    });
  }
}

class SnStormView {
  static readonly HEIGHT = 36;
  readonly group: Three<"Group">;
  private readonly wall: Three<"Mesh">;
  private readonly nextLine: Three<"Line">;
  private readonly texture: Three<"CanvasTexture">;
  private nextKey = "";

  constructor(private readonly libs: ThreeLibs, private readonly map: SnMap) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.texture = this.streakTexture();
    const geometry = new THREE.CylinderGeometry(1, 1, SnStormView.HEIGHT, 96, 1, true);
    geometry.translate(0, SnStormView.HEIGHT / 2 - 2, 0);
    this.wall = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture, color: "#FFFFFF", transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    this.wall.renderOrder = 5;
    this.nextLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.9 }));
    this.group.add(this.wall, this.nextLine);
  }

  private streakTexture(): Three<"CanvasTexture"> {
    const THREE = this.libs.THREE;
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 128;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    const gradient = context.createLinearGradient(0, 128, 0, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0.75)");
    gradient.addColorStop(1, "rgba(255,255,255,0.05)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 128);
    const random = new SnSeededRandom(38);
    for (let k = 0; k < 140; k++) {
      context.fillStyle = "rgba(255,255,255," + random.range(0.2, 0.7).toFixed(2) + ")";
      const x = random.range(0, 256), y = random.range(0, 128);
      context.fillRect(x, y, random.range(6, 28), random.range(1, 2.5));
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 2);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private ringPoints(x: number, z: number, r: number): number[] {
    const points: number[] = [];
    for (let k = 0; k <= 128; k++) {
      const a = k / 128 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      points.push(px, Math.max(0, Math.min(5, this.map.heightAt(px, pz))) + 0.25, pz);
    }
    return points;
  }

  update(state: SnStormState, dt: number): void {
    const visible = state.r > 0.3;
    this.wall.visible = visible;
    if (visible) {
      this.wall.position.set(state.x, 0, state.z);
      this.wall.scale.set(state.r, 1, state.r);
      this.texture.repeat.x = Math.max(2, Math.round(state.r * 0.35));
    }
    this.texture.offset.x += dt * 0.05;
    this.texture.offset.y -= dt * 0.12;
    const next = state.next;
    const key = next ? next.x.toFixed(2) + "," + next.z.toFixed(2) + "," + next.r : "";
    if (key !== this.nextKey) {
      this.nextKey = key;
      this.nextLine.visible = !!next && next.r > 0.3;
      if (next) {
        this.nextLine.geometry.dispose();
        this.nextLine.geometry = new this.libs.THREE.BufferGeometry();
        this.nextLine.geometry.setAttribute("position", new this.libs.THREE.Float32BufferAttribute(this.ringPoints(next.x, next.z, next.r), 3));
      }
    }
  }
}

class SnSnowfall {
  static readonly COUNT = 700;
  static readonly SPAN = 36;
  readonly points: Three<"Points">;
  private readonly speeds = new Float32Array(SnSnowfall.COUNT);

  constructor(private readonly libs: ThreeLibs) {
    const THREE = libs.THREE;
    const positions = new Float32Array(SnSnowfall.COUNT * 3);
    const random = new SnSeededRandom(91);
    for (let k = 0; k < SnSnowfall.COUNT; k++) {
      positions[k * 3] = random.range(-1, 1) * SnSnowfall.SPAN;
      positions[k * 3 + 1] = random.range(0, 22);
      positions[k * 3 + 2] = random.range(-1, 1) * SnSnowfall.SPAN;
      this.speeds[k] = random.range(1.2, 2.6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: "#FFFFFF", size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
    this.points.frustumCulled = false;
  }

  setDensity(share: number): void {
    this.points.geometry.setDrawRange(0, Math.round(SnSnowfall.COUNT * share));
  }

  update(dt: number, focusX: number, focusZ: number, heavy: boolean): void {
    const attribute = this.points.geometry.getAttribute("position") as Three<"BufferAttribute">;
    const array = attribute.array as Float32Array, span = SnSnowfall.SPAN, boost = heavy ? 3 : 1;
    for (let k = 0; k < SnSnowfall.COUNT; k++) {
      let x = array[k * 3], y = array[k * 3 + 1], z = array[k * 3 + 2];
      y -= this.speeds[k] * dt * boost;
      x += Math.sin(y * 0.7 + k) * dt * 0.4 + (heavy ? dt * 4 : 0);
      if (y < 0) y += 22;
      if (x - focusX > span) x -= span * 2; else if (x - focusX < -span) x += span * 2;
      if (z - focusZ > span) z -= span * 2; else if (z - focusZ < -span) z += span * 2;
      array[k * 3] = x; array[k * 3 + 1] = y; array[k * 3 + 2] = z;
    }
    attribute.needsUpdate = true;
  }
}

class SnWallView {
  private readonly meshes = new Map<number, Three<"Mesh">>();
  private readonly geometry: TileGeometry;

  constructor(private readonly libs: ThreeLibs, private readonly parent: Three<"Object3D">, private readonly map: SnMap, private readonly mode: SnMode) {
    const THREE = libs.THREE;
    this.geometry = new THREE.BoxGeometry(SnBalance.WALL.halfLength * 2, SnBalance.WALL.height, SnBalance.WALL.halfDepth * 2, 6, 3, 1);
    this.geometry.translate(0, SnBalance.WALL.height / 2, 0);
    const position = this.geometry.getAttribute("position") as Three<"BufferAttribute">;
    for (let k = 0; k < position.count; k++) {
      const x = position.getX(k), y = position.getY(k), z = position.getZ(k);
      const bump = y > SnBalance.WALL.height - 0.01 ? Math.sin(x * 3.1) * 0.1 : 0;
      position.setXYZ(k, x, y + bump, z * (1 - y / SnBalance.WALL.height * 0.25));
    }
    this.geometry.computeVertexNormals();
  }

  private make(w: SnWallSource): Three<"Mesh"> {
    const THREE = this.libs.THREE;
    const mesh = new THREE.Mesh(this.geometry, new THREE.MeshLambertMaterial({ color: SnPalette.WALL, transparent: true }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(SnBalance.WALL.halfLength * 2 + 0.02, 0.16, SnBalance.WALL.halfDepth * 2 + 0.02), new THREE.MeshBasicMaterial({ color: SnPalette.teamColor(this.mode, w.team) }));
    band.position.y = 0.1;
    mesh.add(band);
    mesh.position.set(w.x, this.map.heightAt(w.x, w.z), w.z);
    mesh.rotation.y = w.yaw;
    this.parent.add(mesh);
    return mesh;
  }

  sync(walls: readonly SnWallSource[], time: number): void {
    const seen = new Set<number>();
    for (const w of walls) {
      seen.add(w.id);
      let mesh = this.meshes.get(w.id);
      if (!mesh) { mesh = this.make(w); this.meshes.set(w.id, mesh); }
      const build = Math.min(1, Math.max(0, 1 - (w.readyAt - time) / SnBalance.WALL.buildTime));
      const melt = Math.min(1, Math.max(0, (w.expireAt - time) / 3));
      mesh.scale.set(1, Math.max(0.08, build) * (0.35 + 0.65 * melt), 1);
      const material = mesh.material as Three<"MeshLambertMaterial">;
      material.opacity = build < 1 ? 0.55 + build * 0.45 : 0.4 + 0.6 * melt;
      material.color.set(SnPalette.WALL).lerp(new this.libs.THREE.Color(SnPalette.WALL_HURT), 1 - Math.max(0, w.hp) / SnBalance.WALL.hp);
    }
    this.meshes.forEach((mesh, id) => {
      if (seen.has(id)) return;
      this.parent.remove(mesh);
      (mesh.material as Three<"Material">).dispose();
      this.meshes.delete(id);
    });
  }
}

class SnItemIcon {
  static build(libs: ThreeLibs, item: SnItem): Three<"Group"> {
    const THREE = libs.THREE, group = new THREE.Group();
    const color = item.kind === "gear" ? SnBalance.GRADE_COLORS[item.grade] : item.kind === "cocoa" ? "#7A4A2E" : "#FFFFFF";
    const material = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.25) });
    const add = (geometry: TileGeometry, x: number, y: number, z: number, mat: Three<"Material"> = material) => { const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); group.add(m); return m; };
    if (item.kind === "gear" && item.slot === "hat") { add(new THREE.ConeGeometry(0.28, 0.5, 10), 0, 0.25, 0); add(new THREE.SphereGeometry(0.1, 8, 6), 0, 0.52, 0, new THREE.MeshLambertMaterial({ color: "#FFFFFF" })); }
    else if (item.kind === "gear" && item.slot === "suit") { add(new THREE.BoxGeometry(0.55, 0.6, 0.25), 0, 0.3, 0); add(new THREE.BoxGeometry(0.85, 0.18, 0.22), 0, 0.52, 0); }
    else if (item.kind === "gear") { add(new THREE.BoxGeometry(0.2, 0.18, 0.42), -0.14, 0.09, 0.05); add(new THREE.BoxGeometry(0.2, 0.18, 0.42), 0.14, 0.09, 0.05); add(new THREE.BoxGeometry(0.2, 0.25, 0.18), -0.14, 0.25, -0.07); add(new THREE.BoxGeometry(0.2, 0.25, 0.18), 0.14, 0.25, -0.07); }
    else if (item.kind === "cocoa") { add(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 12), 0, 0.2, 0); add(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 12), 0, 0.4, 0, new THREE.MeshLambertMaterial({ color: "#FFF4E6" })); }
    else add(new THREE.SphereGeometry(0.4, 14, 10), 0, 0.4, 0);
    return group;
  }
}

class SnCrateView {
  private readonly entries: Array<{ gift: Three<"Object3D">; icon: Three<"Group">; beam: Three<"Mesh"> | null; spin: number }> = [];
  private time = 0;

  constructor(private readonly libs: ThreeLibs, private readonly library: SnModelLibrary, private readonly parent: Three<"Object3D">, private readonly map: SnMap, crates: readonly SnCrateSource[]) {
    const THREE = libs.THREE;
    const beamGeometry = new THREE.CylinderGeometry(0.22, 0.42, 7, 10, 1, true);
    beamGeometry.translate(0, 3.5, 0);
    for (const c of crates) {
      const y = map.heightAt(c.x, c.z);
      const gear = c.item.kind === "gear" ? c.item : null;
      const gift = gear ? (gear.grade === 0 ? library.tinted("giftWhite", SnBalance.GRADE_COLORS[0]) : gear.grade === 1 ? library.clone("giftBlue") : library.tinted("giftYellow", "#FFB277")) : library.clone("giftRound");
      gift.scale.setScalar(1.25);
      gift.position.set(c.x, y + (gear ? 0 : 0.38), c.z);
      gift.rotation.y = (c.num * 1.37) % (Math.PI * 2);
      const icon = SnItemIcon.build(libs, c.item);
      icon.position.set(c.x, y + 0.55, c.z);
      icon.visible = false;
      let beam: Three<"Mesh"> | null = null;
      if (gear) {
        beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: SnBalance.GRADE_COLORS[gear.grade], transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.set(c.x, y, c.z);
        parent.add(beam);
      }
      parent.add(gift, icon);
      this.entries.push({ gift, icon, beam, spin: c.num });
    }
  }

  sync(crates: readonly SnCrateSource[], dt: number): void {
    this.time += dt;
    crates.forEach((c, k) => {
      const e = this.entries[k];
      if (!e) return;
      e.gift.visible = !c.opened && !c.taken;
      e.icon.visible = c.opened && !c.taken;
      if (e.icon.visible) { e.icon.rotation.y += dt * 1.6; e.icon.position.y = this.map.heightAt(c.x, c.z) + 0.55 + Math.sin(this.time * 2.4 + e.spin) * 0.12; }
      if (e.beam) {
        e.beam.visible = !c.taken;
        (e.beam.material as Three<"MeshBasicMaterial">).opacity = 0.22 + 0.12 * Math.sin(this.time * 2 + e.spin);
      }
    });
  }
}

class SnPileView {
  private readonly models: Three<"Object3D">[] = [];
  constructor(library: SnModelLibrary, parent: Three<"Object3D">, map: SnMap, piles: readonly SnPileSource[]) {
    for (const p of piles) {
      const model = library.clone("pile");
      model.position.set(p.x, map.heightAt(p.x, p.z), p.z);
      model.rotation.y = p.num * 0.9;
      model.scale.setScalar(1.1);
      parent.add(model);
      this.models.push(model);
    }
  }
  sync(piles: readonly SnPileSource[]): void { piles.forEach((p, k) => { if (this.models[k]) this.models[k].visible = !p.taken; }); }
}

class SnShotView {
  private readonly balls = new Map<number, Three<"Mesh">>();
  private readonly small: TileGeometry;
  private readonly large: TileGeometry;
  private readonly material: Three<"MeshLambertMaterial">;

  constructor(private readonly libs: ThreeLibs, private readonly parent: Three<"Object3D">, private readonly map: SnMap) {
    const THREE = libs.THREE;
    this.small = new THREE.IcosahedronGeometry(0.17, 1);
    this.large = new THREE.IcosahedronGeometry(SnBalance.BIG.radius, 2);
    this.material = new THREE.MeshLambertMaterial({ color: "#FFFFFF" });
  }

  sync(shots: readonly SnShotSource[], dt: number): void {
    const seen = new Set<number>();
    for (const s of shots) {
      seen.add(s.id);
      let ball = this.balls.get(s.id);
      if (!ball) {
        ball = new this.libs.THREE.Mesh(s.big ? this.large : this.small, this.material);
        ball.castShadow = true;
        this.parent.add(ball);
        this.balls.set(s.id, ball);
      }
      if (s.big) {
        ball.position.set(s.x, this.map.heightAt(s.x, s.z) + SnBalance.BIG.radius, s.z);
        ball.rotation.x += s.dirZ * dt * SnBalance.BIG.speed / SnBalance.BIG.radius;
        ball.rotation.z -= s.dirX * dt * SnBalance.BIG.speed / SnBalance.BIG.radius;
      } else {
        const t = Math.min(1, s.traveled / SnBalance.SHOT.range);
        const base = s.level * SnTile.LEVEL_HEIGHT + 1.3;
        ball.position.set(s.x, base + Math.sin(t * Math.PI) * 0.9 - t * 0.5, s.z);
      }
    }
    this.balls.forEach((ball, id) => {
      if (seen.has(id)) return;
      this.parent.remove(ball);
      this.balls.delete(id);
    });
  }
}

class SnParachute {
  static build(libs: ThreeLibs, color: string): Three<"Group"> {
    const THREE = libs.THREE, group = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    canopy.scale.y = 0.6;
    canopy.position.y = 3.4;
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.62, 12, 6, 0, Math.PI * 2, Math.PI / 4.4, Math.PI / 14), new THREE.MeshLambertMaterial({ color: "#FFFFFF", side: THREE.DoubleSide }));
    stripe.scale.y = 0.6;
    stripe.position.y = 3.4;
    group.add(canopy, stripe);
    const lineMaterial = new THREE.LineBasicMaterial({ color: "#E8EEF4" });
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2;
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(Math.cos(a) * 1.35, 3.6, Math.sin(a) * 1.35)]);
      group.add(new THREE.Line(geometry, lineMaterial));
    }
    return group;
  }
}

class SnPlayerActor {
  static readonly SKY_HEIGHT = 34;
  readonly root: Three<"Group">;
  private readonly body: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly snowman: Three<"Object3D">;
  private readonly ring: Three<"Mesh">;
  private readonly reviveRing: Three<"Mesh">;
  private readonly chute: Three<"Group">;
  private readonly label: Three<"Sprite">;
  private actionUntil = 0;
  private landed = false;
  private x = 0; private z = 0; private y = 0; private yaw = 0;
  private placed = false;

  constructor(private readonly libs: ThreeLibs, parent: Three<"Object3D">, factory: CharacterModelFactory, library: SnModelLibrary, labels: RkLabelFactory, look: CharacterLook, readonly source: SnActorSource, private readonly color: string, private readonly map: SnMap) {
    const THREE = libs.THREE;
    this.root = new THREE.Group();
    this.body = factory.build(look);
    this.body.traverse((node) => { const mesh = node as Three<"Mesh">; if (mesh.isMesh) mesh.castShadow = true; });
    this.animator = new CharacterAnimator(libs, this.body, library.clips);
    this.animator.play("Idle_A");
    this.root.add(this.body);
    this.snowman = library.clone("snowman");
    this.snowman.scale.setScalar(0.62);
    this.snowman.visible = false;
    this.root.add(this.snowman);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.renderOrder = 2;
    this.root.add(this.ring);
    this.reviveRing = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.35, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
    this.reviveRing.rotation.x = -Math.PI / 2;
    this.reviveRing.position.y = 0.07;
    this.reviveRing.visible = false;
    this.root.add(this.reviveRing);
    this.chute = SnParachute.build(libs, color);
    this.chute.visible = false;
    this.root.add(this.chute);
    this.label = labels.create(source.nick, color);
    this.label.position.y = 2.25;
    this.root.add(this.label);
    parent.add(this.root);
  }

  private gearKey = "";
  private hat: Three<"Object3D"> | null = null;
  private scarf: Three<"Object3D"> | null = null;

  private wearGear(gear: readonly number[]): void {
    const key = gear.join(",");
    if (key === this.gearKey) return;
    this.gearKey = key;
    const head = this.body.getObjectByName("head");
    if (!head) return;
    if (this.hat) { head.remove(this.hat); this.hat = null; }
    if (this.scarf) { head.remove(this.scarf); this.scarf = null; }
    if (gear[0] >= 0) { this.hat = SnGearLook.hat(this.libs, gear[0]); this.hat.position.set(0, 0.85, 0); this.hat.scale.setScalar(1.15); head.add(this.hat); }
    if (gear[1] >= 0) { this.scarf = SnGearLook.scarf(this.libs, gear[1]); this.scarf.position.set(0, 0.02, 0); head.add(this.scarf); }
  }

  get worldX(): number { return this.x; }
  get worldY(): number { return this.y; }
  get worldZ(): number { return this.z; }

  play(clip: string, seconds: number, nowMs: number, speed: number = 1): void {
    this.animator.play(clip, { once: true, speed });
    this.actionUntil = nowMs + seconds * 1000 / speed;
  }

  sync(time: number, dt: number, nowMs: number): void {
    const s = this.source;
    const life = s.life;
    const waiting = life === "sky" && s.landAt < 0;
    this.root.visible = !waiting;
    if (waiting) return;
    const ground = this.map.heightAt(s.x, s.z);
    let targetY = ground;
    if (life === "sky") targetY = ground + SnPlayerActor.SKY_HEIGHT * Math.max(0, Math.min(1, (s.landAt - time) / SnBalance.DROP.time));
    if (!this.placed) { this.x = s.x; this.z = s.z; this.y = targetY; this.yaw = s.yaw; this.placed = true; }
    const follow = Math.min(1, dt * 14);
    this.x += (s.x - this.x) * follow; this.z += (s.z - this.z) * follow;
    this.y += (targetY - this.y) * Math.min(1, dt * 18);
    const turn = SnAngle.wrap(s.yaw - this.yaw);
    this.yaw += turn * Math.min(1, dt * 12);
    this.root.position.set(this.x, this.y, this.z);
    this.body.rotation.y = Math.PI / 2 - this.yaw;
    this.wearGear(s.gear);
    const down = life === "down" || life === "out";
    this.body.visible = !down;
    this.snowman.visible = down;
    this.snowman.rotation.y = Math.PI / 2 - this.yaw;
    this.ring.visible = !down && life !== "sky";
    this.reviveRing.visible = life === "down" && s.revivesUsed < SnBalance.REVIVE.max;
    if (this.reviveRing.visible) this.reviveRing.scale.setScalar(1 + Math.sin(nowMs / 260) * 0.06);
    this.chute.visible = life === "sky";
    this.label.position.y = down ? 1.9 : 2.25;
    if (life === "sky") { this.landed = false; this.animator.play("Idle_A"); }
    else if (!down && !this.landed) { this.landed = true; this.play("Spawn_Air", 0.9, nowMs, 1.4); }
    if (!down && life !== "sky" && nowMs >= this.actionUntil) {
      const moving = Math.hypot(s.vx, s.vz) > 0.3;
      if (s.reviveTarget >= 0) this.animator.play("Working_A");
      else if (moving) this.animator.play("Running_A", { speed: Math.max(0.6, Math.hypot(s.vx, s.vz) / 2.6) });
      else this.animator.play("Idle_A");
    }
    this.animator.update(dt);
  }

  dispose(parent: Three<"Object3D">): void { parent.remove(this.root); }
}

class SnAimGuide {
  readonly group: Three<"Group">;
  private readonly arrow: Three<"Mesh">;
  private readonly ghost: Three<"Mesh">;

  constructor(libs: ThreeLibs) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    const strip = new THREE.PlaneGeometry(1, 0.32);
    strip.rotateX(-Math.PI / 2);
    strip.translate(0.5, 0, 0);
    this.arrow = new THREE.Mesh(strip, new THREE.MeshBasicMaterial({ color: "#D97B4F", transparent: true, opacity: 0.75, depthWrite: false }));
    this.arrow.renderOrder = 6;
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(SnBalance.WALL.halfLength * 2, SnBalance.WALL.height, SnBalance.WALL.halfDepth * 2), new THREE.MeshBasicMaterial({ color: "#8FD3FF", transparent: true, opacity: 0.4, depthWrite: false }));
    this.group.add(this.arrow, this.ghost);
    this.group.visible = false;
  }

  hide(): void { this.group.visible = false; }

  show(kind: SnAimKind, x: number, y: number, z: number, angle: number, length: number): void {
    this.group.visible = true;
    this.arrow.visible = kind === "throw";
    this.ghost.visible = kind === "wall";
    if (kind === "throw") {
      this.arrow.position.set(x, y + 0.12, z);
      this.arrow.rotation.y = -angle;
      this.arrow.scale.set(length, 1, 1);
    } else {
      const d = SnBalance.WALL.distance;
      this.ghost.position.set(x + Math.cos(angle) * d, y + SnBalance.WALL.height / 2, z + Math.sin(angle) * d);
      this.ghost.rotation.y = Math.atan2(Math.cos(angle), Math.sin(angle));
    }
  }
}

class SnGearLook {
  static hat(libs: ThreeLibs, grade: number): Three<"Group"> {
    const THREE = libs.THREE, group = new THREE.Group();
    const color = SnBalance.GRADE_COLORS[grade];
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.62, 12), new THREE.MeshLambertMaterial({ color }));
    cone.position.y = 0.31;
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 6, 14), new THREE.MeshLambertMaterial({ color: "#FFFFFF" }));
    brim.rotation.x = Math.PI / 2;
    const bobble = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshLambertMaterial({ color: "#FFFFFF" }));
    bobble.position.y = 0.66;
    group.add(cone, brim, bobble);
    return group;
  }

  static scarf(libs: ThreeLibs, grade: number): Three<"Mesh"> {
    const THREE = libs.THREE;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 6, 16), new THREE.MeshLambertMaterial({ color: SnBalance.GRADE_COLORS[grade] }));
    scarf.rotation.x = Math.PI / 2;
    return scarf;
  }
}

class SnCameraRig {
  static readonly PITCH = (52 * Math.PI) / 180;
  static readonly DISTANCE = 17;
  readonly camera: Three<"PerspectiveCamera">;
  focusX = 0; focusY = 0; focusZ = 0;
  private distance = SnCameraRig.DISTANCE;
  private ready = false;

  constructor(libs: ThreeLibs) {
    this.camera = new libs.THREE.PerspectiveCamera(46, 1, 0.5, 320);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 62 : 46;
    this.camera.updateProjectionMatrix();
  }

  snap(): void { this.ready = false; }

  follow(x: number, y: number, z: number, distance: number, dt: number): void {
    if (!this.ready) { this.focusX = x; this.focusY = y; this.focusZ = z; this.distance = distance; this.ready = true; }
    const k = Math.min(1, dt * 5);
    this.focusX += (x - this.focusX) * k; this.focusY += (y - this.focusY) * k; this.focusZ += (z - this.focusZ) * k;
    this.distance += (distance - this.distance) * Math.min(1, dt * 2);
    const scale = this.camera.aspect < 1 ? 1.3 : 1;
    const up = Math.sin(SnCameraRig.PITCH) * this.distance * scale, back = Math.cos(SnCameraRig.PITCH) * this.distance * scale;
    this.camera.position.set(this.focusX, this.focusY + up, this.focusZ + back);
    this.camera.lookAt(this.focusX, this.focusY, this.focusZ);
  }

  orbit(radius: number, height: number, angle: number, lookX: number, lookY: number, lookZ: number): void {
    this.camera.position.set(lookX + Math.sin(angle) * radius, lookY + height, lookZ + Math.cos(angle) * radius);
    this.camera.lookAt(lookX, lookY, lookZ);
    this.focusX = lookX; this.focusY = lookY; this.focusZ = lookZ;
  }
}

class SnSunShadow {
  static readonly OFFSET = { x: -10, y: 26, z: 14 };
  static readonly HALF_SPAN = 26;
  private readonly light: Three<"DirectionalLight">;

  constructor(libs: ThreeLibs, scene: Three<"Scene">, mapSize: number) {
    this.light = new libs.THREE.DirectionalLight(0xFFF2E0, 1.25);
    this.light.castShadow = true;
    const shadow = this.light.shadow;
    shadow.mapSize.set(mapSize, mapSize);
    const camera = shadow.camera;
    camera.left = camera.bottom = -SnSunShadow.HALF_SPAN;
    camera.right = camera.top = SnSunShadow.HALF_SPAN;
    camera.near = 2; camera.far = 80;
    camera.updateProjectionMatrix();
    shadow.bias = -0.0008;
    shadow.normalBias = 0.04;
    scene.add(this.light, this.light.target);
  }

  follow(x: number, z: number): void {
    const step = (SnSunShadow.HALF_SPAN * 2) / this.light.shadow.mapSize.x;
    const sx = Math.round(x / step) * step, sz = Math.round(z / step) * step;
    this.light.position.set(sx + SnSunShadow.OFFSET.x, SnSunShadow.OFFSET.y, sz + SnSunShadow.OFFSET.z);
    this.light.target.position.set(sx, 0, sz);
  }

  disable(): boolean {
    if (!this.light.castShadow) return false;
    this.light.castShadow = false;
    return true;
  }
}

class SnWorldView {
  readonly scene: Three<"Scene">;
  readonly rig: SnCameraRig;
  playing = false;
  private readonly renderer: Three<"WebGLRenderer">;
  private pixelRatio: number;
  private readonly sun: SnSunShadow;
  private readonly governor: QualityGovernorHandle | null;
  readonly snowfall: SnSnowfall;

  constructor(private readonly libs: ThreeLibs, readonly canvas: HTMLCanvasElement, readonly touchDevice: boolean) {
    const THREE = libs.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SnPalette.SKY);
    this.scene.fog = new THREE.Fog(SnPalette.SKY, 45, 110);
    this.scene.add(new THREE.HemisphereLight(0xE6F0FF, 0x8A93A0, 1.45));
    this.sun = new SnSunShadow(libs, this.scene, 1024);
    this.rig = new SnCameraRig(libs);
    this.snowfall = new SnSnowfall(libs);
    this.scene.add(this.snowfall.points);
    const steps = touchDevice
      ? [() => this.lowerPixelRatio(), () => this.sun.disable(), () => this.thinSnow()]
      : [() => this.lowerPixelRatio(), () => this.thinSnow()];
    this.governor = window.QualityGovernor ? window.QualityGovernor({ steps, storageKey: "snowroyale_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 }) : null;
    if (this.governor) this.governor.restore();
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize(): void {
    const width = window.innerWidth, height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / Math.max(1, height));
  }

  render(dt: number): void {
    this.sun.follow(this.rig.focusX, this.rig.focusZ);
    this.renderer.render(this.scene, this.rig.camera);
    if (this.governor) this.governor.update(dt);
  }

  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new this.libs.THREE.Vector3(x, y, z).project(this.rig.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, visible: v.z < 1 && v.z > -1 };
  }

  private lowerPixelRatio(): boolean {
    if (this.pixelRatio <= 1) return false;
    this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
    return true;
  }

  private thinSnow(): boolean {
    this.snowfall.setDensity(0.35);
    return false;
  }
}

class SnSceneView {
  static readonly OVERVIEW_MIN = 30;
  static readonly OVERVIEW_MAX = 110;
  readonly world: SnWorldView;
  readonly aimGuide: SnAimGuide;
  readonly props: SnPropsView;
  readonly terrain: SnTerrainView;
  readonly matchGroup: Three<"Group">;
  private readonly storm: SnStormView;
  private walls: SnWallView | null = null;
  private crates: SnCrateView | null = null;
  private piles: SnPileView | null = null;
  private shots: SnShotView | null = null;
  readonly actors = new Map<number, SnPlayerActor>();
  private readonly labels: RkLabelFactory;

  constructor(private readonly libs: ThreeLibs, canvas: HTMLCanvasElement, touchDevice: boolean, private readonly library: SnModelLibrary, private readonly factory: CharacterModelFactory, readonly map: SnMap) {
    const THREE = libs.THREE;
    this.world = new SnWorldView(libs, canvas, touchDevice);
    this.terrain = new SnTerrainView(libs, map);
    this.world.scene.add(this.terrain.mesh);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: SnPalette.SNOW }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.06;
    outside.receiveShadow = true;
    this.world.scene.add(outside);
    this.props = new SnPropsView(libs, library, map);
    this.world.scene.add(this.props.group);
    this.storm = new SnStormView(libs, map);
    this.world.scene.add(this.storm.group);
    this.matchGroup = new THREE.Group();
    this.world.scene.add(this.matchGroup);
    this.labels = new RkLabelFactory(libs);
    this.aimGuide = new SnAimGuide(libs);
    this.world.scene.add(this.aimGuide.group);
  }

  setFog(near: number, far: number): void {
    const fog = this.world.scene.fog as Three<"Fog"> | null;
    if (fog) { fog.near = near; fog.far = far; }
  }

  beginMatch(source: SnSceneSource, looks: ReadonlyMap<number, CharacterLook>, snow: Uint8Array | readonly number[]): void {
    this.clearMatch();
    this.terrain.syncAll(snow);
    this.walls = new SnWallView(this.libs, this.matchGroup, this.map, source.mode);
    this.crates = new SnCrateView(this.libs, this.library, this.matchGroup, this.map, source.crates);
    this.piles = new SnPileView(this.library, this.matchGroup, this.map, source.piles);
    this.shots = new SnShotView(this.libs, this.matchGroup, this.map);
    for (const p of source.players) {
      const look = looks.get(p.num) || CharacterLooks.random();
      this.actors.set(p.num, new SnPlayerActor(this.libs, this.matchGroup, this.factory, this.library, this.labels, look, p, SnPalette.teamColor(source.mode, p.team), this.map));
    }
  }

  clearMatch(): void {
    this.actors.forEach((a) => a.dispose(this.matchGroup));
    this.actors.clear();
    while (this.matchGroup.children.length) this.matchGroup.remove(this.matchGroup.children[0]);
    this.walls = null; this.crates = null; this.piles = null; this.shots = null;
  }

  applyEvents(events: readonly SnEvent[], nowMs: number): void {
    for (const ev of events) {
      if (ev.t === "snow") ev.tiles.forEach((idx) => this.terrain.setSnow(idx, false));
      else if (ev.t === "shot") { const a = this.actors.get(ev.by); if (a) a.play("Throw", 1.0, nowMs, 2.2); }
      else if (ev.t === "wall") { const owner = this.wallOwner(ev.id); if (owner) owner.play("Interact", 1.0, nowMs, 1.4); }
      else if (ev.t === "hit") { const a = this.actors.get(ev.to); if (a && !ev.storm) a.play("Hit_A", 0.5, nowMs, 1.6); }
    }
  }

  private pendingWalls: readonly SnWallSource[] = [];
  private wallOwner(id: number): SnPlayerActor | null {
    const w = this.pendingWalls.find((x) => x.id === id);
    return w ? this.actors.get(w.owner) || null : null;
  }

  sync(source: SnSceneSource, dt: number, nowMs: number): void {
    this.pendingWalls = source.walls;
    const storm = source.stormNow();
    this.storm.update(storm, dt);
    if (this.walls) this.walls.sync(source.walls, source.time);
    if (this.crates) this.crates.sync(source.crates, dt);
    if (this.piles) this.piles.sync(source.piles);
    if (this.shots) this.shots.sync(source.shots, dt);
    this.actors.forEach((a) => a.sync(source.time, dt, nowMs));
    this.terrain.flush();
  }

  followActor(num: number, dt: number, distance: number = SnCameraRig.DISTANCE): void {
    const a = this.actors.get(num);
    if (!a) return;
    const sky = a.source.life === "sky";
    this.world.rig.follow(a.worldX, sky ? a.worldY * 0.6 : a.worldY, a.worldZ, sky ? Math.max(26, distance) : distance, dt);
  }

  hideTreesAround(x: number, z: number, dt: number): void {
    const near = this.map.obstaclesAround(x, z, 4).some((o) => o.model === "pine" && Math.hypot(o.x - x, o.z - z - 1.5) < 4.2);
    this.props.fadePines(near, dt);
  }

  followEveryone(dt: number): void {
    const points: Array<{ x: number; z: number }> = [];
    this.actors.forEach((a) => { if (a.source.life === "alive" || (a.source.life === "sky" && a.source.landAt >= 0)) points.push({ x: a.worldX, z: a.worldZ }); });
    if (!points.length) this.actors.forEach((a) => { if (a.root.visible) points.push({ x: a.worldX, z: a.worldZ }); });
    if (!points.length) return;
    let cx = 0, cz = 0;
    points.forEach((p) => { cx += p.x; cz += p.z; });
    cx /= points.length; cz /= points.length;
    let spread = 0;
    points.forEach((p) => { spread = Math.max(spread, Math.hypot(p.x - cx, p.z - cz)); });
    this.world.rig.follow(cx, 0, cz, Math.min(SnSceneView.OVERVIEW_MAX, Math.max(SnSceneView.OVERVIEW_MIN, 14 + spread * 1.35)), dt);
  }

  pickActor(clientX: number, clientY: number): number {
    let best = -1, bd = 46;
    this.actors.forEach((a, num) => {
      if (!a.root.visible) return;
      const p = this.world.project(a.worldX, a.worldY + 1, a.worldZ);
      if (!p.visible) return;
      const d = Math.hypot(p.x - clientX, p.y - clientY);
      if (d < bd) { bd = d; best = num; }
    });
    return best;
  }

  render(dt: number, heavySnow: boolean): void {
    this.world.snowfall.update(dt, this.world.rig.focusX, this.world.rig.focusZ, heavySnow);
    this.world.render(dt);
  }
}
