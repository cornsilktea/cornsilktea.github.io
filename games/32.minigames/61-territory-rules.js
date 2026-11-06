"use strict";
class TerritoryRules {
}
TerritoryRules.SIZE = 32;
TerritoryRules.CELL_COUNT = TerritoryRules.SIZE * TerritoryRules.SIZE;
TerritoryRules.HOME_RADIUS = 1;
TerritoryRules.SPAWN_INSET = 3;
TerritoryRules.STEP_MS = 220;
TerritoryRules.GAME_MS = 60000;
TerritoryRules.TOTAL_TICKS = Math.floor(TerritoryRules.GAME_MS / TerritoryRules.STEP_MS);
TerritoryRules.RESPAWN_MS = 3000;
TerritoryRules.RESPAWN_TICKS = Math.ceil(TerritoryRules.RESPAWN_MS / TerritoryRules.STEP_MS);
TerritoryRules.MAX_PENDING_TURNS = 2;
TerritoryRules.NET_MS = 150;
TerritoryRules.END_GRACE_MS = 500;
TerritoryRules.MAX_CATCH_UP_TICKS = 40;
TerritoryRules.NO_OWNER = -1;
class TerritoryDirections {
    static opposite(direction) {
        return ((direction + 2) % 4);
    }
    static fromName(name) {
        const found = TerritoryDirections.BY_NAME[name];
        return found === undefined ? null : found;
    }
    static nameOf(direction) {
        return TerritoryDirections.NAMES[direction];
    }
    static fromOffset(dx, dy) {
        if (Math.abs(dx) >= Math.abs(dy))
            return dx >= 0 ? TerritoryDirections.RIGHT : TerritoryDirections.LEFT;
        return dy >= 0 ? TerritoryDirections.DOWN : TerritoryDirections.UP;
    }
}
TerritoryDirections.UP = 0;
TerritoryDirections.RIGHT = 1;
TerritoryDirections.DOWN = 2;
TerritoryDirections.LEFT = 3;
TerritoryDirections.ALL = [0, 1, 2, 3];
TerritoryDirections.DX = [0, 1, 0, -1];
TerritoryDirections.DY = [-1, 0, 1, 0];
TerritoryDirections.BY_NAME = { up: 0, right: 1, down: 2, left: 3 };
TerritoryDirections.NAMES = ["up", "right", "down", "left"];
class TerritoryCellCode {
    static encode(owner, tail) {
        return owner + 1 + TerritoryCellCode.OWNER_SPAN * (tail + 1);
    }
    static ownerOf(code) {
        return code % TerritoryCellCode.OWNER_SPAN - 1;
    }
    static tailOf(code) {
        return Math.floor(code / TerritoryCellCode.OWNER_SPAN) - 1;
    }
}
TerritoryCellCode.EMPTY = 0;
TerritoryCellCode.OWNER_SPAN = 7;
TerritoryCellCode.LIMIT = TerritoryCellCode.OWNER_SPAN * TerritoryCellCode.OWNER_SPAN;
class TerritoryGrid {
    constructor(playerCount) {
        this.playerCount = playerCount;
        this.codes = new Uint8Array(TerritoryRules.CELL_COUNT);
        this.changedFrom = new Map();
        this.ownedTotals = new Array(playerCount).fill(0);
        this.tailTotals = new Array(playerCount).fill(0);
    }
    inBounds(x, y) {
        return x >= 0 && y >= 0 && x < TerritoryRules.SIZE && y < TerritoryRules.SIZE;
    }
    index(x, y) {
        return y * TerritoryRules.SIZE + x;
    }
    xOf(index) {
        return index % TerritoryRules.SIZE;
    }
    yOf(index) {
        return Math.floor(index / TerritoryRules.SIZE);
    }
    code(index) {
        return this.codes[index];
    }
    owner(index) {
        return TerritoryCellCode.ownerOf(this.codes[index]);
    }
    tail(index) {
        return TerritoryCellCode.tailOf(this.codes[index]);
    }
    ownedCount(player) {
        return this.ownedTotals[player];
    }
    tailCount(player) {
        return this.tailTotals[player];
    }
    cellsOwnedBy(player) {
        return this.collect((index) => this.owner(index) === player);
    }
    tailCellsOf(player) {
        return this.collect((index) => this.tail(index) === player);
    }
    setOwner(index, player) {
        this.setCode(index, TerritoryCellCode.encode(player, this.tail(index)));
    }
    setTail(index, player) {
        this.setCode(index, TerritoryCellCode.encode(this.owner(index), player));
    }
    setCode(index, code) {
        const before = this.codes[index];
        if (before === code)
            return;
        if (!this.changedFrom.has(index))
            this.changedFrom.set(index, before);
        this.count(before, -1);
        this.count(code, 1);
        this.codes[index] = code;
    }
    drainChanges() {
        const changes = [];
        this.changedFrom.forEach((before, index) => {
            if (before !== this.codes[index])
                changes.push({ index, before, after: this.codes[index] });
        });
        this.changedFrom.clear();
        return changes;
    }
    collect(test) {
        const found = [];
        for (let index = 0; index < TerritoryRules.CELL_COUNT; index++)
            if (test(index))
                found.push(index);
        return found;
    }
    count(code, delta) {
        const owner = TerritoryCellCode.ownerOf(code), tail = TerritoryCellCode.tailOf(code);
        if (owner >= 0)
            this.ownedTotals[owner] += delta;
        if (tail >= 0)
            this.tailTotals[tail] += delta;
    }
}
class TerritoryEnclosure {
    static enclosedCells(grid, player, extraOwned) {
        const size = TerritoryRules.SIZE;
        const blocked = new Uint8Array(TerritoryRules.CELL_COUNT);
        for (let index = 0; index < TerritoryRules.CELL_COUNT; index++)
            if (grid.owner(index) === player)
                blocked[index] = 1;
        extraOwned.forEach((index) => { blocked[index] = 1; });
        const reached = new Uint8Array(TerritoryRules.CELL_COUNT);
        const pending = [];
        const visit = (x, y) => {
            if (!grid.inBounds(x, y))
                return;
            const index = grid.index(x, y);
            if (blocked[index] || reached[index])
                return;
            reached[index] = 1;
            pending.push(index);
        };
        for (let line = 0; line < size; line++) {
            visit(line, 0);
            visit(line, size - 1);
            visit(0, line);
            visit(size - 1, line);
        }
        while (pending.length) {
            const index = pending.pop();
            const x = grid.xOf(index), y = grid.yOf(index);
            TerritoryDirections.ALL.forEach((direction) => visit(x + TerritoryDirections.DX[direction], y + TerritoryDirections.DY[direction]));
        }
        const inside = [];
        for (let index = 0; index < TerritoryRules.CELL_COUNT; index++)
            if (!blocked[index] && !reached[index])
                inside.push(index);
        return inside;
    }
}
class TerritoryPlayer {
    constructor(index, id, homeX, homeY, startDir) {
        this.index = index;
        this.id = id;
        this.homeX = homeX;
        this.homeY = homeY;
        this.alive = true;
        this.respawnTick = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.pending = [];
        this.x = homeX;
        this.y = homeY;
        this.dir = startDir;
    }
    queueTurn(direction) {
        const last = this.pending.length ? this.pending[this.pending.length - 1] : this.dir;
        if (direction === last || direction === TerritoryDirections.opposite(last))
            return false;
        if (this.pending.length >= TerritoryRules.MAX_PENDING_TURNS)
            return false;
        this.pending.push(direction);
        return true;
    }
    takeTurn() {
        const next = this.pending.shift();
        if (next !== undefined && next !== TerritoryDirections.opposite(this.dir))
            this.dir = next;
    }
    clearTurns() {
        this.pending = [];
    }
    aimAtNextCell() {
        this.targetX = this.x + TerritoryDirections.DX[this.dir];
        this.targetY = this.y + TerritoryDirections.DY[this.dir];
    }
    placeAt(x, y, direction) {
        this.x = x;
        this.y = y;
        this.dir = direction;
        this.clearTurns();
    }
}
class TerritoryStartLayout {
    static place(count, seed) {
        const random = new SeededRandom(seed ^ 0x2545F491);
        const side = TerritoryRules.SIZE - 1 - TerritoryRules.SPAWN_INSET * 2;
        const perimeter = side * 4;
        const spacing = perimeter / count;
        const offset = random.next() * spacing;
        const spots = [];
        for (let slot = 0; slot < count; slot++)
            spots.push(TerritoryStartLayout.spotAt(Math.floor(offset + slot * spacing) % perimeter, side));
        for (let slot = spots.length - 1; slot > 0; slot--) {
            const other = Math.floor(random.next() * (slot + 1));
            const kept = spots[slot];
            spots[slot] = spots[other];
            spots[other] = kept;
        }
        return spots;
    }
    static spotAt(along, side) {
        const inset = TerritoryRules.SPAWN_INSET;
        const edge = Math.floor(along / side), step = along % side;
        if (edge === 0)
            return { x: inset + step, y: inset, dir: TerritoryDirections.DOWN };
        if (edge === 1)
            return { x: inset + side, y: inset + step, dir: TerritoryDirections.LEFT };
        if (edge === 2)
            return { x: inset + side - step, y: inset + side, dir: TerritoryDirections.UP };
        return { x: inset, y: inset + side - step, dir: TerritoryDirections.RIGHT };
    }
}
class TerritoryBoard {
    constructor(ids, seed) {
        this.currentTick = 0;
        this.grid = new TerritoryGrid(ids.length);
        this.random = new SeededRandom(seed ^ 0x9E3779B9);
        const spots = TerritoryStartLayout.place(ids.length, seed);
        this.players = ids.map((id, index) => new TerritoryPlayer(index, id, spots[index].x, spots[index].y, spots[index].dir));
        this.players.forEach((player) => this.claimHome(player));
        this.grid.drainChanges();
    }
    get tick() { return this.currentTick; }
    playerById(id) {
        return this.players.find((player) => player.id === id) || null;
    }
    jumpToTick(tick) {
        this.currentTick = tick;
    }
    restorePlayer(index, state, tick) {
        const player = this.players[index];
        if (player.alive && !state.alive)
            player.respawnTick = tick + TerritoryRules.RESPAWN_TICKS;
        player.x = state.x;
        player.y = state.y;
        player.dir = state.dir;
        player.alive = state.alive;
    }
    advance() {
        this.currentTick++;
        const respawns = this.respawnDue();
        const movers = this.players.filter((player) => player.alive && respawns.indexOf(player.index) < 0);
        movers.forEach((player) => {
            player.takeTurn();
            player.aimAtNextCell();
        });
        const deaths = this.findDeaths(movers);
        deaths.forEach((death) => this.kill(this.players[death.index]));
        const captures = [];
        movers.filter((player) => player.alive).forEach((player) => {
            const cells = this.enter(player);
            if (cells > 0)
                captures.push({ player: player.index, cells });
        });
        return { tick: this.currentTick, deaths, captures, respawns };
    }
    findDeaths(movers) {
        const deaths = new Map();
        movers.forEach((player) => {
            if (!this.grid.inBounds(player.targetX, player.targetY)) {
                if (!deaths.has(player.index))
                    deaths.set(player.index, { index: player.index, cause: "wall", by: TerritoryRules.NO_OWNER });
                return;
            }
            const trailOwner = this.grid.tail(this.grid.index(player.targetX, player.targetY));
            if (trailOwner < 0)
                return;
            if (trailOwner === player.index) {
                if (!deaths.has(player.index))
                    deaths.set(player.index, { index: player.index, cause: "self", by: player.index });
            }
            else if (this.players[trailOwner].alive && !deaths.has(trailOwner)) {
                deaths.set(trailOwner, { index: trailOwner, cause: "tail", by: player.index });
            }
        });
        return Array.from(deaths.values());
    }
    kill(player) {
        this.grid.tailCellsOf(player.index).forEach((cell) => this.grid.setTail(cell, TerritoryRules.NO_OWNER));
        player.alive = false;
        player.respawnTick = this.currentTick + TerritoryRules.RESPAWN_TICKS;
        player.clearTurns();
    }
    enter(player) {
        player.x = player.targetX;
        player.y = player.targetY;
        const cell = this.grid.index(player.x, player.y);
        if (this.grid.owner(cell) === player.index)
            return this.grid.tailCount(player.index) > 0 ? this.closeLoop(player) : 0;
        if (this.grid.tail(cell) === TerritoryRules.NO_OWNER)
            this.grid.setTail(cell, player.index);
        return 0;
    }
    closeLoop(player) {
        const trail = this.grid.tailCellsOf(player.index);
        const inside = TerritoryEnclosure.enclosedCells(this.grid, player.index, trail);
        trail.forEach((cell) => {
            this.grid.setTail(cell, TerritoryRules.NO_OWNER);
            this.grid.setOwner(cell, player.index);
        });
        inside.forEach((cell) => this.grid.setOwner(cell, player.index));
        return trail.length + inside.length;
    }
    respawnDue() {
        const revived = [];
        this.players.forEach((player) => {
            if (player.alive || this.currentTick < player.respawnTick)
                return;
            this.respawn(player);
            revived.push(player.index);
        });
        return revived;
    }
    respawn(player) {
        const owned = this.grid.cellsOwnedBy(player.index);
        if (!owned.length) {
            this.claimHome(player);
            player.placeAt(player.homeX, player.homeY, this.directionTowardCenter(player.homeX, player.homeY));
        }
        else {
            const cell = owned[Math.min(owned.length - 1, Math.floor(this.random.next() * owned.length))];
            const x = this.grid.xOf(cell), y = this.grid.yOf(cell);
            player.placeAt(x, y, this.directionTowardCenter(x, y));
        }
        player.alive = true;
    }
    claimHome(player) {
        const radius = TerritoryRules.HOME_RADIUS;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (this.grid.inBounds(player.homeX + dx, player.homeY + dy))
                    this.grid.setOwner(this.grid.index(player.homeX + dx, player.homeY + dy), player.index);
            }
        }
    }
    directionTowardCenter(x, y) {
        const middle = (TerritoryRules.SIZE - 1) / 2;
        const preferred = TerritoryDirections.fromOffset(middle - x, middle - y);
        const options = [preferred, ...TerritoryDirections.ALL.filter((direction) => direction !== preferred)];
        const free = options.find((direction) => this.grid.inBounds(x + TerritoryDirections.DX[direction], y + TerritoryDirections.DY[direction]));
        return free === undefined ? preferred : free;
    }
}
class TerritoryStandings {
    static percent(grid, player) {
        return Math.round(grid.ownedCount(player) / TerritoryRules.CELL_COUNT * 1000) / 10;
    }
    static ranking(board) {
        const counts = board.players.map((player) => board.grid.ownedCount(player.index));
        return board.players.map((player) => ({
            id: player.id,
            rank: 1 + counts.filter((count) => count > counts[player.index]).length
        }));
    }
    static order(board) {
        return board.players.slice().sort((a, b) => board.grid.ownedCount(b.index) - board.grid.ownedCount(a.index) || a.index - b.index);
    }
}
