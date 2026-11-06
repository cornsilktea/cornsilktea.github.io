"use strict";
class ArenaFxKit {
    constructor(host) {
        this.host = host;
        this.flatShape = null;
        this.lineShape = null;
        this.THREE = host.THREE;
    }
    static hash(x, y) {
        const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        return h - Math.floor(h);
    }
    static clamp01(k) {
        return Math.max(0, Math.min(1, k));
    }
    get flat() {
        if (!this.flatShape) {
            this.flatShape = new this.THREE.PlaneGeometry(2, 2);
            this.flatShape.rotateX(-Math.PI / 2);
        }
        return this.flatShape;
    }
    get line() {
        if (!this.lineShape) {
            this.lineShape = new this.THREE.PlaneGeometry(1, 1);
            this.lineShape.rotateX(-Math.PI / 2);
            this.lineShape.translate(0.5, 0, 0);
        }
        return this.lineShape;
    }
    number(value) {
        return { value };
    }
    color(hex) {
        return { value: new this.THREE.Color(hex) };
    }
    noise() {
        return { value: this.host.noise() };
    }
    soft(uniforms, vertexShader, fragmentShader, side) {
        return new this.THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, side: side === undefined ? this.THREE.FrontSide : side });
    }
    mesh(geometry, material, order) {
        const mesh = new this.THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        mesh.renderOrder = order;
        return mesh;
    }
    seededPoints(count, salt) {
        const seeds = [];
        for (let i = 0; i < count; i++)
            seeds.push(ArenaFxKit.hash(i + salt, 3), ArenaFxKit.hash(i + salt * 2, 7), ArenaFxKit.hash(i + salt * 3, 11));
        const geometry = new this.THREE.BufferGeometry();
        geometry.setAttribute("position", new this.THREE.Float32BufferAttribute(seeds, 3));
        return geometry;
    }
    points(geometry, material, order) {
        const points = new this.THREE.Points(geometry, material);
        points.frustumCulled = false;
        points.renderOrder = order;
        return points;
    }
}
class ArenaFxPool {
    constructor(kit) {
        this.kit = kit;
        this.free = [];
    }
    warmPaint(vis) { }
    prefill(count) {
        while (this.free.length < count)
            this.free.push(this.build());
    }
    spareRoots(spot) {
        return this.free.map((vis) => {
            vis.root.position.set(spot, 0, spot);
            return vis.root;
        });
    }
    warmSample() {
        const vis = this.build();
        this.warmPaint(vis);
        return vis.root;
    }
    take() {
        const vis = this.free.pop() || this.build();
        vis.root.visible = true;
        vis.root.userData.fxVis = vis;
        vis.root.userData.fxPool = this;
        this.kit.host.scene().add(vis.root);
        return vis;
    }
    give(vis) {
        vis.root.removeFromParent();
        this.free.push(vis);
    }
}
class BladeTrailShaders {
}
BladeTrailShaders.VERTEX = `
    varying vec2 vP;
    void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
BladeTrailShaders.ARC_ZONE_FRAGMENT = `
    uniform float uArc; uniform float uFade; uniform vec3 uBlade; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0 || abs(atan(vP.y, vP.x)) > uArc * 0.5) discard;
      gl_FragColor = vec4(uBlade, (0.13 + 0.5 * smoothstep(0.955, 0.985, r)) * uFade);
      #include <colorspace_fragment>
    }`;
BladeTrailShaders.ARC_SWOOSH_FRAGMENT = `
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
BladeTrailShaders.LINE_ZONE_FRAGMENT = `
    uniform float uFade; uniform float uLen; uniform float uWide; uniform vec3 uBlade; varying vec2 vP;
    void main() {
      float limit = max(smoothstep(0.5 - 6.0 / uWide, 0.5 - 3.0 / uWide, abs(vP.y)), smoothstep(1.0 - 6.0 / uLen, 1.0 - 3.0 / uLen, vP.x));
      gl_FragColor = vec4(uBlade, (0.12 + 0.5 * limit) * uFade);
      #include <colorspace_fragment>
    }`;
