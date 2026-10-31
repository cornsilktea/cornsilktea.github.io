class FrSiteModels {
  private static readonly STONE_COLORS: ReadonlySet<number> = new Set([0xb9bcc4, 0x8d9098, 0x9fa2aa, 0x7d808a, 0xaeb1b9, 0x8f929b, 0x6d707a, 0x7b7e88, 0x9a9da6, 0x6f727c]);
  private static readonly WOOD_COLORS: ReadonlySet<number> = new Set([0x9a6a38, 0x6f4a26, 0x6b4a2a]);

  constructor(private readonly libs: ThreeLibs, private readonly world: FrWorld, private readonly nature: FrNatureModels) {}

  private surface(color: number): Three<"MeshLambertMaterial"> {
    const T = this.libs.THREE;
    if (FrSiteModels.STONE_COLORS.has(color)) return new T.MeshLambertMaterial({ color, map: FrSurfaceTextures.stone(this.libs) });
    if (FrSiteModels.WOOD_COLORS.has(color)) return new T.MeshLambertMaterial({ color: new T.Color(color).multiplyScalar(1.35), map: FrSurfaceTextures.wood(this.libs) });
    return new T.MeshLambertMaterial({ color });
  }

  fill(site: FrBuildSite, marker: Three<"Group">): void {
    const T = this.libs.THREE;
    const B = FrTerrainData.BLOCK;
    const originX = (site.x + 0.5) * B, originZ = (site.z + 0.5) * B, originY = this.world.terrain.surfaceY(site.x, site.z);
    const lit = (color: number) => this.surface(color);
    const glow = (color: number) => new T.MeshBasicMaterial({ color });
    const put = (w: number, h: number, d: number, x: number, y: number, z: number, material: Three<"Material">, turn = 0) => {
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.rotation.y = turn;
      mesh.castShadow = !(material as Three<"MeshBasicMaterial">).isMeshBasicMaterial;
      mesh.receiveShadow = true;
      marker.add(mesh);
      return mesh;
    };
    const cellCenter = (c: FrPoint) => ({ x: (c.x + 0.5) * B - originX, z: (c.z + 0.5) * B - originZ, y: this.world.terrain.surfaceY(c.x, c.z) - originY });
    const builders: Record<string, () => void> = {
      bridge: () => this.bridge(site, put, lit, cellCenter),
      stairs: () => this.stairs(site, put, lit),
      wall: () => site.cells.forEach((c, i) => {
        const p = cellCenter(c);
        put(B, 4, B, p.x, p.y + 2, p.z, lit(0x9fa2aa));
        put(B + 0.1, 0.5, B + 0.1, p.x, p.y + 4.25, p.z, lit(0x7d808a));
        if (i % 2 === 0) put(0.9, 0.7, 0.9, p.x, p.y + 4.8, p.z, lit(0xaeb1b9));
      }),
      gate: () => {
        site.cells.forEach((c) => {
          const p = cellCenter(c);
          put(B, 6.4, B, p.x, p.y + 3.2, p.z, lit(0x8f929b));
          put(B + 0.3, 0.5, B + 0.3, p.x, p.y + 6.65, p.z, lit(0x6d707a));
        });
        const length = 7 * B;
        const high = cellCenter(site.cells[0]).y + 6.9;
        put(length, 1.3, B, 0, high, 0, lit(0x7b7e88), -site.heading);
        put(length - 2, 0.35, B + 0.2, 0, high - 0.85, 0, glow(0xd97b4f), -site.heading);
      },
      tower: () => {
        const sum = site.cells.reduce((a: { x: number; y: number; z: number }, c) => ({ x: a.x + cellCenter(c).x, z: a.z + cellCenter(c).z, y: Math.max(a.y, cellCenter(c).y) }), { x: 0, z: 0, y: -99 });
        const cx = sum.x / site.cells.length, cz = sum.z / site.cells.length;
        put(2 * B - 0.4, 8, 2 * B - 0.4, cx, sum.y + 4, cz, lit(0x9a9da6));
        put(2 * B + 0.8, 0.7, 2 * B + 0.8, cx, sum.y + 8.3, cz, lit(0x6f727c));
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dz]) => put(0.8, 1.1, 0.8, cx + dx * (B + 0.1), sum.y + 9.2, cz + dz * (B + 0.1), lit(0xaeb1b9)));
        put(0.2, 3.2, 0.2, cx, sum.y + 10, cz, lit(0x6b4a2a));
        put(1.5, 0.9, 0.08, cx + 0.8, sum.y + 11.2, cz, glow(0xd97b4f));
        put(0.7, 1.2, 0.12, cx, sum.y + 6.2, cz + B - 0.15, glow(0xffe29a));
      },
      lamp: () => {
        if (this.nature.has("lantern")) {
          const lantern = this.nature.build("lantern");
          lantern.scale.setScalar(1.3);
          marker.add(lantern);
          put(0.5, 0.5, 0.5, 0, 4.6, 0, glow(0xffe29a));
        } else {
          put(0.28, 4.2, 0.28, 0, 2.1, 0, lit(0x3d3f46));
          put(0.9, 0.9, 0.9, 0, 4.6, 0, glow(0xffe29a));
        }
        const halo = new T.Sprite(new T.SpriteMaterial({ map: FrFxTextures.radial(this.libs, "rgba(255,220,140,0.55)", "rgba(255,220,140,0)", 64), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
        halo.scale.set(4.2, 4.2, 1);
        halo.position.y = 4.6;
        marker.add(halo);
      },
    };
    const key = site.defId.indexOf("bridge") === 0 ? "bridge" : site.defId;
    if (builders[key]) builders[key]();
  }

  private stairs(site: FrBuildSite, put: (w: number, h: number, d: number, x: number, y: number, z: number, m: Three<"Material">, turn?: number) => unknown, lit: (c: number) => Three<"Material">): void {
    const B = FrTerrainData.BLOCK, terrain = this.world.terrain;
    const nx = site.x + Math.round(Math.cos(site.heading)), nz = site.z + Math.round(Math.sin(site.heading));
    const rise = terrain.surfaceY(nx, nz) - terrain.surfaceY(site.x, site.z);
    const up = rise >= 0;
    const lowShift = up ? 0 : B;
    const dirX = Math.cos(site.heading) * (up ? 1 : -1), dirZ = Math.sin(site.heading) * (up ? 1 : -1);
    const baseX = Math.cos(site.heading) * lowShift, baseZ = Math.sin(site.heading) * lowShift, baseY = up ? 0 : rise;
    const height = Math.abs(rise), steps = 4, depth = B / steps;
    const turn = -Math.atan2(dirZ, dirX);
    const step = lit(0xb9bcc4), cheek = lit(0x8d9098);
    for (let i = 0; i < steps; i++) {
      const h = (height * (i + 1)) / steps;
      const along = -B / 2 + depth * (i + 0.5);
      put(depth, h, B - 0.5, baseX + dirX * along, baseY + h / 2, baseZ + dirZ * along, step, turn);
      [-1, 1].forEach((side) => {
        const sx = -dirZ * side * (B / 2 - 0.13), sz = dirX * side * (B / 2 - 0.13);
        put(depth, h + 0.22, 0.26, baseX + dirX * along + sx, baseY + (h + 0.22) / 2, baseZ + dirZ * along + sz, cheek, turn);
      });
    }
  }

  private bridge(site: FrBuildSite, put: (w: number, h: number, d: number, x: number, y: number, z: number, m: Three<"Material">, turn?: number) => unknown, lit: (c: number) => Three<"Material">, center: (c: FrPoint) => { x: number; y: number; z: number }): void {
    const along = site.heading === 0 ? "x" : "z";
    const cells = site.effect;
    const xs = cells.map((c) => c.x), zs = cells.map((c) => c.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const first = center({ x: minX, z: minZ }), last = center({ x: maxX, z: maxZ });
    const mx = (first.x + last.x) / 2, mz = (first.z + last.z) / 2;
    const B = FrTerrainData.BLOCK;
    const length = along === "x" ? (maxX - minX + 1) * B : (maxZ - minZ + 1) * B;
    const width = along === "x" ? (maxZ - minZ + 1) * B : (maxX - minX + 1) * B;
    const y = first.y + 0.05;
    const wood = lit(0x9a6a38), dark = lit(0x6f4a26);
    const dx = along === "x" ? 1 : 0, dz = along === "x" ? 0 : 1;
    [-1, 1].forEach((side) => {
      const ox = dz * side * (width / 2 - 0.1), oz = dx * side * (width / 2 - 0.1);
      put(along === "x" ? length : 0.2, 0.18, along === "x" ? 0.2 : length, mx + ox, y + 1.1, mz + oz, wood);
      for (let k = 0; k <= Math.floor(length / 3); k++) {
        const t = -length / 2 + 0.5 + k * 3;
        put(0.26, 1.2, 0.26, mx + ox + dx * t, y + 0.6, mz + oz + dz * t, dark);
      }
    });
  }
}

class FrPlazaDecor {
  private static readonly BUNTING = [0xd97b4f, 0xe7c98a, 0x9be08a, 0x7ba8ff, 0xe5483f, 0xf5d24a];
  level = 0;
  private readonly holder: Three<"Group">;
  private readonly hands: Array<{ pivot: Three<"Group">; hour: boolean }> = [];
  private waterMap: Three<"CanvasTexture"> | null = null;

  constructor(private readonly libs: ThreeLibs, private readonly world: FrWorld, parent: Three<"Group">) {
    this.holder = new libs.THREE.Group();
    parent.add(this.holder);
  }

  refresh(): number {
    const level = this.world.village.level();
    if (level === this.level) return level;
    this.level = level;
    this.holder.clear();
    this.hands.length = 0;
    this.build(level);
    return level;
  }

  showTime(minuteOfDay: number, seconds: number): void {
    const hourTurn = ((minuteOfDay / 60) % 12) / 12, minuteTurn = (minuteOfDay % 60) / 60;
    this.hands.forEach((h) => { h.pivot.rotation.z = -(h.hour ? hourTurn : minuteTurn) * Math.PI * 2; });
    if (this.waterMap) this.waterMap.offset.set(seconds * 0.05, seconds * 0.08);
  }

  private origin(): { x: number; y: number; z: number } {
    const p = this.world.terrain.anchors.plaza, B = FrTerrainData.BLOCK;
    return { x: (p.x + 0.5) * B, y: this.world.terrain.surfaceY(p.x, p.z), z: (p.z + 0.5) * B };
  }

  private build(level: number): void {
    const T = this.libs.THREE;
    const B = FrTerrainData.BLOCK;
    const { x: cx, y, z: cz } = this.origin();
    const stone = (color: number) => new T.MeshLambertMaterial({ color, map: FrSurfaceTextures.stone(this.libs) });
    const wood = (color: number) => new T.MeshLambertMaterial({ color, map: FrSurfaceTextures.wood(this.libs) });
    const flat = (color: number) => new T.MeshLambertMaterial({ color });
    const put = (geometry: Three<"Mesh">["geometry"], material: Three<"Material">, x: number, yy: number, z: number, parent: Three<"Object3D"> = this.holder) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(parent === this.holder ? cx + x : x, parent === this.holder ? y + yy : yy, parent === this.holder ? cz + z : z);
      mesh.castShadow = !(material as Three<"MeshBasicMaterial">).isMeshBasicMaterial && !(material as Three<"Material">).transparent;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    if (level >= 2) {
      const seat = stone(0x9a9da6);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        put(new T.CylinderGeometry(0.42, 0.5, 0.45, 8), seat, Math.cos(a) * 3.6, 0.22, Math.sin(a) * 3.6);
      }
    }
    if (level >= 3) this.fountain(put, stone, FrPlazaLayout.FOUNTAIN.dx * B, FrPlazaLayout.FOUNTAIN.dz * B);
    if (level >= 4) this.tower(put, stone, wood, flat, FrPlazaLayout.TOWER.dx * B, FrPlazaLayout.TOWER.dz * B);
    if (level >= 5) this.bunting(put, wood, flat);
  }

  private fountain(put: (g: Three<"Mesh">["geometry"], m: Three<"Material">, x: number, y: number, z: number, parent?: Three<"Object3D">) => Three<"Mesh">, stone: (c: number) => Three<"Material">, fx: number, fz: number): void {
    const T = this.libs.THREE;
    const map = FrSurfaceTextures.water(this.libs).clone();
    map.needsUpdate = true;
    map.repeat.set(1.5, 1.5);
    this.waterMap = map;
    const water = new T.MeshPhongMaterial({ color: 0x4fa6dc, map, specular: 0x99ccff, shininess: 70, transparent: true, opacity: 0.88 });
    const spray = new T.MeshPhongMaterial({ color: 0xbfe6ff, map, transparent: true, opacity: 0.45, depthWrite: false, side: T.DoubleSide });
    const rim = stone(0xc4c6cc), body = stone(0xa6a9b1);
    put(new T.CylinderGeometry(2.75, 2.9, 0.25, 8), stone(0x8d9098), fx, 0.12, fz);
    put(new T.CylinderGeometry(2.6, 2.7, 0.75, 8), body, fx, 0.6, fz);
    const ring = put(new T.TorusGeometry(2.45, 0.22, 6, 8), rim, fx, 0.98, fz);
    ring.rotation.set(Math.PI / 2, 0, Math.PI / 8);
    put(new T.CylinderGeometry(2.3, 2.3, 0.06, 24), water, fx, 0.9, fz);
    put(new T.CylinderGeometry(0.42, 0.6, 1.7, 8), body, fx, 1.7, fz);
    put(new T.CylinderGeometry(1.15, 0.55, 0.42, 12), rim, fx, 2.66, fz);
    put(new T.CylinderGeometry(0.98, 0.98, 0.05, 20), water, fx, 2.86, fz);
    put(new T.CylinderGeometry(0.18, 0.26, 0.6, 8), body, fx, 3.1, fz);
    put(new T.CylinderGeometry(0.5, 0.18, 0.18, 10), rim, fx, 3.46, fz);
    put(new T.SphereGeometry(0.28, 12, 8), spray, fx, 3.75, fz);
    put(new T.CylinderGeometry(1.08, 1.5, 1.95, 16, 1, true), spray, fx, 1.88, fz);
  }

  private tower(put: (g: Three<"Mesh">["geometry"], m: Three<"Material">, x: number, y: number, z: number, parent?: Three<"Object3D">) => Three<"Mesh">, stone: (c: number) => Three<"Material">, wood: (c: number) => Three<"Material">, flat: (c: number) => Three<"Material">, tx: number, tz: number): void {
    const T = this.libs.THREE;
    const trim = stone(0x8f8a80);
    put(new T.BoxGeometry(2.0, 0.8, 2.0), trim, tx, 0.4, tz);
    put(new T.BoxGeometry(1.7, 7.2, 1.7), stone(0xd8cfbc), tx, 4.4, tz);
    [3.2, 8.0].forEach((h) => put(new T.BoxGeometry(1.86, 0.24, 1.86), trim, tx, h, tz));
    put(new T.BoxGeometry(0.8, 1.4, 0.08), wood(0x7a5230), tx, 1.5, tz + 0.86);
    put(new T.BoxGeometry(2.1, 2.1, 2.1), wood(0xc9a77a), tx, 9.15, tz);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dz]) => put(new T.BoxGeometry(0.22, 2.2, 0.22), wood(0x6b4a2a), tx + dx * 1.04, 9.15, tz + dz * 1.04));
    const roof = put(new T.ConeGeometry(1.95, 2.6, 4), flat(0xa2493a), tx, 11.5, tz);
    roof.rotation.y = Math.PI / 4;
    put(new T.CylinderGeometry(0.04, 0.06, 0.9, 6), flat(0x3d3f46), tx, 13.1, tz);
    put(new T.SphereGeometry(0.16, 10, 8), new T.MeshBasicMaterial({ color: 0xf5d24a }), tx, 13.6, tz);
    const origin = this.origin();
    const face = new T.MeshBasicMaterial({ color: 0xfff7dc }), ink = new T.MeshBasicMaterial({ color: 0x2a1a0a }), brass = flat(0xd6b34a);
    [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((a) => {
      const holder = new T.Group();
      holder.position.set(origin.x + tx + Math.sin(a) * 1.06, origin.y + 9.15, origin.z + tz + Math.cos(a) * 1.06);
      holder.rotation.y = a;
      this.holder.add(holder);
      put(new T.CylinderGeometry(0.86, 0.86, 0.06, 24), brass, 0, 0, 0, holder).rotation.x = Math.PI / 2;
      put(new T.CircleGeometry(0.76, 24), face, 0, 0, 0.035, holder);
      for (let k = 0; k < 12; k++) {
        const t = (k / 12) * Math.PI * 2;
        put(new T.BoxGeometry(k % 3 === 0 ? 0.08 : 0.05, k % 3 === 0 ? 0.18 : 0.1, 0.01), ink, Math.sin(t) * 0.64, Math.cos(t) * 0.64, 0.04, holder).rotation.z = -t;
      }
      [true, false].forEach((hour) => {
        const pivot = new T.Group();
        pivot.position.z = hour ? 0.05 : 0.06;
        holder.add(pivot);
        const length = hour ? 0.4 : 0.6;
        put(new T.BoxGeometry(hour ? 0.07 : 0.045, length, 0.01), ink, 0, length / 2 - 0.05, 0, pivot);
        this.hands.push({ pivot, hour });
      });
      put(new T.CircleGeometry(0.06, 10), brass, 0, 0, 0.075, holder);
    });
  }

  private bunting(put: (g: Three<"Mesh">["geometry"], m: Three<"Material">, x: number, y: number, z: number, parent?: Three<"Object3D">) => Three<"Mesh">, wood: (c: number) => Three<"Material">, flat: (c: number) => Three<"Material">): void {
    const T = this.libs.THREE;
    const poles = 12, radius = 11, top = 4.3, perSpan = 6;
    const pole = wood(0x8a5a30), cap = flat(0xd6b34a), rope = flat(0xf2e6cc);
    const flagGeometry = new T.BufferGeometry();
    flagGeometry.setAttribute("position", new T.Float32BufferAttribute([-0.34, 0, 0, 0.34, 0, 0, 0, -0.7, 0], 3));
    flagGeometry.computeVertexNormals();
    const flags = new T.InstancedMesh(flagGeometry, new T.MeshLambertMaterial({ side: T.DoubleSide }), poles * perSpan);
    const origin = this.origin();
    const matrix = new T.Matrix4(), color = new T.Color();
    for (let i = 0; i < poles; i++) {
      const a = (i / poles) * Math.PI * 2, b = ((i + 1) / poles) * Math.PI * 2;
      const ax = Math.cos(a) * radius, az = Math.sin(a) * radius, bx = Math.cos(b) * radius, bz = Math.sin(b) * radius;
      put(new T.CylinderGeometry(0.09, 0.12, top + 0.2, 8), pole, ax, (top + 0.2) / 2, az);
      put(new T.SphereGeometry(0.16, 8, 6), cap, ax, top + 0.3, az);
      const span = Math.hypot(bx - ax, bz - az), heading = Math.atan2(bz - az, bx - ax);
      put(new T.BoxGeometry(span, 0.03, 0.03), rope, (ax + bx) / 2, top - 0.25, (az + bz) / 2).rotation.y = -heading;
      for (let k = 0; k < perSpan; k++) {
        const t = (k + 0.5) / perSpan;
        matrix.makeRotationY(-heading).setPosition(origin.x + ax + (bx - ax) * t, origin.y + top - 0.25, origin.z + az + (bz - az) * t);
        flags.setMatrixAt(i * perSpan + k, matrix);
        flags.setColorAt(i * perSpan + k, color.setHex(FrPlazaDecor.BUNTING[(i * perSpan + k) % FrPlazaDecor.BUNTING.length]));
      }
    }
    flags.computeBoundingSphere();
    this.holder.add(flags);
  }
}

