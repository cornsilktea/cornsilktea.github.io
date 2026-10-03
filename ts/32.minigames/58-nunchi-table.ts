interface NunchiSeatSpot {
  readonly x: number;
  readonly z: number;
  readonly cardX: number;
  readonly cardZ: number;
  readonly chipX: number;
  readonly chipZ: number;
  readonly columnX: number;
  readonly columnZ: number;
  readonly characterYaw: number;
  readonly cardYaw: number;
}

class NunchiLayout {
  static readonly TABLE_RADIUS = 4.6;
  static readonly APOTHEM = NunchiLayout.TABLE_RADIUS * Math.cos(Math.PI / 6);
  static readonly SURFACE_Y = 0.88;
  static readonly CARD_Y = NunchiLayout.SURFACE_Y + 0.02;
  static readonly SEAT_DISTANCE = NunchiLayout.APOTHEM + 1.05;
  static readonly CARD_DISTANCE = NunchiLayout.APOTHEM - 1.2;
  static readonly CHIP_DISTANCE = NunchiLayout.APOTHEM - 0.8;
  static readonly CHIP_SIDE = 1.65;
  static readonly CHIP_COLUMN_GAP = 0.45;
  static readonly POT_X = 1.7;
  static readonly POT_Z = 0.2;

  static relative(slot: number, mySlot: number): number {
    const seats = NunchiRules.SEAT_COUNT;
    return (((slot - mySlot) % seats) + seats) % seats;
  }

  static seat(relative: number): NunchiSeatSpot {
    const angle = relative * Math.PI * 2 / NunchiRules.SEAT_COUNT;
    const outX = -Math.sin(angle), outZ = Math.cos(angle);
    const sideX = Math.cos(angle), sideZ = Math.sin(angle);
    return {
      x: outX * NunchiLayout.SEAT_DISTANCE,
      z: outZ * NunchiLayout.SEAT_DISTANCE,
      cardX: outX * NunchiLayout.CARD_DISTANCE,
      cardZ: outZ * NunchiLayout.CARD_DISTANCE,
      chipX: outX * NunchiLayout.CHIP_DISTANCE + sideX * NunchiLayout.CHIP_SIDE,
      chipZ: outZ * NunchiLayout.CHIP_DISTANCE + sideZ * NunchiLayout.CHIP_SIDE,
      columnX: -sideX * NunchiLayout.CHIP_COLUMN_GAP,
      columnZ: -sideZ * NunchiLayout.CHIP_COLUMN_GAP,
      characterYaw: Math.PI - angle,
      cardYaw: -angle
    };
  }
}

abstract class NunchiViewStyle {
  abstract readonly cardScale: number;
  abstract cardYaw(spot: NunchiSeatSpot): number;
  abstract place(camera: NunchiCamera): void;
}

class NunchiSeatedViewStyle extends NunchiViewStyle {
  readonly cardScale = 1;

  cardYaw(spot: NunchiSeatSpot): number {
    return spot.cardYaw;
  }

  place(camera: NunchiCamera): void {
    camera.placeSeated();
  }
}

class NunchiOverheadViewStyle extends NunchiViewStyle {
  readonly cardScale = 1.5;

  cardYaw(): number {
    return 0;
  }

  place(camera: NunchiCamera): void {
    camera.placeOverhead();
  }
}

class NunchiShowTimeline {
  static readonly FLIP_MS = 600;
  static readonly CLASH_AT = 700;
  static readonly GLOW_AT = 700;
  static readonly BURN_AT = 1300;
  static readonly BURN_MS = 500;
  static readonly SLIDE_AT = 1500;
  static readonly SLIDE_MS = 800;
  static readonly AWARD_AT = NunchiShowTimeline.SLIDE_AT + NunchiShowTimeline.SLIDE_MS;

  static progress(elapsedMs: number, startMs: number, lengthMs: number): number {
    return MathUtil.clamp((elapsedMs - startMs) / lengthMs, 0, 1);
  }

