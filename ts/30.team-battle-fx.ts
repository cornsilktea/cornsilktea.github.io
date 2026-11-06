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
  meteorPath(): { dir: Three<"Vector3">; top: number };
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
      float inner = 1.0 - uThick * (0.45 + 0.55 * life);
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

class ToxicPoolShaders {
  static readonly TONES = { deep: 0x1F6B14, mid: 0x5CC42C, foam: 0xB4EE62, mist: 0x8BD64E };
  static readonly SURFACE_VERTEX = `
    varying vec2 vP;
    void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  static readonly SURFACE_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uR; uniform float uFade; uniform float uFog; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uFoam; uniform vec3 uTeam; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      vec2 spot = vP * uR / 340.0;
      vec4 slow = texture2D(uTex, spot + vec2(uTime * 0.025, -uTime * 0.018));
      vec4 fine = texture2D(uTex, spot * 1.9 - vec2(uTime * 0.04, uTime * 0.03) + slow.rg * 0.06);
      float body = smoothstep(0.97, 0.84, r + (slow.r - 0.5) * 0.2);
      float foam = smoothstep(0.58, 0.92, fine.g * 0.55 + slow.r * 0.3 + fine.r * 0.4) * body * mix(0.8, 0.45, uFog);
      float rim = smoothstep(0.955, 0.975, r);
      vec3 color = mix(mix(mix(uDeep, uMid, slow.r), uFoam, foam), uTeam, rim);
      float fill = mix(0.68 + 0.2 * slow.r, 0.26 + 0.5 * slow.r, uFog);
      gl_FragColor = vec4(color, max(max(body * fill, foam * 0.9), rim * 0.85) * uFade);
      #include <colorspace_fragment>
    }`;
  static readonly BUBBLE_VERTEX = `
    uniform float uR; uniform float uTime; uniform float uPixelScale; varying float vPop;
    void main() {
      float a = position.x * 6.2832, reach = sqrt(position.y) * 0.86 * uR, life = fract(uTime * (0.45 + 0.6 * position.z) + position.x * 7.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * reach, 3.0 + life * 12.0, sin(a) * reach, 1.0);
      gl_PointSize = (6.0 + 9.0 * position.z) * (life < 0.82 ? 0.45 + life * 0.7 : (1.0 - life) * 5.8) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vPop = life;
    }`;
  static readonly BUBBLE_FRAGMENT = `
    uniform float uFade; uniform vec3 uFoam; varying float vPop;
    void main() {
      vec2 q = gl_PointCoord - 0.5;
      float d = length(q);
      if (d > 0.5) discard;
      float shell = smoothstep(0.3, 0.46, d) * smoothstep(0.5, 0.46, d), shine = smoothstep(0.14, 0.03, length(q + vec2(0.15, 0.15)));
      gl_FragColor = vec4(uFoam * 1.25, max(0.2, max(shell, shine)) * uFade);
      #include <colorspace_fragment>
    }`;
  static readonly MIST_VERTEX = `
    uniform float uR; uniform float uTime; uniform float uPixelScale; varying float vFog; varying float vSeed;
    void main() {
      float a = position.x * 6.2832 + uTime * (0.07 + 0.09 * position.z), reach = sqrt(position.y) * 0.84 * uR, life = fract(uTime * 0.11 + position.x * 5.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * reach, 10.0 + life * 44.0, sin(a) * reach, 1.0);
      gl_PointSize = uR * (0.6 + 0.5 * position.z) * (0.8 + 0.5 * life) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vFog = sin(life * 3.1416); vSeed = position.y;
    }`;
  static readonly MIST_FRAGMENT = `
    uniform sampler2D uTex; uniform float uFade; uniform float uTime; uniform vec3 uMist; varying float vFog; varying float vSeed;
    void main() {
      vec2 q = gl_PointCoord - 0.5;
      float d = length(q);
      if (d > 0.5) discard;
      float n = texture2D(uTex, q * 0.28 + vSeed + uTime * 0.02).r;
      gl_FragColor = vec4(uMist, smoothstep(0.5, 0.12, d + (n - 0.5) * 0.3) * vFog * 0.36 * uFade);
      #include <colorspace_fragment>
    }`;
}

