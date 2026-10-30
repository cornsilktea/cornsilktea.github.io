"use strict";
class FrBlockCatalogView {
    static style(id) { return FrBlockCatalogView.STYLES[id] || FrBlockCatalogView.STYLES.block_stone; }
    static knows(id) { return !!FrBlockCatalogView.STYLES[id]; }
}
FrBlockCatalogView.STYLES = {
    block_dirt: { shape: "cube", top: "#8a6038", side: "#7a5230", bottom: "#6f4b2b", pattern: "noise", alpha: 1 },
    block_grass: { shape: "cube", top: "#6fb84a", side: "#8a6038", bottom: "#6f4b2b", pattern: "grass", alpha: 1 },
    block_sand: { shape: "cube", top: "#ead79a", side: "#d9c488", bottom: "#c9b478", pattern: "noise", alpha: 1 },
    block_stone: { shape: "cube", top: "#a6a9b0", side: "#9396a0", bottom: "#82858e", pattern: "noise", alpha: 1 },
    block_ice: { shape: "cube", top: "#cff0ff", side: "#b6e4f6", bottom: "#a6d8ee", pattern: "glass", alpha: 0.72 },
    block_brick: { shape: "cube", top: "#c3c5ca", side: "#b0b3ba", bottom: "#9a9da4", pattern: "brick", alpha: 1 },
    block_wood: { shape: "cube", top: "#c9985f", side: "#b8814a", bottom: "#a06f3d", pattern: "plank", alpha: 1 },
    block_plank: { shape: "cube", top: "#dcae78", side: "#d2a068", bottom: "#c0905a", pattern: "plank", alpha: 1 },
    block_glass: { shape: "cube", top: "#d6f0fa", side: "#c8e8f6", bottom: "#bcdcea", pattern: "glass", alpha: 0.42 },
    block_color_0: { shape: "cube", top: "#f26b67", side: "#e0524e", bottom: "#c94440", pattern: "noise", alpha: 1 },
    block_color_1: { shape: "cube", top: "#f8d860", side: "#e8c648", bottom: "#d0b03a", pattern: "noise", alpha: 1 },
    block_color_2: { shape: "cube", top: "#6fa8f2", side: "#5a92e0", bottom: "#487ac8", pattern: "noise", alpha: 1 },
    block_color_3: { shape: "cube", top: "#74cf70", side: "#5cbc58", bottom: "#4aa447", pattern: "noise", alpha: 1 },
    block_stairs: { shape: "stairs", top: "#dcae78", side: "#d2a068", bottom: "#c0905a", pattern: "plank", alpha: 1 },
    block_slab: { shape: "slab", top: "#dcae78", side: "#d2a068", bottom: "#c0905a", pattern: "plank", alpha: 1 },
    block_fence: { shape: "fence", top: "#c28f58", side: "#b8814a", bottom: "#a06f3d", pattern: "plank", alpha: 1 },
    block_door: { shape: "door", top: "#a8743c", side: "#9a6a36", bottom: "#8a5c2c", pattern: "plank", alpha: 1 },
    block_window: { shape: "window", top: "#b8dff0", side: "#a6d2e8", bottom: "#96c4dc", pattern: "glass", alpha: 0.55 },
    block_torch: { shape: "torch", top: "#ffb02e", side: "#6b4423", bottom: "#6b4423", pattern: "noise", alpha: 1 },
};
class FrBlockTextures {
    static get(libs, color, pattern, fringe = "") {
        const key = color + pattern + fringe;
        const cached = FrBlockTextures.cache.get(key);
        if (cached)
            return cached;
        const size = 16;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const g = canvas.getContext("2d");
        g.fillStyle = color;
        g.fillRect(0, 0, size, size);
        for (let i = 0; i < 28; i++) {
            g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)";
            g.fillRect(Math.floor(Math.random() * size), Math.floor(Math.random() * size), 1 + Math.floor(Math.random() * 2), 1);
        }
        g.strokeStyle = "rgba(0,0,0,0.22)";
        g.lineWidth = 1;
        if (pattern === "brick") {
            g.beginPath();
            [5, 11].forEach((y) => { g.moveTo(0, y + 0.5); g.lineTo(size, y + 0.5); });
            [[0, 5, 4], [5, 11, 10], [11, 16, 4]].forEach(([y0, y1, x]) => { g.moveTo(x + 0.5, y0); g.lineTo(x + 0.5, y1); });
            g.stroke();
        }
        else if (pattern === "plank") {
            g.beginPath();
            [4, 8, 12].forEach((y) => { g.moveTo(0, y + 0.5); g.lineTo(size, y + 0.5); });
            g.stroke();
        }
        else if (pattern === "glass") {
            g.strokeStyle = "rgba(255,255,255,0.7)";
            g.strokeRect(0.5, 0.5, size - 1, size - 1);
            g.beginPath();
            g.moveTo(3, 12);
            g.lineTo(10, 4);
            g.stroke();
        }
        else if (pattern === "grass" && fringe) {
            g.fillStyle = fringe;
            g.fillRect(0, 0, size, 4);
            for (let x = 0; x < size; x += 2)
                g.fillRect(x, 4, 1, 1 + ((x * 7) % 3));
        }
        g.strokeStyle = "rgba(0,0,0,0.16)";
        g.strokeRect(0.5, 0.5, size - 1, size - 1);
        const texture = new libs.THREE.CanvasTexture(canvas);
        texture.magFilter = libs.THREE.NearestFilter;
        texture.minFilter = libs.THREE.NearestFilter;
        texture.colorSpace = libs.THREE.SRGBColorSpace;
        FrBlockTextures.cache.set(key, texture);
        return texture;
    }
}
FrBlockTextures.cache = new Map();
class FrGeometryMerge {
    static boxes(libs, parts, color) {
        const T = libs.THREE;
        const positions = [], normals = [], uvs = [], colors = [];
        parts.forEach((part, i) => {
            const box = new T.BoxGeometry(part[0], part[1], part[2]).translate(part[3], part[4], part[5]).toNonIndexed();
            positions.push(...Array.from(box.getAttribute("position").array));
            normals.push(...Array.from(box.getAttribute("normal").array));
            uvs.push(...Array.from(box.getAttribute("uv").array));
            if (color) {
                const c = new T.Color(color(i));
                for (let v = 0; v < box.getAttribute("position").count; v++)
                    colors.push(c.r, c.g, c.b);
            }
        });
        const geometry = new T.BufferGeometry();
        geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
        geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
        if (color)
            geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
        return geometry;
    }
}
class FrBlockType {
    constructor(libs, parent, id, geometry, material) {
        this.libs = libs;
        this.parent = parent;
        this.id = id;
        this.geometry = geometry;
        this.material = material;
        this.keys = [];
        this.slotOf = new Map();
        this.capacity = 256;
        this.mesh = this.create(this.capacity);
        parent.add(this.mesh);
    }
    create(capacity) {
        const mesh = new this.libs.THREE.InstancedMesh(this.geometry, this.material, capacity);
        mesh.count = 0;
        mesh.frustumCulled = false;
        return mesh;
    }
    put(key, matrix) {
        const existing = this.slotOf.get(key);
        if (existing !== undefined) {
            this.mesh.setMatrixAt(existing, matrix);
            this.mesh.instanceMatrix.needsUpdate = true;
            return;
        }
        if (this.keys.length >= this.capacity)
            this.grow();
        const slot = this.keys.length;
        this.keys.push(key);
        this.slotOf.set(key, slot);
        this.mesh.setMatrixAt(slot, matrix);
        this.mesh.count = this.keys.length;
        this.mesh.instanceMatrix.needsUpdate = true;
    }
    take(key) {
        const slot = this.slotOf.get(key);
        if (slot === undefined)
            return false;
        const lastSlot = this.keys.length - 1;
        if (slot !== lastSlot) {
            const lastKey = this.keys[lastSlot];
            const matrix = new this.libs.THREE.Matrix4();
            this.mesh.getMatrixAt(lastSlot, matrix);
            this.mesh.setMatrixAt(slot, matrix);
            this.keys[slot] = lastKey;
            this.slotOf.set(lastKey, slot);
        }
        this.keys.pop();
        this.slotOf.delete(key);
        this.mesh.count = this.keys.length;
        this.mesh.instanceMatrix.needsUpdate = true;
        return true;
    }
    grow() {
        const bigger = this.create(this.capacity * 2);
        bigger.instanceMatrix.array.set(this.mesh.instanceMatrix.array);
        bigger.count = this.keys.length;
        this.parent.remove(this.mesh);
        this.mesh.dispose();
        this.mesh = bigger;
        this.parent.add(bigger);
        this.capacity *= 2;
        bigger.instanceMatrix.needsUpdate = true;
    }
    size() { return this.keys.length; }
}
class FrBlockLayer {
    constructor(libs, world, group) {
        this.libs = libs;
        this.world = world;
        this.group = group;
        this.types = new Map();
        this.where = new Map();
        this.roofLot = -1;
        this.matrix = new libs.THREE.Matrix4();
        world.blocks.forEach((index, y, record) => this.apply(index % world.terrain.w, Math.floor(index / world.terrain.w), y, record));
    }
    setRoofLot(lot) {
        if (lot === this.roofLot)
            return;
        const lots = [this.roofLot, lot];
        this.roofLot = lot;
        this.world.blocks.forEach((index, y, record) => {
            if (y < FrBlockLayer.ROOF_FROM)
                return;
            const x = index % this.world.terrain.w, z = Math.floor(index / this.world.terrain.w);
            if (lots.indexOf(FrBlockRules.lotIndexAt(this.world, x, z)) >= 0)
                this.apply(x, z, y, record);
        });
    }
    count() { return this.world.blocks.total(); }
    apply(x, z, y, record) {
        const key = x + "_" + z + "_" + y;
        const previous = this.where.get(key);
        if (previous) {
            const type = this.types.get(previous);
            if (type)
                type.take(key);
            this.where.delete(key);
        }
        if (!record)
            return;
        const type = this.typeFor(record.t);
        const B = FrTerrainData.BLOCK;
        const T = this.libs.THREE;
        const hidden = this.roofLot >= 0 && y >= FrBlockLayer.ROOF_FROM && FrBlockRules.lotIndexAt(this.world, x, z) === this.roofLot;
        const scale = hidden ? 0.0001 : 1;
        this.matrix.compose(new T.Vector3((x + 0.5) * B, this.world.terrain.surfaceY(x, z) + y * B, (z + 0.5) * B), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), (record.r || 0) * Math.PI / 2), new T.Vector3(scale, scale, scale));
        type.put(key, this.matrix);
        this.where.set(key, record.t);
    }
    typeFor(id) {
        const existing = this.types.get(id);
        if (existing)
            return existing;
        const T = this.libs.THREE;
        const furniture = FrFurnitureCatalog.find(id);
        if (furniture) {
            const type = new FrBlockType(this.libs, this.group, id, FrGeometryMerge.boxes(this.libs, furniture.boxes.map((b) => [b[0], b[1], b[2], b[3], b[4], b[5]]), (i) => furniture.boxes[i][6]), new T.MeshLambertMaterial({ vertexColors: true }));
            this.types.set(id, type);
            return type;
        }
        const style = FrBlockCatalogView.style(id);
        const make = (color, fringe = "") => new T.MeshLambertMaterial({ map: FrBlockTextures.get(this.libs, color, style.pattern, fringe), transparent: style.alpha < 1, opacity: style.alpha, depthWrite: style.alpha >= 1 });
        let geometry;
        let material;
        if (style.shape === "torch") {
            geometry = FrGeometryMerge.boxes(this.libs, [[0.3, 1.3, 0.3, 0, 0.65, 0], [0.5, 0.5, 0.5, 0, 1.5, 0]], (i) => (i === 0 ? 0x6b4423 : 0xffc040));
            material = new T.MeshBasicMaterial({ vertexColors: true });
        }
        else if (style.shape === "cube") {
            geometry = new T.BoxGeometry(2, 2, 2).translate(0, 1, 0);
            const side = make(style.side, style.pattern === "grass" ? "#6fb84a" : "");
            material = [side, side, make(style.top), make(style.bottom), side, side];
        }
        else {
            geometry = this.shapeGeometry(style.shape);
            material = make(style.side);
        }
        const type = new FrBlockType(this.libs, this.group, id, geometry, material);
        this.types.set(id, type);
        return type;
    }
    shapeGeometry(shape) {
        if (shape === "slab")
            return FrGeometryMerge.boxes(this.libs, [[2, 1, 2, 0, 0.5, 0]]);
        if (shape === "stairs")
            return FrGeometryMerge.boxes(this.libs, [[2, 1, 2, 0, 0.5, 0], [2, 1, 1, 0, 1.5, -0.5]]);
        if (shape === "fence")
            return FrGeometryMerge.boxes(this.libs, [[0.5, 2, 0.5, 0, 1, 0], [2, 0.28, 0.2, 0, 0.7, 0], [2, 0.28, 0.2, 0, 1.4, 0]]);
        if (shape === "door")
            return FrGeometryMerge.boxes(this.libs, [[1.5, 2, 0.28, 0, 1, 0]]);
        return FrGeometryMerge.boxes(this.libs, [[2, 0.25, 0.3, 0, 0.125, 0], [2, 0.25, 0.3, 0, 1.875, 0], [0.25, 2, 0.3, -0.875, 1, 0], [0.25, 2, 0.3, 0.875, 1, 0], [1.5, 1.5, 0.12, 0, 1, 0]]);
    }
}
FrBlockLayer.ROOF_FROM = 3;
class FrLotMarkers {
    constructor(libs, world, parent, labels, selfUid) {
        this.libs = libs;
        this.world = world;
        this.parent = parent;
        this.labels = labels;
        this.selfUid = selfUid;
        this.frames = [];
        this.signs = new Map();
        this.group = new libs.THREE.Group();
        parent.add(this.group);
        const B = FrTerrainData.BLOCK;
        world.terrain.anchors.lots.forEach((lot) => {
            const frame = new libs.THREE.Group();
            const S = lot.size * B;
            const material = new libs.THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
            [[S, 0.2, 0.3, S / 2, 0, 0.15], [S, 0.2, 0.3, S / 2, 0, S - 0.15], [0.3, 0.2, S, 0.15, 0, S / 2], [0.3, 0.2, S, S - 0.15, 0, S / 2]].forEach(([w, h, d, x, y, z]) => {
                const bar = new libs.THREE.Mesh(new libs.THREE.BoxGeometry(w, h, d), material);
                bar.position.set(x, y + 0.12, z);
                frame.add(bar);
            });
            frame.position.set(lot.x * B, world.terrain.surfaceY(lot.x, lot.z), lot.z * B);
            this.group.add(frame);
            this.frames.push(frame);
        });
        this.refresh();
    }
    groupObject() { return this.group; }
    refresh() {
        const B = FrTerrainData.BLOCK;
        this.frames.forEach((frame, index) => {
            const lot = this.world.lots.get(index);
            const color = !lot ? 0xffffff : lot.uid === this.selfUid ? 0x9be08a : 0xd97b4f;
            frame.children.forEach((bar) => { bar.material.color.setHex(color); });
            const old = this.signs.get(index);
            if (old) {
                frame.remove(old);
                this.signs.delete(index);
            }
            if (lot) {
                const sign = this.labels.create(lot.name + "의 집", "#FFE2C9");
                sign.scale.set(3.4, 0.85, 1);
                const anchor = this.world.terrain.anchors.lots[index];
                sign.position.set(anchor.size * B / 2, 2.2, 0.6);
                frame.add(sign);
                this.signs.set(index, sign);
            }
        });
    }
}
