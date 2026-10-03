class SocCourtTextures {
  static readonly FLOOR_WIDTH = SocConfig.HALF_W * 2 + 3;
  static readonly FLOOR_LENGTH = SocConfig.HALF_L * 2 + 3;
  private static readonly STRIPE_METERS = 2.25;

  constructor(private readonly libs: ThreeLibs) {}

  floor(): Three<"CanvasTexture"> {
    const width = 1024, height = Math.round(1024 * SocCourtTextures.FLOOR_LENGTH / SocCourtTextures.FLOOR_WIDTH);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    const perMeter = width / SocCourtTextures.FLOOR_WIDTH;
    const toX = (x: number) => (x + SocCourtTextures.FLOOR_WIDTH / 2) * perMeter;
    const toZ = (z: number) => (z + SocCourtTextures.FLOOR_LENGTH / 2) * perMeter;
    const stripe = SocCourtTextures.STRIPE_METERS * perMeter;
    for (let y = 0, index = 0; y < height; y += stripe, index++) {
      context.fillStyle = index % 2 ? "#5BA056" : "#65AB5E";
      context.fillRect(0, y, width, stripe + 1);
    }
    context.strokeStyle = "rgba(255,255,255,.92)";
    context.lineWidth = 5;
    context.strokeRect(toX(-SocConfig.HALF_W), toZ(-SocConfig.HALF_L), SocConfig.HALF_W * 2 * perMeter, SocConfig.HALF_L * 2 * perMeter);
    context.beginPath();
    context.moveTo(toX(-SocConfig.HALF_W), toZ(0));
    context.lineTo(toX(SocConfig.HALF_W), toZ(0));
    context.stroke();
    context.beginPath();
    context.arc(toX(0), toZ(0), 2.4 * perMeter, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "rgba(255,255,255,.92)";
    context.beginPath();
    context.arc(toX(0), toZ(0), 0.14 * perMeter, 0, Math.PI * 2);
    context.fill();
    [-1, 1].forEach((sign) => {
      const lineZ = sign * SocConfig.HALF_L;
      const boxDepth = 4.2, boxHalf = 4.6, areaDepth = 1.6, areaHalf = SocConfig.GOAL_HALF_W + 0.6;
      context.strokeRect(toX(-boxHalf), Math.min(toZ(lineZ), toZ(lineZ - sign * boxDepth)), boxHalf * 2 * perMeter, boxDepth * perMeter);
      context.strokeRect(toX(-areaHalf), Math.min(toZ(lineZ), toZ(lineZ - sign * areaDepth)), areaHalf * 2 * perMeter, areaDepth * perMeter);
      context.beginPath();
      context.arc(toX(0), toZ(lineZ - sign * 3.2), 0.12 * perMeter, 0, Math.PI * 2);
      context.fill();
    });
    const texture = new this.libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = this.libs.THREE.SRGBColorSpace;
    return texture;
  }

  net(): Three<"CanvasTexture"> {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.strokeStyle = "rgba(255,255,255,.9)";
    context.lineWidth = 3;
    context.strokeRect(0, 0, 128, 128);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(128, 128);
    context.moveTo(128, 0);
    context.lineTo(0, 128);
    context.stroke();
    const texture = new this.libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = this.libs.THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = this.libs.THREE.RepeatWrapping;
    return texture;
  }

  ball(): Three<"CanvasTexture"> {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, 256, 128);
    context.fillStyle = "#1F2430";
    [[40, 34], [128, 34], [216, 34], [84, 94], [172, 94], [0, 94], [256, 94]].forEach((spot) => {
      context.beginPath();
      context.arc(spot[0], spot[1], 17, 0, Math.PI * 2);
      context.fill();
    });
    const texture = new this.libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = this.libs.THREE.SRGBColorSpace;
    return texture;
  }
}

class SocNetPanel {
  private static readonly AMPLITUDE = 0.075;
  private static readonly SIGMA_SQUARED = 1.4;
  private static readonly OMEGA = 14;
  private static readonly DECAY = 1.6;
  private static readonly LIFE_SECONDS = 2.4;

  readonly mesh: Three<"Mesh">;
  private readonly base: Float32Array;
  private readonly attribute: Three<"BufferAttribute">;
  private ripples: Array<{ x: number; y: number; z: number; strength: number; age: number }> = [];