interface ToxicPoolVis extends ArenaFxVis {
  surface: Three<"Mesh">;
  bubbles: Three<"Points">;
  mist: Three<"Points">;
  r: ArenaFxNumberUniform;
  fade: ArenaFxNumberUniform;
  fog: ArenaFxNumberUniform;
  time: ArenaFxNumberUniform;
  pixelScale: ArenaFxNumberUniform;
  team: ArenaFxColorUniform;
}

class ToxicPoolPool extends ArenaFxPool<ToxicPoolVis> {
  static readonly BUBBLES = { basic: 6, fog: 14 };
  static readonly MISTS = 14;
  private bubbleSeeds: ArenaFxShape | null = null;
  private mistSeeds: ArenaFxShape | null = null;

  protected build(): ToxicPoolVis {
    const kit = this.kit, S = ToxicPoolShaders, T = S.TONES, r = kit.number(70), fade = kit.number(1), fog = kit.number(0), time = kit.number(0), pixelScale = kit.number(400), team = kit.color(0xFFFFFF);
    const uniforms: ArenaFxUniforms = { uTex: kit.noise(), uR: r, uFade: fade, uFog: fog, uTime: time, uPixelScale: pixelScale, uTeam: team, uDeep: kit.color(T.deep), uMid: kit.color(T.mid), uFoam: kit.color(T.foam), uMist: kit.color(T.mist) };
    const surface = kit.mesh(kit.flat, kit.soft(uniforms, S.SURFACE_VERTEX, S.SURFACE_FRAGMENT), 2);
    surface.position.y = 1.7;
    this.bubbleSeeds = this.bubbleSeeds || kit.seededPoints(ToxicPoolPool.BUBBLES.fog, 43);
    this.mistSeeds = this.mistSeeds || kit.seededPoints(ToxicPoolPool.MISTS, 59);
    const bubbles = kit.points(this.bubbleSeeds, kit.soft(uniforms, S.BUBBLE_VERTEX, S.BUBBLE_FRAGMENT), 4);
    const mist = kit.points(this.mistSeeds, kit.soft(uniforms, S.MIST_VERTEX, S.MIST_FRAGMENT), 5);
    const root = new kit.THREE.Group();
    root.add(surface, bubbles, mist);
    return { root, surface, bubbles, mist, r, fade, fog, time, pixelScale, team };
  }

  spawn(x: number, y: number, radius: number, isFog: boolean, teamHex: number): ToxicPoolVis {
    const vis = this.take();
    vis.root.position.set(x, 0, y);
    vis.r.value = radius;
    vis.fog.value = isFog ? 1 : 0;
    vis.team.value.setHex(teamHex);
    vis.surface.scale.set(radius, 1, radius);
    vis.bubbles.geometry.setDrawRange(0, isFog ? ToxicPoolPool.BUBBLES.fog : ToxicPoolPool.BUBBLES.basic);
    vis.mist.visible = isFog && !this.kit.host.isLite();
    return vis;
  }

  paint(vis: ToxicPoolVis, grow: number, fade: number, nowMs: number): void {
    const scale = 0.55 + 0.45 * grow;
    vis.root.scale.set(scale, 1, scale);
    vis.fade.value = fade;
    vis.time.value = (nowMs % 100000) / 1000;
    vis.pixelScale.value = this.kit.host.pixelScale();
  }
}

