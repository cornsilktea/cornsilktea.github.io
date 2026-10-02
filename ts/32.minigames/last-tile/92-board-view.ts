class BoardView {
  private static readonly CLOUD_COUNT = 9;
  private static readonly ISLAND_COUNT = 12;
  private static readonly RIM_THICKNESS = 0.5;
  private static readonly RIM_HEIGHT = 0.8;

  private readonly floors: Three<"Group">[] = [];
  private readonly tileMeshes: Three<"InstancedMesh">[] = [];
  private readonly baseColors: Three<"Color">[];
  private readonly warnColor: Three<"Color">;
  private readonly matrix: Three<"Matrix4">;
  private readonly quaternion: Three<"Quaternion">;
  private readonly scale: Three<"Vector3">;
  private readonly position: Three<"Vector3">;
  private readonly color: Three<"Color">;
  private readonly appearance = new TileAppearance();
  private readonly rimMaterial: Three<"MeshLambertMaterial">;
  private readonly islandMaterial: Three<"MeshLambertMaterial">;
  private built = false;

  constructor(private readonly libs: ThreeLibs, private readonly scene: Three<"Scene">, private readonly kit: SceneryKit) {
    const THREE = libs.THREE;
    this.baseColors = Palette.FLOOR_COLORS.map((hex) => new THREE.Color(hex));
    this.warnColor = new THREE.Color(Palette.WARN_COLOR);
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.color = new THREE.Color();
    this.rimMaterial = new THREE.MeshLambertMaterial({ color: Palette.RIM });
    this.islandMaterial = new THREE.MeshLambertMaterial({ color: Palette.ISLAND });
  }

  isBuilt(): boolean {
    return this.built;
  }

  build(): void {
    const THREE = this.libs.THREE;
    for (let floor = 0; floor < LastTileRules.FLOOR_COUNT; floor++) {
      const group = new THREE.Group();
      group.position.y = LastTileGeometry.floorY(floor);
      const mesh = new THREE.InstancedMesh(this.kit.tileGeometry(), new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), LastTileGeometry.tileCount());
      mesh.frustumCulled = false;
      group.add(mesh);
      this.tileMeshes[floor] = mesh;
      if (floor === 0) this.addClouds(group, floor);
      this.addIslands(group, floor);
      this.addRim(group);
      group.visible = false;
      this.scene.add(group);
      this.floors[floor] = group;
    }
    this.built = true;
  }

  showUpTo(floor: number): void {
    this.floors.forEach((group, index) => { group.visible = index <= floor; });
  }

  render(board: TileBoard, t: number, topFloor: number): void {
    for (let floor = 0; floor <= topFloor; floor++) this.renderFloor(board, floor, t);
  }

  private renderFloor(board: TileBoard, floor: number, t: number): void {
    const mesh = this.tileMeshes[floor];
    if (!mesh) return;
    const base = this.baseColors[Palette.floorColorIndex(floor)];
    for (let index = 0; index < LastTileGeometry.tileCount(); index++) {
      const look = this.appearance.of(board, floor, index, t);
      this.position.set(look.x, look.y, look.z);
      this.scale.set(look.scaleX, look.scaleY, look.scaleZ);
      this.quaternion.identity();
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(index, this.matrix);
      this.color.copy(base);
      if (look.shaded) this.color.multiplyScalar(0.9);
      if (look.warning > 0) this.color.lerp(this.warnColor, look.warning);
      mesh.setColorAt(index, this.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private addClouds(group: Three<"Group">, floor: number): void {
    const THREE = this.libs.THREE;
    const random = new SeededRandom(900 + floor);
    const material = new THREE.MeshBasicMaterial({ color: Palette.CLOUD, transparent: true, opacity: 0.22, depthWrite: false, fog: false });
    for (let count = 0; count < BoardView.CLOUD_COUNT; count++) {
      const width = 14 + random.next() * 22, depth = 8 + random.next() * 12;
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
      cloud.rotation.x = -Math.PI / 2;
      const angle = random.next() * Math.PI * 2, radius = 10 + random.next() * 22;
      cloud.position.set(Math.cos(angle) * radius, -2.4 - random.next() * 2.4, Math.sin(angle) * radius);
      group.add(cloud);
    }
  }

  private addRim(group: Three<"Group">): void {
    const THREE = this.libs.THREE;
    const length = LastTileRules.HALF * 2 + 1, thickness = BoardView.RIM_THICKNESS, height = BoardView.RIM_HEIGHT;
    const offset = LastTileRules.HALF + thickness / 2;
    const sides: Array<[number, number, number, number]> = [[0, -offset, length, thickness], [0, offset, length, thickness], [-offset, 0, thickness, length], [offset, 0, thickness, length]];
    sides.forEach(([x, z, width, depth]) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.rimMaterial);
      wall.position.set(x, height / 2 - 0.4, z);
      group.add(wall);
    });
  }

  private addIslands(group: Three<"Group">, floor: number): void {
    const THREE = this.libs.THREE;
    const random = new SeededRandom(300 + floor * 17);
    for (let count = 0; count < BoardView.ISLAND_COUNT; count++) {
      const angle = (count + random.next() * 0.6) / BoardView.ISLAND_COUNT * Math.PI * 2, radius = 12.5 + random.next() * 5;
      const size = 2.4 + random.next() * 2.4;
      const island = new THREE.Mesh(this.kit.tileGeometry(), this.islandMaterial);
      island.scale.set(size / 2, 0.9 + random.next() * 1.2, size / 2);
      let x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      const clearance = LastTileRules.HALF + 0.5 + size * 0.75 + 0.5;
      const edgeDistance = Math.max(Math.abs(x), Math.abs(z));
      if (edgeDistance < clearance) {
        x *= clearance / edgeDistance;
        z *= clearance / edgeDistance;
      }
      island.position.set(x, -island.scale.y - 0.2, z);
      island.scale.y = Math.min(island.scale.y, 1.6);
      island.rotation.y = random.next() * Math.PI;
      group.add(island);
      this.addDecoration(group, random, x, z);
    }
  }

  private addDecoration(group: Three<"Group">, random: SeededRandom, x: number, z: number): void {
    const pick = SceneryKit.DECOR_PROPS[Math.floor(random.next() * SceneryKit.DECOR_PROPS.length)];
    const template = this.kit.propTemplate(pick.model);
    if (!template) return;
    const prop = this.fitToHeight(template, pick.height * (0.8 + random.next() * 0.5));
    prop.position.set(x, -0.2, z);
    prop.rotation.y = random.next() * Math.PI * 2;
    group.add(prop);
  }

  private fitToHeight(template: Three<"Object3D">, height: number): Three<"Group"> {
    const THREE = this.libs.THREE;
    const box = new THREE.Box3().setFromObject(template);
    const size = box.getSize(new THREE.Vector3());
    const clone = template.clone(true);
    const scale = height / Math.max(0.001, size.y);
    clone.scale.setScalar(scale);
    clone.position.y = -box.min.y * scale;
    const holder = new THREE.Group();
    holder.add(clone);
    return holder;
  }
}
