type WarTeam = 0 | 1;
type WarFactionId = "adventurer" | "grave";
type WarUnitKind = "melee" | "ranged" | "elite";
type WarRole = "front" | "mid" | "rear";
type WarBuildingType = "hq" | "barracks" | "citadel" | "turret";
type WarSlotKind = "normal" | "entrance";
type WarWorkerKind = "ore" | "crystal";

interface WarPoint { x: number; y: number }

type WarAbilityId = "none" | "heal";

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
  slowPct: number;
  slowTicks: number;
  ability: WarAbilityId;
  producedAt: WarBuildingType | null;
  abilityTicks: number;
  abilityPower: number;
  abilityRange: number;
}

type WarUnitOptional = "spawnCount" | "slowPct" | "slowTicks" | "ability" | "producedAt" | "abilityTicks" | "abilityPower" | "abilityRange";
type WarUnitSpec = Omit<WarUnitDef, WarUnitOptional> & Partial<Pick<WarUnitDef, WarUnitOptional>>;

interface WarBuildingDef {
  type: WarBuildingType;
  name: string;
  ore: number;
  crystal: number;
  buildTicks: number;
  hp: number;
  radius: number;
}

interface WarSlotDef { index: number; kind: WarSlotKind; enabled: boolean; x: number; y: number }
interface WarNavNode { id: string; x: number; y: number; links: string[] }
interface WarCorridor { ax: number; ay: number; bx: number; by: number; halfWidth: number }
interface WarVisionZone { x: number; y: number; radius: number }

class WarBalance {
  static readonly TICKS_PER_SEC = 10;
  static workerLimit(kind: WarWorkerKind): number {
    return kind === "ore" ? WarBalance.ORE_WORKER_LIMIT : WarBalance.CRYSTAL_WORKER_LIMIT;
  }

  static readonly TICK_MS = 100;
  static readonly POP_CAP = 70;
  static readonly SQUAD_COUNT = 3;
  static readonly SQUAD_CAP = 20;
  static readonly MATCH_TICKS = 9000;
  static readonly QUEUE_LIMIT = 5;
  static readonly BUILDINGS_PER_TYPE = 2;
  static readonly START_ORE = 300;
  static readonly START_CRYSTAL = 0;
  static readonly START_ORE_WORKERS = 2;
  static readonly START_CRYSTAL_WORKERS = 0;
  static readonly WORKER_CAP_PER_RESOURCE = 12;
  static readonly ORE_WORKER_LIMIT = 6;
  static readonly CRYSTAL_WORKER_LIMIT = 4;
  static readonly WORKER_YIELD = 3;
  static readonly WORKER_ORE = 100;
  static readonly WORKER_CRYSTAL_ORE = 100;
  static readonly WORKER_CRYSTAL_CRYSTAL = 0;
  static readonly WORKER_BUILD_TICKS = 25;
  static readonly FIRST_WORKER_MILLI_PER_SEC = 1300;
  static readonly CRYSTAL_SPEED_PERCENT = 50;
  static readonly DIMINISH_PERCENT = 92;
  static readonly BATCH_LOW = 15;
  static readonly BATCH_ELITE = 5;
  static readonly SIGHT_UNIT = 1800;
  static readonly SIGHT_BUILDING = 1700;
  static readonly ACQUIRE_RANGE = 1500;
  static readonly LEASH_RANGE = 2200;
  static readonly FORMATION_LAG = 1400;
  static readonly MOVE_SPEED_PERCENT = 135;
  static readonly BASE_THREAT_RADIUS = 4200;
  static readonly LAG_PATIENCE_TICKS = 8;
  static readonly LAG_IGNORE_FAR = 2500;
  static readonly PATH_MIN_STEP = 200;
  static readonly DEPART_FREE_TICKS = 10;
  static readonly HOME_VISION_EXTRA = 600;
  static readonly ASSIST_RANGE = 2000;
  static readonly ASSIST_MEMORY_TICKS = 20;
  static readonly SEPARATION_CELL = 300;
  static readonly SEPARATION_GAP = 30;
  static readonly SEPARATION_PASSES = 2;
  static readonly ENEMY_OVERLAP_PERCENT = 55;
  static readonly SLOT_TOLERANCE = 120;
  static readonly REST_MAX_GAP = 500;
  static readonly HEALER_SEEK_RANGE = 1800;
  static readonly HEALER_CLOSE_PERCENT = 70;
  static readonly BUILDING_PADDING = 70;
  static readonly KITE_MIN_RANGE = 500;
  static readonly KITE_PERCENT = 45;
  static readonly ACQUIRE_EVERY_TICKS = 3;
  static readonly RETARGET_MARGIN = 100;
  static readonly VISION_EVERY_TICKS = 3;
  static readonly ALERT_COOLDOWN_TICKS = 50;
  static readonly ALERT_EVERY_TICKS = 5;
}

