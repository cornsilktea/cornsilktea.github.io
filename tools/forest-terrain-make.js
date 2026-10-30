const fs = require("fs"), path = require("path"), zlib = require("zlib");

class Rng {
  constructor(seed) { this.state = seed >>> 0; }
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  between(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
}

class ValueNoise {
  constructor(seed) { this.seed = seed; }
  lattice(x, z) {
    let h = Math.imul(x * 374761393 + z * 668265263 + this.seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  at(x, z, scale) {
    const fx = x / scale, fz = z / scale;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
    const a = this.lattice(ix, iz), b = this.lattice(ix + 1, iz), c = this.lattice(ix, iz + 1), d = this.lattice(ix + 1, iz + 1);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sz;
  }
  fractal(x, z, scale) { return this.at(x, z, scale) * 0.6 + this.at(x, z, scale / 2) * 0.28 + this.at(x, z, scale / 4) * 0.12; }
}

class PngWriter {
  static crcTable() {
    if (PngWriter.table) return PngWriter.table;
    PngWriter.table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    return PngWriter.table;
  }
  static crc(buffer) {
    const table = PngWriter.crcTable();
    let c = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) c = table[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  static chunk(type, data) {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(PngWriter.crc(body));
    return Buffer.concat([length, body, crc]);
  }
  static encode(width, height, rgb) {
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
      raw[y * (width * 3 + 1)] = 0;
      rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), PngWriter.chunk("IHDR", header), PngWriter.chunk("IDAT", zlib.deflateSync(raw)), PngWriter.chunk("IEND", Buffer.alloc(0))]);
  }
}

class Canvas {
  constructor(width, height, fill = [30, 30, 30]) {
    this.width = width; this.height = height;
    this.pixels = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) { this.pixels[i * 3] = fill[0]; this.pixels[i * 3 + 1] = fill[1]; this.pixels[i * 3 + 2] = fill[2]; }
  }
  rect(x, y, w, h, color) {
    for (let j = Math.max(0, y); j < Math.min(this.height, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.width, x + w); i++) {
      const o = (j * this.width + i) * 3;
      this.pixels[o] = color[0]; this.pixels[o + 1] = color[1]; this.pixels[o + 2] = color[2];
    }
  }
  setPixel(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const o = (y * this.width + x) * 3;
    for (let k = 0; k < 3; k++) this.pixels[o + k] = Math.max(0, Math.min(255, Math.round(color[k])));
  }
  getPixel(x, y) { const o = (y * this.width + x) * 3; return [this.pixels[o], this.pixels[o + 1], this.pixels[o + 2]]; }
  disc(cx, cy, radius, color, alpha = 1) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (Math.hypot(x - cx, y - cy) > radius || x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
      const old = this.getPixel(x, y);
      this.setPixel(x, y, old.map((v, k) => v + (color[k] - v) * alpha));
    }
  }
  ring(cx, cy, radius, thickness, color) {
    for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y++) for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius && d >= radius - thickness) this.setPixel(x, y, color);
    }
  }
  save(file) { fs.writeFileSync(file, PngWriter.encode(this.width, this.height, this.pixels)); }
}

const Renderers = require("./forest-render.js")(Canvas);

class IslandMap {
  static readonly = null;
  constructor(seed) {
    this.W = 120; this.D = 120;
    this.noise = new ValueNoise(seed);
    this.plaza = { x: 60, z: 60, radius: 5 };
    this.heights = Array.from({ length: this.D }, () => new Array(this.W).fill(-1));
    this.tops = Array.from({ length: this.D }, () => new Array(this.W).fill("O"));
    this.anchors = {};
  }

  static smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  naturalHeight(x, z) {
    const dx = x - 60, dz = z - 60;
    const r = Math.hypot(dx, dz) / (55 + 5 * (this.noise.fractal(x + 300, z + 300, 22) - 0.5) * 2);
    if (r > 1.02) return -1;
    let h = r > 0.82 ? 1.5 * (1 - (r - 0.82) / 0.2) - 0.2 : 1.4 + this.noise.fractal(x, z, 14) * 1.2;
    const bump = (cx, cz, height, radius, power) => { const d = Math.hypot(x - cx, z - cz); return d >= radius ? 0 : height * Math.pow(1 - d / radius, power); };
    h += bump(46, 15, 13, 21, 1.1) + bump(76, 17, 12, 19, 1.1) + bump(60, 8, 4, 12, 1);
    h += bump(97, 27, 5.5, 17, 1) + bump(22, 30, 5.5, 17, 1);
    h += bump(100, 60, 5, 16, 0.35) * (0.8 + this.noise.fractal(x, z, 6) * 0.4);
    h += bump(18, 62, 3.4, 15, 1) * (0.7 + this.noise.fractal(x + 50, z, 8) * 0.6);
    h += this.noise.fractal(x + 99, z + 17, 7) * 1.2 - 0.6;
    return h;
  }