  static ease(value: number): number {
    return value * value * (3 - 2 * value);
  }
}

class NunchiCardKit {
  static readonly WIDTH = 0.82;
  static readonly HEIGHT = 1.16;
  private static readonly PIXEL_WIDTH = 128;
  private static readonly PIXEL_HEIGHT = 180;
  private static readonly NUMBER_COLORS: readonly string[] = ["#E5484D", "#F08A24", "#C99A00", "#2FA561", "#3E8EF0", "#8A55D6"];
  private static readonly FONT = '800 {size}px "Nanum Gothic", "Malgun Gothic", sans-serif';

  readonly geometry: Three<"PlaneGeometry">;
  readonly backTexture: Three<"CanvasTexture">;
  readonly backMaterial: Three<"MeshBasicMaterial">;
  private readonly playTextures = new Map<number, Three<"CanvasTexture">>();
  private readonly prizeTextures = new Map<string, Three<"CanvasTexture">>();

  constructor(readonly libs: ThreeLibs, private readonly page: Page) {
    const THREE = libs.THREE;
    this.geometry = new THREE.PlaneGeometry(NunchiCardKit.WIDTH, NunchiCardKit.HEIGHT);
    this.backTexture = this.paintBack();
    this.backMaterial = new THREE.MeshBasicMaterial({ map: this.backTexture });
  }

  playTexture(card: number): Three<"CanvasTexture"> {
    const cached = this.playTextures.get(card);
    if (cached) return cached;
    const texture = this.paintPlay(card);
    this.playTextures.set(card, texture);
    return texture;
  }

  prizeTexture(prize: NunchiPrizeCard): Three<"CanvasTexture"> {
    const key = prize.points + (prize.star ? "s" : "");
    const cached = this.prizeTextures.get(key);
    if (cached) return cached;
    const texture = this.paintPrize(prize);
    this.prizeTextures.set(key, texture);
    return texture;
  }

  dispose(): void {
    this.geometry.dispose();
    this.backTexture.dispose();
    this.backMaterial.dispose();
    this.playTextures.forEach((texture) => texture.dispose());
    this.prizeTextures.forEach((texture) => texture.dispose());
  }

  private canvasFor(fill: string, border: string): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
    const canvas = this.page.createCanvas(NunchiCardKit.PIXEL_WIDTH, NunchiCardKit.PIXEL_HEIGHT);
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.outline(context, 4, 4, NunchiCardKit.PIXEL_WIDTH - 8, NunchiCardKit.PIXEL_HEIGHT - 8, 14);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = 6;
    context.strokeStyle = border;
    context.stroke();
    return { canvas, context };
  }

  private textureOf(canvas: HTMLCanvasElement): Three<"CanvasTexture"> {
    const texture = new this.libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = this.libs.THREE.SRGBColorSpace;
    return texture;
  }

  private write(context: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string): void {
    context.font = NunchiCardKit.FONT.replace("{size}", String(size));
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = color;
    context.fillText(text, x, y);
  }

  private paintPlay(card: number): Three<"CanvasTexture"> {
    const { canvas, context } = this.canvasFor("#FBF6E9", "#3A3A4A");
    const color = NunchiCardKit.NUMBER_COLORS[(card - 1) % NunchiCardKit.NUMBER_COLORS.length];
    this.write(context, String(card), 64, 92, 104, color);
    this.write(context, String(card), 26, 28, 28, color);
    this.write(context, String(card), 102, 152, 28, color);
    return this.textureOf(canvas);
  }

  private paintPrize(prize: NunchiPrizeCard): Three<"CanvasTexture"> {
    const { canvas, context } = this.canvasFor("#F6DE9A", "#B07A1E");
    this.write(context, String(prize.points), 64, 88, 100, "#7A3E00");
    this.write(context, "점", 64, 142, 26, "#7A3E00");
    if (prize.star) this.write(context, "★ +" + NunchiRules.STAR_BONUS, 64, 28, 26, "#D02A2A");
    return this.textureOf(canvas);
  }

  private paintBack(): Three<"CanvasTexture"> {
    const { canvas, context } = this.canvasFor("#7A1F2B", "#F1E6C8");
    context.strokeStyle = "rgba(241, 230, 200, .45)";
    context.lineWidth = 3;
    for (let line = -NunchiCardKit.PIXEL_HEIGHT; line < NunchiCardKit.PIXEL_WIDTH + NunchiCardKit.PIXEL_HEIGHT; line += 22) {
      context.beginPath();
      context.moveTo(line, 10);
      context.lineTo(line + NunchiCardKit.PIXEL_HEIGHT, NunchiCardKit.PIXEL_HEIGHT - 10);
      context.moveTo(line + NunchiCardKit.PIXEL_HEIGHT, 10);
      context.lineTo(line, NunchiCardKit.PIXEL_HEIGHT - 10);
      context.stroke();
    }
    this.outline(context, 4, 4, NunchiCardKit.PIXEL_WIDTH - 8, NunchiCardKit.PIXEL_HEIGHT - 8, 14);
    context.lineWidth = 8;
    context.strokeStyle = "#F1E6C8";
    context.stroke();
    return this.textureOf(canvas);
  }

  private outline(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }
}