class WarUnitCatalog {
  private static readonly SPECS: WarUnitSpec[] = [
    { id: "knight", name: "기사", faction: "adventurer", kind: "melee", role: "front", hp: 425, damage: 12, armorPct: 30, speed: 300, range: 150, cooldownTicks: 10, ore: 60, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "barracks" },
    { id: "ranger", name: "레인저", faction: "adventurer", kind: "ranged", role: "rear", hp: 127, damage: 14, armorPct: 0, speed: 340, range: 700, cooldownTicks: 6, ore: 70, crystal: 0, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "barracks" },
    { id: "druid", name: "드루이드", faction: "adventurer", kind: "ranged", role: "mid", hp: 170, damage: 0, armorPct: 0, speed: 320, range: 0, cooldownTicks: 10, ore: 100, crystal: 0, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "barracks", ability: "heal", abilityTicks: 15, abilityPower: 20, abilityRange: 1000 },
    { id: "mage", name: "마법사", faction: "adventurer", kind: "elite", role: "rear", hp: 195, damage: 35, armorPct: 0, speed: 300, range: 900, cooldownTicks: 16, ore: 135, crystal: 85, pop: 2, buildTicks: 100, splashRadius: 300, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "citadel" },
    { id: "barbarian", name: "거대 바바리안", faction: "adventurer", kind: "elite", role: "front", hp: 1250, damage: 40, armorPct: 22, speed: 250, range: 220, cooldownTicks: 12, ore: 150, crystal: 70, pop: 2, buildTicks: 100, splashRadius: 250, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "citadel" },
    { id: "engineer", name: "엔지니어", faction: "adventurer", kind: "elite", role: "rear", hp: 190, damage: 26, armorPct: 0, speed: 280, range: 1000, cooldownTicks: 20, ore: 180, crystal: 80, pop: 2, buildTicks: 100, splashRadius: 250, buildingDamagePct: 280, chargeBonusPct: 0, producedAt: "citadel" },
    { id: "skelwarrior", name: "해골 전사", faction: "grave", kind: "melee", role: "front", hp: 450, damage: 16, armorPct: 25, speed: 300, range: 150, cooldownTicks: 10, ore: 50, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "barracks" },
    { id: "skelarcher", name: "해골 궁수", faction: "grave", kind: "ranged", role: "rear", hp: 125, damage: 15, armorPct: 0, speed: 340, range: 750, cooldownTicks: 6, ore: 57, crystal: 0, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "barracks" },
    { id: "minion", name: "해골 미니언 떼", faction: "grave", kind: "melee", role: "mid", hp: 120, damage: 14, armorPct: 0, speed: 380, range: 150, cooldownTicks: 8, ore: 60, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "barracks", spawnCount: 3 },
    { id: "skelmage", name: "해골 마법사", faction: "grave", kind: "elite", role: "rear", hp: 190, damage: 36, armorPct: 0, speed: 300, range: 900, cooldownTicks: 16, ore: 131, crystal: 90, pop: 2, buildTicks: 100, splashRadius: 300, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "citadel" },
    { id: "necromancer", name: "사령술사", faction: "grave", kind: "elite", role: "rear", hp: 210, damage: 38, armorPct: 0, speed: 300, range: 900, cooldownTicks: 14, ore: 120, crystal: 70, pop: 2, buildTicks: 100, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "citadel", slowPct: 40, slowTicks: 50 },
    { id: "golem", name: "스켈레톤 골렘", faction: "grave", kind: "elite", role: "front", hp: 1500, damage: 55, armorPct: 25, speed: 220, range: 260, cooldownTicks: 16, ore: 170, crystal: 80, pop: 2, buildTicks: 110, splashRadius: 200, buildingDamagePct: 200, chargeBonusPct: 0, producedAt: "citadel" },
  ];
  private static readonly DEFS: WarUnitDef[] = WarUnitCatalog.SPECS.map((spec) => ({ spawnCount: 1, slowPct: 0, slowTicks: 0, ability: "none" as WarAbilityId, producedAt: null, abilityTicks: 0, abilityPower: 0, abilityRange: 0, ...spec }));

  private static readonly COLLISION_RADIUS: Record<string, number> = {
    knight: 62, ranger: 55, druid: 55, mage: 62, barbarian: 115, engineer: 70,
    skelwarrior: 62, skelarcher: 55, minion: 42, skelmage: 62, necromancer: 62, golem: 125,
  };

  static collisionRadius(id: string): number {
    return WarUnitCatalog.COLLISION_RADIUS[id] ?? 60;
  }

  static byId(id: string): WarUnitDef {
    const found = WarUnitCatalog.DEFS.find((def) => def.id === id);
    if (!found) throw new Error("unknown unit " + id);
    return found;
  }

  static ofFaction(faction: WarFactionId): WarUnitDef[] {
    return WarUnitCatalog.DEFS.filter((def) => def.faction === faction);
  }

  static producedBy(faction: WarFactionId, building: WarBuildingType): WarUnitDef[] {
    return WarUnitCatalog.ofFaction(faction).filter((def) => def.producedAt === building);
  }
}