  constructor(libs: ThreeLibs, texture: Three<"CanvasTexture">, geometry: TileGeometry, private readonly normal: readonly [number, number, number], repeatX: number, repeatY: number) {
    const THREE = libs.THREE;
    const map = texture.clone();
    map.needsUpdate = true;
    map.repeat.set(repeatX, repeatY);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    this.attribute = geometry.attributes.position as Three<"BufferAttribute">;
    this.base = Float32Array.from(this.attribute.array as ArrayLike<number>);
  }

  ripple(x: number, y: number, z: number, strength: number): void {
    this.ripples.push({ x, y, z, strength: Math.min(strength, 18), age: 0 });
    if (this.ripples.length > 5) this.ripples.shift();
  }

  update(deltaSeconds: number): void {
    if (!this.ripples.length) return;
    this.ripples.forEach((ripple) => { ripple.age += deltaSeconds; });
    this.ripples = this.ripples.filter((ripple) => ripple.age < SocNetPanel.LIFE_SECONDS);
    const positions = this.attribute.array as Float32Array;
    for (let index = 0; index < positions.length; index += 3) {
      let push = 0;
      for (const ripple of this.ripples) {
        const dx = this.base[index] - ripple.x, dy = this.base[index + 1] - ripple.y, dz = this.base[index + 2] - ripple.z;
        const falloff = Math.exp(-(dx * dx + dy * dy + dz * dz) / SocNetPanel.SIGMA_SQUARED);
        push += ripple.strength * SocNetPanel.AMPLITUDE * falloff * Math.cos(SocNetPanel.OMEGA * ripple.age) * Math.exp(-ripple.age * SocNetPanel.DECAY);
      }
      positions[index] = this.base[index] + this.normal[0] * push;
      positions[index + 1] = this.base[index + 1] + this.normal[1] * push;
      positions[index + 2] = this.base[index + 2] + this.normal[2] * push;
    }
    this.attribute.needsUpdate = true;
  }
}

class SocGoalView {
  readonly group: Three<"Group">;
  private readonly panels: SocNetPanel[] = [];

  constructor(private readonly libs: ThreeLibs, private readonly sign: number, netTexture: Three<"CanvasTexture">) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    const half = SocConfig.GOAL_HALF_W, height = SocConfig.GOAL_H, depth = SocConfig.GOAL_DEPTH;
    const frontZ = sign * SocConfig.HALF_L, backZ = sign * (SocConfig.HALF_L + depth), middleZ = sign * (SocConfig.HALF_L + depth / 2);
    const metal = new THREE.MeshLambertMaterial({ color: "#F4F4F8" });
    const addBar = (width: number, barHeight: number, barDepth: number, x: number, y: number, z: number) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(width, barHeight, barDepth), metal);
      bar.position.set(x, y, z);
      this.group.add(bar);
    };
    [-1, 1].forEach((side) => {
      addBar(0.14, height, 0.14, side * half, height / 2, frontZ);
      addBar(0.08, height, 0.08, side * half, height / 2, backZ);
      addBar(0.08, 0.08, depth, side * half, height, middleZ);
      addBar(0.08, 0.08, depth, side * half, 0.04, middleZ);
    });
    addBar(half * 2 + 0.14, 0.14, 0.14, 0, height, frontZ);
    addBar(half * 2, 0.08, 0.08, 0, height, backZ);
    addBar(half * 2, 0.08, 0.08, 0, 0.04, backZ);
    const back = new THREE.PlaneGeometry(half * 2, height, 12, 7);
    back.translate(0, height / 2, backZ);
    const sideLeft = new THREE.PlaneGeometry(depth, height, 6, 7);
    sideLeft.rotateY(Math.PI / 2);
    sideLeft.translate(-half, height / 2, middleZ);
    const sideRight = new THREE.PlaneGeometry(depth, height, 6, 7);
    sideRight.rotateY(Math.PI / 2);
    sideRight.translate(half, height / 2, middleZ);
    const roof = new THREE.PlaneGeometry(half * 2, depth, 12, 6);
    roof.rotateX(-Math.PI / 2);
    roof.translate(0, height, middleZ);
    this.panels.push(
      new SocNetPanel(libs, netTexture, back, [0, 0, 1], 9, 5),
      new SocNetPanel(libs, netTexture, sideLeft, [1, 0, 0], 4, 5),
      new SocNetPanel(libs, netTexture, sideRight, [1, 0, 0], 4, 5),
      new SocNetPanel(libs, netTexture, roof, [0, 1, 0], 9, 4)
    );
    this.panels.forEach((panel) => this.group.add(panel.mesh));
  }

  impact(impact: SocNetImpact): void {
    this.panels.forEach((panel) => panel.ripple(impact.x, impact.y, impact.z, impact.strength));
  }

  covers(z: number): boolean {
    return z * this.sign > 0;
  }

  update(deltaSeconds: number): void {
    this.panels.forEach((panel) => panel.update(deltaSeconds));
  }
}