class NunchiCardMesh {
  private readonly group: Three<"Group">;
  private readonly pivot: Three<"Group">;
  private readonly frontMaterial: Three<"MeshBasicMaterial">;

  constructor(private readonly kit: NunchiCardKit, private readonly world: Three<"Group">) {
    const THREE = kit.libs.THREE;
    this.frontMaterial = new THREE.MeshBasicMaterial({ map: kit.backTexture, transparent: true });
    const front = new THREE.Mesh(kit.geometry, this.frontMaterial);
    front.rotation.x = -Math.PI / 2;
    front.position.y = 0.004;
    const back = new THREE.Mesh(kit.geometry, kit.backMaterial);
    back.rotation.x = Math.PI / 2;
    back.position.y = -0.004;
    this.pivot = new THREE.Group();
    this.pivot.add(front, back);
    this.group = new THREE.Group();
    this.group.add(this.pivot);
    this.group.visible = false;
    world.add(this.group);
  }

  setFace(texture: Three<"CanvasTexture">): void {
    if (this.frontMaterial.map !== texture) this.frontMaterial.map = texture;
  }

  hide(): void {
    this.group.visible = false;
  }

  pose(x: number, y: number, z: number, yaw: number, faceUp: number, scale: number): void {
    this.group.visible = true;
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    this.group.scale.setScalar(Math.max(0.001, scale));
    this.pivot.rotation.z = Math.PI * (1 - faceUp);
  }

  paint(red: number, green: number, blue: number, opacity: number): void {
    this.frontMaterial.color.setRGB(red, green, blue);
    this.frontMaterial.opacity = opacity;
  }

  dispose(): void {
    this.world.remove(this.group);
    this.frontMaterial.dispose();
  }
}

interface NunchiPoint {
  readonly x: number;
  readonly z: number;
}

class NunchiChipStack {
  private static readonly MAX_CHIPS = 30;
  private static readonly PER_COLUMN = 10;
  private static readonly CHIP_HEIGHT = 0.07;

  private readonly mesh: Three<"InstancedMesh">;
  private readonly geometry: Three<"CylinderGeometry">;
  private readonly material: Three<"MeshLambertMaterial">;
  private shown = -1;

