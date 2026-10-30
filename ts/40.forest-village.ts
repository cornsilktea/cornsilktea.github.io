class FrBuildSite {
  constructor(
    readonly defId: string,
    readonly number: number,
    readonly name: string,
    readonly x: number,
    readonly z: number,
    readonly cells: FrPoint[],
    readonly passable = false,
    readonly heading = 0,
    readonly effect: FrPoint[] = [],
    readonly small = true,
  ) {}

  get id(): string { return this.defId + "_" + this.number; }
}

class FrSiteBook {
  static readonly STATIONS: ReadonlyArray<string> = ["workbench", "forge", "oven", "kitchen"];
  static readonly RING_RADIUS = 26;
  static readonly WALL_LENGTH = 7;

  static build(terrain: FrTerrainData): FrBuildSite[] {
    const sites: FrBuildSite[] = [];
    const one = (def: string, n: number, name: string, x: number, z: number) => sites.push(new FrBuildSite(def, n, name, x, z, [{ x, z }]));
    one("workbench", 1, "작업대", 55, 64);
    one("forge", 1, "대장간", 52, 64);
    one("oven", 1, "화덕", 55, 68);
    one("kitchen", 1, "섬 부엌", 52, 68);
    one("farm_expand", 1, "텃밭 넓히기", 66, 78);
    one("farm_expand", 2, "텃밭 넓히기", 68, 78);
    FrSiteBook.bridges(terrain, sites);
    FrSiteBook.stairs(terrain, sites);
    FrSiteBook.ring(terrain, sites);
    FrSiteBook.lamps(terrain, sites);
    return sites;
  }

  private static bridges(terrain: FrTerrainData, sites: FrBuildSite[]): void {
    const b = terrain.anchors.bridges;
    const make = (def: string, n: number, name: string, list: Array<[number, number]>, axis: "x" | "z") => {
      if (list.length === 0) return;
      const effect: FrPoint[] = [];
      list.forEach(([x, z]) => { effect.push({ x, z }); const sx = axis === "x" ? 0 : 1, sz = axis === "x" ? 1 : 0; if (terrain.isWater(x + sx, z + sz)) effect.push({ x: x + sx, z: z + sz }); });
      const first = list[0];
      const sx = axis === "x" ? -1 : 0, sz = axis === "x" ? 0 : -1;
      sites.push(new FrBuildSite(def, n, name, first[0] + sx * 2, first[1] + sz * 2, [{ x: first[0] + sx * 2, z: first[1] + sz * 2 }], false, axis === "x" ? 0 : Math.PI / 2, effect));
    };
    make("bridge_east", 1, "동쪽 다리", b.east || [], "x");
    make("bridge_south", 1, "남쪽 다리", b.south || [], "z");
    make("bridge_shortcut", 1, "지름길 다리", b.shortcutFarm || [], "x");
    make("bridge_shortcut", 2, "지름길 다리", b.shortcutTributary || [], "z");
  }

  private static stairs(terrain: FrTerrainData, sites: FrBuildSite[]): void {
    const paths = terrain.anchors.paths;
    let n = 1;
    ["north", "west", "east"].forEach((id) => {
      const cells = paths[id] || [];
      for (let i = 4; i < cells.length - 1; i++) {
        const [x, z] = cells[i], [nx, nz] = cells[i + 1];
        if (Math.hypot(x - 60, z - 60) < 9) continue;
        if (terrain.height(x, z) !== terrain.height(nx, nz)) { sites.push(new FrBuildSite("stairs", n++, "돌계단", x, z, [{ x, z }], true, Math.atan2(nz - z, nx - x))); return; }
      }
    });
  }

  private static landAt(terrain: FrTerrainData, x: number, z: number): boolean {
    return terrain.inside(x, z) && "GDNSP".indexOf(terrain.top(x, z)) >= 0 && terrain.height(x, z) >= 0 && terrain.height(x, z) <= 4;
  }

  private static slot(terrain: FrTerrainData, index: number, extra = 0): { x: number; z: number; angle: number } | null {
    const p = terrain.anchors.plaza;
    const angle = (index * Math.PI) / 8;
    for (let r = FrSiteBook.RING_RADIUS + extra; r >= 16; r--) {
      const x = Math.round(p.x + Math.cos(angle) * r), z = Math.round(p.z + Math.sin(angle) * r);
      if (FrSiteBook.landAt(terrain, x, z)) return { x, z, angle };
    }
    return null;
  }