class SocCrowd {
  private static readonly TIERS = 3;
  private static readonly PALETTE = ["#E5484D", "#3E8EF0", "#F2C879", "#FFFFFF", "#5DBB63", "#D97B4F", "#A78BFA"];

  readonly mesh: Three<"InstancedMesh">;
  private readonly home: Array<{ x: number; y: number; z: number }> = [];
  private readonly dummy: Three<"Object3D">;
  private excite = 0;
  private seconds = 0;
  private dirty = true;

  constructor(libs: ThreeLibs) {
    const THREE = libs.THREE;
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < SocCrowd.TIERS; tier++) {
        for (let z = -SocConfig.HALF_L + 1; z <= SocConfig.HALF_L - 1; z += 1) {
          this.home.push({ x: side * (SocConfig.HALF_W + 1.7 + tier * 1.25), y: (tier + 1) * 0.8 + 0.42, z: z + (tier % 2) * 0.4 });
        }
      }
    }
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.84, 0.36), new THREE.MeshLambertMaterial({ color: "#FFFFFF" }), this.home.length);
    this.mesh.frustumCulled = false;
    this.dummy = new THREE.Object3D();
    const color = new THREE.Color();
    this.home.forEach((spot, index) => {
      color.set(SocCrowd.PALETTE[Math.floor(Math.random() * SocCrowd.PALETTE.length)]);
      this.mesh.setColorAt(index, color);
    });
  }

  cheer(): void {
    this.excite = 1;
  }

  update(deltaSeconds: number): void {
    this.seconds += deltaSeconds;
    this.excite = Math.max(0, this.excite - deltaSeconds / 4);
    if (this.excite <= 0 && !this.dirty) return;
    this.home.forEach((spot, index) => {
      const bob = this.excite > 0 ? Math.abs(Math.sin(this.seconds * 9 + index * 0.7)) * 0.38 * Math.min(1, this.excite * 2) : 0;
      this.dummy.position.set(spot.x, spot.y + bob, spot.z);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = this.excite > 0;
  }
}

class SocCourtView {
  private static readonly DECOR: ReadonlyArray<{ path: string; x: number; z: number; height: number; turn: number }> = [
    { path: "dungeon/banner_blue", x: -4.5, z: -(SocConfig.HALF_L + SocConfig.GOAL_DEPTH + 0.6), height: 3.2, turn: 0 },
    { path: "dungeon/banner_blue", x: 4.5, z: -(SocConfig.HALF_L + SocConfig.GOAL_DEPTH + 0.6), height: 3.2, turn: 0 },
    { path: "dungeon/banner_green", x: -4.5, z: SocConfig.HALF_L + SocConfig.GOAL_DEPTH + 0.6, height: 3.2, turn: Math.PI },
    { path: "dungeon/banner_green", x: 4.5, z: SocConfig.HALF_L + SocConfig.GOAL_DEPTH + 0.6, height: 3.2, turn: Math.PI },
    { path: "props/Tree_1_A_Color1", x: -15, z: -9, height: 5, turn: 0 },
    { path: "props/Tree_2_B_Color1", x: -16, z: -1, height: 5.5, turn: 1 },
    { path: "props/Tree_3_A_Color1", x: -15, z: 8, height: 5, turn: 2 },
    { path: "props/Tree_4_B_Color1", x: 15, z: -8, height: 5, turn: 3 },
    { path: "props/Tree_1_A_Color1", x: 16, z: 1, height: 5.5, turn: 4 },
    { path: "props/Tree_2_B_Color1", x: 15, z: 9, height: 5, turn: 5 },
    { path: "props/Tree_3_A_Color1", x: -7, z: -19, height: 5, turn: 6 },
    { path: "props/Tree_4_B_Color1", x: 8, z: -19, height: 5.5, turn: 0 },
    { path: "props/Tree_1_A_Color1", x: -8, z: 19, height: 5, turn: 1 },
    { path: "props/Tree_2_B_Color1", x: 7, z: 19, height: 5.5, turn: 2 }
  ];
  private static readonly WALL_HEIGHT = 1.1;
  private static readonly WALL_THICKNESS = 0.5;

  readonly group: Three<"Group">;
  readonly crowd: SocCrowd;
  private readonly goals: SocGoalView[];
  private readonly wallGroup: Three<"Group">;

  constructor(private readonly libs: ThreeLibs, textures: SocCourtTextures) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ color: "#3F7A45" }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(SocCourtTextures.FLOOR_WIDTH, SocCourtTextures.FLOOR_LENGTH), new THREE.MeshBasicMaterial({ map: textures.floor() }));
    floor.rotation.x = -Math.PI / 2;
    this.group.add(ground, floor);
    const netTexture = textures.net();
    this.goals = [new SocGoalView(libs, -1, netTexture), new SocGoalView(libs, 1, netTexture)];
    this.goals.forEach((goal) => this.group.add(goal.group));
    this.wallGroup = new THREE.Group();
    this.group.add(this.wallGroup);
    this.buildWalls(null);
    this.buildFence();
    this.buildStands();
    this.crowd = new SocCrowd(libs);
    this.group.add(this.crowd.mesh);
  }

  async loadDecor(): Promise<void> {
    const THREE = this.libs.THREE;
    const loader = new this.libs.GLTFLoader();
    const wall = loader.loadAsync("assets/kaykit/soccer/Primitive_Wall_Short.gltf").then((gltf) => {
      const normalized = this.normalize(gltf.scene, 0);
      this.buildWalls(normalized);
    }).catch(() => undefined);
    const decor = SocCourtView.DECOR.map((entry) =>
      loader.loadAsync("assets/kaykit/" + entry.path + ".gltf").then((gltf) => {
        gltf.scene.traverse((node) => {
          const mesh = node as Three<"Mesh">;
          if (!mesh.isMesh || Array.isArray(mesh.material)) return;
          const source = mesh.material as Three<"MeshStandardMaterial">;
          mesh.material = new THREE.MeshLambertMaterial({ map: source.map, color: source.color });
        });
        const holder = this.normalize(gltf.scene, entry.height);
        holder.position.set(entry.x, 0, entry.z);
        holder.rotation.y = entry.turn;
        this.group.add(holder);
      }).catch(() => undefined)
    );
    await Promise.all([wall, ...decor]);
  }

  impact(impact: SocNetImpact): void {
    this.goals.forEach((goal) => { if (goal.covers(impact.z)) goal.impact(impact); });
  }

  update(deltaSeconds: number): void {
    this.goals.forEach((goal) => goal.update(deltaSeconds));
    this.crowd.update(deltaSeconds);
  }

  private normalize(scene: Three<"Object3D">, height: number): Three<"Group"> {
    const THREE = this.libs.THREE;
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const scale = height > 0 ? height / Math.max(size.y, 0.001) : 1;
    scene.scale.setScalar(scale);
    scene.position.set(-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);
    const holder = new THREE.Group();
    holder.add(scene);
    return holder;
  }

  private buildWalls(model: Three<"Group"> | null): void {
    const THREE = this.libs.THREE;
    this.wallGroup.clear();
    const material = new THREE.MeshLambertMaterial({ color: "#7C8798" });
    const addPiece = (length: number, x: number, z: number, alongZ: boolean) => {
      const piece = new THREE.Group();
      if (model) {
        const copy = model.clone(true);
        copy.traverse((node) => {
          const mesh = node as Three<"Mesh">;
          if (mesh.isMesh && !Array.isArray(mesh.material)) {
            const source = mesh.material as Three<"MeshStandardMaterial">;
            mesh.material = new THREE.MeshLambertMaterial({ map: source.map, color: source.color });
          }
        });
        copy.scale.set(length / 4, SocCourtView.WALL_HEIGHT / 2, SocCourtView.WALL_THICKNESS);
        piece.add(copy);
      } else {
        const box = new THREE.Mesh(new THREE.BoxGeometry(length, SocCourtView.WALL_HEIGHT, SocCourtView.WALL_THICKNESS), material);
        box.position.y = SocCourtView.WALL_HEIGHT / 2;
        piece.add(box);
      }
      piece.position.set(x, 0, z);
      piece.rotation.y = alongZ ? Math.PI / 2 : 0;
      this.wallGroup.add(piece);
    };
    const pieces = 6, pieceLength = (SocConfig.HALF_L * 2) / pieces;
    const offset = SocCourtView.WALL_THICKNESS / 2;
    for (let index = 0; index < pieces; index++) {
      const z = -SocConfig.HALF_L + pieceLength * (index + 0.5);
      addPiece(pieceLength, -SocConfig.HALF_W - offset, z, true);
      addPiece(pieceLength, SocConfig.HALF_W + offset, z, true);
    }
    const endLength = SocConfig.HALF_W - SocConfig.GOAL_HALF_W;
    [-1, 1].forEach((side) => {
      [-1, 1].forEach((end) => addPiece(endLength, side * (SocConfig.GOAL_HALF_W + endLength / 2), end * (SocConfig.HALF_L + offset), false));
    });
  }

  private buildFence(): void {
    const THREE = this.libs.THREE;
    const material = new THREE.MeshBasicMaterial({ color: "#CFE8FF", transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const bottom = SocCourtView.WALL_HEIGHT, top = 5;
    const addPane = (width: number, x: number, z: number, alongZ: boolean, from: number = bottom, to: number = top) => {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, to - from), material);
      pane.position.set(x, (from + to) / 2, z);
      pane.rotation.y = alongZ ? Math.PI / 2 : 0;
      this.group.add(pane);
    };
    [-1, 1].forEach((side) => {
      addPane(SocConfig.HALF_L * 2, side * SocConfig.HALF_W, 0, true);
      addPane(SocConfig.HALF_W - SocConfig.GOAL_HALF_W, side * (SocConfig.GOAL_HALF_W + (SocConfig.HALF_W - SocConfig.GOAL_HALF_W) / 2), -SocConfig.HALF_L, false);
      addPane(SocConfig.HALF_W - SocConfig.GOAL_HALF_W, side * (SocConfig.GOAL_HALF_W + (SocConfig.HALF_W - SocConfig.GOAL_HALF_W) / 2), SocConfig.HALF_L, false);
    });
    [-1, 1].forEach((end) => addPane(SocConfig.GOAL_HALF_W * 2, 0, end * SocConfig.HALF_L, false, SocConfig.GOAL_H, top));
  }

  private buildStands(): void {
    const THREE = this.libs.THREE;
    const material = new THREE.MeshLambertMaterial({ color: "#8A93A6" });
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < 3; tier++) {
        const height = (tier + 1) * 0.8;
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.25, height, SocConfig.HALF_L * 2), material);
        step.position.set(side * (SocConfig.HALF_W + 1.7 + tier * 1.25), height / 2, 0);
        this.group.add(step);
      }
    }
  }
}