  basinHeight(x, z) {
    const u = (60 - z) * 0.6 + (60 - x) * 0.4;
    if (x > 66) return Math.max(-0, Math.round(0 - Math.max(0, (x - 66) / 9)));
    return Math.max(0, Math.min(3, Math.floor(u / 5)));
  }

  build() {
    for (let z = 0; z < this.D; z++) for (let x = 0; x < this.W; x++) {
      const natural = this.naturalHeight(x, z);
      const d = Math.hypot(x - 60, z - 60);
      const w = IslandMap.smooth((d - 14) / 14);
      const h = d < 28 ? this.basinHeight(x, z) * (1 - w) + natural * w : natural;
      this.heights[z][x] = natural <= -0.9 && d > 28 ? -1 : Math.round(h);
    }
    this.carveRivers();
    this.laidPaths();
    this.flattenSites();
    this.paintTops();
    this.zones();
    return this;
  }

  polyline(points, width, depthFn) {
    const cells = new Set();
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, z1] = points[i], [x2, z2] = points[i + 1];
      const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) * 2);
      for (let s = 0; s <= steps; s++) {
        const cx = x1 + (x2 - x1) * s / steps, cz = z1 + (z2 - z1) * s / steps;
        const wobble = width / 2 + 0.4 * Math.sin(cz * 0.7 + cx * 0.4);
        for (let z = Math.floor(cz - wobble - 3); z <= Math.ceil(cz + wobble + 3); z++) for (let x = Math.floor(cx - wobble - 3); x <= Math.ceil(cx + wobble + 3); x++) {
          if (x < 0 || z < 0 || x >= this.W || z >= this.D) continue;
          const dist = Math.hypot(x - cx, z - cz);
          if (dist <= wobble) cells.add(z * this.W + x);
          else if (dist <= wobble + 2.2) depthFn && depthFn(x, z, dist - wobble);
        }
      }
    }
    return cells;
  }

  carveRivers() {
    const river = [[68, 24], [70, 36], [76, 48], [80, 58], [82, 68], [84, 80], [88, 92], [92, 104], [96, 114]];
    const tributary = [[82, 70], [72, 80], [64, 86], [56, 90], [46, 100], [40, 110], [38, 118]];
    this.riverCells = new Set(); this.tributaryCells = new Set();
    const bank = (x, z) => { this.heights[z][x] = Math.min(this.heights[z][x], 1); };
    this.polyline(river, 7, (x, z) => bank(x, z)).forEach((c) => this.riverCells.add(c));
    this.polyline(tributary, 5, (x, z) => bank(x, z)).forEach((c) => this.tributaryCells.add(c));
    [this.riverCells, this.tributaryCells].forEach((set) => set.forEach((c) => { const x = c % this.W, z = Math.floor(c / this.W); if (Math.hypot(x - 60, z - 60) < 56) this.heights[z][x] = -1; }));
    this.water = new Set([...this.riverCells, ...this.tributaryCells]);
  }

  isWater(x, z) { return this.water.has(z * this.W + x); }

  carvePath(points, id, width) {
    const cells = [];
    const seen = new Set();
    let previous = null;
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, z1] = points[i], [x2, z2] = points[i + 1];
      const steps = Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1)));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x1 + (x2 - x1) * s / steps), z = Math.round(z1 + (z2 - z1) * s / steps);
        const key = z * this.W + x;
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push([x, z]);
      }
    }
    cells.forEach(([x, z]) => {
      if (this.isWater(x, z)) { previous = this.heights[z][x]; return; }
      const target = this.heights[z][x];
      let h = target;
      if (previous !== null && previous >= 0) h = Math.max(previous - 1, Math.min(previous + 1, target));
      else if (previous !== null && previous < 0) h = Math.max(0, Math.min(2, target));
      for (let dz = 0; dz < width; dz++) for (let dx = 0; dx < width; dx++) {
        const px = x + dx - Math.floor((width - 1) / 2), pz = z + dz - Math.floor((width - 1) / 2);
        if (px < 0 || pz < 0 || px >= this.W || pz >= this.D || this.isWater(px, pz)) continue;
        this.heights[pz][px] = h;
        this.pathCells.add(pz * this.W + px);
      }
      previous = h;
    });
    this.anchors.paths[id] = cells;
  }

  laidPaths() {
    this.pathCells = new Set();
    this.anchors.paths = {};
    const wiggle = (from, to, count, axis, amp) => {
      const pts = [];
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const base = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
        const offset = Math.sin(t * Math.PI * 3 + from[0]) * amp * Math.sin(t * Math.PI);
        pts.push(axis === "x" ? [Math.round(base[0] + offset), Math.round(base[1])] : [Math.round(base[0]), Math.round(base[1] + offset)]);
      }
      return pts;
    };
    this.carvePath(wiggle([60, 60], [60, 12], 12, "x", 3), "north", 2);
    this.carvePath(wiggle([60, 60], [110, 60], 14, "y", 3), "east", 2);
    this.carvePath(wiggle([60, 60], [60, 108], 12, "x", 3), "south", 2);
    this.carvePath(wiggle([60, 60], [10, 60], 14, "y", 3), "west", 2);
  }

  flattenSites() {
    const pad = (cx, cz, radius, forcedHeight, tag) => {
      const samples = [];
      for (let z = cz - radius; z <= cz + radius; z++) for (let x = cx - radius; x <= cx + radius; x++) if (!this.isWater(x, z)) samples.push(this.heights[z][x]);
      samples.sort((a, b) => a - b);
      const h = forcedHeight === undefined ? samples[Math.floor(samples.length / 2)] : forcedHeight;
      for (let z = cz - radius; z <= cz + radius; z++) for (let x = cx - radius; x <= cx + radius; x++) {
        if (x < 0 || z < 0 || x >= this.W || z >= this.D || Math.hypot(x - cx, z - cz) > radius + 0.5) continue;
        this.water.delete(z * this.W + x);
        this.heights[z][x] = h;
        this.padCells.set(z * this.W + x, tag);
      }
      return h;
    };
    this.padCells = new Map();
    pad(60, 60, 5, 0, "plaza");
    this.anchors.plaza = { x: 60, z: 60, radius: 5, height: 0 };
    this.anchors.campfire = { x: 60, z: 60 };
    this.anchors.publicChest = { x: 63, z: 60, size: 2 };
    this.anchors.portals = {};
    [["fruit", 60, 12], ["mine", 110, 60], ["beach", 60, 108], ["dungeon", 10, 60]].forEach(([id, x, z]) => {
      const h = pad(x, z, 2, undefined, "portal");
      this.anchors.portals[id] = { x, z, height: h };
    });
    this.anchors.lots = [[40, 40], [47, 40], [54, 40], [38, 48], [45, 48], [52, 47], [40, 68], [47, 68]].map(([x, z]) => {
      const samples = [];
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) samples.push(this.heights[z + j][x + i]);
      samples.sort((a, b) => a - b);
      const h = samples[3];
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { this.heights[z + j][x + i] = h; this.padCells.set((z + j) * this.W + x + i, "lot"); }
      return { x, z, size: 6, height: h };
    });
    const farm = { x: 66, z: 68, w: 6, d: 4, expand: [{ x: 66, z: 72, w: 6, d: 2 }, { x: 66, z: 74, w: 6, d: 2 }] };
    for (let z = 68; z < 76; z++) for (let x = 66; x < 72; x++) { this.heights[z][x] = 0; this.padCells.set(z * this.W + x, "farm"); }
    this.anchors.farm = farm;
    this.anchors.bridges = this.findBridges();
  }

  findBridges() {
    const bridges = {};
    const run = (fixed, axis, from, to, step) => {
      const cells = [];
      for (let t = from; t !== to; t += step) {
        const x = axis === "x" ? t : fixed, z = axis === "x" ? fixed : t;
        if (this.isWater(x, z)) cells.push([x, z]); else if (cells.length > 0) break;
      }
      return cells;
    };
    bridges.east = run(60, "x", 62, 108, 1);
    bridges.south = run(60, "z", 62, 108, 1).length ? run(60, "z", 62, 108, 1) : [];
    const farmBridge = [];
    for (let x = 72; x < 100; x++) if (this.isWater(x, 71)) farmBridge.push([x, 71]);
    bridges.shortcutFarm = farmBridge;
    const canalBridge = [];
    for (let z = 74; z < 100; z++) if (this.isWater(50, z)) canalBridge.push([50, z]);
    bridges.shortcutTributary = canalBridge;
    return bridges;
  }

  paintTops() {
    for (let z = 0; z < this.D; z++) for (let x = 0; x < this.W; x++) {
      const h = this.heights[z][x];
      const key = z * this.W + x;
      let top;
      if (this.isWater(x, z)) top = "R";
      else if (h < 0) top = "O";
      else if (this.padCells.get(key) === "plaza" || this.padCells.get(key) === "portal" || this.pathCells.has(key)) top = "P";
      else if (this.padCells.get(key) === "farm") top = "D";
      else if (h >= 12) top = "W";
      else {
        let steep = 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => { const nx = x + dx, nz = z + dz; if (nx >= 0 && nz >= 0 && nx < this.W && nz < this.D) steep = Math.max(steep, Math.abs(this.heights[nz][nx] - h)); });
        if (h >= 8 || steep >= 2) top = "S";
        else if (h <= 1 && Math.hypot(x - 60, z - 60) > 40) top = "N";
        else top = "G";
      }
      this.tops[z][x] = top;
    }
    for (let z = 1; z < this.D - 1; z++) for (let x = 1; x < this.W - 1; x++) {
      if (this.tops[z][x] !== "G" && this.tops[z][x] !== "S") continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.tops[z + dz][x + dx] === "R") && this.heights[z][x] <= 1) this.tops[z][x] = "D";
    }
  }

  zones() {
    const zones = [];
    for (let z0 = 5; z0 + 5 <= this.D - 5; z0 += 5) for (let x0 = 5; x0 + 5 <= this.W - 5; x0 += 5) {
      const cx = x0 + 2, cz = z0 + 2;
      if (Math.hypot(cx - 60, cz - 60) < 9 || Math.hypot(cx - 60, cz - 60) > 32) continue;
      let ok = true;
      for (let z = z0; z < z0 + 5 && ok; z++) for (let x = x0; x < x0 + 5; x++) {
        const key = z * this.W + x;
        if (this.padCells.has(key) || this.pathCells.has(key) || this.tops[z][x] === "R" || this.tops[z][x] === "O" || this.tops[z][x] === "N" || this.heights[z][x] > 4) { ok = false; break; }
      }
      if (ok) zones.push([x0, z0]);
    }
    this.anchors.jungleZones = zones;
  }

  reachableFromPlaza(target) {
    const seen = new Uint8Array(this.W * this.D);
    const queue = [[60, 60]];
    seen[60 * this.W + 60] = 1;
    while (queue.length > 0) {
      const [x, z] = queue.shift();
      if (Math.abs(x - target.x) <= 1 && Math.abs(z - target.z) <= 1) return true;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= this.W || nz >= this.D || seen[nz * this.W + nx]) return;
        if (this.tops[nz][nx] === "O") return;
        const climb = this.heights[nz][nx] - this.heights[z][x];
        const here = this.tops[z][x] === "R", there = this.tops[nz][nx] === "R";
        if (!here && !there && climb > 1) return;
        seen[nz * this.W + nx] = 1;
        queue.push([nx, nz]);
      });
    }
    return false;
  }

  toJson() {
    const heightChars = this.heights.map((row) => row.map((h) => String.fromCharCode(97 + Math.max(-2, Math.min(24, h)) + 2)).join(""));
    return {
      version: 1, w: this.W, d: this.D, cellMeters: 2, seaLevel: 0,
      legend: { heights: "문자 코드 − 'a' − 2 = 높이 블록(-2~)", tops: "G 잔디 · D 흙 · S 돌 · N 모래 · W 눈 · R 강물 · O 바다 · P 길/광장/포탈" },
      heights: heightChars, tops: this.tops.map((row) => row.join("")), anchors: this.anchors,
    };
  }

  drawPreview(file) {
    const scale = 6;
    const canvas = new Canvas(this.W * scale, this.D * scale);
    const colors = { G: [111, 163, 82], D: [150, 112, 72], S: [128, 128, 132], N: [226, 208, 150], W: [245, 248, 250], R: [70, 130, 200], O: [40, 80, 140], P: [196, 168, 110] };
    for (let z = 0; z < this.D; z++) for (let x = 0; x < this.W; x++) {
      const base = colors[this.tops[z][x]];
      const shade = 0.72 + 0.05 * Math.max(-1, this.heights[z][x]);
      canvas.rect(x * scale, z * scale, scale, scale, base.map((v) => Math.max(0, Math.min(255, Math.round(v * shade)))));
    }
    this.anchors.jungleZones.forEach(([x, z]) => { for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if ((i + j) % 2 === 0) canvas.rect((x + i) * scale + 2, (z + j) * scale + 2, 2, 2, [30, 90, 40]); });
    this.anchors.lots.forEach((l) => canvas.rect(l.x * scale, l.z * scale, l.size * scale, l.size * scale, [210, 120, 80]));
    const farm = this.anchors.farm;
    canvas.rect(farm.x * scale, farm.z * scale, farm.w * scale, farm.d * scale, [90, 60, 30]);
    farm.expand.forEach((e) => canvas.rect(e.x * scale, e.z * scale, e.w * scale, e.d * scale, [130, 95, 55]));
    canvas.rect(57 * scale, 57 * scale, 6 * scale, 6 * scale, [255, 140, 0]);
    canvas.rect(63 * scale, 60 * scale, 2 * scale, 2 * scale, [160, 60, 20]);
    const portalColors = { fruit: [220, 40, 160], mine: [255, 215, 0], beach: [0, 200, 220], dungeon: [140, 40, 200] };
    Object.keys(this.anchors.portals).forEach((id) => { const p = this.anchors.portals[id]; canvas.rect((p.x - 2) * scale, (p.z - 2) * scale, 5 * scale, 5 * scale, portalColors[id]); });
    Object.keys(this.anchors.bridges).forEach((id) => this.anchors.bridges[id].forEach(([x, z]) => canvas.rect(x * scale + 1, z * scale + 1, scale - 2, scale - 2, [90, 50, 20])));
    canvas.save(file);
  }
}