class DomainShaders {
  static readonly TONES = { dark: 0x0D0812, crimson: 0xB20F20, rim: 0xFF2433, ember: 0xFF4A3A };
  static readonly FLOOR_VERTEX = ToxicPoolShaders.SURFACE_VERTEX;
  static readonly FLOOR_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uR; uniform float uFade; uniform vec3 uDark; uniform vec3 uCrimson; uniform vec3 uRim; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      vec2 spot = vP * uR / 460.0;
      vec4 cloud = texture2D(uTex, spot + vec2(uTime * 0.012, uTime * 0.008));
      vec4 lace = texture2D(uTex, spot * 1.5 - vec2(uTime * 0.018, 0.0) + cloud.rg * 0.04);
      float crack = smoothstep(0.52, 0.8, lace.g + cloud.r * 0.14);
      float arm = smoothstep(0.74, 1.0, 0.5 + 0.5 * sin(atan(vP.y, vP.x) * 5.0 + log(r + 0.08) * 7.0 - uTime * 1.5)) * smoothstep(1.0, 0.25, r);
      float rim = smoothstep(0.966, 0.984, r);
      vec3 color = mix(mix(uDark, uCrimson, max(crack, arm * 0.6)), uRim, rim);
      gl_FragColor = vec4(color, max(0.46 + crack * 0.4 + arm * 0.2, rim) * uFade);
      #include <colorspace_fragment>
    }`;
  static readonly DOME_VERTEX = `
    varying vec2 vUv; varying float vFacing;
    void main() {
      vUv = uv;
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-view.xyz)));
      gl_Position = projectionMatrix * view;
    }`;
  static readonly DOME_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uFade; uniform vec3 uDark; uniform vec3 uCrimson; varying vec2 vUv; varying float vFacing;
    void main() {
      float veil = texture2D(uTex, vec2(vUv.x * 4.0 + uTime * 0.03, vUv.y * 1.4 - uTime * 0.07)).r;
      float edge = 1.0 - vFacing;
      edge *= edge;
      gl_FragColor = vec4(mix(uDark, uCrimson, min(1.0, edge * 1.1 + veil * 0.25)), (0.14 + 0.68 * edge + veil * 0.12) * uFade);
      #include <colorspace_fragment>
    }`;
  static readonly EMBER_VERTEX = `
    uniform float uTime; uniform float uPixelScale; varying float vLife;
    void main() {
      float a = position.x * 6.2832, reach = sqrt(position.y) * 0.95, life = fract(uTime * (0.16 + 0.2 * position.z) + position.x * 3.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * reach, 0.01 + life * 0.34, sin(a) * reach, 1.0);
      gl_PointSize = (5.0 + 8.0 * position.z) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vLife = sin(life * 3.1416);
    }`;
  static readonly EMBER_FRAGMENT = `
    uniform float uFade; uniform vec3 uEmber; varying float vLife;
    void main() {
      gl_FragColor = vec4(uEmber, smoothstep(0.5, 0.12, length(gl_PointCoord - 0.5)) * vLife * uFade);
      #include <colorspace_fragment>
    }`;
}

interface DomainVis extends ArenaFxVis {
  embers: Three<"Points">;
  r: ArenaFxNumberUniform;
  fade: ArenaFxNumberUniform;
  time: ArenaFxNumberUniform;
  pixelScale: ArenaFxNumberUniform;
}

class DomainPool extends ArenaFxPool<DomainVis> {
  static readonly EMBERS = 30;
  private domeShape: ArenaFxShape | null = null;
  private emberSeeds: ArenaFxShape | null = null;

  protected build(): DomainVis {
    const kit = this.kit, S = DomainShaders, T = S.TONES, r = kit.number(100), fade = kit.number(1), time = kit.number(0), pixelScale = kit.number(400);
    const uniforms: ArenaFxUniforms = { uTex: kit.noise(), uR: r, uFade: fade, uTime: time, uPixelScale: pixelScale, uDark: kit.color(T.dark), uCrimson: kit.color(T.crimson), uRim: kit.color(T.rim), uEmber: kit.color(T.ember) };
    this.domeShape = this.domeShape || new kit.THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    this.emberSeeds = this.emberSeeds || kit.seededPoints(DomainPool.EMBERS, 71);
    const floor = kit.mesh(kit.flat, kit.soft(uniforms, S.FLOOR_VERTEX, S.FLOOR_FRAGMENT), 1);
    floor.position.y = 0.004;
    const dome = kit.mesh(this.domeShape, kit.soft(uniforms, S.DOME_VERTEX, S.DOME_FRAGMENT), 7);
    const embers = kit.points(this.emberSeeds, kit.soft(uniforms, S.EMBER_VERTEX, S.EMBER_FRAGMENT), 8);
    const root = new kit.THREE.Group();
    root.add(floor, dome, embers);
    return { root, embers, r, fade, time, pixelScale };
  }

  spawn(): DomainVis {
    const vis = this.take();
    vis.embers.visible = !this.kit.host.isLite();
    return vis;
  }

