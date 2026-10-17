"use strict";
class SnPalette {
    static teamColor(mode, team) {
        const list = mode === "solo" ? SnBalance.TEAM_COLORS_SOLO : SnBalance.TEAM_COLORS_DUOS;
        return list[team % list.length];
    }
}
SnPalette.SNOW = "#EEF3F8";
SnPalette.BARE = "#6E6258";
SnPalette.BLOCKED = "#5C534B";
SnPalette.CLIFF = "#8C8A93";
SnPalette.ROCK = "#8B8683";
SnPalette.SKY = "#C9D8E6";
SnPalette.WALL = "#F2F7FB";
SnPalette.WALL_HURT = "#AFC3D2";
SnPalette.PINE = "#2E5845";
SnPalette.PINE_DARK = "#24473A";
SnPalette.TRUNK = "#5A4232";
SnPalette.ICE = "#A9D3E8";
SnPalette.EDGE = "#4A5868";
SnPalette.RAMP = "#D9C9A6";
SnPalette.HIGH_SNOW = "#DCE7F5";
SnPalette.ICE_LIGHT = "#CFE8F3";
SnPalette.PLANK = "#8A6A4E";
SnPalette.PLANK_DARK = "#5E4634";
class SnModelLibrary {
    constructor(libs) {
        this.libs = libs;
        this.clips = new Map();
        this.templates = new Map();
        this.bounds = new Map();
        this.snowyMaps = new Map();
    }
    async load(characterClips) {
        characterClips.forEach((clip, name) => this.clips.set(name, clip));
        const loader = new this.libs.GLTFLoader();
        const models = Object.keys(SnModelLibrary.FILES).map((key) => loader.loadAsync(SnModelLibrary.DIRECTORY + SnModelLibrary.FILES[key]).then((gltf) => {
            this.prepare(key, gltf.scene);
            this.templates.set(key, gltf.scene);
            this.bounds.set(key, new this.libs.THREE.Box3().setFromObject(gltf.scene));
        }));
        const clips = loader.loadAsync(SnModelLibrary.ANIMATION_FILE).then((gltf) => gltf.animations.forEach((clip) => this.clips.set(clip.name, clip)));
        await Promise.all([...models, clips]);
    }
    size(key) {
        const box = this.bounds.get(key);
        return box ? box.getSize(new this.libs.THREE.Vector3()) : new this.libs.THREE.Vector3(1, 1, 1);
    }
    baseOffset(key) {
        const box = this.bounds.get(key);
        return box ? -box.min.y : 0;
    }
    clone(key) {
        const template = this.templates.get(key);
        if (!template)
            return new this.libs.THREE.Group();
        return template.clone(true);
    }
    fitted(key, width, depth) {
        const holder = new this.libs.THREE.Group();
        const model = this.clone(key), size = this.size(key);
        const scale = Math.min(width / Math.max(0.01, size.x), depth / Math.max(0.01, size.z));
        model.scale.setScalar(scale);
        model.position.y = this.baseOffset(key) * scale;
        holder.add(model);
        return holder;
    }
    tinted(key, color) {
        const model = this.clone(key);
        model.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh || Array.isArray(mesh.material))
                return;
            const material = mesh.material.clone();
            material.color = new this.libs.THREE.Color(color);
            mesh.material = material;
        });
        return model;
    }
    prepare(key, scene) {
        const THREE = this.libs.THREE;
        const snowy = SnModelLibrary.SNOW_ROOFED.indexOf(key) >= 0;
        scene.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh || Array.isArray(mesh.material))
                return;
            const source = mesh.material;
            const map = snowy && source.map ? this.snowyMap(source.map) : source.map;
            const tint = key.indexOf("rock") === 0 ? new THREE.Color("#E3E9EF") : source.color;
            mesh.material = new THREE.MeshLambertMaterial({ map, color: tint });
            mesh.castShadow = true;
        });
    }
    snowyMap(texture) {
        const image = texture.image;
        const cached = this.snowyMaps.get(image);
        if (cached)
            return cached;
        const THREE = this.libs.THREE;
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height);
        const px = data.data;
        for (let k = 0; k < px.length; k += 4) {
            const r = px[k], g = px[k + 1], b = px[k + 2];
            if (b > r + 25 && b >= g) {
                const light = 205 + Math.round((r + g + b) / 3 / 255 * 50);
                px[k] = light - 6;
                px[k + 1] = light - 2;
                px[k + 2] = Math.min(255, light + 6);
            }
        }
        context.putImageData(data, 0, 0);
        const result = new THREE.CanvasTexture(canvas);
        result.flipY = texture.flipY;
        result.colorSpace = THREE.SRGBColorSpace;
        result.magFilter = texture.magFilter;
        result.minFilter = texture.minFilter;
        this.snowyMaps.set(image, result);
        return result;
    }
}
SnModelLibrary.DIRECTORY = "assets/kaykit/snow/";
SnModelLibrary.FILES = {
    snowball: "snowball.gltf", pile: "snowball_pile.gltf", snowman: "snowman_A.gltf",
    giftWhite: "present_A_white.gltf", giftBlue: "present_A_blue.gltf", giftYellow: "present_A_yellow.gltf", giftRound: "present_sphere_A_white.gltf",
    rockE: "Rock_1_E_Color1.gltf", rockG: "Rock_1_G_Color1.gltf", rockH: "Rock_1_H_Color1.gltf",
    homeA: "building_home_A_blue.gltf", homeB: "building_home_B_blue.gltf", tavern: "building_tavern_blue.gltf", mill: "building_lumbermill_blue.gltf",
    well: "building_well_blue.gltf", tent: "tent.gltf", fence: "fence.gltf", fenceBroken: "fence_broken.gltf", log: "Wood_Log_A.gltf", logStack: "Wood_Log_Stack.gltf",
};
SnModelLibrary.SNOW_ROOFED = ["homeA", "homeB", "tavern", "mill", "well", "tent"];
SnModelLibrary.ANIMATION_FILE = "assets/kaykit/animations/snow_anims.glb?v=2";
class SnMeshBuilder {
    constructor() {
        this.positions = [];
        this.colors = [];
        this.indices = [];
    }
    get vertexCount() { return this.positions.length / 3; }
    vertex(x, y, z, color) {
        this.positions.push(x, y, z);
        this.colors.push(color.r, color.g, color.b);
        return this.vertexCount - 1;
    }
    quad(a, b, c, d) {
        this.indices.push(a, c, b, b, c, d);
    }
    geometry(libs) {
        const THREE = libs.THREE;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
        geometry.setIndex(this.indices);
        geometry.computeVertexNormals();
        return geometry;
    }
}
class SnTerrainView {
    constructor(libs, map) {
        this.libs = libs;
        this.map = map;
        this.tileVertex = new Int32Array(SnGridMath.COUNT).fill(-1);
        this.snowTone = new Float32Array(SnGridMath.COUNT);
        this.cornerHeight = new Float32Array((SnGridMath.SIZE + 1) * (SnGridMath.SIZE + 1));
        this.dirtyFrom = Infinity;
        this.dirtyTo = -1;
        const THREE = libs.THREE;
        this.snowColor = new THREE.Color(SnPalette.SNOW);
        this.bareColor = new THREE.Color(SnPalette.BARE);
        this.computeMountains();
        const builder = new SnMeshBuilder();
        this.buildTops(builder);
        this.buildSides(builder);
        this.buildEdges(builder);
        const geometry = builder.geometry(libs);
        this.colorAttribute = geometry.getAttribute("color");
        this.mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
        this.mesh.receiveShadow = true;
    }
    cornerIndex(ci, cj) { return cj * (SnGridMath.SIZE + 1) + ci; }
    computeMountains() {
        const n = SnGridMath.SIZE, map = this.map;
        const distance = new Float32Array(SnGridMath.COUNT).fill(Infinity);
        const queue = [];
        for (let idx = 0; idx < SnGridMath.COUNT; idx++)
            if (map.kind[idx] !== SnTile.MOUNTAIN) {
                distance[idx] = 0;
                queue.push(idx);
            }
        for (let head = 0; head < queue.length; head++) {
            const a = queue[head], i = SnGridMath.colOf(a), j = SnGridMath.rowOf(a);
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (!SnGridMath.inside(i + di, j + dj))
                    continue;
                const b = SnGridMath.index(i + di, j + dj);
                if (distance[b] > distance[a] + 1) {
                    distance[b] = distance[a] + 1;
                    queue.push(b);
                }
            }
        }
        for (let cj = 0; cj <= n; cj++)
            for (let ci = 0; ci <= n; ci++) {
                let mountain = true, ground = -Infinity, far = Infinity;
                for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
                    const i = ci + di, j = cj + dj;
                    if (!SnGridMath.inside(i, j))
                        continue;
                    const idx = SnGridMath.index(i, j);
                    if (map.kind[idx] === SnTile.MOUNTAIN) {
                        far = Math.min(far, distance[idx]);
                        continue;
                    }
                    mountain = false;
                    const corners = map.corners(idx);
                    const k = (di === -1 ? 1 : 0) + (dj === -1 ? 2 : 0);
                    ground = Math.max(ground, corners[k]);
                }
                if (mountain) {
                    const noise = Math.sin(ci * 1.7 + cj * 0.9) * 0.6 + Math.sin(ci * 0.43 - cj * 1.31) * 0.9;
                    this.cornerHeight[this.cornerIndex(ci, cj)] = Math.min(SnTerrainView.MOUNTAIN_PEAK, SnTerrainView.MOUNTAIN_BASE + (far === Infinity ? 1 : far) * SnTerrainView.MOUNTAIN_SLOPE + noise);
                }
                else
                    this.cornerHeight[this.cornerIndex(ci, cj)] = ground === -Infinity ? 0 : ground;
            }
    }
    topCorners(idx) {
        if (this.map.kind[idx] !== SnTile.MOUNTAIN)
            return this.map.corners(idx);
        const i = SnGridMath.colOf(idx), j = SnGridMath.rowOf(idx);
        return [this.cornerHeight[this.cornerIndex(i, j)], this.cornerHeight[this.cornerIndex(i + 1, j)], this.cornerHeight[this.cornerIndex(i, j + 1)], this.cornerHeight[this.cornerIndex(i + 1, j + 1)]];
    }
    mountainColor(h) {
        const rock = new this.libs.THREE.Color(SnPalette.ROCK);
        const t = Math.min(1, Math.max(0, (h - SnTerrainView.SNOWLINE) / 3));
        return rock.lerp(this.snowColor, t);
    }
    buildTops(builder) {
        const THREE = this.libs.THREE, map = this.map, cell = SnGridMath.CELL;
        for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
            const x0 = SnGridMath.minX(idx), z0 = SnGridMath.minZ(idx), c = this.topCorners(idx);
            this.snowTone[idx] = 0.965 + ((Math.sin(idx * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.035;
            const mountain = map.kind[idx] === SnTile.MOUNTAIN;
            const base = mountain ? null : map.kind[idx] === SnTile.BLOCK ? new THREE.Color(SnPalette.SNOW).multiplyScalar(0.93) : this.toneColor(idx, true);
            const pts = [[x0, c[0], z0], [x0 + cell, c[1], z0], [x0, c[2], z0 + cell], [x0 + cell, c[3], z0 + cell]];
            const v = pts.map((p) => builder.vertex(p[0], p[1], p[2], base || this.mountainColor(p[1])));
            if (!mountain && map.kind[idx] !== SnTile.BLOCK)
                this.tileVertex[idx] = v[0];
            builder.quad(v[0], v[1], v[2], v[3]);
        }
    }
    buildSides(builder) {
        const THREE = this.libs.THREE, cell = SnGridMath.CELL;
        const cliffTop = new THREE.Color(SnPalette.CLIFF).multiplyScalar(0.95), cliffLow = new THREE.Color(SnPalette.CLIFF).multiplyScalar(0.5);
        const sides = [
            { di: 1, dj: 0, mine: [1, 3], theirs: [0, 2], edge: (x0, z0) => [x0 + cell, z0, x0 + cell, z0 + cell] },
            { di: -1, dj: 0, mine: [2, 0], theirs: [3, 1], edge: (x0, z0) => [x0, z0 + cell, x0, z0] },
            { di: 0, dj: 1, mine: [3, 2], theirs: [1, 0], edge: (x0, z0) => [x0 + cell, z0 + cell, x0, z0 + cell] },
            { di: 0, dj: -1, mine: [0, 1], theirs: [2, 3], edge: (x0, z0) => [x0, z0, x0 + cell, z0] },
        ];
        for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
            const i = SnGridMath.colOf(idx), j = SnGridMath.rowOf(idx), c = this.topCorners(idx);
            const x0 = SnGridMath.minX(idx), z0 = SnGridMath.minZ(idx);
            const mountain = this.map.kind[idx] === SnTile.MOUNTAIN;
            for (const side of sides) {
                const outside = !SnGridMath.inside(i + side.di, j + side.dj);
                const other = outside ? [0, 0, 0, 0] : this.topCorners(SnGridMath.index(i + side.di, j + side.dj));
                const h1 = c[side.mine[0]], h2 = c[side.mine[1]], g1 = other[side.theirs[0]], g2 = other[side.theirs[1]];
                if (h1 <= g1 + 0.01 && h2 <= g2 + 0.01)
                    continue;
                const e = side.edge(x0, z0);
                if (!mountain) {
                    this.rockFace(builder, e, h1, h2, Math.min(h1, g1), Math.min(h2, g2), side.di, side.dj, cliffLow, cliffTop);
                    continue;
                }
                const top1 = mountain ? this.mountainColor(h1) : cliffTop, top2 = mountain ? this.mountainColor(h2) : cliffTop;
                const a = builder.vertex(e[0], Math.min(h1, g1), e[1], cliffLow), b = builder.vertex(e[2], Math.min(h2, g2), e[3], cliffLow);
                const t1 = builder.vertex(e[0], h1, e[1], top1), t2 = builder.vertex(e[2], h2, e[3], top2);
                builder.indices.push(a, t1, b, b, t1, t2);
            }
        }
    }
    static rockNoise(x, y, z) {
        return Math.sin(x * 1.9 + y * 2.7) * 0.5 + Math.sin(z * 2.3 - y * 1.7 + x * 0.6) * 0.35 + Math.sin((x + z) * 4.1 + y * 3.3) * 0.15;
    }
    rockFace(builder, e, h1, h2, b1, b2, ox, oz, low, high) {
        const along = SnTerrainView.ROCK_STEPS, tall = Math.max(h1 - b1, h2 - b2);
        const rows = Math.max(1, Math.min(6, Math.ceil(tall / 0.8)));
        const strength = SnTerrainView.ROCK_BUMP * Math.min(1, tall / 1.2);
        const grid = [], tops = [];
        for (let k = 0; k <= along; k++) {
            const u = k / along, column = [];
            const bx = e[0] + (e[2] - e[0]) * u, bz = e[1] + (e[3] - e[1]) * u;
            const bottom = b1 + (b2 - b1) * u, top = h1 + (h2 - h1) * u;
            for (let m = 0; m <= rows; m++) {
                const v = m / rows, y = bottom + (top - bottom) * v;
                const n = SnTerrainView.rockNoise(bx, y, bz);
                const push = strength * (0.55 + 0.45 * n) * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.15));
                const shade = 0.82 + 0.3 * (0.5 + 0.5 * SnTerrainView.rockNoise(bz * 1.3, y * 1.7, bx * 1.1));
                const color = low.clone().lerp(high, v).multiplyScalar(shade);
                column.push(builder.vertex(bx + ox * push, y, bz + oz * push, color));
                if (m === rows)
                    tops.push({ x: bx, y, z: bz });
            }
            grid.push(column);
        }
        for (let k = 0; k < along; k++)
            for (let m = 0; m < rows; m++) {
                const bl = grid[k][m], br = grid[k + 1][m], tl = grid[k][m + 1], tr = grid[k + 1][m + 1];
                builder.indices.push(bl, tl, br, br, tl, tr);
            }
        if (tall < 0.8)
            return;
        const snow = this.snowColor.clone().multiplyScalar(0.97);
        const lips = [], rims = [];
        tops.forEach((t, k) => {
            const u = k / along, n = SnTerrainView.rockNoise(t.x * 0.7, t.y, t.z * 0.7);
            const reach = SnTerrainView.CORNICE * (0.6 + 0.4 * n) * (0.35 + 0.65 * Math.sin(Math.PI * u));
            rims.push(builder.vertex(t.x, t.y + 0.04, t.z, snow));
            lips.push(builder.vertex(t.x + ox * reach, t.y - 0.18 - 0.22 * (0.5 + 0.5 * n), t.z + oz * reach, snow));
        });
        for (let k = 0; k < along; k++)
            builder.indices.push(lips[k], rims[k], lips[k + 1], lips[k + 1], rims[k], rims[k + 1]);
    }
    buildEdges(builder) {
        const THREE = this.libs.THREE, map = this.map, cell = SnGridMath.CELL, width = SnTerrainView.EDGE_WIDTH, lift = 0.03;
        const color = new THREE.Color(SnPalette.EDGE);
        const sides = [{ di: 1, dj: 0 }, { di: -1, dj: 0 }, { di: 0, dj: 1 }, { di: 0, dj: -1 }];
        for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
            if (!map.walkable(idx))
                continue;
            const i = SnGridMath.colOf(idx), j = SnGridMath.rowOf(idx), x0 = SnGridMath.minX(idx), z0 = SnGridMath.minZ(idx);
            for (const side of sides) {
                if (!SnGridMath.inside(i + side.di, j + side.dj))
                    continue;
                const other = SnGridMath.index(i + side.di, j + side.dj);
                if (!map.walkable(other) || map.connected(idx, other))
                    continue;
                if (Math.max(...map.corners(idx)) < Math.max(...map.corners(other)))
                    continue;
                let ax, az, bx, bz, nx, nz;
                if (side.di === 1) {
                    ax = x0 + cell;
                    az = z0;
                    bx = x0 + cell;
                    bz = z0 + cell;
                    nx = -1;
                    nz = 0;
                }
                else if (side.di === -1) {
                    ax = x0;
                    az = z0 + cell;
                    bx = x0;
                    bz = z0;
                    nx = 1;
                    nz = 0;
                }
                else if (side.dj === 1) {
                    ax = x0 + cell;
                    az = z0 + cell;
                    bx = x0;
                    bz = z0 + cell;
                    nx = 0;
                    nz = -1;
                }
                else {
                    ax = x0;
                    az = z0;
                    bx = x0 + cell;
                    bz = z0;
                    nx = 0;
                    nz = 1;
                }
                const h = (x, z) => map.heightAt(x - nx * 0.01, z - nz * 0.01 + 0) + lift;
                const a = builder.vertex(ax, h(ax + nx * 0.02, az + nz * 0.02), az, color);
                const b = builder.vertex(bx, h(bx + nx * 0.02, bz + nz * 0.02), bz, color);
                const c = builder.vertex(ax + nx * width, h(ax + nx * width, az + nz * width), az + nz * width, color);
                const d = builder.vertex(bx + nx * width, h(bx + nx * width, bz + nz * width), bz + nz * width, color);
                builder.indices.push(a, c, b, b, c, d);
            }
        }
    }
    toneColor(idx, snow) {
        const tone = this.snowTone[idx];
        if (snow && this.map.isRamp(idx))
            return new this.libs.THREE.Color(SnPalette.RAMP).multiplyScalar(0.98 + (tone - 0.965));
        if (snow && this.map.level[idx] > 0)
            return this.snowColor.clone().lerp(new this.libs.THREE.Color(SnPalette.HIGH_SNOW), this.map.level[idx] * 0.5).multiplyScalar(tone);
        if (this.map.surface[idx] !== SnSurface.SNOW) {
            const streak = 0.5 + 0.5 * Math.sin(SnGridMath.colOf(idx) * 0.9 + SnGridMath.rowOf(idx) * 0.55);
            return new this.libs.THREE.Color(SnPalette.ICE).lerp(new this.libs.THREE.Color(SnPalette.ICE_LIGHT), streak * 0.55 + (tone - 0.965) * 8);
        }
        return (snow ? this.snowColor : this.bareColor).clone().multiplyScalar(snow ? tone : 0.9 + (tone - 0.965) * 4);
    }
    setSnow(idx, hasSnow) {
        const v = this.tileVertex[idx];
        if (v < 0)
            return;
        const color = this.toneColor(idx, hasSnow);
        for (let k = 0; k < 4; k++)
            this.colorAttribute.setXYZ(v + k, color.r, color.g, color.b);
        this.dirtyFrom = Math.min(this.dirtyFrom, v);
        this.dirtyTo = Math.max(this.dirtyTo, v + 3);
    }
    syncAll(amount) {
        for (let idx = 0; idx < SnGridMath.COUNT; idx++)
            this.setSnow(idx, amount[idx] > 0);
    }
    flush() {
        if (this.dirtyTo < 0)
            return;
        this.colorAttribute.clearUpdateRanges();
        this.colorAttribute.addUpdateRange(this.dirtyFrom * 3, (this.dirtyTo - this.dirtyFrom + 1) * 3);
        this.colorAttribute.needsUpdate = true;
        this.dirtyFrom = Infinity;
        this.dirtyTo = -1;
    }
}
SnTerrainView.MOUNTAIN_BASE = 2.4;
SnTerrainView.MOUNTAIN_SLOPE = 2.3;
SnTerrainView.MOUNTAIN_PEAK = 17;
SnTerrainView.SNOWLINE = 7;
SnTerrainView.EDGE_WIDTH = 0.32;
SnTerrainView.ROCK_STEPS = 5;
SnTerrainView.ROCK_BUMP = 0.3;
SnTerrainView.CORNICE = 0.28;
class SnPineGeometry {
    static build(libs) {
        const THREE = libs.THREE;
        const parts = [
            { geometry: new THREE.CylinderGeometry(0.16, 0.22, 1.3, 6), y: 0.65, color: SnPalette.TRUNK },
            { geometry: new THREE.ConeGeometry(1.7, 2.2, 8), y: 2.0, color: SnPalette.PINE_DARK },
            { geometry: new THREE.ConeGeometry(1.25, 0.9, 8), y: 2.75, color: SnPalette.SNOW },
            { geometry: new THREE.ConeGeometry(1.35, 2.0, 8), y: 3.3, color: SnPalette.PINE },
            { geometry: new THREE.ConeGeometry(1.0, 0.85, 8), y: 4.0, color: SnPalette.SNOW },
            { geometry: new THREE.ConeGeometry(0.95, 1.7, 8), y: 4.5, color: SnPalette.PINE },
            { geometry: new THREE.ConeGeometry(0.7, 1.0, 8), y: 5.05, color: SnPalette.SNOW },
        ];
        const positions = [], normals = [], colors = [];
        for (const part of parts) {
            const g = part.geometry.toNonIndexed();
            g.translate(0, part.y, 0);
            const p = g.getAttribute("position"), n = g.getAttribute("normal"), c = new THREE.Color(part.color);
            for (let k = 0; k < p.count; k++) {
                positions.push(p.getX(k), p.getY(k), p.getZ(k));
                normals.push(n.getX(k), n.getY(k), n.getZ(k));
                colors.push(c.r, c.g, c.b);
            }
        }
        const merged = new THREE.BufferGeometry();
        merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        merged.computeBoundingSphere();
        return merged;
    }
}
class SnPropsView {
    constructor(libs, library, map) {
        this.libs = libs;
        this.library = library;
        this.map = map;
        this.pineMaterial = null;
        this.pineFade = 1;
        this.group = new libs.THREE.Group();
        this.buildPines();
        this.buildModels();
    }
    sectorOf(x, z) {
        const s = SnPropsView.SECTORS, size = SnGridMath.HALF * 2 / s;
        const i = Math.min(s - 1, Math.max(0, Math.floor((x + SnGridMath.HALF) / size))), j = Math.min(s - 1, Math.max(0, Math.floor((z + SnGridMath.HALF) / size)));
        return j * s + i;
    }
    fadePines(wanted, dt) {
        if (!this.pineMaterial)
            return;
        const target = wanted ? 0.38 : 1;
        this.pineFade += (target - this.pineFade) * Math.min(1, dt * 6);
        this.pineMaterial.opacity = this.pineFade;
        this.pineMaterial.transparent = this.pineFade < 0.99;
        this.pineMaterial.depthWrite = this.pineFade > 0.95;
    }
    buildPines() {
        const THREE = this.libs.THREE;
        const geometry = SnPineGeometry.build(this.libs);
        const material = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: false, opacity: 1 });
        this.pineMaterial = material;
        const buckets = new Map();
        for (const o of this.map.obstacles) {
            if (o.model !== "pine")
                continue;
            const key = this.sectorOf(o.x, o.z);
            if (!buckets.has(key))
                buckets.set(key, []);
            buckets.get(key).push(o);
        }
        buckets.forEach((list) => {
            const mesh = new THREE.InstancedMesh(geometry, material, list.length);
            const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
            list.forEach((o, k) => {
                q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.yaw);
                matrix.compose(new THREE.Vector3(o.x, this.map.heightAt(o.x, o.z), o.z), q, new THREE.Vector3(o.scale, o.scale, o.scale));
                mesh.setMatrixAt(k, matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
            mesh.castShadow = true;
            this.group.add(mesh);
        });
    }
    modelFor(o, index) {
        const lib = this.library;
        switch (o.model) {
            case "rock": {
                const rock = lib.fitted(["rockG", "rockH", "rockE"][index % 3], o.radius * 2.2, o.radius * 2.2);
                rock.scale.y = 0.7;
                return rock;
            }
            case "house": return lib.fitted(index % 2 ? "homeB" : "homeA", o.halfX * 2, o.halfZ * 2);
            case "tavern": return lib.fitted("tavern", o.halfX * 2, o.halfZ * 2);
            case "mill": return lib.fitted("mill", o.halfX * 2, o.halfZ * 2);
            case "well": return lib.fitted("well", o.radius * 2, o.radius * 2);
            case "tent": return lib.fitted("tent", o.radius * 2, o.radius * 2);
            case "fence": return lib.fitted(index % 3 === 2 ? "fenceBroken" : "fence", o.halfX * 2, o.halfZ * 2 + 0.3);
            case "woodpile": return lib.fitted("logStack", o.halfX * 2, o.halfZ * 2);
            case "log": {
                const holder = new this.libs.THREE.Group(), inner = lib.fitted("log", o.halfZ * 2, o.halfX * 2);
                inner.rotation.y = Math.PI / 2;
                holder.add(inner);
                return holder;
            }
            default: return null;
        }
    }
    buildModels() {
        this.map.obstacles.forEach((o, index) => {
            if (o.model === "pine")
                return;
            const model = this.modelFor(o, index);
            if (!model)
                return;
            model.position.set(o.x, this.map.heightAt(o.x, o.z), o.z);
            model.rotation.y += o.yaw;
            model.traverse((node) => { const mesh = node; if (mesh.isMesh) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
            } });
            this.group.add(model);
        });
    }
}
SnPropsView.SECTORS = 4;
class SnBridgeView {
    constructor(libs, map) {
        this.libs = libs;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const decks = [];
        const planks = [];
        const rails = [];
        const posts = [];
        for (const b of map.bridges) {
            const alongX = b.across === "x", o = SnBridgeView.OVERHANG;
            const x0 = b.x0 - (alongX ? o : 0), x1 = b.x1 + (alongX ? o : 0), z0 = b.z0 - (alongX ? 0 : o), z1 = b.z1 + (alongX ? 0 : o);
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
            decks.push({ x: cx, z: cz, w, d });
            const length = alongX ? w : d, count = Math.floor(length / 0.5);
            for (let k = 1; k < count; k += 2) {
                const t = -length / 2 + k * (length / count);
                planks.push(alongX ? { x: cx + t, z: cz, w: 0.08, d: d + 0.02 } : { x: cx, z: cz + t, w: w + 0.02, d: 0.08 });
            }
            for (const side of [-1, 1]) {
                const sx = alongX ? cx : cx + side * (w / 2 - 0.12), sz = alongX ? cz + side * (d / 2 - 0.12) : cz;
                rails.push(alongX ? { x: sx, z: sz, w, d: 0.12 } : { x: sx, z: sz, w: 0.12, d });
                const n = Math.max(2, Math.round(length / SnBridgeView.POST_GAP) + 1);
                for (let k = 0; k < n; k++) {
                    const t = -length / 2 + 0.15 + k * (length - 0.3) / (n - 1);
                    posts.push(alongX ? { x: cx + t, z: sz } : { x: sx, z: cz + t });
                }
            }
        }
        const top = SnBridgeView.DECK_TOP, thick = SnBridgeView.DECK_THICK, rail = SnBridgeView.RAIL_HEIGHT;
        this.boxes(decks, top - thick / 2, thick, SnPalette.PLANK, true);
        this.boxes(planks, top + 0.005, 0.02, SnPalette.PLANK_DARK, false);
        this.boxes(rails, top + rail, 0.12, SnPalette.PLANK, true);
        this.boxes(posts.map((p) => ({ x: p.x, z: p.z, w: 0.16, d: 0.16 })), top + rail / 2, rail, SnPalette.PLANK_DARK, true);
    }
    boxes(list, y, height, color, shadow) {
        if (!list.length)
            return;
        const THREE = this.libs.THREE;
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color }), list.length);
        const matrix = new THREE.Matrix4();
        list.forEach((b, k) => { matrix.makeScale(b.w, height, b.d); matrix.setPosition(b.x, y, b.z); mesh.setMatrixAt(k, matrix); });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        this.group.add(mesh);
    }
}
SnBridgeView.DECK_TOP = SnSurface.DECK;
SnBridgeView.DECK_THICK = 0.35;
SnBridgeView.OVERHANG = 0.8;
SnBridgeView.RAIL_HEIGHT = 0.75;
SnBridgeView.POST_GAP = 2;
class SnStormView {
    constructor(libs, map) {
        this.libs = libs;
        this.map = map;
        this.nextKey = "";
        this.hazeTime = 0;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.texture = this.streakTexture();
        const geometry = new THREE.CylinderGeometry(1, 1, SnStormView.HEIGHT, 96, 1, true);
        geometry.translate(0, SnStormView.HEIGHT / 2 - 2, 0);
        this.wall = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture, color: "#FFFFFF", transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
        this.wall.renderOrder = 5;
        this.nextLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.9 }));
        this.haze = this.buildHaze();
        this.group.add(this.wall, this.nextLine, this.haze);
    }
    buildHaze() {
        const THREE = this.libs.THREE;
        const geometry = new THREE.PlaneGeometry(SnStormView.HAZE_SIZE, SnStormView.HAZE_SIZE, 1, 1);
        geometry.rotateX(-Math.PI / 2);
        const material = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false,
            uniforms: { center: { value: new THREE.Vector2() }, radius: { value: 0 }, focus: { value: new THREE.Vector2() }, hole: { value: SnStormView.HOLE }, time: { value: 0 }, strength: { value: SnStormView.HAZE_ALPHA } },
            vertexShader: "varying vec2 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }",
            fragmentShader: [
                "uniform vec2 center; uniform float radius; uniform vec2 focus; uniform float hole; uniform float time; uniform float strength; varying vec2 vWorld;",
                "void main() {",
                "  float d = distance(vWorld, center);",
                "  float a = smoothstep(radius, radius + 6.0, d);",
                "  float wave = 0.88 + 0.12 * sin(vWorld.x * 0.21 + time * 1.7) * sin(vWorld.y * 0.17 - time * 1.3);",
                "  a *= strength * wave;",
                "  a *= smoothstep(hole * 0.45, hole, distance(vWorld, focus));",
                "  gl_FragColor = vec4(0.93, 0.96, 1.0, a);",
                "}",
            ].join("\n"),
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = SnStormView.HAZE_HEIGHT;
        mesh.renderOrder = 6;
        mesh.frustumCulled = false;
        return mesh;
    }
    streakTexture() {
        const THREE = this.libs.THREE;
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        const gradient = context.createLinearGradient(0, 128, 0, 0);
        gradient.addColorStop(0, "rgba(255,255,255,0.75)");
        gradient.addColorStop(1, "rgba(255,255,255,0.05)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 256, 128);
        const random = new SnSeededRandom(38);
        for (let k = 0; k < 140; k++) {
            context.fillStyle = "rgba(255,255,255," + random.range(0.2, 0.7).toFixed(2) + ")";
            const x = random.range(0, 256), y = random.range(0, 128);
            context.fillRect(x, y, random.range(6, 28), random.range(1, 2.5));
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(16, 2);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    ringPoints(x, z, r) {
        const points = [];
        for (let k = 0; k <= 128; k++) {
            const a = k / 128 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
            points.push(px, Math.max(0, Math.min(5, this.map.heightAt(px, pz))) + 0.25, pz);
        }
        return points;
    }
    update(state, dt, focusX, focusZ) {
        this.hazeTime += dt;
        const uniforms = this.haze.material.uniforms;
        uniforms.center.value.set(state.x, state.z);
        uniforms.radius.value = state.r;
        uniforms.focus.value.set(focusX, focusZ);
        uniforms.time.value = this.hazeTime;
        this.haze.position.x = focusX;
        this.haze.position.z = focusZ;
        this.haze.visible = state.phase !== "prep" || state.r < 112;
        const visible = state.r > 0.3;
        this.wall.visible = visible;
        if (visible) {
            this.wall.position.set(state.x, 0, state.z);
            this.wall.scale.set(state.r, 1, state.r);
            this.texture.repeat.x = Math.max(2, Math.round(state.r * 0.35));
        }
        this.texture.offset.x += dt * 0.05;
        this.texture.offset.y -= dt * 0.12;
        const next = state.next;
        const key = next ? next.x.toFixed(2) + "," + next.z.toFixed(2) + "," + next.r : "";
        if (key !== this.nextKey) {
            this.nextKey = key;
            this.nextLine.visible = !!next && next.r > 0.3;
            if (next) {
                this.nextLine.geometry.dispose();
                this.nextLine.geometry = new this.libs.THREE.BufferGeometry();
                this.nextLine.geometry.setAttribute("position", new this.libs.THREE.Float32BufferAttribute(this.ringPoints(next.x, next.z, next.r), 3));
            }
        }
    }
}
SnStormView.HEIGHT = 36;
SnStormView.HAZE_SIZE = 600;
SnStormView.HAZE_HEIGHT = 7.5;
SnStormView.HAZE_ALPHA = 0.86;
SnStormView.HOLE = 7;
class SnSnowfall {
    constructor(libs) {
        this.libs = libs;
        this.speeds = new Float32Array(SnSnowfall.COUNT);
        const THREE = libs.THREE;
        const positions = new Float32Array(SnSnowfall.COUNT * 3);
        const random = new SnSeededRandom(91);
        for (let k = 0; k < SnSnowfall.COUNT; k++) {
            positions[k * 3] = random.range(-1, 1) * SnSnowfall.SPAN;
            positions[k * 3 + 1] = random.range(0, 22);
            positions[k * 3 + 2] = random.range(-1, 1) * SnSnowfall.SPAN;
            this.speeds[k] = random.range(1.2, 2.6);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: "#FFFFFF", size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
        this.points.frustumCulled = false;
    }
    setDensity(share) {
        this.points.geometry.setDrawRange(0, Math.round(SnSnowfall.COUNT * share));
    }
    update(dt, focusX, focusZ, heavy) {
        const attribute = this.points.geometry.getAttribute("position");
        const array = attribute.array, span = SnSnowfall.SPAN, boost = heavy ? 3 : 1;
        for (let k = 0; k < SnSnowfall.COUNT; k++) {
            let x = array[k * 3], y = array[k * 3 + 1], z = array[k * 3 + 2];
            y -= this.speeds[k] * dt * boost;
            x += Math.sin(y * 0.7 + k) * dt * 0.4 + (heavy ? dt * 4 : 0);
            if (y < 0)
                y += 22;
            if (x - focusX > span)
                x -= span * 2;
            else if (x - focusX < -span)
                x += span * 2;
            if (z - focusZ > span)
                z -= span * 2;
            else if (z - focusZ < -span)
                z += span * 2;
            array[k * 3] = x;
            array[k * 3 + 1] = y;
            array[k * 3 + 2] = z;
        }
        attribute.needsUpdate = true;
    }
}
SnSnowfall.COUNT = 700;
SnSnowfall.SPAN = 36;
class SnWallView {
    constructor(libs, parent, map, mode) {
        this.libs = libs;
        this.parent = parent;
        this.map = map;
        this.mode = mode;
        this.meshes = new Map();
        const THREE = libs.THREE;
        this.geometry = new THREE.BoxGeometry(SnBalance.WALL.halfLength * 2, SnBalance.WALL.height, SnBalance.WALL.halfDepth * 2, 6, 3, 1);
        this.geometry.translate(0, SnBalance.WALL.height / 2, 0);
        const position = this.geometry.getAttribute("position");
        for (let k = 0; k < position.count; k++) {
            const x = position.getX(k), y = position.getY(k), z = position.getZ(k);
            const bump = y > SnBalance.WALL.height - 0.01 ? Math.sin(x * 3.1) * 0.1 : 0;
            position.setXYZ(k, x, y + bump, z * (1 - y / SnBalance.WALL.height * 0.25));
        }
        this.geometry.computeVertexNormals();
    }
    make(w) {
        const THREE = this.libs.THREE;
        const mesh = new THREE.Mesh(this.geometry, new THREE.MeshLambertMaterial({ color: SnPalette.WALL, transparent: true }));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const band = new THREE.Mesh(new THREE.BoxGeometry(SnBalance.WALL.halfLength * 2 + 0.02, 0.16, SnBalance.WALL.halfDepth * 2 + 0.02), new THREE.MeshBasicMaterial({ color: SnPalette.teamColor(this.mode, w.team) }));
        band.position.y = 0.1;
        mesh.add(band);
        mesh.position.set(w.x, this.map.heightAt(w.x, w.z), w.z);
        mesh.rotation.y = w.yaw;
        this.parent.add(mesh);
        return mesh;
    }
    sync(walls, time) {
        const seen = new Set();
        for (const w of walls) {
            seen.add(w.id);
            let mesh = this.meshes.get(w.id);
            if (!mesh) {
                mesh = this.make(w);
                this.meshes.set(w.id, mesh);
            }
            const build = Math.min(1, Math.max(0, 1 - (w.readyAt - time) / SnBalance.WALL.buildTime));
            const melt = Math.min(1, Math.max(0, (w.expireAt - time) / 3));
            mesh.scale.set(w.halfX / SnBalance.WALL.halfLength, Math.max(0.08, build) * (0.35 + 0.65 * melt), 1);
            const material = mesh.material;
            material.opacity = build < 1 ? 0.55 + build * 0.45 : 0.4 + 0.6 * melt;
            material.transparent = material.opacity < 0.99;
            material.color.set(SnPalette.WALL).lerp(new this.libs.THREE.Color(SnPalette.WALL_HURT), 1 - Math.max(0, w.hp) / SnBalance.WALL.hp);
        }
        this.meshes.forEach((mesh, id) => {
            if (seen.has(id))
                return;
            this.parent.remove(mesh);
            mesh.material.dispose();
            this.meshes.delete(id);
        });
    }
}
class SnItemIcon {
    static build(libs, item) {
        const THREE = libs.THREE, group = new THREE.Group();
        const color = item.kind === "gear" ? SnBalance.GRADE_COLORS[item.grade] : item.kind === "cocoa" ? "#7A4A2E" : "#FFFFFF";
        const material = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.25) });
        const add = (geometry, x, y, z, mat = material) => { const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); group.add(m); return m; };
        if (item.kind === "gear" && item.slot === "hat") {
            add(new THREE.ConeGeometry(0.28, 0.5, 10), 0, 0.25, 0);
            add(new THREE.SphereGeometry(0.1, 8, 6), 0, 0.52, 0, new THREE.MeshLambertMaterial({ color: "#FFFFFF" }));
        }
        else if (item.kind === "gear" && item.slot === "suit") {
            add(new THREE.BoxGeometry(0.55, 0.6, 0.25), 0, 0.3, 0);
            add(new THREE.BoxGeometry(0.85, 0.18, 0.22), 0, 0.52, 0);
        }
        else if (item.kind === "gear") {
            add(new THREE.BoxGeometry(0.2, 0.18, 0.42), -0.14, 0.09, 0.05);
            add(new THREE.BoxGeometry(0.2, 0.18, 0.42), 0.14, 0.09, 0.05);
            add(new THREE.BoxGeometry(0.2, 0.25, 0.18), -0.14, 0.25, -0.07);
            add(new THREE.BoxGeometry(0.2, 0.25, 0.18), 0.14, 0.25, -0.07);
        }
        else if (item.kind === "cocoa") {
            add(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 12), 0, 0.2, 0);
            add(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 12), 0, 0.4, 0, new THREE.MeshLambertMaterial({ color: "#FFF4E6" }));
        }
        else
            add(new THREE.SphereGeometry(0.4, 14, 10), 0, 0.4, 0);
        return group;
    }
}
class SnCrateView {
    constructor(libs, library, parent, map, crates) {
        this.libs = libs;
        this.library = library;
        this.parent = parent;
        this.map = map;
        this.entries = [];
        this.time = 0;
        const THREE = libs.THREE;
        const beamGeometry = new THREE.CylinderGeometry(0.22, 0.42, 7, 10, 1, true);
        beamGeometry.translate(0, 3.5, 0);
        for (const c of crates) {
            const y = map.heightAt(c.x, c.z);
            const gear = c.item.kind === "gear" ? c.item : null;
            const gift = gear ? (gear.grade === 0 ? library.tinted("giftWhite", SnBalance.GRADE_COLORS[0]) : gear.grade === 1 ? library.clone("giftBlue") : library.tinted("giftYellow", "#FFB277")) : library.clone("giftRound");
            gift.scale.setScalar(1.25);
            gift.position.set(c.x, y + (gear ? 0 : 0.38), c.z);
            gift.rotation.y = (c.num * 1.37) % (Math.PI * 2);
            const icon = SnItemIcon.build(libs, c.item);
            icon.position.set(c.x, y + 0.55, c.z);
            icon.visible = false;
            let beam = null;
            if (gear) {
                beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: SnBalance.GRADE_COLORS[gear.grade], transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
                beam.position.set(c.x, y, c.z);
                parent.add(beam);
            }
            parent.add(gift, icon);
            this.entries.push({ gift, icon, beam, spin: c.num });
        }
    }
    sync(crates, dt) {
        this.time += dt;
        crates.forEach((c, k) => {
            const e = this.entries[k];
            if (!e)
                return;
            e.gift.visible = !c.opened && !c.taken;
            e.icon.visible = c.opened && !c.taken;
            if (e.icon.visible) {
                e.icon.rotation.y += dt * 1.6;
                e.icon.position.y = this.map.heightAt(c.x, c.z) + 0.55 + Math.sin(this.time * 2.4 + e.spin) * 0.12;
            }
            if (e.beam) {
                e.beam.visible = !c.taken;
                e.beam.material.opacity = 0.22 + 0.12 * Math.sin(this.time * 2 + e.spin);
            }
        });
    }
}
class SnPileView {
    constructor(library, parent, map, piles) {
        this.models = [];
        for (const p of piles) {
            const model = library.clone("pile");
            model.position.set(p.x, map.heightAt(p.x, p.z), p.z);
            model.rotation.y = p.num * 0.9;
            model.scale.setScalar(1.1);
            parent.add(model);
            this.models.push(model);
        }
    }
    sync(piles) { piles.forEach((p, k) => { if (this.models[k])
        this.models[k].visible = !p.taken; }); }
}
class SnShotView {
    constructor(libs, parent, map) {
        this.libs = libs;
        this.parent = parent;
        this.map = map;
        this.balls = new Map();
        const THREE = libs.THREE;
        this.small = new THREE.IcosahedronGeometry(0.17, 1);
        this.large = new THREE.IcosahedronGeometry(SnBalance.BIG.radius, 2);
        this.material = new THREE.MeshLambertMaterial({ color: "#FFFFFF" });
    }
    sync(shots, dt) {
        const seen = new Set();
        for (const s of shots) {
            seen.add(s.id);
            let ball = this.balls.get(s.id);
            if (!ball) {
                ball = new this.libs.THREE.Mesh(s.big ? this.large : this.small, this.material);
                ball.castShadow = true;
                this.parent.add(ball);
                this.balls.set(s.id, ball);
            }
            if (s.big) {
                ball.position.set(s.x, this.map.heightAt(s.x, s.z) + SnBalance.BIG.radius, s.z);
                ball.rotation.x += s.dirZ * dt * SnBalance.BIG.speed / SnBalance.BIG.radius;
                ball.rotation.z -= s.dirX * dt * SnBalance.BIG.speed / SnBalance.BIG.radius;
            }
            else {
                const t = Math.min(1, s.traveled / SnBalance.SHOT.range);
                const base = s.level * SnTile.LEVEL_HEIGHT + 1.3;
                ball.position.set(s.x, base + Math.sin(t * Math.PI) * 0.9 - t * 0.5, s.z);
            }
        }
        this.balls.forEach((ball, id) => {
            if (seen.has(id))
                return;
            this.parent.remove(ball);
            this.balls.delete(id);
        });
    }
}
class SnParachute {
    static build(libs, color) {
        const THREE = libs.THREE, group = new THREE.Group();
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
        canopy.scale.y = 0.6;
        canopy.position.y = 3.4;
        const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.62, 12, 6, 0, Math.PI * 2, Math.PI / 4.4, Math.PI / 14), new THREE.MeshLambertMaterial({ color: "#FFFFFF", side: THREE.DoubleSide }));
        stripe.scale.y = 0.6;
        stripe.position.y = 3.4;
        group.add(canopy, stripe);
        const lineMaterial = new THREE.LineBasicMaterial({ color: "#E8EEF4" });
        for (let k = 0; k < 6; k++) {
            const a = k / 6 * Math.PI * 2;
            const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(Math.cos(a) * 1.35, 3.6, Math.sin(a) * 1.35)]);
            group.add(new THREE.Line(geometry, lineMaterial));
        }
        return group;
    }
}
class SnSilhouette {
    constructor(libs, body, color) {
        this.meshes = [];
        const THREE = libs.THREE;
        const material = new THREE.MeshBasicMaterial({ color, depthFunc: THREE.GreaterDepth, depthWrite: false });
        const sources = [];
        body.traverse((node) => { const mesh = node; if (mesh.isSkinnedMesh)
            sources.push(mesh); });
        for (const source of sources) {
            const ghost = new THREE.SkinnedMesh(source.geometry, material);
            ghost.bind(source.skeleton, source.bindMatrix);
            ghost.position.copy(source.position);
            ghost.quaternion.copy(source.quaternion);
            ghost.scale.copy(source.scale);
            ghost.frustumCulled = false;
            ghost.renderOrder = SnSilhouette.ORDER;
            ghost.userData.source = source;
            ghost.visible = false;
            source.parent.add(ghost);
            this.meshes.push(ghost);
        }
    }
    setShown(shown) {
        for (const ghost of this.meshes)
            ghost.visible = shown && ghost.userData.source.visible;
    }
}
SnSilhouette.ORDER = 1;
SnSilhouette.BODY_ORDER = 2;
class SnPlayerActor {
    constructor(libs, parent, factory, library, labels, look, source, color, map) {
        this.libs = libs;
        this.source = source;
        this.color = color;
        this.map = map;
        this.showSilhouette = false;
        this.chuteFold = 0;
        this.skyTime = 0;
        this.tiltX = 0;
        this.tiltZ = 0;
        this.actionUntil = 0;
        this.landed = false;
        this.x = 0;
        this.z = 0;
        this.y = 0;
        this.yaw = 0;
        this.placed = false;
        this.gearKey = "";
        this.hat = null;
        this.scarf = null;
        const THREE = libs.THREE;
        this.root = new THREE.Group();
        this.body = factory.build(look);
        this.body.traverse((node) => { const mesh = node; if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.renderOrder = SnSilhouette.BODY_ORDER;
        } });
        this.silhouette = new SnSilhouette(libs, this.body, color);
        this.animator = new CharacterAnimator(libs, this.body, library.clips);
        this.animator.play("Idle_A");
        this.skyClip = library.clips.has("Jump_Idle") ? "Jump_Idle" : "Idle_A";
        this.root.add(this.body);
        this.snowman = library.clone("snowman");
        this.snowman.scale.setScalar(0.62);
        this.snowman.visible = false;
        this.root.add(this.snowman);
        this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.y = 0.06;
        this.ring.renderOrder = 2;
        this.root.add(this.ring);
        this.reviveRing = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.35, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
        this.reviveRing.rotation.x = -Math.PI / 2;
        this.reviveRing.position.y = 0.07;
        this.reviveRing.visible = false;
        this.root.add(this.reviveRing);
        this.chute = SnParachute.build(libs, color);
        this.chute.visible = false;
        this.root.add(this.chute);
        this.landMark = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
        this.landMark.rotation.x = -Math.PI / 2;
        this.landMark.renderOrder = 3;
        this.landMark.visible = false;
        parent.add(this.landMark);
        this.label = labels.create(source.nick, color);
        this.label.position.y = 2.25;
        this.root.add(this.label);
        parent.add(this.root);
    }
    wearGear(gear) {
        const key = gear.join(",");
        if (key === this.gearKey)
            return;
        this.gearKey = key;
        const head = this.body.getObjectByName("head");
        if (!head)
            return;
        if (this.hat) {
            head.remove(this.hat);
            this.hat = null;
        }
        if (this.scarf) {
            head.remove(this.scarf);
            this.scarf = null;
        }
        if (gear[0] >= 0) {
            this.hat = SnGearLook.hat(this.libs, gear[0]);
            this.hat.position.set(0, 0.85, 0);
            this.hat.scale.setScalar(1.15);
            head.add(this.hat);
        }
        if (gear[1] >= 0) {
            this.scarf = SnGearLook.scarf(this.libs, gear[1]);
            this.scarf.position.set(0, 0.02, 0);
            head.add(this.scarf);
        }
    }
    get worldX() { return this.x; }
    get worldY() { return this.y; }
    get worldZ() { return this.z; }
    play(clip, seconds, nowMs, speed = 1) {
        this.animator.play(clip, { once: true, speed });
        this.actionUntil = nowMs + seconds * 1000 / speed;
    }
    sync(time, dt, nowMs) {
        const s = this.source;
        const life = s.life;
        const waiting = life === "sky" && s.landAt < 0;
        this.root.visible = !waiting;
        if (waiting)
            return;
        const ground = this.map.heightAt(s.x, s.z);
        let targetY = ground;
        const left = Math.max(0, Math.min(1, (s.landAt - time) / SnBalance.DROP.time));
        if (life === "sky")
            targetY = ground + SnPlayerActor.SKY_HEIGHT * Math.pow(left, 1.6);
        if (!this.placed) {
            this.x = s.x;
            this.z = s.z;
            this.y = targetY;
            this.yaw = s.yaw;
            this.placed = true;
        }
        const follow = Math.min(1, dt * 14);
        const stepX = (s.x - this.x) * follow, stepZ = (s.z - this.z) * follow;
        this.x += stepX;
        this.z += stepZ;
        this.y += (targetY - this.y) * Math.min(1, dt * 18);
        this.swing(life === "sky", stepX, stepZ, ground, dt);
        const turn = SnAngle.wrap(s.yaw - this.yaw);
        this.yaw += turn * Math.min(1, dt * 12);
        this.root.position.set(this.x, this.y, this.z);
        this.body.rotation.y = Math.PI / 2 - this.yaw;
        this.wearGear(s.gear);
        const down = life === "down" || life === "out";
        this.body.visible = !down;
        this.silhouette.setShown(this.showSilhouette && !down && life !== "sky");
        this.snowman.visible = down;
        this.snowman.rotation.y = Math.PI / 2 - this.yaw;
        this.ring.visible = !down && life !== "sky";
        this.reviveRing.visible = life === "down" && s.revivesUsed < SnBalance.REVIVE.max;
        if (this.reviveRing.visible)
            this.reviveRing.scale.setScalar(1 + Math.sin(nowMs / 260) * 0.06);
        this.chute.visible = life === "sky" || this.chuteFold > 0;
        this.label.position.y = down ? 1.9 : 2.25;
        if (life === "sky") {
            this.landed = false;
            this.animator.play(this.skyClip);
        }
        else if (!down && !this.landed) {
            this.landed = true;
            this.play("Spawn_Air", 0.9, nowMs, 1.4);
        }
        if (!down && life !== "sky" && nowMs >= this.actionUntil) {
            const moving = Math.hypot(s.vx, s.vz) > 0.3;
            if (s.reviveTarget >= 0)
                this.animator.play("Working_A");
            else if (moving)
                this.animator.play("Running_A", { speed: Math.max(0.6, Math.hypot(s.vx, s.vz) / 2.6) });
            else
                this.animator.play("Idle_A");
        }
        this.animator.update(dt);
    }
    swing(sky, stepX, stepZ, ground, dt) {
        if (sky) {
            this.skyTime += dt;
            this.chuteFold = SnPlayerActor.CHUTE_FOLD;
            const open = Math.min(1, this.skyTime / 0.6);
            this.chute.scale.set(0.3 + 0.7 * open, 0.3 + 0.7 * open, 0.3 + 0.7 * open);
            const speed = dt > 0 ? 1 / dt : 0;
            const wantX = Math.max(-0.35, Math.min(0.35, stepZ * speed * 0.09)) + Math.sin(this.skyTime * 1.7) * 0.07;
            const wantZ = Math.max(-0.35, Math.min(0.35, -stepX * speed * 0.09)) + Math.cos(this.skyTime * 1.3) * 0.07;
            this.tiltX += (wantX - this.tiltX) * Math.min(1, dt * 3);
            this.tiltZ += (wantZ - this.tiltZ) * Math.min(1, dt * 3);
            this.landMark.visible = true;
            this.landMark.position.set(this.x, ground + 0.08, this.z);
            const pulse = 1 + Math.sin(this.skyTime * 5) * 0.12;
            this.landMark.scale.set(pulse, pulse, pulse);
        }
        else {
            this.skyTime = 0;
            this.landMark.visible = false;
            this.tiltX *= Math.max(0, 1 - dt * 8);
            this.tiltZ *= Math.max(0, 1 - dt * 8);
            if (this.chuteFold > 0) {
                this.chuteFold = Math.max(0, this.chuteFold - dt);
                const k = this.chuteFold / SnPlayerActor.CHUTE_FOLD;
                this.chute.scale.set(1 + (1 - k) * 0.4, k, 1 + (1 - k) * 0.4);
                this.chute.position.y = -(1 - k) * 2.2;
            }
            else
                this.chute.position.y = 0;
        }
        this.root.rotation.set(this.tiltX, 0, this.tiltZ);
    }
    dispose(parent) { parent.remove(this.root); parent.remove(this.landMark); }
}
SnPlayerActor.SKY_HEIGHT = 34;
SnPlayerActor.CHUTE_FOLD = 0.7;
class SnHitPuffs {
    constructor(libs) {
        this.puffs = [];
        this.next = 0;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const geometry = new THREE.IcosahedronGeometry(0.13, 0);
        const random = new SnSeededRandom(77);
        for (let k = 0; k < SnHitPuffs.POOL; k++) {
            const holder = new THREE.Group(), material = new THREE.MeshLambertMaterial({ color: "#FFFFFF", transparent: true, opacity: 1, depthWrite: false });
            const dirs = [];
            for (let b = 0; b < SnHitPuffs.BITS; b++) {
                holder.add(new THREE.Mesh(geometry, material));
                const a = random.range(0, Math.PI * 2), up = random.range(0.2, 1);
                dirs.push([Math.cos(a), up, Math.sin(a)]);
            }
            holder.visible = false;
            this.group.add(holder);
            this.puffs.push({ holder, material, age: SnHitPuffs.LIFE, size: 1, dirs });
        }
    }
    burst(x, y, z, size) {
        const puff = this.puffs[this.next];
        this.next = (this.next + 1) % SnHitPuffs.POOL;
        puff.age = 0;
        puff.size = size;
        puff.holder.position.set(x, y, z);
        puff.holder.visible = true;
    }
    update(dt) {
        for (const puff of this.puffs) {
            if (!puff.holder.visible)
                continue;
            puff.age += dt;
            const k = puff.age / SnHitPuffs.LIFE;
            if (k >= 1) {
                puff.holder.visible = false;
                continue;
            }
            const reach = (0.25 + k * 0.9) * puff.size;
            puff.holder.children.forEach((bit, b) => {
                const d = puff.dirs[b];
                bit.position.set(d[0] * reach, d[1] * reach - k * k * 0.6, d[2] * reach);
                bit.scale.setScalar((1.4 - k) * puff.size);
            });
            puff.material.opacity = 1 - k;
        }
    }
}
SnHitPuffs.POOL = 6;
SnHitPuffs.BITS = 7;
SnHitPuffs.LIFE = 0.45;
class SnAimGuide {
    constructor(libs) {
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const strip = new THREE.PlaneGeometry(1, 0.32);
        strip.rotateX(-Math.PI / 2);
        strip.translate(0.5, 0, 0);
        this.arrow = new THREE.Mesh(strip, new THREE.MeshBasicMaterial({ color: "#D97B4F", transparent: true, opacity: 0.75, depthWrite: false }));
        this.arrow.renderOrder = 6;
        this.ghost = new THREE.Mesh(new THREE.BoxGeometry(SnBalance.WALL.halfLength * 2, SnBalance.WALL.height, SnBalance.WALL.halfDepth * 2), new THREE.MeshBasicMaterial({ color: "#8FD3FF", transparent: true, opacity: 0.4, depthWrite: false }));
        this.group.add(this.arrow, this.ghost);
        this.group.visible = false;
    }
    hide() { this.group.visible = false; }
    showWall(x, y, z, yaw, halfX, ok) {
        this.group.visible = true;
        this.arrow.visible = false;
        this.ghost.visible = true;
        this.ghost.position.set(x, y + SnBalance.WALL.height / 2, z);
        this.ghost.rotation.y = yaw;
        this.ghost.scale.set(halfX / SnBalance.WALL.halfLength, 1, 1);
        this.ghost.material.color.set(ok ? "#8FD3FF" : "#FF7A7A");
    }
    show(kind, x, y, z, angle, length) {
        this.group.visible = true;
        this.arrow.visible = kind === "throw";
        this.ghost.visible = kind === "wall";
        if (kind === "throw") {
            this.arrow.position.set(x, y + 0.12, z);
            this.arrow.rotation.y = -angle;
            this.arrow.scale.set(length, 1, 1);
        }
        else {
            const d = SnBalance.WALL.distance;
            this.ghost.position.set(x + Math.cos(angle) * d, y + SnBalance.WALL.height / 2, z + Math.sin(angle) * d);
            this.ghost.rotation.y = Math.atan2(Math.cos(angle), Math.sin(angle));
        }
    }
}
class SnGearLook {
    static hat(libs, grade) {
        const THREE = libs.THREE, group = new THREE.Group();
        const color = SnBalance.GRADE_COLORS[grade];
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.62, 12), new THREE.MeshLambertMaterial({ color }));
        cone.position.y = 0.31;
        const brim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 6, 14), new THREE.MeshLambertMaterial({ color: "#FFFFFF" }));
        brim.rotation.x = Math.PI / 2;
        const bobble = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshLambertMaterial({ color: "#FFFFFF" }));
        bobble.position.y = 0.66;
        group.add(cone, brim, bobble);
        return group;
    }
    static scarf(libs, grade) {
        const THREE = libs.THREE;
        const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 6, 16), new THREE.MeshLambertMaterial({ color: SnBalance.GRADE_COLORS[grade] }));
        scarf.rotation.x = Math.PI / 2;
        return scarf;
    }
}
class SnCameraRig {
    constructor(libs) {
        this.focusX = 0;
        this.focusY = 0;
        this.focusZ = 0;
        this.distance = SnCameraRig.DISTANCE;
        this.ready = false;
        this.camera = new libs.THREE.PerspectiveCamera(46, 1, 0.5, 320);
    }
    resize(aspect) {
        this.camera.aspect = aspect;
        this.camera.fov = aspect < 1 ? 62 : 50;
        this.camera.updateProjectionMatrix();
    }
    snap() { this.ready = false; }
    follow(x, y, z, distance, dt) {
        if (!this.ready) {
            this.focusX = x;
            this.focusY = y;
            this.focusZ = z;
            this.distance = distance;
            this.ready = true;
        }
        const k = Math.min(1, dt * 5);
        this.focusX += (x - this.focusX) * k;
        this.focusY += (y - this.focusY) * k;
        this.focusZ += (z - this.focusZ) * k;
        this.distance += (distance - this.distance) * Math.min(1, dt * 2);
        const scale = this.camera.aspect < 1 ? 1.3 : 1;
        const up = Math.sin(SnCameraRig.PITCH) * this.distance * scale, back = Math.cos(SnCameraRig.PITCH) * this.distance * scale;
        this.camera.position.set(this.focusX, this.focusY + up, this.focusZ + back);
        this.camera.lookAt(this.focusX, this.focusY, this.focusZ);
    }
    orbit(radius, height, angle, lookX, lookY, lookZ) {
        this.camera.position.set(lookX + Math.sin(angle) * radius, lookY + height, lookZ + Math.cos(angle) * radius);
        this.camera.lookAt(lookX, lookY, lookZ);
        this.focusX = lookX;
        this.focusY = lookY;
        this.focusZ = lookZ;
    }
}
SnCameraRig.PITCH = (60 * Math.PI) / 180;
SnCameraRig.DISTANCE = 21;
class SnSunShadow {
    constructor(libs, scene, mapSize) {
        this.light = new libs.THREE.DirectionalLight(0xFFF2E0, 1.25);
        this.light.castShadow = true;
        const shadow = this.light.shadow;
        shadow.mapSize.set(mapSize, mapSize);
        const camera = shadow.camera;
        camera.left = camera.bottom = -SnSunShadow.HALF_SPAN;
        camera.right = camera.top = SnSunShadow.HALF_SPAN;
        camera.near = 2;
        camera.far = 80;
        camera.updateProjectionMatrix();
        shadow.bias = -0.0008;
        shadow.normalBias = 0.04;
        scene.add(this.light, this.light.target);
    }
    follow(x, z) {
        const step = (SnSunShadow.HALF_SPAN * 2) / this.light.shadow.mapSize.x;
        const sx = Math.round(x / step) * step, sz = Math.round(z / step) * step;
        this.light.position.set(sx + SnSunShadow.OFFSET.x, SnSunShadow.OFFSET.y, sz + SnSunShadow.OFFSET.z);
        this.light.target.position.set(sx, 0, sz);
    }
    disable() {
        if (!this.light.castShadow)
            return false;
        this.light.castShadow = false;
        return true;
    }
}
SnSunShadow.OFFSET = { x: -10, y: 26, z: 14 };
SnSunShadow.HALF_SPAN = 34;
class SnWorldView {
    constructor(libs, canvas, touchDevice) {
        this.libs = libs;
        this.canvas = canvas;
        this.touchDevice = touchDevice;
        this.playing = false;
        const THREE = libs.THREE;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(SnPalette.SKY);
        this.scene.fog = new THREE.Fog(SnPalette.SKY, 75, 180);
        this.scene.add(new THREE.HemisphereLight(0xE6F0FF, 0x8A93A0, 1.45));
        this.sun = new SnSunShadow(libs, this.scene, 1024);
        this.rig = new SnCameraRig(libs);
        this.snowfall = new SnSnowfall(libs);
        this.scene.add(this.snowfall.points);
        const steps = touchDevice
            ? [() => this.lowerPixelRatio(), () => this.sun.disable(), () => this.thinSnow()]
            : [() => this.lowerPixelRatio(), () => this.thinSnow()];
        this.governor = window.QualityGovernor ? window.QualityGovernor({ steps, storageKey: "snowroyale_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 }) : null;
        if (this.governor)
            this.governor.restore();
        window.addEventListener("resize", () => this.resize());
        this.resize();
    }
    resize() {
        const width = window.innerWidth, height = window.innerHeight;
        this.renderer.setSize(width, height, false);
        this.rig.resize(width / Math.max(1, height));
    }
    render(dt) {
        this.sun.follow(this.rig.focusX, this.rig.focusZ);
        this.renderer.render(this.scene, this.rig.camera);
        if (this.governor)
            this.governor.update(dt);
    }
    project(x, y, z) {
        const v = new this.libs.THREE.Vector3(x, y, z).project(this.rig.camera);
        return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, visible: v.z < 1 && v.z > -1 };
    }
    lowerPixelRatio() {
        if (this.pixelRatio <= 1)
            return false;
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
        return true;
    }
    thinSnow() {
        this.snowfall.setDensity(0.35);
        return false;
    }
}
class SnSceneView {
    constructor(libs, canvas, touchDevice, library, factory, map) {
        this.libs = libs;
        this.library = library;
        this.factory = factory;
        this.map = map;
        this.walls = null;
        this.crates = null;
        this.piles = null;
        this.shots = null;
        this.actors = new Map();
        this.pendingWalls = [];
        const THREE = libs.THREE;
        this.world = new SnWorldView(libs, canvas, touchDevice);
        this.terrain = new SnTerrainView(libs, map);
        this.world.scene.add(this.terrain.mesh);
        const outside = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: SnPalette.SNOW }));
        outside.rotation.x = -Math.PI / 2;
        outside.position.y = -0.06;
        outside.receiveShadow = true;
        this.world.scene.add(outside);
        this.props = new SnPropsView(libs, library, map);
        this.world.scene.add(this.props.group);
        this.world.scene.add(new SnBridgeView(libs, map).group);
        this.storm = new SnStormView(libs, map);
        this.world.scene.add(this.storm.group);
        this.matchGroup = new THREE.Group();
        this.world.scene.add(this.matchGroup);
        this.labels = new RkLabelFactory(libs);
        this.aimGuide = new SnAimGuide(libs);
        this.world.scene.add(this.aimGuide.group);
        this.puffs = new SnHitPuffs(libs);
        this.world.scene.add(this.puffs.group);
    }
    setFog(near, far) {
        const fog = this.world.scene.fog;
        if (fog) {
            fog.near = near;
            fog.far = far;
        }
    }
    showMenuWorld() {
        this.clearMatch();
        this.terrain.syncAll(new SnSnowField(this.map).amount);
        this.terrain.flush();
        this.storm.group.visible = false;
        this.props.fadePines(false, 1);
        this.setFog(75, 180);
    }
    beginMatch(source, looks, snow) {
        this.clearMatch();
        this.storm.group.visible = true;
        this.terrain.syncAll(snow);
        this.walls = new SnWallView(this.libs, this.matchGroup, this.map, source.mode);
        this.crates = new SnCrateView(this.libs, this.library, this.matchGroup, this.map, source.crates);
        this.piles = new SnPileView(this.library, this.matchGroup, this.map, source.piles);
        this.shots = new SnShotView(this.libs, this.matchGroup, this.map);
        for (const p of source.players) {
            const look = looks.get(p.num) || CharacterLooks.random();
            this.actors.set(p.num, new SnPlayerActor(this.libs, this.matchGroup, this.factory, this.library, this.labels, look, p, SnPalette.teamColor(source.mode, p.team), this.map));
        }
    }
    clearMatch() {
        this.actors.forEach((a) => a.dispose(this.matchGroup));
        this.actors.clear();
        while (this.matchGroup.children.length)
            this.matchGroup.remove(this.matchGroup.children[0]);
        this.walls = null;
        this.crates = null;
        this.piles = null;
        this.shots = null;
    }
    applyEvents(events, nowMs) {
        for (const ev of events) {
            if (ev.t === "snow")
                ev.tiles.forEach((idx) => this.terrain.setSnow(idx, false));
            else if (ev.t === "shot") {
                const a = this.actors.get(ev.by);
                if (a)
                    a.play("Throw", 1.0, nowMs, 2.2);
            }
            else if (ev.t === "wall") {
                const owner = this.wallOwner(ev.id);
                if (owner)
                    owner.play("Interact", 1.0, nowMs, 1.4);
            }
            else if (ev.t === "hit") {
                const a = this.actors.get(ev.to);
                if (!a || ev.storm)
                    continue;
                const heavy = ev.v >= SnBalance.BIG.damage * 0.9;
                a.play(heavy ? "Hit_B" : "Hit_A", heavy ? 0.87 : 0.67, nowMs, heavy ? 1.1 : 1.3);
                this.puffs.burst(a.worldX, a.worldY + 1.2, a.worldZ, heavy ? 1.8 : 1);
            }
        }
    }
    wallOwner(id) {
        const w = this.pendingWalls.find((x) => x.id === id);
        return w ? this.actors.get(w.owner) || null : null;
    }
    sync(source, dt, nowMs) {
        this.pendingWalls = source.walls;
        const storm = source.stormNow();
        this.storm.update(storm, dt, this.world.rig.focusX, this.world.rig.focusZ);
        if (this.walls)
            this.walls.sync(source.walls, source.time);
        if (this.crates)
            this.crates.sync(source.crates, dt);
        if (this.piles)
            this.piles.sync(source.piles);
        if (this.shots)
            this.shots.sync(source.shots, dt);
        this.actors.forEach((a) => a.sync(source.time, dt, nowMs));
        this.puffs.update(dt);
        this.terrain.flush();
    }
    followActor(num, dt) {
        const a = this.actors.get(num);
        if (!a)
            return;
        const sky = a.source.life === "sky";
        this.world.rig.follow(a.worldX, sky ? a.worldY * 0.6 : a.worldY, a.worldZ, sky ? 30 : SnCameraRig.DISTANCE, dt);
    }
    hideTreesAround(x, z, dt) {
        const bx = x, bz = z + 2.5;
        const near = this.map.obstaclesAround(bx, bz, 5).some((o) => o.model === "pine" && Math.hypot(o.x - bx, o.z - bz) < 4.6);
        this.props.fadePines(near, dt);
    }
    showSilhouettesFor(team) {
        this.actors.forEach((a) => { a.showSilhouette = a.source.team === team; });
    }
    followEveryone(dt) {
        const points = [];
        this.actors.forEach((a) => { if (a.source.life === "alive" || (a.source.life === "sky" && a.source.landAt >= 0))
            points.push({ x: a.worldX, z: a.worldZ }); });
        if (!points.length)
            this.actors.forEach((a) => { if (a.root.visible)
                points.push({ x: a.worldX, z: a.worldZ }); });
        if (!points.length)
            return;
        let cx = 0, cz = 0;
        points.forEach((p) => { cx += p.x; cz += p.z; });
        cx /= points.length;
        cz /= points.length;
        let spread = 0;
        points.forEach((p) => { spread = Math.max(spread, Math.hypot(p.x - cx, p.z - cz)); });
        this.world.rig.follow(cx, 0, cz, Math.min(SnSceneView.OVERVIEW_MAX, Math.max(SnSceneView.OVERVIEW_MIN, 14 + spread * 1.35)), dt);
    }
    pickActor(clientX, clientY) {
        let best = -1, bd = 46;
        this.actors.forEach((a, num) => {
            if (!a.root.visible)
                return;
            const p = this.world.project(a.worldX, a.worldY + 1, a.worldZ);
            if (!p.visible)
                return;
            const d = Math.hypot(p.x - clientX, p.y - clientY);
            if (d < bd) {
                bd = d;
                best = num;
            }
        });
        return best;
    }
    render(dt, heavySnow) {
        this.world.snowfall.update(dt, this.world.rig.focusX, this.world.rig.focusZ, heavySnow);
        this.world.render(dt);
    }
}
SnSceneView.OVERVIEW_MIN = 30;
SnSceneView.OVERVIEW_MAX = 110;