class CaveGrid {
  constructor(w, d, rng) {
    this.w = w; this.d = d; this.rng = rng;
    this.cells = new Uint8Array(w * d);
  }
  at(x, z) { return x < 0 || z < 0 || x >= this.w || z >= this.d ? 0 : this.cells[z * this.w + x]; }
  set(x, z, v) { if (x > 0 && z > 0 && x < this.w - 1 && z < this.d - 1) this.cells[z * this.w + x] = v; }
  isOpen(x, z) { const c = this.at(x, z); return c === 1; }

  carveRoom(cx, cz, rx, rz) {
    for (let z = cz - rz - 1; z <= cz + rz + 1; z++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const nx = (x - cx) / (rx + this.rng.next() * 0.8), nz = (z - cz) / (rz + this.rng.next() * 0.8);
      if (nx * nx + nz * nz <= 1) this.set(x, z, 1);
    }
  }

  carveCorridor(a, b, width) {
    let [x, z] = a;
    const [tx, tz] = b;
    while (x !== tx || z !== tz) {
      const horizontal = Math.abs(tx - x) > Math.abs(tz - z) ? this.rng.next() < 0.8 : this.rng.next() < 0.2;
      if (horizontal && x !== tx) x += Math.sign(tx - x); else if (z !== tz) z += Math.sign(tz - z); else x += Math.sign(tx - x);
      const wobble = this.rng.next() < 0.15 ? this.rng.between(-1, 1) : 0;
      for (let j = 0; j < width; j++) for (let i = 0; i < width; i++) this.set(x + i + wobble * (horizontal ? 0 : 1), z + j + wobble * (horizontal ? 1 : 0), 1);
    }
  }