class SocBallView {
  readonly group: Three<"Group">;
  private readonly sphere: Three<"Mesh">;
  private readonly shadow: Three<"Mesh">;
  private model: Three<"Object3D"> | null = null;
  private readonly spinHolder: Three<"Group">;

  constructor(private readonly libs: ThreeLibs, textures: SocCourtTextures) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.spinHolder = new THREE.Group();
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(SocConfig.BALL_R, 20, 14), new THREE.MeshLambertMaterial({ map: textures.ball() }));
    this.spinHolder.add(this.sphere);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.spinHolder, this.shadow);
  }

  async loadModel(): Promise<void> {
    try {
      const THREE = this.libs.THREE;
      const gltf = await new this.libs.GLTFLoader().loadAsync("assets/kaykit/soccer/football.gltf");
      gltf.scene.traverse((node) => {
        const mesh = node as Three<"Mesh">;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const source = mesh.material as Three<"MeshStandardMaterial">;
        mesh.material = new THREE.MeshLambertMaterial({ map: source.map, color: source.color });
      });
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const scale = (SocConfig.BALL_R * 2) / Math.max(size.x, size.y, size.z, 0.001);
      gltf.scene.scale.setScalar(scale);
      const center = box.getCenter(new THREE.Vector3());
      gltf.scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      const holder = new THREE.Group();
      holder.add(gltf.scene);
      this.model = holder;
      this.spinHolder.add(holder);
      this.sphere.visible = false;
    } catch (error) {
      this.model = null;
    }
  }

  place(x: number, y: number, z: number, velocityX: number, velocityZ: number, deltaSeconds: number): void {
    this.spinHolder.position.set(x, y, z);
    this.spinHolder.rotation.x += (velocityZ * deltaSeconds) / SocConfig.BALL_R;
    this.spinHolder.rotation.z -= (velocityX * deltaSeconds) / SocConfig.BALL_R;
    const height = Math.max(0, y - SocConfig.BALL_R);
    const scale = 1 / (1 + height * 0.35);
    this.shadow.position.set(x, 0.03, z);
    this.shadow.scale.setScalar(scale);
    (this.shadow.material as Three<"MeshBasicMaterial">).opacity = 0.38 * scale;
  }
}

