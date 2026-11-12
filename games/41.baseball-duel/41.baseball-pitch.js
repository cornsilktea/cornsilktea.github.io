"use strict";
class BbSeededRandom {
    constructor(seed) {
        this.spare = null;
        this.state = (seed >>> 0) || 0x9E3779B9;
    }
    next() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let mixed = this.state;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    }
    between(low, high) { return low + (high - low) * this.next(); }
    chance(probability) { return this.next() < probability; }
    pick(items) { return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))]; }
    seed() { return Math.floor(this.next() * 4294967296) >>> 0; }
    gaussian(mean = 0, deviation = 1) {
        if (this.spare !== null) {
            const kept = this.spare;
            this.spare = null;
            return mean + kept * deviation;
        }
        let u = 0;
        while (u < 1e-12)
            u = this.next();
        const radius = Math.sqrt(-2 * Math.log(u)), angle = 2 * Math.PI * this.next();
        this.spare = radius * Math.sin(angle);
        return mean + radius * Math.cos(angle) * deviation;
    }
}
class BbMixtureSampler {
    static sample(parts, random) {
        let total = 0;
        for (const part of parts)
            total += part.weight;
        let roll = random.next() * total;
        for (const part of parts) {
            roll -= part.weight;
            if (roll <= 0)
                return random.gaussian(part.mean, part.deviation);
        }
        const last = parts[parts.length - 1];
        return random.gaussian(last.mean, last.deviation);
    }
}
class BbAbilityAllocator {
    constructor(plan, points) {
        this.plan = plan;
        const even = Math.floor(plan.total / plan.items.length);
        this.points = points && BbAbilityAllocator.isValid(plan, points) ? points.slice() : plan.items.map(() => even);
    }
    static isValid(plan, points) {
        if (points.length !== plan.items.length)
            return false;
        let sum = 0;
        for (const value of points) {
            if (!Number.isInteger(value) || value < plan.least || value > plan.most)
                return false;
            sum += value;
        }
        return sum <= plan.total;
    }
    static everySplit(plan) {
        const found = [];
        const fill = (prefix, left) => {
            const slotsLeft = plan.items.length - prefix.length;
            if (slotsLeft === 1) {
                if (left >= plan.least && left <= plan.most)
                    found.push([...prefix, left]);
                return;
            }
            for (let value = plan.least; value <= plan.most; value++)
                if (left - value >= plan.least * (slotsLeft - 1))
                    fill([...prefix, value], left - value);
        };
        fill([], plan.total);
        return found;
    }
    used() { return this.points.reduce((sum, value) => sum + value, 0); }
    spare() { return this.plan.total - this.used(); }
    canRaise(index) { return this.spare() >= 1 && this.points[index] < this.plan.most; }
    canLower(index) { return this.points[index] > this.plan.least; }
    raise(index) { if (!this.canRaise(index))
        return false; this.points[index]++; return true; }
    lower(index) { if (!this.canLower(index))
        return false; this.points[index]--; return true; }
}
BbAbilityAllocator.PITCHER = {
    total: 9, least: 1, most: 7,
    items: [{ key: "control", label: "제구", effect: "구종이 더 정확한 위치로 간다" }, { key: "power", label: "구위", effect: "구속이 더 빨라진다" }, { key: "breaking", label: "변화", effect: "변화구 종류가 늘고 각이 커진다" }]
};
BbAbilityAllocator.BATTER = {
    total: 9, least: 1, most: 7,
    items: [{ key: "contact", label: "컨택", effect: "타격 타이밍이 더 여유로워진다" }, { key: "power", label: "파워", effect: "비거리 분포가 더 위로 올라간다" }, { key: "speed", label: "주루", effect: "땅볼 세이프가 늘고 더 많은 베이스를 간다" }]
};
class BbPitchKind {
    constructor() {
        this.arrivalJitterSeconds = 0;
    }
    static fastballSpeed(power) { return 126 + 3.5 * power; }
    axisRadians(hand) {
        const degrees = hand === "R" ? this.axisDegrees : 180 - this.axisDegrees;
        return degrees * Math.PI / 180;
    }
    longDeviation(abilities) {
        const scale = this.isBreaking ? BbPitchTuning.breakScale(abilities.breaking) : 1;
        return BbPitchTuning.sigmaFor(abilities.control) * this.longSpread * scale;
    }
    shortDeviation(abilities) { return BbPitchTuning.sigmaFor(abilities.control) * this.shortSpread; }
    reach(abilities, hand) {
        const angle = this.axisRadians(hand), long = this.longDeviation(abilities) * this.cutRadius, short = this.shortDeviation(abilities) * this.cutRadius;
        return { u: Math.hypot(long * Math.cos(angle), short * Math.sin(angle)), v: Math.hypot(long * Math.sin(angle), short * Math.cos(angle)) };
    }
}
class BbPitchTuning {
    static sigmaFor(control) { return BbPitchTuning.SIGMA_BY_CONTROL[Math.max(1, Math.min(7, Math.round(control)))]; }
    static breakScale(breaking) { return 1 + 0.1 * (breaking - 1); }
    static flightSeconds(speedKmh) { return BbPitchTuning.FLIGHT_METERS / (speedKmh / 3.6) * BbPitchTuning.FLIGHT_SCALE; }
}
BbPitchTuning.SIGMA_BY_CONTROL = [0, 0.55, 0.46, 0.38, 0.32, 0.27, 0.23, 0.2];
BbPitchTuning.AIM_LIMIT = 2.2;
BbPitchTuning.FLIGHT_METERS = 17;
BbPitchTuning.FLIGHT_SCALE = 2.4;
BbPitchTuning.WINDUP_SECONDS = 0.9;
class BbFastball extends BbPitchKind {
    constructor() {
        super(...arguments);
        this.id = "ft";
        this.label = "직구";
        this.hotkey = "Q";
        this.axisDegrees = 0;
        this.longSpread = 1;
        this.shortSpread = 1;
        this.cutRadius = 2;
        this.isBreaking = false;
    }
    speedFor(abilities) { return BbPitchKind.fastballSpeed(abilities.power); }
}
class BbCurveball extends BbPitchKind {
    constructor() {
        super(...arguments);
        this.id = "cv";
        this.label = "커브";
        this.hotkey = "W";
        this.axisDegrees = 60;
        this.longSpread = 1.45;
        this.shortSpread = 0.65;
        this.cutRadius = 2;
        this.isBreaking = true;
    }
    speedFor(abilities) { return BbPitchKind.fastballSpeed(abilities.power) - 32; }
}
class BbSlider extends BbPitchKind {
    constructor() {
        super(...arguments);
        this.id = "sl";
        this.label = "슬라이더";
        this.hotkey = "E";
        this.axisDegrees = 30;
        this.longSpread = 1.5;
        this.shortSpread = 0.65;
        this.cutRadius = 2;
        this.isBreaking = true;
    }
    speedFor(abilities) { return BbPitchKind.fastballSpeed(abilities.power) - 17; }
}
class BbChangeup extends BbPitchKind {
    constructor() {
        super(...arguments);
        this.id = "ch";
        this.label = "체인지업";
        this.hotkey = "A";
        this.axisDegrees = 120;
        this.longSpread = 1.35;
        this.shortSpread = 0.7;
        this.cutRadius = 2;
        this.isBreaking = true;
    }
    speedFor(abilities) { return BbPitchKind.fastballSpeed(abilities.power) - 22; }
}
class BbKnuckleball extends BbPitchKind {
    constructor() {
        super(...arguments);
        this.id = "kn";
        this.label = "너클";
        this.hotkey = "S";
        this.axisDegrees = 0;
        this.longSpread = 1.3;
        this.shortSpread = 1.3;
        this.cutRadius = 2.2;
        this.isBreaking = false;
        this.arrivalJitterSeconds = 0.022;
    }
    speedFor(abilities) { return 104 + 1.2 * abilities.power; }
}
class BbPitchCatalog {
    static of(id) { return BbPitchCatalog.ALL.find((kind) => kind.id === id); }
}
BbPitchCatalog.ALL = [new BbFastball(), new BbCurveball(), new BbSlider(), new BbChangeup(), new BbKnuckleball()];
BbPitchCatalog.BREAKING_ORDER = ["cv", "sl", "ch", "kn"];
class BbPitchSelection {
    constructor(breaking, chosen) {
        this.breaking = breaking;
        this.chosen = chosen ? chosen.filter((id) => this.isUnlocked(id)).slice(0, BbPitchSelection.slotsFor(breaking)) : [];
        if (!chosen)
            this.fillInOrder();
    }
    static slotsFor(breaking) { return breaking >= 7 ? 4 : breaking >= 5 ? 3 : breaking >= 3 ? 2 : 1; }
    isUnlocked(id) { return id !== "kn" || this.breaking >= BbPitchSelection.KNUCKLE_NEEDS; }
    slots() { return BbPitchSelection.slotsFor(this.breaking); }
    spare() { return this.slots() - this.chosen.length; }
    isOn(id) { return this.chosen.indexOf(id) >= 0; }
    breakingPitches() { return BbPitchCatalog.BREAKING_ORDER.filter((id) => this.isOn(id)); }
    usable() { return ["ft", ...this.breakingPitches()]; }
    toggle(id) {
        if (this.isOn(id)) {
            this.chosen = this.chosen.filter((kept) => kept !== id);
            return true;
        }
        if (this.spare() < 1 || !this.isUnlocked(id))
            return false;
        this.chosen.push(id);
        return true;
    }
    setBreaking(breaking) {
        const grew = breaking > this.breaking;
        this.breaking = breaking;
        this.chosen = this.chosen.filter((id) => this.isUnlocked(id));
        while (this.chosen.length > this.slots())
            this.dropLast();
        if (grew)
            this.fillInOrder();
    }
    dropLast() {
        const order = BbPitchCatalog.BREAKING_ORDER;
        let last = this.chosen[0];
        for (const id of this.chosen)
            if (order.indexOf(id) > order.indexOf(last))
                last = id;
        this.chosen = this.chosen.filter((id) => id !== last);
    }
    fillInOrder() {
        for (const id of BbPitchCatalog.BREAKING_ORDER)
            if (this.spare() > 0 && !this.isOn(id) && this.isUnlocked(id))
                this.chosen.push(id);
    }
}
BbPitchSelection.KNUCKLE_NEEDS = 7;
class BbAimLimiter {
    static clamp(aim, kind, abilities, hand) {
        const reach = kind.reach(abilities, hand), limitU = Math.max(0, BbPitchTuning.AIM_LIMIT - reach.u), limitV = Math.max(0, BbPitchTuning.AIM_LIMIT - reach.v);
        return { u: Math.max(-limitU, Math.min(limitU, aim.u)), v: Math.max(-limitV, Math.min(limitV, aim.v)) };
    }
}
class BbPitchLocationSampler {
    static sample(aim, kind, abilities, hand, random) {
        const long = kind.longDeviation(abilities), short = kind.shortDeviation(abilities), angle = kind.axisRadians(hand), limit = kind.cutRadius * kind.cutRadius;
        const cos = Math.cos(angle), sin = Math.sin(angle), wall = BbPitchTuning.AIM_LIMIT;
        for (let attempt = 0; attempt < 96; attempt++) {
            const along = random.gaussian(), across = random.gaussian();
            if (along * along + across * across > limit)
                continue;
            const point = { u: aim.u + along * long * cos - across * short * sin, v: aim.v + along * long * sin + across * short * cos };
            if (Math.abs(point.u) <= wall && Math.abs(point.v) <= wall)
                return point;
        }
        return { u: aim.u, v: aim.v };
    }
}
class BbPitchRoller {
    static roll(pitch, aim, abilities, hand, seed) {
        const random = new BbSeededRandom(seed), kind = BbPitchCatalog.of(pitch);
        const safeAim = BbAimLimiter.clamp(aim, kind, abilities, hand);
        const arrive = BbPitchLocationSampler.sample(safeAim, kind, abilities, hand, random), speed = kind.speedFor(abilities);
        const flightSeconds = BbPitchTuning.flightSeconds(speed) + random.gaussian(0, kind.arrivalJitterSeconds);
        return { pitch, aim: safeAim, arrive, speed, flightSeconds, timingNoise: random.gaussian(0, BbPitchRoller.TIMING_NOISE_SECONDS), seed };
    }
}
BbPitchRoller.TIMING_NOISE_SECONDS = 0.007;