  smooth(rounds) {
    for (let r = 0; r < rounds; r++) {
      const next = new Uint8Array(this.cells);
      for (let z = 1; z < this.d - 1; z++) for (let x = 1; x < this.w - 1; x++) {
        const c = this.at(x, z);
        if (c !== 0 && c !== 1) continue;
        let open = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && this.at(x + dx, z + dz) !== 0) open++;
        next[z * this.w + x] = c === 1 ? (open <= 2 ? 0 : 1) : (open >= 6 ? 1 : 0);
      }
      this.cells = next;
    }
  }

  floodFrom(x, z, passable = (c) => c === 1) {
    const seen = new Uint8Array(this.w * this.d);
    const queue = [[x, z]];
    seen[z * this.w + x] = 1;
    while (queue.length > 0) {
      const [cx, cz] = queue.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.d || seen[nz * this.w + nx] || !passable(this.at(nx, nz))) return;
        seen[nz * this.w + nx] = 1;
        queue.push([nx, nz]);
      });
    }
    return seen;
  }

  keepConnected(x, z) {
    const seen = this.floodFrom(x, z);
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === 1 && !seen[i]) this.cells[i] = 0;
  }

  wallEdgeCells() {
    const list = [];
    for (let z = 1; z < this.d - 1; z++) for (let x = 1; x < this.w - 1; x++) {
      if (this.at(x, z) !== 0) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.at(x + dx, z + dz) === 1)) list.push([x, z]);
    }
    return list;
  }

  openCells() {
    const list = [];
    for (let z = 0; z < this.d; z++) for (let x = 0; x < this.w; x++) if (this.at(x, z) === 1) list.push([x, z]);
    return list;
  }
}

