interface FrWorldListener {
  onTreeFelled(spot: FrTreeSpot): void;
  onTerrainEdited(x: number, z: number): void;
  onBuilt(id: string, count: number): void;
  onPublicChanged(): void;
}

interface FrBuildRecord { at: number; by: string }

class FrWorld {
  static readonly SNOW_TOP = "W";
  static readonly BARE_TOP = "S";

  readonly village = new FrVillage();
  readonly publicStore = new FrPublicStore();
  readonly snowDugDay: Map<number, number> = new Map();
  readonly trees: Map<number, FrTreeSpot> = new Map();
  private readonly felled: Set<number> = new Set();
  private readonly listeners: FrWorldListener[] = [];

  constructor(readonly island: string, readonly terrain: FrTerrainData, private readonly backend: FrBackend) {
    FrTreeField.generate(terrain).forEach((spot) => this.trees.set(terrain.index(spot.x, spot.z), spot));
  }

  listen(listener: FrWorldListener): void { this.listeners.push(listener); }
  private path(rest: string): string { return "forest/" + this.island + "/" + rest; }

  async load(): Promise<void> {
    const [jungle, terrain, snow, build, publicAmounts, logs] = await Promise.all([
      this.backend.get<Record<string, number>>(this.path("jungle")),
      this.backend.get<Record<string, Record<string, [number, string]>>>(this.path("terrain")),
      this.backend.get<Record<string, number>>(this.path("snow")),
      this.backend.get<Record<string, FrBuildRecord>>(this.path("build")),
      this.backend.get<Record<string, number>>(this.path("public")),
      this.backend.lastChildren<FrPublicLogLine>(this.path("publicLog"), FrBalance.PUBLIC_LOG_LINES),
    ]);
    Object.keys(jungle || {}).forEach((key) => this.felled.add(Number(key)));
    Object.keys(terrain || {}).forEach((chunk) => Object.keys((terrain as Record<string, Record<string, [number, string]>>)[chunk]).forEach((key) => {
      const cell = (terrain as Record<string, Record<string, [number, string]>>)[chunk][key];
      this.terrain.edit(Number(key) % this.terrain.w, Math.floor(Number(key) / this.terrain.w), { h: cell[0], t: cell[1] });
    }));
    Object.keys(snow || {}).forEach((key) => this.snowDugDay.set(Number(key), (snow as Record<string, number>)[key]));
    Object.keys(build || {}).forEach((key) => this.village.markBuilt(key.replace(/_\d+$/, "")));
    this.publicStore.restore(publicAmounts || {}, logs.map(([, line]) => line));
  }

  isFelled(index: number): boolean { return this.felled.has(index); }
  standingTree(index: number): FrTreeSpot | null { return this.felled.has(index) ? null : this.trees.get(index) || null; }
  blocked(x: number, z: number): boolean { return this.standingTree(this.terrain.index(x, z)) !== null; }

  zoneCleared(zone: number): boolean {
    if (zone < 0) return false;
    for (const [index, spot] of this.trees) if (spot.zone === zone && !this.felled.has(index)) return false;
    return true;
  }

  async fellTree(spot: FrTreeSpot): Promise<boolean> {
    const index = this.terrain.index(spot.x, spot.z);
    if (this.felled.has(index)) return false;
    const result = await this.backend.transaction<number>(this.path("jungle/" + index), (current) => (current === null ? 1 : undefined));
    if (!result.committed) { this.felled.add(index); this.listeners.forEach((l) => l.onTreeFelled(spot)); return false; }
    this.felled.add(index);
    this.listeners.forEach((l) => l.onTreeFelled(spot));
    return true;
  }

  async editTerrain(x: number, z: number, before: FrTerrainEdit, after: FrTerrainEdit): Promise<boolean> {
    const index = this.terrain.index(x, z);
    const chunk = Math.floor(x / FrTerrainMesher.CHUNK) + "_" + Math.floor(z / FrTerrainMesher.CHUNK);
    const result = await this.backend.transaction<[number, string]>(this.path("terrain/" + chunk + "/" + index), (current) => {
      const nowHeight = current ? current[0] : before.h;
      return nowHeight === before.h ? [after.h, after.t] : undefined;
    });
    if (!result.committed) return false;
    this.terrain.edit(x, z, after);
    this.listeners.forEach((l) => l.onTerrainEdited(x, z));
    return true;
  }

