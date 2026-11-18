interface ClimbSkyKey {
  height: number;
  top: number;
  horizon: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunPower: number;
  sunUp: number;
  moonUp: number;
  night: number;
}

interface ClimbGlowSpot { x: number; y: number; z: number; color: number; always: boolean }

class ClimbSkyState {
  readonly top: Three<"Color">;
  readonly horizon: Three<"Color">;
  readonly bottom: Three<"Color">;
  readonly hemiSky: Three<"Color">;
  readonly hemiGround: Three<"Color">;
  readonly sun: Three<"Color">;
  hemi = 1;
  sunPower = 1;
  sunUp = 1;
  moonUp = -1;
  night = 0;

  constructor(libs: ThreeLibs) {
    const THREE = libs.THREE;
    this.top = new THREE.Color();
    this.horizon = new THREE.Color();
    this.bottom = new THREE.Color();
    this.hemiSky = new THREE.Color();
    this.hemiGround = new THREE.Color();
    this.sun = new THREE.Color();
  }
}

class ClimbSkySchedule {
  static readonly KEYS: readonly ClimbSkyKey[] = [
    { height: 0, top: 0x5FA8E8, horizon: 0xBFE6F7, hemiSky: 0xDFF3FF, hemiGround: 0x6E7F5A, hemi: 1.5, sun: 0xFFF2D8, sunPower: 2.1, sunUp: 0.55, moonUp: -0.6, night: 0 },
    { height: 45, top: 0x3B8CE0, horizon: 0xA9DBF6, hemiSky: 0xE8F6FF, hemiGround: 0x72805C, hemi: 1.55, sun: 0xFFFBF0, sunPower: 2.2, sunUp: 0.95, moonUp: -0.9, night: 0 },
    { height: 75, top: 0x5A97D6, horizon: 0xF0DDAE, hemiSky: 0xFFF0D6, hemiGround: 0x7A7356, hemi: 1.45, sun: 0xFFE0A6, sunPower: 2.05, sunUp: 0.45, moonUp: -0.5, night: 0 },
    { height: 105, top: 0x5868B4, horizon: 0xF7985E, hemiSky: 0xFFD2B4, hemiGround: 0x6E5248, hemi: 1.3, sun: 0xFF9E62, sunPower: 1.85, sunUp: 0.08, moonUp: -0.2, night: 0.15 },
    { height: 135, top: 0x2A2C6A, horizon: 0xB75E7C, hemiSky: 0xBCA6DC, hemiGround: 0x4C3E56, hemi: 1.1, sun: 0xC6A6E8, sunPower: 1.15, sunUp: -0.25, moonUp: 0.15, night: 0.6 },
    { height: 165, top: 0x0D1736, horizon: 0x2E4274, hemiSky: 0xA2B8EC, hemiGround: 0x3C4660, hemi: 1, sun: 0xAFC8FF, sunPower: 1, sunUp: -0.6, moonUp: 0.5, night: 0.92 },
    { height: 192, top: 0x08040F, horizon: 0x3B2440, hemiSky: 0xB8A2CC, hemiGround: 0x5C3E3E, hemi: 0.95, sun: 0xCDBBFF, sunPower: 0.95, sunUp: -0.8, moonUp: 0.65, night: 1 },
  ];
  static readonly BOTTOM_SHADE = 0.55;
  static readonly STEP = 0.5;

  private readonly a: Three<"Color">;
  private readonly b: Three<"Color">;
  private bucket = Number.NaN;

  constructor(libs: ThreeLibs, readonly state: ClimbSkyState) {
    this.a = new libs.THREE.Color();
    this.b = new libs.THREE.Color();
  }

  sample(height: number): boolean {
    const S = ClimbSkySchedule, bucket = Math.round(height / S.STEP);
    if (bucket === this.bucket) return false;
    this.bucket = bucket;
    const keys = S.KEYS, h = bucket * S.STEP;
    let index = 0;
    while (index < keys.length - 2 && h > keys[index + 1].height) index++;
    const low = keys[index], high = keys[index + 1];
    const raw = Math.max(0, Math.min(1, (h - low.height) / (high.height - low.height))), t = raw * raw * (3 - 2 * raw), s = this.state;
    this.mix(s.top, low.top, high.top, t);
    this.mix(s.horizon, low.horizon, high.horizon, t);
    s.bottom.copy(s.horizon).multiplyScalar(S.BOTTOM_SHADE);
    this.mix(s.hemiSky, low.hemiSky, high.hemiSky, t);
    this.mix(s.hemiGround, low.hemiGround, high.hemiGround, t);
    this.mix(s.sun, low.sun, high.sun, t);
    s.hemi = low.hemi + (high.hemi - low.hemi) * t;
    s.sunPower = low.sunPower + (high.sunPower - low.sunPower) * t;
    s.sunUp = low.sunUp + (high.sunUp - low.sunUp) * t;
    s.moonUp = low.moonUp + (high.moonUp - low.moonUp) * t;
    s.night = low.night + (high.night - low.night) * t;
    return true;
  }