BladeTrailShaders.THRUST_FRAGMENT = `
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
BladeTrailShaders.STAB_FRAGMENT = `
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
class BladeTrailPool extends ArenaFxPool {
    build() {
        const kit = this.kit, head = kit.number(0), fade = kit.number(1), blade = kit.color(0xFFFFFF), deep = kit.color(0x888888), core = kit.color(0xFFFFFF), thick = kit.number(0.3), seed = kit.number(0);
        const uniforms = { uTex: kit.noise(), uHead: head, uFade: fade, uBlade: blade, uDeep: deep, uCore: core, uThick: thick, uSeed: seed, uArc: kit.number(1.5), uLen: kit.number(200), uWide: kit.number(50) };
        const zone = kit.mesh(this.shape, kit.soft(uniforms, BladeTrailShaders.VERTEX, this.zoneFragment), 3);
        const swoosh = kit.mesh(this.shape, kit.soft(uniforms, BladeTrailShaders.VERTEX, this.swooshFragment), 6);
        zone.position.y = BladeTrailPool.ZONE_Y;
        swoosh.position.y = BladeTrailPool.SWOOSH_Y;
        const root = new kit.THREE.Group();
        root.add(zone, swoosh);
        return { root, uniforms, head, fade, blade, deep, core, thick, seed, zone, swoosh };
    }
    warmPaint(vis) {
        vis.head.value = 0.5;
    }
    dress(vis, x, y, angle, look, seed) {
        vis.root.position.set(x, 0, y);
        vis.root.rotation.y = -angle;
        vis.blade.value.setHex(look.blade);
        vis.deep.value.setHex(look.blade).multiplyScalar(0.42);
        vis.core.value.setHex(look.blade).lerp(BladeTrailPool.white(this.kit), 0.82);
        vis.seed.value = seed;
        vis.head.value = 0;
        vis.fade.value = 1;
    }
    static white(kit) {
        return BladeTrailPool.whiteColor || (BladeTrailPool.whiteColor = new kit.THREE.Color(0xFFFFFF));
    }
    paint(vis, f) {
        vis.head.value = Math.min(1.9, f / this.headEndsAt);
        vis.fade.value = 1 - ArenaFxKit.clamp01((f - 0.45) / 0.55);
    }
}
BladeTrailPool.ZONE_Y = 2;
BladeTrailPool.SWOOSH_Y = 24;
BladeTrailPool.whiteColor = null;
class ArcBladePool extends BladeTrailPool {
    get shape() { return this.kit.flat; }
    get zoneFragment() { return BladeTrailShaders.ARC_ZONE_FRAGMENT; }
    get swooshFragment() { return BladeTrailShaders.ARC_SWOOSH_FRAGMENT; }
    get headEndsAt() { return 0.42; }
    swing(x, y, angle, radius, arc, look, seed) {
        const vis = this.take();
        this.dress(vis, x, y, angle, look, seed);
        vis.zone.scale.set(radius, 1, radius);
        vis.swoosh.scale.set(radius, 1, radius);
        vis.uniforms.uArc.value = arc;
        vis.thick.value = Math.min(0.85, look.trail / radius);
        return vis;
    }
}
class ThrustBladePool extends BladeTrailPool {
    get shape() { return this.kit.line; }
    get zoneFragment() { return BladeTrailShaders.LINE_ZONE_FRAGMENT; }
    get swooshFragment() { return BladeTrailShaders.THRUST_FRAGMENT; }
    get headEndsAt() { return 0.3; }
    thrust(x, y, angle, length, width, look, seed) {
        const vis = this.take();
        this.dress(vis, x, y, angle, look, seed);
        vis.zone.scale.set(length, 1, width);
        vis.swoosh.scale.set(length, 1, width);
        vis.uniforms.uLen.value = length;
        vis.uniforms.uWide.value = width;
        vis.thick.value = Math.min(0.5, look.trail / width);
        return vis;
    }
    paint(vis, f) {
        super.paint(vis, f);
        vis.head.value = Math.min(1, vis.head.value);
    }
}
class StabTrailPool extends ArenaFxPool {
    build() {
        const kit = this.kit, T = StabTrailPool.TONES, fade = kit.number(1);
        const uniforms = { uTex: kit.noise(), uFade: fade, uSeed: kit.number(0.3), uDeep: kit.color(T.deep), uBlade: kit.color(T.blade), uCore: kit.color(T.core) };
        const material = kit.soft(uniforms, BladeTrailShaders.VERTEX, BladeTrailShaders.STAB_FRAGMENT);
        material.depthTest = false;
        const ribbon = kit.mesh(kit.line, material, 6);
        const root = new kit.THREE.Group();
        root.add(ribbon);
        return { root, fade, ribbon };
    }
    start() {
        const vis = this.take();
        vis.root.visible = false;
        vis.root.userData.stab = true;
        return vis;
    }
    paint(vis, length, f) {
        vis.ribbon.scale.set(length, 1, StabTrailPool.WIDTH);
        vis.fade.value = 1 - f * f;
    }
}
StabTrailPool.WIDTH = 26;
StabTrailPool.TONES = { deep: 0x8A0F14, blade: 0xFF2A2A, core: 0xFFE4DC };
class ToxicPoolShaders {
}
ToxicPoolShaders.TONES = { deep: 0x1F6B14, mid: 0x5CC42C, foam: 0xB4EE62, mist: 0x8BD64E };
ToxicPoolShaders.SURFACE_VERTEX = `
    varying vec2 vP;
    void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
ToxicPoolShaders.SURFACE_FRAGMENT = `
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
ToxicPoolShaders.BUBBLE_VERTEX = `
    uniform float uR; uniform float uTime; uniform float uPixelScale; varying float vPop;
    void main() {
      float a = position.x * 6.2832, reach = sqrt(position.y) * 0.86 * uR, life = fract(uTime * (0.45 + 0.6 * position.z) + position.x * 7.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * reach, 3.0 + life * 12.0, sin(a) * reach, 1.0);
      gl_PointSize = (6.0 + 9.0 * position.z) * (life < 0.82 ? 0.45 + life * 0.7 : (1.0 - life) * 5.8) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vPop = life;
    }`;
ToxicPoolShaders.BUBBLE_FRAGMENT = `
    uniform float uFade; uniform vec3 uFoam; varying float vPop;
    void main() {
      vec2 q = gl_PointCoord - 0.5;
      float d = length(q);
      if (d > 0.5) discard;
      float shell = smoothstep(0.3, 0.46, d) * smoothstep(0.5, 0.46, d), shine = smoothstep(0.14, 0.03, length(q + vec2(0.15, 0.15)));
      gl_FragColor = vec4(uFoam * 1.25, max(0.2, max(shell, shine)) * uFade);
      #include <colorspace_fragment>
    }`;
ToxicPoolShaders.MIST_VERTEX = `
    uniform float uR; uniform float uTime; uniform float uPixelScale; varying float vFog; varying float vSeed;
    void main() {
      float a = position.x * 6.2832 + uTime * (0.07 + 0.09 * position.z), reach = sqrt(position.y) * 0.84 * uR, life = fract(uTime * 0.11 + position.x * 5.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * reach, 10.0 + life * 44.0, sin(a) * reach, 1.0);
      gl_PointSize = uR * (0.6 + 0.5 * position.z) * (0.8 + 0.5 * life) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vFog = sin(life * 3.1416); vSeed = position.y;
    }`;
ToxicPoolShaders.MIST_FRAGMENT = `
    uniform sampler2D uTex; uniform float uFade; uniform float uTime; uniform vec3 uMist; varying float vFog; varying float vSeed;
    void main() {
      vec2 q = gl_PointCoord - 0.5;
      float d = length(q);
      if (d > 0.5) discard;
      float n = texture2D(uTex, q * 0.28 + vSeed + uTime * 0.02).r;
      gl_FragColor = vec4(uMist, smoothstep(0.5, 0.12, d + (n - 0.5) * 0.3) * vFog * 0.36 * uFade);
      #include <colorspace_fragment>
    }`;
