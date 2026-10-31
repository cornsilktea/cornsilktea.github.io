interface FrWorldListener {
  onTreeFelled(spot: FrTreeSpot): void;
  onTerrainEdited(x: number, z: number): void;
  onBuilt(id: string, count: number): void;
  onPublicChanged(): void;
  onBlockChanged(x: number, z: number, y: number, record: FrBlockRecord | null): void;
  onFarmChanged(index: number): void;
  onLotChanged(): void;
}

interface FrBuildRecord { at: number; by: string }

class FrWorld {
  static readonly SNOW_TOP = "W";
  static readonly BARE_TOP = "S";

  readonly village = new FrVillage();
  readonly sites: FrBuildSite[];
  private readonly siteOfCell: Map<number, FrBuildSite> = new Map();
  readonly publicStore = new FrPublicStore();
  readonly snowDugDay: Map<number, number> = new Map();
  readonly trees: Map<number, FrTreeSpot> = new Map();
  readonly blocks = new FrBlockStore();
  readonly lots: Map<number, FrLot> = new Map();
  readonly farm: Map<number, FrCropRecord> = new Map();
  private readonly felled: Set<number> = new Set();
  private readonly builtKeys: Set<string> = new Set();
  private readonly logKeys: Set<string> = new Set();
  private readonly listeners: FrWorldListener[] = [];

  constructor(readonly island: string, readonly terrain: FrTerrainData, private readonly backend: FrBackend) {
    FrTreeField.generate(terrain).forEach((spot) => this.trees.set(terrain.index(spot.x, spot.z), spot));
    this.sites = FrSiteBook.build(terrain);
    this.sites.forEach((site) => site.cells.forEach((c) => this.siteOfCell.set(terrain.index(c.x, c.z), site)));
    this.sites.forEach((site) => { if (site.small) site.cells.forEach((c) => { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.trees.delete(terrain.index(c.x + dx, c.z + dz)); }); });
  }

  isSiteCell(x: number, z: number): boolean { return this.siteOfCell.has(this.terrain.index(x, z)); }

  isBuilt(siteId: string): boolean { return this.builtKeys.has(siteId); }

  siteOf(id: string): FrBuildSite | undefined { return FrSiteBook.find(this.sites, id); }

  nextSiteNumber(defId: string, count: number): number {
    for (let n = 1; n <= count; n++) if (!this.builtKeys.has(defId + "_" + n)) return n;
    return 0;
  }

  applyTerrainLocal(x: number, z: number, edit: FrTerrainEdit): void {
    this.terrain.edit(x, z, edit);
    this.listeners.forEach((l) => l.onTerrainEdited(x, z));
    this.refreshWater();
  }

  revertTerrainLocal(x: number, z: number): void {
    this.terrain.restore(x, z);
    this.listeners.forEach((l) => l.onTerrainEdited(x, z));
    this.refreshWater();
  }

  refreshWater(): void {
    const changed = this.terrain.refreshFlood((index) => this.blocks.top(index) > 0);
    changed.forEach((index) => { const x = index % this.terrain.w, z = Math.floor(index / this.terrain.w); this.listeners.forEach((l) => l.onTerrainEdited(x, z)); });
  }

  private applySiteEffects(key: string, built: boolean): void {
    const site = this.siteOf(key);
    if (!site) return;
    if (built) FrSiteEffects.apply(this, site); else FrSiteEffects.revert(this, site);
  }

  listen(listener: FrWorldListener): void { this.listeners.push(listener); }

  private static readonly PASSABLE_BLOCKS = ["block_door", "block_torch"];

  private solidBlock(record: FrBlockRecord | null): boolean { return !!record && FrWorld.PASSABLE_BLOCKS.indexOf(record.t) < 0 && !FrFurnitureCatalog.isFurniture(record.t); }

  private furnitureAt(index: number): boolean {
    return this.blocks.column(index).some(([, record]) => FrFurnitureCatalog.solid(record.t));
  }

