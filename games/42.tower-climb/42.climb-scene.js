"use strict";
class ClimbModel {
    constructor(parts, min, max) {
        this.parts = parts;
        this.min = min;
        this.max = max;
    }
    get sizeX() { return this.max.x - this.min.x; }
    get sizeY() { return this.max.y - this.min.y; }
    get sizeZ() { return this.max.z - this.min.z; }
    get centerX() { return (this.max.x + this.min.x) / 2; }
    get centerZ() { return (this.max.z + this.min.z) / 2; }
}
class ClimbModelLibrary {
    constructor(libs) {
        this.libs = libs;
        this.clips = new Map();
        this.models = new Map();
        this.lambert = new Map();
    }
    async load(baseClips) {
        const loader = new this.libs.GLTFLoader(), D = ClimbModelLibrary.DIRECTORY;
        baseClips.forEach((clip, name) => this.clips.set(name, clip));
        const names = Object.keys(ClimbModelLibrary.FILES);
        const [extra, ...scenes] = await Promise.all([loader.loadAsync(D + ClimbModelLibrary.EXTRA_CLIPS), ...names.map((name) => loader.loadAsync(D + ClimbModelLibrary.FILES[name]))]);
        extra.animations.forEach((clip) => { if (!this.clips.has(clip.name))
            this.clips.set(clip.name, clip); });
        scenes.forEach((gltf, index) => this.models.set(names[index], this.flatten(gltf.scene)));
    }
    model(name) {
        const found = this.models.get(name);
        if (!found)
            throw new Error("모델이 없어요: " + name);
        return found;
    }
    flatten(scene) {
        const THREE = this.libs.THREE, parts = [], box = new THREE.Box3();
        scene.updateMatrixWorld(true);
        scene.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh)
                return;
            const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
            geometry.computeBoundingBox();
            box.union(geometry.boundingBox);
            parts.push({ geometry, material: this.lambertOf(mesh.material) });
        });
        return new ClimbModel(parts, box.min.clone(), box.max.clone());
    }
    lambertOf(source) {
        const key = source.map ? source.map.uuid : "#" + source.color.getHexString();
        let material = this.lambert.get(key);
        if (!material) {
            material = new this.libs.THREE.MeshLambertMaterial({ map: source.map, color: source.map ? 0xffffff : source.color });
            this.lambert.set(key, material);
        }
        return material;
    }
    grayOf(material) {
        const THREE = this.libs.THREE, source = material;
        if (!source.map)
            return new THREE.MeshLambertMaterial({ color: 0x8A8A8A });
        const image = source.map.image, canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height), pixels = data.data;
        for (let i = 0; i < pixels.length; i += 4) {
            const gray = pixels[i] * 0.3 + pixels[i + 1] * 0.59 + pixels[i + 2] * 0.11;
            pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
        }
        context.putImageData(data, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.flipY = source.map.flipY;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = source.map.magFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        return new THREE.MeshLambertMaterial({ map: texture });
    }
}
ClimbModelLibrary.DIRECTORY = "assets/kaykit/";
ClimbModelLibrary.EXTRA_CLIPS = "animations/glassbridge_anims.glb";
ClimbModelLibrary.FILES = {
    grass: "blocks/grass.gltf", dirt: "blocks/dirt_with_grass.gltf", stone: "blocks/stone.gltf", wood: "blocks/wood.gltf",
    yellow: "blocks/striped_block_yellow.gltf", red: "blocks/colored_block_red.gltf",
    barrel: "dungeon/barrel_large.gltf", door: "dungeon/wall_doorway.gltf",
    pebble: "forest/Rock_1_A_Color1.gltf", boulder: "forest/Rock_3_C_Color1.gltf", bush: "forest/Bush_1_C_Color1.gltf",
    tuft: "forest/Grass_1_A_Singlesided_Color1.gltf", treeA: "forest/Tree_1_B_Color1.gltf", treeB: "forest/Tree_2_B_Color1.gltf", treeC: "forest/Tree_4_B_Color1.gltf",
};
class ClimbInstanceBatcher {
    constructor(libs, library) {
        this.libs = libs;
        this.library = library;
        this.lists = new Map();
    }
    add(model, matrix) {
        const list = this.lists.get(model);
        if (list)
            list.push(matrix);
        else
            this.lists.set(model, [matrix]);
    }
    build(parent, castShadow) {
        this.lists.forEach((matrices, name) => {
            for (const part of this.library.model(name).parts) {
                const mesh = new this.libs.THREE.InstancedMesh(part.geometry, part.material, matrices.length);
                matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
                mesh.instanceMatrix.needsUpdate = true;
                mesh.computeBoundingSphere();
                mesh.castShadow = castShadow;
                mesh.receiveShadow = true;
                parent.add(mesh);
            }
        });
        this.lists.clear();
    }
}
class ClimbDecorDice {
    constructor(seed) { this.state = seed >>> 0 || 1; }
    next() {
        let s = this.state;
        s ^= s << 13;
        s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5;
        s >>>= 0;
        this.state = s;
        return s / 4294967296;
    }
    between(low, high) { return low + (high - low) * this.next(); }
}
class TowerLevelBuilder {
    constructor(libs, library, level) {
        this.libs = libs;
        this.library = library;
        this.level = level;
        this.stageGroups = new Map();
        this.batchers = new Map();
        this.marks = [];
        this.root = new libs.THREE.Group();
        this.specials = {
            island: (piece) => this.island(piece),
            trunk: (piece) => this.trunk(piece),
            hold: (piece) => this.hold(piece),
            rest: (piece) => this.rest(piece),
            cannon: (piece) => { this.block(piece); this.cannonExtras(piece); },
        };
        for (const piece of level.pieces)
            (this.specials[piece.look] ?? ((p) => this.block(p)))(piece);
        this.decorate();
        this.batchers.forEach((batcher, stage) => batcher.build(this.groupOf(stage), true));
        this.buildMarks();
    }
    showAround(stage) {
        this.stageGroups.forEach((group, index) => { group.visible = index === 0 || Math.abs(index - stage) <= 1; });
    }
    groupOf(stage) {
        let group = this.stageGroups.get(stage);
        if (!group) {
            group = new this.libs.THREE.Group();
            this.stageGroups.set(stage, group);
            this.root.add(group);
        }
        return group;
    }
    batcherOf(stage) {
        let batcher = this.batchers.get(stage);
        if (!batcher) {
            batcher = new ClimbInstanceBatcher(this.libs, this.library);
            this.batchers.set(stage, batcher);
        }
        return batcher;
    }
    fit(model, x, top, z, yaw, tilt, sx, sy, sz) {
        const THREE = this.libs.THREE;
        const matrix = new THREE.Matrix4().makeTranslation(x, top, z);
        matrix.multiply(new THREE.Matrix4().makeRotationY(yaw));
        if (tilt)
            matrix.multiply(new THREE.Matrix4().makeRotationZ(tilt));
        matrix.multiply(new THREE.Matrix4().makeScale(sx / model.sizeX, sy / model.sizeY, sz / model.sizeZ));
        matrix.multiply(new THREE.Matrix4().makeTranslation(-model.centerX, -model.max.y, -model.centerZ));
        return matrix;
    }
    block(piece) {
        const name = TowerLevelBuilder.BLOCK_OF_LOOK[piece.look] ?? "grass", model = this.library.model(name);
        const tilt = Math.atan2(piece.rise, piece.halfX * 2), length = piece.halfX * 2 / Math.cos(tilt);
        this.batcherOf(piece.stage).add(name, this.fit(model, piece.x, piece.top, piece.z, piece.yaw, tilt, length, piece.depth, piece.halfZ * 2));
    }
    trunk(piece) {
        const model = this.library.model("barrel"), T = TowerLevelBuilder, height = piece.top - piece.bottom, count = Math.ceil(height / T.TRUNK_SEGMENT), each = height / count;
        for (let i = 0; i < count; i++)
            this.batcherOf(piece.stage).add("barrel", this.fit(model, piece.x, piece.top - each * i, piece.z, i * 0.7, 0, piece.radius * 2, each, piece.radius * 2));
    }
    rest(piece) {
        const THREE = this.libs.THREE, group = this.groupOf(piece.stage);
        this.batcherOf(piece.stage).add("barrel", this.fit(this.library.model("barrel"), piece.x, piece.top, piece.z, 0, 0, piece.radius * 2, piece.depth, piece.radius * 2));
        this.batcherOf(piece.stage).add("wood", this.fit(this.library.model("wood"), piece.x, piece.top + 3.2, piece.z, 0, 0, 0.16, 3.2, 0.16));
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshBasicMaterial({ color: 0xD97B4F, side: THREE.DoubleSide }));
        flag.position.set(piece.x + 0.73, piece.top + 2.75, piece.z);
        group.add(flag);
    }
    hold(piece) {
        const THREE = this.libs.THREE, model = this.library.model("pebble");
        this.batcherOf(piece.stage).add("pebble", this.fit(model, piece.x - piece.nx * 0.1, piece.top + 0.05, piece.z - piece.nz * 0.1, piece.yaw, 0, 0.8, 0.55, 0.7));
        this.marks.push(new THREE.Matrix4().makeTranslation(piece.x + piece.nx * 0.28, piece.top + 0.12, piece.z + piece.nz * 0.28));
    }
    island(piece) {
        const THREE = this.libs.THREE;
        const ground = new THREE.Mesh(new THREE.CylinderGeometry(piece.radius, piece.radius - 2.5, piece.depth, 56), new THREE.MeshLambertMaterial({ color: 0x6FAE4E }));
        ground.position.set(piece.x, piece.top - piece.depth / 2, piece.z);
        ground.receiveShadow = true;
        this.groupOf(piece.stage).add(ground);
    }
    cannonExtras(cannon) {
        const THREE = this.libs.THREE, B = ClimbBalance, T = TowerLevelBuilder, model = this.library.model("barrel");
        const matrix = new THREE.Matrix4().makeTranslation(cannon.x - cannon.dirX * 1.9, cannon.top + 0.7, cannon.z - cannon.dirZ * 1.9);
        matrix.multiply(new THREE.Matrix4().makeRotationY(cannon.yaw));
        matrix.multiply(new THREE.Matrix4().makeRotationX(0.6));
        matrix.multiply(new THREE.Matrix4().makeScale(0.8, 0.8, 0.8));
        matrix.multiply(new THREE.Matrix4().makeTranslation(-model.centerX, -(model.max.y + model.min.y) / 2, -model.centerZ));
        this.batcherOf(cannon.stage).add("barrel", matrix);
        const up = LaunchCannon.launchUp(1), forward = LaunchCannon.launchForward(1), span = (up + Math.sqrt(up * up - 2 * B.GRAVITY * 12)) / B.GRAVITY;
        for (let i = 1; i <= T.PATH_DOTS; i++) {
            const t = span * i / (T.PATH_DOTS + 1);
            this.marks.push(new THREE.Matrix4().makeTranslation(cannon.x + cannon.dirX * forward * t, cannon.top + 1 + up * t - B.GRAVITY * t * t / 2, cannon.z + cannon.dirZ * forward * t));
        }
    }
    buildMarks() {
        const THREE = this.libs.THREE, T = TowerLevelBuilder;
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: T.MARK_COLOR }), this.marks.length);
        this.marks.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.computeBoundingSphere();
        this.groupOf(1).add(mesh);
    }
    decorate() {
        const dice = new ClimbDecorDice(4242), batcher = this.batcherOf(0), hub = this.level.pieces.find((p) => p.hub);
        if (!hub)
            return;
        const clear = (x, z, room) => Math.hypot(x - this.level.spawn.x, z - this.level.spawn.z) > room && this.level.portals.every((p) => Math.hypot(x - p.x, z - p.z) > room + 1);
        const scatter = (count, names, low, high, room, scaleLow, scaleHigh) => {
            for (let i = 0; i < count; i++) {
                const angle = dice.between(0, Math.PI * 2), rho = dice.between(low, high), x = Math.sin(angle) * rho, z = Math.cos(angle) * rho;
                const name = names[Math.floor(dice.next() * names.length)], model = this.library.model(name), scale = dice.between(scaleLow, scaleHigh), yaw = dice.between(0, Math.PI * 2);
                if (!clear(x, z, room))
                    continue;
                batcher.add(name, this.fit(model, x, hub.top + model.sizeY * scale, z, yaw, 0, model.sizeX * scale, model.sizeY * scale, model.sizeZ * scale));
            }
        };
        scatter(16, TowerLevelBuilder.TREES, hub.radius - 4, hub.radius - 1.2, 4, 1.2, 1.9);
        scatter(18, ["bush", "boulder"], 10.5, hub.radius - 1.5, 3, 1, 1.8);
        scatter(60, ["tuft"], 9, hub.radius - 1, 1, 1, 1.6);
    }
}
TowerLevelBuilder.BLOCK_OF_LOOK = {
    deck: "grass", block: "dirt", root: "dirt", rock: "stone", stump: "dirt", log: "wood", ramp: "wood", pad: "yellow", cannon: "red",
};
TowerLevelBuilder.TRUNK_SEGMENT = 5.9;
TowerLevelBuilder.MARK_COLOR = 0xFF9A4A;
TowerLevelBuilder.PATH_DOTS = 14;
TowerLevelBuilder.TREES = ["treeA", "treeB", "treeC"];
class PortalLooks {
    constructor(libs, library) {
        this.libs = libs;
        this.door = library.model("door");
        this.doorOpen = this.door.parts.map((part) => part.material);
        const grays = new Map();
        this.doorLocked = this.doorOpen.map((material) => {
            if (!grays.has(material))
                grays.set(material, library.grayOf(material));
            return grays.get(material);
        });
    }
    texture(size, heightRatio, paint) {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = Math.round(size * heightRatio);
        paint(canvas.getContext("2d"), canvas.width, canvas.height);
        const texture = new this.libs.THREE.CanvasTexture(canvas);
        texture.colorSpace = this.libs.THREE.SRGBColorSpace;
        return texture;
    }
    swirl(color) {
        const map = this.texture(256, 1, (context, width) => {
            const half = width / 2;
            context.fillStyle = "#101826";
            context.fillRect(0, 0, width, width);
            context.translate(half, half);
            context.strokeStyle = color;
            context.lineCap = "round";
            for (let arm = 0; arm < 3; arm++) {
                context.rotate(Math.PI * 2 / 3);
                context.beginPath();
                for (let step = 0; step <= 60; step++) {
                    const turn = step / 60 * Math.PI * 2.4, reach = half * 0.95 * step / 60;
                    context.lineTo(Math.cos(turn) * reach, Math.sin(turn) * reach);
                }
                context.lineWidth = 16;
                context.stroke();
            }
        });
        return new this.libs.THREE.MeshBasicMaterial({ map, side: this.libs.THREE.DoubleSide });
    }
    plate(stage, color, caption) {
        const map = this.texture(256, 0.75, (context, width, height) => {
            context.fillStyle = "rgba(16,24,38,.92)";
            context.fillRect(0, 0, width, height);
            context.strokeStyle = color;
            context.lineWidth = 10;
            context.strokeRect(5, 5, width - 10, height - 10);
            context.fillStyle = color;
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.font = '800 ' + (caption ? 112 : 140) + 'px "Nanum Gothic", "Malgun Gothic", sans-serif';
            context.fillText(String(stage), width / 2, caption ? height * 0.4 : height * 0.53);
            if (!caption)
                return;
            context.font = '800 34px "Nanum Gothic", "Malgun Gothic", sans-serif';
            context.fillText(caption, width / 2, height * 0.82);
        });
        return new this.libs.THREE.MeshBasicMaterial({ map, side: this.libs.THREE.DoubleSide });
    }
}
PortalLooks.STAGE_COLORS = { 2: "#E0A05A", 3: "#9B7BE0", 4: "#F0C04A", 5: "#7FCB5E", 6: "#6EC8FF", 7: "#F07AA8" };
PortalLooks.GRAY = "#9A9A9A";
class StagePortal {
    constructor(libs, looks, spec, built) {
        this.looks = looks;
        this.spec = spec;
        this.open = false;
        this.doorMeshes = [];
        const THREE = libs.THREE, door = looks.door, scale = StagePortal.DOOR_SCALE, color = PortalLooks.STAGE_COLORS[spec.stage] ?? "#FFFFFF";
        this.group = new THREE.Group();
        this.group.position.set(spec.x, spec.y, spec.z);
        this.group.rotation.y = spec.yaw;
        door.parts.forEach((part) => {
            const mesh = new THREE.Mesh(part.geometry, part.material);
            mesh.scale.setScalar(scale);
            mesh.position.set(-door.centerX * scale, -door.min.y * scale, -door.centerZ * scale);
            mesh.castShadow = true;
            this.doorMeshes.push(mesh);
            this.group.add(mesh);
        });
        this.swirlOpen = looks.swirl(color);
        this.swirlLocked = looks.swirl(PortalLooks.GRAY);
        this.plateOpen = looks.plate(spec.stage, color, built ? "" : "공사 중");
        this.plateLocked = looks.plate(spec.stage, PortalLooks.GRAY, built ? "" : "공사 중");
        this.swirl = new THREE.Mesh(new THREE.CircleGeometry(1.05, 28), this.swirlLocked);
        this.swirl.position.set(0, door.sizeY * scale * 0.42, door.sizeZ * scale / 2 + 0.06);
        this.plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.125), this.plateLocked);
        this.plate.position.y = door.sizeY * scale + 0.75;
        this.group.add(this.swirl, this.plate);
    }
    show(open) {
        this.open = open;
        this.doorMeshes.forEach((mesh, index) => { mesh.material = open ? this.looks.doorOpen[index] : this.looks.doorLocked[index]; });
        this.swirl.material = open ? this.swirlOpen : this.swirlLocked;
        this.plate.material = open ? this.plateOpen : this.plateLocked;
    }
    update(dt) { if (this.open)
        this.swirl.rotation.z -= StagePortal.SPIN * dt; }
}
StagePortal.DOOR_SCALE = 0.75;
StagePortal.SPIN = 1.6;
class PortalHub {
    constructor(libs, library, level) {
        this.level = level;
        const looks = new PortalLooks(libs, library);
        this.group = new libs.THREE.Group();
        this.portals = level.portals.map((spec) => new StagePortal(libs, looks, spec, level.hasStage(spec.stage)));
        this.portals.forEach((portal) => this.group.add(portal.group));
    }
    sync(progress) { this.portals.forEach((portal) => portal.show(progress.portalOpen(portal.spec.stage, this.level))); }
    showAll(open) { this.portals.forEach((portal) => portal.show(open)); }
    update(dt) { this.portals.forEach((portal) => portal.update(dt)); }
    hintNear(x, y, z, progress) {
        if (Math.abs(y) > 1.5)
            return "";
        for (const portal of this.portals) {
            const spec = portal.spec;
            if (portal.open || Math.hypot(spec.x - x, spec.z - z) > PortalHub.HINT_RANGE)
                continue;
            if (!this.level.hasStage(spec.stage))
                return "스테이지 " + spec.stage + " 은 공사 중이에요";
            if (!progress.unlocked(spec.stage))
                return "스테이지 " + (spec.stage - 1) + " 을 클리어하면 열려요";
        }
        return "";
    }
}
PortalHub.HINT_RANGE = 3;
class ClimbAvatar {
    constructor(libs, factory, clips, scene) {
        this.libs = libs;
        this.factory = factory;
        this.clips = clips;
        this.model = null;
        this.animator = null;
        this.below = [];
        this.yaw = Math.PI;
        this.onceClip = "";
        this.onceLeft = 0;
        this.lean = 0;
        const THREE = libs.THREE;
        this.root = new THREE.Group();
        this.aim = new THREE.Vector3();
        this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
        this.shadow.rotation.x = -Math.PI / 2;
        scene.add(this.root, this.shadow);
    }
    wear(look) {
        if (this.model) {
            this.root.remove(this.model);
            this.factory.disposeModel(this.model);
        }
        this.model = this.factory.build(look);
        this.model.scale.setScalar(ClimbAvatar.MODEL_SCALE);
        this.model.traverse((node) => { node.castShadow = true; });
        this.root.add(this.model);
        this.animator = new CharacterAnimator(this.libs, this.model, this.clips);
        this.animator.play("Idle_A");
    }
    playOnce(clip, seconds) { this.onceClip = clip; this.onceLeft = seconds; if (this.animator)
        this.animator.play(clip, { once: true }); }
    clipFor(body) {
        if (body.mode === "stun")
            return "Hit_A";
        if (body.mode === "climbUp")
            return body.climbPath.rising ? "Jump_Idle" : "Jump_Land";
        if (body.mode === "hang" || !body.grounded)
            return "Jump_Idle";
        return body.speed > 0.6 ? "Running_A" : "Idle_A";
    }
    follow(rules, dt) {
        const body = rules.body, blend = rules.blend, A = ClimbAvatar, position = this.root.position;
        const x = body.prevX + (body.x - body.prevX) * blend, y = body.prevY + (body.y - body.prevY) * blend, z = body.prevZ + (body.z - body.prevZ) * blend;
        if (body.hanging && body.hopTime > 0)
            position.lerp(this.aim.set(x, y, z), Math.min(1, A.HANG_FOLLOW * dt));
        else
            position.set(x, y, z);
        let turn = body.yaw - this.yaw;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        const swinging = body.hanging && body.hopTime > 0;
        this.yaw += turn * Math.min(1, (swinging ? A.SWING_TURN_RATE : A.TURN_RATE) * dt);
        this.root.rotation.y = this.yaw;
        this.leanForClimb(body, dt);
        this.root.visible = body.mode !== "portal" || body.portalTime > ClimbBalance.PORTAL_TIME * 0.45;
        const scaled = dt * rules.time.scale;
        if (this.onceLeft > 0)
            this.onceLeft -= scaled;
        else if (this.animator)
            this.animator.play(this.clipFor(body), body.mode === "stun" || body.mode === "climbUp" ? { once: true } : {});
        if (this.animator)
            this.animator.update(scaled);
        this.dropShadow(rules, position.x, position.y, position.z);
    }
    leanForClimb(body, dt) {
        const A = ClimbAvatar, path = body.climbPath;
        const goal = body.mode === "climbUp" ? A.CLIMB_LEAN * Math.sin(Math.PI * path.progress) : 0;
        this.lean += (goal - this.lean) * Math.min(1, A.LEAN_RATE * dt);
        if (this.model)
            this.model.rotation.x = this.lean;
    }
    dropShadow(rules, x, y, z) {
        let floor = -Infinity;
        for (const piece of rules.world.near(x, z, y - ClimbAvatar.SHADOW_REACH, y + 0.5, 0.5, this.below)) {
            if (!piece.solid || !piece.covers(x, z))
                continue;
            const top = piece.topAt(x, z);
            if (top <= y + 0.4 && top > floor)
                floor = top;
        }
        this.shadow.visible = floor > -Infinity;
        if (!this.shadow.visible)
            return;
        const shrink = Math.max(0.45, 1 - (y - floor) / 30);
        this.shadow.position.set(x, floor + 0.04, z);
        this.shadow.scale.setScalar(shrink);
    }
    idleShow(spawn, seconds, dt) {
        this.root.position.set(spawn.x, spawn.y, spawn.z);
        this.root.rotation.y = 0;
        this.root.visible = true;
        this.shadow.visible = true;
        this.shadow.position.set(spawn.x, spawn.y + 0.04, spawn.z);
        this.shadow.scale.setScalar(1);
        if (!this.animator)
            return;
        this.animator.play(seconds % 7 < 4.4 ? "Idle_A" : "Cheering");
        this.animator.update(dt);
    }
}
ClimbAvatar.MODEL_SCALE = 0.9;
ClimbAvatar.TURN_RATE = 14;
ClimbAvatar.SWING_TURN_RATE = 9;
ClimbAvatar.HANG_FOLLOW = 16;
ClimbAvatar.SHADOW_REACH = 45;
ClimbAvatar.CLIMB_LEAN = 0.45;
ClimbAvatar.LEAN_RATE = 12;
class ClimbCameraRig {
    constructor(camera) {
        this.camera = camera;
        this.yaw = 0;
        this.pitch = ClimbCameraRig.BASE_PITCH;
        this.autoAlign = true;
        this.reach = ClimbCameraRig.DISTANCE;
        this.idle = 0;
    }
    reset(yaw) { this.yaw = yaw; this.pitch = ClimbCameraRig.BASE_PITCH; this.reach = ClimbCameraRig.DISTANCE; }
    turn(deltaYaw, deltaPitch) {
        const C = ClimbCameraRig;
        if (deltaYaw === 0 && deltaPitch === 0)
            return;
        this.yaw -= deltaYaw;
        this.pitch = Math.max(C.PITCH_LOW, Math.min(C.PITCH_HIGH, this.pitch + deltaPitch));
        this.idle = 0;
    }
    get forwardX() { return -Math.sin(this.yaw); }
    get forwardZ() { return -Math.cos(this.yaw); }
    get rightX() { return Math.cos(this.yaw); }
    get rightZ() { return -Math.sin(this.yaw); }
    follow(rules, target, dt) {
        const C = ClimbCameraRig, body = rules.body;
        this.idle += dt;
        if (this.autoAlign && this.idle > C.AUTO_DELAY && body.grounded && body.speed > 3) {
            let turn = body.yaw + Math.PI - this.yaw;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            this.yaw += turn * Math.min(1, C.AUTO_RATE * dt);
        }
        const pitch = Math.min(C.PITCH_HIGH, this.pitch + (!body.grounded && body.vy < -C.FALL_SPEED ? C.FALL_LIFT : 0));
        const dx = Math.sin(this.yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(this.yaw) * Math.cos(pitch);
        const eyeX = target.x, eyeY = target.y + C.EYE, eyeZ = target.z;
        const free = Math.max(C.MIN_DISTANCE, rules.world.rayReach(eyeX, eyeY, eyeZ, dx, dy, dz, C.DISTANCE + C.WALL_GAP) - C.WALL_GAP);
        this.reach = free < this.reach ? free : Math.min(free, this.reach + C.EASE_OUT * dt);
        this.camera.position.set(eyeX + dx * this.reach, eyeY + dy * this.reach, eyeZ + dz * this.reach);
        this.camera.lookAt(eyeX, eyeY, eyeZ);
    }
}
ClimbCameraRig.DISTANCE = 6;
ClimbCameraRig.MIN_DISTANCE = 1.2;
ClimbCameraRig.PITCH_LOW = -0.35;
ClimbCameraRig.PITCH_HIGH = 1.25;
ClimbCameraRig.BASE_PITCH = 0.26;
ClimbCameraRig.EYE = 1.5;
ClimbCameraRig.WALL_GAP = 0.3;
ClimbCameraRig.AUTO_DELAY = 1.6;
ClimbCameraRig.AUTO_RATE = 0.9;
ClimbCameraRig.EASE_OUT = 5;
ClimbCameraRig.FALL_SPEED = 12;
ClimbCameraRig.FALL_LIFT = 0.09;
class TowerMenuBackdrop {
    constructor(camera, avatar, level) {
        this.camera = camera;
        this.avatar = avatar;
        this.level = level;
        this.angle = 0.5;
        this.seconds = 0;
    }
    update(dt) {
        const M = TowerMenuBackdrop;
        this.angle += M.ORBIT_SPEED * dt;
        this.seconds += dt;
        this.camera.position.set(Math.sin(this.angle) * M.RADIUS, M.HEIGHT, Math.cos(this.angle) * M.RADIUS);
        this.camera.lookAt(0, M.LOOK_HEIGHT, 0);
        this.avatar.idleShow(this.level.spawn, this.seconds, dt);
    }
}
TowerMenuBackdrop.ORBIT_SPEED = 0.12;
TowerMenuBackdrop.RADIUS = 34;
TowerMenuBackdrop.HEIGHT = 15;
TowerMenuBackdrop.LOOK_HEIGHT = 12;
class ClimbQualityPlan {
    constructor(renderer, sun, touch, isPlaying) {
        this.renderer = renderer;
        this.sun = sun;
        const Q = ClimbQualityPlan;
        this.ratio = Math.min(window.devicePixelRatio || 1, touch ? Q.TOUCH_RATIO : Q.DESKTOP_RATIO);
        renderer.setPixelRatio(this.ratio);
        const steps = [() => this.lowerRatio(), () => this.dropShadows()];
        this.governor = window.QualityGovernor ? window.QualityGovernor({ steps, storageKey: Q.STORAGE_KEY, isPlaying, slowSec: 0.022, slowLimit: 90 }) : null;
    }
    restore() { if (this.governor)
        this.governor.restore(); }
    update(frameSeconds) { if (this.governor)
        this.governor.update(frameSeconds); }
    lowerRatio() {
        if (this.ratio <= 1)
            return false;
        this.ratio = Math.max(1, this.ratio - ClimbQualityPlan.RATIO_STEP);
        this.renderer.setPixelRatio(this.ratio);
        return true;
    }
    dropShadows() {
        if (!this.sun.castShadow)
            return false;
        this.sun.castShadow = false;
        this.renderer.shadowMap.needsUpdate = true;
        return true;
    }
}
ClimbQualityPlan.STORAGE_KEY = "towerclimb_quality_v1";
ClimbQualityPlan.TOUCH_RATIO = 1.5;
ClimbQualityPlan.DESKTOP_RATIO = 2;
ClimbQualityPlan.RATIO_STEP = 0.25;
class ClimbWorldView {
    constructor(libs, canvas, library, factory, level, touch, isPlaying) {
        const THREE = libs.THREE, V = ClimbWorldView;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: "high-performance" });
        this.renderer.shadowMap.enabled = true;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(V.SKY);
        this.scene.fog = new THREE.Fog(V.SKY, 45, 150);
        this.camera = new THREE.PerspectiveCamera(60, 1, 0.2, 260);
        this.scene.add(new THREE.HemisphereLight(0xDFF3FF, 0x6E7F5A, 1.5));
        this.sun = new THREE.DirectionalLight(0xFFF2D8, 2.1);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(1024, 1024);
        const shadowCamera = this.sun.shadow.camera;
        shadowCamera.left = shadowCamera.bottom = -V.SHADOW_BOX;
        shadowCamera.right = shadowCamera.top = V.SHADOW_BOX;
        shadowCamera.near = 1;
        shadowCamera.far = 90;
        this.sun.shadow.bias = -0.0015;
        this.scene.add(this.sun, this.sun.target);
        this.builder = new TowerLevelBuilder(libs, library, level);
        this.portals = new PortalHub(libs, library, level);
        this.scene.add(this.builder.root, this.portals.group);
        this.avatar = new ClimbAvatar(libs, factory, library.clips, this.scene);
        this.rig = new ClimbCameraRig(this.camera);
        this.backdrop = new TowerMenuBackdrop(this.camera, this.avatar, level);
        this.quality = new ClimbQualityPlan(this.renderer, this.sun, touch, isPlaying);
        this.resize();
        window.addEventListener("resize", () => this.resize());
    }
    resize() {
        const width = window.innerWidth, height = window.innerHeight;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / Math.max(1, height);
        this.camera.updateProjectionMatrix();
    }
    aimSun() {
        const at = this.avatar.root.position, V = ClimbWorldView;
        this.sun.target.position.copy(at);
        this.sun.position.set(at.x + V.SUN_OFFSET[0], at.y + V.SUN_OFFSET[1], at.z + V.SUN_OFFSET[2]);
    }
    render() { this.aimSun(); this.renderer.render(this.scene, this.camera); }
    warmUp(progress) {
        this.portals.showAll(true);
        this.render();
        this.portals.showAll(false);
        this.render();
        this.portals.sync(progress);
    }
}
ClimbWorldView.SKY = 0x9FD3F2;
ClimbWorldView.SHADOW_BOX = 16;
ClimbWorldView.SUN_OFFSET = [14, 30, 10];
