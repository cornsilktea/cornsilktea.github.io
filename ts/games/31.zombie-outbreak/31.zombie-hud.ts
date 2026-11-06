type ZombieRosterRole = "origin" | "zombie" | "human";

interface ZombieRosterRow {
  name: string;
  role: ZombieRosterRole;
  since: number;
  me: boolean;
}

interface ZombieSightSpot {
  x: number;
  y: number;
  z: number;
}

interface ZombieSightBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

interface ZombieSightRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

interface ZombieFogRange {
  near: number;
  far: number;
}

class ZombieRoundClock {
  static readonly ROUND_MS = 150000;
  static readonly HOLD_MS = 10000;
  static readonly RUSH_MS = 30000;
  static readonly BELL_LEFT_MS: ReadonlyArray<number> = [120000, 60000];
  static readonly BELL_ELAPSED_MS: ReadonlyArray<number> = ZombieRoundClock.BELL_LEFT_MS.map((left) => ZombieRoundClock.ROUND_MS - left);
}

class ZombieHumanPing {
  static readonly PERIOD_MS = 20000;
  static readonly SHOW_MS = 3000;
  static readonly FIRST_MS = ZombieRoundClock.HOLD_MS + 15000;
  static readonly FINAL_REVEAL_MS = 10000;
  static readonly FINAL_FROM_MS = ZombieRoundClock.ROUND_MS - ZombieHumanPing.FINAL_REVEAL_MS;
  static readonly FINAL_PULSE_MS = 1000;

  static finalAt(elapsedMs: number): boolean {
    return elapsedMs >= ZombieHumanPing.FINAL_FROM_MS;
  }

  static activeAt(elapsedMs: number): boolean {
    if (ZombieHumanPing.finalAt(elapsedMs)) return true;
    return elapsedMs >= ZombieHumanPing.FIRST_MS && (elapsedMs - ZombieHumanPing.FIRST_MS) % ZombieHumanPing.PERIOD_MS < ZombieHumanPing.SHOW_MS;
  }

  static fadeAt(elapsedMs: number): number {
    if (ZombieHumanPing.finalAt(elapsedMs)) return 1 - (elapsedMs % ZombieHumanPing.FINAL_PULSE_MS) / ZombieHumanPing.FINAL_PULSE_MS;
    return 1 - ((elapsedMs - ZombieHumanPing.FIRST_MS) % ZombieHumanPing.PERIOD_MS) / ZombieHumanPing.SHOW_MS;
  }

  static secondsUntilNext(elapsedMs: number): number {
    const elapsed = Math.max(0, elapsedMs);
    const periodic = elapsed < ZombieHumanPing.FIRST_MS ? ZombieHumanPing.FIRST_MS - elapsed : ZombieHumanPing.PERIOD_MS - ((elapsed - ZombieHumanPing.FIRST_MS) % ZombieHumanPing.PERIOD_MS);
    return Math.ceil(Math.max(0, Math.min(periodic, ZombieHumanPing.FINAL_FROM_MS - elapsed)) / 1000);
  }
}

class ZombieRosterOrder {
  private static readonly RANK: Readonly<Record<ZombieRosterRole, number>> = { origin: 0, zombie: 1, human: 2 };

  static sorted(rows: readonly ZombieRosterRow[]): ZombieRosterRow[] {
    return rows.slice().sort((a, b) => (ZombieRosterOrder.RANK[a.role] - ZombieRosterOrder.RANK[b.role]) || (a.since - b.since));
  }
}

class ZombieRosterView {
  static readonly REFRESH_MS = 200;
  static readonly ROLE_LABELS: Readonly<Record<ZombieRosterRole, string>> = { origin: "숙주좀비", zombie: "좀비", human: "인간" };
  private shownKey = "";
  private nextAt = 0;

  constructor(private readonly box: HTMLElement) {}

  refresh(nowMs: number, readRows: () => ZombieRosterRow[]): void {
    if (nowMs < this.nextAt) return;
    this.nextAt = nowMs + ZombieRosterView.REFRESH_MS;
    this.render(ZombieRosterOrder.sorted(readRows()));
  }

  reset(): void {
    this.nextAt = 0;
  }

  private render(rows: readonly ZombieRosterRow[]): void {
    const key = JSON.stringify(rows.map((row) => [row.name, row.role, row.me]));
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.box.textContent = "";
    rows.forEach((row) => this.box.appendChild(ZombieRosterView.rowElement(row)));
  }

