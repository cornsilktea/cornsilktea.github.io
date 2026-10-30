type FrCanvas = CanvasRenderingContext2D;

abstract class FrIconPainter {
  protected static readonly LINE = "rgba(20, 24, 30, 0.85)";
  protected static readonly HANDLE = "#8A5A2B";
  protected static readonly HANDLE_DARK = "#5E3B18";

  abstract paint(g: FrCanvas, s: number): void;

  protected poly(g: FrCanvas, s: number, points: Array<[number, number]>, fill: string, stroke = true): void {
    g.beginPath();
    points.forEach(([x, y], i) => { if (i === 0) g.moveTo(x * s, y * s); else g.lineTo(x * s, y * s); });
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (stroke) { g.lineWidth = Math.max(1.5, s * 0.04); g.strokeStyle = FrIconPainter.LINE; g.stroke(); }
  }

  protected disc(g: FrCanvas, s: number, x: number, y: number, r: number, fill: string, stroke = true): void {
    g.beginPath();
    g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (stroke) { g.lineWidth = Math.max(1.5, s * 0.04); g.strokeStyle = FrIconPainter.LINE; g.stroke(); }
  }

  protected ellipse(g: FrCanvas, s: number, x: number, y: number, rx: number, ry: number, fill: string, rotation = 0): void {
    g.beginPath();
    g.ellipse(x * s, y * s, rx * s, ry * s, rotation, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = Math.max(1.5, s * 0.04);
    g.strokeStyle = FrIconPainter.LINE;
    g.stroke();
  }

  protected line(g: FrCanvas, s: number, x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
    g.beginPath();
    g.moveTo(x1 * s, y1 * s);
    g.lineTo(x2 * s, y2 * s);
    g.lineCap = "round";
    g.lineWidth = width * s;
    g.strokeStyle = color;
    g.stroke();
  }

  protected shine(g: FrCanvas, s: number, x: number, y: number, r: number): void {
    this.disc(g, s, x, y, r, "rgba(255, 255, 255, 0.7)", false);
  }

  protected shade(hex: string, factor: number): string {
    const n = parseInt(hex.slice(1), 16);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
    return "rgb(" + c((n >> 16) & 255) + "," + c((n >> 8) & 255) + "," + c(n & 255) + ")";
  }
}

class FrLogPainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.12, 0.34], [0.8, 0.2], [0.88, 0.42], [0.2, 0.58]], "#A9743F");
    this.poly(g, s, [[0.12, 0.34], [0.2, 0.58], [0.2, 0.74], [0.12, 0.52]], "#7A4E24");
    this.ellipse(g, s, 0.84, 0.31, 0.07, 0.12, "#E7C28A", 0.28);
    this.poly(g, s, [[0.18, 0.62], [0.84, 0.5], [0.9, 0.72], [0.24, 0.84]], "#B8814A");
    this.ellipse(g, s, 0.87, 0.61, 0.07, 0.12, "#EFCD97", 0.2);
  }
}

class FrLeafPainter extends FrIconPainter {
  constructor(private readonly color: string) { super(); }
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.15, 0.82], [0.2, 0.4], [0.5, 0.15], [0.85, 0.2], [0.8, 0.55], [0.5, 0.8]], this.color);
    this.line(g, s, 0.2, 0.8, 0.72, 0.28, this.shade(this.color, 0.6), 0.05);
  }
}

class FrFlowerPainter extends FrIconPainter {
  constructor(private readonly color: string) { super(); }
  paint(g: FrCanvas, s: number): void {
    this.line(g, s, 0.5, 0.52, 0.5, 0.92, "#3F8F3A", 0.07);
    [[0.5, 0.26], [0.74, 0.44], [0.64, 0.7], [0.36, 0.7], [0.26, 0.44]].forEach(([x, y]) => this.disc(g, s, x * 0.9 + 0.05, y * 0.8 + 0.06, 0.15, this.color));
    this.disc(g, s, 0.5, 0.48, 0.12, "#FFD94A");
  }
}

