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
WarUnitLooks.HUMAN = { shared: false, animated: true, idleClip: "Idle", runClip: "Run", shootsFar: false };
WarUnitLooks.SKELETON = { shared: true, animated: true, idleClip: "Idle_A", runClip: "Running_A", shootsFar: false };
WarUnitLooks.LOOKS = {
    shieldbearer: { ...WarUnitLooks.HUMAN, file: "quaternius/Knight_Male.gltf", height: 3.4, attackClip: "SwordSlash" },
    charger: { ...WarUnitLooks.HUMAN, file: "quaternius/Soldier_Male.gltf", height: 3.3, attackClip: "Punch" },
    archer: { ...WarUnitLooks.HUMAN, file: "quaternius/BlueSoldier_Female.gltf", height: 3.2, attackClip: "Shoot_OneHanded", shootsFar: true },
    energymage: { shared: false, animated: true, file: "quaternius/Astronaut_BarbaraTheBee.gltf", height: 3.2, idleClip: "Idle_Gun", runClip: "Run_Gun", attackClip: "Run_Gun_Shoot", shootsFar: true },
    guardknight: { shared: false, animated: true, file: "quaternius/Mech_FinnTheFrog.gltf", height: 4.5, idleClip: "Idle", runClip: "Run", attackClip: "Kick", shootsFar: false },
    artillerytruck: { shared: false, animated: false, file: "quaternius/Rover_Round.gltf", height: 4.2, idleClip: "", runClip: "", attackClip: "", shootsFar: true },
    minion: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Minion.glb", height: 2.3, attackClip: "Melee_1H_Attack_Chop" },
    skelwarrior: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Warrior.glb", height: 2.9, attackClip: "Melee_1H_Attack_Slice_Horizontal" },
    skelarcher: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Rogue.glb", height: 2.7, attackClip: "Ranged_Bow_Release", shootsFar: true },
    skelmage: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Mage.glb", height: 2.8, attackClip: "Ranged_Magic_Shoot", shootsFar: true },
    bonegiant: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Warrior.glb", height: 5.0, attackClip: "Melee_2H_Attack_Chop" },
    necromancer: { ...WarUnitLooks.SKELETON, file: "characters/Skeleton_Mage.glb", height: 3.6, attackClip: "Ranged_Magic_Spellcasting", shootsFar: true },
};
class WarBuildingLooks {
    static decorOf(type, faction) {
        return WarBuildingLooks.DECOR[faction + ":" + type] ?? [];
    }
    static of(type, faction) {
        return WarBuildingLooks.MODELS[faction][type];
    }
    static files() {
        const files = [];
        for (const faction of Object.keys(WarBuildingLooks.MODELS)) {
            for (const type of Object.keys(WarBuildingLooks.MODELS[faction]))
                files.push(WarBuildingLooks.MODELS[faction][type].file);
        }
        for (const key of Object.keys(WarBuildingLooks.DECOR))
            for (const decor of WarBuildingLooks.DECOR[key])
                files.push(decor.file);
        return files;
    }
}
WarBuildingLooks.MODELS = {
    pioneer: {
        hq: { file: "quaternius/Base_Large.gltf", scale: 0.8 },
        barracks: { file: "quaternius/House_Single.gltf", scale: 0.9 },
        range: { file: "quaternius/House_Open.gltf", scale: 0.9 },
        lab: { file: "quaternius/GeodesicDome.gltf", scale: 0.42 },
    },
    grave: {
        hq: { file: "halloween/crypt.gltf", scale: 1.35, top: 9.5 },
        barracks: { file: "halloween/coffin_decorated.gltf", scale: 1.2 },
        range: { file: "halloween/arch_gate.gltf", scale: 0.8 },
        lab: { file: "halloween/shrine_candles.gltf", scale: 1.7 },
    },
};
WarBuildingLooks.DECOR = {
    "grave:hq": [
        { file: "halloween/pillar.gltf", x: -4.2, z: -3, scale: 1.8 }, { file: "halloween/pillar.gltf", x: 4.2, z: -3, scale: 1.8 },
        { file: "halloween/pillar.gltf", x: -4.2, z: 3, scale: 1.8 }, { file: "halloween/pillar.gltf", x: 4.2, z: 3, scale: 1.8 },
        { file: "halloween/gravestone.gltf", x: -5.4, z: 0.4, scale: 1.6 }, { file: "halloween/gravestone.gltf", x: 5.4, z: -0.4, scale: 1.6 },
        { file: "halloween/lantern_standing.gltf", x: -2.4, z: 4.6, scale: 1.8 }, { file: "halloween/lantern_standing.gltf", x: 2.4, z: 4.6, scale: 1.8 },
        { file: "halloween/skull_candle.gltf", x: -1.2, z: 5, scale: 2 }, { file: "halloween/skull_candle.gltf", x: 1.2, z: 5, scale: 2 },
    ],
};
class WarAssetLibrary {
    constructor(libs) {
        this.libs = libs;
        this.assets = new Map();
        this.rigClips = new Map();
        this.heights = new Map();
        this.loading = null;
    }
    load() {
        if (!this.loading)
            this.loading = this.loadAll();
        return this.loading;
    }
    actor(file, shared) {
        const asset = this.assetOf(file);
        return { model: this.libs.SkeletonUtils.clone(asset.scene), clips: shared ? this.rigClips : asset.clips };
    }
    model(file) {
        return this.assetOf(file).scene.clone(true);
    }
    grounded(file) {
        const THREE = this.libs.THREE;
        const model = this.model(file);
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        const holder = new THREE.Group();
        holder.add(model);
        return holder;
    }
    heightOf(file) {
        const cached = this.heights.get(file);
        if (cached !== undefined)
            return cached;
        const THREE = this.libs.THREE;
        const template = this.template(file);
        template.updateMatrixWorld(true);
        const height = Math.max(0.01, new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).y);
        this.heights.set(file, height);
        return height;
    }
    template(file) {
        return this.assetOf(file).scene;
    }
    assetOf(file) {
        const found = this.assets.get(file);
        if (!found)
            throw new Error("모델을 아직 불러오지 못했어요: " + file);
        return found;
    }
    async loadAll() {
        const loader = new this.libs.GLTFLoader();
        const files = Array.from(new Set(WarUnitLooks.files().concat(WarBuildingLooks.files(), WarAssetLibrary.EXTRA_MODELS, WarSceneryKit.files())));
        const rig = WarAssetLibrary.RIG_ANIMATIONS.map((name) => loader.loadAsync(WarAssetLibrary.ROOT + "animations/Rig_Medium_" + name + ".glb").then((gltf) => gltf.animations.forEach((clip) => this.rigClips.set(clip.name, clip))));
        await Promise.all(rig.concat(files.map((file) => loader.loadAsync(WarAssetLibrary.ROOT + file).then((gltf) => {
            const clips = new Map();
            gltf.animations.forEach((clip) => clips.set(clip.name, clip));
            this.assets.set(file, { scene: gltf.scene, clips });
        }))));
    }
}
WarAssetLibrary.ROOT = "assets/kaykit/war/";
WarAssetLibrary.EXTRA_MODELS = ["space/landingpad_large.gltf", "resources/Iron_Nuggets.gltf", "resources/Parts_Pile_Large.gltf"];
WarAssetLibrary.RIG_ANIMATIONS = ["General", "MovementBasic", "CombatMelee", "CombatRanged"];
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
        const actor = assets.actor(this.look.file, this.look.shared);
        this.model = actor.model;
        this.model.scale.setScalar(this.look.height / assets.heightOf(this.look.file));
        WarShadows.cast(this.model);
        this.group.add(this.model);
        this.animator = this.look.animated ? new CharacterAnimator(libs, this.model, actor.clips) : null;
        this.ring = new THREE.Mesh(materials.ringGeometry, materials.ring(mine ? WarPalette.SQUAD_COLORS[Math.max(0, unit.squadIndex)] : WarPalette.ENEMY));
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.y = 0.05;
        this.ring.scale.setScalar(unit.collisionRadius() / 52);
        this.bar = new WarHealthBar(libs, materials, 1.1, 0.14, mine);
        this.bar.group.position.y = this.look.height * 0.65 + 0.6;
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
    constructor(libs, assets, materials, building, position, mine, faction) {
        this.faction = faction;
        const THREE = libs.THREE;
        const look = WarBuildingLooks.of(building.def.type, faction);
        this.group = new THREE.Group();
        this.model = assets.model(look.file);
        this.model.scale.setScalar(look.scale);
        WarShadows.cast(this.model);
        this.disc = new THREE.Mesh(new THREE.CircleGeometry((building.def.radius / 100) * 1.05, 28), materials.ring(mine ? "#2E8F6B" : "#A02A30"));
        this.disc.rotation.x = -Math.PI / 2;
        this.disc.position.y = 0.03;
        this.disc.material.opacity = 0.55;
        this.bar = new WarHealthBar(libs, materials, building.def.type === "hq" ? 4 : 2.2, 0.22, mine);
        this.bar.group.position.y = look.top ?? (building.def.type === "hq" ? 6.2 : 3.4);
        this.group.add(this.disc, this.model, this.bar.group);
        for (const decor of WarBuildingLooks.decorOf(building.def.type, faction)) {
            const piece = assets.grounded(decor.file);
            piece.position.set(decor.x, 0, decor.z);
            piece.scale.setScalar(decor.scale);
            WarShadows.cast(piece);
            this.group.add(piece);
        }
        this.group.position.set(position.x, 0, position.z);
        this.group.rotation.y = mine ? Math.PI : 0;
        this.bar.group.rotation.y = -this.group.rotation.y;
    }
    onTick(building) {
        const progress = building.complete ? 1 : 1 - building.buildLeft / building.def.buildTicks;
        this.model.scale.y = (WarBuildingLooks.of(building.def.type, this.faction).scale) * (0.25 + 0.75 * progress);
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
        const noise = new WarValueNoise(4242);
        const field = new WarLaneField();
        const texture = new THREE.CanvasTexture(new WarTerrainPainter(noise, field).paint());
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        const widthM = (WarMapData.HALF_W * 2) / 100, heightM = (WarMapData.HALF_H * 2) / 100;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), new THREE.MeshLambertMaterial({ map: texture }));
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        const holder = new THREE.Group();
        holder.rotation.y = transform.team === 1 ? Math.PI : 0;
        holder.add(plane);
        this.group.add(holder);
        const scenery = new WarSceneryBuilder(libs, assets, transform, noise, field).build();
        this.detail = scenery.detail;
        this.group.add(scenery.core, scenery.detail);
        this.placeResources(assets);
    }
    glow(holder) {
        holder.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh)
                return;
            const material = mesh.material.clone();
            material.color.set("#8FEFFF");
            material.emissive.set("#1E9ACB");
            material.emissiveIntensity = 0.9;
            mesh.material = material;
        });
    }
    placeResources(assets) {
        for (const team of [0, 1]) {
            for (const point of WarMapData.orePoints(team)) {
                const node = assets.model("resources/Iron_Nuggets.gltf");
                const scene = this.transform.toScene(point);
                node.position.set(scene.x, 0, scene.z);
                node.scale.setScalar(5.2);
                node.rotation.y = point.x * 0.01;
                WarShadows.cast(node);
                this.group.add(node);
            }
            for (const point of WarMapData.crystalPoints(team)) {
                const crystal = assets.grounded("scenery/rock_crystalsLargeA.glb");
                const scene = this.transform.toScene(point);
                crystal.position.set(scene.x, 0, scene.z);
                crystal.scale.setScalar(4.6);
                this.glow(crystal);
                WarShadows.cast(crystal);
                crystal.rotation.y = point.y * 0.013;
                this.group.add(crystal);
            }
        }
    }
}
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
        const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, depthTest: false });
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry((this.canvas.width * WarMapData.VISION_CELL) / 100, (this.canvas.height * WarMapData.VISION_CELL) / 100), material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.y = 0.08;
        this.mesh.renderOrder = 5;
    }
    refresh() {
        const context = this.canvas.getContext("2d");
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        context.fillStyle = "rgba(0, 0, 0, 0.88)";
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
    static progress(phase) {
        if (phase < WarWorkerCrowd.MINE_END)
            return 0;
        if (phase < WarWorkerCrowd.GO_END)
            return (phase - WarWorkerCrowd.MINE_END) / (WarWorkerCrowd.GO_END - WarWorkerCrowd.MINE_END);
        if (phase < WarWorkerCrowd.DROP_END)
            return 1;
        return 1 - (phase - WarWorkerCrowd.DROP_END) / (1 - WarWorkerCrowd.DROP_END);
    }
    constructor(libs, assets, transform, team, color) {
        this.transform = transform;
        this.team = team;
        this.instances = new WarInstanceSet(libs, assets.template(WarSceneryKit.WORKER), WarWorkerCrowd.MAX);
        this.group = this.instances.group;
        const tint = new libs.THREE.Color(color);
        for (let i = 0; i < WarWorkerCrowd.MAX; i++)
            this.instances.tint(i, tint);
    }
    update(oreWorkers, crystalWorkers, seconds) {
        const ore = WarMapData.orePoints(this.team), crystal = WarMapData.crystalPoints(this.team);
        const hq = this.transform.toScene(WarMapData.hq(this.team));
        const total = Math.min(WarWorkerCrowd.MAX, oreWorkers + crystalWorkers);
        for (let i = 0; i < total; i++) {
            const points = i < oreWorkers ? ore : crystal;
            const node = this.transform.toScene(points[i % points.length]);
            const phase = (seconds * 0.11 + i * 0.173) % 1;
            const along = WarWorkerCrowd.progress(phase);
            const mining = phase < WarWorkerCrowd.MINE_END;
            const carryingHome = phase >= WarWorkerCrowd.MINE_END && phase < WarWorkerCrowd.DROP_END;
            const reach = 0.15 + along * 0.7;
            const x = node.x + (hq.x - node.x) * reach;
            const z = node.z + (hq.z - node.z) * reach;
            const towardHq = Math.atan2(hq.x - node.x, hq.z - node.z);
            const yaw = mining ? towardHq + Math.PI : carryingHome || phase < WarWorkerCrowd.DROP_END ? towardHq : towardHq + Math.PI;
            const bob = mining ? Math.abs(Math.sin(seconds * 6 + i * 1.7)) * 0.22 : Math.abs(Math.sin(seconds * 9 + i)) * 0.06;
            this.instances.set(i, { x, z, yaw: yaw + Math.PI, scale: 2.4, y: bob });
        }
        this.instances.finish(total);
    }
}
WarWorkerCrowd.MAX = 56;
WarWorkerCrowd.MINE_END = 0.38;
WarWorkerCrowd.GO_END = 0.62;
WarWorkerCrowd.DROP_END = 0.72;
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
WarCameraRig.LIMIT_X = 58;
WarCameraRig.LIMIT_Z = 92;
class WarShadows {
    static cast(object) {
        object.traverse((node) => {
            const mesh = node;
            if (mesh.isMesh)
                mesh.castShadow = true;
        });
    }
}
class WarWorldView {
    constructor(libs, canvas, touchDevice) {
        this.libs = libs;
        this.shadowsOn = true;
        this.playing = false;
        this.detailGroups = [];
        this.detailHidden = false;
        this.statsWanted = window.location.search.indexOf("stats") >= 0;
        this.statsFrames = 0;
        const THREE = libs.THREE;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#150E1F");
        this.scene.fog = new THREE.Fog(0x150E1F, 85, 230);
        this.scene.add(new THREE.HemisphereLight(0xFFE9D2, 0x4A3A66, 1.75));
        this.sun = new THREE.DirectionalLight(0xFFD9A8, 1.45);
        this.sun.position.set(WarWorldView.SUN_OFFSET.x, WarWorldView.SUN_OFFSET.y, WarWorldView.SUN_OFFSET.z);
        this.sun.castShadow = true;
        const half = WarWorldView.SHADOW_HALF_SIZE;
        this.sun.shadow.mapSize.set(touchDevice ? 1024 : 2048, touchDevice ? 1024 : 2048);
        this.sun.shadow.camera.left = -half;
        this.sun.shadow.camera.right = half;
        this.sun.shadow.camera.top = half;
        this.sun.shadow.camera.bottom = -half;
        this.sun.shadow.camera.near = 5;
        this.sun.shadow.camera.far = 140;
        this.sun.shadow.bias = -0.0004;
        this.sun.shadow.normalBias = 0.04;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.scene.add(this.sun, this.sun.target);
        this.rig = new WarCameraRig(libs);
        this.raycaster = new THREE.Raycaster();
        this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.governor = window.QualityGovernor
            ? window.QualityGovernor({ steps: [() => this.disableShadows(), () => this.lowerPixelRatio(), () => this.hideDetail()], storageKey: "spacewar_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 })
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
    disableShadows() {
        if (!this.shadowsOn)
            return false;
        this.shadowsOn = false;
        this.sun.castShadow = false;
        return true;
    }
    followSun() {
        const focus = this.rig.focus;
        const offset = WarWorldView.SUN_OFFSET;
        this.sun.target.position.set(focus.x, 0, focus.z);
        this.sun.position.set(focus.x + offset.x, offset.y, focus.z + offset.z);
    }
    render(deltaSeconds) {
        this.followSun();
        this.renderer.render(this.scene, this.rig.perspective);
        if (this.governor)
            this.governor.update(deltaSeconds);
        this.reportStats();
    }
    reportStats() {
        if (!this.statsWanted)
            return;
        this.statsFrames++;
        if (this.statsFrames % 120 !== 0)
            return;
        const info = this.renderer.info.render;
        console.log("그리기 호출 " + info.calls + " · 삼각형 " + info.triangles + " · 화면 배율 " + this.pixelRatio);
    }
    hideDetail() {
        if (this.detailHidden)
            return false;
        this.detailHidden = true;
        this.detailGroups.forEach((group) => { group.visible = false; });
        return true;
    }
    registerDetail(group) {
        this.detailGroups.push(group);
        group.visible = !this.detailHidden;
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
WarWorldView.SUN_OFFSET = { x: -20, y: 40, z: 15 };
WarWorldView.SHADOW_HALF_SIZE = 42;
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
class WarEffectStyles {
    static of(unitId) {
        return WarEffectStyles.STYLES[unitId] ?? WarEffectStyles.DEFAULT;
    }
}
WarEffectStyles.DEFAULT = { projectile: false, color: "#FFE9B0", size: 0.12, speed: 20, arc: 0, hit: 0.9 };
WarEffectStyles.STYLES = {
    shieldbearer: { projectile: false, color: "#FFE9B0", size: 0, speed: 0, arc: 0, hit: 0.9 },
    charger: { projectile: false, color: "#FFB070", size: 0, speed: 0, arc: 0, hit: 1 },
    archer: { projectile: true, color: "#FFF27A", size: 0.11, speed: 30, arc: 0.4, hit: 0.55 },
    energymage: { projectile: true, color: "#6FE7FF", size: 0.26, speed: 20, arc: 0, hit: 1.5 },
    guardknight: { projectile: false, color: "#FFD070", size: 0, speed: 0, arc: 0, hit: 1.4 },
    artillerytruck: { projectile: true, color: "#FF9A3C", size: 0.34, speed: 15, arc: 3.2, hit: 2.8 },
    minion: { projectile: false, color: "#E8E8D0", size: 0, speed: 0, arc: 0, hit: 0.75 },
    skelwarrior: { projectile: false, color: "#E8E8D0", size: 0, speed: 0, arc: 0, hit: 0.9 },
    skelarcher: { projectile: true, color: "#C8FFB0", size: 0.11, speed: 30, arc: 0.4, hit: 0.55 },
    skelmage: { projectile: true, color: "#C77DFF", size: 0.24, speed: 22, arc: 0, hit: 1.1 },
    bonegiant: { projectile: false, color: "#D8C8A0", size: 0, speed: 0, arc: 0, hit: 2.1 },
    necromancer: { projectile: true, color: "#A0FF9A", size: 0.22, speed: 22, arc: 0, hit: 1 },
};
class WarEffects {
    constructor(libs, transform, isVisible) {
        this.libs = libs;
        this.transform = transform;
        this.isVisible = isVisible;
        this.shots = [];
        this.bursts = [];
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const shotGeometry = new THREE.SphereGeometry(1, 8, 6);
        const burstGeometry = new THREE.SphereGeometry(0.5, 10, 8);
        for (let i = 0; i < WarEffects.POOL; i++) {
            const shot = new THREE.Mesh(shotGeometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF" }));
            shot.visible = false;
            this.group.add(shot);
            this.shots.push({ mesh: shot, active: false, from: { x: 0, z: 0 }, to: { x: 0, z: 0 }, age: 0, duration: 1, arc: 0, style: WarEffectStyles.of("") });
            const burst = new THREE.Mesh(burstGeometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.9, depthWrite: false }));
            burst.visible = false;
            this.group.add(burst);
            this.bursts.push({ mesh: burst, active: false, age: 0, life: 1, size: 1 });
        }
    }
    handle(event) {
        if (event.x === undefined || event.y === undefined)
            return;
        if (event.kind === "strike" && event.tx !== undefined && event.ty !== undefined) {
            if (!this.isVisible(event.x, event.y) && !this.isVisible(event.tx, event.ty))
                return;
            this.strike(WarEffectStyles.of(event.text), this.transform.toScene({ x: event.x, y: event.y }), this.transform.toScene({ x: event.tx, y: event.ty }));
        }
        else if (event.kind === "unitDied" && this.isVisible(event.x, event.y)) {
            this.burst(this.transform.toScene({ x: event.x, y: event.y }), "#B9B2A6", 1.6, 0.5, 0.8);
        }
        else if (event.kind === "buildingDestroyed") {
            const at = this.transform.toScene({ x: event.x, y: event.y });
            this.burst(at, "#FF8A3C", 6, 0.9, 1.5);
            this.burst(at, "#FFE08A", 3.4, 0.6, 2);
        }
        else if (event.kind === "revived" || event.kind === "raised") {
            if (this.isVisible(event.x, event.y))
                this.burst(this.transform.toScene({ x: event.x, y: event.y }), "#9CFF9A", 2.2, 0.7, 0.2);
        }
    }
    update(deltaSeconds) {
        for (const shot of this.shots) {
            if (!shot.active)
                continue;
            shot.age += deltaSeconds;
            const t = Math.min(1, shot.age / shot.duration);
            const x = shot.from.x + (shot.to.x - shot.from.x) * t;
            const z = shot.from.z + (shot.to.z - shot.from.z) * t;
            const y = 1.5 + (1.1 - 1.5) * t + shot.arc * 4 * t * (1 - t);
            shot.mesh.position.set(x, y, z);
            shot.mesh.lookAt(shot.to.x, 1.1, shot.to.z);
            if (t >= 1) {
                shot.active = false;
                shot.mesh.visible = false;
                this.burst(shot.to, shot.style.color, shot.style.hit, WarEffects.BURST_LIFE, 1.1);
            }
        }
        for (const burst of this.bursts) {
            if (!burst.active)
                continue;
            burst.age += deltaSeconds;
            const t = burst.age / burst.life;
            if (t >= 1) {
                burst.active = false;
                burst.mesh.visible = false;
                continue;
            }
            burst.mesh.scale.setScalar(burst.size * (0.35 + 0.65 * t));
            burst.mesh.material.opacity = 0.85 * (1 - t);
        }
    }
    strike(style, from, to) {
        if (!style.projectile) {
            this.burst(to, style.color, style.hit, WarEffects.BURST_LIFE, 1.1);
            return;
        }
        const shot = this.shots.find((candidate) => !candidate.active);
        if (!shot)
            return;
        const distance = Math.hypot(to.x - from.x, to.z - from.z);
        shot.active = true;
        shot.age = 0;
        shot.duration = Math.max(0.08, distance / style.speed);
        shot.from = from;
        shot.to = to;
        shot.arc = style.arc;
        shot.style = style;
        shot.mesh.material.color.set(style.color);
        shot.mesh.scale.set(style.size, style.size, style.size * (style.arc > 1 ? 1 : 3.2));
        shot.mesh.position.set(from.x, 1.5, from.z);
        shot.mesh.visible = true;
    }
    burst(at, color, size, life, height) {
        const burst = this.bursts.find((candidate) => !candidate.active);
        if (!burst)
            return;
        burst.active = true;
        burst.age = 0;
        burst.life = life;
        burst.size = size;
        burst.mesh.material.color.set(color);
        burst.mesh.position.set(at.x, height, at.z);
        burst.mesh.scale.setScalar(size * 0.35);
        burst.mesh.visible = true;
    }
}
WarEffects.POOL = 90;
WarEffects.BURST_LIFE = 0.3;
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
        const ground = new WarGroundView(libs, assets, this.transform);
        this.root.add(ground.group);
        world.registerDetail(ground.detail);
        this.fog = new WarFogView(libs, this.transform, engine.vision);
        this.root.add(this.fog.mesh);
        this.slotMarkers = new WarSlotMarkers(libs, engine.players[viewer].slotDefs, this.transform);
        this.root.add(this.slotMarkers.group);
        this.crowds = [new WarWorkerCrowd(libs, assets, this.transform, 0, viewer === 0 ? "#E4FFEE" : "#FFC4C4"), new WarWorkerCrowd(libs, assets, this.transform, 1, viewer === 1 ? "#E4FFEE" : "#FFC4C4")];
        this.crowds.forEach((crowd) => this.root.add(crowd.group));
        this.marker = new WarSelectionMarker(libs);
        this.root.add(this.marker.mesh);
        this.effects = new WarEffects(libs, this.transform, (x, y) => this.engine.vision.isVisible(this.viewer, x, y));
        this.root.add(this.effects.group);
        world.scene.add(this.root);
        const home = this.transform.toScene(WarMapData.hq(viewer));
        world.rig.setZoom(1.6);
        world.rig.focusOn(home.x, home.z + 6);
        this.onTick();
    }
    handleEvent(event) {
        this.effects.handle(event);
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
    groundWorld(clientX, clientY) {
        const hit = this.world.groundPoint(clientX, clientY);
        return hit ? this.transform.sceneToWorld(hit.x, hit.z) : null;
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
            crowd.group.visible = team === this.viewer || this.engine.vision.isVisible(this.viewer, base.x, base.y);
        }
        this.effects.update(deltaSeconds);
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
            view = new WarBuildingView(this.libs, this.assets, this.materials, building, this.transform.toScene(building), mine, this.engine.players[building.team].faction);
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
        else if (selection.kind === "unit") {
            const view = this.units.get(selection.id);
            const entity = this.engine.entityById(selection.id);
            this.marker.place(view && entity && entity.alive ? { x: view.group.position.x, z: view.group.position.z } : null, 0.9);
        }
        else if (selection.kind === "building") {
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
        this.crowd = null;
        this.seconds = 0;
        this.built = false;
        this.root = new libs.THREE.Group();
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
        if (this.crowd)
            this.crowd.update(8, 3, this.seconds);
        for (const view of this.units)
            view.render(1, deltaSeconds, this.world.rig.perspective.quaternion);
    }
    build() {
        this.built = true;
        const transform = new WarViewTransform(0);
        const materials = new WarMaterials(this.libs);
        this.root.add(new WarGroundView(this.libs, this.assets, transform).group);
        this.crowd = new WarWorkerCrowd(this.libs, this.assets, transform, 0, "#E4FFEE");
        this.root.add(this.crowd.group);
        const engine = new WarEngine({ seed: 1, factions: ["pioneer", "pioneer"] });
        const player = engine.players[0];
        ["barracks", "range", "lab", "barracks"].forEach((type, i) => {
            engine.build(0, [1, 3, 5, 7][i], type);
        });
        const hq = player.hq;
        const buildings = [hq, ...player.buildings().filter((b) => b !== hq)];
        for (const building of buildings) {
            building.buildLeft = 0;
            const view = new WarBuildingView(this.libs, this.assets, materials, building, transform.toScene(building), true, "pioneer");
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
