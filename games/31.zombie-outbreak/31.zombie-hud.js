"use strict";
class ZombieRoundClock {
}
ZombieRoundClock.ROUND_MS = 150000;
ZombieRoundClock.HOLD_MS = 10000;
ZombieRoundClock.RUSH_MS = 30000;
ZombieRoundClock.BELL_LEFT_MS = [120000, 60000];
ZombieRoundClock.BELL_ELAPSED_MS = ZombieRoundClock.BELL_LEFT_MS.map((left) => ZombieRoundClock.ROUND_MS - left);
class ZombieHumanPing {
    static finalAt(elapsedMs) {
        return elapsedMs >= ZombieHumanPing.FINAL_FROM_MS;
    }
    static activeAt(elapsedMs) {
        if (ZombieHumanPing.finalAt(elapsedMs))
            return true;
        return elapsedMs >= ZombieHumanPing.FIRST_MS && (elapsedMs - ZombieHumanPing.FIRST_MS) % ZombieHumanPing.PERIOD_MS < ZombieHumanPing.SHOW_MS;
    }
    static fadeAt(elapsedMs) {
        if (ZombieHumanPing.finalAt(elapsedMs))
            return 1 - (elapsedMs % ZombieHumanPing.FINAL_PULSE_MS) / ZombieHumanPing.FINAL_PULSE_MS;
        return 1 - ((elapsedMs - ZombieHumanPing.FIRST_MS) % ZombieHumanPing.PERIOD_MS) / ZombieHumanPing.SHOW_MS;
    }
    static secondsUntilNext(elapsedMs) {
        const elapsed = Math.max(0, elapsedMs);
        const periodic = elapsed < ZombieHumanPing.FIRST_MS ? ZombieHumanPing.FIRST_MS - elapsed : ZombieHumanPing.PERIOD_MS - ((elapsed - ZombieHumanPing.FIRST_MS) % ZombieHumanPing.PERIOD_MS);
        return Math.ceil(Math.max(0, Math.min(periodic, ZombieHumanPing.FINAL_FROM_MS - elapsed)) / 1000);
    }
}
ZombieHumanPing.PERIOD_MS = 20000;
ZombieHumanPing.SHOW_MS = 3000;
ZombieHumanPing.FIRST_MS = ZombieRoundClock.HOLD_MS + 15000;
ZombieHumanPing.FINAL_REVEAL_MS = 10000;
ZombieHumanPing.FINAL_FROM_MS = ZombieRoundClock.ROUND_MS - ZombieHumanPing.FINAL_REVEAL_MS;
ZombieHumanPing.FINAL_PULSE_MS = 1000;
class ZombieRosterOrder {
    static sorted(rows) {
        return rows.slice().sort((a, b) => (ZombieRosterOrder.RANK[a.role] - ZombieRosterOrder.RANK[b.role]) || (a.since - b.since));
    }
}
ZombieRosterOrder.RANK = { origin: 0, zombie: 1, human: 2 };
class ZombieRosterView {
    constructor(box) {
        this.box = box;
        this.shownKey = "";
        this.nextAt = 0;
    }
    refresh(nowMs, readRows) {
        if (nowMs < this.nextAt)
            return;
        this.nextAt = nowMs + ZombieRosterView.REFRESH_MS;
        this.render(ZombieRosterOrder.sorted(readRows()));
    }
    reset() {
        this.nextAt = 0;
    }
    render(rows) {
        const key = JSON.stringify(rows.map((row) => [row.name, row.role, row.me]));
        if (key === this.shownKey)
            return;
        this.shownKey = key;
        this.box.textContent = "";
        rows.forEach((row) => this.box.appendChild(ZombieRosterView.rowElement(row)));
    }
    static rowElement(row) {
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
ZombieRosterView.REFRESH_MS = 200;
ZombieRosterView.ROLE_LABELS = { origin: "숙주좀비", zombie: "좀비", human: "인간" };
class ZombieFloorSlab {
    constructor(y, area, holes) {
        this.y = y;
        this.area = area;
        this.holes = holes;
    }
    blocks(from, to) {
        if ((from.y - this.y) * (to.y - this.y) >= 0)
            return false;
        const k = (this.y - from.y) / (to.y - from.y);
        const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
        return ZombieFloorSlab.inside(this.area, x, z) && !this.holes.some((hole) => ZombieFloorSlab.inside(hole, x, z));
    }
    static inside(rect, x, z) {
        return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
    }
}
class ZombieBodySight {
    constructor(onScreen, boxesNear, slab) {
        this.onScreen = onScreen;
        this.boxesNear = boxesNear;
        this.slab = slab;
    }
    visiblePoints(eye, body) {
        const dx = body.x - eye.x, dz = body.z - eye.z, length = Math.hypot(dx, dz) || 1;
        const sideX = -dz / length, sideZ = dx / length, margin = ZombieBodySight.MARGIN;
        const boxes = this.boxesNear(Math.min(eye.x, body.x) - margin, Math.max(eye.x, body.x) + margin, Math.min(eye.z, body.z) - margin, Math.max(eye.z, body.z) + margin);
        const spot = ZombieBodySight.spot;
        let visible = 0;
        for (const point of ZombieBodySight.BODY_POINTS) {
            spot.x = body.x + sideX * point[0];
            spot.y = body.y + point[1];
            spot.z = body.z + sideZ * point[0];
            if (this.onScreen(spot) && !this.slab.blocks(eye, spot) && !ZombieBodySight.rayHitsAny(eye, spot, boxes))
                visible++;
        }
        return visible;
    }
    static rayHitsAny(from, to, boxes) {
        for (const box of boxes)
            if (ZombieBodySight.rayHits(from, to, box))
                return true;
        return false;
    }
    static rayHits(from, to, box) {
        let enter = 0, leave = 1;
        const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
        if (Math.abs(dx) < 1e-9) {
            if (from.x < box.x0 || from.x > box.x1)
                return false;
        }
        else {
            const a = (box.x0 - from.x) / dx, b = (box.x1 - from.x) / dx;
            enter = Math.max(enter, Math.min(a, b));
            leave = Math.min(leave, Math.max(a, b));
            if (enter > leave)
                return false;
        }
        if (Math.abs(dy) < 1e-9) {
            if (from.y < box.y0 || from.y > box.y1)
                return false;
        }
        else {
            const a = (box.y0 - from.y) / dy, b = (box.y1 - from.y) / dy;
            enter = Math.max(enter, Math.min(a, b));
            leave = Math.min(leave, Math.max(a, b));
            if (enter > leave)
                return false;
        }
        if (Math.abs(dz) < 1e-9) {
            if (from.z < box.z0 || from.z > box.z1)
                return false;
        }
        else {
            const a = (box.z0 - from.z) / dz, b = (box.z1 - from.z) / dz;
            enter = Math.max(enter, Math.min(a, b));
            leave = Math.min(leave, Math.max(a, b));
            if (enter > leave)
                return false;
        }
        return enter < ZombieBodySight.RAY_END;
    }
}
ZombieBodySight.BODY_POINTS = [[0, 1.6], [0, 1.2], [-0.24, 1.12], [0.24, 1.12], [0, 0.8], [-0.12, 0.35], [0.12, 0.35]];
ZombieBodySight.CHEST_HEIGHT = 1.1;
ZombieBodySight.RAY_END = 0.995;
ZombieBodySight.MARGIN = 0.4;
ZombieBodySight.spot = { x: 0, y: 0, z: 0 };
class ZombieNameTagRule {
    static distanceAt(fog, share) {
        return fog.near + (fog.far - fog.near) * share;
    }
    static withinRange(shown, distance, fog) {
        return distance <= ZombieNameTagRule.distanceAt(fog, shown ? ZombieNameTagRule.KEEP_FOG : ZombieNameTagRule.SHOW_FOG);
    }
    static shows(shown, visiblePoints) {
        return visiblePoints >= (shown ? ZombieNameTagRule.KEEP_POINTS : ZombieNameTagRule.SHOW_POINTS);
    }
}
ZombieNameTagRule.SHOW_POINTS = 5;
ZombieNameTagRule.KEEP_POINTS = 4;
ZombieNameTagRule.SHOW_FOG = 0.5;
ZombieNameTagRule.KEEP_FOG = 0.6;