  constructor(libs: ThreeLibs, private readonly world: Three<"Group">, color: string, origin: NunchiPoint, column: NunchiPoint) {
    const THREE = libs.THREE;
    this.geometry = new THREE.CylinderGeometry(0.2, 0.2, NunchiChipStack.CHIP_HEIGHT, 14);
    this.material = new THREE.MeshLambertMaterial({ color });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, NunchiChipStack.MAX_CHIPS);
    const placer = new THREE.Object3D();
    for (let index = 0; index < NunchiChipStack.MAX_CHIPS; index++) {
      const columnIndex = Math.floor(index / NunchiChipStack.PER_COLUMN);
      const level = index % NunchiChipStack.PER_COLUMN;
      placer.position.set(
        origin.x + column.x * columnIndex,
        NunchiLayout.SURFACE_Y + NunchiChipStack.CHIP_HEIGHT * (level + 0.5),
        origin.z + column.z * columnIndex
      );
      placer.updateMatrix();
      this.mesh.setMatrixAt(index, placer.matrix);
    }
    this.mesh.count = 0;
    world.add(this.mesh);
  }

  setCount(count: number): void {
    const visible = MathUtil.clamp(Math.round(count), 0, NunchiChipStack.MAX_CHIPS);
    if (visible === this.shown) return;
    this.shown = visible;
    this.mesh.count = visible;
  }

  dispose(): void {
    this.world.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

class NunchiSeatView {
  private static readonly GESTURE_MS = 900;
  private static readonly DROP_MS = 260;
  private static readonly DROP_HEIGHT = 1.1;
  private static readonly LABEL_SCALE = 0.62;
  private static readonly LABEL_HEIGHT = 2.35;

  readonly spot: NunchiSeatSpot;
  private readonly group: Three<"Group">;
  private readonly blob: Three<"Mesh">;
  private readonly label: Three<"Sprite">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly card: NunchiCardMesh;
  private readonly chips: NunchiChipStack;
  private placedAt = -1;
  private gestureUntil = 0;

  constructor(
    private readonly viewKit: FighterViewKit,
    private readonly factory: CharacterModelFactory,
    clips: Map<string, Three<"AnimationClip">>,
    private readonly cards: NunchiCardKit,
    private readonly world: Three<"Group">,
    participant: MatchParticipant,
    look: CharacterLook,
    relative: number,
    private readonly style: NunchiViewStyle
  ) {
    const THREE = viewKit.libs.THREE;
    this.spot = NunchiLayout.seat(relative);
    const color = Palette.slotColor(participant.slot);
    this.group = new THREE.Group();
    this.group.position.set(this.spot.x, 0, this.spot.z);
    this.group.rotation.y = this.spot.characterYaw;
    this.model = factory.build(look);
    this.group.add(this.model);
    this.label = viewKit.labels.create(participant.nick + (participant.ai ? " (AI)" : ""), color);
    this.label.scale.multiplyScalar(NunchiSeatView.LABEL_SCALE);
    this.label.position.set(this.spot.x, NunchiSeatView.LABEL_HEIGHT, this.spot.z);
    this.blob = new THREE.Mesh(viewKit.blobGeometry, viewKit.blobMaterial);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.set(this.spot.x, 0.03, this.spot.z);
    world.add(this.group, this.label, this.blob);
    this.animator = new CharacterAnimator(viewKit.libs, this.model, clips);
    this.animator.play(FighterClips.IDLE);
    this.card = new NunchiCardMesh(cards, world);
    this.chips = new NunchiChipStack(viewKit.libs, world, color, { x: this.spot.chipX, z: this.spot.chipZ }, { x: this.spot.columnX, z: this.spot.columnZ });
  }

  tick(dt: number, now: number): void {
    if (this.gestureUntil > 0 && now >= this.gestureUntil) {
      this.gestureUntil = 0;
      this.animator.play(FighterClips.IDLE, { speed: 1 });
    }
    this.animator.update(dt);
  }

  drawScore(score: number): void {
    this.chips.setCount(score);
  }

  drawFaceDown(placed: boolean, now: number): void {
    if (!placed) {
      this.placedAt = -1;
      this.card.hide();
      return;
    }
    if (this.placedAt < 0) {
      this.placedAt = now;
      this.gestureUntil = now + NunchiSeatView.GESTURE_MS;
      this.animator.play(FighterClips.PUSH, { speed: 1.8, once: true });
    }
    const drop = 1 - NunchiShowTimeline.progress(now - this.placedAt, 0, NunchiSeatView.DROP_MS);
    this.card.paint(1, 1, 1, 1);
    this.card.pose(this.spot.cardX, NunchiLayout.CARD_Y + drop * NunchiSeatView.DROP_HEIGHT, this.spot.cardZ, this.style.cardYaw(this.spot), 0, this.style.cardScale);
  }

  drawShown(play: NunchiPlay, elapsedMs: number, winner: boolean): void {
    this.placedAt = Number.MAX_SAFE_INTEGER;
    const flip = NunchiShowTimeline.ease(NunchiShowTimeline.progress(elapsedMs, 0, NunchiShowTimeline.FLIP_MS));
    let lift = Math.sin(flip * Math.PI) * 0.55;
    let scale = 1;
    this.card.setFace(this.cards.playTexture(play.card));
    this.card.paint(1, 1, 1, 1);
    if (play.clashed && elapsedMs >= NunchiShowTimeline.CLASH_AT) {
      const pulse = 0.5 + 0.5 * Math.sin((elapsedMs - NunchiShowTimeline.CLASH_AT) / 60);
      const burn = NunchiShowTimeline.progress(elapsedMs, NunchiShowTimeline.BURN_AT, NunchiShowTimeline.BURN_MS);
      if (burn >= 1) {
        this.card.hide();
        return;
      }
      this.card.paint(1, 0.2 + 0.25 * pulse, 0.18, 1 - burn);
      scale = 1 - burn * 0.7;
      lift += burn * 0.3;
    } else if (winner && elapsedMs >= NunchiShowTimeline.GLOW_AT) {
      const pulse = 0.5 + 0.5 * Math.sin((elapsedMs - NunchiShowTimeline.GLOW_AT) / 110);
      this.card.paint(1, 0.82 + 0.12 * pulse, 0.3 + 0.2 * pulse, 1);
      scale = 1.08 + 0.1 * pulse;
      lift += 0.12;
    }
    this.card.pose(this.spot.cardX, NunchiLayout.CARD_Y + lift, this.spot.cardZ, this.style.cardYaw(this.spot), flip, scale * this.style.cardScale);
  }

  dispose(): void {
    this.world.remove(this.group, this.label, this.blob);
    this.factory.disposeModel(this.model);
    const labelMaterial = this.label.material;
    if (labelMaterial.map) labelMaterial.map.dispose();
    labelMaterial.dispose();
    this.card.dispose();
    this.chips.dispose();
  }
}

class NunchiTableScene {
  readonly scene: Three<"Scene">;
  readonly camera: Three<"PerspectiveCamera">;
  readonly world: Three<"Group">;

  constructor(libs: ThreeLibs, private readonly style: NunchiViewStyle) {
    const THREE = libs.THREE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(Palette.SKY);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
    this.scene.add(new THREE.HemisphereLight(Palette.SKY_LIGHT, Palette.GROUND_LIGHT, 1.1));
    const lamp = new THREE.DirectionalLight(Palette.SUN_LIGHT, 1.3);
    lamp.position.set(4, 14, 6);
    this.scene.add(lamp);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.buildRoom(libs);
    this.buildTable(libs);
  }

  releaseMaterials(): void {
    this.scene.traverse((object) => {
      const material = (object as { material?: Three<"Material"> | Three<"Material">[] }).material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else if (material) material.dispose();
    });
  }

  private buildRoom(libs: ThreeLibs): void {
    const THREE = libs.THREE;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(11, 48), new THREE.MeshLambertMaterial({ color: 0x2A2F4A }));
    floor.rotation.x = -Math.PI / 2;
    this.world.add(floor);
  }

  private buildTable(libs: ThreeLibs): void {
    const THREE = libs.THREE;
    const hexTurn = Math.PI / 6;
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(NunchiLayout.TABLE_RADIUS + 0.38, NunchiLayout.TABLE_RADIUS + 0.3, NunchiLayout.SURFACE_Y - 0.03, 6), new THREE.MeshLambertMaterial({ color: 0x7A4B2A }));
    wood.position.y = (NunchiLayout.SURFACE_Y - 0.03) / 2;
    wood.rotation.y = hexTurn;
    const felt = new THREE.Mesh(new THREE.CylinderGeometry(NunchiLayout.TABLE_RADIUS, NunchiLayout.TABLE_RADIUS, 0.06, 6), new THREE.MeshLambertMaterial({ color: 0x2E7D52 }));
    felt.position.y = NunchiLayout.SURFACE_Y - 0.03;
    felt.rotation.y = hexTurn;
    this.world.add(wood, felt);
    const slotMaterial = new THREE.MeshBasicMaterial({ color: 0x24694A });
    const slotGeometry = new THREE.PlaneGeometry(NunchiCardKit.WIDTH + 0.14, NunchiCardKit.HEIGHT + 0.14);
    for (let relative = 0; relative < NunchiRules.SEAT_COUNT; relative++) {
      const spot = NunchiLayout.seat(relative);
      const slot = new THREE.Mesh(slotGeometry, slotMaterial);
      slot.rotation.set(-Math.PI / 2, 0, 0);
      slot.rotation.order = "YXZ";
      slot.rotation.y = this.style.cardYaw(spot);
      slot.scale.setScalar(this.style.cardScale);
      slot.position.set(spot.cardX, NunchiLayout.SURFACE_Y + 0.005, spot.cardZ);
      this.world.add(slot);
    }
    const prizeRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.95, 40), new THREE.MeshBasicMaterial({ color: 0xE8C45A }));
    prizeRing.rotation.x = -Math.PI / 2;
    prizeRing.position.y = NunchiLayout.SURFACE_Y + 0.006;
    this.world.add(prizeRing);
  }
}

