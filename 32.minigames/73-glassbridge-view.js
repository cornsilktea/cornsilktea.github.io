"use strict";
class GlassBridgeLook {
}
GlassBridgeLook.SKY = 0x0B1A22;
GlassBridgeLook.FOG_NEAR = 38;
GlassBridgeLook.FOG_FAR = 120;
GlassBridgeLook.GLASS = 0x8FD8F5;
GlassBridgeLook.GLASS_OPACITY = 0.5;
GlassBridgeLook.GLOW = 0xDFFAFF;
GlassBridgeLook.SHARD = 0xBDEBFF;
GlassBridgeLook.LAVA = 0xFF6A1F;
GlassBridgeLook.LAVA_SPARK = 0xFFC247;
GlassBridgeLook.CLIFF = 0x3A2B26;
GlassBridgeLook.ROCK_TINT = 0xC9B8AE;
GlassBridgeLook.WALL_LAYERS = 5;
GlassBridgeLook.WALL_LAYER_HEIGHT = 5.5;
GlassBridgeLook.WALL_STEP = 5.5;
GlassBridgeLook.WALL_ROCK_MIN = 4.2;
GlassBridgeLook.WALL_ROCK_RANGE = 2.6;
GlassBridgeLook.GLOW_HEIGHT = 14;
GlassBridgeLook.ACCENT = "#D97B4F";
GlassBridgeLook.MARK = 0xFFA45C;
GlassBridgeLook.TILE_SIZE = 2;
GlassBridgeLook.TILE_THICKNESS = 0.15;
GlassBridgeLook.LABEL_HEIGHT = 2.75;
GlassBridgeLook.PLATFORM_COLUMNS = 4;
GlassBridgeLook.PLATFORM_ROWS = 3;
GlassBridgeLook.PLATFORM_TILE = 4;
GlassBridgeLook.CLIFF_X = 13;
class GlassBridgeClips {
}
GlassBridgeClips.IDLE = "Idle_A";
GlassBridgeClips.IDLE_ALT = "Idle_B";
GlassBridgeClips.WALK = "Walking_A";
GlassBridgeClips.RUN = "Running_A";
GlassBridgeClips.JUMP = "Jump_Full_Short";
GlassBridgeClips.AIR = "Jump_Idle";
GlassBridgeClips.INTERACT = "Interact";
GlassBridgeClips.SPAWN = "Spawn_Air";
GlassBridgeClips.CHEER = "Cheering";
GlassBridgeClips.FALL_END = "Death_B";
class GlassBridgeAssets {
    constructor(libs, characters) {
        this.libs = libs;
        this.characters = characters;
        this.models = new Map();
        this.loading = null;
    }
    load() {
        if (!this.loading)
            this.loading = this.loadAll();
        return this.loading;
    }
    model(file) {
        return this.models.get(file) || null;
    }
    geometryOf(file) {
        const mesh = this.firstMesh(file);
        return mesh ? mesh.geometry : null;
    }
    firstMesh(file) {
        const model = this.model(file);
        let found = null;
        if (model)
            model.traverse((node) => {
                const mesh = node;
                if (mesh.isMesh && !found)
                    found = mesh;
            });
        return found;
    }
    async loadAll() {
        const loader = new this.libs.GLTFLoader();
        const files = [GlassBridgeAssets.TILE, GlassBridgeAssets.BROKEN_A, GlassBridgeAssets.BROKEN_B, GlassBridgeAssets.PLATFORM, GlassBridgeAssets.COLUMN, GlassBridgeAssets.TORCH, GlassBridgeAssets.BANNER].concat(GlassBridgeAssets.ROCKS);
        const models = files.map((file) => loader.loadAsync(GlassBridgeAssets.DIRECTORY + file).then((gltf) => { this.models.set(file, gltf.scene); }).catch(() => undefined));
        const clips = loader.loadAsync(GlassBridgeAssets.DIRECTORY + GlassBridgeAssets.ANIMATION_FILE).then((gltf) => {
            gltf.animations.forEach((clip) => this.characters.clips.set(clip.name, clip));
        }).catch(() => undefined);
        await Promise.all(models.concat([clips]));
    }
}
GlassBridgeAssets.DIRECTORY = "assets/kaykit/";
GlassBridgeAssets.ANIMATION_FILE = "animations/glassbridge_anims.glb";
GlassBridgeAssets.TILE = "dungeon/floor_tile_small.gltf";
GlassBridgeAssets.BROKEN_A = "dungeon/floor_tile_small_broken_A.gltf";
GlassBridgeAssets.BROKEN_B = "dungeon/floor_tile_small_broken_B.gltf";
GlassBridgeAssets.PLATFORM = "dungeon/floor_tile_large.gltf";
GlassBridgeAssets.COLUMN = "dungeon/column.gltf";
GlassBridgeAssets.TORCH = "dungeon/torch_lit.gltf";
GlassBridgeAssets.BANNER = "dungeon/banner_red.gltf";
GlassBridgeAssets.ROCKS = ["props/Rock_1_A_Color1.gltf", "props/Rock_1_B_Color1.gltf", "props/Rock_1_C_Color1.gltf", "props/Rock_1_D_Color1.gltf"];
class GlassBridgeSubstituteBuilder {
    constructor(libs) {
        this.libs = libs;
    }
}
class GlassBridgeGlassBuilder extends GlassBridgeSubstituteBuilder {
    constructor() {
        super(...arguments);
        this.replaces = "blocks/glass (두께 2 블록, 원본 폴더에만 있음) → dungeon/floor_tile_small 모양에 반투명 재질";
        this.disposables = [];
    }
    tileGeometry(assets) {
        const geometry = assets.geometryOf(GlassBridgeAssets.TILE);
        if (geometry)
            return geometry;
        const box = new this.libs.THREE.BoxGeometry(GlassBridgeLook.TILE_SIZE, GlassBridgeLook.TILE_THICKNESS, GlassBridgeLook.TILE_SIZE);
        this.disposables.push(box);
        return box;
    }
    intactMaterial() {
        const material = new this.libs.THREE.MeshBasicMaterial({ color: GlassBridgeLook.GLASS, transparent: true, opacity: GlassBridgeLook.GLASS_OPACITY, depthWrite: false });
        this.disposables.push(material);
        return material;
    }
    glowMaterial() {
        const material = new this.libs.THREE.MeshBasicMaterial({ color: GlassBridgeLook.GLOW, transparent: true, opacity: 0.55, depthWrite: false });
        this.disposables.push(material);
        return material;
    }
    shardMaterial() {
        const material = new this.libs.THREE.MeshBasicMaterial({ color: GlassBridgeLook.SHARD, transparent: true, opacity: 0.8 });
        this.disposables.push(material);
        return material;
    }
    brokenMaterial(assets) {
        const source = assets.firstMesh(GlassBridgeAssets.BROKEN_A);
        const original = source ? source.material : null;
        const material = new this.libs.THREE.MeshLambertMaterial(original && original.map ? { map: original.map } : { color: GlassBridgeLook.GLASS });
        this.disposables.push(material);
        return material;
    }
    dispose() {
        this.disposables.forEach((entry) => entry.dispose());
    }
}
class GlassBridgeBagBuilder extends GlassBridgeSubstituteBuilder {
    constructor() {
        super(...arguments);
        this.replaces = "fantasy-props/Bag (원본 폴더에만 있음) → 구·원뿔·토러스로 만든 천 자루";
        this.disposables = [];
    }
    build() {
        const THREE = this.libs.THREE;
        const group = new THREE.Group();
        const cloth = new THREE.MeshLambertMaterial({ color: GlassBridgeBagBuilder.BODY });
        const rope = new THREE.MeshLambertMaterial({ color: GlassBridgeBagBuilder.ROPE });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), cloth);
        body.scale.set(1, 0.9, 1);
        body.position.y = 0.45;
        const neck = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.4, 12), cloth);
        neck.position.y = 0.95;
        const tie = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 14), rope);
        tie.rotation.x = Math.PI / 2;
        tie.position.y = 0.78;
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 10), cloth);
        tuft.position.y = 1.2;
        tuft.rotation.z = 0.35;
        [body, neck, tie, tuft].forEach((part) => {
            group.add(part);
            this.disposables.push(part.geometry);
        });
        this.disposables.push(cloth, rope);
        return group;
    }
    dispose() {
        this.disposables.forEach((entry) => entry.dispose());
        this.disposables.length = 0;
    }
}
GlassBridgeBagBuilder.BODY = 0x9A6A3A;
GlassBridgeBagBuilder.ROPE = 0xE0C27A;
class GlassBridgeParticles {
    constructor(libs, world, geometry, material, capacity, gravity) {
        this.world = world;
        this.geometry = geometry;
        this.material = material;
        this.capacity = capacity;
        this.gravity = gravity;
        this.cursor = 0;
        this.mesh = new libs.THREE.InstancedMesh(geometry, material, capacity);
        this.mesh.frustumCulled = false;
        this.dummy = new libs.THREE.Object3D();
        this.position = new Array(capacity * 3).fill(0);
        this.velocity = new Array(capacity * 3).fill(0);
        this.life = new Array(capacity).fill(0);
        this.span = new Array(capacity).fill(1);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        for (let index = 0; index < capacity; index++)
            this.mesh.setMatrixAt(index, this.dummy.matrix);
        world.add(this.mesh);
    }
    burst(x, y, z, count, speed, lift, seconds, random) {
        for (let made = 0; made < count; made++) {
            const slot = this.cursor;
            this.cursor = (this.cursor + 1) % this.capacity;
            const angle = random.between(0, Math.PI * 2);
            const push = random.between(0.3, 1) * speed;
            this.position[slot * 3] = x;
            this.position[slot * 3 + 1] = y;
            this.position[slot * 3 + 2] = z;
            this.velocity[slot * 3] = Math.cos(angle) * push;
            this.velocity[slot * 3 + 1] = random.between(0.4, 1) * lift;
            this.velocity[slot * 3 + 2] = Math.sin(angle) * push;
            this.life[slot] = seconds;
            this.span[slot] = seconds;
        }
    }
    update(dt) {
        let changed = false;
        for (let index = 0; index < this.capacity; index++) {
            if (this.life[index] <= 0)
                continue;
            changed = true;
            this.life[index] -= dt;
            this.velocity[index * 3 + 1] -= this.gravity * dt;
            for (let axis = 0; axis < 3; axis++)
                this.position[index * 3 + axis] += this.velocity[index * 3 + axis] * dt;
            const size = Math.max(0, this.life[index] / this.span[index]);
            this.dummy.position.set(this.position[index * 3], this.position[index * 3 + 1], this.position[index * 3 + 2]);
            this.dummy.rotation.set(this.life[index] * 6, this.life[index] * 4, 0);
            this.dummy.scale.setScalar(size);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(index, this.dummy.matrix);
        }
        if (changed)
            this.mesh.instanceMatrix.needsUpdate = true;
    }
    dispose() {
        this.world.remove(this.mesh);
        this.mesh.dispose();
        this.geometry.dispose();
        this.material.dispose();
    }
}
class GlassBridgeHazardFloor {
}
class GlassBridgeLavaBuilder extends GlassBridgeSubstituteBuilder {
    constructor() {
        super(...arguments);
        this.replaces = "blocks/lava (삼각형 2076개 블록) → 발광 평면 하나";
    }
    texture(page) {
        const THREE = this.libs.THREE;
        const canvas = page.createCanvas(128, 128);
        const context = canvas.getContext("2d");
        context.fillStyle = "#E4501A";
        context.fillRect(0, 0, 128, 128);
        const random = new SeededRandom(8801);
        for (let blob = 0; blob < 70; blob++) {
            context.fillStyle = blob % 3 === 0 ? "#FFC247" : blob % 3 === 1 ? "#B8310F" : "#FF7A2A";
            context.globalAlpha = 0.55;
            context.beginPath();
            context.arc(random.next() * 128, random.next() * 128, 4 + random.next() * 12, 0, Math.PI * 2);
            context.fill();
        }
        context.globalAlpha = 1;
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(10, 12);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
}
class GlassBridgeLavaFloor extends GlassBridgeHazardFloor {
    constructor(libs, page, world, rows) {
        super();
        this.world = world;
        this.random = new RandomRange(new MathRandomSource());
        const THREE = libs.THREE;
        this.texture = new GlassBridgeLavaBuilder(libs).texture(page);
        this.material = new THREE.MeshBasicMaterial({ map: this.texture });
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(190, 230), this.material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.set(0, GlassBridgeLayout.LAVA_Y, GlassBridgeLayout.midZ(rows));
        world.add(this.mesh);
        this.splashes = new GlassBridgeParticles(libs, world, new THREE.BoxGeometry(0.28, 0.28, 0.28), new THREE.MeshBasicMaterial({ color: GlassBridgeLook.LAVA_SPARK }), 60, 14);
    }
    update(dt) {
        this.texture.offset.x += dt * 0.012;
        this.texture.offset.y += dt * 0.02;
        this.splashes.update(dt);
    }
    splash(x, z) {
        this.splashes.burst(x, GlassBridgeLayout.LAVA_Y + 0.3, z, 14, 4, 10, 1.1, this.random);
    }
    dispose() {
        this.splashes.dispose();
        this.world.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
    }
}
class GlassBridgeScenery {
    constructor(libs, page, world, assets, rows) {
        this.world = world;
        this.disposables = [];
        this.buildPlatform(libs, assets, GlassBridgeLayout.QUEUE_START_Z + 4.2, 0);
        this.buildPlatform(libs, assets, GlassBridgeLayout.platformZ(rows) - 2.2, 1);
        this.buildCliffs(libs, rows);
        this.buildRockWall(libs, assets, rows);
        this.buildLavaGlow(libs, page, rows);
        this.placeEach(libs, assets, GlassBridgeAssets.COLUMN, [[-7, 0.2], [7, 0.2], [-7, 11.5], [7, 11.5]], 1.4);
        this.placeEach(libs, assets, GlassBridgeAssets.TORCH, [[-3.5, -0.4], [3.5, -0.4]], 1.6);
        this.placeEach(libs, assets, GlassBridgeAssets.BANNER, [[-5, GlassBridgeLayout.platformZ(rows) - 7.5], [5, GlassBridgeLayout.platformZ(rows) - 7.5]], 1.8);
    }
    dispose() {
        this.disposables.forEach((entry) => entry.dispose());
    }
    buildPlatform(libs, assets, centerZ, seed) {
        const THREE = libs.THREE;
        const source = assets.firstMesh(GlassBridgeAssets.PLATFORM);
        const size = GlassBridgeLook.PLATFORM_TILE;
        const geometry = assets.geometryOf(GlassBridgeAssets.PLATFORM) || new THREE.BoxGeometry(size, 0.15, size);
        const original = source ? source.material : null;
        const material = new THREE.MeshLambertMaterial(original && original.map ? { map: original.map } : { color: 0x59646B });
        const count = GlassBridgeLook.PLATFORM_COLUMNS * GlassBridgeLook.PLATFORM_ROWS;
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        const dummy = new THREE.Object3D();
        for (let column = 0; column < GlassBridgeLook.PLATFORM_COLUMNS; column++) {
            for (let row = 0; row < GlassBridgeLook.PLATFORM_ROWS; row++) {
                dummy.position.set((column - (GlassBridgeLook.PLATFORM_COLUMNS - 1) / 2) * size, 0, centerZ + (row - 1) * size);
                dummy.rotation.y = ((column + row + seed) % 2) * Math.PI;
                dummy.updateMatrix();
                mesh.setMatrixAt(column * GlassBridgeLook.PLATFORM_ROWS + row, dummy.matrix);
            }
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.world.add(mesh);
        this.disposables.push(material, mesh);
        if (!source)
            this.disposables.push(geometry);
    }
    buildCliffs(libs, rows) {
        const THREE = libs.THREE;
        const length = Math.abs(GlassBridgeLayout.platformZ(rows)) + 30;
        const material = new THREE.MeshLambertMaterial({ color: GlassBridgeLook.CLIFF });
        const geometry = new THREE.BoxGeometry(10, 36, length);
        [-1, 1].forEach((side) => {
            const wall = new THREE.Mesh(geometry, material);
            wall.position.set(side * (GlassBridgeLook.CLIFF_X + 8), GlassBridgeLayout.LAVA_Y + 18, GlassBridgeLayout.midZ(rows));
            this.world.add(wall);
        });
        this.disposables.push(material, geometry);
    }
    buildRockWall(libs, assets, rows) {
        const THREE = libs.THREE;
        const random = new SeededRandom(2291);
        const dummy = new THREE.Object3D();
        const length = Math.abs(GlassBridgeLayout.platformZ(rows)) + 30;
        const startZ = GlassBridgeLayout.midZ(rows) - length / 2;
        const files = GlassBridgeAssets.ROCKS.filter((file) => assets.firstMesh(file) !== null);
        if (!files.length)
            return;
        const matrices = files.map(() => []);
        let counter = 0;
        [-1, 1].forEach((side) => {
            for (let layer = 0; layer < GlassBridgeLook.WALL_LAYERS; layer++) {
                for (let z = startZ; z < startZ + length; z += GlassBridgeLook.WALL_STEP) {
                    dummy.position.set(side * (GlassBridgeLook.CLIFF_X + 1.5 + layer * 1.6 + random.next() * 1.6), GlassBridgeLayout.LAVA_Y + 1 + layer * GlassBridgeLook.WALL_LAYER_HEIGHT + random.next() * 1.5, z + random.next() * 2);
                    dummy.rotation.set((random.next() - 0.5) * 0.3, random.next() * Math.PI * 2, (random.next() - 0.5) * 0.3);
                    dummy.scale.setScalar(GlassBridgeLook.WALL_ROCK_MIN + random.next() * GlassBridgeLook.WALL_ROCK_RANGE);
                    dummy.updateMatrix();
                    matrices[counter++ % files.length].push(dummy.matrix.clone());
                }
            }
        });
        files.forEach((file, index) => {
            const source = assets.firstMesh(file);
            const original = source.material;
            const material = new THREE.MeshLambertMaterial({ map: original.map, color: GlassBridgeLook.ROCK_TINT });
            const mesh = new THREE.InstancedMesh(assets.geometryOf(file), material, matrices[index].length);
            matrices[index].forEach((matrix, slot) => mesh.setMatrixAt(slot, matrix));
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
            this.world.add(mesh);
            this.disposables.push(material, mesh);
        });
    }
    buildLavaGlow(libs, page, rows) {
        const THREE = libs.THREE;
        const canvas = page.createCanvas(8, 128);
        const context = canvas.getContext("2d");
        const gradient = context.createLinearGradient(0, 128, 0, 0);
        gradient.addColorStop(0, "rgba(255,120,40,0.85)");
        gradient.addColorStop(0.45, "rgba(255,90,30,0.28)");
        gradient.addColorStop(1, "rgba(255,90,30,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 8, 128);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        const length = Math.abs(GlassBridgeLayout.platformZ(rows)) + 30;
        const geometry = new THREE.PlaneGeometry(length, GlassBridgeLook.GLOW_HEIGHT);
        [-1, 1].forEach((side) => {
            const glow = new THREE.Mesh(geometry, material);
            glow.rotation.y = Math.PI / 2;
            glow.position.set(side * (GlassBridgeLook.CLIFF_X - 0.5), GlassBridgeLayout.LAVA_Y + GlassBridgeLook.GLOW_HEIGHT / 2, GlassBridgeLayout.midZ(rows));
            this.world.add(glow);
        });
        this.disposables.push(texture, material, geometry);
    }
    placeEach(libs, assets, file, spots, scale) {
        const model = assets.model(file);
        if (!model)
            return;
        spots.forEach((spot) => {
            const copy = libs.SkeletonUtils.clone(model);
            copy.position.set(spot[0], 0, spot[1]);
            copy.scale.setScalar(scale);
            this.world.add(copy);
        });
    }
}
class GlassBridgePanelViews {
    constructor(libs, world, assets, rows) {
        this.world = world;
        this.rows = rows;
        this.brokenMeshes = [];
        this.random = new RandomRange(new MathRandomSource());
        const THREE = libs.THREE;
        const count = rows * GlassBridgeRules.SIDE_COUNT;
        this.glass = new GlassBridgeGlassBuilder(libs);
        this.dummy = new THREE.Object3D();
        this.lastStatus = new Array(count).fill("");
        this.intact = new THREE.InstancedMesh(this.glass.tileGeometry(assets), this.glass.intactMaterial(), count);
        this.glowGeometry = new THREE.PlaneGeometry(1.7, 1.7);
        this.glow = new THREE.InstancedMesh(this.glowGeometry, this.glass.glowMaterial(), count);
        this.brokenMaterial = this.glass.brokenMaterial(assets);
        [GlassBridgeAssets.BROKEN_A, GlassBridgeAssets.BROKEN_B].forEach((file) => {
            this.brokenMeshes.push(new THREE.InstancedMesh(assets.geometryOf(file) || this.glass.tileGeometry(assets), this.brokenMaterial, count));
        });
        this.particles = new GlassBridgeParticles(libs, world, new THREE.BoxGeometry(0.26, 0.07, 0.2), this.glass.shardMaterial(), 96, 12);
        [this.intact, this.glow].concat(this.brokenMeshes).forEach((mesh) => {
            mesh.frustumCulled = false;
            world.add(mesh);
        });
        for (let index = 0; index < count; index++)
            this.place(index, "hidden");
        [this.intact, this.glow].concat(this.brokenMeshes).forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
    }
    update(panels, now, dt) {
        this.particles.update(dt);
        if (!panels)
            return;
        let changed = false;
        for (let row = 0; row < this.rows; row++) {
            for (let side = 0; side < GlassBridgeRules.SIDE_COUNT; side++) {
                const index = row * GlassBridgeRules.SIDE_COUNT + side;
                const status = panels.statusAt(row, side, now);
                if (status === this.lastStatus[index])
                    continue;
                if (status === "broken")
                    this.particles.burst(GlassBridgeLayout.sideX(side), 0.2, GlassBridgeLayout.rowZ(row), 16, 3.2, 5, 1.2, this.random);
                this.place(index, status);
                changed = true;
            }
        }
        if (changed)
            [this.intact, this.glow].concat(this.brokenMeshes).forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
    }
    dispose() {
        [this.intact, this.glow].concat(this.brokenMeshes).forEach((mesh) => {
            this.world.remove(mesh);
            mesh.dispose();
        });
        this.particles.dispose();
        this.glass.dispose();
        this.glowGeometry.dispose();
    }
    place(index, status) {
        this.lastStatus[index] = status;
        const row = Math.floor(index / GlassBridgeRules.SIDE_COUNT);
        const side = index % GlassBridgeRules.SIDE_COUNT;
        const x = GlassBridgeLayout.sideX(side), z = GlassBridgeLayout.rowZ(row);
        this.setMatrix(this.intact, index, x, 0, z, status === "broken" ? 0 : 1, 0);
        this.setMatrix(this.glow, index, x, 0.12, z, status === "confirmed" ? 1 : 0, -Math.PI / 2);
        this.brokenMeshes.forEach((mesh, kind) => this.setMatrix(mesh, index, x, 0, z, status === "broken" && (row + side) % 2 === kind ? 1 : 0, 0));
    }
    setMatrix(mesh, index, x, y, z, scale, pitch) {
        this.dummy.position.set(x, y, z);
        this.dummy.rotation.set(pitch, 0, 0);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
    }
}
class GlassBridgePoseClips {
    static of(kind) {
        return GlassBridgePoseClips.BY_KIND[kind];
    }
}
GlassBridgePoseClips.BY_KIND = {
    lottery: { clip: GlassBridgeClips.IDLE_ALT, once: false, speed: 1 },
    draw: { clip: GlassBridgeClips.INTERACT, once: true, speed: 1 },
    queued: { clip: GlassBridgeClips.IDLE, once: false, speed: 1 },
    spawn: { clip: GlassBridgeClips.SPAWN, once: true, speed: 1 },
    walk: { clip: GlassBridgeClips.WALK, once: false, speed: 1.25 },
    run: { clip: GlassBridgeClips.RUN, once: false, speed: 1.5 },
    wait: { clip: GlassBridgeClips.IDLE_ALT, once: false, speed: 1.2 },
    jump: { clip: GlassBridgeClips.JUMP, once: true, speed: GlassBridgeRules.JUMP_PLAYBACK_SPEED },
    fall: { clip: GlassBridgeClips.AIR, once: false, speed: 1 },
    lava: { clip: GlassBridgeClips.FALL_END, once: true, speed: 1 },
    arrived: { clip: GlassBridgeClips.CHEER, once: false, speed: 1 }
};
class GlassBridgeContestantView {
    constructor(kit, factory, clips, world, participant, look, mine, showLabel) {
        this.kit = kit;
        this.factory = factory;
        this.world = world;
        this.placed = false;
        this.shownKind = "lottery";
        const THREE = kit.libs.THREE;
        const color = Palette.slotColor(participant.slot);
        this.group = new THREE.Group();
        this.model = factory.build(look);
        this.group.add(this.model);
        this.ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
        this.ring = new THREE.Mesh(kit.ringGeometry, this.ringMaterial);
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.y = 0.05;
        if (mine)
            this.ring.scale.setScalar(1.5);
        this.label = kit.labels.create(participant.nick + (participant.ai ? " (AI)" : ""), color);
        this.label.position.y = GlassBridgeLook.LABEL_HEIGHT;
        this.label.visible = showLabel;
        this.group.add(this.ring, this.label);
        this.blob = new THREE.Mesh(kit.blobGeometry, kit.blobMaterial);
        this.blob.rotation.x = -Math.PI / 2;
        world.add(this.group, this.blob);
        this.animator = new CharacterAnimator(kit.libs, this.model, clips);
        this.animator.play(GlassBridgeClips.IDLE);
    }
    position() {
        return { x: this.group.position.x, y: this.group.position.y, z: this.group.position.z };
    }
    kind() {
        return this.shownKind;
    }
    update(pose, dt) {
        const smooth = GlassBridgeContestantView.SMOOTH_KINDS.indexOf(pose.kind) >= 0 && GlassBridgeContestantView.SMOOTH_KINDS.indexOf(this.shownKind) >= 0 && this.placed;
        const ratio = smooth ? Math.min(1, dt * GlassBridgeContestantView.SMOOTH_RATE) : 1;
        const current = this.group.position;
        this.group.position.set(current.x + (pose.x - current.x) * ratio, pose.y, current.z + (pose.z - current.z) * ratio);
        this.placed = true;
        this.shownKind = pose.kind;
        this.model.rotation.y = Math.PI + pose.facing;
        this.group.rotation.x = pose.tumble * 1.1;
        this.group.visible = pose.kind !== "lava";
        this.blob.visible = pose.kind !== "lava" && pose.kind !== "fall";
        this.blob.position.set(this.group.position.x, 0.03, this.group.position.z);
        this.ring.visible = pose.kind !== "fall";
        const plan = GlassBridgePoseClips.of(pose.kind);
        this.animator.play(plan.clip, { once: plan.once, speed: plan.speed });
        this.animator.update(dt);
    }
    dispose() {
        this.world.remove(this.group);
        this.world.remove(this.blob);
        this.factory.disposeModel(this.model);
        this.ringMaterial.dispose();
        const labelMaterial = this.label.material;
        if (labelMaterial.map)
            labelMaterial.map.dispose();
        labelMaterial.dispose();
    }
}
GlassBridgeContestantView.SMOOTH_KINDS = ["lottery", "draw", "queued", "spawn"];
GlassBridgeContestantView.SMOOTH_RATE = 7;
class GlassBridgeContestantViews {
    constructor(kit, factory, clips, world, hazard) {
        this.kit = kit;
        this.factory = factory;
        this.clips = clips;
        this.world = world;
        this.hazard = hazard;
        this.views = new Map();
    }
    build(participants, looks, localId, showLabels) {
        this.clear();
        participants.forEach((participant) => {
            const look = looks.get(participant.id) || CharacterLooks.createDefault();
            this.views.set(participant.id, new GlassBridgeContestantView(this.kit, this.factory, this.clips, this.world, participant, look, participant.id === localId, showLabels));
        });
    }
    update(match, now, dt) {
        const timeline = match.timeline();
        this.views.forEach((view, id) => {
            const before = view.kind();
            const pose = match.choreography.poseOf(timeline, id, now);
            if (pose.kind === "lava" && before !== "lava")
                this.hazard.splash(pose.x, pose.z);
            view.update(pose, dt);
        });
    }
    positionOf(id) {
        const view = this.views.get(id);
        return view ? view.position() : null;
    }
    clear() {
        this.views.forEach((view) => view.dispose());
        this.views.clear();
    }
}
class GlassBridgeBagView {
    constructor(libs, page, world, count) {
        this.libs = libs;
        this.page = page;
        this.world = world;
        this.bags = [];
        const THREE = libs.THREE;
        this.builder = new GlassBridgeBagBuilder(libs);
        for (let index = 0; index < count; index++) {
            const group = this.builder.build();
            group.position.set(GlassBridgeLayout.platformSlotX(index, count), 0, GlassBridgeLayout.LOTTERY_BAG_Z);
            const canvas = page.createCanvas(192, 96);
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
            sprite.scale.set(1.5, 0.75, 1);
            sprite.position.set(0, 1.7, 0);
            group.add(sprite);
            this.world.add(group);
            this.bags.push({ group, sprite, canvas, texture, signature: "" });
        }
    }
    groups() {
        return this.bags.map((bag) => bag.group);
    }
    update(match, now) {
        const crossStart = match.crossStartAt();
        const visible = crossStart === null || now < crossStart + GlassBridgeRules.ENTER_MS;
        this.bags.forEach((bag, index) => {
            bag.group.visible = visible;
            const owner = match.lottery.bagOwner(index);
            const draw = owner ? match.lottery.drawOf(owner) : null;
            const participant = owner ? match.participant(owner) : null;
            const signature = draw ? draw.n + "|" + (participant ? participant.nick : "") + "|" + (participant ? participant.slot : 0) : "?";
            if (signature !== bag.signature) {
                bag.signature = signature;
                this.paint(bag.canvas, draw, participant);
                bag.texture.needsUpdate = true;
            }
            const hop = draw ? Math.max(0, 1 - (now - draw.t) / 600) : 0;
            bag.group.position.y = Math.sin(hop * Math.PI) * 0.5;
        });
    }
    dispose() {
        this.bags.forEach((bag) => {
            this.world.remove(bag.group);
            bag.sprite.material.dispose();
            bag.texture.dispose();
        });
        this.builder.dispose();
    }
    paint(canvas, draw, participant) {
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "rgba(12,16,26,.82)";
        context.fillRect(8, 8, 176, 80);
        context.lineWidth = 5;
        context.strokeStyle = draw && participant ? Palette.slotColor(participant.slot) : GlassBridgeLook.ACCENT;
        context.strokeRect(8, 8, 176, 80);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#FFFFFF";
        context.font = '800 44px "Nanum Gothic", "Malgun Gothic", sans-serif';
        if (!draw) {
            context.fillText("?", 96, 50);
            return;
        }
        context.fillText(draw.n + "번", 96, 36);
        context.font = '800 22px "Nanum Gothic", "Malgun Gothic", sans-serif';
        context.fillText(participant ? participant.nick : "", 96, 70);
    }
}
class GlassBridgeCamera {
    constructor(camera, env, rows) {
        this.camera = camera;
        this.env = env;
        this.rows = rows;
        this.eye = { x: 0, y: 0, z: 0 };
        this.focus = { x: 0, y: 0, z: 0 };
        this.placed = false;
        this.sway = 0;
    }
    follow(dt, x, z) {
        const zoom = this.zoom();
        this.approach(dt, GlassBridgeCamera.SIDE * zoom, GlassBridgeCamera.HEIGHT * zoom, z + GlassBridgeCamera.BEHIND * zoom, 0, 0, z - GlassBridgeCamera.LOOK_AHEAD);
    }
    overview(dt) {
        const zoom = this.zoom();
        const mid = GlassBridgeLayout.midZ(this.rows);
        this.approach(dt, GlassBridgeCamera.OVERVIEW_X * zoom, GlassBridgeCamera.OVERVIEW_Y * zoom, GlassBridgeLayout.QUEUE_START_Z + GlassBridgeCamera.OVERVIEW_BACK * zoom, 0, -2, mid - GlassBridgeCamera.OVERVIEW_LOOK_SHIFT);
    }
    lottery(dt) {
        const zoom = this.zoom();
        this.approach(dt, 0, 10 * zoom, 17 * zoom, 0, 0.5, 4.2);
    }
    showcase(dt) {
        this.sway += dt * GlassBridgeCamera.SWAY_SPEED;
        const zoom = this.zoom();
        const mid = GlassBridgeLayout.midZ(this.rows);
        const swing = Math.sin(this.sway) * 6;
        this.approach(dt, (9 + swing * 0.5) * zoom, 18 * zoom, GlassBridgeLayout.QUEUE_START_Z + (16 + swing * 0.5) * zoom, 0, -2, mid - 3);
    }
    zoom() {
        const size = this.env.viewport();
        if (size.width <= 0 || size.height <= 0)
            return 1;
        return Math.pow(MathUtil.clamp(1.6 / (size.width / size.height), 1, 2.1), 0.8);
    }
    approach(dt, x, y, z, lookX, lookY, lookZ) {
        const ratio = this.placed ? Math.min(1, dt * GlassBridgeCamera.SMOOTHING) : 1;
        this.placed = true;
        this.eye.x += (x - this.eye.x) * ratio;
        this.eye.y += (y - this.eye.y) * ratio;
        this.eye.z += (z - this.eye.z) * ratio;
        this.focus.x += (lookX - this.focus.x) * ratio;
        this.focus.y += (lookY - this.focus.y) * ratio;
        this.focus.z += (lookZ - this.focus.z) * ratio;
        this.camera.position.set(this.eye.x, this.eye.y, this.eye.z);
        this.camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
    }
}
GlassBridgeCamera.SIDE = 3.4;
GlassBridgeCamera.BEHIND = 10;
GlassBridgeCamera.HEIGHT = 10.5;
GlassBridgeCamera.LOOK_AHEAD = 4;
GlassBridgeCamera.OVERVIEW_X = 8;
GlassBridgeCamera.OVERVIEW_Y = 19;
GlassBridgeCamera.OVERVIEW_BACK = 17;
GlassBridgeCamera.OVERVIEW_LOOK_SHIFT = 3;
GlassBridgeCamera.SMOOTHING = 4.5;
GlassBridgeCamera.SWAY_SPEED = 0.14;
class GlassBridgeChoiceMarker {
    constructor(libs, world) {
        this.world = world;
        this.marks = [];
        const THREE = libs.THREE;
        this.material = new THREE.MeshBasicMaterial({ color: GlassBridgeLook.MARK, transparent: true, opacity: 0.4, depthWrite: false });
        this.geometry = new THREE.PlaneGeometry(GlassBridgeChoiceMarker.SIZE, GlassBridgeChoiceMarker.SIZE);
        for (let side = 0; side < GlassBridgeRules.SIDE_COUNT; side++) {
            const mark = new THREE.Mesh(this.geometry, this.material);
            mark.rotation.x = -Math.PI / 2;
            mark.position.set(GlassBridgeLayout.sideX(side), GlassBridgeChoiceMarker.HEIGHT, 0);
            mark.visible = false;
            world.add(mark);
            this.marks.push(mark);
        }
    }
    update(choiceWindow, now) {
        const open = choiceWindow !== null && now >= choiceWindow.opensAt && now <= choiceWindow.closesAt;
        this.marks.forEach((mark) => {
            mark.visible = open;
            if (open && choiceWindow)
                mark.position.z = GlassBridgeLayout.rowZ(choiceWindow.row);
        });
        if (open)
            this.material.opacity = 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(now / 1000 * GlassBridgeChoiceMarker.PULSE_SPEED));
    }
    dispose() {
        this.marks.forEach((mark) => this.world.remove(mark));
        this.geometry.dispose();
        this.material.dispose();
    }
}
GlassBridgeChoiceMarker.SIZE = 1.9;
GlassBridgeChoiceMarker.HEIGHT = 0.34;
GlassBridgeChoiceMarker.PULSE_SPEED = 5;
class GlassBridgeStage {
    constructor(libs, page, env, assets, characters, match, looks, localId, showLabels) {
        const THREE = libs.THREE;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(GlassBridgeLook.SKY);
        this.scene.fog = new THREE.Fog(GlassBridgeLook.SKY, GlassBridgeLook.FOG_NEAR, GlassBridgeLook.FOG_FAR);
        this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
        this.cameraRig = new GlassBridgeCamera(this.camera, env, match.rows);
        this.scene.add(new THREE.HemisphereLight(0xBFE8FF, 0x2A1A14, 1.1));
        const sun = new THREE.DirectionalLight(0xFFE9C8, 1.2);
        sun.position.set(-8, 22, 10);
        this.scene.add(sun);
        this.world = new THREE.Group();
        this.scene.add(this.world);
        this.scenery = new GlassBridgeScenery(libs, page, this.world, assets, match.rows);
        this.hazard = new GlassBridgeLavaFloor(libs, page, this.world, match.rows);
        this.panels = new GlassBridgePanelViews(libs, this.world, assets, match.rows);
        this.bags = new GlassBridgeBagView(libs, page, this.world, match.ids().length);
        this.marker = new GlassBridgeChoiceMarker(libs, this.world);
        const kit = new FighterViewKit(libs, page, new NameTagFactory(libs, page));
        this.contestants = new GlassBridgeContestantViews(kit, characters.factory, characters.assets.clips, this.world, this.hazard);
        this.contestants.build(match.participants, looks, localId, showLabels);
    }
    update(match, now, dt) {
        const timeline = match.timeline();
        this.hazard.update(dt);
        this.panels.update(timeline ? timeline.panels : null, now, dt);
        this.bags.update(match, now);
        this.marker.update(timeline ? timeline.openWindow() : null, now);
        this.contestants.update(match, now, dt);
    }
    bagGroups() {
        return this.bags.groups();
    }
    dispose() {
        this.contestants.clear();
        this.marker.dispose();
        this.bags.dispose();
        this.panels.dispose();
        this.hazard.dispose();
        this.scenery.dispose();
        this.scene.traverse((object) => {
            const material = object.material;
            if (Array.isArray(material))
                material.forEach((entry) => entry.dispose());
            else if (material)
                material.dispose();
        });
    }
}
