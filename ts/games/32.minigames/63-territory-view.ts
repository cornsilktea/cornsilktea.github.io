class TerritoryLook {
  static readonly EMPTY_LIGHT = "#3A4565";
  static readonly EMPTY_DARK = "#323C5A";
  static readonly TAIL_MIX = 0.5;
  static readonly OWNED_MIX = 0.12;
  static readonly BASE_PLATE = 0x1B2036;
  static readonly BORDER = 0xD97B4F;
  static readonly TILE_SIZE = 0.92;
  static readonly TILE_HEIGHT = 0.4;
  static readonly CAMERA_TILT = 0.34;
  static readonly CAMERA_FIT = 0.98;
  static readonly CAMERA_FOLLOW = 0.3;
  static readonly CAMERA_SMOOTHING = 3.2;
  static readonly OTHER_SCALE = 1.25;
  static readonly MINE_SCALE = 1.8;
  static readonly LABEL_WIDTH = 3.2;
  static readonly LABEL_HEIGHT = 0.8;
  static readonly MOTION_SMOOTHING = 20;
  static readonly SNAP_DISTANCE = 3;
  static readonly APPEAR_MS = 320;
  static readonly BURST_MS = 600;

  static worldX(cellX: number): number {
    return cellX + 0.5 - TerritoryRules.SIZE / 2;
  }

  static worldZ(cellY: number): number {
    return cellY + 0.5 - TerritoryRules.SIZE / 2;
  }
}

type TerritoryRgb = [number, number, number];

class TerritoryColors {
  private readonly table = new Float32Array(TerritoryCellCode.LIMIT * 3);
  private readonly emptyLight: TerritoryRgb;
  private readonly emptyDark: TerritoryRgb;

  constructor(libs: ThreeLibs, participants: readonly MatchParticipant[]) {
    const THREE = libs.THREE;
    const white = new THREE.Color("#FFFFFF");
    const toRgb = (color: Three<"Color">): TerritoryRgb => [color.r, color.g, color.b];
    this.emptyLight = toRgb(new THREE.Color(TerritoryLook.EMPTY_LIGHT));
    this.emptyDark = toRgb(new THREE.Color(TerritoryLook.EMPTY_DARK));
    for (let code = 0; code < TerritoryCellCode.LIMIT; code++) {
      const owner = TerritoryCellCode.ownerOf(code), tail = TerritoryCellCode.tailOf(code);
      if (tail >= 0 && tail < participants.length) this.store(code, toRgb(new THREE.Color(Palette.slotColor(participants[tail].slot)).lerp(white, TerritoryLook.TAIL_MIX)));
      else if (owner >= 0 && owner < participants.length) this.store(code, toRgb(new THREE.Color(Palette.slotColor(participants[owner].slot)).lerp(white, TerritoryLook.OWNED_MIX)));
    }
  }

  rgbOf(code: number, cell: number, out: TerritoryRgb): TerritoryRgb {
    if (code === TerritoryCellCode.EMPTY) {
      const checker = (cell + Math.floor(cell / TerritoryRules.SIZE)) % 2 === 0 ? this.emptyLight : this.emptyDark;
      out[0] = checker[0];
      out[1] = checker[1];
      out[2] = checker[2];
    } else {
      out[0] = this.table[code * 3];
      out[1] = this.table[code * 3 + 1];
      out[2] = this.table[code * 3 + 2];
    }
    return out;
  }

  private store(code: number, rgb: TerritoryRgb): void {
    this.table[code * 3] = rgb[0];
    this.table[code * 3 + 1] = rgb[1];
    this.table[code * 3 + 2] = rgb[2];
  }
}

abstract class TerritoryTileEffect {
  abstract readonly durationMs: number;

  abstract mix(progress: number): { fromWeight: number; whiteWeight: number };
  abstract lift(progress: number): number;

  shade(progress: number, from: TerritoryRgb, to: TerritoryRgb, out: TerritoryRgb): void {
    const weights = this.mix(progress);
    const toWeight = 1 - weights.fromWeight - weights.whiteWeight;
    for (let channel = 0; channel < 3; channel++) out[channel] = from[channel] * weights.fromWeight + weights.whiteWeight + to[channel] * toWeight;
  }
}

class TerritoryFillEffect extends TerritoryTileEffect {
  readonly durationMs = 380;

  mix(progress: number): { fromWeight: number; whiteWeight: number } {
    const eased = 1 - Math.pow(1 - progress, 2);
    return { fromWeight: 1 - eased, whiteWeight: 0 };
  }

  lift(progress: number): number {
    return 1 + 0.55 * Math.sin(Math.PI * progress);
  }
}

class TerritoryStealEffect extends TerritoryTileEffect {
  private static readonly FLASH_END = 0.3;
  readonly durationMs = 460;

