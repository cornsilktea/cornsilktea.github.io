"use strict";
class RdViewMath {
    static w(units) {
        return RdUnits.toWorld(units);
    }
    static approachAngle(current, target, rate) {
        return current + RdMath.angleDiff(target, current) * Math.min(1, rate);
    }
    static planeAngle(yaw) {
        return yaw - Math.PI / 2;
    }
}
class RdGroundLayer {
    static decal(material, lift = 1) {
        material.depthWrite = false;
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1 - lift;
        material.polygonOffsetUnits = -4 * lift;
        return material;
    }
}
RdGroundLayer.FLOOR_TOP = 0.05;
RdGroundLayer.MARKER = 0.085;
RdGroundLayer.ZONE = 0.1;
RdGroundLayer.AREA = 0.11;
RdGroundLayer.TELEGRAPH = 0.12;
RdGroundLayer.TELEGRAPH_EDGE = 0.13;
RdGroundLayer.EFFECT = 0.14;
class RdShadowCaster {
    static enable(root, receive = false) {
        root.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh)
                return;
            mesh.castShadow = true;
            if (receive)
                mesh.receiveShadow = true;
        });
    }
}
class RdModelLibrary {
    constructor(libs) {
        this.libs = libs;
        this.templates = new Map();
    }
    async load() {
        const loader = new this.libs.GLTFLoader();
        const props = Object.keys(RdModelLibrary.PROPS).map((key) => loader.loadAsync(RdModelLibrary.DIRECTORY + RdModelLibrary.PROPS[key]).then((gltf) => {
            this.lambertize(gltf.scene);
            this.templates.set(key, gltf.scene);
        }).catch(() => undefined));
        const skeletons = RdModelLibrary.SKELETONS.map((name) => loader.loadAsync(RdModelLibrary.DIRECTORY + "characters/" + name + ".glb").then((gltf) => {
            this.lambertize(gltf.scene);
            this.templates.set(name, gltf.scene);
        }));
        await Promise.all([...props, ...skeletons]);
    }
    has(key) {
        return this.templates.has(key);
    }
    clone(key) {
        const template = this.templates.get(key);
        if (!template)
            return new this.libs.THREE.Group();
        return this.libs.SkeletonUtils.clone(template);
    }
    parts(key) {
        const template = this.templates.get(key);
        if (!template)
            return [];
        template.updateMatrixWorld(true);
        const parts = [];
        template.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh || Array.isArray(mesh.material))
                return;
            parts.push({ geometry: mesh.geometry, material: mesh.material, matrix: mesh.matrixWorld.clone() });
        });
        return parts;
    }
    instanced(key, placements, material = null) {
        const THREE = this.libs.THREE;
        const group = new THREE.Group();
        if (!placements.length)
            return group;
        this.parts(key).forEach((part) => {
            const mesh = new THREE.InstancedMesh(part.geometry, material || part.material, placements.length);
            const combined = new THREE.Matrix4();
            placements.forEach((placement, index) => {
                combined.multiplyMatrices(placement, part.matrix);
                mesh.setMatrixAt(index, combined);
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
            group.add(mesh);
        });
        return group;
    }
    placement(x, y, z, turn, scaleX = 1, scaleY = 1, scaleZ = 1) {
        const THREE = this.libs.THREE;
        return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, 0)), new THREE.Vector3(scaleX, scaleY, scaleZ));
    }
    lambertize(scene) {
        const THREE = this.libs.THREE;
        scene.traverse((node) => {
            const mesh = node;
            if (!mesh.isMesh || Array.isArray(mesh.material))
                return;
            const source = mesh.material;
            mesh.material = new THREE.MeshLambertMaterial({ map: source.map, color: source.color, transparent: source.transparent, opacity: source.opacity });
        });
    }
}
RdModelLibrary.DIRECTORY = "assets/kaykit/";
RdModelLibrary.PROPS = {
    wall: "dungeon/wall.gltf", doorway: "dungeon/wall_doorway.gltf", floor: "dungeon/floor_tile_large.gltf", pillar: "dungeon/pillar.gltf",
    column: "dungeon/column.gltf", torch: "dungeon/torch_lit.gltf", banner: "dungeon/banner_patternA_white.gltf", chest: "dungeon/chest.gltf",
    dummy: "raid/Dummy_Base.gltf", rubble: "dungeon/rubble_large.gltf", barrel: "dungeon/barrel_large.gltf", box: "dungeon/box_large.gltf"
};
RdModelLibrary.SKELETONS = ["Skeleton_Minion", "Skeleton_Warrior", "Skeleton_Rogue", "Skeleton_Mage"];
class RdCameraRig {
    constructor(libs) {
        this.focusX = 0;
        this.focusZ = 6;
        this.distance = 20;
        this.ready = false;
        this.shakeLeft = 0;
        this.shakePower = 0;
        this.camera = new libs.THREE.PerspectiveCamera(42, 1, 0.5, 260);
    }
    resize(aspect) {
        this.camera.aspect = aspect;
        this.camera.fov = aspect < 1 ? 60 : 46;
        this.camera.updateProjectionMatrix();
    }
    snap() {
        this.ready = false;
    }
    shake(power, seconds) {
        this.shakePower = Math.max(this.shakePower, power);
        this.shakeLeft = Math.max(this.shakeLeft, seconds);
    }
    follow(points, bias, dt) {
        if (!points.length)
            return;
        let cx = 0, cz = 0;
        points.forEach((point) => { cx += point.x; cz += point.z; });
        cx /= points.length;
        cz /= points.length;
        let spread = 0;
        points.forEach((point) => { spread = Math.max(spread, Math.hypot(point.x - cx, point.z - cz)); });
        const focusX = bias ? cx * 0.55 + bias.x * 0.45 : cx;
        const focusZ = bias ? cz * 0.55 + bias.z * 0.45 : cz;
        const wanted = RdMath.clamp(15 + spread * 1.1, RdCameraRig.MIN_DISTANCE, RdCameraRig.MAX_DISTANCE) * (this.camera.aspect < 1 ? 1.25 : 1);
        if (!this.ready) {
            this.focusX = focusX;
            this.focusZ = focusZ;
            this.distance = wanted;
            this.ready = true;
        }
        const ratio = Math.min(1, dt * 3);
        this.focusX += (focusX - this.focusX) * ratio;
        this.focusZ += (focusZ - this.focusZ) * ratio;
        this.distance += (wanted - this.distance) * Math.min(1, dt * 1.5);
        this.place(dt);
    }
    orbit(radius, height, angle, lookX, lookZ) {
        this.camera.position.set(lookX + Math.sin(angle) * radius, height, lookZ + Math.cos(angle) * radius);
        this.camera.lookAt(lookX, 0.8, lookZ);
        this.focusX = lookX;
        this.focusZ = lookZ;
    }
    place(dt) {
        let jitterX = 0, jitterY = 0;
        if (this.shakeLeft > 0) {
            this.shakeLeft -= dt;
            jitterX = (Math.random() - 0.5) * this.shakePower;
            jitterY = (Math.random() - 0.5) * this.shakePower;
        }
        const up = Math.sin(RdCameraRig.PITCH) * this.distance, back = Math.cos(RdCameraRig.PITCH) * this.distance;
        this.camera.position.set(this.focusX + jitterX, up + jitterY, this.focusZ + back);
        this.camera.lookAt(this.focusX + jitterX * 0.5, 0, this.focusZ);
    }
}
RdCameraRig.PITCH = (55 * Math.PI) / 180;
RdCameraRig.MIN_DISTANCE = 19;
RdCameraRig.MAX_DISTANCE = 34;
class RdWorldView {
    constructor(libs, canvas, touchDevice) {
        this.libs = libs;
        this.canvas = canvas;
        this.playing = false;
        const THREE = libs.THREE;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#14101C");
        this.scene.fog = new THREE.Fog("#14101C", 34, 70);
        this.scene.add(new THREE.HemisphereLight(0xC8C2FF, 0x2A2030, 1.2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.sun = new RdSunShadow(libs, this.scene, touchDevice ? 1024 : 2048);
        this.matchGroup = new THREE.Group();
        this.scene.add(this.matchGroup);
        this.rig = new RdCameraRig(libs);
        this.governor = window.QualityGovernor
            ? window.QualityGovernor({ steps: [() => this.lowerPixelRatio(), () => this.sun.disable()], storageKey: "dungeonraid_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 })
            : null;
        if (this.governor)
            this.governor.restore();
        window.addEventListener("resize", () => this.resize());
        this.resize();
    }
    get camera() {
        return this.rig.camera;
    }
    resize() {
        const width = window.innerWidth, height = window.innerHeight;
        this.renderer.setSize(width, height, false);
        this.rig.resize(width / Math.max(1, height));
    }
    render(dt) {
        this.sun.follow(this.rig.focusX, this.rig.focusZ);
        this.renderer.render(this.scene, this.rig.camera);
        if (this.governor)
            this.governor.update(dt);
    }
    project(x, y, z) {
        const vector = new this.libs.THREE.Vector3(x, y, z).project(this.rig.camera);
        return { x: (vector.x * 0.5 + 0.5) * window.innerWidth, y: (-vector.y * 0.5 + 0.5) * window.innerHeight, visible: vector.z < 1 && vector.z > -1 };
    }
    groundPoint(clientX, clientY) {
        const THREE = this.libs.THREE;
        const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, this.rig.camera);
        const hit = new THREE.Vector3();
        if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit))
            return null;
        return { x: RdUnits.toUnits(hit.x), z: RdUnits.toUnits(hit.z) };
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
class RdSunShadow {
    constructor(libs, scene, mapSize) {
        this.light = new libs.THREE.DirectionalLight(0xFFD9A8, 1.3);
        this.light.castShadow = true;
        const shadow = this.light.shadow;
        shadow.mapSize.set(mapSize, mapSize);
        const camera = shadow.camera;
        camera.left = camera.bottom = -RdSunShadow.HALF_SPAN;
        camera.right = camera.top = RdSunShadow.HALF_SPAN;
        camera.near = 2;
        camera.far = 60;
        camera.updateProjectionMatrix();
        shadow.bias = -0.0006;
        shadow.normalBias = 0.03;
        shadow.radius = 3;
        scene.add(this.light, this.light.target);
        this.follow(0, 0);
    }
    follow(x, z) {
        const snapStep = (RdSunShadow.HALF_SPAN * 2) / this.light.shadow.mapSize.x;
        const sx = Math.round(x / snapStep) * snapStep, sz = Math.round(z / snapStep) * snapStep;
        this.light.position.set(sx + RdSunShadow.OFFSET.x, RdSunShadow.OFFSET.y, sz + RdSunShadow.OFFSET.z);
        this.light.target.position.set(sx, 0, sz);
    }
    disable() {
        if (!this.light.castShadow)
            return false;
        this.light.castShadow = false;
        return true;
    }
}
RdSunShadow.OFFSET = { x: -8, y: 20, z: 12 };
RdSunShadow.HALF_SPAN = 21;
class RdWallPlan {
    static pieces() {
        const hall = RdMapData.HALL, vault = RdMapData.VAULT;
        const pieces = [];
        const doorAt = (x, z) => RdMapData.DOORS.findIndex((door) => Math.abs(door.x - x) < 1 && Math.abs(door.z - z) < 1);
        const add = (x, z, turn, near, kindOverride) => {
            const door = doorAt(x, z);
            const kind = kindOverride || (door >= 0 ? "door" : "wall");
            pieces.push({ x, z, turn, kind, door, near });
        };
        for (let x = hall.minX + 200; x < hall.maxX; x += 400) {
            add(x, hall.minZ, 0, false, x === RdMapData.BOSS_GATE.x ? "gate" : null);
            add(x, hall.maxZ, Math.PI, true, null);
        }
        for (let z = hall.minZ + 200; z < hall.maxZ; z += 400) {
            add(hall.minX, z, Math.PI / 2, false, null);
            const insidePassage = z >= RdMapData.VAULT_PASSAGE.minZ && z <= RdMapData.VAULT_PASSAGE.maxZ;
            add(hall.maxX, z, -Math.PI / 2, false, insidePassage ? "open" : null);
        }
        for (let x = vault.minX + 200; x < vault.maxX; x += 400) {
            pieces.push({ x, z: vault.minZ, turn: 0, kind: "wall", door: -1, near: false });
            pieces.push({ x, z: vault.maxZ, turn: Math.PI, kind: "wall", door: -1, near: true });
        }
        for (let z = vault.minZ + 200; z < vault.maxZ; z += 400)
            pieces.push({ x: vault.maxX, z, turn: -Math.PI / 2, kind: "wall", door: -1, near: false });
        return pieces;
    }
}
class RdMapView {
    constructor(libs, library) {
        this.libs = libs;
        this.library = library;
        this.doors = new Map();
        this.flames = [];
        this.vaultOpen = false;
        this.built = false;
        this.gateDrop = 0;
        this.seconds = 0;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.bannerMaterial = new THREE.MeshLambertMaterial({ color: "#C04848" });
        this.beamMaterial = new THREE.MeshBasicMaterial({ color: "#FFD27A", transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        this.stripMaterial = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color: "#FFC85A", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }));
        this.arrowTexture = this.makeArrowTexture();
        this.portcullis = new THREE.Group();
        this.vaultGlow = new THREE.Group();
    }
    build() {
        if (this.built)
            return;
        this.built = true;
        const THREE = this.libs.THREE;
        const w = RdViewMath.w;
        const floorSpots = [];
        const tile = (rect) => {
            for (let x = rect.minX + 200; x < rect.maxX; x += 400)
                for (let z = rect.minZ + 200; z < rect.maxZ; z += 400)
                    floorSpots.push(this.library.placement(w(x), 0, w(z), 0));
        };
        tile(RdMapData.HALL);
        tile(RdMapData.VAULT);
        floorSpots.push(this.library.placement(w(1800), 0, 0, 0));
        const floor = this.library.instanced("floor", floorSpots);
        floor.traverse((node) => { node.receiveShadow = true; });
        this.group.add(floor);
        const under = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshBasicMaterial({ color: "#0B0910" }));
        under.rotation.x = -Math.PI / 2;
        under.position.y = -0.12;
        this.group.add(under);
        const pieces = RdWallPlan.pieces();
        const far = [], near = [];
        const nearMaterial = new THREE.MeshLambertMaterial({ color: "#8E86A0", transparent: true, opacity: 0.22, depthWrite: false });
        pieces.forEach((piece) => {
            const offsetX = Math.sin(piece.turn) * -50, offsetZ = Math.cos(piece.turn) * -50;
            const x = w(piece.x + offsetX), z = w(piece.z + offsetZ);
            if (piece.kind === "wall")
                (piece.near ? near : far).push(this.library.placement(x, 0, z, piece.turn));
            else if (piece.kind === "door" || piece.kind === "gate")
                this.addDoor(piece, x, z, piece.near ? nearMaterial : null);
            else
                this.addPassage(x, z, piece.turn);
        });
        const farWalls = this.library.instanced("wall", far);
        RdShadowCaster.enable(farWalls);
        this.group.add(farWalls);
        this.group.add(this.library.instanced("wall", near, nearMaterial));
        const corners = [];
        [[RdMapData.HALL.minX, RdMapData.HALL.minZ], [RdMapData.HALL.maxX, RdMapData.HALL.minZ], [RdMapData.VAULT.maxX, RdMapData.VAULT.minZ]].forEach((corner) => corners.push(this.library.placement(w(corner[0]), 0, w(corner[1]), 0, 0.7, 1.05, 0.7)));
        const cornerPillars = this.library.instanced("pillar", corners);
        RdShadowCaster.enable(cornerPillars);
        this.group.add(cornerPillars);
        this.addDecor();
        this.buildVaultGlow();
    }
    addDoor(piece, x, z, override) {
        const frame = this.library.clone("doorway");
        if (override)
            frame.traverse((node) => {
                const mesh = node;
                if (mesh.isMesh)
                    mesh.material = override;
            });
        const holder = new this.libs.THREE.Group();
        holder.add(frame);
        holder.position.set(x, 0, z);
        holder.rotation.y = piece.turn;
        const scale = piece.kind === "gate" ? RdMapView.GATE_SCALE : 1;
        holder.scale.set(scale, scale, 1);
        this.group.add(holder);
        const leaf = frame.getObjectByName("wall_doorway_door");
        if (leaf)
            this.doors.set(piece.kind === "gate" ? 99 : piece.door, { pivot: leaf, amount: 0, target: 0, closeAt: 0, maxTurn: 1.75 });
        if (piece.kind === "gate") {
            [-1, 1].forEach((side) => {
                const torch = this.library.clone("torch");
                torch.position.set(x + side * 2.8, 2.3, z + 0.7);
                torch.scale.setScalar(1.3);
                this.group.add(torch);
                this.flames.push(torch);
            });
        }
    }
    addPassage(x, z, turn) {
        const THREE = this.libs.THREE;
        [-1, 1].forEach((side) => {
            const column = this.library.clone("pillar");
            column.position.set(x, 0, z + side * 2.15);
            column.scale.set(0.55, 1, 0.55);
            this.group.add(column);
        });
        const bar = new THREE.MeshLambertMaterial({ color: "#3A3540" });
        for (let index = 0; index < 8; index++) {
            const rod = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, 0.12), bar);
            rod.position.set(0, 1.8, -1.75 + index * 0.5);
            this.portcullis.add(rod);
        }
        [0.6, 2.0, 3.3].forEach((height) => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3.9), bar);
            rail.position.set(0, height, 0);
            this.portcullis.add(rail);
        });
        this.portcullis.position.set(x, 0, z);
        this.portcullis.rotation.y = turn + Math.PI / 2;
        this.group.add(this.portcullis);
    }
    addDecor() {
        const w = RdViewMath.w;
        const torchSpots = [[-600, RdMapData.HALL.minZ + 70, 0], [600, RdMapData.HALL.minZ + 70, 0], [RdMapData.HALL.minX + 70, -400, Math.PI / 2], [RdMapData.HALL.minX + 70, 400, Math.PI / 2], [RdMapData.HALL.maxX - 70, -600, -Math.PI / 2], [RdMapData.HALL.maxX - 70, 600, -Math.PI / 2], [2400, RdMapData.VAULT.minZ + 70, 0]];
        torchSpots.forEach((spot) => {
            const torch = this.library.clone("torch");
            torch.position.set(w(spot[0]), 2.3, w(spot[1]));
            torch.rotation.y = spot[2];
            this.group.add(torch);
            this.flames.push(torch);
        });
        [-400, 400, -1600, 1600].forEach((x) => {
            const banner = this.library.clone("banner");
            banner.traverse((node) => {
                const mesh = node;
                if (mesh.isMesh)
                    mesh.material = this.bannerMaterial;
            });
            banner.position.set(w(x), 0.2, w(RdMapData.HALL.minZ));
            this.group.add(banner);
        });
        RdMapData.OBSTACLES.forEach((obstacle) => {
            if (!this.library.has(obstacle.prop))
                return;
            const prop = this.library.clone(obstacle.prop);
            prop.position.set(w(obstacle.x), 0, w(obstacle.z));
            prop.rotation.y = obstacle.turn;
            prop.scale.setScalar(obstacle.scale);
            RdShadowCaster.enable(prop);
            this.group.add(prop);
        });
    }
    makeArrowTexture() {
        const THREE = this.libs.THREE;
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 64;
        const context = canvas.getContext("2d");
        context.fillStyle = "rgba(255,210,120,0.95)";
        context.beginPath();
        context.moveTo(30, 12);
        context.lineTo(70, 32);
        context.lineTo(30, 52);
        context.lineTo(44, 32);
        context.closePath();
        context.fill();
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    buildVaultGlow() {
        const THREE = this.libs.THREE;
        const w = RdViewMath.w;
        const centerX = w((RdMapData.VAULT.minX + RdMapData.VAULT.maxX) / 2);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 16, 24, 1, true), this.beamMaterial);
        beam.position.set(centerX, 8, 0);
        const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 18, 18, 1, true), this.beamMaterial);
        inner.position.set(centerX, 9, 0);
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(w(RdMapData.VAULT.maxX - RdMapData.VAULT.minX) - 0.6, 0.35), this.stripMaterial);
        strip.rotation.x = -Math.PI / 2;
        strip.position.set(centerX, RdGroundLayer.MARKER, w(RdMapData.VAULT.minZ) + 0.35);
        const strip2 = strip.clone();
        strip2.position.z = w(RdMapData.VAULT.maxZ) - 0.35;
        const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4), this.stripMaterial);
        doorGlow.rotation.x = -Math.PI / 2;
        doorGlow.position.set(w(RdMapData.HALL.maxX), RdGroundLayer.MARKER, 0);
        const arrowMaterial = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ map: this.arrowTexture, transparent: true, opacity: 0.85 }), 2);
        this.arrowTexture.repeat.set(4, 1);
        const arrows = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), arrowMaterial);
        arrows.rotation.x = -Math.PI / 2;
        arrows.position.set(w(RdMapData.HALL.maxX) - 3.3, RdGroundLayer.ZONE, 0);
        this.vaultGlow.add(beam, inner, strip, strip2, doorGlow, arrows);
        this.vaultGlow.visible = false;
        this.group.add(this.vaultGlow);
    }
    setTheme(color) {
        this.bannerMaterial.color.set(color);
    }
    setVaultOpen(open) {
        this.vaultOpen = open;
        this.vaultGlow.visible = open;
    }
    openDoor(index, seconds) {
        const door = this.doors.get(index);
        if (!door)
            return;
        door.target = 1;
        door.closeAt = this.seconds + seconds;
    }
    closeAll() {
        this.doors.forEach((door) => { door.target = 0; door.amount = 0; door.pivot.rotation.y = 0; });
    }
    update(dt) {
        this.seconds += dt;
        this.doors.forEach((door) => {
            if (door.target > 0 && this.seconds > door.closeAt)
                door.target = 0;
            door.amount += (door.target - door.amount) * Math.min(1, dt * 4);
            door.pivot.rotation.y = -door.amount * door.maxTurn;
        });
        this.flames.forEach((torch, index) => {
            const flicker = 1 + Math.sin(this.seconds * 13 + index * 1.7) * 0.05 + Math.sin(this.seconds * 23 + index) * 0.03;
            torch.scale.y = torch.scale.x * flicker;
        });
        const dropTarget = this.vaultOpen ? 1 : 0;
        this.gateDrop += (dropTarget - this.gateDrop) * Math.min(1, dt * 2.5);
        this.portcullis.position.y = -this.gateDrop * 3.7;
        this.portcullis.visible = this.gateDrop < 0.98;
        if (this.vaultOpen) {
            const pulse = 0.5 + 0.5 * Math.sin(this.seconds * 2.2);
            this.beamMaterial.opacity = 0.035 + pulse * 0.06;
            this.stripMaterial.opacity = 0.35 + pulse * 0.35;
            this.arrowTexture.offset.x -= dt * 0.8;
        }
    }
}
RdMapView.GATE_SCALE = 1.7;
class RdHealthBar {
    constructor(libs, width, color) {
        this.width = width;
        this.shown = -1;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: "#14121A", transparent: true, opacity: 0.8, depthTest: false }));
        back.scale.set(width + 0.08, 0.16, 1);
        back.renderOrder = 10;
        this.fillMaterial = new THREE.SpriteMaterial({ color, depthTest: false });
        this.fill = new THREE.Sprite(this.fillMaterial);
        this.fill.center.set(0.5, 0.5);
        this.fill.scale.set(width, 0.1, 1);
        this.fill.renderOrder = 11;
        this.group.add(back, this.fill);
    }
    set(ratio) {
        const clamped = RdMath.clamp(ratio, 0, 1);
        if (Math.abs(clamped - this.shown) < 0.002)
            return;
        this.shown = clamped;
        this.fill.scale.x = Math.max(0.001, this.width * clamped);
        this.fill.center.x = this.width / 2 / this.fill.scale.x;
    }
    setColor(color) {
        this.fillMaterial.color.set(color);
    }
}
class RdActor {
    constructor(libs, parent, barWidth, barColor, barHeight) {
        this.libs = libs;
        this.parent = parent;
        this.barHeight = barHeight;
        this.shownX = 0;
        this.shownZ = 0;
        this.shownYaw = 0;
        this.placed = false;
        this.hitFlash = 0;
        this.group = new libs.THREE.Group();
        this.bar = new RdHealthBar(libs, barWidth, barColor);
        this.bar.group.position.y = barHeight;
        this.group.add(this.bar.group);
        parent.add(this.group);
    }
    get worldX() {
        return this.shownX;
    }
    get worldZ() {
        return this.shownZ;
    }
    moveTo(x, z, yaw, dt, snapDistance) {
        const wx = RdViewMath.w(x), wz = RdViewMath.w(z);
        if (!this.placed || Math.hypot(wx - this.shownX, wz - this.shownZ) > snapDistance) {
            this.shownX = wx;
            this.shownZ = wz;
            this.shownYaw = yaw;
            this.placed = true;
        }
        else {
            const ratio = Math.min(1, dt * 12);
            this.shownX += (wx - this.shownX) * ratio;
            this.shownZ += (wz - this.shownZ) * ratio;
            this.shownYaw = RdViewMath.approachAngle(this.shownYaw, yaw, dt * 12);
        }
        this.group.position.set(this.shownX, 0, this.shownZ);
    }
    dispose() {
        this.parent.remove(this.group);
    }
}
class RdHeroActor extends RdActor {
    constructor(libs, parent, factory, clips, labels, entry) {
        super(libs, parent, 0.9, RdBalance.heroSpec(entry.slot).color, 2.35);
        this.clips = clips;
        this.entry = entry;
        this.actionUntil = 0;
        this.down = false;
        this.moving = false;
        this.seconds = 0;
        this.ghost = false;
        this.airStart = -1;
        this.dashLean = 0;
        const THREE = libs.THREE;
        const spec = RdBalance.heroSpec(entry.slot);
        const look = CharacterLooks.clean(entry.look);
        look.c = spec.lookType;
        this.model = factory.build(look);
        RdShadowCaster.enable(this.model);
        this.group.add(this.model);
        this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 28), RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.9 })));
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.y = RdGroundLayer.MARKER;
        const label = labels.create(entry.nick, spec.color);
        label.position.y = 2.75;
        label.scale.multiplyScalar(0.8);
        this.group.add(this.ring, label);
        if (entry.isMe) {
            this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshBasicMaterial({ color: "#FFD23F" }));
            this.marker.rotation.x = Math.PI;
            this.marker.position.y = 3.25;
            this.group.add(this.marker);
        }
        else {
            this.marker = null;
        }
        this.animator = new CharacterAnimator(libs, this.model, clips);
        this.animator.play("Idle_A");
        this.shownYaw = Math.PI;
    }
    pick(key) {
        const list = RdHeroActor.CLIPS[key] || [];
        for (const name of list)
            if (this.clips.has(name))
                return name;
        return null;
    }
    playAction(key, seconds, nowMs) {
        if (this.down)
            return;
        const clip = this.pick(key);
        if (!clip)
            return;
        this.animator.play(clip, { once: true, speed: key === "heal" ? 1.8 : key === "dash" ? 2.6 : 1.25 });
        this.actionUntil = nowMs + seconds * 1000;
        if (key === "dash")
            this.dashLean = 1;
    }
    setAirborne(airborne, nowMs) {
        if (airborne && this.airStart < 0)
            this.airStart = nowMs;
        if (!airborne && this.airStart >= 0 && nowMs - this.airStart > RdBalance.LORD.stomp.airborne * 1000)
            this.airStart = -1;
    }
    airProgress(nowMs) {
        if (this.airStart < 0)
            return -1;
        const progress = (nowMs - this.airStart) / (RdBalance.LORD.stomp.airborne * 1000);
        return progress >= 1 ? -1 : progress;
    }
    setPose(pose, downed, hpRatio, dt, nowMs) {
        this.moveTo(pose.x, pose.z, pose.yaw, dt, pose.dash ? 8 : 3);
        this.bar.set(hpRatio);
        this.bar.group.visible = !downed;
        this.moving = pose.moving;
        if (downed !== this.down) {
            this.down = downed;
            if (downed) {
                const clip = this.pick("down");
                if (clip)
                    this.animator.play(clip, { once: true });
                this.actionUntil = Infinity;
            }
            else {
                const clip = this.pick("revive");
                if (clip)
                    this.animator.play(clip, { once: true, speed: 1.4 });
                this.actionUntil = nowMs + 900;
            }
        }
    }
    setGhost(ghost) {
        if (ghost === this.ghost)
            return;
        this.ghost = ghost;
        this.ring.visible = !ghost;
    }
    render(dt, nowMs) {
        this.seconds += dt;
        this.group.rotation.y = this.shownYaw;
        if (!this.down && nowMs >= this.actionUntil)
            this.animator.play(this.moving ? "Running_A" : "Idle_A");
        this.animator.update(dt);
        if (this.marker)
            this.marker.position.y = 3.25 + Math.sin(this.seconds * 5) * 0.1;
        this.ring.rotation.z += dt * 0.6;
        const air = this.airProgress(nowMs);
        const lift = air >= 0 ? Math.sin(air * Math.PI) * RdHeroActor.AIR_HEIGHT : 0;
        this.model.position.y = lift + (this.hitFlash > 0 ? Math.sin(this.hitFlash * 40) * 0.03 : 0);
        this.model.rotation.y = air >= 0 ? air * Math.PI * 2 : 0;
        this.dashLean = Math.max(0, this.dashLean - dt * 4);
        this.model.rotation.x = this.dashLean * 0.45;
        this.hitFlash = Math.max(0, this.hitFlash - dt);
    }
    dispose() {
        super.dispose();
    }
}
RdHeroActor.CLIPS = {
    idle: ["Idle_A"], run: ["Running_A"], hit: ["Hit_A", "Hit_B"], down: ["Death_A"], revive: ["Spawn_Ground", "Idle_A"],
    attack0: ["Melee_1H_Attack_Chop"], attack1: ["Melee_2H_Attack_Slice", "Melee_1H_Attack_Slice_Horizontal"],
    shoot2: ["Ranged_Magic_Shoot"], shoot3: ["Ranged_Bow_Release", "Ranged_2H_Shoot"], shoot4: ["Ranged_Magic_Spellcasting", "Ranged_Magic_Shoot"],
    taunt: ["Melee_Block", "Cheering"], charge: ["Melee_2H_Attack_Spinning", "Running_A"], fireball: ["Ranged_Magic_Spellcasting", "Ranged_Magic_Shoot"],
    dash: ["Running_A"], heal: ["Ranged_Magic_Raise", "Ranged_Magic_Spellcasting"], cheer: ["Cheering"]
};
RdHeroActor.AIR_HEIGHT = 1.7;
class RdFoeLooks {
}
RdFoeLooks.SKELETON_SCALE = 0.8;
RdFoeLooks.LOOKS = {
    minion: { model: "Skeleton_Minion", scale: 0.72, tint: null, emissive: null, barWidth: 0.7, barHeight: 1.85, barColor: "#E25B4B" },
    warrior: { model: "Skeleton_Warrior", scale: 0.85, tint: null, emissive: null, barWidth: 1.0, barHeight: 2.25, barColor: "#E25B4B" },
    rogue: { model: "Skeleton_Rogue", scale: 0.8, tint: null, emissive: null, barWidth: 0.85, barHeight: 2.1, barColor: "#E25B4B" },
    mage: { model: "Skeleton_Mage", scale: 0.8, tint: null, emissive: null, barWidth: 0.85, barHeight: 2.15, barColor: "#E25B4B" },
    giant: { model: "Skeleton_Warrior", scale: 1.6, tint: "#FF6A5C", emissive: "#3A0804", barWidth: 0, barHeight: 0, barColor: "#E25B4B" },
    archmage: { model: "Skeleton_Mage", scale: 1.44, tint: "#B58BFF", emissive: "#1E0838", barWidth: 0, barHeight: 0, barColor: "#E25B4B" },
    lord: { model: "Skeleton_Warrior", scale: 1.92, tint: "#5A4E40", emissive: "#3A2A06", barWidth: 0, barHeight: 0, barColor: "#E25B4B" }
};
RdFoeLooks.ATTACKS = {
    minion: ["Melee_Unarmed_Attack_Punch_A", "Melee_1H_Attack_Chop"], warrior: ["Melee_1H_Attack_Chop"], rogue: ["Melee_Dualwield_Attack_Slice", "Melee_1H_Attack_Slice_Diagonal"],
    mage: ["Ranged_Magic_Shoot"], giant: ["Melee_2H_Attack_Slice", "Melee_1H_Attack_Chop"], archmage: ["Ranged_Magic_Shoot"], lord: ["Melee_2H_Attack_Spin", "Melee_2H_Attack_Slice"]
};
RdFoeLooks.ACTIONS = {
    slam: ["Melee_2H_Attack_Slice", "Melee_1H_Attack_Chop"], leap: ["Melee_1H_Attack_Jump_Chop"], rush: ["Running_A"], roar: ["Skeletons_Taunt"],
    channel: ["Ranged_Magic_Spellcasting_Long", "Ranged_Magic_Spellcasting"], summon: ["Ranged_Magic_Summon", "Ranged_Magic_Raise"], cast: ["Ranged_Magic_Shoot"]
};
class RdFoeActor extends RdActor {
    constructor(libs, parent, library, clips, kind, id) {
        super(libs, parent, RdFoeLooks.LOOKS[kind].barWidth || 0.1, RdFoeLooks.LOOKS[kind].barColor, RdFoeLooks.LOOKS[kind].barHeight);
        this.clips = clips;
        this.kind = kind;
        this.id = id;
        this.actionUntil = 0;
        this.dying = -1;
        this.spawnShown = 0;
        this.moving = false;
        this.seconds = 0;
        this.stunned = false;
        const THREE = libs.THREE;
        const look = RdFoeLooks.LOOKS[kind];
        this.boss = kind === "giant" || kind === "archmage" || kind === "lord";
        this.bar.group.visible = !this.boss;
        this.model = library.clone(look.model);
        this.model.scale.setScalar(look.scale);
        if (look.tint) {
            this.model.traverse((node) => {
                const mesh = node;
                if (!mesh.isMesh || Array.isArray(mesh.material))
                    return;
                const material = mesh.material.clone();
                material.color.set(look.tint);
                if (look.emissive)
                    material.emissive.set(look.emissive);
                mesh.material = material;
            });
        }
        this.model.traverse((node) => { node.frustumCulled = false; });
        RdShadowCaster.enable(this.model);
        this.group.add(this.model);
        this.stars = new THREE.Mesh(new THREE.TorusGeometry(0.35 * look.scale, 0.05, 6, 18), new THREE.MeshBasicMaterial({ color: "#FFE066" }));
        this.stars.rotation.x = Math.PI / 2;
        this.stars.position.y = 2.2 * look.scale / 0.8;
        this.stars.visible = false;
        this.group.add(this.stars);
        this.animator = new CharacterAnimator(libs, this.model, clips);
        this.animator.play(this.has("Skeletons_Idle") ? "Skeletons_Idle" : "Idle_A");
    }
    has(name) {
        return this.clips.has(name);
    }
    first(list) {
        for (const name of list || [])
            if (this.clips.has(name))
                return name;
        return null;
    }
    playAttack(nowMs) {
        const clip = this.first(RdFoeLooks.ATTACKS[this.kind]);
        if (!clip || this.dying >= 0)
            return;
        this.animator.play(clip, { once: true, speed: this.boss ? 1.1 : 1.4 });
        this.actionUntil = nowMs + 650;
    }
    playAction(key, nowMs, seconds) {
        const clip = this.first(RdFoeLooks.ACTIONS[key]);
        if (!clip || this.dying >= 0)
            return;
        const loop = key === "channel";
        this.animator.play(clip, { once: !loop, speed: key === "summon" ? 2.6 : 1 });
        this.actionUntil = nowMs + seconds * 1000;
    }
    beginRise(nowMs) {
        const clip = this.first(["Skeletons_Spawn_Ground", "Skeletons_Awaken_Floor", "Spawn_Ground"]);
        if (!clip)
            return;
        const length = this.clips.get(clip).duration;
        this.animator.play(clip, { once: true, speed: Math.max(1, length / RdGroundSpawn.RISE_SECONDS) });
        this.actionUntil = nowMs + RdGroundSpawn.RISE_SECONDS * 1000;
    }
    die(nowMs) {
        if (this.dying >= 0)
            return;
        this.dying = nowMs;
        this.bar.group.visible = false;
        this.stars.visible = false;
        const clip = this.first(["Skeletons_Death", "Death_A"]);
        if (clip)
            this.animator.play(clip, { once: true, speed: 1.3 });
    }
    get finished() {
        return this.dying >= 0 && this.seconds * 1000 - this.dying > 0;
    }
    dyingFor(nowMs) {
        return this.dying < 0 ? -1 : nowMs - this.dying;
    }
    sync(shot, dt, nowMs) {
        const hidden = (shot.flags & RdFoeFlags.HIDDEN) !== 0;
        const spawning = (shot.flags & RdFoeFlags.SPAWNING) !== 0;
        this.moveTo(shot.x, shot.z, shot.yaw, dt, this.boss ? 6 : 3);
        this.group.visible = !hidden;
        if (!hidden && spawning && this.spawnShown === 0)
            this.spawnShown = 1;
        this.moving = (shot.flags & RdFoeFlags.MOVING) !== 0;
        this.stunned = (shot.flags & RdFoeFlags.STUNNED) !== 0;
        this.bar.set(shot.hp / 1000);
        if (!this.boss)
            this.bar.group.visible = !spawning && this.dying < 0;
    }
    render(dt, nowMs) {
        this.seconds += dt;
        this.group.rotation.y = this.shownYaw;
        if (this.dying < 0 && nowMs >= this.actionUntil) {
            const walk = this.has("Skeletons_Walking") ? "Skeletons_Walking" : "Walking_A";
            const idle = this.has("Skeletons_Idle") ? "Skeletons_Idle" : "Idle_A";
            this.animator.play(this.moving ? walk : idle, { speed: this.moving ? (this.boss ? 1.1 : 1.5) : 1 });
        }
        this.stars.visible = this.stunned && this.dying < 0;
        if (this.stars.visible)
            this.stars.rotation.z += dt * 4;
        this.animator.update(dt);
        if (this.hitFlash > 0) {
            this.model.position.x = Math.sin(this.hitFlash * 60) * 0.04;
            this.hitFlash = Math.max(0, this.hitFlash - dt);
        }
        else {
            this.model.position.x = 0;
        }
    }
}
class RdPropActor extends RdActor {
    constructor(libs, parent, library, labels, kind, id, owner, ownerName) {
        super(libs, parent, kind === "chest" ? 0.9 : 1.0, kind === "pillar" ? "#B07CFF" : "#F2C14E", kind === "pillar" ? 4.2 : kind === "chest" ? 1.6 : 2.4);
        this.kind = kind;
        this.id = id;
        this.timerText = "";
        this.opened = false;
        this.lidTurn = 0;
        this.wobble = 0;
        this.broken = false;
        this.seconds = 0;
        this.removedSince = -1;
        const THREE = libs.THREE;
        this.lid = null;
        this.crystal = null;
        this.crystalMaterial = null;
        this.timer = null;
        this.timerCanvas = null;
        if (kind === "chest") {
            this.body = library.clone("chest");
            this.body.scale.setScalar(0.62);
            this.lid = this.body.getObjectByName("chest_lid") || null;
            const color = owner >= 0 ? RdBalance.heroSpec(owner).color : "#FFFFFF";
            const label = labels.create(ownerName, color);
            label.position.y = 1.25;
            label.scale.multiplyScalar(0.7);
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 30), RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })));
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = RdGroundLayer.MARKER;
            this.group.add(label, ring);
        }
        else if (kind === "dummy") {
            this.body = library.clone("dummy");
            this.body.scale.setScalar(1.15);
            this.bar.group.visible = false;
        }
        else {
            this.body = new THREE.Group();
            const base = library.clone("column");
            base.scale.set(1.4, 0.5, 1.4);
            this.body.add(base);
            const material = new THREE.MeshBasicMaterial({ color: "#B07CFF", transparent: true, opacity: 0.88 });
            const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), material);
            crystal.scale.set(1, 2.6, 1);
            crystal.position.y = 2.2;
            this.body.add(crystal);
            this.crystal = crystal;
            this.crystalMaterial = material;
            const canvas = document.createElement("canvas");
            canvas.width = 128;
            canvas.height = 64;
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
            sprite.scale.set(1.4, 0.7, 1);
            sprite.position.y = 4.9;
            sprite.visible = false;
            sprite.renderOrder = 12;
            this.group.add(sprite);
            this.timer = sprite;
            this.timerCanvas = canvas;
        }
        RdShadowCaster.enable(this.body);
        this.group.add(this.body);
    }
    sync(shot, dt, windowLeft) {
        this.moveTo(shot.x, shot.z, shot.yaw, dt, 1);
        const ratio = shot.hp / 1000;
        this.bar.set(ratio);
        if (this.kind === "pillar" && this.crystal && this.crystalMaterial) {
            this.broken = (shot.flags & RdFoeFlags.BROKEN) !== 0;
            this.crystal.visible = !this.broken;
            this.bar.group.visible = !this.broken;
            this.crystalMaterial.color.setRGB(0.69 + (1 - ratio) * 0.31, 0.49 * ratio + 0.15, 1 * ratio + 0.2 * (1 - ratio));
            this.setTimer(this.broken && windowLeft >= 0 ? windowLeft.toFixed(1) : "");
        }
    }
    setTimer(text) {
        if (!this.timer || !this.timerCanvas || text === this.timerText)
            return;
        this.timerText = text;
        this.timer.visible = text !== "";
        const context = this.timerCanvas.getContext("2d");
        context.clearRect(0, 0, 128, 64);
        context.font = '800 40px "Nanum Gothic", "Malgun Gothic", sans-serif';
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.lineWidth = 7;
        context.strokeStyle = "rgba(10,10,20,.9)";
        context.strokeText(text, 64, 34);
        context.fillStyle = "#FFD27A";
        context.fillText(text, 64, 34);
        this.timer.material.map.needsUpdate = true;
    }
    open() {
        this.opened = true;
        this.bar.group.visible = false;
    }
    hit() {
        this.wobble = 0.35;
    }
    render(dt) {
        this.seconds += dt;
        this.group.rotation.y = this.shownYaw;
        if (this.lid) {
            this.lidTurn += ((this.opened ? -1.25 : 0) - this.lidTurn) * Math.min(1, dt * 6);
            this.lid.rotation.x = this.lidTurn;
        }
        if (this.wobble > 0) {
            this.wobble = Math.max(0, this.wobble - dt);
            this.body.rotation.z = Math.sin(this.wobble * 40) * this.wobble * 0.3;
        }
        else {
            this.body.rotation.z = 0;
        }
        if (this.crystal && !this.broken) {
            this.crystal.rotation.y += dt * 1.4;
            this.crystal.position.y = 2.2 + Math.sin(this.seconds * 2) * 0.12;
        }
    }
}
class RdEffectManager {
    constructor(libs) {
        this.libs = libs;
        this.pool = [];
        this.projectiles = new Map();
        this.projectilePool = [];
        this.seconds = 0;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.streakGeometry = new THREE.PlaneGeometry(1, 1);
        this.streakGeometry.translate(0, 0.5, 0);
        this.streakGeometry.rotateX(-Math.PI / 2);
        this.wallGeometry = new THREE.PlaneGeometry(1, 1);
        this.wallGeometry.translate(0.5, 0.5, 0);
        this.barrierTexture = this.makeBarrierTexture();
        this.ringGeometry = new THREE.RingGeometry(0.86, 1, 40);
        this.ringGeometry.rotateX(-Math.PI / 2);
        this.discGeometry = new THREE.CircleGeometry(1, 40);
        this.discGeometry.rotateX(-Math.PI / 2);
        this.sphereGeometry = new THREE.SphereGeometry(1, 14, 10);
        this.beamGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true);
        this.beamGeometry.rotateX(Math.PI / 2);
        this.beamGeometry.translate(0, 0, 0.5);
        this.crackTexture = this.makeCrackTexture();
    }
    makeCrackTexture() {
        const THREE = this.libs.THREE;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const context = canvas.getContext("2d");
        const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
        gradient.addColorStop(0, "rgba(20,12,8,.85)");
        gradient.addColorStop(0.7, "rgba(40,28,20,.45)");
        gradient.addColorStop(1, "rgba(40,28,20,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);
        context.strokeStyle = "rgba(10,6,4,.95)";
        context.lineWidth = 3;
        for (let index = 0; index < 7; index++) {
            const angle = (index / 7) * Math.PI * 2 + 0.3;
            context.beginPath();
            context.moveTo(64, 64);
            context.lineTo(64 + Math.cos(angle) * 30, 64 + Math.sin(angle) * 30);
            context.lineTo(64 + Math.cos(angle + 0.2) * 58, 64 + Math.sin(angle + 0.2) * 58);
            context.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    makeBarrierTexture() {
        const THREE = this.libs.THREE;
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        const gradient = context.createLinearGradient(0, 128, 0, 0);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.35, "rgba(255,160,170,.7)");
        gradient.addColorStop(1, "rgba(255,80,100,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 16, 128);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }
    acquire(kind, geometry, additive, map = null) {
        const THREE = this.libs.THREE;
        let entry = this.pool.filter((item) => !item.busy && item.kind === kind)[0];
        if (!entry) {
            const material = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, map }), 3);
            const mesh = new THREE.Mesh(geometry, material);
            this.group.add(mesh);
            entry = { mesh, until: 0, start: 0, busy: false, kind, update: () => undefined };
            this.pool.push(entry);
        }
        entry.busy = true;
        entry.mesh.visible = true;
        entry.mesh.rotation.set(0, 0, 0);
        entry.mesh.scale.set(1, 1, 1);
        entry.start = this.seconds;
        return entry;
    }
    play(entry, seconds, update) {
        entry.until = this.seconds + seconds;
        entry.update = update;
        update(0);
    }
    ring(x, z, radius, color, seconds, grow = true, height = RdGroundLayer.EFFECT) {
        const entry = this.acquire("ring", this.ringGeometry, true);
        const material = entry.mesh.material;
        material.color.set(color);
        entry.mesh.position.set(x, height, z);
        this.play(entry, seconds, (progress) => {
            const scale = grow ? radius * (0.3 + 0.7 * progress) : radius;
            entry.mesh.scale.set(scale, 1, scale);
            material.opacity = 0.9 * (1 - progress);
        });
    }
    disc(x, z, radius, color, seconds, opacity) {
        const entry = this.acquire("disc", this.discGeometry, true);
        const material = entry.mesh.material;
        material.color.set(color);
        entry.mesh.position.set(x, RdGroundLayer.EFFECT, z);
        this.play(entry, seconds, (progress) => {
            entry.mesh.scale.set(radius * progress, 1, radius * progress);
            material.opacity = opacity * (progress < 0.85 ? 1 : (1 - progress) / 0.15);
        });
    }
    burst(x, z, radius, color, seconds) {
        const entry = this.acquire("burst", this.sphereGeometry, true);
        const material = entry.mesh.material;
        material.color.set(color);
        entry.mesh.position.set(x, radius * 0.25, z);
        this.play(entry, seconds, (progress) => {
            const scale = radius * (0.35 + 0.65 * Math.sqrt(progress));
            entry.mesh.scale.set(scale, scale * 0.55, scale);
            material.opacity = 0.75 * (1 - progress);
        });
    }
    crack(x, z, radius, seconds) {
        const entry = this.acquire("crack", this.discGeometry, false, this.crackTexture);
        const material = entry.mesh.material;
        material.color.set("#FFFFFF");
        entry.mesh.position.set(x, RdGroundLayer.EFFECT, z);
        this.play(entry, seconds, (progress) => {
            const scale = radius * Math.min(1, 0.4 + progress * 1.2);
            entry.mesh.scale.set(scale, 1, scale);
            material.opacity = progress < 0.7 ? 0.95 : (1 - progress) / 0.3;
        });
        this.ring(x, z, radius * 1.3, "#8A7560", seconds * 0.8);
    }
    beam(fromX, fromZ, toX, toZ, color, seconds) {
        const entry = this.acquire("beam", this.beamGeometry, true);
        const material = entry.mesh.material;
        material.color.set(color);
        const length = Math.hypot(toX - fromX, toZ - fromZ);
        entry.mesh.position.set(fromX, 1.2, fromZ);
        entry.mesh.lookAt(toX, 1.0, toZ);
        this.play(entry, seconds, (progress) => {
            entry.mesh.scale.set(1.2 * (1 - progress) + 0.4, 1.2 * (1 - progress) + 0.4, length);
            material.opacity = 0.75 * (1 - progress);
        });
    }
    swing(x, z, dir, radius, arc, color) {
        const THREE = this.libs.THREE;
        const geometry = new THREE.RingGeometry(radius * 0.55, radius, 18, 1, RdViewMath.planeAngle(dir) - arc / 2, arc);
        geometry.rotateX(-Math.PI / 2);
        const entry = this.acquire("swing-" + Math.round(radius * 10) + "-" + Math.round(arc * 10), geometry, true);
        const material = entry.mesh.material;
        material.color.set(color);
        entry.mesh.position.set(x, 0.9, z);
        entry.mesh.rotation.y = 0;
        const mesh = entry.mesh;
        mesh.geometry.dispose();
        mesh.geometry = geometry;
        this.play(entry, 0.18, (progress) => { material.opacity = 0.7 * (1 - progress); });
    }
    streak(x, z, dir, length, width, color, seconds) {
        const entry = this.acquire("streak", this.streakGeometry, true);
        const material = entry.mesh.material;
        material.color.set(color);
        entry.mesh.position.set(x, RdGroundLayer.EFFECT, z);
        entry.mesh.rotation.y = dir + Math.PI;
        this.play(entry, seconds, (progress) => {
            entry.mesh.scale.set(width * (1 - progress * 0.6), 1, length);
            material.opacity = 0.85 * (1 - progress);
        });
    }
    barrier(x, z, dir, length) {
        const entry = this.acquire("barrier", this.wallGeometry, true, this.barrierTexture);
        const material = entry.mesh.material;
        material.color.set("#FF4A5E");
        entry.mesh.position.set(x, 0, z);
        entry.mesh.rotation.y = RdViewMath.planeAngle(dir);
        this.play(entry, 0.7, (progress) => {
            const rise = Math.min(1, progress * 5);
            entry.mesh.scale.set(length, 2.6 * rise, 1);
            material.opacity = progress < 0.3 ? 1 : (1 - progress) / 0.7;
        });
        this.streak(x, z, dir, length, 0.5, "#FF6A6A", 0.6);
    }
    shockwave(x, z, radius, color) {
        this.ring(x, z, radius, color, 0.55);
        this.ring(x, z, radius * 0.7, "#FFFFFF", 0.4);
        this.burst(x, z, Math.min(3, radius * 0.3), color, 0.45);
    }
    meteor(x, z, radius) {
        this.burst(x, z, radius * 1.1, "#FF7A2E", 0.7);
        this.ring(x, z, radius * 1.25, "#FFB35A", 0.6);
    }
    launch(id, style, x, z, speed, target, tx, tz) {
        const THREE = this.libs.THREE;
        let mesh = this.projectilePool.pop();
        if (!mesh) {
            mesh = new THREE.Mesh(this.sphereGeometry, new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
            this.group.add(mesh);
        }
        const color = style === "arrow" ? "#FFE7A0" : style === "orb" ? "#C58BFF" : "#7CFF9C";
        mesh.material.color.set(color);
        if (style === "arrow")
            mesh.scale.set(0.06, 0.06, 0.55);
        else
            mesh.scale.setScalar(style === "orb" ? 0.22 : 0.2);
        mesh.visible = true;
        mesh.position.set(x, 1.2, z);
        this.projectiles.set(id, { mesh, x, z, speed: RdViewMath.w(speed), target, tx, tz, style, until: this.seconds + 4 });
    }
    land(id) {
        const projectile = this.projectiles.get(id);
        if (!projectile)
            return;
        this.projectiles.delete(id);
        projectile.mesh.visible = false;
        this.projectilePool.push(projectile.mesh);
        if (projectile.style !== "arrow")
            this.burst(projectile.mesh.position.x, projectile.mesh.position.z, 0.45, projectile.style === "orb" ? "#C58BFF" : "#7CFF9C", 0.25);
    }
    clear() {
        this.pool.forEach((entry) => { entry.busy = false; entry.mesh.visible = false; });
        Array.from(this.projectiles.keys()).forEach((id) => this.land(id));
    }
    update(dt) {
        this.seconds += dt;
        this.pool.forEach((entry) => {
            if (!entry.busy)
                return;
            const total = entry.until - entry.start;
            const progress = total > 0 ? (this.seconds - entry.start) / total : 1;
            if (progress >= 1) {
                entry.busy = false;
                entry.mesh.visible = false;
                return;
            }
            entry.update(progress);
        });
        this.projectiles.forEach((projectile, id) => {
            const target = projectile.target();
            if (target) {
                projectile.tx = target.x;
                projectile.tz = target.z;
            }
            const dx = projectile.tx - projectile.x, dz = projectile.tz - projectile.z;
            const distance = Math.hypot(dx, dz);
            const step = projectile.speed * dt;
            if (distance <= step || this.seconds > projectile.until) {
                this.land(id);
                return;
            }
            projectile.x += (dx / distance) * step;
            projectile.z += (dz / distance) * step;
            projectile.mesh.position.set(projectile.x, 1.2, projectile.z);
            if (projectile.style === "arrow")
                projectile.mesh.rotation.y = Math.atan2(dx, dz);
        });
    }
}
class RdTelegraphPalette {
    constructor(libs) {
        this.libs = libs;
        this.seconds = 0;
        const THREE = libs.THREE;
        this.edge = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color: "#FF5A4A", transparent: true, opacity: 0.9, side: THREE.DoubleSide }), 2);
        this.meteor = new THREE.MeshBasicMaterial({ color: "#FF8A3C" });
        this.hazardFill = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ map: this.makeHazardTexture(), transparent: true, opacity: 0.85, side: THREE.DoubleSide }), 1);
        this.hazardRing = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color: "#FF2A1A", transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 2);
        this.hazardRunes = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ map: this.makeRuneTexture(), transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 2);
        this.tileTexture = this.makeTileTexture();
    }
    fill() {
        const THREE = this.libs.THREE;
        return RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color: "#FF3B30", transparent: true, opacity: 0.3, side: THREE.DoubleSide }), 1);
    }
    tile() {
        const THREE = this.libs.THREE;
        return RdGroundLayer.decal(new THREE.MeshBasicMaterial({ map: this.tileTexture, transparent: true, opacity: 0.3, side: THREE.DoubleSide }), 1);
    }
    update(dt) {
        this.seconds += dt;
        const pulse = 0.5 + 0.5 * Math.sin(this.seconds * 7);
        this.hazardFill.opacity = 0.62 + pulse * 0.3;
        this.hazardRing.opacity = 0.65 + pulse * 0.35;
        this.hazardRunes.opacity = 0.45 + (1 - pulse) * 0.4;
    }
    canvas(size) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        return { canvas, context: canvas.getContext("2d") };
    }
    texture(canvas) {
        const texture = new this.libs.THREE.CanvasTexture(canvas);
        texture.colorSpace = this.libs.THREE.SRGBColorSpace;
        return texture;
    }
    makeHazardTexture() {
        const { canvas, context } = this.canvas(256);
        const gradient = context.createRadialGradient(128, 128, 10, 128, 128, 128);
        gradient.addColorStop(0, "rgba(255,40,20,.55)");
        gradient.addColorStop(0.7, "rgba(200,10,10,.6)");
        gradient.addColorStop(0.93, "rgba(255,60,40,.9)");
        gradient.addColorStop(1, "rgba(255,60,40,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 256, 256);
        context.strokeStyle = "rgba(40,0,0,.55)";
        context.lineWidth = 9;
        for (let stripe = -256; stripe < 512; stripe += 34) {
            context.beginPath();
            context.moveTo(stripe, 0);
            context.lineTo(stripe + 256, 256);
            context.stroke();
        }
        context.globalCompositeOperation = "destination-in";
        context.beginPath();
        context.arc(128, 128, 127, 0, Math.PI * 2);
        context.fill();
        return this.texture(canvas);
    }
    makeRuneTexture() {
        const { canvas, context } = this.canvas(256);
        context.translate(128, 128);
        context.fillStyle = "rgba(255,120,90,.95)";
        for (let index = 0; index < 12; index++) {
            context.rotate((Math.PI * 2) / 12);
            context.beginPath();
            context.moveTo(-9, -96);
            context.lineTo(0, -122);
            context.lineTo(9, -96);
            context.closePath();
            context.fill();
        }
        context.strokeStyle = "rgba(255,150,120,.9)";
        context.lineWidth = 4;
        context.setLineDash([14, 10]);
        context.beginPath();
        context.arc(0, 0, 86, 0, Math.PI * 2);
        context.stroke();
        return this.texture(canvas);
    }
    makeTileTexture() {
        const { canvas, context } = this.canvas(128);
        context.fillStyle = "rgba(255,40,30,.75)";
        context.fillRect(0, 0, 128, 128);
        context.strokeStyle = "rgba(255,200,180,1)";
        context.lineWidth = 8;
        context.strokeRect(4, 4, 120, 120);
        context.strokeStyle = "rgba(90,0,0,.45)";
        context.lineWidth = 6;
        for (let stripe = -128; stripe < 256; stripe += 26) {
            context.beginPath();
            context.moveTo(stripe, 0);
            context.lineTo(stripe + 128, 128);
            context.stroke();
        }
        return this.texture(canvas);
    }
}
class RdTelegraphFigure {
    constructor(libs, palette) {
        this.libs = libs;
        this.palette = palette;
        this.owned = [];
        this.group = new libs.THREE.Group();
    }
    flat(geometry, material, height) {
        const mesh = new this.libs.THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = height;
        this.owned.push(geometry);
        this.group.add(mesh);
        return mesh;
    }
    dispose() {
        this.owned.forEach((item) => item.dispose());
    }
}
class RdGrowingFigure extends RdTelegraphFigure {
    constructor(libs, palette) {
        super(libs, palette);
        this.fill = null;
        this.fillMaterial = palette.fill();
        this.owned.push(this.fillMaterial);
    }
    update(progress, left) {
        this.fillMaterial.opacity = 0.18 + 0.35 * progress;
        this.grow(0.15 + 0.85 * progress);
    }
}
class RdCircleFigure extends RdGrowingFigure {
    constructor(libs, palette, shape, duration) {
        super(libs, palette);
        const THREE = libs.THREE;
        this.radius = RdViewMath.w(shape.r);
        this.group.position.set(RdViewMath.w(shape.x), 0, RdViewMath.w(shape.z));
        this.fill = this.flat(new THREE.CircleGeometry(1, 44), this.fillMaterial, RdGroundLayer.TELEGRAPH);
        const edge = this.flat(new THREE.RingGeometry(0.94, 1, 44), palette.edge, RdGroundLayer.TELEGRAPH_EDGE);
        edge.scale.set(this.radius, this.radius, 1);
        this.meteor = null;
        if (duration >= 2.9) {
            const geometry = new THREE.DodecahedronGeometry(0.9, 0);
            this.owned.push(geometry);
            this.meteor = new THREE.Mesh(geometry, palette.meteor);
            this.meteor.visible = false;
            this.group.add(this.meteor);
        }
    }
    grow(amount) {
        if (this.fill)
            this.fill.scale.set(this.radius * amount, this.radius * amount, 1);
    }
    update(progress, left) {
        super.update(progress, left);
        if (!this.meteor)
            return;
        this.meteor.visible = left < 0.7;
        this.meteor.position.set(0, 0.5 + left * 14, 0);
        this.meteor.rotation.x += 0.2;
    }
}
class RdConeFigure extends RdGrowingFigure {
    constructor(libs, palette, shape) {
        super(libs, palette);
        const THREE = libs.THREE;
        this.radius = RdViewMath.w(shape.r);
        this.group.position.set(RdViewMath.w(shape.x), 0, RdViewMath.w(shape.z));
        const start = RdViewMath.planeAngle(shape.dir) - shape.arc / 2;
        this.fill = this.flat(new THREE.CircleGeometry(1, 30, start, shape.arc), this.fillMaterial, RdGroundLayer.TELEGRAPH);
        const edge = this.flat(new THREE.RingGeometry(0.94, 1, 30, 1, start, shape.arc), palette.edge, RdGroundLayer.TELEGRAPH_EDGE);
        edge.scale.set(this.radius, this.radius, 1);
    }
    grow(amount) {
        if (this.fill)
            this.fill.scale.set(this.radius * amount, this.radius * amount, 1);
    }
}
class RdLineFigure extends RdGrowingFigure {
    constructor(libs, palette, shape) {
        super(libs, palette);
        const THREE = libs.THREE;
        this.length = RdViewMath.w(shape.length);
        this.width = RdViewMath.w(shape.width);
        this.group.position.set(RdViewMath.w(shape.x), 0, RdViewMath.w(shape.z));
        const fillGeometry = new THREE.PlaneGeometry(1, 1);
        fillGeometry.translate(0, 0.5, 0);
        const edgeGeometry = new THREE.PlaneGeometry(1, 1);
        edgeGeometry.translate(0, 0.5, 0);
        this.fill = this.flat(fillGeometry, this.fillMaterial, RdGroundLayer.TELEGRAPH);
        const edge = this.flat(edgeGeometry, palette.edge, RdGroundLayer.TELEGRAPH_EDGE);
        edge.material = this.edgeOutline();
        [this.fill, edge].forEach((mesh) => { mesh.rotation.z = shape.dir + Math.PI; });
        edge.scale.set(this.width + 0.1, this.length + 0.1, 1);
        this.fill.scale.set(this.width, this.length, 1);
    }
    edgeOutline() {
        const material = this.palette.edge.clone();
        material.opacity = 0.35;
        this.owned.push(material);
        return material;
    }
    grow(amount) {
        if (this.fill)
            this.fill.scale.y = this.length * amount;
    }
}
class RdCheckerFigure extends RdTelegraphFigure {
    constructor(libs, palette, shape) {
        super(libs, palette);
        const THREE = libs.THREE;
        const w = RdViewMath.w;
        this.size = w(shape.cell);
        const rects = RdShapes.checkerCells(shape);
        const farthest = rects.reduce((best, rect) => Math.max(best, Math.hypot((rect.minX + rect.maxX) / 2 - shape.ox, (rect.minZ + rect.maxZ) / 2 - shape.oz)), 1);
        this.cells = rects.map((rect) => {
            const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2;
            return { x: w(cx), z: w(cz), order: Math.hypot(cx - shape.ox, cz - shape.oz) / farthest };
        });
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2);
        this.owned.push(geometry);
        this.material = palette.tile();
        this.owned.push(this.material);
        this.tiles = new THREE.InstancedMesh(geometry, this.material, Math.max(1, this.cells.length));
        this.tiles.frustumCulled = false;
        this.tiles.position.y = RdGroundLayer.TELEGRAPH;
        this.matrix = new THREE.Matrix4();
        this.group.add(this.tiles);
        this.update(0);
    }
    update(progress) {
        const spread = progress * 1.6;
        this.cells.forEach((cell, index) => {
            const shown = RdMath.clamp((spread - cell.order) / 0.25, 0, 1);
            const scale = Math.max(0.001, this.size * shown * 0.97);
            this.matrix.makeScale(scale, 1, scale).setPosition(cell.x, 0, cell.z);
            this.tiles.setMatrixAt(index, this.matrix);
        });
        this.tiles.instanceMatrix.needsUpdate = true;
        const blink = progress > 0.75 ? 0.5 + 0.5 * Math.sin(progress * 90) : 1;
        this.material.opacity = (0.35 + 0.5 * progress) * (0.7 + 0.3 * blink);
    }
}
class RdQuadrantFigure extends RdTelegraphFigure {
    constructor(libs, palette, shape) {
        super(libs, palette);
        const THREE = libs.THREE;
        const radius = RdViewMath.w(shape.r), gap = RdViewMath.w(shape.gap) / 2, line = 0.12;
        this.group.position.set(RdViewMath.w(shape.x), 0, RdViewMath.w(shape.z));
        this.group.rotation.y = shape.dir;
        this.fillMaterial = palette.fill();
        this.owned.push(this.fillMaterial);
        const fills = [], edges = [];
        [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach((signs) => {
            fills.push(this.quadrant(signs[0], signs[1], gap, radius));
            const outline = this.quadrant(signs[0], signs[1], gap, radius);
            outline.holes.push(new THREE.Path(this.quadrant(signs[0], signs[1], gap + line, radius - line).getPoints()));
            edges.push(outline);
        });
        this.flat(new THREE.ShapeGeometry(fills, 16), this.fillMaterial, RdGroundLayer.TELEGRAPH);
        this.flat(new THREE.ShapeGeometry(edges, 16), palette.edge, RdGroundLayer.TELEGRAPH_EDGE);
    }
    quadrant(signX, signY, gap, radius) {
        const THREE = this.libs.THREE;
        const reach = Math.sqrt(Math.max(0, radius * radius - gap * gap));
        const from = Math.atan2(reach, gap), to = Math.atan2(gap, reach);
        const points = [new THREE.Vector2(gap * signX, gap * signY)];
        const steps = 16;
        for (let step = 0; step <= steps; step++) {
            const angle = from + (to - from) * (step / steps);
            points.push(new THREE.Vector2(Math.cos(angle) * radius * signX, Math.sin(angle) * radius * signY));
        }
        return new THREE.Shape(points);
    }
    update(progress) {
        const blink = progress > 0.7 ? 0.5 + 0.5 * Math.sin(progress * 80) : 1;
        this.fillMaterial.opacity = (0.2 + 0.4 * progress) * (0.75 + 0.25 * blink);
    }
}
class RdHazardFigure extends RdTelegraphFigure {
    constructor(libs, palette, shape) {
        super(libs, palette);
        const THREE = libs.THREE;
        const radius = shape.kind === "circle" ? RdViewMath.w(shape.r) : 2;
        this.group.position.set(RdViewMath.w(shape.x), 0, RdViewMath.w(shape.z));
        this.flat(new THREE.CircleGeometry(radius, 40), palette.hazardFill, RdGroundLayer.AREA);
        this.flat(new THREE.RingGeometry(radius * 0.93, radius, 40), palette.hazardRing, RdGroundLayer.TELEGRAPH_EDGE);
        this.runes = this.flat(new THREE.PlaneGeometry(radius * 2, radius * 2), palette.hazardRunes, RdGroundLayer.TELEGRAPH);
    }
    update(progress) {
        this.runes.rotation.z = progress * 6;
    }
}
class RdTelegraphFigures {
    static warning(libs, palette, entry) {
        const builder = RdTelegraphFigures.BUILDERS[entry.shape.kind];
        return builder(libs, palette, entry.shape, entry.end - entry.start);
    }
    static hazard(libs, palette, entry) {
        return new RdHazardFigure(libs, palette, entry.shape);
    }
}
RdTelegraphFigures.BUILDERS = {
    circle: (libs, palette, shape, duration) => new RdCircleFigure(libs, palette, shape, duration),
    cone: (libs, palette, shape) => new RdConeFigure(libs, palette, shape),
    line: (libs, palette, shape) => new RdLineFigure(libs, palette, shape),
    checker: (libs, palette, shape) => new RdCheckerFigure(libs, palette, shape),
    quadrants: (libs, palette, shape) => new RdQuadrantFigure(libs, palette, shape)
};
class RdTelegraphView {
    constructor(libs) {
        this.libs = libs;
        this.warnings = new Map();
        this.hazards = new Map();
        this.seconds = 0;
        this.group = new libs.THREE.Group();
        this.palette = new RdTelegraphPalette(libs);
    }
    sync(tele, areas, now) {
        this.reconcile(this.warnings, tele, now, RdTelegraphFigures.warning);
        this.reconcile(this.hazards, areas, now, RdTelegraphFigures.hazard);
    }
    reconcile(store, list, now, make) {
        const keep = new Set();
        list.forEach((entry) => {
            if (entry.end <= now)
                return;
            keep.add(entry.id);
            let figure = store.get(entry.id);
            if (!figure) {
                figure = make(this.libs, this.palette, entry);
                this.group.add(figure.group);
                store.set(entry.id, figure);
            }
            const progress = RdMath.clamp((now - entry.start) / Math.max(0.05, entry.end - entry.start), 0, 1);
            figure.update(store === this.hazards ? this.seconds * 0.15 : progress, entry.end - now);
        });
        store.forEach((figure, id) => {
            if (keep.has(id))
                return;
            this.group.remove(figure.group);
            figure.dispose();
            store.delete(id);
        });
    }
    update(dt) {
        this.seconds += dt;
        this.palette.update(dt);
    }
    clear() {
        this.sync([], [], Infinity);
    }
}
class RdZoneView {
    constructor(libs) {
        this.libs = libs;
        this.zones = [];
        this.seconds = 0;
        const THREE = libs.THREE;
        this.group = new THREE.Group();
        this.readyMaterial = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color: "#FFD23F", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }), 2);
        this.readyDiscMaterial = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color: "#FFD23F", transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending }), 1);
        const ringGeometry = new THREE.RingGeometry(0.9, 1, 48);
        ringGeometry.rotateX(-Math.PI / 2);
        const discGeometry = new THREE.CircleGeometry(1, 48);
        discGeometry.rotateX(-Math.PI / 2);
        this.readyRing = new THREE.Mesh(ringGeometry, this.readyMaterial);
        this.readyDisc = new THREE.Mesh(discGeometry, this.readyDiscMaterial);
        this.readyRing.visible = this.readyDisc.visible = false;
        this.group.add(this.readyRing, this.readyDisc);
        for (let index = 0; index < RdRules.SEATS; index++) {
            const material = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color: "#FFD23F", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }), 2);
            const discMaterial = RdGroundLayer.decal(new THREE.MeshBasicMaterial({ color: "#FFD23F", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending }), 1);
            const ring = new THREE.Mesh(ringGeometry, material);
            const disc = new THREE.Mesh(discGeometry, discMaterial);
            ring.visible = disc.visible = false;
            this.group.add(ring, disc);
            this.zones.push({ ring, disc, material, discMaterial });
        }
    }
    setReady(zone, inside) {
        this.readyRing.visible = this.readyDisc.visible = !!zone;
        if (!zone)
            return;
        const color = inside ? "#4CE38A" : "#FFD23F";
        this.readyMaterial.color.set(color);
        this.readyDiscMaterial.color.set(color);
        const radius = RdViewMath.w(zone.r);
        [this.readyRing, this.readyDisc].forEach((mesh) => {
            mesh.position.set(RdViewMath.w(zone.x), RdGroundLayer.ZONE, RdViewMath.w(zone.z));
            mesh.scale.set(radius, 1, radius);
        });
    }
    setZones(zones) {
        this.zones.forEach((zone, index) => {
            const data = zones[index];
            zone.ring.visible = zone.disc.visible = !!data;
            if (!data)
                return;
            const color = data[2] === 0 ? "#FFD23F" : data[2] === 1 ? "#4C9BFF" : "#FF4040";
            zone.material.color.set(color);
            zone.discMaterial.color.set(color);
            const radius = RdViewMath.w(RdBalance.SAFE_ZONE.radius);
            [zone.ring, zone.disc].forEach((mesh) => {
                mesh.position.set(RdViewMath.w(data[0]), RdGroundLayer.ZONE, RdViewMath.w(data[1]));
                mesh.scale.set(radius, 1, radius);
            });
        });
    }
    update(dt) {
        this.seconds += dt;
        const pulse = 0.5 + 0.5 * Math.sin(this.seconds * 4);
        this.readyDiscMaterial.opacity = 0.12 + pulse * 0.12;
        this.zones.forEach((zone) => { zone.discMaterial.opacity = 0.18 + pulse * 0.16; });
    }
}
class RdDamageNumbers {
    constructor(world, container) {
        this.world = world;
        this.items = [];
        for (let index = 0; index < RdDamageNumbers.POOL; index++) {
            const element = document.createElement("div");
            element.className = "rd-num";
            element.hidden = true;
            container.appendChild(element);
            this.items.push({ element, x: 0, y: 0, z: 0, age: 0, life: 0.9, busy: false });
        }
    }
    show(x, z, text, kind) {
        let item = this.items.filter((entry) => !entry.busy)[0];
        if (!item)
            item = this.items.reduce((oldest, entry) => (entry.age > oldest.age ? entry : oldest), this.items[0]);
        item.busy = true;
        item.age = 0;
        item.x = x + (Math.random() - 0.5) * 0.5;
        item.z = z;
        item.y = 2.2;
        item.element.className = "rd-num " + kind;
        item.element.textContent = text;
        item.element.hidden = false;
    }
    clear() {
        this.items.forEach((item) => { item.busy = false; item.element.hidden = true; });
    }
    update(dt) {
        this.items.forEach((item) => {
            if (!item.busy)
                return;
            item.age += dt;
            if (item.age >= item.life) {
                item.busy = false;
                item.element.hidden = true;
                return;
            }
            const point = this.world.project(item.x, item.y + item.age * 1.4, item.z);
            if (!point.visible) {
                item.element.style.opacity = "0";
                return;
            }
            item.element.style.opacity = String(1 - Math.max(0, item.age - 0.55) / 0.35);
            item.element.style.transform = "translate(" + point.x.toFixed(1) + "px," + point.y.toFixed(1) + "px) translate(-50%,-50%)";
        });
    }
}
RdDamageNumbers.POOL = 36;
class RdSceneView {
    constructor(kit) {
        this.kit = kit;
        this.heroes = [null, null, null, null, null];
        this.foes = new Map();
        this.dying = [];
        this.roster = [];
        this.snapshot = null;
        this.flow = null;
        this.theme = "";
        this.slowMo = 0;
        this.stage = "";
        this.nowMs = 0;
        this.fxHandlers = {
            taunt: (x, z, event) => { this.effects.ring(x, z, RdViewMath.w(event.r), "#5B8DEF", 0.7); this.effects.ring(x, z, 1.2, "#FFFFFF", 0.4); },
            charge: (x, z) => this.effects.ring(x, z, 1.4, "#E5604D", 0.35),
            "blast-mark": (x, z, event) => this.effects.disc(x, z, RdViewMath.w(event.r), "#FF8A3C", event.d, 0.35),
            blast: (x, z, event) => { this.effects.burst(x, z, RdViewMath.w(event.r), "#FF7A2E", 0.55); this.effects.ring(x, z, RdViewMath.w(event.r), "#FFC266", 0.45); },
            dash: (x, z, event) => {
                this.effects.streak(x, z, event.d, RdViewMath.w(event.r), 0.9, "#7CFFB0", 0.35);
                this.effects.ring(x, z, 0.9, "#4FBF7A", 0.3);
            },
            knock: (x, z, event) => {
                this.effects.streak(x, z, event.d, RdViewMath.w(event.r), 0.7, "#FFB27A", 0.4);
                this.effects.burst(x, z, 0.8, "#FF7A5A", 0.3);
            },
            quake: (x, z, event) => { this.effects.shockwave(x, z, RdViewMath.w(event.r), "#FF5A3C"); this.kit.world.rig.shake(0.45, 0.45); },
            stomp: (x, z) => { this.effects.shockwave(x, z, 9, "#FF5A3C"); this.effects.burst(x, z, 3.2, "#FFB27A", 0.6); this.kit.world.rig.shake(0.6, 0.6); },
            barrier: (x, z, event) => { this.effects.barrier(x, z, event.d, RdViewMath.w(event.r)); this.kit.world.rig.shake(0.2, 0.25); },
            heal: (x, z, event) => {
                this.effects.ring(x, z, 1.1, "#7CFFB0", 0.7);
                this.effects.burst(x, z, 0.9, "#7CFFB0", 0.5);
                const from = this.heroWorld(event.d - 1);
                if (from)
                    this.effects.beam(from.x, from.z, x, z, "#B8FFD6", 0.35);
            },
            beam: (x, z, event) => {
                const from = event.id >= 1 && event.id <= RdRules.SEATS ? this.heroWorld(event.id - 1) : null;
                if (from)
                    this.effects.beam(from.x, from.z, x, z, "#FFE38A", 0.18);
            },
            swing: (x, z, event) => {
                const hero = event.id >= 1 && event.id <= RdRules.SEATS ? RdBalance.heroSpec(event.id - 1) : null;
                this.effects.swing(x, z, event.d, RdViewMath.w(event.r) + 0.5, hero && hero.style === "cleave" ? hero.arc : Math.PI / 2, hero ? hero.color : "#FFFFFF");
            },
            stun: (x, z) => this.effects.ring(x, z, 0.9, "#FFE066", 0.4),
            meteor: (x, z, event) => { this.effects.meteor(x, z, RdViewMath.w(event.r)); this.kit.world.rig.shake(0.35, 0.4); },
            slam: (x, z, event) => { this.effects.ring(x, z, RdViewMath.w(event.r), "#FF9A6A", 0.4); this.kit.world.rig.shake(0.18, 0.2); },
            leap: (x, z, event) => { this.effects.burst(x, z, RdViewMath.w(event.r), "#FFB27A", 0.5); this.effects.ring(x, z, RdViewMath.w(event.r), "#FFFFFF", 0.4); this.kit.world.rig.shake(0.3, 0.35); },
            "wall-stun": (x, z) => { this.effects.ring(x, z, 2.6, "#FFE066", 0.6); this.kit.world.rig.shake(0.4, 0.35); },
            crack: (x, z, event) => this.effects.crack(x, z, RdViewMath.w(event.r), event.d + RdGroundSpawn.RISE_SECONDS * 0.6),
            "pillar-break": (x, z) => this.effects.burst(x, z, 1.6, "#C58BFF", 0.6),
            "pillar-restore": (x, z) => this.effects.ring(x, z, 1.6, "#C58BFF", 0.6),
            "zone-ok": (x, z) => this.effects.ring(x, z, 6, "#4C9BFF", 1.0),
            "zone-fail": (x, z) => { this.effects.ring(x, z, 10, "#FF4040", 1.0); this.kit.world.rig.shake(0.45, 0.5); },
            "pillars-fail": (x, z) => { this.effects.ring(x, z, 10, "#FF4040", 1.0); this.kit.world.rig.shake(0.45, 0.5); },
            revive: (x, z) => this.effects.ring(x, z, 1.2, "#FFF2B0", 0.9),
            "boss-enter": () => this.kit.world.rig.shake(0.25, 1.4),
            "boss-down": () => { this.slowMo = 0.9; this.kit.world.rig.shake(0.5, 0.6); }
        };
        const THREE = kit.libs.THREE;
        this.root = new THREE.Group();
        this.map = new RdMapView(kit.libs, kit.library);
        this.effects = new RdEffectManager(kit.libs);
        this.telegraphs = new RdTelegraphView(kit.libs);
        this.zones = new RdZoneView(kit.libs);
        this.map.build();
        this.root.add(this.map.group, this.zones.group, this.telegraphs.group, this.effects.group);
        this.root.visible = false;
        kit.world.matchGroup.add(this.root);
    }
    setRoster(roster) {
        this.roster = roster.slice();
        roster.forEach((entry) => {
            const current = this.heroes[entry.slot];
            if (current && current.entry.nick === entry.nick && JSON.stringify(current.entry.look) === JSON.stringify(entry.look) && current.entry.isMe === entry.isMe)
                return;
            if (current)
                current.dispose();
            this.heroes[entry.slot] = new RdHeroActor(this.kit.libs, this.root, this.kit.factory, this.kit.clips, this.kit.labels, entry);
        });
    }
    heroWorld(slot) {
        const actor = this.heroes[slot];
        return actor ? { x: actor.worldX, z: actor.worldZ } : null;
    }
    unitWorld(id) {
        if (id >= 1 && id <= RdRules.SEATS)
            return this.heroWorld(id - 1);
        const foe = this.foes.get(id);
        return foe ? { x: foe.worldX, z: foe.worldZ } : null;
    }
    get slowFactor() {
        return this.slowMo > 0 ? 0.35 : 1;
    }
    apply(state, time, poses, localSlot, dt) {
        this.root.visible = true;
        this.snapshot = state.snap;
        this.flow = state.flow;
        this.nowMs += dt * 1000;
        const flow = state.flow;
        const theme = RdFloorPlan.spec(flow.floor).theme;
        if (theme !== this.theme) {
            this.theme = theme;
            this.map.setTheme(theme);
        }
        const stageKey = flow.n + ":" + flow.stage;
        if (stageKey !== this.stage) {
            this.stage = stageKey;
            this.foes.forEach((actor) => actor.dispose());
            this.foes.clear();
            this.dying.forEach((actor) => actor.dispose());
            this.dying.length = 0;
            this.effects.clear();
            this.telegraphs.clear();
            this.map.closeAll();
        }
        this.map.setVaultOpen(flow.vault);
        state.snap.heroes.forEach((shot) => {
            const actor = this.heroes[shot.slot];
            if (!actor)
                return;
            const pose = poses(shot.slot);
            const downed = (shot.flags & RdHeroFlags.DOWN) !== 0;
            actor.setPose(pose, downed, shot.max > 0 ? shot.hp / shot.max : 0, dt, this.nowMs);
            actor.setAirborne((shot.flags & RdHeroFlags.AIRBORNE) !== 0, this.nowMs);
            actor.setGhost((shot.flags & RdHeroFlags.GONE) !== 0);
        });
        const seen = new Set();
        state.snap.foes.forEach((shot) => {
            seen.add(shot.id);
            let actor = this.foes.get(shot.id);
            if (!actor) {
                actor = this.createFoe(shot);
                this.foes.set(shot.id, actor);
                if (actor instanceof RdFoeActor && (shot.flags & RdFoeFlags.SPAWNING) && !(shot.flags & RdFoeFlags.HIDDEN) && RdBalance.MOBS[shot.kind] && RdBalance.MOBS[shot.kind].spawn === "ground")
                    actor.beginRise(this.nowMs);
            }
            if (actor instanceof RdFoeActor)
                actor.sync(shot, dt, this.nowMs);
            else
                actor.sync(shot, dt, flow.mech && flow.mech.window >= 0 ? Math.max(0, flow.mech.window - time) : -1);
        });
        this.foes.forEach((actor, id) => {
            if (seen.has(id))
                return;
            if (actor instanceof RdPropActor && actor.kind === "chest" && flow.stage === "reward")
                return;
            this.foes.delete(id);
            if (actor instanceof RdFoeActor) {
                actor.die(this.nowMs);
                this.dying.push(actor);
            }
            else {
                actor.dispose();
            }
        });
        this.telegraphs.sync(state.snap.tele, state.snap.areas, time);
        const inside = localSlot >= 0 && flow.inZone.indexOf(localSlot) >= 0;
        this.zones.setReady(flow.zone, inside);
        this.zones.setZones(flow.mech && flow.mech.kind === "zones" ? flow.mech.zones : []);
    }
    createFoe(shot) {
        if (shot.kind === "pillar" || shot.kind === "dummy" || shot.kind === "chest") {
            const owner = this.roster.filter((entry) => entry.slot === shot.owner)[0];
            return new RdPropActor(this.kit.libs, this.root, this.kit.library, this.kit.labels, shot.kind, shot.id, shot.owner, owner ? owner.nick : "");
        }
        return new RdFoeActor(this.kit.libs, this.root, this.kit.library, this.kit.clips, shot.kind, shot.id);
    }
    handle(events, localSlot) {
        const w = RdViewMath.w;
        events.forEach((event) => {
            if (event.t === "dmg") {
                const point = this.unitWorld(event.id);
                if (!point)
                    return;
                const isHero = event.id >= 1 && event.id <= RdRules.SEATS;
                this.kit.numbers.show(point.x, point.z, (event.heal ? "+" : "") + event.v, event.heal ? "heal" : isHero ? "hero" : event.v >= 60 ? "big" : "foe");
                if (event.heal)
                    return;
                if (isHero) {
                    const actor = this.heroes[event.id - 1];
                    if (actor)
                        actor.hitFlash = 0.25;
                    if (event.id - 1 === localSlot)
                        this.kit.world.rig.shake(0.12, 0.15);
                }
                else {
                    const actor = this.foes.get(event.id);
                    if (actor instanceof RdFoeActor)
                        actor.hitFlash = 0.18;
                    else if (actor)
                        actor.hit();
                }
            }
            else if (event.t === "act") {
                this.animate(event.id, event.a);
            }
            else if (event.t === "proj") {
                this.effects.launch(event.p, event.s, w(event.x), w(event.z), event.v, () => this.unitWorld(event.to), w(event.tx), w(event.tz));
            }
            else if (event.t === "hitp") {
                this.effects.land(event.p);
            }
            else if (event.t === "fx") {
                this.effect(event);
            }
            else if (event.t === "spawn") {
                if (event.door >= 0)
                    this.map.openDoor(event.door, event.door === 99 ? 3.4 : 1.8);
            }
            else if (event.t === "chest") {
                const actor = this.foes.get(event.id);
                if (actor instanceof RdPropActor)
                    actor.open();
                const point = this.unitWorld(event.id);
                if (point)
                    this.effects.burst(point.x, point.z, 1.2, "#FFD27A", 0.6);
            }
        });
    }
    animate(id, action) {
        if (id >= 1 && id <= RdRules.SEATS) {
            const actor = this.heroes[id - 1];
            if (!actor)
                return;
            const slot = id - 1;
            const key = action === "attack" ? "attack" + slot : action === "shoot" ? "shoot" + slot : action;
            actor.playAction(key, action === "dash" ? RdBalance.DASH.seconds + 0.15 : action === "heal" ? 0.8 : 0.55, this.nowMs);
            return;
        }
        const actor = this.foes.get(id);
        if (!(actor instanceof RdFoeActor)) {
            if (actor)
                actor.hit();
            return;
        }
        if (action === "attack" || action === "cast" && !actor.boss)
            actor.playAttack(this.nowMs);
        else
            actor.playAction(action, this.nowMs, action === "channel" ? 30 : action === "roar" ? 1.1 : action === "rush" ? 0.8 : 0.9);
    }
    effect(event) {
        const handler = this.fxHandlers[event.k];
        if (!handler)
            return;
        const w = RdViewMath.w;
        handler(w(event.x), w(event.z), event);
    }
    clearTransient() {
        this.effects.clear();
        this.kit.numbers.clear();
    }
    render(dt) {
        this.slowMo = Math.max(0, this.slowMo - dt);
        this.kit.numbers.update(dt);
        this.map.update(dt);
        this.effects.update(dt);
        this.telegraphs.update(dt);
        this.zones.update(dt);
        this.heroes.forEach((actor) => { if (actor)
            actor.render(dt, this.nowMs); });
        this.foes.forEach((actor) => actor.render(dt, this.nowMs));
        for (let index = this.dying.length - 1; index >= 0; index--) {
            const actor = this.dying[index];
            actor.render(dt, this.nowMs);
            if (actor.dyingFor(this.nowMs) > 1700) {
                actor.dispose();
                this.dying.splice(index, 1);
            }
        }
    }
    dispose() {
        this.heroes.forEach((actor) => { if (actor)
            actor.dispose(); });
        this.foes.forEach((actor) => actor.dispose());
        this.dying.forEach((actor) => actor.dispose());
        this.kit.world.matchGroup.remove(this.root);
    }
}
class RdMenuBackdrop {
    constructor(world, libs, library) {
        this.world = world;
        this.libs = libs;
        this.library = library;
        this.heroes = [];
        this.foes = [];
        this.seconds = 0;
        this.lastBeat = -1;
        this.ready = false;
        this.root = new libs.THREE.Group();
        this.map = new RdMapView(libs, library);
        this.map.setTheme("#D9534F");
        this.effects = new RdEffectManager(libs);
        this.root.add(this.map.group, this.effects.group);
        world.scene.add(this.root);
    }
    prepare(factory, clips, labels) {
        if (this.ready)
            return;
        this.ready = true;
        this.map.build();
        for (let slot = 0; slot < RdRules.SEATS; slot++) {
            const look = CharacterLooks.random();
            this.heroes.push(new RdHeroActor(this.libs, this.root, factory, clips, labels, { slot, nick: RdBalance.heroSpec(slot).name, look, isMe: false, isBot: true }));
        }
        const kinds = ["warrior", "minion", "rogue", "mage"];
        kinds.forEach((kind, index) => this.foes.push(new RdFoeActor(this.libs, this.root, this.library, clips, kind, 1000 + index)));
    }
    setVisible(visible) {
        this.root.visible = visible;
    }
    render(dt) {
        this.seconds += dt;
        if (!this.ready) {
            this.map.update(dt);
            this.world.rig.orbit(17, 11, (this.seconds / RdMenuBackdrop.ORBIT_SECONDS) * Math.PI * 2, 0, 1.5);
            this.world.render(dt);
            return;
        }
        const nowMs = this.seconds * 1000;
        const phase = (this.seconds % RdMenuBackdrop.CYCLE) / RdMenuBackdrop.CYCLE;
        const beat = Math.floor(this.seconds / 0.9);
        const heroSpots = [{ x: -100, z: 250 }, { x: 150, z: 180 }, { x: -650, z: 650 }, { x: 600, z: 700 }, { x: 0, z: 850 }];
        this.heroes.forEach((actor, slot) => {
            const base = heroSpots[slot];
            const sway = Math.sin(this.seconds * 0.8 + slot) * 60;
            const x = base.x + sway, z = base.z + Math.cos(this.seconds * 0.6 + slot * 2) * 40;
            const target = this.foes[slot % this.foes.length];
            const yaw = RdMath.yawOf(target.worldX - RdViewMath.w(x), target.worldZ - RdViewMath.w(z));
            actor.setPose({ x, z, yaw, moving: Math.abs(Math.cos(this.seconds * 0.8 + slot)) > 0.7, dash: false }, false, 0.6 + 0.4 * Math.abs(Math.sin(this.seconds * 0.2 + slot)), dt, nowMs);
        });
        this.foes.forEach((actor, index) => {
            const angle = -Math.PI / 2 + (index - 1.5) * 0.45;
            const radius = 900 - phase * 300;
            const x = Math.cos(angle) * radius * 0.8, z = -200 + Math.sin(angle) * radius * 0.6;
            actor.sync({ id: actor.id, kind: actor.kind, x, z, yaw: RdMath.yawOf(-x, 400 - z), hp: Math.round(1000 * (1 - phase * 0.8)), flags: RdFoeFlags.MOVING, owner: -1 }, dt, nowMs);
        });
        if (beat !== this.lastBeat) {
            this.lastBeat = beat;
            const slot = beat % RdRules.SEATS;
            const actor = this.heroes[slot];
            const foe = this.foes[beat % this.foes.length];
            const spec = RdBalance.heroSpec(slot);
            actor.playAction(spec.style === "slash" || spec.style === "cleave" ? "attack" + slot : "shoot" + slot, 0.55, nowMs);
            if (spec.style === "orb" || spec.style === "arrow")
                this.effects.launch(beat, spec.style === "orb" ? "orb" : "arrow", actor.worldX, actor.worldZ, 1600, () => ({ x: foe.worldX, z: foe.worldZ }), foe.worldX, foe.worldZ);
            if (spec.style === "beam")
                this.effects.beam(actor.worldX, actor.worldZ, foe.worldX, foe.worldZ, "#FFE38A", 0.2);
            if (beat % 3 === 0)
                foe.playAttack(nowMs);
            if (beat % 7 === 0)
                this.effects.burst(foe.worldX, foe.worldZ, 2.2, "#FF7A2E", 0.5);
        }
        this.heroes.forEach((actor) => actor.render(dt, nowMs));
        this.foes.forEach((actor) => actor.render(dt, nowMs));
        this.effects.update(dt);
        this.map.update(dt);
        this.world.rig.orbit(17, 11, (this.seconds / RdMenuBackdrop.ORBIT_SECONDS) * Math.PI * 2, 0, 1.5);
        this.world.render(dt);
    }
}
RdMenuBackdrop.ORBIT_SECONDS = 90;
RdMenuBackdrop.CYCLE = 7;
