class Palette {
  static readonly SLOT_COLORS: readonly string[] = ["#E5484D", "#3E8EF0", "#3FB56B", "#F0C22E", "#B060E0", "#F08AB0"];
  static readonly FLOOR_COLORS: readonly string[] = ["#A0673E", "#D9A45E", "#F2DDA4"];
  static readonly WARN_COLOR = "#E24A3A";
  static readonly SKY = "#161A2C";
  static readonly CLOUD = 0xC9D2EC;
  static readonly RIM = 0x5A4A62;
  static readonly ISLAND = 0x4A4256;
  static readonly SKY_LIGHT = 0xDCE6FF;
  static readonly GROUND_LIGHT = 0x40324A;
  static readonly SUN_LIGHT = 0xFFF0D2;
  static readonly LABEL_BACKGROUND = "rgba(12,16,26,.78)";
  static readonly SHADOW = "rgba(0,0,0,.55)";

  static slotColor(slot: number): string {
    return Palette.SLOT_COLORS[slot % Palette.SLOT_COLORS.length];
  }

  static floorColorIndex(floor: number): number {
    if (LastTileRules.FLOOR_COUNT <= 1) return 2;
    return Math.round(floor / (LastTileRules.FLOOR_COUNT - 1) * 2);
  }
}

interface DecorProp {
  readonly model: string;
  readonly height: number;
}

class SceneryKit {
  static readonly DIRECTORY = "assets/kaykit/medieval/";
  static readonly TILE_MODEL = "tiles/square_sand.glb";
  static readonly DECOR_PROPS: readonly DecorProp[] = [
    { model: "detail_treeA", height: 4.2 }, { model: "detail_treeB", height: 4.6 }, { model: "detail_treeC", height: 3.8 },
    { model: "detail_rocks", height: 1.6 }, { model: "detail_rocks_small", height: 1.1 }, { model: "detail_hill", height: 2.4 }, { model: "detail_forestA", height: 3.4 }
  ];

  private tile: TileGeometry | null = null;
  private readonly props = new Map<string, Three<"Object3D">>();

  constructor(private readonly libs: ThreeLibs) {}

  async load(): Promise<void> {
    const loader = new this.libs.GLTFLoader();
    const THREE = this.libs.THREE;
    const tileJob = loader.loadAsync(SceneryKit.DIRECTORY + SceneryKit.TILE_MODEL).then((gltf) => {
      const mesh = gltf.scene.getObjectByProperty("isMesh", true) as Three<"Mesh">;
      this.tile = mesh.geometry;
    });
    const propJobs = SceneryKit.DECOR_PROPS.map((prop) =>
      loader.loadAsync(SceneryKit.DIRECTORY + "objects/" + prop.model + ".glb").then((gltf) => {
        gltf.scene.traverse((node) => {
          const mesh = node as Three<"Mesh">;
          if (!mesh.isMesh) return;
          const source = mesh.material as Three<"MeshStandardMaterial">;
          mesh.material = new THREE.MeshLambertMaterial({ map: source.map, color: source.color });
        });
        this.props.set(prop.model, gltf.scene);
      }).catch(() => undefined)
    );
    await Promise.all([tileJob, ...propJobs]);
  }

  tileGeometry(): TileGeometry {
    if (!this.tile) throw new Error("발판 모델을 아직 불러오지 못했어요.");
    return this.tile;
  }

  propTemplate(model: string): Three<"Object3D"> | null {
    return this.props.get(model) || null;
  }
}

interface TileLook {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  warning: number;
  shaded: boolean;
}

class TileAppearance {
  private static readonly RESTING_Y = -0.5;
  private static readonly RESTING_HEIGHT = 0.5;
  private static readonly TREMBLE_START = 0.35;
  private static readonly SHRINK_SECONDS = 1.0;

  private readonly look: TileLook = { x: 0, y: 0, z: 0, scaleX: 0, scaleY: 0, scaleZ: 0, warning: 0, shaded: false };

  of(board: TileBoard, floor: number, index: number, t: number): TileLook {
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
    if (trigger === Infinity || t < trigger) return look;
    if (t < collapse) this.tremble(look, index, t, trigger, collapse);
    else this.fall(look, t, collapse);
    return look;
  }

  private tremble(look: TileLook, index: number, t: number, trigger: number, collapse: number): void {
    const progress = (t - trigger) / Math.max(1, collapse - trigger);
    look.warning = TileAppearance.TREMBLE_START + progress * (1 - TileAppearance.TREMBLE_START);
    look.x += Math.sin(t * 0.06 + index * 1.7) * 0.06 * progress;
    look.z += Math.cos(t * 0.07 + index) * 0.06 * progress;
    look.y -= 0.05 * progress;
  }

  private fall(look: TileLook, t: number, collapse: number): void {
    const seconds = (t - collapse) / 1000;
    look.warning = 1;
    look.y -= 0.5 * LastTileRules.GRAVITY * seconds * seconds * 0.6;
    const shrink = MathUtil.clamp(1 - seconds / TileAppearance.SHRINK_SECONDS, 0, 1);
    look.scaleX *= shrink;
    look.scaleZ *= shrink;
    look.scaleY *= shrink;
  }
}
