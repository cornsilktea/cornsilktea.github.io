interface FrPoint { x: number; z: number }
interface FrAnchors {
  plaza: { x: number; z: number; radius: number; height: number };
  campfire: FrPoint;
  publicChest: { x: number; z: number; size: number };
  portals: Record<string, { x: number; z: number; height: number }>;
  lots: Array<{ x: number; z: number; size: number; height: number }>;
  farm: { x: number; z: number; w: number; d: number; expand?: Array<{ x: number; z: number; w: number; d: number }> };
  bridges: Record<string, Array<[number, number]>>;
  jungleZones: Array<[number, number]>;
  paths: Record<string, Array<[number, number]>>;
}
interface FrTerrainFile { w: number; d: number; heights: string[]; tops: string[]; anchors: FrAnchors }
interface FrTerrainEdit { h: number; t: string }

class FrTerrainData {
  static readonly BLOCK = 2;
  static readonly MIN_HEIGHT = -1;
  static readonly OCEAN = "O";
  static readonly RIVER = "R";
  static readonly WATER_LEVEL = -1;
  static readonly DUG_TOP = "D";
  private static readonly SIDES: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  private readonly flooded: Set<number> = new Set();

  readonly w: number;
  readonly d: number;
  readonly anchors: FrAnchors;
  private readonly heights: Int8Array;
  private readonly tops: string[];
  private readonly original: Int8Array;
  private readonly originalTops: string[];
  private readonly shielded: Set<number> = new Set();

  constructor(file: FrTerrainFile) {
    this.w = file.w;
    this.d = file.d;
    this.anchors = file.anchors;
    this.heights = new Int8Array(this.w * this.d);
    this.tops = new Array(this.w * this.d);
    for (let z = 0; z < this.d; z++) {
      for (let x = 0; x < this.w; x++) {
        this.heights[z * this.w + x] = file.heights[z].charCodeAt(x) - 97 - 2;
        this.tops[z * this.w + x] = file.tops[z].charAt(x);
      }
    }
    this.levelBridgeLandings();
    this.original = this.heights.slice();
    this.originalTops = this.tops.slice();
    this.markShielded();
  }

  private static readonly LANDING_REACH = 3;

  private levelBridgeLandings(): void {
    const bridges = this.anchors.bridges || {};
    Object.keys(bridges).forEach((id) => {
      const cells = bridges[id];
      if (!cells || cells.length === 0) return;
      const alongX = cells.every(([, z]) => z === cells[0][1]);
      const step: [number, number] = alongX ? [1, 0] : [0, 1];
      const side: [number, number] = alongX ? [0, 1] : [1, 0];
      const ends: Array<[[number, number], number]> = [[cells[0], -1], [cells[cells.length - 1], 1]];
      ends.forEach(([[ex, ez], dir]) => {
        [0, 1].forEach((row) => {
          for (let k = 1; k <= FrTerrainData.LANDING_REACH; k++) {
            const x = ex + step[0] * dir * k + side[0] * row, z = ez + step[1] * dir * k + side[1] * row;
            if (!this.inside(x, z) || this.isWater(x, z)) continue;
            const i = this.index(x, z);
            if (this.heights[i] !== 1) break;
            this.heights[i] = 0;
          }
        });
      });
    });
  }

  index(x: number, z: number): number { return z * this.w + x; }
  inside(x: number, z: number): boolean { return x >= 0 && z >= 0 && x < this.w && z < this.d; }
  height(x: number, z: number): number { return this.inside(x, z) ? this.heights[this.index(x, z)] : -2; }
  top(x: number, z: number): string {
    if (!this.inside(x, z)) return FrTerrainData.OCEAN;
    const i = this.index(x, z);
    return this.flooded.has(i) ? FrTerrainData.RIVER : this.tops[i];
  }

  isSource(x: number, z: number): boolean {
    if (!this.inside(x, z)) return true;
    const t = this.originalTops[this.index(x, z)];
    return t === FrTerrainData.OCEAN || t === FrTerrainData.RIVER;
  }

  isFlooded(x: number, z: number): boolean { return this.inside(x, z) && this.flooded.has(this.index(x, z)); }