class FrFruitPainter extends FrIconPainter {
  constructor(private readonly color: string, private readonly shape: "round" | "pear" | "long" | "ear" | "leafy" | "star", private readonly leaf = "#3F9A3A") { super(); }
  paint(g: FrCanvas, s: number): void {
    if (this.shape === "round") {
      this.disc(g, s, 0.5, 0.56, 0.32, this.color);
      this.shine(g, s, 0.38, 0.44, 0.07);
      this.line(g, s, 0.5, 0.26, 0.54, 0.12, FrIconPainter.HANDLE, 0.05);
      this.poly(g, s, [[0.54, 0.16], [0.74, 0.1], [0.66, 0.26]], this.leaf);
    } else if (this.shape === "pear") {
      this.disc(g, s, 0.5, 0.64, 0.28, this.color);
      this.disc(g, s, 0.5, 0.4, 0.18, this.color);
      this.line(g, s, 0.5, 0.24, 0.54, 0.1, FrIconPainter.HANDLE, 0.05);
      this.shine(g, s, 0.4, 0.58, 0.06);
    } else if (this.shape === "long") {
      this.poly(g, s, [[0.38, 0.14], [0.62, 0.14], [0.58, 0.82], [0.5, 0.92], [0.42, 0.82]], this.color);
      this.poly(g, s, [[0.36, 0.14], [0.5, 0.02], [0.64, 0.14]], this.leaf);
    } else if (this.shape === "ear") {
      this.ellipse(g, s, 0.5, 0.52, 0.18, 0.36, this.color);
      this.poly(g, s, [[0.5, 0.9], [0.2, 0.4], [0.34, 0.45]], this.leaf);
      this.poly(g, s, [[0.5, 0.9], [0.8, 0.4], [0.66, 0.45]], this.leaf);
    } else if (this.shape === "leafy") {
      [[0.34, 0.5], [0.66, 0.5], [0.5, 0.34], [0.4, 0.68], [0.6, 0.68]].forEach(([x, y]) => this.disc(g, s, x, y, 0.2, this.color));
    } else {
      this.disc(g, s, 0.5, 0.56, 0.32, "#FFD43A");
      this.poly(g, s, [[0.5, 0.3], [0.56, 0.5], [0.76, 0.52], [0.6, 0.64], [0.66, 0.84], [0.5, 0.72], [0.34, 0.84], [0.4, 0.64], [0.24, 0.52], [0.44, 0.5]], "#FFF2A0", false);
      this.line(g, s, 0.5, 0.26, 0.54, 0.12, FrIconPainter.HANDLE, 0.05);
    }
  }
}

class FrShellPainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.5, 0.86], [0.12, 0.5], [0.22, 0.26], [0.5, 0.18], [0.78, 0.26], [0.88, 0.5]], "#F5C8D0");
    [0.3, 0.42, 0.5, 0.58, 0.7].forEach((x) => this.line(g, s, 0.5, 0.82, x, 0.26, "rgba(160, 80, 100, 0.55)", 0.03));
  }
}

class FrSaltPainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.22, 0.4], [0.78, 0.4], [0.7, 0.86], [0.3, 0.86]], "#F2F4F8");
    this.poly(g, s, [[0.22, 0.4], [0.3, 0.26], [0.7, 0.26], [0.78, 0.4]], "#D9DEE7");
    [[0.4, 0.6], [0.55, 0.7], [0.6, 0.55]].forEach(([x, y]) => this.disc(g, s, x, y, 0.025, "#9AA3B2", false));
  }
}

class FrSeaweedPainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    [0.3, 0.5, 0.7].forEach((x, i) => {
      g.beginPath();
      g.moveTo(x * s, 0.9 * s);
      g.bezierCurveTo((x + 0.15) * s, 0.65 * s, (x - 0.15) * s, 0.4 * s, (x + 0.05) * s, (0.1 + i * 0.05) * s);
      g.lineCap = "round";
      g.lineWidth = s * 0.1;
      g.strokeStyle = "#2F7A4A";
      g.stroke();
    });
  }
}

class FrSandPainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.1, 0.84], [0.34, 0.4], [0.5, 0.56], [0.66, 0.3], [0.9, 0.84]], "#E6D08F");
    [[0.4, 0.7], [0.6, 0.66], [0.52, 0.78]].forEach(([x, y]) => this.disc(g, s, x, y, 0.02, "#B8A064", false));
  }
}

class FrFishPainter extends FrIconPainter {
  constructor(private readonly body: string, private readonly belly: string, private readonly scale = 1) { super(); }
  paint(g: FrCanvas, s: number): void {
    const k = this.scale;
    this.poly(g, s, [[0.12, 0.5], [0.04, 0.3], [0.04, 0.7]], this.shade(this.body, 0.85));
    this.ellipse(g, s, 0.5, 0.5, 0.36 * k, 0.2 * k, this.body);
    this.ellipse(g, s, 0.54, 0.56, 0.28 * k, 0.1 * k, this.belly);
    this.poly(g, s, [[0.5, 0.32], [0.62, 0.18], [0.7, 0.34]], this.shade(this.body, 0.8));
    this.disc(g, s, 0.7, 0.45, 0.035, "#101418", false);
  }
}

class FrStonePainter extends FrIconPainter {
  constructor(private readonly color = "#9AA0AA", private readonly dots: string[] = []) { super(); }
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.12, 0.72], [0.2, 0.4], [0.42, 0.2], [0.7, 0.24], [0.88, 0.5], [0.82, 0.78], [0.5, 0.86]], this.color);
    this.poly(g, s, [[0.2, 0.4], [0.42, 0.2], [0.7, 0.24], [0.52, 0.42]], this.shade(this.color.charAt(0) === "#" ? this.color : "#9AA0AA", 1.15), false);
    this.dots.forEach((c, i) => this.disc(g, s, 0.32 + (i % 3) * 0.2, 0.5 + Math.floor(i / 3) * 0.18, 0.07, c));
  }
}

class FrIcePainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.5, 0.06], [0.74, 0.34], [0.64, 0.9], [0.36, 0.9], [0.26, 0.34]], "rgba(170, 230, 255, 0.95)");
    this.poly(g, s, [[0.5, 0.06], [0.74, 0.34], [0.5, 0.4], [0.26, 0.34]], "rgba(235, 250, 255, 0.95)", false);
    this.shine(g, s, 0.42, 0.6, 0.05);
  }
}

class FrGemPainter extends FrIconPainter {
  constructor(private readonly color: string) { super(); }
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.2, 0.34], [0.34, 0.14], [0.66, 0.14], [0.8, 0.34], [0.5, 0.88]], this.color);
    this.poly(g, s, [[0.2, 0.34], [0.8, 0.34], [0.5, 0.88]], this.shade(this.color, 0.82), false);
    this.poly(g, s, [[0.34, 0.14], [0.66, 0.14], [0.8, 0.34], [0.2, 0.34]], this.shade(this.color, 1.2), false);
    this.line(g, s, 0.5, 0.14, 0.4, 0.34, "rgba(255,255,255,0.6)", 0.025);
    this.shine(g, s, 0.4, 0.26, 0.04);
  }
}

class FrSeedPainter extends FrIconPainter {
  constructor(private readonly color: string) { super(); }
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.26, 0.34], [0.74, 0.34], [0.8, 0.88], [0.2, 0.88]], "#D9C08A");
    this.poly(g, s, [[0.26, 0.34], [0.34, 0.22], [0.66, 0.22], [0.74, 0.34]], "#B89A62");
    this.ellipse(g, s, 0.5, 0.62, 0.14, 0.1, this.color);
  }
}

class FrBonePainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    this.line(g, s, 0.26, 0.74, 0.74, 0.26, "#F2EDE0", 0.14);
    [[0.2, 0.62], [0.3, 0.84], [0.8, 0.38], [0.7, 0.16]].forEach(([x, y]) => this.disc(g, s, x, y, 0.09, "#F2EDE0"));
  }
}

class FrClothPainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.16, 0.22], [0.84, 0.18], [0.78, 0.8], [0.5, 0.74], [0.2, 0.84]], "#E9E2CF");
    this.line(g, s, 0.26, 0.4, 0.74, 0.38, "rgba(160,140,100,0.5)", 0.025);
    this.line(g, s, 0.26, 0.56, 0.72, 0.54, "rgba(160,140,100,0.5)", 0.025);
  }
}

class FrRingPainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    g.beginPath();
    g.arc(0.5 * s, 0.58 * s, 0.26 * s, 0, Math.PI * 2);
    g.lineWidth = s * 0.1;
    g.strokeStyle = "#F0B83A";
    g.stroke();
    this.poly(g, s, [[0.5, 0.14], [0.62, 0.26], [0.5, 0.36], [0.38, 0.26]], "#FF7A5A");
    this.shine(g, s, 0.46, 0.24, 0.025);
  }
}

class FrPlankPainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    [0.2, 0.42, 0.64].forEach((y, i) => this.poly(g, s, [[0.1 + i * 0.03, y], [0.9, y], [0.9, y + 0.18], [0.1 + i * 0.03, y + 0.18]], i % 2 ? "#D2A06B" : "#C28F58"));
  }
}

class FrRopePainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    for (let i = 0; i < 3; i++) this.ellipse(g, s, 0.5, 0.5, 0.34 - i * 0.07, 0.26 - i * 0.05, i % 2 ? "rgba(0,0,0,0)" : "#D8C08A");
    g.beginPath();
    g.arc(0.5 * s, 0.5 * s, 0.2 * s, 0, Math.PI * 2);
    g.fillStyle = "rgba(0,0,0,0.0)";
    g.fill();
  }
}

class FrBrickPainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.1, 0.24], [0.9, 0.24], [0.9, 0.78], [0.1, 0.78]], "#B0B3BA");
    this.line(g, s, 0.1, 0.51, 0.9, 0.51, FrIconPainter.LINE, 0.025);
    this.line(g, s, 0.4, 0.24, 0.4, 0.51, FrIconPainter.LINE, 0.025);
    this.line(g, s, 0.66, 0.51, 0.66, 0.78, FrIconPainter.LINE, 0.025);
  }
}

class FrGlassPainter extends FrIconPainter {
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.16, 0.16], [0.84, 0.16], [0.84, 0.84], [0.16, 0.84]], "rgba(180, 225, 245, 0.75)");
    this.line(g, s, 0.28, 0.7, 0.7, 0.26, "rgba(255,255,255,0.8)", 0.05);
    this.line(g, s, 0.28, 0.5, 0.5, 0.28, "rgba(255,255,255,0.8)", 0.03);
  }
}

class FrDyePainter extends FrIconPainter {
  constructor(private readonly color: string) { super(); }
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.5, 0.1], [0.74, 0.5], [0.7, 0.74], [0.5, 0.88], [0.3, 0.74], [0.26, 0.5]], this.color);
    this.shine(g, s, 0.4, 0.55, 0.05);
  }
}