class SocPlayerView {
  private static readonly CLIP_IDLE = "Idle_A";
  private static readonly CLIP_RUN = "Running_A";
  private static readonly CLIPS: Record<string, readonly string[]> = {
    kick: ["Melee_Unarmed_Attack_Kick", "Melee_1H_Attack_Chop"],
    tackle: ["Melee_Unarmed_Attack_Kick", "Melee_1H_Attack_Slice_Horizontal"],
    slide: ["Dodge_Forward", "Melee_Block"],
    hit: ["Hit_B", "Hit_A"],
    cheer: ["Cheering", "Melee_1H_Attack_Jump_Chop"]
  };

  readonly group: Three<"Group">;
  private readonly model: Three<"Object3D">;
  private readonly animator: CharacterAnimator;
  private readonly marker: Three<"Mesh"> | null;
  private shownYaw = 0;
  private actionUntilMs = 0;
  private slideUntilMs = 0;
  private cheering = false;
  private seconds = 0;

  constructor(
    private readonly libs: ThreeLibs,
    private readonly factory: CharacterModelFactory,
    private readonly assets: CharacterAssets,
    labels: RkLabelFactory,
    private readonly parent: Three<"Object3D">,
    readonly slot: number,
    readonly record: RkPlayerRecord,
    isMe: boolean
  ) {
    const THREE = libs.THREE;
    const color = SocConfig.TEAM_COLORS[SocConfig.teamOfSlot(slot)];
    this.group = new THREE.Group();
    this.model = factory.build(CharacterLooks.clean(record.look));
    this.group.add(this.model);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.74, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    const label = labels.create(record.nick, color);
    label.position.y = 2.75;
    this.group.add(ring, label);
    if (isMe) {
      this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.45, 4), new THREE.MeshBasicMaterial({ color: "#FFD23F" }));
      this.marker.rotation.x = Math.PI;
      this.marker.position.y = 3.35;
      this.group.add(this.marker);
    } else {
      this.marker = null;
    }
    parent.add(this.group);
    this.animator = new CharacterAnimator(libs, this.model, assets.clips);
    this.animator.play(SocPlayerView.CLIP_IDLE);
    this.shownYaw = SocCourtLayout.facingYaw(SocConfig.teamOfSlot(slot));
  }

  play(kind: "kick" | "tackle" | "slide" | "hit", nowMs: number, durationMs: number): void {
    const clip = this.pickClip(SocPlayerView.CLIPS[kind]);
    if (!clip) return;
    this.cheering = false;
    this.animator.play(clip, { once: true });
    this.actionUntilMs = nowMs + durationMs;
    if (kind === "slide") this.slideUntilMs = nowMs + SocConfig.SLIDE_MS;
  }

  setCheering(on: boolean): void {
    if (on === this.cheering) return;
    this.cheering = on;
    if (on) {
      const clip = this.pickClip(SocPlayerView.CLIPS.cheer);
      if (clip) this.animator.play(clip);
    }
  }

  render(x: number, z: number, yaw: number, moving: boolean, deltaSeconds: number, nowMs: number): void {
    this.seconds += deltaSeconds;
    this.shownYaw += SocMath.angleDifference(yaw, this.shownYaw) * Math.min(1, deltaSeconds * 16);
    const sliding = nowMs < this.slideUntilMs;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = this.shownYaw;
    this.model.rotation.x = sliding ? -1.15 : 0;
    this.model.position.y = sliding ? 0.42 : 0;
    if (!this.cheering && nowMs >= this.actionUntilMs) this.animator.play(moving ? SocPlayerView.CLIP_RUN : SocPlayerView.CLIP_IDLE);
    this.animator.update(deltaSeconds);
    if (this.marker) this.marker.position.y = 3.35 + Math.sin(this.seconds * 5) * 0.12;
  }

  show(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    this.parent.remove(this.group);
    this.factory.disposeModel(this.model);
  }

  private pickClip(candidates: readonly string[]): string | null {
    for (const name of candidates) if (this.assets.clips.has(name)) return name;
    return null;
  }
}

