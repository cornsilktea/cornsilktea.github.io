"use strict";
class FrTerrainData {
    constructor(file) {
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
        this.original = this.heights.slice();
        this.originalTops = this.tops.slice();
        this.markShielded();
    }
    index(x, z) { return z * this.w + x; }
    inside(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.d; }
    height(x, z) { return this.inside(x, z) ? this.heights[this.index(x, z)] : -2; }
    top(x, z) { return this.inside(x, z) ? this.tops[this.index(x, z)] : FrTerrainData.OCEAN; }
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
        this.tops[i] = edit.t;
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
FrTreeField.OPEN_DENSITY = 0.06;
FrTreeField.HILL_DENSITY = 0.11;
class FrTerrainMesher {
    constructor(libs, data, material) {
        this.libs = libs;
        this.data = data;
        this.material = material;
    }
    chunkCount() {
        return { x: Math.ceil(this.data.w / FrTerrainMesher.CHUNK), z: Math.ceil(this.data.d / FrTerrainMesher.CHUNK) };
    }
    build(cx, cz) {
        const positions = [];
        const colors = [];
        const x0 = cx * FrTerrainMesher.CHUNK, z0 = cz * FrTerrainMesher.CHUNK;
        for (let z = z0; z < Math.min(this.data.d, z0 + FrTerrainMesher.CHUNK); z++) {
            for (let x = x0; x < Math.min(this.data.w, x0 + FrTerrainMesher.CHUNK); x++)
                this.addCell(x, z, positions, colors);
        }
        if (positions.length === 0)
            return null;
        const geometry = new this.libs.THREE.BufferGeometry();
        geometry.setAttribute("position", new this.libs.THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new this.libs.THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new this.libs.THREE.Mesh(geometry, this.material);
        mesh.matrixAutoUpdate = false;
        return mesh;
    }
    shade(base, factor, noise) {
        return [base[0] * factor * noise, base[1] * factor * noise, base[2] * factor * noise];
    }
    addCell(x, z, positions, colors) {
        const B = FrTerrainData.BLOCK;
        const h = this.data.height(x, z);
        const type = this.data.top(x, z);
        const y = h * B;
        const noise = 0.93 + FrTreeField.hash(x, z, 9) * 0.14;
        const heightTint = 1 + Math.max(0, h) * 0.012;
        const top = this.shade(FrTerrainMesher.TOP_COLORS[type] || FrTerrainMesher.TOP_COLORS.G, heightTint, noise);
        this.quad(positions, colors, [x * B, y, z * B], [x * B, y, (z + 1) * B], [(x + 1) * B, y, (z + 1) * B], [(x + 1) * B, y, z * B], top);
        FrTerrainMesher.NEIGHBORS.forEach(([dx, dz, factor]) => {
            const nh = this.data.height(x + dx, z + dz);
            if (nh >= h)
                return;
            const low = Math.max(nh, -3) * B;
            const wall = this.shade(FrTerrainMesher.WALL_COLORS[type] || FrTerrainMesher.WALL_COLORS.G, factor, noise);
            const px = x * B, pz = z * B;
            if (dx === 1)
                this.quad(positions, colors, [px + B, y, pz], [px + B, y, pz + B], [px + B, low, pz + B], [px + B, low, pz], wall);
            else if (dx === -1)
                this.quad(positions, colors, [px, y, pz + B], [px, y, pz], [px, low, pz], [px, low, pz + B], wall);
            else if (dz === 1)
                this.quad(positions, colors, [px, y, pz + B], [px + B, y, pz + B], [px + B, low, pz + B], [px, low, pz + B], wall);
            else
                this.quad(positions, colors, [px + B, y, pz], [px, y, pz], [px, low, pz], [px + B, low, pz], wall);
        });
    }
    quad(positions, colors, a, b, c, d, color) {
        [a, b, c, a, c, d].forEach((p) => { positions.push(p[0], p[1], p[2]); colors.push(color[0], color[1], color[2]); });
    }
}
FrTerrainMesher.CHUNK = 16;
FrTerrainMesher.TOP_COLORS = {
    G: [0.38, 0.62, 0.29], D: [0.57, 0.42, 0.27], S: [0.50, 0.50, 0.52], N: [0.90, 0.83, 0.60],
    W: [0.96, 0.97, 0.99], R: [0.60, 0.55, 0.40], O: [0.28, 0.36, 0.42], P: [0.78, 0.67, 0.46],
};
FrTerrainMesher.WALL_COLORS = {
    G: [0.46, 0.34, 0.22], D: [0.46, 0.34, 0.22], S: [0.42, 0.42, 0.45], N: [0.80, 0.72, 0.50],
    W: [0.55, 0.57, 0.62], R: [0.42, 0.38, 0.28], O: [0.22, 0.28, 0.34], P: [0.62, 0.52, 0.36],
};
FrTerrainMesher.NEIGHBORS = [[1, 0, 0.78], [-1, 0, 0.78], [0, 1, 0.9], [0, -1, 0.66]];
