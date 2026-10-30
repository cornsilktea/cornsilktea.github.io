"use strict";
class FrMiniGame {
    constructor() {
        this.state = "waiting";
        this.elapsed = 0;
        this.firstPressCounts = true;
    }
    press() {
        if (this.state === "waiting" && !this.firstPressCounts) {
            this.begin();
            return;
        }
        this.begin();
        this.onPress();
    }
    release() { if (this.state === "running")
        this.onRelease(); }
    tick(dt) {
        if (this.state !== "running")
            return;
        this.elapsed += dt;
        this.onTick(dt);
        if (this.state === "running" && this.elapsed >= this.timeLimit)
            this.state = "fail";
    }
    progress() { return 0; }
    begin() { if (this.state === "waiting")
        this.state = "running"; }
    succeed() { this.state = "success"; }
    failNow() { this.state = "fail"; }
    onRelease() { }
    onTick(_dt) { }
}
class FrMashGauge extends FrMiniGame {
    constructor(pressesNeeded, decayPerSecond = 0.4) {
        super();
        this.pressesNeeded = pressesNeeded;
        this.decayPerSecond = decayPerSecond;
        this.timeLimit = 3;
        this.gauge = 0;
    }
    onPress() {
        if (this.state !== "running")
            return;
        this.gauge += 1;
        if (this.gauge >= this.pressesNeeded)
            this.succeed();
    }
    onTick(dt) { this.gauge = Math.max(0, this.gauge - this.decayPerSecond * dt); }
    progress() { return Math.min(1, this.gauge / this.pressesNeeded); }
}
class FrCenterStop extends FrMiniGame {
    constructor(greenFraction, hitsNeeded, period = 1.4) {
        super();
        this.greenFraction = greenFraction;
        this.hitsNeeded = hitsNeeded;
        this.period = period;
        this.timeLimit = 8;
        this.firstPressCounts = false;
        this.hits = 0;
    }
    needle() {
        const phase = (this.elapsed / this.period) % 1;
        return phase < 0.5 ? phase * 2 : 2 - phase * 2;
    }
    onPress() {
        if (this.state !== "running")
            return;
        if (Math.abs(this.needle() - 0.5) > this.greenFraction / 2) {
            this.failNow();
            return;
        }
        this.hits += 1;
        if (this.hits >= this.hitsNeeded)
            this.succeed();
    }
    progress() { return this.hits / this.hitsNeeded; }
}
class FrShrinkRing extends FrMiniGame {
    constructor(tolerance, shrinkSeconds = 1.2, targetRadius = 0.35) {
        super();
        this.tolerance = tolerance;
        this.shrinkSeconds = shrinkSeconds;
        this.targetRadius = targetRadius;
        this.timeLimit = 3;
        this.firstPressCounts = false;
    }
    radius() { return 1 - (1 - this.targetRadius) * (this.elapsed / this.shrinkSeconds); }
    onPress() {
        if (this.state !== "running")
            return;
        if (Math.abs(this.radius() - this.targetRadius) <= this.tolerance)
            this.succeed();
        else
            this.failNow();
    }
    onTick() {
        if (this.radius() < this.targetRadius - this.tolerance)
            this.failNow();
    }
}
class FrHoldRelease extends FrMiniGame {
    constructor(greenFraction, riseSeconds = 1, center = 0.8) {
        super();
        this.greenFraction = greenFraction;
        this.riseSeconds = riseSeconds;
        this.center = center;
        this.timeLimit = 8;
        this.holding = false;
        this.holdTime = 0;
    }
    bar() {
        const phase = (this.holdTime / this.riseSeconds) % 2;
        return phase <= 1 ? phase : 2 - phase;
    }
    onPress() { this.holding = true; this.holdTime = 0; }
    onTick(dt) { if (this.holding)
        this.holdTime += dt; }
    onRelease() {
        this.holding = false;
        if (Math.abs(this.bar() - this.center) <= this.greenFraction / 2)
            this.succeed();
        else
            this.failNow();
    }
    progress() { return this.bar(); }
}
class FrMiniGameFactory {
    static create(task, tier) {
        return FrMiniGameFactory.BUILDERS[task](tier);
    }
    static ease(task, tier) {
        return FrMiniGameFactory.TOOL_FREE.indexOf(task) >= 0 ? 0.5 : tier / 3;
    }
    static createVaried(task, tier, roll) {
        if (!FrMiniGameFactory.create(task, tier))
            return null;
        const pick = Math.min(FrMiniGameFactory.KINDS.length - 1, Math.floor(roll * FrMiniGameFactory.KINDS.length));
        return FrMiniGameFactory.KINDS[pick](FrMiniGameFactory.ease(task, tier));
    }
}
FrMiniGameFactory.BUILDERS = {
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
FrMiniGameFactory.TOOL_FREE = ["shake", "gatherRing", "harvest"];
FrMiniGameFactory.KINDS = [
    (e) => new FrMashGauge(Math.round(14 - 6 * e)),
    (e) => new FrCenterStop(0.12 + 0.12 * e, e < 0.5 ? 2 : 1),
    (e) => new FrShrinkRing(0.1 + 0.06 * e),
    (e) => new FrHoldRelease(0.18 + 0.12 * e),
];