  surfaceAt(x: number, z: number): number {
    const index = this.terrain.index(x, z);
    let stack = 0;
    while (stack < FrBlockRules.MAX_LEVEL && this.solidBlock(this.blocks.get(index, stack))) stack += 1;
    return this.terrain.height(x, z) + stack;
  }

  overhead(x: number, z: number, groundHeight: number): boolean {
    const index = this.terrain.index(x, z);
    const base = this.terrain.height(x, z);
    for (let y = 0; y < FrBlockRules.MAX_LEVEL; y++) {
      const level = base + y;
      if (level >= groundHeight + 2) break;
      if (level >= groundHeight && this.solidBlock(this.blocks.get(index, y))) return true;
    }
    return false;
  }

  solid(x: number, z: number): boolean {
    const a = this.terrain.anchors;
    if (x === a.campfire.x && z === a.campfire.z) return true;
    if (x >= a.publicChest.x && x < a.publicChest.x + a.publicChest.size && z >= a.publicChest.z && z < a.publicChest.z + a.publicChest.size) return true;
    if (this.furnitureAt(this.terrain.index(x, z))) return true;
    if (FrPlazaLayout.solidAt(a.plaza, x, z, () => this.village.level())) return true;
    const site = this.siteOfCell.get(this.terrain.index(x, z));
    return !!site && !site.passable && (site.small || this.builtKeys.has(site.id));
  }
  private path(rest: string): string { return "forest/" + this.island + "/" + rest; }

  async load(): Promise<void> {
    const [jungle, terrain, snow, build, publicAmounts, logs, blocks, lots, farm] = await Promise.all([
      this.backend.get<Record<string, number>>(this.path("jungle")),
      this.backend.get<Record<string, Record<string, [number, string]>>>(this.path("terrain")),
      this.backend.get<Record<string, number>>(this.path("snow")),
      this.backend.get<Record<string, FrBuildRecord>>(this.path("build")),
      this.backend.get<Record<string, number>>(this.path("public")),
      this.backend.lastChildren<FrPublicLogLine>(this.path("publicLog"), FrBalance.PUBLIC_LOG_LINES),
      this.backend.get<Record<string, Record<string, FrBlockRecord>>>(this.path("blocks")),
      this.backend.get<Record<string, FrLot>>(this.path("lots")),
      this.backend.get<Record<string, FrCropRecord>>(this.path("farm")),
    ]);
    Object.keys(farm || {}).forEach((k) => this.farm.set(Number(k), (farm as Record<string, FrCropRecord>)[k]));
    Object.keys(blocks || {}).forEach((chunk) => Object.keys((blocks as Record<string, Record<string, FrBlockRecord>>)[chunk]).forEach((key) => {
      const parsed = FrBlockKey.parse(key);
      this.blocks.set(parsed.index, parsed.y, (blocks as Record<string, Record<string, FrBlockRecord>>)[chunk][key]);
    }));
    Object.keys(lots || {}).forEach((n) => this.lots.set(Number(n), (lots as Record<string, FrLot>)[n]));
    Object.keys(jungle || {}).forEach((key) => this.felled.add(Number(key)));
    Object.keys(terrain || {}).forEach((chunk) => Object.keys((terrain as Record<string, Record<string, [number, string]>>)[chunk]).forEach((key) => {
      const cell = (terrain as Record<string, Record<string, [number, string]>>)[chunk][key];
      this.terrain.edit(Number(key) % this.terrain.w, Math.floor(Number(key) / this.terrain.w), { h: cell[0], t: cell[1] });
    }));
    Object.keys(snow || {}).forEach((key) => this.snowDugDay.set(Number(key), (snow as Record<string, number>)[key]));
    Object.keys(build || {}).forEach((key) => { this.builtKeys.add(key); this.village.markBuilt(key.replace(/_\d+$/, "")); this.applySiteEffects(key, true); });
    this.publicStore.restore(publicAmounts || {}, logs.map(([, line]) => line));
    logs.forEach(([key]) => this.logKeys.add(key));
    this.refreshWater();
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
    this.refreshWater();
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
    const result = await this.backend.transaction<number>(this.path("public/" + id), (current) => (current || 0) + amount);
    this.publicStore.setAmount(id, result.value || 0);
    await this.logLine({ at: Date.now(), who, verb: "put", item: id, count: amount });
    this.listeners.forEach((l) => l.onPublicChanged());
    return true;
  }