class FrBlockPainter extends FrIconPainter {
  constructor(private readonly top: string, private readonly left: string, private readonly right: string, readonly shapeKind: "cube" | "stairs" | "slab" | "fence" | "door" | "window" | "torch" = "cube") { super(); }
  paint(g: FrCanvas, s: number): void {
    if (this.shapeKind === "torch") {
      this.line(g, s, 0.5, 0.88, 0.5, 0.4, "#6B4423", 0.12);
      this.disc(g, s, 0.5, 0.3, 0.16, "#FFB02E");
      this.disc(g, s, 0.5, 0.3, 0.08, "#FFF0A0", false);
      return;
    }
    if (this.shapeKind === "door") { this.poly(g, s, [[0.28, 0.1], [0.72, 0.1], [0.72, 0.9], [0.28, 0.9]], this.left); this.disc(g, s, 0.64, 0.52, 0.04, "#F0D060"); return; }
    if (this.shapeKind === "window") { this.poly(g, s, [[0.14, 0.14], [0.86, 0.14], [0.86, 0.86], [0.14, 0.86]], this.left); this.poly(g, s, [[0.26, 0.26], [0.74, 0.26], [0.74, 0.74], [0.26, 0.74]], "rgba(190,230,250,0.85)"); return; }
    const h = this.shapeKind === "slab" ? 0.18 : 0.36;
    const y0 = this.shapeKind === "slab" ? 0.42 : 0.2;
    this.poly(g, s, [[0.5, y0], [0.86, y0 + 0.16], [0.5, y0 + 0.32], [0.14, y0 + 0.16]], this.top);
    this.poly(g, s, [[0.14, y0 + 0.16], [0.5, y0 + 0.32], [0.5, y0 + 0.32 + h], [0.14, y0 + 0.16 + h]], this.left);
    this.poly(g, s, [[0.86, y0 + 0.16], [0.5, y0 + 0.32], [0.5, y0 + 0.32 + h], [0.86, y0 + 0.16 + h]], this.right);
    if (this.shapeKind === "stairs") this.poly(g, s, [[0.5, y0 - 0.08], [0.86, y0 + 0.08], [0.5, y0 + 0.24], [0.14, y0 + 0.08]], this.top);
    if (this.shapeKind === "fence") [0.3, 0.5, 0.7].forEach((x) => this.line(g, s, x, 0.3, x, 0.84, "#6B4423", 0.07));
  }
}

class FrFoodPainter extends FrIconPainter {
  constructor(private readonly food: string, private readonly star: number) { super(); }
  paint(g: FrCanvas, s: number): void {
    this.ellipse(g, s, 0.5, 0.68, 0.4, 0.16, "#F5F1E8");
    this.ellipse(g, s, 0.5, 0.64, 0.3, 0.1, "#E6DFCF");
    this.ellipse(g, s, 0.5, 0.48, 0.24, 0.2, this.food);
    this.shine(g, s, 0.42, 0.4, 0.05);
    for (let i = 0; i < this.star; i++) this.disc(g, s, 0.2 + i * 0.14, 0.14, 0.05, "#FFD43A");
  }
}

class FrToolIcon extends FrIconPainter {
  constructor(protected readonly metal: string) { super(); }
  paint(g: FrCanvas, s: number): void { this.line(g, s, 0.2, 0.86, 0.72, 0.22, FrIconPainter.HANDLE, 0.1); }
}

class FrAxePainter extends FrToolIcon {
  paint(g: FrCanvas, s: number): void {
    super.paint(g, s);
    this.poly(g, s, [[0.5, 0.18], [0.8, 0.12], [0.9, 0.36], [0.62, 0.46], [0.54, 0.34]], this.metal);
    this.line(g, s, 0.62, 0.2, 0.82, 0.32, "rgba(255,255,255,0.55)", 0.03);
  }
}

class FrPickaxePainter extends FrToolIcon {
  paint(g: FrCanvas, s: number): void {
    super.paint(g, s);
    g.beginPath();
    g.moveTo(0.2 * s, 0.5 * s);
    g.quadraticCurveTo(0.5 * s, 0.1 * s, 0.9 * s, 0.34 * s);
    g.lineCap = "round";
    g.lineWidth = s * 0.14;
    g.strokeStyle = FrIconPainter.LINE;
    g.stroke();
    g.lineWidth = s * 0.09;
    g.strokeStyle = this.metal;
    g.stroke();
  }
}

