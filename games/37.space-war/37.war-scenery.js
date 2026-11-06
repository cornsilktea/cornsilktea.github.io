"use strict";
class WarSeededRandom {
    constructor(seed) {
        this.state = seed >>> 0;
    }
    next() {
        this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
        return this.state / 4294967296;
    }
    between(low, high) {
        return low + this.next() * (high - low);
    }
    pick(items) {
        return items[Math.floor(this.next() * items.length)];
    }
}
class WarValueNoise {
    constructor(seed) {
        const random = new WarSeededRandom(seed);
        this.lattice = new Float32Array(WarValueNoise.SIZE * WarValueNoise.SIZE);
        for (let i = 0; i < this.lattice.length; i++)
            this.lattice[i] = random.next();
    }
    sample(x, y) {
        const size = WarValueNoise.SIZE;
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const fx = x - x0, fy = y - y0;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const at = (ix, iy) => this.lattice[(((iy % size) + size) % size) * size + (((ix % size) + size) % size)];
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        return top + (bottom - top) * sy;
    }
    fbm(x, y, octaves) {
        let total = 0, amplitude = 0.5, frequency = 1, norm = 0;
        for (let i = 0; i < octaves; i++) {
            total += this.sample(x * frequency, y * frequency) * amplitude;
            norm += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }
        return total / norm;
    }
}
WarValueNoise.SIZE = 256;
class WarLaneField {
    constructor() {
        const all = WarMapData.corridors();
        const isBase = (corridor) => (corridor.ax === corridor.bx && corridor.ay === corridor.by) || corridor.halfWidth > WarMapData.LANE_HALF_WIDTH + 100;
        this.lanes = all.filter((corridor) => !isBase(corridor));
        this.pads = all.filter(isBase);
    }
    laneDistance(x, y) {
        return WarLaneField.nearest(this.lanes, x, y, WarLaneField.VISUAL_EXTRA);
    }
    padDistance(x, y) {
        return WarLaneField.nearest(this.pads, x, y, 0);
    }
    laneCorridors() {
        return this.lanes;
    }
    visualHalfWidth(corridor) {
        return corridor.halfWidth + WarLaneField.VISUAL_EXTRA;
    }
    static nearest(corridors, x, y, extra) {
        let best = Number.MAX_VALUE;
        for (const corridor of corridors) {
            const dx = corridor.bx - corridor.ax, dy = corridor.by - corridor.ay;
            const lengthSq = dx * dx + dy * dy;
            let t = lengthSq === 0 ? 0 : ((x - corridor.ax) * dx + (y - corridor.ay) * dy) / lengthSq;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = corridor.ax + dx * t - x, py = corridor.ay + dy * t - y;
            const d = Math.sqrt(px * px + py * py) - corridor.halfWidth - extra;
            if (d < best)
                best = d;
        }
        return best;
    }
}
WarLaneField.VISUAL_EXTRA = 160;
class WarCursedGround {
    constructor(factions) {
        this.centers = [];
        factions.forEach((faction, team) => {
            if (faction === "grave")
                this.centers.push(WarMapData.hq(team));
        });
    }
    get any() {
        return this.centers.length > 0;
    }
    influence(x, y) {
        let best = 0;
        for (const center of this.centers) {
            const distance = Math.hypot(x - center.x, y - center.y);
            const value = 1 - (distance - WarCursedGround.FULL_RADIUS) / WarCursedGround.FADE_RADIUS;
            best = Math.max(best, Math.max(0, Math.min(1, value)));
        }
        return best;
    }
}
WarCursedGround.FULL_RADIUS = 2800;
WarCursedGround.FADE_RADIUS = 3600;
class WarTerrainPainter {
    constructor(noise, field, factions) {
        this.noise = noise;
        this.field = field;
        this.cursed = new WarCursedGround(factions);
    }
    paint() {
        const scale = WarTerrainPainter.PIXELS_PER_METER / 100;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(WarMapData.HALF_W * 2 * scale);
        canvas.height = Math.round(WarMapData.HALF_H * 2 * scale);
        const context = canvas.getContext("2d");
        const image = context.createImageData(canvas.width, canvas.height);
        for (let py = 0; py < canvas.height; py++) {
            for (let px = 0; px < canvas.width; px++) {
                const wx = px / scale - WarMapData.HALF_W;
                const wy = py / scale - WarMapData.HALF_H;
                const color = this.colorAt(wx, wy);
                const at = (py * canvas.width + px) * 4;
                image.data[at] = color[0];
                image.data[at + 1] = color[1];
                image.data[at + 2] = color[2];
                image.data[at + 3] = 255;
            }
        }
        context.putImageData(image, 0, 0);
        this.paintFlowers(context, scale);
        return canvas;
    }
    static soft(distance, feather) {
        const t = Math.max(0, Math.min(1, 0.5 - distance / feather));
        return t * t * (3 - 2 * t);
    }
    colorAt(wx, wy) {
        const noise = this.noise;
        const wobble = (noise.fbm(wx / 520, wy / 520, 3) - 0.5) * 620;
        const lane = this.field.laneDistance(wx, wy) + wobble;
        const pad = this.field.padDistance(wx, wy) + wobble;
        const grain = noise.fbm(wx / 90, wy / 90, 2);
        const curse = this.cursed.influence(wx, wy);
        const road = Math.max(WarTerrainPainter.soft(lane, 560), WarTerrainPainter.soft(pad + WarTerrainPainter.PAD_DIRT_INSET, WarTerrainPainter.PAD_FEATHER));
        const meadow = this.meadowColor(wx, wy, grain, curse);
        const dirt = this.roadColor(wx, wy, grain, curse);
        const seam = 1 - 0.1 * 4 * road * (1 - road);
        const worn = 1 - Math.min(1, Math.max(0, -pad) / 500) * 0.06 * (0.6 + noise.fbm(wx / 210 + 5, wy / 210 + 11, 3) * 0.8);
        const factor = seam * worn;
        return [(meadow[0] + (dirt[0] - meadow[0]) * road) * factor, (meadow[1] + (dirt[1] - meadow[1]) * road) * factor, (meadow[2] + (dirt[2] - meadow[2]) * road) * factor];
    }
    meadowColor(wx, wy, grain, curse) {
        const a = WarTerrainPainter.MEADOW_A, b = WarTerrainPainter.MEADOW_B;
        const mix = this.noise.fbm(wx / 640, wy / 640, 4);
        let color = [a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix, a[2] + (b[2] - a[2]) * mix];
        const clover = this.noise.fbm(wx / 420 + 17, wy / 420 - 9, 3);
        if (clover > 0.55) {
            const t = Math.min(1, (clover - 0.55) * 5);
            const c = WarTerrainPainter.CLOVER;
            color = [color[0] + (c[0] - color[0]) * t, color[1] + (c[1] - color[1]) * t, color[2] + (c[2] - color[2]) * t];
        }
        if (curse > 0) {
            const dead = this.noise.fbm(wx / 500 + 3, wy / 500 + 8, 3) > 0.5 ? WarTerrainPainter.DEAD_B : WarTerrainPainter.DEAD_A;
            color = [color[0] + (dead[0] - color[0]) * curse, color[1] + (dead[1] - color[1]) * curse, color[2] + (dead[2] - color[2]) * curse];
        }
        const speck = 0.92 + grain * 0.16;
        return [color[0] * speck, color[1] * speck, color[2] * speck];
    }
    roadColor(wx, wy, grain, curse) {
        const a = WarTerrainPainter.ROAD_A, b = WarTerrainPainter.ROAD_B;
        const mix = this.noise.fbm(wx / 480, wy / 480, 3);
        const ripple = Math.sin((wx * 0.011 + this.noise.fbm(wx / 300, wy / 300, 2) * 9) + wy * 0.004) * 0.5 + 0.5;
        const tone = 0.95 + ripple * 0.08 + (grain - 0.5) * 0.16;
        let color = [(a[0] + (b[0] - a[0]) * mix) * tone, (a[1] + (b[1] - a[1]) * mix) * tone, (a[2] + (b[2] - a[2]) * mix) * tone];
        if (curse > 0) {
            const d = WarTerrainPainter.DEAD_ROAD;
            color = [color[0] + (d[0] - color[0]) * curse * 0.7, color[1] + (d[1] - color[1]) * curse * 0.7, color[2] + (d[2] - color[2]) * curse * 0.7];
        }
        return color;
    }
    paintFlowers(context, scale) {
        const random = new WarSeededRandom(77);
        const palette = ["#F4E36B", "#F7F2E8", "#E98FB2", "#9FB8F2"];
        for (let tries = 0; tries < 2600; tries++) {
            const x = random.between(-WarMapData.HALF_W + 300, WarMapData.HALF_W - 300);
            const y = random.between(-WarMapData.HALF_H + 300, WarMapData.HALF_H - 300);
            if (this.field.laneDistance(x, y) < 40 || this.field.padDistance(x, y) < 0)
                continue;
            if (this.cursed.influence(x, y) > 0.3)
                continue;
            if (this.noise.fbm(x / 700 + 41, y / 700 - 13, 3) < 0.5)
                continue;
            context.fillStyle = random.pick(palette);
            context.fillRect((x + WarMapData.HALF_W) * scale, (y + WarMapData.HALF_H) * scale, 2, 2);
        }
    }
}
WarTerrainPainter.PIXELS_PER_METER = 5;
WarTerrainPainter.MEADOW_A = [0x5E, 0x8F, 0x3C];
WarTerrainPainter.MEADOW_B = [0x79, 0xA8, 0x4A];
WarTerrainPainter.CLOVER = [0x4A, 0x7C, 0x34];
WarTerrainPainter.DEAD_A = [0x66, 0x5C, 0x44];
WarTerrainPainter.DEAD_B = [0x4C, 0x46, 0x3E];
WarTerrainPainter.ROAD_A = [0xC2, 0xA3, 0x72];
WarTerrainPainter.ROAD_B = [0xA3, 0x84, 0x5A];
WarTerrainPainter.DEAD_ROAD = [0x7C, 0x6C, 0x5C];
WarTerrainPainter.PAD_DIRT_INSET = 650;
WarTerrainPainter.PAD_FEATHER = 800;
class WarInstanceSet {
    constructor(libs, template, capacity) {
        this.libs = libs;
        this.capacity = capacity;
        this.meshes = [];
        this.partMatrices = [];
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.place = new THREE.Matrix4();
        this.composed = new THREE.Matrix4();
        this.rotation = new THREE.Quaternion();
        this.position = new THREE.Vector3();
        this.scaling = new THREE.Vector3();
        this.up = new THREE.Vector3(0, 1, 0);
        template.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(template);
        const origin = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        template.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh)
                return;
            const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, Math.max(1, capacity));
            instanced.frustumCulled = false;
            instanced.count = 0;
            this.meshes.push(instanced);
            this.partMatrices.push(origin.clone().multiply(mesh.matrixWorld));
            this.group.add(instanced);
        });
    }
    static fromPlacements(libs, template, placements) {
        const set = new WarInstanceSet(libs, template, placements.length);
        placements.forEach((p, i) => set.set(i, p));
        set.finish(placements.length);
        return set;
    }
    set(index, placement) {
        this.rotation.setFromAxisAngle(this.up, placement.yaw);
        this.position.set(placement.x, placement.y ?? 0, placement.z);
        this.scaling.setScalar(placement.scale);
        this.place.compose(this.position, this.rotation, this.scaling);
        this.meshes.forEach((mesh, part) => {
            this.composed.multiplyMatrices(this.place, this.partMatrices[part]);
            mesh.setMatrixAt(index, this.composed);
        });
    }
    tint(index, color) {
        for (const mesh of this.meshes)
            mesh.setColorAt(index, color);
    }
    finish(count) {
        for (const mesh of this.meshes) {
            mesh.count = count;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor)
                mesh.instanceColor.needsUpdate = true;
        }
    }
}
class WarSceneryKit {
    static files() {
        const groups = [WarSceneryKit.TREES, WarSceneryKit.DEAD_TREES, WarSceneryKit.BUSHES, WarSceneryKit.GRASS, WarSceneryKit.ROCKS_SMALL, WarSceneryKit.ROCKS_LARGE, WarSceneryKit.MOUNTAINS, [WarSceneryKit.TENT], WarSceneryKit.CAMP, WarSceneryKit.GRAVEYARD];
        return Array.from(new Set(groups.reduce((all, group) => all.concat(group), [])));
    }
}
WarSceneryKit.TREES = ["forest/Tree_1_A_Color1.gltf", "forest/Tree_1_B_Color1.gltf", "forest/Tree_2_A_Color1.gltf", "forest/Tree_2_B_Color1.gltf", "forest/Tree_3_A_Color1.gltf", "forest/Tree_3_B_Color1.gltf", "forest/Tree_4_A_Color1.gltf", "forest/Tree_4_B_Color1.gltf"];
WarSceneryKit.DEAD_TREES = ["forest/Tree_Bare_1_A_Color1.gltf", "forest/Tree_Bare_2_A_Color1.gltf", "halloween/tree_dead_large.gltf", "halloween/tree_dead_medium.gltf"];
WarSceneryKit.BUSHES = ["forest/Bush_1_A_Color1.gltf", "forest/Bush_1_C_Color1.gltf", "forest/Bush_2_A_Color1.gltf", "forest/Bush_3_A_Color1.gltf", "forest/Bush_4_A_Color1.gltf"];
WarSceneryKit.GRASS = ["forest/Grass_1_A_Color1.gltf", "forest/Grass_2_A_Color1.gltf"];
WarSceneryKit.ROCKS_SMALL = ["forest/Rock_1_A_Color1.gltf", "forest/Rock_1_E_Color1.gltf", "forest/Rock_2_A_Color1.gltf", "forest/Rock_2_E_Color1.gltf"];
WarSceneryKit.ROCKS_LARGE = ["forest/Rock_3_A_Color1.gltf", "forest/Rock_3_F_Color1.gltf", "forest/Rock_3_J_Color1.gltf"];
WarSceneryKit.MOUNTAINS = ["hex/mountain_A_grass_trees.gltf", "hex/hills_A_trees.gltf"];
WarSceneryKit.TENT = "hex/tent.gltf";
WarSceneryKit.CAMP = ["hex/crate_A_big.gltf", "hex/barrel.gltf", "hex/flag_blue.gltf", "hex/fence_wood_straight.gltf", "hex/sack.gltf", "hex/weaponrack.gltf", "hex/target.gltf", "hex/resource_lumber.gltf", "hex/resource_stone.gltf"];
WarSceneryKit.GRAVEYARD = ["halloween/gravestone.gltf", "halloween/gravemarker_A.gltf", "halloween/gravemarker_B.gltf", "halloween/grave_A.gltf", "halloween/grave_B.gltf", "halloween/bone_A.gltf", "halloween/skull.gltf", "halloween/fence_broken.gltf", "halloween/fence.gltf", "halloween/pumpkin_orange.gltf", "halloween/ribcage.gltf", "halloween/arch.gltf"];
class WarSceneryBuilder {
    constructor(libs, assets, transform, noise, field, factions) {
        this.libs = libs;
        this.assets = assets;
        this.transform = transform;
        this.noise = noise;
        this.field = field;
        this.factions = factions;
        this.random = new WarSeededRandom(20261010);
        this.buckets = new Map();
        this.detailBuckets = new Map();
        this.addingDetail = false;
        this.cursed = new WarCursedGround(factions);
    }
    build() {
        const THREE = this.libs.THREE;
        const core = new THREE.Group(), detail = new THREE.Group();
        this.placeBorder();
        this.placeCliffs();
        this.placeLandmarks();
        this.factions.forEach((faction, team) => this.placeBaseRelics(team, faction));
        this.addingDetail = true;
        this.placeLaneDebris();
        this.placeHighlands();
        this.buckets.forEach((placements, file) => core.add(WarInstanceSet.fromPlacements(this.libs, this.assets.template(file), placements).group));
        this.detailBuckets.forEach((placements, file) => detail.add(WarInstanceSet.fromPlacements(this.libs, this.assets.template(file), placements).group));
        return { core, detail };
    }
    add(file, world, scale, yaw, lift = 0) {
        const scene = this.transform.toScene(world);
        const target = this.addingDetail ? this.detailBuckets : this.buckets;
        const list = target.get(file) ?? [];
        list.push({ x: scene.x, z: scene.z, yaw, scale, y: lift });
        target.set(file, list);
    }
    freeOfLaneAndPad(point, laneMargin, padMargin) {
        return this.field.laneDistance(point.x, point.y) > laneMargin && this.field.padDistance(point.x, point.y) > padMargin && Math.abs(point.x) < WarMapData.HALF_W - 150 && Math.abs(point.y) < WarMapData.HALF_H - 150;
    }
    treeAt(point) {
        return this.cursed.influence(point.x, point.y) > 0.45 ? this.random.pick(WarSceneryKit.DEAD_TREES) : this.random.pick(WarSceneryKit.TREES);
    }
    placeBorder() {
        const step = WarSceneryBuilder.BORDER_STEP;
        const rim = (point) => {
            this.add(this.random.pick(WarSceneryKit.MOUNTAINS), point, this.random.between(5.5, 8.5), this.random.between(0, 6.28));
        };
        for (let y = -WarMapData.HALF_H + 200; y <= WarMapData.HALF_H - 200; y += step) {
            rim({ x: -WarMapData.HALF_W - 150 + this.random.between(-120, 120), y });
            rim({ x: WarMapData.HALF_W + 150 + this.random.between(-120, 120), y });
        }
        for (let x = -WarMapData.HALF_W + 800; x <= WarMapData.HALF_W - 800; x += step) {
            rim({ x, y: -WarMapData.HALF_H - 150 + this.random.between(-120, 120) });
            rim({ x, y: WarMapData.HALF_H + 150 + this.random.between(-120, 120) });
        }
    }
    placeCliffs() {
        for (const corridor of this.field.laneCorridors()) {
            const length = WarMath.dist(corridor.ax, corridor.ay, corridor.bx, corridor.by);
            const half = this.field.visualHalfWidth(corridor);
            const steps = Math.floor(length / 320);
            for (let i = 0; i <= steps; i++) {
                const t = i / Math.max(1, steps);
                const cx = corridor.ax + (corridor.bx - corridor.ax) * t, cy = corridor.ay + (corridor.by - corridor.ay) * t;
                const nx = -(corridor.by - corridor.ay) / length, ny = (corridor.bx - corridor.ax) / length;
                for (const side of [-1, 1]) {
                    const near = half + this.random.between(420, 700) + (this.noise.sample(cx / 400, cy / 400) - 0.5) * 300;
                    const point = { x: cx + nx * side * near, y: cy + ny * side * near };
                    if (!this.freeOfLaneAndPad(point, 380, 200))
                        continue;
                    const roll = this.random.next();
                    if (roll < 0.4)
                        this.add(this.random.pick(WarSceneryKit.BUSHES), point, this.random.between(1.6, 2.6), this.random.between(0, 6.28));
                    else if (roll < 0.72)
                        this.add(this.treeAt(point), point, this.random.between(1.2, 1.9), this.random.between(0, 6.28));
                    else if (roll < 0.9)
                        this.add(this.random.pick(WarSceneryKit.ROCKS_LARGE), point, this.random.between(1.8, 3), this.random.between(0, 6.28));
                    else
                        this.add(this.random.pick(WarSceneryKit.ROCKS_SMALL), point, this.random.between(2, 3.4), this.random.between(0, 6.28));
                    const back = { x: cx + nx * side * (near + this.random.between(500, 900)), y: cy + ny * side * (near + this.random.between(500, 900)) };
                    if (this.random.next() < 0.6 && this.freeOfLaneAndPad(back, 500, 300))
                        this.add(this.treeAt(back), back, this.random.between(1.5, 2.3), this.random.between(0, 6.28));
                }
            }
        }
    }
    placeLaneDebris() {
        for (const corridor of this.field.laneCorridors()) {
            const length = WarMath.dist(corridor.ax, corridor.ay, corridor.bx, corridor.by);
            const nx = -(corridor.by - corridor.ay) / length, ny = (corridor.bx - corridor.ax) / length;
            const count = Math.floor(length / 240);
            for (let i = 0; i < count; i++) {
                const t = this.random.next();
                const side = this.random.next() < 0.5 ? -1 : 1;
                const lateral = side * (corridor.halfWidth + this.random.between(60, 360));
                const point = { x: corridor.ax + (corridor.bx - corridor.ax) * t + nx * lateral, y: corridor.ay + (corridor.by - corridor.ay) * t + ny * lateral };
                if (this.field.padDistance(point.x, point.y) < 250)
                    continue;
                this.add(this.random.pick(WarSceneryKit.GRASS), point, this.random.between(1.8, 3), this.random.between(0, 6.28));
            }
        }
    }
    placeHighlands() {
        const cell = 450;
        for (let y = -WarMapData.HALF_H + 200; y < WarMapData.HALF_H; y += cell) {
            for (let x = -WarMapData.HALF_W + 200; x < WarMapData.HALF_W; x += cell) {
                const point = { x: x + this.random.between(-170, 170), y: y + this.random.between(-170, 170) };
                if (!this.freeOfLaneAndPad(point, 760, 340))
                    continue;
                const density = this.noise.fbm(point.x / 900 + 31, point.y / 900 - 5, 3);
                if (density < 0.4 || this.random.next() > 0.82)
                    continue;
                const roll = this.random.next();
                if (roll < 0.34)
                    this.add(this.treeAt(point), point, this.random.between(1.2, 2), this.random.between(0, 6.28));
                else if (roll < 0.56)
                    this.add(this.random.pick(WarSceneryKit.BUSHES), point, this.random.between(1.6, 2.8), this.random.between(0, 6.28));
                else if (roll < 0.86)
                    this.add(this.random.pick(WarSceneryKit.GRASS), point, this.random.between(1.8, 3.2), this.random.between(0, 6.28));
                else if (roll < 0.95)
                    this.add(this.random.pick(WarSceneryKit.ROCKS_SMALL), point, this.random.between(2, 3.4), this.random.between(0, 6.28));
                else
                    this.add(this.random.pick(WarSceneryKit.ROCKS_LARGE), point, this.random.between(1.8, 3.2), this.random.between(0, 6.28));
            }
        }
    }
    placeLandmarks() {
        const rocks = [{ x: 1900, y: 1100 }, { x: -2100, y: 1500 }, { x: 2500, y: -700 }, { x: -3300, y: 3300 }, { x: 3300, y: 3500 }, { x: -1300, y: 2700 }];
        for (const sign of [1, -1]) {
            rocks.forEach((rock, i) => {
                const point = { x: rock.x * sign, y: rock.y * sign };
                if (this.freeOfLaneAndPad(point, 450, 350))
                    this.add(WarSceneryKit.ROCKS_LARGE[i % WarSceneryKit.ROCKS_LARGE.length], point, this.random.between(2.2, 3.2), this.random.between(0, 6.28));
            });
            this.add(WarSceneryKit.TREES[2], { x: 5600 * sign, y: -1500 * sign }, 2.2, 0.7);
            this.add(WarSceneryKit.TREES[5], { x: 5800 * sign, y: -1300 * sign }, 2, 2.1);
        }
    }
    placeBaseRelics(team, faction) {
        const hq = WarMapData.hq(team);
        const sign = WarMapData.sign(team);
        const at = (dx, dy) => ({ x: hq.x + dx * sign, y: hq.y + dy * sign });
        if (faction === "adventurer")
            this.placeCamp(at);
        else
            this.placeGraveyard(at);
    }
    placeCamp(at) {
        const camp = WarSceneryKit.CAMP;
        this.add(WarSceneryKit.TENT, at(-3000, 600), 6, 0.5);
        this.add(WarSceneryKit.TENT, at(-3150, 1500), 5.6, 1.1);
        this.add(camp[0], at(2300, 2150), 5, 1);
        this.add(camp[1], at(2000, 2350), 5, 0.4);
        this.add(camp[2], at(-2850, 2000), 5.6, 0);
        this.add(camp[4], at(3050, -300), 5, 0.5);
        this.add(camp[5], at(-2300, 2250), 5.2, 0.8);
        this.add(camp[6], at(-1500, 2650), 5, 3.2);
        this.add(camp[7], at(1500, 2650), 5.2, 0.6);
        this.add(camp[8], at(1000, 2750), 5, 1.3);
        for (let i = -3; i <= 3; i++)
            this.add(camp[3], at(i * 520, 2900), 5, 0);
    }
    placeGraveyard(at) {
        const yard = WarSceneryKit.GRAVEYARD;
        this.add(yard[0], at(-3000, 600), 2.6, 0.4);
        this.add(yard[1], at(-2800, 1350), 2.6, 0.2);
        this.add(yard[3], at(3000, 1000), 2.4, 0);
        this.add(yard[4], at(3200, 1800), 2.4, 0.3);
        this.add(yard[0], at(-3100, 2000), 2.6, 3.4);
        this.add(yard[2], at(2300, 2200), 2.6, 0.9);
        this.add(yard[5], at(-2300, 2250), 2.6, 1.3);
        this.add(yard[6], at(2700, 2300), 2.6, 0.6);
        this.add(yard[10], at(-1900, 2700), 2.2, 0.8);
        this.add(yard[9], at(1900, 2600), 2.6, 0.2);
        this.add(WarSceneryKit.DEAD_TREES[2], at(3150, -400), 2.4, 0.6);
        this.add(WarSceneryKit.DEAD_TREES[3], at(-3150, -300), 2.6, 2.4);
        this.add(yard[11], at(0, 2900), 3, 0);
        for (const x of [-2100, -1500, 1500, 2100])
            this.add(this.random.next() < 0.5 ? yard[7] : yard[8], at(x, 2900), 2.4, 0);
    }
}
WarSceneryBuilder.BORDER_STEP = 760;
