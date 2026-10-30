"use strict";
class FrFarmRules {
    static plotCells(world) {
        const farm = world.terrain.anchors.farm;
        const cells = new Set();
        const add = (r) => { for (let j = 0; j < r.d; j++)
            for (let i = 0; i < r.w; i++)
                cells.add(world.terrain.index(r.x + i, r.z + j)); };
        add(farm);
        (farm.expand || []).forEach((r, k) => { if (world.village.builtCount("farm_expand") > k)
            add(r); });
        return cells;
    }
    static isPlot(world, x, z) { return FrFarmRules.plotCells(world).has(world.terrain.index(x, z)); }
    static watered(world, x, z) {
        const r = FrFarmRules.WATER_REACH;
        for (let dz = -r; dz <= r; dz++)
            for (let dx = -r; dx <= r; dx++)
                if (world.terrain.top(x + dx, z + dz) === FrTerrainData.RIVER)
                    return true;
        return false;
    }
    static stage(world, x, z, record, nowMinute) {
        return FrCropRules.stage(record.crop, FrFarmRules.watered(world, x, z), record.at, nowMinute);
    }
    static minutesLeft(world, x, z, record, nowMinute) {
        return Math.max(0, FrCropRules.growMinutes(record.crop, FrFarmRules.watered(world, x, z)) - (nowMinute - record.at));
    }
    static canPlant(world, x, z, seedId) {
        if (!FrFarmRules.isPlot(world, x, z))
            return { ok: false, reason: "텃밭 칸이 아니에요" };
        if (world.farm.has(world.terrain.index(x, z)))
            return { ok: false, reason: "이미 심겨 있어요" };
        if (!/_seed$/.test(seedId))
            return { ok: false, reason: "씨앗만 심을 수 있어요" };
        return { ok: true, reason: "" };
    }
    static canalAllowed(world, x, z) {
        const t = world.terrain;
        if (!t.inside(x, z) || t.isWater(x, z) || world.blocked(x, z) || world.blocks.top(t.index(x, z)) > 0)
            return false;
        if (FrFarmRules.isPlot(world, x, z))
            return false;
        const top = t.top(x, z);
        if (top !== "G" && top !== "D" && top !== "N")
            return false;
        if (t.height(x, z) - 1 < FrTerrainData.MIN_HEIGHT)
            return false;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => t.top(x + dx, z + dz) === FrTerrainData.RIVER);
        const farm = FrFarmRules.plotCells(world);
        const nearPlot = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => farm.has(t.index(x + dx, z + dz)));
        return near || nearPlot;
    }
    static plantedBy(world, uid) {
        let n = 0;
        world.farm.forEach((r) => { if (r.uid === uid)
            n++; });
        return n;
    }
}
FrFarmRules.WATER_REACH = 2;
FrFarmRules.FIRST_SEEDS = { potato_seed: 3, carrot_seed: 3 };
class FrStatCatalog {
}
FrStatCatalog.TABS = ["채집", "낚시", "광산", "지형", "농사", "요리", "제작", "건설", "공용 창고", "얻은 재화"];
FrStatCatalog.DEFS = [
    { key: "shake", label: "과일 흔들기", tab: "채집" }, { key: "chop", label: "나무 베기", tab: "채집" }, { key: "clear", label: "정글 개간", tab: "채집" },
    { key: "beach", label: "해변 채집", tab: "채집" }, { key: "flower", label: "꽃 따기", tab: "채집" },
    { key: "fish", label: "낚은 물고기", tab: "낚시" }, { key: "fishLegend", label: "전설 물고기", tab: "낚시" }, { key: "fishKinds", label: "물고기 종류", tab: "낚시" },
    { key: "mineBlocks", label: "캔 블록", tab: "광산" }, { key: "mineVeins", label: "캔 광맥", tab: "광산" }, { key: "ironGot", label: "철", tab: "광산" },
    { key: "diamondGot", label: "다이아몬드", tab: "광산" }, { key: "deepFloor", label: "가장 깊은 층", tab: "광산" },
    { key: "dug", label: "판 칸", tab: "지형" }, { key: "iceGot", label: "캔 얼음", tab: "지형" },
    { key: "planted", label: "심은 작물", tab: "농사" }, { key: "harvested", label: "수확", tab: "농사" }, { key: "canal", label: "수로 판 칸", tab: "농사" },
    { key: "cooked", label: "만든 요리", tab: "요리" }, { key: "recipeKinds", label: "레시피 종류", tab: "요리" },
    { key: "craftGear", label: "장비", tab: "제작" }, { key: "craftProcessed", label: "가공품", tab: "제작" }, { key: "craftBlocks", label: "블록", tab: "제작" },
    { key: "built", label: "지은 건설", tab: "건설" }, { key: "placed", label: "놓은 블록", tab: "건설" },
    { key: "chestPut", label: "넣은 재료", tab: "공용 창고" }, { key: "chestTake", label: "꺼낸 재료", tab: "공용 창고" },
    { key: "itemsTotal", label: "얻은 재화 합계", tab: "얻은 재화" }, { key: "itemKinds", label: "재화 종류", tab: "얻은 재화" },
];
FrStatCatalog.MAXIMUMS = ["deepFloor"];
class FrStats {
    constructor() {
        this.data = { all: {}, today: { d: "", c: {} }, sets: {} };
        this.dirty = false;
    }
    static dayStamp(now) { return now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0"); }
    load(raw, stamp) {
        this.data = { all: (raw && raw.all) || {}, today: (raw && raw.today && raw.today.d === stamp) ? raw.today : { d: stamp, c: {} }, sets: (raw && raw.sets) || {} };
        this.dirty = false;
    }
    add(key, amount = 1) {
        if (amount <= 0)
            return;
        this.data.all[key] = (this.data.all[key] || 0) + amount;
        this.data.today.c[key] = (this.data.today.c[key] || 0) + amount;
        this.dirty = true;
    }
    atLeast(key, value) {
        if ((this.data.all[key] || 0) >= value)
            return;
        this.data.all[key] = value;
        this.data.today.c[key] = Math.max(this.data.today.c[key] || 0, value);
        this.dirty = true;
    }
    see(set, id, countKey) {
        const list = this.data.sets[set] || (this.data.sets[set] = []);
        if (list.indexOf(id) >= 0)
            return;
        list.push(id);
        this.data.all[countKey] = list.length;
        this.data.today.c[countKey] = list.length;
        this.dirty = true;
    }
    takeDirty() { const was = this.dirty; this.dirty = false; return was; }
    value(key, today) { return (today ? this.data.today.c[key] : this.data.all[key]) || 0; }
}
