"use strict";
class WarBalance {
    static workerLimit(kind) {
        return kind === "ore" ? WarBalance.ORE_WORKER_LIMIT : WarBalance.CRYSTAL_WORKER_LIMIT;
    }
}
WarBalance.TICKS_PER_SEC = 10;
WarBalance.TICK_MS = 100;
WarBalance.POP_CAP = 70;
WarBalance.SQUAD_COUNT = 4;
WarBalance.FLEET_SQUAD = 3;
WarBalance.SQUAD_CAP = 20;
WarBalance.MATCH_TICKS = 9000;
WarBalance.QUEUE_LIMIT = 5;
WarBalance.BUILDINGS_PER_TYPE = 2;
WarBalance.START_ORE = 300;
WarBalance.START_CRYSTAL = 0;
WarBalance.START_ORE_WORKERS = 2;
WarBalance.START_CRYSTAL_WORKERS = 0;
WarBalance.WORKER_CAP_PER_RESOURCE = 12;
WarBalance.ORE_WORKER_LIMIT = 5;
WarBalance.CRYSTAL_WORKER_LIMIT = 3;
WarBalance.WORKER_YIELD = 2;
WarBalance.WORKER_ORE = 100;
WarBalance.WORKER_CRYSTAL_ORE = 100;
WarBalance.WORKER_CRYSTAL_CRYSTAL = 0;
WarBalance.WORKER_BUILD_TICKS = 25;
WarBalance.FIRST_WORKER_MILLI_PER_SEC = 1200;
WarBalance.CRYSTAL_SPEED_PERCENT = 50;
WarBalance.DIMINISH_PERCENT = 92;
WarBalance.BATCH_MELEE = 10;
WarBalance.BATCH_RANGED = 5;
WarBalance.BATCH_ELITE = 5;
WarBalance.MINION_CAP = 40;
WarBalance.SIGHT_UNIT = 1800;
WarBalance.SIGHT_BUILDING = 1700;
WarBalance.ACQUIRE_RANGE = 1500;
WarBalance.LEASH_RANGE = 2200;
WarBalance.FORMATION_LAG = 1400;
WarBalance.MOVE_SPEED_PERCENT = 135;
WarBalance.BASE_THREAT_RADIUS = 4200;
WarBalance.LAG_PATIENCE_TICKS = 8;
WarBalance.LAG_IGNORE_FAR = 2500;
WarBalance.PATH_MIN_STEP = 200;
WarBalance.DEPART_FREE_TICKS = 10;
WarBalance.HOME_VISION_EXTRA = 600;
WarBalance.ASSIST_RANGE = 2000;
WarBalance.ASSIST_MEMORY_TICKS = 20;
WarBalance.SEPARATION_CELL = 300;
WarBalance.SEPARATION_GAP = 30;
WarBalance.SEPARATION_PASSES = 2;
WarBalance.BUILDING_PADDING = 70;
WarBalance.KITE_MIN_RANGE = 500;
WarBalance.KITE_PERCENT = 45;
WarBalance.ACQUIRE_EVERY_TICKS = 3;
WarBalance.RETARGET_MARGIN = 100;
WarBalance.VISION_EVERY_TICKS = 3;
WarBalance.ALERT_COOLDOWN_TICKS = 50;
WarBalance.ALERT_EVERY_TICKS = 5;
WarBalance.REVIVE_HP_PERCENT = 30;
WarBalance.REVIVE_STUN_TICKS = 10;
WarBalance.CORPSE_KEEP_TICKS = 120;
class WarUnitCatalog {
    static collisionRadius(id) {
        return WarUnitCatalog.COLLISION_RADIUS[id] ?? 60;
    }
    static byId(id) {
        const found = WarUnitCatalog.DEFS.find((def) => def.id === id);
        if (!found)
            throw new Error("unknown unit " + id);
        return found;
    }
    static ofFaction(faction) {
        return WarUnitCatalog.DEFS.filter((def) => def.faction === faction);
    }
    static producedBy(faction, building) {
        return WarUnitCatalog.ofFaction(faction).filter((def) => def.producedAt === building);
    }
}
WarUnitCatalog.SPECS = [
    { id: "shieldbearer", name: "방패병", faction: "pioneer", kind: "melee", role: "front", hp: 425, damage: 12, armorPct: 30, speed: 300, range: 150, cooldownTicks: 10, ore: 60, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "barracks", hitsAir: false },
    { id: "archer", name: "사수", faction: "pioneer", kind: "ranged", role: "rear", hp: 127, damage: 14, armorPct: 0, speed: 340, range: 700, cooldownTicks: 6, ore: 70, crystal: 0, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "barracks" },
    { id: "guardknight", name: "근위 기사", faction: "pioneer", kind: "elite", role: "front", hp: 955, damage: 29, armorPct: 40, speed: 260, range: 180, cooldownTicks: 10, ore: 160, crystal: 60, pop: 2, buildTicks: 100, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "factory", hitsAir: false },
    { id: "artillerytruck", name: "포격 트럭", faction: "pioneer", kind: "elite", role: "rear", hp: 233, damage: 42, armorPct: 0, speed: 280, range: 1100, cooldownTicks: 20, ore: 180, crystal: 80, pop: 2, buildTicks: 100, splashRadius: 250, buildingDamagePct: 200, chargeBonusPct: 0, producedAt: "factory", hitsAir: false },
    { id: "striker", name: "스트라이커", faction: "pioneer", kind: "air", role: "mid", hp: 300, damage: 28, armorPct: 0, speed: 520, range: 800, cooldownTicks: 6, ore: 150, crystal: 40, pop: 2, buildTicks: 80, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "airport", flying: true },
    { id: "executioner", name: "집행자", faction: "pioneer", kind: "air", role: "rear", hp: 900, damage: 180, armorPct: 10, speed: 220, range: 1000, cooldownTicks: 30, ore: 220, crystal: 100, pop: 3, buildTicks: 130, splashRadius: 0, buildingDamagePct: 150, chargeBonusPct: 0, producedAt: "airport", flying: true },
    { id: "skelwarrior", name: "해골 전사", faction: "grave", kind: "melee", role: "front", hp: 360, damage: 15, armorPct: 22, speed: 300, range: 150, cooldownTicks: 10, ore: 49, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "barracks", hitsAir: false, deathSpawnId: "minion", deathSpawnCount: 2 },
    { id: "skelarcher", name: "해골 궁수", faction: "grave", kind: "ranged", role: "rear", hp: 115, damage: 14, armorPct: 0, speed: 340, range: 750, cooldownTicks: 6, ore: 57, crystal: 0, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "barracks" },
    { id: "bonegiant", name: "뼈 거인", faction: "grave", kind: "elite", role: "front", hp: 1300, damage: 40, armorPct: 25, speed: 240, range: 220, cooldownTicks: 12, ore: 148, crystal: 70, pop: 2, buildTicks: 100, splashRadius: 250, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "factory", hitsAir: false },
    { id: "stormwitch", name: "번개 마녀", faction: "grave", kind: "elite", role: "rear", hp: 190, damage: 34, armorPct: 0, speed: 300, range: 900, cooldownTicks: 16, ore: 131, crystal: 90, pop: 2, buildTicks: 100, splashRadius: 300, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "factory" },
    { id: "coffinship", name: "관 배", faction: "grave", kind: "air", role: "mid", hp: 1400, damage: 0, armorPct: 10, speed: 240, range: 0, cooldownTicks: 10, ore: 194, crystal: 40, pop: 2, buildTicks: 100, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "airport", flying: true, hitsAir: false, ability: "dropMinion", abilityTicks: 80, deathSpawnId: "dropminion", deathSpawnCount: 6 },
    { id: "cursedeye", name: "저주의 눈", faction: "grave", kind: "air", role: "rear", hp: 450, damage: 90, armorPct: 0, speed: 300, range: 1000, cooldownTicks: 20, ore: 243, crystal: 90, pop: 3, buildTicks: 120, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, producedAt: "airport", flying: true },
    { id: "minion", name: "해골 미니언", faction: "grave", kind: "melee", role: "mid", hp: 12, damage: 10, armorPct: 0, speed: 380, range: 150, cooldownTicks: 8, ore: 0, crystal: 0, pop: 0, buildTicks: 30, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, hitsAir: false },
    { id: "dropminion", name: "해골 미니언", faction: "grave", kind: "melee", role: "mid", hp: 360, damage: 10, armorPct: 0, speed: 380, range: 150, cooldownTicks: 8, ore: 0, crystal: 0, pop: 0, buildTicks: 30, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, hitsAir: false },
];
WarUnitCatalog.DEFS = WarUnitCatalog.SPECS.map((spec) => ({ spawnCount: 1, reviveChancePct: 0, slowPct: 0, slowTicks: 0, ability: "none", flying: false, hitsAir: true, producedAt: null, deathSpawnId: "", deathSpawnCount: 0, abilityTicks: 0, ...spec }));
WarUnitCatalog.COLLISION_RADIUS = {
    shieldbearer: 62, archer: 55, guardknight: 85, artillerytruck: 105, striker: 110, executioner: 215,
    minion: 40, dropminion: 48, skelwarrior: 62, skelarcher: 55, bonegiant: 110, stormwitch: 62, coffinship: 125, cursedeye: 85,
};
class WarBuildingCatalog {
    static byType(type) {
        const found = WarBuildingCatalog.DEFS.find((def) => def.type === type);
        if (!found)
            throw new Error("unknown building " + type);
        return found;
    }
    static displayName(type, faction) {
        return faction === "grave" ? WarBuildingCatalog.GRAVE_NAMES[type] : WarBuildingCatalog.byType(type).name;
    }
    static buildable(slotKind) {
        if (slotKind !== "normal")
            return [];
        return WarBuildingCatalog.DEFS.filter((def) => def.type !== "hq");
    }
}
WarBuildingCatalog.DEFS = [
    { type: "hq", name: "사령부", ore: 0, crystal: 0, buildTicks: 0, hp: 5000, radius: 320 },
    { type: "barracks", name: "병영", ore: 100, crystal: 0, buildTicks: 80, hp: 800, radius: 160 },
    { type: "factory", name: "공장", ore: 150, crystal: 50, buildTicks: 120, hp: 900, radius: 170 },
    { type: "airport", name: "공항", ore: 150, crystal: 50, buildTicks: 120, hp: 900, radius: 200 },
];
WarBuildingCatalog.GRAVE_NAMES = { hq: "어둠의 성소", barracks: "납골당", factory: "뼈 공방", airport: "관 선착장" };
class WarBlurbs {
    static unit(id) {
        return WarBlurbs.UNITS[id] ?? "";
    }
    static building(type) {
        return WarBlurbs.BUILDINGS[type];
    }
}
WarBlurbs.UNITS = {
    shieldbearer: "큰 방패로 앞에서 버티는 병사. 공중은 공격 못 해요",
    archer: "멀리서 화살을 쏘는 병사. 공중도 쏠 수 있어요",
    guardknight: "느리지만 가장 단단한 기사. 공중은 공격 못 해요",
    artillerytruck: "멀리서 포탄을 쏴 범위 안 적을 모두 다치게 해요. 공중은 못 맞혀요",
    striker: "빠른 전투 비행선. 공중과 지상 모두 사수 둘 몫으로 쏴요",
    executioner: "느리지만 한 방이 아주 센 대형 비행선. 공중·지상 모두 공격해요",
    skelwarrior: "단단한 해골 전사. 쓰러지면 작은 미니언 둘로 흩어져요",
    skelarcher: "멀리서 화살을 쏘는 해골 궁수. 공중도 쏠 수 있어요",
    bonegiant: "주변을 함께 내려치는 거대한 해골. 공중은 공격 못 해요",
    stormwitch: "번개를 내려 범위 안 적을 모두 감전시키는 마녀. 공중도 맞혀요",
    coffinship: "튼튼한 비행 관. 공격은 못 하지만 해골 미니언을 떨어뜨리고, 부서지면 여섯 마리가 쏟아져요",
    cursedeye: "레이저로 한 대상을 강하게 쏘는 눈. 공중·지상 모두 공격해요",
    worker_ore: "광석을 캐요. 많을수록 느리게 늘어요 (최대 5)",
    worker_crystal: "결정을 캐요. 고급 병력에 필요해요 (최대 6)",
};
WarBlurbs.BUILDINGS = {
    hq: "일꾼을 만드는 중심 건물",
    barracks: "기본 근접·원거리 병력을 만들어요",
    factory: "단단한 고급 근접과 강력한 고급 원거리를 만들어요",
    airport: "하늘을 나는 비행 병력을 만들어요. 결정이 필요해요",
};
class WarMapData {
    static sign(team) {
        return team === 0 ? 1 : -1;
    }
    static hq(team) {
        return { x: 0, y: WarMapData.HQ_Y * WarMapData.sign(team) };
    }
    static entrance(team) {
        return { x: 0, y: WarMapData.ENTRANCE_Y * WarMapData.sign(team) };
    }
    static slots(team) {
        const sign = WarMapData.sign(team);
        const hq = WarMapData.hq(team);
        const normal = WarMapData.SLOT_OFFSETS.map((offset, index) => ({ index, kind: "normal", enabled: true, x: hq.x + offset.x * sign, y: hq.y + offset.y * sign }));
        const entrance = WarMapData.ENTRANCE_SLOT_OFFSETS.map((offset, i) => {
            const gate = WarMapData.entrance(team);
            return { index: normal.length + i, kind: "entrance", enabled: false, x: gate.x + offset.x * sign, y: gate.y + offset.y * sign };
        });
        return normal.concat(entrance);
    }
    static orePoints(team) {
        return WarMapData.mirrored(team, WarMapData.ORE_OFFSETS);
    }
    static crystalPoints(team) {
        return WarMapData.mirrored(team, WarMapData.CRYSTAL_OFFSETS);
    }
    static post(team, squad) {
        const gate = WarMapData.entrance(team);
        const sign = WarMapData.sign(team);
        const lateral = Math.trunc(WarMapData.POST_LATERAL[squad] * WarMapData.POST_SPREAD * sign);
        const backoff = squad === WarBalance.FLEET_SQUAD ? WarMapData.FLEET_BACKOFF : WarMapData.POST_BACKOFF;
        return { x: gate.x + lateral, y: gate.y + backoff * sign };
    }
    static navNodes() {
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
    static corridors() {
        const nodes = WarMapData.navNodes();
        const seen = new Set();
        const result = [];
        for (const node of nodes) {
            for (const linkId of node.links) {
                const key = [node.id, linkId].sort().join("-");
                if (seen.has(key))
                    continue;
                seen.add(key);
                const other = nodes.find((n) => n.id === linkId);
                const nearBase = node.id.startsWith("H") || other.id.startsWith("H");
                result.push({ ax: node.x, ay: node.y, bx: other.x, by: other.y, halfWidth: nearBase ? 1200 : WarMapData.LANE_HALF_WIDTH });
            }
        }
        for (const team of [0, 1]) {
            const gate = WarMapData.entrance(team);
            const hq = WarMapData.hq(team);
            result.push({ ax: gate.x, ay: gate.y, bx: gate.x, by: gate.y, halfWidth: WarMapData.PLAZA_RADIUS });
            result.push({ ax: hq.x, ay: hq.y, bx: hq.x, by: hq.y, halfWidth: WarMapData.BASE_RADIUS });
        }
        return result;
    }
    static mirrored(team, offsets) {
        const hq = WarMapData.hq(team);
        const sign = WarMapData.sign(team);
        return offsets.map((offset) => ({ x: hq.x + offset.x * sign, y: hq.y + offset.y * sign }));
    }
}
WarMapData.HALF_W = 6500;
WarMapData.HALF_H = 8600;
WarMapData.HQ_Y = 6300;
WarMapData.ENTRANCE_Y = 4300;
WarMapData.LANE_X = 4500;
WarMapData.LANE_Y = 2400;
WarMapData.LANE_HALF_WIDTH = 650;
WarMapData.PLAZA_RADIUS = 2600;
WarMapData.BASE_RADIUS = 2600;
WarMapData.POST_SPREAD = 1300;
WarMapData.POST_BACKOFF = -400;
WarMapData.FLEET_BACKOFF = -1500;
WarMapData.POST_LATERAL = [0, -1, 1, 0];
WarMapData.SLOT_OFFSETS = [
    { x: -1250, y: -350 }, { x: -800, y: -1000 }, { x: 0, y: -1300 }, { x: 800, y: -1000 }, { x: 1250, y: -350 },
];
WarMapData.ENTRANCE_SLOT_OFFSETS = [{ x: -700, y: -1000 }, { x: 700, y: -1000 }];
WarMapData.ORE_OFFSETS = [{ x: -1500, y: 250 }, { x: -1300, y: 900 }, { x: -800, y: 1350 }, { x: -250, y: 1550 }];
WarMapData.CRYSTAL_OFFSETS = [{ x: 1300, y: 900 }, { x: 750, y: 1400 }];
WarMapData.VISION_CELL = 250;
WarMapData.SHARED_VISION_ZONES = [
    { x: 0, y: 0, radius: 1800 },
    { x: -4500, y: 0, radius: 1800 },
    { x: 4500, y: 0, radius: 1800 },
];