class ToxicPoolPool extends ArenaFxPool {
    constructor() {
        super(...arguments);
        this.bubbleSeeds = null;
        this.mistSeeds = null;
    }
    build() {
        const kit = this.kit, S = ToxicPoolShaders, T = S.TONES, r = kit.number(70), fade = kit.number(1), fog = kit.number(0), time = kit.number(0), pixelScale = kit.number(400), team = kit.color(0xFFFFFF);
        const uniforms = { uTex: kit.noise(), uR: r, uFade: fade, uFog: fog, uTime: time, uPixelScale: pixelScale, uTeam: team, uDeep: kit.color(T.deep), uMid: kit.color(T.mid), uFoam: kit.color(T.foam), uMist: kit.color(T.mist) };
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
    spawn(x, y, radius, isFog, teamHex) {
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
    paint(vis, grow, fade, nowMs) {
        const scale = 0.55 + 0.45 * grow;
        vis.root.scale.set(scale, 1, scale);
        vis.fade.value = fade;
        vis.time.value = (nowMs % 100000) / 1000;
        vis.pixelScale.value = this.kit.host.pixelScale();
    }
}
ToxicPoolPool.BUBBLES = { basic: 6, fog: 14 };
ToxicPoolPool.MISTS = 14;
class DomainShaders {
}
DomainShaders.TONES = { dark: 0x0D0812, crimson: 0xB20F20, rim: 0xFF2433, ember: 0xFF4A3A };
DomainShaders.FLOOR_VERTEX = ToxicPoolShaders.SURFACE_VERTEX;
DomainShaders.FLOOR_FRAGMENT = `
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
DomainShaders.DOME_VERTEX = `
    varying vec2 vUv; varying float vFacing;
    void main() {
      vUv = uv;
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-view.xyz)));
      gl_Position = projectionMatrix * view;
    }`;
DomainShaders.DOME_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uFade; uniform vec3 uDark; uniform vec3 uCrimson; varying vec2 vUv; varying float vFacing;
    void main() {
      float veil = texture2D(uTex, vec2(vUv.x * 4.0 + uTime * 0.03, vUv.y * 1.4 - uTime * 0.07)).r;
      float edge = 1.0 - vFacing;
      edge *= edge;
      gl_FragColor = vec4(mix(uDark, uCrimson, min(1.0, edge * 1.1 + veil * 0.25)), (0.14 + 0.68 * edge + veil * 0.12) * uFade);
      #include <colorspace_fragment>
    }`;
DomainShaders.EMBER_VERTEX = `
    uniform float uTime; uniform float uPixelScale; varying float vLife;
    void main() {
      float a = position.x * 6.2832, reach = sqrt(position.y) * 0.95, life = fract(uTime * (0.16 + 0.2 * position.z) + position.x * 3.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * reach, 0.01 + life * 0.34, sin(a) * reach, 1.0);
      gl_PointSize = (5.0 + 8.0 * position.z) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vLife = sin(life * 3.1416);
    }`;
DomainShaders.EMBER_FRAGMENT = `
    uniform float uFade; uniform vec3 uEmber; varying float vLife;
    void main() {
      gl_FragColor = vec4(uEmber, smoothstep(0.5, 0.12, length(gl_PointCoord - 0.5)) * vLife * uFade);
      #include <colorspace_fragment>
    }`;
class DomainPool extends ArenaFxPool {
    constructor() {
        super(...arguments);
        this.domeShape = null;
        this.emberSeeds = null;
    }
    build() {
        const kit = this.kit, S = DomainShaders, T = S.TONES, r = kit.number(100), fade = kit.number(1), time = kit.number(0), pixelScale = kit.number(400);
        const uniforms = { uTex: kit.noise(), uR: r, uFade: fade, uTime: time, uPixelScale: pixelScale, uDark: kit.color(T.dark), uCrimson: kit.color(T.crimson), uRim: kit.color(T.rim), uEmber: kit.color(T.ember) };
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
    spawn() {
        const vis = this.take();
        vis.embers.visible = !this.kit.host.isLite();
        return vis;
    }
    paint(vis, x, y, radius, fade, nowMs) {
        vis.root.position.set(x, 0, y);
        vis.root.scale.setScalar(radius);
        vis.r.value = radius;
        vis.fade.value = fade;
        vis.time.value = (nowMs % 100000) / 1000;
        vis.pixelScale.value = this.kit.host.pixelScale();
    }
}
DomainPool.EMBERS = 30;
class SkyBeamShaders {
}
SkyBeamShaders.BEAM_VERTEX = DomainShaders.DOME_VERTEX;
SkyBeamShaders.BEAM_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uFade; uniform float uCore; uniform vec3 uTint; uniform vec3 uCoreTint; varying vec2 vUv; varying float vFacing;
    void main() {
      float fall = smoothstep(1.0, 0.45, vUv.y) * 0.75 + 0.25 * (1.0 - vUv.y);
      float core = pow(vFacing, 4.0 / uCore);
      float stream = texture2D(uTex, vec2(vUv.x * 4.0, vUv.y * 2.2 + uTime * 1.1)).b;
      gl_FragColor = vec4(mix(uTint, uCoreTint, core), (0.42 + 0.58 * core) * (0.78 + 0.42 * stream) * fall * uFade);
      #include <colorspace_fragment>
    }`;
SkyBeamShaders.PAD_FRAGMENT = `
    uniform float uTime; uniform float uFade; uniform vec3 uTint; uniform vec3 uCoreTint; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      float ring = smoothstep(0.16, 0.0, abs(fract(r * 2.0 - uTime * 0.9) - 0.5));
      gl_FragColor = vec4(mix(uTint, uCoreTint, ring), (0.26 + 0.56 * ring) * smoothstep(1.0, 0.3, r) * uFade);
      #include <colorspace_fragment>
    }`;
class SkyBeamMaker {
    constructor(kit) {
        this.kit = kit;
    }
    build(color, coreColor, ash, cylinder) {
        const kit = this.kit, fade = kit.number(1), time = kit.number(0), core = kit.number(1);
        const uniforms = { uTex: kit.noise(), uFade: fade, uTime: time, uCore: core, uTint: kit.color(color), uCoreTint: kit.color(coreColor) };
        const beamMat = kit.soft(uniforms, SkyBeamShaders.BEAM_VERTEX, SkyBeamShaders.BEAM_FRAGMENT);
        const padMat = kit.soft(uniforms, ToxicPoolShaders.SURFACE_VERTEX, SkyBeamShaders.PAD_FRAGMENT);
        if (!ash)
            beamMat.blending = padMat.blending = kit.THREE.AdditiveBlending;
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
SkyBeamMaker.RADIUS = 26;
SkyBeamMaker.PAD_R = 34;
class StarfallShaders {
}
StarfallShaders.ZONE_FRAGMENT = `
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
StarfallShaders.HEAD_VERTEX = `
    uniform float uSize; varying vec2 vP;
    void main() {
      vP = position.xy;
      vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      center.xy += position.xy * uSize;
      gl_Position = projectionMatrix * center;
    }`;
