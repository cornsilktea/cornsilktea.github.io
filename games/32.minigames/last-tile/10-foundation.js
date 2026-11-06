"use strict";
class MathUtil {
    static clamp(value, low, high) {
        return value < low ? low : value > high ? high : value;
    }
    static lerp(from, to, ratio) {
        return from + (to - from) * ratio;
    }
    static round2(value) {
        return Math.round(value * 100) / 100;
    }
    static angleDifference(a, b) {
        let difference = a - b;
        while (difference > Math.PI)
            difference -= Math.PI * 2;
        while (difference < -Math.PI)
            difference += Math.PI * 2;
        return difference;
    }
    static distance(ax, az, bx, bz) {
        return Math.hypot(ax - bx, az - bz);
    }
}
class Html {
    static escape(text) {
        return String(text).replace(/[&<>"]/g, (character) => Html.ESCAPES[character]);
    }
}
Html.ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
class MathRandomSource {
    next() {
        return Math.random();
    }
}
class SeededRandom {
    constructor(seed) {
        this.state = seed >>> 0;
    }
    next() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let mixed = this.state;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    }
}
class RandomRange {
    constructor(source) {
        this.source = source;
    }
    next() {
        return this.source.next();
    }
    between(low, high) {
        return low + this.source.next() * (high - low);
    }
    chance(probability) {
        return this.source.next() < probability;
    }
    index(length) {
        return Math.floor(this.source.next() * length);
    }
}
class TokenSource {
    constructor(random) {
        this.random = random;
    }
    token(length) {
        return this.random.next().toString(36).slice(2, 2 + length);
    }
    digits(count) {
        return String(Math.pow(10, count - 1) + this.random.index(9 * Math.pow(10, count - 1)));
    }
}
class SystemClock {
    now() {
        return Date.now();
    }
}
class OffsetClock {
    constructor() {
        this.offset = 0;
    }
    setOffset(offsetMs) {
        this.offset = offsetMs;
    }
    now() {
        return Date.now() + this.offset;
    }
}