  private mix(out: Three<"Color">, from: number, to: number, t: number): void {
    out.copy(this.a.setHex(from)).lerp(this.b.setHex(to), t);
  }
}

class ClimbSkyDome {
  static readonly RADIUS = 200;
  static readonly VERTEX = "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
  static readonly FRAGMENT = [
    "uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;",
    "void main() {",
    "  float h = normalize(vDir).y;",
    "  vec3 color = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.4), 0.7)) : mix(horizon, bottom, min(1.0, -h * 3.0));",
    "  gl_FragColor = vec4(color, 1.0);",
    "  #include <colorspace_fragment>",
    "}",
  ].join("\n");

  readonly mesh: Three<"Mesh">;
  private readonly material: Three<"ShaderMaterial">;

  constructor(libs: ThreeLibs, state: ClimbSkyState) {
    const THREE = libs.THREE, D = ClimbSkyDome;
    this.material = new THREE.ShaderMaterial({
      uniforms: { top: { value: state.top }, horizon: { value: state.horizon }, bottom: { value: state.bottom } },
      vertexShader: D.VERTEX, fragmentShader: D.FRAGMENT, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(D.RADIUS, 24, 12), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  follow(camera: Three<"PerspectiveCamera">): void { this.mesh.position.copy(camera.position); }
  refresh(): void { this.material.uniformsNeedUpdate = true; }
}

class ClimbSkyBodies {
  static readonly DISTANCE = 185;
  static readonly SUN_SIZE = 34;
  static readonly MOON_SIZE = 20;
  static readonly STAR_COUNT = 420;
  static readonly STAR_SEED = 7331;
  static readonly SUN_TURN = Math.atan2(14, 10);

  readonly group: Three<"Group">;
  private readonly sun: Three<"Sprite">;
  private readonly moon: Three<"Sprite">;
  private readonly stars: Three<"Points">;
  private readonly sunMaterial: Three<"SpriteMaterial">;
  private readonly moonMaterial: Three<"SpriteMaterial">;
  private readonly starMaterial: Three<"PointsMaterial">;

  constructor(private readonly libs: ThreeLibs, glow: Three<"CanvasTexture">, disc: Three<"CanvasTexture">) {
    const THREE = libs.THREE, B = ClimbSkyBodies;
    this.group = new THREE.Group();
    this.sunMaterial = new THREE.SpriteMaterial({ map: glow, color: 0xFFF4D6, fog: false, depthWrite: false, transparent: true });
    this.moonMaterial = new THREE.SpriteMaterial({ map: disc, color: 0xEEF2FF, fog: false, depthWrite: false, transparent: true });
    this.sun = new THREE.Sprite(this.sunMaterial);
    this.sun.scale.setScalar(B.SUN_SIZE);
    this.moon = new THREE.Sprite(this.moonMaterial);
    this.moon.scale.setScalar(B.MOON_SIZE);
    this.starMaterial = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(this.starGeometry(), this.starMaterial);
    for (const item of [this.sun, this.moon, this.stars]) { item.frustumCulled = false; item.renderOrder = -9; }
    this.group.add(this.stars, this.sun, this.moon);
  }

  private starGeometry(): TileGeometry {
    const THREE = this.libs.THREE, B = ClimbSkyBodies, dice = new ClimbDecorDice(B.STAR_SEED), points = new Float32Array(B.STAR_COUNT * 3);
    for (let i = 0; i < B.STAR_COUNT; i++) {
      const turn = dice.between(0, Math.PI * 2), up = Math.asin(dice.between(0.04, 1)), r = B.DISTANCE + 5;
      points[i * 3] = Math.cos(up) * Math.sin(turn) * r;
      points[i * 3 + 1] = Math.sin(up) * r;
      points[i * 3 + 2] = Math.cos(up) * Math.cos(turn) * r;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    return geometry as unknown as TileGeometry;
  }

  follow(camera: Three<"PerspectiveCamera">): void { this.group.position.copy(camera.position); }

  apply(state: ClimbSkyState): void {
    const B = ClimbSkyBodies;
    this.place(this.sun, state.sunUp, B.SUN_TURN);
    this.place(this.moon, state.moonUp, B.SUN_TURN + Math.PI * 0.8);
    this.sunMaterial.opacity = this.rise(state.sunUp);
    this.sunMaterial.color.setRGB(1, 0.78 + 0.2 * this.rise(state.sunUp - 0.3), 0.55 + 0.4 * this.rise(state.sunUp - 0.3));
    this.moonMaterial.opacity = this.rise(state.moonUp) * 0.95;
    this.starMaterial.opacity = Math.max(0, Math.min(1, (state.night - 0.25) / 0.6));
  }

  private rise(up: number): number { return Math.max(0, Math.min(1, (up + 0.06) / 0.16)); }

  private place(sprite: Three<"Sprite">, up: number, turn: number): void {
    const r = ClimbSkyBodies.DISTANCE;
    sprite.position.set(Math.cos(up) * Math.sin(turn) * r, Math.sin(up) * r, Math.cos(up) * Math.cos(turn) * r);
  }
}

class ClimbCloudLayer {
  static readonly COUNT = 30;
  static readonly SEED = 9917;
  static readonly LOW = 8;
  static readonly HIGH = 205;
  static readonly NEAR = 50;
  static readonly FAR = 92;
  static readonly MODELS: readonly string[] = ["cloudBig", "cloudSmall"];

  static readonly STAGE_SPAN = 30;
  static readonly LAST_STAGE = 7;

  constructor(libs: ThreeLibs, library: ClimbModelLibrary, groupOf: (stage: number) => Three<"Object3D">) {
    const THREE = libs.THREE, C = ClimbCloudLayer, dice = new ClimbDecorDice(C.SEED), lists = new Map<string, Three<"Matrix4">[]>();
    for (let i = 0; i < C.COUNT; i++) {
      const name = C.MODELS[i % C.MODELS.length], turn = dice.between(0, Math.PI * 2), rho = dice.between(C.NEAR, C.FAR), y = C.LOW + (C.HIGH - C.LOW) * (i + dice.next()) / C.COUNT, scale = dice.between(3, 5.5);
      const matrix = new THREE.Matrix4().makeTranslation(Math.sin(turn) * rho, y, Math.cos(turn) * rho);
      matrix.multiply(new THREE.Matrix4().makeRotationY(turn + Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(scale * 1.4, scale, scale));
      const key = this.stageOf(y) + "|" + name, list = lists.get(key);
      if (list) list.push(matrix); else lists.set(key, [matrix]);
    }
    lists.forEach((matrices, key) => {
      const [stage, name] = key.split("|");
      for (const part of library.model(name).parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
        matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        groupOf(Number(stage)).add(mesh);
      }
    });
  }

  private stageOf(height: number): number {
    return Math.max(1, Math.min(ClimbCloudLayer.LAST_STAGE, Math.floor(height / ClimbCloudLayer.STAGE_SPAN) + 1));
  }
}

class ClimbNightGlow {
  static readonly SIZE = 2.6;
  static readonly ALWAYS_SHARE = 0.7;

  readonly group: Three<"Group">;
  private readonly nightMaterial: Three<"PointsMaterial">;
  private readonly alwaysMaterial: Three<"PointsMaterial">;

  constructor(private readonly libs: ThreeLibs, glow: Three<"CanvasTexture">, spots: readonly ClimbGlowSpot[]) {
    const THREE = libs.THREE;
    this.group = new THREE.Group();
    this.nightMaterial = this.material(glow);
    this.alwaysMaterial = this.material(glow);
    this.alwaysMaterial.opacity = ClimbNightGlow.ALWAYS_SHARE;
    this.group.add(this.points(spots.filter((spot) => !spot.always), this.nightMaterial), this.points(spots.filter((spot) => spot.always), this.alwaysMaterial));
  }

  private material(glow: Three<"CanvasTexture">): Three<"PointsMaterial"> {
    const THREE = this.libs.THREE;
    return new THREE.PointsMaterial({ map: glow, size: ClimbNightGlow.SIZE, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  }

  private points(spots: readonly ClimbGlowSpot[], material: Three<"PointsMaterial">): Three<"Points"> {
    const THREE = this.libs.THREE, position = new Float32Array(Math.max(1, spots.length) * 3), color = new Float32Array(Math.max(1, spots.length) * 3), tint = new THREE.Color();
    spots.forEach((spot, i) => {
      position.set([spot.x, spot.y, spot.z], i * 3);
      tint.setHex(spot.color);
      color.set([tint.r, tint.g, tint.b], i * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  apply(state: ClimbSkyState): void {
    this.nightMaterial.opacity = Math.max(0, Math.min(1, (state.night - 0.1) / 0.6));
    this.alwaysMaterial.opacity = ClimbNightGlow.ALWAYS_SHARE + (1 - ClimbNightGlow.ALWAYS_SHARE) * state.night;
  }
}

class ClimbSkyTextures {
  static glow(libs: ThreeLibs): Three<"CanvasTexture"> {
    return ClimbSkyTextures.paint(libs, (context, size) => {
      const fill = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      fill.addColorStop(0, "rgba(255,255,255,1)");
      fill.addColorStop(0.25, "rgba(255,255,255,0.85)");
      fill.addColorStop(0.55, "rgba(255,255,255,0.25)");
      fill.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = fill;
      context.fillRect(0, 0, size, size);
    });
  }

  static disc(libs: ThreeLibs): Three<"CanvasTexture"> {
    return ClimbSkyTextures.paint(libs, (context, size) => {
      const halo = context.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size / 2);
      halo.addColorStop(0, "rgba(255,255,255,0.35)");
      halo.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, size, size);
      context.fillStyle = "#FFFFFF";
      context.beginPath(); context.arc(size / 2, size / 2, size * 0.24, 0, Math.PI * 2); context.fill();
      context.fillStyle = "rgba(170,180,210,0.55)";
      for (const [x, y, r] of [[0.44, 0.44, 0.05], [0.57, 0.53, 0.035], [0.47, 0.6, 0.03]]) { context.beginPath(); context.arc(size * x, size * y, size * r, 0, Math.PI * 2); context.fill(); }
    });
  }

  private static paint(libs: ThreeLibs, draw: (context: CanvasRenderingContext2D, size: number) => void): Three<"CanvasTexture"> {
    const canvas = document.createElement("canvas"), size = 64;
    canvas.width = canvas.height = size;
    draw(canvas.getContext("2d") as CanvasRenderingContext2D, size);
    const texture = new libs.THREE.CanvasTexture(canvas);
    texture.colorSpace = libs.THREE.SRGBColorSpace;
    return texture;
  }
}

class ClimbDayCycle {
  private readonly state: ClimbSkyState;
  private readonly schedule: ClimbSkySchedule;
  private readonly dome: ClimbSkyDome;
  private readonly bodies: ClimbSkyBodies;
  private readonly glow: ClimbNightGlow;

  constructor(libs: ThreeLibs, library: ClimbModelLibrary, private readonly scene: Three<"Scene">, private readonly hemi: Three<"HemisphereLight">, private readonly sun: Three<"DirectionalLight">, builder: TowerLevelBuilder) {
    const glowTexture = ClimbSkyTextures.glow(libs);
    this.state = new ClimbSkyState(libs);
    this.schedule = new ClimbSkySchedule(libs, this.state);
    this.dome = new ClimbSkyDome(libs, this.state);
    this.bodies = new ClimbSkyBodies(libs, glowTexture, ClimbSkyTextures.disc(libs));
    this.glow = new ClimbNightGlow(libs, glowTexture, builder.glows);
    new ClimbCloudLayer(libs, library, (stage) => builder.stageGroups.get(stage) ?? scene);
    scene.add(this.dome.mesh, this.bodies.group, this.glow.group);
  }

  follow(camera: Three<"PerspectiveCamera">): void {
    this.dome.follow(camera);
    this.bodies.follow(camera);
    if (!this.schedule.sample(camera.position.y)) return;
    const s = this.state, background = this.scene.background as Three<"Color">, fog = this.scene.fog as Three<"Fog">;
    background.copy(s.horizon);
    fog.color.copy(s.horizon);
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemi;
    this.sun.color.copy(s.sun);
    this.sun.intensity = s.sunPower;
    this.dome.refresh();
    this.bodies.apply(s);
    this.glow.apply(s);
  }
}
