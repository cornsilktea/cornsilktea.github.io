type TerritoryDirection = 0 | 1 | 2 | 3;

class TerritoryRules {
  static readonly SIZE = 32;
  static readonly CELL_COUNT = TerritoryRules.SIZE * TerritoryRules.SIZE;
  static readonly HOME_RADIUS = 1;
  static readonly SPAWN_INSET = 3;
  static readonly STEP_MS = 220;
  static readonly GAME_MS = 60000;
  static readonly TOTAL_TICKS = Math.floor(TerritoryRules.GAME_MS / TerritoryRules.STEP_MS);
  static readonly RESPAWN_MS = 3000;
  static readonly RESPAWN_TICKS = Math.ceil(TerritoryRules.RESPAWN_MS / TerritoryRules.STEP_MS);
  static readonly MAX_PENDING_TURNS = 2;
  static readonly NET_MS = 150;
  static readonly END_GRACE_MS = 500;
  static readonly MAX_CATCH_UP_TICKS = 40;
  static readonly NO_OWNER = -1;
}

class TerritoryDirections {
  static readonly UP: TerritoryDirection = 0;
  static readonly RIGHT: TerritoryDirection = 1;
  static readonly DOWN: TerritoryDirection = 2;
  static readonly LEFT: TerritoryDirection = 3;
  static readonly ALL: readonly TerritoryDirection[] = [0, 1, 2, 3];
  static readonly DX: readonly number[] = [0, 1, 0, -1];
  static readonly DY: readonly number[] = [-1, 0, 1, 0];
  private static readonly BY_NAME: Readonly<Record<string, TerritoryDirection>> = { up: 0, right: 1, down: 2, left: 3 };
  private static readonly NAMES: readonly string[] = ["up", "right", "down", "left"];

  static opposite(direction: TerritoryDirection): TerritoryDirection {
    return ((direction + 2) % 4) as TerritoryDirection;
  }

  static fromName(name: string): TerritoryDirection | null {
    const found = TerritoryDirections.BY_NAME[name];
    return found === undefined ? null : found;
  }

  static nameOf(direction: TerritoryDirection): string {
    return TerritoryDirections.NAMES[direction];
  }

  static fromOffset(dx: number, dy: number): TerritoryDirection {
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? TerritoryDirections.RIGHT : TerritoryDirections.LEFT;
    return dy >= 0 ? TerritoryDirections.DOWN : TerritoryDirections.UP;
  }
}

class TerritoryCellCode {
  static readonly EMPTY = 0;
  static readonly OWNER_SPAN = 7;
  static readonly LIMIT = TerritoryCellCode.OWNER_SPAN * TerritoryCellCode.OWNER_SPAN;

  static encode(owner: number, tail: number): number {
    return owner + 1 + TerritoryCellCode.OWNER_SPAN * (tail + 1);
  }

  static ownerOf(code: number): number {
    return code % TerritoryCellCode.OWNER_SPAN - 1;
  }

  static tailOf(code: number): number {
    return Math.floor(code / TerritoryCellCode.OWNER_SPAN) - 1;
  }
}

interface TerritoryCellChange {
  readonly index: number;
  readonly before: number;
  readonly after: number;
}

class TerritoryGrid {
  private readonly codes = new Uint8Array(TerritoryRules.CELL_COUNT);
  private readonly changedFrom = new Map<number, number>();
  private readonly ownedTotals: number[];
  private readonly tailTotals: number[];

  constructor(readonly playerCount: number) {
    this.ownedTotals = new Array<number>(playerCount).fill(0);
    this.tailTotals = new Array<number>(playerCount).fill(0);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < TerritoryRules.SIZE && y < TerritoryRules.SIZE;
  }

  index(x: number, y: number): number {
    return y * TerritoryRules.SIZE + x;
  }

  xOf(index: number): number {
    return index % TerritoryRules.SIZE;
  }

  yOf(index: number): number {
    return Math.floor(index / TerritoryRules.SIZE);
  }

  code(index: number): number {
    return this.codes[index];
  }

  owner(index: number): number {
    return TerritoryCellCode.ownerOf(this.codes[index]);
  }

  tail(index: number): number {
    return TerritoryCellCode.tailOf(this.codes[index]);
  }

  ownedCount(player: number): number {
    return this.ownedTotals[player];
  }