class CaveMaker {
  constructor(seed) { this.rng = new Rng(seed); }

  layout(w, d, roomCount, margin, minRadius = 3, maxRadius = 6) {
    const grid = new CaveGrid(w, d, this.rng);
    const rooms = [];
    for (let tries = 0; tries < 800 && rooms.length < roomCount; tries++) {
      const rx = this.rng.between(minRadius, maxRadius), rz = this.rng.between(minRadius, maxRadius);
      const cx = this.rng.between(margin + rx, w - margin - rx), cz = this.rng.between(margin + rz, d - margin - rz);
      if (rooms.some((r) => Math.hypot(r.cx - cx, r.cz - cz) < r.rx + rx + (maxRadius < 4 ? 6 : 5))) continue;
      rooms.push({ cx, cz, rx, rz });
    }
    rooms.forEach((r) => grid.carveRoom(r.cx, r.cz, r.rx, r.rz));
    const order = rooms.slice().sort((a, b) => a.cx + a.cz - (b.cx + b.cz));
    for (let i = 0; i < order.length - 1; i++) grid.carveCorridor([order[i].cx, order[i].cz], [order[i + 1].cx, order[i + 1].cz], this.rng.between(2, 3));
    if (rooms.length > 3) grid.carveCorridor([order[0].cx, order[0].cz], [order[order.length - 2].cx, order[order.length - 2].cz], 2);
    grid.smooth(2);
    return { grid, rooms: order };
  }

