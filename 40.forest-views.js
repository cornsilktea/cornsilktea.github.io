"use strict";
class FrToolClips {
    constructor(libs) {
        this.libs = libs;
        this.clips = new Map();
    }
    async load() {
        const gltf = await new this.libs.GLTFLoader().loadAsync(FrToolClips.FILE);
        gltf.animations.forEach((clip) => this.clips.set(clip.name, clip));
    }
}
FrToolClips.FILE = "assets/kaykit/animations/rig_medium_tools.glb";
class FrAvatar {
    constructor(libs, model, clips) {
        this.libs = libs;
        this.actions = new Map();
        this.current = null;
        this.group = new libs.THREE.Group();
        this.group.add(model);
        this.group.scale.setScalar(FrAvatar.SCALE_UP);
        model.traverse((node) => { if (node.isMesh)
            node.castShadow = true; });
        this.mixer = new libs.THREE.AnimationMixer(model);
        Object.keys(FrAvatar.CLIP_NAMES).forEach((key) => {
            const clip = clips.get(FrAvatar.CLIP_NAMES[key]);
            if (clip)
                this.actions.set(key, this.mixer.clipAction(clip));
        });
        this.play("idle");
    }
    play(name) {
        if (this.current === name)
            return;
        const next = this.actions.get(name);
        if (!next)
            return;
        const previous = this.current ? this.actions.get(this.current) : undefined;
        next.reset().fadeIn(0.15).play();
        if (previous)
            previous.fadeOut(0.15);
        this.current = name;
    }
    update(dt) { this.mixer.update(dt); }
}
FrAvatar.CLIP_NAMES = {
    idle: "Idle_A", run: "Running_A", walk: "Walking_A", chop: "Chopping", pickaxe: "Pickaxing", dig: "Digging", work: "Working_A", sleep: "Death_A_Pose", fish: "Fishing_Idle", attack: "Melee_1H_Attack_Chop",
};
FrAvatar.SCALE_UP = 2;
class FrSky {
    constructor(libs, scene, hemi, sun) {
        this.libs = libs;
        this.scene = scene;
        this.hemi = hemi;
        this.sun = sun;
    }
    apply(minuteOfDay) {
        const dayAmount = FrSky.dayAmount(minuteOfDay);
        const twilight = Math.max(0, 1 - Math.abs(minuteOfDay - FrBalance.DAWN_MINUTE) / 70, 1 - Math.abs(minuteOfDay - FrBalance.DUSK_MINUTE) / 70);
        const sky = FrSky.DAY_SKY.map((day, i) => FrSky.NIGHT_SKY[i] + (day - FrSky.NIGHT_SKY[i]) * dayAmount);
        const tinted = sky.map((v, i) => v + (FrSky.DUSK_SKY[i] - v) * twilight * 0.55);
        this.scene.background.setRGB(tinted[0], tinted[1], tinted[2]);
        if (this.scene.fog)
            this.scene.fog.color.setRGB(tinted[0], tinted[1], tinted[2]);
        this.hemi.intensity = 0.45 + 0.75 * dayAmount;
        this.sun.intensity = 0.15 + 1.25 * dayAmount;
        this.sun.color.setRGB(1, 0.92 - 0.25 * twilight, 0.82 - 0.32 * twilight);
        this.hemi.color.setRGB(0.82 + 0.18 * dayAmount, 0.9 + 0.1 * dayAmount, 1);
        return 1 - dayAmount;
    }
    static dayAmount(minuteOfDay) {
        const t = (minuteOfDay - FrBalance.DAWN_MINUTE) / (FrBalance.DUSK_MINUTE - FrBalance.DAWN_MINUTE);
        if (t < 0 || t > 1)
            return 0;
        return Math.max(0, Math.min(1, Math.sin(t * Math.PI) * 2.2));
    }
}
FrSky.DAY_SKY = [0.56, 0.78, 0.95];
FrSky.NIGHT_SKY = [0.03, 0.06, 0.15];
FrSky.DUSK_SKY = [0.96, 0.58, 0.38];
class FrTreeLayer {
    constructor(libs, world, group, nature) {
        this.libs = libs;
        this.world = world;
        this.group = group;
        this.slots = new Map();
        this.models = [];
        this.ghosts = new Map();
        this.ghosted = [];
        const T = libs.THREE;
        const plans = new Map();
        world.trees.forEach((spot) => {
            const key = this.variantOf(spot) + "|" + FrRegionGrid.keyOf(spot.x, spot.z, FrRegionGrid.TREE_CELLS);
            if (!plans.has(key))
                plans.set(key, []);
            plans.get(key).push(spot);
        });
        plans.forEach((spots, key) => {
            const variant = key.split("|")[0];
            const model = new FrInstancedModel(libs, nature.partsOf(variant), spots.length, true);
            spots.forEach((spot, index) => {
                const jitterX = (FrTreeField.hash(spot.x, spot.z, 22) - 0.5) * 0.8, jitterZ = (FrTreeField.hash(spot.x, spot.z, 23) - 0.5) * 0.8;
                const scale = FrTreeLayer.SCALE * (0.85 + FrTreeField.hash(spot.x, spot.z, 24) * 0.35 + (spot.zone >= 0 ? 0.1 : 0));
                const matrix = new T.Matrix4().compose(new T.Vector3((spot.x + 0.5) * FrTerrainData.BLOCK + jitterX, world.terrain.surfaceY(spot.x, spot.z), (spot.z + 0.5) * FrTerrainData.BLOCK + jitterZ), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), FrTreeField.hash(spot.x, spot.z, 25) * 6.28), new T.Vector3(scale, scale, scale));
                model.set(index, matrix);
                this.slots.set(world.terrain.index(spot.x, spot.z), { spot, model, index, variant, matrix });
            });
            model.commit();
            model.addTo(group);
            this.models.push(model);
            if (!this.ghosts.has(variant)) {
                const ghost = new FrInstancedModel(libs, nature.partsOf(variant), FrTreeLayer.GHOST_LIMIT, false, FrTreeLayer.GHOST_OPACITY);
                ghost.setCount(0);
                ghost.meshes.forEach((m) => { m.frustumCulled = false; });
                ghost.addTo(group);
                this.ghosts.set(variant, ghost);
            }
        });
        this.slots.forEach((slot, cell) => { if (world.isFelled(cell)) {
            slot.model.hide(slot.index);
            slot.model.commit(false);
        } });
    }
    variantOf(spot) {
        const list = spot.zone >= 0 ? FrTreeLayer.JUNGLE : this.world.terrain.height(spot.x, spot.z) >= 3 ? FrTreeLayer.HILL : FrTreeLayer.MEADOW;
        return list[Math.floor(FrTreeField.hash(spot.x, spot.z, 31) * list.length)];
    }
    pick(raycaster) {
        const meshes = [];
        this.models.forEach((m) => m.meshes.forEach((mesh) => meshes.push(mesh)));
        const hit = raycaster.intersectObjects(meshes, false).find((h) => h.instanceId !== undefined);
        if (!hit)
            return null;
        const model = this.models.find((m) => m.owns(hit.object));
        if (!model)
            return null;
        let found = null;
        this.slots.forEach((slot) => { if (slot.model === model && slot.index === hit.instanceId)
            found = slot; });
        const slot = found;
        if (!slot || this.world.isFelled(this.world.terrain.index(slot.spot.x, slot.spot.z)))
            return null;
        return { spot: slot.spot, distance: hit.distance };
    }
    fadeAround(cellX, cellZ) {
        const wanted = [];
        for (let dz = -1; dz <= FrTreeLayer.GHOST_RADIUS; dz++) {
            for (let dx = -FrTreeLayer.GHOST_RADIUS; dx <= FrTreeLayer.GHOST_RADIUS; dx++) {
                const cell = this.world.terrain.index(cellX + dx, cellZ + dz);
                const slot = this.slots.get(cell);
                if (slot && !this.world.isFelled(cell) && wanted.length < FrTreeLayer.GHOST_LIMIT)
                    wanted.push(slot);
            }
        }
        if (wanted.length === this.ghosted.length && wanted.every((slot, i) => slot === this.ghosted[i]))
            return;
        this.restoreGhosted();
        const counts = new Map();
        wanted.forEach((slot) => {
            const ghost = this.ghosts.get(slot.variant);
            const n = counts.get(slot.variant) || 0;
            ghost.set(n, slot.matrix);
            counts.set(slot.variant, n + 1);
            slot.model.hide(slot.index);
            slot.model.commit(false);
        });
        this.ghosts.forEach((ghost, variant) => { ghost.setCount(counts.get(variant) || 0); ghost.commit(false); });
        this.ghosted = wanted;
    }
    restoreGhosted() {
        this.ghosted.forEach((slot) => {
            if (this.world.isFelled(this.world.terrain.index(slot.spot.x, slot.spot.z)))
                return;
            slot.model.set(slot.index, slot.matrix);
            slot.model.commit(false);
        });
        this.ghosts.forEach((ghost) => ghost.setCount(0));
        this.ghosted = [];
    }
    remove(spot) {
        const slot = this.slots.get(this.world.terrain.index(spot.x, spot.z));
        if (!slot)
            return;
        this.restoreGhosted();
        slot.model.hide(slot.index);
        slot.model.commit(false);
    }
}
FrTreeLayer.MEADOW = ["Tree_1_A_Color1", "Tree_2_A_Color1"];
FrTreeLayer.JUNGLE = ["Tree_2_B_Color1", "Tree_2_A_Color1", "Tree_1_A_Color1"];
FrTreeLayer.HILL = ["Tree_4_A_Color1"];
FrTreeLayer.SCALE = 1.45;
FrTreeLayer.GHOST_LIMIT = 48;
FrTreeLayer.GHOST_RADIUS = 3;
FrTreeLayer.GHOST_OPACITY = 0.3;
class FrProps {
    constructor(libs, world, group, nature) {
        this.libs = libs;
        this.world = world;
        this.group = group;
        this.nature = nature;
        this.portalRings = [];
        this.chest = null;
        this.siteMarkers = new Map();
        const T = libs.THREE;
        const a = world.terrain.anchors;
        const B = FrTerrainData.BLOCK;
        const campfire = new T.Group();
        campfire.position.set((a.campfire.x + 0.5) * B, world.terrain.surfaceY(a.campfire.x, a.campfire.z), (a.campfire.z + 0.5) * B);
        campfire.userData = { kind: "cook" };
        this.fire = new FrCampfireFx(libs, campfire);
        group.add(campfire);
        this.buildPortals();
        this.buildChest();
        this.models = new FrSiteModels(libs, world, nature);
        world.sites.forEach((site) => this.addSiteMarker(site));
    }
    placeModel(parent, name, scale, x, y, z, turn = 0) {
        const model = this.nature.build(name);
        model.scale.setScalar(scale);
        model.position.set(x, y, z);
        model.rotation.y = turn;
        parent.add(model);
        return model;
    }
    buildChest() {
        const T = this.libs.THREE;
        const a = this.world.terrain.anchors.publicChest;
        const B = FrTerrainData.BLOCK;
        const holder = new T.Group();
        holder.position.set((a.x + 1) * B, this.world.terrain.surfaceY(a.x, a.z), (a.z + 1) * B);
        holder.userData = { kind: "chest" };
        if (this.nature.has("chest")) {
            this.placeModel(holder, "chest", 2.3, 0, 0, 0);
            this.placeModel(holder, "barrel_small", 1.5, 2.9, 0, -0.6, 0.4);
            this.placeModel(holder, "crates_stacked", 1.05, -3.1, 0, -0.9, -0.3);
        }
        else {
            const box = new T.Mesh(new T.BoxGeometry(3.8, 2.2, 2.6), new T.MeshLambertMaterial({ color: 0x9a6a38 }));
            box.position.y = 1.1;
            holder.add(box);
        }
        this.group.add(holder);
        this.chest = holder;
    }
    addSiteMarker(site) {
        const T = this.libs.THREE;
        const marker = new T.Group();
        marker.position.set((site.x + 0.5) * FrTerrainData.BLOCK, this.world.terrain.surfaceY(site.x, site.z), (site.z + 0.5) * FrTerrainData.BLOCK);
        marker.userData = { kind: "site", id: site.id };
        this.fillPost(marker, site);
        this.group.add(marker);
        this.siteMarkers.set(site.id, marker);
        if (this.world.isBuilt(site.id))
            this.showBuilt(site);
    }
    hideBuilt(site) {
        const marker = this.siteMarkers.get(site.id);
        if (!marker)
            return;
        marker.clear();
        this.fillPost(marker, site);
    }
    fillPost(marker, site) {
        const T = this.libs.THREE;
        const wood = new T.MeshLambertMaterial({ map: FrSurfaceTextures.wood(this.libs), color: 0x9a6c42 });
        const piece = (w, h, d, x, y, z, material) => {
            const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            marker.add(mesh);
            return mesh;
        };
        piece(0.45, 3.0, 0.45, 0, 1.5, 0, wood);
        const face = new T.MeshLambertMaterial({ map: FrSignTexture.of(this.libs, site.name) });
        const edge = new T.MeshLambertMaterial({ map: FrSurfaceTextures.wood(this.libs), color: 0xd8b07a });
        piece(2.8, 1.4, 0.32, 0, 2.6, 0.12, [edge, edge, edge, edge, face, face]);
        piece(3.0, 0.18, 0.44, 0, 3.38, 0.12, wood);
        piece(1.4, 0.3, 1.0, 0.9, 0.15, 0.8, edge).rotation.y = 0.3;
    }
    showBuilt(site) {
        const T = this.libs.THREE;
        const marker = this.siteMarkers.get(site.id);
        if (!marker)
            return;
        marker.clear();
        const mat = (color) => new T.MeshLambertMaterial({ color });
        const box = (w, h, d, x, y, z, color) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); m.castShadow = true; marker.add(m); return m; };
        const stoneBox = (w, h, d, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshLambertMaterial({ map: FrSurfaceTextures.stone(this.libs), color: 0xb4b6bd })); m.position.set(x, y, z); m.castShadow = true; marker.add(m); return m; };
        const has = (name) => this.nature.has(name);
        const builders = {
            workbench: () => {
                if (has("table_medium")) {
                    this.placeModel(marker, "table_medium", 1.6, 0, 0, 0);
                    this.placeModel(marker, "Wood_Log_Stack", 1.1, 2.6, 0, 0.4, 0.5);
                    if (has("anvil"))
                        this.placeModel(marker, "anvil", 0.9, -0.2, 1.6, 0, 0.2);
                    return;
                }
                box(3.2, 0.35, 1.8, 0, 1.7, 0, 0xb98a52);
            },
            forge: () => {
                stoneBox(3.0, 1.8, 2.2, -1.0, 0.9, -0.4);
                const coals = new T.Mesh(new T.BoxGeometry(2.0, 0.2, 1.4), new T.MeshBasicMaterial({ color: 0xff6a20 }));
                coals.position.set(-1.0, 1.9, -0.4);
                marker.add(coals);
                stoneBox(0.9, 2.2, 0.9, -1.9, 2.9, -1.0);
                if (has("anvil"))
                    this.placeModel(marker, "anvil", 1.8, 1.6, 0, 0.6, -0.4);
            },
            oven: () => {
                if (has("oven")) {
                    this.placeModel(marker, "oven", 1.5, 0, 0, 0);
                    return;
                }
                box(3, 0.6, 3, 0, 0.3, 0, 0x8a8d96);
            },
            kitchen: () => {
                if (has("stove_multi")) {
                    this.placeModel(marker, "stove_multi", 1.4, -1.4, 0, 0);
                    this.placeModel(marker, "kitchencounter_straight_A", 1.4, 1.4, 0, 0);
                    return;
                }
                box(4, 1.5, 1.6, 0, 0.75, 0, 0xd9c9a3);
            },
            farm_expand: () => {
                [[-1, 0], [1, 0]].forEach(([dx]) => box(0.25, 2.2, 0.25, dx, 1.1, 0, 0x8a5a2b));
                box(2.6, 0.9, 0.12, 0, 2.1, 0, 0x9be08a);
            },
        };
        if (builders[site.defId])
            builders[site.defId]();
        else
            this.models.fill(site, marker);
    }
    buildPortals() {
        const T = this.libs.THREE;
        const B = FrTerrainData.BLOCK;
        const colors = { fruit: 0xec40b0, beach: 0x00d2e6, mine: 0xffd600, dungeon: 0x9640dc };
        const anchors = this.world.terrain.anchors.portals;
        Object.keys(anchors).forEach((id, i) => {
            const p = anchors[id];
            const holder = new T.Group();
            holder.position.set((p.x + 0.5) * B, this.world.terrain.surfaceY(p.x, p.z), (p.z + 0.5) * B);
            holder.userData = { kind: "portal", id };
            const color = colors[id] || 0xffffff;
            const ring = new T.Mesh(new T.TorusGeometry(2.4, 0.28, 10, 28).translate(0, 3, 0), new T.MeshBasicMaterial({ color }));
            const disc = new T.Mesh(new T.CircleGeometry(2.2, 28).translate(0, 3, 0), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
            const stone = new T.MeshLambertMaterial({ map: FrSurfaceTextures.stone(this.libs), color: 0xa0a3ab });
            const base = new T.Mesh(new T.CylinderGeometry(2.8, 3.2, 0.5, 20).translate(0, 0.25, 0), stone);
            base.receiveShadow = true;
            holder.add(base, ring, disc);
            [-1, 1].forEach((side) => {
                const pillar = new T.Mesh(new T.BoxGeometry(0.7, 5.6, 0.7).translate(side * 3.3, 2.8, 0), stone);
                pillar.castShadow = true;
                const cap = new T.Mesh(new T.SphereGeometry(0.42, 10, 8).translate(side * 3.3, 5.9, 0), new T.MeshBasicMaterial({ color }));
                holder.add(pillar, cap);
            });
            this.group.add(holder);
            this.portalRings.push({ ring, disc, phase: i * 1.4 });
        });
    }
    update(dt, time, night) {
        this.fire.update(dt, time, night);
        this.portalRings.forEach((p) => { p.ring.rotation.y = time * 0.8 + p.phase; p.disc.material.opacity = 0.28 + 0.14 * Math.sin(time * 2.4 + p.phase); });
    }
}
class FrWaterSurface {
    constructor(libs, material) {
        this.libs = libs;
        this.material = material;
        this.inner = null;
        this.outerBuilt = false;
        this.group = new libs.THREE.Group();
    }
    rebuild(terrain) {
        const T = this.libs.THREE;
        const B = FrTerrainData.BLOCK;
        if (!this.outerBuilt) {
            this.buildOuter(terrain.w * B, terrain.d * B);
            this.outerBuilt = true;
        }
        if (this.inner) {
            this.group.remove(this.inner);
            this.inner.geometry.dispose();
        }
        const positions = [];
        const uvs = [];
        const y = FrWaterSurface.LEVEL;
        for (let z = 0; z < terrain.d; z++) {
            for (let x = 0; x < terrain.w; x++) {
                if (!terrain.isWater(x, z))
                    continue;
                const x0 = x * B, x1 = x0 + B, z0 = z * B, z1 = z0 + B;
                positions.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
                uvs.push(x0 / 8, z0 / 8, x0 / 8, z1 / 8, x1 / 8, z1 / 8, x0 / 8, z0 / 8, x1 / 8, z1 / 8, x1 / 8, z0 / 8);
            }
        }
        const geometry = new T.BufferGeometry();
        geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
        geometry.computeVertexNormals();
        this.inner = new T.Mesh(geometry, this.material);
        this.inner.receiveShadow = true;
        this.group.add(this.inner);
    }
    buildOuter(width, depth) {
        const T = this.libs.THREE;
        const far = FrWaterSurface.OUTER;
        const strips = [[-far, -far, width + far, 0], [-far, depth, width + far, depth + far], [-far, 0, 0, depth], [width, 0, width + far, depth]];
        strips.forEach(([x0, z0, x1, z1]) => {
            const geometry = new T.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, FrWaterSurface.LEVEL, (z0 + z1) / 2);
            const uv = geometry.getAttribute("uv");
            const pos = geometry.getAttribute("position");
            for (let i = 0; i < uv.count; i++)
                uv.setXY(i, pos.getX(i) / 8, pos.getZ(i) / 8);
            this.group.add(new T.Mesh(geometry, this.material));
        });
    }
}
FrWaterSurface.LEVEL = -0.9;
FrWaterSurface.OUTER = 600;
class FrCropLayer {
    constructor(libs, world, parent) {
        this.libs = libs;
        this.world = world;
        this.parent = parent;
        this.cells = new Map();
    }
    sync(nowMinute) {
        this.cells.forEach((cell, index) => { if (!this.world.farm.has(index)) {
            this.parent.remove(cell.group);
            this.cells.delete(index);
        } });
        this.world.farm.forEach((record, index) => {
            const x = index % this.world.terrain.w, z = Math.floor(index / this.world.terrain.w);
            const stage = FrFarmRules.stage(this.world, x, z, record, nowMinute);
            const existing = this.cells.get(index);
            if (existing && existing.stage === stage && existing.crop === record.crop)
                return;
            if (existing)
                this.parent.remove(existing.group);
            const group = this.build(x, z, stage, record.crop);
            this.parent.add(group);
            this.cells.set(index, { stage, crop: record.crop, group });
        });
    }
    build(x, z, stage, crop) {
        const T = this.libs.THREE;
        const group = new T.Group();
        group.position.set((x + 0.5) * FrTerrainData.BLOCK, this.world.terrain.surfaceY(x, z), (z + 0.5) * FrTerrainData.BLOCK);
        const green = new T.MeshLambertMaterial({ color: 0x4fae4a });
        const color = new T.MeshLambertMaterial({ color: FrCropLayer.COLORS[crop] || 0xffffff });
        const offsets = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
        offsets.forEach(([dx, dz]) => {
            if (stage === 0) {
                const m = new T.Mesh(new T.ConeGeometry(0.16, 0.4, 5).translate(0, 0.2, 0), green);
                m.position.set(dx, 0, dz);
                group.add(m);
            }
            else if (stage === 1) {
                const m = new T.Mesh(new T.CylinderGeometry(0.06, 0.1, 0.9, 5).translate(0, 0.45, 0), green);
                m.position.set(dx, 0, dz);
                group.add(m);
                const leaf = new T.Mesh(new T.ConeGeometry(0.3, 0.3, 5).translate(0, 0.9, 0), green);
                leaf.position.set(dx, 0, dz);
                group.add(leaf);
            }
            else {
                const bush = new T.Mesh(new T.SphereGeometry(0.38, 8, 6).translate(0, 0.55, 0), green);
                bush.position.set(dx, 0, dz);
                group.add(bush);
                if (stage === 3) {
                    const fruit = new T.Mesh(new T.SphereGeometry(0.26, 8, 6).translate(0, 1.0, 0), color);
                    fruit.position.set(dx, 0, dz);
                    group.add(fruit);
                }
            }
        });
        return group;
    }
}
FrCropLayer.COLORS = {
    potato: 0xc69a5a, carrot: 0xf0872e, lettuce: 0x7ccb5a, onion: 0xe8d2a0, wheat: 0xe8c45a, rice: 0xf0ebd2,
    tomato: 0xe5483f, corn: 0xf5d24a, chili: 0xd9372f, pumpkin: 0xf08a2e, strawberry: 0xe5384f, watermelon: 0x4fa55a,
};
class FrCameraRig {
    constructor(libs) {
        this.libs = libs;
        this.camera = new libs.THREE.PerspectiveCamera(42, 1, 0.5, FrCameraRig.FAR);
        this.focus = new libs.THREE.Vector3();
    }
    follow(target, dt) {
        const k = Math.min(1, dt * 6);
        this.focus.lerp(target, k);
        this.camera.position.set(this.focus.x, this.focus.y + FrCameraRig.OFFSET_Y, this.focus.z + FrCameraRig.OFFSET_Z);
        this.camera.lookAt(this.focus.x, this.focus.y + 2.5, this.focus.z);
    }
    snap(target) { this.focus.copy(target); this.follow(target, 1); }
    focusPoint() { return this.focus; }
    resize(width, height) {
        this.camera.aspect = width / Math.max(1, height);
        this.camera.fov = this.camera.aspect < 1 ? 58 : 42;
        this.camera.updateProjectionMatrix();
    }
}
FrCameraRig.OFFSET_Y = 38;
FrCameraRig.OFFSET_Z = 28;
FrCameraRig.FAR = 125;
class FrWorldView {
    constructor(libs, canvas, world, touchDevice, nature) {
        this.libs = libs;
        this.canvas = canvas;
        this.touchDevice = touchDevice;
        this.nature = nature;
        this.plaza = null;
        this.onVillageLevel = () => undefined;
        this.areaScene = null;
        this.areaDark = false;
        this.labels = null;
        this.selfUid = "";
        this.chunks = new Map();
        this.waterDirty = true;
        this.decor = null;
        this.shadowsOn = true;
        this.decorAllowed = true;
        this.governor = null;
        this.avatar = null;
        this.night = 0;
        this.cropsDirty = true;
        const T = libs.THREE;
        this.pixelRatioCap = touchDevice ? FrWorldView.MAX_PIXEL_RATIO_TOUCH : FrWorldView.MAX_PIXEL_RATIO_DESKTOP;
        this.renderer = new T.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = T.PCFSoftShadowMap;
        this.scene = new T.Scene();
        this.scene.background = new T.Color(0x8fc7f2);
        this.scene.fog = new T.Fog(0x8fc7f2, 78, FrCameraRig.FAR);
        const hemi = new T.HemisphereLight(0xffffff, 0x6a5a45, 1);
        const sun = new T.DirectionalLight(0xffffff, 1.3);
        sun.position.set(-40, 90, 30);
        this.setupShadow(sun);
        this.scene.add(hemi, sun, sun.target);
        this.sky = new FrSky(libs, this.scene, hemi, sun);
        this.rig = new FrCameraRig(libs);
        this.terrainGroup = new T.Group();
        this.scene.add(this.terrainGroup);
        this.terrainMaterial = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide, map: FrTerrainAtlas.get(libs) });
        const waterTexture = FrSurfaceTextures.water(libs).clone();
        waterTexture.needsUpdate = true;
        this.waterTexture = waterTexture;
        this.waterSurface = new FrWaterSurface(libs, new T.MeshPhongMaterial({ color: 0x3f86d0, map: waterTexture, specular: 0x88bbff, shininess: 60, transparent: true, opacity: 0.82, depthWrite: false }));
        this.water = this.waterSurface.group;
        this.scene.add(this.water);
        this.treeGroup = new T.Group();
        this.propGroup = new T.Group();
        this.blockGroup = new T.Group();
        this.decorGroup = new T.Group();
        this.scene.add(this.treeGroup, this.propGroup, this.blockGroup, this.decorGroup);
        this.preview = new T.Mesh(new T.BoxGeometry(FrTerrainData.BLOCK, FrTerrainData.BLOCK, FrTerrainData.BLOCK).translate(0, FrTerrainData.BLOCK / 2, 0), new T.MeshBasicMaterial({ color: 0x9be08a, transparent: true, opacity: 0.38, depthWrite: false }));
        this.preview.visible = false;
        this.scene.add(this.preview);
        this.marker = new T.Mesh(new T.BoxGeometry(FrTerrainData.BLOCK, 0.18, FrTerrainData.BLOCK), new T.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.55, depthWrite: false }));
        this.marker.visible = false;
        this.scene.add(this.marker);
        this.burst = new FrBurst(libs, this.scene);
        this.useWorld(world);
        const steps = [() => this.lowerPixelRatio(), () => this.lowerPixelRatio(), () => this.turnOffShadows(), () => this.hideDecor()];
        this.governor = window.QualityGovernor ? window.QualityGovernor({ steps, storageKey: "dongmaforest_quality_v1", isPlaying: () => true, slowSec: 0.022, slowLimit: 90 }) : null;
        window.addEventListener("resize", () => this.resize());
        this.resize();
    }
    terrainData() { return this.world.terrain; }
    groundMaterial() { return this.terrainMaterial; }
    useWorld(world) {
        this.world = world;
        this.chunks.forEach((mesh) => { this.terrainGroup.remove(mesh); mesh.geometry.dispose(); });
        this.chunks.clear();
        this.mesher = new FrTerrainMesher(this.libs, world.terrain, this.terrainMaterial);
        const counts = this.mesher.chunkCount();
        for (let cz = 0; cz < counts.z; cz++)
            for (let cx = 0; cx < counts.x; cx++)
                this.rebuildChunk(cx, cz);
        this.waterSurface.rebuild(world.terrain);
        this.waterDirty = false;
        this.treeGroup.clear();
        this.propGroup.clear();
        this.blockGroup.clear();
        this.decorGroup.clear();
        this.trees = new FrTreeLayer(this.libs, world, this.treeGroup, this.nature);
        this.props = new FrProps(this.libs, world, this.propGroup, this.nature);
        this.decor = new FrGroundDecor(this.libs, world, this.nature, this.decorGroup, (x, z) => this.decorBlocked(world, x, z));
        this.plaza = new FrPlazaDecor(this.libs, world, this.propGroup);
        this.plaza.refresh();
        this.blocksLayer = new FrBlockLayer(this.libs, world, this.blockGroup);
        this.crops = new FrCropLayer(this.libs, world, this.propGroup);
        this.rebuildLotMarkers();
        world.listen(this);
    }
    showArea(scene, dark) {
        this.hideArea();
        this.areaScene = scene;
        this.areaDark = dark;
        [this.terrainGroup, this.treeGroup, this.propGroup, this.blockGroup, this.decorGroup, this.water, this.marker, this.preview].forEach((o) => { o.visible = false; });
        this.scene.add(scene.group);
        if (dark) {
            this.scene.background.setRGB(0.02, 0.02, 0.035);
            if (this.scene.fog)
                this.scene.fog.color.setRGB(0.02, 0.02, 0.035);
            this.sky.hemi.intensity = 1.05;
            this.sky.sun.intensity = 0.35;
            this.sky.hemi.color.setRGB(0.95, 0.9, 0.85);
        }
    }
    hideArea() {
        if (!this.areaScene)
            return;
        this.scene.remove(this.areaScene.group);
        this.areaScene.dispose();
        this.areaScene = null;
        this.areaDark = false;
        [this.terrainGroup, this.treeGroup, this.propGroup, this.blockGroup, this.water].forEach((o) => { o.visible = true; });
        this.decorGroup.visible = this.decorAllowed;
    }
    updateAreaMarker(cell) {
        if (!this.areaScene)
            return;
        if (!cell) {
            this.marker.visible = false;
            return;
        }
        this.marker.visible = true;
        const terrain = this.areaScene.area.terrain;
        this.marker.position.set((cell.x + 0.5) * FrTerrainData.BLOCK, Math.max(0, terrain.surfaceY(cell.x, cell.z)) + 0.12, (cell.z + 0.5) * FrTerrainData.BLOCK);
    }
    pickArea(clientX, clientY) {
        const scene = this.areaScene;
        if (!scene)
            return null;
        const T = this.libs.THREE;
        const rect = this.canvas.getBoundingClientRect();
        const raycaster = new T.Raycaster();
        raycaster.setFromCamera(new T.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.rig.camera);
        const feature = raycaster.intersectObjects(scene.featureObjects(), true)[0];
        const ground = raycaster.intersectObjects(scene.groundObjects(), false)[0];
        if (feature && (!ground || feature.distance <= ground.distance + 4)) {
            let node = feature.object;
            while (node) {
                const data = node.userData;
                if (data.kind === "feature")
                    return { kind: "feature", x: data.x, z: data.z };
                node = node.parent;
            }
        }
        if (!ground)
            return null;
        const point = ground.point.clone().addScaledVector(raycaster.ray.direction, 0.05);
        return { kind: "ground", x: Math.floor(point.x / FrTerrainData.BLOCK), z: Math.floor(point.z / FrTerrainData.BLOCK) };
    }
    setLabels(labels, selfUid) {
        this.labels = labels;
        this.selfUid = selfUid;
        this.rebuildLotMarkers();
    }
    rebuildLotMarkers() {
        if (!this.labels)
            return;
        if (this.lotMarkers)
            this.propGroup.remove(this.lotMarkers.groupObject());
        this.lotMarkers = new FrLotMarkers(this.libs, this.world, this.propGroup, this.labels, this.selfUid);
    }
    setPreview(cell, level, valid, large = true) {
        if (!cell) {
            this.preview.visible = false;
            return;
        }
        this.preview.visible = true;
        this.preview.position.set((cell.x + 0.5) * FrTerrainData.BLOCK, this.world.terrain.surfaceY(cell.x, cell.z) + level * FrTerrainData.BLOCK, (cell.z + 0.5) * FrTerrainData.BLOCK);
        this.preview.material.color.setHex(valid ? 0x9be08a : 0xff6b5a);
        this.preview.scale.setScalar(large ? 1.02 : 0.5);
    }
    setupShadow(sun) {
        this.sun = sun;
        sun.castShadow = true;
        const size = this.touchDevice ? 1024 : 2048;
        sun.shadow.mapSize.set(size, size);
        const box = FrWorldView.SHADOW_BOX;
        sun.shadow.camera.left = -box;
        sun.shadow.camera.right = box;
        sun.shadow.camera.top = box;
        sun.shadow.camera.bottom = -box;
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 260;
        sun.shadow.bias = -0.0008;
        sun.shadow.normalBias = 0.35;
    }
    followShadow() {
        if (!this.shadowsOn)
            return;
        const focus = this.rig.focusPoint();
        const offset = FrWorldView.SUN_OFFSET;
        this.sun.target.position.set(focus.x, focus.y, focus.z);
        this.sun.position.set(focus.x + offset[0], focus.y + offset[1], focus.z + offset[2]);
    }
    hideDecor() {
        if (!this.decorGroup.visible)
            return false;
        this.decorAllowed = false;
        this.decorGroup.visible = false;
        return true;
    }
    turnOffShadows() {
        if (!this.shadowsOn)
            return false;
        this.shadowsOn = false;
        this.sun.castShadow = false;
        return true;
    }
    decorBlocked(world, x, z) {
        const terrain = world.terrain;
        const cell = terrain.index(x, z);
        if (terrain.isShielded(x, z) || terrain.isWater(x, z) || world.trees.has(cell))
            return true;
        if (world.blocks.top(cell) > 0 || terrain.editOf(x, z))
            return true;
        return world.sites.some((site) => (Math.abs(site.x - x) <= 2 && Math.abs(site.z - z) <= 2) || site.cells.some((c) => c.x === x && c.z === z) || site.effect.some((c) => c.x === x && c.z === z));
    }
    lowerPixelRatio() {
        if (this.pixelRatioCap <= 1)
            return false;
        this.pixelRatioCap = Math.max(1, this.pixelRatioCap - 0.25);
        this.resize();
        return true;
    }
    rebuildChunk(cx, cz) {
        const key = cx + "_" + cz;
        const old = this.chunks.get(key);
        if (old) {
            this.terrainGroup.remove(old);
            old.geometry.dispose();
            this.chunks.delete(key);
        }
        const mesh = this.mesher.build(cx, cz);
        if (!mesh)
            return;
        this.chunks.set(key, mesh);
        this.terrainGroup.add(mesh);
    }
    onTreeFelled(spot) { this.trees.remove(spot); }
    onBuilt(id) {
        const site = this.world ? this.world.siteOf(id) : undefined;
        if (site) {
            if (this.world && this.world.isBuilt(id))
                this.props.showBuilt(site);
            else
                this.props.hideBuilt(site);
        }
        if (!this.plaza)
            return;
        const before = this.plaza.level;
        const level = this.plaza.refresh();
        if (level > before && before > 0)
            this.onVillageLevel(level);
    }
    onPublicChanged() { return; }
    onBlockChanged(x, z, y, record) { this.blocksLayer.apply(x, z, y, record); if (record && this.decor)
        this.decor.clearCell(x, z); }
    onLotChanged() { if (this.lotMarkers)
        this.lotMarkers.refresh(); }
    onFarmChanged() { this.cropsDirty = true; }
    updateCrops(nowMinute, force = false) {
        if (!force && !this.cropsDirty)
            return;
        this.cropsDirty = false;
        this.crops.sync(nowMinute);
    }
    onTerrainEdited(x, z) {
        if (this.decor)
            this.decor.clearCell(x, z);
        this.waterDirty = true;
        const cx = Math.floor(x / FrTerrainMesher.CHUNK), cz = Math.floor(z / FrTerrainMesher.CHUNK);
        this.rebuildChunk(cx, cz);
        if (x % FrTerrainMesher.CHUNK === 0)
            this.rebuildChunk(cx - 1, cz);
        if (x % FrTerrainMesher.CHUNK === FrTerrainMesher.CHUNK - 1)
            this.rebuildChunk(cx + 1, cz);
        if (z % FrTerrainMesher.CHUNK === 0)
            this.rebuildChunk(cx, cz - 1);
        if (z % FrTerrainMesher.CHUNK === FrTerrainMesher.CHUNK - 1)
            this.rebuildChunk(cx, cz + 1);
    }
    attachAvatar(avatar) {
        this.avatar = avatar;
        this.scene.add(avatar.group);
    }
    setMarker(cell) {
        if (!cell) {
            this.marker.visible = false;
            return;
        }
        this.marker.visible = true;
        this.marker.position.set((cell.x + 0.5) * FrTerrainData.BLOCK, this.world.terrain.surfaceY(cell.x, cell.z) + 0.12, (cell.z + 0.5) * FrTerrainData.BLOCK);
    }
    fadeTreesAround(cell) { this.trees.fadeAround(cell.x, cell.z); }
    pick(clientX, clientY) {
        const T = this.libs.THREE;
        const rect = this.canvas.getBoundingClientRect();
        const pointer = new T.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new T.Raycaster();
        raycaster.setFromCamera(pointer, this.rig.camera);
        const prop = raycaster.intersectObjects(this.propGroup.children, true)[0];
        const ground = raycaster.intersectObjects(this.terrainGroup.children, false)[0];
        const treeHit = this.trees.pick(raycaster);
        const best = (o) => (o ? o.distance : Infinity);
        if (prop && best(prop) <= Math.min(best(ground), treeHit ? treeHit.distance : Infinity)) {
            let node = prop.object;
            while (node) {
                const kind = node.userData.kind;
                if (kind)
                    return { kind: kind, siteId: node.userData.id };
                node = node.parent;
            }
        }
        if (treeHit && treeHit.distance <= best(ground) + 6)
            return { kind: "tree", spot: treeHit.spot };
        if (!ground)
            return null;
        const point = ground.point.clone().addScaledVector(raycaster.ray.direction, 0.05);
        return { kind: "ground", cell: { x: this.world.terrain.cellOf(point.x), z: this.world.terrain.cellOf(point.z) } };
    }
    applyClock(minuteOfDay) {
        if (this.areaDark) {
            this.night = 0.6;
            return;
        }
        this.night = this.sky.apply(minuteOfDay);
    }
    resize() {
        const width = window.innerWidth, height = window.innerHeight;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
        this.renderer.setSize(width, height, false);
        this.rig.resize(width, height);
    }
    render(dt, time) {
        if (this.avatar)
            this.avatar.update(dt);
        this.props.update(dt, time, this.night);
        if (this.areaScene)
            this.areaScene.update(time);
        this.burst.update(dt);
        this.waterTexture.offset.set((time * 0.012) % 1, (time * 0.007) % 1);
        if (this.waterDirty) {
            this.waterDirty = false;
            this.waterSurface.rebuild(this.world.terrain);
        }
        this.followShadow();
        this.renderer.render(this.scene, this.rig.camera);
        if (this.governor)
            this.governor.update(dt);
    }
}
FrWorldView.MAX_PIXEL_RATIO_TOUCH = 1.5;
FrWorldView.MAX_PIXEL_RATIO_DESKTOP = 2;
FrWorldView.SHADOW_BOX = 36;
FrWorldView.SUN_OFFSET = [-40, 90, 30];
class FrRemoteAvatars {
    constructor(libs, scene, factory, clips, labels, roster, selfUid) {
        this.libs = libs;
        this.scene = scene;
        this.factory = factory;
        this.clips = clips;
        this.labels = labels;
        this.roster = roster;
        this.selfUid = selfUid;
        this.entries = new Map();
    }
    update(dt, area) {
        const alive = new Set(this.roster.aliveUids().filter((uid) => uid !== this.selfUid && this.roster.poses.has(uid) && this.roster.members.has(uid) && !this.roster.members.get(uid).adm && this.roster.presence.get(uid).area === area));
        this.entries.forEach((entry, uid) => { if (!alive.has(uid))
            this.drop(uid, entry); });
        alive.forEach((uid) => this.show(uid, dt));
    }
    drop(uid, entry) {
        this.scene.remove(entry.avatar.group);
        this.factory.disposeModel(entry.avatar.group);
        this.entries.delete(uid);
    }
    show(uid, dt) {
        const member = this.roster.members.get(uid);
        const pose = this.roster.poses.get(uid);
        const lookKey = JSON.stringify(member.look);
        let entry = this.entries.get(uid);
        if (entry && entry.look !== lookKey) {
            this.drop(uid, entry);
            entry = undefined;
        }
        if (!entry) {
            const model = this.factory.build(CharacterLooks.clean(member.look));
            const avatar = new FrAvatar(this.libs, model, this.clips);
            const label = this.labels.create(member.name, "#FFFFFF");
            label.scale.set(1.4, 0.35, 1);
            label.position.y = FrRemoteAvatars.LABEL_HEIGHT;
            avatar.group.add(label);
            avatar.group.position.set(pose.x, pose.y, pose.z);
            this.scene.add(avatar.group);
            entry = { avatar, label, look: lookKey, lastX: pose.x, lastZ: pose.z };
            this.entries.set(uid, entry);
        }
        const group = entry.avatar.group;
        const k = Math.min(1, dt * 9);
        const elapsed = Math.min(FrRemoteAvatars.MAX_EXTRAPOLATE, (Date.now() - pose.at) / 1000);
        group.position.x += (pose.x + pose.vx * elapsed - group.position.x) * k;
        group.position.z += (pose.z + pose.vz * elapsed - group.position.z) * k;
        group.position.y += (pose.y - group.position.y) * k;
        let turn = pose.dir - group.rotation.y;
        while (turn > Math.PI)
            turn -= Math.PI * 2;
        while (turn < -Math.PI)
            turn += Math.PI * 2;
        group.rotation.y += turn * k;
        entry.avatar.play(FrWire.ANIMS[pose.anim] || "idle");
        entry.avatar.update(dt);
    }
}
FrRemoteAvatars.LABEL_HEIGHT = 2.4;
FrRemoteAvatars.MAX_EXTRAPOLATE = 3.2;
