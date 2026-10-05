"use strict";
class MoleLook {
}
MoleLook.SKY = 0x15122E;
MoleLook.GROUND = 0x2B3A2A;
MoleLook.DIRT = 0x4A3626;
MoleLook.HOLE = 0x1B130D;
MoleLook.MOON = 0xFFF4C8;
MoleLook.EYE_RED = 0xFF2A1A;
MoleLook.GOLD = 0xFFD34D;
MoleLook.GOLD_GLOW = 0x6B4A00;
MoleLook.FLASH_WHITE = 0xF4F1E8;
MoleLook.FLASH_DUST = 0x9A8F7A;
MoleLook.STAR_COUNT = 110;
MoleLook.MOUND_SIZE = 6.1;
MoleLook.HOLE_RADIUS = 0.62;
MoleLook.STONE_BACK = 0.55;
MoleLook.HOLE_FRONT = 0.15;
MoleLook.SKELETON_FRONT = 0.2;
MoleLook.RISE_MS = 220;
MoleLook.SINK_MS = 240;
MoleLook.HIT_LINGER_MS = 230;
MoleLook.SPAWN_CLIP_SPEED = 2;
MoleLook.SINK_DEPTH = 1.9;
MoleLook.SHAKE_S = 0.3;
MoleLook.SHAKE_ROLL = 0.2;
MoleLook.SHAKE_RATE = 38;
MoleLook.FLASH_MS = 320;
MoleLook.SWING_MS = 450;
MoleLook.SWING_SPEED = 3;
MoleLook.CHEER_MS = 1300;
MoleLook.CHEER_SPEED = 1.4;
MoleLook.OUCH_MS = 600;
MoleLook.HAMMER_SCALE = 1.4;
MoleLook.FRESH_OUTCOME_MS = 600;
class MoleBoardPlace {
    constructor(x, z, scale, mine) {
        this.x = x;
        this.z = z;
        this.scale = scale;
        this.mine = mine;
    }
    cellX(cell) {
        return this.x + (cell % MoleRules.COLUMNS - 1) * MoleBoardPlace.SPACING * this.scale;
    }
    cellZ(cell) {
        return this.z + (Math.floor(cell / MoleRules.COLUMNS) - 1) * MoleBoardPlace.SPACING * this.scale;
    }
    keeperX() {
        return this.x - (MoleBoardPlace.HALF + 0.9) * this.scale;
    }
    keeperScale() {
        return this.mine ? 1.3 : this.scale * 1.35;
    }
    signSize() {
        return this.mine ? 4 : Math.max(2.8, this.scale * 3.2);
    }
    signHeight() {
        return this.mine ? 4.4 : 2.2;
    }
}
MoleBoardPlace.SPACING = 1.7;
MoleBoardPlace.HALF = 1.5 * MoleBoardPlace.SPACING + 0.5;
class MoleLayout {
    static place(ids, localId) {
        const places = new Map();
        if (ids.indexOf(localId) < 0) {
            ids.forEach((id, index) => places.set(id, MoleLayout.gridPlace(index)));
            return places;
        }
        places.set(localId, new MoleBoardPlace(0, MoleLayout.MINE_Z, MoleLayout.MINE_SCALE, true));
        const others = ids.filter((id) => id !== localId);
        others.forEach((id, index) => places.set(id, MoleLayout.arcPlace(index, others.length)));
        return places;
    }
    static arcPlace(index, count) {
        const angle = count <= 1 ? 0 : -MoleLayout.ARC_SPAN + 2 * MoleLayout.ARC_SPAN * index / (count - 1);
        const x = MoleLayout.ARC_RADIUS * Math.sin(angle);
        const z = MoleLayout.ARC_BASE_Z - MoleLayout.ARC_DEPTH * Math.cos(angle);
        return new MoleBoardPlace(x, z, MoleLayout.OTHER_SCALE, false);
    }
    static gridPlace(index) {
        const column = index % 3;
        const row = Math.floor(index / 3);
        return new MoleBoardPlace((column - 1) * MoleLayout.GRID_STEP_X, row === 0 ? MoleLayout.GRID_FAR_Z : MoleLayout.GRID_NEAR_Z, MoleLayout.GRID_SCALE, false);
    }
}
MoleLayout.MINE_SCALE = 1.5;
MoleLayout.MINE_Z = 5.2;
MoleLayout.OTHER_SCALE = 0.5;
MoleLayout.ARC_RADIUS = 9.5;
MoleLayout.ARC_BASE_Z = -2.5;
MoleLayout.ARC_DEPTH = 4.5;
MoleLayout.ARC_SPAN = 70 * Math.PI / 180;
MoleLayout.GRID_SCALE = 0.9;
MoleLayout.GRID_STEP_X = 9;
MoleLayout.GRID_FAR_Z = -3;
MoleLayout.GRID_NEAR_Z = 6;
class MoleAssets {
    constructor(libs, characters) {
        this.libs = libs;
        this.characters = characters;
        this.minion = null;
        this.hammerModel = null;
        this.stoneMeshes = [];
        this.pumpkinMesh = null;
        this.fenceMesh = null;
        this.loading = null;
        this.clipLoading = null;
    }
    load() {
        if (!this.loading)
            this.loading = this.loadModels();
        return this.loading;
    }
    loadClips() {
        if (!this.clipLoading) {
            this.clipLoading = Promise.all([
                this.loadClip(MoleAssets.GENERAL_FILE, MoleAssets.SPAWN_CLIP),
                this.loadClip(MoleAssets.TOOLS_FILE, MoleAssets.HAMMER_CLIP),
                this.loadClip(MoleAssets.CHEER_FILE, MoleAssets.CHEER_CLIP)
            ]).then(() => undefined);
        }
        return this.clipLoading;
    }
    minionTemplate() {
        return this.minion;
    }
    hammer() {
        return this.hammerModel;
    }
    stones() {
        return this.stoneMeshes;
    }
    pumpkin() {
        return this.pumpkinMesh;
    }
    fence() {
        return this.fenceMesh;
    }
    async loadModels() {
        const loader = new this.libs.GLTFLoader();
        const directory = MoleAssets.DIRECTORY;
        const minion = loader.loadAsync(directory + MoleAssets.MINION_FILE).then((gltf) => { this.minion = gltf.scene; });
        const hammer = loader.loadAsync(directory + MoleAssets.HAMMER_FILE).then((gltf) => { this.hammerModel = gltf.scene; });
        const stones = MoleAssets.STONE_FILES.map((file, index) => loader.loadAsync(directory + file).then((gltf) => { this.stoneMeshes[index] = MoleAssets.firstMesh(gltf.scene); }));
        const pumpkin = loader.loadAsync(directory + MoleAssets.PUMPKIN_FILE).then((gltf) => { this.pumpkinMesh = MoleAssets.firstMesh(gltf.scene); });
        const fence = loader.loadAsync(directory + MoleAssets.FENCE_FILE).then((gltf) => { this.fenceMesh = MoleAssets.firstMesh(gltf.scene); });
        await Promise.all([minion, hammer, pumpkin, fence, ...stones]);
    }
    async loadClip(file, wanted) {
        try {
            const loader = new this.libs.GLTFLoader();
            const gltf = await loader.loadAsync(MoleAssets.DIRECTORY + file);
            gltf.animations.filter((clip) => clip.name === wanted && !this.characters.clips.has(clip.name)).forEach((clip) => this.characters.clips.set(clip.name, clip));
        }
        catch (error) {
            return;
        }
    }
    static firstMesh(root) {
        let found = null;
        root.traverse((node) => {
            const mesh = node;
            if (mesh.isMesh && !found)
                found = mesh;
        });
        return found;
    }
}
MoleAssets.DIRECTORY = "assets/kaykit/";
MoleAssets.MINION_FILE = "characters/Skeleton_Minion.glb";
MoleAssets.STONE_FILES = ["halloween/gravestone.gltf", "halloween/gravemarker_B.gltf"];
MoleAssets.PUMPKIN_FILE = "halloween/pumpkin_orange_jackolantern.gltf";
MoleAssets.FENCE_FILE = "halloween/fence_seperate.gltf";
MoleAssets.HAMMER_FILE = "props/hammer_A.gltf";
MoleAssets.TOOLS_FILE = "animations/rig_medium_tools.glb";
MoleAssets.GENERAL_FILE = "animations/rig_medium_general.glb";
MoleAssets.CHEER_FILE = "animations/rig_medium_simulation.glb";
MoleAssets.SPAWN_CLIP = "Spawn_Ground";
MoleAssets.HAMMER_CLIP = "Hammering";
MoleAssets.CHEER_CLIP = "Cheering";
class MoleActorParts {
    constructor(libs, assets, clips) {
        this.libs = libs;
        this.assets = assets;
        this.clips = clips;
        const THREE = libs.THREE;
        const minionMesh = MoleAssets.firstMesh(assets.minionTemplate());
        const minionMap = minionMesh.material.map;
        this.goldMaterial = new THREE.MeshLambertMaterial({ map: minionMap, color: MoleLook.GOLD, emissive: MoleLook.GOLD_GLOW });
        const pumpkinMap = assets.pumpkin().material.map;
        this.pumpkinMaterial = new THREE.MeshLambertMaterial({ map: pumpkinMap });
        this.eyeMaterial = new THREE.MeshBasicMaterial({ color: MoleLook.EYE_RED });
        this.eyeGeometry = new THREE.SphereGeometry(0.1, 8, 6);
        this.ringGeometry = new THREE.RingGeometry(0.3, 0.55, 24);
    }
    dispose() {
        this.goldMaterial.dispose();
        this.pumpkinMaterial.dispose();
        this.eyeMaterial.dispose();
        this.eyeGeometry.dispose();
        this.ringGeometry.dispose();
    }
}
class MoleScenery {
    constructor(libs, assets) {
        this.disposables = [];
        const THREE = libs.THREE;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(MoleLook.SKY);
        this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
        this.scene.add(new THREE.HemisphereLight(0x8E9DFF, 0x2A2236, 1.0));
        const moonLight = new THREE.DirectionalLight(0xB9C6FF, 0.9);
        moonLight.position.set(-8, 20, 10);
        this.scene.add(moonLight);
        this.world = new THREE.Group();
        this.scene.add(this.world);
        this.buildGround(THREE);
        this.buildMoon(THREE);
        this.buildStars(THREE);
        this.buildFence(THREE, assets);
    }
    dispose() {
        this.disposables.forEach((entry) => entry.dispose());
    }
    buildGround(THREE) {
        const material = new THREE.MeshLambertMaterial({ color: MoleLook.GROUND });
        const geometry = new THREE.PlaneGeometry(160, 160);
        const ground = new THREE.Mesh(geometry, material);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, -20);
        this.world.add(ground);
        this.disposables.push(material, geometry);
    }
    buildMoon(THREE) {
        const material = new THREE.MeshBasicMaterial({ color: MoleLook.MOON });
        const haloMaterial = new THREE.MeshBasicMaterial({ color: MoleLook.MOON, transparent: true, opacity: 0.16, depthWrite: false });
        const geometry = new THREE.SphereGeometry(2.6, 20, 14);
        const haloGeometry = new THREE.SphereGeometry(4, 20, 14);
        const moon = new THREE.Mesh(geometry, material);
        const halo = new THREE.Mesh(haloGeometry, haloMaterial);
        moon.position.set(-16, 17, -42);
        halo.position.copy(moon.position);
        this.world.add(moon, halo);
        this.disposables.push(material, haloMaterial, geometry, haloGeometry);
    }
    buildStars(THREE) {
        const random = new SeededRandom(20261005);
        const positions = new Float32Array(MoleLook.STAR_COUNT * 3);
        for (let star = 0; star < MoleLook.STAR_COUNT; star++) {
            const angle = random.next() * Math.PI * 2;
            const height = 10 + random.next() * 34;
            positions[star * 3] = Math.cos(angle) * 70;
            positions[star * 3 + 1] = height;
            positions[star * 3 + 2] = -Math.abs(Math.sin(angle)) * 70 - 6;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 0.55, sizeAttenuation: true });
        this.world.add(new THREE.Points(geometry, material));
        this.disposables.push(geometry, material);
    }
    buildFence(THREE, assets) {
        const source = assets.fence();
        const original = source.material;
        const material = new THREE.MeshLambertMaterial({ map: original.map, color: 0xBFB6D8 });
        const spots = [];
        for (let x = -16; x <= 16; x += 4)
            spots.push({ x, z: -13, turn: 0 });
        for (let z = -9; z <= 11; z += 4) {
            spots.push({ x: -17, z, turn: Math.PI / 2 });
            spots.push({ x: 17, z, turn: Math.PI / 2 });
        }
        const mesh = new THREE.InstancedMesh(source.geometry, material, spots.length);
        const dummy = new THREE.Object3D();
        spots.forEach((spot, index) => {
            dummy.position.set(spot.x, 0, spot.z);
            dummy.rotation.set(0, spot.turn, 0);
            dummy.updateMatrix();
            mesh.setMatrixAt(index, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        this.world.add(mesh);
        this.disposables.push(material, mesh);
    }
}
class MoleGraveyard {
    constructor(libs, assets, world, places) {
        this.world = world;
        this.slots = new Map();
        this.shaking = new Map();
        this.meshes = [];
        this.disposables = [];
        const THREE = libs.THREE;
        this.dummy = new THREE.Object3D();
        this.buildMounds(THREE, places);
        this.buildHoles(THREE, places);
        this.buildStones(THREE, assets, places);
    }
    shake(boardIndex, cell) {
        const key = boardIndex * MoleRules.CELL_COUNT + cell;
        if (this.slots.has(key))
            this.shaking.set(key, 0);
    }
    update(dt) {
        this.shaking.forEach((elapsed, key) => {
            const next = elapsed + dt;
            const slot = this.slots.get(key);
            if (next >= MoleLook.SHAKE_S) {
                this.shaking.delete(key);
                this.place(slot, 0);
            }
            else {
                this.shaking.set(key, next);
                this.place(slot, Math.sin(next * MoleLook.SHAKE_RATE) * MoleLook.SHAKE_ROLL * (1 - next / MoleLook.SHAKE_S));
            }
            slot.mesh.instanceMatrix.needsUpdate = true;
        });
    }
    dispose() {
        this.meshes.forEach((mesh) => this.world.remove(mesh));
        this.disposables.forEach((entry) => entry.dispose());
    }
    place(slot, roll) {
        this.dummy.position.set(slot.x, 0, slot.z);
        this.dummy.rotation.set(0, slot.turn, roll);
        this.dummy.scale.setScalar(slot.scale);
        this.dummy.updateMatrix();
        slot.mesh.setMatrixAt(slot.index, this.dummy.matrix);
    }
    addInstanced(THREE, geometry, material, count) {
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        mesh.frustumCulled = false;
        this.world.add(mesh);
        this.meshes.push(mesh);
        return mesh;
    }
    buildMounds(THREE, places) {
        const geometry = new THREE.PlaneGeometry(MoleLook.MOUND_SIZE, MoleLook.MOUND_SIZE);
        geometry.rotateX(-Math.PI / 2);
        const material = new THREE.MeshLambertMaterial({ color: MoleLook.DIRT });
        const mesh = this.addInstanced(THREE, geometry, material, places.length);
        places.forEach((place, index) => {
            this.dummy.position.set(place.x, 0.02, place.z);
            this.dummy.rotation.set(0, 0, 0);
            this.dummy.scale.setScalar(place.scale);
            this.dummy.updateMatrix();
            mesh.setMatrixAt(index, this.dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.disposables.push(geometry, material);
    }
    buildHoles(THREE, places) {
        const geometry = new THREE.CircleGeometry(MoleLook.HOLE_RADIUS, 16);
        geometry.rotateX(-Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({ color: MoleLook.HOLE });
        const mesh = this.addInstanced(THREE, geometry, material, places.length * MoleRules.CELL_COUNT);
        places.forEach((place, boardIndex) => {
            for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++) {
                this.dummy.position.set(place.cellX(cell), 0.04, place.cellZ(cell) + MoleLook.HOLE_FRONT * place.scale);
                this.dummy.rotation.set(0, 0, 0);
                this.dummy.scale.set(place.scale, place.scale, place.scale * 0.8);
                this.dummy.updateMatrix();
                mesh.setMatrixAt(boardIndex * MoleRules.CELL_COUNT + cell, this.dummy.matrix);
            }
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.disposables.push(geometry, material);
    }
    buildStones(THREE, assets, places) {
        const random = new SeededRandom(1031);
        const sources = assets.stones();
        const perModel = sources.map((source, model) => {
            let count = 0;
            places.forEach(() => {
                for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++)
                    if (cell % sources.length === model)
                        count++;
            });
            const original = source.material;
            const material = new THREE.MeshLambertMaterial({ map: original.map });
            this.disposables.push(material);
            return { mesh: this.addInstanced(THREE, source.geometry, material, count), used: 0 };
        });
        places.forEach((place, boardIndex) => {
            for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++) {
                const model = cell % sources.length;
                const target = perModel[model];
                const slot = {
                    mesh: target.mesh,
                    index: target.used++,
                    x: place.cellX(cell),
                    z: place.cellZ(cell) - MoleLook.STONE_BACK * place.scale,
                    scale: MoleGraveyard.STONE_SCALES[model] * MoleGraveyard.FOOT_SCALE * place.scale,
                    turn: (random.next() - 0.5) * 0.25
                };
                this.slots.set(boardIndex * MoleRules.CELL_COUNT + cell, slot);
                this.place(slot, 0);
            }
        });
        perModel.forEach((entry) => { entry.mesh.instanceMatrix.needsUpdate = true; });
    }
}
MoleGraveyard.STONE_SCALES = [0.95, 1.25];
MoleGraveyard.FOOT_SCALE = 0.9;
class MoleMotion {
    static rise(sinceAppearMs) {
        const ratio = MathUtil.clamp(sinceAppearMs / MoleLook.RISE_MS, 0, 1);
        return 1 - (1 - ratio) * (1 - ratio);
    }
    static sink(frame) {
        if (isFinite(frame.sinceCaughtMs))
            return 0;
        return MathUtil.clamp(1 - frame.leftMs / MoleLook.SINK_MS, 0, 1);
    }
    static pop(sinceCaughtMs) {
        if (!isFinite(sinceCaughtMs))
            return 1;
        const half = MoleLook.HIT_LINGER_MS / 2;
        if (sinceCaughtMs < half)
            return 1 + 0.35 * (sinceCaughtMs / half);
        return Math.max(0, 1.35 * (1 - (sinceCaughtMs - half) / half));
    }
}
class MoleActor {
    constructor(parts, world, x, z, boardScale) {
        this.parts = parts;
        this.world = world;
        this.boardScale = boardScale;
        this.group = new parts.libs.THREE.Group();
        this.group.position.set(x, 0, z);
        this.group.visible = false;
        world.add(this.group);
    }
    hide() {
        this.group.visible = false;
    }
    dispose() {
        this.world.remove(this.group);
    }
}
class MoleSkeletonActor extends MoleActor {
    constructor(parts, world, x, z, boardScale) {
        super(parts, world, x, z, boardScale);
        this.meshes = [];
        this.originals = new Map();
        this.golden = false;
        this.model = parts.libs.SkeletonUtils.clone(parts.assets.minionTemplate());
        this.model.scale.setScalar(CharacterModelFactory.SCALE);
        this.model.traverse((node) => {
            const mesh = node;
            node.frustumCulled = false;
            if (mesh.isMesh) {
                this.meshes.push(mesh);
                this.originals.set(mesh, mesh.material);
            }
        });
        this.group.add(this.model);
        this.animator = new CharacterAnimator(parts.libs, this.model, parts.clips);
        this.animator.play(FighterClips.IDLE);
        this.hasSpawnClip = parts.clips.has(MoleAssets.SPAWN_CLIP);
    }
    update(frame) {
        this.group.visible = true;
        this.paint(frame.look.golden);
        const rise = this.hasSpawnClip ? 1 : MoleMotion.rise(frame.sinceAppearMs);
        this.model.position.y = -(1 - rise + MoleMotion.sink(frame)) * MoleLook.SINK_DEPTH;
        this.group.scale.setScalar(this.boardScale * MoleMotion.pop(frame.sinceCaughtMs));
        this.animator.play(...this.clipFor(frame));
        this.animator.update(frame.dt);
    }
    hide() {
        super.hide();
        this.animator.play(FighterClips.IDLE);
    }
    clipFor(frame) {
        if (isFinite(frame.sinceCaughtMs))
            return [FighterClips.HIT, { once: true, speed: 1.8 }];
        if (frame.sinceAppearMs < 1300 / MoleLook.SPAWN_CLIP_SPEED)
            return [MoleAssets.SPAWN_CLIP, { once: true, speed: MoleLook.SPAWN_CLIP_SPEED }];
        return [FighterClips.IDLE, {}];
    }
    paint(golden) {
        if (golden === this.golden)
            return;
        this.golden = golden;
        this.meshes.forEach((mesh) => {
            const original = this.originals.get(mesh);
            mesh.material = golden && mesh.name.indexOf("Eyes") < 0 ? this.parts.goldMaterial : original;
        });
    }
}
class MolePumpkinActor extends MoleActor {
    constructor(parts, world, x, z, boardScale) {
        super(parts, world, x, z, boardScale);
        this.eyes = [];
        const THREE = parts.libs.THREE;
        this.model = new THREE.Group();
        const body = new THREE.Mesh(parts.assets.pumpkin().geometry, parts.pumpkinMaterial);
        body.scale.setScalar(MolePumpkinActor.BASE_SCALE);
        this.model.add(body);
        MolePumpkinActor.EYE_SPOTS.forEach((spot) => {
            const eye = new THREE.Mesh(parts.eyeGeometry, parts.eyeMaterial);
            eye.position.set(spot[0] * MolePumpkinActor.BASE_SCALE, spot[1] * MolePumpkinActor.BASE_SCALE, spot[2] * MolePumpkinActor.BASE_SCALE);
            this.model.add(eye);
            this.eyes.push(eye);
        });
        this.group.add(this.model);
    }
    update(frame) {
        this.group.visible = true;
        const rise = MoleMotion.rise(frame.sinceAppearMs);
        this.model.position.y = -(1 - rise + MoleMotion.sink(frame)) * MolePumpkinActor.SINK_DEPTH;
        this.group.scale.setScalar(this.boardScale * MoleMotion.pop(frame.sinceCaughtMs));
        const glow = 1.15 + Math.sin(frame.sinceAppearMs / 90) * 0.35;
        this.eyes.forEach((eye) => eye.scale.setScalar(glow));
    }
}
MolePumpkinActor.BASE_SCALE = 0.85;
MolePumpkinActor.EYE_SPOTS = [[-0.3, 0.68, 0.62], [0.3, 0.68, 0.62]];
MolePumpkinActor.SINK_DEPTH = 1.1;
class MoleKindLook {
}
class MoleSkeletonLook extends MoleKindLook {
    constructor() {
        super(...arguments);
        this.actorKey = "skeleton";
        this.golden = false;
        this.flashColor = MoleLook.FLASH_WHITE;
    }
    createActor(parts, world, x, z, boardScale) {
        return new MoleSkeletonActor(parts, world, x, z, boardScale);
    }
}
class MoleGoldenLook extends MoleSkeletonLook {
    constructor() {
        super(...arguments);
        this.golden = true;
        this.flashColor = MoleLook.GOLD;
    }
}
class MolePumpkinLook extends MoleKindLook {
    constructor() {
        super(...arguments);
        this.actorKey = "pumpkin";
        this.golden = false;
        this.flashColor = MoleLook.EYE_RED;
    }
    createActor(parts, world, x, z, boardScale) {
        return new MolePumpkinActor(parts, world, x, z, boardScale);
    }
}
class MoleKindLooks {
    static of(kind) {
        return MoleKindLooks.BY_CODE[kind.code];
    }
}
MoleKindLooks.BY_CODE = {
    [MoleKinds.SKELETON.code]: new MoleSkeletonLook(),
    [MoleKinds.GOLDEN.code]: new MoleGoldenLook(),
    [MoleKinds.PUMPKIN.code]: new MolePumpkinLook()
};
class MoleCellFlash {
    constructor(parts, world, x, z, boardScale) {
        this.world = world;
        this.boardScale = boardScale;
        this.age = Infinity;
        const THREE = parts.libs.THREE;
        this.material = new THREE.MeshBasicMaterial({ color: MoleLook.FLASH_WHITE, transparent: true, opacity: 0, depthWrite: false });
        this.mesh = new THREE.Mesh(parts.ringGeometry, this.material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.set(x, 0.09, z);
        this.mesh.visible = false;
        world.add(this.mesh);
    }
    start(color) {
        this.material.color.setHex(color);
        this.age = 0;
    }
    update(dt) {
        if (!isFinite(this.age))
            return;
        this.age += dt * 1000;
        const ratio = this.age / MoleLook.FLASH_MS;
        this.mesh.visible = ratio < 1;
        if (ratio >= 1) {
            this.age = Infinity;
            return;
        }
        this.mesh.scale.setScalar(this.boardScale * (0.6 + ratio * 2.4));
        this.material.opacity = 0.9 * (1 - ratio);
    }
    dispose() {
        this.world.remove(this.mesh);
        this.material.dispose();
    }
}
class MoleCellView {
    constructor(parts, world, place, cell) {
        this.parts = parts;
        this.world = world;
        this.actors = new Map();
        this.flashView = null;
        this.lastSpawn = null;
        this.active = null;
        this.x = place.cellX(cell);
        this.z = place.cellZ(cell) + MoleLook.SKELETON_FRONT * place.scale;
        this.scale = place.scale;
    }
    show(spawn, caughtAt, rel, dt) {
        if (spawn)
            this.lastSpawn = spawn;
        const candidate = spawn || this.lastSpawn;
        const caughtTime = candidate ? caughtAt.get(candidate.index) : undefined;
        const sinceCaught = candidate && caughtTime !== undefined ? rel - caughtTime : Infinity;
        const visible = candidate !== null && rel >= candidate.appearMs && (isFinite(sinceCaught) ? sinceCaught < MoleLook.HIT_LINGER_MS : rel < candidate.disappearMs);
        if (!visible || !candidate) {
            this.release();
        }
        else {
            this.present(candidate, sinceCaught, rel, dt);
        }
        if (this.flashView)
            this.flashView.update(dt);
    }
    flash(color) {
        if (!this.flashView)
            this.flashView = new MoleCellFlash(this.parts, this.world, this.x, this.z, this.scale);
        this.flashView.start(color);
    }
    dispose() {
        this.actors.forEach((actor) => actor.dispose());
        if (this.flashView)
            this.flashView.dispose();
    }
    present(spawn, sinceCaught, rel, dt) {
        const look = MoleKindLooks.of(spawn.kind);
        let actor = this.actors.get(look.actorKey);
        if (!actor) {
            actor = look.createActor(this.parts, this.world, this.x, this.z, this.scale);
            this.actors.set(look.actorKey, actor);
        }
        if (this.active && this.active !== actor)
            this.active.hide();
        this.active = actor;
        actor.update({ look, leftMs: spawn.disappearMs - rel, sinceAppearMs: rel - spawn.appearMs, sinceCaughtMs: sinceCaught, dt });
    }
    release() {
        if (!this.active)
            return;
        this.active.hide();
        this.active = null;
    }
}
class MoleBoardSign {
    constructor(libs, page, world, participant, place) {
        this.libs = libs;
        this.world = world;
        this.participant = participant;
        this.signature = "";
        const THREE = libs.THREE;
        const canvas = page.createCanvas(MoleBoardSign.WIDTH, MoleBoardSign.HEIGHT);
        this.context = canvas.getContext("2d");
        this.texture = new THREE.CanvasTexture(canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
        const width = place.signSize();
        this.sprite.scale.set(width, width * MoleBoardSign.HEIGHT / MoleBoardSign.WIDTH, 1);
        this.sprite.position.set(place.x, place.signHeight(), place.z - 1.9 * place.scale);
        world.add(this.sprite);
    }
    update(tally, departed) {
        const signature = tally.score + "|" + tally.combo + "|" + departed;
        if (signature === this.signature)
            return;
        this.signature = signature;
        this.draw(tally, departed);
        this.texture.needsUpdate = true;
    }
    dispose() {
        this.world.remove(this.sprite);
        this.texture.dispose();
        this.sprite.material.dispose();
    }
    draw(tally, departed) {
        const context = this.context;
        const width = MoleBoardSign.WIDTH, height = MoleBoardSign.HEIGHT;
        context.clearRect(0, 0, width, height);
        context.fillStyle = Palette.LABEL_BACKGROUND;
        context.strokeStyle = Palette.slotColor(this.participant.slot);
        context.lineWidth = 6;
        context.beginPath();
        context.rect(5, 5, width - 10, height - 10);
        context.fill();
        context.stroke();
        context.textBaseline = "middle";
        context.fillStyle = "#FFFFFF";
        context.textAlign = "left";
        context.font = '800 34px "Nanum Gothic", "Malgun Gothic", sans-serif';
        context.fillText(this.participant.nick + (this.participant.ai ? " (AI)" : "") + (departed ? " (나감)" : ""), 22, 34, width - 44);
        context.font = '800 38px "Nanum Gothic", "Malgun Gothic", sans-serif';
        context.fillStyle = "#FFD9A8";
        context.fillText(tally.score + "점", 22, 80);
        if (tally.combo > 1) {
            context.textAlign = "right";
            context.fillStyle = tally.multiplier() > 1 ? "#FFD34D" : "#DCE6D6";
            context.font = '800 30px "Nanum Gothic", "Malgun Gothic", sans-serif';
            context.fillText(tally.combo + "콤보" + (tally.multiplier() > 1 ? " ×" + tally.multiplier() : ""), width - 22, 80);
        }
    }
}
MoleBoardSign.WIDTH = 384;
MoleBoardSign.HEIGHT = 112;
class MoleBoardView {
    constructor(parts, world, graveyard, boardIndex, place, schedule, sign) {
        this.graveyard = graveyard;
        this.boardIndex = boardIndex;
        this.schedule = schedule;
        this.sign = sign;
        this.cells = [];
        this.handled = new Set();
        this.caughtAt = new Map();
        this.lastTally = null;
        for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++)
            this.cells.push(new MoleCellView(parts, world, place, cell));
    }
    update(rel, tally, departed, dt) {
        if (tally !== this.lastTally) {
            this.lastTally = tally;
            this.caughtAt = new Map();
            tally.outcomes.forEach((outcome) => {
                if (outcome.kind === "hit" && outcome.spawn)
                    this.caughtAt.set(outcome.spawn.index, outcome.t);
            });
        }
        const fresh = this.freshOutcomes(rel, tally);
        fresh.forEach((outcome) => this.react(outcome));
        this.cells.forEach((cell, index) => {
            cell.show(this.schedule.spawnAt(index, rel), this.caughtAt, rel, dt);
        });
        this.sign.update(tally, departed);
        return fresh;
    }
    dispose() {
        this.cells.forEach((cell) => cell.dispose());
        this.sign.dispose();
    }
    freshOutcomes(rel, tally) {
        const fresh = [];
        tally.outcomes.forEach((outcome) => {
            const key = outcome.t + ":" + outcome.cell + ":" + (outcome.spawn ? outcome.spawn.index : -1);
            if (this.handled.has(key))
                return;
            this.handled.add(key);
            if (rel - outcome.t < MoleLook.FRESH_OUTCOME_MS)
                fresh.push(outcome);
        });
        return fresh;
    }
    react(outcome) {
        const cell = this.cells[outcome.cell];
        if (!cell)
            return;
        if (outcome.kind === "miss") {
            this.graveyard.shake(this.boardIndex, outcome.cell);
            cell.flash(MoleLook.FLASH_DUST);
        }
        else if (outcome.spawn) {
            cell.flash(MoleKindLooks.of(outcome.spawn.kind).flashColor);
        }
    }
}
class MoleHammerer {
    constructor(libs, factory, world, clips, assets, look, place) {
        this.libs = libs;
        this.factory = factory;
        this.world = world;
        this.pose = null;
        this.restart = false;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.model = factory.build(look);
        this.model.rotation.y = Math.PI / 2;
        this.group.add(this.model);
        this.group.position.set(place.keeperX(), 0, place.z);
        this.group.scale.setScalar(place.keeperScale());
        this.hammer = assets.hammer().clone(true);
        const slot = this.model.getObjectByName("handslotr") || this.model.getObjectByName("handslot.r");
        if (slot) {
            this.hammer.rotation.set(-Math.PI / 2, 0, 0);
            this.hammer.scale.setScalar(MoleLook.HAMMER_SCALE);
            slot.add(this.hammer);
        }
        world.add(this.group);
        this.animator = new CharacterAnimator(libs, this.model, clips);
        this.animator.play(FighterClips.IDLE);
    }
    react(outcomes, nowMs) {
        outcomes.forEach((outcome) => this.reactTo(outcome, nowMs));
    }
    update(dt, nowMs) {
        const pose = this.pose && nowMs < this.pose.untilMs ? this.pose : null;
        if (this.restart) {
            this.animator.play(FighterClips.IDLE);
            this.restart = false;
        }
        if (pose)
            this.animator.play(pose.clip, { once: true, speed: pose.speed });
        else
            this.animator.play(FighterClips.IDLE);
        this.animator.update(dt);
    }
    dispose() {
        this.world.remove(this.group);
        this.factory.disposeModel(this.model);
    }
    reactTo(outcome, nowMs) {
        if (outcome.kind === "hit" && outcome.points < 0) {
            this.start(FighterClips.HIT, 1.5, MoleLook.OUCH_MS, nowMs);
        }
        else if (this.isCheerCombo(outcome)) {
            this.start(MoleAssets.CHEER_CLIP, MoleLook.CHEER_SPEED, MoleLook.CHEER_MS, nowMs);
        }
        else {
            this.start(MoleAssets.HAMMER_CLIP, MoleLook.SWING_SPEED, MoleLook.SWING_MS, nowMs);
        }
    }
    isCheerCombo(outcome) {
        if (outcome.kind !== "hit" || outcome.points <= 0)
            return false;
        return outcome.combo === MoleRules.COMBO_DOUBLE || outcome.combo === MoleRules.COMBO_TRIPLE || (outcome.combo > MoleRules.COMBO_TRIPLE && outcome.combo % 10 === 0);
    }
    start(clip, speed, durationMs, nowMs) {
        this.pose = { clip, speed, untilMs: nowMs + durationMs };
        this.restart = true;
    }
}
class MoleCamera {
    constructor(camera, env) {
        this.camera = camera;
        this.env = env;
        this.eye = { x: 0, y: 0, z: 0 };
        this.focus = { x: 0, z: 0 };
        this.placed = false;
        this.sway = 0;
    }
    player(dt) {
        const zoom = this.zoom();
        this.approach(dt, 0, MoleCamera.EYE_Y * zoom, MoleCamera.EYE_Z * zoom, MoleCamera.LOOK_Z);
    }
    overview(dt) {
        const zoom = this.zoom();
        this.approach(dt, 0, MoleCamera.OVERVIEW_Y * zoom, MoleCamera.OVERVIEW_Z * zoom, MoleCamera.OVERVIEW_LOOK_Z);
    }
    showcase(dt) {
        this.sway += dt * MoleCamera.SHOWCASE_SPEED;
        const angle = Math.sin(this.sway) * MoleCamera.SHOWCASE_SWAY;
        const zoom = this.zoom();
        const radius = MoleCamera.SHOWCASE_RADIUS * zoom;
        this.approach(dt, Math.sin(angle) * radius, 13 * zoom, MoleCamera.OVERVIEW_LOOK_Z + Math.cos(angle) * radius, MoleCamera.OVERVIEW_LOOK_Z);
    }
    zoom() {
        const size = this.env.viewport();
        if (size.width <= 0 || size.height <= 0)
            return 1;
        return Math.pow(MathUtil.clamp(1.6 / (size.width / size.height), 1, 2.1), 0.8);
    }
    approach(dt, x, y, z, lookZ) {
        const ratio = this.placed ? Math.min(1, dt * MoleCamera.SMOOTHING) : 1;
        this.placed = true;
        this.eye.x += (x - this.eye.x) * ratio;
        this.eye.y += (y - this.eye.y) * ratio;
        this.eye.z += (z - this.eye.z) * ratio;
        this.focus.x += (0 - this.focus.x) * ratio;
        this.focus.z += (lookZ - this.focus.z) * ratio;
        this.camera.position.set(this.eye.x, this.eye.y, this.eye.z);
        this.camera.lookAt(this.focus.x, 0, this.focus.z);
    }
}
MoleCamera.EYE_Y = 12.5;
MoleCamera.EYE_Z = 17.5;
MoleCamera.LOOK_Z = 1.5;
MoleCamera.OVERVIEW_Y = 17;
MoleCamera.OVERVIEW_Z = 22;
MoleCamera.OVERVIEW_LOOK_Z = 0.5;
MoleCamera.SHOWCASE_SWAY = 0.3;
MoleCamera.SHOWCASE_SPEED = 0.12;
MoleCamera.SHOWCASE_RADIUS = 30;
MoleCamera.SMOOTHING = 5;
class MoleStage {
    constructor(libs, page, env, assets, characters, match, looks, localId) {
        this.match = match;
        this.localId = localId;
        this.boards = [];
        this.hammerers = [];
        this.scenery = new MoleScenery(libs, assets);
        this.camera = new MoleCamera(this.scenery.camera, env);
        this.parts = new MoleActorParts(libs, assets, characters.assets.clips);
        const ids = match.contestants().map((contestant) => contestant.id);
        this.placeById = MoleLayout.place(ids, localId);
        const places = ids.map((id) => this.placeById.get(id));
        this.graveyard = new MoleGraveyard(libs, assets, this.scenery.world, places);
        match.contestants().forEach((contestant, index) => {
            const place = places[index];
            const sign = new MoleBoardSign(libs, page, this.scenery.world, contestant.participant, place);
            this.boards.push(new MoleBoardView(this.parts, this.scenery.world, this.graveyard, index, place, match.schedule, sign));
            this.hammerers.push(new MoleHammerer(libs, characters.factory, this.scenery.world, characters.assets.clips, assets, looks.get(contestant.id) || CharacterLooks.createDefault(), place));
        });
    }
    localPlace() {
        const place = this.placeById.get(this.localId);
        return place && place.mine ? place : null;
    }
    update(rel, dt) {
        const contestants = this.match.contestants();
        const lines = this.match.lines(rel);
        let localFresh = [];
        contestants.forEach((contestant, index) => {
            const fresh = this.boards[index].update(rel, lines[index].tally, contestant.hasDeparted(), dt);
            this.hammerers[index].react(fresh, rel);
            this.hammerers[index].update(dt, rel);
            if (contestant.id === this.localId)
                localFresh = fresh;
        });
        this.graveyard.update(dt);
        return localFresh;
    }
    dispose() {
        this.boards.forEach((board) => board.dispose());
        this.hammerers.forEach((hammerer) => hammerer.dispose());
        this.graveyard.dispose();
        this.parts.dispose();
        this.scenery.dispose();
    }
}
class MoleBoardPicker {
    constructor(libs, canvas, camera, world, place, onCell) {
        this.libs = libs;
        this.canvas = canvas;
        this.camera = camera;
        this.world = world;
        this.onCell = onCell;
        this.boxes = [];
        this.handler = (event) => this.pick(event);
        const THREE = libs.THREE;
        this.raycaster = new THREE.Raycaster();
        this.material = new THREE.MeshBasicMaterial({ visible: false });
        this.geometry = new THREE.BoxGeometry(1.8, 2.4, 1.8);
        for (let cell = 0; cell < MoleRules.CELL_COUNT; cell++) {
            const box = new THREE.Mesh(this.geometry, this.material);
            box.scale.setScalar(place.scale);
            box.position.set(place.cellX(cell), 1.2 * place.scale, place.cellZ(cell));
            world.add(box);
            this.boxes.push(box);
        }
        canvas.addEventListener("pointerdown", this.handler);
    }
    dispose() {
        this.canvas.removeEventListener("pointerdown", this.handler);
        this.boxes.forEach((box) => this.world.remove(box));
        this.material.dispose();
        this.geometry.dispose();
    }
    pick(event) {
        const bounds = this.canvas.getBoundingClientRect();
        const ndc = new this.libs.THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
        this.raycaster.setFromCamera(ndc, this.camera);
        const hits = this.raycaster.intersectObjects(this.boxes, false);
        if (hits.length === 0)
            return;
        event.preventDefault();
        this.onCell(this.boxes.indexOf(hits[0].object));
    }
}
class MoleScreenFlash {
    constructor(page, env) {
        this.page = page;
        this.env = env;
        this.element = page.byId("moleFlash");
    }
    pulse() {
        this.page.show(this.element, true);
        this.env.afterMs(MoleScreenFlash.SHOW_MS, () => this.page.show(this.element, false));
    }
    hide() {
        this.page.show(this.element, false);
    }
}
MoleScreenFlash.SHOW_MS = 220;