  tailCount(player: number): number {
    return this.tailTotals[player];
  }

  cellsOwnedBy(player: number): number[] {
    return this.collect((index) => this.owner(index) === player);
  }

  tailCellsOf(player: number): number[] {
    return this.collect((index) => this.tail(index) === player);
  }

  setOwner(index: number, player: number): void {
    this.setCode(index, TerritoryCellCode.encode(player, this.tail(index)));
  }

  setTail(index: number, player: number): void {
    this.setCode(index, TerritoryCellCode.encode(this.owner(index), player));
  }

  setCode(index: number, code: number): void {
    const before = this.codes[index];
    if (before === code) return;
    if (!this.changedFrom.has(index)) this.changedFrom.set(index, before);
    this.count(before, -1);
    this.count(code, 1);
    this.codes[index] = code;
  }

  drainChanges(): TerritoryCellChange[] {
    const changes: TerritoryCellChange[] = [];
    this.changedFrom.forEach((before, index) => {
      if (before !== this.codes[index]) changes.push({ index, before, after: this.codes[index] });
    });
    this.changedFrom.clear();
    return changes;
  }

  private collect(test: (index: number) => boolean): number[] {
    const found: number[] = [];
    for (let index = 0; index < TerritoryRules.CELL_COUNT; index++) if (test(index)) found.push(index);
    return found;
  }

  private count(code: number, delta: number): void {
    const owner = TerritoryCellCode.ownerOf(code), tail = TerritoryCellCode.tailOf(code);
    if (owner >= 0) this.ownedTotals[owner] += delta;
    if (tail >= 0) this.tailTotals[tail] += delta;
  }
}

class TerritoryEnclosure {
  static enclosedCells(grid: TerritoryGrid, player: number, extraOwned: readonly number[]): number[] {
    const size = TerritoryRules.SIZE;
    const blocked = new Uint8Array(TerritoryRules.CELL_COUNT);
    for (let index = 0; index < TerritoryRules.CELL_COUNT; index++) if (grid.owner(index) === player) blocked[index] = 1;
    extraOwned.forEach((index) => { blocked[index] = 1; });
    const reached = new Uint8Array(TerritoryRules.CELL_COUNT);
    const pending: number[] = [];
    const visit = (x: number, y: number): void => {
      if (!grid.inBounds(x, y)) return;
      const index = grid.index(x, y);
      if (blocked[index] || reached[index]) return;
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
      const index = pending.pop() as number;
      const x = grid.xOf(index), y = grid.yOf(index);
      TerritoryDirections.ALL.forEach((direction) => visit(x + TerritoryDirections.DX[direction], y + TerritoryDirections.DY[direction]));
    }
    const inside: number[] = [];
    for (let index = 0; index < TerritoryRules.CELL_COUNT; index++) if (!blocked[index] && !reached[index]) inside.push(index);
    return inside;
  }
}

class TerritoryPlayer {
  x: number;
  y: number;
  dir: TerritoryDirection;
  alive = true;
  respawnTick = 0;
  targetX = 0;
  targetY = 0;
  private pending: TerritoryDirection[] = [];

  constructor(readonly index: number, readonly id: string, readonly homeX: number, readonly homeY: number, startDir: TerritoryDirection) {
    this.x = homeX;
    this.y = homeY;
    this.dir = startDir;
  }

  queueTurn(direction: TerritoryDirection): boolean {
    const last = this.pending.length ? this.pending[this.pending.length - 1] : this.dir;
    if (direction === last || direction === TerritoryDirections.opposite(last)) return false;
    if (this.pending.length >= TerritoryRules.MAX_PENDING_TURNS) return false;
    this.pending.push(direction);
    return true;
  }

  takeTurn(): void {
    const next = this.pending.shift();
    if (next !== undefined && next !== TerritoryDirections.opposite(this.dir)) this.dir = next;
  }

  clearTurns(): void {
    this.pending = [];
  }

  aimAtNextCell(): void {
    this.targetX = this.x + TerritoryDirections.DX[this.dir];
    this.targetY = this.y + TerritoryDirections.DY[this.dir];
  }

  placeAt(x: number, y: number, direction: TerritoryDirection): void {
    this.x = x;
    this.y = y;
    this.dir = direction;
    this.clearTurns();
  }
}

