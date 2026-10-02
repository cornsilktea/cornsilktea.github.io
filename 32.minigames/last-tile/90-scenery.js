"use strict";
class Palette {
    static slotColor(slot) {
        return Palette.SLOT_COLORS[slot % Palette.SLOT_COLORS.length];
    }
    static floorColorIndex(floor) {
        if (LastTileRules.FLOOR_COUNT <= 1)
            return 2;
        return Math.round(floor / (LastTileRules.FLOOR_COUNT - 1) * 2);
    }
}
Palette.SLOT_COLORS = ["#E5484D", "#3E8EF0", "#3FB56B", "#F0C22E", "#B060E0", "#F08AB0"];
Palette.FLOOR_COLORS = ["#A0673E", "#D9A45E", "#F2DDA4"];
Palette.WARN_COLOR = "#E24A3A";
Palette.SKY = "#161A2C";
Palette.CLOUD = 0xC9D2EC;
Palette.RIM = 0x5A4A62;
Palette.ISLAND = 0x4A4256;
Palette.SKY_LIGHT = 0xDCE6FF;
Palette.GROUND_LIGHT = 0x40324A;
Palette.SUN_LIGHT = 0xFFF0D2;
Palette.LABEL_BACKGROUND = "rgba(12,16,26,.78)";
Palette.SHADOW = "rgba(0,0,0,.55)";
class SceneryKit {
    constructor(libs) {
        this.libs = libs;
        this.tile = null;
        this.props = new Map();
    }
    async load() {
        const loader = new this.libs.GLTFLoader();
        const THREE = this.libs.THREE;
        const tileJob = loader.loadAsync(SceneryKit.DIRECTORY + SceneryKit.TILE_MODEL).then((gltf) => {
            const mesh = gltf.scene.getObjectByProperty("isMesh", true);
            this.tile = mesh.geometry;
        });
        const propJobs = SceneryKit.DECOR_PROPS.map((prop) => loader.loadAsync(SceneryKit.DIRECTORY + "objects/" + prop.model + ".glb").then((gltf) => {
            gltf.scene.traverse((node) => {
                const mesh = node;
                if (!mesh.isMesh)
                    return;
                const source = mesh.material;
                mesh.material = new THREE.MeshLambertMaterial({ map: source.map, color: source.color });
            });
            this.props.set(prop.model, gltf.scene);
        }).catch(() => undefined));
        await Promise.all([tileJob, ...propJobs]);
    }
    tileGeometry() {
        if (!this.tile)
            throw new Error("발판 모델을 아직 불러오지 못했어요.");
        return this.tile;
    }
    propTemplate(model) {
        return this.props.get(model) || null;
    }
}
SceneryKit.DIRECTORY = "assets/kaykit/medieval/";
SceneryKit.TILE_MODEL = "tiles/square_sand.glb";
SceneryKit.DECOR_PROPS = [
    { model: "detail_treeA", height: 4.2 }, { model: "detail_treeB", height: 4.6 }, { model: "detail_treeC", height: 3.8 },
    { model: "detail_rocks", height: 1.6 }, { model: "detail_rocks_small", height: 1.1 }, { model: "detail_hill", height: 2.4 }, { model: "detail_forestA", height: 3.4 }
];
class TileAppearance {
    constructor() {
        this.look = { x: 0, y: 0, z: 0, scaleX: 0, scaleY: 0, scaleZ: 0, warning: 0, shaded: false };
    }
    of(board, floor, index, t) {
        const center = LastTileGeometry.tileCenter(index);
        const look = this.look;
        look.x = center.x;
        look.z = center.z;
        look.y = TileAppearance.RESTING_Y;
        look.scaleX = look.scaleZ = LastTileRules.TILE_SCALE;
        look.scaleY = TileAppearance.RESTING_HEIGHT;
        look.warning = 0;
        look.shaded = ((index % LastTileRules.GRID) + Math.floor(index / LastTileRules.GRID)) % 2 === 1;
        if (board.isHole(floor, index)) {
            look.scaleX = look.scaleY = look.scaleZ = 0;
            return look;
        }
        const trigger = board.triggerTime(floor, index), collapse = board.collapseTime(floor, index);
        if (trigger === Infinity || t < trigger)
            return look;
        if (t < collapse)
            this.tremble(look, index, t, trigger, collapse);
        else
            this.fall(look, t, collapse);
        return look;
    }
    tremble(look, index, t, trigger, collapse) {
        const progress = (t - trigger) / Math.max(1, collapse - trigger);
        look.warning = TileAppearance.TREMBLE_START + progress * (1 - TileAppearance.TREMBLE_START);
        look.x += Math.sin(t * 0.06 + index * 1.7) * 0.06 * progress;
        look.z += Math.cos(t * 0.07 + index) * 0.06 * progress;
        look.y -= 0.05 * progress;
    }
    fall(look, t, collapse) {
        const seconds = (t - collapse) / 1000;
        look.warning = 1;
        look.y -= 0.5 * LastTileRules.GRAVITY * seconds * seconds * 0.6;
        const shrink = MathUtil.clamp(1 - seconds / TileAppearance.SHRINK_SECONDS, 0, 1);
        look.scaleX *= shrink;
        look.scaleZ *= shrink;
        look.scaleY *= shrink;
    }
}
TileAppearance.RESTING_Y = -0.5;
TileAppearance.RESTING_HEIGHT = 0.5;
TileAppearance.TREMBLE_START = 0.35;
TileAppearance.SHRINK_SECONDS = 1.0;
