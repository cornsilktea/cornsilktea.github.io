"use strict";
class WarBalance {
    static workerLimit(kind) {
        return kind === "ore" ? WarBalance.ORE_WORKER_LIMIT : WarBalance.CRYSTAL_WORKER_LIMIT;
    }
}
WarBalance.TICKS_PER_SEC = 10;
WarBalance.TICK_MS = 100;
WarBalance.POP_CAP = 70;
WarBalance.SQUAD_COUNT = 3;
WarBalance.SQUAD_CAP = 20;
WarBalance.MATCH_TICKS = 9000;
WarBalance.QUEUE_LIMIT = 5;
WarBalance.BUILDINGS_PER_TYPE = 2;
WarBalance.START_ORE = 300;
WarBalance.START_CRYSTAL = 0;
WarBalance.START_ORE_WORKERS = 4;
WarBalance.START_CRYSTAL_WORKERS = 0;
WarBalance.WORKER_CAP_PER_RESOURCE = 24;
WarBalance.ORE_WORKER_LIMIT = 10;
WarBalance.CRYSTAL_WORKER_LIMIT = 6;
WarBalance.WORKER_ORE = 50;
WarBalance.WORKER_CRYSTAL_ORE = 50;
WarBalance.WORKER_CRYSTAL_CRYSTAL = 0;
WarBalance.WORKER_BUILD_TICKS = 25;
WarBalance.FIRST_WORKER_MILLI_PER_SEC = 1200;
WarBalance.CRYSTAL_SPEED_PERCENT = 50;
WarBalance.DIMINISH_PERCENT = 92;
WarBalance.BATCH_MELEE = 10;
WarBalance.BATCH_RANGED = 5;
WarBalance.BATCH_ELITE = 5;
WarBalance.SIGHT_UNIT = 1800;
WarBalance.SIGHT_BUILDING = 1700;
WarBalance.ACQUIRE_RANGE = 1500;
WarBalance.LEASH_RANGE = 2200;
WarBalance.FORMATION_LAG = 900;
WarBalance.LAG_PATIENCE_TICKS = 15;
WarBalance.LAG_IGNORE_FAR = 2500;
WarBalance.PATH_MIN_STEP = 200;
WarBalance.DEPART_FREE_TICKS = 20;
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
    static producedBy(faction, kind) {
        return WarUnitCatalog.ofFaction(faction).filter((def) => def.kind === kind);
    }
}
WarUnitCatalog.SPECS = [
    { id: "shieldbearer", name: "방패병", faction: "pioneer", kind: "melee", role: "front", hp: 425, damage: 12, armorPct: 30, speed: 300, range: 150, cooldownTicks: 10, ore: 60, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "charger", name: "돌격병", faction: "pioneer", kind: "melee", role: "mid", hp: 265, damage: 23, armorPct: 0, speed: 360, range: 150, cooldownTicks: 8, ore: 80, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 100 },
    { id: "archer", name: "사수", faction: "pioneer", kind: "ranged", role: "rear", hp: 127, damage: 14, armorPct: 0, speed: 340, range: 700, cooldownTicks: 6, ore: 70, crystal: 0, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "energymage", name: "에너지술사", faction: "pioneer", kind: "ranged", role: "rear", hp: 106, damage: 21, armorPct: 0, speed: 320, range: 650, cooldownTicks: 12, ore: 90, crystal: 10, pop: 1, buildTicks: 50, splashRadius: 200, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "guardknight", name: "근위 기사", faction: "pioneer", kind: "elite", role: "front", hp: 955, damage: 29, armorPct: 40, speed: 260, range: 180, cooldownTicks: 10, ore: 160, crystal: 60, pop: 2, buildTicks: 100, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "artillerytruck", name: "포격 트럭", faction: "pioneer", kind: "elite", role: "rear", hp: 233, damage: 42, armorPct: 0, speed: 280, range: 1100, cooldownTicks: 20, ore: 180, crystal: 80, pop: 2, buildTicks: 100, splashRadius: 250, buildingDamagePct: 200, chargeBonusPct: 0 },
    { id: "minion", name: "해골 미니언", faction: "grave", kind: "melee", role: "mid", hp: 115, damage: 10, armorPct: 0, speed: 380, range: 150, cooldownTicks: 8, ore: 22, crystal: 0, pop: 1, buildTicks: 30, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, spawnCount: 2 },
    { id: "skelwarrior", name: "해골 전사", faction: "grave", kind: "melee", role: "front", hp: 360, damage: 15, armorPct: 22, speed: 300, range: 150, cooldownTicks: 10, ore: 40, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, reviveChancePct: 30 },
    { id: "skelarcher", name: "해골 궁수", faction: "grave", kind: "ranged", role: "rear", hp: 115, damage: 14, armorPct: 0, speed: 340, range: 750, cooldownTicks: 6, ore: 47, crystal: 0, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "skelmage", name: "해골 마법사", faction: "grave", kind: "ranged", role: "rear", hp: 105, damage: 17, armorPct: 0, speed: 320, range: 650, cooldownTicks: 12, ore: 61, crystal: 10, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, slowPct: 30, slowTicks: 30 },
    { id: "bonegiant", name: "뼈 거인", faction: "grave", kind: "elite", role: "front", hp: 1300, damage: 40, armorPct: 25, speed: 240, range: 220, cooldownTicks: 12, ore: 122, crystal: 70, pop: 2, buildTicks: 100, splashRadius: 250, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "necromancer", name: "사령술사", faction: "grave", kind: "elite", role: "rear", hp: 190, damage: 20, armorPct: 0, speed: 300, range: 700, cooldownTicks: 12, ore: 108, crystal: 90, pop: 2, buildTicks: 100, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, ability: "raise" },
];
WarUnitCatalog.DEFS = WarUnitCatalog.SPECS.map((spec) => ({ spawnCount: 1, reviveChancePct: 0, slowPct: 0, slowTicks: 0, ability: "none", ...spec }));
WarUnitCatalog.COLLISION_RADIUS = {
    shieldbearer: 62, charger: 58, archer: 55, energymage: 58, guardknight: 85, artillerytruck: 105,
    minion: 48, skelwarrior: 62, skelarcher: 55, skelmage: 55, bonegiant: 110, necromancer: 70,
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
    { type: "hq", name: "사령부", ore: 0, crystal: 0, buildTicks: 0, hp: 5000, radius: 320, producesKind: null },
    { type: "barracks", name: "병영", ore: 100, crystal: 0, buildTicks: 80, hp: 800, radius: 160, producesKind: "melee" },
    { type: "range", name: "사격장", ore: 100, crystal: 0, buildTicks: 80, hp: 700, radius: 160, producesKind: "ranged" },
    { type: "lab", name: "연구소", ore: 150, crystal: 50, buildTicks: 120, hp: 900, radius: 170, producesKind: "elite" },
];
WarBuildingCatalog.GRAVE_NAMES = { hq: "어둠의 성소", barracks: "납골당", range: "관 보관소", lab: "저주 제단" };
class WarBlurbs {
    static unit(id) {
        return WarBlurbs.UNITS[id] ?? "";
    }
    static building(type) {
        return WarBlurbs.BUILDINGS[type];
    }
}
WarBlurbs.UNITS = {
    shieldbearer: "큰 방패로 앞에서 버티는 튼튼한 병사",
    charger: "빠르게 달려가 첫 공격이 두 배로 아픈 병사",
    archer: "멀리서 화살을 쏘는 기본 원거리 병사",
    energymage: "빛 구슬로 주변 여럿을 한꺼번에 맞히는 술사",
    guardknight: "느리지만 가장 단단한 최전선 기사",
    artillerytruck: "멀리서 포탄을 쏘며 건물을 크게 부수는 트럭",
    minion: "한 번에 둘이 나오는 값싼 해골 졸병",
    skelwarrior: "단단하고, 쓰러지면 가끔 다시 일어나는 전사",
    skelarcher: "멀리서 화살을 쏘는 해골 궁수",
    skelmage: "맞은 적의 움직임을 느리게 하는 마법사",
    bonegiant: "주변을 함께 내려치는 거대한 해골",
    necromancer: "쓰러진 해골을 되살려 일으키는 사령술사",
    worker_ore: "광석을 캐요. 많을수록 느리게 늘어요 (최대 10)",
    worker_crystal: "결정을 캐요. 고급 병력에 필요해요 (최대 6)",
};
WarBlurbs.BUILDINGS = {
    hq: "일꾼을 만드는 중심 건물",
    barracks: "방패로 버티거나 달려드는 근접 병력을 만들어요",
    range: "뒤에서 멀리 쏘는 원거리 병력을 만들어요",
    lab: "강력한 고급 병력을 만들어요. 결정이 필요해요",
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
        const lateral = (squad - 1) * WarMapData.POST_SPREAD;
        return { x: gate.x + lateral, y: gate.y + WarMapData.POST_BACKOFF * sign };
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
WarMapData.POST_SPREAD = 1800;
WarMapData.POST_BACKOFF = -400;
WarMapData.SLOT_OFFSETS = [
    { x: -1700, y: 0 }, { x: -1202, y: -1202 }, { x: 0, y: -1700 }, { x: 1202, y: -1202 }, { x: 1700, y: 0 },
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