StarfallShaders.HEAD_FRAGMENT = `
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
StarfallShaders.TAIL_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform vec3 uDeep; uniform vec3 uTint; uniform vec3 uHot; varying vec2 vUv; varying float vFacing;
    void main() {
      float n = texture2D(uTex, vec2(vUv.x * 3.0, vUv.y * 1.6 + uTime * 2.6)).r;
      float flame = n * 0.7 + 0.6 - vUv.y * 1.15;
      float body = smoothstep(0.26, 0.58, flame) * smoothstep(0.03, 0.34, vFacing);
      gl_FragColor = vec4(mix(mix(uDeep, uTint, smoothstep(0.1, 0.5, flame)), uHot, smoothstep(0.62, 0.98, flame)), body * 0.92);
      #include <colorspace_fragment>
    }`;
StarfallShaders.DUST_VERTEX = `
    uniform float uTime; uniform float uPixelScale; uniform float uTailLen; uniform vec3 uDir; varying float vLife;
    void main() {
      float life = fract(position.x + uTime * (1.2 + position.y)), a = position.z * 6.2832;
      vec3 side = vec3(cos(a), 0.0, sin(a)) * (8.0 + 22.0 * position.y);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(uDir * (12.0 + life * uTailLen) + side, 1.0);
      gl_PointSize = (3.0 + 6.0 * position.y) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vLife = (1.0 - life) * min(1.0, life * 8.0);
    }`;
StarfallShaders.DUST_FRAGMENT = `
    uniform vec3 uHot; varying float vLife;
    void main() {
      vec2 q = abs(gl_PointCoord - 0.5);
      if (q.x + q.y > 0.5) discard;
      gl_FragColor = vec4(uHot, vLife);
      #include <colorspace_fragment>
    }`;