  async takePublic(id: string, amount: number, who: string): Promise<boolean> {
    const result = await this.backend.transaction<number>(this.path("public/" + id), (current) => ((current || 0) >= amount ? ((current || 0) - amount || null) : undefined));
    if (!result.committed) return false;
    this.publicStore.setAmount(id, result.value || 0);
    await this.logLine({ at: Date.now(), who, verb: "take", item: id, count: amount });
    this.listeners.forEach((l) => l.onPublicChanged());
    return true;
  }

  async build(def: FrConstructionDef, who: string, wanted = 0): Promise<boolean> {
    if (this.village.builtCount(def.id) >= def.count || this.village.level() < def.minVillageLevel) return false;
    const number = wanted > 0 ? wanted : this.nextSiteNumber(def.id, def.count);
    if (number < 1 || number > def.count || this.builtKeys.has(def.id + "_" + number)) return false;
    const paid: Array<[string, number]> = [];
    const left: Record<string, number> = {};
    for (const id of Object.keys(def.cost)) {
      const result = await this.backend.transaction<number>(this.path("public/" + id), (current) => ((current || 0) >= def.cost[id] ? ((current || 0) - def.cost[id] || null) : undefined));
      if (!result.committed) { await this.refund(paid); return false; }
      paid.push([id, def.cost[id]]);
      left[id] = result.value || 0;
    }
    this.builtKeys.add(def.id + "_" + number);
    const slot = await this.backend.transaction<FrBuildRecord>(this.path("build/" + def.id + "_" + number), (current) => (current === null ? { at: Date.now(), by: who } : undefined));
    if (!slot.committed) { this.builtKeys.delete(def.id + "_" + number); await this.refund(paid); return false; }
    paid.forEach(([id]) => this.publicStore.setAmount(id, left[id]));
    await Promise.all(paid.map(([id, n]) => this.logLine({ at: Date.now(), who, verb: "build", item: id, count: n })));
    this.village.markBuilt(def.id);
    this.applySiteEffects(def.id + "_" + number, true);
    this.listeners.forEach((l) => { l.onBuilt(def.id + "_" + number, this.village.builtCount(def.id)); l.onPublicChanged(); });
    return true;
  }

  async unbuild(key: string, refundTo: boolean): Promise<boolean> {
    if (!this.builtKeys.has(key)) return false;
    const defId = key.replace(/_\d+$/, "");
    const def = FrVillage.definition(defId);
    await this.backend.set(this.path("build/" + key), null);
    this.builtKeys.delete(key);
    this.village.unmarkBuilt(defId);
    this.applySiteEffects(key, false);
    if (refundTo && def) for (const id of Object.keys(def.cost)) {
      const result = await this.backend.transaction<number>(this.path("public/" + id), (current) => (current || 0) + def.cost[id]);
      this.publicStore.setAmount(id, result.value || 0);
    }
    this.listeners.forEach((l) => { l.onBuilt(key, this.village.builtCount(defId)); l.onPublicChanged(); });
    return true;
  }

  private async refund(paid: Array<[string, number]>): Promise<void> {
    for (const [id, n] of paid) await this.backend.transaction<number>(this.path("public/" + id), (current) => (current || 0) + n);
  }

  private async logLine(line: FrPublicLogLine): Promise<void> {
    const key = String(line.at).padStart(14, "0") + "_" + Math.floor(Math.random() * 1000);
    this.logKeys.add(key);
    this.publicStore.addLine(line);
    await this.backend.set(this.path("publicLog/" + key), line);
  }

