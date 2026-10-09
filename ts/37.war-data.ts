type WarTeam = 0 | 1;
type WarFactionId = "pioneer" | "grave";
type WarUnitKind = "melee" | "ranged" | "elite";
type WarRole = "front" | "mid" | "rear";
type WarBuildingType = "hq" | "barracks" | "range" | "lab";
type WarSlotKind = "normal" | "entrance";
type WarWorkerKind = "ore" | "crystal";

interface WarPoint { x: number; y: number }

type WarAbilityId = "none" | "raise";

interface WarUnitDef {
  id: string;
  name: string;
  faction: WarFactionId;
  kind: WarUnitKind;
  role: WarRole;
  hp: number;
  damage: number;
  armorPct: number;
  speed: number;
  range: number;
  cooldownTicks: number;
  ore: number;
  crystal: number;
  pop: number;
  buildTicks: number;
  splashRadius: number;
  buildingDamagePct: number;
  chargeBonusPct: number;
  spawnCount: number;
  reviveChancePct: number;
  slowPct: number;
  slowTicks: number;
  ability: WarAbilityId;
}

type WarUnitSpec = Omit<WarUnitDef, "spawnCount" | "reviveChancePct" | "slowPct" | "slowTicks" | "ability"> & Partial<Pick<WarUnitDef, "spawnCount" | "reviveChancePct" | "slowPct" | "slowTicks" | "ability">>;

interface WarBuildingDef {
  type: WarBuildingType;
  name: string;
  ore: number;
  crystal: number;
  buildTicks: number;
  hp: number;
  radius: number;
  producesKind: WarUnitKind | null;
}

interface WarSlotDef { index: number; kind: WarSlotKind; enabled: boolean; x: number; y: number }
interface WarNavNode { id: string; x: number; y: number; links: string[] }
interface WarCorridor { ax: number; ay: number; bx: number; by: number; halfWidth: number }
interface WarVisionZone { x: number; y: number; radius: number }

class WarBalance {
  static readonly TICKS_PER_SEC = 10;
  static readonly TICK_MS = 100;
  static readonly POP_CAP = 60;
  static readonly SQUAD_COUNT = 3;
  static readonly SQUAD_CAP = 20;
  static readonly MATCH_TICKS = 9000;
  static readonly QUEUE_LIMIT = 5;
  static readonly START_ORE = 300;
  static readonly START_CRYSTAL = 0;
  static readonly START_ORE_WORKERS = 4;
  static readonly START_CRYSTAL_WORKERS = 0;
  static readonly WORKER_CAP_PER_RESOURCE = 24;
  static readonly WORKER_ORE = 50;
  static readonly WORKER_CRYSTAL_ORE = 50;
  static readonly WORKER_CRYSTAL_CRYSTAL = 0;
  static readonly WORKER_BUILD_TICKS = 25;
  static readonly FIRST_WORKER_MILLI_PER_SEC = 1200;
  static readonly CRYSTAL_SPEED_PERCENT = 50;
  static readonly DIMINISH_PERCENT = 92;
  static readonly BATCH_MELEE = 10;
  static readonly BATCH_RANGED = 5;
  static readonly BATCH_ELITE = 5;
  static readonly SIGHT_UNIT = 1200;
  static readonly SIGHT_BUILDING = 1300;
  static readonly ACQUIRE_RANGE = 1200;
  static readonly LEASH_RANGE = 2200;
  static readonly FORMATION_LAG = 900;
  static readonly LAG_PATIENCE_TICKS = 15;
  static readonly LAG_IGNORE_FAR = 2500;
  static readonly PATH_MIN_STEP = 200;
  static readonly DEPART_FREE_TICKS = 20;
  static readonly HOME_VISION_EXTRA = 600;
  static readonly ASSIST_RANGE = 2000;
  static readonly ASSIST_MEMORY_TICKS = 20;
  static readonly SEPARATION_RADIUS = 90;
  static readonly ACQUIRE_EVERY_TICKS = 3;
  static readonly VISION_EVERY_TICKS = 3;
  static readonly ALERT_COOLDOWN_TICKS = 50;
  static readonly ALERT_EVERY_TICKS = 5;
  static readonly REVIVE_HP_PERCENT = 30;
  static readonly REVIVE_STUN_TICKS = 10;
  static readonly CORPSE_KEEP_TICKS = 120;
}