class SocCameraRig {
  private static readonly HALF_HORIZONTAL_FOV = 25;

  private readonly camera: Three<"PerspectiveCamera">;
  private focusX = 0;
  private focusZ = 0;
  private ready = false;

  constructor(libs: ThreeLibs) {
    this.camera = new libs.THREE.PerspectiveCamera(50, 1, 0.5, 220);
  }

  get perspective(): Three<"PerspectiveCamera"> {
    return this.camera;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    const half = Math.atan(Math.tan((SocCameraRig.HALF_HORIZONTAL_FOV * Math.PI) / 180) / aspect);
    this.camera.fov = Math.min(78, Math.max(42, (half * 2 * 180) / Math.PI));
    this.camera.updateProjectionMatrix();
  }

  snap(): void {
    this.ready = false;
  }

  orbit(radius: number, height: number, angle: number): void {
    this.camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    this.camera.lookAt(0, 0.8, 0);
  }

  followPlayer(team: number, ball: SocPoint, player: SocPoint, deltaSeconds: number): void {
    const side = SocConfig.sideOf(team);
    this.smooth((ball.x + player.x) / 2, (ball.z + player.z) / 2, deltaSeconds);
    this.camera.position.set(this.focusX * 0.3, 20, this.focusZ + side * 11);
    this.camera.lookAt(this.focusX * 0.45, 0, this.focusZ - side * 0.5);
  }

