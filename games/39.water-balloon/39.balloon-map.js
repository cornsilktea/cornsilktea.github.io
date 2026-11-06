"use strict";
class WbCell {
}
WbCell.EMPTY = 0;
WbCell.PILLAR = 1;
WbCell.BOX = 2;
WbCell.WALL = 3;
class WbGrid {
    constructor(cells) {
        this.cells = cells ? new Uint8Array(cells) : new Uint8Array(WbGrid.COUNT);
    }
    static index(i, j) { return j * WbGrid.W + i; }
    static col(index) { return index % WbGrid.W; }
    static row(index) { return Math.floor(index / WbGrid.W); }
    static inside(i, j) { return i >= 0 && j >= 0 && i < WbGrid.W && j < WbGrid.H; }
    static isPillarSpot(i, j) { return i % 2 === 1 && j % 2 === 1; }
    static withPillars() {
        const grid = new WbGrid();
        for (let j = 0; j < WbGrid.H; j++)
            for (let i = 0; i < WbGrid.W; i++)
                if (WbGrid.isPillarSpot(i, j))
                    grid.set(i, j, WbCell.PILLAR);
        return grid;
    }
    kind(i, j) { return WbGrid.inside(i, j) ? this.cells[WbGrid.index(i, j)] : WbCell.PILLAR; }
    set(i, j, kind) { this.cells[WbGrid.index(i, j)] = kind; }
    blocked(i, j) { return this.kind(i, j) !== WbCell.EMPTY; }
    solid(i, j) { const k = this.kind(i, j); return k === WbCell.PILLAR || k === WbCell.WALL; }
    clone() { return new WbGrid(this.cells); }
    count(kind) { let n = 0; for (const c of this.cells)
        if (c === kind)
            n++; return n; }
}
WbGrid.W = 15;
WbGrid.H = 13;
WbGrid.COUNT = 195;
class WbSeededRandom {
    constructor(seed) { this.state = seed >>> 0; }
    next() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let m = this.state;
        m = Math.imul(m ^ (m >>> 15), m | 1);
        m ^= m + Math.imul(m ^ (m >>> 7), m | 61);
        return ((m ^ (m >>> 14)) >>> 0) / 4294967296;
    }
    int(n) { return Math.floor(this.next() * n); }
    pick(list) { return list[this.int(list.length)]; }
    shuffle(list) {
        for (let k = list.length - 1; k > 0; k--) {
            const r = this.int(k + 1);
            const t = list[k];
            list[k] = list[r];
            list[r] = t;
        }
        return list;
    }
}
class WbSpawnPlan {
    static solo(count, rng) {
        const corners = WbSpawnPlan.cornerSet(Math.min(count, 4), rng);
        const groups = corners.map((c) => WbSpawnPlan.cornerGroup(WbSpawnPlan.CORNERS[c]));
        for (const s of WbSpawnPlan.sideSet(Math.max(0, count - 4), rng))
            groups.push(WbSpawnPlan.sideGroup(s, rng));
        return groups;
    }
    static team(teamCount, rng) {
        return WbSpawnPlan.cornerSet(teamCount, rng).map((c) => WbSpawnPlan.teamGroup(WbSpawnPlan.CORNERS[c]));
    }
    static cornerSet(count, rng) {
        if (count <= 2)
            return rng.pick(WbSpawnPlan.DIAGONALS).slice(0, count);
        const all = [0, 1, 2, 3];
        if (count === 3)
            all.splice(rng.int(4), 1);
        return all;
    }
    static sideSet(count, rng) {
        if (count === 0)
            return [];
        if (count === 1)
            return [rng.int(4)];
        if (count === 2)
            return rng.pick(WbSpawnPlan.SIDE_PAIRS).slice();
        const all = [0, 1, 2, 3];
        if (count === 3)
            all.splice(rng.int(4), 1);
        return all;
    }
    static inward(v, max) { return v === 0 ? 1 : v === max ? -1 : 0; }
    static cornerGroup(c) {
        const di = WbSpawnPlan.inward(c.i, WbGrid.W - 1), dj = WbSpawnPlan.inward(c.j, WbGrid.H - 1);
        return { spots: [c], clear: [c, { i: c.i + di, j: c.j }, { i: c.i, j: c.j + dj }] };
    }
    static sideGroup(side, rng) {
        const s = WbSpawnPlan.SIDES[side];
        if (s.j === 0 || s.j === WbGrid.H - 1)
            return { spots: [s], clear: [s, { i: s.i - 1, j: s.j }, { i: s.i + 1, j: s.j }] };
        const di = WbSpawnPlan.inward(s.i, WbGrid.W - 1);
        return { spots: [s], clear: [s, { i: s.i + di, j: s.j }, { i: s.i, j: s.j + (rng.next() < 0.5 ? -1 : 1) }] };
    }
    static teamGroup(c) {
        const di = WbSpawnPlan.inward(c.i, WbGrid.W - 1), dj = WbSpawnPlan.inward(c.j, WbGrid.H - 1);
        const second = { i: c.i + 2 * di, j: c.j };
        return {
            spots: [c, second],
            clear: [c, { i: c.i + di, j: c.j }, second, { i: c.i + 3 * di, j: c.j }, { i: c.i, j: c.j + dj }, { i: second.i, j: c.j + dj }],
        };
    }
}
WbSpawnPlan.CORNERS = [{ i: 0, j: 0 }, { i: 14, j: 0 }, { i: 0, j: 12 }, { i: 14, j: 12 }];
WbSpawnPlan.DIAGONALS = [[0, 3], [1, 2]];
WbSpawnPlan.SIDES = [{ i: 7, j: 0 }, { i: 7, j: 12 }, { i: 0, j: 6 }, { i: 14, j: 6 }];
WbSpawnPlan.SIDE_PAIRS = [[0, 1], [2, 3]];
class WbWalkDistance {
    static fromSpots(grid, spots, passBoxes) {
        const dist = new Int16Array(WbGrid.COUNT).fill(WbWalkDistance.FAR);
        const queue = [];
        for (const s of spots) {
            const k = WbGrid.index(s.i, s.j);
            dist[k] = 0;
            queue.push(k);
        }
        for (let head = 0; head < queue.length; head++) {
            const k = queue[head], i = WbGrid.col(k), j = WbGrid.row(k);
            for (let d = 0; d < 4; d++) {
                const ni = i + WbDirStep.DX[d], nj = j + WbDirStep.DZ[d];
                if (!WbGrid.inside(ni, nj))
                    continue;
                const kind = grid.kind(ni, nj);
                if (kind === WbCell.PILLAR || kind === WbCell.WALL || (!passBoxes && kind === WbCell.BOX))
                    continue;
                const nk = WbGrid.index(ni, nj);
                if (dist[nk] !== WbWalkDistance.FAR)
                    continue;
                dist[nk] = dist[k] + 1;
                queue.push(nk);
            }
        }
        return dist;
    }
}
WbWalkDistance.FAR = 9999;
class WbDirStep {
}
WbDirStep.DX = [0, 1, 0, -1];
WbDirStep.DZ = [-1, 0, 1, 0];
class WbZoneMap {
    constructor(grid, groups, rng) {
        this.distances = groups.map((g) => WbWalkDistance.fromSpots(grid, g.spots, true));
        this.zoneOf = new Int8Array(WbGrid.COUNT).fill(-1);
        groups.forEach((g, z) => { for (const s of g.spots)
            this.zoneOf[WbGrid.index(s.i, s.j)] = z; });
        for (let grew = true; grew;) {
            grew = false;
            for (const z of rng.shuffle(groups.map((_, n) => n))) {
                const cell = this.nextClaim(grid, z, rng);
                if (cell >= 0) {
                    this.zoneOf[cell] = z;
                    grew = true;
                }
            }
        }
    }
    nextClaim(grid, zone, rng) {
        const dist = this.distances[zone];
        let best = WbWalkDistance.FAR, ties = [];
        for (let k = 0; k < WbGrid.COUNT; k++) {
            if (this.zoneOf[k] !== -1 || grid.cells[k] === WbCell.PILLAR || !this.touches(k, zone))
                continue;
            if (dist[k] < best) {
                best = dist[k];
                ties = [k];
            }
            else if (dist[k] === best)
                ties.push(k);
        }
        return ties.length ? rng.pick(ties) : -1;
    }
    touches(k, zone) {
        const i = WbGrid.col(k), j = WbGrid.row(k);
        for (let d = 0; d < 4; d++) {
            const ni = i + WbDirStep.DX[d], nj = j + WbDirStep.DZ[d];
            if (WbGrid.inside(ni, nj) && this.zoneOf[WbGrid.index(ni, nj)] === zone)
                return true;
        }
        return false;
    }
    cells(zone) {
        const list = [];
        for (let k = 0; k < WbGrid.COUNT; k++)
            if (this.zoneOf[k] === zone)
                list.push(k);
        return list;
    }
}
class WbFairReport {
    constructor() {
        this.tries = 0;
        this.fixes = 0;
        this.passed = false;
        this.nearBoxes = [];
        this.zoneBoxes = [];
        this.zoneGrades = [];
        this.escapeOk = [];
        this.score = 0;
    }
}
class WbLootDeck {
    static gradeCounts(total) {
        const legend = Math.round(total * WbLootDeck.GRADE_SHARE[2]);
        const rare = Math.round(total * WbLootDeck.GRADE_SHARE[1]);
        return [total - legend - rare, rare, legend];
    }
    static kinds(count, kinds, rng) {
        const order = rng.shuffle(kinds.slice());
        const deck = [];
        for (let k = 0; k < count; k++)
            deck.push(order[k % order.length]);
        return deck;
    }
}
WbLootDeck.GRADE_SHARE = [0.5, 0.4, 0.1];
class WbFairBoxLayout {
    constructor(groups, rng) {
        this.groups = groups;
        this.rng = rng;
        this.clear = new Set();
        this.base = WbGrid.withPillars();
        for (const g of groups)
            for (const c of g.clear)
                this.clear.add(WbGrid.index(c.i, c.j));
    }
    static isLane(i, j) {
        return WbFairBoxLayout.LANE_COLS.indexOf(i) >= 0 || WbFairBoxLayout.LANE_ROWS.indexOf(j) >= 0;
    }
    build(kindsByGrade, lootRng) {
        const zones = new WbZoneMap(this.base, this.groups, this.rng);
        let best = null;
        let attempts = 0;
        for (let attempt = 1; attempt <= WbFairBoxLayout.MAX_TRIES; attempt++) {
            const grid = this.scatter();
            const fixes = this.balanceZones(grid, zones);
            const report = this.inspect(grid, zones);
            attempts = attempt;
            report.fixes = fixes;
            if (!best || report.score < best.report.score)
                best = { grid, report };
            if (report.passed)
                break;
        }
        const chosen = best;
        chosen.report.tries = attempts;
        const loot = kindsByGrade && lootRng ? this.hideLoot(chosen.grid, zones, kindsByGrade, lootRng, chosen.report) : null;
        return { grid: chosen.grid, loot, zones, report: chosen.report };
    }
    scatter() {
        const grid = this.base.clone();
        for (let j = 0; j < WbGrid.H; j++)
            for (let i = 0; i < WbGrid.W; i++) {
                const k = WbGrid.index(i, j);
                if (grid.cells[k] !== WbCell.EMPTY || this.clear.has(k))
                    continue;
                const chance = WbFairBoxLayout.isLane(i, j) ? WbFairBoxLayout.LANE_CHANCE : WbFairBoxLayout.BOX_CHANCE;
                if (this.rng.next() < chance)
                    grid.cells[k] = WbCell.BOX;
            }
        return grid;
    }
    zoneBoxCounts(grid, zones) {
        const counts = this.groups.map(() => 0);
        for (let k = 0; k < WbGrid.COUNT; k++)
            if (grid.cells[k] === WbCell.BOX && zones.zoneOf[k] >= 0)
                counts[zones.zoneOf[k]]++;
        return counts;
    }
    nearCounts(grid, zones) {
        return zones.distances.map((dist) => {
            let n = 0;
            for (let k = 0; k < WbGrid.COUNT; k++)
                if (grid.cells[k] === WbCell.BOX && dist[k] <= WbFairBoxLayout.NEAR_STEPS)
                    n++;
            return n;
        });
    }
    extremes(counts) {
        const hi = Math.max(...counts), lo = Math.min(...counts);
        const from = this.rng.pick(counts.map((c, z) => c === hi ? z : -1).filter((z) => z >= 0));
        const to = this.rng.pick(counts.map((c, z) => c === lo ? z : -1).filter((z) => z >= 0));
        return { hi, lo, from, to };
    }
    moveBox(grid, boxes, spaces) {
        if (!boxes.length || !spaces.length)
            return false;
        grid.cells[this.rng.pick(boxes)] = WbCell.EMPTY;
        grid.cells[this.rng.pick(spaces)] = WbCell.BOX;
        return true;
    }
    balanceZones(grid, zones) {
        let fixes = 0;
        const near = (zone, k) => zones.distances[zone][k] <= WbFairBoxLayout.NEAR_STEPS;
        const movable = (k) => !this.clear.has(k);
        while (fixes < WbFairBoxLayout.MAX_FIXES) {
            const trapped = this.groups.findIndex((g) => !this.hasEscape(grid, g));
            if (trapped >= 0) {
                const mouth = new Set();
                for (const c of this.groups[trapped].clear)
                    for (let d = 0; d < 4; d++) {
                        const ni = c.i + WbDirStep.DX[d], nj = c.j + WbDirStep.DZ[d];
                        if (WbGrid.inside(ni, nj))
                            mouth.add(WbGrid.index(ni, nj));
                    }
                const boxes = Array.from(mouth).filter((k) => grid.cells[k] === WbCell.BOX && movable(k));
                const spaces = zones.cells(trapped).filter((k) => grid.cells[k] === WbCell.EMPTY && movable(k) && !mouth.has(k) && near(trapped, k));
                if (!this.moveBox(grid, boxes, spaces))
                    break;
                fixes++;
                continue;
            }
            const n = this.extremes(this.nearCounts(grid, zones));
            if (n.hi - n.lo > WbFairBoxLayout.NEAR_SPREAD) {
                const boxes = zones.cells(n.from).filter((k) => grid.cells[k] === WbCell.BOX && near(n.from, k) && !near(n.to, k));
                const spaces = zones.cells(n.to).filter((k) => grid.cells[k] === WbCell.EMPTY && movable(k) && near(n.to, k));
                if (!this.moveBox(grid, boxes, spaces))
                    break;
                fixes++;
                continue;
            }
            const z = this.extremes(this.zoneBoxCounts(grid, zones));
            if (z.hi - z.lo <= WbFairBoxLayout.ZONE_SPREAD)
                break;
            const nearAny = (k) => zones.distances.some((d) => d[k] <= WbFairBoxLayout.NEAR_STEPS);
            const boxes = zones.cells(z.from).filter((k) => grid.cells[k] === WbCell.BOX && !nearAny(k));
            const spaces = zones.cells(z.to).filter((k) => grid.cells[k] === WbCell.EMPTY && movable(k) && !nearAny(k));
            if (!this.moveBox(grid, boxes, spaces))
                break;
            fixes++;
        }
        return fixes;
    }
    inspect(grid, zones) {
        const report = new WbFairReport();
        report.nearBoxes = zones.distances.map((dist) => {
            let n = 0;
            for (let k = 0; k < WbGrid.COUNT; k++)
                if (grid.cells[k] === WbCell.BOX && dist[k] <= WbFairBoxLayout.NEAR_STEPS)
                    n++;
            return n;
        });
        report.zoneBoxes = this.zoneBoxCounts(grid, zones);
        report.escapeOk = this.groups.map((g) => this.hasEscape(grid, g));
        const nearOver = Math.max(0, Math.max(...report.nearBoxes) - Math.min(...report.nearBoxes) - WbFairBoxLayout.NEAR_SPREAD);
        const zoneOver = Math.max(0, Math.max(...report.zoneBoxes) - Math.min(...report.zoneBoxes) - WbFairBoxLayout.ZONE_SPREAD);
        const escapeMiss = report.escapeOk.filter((ok) => !ok).length;
        report.score = nearOver + zoneOver + escapeMiss * 3;
        report.passed = report.score === 0;
        return report;
    }
    static wetCross(grid, i, j, range) {
        const wet = new Set([WbGrid.index(i, j)]);
        for (let d = 0; d < 4; d++) {
            for (let s = 1; s <= range; s++) {
                const ni = i + WbDirStep.DX[d] * s, nj = j + WbDirStep.DZ[d] * s;
                if (!WbGrid.inside(ni, nj) || grid.solid(ni, nj))
                    break;
                wet.add(WbGrid.index(ni, nj));
                if (grid.kind(ni, nj) === WbCell.BOX)
                    break;
            }
        }
        return wet;
    }
    hasEscape(grid, group) {
        for (const p of group.clear) {
            const wet = WbFairBoxLayout.wetCross(grid, p.i, p.j, 1);
            const dist = WbWalkDistance.fromSpots(grid, [p], false);
            let safe = 0;
            for (let k = 0; k < WbGrid.COUNT; k++)
                if (dist[k] > 0 && dist[k] <= WbFairBoxLayout.ESCAPE_STEPS && !wet.has(k))
                    safe++;
            if (safe >= WbFairBoxLayout.ESCAPE_CELLS)
                return true;
        }
        return false;
    }
    hideLoot(grid, zones, kindsByGrade, rng, report) {
        const zoneCount = this.groups.length;
        const boxTotal = grid.count(WbCell.BOX);
        const gradeCounts = WbLootDeck.gradeCounts(Math.round(boxTotal * WbFairBoxLayout.LOOT_RATIO));
        const perZone = [];
        for (let z = 0; z < zoneCount; z++)
            perZone.push([0, 0, 0]);
        const totals = () => perZone.map((g) => g[0] + g[1] + g[2]);
        for (let g = 2; g >= 0; g--) {
            const each = Math.floor(gradeCounts[g] / zoneCount);
            for (let z = 0; z < zoneCount; z++)
                perZone[z][g] += each;
            const leftover = gradeCounts[g] - each * zoneCount;
            const order = rng.shuffle(perZone.map((_, z) => z));
            order.sort((a, b) => totals()[a] - totals()[b]);
            for (let r = 0; r < leftover; r++)
                perZone[order[r]][g]++;
        }
        report.zoneGrades = perZone.map((g) => g.slice());
        const loot = new Map();
        const freeBoxes = zones.distances.map((_, z) => rng.shuffle(zones.cells(z).filter((k) => grid.cells[k] === WbCell.BOX)));
        const spare = () => {
            for (const list of freeBoxes)
                while (list.length) {
                    const k = list.pop();
                    if (!loot.has(k))
                        return k;
                }
            return -1;
        };
        for (let g = 0; g < 3; g++) {
            const deck = WbLootDeck.kinds(gradeCounts[g], kindsByGrade[g], rng);
            const slots = [];
            const need = perZone.map((counts) => counts[g]);
            const zoneOrder = rng.shuffle(perZone.map((_, z) => z));
            while (slots.length < gradeCounts[g])
                for (const z of zoneOrder)
                    if (need[z] > 0) {
                        need[z]--;
                        slots.push(z);
                    }
            slots.forEach((z, n) => {
                const list = freeBoxes[z];
                let cell = -1;
                while (list.length && cell < 0) {
                    const k = list.pop();
                    if (!loot.has(k))
                        cell = k;
                }
                if (cell < 0)
                    cell = spare();
                if (cell >= 0)
                    loot.set(cell, { grade: g, kind: deck[n] });
            });
        }
        return loot;
    }
}
WbFairBoxLayout.BOX_CHANCE = 0.65;
WbFairBoxLayout.LANE_CHANCE = 0.40;
WbFairBoxLayout.LANE_COLS = [6, 8];
WbFairBoxLayout.LANE_ROWS = [6];
WbFairBoxLayout.MAX_TRIES = 200;
WbFairBoxLayout.MAX_FIXES = 80;
WbFairBoxLayout.NEAR_STEPS = 4;
WbFairBoxLayout.NEAR_SPREAD = 1;
WbFairBoxLayout.ZONE_SPREAD = 2;
WbFairBoxLayout.ESCAPE_CELLS = 2;
WbFairBoxLayout.ESCAPE_STEPS = 7;
WbFairBoxLayout.LOOT_RATIO = 0.4;
class WbMapTheme {
}
class WbClassroomTheme extends WbMapTheme {
    constructor() {
        super(...arguments);
        this.id = "classroom";
        this.title = "교실";
        this.floorA = 0xC89A66;
        this.floorB = 0xBA8C5B;
        this.outside = 0x9C7A55;
        this.sky = 0xF4E7CF;
        this.sun = 0xFFF1D6;
        this.hemiSky = 0xFFF6E6;
        this.hemiGround = 0x8A6A4A;
        this.block = 0x8E9AA6;
        this.pillars = [
            [{ model: "table_medium", width: 1.8, height: 1.05 }, { model: "chair_A_wood", width: 0.75, dz: 0.78, yaw: Math.PI }],
        ];
        this.boxes = [
            [{ model: "box_small", width: 1.5, tint: 0xE2AC6E }, { model: "book_set", width: 1.0, lift: 1.5 }],
            [{ model: "box_small", width: 1.5, yaw: Math.PI / 2, tint: 0xE2AC6E }, { model: "book_set", width: 1.0, lift: 1.5, yaw: 0.6 }],
        ];
        this.wall = [{ model: "cabinet_medium", width: 2.0, height: 1.5 }];
    }
}
class WbPlaygroundTheme extends WbMapTheme {
    constructor() {
        super(...arguments);
        this.id = "playground";
        this.title = "운동장";
        this.floorA = 0x8DBF5C;
        this.floorB = 0x83B353;
        this.outside = 0xC9A878;
        this.sky = 0xAEDCF7;
        this.sun = 0xFFFFFF;
        this.hemiSky = 0xCFEBFF;
        this.hemiGround = 0x6E7F45;
        this.block = 0x9AA3AB;
        this.pillars = [
            [{ model: "Tree_1_A_Color1", width: 2.1 }],
            [{ shape: "pullupBar", width: 1.8 }],
        ];
        this.boxes = [
            [{ model: "box_small", width: 1.5, tint: 0xE2AC6E }],
            [{ model: "box_small", width: 1.5, yaw: Math.PI / 2, tint: 0xE2AC6E }, { model: "football", width: 0.62, lift: 1.5 }],
        ];
        this.wall = [{ model: "fence", width: 2.0, height: 1.1 }];
    }
}
class WbCafeteriaTheme extends WbMapTheme {
    constructor() {
        super(...arguments);
        this.id = "cafeteria";
        this.title = "급식실";
        this.floorA = 0xE8E2D4;
        this.floorB = 0xD9D1C1;
        this.outside = 0xB9AE9C;
        this.sky = 0xF6DDBE;
        this.sun = 0xFFE2B8;
        this.hemiSky = 0xFFEBD2;
        this.hemiGround = 0x8C7B66;
        this.block = 0x9C9488;
        this.pillars = [
            [{ model: "kitchentable_A", width: 1.8, height: 1.0 }],
        ];
        this.boxes = [
            [{ model: "box_small", width: 1.5, tint: 0xE2AC6E }, { model: "plate_stack", width: 0.95, lift: 1.5 }],
            [{ model: "barrel_small", width: 1.4, height: 1.5 }],
        ];
        this.wall = [{ model: "kitchencounter_straight_A", width: 2.0, height: 1.2 }];
    }
}
class WbMapCatalog {
    static find(id) {
        return WbMapCatalog.THEMES.find((t) => t.id === id) || WbMapCatalog.THEMES[0];
    }
    static resolve(id, rng) {
        return id === WbMapCatalog.RANDOM ? rng.pick(WbMapCatalog.THEMES) : WbMapCatalog.find(id);
    }
}
WbMapCatalog.THEMES = [new WbClassroomTheme(), new WbPlaygroundTheme(), new WbCafeteriaTheme()];
WbMapCatalog.RANDOM = "random";
