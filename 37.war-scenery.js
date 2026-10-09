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
class WarTerrainPainter {
    constructor(noise, field) {
        this.noise = noise;
        this.field = field;
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
        this.paintCraters(context, scale);
        return canvas;
    }
    colorAt(wx, wy) {
        const noise = this.noise;
        const wobble = (noise.fbm(wx / 520, wy / 520, 3) - 0.5) * 620;
        const lane = this.field.laneDistance(wx, wy) + wobble;
        const pad = this.field.padDistance(wx, wy);
        const open = Math.min(lane, pad + wobble);
        const grain = noise.fbm(wx / 90, wy / 90, 2);
        const base = open < 0 ? this.laneColor(wx, wy, grain) : this.highlandColor(wx, wy, grain);
        const edge = Math.abs(open) < 330 ? 1 - Math.abs(open) / 330 : 0;
        const shade = open < 0 ? 1 - edge * 0.38 : 1 - edge * 0.55;
        const rubble = edge > 0.2 && noise.sample(wx / 28, wy / 28) > 0.72 ? 0.7 : 1;
        const worn = pad < 0 ? 1 - Math.min(1, -pad / 500) * 0.1 * (0.6 + noise.fbm(wx / 210 + 5, wy / 210 + 11, 3) * 0.8) : 1;
        const factor = shade * rubble * worn;
        return [base[0] * factor, base[1] * factor, base[2] * factor];
    }
    highlandColor(wx, wy, grain) {
        const a = WarTerrainPainter.HIGHLAND_A, b = WarTerrainPainter.HIGHLAND_B;
        const mix = this.noise.fbm(wx / 640, wy / 640, 4);
        let color = [a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix, a[2] + (b[2] - a[2]) * mix];
        const lichen = this.noise.fbm(wx / 420 + 17, wy / 420 - 9, 3);
        if (lichen > 0.56) {
            const t = Math.min(1, (lichen - 0.56) * 6);
            const l = WarTerrainPainter.LICHEN;
            color = [color[0] + (l[0] - color[0]) * t, color[1] + (l[1] - color[1]) * t, color[2] + (l[2] - color[2]) * t];
        }
        const vein = Math.abs(this.noise.fbm(wx / 260, wy / 260, 3) - 0.5);
        const veinFactor = vein < 0.018 ? 0.62 : 1;
        const speck = 0.9 + grain * 0.2;
        return [color[0] * veinFactor * speck, color[1] * veinFactor * speck, color[2] * veinFactor * speck];
    }
    laneColor(wx, wy, grain) {
        const a = WarTerrainPainter.LANE_A, b = WarTerrainPainter.LANE_B;
        const mix = this.noise.fbm(wx / 480, wy / 480, 3);
        const ripple = Math.sin((wx * 0.011 + this.noise.fbm(wx / 300, wy / 300, 2) * 9) + wy * 0.004) * 0.5 + 0.5;
        const tone = 0.93 + ripple * 0.1 + (grain - 0.5) * 0.18;
        return [(a[0] + (b[0] - a[0]) * mix) * tone, (a[1] + (b[1] - a[1]) * mix) * tone, (a[2] + (b[2] - a[2]) * mix) * tone];
    }
    paintCraters(context, scale) {
        const random = new WarSeededRandom(77);
        let placed = 0;
        for (let tries = 0; tries < 400 && placed < 46; tries++) {
            const x = random.between(-WarMapData.HALF_W + 400, WarMapData.HALF_W - 400);
            const y = random.between(-WarMapData.HALF_H + 400, WarMapData.HALF_H - 400);
            if (this.field.padDistance(x, y) < 300)
                continue;
            const radius = random.between(110, 330);
            const cx = (x + WarMapData.HALF_W) * scale, cy = (y + WarMapData.HALF_H) * scale, r = radius * scale;
            const gradient = context.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
            gradient.addColorStop(0, "rgba(20, 12, 10, 0.55)");
            gradient.addColorStop(0.72, "rgba(30, 18, 14, 0.38)");
            gradient.addColorStop(0.9, "rgba(235, 205, 160, 0.30)");
            gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
            context.fillStyle = gradient;
            context.beginPath();
            context.arc(cx, cy, r, 0, Math.PI * 2);
            context.fill();
            placed++;
        }
    }
}
WarTerrainPainter.PIXELS_PER_METER = 5;
WarTerrainPainter.HIGHLAND_A = [0x4C, 0x32, 0x2C];
WarTerrainPainter.HIGHLAND_B = [0x74, 0x4A, 0x36];
WarTerrainPainter.LICHEN = [0x4F, 0x3A, 0x62];
WarTerrainPainter.LANE_A = [0xB8, 0x98, 0x70];
WarTerrainPainter.LANE_B = [0x92, 0x76, 0x58];
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
        const groups = [WarSceneryKit.ROCKS_SMALL, WarSceneryKit.ROCKS_LARGE, WarSceneryKit.CRYSTALS, WarSceneryKit.TREES, WarSceneryKit.PLANTS, WarSceneryKit.PEBBLES, WarSceneryKit.CRATERS, WarSceneryKit.WRECKS, WarSceneryKit.RELICS, [WarSceneryKit.WORKER]];
        return Array.from(new Set(groups.reduce((all, group) => all.concat(group), [])));
    }
}
WarSceneryKit.ROCKS_SMALL = ["scenery/Rock_1.gltf", "scenery/Rock_2.gltf", "scenery/Rock_3.gltf", "scenery/Rock_4.gltf", "scenery/rock.glb", "scenery/rocks_smallA.glb", "scenery/rocks_smallB.glb", "scenery/meteor_detailed.glb"];
WarSceneryKit.ROCKS_LARGE = ["scenery/Rock_Large_1.gltf", "scenery/Rock_Large_2.gltf", "scenery/Rock_Large_3.gltf", "scenery/rock_largeA.glb", "scenery/rock_largeB.glb"];
WarSceneryKit.CRYSTALS = ["scenery/rock_crystals.glb", "scenery/rock_crystalsLargeA.glb", "scenery/rock_crystalsLargeB.glb"];
WarSceneryKit.TREES = ["scenery/Tree_Spiral_1.gltf", "scenery/Tree_Spiral_2.gltf", "scenery/Tree_Spiral_3.gltf", "scenery/Tree_Light_2.gltf", "scenery/Tree_Lava_1.gltf", "scenery/Tree_Lava_2.gltf", "scenery/Tree_Swirl_2.gltf", "scenery/Tree_Spikes_2.gltf"];
WarSceneryKit.PLANTS = ["scenery/Plant_1.gltf", "scenery/Plant_2.gltf", "scenery/Plant_3.gltf", "scenery/Bush_2.gltf", "scenery/Bush_3.gltf", "scenery/Grass_1.gltf", "scenery/Grass_2.gltf", "scenery/Grass_3.gltf"];
WarSceneryKit.PEBBLES = ["scenery/rocks_smallA.glb", "scenery/rocks_smallB.glb", "scenery/rock.glb"];
WarSceneryKit.CRATERS = ["scenery/crater.glb", "scenery/craterLarge.glb"];
WarSceneryKit.WRECKS = ["scenery/craft_cargoA.glb", "scenery/craft_cargoB.glb", "scenery/craft_miner.glb", "scenery/craft_racer.glb", "scenery/craft_speederA.glb"];
WarSceneryKit.RELICS = ["scenery/satelliteDish_large.glb", "scenery/satelliteDish.glb", "scenery/rocket_fuelA.glb", "scenery/rocket_finsA.glb", "scenery/bones.glb", "scenery/barrels.glb", "scenery/machine_generator.glb", "scenery/machine_wireless.glb", "scenery/structure_closed.glb", "scenery/hangar_smallA.glb", "scenery/monorail_trackStraight.glb", "scenery/barrels.glb", "scenery/alien.glb", "scenery/rover.glb", "scenery/SolarPanel_Structure.gltf", "scenery/Roof_Radar.gltf", "scenery/meteor.glb", "scenery/meteor_half.glb"];
WarSceneryKit.WORKER = "scenery/astronautA.glb";
class WarSceneryBuilder {
    constructor(libs, assets, transform, noise, field) {
        this.libs = libs;
        this.assets = assets;
        this.transform = transform;
        this.noise = noise;
        this.field = field;
        this.random = new WarSeededRandom(20261010);
        this.buckets = new Map();
        this.detailBuckets = new Map();
        this.addingDetail = false;
    }
    build() {
        const THREE = this.libs.THREE;
        const core = new THREE.Group(), detail = new THREE.Group();
        this.placeCliffs();
        this.placeLandmarks();
        this.placeBaseRelics();
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
    placeCliffs() {
        for (const corridor of this.field.laneCorridors()) {
            const length = WarMath.dist(corridor.ax, corridor.ay, corridor.bx, corridor.by);
            const half = this.field.visualHalfWidth(corridor);
            const steps = Math.floor(length / 300);
            for (let i = 0; i <= steps; i++) {
                const t = i / Math.max(1, steps);
                const cx = corridor.ax + (corridor.bx - corridor.ax) * t, cy = corridor.ay + (corridor.by - corridor.ay) * t;
                const nx = -(corridor.by - corridor.ay) / length, ny = (corridor.bx - corridor.ax) / length;
                for (const side of [-1, 1]) {
                    const near = half + this.random.between(120, 420) + (this.noise.sample(cx / 400, cy / 400) - 0.5) * 300;
                    const point = { x: cx + nx * side * near, y: cy + ny * side * near };
                    if (!this.freeOfLaneAndPad(point, 120, 200))
                        continue;
                    const roll = this.random.next();
                    if (roll < 0.62)
                        this.add(this.random.pick(WarSceneryKit.ROCKS_SMALL), point, this.random.between(0.9, 1.7), this.random.between(0, 6.28));
                    else if (roll < 0.9)
                        this.add(this.random.pick(WarSceneryKit.ROCKS_LARGE), point, this.random.between(0.45, 0.8), this.random.between(0, 6.28));
                    else
                        this.add(this.random.pick(WarSceneryKit.CRYSTALS), point, this.random.between(1.1, 1.8), this.random.between(0, 6.28));
                    const back = { x: cx + nx * side * (near + this.random.between(500, 900)), y: cy + ny * side * (near + this.random.between(500, 900)) };
                    if (this.random.next() < 0.55 && this.freeOfLaneAndPad(back, 300, 300))
                        this.add(this.random.pick(WarSceneryKit.ROCKS_LARGE), back, this.random.between(0.8, 1.35), this.random.between(0, 6.28));
                }
            }
        }
    }
    placeLaneDebris() {
        for (const corridor of this.field.laneCorridors()) {
            const length = WarMath.dist(corridor.ax, corridor.ay, corridor.bx, corridor.by);
            const nx = -(corridor.by - corridor.ay) / length, ny = (corridor.bx - corridor.ax) / length;
            const count = Math.floor(length / 260);
            for (let i = 0; i < count; i++) {
                const t = this.random.next();
                const lateral = this.random.between(-1, 1) * (corridor.halfWidth + 90);
                const point = { x: corridor.ax + (corridor.bx - corridor.ax) * t + nx * lateral, y: corridor.ay + (corridor.by - corridor.ay) * t + ny * lateral };
                if (this.field.padDistance(point.x, point.y) < 250)
                    continue;
                const roll = this.random.next();
                if (roll < 0.62 || Math.abs(lateral) < corridor.halfWidth * 0.35)
                    this.add(this.random.pick(WarSceneryKit.PEBBLES), point, this.random.between(0.5, 1), this.random.between(0, 6.28));
                else
                    this.add(this.random.pick(WarSceneryKit.CRATERS), point, this.random.between(1.2, 2.4), this.random.between(0, 6.28), 0.02);
            }
        }
    }
    placeHighlands() {
        const cell = 430;
        for (let y = -WarMapData.HALF_H + 200; y < WarMapData.HALF_H; y += cell) {
            for (let x = -WarMapData.HALF_W + 200; x < WarMapData.HALF_W; x += cell) {
                const point = { x: x + this.random.between(-170, 170), y: y + this.random.between(-170, 170) };
                if (!this.freeOfLaneAndPad(point, 760, 340))
                    continue;
                const density = this.noise.fbm(point.x / 900 + 31, point.y / 900 - 5, 3);
                if (density < 0.42 || this.random.next() > 0.8)
                    continue;
                const roll = this.random.next();
                if (roll < 0.3)
                    this.add(this.random.pick(WarSceneryKit.TREES), point, this.random.between(0.8, 1.5), this.random.between(0, 6.28));
                else if (roll < 0.65)
                    this.add(this.random.pick(WarSceneryKit.PLANTS), point, this.random.between(0.9, 1.6), this.random.between(0, 6.28));
                else if (roll < 0.9)
                    this.add(this.random.pick(WarSceneryKit.ROCKS_SMALL), point, this.random.between(1, 2.2), this.random.between(0, 6.28));
                else
                    this.add(this.random.pick(WarSceneryKit.ROCKS_LARGE), point, this.random.between(0.8, 1.5), this.random.between(0, 6.28));
            }
        }
    }
    placeLandmarks() {
        const sites = [
            { at: { x: 1250, y: 700 }, wreck: WarSceneryKit.WRECKS[0], crystal: WarSceneryKit.CRYSTALS[1] },
            { at: { x: -5700, y: 600 }, wreck: WarSceneryKit.WRECKS[2], crystal: WarSceneryKit.CRYSTALS[2] },
        ];
        for (const site of sites) {
            for (const sign of [1, -1]) {
                const at = { x: site.at.x * sign, y: site.at.y * sign };
                this.add(site.wreck, at, this.random.between(2.2, 2.8), this.random.between(0, 6.28));
                this.add(site.crystal, { x: at.x + 380 * sign, y: at.y - 260 * sign }, 2.4, this.random.between(0, 6.28));
                this.add(this.random.pick(WarSceneryKit.CRYSTALS), { x: at.x - 300 * sign, y: at.y + 380 * sign }, 1.6, this.random.between(0, 6.28));
                this.add(WarSceneryKit.RELICS[4], { x: at.x + 160 * sign, y: at.y + 420 * sign }, 2.2, this.random.between(0, 6.28));
            }
        }
        for (const sign of [1, -1]) {
            this.add(WarSceneryKit.RELICS[16], { x: 5600 * sign, y: -1500 * sign }, 3.4, 0.7);
            this.add(WarSceneryKit.RELICS[17], { x: 5800 * sign, y: -1300 * sign }, 3, 2.1);
            this.add(WarSceneryKit.CRATERS[1], { x: -1700 * sign, y: -400 * sign }, 4.6, 0, 0.02);
            this.add(WarSceneryKit.CRATERS[1], { x: 800 * sign, y: 3300 * sign }, 3.8, 1, 0.02);
        }
    }
    placeBaseRelics() {
        for (const team of [0, 1]) {
            const hq = WarMapData.hq(team);
            const sign = WarMapData.sign(team);
            const at = (dx, dy) => ({ x: hq.x + dx * sign, y: hq.y + dy * sign });
            this.add(WarSceneryKit.RELICS[0], at(-3000, 600), 2.4, 0.4 + team);
            this.add(WarSceneryKit.RELICS[6], at(2900, 1100), 2.6, 3);
            this.add(WarSceneryKit.RELICS[5], at(2300, 2150), 2, 1);
            this.add(WarSceneryKit.RELICS[13], at(-2850, 2000), 2.2, 2.2);
            this.add(WarSceneryKit.RELICS[14], at(3050, -300), 1.8, 0.5);
            this.add(WarSceneryKit.RELICS[10], at(-300, 2350), 2.6, 1.57);
            this.add(WarSceneryKit.RELICS[15], at(2000, 1000), 1.6, 0.8);
        }
    }
}