class FrShovelPainter extends FrToolIcon {
  paint(g: FrCanvas, s: number): void {
    super.paint(g, s);
    this.poly(g, s, [[0.58, 0.14], [0.86, 0.3], [0.78, 0.5], [0.52, 0.4]], this.metal);
  }
}

class FrRodPainter extends FrToolIcon {
  paint(g: FrCanvas, s: number): void {
    this.line(g, s, 0.14, 0.88, 0.82, 0.14, FrIconPainter.HANDLE, 0.07);
    this.line(g, s, 0.82, 0.14, 0.88, 0.58, "rgba(230,230,230,0.9)", 0.015);
    this.disc(g, s, 0.88, 0.62, 0.05, "#D94F4F");
    this.disc(g, s, 0.3, 0.7, 0.08, this.metal);
  }
}

class FrBasketPainter extends FrToolIcon {
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.16, 0.44], [0.84, 0.44], [0.74, 0.86], [0.26, 0.86]], this.metal);
    g.beginPath();
    g.arc(0.5 * s, 0.44 * s, 0.34 * s, Math.PI, 0);
    g.lineWidth = s * 0.06;
    g.strokeStyle = FrIconPainter.HANDLE_DARK;
    g.stroke();
    [0.58, 0.7].forEach((y) => this.line(g, s, 0.2, y, 0.8, y, "rgba(0,0,0,0.25)", 0.03));
  }
}

class FrSwordPainter extends FrToolIcon {
  paint(g: FrCanvas, s: number): void {
    this.poly(g, s, [[0.76, 0.1], [0.86, 0.2], [0.34, 0.66], [0.26, 0.58]], this.metal);
    this.line(g, s, 0.24, 0.52, 0.5, 0.78, "#8A6A2B", 0.07);
    this.line(g, s, 0.22, 0.8, 0.34, 0.68, FrIconPainter.HANDLE, 0.09);
  }
}

class FrArmorPainter extends FrToolIcon {
  constructor(metal: string, private readonly part: "helmet" | "top" | "bottom" | "shoes") { super(metal); }
  paint(g: FrCanvas, s: number): void {
    if (this.part === "helmet") {
      this.poly(g, s, [[0.18, 0.62], [0.2, 0.34], [0.5, 0.16], [0.8, 0.34], [0.82, 0.62], [0.66, 0.62], [0.66, 0.5], [0.34, 0.5], [0.34, 0.62]], this.metal);
    } else if (this.part === "top") {
      this.poly(g, s, [[0.3, 0.14], [0.7, 0.14], [0.92, 0.3], [0.8, 0.46], [0.7, 0.4], [0.7, 0.88], [0.3, 0.88], [0.3, 0.4], [0.2, 0.46], [0.08, 0.3]], this.metal);
    } else if (this.part === "bottom") {
      this.poly(g, s, [[0.28, 0.12], [0.72, 0.12], [0.74, 0.88], [0.54, 0.88], [0.5, 0.4], [0.46, 0.88], [0.26, 0.88]], this.metal);
    } else {
      this.poly(g, s, [[0.22, 0.2], [0.5, 0.2], [0.52, 0.56], [0.86, 0.66], [0.86, 0.82], [0.22, 0.82]], this.metal);
    }
  }
}

class FrIcons {
  static readonly SIZE = 64;
  static readonly TIER_COLORS: ReadonlyArray<string> = ["#9AA0AA", "#B8814A", "#C9D0D8", "#52E3EA"];
  private static readonly cache = new Map<string, string>();

  static url(id: string): string {
    const cached = FrIcons.cache.get(id);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = FrIcons.SIZE;
    const g = canvas.getContext("2d");
    if (g) FrIcons.painterFor(id).paint(g, FrIcons.SIZE);
    const url = canvas.toDataURL("image/png");
    FrIcons.cache.set(id, url);
    return url;
  }