  paint(vis: DomainVis, x: number, y: number, radius: number, fade: number, nowMs: number): void {
    vis.root.position.set(x, 0, y);
    vis.root.scale.setScalar(radius);
    vis.r.value = radius;
    vis.fade.value = fade;
    vis.time.value = (nowMs % 100000) / 1000;
    vis.pixelScale.value = this.kit.host.pixelScale();
  }
}

class SkyBeamShaders {
  static readonly BEAM_VERTEX = DomainShaders.DOME_VERTEX;
  static readonly BEAM_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uFade; uniform float uCore; uniform vec3 uTint; uniform vec3 uCoreTint; varying vec2 vUv; varying float vFacing;
    void main() {
      float fall = smoothstep(1.0, 0.45, vUv.y) * 0.75 + 0.25 * (1.0 - vUv.y);
      float core = pow(vFacing, 4.0 / uCore);
      float stream = texture2D(uTex, vec2(vUv.x * 4.0, vUv.y * 2.2 + uTime * 1.1)).b;
      gl_FragColor = vec4(mix(uTint, uCoreTint, core), (0.42 + 0.58 * core) * (0.78 + 0.42 * stream) * fall * uFade);
      #include <colorspace_fragment>
    }`;
  static readonly PAD_FRAGMENT = `
    uniform float uTime; uniform float uFade; uniform vec3 uTint; uniform vec3 uCoreTint; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      float ring = smoothstep(0.16, 0.0, abs(fract(r * 2.0 - uTime * 0.9) - 0.5));
      gl_FragColor = vec4(mix(uTint, uCoreTint, ring), (0.26 + 0.56 * ring) * smoothstep(1.0, 0.3, r) * uFade);
      #include <colorspace_fragment>
    }`;
}

class SkyBeamMaker {
  static readonly RADIUS = 26;
  static readonly PAD_R = 34;

  constructor(private readonly kit: ArenaFxKit) {}

  build(color: number, coreColor: number, ash: boolean, cylinder: ArenaFxShape): Three<"Group"> {
    const kit = this.kit, fade = kit.number(1), time = kit.number(0), core = kit.number(1);
    const uniforms: ArenaFxUniforms = { uTex: kit.noise(), uFade: fade, uTime: time, uCore: core, uTint: kit.color(color), uCoreTint: kit.color(coreColor) };
    const beamMat = kit.soft(uniforms, SkyBeamShaders.BEAM_VERTEX, SkyBeamShaders.BEAM_FRAGMENT);
    const padMat = kit.soft(uniforms, ToxicPoolShaders.SURFACE_VERTEX, SkyBeamShaders.PAD_FRAGMENT);
    if (!ash) beamMat.blending = padMat.blending = kit.THREE.AdditiveBlending;
    const beam = kit.mesh(cylinder, beamMat, 6);
    beam.scale.set(SkyBeamMaker.RADIUS, 1, SkyBeamMaker.RADIUS);
    const pad = kit.mesh(kit.flat, padMat, 3);
    pad.scale.set(SkyBeamMaker.PAD_R, 1, SkyBeamMaker.PAD_R);
    const root = new kit.THREE.Group();
    root.add(beam, pad);
    root.userData.beam = { beam, pad, fade, time, core };
    return root;
  }
}

class StarfallShaders {
  static readonly ZONE_FRAGMENT = `
    uniform sampler2D uTex; uniform float uR; uniform float uK; uniform float uTime; uniform float uPulse; uniform vec3 uDeep; uniform vec3 uTint; uniform vec3 uHot; uniform vec3 uTeam; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      vec4 slow = texture2D(uTex, vP * uR / 380.0 + vec2(uTime * 0.04, -uTime * 0.03));
      float fill = smoothstep(uK + 0.04, uK - 0.05, r + (slow.r - 0.5) * 0.14 * uK);
      float twinkle = smoothstep(0.62, 0.86, texture2D(uTex, vP * uR / 150.0 - uTime * 0.06).g) * fill;
      float rim = smoothstep(0.955, 0.98, r);
      vec3 color = mix(mix(mix(uDeep, uTint, fill), uHot, twinkle), uTeam, rim);
      gl_FragColor = vec4(color, max(0.14 + fill * 0.34 + twinkle * 0.5, rim * uPulse));
      #include <colorspace_fragment>
    }`;
  static readonly HEAD_VERTEX = `
    uniform float uSize; varying vec2 vP;
    void main() {
      vP = position.xy;
      vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      center.xy += position.xy * uSize;
      gl_Position = projectionMatrix * center;
    }`;
  static readonly HEAD_FRAGMENT = `
    uniform float uTime; uniform vec3 uTint; uniform vec3 uHot; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      float a = atan(vP.y, vP.x);
      float rays = pow(abs(cos(a * 2.0 + uTime * 2.0)), 18.0) * smoothstep(1.0, 0.15, r);
      float core = smoothstep(0.36, 0.14, r), glow = smoothstep(1.0, 0.18, r);
      gl_FragColor = vec4(mix(uTint, uHot, max(core, rays)), max(max(core, rays), glow * glow * 0.65));
      #include <colorspace_fragment>
    }`;
  static readonly TAIL_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform vec3 uDeep; uniform vec3 uTint; uniform vec3 uHot; varying vec2 vUv; varying float vFacing;
    void main() {
      float n = texture2D(uTex, vec2(vUv.x * 3.0, vUv.y * 1.6 + uTime * 2.6)).r;
      float flame = n * 0.7 + 0.6 - vUv.y * 1.15;
      float body = smoothstep(0.26, 0.58, flame) * smoothstep(0.03, 0.34, vFacing);
      gl_FragColor = vec4(mix(mix(uDeep, uTint, smoothstep(0.1, 0.5, flame)), uHot, smoothstep(0.62, 0.98, flame)), body * 0.92);
      #include <colorspace_fragment>
    }`;
  static readonly DUST_VERTEX = `
    uniform float uTime; uniform float uPixelScale; uniform float uTailLen; uniform vec3 uDir; varying float vLife;
    void main() {
      float life = fract(position.x + uTime * (1.2 + position.y)), a = position.z * 6.2832;
      vec3 side = vec3(cos(a), 0.0, sin(a)) * (8.0 + 22.0 * position.y);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(uDir * (12.0 + life * uTailLen) + side, 1.0);
      gl_PointSize = (3.0 + 6.0 * position.y) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vLife = (1.0 - life) * min(1.0, life * 8.0);
    }`;
  static readonly DUST_FRAGMENT = `
    uniform vec3 uHot; varying float vLife;
    void main() {
      vec2 q = abs(gl_PointCoord - 0.5);
      if (q.x + q.y > 0.5) discard;
      gl_FragColor = vec4(uHot, vLife);
      #include <colorspace_fragment>
    }`;
}

