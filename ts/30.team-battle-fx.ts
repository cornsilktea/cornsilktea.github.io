type ArenaFxShape = import("three").BufferGeometry;
type ArenaFxUniforms = Record<string, { value: unknown }>;
type ArenaFxColorUniform = { value: Three<"Color"> };
type ArenaFxNumberUniform = { value: number };

interface ArenaFxHost {
  THREE: ThreeModule;
  noise(): Three<"Texture">;
  scene(): Three<"Scene">;
  pixelScale(): number;
  isLite(): boolean;
}

interface ArenaFxVis {
  root: Three<"Group">;
}

class ArenaFxKit {
  readonly THREE: ThreeModule;
  private flatShape: ArenaFxShape | null = null;
  private lineShape: ArenaFxShape | null = null;

  constructor(readonly host: ArenaFxHost) {
    this.THREE = host.THREE;
  }

  static hash(x: number, y: number): number {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  }

  static clamp01(k: number): number {
    return Math.max(0, Math.min(1, k));
  }

  get flat(): ArenaFxShape {
    if (!this.flatShape) {
      this.flatShape = new this.THREE.PlaneGeometry(2, 2);
      this.flatShape.rotateX(-Math.PI / 2);
    }
    return this.flatShape;
  }

  get line(): ArenaFxShape {
    if (!this.lineShape) {
      this.lineShape = new this.THREE.PlaneGeometry(1, 1);
      this.lineShape.rotateX(-Math.PI / 2);
      this.lineShape.translate(0.5, 0, 0);
    }
    return this.lineShape;
  }

  number(value: number): ArenaFxNumberUniform {
    return { value };
  }

  color(hex: number): ArenaFxColorUniform {
    return { value: new this.THREE.Color(hex) };
  }

  noise(): { value: Three<"Texture"> } {
    return { value: this.host.noise() };
  }

  soft(uniforms: ArenaFxUniforms, vertexShader: string, fragmentShader: string, side?: Three<"Material">["side"]): Three<"ShaderMaterial"> {
    return new this.THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, side: side === undefined ? this.THREE.FrontSide : side });
  }

  mesh(geometry: ArenaFxShape, material: Three<"Material">, order: number): Three<"Mesh"> {
    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    return mesh;
  }

  seededPoints(count: number, salt: number): ArenaFxShape {
    const seeds: number[] = [];
    for (let i = 0; i < count; i++) seeds.push(ArenaFxKit.hash(i + salt, 3), ArenaFxKit.hash(i + salt * 2, 7), ArenaFxKit.hash(i + salt * 3, 11));
    const geometry = new this.THREE.BufferGeometry();
    geometry.setAttribute("position", new this.THREE.Float32BufferAttribute(seeds, 3));
    return geometry;
  }

  points(geometry: ArenaFxShape, material: Three<"Material">, order: number): Three<"Points"> {
    const points = new this.THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = order;
    return points;
  }
}

abstract class ArenaFxPool<V extends ArenaFxVis> {
  protected readonly free: V[] = [];

  constructor(protected readonly kit: ArenaFxKit) {}

  protected abstract build(): V;

  protected warmPaint(vis: V): void {}

  prefill(count: number): void {
    while (this.free.length < count) this.free.push(this.build());
  }

  spareRoots(spot: number): Three<"Group">[] {
    return this.free.map((vis) => {
      vis.root.position.set(spot, 0, spot);
      return vis.root;
    });
  }

  warmSample(): Three<"Group"> {
    const vis = this.build();
    this.warmPaint(vis);
    return vis.root;
  }

  protected take(): V {
    const vis = this.free.pop() || this.build();
    vis.root.visible = true;
    vis.root.userData.fxVis = vis;
    vis.root.userData.fxPool = this;
    this.kit.host.scene().add(vis.root);
    return vis;
  }

  give(vis: V): void {
    vis.root.removeFromParent();
    this.free.push(vis);
  }
}

