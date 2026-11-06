class MathUtil {
  static clamp(value: number, low: number, high: number): number {
    return value < low ? low : value > high ? high : value;
  }

  static lerp(from: number, to: number, ratio: number): number {
    return from + (to - from) * ratio;
  }

  static round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  static angleDifference(a: number, b: number): number {
    let difference = a - b;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    return difference;
  }

  static distance(ax: number, az: number, bx: number, bz: number): number {
    return Math.hypot(ax - bx, az - bz);
  }
}

class Html {
  private static readonly ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

  static escape(text: string): string {
    return String(text).replace(/[&<>"]/g, (character) => Html.ESCAPES[character]);
  }
}

interface RandomSource {
  next(): number;
}

class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let mixed = this.state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }
}

class RandomRange {
  constructor(private readonly source: RandomSource) {}

  next(): number {
    return this.source.next();
  }

  between(low: number, high: number): number {
    return low + this.source.next() * (high - low);
  }

  chance(probability: number): boolean {
    return this.source.next() < probability;
  }

  index(length: number): number {
    return Math.floor(this.source.next() * length);
  }
}

class TokenSource {
  constructor(private readonly random: RandomRange) {}

  token(length: number): string {
    return this.random.next().toString(36).slice(2, 2 + length);
  }

  digits(count: number): string {
    return String(Math.pow(10, count - 1) + this.random.index(9 * Math.pow(10, count - 1)));
  }
}

interface Clock {
  now(): number;
}

class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

class OffsetClock implements Clock {
  private offset = 0;

  setOffset(offsetMs: number): void {
    this.offset = offsetMs;
  }

  now(): number {
    return Date.now() + this.offset;
  }
}
