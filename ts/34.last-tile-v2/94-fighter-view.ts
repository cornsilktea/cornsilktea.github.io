interface AnimationPlan {
  readonly clip: string;
  readonly speed: number;
  readonly once: boolean;
}

class FighterClips {
  static readonly IDLE = "Idle_A";
  static readonly RUN = "Running_A";
  static readonly PUSH = "Melee_1H_Attack_Chop";
  static readonly HIT = "Hit_A";
}

class FloorVisibility implements PhaseVisitor<boolean> {
  constructor(private readonly shownFloor: number, private readonly y: number, private readonly shownHeight: number) {}

  grounded(floor: number): boolean { return floor <= this.shownFloor; }
  falling(): boolean { return this.y < this.shownHeight + 6; }
  out(): boolean { return false; }
}

class AnimationPlanner implements PhaseVisitor<AnimationPlan> {
  constructor(private readonly fighter: Fighter, private readonly t: number, private readonly simulatedHere: boolean) {}

  falling(): AnimationPlan { return { clip: FighterClips.HIT, speed: 1.6, once: false }; }
  out(): AnimationPlan { return { clip: FighterClips.IDLE, speed: 1, once: false }; }

  grounded(floor: number): AnimationPlan {
    const fighter = this.fighter;
    if (fighter.isDashAnimating(this.t)) return { clip: FighterClips.RUN, speed: 2.4, once: false };
    if (fighter.isPushAnimating(this.t)) return { clip: FighterClips.PUSH, speed: 1.8, once: true };
    if (fighter.isHitAnimating(this.t) && this.simulatedHere) return { clip: FighterClips.HIT, speed: 1.4, once: true };
    const speed = fighter.speed();
    if (speed > 0.6) return { clip: FighterClips.RUN, speed: MathUtil.clamp(speed / 5, 0.7, 1.5), once: false };
    return { clip: FighterClips.IDLE, speed: 1, once: false };
  }
}

interface FighterViewContext {
  readonly t: number;
  readonly dt: number;
  readonly subject: Fighter | null;
  readonly shownFloor: number;
  readonly simulatedHere: boolean;
}

class NameTagFactory {
  private static readonly WIDTH = 256;
  private static readonly HEIGHT = 64;

  constructor(private readonly libs: ThreeLibs, private readonly page: Page) {}

  create(text: string, color: string): Three<"Sprite"> {
    const THREE = this.libs.THREE;
    const canvas = this.page.createCanvas(NameTagFactory.WIDTH, NameTagFactory.HEIGHT);
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.roundedRect(context, 4, 6, 248, 52, 14);
    context.fillStyle = Palette.LABEL_BACKGROUND;
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = color;
    context.stroke();
    context.font = '800 30px "Nanum Gothic", "Malgun Gothic", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#FFFFFF";
    context.fillText(text, 128, 34, 232);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(2.6, 0.65, 1);
    return sprite;
  }

  private roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.arcTo(x + width, y, x + width, y + radius, radius);
    context.lineTo(x + width, y + height - radius);
    context.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    context.lineTo(x + radius, y + height);
    context.arcTo(x, y + height, x, y + height - radius, radius);
    context.lineTo(x, y + radius);
    context.arcTo(x, y, x + radius, y, radius);
    context.closePath();
  }
}

class FighterViewKit {
  readonly blobMaterial: Three<"MeshBasicMaterial">;
  readonly blobGeometry: Three<"PlaneGeometry">;
  readonly ringGeometry: Three<"RingGeometry">;

  constructor(readonly libs: ThreeLibs, page: Page, readonly labels: NameTagFactory) {
    const THREE = libs.THREE;
    const canvas = page.createCanvas(64, 64);
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, Palette.SHADOW);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    this.blobMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false });
    this.blobGeometry = new THREE.PlaneGeometry(1.5, 1.5);
    this.ringGeometry = new THREE.RingGeometry(0.55, 0.74, 28);
  }
}

class FighterView {
  private readonly group: Three<"Group">;
  private readonly inner: Three<"Group">;
  private readonly blob: Three<"Mesh">;
  private readonly ring: Three<"Mesh">;
  private readonly label: Three<"Sprite">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private shownYaw = 0;
  private spin = 0;

  constructor(
    private readonly kit: FighterViewKit,
    private readonly factory: CharacterModelFactory,
    clips: Map<string, Three<"AnimationClip">>,
    private readonly world: Three<"Group">,
    participant: MatchParticipant,
    look: CharacterLook,
    initialYaw: number
  ) {
    const THREE = kit.libs.THREE;
    const color = Palette.slotColor(participant.slot);
    this.shownYaw = initialYaw;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.model = factory.build(look);
    this.inner.add(this.model);
    this.ring = new THREE.Mesh(kit.ringGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.label = kit.labels.create(participant.nick + (participant.ai ? " (AI)" : ""), color);
    this.label.position.y = 2.75;
    this.blob = new THREE.Mesh(kit.blobGeometry, kit.blobMaterial);
    this.blob.rotation.x = -Math.PI / 2;
    this.group.add(this.inner, this.ring, this.label);
    world.add(this.group, this.blob);
    this.animator = new CharacterAnimator(kit.libs, this.model, clips);
    this.animator.play(FighterClips.IDLE);
  }

  update(fighter: Fighter, context: FighterViewContext): void {
    const shownHeight = LastTileGeometry.floorY(context.shownFloor);
    let visible = !fighter.isOut() && !fighter.hasLeft();
    if (visible && fighter !== context.subject) visible = fighter.inspect(new FloorVisibility(context.shownFloor, fighter.y, shownHeight));
    this.group.visible = visible;
    this.blob.visible = visible;
    if (!visible) return;
    this.pose(fighter, context, shownHeight);
    const plan = fighter.inspect(new AnimationPlanner(fighter, context.t, context.simulatedHere));
    this.animator.play(plan.clip, { speed: plan.speed, once: plan.once });
    this.animator.update(context.dt);
  }

  dispose(): void {
    this.world.remove(this.group);
    this.world.remove(this.blob);
    this.factory.disposeModel(this.model);
    (this.ring.material as Three<"MeshBasicMaterial">).dispose();
    const labelMaterial = this.label.material;
    if (labelMaterial.map) labelMaterial.map.dispose();
    labelMaterial.dispose();
  }

  private pose(fighter: Fighter, context: FighterViewContext, shownHeight: number): void {
    const falling = fighter.isFalling();
    let tumble = 0;
    if (falling) {
      this.spin += context.dt * 6;
      tumble = Math.sin(this.spin) * 0.35;
    } else {
      this.spin = 0;
    }
    this.group.position.set(fighter.x, fighter.y, fighter.z);
    this.shownYaw += MathUtil.angleDifference(fighter.yaw, this.shownYaw) * Math.min(1, context.dt * 16);
    this.inner.rotation.y = this.shownYaw;
    this.inner.rotation.x = falling ? tumble : (fighter.isDashAnimating(context.t) ? 0.35 : 0);
    const grounded = fighter.isGrounded();
    const surfaceY = grounded ? fighter.y : shownHeight;
    this.blob.position.set(fighter.x, surfaceY + 0.03, fighter.z);
    const height = grounded ? 0 : Math.max(0, fighter.y - surfaceY);
    this.blob.scale.setScalar(MathUtil.clamp(1 - height / 12, 0.3, 1));
    this.blob.visible = grounded || fighter.y > shownHeight;
    this.ring.visible = grounded;
  }
}
