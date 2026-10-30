class FrClockSync {
  static readonly HEARTBEAT_MS = 60000;
  state: FrClockState = { day: 1, dawnAt: 0, lastSeen: 0, frozen: false };
  private offset = 0;
  private lastHeartbeat = 0;

  constructor(private readonly backend: FrBackend, private readonly island: string, private readonly uid: string) {}

  private path(): string { return "forest/" + this.island + "/clock"; }
  now(): number { return Date.now() + this.offset; }
  minuteOfDay(): number { return FrClock.minuteOfDay(this.state, this.now()); }
  day(): number { return FrClock.dayNumber(this.state, this.now()); }
  absoluteMinute(): number { return FrClock.absoluteMinute(this.state, this.now()); }

  async join(): Promise<void> {
    this.offset = (await this.backend.serverTime("users/" + this.uid + "/forest/probe")) - Date.now();
    const now = this.now();
    const result = await this.backend.transaction<FrClockState>(this.path(), (current) => {
      if (current === null) return { day: 1, dawnAt: now, lastSeen: now, frozen: false };
      return FrClock.startOfClass(current, now);
    });
    if (result.value) this.state = result.value;
    this.lastHeartbeat = Date.now();
  }

  async heartbeat(): Promise<void> {
    if (Date.now() - this.lastHeartbeat < FrClockSync.HEARTBEAT_MS) return;
    this.lastHeartbeat = Date.now();
    this.state = { ...this.state, lastSeen: this.now() };
    await this.backend.patch(this.path(), { lastSeen: this.state.lastSeen });
  }

  async skipToMorning(): Promise<boolean> {
    const known = this.state.dawnAt;
    const now = this.now();
    const result = await this.backend.transaction<FrClockState>(this.path(), (current) => {
      if (current === null || current.dawnAt !== known) return undefined;
      return FrClock.skipToMorning(current, now);
    });
    if (result.value) this.state = result.value;
    return result.committed;
  }
}

class FrPlayerBody {
  static readonly SPEED = 8.4;
  static readonly SWIM_FACTOR = 0.3;
  static readonly REACH = 4.2;
  static readonly RADIUS = 0.9;
  static readonly FRONT = 2.6;
  private static readonly SAMPLES: ReadonlyArray<[number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  x = 0;
  z = 0;
  y = 0;
  facing = 0;
  moving = false;
  swimming = false;
  private ground = 0;

  constructor(private readonly world: FrWorld) {}

  place(cellX: number, cellZ: number): void {
    this.x = (cellX + 0.5) * FrTerrainData.BLOCK;
    this.z = (cellZ + 0.5) * FrTerrainData.BLOCK;
    this.ground = this.world.terrain.height(cellX, cellZ);
    this.y = this.world.terrain.surfaceY(cellX, cellZ);
  }

  cell(): FrPoint { return { x: this.world.terrain.cellOf(this.x), z: this.world.terrain.cellOf(this.z) }; }

  frontCell(distance = FrPlayerBody.FRONT): FrPoint {
    return { x: this.world.terrain.cellOf(this.x + Math.sin(this.facing) * distance), z: this.world.terrain.cellOf(this.z + Math.cos(this.facing) * distance) };
  }

  private solid(x: number, z: number): boolean {
    const a = this.world.terrain.anchors;
    if (x === a.campfire.x && z === a.campfire.z) return true;
    if (x >= a.publicChest.x && x < a.publicChest.x + a.publicChest.size && z >= a.publicChest.z && z < a.publicChest.z + a.publicChest.size) return true;
    return FrBuildSites.STAGE_TWO.some((s) => s.x === x && s.z === z);
  }

  private bodyFits(px: number, pz: number): boolean {
    const terrain = this.world.terrain;
    const r = FrPlayerBody.RADIUS;
    return FrPlayerBody.SAMPLES.every(([dx, dz]) => {
      const cx = terrain.cellOf(px + dx * r), cz = terrain.cellOf(pz + dz * r);
      if (!terrain.inside(cx, cz) || terrain.top(cx, cz) === FrTerrainData.OCEAN) return false;
      if (this.world.blocked(cx, cz) || this.solid(cx, cz)) return false;
      if (terrain.isWater(cx, cz)) return true;
      return terrain.height(cx, cz) - this.ground <= 1;
    });
  }

  private groundUnder(px: number, pz: number): number {
    const terrain = this.world.terrain;
    const r = FrPlayerBody.RADIUS;
    let best = -99;
    FrPlayerBody.SAMPLES.forEach(([dx, dz]) => {
      const cx = terrain.cellOf(px + dx * r), cz = terrain.cellOf(pz + dz * r);
      if (!terrain.isWater(cx, cz)) best = Math.max(best, terrain.height(cx, cz));
    });
    return best === -99 ? terrain.height(terrain.cellOf(px), terrain.cellOf(pz)) : best;
  }

  step(direction: FrPoint, dt: number, speedBonus: number): void {
    const length = Math.hypot(direction.x, direction.z);
    this.moving = length > 0.05;
    const here = this.cell();
    this.swimming = this.world.terrain.isWater(here.x, here.z);
    if (this.moving) {
      this.facing = Math.atan2(direction.x, direction.z);
      const speed = FrPlayerBody.SPEED * (1 + speedBonus) * (this.swimming ? FrPlayerBody.SWIM_FACTOR : 1) * Math.min(1, length);
      const dx = (direction.x / length) * speed * dt, dz = (direction.z / length) * speed * dt;
      if (this.bodyFits(this.x + dx, this.z)) this.x += dx;
      if (this.bodyFits(this.x, this.z + dz)) this.z += dz;
    }
    this.ground = this.groundUnder(this.x, this.z);
    const cell = this.cell();
    const swim = this.world.terrain.isWater(cell.x, cell.z);
    const target = swim ? this.world.terrain.surfaceY(cell.x, cell.z) - 1.4 : this.ground * FrTerrainData.BLOCK;
    this.y += (target - this.y) * Math.min(1, dt * 16);
  }
}

type FrTargetKind = "cook" | "chest" | "site" | "tree" | "dig" | "stone" | "snow";

interface FrTarget {
  kind: FrTargetKind;
  label: string;
  cell: FrPoint | null;
  tree?: FrTreeSpot;
  site?: FrBuildSite;
}

class FrTargetFinder {
  constructor(private readonly world: FrWorld) {}