class TerritoryStartLayout {
  static place(count: number, seed: number): Array<{ x: number; y: number; dir: TerritoryDirection }> {
    const random = new SeededRandom(seed ^ 0x2545F491);
    const side = TerritoryRules.SIZE - 1 - TerritoryRules.SPAWN_INSET * 2;
    const perimeter = side * 4;
    const spacing = perimeter / count;
    const offset = random.next() * spacing;
    const spots: Array<{ x: number; y: number; dir: TerritoryDirection }> = [];
    for (let slot = 0; slot < count; slot++) spots.push(TerritoryStartLayout.spotAt(Math.floor(offset + slot * spacing) % perimeter, side));
    for (let slot = spots.length - 1; slot > 0; slot--) {
      const other = Math.floor(random.next() * (slot + 1));
      const kept = spots[slot];
      spots[slot] = spots[other];
      spots[other] = kept;
    }
    return spots;
  }

  private static spotAt(along: number, side: number): { x: number; y: number; dir: TerritoryDirection } {
    const inset = TerritoryRules.SPAWN_INSET;
    const edge = Math.floor(along / side), step = along % side;
    if (edge === 0) return { x: inset + step, y: inset, dir: TerritoryDirections.DOWN };
    if (edge === 1) return { x: inset + side, y: inset + step, dir: TerritoryDirections.LEFT };
    if (edge === 2) return { x: inset + side - step, y: inset + side, dir: TerritoryDirections.UP };
    return { x: inset, y: inset + side - step, dir: TerritoryDirections.RIGHT };
  }
}

type TerritoryDeathCause = "wall" | "self" | "tail";

interface TerritoryDeath {
  readonly index: number;
  readonly cause: TerritoryDeathCause;
  readonly by: number;
}

interface TerritoryCapture {
  readonly player: number;
  readonly cells: number;
}

interface TerritoryTickReport {
  readonly tick: number;
  readonly deaths: readonly TerritoryDeath[];
  readonly captures: readonly TerritoryCapture[];
  readonly respawns: readonly number[];
}

class TerritoryBoard {
  readonly grid: TerritoryGrid;
  readonly players: TerritoryPlayer[];
  private currentTick = 0;
  private readonly random: SeededRandom;

  constructor(ids: readonly string[], seed: number) {
    this.grid = new TerritoryGrid(ids.length);
    this.random = new SeededRandom(seed ^ 0x9E3779B9);
    const spots = TerritoryStartLayout.place(ids.length, seed);
    this.players = ids.map((id, index) => new TerritoryPlayer(index, id, spots[index].x, spots[index].y, spots[index].dir));
    this.players.forEach((player) => this.claimHome(player));
    this.grid.drainChanges();
  }

  get tick(): number { return this.currentTick; }

  playerById(id: string): TerritoryPlayer | null {
    return this.players.find((player) => player.id === id) || null;
  }

  jumpToTick(tick: number): void {
    this.currentTick = tick;
  }

  restorePlayer(index: number, state: { x: number; y: number; dir: TerritoryDirection; alive: boolean }, tick: number): void {
    const player = this.players[index];
    if (player.alive && !state.alive) player.respawnTick = tick + TerritoryRules.RESPAWN_TICKS;
    player.x = state.x;
    player.y = state.y;
    player.dir = state.dir;
    player.alive = state.alive;
  }

  advance(): TerritoryTickReport {
    this.currentTick++;
    const respawns = this.respawnDue();
    const movers = this.players.filter((player) => player.alive && respawns.indexOf(player.index) < 0);
    movers.forEach((player) => {
      player.takeTurn();
      player.aimAtNextCell();
    });
    const deaths = this.findDeaths(movers);
    deaths.forEach((death) => this.kill(this.players[death.index]));
    const captures: TerritoryCapture[] = [];
    movers.filter((player) => player.alive).forEach((player) => {
      const cells = this.enter(player);
      if (cells > 0) captures.push({ player: player.index, cells });
    });
    return { tick: this.currentTick, deaths, captures, respawns };
  }

