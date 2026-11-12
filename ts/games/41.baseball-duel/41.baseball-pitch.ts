class BbSeededRandom {
  private state: number;
  private spare: number | null = null;

  constructor(seed: number) { this.state = (seed >>> 0) || 0x9E3779B9; }

  next(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let mixed = this.state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  between(low: number, high: number): number { return low + (high - low) * this.next(); }
  chance(probability: number): boolean { return this.next() < probability; }
  pick<T>(items: readonly T[]): T { return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))]; }
  seed(): number { return Math.floor(this.next() * 4294967296) >>> 0; }

  gaussian(mean = 0, deviation = 1): number {
    if (this.spare !== null) { const kept = this.spare; this.spare = null; return mean + kept * deviation; }
    let u = 0;
    while (u < 1e-12) u = this.next();
    const radius = Math.sqrt(-2 * Math.log(u)), angle = 2 * Math.PI * this.next();
    this.spare = radius * Math.sin(angle);
    return mean + radius * Math.cos(angle) * deviation;
  }
}

interface BbMixturePart {
  weight: number;
  mean: number;
  deviation: number;
}

class BbMixtureSampler {
  static sample(parts: readonly BbMixturePart[], random: BbSeededRandom): number {
    let total = 0;
    for (const part of parts) total += part.weight;
    let roll = random.next() * total;
    for (const part of parts) {
      roll -= part.weight;
      if (roll <= 0) return random.gaussian(part.mean, part.deviation);
    }
    const last = parts[parts.length - 1];
    return random.gaussian(last.mean, last.deviation);
  }
}

type BbHand = "R" | "L";

interface BbAbilityItem {
  key: string;
  label: string;
  effect: string;
}

interface BbAbilityPlan {
  total: number;
  least: number;
  most: number;
  items: readonly BbAbilityItem[];
}

class BbAbilityAllocator {
  static readonly PITCHER: BbAbilityPlan = {
    total: 9, least: 1, most: 7,
    items: [{ key: "control", label: "제구", effect: "구종이 더 정확한 위치로 간다" }, { key: "power", label: "구위", effect: "구속이 더 빨라진다" }, { key: "breaking", label: "변화", effect: "변화구 종류가 늘고 각이 커진다" }]
  };
  static readonly BATTER: BbAbilityPlan = {
    total: 9, least: 1, most: 7,
    items: [{ key: "contact", label: "컨택", effect: "타격 타이밍이 더 여유로워진다" }, { key: "power", label: "파워", effect: "비거리 분포가 더 위로 올라간다" }, { key: "speed", label: "주루", effect: "땅볼 세이프가 늘고 더 많은 베이스를 간다" }]
  };

  readonly points: number[];

  constructor(readonly plan: BbAbilityPlan, points?: readonly number[]) {
    const even = Math.floor(plan.total / plan.items.length);
    this.points = points && BbAbilityAllocator.isValid(plan, points) ? points.slice() : plan.items.map(() => even);
  }

  static isValid(plan: BbAbilityPlan, points: readonly number[]): boolean {
    if (points.length !== plan.items.length) return false;
    let sum = 0;
    for (const value of points) {
      if (!Number.isInteger(value) || value < plan.least || value > plan.most) return false;
      sum += value;
    }
    return sum <= plan.total;
  }

  static everySplit(plan: BbAbilityPlan): number[][] {
    const found: number[][] = [];
    const fill = (prefix: number[], left: number) => {
      const slotsLeft = plan.items.length - prefix.length;
      if (slotsLeft === 1) { if (left >= plan.least && left <= plan.most) found.push([...prefix, left]); return; }
      for (let value = plan.least; value <= plan.most; value++) if (left - value >= plan.least * (slotsLeft - 1)) fill([...prefix, value], left - value);
    };
    fill([], plan.total);
    return found;
  }

  used(): number { return this.points.reduce((sum, value) => sum + value, 0); }
  spare(): number { return this.plan.total - this.used(); }
  canRaise(index: number): boolean { return this.spare() >= 1 && this.points[index] < this.plan.most; }
  canLower(index: number): boolean { return this.points[index] > this.plan.least; }
  raise(index: number): boolean { if (!this.canRaise(index)) return false; this.points[index]++; return true; }
  lower(index: number): boolean { if (!this.canLower(index)) return false; this.points[index]--; return true; }
}

interface BbPitcherAbilities {
  control: number;
  power: number;
  breaking: number;
}

type BbPitchId = "ft" | "cv" | "sl" | "ch" | "kn";

interface BbZonePoint {
  u: number;
  v: number;
}

abstract class BbPitchKind {
  abstract readonly id: BbPitchId;
  abstract readonly label: string;
  abstract readonly hotkey: string;
  abstract readonly axisDegrees: number;
  abstract readonly longSpread: number;
  abstract readonly shortSpread: number;
  abstract readonly cutRadius: number;
  abstract readonly isBreaking: boolean;
  readonly arrivalJitterSeconds: number = 0;

