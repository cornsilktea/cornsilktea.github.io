"use strict";
class FrAreaScene {
    constructor(libs, area, material, light) {
        this.libs = libs;
        this.area = area;
        this.chunks = new Map();
        this.featureGroups = new Map();
        this.torchFlames = [];
        const T = libs.THREE;
        this.group = new T.Group();
        this.terrainGroup = new T.Group();
        this.featureLayer = new T.Group();
        this.group.add(this.terrainGroup, this.featureLayer);
        this.mesher = new FrTerrainMesher(libs, area.terrain, material);
        if (light)
            this.mesher.light = (x, z) => light.at(x, z);
        const counts = this.mesher.chunkCount();
        for (let cz = 0; cz < counts.z; cz++)
            for (let cx = 0; cx < counts.x; cx++)
                this.rebuild(cx, cz);
        area.list.forEach((feature) => this.addFeature(feature));
    }
    rebuild(cx, cz) {
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
    editCell(x, z) {
        const C = FrTerrainMesher.CHUNK;
        const cx = Math.floor(x / C), cz = Math.floor(z / C);
        this.rebuild(cx, cz);
        if (x % C === 0)
            this.rebuild(cx - 1, cz);
        if (x % C === C - 1)
            this.rebuild(cx + 1, cz);
        if (z % C === 0)
            this.rebuild(cx, cz - 1);
        if (z % C === C - 1)
            this.rebuild(cx, cz + 1);
    }
    groundObjects() { return this.terrainGroup.children; }
    featureObjects() { return this.featureLayer.children; }
    mat(color) { return new this.libs.THREE.MeshLambertMaterial({ color }); }
    addFeature(feature) {
        const T = this.libs.THREE;
        const B = FrTerrainData.BLOCK;
        const holder = new T.Group();
        holder.position.set((feature.x + 0.5) * B, this.area.terrain.surfaceY(feature.x, feature.z), (feature.z + 0.5) * B);
        holder.userData = { kind: "feature", x: feature.x, z: feature.z };
        const builders = {
            fruitTree: () => this.tree(holder, feature, true),
            jungleTree: () => this.tree(holder, feature, false),
            flower: () => this.flower(holder, feature),
            shoreSpot: () => this.shore(holder, feature),
            torch: () => this.torch(holder, feature),
            ladderDown: () => this.ladder(holder, 0x8a5a2b, -1),
            ladderUp: () => this.ladder(holder, 0x8a5a2b, 1),
            exit: () => this.exit(holder),
        };
        builders[feature.kind]();
        this.featureLayer.add(holder);
        this.featureGroups.set(feature, holder);
    }
    tree(holder, feature, fruit) {
        const T = this.libs.THREE;
        const scale = 0.85 + (feature.variant % 3) * 0.12;
        const trunk = new T.Mesh(new T.BoxGeometry(0.55, 2.6, 0.55).translate(0, 1.3, 0), this.mat(0x7a5230));
        const crown = new T.Mesh(new T.IcosahedronGeometry(1.55, 0).scale(1, 0.92, 1).translate(0, 3.5, 0), this.mat(fruit ? 0x3f8f3e : 0x2f7a35 + feature.variant * 0x010400));
        trunk.scale.setScalar(scale);
        crown.scale.setScalar(scale);
        holder.add(trunk, crown);
        if (fruit) {
            const colors = [0xe5483f, 0xf29a2e, 0xc8d95a, 0xf7a9a0, 0xf5b93a];
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2 + feature.variant, lift = 3.0 + (i % 3) * 0.55;
                const apple = new T.Mesh(new T.SphereGeometry(0.28, 8, 6), new T.MeshBasicMaterial({ color: colors[(feature.variant + (i % 2)) % colors.length] }));
                apple.position.set(Math.cos(angle) * 1.35 * scale, lift * scale, Math.sin(angle) * 1.35 * scale);
                holder.add(apple);
            }
        }
    }
    flower(holder, feature) {
        const T = this.libs.THREE;
        const colors = [0xe8514f, 0xf5c93a, 0x4f8fe8, 0xf4f4f4];
        holder.add(new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.9, 5).translate(0, 0.45, 0), this.mat(0x3f8f3a)));
        for (let i = 0; i < 5; i++) {
            const petal = new T.Mesh(new T.SphereGeometry(0.2, 6, 5), this.mat(colors[feature.variant % 4]));
            petal.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.3, 1.0, Math.sin((i / 5) * Math.PI * 2) * 0.3);
            holder.add(petal);
        }
        holder.add(new T.Mesh(new T.SphereGeometry(0.16, 6, 5).translate(0, 1.0, 0), this.mat(0xffd94a)));
    }
    shore(holder, feature) {
        const T = this.libs.THREE;
        const shapes = {
            shell: () => new T.Mesh(new T.ConeGeometry(0.5, 0.6, 7).translate(0, 0.3, 0), this.mat(0xf5c8d0)),
            salt: () => new T.Mesh(new T.BoxGeometry(0.7, 0.45, 0.7).translate(0, 0.22, 0), this.mat(0xf2f4f8)),
            seaweed: () => new T.Mesh(new T.CylinderGeometry(0.12, 0.2, 1.1, 5).translate(0, 0.55, 0), this.mat(0x2f7a4a)),
            sand: () => new T.Mesh(new T.ConeGeometry(0.7, 0.5, 6).translate(0, 0.25, 0), this.mat(0xe6d08f)),
        };
        const mesh = shapes[feature.item]();
        holder.add(mesh);
        const ring = new T.Mesh(new T.RingGeometry(0.75, 0.95, 20).rotateX(-Math.PI / 2).translate(0, 0.05, 0), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
        holder.add(ring);
    }
    torch(holder, feature) {
        const T = this.libs.THREE;
        const stick = new T.Mesh(new T.BoxGeometry(0.22, 1.3, 0.22).translate(0, 4.4, 0), this.mat(0x6b4423));
        holder.add(stick);
        const flame = new T.Sprite(new T.SpriteMaterial({ map: FrFxTextures.flame(this.libs), blending: T.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffd080 }));
        flame.scale.set(1.2, 1.8, 1);
        flame.position.y = 5.5;
        const halo = new T.Sprite(new T.SpriteMaterial({ map: FrFxTextures.radial(this.libs, "rgba(255,190,90,0.7)", "rgba(255,150,40,0)", 64), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
        halo.scale.set(6, 6, 1);
        halo.position.y = 5.3;
        holder.add(flame, halo);
        this.torchFlames.push({ sprite: flame, phase: feature.x * 1.7 + feature.z });
    }
    ladder(holder, color, direction) {
        const T = this.libs.THREE;
        [-0.5, 0.5].forEach((x) => holder.add(new T.Mesh(new T.BoxGeometry(0.16, 3, 0.16).translate(x, 1.5, 0), this.mat(color))));
        for (let i = 0; i < 5; i++)
            holder.add(new T.Mesh(new T.BoxGeometry(1.1, 0.12, 0.12).translate(0, 0.5 + i * 0.55, 0), this.mat(color)));
        const arrow = new T.Mesh(new T.ConeGeometry(0.4, 0.8, 4).translate(0, direction > 0 ? 3.6 : -0.1, 0), new T.MeshBasicMaterial({ color: direction > 0 ? 0x9be08a : 0xffd43a }));
        if (direction < 0)
            arrow.rotation.x = Math.PI;
        holder.add(arrow);
    }
    exit(holder) {
        const T = this.libs.THREE;
        const ring = new T.Mesh(new T.TorusGeometry(1.6, 0.18, 8, 24).translate(0, 2, 0), new T.MeshBasicMaterial({ color: 0x9be08a }));
        const disc = new T.Mesh(new T.CircleGeometry(1.5, 24).translate(0, 2, 0), new T.MeshBasicMaterial({ color: 0xcfffc0, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
        holder.add(ring, disc);
    }
    syncAvailability(now) {
        this.area.list.forEach((feature) => {
            if (!feature.gatherable || feature.availableAt <= now)
                return;
            if (feature.kind === "fruitTree")
                this.showFruitless(feature);
            else
                this.setTaken(feature, true);
        });
    }
    setTaken(feature, taken) {
        const holder = this.featureGroups.get(feature);
        if (!holder)
            return;
        holder.visible = !taken;
    }
    showFruitless(feature) {
        const holder = this.featureGroups.get(feature);
        if (!holder)
            return;
        holder.children.forEach((child) => { if (child.geometry && child.geometry.type === "SphereGeometry" && child.position.y > 2)
            child.visible = false; });
    }
    update(time) {
        this.torchFlames.forEach((t) => { const s = 1 + 0.12 * Math.sin(time * 9 + t.phase) + 0.06 * Math.sin(time * 17 + t.phase); t.sprite.scale.set(1.2 * s, 1.8 * s, 1); });
    }
    dispose() {
        this.chunks.forEach((mesh) => mesh.geometry.dispose());
        this.group.clear();
    }
}
