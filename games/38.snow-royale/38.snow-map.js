"use strict";
class SnTile {
}
SnTile.FLAT = 0;
SnTile.RAMP = 1;
SnTile.MOUNTAIN = 2;
SnTile.BLOCK = 3;
SnTile.LEVEL_HEIGHT = 2.4;
SnTile.RAMP_LENGTH = 3;
class SnSurface {
}
SnSurface.SNOW = 0;
SnSurface.ICE = 1;
SnSurface.BRIDGE = 2;
SnSurface.DECK = 0.1;
class SnGridMath {
    static col(x) { return Math.floor((x + SnGridMath.HALF) / SnGridMath.CELL); }
    static row(z) { return Math.floor((z + SnGridMath.HALF) / SnGridMath.CELL); }
    static inside(i, j) { return i >= 0 && j >= 0 && i < SnGridMath.SIZE && j < SnGridMath.SIZE; }
    static index(i, j) { return j * SnGridMath.SIZE + i; }
    static indexAt(x, z) {
        const i = SnGridMath.col(x), j = SnGridMath.row(z);
        return SnGridMath.inside(i, j) ? SnGridMath.index(i, j) : -1;
    }
    static colOf(idx) { return idx % SnGridMath.SIZE; }
    static rowOf(idx) { return Math.floor(idx / SnGridMath.SIZE); }
    static centerX(idx) { return SnGridMath.colOf(idx) * SnGridMath.CELL - SnGridMath.HALF + SnGridMath.CELL / 2; }
    static centerZ(idx) { return SnGridMath.rowOf(idx) * SnGridMath.CELL - SnGridMath.HALF + SnGridMath.CELL / 2; }
    static minX(idx) { return SnGridMath.colOf(idx) * SnGridMath.CELL - SnGridMath.HALF; }
    static minZ(idx) { return SnGridMath.rowOf(idx) * SnGridMath.CELL - SnGridMath.HALF; }
}
SnGridMath.SIZE = 80;
SnGridMath.CELL = 2;
SnGridMath.HALF = 80;
SnGridMath.COUNT = 6400;
class SnSeededRandom {
    constructor(seed) { this.state = seed >>> 0; }
    next() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let m = this.state;
        m = Math.imul(m ^ (m >>> 15), m | 1);
        m ^= m + Math.imul(m ^ (m >>> 7), m | 61);
        return ((m ^ (m >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) { return min + (max - min) * this.next(); }
    int(n) { return Math.floor(this.next() * n); }
    pick(list) { return list[this.int(list.length)]; }
}
class SnObstacle {
    constructor(id, model, x, z, radius, halfX, halfZ, yaw, scale) {
        this.id = id;
        this.model = model;
        this.x = x;
        this.z = z;
        this.radius = radius;
        this.halfX = halfX;
        this.halfZ = halfZ;
        this.yaw = yaw;
        this.scale = scale;
    }
    get isBox() { return this.halfX > 0; }
    get reach() { return this.isBox ? Math.hypot(this.halfX, this.halfZ) : this.radius; }
    localOf(x, z) {
        const dx = x - this.x, dz = z - this.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
        return { x: dx * c - dz * s, z: dx * s + dz * c };
    }
    contains(x, z, pad) {
        if (!this.isBox)
            return Math.hypot(x - this.x, z - this.z) < this.radius + pad;
        const p = this.localOf(x, z);
        const qx = Math.max(Math.abs(p.x) - this.halfX, 0), qz = Math.max(Math.abs(p.z) - this.halfZ, 0);
        return Math.hypot(qx, qz) < pad || (Math.abs(p.x) < this.halfX + pad && Math.abs(p.z) < this.halfZ + pad && pad <= 0);
    }
    pushOut(x, z, pad) {
        if (!this.isBox) {
            const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz), need = this.radius + pad;
            if (d >= need)
                return null;
            if (d < 1e-6)
                return { x: this.x + need, z: this.z };
            return { x: this.x + dx / d * need, z: this.z + dz / d * need };
        }
        return SnBoxMath.pushOut(this.x, this.z, this.halfX, this.halfZ, this.yaw, x, z, pad);
    }
}
class SnBoxMath {
    static pushOut(cx, cz, hx, hz, yaw, x, z, pad) {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const dx = x - cx, dz = z - cz;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const qx = Math.abs(lx) - hx, qz = Math.abs(lz) - hz;
        let ox = lx, oz = lz;
        if (qx > 0 || qz > 0) {
            const nx = Math.max(-hx, Math.min(hx, lx)), nz = Math.max(-hz, Math.min(hz, lz));
            const ex = lx - nx, ez = lz - nz, d = Math.hypot(ex, ez);
            if (d >= pad)
                return null;
            if (d < 1e-6)
                return null;
            ox = nx + ex / d * pad;
            oz = nz + ez / d * pad;
        }
        else if (hx - Math.abs(lx) < hz - Math.abs(lz)) {
            ox = Math.sign(lx || 1) * (hx + pad);
        }
        else {
            oz = Math.sign(lz || 1) * (hz + pad);
        }
        return { x: cx + ox * c + oz * s, z: cz - ox * s + oz * c };
    }
    static distance(cx, cz, hx, hz, yaw, x, z) {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const dx = x - cx, dz = z - cz;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const qx = Math.abs(lx) - hx, qz = Math.abs(lz) - hz;
        if (qx <= 0 && qz <= 0)
            return Math.max(qx, qz);
        return Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
    }
}
class SnMapLayout {
}
SnMapLayout.VILLAGE = { x0: -20, x1: 20, z0: -22, z1: 18 };
SnMapLayout.LOOKOUT = { x0: -8, x1: 8, z0: -22, z1: -10 };
SnMapLayout.BERM = { x0: -46, x1: 46, z0: 44, z1: 50 };
SnMapLayout.MOUNTAINS = [
    { x: -63, z: -62, r: 15, p: 0.4 }, { x: 62, z: -63, r: 16, p: 1.7 },
    { x: -62, z: 64, r: 15, p: 2.9 }, { x: 63, z: 62, r: 14, p: 4.1 },
];
SnMapLayout.PLATEAUS = [
    { x0: -62, x1: -46, z0: -32, z1: -18, level: 1 },
    { x0: 46, x1: 64, z0: 4, z1: 20, level: 1 },
    { x0: -28, x1: -14, z0: -54, z1: -42, level: 1 },
    { x0: 16, x1: 36, z0: -56, z1: -40, level: 1 },
    { x0: 22, x1: 30, z0: -56, z1: -50, level: 2 },
    { x0: -30, x1: -14, z0: 24, z1: 34, level: 1 },
    { x0: 14, x1: 30, z0: 24, z1: 34, level: 1 },
];
SnMapLayout.RAMPS = [
    { x0: -26, x1: -20, z0: -2, z1: 6, dir: 0, level: 0 },
    { x0: 20, x1: 26, z0: -2, z1: 6, dir: 1, level: 0 },
    { x0: -4, x1: 4, z0: 18, z1: 24, dir: 3, level: 0 },
    { x0: -18, x1: -10, z0: -28, z1: -22, dir: 2, level: 0 },
    { x0: 10, x1: 18, z0: -28, z1: -22, dir: 2, level: 0 },
    { x0: -4, x1: 4, z0: -10, z1: -4, dir: 3, level: 1 },
    { x0: -14, x1: -8, z0: -20, z1: -12, dir: 0, level: 1 },
    { x0: 8, x1: 14, z0: -20, z1: -12, dir: 1, level: 1 },
    { x0: -32, x1: -24, z0: 38, z1: 44, dir: 2, level: 0 },
    { x0: 24, x1: 32, z0: 38, z1: 44, dir: 2, level: 0 },
    { x0: -4, x1: 4, z0: 38, z1: 44, dir: 2, level: 0 },
    { x0: -4, x1: 4, z0: 50, z1: 56, dir: 3, level: 0 },
    { x0: -46, x1: -40, z0: -30, z1: -22, dir: 1, level: 0 },
    { x0: -58, x1: -50, z0: -18, z1: -12, dir: 3, level: 0 },
    { x0: 50, x1: 58, z0: -2, z1: 4, dir: 2, level: 0 },
    { x0: 50, x1: 58, z0: 20, z1: 26, dir: 3, level: 0 },
    { x0: -26, x1: -18, z0: -42, z1: -36, dir: 3, level: 0 },
    { x0: -14, x1: -8, z0: -52, z1: -44, dir: 1, level: 0 },
    { x0: 26, x1: 34, z0: -40, z1: -34, dir: 3, level: 0 },
    { x0: 10, x1: 16, z0: -52, z1: -44, dir: 0, level: 0 },
    { x0: 22, x1: 30, z0: -50, z1: -44, dir: 3, level: 1 },
    { x0: -26, x1: -18, z0: 18, z1: 24, dir: 2, level: 0 },
    { x0: -14, x1: -8, z0: 26, z1: 34, dir: 1, level: 0 },
    { x0: 18, x1: 26, z0: 18, z1: 24, dir: 2, level: 0 },
    { x0: 8, x1: 14, z0: 26, z1: 34, dir: 0, level: 0 },
];
SnMapLayout.RIVERS = [
    [{ x: -40, z: -82 }, { x: -38, z: -60 }, { x: -34, z: -44 }, { x: -40, z: -28 }, { x: -37, z: -12 }, { x: -38, z: 0 }, { x: -35, z: 14 }, { x: -44, z: 30 }, { x: -58, z: 40 }, { x: -82, z: 44 }],
    [{ x: 82, z: -38 }, { x: 62, z: -34 }, { x: 46, z: -22 }, { x: 39, z: -6 }, { x: 40, z: 10 }, { x: 38, z: 26 }, { x: 40, z: 38 }, { x: 50, z: 40 }, { x: 82, z: 34 }],
];
SnMapLayout.RIVER_HALF = 3.2;
SnMapLayout.BORDER_MIN = 1;
SnMapLayout.BORDER_MAX = 3;
SnMapLayout.BRIDGES = [
    { x: -39, z: -68, across: "x" }, { x: -38, z: -18, across: "x" }, { x: -36, z: 8, across: "x" }, { x: -70, z: 42, across: "z" },
    { x: 72, z: -36, across: "z" }, { x: 40, z: 2, across: "x" }, { x: 39, z: 20, across: "x" }, { x: 64, z: 38, across: "z" },
];
SnMapLayout.BRIDGE_HALF_WIDTH = 2;
SnMapLayout.BRIDGE_REACH = 8;
SnMapLayout.BUILDINGS = [
    { model: "house", x: -13, z: -6, hx: 3, hz: 3, yaw: 0 },
    { model: "house", x: 13, z: -6, hx: 3, hz: 3, yaw: Math.PI },
    { model: "mill", x: -12, z: 10, hx: 3.5, hz: 2.5, yaw: 0 },
    { model: "tavern", x: 12, z: 10, hx: 3.5, hz: 2.5, yaw: 0 },
];
SnMapLayout.PROPS = [
    { model: "well", x: 0, z: 3, r: 1.0, hx: 0, hz: 0, yaw: 0 },
    { model: "woodpile", x: -5, z: 13, r: 0, hx: 1.3, hz: 0.8, yaw: 0 },
    { model: "woodpile", x: 6, z: -2, r: 0, hx: 1.3, hz: 0.8, yaw: Math.PI / 2 },
    { model: "tent", x: -17, z: -15, r: 1.3, hx: 0, hz: 0, yaw: 0 },
    { model: "tent", x: 17, z: -15, r: 1.3, hx: 0, hz: 0, yaw: 0 },
    { model: "fence", x: -7, z: -1, r: 0, hx: 2, hz: 0.25, yaw: 0 },
    { model: "fence", x: 7, z: 6, r: 0, hx: 2, hz: 0.25, yaw: 0 },
    { model: "fence", x: -17, z: 14, r: 0, hx: 2, hz: 0.25, yaw: Math.PI / 2 },
    { model: "fence", x: 17, z: 13, r: 0, hx: 2, hz: 0.25, yaw: Math.PI / 2 },
    { model: "log", x: 5, z: -15, r: 0, hx: 0.7, hz: 0.4, yaw: 0.6 },
    { model: "log", x: -5, z: 6, r: 0, hx: 0.7, hz: 0.4, yaw: -0.4 },
    { model: "woodpile", x: -27, z: 12, r: 0, hx: 1.3, hz: 0.8, yaw: 0.3 },
    { model: "woodpile", x: 38, z: -22, r: 0, hx: 1.3, hz: 0.8, yaw: -0.5 },
    { model: "fence", x: -46, z: -6, r: 0, hx: 2, hz: 0.25, yaw: 0.2 },
    { model: "fence", x: 44, z: 30, r: 0, hx: 2, hz: 0.25, yaw: -0.3 },
    { model: "log", x: 0, z: 34, r: 0, hx: 0.7, hz: 0.4, yaw: 0.2 },
    { model: "log", x: -20, z: 30, r: 0, hx: 0.7, hz: 0.4, yaw: 1.2 },
    { model: "log", x: 20, z: 30, r: 0, hx: 0.7, hz: 0.4, yaw: -1.0 },
    { model: "log", x: 0, z: 62, r: 0, hx: 0.7, hz: 0.4, yaw: 0.4 },
    { model: "log", x: -30, z: 62, r: 0, hx: 0.7, hz: 0.4, yaw: -0.2 },
    { model: "log", x: 30, z: 64, r: 0, hx: 0.7, hz: 0.4, yaw: 0.9 },
];
SnMapLayout.FORESTS = [
    { x: -56, z: 0, r: 15, count: 26 },
    { x: 56, z: -2, r: 15, count: 26 },
    { x: 0, z: -56, r: 15, count: 24 },
];
SnMapLayout.ROCK_CLUSTERS = [
    { x: -32, z: -36, count: 6 }, { x: 40, z: -46, count: 6 },
    { x: -34, z: 27, count: 5 }, { x: 46, z: 30, count: 5 },
];
SnMapLayout.ITEM_VILLAGE = 12;
SnMapLayout.ITEM_LOOKOUT = 4;
SnMapLayout.ITEM_TOTAL = 60;
SnMapLayout.PILE_TOTAL = 30;
SnMapLayout.COVER_RANGE = 10;
SnMapLayout.TREE_RADIUS = 0.7;
SnMapLayout.TREE_GAP = 3.4;
SnMapLayout.MAP_SEED = 3801;
class SnMap {
    static shared() {
        if (!SnMap.built)
            SnMap.built = new SnMapBuilder().build();
        return SnMap.built;
    }
    constructor() {
        this.kind = new Uint8Array(SnGridMath.COUNT);
        this.level = new Uint8Array(SnGridMath.COUNT);
        this.rampDir = new Int8Array(SnGridMath.COUNT).fill(-1);
        this.rampStep = new Uint8Array(SnGridMath.COUNT);
        this.zone = new Array(SnGridMath.COUNT).fill("outer");
        this.surface = new Uint8Array(SnGridMath.COUNT);
        this.bridges = [];
        this.obstacles = [];
        this.buckets = [];
        this.itemSpots = [];
        this.keySpots = [];
        this.pileSpots = [];
        this.linkCache = new Map();
        for (let k = 0; k < SnGridMath.COUNT; k++)
            this.buckets.push([]);
    }
    resetLinks() { this.linkCache.clear(); }
    walkable(idx) { return idx >= 0 && (this.kind[idx] === SnTile.FLAT || this.kind[idx] === SnTile.RAMP); }
    isRamp(idx) { return idx >= 0 && this.kind[idx] === SnTile.RAMP; }
    solidTile(idx) { return idx < 0 || this.kind[idx] === SnTile.MOUNTAIN || this.kind[idx] === SnTile.BLOCK; }
    levelAt(x, z) { const idx = SnGridMath.indexAt(x, z); return idx < 0 ? 0 : this.level[idx]; }
    isIce(idx) { return idx >= 0 && this.surface[idx] === SnSurface.ICE; }
    onIce(x, z) { return this.isIce(SnGridMath.indexAt(x, z)); }
    snowy(idx) { return this.walkable(idx) && this.surface[idx] === SnSurface.SNOW; }
    corners(idx) {
        const base = this.level[idx] * SnTile.LEVEL_HEIGHT;
        if (this.kind[idx] !== SnTile.RAMP)
            return [base, base, base, base];
        const step = SnTile.LEVEL_HEIGHT / SnTile.RAMP_LENGTH;
        const lo = base + this.rampStep[idx] * step, hi = lo + step;
        switch (this.rampDir[idx]) {
            case 0: return [lo, hi, lo, hi];
            case 1: return [hi, lo, hi, lo];
            case 2: return [lo, lo, hi, hi];
            default: return [hi, hi, lo, lo];
        }
    }
    heightAt(x, z) {
        const idx = SnGridMath.indexAt(x, z);
        if (idx < 0)
            return 0;
        if (this.kind[idx] === SnTile.MOUNTAIN)
            return SnTile.LEVEL_HEIGHT * 3;
        if (this.surface[idx] === SnSurface.BRIDGE)
            return SnSurface.DECK;
        const c = this.corners(idx);
        const u = Math.min(1, Math.max(0, (x - SnGridMath.minX(idx)) / SnGridMath.CELL));
        const v = Math.min(1, Math.max(0, (z - SnGridMath.minZ(idx)) / SnGridMath.CELL));
        return (c[0] * (1 - u) + c[1] * u) * (1 - v) + (c[2] * (1 - u) + c[3] * u) * v;
    }
    edgeMatch(a, b) {
        const ca = this.corners(a), cb = this.corners(b), da = b - a;
        const near = (p, q) => Math.abs(p - q) < 0.05;
        if (da === 1)
            return near(ca[1], cb[0]) && near(ca[3], cb[2]);
        if (da === -1)
            return near(ca[0], cb[1]) && near(ca[2], cb[3]);
        if (da === SnGridMath.SIZE)
            return near(ca[2], cb[0]) && near(ca[3], cb[1]);
        return near(ca[0], cb[2]) && near(ca[1], cb[3]);
    }
    dropsTo(a, b) {
        return Math.max(...this.corners(b)) < Math.min(...this.corners(a)) - 0.5;
    }
    connected(a, b, allowDrop = false) {
        if (a === b)
            return this.walkable(b);
        if (!this.walkable(a) || !this.walkable(b))
            return false;
        const key = (a * SnGridMath.COUNT + b) * 2 + (allowDrop ? 1 : 0);
        const cached = this.linkCache.get(key);
        if (cached !== undefined)
            return cached;
        const ai = SnGridMath.colOf(a), aj = SnGridMath.rowOf(a), bi = SnGridMath.colOf(b), bj = SnGridMath.rowOf(b);
        const di = bi - ai, dj = bj - aj;
        let ok = false;
        if (Math.abs(di) + Math.abs(dj) === 1)
            ok = this.edgeMatch(a, b) || (allowDrop && this.dropsTo(a, b));
        else if (Math.abs(di) === 1 && Math.abs(dj) === 1) {
            const c1 = SnGridMath.index(bi, aj), c2 = SnGridMath.index(ai, bj);
            ok = this.connected(a, c1, allowDrop) && this.connected(c1, b, allowDrop) && this.connected(a, c2, allowDrop) && this.connected(c2, b, allowDrop);
        }
        this.linkCache.set(key, ok);
        return ok;
    }
    obstaclesAround(x, z, reach) {
        const found = [], seen = new Set();
        const i0 = SnGridMath.col(x - reach), i1 = SnGridMath.col(x + reach), j0 = SnGridMath.row(z - reach), j1 = SnGridMath.row(z + reach);
        for (let j = j0; j <= j1; j++)
            for (let i = i0; i <= i1; i++) {
                if (!SnGridMath.inside(i, j))
                    continue;
                for (const id of this.buckets[SnGridMath.index(i, j)]) {
                    if (seen.has(id))
                        continue;
                    seen.add(id);
                    found.push(this.obstacles[id]);
                }
            }
        return found;
    }
    obstacleAt(x, z, pad) {
        for (const o of this.obstaclesAround(x, z, pad + 0.1))
            if (o.contains(x, z, pad))
                return o;
        return null;
    }
    addObstacle(model, x, z, radius, halfX, halfZ, yaw, scale) {
        const o = new SnObstacle(this.obstacles.length, model, x, z, radius, halfX, halfZ, yaw, scale);
        this.obstacles.push(o);
        const r = o.reach;
        const i0 = SnGridMath.col(x - r), i1 = SnGridMath.col(x + r), j0 = SnGridMath.row(z - r), j1 = SnGridMath.row(z + r);
        for (let j = j0; j <= j1; j++)
            for (let i = i0; i <= i1; i++)
                if (SnGridMath.inside(i, j))
                    this.buckets[SnGridMath.index(i, j)].push(o.id);
        return o;
    }
    zoneAt(x, z) { const idx = SnGridMath.indexAt(x, z); return idx < 0 ? "outer" : this.zone[idx]; }
    nearestWalkable(x, z, avoid = () => false) {
        const ci = SnGridMath.col(x), cj = SnGridMath.row(z);
        for (let ring = 0; ring < SnGridMath.SIZE; ring++) {
            let best = -1, bd = Infinity;
            for (let j = cj - ring; j <= cj + ring; j++)
                for (let i = ci - ring; i <= ci + ring; i++) {
                    if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring || !SnGridMath.inside(i, j))
                        continue;
                    const idx = SnGridMath.index(i, j);
                    if (!this.standable(idx) || avoid(idx))
                        continue;
                    const d = Math.hypot(SnGridMath.centerX(idx) - x, SnGridMath.centerZ(idx) - z);
                    if (d < bd) {
                        bd = d;
                        best = idx;
                    }
                }
            if (best >= 0)
                return best;
        }
        return -1;
    }
    standable(idx) {
        if (!this.walkable(idx))
            return false;
        return !this.obstacleAt(SnGridMath.centerX(idx), SnGridMath.centerZ(idx), 0.5);
    }
    shotBlockedAt(x, z, flightLevel) {
        const idx = SnGridMath.indexAt(x, z);
        if (this.solidTile(idx))
            return true;
        if (this.level[idx] >= flightLevel + 2)
            return true;
        return this.obstacleAt(x, z, 0) !== null;
    }
}
SnMap.built = null;
class SnMapBuilder {
    constructor() {
        this.map = new SnMap();
        this.random = new SnSeededRandom(SnMapLayout.MAP_SEED);
    }
    build() {
        this.shapeGround();
        this.sealPockets();
        this.placeBuildings();
        this.placeForests();
        this.placeRocks();
        this.fillCover();
        this.placeSpots();
        this.map.resetLinks();
        return this.map;
    }
    eachTile(fn) {
        for (let idx = 0; idx < SnGridMath.COUNT; idx++)
            fn(idx, SnGridMath.centerX(idx), SnGridMath.centerZ(idx));
    }
    inRect(x, z, r) {
        return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
    }
    shapeGround() {
        const m = this.map;
        this.eachTile((idx, x, z) => {
            for (const mt of SnMapLayout.MOUNTAINS) {
                const a = Math.atan2(z - mt.z, x - mt.x);
                const r = mt.r * (1 + 0.15 * Math.sin(3 * a + mt.p) + 0.08 * Math.sin(5 * a + mt.p * 2));
                if (Math.hypot(x - mt.x, z - mt.z) < r)
                    m.kind[idx] = SnTile.MOUNTAIN;
            }
            if (this.inBorder(idx))
                m.kind[idx] = SnTile.MOUNTAIN;
            if (m.kind[idx] === SnTile.MOUNTAIN)
                return;
            if (this.inRect(x, z, SnMapLayout.VILLAGE)) {
                m.level[idx] = 1;
                m.zone[idx] = "village";
            }
            if (this.inRect(x, z, SnMapLayout.LOOKOUT)) {
                m.level[idx] = 2;
                m.zone[idx] = "lookout";
            }
            if (this.inRect(x, z, SnMapLayout.BERM)) {
                m.level[idx] = 1;
                m.zone[idx] = "berm";
            }
            for (const p of SnMapLayout.PLATEAUS)
                if (this.inRect(x, z, p))
                    m.level[idx] = Math.max(m.level[idx], p.level);
        });
        for (const ramp of SnMapLayout.RAMPS) {
            this.eachTile((idx, x, z) => {
                if (!this.inRect(x, z, ramp))
                    return;
                const span = ramp.dir < 2 ? (x - ramp.x0) : (z - ramp.z0);
                const length = ramp.dir < 2 ? ramp.x1 - ramp.x0 : ramp.z1 - ramp.z0;
                const along = Math.floor(span / SnGridMath.CELL);
                const steps = Math.round(length / SnGridMath.CELL);
                m.kind[idx] = SnTile.RAMP;
                m.level[idx] = ramp.level;
                m.rampDir[idx] = ramp.dir;
                m.rampStep[idx] = ramp.dir === 0 || ramp.dir === 2 ? along : steps - 1 - along;
            });
        }
        this.carveRivers();
        this.layBridges();
    }
    inBorder(idx) {
        const i = SnGridMath.colOf(idx), j = SnGridMath.rowOf(idx), last = SnGridMath.SIZE - 1;
        const sides = [
            { depth: i, along: j, phase: 0.4 }, { depth: last - i, along: j, phase: 2.1 }, { depth: j, along: i, phase: 3.7 }, { depth: last - j, along: i, phase: 5.2 },
        ];
        for (const side of sides) {
            const wave = 1.6 + 0.9 * Math.sin(side.along * 0.37 + side.phase) + 0.6 * Math.sin(side.along * 0.91 + side.phase * 2.3);
            const width = Math.max(SnMapLayout.BORDER_MIN, Math.min(SnMapLayout.BORDER_MAX, Math.round(wave)));
            if (side.depth < width)
                return true;
        }
        return false;
    }
    static segmentDistance(x, z, a, b) {
        const dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz;
        const t = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len)) : 0;
        return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    }
    carveRivers() {
        const m = this.map;
        this.eachTile((idx, x, z) => {
            if (m.kind[idx] !== SnTile.FLAT || m.level[idx] !== 0)
                return;
            for (const river of SnMapLayout.RIVERS)
                for (let k = 1; k < river.length; k++) {
                    if (SnMapBuilder.segmentDistance(x, z, river[k - 1], river[k]) < SnMapLayout.RIVER_HALF)
                        m.surface[idx] = SnSurface.ICE;
                }
        });
    }
    layBridges() {
        const m = this.map, half = SnMapLayout.BRIDGE_HALF_WIDTH, reach = SnMapLayout.BRIDGE_REACH;
        for (const b of SnMapLayout.BRIDGES) {
            let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
            this.eachTile((idx, x, z) => {
                if (m.surface[idx] !== SnSurface.ICE)
                    return;
                const along = b.across === "x" ? x - b.x : z - b.z, side = b.across === "x" ? z - b.z : x - b.x;
                if (Math.abs(side) >= half || Math.abs(along) >= reach)
                    return;
                m.surface[idx] = SnSurface.BRIDGE;
                x0 = Math.min(x0, SnGridMath.minX(idx));
                x1 = Math.max(x1, SnGridMath.minX(idx) + SnGridMath.CELL);
                z0 = Math.min(z0, SnGridMath.minZ(idx));
                z1 = Math.max(z1, SnGridMath.minZ(idx) + SnGridMath.CELL);
            });
            if (x0 < x1)
                m.bridges.push({ x0, x1, z0, z1, across: b.across });
        }
    }
    sealPockets() {
        const m = this.map, start = SnGridMath.indexAt(-40, -10), seen = new Uint8Array(SnGridMath.COUNT);
        const queue = [start];
        seen[start] = 1;
        for (let head = 0; head < queue.length; head++) {
            const a = queue[head], i = SnGridMath.colOf(a), j = SnGridMath.rowOf(a);
            for (let dj = -1; dj <= 1; dj++)
                for (let di = -1; di <= 1; di++) {
                    if ((!di && !dj) || !SnGridMath.inside(i + di, j + dj))
                        continue;
                    const b = SnGridMath.index(i + di, j + dj);
                    if (!seen[b] && m.connected(a, b)) {
                        seen[b] = 1;
                        queue.push(b);
                    }
                }
        }
        for (let idx = 0; idx < SnGridMath.COUNT; idx++)
            if (m.walkable(idx) && !seen[idx])
                m.kind[idx] = SnTile.MOUNTAIN;
    }
    placeBuildings() {
        const m = this.map;
        for (const b of SnMapLayout.BUILDINGS) {
            const o = m.addObstacle(b.model, b.x, b.z, 0, b.hx, b.hz, b.yaw, 1);
            this.eachTile((idx, x, z) => { if (o.contains(x, z, -0.3))
                m.kind[idx] = SnTile.BLOCK; });
        }
        m.resetLinks();
        for (const p of SnMapLayout.PROPS)
            m.addObstacle(p.model, p.x, p.z, p.r, p.hx, p.hz, p.yaw, 1);
    }
    freeFor(x, z, gap) {
        const m = this.map, idx = SnGridMath.indexAt(x, z);
        if (idx < 0 || m.kind[idx] !== SnTile.FLAT || !m.snowy(idx))
            return false;
        for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
                const i = SnGridMath.colOf(idx) + di, j = SnGridMath.rowOf(idx) + dj;
                if (!SnGridMath.inside(i, j))
                    return false;
                const n = SnGridMath.index(i, j);
                if (m.kind[n] === SnTile.RAMP)
                    return false;
            }
        for (const o of m.obstaclesAround(x, z, gap + 4))
            if (o.contains(x, z, gap))
                return false;
        return true;
    }
    placeForests() {
        for (const f of SnMapLayout.FORESTS) {
            let placed = 0;
            for (let tries = 0; tries < f.count * 30 && placed < f.count; tries++) {
                const a = this.random.range(0, Math.PI * 2), d = Math.sqrt(this.random.next()) * f.r;
                const x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
                if (!this.freeFor(x, z, SnMapLayout.TREE_GAP))
                    continue;
                this.map.addObstacle("pine", x, z, SnMapLayout.TREE_RADIUS, 0, 0, this.random.range(0, Math.PI * 2), this.random.range(0.85, 1.25));
                placed++;
            }
        }
    }
    placeRocks() {
        for (const c of SnMapLayout.ROCK_CLUSTERS) {
            let placed = 0;
            for (let tries = 0; tries < c.count * 30 && placed < c.count; tries++) {
                const x = c.x + this.random.range(-6, 6), z = c.z + this.random.range(-6, 6);
                const r = this.random.range(0.8, 1.4);
                if (!this.freeFor(x, z, r + 1.6))
                    continue;
                this.map.addObstacle("rock", x, z, r, 0, 0, this.random.range(0, Math.PI * 2), r);
                placed++;
            }
        }
    }
    coverTiles() {
        const m = this.map, cover = new Uint8Array(SnGridMath.COUNT);
        for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
            if (m.solidTile(idx) || m.buckets[idx].length > 0) {
                cover[idx] = 1;
                continue;
            }
            const i = SnGridMath.colOf(idx), j = SnGridMath.rowOf(idx);
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (!SnGridMath.inside(i + di, j + dj))
                    continue;
                const n = SnGridMath.index(i + di, j + dj);
                if (m.walkable(n) && m.walkable(idx) && !m.connected(idx, n) && m.level[n] > m.level[idx])
                    cover[idx] = 1;
            }
        }
        return cover;
    }
    static uncoveredTiles(m, cover) {
        const reach = Math.ceil(SnMapLayout.COVER_RANGE / SnGridMath.CELL), list = [];
        for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
            if (!m.walkable(idx))
                continue;
            const i = SnGridMath.colOf(idx), j = SnGridMath.rowOf(idx);
            let ok = false;
            for (let dj = -reach; dj <= reach && !ok; dj++)
                for (let di = -reach; di <= reach && !ok; di++) {
                    if (!SnGridMath.inside(i + di, j + dj) || Math.hypot(di, dj) * SnGridMath.CELL > SnMapLayout.COVER_RANGE)
                        continue;
                    if (cover[SnGridMath.index(i + di, j + dj)])
                        ok = true;
                }
            if (!ok)
                list.push(idx);
        }
        return list;
    }
    fillCover() {
        let holes = SnMapBuilder.uncoveredTiles(this.map, this.coverTiles());
        for (let round = 0; round < 200 && holes.length; round++) {
            const hole = holes[Math.floor(holes.length / 2)];
            const idx = this.map.surface[hole] === SnSurface.BRIDGE
                ? this.map.nearestWalkable(SnGridMath.centerX(hole), SnGridMath.centerZ(hole), (k) => !this.map.snowy(k) || this.map.kind[k] !== SnTile.FLAT)
                : hole;
            const x = SnGridMath.centerX(idx), z = SnGridMath.centerZ(idx);
            holes = holes.filter((k) => Math.hypot(SnGridMath.centerX(k) - x, SnGridMath.centerZ(k) - z) > SnMapLayout.COVER_RANGE);
            const model = round % 3 === 0 ? "log" : round % 3 === 1 ? "rock" : "pine";
            if (model === "log")
                this.map.addObstacle("log", x, z, 0, 0.7, 0.4, this.random.range(0, Math.PI), 1);
            else if (model === "rock") {
                const r = this.random.range(0.9, 1.3);
                this.map.addObstacle("rock", x, z, r, 0, 0, this.random.range(0, 6.28), r);
            }
            else
                this.map.addObstacle("pine", x, z, SnMapLayout.TREE_RADIUS, 0, 0, this.random.range(0, 6.28), this.random.range(0.85, 1.2));
        }
    }
    spotCandidates(filter) {
        const m = this.map, list = [];
        for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
            if (m.kind[idx] !== SnTile.FLAT || !m.snowy(idx) || !filter(idx))
                continue;
            const x = SnGridMath.centerX(idx), z = SnGridMath.centerZ(idx);
            if (m.obstacleAt(x, z, 1.4))
                continue;
            if (Math.abs(x) > 74 || Math.abs(z) > 74)
                continue;
            list.push(idx);
        }
        return list;
    }
    farthest(cands, taken, count) {
        const chosen = [];
        const xs = cands.map((idx) => SnGridMath.centerX(idx)), zs = cands.map((idx) => SnGridMath.centerZ(idx));
        const gap = cands.map((_, k) => taken.length ? Infinity : -Math.hypot(xs[k], zs[k]));
        const absorb = (p) => { for (let k = 0; k < cands.length; k++) {
            const d = Math.hypot(p.x - xs[k], p.z - zs[k]);
            if (d < gap[k] || gap[k] < 0)
                gap[k] = d;
        } };
        for (const p of taken)
            absorb(p);
        for (let n = 0; n < count && cands.length; n++) {
            let best = 0;
            for (let k = 1; k < cands.length; k++)
                if (gap[k] > gap[best])
                    best = k;
            const p = { x: xs[best], z: zs[best] };
            chosen.push(p);
            absorb(p);
        }
        return chosen;
    }
    placeSpots() {
        const m = this.map;
        const village = this.farthest(this.spotCandidates((i) => m.zone[i] === "village"), [], SnMapLayout.ITEM_VILLAGE);
        const lookout = this.farthest(this.spotCandidates((i) => m.zone[i] === "lookout"), village, SnMapLayout.ITEM_LOOKOUT);
        const keys = village.concat(lookout);
        const rest = this.farthest(this.spotCandidates((i) => m.zone[i] !== "village" && m.zone[i] !== "lookout"), keys, SnMapLayout.ITEM_TOTAL - keys.length);
        for (const p of keys) {
            m.itemSpots.push(p);
            m.keySpots.push(true);
        }
        for (const p of rest) {
            m.itemSpots.push(p);
            m.keySpots.push(false);
        }
        const piles = this.farthest(this.spotCandidates(() => true), m.itemSpots, SnMapLayout.PILE_TOTAL);
        for (const p of piles)
            m.pileSpots.push(p);
    }
}