  async digSnow(x: number, z: number, day: number): Promise<void> {
    const index = this.terrain.index(x, z);
    this.snowDugDay.set(index, day);
    this.terrain.edit(x, z, { h: this.terrain.height(x, z), t: FrWorld.BARE_TOP });
    this.listeners.forEach((l) => l.onTerrainEdited(x, z));
    await this.backend.set(this.path("snow/" + index), day);
  }

  syncSnow(day: number): void {
    this.snowDugDay.forEach((dugDay, index) => {
      const x = index % this.terrain.w, z = Math.floor(index / this.terrain.w);
      const regrown = FrSnowRules.regrown(dugDay, day);
      const wanted = regrown ? FrWorld.SNOW_TOP : FrWorld.BARE_TOP;
      if (this.terrain.top(x, z) === wanted || (regrown && this.terrain.top(x, z) !== FrWorld.BARE_TOP)) {
        if (regrown) this.snowDugDay.delete(index);
        return;
      }
      this.terrain.edit(x, z, { h: this.terrain.height(x, z), t: wanted });
      this.listeners.forEach((l) => l.onTerrainEdited(x, z));
      if (regrown) { this.snowDugDay.delete(index); void this.backend.set(this.path("snow/" + index), null); }
    });
  }

  async putPublic(id: string, amount: number, who: string): Promise<boolean> {
    if (!this.publicStore.canPut(id, amount)) return false;
    await this.backend.transaction<number>(this.path("public/" + id), (current) => (current || 0) + amount);
    this.publicStore.put(id, amount, who, Date.now());
    await this.writeLog({ at: Date.now(), who, verb: "put", item: id, count: amount });
    this.listeners.forEach((l) => l.onPublicChanged());
    return true;
  }

  async takePublic(id: string, amount: number, who: string): Promise<boolean> {
    const result = await this.backend.transaction<number>(this.path("public/" + id), (current) => ((current || 0) >= amount ? ((current || 0) - amount || null) : undefined));
    if (!result.committed) return false;
    this.publicStore.takeBy(id, Math.min(amount, this.publicStore.count(id)), who, Date.now(), "take");
    await this.writeLog({ at: Date.now(), who, verb: "take", item: id, count: amount });
    this.listeners.forEach((l) => l.onPublicChanged());
    return true;
  }

  async build(def: FrConstructionDef, who: string): Promise<boolean> {
    if (this.village.builtCount(def.id) >= def.count || this.village.level() < def.minVillageLevel) return false;
    const paid: Array<[string, number]> = [];
    for (const id of Object.keys(def.cost)) {
      const result = await this.backend.transaction<number>(this.path("public/" + id), (current) => ((current || 0) >= def.cost[id] ? ((current || 0) - def.cost[id] || null) : undefined));
      if (!result.committed) { await this.refund(paid); return false; }
      paid.push([id, def.cost[id]]);
    }
    const number = this.village.builtCount(def.id) + 1;
    const slot = await this.backend.transaction<FrBuildRecord>(this.path("build/" + def.id + "_" + number), (current) => (current === null ? { at: Date.now(), by: who } : undefined));
    if (!slot.committed) { await this.refund(paid); return false; }
    paid.forEach(([id, n]) => this.publicStore.takeBy(id, Math.min(n, this.publicStore.count(id)), who, Date.now(), "build"));
    await Promise.all(paid.map(([id, n]) => this.writeLog({ at: Date.now(), who, verb: "build", item: id, count: n })));
    this.village.markBuilt(def.id);
    this.listeners.forEach((l) => { l.onBuilt(def.id, this.village.builtCount(def.id)); l.onPublicChanged(); });
    return true;
  }

  private async refund(paid: Array<[string, number]>): Promise<void> {
    for (const [id, n] of paid) await this.backend.transaction<number>(this.path("public/" + id), (current) => (current || 0) + n);
  }

  private async writeLog(line: FrPublicLogLine): Promise<void> {
    await this.backend.set(this.path("publicLog/" + String(line.at).padStart(14, "0") + "_" + Math.floor(Math.random() * 1000)), line);
  }
}