class NunchiCamera {
  private static readonly HEIGHT = 9.6;
  private static readonly DEPTH = 12;
  private static readonly LOOK_Z = 0.6;
  private static readonly ORBIT_RADIUS = 13;
  private static readonly ORBIT_HEIGHT = 8;
  private static readonly ORBIT_SPEED = 0.15;
  private static readonly OVERHEAD_REACH = 7.4;

  private orbit = 0;

  constructor(private readonly camera: Three<"PerspectiveCamera">, private readonly env: BrowserEnv) {}

  placeSeated(): void {
    const size = this.env.viewport();
    const zoom = Math.pow(MathUtil.clamp(1.6 / (size.width / size.height), 1, 2), 0.8);
    this.camera.position.set(0, NunchiCamera.HEIGHT * zoom, NunchiCamera.DEPTH * zoom);
    this.camera.lookAt(0, 0.3, NunchiCamera.LOOK_Z);
  }

  placeOverhead(): void {
    const size = this.env.viewport();
    const reach = Math.tan(this.camera.fov * Math.PI / 360);
    const distance = NunchiCamera.OVERHEAD_REACH * Math.max(1 / reach, 1 / (reach * (size.width / size.height)));
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(0, distance, 0);
    this.camera.lookAt(0, 0, 0);
  }