class WarUnitCatalog {
  private static readonly SPECS: WarUnitSpec[] = [
    { id: "shieldbearer", name: "방패병", faction: "pioneer", kind: "melee", role: "front", hp: 448, damage: 12, armorPct: 30, speed: 300, range: 150, cooldownTicks: 10, ore: 60, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "charger", name: "돌격병", faction: "pioneer", kind: "melee", role: "mid", hp: 280, damage: 24, armorPct: 0, speed: 360, range: 150, cooldownTicks: 8, ore: 80, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 100 },
    { id: "archer", name: "사수", faction: "pioneer", kind: "ranged", role: "rear", hp: 134, damage: 15, armorPct: 0, speed: 340, range: 700, cooldownTicks: 6, ore: 70, crystal: 0, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "energymage", name: "에너지술사", faction: "pioneer", kind: "ranged", role: "rear", hp: 112, damage: 22, armorPct: 0, speed: 320, range: 650, cooldownTicks: 12, ore: 90, crystal: 10, pop: 1, buildTicks: 50, splashRadius: 200, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "guardknight", name: "근위 기사", faction: "pioneer", kind: "elite", role: "front", hp: 1008, damage: 30, armorPct: 40, speed: 260, range: 180, cooldownTicks: 10, ore: 160, crystal: 60, pop: 2, buildTicks: 100, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "artillerytruck", name: "포격 트럭", faction: "pioneer", kind: "elite", role: "rear", hp: 246, damage: 44, armorPct: 0, speed: 280, range: 1100, cooldownTicks: 20, ore: 180, crystal: 80, pop: 2, buildTicks: 100, splashRadius: 250, buildingDamagePct: 200, chargeBonusPct: 0 },
    { id: "minion", name: "해골 미니언", faction: "grave", kind: "melee", role: "mid", hp: 115, damage: 10, armorPct: 0, speed: 380, range: 150, cooldownTicks: 8, ore: 30, crystal: 0, pop: 1, buildTicks: 30, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, spawnCount: 2 },
    { id: "skelwarrior", name: "해골 전사", faction: "grave", kind: "melee", role: "front", hp: 360, damage: 15, armorPct: 22, speed: 300, range: 150, cooldownTicks: 10, ore: 55, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, reviveChancePct: 30 },
    { id: "skelarcher", name: "해골 궁수", faction: "grave", kind: "ranged", role: "rear", hp: 115, damage: 14, armorPct: 0, speed: 340, range: 750, cooldownTicks: 6, ore: 65, crystal: 0, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "skelmage", name: "해골 마법사", faction: "grave", kind: "ranged", role: "rear", hp: 105, damage: 17, armorPct: 0, speed: 320, range: 650, cooldownTicks: 12, ore: 85, crystal: 10, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, slowPct: 30, slowTicks: 30 },
    { id: "bonegiant", name: "뼈 거인", faction: "grave", kind: "elite", role: "front", hp: 1300, damage: 40, armorPct: 25, speed: 240, range: 220, cooldownTicks: 12, ore: 170, crystal: 70, pop: 2, buildTicks: 100, splashRadius: 250, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "necromancer", name: "사령술사", faction: "grave", kind: "elite", role: "rear", hp: 190, damage: 20, armorPct: 0, speed: 300, range: 700, cooldownTicks: 12, ore: 150, crystal: 90, pop: 2, buildTicks: 100, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, ability: "raise" },
  ];

  private static readonly DEFS: WarUnitDef[] = WarUnitCatalog.SPECS.map((spec) => ({ spawnCount: 1, reviveChancePct: 0, slowPct: 0, slowTicks: 0, ability: "none" as WarAbilityId, ...spec }));