  mix(progress: number): { fromWeight: number; whiteWeight: number } {
    const flashEnd = TerritoryStealEffect.FLASH_END;
    if (progress < flashEnd) {
      const flash = progress / flashEnd;
      return { fromWeight: 1 - flash, whiteWeight: flash };
    }
    return { fromWeight: 0, whiteWeight: 1 - (progress - flashEnd) / (1 - flashEnd) };
  }

  lift(progress: number): number {
    return 1 + 1.1 * Math.sin(Math.PI * Math.min(1, progress * 1.4));
  }
}

class TerritoryTileAnimation {
  constructor(readonly startAt: number, readonly effect: TerritoryTileEffect, readonly from: TerritoryRgb, public to: TerritoryRgb) {}
}

class TerritoryRipple {
  private static readonly STEP_MS = 32;
  private static readonly MAX_MS = 700;

  static delays(changes: readonly TerritoryCellChange[]): Map<number, number> {
    const delays = new Map<number, number>();
    const byCell = new Map<number, TerritoryCellChange>();
    changes.forEach((change) => {
      if (TerritoryCellCode.ownerOf(change.after) !== TerritoryCellCode.ownerOf(change.before)) byCell.set(change.index, change);
    });
    const queue: number[] = [];
    byCell.forEach((change, index) => {
      if (TerritoryCellCode.tailOf(change.before) === TerritoryCellCode.ownerOf(change.after)) {
        delays.set(index, 0);
        queue.push(index);
      }
    });
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      const owner = TerritoryCellCode.ownerOf((byCell.get(index) as TerritoryCellChange).after);
      const x = index % TerritoryRules.SIZE, y = Math.floor(index / TerritoryRules.SIZE);
      TerritoryDirections.ALL.forEach((direction) => {
        const nx = x + TerritoryDirections.DX[direction], ny = y + TerritoryDirections.DY[direction];
        if (nx < 0 || ny < 0 || nx >= TerritoryRules.SIZE || ny >= TerritoryRules.SIZE) return;
        const next = ny * TerritoryRules.SIZE + nx;
        const neighbor = byCell.get(next);
        if (!neighbor || delays.has(next) || TerritoryCellCode.ownerOf(neighbor.after) !== owner) return;
        delays.set(next, Math.min(TerritoryRipple.MAX_MS, (delays.get(index) as number) + TerritoryRipple.STEP_MS));
        queue.push(next);
      });
    }
    return delays;
  }
}

class TerritoryTiles {
  private readonly mesh: Three<"InstancedMesh">;
  private readonly colorAttribute: Three<"InstancedBufferAttribute">;
  private readonly shown = new Float32Array(TerritoryRules.CELL_COUNT * 3);
  private readonly animations = new Map<number, TerritoryTileAnimation>();
  private readonly marker: Three<"Object3D">;
  private readonly scratch: TerritoryRgb = [0, 0, 0];
  private readonly fill = new TerritoryFillEffect();
  private readonly steal = new TerritoryStealEffect();