class StarfallPool extends ArenaFxPool {
    constructor(kit, path) {
        super(kit);
        this.path = path;
        this.tailShape = null;
        this.headShape = null;
        this.dustSeeds = null;
    }
    shapes() {
        const kit = this.kit;
        if (!this.tailShape) {
            this.tailShape = new kit.THREE.CylinderGeometry(0, 1, 1, 12, 4, true);
            this.tailShape.translate(0, 0.5, 0);
            this.headShape = new kit.THREE.PlaneGeometry(2, 2);
            this.dustSeeds = kit.seededPoints(StarfallPool.DUST, 97);
        }
        return { tail: this.tailShape, head: this.headShape, dust: this.dustSeeds };
    }
    build() {
        const kit = this.kit, S = StarfallShaders, shapes = this.shapes(), path = this.path(), T = StarfallPool.TONES;
        const r = kit.number(100), k = kit.number(0), time = kit.number(0), pulse = kit.number(0.8), pixelScale = kit.number(400), deep = kit.color(T.deep), tint = kit.color(T.tint), hot = kit.color(T.hot), team = kit.color(0xFFFFFF);
        const uniforms = { uTex: kit.noise(), uR: r, uK: k, uTime: time, uPulse: pulse, uPixelScale: pixelScale, uDeep: deep, uTint: tint, uHot: hot, uTeam: team, uSize: kit.number(StarfallPool.HEAD_SIZE), uTailLen: kit.number(StarfallPool.TAIL), uDir: { value: path.dir } };
        const zone = kit.mesh(kit.flat, kit.soft(uniforms, BladeTrailShaders.VERTEX, S.ZONE_FRAGMENT), 2);
        zone.position.y = 2.2;
        const head = kit.mesh(shapes.head, kit.soft(uniforms, S.HEAD_VERTEX, S.HEAD_FRAGMENT, kit.THREE.DoubleSide), 8);
        const tail = kit.mesh(shapes.tail, kit.soft(uniforms, DomainShaders.DOME_VERTEX, S.TAIL_FRAGMENT, kit.THREE.DoubleSide), 7);
        tail.quaternion.setFromUnitVectors(new kit.THREE.Vector3(0, 1, 0), path.dir);
        tail.scale.set(StarfallPool.STAR_R, StarfallPool.TAIL, StarfallPool.STAR_R);
        const dust = kit.points(shapes.dust, kit.soft(uniforms, S.DUST_VERTEX, S.DUST_FRAGMENT), 9);
        const star = new kit.THREE.Group();
        star.add(tail, dust, head);
        const root = new kit.THREE.Group();
        root.add(zone, star);
        root.userData.zone = zone;
        return { root, star, dust, r, k, time, pulse, pixelScale, deep, tint, hot, team };
    }
    warmPaint(vis) {
        vis.k.value = 0.5;
    }
    spawn(x, y, radius, stuns, teamHex) {
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
    paint(vis, k, nowMs) {
        const path = this.path(), R = StarfallPool.STAR_R, lift = path.top * (1 - k * k) + R;
        vis.k.value = k;
        vis.time.value = (nowMs % 100000) / 1000;
        vis.pulse.value = 0.55 + 0.4 * Math.sin(nowMs / 60);
        vis.pixelScale.value = this.kit.host.pixelScale();
        vis.star.position.set(path.dir.x / path.dir.y * (lift - R), lift, path.dir.z / path.dir.y * (lift - R));
    }
}
StarfallPool.STAR_R = 13;
StarfallPool.TAIL = 200;
StarfallPool.HEAD_SIZE = 32;
StarfallPool.DUST = 18;
StarfallPool.TONES = { deep: 0x2A1259, tint: 0xB07CFF, hot: 0xF6EEFF };
StarfallPool.STUN_TONES = { deep: 0x4A2E08, tint: 0xFFD35A, hot: 0xFFF7D6 };
class LungeBandShaders {
}
LungeBandShaders.FRAGMENT = `
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
class LungeBandPool extends ArenaFxPool {
    build() {
        const kit = this.kit, T = LungeBandPool.TONES, k = kit.number(0), time = kit.number(0), len = kit.number(200), wide = kit.number(100);
        const uniforms = { uK: k, uTime: time, uLen: len, uWide: wide, uDeep: kit.color(T.deep), uHot: kit.color(T.hot), uCore: kit.color(T.core) };
        const band = kit.mesh(kit.line, kit.soft(uniforms, BladeTrailShaders.VERTEX, LungeBandShaders.FRAGMENT), 3);
        const root = new kit.THREE.Group();
        root.add(band);
        return { root, band, k, time, len, wide };
    }
    warmPaint(vis) {
        vis.k.value = 0.5;
    }
    spawn(x, y, angle, length, width) {
        const vis = this.take();
        vis.root.position.set(x, LungeBandPool.Y, y);
        vis.root.rotation.y = -angle;
        vis.band.scale.set(length, 1, width);
        vis.len.value = length;
        vis.wide.value = width;
        return vis;
    }
    paint(vis, k, nowMs) {
        vis.k.value = k;
        vis.time.value = (nowMs % 100000) / 1000;
    }
}
LungeBandPool.Y = 2.6;
LungeBandPool.TONES = { deep: 0x7A0E08, hot: 0xFF2A1F, core: 0xFFD9B0 };
class OrbShotShaders {
}
OrbShotShaders.ORB_VERTEX = `
    uniform float uSize; varying vec2 vP;
    void main() {
      vP = position.xy;
      vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      center.xy += position.xy * uSize;
      gl_Position = projectionMatrix * center;
    }`;
OrbShotShaders.ORB_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uSpike; uniform vec3 uGlow; uniform vec3 uBody; uniform vec3 uCore; varying vec2 vP;
    void main() {
      float d = length(vP);
      if (d > 1.0) discard;
      float a = atan(vP.y, vP.x);
      float n = texture2D(uTex, vP * 0.22 + vec2(uTime * 0.7, -uTime * 0.5)).r;
      float r = d + uSpike * 0.3 * (1.0 - pow(abs(cos(a * 3.0 + uTime * 3.0)), 5.0)) + (n - 0.5) * 0.2;
      float core = smoothstep(0.34, 0.14, r), body = smoothstep(0.7, 0.48, r), halo = smoothstep(1.0, 0.45, d);
      gl_FragColor = vec4(mix(mix(uGlow, uBody, body), uCore, core), max(max(core, body * 0.96), halo * halo * 0.6));
      #include <colorspace_fragment>
    }`;
OrbShotShaders.TAIL_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform vec3 uGlow; uniform vec3 uBody; varying vec2 vP;
    void main() {
      float back = clamp(-vP.x, 0.0, 1.0), half_ = 0.46 * (1.0 - back);
      float across = abs(vP.y);
      if (across >= half_) discard;
      float body = 1.0 - across / half_;
      float n = texture2D(uTex, vec2(vP.x * 1.3 + uTime * 2.8, vP.y * 0.4)).r;
      gl_FragColor = vec4(mix(uGlow, uBody, body), body * (1.0 - back) * (0.45 + 0.55 * n));
      #include <colorspace_fragment>
    }`;
class OrbShotMaker {
    constructor(kit) {
        this.kit = kit;
        this.sets = {};
        this.orbShape = null;
        this.tailShape = null;
        this.time = kit.number(0);
    }
    tick(nowMs) {
        this.time.value = (nowMs % 100000) / 1000;
    }
    materials(name) {
        const existing = this.sets[name];
        if (existing)
            return existing;
        const kit = this.kit, L = OrbShotMaker.LOOKS[name], S = OrbShotShaders;
        const uniforms = { uTex: kit.noise(), uTime: this.time, uSpike: kit.number(L.spike), uSize: kit.number(L.size), uGlow: kit.color(L.glow), uBody: kit.color(L.body), uCore: kit.color(L.core) };
        return this.sets[name] = { orb: kit.soft(uniforms, S.ORB_VERTEX, S.ORB_FRAGMENT, kit.THREE.DoubleSide), tail: kit.soft(uniforms, BladeTrailShaders.VERTEX, S.TAIL_FRAGMENT) };
    }
    attachTo(group, name) {
        const kit = this.kit, L = OrbShotMaker.LOOKS[name], set = this.materials(name);
        if (!this.orbShape) {
            this.orbShape = new kit.THREE.PlaneGeometry(2, 2);
            this.tailShape = new kit.THREE.PlaneGeometry(1, 1);
            this.tailShape.rotateX(-Math.PI / 2);
            this.tailShape.translate(-0.5, 0, 0);
        }
        const tail = kit.mesh(this.tailShape, set.tail, 6);
        tail.scale.set(L.tailLength, 1, L.tailWidth);
        group.add(tail, kit.mesh(this.orbShape, set.orb, 7));
    }
}
OrbShotMaker.LOOKS = {
    necro: { glow: 0x8E4DFF, body: 0x7A3BE0, core: 0xE6D2FF, spike: 0, size: 25, tailLength: 74, tailWidth: 24 },
    frost: { glow: 0x8FD8F0, body: 0xBFEFFF, core: 0xFFFFFF, spike: 1, size: 25, tailLength: 80, tailWidth: 20 }
};
class SkillAuraShaders {
}
SkillAuraShaders.WALL_VERTEX = DomainShaders.DOME_VERTEX;
SkillAuraShaders.FLAME_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uFade; uniform vec3 uDeep; uniform vec3 uFire; uniform vec3 uHot; varying vec2 vUv; varying float vFacing;
    void main() {
      float big = texture2D(uTex, vec2(vUv.x * 3.0, vUv.y * 0.8 - uTime * 1.5)).r;
      float fine = texture2D(uTex, vec2(vUv.x * 6.0 + big * 0.2, vUv.y * 1.8 - uTime * 2.3)).r;
      float flame = big * 0.62 + fine * 0.42 + 0.48 - vUv.y * 1.15;
      float body = smoothstep(0.34, 0.6, flame) * smoothstep(0.02, 0.28, vFacing);
      gl_FragColor = vec4(mix(mix(uDeep, uFire, smoothstep(0.3, 0.6, flame)), uHot, smoothstep(0.68, 1.0, flame)), body * 0.82 * uFade);
      #include <colorspace_fragment>
    }`;
SkillAuraShaders.FLAME_FLOOR_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uFade; uniform float uBurst; uniform vec3 uDeep; uniform vec3 uFire; uniform vec3 uHot; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      float n = texture2D(uTex, vP * 0.3 + vec2(uTime * 0.05, -uTime * 0.09)).g;
      float glow = smoothstep(1.0, 0.45, r) * (0.34 + 0.66 * smoothstep(0.3, 0.75, n));
      float front = 1.0 - uBurst, ring = uBurst * smoothstep(0.14, 0.0, abs(r - front));
      gl_FragColor = vec4(mix(mix(uDeep, uFire, glow), uHot, ring), max(glow * 0.72, ring) * uFade);
      #include <colorspace_fragment>
    }`;
SkillAuraShaders.SPARK_VERTEX = `
    uniform float uTime; uniform float uPixelScale; uniform float uReach; uniform float uHeight; varying float vLife;
    void main() {
      float a = position.x * 6.2832 + uTime * (position.z - 0.5) * 2.0, reach = uReach * (0.4 + 0.6 * position.y), life = fract(uTime * (0.8 + 0.8 * position.z) + position.x * 5.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * reach, 6.0 + life * uHeight, sin(a) * reach, 1.0);
      gl_PointSize = (3.0 + 6.0 * position.z) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vLife = (1.0 - life) * min(1.0, life * 7.0);
    }`;
SkillAuraShaders.SPARK_FRAGMENT = `
    uniform float uFade; uniform vec3 uHot; varying float vLife;
    void main() {
      gl_FragColor = vec4(uHot, smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vLife * uFade);
      #include <colorspace_fragment>
    }`;
SkillAuraShaders.HEX_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uFade; uniform float uBurst; uniform vec3 uFire; uniform vec3 uHot; varying vec2 vUv; varying float vFacing;
    float hexEdge(vec2 p) {
      vec2 q = vec2(p.x * 1.1547, p.y + p.x * 0.57735), c = floor(q), f = fract(q);
      float m = mod(c.x + c.y, 3.0);
      vec2 d = m < 1.0 ? f : m < 2.0 ? f - vec2(1.0, 0.0) * step(f.y, f.x) - vec2(0.0, 1.0) * step(f.x, f.y) : f - 1.0;
      return max(abs(d.x), max(abs(d.y), abs(d.x + d.y) * 0.5));
    }
    void main() {
      float edge = 1.0 - vFacing;
      float cell = smoothstep(0.82, 0.96, hexEdge(vec2(vUv.x * 14.0, vUv.y * 6.0)));
      float flow = smoothstep(0.42, 0.72, texture2D(uTex, vec2(vUv.x * 2.0, vUv.y * 0.7 - uTime * 0.28)).r);
      float wave = uBurst * smoothstep(0.12, 0.0, abs(vUv.y - (1.0 - uBurst)));
      gl_FragColor = vec4(mix(uFire, uHot, max(cell * flow, wave)), (0.08 + edge * edge * 0.62 + cell * (0.18 + 0.5 * flow) + wave) * uFade);
      #include <colorspace_fragment>
    }`;