interface StarfallVis extends ArenaFxVis {
  star: Three<"Group">;
  dust: Three<"Points">;
  r: ArenaFxNumberUniform;
  k: ArenaFxNumberUniform;
  time: ArenaFxNumberUniform;
  pulse: ArenaFxNumberUniform;
  pixelScale: ArenaFxNumberUniform;
  deep: ArenaFxColorUniform;
  tint: ArenaFxColorUniform;
  hot: ArenaFxColorUniform;
  team: ArenaFxColorUniform;
}

interface StarfallPath {
  dir: Three<"Vector3">;
  top: number;
}

class StarfallPool extends ArenaFxPool<StarfallVis> {
  static readonly STAR_R = 13;
  static readonly TAIL = 200;
  static readonly HEAD_SIZE = 32;
  static readonly DUST = 18;
  static readonly TONES = { deep: 0x2A1259, tint: 0xB07CFF, hot: 0xF6EEFF };
  static readonly STUN_TONES = { deep: 0x4A2E08, tint: 0xFFD35A, hot: 0xFFF7D6 };
  private tailShape: ArenaFxShape | null = null;
  private headShape: ArenaFxShape | null = null;
  private dustSeeds: ArenaFxShape | null = null;

  constructor(kit: ArenaFxKit, private readonly path: () => StarfallPath) {
    super(kit);
  }

  private shapes() {
    const kit = this.kit;
    if (!this.tailShape) {
      this.tailShape = new kit.THREE.CylinderGeometry(0, 1, 1, 12, 4, true);
      this.tailShape.translate(0, 0.5, 0);
      this.headShape = new kit.THREE.PlaneGeometry(2, 2);
      this.dustSeeds = kit.seededPoints(StarfallPool.DUST, 97);
    }
    return { tail: this.tailShape, head: this.headShape as ArenaFxShape, dust: this.dustSeeds as ArenaFxShape };
  }