  private findDeaths(movers: readonly TerritoryPlayer[]): TerritoryDeath[] {
    const deaths = new Map<number, TerritoryDeath>();
    movers.forEach((player) => {
      if (!this.grid.inBounds(player.targetX, player.targetY)) {
        if (!deaths.has(player.index)) deaths.set(player.index, { index: player.index, cause: "wall", by: TerritoryRules.NO_OWNER });
        return;
      }
      const trailOwner = this.grid.tail(this.grid.index(player.targetX, player.targetY));
      if (trailOwner < 0) return;
      if (trailOwner === player.index) {
        if (!deaths.has(player.index)) deaths.set(player.index, { index: player.index, cause: "self", by: player.index });
      } else if (this.players[trailOwner].alive && !deaths.has(trailOwner)) {
        deaths.set(trailOwner, { index: trailOwner, cause: "tail", by: player.index });
      }
    });
    return Array.from(deaths.values());
  }

  private kill(player: TerritoryPlayer): void {
    this.grid.tailCellsOf(player.index).forEach((cell) => this.grid.setTail(cell, TerritoryRules.NO_OWNER));
    player.alive = false;
    player.respawnTick = this.currentTick + TerritoryRules.RESPAWN_TICKS;
    player.clearTurns();
  }

  private enter(player: TerritoryPlayer): number {
    player.x = player.targetX;
    player.y = player.targetY;
    const cell = this.grid.index(player.x, player.y);
    if (this.grid.owner(cell) === player.index) return this.grid.tailCount(player.index) > 0 ? this.closeLoop(player) : 0;
    if (this.grid.tail(cell) === TerritoryRules.NO_OWNER) this.grid.setTail(cell, player.index);
    return 0;
  }

  private closeLoop(player: TerritoryPlayer): number {
    const trail = this.grid.tailCellsOf(player.index);
    const inside = TerritoryEnclosure.enclosedCells(this.grid, player.index, trail);
    trail.forEach((cell) => {
      this.grid.setTail(cell, TerritoryRules.NO_OWNER);
      this.grid.setOwner(cell, player.index);
    });
    inside.forEach((cell) => this.grid.setOwner(cell, player.index));
    return trail.length + inside.length;
  }

  private respawnDue(): number[] {
    const revived: number[] = [];
    this.players.forEach((player) => {
      if (player.alive || this.currentTick < player.respawnTick) return;
      this.respawn(player);
      revived.push(player.index);
    });
    return revived;
  }

  private respawn(player: TerritoryPlayer): void {
    const owned = this.grid.cellsOwnedBy(player.index);
    if (!owned.length) {
      this.claimHome(player);
      player.placeAt(player.homeX, player.homeY, this.directionTowardCenter(player.homeX, player.homeY));
    } else {
      const cell = owned[Math.min(owned.length - 1, Math.floor(this.random.next() * owned.length))];
      const x = this.grid.xOf(cell), y = this.grid.yOf(cell);
      player.placeAt(x, y, this.directionTowardCenter(x, y));
    }
    player.alive = true;
  }

  private claimHome(player: TerritoryPlayer): void {
    const radius = TerritoryRules.HOME_RADIUS;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (this.grid.inBounds(player.homeX + dx, player.homeY + dy)) this.grid.setOwner(this.grid.index(player.homeX + dx, player.homeY + dy), player.index);
      }
    }
  }

  private directionTowardCenter(x: number, y: number): TerritoryDirection {
    const middle = (TerritoryRules.SIZE - 1) / 2;
    const preferred = TerritoryDirections.fromOffset(middle - x, middle - y);
    const options = [preferred, ...TerritoryDirections.ALL.filter((direction) => direction !== preferred)];
    const free = options.find((direction) => this.grid.inBounds(x + TerritoryDirections.DX[direction], y + TerritoryDirections.DY[direction]));
    return free === undefined ? preferred : free;
  }
}

class TerritoryStandings {
  static percent(grid: TerritoryGrid, player: number): number {
    return Math.round(grid.ownedCount(player) / TerritoryRules.CELL_COUNT * 1000) / 10;
  }

  static ranking(board: TerritoryBoard): RankEntry[] {
    const counts = board.players.map((player) => board.grid.ownedCount(player.index));
    return board.players.map((player) => ({
      id: player.id,
      rank: 1 + counts.filter((count) => count > counts[player.index]).length
    }));
  }

  static order(board: TerritoryBoard): TerritoryPlayer[] {
    return board.players.slice().sort((a, b) => board.grid.ownedCount(b.index) - board.grid.ownedCount(a.index) || a.index - b.index);
  }
}