  watchFromSide(ballX: number, ballZ: number, deltaSeconds: number): void {
    this.smooth(ballX, ballZ, deltaSeconds);
    this.camera.position.set(19.5, 14.5, this.focusZ * 0.45);
    this.camera.lookAt(0, 0, this.focusZ * 0.5);
  }

  private smooth(x: number, z: number, deltaSeconds: number): void {
    if (!this.ready) {
      this.focusX = x;
      this.focusZ = z;
      this.ready = true;
    }
    const ratio = Math.min(1, deltaSeconds * 4);
    this.focusX += (x - this.focusX) * ratio;
    this.focusZ += (z - this.focusZ) * ratio;
  }
}

class SocWorldView {
  readonly scene: Three<"Scene">;
  readonly rig: SocCameraRig;
  readonly matchGroup: Three<"Group">;
  playing = false;
  private readonly renderer: Three<"WebGLRenderer">;
  private pixelRatio: number;
  private readonly governor: QualityGovernorHandle | null;

  constructor(libs: ThreeLibs, canvas: HTMLCanvasElement, touchDevice: boolean) {
    const THREE = libs.THREE;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: "high-performance" });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, touchDevice ? 1.5 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#7FB6E8");
    this.scene.add(new THREE.HemisphereLight(0xEAF3FF, 0x4F6B45, 1.5));
    const sun = new THREE.DirectionalLight(0xFFF3DC, 1.25);
    sun.position.set(6, 16, 9);
    this.scene.add(sun);
    this.matchGroup = new THREE.Group();
    this.scene.add(this.matchGroup);
    this.rig = new SocCameraRig(libs);
    this.governor = window.QualityGovernor
      ? window.QualityGovernor({ steps: [() => this.lowerPixelRatio()], storageKey: "soccer_quality_v1", isPlaying: () => this.playing, slowSec: 0.022, slowLimit: 90 })
      : null;
    if (this.governor) this.governor.restore();
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize(): void {
    const width = window.innerWidth, height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / height);
  }

  render(deltaSeconds: number): void {
    this.renderer.render(this.scene, this.rig.perspective);
    if (this.governor) this.governor.update(deltaSeconds);
  }

  private lowerPixelRatio(): boolean {
    if (this.pixelRatio <= 1) return false;
    this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
    return true;
  }
}

class SocMenuBackdrop {
  private static readonly ORBIT_SECONDS = 80;
  private static readonly RADIUS = 21;
  private static readonly HEIGHT = 9;
  private static readonly CYCLE_SECONDS = 3.6;
  private static readonly PASS_SECONDS = 0.9;

  private readonly ballView: SocBallView;
  private readonly views: SocPlayerView[] = [];
  private seconds = 0;
  private lastSlideCycle = -1;
  private lastPassCycle = -1;

  constructor(private readonly world: SocWorldView, private readonly libs: ThreeLibs, textures: SocCourtTextures) {
    this.ballView = new SocBallView(libs, textures);
    world.scene.add(this.ballView.group);
  }

  loadBall(): Promise<void> {
    return this.ballView.loadModel();
  }