  spaced(candidates, count, gap) {
    const chosen = [];
    const pool = candidates.slice();
    while (pool.length > 0 && chosen.length < count) {
      const [x, z] = pool.splice(this.rng.between(0, pool.length - 1), 1)[0];
      if (chosen.every(([a, b]) => Math.hypot(a - x, b - z) >= gap)) chosen.push([x, z]);
    }
    return chosen;
  }

  oreClusters(grid, count, startX, startZ) {
    const edges = grid.wallEdgeCells().filter(([x, z]) => Math.hypot(x - startX, z - startZ) > 10);
    return this.spaced(edges, count, 7).map(([x, z]) => {
      const cluster = [[x, z]];
      for (let i = 0; i < this.rng.between(2, 4); i++) {
        const [bx, bz] = this.rng.pick(cluster);
        const [dx, dz] = this.rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        if (grid.at(bx + dx, bz + dz) === 0 && !cluster.some(([a, b]) => a === bx + dx && b === bz + dz)) cluster.push([bx + dx, bz + dz]);
      }
      return cluster;
    });
  }

  mineFloor(level) {
    const size = [42, 48, 54][level - 1];
    const { grid, rooms } = this.layout(size, size, [5, 6, 7][level - 1], 3);
    const start = [rooms[0].cx, rooms[0].cz];
    grid.keepConnected(start[0], start[1]);
    const result = { level, w: size, d: size, start };
    if (level === 3) {
      const lake = rooms[Math.floor(rooms.length / 2)];
      for (let z = lake.cz - 2; z <= lake.cz + 2; z++) for (let x = lake.cx - 2; x <= lake.cx + 2; x++) if (grid.at(x, z) === 1 && Math.hypot(x - lake.cx, z - lake.cz) < 3 && Math.hypot(x - start[0], z - start[1]) > 6) grid.set(x, z, 2);
      const seen = grid.floodFrom(start[0], start[1]);
      grid.cells.forEach((c, i) => { if (c === 2) { const x = i % size, z = Math.floor(i / size); if (!seen[i] && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => seen[(z + dz) * size + x + dx])) grid.cells[i] = 0; } });
      const hard = this.hardRockShortcut(grid, start);
      result.hardRock = hard;
    }
    const last = rooms[rooms.length - 1];
    const ladder = grid.openCells().sort((a, b) => Math.hypot(b[0] - start[0], b[1] - start[1]) - Math.hypot(a[0] - start[0], a[1] - start[1]))[0];
    result.ladderDown = level < 3 ? ladder : null;
    result.farthestRoom = [last.cx, last.cz];
    result.oreSpots = this.oreClusters(grid, [8, 10, 12][level - 1], start[0], start[1]);
    result.torches = this.spaced(grid.wallEdgeCells(), [14, 16, 18][level - 1], 6);
    result.decor = this.spaced(grid.wallEdgeCells(), 8, 6);
    result.rows = this.rows(grid);
    return result;
  }

  hardRockShortcut(grid, start) {
    const distance = new Int32Array(grid.w * grid.d).fill(-1);
    const queue = [start];
    distance[start[1] * grid.w + start[0]] = 0;
    for (let head = 0; head < queue.length; head++) {
      const [x, z] = queue[head];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
        const nx = x + dx, nz = z + dz;
        if (grid.at(nx, nz) !== 1 || distance[nz * grid.w + nx] >= 0) return;
        distance[nz * grid.w + nx] = distance[z * grid.w + x] + 1;
        queue.push([nx, nz]);
      });
    }
    const open = grid.openCells().filter(([x, z]) => distance[z * grid.w + x] >= 0);
    const pairs = [];
    for (let i = 0; i < open.length; i += 2) for (let j = i + 1; j < open.length; j += 3) {
      const [ax, az] = open[i], [bx, bz] = open[j];
      const straight = Math.hypot(ax - bx, az - bz);
      const detour = Math.abs(distance[az * grid.w + ax] - distance[bz * grid.w + bx]);
      if (straight >= 4 && straight <= 8 && detour >= 11) pairs.push({ a: open[i], b: open[j], gain: detour - straight });
    }
    pairs.sort((p, q) => q.gain - p.gain);
    const chosen = [];
    pairs.slice(0, 40).forEach((pair) => {
      if (chosen.length >= 2 || chosen.some((c) => Math.hypot(c.a[0] - pair.a[0], c.a[1] - pair.a[1]) < 12)) return;
      const cells = [];
      const steps = Math.ceil(Math.hypot(pair.b[0] - pair.a[0], pair.b[1] - pair.a[1]));
      for (let s = 1; s < steps; s++) {
        const x = Math.round(pair.a[0] + (pair.b[0] - pair.a[0]) * s / steps), z = Math.round(pair.a[1] + (pair.b[1] - pair.a[1]) * s / steps);
        if (grid.at(x, z) === 0) cells.push([x, z]);
      }
      if (cells.length === 0) return;
      cells.forEach(([x, z]) => grid.set(x, z, 4));
      chosen.push({ a: pair.a, b: pair.b, cells });
    });
    return chosen.reduce((all, c) => all.concat(c.cells), []);
  }

  dungeon(kind, seedStart) {
    const size = 26;
    let layout = this.layout(size, size, 4, 2, 2, 3);
    for (let attempt = 0; attempt < 30 && layout.rooms.length < 4; attempt++) layout = this.layout(size, size, 4, 2, 2, 3);
    const { grid, rooms } = layout;
    const start = [rooms[0].cx, rooms[0].cz];
    grid.keepConnected(start[0], start[1]);
    if (kind === "lava") {
      let placed = 0;
      for (let t = 0; t < 60 && placed < 14; t++) {
        const room = this.rng.pick(rooms.slice(1));
        const x = room.cx + this.rng.between(-2, 2), z = room.cz + this.rng.between(-2, 2);
        const before = grid.at(x, z);
        if (before !== 1) continue;
        grid.set(x, z, 3);
        const seen = grid.floodFrom(start[0], start[1]);
        const all = grid.openCells().every(([ox, oz]) => seen[oz * size + ox]);
        if (all) placed++; else grid.set(x, z, 1);
      }
    }
    const open = grid.openCells().filter(([x, z]) => Math.hypot(x - start[0], z - start[1]) > 8);
    const result = { kind, w: size, d: size, start, meters: size * 2 };
    result.spawnSpots = this.spaced(open, 8, 4);
    result.torches = this.spaced(grid.wallEdgeCells(), 10, 5);
    result.decor = this.spaced(grid.wallEdgeCells(), kind === "crystal" ? 14 : kind === "moss" ? 10 : 6, 4);
    result.rows = this.rows(grid);
    return result;
  }

  rows(grid) {
    const rows = [];
    for (let z = 0; z < grid.d; z++) { let line = ""; for (let x = 0; x < grid.w; x++) line += ".#~^X".charAt([1, 0, 2, 3, 4].indexOf(grid.at(x, z)) < 0 ? 1 : [1, 0, 2, 3, 4].indexOf(grid.at(x, z))); rows.push(line); }
    return rows;
  }
}