SkillAuraShaders.HEX_RING_FRAGMENT = `
    uniform float uFade; uniform float uTime; uniform vec3 uRing; varying vec2 vP;
    void main() {
      vec2 q = abs(vP);
      float a = uTime * 0.9, c = cos(a), s = sin(a);
      q = abs(vec2(c * vP.x - s * vP.y, s * vP.x + c * vP.y));
      float hex = max(q.x * 0.866 + q.y * 0.5, q.y);
      float line = smoothstep(0.78, 0.84, hex) * smoothstep(0.98, 0.92, hex);
      gl_FragColor = vec4(uRing, line * 0.92 * uFade);
      #include <colorspace_fragment>
    }`;
SkillAuraShaders.BLADE_STORM_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uFade; uniform vec3 uDeep; uniform vec3 uFire; uniform vec3 uHot; varying vec2 vP;
    float blades(float around, float count, float speed) {
      float lead = fract(around * count + uTime * speed);
      return lead * lead * lead;
    }
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      float around = atan(vP.y, vP.x) / 6.2832;
      float n = texture2D(uTex, vec2(r * 2.2 - uTime * 0.25, around * 3.0)).b;
      float outer = blades(around + r * 0.2, 3.0, 2.3) * smoothstep(0.46, 0.66, r) * smoothstep(1.0, 0.9, r);
      float inner = blades(around - r * 0.3, 2.0, -3.1) * smoothstep(0.2, 0.34, r) * smoothstep(0.56, 0.44, r);
      float blade = max(outer, inner * 0.8);
      float edge = smoothstep(0.962, 0.982, r);
      vec3 color = mix(mix(uDeep, uFire, blade), uHot, max(blade * blade * blade, edge));
      gl_FragColor = vec4(color, max(max(0.1 + 0.1 * n, blade * (0.55 + 0.45 * n)), edge * 0.85) * uFade);
      #include <colorspace_fragment>
    }`;
SkillAuraShaders.PETAL_VERTEX = `
    uniform float uTime; uniform float uPixelScale; uniform float uReach; varying float vLife; varying float vTurn;
    void main() {
      float a = position.x * 6.2832 + uTime * (2.2 + position.z), reach = uReach * (0.3 + 0.68 * position.y), life = fract(uTime * 0.7 + position.x * 9.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * reach, 14.0 + 26.0 * position.z + 16.0 * sin(life * 6.2832), sin(a) * reach, 1.0);
      gl_PointSize = (9.0 + 8.0 * position.z) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vLife = sin(life * 3.1416); vTurn = a * 2.0;
    }`;
SkillAuraShaders.PETAL_FRAGMENT = `
    uniform float uFade; uniform vec3 uFire; uniform vec3 uHot; varying float vLife; varying float vTurn;
    void main() {
      vec2 q = gl_PointCoord - 0.5;
      float c = cos(vTurn), s = sin(vTurn);
      q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
      float d = q.x * q.x * 22.0 + q.y * q.y * 7.0;
      if (d > 1.0) discard;
      gl_FragColor = vec4(mix(uFire, uHot, 1.0 - d), vLife * uFade);
      #include <colorspace_fragment>
    }`;
SkillAuraShaders.VEIL_FRAGMENT = `
    uniform sampler2D uTex; uniform float uTime; uniform float uFade; uniform float uBurst; uniform vec3 uDeep; uniform vec3 uFire; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      float a = atan(vP.y, vP.x);
      vec2 swirl = vec2(cos(a + uTime * 0.5 + r * 2.0), sin(a + uTime * 0.5 + r * 2.0)) * r * 0.4;
      float n = texture2D(uTex, swirl + vec2(uTime * 0.03, 0.0)).r;
      float wisp = smoothstep(0.42, 0.72, n) * smoothstep(1.0, 0.55, r) * smoothstep(0.2, 0.5, r);
      gl_FragColor = vec4(mix(uDeep, uFire, wisp), (wisp * 0.62 + smoothstep(1.0, 0.3, r) * 0.2) * uFade);
      #include <colorspace_fragment>
    }`;
class SkillAuraHandle {
    constructor(pool, vis) {
        this.pool = pool;
        this.vis = vis;
        this.shown = 0;
        this.lastMs = 0;
        this.wasOn = false;
        this.burstLeft = 0;
        vis.root.visible = false;
    }
    update(on, nowMs) {
        const step = Math.min(0.1, Math.max(0, (nowMs - this.lastMs) / 1000)), P = this.pool;
        this.lastMs = nowMs;
        if (on && !this.wasOn)
            this.burstLeft = 1;
        this.wasOn = on;
        this.shown = ArenaFxKit.clamp01(this.shown + (on ? step / P.fadeInSec : -step / P.fadeOutSec));
        this.burstLeft = Math.max(0, this.burstLeft - step / P.burstSec);
        this.vis.root.visible = this.shown > 0;
        if (!this.vis.root.visible)
            return;
        this.vis.fade.value = this.shown;
        this.vis.burst.value = this.burstLeft;
        P.paintNow(this.vis, nowMs);
    }
    release() {
        this.pool.give(this.vis);
    }
}
class SkillAuraPool extends ArenaFxPool {
    constructor() {
        super(...arguments);
        this.fadeInSec = 0.15;
        this.fadeOutSec = 0.25;
        this.burstSec = 0.45;
        this.sparkSeeds = null;
    }
    common(tones) {
        const kit = this.kit, fade = kit.number(1), burst = kit.number(0), time = kit.number(0), pixelScale = kit.number(400);
        const uniforms = { uTex: kit.noise(), uFade: fade, uBurst: burst, uTime: time, uPixelScale: pixelScale };
        Object.keys(tones).forEach((name) => { uniforms[name] = kit.color(tones[name]); });
        return { uniforms, fade, burst, time, pixelScale };
    }
    seeds(count, salt) {
        return this.sparkSeeds || (this.sparkSeeds = this.kit.seededPoints(count, salt));
    }
    warmPaint(vis) {
        vis.root.visible = true;
    }
    attachTo(parent) {
        const vis = this.free.pop() || this.build();
        parent.add(vis.root);
        return new SkillAuraHandle(this, vis);
    }
    paintNow(vis, nowMs) {
        vis.time.value = (nowMs % 100000) / 1000;
        vis.pixelScale.value = this.kit.host.pixelScale();
        if (vis.sparks)
            vis.sparks.visible = !this.kit.host.isLite();
    }
}
class BerserkAuraPool extends SkillAuraPool {
    constructor() {
        super(...arguments);
        this.wall = null;
    }
    build() {
        const kit = this.kit, S = SkillAuraShaders, C = this.common(BerserkAuraPool.TONES);
        C.uniforms.uReach = kit.number(40);
        C.uniforms.uHeight = kit.number(92);
        if (!this.wall) {
            this.wall = new kit.THREE.CylinderGeometry(1, 0.8, 1, 18, 1, true);
            this.wall.translate(0, 0.5, 0);
        }
        const flames = kit.mesh(this.wall, kit.soft(C.uniforms, S.WALL_VERTEX, S.FLAME_FRAGMENT, kit.THREE.DoubleSide), 6);
        flames.scale.set(44, 84, 44);
        const floor = kit.mesh(kit.flat, kit.soft(C.uniforms, BladeTrailShaders.VERTEX, S.FLAME_FLOOR_FRAGMENT), 3);
        floor.position.y = 1.6;
        floor.scale.set(70, 1, 70);
        const sparks = kit.points(this.seeds(14, 131), kit.soft(C.uniforms, S.SPARK_VERTEX, S.SPARK_FRAGMENT), 8);
        const root = new kit.THREE.Group();
        root.add(floor, flames, sparks);
        return { root, fade: C.fade, burst: C.burst, time: C.time, pixelScale: C.pixelScale, sparks };
    }
}
BerserkAuraPool.TONES = { uDeep: 0x7A1204, uFire: 0xFF4A12, uHot: 0xFFD27A };
class GuardAuraPool extends SkillAuraPool {
    constructor() {
        super(...arguments);
        this.dome = null;
    }
    build() {
        const kit = this.kit, S = SkillAuraShaders, C = this.common(GuardAuraPool.TONES);
        this.dome = this.dome || new kit.THREE.SphereGeometry(47, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        const material = kit.soft(C.uniforms, S.WALL_VERTEX, S.HEX_FRAGMENT);
        material.blending = kit.THREE.AdditiveBlending;
        const dome = kit.mesh(this.dome, material, 7);
        dome.scale.y = 2.15;
        const ring = kit.mesh(kit.flat, kit.soft(C.uniforms, BladeTrailShaders.VERTEX, S.HEX_RING_FRAGMENT), 3);
        ring.position.y = 2;
        ring.scale.set(56, 1, 56);
        const root = new kit.THREE.Group();
        root.add(ring, dome);
        return { root, fade: C.fade, burst: C.burst, time: C.time, pixelScale: C.pixelScale, sparks: null };
    }
}
GuardAuraPool.TONES = { uFire: 0x3D8CFF, uHot: 0xCDE8FF, uRing: 0xFFD54A };
class BladeStormAuraPool extends SkillAuraPool {
    constructor(kit, radius) {
        super(kit);
        this.radius = radius;
    }
    build() {
        const kit = this.kit, S = SkillAuraShaders, C = this.common(BladeStormAuraPool.TONES);
        C.uniforms.uReach = kit.number(this.radius);
        const floor = kit.mesh(kit.flat, kit.soft(C.uniforms, BladeTrailShaders.VERTEX, S.BLADE_STORM_FRAGMENT), 3);
        floor.position.y = 2;
        floor.scale.set(this.radius, 1, this.radius);
        const sparks = kit.points(this.seeds(18, 149), kit.soft(C.uniforms, S.PETAL_VERTEX, S.PETAL_FRAGMENT), 8);
        const root = new kit.THREE.Group();
        root.add(floor, sparks);
        return { root, fade: C.fade, burst: C.burst, time: C.time, pixelScale: C.pixelScale, sparks };
    }
}
BladeStormAuraPool.TONES = { uDeep: 0x7A1820, uFire: 0xE0708F, uHot: 0xFFF3F6 };
class StealthVeilPool extends SkillAuraPool {
    build() {
        const kit = this.kit, C = this.common(StealthVeilPool.TONES);
        const floor = kit.mesh(kit.flat, kit.soft(C.uniforms, BladeTrailShaders.VERTEX, SkillAuraShaders.VEIL_FRAGMENT), 3);
        floor.position.y = 1.8;
        floor.scale.set(58, 1, 58);
        const root = new kit.THREE.Group();
        root.add(floor);
        return { root, fade: C.fade, burst: C.burst, time: C.time, pixelScale: C.pixelScale, sparks: null };
    }
}
StealthVeilPool.TONES = { uDeep: 0x150D22, uFire: 0x6A3FA0 };
class StealthBurstShaders {
}
StealthBurstShaders.RING_FRAGMENT = `
    uniform sampler2D uTex; uniform float uAge; uniform vec3 uDeep; uniform vec3 uFire; varying vec2 vP;
    void main() {
      float r = length(vP);
      if (r > 1.0) discard;
      float n = texture2D(uTex, vP * 0.3 + uAge * 0.2).r;
      float front = 1.0 - (1.0 - uAge) * (1.0 - uAge);
      float ring = smoothstep(0.22, 0.0, abs(r + (n - 0.5) * 0.24 - front));
      float inside = smoothstep(front, front - 0.2, r) * 0.5;
      gl_FragColor = vec4(mix(uDeep, uFire, ring), max(ring, inside) * (1.0 - uAge));
      #include <colorspace_fragment>
    }`;
StealthBurstShaders.SMOKE_VERTEX = `
    uniform float uAge; uniform float uPixelScale; varying float vFade; varying float vSeed;
    void main() {
      float a = position.x * 6.2832, grow = 1.0 - (1.0 - uAge) * (1.0 - uAge), out_ = (12.0 + 60.0 * position.y) * grow;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * out_, 8.0 + grow * (30.0 + 44.0 * position.z), sin(a) * out_, 1.0);
      gl_PointSize = (42.0 + 34.0 * position.z) * (0.6 + 0.7 * grow) * uPixelScale * projectionMatrix[1][1] / gl_Position.w;
      vFade = min(1.0, uAge * 12.0) * (1.0 - uAge * uAge); vSeed = position.y;
    }`;
StealthBurstShaders.SMOKE_FRAGMENT = `
    uniform sampler2D uTex; uniform float uAge; uniform vec3 uDeep; uniform vec3 uFire; varying float vFade; varying float vSeed;
    void main() {
      vec2 q = gl_PointCoord - 0.5;
      float d = length(q);
      if (d > 0.5) discard;
      float n = texture2D(uTex, q * 0.3 + vSeed + uAge * 0.1).r;
      gl_FragColor = vec4(mix(uDeep, uFire, n * 0.7), smoothstep(0.5, 0.14, d + (n - 0.5) * 0.26) * vFade * 0.86);
      #include <colorspace_fragment>
    }`;
class StealthBurstPool extends ArenaFxPool {
    constructor() {
        super(...arguments);
        this.seeds = null;
        this.waiting = [];
        this.running = [];
    }
    build() {
        const kit = this.kit, S = StealthBurstShaders, T = StealthBurstPool.TONES, age = kit.number(0.3), pixelScale = kit.number(400);
        const uniforms = { uTex: kit.noise(), uAge: age, uPixelScale: pixelScale, uDeep: kit.color(T.uDeep), uFire: kit.color(T.uFire) };
        this.seeds = this.seeds || kit.seededPoints(StealthBurstPool.PUFFS, 163);
        const ring = kit.mesh(kit.flat, kit.soft(uniforms, BladeTrailShaders.VERTEX, S.RING_FRAGMENT), 3);
        ring.position.y = 2;
        ring.scale.set(StealthBurstPool.R, 1, StealthBurstPool.R);
        const smoke = kit.points(this.seeds, kit.soft(uniforms, S.SMOKE_VERTEX, S.SMOKE_FRAGMENT), 8);
        const root = new kit.THREE.Group();
        root.add(ring, smoke);
        return { root, age, pixelScale, smoke };
    }
    burst(x, y) {
        this.waiting.push({ x, y });
        if (this.waiting.length > StealthBurstPool.MAX_WAITING)
            this.waiting.shift();
    }
    tick(nowMs) {
        this.waiting.forEach((spot) => {
            const vis = this.take();
            vis.root.position.set(spot.x, 0, spot.y);
            vis.smoke.geometry.setDrawRange(0, this.kit.host.isLite() ? StealthBurstPool.PUFFS >> 1 : StealthBurstPool.PUFFS);
            this.running.push({ vis, startMs: nowMs });
        });
        this.waiting = [];
        this.running = this.running.filter((item) => {
            const k = (nowMs - item.startMs) / StealthBurstPool.LIFE_MS;
            if (k >= 1) {
                this.give(item.vis);
                return false;
            }
            item.vis.age.value = k;
            item.vis.pixelScale.value = this.kit.host.pixelScale();
            return true;
        });
    }
}
StealthBurstPool.LIFE_MS = 750;
StealthBurstPool.R = 110;
StealthBurstPool.PUFFS = 16;
StealthBurstPool.MAX_WAITING = 6;
StealthBurstPool.TONES = { uDeep: 0x120A1E, uFire: 0x6A3FA0 };
class ArenaFxViews {
    constructor(host) {
        const kit = new ArenaFxKit(host);
        this.arcBlades = new ArcBladePool(kit);
        this.thrustBlades = new ThrustBladePool(kit);
        this.stabs = new StabTrailPool(kit);
        this.toxicPools = new ToxicPoolPool(kit);
        this.domains = new DomainPool(kit);
        this.skyBeams = new SkyBeamMaker(kit);
        this.starfalls = new StarfallPool(kit, () => host.meteorPath());
        this.lungeBands = new LungeBandPool(kit);
        this.orbs = new OrbShotMaker(kit);
        this.berserkAuras = new BerserkAuraPool(kit);
        this.guardAuras = new GuardAuraPool(kit);
        this.bladeStormAuras = new BladeStormAuraPool(kit, host.bladeStormRadius);
        this.stealthVeils = new StealthVeilPool(kit);
        this.stealthBursts = new StealthBurstPool(kit);
    }
    get all() {
        return [this.arcBlades, this.thrustBlades, this.stabs, this.toxicPools, this.domains, this.starfalls, this.lungeBands, this.berserkAuras, this.guardAuras, this.bladeStormAuras, this.stealthVeils, this.stealthBursts];
    }
    tick(nowMs) {
        this.orbs.tick(nowMs);
        this.stealthBursts.tick(nowMs);
    }
    prefillForMatch(counts) {
        this.stealthBursts.prefill(counts.stealthBursts);
        this.arcBlades.prefill(6);
        this.thrustBlades.prefill(3);
        this.stabs.prefill(2);
        this.lungeBands.prefill(2);
        this.toxicPools.prefill(counts.toxicPools);
        this.domains.prefill(counts.domains);
        this.starfalls.prefill(counts.starfalls);
    }
    warmSamples() {
        return this.all.map((pool) => pool.warmSample());
    }
    spareRoots(spot) {
        return this.all.reduce((roots, pool) => roots.concat(pool.spareRoots(spot)), []);
    }
}