  constructor(libs: ThreeLibs, private readonly world: Three<"Group">, private readonly colors: TerritoryColors) {
    const THREE = libs.THREE;
    const geometry = new THREE.BoxGeometry(TerritoryLook.TILE_SIZE, TerritoryLook.TILE_HEIGHT, TerritoryLook.TILE_SIZE);
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), TerritoryRules.CELL_COUNT);
    this.colorAttribute = new THREE.InstancedBufferAttribute(this.shown, 3);
    this.mesh.instanceColor = this.colorAttribute;
    this.mesh.frustumCulled = false;
    this.marker = new THREE.Object3D();
    for (let cell = 0; cell < TerritoryRules.CELL_COUNT; cell++) this.placeTile(cell, 1);
    world.add(this.mesh);
  }

  showAll(grid: TerritoryGrid): void {
    this.animations.clear();
    for (let cell = 0; cell < TerritoryRules.CELL_COUNT; cell++) {
      this.storeColor(cell, this.colors.rgbOf(grid.code(cell), cell, this.scratch));
      this.placeTile(cell, 1);
    }
    this.markDirty();
  }

  paint(changes: readonly TerritoryCellChange[], now: number): void {
    if (!changes.length) return;
    const delays = TerritoryRipple.delays(changes);
    changes.forEach((change) => this.paintCell(change, now, delays.get(change.index) || 0));
    this.markDirty();
  }

  update(now: number): void {
    if (!this.animations.size) return;
    this.animations.forEach((animation, cell) => {
      const progress = (now - animation.startAt) / animation.effect.durationMs;
      if (progress < 0) return;
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

  dispose(): void {
    this.world.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as Three<"MeshLambertMaterial">).dispose();
    this.mesh.dispose();
  }

  private paintCell(change: TerritoryCellChange, now: number, delay: number): void {
    const cell = change.index;
    const to = this.colors.rgbOf(change.after, cell, [0, 0, 0]);
    const beforeOwner = TerritoryCellCode.ownerOf(change.before), afterOwner = TerritoryCellCode.ownerOf(change.after);
    const existing = this.animations.get(cell);
    if (beforeOwner === afterOwner || afterOwner < 0) {
      if (existing) existing.to = to;
      else this.storeColor(cell, to);
      return;
    }
    const from: TerritoryRgb = existing ? [this.shown[cell * 3], this.shown[cell * 3 + 1], this.shown[cell * 3 + 2]] : this.colors.rgbOf(change.before, cell, [0, 0, 0]);
    const effect = beforeOwner >= 0 ? this.steal : this.fill;
    this.animations.set(cell, new TerritoryTileAnimation(now + delay, effect, from, to));
  }

  private storeColor(cell: number, rgb: TerritoryRgb): void {
    this.shown[cell * 3] = rgb[0];
    this.shown[cell * 3 + 1] = rgb[1];
    this.shown[cell * 3 + 2] = rgb[2];
  }

  private placeTile(cell: number, lift: number): void {
    const x = cell % TerritoryRules.SIZE, y = Math.floor(cell / TerritoryRules.SIZE);
    this.marker.position.set(TerritoryLook.worldX(x), TerritoryLook.TILE_HEIGHT * lift / 2, TerritoryLook.worldZ(y));
    this.marker.scale.set(1, lift, 1);
    this.marker.updateMatrix();
    this.mesh.setMatrixAt(cell, this.marker.matrix);
  }

  private markDirty(): void {
    this.colorAttribute.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

class TerritoryScene {
  readonly scene: Three<"Scene">;
  readonly camera: Three<"PerspectiveCamera">;
  readonly world: Three<"Group">;

  constructor(libs: ThreeLibs) {
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

  releaseMaterials(): void {
    this.scene.traverse((object) => {
      const mesh = object as { material?: Three<"Material"> | Three<"Material">[]; geometry?: Three<"BufferGeometry"> };
      if (Array.isArray(mesh.material)) mesh.material.forEach((entry) => entry.dispose());
      else if (mesh.material) mesh.material.dispose();
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}

class TerritoryCamera {
  private static readonly OVERHEAD_FIT = 1.08;
  private static readonly SPIN_SPEED = 0.25;
  private static readonly SHOWCASE_FIT = 1.22;
  private static readonly SHOWCASE_SHIFT = -7;
  private static readonly SHOWCASE_TILT = 0.5;

  private readonly focus = { x: 0, z: 0 };
  private spin = 0;

  constructor(private readonly camera: Three<"PerspectiveCamera">, private readonly env: BrowserEnv) {}

  follow(dt: number, target: { x: number; z: number } | null): void {
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

  overhead(): void {
    const distance = this.fitDistance() * TerritoryCamera.OVERHEAD_FIT;
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, distance, 0);
    this.camera.lookAt(0, 0, 0);
  }

  showcase(dt: number): void {
    this.spin += dt * TerritoryCamera.SPIN_SPEED;
    const distance = this.fitDistance() * TerritoryCamera.SHOWCASE_FIT;
    const tilt = TerritoryCamera.SHOWCASE_TILT;
    const shift = TerritoryCamera.SHOWCASE_SHIFT + Math.sin(this.spin) * distance * 0.06;
    this.camera.position.set(shift, Math.cos(tilt) * distance, Math.sin(tilt) * distance);
    this.camera.lookAt(shift, 0, 0);
  }

  private fitDistance(): number {
    const size = this.env.viewport();
    const aspect = size.width / size.height;
    const reach = Math.tan(this.camera.fov * Math.PI / 360);
    const half = TerritoryRules.SIZE / 2;
    return Math.max(half / reach, half / (reach * aspect));
  }
}

class TerritoryMotion {
  private x: number;
  private z: number;
  private wasAlive = true;

  constructor(player: TerritoryPlayer) {
    this.x = TerritoryLook.worldX(player.x);
    this.z = TerritoryLook.worldZ(player.y);
  }

  get worldX(): number { return this.x; }
  get worldZ(): number { return this.z; }

  advance(player: TerritoryPlayer, progress: number, dt: number): boolean {
    const goalX = TerritoryLook.worldX(player.x) + TerritoryDirections.DX[player.dir] * progress;
    const goalZ = TerritoryLook.worldZ(player.y) + TerritoryDirections.DY[player.dir] * progress;
    const revived = player.alive && !this.wasAlive;
    this.wasAlive = player.alive;
    if (revived || MathUtil.distance(goalX, goalZ, this.x, this.z) > TerritoryLook.SNAP_DISTANCE) {
      this.x = goalX;
      this.z = goalZ;
    } else {
      const ratio = Math.min(1, dt * TerritoryLook.MOTION_SMOOTHING);
      this.x += (goalX - this.x) * ratio;
      this.z += (goalZ - this.z) * ratio;
    }
    return revived;
  }
}

class TerritoryBurst {
  private readonly ring: Three<"Mesh">;

  constructor(libs: ThreeLibs, private readonly world: Three<"Group">, x: number, z: number, color: string, private readonly startedAt: number) {
    const THREE = libs.THREE;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(x, 0.6, z);
    world.add(this.ring);
  }

  update(now: number): boolean {
    const progress = (now - this.startedAt) / TerritoryLook.BURST_MS;
    if (progress >= 1) {
      this.dispose();
      return false;
    }
    this.ring.scale.setScalar(0.6 + progress * 3.4);
    (this.ring.material as Three<"MeshBasicMaterial">).opacity = 0.9 * (1 - progress);
    return true;
  }

  dispose(): void {
    this.world.remove(this.ring);
    this.ring.geometry.dispose();
    (this.ring.material as Three<"MeshBasicMaterial">).dispose();
  }
}

class TerritoryBursts {
  private bursts: TerritoryBurst[] = [];

  constructor(private readonly libs: ThreeLibs, private readonly world: Three<"Group">) {}

  add(x: number, z: number, color: string, now: number): void {
    this.bursts.push(new TerritoryBurst(this.libs, this.world, x, z, color, now));
  }

  update(now: number): void {
    this.bursts = this.bursts.filter((burst) => burst.update(now));
  }

  clear(): void {
    this.bursts.forEach((burst) => burst.dispose());
    this.bursts = [];
  }
}

class TerritoryRunnerView {
  private readonly group: Three<"Group">;
  private readonly inner: Three<"Group">;
  private readonly blob: Three<"Mesh">;
  private readonly label: Three<"Sprite">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly motion: TerritoryMotion;
  private readonly baseScale: number;
  private readonly color: string;
  private shownYaw: number;
  private appearedAt = -Infinity;
  private wasAlive = true;

  constructor(
    private readonly kit: FighterViewKit,
    private readonly factory: CharacterModelFactory,
    clips: Map<string, Three<"AnimationClip">>,
    private readonly world: Three<"Group">,
    private readonly bursts: TerritoryBursts,
    private readonly participant: MatchParticipant,
    player: TerritoryPlayer,
    look: CharacterLook,
    mine: boolean
  ) {
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

  update(player: TerritoryPlayer, progress: number, now: number, dt: number): void {
    const revived = this.motion.advance(player, progress, dt);
    if (this.wasAlive && !player.alive) this.bursts.add(this.motion.worldX, this.motion.worldZ, this.color, now);
    this.wasAlive = player.alive;
    if (revived) this.appearedAt = now;
    this.group.visible = player.alive;
    this.blob.visible = player.alive;
    this.label.visible = player.alive;
    if (!player.alive) return;
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

  dispose(): void {
    this.world.remove(this.group);
    this.world.remove(this.blob);
    this.world.remove(this.label);
    this.factory.disposeModel(this.model);
    const labelMaterial = this.label.material;
    if (labelMaterial.map) labelMaterial.map.dispose();
    labelMaterial.dispose();
  }

  focus(): { x: number; z: number } {
    return { x: this.motion.worldX, z: this.motion.worldZ };
  }
}

class TerritoryRunnerViews {
  private readonly views = new Map<string, TerritoryRunnerView>();

  constructor(
    private readonly kit: FighterViewKit,
    private readonly factory: CharacterModelFactory,
    private readonly assets: CharacterAssets,
    private readonly world: Three<"Group">,
    private readonly bursts: TerritoryBursts
  ) {}

  build(board: TerritoryBoard, participants: readonly MatchParticipant[], looks: ReadonlyMap<string, CharacterLook>, localId: string): void {
    this.clear();
    board.players.forEach((player) => {
      const participant = participants[player.index];
      const look = looks.get(player.id) || CharacterLooks.createDefault();
      this.views.set(player.id, new TerritoryRunnerView(this.kit, this.factory, this.assets.clips, this.world, this.bursts, participant, player, look, player.id === localId));
    });
  }

  update(board: TerritoryBoard, progress: number, now: number, dt: number): void {
    board.players.forEach((player) => {
      const view = this.views.get(player.id);
      if (view) view.update(player, progress, now, dt);
    });
  }

  focusOf(id: string): { x: number; z: number } | null {
    const view = this.views.get(id);
    return view ? view.focus() : null;
  }

  clear(): void {
    this.views.forEach((view) => view.dispose());
    this.views.clear();
  }
}
