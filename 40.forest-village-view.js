"use strict";
class FrSiteModels {
    constructor(libs, world, nature) {
        this.libs = libs;
        this.world = world;
        this.nature = nature;
    }
    surface(color) {
        const T = this.libs.THREE;
        if (FrSiteModels.STONE_COLORS.has(color))
            return new T.MeshLambertMaterial({ color, map: FrSurfaceTextures.stone(this.libs) });
        if (FrSiteModels.WOOD_COLORS.has(color))
            return new T.MeshLambertMaterial({ color: new T.Color(color).multiplyScalar(1.35), map: FrSurfaceTextures.wood(this.libs) });
        return new T.MeshLambertMaterial({ color });
    }
    fill(site, marker) {
        const T = this.libs.THREE;
        const B = FrTerrainData.BLOCK;
        const originX = (site.x + 0.5) * B, originZ = (site.z + 0.5) * B, originY = this.world.terrain.surfaceY(site.x, site.z);
        const lit = (color) => this.surface(color);
        const glow = (color) => new T.MeshBasicMaterial({ color });
        const put = (w, h, d, x, y, z, material, turn = 0) => {
            const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
            mesh.position.set(x, y, z);
            mesh.rotation.y = turn;
            mesh.castShadow = !material.isMeshBasicMaterial;
            mesh.receiveShadow = true;
            marker.add(mesh);
            return mesh;
        };
        const cellCenter = (c) => ({ x: (c.x + 0.5) * B - originX, z: (c.z + 0.5) * B - originZ, y: this.world.terrain.surfaceY(c.x, c.z) - originY });
        const builders = {
            bridge: () => this.bridge(site, put, lit, cellCenter),
            stairs: () => {
                const turn = -site.heading;
                for (let i = 0; i < 3; i++)
                    put(1.8, 0.16 + i * 0.12, 0.6, Math.cos(site.heading) * (i - 1) * 0.6, 0.1 + i * 0.06, Math.sin(site.heading) * (i - 1) * 0.6, lit(0xb9bcc4), turn);
                [-1.1, 1.1].forEach((side) => {
                    const px = -Math.sin(site.heading) * side, pz = Math.cos(site.heading) * side;
                    put(0.4, 1.3, 0.4, px, 0.65, pz, lit(0x8d9098));
                    put(0.24, 0.24, 0.24, px, 1.45, pz, glow(0xffe29a));
                });
            },
            wall: () => site.cells.forEach((c, i) => {
                const p = cellCenter(c);
                put(B, 4, B, p.x, p.y + 2, p.z, lit(0x9fa2aa));
                put(B + 0.1, 0.5, B + 0.1, p.x, p.y + 4.25, p.z, lit(0x7d808a));
                if (i % 2 === 0)
                    put(0.9, 0.7, 0.9, p.x, p.y + 4.8, p.z, lit(0xaeb1b9));
            }),
            gate: () => {
                site.cells.forEach((c) => {
                    const p = cellCenter(c);
                    put(B, 6.4, B, p.x, p.y + 3.2, p.z, lit(0x8f929b));
                    put(B + 0.3, 0.5, B + 0.3, p.x, p.y + 6.65, p.z, lit(0x6d707a));
                });
                const length = 7 * B;
                const high = cellCenter(site.cells[0]).y + 6.9;
                put(length, 1.3, B, 0, high, 0, lit(0x7b7e88), -site.heading);
                put(length - 2, 0.35, B + 0.2, 0, high - 0.85, 0, glow(0xd97b4f), -site.heading);
            },
            tower: () => {
                const sum = site.cells.reduce((a, c) => ({ x: a.x + cellCenter(c).x, z: a.z + cellCenter(c).z, y: Math.max(a.y, cellCenter(c).y) }), { x: 0, z: 0, y: -99 });
                const cx = sum.x / site.cells.length, cz = sum.z / site.cells.length;
                put(2 * B - 0.4, 8, 2 * B - 0.4, cx, sum.y + 4, cz, lit(0x9a9da6));
                put(2 * B + 0.8, 0.7, 2 * B + 0.8, cx, sum.y + 8.3, cz, lit(0x6f727c));
                [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dz]) => put(0.8, 1.1, 0.8, cx + dx * (B + 0.1), sum.y + 9.2, cz + dz * (B + 0.1), lit(0xaeb1b9)));
                put(0.2, 3.2, 0.2, cx, sum.y + 10, cz, lit(0x6b4a2a));
                put(1.5, 0.9, 0.08, cx + 0.8, sum.y + 11.2, cz, glow(0xd97b4f));
                put(0.7, 1.2, 0.12, cx, sum.y + 6.2, cz + B - 0.15, glow(0xffe29a));
            },
            lamp: () => {
                if (this.nature.has("lantern")) {
                    const lantern = this.nature.build("lantern");
                    lantern.scale.setScalar(1.3);
                    marker.add(lantern);
                    put(0.5, 0.5, 0.5, 0, 4.6, 0, glow(0xffe29a));
                }
                else {
                    put(0.28, 4.2, 0.28, 0, 2.1, 0, lit(0x3d3f46));
                    put(0.9, 0.9, 0.9, 0, 4.6, 0, glow(0xffe29a));
                }
                const halo = new T.Sprite(new T.SpriteMaterial({ map: FrFxTextures.radial(this.libs, "rgba(255,220,140,0.55)", "rgba(255,220,140,0)", 64), blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
                halo.scale.set(4.2, 4.2, 1);
                halo.position.y = 4.6;
                marker.add(halo);
            },
        };
        const key = site.defId.indexOf("bridge") === 0 ? "bridge" : site.defId;
        if (builders[key])
            builders[key]();
    }
    bridge(site, put, lit, center) {
        const along = site.heading === 0 ? "x" : "z";
        const cells = site.effect;
        const xs = cells.map((c) => c.x), zs = cells.map((c) => c.z);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
        const first = center({ x: minX, z: minZ }), last = center({ x: maxX, z: maxZ });
        const mx = (first.x + last.x) / 2, mz = (first.z + last.z) / 2;
        const B = FrTerrainData.BLOCK;
        const length = along === "x" ? (maxX - minX + 1) * B : (maxZ - minZ + 1) * B;
        const width = along === "x" ? (maxZ - minZ + 1) * B : (maxX - minX + 1) * B;
        const y = first.y + 0.05;
        const wood = lit(0x9a6a38), dark = lit(0x6f4a26);
        const dx = along === "x" ? 1 : 0, dz = along === "x" ? 0 : 1;
        [-1, 1].forEach((side) => {
            const ox = dz * side * (width / 2 - 0.1), oz = dx * side * (width / 2 - 0.1);
            put(along === "x" ? length : 0.2, 0.18, along === "x" ? 0.2 : length, mx + ox, y + 1.1, mz + oz, wood);
            for (let k = 0; k <= Math.floor(length / 3); k++) {
                const t = -length / 2 + 0.5 + k * 3;
                put(0.26, 1.2, 0.26, mx + ox + dx * t, y + 0.6, mz + oz + dz * t, dark);
            }
        });
    }
}
FrSiteModels.STONE_COLORS = new Set([0xb9bcc4, 0x8d9098, 0x9fa2aa, 0x7d808a, 0xaeb1b9, 0x8f929b, 0x6d707a, 0x7b7e88, 0x9a9da6, 0x6f727c]);
FrSiteModels.WOOD_COLORS = new Set([0x9a6a38, 0x6f4a26, 0x6b4a2a]);
class FrPlazaDecor {
    constructor(libs, world, parent) {
        this.libs = libs;
        this.world = world;
        this.level = 0;
        this.holder = new libs.THREE.Group();
        parent.add(this.holder);
    }
    refresh() {
        const level = this.world.village.level();
        if (level === this.level)
            return level;
        this.level = level;
        this.holder.clear();
        this.build(level);
        return level;
    }
    build(level) {
        const T = this.libs.THREE;
        const B = FrTerrainData.BLOCK;
        const p = this.world.terrain.anchors.plaza;
        const cx = (p.x + 0.5) * B, cz = (p.z + 0.5) * B, y = this.world.terrain.surfaceY(p.x, p.z);
        const lit = (color) => new T.MeshLambertMaterial({ color });
        const put = (geometry, material, x, yy, z) => {
            const mesh = new T.Mesh(geometry, material);
            mesh.position.set(cx + x, y + yy, cz + z);
            this.holder.add(mesh);
            return mesh;
        };
        if (level >= 2)
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                put(new T.BoxGeometry(0.9, 0.5, 0.7), lit(0x8d9098), Math.cos(a) * 3.6, 0.25, Math.sin(a) * 3.6).rotation.y = -a;
            }
        if (level >= 3) {
            put(new T.CylinderGeometry(2.1, 2.3, 0.8, 20), lit(0xa9acb4), -8, 0.4, 0);
            put(new T.CylinderGeometry(1.8, 1.8, 0.1, 20), new T.MeshBasicMaterial({ color: 0x5fb4e8 }), -8, 0.78, 0);
            put(new T.CylinderGeometry(0.28, 0.4, 2.2, 10), lit(0xc3c6ce), -8, 1.5, 0);
            put(new T.SphereGeometry(0.5, 12, 8), new T.MeshBasicMaterial({ color: 0x9fdcff }), -8, 2.8, 0);
        }
        if (level >= 4) {
            put(new T.BoxGeometry(2.2, 9, 2.2), lit(0xb9a98a), 8, 4.5, -6);
            put(new T.ConeGeometry(1.9, 2.4, 4), lit(0xa2493a), 8, 10.2, -6).rotation.y = Math.PI / 4;
            [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((a) => {
                const face = put(new T.CircleGeometry(0.8, 18), new T.MeshBasicMaterial({ color: 0xfff7dc }), 8 + Math.sin(a) * 1.12, 7.4, -6 + Math.cos(a) * 1.12);
                face.rotation.y = a;
            });
        }
        if (level >= 5) {
            const colors = [0xd97b4f, 0xe7c98a, 0x9be08a, 0x7ba8ff, 0xe5483f, 0xf5d24a];
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                const x = Math.cos(a) * 11, z = Math.sin(a) * 11;
                put(new T.CylinderGeometry(0.1, 0.12, 4.4, 6), lit(0x6b4a2a), x, 2.2, z);
                put(new T.BoxGeometry(1.1, 0.7, 0.06), new T.MeshBasicMaterial({ color: colors[i % colors.length] }), x, 4.0, z).rotation.y = -a;
            }
        }
    }
}
