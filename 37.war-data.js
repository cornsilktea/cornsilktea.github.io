"use strict";
class WarBalance {
}
WarBalance.TICKS_PER_SEC = 10;
WarBalance.TICK_MS = 100;
WarBalance.POP_CAP = 60;
WarBalance.SQUAD_COUNT = 3;
WarBalance.SQUAD_CAP = 20;
WarBalance.MATCH_TICKS = 9000;
WarBalance.QUEUE_LIMIT = 5;
WarBalance.START_ORE = 300;
WarBalance.START_CRYSTAL = 0;
WarBalance.START_ORE_WORKERS = 4;
WarBalance.START_CRYSTAL_WORKERS = 0;
WarBalance.WORKER_CAP_PER_RESOURCE = 24;
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
WarBalance.SIGHT_UNIT = 1000;
WarBalance.SIGHT_BUILDING = 1300;
WarBalance.ACQUIRE_RANGE = 1200;
WarBalance.LEASH_RANGE = 2200;
WarBalance.FORMATION_LAG = 900;
WarBalance.LAG_PATIENCE_TICKS = 50;
WarBalance.SEPARATION_RADIUS = 90;
WarBalance.ACQUIRE_EVERY_TICKS = 3;
WarBalance.VISION_EVERY_TICKS = 2;
WarBalance.ALERT_COOLDOWN_TICKS = 50;
WarBalance.ALERT_EVERY_TICKS = 5;
WarBalance.REVIVE_HP_PERCENT = 30;
WarBalance.REVIVE_STUN_TICKS = 10;
WarBalance.CORPSE_KEEP_TICKS = 120;
class WarUnitCatalog {
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
    { id: "guardknight", name: "근위 기사", faction: "pioneer", kind: "elite", role: "front", hp: 950, damage: 29, armorPct: 40, speed: 260, range: 180, cooldownTicks: 10, ore: 160, crystal: 60, pop: 2, buildTicks: 100, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "artillerytruck", name: "포격 트럭", faction: "pioneer", kind: "elite", role: "rear", hp: 235, damage: 42, armorPct: 0, speed: 280, range: 1100, cooldownTicks: 20, ore: 180, crystal: 80, pop: 2, buildTicks: 100, splashRadius: 250, buildingDamagePct: 200, chargeBonusPct: 0 },
    { id: "minion", name: "해골 미니언", faction: "grave", kind: "melee", role: "mid", hp: 115, damage: 10, armorPct: 0, speed: 380, range: 150, cooldownTicks: 8, ore: 30, crystal: 0, pop: 1, buildTicks: 30, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, spawnCount: 2 },
    { id: "skelwarrior", name: "해골 전사", faction: "grave", kind: "melee", role: "front", hp: 360, damage: 15, armorPct: 22, speed: 300, range: 150, cooldownTicks: 10, ore: 55, crystal: 0, pop: 1, buildTicks: 40, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, reviveChancePct: 30 },
    { id: "skelarcher", name: "해골 궁수", faction: "grave", kind: "ranged", role: "rear", hp: 115, damage: 14, armorPct: 0, speed: 340, range: 750, cooldownTicks: 6, ore: 65, crystal: 0, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "skelmage", name: "해골 마법사", faction: "grave", kind: "ranged", role: "rear", hp: 105, damage: 17, armorPct: 0, speed: 320, range: 650, cooldownTicks: 12, ore: 85, crystal: 10, pop: 1, buildTicks: 50, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, slowPct: 30, slowTicks: 30 },
    { id: "bonegiant", name: "뼈 거인", faction: "grave", kind: "elite", role: "front", hp: 1300, damage: 40, armorPct: 25, speed: 240, range: 220, cooldownTicks: 12, ore: 170, crystal: 70, pop: 2, buildTicks: 100, splashRadius: 250, buildingDamagePct: 100, chargeBonusPct: 0 },
    { id: "necromancer", name: "사령술사", faction: "grave", kind: "elite", role: "rear", hp: 190, damage: 20, armorPct: 0, speed: 300, range: 700, cooldownTicks: 12, ore: 150, crystal: 90, pop: 2, buildTicks: 100, splashRadius: 0, buildingDamagePct: 100, chargeBonusPct: 0, ability: "raise" },
];
WarUnitCatalog.DEFS = WarUnitCatalog.SPECS.map((spec) => ({ spawnCount: 1, reviveChancePct: 0, slowPct: 0, slowTicks: 0, ability: "none", ...spec }));
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
    { type: "hq", name: "사령부", ore: 0, crystal: 0, buildTicks: 0, hp: 8000, radius: 320, producesKind: null },
    { type: "barracks", name: "병영", ore: 100, crystal: 0, buildTicks: 80, hp: 800, radius: 160, producesKind: "melee" },
    { type: "range", name: "사격장", ore: 100, crystal: 0, buildTicks: 80, hp: 700, radius: 160, producesKind: "ranged" },
    { type: "lab", name: "연구소", ore: 150, crystal: 50, buildTicks: 120, hp: 900, radius: 170, producesKind: "elite" },
];
WarBuildingCatalog.GRAVE_NAMES = { hq: "어둠의 성소", barracks: "납골당", range: "관 보관소", lab: "저주 제단" };
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
WarMapData.HALF_H = 8200;
WarMapData.HQ_Y = 6000;
WarMapData.ENTRANCE_Y = 4800;
WarMapData.LANE_X = 4500;
WarMapData.LANE_Y = 2400;
WarMapData.LANE_HALF_WIDTH = 650;
WarMapData.PLAZA_RADIUS = 2600;
WarMapData.BASE_RADIUS = 2400;
WarMapData.POST_SPREAD = 1800;
WarMapData.POST_BACKOFF = 500;
WarMapData.SLOT_OFFSETS = [
    { x: -1477, y: -260 }, { x: -1449, y: 388 }, { x: -1149, y: 964 }, { x: -634, y: 1359 }, { x: 0, y: 1500 },
    { x: 634, y: 1359 }, { x: 1149, y: 964 }, { x: 1449, y: 388 }, { x: 1477, y: -260 },
];
WarMapData.ENTRANCE_SLOT_OFFSETS = [{ x: -700, y: -1000 }, { x: 700, y: -1000 }];
WarMapData.ORE_OFFSETS = [{ x: -2100, y: 600 }, { x: -2100, y: -100 }, { x: -2100, y: 1300 }, { x: -1700, y: 1900 }];
WarMapData.CRYSTAL_OFFSETS = [{ x: 2100, y: 600 }, { x: 2100, y: -100 }];
WarMapData.VISION_CELL = 500;
WarMapData.SHARED_VISION_ZONES = [
    { x: 0, y: 0, radius: 1800 },
    { x: -4500, y: 0, radius: 1800 },
    { x: 4500, y: 0, radius: 1800 },
];