class BladeTrailShaders {
  static readonly VERTEX = `
    varying vec2 vP;
    void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  static readonly ARC_ZONE_FRAGMENT = `
    uniform float uArc; uniform float uFade; uniform vec3 uBlade; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0 || abs(atan(vP.y, vP.x)) > uArc * 0.5) discard;
      gl_FragColor = vec4(uBlade, (0.13 + 0.5 * smoothstep(0.955, 0.985, r)) * uFade);
      #include <colorspace_fragment>
    }`;
  static readonly ARC_SWOOSH_FRAGMENT = `
    uniform sampler2D uTex; uniform float uArc; uniform float uHead; uniform float uFade; uniform float uThick; uniform float uSeed; uniform vec3 uDeep; uniform vec3 uBlade; uniform vec3 uCore; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      float k = atan(vP.y, vP.x) / uArc + 0.5;
      if (k < 0.0 || k > 1.0) discard;
      float behind = uHead - k;
      if (behind < 0.0) discard;
      float life = max(0.0, 1.0 - behind / 0.85);
      float inner = 1.0 - uThick * (0.25 + 0.75 * life);
      float band = smoothstep(inner, inner + uThick * 0.55, r) * smoothstep(1.0, 0.965, r);
      float streak = texture2D(uTex, vec2(r * 2.2 + uSeed, k * 1.3 - uHead * 0.6)).b;
      float edge = smoothstep(0.86, 0.98, (r - inner) / max(0.001, 1.0 - inner));
      vec3 color = mix(mix(uDeep, uBlade, life), uCore, max(smoothstep(0.03, 0.0, behind), edge * life));
      gl_FragColor = vec4(color, min(1.0, band * 1.25) * sqrt(life) * (0.72 + 0.28 * smoothstep(0.25, 0.65, streak)) * uFade);
      #include <colorspace_fragment>
    }`;
  static readonly LINE_ZONE_FRAGMENT = `
    uniform float uFade; uniform float uLen; uniform float uWide; uniform vec3 uBlade; varying vec2 vP;
    void main() {
      float limit = max(smoothstep(0.5 - 6.0 / uWide, 0.5 - 3.0 / uWide, abs(vP.y)), smoothstep(1.0 - 6.0 / uLen, 1.0 - 3.0 / uLen, vP.x));
      gl_FragColor = vec4(uBlade, (0.12 + 0.5 * limit) * uFade);
      #include <colorspace_fragment>
    }`;
  static readonly THRUST_FRAGMENT = `
    uniform sampler2D uTex; uniform float uHead; uniform float uFade; uniform float uThick; uniform float uLen; uniform float uSeed; uniform vec3 uDeep; uniform vec3 uBlade; uniform vec3 uCore; varying vec2 vP;
    void main() {
      if (vP.x > uHead) discard;
      float n = texture2D(uTex, vec2(vP.x * uLen / 240.0 - uHead * 1.4 + uSeed, vP.y * 0.3 + uSeed)).b;
      float tip = 1.0 - (uHead - vP.x) / max(0.001, uHead);
      float half_ = uThick * (0.12 + 0.88 * tip) * smoothstep(0.0, 0.03, uHead - vP.x + 0.012);
      float across = abs(vP.y);
      if (across > half_) discard;
      float body = 1.0 - across / half_;
      vec3 color = mix(mix(uDeep, uBlade, tip), uCore, body * body * tip);
      gl_FragColor = vec4(color, min(1.0, body * 1.8) * (0.3 + 0.7 * tip) * (0.72 + 0.28 * smoothstep(0.25, 0.65, n)) * uFade);
      #include <colorspace_fragment>
    }`;
  static readonly STAB_FRAGMENT = `
    uniform sampler2D uTex; uniform float uFade; uniform float uSeed; uniform vec3 uDeep; uniform vec3 uBlade; uniform vec3 uCore; varying vec2 vP;
    void main() {
      float n = texture2D(uTex, vec2(vP.x * 1.5 + uSeed, vP.y * 0.3)).b;
      float half_ = 0.46 * (0.2 + 0.8 * sin(vP.x * 3.1416));
      float across = abs(vP.y);
      if (across > half_) discard;
      float body = 1.0 - across / half_;
      gl_FragColor = vec4(mix(mix(uDeep, uBlade, body), uCore, body * body * body), body * (0.65 + 0.35 * n) * uFade);
      #include <colorspace_fragment>
    }`;
}

interface BladeTrailLook {
  blade: number;
  trail: number;
}

interface BladeTrailVis extends ArenaFxVis {
  uniforms: ArenaFxUniforms;
  head: ArenaFxNumberUniform;
  fade: ArenaFxNumberUniform;
  blade: ArenaFxColorUniform;
  deep: ArenaFxColorUniform;
  core: ArenaFxColorUniform;
  thick: ArenaFxNumberUniform;
  seed: ArenaFxNumberUniform;
  zone: Three<"Mesh">;
  swoosh: Three<"Mesh">;
}

abstract class BladeTrailPool extends ArenaFxPool<BladeTrailVis> {
  static readonly ZONE_Y = 2;
  static readonly SWOOSH_Y = 24;

  protected abstract get shape(): ArenaFxShape;
  protected abstract get zoneFragment(): string;
  protected abstract get swooshFragment(): string;
  protected abstract get headEndsAt(): number;

  protected build(): BladeTrailVis {
    const kit = this.kit, head = kit.number(0), fade = kit.number(1), blade = kit.color(0xFFFFFF), deep = kit.color(0x888888), core = kit.color(0xFFFFFF), thick = kit.number(0.3), seed = kit.number(0);
    const uniforms: ArenaFxUniforms = { uTex: kit.noise(), uHead: head, uFade: fade, uBlade: blade, uDeep: deep, uCore: core, uThick: thick, uSeed: seed, uArc: kit.number(1.5), uLen: kit.number(200), uWide: kit.number(50) };
    const zone = kit.mesh(this.shape, kit.soft(uniforms, BladeTrailShaders.VERTEX, this.zoneFragment), 3);
    const swoosh = kit.mesh(this.shape, kit.soft(uniforms, BladeTrailShaders.VERTEX, this.swooshFragment), 6);
    zone.position.y = BladeTrailPool.ZONE_Y;
    swoosh.position.y = BladeTrailPool.SWOOSH_Y;
    const root = new kit.THREE.Group();
    root.add(zone, swoosh);
    return { root, uniforms, head, fade, blade, deep, core, thick, seed, zone, swoosh };
  }

  protected warmPaint(vis: BladeTrailVis): void {
    vis.head.value = 0.5;
  }

  protected dress(vis: BladeTrailVis, x: number, y: number, angle: number, look: BladeTrailLook, seed: number): void {
    vis.root.position.set(x, 0, y);
    vis.root.rotation.y = -angle;
    vis.blade.value.setHex(look.blade);
    vis.deep.value.setHex(look.blade).multiplyScalar(0.42);
    vis.core.value.setHex(look.blade).lerp(BladeTrailPool.WHITE(this.kit), 0.82);
    vis.seed.value = seed;
    vis.head.value = 0;
    vis.fade.value = 1;
  }

  private static whiteColor: Three<"Color"> | null = null;

  private static WHITE(kit: ArenaFxKit): Three<"Color"> {
    return BladeTrailPool.whiteColor || (BladeTrailPool.whiteColor = new kit.THREE.Color(0xFFFFFF));
  }

  paint(vis: BladeTrailVis, f: number): void {
    vis.head.value = Math.min(1.9, f / this.headEndsAt);
    vis.fade.value = 1 - ArenaFxKit.clamp01((f - 0.45) / 0.55);
  }
}

class ArcBladePool extends BladeTrailPool {
  protected get shape() { return this.kit.flat; }
  protected get zoneFragment() { return BladeTrailShaders.ARC_ZONE_FRAGMENT; }
  protected get swooshFragment() { return BladeTrailShaders.ARC_SWOOSH_FRAGMENT; }
  protected get headEndsAt() { return 0.42; }

  swing(x: number, y: number, angle: number, radius: number, arc: number, look: BladeTrailLook, seed: number): BladeTrailVis {
    const vis = this.take();
    this.dress(vis, x, y, angle, look, seed);
    vis.zone.scale.set(radius, 1, radius);
    vis.swoosh.scale.set(radius, 1, radius);
    (vis.uniforms.uArc as ArenaFxNumberUniform).value = arc;
    vis.thick.value = Math.min(0.85, look.trail / radius);
    return vis;
  }
}

class ThrustBladePool extends BladeTrailPool {
  protected get shape() { return this.kit.line; }
  protected get zoneFragment() { return BladeTrailShaders.LINE_ZONE_FRAGMENT; }
  protected get swooshFragment() { return BladeTrailShaders.THRUST_FRAGMENT; }
  protected get headEndsAt() { return 0.3; }

  thrust(x: number, y: number, angle: number, length: number, width: number, look: BladeTrailLook, seed: number): BladeTrailVis {
    const vis = this.take();
    this.dress(vis, x, y, angle, look, seed);
    vis.zone.scale.set(length, 1, width);
    vis.swoosh.scale.set(length, 1, width);
    (vis.uniforms.uLen as ArenaFxNumberUniform).value = length;
    (vis.uniforms.uWide as ArenaFxNumberUniform).value = width;
    vis.thick.value = Math.min(0.5, look.trail / width);
    return vis;
  }

  paint(vis: BladeTrailVis, f: number): void {
    super.paint(vis, f);
    vis.head.value = Math.min(1, vis.head.value);
  }
}

interface StabTrailVis extends ArenaFxVis {
  fade: ArenaFxNumberUniform;
  ribbon: Three<"Mesh">;
}

class StabTrailPool extends ArenaFxPool<StabTrailVis> {
  static readonly WIDTH = 26;
  static readonly TONES = { deep: 0x8A0F14, blade: 0xFF2A2A, core: 0xFFE4DC };

  protected build(): StabTrailVis {
    const kit = this.kit, T = StabTrailPool.TONES, fade = kit.number(1);
    const uniforms: ArenaFxUniforms = { uTex: kit.noise(), uFade: fade, uSeed: kit.number(0.3), uDeep: kit.color(T.deep), uBlade: kit.color(T.blade), uCore: kit.color(T.core) };
    const material = kit.soft(uniforms, BladeTrailShaders.VERTEX, BladeTrailShaders.STAB_FRAGMENT);
    material.depthTest = false;
    const ribbon = kit.mesh(kit.line, material, 6);
    const root = new kit.THREE.Group();
    root.add(ribbon);
    return { root, fade, ribbon };
  }

  start(): StabTrailVis {
    const vis = this.take();
    vis.root.visible = false;
    vis.root.userData.stab = true;
    return vis;
  }

  paint(vis: StabTrailVis, length: number, f: number): void {
    vis.ribbon.scale.set(length, 1, StabTrailPool.WIDTH);
    vis.fade.value = 1 - f * f;
  }
}

class ArenaFxViews {
  readonly arcBlades: ArcBladePool;
  readonly thrustBlades: ThrustBladePool;
  readonly stabs: StabTrailPool;

  constructor(host: ArenaFxHost) {
    const kit = new ArenaFxKit(host);
    this.arcBlades = new ArcBladePool(kit);
    this.thrustBlades = new ThrustBladePool(kit);
    this.stabs = new StabTrailPool(kit);
  }

  private get all(): ArenaFxPool<ArenaFxVis>[] {
    return [this.arcBlades, this.thrustBlades, this.stabs] as ArenaFxPool<ArenaFxVis>[];
  }

  prefillForMatch(): void {
    this.arcBlades.prefill(6);
    this.thrustBlades.prefill(3);
    this.stabs.prefill(2);
  }

  warmSamples(): Three<"Group">[] {
    return this.all.map((pool) => pool.warmSample());
  }

  spareRoots(spot: number): Three<"Group">[] {
    return this.all.reduce<Three<"Group">[]>((roots, pool) => roots.concat(pool.spareRoots(spot)), []);
  }
}
