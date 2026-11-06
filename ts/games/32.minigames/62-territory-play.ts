interface TerritoryPlayerState {
  readonly x: number;
  readonly y: number;
  readonly dir: TerritoryDirection;
  readonly alive: boolean;
}

interface TerritoryDelta {
  readonly seq: number;
  readonly tick: number;
  readonly players: readonly TerritoryPlayerState[];
  readonly cells: ReadonlyArray<{ readonly index: number; readonly code: number }>;
}

interface TerritoryDeltaRecord {
  readonly q: number;
  readonly t: number;
  readonly p: string;
  readonly c: string;
}

interface TerritoryTurnRecord {
  readonly d: number;
  readonly n: number;
}

class TerritoryCodec {
  private static readonly NO_CELLS = "-";
  private static readonly STATE_SPAN = 8;

  static encodePlayers(players: readonly TerritoryPlayer[], grid: TerritoryGrid): string {
    return players.map((player) => ((grid.index(player.x, player.y) * 4 + player.dir) * 2 + (player.alive ? 1 : 0)).toString(36)).join(",");
  }

  static decodePlayers(text: string, count: number, grid: TerritoryGrid): TerritoryPlayerState[] | null {
    const parts = text.split(",");
    if (parts.length !== count) return null;
    const states: TerritoryPlayerState[] = [];
    for (const part of parts) {
      const value = parseInt(part, 36);
      if (!isFinite(value) || value < 0 || value >= TerritoryRules.CELL_COUNT * TerritoryCodec.STATE_SPAN) return null;
      const cell = Math.floor(value / TerritoryCodec.STATE_SPAN);
      states.push({ x: grid.xOf(cell), y: grid.yOf(cell), dir: (Math.floor(value / 2) % 4) as TerritoryDirection, alive: value % 2 === 1 });
    }
    return states;
  }

  static encodeCells(changes: ReadonlyMap<number, number>): string {
    if (!changes.size) return TerritoryCodec.NO_CELLS;
    const parts: string[] = [];
    changes.forEach((code, index) => parts.push(index.toString(36) + "." + code.toString(36)));
    return parts.join(",");
  }

  static decodeCells(text: string): Array<{ index: number; code: number }> | null {
    if (text === TerritoryCodec.NO_CELLS) return [];
    const cells: Array<{ index: number; code: number }> = [];
    for (const part of text.split(",")) {
      const pair = part.split(".");
      const index = parseInt(pair[0], 36), code = parseInt(pair[1], 36);
      if (pair.length !== 2 || !(index >= 0 && index < TerritoryRules.CELL_COUNT) || !(code >= 0 && code < TerritoryCellCode.LIMIT)) return null;
      cells.push({ index, code });
    }
    return cells;
  }
}

class TerritoryRecords {
  static delta(value: unknown, playerCount: number, grid: TerritoryGrid): TerritoryDelta | null {
    const raw = value as Partial<Record<keyof TerritoryDeltaRecord, unknown>> | null;
    if (!raw || typeof raw !== "object" || typeof raw.q !== "number" || typeof raw.t !== "number" || typeof raw.p !== "string" || typeof raw.c !== "string") return null;
    const players = TerritoryCodec.decodePlayers(raw.p, playerCount, grid);
    const cells = TerritoryCodec.decodeCells(raw.c);
    return players && cells ? { seq: raw.q, tick: raw.t, players, cells } : null;
  }

  static turn(value: unknown): { direction: TerritoryDirection; n: number } | null {
    const raw = value as Partial<Record<keyof TerritoryTurnRecord, unknown>> | null;
    if (!raw || typeof raw !== "object" || typeof raw.n !== "number" || typeof raw.d !== "number") return null;
    if (raw.d !== Math.floor(raw.d) || raw.d < 0 || raw.d > 3) return null;
    return { direction: raw.d as TerritoryDirection, n: raw.n };
  }
}

interface TerritoryWireTarget {
  receiveDelta(value: unknown): void;
  receiveTurn(key: string, value: unknown): void;
}

