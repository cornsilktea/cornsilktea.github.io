"use strict";
class TerritoryCodec {
    static encodePlayers(players, grid) {
        return players.map((player) => ((grid.index(player.x, player.y) * 4 + player.dir) * 2 + (player.alive ? 1 : 0)).toString(36)).join(",");
    }
    static decodePlayers(text, count, grid) {
        const parts = text.split(",");
        if (parts.length !== count)
            return null;
        const states = [];
        for (const part of parts) {
            const value = parseInt(part, 36);
            if (!isFinite(value) || value < 0 || value >= TerritoryRules.CELL_COUNT * TerritoryCodec.STATE_SPAN)
                return null;
            const cell = Math.floor(value / TerritoryCodec.STATE_SPAN);
            states.push({ x: grid.xOf(cell), y: grid.yOf(cell), dir: (Math.floor(value / 2) % 4), alive: value % 2 === 1 });
        }
        return states;
    }
    static encodeCells(changes) {
        if (!changes.size)
            return TerritoryCodec.NO_CELLS;
        const parts = [];
        changes.forEach((code, index) => parts.push(index.toString(36) + "." + code.toString(36)));
        return parts.join(",");
    }
    static decodeCells(text) {
        if (text === TerritoryCodec.NO_CELLS)
            return [];
        const cells = [];
        for (const part of text.split(",")) {
            const pair = part.split(".");
            const index = parseInt(pair[0], 36), code = parseInt(pair[1], 36);
            if (pair.length !== 2 || !(index >= 0 && index < TerritoryRules.CELL_COUNT) || !(code >= 0 && code < TerritoryCellCode.LIMIT))
                return null;
            cells.push({ index, code });
        }
        return cells;
    }
}
TerritoryCodec.NO_CELLS = "-";
TerritoryCodec.STATE_SPAN = 8;
class TerritoryRecords {
    static delta(value, playerCount, grid) {
        const raw = value;
        if (!raw || typeof raw !== "object" || typeof raw.q !== "number" || typeof raw.t !== "number" || typeof raw.p !== "string" || typeof raw.c !== "string")
            return null;
        const players = TerritoryCodec.decodePlayers(raw.p, playerCount, grid);
        const cells = TerritoryCodec.decodeCells(raw.c);
        return players && cells ? { seq: raw.q, tick: raw.t, players, cells } : null;
    }
    static turn(value) {
        const raw = value;
        if (!raw || typeof raw !== "object" || typeof raw.n !== "number" || typeof raw.d !== "number")
            return null;
        if (raw.d !== Math.floor(raw.d) || raw.d < 0 || raw.d > 3)
            return null;
        return { direction: raw.d, n: raw.n };
    }
}
class TerritoryWire {
    static streams() {
        return [
            { name: TerritoryWire.DELTA, events: ["child_added"] },
            { name: TerritoryWire.TURN, events: ["child_added", "child_changed"] }
        ];
    }
    static handlers(target) {
        return {
            [TerritoryWire.DELTA]: (key, value) => target.receiveDelta(value),
            [TerritoryWire.TURN]: (key, value) => target.receiveTurn(key, value)
        };
    }
    constructor(wire) {
        this.wire = wire;
    }
    publishDelta(record) {
        this.wire.push(TerritoryWire.DELTA, record);
    }
    publishTurn(id, record) {
        this.wire.set(TerritoryWire.TURN, id, record);
    }
}
TerritoryWire.DELTA = "delta";
TerritoryWire.TURN = "turn";
class TerritoryOutbox {
    constructor() {
        this.pending = new Map();
        this.lastSentTick = -1;
        this.sequence = 0;
    }
    noteChanges(changes) {
        changes.forEach((change) => this.pending.set(change.index, change.after));
    }
    adoptSequence(seq) {
        if (seq > this.sequence)
            this.sequence = seq;
    }
    hasNews(tick) {
        return this.pending.size > 0 || tick !== this.lastSentTick;
    }
    flush(board) {
        this.sequence++;
        const record = {
            q: this.sequence,
            t: board.tick,
            p: TerritoryCodec.encodePlayers(board.players, board.grid),
            c: TerritoryCodec.encodeCells(this.pending)
        };
        this.pending.clear();
        this.lastSentTick = board.tick;
        return record;
    }
}
class TerritoryTurnInbox {
    constructor() {
        this.seen = new Map();
    }
    accept(id, n) {
        if (n <= (this.seen.get(id) || 0))
            return false;
        this.seen.set(id, n);
        return true;
    }
}
class TerritoryTurnSender {
    constructor(wire, localId) {
        this.wire = wire;
        this.localId = localId;
        this.counter = 0;
    }
    send(direction) {
        this.counter++;
        this.wire.publishTurn(this.localId, { d: direction, n: this.counter });
    }
    get count() { return this.counter; }
}
class TerritoryAiTuning {
}
TerritoryAiTuning.LEG_MIN = 3;
TerritoryAiTuning.LEG_SPREAD = 6;
TerritoryAiTuning.WANDER_CHANCE = 0.12;
TerritoryAiTuning.ATTACK_RANGE = 7;
TerritoryAiTuning.DANGER_RANGE = 3;
TerritoryAiTuning.MAX_TAIL = 26;
TerritoryAiTuning.AGGRESSION_MIN = 0.35;
TerritoryAiTuning.AGGRESSION_SPREAD = 0.55;
class TerritoryPathfinder {
    static firstStepHome(grid, me, options) {
        const firstStep = new Int8Array(TerritoryRules.CELL_COUNT).fill(-1);
        const queue = [];
        options.forEach((direction) => {
            const cell = grid.index(me.x + TerritoryDirections.DX[direction], me.y + TerritoryDirections.DY[direction]);
            if (firstStep[cell] >= 0)
                return;
            firstStep[cell] = direction;
            queue.push(cell);
        });
        for (let head = 0; head < queue.length; head++) {
            const cell = queue[head];
            if (grid.owner(cell) === me.index)
                return firstStep[cell];
            const x = grid.xOf(cell), y = grid.yOf(cell);
            TerritoryDirections.ALL.forEach((direction) => {
                const nx = x + TerritoryDirections.DX[direction], ny = y + TerritoryDirections.DY[direction];
                if (!grid.inBounds(nx, ny))
                    return;
                const next = grid.index(nx, ny);
                if (firstStep[next] >= 0 || grid.tail(next) === me.index)
                    return;
                firstStep[next] = firstStep[cell];
                queue.push(next);
            });
        }
        return null;
    }
}
class TerritoryAiDriver {
    constructor(random) {
        this.random = random;
        this.phase = TerritoryAiDriver.PHASE_OUT;
        this.stepsLeft = 0;
        this.legMax = TerritoryAiTuning.LEG_MIN + Math.floor(random.next() * TerritoryAiTuning.LEG_SPREAD);
        this.aggression = TerritoryAiTuning.AGGRESSION_MIN + random.next() * TerritoryAiTuning.AGGRESSION_SPREAD;
    }
    decide(board, me) {
        const grid = board.grid;
        const options = this.safeOptions(grid, me);
        if (!options.length)
            return me.dir;
        const strike = options.find((direction) => this.isEnemyTail(board, me, this.nextCellOf(grid, me, direction)));
        if (strike !== undefined)
            return strike;
        return grid.tailCount(me.index) > 0 ? this.decideOutside(board, me, options) : this.decideInside(board, me, options);
    }
    decideInside(board, me, options) {
        this.phase = TerritoryAiDriver.PHASE_OUT;
        this.stepsLeft = this.newLeg();
        const hunt = this.hunt(board, me, options);
        if (hunt !== null)
            return hunt;
        const straight = options.indexOf(me.dir) >= 0 ? me.dir : null;
        if (straight === null || this.random.chance(TerritoryAiTuning.WANDER_CHANCE))
            return options[this.random.index(options.length)];
        return straight;
    }
    decideOutside(board, me, options) {
        const grid = board.grid;
        if (this.endangered(board, me) || grid.tailCount(me.index) >= TerritoryAiTuning.MAX_TAIL)
            return this.goHome(grid, me, options);
        if (this.phase === TerritoryAiDriver.PHASE_HOME)
            return this.goHome(grid, me, options);
        if (this.stepsLeft > 0 && options.indexOf(me.dir) >= 0) {
            this.stepsLeft--;
            return me.dir;
        }
        if (this.phase === TerritoryAiDriver.PHASE_OUT) {
            this.phase = TerritoryAiDriver.PHASE_SIDE;
            this.stepsLeft = this.newLeg();
            return this.roomierSide(grid, me, options);
        }
        this.phase = TerritoryAiDriver.PHASE_HOME;
        return this.goHome(grid, me, options);
    }
    goHome(grid, me, options) {
        this.phase = TerritoryAiDriver.PHASE_HOME;
        const step = TerritoryPathfinder.firstStepHome(grid, me, options);
        return step === null ? options[0] : step;
    }
    hunt(board, me, options) {
        if (!this.random.chance(this.aggression))
            return null;
        let best = null;
        options.forEach((direction) => {
            const nx = me.x + TerritoryDirections.DX[direction], ny = me.y + TerritoryDirections.DY[direction];
            const distance = this.distanceToEnemyTail(board, me, nx, ny);
            if (distance <= TerritoryAiTuning.ATTACK_RANGE && (best === null || distance < best.distance))
                best = { direction, distance };
        });
        const chosen = best;
        return chosen ? chosen.direction : null;
    }
    roomierSide(grid, me, options) {
        const sides = options.filter((direction) => direction !== me.dir);
        if (!sides.length)
            return options[0];
        const room = (direction) => {
            let steps = 0;
            while (steps < TerritoryRules.SIZE && grid.inBounds(me.x + TerritoryDirections.DX[direction] * (steps + 1), me.y + TerritoryDirections.DY[direction] * (steps + 1)))
                steps++;
            return steps + this.random.next();
        };
        return sides.reduce((best, direction) => (room(direction) > room(best) ? direction : best), sides[0]);
    }
    newLeg() {
        return TerritoryAiTuning.LEG_MIN + Math.floor(this.random.next() * (this.legMax - TerritoryAiTuning.LEG_MIN + 1));
    }
    safeOptions(grid, me) {
        return TerritoryDirections.ALL.filter((direction) => {
            if (direction === TerritoryDirections.opposite(me.dir))
                return false;
            const nx = me.x + TerritoryDirections.DX[direction], ny = me.y + TerritoryDirections.DY[direction];
            return grid.inBounds(nx, ny) && grid.tail(grid.index(nx, ny)) !== me.index;
        });
    }
    nextCellOf(grid, me, direction) {
        return grid.index(me.x + TerritoryDirections.DX[direction], me.y + TerritoryDirections.DY[direction]);
    }
    isEnemyTail(board, me, cell) {
        const owner = board.grid.tail(cell);
        return owner >= 0 && owner !== me.index && board.players[owner].alive;
    }
    distanceToEnemyTail(board, me, x, y) {
        let nearest = Infinity;
        board.players.forEach((enemy) => {
            if (enemy === me || !enemy.alive || board.grid.tailCount(enemy.index) === 0)
                return;
            board.grid.tailCellsOf(enemy.index).forEach((cell) => {
                nearest = Math.min(nearest, Math.abs(board.grid.xOf(cell) - x) + Math.abs(board.grid.yOf(cell) - y));
            });
        });
        return nearest;
    }
    endangered(board, me) {
        const trail = board.grid.tailCellsOf(me.index);
        return board.players.some((enemy) => enemy !== me && enemy.alive && trail.some((cell) => Math.abs(board.grid.xOf(cell) - enemy.x) + Math.abs(board.grid.yOf(cell) - enemy.y) <= TerritoryAiTuning.DANGER_RANGE));
    }
}
TerritoryAiDriver.PHASE_OUT = 0;
TerritoryAiDriver.PHASE_SIDE = 1;
TerritoryAiDriver.PHASE_HOME = 2;
class TerritoryPilots {
    constructor(participants, random) {
        this.participants = participants;
        this.random = random;
        this.drivers = new Map();
        this.departed = new Set();
    }
    markDeparted(id) {
        this.departed.add(id);
    }
    steer(board) {
        board.players.forEach((player) => {
            if (!player.alive || !this.isComputer(player.id))
                return;
            player.queueTurn(this.driverOf(player.id).decide(board, player));
        });
    }
    isComputer(id) {
        if (this.departed.has(id))
            return true;
        const participant = this.participants.find((entry) => entry.id === id);
        return !!participant && participant.ai;
    }
    driverOf(id) {
        let driver = this.drivers.get(id);
        if (!driver) {
            driver = new TerritoryAiDriver(new RandomRange(this.random));
            this.drivers.set(id, driver);
        }
        return driver;
    }
}
class TerritoryReferee {
    constructor(host, startAt, board, pilots, outlet) {
        this.host = host;
        this.startAt = startAt;
        this.board = board;
        this.pilots = pilots;
        this.outlet = outlet;
    }
    dueTick(now) {
        return Math.min(TerritoryRules.TOTAL_TICKS, Math.floor((now - this.startAt) / TerritoryRules.STEP_MS));
    }
    step(now) {
        if (!this.host.isHost())
            return;
        const due = this.dueTick(now);
        let budget = TerritoryRules.MAX_CATCH_UP_TICKS;
        while (this.board.tick < due && budget-- > 0) {
            this.pilots.steer(this.board);
            const report = this.board.advance();
            this.outlet.stepped(report, this.board.grid.drainChanges());
        }
    }
}
