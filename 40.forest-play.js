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
    useWorld(world) { this.world = world; }
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
    bodyFits(px, pz) {
        const terrain = this.world.terrain;
        const r = FrPlayerBody.RADIUS;
        const base = this.swimming ? Math.max(this.ground, 1) : this.ground;
        return FrPlayerBody.SAMPLES.every(([dx, dz]) => {
            const cx = terrain.cellOf(px + dx * r), cz = terrain.cellOf(pz + dz * r);
            if (!terrain.inside(cx, cz) || terrain.top(cx, cz) === FrTerrainData.OCEAN)
                return false;
            if (this.world.blocked(cx, cz) || this.world.solid(cx, cz))
                return false;
            if (terrain.isWater(cx, cz))
                return true;
            const surface = this.world.surfaceAt(cx, cz);
            if (surface - base > 1)
                return false;
            return !this.world.overhead(cx, cz, Math.max(base, surface));
        });
    }
    groundUnder(px, pz) {
        const terrain = this.world.terrain;
        const r = FrPlayerBody.RADIUS;
        let best = -99;
        FrPlayerBody.SAMPLES.forEach(([dx, dz]) => {
            const cx = terrain.cellOf(px + dx * r), cz = terrain.cellOf(pz + dz * r);
            if (!terrain.isWater(cx, cz))
                best = Math.max(best, this.world.surfaceAt(cx, cz));
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
    find(player, context) {
        const a = this.world.terrain.anchors;
        const B = FrTerrainData.BLOCK;
        const near = (cx, cz, range) => Math.hypot(player.x - cx, player.z - cz) <= range;
        if (near((a.campfire.x + 0.5) * B, (a.campfire.z + 0.5) * B, 5.4))
            return { kind: "cook", label: "요리", cell: null };
        if (near((a.publicChest.x + a.publicChest.size / 2) * B, (a.publicChest.z + a.publicChest.size / 2) * B, 6.4))
            return { kind: "chest", label: "창고", cell: null };
        for (const id of Object.keys(a.portals)) {
            const p = a.portals[id];
            if (near((p.x + 0.5) * B, (p.z + 0.5) * B, 6.2))
                return { kind: "portal", label: FrAreaInfo.label(id), cell: null, portal: id };
        }
        for (const site of this.world.sites) {
            if (near((site.x + 0.5) * B, (site.z + 0.5) * B, site.small ? 4.8 : 6.2))
                return { kind: "site", label: this.siteLabel(site), cell: null, site };
        }
        if (context) {
            const front = player.frontCell();
            const farmTarget = this.farmTarget(front, context);
            if (farmTarget)
                return farmTarget;
            const chestY = this.personalChestAt(front, context.me);
            if (chestY >= 0 && !context.held)
                return { kind: "pchest", label: "내 창고", cell: front, removeY: chestY };
            const blockTarget = this.blockTarget(front, context);
            if (blockTarget)
                return blockTarget;
            const lotTarget = this.lotTarget(player, context);
            if (lotTarget)
                return lotTarget;
        }
        const tree = this.nearestTree(player);
        if (tree)
            return { kind: "tree", label: "베기", cell: { x: tree.x, z: tree.z }, tree };
        return this.cellTarget(player.frontCell(), player);
    }
    personalChestAt(cell, me) {
        const column = this.world.blocks.column(this.world.terrain.index(cell.x, cell.z));
        const found = column.find(([, record]) => record.t === FrFurnitureCatalog.idOf("box") && record.n === me.no);
        return found ? found[0] : -1;
    }
    siteLabel(site) {
        const done = this.world.isBuilt(site.id);
        if (site.defId === "farm_expand")
            return done ? "넓힘" : "넓히기";
        if (FrSiteBook.STATIONS.indexOf(site.defId) < 0)
            return done ? "살펴보기" : "짓기";
        return done ? "열기" : "짓기";
    }
    farmTarget(cell, context) {
        if (!FrFarmRules.isPlot(this.world, cell.x, cell.z))
            return null;
        const index = this.world.terrain.index(cell.x, cell.z);
        const record = this.world.farm.get(index);
        if (!record)
            return { kind: "farmPlant", label: "심기", cell };
        if (record.uid !== context.me.uid)
            return null;
        const stage = FrFarmRules.stage(this.world, cell.x, cell.z, record, context.nowMinute);
        return stage >= 3 ? { kind: "farmHarvest", label: "수확", cell } : { kind: "farmGrowing", label: "자라는 중", cell };
    }
    blockTarget(cell, context) {
        if (context.held) {
            const level = FrBlockRules.chooseLevel(this.world, cell.x, cell.z, context.levelPick);
            if (level < 0)
                return null;
            const check = FrBlockRules.check(this.world, cell.x, cell.z, level, context.me, context.bodies);
            return { kind: "place", label: "놓기", cell, plan: { x: cell.x, z: cell.z, y: level, t: context.held, r: context.rotation }, check };
        }
        const y = FrBlockRules.removable(this.world, cell.x, cell.z, context.me);
        return y >= 0 ? { kind: "remove", label: "치우기", cell, removeY: y } : null;
    }
    lotTarget(player, context) {
        const here = player.cell();
        const lotIndex = FrBlockRules.lotIndexAt(this.world, here.x, here.z);
        if (lotIndex < 0)
            return null;
        const lot = this.world.lots.get(lotIndex);
        if (!lot)
            return FrBlockRules.ownLot(this.world, context.me.uid) < 0 ? { kind: "lot", label: "집터 정하기", cell: null, lot: lotIndex } : null;
        if (lot.uid !== context.me.uid)
            return null;
        const anchor = this.world.terrain.anchors.lots[lotIndex];
        const empty = this.world.blocks.countWhere((index) => { const x = index % this.world.terrain.w, z = Math.floor(index / this.world.terrain.w); return x >= anchor.x && x < anchor.x + anchor.size && z >= anchor.z && z < anchor.z + anchor.size; }) === 0;
        return empty ? { kind: "house", label: "집 짓기", cell: null, lot: lotIndex } : null;
    }
    cellTarget(cell, player) {
        if (!this.world.terrain.diggable(cell.x, cell.z) || this.world.blocked(cell.x, cell.z) || this.world.blocks.top(this.world.terrain.index(cell.x, cell.z)) > 0)
            return null;
        const here = player.cell();
        if (Math.abs(this.world.terrain.height(cell.x, cell.z) - this.world.terrain.height(here.x, here.z)) > 1)
            return null;
        const top = this.world.terrain.top(cell.x, cell.z);
        if (FrFarmRules.canalAllowed(this.world, cell.x, cell.z))
            return { kind: "canal", label: "수로 파기", cell };
        if (top === "W")
            return { kind: "snow", label: "캐기", cell };
        if (top === "S")
            return { kind: "stone", label: "캐기", cell };
        return { kind: "dig", label: "파기", cell };
    }
    fromPick(pick, player) {
        const a = this.world.terrain.anchors;
        const B = FrTerrainData.BLOCK;
        const near = (cx, cz, range) => Math.hypot(player.x - cx, player.z - cz) <= range;
        if (pick.kind === "cook")
            return near((a.campfire.x + 0.5) * B, (a.campfire.z + 0.5) * B, 7.5) ? { target: { kind: "cook", label: "요리", cell: null }, far: false } : { target: null, far: true };
        if (pick.kind === "chest")
            return near((a.publicChest.x + a.publicChest.size / 2) * B, (a.publicChest.z + a.publicChest.size / 2) * B, 8.5) ? { target: { kind: "chest", label: "창고", cell: null }, far: false } : { target: null, far: true };
        if (pick.kind === "portal" && pick.siteId) {
            const p = a.portals[pick.siteId];
            if (!p)
                return { target: null, far: false };
            return near((p.x + 0.5) * B, (p.z + 0.5) * B, 8.5) ? { target: { kind: "portal", label: FrAreaInfo.label(pick.siteId), cell: null, portal: pick.siteId }, far: false } : { target: null, far: true };
        }
        if (pick.kind === "site") {
            const site = this.world.siteOf(pick.siteId || "");
            if (!site)
                return { target: null, far: false };
            return near((site.x + 0.5) * B, (site.z + 0.5) * B, 6.8) ? { target: { kind: "site", label: this.siteLabel(site), cell: null, site }, far: false } : { target: null, far: true };
        }
        if (pick.kind === "tree" && pick.spot) {
            const spot = this.world.standingTree(this.world.terrain.index(pick.spot.x, pick.spot.z));
            if (!spot)
                return { target: null, far: false };
            return near((spot.x + 0.5) * B, (spot.z + 0.5) * B, FrPlayerBody.REACH + 2) ? { target: { kind: "tree", label: "베기", cell: { x: spot.x, z: spot.z }, tree: spot }, far: false } : { target: null, far: true };
        }
        if (pick.kind === "ground" && pick.cell) {
            if (!near((pick.cell.x + 0.5) * B, (pick.cell.z + 0.5) * B, 5.4))
                return { target: null, far: true };
            return { target: this.cellTarget(pick.cell, player), far: false };
        }
        return { target: null, far: false };
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
    canal: new FrTask("dig", "shovel", FrBalance.ACTION_COST.canal, "dig", "수로 파기", "삽이 있어야 수로를 팔 수 있어요."),
    farmHarvest: new FrTask("harvest", "", 1, "work", "수확", ""),
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
        if (target.kind === "canal")
            return (await this.canal(target.cell)) + note;
        if (target.kind === "farmHarvest")
            return (await this.harvest(target.cell)) + note;
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
        this.session.stats.add("chop");
        if (cleared)
            this.session.stats.add("clear");
        return "목재 +" + wood + ", 덩굴 +1" + (cleared ? " · 빈터가 생겼어요!" : "");
    }
    async dig(cell, stone) {
        const terrain = this.world.terrain;
        const before = { h: terrain.height(cell.x, cell.z), t: terrain.top(cell.x, cell.z) };
        const top = before.t;
        const after = { h: before.h - 1, t: top === "G" ? "D" : top };
        if (!(await this.world.editTerrain(cell.x, cell.z, before, after)))
            return "다른 친구가 먼저 팠어요";
        this.session.stats.add("dug");
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
    async canal(cell) {
        const terrain = this.world.terrain;
        const before = { h: terrain.height(cell.x, cell.z), t: terrain.top(cell.x, cell.z) };
        if (!(await this.world.editTerrain(cell.x, cell.z, before, { h: before.h - 1, t: FrTerrainData.RIVER })))
            return "다른 친구가 먼저 팠어요";
        this.session.stats.add("canal");
        return "수로를 팠어요! 물이 닿는 텃밭은 작물이 더 빨리 자라요";
    }
    async harvest(cell) {
        const index = this.world.terrain.index(cell.x, cell.z);
        const record = await this.world.harvest(index, this.session.uid);
        if (!record)
            return "수확하지 못했어요";
        const yieldNow = FrCropRules.harvest(this.random);
        this.session.gain(record.crop, yieldNow.crop);
        this.session.gain(record.crop + "_seed", yieldNow.seed);
        this.session.stats.add("harvested");
        return FrItemNames.label(record.crop) + " +" + yieldNow.crop + ", 씨앗 +" + yieldNow.seed;
    }
    async snow(cell) {
        await this.world.digSnow(cell.x, cell.z, this.clock.day());
        this.session.gain("ice", 1);
        this.session.stats.add("iceGot");
        return "얼음 +1 (눈은 3일 뒤 다시 생겨요)";
    }
}