  showcase(dt: number): void {
    this.orbit += dt * NunchiCamera.ORBIT_SPEED;
    this.camera.position.set(Math.sin(this.orbit) * NunchiCamera.ORBIT_RADIUS, NunchiCamera.ORBIT_HEIGHT, Math.cos(this.orbit) * NunchiCamera.ORBIT_RADIUS);
    this.camera.lookAt(0, 0.6, 0);
  }
}

interface NunchiShownRound {
  readonly outcome: NunchiRoundOutcome;
  readonly elapsedMs: number;
}

interface NunchiStageFrame {
  readonly phase: NunchiPhase;
  readonly roundElapsedMs: number;
  readonly prize: NunchiPrizeCard;
  readonly pot: number;
  readonly placed: ReadonlySet<string>;
  readonly shown: NunchiShownRound | null;
  readonly scores: ReadonlyMap<string, number>;
}

class NunchiPrizeView {
  private static readonly FLIP_MS = 600;
  private static readonly ARC_HEIGHT = 1.3;

  private readonly card: NunchiCardMesh;
  private readonly pot: NunchiChipStack;

  constructor(private readonly kit: NunchiCardKit, world: Three<"Group">, private readonly style: NunchiViewStyle) {
    this.card = new NunchiCardMesh(kit, world);
    this.pot = new NunchiChipStack(kit.libs, world, "#E8C45A", { x: NunchiLayout.POT_X, z: NunchiLayout.POT_Z }, { x: 0, z: NunchiLayout.CHIP_COLUMN_GAP });
  }