  static byId(id: string): WarUnitDef {
    const found = WarUnitCatalog.DEFS.find((def) => def.id === id);
    if (!found) throw new Error("unknown unit " + id);
    return found;
  }

  static ofFaction(faction: WarFactionId): WarUnitDef[] {
    return WarUnitCatalog.DEFS.filter((def) => def.faction === faction);
  }

  static producedBy(faction: WarFactionId, kind: WarUnitKind): WarUnitDef[] {
    return WarUnitCatalog.ofFaction(faction).filter((def) => def.kind === kind);
  }
}

class WarBuildingCatalog {
  private static readonly DEFS: WarBuildingDef[] = [
    { type: "hq", name: "사령부", ore: 0, crystal: 0, buildTicks: 0, hp: 5000, radius: 320, producesKind: null },
    { type: "barracks", name: "병영", ore: 100, crystal: 0, buildTicks: 80, hp: 800, radius: 160, producesKind: "melee" },
    { type: "range", name: "사격장", ore: 100, crystal: 0, buildTicks: 80, hp: 700, radius: 160, producesKind: "ranged" },
    { type: "lab", name: "연구소", ore: 150, crystal: 50, buildTicks: 120, hp: 900, radius: 170, producesKind: "elite" },
  ];

  static byType(type: WarBuildingType): WarBuildingDef {
    const found = WarBuildingCatalog.DEFS.find((def) => def.type === type);
    if (!found) throw new Error("unknown building " + type);
    return found;
  }

  private static readonly GRAVE_NAMES: Record<WarBuildingType, string> = { hq: "어둠의 성소", barracks: "납골당", range: "관 보관소", lab: "저주 제단" };

  static displayName(type: WarBuildingType, faction: WarFactionId): string {
    return faction === "grave" ? WarBuildingCatalog.GRAVE_NAMES[type] : WarBuildingCatalog.byType(type).name;
  }

  static buildable(slotKind: WarSlotKind): WarBuildingDef[] {
    if (slotKind !== "normal") return [];
    return WarBuildingCatalog.DEFS.filter((def) => def.type !== "hq");
  }
}

class WarMapData {
  static readonly HALF_W = 6500;
  static readonly HALF_H = 8600;
  static readonly HQ_Y = 6300;
  static readonly ENTRANCE_Y = 4300;
  static readonly LANE_X = 4500;
  static readonly LANE_Y = 2400;
  static readonly LANE_HALF_WIDTH = 650;
  static readonly PLAZA_RADIUS = 2600;
  static readonly BASE_RADIUS = 2600;
  static readonly POST_SPREAD = 1800;
  static readonly POST_BACKOFF = -400;
  static readonly SLOT_OFFSETS: WarPoint[] = [
    { x: -1700, y: 0 }, { x: -1571, y: -651 }, { x: -1202, y: -1202 }, { x: -651, y: -1571 }, { x: 0, y: -1700 },
    { x: 651, y: -1571 }, { x: 1202, y: -1202 }, { x: 1571, y: -651 }, { x: 1700, y: 0 },
  ];
  static readonly ENTRANCE_SLOT_OFFSETS: WarPoint[] = [{ x: -700, y: -1000 }, { x: 700, y: -1000 }];
  static readonly ORE_OFFSETS: WarPoint[] = [{ x: -1500, y: 250 }, { x: -1300, y: 900 }, { x: -800, y: 1350 }, { x: -250, y: 1550 }];
  static readonly CRYSTAL_OFFSETS: WarPoint[] = [{ x: 1300, y: 900 }, { x: 750, y: 1400 }];
  static readonly VISION_CELL = 250;
  static readonly SHARED_VISION_ZONES: WarVisionZone[] = [
    { x: 0, y: 0, radius: 1800 },
    { x: -4500, y: 0, radius: 1800 },
    { x: 4500, y: 0, radius: 1800 },
  ];

  static sign(team: WarTeam): number {
    return team === 0 ? 1 : -1;
  }

  static hq(team: WarTeam): WarPoint {
    return { x: 0, y: WarMapData.HQ_Y * WarMapData.sign(team) };
  }

