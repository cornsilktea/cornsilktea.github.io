"use strict";
class TerritoryLook {
    static worldX(cellX) {
        return cellX + 0.5 - TerritoryRules.SIZE / 2;
    }
    static worldZ(cellY) {
        return cellY + 0.5 - TerritoryRules.SIZE / 2;
    }
}
TerritoryLook.EMPTY_LIGHT = "#3A4565";
TerritoryLook.EMPTY_DARK = "#323C5A";
TerritoryLook.TAIL_MIX = 0.5;
TerritoryLook.OWNED_MIX = 0.12;
TerritoryLook.BASE_PLATE = 0x1B2036;
TerritoryLook.BORDER = 0xD97B4F;
TerritoryLook.TILE_SIZE = 0.92;
TerritoryLook.TILE_HEIGHT = 0.4;
TerritoryLook.CAMERA_TILT = 0.34;
TerritoryLook.CAMERA_FIT = 0.98;
TerritoryLook.CAMERA_FOLLOW = 0.3;
TerritoryLook.CAMERA_SMOOTHING = 3.2;
TerritoryLook.OTHER_SCALE = 1.25;
TerritoryLook.MINE_SCALE = 1.8;
TerritoryLook.LABEL_WIDTH = 3.2;
TerritoryLook.LABEL_HEIGHT = 0.8;
TerritoryLook.MOTION_SMOOTHING = 20;
TerritoryLook.SNAP_DISTANCE = 3;
TerritoryLook.APPEAR_MS = 320;
TerritoryLook.BURST_MS = 600;
class TerritoryColors {
    constructor(libs, participants) {
        this.table = new Float32Array(TerritoryCellCode.LIMIT * 3);
        const THREE = libs.THREE;
        const white = new THREE.Color("#FFFFFF");
        const toRgb = (color) => [color.r, color.g, color.b];
        this.emptyLight = toRgb(new THREE.Color(TerritoryLook.EMPTY_LIGHT));
        this.emptyDark = toRgb(new THREE.Color(TerritoryLook.EMPTY_DARK));
        for (let code = 0; code < TerritoryCellCode.LIMIT; code++) {
            const owner = TerritoryCellCode.ownerOf(code), tail = TerritoryCellCode.tailOf(code);
            if (tail >= 0 && tail < participants.length)
                this.store(code, toRgb(new THREE.Color(Palette.slotColor(participants[tail].slot)).lerp(white, TerritoryLook.TAIL_MIX)));
            else if (owner >= 0 && owner < participants.length)
                this.store(code, toRgb(new THREE.Color(Palette.slotColor(participants[owner].slot)).lerp(white, TerritoryLook.OWNED_MIX)));
        }
    }
    rgbOf(code, cell, out) {
        if (code === TerritoryCellCode.EMPTY) {
            const checker = (cell + Math.floor(cell / TerritoryRules.SIZE)) % 2 === 0 ? this.emptyLight : this.emptyDark;
            out[0] = checker[0];
            out[1] = checker[1];
            out[2] = checker[2];
        }
        else {
            out[0] = this.table[code * 3];
            out[1] = this.table[code * 3 + 1];
            out[2] = this.table[code * 3 + 2];
        }
        return out;
    }
    store(code, rgb) {
        this.table[code * 3] = rgb[0];
        this.table[code * 3 + 1] = rgb[1];
        this.table[code * 3 + 2] = rgb[2];
    }
}
class TerritoryTileEffect {
    shade(progress, from, to, out) {
        const weights = this.mix(progress);
        const toWeight = 1 - weights.fromWeight - weights.whiteWeight;
        for (let channel = 0; channel < 3; channel++)
            out[channel] = from[channel] * weights.fromWeight + weights.whiteWeight + to[channel] * toWeight;
    }
}
class TerritoryFillEffect extends TerritoryTileEffect {
    constructor() {
        super(...arguments);
        this.durationMs = 380;
    }
    mix(progress) {
        const eased = 1 - Math.pow(1 - progress, 2);
        return { fromWeight: 1 - eased, whiteWeight: 0 };
    }
    lift(progress) {
        return 1 + 0.55 * Math.sin(Math.PI * progress);
    }
}
class TerritoryStealEffect extends TerritoryTileEffect {
    constructor() {
        super(...arguments);
        this.durationMs = 460;
    }
    mix(progress) {
        const flashEnd = TerritoryStealEffect.FLASH_END;
        if (progress < flashEnd) {
            const flash = progress / flashEnd;
            return { fromWeight: 1 - flash, whiteWeight: flash };
        }
        return { fromWeight: 0, whiteWeight: 1 - (progress - flashEnd) / (1 - flashEnd) };
    }
    lift(progress) {
        return 1 + 1.1 * Math.sin(Math.PI * Math.min(1, progress * 1.4));
    }
}
TerritoryStealEffect.FLASH_END = 0.3;
class TerritoryTileAnimation {
    constructor(startAt, effect, from, to) {
        this.startAt = startAt;
        this.effect = effect;
        this.from = from;
        this.to = to;
    }
}
class TerritoryRipple {
    static delays(changes) {
        const delays = new Map();
        const byCell = new Map();
        changes.forEach((change) => {
            if (TerritoryCellCode.ownerOf(change.after) !== TerritoryCellCode.ownerOf(change.before))
                byCell.set(change.index, change);
        });
        const queue = [];
        byCell.forEach((change, index) => {
            if (TerritoryCellCode.tailOf(change.before) === TerritoryCellCode.ownerOf(change.after)) {
                delays.set(index, 0);
                queue.push(index);
            }
        });
        for (let head = 0; head < queue.length; head++) {
            const index = queue[head];
            const owner = TerritoryCellCode.ownerOf(byCell.get(index).after);
            const x = index % TerritoryRules.SIZE, y = Math.floor(index / TerritoryRules.SIZE);
            TerritoryDirections.ALL.forEach((direction) => {
                const nx = x + TerritoryDirections.DX[direction], ny = y + TerritoryDirections.DY[direction];
                if (nx < 0 || ny < 0 || nx >= TerritoryRules.SIZE || ny >= TerritoryRules.SIZE)
                    return;
                const next = ny * TerritoryRules.SIZE + nx;
                const neighbor = byCell.get(next);
                if (!neighbor || delays.has(next) || TerritoryCellCode.ownerOf(neighbor.after) !== owner)
                    return;
                delays.set(next, Math.min(TerritoryRipple.MAX_MS, delays.get(index) + TerritoryRipple.STEP_MS));
                queue.push(next);
            });
        }
        return delays;
    }
}
TerritoryRipple.STEP_MS = 32;
TerritoryRipple.MAX_MS = 700;
class TerritoryTiles {
    constructor(libs, world, colors) {
        this.world = world;
        this.colors = colors;
        this.shown = new Float32Array(TerritoryRules.CELL_COUNT * 3);
        this.animations = new Map();
        this.scratch = [0, 0, 0];
        this.fill = new TerritoryFillEffect();
        this.steal = new TerritoryStealEffect();
        const THREE = libs.THREE;
        const geometry = new THREE.BoxGeometry(TerritoryLook.TILE_SIZE, TerritoryLook.TILE_HEIGHT, TerritoryLook.TILE_SIZE);
        this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), TerritoryRules.CELL_COUNT);
        this.colorAttribute = new THREE.InstancedBufferAttribute(this.shown, 3);
        this.mesh.instanceColor = this.colorAttribute;
        this.mesh.frustumCulled = false;
        this.marker = new THREE.Object3D();
        for (let cell = 0; cell < TerritoryRules.CELL_COUNT; cell++)
            this.placeTile(cell, 1);
        world.add(this.mesh);
    }
    showAll(grid) {
        this.animations.clear();
        for (let cell = 0; cell < TerritoryRules.CELL_COUNT; cell++) {
            this.storeColor(cell, this.colors.rgbOf(grid.code(cell), cell, this.scratch));
            this.placeTile(cell, 1);
        }
        this.markDirty();
    }
    paint(changes, now) {
        if (!changes.length)
            return;
        const delays = TerritoryRipple.delays(changes);
        changes.forEach((change) => this.paintCell(change, now, delays.get(change.index) || 0));
        this.markDirty();
    }
    update(now) {
        if (!this.animations.size)
            return;
        this.animations.forEach((animation, cell) => {
            const progress = (now - animation.startAt) / animation.effect.durationMs;
            if (progress < 0)
                return;
            if (progress >= 1) {
                this.storeColor(cell, animation.to);
                this.placeTile(cell, 1);
                this.animations.delete(cell);
                return;
            }
            animation.effect.shade(progress, animation.from, animation.to, this.scratch);
            this.storeColor(cell, this.scratch);
            this.placeTile(cell, animation.effect.lift(progress));
        });
        this.markDirty();
    }
    dispose() {
        this.world.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.mesh.dispose();
    }
    paintCell(change, now, delay) {
        const cell = change.index;
        const to = this.colors.rgbOf(change.after, cell, [0, 0, 0]);
        const beforeOwner = TerritoryCellCode.ownerOf(change.before), afterOwner = TerritoryCellCode.ownerOf(change.after);
        const existing = this.animations.get(cell);
        if (beforeOwner === afterOwner || afterOwner < 0) {
            if (existing)
                existing.to = to;
            else
                this.storeColor(cell, to);
            return;
        }
        const from = existing ? [this.shown[cell * 3], this.shown[cell * 3 + 1], this.shown[cell * 3 + 2]] : this.colors.rgbOf(change.before, cell, [0, 0, 0]);
        const effect = beforeOwner >= 0 ? this.steal : this.fill;
        this.animations.set(cell, new TerritoryTileAnimation(now + delay, effect, from, to));
    }
    storeColor(cell, rgb) {
        this.shown[cell * 3] = rgb[0];
        this.shown[cell * 3 + 1] = rgb[1];
        this.shown[cell * 3 + 2] = rgb[2];
    }
    placeTile(cell, lift) {
        const x = cell % TerritoryRules.SIZE, y = Math.floor(cell / TerritoryRules.SIZE);
        this.marker.position.set(TerritoryLook.worldX(x), TerritoryLook.TILE_HEIGHT * lift / 2, TerritoryLook.worldZ(y));
        this.marker.scale.set(1, lift, 1);
        this.marker.updateMatrix();
        this.mesh.setMatrixAt(cell, this.marker.matrix);
    }
    markDirty() {
        this.colorAttribute.needsUpdate = true;
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}
class TerritoryScene {
    constructor(libs) {
        const THREE = libs.THREE;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(Palette.SKY);
        this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 220);
        this.scene.add(new THREE.HemisphereLight(Palette.SKY_LIGHT, Palette.GROUND_LIGHT, 1.25));
        const sun = new THREE.DirectionalLight(Palette.SUN_LIGHT, 1.1);
        sun.position.set(-6, 18, 10);
        this.scene.add(sun);
        this.world = new THREE.Group();
        this.scene.add(this.world);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(TerritoryRules.SIZE + 1.2, 0.6, TerritoryRules.SIZE + 1.2), new THREE.MeshLambertMaterial({ color: TerritoryLook.BASE_PLATE }));
        plate.position.y = -0.31;
        const rim = new THREE.Mesh(new THREE.BoxGeometry(TerritoryRules.SIZE + 1.2, 0.12, TerritoryRules.SIZE + 1.2), new THREE.MeshBasicMaterial({ color: TerritoryLook.BORDER }));
        rim.position.y = -0.7;
        this.world.add(rim, plate);
    }
    releaseMaterials() {
        this.scene.traverse((object) => {
            const mesh = object;
            if (Array.isArray(mesh.material))
                mesh.material.forEach((entry) => entry.dispose());
            else if (mesh.material)
                mesh.material.dispose();
            if (mesh.geometry)
                mesh.geometry.dispose();
        });
    }
}
class TerritoryCamera {
    constructor(camera, env) {
        this.camera = camera;
        this.env = env;
        this.focus = { x: 0, z: 0 };
        this.spin = 0;
    }
    follow(dt, target) {
        const goalX = target ? target.x * TerritoryLook.CAMERA_FOLLOW : 0;
        const goalZ = target ? target.z * TerritoryLook.CAMERA_FOLLOW : 0;
        const ratio = Math.min(1, dt * TerritoryLook.CAMERA_SMOOTHING);
        this.focus.x += (goalX - this.focus.x) * ratio;
        this.focus.z += (goalZ - this.focus.z) * ratio;
        const distance = this.fitDistance() * TerritoryLook.CAMERA_FIT;
        const tilt = TerritoryLook.CAMERA_TILT;
        this.camera.position.set(this.focus.x, Math.cos(tilt) * distance, this.focus.z + Math.sin(tilt) * distance);
        this.camera.lookAt(this.focus.x, 0, this.focus.z);
    }
    overhead() {
        const distance = this.fitDistance() * TerritoryCamera.OVERHEAD_FIT;
        this.camera.up.set(0, 0, -1);
        this.camera.position.set(0, distance, 0);
        this.camera.lookAt(0, 0, 0);
    }
    showcase(dt) {
        this.spin += dt * TerritoryCamera.SPIN_SPEED;
        const distance = this.fitDistance() * TerritoryCamera.SHOWCASE_FIT;
        const tilt = TerritoryCamera.SHOWCASE_TILT;
        const shift = TerritoryCamera.SHOWCASE_SHIFT + Math.sin(this.spin) * distance * 0.06;
        this.camera.position.set(shift, Math.cos(tilt) * distance, Math.sin(tilt) * distance);
        this.camera.lookAt(shift, 0, 0);
    }
    fitDistance() {
        const size = this.env.viewport();
        const aspect = size.width / size.height;
        const reach = Math.tan(this.camera.fov * Math.PI / 360);
        const half = TerritoryRules.SIZE / 2;
        return Math.max(half / reach, half / (reach * aspect));
    }
}
TerritoryCamera.OVERHEAD_FIT = 1.08;
TerritoryCamera.SPIN_SPEED = 0.25;
TerritoryCamera.SHOWCASE_FIT = 1.22;
TerritoryCamera.SHOWCASE_SHIFT = -7;
TerritoryCamera.SHOWCASE_TILT = 0.5;
class TerritoryMotion {
    constructor(player) {
        this.wasAlive = true;
        this.x = TerritoryLook.worldX(player.x);
        this.z = TerritoryLook.worldZ(player.y);
    }
    get worldX() { return this.x; }
    get worldZ() { return this.z; }
    advance(player, progress, dt) {
        const goalX = TerritoryLook.worldX(player.x) + TerritoryDirections.DX[player.dir] * progress;
        const goalZ = TerritoryLook.worldZ(player.y) + TerritoryDirections.DY[player.dir] * progress;
        const revived = player.alive && !this.wasAlive;
        this.wasAlive = player.alive;
        if (revived || MathUtil.distance(goalX, goalZ, this.x, this.z) > TerritoryLook.SNAP_DISTANCE) {
            this.x = goalX;
            this.z = goalZ;
        }
        else {
            const ratio = Math.min(1, dt * TerritoryLook.MOTION_SMOOTHING);
            this.x += (goalX - this.x) * ratio;
            this.z += (goalZ - this.z) * ratio;
        }
        return revived;
    }
}
class TerritoryBurst {
    constructor(libs, world, x, z, color, startedAt) {
        this.world = world;
        this.startedAt = startedAt;
        const THREE = libs.THREE;
        this.ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.set(x, 0.6, z);
        world.add(this.ring);
    }
    update(now) {
        const progress = (now - this.startedAt) / TerritoryLook.BURST_MS;
        if (progress >= 1) {
            this.dispose();
            return false;
        }
        this.ring.scale.setScalar(0.6 + progress * 3.4);
        this.ring.material.opacity = 0.9 * (1 - progress);
        return true;
    }
    dispose() {
        this.world.remove(this.ring);
        this.ring.geometry.dispose();
        this.ring.material.dispose();
    }
}
class TerritoryBursts {
    constructor(libs, world) {
        this.libs = libs;
        this.world = world;
        this.bursts = [];
    }
    add(x, z, color, now) {
        this.bursts.push(new TerritoryBurst(this.libs, this.world, x, z, color, now));
    }
    update(now) {
        this.bursts = this.bursts.filter((burst) => burst.update(now));
    }
    clear() {
        this.bursts.forEach((burst) => burst.dispose());
        this.bursts = [];
    }
}
class TerritoryRunnerView {
    constructor(kit, factory, clips, world, bursts, participant, player, look, mine) {
        this.kit = kit;
        this.factory = factory;
        this.world = world;
        this.bursts = bursts;
        this.participant = participant;
        this.appearedAt = -Infinity;
        this.wasAlive = true;
        const THREE = kit.libs.THREE;
        this.color = Palette.slotColor(participant.slot);
        this.baseScale = mine ? TerritoryLook.MINE_SCALE : TerritoryLook.OTHER_SCALE;
        this.motion = new TerritoryMotion(player);
        this.shownYaw = Math.atan2(TerritoryDirections.DX[player.dir], TerritoryDirections.DY[player.dir]);
        this.group = new THREE.Group();
        this.inner = new THREE.Group();
        this.model = factory.build(look);
        this.inner.add(this.model);
        this.group.add(this.inner);
        this.label = kit.labels.create(participant.nick + (participant.ai ? " (AI)" : ""), this.color);
        this.label.scale.set(TerritoryLook.LABEL_WIDTH * (mine ? 1.25 : 1), TerritoryLook.LABEL_HEIGHT * (mine ? 1.25 : 1), 1);
        this.blob = new THREE.Mesh(kit.blobGeometry, kit.blobMaterial);
        this.blob.rotation.x = -Math.PI / 2;
        this.blob.scale.setScalar(this.baseScale);
        world.add(this.group, this.blob, this.label);
        this.animator = new CharacterAnimator(kit.libs, this.model, clips);
        this.animator.play(FighterClips.RUN, { speed: 1.4 });
    }
    update(player, progress, now, dt) {
        const revived = this.motion.advance(player, progress, dt);
        if (this.wasAlive && !player.alive)
            this.bursts.add(this.motion.worldX, this.motion.worldZ, this.color, now);
        this.wasAlive = player.alive;
        if (revived)
            this.appearedAt = now;
        this.group.visible = player.alive;
        this.blob.visible = player.alive;
        this.label.visible = player.alive;
        if (!player.alive)
            return;
        const grow = MathUtil.clamp((now - this.appearedAt) / TerritoryLook.APPEAR_MS, 0.05, 1);
        const scale = this.baseScale * grow;
        this.group.position.set(this.motion.worldX, 0.4, this.motion.worldZ);
        this.group.scale.setScalar(scale);
        this.blob.position.set(this.motion.worldX, 0.42, this.motion.worldZ);
        this.blob.scale.setScalar(scale);
        this.label.position.set(this.motion.worldX, 0.4 + 2.5 * scale + 0.6, this.motion.worldZ);
        const targetYaw = Math.atan2(TerritoryDirections.DX[player.dir], TerritoryDirections.DY[player.dir]);
        this.shownYaw += MathUtil.angleDifference(targetYaw, this.shownYaw) * Math.min(1, dt * 18);
        this.inner.rotation.y = this.shownYaw;
        this.animator.update(dt);
    }
    dispose() {
        this.world.remove(this.group);
        this.world.remove(this.blob);
        this.world.remove(this.label);
        this.factory.disposeModel(this.model);
        const labelMaterial = this.label.material;
        if (labelMaterial.map)
            labelMaterial.map.dispose();
        labelMaterial.dispose();
    }
    focus() {
        return { x: this.motion.worldX, z: this.motion.worldZ };
    }
}
class TerritoryRunnerViews {
    constructor(kit, factory, assets, world, bursts) {
        this.kit = kit;
        this.factory = factory;
        this.assets = assets;
        this.world = world;
        this.bursts = bursts;
        this.views = new Map();
    }
    build(board, participants, looks, localId) {
        this.clear();
        board.players.forEach((player) => {
            const participant = participants[player.index];
            const look = looks.get(player.id) || CharacterLooks.createDefault();
            this.views.set(player.id, new TerritoryRunnerView(this.kit, this.factory, this.assets.clips, this.world, this.bursts, participant, player, look, player.id === localId));
        });
    }
    update(board, progress, now, dt) {
        board.players.forEach((player) => {
            const view = this.views.get(player.id);
            if (view)
                view.update(player, progress, now, dt);
        });
    }
    focusOf(id) {
        const view = this.views.get(id);
        return view ? view.focus() : null;
    }
    clear() {
        this.views.forEach((view) => view.dispose());
        this.views.clear();
    }
}