class WarBuildingCatalog {
  private static readonly DEFS: WarBuildingDef[] = [
    { type: "hq", name: "모험단 본부", ore: 0, crystal: 0, buildTicks: 0, hp: 5000, radius: 320 },
    { type: "barracks", name: "병영", ore: 100, crystal: 0, buildTicks: 80, hp: 800, radius: 160 },
    { type: "citadel", name: "성채", ore: 150, crystal: 50, buildTicks: 120, hp: 900, radius: 180 },
    { type: "turret", name: "수비 포탑", ore: 0, crystal: 0, buildTicks: 0, hp: 1000, radius: 150 },
  ];
  static byType(type: WarBuildingType): WarBuildingDef {
    const found = WarBuildingCatalog.DEFS.find((def) => def.type === type);
    if (!found) throw new Error("unknown building " + type);
    return found;
  }

  private static readonly GRAVE_NAMES: Record<WarBuildingType, string> = { hq: "어둠의 성소", barracks: "납골당", citadel: "사령 제단", turret: "저주 말뚝" };

  static displayName(type: WarBuildingType, faction: WarFactionId): string {
    return faction === "grave" ? WarBuildingCatalog.GRAVE_NAMES[type] : WarBuildingCatalog.byType(type).name;
  }

  static buildable(slotKind: WarSlotKind): WarBuildingDef[] {
    if (slotKind !== "normal") return [];
    return WarBuildingCatalog.DEFS.filter((def) => def.type !== "hq" && def.type !== "turret");
  }
}

class WarBlurbs {
  private static readonly UNITS: Record<string, string> = {
    knight: "큰 방패로 앞에서 버티는 기사. 가장 먼저 적과 맞서요",
    ranger: "멀리서 화살을 쏘는 레인저. 적이 다가오면 물러나며 쏴요",
    druid: "공격은 못 하지만 곁의 아군 중 가장 다친 한 명을 계속 치료해요",
    mage: "불덩이를 던져 범위 안 적을 모두 다치게 하는 마법사",
    barbarian: "도끼를 휘둘러 주변을 함께 쓰러뜨리는 거대한 바바리안. 느리지만 아주 튼튼해요",
    engineer: "멀리서 폭탄을 던져 건물에 큰 피해를 주는 공성 병사. 느리고 약해요",
    skelwarrior: "단단한 해골 전사. 값이 싸고 앞에서 버텨요",
    skelarcher: "멀리서 화살을 쏘는 해골 궁수. 싸고 약해요",
    minion: "한 번에 세 마리가 나오는 해골 미니언 떼. 빠르고 물량으로 밀어붙여요",
    skelmage: "번개를 내려 범위 안 적을 모두 감전시키는 해골 마법사",
    necromancer: "저주를 걸어 맞은 적의 이동과 공격을 한동안 느리게 만들어요",
    golem: "건물에 큰 피해를 주는 거대한 스켈레톤 골렘. 가장 튼튼한 공성 병사예요",
    worker_ore: "광석을 캐요. 많을수록 느리게 늘어요 (최대 " + WarBalance.ORE_WORKER_LIMIT + ")",
    worker_crystal: "결정을 캐요. 고급 병력에 필요해요 (최대 " + WarBalance.CRYSTAL_WORKER_LIMIT + ")",
  };

  private static readonly BUILDINGS: Record<WarBuildingType, string> = {
    hq: "일꾼을 만드는 중심 건물",
    barracks: "광석만으로 기본 병력 세 종류를 만들어요",
    citadel: "광석과 결정으로 강한 병력과 공성 병사를 만들어요",
    turret: "기지 입구를 지키는 포탑이에요. 일반 병사에겐 약하고, 고급 지상 유닛은 세 발에 쓰러뜨려요",
  };
  static unit(id: string): string {
    return WarBlurbs.UNITS[id] ?? "";
  }

  static building(type: WarBuildingType): string {
    return WarBlurbs.BUILDINGS[type];
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
  static readonly POST_SPREAD = 1300;
  static readonly TURRET_OFFSET: WarPoint = { x: 0, y: 350 };
  static readonly POST_BACKOFF = -400;
  static readonly POST_LATERAL: number[] = [0, -1, 1];
  static readonly SLOT_OFFSETS: WarPoint[] = [
    { x: -1250, y: -350 }, { x: -800, y: -1000 }, { x: 0, y: -1300 }, { x: 800, y: -1000 }, { x: 1250, y: -350 },
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

  static turret(team: WarTeam): WarPoint {
    const gate = WarMapData.entrance(team);
    const sign = WarMapData.sign(team);
    return { x: gate.x + WarMapData.TURRET_OFFSET.x * sign, y: gate.y + WarMapData.TURRET_OFFSET.y * sign };
  }

  static post(team: WarTeam, squad: number): WarPoint {
    const gate = WarMapData.entrance(team);
    const sign = WarMapData.sign(team);
    const lateral = Math.trunc(WarMapData.POST_LATERAL[squad] * WarMapData.POST_SPREAD * sign);
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