  abstract speedFor(abilities: BbPitcherAbilities): number;

  static fastballSpeed(power: number): number { return 126 + 3.5 * power; }

  axisRadians(hand: BbHand): number {
    const degrees = hand === "R" ? this.axisDegrees : 180 - this.axisDegrees;
    return degrees * Math.PI / 180;
  }

  longDeviation(abilities: BbPitcherAbilities): number {
    const scale = this.isBreaking ? BbPitchTuning.breakScale(abilities.breaking) : 1;
    return BbPitchTuning.sigmaFor(abilities.control) * this.longSpread * scale;
  }

  shortDeviation(abilities: BbPitcherAbilities): number { return BbPitchTuning.sigmaFor(abilities.control) * this.shortSpread; }

  reach(abilities: BbPitcherAbilities, hand: BbHand): BbZonePoint {
    const angle = this.axisRadians(hand), long = this.longDeviation(abilities) * this.cutRadius, short = this.shortDeviation(abilities) * this.cutRadius;
    return { u: Math.hypot(long * Math.cos(angle), short * Math.sin(angle)), v: Math.hypot(long * Math.sin(angle), short * Math.cos(angle)) };
  }
}

class BbPitchTuning {
  static readonly SIGMA_BY_CONTROL: readonly number[] = [0, 0.55, 0.46, 0.38, 0.32, 0.27, 0.23, 0.2];
  static readonly AIM_LIMIT = 2.2;
  static readonly FLIGHT_METERS = 17;
  static readonly FLIGHT_SCALE = 2.4;
  static readonly WINDUP_SECONDS = 0.9;

  static sigmaFor(control: number): number { return BbPitchTuning.SIGMA_BY_CONTROL[Math.max(1, Math.min(7, Math.round(control)))]; }
  static breakScale(breaking: number): number { return 1 + 0.1 * (breaking - 1); }
  static flightSeconds(speedKmh: number): number { return BbPitchTuning.FLIGHT_METERS / (speedKmh / 3.6) * BbPitchTuning.FLIGHT_SCALE; }
}

class BbFastball extends BbPitchKind {
  readonly id = "ft"; readonly label = "직구"; readonly hotkey = "Q"; readonly axisDegrees = 0;
  readonly longSpread = 1; readonly shortSpread = 1; readonly cutRadius = 2; readonly isBreaking = false;
  speedFor(abilities: BbPitcherAbilities): number { return BbPitchKind.fastballSpeed(abilities.power); }
}

class BbCurveball extends BbPitchKind {
  readonly id = "cv"; readonly label = "커브"; readonly hotkey = "W"; readonly axisDegrees = 60;
  readonly longSpread = 1.45; readonly shortSpread = 0.65; readonly cutRadius = 2; readonly isBreaking = true;
  speedFor(abilities: BbPitcherAbilities): number { return BbPitchKind.fastballSpeed(abilities.power) - 32; }
}

class BbSlider extends BbPitchKind {
  readonly id = "sl"; readonly label = "슬라이더"; readonly hotkey = "E"; readonly axisDegrees = 30;
  readonly longSpread = 1.5; readonly shortSpread = 0.65; readonly cutRadius = 2; readonly isBreaking = true;
  speedFor(abilities: BbPitcherAbilities): number { return BbPitchKind.fastballSpeed(abilities.power) - 17; }
}

class BbChangeup extends BbPitchKind {
  readonly id = "ch"; readonly label = "체인지업"; readonly hotkey = "A"; readonly axisDegrees = 120;
  readonly longSpread = 1.35; readonly shortSpread = 0.7; readonly cutRadius = 2; readonly isBreaking = true;
  speedFor(abilities: BbPitcherAbilities): number { return BbPitchKind.fastballSpeed(abilities.power) - 22; }
}

class BbKnuckleball extends BbPitchKind {
  readonly id = "kn"; readonly label = "너클"; readonly hotkey = "S"; readonly axisDegrees = 0;
  readonly longSpread = 1.3; readonly shortSpread = 1.3; readonly cutRadius = 2.2; readonly isBreaking = false;
  readonly arrivalJitterSeconds = 0.022;
  speedFor(abilities: BbPitcherAbilities): number { return 104 + 1.2 * abilities.power; }
}

class BbPitchCatalog {
  static readonly ALL: readonly BbPitchKind[] = [new BbFastball(), new BbCurveball(), new BbSlider(), new BbChangeup(), new BbKnuckleball()];
  static readonly BREAKING_ORDER: readonly BbPitchId[] = ["cv", "sl", "ch", "kn"];
  static of(id: BbPitchId): BbPitchKind { return BbPitchCatalog.ALL.find((kind) => kind.id === id) as BbPitchKind; }
}

