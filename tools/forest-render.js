class PixelHash {
  static at(x, y, salt = 0) {
    let h = Math.imul((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791), 2654435761);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }
}

module.exports = function makeRenderers(Canvas) {
  class IslandRenderer {
    constructor(map) { this.map = map; this.S = 10; this.computeOceanDepth(); }

    computeOceanDepth() {
      const m = this.map;
      this.depth = new Int16Array(m.W * m.D).fill(-1);
      const queue = [];
      for (let z = 0; z < m.D; z++) for (let x = 0; x < m.W; x++) if (m.tops[z][x] !== "O") { this.depth[z * m.W + x] = 0; queue.push([x, z]); }
      for (let head = 0; head < queue.length; head++) {
        const [x, z] = queue[head];
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= m.W || nz >= m.D || this.depth[nz * m.W + nx] >= 0) return;
          this.depth[nz * m.W + nx] = this.depth[z * m.W + x] + 1;
          queue.push([nx, nz]);
        });
      }
    }

    height(x, z) { const m = this.map; return x < 0 || z < 0 || x >= m.W || z >= m.D ? -1 : m.heights[z][x]; }
    top(x, z) { const m = this.map; return x < 0 || z < 0 || x >= m.W || z >= m.D ? "O" : m.tops[z][x]; }
    isWater(x, z) { const t = this.top(x, z); return t === "O" || t === "R"; }

    baseColor(x, z, px, pz) {
      const t = this.top(x, z), h = this.height(x, z);
      const grain = 0.93 + PixelHash.at(px, pz) * 0.14;
      const patch = 0.92 + PixelHash.at(Math.floor(px / 3), Math.floor(pz / 3), 7) * 0.16;
      if (t === "O") { const d = Math.min(this.depth[z * this.map.W + x], 14); const k = 1 - d * 0.035; return [30 * k * patch, 78 * k * patch, 150 * k * patch]; }
      if (t === "R") { const wave = 0.9 + 0.2 * Math.sin((px + pz * 0.6) * 0.5 + PixelHash.at(x, z) * 6); return [62 * wave, 138 * wave, 208 * wave]; }
      if (t === "N") return [230 * grain, 212 * grain, 152 * grain];
      if (t === "W") return [246 * grain, 249 * grain, 252 * grain];
      if (t === "S") return [(126 + h * 1.5) * grain * patch, (126 + h * 1.5) * grain * patch, (132 + h * 1.5) * grain * patch];
      if (t === "D") return [146 * grain * patch, 108 * grain * patch, 70 * grain * patch];
      if (t === "P") return [198 * grain, 172 * grain, 118 * grain];
      return [(96 + h * 3) * grain * patch, (156 + h * 3) * grain * patch, (74 + h) * grain * patch];
    }

    draw(file) {
      const m = this.map, S = this.S;
      const canvas = new Canvas(m.W * S, m.D * S);
      for (let pz = 0; pz < m.D * S; pz++) for (let px = 0; px < m.W * S; px++) {
        const x = Math.floor(px / S), z = Math.floor(pz / S);
        let color = this.baseColor(x, z, px, pz);
        const h = this.height(x, z), t = this.top(x, z);
        if (!this.isWater(x, z)) {
          const slope = (h - this.height(x - 1, z - 1)) * 0.085 + (h - this.height(x, z - 1)) * 0.05 + (h - this.height(x - 1, z)) * 0.05;
          const cliffFace = h - this.height(x, z + 1) >= 2 && pz % S >= S - 3 && !this.isWater(x, z + 1);
          const k = Math.max(0.55, Math.min(1.35, 1 + slope + (h - 3) * 0.012)) * (cliffFace ? 0.62 : 1);
          color = color.map((v) => v * k);
          if (px % S === 0 || pz % S === 0) color = color.map((v) => v * 0.94);
          if (t === "N" || t === "G" || t === "D") {
            const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.isWater(x + dx, z + dz));
            if (nearWater && (px % S < 2 || pz % S < 2 || px % S > S - 3 || pz % S > S - 3) && PixelHash.at(px, pz, 3) > 0.45) color = [236, 244, 248];
          }
        } else if (t === "R") {
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.top(x + dx, z + dz) !== "R")) color = color.map((v) => v * 0.9);
          if (PixelHash.at(px, pz, 11) > 0.985) color = [210, 235, 250];
        } else if (PixelHash.at(px, pz, 12) > 0.992) color = [90, 150, 215];
        canvas.setPixel(px, pz, color);
      }
      this.drawTrees(canvas);
      this.drawStructures(canvas);
      canvas.save(file);
    }

    drawTrees(canvas) {
      const m = this.map, S = this.S;
      const inZone = new Set();
      m.anchors.jungleZones.forEach(([x0, z0]) => { for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) inZone.add((z0 + j) * m.W + x0 + i); });
      const tree = (cx, cy, r, shade) => {
        canvas.disc(cx + 1.2, cy + 1.6, r, [20, 50, 25], 0.45);
        canvas.disc(cx, cy, r, [38 * shade, 108 * shade, 48 * shade]);
        canvas.disc(cx - r * 0.3, cy - r * 0.3, r * 0.55, [66 * shade, 144 * shade, 70 * shade]);
      };
      for (let z = 0; z < m.D; z++) for (let x = 0; x < m.W; x++) {
        const key = z * m.W + x;
        if (m.tops[z][x] !== "G" || m.padCells.has(key) || m.pathCells.has(key)) continue;
        const jungle = inZone.has(key);
        const density = jungle ? 0.85 : Math.hypot(x - 60, z - 60) > 14 ? 0.07 + (m.heights[z][x] >= 3 ? 0.05 : 0) : 0;
        if (PixelHash.at(x, z, 21) > density) continue;
        tree((x + 0.3 + PixelHash.at(x, z, 22) * 0.4) * S, (z + 0.3 + PixelHash.at(x, z, 23) * 0.4) * S, jungle ? 5.6 : 4.2, 0.85 + PixelHash.at(x, z, 24) * 0.3);
      }
      for (let z = 0; z < m.D; z++) for (let x = 0; x < m.W; x++) {
        if (m.tops[z][x] !== "S" || PixelHash.at(x, z, 31) > 0.12) continue;
        canvas.disc((x + 0.5) * S, (z + 0.5) * S, 3.2, [96, 96, 104]);
        canvas.disc((x + 0.4) * S, (z + 0.4) * S, 1.6, [150, 150, 158]);
      }
    }

    drawStructures(canvas) {
      const m = this.map, S = this.S, a = m.anchors;
      canvas.ring(60.5 * S, 60.5 * S, 5.5 * S, 7, [214, 196, 150]);
      canvas.ring(60.5 * S, 60.5 * S, 5.5 * S - 7, 3, [170, 150, 110]);
      canvas.disc(60.5 * S, 60.5 * S, 9, [90, 60, 40]);
      canvas.disc(60.5 * S, 60.5 * S, 6, [255, 150, 30]);
      canvas.disc(60.5 * S, 60.5 * S, 3, [255, 235, 120]);
      const c = a.publicChest;
      canvas.rect(c.x * S, c.z * S, 2 * S, 2 * S, [70, 42, 20]);
      canvas.rect(c.x * S + 3, c.z * S + 3, 2 * S - 6, 2 * S - 6, [168, 112, 56]);
      canvas.rect(c.x * S + 3, c.z * S + S - 2, 2 * S - 6, 4, [230, 190, 60]);
      a.lots.forEach((l) => {
        const border = [120, 78, 44];
        canvas.rect(l.x * S, l.z * S, l.size * S, l.size * S, border);
        canvas.rect(l.x * S + 3, l.z * S + 3, l.size * S - 6, l.size * S - 6, [124, 168, 84]);
      });
      const farm = a.farm;
      for (let z = farm.z; z < farm.z + farm.d; z++) for (let x = farm.x; x < farm.x + farm.w; x++) {
        canvas.rect(x * S + 1, z * S + 1, S - 2, S - 2, [96, 62, 34]);
        canvas.rect(x * S + 2, z * S + 4, S - 4, 2, [60, 36, 18]);
        canvas.disc(x * S + 5, z * S + 5, 2, [90, 170, 70]);
      }
      farm.expand.forEach((e) => { for (let z = e.z; z < e.z + e.d; z++) for (let x = e.x; x < e.x + e.w; x++) canvas.rect(x * S + 1, z * S + 1, S - 2, S - 2, [118, 84, 52]); });
      Object.keys(a.bridges).forEach((id) => a.bridges[id].forEach(([x, z]) => {
        canvas.rect(x * S, z * S + 1, S, S - 2, [150, 100, 52]);
        for (let k = 0; k < S; k += 3) canvas.rect(x * S + k, z * S + 1, 1, S - 2, [96, 60, 28]);
      }));
      const portalColors = { fruit: [236, 64, 176], mine: [255, 214, 0], beach: [0, 210, 230], dungeon: [150, 64, 220] };
      Object.keys(a.portals).forEach((id) => {
        const p = a.portals[id], cx = (p.x + 0.5) * S, cy = (p.z + 0.5) * S;
        canvas.disc(cx, cy, 2.6 * S, portalColors[id], 0.28);
        canvas.ring(cx, cy, 1.9 * S, 5, [255, 255, 255]);
        canvas.ring(cx, cy, 1.9 * S - 5, 5, portalColors[id]);
        canvas.disc(cx, cy, 0.9 * S, portalColors[id], 0.8);
      });
    }
  }

  class CaveRenderer {
    static draw(maps, file, scale = 14) {
      const gap = 10;
      const width = maps.reduce((s, m) => s + m.w * scale + gap, gap);
      const height = Math.max(...maps.map((m) => m.d * scale)) + gap * 2;
      const canvas = new Canvas(width, height, [14, 14, 18]);
      let left = gap;
      maps.forEach((m) => { CaveRenderer.drawOne(canvas, m, left, gap, scale); left += m.w * scale + gap; });
      canvas.save(file);
    }

    static drawOne(canvas, m, ox, oy, S) {
      const cell = (x, z) => (z < 0 || z >= m.rows.length || x < 0 || x >= m.w ? "#" : m.rows[z][x]);
      const lights = (m.torches || []).map(([x, z]) => [x + 0.5, z + 0.5]);
      const glow = (fx, fz) => { let g = 0; lights.forEach(([lx, lz]) => { const d2 = (fx - lx) * (fx - lx) + (fz - lz) * (fz - lz); g += 1.6 / (1 + d2 * 0.06); }); return Math.min(1, g); };
      for (let pz = 0; pz < m.d * S; pz++) for (let px = 0; px < m.w * S; px++) {
        const x = Math.floor(px / S), z = Math.floor(pz / S);
        const c = cell(x, z);
        const g = glow(px / S, pz / S);
        const grain = 0.9 + PixelHash.at(px, pz, 5) * 0.2;
        const light = 0.72 + g * 0.45;
        const warm = [1 + g * 0.18, 1 + g * 0.04, 1 - g * 0.12];
        let color;
        if (c === ".") color = [168 * grain, 146 * grain, 108 * grain];
        else if (c === "~") color = [54 * (0.9 + 0.2 * Math.sin(px * 0.4 + pz * 0.3)), 118, 196];
        else if (c === "^") color = [236 * grain, (90 + 50 * PixelHash.at(Math.floor(px / 3), Math.floor(pz / 3), 9)) * grain, 24];
        else if (c === "X") color = [26 * grain, 24 * grain, 30 * grain];
        else {
          const faceSouth = cell(x, z + 1) !== "#" ;
          const rim = [[1, 0], [-1, 0], [0, -1]].some(([dx, dz]) => cell(x + dx, z + dz) !== "#");
          color = faceSouth ? [112 * grain, 104 * grain, 98 * grain] : rim ? [84 * grain, 80 * grain, 78 * grain] : [52 * grain, 50 * grain, 58 * grain];
        }
        if (px % S === 0 || pz % S === 0) color = color.map((v) => v * 0.93);
        canvas.setPixel(ox + px, oy + pz, color.map((v, k) => v * light * warm[k]));
      }
      (m.torches || []).forEach(([x, z]) => {
        canvas.disc(ox + (x + 0.5) * S, oy + (z + 0.5) * S, S * 0.9, [255, 200, 90], 0.25);
        canvas.disc(ox + (x + 0.5) * S, oy + (z + 0.5) * S, S * 0.28, [255, 232, 120]);
      });
      (m.oreSpots || []).forEach((cluster) => cluster.forEach(([x, z]) => {
        const cx = ox + (x + 0.5) * S, cy = oy + (z + 0.5) * S;
        canvas.disc(cx, cy, S * 0.46, [60, 56, 66]);
        [[-0.2, -0.15], [0.2, 0.1], [0, 0.25], [0.05, -0.28]].forEach(([dx, dz]) => canvas.disc(cx + dx * S, cy + dz * S, S * 0.13, [120, 236, 246]));
      }));
      (m.decor || []).forEach(([x, z]) => {
        const cx = ox + (x + 0.5) * S, cy = oy + (z + 0.5) * S;
        const tint = m.kind === "crystal" ? [110, 160, 255] : m.kind === "moss" ? [96, 200, 110] : [200, 90, 60];
        canvas.disc(cx, cy, S * 0.3, tint, 0.85);
      });
      (m.spawnSpots || []).forEach(([x, z]) => canvas.ring(ox + (x + 0.5) * S, oy + (z + 0.5) * S, S * 0.32, 2, [230, 60, 60]));
      if (m.ladderDown) { const [x, z] = m.ladderDown; for (let k = 0; k < 4; k++) canvas.rect(ox + x * S + 2, oy + z * S + 2 + k * 3, S - 4, 2, [80, 230, 110]); }
      canvas.ring(ox + (m.start[0] + 0.5) * S, oy + (m.start[1] + 0.5) * S, S * 0.5, 3, [255, 255, 255]);
    }
  }

  return { IslandRenderer, CaveRenderer };
};
