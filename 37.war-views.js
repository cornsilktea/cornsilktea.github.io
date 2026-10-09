"use strict";
class WarPalette {
}
WarPalette.SQUAD_COLORS = ["#4FC3F7", "#B388FF", "#FFD54F"];
WarPalette.ENEMY = "#E5484D";
WarPalette.MINE = "#7CE0A8";
WarPalette.ACCENT = "#D97B4F";
WarPalette.KIND_COLORS = { melee: "#6BCB77", ranged: "#F2994A", elite: "#E5484D" };
class WarViewTransform {
    constructor(team) {
        this.team = team;
    }
    get flip() {
        return this.team === 0 ? 1 : -1;
    }
    toScene(point) {
        return { x: (point.x * this.flip) / 100, z: (point.y * this.flip) / 100 };
    }
    sceneToWorld(x, z) {
        return { x: Math.round(x * 100 * this.flip), y: Math.round(z * 100 * this.flip) };
    }
    toMap(point, width, height) {
        let u = (point.x + WarMapData.HALF_W) / (WarMapData.HALF_W * 2);
        let v = (point.y + WarMapData.HALF_H) / (WarMapData.HALF_H * 2);
        if (this.team === 1) {
            u = 1 - u;
            v = 1 - v;
        }
        return { x: u * width, y: v * height };
    }
    mapToWorld(px, py, width, height) {
        let u = px / width;
        let v = py / height;
        if (this.team === 1) {
            u = 1 - u;
            v = 1 - v;
        }
        return { x: Math.round(u * WarMapData.HALF_W * 2 - WarMapData.HALF_W), y: Math.round(v * WarMapData.HALF_H * 2 - WarMapData.HALF_H) };
    }
}
class WarUnitLooks {
    static of(unitId) {
        return WarUnitLooks.LOOKS[unitId];
    }
    static files() {
        return Object.keys(WarUnitLooks.LOOKS).map((key) => WarUnitLooks.LOOKS[key].file);
    }
}
WarUnitLooks.HUMAN = { animated: true, idleClip: "Idle", runClip: "Run", shootsFar: false };
WarUnitLooks.LOOKS = {
    shieldbearer: { ...WarUnitLooks.HUMAN, file: "quaternius/Knight_Male.gltf", scale: 1, attackClip: "SwordSlash" },
    charger: { ...WarUnitLooks.HUMAN, file: "quaternius/Soldier_Male.gltf", scale: 1, attackClip: "Punch" },
    archer: { ...WarUnitLooks.HUMAN, file: "quaternius/BlueSoldier_Female.gltf", scale: 1, attackClip: "Shoot_OneHanded", shootsFar: true },
    energymage: { animated: true, file: "quaternius/Astronaut_BarbaraTheBee.gltf", scale: 0.5, idleClip: "Idle_Gun", runClip: "Run_Gun", attackClip: "Run_Gun_Shoot", shootsFar: true },
    guardknight: { animated: true, file: "quaternius/Mech_FinnTheFrog.gltf", scale: 0.8, idleClip: "Idle", runClip: "Run", attackClip: "Kick", shootsFar: false },
    artillerytruck: { animated: false, file: "quaternius/Rover_Round.gltf", scale: 0.55, idleClip: "", runClip: "", attackClip: "", shootsFar: true },
};
class WarBuildingLooks {
    static of(type) {
        return WarBuildingLooks.MODELS[type];
    }
    static files() {
        return Object.keys(WarBuildingLooks.MODELS).map((key) => WarBuildingLooks.MODELS[key].file);
    }
}
WarBuildingLooks.MODELS = {
    hq: { file: "quaternius/Base_Large.gltf", scale: 0.8 },
    barracks: { file: "quaternius/House_Single.gltf", scale: 0.9 },
    range: { file: "quaternius/House_Open.gltf", scale: 0.9 },
    lab: { file: "quaternius/GeodesicDome.gltf", scale: 0.42 },
};
class WarAssetLibrary {
    constructor(libs) {
        this.libs = libs;
        this.assets = new Map();
        this.loading = null;
    }
    load() {
        if (!this.loading)
            this.loading = this.loadAll();
        return this.loading;
    }
    actor(file) {
        const asset = this.assetOf(file);
        return { model: this.libs.SkeletonUtils.clone(asset.scene), clips: asset.clips };
    }
    model(file) {
        return this.assetOf(file).scene.clone(true);
    }
    rockFiles() {
        return WarAssetLibrary.ROCKS;
    }
    assetOf(file) {
        const found = this.assets.get(file);
        if (!found)
            throw new Error("모델을 아직 불러오지 못했어요: " + file);
        return found;
    }
    async loadAll() {
        const loader = new this.libs.GLTFLoader();
        const files = Array.from(new Set(WarUnitLooks.files().concat(WarBuildingLooks.files(), WarAssetLibrary.EXTRA_MODELS, WarAssetLibrary.ROCKS)));
        await Promise.all(files.map((file) => loader.loadAsync(WarAssetLibrary.ROOT + file).then((gltf) => {
            const clips = new Map();
            gltf.animations.forEach((clip) => clips.set(clip.name, clip));
            this.assets.set(file, { scene: gltf.scene, clips });
        })));
    }
}
WarAssetLibrary.ROOT = "assets/kaykit/war/";
WarAssetLibrary.EXTRA_MODELS = ["space/landingpad_large.gltf", "resources/Iron_Nuggets.gltf", "resources/Parts_Pile_Large.gltf"];
WarAssetLibrary.ROCKS = ["Rock_1_A", "Rock_1_C", "Rock_2_B", "Rock_2_E", "Rock_3_A", "Rock_3_D", "Rock_3_G"].map((name) => "nature/" + name + "_Color1.gltf");
class WarMaterials {
    constructor(libs) {
        this.libs = libs;
        this.rings = new Map();
        const THREE = libs.THREE;
        this.barBack = new THREE.MeshBasicMaterial({ color: "#0A0C14", transparent: true, opacity: 0.8, depthTest: false });
        this.barMine = new THREE.MeshBasicMaterial({ color: "#6BE08A", depthTest: false });
        this.barEnemy = new THREE.MeshBasicMaterial({ color: "#FF6B6B", depthTest: false });
        this.ringGeometry = new THREE.RingGeometry(0.52, 0.72, 24);
        this.barGeometry = new THREE.PlaneGeometry(1, 1);
    }
    ring(color) {
        let found = this.rings.get(color);
        if (!found) {
            found = new this.libs.THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, side: this.libs.THREE.DoubleSide });
            this.rings.set(color, found);
        }
        return found;
    }
}
class WarHealthBar {
    constructor(libs, materials, width, height, mine) {
        const THREE = libs.THREE;
        this.width = width;
        this.group = new THREE.Group();
        const back = new THREE.Mesh(materials.barGeometry, materials.barBack);
        back.scale.set(width + 0.06, height + 0.06, 1);
        this.fill = new THREE.Mesh(materials.barGeometry, mine ? materials.barMine : materials.barEnemy);
        this.fill.scale.set(width, height, 1);
        this.fill.position.z = 0.002;
        back.renderOrder = 20;
        this.fill.renderOrder = 21;
        this.group.add(back, this.fill);
        this.group.visible = false;
    }
    update(hp, maxHp, alwaysShow) {
        const ratio = Math.max(0, hp / maxHp);
        this.group.visible = alwaysShow || ratio < 1;
        this.fill.scale.x = Math.max(0.001, this.width * ratio);
        this.fill.position.x = -(this.width * (1 - ratio)) / 2;
    }
}
class WarUnitView {
    constructor(libs, assets, materials, unit, start, mine) {
        this.materials = materials;
        this.animate = true;
        this.yaw = 0;
        this.moving = false;
        this.lastCooldown = 0;
        this.attackHold = 0;
        this.bobSeconds = 0;
        const THREE = libs.THREE;
        this.look = WarUnitLooks.of(unit.def.id);
        this.group = new THREE.Group();
        const actor = assets.actor(this.look.file);
        this.model = actor.model;
        this.model.scale.setScalar(this.look.scale);
        this.group.add(this.model);
        this.animator = this.look.animated ? new CharacterAnimator(libs, this.model, actor.clips) : null;
        this.ring = new THREE.Mesh(materials.ringGeometry, materials.ring(mine ? WarPalette.SQUAD_COLORS[Math.max(0, unit.squadIndex)] : WarPalette.ENEMY));
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.y = 0.05;
        this.ring.scale.setScalar(this.look.scale > 1 ? 1.5 : 1);
        this.bar = new WarHealthBar(libs, materials, 1.1, 0.14, mine);
        this.bar.group.position.y = 2.7 * Math.max(1, this.look.scale * 0.8);
        this.group.add(this.ring, this.bar.group);
        this.from = { x: start.x, z: start.z };
        this.to = { x: start.x, z: start.z };
        this.group.position.set(start.x, 0, start.z);
        this.yaw = mine ? Math.PI : 0;
        if (this.animator)
            this.animator.play(this.look.idleClip);
    }
    onTick(unit, target, facing, squadColor) {
        this.from.x = this.to.x;
        this.from.z = this.to.z;
        this.to.x = target.x;
        this.to.z = target.z;
        const dx = this.to.x - this.from.x, dz = this.to.z - this.from.z;
        this.moving = dx * dx + dz * dz > 0.0004;
        if (facing)
            this.yaw = Math.atan2(facing.x - this.to.x, facing.z - this.to.z);
        else if (this.moving)
            this.yaw = Math.atan2(dx, dz);
        if (unit.cooldownLeft > this.lastCooldown)
            this.attackHold = WarUnitView.ATTACK_HOLD_SECONDS;
        this.lastCooldown = unit.cooldownLeft;
        if (squadColor)
            this.ring.material = this.materials.ring(squadColor);
        this.bar.update(unit.hp, unit.maxHp, false);
    }
    render(alpha, deltaSeconds, cameraQuaternion) {
        const x = this.from.x + (this.to.x - this.from.x) * alpha;
        const z = this.from.z + (this.to.z - this.from.z) * alpha;
        this.group.position.set(x, 0, z);
        const turn = Math.atan2(Math.sin(this.yaw - this.model.rotation.y), Math.cos(this.yaw - this.model.rotation.y));
        this.model.rotation.y += turn * Math.min(1, deltaSeconds * 14);
        this.bar.group.quaternion.copy(cameraQuaternion);
        this.bobSeconds += deltaSeconds;
        if (!this.animator) {
            this.model.position.y = this.moving ? Math.abs(Math.sin(this.bobSeconds * 9)) * 0.06 : 0;
            return;
        }
        if (!this.animate)
            return;
        if (this.attackHold > 0) {
            this.attackHold -= deltaSeconds;
            this.animator.play(this.look.attackClip, { once: true });
        }
        else {
            this.animator.play(this.moving ? this.look.runClip : this.look.idleClip);
        }
        this.animator.update(deltaSeconds);
    }
    show(visible) {
        this.group.visible = visible;
    }
}
WarUnitView.ATTACK_HOLD_SECONDS = 0.7;
class WarBuildingView {
    constructor(libs, assets, materials, building, position, mine) {
        const THREE = libs.THREE;
        const look = WarBuildingLooks.of(building.def.type);
        this.group = new THREE.Group();
        this.model = assets.model(look.file);
        this.model.scale.setScalar(look.scale);
        this.disc = new THREE.Mesh(new THREE.CircleGeometry((building.def.radius / 100) * 1.05, 28), materials.ring(mine ? "#2E8F6B" : "#A02A30"));
        this.disc.rotation.x = -Math.PI / 2;
        this.disc.position.y = 0.03;
        this.disc.material.opacity = 0.55;
        this.bar = new WarHealthBar(libs, materials, building.def.type === "hq" ? 4 : 2.2, 0.22, mine);
        this.bar.group.position.y = building.def.type === "hq" ? 6.2 : 3.4;
        this.group.add(this.disc, this.model, this.bar.group);
        this.group.position.set(position.x, 0, position.z);
        this.group.rotation.y = mine ? Math.PI : 0;
        this.bar.group.rotation.y = -this.group.rotation.y;
    }
    onTick(building) {
        const progress = building.complete ? 1 : 1 - building.buildLeft / building.def.buildTicks;
        this.model.scale.y = (WarBuildingLooks.of(building.def.type).scale) * (0.25 + 0.75 * progress);
        this.bar.update(building.hp, building.maxHp, !building.complete);
    }
    faceCamera(cameraQuaternion) {
        this.bar.group.quaternion.copy(cameraQuaternion);
        this.bar.group.quaternion.premultiply(this.group.quaternion.clone().invert());
    }
    show(visible) {
        this.group.visible = visible;
    }
}
class WarGroundView {
    constructor(libs, assets, transform) {
        this.libs = libs;
        this.transform = transform;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const widthM = (WarMapData.HALF_W * 2) / 100, heightM = (WarMapData.HALF_H * 2) / 100;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), new THREE.MeshLambertMaterial({ map: this.paintTexture() }));
        plane.rotation.x = -Math.PI / 2;
        const holder = new THREE.Group();
        holder.rotation.y = transform.team === 1 ? Math.PI : 0;
        holder.add(plane);
        this.group.add(holder);
        this.scatterRocks(assets);
        this.placeResources(assets);
    }
    paintTexture() {
        const THREE = this.libs.THREE;
        const scale = WarGroundView.SCALE_PX_PER_M / 100;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(WarMapData.HALF_W * 2 * scale);
        canvas.height = Math.round(WarMapData.HALF_H * 2 * scale);
        const context = canvas.getContext("2d");
        context.fillStyle = "#273049";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.lineCap = "round";
        context.strokeStyle = "#3F4E73";
        for (const corridor of WarMapData.corridors()) {
            const a = this.canvasPoint(corridor.ax, corridor.ay, scale), b = this.canvasPoint(corridor.bx, corridor.by, scale);
            context.lineWidth = corridor.halfWidth * 2 * scale;
            context.beginPath();
            context.moveTo(a.x, a.y);
            context.lineTo(b.x, b.y);
            context.stroke();
        }
        context.strokeStyle = "#5A6A92";
        context.setLineDash([10, 14]);
        for (const corridor of WarMapData.corridors()) {
            if (corridor.halfWidth > 800)
                continue;
            const a = this.canvasPoint(corridor.ax, corridor.ay, scale), b = this.canvasPoint(corridor.bx, corridor.by, scale);
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(a.x, a.y);
            context.lineTo(b.x, b.y);
            context.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    canvasPoint(x, y, scale) {
        return { x: (x + WarMapData.HALF_W) * scale, y: (y + WarMapData.HALF_H) * scale };
    }
    scatterRocks(assets) {
        const rocks = assets.rockFiles();
        let seed = 20261009;
        const next = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        let placed = 0;
        for (let tries = 0; tries < 900 && placed < 70; tries++) {
            const point = { x: Math.round((next() * 2 - 1) * (WarMapData.HALF_W - 200)), y: Math.round((next() * 2 - 1) * (WarMapData.HALF_H - 200)) };
            const fixed = WarTerrain.clamp(point);
            if (WarMath.dist(point.x, point.y, fixed.x, fixed.y) < 520)
                continue;
            const rock = assets.model(rocks[Math.floor(next() * rocks.length)]);
            const scene = this.transform.toScene(point);
            rock.position.set(scene.x, 0, scene.z);
            rock.rotation.y = next() * Math.PI * 2;
            rock.scale.setScalar(2.2 + next() * 2.6);
            this.group.add(rock);
            placed++;
        }
    }
    placeResources(assets) {
        const THREE = this.libs.THREE;
        for (const team of [0, 1]) {
            for (const point of WarMapData.orePoints(team)) {
                const node = assets.model("resources/Iron_Nuggets.gltf");
                const scene = this.transform.toScene(point);
                node.position.set(scene.x, 0, scene.z);
                node.scale.setScalar(2.4);
                this.group.add(node);
            }
            for (const point of WarMapData.crystalPoints(team)) {
                const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: "#6FD6FF" }));
                const scene = this.transform.toScene(point);
                crystal.position.set(scene.x, 1.1, scene.z);
                crystal.scale.set(0.8, 1.5, 0.8);
                this.group.add(crystal);
            }
        }
    }
}
WarGroundView.SCALE_PX_PER_M = 4;
class WarFogView {
    constructor(libs, transform, vision) {
        this.transform = transform;
        this.vision = vision;
        const THREE = libs.THREE;
        this.canvas = document.createElement("canvas");
        this.canvas.width = Math.ceil((WarMapData.HALF_W * 2) / WarMapData.VISION_CELL);
        this.canvas.height = Math.ceil((WarMapData.HALF_H * 2) / WarMapData.VISION_CELL);
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.generateMipmaps = false;
        const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false });
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry((this.canvas.width * WarMapData.VISION_CELL) / 100, (this.canvas.height * WarMapData.VISION_CELL) / 100), material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.y = 0.08;
        this.mesh.renderOrder = 5;
    }
    refresh() {
        const context = this.canvas.getContext("2d");
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        context.fillStyle = "rgba(2, 5, 14, 0.5)";
        const cell = WarMapData.VISION_CELL;
        for (let row = 0; row < this.canvas.height; row++) {
            for (let col = 0; col < this.canvas.width; col++) {
                const wx = col * cell + cell / 2 - WarMapData.HALF_W;
                const wy = row * cell + cell / 2 - WarMapData.HALF_H;
                if (this.vision.isVisible(this.transform.team, wx, wy))
                    continue;
                const drawCol = this.transform.team === 0 ? col : this.canvas.width - 1 - col;
                const drawRow = this.transform.team === 0 ? row : this.canvas.height - 1 - row;
                context.fillRect(drawCol, drawRow, 1, 1);
            }
        }
        this.texture.needsUpdate = true;
    }
}
class WarWorkerCrowd {
    constructor(libs, transform, team, color) {
        this.libs = libs;
        this.transform = transform;
        this.team = team;
        const THREE = libs.THREE;
        this.mesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 8), new THREE.MeshLambertMaterial({ color }), WarWorkerCrowd.MAX);
        this.mesh.frustumCulled = false;
        this.mesh.count = 0;
        this.dummy = new THREE.Object3D();
    }
    update(oreWorkers, crystalWorkers, seconds) {
        const ore = WarMapData.orePoints(this.team), crystal = WarMapData.crystalPoints(this.team);
        const hq = this.transform.toScene(WarMapData.hq(this.team));
        const total = Math.min(WarWorkerCrowd.MAX, oreWorkers + crystalWorkers);
        for (let i = 0; i < total; i++) {
            const isOre = i < oreWorkers;
            const points = isOre ? ore : crystal;
            const node = this.transform.toScene(points[i % points.length]);
            const phase = (seconds * 0.2 + i * 0.173) % 1;
            const t = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
            const x = node.x + (hq.x - node.x) * t * 0.82;
            const z = node.z + (hq.z - node.z) * t * 0.82;
            this.dummy.position.set(x, 0.5 + Math.abs(Math.sin(seconds * 8 + i)) * 0.05, z);
            this.dummy.rotation.set(0, 0, 0);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.mesh.count = total;
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}
WarWorkerCrowd.MAX = 56;
class WarCameraRig {
    constructor(libs) {
        this.focusX = 0;
        this.focusZ = 0;
        this.zoom = 1;
        this.camera = new libs.THREE.PerspectiveCamera(45, 1, 0.5, 400);
        this.apply();
    }
    get perspective() {
        return this.camera;
    }
    get focus() {
        return { x: this.focusX, z: this.focusZ };
    }
    resize(aspect) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }
    focusOn(x, z) {
        this.focusX = x;
        this.focusZ = z;
        this.clampFocus();
        this.apply();
    }
    pan(dx, dz) {
        this.focusOn(this.focusX + dx, this.focusZ + dz);
    }
    setZoom(value) {
        this.zoom = value;
        this.apply();
    }
    zoomBy(factor) {
        this.zoom = Math.min(1.5, Math.max(0.55, this.zoom * factor));
        this.apply();
    }
    orbit(radius, height, angle, centerX, centerZ) {
        this.camera.position.set(centerX + Math.sin(angle) * radius, height, centerZ + Math.cos(angle) * radius);
        this.camera.lookAt(centerX, 1.5, centerZ);
    }
    clampFocus() {
        this.focusX = Math.min(WarCameraRig.LIMIT_X, Math.max(-WarCameraRig.LIMIT_X, this.focusX));
        this.focusZ = Math.min(WarCameraRig.LIMIT_Z, Math.max(-WarCameraRig.LIMIT_Z, this.focusZ));
    }
    apply() {
        this.camera.position.set(this.focusX, WarCameraRig.HEIGHT * this.zoom, this.focusZ + WarCameraRig.DISTANCE * this.zoom);
        this.camera.lookAt(this.focusX, 0, this.focusZ);
    }
}
WarCameraRig.DISTANCE = 24;
WarCameraRig.HEIGHT = 30;
WarCameraRig.LIMIT_X = 50;
WarCameraRig.LIMIT_Z = 70;
class WarWorldView {
    constructor(libs, canvas, touchDevice) {
        this.libs = libs;
        this.playing = false;
        const THREE = libs.THREE;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#070B16");
        this.scene.add(new THREE.HemisphereLight(0xBFD4FF, 0x2A2F45, 1.6));
        const sun = new THREE.DirectionalLight(0xFFE7C4, 1.5);
        sun.position.set(-20, 40, 15);
        this.scene.add(sun);
        this.rig = new WarCameraRig(libs);
        this.raycaster = new THREE.Raycaster();
        this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.governor = window.QualityGovernor
            ? window.QualityGovernor({ steps: [() => this.lowerPixelRatio()], storageKey: "spacewar_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 })
            : null;
        if (this.governor)
            this.governor.restore();
        window.addEventListener("resize", () => this.resize());
        this.resize();
    }
    groundPoint(clientX, clientY) {
        const THREE = this.libs.THREE;
        const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
        this.raycaster.setFromCamera(ndc, this.rig.perspective);
        const hit = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(this.ground, hit))
            return null;
        return { x: hit.x, z: hit.z };
    }
    resize() {
        const width = window.innerWidth, height = window.innerHeight;
        this.renderer.setSize(width, height, false);
        this.rig.resize(width / height);
    }
    render(deltaSeconds) {
        this.renderer.render(this.scene, this.rig.perspective);
        if (this.governor)
            this.governor.update(deltaSeconds);
    }
    lowerPixelRatio() {
        if (this.pixelRatio <= 1)
            return false;
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
        return true;
    }
}
class WarSelectionMarker {
    constructor(libs) {
        const THREE = libs.THREE;
        this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.y = 0.12;
        this.mesh.renderOrder = 10;
        this.mesh.visible = false;
    }
    place(point, radius) {
        this.mesh.visible = point !== null;
        if (!point)
            return;
        this.mesh.position.set(point.x, 0.12, point.z);
        this.mesh.scale.setScalar(radius);
    }
}
class WarSlotMarkers {
    constructor(libs, slots, transform) {
        this.libs = libs;
        this.markers = new Map();
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const geometry = new THREE.RingGeometry(1.1, 1.4, 6);
        const material = new THREE.MeshBasicMaterial({ color: "#8FB4FF", transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
        for (const slot of slots) {
            if (!slot.enabled)
                continue;
            const marker = new THREE.Mesh(geometry, material);
            const scene = transform.toScene(slot);
            marker.rotation.x = -Math.PI / 2;
            marker.position.set(scene.x, 0.06, scene.z);
            this.group.add(marker);
            this.markers.set(slot.index, marker);
        }
    }
    setOccupied(index, occupied) {
        const marker = this.markers.get(index);
        if (marker)
            marker.visible = !occupied;
    }
}
class WarMatchView {
    constructor(libs, assets, world, engine, viewer) {
        this.libs = libs;
        this.assets = assets;
        this.world = world;
        this.engine = engine;
        this.viewer = viewer;
        this.units = new Map();
        this.buildings = new Map();
        this.seenBuildings = new Set();
        this.selection = { kind: "none" };
        this.seconds = 0;
        this.lastFogTick = -99;
        const THREE = libs.THREE;
        this.transform = new WarViewTransform(viewer);
        this.materials = new WarMaterials(libs);
        this.root = new THREE.Group();
        this.root.add(new WarGroundView(libs, assets, this.transform).group);
        this.fog = new WarFogView(libs, this.transform, engine.vision);
        this.root.add(this.fog.mesh);
        this.slotMarkers = new WarSlotMarkers(libs, engine.players[viewer].slotDefs, this.transform);
        this.root.add(this.slotMarkers.group);
        this.crowds = [new WarWorkerCrowd(libs, this.transform, 0, viewer === 0 ? "#7CE0A8" : "#E58A8A"), new WarWorkerCrowd(libs, this.transform, 1, viewer === 1 ? "#7CE0A8" : "#E58A8A")];
        this.crowds.forEach((crowd) => this.root.add(crowd.mesh));
        this.marker = new WarSelectionMarker(libs);
        this.root.add(this.marker.mesh);
        world.scene.add(this.root);
        const home = this.transform.toScene(WarMapData.hq(viewer));
        world.rig.setZoom(1.4);
        world.rig.focusOn(home.x, home.z + 5);
        this.onTick();
    }
    setSelection(selection) {
        this.selection = selection;
    }
    pick(clientX, clientY) {
        const best = this.pickEntity(clientX, clientY);
        if (best.kind !== "none")
            return best;
        const hit = this.world.groundPoint(clientX, clientY);
        if (!hit)
            return { kind: "none" };
        const point = this.transform.sceneToWorld(hit.x, hit.z);
        for (const slot of this.engine.players[this.viewer].slotDefs) {
            if (!slot.enabled || this.engine.players[this.viewer].slotBuildings[slot.index])
                continue;
            if (WarMath.dist(point.x, point.y, slot.x, slot.y) <= 190)
                return { kind: "slot", index: slot.index };
        }
        return { kind: "none" };
    }
    pickEntity(clientX, clientY) {
        const camera = this.world.rig.perspective;
        const vector = new this.libs.THREE.Vector3();
        let best = { kind: "none" };
        let bestDistance = Number.MAX_SAFE_INTEGER;
        for (const entity of this.engine.entities) {
            if (!entity.alive || !this.isShown(entity))
                continue;
            const isUnit = entity instanceof WarUnit;
            const scene = this.transform.toScene(entity);
            vector.set(scene.x, isUnit ? 1 : 1.6, scene.z).project(camera);
            const dx = ((vector.x + 1) / 2) * window.innerWidth - clientX;
            const dy = ((1 - vector.y) / 2) * window.innerHeight - clientY;
            const reach = isUnit ? WarMatchView.UNIT_PICK_PIXELS : WarMatchView.BUILDING_PICK_PIXELS * (entity.bodyRadius() / 200 + 0.5);
            const distance = Math.hypot(dx, dy);
            if (distance > reach || distance >= bestDistance)
                continue;
            bestDistance = distance;
            best = isUnit ? { kind: "unit", id: entity.id } : { kind: "building", id: entity.id };
        }
        return best;
    }
    onTick() {
        const player = this.engine.players[this.viewer];
        const alive = new Set();
        for (const entity of this.engine.entities) {
            if (!entity.alive)
                continue;
            alive.add(entity.id);
            if (entity instanceof WarUnit)
                this.syncUnit(entity);
            else if (entity instanceof WarBuilding)
                this.syncBuilding(entity);
        }
        this.dropMissing(this.units, alive);
        this.dropMissing(this.buildings, alive);
        player.slotDefs.forEach((slot) => this.slotMarkers.setOccupied(slot.index, !!player.slotBuildings[slot.index]));
        if (this.engine.tick - this.lastFogTick >= 3) {
            this.fog.refresh();
            this.lastFogTick = this.engine.tick;
        }
    }
    render(alpha, deltaSeconds) {
        this.seconds += deltaSeconds;
        const camera = this.world.rig.perspective;
        const focus = this.world.rig.focus;
        this.units.forEach((view) => {
            const near = Math.abs(view.group.position.x - focus.x) < 45 && Math.abs(view.group.position.z - focus.z) < 45;
            view.animate = near;
            view.render(alpha, deltaSeconds, camera.quaternion);
        });
        this.buildings.forEach((view) => view.faceCamera(camera.quaternion));
        for (const crowd of this.crowds) {
            const team = crowd === this.crowds[0] ? 0 : 1;
            const economy = this.engine.players[team].economy;
            crowd.update(economy.oreWorkers, economy.crystalWorkers, this.seconds);
            const base = WarMapData.hq(team);
            crowd.mesh.visible = team === this.viewer || this.engine.vision.isVisible(this.viewer, base.x, base.y);
        }
        this.placeMarker();
    }
    dispose() {
        this.world.scene.remove(this.root);
    }
    isShown(entity) {
        if (entity.team === this.viewer)
            return true;
        if (entity instanceof WarBuilding)
            return this.seenBuildings.has(entity.id) || this.engine.vision.isVisible(this.viewer, entity.x, entity.y);
        return this.engine.vision.isVisible(this.viewer, entity.x, entity.y);
    }
    syncUnit(unit) {
        const mine = unit.team === this.viewer;
        const scene = this.transform.toScene(unit);
        let view = this.units.get(unit.id);
        if (!view) {
            view = new WarUnitView(this.libs, this.assets, this.materials, unit, scene, mine);
            this.units.set(unit.id, view);
            this.root.add(view.group);
        }
        const target = unit.targetId >= 0 ? this.engine.entityById(unit.targetId) : null;
        const facing = target ? this.transform.toScene(target) : null;
        view.onTick(unit, scene, facing, mine ? WarPalette.SQUAD_COLORS[Math.max(0, unit.squadIndex)] : null);
        view.show(this.isShown(unit));
    }
    syncBuilding(building) {
        const mine = building.team === this.viewer;
        let view = this.buildings.get(building.id);
        if (!view) {
            view = new WarBuildingView(this.libs, this.assets, this.materials, building, this.transform.toScene(building), mine);
            this.buildings.set(building.id, view);
            this.root.add(view.group);
        }
        if (this.engine.vision.isVisible(this.viewer, building.x, building.y))
            this.seenBuildings.add(building.id);
        view.onTick(building);
        view.show(this.isShown(building));
    }
    dropMissing(views, alive) {
        for (const id of Array.from(views.keys())) {
            if (alive.has(id))
                continue;
            const view = views.get(id);
            this.root.remove(view.group);
            views.delete(id);
        }
    }
    placeMarker() {
        const selection = this.selection;
        if (selection.kind === "slot") {
            const slot = this.engine.players[this.viewer].slotDefs[selection.index];
            this.marker.place(this.transform.toScene(slot), 1.5);
        }
        else if (selection.kind === "building" || selection.kind === "unit") {
            const entity = this.engine.entityById(selection.id);
            this.marker.place(entity && entity.alive ? this.transform.toScene(entity) : null, entity ? Math.max(0.9, entity.bodyRadius() / 100 + 0.35) : 1);
        }
        else {
            this.marker.place(null, 1);
        }
    }
}
WarMatchView.UNIT_PICK_PIXELS = 30;
WarMatchView.BUILDING_PICK_PIXELS = 52;
class WarMenuBackdrop {
    constructor(libs, assets, world) {
        this.libs = libs;
        this.assets = assets;
        this.world = world;
        this.units = [];
        this.seconds = 0;
        this.built = false;
        this.root = new libs.THREE.Group();
        this.crowd = new WarWorkerCrowd(libs, new WarViewTransform(0), 0, "#7CE0A8");
        this.root.add(this.crowd.mesh);
    }
    show() {
        if (!this.built)
            this.build();
        this.root.visible = true;
        if (!this.root.parent)
            this.world.scene.add(this.root);
    }
    hide() {
        this.root.visible = false;
    }
    render(deltaSeconds) {
        this.seconds += deltaSeconds;
        const transform = new WarViewTransform(0);
        const hq = transform.toScene(WarMapData.hq(0));
        this.world.rig.orbit(WarMenuBackdrop.RADIUS, WarMenuBackdrop.HEIGHT, (this.seconds / WarMenuBackdrop.ORBIT_SECONDS) * Math.PI * 2, hq.x, hq.z - 2);
        this.crowd.update(8, 3, this.seconds);
        for (const view of this.units)
            view.render(1, deltaSeconds, this.world.rig.perspective.quaternion);
    }
    build() {
        this.built = true;
        const transform = new WarViewTransform(0);
        const materials = new WarMaterials(this.libs);
        this.root.add(new WarGroundView(this.libs, this.assets, transform).group);
        const engine = new WarEngine({ seed: 1, factions: ["pioneer", "pioneer"] });
        const player = engine.players[0];
        ["barracks", "range", "lab", "barracks"].forEach((type, i) => {
            engine.build(0, [1, 3, 5, 7][i], type);
        });
        const hq = player.hq;
        const buildings = [hq, ...player.buildings().filter((b) => b !== hq)];
        for (const building of buildings) {
            building.buildLeft = 0;
            const view = new WarBuildingView(this.libs, this.assets, materials, building, transform.toScene(building), true);
            view.onTick(building);
            this.root.add(view.group);
        }
        const roster = ["shieldbearer", "charger", "archer", "energymage", "guardknight", "shieldbearer", "archer"];
        const post = WarMapData.post(0, 1);
        roster.forEach((id, i) => {
            const def = WarUnitCatalog.byId(id);
            const unit = new WarUnit(100 + i, 0, post.x + (i - 3) * 260, post.y - (def.kind === "ranged" ? -300 : 150), def);
            const view = new WarUnitView(this.libs, this.assets, materials, unit, transform.toScene(unit), true);
            view.onTick(unit, transform.toScene(unit), { x: 0, z: -40 }, WarPalette.SQUAD_COLORS[i % 3]);
            view.onTick(unit, transform.toScene(unit), { x: 0, z: -40 }, null);
            this.units.push(view);
            this.root.add(view.group);
        });
    }
}
WarMenuBackdrop.ORBIT_SECONDS = 90;
WarMenuBackdrop.RADIUS = 20;
WarMenuBackdrop.HEIGHT = 9;