  private blockPath(x: number, z: number, y: number): string {
    return this.path("blocks/" + Math.floor(x / FrTerrainMesher.CHUNK) + "_" + Math.floor(z / FrTerrainMesher.CHUNK) + "/" + FrBlockKey.key(this.terrain.index(x, z), y));
  }

  async placeBlock(x: number, z: number, y: number, type: string, rot: number, me: FrBlockPlayer): Promise<boolean> {
    const record: FrBlockRecord = { t: type, n: me.no, r: rot };
    const result = await this.backend.transaction<FrBlockRecord>(this.blockPath(x, z, y), (current) => (current === null ? record : undefined));
    if (!result.committed) return false;
    this.applyBlock(x, z, y, record);
    return true;
  }

  async removeBlock(x: number, z: number, y: number, me: FrBlockPlayer): Promise<FrBlockRecord | null> {
    const old = this.blocks.get(this.terrain.index(x, z), y);
    const result = await this.backend.transaction<FrBlockRecord>(this.blockPath(x, z, y), (current) => (current !== null && FrBlockRules.canRemove(current, me) ? null : undefined));
    if (!result.committed) return null;
    this.applyBlock(x, z, y, null);
    return old;
  }

  async placeMany(plan: ReadonlyArray<FrBlockPlan>, me: FrBlockPlayer): Promise<number> {
    const chunks = new Map<string, Record<string, FrBlockRecord>>();
    plan.forEach((p) => {
      const chunk = Math.floor(p.x / FrTerrainMesher.CHUNK) + "_" + Math.floor(p.z / FrTerrainMesher.CHUNK);
      if (!chunks.has(chunk)) chunks.set(chunk, {});
      (chunks.get(chunk) as Record<string, FrBlockRecord>)[FrBlockKey.key(this.terrain.index(p.x, p.z), p.y)] = { t: p.t, n: me.no, r: p.r };
    });
    for (const [chunk, values] of chunks) await this.backend.patch(this.path("blocks/" + chunk), values);
    plan.forEach((p) => this.applyBlock(p.x, p.z, p.y, { t: p.t, n: me.no, r: p.r }));
    return plan.length;
  }

  async clearBlocks(test: (record: FrBlockRecord, x: number, z: number) => boolean): Promise<number> {
    const doomed: Array<[number, number, number]> = [];
    this.blocks.forEach((index, y, record) => {
      const x = index % this.terrain.w, z = Math.floor(index / this.terrain.w);
      if (test(record, x, z)) doomed.push([x, z, y]);
    });
    const chunks = new Map<string, Record<string, null>>();
    doomed.forEach(([x, z, y]) => {
      const chunk = Math.floor(x / FrTerrainMesher.CHUNK) + "_" + Math.floor(z / FrTerrainMesher.CHUNK);
      if (!chunks.has(chunk)) chunks.set(chunk, {});
      (chunks.get(chunk) as Record<string, null>)[FrBlockKey.key(this.terrain.index(x, z), y)] = null;
    });
    for (const [chunk, values] of chunks) await this.backend.patch(this.path("blocks/" + chunk), values);
    doomed.forEach(([x, z, y]) => this.applyBlock(x, z, y, null));
    return doomed.length;
  }

  private applyBlock(x: number, z: number, y: number, record: FrBlockRecord | null): void {
    if (!this.blocks.set(this.terrain.index(x, z), y, record)) return;
    this.listeners.forEach((l) => l.onBlockChanged(x, z, y, record));
    this.refreshWater();
  }

  remoteBlock(index: number, y: number, record: FrBlockRecord | null): void {
    const x = index % this.terrain.w, z = Math.floor(index / this.terrain.w);
    const now = this.blocks.get(index, y);
    if (now === null && record === null) return;
    if (now !== null && record !== null && now.t === record.t && now.r === record.r) return;
    if (now !== null && record === null) { this.applyBlock(x, z, y, null); return; }
    if (now !== null) this.blocks.set(index, y, null);
    this.blocks.set(index, y, record);
    this.listeners.forEach((l) => l.onBlockChanged(x, z, y, record));
    this.refreshWater();
  }

