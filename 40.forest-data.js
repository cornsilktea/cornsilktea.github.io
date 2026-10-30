"use strict";
class FrBalance {
}
FrBalance.BASE_ACTION_POINTS = 100;
FrBalance.RING_ACTION_POINTS_PER_LEVEL = 10;
FrBalance.RING_MAX_LEVEL = 10;
FrBalance.MAX_ACTION_POINTS_CAP = 200;
FrBalance.PLAYER_HEALTH = 100;
FrBalance.BAG_SLOTS = 40;
FrBalance.STACK_SIZE = 30;
FrBalance.PUBLIC_SLOTS = 180;
FrBalance.PUBLIC_LOG_LINES = 100;
FrBalance.PERSONAL_CHEST_SLOTS = 60;
FrBalance.PERSONAL_CHEST_LIMIT = 2;
FrBalance.TOOL_DURABILITY = 100;
FrBalance.WEAPON_DURABILITY = 200;
FrBalance.HOTBAR_SLOTS = 8;
FrBalance.MAX_ISLAND_PLAYERS = 10;
FrBalance.ISLANDS_PER_CLASS = 3;
FrBalance.GEAR_MATERIAL_COUNT = 3;
FrBalance.DAY_REAL_SECONDS = 240;
FrBalance.GAME_MINUTES_PER_REAL_SECOND = 6;
FrBalance.DAWN_MINUTE = 360;
FrBalance.DUSK_MINUTE = 1080;
FrBalance.CLASS_BREAK_REAL_MINUTES = 10;
FrBalance.SNOW_REGROW_DAYS = 3;
FrBalance.WAKE_BONUS_ACTION_POINTS = 50;
FrBalance.PITY_STEP = 0.002;
FrBalance.WATER_GROWTH_FACTOR = 1.7;
FrBalance.DUNGEON_ENTRY_COST = 40;
FrBalance.DUNGEON_SECONDS = 40;
FrBalance.ATTACK_INTERVAL = 0.5;
FrBalance.ATTACK_RADIUS_METERS = 2.5;
FrBalance.ATTACK_ARC_DEGREES = 120;
FrBalance.MONSTER_WINDUP = 0.6;
FrBalance.EAT_STUN_SECONDS = 1;
FrBalance.FOOD_BY_STAR = [
    { island: 3, dungeon: 5 },
    { island: 8, dungeon: 15 },
    { island: 15, dungeon: 30 },
    { island: 25, dungeon: 50 },
    { island: 35, dungeon: 75 },
    { island: 50, dungeon: 100 },
];
FrBalance.ACTION_COST = {
    shake: 1, beach: 1, flower: 1, harvest: 1, chop: 3, fish: 2, mineStone: 1, mineVein: 2, digTile: 1, canal: 1,
};
FrBalance.WEAPON_DAMAGE = [10, 16, 26, 40];
FrBalance.ARMOR_REDUCTION = {
    helmet: [0, 0.04, 0.07, 0.10], top: [0, 0.08, 0.13, 0.18], bottom: [0, 0.06, 0.10, 0.14], shoes: [0, 0.02, 0.04, 0.06],
};
FrBalance.SHOES_SPEED = [0, 0.05, 0.10, 0.15];
FrBalance.AXE_HITS = [4, 3, 2, 1];
FrBalance.AXE_GREEN = [0.16, 0.20, 0.24, 0.28];
FrBalance.AXE_WOOD_BONUS = [0, 0, 1, 2];
FrBalance.PICK_STONE_MASH = [16, 12, 9, 6];
FrBalance.PICK_VEIN_GREEN = [0.10, 0.14, 0.18, 0.24];
FrBalance.PICK_SNOW_GREEN = [0, 0.15, 0.20, 0.25];
FrBalance.PICK_HARD_MASH = [0, 0, 14, 10];
FrBalance.SHOVEL_MASH = [0, 14, 11, 8];
FrBalance.BASKET_EXTRA_CHANCE = [0, 0.4, 0.7, 1];
FrBalance.BASKET_LEGEND_MULTIPLIER = [1, 1, 1.5, 2];
FrBalance.ROD_BEAT_TOLERANCE = [0, 0.15, 0.20, 0.25];
FrBalance.ROD_BITE_SECONDS = [[0, 0], [6, 10], [4, 8], [3, 6]];
FrBalance.FISH_BEAT_INTERVAL = 0.8;
FrBalance.FISH_BEATS = { common: 1, rare: 2, legend: 3 };
FrBalance.FRUIT_ODDS = [
    ["apple", 0.25], ["pear", 0.25], ["orange", 0.25], ["peach", 0.11], ["mango", 0.11], ["golden_apple", 0.03],
];
FrBalance.SEED_DROP_CHANCE = 0.10;
FrBalance.FISH_ODDS = [[0, 0, 0], [0.80, 0.18, 0.02], [0.60, 0.33, 0.07], [0.45, 0.40, 0.15]];
FrBalance.ORE_ODDS = [
    [0.85, 0.12, 0.03, 0],
    [0.60, 0.28, 0.108, 0.012],
    [0.44, 0.30, 0.20, 0.06],
    [0.31, 0.30, 0.30, 0.09],
];
FrBalance.FLOOR_ORE_MULTIPLIER = [1, 1, 1.5, 2];
FrBalance.STONE_COAL_CHANCE = 0.10;
FrBalance.TERRAIN_STONE_COAL_CHANCE = 0.05;
FrBalance.TERRAIN_STONE_ORE_CHANCE = 0.02;
FrBalance.RING_SUCCESS = [0, 0.8, 0.8, 0.8, 0.4, 0.4, 0.4, 0.2, 0.2, 0.1, 0.05];
FrBalance.RING_COST = [
    { enhance: 0, magic: 0 },
    { enhance: 1, magic: 1 }, { enhance: 1, magic: 1 }, { enhance: 1, magic: 1 },
    { enhance: 2, magic: 1 }, { enhance: 2, magic: 1 }, { enhance: 2, magic: 1 },
    { enhance: 3, magic: 2 }, { enhance: 3, magic: 2 },
    { enhance: 4, magic: 3 }, { enhance: 5, magic: 4 },
];
FrBalance.RING_MELT_ENHANCE = 3;
FrBalance.VILLAGE_LEVEL_SCORE = [0, 0, 6, 15, 30, 55];
FrBalance.MAX_TERRAIN_EDITS = 20000;
FrBalance.MAX_ISLAND_BLOCKS = 10000;
FrBalance.MAX_BLOCKS_OPEN = 300;
FrBalance.MAX_BLOCKS_LOT = 600;
FrBalance.MAX_BUILD_HEIGHT = 8;
class FrCatalog {
    static material(id) {
        if (FrCatalog.index.size === 0)
            FrCatalog.MATERIALS.forEach((m) => FrCatalog.index.set(m.id, m));
        return FrCatalog.index.get(id);
    }
    static groupMembers(group) {
        if (group === "fruit")
            return FrCatalog.FRUITS;
        if (group === "fish_common")
            return FrCatalog.FISH_COMMON;
        if (group === "fish_rare")
            return FrCatalog.FISH_RARE;
        return FrCatalog.FISH_LEGEND;
    }
    static buildMaterials() {
        const list = [];
        const add = (id, name, category, grade, howToGet) => list.push({ id, name, category, grade, howToGet });
        add("wood", "목재", "wood", "common", "북쪽 과일 숲·마을 정글 — 나무 베기");
        add("vine", "덩굴", "wood", "common", "마을 정글 나무 베기");
        ["빨강", "노랑", "파랑", "하양"].forEach((c, i) => add("flower_" + i, c + " 꽃", "wood", "common", "북쪽 과일 숲 — 꽃 따기"));
        add("apple", "사과", "wood", "common", "과일 숲 — 과일나무 흔들기");
        add("pear", "배", "wood", "common", "과일 숲 — 과일나무 흔들기");
        add("orange", "오렌지", "wood", "common", "과일 숲 — 과일나무 흔들기");
        add("peach", "복숭아", "wood", "rare", "과일 숲 — 과일나무 흔들기");
        add("mango", "망고", "wood", "rare", "과일 숲 — 과일나무 흔들기");
        add("golden_apple", "황금 사과", "wood", "legend", "과일 숲 — 과일나무 흔들기, 바구니가 좋을수록 잘 나와요");
        add("shell", "조개", "beach", "common", "남쪽 해변 — 채집");
        add("salt", "소금", "beach", "common", "남쪽 해변 — 채집");
        add("seaweed", "해초", "beach", "common", "남쪽 해변 — 채집");
        add("sand", "모래", "beach", "common", "남쪽 해변 채집, 섬 모래 칸 파기");
        const fishNames = {
            anchovy: "멸치", sardine: "정어리", horse_mackerel: "전갱이", mackerel: "고등어", goby: "망둥어",
            sea_bream: "도미", sea_bass: "농어", flounder: "광어", squid: "오징어", octopus: "문어",
            tuna: "참다랑어", swordfish: "황새치", rainbow_fish: "무지개 물고기",
        };
        FrCatalog.FISH_COMMON.forEach((id) => add(id, fishNames[id], "fish", "common", "남쪽 해변 — 낚시"));
        FrCatalog.FISH_RARE.forEach((id) => add(id, fishNames[id], "fish", "rare", "남쪽 해변 — 낚시, 철 낚싯대 이상이 잘 나와요"));
        FrCatalog.FISH_LEGEND.forEach((id) => add(id, fishNames[id], "fish", "legend", "남쪽 해변 — 낚시, 다이아몬드 낚싯대가 잘 나와요"));
        add("stone", "돌", "mineral", "common", "동쪽 광산 돌 블록, 섬 돌 칸 파기");
        add("coal", "석탄", "mineral", "common", "돌을 캘 때 가끔 나와요");
        add("copper", "구리", "mineral", "rare", "동쪽 광산 광맥, 산 속, 노말 던전");
        add("iron", "철", "mineral", "rare", "동쪽 광산 광맥, 하드·헬 던전");
        add("ice", "얼음", "mineral", "rare", "북쪽 산꼭대기 눈 캐기 (3일마다 다시 생겨요)");
        add("diamond", "다이아몬드", "mineral", "legend", "동쪽 광산 광맥, 헬 던전, 깊은 층일수록 잘 나와요");
        FrCatalog.CROPS.forEach((c) => {
            add(c.id, c.name, "crop", c.grade, "텃밭 — 씨앗을 심고 수확");
            add(c.id + "_seed", c.name + " 씨앗", "crop", c.grade, "과일 나무 흔들기, 수확");
        });
        add("bone", "뼈", "dungeon", "common", "서쪽 던전");
        add("cloth", "천", "dungeon", "common", "서쪽 던전");
        add("magic_stone", "마력 돌", "dungeon", "rare", "서쪽 던전 하드·헬");
        add("enhance_stone", "강화석", "dungeon", "rare", "서쪽 던전 하드·헬, 반지 녹이기");
        add("ring", "반지", "dungeon", "legend", "서쪽 던전 하드·헬");
        add("plank", "판자", "crafted", "common", "작업대 — 목재 2");
        add("rope", "노끈", "crafted", "common", "작업대 — 해초 3, 덩굴 2 또는 천 1");
        add("brick", "돌벽돌", "crafted", "common", "작업대 — 돌 3");
        add("glass", "유리", "crafted", "common", "화덕 — 모래 2와 석탄 1");
        ["빨강", "노랑", "파랑", "초록"].forEach((c, i) => add("dye_" + i, c + " 염료", "crafted", "common", "작업대 — 꽃 2"));
        FrCatalog.BLOCK_IDS.forEach((b) => add("block_" + b[0], b[1], "block", "common", b[2]));
        return list;
    }
    static buildRecipes() {
        const r = (id, name, star, station, ingredients) => ({ id, name, star, station, ingredients });
        const i = (item, count) => ({ item, count });
        const g = (group, count) => ({ group, count });
        return [
            r("baked_potato", "구운 감자", 1, "campfire", [i("potato", 1)]),
            r("fruit_skewer", "과일 꼬치", 1, "campfire", [g("fruit", 2)]),
            r("fish_skewer", "생선 꼬치", 1, "campfire", [g("fish_common", 1)]),
            r("grilled_shell", "조개구이", 1, "campfire", [i("shell", 2)]),
            r("grilled_corn", "군옥수수", 1, "campfire", [i("corn", 1)]),
            r("salad", "채소 샐러드", 2, "campfire", [i("lettuce", 1), i("tomato", 1), i("carrot", 1)]),
            r("seaweed_soup", "해초 수프", 2, "campfire", [i("seaweed", 2), i("salt", 1)]),
            r("fish_set", "생선구이 정식", 2, "campfire", [g("fish_common", 1), i("salt", 1), i("potato", 1)]),
            r("fruit_juice", "과일 주스", 2, "campfire", [g("fruit", 3)]),
            r("rice_ball", "주먹밥", 2, "campfire", [i("rice", 2), i("seaweed", 1)]),
            r("fruit_shaved_ice", "과일 빙수", 2, "campfire", [i("ice", 1), g("fruit", 2)]),
            r("bread", "빵", 3, "oven", [i("wheat", 3)]),
            r("tomato_stew", "토마토 스튜", 3, "oven", [i("tomato", 2), i("onion", 1), i("potato", 1), i("salt", 1)]),
            r("steamed_bream", "도미찜", 3, "oven", [g("fish_rare", 1), i("seaweed", 1), i("onion", 1)]),
            r("chili_fried_rice", "고추 볶음밥", 3, "oven", [i("rice", 2), i("chili", 1), i("carrot", 1)]),
            r("jam_toast", "딸기잼 토스트", 3, "oven", [i("bread", 1), i("strawberry", 2)]),
            r("strawberry_smoothie", "딸기 스무디", 3, "oven", [i("ice", 1), i("strawberry", 2)]),
            r("cold_noodles", "냉국수", 3, "oven", [i("wheat", 2), i("seaweed", 1), i("ice", 1)]),
            r("seafood_pasta", "해물 파스타", 4, "oven", [i("wheat", 2), i("shell", 2), i("tomato", 1), g("fish_rare", 1)]),
            r("pumpkin_pie", "호박 파이", 4, "oven", [i("pumpkin", 1), i("wheat", 2), i("apple", 1)]),
            r("watermelon_punch", "수박 화채", 4, "oven", [i("watermelon", 1), i("peach", 1), i("ice", 1)]),
            r("mango_shaved_ice", "망고 빙수", 4, "oven", [i("mango", 2), i("ice", 2), i("strawberry", 1)]),
            r("seafood_grill", "해물 모둠구이", 4, "oven", [g("fish_rare", 2), i("shell", 2), i("salt", 1)]),
            r("tuna_steak", "참치 스테이크 정식", 5, "kitchen", [g("fish_legend", 1), i("potato", 1), i("onion", 1), i("tomato", 1)]),
            r("golden_pie", "황금 사과 파이", 5, "kitchen", [i("golden_apple", 1), i("wheat", 2), i("strawberry", 1)]),
            r("rainbow_sushi", "무지개 초밥", 5, "kitchen", [i("rainbow_fish", 1), i("rice", 2), i("seaweed", 1)]),
            r("festival_feast", "섬 축제 만찬", 5, "kitchen", [g("fish_legend", 1), i("pumpkin", 1), i("watermelon", 1), i("golden_apple", 1), i("ice", 1)]),
        ];
    }
    static buildConstructions() {
        const c = (id, name, cost, score, count = 1, minVillageLevel = 1) => ({ id, name, cost, score, minVillageLevel, count });
        return [
            c("workbench", "작업대", { wood: 10 }, 3),
            c("forge", "대장간", { brick: 20, copper: 10, wood: 10 }, 3),
            c("oven", "화덕", { stone: 20, copper: 5 }, 3),
            c("kitchen", "섬 부엌", { brick: 30, iron: 10, plank: 20 }, 3, 1, 3),
            c("bridge_east", "동쪽 다리", { wood: 20, iron: 10, rope: 10 }, 3),
            c("bridge_south", "남쪽 다리", { wood: 20, stone: 15, rope: 10 }, 3),
            c("bridge_shortcut", "지름길 다리", { plank: 15, rope: 10, copper: 5 }, 3, 2),
            c("stairs", "돌계단", { brick: 10 }, 1, 3),
            c("wall", "성벽 구간", { brick: 15, rope: 3 }, 1, 12),
            c("gate", "성문", { plank: 20, iron: 8, brick: 10 }, 2, 4),
            c("tower", "망루", { brick: 20, plank: 10 }, 2, 4),
            c("lamp", "가로등", { wood: 5, copper: 3 }, 1, 8),
            c("farm_expand", "텃밭 넓히기", { wood: 10, stone: 10 }, 1, 2),
        ];
    }
}
FrCatalog.FRUITS = ["apple", "pear", "orange", "peach", "mango", "golden_apple"];
FrCatalog.FISH_COMMON = ["anchovy", "sardine", "horse_mackerel", "mackerel", "goby"];
FrCatalog.FISH_RARE = ["sea_bream", "sea_bass", "flounder", "squid", "octopus"];
FrCatalog.FISH_LEGEND = ["tuna", "swordfish", "rainbow_fish"];
FrCatalog.CROPS = [
    { id: "potato", name: "감자", grade: "common", days: 1 }, { id: "carrot", name: "당근", grade: "common", days: 1 },
    { id: "lettuce", name: "양상추", grade: "common", days: 1 }, { id: "onion", name: "양파", grade: "common", days: 1.5 },
    { id: "wheat", name: "밀", grade: "common", days: 1.5 }, { id: "rice", name: "쌀", grade: "common", days: 1.5 },
    { id: "tomato", name: "토마토", grade: "rare", days: 2 }, { id: "corn", name: "옥수수", grade: "rare", days: 2 },
    { id: "chili", name: "고추", grade: "rare", days: 2 }, { id: "pumpkin", name: "호박", grade: "rare", days: 3 },
    { id: "strawberry", name: "딸기", grade: "rare", days: 3 }, { id: "watermelon", name: "수박", grade: "legend", days: 3 },
];
FrCatalog.BLOCK_IDS = [
    ["dirt", "흙 블록", "지형 파기"], ["grass", "잔디 블록", "지형 파기"], ["sand", "모래 블록", "지형 파기"], ["stone", "돌 블록", "지형 파기"],
    ["ice", "얼음 블록", "산꼭대기 눈 캐기"], ["brick", "돌벽돌 블록", "작업대 — 돌벽돌 1"], ["wood", "나무 블록", "작업대 — 목재 1"],
    ["plank", "판자 블록", "작업대 — 판자 1"], ["glass", "유리 블록", "작업대 — 유리 1"],
    ["color_0", "빨강 블록", "작업대 — 판자 1과 염료 1"], ["color_1", "노랑 블록", "작업대 — 판자 1과 염료 1"],
    ["color_2", "파랑 블록", "작업대 — 판자 1과 염료 1"], ["color_3", "초록 블록", "작업대 — 판자 1과 염료 1"],
    ["stairs", "계단", "작업대 — 같은 블록 2"], ["slab", "반 블록", "작업대 — 같은 블록 2"], ["fence", "울타리", "작업대 — 같은 블록 2"],
    ["door", "문", "작업대 — 판자 3"], ["window", "창문", "작업대 — 유리 2"], ["torch", "횃불", "작업대 — 목재 1과 석탄 1"],
];
FrCatalog.MATERIALS = FrCatalog.buildMaterials();
FrCatalog.RECIPES = FrCatalog.buildRecipes();
FrCatalog.CONSTRUCTIONS = FrCatalog.buildConstructions();
FrCatalog.MONSTERS = {
    normal: [{ id: "skeleton_minion", name: "해골 졸개", hp: 30, attack: 6, speed: 1.6 }],
    hard: [
        { id: "skeleton_warrior", name: "해골 전사", hp: 90, attack: 14, speed: 2.4 },
        { id: "skeleton_rogue", name: "해골 도적", hp: 90, attack: 14, speed: 3.4 },
    ],
    hell: [
        { id: "skeleton_warrior", name: "해골 전사", hp: 150, attack: 24, speed: 2.4 },
        { id: "skeleton_rogue", name: "해골 도적", hp: 150, attack: 24, speed: 3.4 },
        { id: "skeleton_golem", name: "큰 해골", hp: 150, attack: 24, speed: 2.0 },
    ],
};
FrCatalog.DROPS = {
    normal: [
        { item: "bone", min: 1, max: 1, chance: 1 }, { item: "cloth", min: 1, max: 1, chance: 0.30 },
        { item: "copper", min: 1, max: 1, chance: 0.15 }, { item: "iron", min: 1, max: 1, chance: 0.05 },
    ],
    hard: [
        { item: "bone", min: 1, max: 2, chance: 1 }, { item: "cloth", min: 1, max: 1, chance: 0.30 },
        { item: "iron", min: 1, max: 1, chance: 0.20 }, { item: "magic_stone", min: 1, max: 1, chance: 0.25 },
        { item: "enhance_stone", min: 1, max: 1, chance: 0.04 }, { item: "ring", min: 1, max: 1, chance: 0.01 },
    ],
    hell: [
        { item: "iron", min: 1, max: 1, chance: 0.35 }, { item: "magic_stone", min: 1, max: 2, chance: 1 },
        { item: "enhance_stone", min: 1, max: 1, chance: 0.10 }, { item: "ring", min: 1, max: 1, chance: 0.03 },
        { item: "diamond", min: 1, max: 1, chance: 0.06 },
    ],
};
FrCatalog.LEGEND_DROPS = ["ring", "diamond"];
FrCatalog.index = new Map();