  refreshFlood(dammed: (index: number) => boolean): number[] {
    const next = new Set<number>();
    const queue: number[] = [];
    for (let i = 0; i < this.w * this.d; i++) if (this.isSource(i % this.w, Math.floor(i / this.w))) queue.push(i);
    while (queue.length > 0) {
      const i = queue.pop() as number;
      const x = i % this.w, z = Math.floor(i / this.w);
      FrTerrainData.SIDES.forEach(([dx, dz]) => {
        const nx = x + dx, nz = z + dz;
        if (!this.inside(nx, nz) || this.isSource(nx, nz)) return;
        const n = this.index(nx, nz);
        if (next.has(n) || this.heights[n] > FrTerrainData.WATER_LEVEL || dammed(n)) return;
        next.add(n);
        queue.push(n);
      });
    }
    const changed: number[] = [];
    this.flooded.forEach((i) => { if (!next.has(i)) changed.push(i); });
    next.forEach((i) => { if (!this.flooded.has(i)) changed.push(i); });
    this.flooded.clear();
    next.forEach((i) => this.flooded.add(i));
    return changed;
  }
  isWater(x: number, z: number): boolean { const t = this.top(x, z); return t === FrTerrainData.OCEAN || t === FrTerrainData.RIVER; }
  surfaceY(x: number, z: number): number { return this.height(x, z) * FrTerrainData.BLOCK; }

  cellOf(worldCoordinate: number): number { return Math.floor(worldCoordinate / FrTerrainData.BLOCK); }

  canStep(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    if (!this.inside(toX, toZ) || this.top(toX, toZ) === FrTerrainData.OCEAN) return false;
    if (this.isWater(fromX, fromZ) || this.isWater(toX, toZ)) return true;
    return this.height(toX, toZ) - this.height(fromX, fromZ) <= 1;
  }

  edit(x: number, z: number, edit: FrTerrainEdit): void {
    const i = this.index(x, z);
    this.heights[i] = edit.h;
    this.tops[i] = edit.t === FrTerrainData.RIVER && !this.isSource(x, z) ? FrTerrainData.DUG_TOP : edit.t;
  }

  restore(x: number, z: number): void {
    const i = this.index(x, z);
    this.heights[i] = this.original[i];
    this.tops[i] = this.originalTops[i];
  }

  editOf(x: number, z: number): FrTerrainEdit | null {
    const i = this.index(x, z);
    if (this.heights[i] === this.original[i] && this.tops[i] === this.originalTops[i]) return null;
    return { h: this.heights[i], t: this.tops[i] };
  }

  isShielded(x: number, z: number): boolean { return this.shielded.has(this.index(x, z)); }

  diggable(x: number, z: number): boolean {
    if (!this.inside(x, z) || this.isShielded(x, z) || this.isWater(x, z)) return false;
    return this.height(x, z) - 1 >= FrTerrainData.MIN_HEIGHT;
  }

  private markShielded(): void {
    const a = this.anchors;
    const shield = (cx: number, cz: number, radius: number) => {
      for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
          if (this.inside(x, z) && Math.hypot(x - cx, z - cz) <= radius) this.shielded.add(this.index(x, z));
        }
      }
    };
    shield(a.plaza.x, a.plaza.z, a.plaza.radius + 1.5);
    shield(a.publicChest.x + 0.5, a.publicChest.z + 0.5, 3);
    Object.keys(a.portals).forEach((id) => shield(a.portals[id].x, a.portals[id].z, 3.5));
    Object.keys(a.paths).forEach((id) => a.paths[id].forEach(([x, z]) => shield(x + 0.5, z + 0.5, 1.2)));
    Object.keys(a.bridges).forEach((id) => a.bridges[id].forEach(([x, z]) => shield(x, z, 1.5)));
    a.lots.forEach((l) => { for (let j = 0; j < l.size; j++) for (let i = 0; i < l.size; i++) this.shielded.add(this.index(l.x + i, l.z + j)); });
    for (let j = 0; j < a.farm.d + 4; j++) for (let i = 0; i < a.farm.w; i++) this.shielded.add(this.index(a.farm.x + i, a.farm.z + j));
  }
}

class FrTreeSpot {
  constructor(readonly x: number, readonly z: number, readonly variant: number, readonly zone: number) {}
}

class FrTreeField {
  static readonly ZONE_DENSITY = 0.85;
  static readonly OPEN_DENSITY = 0.24;
  static readonly HILL_DENSITY = 0.3;