  draw(frame: NunchiStageFrame, winnerSpot: NunchiSeatSpot | null): void {
    this.pot.setCount(frame.pot);
    this.card.setFace(this.kit.prizeTexture(frame.prize));
    const flip = frame.phase === "intro" ? 0 : NunchiShowTimeline.ease(NunchiShowTimeline.progress(frame.roundElapsedMs, 0, NunchiPrizeView.FLIP_MS));
    const lift = Math.sin(flip * Math.PI) * 0.6;
    const slide = frame.shown && winnerSpot ? NunchiShowTimeline.ease(NunchiShowTimeline.progress(frame.shown.elapsedMs, NunchiShowTimeline.SLIDE_AT, NunchiShowTimeline.SLIDE_MS)) : 0;
    if (slide >= 1) {
      this.card.hide();
      return;
    }
    const targetX = winnerSpot ? winnerSpot.chipX : 0, targetZ = winnerSpot ? winnerSpot.chipZ : 0;
    this.card.paint(1, 1, 1, 1);
    this.card.pose(
      MathUtil.lerp(0, targetX, slide),
      NunchiLayout.CARD_Y + lift + Math.sin(slide * Math.PI) * NunchiPrizeView.ARC_HEIGHT,
      MathUtil.lerp(0, targetZ, slide),
      0,
      flip,
      (1 - slide * 0.5) * this.style.cardScale
    );
  }

  dispose(): void {
    this.card.dispose();
    this.pot.dispose();
  }
}

class NunchiTableStage {
  private readonly seats = new Map<string, NunchiSeatView>();
  private readonly prizeView: NunchiPrizeView;

  constructor(
    viewKit: FighterViewKit,
    factory: CharacterModelFactory,
    assets: CharacterAssets,
    private readonly cards: NunchiCardKit,
    world: Three<"Group">,
    participants: readonly MatchParticipant[],
    looks: ReadonlyMap<string, CharacterLook>,
    mySlot: number,
    style: NunchiViewStyle
  ) {
    participants.forEach((participant) => {
      const look = looks.get(participant.id) || CharacterLooks.createDefault();
      this.seats.set(participant.id, new NunchiSeatView(viewKit, factory, assets.clips, cards, world, participant, look, NunchiLayout.relative(participant.slot, mySlot), style));
    });
    this.prizeView = new NunchiPrizeView(cards, world, style);
  }

  update(frame: NunchiStageFrame, now: number, dt: number): void {
    this.seats.forEach((seat, id) => {
      seat.tick(dt, now);
      const play = frame.shown ? frame.shown.outcome.plays.find((entry) => entry.id === id) : undefined;
      if (frame.shown && play) seat.drawShown(play, frame.shown.elapsedMs, frame.shown.outcome.winnerId === id);
      else seat.drawFaceDown(frame.placed.has(id), now);
      seat.drawScore(frame.scores.get(id) || 0);
    });
    const winner = frame.shown ? this.seats.get(frame.shown.outcome.winnerId) : undefined;
    this.prizeView.draw(frame, winner ? winner.spot : null);
  }

  dispose(): void {
    this.seats.forEach((seat) => seat.dispose());
    this.seats.clear();
    this.prizeView.dispose();
    this.cards.dispose();
  }
}