  find(player: FrPlayerBody): FrTarget | null {
    const a = this.world.terrain.anchors;
    const B = FrTerrainData.BLOCK;
    const near = (cx: number, cz: number, range: number) => Math.hypot(player.x - cx, player.z - cz) <= range;
    if (near((a.campfire.x + 0.5) * B, (a.campfire.z + 0.5) * B, 5.4)) return { kind: "cook", label: "요리", cell: null };
    if (near((a.publicChest.x + a.publicChest.size / 2) * B, (a.publicChest.z + a.publicChest.size / 2) * B, 6.4)) return { kind: "chest", label: "창고", cell: null };
    for (const site of FrBuildSites.STAGE_TWO) {
      if (near((site.x + 0.5) * B, (site.z + 0.5) * B, 4.8)) return { kind: "site", label: this.world.village.builtCount(site.id) > 0 ? "열기" : "짓기", cell: null, site };
    }
    const tree = this.nearestTree(player);
    if (tree) return { kind: "tree", label: "베기", cell: { x: tree.x, z: tree.z }, tree };
    const front = player.frontCell();
    if (this.world.terrain.diggable(front.x, front.z) && !this.world.blocked(front.x, front.z)) {
      const top = this.world.terrain.top(front.x, front.z);
      const here = player.cell();
      if (Math.abs(this.world.terrain.height(front.x, front.z) - this.world.terrain.height(here.x, here.z)) <= 1) {
        if (top === "W") return { kind: "snow", label: "캐기", cell: front };
        if (top === "S") return { kind: "stone", label: "캐기", cell: front };
        return { kind: "dig", label: "파기", cell: front };
      }
    }
    return null;
  }

