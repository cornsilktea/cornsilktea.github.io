"use strict";
class FrAreaTargets {
    static forTarget(kind) { return FrAreaTargets.KIND_TO_TASK[kind] || null; }
}
FrAreaTargets.KIND_TO_TASK = {
    shake: new FrTask("shake", "basket", FrBalance.ACTION_COST.shake, "work", "열매 흔들기", ""),
    areaChop: new FrTask("chop", "axe", FrBalance.ACTION_COST.chop, "chop", "나무 베기", ""),
    flower: new FrTask("gatherRing", "basket", FrBalance.ACTION_COST.flower, "work", "꽃 따기", ""),
    shore: new FrTask("gatherRing", "basket", FrBalance.ACTION_COST.beach, "work", "채집", ""),
    mineStone: new FrTask("stone", "pickaxe", FrBalance.ACTION_COST.mineStone, "pickaxe", "돌 캐기", ""),
    mineVein: new FrTask("vein", "pickaxe", FrBalance.ACTION_COST.mineVein, "pickaxe", "광맥 캐기", ""),
    mineHard: new FrTask("hardRock", "pickaxe", FrBalance.ACTION_COST.mineStone, "pickaxe", "단단한 바위", "철 곡괭이부터 깰 수 있어요."),
};
class FrAreaFinder {
    constructor(area, absoluteMinute) {
        this.area = area;
        this.absoluteMinute = absoluteMinute;
    }
    find(player) {
        const B = FrTerrainData.BLOCK;
        for (const feature of this.area.list) {
            if (feature.kind !== "exit" && feature.kind !== "ladderDown" && feature.kind !== "ladderUp")
                continue;
            if (Math.hypot(player.x - (feature.x + 0.5) * B, player.z - (feature.z + 0.5) * B) <= FrAreaFinder.EXIT_RANGE)
                return this.travelTarget(feature);
        }
        const feature = this.nearestGatherable(player);
        if (feature)
            return this.gatherTarget(feature);
        return this.cellTarget(player.frontCell(), player);
    }
    fromPick(pick, player) {
        const B = FrTerrainData.BLOCK;
        const dist = (x, z) => Math.hypot(player.x - (x + 0.5) * B, player.z - (z + 0.5) * B);
        if (pick.kind === "feature") {
            const feature = this.area.featureAt(pick.x, pick.z);
            if (!feature)
                return { target: null, far: false };
            if (feature.kind === "exit" || feature.kind === "ladderDown" || feature.kind === "ladderUp")
                return dist(pick.x, pick.z) <= FrAreaFinder.EXIT_RANGE + 2 ? { target: this.travelTarget(feature), far: false } : { target: null, far: true };
            if (!feature.gatherable || !this.area.available(feature, this.absoluteMinute()))
                return { target: null, far: false };
            return dist(pick.x, pick.z) <= FrAreaFinder.REACH + 2 ? { target: this.gatherTarget(feature), far: false } : { target: null, far: true };
        }
        if (dist(pick.x, pick.z) > 5.4)
            return { target: null, far: true };
        return { target: this.cellTarget({ x: pick.x, z: pick.z }, player), far: false };
    }
    travelTarget(feature) {
        const label = feature.kind === "exit" ? "나가기" : feature.kind === "ladderDown" ? "내려가기" : "올라가기";
        return { kind: feature.kind === "exit" ? "exit" : feature.kind === "ladderDown" ? "ladderDown" : "ladderUp", label, cell: { x: feature.x, z: feature.z }, feature };
    }
    gatherTarget(feature) {
        const map = { fruitTree: ["shake", "흔들기"], jungleTree: ["areaChop", "베기"], flower: ["flower", "따기"], shoreSpot: ["shore", "채집"] };
        const [kind, label] = map[feature.kind];
        return { kind, label, cell: { x: feature.x, z: feature.z }, feature };
    }
    nearestGatherable(player) {
        let best = null;
        let bestDistance = FrAreaFinder.REACH;
        const B = FrTerrainData.BLOCK;
        const now = this.absoluteMinute();
        this.area.list.forEach((feature) => {
            if (!feature.gatherable || !this.area.available(feature, now))
                return;
            const dx = (feature.x + 0.5) * B - player.x, dz = (feature.z + 0.5) * B - player.z;
            const distance = Math.hypot(dx, dz);
            const facing = (dx * Math.sin(player.facing) + dz * Math.cos(player.facing)) / Math.max(0.01, distance);
            if (distance < bestDistance && facing > 0.15) {
                best = feature;
                bestDistance = distance;
            }
        });
        return best;
    }
    cellTarget(cell, player) {
        const terrain = this.area.terrain;
        if (!terrain.inside(cell.x, cell.z))
            return null;
        const top = terrain.top(cell.x, cell.z);
        if (this.area.id === "mine") {
            if (top === "T")
                return { kind: "mineStone", label: "캐기", cell };
            if (top === "V")
                return { kind: "mineVein", label: "광맥", cell };
            if (top === "K")
                return { kind: "mineHard", label: "깨기", cell };
            return null;
        }
        if (this.area.id === "beach" && (top === "R" || top === "O") && !terrain.isWater(player.cell().x, player.cell().z))
            return { kind: "fish", label: "낚시", cell };
        return null;
    }
}
FrAreaFinder.REACH = 4.4;
FrAreaFinder.EXIT_RANGE = 5;
class FrAreaOutcome {
    constructor(session, area, scene, random, absoluteMinute) {
        this.session = session;
        this.area = area;
        this.scene = scene;
        this.random = random;
        this.absoluteMinute = absoluteMinute;
    }
    async finish(target, task) {
        this.session.ap.spend(task.apCost);
        const broken = this.session.wearTool(task.toolKind);
        const note = broken ? " · " + FrItemNames.label(broken) + "이(가) 다 닳았어요" : "";
        const feature = target.feature;
        const handlers = {
            shake: () => this.collect(FrGatherRules.shake(this.random, this.session), feature, 720, "fruit"),
            areaChop: () => this.collect(FrGatherRules.chop(this.session), feature, 100000, "gone"),
            flower: () => this.collect(FrGatherRules.flower(this.random, this.session), feature, 720, "gone"),
            shore: () => this.collect(FrGatherRules.shore(feature, this.random, this.session), feature, 720, "gone"),
            mineStone: () => this.mine(target.cell, FrMineRules.stoneDrop(this.random)),
            mineVein: () => { this.session.stats.add("mineVeins"); return this.mine(target.cell, FrGatherRules.vein(this.random, this.session, this.area.floor)); },
            mineHard: () => this.mine(target.cell, { stone: 2 }),
        };
        const handler = handlers[target.kind];
        return handler ? handler() + note : note;
    }
    collect(gains, feature, cooldown, after) {
        const lost = this.session.gainAll(gains);
        const stat = { fruitTree: "shake", jungleTree: "chop", flower: "flower", shoreSpot: "beach" };
        if (feature && stat[feature.kind])
            this.session.stats.add(stat[feature.kind]);
        if (feature) {
            feature.availableAt = this.absoluteMinute() + cooldown;
            if (feature.kind === "jungleTree")
                feature.felled = true;
            if (after === "gone")
                this.scene.setTaken(feature, true);
            else
                this.scene.showFruitless(feature);
        }
        return this.describe(gains) + (lost > 0 ? " · 가방이 가득 차서 " + lost + "개를 놓고 왔어요" : "");
    }
    mine(cell, gains) {
        this.area.terrain.edit(cell.x, cell.z, { h: 0, t: "C" });
        this.scene.editCell(cell.x, cell.z);
        const lost = this.session.gainAll(gains);
        this.session.stats.add("mineBlocks");
        this.session.stats.atLeast("deepFloor", this.area.floor);
        if (gains.iron)
            this.session.stats.add("ironGot", gains.iron);
        if (gains.diamond)
            this.session.stats.add("diamondGot", gains.diamond);
        return this.describe(gains) + (lost > 0 ? " · 가방이 가득 차서 " + lost + "개를 놓고 왔어요" : "");
    }
    describe(gains) {
        return Object.keys(gains).map((id) => FrItemNames.label(id) + " +" + gains[id]).join(", ");
    }
}
