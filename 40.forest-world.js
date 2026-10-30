"use strict";
class FrWorld {
    constructor(island, terrain, backend) {
        this.island = island;
        this.terrain = terrain;
        this.backend = backend;
        this.village = new FrVillage();
        this.publicStore = new FrPublicStore();
        this.snowDugDay = new Map();
        this.trees = new Map();
        this.blocks = new FrBlockStore();
        this.lots = new Map();
        this.felled = new Set();
        this.builtKeys = new Set();
        this.logKeys = new Set();
        this.listeners = [];
        FrTreeField.generate(terrain).forEach((spot) => this.trees.set(terrain.index(spot.x, spot.z), spot));
    }
    listen(listener) { this.listeners.push(listener); }
    solidBlock(record) { return !!record && FrWorld.PASSABLE_BLOCKS.indexOf(record.t) < 0; }
    surfaceAt(x, z) {
        const index = this.terrain.index(x, z);
        let stack = 0;
        while (stack < FrBlockRules.MAX_LEVEL && this.solidBlock(this.blocks.get(index, stack)))
            stack += 1;
        return this.terrain.height(x, z) + stack;
    }
    overhead(x, z, groundHeight) {
        const index = this.terrain.index(x, z);
        const base = this.terrain.height(x, z);
        for (let y = 0; y < FrBlockRules.MAX_LEVEL; y++) {
            const level = base + y;
            if (level >= groundHeight + 2)
                break;
            if (level >= groundHeight && this.solidBlock(this.blocks.get(index, y)))
                return true;
        }
        return false;
    }
    solid(x, z) {
        const a = this.terrain.anchors;
        if (x === a.campfire.x && z === a.campfire.z)
            return true;
        if (x >= a.publicChest.x && x < a.publicChest.x + a.publicChest.size && z >= a.publicChest.z && z < a.publicChest.z + a.publicChest.size)
            return true;
        return FrBuildSites.STAGE_TWO.some((s) => s.x === x && s.z === z);
    }
    path(rest) { return "forest/" + this.island + "/" + rest; }
    async load() {
        const [jungle, terrain, snow, build, publicAmounts, logs, blocks, lots] = await Promise.all([
            this.backend.get(this.path("jungle")),
            this.backend.get(this.path("terrain")),
            this.backend.get(this.path("snow")),
            this.backend.get(this.path("build")),
            this.backend.get(this.path("public")),
            this.backend.lastChildren(this.path("publicLog"), FrBalance.PUBLIC_LOG_LINES),
            this.backend.get(this.path("blocks")),
            this.backend.get(this.path("lots")),
        ]);
        Object.keys(blocks || {}).forEach((chunk) => Object.keys(blocks[chunk]).forEach((key) => {
            const parsed = FrBlockKey.parse(key);
            this.blocks.set(parsed.index, parsed.y, blocks[chunk][key]);
        }));
        Object.keys(lots || {}).forEach((n) => this.lots.set(Number(n), lots[n]));
        Object.keys(jungle || {}).forEach((key) => this.felled.add(Number(key)));
        Object.keys(terrain || {}).forEach((chunk) => Object.keys(terrain[chunk]).forEach((key) => {
            const cell = terrain[chunk][key];
            this.terrain.edit(Number(key) % this.terrain.w, Math.floor(Number(key) / this.terrain.w), { h: cell[0], t: cell[1] });
        }));
        Object.keys(snow || {}).forEach((key) => this.snowDugDay.set(Number(key), snow[key]));
        Object.keys(build || {}).forEach((key) => { this.builtKeys.add(key); this.village.markBuilt(key.replace(/_\d+$/, "")); });
        this.publicStore.restore(publicAmounts || {}, logs.map(([, line]) => line));
        logs.forEach(([key]) => this.logKeys.add(key));
    }
    isFelled(index) { return this.felled.has(index); }
    standingTree(index) { return this.felled.has(index) ? null : this.trees.get(index) || null; }
    blocked(x, z) { return this.standingTree(this.terrain.index(x, z)) !== null; }
    zoneCleared(zone) {
        if (zone < 0)
            return false;
        for (const [index, spot] of this.trees)
            if (spot.zone === zone && !this.felled.has(index))
                return false;
        return true;
    }
    async fellTree(spot) {
        const index = this.terrain.index(spot.x, spot.z);
        if (this.felled.has(index))
            return false;
        const result = await this.backend.transaction(this.path("jungle/" + index), (current) => (current === null ? 1 : undefined));
        if (!result.committed) {
            this.felled.add(index);
            this.listeners.forEach((l) => l.onTreeFelled(spot));
            return false;
        }
        this.felled.add(index);
        this.listeners.forEach((l) => l.onTreeFelled(spot));
        return true;
    }
    async editTerrain(x, z, before, after) {
        const index = this.terrain.index(x, z);
        const chunk = Math.floor(x / FrTerrainMesher.CHUNK) + "_" + Math.floor(z / FrTerrainMesher.CHUNK);
        const result = await this.backend.transaction(this.path("terrain/" + chunk + "/" + index), (current) => {
            const nowHeight = current ? current[0] : before.h;
            return nowHeight === before.h ? [after.h, after.t] : undefined;
        });
        if (!result.committed)
            return false;
        this.terrain.edit(x, z, after);
        this.listeners.forEach((l) => l.onTerrainEdited(x, z));
        return true;
    }
    async digSnow(x, z, day) {
        const index = this.terrain.index(x, z);
        this.snowDugDay.set(index, day);
        this.terrain.edit(x, z, { h: this.terrain.height(x, z), t: FrWorld.BARE_TOP });
        this.listeners.forEach((l) => l.onTerrainEdited(x, z));
        await this.backend.set(this.path("snow/" + index), day);
    }
    syncSnow(day) {
        this.snowDugDay.forEach((dugDay, index) => {
            const x = index % this.terrain.w, z = Math.floor(index / this.terrain.w);
            const regrown = FrSnowRules.regrown(dugDay, day);
            const wanted = regrown ? FrWorld.SNOW_TOP : FrWorld.BARE_TOP;
            if (this.terrain.top(x, z) === wanted || (regrown && this.terrain.top(x, z) !== FrWorld.BARE_TOP)) {
                if (regrown)
                    this.snowDugDay.delete(index);
                return;
            }
            this.terrain.edit(x, z, { h: this.terrain.height(x, z), t: wanted });
            this.listeners.forEach((l) => l.onTerrainEdited(x, z));
            if (regrown) {
                this.snowDugDay.delete(index);
                void this.backend.set(this.path("snow/" + index), null);
            }
        });
    }
    async putPublic(id, amount, who) {
        if (!this.publicStore.canPut(id, amount))
            return false;
        const result = await this.backend.transaction(this.path("public/" + id), (current) => (current || 0) + amount);
        this.publicStore.setAmount(id, result.value || 0);
        await this.logLine({ at: Date.now(), who, verb: "put", item: id, count: amount });
        this.listeners.forEach((l) => l.onPublicChanged());
        return true;
    }
    async takePublic(id, amount, who) {
        const result = await this.backend.transaction(this.path("public/" + id), (current) => ((current || 0) >= amount ? ((current || 0) - amount || null) : undefined));
        if (!result.committed)
            return false;
        this.publicStore.setAmount(id, result.value || 0);
        await this.logLine({ at: Date.now(), who, verb: "take", item: id, count: amount });
        this.listeners.forEach((l) => l.onPublicChanged());
        return true;
    }
    async build(def, who) {
        if (this.village.builtCount(def.id) >= def.count || this.village.level() < def.minVillageLevel)
            return false;
        const paid = [];
        const left = {};
        for (const id of Object.keys(def.cost)) {
            const result = await this.backend.transaction(this.path("public/" + id), (current) => ((current || 0) >= def.cost[id] ? ((current || 0) - def.cost[id] || null) : undefined));
            if (!result.committed) {
                await this.refund(paid);
                return false;
            }
            paid.push([id, def.cost[id]]);
            left[id] = result.value || 0;
        }
        const number = this.village.builtCount(def.id) + 1;
        this.builtKeys.add(def.id + "_" + number);
        const slot = await this.backend.transaction(this.path("build/" + def.id + "_" + number), (current) => (current === null ? { at: Date.now(), by: who } : undefined));
        if (!slot.committed) {
            this.builtKeys.delete(def.id + "_" + number);
            await this.refund(paid);
            return false;
        }
        paid.forEach(([id]) => this.publicStore.setAmount(id, left[id]));
        await Promise.all(paid.map(([id, n]) => this.logLine({ at: Date.now(), who, verb: "build", item: id, count: n })));
        this.village.markBuilt(def.id);
        this.listeners.forEach((l) => { l.onBuilt(def.id, this.village.builtCount(def.id)); l.onPublicChanged(); });
        return true;
    }
    async refund(paid) {
        for (const [id, n] of paid)
            await this.backend.transaction(this.path("public/" + id), (current) => (current || 0) + n);
    }
    async logLine(line) {
        const key = String(line.at).padStart(14, "0") + "_" + Math.floor(Math.random() * 1000);
        this.logKeys.add(key);
        this.publicStore.addLine(line);
        await this.backend.set(this.path("publicLog/" + key), line);
    }
    blockPath(x, z, y) {
        return this.path("blocks/" + Math.floor(x / FrTerrainMesher.CHUNK) + "_" + Math.floor(z / FrTerrainMesher.CHUNK) + "/" + FrBlockKey.key(this.terrain.index(x, z), y));
    }
    async placeBlock(x, z, y, type, rot, me) {
        const record = { t: type, n: me.no, r: rot };
        const result = await this.backend.transaction(this.blockPath(x, z, y), (current) => (current === null ? record : undefined));
        if (!result.committed)
            return false;
        this.applyBlock(x, z, y, record);
        return true;
    }
    async removeBlock(x, z, y, me) {
        const old = this.blocks.get(this.terrain.index(x, z), y);
        const result = await this.backend.transaction(this.blockPath(x, z, y), (current) => (current !== null && FrBlockRules.canRemove(current, me) ? null : undefined));
        if (!result.committed)
            return null;
        this.applyBlock(x, z, y, null);
        return old;
    }
    async placeMany(plan, me) {
        const chunks = new Map();
        plan.forEach((p) => {
            const chunk = Math.floor(p.x / FrTerrainMesher.CHUNK) + "_" + Math.floor(p.z / FrTerrainMesher.CHUNK);
            if (!chunks.has(chunk))
                chunks.set(chunk, {});
            chunks.get(chunk)[FrBlockKey.key(this.terrain.index(p.x, p.z), p.y)] = { t: p.t, n: me.no, r: p.r };
        });
        for (const [chunk, values] of chunks)
            await this.backend.patch(this.path("blocks/" + chunk), values);
        plan.forEach((p) => this.applyBlock(p.x, p.z, p.y, { t: p.t, n: me.no, r: p.r }));
        return plan.length;
    }
    async clearBlocks(test) {
        const doomed = [];
        this.blocks.forEach((index, y, record) => {
            const x = index % this.terrain.w, z = Math.floor(index / this.terrain.w);
            if (test(record, x, z))
                doomed.push([x, z, y]);
        });
        const chunks = new Map();
        doomed.forEach(([x, z, y]) => {
            const chunk = Math.floor(x / FrTerrainMesher.CHUNK) + "_" + Math.floor(z / FrTerrainMesher.CHUNK);
            if (!chunks.has(chunk))
                chunks.set(chunk, {});
            chunks.get(chunk)[FrBlockKey.key(this.terrain.index(x, z), y)] = null;
        });
        for (const [chunk, values] of chunks)
            await this.backend.patch(this.path("blocks/" + chunk), values);
        doomed.forEach(([x, z, y]) => this.applyBlock(x, z, y, null));
        return doomed.length;
    }
    applyBlock(x, z, y, record) {
        if (!this.blocks.set(this.terrain.index(x, z), y, record))
            return;
        this.listeners.forEach((l) => l.onBlockChanged(x, z, y, record));
    }
    remoteBlock(index, y, record) {
        const x = index % this.terrain.w, z = Math.floor(index / this.terrain.w);
        const now = this.blocks.get(index, y);
        if (now === null && record === null)
            return;
        if (now !== null && record !== null && now.t === record.t && now.r === record.r)
            return;
        if (now !== null && record === null) {
            this.applyBlock(x, z, y, null);
            return;
        }
        if (now !== null)
            this.blocks.set(index, y, null);
        this.blocks.set(index, y, record);
        this.listeners.forEach((l) => l.onBlockChanged(x, z, y, record));
    }
    async claimLot(n, lot) {
        const result = await this.backend.transaction(this.path("lots/" + n), (current) => (current === null ? lot : undefined));
        if (!result.committed)
            return false;
        this.lots.set(n, lot);
        this.listeners.forEach((l) => l.onLotChanged());
        return true;
    }
    async releaseLot(n) {
        await this.backend.set(this.path("lots/" + n), null);
        this.lots.delete(n);
        this.listeners.forEach((l) => l.onLotChanged());
    }
    remoteLot(n, lot) {
        if (lot === null)
            this.lots.delete(n);
        else
            this.lots.set(n, lot);
        this.listeners.forEach((l) => l.onLotChanged());
    }
    remoteFelled(index) {
        if (this.felled.has(index))
            return;
        this.felled.add(index);
        const spot = this.trees.get(index);
        if (spot)
            this.listeners.forEach((l) => l.onTreeFelled(spot));
    }
    remoteTerrain(index, edit) {
        const x = index % this.terrain.w, z = Math.floor(index / this.terrain.w);
        const now = this.terrain.editOf(x, z);
        if (now && now.h === edit.h && now.t === edit.t)
            return;
        this.terrain.edit(x, z, edit);
        this.listeners.forEach((l) => l.onTerrainEdited(x, z));
    }
    remoteSnow(index, day) {
        if (day === null)
            this.snowDugDay.delete(index);
        else
            this.snowDugDay.set(index, day);
    }
    remoteBuilt(key) {
        if (this.builtKeys.has(key))
            return;
        this.builtKeys.add(key);
        const id = key.replace(/_\d+$/, "");
        this.village.markBuilt(id);
        this.listeners.forEach((l) => { l.onBuilt(id, this.village.builtCount(id)); l.onPublicChanged(); });
    }
    remotePublic(id, amount) {
        if (this.publicStore.count(id) === amount)
            return;
        this.publicStore.setAmount(id, amount);
        this.listeners.forEach((l) => l.onPublicChanged());
    }
    remoteLog(key, line) {
        if (this.logKeys.has(key))
            return;
        this.logKeys.add(key);
        this.publicStore.addLine(line);
        this.listeners.forEach((l) => l.onPublicChanged());
    }
}
FrWorld.SNOW_TOP = "W";
FrWorld.BARE_TOP = "S";
FrWorld.PASSABLE_BLOCKS = ["block_door", "block_torch"];