  private nearestTree(player: FrPlayerBody): FrTreeSpot | null {
    let best: FrTreeSpot | null = null;
    let bestDistance = FrPlayerBody.REACH;
    const here = player.cell();
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const spot = this.world.standingTree(this.world.terrain.index(here.x + dx, here.z + dz));
        if (!spot) continue;
        const sx = (spot.x + 0.5) * FrTerrainData.BLOCK - player.x, sz = (spot.z + 0.5) * FrTerrainData.BLOCK - player.z;
        const distance = Math.hypot(sx, sz);
        const facing = (sx * Math.sin(player.facing) + sz * Math.cos(player.facing)) / Math.max(0.01, distance);
        if (distance < bestDistance && facing > 0.15) { best = spot; bestDistance = distance; }
      }
    }
    return best;
  }
}

class FrTask {
  constructor(readonly kind: FrTaskKind, readonly toolKind: string, readonly apCost: number, readonly clip: FrAvatarClip, readonly label: string, readonly missingTool: string) {}
}

class FrTasks {
  private static readonly BY_TARGET: Readonly<Record<string, FrTask>> = {
    tree: new FrTask("chop", "axe", FrBalance.ACTION_COST.chop, "chop", "나무 베기", ""),
    dig: new FrTask("dig", "shovel", FrBalance.ACTION_COST.digTile, "dig", "땅 파기", "삽이 있어야 파요. 작업대에서 만들 수 있어요."),
    stone: new FrTask("stone", "pickaxe", FrBalance.ACTION_COST.digTile, "pickaxe", "돌 캐기", ""),
    snow: new FrTask("snow", "pickaxe", FrBalance.ACTION_COST.digTile, "pickaxe", "눈 캐기", "곡괭이가 있어야 눈을 캘 수 있어요."),
  };

  static forTarget(kind: FrTargetKind): FrTask | null { return FrTasks.BY_TARGET[kind] || null; }
}

class FrTaskOutcome {
  constructor(private readonly session: FrSession, private readonly world: FrWorld, private readonly random: FrRandom, private readonly clock: FrClockSync) {}

  async finish(target: FrTarget, task: FrTask): Promise<string> {
    this.session.ap.spend(task.apCost);
    const broken = this.session.wearTool(task.toolKind);
    const note = broken ? FrItemNames.label(broken) + "이(가) 다 닳았어요" : "";
    if (target.kind === "tree" && target.tree) return (await this.chop(target.tree)) + note;
    if (!target.cell) return note;
    if (target.kind === "snow") return (await this.snow(target.cell)) + note;
    return (await this.dig(target.cell, target.kind === "stone")) + note;
  }

  private async chop(spot: FrTreeSpot): Promise<string> {
    const tier = this.session.bag.bestTier("axe");
    if (!(await this.world.fellTree(spot))) return "이미 쓰러진 나무예요";
    const wood = 2 + FrBalance.AXE_WOOD_BONUS[tier];
    this.session.gain("wood", wood);
    this.session.gain("vine", 1);
    const cleared = spot.zone >= 0 && this.world.zoneCleared(spot.zone);
    return "목재 +" + wood + ", 덩굴 +1" + (cleared ? " · 빈터가 생겼어요!" : "");
  }

  private async dig(cell: FrPoint, stone: boolean): Promise<string> {
    const terrain = this.world.terrain;
    const before: FrTerrainEdit = { h: terrain.height(cell.x, cell.z), t: terrain.top(cell.x, cell.z) };
    const top = before.t;
    const after: FrTerrainEdit = { h: before.h - 1, t: top === "G" ? "D" : top };
    if (!(await this.world.editTerrain(cell.x, cell.z, before, after))) return "다른 친구가 먼저 팠어요";
    if (stone) {
      const drop = FrMineRules.terrainStoneDrop(this.random);
      this.session.gainAll(drop);
      return "돌을 캤어요 +" + Object.keys(drop).map((id) => FrItemNames.label(id)).join(", ");
    }
    const block = top === "G" ? "block_grass" : top === "N" ? "block_sand" : "block_dirt";
    this.session.gain(block, 1);
    if (top === "N") this.session.gain("sand", 1);
    return FrItemNames.label(block) + " +1";
  }

  private async snow(cell: FrPoint): Promise<string> {
    await this.world.digSnow(cell.x, cell.z, this.clock.day());
    this.session.gain("ice", 1);
    return "얼음 +1 (눈은 3일 뒤 다시 생겨요)";
  }
}
