type FrFurnitureBox = [number, number, number, number, number, number, number];

interface FrFurnitureDef {
  id: string;
  name: string;
  cost: Record<string, number>;
  solid: boolean;
  main: string;
  flat: boolean;
  boxes: FrFurnitureBox[];
}

class FrFurnitureCatalog {
  static readonly PREFIX = "furn_";
  private static readonly WOOD = 0xb8814a;
  private static readonly DARK = 0x7a4f27;
  private static readonly CLOTH = 0xe8d8b8;
  private static readonly METAL = 0x9aa0aa;
  private static readonly GLASS = 0xbfe6f4;
  private static readonly LIGHT = 0xffe29a;

  private static legs(w: number, d: number, h: number, color: number, inset = 0.12): FrFurnitureBox[] {
    const x = w / 2 - inset, z = d / 2 - inset;
    return [[-x, -z], [x, -z], [-x, z], [x, z]].map(([px, pz]) => [0.18, h, 0.18, px, h / 2, pz, color] as FrFurnitureBox);
  }

  private static def(id: string, name: string, cost: Record<string, number>, solid: boolean, main: string, boxes: FrFurnitureBox[], flat = false): FrFurnitureDef {
    return { id, name, cost, solid, main, flat, boxes };
  }

  static readonly ITEMS: ReadonlyArray<FrFurnitureDef> = FrFurnitureCatalog.build();