  protected build(): StarfallVis {
    const kit = this.kit, S = StarfallShaders, shapes = this.shapes(), path = this.path(), T = StarfallPool.TONES;
    const r = kit.number(100), k = kit.number(0), time = kit.number(0), pulse = kit.number(0.8), pixelScale = kit.number(400), deep = kit.color(T.deep), tint = kit.color(T.tint), hot = kit.color(T.hot), team = kit.color(0xFFFFFF);
    const uniforms: ArenaFxUniforms = { uTex: kit.noise(), uR: r, uK: k, uTime: time, uPulse: pulse, uPixelScale: pixelScale, uDeep: deep, uTint: tint, uHot: hot, uTeam: team, uSize: kit.number(StarfallPool.HEAD_SIZE), uTailLen: kit.number(StarfallPool.TAIL), uDir: { value: path.dir } };
    const zone = kit.mesh(kit.flat, kit.soft(uniforms, BladeTrailShaders.VERTEX, S.ZONE_FRAGMENT), 2);
    zone.position.y = 2.2;
    const scaleZone = zone;
    const head = kit.mesh(shapes.head, kit.soft(uniforms, S.HEAD_VERTEX, S.HEAD_FRAGMENT, kit.THREE.DoubleSide), 8);
    const tail = kit.mesh(shapes.tail, kit.soft(uniforms, DomainShaders.DOME_VERTEX, S.TAIL_FRAGMENT, kit.THREE.DoubleSide), 7);
    tail.quaternion.setFromUnitVectors(new kit.THREE.Vector3(0, 1, 0), path.dir);
    tail.scale.set(StarfallPool.STAR_R, StarfallPool.TAIL, StarfallPool.STAR_R);
    const dust = kit.points(shapes.dust, kit.soft(uniforms, S.DUST_VERTEX, S.DUST_FRAGMENT), 9);
    const star = new kit.THREE.Group();
    star.add(tail, dust, head);
    const root = new kit.THREE.Group();
    root.add(scaleZone, star);
    root.userData.zone = zone;
    return { root, star, dust, r, k, time, pulse, pixelScale, deep, tint, hot, team };
  }

  protected warmPaint(vis: StarfallVis): void {
    vis.k.value = 0.5;
  }

  spawn(x: number, y: number, radius: number, stuns: boolean, teamHex: number): StarfallVis {
    const vis = this.take(), T = stuns ? StarfallPool.STUN_TONES : StarfallPool.TONES;
    vis.root.position.set(x, 0, y);
    vis.root.userData.zone.scale.set(radius, 1, radius);
    vis.r.value = radius;
    vis.deep.value.setHex(T.deep);
    vis.tint.value.setHex(T.tint);
    vis.hot.value.setHex(T.hot);
    vis.team.value.setHex(teamHex);
    vis.dust.visible = !this.kit.host.isLite();
    return vis;
  }

  paint(vis: StarfallVis, k: number, nowMs: number): void {
    const path = this.path(), R = StarfallPool.STAR_R, lift = path.top * (1 - k * k) + R;
    vis.k.value = k;
    vis.time.value = (nowMs % 100000) / 1000;
    vis.pulse.value = 0.55 + 0.4 * Math.sin(nowMs / 60);
    vis.pixelScale.value = this.kit.host.pixelScale();
    vis.star.position.set(path.dir.x / path.dir.y * (lift - R), lift, path.dir.z / path.dir.y * (lift - R));
  }
}

class LungeBandShaders {
  static readonly FRAGMENT = `
    uniform float uK; uniform float uTime; uniform float uLen; uniform float uWide; uniform vec3 uDeep; uniform vec3 uHot; uniform vec3 uCore; varying vec2 vP;
    void main() {
      float across = abs(vP.y);
      float limit = max(smoothstep(0.5 - 9.0 / uWide, 0.5 - 5.0 / uWide, across), smoothstep(1.0 - 9.0 / uLen, 1.0 - 5.0 / uLen, vP.x));
      float filled = smoothstep(uK + 0.012, uK - 0.012, vP.x);
      float chevron = smoothstep(0.55, 0.9, 0.5 + 0.5 * sin((vP.x * uLen - across * uWide * 0.9) / 11.0 - uTime * 9.0));
      float front = smoothstep(0.03, 0.0, abs(vP.x - uK));
      vec3 color = mix(mix(uDeep, uHot, max(limit, filled * chevron)), uCore, front);
      gl_FragColor = vec4(color, max(max(limit * (0.65 + 0.3 * uK), 0.14 + filled * (0.26 + 0.42 * chevron)), front));
      #include <colorspace_fragment>
    }`;
}

