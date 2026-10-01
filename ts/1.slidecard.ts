interface BestRecord {
  time: number;
  moves: number;
}

interface MoveDirection {
  axis: "x" | "y";
  sign: -1 | 1;
}

function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const centis = Math.floor((total % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 요소가 없습니다`);
  }
  return element as T;
}

class SlidePuzzle {
  static readonly ROWS = 6;
  static readonly COLS = 6;
  static readonly CARD_COUNT = SlidePuzzle.ROWS * SlidePuzzle.COLS - 1;
  static readonly RED_ID = 0;
  static readonly START_EMPTY = 1;
  static readonly GOAL_SLOT = SlidePuzzle.ROWS * SlidePuzzle.COLS - 1;

  slotOf: number[] = [];
  emptySlot = SlidePuzzle.START_EMPTY;
  moves = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.emptySlot = SlidePuzzle.START_EMPTY;
    this.slotOf = Array.from({ length: SlidePuzzle.CARD_COUNT }, (_, id) =>
      id < SlidePuzzle.START_EMPTY ? id : id + 1
    );
    this.moves = 0;
  }

  directionToEmpty(slot: number): MoveDirection | null {
    const row = Math.floor(slot / SlidePuzzle.COLS);
    const col = slot % SlidePuzzle.COLS;
    const emptyRow = Math.floor(this.emptySlot / SlidePuzzle.COLS);
    const emptyCol = this.emptySlot % SlidePuzzle.COLS;
    if (row === emptyRow && emptyCol === col - 1) return { axis: "x", sign: -1 };
    if (row === emptyRow && emptyCol === col + 1) return { axis: "x", sign: 1 };
    if (col === emptyCol && emptyRow === row - 1) return { axis: "y", sign: -1 };
    if (col === emptyCol && emptyRow === row + 1) return { axis: "y", sign: 1 };
    return null;
  }

  moveCard(cardId: number): void {
    const from = this.slotOf[cardId];
    this.slotOf[cardId] = this.emptySlot;
    this.emptySlot = from;
    this.moves++;
  }

  isSolved(): boolean {
    return this.slotOf[SlidePuzzle.RED_ID] === SlidePuzzle.GOAL_SLOT;
  }
}

class Stopwatch {
  elapsed = 0;
  running = false;
  private startedAt = 0;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();
  }

  stop(): void {
    if (this.running) {
      this.elapsed = Date.now() - this.startedAt;
      this.running = false;
    }
  }

  read(): number {
    if (this.running) this.elapsed = Date.now() - this.startedAt;
    return this.elapsed;
  }

  reset(): void {
    this.running = false;
    this.elapsed = 0;
    this.startedAt = 0;
  }
}

class BestRecordStore {
  constructor(private readonly storageKey: string) {}

  load(): BestRecord | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (value && typeof value.time === "number" && typeof value.moves === "number") {
        return value as BestRecord;
      }
    } catch (e) {}
    return null;
  }

  save(record: BestRecord): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(record));
    } catch (e) {}
  }
}

class BoardGeometry {
  static readonly GAP = 8;
  static readonly PAD = 8;

  cell = 56;
  step = 64;

  constructor(private readonly boardElement: HTMLElement) {}

  measure(): void {
    const inner = this.boardElement.clientWidth - BoardGeometry.PAD * 2;
    this.cell = Math.max(24, (inner - BoardGeometry.GAP * (SlidePuzzle.COLS - 1)) / SlidePuzzle.COLS);
    this.step = this.cell + BoardGeometry.GAP;
    const height =
      BoardGeometry.PAD * 2 + this.cell * SlidePuzzle.ROWS + BoardGeometry.GAP * (SlidePuzzle.ROWS - 1);
    this.boardElement.style.height = `${height}px`;
  }

  xOf(slot: number): number {
    return BoardGeometry.PAD + (slot % SlidePuzzle.COLS) * this.step;
  }

  yOf(slot: number): number {
    return BoardGeometry.PAD + Math.floor(slot / SlidePuzzle.COLS) * this.step;
  }
}

class RecordPanel {
  private readonly bestValue = requireElement("best");
  private readonly bestMoves = requireElement("bestMoves");
  private readonly worldValue = requireElement("world");
  private readonly worldName = requireElement("worldName");
  private readonly classTile = requireElement("clsTile");
  private readonly classValue = requireElement("clsVal");
  private readonly className = requireElement("clsName");
  readonly worldRecord: WorldRecordHandle | null;

  constructor(private readonly format: (ms: number) => string) {
    this.worldRecord = window.WorldRecord
      ? window.WorldRecord("slidecard", { lower: true, format })
      : null;
    if (this.worldRecord) {
      this.worldRecord.onChange(() => this.renderWorld());
      this.worldRecord.load();
    }
  }

  renderBest(best: BestRecord | null): void {
    if (best) {
      this.bestValue.textContent = this.format(best.time);
      this.bestMoves.textContent = `${best.moves}회 이동`;
    } else {
      this.bestValue.textContent = "-";
      this.bestMoves.textContent = "아직 기록 없음";
    }
  }

  renderWorld(): void {
    const world = this.worldRecord;
    if (world && world.rec) {
      this.worldValue.textContent = world.text();
      this.worldName.textContent = world.who();
    } else {
      this.worldValue.textContent = "-";
      this.worldName.textContent = world && !world.loaded ? "불러오는 중…" : "아직 기록 없음";
    }
    const classRecord = world && world.cls;
    if (!classRecord) return;
    this.classTile.hidden = false;
    if (classRecord.rec) {
      this.classValue.textContent = classRecord.text();
      this.className.textContent = classRecord.who();
    } else {
      this.classValue.textContent = "-";
      this.className.textContent = classRecord.loaded ? "아직 기록 없음" : "불러오는 중…";
    }
  }

  promptNewRecord(elapsed: number): void {
    if (this.worldRecord) this.worldRecord.prompt(elapsed);
  }
}

interface DragState {
  pointerId: number;
  cardId: number;
  direction: MoveDirection;
  startX: number;
  startY: number;
  offset: number;
  farthest: number;
  startedAt: number;
}

class CardDragController {
  private drag: DragState | null = null;
  private readonly handleMove = (ev: PointerEvent) => this.onMove(ev);
  private readonly handleUp = (ev: PointerEvent) => this.onUp(ev);

  constructor(
    private readonly puzzle: SlidePuzzle,
    private readonly geometry: BoardGeometry,
    private readonly cards: HTMLElement[],
    private readonly isLocked: () => boolean,
    private readonly onCommit: (cardId: number) => void
  ) {}

  attach(cardId: number): void {
    this.cards[cardId].addEventListener("pointerdown", (ev) => this.onDown(ev, cardId));
  }

  private onDown(ev: PointerEvent, cardId: number): void {
    if (this.isLocked()) return;
    const direction = this.puzzle.directionToEmpty(this.puzzle.slotOf[cardId]);
    if (!direction) return;
    ev.preventDefault();
    const element = this.cards[cardId];
    element.classList.remove("anim");
    element.classList.add("dragging");
    element.setPointerCapture(ev.pointerId);
    this.drag = {
      pointerId: ev.pointerId,
      cardId,
      direction,
      startX: ev.clientX,
      startY: ev.clientY,
      offset: 0,
      farthest: 0,
      startedAt: Date.now(),
    };
    element.addEventListener("pointermove", this.handleMove);
    element.addEventListener("pointerup", this.handleUp);
    element.addEventListener("pointercancel", this.handleUp);
  }

  private onMove(ev: PointerEvent): void {
    const drag = this.drag;
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    drag.farthest = Math.max(drag.farthest, Math.abs(dx), Math.abs(dy));
    const raw = drag.direction.axis === "x" ? dx : dy;
    const clamped = Math.min(this.geometry.step, Math.max(0, raw * drag.direction.sign));
    drag.offset = clamped;
    const signed = clamped * drag.direction.sign;
    this.cards[drag.cardId].style.transform =
      drag.direction.axis === "x" ? `translateX(${signed}px)` : `translateY(${signed}px)`;
  }

  private onUp(ev: PointerEvent): void {
    const drag = this.drag;
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const element = this.cards[drag.cardId];
    element.removeEventListener("pointermove", this.handleMove);
    element.removeEventListener("pointerup", this.handleUp);
    element.removeEventListener("pointercancel", this.handleUp);
    element.classList.remove("dragging");
    const isTap = drag.farthest < 6 && Date.now() - drag.startedAt < 400;
    const shouldCommit = drag.offset >= this.geometry.step * 0.35 || isTap;
    this.drag = null;
    element.style.transform = "";
    element.classList.add("anim");
    if (shouldCommit) this.onCommit(drag.cardId);
  }
}

class SlideCardGame {
  private static readonly BEST_KEY = "slidecard6x6_best_v1";

  private readonly board = requireElement("board");
  private readonly clockElement = requireElement("clock");
  private readonly movesElement = requireElement("moves");
  private readonly statusElement = requireElement("status");
  private readonly puzzle = new SlidePuzzle();
  private readonly stopwatch = new Stopwatch();
  private readonly geometry = new BoardGeometry(this.board);
  private readonly bestStore = new BestRecordStore(SlideCardGame.BEST_KEY);
  private readonly recordPanel = new RecordPanel(formatTime);
  private readonly cards: HTMLElement[] = [];
  private readonly dragController: CardDragController;
  private best: BestRecord | null = this.bestStore.load();
  private finished = false;
  private animationFrame = 0;

  constructor() {
    this.buildCards();
    this.dragController = new CardDragController(
      this.puzzle,
      this.geometry,
      this.cards,
      () => this.finished,
      (cardId) => this.applyMove(cardId)
    );
    this.cards.forEach((_, cardId) => this.dragController.attach(cardId));
    requireElement("reset").addEventListener("click", () => this.reset());
    window.addEventListener("resize", () => this.layout(false));
    window.addEventListener("load", () => this.layout(false));
    this.reset();
  }

  private buildCards(): void {
    this.board.innerHTML = "";
    for (let id = 0; id < SlidePuzzle.CARD_COUNT; id++) {
      const element = document.createElement("div");
      element.className = "card" + (id === SlidePuzzle.RED_ID ? " red" : "");
      this.board.appendChild(element);
      this.cards.push(element);
    }
  }

  private reset(): void {
    this.puzzle.reset();
    this.stopwatch.reset();
    this.finished = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.movesElement.textContent = "0";
    this.clockElement.textContent = formatTime(0);
    this.clockElement.classList.remove("done");
    this.statusElement.textContent = "대기 중 · 첫 이동에서 시작";
    this.cards.forEach((card) => card.classList.remove("locked"));
    this.recordPanel.renderBest(this.best);
    this.recordPanel.renderWorld();
    this.layout(false);
  }

  private layout(animate: boolean): void {
    this.geometry.measure();
    this.cards.forEach((card, id) => {
      const slot = this.puzzle.slotOf[id];
      card.classList.toggle("anim", animate);
      card.style.width = `${this.geometry.cell}px`;
      card.style.height = `${this.geometry.cell}px`;
      card.style.left = `${this.geometry.xOf(slot)}px`;
      card.style.top = `${this.geometry.yOf(slot)}px`;
      card.style.transform = "";
    });
  }

  private applyMove(cardId: number): void {
    this.puzzle.moveCard(cardId);
    this.movesElement.textContent = String(this.puzzle.moves);
    this.startClock();
    this.layout(true);
    if (this.puzzle.isSolved()) this.finish();
  }

  private startClock(): void {
    if (this.stopwatch.running || this.finished) return;
    this.stopwatch.start();
    this.statusElement.textContent = "측정 중";
    this.tick();
  }

  private tick(): void {
    if (!this.stopwatch.running) return;
    this.clockElement.textContent = formatTime(this.stopwatch.read());
    this.animationFrame = requestAnimationFrame(() => this.tick());
  }

  private finish(): void {
    this.finished = true;
    this.stopwatch.stop();
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    const elapsed = this.stopwatch.elapsed;
    const moves = this.puzzle.moves;
    this.clockElement.textContent = formatTime(elapsed);
    this.clockElement.classList.add("done");
    const isNewBest = !this.best || elapsed < this.best.time;
    if (isNewBest) {
      this.best = { time: elapsed, moves };
      this.bestStore.save(this.best);
      this.recordPanel.renderBest(this.best);
    }
    this.statusElement.textContent = `${isNewBest ? "완료 · 신기록! " : "완료 · 기록 "}${formatTime(elapsed)} / ${moves}회`;
    this.recordPanel.promptNewRecord(elapsed);
    this.cards.forEach((card) => card.classList.add("locked"));
  }
}

new SlideCardGame();
