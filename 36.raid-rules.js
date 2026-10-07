"use strict";
class RdRules {
}
RdRules.GAME = "dungeonraid";
RdRules.ROOT = "dungeonraid/rooms";
RdRules.SEATS = 5;
RdRules.SPECTATOR_SLOT = 5;
RdRules.NET_MS = 100;
RdRules.BOT_NAMES = ["AI 기사", "AI 전사", "AI 마법사", "AI 궁수", "AI 사제"];
class RdUnits {
    static toWorld(units) {
        return units / RdUnits.PER_METER;
    }
    static toUnits(meters) {
        return meters * RdUnits.PER_METER;
    }
}
RdUnits.PER_METER = 100;
class RdMath {
    static clamp(value, low, high) {
        return value < low ? low : value > high ? high : value;
    }
    static distance(ax, az, bx, bz) {
        return Math.hypot(ax - bx, az - bz);
    }
    static yawOf(dx, dz) {
        return Math.atan2(dx, dz);
    }
    static angleDiff(a, b) {
        let difference = a - b;
        while (difference > Math.PI)
            difference -= Math.PI * 2;
        while (difference < -Math.PI)
            difference += Math.PI * 2;
        return difference;
    }
    static normalize(x, z) {
        const length = Math.hypot(x, z);
        return length > 1e-6 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
    }
    static finite(value) {
        return typeof value === "number" && isFinite(value);
    }
}
class RdRandom {
    constructor(source) {
        this.source = source;
    }
    next() {
        return this.source();
    }
    range(low, high) {
        return low + (high - low) * this.source();
    }
    int(count) {
        return Math.min(count - 1, Math.floor(this.source() * count));
    }
    pick(list) {
        return list[this.int(list.length)];
    }
    shuffle(list) {
        const copy = list.slice();
        for (let index = copy.length - 1; index > 0; index--) {
            const other = this.int(index + 1);
            const keep = copy[index];
            copy[index] = copy[other];
            copy[other] = keep;
        }
        return copy;
    }
}
class RdShapes {
    static contains(shape, x, z, radius) {
        return RdShapes.TESTS[shape.kind](shape, x, z, radius);
    }
    static checkerCellRed(shape, x, z) {
        if (x < shape.x || z < shape.z || x > shape.x + shape.w || z > shape.z + shape.h)
            return false;
        const column = Math.floor((x - shape.x) / shape.cell), row = Math.floor((z - shape.z) / shape.cell);
        return (column + row) % 2 === shape.parity;
    }
    static checkerCells(shape) {
        const cells = [];
        const columns = Math.round(shape.w / shape.cell), rows = Math.round(shape.h / shape.cell);
        for (let column = 0; column < columns; column++) {
            for (let row = 0; row < rows; row++) {
                if ((column + row) % 2 !== shape.parity)
                    continue;
                const minX = shape.x + column * shape.cell, minZ = shape.z + row * shape.cell;
                cells.push({ minX, maxX: minX + shape.cell, minZ, maxZ: minZ + shape.cell });
            }
        }
        return cells;
    }
    static chordThrough(rect, point, dir, width) {
        const sx = Math.sin(dir), sz = Math.cos(dir);
        const exit = (dirX, dirZ) => {
            let best = Infinity;
            if (dirX > 1e-6)
                best = Math.min(best, (rect.maxX - point.x) / dirX);
            if (dirX < -1e-6)
                best = Math.min(best, (rect.minX - point.x) / dirX);
            if (dirZ > 1e-6)
                best = Math.min(best, (rect.maxZ - point.z) / dirZ);
            if (dirZ < -1e-6)
                best = Math.min(best, (rect.minZ - point.z) / dirZ);
            return isFinite(best) ? Math.max(0, best) : 0;
        };
        const back = exit(-sx, -sz), forward = exit(sx, sz);
        return { kind: "line", x: point.x - sx * back, z: point.z - sz * back, dir, length: back + forward, width };
    }
}
RdShapes.TESTS = {
    circle: (shape, x, z, radius) => Math.hypot(x - shape.x, z - shape.z) <= shape.r + radius,
    cone: (shape, x, z, radius) => {
        const dx = x - shape.x, dz = z - shape.z;
        const distance = Math.hypot(dx, dz);
        if (distance > shape.r + radius)
            return false;
        if (distance <= radius)
            return true;
        const offset = Math.abs(RdMath.angleDiff(RdMath.yawOf(dx, dz), shape.dir));
        const slack = Math.asin(Math.min(1, radius / distance));
        return offset <= shape.arc / 2 + slack;
    },
    line: (shape, x, z, radius) => {
        const dx = x - shape.x, dz = z - shape.z;
        const sx = Math.sin(shape.dir), sz = Math.cos(shape.dir);
        const along = dx * sx + dz * sz;
        const across = Math.abs(dx * sz - dz * sx);
        return along >= -radius && along <= shape.length + radius && across <= shape.width / 2 + radius;
    },
    checker: (shape, x, z, radius) => [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]].some((offset) => RdShapes.checkerCellRed(shape, x + offset[0], z + offset[1])),
    quadrants: (shape, x, z, radius) => {
        const dx = x - shape.x, dz = z - shape.z;
        if (Math.hypot(dx, dz) > shape.r + radius)
            return false;
        const sx = Math.sin(shape.dir), sz = Math.cos(shape.dir);
        const along = Math.abs(dx * sx + dz * sz);
        const across = Math.abs(dx * sz - dz * sx);
        const half = shape.gap / 2;
        return along > half - radius && across > half - radius;
    }
};
class RdBalance {
    static heroSpec(slot) {
        return RdBalance.HEROES[slot];
    }
    static statCard(key) {
        return RdBalance.STAT_CARDS.filter((card) => card.key === key)[0];
    }
}
RdBalance.HERO_RADIUS = 50;
RdBalance.COOLDOWN_FLOOR_RATIO = 0.4;
RdBalance.MOVE_BONUS_CAP = 0.3;
RdBalance.TUTORIAL_ENEMY_ATTACK = 0.8;
RdBalance.MELEE_SLOTS_PER_HERO = 3;
RdBalance.MELEE_WINDUP = 0.32;
RdBalance.RANGED_WINDUP = 0.45;
RdBalance.SKELETON_BOLT_SPEED = 900;
RdBalance.ORB_SPEED = 1500;
RdBalance.ARROW_SPEED = 2400;
RdBalance.CHEST_HP = 60;
RdBalance.CHEST_RADIUS = 60;
RdBalance.DUMMY_RADIUS = 55;
RdBalance.SPAR_DAMAGE = 5;
RdBalance.SPAR_INTERVAL = 2.5;
RdBalance.SPAR_RANGE = 350;
RdBalance.PICK_SECONDS = 12;
RdBalance.READY_COUNTDOWN = 3;
RdBalance.AREA_TICK = 0.5;
RdBalance.SLOW_FACTOR = 0.6;
RdBalance.HEROES = [
    { job: "knight", name: "탱커", model: "Knight", lookType: 0, hp: 360, attack: 14, interval: 1.0, range: 200, arc: Math.PI / 2, speed: 450, style: "slash", skills: ["taunt"], color: "#5B8DEF", icon: "탱", role: "적을 끌어모아 동료를 지켜요" },
    { job: "barbarian", name: "바바리안", model: "Barbarian", lookType: 1, hp: 240, attack: 30, interval: 1.1, range: 240, arc: Math.PI * 2 / 3, speed: 500, style: "cleave", skills: ["charge"], color: "#E5604D", icon: "바", role: "몰린 적을 한 번에 베어요" },
    { job: "mage", name: "메이지", model: "Mage", lookType: 2, hp: 150, attack: 24, interval: 1.2, range: 900, arc: 0, speed: 460, style: "orb", skills: ["fireball"], color: "#A46BE8", icon: "마", role: "멀리서 큰 폭발을 터뜨려요" },
    { job: "ranger", name: "레인저", model: "Ranger", lookType: 3, hp: 170, attack: 20, interval: 0.8, range: 1100, arc: 0, speed: 500, style: "arrow", skills: ["dash"], color: "#4FBF7A", icon: "레", role: "빠르게 활을 쏘고 대쉬로 피해요" },
    { job: "priest", name: "힐러", model: "Rogue_Hooded", lookType: 5, hp: 190, attack: 12, interval: 1.0, range: 800, arc: 0, speed: 480, style: "beam", skills: ["heal"], color: "#F2C14E", icon: "힐", role: "다친 동료를 회복해요" }
];
RdBalance.SKILLS = {
    taunt: { key: "taunt", name: "도발", cooldown: 10, summary: "주변 적이 나를 공격" },
    charge: { key: "charge", name: "돌진", cooldown: 8, summary: "앞으로 돌진해 기절" },
    fireball: { key: "fireball", name: "화염 폭발", cooldown: 7, summary: "적이 몰린 곳에 폭발" },
    dash: { key: "dash", name: "대쉬", cooldown: 6, summary: "무적 순간 대쉬, 다음 화살 강화" },
    heal: { key: "heal", name: "치유", cooldown: 8, summary: "가장 다친 동료 회복" }
};
RdBalance.TAUNT = { radius: 800, mobSeconds: 4, bossSeconds: 2 };
RdBalance.CHARGE = { distance: 600, seconds: 0.3, factor: 1.2, stunSeconds: 1.5, splash: 200 };
RdBalance.FIREBALL = { range: 1000, radius: 300, delay: 0.8, factor: 3.0 };
RdBalance.DASH = { distance: 520, seconds: 0.14, invulnerableSeconds: 0.3, empowerSeconds: 6, factor: 1.5 };
RdBalance.HEAL = { range: 1000, ratio: 0.35 };
RdBalance.MOBS = {
    minion: { kind: "minion", name: "미니언", model: "Skeleton_Minion", hp: 40, attack: 6, interval: 1.0, range: 150, speed: 420, radius: 40, ranged: false, spawn: "ground" },
    warrior: { kind: "warrior", name: "전사", model: "Skeleton_Warrior", hp: 300, attack: 18, interval: 1.4, range: 200, speed: 320, radius: 50, ranged: false, spawn: "door" },
    rogue: { kind: "rogue", name: "로그", model: "Skeleton_Rogue", hp: 110, attack: 32, interval: 1.1, range: 160, speed: 540, radius: 50, ranged: false, spawn: "door" },
    mage: { kind: "mage", name: "메이지", model: "Skeleton_Mage", hp: 90, attack: 18, interval: 2.0, range: 900, speed: 300, radius: 50, ranged: true, spawn: "ground" }
};
RdBalance.GIANT = {
    name: "거대 워리어", hp: 8000, speed: 300, radius: 160,
    slam: { radius: 460, arc: Math.PI * 0.53, telegraph: 0.8, damage: 75, cooldown: 3 },
    leap: { radius: 360, telegraph: 1.4, damage: 115, cooldown: 12 },
    rush: { length: 1300, width: 300, telegraph: 1.2, damage: 95, cooldown: 18, wallStun: 2, wallBonus: 0.25, speed: 2400 },
    quake: { radius: 950, gap: 260, telegraph: 1.6, damage: 70, push: 420, cooldown: 20, firstDelay: 12 },
    summons: [0.7, 0.4]
};
RdBalance.ARCHMAGE = {
    name: "해골 대마법사", hp: 10000, speed: 260, radius: 160, range: 1400,
    bolt: { damage: 40, cooldown: 2, speed: 1100 },
    circles: { cooldown: 10, radius: 340, telegraph: 2, active: 6, dps: 40 },
    meteor: { cooldown: 16, enragedCooldown: 12, radius: 560, cast: 3.0, damage: 150, stun: 2, spread: 900 },
    barrier: { lines: 4, width: 130, telegraph: 1.8, damage: 70, cooldown: 13, firstDelay: 10 }
};
RdBalance.LORD = {
    name: "해골 군주", hp: 16000, speed: 300, radius: 200,
    sweep: { radius: 570, arc: Math.PI * 0.7, telegraph: 0.8, damage: 90, cooldown: 3.2 },
    leap: { radius: 400, telegraph: 1.6, damage: 150, cooldown: 14 },
    quake: { radius: 1050, gap: 260, telegraph: 1.6, damage: 60, push: 450, cooldown: 20, firstDelay: 12 },
    stomp: { ratio: 0.75, cell: 400, telegraph: 2.6, damage: 70, airborne: 1.1, cooldown: 22 },
    summons: [0.85, 0.6, 0.35],
    mechanics: [
        { ratio: 0.75, kinds: ["zones"] },
        { ratio: 0.5, kinds: ["pillars"] },
        { ratio: 0.25, kinds: ["zones", "pillars"] }
    ]
};
RdBalance.SAFE_ZONE = { radius: 150, ring: 1100, seconds: 8, stunSeconds: 6, vulnerableSeconds: 8, vulnerableBonus: 0.3, failRatio: 0.6 };
RdBalance.PILLARS = { ring: 1300, hp: 250, radius: 70, window: 8, limit: 30, failRatio: 0.8 };
RdBalance.MECHANIC_GAP = 2;
RdBalance.STAT_CARDS = [
    { key: "atk", name: "공격력", values: [0.10, 0.12, 0.15], percent: true },
    { key: "hp", name: "최대 체력", values: [0.12, 0.15, 0.18], percent: true },
    { key: "aspd", name: "공격 속도", values: [0.08, 0.10, 0.12], percent: true },
    { key: "move", name: "이동 속도", values: [0.06, 0.08, 0.10], percent: true },
    { key: "cdr", name: "쿨타임 감소", values: [1.0, 1.0, 1.5], percent: false }
];
RdBalance.GEAR_SLOTS = ["weapon", "armor", "boots"];
RdBalance.GEAR_NAMES = { weapon: "무기", armor: "방어구", boots: "신발" };
RdBalance.GEAR = {
    weapon: [{ atk: 0.08, cdr: 0.5, hp: 0, move: 0 }, { atk: 0.16, cdr: 1.0, hp: 0, move: 0 }, { atk: 0.28, cdr: 1.5, hp: 0, move: 0 }],
    armor: [{ atk: 0, cdr: 0, hp: 0.10, move: 0 }, { atk: 0, cdr: 0, hp: 0.20, move: 0 }, { atk: 0, cdr: 0, hp: 0.35, move: 0 }],
    boots: [{ atk: 0, cdr: 0, hp: 0, move: 0.04 }, { atk: 0, cdr: 0, hp: 0, move: 0.08 }, { atk: 0, cdr: 0, hp: 0, move: 0.12 }]
};
RdBalance.TIER_WEIGHTS = [0.5, 0.4, 0.1];
RdBalance.TIER_NAMES = ["일반", "희귀", "전설"];
RdBalance.TIER_COLORS = ["#B8BEC9", "#5B9BFF", "#F08A3E"];
class RdMapData {
    static obstacleOverlaps(obstacle, x, z, radius) {
        const dx = x - obstacle.x, dz = z - obstacle.z;
        const cos = Math.cos(obstacle.turn), sin = Math.sin(obstacle.turn);
        const localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos;
        const nearX = RdMath.clamp(localX, -obstacle.halfX, obstacle.halfX), nearZ = RdMath.clamp(localZ, -obstacle.halfZ, obstacle.halfZ);
        return Math.hypot(localX - nearX, localZ - nearZ) < radius;
    }
    static blocked(x, z, radius) {
        return RdMapData.OBSTACLES.some((obstacle) => RdMapData.obstacleOverlaps(obstacle, x, z, radius));
    }
    static doorStart(door, radius) {
        return { x: door.x + door.inX * (radius + 2), z: door.z + door.inZ * (radius + 2) };
    }
}
RdMapData.HALL = { minX: -1800, maxX: 1800, minZ: -1400, maxZ: 1400 };
RdMapData.VAULT = { minX: 1800, maxX: 3000, minZ: -800, maxZ: 800 };
RdMapData.VAULT_PASSAGE = { minX: 1700, maxX: 1900, minZ: -200, maxZ: 200 };
RdMapData.CENTER = { x: 0, z: 0 };
RdMapData.BOSS_GATE = { x: 0, z: -1400, inX: 0, inZ: 1 };
RdMapData.BOSS_GATE_WALK = 500;
RdMapData.DOOR_WALK = 300;
RdMapData.DOORS = [
    { x: -1800, z: -800, inX: 1, inZ: 0 }, { x: -1800, z: 800, inX: 1, inZ: 0 },
    { x: 1800, z: -1200, inX: -1, inZ: 0 }, { x: 1800, z: 1200, inX: -1, inZ: 0 },
    { x: -1200, z: -1400, inX: 0, inZ: 1 }, { x: 1200, z: -1400, inX: 0, inZ: 1 },
    { x: -800, z: 1400, inX: 0, inZ: -1 }, { x: 800, z: 1400, inX: 0, inZ: -1 }
];
RdMapData.GROUND_SPOTS = [
    { x: -1200, z: -800 }, { x: 400, z: -900 }, { x: 1300, z: 0 }, { x: -300, z: 500 },
    { x: 1200, z: -800 }, { x: -1300, z: 0 }, { x: 600, z: -200 }, { x: -1100, z: 700 },
    { x: -400, z: -900 }, { x: 1100, z: 700 }, { x: -600, z: -200 }, { x: 300, z: 500 }
];
RdMapData.HERO_STARTS = [
    { x: 0, z: 900 }, { x: -250, z: 1050 }, { x: 250, z: 1050 }, { x: -500, z: 1150 }, { x: 500, z: 1150 }
];
RdMapData.HALL_READY = { x: -1420, z: -1020, r: 220 };
RdMapData.VAULT_READY = { x: 2740, z: -440, r: 220 };
RdMapData.CHEST_SPOTS = [
    { x: 2250, z: -440 }, { x: 2450, z: -220 }, { x: 2250, z: 0 }, { x: 2450, z: 220 }, { x: 2250, z: 440 }
];
RdMapData.DUMMY_SPOTS = [{ x: -700, z: -350 }, { x: 0, z: -550 }, { x: 700, z: -350 }];
RdMapData.BOSS_HOME = { x: 0, z: -700 };
RdMapData.OBSTACLES = [
    { prop: "rubble", x: -1640, z: -1250, turn: 0.4, scale: 0.6, halfX: 210, halfZ: 85 },
    { prop: "rubble", x: 1690, z: 650, turn: Math.PI / 2, scale: 0.6, halfX: 210, halfZ: 85 },
    { prop: "barrel", x: -1680, z: 1250, turn: 0, scale: 1, halfX: 80, halfZ: 80 },
    { prop: "box", x: 1690, z: -950, turn: 0.3, scale: 1, halfX: 72, halfZ: 72 },
    { prop: "barrel", x: 2900, z: 700, turn: 0.7, scale: 1, halfX: 80, halfZ: 80 },
    { prop: "box", x: 2900, z: -700, turn: 0.2, scale: 1, halfX: 72, halfZ: 72 }
];
class RdFloorPlan {
    static spec(floor) {
        return RdFloorPlan.FLOORS[RdMath.clamp(floor, 1, RdFloorPlan.LAST_FLOOR) - 1];
    }
    static clearSubtitle(floor) {
        const spec = RdFloorPlan.spec(floor);
        return floor >= 2 && floor <= 4 ? spec.clearSub + "\n" + RdFloorPlan.REVIVE_LINE : spec.clearSub;
    }
    static hasReward(floor) {
        return floor >= 2 && floor <= 4;
    }
}
RdFloorPlan.REVIVE_LINE = "쓰러진 동료가 다시 일어난다";
RdFloorPlan.REWARD_TARGET = 40;
RdFloorPlan.FLOORS = [
    { floor: 1, kind: "ready", boss: null, theme: "#5B8DEF", label: "1층 집결의 방", startTitle: "1층 · 집결의 방", startSub: "스킬을 시험해 보고 준비 구역에 모이세요", clearTitle: "", clearSub: "모두 모였다! 던전으로 내려간다", targetSeconds: 0 },
    { floor: 2, kind: "wave", boss: null, theme: "#7FA35A", label: "2층 병사 웨이브", startTitle: "2층 · 깨어나는 병사들", startSub: "해골 병사들이 몰려온다. 각자의 역할을 지켜라", clearTitle: "2층 돌파!", clearSub: "병사들을 모두 쓰러뜨렸다", targetSeconds: 80 },
    { floor: 3, kind: "boss", boss: "giant", theme: "#D9534F", label: "3층 거대 워리어", startTitle: "3층 · 거대 워리어의 전당", startSub: "붉은 예고 범위를 보고 피하라", clearTitle: "거대 워리어 처치!", clearSub: "첫 번째 관문을 넘었다", targetSeconds: 80 },
    { floor: 4, kind: "boss", boss: "archmage", theme: "#9B6BE8", label: "4층 마법사", startTitle: "4층 · 마법사의 심판", startSub: "메테오가 떨어진다. 흩어져라", clearTitle: "마법사 처치!", clearSub: "마지막 문이 열린다", targetSeconds: 90 },
    { floor: 5, kind: "boss", boss: "lord", theme: "#E0B341", label: "5층 해골 군주", startTitle: "5층 · 해골 군주의 왕좌", startSub: "모두의 호흡이 하나가 되어야 한다", clearTitle: "던전 클리어!", clearSub: "해골 군주가 무너졌다", targetSeconds: 190 }
];
RdFloorPlan.LAST_FLOOR = 5;
class RdWavePlan {
}
RdWavePlan.INTERVAL = 10;
RdWavePlan.WAVES = [
    { minionPairs: 1, warriors: 1, rogues: 1, mages: 0 },
    { minionPairs: 1, warriors: 1, rogues: 0, mages: 1 },
    { minionPairs: 1, warriors: 0, rogues: 1, mages: 1 },
    { minionPairs: 1, warriors: 1, rogues: 1, mages: 1 },
    { minionPairs: 3, warriors: 1, rogues: 1, mages: 1 }
];
RdWavePlan.ROLE_HINT = "탱커는 도발로 적을 끌고, 딜러는 처치하고, 힐러는 동료를 살려요!";
RdWavePlan.ROLE_HINT_SECONDS = 2;
class RdHeroStats {
    constructor(spec) {
        this.spec = spec;
        this.cards = { atk: 0, hp: 0, aspd: 0, move: 0, cdr: 0 };
        this.gear = [-1, -1, -1];
    }
    gearSum(field) {
        let sum = 0;
        RdBalance.GEAR_SLOTS.forEach((slot, index) => {
            const tier = this.gear[index];
            if (tier >= 0)
                sum += RdBalance.GEAR[slot][tier][field];
        });
        return sum;
    }
    attack() {
        return this.spec.attack * (1 + this.cards.atk + this.gearSum("atk"));
    }
    maxHp() {
        return Math.round(this.spec.hp * (1 + this.cards.hp + this.gearSum("hp")));
    }
    interval() {
        return this.spec.interval / (1 + this.cards.aspd);
    }
    speed() {
        return this.spec.speed * (1 + Math.min(RdBalance.MOVE_BONUS_CAP, this.cards.move + this.gearSum("move")));
    }
    cooldown(base) {
        return Math.max(base * RdBalance.COOLDOWN_FLOOR_RATIO, base - (this.cards.cdr + this.gearSum("cdr")));
    }
    addCard(key, tierIndex) {
        this.cards[key] += RdBalance.statCard(key).values[RdMath.clamp(tierIndex, 0, 2)];
    }
    equip(card) {
        this.gear[RdBalance.GEAR_SLOTS.indexOf(card.slot)] = card.tier;
    }
}
class RdRewardRules {
    static drawStatCards(random) {
        return random.shuffle(RdBalance.STAT_CARDS.map((card) => card.key)).slice(0, 3);
    }
    static drawTier(random) {
        const roll = random.next();
        let total = 0;
        for (let tier = 0; tier < RdBalance.TIER_WEIGHTS.length; tier++) {
            total += RdBalance.TIER_WEIGHTS[tier];
            if (roll < total)
                return tier;
        }
        return RdBalance.TIER_WEIGHTS.length - 1;
    }
    static drawGearCards(random) {
        const cards = [];
        for (let index = 0; index < 3; index++)
            cards.push({ slot: random.pick(RdBalance.GEAR_SLOTS), tier: RdRewardRules.drawTier(random) });
        return cards;
    }
    static currentTier(gear, slot) {
        return gear[RdBalance.GEAR_SLOTS.indexOf(slot)];
    }
    static canEquip(gear, card) {
        const current = RdRewardRules.currentTier(gear, card.slot);
        return current < 0 || card.tier > current;
    }
    static blockedReason(gear, card) {
        if (RdRewardRules.canEquip(gear, card))
            return "";
        const current = RdRewardRules.currentTier(gear, card.slot);
        return "이미 " + RdBalance.TIER_NAMES[current] + " " + RdBalance.GEAR_NAMES[card.slot] + "을(를) 끼고 있어요 (더 높은 등급만)";
    }
    static floorTier(floor) {
        return RdMath.clamp(floor - 2, 0, 2);
    }
    static statText(key, tierIndex) {
        const card = RdBalance.statCard(key);
        const value = card.values[RdMath.clamp(tierIndex, 0, 2)];
        return card.percent ? card.name + " +" + Math.round(value * 100) + "%" : card.name + " -" + value.toFixed(1) + "초";
    }
    static gearParts(slot, tier) {
        if (tier < 0)
            return "없음";
        const spec = RdBalance.GEAR[slot][tier];
        if (slot === "weapon")
            return "공격력 +" + Math.round(spec.atk * 100) + "%, 쿨타임 -" + spec.cdr.toFixed(1) + "초";
        if (slot === "armor")
            return "최대 체력 +" + Math.round(spec.hp * 100) + "%";
        return "이동속도 +" + Math.round(spec.move * 100) + "%";
    }
    static gearChangeText(gear, card) {
        const current = RdRewardRules.currentTier(gear, card.slot);
        const next = RdRewardRules.gearParts(card.slot, card.tier);
        return current < 0 ? next : RdRewardRules.gearParts(card.slot, current) + " → " + next;
    }
}
class RdCollisionWorld {
    constructor() {
        this.vaultOpen = false;
        this.bodies = [];
    }
    regionContains(x, z, radius) {
        if (!RdMath.finite(x) || !RdMath.finite(z))
            return false;
        if (RdMapData.blocked(x, z, radius))
            return false;
        if (RdCollisionWorld.inside(RdMapData.HALL, x, z, radius))
            return true;
        if (!this.vaultOpen)
            return false;
        return RdCollisionWorld.inside(RdMapData.VAULT_PASSAGE, x, z, radius) || RdCollisionWorld.inside(RdMapData.VAULT, x, z, radius);
    }
    static inside(rect, x, z, radius) {
        return x - radius >= rect.minX && x + radius <= rect.maxX && z - radius >= rect.minZ && z + radius <= rect.maxZ;
    }
    penetration(x, z, radius, other) {
        return Math.max(0, radius + other.radius - Math.hypot(x - other.x, z - other.z));
    }
    move(body, dx, dz) {
        const length = Math.hypot(dx, dz);
        const limit = Math.max(10, body.radius * 0.8);
        if (length > limit) {
            const pieces = Math.ceil(length / limit);
            let moved = false, blocked = false;
            for (let piece = 0; piece < pieces; piece++) {
                const result = this.moveStep(body, dx / pieces, dz / pieces);
                moved = moved || result.moved;
                blocked = blocked || result.blockedByWall;
                if (!result.moved)
                    break;
            }
            return { moved, blockedByWall: blocked };
        }
        return this.moveStep(body, dx, dz);
    }
    moveStep(body, dx, dz) {
        const blockedByWall = !this.regionContains(body.x + dx, body.z + dz, body.radius);
        if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6)
            return { moved: false, blockedByWall: false };
        const others = this.bodies.filter((other) => other !== body && other.id !== body.id);
        const before = others.map((other) => this.penetration(body.x, body.z, body.radius, other));
        const tries = [[dx, dz], [dx, 0], [0, dz]];
        for (const attempt of tries) {
            if (Math.abs(attempt[0]) < 1e-6 && Math.abs(attempt[1]) < 1e-6)
                continue;
            let nx = body.x + attempt[0], nz = body.z + attempt[1];
            for (let pass = 0; pass < 3; pass++) {
                others.forEach((other, index) => {
                    const ox = nx - other.x, oz = nz - other.z;
                    const distance = Math.hypot(ox, oz);
                    const allowed = body.radius + other.radius - before[index];
                    if (distance >= allowed - 0.01 || distance < 1e-3)
                        return;
                    const push = allowed - distance;
                    nx += (ox / distance) * push;
                    nz += (oz / distance) * push;
                });
            }
            if (!this.regionContains(nx, nz, body.radius))
                continue;
            if (others.some((other, index) => this.penetration(nx, nz, body.radius, other) > (before[index] > 0 ? before[index] + 1e-6 : 0.02)))
                continue;
            const moved = Math.hypot(nx - body.x, nz - body.z) > 0.01;
            body.x = nx;
            body.z = nz;
            return { moved, blockedByWall };
        }
        return { moved: false, blockedByWall };
    }
    isFree(x, z, radius, ignoreId) {
        if (!this.regionContains(x, z, radius))
            return false;
        return !this.bodies.some((other) => other.id !== ignoreId && Math.hypot(x - other.x, z - other.z) < radius + other.radius + 2);
    }
    freeSpotNear(x, z, radius, ignoreId) {
        if (this.isFree(x, z, radius, ignoreId))
            return { x, z };
        for (let ring = 1; ring <= 20; ring++) {
            const distance = ring * 50;
            const steps = 8 + ring * 4;
            for (let step = 0; step < steps; step++) {
                const angle = (step / steps) * Math.PI * 2;
                const px = x + Math.sin(angle) * distance, pz = z + Math.cos(angle) * distance;
                if (this.isFree(px, pz, radius, ignoreId))
                    return { x: px, z: pz };
            }
        }
        return { x, z };
    }
    wallDistance(x, z, dirX, dirZ, maxDistance, radius) {
        const step = 20;
        for (let travelled = step; travelled <= maxDistance; travelled += step) {
            if (!this.regionContains(x + dirX * travelled, z + dirZ * travelled, radius))
                return travelled - step;
        }
        return maxDistance;
    }
}
class RdUnit {
    constructor(id, radius, maxHp) {
        this.id = id;
        this.radius = radius;
        this.x = 0;
        this.z = 0;
        this.yaw = 0;
        this.stunUntil = 0;
        this.invulnerableUntil = 0;
        this.hp = maxHp;
        this.maxHp = maxHp;
    }
    isStunned(time) {
        return time < this.stunUntil;
    }
    place(x, z) {
        this.x = x;
        this.z = z;
    }
    distanceTo(other) {
        return Math.hypot(this.x - other.x, this.z - other.z);
    }
    faceToward(x, z) {
        if (Math.hypot(x - this.x, z - this.z) > 1)
            this.yaw = RdMath.yawOf(x - this.x, z - this.z);
    }
}
class RdIntents {
    static idle() {
        return { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, attack: false, focus: -1, skills: [0, 0, 0] };
    }
}
class RdHero extends RdUnit {
    constructor(slot, pilot) {
        super(slot + 1, RdBalance.HERO_RADIUS, RdBalance.heroSpec(slot).hp);
        this.slot = slot;
        this.pilot = pilot;
        this.down = false;
        this.gone = false;
        this.moving = false;
        this.dash = null;
        this.attackReadyAt = 0;
        this.faceUntil = 0;
        this.empoweredUntil = 0;
        this.slowUntil = 0;
        this.airborneUntil = 0;
        this.intent = RdIntents.idle();
        this.damageDone = 0;
        this.healingDone = 0;
        this.damageTaken = 0;
        this.downs = 0;
        this.heroClass = RdHeroClasses.create(slot);
        this.stats = new RdHeroStats(this.heroClass.spec);
        this.skillReadyAt = this.heroClass.skills.map(() => 0);
        this.seenSkillSeq = this.heroClass.skills.map(() => 0);
    }
    get spec() {
        return this.heroClass.spec;
    }
    get alive() {
        return !this.down && !this.gone;
    }
    speedNow(time) {
        return this.stats.speed() * (time < this.slowUntil ? RdBalance.SLOW_FACTOR : 1);
    }
    skillCooldown(index) {
        return this.stats.cooldown(this.heroClass.skills[index].spec.cooldown);
    }
    refreshMaxHp() {
        const next = this.stats.maxHp();
        if (next > this.maxHp && this.alive)
            this.hp += next - this.maxHp;
        this.maxHp = next;
        this.hp = Math.min(this.hp, this.maxHp);
    }
    reviveFull() {
        if (this.gone)
            return;
        this.down = false;
        this.maxHp = this.stats.maxHp();
        this.hp = this.maxHp;
        this.stunUntil = 0;
        this.slowUntil = 0;
        this.airborneUntil = 0;
        this.dash = null;
    }
}
class RdHeroMover {
    static step(hero, intent, dt, world, time) {
        if (!hero.alive) {
            hero.moving = false;
            hero.dash = null;
            return;
        }
        if (hero.dash) {
            RdHeroMover.stepDash(hero, hero.dash, dt, world);
            return;
        }
        if (hero.isStunned(time)) {
            hero.moving = false;
            return;
        }
        const direction = RdMath.normalize(intent.moveX, intent.moveZ);
        const strength = Math.min(1, Math.hypot(intent.moveX, intent.moveZ));
        hero.moving = strength > 0.05;
        if (hero.moving) {
            const speed = hero.speedNow(time) * strength;
            world.move(hero, direction.x * speed * dt, direction.z * speed * dt);
        }
        const aimLength = Math.hypot(intent.aimX, intent.aimZ);
        if (time < hero.faceUntil && aimLength > 0.05)
            hero.yaw = RdMath.yawOf(intent.aimX, intent.aimZ);
        else if (hero.moving)
            hero.yaw = RdMath.yawOf(direction.x, direction.z);
    }
    static stepDash(hero, dash, dt, world) {
        const step = Math.min(dash.left, dash.speed * dt);
        const result = world.move(hero, dash.dirX * step, dash.dirZ * step);
        dash.left -= step;
        hero.moving = true;
        if (dash.kind !== "knock")
            hero.yaw = RdMath.yawOf(dash.dirX, dash.dirZ);
        if (!result.moved || dash.left <= 0.5)
            hero.dash = null;
    }
}
class RdTargeting {
    static bestBlast(points, fromX, fromZ, range, radius) {
        let best = null;
        let bestCount = 0;
        let bestDistance = Infinity;
        points.forEach((candidate) => {
            const distance = Math.hypot(candidate.x - fromX, candidate.z - fromZ);
            if (distance > range)
                return;
            const count = points.filter((other) => Math.hypot(other.x - candidate.x, other.z - candidate.z) <= radius).length;
            if (count > bestCount || (count === bestCount && distance < bestDistance)) {
                best = candidate;
                bestCount = count;
                bestDistance = distance;
            }
        });
        return best;
    }
    static lowestAlly(heroes, healer, range) {
        let best = null;
        let bestRatio = 1;
        heroes.forEach((hero) => {
            if (!hero.alive || hero.distanceTo(healer) > range)
                return;
            const ratio = hero.hp / hero.maxHp;
            if (ratio < bestRatio - 1e-9) {
                best = hero;
                bestRatio = ratio;
            }
        });
        return best;
    }
    static meteorTargets(heroes, bossX, bossZ, range, radius, count, spread) {
        const candidates = heroes.slice();
        for (let first = 0; first < heroes.length; first++) {
            for (let second = first + 1; second < heroes.length; second++) {
                candidates.push({ x: (heroes[first].x + heroes[second].x) / 2, z: (heroes[first].z + heroes[second].z) / 2 });
            }
        }
        const scored = candidates
            .filter((point) => Math.hypot(point.x - bossX, point.z - bossZ) <= range)
            .map((point) => ({ point, score: heroes.filter((hero) => Math.hypot(hero.x - point.x, hero.z - point.z) <= radius).length, distance: Math.hypot(point.x - bossX, point.z - bossZ) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || a.distance - b.distance);
        const chosen = [];
        for (const entry of scored) {
            if (chosen.length >= count)
                break;
            if (chosen.every((point) => Math.hypot(point.x - entry.point.x, point.z - entry.point.z) >= spread))
                chosen.push(entry.point);
        }
        return chosen;
    }
}
class RdSkill {
    constructor(key) {
        this.key = key;
    }
    get spec() {
        return RdBalance.SKILLS[this.key];
    }
    motion(hero, intent, targets) {
        return null;
    }
}
class RdMeleeAim {
    static direction(hero, intent, targets, reach) {
        const aim = RdMath.normalize(intent.aimX, intent.aimZ);
        const facing = aim.x || aim.z ? aim : { x: Math.sin(hero.yaw), z: Math.cos(hero.yaw) };
        const facingYaw = RdMath.yawOf(facing.x, facing.z);
        const inReach = targets.filter((target) => hero.distanceTo(target) - target.radius <= reach + RdMeleeAim.REACH_BONUS);
        if (!inReach.length)
            return facing;
        const offOf = (target) => Math.abs(RdMath.angleDiff(RdMath.yawOf(target.x - hero.x, target.z - hero.z), facingYaw));
        const ahead = inReach.filter((target) => offOf(target) <= RdMeleeAim.CONE).sort((a, b) => offOf(a) - offOf(b) || hero.distanceTo(a) - hero.distanceTo(b));
        const chosen = ahead[0];
        if (!chosen)
            return facing;
        const direction = RdMath.normalize(chosen.x - hero.x, chosen.z - hero.z);
        return direction.x || direction.z ? direction : facing;
    }
}
RdMeleeAim.CONE = Math.PI / 3;
RdMeleeAim.REACH_BONUS = 200;
class RdTauntSkill extends RdSkill {
    constructor() {
        super("taunt");
    }
    cast(engine, hero) {
        engine.foes.forEach((foe) => {
            if (foe instanceof RdEnemy && foe.hp > 0 && !foe.spawning(engine.time) && foe.distanceTo(hero) <= RdBalance.TAUNT.radius)
                foe.taunt(hero, engine.time);
        });
        engine.emit({ t: "fx", k: "taunt", x: hero.x, z: hero.z, r: RdBalance.TAUNT.radius, id: hero.id, d: 0 });
        return true;
    }
}
class RdChargeSkill extends RdSkill {
    constructor() {
        super("charge");
    }
    static direction(hero, intent, targets) {
        return RdMeleeAim.direction(hero, intent, targets, RdBalance.CHARGE.distance);
    }
    motion(hero, intent, targets) {
        const direction = RdChargeSkill.direction(hero, intent, targets);
        return { dirX: direction.x, dirZ: direction.z, speed: RdBalance.CHARGE.distance / RdBalance.CHARGE.seconds, left: RdBalance.CHARGE.distance, kind: "charge" };
    }
    cast(engine, hero, intent) {
        const direction = RdChargeSkill.direction(hero, intent, engine.hittableFoes(hero));
        const spec = RdBalance.CHARGE;
        const wall = engine.world.wallDistance(hero.x, hero.z, direction.x, direction.z, spec.distance, hero.radius);
        let hitFoe = null;
        let hitAt = wall;
        engine.hittableFoes(hero).forEach((foe) => {
            const ox = foe.x - hero.x, oz = foe.z - hero.z;
            const along = ox * direction.x + oz * direction.z;
            if (along < 0)
                return;
            const across = Math.abs(ox * direction.z - oz * direction.x);
            const reach = foe.radius + hero.radius;
            if (across > reach)
                return;
            const touch = Math.max(0, along - Math.sqrt(Math.max(0, reach * reach - across * across)));
            if (touch < hitAt) {
                hitAt = touch;
                hitFoe = foe;
            }
        });
        hero.yaw = RdMath.yawOf(direction.x, direction.z);
        engine.emit({ t: "fx", k: "charge", x: hero.x, z: hero.z, r: hitAt, id: hero.id, d: hero.yaw });
        const struck = hitFoe;
        if (struck) {
            const delay = Math.min(spec.seconds, hitAt / (spec.distance / spec.seconds));
            const damage = hero.stats.attack() * spec.factor;
            engine.schedule(engine.time + delay, () => {
                if (struck.hp <= 0)
                    return;
                const centerX = struck.x, centerZ = struck.z;
                engine.hittableFoes(hero).forEach((foe) => {
                    if (foe !== struck && Math.hypot(foe.x - centerX, foe.z - centerZ) > spec.splash + foe.radius)
                        return;
                    engine.damageFoe(foe, damage, hero);
                    if (foe instanceof RdEnemy)
                        foe.stun(engine, spec.stunSeconds);
                });
            });
        }
        return true;
    }
}
class RdFireballSkill extends RdSkill {
    constructor() {
        super("fireball");
    }
    cast(engine, hero) {
        const spec = RdBalance.FIREBALL;
        const foes = engine.hittableFoes(hero);
        const point = RdTargeting.bestBlast(foes.map((foe) => ({ x: foe.x, z: foe.z })), hero.x, hero.z, spec.range, spec.radius);
        if (!point)
            return false;
        const target = point;
        hero.faceToward(target.x, target.z);
        const damage = hero.stats.attack() * spec.factor;
        engine.emit({ t: "fx", k: "blast-mark", x: target.x, z: target.z, r: spec.radius, id: hero.id, d: spec.delay });
        engine.schedule(engine.time + spec.delay, () => {
            engine.emit({ t: "fx", k: "blast", x: target.x, z: target.z, r: spec.radius, id: hero.id, d: 0 });
            engine.hittableFoes(hero).forEach((foe) => {
                if (Math.hypot(foe.x - target.x, foe.z - target.z) <= spec.radius + foe.radius * 0.5)
                    engine.damageFoe(foe, damage, hero);
            });
        });
        return true;
    }
}
class RdDashSkill extends RdSkill {
    constructor() {
        super("dash");
    }
    static direction(hero, intent) {
        const move = RdMath.normalize(intent.moveX, intent.moveZ);
        return move.x || move.z ? move : { x: -Math.sin(hero.yaw), z: -Math.cos(hero.yaw) };
    }
    motion(hero, intent) {
        const direction = RdDashSkill.direction(hero, intent);
        return { dirX: direction.x, dirZ: direction.z, speed: RdBalance.DASH.distance / RdBalance.DASH.seconds, left: RdBalance.DASH.distance, kind: "dash" };
    }
    cast(engine, hero, intent) {
        const direction = RdDashSkill.direction(hero, intent);
        hero.invulnerableUntil = engine.time + RdBalance.DASH.invulnerableSeconds;
        hero.empoweredUntil = engine.time + RdBalance.DASH.empowerSeconds;
        const reach = engine.world.wallDistance(hero.x, hero.z, direction.x, direction.z, RdBalance.DASH.distance, hero.radius);
        engine.emit({ t: "fx", k: "dash", x: hero.x, z: hero.z, r: Math.round(reach), id: hero.id, d: RdMath.yawOf(direction.x, direction.z) });
        return true;
    }
}
class RdHealSkill extends RdSkill {
    constructor() {
        super("heal");
    }
    cast(engine, hero) {
        const target = RdTargeting.lowestAlly(engine.heroes, hero, RdBalance.HEAL.range);
        if (!target)
            return false;
        const ally = target;
        engine.healHero(ally, ally.maxHp * RdBalance.HEAL.ratio, hero);
        engine.emit({ t: "fx", k: "heal", x: ally.x, z: ally.z, r: 0, id: ally.id, d: hero.id });
        return true;
    }
}
class RdSkills {
    static create(key) {
        return RdSkills.BUILDERS[key]();
    }
}
RdSkills.BUILDERS = {
    taunt: () => new RdTauntSkill(),
    charge: () => new RdChargeSkill(),
    fireball: () => new RdFireballSkill(),
    dash: () => new RdDashSkill(),
    heal: () => new RdHealSkill()
};
class RdHeroClass {
    constructor(spec) {
        this.spec = spec;
        this.skills = spec.skills.map((key) => RdSkills.create(key));
    }
    get animation() {
        return "attack";
    }
}
class RdMeleeClass extends RdHeroClass {
    constructor(spec, cleave) {
        super(spec);
        this.cleave = cleave;
    }
    strike(engine, hero, target, damage) {
        const dir = RdMath.yawOf(target.x - hero.x, target.z - hero.z);
        engine.emit({ t: "fx", k: "swing", x: hero.x, z: hero.z, r: this.spec.range, id: hero.id, d: dir });
        if (!this.cleave) {
            engine.damageFoe(target, damage, hero);
            return;
        }
        const cone = { kind: "cone", x: hero.x, z: hero.z, r: this.spec.range + hero.radius, dir, arc: this.spec.arc };
        engine.hittableFoes(hero).forEach((foe) => {
            if (foe === target || RdShapes.contains(cone, foe.x, foe.z, foe.radius))
                engine.damageFoe(foe, damage, hero);
        });
    }
}
class RdKnight extends RdMeleeClass {
    constructor() {
        super(RdBalance.HEROES[0], false);
    }
}
class RdBarbarian extends RdMeleeClass {
    constructor() {
        super(RdBalance.HEROES[1], true);
    }
}
class RdCasterClass extends RdHeroClass {
    strike(engine, hero, target, damage) {
        if (this.spec.style === "beam") {
            engine.emit({ t: "fx", k: "beam", x: target.x, z: target.z, r: 0, id: hero.id, d: target.id });
            engine.damageFoe(target, damage, hero);
            return;
        }
        const style = this.spec.style === "arrow" ? "arrow" : "orb";
        engine.launch(style, hero, target, damage, style === "arrow" ? RdBalance.ARROW_SPEED : RdBalance.ORB_SPEED);
    }
    get animation() {
        return "shoot";
    }
}
class RdMage extends RdCasterClass {
    constructor() {
        super(RdBalance.HEROES[2]);
    }
}
class RdRanger extends RdCasterClass {
    constructor() {
        super(RdBalance.HEROES[3]);
    }
}
class RdPriest extends RdCasterClass {
    constructor() {
        super(RdBalance.HEROES[4]);
    }
}
class RdHeroClasses {
    static create(slot) {
        return RdHeroClasses.BUILDERS[slot]();
    }
}
RdHeroClasses.BUILDERS = [() => new RdKnight(), () => new RdBarbarian(), () => new RdMage(), () => new RdRanger(), () => new RdPriest()];
class RdSpawnStyle {
    constructor(kind, duration) {
        this.kind = kind;
        this.duration = duration;
    }
    update(engine, foe, dt, elapsed) {
        return;
    }
    hidden(elapsed) {
        return false;
    }
    get door() {
        return -1;
    }
}
class RdDoorSpawn extends RdSpawnStyle {
    constructor(doorIndex, spec = RdMapData.DOORS[doorIndex], walk = RdMapData.DOOR_WALK, duration = 1.4) {
        super("door", duration);
        this.doorIndex = doorIndex;
        this.spec = spec;
        this.walkDistance = walk;
    }
    get door() {
        return this.doorIndex;
    }
    begin(engine, foe) {
        const start = RdMapData.doorStart(this.spec, foe.radius);
        const spot = engine.world.freeSpotNear(start.x, start.z, foe.radius, foe.id);
        foe.place(spot.x, spot.z);
        foe.yaw = RdMath.yawOf(this.spec.inX, this.spec.inZ);
    }
    update(engine, foe, dt, elapsed) {
        const walkTime = this.walkTime();
        if (elapsed > walkTime) {
            foe.moving = false;
            return;
        }
        const speed = this.walkDistance / walkTime;
        const result = engine.world.move(foe, this.spec.inX * speed * dt, this.spec.inZ * speed * dt);
        foe.moving = result.moved;
    }
    walkTime() {
        return this.duration;
    }
}
class RdGateSpawn extends RdDoorSpawn {
    constructor() {
        super(-1, RdMapData.BOSS_GATE, RdMapData.BOSS_GATE_WALK, RdGateSpawn.WALK_SECONDS + RdGateSpawn.ROAR_SECONDS);
    }
    get door() {
        return 99;
    }
    walkTime() {
        return RdGateSpawn.WALK_SECONDS;
    }
    update(engine, foe, dt, elapsed) {
        const wasWalking = elapsed - dt <= RdGateSpawn.WALK_SECONDS;
        super.update(engine, foe, dt, elapsed);
        if (wasWalking && elapsed > RdGateSpawn.WALK_SECONDS)
            engine.emit({ t: "act", id: foe.id, a: "roar" });
    }
}
RdGateSpawn.WALK_SECONDS = 2.0;
RdGateSpawn.ROAR_SECONDS = 1.2;
class RdGroundSpawn extends RdSpawnStyle {
    constructor(point) {
        super("ground", RdGroundSpawn.CRACK_SECONDS + RdGroundSpawn.RISE_SECONDS);
        this.point = point;
    }
    begin(engine, foe) {
        foe.place(this.point.x, this.point.z);
        foe.yaw = RdMath.yawOf(-this.point.x, -this.point.z);
        engine.emit({ t: "fx", k: "crack", x: this.point.x, z: this.point.z, r: foe.radius * 2.4, id: foe.id, d: RdGroundSpawn.CRACK_SECONDS });
    }
    update(engine, foe, dt, elapsed) {
        if (elapsed - dt < RdGroundSpawn.CRACK_SECONDS && elapsed >= RdGroundSpawn.CRACK_SECONDS) {
            const spot = engine.world.freeSpotNear(foe.x, foe.z, foe.radius, foe.id);
            foe.place(spot.x, spot.z);
        }
    }
    hidden(elapsed) {
        return elapsed < RdGroundSpawn.CRACK_SECONDS;
    }
}
RdGroundSpawn.CRACK_SECONDS = 0.6;
RdGroundSpawn.RISE_SECONDS = 1.5;
class RdFoe extends RdUnit {
    constructor() {
        super(...arguments);
        this.moving = false;
        this.removed = false;
        this.spawnStyle = null;
        this.spawnStart = 0;
    }
    spawning(time) {
        return !!this.spawnStyle && time < this.spawnStart + this.spawnStyle.duration;
    }
    hidden(time) {
        return !!this.spawnStyle && this.spawning(time) && this.spawnStyle.hidden(time - this.spawnStart);
    }
    get solid() {
        return !this.removed;
    }
    get countsForClear() {
        return false;
    }
    get creditsDamage() {
        return true;
    }
    canBeHitBy(hero) {
        return true;
    }
    invulnerable(engine) {
        return this.spawning(engine.time) || engine.time < this.invulnerableUntil;
    }
    damageFactor(time) {
        return 1;
    }
    absorb(engine, amount) {
        const dealt = Math.min(this.hp, amount);
        this.hp -= amount;
        return dealt;
    }
    update(engine, dt) {
        if (this.spawnStyle && this.spawning(engine.time))
            this.spawnStyle.update(engine, this, dt, engine.time - this.spawnStart);
    }
    onDeath(engine) {
        return;
    }
}
class RdEnemyBrain {
    chooseTarget(engine, enemy) {
        const taunter = enemy.tauntTarget(engine);
        if (taunter)
            return taunter;
        let best = null;
        let bestDistance = Infinity;
        engine.heroes.forEach((hero) => {
            if (!hero.alive)
                return;
            const distance = enemy.distanceTo(hero);
            if (distance < bestDistance) {
                best = hero;
                bestDistance = distance;
            }
        });
        return best;
    }
    reach(enemy, target) {
        return enemy.spec.range + target.radius + enemy.radius * 0.2;
    }
    desiredPoint(engine, enemy, target, engaged) {
        if (engaged)
            return { x: target.x, z: target.z };
        const away = RdMath.normalize(enemy.x - target.x, enemy.z - target.z);
        const ring = this.reach(enemy, target) + RdBrainTuning.waitGap(enemy);
        const drift = Math.sin(engine.time * 0.7 + enemy.id) * 0.4;
        const ax = away.x * Math.cos(drift) - away.z * Math.sin(drift);
        const az = away.x * Math.sin(drift) + away.z * Math.cos(drift);
        return { x: target.x + ax * ring, z: target.z + az * ring };
    }
    update(engine, enemy, dt) {
        const target = enemy.targetId >= 0 ? engine.heroById(enemy.targetId) : null;
        if (!target || !target.alive) {
            enemy.moving = false;
            return;
        }
        const distance = enemy.distanceTo(target);
        const engaged = engine.isEngaged(enemy);
        const reach = this.reach(enemy, target);
        if (distance <= reach && (engaged || enemy.spec.ranged)) {
            enemy.moving = false;
            enemy.faceToward(target.x, target.z);
            if (engine.time >= enemy.attackReadyAt && enemy.strikeAt < 0)
                enemy.beginStrike(engine, target);
            if (enemy.spec.ranged && distance < reach * 0.45)
                this.steer(engine, enemy, this.desiredPoint(engine, enemy, target, engaged), dt, 0.7);
            return;
        }
        this.steer(engine, enemy, this.desiredPoint(engine, enemy, target, engaged), dt, 1);
    }
    steer(engine, enemy, goal, dt, speedScale) {
        const toGoal = RdMath.normalize(goal.x - enemy.x, goal.z - enemy.z);
        const gap = Math.hypot(goal.x - enemy.x, goal.z - enemy.z);
        if (gap < 25) {
            enemy.moving = false;
            return;
        }
        let pushX = 0, pushZ = 0;
        engine.foes.forEach((other) => {
            if (other === enemy || !other.solid)
                return;
            const dx = enemy.x - other.x, dz = enemy.z - other.z;
            const distance = Math.hypot(dx, dz);
            const limit = enemy.radius + other.radius + RdEnemyBrain.SEPARATION_GAP;
            if (distance < 1e-3 || distance > limit)
                return;
            const weight = (limit - distance) / limit;
            pushX += (dx / distance) * weight;
            pushZ += (dz / distance) * weight;
        });
        const direction = RdMath.normalize(toGoal.x + pushX * 0.9, toGoal.z + pushZ * 0.9);
        const speed = Math.min(enemy.moveSpeed() * speedScale, gap / Math.max(dt, 1e-3));
        const result = engine.world.move(enemy, direction.x * speed * dt, direction.z * speed * dt);
        if (!result.moved) {
            const side = enemy.id % 2 === 0 ? 1 : -1;
            engine.world.move(enemy, -direction.z * side * speed * dt, direction.x * side * speed * dt);
        }
        enemy.moving = true;
        enemy.yaw = RdMath.yawOf(direction.x, direction.z);
    }
}
RdEnemyBrain.WAIT_GAP = 170;
RdEnemyBrain.SEPARATION_GAP = 50;
class RdBrainTuning {
    static waitGap(enemy) {
        return RdEnemyBrain.WAIT_GAP + (enemy.id % 3) * 40;
    }
}
class RdCasterBrain extends RdEnemyBrain {
    desiredPoint(engine, enemy, target) {
        const distance = enemy.distanceTo(target);
        const away = RdMath.normalize(enemy.x - target.x, enemy.z - target.z);
        const want = RdMath.clamp(distance, RdCasterBrain.KEEP_MIN, RdCasterBrain.KEEP_MAX);
        return { x: target.x + away.x * want, z: target.z + away.z * want };
    }
}
RdCasterBrain.KEEP_MIN = 520;
RdCasterBrain.KEEP_MAX = 820;
class RdEnemy extends RdFoe {
    constructor(id, spec) {
        super(id, spec.radius, spec.hp);
        this.spec = spec;
        this.targetId = -1;
        this.attackReadyAt = 0;
        this.strikeAt = -1;
        this.strikeTarget = -1;
        this.tauntHero = -1;
        this.tauntUntil = 0;
        this.attackScale = 1;
        this.brain = spec.ranged ? new RdCasterBrain() : new RdEnemyBrain();
    }
    get kind() {
        return this.spec.kind;
    }
    get countsForClear() {
        return true;
    }
    get isBoss() {
        return false;
    }
    moveSpeed() {
        return this.spec.speed;
    }
    tauntTarget(engine) {
        if (engine.time >= this.tauntUntil)
            return null;
        const hero = engine.heroById(this.tauntHero);
        return hero && hero.alive ? hero : null;
    }
    taunt(hero, time) {
        this.tauntHero = hero.id;
        this.tauntUntil = time + RdBalance.TAUNT.mobSeconds;
    }
    stun(engine, seconds) {
        this.stunUntil = Math.max(this.stunUntil, engine.time + seconds);
        this.strikeAt = -1;
        engine.emit({ t: "fx", k: "stun", x: this.x, z: this.z, r: seconds, id: this.id, d: 0 });
    }
    beginStrike(engine, target) {
        this.attackReadyAt = engine.time + this.spec.interval;
        this.strikeAt = engine.time + (this.spec.ranged ? RdBalance.RANGED_WINDUP : RdBalance.MELEE_WINDUP);
        this.strikeTarget = target.id;
        engine.emit({ t: "act", id: this.id, a: this.spec.ranged ? "cast" : "attack" });
    }
    resolveStrike(engine) {
        const target = engine.heroById(this.strikeTarget);
        this.strikeAt = -1;
        if (!target || !target.alive)
            return;
        const damage = this.spec.attack * this.attackScale;
        if (this.spec.ranged) {
            engine.launchAtHero("bolt", this, target, damage, RdBalance.SKELETON_BOLT_SPEED);
            return;
        }
        if (this.distanceTo(target) <= this.brain.reach(this, target) + 60)
            engine.damageHero(target, damage);
    }
    update(engine, dt) {
        if (this.spawning(engine.time)) {
            super.update(engine, dt);
            return;
        }
        if (this.strikeAt >= 0 && engine.time >= this.strikeAt)
            this.resolveStrike(engine);
        if (this.isStunned(engine.time)) {
            this.moving = false;
            return;
        }
        this.brain.update(engine, this, dt);
    }
}
class RdMinion extends RdEnemy {
    constructor(id) {
        super(id, RdBalance.MOBS.minion);
    }
}
class RdWarrior extends RdEnemy {
    constructor(id) {
        super(id, RdBalance.MOBS.warrior);
    }
}
class RdRogue extends RdEnemy {
    constructor(id) {
        super(id, RdBalance.MOBS.rogue);
    }
}
class RdSkeletonMage extends RdEnemy {
    constructor(id) {
        super(id, RdBalance.MOBS.mage);
    }
}
class RdMobFactory {
    static create(kind, id) {
        return RdMobFactory.BUILDERS[kind](id);
    }
}
RdMobFactory.BUILDERS = {
    minion: (id) => new RdMinion(id),
    warrior: (id) => new RdWarrior(id),
    rogue: (id) => new RdRogue(id),
    mage: (id) => new RdSkeletonMage(id)
};
class RdAttackPattern {
    constructor(cooldown, telegraph, recovery, initialDelay = 0) {
        this.cooldown = cooldown;
        this.telegraph = telegraph;
        this.recovery = recovery;
        this.initialDelay = initialDelay;
        this.readyAt = 0;
    }
    arm(time) {
        this.readyAt = time + this.initialDelay;
    }
    ready(engine) {
        return engine.time >= this.readyAt;
    }
    currentCooldown(boss) {
        return this.cooldown;
    }
    get animation() {
        return "slam";
    }
    begin(engine, boss, target) {
        this.readyAt = engine.time + this.currentCooldown(boss);
        const shapes = this.shapes(engine, boss, target);
        const resolveAt = engine.time + this.telegraph;
        const telegraphIds = this.telegraph > 0 ? shapes.map((shape) => engine.addTelegraph(shape, resolveAt)) : [];
        const first = shapes[0];
        const point = first ? { x: first.x, z: first.z } : { x: target.x, z: target.z };
        const dir = first && "dir" in first ? first.dir : RdMath.yawOf(target.x - boss.x, target.z - boss.z);
        engine.emit({ t: "act", id: boss.id, a: this.animation });
        return { pattern: this, start: engine.time, resolveAt, endAt: resolveAt + this.recovery, resolved: false, shapes, point, dir, telegraphIds };
    }
    hitHeroes(engine, shapes, damage, stun) {
        const hit = [];
        engine.heroes.forEach((hero) => {
            if (!hero.alive || !shapes.some((shape) => RdShapes.contains(shape, hero.x, hero.z, hero.radius * 0.6)))
                return;
            if (engine.damageHero(hero, damage) > 0 && stun > 0)
                hero.stunUntil = Math.max(hero.stunUntil, engine.time + stun);
            hit.push(hero);
        });
        return hit;
    }
    damagedHeroes(engine, shapes, damage) {
        return engine.heroes.filter((hero) => hero.alive && shapes.some((shape) => RdShapes.contains(shape, hero.x, hero.z, hero.radius * 0.6)) && engine.damageHero(hero, damage) > 0);
    }
}
class RdConeStrike extends RdAttackPattern {
    constructor(spec) {
        super(spec.cooldown, spec.telegraph, 0.35);
        this.spec = spec;
    }
    canStart(engine, boss, target) {
        return boss.distanceTo(target) <= this.spec.radius * 0.8 + boss.radius * 0.3 + target.radius;
    }
    shapes(engine, boss, target) {
        const dir = RdMath.yawOf(target.x - boss.x, target.z - boss.z);
        boss.yaw = dir;
        return [{ kind: "cone", x: boss.x, z: boss.z, r: this.spec.radius + boss.radius * 0.4, dir, arc: this.spec.arc }];
    }
    resolve(engine, boss, cast) {
        engine.emit({ t: "fx", k: "slam", x: cast.point.x, z: cast.point.z, r: this.spec.radius, id: boss.id, d: cast.dir });
        this.hitHeroes(engine, cast.shapes, this.spec.damage, 0);
    }
}
class RdLeapSlam extends RdAttackPattern {
    constructor(spec) {
        super(spec.cooldown, spec.telegraph, 0.6, 5);
        this.spec = spec;
    }
    get animation() {
        return "leap";
    }
    canStart(engine) {
        return engine.livingHeroes().length > 0;
    }
    shapes(engine, boss) {
        const landing = RdBossArena.clamp(engine.random.pick(engine.livingHeroes()));
        return [{ kind: "circle", x: landing.x, z: landing.z, r: this.spec.radius }];
    }
    resolve(engine, boss, cast) {
        this.hitHeroes(engine, cast.shapes, this.spec.damage, 0);
        const fromX = boss.x, fromZ = boss.z;
        const spot = engine.world.freeSpotNear(cast.point.x, cast.point.z, boss.radius, boss.id);
        boss.place(spot.x, spot.z);
        engine.emit({ t: "fx", k: "leap", x: spot.x, z: spot.z, r: this.spec.radius, id: boss.id, d: RdMath.yawOf(spot.x - fromX, spot.z - fromZ) });
    }
}
class RdRushPattern extends RdAttackPattern {
    constructor(spec) {
        super(spec.cooldown, spec.telegraph, spec.length / spec.speed + 0.3, 9);
        this.spec = spec;
    }
    get animation() {
        return "rush";
    }
    canStart(engine) {
        return engine.livingHeroes().length > 0;
    }
    shapes(engine, boss) {
        let far = engine.livingHeroes()[0];
        engine.livingHeroes().forEach((hero) => { if (hero.distanceTo(boss) > far.distanceTo(boss))
            far = hero; });
        const dir = RdMath.yawOf(far.x - boss.x, far.z - boss.z);
        boss.yaw = dir;
        return [{ kind: "line", x: boss.x, z: boss.z, dir, length: this.spec.length, width: this.spec.width }];
    }
    resolve(engine, boss, cast) {
        this.hitHeroes(engine, cast.shapes, this.spec.damage, 0);
        boss.rush = { dirX: Math.sin(cast.dir), dirZ: Math.cos(cast.dir), left: this.spec.length, speed: this.spec.speed, stun: this.spec.wallStun, bonus: this.spec.wallBonus };
        engine.emit({ t: "fx", k: "rush", x: boss.x, z: boss.z, r: this.spec.length, id: boss.id, d: cast.dir });
    }
}
class RdMagicBolt extends RdAttackPattern {
    constructor(spec, range) {
        super(spec.cooldown, 0, 0.25);
        this.spec = spec;
        this.range = range;
    }
    get animation() {
        return "cast";
    }
    canStart(engine, boss, target) {
        return boss.distanceTo(target) <= this.range;
    }
    shapes() {
        return [];
    }
    begin(engine, boss, target) {
        const cast = super.begin(engine, boss, target);
        cast.point = { x: target.x, z: target.z };
        boss.boltTarget = target.id;
        return cast;
    }
    resolve(engine, boss) {
        const target = engine.heroById(boss.boltTarget);
        if (target && target.alive)
            engine.launchAtHero("bolt", boss, target, this.spec.damage, this.spec.speed);
    }
}
class RdArcaneCircles extends RdAttackPattern {
    constructor(spec, range) {
        super(spec.cooldown, spec.telegraph, 0.4, 4);
        this.spec = spec;
        this.range = range;
    }
    get animation() {
        return "summon";
    }
    canStart(engine, boss) {
        return engine.livingHeroes().some((hero) => hero.distanceTo(boss) <= this.range + 600);
    }
    shapes(engine) {
        return engine.random.shuffle(engine.livingHeroes()).slice(0, 2).map((hero) => ({ kind: "circle", x: hero.x, z: hero.z, r: this.spec.radius }));
    }
    resolve(engine, boss, cast) {
        cast.shapes.forEach((shape) => engine.addArea(shape, this.spec.active, this.spec.dps, true));
    }
}
class RdMeteorPattern extends RdAttackPattern {
    constructor(spec, range) {
        super(spec.cooldown, spec.cast, 0.5, 8);
        this.spec = spec;
        this.range = range;
    }
    get animation() {
        return "channel";
    }
    currentCooldown(boss) {
        return boss.hp <= boss.maxHp * 0.5 ? this.spec.enragedCooldown : this.spec.cooldown;
    }
    targets(engine, boss) {
        const points = engine.livingHeroes().map((hero) => ({ x: hero.x, z: hero.z }));
        return RdTargeting.meteorTargets(points, boss.x, boss.z, this.range, this.spec.radius, boss.hp <= boss.maxHp * 0.5 ? 2 : 1, this.spec.spread);
    }
    canStart(engine, boss) {
        return this.targets(engine, boss).length > 0;
    }
    shapes(engine, boss) {
        return this.targets(engine, boss).map((point) => ({ kind: "circle", x: point.x, z: point.z, r: this.spec.radius }));
    }
    resolve(engine, boss, cast) {
        cast.shapes.forEach((shape) => engine.emit({ t: "fx", k: "meteor", x: shape.x, z: shape.z, r: this.spec.radius, id: boss.id, d: 0 }));
        this.hitHeroes(engine, cast.shapes, this.spec.damage, this.spec.stun);
    }
}
class RdQuadrantQuake extends RdAttackPattern {
    constructor(spec) {
        super(spec.cooldown, spec.telegraph, 0.5, spec.firstDelay);
        this.spec = spec;
    }
    get animation() {
        return "channel";
    }
    canStart(engine, boss) {
        return engine.livingHeroes().some((hero) => hero.distanceTo(boss) <= this.spec.radius);
    }
    shapes(engine, boss) {
        const dir = engine.random.next() < 0.5 ? 0 : Math.PI / 4;
        return [{ kind: "quadrants", x: boss.x, z: boss.z, r: this.spec.radius, gap: this.spec.gap, dir }];
    }
    resolve(engine, boss, cast) {
        engine.emit({ t: "act", id: boss.id, a: "slam" });
        engine.emit({ t: "fx", k: "quake", x: cast.point.x, z: cast.point.z, r: this.spec.radius, id: boss.id, d: 0 });
        this.damagedHeroes(engine, cast.shapes, this.spec.damage).forEach((hero) => engine.knockHero(hero, cast.point.x, cast.point.z, this.spec.push));
    }
}
class RdCheckerStomp extends RdAttackPattern {
    constructor(spec) {
        super(spec.cooldown, spec.telegraph, 0.6);
        this.spec = spec;
    }
    get animation() {
        return "channel";
    }
    canStart(engine, boss) {
        return boss.hp <= boss.maxHp * this.spec.ratio && engine.livingHeroes().length > 0;
    }
    shapes(engine, boss) {
        const hall = RdMapData.HALL;
        return [{ kind: "checker", x: hall.minX, z: hall.minZ, w: hall.maxX - hall.minX, h: hall.maxZ - hall.minZ, cell: this.spec.cell, parity: engine.random.int(2), ox: Math.round(boss.x), oz: Math.round(boss.z) }];
    }
    resolve(engine, boss, cast) {
        engine.emit({ t: "act", id: boss.id, a: "slam" });
        engine.emit({ t: "fx", k: "stomp", x: boss.x, z: boss.z, r: this.spec.cell, id: boss.id, d: 0 });
        this.damagedHeroes(engine, cast.shapes, this.spec.damage).forEach((hero) => engine.launchHero(hero, this.spec.airborne));
    }
}
class RdBarrierLines extends RdAttackPattern {
    constructor(spec) {
        super(spec.cooldown, spec.telegraph, 0.4, spec.firstDelay);
        this.spec = spec;
    }
    get animation() {
        return "summon";
    }
    canStart(engine) {
        return engine.livingHeroes().length > 0;
    }
    shapes(engine) {
        const hall = RdMapData.HALL;
        const living = engine.livingHeroes();
        const lines = [];
        for (let index = 0; index < this.spec.lines; index++) {
            const anchor = index < living.length && index < 2 ? engine.random.pick(living) : { x: engine.random.range(hall.minX + 300, hall.maxX - 300), z: engine.random.range(hall.minZ + 300, hall.maxZ - 300) };
            const dir = engine.random.range(0, Math.PI);
            lines.push(RdShapes.chordThrough(hall, { x: anchor.x, z: anchor.z }, dir, this.spec.width));
        }
        return lines;
    }
    resolve(engine, boss, cast) {
        cast.shapes.forEach((shape) => {
            if (shape.kind === "line")
                engine.emit({ t: "fx", k: "barrier", x: Math.round(shape.x), z: Math.round(shape.z), r: Math.round(shape.length), id: boss.id, d: shape.dir });
        });
        this.damagedHeroes(engine, cast.shapes, this.spec.damage);
    }
}
class RdBossArena {
    static inside(point) {
        return Math.abs(point.x - RdMapData.CENTER.x) <= RdBossArena.HALF_X && Math.abs(point.z - RdMapData.CENTER.z) <= RdBossArena.HALF_Z;
    }
    static clamp(point) {
        return {
            x: RdMath.clamp(point.x, RdMapData.CENTER.x - RdBossArena.HALF_X, RdMapData.CENTER.x + RdBossArena.HALF_X),
            z: RdMath.clamp(point.z, RdMapData.CENTER.z - RdBossArena.HALF_Z, RdMapData.CENTER.z + RdBossArena.HALF_Z)
        };
    }
}
RdBossArena.HALF_X = 1100;
RdBossArena.HALF_Z = 800;
RdBossArena.SETTLE = 30;
class RdBoss extends RdEnemy {
    constructor(id, bossSpeed, radius, hp) {
        super(id, { kind: "warrior", name: "", model: "Skeleton_Warrior", hp, attack: 0, interval: 1, range: 0, speed: bossSpeed, radius, ranged: false, spawn: "gate" });
        this.bossSpeed = bossSpeed;
        this.cast = null;
        this.rush = null;
        this.boltTarget = -1;
        this.vulnerableFrom = 0;
        this.vulnerableUntil = 0;
        this.vulnerableBonus = 0;
        this.summonIndex = 0;
        this.mechanicQueue = [];
        this.mechanicIndex = 0;
        this.nextMechanicAt = 0;
        this.armed = false;
        this.summonRatios = [];
        this.mechanicSteps = [];
    }
    get kind() {
        return this.bossKind;
    }
    get isBoss() {
        return true;
    }
    taunt(hero, time) {
        this.tauntHero = hero.id;
        this.tauntUntil = time + RdBalance.TAUNT.bossSeconds;
    }
    stun(engine, seconds) {
        return;
    }
    forceStun(engine, seconds) {
        this.stunUntil = Math.max(this.stunUntil, engine.time + seconds);
        engine.emit({ t: "fx", k: "stun", x: this.x, z: this.z, r: seconds, id: this.id, d: 0 });
    }
    makeVulnerable(from, until, bonus) {
        this.vulnerableFrom = from;
        this.vulnerableUntil = until;
        this.vulnerableBonus = bonus;
    }
    damageFactor(time) {
        return time >= this.vulnerableFrom && time < this.vulnerableUntil ? 1 + this.vulnerableBonus : 1;
    }
    invulnerable(engine) {
        return super.invulnerable(engine) || (!!engine.mechanic && engine.mechanic.boss === this) || this.mechanicQueue.length > 0;
    }
    nextMechanicRatio() {
        const step = this.mechanicSteps[this.mechanicIndex];
        return step ? step.ratio : -1;
    }
    absorb(engine, amount) {
        const floor = this.nextMechanicRatio() * this.maxHp;
        const before = this.hp;
        this.hp = Math.max(this.hp - amount, floor > 0 ? floor : -Infinity);
        if (floor > 0 && this.hp <= floor) {
            this.mechanicSteps[this.mechanicIndex].kinds.forEach((kind) => this.mechanicQueue.push(kind));
            this.mechanicIndex++;
            this.nextMechanicAt = engine.time;
        }
        this.checkSummons(engine);
        return Math.max(0, before - Math.max(this.hp, 0));
    }
    checkSummons(engine) {
        while (this.summonIndex < this.summonRatios.length && this.hp <= this.summonRatios[this.summonIndex] * this.maxHp && this.hp > 0) {
            this.summonIndex++;
            engine.emit({ t: "act", id: this.id, a: "summon" });
            this.summonWave(engine);
        }
    }
    summonWave(engine) {
        engine.spawnMinionPair();
        engine.spawnMinionPair();
    }
    chooseTarget(engine) {
        return this.brain.chooseTarget(engine, this);
    }
    engageDistance(target) {
        return this.radius + target.radius + 140;
    }
    approach(engine, target, dt) {
        if (this.distanceTo(target) <= this.engageDistance(target)) {
            this.moving = false;
            this.faceToward(target.x, target.z);
            return;
        }
        this.walkWithinArena(engine, RdBossArena.clamp(target), target, dt);
    }
    walkWithinArena(engine, goal, target, dt) {
        if (Math.hypot(goal.x - this.x, goal.z - this.z) < RdBossArena.SETTLE) {
            this.moving = false;
            this.faceToward(target.x, target.z);
            return;
        }
        this.walkToward(engine, goal.x, goal.z, dt);
    }
    walkToward(engine, x, z, dt) {
        const direction = RdMath.normalize(x - this.x, z - this.z);
        const gap = Math.hypot(x - this.x, z - this.z);
        if (gap < 20) {
            this.moving = false;
            return;
        }
        const step = Math.min(gap, this.bossSpeed * dt);
        const result = engine.world.move(this, direction.x * step, direction.z * step);
        this.moving = result.moved;
        this.yaw = RdMath.yawOf(direction.x, direction.z);
    }
    stepRush(engine, rush, dt) {
        const step = Math.min(rush.left, rush.speed * dt);
        const result = engine.world.move(this, rush.dirX * step, rush.dirZ * step);
        rush.left -= step;
        this.moving = true;
        if (result.blockedByWall && !result.moved) {
            this.rush = null;
            this.forceStun(engine, rush.stun);
            this.makeVulnerable(engine.time, engine.time + rush.stun, rush.bonus);
            engine.emit({ t: "fx", k: "wall-stun", x: this.x, z: this.z, r: this.radius, id: this.id, d: 0 });
            if (this.cast)
                this.cast.endAt = engine.time;
            return;
        }
        if (!result.moved || rush.left <= 0.5) {
            this.rush = null;
            if (this.cast)
                this.cast.endAt = Math.min(this.cast.endAt, engine.time + 0.2);
        }
    }
    update(engine, dt) {
        if (this.spawning(engine.time)) {
            super.update(engine, dt);
            return;
        }
        if (!this.armed) {
            this.armed = true;
            this.patterns.forEach((pattern) => pattern.arm(engine.time));
            this.basic.arm(engine.time);
        }
        if (this.rush) {
            this.stepRush(engine, this.rush, dt);
            return;
        }
        if (engine.mechanic && engine.mechanic.boss === this) {
            this.walkToward(engine, RdMapData.CENTER.x, RdMapData.CENTER.z, dt);
            return;
        }
        if (this.cast) {
            if (!this.cast.resolved && engine.time >= this.cast.resolveAt) {
                this.cast.resolved = true;
                this.cast.pattern.resolve(engine, this, this.cast);
            }
            if (this.cast && engine.time >= this.cast.endAt && !this.rush)
                this.cast = null;
            this.moving = false;
            return;
        }
        if (this.mechanicQueue.length) {
            if (engine.time >= this.nextMechanicAt && !engine.mechanic)
                engine.startMechanic(this, this.mechanicQueue.shift());
            this.moving = false;
            return;
        }
        if (this.isStunned(engine.time)) {
            this.moving = false;
            return;
        }
        const target = this.chooseTarget(engine);
        if (!target) {
            this.moving = false;
            return;
        }
        this.targetId = target.id;
        const special = this.patterns.filter((pattern) => pattern.ready(engine) && pattern.canStart(engine, this, target))[0];
        if (special) {
            this.cast = special.begin(engine, this, target);
            return;
        }
        const basicTarget = this.tauntTarget(engine) || target;
        if (this.basic.ready(engine) && this.basic.canStart(engine, this, basicTarget)) {
            this.cast = this.basic.begin(engine, this, basicTarget);
            return;
        }
        this.approach(engine, basicTarget, dt);
    }
    mechanicEnded(engine) {
        this.nextMechanicAt = engine.time + RdBalance.MECHANIC_GAP;
    }
}
class RdGiantWarrior extends RdBoss {
    constructor(id) {
        super(id, RdBalance.GIANT.speed, RdBalance.GIANT.radius, RdBalance.GIANT.hp);
        this.bossKind = "giant";
        this.displayName = RdBalance.GIANT.name;
        this.summonRatios = RdBalance.GIANT.summons;
        this.patterns = [new RdQuadrantQuake(RdBalance.GIANT.quake), new RdRushPattern(RdBalance.GIANT.rush), new RdLeapSlam(RdBalance.GIANT.leap)];
        this.basic = new RdConeStrike(RdBalance.GIANT.slam);
    }
}
class RdArchMage extends RdBoss {
    constructor(id) {
        super(id, RdBalance.ARCHMAGE.speed, RdBalance.ARCHMAGE.radius, RdBalance.ARCHMAGE.hp);
        this.bossKind = "archmage";
        this.displayName = RdBalance.ARCHMAGE.name;
        this.patterns = [new RdMeteorPattern(RdBalance.ARCHMAGE.meteor, RdBalance.ARCHMAGE.range), new RdBarrierLines(RdBalance.ARCHMAGE.barrier), new RdArcaneCircles(RdBalance.ARCHMAGE.circles, RdBalance.ARCHMAGE.range)];
        this.basic = new RdMagicBolt(RdBalance.ARCHMAGE.bolt, RdBalance.ARCHMAGE.range);
    }
    summonWave(engine) {
        return;
    }
    approach(engine, target, dt) {
        const distance = this.distanceTo(target);
        if (distance >= RdArchMage.KEEP_MIN && distance <= RdArchMage.KEEP_MAX && RdBossArena.inside(this)) {
            this.moving = false;
            this.faceToward(target.x, target.z);
            return;
        }
        this.walkWithinArena(engine, this.standPoint(target), target, dt);
    }
    standPoint(target) {
        const want = (RdArchMage.KEEP_MIN + RdArchMage.KEEP_MAX) / 2;
        let best = null, bestScore = Infinity;
        for (let step = 0; step < RdArchMage.STAND_STEPS; step++) {
            const angle = (step / RdArchMage.STAND_STEPS) * Math.PI * 2;
            const point = { x: target.x + Math.sin(angle) * want, z: target.z + Math.cos(angle) * want };
            if (!RdBossArena.inside(point))
                continue;
            const score = Math.hypot(point.x - this.x, point.z - this.z) + Math.hypot(point.x - RdMapData.CENTER.x, point.z - RdMapData.CENTER.z) * RdArchMage.CENTER_PULL;
            if (score < bestScore) {
                best = point;
                bestScore = score;
            }
        }
        return best || RdBossArena.clamp(target);
    }
}
RdArchMage.KEEP_MIN = 800;
RdArchMage.KEEP_MAX = 1150;
RdArchMage.STAND_STEPS = 16;
RdArchMage.CENTER_PULL = 0.6;
class RdSkeletonLord extends RdBoss {
    constructor(id) {
        super(id, RdBalance.LORD.speed, RdBalance.LORD.radius, RdBalance.LORD.hp);
        this.bossKind = "lord";
        this.displayName = RdBalance.LORD.name;
        this.summonRatios = RdBalance.LORD.summons;
        this.mechanicSteps = RdBalance.LORD.mechanics;
        this.patterns = [new RdCheckerStomp(RdBalance.LORD.stomp), new RdQuadrantQuake(RdBalance.LORD.quake), new RdLeapSlam(RdBalance.LORD.leap)];
        this.basic = new RdConeStrike(RdBalance.LORD.sweep);
    }
    summonWave(engine) {
        engine.spawnMinionPair();
        engine.spawnMinionPair();
        engine.spawnMob("rogue", new RdDoorSpawn(engine.nextDoor()));
    }
}
class RdBossFactory {
    static create(kind, id) {
        return RdBossFactory.BUILDERS[kind](id);
    }
}
RdBossFactory.BUILDERS = {
    giant: (id) => new RdGiantWarrior(id),
    archmage: (id) => new RdArchMage(id),
    lord: (id) => new RdSkeletonLord(id)
};
class RdTrainingDummy extends RdFoe {
    constructor(id, sparring) {
        super(id, RdBalance.DUMMY_RADIUS, 1000);
        this.sparring = sparring;
        this.kind = "dummy";
        this.nextHitAt = 3;
    }
    get creditsDamage() {
        return false;
    }
    absorb(engine, amount) {
        return amount;
    }
    update(engine, dt) {
        if (!this.sparring || engine.time < this.nextHitAt)
            return;
        this.nextHitAt = engine.time + RdBalance.SPAR_INTERVAL;
        let nearest = null;
        engine.livingHeroes().forEach((hero) => {
            if (hero.distanceTo(this) <= RdBalance.SPAR_RANGE + hero.radius && (!nearest || hero.distanceTo(this) < nearest.distanceTo(this)))
                nearest = hero;
        });
        const victim = nearest;
        if (!victim || victim.hp <= victim.maxHp * 0.3)
            return;
        this.faceToward(victim.x, victim.z);
        engine.emit({ t: "act", id: this.id, a: "attack" });
        engine.damageHero(victim, RdBalance.SPAR_DAMAGE);
    }
}
class RdManaPillar extends RdFoe {
    constructor(id) {
        super(id, RdBalance.PILLARS.radius, RdBalance.PILLARS.hp);
        this.kind = "pillar";
        this.broken = false;
    }
    get creditsDamage() {
        return true;
    }
    invulnerable(engine) {
        return this.broken;
    }
    absorb(engine, amount) {
        const dealt = Math.min(this.hp, amount);
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0 && !this.broken) {
            this.broken = true;
            engine.emit({ t: "fx", k: "pillar-break", x: this.x, z: this.z, r: this.radius, id: this.id, d: 0 });
        }
        return dealt;
    }
    restore(engine) {
        this.broken = false;
        this.hp = this.maxHp;
        engine.emit({ t: "fx", k: "pillar-restore", x: this.x, z: this.z, r: this.radius, id: this.id, d: 0 });
    }
}
class RdRewardChest extends RdFoe {
    constructor(id, owner) {
        super(id, RdBalance.CHEST_RADIUS, RdBalance.CHEST_HP);
        this.owner = owner;
        this.kind = "chest";
    }
    get creditsDamage() {
        return false;
    }
    canBeHitBy(hero) {
        return hero.slot === this.owner;
    }
    onDeath(engine) {
        engine.emit({ t: "chest", id: this.id, slot: this.owner });
        engine.openOffer(this.owner);
    }
}
class RdProjectile {
    constructor(id, style, x, z, speed, targetId, damage, friendly, shooter) {
        this.id = id;
        this.style = style;
        this.x = x;
        this.z = z;
        this.speed = speed;
        this.targetId = targetId;
        this.damage = damage;
        this.friendly = friendly;
        this.shooter = shooter;
        this.travelled = 0;
    }
}
class RdTeamMechanic {
    constructor(boss, engine) {
        this.boss = boss;
        this.outcome = "running";
        this.startedAt = engine.time;
    }
    finish(engine) {
        return;
    }
    zoneCounts(engine) {
        return [];
    }
    zonePoints() {
        return [];
    }
    windowEndsAt() {
        return -1;
    }
}
class RdSafeZoneMechanic extends RdTeamMechanic {
    constructor(boss, engine) {
        super(boss, engine);
        this.kind = "zones";
        this.instruction = "각자 다른 안전구역으로!";
        this.zones = RdSafeZoneMechanic.layout(engine.livingHeroes().length);
        this.deadline = engine.time + RdBalance.SAFE_ZONE.seconds;
    }
    static layout(count) {
        const points = [];
        for (let index = 0; index < count; index++) {
            const angle = Math.PI + (index / Math.max(1, count)) * Math.PI * 2;
            points.push({ x: RdMapData.CENTER.x + Math.sin(angle) * RdBalance.SAFE_ZONE.ring, z: RdMapData.CENTER.z + Math.cos(angle) * RdBalance.SAFE_ZONE.ring });
        }
        return points;
    }
    static zoneOf(zones, hero) {
        return zones.findIndex((zone) => Math.hypot(zone.x - hero.x, zone.z - hero.z) <= RdBalance.SAFE_ZONE.radius);
    }
    static evaluate(zones, heroes) {
        const counts = zones.map(() => 0);
        const where = heroes.map((hero) => RdSafeZoneMechanic.zoneOf(zones, hero));
        where.forEach((zone) => { if (zone >= 0)
            counts[zone]++; });
        const losers = [];
        where.forEach((zone, index) => { if (zone < 0 || counts[zone] !== 1)
            losers.push(index); });
        return { success: counts.length > 0 && counts.every((count) => count === 1) && losers.length === 0, counts, losers };
    }
    endsAt() {
        return this.deadline;
    }
    zonePoints() {
        return this.zones;
    }
    zoneCounts(engine) {
        return RdSafeZoneMechanic.evaluate(this.zones, engine.livingHeroes()).counts;
    }
    update(engine) {
        const living = engine.livingHeroes();
        if (living.length !== this.zones.length)
            this.zones = RdSafeZoneMechanic.layout(living.length);
        if (engine.time < this.deadline)
            return;
        const result = RdSafeZoneMechanic.evaluate(this.zones, living);
        if (result.success) {
            this.outcome = "success";
            this.boss.forceStun(engine, RdBalance.SAFE_ZONE.stunSeconds);
            this.boss.makeVulnerable(engine.time + RdBalance.SAFE_ZONE.stunSeconds, engine.time + RdBalance.SAFE_ZONE.stunSeconds + RdBalance.SAFE_ZONE.vulnerableSeconds, RdBalance.SAFE_ZONE.vulnerableBonus);
            engine.emit({ t: "fx", k: "zone-ok", x: this.boss.x, z: this.boss.z, r: 0, id: this.boss.id, d: 0 });
            return;
        }
        this.outcome = "fail";
        engine.emit({ t: "fx", k: "zone-fail", x: this.boss.x, z: this.boss.z, r: 0, id: this.boss.id, d: 0 });
        result.losers.forEach((index) => {
            const hero = living[index];
            engine.damageHero(hero, hero.maxHp * RdBalance.SAFE_ZONE.failRatio, true);
        });
    }
}
class RdPillarSyncMechanic extends RdTeamMechanic {
    constructor(boss, engine) {
        super(boss, engine);
        this.kind = "pillars";
        this.instruction = "기둥을 동시에 부숴라!";
        this.pillars = [];
        this.firstBrokenAt = -1;
        this.deadline = engine.time + RdBalance.PILLARS.limit;
        const count = engine.livingHeroes().length;
        for (let index = 0; index < count; index++) {
            const angle = Math.PI + ((index + 0.5) / count) * Math.PI * 2;
            const pillar = new RdManaPillar(engine.allocateId());
            const spot = engine.world.freeSpotNear(Math.sin(angle) * RdBalance.PILLARS.ring, Math.cos(angle) * RdBalance.PILLARS.ring, pillar.radius, pillar.id);
            pillar.place(spot.x, spot.z);
            engine.addFoe(pillar);
            engine.emit({ t: "spawn", id: pillar.id, door: -1 });
            this.pillars.push(pillar);
        }
    }
    static judge(brokenFlags, firstBrokenAt, now, window) {
        if (brokenFlags.length && brokenFlags.every((flag) => flag))
            return "success";
        if (firstBrokenAt >= 0 && now > firstBrokenAt + window)
            return "restore";
        return "wait";
    }
    endsAt() {
        return this.deadline;
    }
    windowEndsAt() {
        return this.firstBrokenAt >= 0 ? this.firstBrokenAt + RdBalance.PILLARS.window : -1;
    }
    activePillars() {
        return this.pillars.filter((pillar) => !pillar.removed);
    }
    update(engine) {
        const living = engine.livingHeroes().length;
        const active = this.activePillars();
        if (living < active.length) {
            const spare = active.filter((pillar) => !pillar.broken).pop() || active[active.length - 1];
            engine.removeFoe(spare);
        }
        const pillars = this.activePillars();
        if (this.firstBrokenAt < 0 && pillars.some((pillar) => pillar.broken))
            this.firstBrokenAt = engine.time;
        const verdict = RdPillarSyncMechanic.judge(pillars.map((pillar) => pillar.broken), this.firstBrokenAt, engine.time, RdBalance.PILLARS.window);
        if (verdict === "success") {
            this.outcome = "success";
            engine.emit({ t: "fx", k: "zone-ok", x: this.boss.x, z: this.boss.z, r: 1, id: this.boss.id, d: 0 });
            return;
        }
        if (verdict === "restore") {
            pillars.forEach((pillar) => { if (pillar.broken)
                pillar.restore(engine); });
            this.firstBrokenAt = -1;
        }
        if (engine.time >= this.deadline) {
            this.outcome = "fail";
            engine.emit({ t: "fx", k: "pillars-fail", x: this.boss.x, z: this.boss.z, r: 0, id: this.boss.id, d: 0 });
            engine.livingHeroes().forEach((hero) => engine.damageHero(hero, hero.maxHp * RdBalance.PILLARS.failRatio, true));
        }
    }
    finish(engine) {
        this.pillars.forEach((pillar) => { if (!pillar.removed)
            engine.removeFoe(pillar); });
    }
}
class RdMechanics {
    static create(kind, boss, engine) {
        return RdMechanics.BUILDERS[kind](boss, engine);
    }
}
RdMechanics.BUILDERS = {
    zones: (boss, engine) => new RdSafeZoneMechanic(boss, engine),
    pillars: (boss, engine) => new RdPillarSyncMechanic(boss, engine)
};
class RdReadyZone {
    constructor(circle) {
        this.circle = circle;
        this.countdownEnd = -1;
    }
    contains(hero) {
        return Math.hypot(hero.x - this.circle.x, hero.z - this.circle.z) <= this.circle.r;
    }
    inside(engine) {
        return engine.heroes.filter((hero) => hero.alive && this.contains(hero)).map((hero) => hero.slot);
    }
    update(engine, blocked) {
        const living = engine.livingHeroes();
        const allIn = living.length > 0 && living.every((hero) => this.contains(hero)) && !blocked;
        if (!allIn) {
            this.countdownEnd = -1;
            return false;
        }
        if (this.countdownEnd < 0)
            this.countdownEnd = engine.time + RdBalance.READY_COUNTDOWN;
        return engine.time >= this.countdownEnd;
    }
}
class RdStage {
    constructor(floor) {
        this.floor = floor;
        this.phase = "intro";
        this.phaseAt = 0;
        this.enteredAt = 0;
        this.clearedAt = -1;
    }
    enter(engine) {
        this.enteredAt = engine.time;
        this.setPhase(engine, "intro");
    }
    setPhase(engine, phase) {
        this.phase = phase;
        this.phaseAt = engine.time;
    }
    exit(engine) {
        return;
    }
    readyZone() {
        return null;
    }
    wave() {
        return 0;
    }
    waves() {
        return 0;
    }
    hint(engine) {
        return "";
    }
    get label() {
        return this.floor.label;
    }
}
class RdReadyStage extends RdStage {
    constructor() {
        super(...arguments);
        this.kind = "ready";
        this.zone = new RdReadyZone(RdMapData.HALL_READY);
    }
    enter(engine) {
        super.enter(engine);
        engine.teleportHeroes();
        engine.enemyAttackScale = 1;
        RdMapData.DUMMY_SPOTS.forEach((spot, index) => {
            const dummy = new RdTrainingDummy(engine.allocateId(), index === 1);
            dummy.place(spot.x, spot.z);
            dummy.yaw = RdMath.yawOf(-spot.x, 1000 - spot.z);
            engine.addFoe(dummy);
            engine.emit({ t: "spawn", id: dummy.id, door: -1 });
        });
        engine.floorEvent("start", 1);
        this.setPhase(engine, "fight");
    }
    readyZone() {
        return this.zone;
    }
    update(engine) {
        if (!this.zone.update(engine, false))
            return false;
        engine.floorEvent("clear", 1);
        engine.reviveAll();
        return true;
    }
    exit(engine) {
        engine.clearFoes();
    }
}
class RdCombatStage extends RdStage {
    enter(engine) {
        super.enter(engine);
        engine.teleportHeroes();
        engine.enemyAttackScale = this.floor.floor === 2 ? RdBalance.TUTORIAL_ENEMY_ATTACK : 1;
    }
    update(engine) {
        const since = engine.time - this.phaseAt;
        if (this.phase === "intro") {
            if (since >= RdCombatStage.INTRO_SECONDS) {
                engine.floorEvent("start", this.floor.floor);
                this.setPhase(engine, "brief");
            }
            return false;
        }
        if (this.phase === "brief") {
            if (since >= RdCombatStage.BRIEF_SECONDS) {
                this.setPhase(engine, "fight");
                this.beginFight(engine);
            }
            return false;
        }
        if (this.phase === "fight") {
            this.fightTick(engine);
            if (this.fightOver(engine)) {
                this.clearedAt = engine.time;
                engine.onFloorCleared(this.floor.floor);
                this.setPhase(engine, "clear");
                if (!this.slowClear)
                    engine.floorEvent("clear", this.floor.floor);
            }
            return false;
        }
        if (this.phase === "clear") {
            const bannerAt = this.slowClear ? RdCombatStage.BOSS_SLOWMO : 0;
            if (this.slowClear && since >= bannerAt && since - engine.lastDt < bannerAt)
                engine.floorEvent("clear", this.floor.floor);
            const hold = this.floor.floor === RdFloorPlan.LAST_FLOOR ? RdCombatStage.FINAL_HOLD : RdCombatStage.CLEAR_HOLD;
            return since >= bannerAt + hold;
        }
        return false;
    }
    fightTick(engine) {
        return;
    }
}
RdCombatStage.INTRO_SECONDS = 0.8;
RdCombatStage.BRIEF_SECONDS = 1.5;
RdCombatStage.CLEAR_HOLD = 2.5;
RdCombatStage.BOSS_SLOWMO = 0.9;
RdCombatStage.FINAL_HOLD = 4;
class RdWaveStage extends RdCombatStage {
    constructor() {
        super(...arguments);
        this.kind = "wave";
        this.spawned = 0;
        this.nextWaveAt = 0;
        this.fightStart = 0;
    }
    get slowClear() {
        return false;
    }
    wave() {
        return this.spawned;
    }
    waves() {
        return RdWavePlan.WAVES.length;
    }
    hint(engine) {
        const brief = this.phase === "brief" || (this.phase === "fight" && engine.time - this.fightStart < RdWavePlan.ROLE_HINT_SECONDS);
        return brief ? RdWavePlan.ROLE_HINT : "";
    }
    beginFight(engine) {
        this.fightStart = engine.time;
        this.spawnNext(engine);
    }
    spawnNext(engine) {
        const spec = RdWavePlan.WAVES[this.spawned];
        const offset = this.spawned * 3;
        let door = offset;
        const doorNext = () => (door++) % RdMapData.DOORS.length;
        for (let index = 0; index < spec.warriors; index++)
            engine.spawnMob("warrior", new RdDoorSpawn(doorNext()));
        for (let index = 0; index < spec.rogues; index++)
            engine.spawnMob("rogue", new RdDoorSpawn(doorNext()));
        for (let index = 0; index < spec.minionPairs; index++)
            engine.spawnMinionPair();
        for (let index = 0; index < spec.mages; index++)
            engine.spawnMob("mage", new RdGroundSpawn(engine.nextGroundSpot()));
        this.spawned++;
        this.nextWaveAt = engine.time + RdWavePlan.INTERVAL;
    }
    fightTick(engine) {
        if (this.spawned >= RdWavePlan.WAVES.length)
            return;
        if (engine.time >= this.nextWaveAt || engine.countedFoes() === 0)
            this.spawnNext(engine);
    }
    fightOver(engine) {
        return this.spawned >= RdWavePlan.WAVES.length && engine.countedFoes() === 0;
    }
}
class RdBossStage extends RdCombatStage {
    constructor() {
        super(...arguments);
        this.kind = "boss";
        this.boss = null;
    }
    get slowClear() {
        return true;
    }
    beginFight(engine) {
        const kind = this.floor.boss;
        const boss = RdBossFactory.create(kind, engine.allocateId());
        this.boss = boss;
        engine.spawnFoe(boss, new RdGateSpawn());
        engine.emit({ t: "fx", k: "boss-enter", x: boss.x, z: boss.z, r: 0, id: boss.id, d: 0 });
    }
    fightOver(engine) {
        if (!this.boss || this.boss.hp > 0)
            return false;
        engine.emit({ t: "fx", k: "boss-down", x: this.boss.x, z: this.boss.z, r: 0, id: this.boss.id, d: 0 });
        engine.clearFoes();
        return true;
    }
}
class RdRewardStage extends RdStage {
    constructor() {
        super(...arguments);
        this.kind = "reward";
        this.zone = new RdReadyZone(RdMapData.VAULT_READY);
    }
    enter(engine) {
        super.enter(engine);
        engine.world.vaultOpen = true;
        this.setPhase(engine, "loot");
        engine.heroes.forEach((hero) => {
            if (hero.gone)
                return;
            const chest = new RdRewardChest(engine.allocateId(), hero.slot);
            const spot = RdMapData.CHEST_SPOTS[hero.slot];
            chest.place(spot.x, spot.z);
            chest.yaw = -Math.PI / 2;
            engine.addFoe(chest);
            engine.emit({ t: "spawn", id: chest.id, door: -1 });
        });
    }
    get label() {
        return this.floor.floor + "층 보상방";
    }
    readyZone() {
        return this.zone;
    }
    update(engine) {
        engine.expireOffers();
        return this.zone.update(engine, engine.offers.size > 0);
    }
    exit(engine) {
        engine.world.vaultOpen = false;
        engine.clearFoes();
        engine.offers.clear();
    }
}
class RdFlow {
    constructor() {
        this.index = 0;
        this.transition = 0;
        this.recordStart = -1;
        this.recordEnd = -1;
        this.pausedSeconds = 0;
        this.pauseFrom = -1;
        this.outcome = "running";
        this.times = [];
        this.stages = [];
        RdFloorPlan.FLOORS.forEach((floor) => {
            this.stages.push(RdFlow.stageFor(floor));
            if (RdFloorPlan.hasReward(floor.floor))
                this.stages.push(new RdRewardStage(floor));
        });
    }
    static stageFor(floor) {
        return RdFlow.STAGE_BUILDERS[floor.kind](floor);
    }
    get stage() {
        return this.stages[this.index];
    }
    begin(engine) {
        this.stage.enter(engine);
    }
    update(engine) {
        if (this.outcome !== "running")
            return;
        if (!this.stage.update(engine))
            return;
        this.times.push([this.stage.label, Math.round((engine.time - this.stage.enteredAt) * 10) / 10]);
        this.stage.exit(engine);
        if (this.index === 0)
            this.recordStart = engine.time;
        if (this.stage.kind === "reward" && this.pauseFrom >= 0) {
            this.pausedSeconds += engine.time - this.pauseFrom;
            this.pauseFrom = -1;
        }
        if (this.index >= this.stages.length - 1) {
            this.outcome = "success";
            return;
        }
        this.index++;
        if (this.stage.kind === "reward")
            this.pauseFrom = engine.time;
        this.stage.enter(engine);
    }
    fail(engine) {
        if (this.outcome !== "running")
            return;
        this.times.push([this.stage.label, Math.round((engine.time - this.stage.enteredAt) * 10) / 10]);
        this.outcome = "fail";
    }
    recordSeconds(engine) {
        return RdRecordClock.seconds(this.recordStart, this.recordEnd, this.pausedSeconds, this.pauseFrom, engine.time);
    }
}
RdFlow.STAGE_BUILDERS = {
    ready: (floor) => new RdReadyStage(floor),
    wave: (floor) => new RdWaveStage(floor),
    boss: (floor) => new RdBossStage(floor)
};
class RdRecordClock {
    static seconds(start, end, paused, pauseFrom, now) {
        if (start < 0)
            return 0;
        const stop = end >= 0 ? end : now;
        const running = pauseFrom >= 0 && end < 0 ? Math.max(0, now - pauseFrom) : 0;
        return Math.max(0, stop - start - paused - running);
    }
    static ofFlow(flow, now) {
        return RdRecordClock.seconds(flow.rs, flow.re, flow.rp || 0, flow.rq === undefined ? -1 : flow.rq, now);
    }
}
class RdEngine {
    constructor(randomSource, pilots) {
        this.world = new RdCollisionWorld();
        this.heroes = [];
        this.foes = [];
        this.projectiles = [];
        this.telegraphs = [];
        this.areas = [];
        this.offers = new Map();
        this.flow = new RdFlow();
        this.mechanic = null;
        this.enemyAttackScale = 1;
        this.time = 0;
        this.lastDt = 0;
        this.banner = null;
        this.events = [];
        this.scheduled = [];
        this.idCounter = 100;
        this.doorCursor = 0;
        this.groundCursor = 0;
        this.areaTickAt = 0;
        this.engaged = new Set();
        this.started = false;
        this.random = new RdRandom(randomSource);
        for (let slot = 0; slot < RdRules.SEATS; slot++)
            this.heroes.push(new RdHero(slot, pilots[slot]));
    }
    allocateId() {
        return this.idCounter++;
    }
    emit(event) {
        this.events.push(event);
    }
    schedule(at, run) {
        this.scheduled.push({ at, run });
    }
    heroById(id) {
        return id >= 1 && id <= this.heroes.length ? this.heroes[id - 1] : null;
    }
    foeById(id) {
        for (const foe of this.foes)
            if (foe.id === id)
                return foe;
        return null;
    }
    livingHeroes() {
        return this.heroes.filter((hero) => hero.alive);
    }
    activeBoss() {
        for (const foe of this.foes)
            if (foe instanceof RdBoss && foe.hp > 0)
                return foe;
        return null;
    }
    countedFoes() {
        return this.foes.filter((foe) => foe.countsForClear && foe.hp > 0).length;
    }
    hittableFoes(hero) {
        return this.foes.filter((foe) => !foe.removed && foe.hp > 0 && foe.canBeHitBy(hero) && !foe.invulnerable(this) && !foe.hidden(this.time));
    }
    isEngaged(enemy) {
        return this.engaged.has(enemy.id);
    }
    addFoe(foe) {
        this.foes.push(foe);
    }
    removeFoe(foe) {
        foe.removed = true;
        const index = this.foes.indexOf(foe);
        if (index >= 0)
            this.foes.splice(index, 1);
    }
    clearFoes() {
        this.foes.slice().forEach((foe) => this.removeFoe(foe));
        this.projectiles.length = 0;
        this.telegraphs.length = 0;
        this.areas.length = 0;
        if (this.mechanic)
            this.mechanic = null;
    }
    spawnFoe(foe, style) {
        foe.spawnStyle = style;
        foe.spawnStart = this.time;
        this.refreshBodies();
        style.begin(this, foe);
        if (foe instanceof RdEnemy)
            foe.attackScale = this.enemyAttackScale;
        this.addFoe(foe);
        this.emit({ t: "spawn", id: foe.id, door: style.door });
    }
    spawnMob(kind, style) {
        const mob = RdMobFactory.create(kind, this.allocateId());
        this.spawnFoe(mob, style);
        return mob;
    }
    nextDoor() {
        return (this.doorCursor++) % RdMapData.DOORS.length;
    }
    nextGroundSpot() {
        const spot = RdMapData.GROUND_SPOTS[(this.groundCursor++) % RdMapData.GROUND_SPOTS.length];
        return { x: spot.x, z: spot.z };
    }
    spawnMinionPair() {
        const spot = this.nextGroundSpot();
        this.spawnMob("minion", new RdGroundSpawn({ x: spot.x - 60, z: spot.z }));
        this.spawnMob("minion", new RdGroundSpawn({ x: spot.x + 60, z: spot.z }));
    }
    addTelegraph(shape, end) {
        const id = this.allocateId();
        this.telegraphs.push({ id, shape, start: this.time, end });
        return id;
    }
    addArea(shape, seconds, dps, slow) {
        this.areas.push({ id: this.allocateId(), shape, start: this.time, end: this.time + seconds, dps, slow });
    }
    launch(style, hero, target, damage, speed) {
        const projectile = new RdProjectile(this.allocateId(), style, hero.x, hero.z, speed, target.id, damage, true, hero.id);
        this.projectiles.push(projectile);
        this.emit({ t: "proj", p: projectile.id, s: style, from: hero.id, to: target.id, x: Math.round(hero.x), z: Math.round(hero.z), tx: Math.round(target.x), tz: Math.round(target.z), v: speed });
    }
    launchAtHero(style, source, target, damage, speed) {
        const projectile = new RdProjectile(this.allocateId(), style, source.x, source.z, speed, target.id, damage, false, source.id);
        this.projectiles.push(projectile);
        this.emit({ t: "proj", p: projectile.id, s: style, from: source.id, to: target.id, x: Math.round(source.x), z: Math.round(source.z), tx: Math.round(target.x), tz: Math.round(target.z), v: speed });
    }
    damageFoe(foe, amount, hero) {
        if (foe.removed || foe.hp <= 0 || foe.invulnerable(this) || foe.hidden(this.time))
            return 0;
        if (hero && !foe.canBeHitBy(hero))
            return 0;
        const scaled = Math.max(1, Math.round(amount * foe.damageFactor(this.time)));
        const dealt = foe.absorb(this, scaled);
        if (hero && foe.creditsDamage)
            hero.damageDone += dealt;
        this.emit(hero ? { t: "dmg", id: foe.id, v: scaled, heal: false, by: hero.id } : { t: "dmg", id: foe.id, v: scaled, heal: false });
        if (foe.hp <= 0 && !(foe instanceof RdManaPillar)) {
            this.emit({ t: "die", id: foe.id });
            foe.onDeath(this);
            this.removeFoe(foe);
        }
        return dealt;
    }
    damageHero(hero, amount, unavoidable = false) {
        if (!hero.alive || (!unavoidable && this.time < hero.invulnerableUntil))
            return 0;
        const value = Math.max(1, Math.round(amount));
        hero.damageTaken += Math.min(value, Math.max(0, hero.hp));
        hero.hp -= value;
        this.emit({ t: "dmg", id: hero.id, v: value, heal: false });
        if (hero.hp <= 0)
            this.knockDown(hero);
        return value;
    }
    knockHero(hero, fromX, fromZ, distance) {
        if (!hero.alive)
            return;
        const away = RdMath.normalize(hero.x - fromX, hero.z - fromZ);
        const direction = away.x || away.z ? away : { x: Math.sin(hero.yaw + Math.PI), z: Math.cos(hero.yaw + Math.PI) };
        const knock = RdKnockback.dash(direction, distance);
        if (!hero.pilot.external)
            hero.dash = knock;
        hero.stunUntil = Math.max(hero.stunUntil, this.time + RdKnockback.SECONDS);
        this.emit({ t: "fx", k: "knock", x: Math.round(hero.x), z: Math.round(hero.z), r: distance, id: hero.id, d: RdMath.yawOf(direction.x, direction.z) });
    }
    launchHero(hero, seconds) {
        if (!hero.alive)
            return;
        hero.dash = null;
        hero.airborneUntil = this.time + seconds;
        hero.stunUntil = Math.max(hero.stunUntil, this.time + seconds);
    }
    knockDown(hero) {
        if (hero.down)
            return;
        hero.hp = 0;
        hero.down = true;
        hero.downs++;
        hero.dash = null;
        hero.moving = false;
        this.emit({ t: "down", id: hero.id });
    }
    healHero(hero, amount, healer) {
        if (!hero.alive)
            return;
        const value = Math.min(hero.maxHp - hero.hp, Math.round(amount));
        hero.hp += value;
        healer.healingDone += value;
        this.emit({ t: "dmg", id: hero.id, v: Math.round(amount), heal: true });
    }
    reviveAll() {
        this.heroes.forEach((hero) => {
            if (hero.gone)
                return;
            const wasDown = hero.down;
            hero.reviveFull();
            if (wasDown) {
                this.refreshBodies();
                const spot = this.world.freeSpotNear(hero.x, hero.z, hero.radius, hero.id);
                hero.place(spot.x, spot.z);
            }
            this.emit({ t: "fx", k: "revive", x: hero.x, z: hero.z, r: 0, id: hero.id, d: 0 });
        });
    }
    onFloorCleared(floor) {
        if (floor === RdFloorPlan.LAST_FLOOR)
            this.flow.recordEnd = this.time;
        this.reviveAll();
    }
    floorEvent(kind, floor) {
        this.banner = { k: kind, f: floor, at: this.time };
        this.emit({ t: "floor", k: kind, f: floor });
    }
    teleportHeroes() {
        this.flow.transition++;
        this.refreshBodies();
        this.heroes.forEach((hero) => {
            const spot = RdMapData.HERO_STARTS[hero.slot];
            hero.place(spot.x, spot.z);
            hero.yaw = Math.PI;
            hero.dash = null;
        });
    }
    startMechanic(boss, kind) {
        boss.cast = null;
        this.telegraphs.length = 0;
        this.mechanic = RdMechanics.create(kind, boss, this);
        this.emit({ t: "act", id: boss.id, a: "channel" });
    }
    openOffer(slot) {
        const floor = this.flow.stage.floor.floor;
        this.offers.set(slot, {
            slot, floor, tier: RdRewardRules.floorTier(floor), phase: "stat", deadline: this.time + RdBalance.PICK_SECONDS,
            stats: RdRewardRules.drawStatCards(this.random), gear: RdRewardRules.drawGearCards(this.random)
        });
    }
    choose(slot, kind, index, floor) {
        const offer = this.offers.get(slot);
        const hero = this.heroes[slot];
        if (!offer || offer.phase !== kind || offer.floor !== floor || !hero)
            return false;
        if (kind === "stat") {
            const key = offer.stats[RdMath.clamp(Math.floor(index), 0, offer.stats.length - 1)];
            hero.stats.addCard(key, offer.tier);
            hero.refreshMaxHp();
            offer.phase = "gear";
            offer.deadline = this.time + RdBalance.PICK_SECONDS;
            return true;
        }
        if (index >= 0) {
            const card = offer.gear[Math.floor(index)];
            if (!card || !RdRewardRules.canEquip(hero.stats.gear, card))
                return false;
            hero.stats.equip(card);
            hero.refreshMaxHp();
        }
        this.offers.delete(slot);
        return true;
    }
    expireOffers() {
        this.offers.forEach((offer, slot) => {
            if (this.time < offer.deadline)
                return;
            if (offer.phase === "stat")
                this.choose(slot, "stat", this.random.int(offer.stats.length), offer.floor);
            else
                this.choose(slot, "gear", -1, offer.floor);
        });
    }
    setGone(slot) {
        const hero = this.heroes[slot];
        if (!hero || hero.gone)
            return;
        hero.gone = true;
        this.knockDown(hero);
    }
    placeExternal(slot, x, z, yaw, moving, transition) {
        const hero = this.heroes[slot];
        if (!hero || !hero.pilot.external || !hero.alive || transition !== this.flow.transition)
            return;
        if (!RdMath.finite(x) || !RdMath.finite(z))
            return;
        hero.x = x;
        hero.z = z;
        hero.yaw = yaw;
        hero.moving = moving;
    }
    pickTarget(hero, intent, reach) {
        const candidates = this.hittableFoes(hero).filter((foe) => hero.distanceTo(foe) - foe.radius <= reach);
        if (!candidates.length)
            return null;
        const focused = candidates.filter((foe) => foe.id === intent.focus)[0];
        if (focused)
            return focused;
        const aimLength = Math.hypot(intent.aimX, intent.aimZ);
        if (aimLength > 0.1) {
            const aimYaw = RdMath.yawOf(intent.aimX, intent.aimZ);
            const inCone = candidates
                .map((foe) => ({ foe, off: Math.abs(RdMath.angleDiff(RdMath.yawOf(foe.x - hero.x, foe.z - hero.z), aimYaw)) }))
                .filter((entry) => entry.off <= Math.PI / 4)
                .sort((a, b) => a.off - b.off || hero.distanceTo(a.foe) - hero.distanceTo(b.foe));
            if (inCone.length)
                return inCone[0].foe;
        }
        return candidates.sort((a, b) => hero.distanceTo(a) - hero.distanceTo(b))[0];
    }
    begin() {
        if (this.started)
            return;
        this.started = true;
        this.flow.begin(this);
    }
    update(dt) {
        this.begin();
        this.lastDt = dt;
        this.time += dt;
        if (this.flow.outcome === "running") {
            this.flow.update(this);
            this.refreshBodies();
            this.heroes.forEach((hero) => this.driveHero(hero, dt));
            this.refreshBodies();
            this.planEngagement();
            this.foes.slice().forEach((foe) => { if (!foe.removed)
                foe.update(this, dt); });
            this.updateProjectiles(dt);
            this.runScheduled();
            this.updateAreas();
            this.updateMechanic();
            this.telegraphs.splice(0, this.telegraphs.length, ...this.telegraphs.filter((telegraph) => telegraph.end > this.time));
            if (this.flow.index > 0 && this.livingHeroes().length === 0)
                this.flow.fail(this);
        }
        const out = this.events;
        this.events = [];
        return out;
    }
    refreshBodies() {
        const bodies = [];
        this.heroes.forEach((hero) => { if (hero.alive)
            bodies.push(hero); });
        this.foes.forEach((foe) => { if (foe.solid && !foe.hidden(this.time))
            bodies.push(foe); });
        this.world.bodies = bodies;
    }
    driveHero(hero, dt) {
        if (!hero.alive) {
            hero.moving = false;
            return;
        }
        const intent = hero.pilot.intent(this, hero, dt);
        hero.intent = intent;
        if (!hero.pilot.external)
            RdHeroMover.step(hero, intent, dt, this.world, this.time);
        this.handleSkills(hero, intent);
        if (intent.attack)
            this.tryBasicAttack(hero, intent);
    }
    handleSkills(hero, intent) {
        hero.heroClass.skills.forEach((skill, index) => {
            const seq = intent.skills[index] || 0;
            if (seq === hero.seenSkillSeq[index])
                return;
            hero.seenSkillSeq[index] = seq;
            if (this.time < hero.skillReadyAt[index] || hero.isStunned(this.time) || hero.dash)
                return;
            if (!skill.cast(this, hero, intent))
                return;
            hero.skillReadyAt[index] = this.time + hero.skillCooldown(index);
            this.emit({ t: "act", id: hero.id, a: RdHeroAnimations.SKILL[skill.key] });
            if (!hero.pilot.external)
                hero.dash = skill.motion(hero, intent, this.hittableFoes(hero));
        });
    }
    tryBasicAttack(hero, intent) {
        if (this.time < hero.attackReadyAt || hero.isStunned(this.time) || hero.dash)
            return;
        const target = this.pickTarget(hero, intent, hero.spec.range);
        if (!target)
            return;
        hero.attackReadyAt = this.time + hero.stats.interval();
        hero.faceUntil = this.time + 0.6;
        if (!hero.pilot.external)
            hero.faceToward(target.x, target.z);
        let damage = hero.stats.attack();
        if (this.time < hero.empoweredUntil) {
            damage *= RdBalance.DASH.factor;
            hero.empoweredUntil = 0;
        }
        hero.heroClass.strike(this, hero, target, damage);
        this.emit({ t: "act", id: hero.id, a: hero.heroClass.animation });
    }
    planEngagement() {
        this.engaged.clear();
        const melee = [];
        this.foes.forEach((foe) => {
            if (!(foe instanceof RdEnemy) || foe.removed || foe.spawning(this.time))
                return;
            const target = foe.isBoss ? null : foe.brain.chooseTarget(this, foe);
            if (!foe.isBoss)
                foe.targetId = target ? target.id : -1;
            if (foe.isBoss || foe.spec.ranged) {
                this.engaged.add(foe.id);
                return;
            }
            melee.push(foe);
        });
        this.heroes.forEach((hero) => {
            melee
                .filter((foe) => foe.targetId === hero.id)
                .sort((a, b) => a.distanceTo(hero) - b.distanceTo(hero))
                .slice(0, RdBalance.MELEE_SLOTS_PER_HERO)
                .forEach((foe) => this.engaged.add(foe.id));
        });
    }
    updateProjectiles(dt) {
        const keep = [];
        this.projectiles.forEach((projectile) => {
            const target = projectile.friendly ? this.foeById(projectile.targetId) : this.heroById(projectile.targetId);
            const valid = !!target && (projectile.friendly ? !target.removed && target.hp > 0 : target.alive);
            if (!valid || !target) {
                this.emit({ t: "hitp", p: projectile.id });
                return;
            }
            const dx = target.x - projectile.x, dz = target.z - projectile.z;
            const distance = Math.hypot(dx, dz);
            const step = projectile.speed * dt;
            if (distance <= step + target.radius * 0.6) {
                this.emit({ t: "hitp", p: projectile.id });
                if (projectile.friendly)
                    this.damageFoe(target, projectile.damage, this.heroById(projectile.shooter));
                else
                    this.damageHero(target, projectile.damage);
                return;
            }
            projectile.x += (dx / distance) * step;
            projectile.z += (dz / distance) * step;
            projectile.travelled += step;
            if (projectile.travelled > 4000) {
                this.emit({ t: "hitp", p: projectile.id });
                return;
            }
            keep.push(projectile);
        });
        this.projectiles.splice(0, this.projectiles.length, ...keep);
    }
    runScheduled() {
        const due = this.scheduled.filter((entry) => entry.at <= this.time);
        if (!due.length)
            return;
        this.scheduled = this.scheduled.filter((entry) => entry.at > this.time);
        due.forEach((entry) => entry.run());
    }
    updateAreas() {
        this.areas.splice(0, this.areas.length, ...this.areas.filter((area) => area.end > this.time));
        this.heroes.forEach((hero) => {
            if (!hero.alive)
                return;
            if (this.areas.some((area) => area.slow && area.start <= this.time && RdShapes.contains(area.shape, hero.x, hero.z, 0)))
                hero.slowUntil = Math.max(hero.slowUntil, this.time + 0.3);
        });
        if (this.time < this.areaTickAt)
            return;
        this.areaTickAt = this.time + RdBalance.AREA_TICK;
        this.areas.forEach((area) => {
            if (area.start > this.time)
                return;
            this.heroes.forEach((hero) => {
                if (hero.alive && RdShapes.contains(area.shape, hero.x, hero.z, 0))
                    this.damageHero(hero, area.dps * RdBalance.AREA_TICK);
            });
        });
    }
    updateMechanic() {
        const mechanic = this.mechanic;
        if (!mechanic)
            return;
        if (mechanic.boss.hp <= 0 || mechanic.boss.removed) {
            mechanic.finish(this);
            this.mechanic = null;
            return;
        }
        mechanic.update(this);
        if (mechanic.outcome === "running")
            return;
        mechanic.finish(this);
        this.mechanic = null;
        mechanic.boss.mechanicEnded(this);
    }
}
class RdHeroAnimations {
}
RdHeroAnimations.SKILL = { taunt: "taunt", charge: "charge", fireball: "fireball", dash: "dash", heal: "heal" };
class RdKnockback {
    static dash(direction, distance) {
        return { dirX: direction.x, dirZ: direction.z, speed: distance / RdKnockback.SECONDS, left: distance, kind: "knock" };
    }
}
RdKnockback.SECONDS = 0.28;
class RdZonePlanner {
    static assign(zones, heroes) {
        const result = new Map();
        const taken = new Set();
        const claim = (hero) => {
            let best = -1, bestDistance = Infinity;
            zones.forEach((zone, index) => {
                if (taken.has(index))
                    return;
                const distance = Math.hypot(zone.x - hero.x, zone.z - hero.z);
                if (distance < bestDistance) {
                    best = index;
                    bestDistance = distance;
                }
            });
            if (best < 0)
                return;
            taken.add(best);
            result.set(hero.slot, best);
        };
        heroes.filter((hero) => !hero.pilot.bot).forEach(claim);
        heroes.filter((hero) => hero.pilot.bot).forEach(claim);
        return result;
    }
}
class RdZoneSpots {
    static around(circle) {
        const spots = [{ x: circle.x, z: circle.z }];
        for (let index = 0; index < 6; index++) {
            const angle = (index / 6) * Math.PI * 2;
            spots.push({ x: circle.x + Math.sin(angle) * RdZoneSpots.RING, z: circle.z + Math.cos(angle) * RdZoneSpots.RING });
        }
        return spots;
    }
}
RdZoneSpots.OCCUPIED = 70;
RdZoneSpots.RING = 115;
class RdBotArena {
    static clamp(point) {
        const hall = RdMapData.HALL, margin = RdBotArena.MARGIN;
        return { x: RdMath.clamp(point.x, hall.minX + margin, hall.maxX - margin), z: RdMath.clamp(point.z, hall.minZ + margin, hall.maxZ - margin) };
    }
}
RdBotArena.MARGIN = 110;
class RdBotRoute {
    static via(hero, goal, lane) {
        const heroInVault = hero.x > RdMapData.HALL.maxX - 20;
        const goalInVault = goal.x > RdMapData.HALL.maxX;
        if (heroInVault === goalInVault)
            return goal;
        const laneZ = lane * 45;
        const lined = Math.abs(hero.z - laneZ) < 90 && hero.x > 1500 && hero.x < 2000;
        const inside = { x: RdBotRoute.PASSAGE_IN.x, z: laneZ }, outside = { x: RdBotRoute.PASSAGE_OUT.x, z: laneZ };
        if (lined)
            return goalInVault ? outside : inside;
        return goalInVault ? inside : outside;
    }
}
RdBotRoute.PASSAGE_IN = { x: 1640, z: 0 };
RdBotRoute.PASSAGE_OUT = { x: 1960, z: 0 };
class RdHeroBotBrain {
    constructor(random) {
        this.random = random;
        this.external = false;
        this.bot = true;
        this.goal = null;
        this.attack = false;
        this.focus = -1;
        this.aim = { x: 0, z: -1 };
        this.moveOverride = null;
        this.skillSeq = [0, 0, 0];
        this.thinkAt = 0;
        this.progressAt = 0;
        this.progressX = 0;
        this.progressZ = 0;
        this.stallCount = 0;
        this.detourUntil = 0;
        this.detourSide = 1;
        this.detour = { x: 0, z: 0 };
        this.pickAt = -1;
        this.pickPhase = "";
        this.noticed = new Map();
    }
    intent(engine, hero) {
        if (engine.time >= this.thinkAt) {
            this.thinkAt = engine.time + RdHeroBotBrain.THINK_SECONDS + this.random.next() * 0.06;
            this.moveOverride = null;
            this.trackProgress(engine, hero);
            this.think(engine, hero);
            if (!this.moveOverride)
                this.sidestep(engine, hero);
        }
        let moveX = 0, moveZ = 0;
        if (this.moveOverride) {
            moveX = this.moveOverride.x;
            moveZ = this.moveOverride.z;
        }
        else if (this.goal) {
            const waypoint = RdBotRoute.via(hero, this.goal, hero.slot - 2);
            const dx = waypoint.x - hero.x, dz = waypoint.z - hero.z;
            const distance = Math.hypot(dx, dz);
            if (distance > 16) {
                const scale = Math.min(1, distance / 60);
                moveX = (dx / distance) * scale;
                moveZ = (dz / distance) * scale;
            }
        }
        return { moveX, moveZ, aimX: this.aim.x, aimZ: this.aim.z, attack: this.attack, focus: this.focus, skills: this.skillSeq.slice() };
    }
    press(index) {
        this.skillSeq[index]++;
    }
    trackProgress(engine, hero) {
        if (engine.time - this.progressAt < 0.6)
            return;
        const wanting = !!this.goal && Math.hypot(this.goal.x - hero.x, this.goal.z - hero.z) > 40;
        const moved = Math.hypot(hero.x - this.progressX, hero.z - this.progressZ);
        this.stallCount = wanting && moved < 20 ? this.stallCount + 1 : 0;
        this.progressAt = engine.time;
        this.progressX = hero.x;
        this.progressZ = hero.z;
    }
    sidestep(engine, hero) {
        if (engine.time < this.detourUntil) {
            this.moveOverride = this.detour;
            return;
        }
        if (this.stallCount < 3 || !this.goal)
            return;
        const toward = RdMath.normalize(this.goal.x - hero.x, this.goal.z - hero.z);
        this.detourSide = -this.detourSide;
        const side = { x: -toward.z * this.detourSide, z: toward.x * this.detourSide };
        const ahead = { x: hero.x + side.x * 150, z: hero.z + side.z * 150 };
        this.detour = engine.world.regionContains(ahead.x, ahead.z, hero.radius) ? side : { x: -side.x, z: -side.z };
        this.detourUntil = engine.time + 0.7;
        this.stallCount = 0;
        this.moveOverride = this.detour;
    }
    skillReady(engine, hero, index) {
        return engine.time >= hero.skillReadyAt[index] && !hero.dash;
    }
    aimAt(hero, point) {
        const direction = RdMath.normalize(point.x - hero.x, point.z - hero.z);
        if (direction.x || direction.z)
            this.aim = direction;
    }
    think(engine, hero) {
        this.attack = false;
        this.focus = -1;
        this.answerOffer(engine, hero);
        const stage = engine.flow.stage;
        if (stage.kind === "ready")
            this.prepare(engine, hero);
        else if (stage.kind === "reward")
            this.loot(engine, hero);
        else if (stage.phase !== "fight")
            this.goal = null;
        else if (engine.mechanic)
            this.mechanic(engine, hero, engine.mechanic);
        else
            this.fight(engine, hero);
        if (stage.kind === "wave" || stage.kind === "boss") {
            if (this.goal)
                this.goal = RdBotArena.clamp(this.goal);
            this.dodge(engine, hero);
        }
    }
    targets(engine, hero) {
        return engine.hittableFoes(hero).filter((foe) => foe.countsForClear);
    }
    nearest(hero, foes) {
        let best = null;
        foes.forEach((foe) => { if (!best || hero.distanceTo(foe) < hero.distanceTo(best))
            best = foe; });
        return best;
    }
    primary(engine, hero) {
        const foes = this.targets(engine, hero);
        const boss = foes.filter((foe) => foe instanceof RdBoss)[0];
        const mobs = foes.filter((foe) => !(foe instanceof RdBoss));
        const closeMob = this.nearest(hero, mobs);
        if (boss && (!closeMob || hero.distanceTo(closeMob) > 450))
            return boss;
        return closeMob || boss || null;
    }
    engage(hero, target, standoff) {
        this.focus = target.id;
        this.attack = true;
        this.aimAt(hero, target);
        const distance = hero.distanceTo(target);
        const want = standoff + target.radius;
        if (distance <= want && distance >= want * 0.55) {
            this.goal = null;
            return;
        }
        const away = RdMath.normalize(hero.x - target.x, hero.z - target.z);
        const direction = away.x || away.z ? away : { x: 0, z: 1 };
        this.goal = { x: target.x + direction.x * want * 0.85, z: target.z + direction.z * want * 0.85 };
    }
    surround(engine, hero, target, distance, angleOffset) {
        this.focus = target.id;
        this.attack = true;
        this.aimAt(hero, target);
        const base = RdMath.yawOf(hero.x - target.x, hero.z - target.z);
        const anchor = RdMath.yawOf(RdMapData.CENTER.x - target.x, RdMapData.CENTER.z + 600 - target.z);
        const blend = RdMath.angleDiff(anchor + angleOffset, base) * 0.5 + base;
        const want = distance + target.radius;
        const goal = { x: target.x + Math.sin(blend) * want, z: target.z + Math.cos(blend) * want };
        this.goal = engine.world.regionContains(goal.x, goal.z, hero.radius) ? goal : { x: target.x + Math.sin(base) * want, z: target.z + Math.cos(base) * want };
        if (Math.abs(hero.distanceTo(target) - want) < 60 && Math.abs(RdMath.angleDiff(base, blend)) < 0.25)
            this.goal = null;
    }
    kiteFrom(hero, threat, distance) {
        const away = RdMath.normalize(hero.x - threat.x, hero.z - threat.z);
        const straight = RdBotArena.clamp({ x: hero.x + away.x * distance, z: hero.z + away.z * distance });
        if (Math.hypot(straight.x - hero.x, straight.z - hero.z) > distance * 0.5) {
            this.goal = straight;
            return;
        }
        const side = hero.slot % 2 === 0 ? 1 : -1;
        this.goal = RdBotArena.clamp({ x: hero.x - away.z * side * distance, z: hero.z + away.x * side * distance });
    }
    prepare(engine, hero) {
        const practice = engine.time - engine.flow.stage.enteredAt < RdHeroBotBrain.PRACTICE_SECONDS + hero.slot * 0.4;
        const dummies = engine.hittableFoes(hero);
        const dummy = this.nearest(hero, dummies);
        if (practice && dummy) {
            this.engage(hero, dummy, Math.min(hero.spec.range * 0.7, 500));
            return;
        }
        this.goal = this.zoneSpot(engine, hero);
    }
    zoneSpot(engine, hero) {
        const stage = engine.flow.stage;
        const zone = stage.readyZone();
        if (!zone)
            return null;
        const inside = Math.hypot(hero.x - zone.circle.x, hero.z - zone.circle.z) <= zone.circle.r - 15;
        if (inside && this.stallCount >= 3)
            return null;
        const origin = stage.kind === "reward" ? RdBotRoute.PASSAGE_OUT : RdMapData.CENTER;
        const spots = RdZoneSpots.around(zone.circle);
        const others = engine.livingHeroes().filter((other) => other !== hero);
        const free = spots.filter((spot) => engine.world.regionContains(spot.x, spot.z, hero.radius) && others.every((other) => Math.hypot(other.x - spot.x, other.z - spot.z) >= RdZoneSpots.OCCUPIED));
        if (!free.length)
            return inside ? null : { x: zone.circle.x, z: zone.circle.z };
        const depth = (spot) => Math.hypot(spot.x - origin.x, spot.z - origin.z);
        const chosen = free.sort((a, b) => depth(b) - depth(a) || Math.hypot(a.x - hero.x, a.z - hero.z) - Math.hypot(b.x - hero.x, b.z - hero.z))[0];
        return Math.hypot(chosen.x - hero.x, chosen.z - hero.z) < 20 ? null : chosen;
    }
    loot(engine, hero) {
        const chest = engine.foes.filter((foe) => foe instanceof RdRewardChest && foe.owner === hero.slot && !foe.removed)[0];
        if (chest) {
            this.engage(hero, chest, Math.min(hero.spec.range * 0.6, 150));
            return;
        }
        if (engine.offers.has(hero.slot)) {
            this.goal = null;
            return;
        }
        this.goal = this.zoneSpot(engine, hero);
    }
    answerOffer(engine, hero) {
        const offer = engine.offers.get(hero.slot);
        if (!offer) {
            this.pickAt = -1;
            return;
        }
        if (this.pickPhase !== offer.phase || this.pickAt < 0) {
            this.pickPhase = offer.phase;
            this.pickAt = engine.time + this.random.range(RdHeroBotBrain.PICK_DELAY_MIN, RdHeroBotBrain.PICK_DELAY_MAX);
        }
        if (engine.time < this.pickAt)
            return;
        this.pickAt = -1;
        if (offer.phase === "stat") {
            const order = this.preferredStats();
            let best = 0;
            offer.stats.forEach((key, index) => { if (order.indexOf(key) < order.indexOf(offer.stats[best]))
                best = index; });
            engine.choose(hero.slot, "stat", best, offer.floor);
            return;
        }
        let bestGear = -1, bestScore = -1;
        offer.gear.forEach((card, index) => {
            if (!RdRewardRules.canEquip(hero.stats.gear, card))
                return;
            const score = card.tier * 10 + (card.slot === "weapon" ? 3 : card.slot === "armor" ? 2 : 1);
            if (score > bestScore) {
                bestScore = score;
                bestGear = index;
            }
        });
        engine.choose(hero.slot, "gear", bestGear, offer.floor);
    }
    mechanic(engine, hero, mechanic) {
        if (mechanic instanceof RdPillarSyncMechanic) {
            this.pillars(engine, hero, mechanic);
            return;
        }
        const zones = mechanic.zonePoints();
        const plan = RdZonePlanner.assign(zones, engine.livingHeroes());
        const index = plan.get(hero.slot);
        this.goal = index === undefined ? null : zones[index];
        const add = this.nearest(hero, this.targets(engine, hero).filter((foe) => !(foe instanceof RdBoss)));
        if (add && hero.distanceTo(add) <= hero.spec.range + add.radius) {
            this.attack = true;
            this.focus = add.id;
            this.aimAt(hero, add);
        }
    }
    pillars(engine, hero, mechanic) {
        const pillars = mechanic.activePillars();
        const standing = pillars.filter((pillar) => !pillar.broken);
        if (!standing.length) {
            this.goal = null;
            return;
        }
        const low = (pillar) => pillar.hp <= Math.max(55, pillar.maxHp * 0.22);
        const allLow = standing.every(low);
        const living = engine.livingHeroes();
        const order = living.indexOf(hero);
        const mine = pillars[Math.max(0, order) % pillars.length];
        let target;
        if (allLow) {
            target = !mine.broken ? mine : standing.slice().sort((a, b) => hero.distanceTo(a) - hero.distanceTo(b))[0];
        }
        else {
            const unfinished = standing.filter((pillar) => !low(pillar));
            target = !mine.broken && !low(mine) ? mine : unfinished.slice().sort((a, b) => b.hp - a.hp)[0];
        }
        const reach = Math.min(hero.spec.range * 0.85, hero.spec.range - 40);
        this.engage(hero, target, reach);
        this.attack = allLow || !low(target);
        if (allLow && this.attack)
            this.finisher(engine, hero, target);
    }
    finisher(engine, hero, target) {
        return;
    }
    noticeAt(telegraph) {
        let at = this.noticed.get(telegraph.id);
        if (at === undefined) {
            at = this.random.next() < RdHeroBotBrain.MISS_CHANCE ? Infinity : telegraph.start + this.random.range(RdHeroBotBrain.REACTION_MIN, RdHeroBotBrain.REACTION_MAX);
            this.noticed.set(telegraph.id, at);
            if (this.noticed.size > 64)
                this.noticed.delete(this.noticed.keys().next().value);
        }
        return at;
    }
    dangers(engine) {
        const shapes = [];
        engine.telegraphs.forEach((telegraph) => {
            if (telegraph.end - engine.time < RdHeroBotBrain.DANGER_LOOKAHEAD && engine.time >= this.noticeAt(telegraph))
                shapes.push(telegraph.shape);
        });
        engine.areas.forEach((area) => shapes.push(area.shape));
        return shapes;
    }
    dodge(engine, hero) {
        const shapes = this.dangers(engine);
        if (!shapes.length)
            return;
        const margin = hero.radius + RdHeroBotBrain.DANGER_MARGIN;
        const unsafe = (x, z) => shapes.some((shape) => RdShapes.contains(shape, x, z, margin));
        if (!unsafe(hero.x, hero.z) && (!this.goal || !unsafe(this.goal.x, this.goal.z)))
            return;
        const wanted = this.goal || { x: hero.x, z: hero.z };
        let best = null;
        let bestScore = Infinity;
        [180, 340, 520, 720].forEach((distance) => {
            for (let step = 0; step < 16; step++) {
                const angle = (step / 16) * Math.PI * 2;
                const x = hero.x + Math.sin(angle) * distance, z = hero.z + Math.cos(angle) * distance;
                if (!engine.world.regionContains(x, z, hero.radius + 10) || unsafe(x, z))
                    continue;
                const score = distance + Math.hypot(x - wanted.x, z - wanted.z) * 0.5;
                if (score < bestScore) {
                    bestScore = score;
                    best = { x, z };
                }
            }
        });
        if (best)
            this.goal = best;
    }
}
RdHeroBotBrain.THINK_SECONDS = 0.12;
RdHeroBotBrain.PICK_DELAY_MIN = 1;
RdHeroBotBrain.PICK_DELAY_MAX = 2;
RdHeroBotBrain.PRACTICE_SECONDS = 4;
RdHeroBotBrain.DANGER_LOOKAHEAD = 2.2;
RdHeroBotBrain.DANGER_MARGIN = 30;
RdHeroBotBrain.REACTION_MIN = 0.25;
RdHeroBotBrain.REACTION_MAX = 0.5;
RdHeroBotBrain.MISS_CHANCE = 0.12;
class RdKnightBot extends RdHeroBotBrain {
    preferredStats() {
        return ["hp", "cdr", "atk", "aspd", "move"];
    }
    fight(engine, hero) {
        const foes = this.targets(engine, hero);
        const boss = foes.filter((foe) => foe instanceof RdBoss)[0];
        if (boss) {
            this.surround(engine, hero, boss, hero.spec.range * 0.6, 0);
            if (this.skillReady(engine, hero, 0) && hero.distanceTo(boss) < 700)
                this.press(0);
            return;
        }
        if (!foes.length) {
            this.goal = { x: 0, z: 300 };
            return;
        }
        const allies = engine.livingHeroes().filter((ally) => ally !== hero);
        let target = foes[0], bestScore = Infinity;
        foes.forEach((foe) => {
            const guard = allies.reduce((closest, ally) => Math.min(closest, ally.distanceTo(foe)), Infinity);
            const score = Math.min(guard, 1200) * 0.6 + hero.distanceTo(foe) * 0.4;
            if (score < bestScore) {
                bestScore = score;
                target = foe;
            }
        });
        this.engage(hero, target, hero.spec.range * 0.7);
        const nearby = foes.filter((foe) => hero.distanceTo(foe) <= RdBalance.TAUNT.radius * 0.9);
        const chasingAllies = nearby.some((foe) => foe instanceof RdEnemy && foe.targetId !== hero.id && foe.targetId > 0);
        if (this.skillReady(engine, hero, 0) && (nearby.length >= 3 || (nearby.length >= 1 && chasingAllies)))
            this.press(0);
    }
}
class RdBarbarianBot extends RdHeroBotBrain {
    preferredStats() {
        return ["atk", "aspd", "hp", "cdr", "move"];
    }
    fight(engine, hero) {
        const target = this.primary(engine, hero);
        if (!target) {
            this.goal = { x: 200, z: 300 };
            return;
        }
        if (target instanceof RdBoss)
            this.surround(engine, hero, target, hero.spec.range * 0.55, 1.1);
        else
            this.engage(hero, target, hero.spec.range * 0.6);
        if (!this.skillReady(engine, hero, 0))
            return;
        const foes = this.targets(engine, hero);
        let best = null, bestCount = 0;
        foes.forEach((foe) => {
            const distance = hero.distanceTo(foe);
            if (distance < 220 || distance > RdBalance.CHARGE.distance)
                return;
            const count = foes.filter((other) => Math.hypot(other.x - foe.x, other.z - foe.z) <= RdBalance.CHARGE.splash + other.radius).length + (foe instanceof RdBoss ? 2 : 0);
            if (count > bestCount) {
                bestCount = count;
                best = foe;
            }
        });
        const chosen = best;
        if (chosen && bestCount >= 2) {
            this.aimAt(hero, chosen);
            this.press(0);
        }
    }
}
class RdRangedBot extends RdHeroBotBrain {
    fight(engine, hero) {
        const foes = this.targets(engine, hero);
        const target = this.primary(engine, hero);
        if (!target) {
            this.goal = { x: -200 + hero.slot * 100, z: 500 };
            return;
        }
        const threat = this.nearest(hero, foes.filter((foe) => !(foe instanceof RdBoss) && foe instanceof RdEnemy && !foe.spec.ranged));
        if (threat && hero.distanceTo(threat) < 330) {
            this.kiteFrom(hero, threat, 320);
            this.attack = true;
            this.focus = target.id;
            this.aimAt(hero, target);
        }
        else if (target instanceof RdBoss) {
            this.surround(engine, hero, target, Math.min(hero.spec.range * 0.75, 760), this.angleOffset);
        }
        else {
            this.engage(hero, target, hero.spec.range * 0.8);
        }
        this.useSkill(engine, hero, foes, threat);
    }
}
class RdMageBot extends RdRangedBot {
    constructor() {
        super(...arguments);
        this.angleOffset = -0.9;
    }
    preferredStats() {
        return ["atk", "cdr", "aspd", "hp", "move"];
    }
    useSkill(engine, hero, foes) {
        if (!this.skillReady(engine, hero, 0))
            return;
        const point = RdTargeting.bestBlast(foes.map((foe) => ({ x: foe.x, z: foe.z })), hero.x, hero.z, RdBalance.FIREBALL.range, RdBalance.FIREBALL.radius);
        if (!point)
            return;
        const spot = point;
        const count = foes.filter((foe) => Math.hypot(foe.x - spot.x, foe.z - spot.z) <= RdBalance.FIREBALL.radius).length;
        const bossNear = foes.some((foe) => foe instanceof RdBoss && hero.distanceTo(foe) <= RdBalance.FIREBALL.range);
        if (count >= 2 || bossNear)
            this.press(0);
    }
    finisher(engine, hero) {
        if (this.skillReady(engine, hero, 0))
            this.press(0);
    }
}
class RdRangerBot extends RdRangedBot {
    constructor() {
        super(...arguments);
        this.angleOffset = 0.9;
    }
    preferredStats() {
        return ["aspd", "atk", "move", "hp", "cdr"];
    }
    useSkill(engine, hero, foes, threat) {
        if (!this.skillReady(engine, hero, 0))
            return;
        if (threat && hero.distanceTo(threat) < 230) {
            const away = RdMath.normalize(hero.x - threat.x, hero.z - threat.z);
            if (engine.world.regionContains(hero.x + away.x * RdBalance.DASH.distance, hero.z + away.z * RdBalance.DASH.distance, hero.radius)) {
                this.moveOverride = away;
                this.press(0);
            }
            return;
        }
        const boss = foes.filter((foe) => foe instanceof RdBoss)[0];
        if (boss && this.random.next() < 0.25) {
            const toBoss = RdMath.normalize(boss.x - hero.x, boss.z - hero.z);
            const side = this.random.next() < 0.5 ? 1 : -1;
            const sideways = { x: -toBoss.z * side, z: toBoss.x * side };
            if (engine.world.regionContains(hero.x + sideways.x * RdBalance.DASH.distance, hero.z + sideways.z * RdBalance.DASH.distance, hero.radius)) {
                this.moveOverride = sideways;
                this.press(0);
            }
        }
    }
}
class RdPriestBot extends RdRangedBot {
    constructor() {
        super(...arguments);
        this.angleOffset = 0.25;
    }
    preferredStats() {
        return ["cdr", "hp", "aspd", "atk", "move"];
    }
    fight(engine, hero) {
        super.fight(engine, hero);
        const knight = engine.heroes[0];
        const target = this.primary(engine, hero);
        if (target && knight.alive && !(target instanceof RdBoss) && hero.distanceTo(knight) > 700) {
            const towardKnight = RdMath.normalize(knight.x - hero.x, knight.z - hero.z);
            this.goal = { x: knight.x - towardKnight.x * 380, z: knight.z - towardKnight.z * 380 };
        }
    }
    useSkill(engine, hero) {
        if (!this.skillReady(engine, hero, 0))
            return;
        const ally = RdTargeting.lowestAlly(engine.heroes, hero, RdBalance.HEAL.range);
        if (ally && ally.hp / ally.maxHp < 0.7)
            this.press(0);
    }
}
class RdHeroBots {
    static create(slot, random) {
        return RdHeroBots.BUILDERS[slot](random);
    }
}
RdHeroBots.BUILDERS = [
    (random) => new RdKnightBot(random), (random) => new RdBarbarianBot(random), (random) => new RdMageBot(random),
    (random) => new RdRangerBot(random), (random) => new RdPriestBot(random)
];
class RdHeroFlags {
}
RdHeroFlags.DOWN = 1;
RdHeroFlags.GONE = 2;
RdHeroFlags.MOVING = 4;
RdHeroFlags.DASH = 8;
RdHeroFlags.INVULNERABLE = 16;
RdHeroFlags.STUNNED = 32;
RdHeroFlags.SLOWED = 64;
RdHeroFlags.EMPOWERED = 128;
RdHeroFlags.AIRBORNE = 256;
class RdFoeFlags {
}
RdFoeFlags.MOVING = 1;
RdFoeFlags.SPAWNING = 2;
RdFoeFlags.HIDDEN = 4;
RdFoeFlags.STUNNED = 8;
RdFoeFlags.INVULNERABLE = 16;
RdFoeFlags.BROKEN = 32;
RdFoeFlags.VULNERABLE = 64;
class RdFoeRadius {
}
RdFoeRadius.OF = {
    minion: RdBalance.MOBS.minion.radius, warrior: RdBalance.MOBS.warrior.radius, rogue: RdBalance.MOBS.rogue.radius, mage: RdBalance.MOBS.mage.radius,
    giant: RdBalance.GIANT.radius, archmage: RdBalance.ARCHMAGE.radius, lord: RdBalance.LORD.radius,
    pillar: RdBalance.PILLARS.radius, dummy: RdBalance.DUMMY_RADIUS, chest: RdBalance.CHEST_RADIUS
};
class RdShapeCodec {
    static encode(shape) {
        return RdShapeCodec.ENCODERS[shape.kind](shape);
    }
    static decode(data) {
        const decoder = RdShapeCodec.DECODERS[data[0]] || RdShapeCodec.DECODERS[2];
        return decoder(data);
    }
}
RdShapeCodec.ENCODERS = {
    circle: (shape) => [0, Math.round(shape.x), Math.round(shape.z), Math.round(shape.r)],
    cone: (shape) => [1, Math.round(shape.x), Math.round(shape.z), Math.round(shape.r), Math.round(shape.dir * 100), Math.round(shape.arc * 100)],
    line: (shape) => [2, Math.round(shape.x), Math.round(shape.z), Math.round(shape.dir * 100), Math.round(shape.length), Math.round(shape.width)],
    checker: (shape) => [3, Math.round(shape.x), Math.round(shape.z), Math.round(shape.w), Math.round(shape.h), Math.round(shape.cell), shape.parity, Math.round(shape.ox), Math.round(shape.oz)],
    quadrants: (shape) => [4, Math.round(shape.x), Math.round(shape.z), Math.round(shape.r), Math.round(shape.gap), Math.round(shape.dir * 100)]
};
RdShapeCodec.DECODERS = [
    (data) => ({ kind: "circle", x: data[1], z: data[2], r: data[3] }),
    (data) => ({ kind: "cone", x: data[1], z: data[2], r: data[3], dir: data[4] / 100, arc: data[5] / 100 }),
    (data) => ({ kind: "line", x: data[1], z: data[2], dir: data[3] / 100, length: data[4], width: data[5] }),
    (data) => ({ kind: "checker", x: data[1], z: data[2], w: data[3], h: data[4], cell: data[5], parity: data[6], ox: data[7], oz: data[8] }),
    (data) => ({ kind: "quadrants", x: data[1], z: data[2], r: data[3], gap: data[4], dir: data[5] / 100 })
];
class RdSnapshotCodec {
    static capture(engine) {
        return { snap: RdSnapshotCodec.snapshot(engine), flow: RdSnapshotCodec.flow(engine), party: RdSnapshotCodec.party(engine), offers: Array.from(engine.offers.values()).map((offer) => ({ ...offer, stats: offer.stats.slice(), gear: offer.gear.map((card) => ({ ...card })) })) };
    }
    static snapshot(engine) {
        const time = engine.time;
        const heroes = engine.heroes.map((hero) => {
            let flags = 0;
            if (hero.down)
                flags |= RdHeroFlags.DOWN;
            if (hero.gone)
                flags |= RdHeroFlags.GONE;
            if (hero.moving)
                flags |= RdHeroFlags.MOVING;
            if (hero.dash)
                flags |= RdHeroFlags.DASH;
            if (time < hero.invulnerableUntil)
                flags |= RdHeroFlags.INVULNERABLE;
            if (hero.isStunned(time))
                flags |= RdHeroFlags.STUNNED;
            if (time < hero.slowUntil)
                flags |= RdHeroFlags.SLOWED;
            if (time < hero.empoweredUntil)
                flags |= RdHeroFlags.EMPOWERED;
            if (time < hero.airborneUntil)
                flags |= RdHeroFlags.AIRBORNE;
            return { slot: hero.slot, x: Math.round(hero.x), z: Math.round(hero.z), yaw: Math.round(hero.yaw * 100) / 100, hp: Math.max(0, Math.round(hero.hp)), max: hero.maxHp, flags, cd: hero.skillReadyAt.map((at) => Math.max(0, Math.round((at - time) * 10) / 10)) };
        });
        const foes = engine.foes.filter((foe) => !foe.removed).map((foe) => {
            let flags = 0;
            if (foe.moving)
                flags |= RdFoeFlags.MOVING;
            if (foe.spawning(time))
                flags |= RdFoeFlags.SPAWNING;
            if (foe.hidden(time))
                flags |= RdFoeFlags.HIDDEN;
            if (foe.isStunned(time))
                flags |= RdFoeFlags.STUNNED;
            if (foe.invulnerable(engine))
                flags |= RdFoeFlags.INVULNERABLE;
            if (foe instanceof RdManaPillar && foe.broken)
                flags |= RdFoeFlags.BROKEN;
            if (foe.damageFactor(time) > 1)
                flags |= RdFoeFlags.VULNERABLE;
            return { id: foe.id, kind: foe.kind, x: Math.round(foe.x), z: Math.round(foe.z), yaw: Math.round(foe.yaw * 100) / 100, hp: Math.round((Math.max(0, foe.hp) / foe.maxHp) * 1000), flags, owner: foe instanceof RdRewardChest ? foe.owner : -1 };
        });
        const tele = engine.telegraphs.map((telegraph) => ({ id: telegraph.id, shape: telegraph.shape, start: telegraph.start, end: telegraph.end }));
        const areas = engine.areas.map((area) => ({ id: area.id, shape: area.shape, start: area.start, end: area.end }));
        return { t: Math.round(time * 1000) / 1000, heroes, foes, tele, areas };
    }
    static flow(engine) {
        const stage = engine.flow.stage;
        const zone = stage.readyZone();
        const boss = engine.activeBoss() || (stage instanceof RdBossStage ? stage.boss : null);
        const mechanic = engine.mechanic;
        return {
            n: engine.flow.transition, floor: stage.floor.floor, stage: stage.kind, phase: stage.phase, phaseAt: Math.round(stage.phaseAt * 100) / 100,
            wave: stage.wave(), waves: stage.waves(), left: engine.countedFoes(), vault: engine.world.vaultOpen,
            zone: zone ? { x: zone.circle.x, z: zone.circle.z, r: zone.circle.r } : null, inZone: zone ? zone.inside(engine) : [],
            readyEnd: zone ? Math.round(zone.countdownEnd * 100) / 100 : -1,
            rs: Math.round(engine.flow.recordStart * 100) / 100, re: Math.round(engine.flow.recordEnd * 100) / 100,
            rp: Math.round(engine.flow.pausedSeconds * 100) / 100, rq: Math.round(engine.flow.pauseFrom * 100) / 100, fs: Math.round(stage.enteredAt * 100) / 100,
            boss: boss ? { id: boss.id, kind: boss.bossKind, name: boss.displayName } : null,
            mech: mechanic ? {
                kind: mechanic.kind, text: mechanic.instruction, end: Math.round(mechanic.endsAt() * 100) / 100, window: Math.round(mechanic.windowEndsAt() * 100) / 100,
                zones: mechanic.zonePoints().map((point, index) => [Math.round(point.x), Math.round(point.z), mechanic.zoneCounts(engine)[index] || 0])
            } : null,
            hint: stage.hint(engine), out: engine.flow.outcome, times: engine.flow.times.map((entry) => [entry[0], entry[1]]),
            banner: engine.banner ? { k: engine.banner.k, f: engine.banner.f, at: Math.round(engine.banner.at * 100) / 100 } : null,
            picking: engine.offers.size
        };
    }
    static party(engine) {
        return engine.heroes.map((hero) => ({
            slot: hero.slot, max: hero.maxHp, atk: Math.round(hero.stats.attack() * 10) / 10, spd: Math.round(hero.stats.speed()), gap: Math.round(hero.stats.interval() * 100) / 100,
            cdMax: hero.heroClass.skills.map((skill, index) => Math.round(hero.skillCooldown(index) * 10) / 10), gear: hero.stats.gear.slice(),
            cards: { atk: Math.round(hero.stats.cards.atk * 100) / 100, hp: Math.round(hero.stats.cards.hp * 100) / 100, aspd: Math.round(hero.stats.cards.aspd * 100) / 100, move: Math.round(hero.stats.cards.move * 100) / 100, cdr: Math.round(hero.stats.cards.cdr * 100) / 100 },
            dmg: Math.round(hero.damageDone), heal: Math.round(hero.healingDone), hurt: Math.round(hero.damageTaken), downs: hero.downs
        }));
    }
    static shapeToArray(shape) {
        return RdShapeCodec.encode(shape);
    }
    static shapeFromArray(data) {
        return RdShapeCodec.decode(data);
    }
    static encodeSnap(snap) {
        const timed = (list) => list.map((entry) => [entry.id, RdSnapshotCodec.shapeToArray(entry.shape), Math.round(entry.start * 100), Math.round(entry.end * 100)]);
        return JSON.stringify({
            t: Math.round(snap.t * 1000),
            h: snap.heroes.map((hero) => [hero.slot, hero.x, hero.z, Math.round(hero.yaw * 100), hero.hp, hero.max, hero.flags].concat(hero.cd.map((value) => Math.round(value * 10)))),
            f: snap.foes.map((foe) => [foe.id, RdSnapshotCodec.FOE_KINDS.indexOf(foe.kind), foe.x, foe.z, Math.round(foe.yaw * 100), foe.hp, foe.flags, foe.owner]),
            g: timed(snap.tele),
            a: timed(snap.areas)
        });
    }
    static decodeSnap(text) {
        try {
            const data = JSON.parse(text);
            const timed = (list) => (list || []).map((entry) => ({ id: entry[0], shape: RdSnapshotCodec.shapeFromArray(entry[1]), start: entry[2] / 100, end: entry[3] / 100 }));
            return {
                t: data.t / 1000,
                heroes: (data.h || []).map((row) => ({ slot: row[0], x: row[1], z: row[2], yaw: row[3] / 100, hp: row[4], max: row[5], flags: row[6], cd: row.slice(7).map((value) => value / 10) })),
                foes: (data.f || []).map((row) => ({ id: row[0], kind: RdSnapshotCodec.FOE_KINDS[row[1]] || "minion", x: row[2], z: row[3], yaw: row[4] / 100, hp: row[5], flags: row[6], owner: row[7] })),
                tele: timed(data.g),
                areas: timed(data.a)
            };
        }
        catch (error) {
            return null;
        }
    }
    static encodeJson(value) {
        return JSON.stringify(value);
    }
    static decodeJson(text) {
        if (typeof text !== "string")
            return null;
        try {
            return JSON.parse(text);
        }
        catch (error) {
            return null;
        }
    }
}
RdSnapshotCodec.FOE_KINDS = ["minion", "warrior", "rogue", "mage", "giant", "archmage", "lord", "pillar", "dummy", "chest"];
class RdHeroStateCodec {
    static encode(hero, transition) {
        const intent = hero.intent;
        return [Math.round(hero.x), Math.round(hero.z), Math.round(hero.yaw * 100), hero.moving ? 1 : 0, intent.attack ? 1 : 0, Math.round(intent.aimX * 100), Math.round(intent.aimZ * 100), Math.round(intent.moveX * 100), Math.round(intent.moveZ * 100), transition, hero.dash ? 1 : 0].concat(intent.skills.slice(0, 3)).join(",");
    }
    static decode(raw) {
        const parts = raw.split(",").map(Number);
        if (parts.length < 14 || parts.some((part) => !isFinite(part)))
            return null;
        return {
            x: parts[0], z: parts[1], yaw: parts[2] / 100, moving: parts[3] === 1, transition: parts[9], dash: parts[10] === 1,
            intent: { attack: parts[4] === 1, aimX: parts[5] / 100, aimZ: parts[6] / 100, moveX: parts[7] / 100, moveZ: parts[8] / 100, focus: -1, skills: [parts[11], parts[12], parts[13]] }
        };
    }
}
class RdRemotePilot {
    constructor() {
        this.external = true;
        this.bot = false;
        this.current = RdIntents.idle();
    }
    intent() {
        return this.current;
    }
}
class RdIdlePilot {
    constructor() {
        this.external = false;
        this.bot = false;
    }
    intent() {
        return RdIntents.idle();
    }
}
class RdBannerLedger {
    constructor() {
        this.seen = new Set();
    }
    accept(kind, floor, match) {
        const key = match + ":" + kind + ":" + floor;
        if (this.seen.has(key))
            return false;
        this.seen.add(key);
        return true;
    }
    reset() {
        this.seen.clear();
    }
    static lines(kind, floor) {
        const spec = RdFloorPlan.spec(floor);
        return kind === "start" ? { title: spec.startTitle, sub: spec.startSub } : { title: spec.clearTitle, sub: RdFloorPlan.clearSubtitle(floor) };
    }
}