  static hash(x: number, z: number, salt: number): number {
    let h = Math.imul((x * 73856093) ^ (z * 19349663) ^ (salt * 83492791), 2654435761);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  static generate(data: FrTerrainData): FrTreeSpot[] {
    const zoneOf = new Map<number, number>();
    data.anchors.jungleZones.forEach(([x0, z0], zone) => {
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) zoneOf.set(data.index(x0 + i, z0 + j), zone);
    });
    const spots: FrTreeSpot[] = [];
    for (let z = 1; z < data.d - 1; z++) {
      for (let x = 1; x < data.w - 1; x++) {
        if (data.top(x, z) !== "G" || data.isShielded(x, z)) continue;
        const zone = zoneOf.has(data.index(x, z)) ? (zoneOf.get(data.index(x, z)) as number) : -1;
        const far = Math.hypot(x - data.anchors.plaza.x, z - data.anchors.plaza.z) > 14;
        const density = zone >= 0 ? FrTreeField.ZONE_DENSITY : far ? (data.height(x, z) >= 3 ? FrTreeField.HILL_DENSITY : FrTreeField.OPEN_DENSITY) : 0;
        if (FrTreeField.hash(x, z, 21) > density) continue;
        spots.push(new FrTreeSpot(x, z, Math.floor(FrTreeField.hash(x, z, 5) * 3), zone));
      }
    }
    return spots;
  }
}

class FrTerrainTiles {
  static readonly SIZE = 16;
  static readonly COLUMNS = 8;
  static readonly ROWS = 2;
  static readonly NAMES: readonly string[] = ["grassTop", "grassSide", "dirt", "stone", "sand", "snowTop", "snowSide", "riverBed", "plank", "caveFloor", "caveRock", "crystal", "dark", "lava", "seaBed", "stoneDark"];
  private static readonly TOP: Readonly<Record<string, string>> = {
    G: "grassTop", D: "dirt", S: "stone", N: "sand", W: "snowTop", R: "riverBed", O: "riverBed", P: "plank", C: "caveFloor", T: "caveRock", V: "crystal", K: "dark", L: "lava",
  };
  private static readonly SIDE: Readonly<Record<string, [string, string]>> = {
    G: ["grassSide", "dirt"], D: ["dirt", "dirt"], S: ["stone", "stoneDark"], N: ["sand", "sand"], W: ["snowSide", "stone"], R: ["dirt", "dirt"], O: ["dirt", "dirt"],
    P: ["plank", "plank"], C: ["caveRock", "caveRock"], T: ["caveRock", "caveRock"], V: ["crystal", "caveRock"], K: ["dark", "dark"], L: ["lava", "dark"],
  };

  static topOf(type: string): string { return FrTerrainTiles.TOP[type] || "grassTop"; }
  static sideOf(type: string, upper: boolean): string { const pair = FrTerrainTiles.SIDE[type] || FrTerrainTiles.SIDE.G; return upper ? pair[0] : pair[1]; }

  static rect(name: string): [number, number, number, number] {
    const index = Math.max(0, FrTerrainTiles.NAMES.indexOf(name));
    const col = index % FrTerrainTiles.COLUMNS, row = Math.floor(index / FrTerrainTiles.COLUMNS);
    const w = FrTerrainTiles.COLUMNS * FrTerrainTiles.SIZE, h = FrTerrainTiles.ROWS * FrTerrainTiles.SIZE;
    const inset = 0.02;
    const u0 = (col * FrTerrainTiles.SIZE + inset) / w, u1 = ((col + 1) * FrTerrainTiles.SIZE - inset) / w;
    const v1 = 1 - (row * FrTerrainTiles.SIZE + inset) / h, v0 = 1 - ((row + 1) * FrTerrainTiles.SIZE - inset) / h;
    return [u0, v0, u1, v1];
  }
}

class FrTerrainMesher {
  static readonly CHUNK = 16;
  private static readonly NEIGHBORS: ReadonlyArray<[number, number, number]> = [[1, 0, 0.8], [-1, 0, 0.8], [0, 1, 0.92], [0, -1, 0.68]];
  private static readonly LOWEST = -3;

  light: ((x: number, z: number) => [number, number, number]) | null = null;

  constructor(private readonly libs: ThreeLibs, private readonly data: FrTerrainData, private readonly material: Three<"Material">) {}

  chunkCount(): { x: number; z: number } {
    return { x: Math.ceil(this.data.w / FrTerrainMesher.CHUNK), z: Math.ceil(this.data.d / FrTerrainMesher.CHUNK) };
  }