class TerritoryWire {
  private static readonly DELTA = "delta";
  private static readonly TURN = "turn";

  static streams(): readonly WireStream[] {
    return [
      { name: TerritoryWire.DELTA, events: ["child_added"] },
      { name: TerritoryWire.TURN, events: ["child_added", "child_changed"] }
    ];
  }

  static handlers(target: TerritoryWireTarget): Readonly<Record<string, (key: string, value: unknown) => void>> {
    return {
      [TerritoryWire.DELTA]: (key, value) => target.receiveDelta(value),
      [TerritoryWire.TURN]: (key, value) => target.receiveTurn(key, value)
    };
  }

  constructor(private readonly wire: GameWire) {}

  publishDelta(record: TerritoryDeltaRecord): void {
    this.wire.push(TerritoryWire.DELTA, record);
  }

  publishTurn(id: string, record: TerritoryTurnRecord): void {
    this.wire.set(TerritoryWire.TURN, id, record);
  }
}

class TerritoryOutbox {
  private readonly pending = new Map<number, number>();
  private lastSentTick = -1;
  private sequence = 0;

  noteChanges(changes: readonly TerritoryCellChange[]): void {
    changes.forEach((change) => this.pending.set(change.index, change.after));
  }

  adoptSequence(seq: number): void {
    if (seq > this.sequence) this.sequence = seq;
  }

  hasNews(tick: number): boolean {
    return this.pending.size > 0 || tick !== this.lastSentTick;
  }

  flush(board: TerritoryBoard): TerritoryDeltaRecord {
    this.sequence++;
    const record: TerritoryDeltaRecord = {
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
  private readonly seen = new Map<string, number>();

  accept(id: string, n: number): boolean {
    if (n <= (this.seen.get(id) || 0)) return false;
    this.seen.set(id, n);
    return true;
  }
}

class TerritoryTurnSender {
  private counter = 0;

  constructor(private readonly wire: TerritoryWire, private readonly localId: string) {}

  send(direction: TerritoryDirection): void {
    this.counter++;
    this.wire.publishTurn(this.localId, { d: direction, n: this.counter });
  }

  get count(): number { return this.counter; }
}

class TerritoryAiTuning {
  static readonly LEG_MIN = 3;
  static readonly LEG_SPREAD = 6;
  static readonly WANDER_CHANCE = 0.12;
  static readonly ATTACK_RANGE = 7;
  static readonly DANGER_RANGE = 3;
  static readonly MAX_TAIL = 26;
  static readonly AGGRESSION_MIN = 0.35;
  static readonly AGGRESSION_SPREAD = 0.55;
}

class TerritoryPathfinder {
  static firstStepHome(grid: TerritoryGrid, me: TerritoryPlayer, options: readonly TerritoryDirection[]): TerritoryDirection | null {
    const firstStep = new Int8Array(TerritoryRules.CELL_COUNT).fill(-1);
    const queue: number[] = [];
    options.forEach((direction) => {
      const cell = grid.index(me.x + TerritoryDirections.DX[direction], me.y + TerritoryDirections.DY[direction]);
      if (firstStep[cell] >= 0) return;
      firstStep[cell] = direction;
      queue.push(cell);
    });
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      if (grid.owner(cell) === me.index) return firstStep[cell] as TerritoryDirection;
      const x = grid.xOf(cell), y = grid.yOf(cell);
      TerritoryDirections.ALL.forEach((direction) => {
        const nx = x + TerritoryDirections.DX[direction], ny = y + TerritoryDirections.DY[direction];
        if (!grid.inBounds(nx, ny)) return;
        const next = grid.index(nx, ny);
        if (firstStep[next] >= 0 || grid.tail(next) === me.index) return;
        firstStep[next] = firstStep[cell];
        queue.push(next);
      });
    }
    return null;
  }
}

class TerritoryAiDriver {
  private static readonly PHASE_OUT = 0;
  private static readonly PHASE_SIDE = 1;
  private static readonly PHASE_HOME = 2;