  private static build(): FrFurnitureDef[] {
    const W = FrFurnitureCatalog.WOOD, D = FrFurnitureCatalog.DARK, C = FrFurnitureCatalog.CLOTH, M = FrFurnitureCatalog.METAL, G = FrFurnitureCatalog.GLASS, L = FrFurnitureCatalog.LIGHT;
    const d = FrFurnitureCatalog.def, legs = FrFurnitureCatalog.legs;
    return [
      d("chair", "의자", { plank: 2 }, true, "#B8814A", [[1, 0.12, 1, 0, 0.9, 0, W], [1, 1.1, 0.12, 0, 1.45, -0.44, W], ...legs(1, 1, 0.84, D)]),
      d("stool", "둥근 의자", { plank: 1 }, true, "#C9985F", [[0.9, 0.16, 0.9, 0, 0.8, 0, W], ...legs(0.8, 0.8, 0.72, D)]),
      d("sofa", "소파", { plank: 3, cloth: 3 }, true, "#D97B4F", [[1.9, 0.6, 0.95, 0, 0.5, 0.2, 0xd97b4f], [1.9, 1, 0.3, 0, 1.0, -0.6, 0xc56a40], [0.3, 0.8, 1.2, -0.95, 0.9, 0, 0xc56a40], [0.3, 0.8, 1.2, 0.95, 0.9, 0, 0xc56a40]]),
      d("bench", "긴 의자", { plank: 3 }, true, "#B8814A", [[1.9, 0.14, 0.8, 0, 0.82, 0, W], [0.2, 0.8, 0.7, -0.8, 0.4, 0, D], [0.2, 0.8, 0.7, 0.8, 0.4, 0, D]]),
      d("table", "탁자", { plank: 3 }, true, "#C9985F", [[1.9, 0.16, 1.5, 0, 1.2, 0, 0xc9985f], ...legs(1.9, 1.5, 1.12, D)]),
      d("desk", "책상", { plank: 4, wood: 1 }, true, "#B8814A", [[1.9, 0.16, 1.1, 0, 1.2, -0.2, W], [0.6, 1.1, 1, 0.6, 0.55, -0.2, D], [0.16, 1.1, 1, -0.9, 0.55, -0.2, D], [0.5, 0.06, 0.4, -0.4, 1.31, -0.3, 0xffffff]]),
      d("bed", "침대", { plank: 3, cloth: 4 }, true, "#E8D8B8", [[1.9, 0.5, 2, 0, 0.45, 0, D], [1.7, 0.3, 1.8, 0, 0.8, 0.05, 0xe8d8b8], [1.5, 0.22, 0.5, 0, 1.05, -0.65, 0xffffff], [1.9, 1.1, 0.14, 0, 0.95, -0.93, W], [1.7, 0.12, 1.1, 0, 0.98, 0.4, 0xd97b4f]]),
      d("wardrobe", "옷장", { plank: 5, cloth: 1 }, true, "#7A4F27", [[1.7, 3.2, 0.9, 0, 1.6, 0, D], [0.05, 2.9, 0.05, 0, 1.6, 0.47, 0x2a1a0a], [0.1, 0.4, 0.1, -0.2, 1.6, 0.5, 0xd6b34a], [0.1, 0.4, 0.1, 0.2, 1.6, 0.5, 0xd6b34a]]),
      d("bookshelf", "책장", { plank: 4, wood: 2 }, true, "#B8814A", [[1.8, 3, 0.7, 0, 1.5, 0, W], [1.5, 0.5, 0.1, 0, 0.8, 0.31, 0xd97b4f], [1.5, 0.5, 0.1, 0, 1.5, 0.31, 0x6fa8f2], [1.5, 0.5, 0.1, 0, 2.2, 0.31, 0x74cf70]]),
      d("drawer", "서랍장", { plank: 4 }, true, "#C9985F", [[1.8, 1.4, 0.9, 0, 0.7, 0, 0xc9985f], [1.5, 0.1, 0.05, 0, 0.45, 0.46, D], [1.5, 0.1, 0.05, 0, 0.95, 0.46, D]]),
      d("box", "상자", { plank: 3, iron: 1 }, true, "#9A6A38", [[1.5, 0.9, 1.1, 0, 0.45, 0, 0x9a6a38], [1.55, 0.3, 1.15, 0, 1.05, 0, D], [0.2, 1.1, 1.2, 0, 0.6, 0, 0xd6b34a]]),
      d("rug_red", "빨간 양탄자", { cloth: 2, dye_0: 1 }, false, "#E8514F", [[1.9, 0.06, 1.9, 0, 0.03, 0, 0xe8514f], [1.3, 0.07, 1.3, 0, 0.04, 0, 0xf4a8a0]], true),
      d("rug_blue", "파란 양탄자", { cloth: 2, dye_2: 1 }, false, "#4F8FE8", [[1.9, 0.06, 1.9, 0, 0.03, 0, 0x4f8fe8], [1.3, 0.07, 1.3, 0, 0.04, 0, 0xa8c8f4]], true),
      d("rug_round", "둥근 양탄자", { cloth: 2 }, false, "#E8D8B8", [[1.8, 0.06, 1.8, 0, 0.03, 0, 0xe8d8b8], [1.2, 0.07, 1.2, 0, 0.04, 0, 0xd9b98a], [0.6, 0.08, 0.6, 0, 0.05, 0, 0xc98a5a]], true),
      d("lamp_floor", "서 있는 등", { wood: 1, glass: 1, coal: 1 }, true, "#FFE29A", [[0.8, 0.12, 0.8, 0, 0.06, 0, D], [0.14, 2.6, 0.14, 0, 1.3, 0, D], [0.9, 0.9, 0.9, 0, 3.0, 0, L]]),
      d("lamp_table", "작은 등", { glass: 1, coal: 1 }, true, "#FFE29A", [[0.5, 0.1, 0.5, 0, 0.05, 0, D], [0.1, 0.7, 0.1, 0, 0.45, 0, D], [0.6, 0.6, 0.6, 0, 1.1, 0, L]]),
      d("candle", "촛대", { iron: 1, coal: 1 }, true, "#FFE29A", [[0.5, 0.1, 0.5, 0, 0.05, 0, M], [0.12, 0.9, 0.12, 0, 0.55, 0, M], [0.16, 0.36, 0.16, 0, 1.2, 0, 0xfff3d0], [0.12, 0.2, 0.12, 0, 1.5, 0, 0xffa030]]),
      d("plant_pot", "화분", { stone: 1, flower_3: 1 }, true, "#C8794F", [[0.7, 0.7, 0.7, 0, 0.35, 0, 0xc8794f], [0.55, 0.5, 0.55, 0, 0.95, 0, 0x4fae4a], [0.3, 0.3, 0.3, 0, 1.35, 0, 0xf4f4f4]]),
      d("flower_vase", "꽃병", { glass: 1, flower_0: 2 }, true, "#BFE6F4", [[0.5, 0.8, 0.5, 0, 0.4, 0, G], [0.14, 0.5, 0.14, 0, 1.05, 0, 0x4fae4a], [0.4, 0.4, 0.4, 0, 1.4, 0, 0xe8514f]]),
      d("tree_pot", "큰 화분", { stone: 2, vine: 2 }, true, "#4FAE4A", [[1, 0.9, 1, 0, 0.45, 0, 0xa8643a], [0.2, 1.4, 0.2, 0, 1.6, 0, 0x6b4423], [1.4, 1.2, 1.4, 0, 2.7, 0, 0x4fae4a], [1, 0.8, 1, 0, 3.5, 0, 0x5cc058]]),
      d("clock", "시계", { plank: 2, iron: 1 }, true, "#7A4F27", [[0.9, 3, 0.7, 0, 1.5, 0, D], [0.7, 0.7, 0.1, 0, 2.5, 0.38, 0xfff7dc], [0.08, 0.3, 0.06, 0, 2.55, 0.44, 0x2a1a0a], [0.5, 0.9, 0.3, 0, 1.2, 0.2, 0xd6b34a]]),
      d("fireplace", "벽난로", { brick: 5, coal: 2 }, true, "#9AA0AA", [[1.9, 2.6, 1, 0, 1.3, -0.4, 0xb0b3ba], [1.1, 1.1, 0.5, 0, 0.7, -0.2, 0x2a2024], [0.7, 0.4, 0.3, 0, 0.45, -0.18, 0xff6a20], [1.9, 0.3, 1.2, 0, 2.7, -0.4, 0x8a8d94]]),
      d("stove", "화로", { stone: 3, coal: 1 }, true, "#6D707A", [[1.3, 0.8, 1.3, 0, 0.4, 0, 0x6d707a], [1, 0.12, 1, 0, 0.86, 0, 0xff7a20], [0.3, 1, 0.3, 0.45, 1.3, -0.45, 0x4a4c54]]),
      d("piano", "피아노", { plank: 6, iron: 2 }, true, "#2A2A30", [[1.9, 1.6, 0.9, 0, 0.8, -0.3, 0x2a2a30], [1.7, 0.12, 0.6, 0, 1.2, 0.35, 0xf4f4f4], [1.9, 0.14, 0.4, 0, 1.68, 0, 0x1a1a20], [0.9, 0.9, 0.3, 0, 0.7, 0.5, 0x2a2a30]]),
      d("tv", "텔레비전", { plank: 2, glass: 2, iron: 1 }, true, "#3A3D44", [[1.8, 1.2, 0.2, 0, 1.5, 0, 0x3a3d44], [1.6, 1, 0.1, 0, 1.5, 0.12, 0x6fb8e8], [0.8, 0.9, 0.5, 0, 0.45, 0, W]]),
      d("fish_tank", "어항", { glass: 4, sand: 3 }, true, "#BFE6F4", [[1.7, 0.4, 1.1, 0, 0.2, 0, W], [1.6, 1, 1, 0, 0.9, 0, 0x8fd0f0], [0.3, 0.2, 0.15, -0.3, 0.9, 0, 0xf29a2e], [0.3, 0.2, 0.15, 0.3, 1.1, 0, 0xe8514f]]),
      d("painting", "그림 액자", { plank: 1, dye_0: 1, dye_2: 1 }, false, "#4F8FE8", [[0.1, 1.2, 1.5, 0.85, 2.4, 0, W], [0.06, 1, 1.3, 0.8, 2.4, 0, 0x6fa8f2], [0.07, 0.5, 0.6, 0.78, 2.3, -0.2, 0xf8d860], [0.07, 0.4, 0.5, 0.78, 2.6, 0.3, 0xe8514f]]),
      d("mirror", "거울", { glass: 2, plank: 1 }, true, "#BFE6F4", [[1, 2.2, 0.16, 0, 1.4, 0, W], [0.8, 1.9, 0.1, 0, 1.4, 0.08, 0xcfeaf6], [1, 0.4, 0.5, 0, 0.2, 0, D]]),
      d("curtain", "커튼", { cloth: 3, rope: 1 }, false, "#E8514F", [[1.9, 0.12, 0.12, 0, 3.1, 0.8, D], [0.7, 2.8, 0.1, -0.6, 1.6, 0.8, 0xe8514f], [0.7, 2.8, 0.1, 0.6, 1.6, 0.8, 0xe8514f]]),
      d("statue", "조각상", { stone: 4, brick: 2 }, true, "#B9BCC2", [[1.2, 0.5, 1.2, 0, 0.25, 0, 0x8a8d94], [0.7, 1.2, 0.5, 0, 1.1, 0, 0xb9bcc2], [0.5, 0.5, 0.5, 0, 2.0, 0, 0xc8cbd2], [0.3, 0.8, 0.3, -0.5, 1.2, 0, 0xb9bcc2], [0.3, 0.8, 0.3, 0.5, 1.2, 0, 0xb9bcc2]]),
    ];
  }

  static idOf(item: string): string { return FrFurnitureCatalog.PREFIX + item; }
  static isFurniture(id: string): boolean { return id.indexOf(FrFurnitureCatalog.PREFIX) === 0; }
  static find(id: string): FrFurnitureDef | undefined { return FrFurnitureCatalog.ITEMS.find((f) => FrFurnitureCatalog.idOf(f.id) === id); }
  static solid(id: string): boolean { const f = FrFurnitureCatalog.find(id); return !!f && f.solid; }
}
