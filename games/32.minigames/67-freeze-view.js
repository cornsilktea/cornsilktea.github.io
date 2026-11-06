"use strict";
class FreezeLook {
}
FreezeLook.SKY = 0xA9D8F2;
FreezeLook.GRASS = 0x78B455;
FreezeLook.LANE_COLORS = [0xC79A66, 0xD1AC7B];
FreezeLook.LINE = 0xF4F1E8;
FreezeLook.POST = 0x6B4A36;
FreezeLook.EYE = 0xFF2A1A;
FreezeLook.WARN_FAN = 0xFFB020;
FreezeLook.LOOK_FAN = 0xFF2A1A;
FreezeLook.WATCHER_Z = -(FreezeRules.TRACK_LENGTH + 5);
FreezeLook.WATCHER_SCALE = 2.5;
FreezeLook.WATCHER_EYE_HEIGHT = 3.3;
FreezeLook.RUNNER_HEAD_HEIGHT = 1.5;
FreezeLook.TRACK_WIDTH = FreezeRules.LANE_COUNT * FreezeRules.LANE_WIDTH;
FreezeLook.TREE_ZONE_LENGTH = 24;
FreezeLook.TREE_COUNT = 96;
FreezeLook.TREE_NEAR_EDGE = 13;
FreezeLook.TREE_FAR_EDGE = 30;
FreezeLook.LASER_MS = 450;
FreezeLook.ALERT_MS = 900;
FreezeLook.FAN_RADIUS = FreezeRules.TRACK_LENGTH + 14;
FreezeLook.FAN_HALF_ANGLE = 0.42;
class FreezeAssets {
    constructor(libs, characters) {
        this.libs = libs;
        this.characters = characters;
        this.skeletonTemplate = null;
        this.flagTemplate = null;
        this.treeMeshes = [];
        this.loading = null;
        this.cheerLoading = null;
    }
    load() {
        if (!this.loading)
            this.loading = this.loadAll();
        return this.loading;
    }
    loadCheer() {
        if (!this.cheerLoading)
            this.cheerLoading = this.loadCheerClip().catch(() => undefined);
        return this.cheerLoading;
    }
    skeleton() {
        return this.skeletonTemplate;
    }
    flag() {
        return this.flagTemplate;
    }
    trees() {
        return this.treeMeshes;
    }
    async loadAll() {
        const loader = new this.libs.GLTFLoader();
        const directory = FreezeAssets.DIRECTORY;
        const skeleton = loader.loadAsync(directory + FreezeAssets.SKELETON_FILE).then((gltf) => { this.skeletonTemplate = gltf.scene; });
        const flag = loader.loadAsync(directory + FreezeAssets.FLAG_FILE).then((gltf) => { this.flagTemplate = gltf.scene; });
        const trees = FreezeAssets.TREE_FILES.map((file, index) => loader.loadAsync(directory + file).then((gltf) => {
            gltf.scene.traverse((node) => {
                const mesh = node;
                if (mesh.isMesh && !this.treeMeshes[index])
                    this.treeMeshes[index] = mesh;
            });
        }));
        await Promise.all([skeleton, flag, ...trees]);
    }
    async loadCheerClip() {
        const loader = new this.libs.GLTFLoader();
        const gltf = await loader.loadAsync(FreezeAssets.DIRECTORY + FreezeAssets.CHEER_FILE);
        gltf.animations.filter((clip) => clip.name === FreezeAssets.CHEER_CLIP).forEach((clip) => this.characters.clips.set(clip.name, clip));
    }
}
FreezeAssets.DIRECTORY = "assets/kaykit/";
FreezeAssets.SKELETON_FILE = "characters/Skeleton_Warrior.glb";
FreezeAssets.FLAG_FILE = "boardgame/flag_A_red.gltf";
FreezeAssets.TREE_FILES = ["props/Tree_1_A_Color1.gltf", "props/Tree_2_B_Color1.gltf", "props/Tree_3_A_Color1.gltf", "props/Tree_4_B_Color1.gltf"];
FreezeAssets.CHEER_FILE = "animations/rig_medium_simulation.glb";
FreezeAssets.CHEER_CLIP = "Cheering";
class FreezeTrees {
    constructor(libs, world, sources) {
        this.meshes = [];
        this.materials = [];
        const THREE = libs.THREE;
        const random = new SeededRandom(20261005);
        const dummy = new THREE.Object3D();
        const zoneTop = 12;
        const zoneCount = Math.ceil((zoneTop + FreezeRules.TRACK_LENGTH + 32) / FreezeLook.TREE_ZONE_LENGTH);
        const placements = new Map();
        for (let tree = 0; tree < FreezeLook.TREE_COUNT; tree++) {
            const type = tree % sources.length;
            const side = tree % 2 === 0 ? -1 : 1;
            const x = side * (FreezeLook.TREE_NEAR_EDGE + random.next() * (FreezeLook.TREE_FAR_EDGE - FreezeLook.TREE_NEAR_EDGE));
            const z = zoneTop - random.next() * (zoneTop + FreezeRules.TRACK_LENGTH + 32);
            const zone = Math.min(zoneCount - 1, Math.floor((zoneTop - z) / FreezeLook.TREE_ZONE_LENGTH));
            const key = type + "|" + zone;
            const list = placements.get(key) || [];
            list.push({ x, z, scale: 0.9 + random.next() * 0.6, turn: random.next() * Math.PI * 2 });
            placements.set(key, list);
        }
        sources.forEach((source, type) => {
            const original = source.material;
            const material = new THREE.MeshLambertMaterial({ map: original.map });
            this.materials.push(material);
            for (let zone = 0; zone < zoneCount; zone++) {
                const list = placements.get(type + "|" + zone);
                if (!list)
                    continue;
                const mesh = new THREE.InstancedMesh(source.geometry, material, list.length);
                list.forEach((placement, index) => {
                    dummy.position.set(placement.x, 0, placement.z);
                    dummy.rotation.set(0, placement.turn, 0);
                    dummy.scale.setScalar(placement.scale);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(index, dummy.matrix);
                });
                mesh.instanceMatrix.needsUpdate = true;
                mesh.computeBoundingSphere();
                world.add(mesh);
                this.meshes.push(mesh);
            }
        });
    }
    dispose(world) {
        this.meshes.forEach((mesh) => {
            world.remove(mesh);
            mesh.dispose();
        });
        this.materials.forEach((material) => material.dispose());
    }
}
class FreezeFinishGate {
    constructor(libs, page, assets, world) {
        this.world = world;
        this.disposables = [];
        const THREE = libs.THREE;
        const z = -FreezeRules.TRACK_LENGTH;
        const half = FreezeLook.TRACK_WIDTH / 2 + 0.7;
        const postMaterial = new THREE.MeshLambertMaterial({ color: FreezeLook.POST });
        const poleGeometry = new THREE.BoxGeometry(FreezeFinishGate.POLE_SIZE, FreezeFinishGate.POLE_HEIGHT, FreezeFinishGate.POLE_SIZE);
        const barGeometry = new THREE.BoxGeometry(half * 2 + FreezeFinishGate.POLE_SIZE, 0.5, 0.5);
        [-half, half].forEach((x) => {
            const pole = new THREE.Mesh(poleGeometry, postMaterial);
            pole.position.set(x, FreezeFinishGate.POLE_HEIGHT / 2, z);
            world.add(pole);
            const flag = this.cloneFlag(libs, assets);
            flag.position.set(x, FreezeFinishGate.POLE_HEIGHT, z);
            world.add(flag);
        });
        const bar = new THREE.Mesh(barGeometry, postMaterial);
        bar.position.set(0, FreezeFinishGate.POLE_HEIGHT, z);
        world.add(bar);
        const sign = this.buildSign(libs, page);
        sign.position.set(0, FreezeFinishGate.POLE_HEIGHT + 0.95, z + 0.3);
        world.add(sign);
        this.disposables.push(postMaterial, poleGeometry, barGeometry);
    }
    dispose() {
        this.disposables.forEach((entry) => entry.dispose());
    }
    cloneFlag(libs, assets) {
        const flag = libs.SkeletonUtils.clone(assets.flag());
        flag.scale.setScalar(2.2);
        return flag;
    }
    buildSign(libs, page) {
        const THREE = libs.THREE;
        const canvas = page.createCanvas(512, 96);
        const context = canvas.getContext("2d");
        context.fillStyle = "#FFF6DC";
        context.fillRect(0, 0, 512, 96);
        context.lineWidth = 8;
        context.strokeStyle = "#D97B4F";
        context.strokeRect(4, 4, 504, 88);
        context.font = '800 56px "Nanum Gothic", "Malgun Gothic", sans-serif';
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#3B2A1E";
        context.fillText("결승선", 256, 52);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const geometry = new THREE.PlaneGeometry(6, 1.1);
        this.disposables.push(texture, material, geometry);
        return new THREE.Mesh(geometry, material);
    }
}
FreezeFinishGate.POLE_HEIGHT = 4.2;
FreezeFinishGate.POLE_SIZE = 0.35;
class FreezeScene {
    constructor(libs, page, assets) {
        const THREE = libs.THREE;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(FreezeLook.SKY);
        this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
        this.scene.add(new THREE.HemisphereLight(0xFFFFFF, 0x6F8F5A, 1.15));
        const sun = new THREE.DirectionalLight(0xFFF3D6, 1.35);
        sun.position.set(-10, 24, 12);
        this.scene.add(sun);
        this.world = new THREE.Group();
        this.scene.add(this.world);
        this.buildGround(THREE);
        this.buildLanes(THREE);
        this.buildFinishLine(THREE, page);
        this.gate = new FreezeFinishGate(libs, page, assets, this.world);
        this.trees = new FreezeTrees(libs, this.world, assets.trees());
    }
    releaseMaterials() {
        this.trees.dispose(this.world);
        this.gate.dispose();
        this.scene.traverse((object) => {
            const material = object.material;
            if (Array.isArray(material))
                material.forEach((entry) => entry.dispose());
            else if (material)
                material.dispose();
        });
    }
    buildGround(THREE) {
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 340), new THREE.MeshLambertMaterial({ color: FreezeLook.GRASS }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, -FreezeRules.TRACK_LENGTH / 2 - 20);
        this.world.add(ground);
    }
    buildLanes(THREE) {
        const length = FreezeRules.TRACK_LENGTH + 10;
        const centerZ = -FreezeRules.TRACK_LENGTH / 2 + 3;
        const laneGeometry = new THREE.PlaneGeometry(FreezeRules.LANE_WIDTH, length);
        const materials = FreezeLook.LANE_COLORS.map((color) => new THREE.MeshLambertMaterial({ color }));
        for (let lane = 0; lane < FreezeRules.LANE_COUNT; lane++) {
            const mesh = new THREE.Mesh(laneGeometry, materials[lane % materials.length]);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(FreezeLanes.xOf(lane), 0.02, centerZ);
            this.world.add(mesh);
        }
        const lineMaterial = new THREE.MeshBasicMaterial({ color: FreezeLook.LINE });
        const lineGeometry = new THREE.PlaneGeometry(0.12, length);
        for (let edge = 0; edge <= FreezeRules.LANE_COUNT; edge++) {
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            line.rotation.x = -Math.PI / 2;
            line.position.set((edge - FreezeRules.LANE_COUNT / 2) * FreezeRules.LANE_WIDTH, 0.03, centerZ);
            this.world.add(line);
        }
        const start = new THREE.Mesh(new THREE.PlaneGeometry(FreezeLook.TRACK_WIDTH, 0.5), lineMaterial);
        start.rotation.x = -Math.PI / 2;
        start.position.set(0, 0.035, 0);
        this.world.add(start);
    }
    buildFinishLine(THREE, page) {
        const columns = 30;
        const canvas = page.createCanvas(columns * 4, 8);
        const context = canvas.getContext("2d");
        for (let column = 0; column < columns; column++) {
            for (let row = 0; row < 2; row++) {
                context.fillStyle = (column + row) % 2 === 0 ? "#FFFFFF" : "#1B1B24";
                context.fillRect(column * 4, row * 4, 4, 4);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        const finish = new THREE.Mesh(new THREE.PlaneGeometry(FreezeLook.TRACK_WIDTH, 0.9), new THREE.MeshBasicMaterial({ map: texture }));
        finish.rotation.x = -Math.PI / 2;
        finish.position.set(0, 0.04, -FreezeRules.TRACK_LENGTH);
        this.world.add(finish);
    }
}
class FreezeCamera {
    constructor(camera, env) {
        this.camera = camera;
        this.env = env;
        this.eye = { x: 0, y: 0, z: 0 };
        this.focus = { x: 0, z: 0 };
        this.placed = false;
        this.sway = 0;
    }
    follow(dt, dist, laneX) {
        const zoom = this.zoom();
        const x = laneX * FreezeCamera.SIDE_FOLLOW;
        this.approach(dt, x, FreezeCamera.HEIGHT * zoom, -dist + FreezeCamera.BEHIND * zoom, x, -dist - FreezeCamera.LOOK_AHEAD * zoom);
    }
    overview(dt) {
        const zoom = this.zoom();
        this.approach(dt, 0, FreezeCamera.OVERVIEW_HEIGHT * zoom, FreezeCamera.OVERVIEW_Z * zoom, 0, FreezeCamera.OVERVIEW_LOOK_Z);
    }
    showcase(dt) {
        this.sway += dt * FreezeCamera.SHOWCASE_SPEED;
        const angle = Math.sin(this.sway) * FreezeCamera.SHOWCASE_SWAY;
        const zoom = this.zoom();
        const radius = FreezeCamera.SHOWCASE_RADIUS * zoom;
        this.approach(dt, Math.sin(angle) * radius, FreezeCamera.SHOWCASE_HEIGHT * zoom, FreezeCamera.SHOWCASE_LOOK_Z + Math.cos(angle) * radius, 0, FreezeCamera.SHOWCASE_LOOK_Z);
    }
    zoom() {
        const size = this.env.viewport();
        return Math.pow(MathUtil.clamp(1.6 / (size.width / size.height), 1, 2.1), 0.8);
    }
    approach(dt, x, y, z, lookX, lookZ) {
        const ratio = this.placed ? Math.min(1, dt * FreezeCamera.SMOOTHING) : 1;
        this.placed = true;
        this.eye.x += (x - this.eye.x) * ratio;
        this.eye.y += (y - this.eye.y) * ratio;
        this.eye.z += (z - this.eye.z) * ratio;
        this.focus.x += (lookX - this.focus.x) * ratio;
        this.focus.z += (lookZ - this.focus.z) * ratio;
        this.camera.position.set(this.eye.x, this.eye.y, this.eye.z);
        this.camera.lookAt(this.focus.x, 0, this.focus.z);
    }
}
FreezeCamera.BEHIND = 22;
FreezeCamera.HEIGHT = 14;
FreezeCamera.LOOK_AHEAD = 30;
FreezeCamera.OVERVIEW_Z = 40;
FreezeCamera.OVERVIEW_HEIGHT = 20;
FreezeCamera.OVERVIEW_LOOK_Z = -30;
FreezeCamera.SIDE_FOLLOW = 0.35;
FreezeCamera.SMOOTHING = 5;
FreezeCamera.SHOWCASE_SWAY = 0.9;
FreezeCamera.SHOWCASE_SPEED = 0.12;
FreezeCamera.SHOWCASE_RADIUS = 30;
FreezeCamera.SHOWCASE_HEIGHT = 12;
FreezeCamera.SHOWCASE_LOOK_Z = -34;
class FreezeEffectsKit {
    constructor(libs, page) {
        const THREE = libs.THREE;
        const canvas = page.createCanvas(64, 64);
        const context = canvas.getContext("2d");
        context.fillStyle = "#E24A3A";
        context.beginPath();
        context.arc(32, 32, 28, 0, Math.PI * 2);
        context.fill();
        context.lineWidth = 4;
        context.strokeStyle = "#FFFFFF";
        context.stroke();
        context.font = '800 44px "Nanum Gothic", "Malgun Gothic", sans-serif';
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#FFFFFF";
        context.fillText("!", 32, 36);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.alertMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
        this.laserGeometry = new THREE.BoxGeometry(0.12, 0.12, 1);
        this.laserMaterial = new THREE.MeshBasicMaterial({ color: FreezeLook.EYE });
    }
    dispose() {
        if (this.alertMaterial.map)
            this.alertMaterial.map.dispose();
        this.alertMaterial.dispose();
        this.laserGeometry.dispose();
        this.laserMaterial.dispose();
    }
}
class FreezeWatcherView {
    constructor(libs, assets, clips, world) {
        this.world = world;
        this.eyes = [];
        this.bodyTurn = Math.PI;
        this.headTurn = Math.PI;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.inner = new THREE.Group();
        this.model = libs.SkeletonUtils.clone(assets.skeleton());
        this.model.scale.setScalar(CharacterModelFactory.SCALE * FreezeLook.WATCHER_SCALE);
        this.model.traverse((node) => { node.frustumCulled = false; });
        this.inner.add(this.model);
        this.group.add(this.inner);
        this.group.position.set(0, 0, FreezeLook.WATCHER_Z);
        this.inner.rotation.y = Math.PI;
        world.add(this.group);
        this.head = this.model.getObjectByName("head") || null;
        this.eyeMaterial = new THREE.MeshBasicMaterial({ color: FreezeLook.EYE });
        const eyeGeometry = new THREE.SphereGeometry(FreezeWatcherView.EYE_RADIUS, 8, 6);
        [-1, 1].forEach((side) => {
            const eye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
            eye.position.set(side * FreezeWatcherView.EYE_SPREAD, FreezeWatcherView.EYE_UP, FreezeWatcherView.EYE_FORWARD);
            eye.visible = false;
            (this.head || this.model).add(eye);
            this.eyes.push(eye);
        });
        this.animator = new CharacterAnimator(libs, this.model, clips);
        this.animator.play(FighterClips.IDLE);
    }
    update(phase, now, dt) {
        const bodyTarget = phase.kind === "look" ? 0 : Math.PI;
        const headTarget = phase.kind === "look" || phase.kind === "warning" ? 0 : Math.PI;
        this.bodyTurn += (bodyTarget - this.bodyTurn) * Math.min(1, dt * FreezeWatcherView.BODY_TURN_RATE);
        this.headTurn += (headTarget - this.headTurn) * Math.min(1, dt * FreezeWatcherView.HEAD_TURN_RATE);
        this.inner.rotation.y = this.bodyTurn;
        this.animator.update(dt);
        if (this.head)
            this.head.rotateY(this.headTurn - this.bodyTurn);
        const glowing = phase.kind === "look" || (phase.kind === "warning" && Math.sin(now / FreezeWatcherView.EYE_BLINK_MS) > 0);
        this.eyes.forEach((eye) => { eye.visible = glowing; });
    }
    dispose() {
        this.world.remove(this.group);
        this.eyeMaterial.dispose();
        this.eyes.forEach((eye) => eye.geometry.dispose());
    }
}
FreezeWatcherView.BODY_TURN_RATE = 9;
FreezeWatcherView.HEAD_TURN_RATE = 16;
FreezeWatcherView.EYE_BLINK_MS = 45;
FreezeWatcherView.EYE_RADIUS = 0.11;
FreezeWatcherView.EYE_SPREAD = 0.12;
FreezeWatcherView.EYE_UP = 0.33;
FreezeWatcherView.EYE_FORWARD = 0.25;
class FreezeVisionCone {
    constructor(libs, world) {
        this.world = world;
        const THREE = libs.THREE;
        this.material = new THREE.MeshBasicMaterial({ color: FreezeLook.LOOK_FAN, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
        const geometry = new THREE.CircleGeometry(FreezeLook.FAN_RADIUS, 28, -Math.PI / 2 - FreezeLook.FAN_HALF_ANGLE, FreezeLook.FAN_HALF_ANGLE * 2);
        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.set(0, 0.06, FreezeLook.WATCHER_Z);
        this.mesh.visible = false;
        world.add(this.mesh);
    }
    update(phase, now) {
        const looking = phase.kind === "look";
        this.mesh.visible = looking || phase.kind === "warning";
        if (!this.mesh.visible)
            return;
        this.material.color.setHex(looking ? FreezeLook.LOOK_FAN : FreezeLook.WARN_FAN);
        this.material.opacity = looking ? 0.36 + Math.sin(now / 120) * 0.08 : 0.16;
    }
    dispose() {
        this.world.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}
class FreezePoseClips {
    static of(pose) {
        return FreezePoseClips.BY_POSE[pose];
    }
}
FreezePoseClips.BY_POSE = {
    idle: { clip: FighterClips.IDLE, once: false },
    run: { clip: FighterClips.RUN, once: false },
    hit: { clip: FighterClips.HIT, once: true },
    cheer: { clip: FreezeAssets.CHEER_CLIP, once: false }
};
class FreezeRunnerView {
    constructor(kit, effects, factory, clips, world, participant, look, mine, showLabel) {
        this.kit = kit;
        this.effects = effects;
        this.factory = factory;
        this.world = world;
        const THREE = kit.libs.THREE;
        const color = Palette.slotColor(participant.slot);
        this.group = new THREE.Group();
        this.model = factory.build(look);
        this.model.rotation.y = Math.PI;
        this.group.add(this.model);
        this.ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
        this.ring = new THREE.Mesh(kit.ringGeometry, this.ringMaterial);
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.y = 0.05;
        if (mine)
            this.ring.scale.setScalar(FreezeRunnerView.LOCAL_RING_SCALE);
        this.label = showLabel ? kit.labels.create(participant.nick + (participant.ai ? " (AI)" : ""), color) : null;
        if (this.label) {
            this.label.position.y = FreezeRunnerView.LABEL_HEIGHT;
            this.group.add(this.label);
        }
        this.alert = new THREE.Sprite(effects.alertMaterial);
        this.alert.scale.set(0.9, 0.9, 1);
        this.alert.visible = false;
        this.group.add(this.ring, this.alert);
        this.blob = new THREE.Mesh(kit.blobGeometry, kit.blobMaterial);
        this.blob.rotation.x = -Math.PI / 2;
        this.laser = new THREE.Mesh(effects.laserGeometry, effects.laserMaterial);
        this.laser.visible = false;
        world.add(this.group, this.blob, this.laser);
        this.animator = new CharacterAnimator(kit.libs, this.model, clips);
        this.animator.play(FighterClips.IDLE);
    }
    update(frame, dt) {
        this.group.position.set(frame.x, 0, frame.z);
        this.blob.position.set(frame.x, 0.03, frame.z);
        this.showAlert(frame.sinceCatchMs);
        this.showLaser(frame);
        const plan = FreezePoseClips.of(frame.pose);
        const speed = frame.pose === "run" ? MathUtil.clamp(frame.runSpeed / 3.6, 0.7, 1.3) : 1;
        this.animator.play(plan.clip, { once: plan.once, speed });
        this.animator.update(dt);
    }
    dispose() {
        this.world.remove(this.group);
        this.world.remove(this.blob);
        this.world.remove(this.laser);
        this.factory.disposeModel(this.model);
        this.ringMaterial.dispose();
        if (this.label) {
            const labelMaterial = this.label.material;
            if (labelMaterial.map)
                labelMaterial.map.dispose();
            labelMaterial.dispose();
        }
    }
    showAlert(sinceCatchMs) {
        const active = sinceCatchMs < FreezeLook.ALERT_MS;
        this.alert.visible = active;
        if (active)
            this.alert.position.y = FreezeRunnerView.ALERT_HEIGHT + Math.sin(sinceCatchMs / 70) * 0.12;
    }
    showLaser(frame) {
        const active = frame.sinceCatchMs < FreezeLook.LASER_MS;
        this.laser.visible = active;
        if (!active)
            return;
        const fromY = FreezeLook.WATCHER_EYE_HEIGHT;
        const toY = FreezeLook.RUNNER_HEAD_HEIGHT;
        const dx = frame.x, dy = toY - fromY, dz = frame.z - FreezeLook.WATCHER_Z;
        const length = Math.hypot(dx, dy, dz);
        this.laser.position.set(dx / 2, fromY + dy / 2, FreezeLook.WATCHER_Z + dz / 2);
        this.laser.scale.set(1, 1, length);
        this.laser.lookAt(frame.x, toY, frame.z);
    }
}
FreezeRunnerView.ALERT_HEIGHT = 3.3;
FreezeRunnerView.LABEL_HEIGHT = 2.75;
FreezeRunnerView.LOCAL_RING_SCALE = 1.5;
class FreezeRunnerViews {
    constructor(kit, effects, factory, characters, world) {
        this.kit = kit;
        this.effects = effects;
        this.factory = factory;
        this.characters = characters;
        this.world = world;
        this.views = new Map();
    }
    build(runners, looks, localId, showLabels) {
        this.clear();
        runners.forEach((runner) => {
            const look = looks.get(runner.id) || CharacterLooks.createDefault();
            this.views.set(runner.id, new FreezeRunnerView(this.kit, this.effects, this.factory, this.characters.clips, this.world, runner.participant, look, runner.id === localId, showLabels));
        });
    }
    update(runners, now, dt) {
        runners.forEach((runner) => {
            const view = this.views.get(runner.id);
            if (!view)
                return;
            view.update({
                x: FreezeLanes.xOf(runner.lane),
                z: -runner.dist,
                pose: runner.pose(now),
                runSpeed: runner.speed || FreezeRules.RUN_SPEED,
                sinceCatchMs: runner.caughtAt > 0 ? now - runner.caughtAt : Infinity
            }, dt);
        });
    }
    clear() {
        this.views.forEach((view) => view.dispose());
        this.views.clear();
    }
}
class FreezeSignalStyle {
    constructor(css, headline) {
        this.css = css;
        this.headline = headline;
    }
}
class FreezeSignalHud {
    constructor(page) {
        this.page = page;
        this.signature = "";
        this.signal = page.byId("fzSignal");
        this.edge = page.byId("fzEdge");
    }
    update(started, phase, now, note) {
        this.page.show(this.signal, started);
        this.page.show(this.edge, started);
        if (!started)
            return;
        const style = FreezeSignalHud.STYLES[phase.kind];
        const cheer = phase.kind === "safe" && phase.cycle ? phase.cycle.cheerAt(now) : phase.kind === "idle" ? "" : FreezeRules.CHEER_TEXT;
        const signature = style.css + "|" + cheer + "|" + note;
        if (signature === this.signature)
            return;
        this.signature = signature;
        this.edge.className = phase.kind === "look" ? "pulse" : "";
        this.signal.className = style.css;
        this.signal.innerHTML = "<b>" + style.headline + "</b><span>" + Html.escape(cheer) + "</span>" + (note ? "<small>" + Html.escape(note) + "</small>" : "");
    }
    hide() {
        this.signature = "";
        this.page.show(this.signal, false);
        this.page.show(this.edge, false);
    }
}
FreezeSignalHud.STYLES = {
    idle: new FreezeSignalStyle("idle", "준비"),
    safe: new FreezeSignalStyle("go", "달려!"),
    warning: new FreezeSignalStyle("warn", "!"),
    look: new FreezeSignalStyle("stop", "멈춰!")
};
