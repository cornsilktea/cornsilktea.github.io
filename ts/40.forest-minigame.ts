type FrMiniState = "waiting" | "running" | "success" | "fail";
type FrTaskKind = "shake" | "chop" | "gatherRing" | "harvest" | "dig" | "stone" | "snow" | "vein" | "hardRock";

abstract class FrMiniGame {
  state: FrMiniState = "waiting";
  protected elapsed = 0;
  protected abstract readonly timeLimit: number;
  protected readonly firstPressCounts: boolean = true;

  press(): void {
    if (this.state === "waiting" && !this.firstPressCounts) { this.begin(); return; }
    this.begin();
    this.onPress();
  }
  release(): void { if (this.state === "running") this.onRelease(); }

  tick(dt: number): void {
    if (this.state !== "running") return;
    this.elapsed += dt;
    this.onTick(dt);
    if (this.state === "running" && this.elapsed >= this.timeLimit) this.state = "fail";
  }

  progress(): number { return 0; }

  protected begin(): void { if (this.state === "waiting") this.state = "running"; }
  protected succeed(): void { this.state = "success"; }
  protected failNow(): void { this.state = "fail"; }
  protected abstract onPress(): void;
  protected onRelease(): void {}
  protected onTick(_dt: number): void {}
}

class FrMashGauge extends FrMiniGame {
  protected readonly timeLimit = 3;
  private gauge = 0;
  constructor(readonly pressesNeeded: number, private readonly decayPerSecond = 0.4) { super(); }
  protected onPress(): void {
    if (this.state !== "running") return;
    this.gauge += 1;
    if (this.gauge >= this.pressesNeeded) this.succeed();
  }
  protected onTick(dt: number): void { this.gauge = Math.max(0, this.gauge - this.decayPerSecond * dt); }
  progress(): number { return Math.min(1, this.gauge / this.pressesNeeded); }
}

class FrCenterStop extends FrMiniGame {
  protected readonly timeLimit = 8;
  protected readonly firstPressCounts = false;
  private hits = 0;
  constructor(readonly greenFraction: number, readonly hitsNeeded: number, readonly period = 1.4) { super(); }
  needle(): number {
    const phase = (this.elapsed / this.period) % 1;
    return phase < 0.5 ? phase * 2 : 2 - phase * 2;
  }
  protected onPress(): void {
    if (this.state !== "running") return;
    if (Math.abs(this.needle() - 0.5) > this.greenFraction / 2) { this.failNow(); return; }
    this.hits += 1;
    if (this.hits >= this.hitsNeeded) this.succeed();
  }
  progress(): number { return this.hits / this.hitsNeeded; }
}

class FrShrinkRing extends FrMiniGame {
  protected readonly timeLimit = 3;
  protected readonly firstPressCounts = false;
  constructor(readonly tolerance: number, readonly shrinkSeconds = 1.2, readonly targetRadius = 0.35) { super(); }
  radius(): number { return 1 - (1 - this.targetRadius) * (this.elapsed / this.shrinkSeconds); }
  protected onPress(): void {
    if (this.state !== "running") return;
    if (Math.abs(this.radius() - this.targetRadius) <= this.tolerance) this.succeed(); else this.failNow();
  }
  protected onTick(): void {
    if (this.radius() < this.targetRadius - this.tolerance) this.failNow();
  }
}

class FrHoldRelease extends FrMiniGame {
  protected readonly timeLimit = 8;
  private holding = false;
  private holdTime = 0;
  constructor(readonly greenFraction: number, readonly riseSeconds = 1, readonly center = 0.8) { super(); }
  bar(): number {
    const phase = (this.holdTime / this.riseSeconds) % 2;
    return phase <= 1 ? phase : 2 - phase;
  }
  protected onPress(): void { this.holding = true; this.holdTime = 0; }
  protected onTick(dt: number): void { if (this.holding) this.holdTime += dt; }
  protected onRelease(): void {
    this.holding = false;
    if (Math.abs(this.bar() - this.center) <= this.greenFraction / 2) this.succeed(); else this.failNow();
  }
  progress(): number { return this.bar(); }
}

type FrMiniBuilder = (tier: FrTier) => FrMiniGame | null;

class FrMiniGameFactory {
  private static readonly BUILDERS: Readonly<Record<FrTaskKind, FrMiniBuilder>> = {
    shake: () => new FrMashGauge(12),
    chop: (t) => new FrCenterStop(FrBalance.AXE_GREEN[t], FrBalance.AXE_HITS[t]),
    gatherRing: () => new FrShrinkRing(0.12),
    harvest: () => new FrHoldRelease(0.25),
    dig: (t) => (FrBalance.SHOVEL_MASH[t] > 0 ? new FrMashGauge(FrBalance.SHOVEL_MASH[t]) : null),
    stone: (t) => new FrMashGauge(FrBalance.PICK_STONE_MASH[t]),
    snow: (t) => (FrBalance.PICK_SNOW_GREEN[t] > 0 ? new FrHoldRelease(FrBalance.PICK_SNOW_GREEN[t]) : null),
    vein: (t) => new FrCenterStop(FrBalance.PICK_VEIN_GREEN[t], 1),
    hardRock: (t) => (FrBalance.PICK_HARD_MASH[t] > 0 ? new FrMashGauge(FrBalance.PICK_HARD_MASH[t]) : null),
  };

  private static readonly TOOL_FREE: ReadonlyArray<FrTaskKind> = ["shake", "gatherRing", "harvest"];
  private static readonly KINDS: ReadonlyArray<(ease: number) => FrMiniGame> = [
    (e) => new FrMashGauge(Math.round(14 - 6 * e)),
    (e) => new FrCenterStop(0.12 + 0.12 * e, e < 0.5 ? 2 : 1),
    (e) => new FrShrinkRing(0.1 + 0.06 * e),
    (e) => new FrHoldRelease(0.18 + 0.12 * e),
  ];

  static create(task: FrTaskKind, tier: FrTier): FrMiniGame | null {
    return FrMiniGameFactory.BUILDERS[task](tier);
  }

  static ease(task: FrTaskKind, tier: FrTier): number {
    return FrMiniGameFactory.TOOL_FREE.indexOf(task) >= 0 ? 0.5 : tier / 3;
  }

  static createVaried(task: FrTaskKind, tier: FrTier, roll: number): FrMiniGame | null {
    if (!FrMiniGameFactory.create(task, tier)) return null;
    const pick = Math.min(FrMiniGameFactory.KINDS.length - 1, Math.floor(roll * FrMiniGameFactory.KINDS.length));
    return FrMiniGameFactory.KINDS[pick](FrMiniGameFactory.ease(task, tier));
  }
}