  private static ring(terrain: FrTerrainData, sites: FrBuildSite[]): void {
    const taken = new Set<number>();
    sites.forEach((s) => s.cells.forEach((c) => taken.add(terrain.index(c.x, c.z))));
    const free = (c: FrPoint) => FrSiteBook.landAt(terrain, c.x, c.z) && !taken.has(terrain.index(c.x, c.z));
    const claim = (cells: FrPoint[]) => cells.forEach((c) => taken.add(terrain.index(c.x, c.z)));
    let walls = 1, gates = 1, towers = 1;
    for (let i = 0; i < 16; i++) {
      const baseSlot = FrSiteBook.slot(terrain, i);
      if (!baseSlot) continue;
      const tx = -Math.sin(baseSlot.angle), tz = Math.cos(baseSlot.angle);
      const heading = Math.atan2(tz, tx);
      const half = Math.floor(FrSiteBook.WALL_LENGTH / 2);
      const along = (slot: { x: number; z: number }, from: number, to: number) => {
        const list: FrPoint[] = [];
        for (let k = from; k <= to; k++) {
          const c = { x: Math.round(slot.x + tx * k), z: Math.round(slot.z + tz * k) };
          if (!list.some((o) => o.x === c.x && o.z === c.z)) list.push(c);
        }
        return list;
      };
      if (i % 4 === 0) {
        const placed = FrSiteBook.fit(terrain, i, 0, (slot) => along(slot, -3, 3).every(free));
        if (!placed) continue;
        const pillars = along(placed, -3, -2).concat(along(placed, 2, 3));
        claim(pillars);
        sites.push(new FrBuildSite("gate", gates++, "성문", placed.x, placed.z, pillars, false, heading, [], false));
      } else if (walls <= 12) {
        const cells = along(baseSlot, -half, half).filter(free);
        if (cells.length >= 3) { claim(cells); sites.push(new FrBuildSite("wall", walls++, "성벽", baseSlot.x, baseSlot.z, cells, false, heading, [], false)); }
      }
      if (i % 4 === 2 && towers <= 4) {
        const cellsAt = (slot: { x: number; z: number }) => [0, 1].flatMap((dz) => [0, 1].map((dx) => ({ x: slot.x + dx, z: slot.z + dz })));
        const placed = FrSiteBook.fit(terrain, i, 2, (slot) => cellsAt(slot).every(free));
        if (placed) { const cells = cellsAt(placed); claim(cells); sites.push(new FrBuildSite("tower", towers++, "망루", placed.x, placed.z, cells, false, heading, [], false)); }
      }
    }
  }

  private static fit(terrain: FrTerrainData, index: number, extra: number, ok: (slot: { x: number; z: number }) => boolean): { x: number; z: number } | null {
    const p = terrain.anchors.plaza;
    const angle = (index * Math.PI) / 8;
    for (let r = FrSiteBook.RING_RADIUS + extra; r >= 14; r--) {
      const slot = { x: Math.round(p.x + Math.cos(angle) * r), z: Math.round(p.z + Math.sin(angle) * r) };
      if (ok(slot)) return slot;
    }
    return null;
  }

  private static lamps(terrain: FrTerrainData, sites: FrBuildSite[]): void {
    const p = terrain.anchors.plaza;
    let n = 1;
    for (let k = 0; k < 8; k++) {
      const angle = Math.PI / 8 + (k * Math.PI) / 4;
      const x = Math.round(p.x + Math.cos(angle) * 8.5), z = Math.round(p.z + Math.sin(angle) * 8.5);
      if (FrSiteBook.landAt(terrain, x, z)) sites.push(new FrBuildSite("lamp", n++, "가로등", x, z, [{ x, z }]));
    }
  }

  static find(sites: ReadonlyArray<FrBuildSite>, id: string): FrBuildSite | undefined { return sites.find((s) => s.id === id); }
}

class FrSiteEffects {
  static readonly PLANK_TOP = "P";

  static apply(world: FrWorld, site: FrBuildSite): void {
    site.effect.forEach((c) => world.applyTerrainLocal(c.x, c.z, { h: 0, t: FrSiteEffects.PLANK_TOP }));
  }

  static revert(world: FrWorld, site: FrBuildSite): void {
    site.effect.forEach((c) => world.revertTerrainLocal(c.x, c.z));
  }
}

class FrVillageLevels {
  static readonly NAMES: ReadonlyArray<string> = ["", "작은 야영지", "돌 화로 마을", "분수 마을", "시계탑 마을", "축제 마을"];
  static label(level: number): string { return FrVillageLevels.NAMES[level] || ""; }
  static nextScore(level: number): number { return level >= 5 ? -1 : FrBalance.VILLAGE_LEVEL_SCORE[level + 1]; }
}