  private phase = TerritoryAiDriver.PHASE_OUT;
  private stepsLeft = 0;
  private readonly legMax: number;
  private readonly aggression: number;

  constructor(private readonly random: RandomRange) {
    this.legMax = TerritoryAiTuning.LEG_MIN + Math.floor(random.next() * TerritoryAiTuning.LEG_SPREAD);
    this.aggression = TerritoryAiTuning.AGGRESSION_MIN + random.next() * TerritoryAiTuning.AGGRESSION_SPREAD;
  }

  decide(board: TerritoryBoard, me: TerritoryPlayer): TerritoryDirection {
    const grid = board.grid;
    const options = this.safeOptions(grid, me);
    if (!options.length) return me.dir;
    const strike = options.find((direction) => this.isEnemyTail(board, me, this.nextCellOf(grid, me, direction)));
    if (strike !== undefined) return strike;
    return grid.tailCount(me.index) > 0 ? this.decideOutside(board, me, options) : this.decideInside(board, me, options);
  }

  private decideInside(board: TerritoryBoard, me: TerritoryPlayer, options: readonly TerritoryDirection[]): TerritoryDirection {
    this.phase = TerritoryAiDriver.PHASE_OUT;
    this.stepsLeft = this.newLeg();
    const hunt = this.hunt(board, me, options);
    if (hunt !== null) return hunt;
    const straight = options.indexOf(me.dir) >= 0 ? me.dir : null;
    if (straight === null || this.random.chance(TerritoryAiTuning.WANDER_CHANCE)) return options[this.random.index(options.length)];
    return straight;
  }

  private decideOutside(board: TerritoryBoard, me: TerritoryPlayer, options: readonly TerritoryDirection[]): TerritoryDirection {
    const grid = board.grid;
    if (this.endangered(board, me) || grid.tailCount(me.index) >= TerritoryAiTuning.MAX_TAIL) return this.goHome(grid, me, options);
    if (this.phase === TerritoryAiDriver.PHASE_HOME) return this.goHome(grid, me, options);
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

  private goHome(grid: TerritoryGrid, me: TerritoryPlayer, options: readonly TerritoryDirection[]): TerritoryDirection {
    this.phase = TerritoryAiDriver.PHASE_HOME;
    const step = TerritoryPathfinder.firstStepHome(grid, me, options);
    return step === null ? options[0] : step;
  }

  private hunt(board: TerritoryBoard, me: TerritoryPlayer, options: readonly TerritoryDirection[]): TerritoryDirection | null {
    if (!this.random.chance(this.aggression)) return null;
    let best: { direction: TerritoryDirection; distance: number } | null = null;
    options.forEach((direction) => {
      const nx = me.x + TerritoryDirections.DX[direction], ny = me.y + TerritoryDirections.DY[direction];
      const distance = this.distanceToEnemyTail(board, me, nx, ny);
      if (distance <= TerritoryAiTuning.ATTACK_RANGE && (best === null || distance < best.distance)) best = { direction, distance };
    });
    const chosen = best as { direction: TerritoryDirection; distance: number } | null;
    return chosen ? chosen.direction : null;
  }

  private roomierSide(grid: TerritoryGrid, me: TerritoryPlayer, options: readonly TerritoryDirection[]): TerritoryDirection {
    const sides = options.filter((direction) => direction !== me.dir);
    if (!sides.length) return options[0];
    const room = (direction: TerritoryDirection): number => {
      let steps = 0;
      while (steps < TerritoryRules.SIZE && grid.inBounds(me.x + TerritoryDirections.DX[direction] * (steps + 1), me.y + TerritoryDirections.DY[direction] * (steps + 1))) steps++;
      return steps + this.random.next();
    };
    return sides.reduce((best, direction) => (room(direction) > room(best) ? direction : best), sides[0]);
  }

  private newLeg(): number {
    return TerritoryAiTuning.LEG_MIN + Math.floor(this.random.next() * (this.legMax - TerritoryAiTuning.LEG_MIN + 1));
  }

  private safeOptions(grid: TerritoryGrid, me: TerritoryPlayer): TerritoryDirection[] {
    return TerritoryDirections.ALL.filter((direction) => {
      if (direction === TerritoryDirections.opposite(me.dir)) return false;
      const nx = me.x + TerritoryDirections.DX[direction], ny = me.y + TerritoryDirections.DY[direction];
      return grid.inBounds(nx, ny) && grid.tail(grid.index(nx, ny)) !== me.index;
    });
  }

  private nextCellOf(grid: TerritoryGrid, me: TerritoryPlayer, direction: TerritoryDirection): number {
    return grid.index(me.x + TerritoryDirections.DX[direction], me.y + TerritoryDirections.DY[direction]);
  }

  private isEnemyTail(board: TerritoryBoard, me: TerritoryPlayer, cell: number): boolean {
    const owner = board.grid.tail(cell);
    return owner >= 0 && owner !== me.index && board.players[owner].alive;
  }

  private distanceToEnemyTail(board: TerritoryBoard, me: TerritoryPlayer, x: number, y: number): number {
    let nearest = Infinity;
    board.players.forEach((enemy) => {
      if (enemy === me || !enemy.alive || board.grid.tailCount(enemy.index) === 0) return;
      board.grid.tailCellsOf(enemy.index).forEach((cell) => {
        nearest = Math.min(nearest, Math.abs(board.grid.xOf(cell) - x) + Math.abs(board.grid.yOf(cell) - y));
      });
    });
    return nearest;
  }

  private endangered(board: TerritoryBoard, me: TerritoryPlayer): boolean {
    const trail = board.grid.tailCellsOf(me.index);
    return board.players.some((enemy) => enemy !== me && enemy.alive && trail.some((cell) =>
      Math.abs(board.grid.xOf(cell) - enemy.x) + Math.abs(board.grid.yOf(cell) - enemy.y) <= TerritoryAiTuning.DANGER_RANGE
    ));
  }
}

class TerritoryPilots {
  private readonly drivers = new Map<string, TerritoryAiDriver>();
  private readonly departed = new Set<string>();

