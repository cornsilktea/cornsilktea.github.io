"use strict";
class FrTerrainData {
    constructor(file) {
        this.flooded = new Set();
        this.shielded = new Set();
        this.w = file.w;
        this.d = file.d;
        this.anchors = file.anchors;
        this.heights = new Int8Array(this.w * this.d);
        this.tops = new Array(this.w * this.d);
        for (let z = 0; z < this.d; z++) {
            for (let x = 0; x < this.w; x++) {
                this.heights[z * this.w + x] = file.heights[z].charCodeAt(x) - 97 - 2;
                this.tops[z * this.w + x] = file.tops[z].charAt(x);
            }
        }
        this.levelBridgeLandings();
        this.original = this.heights.slice();
        this.originalTops = this.tops.slice();
        this.markShielded();
    }
    levelBridgeLandings() {
        const bridges = this.anchors.bridges || {};
        Object.keys(bridges).forEach((id) => {
            const cells = bridges[id];
            if (!cells || cells.length === 0)
                return;
            const alongX = cells.every(([, z]) => z === cells[0][1]);
            const step = alongX ? [1, 0] : [0, 1];
            const side = alongX ? [0, 1] : [1, 0];
            const ends = [[cells[0], -1], [cells[cells.length - 1], 1]];
            ends.forEach(([[ex, ez], dir]) => {
                [0, 1].forEach((row) => {
                    for (let k = 1; k <= FrTerrainData.LANDING_REACH; k++) {
                        const x = ex + step[0] * dir * k + side[0] * row, z = ez + step[1] * dir * k + side[1] * row;
                        if (!this.inside(x, z) || this.isWater(x, z))
                            continue;
                        const i = this.index(x, z);
                        if (this.heights[i] !== 1)
                            break;
                        this.heights[i] = 0;
                    }
                });
            });
        });
    }
    index(x, z) { return z * this.w + x; }
    inside(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.d; }
    height(x, z) { return this.inside(x, z) ? this.heights[this.index(x, z)] : -2; }
    top(x, z) {
        if (!this.inside(x, z))
            return FrTerrainData.OCEAN;
        const i = this.index(x, z);
        return this.flooded.has(i) ? FrTerrainData.RIVER : this.tops[i];
    }
    isSource(x, z) {
        if (!this.inside(x, z))
            return true;
        const t = this.originalTops[this.index(x, z)];
        return t === FrTerrainData.OCEAN || t === FrTerrainData.RIVER;
    }
    isFlooded(x, z) { return this.inside(x, z) && this.flooded.has(this.index(x, z)); }
    refreshFlood(dammed) {
        const next = new Set();
        const queue = [];
        for (let i = 0; i < this.w * this.d; i++)
            if (this.isSource(i % this.w, Math.floor(i / this.w)))
                queue.push(i);
        while (queue.length > 0) {
            const i = queue.pop();
            const x = i % this.w, z = Math.floor(i / this.w);
            FrTerrainData.SIDES.forEach(([dx, dz]) => {
                const nx = x + dx, nz = z + dz;
                if (!this.inside(nx, nz) || this.isSource(nx, nz))
                    return;
                const n = this.index(nx, nz);
                if (next.has(n) || this.heights[n] > FrTerrainData.WATER_LEVEL || dammed(n))
                    return;
                next.add(n);
                queue.push(n);
            });
        }
        const changed = [];
        this.flooded.forEach((i) => { if (!next.has(i))
            changed.push(i); });
        next.forEach((i) => { if (!this.flooded.has(i))
            changed.push(i); });
        this.flooded.clear();
        next.forEach((i) => this.flooded.add(i));
        return changed;
    }
    isWater(x, z) { const t = this.top(x, z); return t === FrTerrainData.OCEAN || t === FrTerrainData.RIVER; }
    surfaceY(x, z) { return this.height(x, z) * FrTerrainData.BLOCK; }
    cellOf(worldCoordinate) { return Math.floor(worldCoordinate / FrTerrainData.BLOCK); }
    canStep(fromX, fromZ, toX, toZ) {
        if (!this.inside(toX, toZ) || this.top(toX, toZ) === FrTerrainData.OCEAN)
            return false;
        if (this.isWater(fromX, fromZ) || this.isWater(toX, toZ))
            return true;
        return this.height(toX, toZ) - this.height(fromX, fromZ) <= 1;
    }
    edit(x, z, edit) {
        const i = this.index(x, z);
        this.heights[i] = edit.h;
        this.tops[i] = edit.t === FrTerrainData.RIVER && !this.isSource(x, z) ? FrTerrainData.DUG_TOP : edit.t;
    }
    restore(x, z) {
        const i = this.index(x, z);
        this.heights[i] = this.original[i];
        this.tops[i] = this.originalTops[i];
    }
    editOf(x, z) {
        const i = this.index(x, z);
        if (this.heights[i] === this.original[i] && this.tops[i] === this.originalTops[i])
            return null;
        return { h: this.heights[i], t: this.tops[i] };
    }
    isShielded(x, z) { return this.shielded.has(this.index(x, z)); }
    diggable(x, z) {
        if (!this.inside(x, z) || this.isShielded(x, z) || this.isWater(x, z))
            return false;
        return this.height(x, z) - 1 >= FrTerrainData.MIN_HEIGHT;
    }
    markShielded() {
        const a = this.anchors;
        const shield = (cx, cz, radius) => {
            for (let z = Math.floor(cz - radius); z <= Math.ceil(cz + radius); z++) {
                for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
                    if (this.inside(x, z) && Math.hypot(x - cx, z - cz) <= radius)
                        this.shielded.add(this.index(x, z));
                }
            }
        };
        shield(a.plaza.x, a.plaza.z, a.plaza.radius + 1.5);
        shield(a.publicChest.x + 0.5, a.publicChest.z + 0.5, 3);
        Object.keys(a.portals).forEach((id) => shield(a.portals[id].x, a.portals[id].z, 3.5));
        Object.keys(a.paths).forEach((id) => a.paths[id].forEach(([x, z]) => shield(x + 0.5, z + 0.5, 1.2)));
        Object.keys(a.bridges).forEach((id) => a.bridges[id].forEach(([x, z]) => shield(x, z, 1.5)));
        a.lots.forEach((l) => { for (let j = 0; j < l.size; j++)
            for (let i = 0; i < l.size; i++)
                this.shielded.add(this.index(l.x + i, l.z + j)); });
        for (let j = 0; j < a.farm.d + 4; j++)
            for (let i = 0; i < a.farm.w; i++)
                this.shielded.add(this.index(a.farm.x + i, a.farm.z + j));
    }
}
FrTerrainData.BLOCK = 2;
FrTerrainData.MIN_HEIGHT = -1;
FrTerrainData.OCEAN = "O";
FrTerrainData.RIVER = "R";
FrTerrainData.WATER_LEVEL = -1;
FrTerrainData.DUG_TOP = "D";
FrTerrainData.SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
FrTerrainData.LANDING_REACH = 3;
class FrTreeSpot {
    constructor(x, z, variant, zone) {
        this.x = x;
        this.z = z;
        this.variant = variant;
        this.zone = zone;
    }
}
class FrTreeField {
    static hash(x, z, salt) {
        let h = Math.imul((x * 73856093) ^ (z * 19349663) ^ (salt * 83492791), 2654435761);
        h = Math.imul(h ^ (h >>> 15), 2246822519);
        return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
    }
    static generate(data) {
        const zoneOf = new Map();
        data.anchors.jungleZones.forEach(([x0, z0], zone) => {
            for (let j = 0; j < 5; j++)
                for (let i = 0; i < 5; i++)
                    zoneOf.set(data.index(x0 + i, z0 + j), zone);
        });
        const spots = [];
        for (let z = 1; z < data.d - 1; z++) {
            for (let x = 1; x < data.w - 1; x++) {
                if (data.top(x, z) !== "G" || data.isShielded(x, z))
                    continue;
                const zone = zoneOf.has(data.index(x, z)) ? zoneOf.get(data.index(x, z)) : -1;
                const far = Math.hypot(x - data.anchors.plaza.x, z - data.anchors.plaza.z) > 14;
                const density = zone >= 0 ? FrTreeField.ZONE_DENSITY : far ? (data.height(x, z) >= 3 ? FrTreeField.HILL_DENSITY : FrTreeField.OPEN_DENSITY) : 0;
                if (FrTreeField.hash(x, z, 21) > density)
                    continue;
                spots.push(new FrTreeSpot(x, z, Math.floor(FrTreeField.hash(x, z, 5) * 3), zone));
            }
        }
        return spots;
    }
}
FrTreeField.ZONE_DENSITY = 0.85;
FrTreeField.OPEN_DENSITY = 0.24;
FrTreeField.HILL_DENSITY = 0.3;
class FrTerrainTiles {
    static topOf(type) { return FrTerrainTiles.TOP[type] || "grassTop"; }
    static sideOf(type, upper) { const pair = FrTerrainTiles.SIDE[type] || FrTerrainTiles.SIDE.G; return upper ? pair[0] : pair[1]; }
    static rect(name) {
        const index = Math.max(0, FrTerrainTiles.NAMES.indexOf(name));
        const col = index % FrTerrainTiles.COLUMNS, row = Math.floor(index / FrTerrainTiles.COLUMNS);
        const w = FrTerrainTiles.COLUMNS * FrTerrainTiles.SIZE, h = FrTerrainTiles.ROWS * FrTerrainTiles.SIZE;
        const inset = 0.02;
        const u0 = (col * FrTerrainTiles.SIZE + inset) / w, u1 = ((col + 1) * FrTerrainTiles.SIZE - inset) / w;
        const v1 = 1 - (row * FrTerrainTiles.SIZE + inset) / h, v0 = 1 - ((row + 1) * FrTerrainTiles.SIZE - inset) / h;
        return [u0, v0, u1, v1];
    }
}
FrTerrainTiles.SIZE = 16;
FrTerrainTiles.COLUMNS = 8;
FrTerrainTiles.ROWS = 2;
FrTerrainTiles.NAMES = ["grassTop", "grassSide", "dirt", "stone", "sand", "snowTop", "snowSide", "riverBed", "trail", "caveFloor", "caveRock", "crystal", "dark", "lava", "seaBed", "stoneDark"];
FrTerrainTiles.TOP = {
    G: "grassTop", D: "dirt", S: "stone", N: "sand", W: "snowTop", R: "riverBed", O: "riverBed", P: "trail", C: "caveFloor", T: "caveRock", V: "crystal", K: "dark", L: "lava",
};
FrTerrainTiles.SIDE = {
    G: ["grassSide", "dirt"], D: ["dirt", "dirt"], S: ["stone", "stoneDark"], N: ["sand", "sand"], W: ["snowSide", "stone"], R: ["dirt", "dirt"], O: ["dirt", "dirt"],
    P: ["trail", "dirt"], C: ["caveRock", "caveRock"], T: ["caveRock", "caveRock"], V: ["crystal", "caveRock"], K: ["dark", "dark"], L: ["lava", "dark"],
};
class FrTerrainMesher {
    constructor(libs, data, material) {
        this.libs = libs;
        this.data = data;
        this.material = material;
        this.light = null;
    }
    chunkCount() {
        return { x: Math.ceil(this.data.w / FrTerrainMesher.CHUNK), z: Math.ceil(this.data.d / FrTerrainMesher.CHUNK) };
    }
    build(cx, cz) {
        const positions = [];
        const colors = [];
        const uvs = [];
        const x0 = cx * FrTerrainMesher.CHUNK, z0 = cz * FrTerrainMesher.CHUNK;
        for (let z = z0; z < Math.min(this.data.d, z0 + FrTerrainMesher.CHUNK); z++) {
            for (let x = x0; x < Math.min(this.data.w, x0 + FrTerrainMesher.CHUNK); x++)
                this.addCell(x, z, positions, colors, uvs);
        }
        if (positions.length === 0)
            return null;
        const geometry = new this.libs.THREE.BufferGeometry();
        geometry.setAttribute("position", new this.libs.THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new this.libs.THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute("uv", new this.libs.THREE.Float32BufferAttribute(uvs, 2));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new this.libs.THREE.Mesh(geometry, this.material);
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = true;
        return mesh;
    }
    addCell(x, z, positions, colors, uvs) {
        const B = FrTerrainData.BLOCK;
        const h = this.data.height(x, z);
        const type = this.data.top(x, z);
        const y = h * B;
        const noise = 0.94 + FrTreeField.hash(x, z, 9) * 0.1;
        const lit = this.light ? this.light(x, z) : [1, 1, 1];
        const top = [noise * lit[0], noise * lit[1], noise * lit[2]];
        const turn = Math.floor(FrTreeField.hash(x, z, 11) * 4);
        this.quad(positions, colors, uvs, [x * B, y, z * B], [x * B, y, (z + 1) * B], [(x + 1) * B, y, (z + 1) * B], [(x + 1) * B, y, z * B], top, FrTerrainTiles.rect(FrTerrainTiles.topOf(type)), turn);
        FrTerrainMesher.NEIGHBORS.forEach(([dx, dz, factor]) => {
            const nh = this.data.height(x + dx, z + dz);
            if (nh >= h)
                return;
            const neighborLit = this.light ? this.light(x + dx, z + dz) : [1, 1, 1];
            const px = x * B, pz = z * B;
            for (let level = h; level > Math.max(nh, FrTerrainMesher.LOWEST); level--) {
                const hi = level * B, lo = (level - 1) * B;
                const shade = factor * noise * (level === h ? 1 : 0.92);
                const wall = [shade * neighborLit[0], shade * neighborLit[1], shade * neighborLit[2]];
                const rect = FrTerrainTiles.rect(FrTerrainTiles.sideOf(type, level === h));
                if (dx === 1)
                    this.quad(positions, colors, uvs, [px + B, hi, pz], [px + B, hi, pz + B], [px + B, lo, pz + B], [px + B, lo, pz], wall, rect, -1);
                else if (dx === -1)
                    this.quad(positions, colors, uvs, [px, hi, pz + B], [px, hi, pz], [px, lo, pz], [px, lo, pz + B], wall, rect, -1);
                else if (dz === 1)
                    this.quad(positions, colors, uvs, [px, hi, pz + B], [px + B, hi, pz + B], [px + B, lo, pz + B], [px, lo, pz + B], wall, rect, -1);
                else
                    this.quad(positions, colors, uvs, [px + B, hi, pz], [px, hi, pz], [px, lo, pz], [px + B, lo, pz], wall, rect, -1);
            }
        });
    }
    quad(positions, colors, uvs, a, b, c, d, color, rect, turn) {
        const [u0, v0, u1, v1] = rect;
        const corners = turn < 0 ? [[u0, v1], [u1, v1], [u1, v0], [u0, v0]] : [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
        const spin = Math.max(0, turn);
        const at = (k) => corners[(k + spin) % 4];
        const order = [[a, at(0)], [b, at(1)], [c, at(2)], [a, at(0)], [c, at(2)], [d, at(3)]];
        order.forEach(([p, uv]) => { positions.push(p[0], p[1], p[2]); colors.push(color[0], color[1], color[2]); uvs.push(uv[0], uv[1]); });
    }
}
FrTerrainMesher.CHUNK = 16;
FrTerrainMesher.NEIGHBORS = [[1, 0, 0.8], [-1, 0, 0.8], [0, 1, 0.92], [0, -1, 0.68]];
FrTerrainMesher.LOWEST = -3;
class FrWaterDepth {
    static compute(terrain) {
        const depth = new Uint8Array(terrain.w * terrain.d);
        const queue = [];
        for (let z = 0; z < terrain.d; z++)
            for (let x = 0; x < terrain.w; x++) {
                const i = terrain.index(x, z);
                if (terrain.isWater(x, z))
                    depth[i] = FrWaterDepth.DEEP;
                else
                    queue.push(i);
            }
        for (let head = 0; head < queue.length; head++) {
            const i = queue[head];
            const x = i % terrain.w, z = Math.floor(i / terrain.w);
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
                const nx = x + dx, nz = z + dz;
                if (!terrain.inside(nx, nz))
                    return;
                const n = terrain.index(nx, nz);
                if (depth[n] <= depth[i] + 1)
                    return;
                depth[n] = depth[i] + 1;
                queue.push(n);
            });
        }
        return depth;
    }
    static shade(depth) {
        const t = Math.min(1, Math.max(0, (depth - 1) / (FrWaterDepth.DEEP - 1)));
        const shallow = [0.42, 0.74, 0.9], deep = [0.12, 0.3, 0.56];
        return [shallow[0] + (deep[0] - shallow[0]) * t, shallow[1] + (deep[1] - shallow[1]) * t, shallow[2] + (deep[2] - shallow[2]) * t];
    }
}
FrWaterDepth.DEEP = 7;
