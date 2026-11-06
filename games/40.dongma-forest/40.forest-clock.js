"use strict";
class FrClock {
    static sinceDawnMinutes(state, now) {
        return Math.max(0, (now - state.dawnAt) / 1000) * FrBalance.GAME_MINUTES_PER_REAL_SECOND;
    }
    static minuteOfDay(state, now) {
        return (FrBalance.DAWN_MINUTE + FrClock.sinceDawnMinutes(state, now)) % FrClock.MINUTES_PER_DAY;
    }
    static dayNumber(state, now) {
        return state.day + Math.floor(FrClock.sinceDawnMinutes(state, now) / FrClock.MINUTES_PER_DAY);
    }
    static absoluteMinute(state, now) {
        return state.day * FrClock.MINUTES_PER_DAY + FrClock.sinceDawnMinutes(state, now);
    }
    static isNight(minuteOfDay) {
        return minuteOfDay >= FrBalance.DUSK_MINUTE || minuteOfDay < FrBalance.DAWN_MINUTE;
    }
    static label(minuteOfDay) {
        const h = Math.floor(minuteOfDay / 60);
        const m = Math.floor(minuteOfDay % 60);
        return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }
    static sunLevel(minuteOfDay) {
        const noon = 720;
        const distance = Math.abs(minuteOfDay - noon);
        if (distance <= 300)
            return 1;
        return Math.max(0.25, 1 - (distance - 300) / 300);
    }
    static startOfClass(state, now) {
        const idleMs = now - state.lastSeen;
        if (idleMs <= FrBalance.CLASS_BREAK_REAL_MINUTES * 60000 || state.frozen)
            return { ...state, lastSeen: now };
        return { day: FrClock.dayNumber(state, state.lastSeen) + 1, dawnAt: now, lastSeen: now, frozen: false };
    }
    static skipToMorning(state, now) {
        return { day: FrClock.dayNumber(state, now) + 1, dawnAt: now, lastSeen: now, frozen: state.frozen, slept: true };
    }
}
FrClock.MINUTES_PER_DAY = 1440;
class FrSleepVote {
    static canSleep(minuteOfDay, area) {
        return FrClock.isNight(minuteOfDay) && (area === "island" || area === "beach");
    }
    static awakeOnes(presences) {
        return presences.filter((p) => p.actedToday && !p.sleeping);
    }
    static allAsleep(presences) {
        const counted = presences.filter((p) => p.actedToday);
        return counted.length > 0 && counted.every((p) => p.sleeping);
    }
    static banner(presences) {
        const counted = presences.filter((p) => p.actedToday);
        const asleep = counted.filter((p) => p.sleeping).length;
        const awake = FrSleepVote.awakeOnes(presences).map((p) => (p.area === "island" ? p.name : p.name + "(" + FrSleepVote.areaLabel(p.area) + ")"));
        return "잠든 사람 " + asleep + " / " + counted.length + (awake.length > 0 ? " · 아직: " + awake.join(", ") : "");
    }
    static areaLabel(area) {
        const labels = { fruit: "과일 숲", mine: "광산", dungeon: "던전", beach: "해변", island: "섬" };
        return labels[area] || area;
    }
    static morningActionPoints(wasAsleep, fullSleep, current, max) {
        if (fullSleep)
            return max;
        return wasAsleep ? Math.min(max, current + FrBalance.WAKE_BONUS_ACTION_POINTS) : current;
    }
}