  static image(id: string, pixels = 40): HTMLImageElement {
    const image = document.createElement("img");
    image.src = FrIcons.url(id);
    image.width = image.height = pixels;
    image.className = "fr-icon";
    image.alt = FrItemNames.label(id);
    image.draggable = false;
    return image;
  }

  private static gear(kind: string, tier: number): FrIconPainter {
    const metal = FrIcons.TIER_COLORS[tier];
    const makers: Record<string, () => FrIconPainter> = {
      axe: () => new FrAxePainter(metal), pickaxe: () => new FrPickaxePainter(metal), shovel: () => new FrShovelPainter(metal),
      rod: () => new FrRodPainter(metal), basket: () => new FrBasketPainter(metal), weapon: () => new FrSwordPainter(metal),
      helmet: () => new FrArmorPainter(metal, "helmet"), top: () => new FrArmorPainter(metal, "top"),
      bottom: () => new FrArmorPainter(metal, "bottom"), shoes: () => new FrArmorPainter(metal, "shoes"),
    };
    return makers[kind]();
  }

  private static readonly FLOWER_COLORS = ["#E8514F", "#F5C93A", "#4F8FE8", "#F4F4F4"];
  private static readonly DYE_COLORS = ["#E8514F", "#F5C93A", "#4F8FE8", "#58B85A"];

  private static readonly FIXED: Readonly<Record<string, () => FrIconPainter>> = {
    wood: () => new FrLogPainter(), vine: () => new FrLeafPainter("#4DAA4A"),
    apple: () => new FrFruitPainter("#E5483F", "round"), pear: () => new FrFruitPainter("#C8D95A", "pear"), orange: () => new FrFruitPainter("#F29A2E", "round"),
    peach: () => new FrFruitPainter("#F7A9A0", "round"), mango: () => new FrFruitPainter("#F5B93A", "pear"), golden_apple: () => new FrFruitPainter("#FFD43A", "star"),
    shell: () => new FrShellPainter(), salt: () => new FrSaltPainter(), seaweed: () => new FrSeaweedPainter(), sand: () => new FrSandPainter(),
    stone: () => new FrStonePainter(), coal: () => new FrStonePainter("#3A3D44"), copper: () => new FrStonePainter("#8F949E", ["#D9823E", "#D9823E", "#D9823E"]),
    iron: () => new FrStonePainter("#8F949E", ["#E8E2D8", "#E8E2D8", "#E8E2D8"]), ice: () => new FrIcePainter(), diamond: () => new FrGemPainter("#52E3EA"),
    bone: () => new FrBonePainter(), cloth: () => new FrClothPainter(), magic_stone: () => new FrGemPainter("#A66BFF"), enhance_stone: () => new FrGemPainter("#58D88B"),
    ring: () => new FrRingPainter(), plank: () => new FrPlankPainter(), rope: () => new FrRopePainter(), brick: () => new FrBrickPainter(), glass: () => new FrGlassPainter(),
  };

  private static readonly CROPS: Readonly<Record<string, () => FrIconPainter>> = {
    potato: () => new FrFruitPainter("#C69A5A", "pear", "#7A5A2A"), carrot: () => new FrFruitPainter("#F0872E", "long"), lettuce: () => new FrFruitPainter("#7CCB5A", "leafy"),
    onion: () => new FrFruitPainter("#E8D2A0", "pear"), wheat: () => new FrFruitPainter("#E8C45A", "ear"), rice: () => new FrFruitPainter("#F0EBD2", "ear"),
    tomato: () => new FrFruitPainter("#E5483F", "round"), corn: () => new FrFruitPainter("#F5D24A", "ear", "#58B85A"), chili: () => new FrFruitPainter("#D9372F", "long"),
    pumpkin: () => new FrFruitPainter("#F08A2E", "round"), strawberry: () => new FrFruitPainter("#E5384F", "round"), watermelon: () => new FrFruitPainter("#4FA55A", "round"),
  };