  constructor(private readonly participants: readonly MatchParticipant[], private readonly random: RandomSource) {}

  markDeparted(id: string): void {
    this.departed.add(id);
  }

  steer(board: TerritoryBoard): void {
    board.players.forEach((player) => {
      if (!player.alive || !this.isComputer(player.id)) return;
      player.queueTurn(this.driverOf(player.id).decide(board, player));
    });
  }

  private isComputer(id: string): boolean {
    if (this.departed.has(id)) return true;
    const participant = this.participants.find((entry) => entry.id === id);
    return !!participant && participant.ai;
  }

  private driverOf(id: string): TerritoryAiDriver {
    let driver = this.drivers.get(id);
    if (!driver) {
      driver = new TerritoryAiDriver(new RandomRange(this.random));
      this.drivers.set(id, driver);
    }
    return driver;
  }
}

interface TerritoryRefereeOutlet {
  stepped(report: TerritoryTickReport, changes: readonly TerritoryCellChange[]): void;
}

class TerritoryReferee {
  constructor(
    private readonly host: HostGate,
    private readonly startAt: number,
    private readonly board: TerritoryBoard,
    private readonly pilots: TerritoryPilots,
    private readonly outlet: TerritoryRefereeOutlet
  ) {}

  dueTick(now: number): number {
    return Math.min(TerritoryRules.TOTAL_TICKS, Math.floor((now - this.startAt) / TerritoryRules.STEP_MS));
  }

  step(now: number): void {
    if (!this.host.isHost()) return;
    const due = this.dueTick(now);
    let budget = TerritoryRules.MAX_CATCH_UP_TICKS;
    while (this.board.tick < due && budget-- > 0) {
      this.pilots.steer(this.board);
      const report = this.board.advance();
      this.outlet.stepped(report, this.board.grid.drainChanges());
    }
  }
}