class CavePreview {
  static draw(maps, file, scale = 7) {
    const gap = 3;
    const width = maps.reduce((s, m) => s + m.w * scale + gap, gap);
    const height = Math.max(...maps.map((m) => m.d * scale)) + gap * 2;
    const canvas = new Canvas(width, height, [20, 20, 24]);
    let left = gap;
    const colors = { "#": [52, 50, 58], ".": [172, 150, 110], "~": [60, 120, 200], "^": [235, 100, 30], "X": [10, 10, 12] };
    maps.forEach((m) => {
      m.rows.forEach((row, z) => row.split("").forEach((c, x) => canvas.rect(left + x * scale, gap + z * scale, scale, scale, colors[c])));
      (m.oreSpots || []).forEach((cluster) => cluster.forEach(([x, z]) => canvas.rect(left + x * scale + 1, gap + z * scale + 1, scale - 2, scale - 2, [90, 230, 240])));
      (m.torches || []).forEach(([x, z]) => canvas.rect(left + x * scale + 2, gap + z * scale + 2, scale - 4, scale - 4, [255, 220, 60]));
      (m.spawnSpots || []).forEach(([x, z]) => canvas.rect(left + x * scale + 2, gap + z * scale + 2, scale - 4, scale - 4, [220, 40, 40]));
      if (m.ladderDown) canvas.rect(left + m.ladderDown[0] * scale, gap + m.ladderDown[1] * scale, scale, scale, [60, 220, 90]);
      canvas.rect(left + m.start[0] * scale, gap + m.start[1] * scale, scale, scale, [255, 255, 255]);
      left += m.w * scale + gap;
    });
    canvas.save(file);
  }
}

