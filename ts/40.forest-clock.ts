interface FrClockState { day: number; dawnAt: number; lastSeen: number; frozen: boolean; slept?: boolean; frozenAt?: number }
interface FrPresence { uid: string; name: string; area: string; sleeping: boolean; actedToday: boolean }

class FrClock {
  static readonly MINUTES_PER_DAY = 1440;

  static sinceDawnMinutes(state: FrClockState, now: number): number {
    return Math.max(0, (now - state.dawnAt) / 1000) * FrBalance.GAME_MINUTES_PER_REAL_SECOND;
  }

  static minuteOfDay(state: FrClockState, now: number): number {
    return (FrBalance.DAWN_MINUTE + FrClock.sinceDawnMinutes(state, now)) % FrClock.MINUTES_PER_DAY;
  }

  static dayNumber(state: FrClockState, now: number): number {
    return state.day + Math.floor(FrClock.sinceDawnMinutes(state, now) / FrClock.MINUTES_PER_DAY);
  }

  static absoluteMinute(state: FrClockState, now: number): number {
    return state.day * FrClock.MINUTES_PER_DAY + FrClock.sinceDawnMinutes(state, now);
  }

  static isNight(minuteOfDay: number): boolean {
    return minuteOfDay >= FrBalance.DUSK_MINUTE || minuteOfDay < FrBalance.DAWN_MINUTE;
  }

  static label(minuteOfDay: number): string {
    const h = Math.floor(minuteOfDay / 60);
    const m = Math.floor(minuteOfDay % 60);
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  static sunLevel(minuteOfDay: number): number {
    const noon = 720;
    const distance = Math.abs(minuteOfDay - noon);
    if (distance <= 300) return 1;
    return Math.max(0.25, 1 - (distance - 300) / 300);
  }

  static startOfClass(state: FrClockState, now: number): FrClockState {
    const idleMs = now - state.lastSeen;
    if (idleMs <= FrBalance.CLASS_BREAK_REAL_MINUTES * 60000 || state.frozen) return { ...state, lastSeen: now };
    return { day: FrClock.dayNumber(state, state.lastSeen) + 1, dawnAt: now, lastSeen: now, frozen: false };
  }

  static skipToMorning(state: FrClockState, now: number): FrClockState {
    return { day: FrClock.dayNumber(state, now) + 1, dawnAt: now, lastSeen: now, frozen: state.frozen, slept: true };
  }
}

class FrSleepVote {
  static canSleep(minuteOfDay: number, area: string): boolean {
    return FrClock.isNight(minuteOfDay) && (area === "island" || area === "beach");
  }

  static awakeOnes(presences: ReadonlyArray<FrPresence>): FrPresence[] {
    return presences.filter((p) => p.actedToday && !p.sleeping);
  }

  static allAsleep(presences: ReadonlyArray<FrPresence>): boolean {
    const counted = presences.filter((p) => p.actedToday);
    return counted.length > 0 && counted.every((p) => p.sleeping);
  }

  static banner(presences: ReadonlyArray<FrPresence>): string {
    const counted = presences.filter((p) => p.actedToday);
    const asleep = counted.filter((p) => p.sleeping).length;
    const awake = FrSleepVote.awakeOnes(presences).map((p) => (p.area === "island" ? p.name : p.name + "(" + FrSleepVote.areaLabel(p.area) + ")"));
    return "잠든 사람 " + asleep + " / " + counted.length + (awake.length > 0 ? " · 아직: " + awake.join(", ") : "");
  }

  static areaLabel(area: string): string {
    const labels: Record<string, string> = { fruit: "과일 숲", mine: "광산", dungeon: "던전", beach: "해변", island: "섬" };
    return labels[area] || area;
  }

  static morningActionPoints(wasAsleep: boolean, fullSleep: boolean, current: number, max: number): number {
    if (fullSleep) return max;
    return wasAsleep ? Math.min(max, current + FrBalance.WAKE_BONUS_ACTION_POINTS) : current;
  }
}