class BbPitchSelection {
  static readonly KNUCKLE_NEEDS = 7;
  private chosen: BbPitchId[];

  constructor(private breaking: number, chosen?: readonly BbPitchId[]) {
    this.chosen = chosen ? chosen.filter((id) => this.isUnlocked(id)).slice(0, BbPitchSelection.slotsFor(breaking)) : [];
    if (!chosen) this.fillInOrder();
  }

  static slotsFor(breaking: number): number { return breaking >= 7 ? 4 : breaking >= 5 ? 3 : breaking >= 3 ? 2 : 1; }

  isUnlocked(id: BbPitchId): boolean { return id !== "kn" || this.breaking >= BbPitchSelection.KNUCKLE_NEEDS; }
  slots(): number { return BbPitchSelection.slotsFor(this.breaking); }
  spare(): number { return this.slots() - this.chosen.length; }
  isOn(id: BbPitchId): boolean { return this.chosen.indexOf(id) >= 0; }
  breakingPitches(): BbPitchId[] { return BbPitchCatalog.BREAKING_ORDER.filter((id) => this.isOn(id)); }
  usable(): BbPitchId[] { return ["ft", ...this.breakingPitches()]; }

  toggle(id: BbPitchId): boolean {
    if (this.isOn(id)) { this.chosen = this.chosen.filter((kept) => kept !== id); return true; }
    if (this.spare() < 1 || !this.isUnlocked(id)) return false;
    this.chosen.push(id);
    return true;
  }

  setBreaking(breaking: number): void {
    const grew = breaking > this.breaking;
    this.breaking = breaking;
    this.chosen = this.chosen.filter((id) => this.isUnlocked(id));
    while (this.chosen.length > this.slots()) this.dropLast();
    if (grew) this.fillInOrder();
  }

  private dropLast(): void {
    const order = BbPitchCatalog.BREAKING_ORDER;
    let last = this.chosen[0];
    for (const id of this.chosen) if (order.indexOf(id) > order.indexOf(last)) last = id;
    this.chosen = this.chosen.filter((id) => id !== last);
  }

  private fillInOrder(): void {
    for (const id of BbPitchCatalog.BREAKING_ORDER) if (this.spare() > 0 && !this.isOn(id) && this.isUnlocked(id)) this.chosen.push(id);
  }
}

class BbAimLimiter {
  static clamp(aim: BbZonePoint, kind: BbPitchKind, abilities: BbPitcherAbilities, hand: BbHand): BbZonePoint {
    const reach = kind.reach(abilities, hand), limitU = Math.max(0, BbPitchTuning.AIM_LIMIT - reach.u), limitV = Math.max(0, BbPitchTuning.AIM_LIMIT - reach.v);
    return { u: Math.max(-limitU, Math.min(limitU, aim.u)), v: Math.max(-limitV, Math.min(limitV, aim.v)) };
  }
}

class BbPitchLocationSampler {
  static sample(aim: BbZonePoint, kind: BbPitchKind, abilities: BbPitcherAbilities, hand: BbHand, random: BbSeededRandom): BbZonePoint {
    const long = kind.longDeviation(abilities), short = kind.shortDeviation(abilities), angle = kind.axisRadians(hand), limit = kind.cutRadius * kind.cutRadius;
    let along = 0, across = 0;
    for (let attempt = 0; attempt < 64; attempt++) {
      along = random.gaussian(); across = random.gaussian();
      if (along * along + across * across <= limit) break;
      if (attempt === 63) { along = 0; across = 0; }
    }
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return { u: aim.u + along * long * cos - across * short * sin, v: aim.v + along * long * sin + across * short * cos };
  }
}

interface BbPitchRoll {
  pitch: BbPitchId;
  aim: BbZonePoint;
  arrive: BbZonePoint;
  speed: number;
  flightSeconds: number;
  timingNoise: number;
  seed: number;
}

class BbPitchRoller {
  static readonly TIMING_NOISE_SECONDS = 0.007;

  static roll(pitch: BbPitchId, aim: BbZonePoint, abilities: BbPitcherAbilities, hand: BbHand, seed: number): BbPitchRoll {
    const random = new BbSeededRandom(seed), kind = BbPitchCatalog.of(pitch);
    const safeAim = BbAimLimiter.clamp(aim, kind, abilities, hand);
    const arrive = BbPitchLocationSampler.sample(safeAim, kind, abilities, hand, random), speed = kind.speedFor(abilities);
    const flightSeconds = BbPitchTuning.flightSeconds(speed) + random.gaussian(0, kind.arrivalJitterSeconds);
    return { pitch, aim: safeAim, arrive, speed, flightSeconds, timingNoise: random.gaussian(0, BbPitchRoller.TIMING_NOISE_SECONDS), seed };
  }
}