  prepare(factory: CharacterModelFactory, assets: CharacterAssets, labels: RkLabelFactory): void {
    if (this.views.length) return;
    for (let slot = 0; slot < SocConfig.SEAT_COUNT; slot++) {
      const record: SocPlayerRecord = { nick: SocConfig.BOT_NAMES[slot], isBot: true, joinedAt: 0, slot, look: SocBotLooks.create(SocConfig.teamOfSlot(slot)) };
      this.views.push(new SocPlayerView(this.libs, factory, assets, labels, this.world.scene, slot, record, false));
    }
  }

  render(deltaSeconds: number): void {
    this.seconds += deltaSeconds;
    if (!this.views.length) {
      this.world.rig.orbit(SocMenuBackdrop.RADIUS, SocMenuBackdrop.HEIGHT, (this.seconds / SocMenuBackdrop.ORBIT_SECONDS) * Math.PI * 2);
      this.world.render(deltaSeconds);
      return;
    }
    const nowMs = this.seconds * 1000;
    const cycle = Math.floor(this.seconds / SocMenuBackdrop.CYCLE_SECONDS);
    const phase = (this.seconds % SocMenuBackdrop.CYCLE_SECONDS) / SocMenuBackdrop.CYCLE_SECONDS;
    const holderIndex = cycle % 2;
    const lane = (cycle % 4 < 2 ? -1 : 1) * 3;
    const mover = (index: number, time: number): SocPoint => {
      const direction = index === 0 ? 1 : -1;
      return { x: lane * (index === 0 ? 1 : -1) * 0.8 + Math.sin(time * 0.7 + index * 2) * 2.2, z: direction * (2 + Math.sin(time * 0.45 + index) * 4.5) - 1 };
    };
    const reds = [mover(0, this.seconds), mover(1, this.seconds)];
    const holder = reds[holderIndex];
    const receiver = reds[1 - holderIndex];
    const passing = phase > 1 - SocMenuBackdrop.PASS_SECONDS / SocMenuBackdrop.CYCLE_SECONDS;
    const passProgress = passing ? (phase - (1 - SocMenuBackdrop.PASS_SECONDS / SocMenuBackdrop.CYCLE_SECONDS)) / (SocMenuBackdrop.PASS_SECONDS / SocMenuBackdrop.CYCLE_SECONDS) : 0;
    const ahead = SocMath.lerp(holder.z, receiver.z, passProgress);
    const ballX = passing ? SocMath.lerp(holder.x, receiver.x, passProgress) : holder.x + 0.8;
    const ballZ = passing ? ahead : holder.z - 0.9;
    this.ballView.group.visible = true;
    this.ballView.place(ballX, SocConfig.BALL_R + (passing ? Math.sin(passProgress * Math.PI) * 0.4 : 0), ballZ, 0, passing ? -6 : -2, deltaSeconds);
    const ahead2 = this.seconds + 0.2;
    this.views.forEach((view, slot) => {
      const team = SocConfig.teamOfSlot(slot);
      let spot: SocPoint;
      let nextSpot: SocPoint;
      if (team === 0) {
        spot = reds[slot];
        nextSpot = mover(slot, ahead2);
      } else {
        const index = slot - 2;
        const target = index === 0 ? holder : receiver;
        const lag = Math.sin(this.seconds * 0.9 + index * 3) * 2.2;
        spot = { x: target.x + lag, z: target.z - 2.6 - index * 1.2 };
        nextSpot = { x: target.x + lag + 0.2, z: target.z - 2.4 - index * 1.2 };
      }
      const yaw = Math.atan2(nextSpot.x - spot.x, nextSpot.z - spot.z);
      view.render(spot.x, spot.z, Math.abs(nextSpot.x - spot.x) + Math.abs(nextSpot.z - spot.z) > 0.001 ? yaw : 0, true, deltaSeconds, nowMs);
    });
    if (passing && this.lastPassCycle !== cycle) {
      this.lastPassCycle = cycle;
      this.views[holderIndex].play("kick", nowMs, 450);
    }
    if (cycle !== this.lastSlideCycle) {
      this.lastSlideCycle = cycle;
      if (cycle % 3 === 0) this.views[2 + (cycle % 2)].play("slide", nowMs, 650);
    }
    this.world.rig.orbit(SocMenuBackdrop.RADIUS, SocMenuBackdrop.HEIGHT, (this.seconds / SocMenuBackdrop.ORBIT_SECONDS) * Math.PI * 2);
    this.world.render(deltaSeconds);
  }

  hide(): void {
    this.ballView.group.visible = false;
    this.views.forEach((view) => view.show(false));
  }

  show(): void {
    this.views.forEach((view) => view.show(true));
  }
}