  private static rowElement(row: ZombieRosterRow): HTMLElement {
    const element = document.createElement("div");
    element.className = "zrRow " + row.role + (row.me ? " me" : "");
    const name = document.createElement("span");
    name.className = "zrName";
    name.textContent = row.name;
    const role = document.createElement("span");
    role.className = "zrRole";
    role.textContent = "/ " + ZombieRosterView.ROLE_LABELS[row.role];
    element.append(name, role);
    return element;
  }
}

class ZombieFloorSlab {
  constructor(private readonly y: number, private readonly area: ZombieSightRect, private readonly holes: readonly ZombieSightRect[]) {}

  blocks(from: ZombieSightSpot, to: ZombieSightSpot): boolean {
    if ((from.y - this.y) * (to.y - this.y) >= 0) return false;
    const k = (this.y - from.y) / (to.y - from.y);
    const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
    return ZombieFloorSlab.inside(this.area, x, z) && !this.holes.some((hole) => ZombieFloorSlab.inside(hole, x, z));
  }

  private static inside(rect: ZombieSightRect, x: number, z: number): boolean {
    return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
  }
}

class ZombieBodySight {
  static readonly BODY_POINTS: ReadonlyArray<readonly [number, number]> = [[0, 1.6], [0, 1.2], [-0.24, 1.12], [0.24, 1.12], [0, 0.8], [-0.12, 0.35], [0.12, 0.35]];
  static readonly CHEST_HEIGHT = 1.1;
  static readonly RAY_END = 0.995;
  private static readonly MARGIN = 0.4;
  private static readonly spot: ZombieSightSpot = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly onScreen: (spot: ZombieSightSpot) => boolean,
    private readonly boxesNear: (x0: number, x1: number, z0: number, z1: number) => readonly ZombieSightBox[],
    private readonly slab: ZombieFloorSlab
  ) {}

  visiblePoints(eye: ZombieSightSpot, body: ZombieSightSpot): number {
    const dx = body.x - eye.x, dz = body.z - eye.z, length = Math.hypot(dx, dz) || 1;
    const sideX = -dz / length, sideZ = dx / length, margin = ZombieBodySight.MARGIN;
    const boxes = this.boxesNear(Math.min(eye.x, body.x) - margin, Math.max(eye.x, body.x) + margin, Math.min(eye.z, body.z) - margin, Math.max(eye.z, body.z) + margin);
    const spot = ZombieBodySight.spot;
    let visible = 0;
    for (const point of ZombieBodySight.BODY_POINTS) {
      spot.x = body.x + sideX * point[0];
      spot.y = body.y + point[1];
      spot.z = body.z + sideZ * point[0];
      if (this.onScreen(spot) && !this.slab.blocks(eye, spot) && !ZombieBodySight.rayHitsAny(eye, spot, boxes)) visible++;
    }
    return visible;
  }

  static rayHitsAny(from: ZombieSightSpot, to: ZombieSightSpot, boxes: readonly ZombieSightBox[]): boolean {
    for (const box of boxes) if (ZombieBodySight.rayHits(from, to, box)) return true;
    return false;
  }

  private static rayHits(from: ZombieSightSpot, to: ZombieSightSpot, box: ZombieSightBox): boolean {
    let enter = 0, leave = 1;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    if (Math.abs(dx) < 1e-9) { if (from.x < box.x0 || from.x > box.x1) return false; }
    else {
      const a = (box.x0 - from.x) / dx, b = (box.x1 - from.x) / dx;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return false;
    }
    if (Math.abs(dy) < 1e-9) { if (from.y < box.y0 || from.y > box.y1) return false; }
    else {
      const a = (box.y0 - from.y) / dy, b = (box.y1 - from.y) / dy;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return false;
    }
    if (Math.abs(dz) < 1e-9) { if (from.z < box.z0 || from.z > box.z1) return false; }
    else {
      const a = (box.z0 - from.z) / dz, b = (box.z1 - from.z) / dz;
      enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return false;
    }
    return enter < ZombieBodySight.RAY_END;
  }
}

class ZombieNameTagRule {
  static readonly SHOW_POINTS = 5;
  static readonly KEEP_POINTS = 4;
  static readonly SHOW_FOG = 0.5;
  static readonly KEEP_FOG = 0.6;

  static distanceAt(fog: ZombieFogRange, share: number): number {
    return fog.near + (fog.far - fog.near) * share;
  }

  static withinRange(shown: boolean, distance: number, fog: ZombieFogRange): boolean {
    return distance <= ZombieNameTagRule.distanceAt(fog, shown ? ZombieNameTagRule.KEEP_FOG : ZombieNameTagRule.SHOW_FOG);
  }

  static shows(shown: boolean, visiblePoints: number): boolean {
    return visiblePoints >= (shown ? ZombieNameTagRule.KEEP_POINTS : ZombieNameTagRule.SHOW_POINTS);
  }
}