interface LungeBandVis extends ArenaFxVis {
  band: Three<"Mesh">;
  k: ArenaFxNumberUniform;
  time: ArenaFxNumberUniform;
  len: ArenaFxNumberUniform;
  wide: ArenaFxNumberUniform;
}

class LungeBandPool extends ArenaFxPool<LungeBandVis> {
  static readonly Y = 2.6;
  static readonly TONES = { deep: 0x7A0E08, hot: 0xFF2A1F, core: 0xFFD9B0 };

  protected build(): LungeBandVis {
    const kit = this.kit, T = LungeBandPool.TONES, k = kit.number(0), time = kit.number(0), len = kit.number(200), wide = kit.number(100);
    const uniforms: ArenaFxUniforms = { uK: k, uTime: time, uLen: len, uWide: wide, uDeep: kit.color(T.deep), uHot: kit.color(T.hot), uCore: kit.color(T.core) };
    const band = kit.mesh(kit.line, kit.soft(uniforms, BladeTrailShaders.VERTEX, LungeBandShaders.FRAGMENT), 3);
    const root = new kit.THREE.Group();
    root.add(band);
    return { root, band, k, time, len, wide };
  }

  protected warmPaint(vis: LungeBandVis): void {
    vis.k.value = 0.5;
  }

  spawn(x: number, y: number, angle: number, length: number, width: number): LungeBandVis {
    const vis = this.take();
    vis.root.position.set(x, LungeBandPool.Y, y);
    vis.root.rotation.y = -angle;
    vis.band.scale.set(length, 1, width);
    vis.len.value = length;
    vis.wide.value = width;
    return vis;
  }

  paint(vis: LungeBandVis, k: number, nowMs: number): void {
    vis.k.value = k;
    vis.time.value = (nowMs % 100000) / 1000;
  }
}

class ArenaFxViews {
  readonly arcBlades: ArcBladePool;
  readonly thrustBlades: ThrustBladePool;
  readonly stabs: StabTrailPool;
  readonly toxicPools: ToxicPoolPool;
  readonly domains: DomainPool;
  readonly skyBeams: SkyBeamMaker;
  readonly starfalls: StarfallPool;
  readonly lungeBands: LungeBandPool;

  constructor(host: ArenaFxHost) {
    const kit = new ArenaFxKit(host);
    this.arcBlades = new ArcBladePool(kit);
    this.thrustBlades = new ThrustBladePool(kit);
    this.stabs = new StabTrailPool(kit);
    this.toxicPools = new ToxicPoolPool(kit);
    this.domains = new DomainPool(kit);
    this.skyBeams = new SkyBeamMaker(kit);
    this.starfalls = new StarfallPool(kit, () => host.meteorPath());
    this.lungeBands = new LungeBandPool(kit);
  }

  private get all(): ArenaFxPool<ArenaFxVis>[] {
    return [this.arcBlades, this.thrustBlades, this.stabs, this.toxicPools, this.domains, this.starfalls, this.lungeBands] as ArenaFxPool<ArenaFxVis>[];
  }

  prefillForMatch(counts: { toxicPools: number; domains: number; starfalls: number }): void {
    this.arcBlades.prefill(6);
    this.thrustBlades.prefill(3);
    this.stabs.prefill(2);
    this.lungeBands.prefill(2);
    this.toxicPools.prefill(counts.toxicPools);
    this.domains.prefill(counts.domains);
    this.starfalls.prefill(counts.starfalls);
  }

  warmSamples(): Three<"Group">[] {
    return this.all.map((pool) => pool.warmSample());
  }

  spareRoots(spot: number): Three<"Group">[] {
    return this.all.reduce<Three<"Group">[]>((roots, pool) => roots.concat(pool.spareRoots(spot)), []);
  }
}