  static entrance(team: WarTeam): WarPoint {
    return { x: 0, y: WarMapData.ENTRANCE_Y * WarMapData.sign(team) };
  }

  static slots(team: WarTeam): WarSlotDef[] {
    const sign = WarMapData.sign(team);
    const hq = WarMapData.hq(team);
    const normal = WarMapData.SLOT_OFFSETS.map((offset, index): WarSlotDef => ({ index, kind: "normal", enabled: true, x: hq.x + offset.x * sign, y: hq.y + offset.y * sign }));
    const entrance = WarMapData.ENTRANCE_SLOT_OFFSETS.map((offset, i): WarSlotDef => {
      const gate = WarMapData.entrance(team);
      return { index: normal.length + i, kind: "entrance", enabled: false, x: gate.x + offset.x * sign, y: gate.y + offset.y * sign };
    });
    return normal.concat(entrance);
  }

  static orePoints(team: WarTeam): WarPoint[] {
    return WarMapData.mirrored(team, WarMapData.ORE_OFFSETS);
  }

  static crystalPoints(team: WarTeam): WarPoint[] {
    return WarMapData.mirrored(team, WarMapData.CRYSTAL_OFFSETS);
  }

  static post(team: WarTeam, squad: number): WarPoint {
    const gate = WarMapData.entrance(team);
    const sign = WarMapData.sign(team);
    const lateral = (squad - 1) * WarMapData.POST_SPREAD;
    return { x: gate.x + lateral, y: gate.y + WarMapData.POST_BACKOFF * sign };
  }

  static navNodes(): WarNavNode[] {
    const lx = WarMapData.LANE_X;
    const ly = WarMapData.LANE_Y;
    const ey = WarMapData.ENTRANCE_Y;
    return [
      { id: "E0", x: 0, y: ey, links: ["M", "L0", "R0", "H0"] },
      { id: "E1", x: 0, y: -ey, links: ["M", "L1", "R1", "H1"] },
      { id: "H0", x: 0, y: WarMapData.HQ_Y, links: ["E0"] },
      { id: "H1", x: 0, y: -WarMapData.HQ_Y, links: ["E1"] },
      { id: "M", x: 0, y: 0, links: ["E0", "E1"] },
      { id: "L0", x: -lx, y: ly, links: ["E0", "L1"] },
      { id: "L1", x: -lx, y: -ly, links: ["E1", "L0"] },
      { id: "R0", x: lx, y: ly, links: ["E0", "R1"] },
      { id: "R1", x: lx, y: -ly, links: ["E1", "R0"] },
    ];
  }

  static corridors(): WarCorridor[] {
    const nodes = WarMapData.navNodes();
    const seen = new Set<string>();
    const result: WarCorridor[] = [];
    for (const node of nodes) {
      for (const linkId of node.links) {
        const key = [node.id, linkId].sort().join("-");
        if (seen.has(key)) continue;
        seen.add(key);
        const other = nodes.find((n) => n.id === linkId) as WarNavNode;
        const nearBase = node.id.startsWith("H") || other.id.startsWith("H");
        result.push({ ax: node.x, ay: node.y, bx: other.x, by: other.y, halfWidth: nearBase ? 1200 : WarMapData.LANE_HALF_WIDTH });
      }
    }
    for (const team of [0, 1] as WarTeam[]) {
      const gate = WarMapData.entrance(team);
      const hq = WarMapData.hq(team);
      result.push({ ax: gate.x, ay: gate.y, bx: gate.x, by: gate.y, halfWidth: WarMapData.PLAZA_RADIUS });
      result.push({ ax: hq.x, ay: hq.y, bx: hq.x, by: hq.y, halfWidth: WarMapData.BASE_RADIUS });
    }
    return result;
  }

  private static mirrored(team: WarTeam, offsets: WarPoint[]): WarPoint[] {
    const hq = WarMapData.hq(team);
    const sign = WarMapData.sign(team);
    return offsets.map((offset) => ({ x: hq.x + offset.x * sign, y: hq.y + offset.y * sign }));
  }
}