  private static readonly FISH: Readonly<Record<string, [string, string, number]>> = {
    anchovy: ["#7AA2C8", "#E8EEF4", 0.8], sardine: ["#6F8FB8", "#E8EEF4", 0.85], horse_mackerel: ["#8AA8B8", "#F0F0E8", 0.9], mackerel: ["#4F7FA8", "#EDEDE0", 0.95], goby: ["#A8906A", "#E8DCC0", 0.8],
    sea_bream: ["#E8736F", "#F8D8D0", 1.05], sea_bass: ["#8A98A8", "#E8ECF0", 1.05], flounder: ["#B8A06A", "#E8DCC0", 1.1], squid: ["#F0C0C8", "#F8E8EC", 0.9], octopus: ["#C8584F", "#E8A89F", 0.95],
    tuna: ["#3A5F9A", "#D8E4F0", 1.15], swordfish: ["#4A6A8A", "#D8E4F0", 1.15], rainbow_fish: ["#D86FE8", "#9FE8F0", 1.1],
  };

  static painterFor(id: string): FrIconPainter {
    const fixed = FrIcons.FIXED[id];
    if (fixed) return fixed();
    if (FrIcons.CROPS[id]) return FrIcons.CROPS[id]();
    if (FrIcons.FISH[id]) { const f = FrIcons.FISH[id]; return new FrFishPainter(f[0], f[1], f[2]); }
    const flower = /^flower_(\d)$/.exec(id);
    if (flower) return new FrFlowerPainter(FrIcons.FLOWER_COLORS[Number(flower[1])]);
    const dye = /^dye_(\d)$/.exec(id);
    if (dye) return new FrDyePainter(FrIcons.DYE_COLORS[Number(dye[1])]);
    const seed = /^(\w+)_seed$/.exec(id);
    if (seed) { const crop = FrCatalog.CROPS.find((c) => c.id === seed[1]); return new FrSeedPainter(crop ? FrItemNames.GRADE_COLORS[crop.grade] : "#8A6A3A"); }
    const gear = FrItems.parseGear(id);
    if (gear) return FrIcons.gear(gear.kind, gear.tier);
    const block = /^block_(\w+)$/.exec(id);
    if (block) return FrIcons.blockPainter(block[1]);
    const recipe = FrCatalog.RECIPES.find((r) => r.id === id);
    if (recipe) return new FrFoodPainter(["#D9A05A", "#E8B070", "#C8794F", "#C04F3A", "#8A4FC0", "#F0C040"][recipe.star] || "#D9A05A", recipe.star);
    return new FrStonePainter("#B0B6C2");
  }

  private static blockPainter(name: string): FrIconPainter {
    const colors: Record<string, [string, string, string]> = {
      dirt: ["#8A6038", "#6F4B2B", "#5E3F24"], grass: ["#6FB84A", "#8A6038", "#6F4B2B"], sand: ["#EAD79A", "#D4BE7E", "#C2AC6C"], stone: ["#A6A9B0", "#8A8D94", "#74777E"],
      ice: ["#CFF0FF", "#A8DAF0", "#92C8E2"], brick: ["#B9BCC2", "#9A9DA4", "#84878E"], wood: ["#C28F58", "#9A6E3E", "#80582E"], plank: ["#D9AB74", "#B88A55", "#9C7144"],
      glass: ["#D6F0FA", "#BCE0F0", "#A8D0E4"], color_0: ["#F26B67", "#D9514D", "#BE3F3B"], color_1: ["#F8D860", "#DDBC42", "#C4A432"], color_2: ["#6FA8F2", "#5489D9", "#4373BE"], color_3: ["#74CF70", "#58B455", "#459C43"],
    };
    const kinds: Record<string, FrBlockPainter["shapeKind"]> = { stairs: "stairs", slab: "slab", fence: "fence", door: "door", window: "window", torch: "torch" };
    const base = colors[name] || colors.wood;
    const shapeKind = kinds[name] || "cube";
    return new FrBlockPainter(base[0], base[1], base[2], shapeKind);
  }
}
