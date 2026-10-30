"use strict";
class FrClockSync {
    constructor(backend, island, uid) {
        this.backend = backend;
        this.island = island;
        this.uid = uid;
        this.state = { day: 1, dawnAt: 0, lastSeen: 0, frozen: false };
        this.offset = 0;
        this.lastHeartbeat = 0;
        this.onSkipped = () => undefined;
    }
    path() { return "forest/" + this.island + "/clock"; }
    now() { return this.state.frozen && this.state.frozenAt ? this.state.frozenAt : Date.now() + this.offset; }
    serverNow() { return Date.now() + this.offset; }
    minuteOfDay() { return FrClock.minuteOfDay(this.state, this.now()); }
    day() { return FrClock.dayNumber(this.state, this.now()); }
    absoluteMinute() { return FrClock.absoluteMinute(this.state, this.now()); }
    async join() {
        this.offset = (await this.backend.serverTime("users/" + this.uid + "/forest/probe")) - Date.now();
        const now = this.now();
        const result = await this.backend.transaction(this.path(), (current) => {
            if (current === null)
                return { day: 1, dawnAt: now, lastSeen: now, frozen: false };
            return FrClock.startOfClass(current, now);
        });
        if (result.value)
            this.state = result.value;
        this.lastHeartbeat = Date.now();
    }
    async heartbeat() {
        if (Date.now() - this.lastHeartbeat < FrClockSync.HEARTBEAT_MS)
            return;
        this.lastHeartbeat = Date.now();
        this.state = { ...this.state, lastSeen: this.now() };
        await this.backend.patch(this.path(), { lastSeen: this.state.lastSeen });
    }
    remoteState(next) {
        const previous = this.state;
        this.state = next;
        if (next.dawnAt !== previous.dawnAt && next.slept)
            this.onSkipped(next);
    }
    remoteField(name, value) {
        const next = { ...this.state };
        if (value === null)
            delete next[name];
        else
            next[name] = value;
        this.state = next;
    }
    async setMinute(target) {
        const now = this.now();
        const back = ((target - FrBalance.DAWN_MINUTE + FrClock.MINUTES_PER_DAY) % FrClock.MINUTES_PER_DAY) / FrBalance.GAME_MINUTES_PER_REAL_SECOND * 1000;
        await this.backend.transaction(this.path(), (current) => (current ? { ...current, dawnAt: now - back, lastSeen: now, slept: false } : undefined));
    }
    async setFrozen(frozen) {
        const real = this.serverNow();
        await this.backend.transaction(this.path(), (current) => {
            if (!current)
                return undefined;
            if (frozen)
                return { ...current, frozen: true, frozenAt: real };
            const shift = current.frozenAt ? real - current.frozenAt : 0;
            return { day: current.day, dawnAt: current.dawnAt + shift, lastSeen: real, frozen: false, slept: false };
        });
    }
    async skipToMorning() {
        const known = this.state.dawnAt;
        const now = this.now();
        const result = await this.backend.transaction(this.path(), (current) => {
            if (current === null || current.dawnAt !== known)
                return undefined;
            return FrClock.skipToMorning(current, now);
        });
        if (result.value)
            this.state = result.value;
        return result.committed;
    }
}
FrClockSync.HEARTBEAT_MS = 60000;
class FrPlayerBody {
    constructor(world) {
        this.world = world;
        this.x = 0;
        this.z = 0;
        this.y = 0;
        this.facing = 0;
        this.moving = false;
        this.swimming = false;
        this.vx = 0;
        this.vz = 0;
        this.ground = 0;
    }
    place(cellX, cellZ) {
        this.x = (cellX + 0.5) * FrTerrainData.BLOCK;
        this.z = (cellZ + 0.5) * FrTerrainData.BLOCK;
        this.ground = this.world.terrain.height(cellX, cellZ);
        this.y = this.world.terrain.surfaceY(cellX, cellZ);
    }
    cell() { return { x: this.world.terrain.cellOf(this.x), z: this.world.terrain.cellOf(this.z) }; }
    frontCell(distance = FrPlayerBody.FRONT) {
        return { x: this.world.terrain.cellOf(this.x + Math.sin(this.facing) * distance), z: this.world.terrain.cellOf(this.z + Math.cos(this.facing) * distance) };
    }
    solid(x, z) {
        const a = this.world.terrain.anchors;
        if (x === a.campfire.x && z === a.campfire.z)
            return true;
        if (x >= a.publicChest.x && x < a.publicChest.x + a.publicChest.size && z >= a.publicChest.z && z < a.publicChest.z + a.publicChest.size)
            return true;
        return FrBuildSites.STAGE_TWO.some((s) => s.x === x && s.z === z);
    }
    bodyFits(px, pz) {
        const terrain = this.world.terrain;
        const r = FrPlayerBody.RADIUS;
        return FrPlayerBody.SAMPLES.every(([dx, dz]) => {
            const cx = terrain.cellOf(px + dx * r), cz = terrain.cellOf(pz + dz * r);
            if (!terrain.inside(cx, cz) || terrain.top(cx, cz) === FrTerrainData.OCEAN)
                return false;
            if (this.world.blocked(cx, cz) || this.solid(cx, cz))
                return false;
            if (terrain.isWater(cx, cz))
                return true;
            return terrain.height(cx, cz) - this.ground <= 1;
        });
    }
    groundUnder(px, pz) {
        const terrain = this.world.terrain;
        const r = FrPlayerBody.RADIUS;
        let best = -99;
        FrPlayerBody.SAMPLES.forEach(([dx, dz]) => {
            const cx = terrain.cellOf(px + dx * r), cz = terrain.cellOf(pz + dz * r);
            if (!terrain.isWater(cx, cz))
                best = Math.max(best, terrain.height(cx, cz));
        });
        return best === -99 ? terrain.height(terrain.cellOf(px), terrain.cellOf(pz)) : best;
    }
    step(direction, dt, speedBonus) {
        const length = Math.hypot(direction.x, direction.z);
        this.moving = length > 0.05;
        const startX = this.x, startZ = this.z;
        const here = this.cell();
        this.swimming = this.world.terrain.isWater(here.x, here.z);
        if (this.moving) {
            this.facing = Math.atan2(direction.x, direction.z);
            const speed = FrPlayerBody.SPEED * (1 + speedBonus) * (this.swimming ? FrPlayerBody.SWIM_FACTOR : 1) * Math.min(1, length);
            const dx = (direction.x / length) * speed * dt, dz = (direction.z / length) * speed * dt;
            if (this.bodyFits(this.x + dx, this.z))
                this.x += dx;
            if (this.bodyFits(this.x, this.z + dz))
                this.z += dz;
        }
        this.vx = dt > 0 ? (this.x - startX) / dt : 0;
        this.vz = dt > 0 ? (this.z - startZ) / dt : 0;
        this.ground = this.groundUnder(this.x, this.z);
        const cell = this.cell();
        const swim = this.world.terrain.isWater(cell.x, cell.z);
        const target = swim ? this.world.terrain.surfaceY(cell.x, cell.z) - 1.4 : this.ground * FrTerrainData.BLOCK;
        this.y += (target - this.y) * Math.min(1, dt * 16);
    }
}
FrPlayerBody.SPEED = 8.4;
FrPlayerBody.SWIM_FACTOR = 0.3;
FrPlayerBody.REACH = 4.2;
FrPlayerBody.RADIUS = 0.9;
FrPlayerBody.FRONT = 2.6;
FrPlayerBody.SAMPLES = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
class FrTargetFinder {
    constructor(world) {
        this.world = world;
    }
    find(player) {
        const a = this.world.terrain.anchors;
        const B = FrTerrainData.BLOCK;
        const near = (cx, cz, range) => Math.hypot(player.x - cx, player.z - cz) <= range;
        if (near((a.campfire.x + 0.5) * B, (a.campfire.z + 0.5) * B, 5.4))
            return { kind: "cook", label: "요리", cell: null };
        if (near((a.publicChest.x + a.publicChest.size / 2) * B, (a.publicChest.z + a.publicChest.size / 2) * B, 6.4))
            return { kind: "chest", label: "창고", cell: null };
        for (const site of FrBuildSites.STAGE_TWO) {
            if (near((site.x + 0.5) * B, (site.z + 0.5) * B, 4.8))
                return { kind: "site", label: this.world.village.builtCount(site.id) > 0 ? "열기" : "짓기", cell: null, site };
        }
        const tree = this.nearestTree(player);
        if (tree)
            return { kind: "tree", label: "베기", cell: { x: tree.x, z: tree.z }, tree };
        const front = player.frontCell();
        if (this.world.terrain.diggable(front.x, front.z) && !this.world.blocked(front.x, front.z)) {
            const top = this.world.terrain.top(front.x, front.z);
            const here = player.cell();
            if (Math.abs(this.world.terrain.height(front.x, front.z) - this.world.terrain.height(here.x, here.z)) <= 1) {
                if (top === "W")
                    return { kind: "snow", label: "캐기", cell: front };
                if (top === "S")
                    return { kind: "stone", label: "캐기", cell: front };
                return { kind: "dig", label: "파기", cell: front };
            }
        }
        return null;
    }
    nearestTree(player) {
        let best = null;
        let bestDistance = FrPlayerBody.REACH;
        const here = player.cell();
        for (let dz = -3; dz <= 3; dz++) {
            for (let dx = -3; dx <= 3; dx++) {
                const spot = this.world.standingTree(this.world.terrain.index(here.x + dx, here.z + dz));
                if (!spot)
                    continue;
                const sx = (spot.x + 0.5) * FrTerrainData.BLOCK - player.x, sz = (spot.z + 0.5) * FrTerrainData.BLOCK - player.z;
                const distance = Math.hypot(sx, sz);
                const facing = (sx * Math.sin(player.facing) + sz * Math.cos(player.facing)) / Math.max(0.01, distance);
                if (distance < bestDistance && facing > 0.15) {
                    best = spot;
                    bestDistance = distance;
                }
            }
        }
        return best;
    }
}
class FrTask {
    constructor(kind, toolKind, apCost, clip, label, missingTool) {
        this.kind = kind;
        this.toolKind = toolKind;
        this.apCost = apCost;
        this.clip = clip;
        this.label = label;
        this.missingTool = missingTool;
    }
}
class FrTasks {
    static forTarget(kind) { return FrTasks.BY_TARGET[kind] || null; }
}
FrTasks.BY_TARGET = {
    tree: new FrTask("chop", "axe", FrBalance.ACTION_COST.chop, "chop", "나무 베기", ""),
    dig: new FrTask("dig", "shovel", FrBalance.ACTION_COST.digTile, "dig", "땅 파기", "삽이 있어야 파요. 작업대에서 만들 수 있어요."),
    stone: new FrTask("stone", "pickaxe", FrBalance.ACTION_COST.digTile, "pickaxe", "돌 캐기", ""),
    snow: new FrTask("snow", "pickaxe", FrBalance.ACTION_COST.digTile, "pickaxe", "눈 캐기", "곡괭이가 있어야 눈을 캘 수 있어요."),
};
class FrTaskOutcome {
    constructor(session, world, random, clock) {
        this.session = session;
        this.world = world;
        this.random = random;
        this.clock = clock;
    }
    async finish(target, task) {
        this.session.ap.spend(task.apCost);
        const broken = this.session.wearTool(task.toolKind);
        const note = broken ? FrItemNames.label(broken) + "이(가) 다 닳았어요" : "";
        if (target.kind === "tree" && target.tree)
            return (await this.chop(target.tree)) + note;
        if (!target.cell)
            return note;
        if (target.kind === "snow")
            return (await this.snow(target.cell)) + note;
        return (await this.dig(target.cell, target.kind === "stone")) + note;
    }
    async chop(spot) {
        const tier = this.session.bag.bestTier("axe");
        if (!(await this.world.fellTree(spot)))
            return "이미 쓰러진 나무예요";
        const wood = 2 + FrBalance.AXE_WOOD_BONUS[tier];
        this.session.gain("wood", wood);
        this.session.gain("vine", 1);
        const cleared = spot.zone >= 0 && this.world.zoneCleared(spot.zone);
        return "목재 +" + wood + ", 덩굴 +1" + (cleared ? " · 빈터가 생겼어요!" : "");
    }
    async dig(cell, stone) {
        const terrain = this.world.terrain;
        const before = { h: terrain.height(cell.x, cell.z), t: terrain.top(cell.x, cell.z) };
        const top = before.t;
        const after = { h: before.h - 1, t: top === "G" ? "D" : top };
        if (!(await this.world.editTerrain(cell.x, cell.z, before, after)))
            return "다른 친구가 먼저 팠어요";
        if (stone) {
            const drop = FrMineRules.terrainStoneDrop(this.random);
            this.session.gainAll(drop);
            return "돌을 캤어요 +" + Object.keys(drop).map((id) => FrItemNames.label(id)).join(", ");
        }
        const block = top === "G" ? "block_grass" : top === "N" ? "block_sand" : "block_dirt";
        this.session.gain(block, 1);
        if (top === "N")
            this.session.gain("sand", 1);
        return FrItemNames.label(block) + " +1";
    }
    async snow(cell) {
        await this.world.digSnow(cell.x, cell.z, this.clock.day());
        this.session.gain("ice", 1);
        return "얼음 +1 (눈은 3일 뒤 다시 생겨요)";
    }
}