  async plant(index: number, record: FrCropRecord): Promise<boolean> {
    const result = await this.backend.transaction<FrCropRecord>(this.path("farm/" + index), (current) => (current === null ? record : undefined));
    if (!result.committed) return false;
    this.farm.set(index, record);
    this.listeners.forEach((l) => l.onFarmChanged(index));
    return true;
  }

  async harvest(index: number, uid: string): Promise<FrCropRecord | null> {
    const had = this.farm.get(index) || null;
    const result = await this.backend.transaction<FrCropRecord>(this.path("farm/" + index), (current) => (current !== null && current.uid === uid ? null : undefined));
    if (!result.committed) return null;
    this.farm.delete(index);
    this.listeners.forEach((l) => l.onFarmChanged(index));
    return had;
  }

  remoteFarm(index: number, record: FrCropRecord | null): void {
    if (record === null) { if (!this.farm.has(index)) return; this.farm.delete(index); } else this.farm.set(index, record);
    this.listeners.forEach((l) => l.onFarmChanged(index));
  }

  async claimLot(n: number, lot: FrLot): Promise<boolean> {
    const result = await this.backend.transaction<FrLot>(this.path("lots/" + n), (current) => (current === null ? lot : undefined));
    if (!result.committed) return false;
    this.lots.set(n, lot);
    this.listeners.forEach((l) => l.onLotChanged());
    return true;
  }

  async releaseLot(n: number): Promise<void> {
    await this.backend.set(this.path("lots/" + n), null);
    this.lots.delete(n);
    this.listeners.forEach((l) => l.onLotChanged());
  }

  remoteLot(n: number, lot: FrLot | null): void {
    if (lot === null) this.lots.delete(n); else this.lots.set(n, lot);
    this.listeners.forEach((l) => l.onLotChanged());
  }

  remoteFelled(index: number): void {
    if (this.felled.has(index)) return;
    this.felled.add(index);
    const spot = this.trees.get(index);
    if (spot) this.listeners.forEach((l) => l.onTreeFelled(spot));
  }

  remoteTerrain(index: number, edit: FrTerrainEdit): void {
    const x = index % this.terrain.w, z = Math.floor(index / this.terrain.w);
    const now = this.terrain.editOf(x, z);
    if (now && now.h === edit.h && now.t === edit.t) return;
    this.terrain.edit(x, z, edit);
    this.listeners.forEach((l) => l.onTerrainEdited(x, z));
    this.refreshWater();
  }

  remoteSnow(index: number, day: number | null): void {
    if (day === null) this.snowDugDay.delete(index); else this.snowDugDay.set(index, day);
  }

  remoteBuilt(key: string): void {
    if (this.builtKeys.has(key)) return;
    this.builtKeys.add(key);
    const id = key.replace(/_\d+$/, "");
    this.village.markBuilt(id);
    this.applySiteEffects(key, true);
    this.listeners.forEach((l) => { l.onBuilt(key, this.village.builtCount(id)); l.onPublicChanged(); });
  }

  remoteUnbuilt(key: string): void {
    if (!this.builtKeys.has(key)) return;
    const id = key.replace(/_\d+$/, "");
    this.builtKeys.delete(key);
    this.village.unmarkBuilt(id);
    this.applySiteEffects(key, false);
    this.listeners.forEach((l) => { l.onBuilt(key, this.village.builtCount(id)); l.onPublicChanged(); });
  }

  remotePublic(id: string, amount: number): void {
    if (this.publicStore.count(id) === amount) return;
    this.publicStore.setAmount(id, amount);
    this.listeners.forEach((l) => l.onPublicChanged());
  }

  remoteLog(key: string, line: FrPublicLogLine): void {
    if (this.logKeys.has(key)) return;
    this.logKeys.add(key);
    this.publicStore.addLine(line);
    this.listeners.forEach((l) => l.onPublicChanged());
  }
}