class TerrainBuild {
  static run() {
    const root = path.join(__dirname, "..");
    const out = path.join(root, "assets", "forest");
    fs.mkdirSync(path.join(out, "preview"), { recursive: true });
    const island = new IslandMap(20261030).build();
    fs.writeFileSync(path.join(out, "island-terrain.json"), JSON.stringify(island.toJson()));
    new Renderers.IslandRenderer(island).draw(path.join(out, "preview", "island.png"));

    const maker = new CaveMaker(777);
    const mine = [1, 2, 3].map((level) => maker.mineFloor(level));
    fs.writeFileSync(path.join(out, "mine-cave.json"), JSON.stringify({ version: 1, cellMeters: 2, legend: ". 바닥 · # 벽 · ~ 웅덩이 · X 단단한 바위", floors: mine }));
    Renderers.CaveRenderer.draw(mine, path.join(out, "preview", "mine.png"), 14);

    const dungeons = ["moss", "crystal", "lava"].map((kind) => new CaveMaker(kind.length * 1009 + 5).dungeon(kind));
    dungeons.forEach((d) => fs.writeFileSync(path.join(out, "dungeon-cave-" + d.kind + ".json"), JSON.stringify({ version: 1, cellMeters: 2, legend: ". 바닥 · # 벽 · ^ 용암", ...d })));
    Renderers.CaveRenderer.draw(dungeons, path.join(out, "preview", "dungeon.png"), 18);

    TerrainBuild.report(island, mine, dungeons);
  }

  static report(island, mine, dungeons) {
    let max = -9, land = 0, water = 0;
    island.heights.forEach((row, z) => row.forEach((h, x) => { max = Math.max(max, h); if (island.tops[z][x] === "R") water++; else if (island.tops[z][x] !== "O") land++; }));
    console.log("섬: 육지 " + land + "칸 · 강 " + water + "칸 · 최고 높이 " + max + "블록 · 정글 구역 " + island.anchors.jungleZones.length + "개");
    ["fruit", "mine", "beach", "dungeon"].forEach((id) => console.log("  포탈 " + id + ": 광장에서 걸어 도착 " + (island.reachableFromPlaza(island.anchors.portals[id]) ? "가능" : "불가능")));
    Object.keys(island.anchors.bridges).forEach((id) => console.log("  다리 자리 " + id + ": 강 " + island.anchors.bridges[id].length + "칸"));
    mine.forEach((f) => console.log("광산 " + f.level + "층: 바닥 " + f.rows.join("").split(".").length + "칸 · 광맥 무리 " + f.oreSpots.length + " · 횃불 " + f.torches.length + (f.hardRock ? " · 단단한 바위 " + f.hardRock.length : "")));
    dungeons.forEach((d) => console.log("던전 " + d.kind + ": " + d.meters + "m × " + d.meters + "m · 몬스터 자리 " + d.spawnSpots.length + " · 횃불 " + d.torches.length));
  }
}

TerrainBuild.run();