  build(cx: number, cz: number): Three<"Mesh"> | null {
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const x0 = cx * FrTerrainMesher.CHUNK, z0 = cz * FrTerrainMesher.CHUNK;
    for (let z = z0; z < Math.min(this.data.d, z0 + FrTerrainMesher.CHUNK); z++) {
      for (let x = x0; x < Math.min(this.data.w, x0 + FrTerrainMesher.CHUNK); x++) this.addCell(x, z, positions, colors, uvs);
    }
    if (positions.length === 0) return null;
    const geometry = new this.libs.THREE.BufferGeometry();
    geometry.setAttribute("position", new this.libs.THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new this.libs.THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new this.libs.THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new this.libs.THREE.Mesh(geometry, this.material);
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    return mesh;
  }

  private addCell(x: number, z: number, positions: number[], colors: number[], uvs: number[]): void {
    const B = FrTerrainData.BLOCK;
    const h = this.data.height(x, z);
    const type = this.data.top(x, z);
    const y = h * B;
    const noise = 0.94 + FrTreeField.hash(x, z, 9) * 0.1;
    const lit = this.light ? this.light(x, z) : [1, 1, 1];
    const top = [noise * lit[0], noise * lit[1], noise * lit[2]];
    const turn = Math.floor(FrTreeField.hash(x, z, 11) * 4);
    this.quad(positions, colors, uvs, [x * B, y, z * B], [x * B, y, (z + 1) * B], [(x + 1) * B, y, (z + 1) * B], [(x + 1) * B, y, z * B], top, FrTerrainTiles.rect(FrTerrainTiles.topOf(type)), turn);
    FrTerrainMesher.NEIGHBORS.forEach(([dx, dz, factor]) => {
      const nh = this.data.height(x + dx, z + dz);
      if (nh >= h) return;
      const neighborLit = this.light ? this.light(x + dx, z + dz) : [1, 1, 1];
      const px = x * B, pz = z * B;
      for (let level = h; level > Math.max(nh, FrTerrainMesher.LOWEST); level--) {
        const hi = level * B, lo = (level - 1) * B;
        const shade = factor * noise * (level === h ? 1 : 0.92);
        const wall = [shade * neighborLit[0], shade * neighborLit[1], shade * neighborLit[2]];
        const rect = FrTerrainTiles.rect(FrTerrainTiles.sideOf(type, level === h));
        if (dx === 1) this.quad(positions, colors, uvs, [px + B, hi, pz], [px + B, hi, pz + B], [px + B, lo, pz + B], [px + B, lo, pz], wall, rect, -1);
        else if (dx === -1) this.quad(positions, colors, uvs, [px, hi, pz + B], [px, hi, pz], [px, lo, pz], [px, lo, pz + B], wall, rect, -1);
        else if (dz === 1) this.quad(positions, colors, uvs, [px, hi, pz + B], [px + B, hi, pz + B], [px + B, lo, pz + B], [px, lo, pz + B], wall, rect, -1);
        else this.quad(positions, colors, uvs, [px + B, hi, pz], [px, hi, pz], [px, lo, pz], [px + B, lo, pz], wall, rect, -1);
      }
    });
  }

  private quad(positions: number[], colors: number[], uvs: number[], a: number[], b: number[], c: number[], d: number[], color: number[], rect: [number, number, number, number], turn: number): void {
    const [u0, v0, u1, v1] = rect;
    const corners: Array<[number, number]> = turn < 0 ? [[u0, v1], [u1, v1], [u1, v0], [u0, v0]] : [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
    const spin = Math.max(0, turn);
    const at = (k: number) => corners[(k + spin) % 4];
    const order: Array<[number[], [number, number]]> = [[a, at(0)], [b, at(1)], [c, at(2)], [a, at(0)], [c, at(2)], [d, at(3)]];
    order.forEach(([p, uv]) => { positions.push(p[0], p[1], p[2]); colors.push(color[0], color[1], color[2]); uvs.push(uv[0], uv[1]); });
  }
}

class FrWaterDepth {
  static readonly DEEP = 7;

  static compute(terrain: FrTerrainData): Uint8Array {
    const depth = new Uint8Array(terrain.w * terrain.d);
    const queue: number[] = [];
    for (let z = 0; z < terrain.d; z++) for (let x = 0; x < terrain.w; x++) {
      const i = terrain.index(x, z);
      if (terrain.isWater(x, z)) depth[i] = FrWaterDepth.DEEP; else queue.push(i);
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const x = i % terrain.w, z = Math.floor(i / terrain.w);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
        const nx = x + dx, nz = z + dz;
        if (!terrain.inside(nx, nz)) return;
        const n = terrain.index(nx, nz);
        if (depth[n] <= depth[i] + 1) return;
        depth[n] = depth[i] + 1;
        queue.push(n);
      });
    }
    return depth;
  }

  static shade(depth: number): [number, number, number] {
    const t = Math.min(1, Math.max(0, (depth - 1) / (FrWaterDepth.DEEP - 1)));
    const shallow = [0.42, 0.74, 0.9], deep = [0.12, 0.3, 0.56];
    return [shallow[0] + (deep[0] - shallow[0]) * t, shallow[1] + (deep[1] - shallow[1]) * t, shallow[2] + (deep[2] - shallow[2]) * t];
  }
}