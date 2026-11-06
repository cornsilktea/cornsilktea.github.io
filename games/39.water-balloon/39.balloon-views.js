"use strict";
class WbPalette {
    static teamColor(mode, team) {
        const list = mode === "solo" ? WbPalette.TEAM_SOLO : WbPalette.TEAM_DUO;
        return list[team % list.length];
    }
}
WbPalette.MINE = "#D97B4F";
WbPalette.TEAM_SOLO = ["#E85A5A", "#4F8DF5", "#F2C53D", "#4CBF6B", "#9B6BE8", "#EF7FB8", "#3FC7C9", "#A0784F"];
WbPalette.TEAM_DUO = ["#E85A5A", "#4F8DF5", "#F2C53D", "#4CBF6B"];
WbPalette.GRADE = ["#B8BEC9", "#5B9BFF", "#F08A3E"];
WbPalette.WATER = "#4FB4F5";
WbPalette.WATER_DEEP = "#1A5C99";
WbPalette.BALLOON = "#5AB8FF";
WbPalette.BALLOON_HOT = "#FF5A4A";
WbPalette.BUBBLE = "#A8E0FF";
WbPalette.WARN = "#FF4A3D";
WbPalette.SHIELD = "#FFD37A";
WbPalette.PREVIEW = "#8FD3FF";
class WbSpace {
    static worldX(x) { return (x - WbGrid.W / 2) * WbSpace.CELL; }
    static worldZ(z) { return (z - WbGrid.H / 2) * WbSpace.CELL; }
    static cellX(i) { return WbSpace.worldX(i + 0.5); }
    static cellZ(j) { return WbSpace.worldZ(j + 0.5); }
}
WbSpace.CELL = 2;
class WbCodeProps {
    static pullupBar(libs) {
        const THREE = libs.THREE, group = new THREE.Group();
        const metal = new THREE.MeshLambertMaterial({ color: "#C8D2DC" }), paint = new THREE.MeshLambertMaterial({ color: "#E0663F" });
        const heights = [2.8, 2.2, 1.6];
        heights.forEach((h, k) => {
            const x = -0.9 + k * 0.9;
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, h, 8), paint);
            post.position.set(x, h / 2, 0);
            group.add(post);
            if (k < heights.length - 1) {
                const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), metal);
                bar.rotation.z = Math.PI / 2;
                bar.position.set(x + 0.45, heights[k + 1] - 0.05, 0);
                group.add(bar);
            }
        });
        const foot = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: "#B79C74" }));
        foot.position.y = 0.04;
        group.add(foot);
        return group;
    }
}
WbCodeProps.BUILDERS = {
    pullupBar: (libs) => WbCodeProps.pullupBar(libs),
};
class WbModelLibrary {
    constructor(libs) {
        this.libs = libs;
        this.clips = new Map();
        this.templates = new Map();
        this.bounds = new Map();
    }
    static modelNames() {
        const names = new Set();
        for (const theme of WbMapCatalog.THEMES) {
            for (const variant of [...theme.pillars, ...theme.boxes, theme.wall])
                for (const part of variant)
                    if (part.model)
                        names.add(part.model);
        }
        return Array.from(names);
    }
    async load(characterClips) {
        characterClips.forEach((clip, name) => this.clips.set(name, clip));
        const THREE = this.libs.THREE, loader = new this.libs.GLTFLoader();
        const models = WbModelLibrary.modelNames().map((name) => loader.loadAsync(WbModelLibrary.DIRECTORY + name + ".gltf").then((gltf) => {
            gltf.scene.traverse((node) => {
                const mesh = node;
                if (!mesh.isMesh || Array.isArray(mesh.material))
                    return;
                const source = mesh.material;
                mesh.material = new THREE.MeshLambertMaterial({ map: source.map, color: source.color });
            });
            this.templates.set(name, gltf.scene);
            this.bounds.set(name, new THREE.Box3().setFromObject(gltf.scene));
        }));
        const clips = loader.loadAsync(WbModelLibrary.ANIMATION_FILE).then((gltf) => gltf.animations.forEach((clip) => this.clips.set(clip.name, clip)));
        await Promise.all([...models, clips]);
    }
    part(spec) {
        const THREE = this.libs.THREE;
        const holder = new THREE.Group();
        const inner = spec.shape ? WbCodeProps.BUILDERS[spec.shape](this.libs) : this.clone(spec.model || "");
        if (spec.tint !== undefined)
            this.paint(inner, spec.tint);
        const box = spec.shape ? new THREE.Box3().setFromObject(inner) : (this.bounds.get(spec.model || "") || new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5)));
        const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
        const scale = spec.width / Math.max(0.01, size.x, size.z);
        const scaleY = spec.height ? spec.height / Math.max(0.01, size.y) : scale;
        inner.scale.set(scale, scaleY, scale);
        inner.position.set(-center.x * scale, -box.min.y * scaleY, -center.z * scale);
        const turn = new THREE.Group();
        turn.rotation.y = spec.yaw || 0;
        turn.position.set(spec.dx || 0, spec.lift || 0, spec.dz || 0);
        turn.add(inner);
        holder.add(turn);
        return holder;
    }
    paint(model, tint) {
        model.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh || Array.isArray(mesh.material))
                return;
            const material = mesh.material.clone();
            material.color.set(tint);
            mesh.material = material;
        });
    }
    clone(name) {
        const template = this.templates.get(name);
        return template ? template.clone(true) : new this.libs.THREE.Group();
    }
}
WbModelLibrary.DIRECTORY = "assets/kaykit/balloon/";
WbModelLibrary.ANIMATION_FILE = "assets/kaykit/animations/snow_anims.glb?v=2";
class WbInstancedProp {
    constructor(libs, holder, count, shadows) {
        this.libs = libs;
        this.count = count;
        this.meshes = [];
        const THREE = libs.THREE;
        this.matrix = new THREE.Matrix4();
        this.position = new THREE.Vector3();
        this.rotation = new THREE.Quaternion();
        this.scale = new THREE.Vector3();
        this.up = new THREE.Vector3(0, 1, 0);
        holder.updateMatrixWorld(true);
        holder.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh || Array.isArray(mesh.material))
                return;
            const geometry = mesh.geometry.clone();
            geometry.applyMatrix4(mesh.matrixWorld);
            const instanced = new THREE.InstancedMesh(geometry, mesh.material, Math.max(1, count));
            instanced.castShadow = shadows;
            instanced.receiveShadow = true;
            this.meshes.push(instanced);
        });
        for (let k = 0; k < count; k++)
            this.hide(k);
    }
    addTo(parent) { for (const mesh of this.meshes)
        parent.add(mesh); }
    place(k, x, y, z, yaw, size) {
        this.position.set(x, y, z);
        this.rotation.setFromAxisAngle(this.up, yaw);
        this.scale.set(size, size, size);
        this.matrix.compose(this.position, this.rotation, this.scale);
        for (const mesh of this.meshes) {
            mesh.setMatrixAt(k, this.matrix);
            mesh.instanceMatrix.needsUpdate = true;
        }
    }
    hide(k) {
        this.matrix.makeScale(0, 0, 0);
        for (const mesh of this.meshes) {
            mesh.setMatrixAt(k, this.matrix);
            mesh.instanceMatrix.needsUpdate = true;
        }
    }
    dispose(parent) {
        for (const mesh of this.meshes) {
            parent.remove(mesh);
            mesh.geometry.dispose();
            mesh.dispose();
        }
    }
}
class WbFloorView {
    constructor(libs, theme) {
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const positions = [], colors = [], indices = [];
        const a = new THREE.Color(theme.floorA), b = new THREE.Color(theme.floorB);
        const half = WbSpace.CELL / 2;
        for (let j = 0; j < WbGrid.H; j++)
            for (let i = 0; i < WbGrid.W; i++) {
                const cx = WbSpace.cellX(i), cz = WbSpace.cellZ(j), color = (i + j) % 2 ? b : a, base = positions.length / 3;
                for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
                    positions.push(cx + dx, 0, cz + dz);
                    colors.push(color.r, color.g, color.b);
                }
                indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
            }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const board = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
        board.receiveShadow = true;
        const outside = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ color: theme.outside }));
        outside.rotation.x = -Math.PI / 2;
        outside.position.y = -0.02;
        outside.receiveShadow = true;
        this.group.add(board, outside);
    }
}
WbFloorView.BORDER = 1;
class WbBoardView {
    constructor(libs, library, theme, grid) {
        this.theme = theme;
        this.pops = new Map();
        this.group = new libs.THREE.Group();
        const wallSlots = (WbGrid.W + 2) * 2 + WbGrid.H * 2;
        this.pillars = theme.pillars.map((variant) => this.instanced(libs, library, variant, WbGrid.COUNT));
        this.boxes = theme.boxes.map((variant) => this.instanced(libs, library, variant, WbGrid.COUNT));
        this.walls = [this.instanced(libs, library, theme.wall, wallSlots)];
        this.shown = new Uint8Array(WbGrid.COUNT);
        for (let k = 0; k < WbGrid.COUNT; k++) {
            const kind = grid.cells[k];
            if (kind === WbCell.PILLAR)
                this.pillarAt(k);
            if (kind === WbCell.BOX)
                this.showBox(k, 1);
        }
        this.layWalls();
    }
    instanced(libs, library, variant, count) {
        const holder = new libs.THREE.Group();
        for (const part of variant)
            holder.add(library.part(part));
        const prop = new WbInstancedProp(libs, holder, count, true);
        prop.addTo(this.group);
        return prop;
    }
    variantOf(list, k) {
        const i = WbGrid.col(k), j = WbGrid.row(k);
        return list[((i >> 1) + (j >> 1) + i * 7 + j * 3) % list.length];
    }
    pillarAt(k) {
        const prop = this.variantOf(this.pillars, k);
        prop.place(k, WbSpace.cellX(WbGrid.col(k)), 0, WbSpace.cellZ(WbGrid.row(k)), 0, 1);
    }
    showBox(k, size) {
        const prop = this.variantOf(this.boxes, k);
        if (size <= 0.001)
            prop.hide(k);
        else
            prop.place(k, WbSpace.cellX(WbGrid.col(k)), 0, WbSpace.cellZ(WbGrid.row(k)), 0, size);
        this.shown[k] = size > 0.001 ? 1 : 0;
    }
    layWalls() {
        const wall = this.walls[0];
        let n = 0;
        for (let i = -1; i <= WbGrid.W; i++) {
            wall.place(n++, WbSpace.cellX(i), 0, WbSpace.cellZ(-1), 0, 1);
            wall.place(n++, WbSpace.cellX(i), 0, WbSpace.cellZ(WbGrid.H), Math.PI, 1);
        }
        for (let j = 0; j < WbGrid.H; j++) {
            wall.place(n++, WbSpace.cellX(-1), 0, WbSpace.cellZ(j), Math.PI / 2, 1);
            wall.place(n++, WbSpace.cellX(WbGrid.W), 0, WbSpace.cellZ(j), -Math.PI / 2, 1);
        }
    }
    sync(grid, dt) {
        for (let k = 0; k < WbGrid.COUNT; k++) {
            const box = grid.cells[k] === WbCell.BOX;
            if (box && !this.shown[k]) {
                this.pops.delete(k);
                this.showBox(k, 1);
            }
            else if (!box && this.shown[k] && !this.pops.has(k)) {
                if (grid.cells[k] === WbCell.WALL)
                    this.showBox(k, 0);
                else
                    this.pops.set(k, 0);
            }
        }
        for (const [k, age] of Array.from(this.pops)) {
            const next = age + dt, t = next / WbBoardView.POP;
            if (t >= 1) {
                this.pops.delete(k);
                this.showBox(k, 0);
                continue;
            }
            this.pops.set(k, next);
            const size = t < 0.35 ? 1 + t / 0.35 * 0.15 : 1.15 * (1 - (t - 0.35) / 0.65);
            this.showBox(k, Math.max(0.002, size));
        }
    }
    dispose(parent) {
        for (const prop of [...this.pillars, ...this.boxes, ...this.walls])
            prop.dispose(this.group);
        parent.remove(this.group);
    }
}
WbBoardView.POP = 0.18;
class WbBlockView {
    constructor(libs, theme) {
        this.libs = libs;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.matrix = new THREE.Matrix4();
        const blockGeometry = new THREE.BoxGeometry(1.96, 1.7, 1.96);
        blockGeometry.translate(0, 0.85, 0);
        this.blocks = new THREE.InstancedMesh(blockGeometry, new THREE.MeshLambertMaterial({ color: theme.block }), WbGrid.COUNT);
        this.blocks.castShadow = true;
        this.blocks.receiveShadow = true;
        const tile = new THREE.PlaneGeometry(1.9, 1.9);
        tile.rotateX(-Math.PI / 2);
        this.warnMaterial = new THREE.MeshBasicMaterial({ color: WbPalette.WARN, transparent: true, opacity: 0.5, depthWrite: false });
        this.warnTiles = new THREE.InstancedMesh(tile, this.warnMaterial, WbGrid.COUNT);
        this.warnTiles.position.y = 0.03;
        this.warnTiles.renderOrder = 2;
        const disc = new THREE.CircleGeometry(1, 20);
        disc.rotateX(-Math.PI / 2);
        this.shadows = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.35, depthWrite: false }), WbGrid.COUNT);
        this.shadows.position.y = 0.04;
        this.shadows.renderOrder = 3;
        for (let k = 0; k < WbGrid.COUNT; k++) {
            this.hideAt(this.blocks, k);
            this.hideAt(this.warnTiles, k);
            this.hideAt(this.shadows, k);
        }
        for (const mesh of [this.blocks, this.warnTiles, this.shadows]) {
            mesh.frustumCulled = false;
            this.group.add(mesh);
        }
    }
    hideAt(mesh, k) {
        this.matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(k, this.matrix);
    }
    putAt(mesh, k, y, size) {
        this.matrix.makeScale(size, size, size);
        this.matrix.setPosition(WbSpace.cellX(WbGrid.col(k)), y, WbSpace.cellZ(WbGrid.row(k)));
        mesh.setMatrixAt(k, this.matrix);
    }
    sync(grid, sudden, tickTime) {
        const blink = 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(tickTime / WbBalance.RATE * Math.PI * 10));
        this.warnMaterial.opacity = blink;
        for (let n = 0; n < sudden.order.length; n++) {
            const k = sudden.order[n], warn = sudden.warnAt[n], land = sudden.landAt[n];
            if (grid.cells[k] === WbCell.WALL) {
                this.putAt(this.blocks, k, 0, 1);
                this.hideAt(this.warnTiles, k);
                this.hideAt(this.shadows, k);
                continue;
            }
            if (tickTime < warn || tickTime >= land) {
                this.hideAt(this.blocks, k);
                this.hideAt(this.warnTiles, k);
                this.hideAt(this.shadows, k);
                continue;
            }
            const p = (tickTime - warn) / Math.max(1, land - warn);
            const q = Math.max(0, (p - WbBlockView.HOVER) / (1 - WbBlockView.HOVER));
            if (p < WbBlockView.HOVER)
                this.hideAt(this.blocks, k);
            else
                this.putAt(this.blocks, k, WbBlockView.DROP_HEIGHT * (1 - q * q), 1);
            this.putAt(this.warnTiles, k, 0, 1);
            this.putAt(this.shadows, k, 0, 0.25 + 0.7 * p);
        }
        this.blocks.instanceMatrix.needsUpdate = true;
        this.warnTiles.instanceMatrix.needsUpdate = true;
        this.shadows.instanceMatrix.needsUpdate = true;
    }
    dispose(parent) {
        for (const mesh of [this.blocks, this.warnTiles, this.shadows]) {
            mesh.geometry.dispose();
            mesh.dispose();
        }
        parent.remove(this.group);
    }
}
WbBlockView.DROP_HEIGHT = 8;
WbBlockView.HOVER = 0.45;
class WbTrail {
    constructor() {
        this.points = new Map();
    }
    feed(key, x, z, tick) {
        const point = this.points.get(key);
        if (!point) {
            this.points.set(key, { prevX: x, prevZ: z, curX: x, curZ: z, tick });
            return;
        }
        if (point.tick === tick)
            return;
        const jump = Math.abs(x - point.curX) + Math.abs(z - point.curZ) > 1.5;
        point.prevX = jump ? x : point.curX;
        point.prevZ = jump ? z : point.curZ;
        point.curX = x;
        point.curZ = z;
        point.tick = tick;
    }
    at(key, tickTime) {
        const point = this.points.get(key);
        if (!point)
            return { x: 0, z: 0 };
        const f = Math.max(0, Math.min(1, tickTime - point.tick));
        return { x: point.prevX + (point.curX - point.prevX) * f, z: point.prevZ + (point.curZ - point.prevZ) * f };
    }
    keep(keys) { for (const key of Array.from(this.points.keys()))
        if (!keys.has(key))
            this.points.delete(key); }
}
class WbBalloonView {
    constructor(libs) {
        this.libs = libs;
        this.trail = new WbTrail();
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.matrix = new THREE.Matrix4();
        this.cool = new THREE.Color(WbPalette.BALLOON);
        this.hot = new THREE.Color(WbPalette.BALLOON_HOT);
        this.mixed = new THREE.Color();
        const r = WbBalloonView.RADIUS;
        const body = new THREE.SphereGeometry(r, 18, 14);
        body.scale(1, 1.08, 1);
        body.translate(0, r * 1.08, 0);
        this.bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.86, roughness: 0.18, metalness: 0 }), WbBalloonView.POOL);
        this.bodies.castShadow = true;
        const knot = new THREE.ConeGeometry(0.13, 0.22, 8);
        knot.rotateX(Math.PI);
        knot.translate(0, r * 2.16 + 0.06, 0);
        this.knots = new THREE.InstancedMesh(knot, new THREE.MeshLambertMaterial({ color: "#2F7FD0" }), WbBalloonView.POOL);
        const shine = new THREE.SphereGeometry(0.12, 8, 6);
        shine.translate(-0.22, r * 1.45, 0.26);
        this.shines = new THREE.InstancedMesh(shine, new THREE.MeshBasicMaterial({ color: "#FFFFFF" }), WbBalloonView.POOL);
        for (const mesh of [this.bodies, this.knots, this.shines]) {
            mesh.frustumCulled = false;
            mesh.count = 0;
            this.group.add(mesh);
        }
    }
    sync(source) {
        const tickTime = source.tickTime, list = source.balloons.slice(0, WbBalloonView.POOL);
        const keys = new Set();
        list.forEach((b, n) => {
            keys.add(b.id);
            this.trail.feed(b.id, b.x, b.z, source.tick);
            const at = this.trail.at(b.id, tickTime);
            const age = (tickTime - b.placedAt) / WbBalance.RATE, left = (b.explodeAt - tickTime) / WbBalance.RATE;
            let size = 1 + Math.sin(age * Math.PI * 4) * 0.03, hot = 0;
            if (age < 0.15)
                size *= 0.6 + 0.4 * (age / 0.15);
            if (left < WbBalance.PULSE) {
                const beat = 0.5 + 0.5 * Math.sin(age * Math.PI * 14);
                size *= 1 + beat * 0.13;
                hot = 0.35 + 0.65 * beat * (1 - Math.max(0, left) / WbBalance.PULSE) + 0.2;
            }
            this.matrix.makeScale(size, size * (1 - (size - 1) * 0.4), size);
            this.matrix.setPosition(WbSpace.worldX(at.x), 0.02, WbSpace.worldZ(at.z));
            for (const mesh of [this.bodies, this.knots, this.shines])
                mesh.setMatrixAt(n, this.matrix);
            this.mixed.copy(this.cool).lerp(this.hot, Math.min(1, hot));
            this.bodies.setColorAt(n, this.mixed);
        });
        this.trail.keep(keys);
        for (const mesh of [this.bodies, this.knots, this.shines]) {
            mesh.count = list.length;
            mesh.instanceMatrix.needsUpdate = true;
        }
        if (this.bodies.instanceColor)
            this.bodies.instanceColor.needsUpdate = true;
    }
    dispose(parent) { parent.remove(this.group); }
}
WbBalloonView.POOL = 48;
WbBalloonView.RADIUS = 0.62;
class WbBlastPreview {
    static cells(source) {
        const tickTime = source.tickTime, near = WbBalance.PREVIEW * WbBalance.RATE;
        const byCell = new Map();
        for (const b of source.balloons)
            byCell.set(WbGrid.index(Math.floor(b.x), Math.floor(b.z)), b);
        const queue = source.balloons.filter((b) => b.explodeAt - tickTime <= near);
        const done = new Set(), wet = new Set();
        while (queue.length) {
            const b = queue.shift();
            if (done.has(b.id))
                continue;
            done.add(b.id);
            for (const k of WbFairBoxLayout.wetCross(source.grid, Math.floor(b.x), Math.floor(b.z), b.range)) {
                wet.add(k);
                const other = byCell.get(k);
                if (other && !done.has(other.id))
                    queue.push(other);
            }
        }
        return wet;
    }
}
class WbSplashView {
    constructor(libs) {
        this.libs = libs;
        this.dropState = [];
        this.dropCursor = 0;
        this.dropsPerCell = 2;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.matrix = new THREE.Matrix4();
        const water = new THREE.MeshStandardMaterial({ color: WbPalette.WATER, emissive: WbPalette.WATER_DEEP, emissiveIntensity: 0.35, transparent: true, opacity: 0.74, roughness: 0.12, metalness: 0, depthWrite: false });
        const column = new THREE.CylinderGeometry(0.72, 0.86, 1, 12, 1);
        column.translate(0, 0.5, 0);
        this.columns = new THREE.InstancedMesh(column, water, WbGrid.COUNT);
        this.columns.renderOrder = 4;
        const tile = new THREE.PlaneGeometry(1.95, 1.95);
        tile.rotateX(-Math.PI / 2);
        this.puddles = new THREE.InstancedMesh(tile, new THREE.MeshBasicMaterial({ color: WbPalette.WATER, transparent: true, opacity: 0.55, depthWrite: false }), WbGrid.COUNT);
        this.puddles.position.y = 0.025;
        this.puddles.renderOrder = 2;
        this.preview = new THREE.InstancedMesh(tile, new THREE.MeshBasicMaterial({ color: WbPalette.PREVIEW, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }), WbGrid.COUNT);
        this.preview.position.y = 0.035;
        this.preview.renderOrder = 2;
        this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshLambertMaterial({ color: "#8FD3FF", transparent: true, opacity: 0.9 }), WbSplashView.DROPS);
        for (let k = 0; k < WbSplashView.DROPS; k++)
            this.dropState.push({ x: 0, y: -9, z: 0, vx: 0, vy: 0, vz: 0, age: 9 });
        for (const mesh of [this.columns, this.puddles, this.preview, this.drops]) {
            mesh.frustumCulled = false;
            this.group.add(mesh);
        }
        for (let k = 0; k < WbGrid.COUNT; k++)
            for (const mesh of [this.columns, this.puddles, this.preview])
                this.hideAt(mesh, k);
        for (let k = 0; k < WbSplashView.DROPS; k++)
            this.hideAt(this.drops, k);
    }
    hideAt(mesh, k) {
        this.matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(k, this.matrix);
    }
    spray(cells, center) {
        for (const k of cells) {
            const x = WbSpace.cellX(WbGrid.col(k)), z = WbSpace.cellZ(WbGrid.row(k));
            const count = k === center ? this.dropsPerCell * 3 : this.dropsPerCell;
            for (let n = 0; n < count; n++) {
                const d = this.dropState[this.dropCursor];
                this.dropCursor = (this.dropCursor + 1) % WbSplashView.DROPS;
                const angle = ((k * 37 + n * 101 + this.dropCursor * 13) % 360) * Math.PI / 180;
                const out = 1.6 + ((k + n * 7) % 5) * 0.5;
                d.x = x;
                d.z = z;
                d.y = 0.8;
                d.vx = Math.cos(angle) * out;
                d.vz = Math.sin(angle) * out;
                d.vy = 4.5 + ((k * 3 + n) % 4) * 0.8;
                d.age = 0;
            }
        }
    }
    sync(source, dt) {
        const tickTime = source.tickTime, flow = WbBalance.FLOW * WbBalance.RATE, linger = 0.45 * WbBalance.RATE;
        for (let k = 0; k < WbGrid.COUNT; k++) {
            const until = source.wetUntil[k];
            const left = until - tickTime;
            const x = WbSpace.cellX(WbGrid.col(k)), z = WbSpace.cellZ(WbGrid.row(k));
            if (left > 0 && left <= flow + 1) {
                const t = 1 - left / flow;
                const rise = Math.min(1, t / 0.16), fall = t > 0.7 ? (1 - t) / 0.3 : 1;
                const height = (0.25 + 1.15 * rise * fall) * (1 + Math.sin(tickTime * 0.9 + k) * 0.06);
                const width = 0.85 + 0.2 * rise * fall;
                this.matrix.makeScale(width, height, width);
                this.matrix.setPosition(x, 0, z);
                this.columns.setMatrixAt(k, this.matrix);
            }
            else
                this.hideAt(this.columns, k);
            if (until >= 0 && left > -linger && left <= flow + 1) {
                const fade = left > 0 ? 1 : 1 + left / linger;
                this.matrix.makeScale(0.6 + 0.4 * fade, 1, 0.6 + 0.4 * fade);
                this.matrix.setPosition(x, 0, z);
                this.puddles.setMatrixAt(k, this.matrix);
            }
            else
                this.hideAt(this.puddles, k);
        }
        const preview = WbBlastPreview.cells(source);
        for (let k = 0; k < WbGrid.COUNT; k++) {
            if (!preview.has(k)) {
                this.hideAt(this.preview, k);
                continue;
            }
            this.matrix.makeScale(1, 1, 1);
            this.matrix.setPosition(WbSpace.cellX(WbGrid.col(k)), 0, WbSpace.cellZ(WbGrid.row(k)));
            this.preview.setMatrixAt(k, this.matrix);
        }
        this.dropState.forEach((d, k) => {
            if (d.age >= WbSplashView.DROP_LIFE) {
                this.hideAt(this.drops, k);
                return;
            }
            d.age += dt;
            d.vy -= 16 * dt;
            d.x += d.vx * dt;
            d.y = Math.max(0.05, d.y + d.vy * dt);
            d.z += d.vz * dt;
            const s = 1 - d.age / WbSplashView.DROP_LIFE * 0.6;
            this.matrix.makeScale(s, s, s);
            this.matrix.setPosition(d.x, d.y, d.z);
            this.drops.setMatrixAt(k, this.matrix);
        });
        for (const mesh of [this.columns, this.puddles, this.preview, this.drops])
            mesh.instanceMatrix.needsUpdate = true;
    }
    dispose(parent) { parent.remove(this.group); }
}
WbSplashView.DROPS = 180;
WbSplashView.DROP_LIFE = 0.55;
class WbItemIcon {
    constructor(libs) {
        this.libs = libs;
        this.cache = new Map();
    }
    material(kind, grade) {
        const key = kind + grade;
        const cached = this.cache.get(key);
        if (cached)
            return cached;
        const THREE = this.libs.THREE;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const g = canvas.getContext("2d");
        const color = WbPalette.GRADE[grade] || WbPalette.GRADE[0];
        g.beginPath();
        g.arc(64, 64, 56, 0, Math.PI * 2);
        g.fillStyle = "rgba(16,28,48,0.9)";
        g.fill();
        g.lineWidth = 9;
        g.strokeStyle = color;
        g.stroke();
        this.drawGlyph(g, kind);
        if (grade === 1 && WbLootTable.FACTORIES[kind](grade) instanceof WbStatItem)
            this.badge(g, "+2", color);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
        this.cache.set(key, material);
        return material;
    }
    drawGlyph(g, kind) {
        g.textAlign = "center";
        g.textBaseline = "middle";
        if (kind === "range" || kind === "maxRange") {
            this.cross(g, kind === "maxRange");
            return;
        }
        g.font = "62px \"Segoe UI Emoji\", \"Noto Color Emoji\", sans-serif";
        g.fillText(WbItemIcon.GLYPH[kind] || "?", 64, 68);
        if (kind === "kick")
            this.badge(g, "킥", WbPalette.MINE);
    }
    cross(g, max) {
        g.fillStyle = "#4FB4F5";
        g.fillRect(28, 56, 72, 16);
        g.fillRect(56, 28, 16, 72);
        g.fillStyle = "#D8F0FF";
        g.fillRect(56, 56, 16, 16);
        if (!max)
            return;
        g.font = "bold 30px \"Nanum Gothic\", \"Malgun Gothic\", sans-serif";
        g.lineWidth = 6;
        g.strokeStyle = "#10203A";
        g.strokeText("MAX", 64, 92);
        g.fillStyle = "#FFFFFF";
        g.fillText("MAX", 64, 92);
    }
    badge(g, text, color) {
        g.beginPath();
        g.arc(98, 98, 24, 0, Math.PI * 2);
        g.fillStyle = color;
        g.fill();
        g.font = "bold 24px \"Nanum Gothic\", \"Malgun Gothic\", sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#FFFFFF";
        g.fillText(text, 98, 100);
    }
}
WbItemIcon.GLYPH = { balloon: "💧", shoe: "👟", needle: "📌", kick: "👟", shield: "🛡" };
class WbItemView {
    constructor(libs) {
        this.libs = libs;
        this.items = new Map();
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.icons = new WbItemIcon(libs);
        this.glowGeometry = new THREE.CircleGeometry(0.85, 24);
        this.glowGeometry.rotateX(-Math.PI / 2);
        this.glowMaterials = WbPalette.GRADE.map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    }
    sync(floor, seconds) {
        const THREE = this.libs.THREE;
        for (const [k, item] of this.items)
            if (!floor.has(k) || floor.get(k).kind + floor.get(k).grade !== item.key) {
                this.group.remove(item.holder);
                this.items.delete(k);
            }
        for (const [k, data] of floor) {
            if (this.items.has(k))
                continue;
            const holder = new THREE.Group();
            holder.position.set(WbSpace.cellX(WbGrid.col(k)), 0, WbSpace.cellZ(WbGrid.row(k)));
            const glow = new THREE.Mesh(this.glowGeometry, this.glowMaterials[data.grade] || this.glowMaterials[0]);
            glow.position.y = 0.04;
            glow.renderOrder = 3;
            const sprite = new THREE.Sprite(this.icons.material(data.kind, data.grade));
            sprite.scale.set(1.15, 1.15, 1);
            holder.add(glow, sprite);
            this.group.add(holder);
            this.items.set(k, { key: data.kind + data.grade, holder, sprite, glow });
        }
        for (const [k, item] of this.items) {
            item.sprite.position.y = 1.0 + Math.sin(seconds * 3 + k) * 0.12;
            const pulse = 1 + Math.sin(seconds * 4 + k) * 0.08;
            item.glow.scale.set(pulse, 1, pulse);
        }
    }
    dispose(parent) { parent.remove(this.group); }
}
class WbDropletBurst {
    constructor(libs) {
        this.bursts = [];
        this.next = 0;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const geometry = new THREE.IcosahedronGeometry(0.16, 0);
        const random = new WbSeededRandom(39);
        for (let k = 0; k < WbDropletBurst.POOL; k++) {
            const holder = new THREE.Group(), material = new THREE.MeshLambertMaterial({ color: WbPalette.BUBBLE, transparent: true, opacity: 1, depthWrite: false });
            const dirs = [];
            for (let b = 0; b < WbDropletBurst.BITS; b++) {
                holder.add(new THREE.Mesh(geometry, material));
                const a = random.next() * Math.PI * 2, up = 0.3 + random.next() * 0.9;
                dirs.push([Math.cos(a), up, Math.sin(a)]);
            }
            holder.visible = false;
            this.group.add(holder);
            this.bursts.push({ holder, material, age: WbDropletBurst.LIFE, dirs });
        }
    }
    burst(x, y, z) {
        const b = this.bursts[this.next];
        this.next = (this.next + 1) % WbDropletBurst.POOL;
        b.age = 0;
        b.holder.position.set(x, y, z);
        b.holder.visible = true;
    }
    update(dt) {
        for (const b of this.bursts) {
            if (!b.holder.visible)
                continue;
            b.age += dt;
            const k = b.age / WbDropletBurst.LIFE;
            if (k >= 1) {
                b.holder.visible = false;
                continue;
            }
            const reach = 0.4 + k * 1.6;
            b.holder.children.forEach((bit, n) => {
                const d = b.dirs[n];
                bit.position.set(d[0] * reach, d[1] * reach * 1.4 - k * k * 1.6, d[2] * reach);
                bit.scale.setScalar(1.3 - k);
            });
            b.material.opacity = 1 - k;
        }
    }
}
WbDropletBurst.POOL = 6;
WbDropletBurst.BITS = 9;
WbDropletBurst.LIFE = 0.6;
class WbTrapGauge {
    constructor(libs) {
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const back = new THREE.Mesh(new THREE.CircleGeometry(0.4, WbTrapGauge.SEGMENTS), new THREE.MeshBasicMaterial({ color: "#10203A", transparent: true, opacity: 0.75, depthWrite: false }));
        const ring = new THREE.RingGeometry(0.24, 0.36, WbTrapGauge.SEGMENTS, 1, Math.PI / 2, Math.PI * 2);
        this.fillMaterial = new THREE.MeshBasicMaterial({ color: "#8FD3FF", depthWrite: false, transparent: true });
        this.fill = new THREE.Mesh(ring, this.fillMaterial);
        this.fill.position.z = 0.01;
        back.renderOrder = 8;
        this.fill.renderOrder = 9;
        this.group.add(back, this.fill);
        this.group.rotation.x = -WbCameraRig.PITCH;
    }
    set(fraction, blink) {
        const f = Math.max(0, Math.min(1, fraction));
        this.fill.geometry.setDrawRange(0, Math.ceil(WbTrapGauge.SEGMENTS * f) * 6);
        this.fillMaterial.color.set(blink ? "#FF6B5A" : "#8FD3FF");
    }
}
WbTrapGauge.SEGMENTS = 32;
class WbAvatarView {
    constructor(libs, parent, factory, library, labels, look, source, color) {
        this.source = source;
        this.color = color;
        this.yaw = 0;
        this.outFor = -1;
        this.actionUntil = 0;
        this.wasLife = "alive";
        this.watched = false;
        this.squashAt = -1;
        const THREE = libs.THREE;
        this.root = new THREE.Group();
        this.lift = new THREE.Group();
        this.body = factory.build(look);
        this.body.scale.multiplyScalar(WbAvatarView.BODY_SCALE);
        this.body.traverse((node) => { const mesh = node; if (mesh.isMesh)
            mesh.castShadow = true; });
        this.animator = new CharacterAnimator(libs, this.body, library.clips);
        this.animator.play("Idle_A");
        this.lift.add(this.body);
        this.root.add(this.lift);
        this.ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
        this.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 32), this.ringMaterial);
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.y = 0.05;
        this.ring.renderOrder = 3;
        this.root.add(this.ring);
        this.bubbleMaterial = new THREE.MeshStandardMaterial({ color: WbPalette.BUBBLE, transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0.1, depthWrite: false });
        this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1.1, 22, 16), this.bubbleMaterial);
        this.bubble.position.y = 1.15;
        this.bubble.renderOrder = 5;
        const gleam = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.85 }));
        gleam.position.set(-0.45, 0.5, 0.7);
        this.bubble.add(gleam);
        this.bubble.visible = false;
        this.root.add(this.bubble);
        this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), new THREE.MeshBasicMaterial({ color: WbPalette.SHIELD, wireframe: true, transparent: true, opacity: 0.55, depthWrite: false }));
        this.shield.position.y = 1.0;
        this.shield.visible = false;
        this.root.add(this.shield);
        this.gauge = new WbTrapGauge(libs);
        this.gauge.group.position.y = 2.95;
        this.gauge.group.visible = false;
        this.root.add(this.gauge.group);
        this.label = labels.create(source.bot ? source.nick + " BOT" : source.nick, color);
        this.label.position.y = 2.55;
        this.root.add(this.label);
        this.yaw = WbAvatarView.FACE_YAW[source.face] || 0;
        if (source.life === "out") {
            this.wasLife = "out";
            this.outFor = WbAvatarView.OUT_HIDE;
        }
        parent.add(this.root);
    }
    squash(nowMs) { this.squashAt = nowMs; }
    cheer() {
        this.animator.play("Cheering");
        this.actionUntil = Infinity;
    }
    playOnce(clip, seconds, nowMs) {
        this.animator.play(clip, { once: true });
        this.actionUntil = nowMs + seconds * 1000;
    }
    sync(x, z, tickTime, dt, nowMs) {
        const s = this.source, seconds = tickTime / WbBalance.RATE;
        this.root.position.set(WbSpace.worldX(x), 0, WbSpace.worldZ(z));
        const target = WbAvatarView.FACE_YAW[s.face] || 0;
        let turn = target - this.yaw;
        while (turn > Math.PI)
            turn -= Math.PI * 2;
        while (turn < -Math.PI)
            turn += Math.PI * 2;
        this.yaw += turn * Math.min(1, dt * 55);
        this.body.rotation.y = this.yaw;
        const trapped = s.life === "trapped", out = s.life === "out";
        if (out && this.wasLife !== "out") {
            this.outFor = 0;
            this.playOnce("Death_A", 9, nowMs);
        }
        if (this.wasLife === "trapped" && s.life === "alive")
            this.playOnce("Jump_Land", 0.45, nowMs);
        this.wasLife = s.life;
        if (out)
            this.outFor += dt;
        this.root.visible = !out || this.outFor < WbAvatarView.OUT_HIDE;
        const liftY = trapped ? WbAvatarView.TRAP_LIFT + Math.sin(seconds * 3.2) * 0.12 : 0;
        this.lift.position.y += (liftY - this.lift.position.y) * Math.min(1, dt * 10);
        const squashT = (nowMs - this.squashAt) / (WbAvatarView.SQUASH * 1000);
        const squash = this.squashAt >= 0 && squashT < 1 ? Math.sin(squashT * Math.PI) * 0.14 : 0;
        this.lift.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
        const trapLeft = (s.trapUntil - tickTime) / WbBalance.RATE;
        const blink = trapped && trapLeft < WbBalance.TRAP_BLINK;
        this.bubble.visible = trapped;
        this.bubble.position.y = 1.15 + this.lift.position.y * 0.6;
        this.bubbleMaterial.opacity = blink && Math.floor(seconds * 8) % 2 ? 0.16 : 0.4;
        this.bubble.scale.setScalar(1 + Math.sin(seconds * 5) * 0.03);
        this.gauge.group.visible = trapped;
        if (trapped)
            this.gauge.set(trapLeft / WbBalance.TRAP, blink);
        const shielded = !out && tickTime >= 0 && tickTime < s.shieldUntil;
        this.shield.visible = shielded;
        if (shielded)
            this.shield.rotation.y += dt * 1.6;
        const invuln = !out && !shielded && tickTime >= 0 && tickTime < s.invulnUntil;
        this.body.visible = !invuln || Math.floor(seconds * 12) % 2 === 0;
        this.ring.visible = !out;
        this.ringMaterial.color.set(this.watched ? WbPalette.MINE : this.color);
        this.ring.scale.setScalar(this.watched ? 1.12 : 0.85);
        this.label.visible = !out;
        if (nowMs >= this.actionUntil && !out) {
            if (trapped)
                this.animator.play(WbAvatarView.trapClip, { speed: WbAvatarView.trapClip === "Hit_B" ? 0.4 : 1 });
            else if (s.moving)
                this.animator.play("Running_A", { speed: Math.max(0.75, Math.min(1.7, (WbBalance.SPEED_BASE + WbBalance.SPEED_STEP * s.shoe) * WbSpace.CELL / 6.2)) });
            else
                this.animator.play("Idle_A");
        }
        this.animator.update(dt);
    }
    dispose(parent) { parent.remove(this.root); }
}
WbAvatarView.FACE_YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
WbAvatarView.TRAP_LIFT = 0.45;
WbAvatarView.OUT_HIDE = 1.3;
WbAvatarView.BODY_SCALE = 1.15;
WbAvatarView.SQUASH = 0.15;
WbAvatarView.trapClip = "Jump_Idle";
class WbFootprints {
    constructor(libs) {
        this.marks = [];
        this.timers = new Map();
        this.cursor = 0;
        const THREE = libs.THREE;
        this.matrix = new THREE.Matrix4();
        const disc = new THREE.CircleGeometry(0.28, 12);
        disc.rotateX(-Math.PI / 2);
        this.mesh = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color: WbPalette.WATER, transparent: true, opacity: 0.55, depthWrite: false }), WbFootprints.POOL);
        this.mesh.position.y = 0.02;
        this.mesh.renderOrder = 2;
        this.mesh.frustumCulled = false;
        for (let k = 0; k < WbFootprints.POOL; k++)
            this.marks.push({ x: 0, z: 0, age: WbFootprints.LIFE });
    }
    update(avatars, dt) {
        for (const avatar of avatars) {
            const s = avatar.source;
            if (s.life !== "alive" || !s.moving || s.shoe < WbFootprints.MIN_SHOE) {
                this.timers.delete(s.index);
                continue;
            }
            const t = (this.timers.get(s.index) || 0) + dt;
            if (t < WbFootprints.GAP) {
                this.timers.set(s.index, t);
                continue;
            }
            this.timers.set(s.index, 0);
            const mark = this.marks[this.cursor];
            this.cursor = (this.cursor + 1) % WbFootprints.POOL;
            mark.x = avatar.root.position.x;
            mark.z = avatar.root.position.z;
            mark.age = 0;
        }
        this.marks.forEach((mark, k) => {
            mark.age += dt;
            const left = 1 - mark.age / WbFootprints.LIFE;
            if (left <= 0)
                this.matrix.makeScale(0, 0, 0);
            else {
                this.matrix.makeScale(0.4 + 0.6 * left, 1, 0.4 + 0.6 * left);
                this.matrix.setPosition(mark.x, 0, mark.z);
            }
            this.mesh.setMatrixAt(k, this.matrix);
        });
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}
WbFootprints.POOL = 48;
WbFootprints.LIFE = 0.7;
WbFootprints.GAP = 0.13;
WbFootprints.MIN_SHOE = 3;
class WbCameraRig {
    constructor(libs) {
        this.libs = libs;
        this.distance = 40;
        this.lookZ = 0;
        this.shakeLeft = 0;
        this.camera = new libs.THREE.PerspectiveCamera(WbCameraRig.FOV, 1, 1, 400);
    }
    resize(aspect) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.fit();
    }
    shake() { this.shakeLeft = WbCameraRig.SHAKE; }
    place(distance, lookZ) {
        const up = Math.sin(WbCameraRig.PITCH) * distance, back = Math.cos(WbCameraRig.PITCH) * distance;
        this.camera.position.set(0, up, lookZ + back);
        this.camera.lookAt(0, 0, lookZ);
        this.camera.updateMatrixWorld(true);
    }
    extent(distance, lookZ) {
        const THREE = this.libs.THREE;
        this.place(distance, lookZ);
        const hx = (WbGrid.W / 2 + 1) * WbSpace.CELL, hz = (WbGrid.H / 2 + 1) * WbSpace.CELL;
        let x = 0, top = -Infinity, bottom = Infinity;
        for (const px of [-hx, hx])
            for (const pz of [-hz, hz])
                for (const py of [0, 1.6]) {
                    const v = new THREE.Vector3(px, py, pz).project(this.camera);
                    x = Math.max(x, Math.abs(v.x));
                    top = Math.max(top, v.y);
                    bottom = Math.min(bottom, v.y);
                }
        return { x, top, bottom };
    }
    fit() {
        const wide = this.camera.aspect >= 1;
        let lookZ = 0, distance = 40;
        for (let pass = 0; pass < 4; pass++) {
            let lo = 10, hi = 200;
            for (let k = 0; k < 30; k++) {
                const mid = (lo + hi) / 2, e = this.extent(mid, lookZ);
                const fits = e.x <= 0.97 && (e.top - e.bottom) / 2 <= (wide ? 0.88 : 0.95);
                if (fits)
                    hi = mid;
                else
                    lo = mid;
            }
            distance = hi;
            let north = -30, south = 30;
            for (let k = 0; k < 30; k++) {
                const mid = (north + south) / 2, e = this.extent(distance, mid);
                if (e.top + e.bottom > 0)
                    south = mid;
                else
                    north = mid;
            }
            lookZ = (north + south) / 2;
        }
        this.distance = distance;
        this.lookZ = lookZ;
        this.place(this.distance, this.lookZ);
    }
    update(dt) {
        if (this.shakeLeft <= 0)
            return;
        this.shakeLeft -= dt;
        this.place(this.distance, this.lookZ);
        if (this.shakeLeft > 0) {
            const k = this.shakeLeft / WbCameraRig.SHAKE * 0.18;
            this.camera.position.x += Math.sin(this.shakeLeft * 170) * k;
            this.camera.position.y += Math.cos(this.shakeLeft * 130) * k;
        }
    }
    orbit(angle, radius, height) {
        this.camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
        this.camera.lookAt(0, 0, 0);
    }
    settle() { this.place(this.distance, this.lookZ); }
}
WbCameraRig.PITCH = (60 * Math.PI) / 180;
WbCameraRig.FOV = 38;
WbCameraRig.SHAKE = 0.15;
class WbSceneDresser {
    wall(libs, group, color, height) {
        const THREE = libs.THREE, material = new THREE.MeshLambertMaterial({ color });
        const hx = (WbGrid.W / 2 + 3) * WbSpace.CELL, hz = (WbGrid.H / 2 + 3) * WbSpace.CELL;
        const north = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, height), material);
        north.position.set(0, height / 2, -hz);
        const west = new THREE.Mesh(new THREE.PlaneGeometry(hz * 2, height), material);
        west.rotation.y = Math.PI / 2;
        west.position.set(-hx, height / 2, 0);
        const east = new THREE.Mesh(new THREE.PlaneGeometry(hz * 2, height), material);
        east.rotation.y = -Math.PI / 2;
        east.position.set(hx, height / 2, 0);
        group.add(north, west, east);
    }
}
class WbClassroomDresser extends WbSceneDresser {
    dress(libs, theme, group) {
        const THREE = libs.THREE;
        this.wall(libs, group, "#EFE3CC", 7);
        const z = -(WbGrid.H / 2 + 3) * WbSpace.CELL + 0.05;
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 4.2), new THREE.MeshLambertMaterial({ color: "#8A6440" }));
        frame.position.set(0, 3.6, z);
        const board = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 3.5), new THREE.MeshLambertMaterial({ color: "#2F5D46" }));
        board.position.set(0, 3.6, z + 0.03);
        const tray = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: "#8A6440" }));
        tray.position.set(0, 1.8, z + 0.15);
        group.add(frame, board, tray);
        for (const side of [-1, 1]) {
            const window = new THREE.Mesh(new THREE.PlaneGeometry(9, 3), new THREE.MeshBasicMaterial({ color: "#CFE8F7" }));
            window.rotation.y = side * -Math.PI / 2;
            window.position.set(side * ((WbGrid.W / 2 + 3) * WbSpace.CELL - 0.05), 3.8, -4);
            group.add(window);
        }
    }
}
class WbPlaygroundDresser extends WbSceneDresser {
    dress(libs, theme, group) {
        const THREE = libs.THREE;
        const trunk = new THREE.MeshLambertMaterial({ color: "#7A5A3C" }), leaf = new THREE.MeshLambertMaterial({ color: "#4E8F3E" });
        const trunkGeometry = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6), leafGeometry = new THREE.IcosahedronGeometry(1.8, 0);
        const random = new WbSeededRandom(7);
        const hx = (WbGrid.W / 2 + 2.6) * WbSpace.CELL, hz = (WbGrid.H / 2 + 2.6) * WbSpace.CELL;
        for (let n = 0; n < 26; n++) {
            const t = n / 26 * Math.PI * 2;
            const x = Math.max(-hx, Math.min(hx, Math.sin(t) * hx * 1.5)), z = Math.max(-hz, Math.min(hz, -Math.cos(t) * hz * 1.5));
            if (z > hz * 0.4)
                continue;
            const tree = new THREE.Group();
            const stem = new THREE.Mesh(trunkGeometry, trunk);
            stem.position.y = 1.1;
            const top = new THREE.Mesh(leafGeometry, leaf);
            top.position.y = 3.2;
            top.scale.setScalar(0.8 + random.next() * 0.5);
            tree.add(stem, top);
            tree.position.set(x + (random.next() - 0.5) * 2, 0, z + (random.next() - 0.5) * 2);
            group.add(tree);
        }
        const line = new THREE.Mesh(new THREE.RingGeometry(WbGrid.H * WbSpace.CELL * 0.62, WbGrid.H * WbSpace.CELL * 0.64, 64), new THREE.MeshBasicMaterial({ color: "#EFE6D4", transparent: true, opacity: 0.5 }));
        line.rotation.x = -Math.PI / 2;
        line.position.y = 0.012;
        group.add(line);
    }
}
class WbCafeteriaDresser extends WbSceneDresser {
    dress(libs, theme, group) {
        const THREE = libs.THREE;
        this.wall(libs, group, "#F2EDE4", 6);
        const z = -(WbGrid.H / 2 + 3) * WbSpace.CELL + 0.05;
        const tiles = new THREE.Mesh(new THREE.PlaneGeometry(36, 1.6), new THREE.MeshLambertMaterial({ color: "#9CC9C2" }));
        tiles.position.set(0, 1.4, z + 0.02);
        const menu = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), new THREE.MeshLambertMaterial({ color: "#3C4A5C" }));
        menu.position.set(0, 4, z + 0.03);
        group.add(tiles, menu);
    }
}
class WbSceneDressers {
    static of(theme) { return WbSceneDressers.BY_THEME[theme.id] || WbSceneDressers.BY_THEME.classroom; }
}
WbSceneDressers.BY_THEME = {
    classroom: new WbClassroomDresser(), playground: new WbPlaygroundDresser(), cafeteria: new WbCafeteriaDresser(),
};
class WbMatchScene {
    constructor(libs, library, factory, labels, theme, source, looks) {
        this.theme = theme;
        this.source = source;
        this.avatars = [];
        this.lead = null;
        this.trail = new WbTrail();
        this.group = new libs.THREE.Group();
        const floor = new WbFloorView(libs, theme);
        this.group.add(floor.group);
        WbSceneDressers.of(theme).dress(libs, theme, this.group);
        this.board = new WbBoardView(libs, library, theme, source.grid);
        this.blocks = new WbBlockView(libs, theme);
        this.balloons = new WbBalloonView(libs);
        this.splash = new WbSplashView(libs);
        this.items = new WbItemView(libs);
        this.footprints = new WbFootprints(libs);
        this.group.add(this.board.group, this.blocks.group, this.balloons.group, this.splash.group, this.items.group, this.footprints.mesh);
        source.players.forEach((p, k) => {
            this.avatars.push(new WbAvatarView(libs, this.group, factory, library, labels, looks[k % looks.length], p, WbPalette.teamColor(source.mode, p.team)));
        });
    }
    sync(dt, nowMs) {
        const s = this.source, tickTime = s.tickTime;
        this.board.sync(s.grid, dt);
        this.blocks.sync(s.grid, s.sudden, tickTime);
        this.balloons.sync(s);
        this.splash.sync(s, dt);
        this.items.sync(s.floor, tickTime / WbBalance.RATE);
        this.avatars.forEach((avatar) => {
            const p = avatar.source;
            this.trail.feed(p.index, p.x, p.z, s.tick);
            const at = this.lead && this.lead.index === p.index ? this.lead.position(tickTime) : this.trail.at(p.index, tickTime);
            avatar.sync(at.x, at.z, tickTime, dt, nowMs);
        });
        this.footprints.update(this.avatars, dt);
    }
    avatarAt(index) { return this.avatars[index] || null; }
    cheer(ranks) {
        this.avatars.forEach((avatar, k) => { if (ranks[k] === 1 && avatar.source.life !== "out")
            avatar.cheer(); });
    }
}
class WbWorldView {
    constructor(libs, canvas, touchDevice, library, factory) {
        this.libs = libs;
        this.canvas = canvas;
        this.touchDevice = touchDevice;
        this.library = library;
        this.factory = factory;
        this.playing = false;
        this.match = null;
        const THREE = libs.THREE;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.scene = new THREE.Scene();
        this.hemi = new THREE.HemisphereLight(0xFFFFFF, 0x888888, 1.5);
        this.sun = new THREE.DirectionalLight(0xFFFFFF, 1.3);
        this.sun.position.set(-12, 34, 18);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(1024, 1024);
        const shadowCamera = this.sun.shadow.camera;
        shadowCamera.left = shadowCamera.bottom = -22;
        shadowCamera.right = shadowCamera.top = 22;
        shadowCamera.near = 5;
        shadowCamera.far = 90;
        shadowCamera.updateProjectionMatrix();
        this.sun.shadow.bias = -0.0008;
        this.sun.shadow.normalBias = 0.04;
        this.scene.add(this.hemi, this.sun, this.sun.target);
        this.rig = new WbCameraRig(libs);
        this.labels = new RkLabelFactory(libs);
        this.bursts = new WbDropletBurst(libs);
        this.scene.add(this.bursts.group);
        const steps = [() => this.lowerPixelRatio(), () => this.dropShadows(), () => this.thinSpray()];
        this.governor = window.QualityGovernor ? window.QualityGovernor({ steps, storageKey: "waterballoon_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 }) : null;
        window.addEventListener("resize", () => this.resize());
        this.resize();
    }
    get current() { return this.match; }
    show(theme, source, looks) {
        this.clear();
        this.scene.background = new this.libs.THREE.Color(theme.sky);
        this.hemi.color.set(theme.hemiSky);
        this.hemi.groundColor.set(theme.hemiGround);
        this.sun.color.set(theme.sun);
        this.match = new WbMatchScene(this.libs, this.library, this.factory, this.labels, theme, source, looks);
        this.scene.add(this.match.group);
        if (this.governor)
            this.governor.restore();
        this.rig.settle();
        return this.match;
    }
    clear() {
        if (!this.match)
            return;
        this.scene.remove(this.match.group);
        this.match = null;
    }
    react(events, nowMs) {
        const match = this.match;
        if (!match)
            return;
        let blasts = 0;
        for (const ev of events) {
            if (ev.t === "blast") {
                blasts++;
                match.splash.spray(ev.cells, WbGrid.index(ev.i, ev.j));
            }
            if (ev.t === "out") {
                const avatar = match.avatarAt(ev.id);
                if (avatar)
                    this.bursts.burst(avatar.root.position.x, 1.2, avatar.root.position.z);
            }
            if (ev.t === "place") {
                const avatar = match.avatarAt(ev.by);
                if (avatar)
                    avatar.squash(nowMs);
            }
            if (ev.t === "rescue") {
                const avatar = match.avatarAt(ev.by);
                if (avatar && !ev.needle)
                    avatar.playOnce("Interact", 0.3, nowMs);
            }
        }
        if (blasts >= 4)
            this.rig.shake();
    }
    resize() {
        const width = window.innerWidth, height = window.innerHeight;
        this.renderer.setSize(width, height, false);
        this.rig.resize(width / Math.max(1, height));
    }
    render(dt, nowMs) {
        if (this.match)
            this.match.sync(dt, nowMs);
        this.bursts.update(dt);
        this.rig.update(dt);
        this.renderer.render(this.scene, this.rig.camera);
        if (this.governor)
            this.governor.update(dt);
    }
    project(x, y, z) {
        const v = new this.libs.THREE.Vector3(x, y, z).project(this.rig.camera);
        return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
    }
    lowerPixelRatio() {
        if (this.pixelRatio <= 1)
            return false;
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
        return true;
    }
    dropShadows() {
        if (!this.sun.castShadow)
            return false;
        this.sun.castShadow = false;
        return true;
    }
    thinSpray() {
        if (!this.match || this.match.splash.dropsPerCell <= 1)
            return false;
        this.match.splash.dropsPerCell = 1;
        return true;
    }
}
