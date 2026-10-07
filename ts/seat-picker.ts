type MessageTone = "info" | "ok" | "warn";

class SeatDom {
  static byId<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`#${id} 요소가 없어요`);
    return element as T;
  }

  static create<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }
}

class SeatPosition {
  constructor(readonly row: number, readonly column: number) {}

  get index(): number {
    return (this.row - 1) * SeatBoard.COLUMNS + (this.column - 1);
  }

  equals(other: SeatPosition): boolean {
    return this.row === other.row && this.column === other.column;
  }

  static fromElement(element: HTMLElement): SeatPosition | null {
    const row = Number(element.dataset.row);
    const column = Number(element.dataset.column);
    return row >= 1 && column >= 1 ? new SeatPosition(row, column) : null;
  }
}

class Seat {
  static readonly BLOCKED_CELL = -1;

  blocked = false;
  number = 0;

  constructor(readonly position: SeatPosition) {}

  get isEmpty(): boolean {
    return !this.blocked && this.number === 0;
  }

  get isFilled(): boolean {
    return this.number > 0;
  }

  toggleBlocked(): void {
    this.blocked = !this.blocked;
  }

  assign(number: number): void {
    this.number = number;
  }

  clear(): void {
    this.number = 0;
  }

  toCell(): number {
    return this.blocked ? Seat.BLOCKED_CELL : this.number;
  }

  loadCell(cell: number): void {
    this.blocked = cell === Seat.BLOCKED_CELL;
    this.number = cell > 0 ? cell : 0;
  }
}

class SeatBoard {
  static readonly ROWS = 5;
  static readonly COLUMNS = 6;
  private static readonly CELL_PATTERN = /^(-1|0|[1-9][0-9]{0,2})$/;

  private readonly seats: Seat[] = Array.from(
    { length: SeatBoard.ROWS * SeatBoard.COLUMNS },
    (_, index) => new Seat(new SeatPosition(Math.floor(index / SeatBoard.COLUMNS) + 1, (index % SeatBoard.COLUMNS) + 1)),
  );

  seatAt(position: SeatPosition): Seat {
    return this.seats[position.index];
  }

  availableSeats(): Seat[] {
    return this.seats.filter((seat) => !seat.blocked);
  }

  availableCount(): number {
    return this.availableSeats().length;
  }

  hasAssignments(): boolean {
    return this.seats.some((seat) => seat.isFilled);
  }

  clearAssignments(): void {
    this.seats.forEach((seat) => seat.clear());
  }

  toCells(): string {
    return this.seats.map((seat) => seat.toCell()).join(",");
  }

  loadCells(text: string): boolean {
    const cells = text.split(",");
    if (cells.length !== this.seats.length) return false;
    if (!cells.every((cell) => SeatBoard.CELL_PATTERN.test(cell))) return false;
    this.seats.forEach((seat, index) => seat.loadCell(Number(cells[index])));
    return true;
  }
}

class SequenceBuilder {
  static between(from: number, to: number): number[] {
    const step = to >= from ? 1 : -1;
    return Array.from({ length: Math.abs(to - from) + 1 }, (_, index) => from + index * step);
  }
}

abstract class ViewPerspective {
  abstract readonly label: string;
  abstract readonly chalkboardClass: string;
  abstract rowsTopToBottom(depth: number): number[];
  abstract columnsLeftToRight(width: number): number[];
}

class TeacherPerspective extends ViewPerspective {
  readonly label = "선생님 기준";
  readonly chalkboardClass = "chalk-bottom";

  rowsTopToBottom(depth: number): number[] {
    return SequenceBuilder.between(depth, 1);
  }

  columnsLeftToRight(width: number): number[] {
    return SequenceBuilder.between(1, width);
  }
}

class StudentPerspective extends ViewPerspective {
  readonly label = "학생 기준";
  readonly chalkboardClass = "chalk-top";

  rowsTopToBottom(depth: number): number[] {
    return SequenceBuilder.between(1, depth);
  }

  columnsLeftToRight(width: number): number[] {
    return SequenceBuilder.between(width, 1);
  }
}

class Perspectives {
  static readonly student = new StudentPerspective();
  static readonly teacher = new TeacherPerspective();
  private static readonly all: readonly ViewPerspective[] = [Perspectives.student, Perspectives.teacher];

  static other(current: ViewPerspective): ViewPerspective {
    return Perspectives.all.find((perspective) => perspective !== current) ?? current;
  }
}

abstract class LayoutMode {
  abstract readonly key: string;
  abstract readonly label: string;
  abstract readonly depth: number;
  abstract readonly width: number;

  protected abstract gapBetween(visualIndex: number): string;

  abstract seatAt(gridRow: number, gridColumn: number): SeatPosition;

  gapClassAfter(visualIndex: number): string {
    return visualIndex === this.width - 1 ? "" : this.gapBetween(visualIndex);
  }
}

class PairLayoutMode extends LayoutMode {
  readonly key = "pair";
  readonly label = "짝꿍 모드";
  readonly depth = SeatBoard.ROWS;
  readonly width = SeatBoard.COLUMNS;

  seatAt(gridRow: number, gridColumn: number): SeatPosition {
    return new SeatPosition(gridRow, gridColumn);
  }

  protected gapBetween(visualIndex: number): string {
    return visualIndex % 2 === 0 ? "gap-joined" : "gap-aisle";
  }
}

class ExamLayoutMode extends LayoutMode {
  readonly key = "exam";
  readonly label = "시험대형 모드";
  readonly depth = SeatBoard.COLUMNS;
  readonly width = SeatBoard.ROWS;

  seatAt(gridRow: number, gridColumn: number): SeatPosition {
    return new SeatPosition(gridColumn, gridRow);
  }

  protected gapBetween(): string {
    return "gap-even";
  }
}

class LayoutModes {
  static readonly pair = new PairLayoutMode();
  static readonly exam = new ExamLayoutMode();
  private static readonly all: readonly LayoutMode[] = [LayoutModes.pair, LayoutModes.exam];

  static other(current: LayoutMode): LayoutMode {
    return LayoutModes.all.find((mode) => mode !== current) ?? current;
  }

  static byKey(key: string): LayoutMode {
    return LayoutModes.all.find((mode) => mode.key === key) ?? LayoutModes.pair;
  }
}

class ValidationResult {
  private constructor(
    readonly ok: boolean,
    readonly numbers: number[],
    readonly message: string,
    readonly notice: string,
  ) {}

  static success(numbers: number[], notice = ""): ValidationResult {
    return new ValidationResult(true, numbers, "", notice);
  }

  static failure(message: string): ValidationResult {
    return new ValidationResult(false, [], message, "");
  }
}

class AbsentNumberParser {
  private static readonly TOKEN = /^(\d+)(?:-(\d+))?$/;
  private static readonly ERROR = "결번은 5, 12 또는 20-22 처럼 입력해 주세요";

  parse(text: string): ValidationResult {
    const tokens = text.split(/[,\s]+/).filter((token) => token !== "");
    const absent = new Set<number>();
    for (const token of tokens) {
      const match = AbsentNumberParser.TOKEN.exec(token);
      if (!match) return ValidationResult.failure(AbsentNumberParser.ERROR);
      const first = Number(match[1]);
      const last = match[2] === undefined ? first : Number(match[2]);
      if (first < 1 || last > NumberRangeInput.MAX_NUMBER || first > last) {
        return ValidationResult.failure(AbsentNumberParser.ERROR);
      }
      SequenceBuilder.between(first, last).forEach((number) => absent.add(number));
    }
    return ValidationResult.success([...absent]);
  }
}

class NumberRoster {
  static build(start: number, end: number, absent: ReadonlySet<number>): number[] {
    return SequenceBuilder.between(start, end).filter((number) => !absent.has(number));
  }
}

class NumberRangeInput {
  static readonly MAX_NUMBER = 999;
  private static readonly DIGITS = /^\d+$/;

  private readonly absentParser = new AbsentNumberParser();

  constructor(
    private readonly startField: HTMLInputElement,
    private readonly endField: HTMLInputElement,
    private readonly absentField: HTMLInputElement,
  ) {}

  onChange(listener: () => void): void {
    [this.startField, this.endField, this.absentField].forEach((field) => field.addEventListener("input", listener));
  }

  read(): ValidationResult {
    const startText = this.startField.value.trim();
    const endText = this.endField.value.trim();
    if (!NumberRangeInput.DIGITS.test(startText) || !NumberRangeInput.DIGITS.test(endText)) {
      return ValidationResult.failure("시작 번호와 끝 번호를 숫자로 입력해 주세요");
    }
    const start = Number(startText);
    const end = Number(endText);
    if (start < 1 || end < 1 || start > NumberRangeInput.MAX_NUMBER || end > NumberRangeInput.MAX_NUMBER) {
      return ValidationResult.failure("번호는 1부터 999까지만 쓸 수 있어요");
    }
    if (start > end) return ValidationResult.failure("시작 번호가 끝 번호보다 커요");

    const absentResult = this.absentParser.parse(this.absentField.value);
    if (!absentResult.ok) return absentResult;

    const outside = absentResult.numbers.filter((number) => number < start || number > end);
    const roster = NumberRoster.build(start, end, new Set(absentResult.numbers));
    if (roster.length === 0) return ValidationResult.failure("배치할 번호가 하나도 없어요");
    const notice = outside.length > 0 ? `범위 밖 결번(${outside.join(", ")})은 무시했어요` : "";
    return ValidationResult.success(roster, notice);
  }
}

interface RandomSource {
  next(): number;
}

class SeatMathRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

class SeatShuffler {
  constructor(private readonly random: RandomSource) {}

  shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items];
    for (let last = shuffled.length - 1; last > 0; last--) {
      const pick = Math.floor(this.random.next() * (last + 1));
      [shuffled[last], shuffled[pick]] = [shuffled[pick], shuffled[last]];
    }
    return shuffled;
  }
}

class SeatAssigner {
  constructor(private readonly shuffler: SeatShuffler) {}

  assign(board: SeatBoard, numbers: readonly number[]): void {
    board.clearAssignments();
    const seats = this.shuffler.shuffle(board.availableSeats());
    numbers.forEach((number, index) => seats[index].assign(number));
  }
}

class SwapHistory {
  private last: [SeatPosition, SeatPosition] | null = null;

  remember(first: SeatPosition, second: SeatPosition): void {
    this.last = [first, second];
  }

  take(): [SeatPosition, SeatPosition] | null {
    const taken = this.last;
    this.last = null;
    return taken;
  }

  get hasRecord(): boolean {
    return this.last !== null;
  }

  clear(): void {
    this.last = null;
  }
}

class SeatSelection {
  private selected: SeatPosition | null = null;

  get current(): SeatPosition | null {
    return this.selected;
  }

  select(position: SeatPosition): void {
    this.selected = position;
  }

  clear(): void {
    this.selected = null;
  }
}

class SeatSwapper {
  constructor(private readonly board: SeatBoard, private readonly history: SwapHistory) {}

  swap(first: SeatPosition, second: SeatPosition): boolean {
    if (!this.exchange(first, second)) return false;
    this.history.remember(first, second);
    return true;
  }

  undo(): boolean {
    const last = this.history.take();
    return last !== null && this.exchange(last[0], last[1]);
  }

  private exchange(first: SeatPosition, second: SeatPosition): boolean {
    const a = this.board.seatAt(first);
    const b = this.board.seatAt(second);
    if (first.equals(second) || a.blocked || b.blocked) return false;
    if (a.isEmpty && b.isEmpty) return false;
    const aNumber = a.number;
    a.assign(b.number);
    b.assign(aNumber);
    return true;
  }
}

class ChalkboardLabelView {
  readonly element = SeatDom.create("div", "chalk", "칠판");
}

class SeatStageView {
  private readonly root = SeatDom.create("div", "stage");
  private readonly chalkboard = new ChalkboardLabelView();
  private readonly boardElement = SeatDom.create("div", "board");

  constructor(host: HTMLElement) {
    this.root.append(this.chalkboard.element, this.boardElement);
    host.replaceChildren(this.root);
  }

  render(board: SeatBoard, mode: LayoutMode, perspective: ViewPerspective, selected: SeatPosition | null, animate: boolean): void {
    this.root.className = `stage ${perspective.chalkboardClass}`;
    const rows = perspective.rowsTopToBottom(mode.depth).map((row) => {
      const rowElement = SeatDom.create("div", "row");
      const cells = perspective.columnsLeftToRight(mode.width).map((column, visualIndex) => {
        const position = mode.seatAt(row, column);
        return this.buildCell(board.seatAt(position), mode.gapClassAfter(visualIndex), selected, animate);
      });
      rowElement.append(...cells);
      return rowElement;
    });
    this.boardElement.replaceChildren(...rows);
  }

  private buildCell(seat: Seat, gapClass: string, selected: SeatPosition | null, animate: boolean): HTMLElement {
    const classes = ["cell", gapClass];
    if (seat.blocked) classes.push("blocked");
    if (seat.isFilled) classes.push("filled");
    if (seat.isFilled && animate) classes.push("pop");
    if (selected && selected.equals(seat.position)) classes.push("selected");
    const cell = SeatDom.create("div", classes.filter((name) => name !== "").join(" "));
    cell.dataset.row = String(seat.position.row);
    cell.dataset.column = String(seat.position.column);
    cell.append(SeatDom.create("span", "num", seat.isFilled ? String(seat.number) : ""));
    return cell;
  }
}

class StatusView {
  constructor(private readonly element: HTMLElement) {}

  show(received: number, available: number): void {
    const remaining = available - received;
    const shortage = remaining < 0;
    this.element.textContent = shortage
      ? `받은 학생 ${received}명 · ${-remaining}칸 부족`
      : `받은 학생 ${received}명 · 남은 칸 ${remaining}칸`;
    this.element.classList.toggle("short", shortage);
  }
}

class MessageBar {
  private static readonly VISIBLE_MS = 5000;
  private timer = 0;

  constructor(private readonly element: HTMLElement) {}

  show(text: string, tone: MessageTone): void {
    window.clearTimeout(this.timer);
    this.element.textContent = text;
    this.element.className = `message ${tone}`;
    this.timer = window.setTimeout(() => this.hide(), MessageBar.VISIBLE_MS);
  }

  hide(): void {
    this.element.textContent = "";
    this.element.className = "message";
  }
}

interface ControlActions {
  toggleMode(): void;
  togglePerspective(): void;
  inputsChanged(): void;
  place(): void;
  clearPlacement(): void;
  openSaved(): void;
  undo(): void;
  save(): void;
}

class ControlPanel {
  private readonly modeButton = SeatDom.byId<HTMLButtonElement>("modeToggle");
  private readonly perspectiveButton = SeatDom.byId<HTMLButtonElement>("perspectiveToggle");
  private readonly placeButton = SeatDom.byId<HTMLButtonElement>("placeButton");
  private readonly clearButton = SeatDom.byId<HTMLButtonElement>("clearButton");
  private readonly savedButton = SeatDom.byId<HTMLButtonElement>("savedButton");
  private readonly undoButton = SeatDom.byId<HTMLButtonElement>("undoButton");
  private readonly saveButton = SeatDom.byId<HTMLButtonElement>("saveButton");
  readonly input = new NumberRangeInput(
    SeatDom.byId<HTMLInputElement>("startNumber"),
    SeatDom.byId<HTMLInputElement>("endNumber"),
    SeatDom.byId<HTMLInputElement>("absentNumbers"),
  );

  constructor(actions: ControlActions) {
    this.modeButton.addEventListener("click", () => actions.toggleMode());
    this.perspectiveButton.addEventListener("click", () => actions.togglePerspective());
    this.placeButton.addEventListener("click", () => actions.place());
    this.clearButton.addEventListener("click", () => actions.clearPlacement());
    this.savedButton.addEventListener("click", () => actions.openSaved());
    this.undoButton.addEventListener("click", () => actions.undo());
    this.saveButton.addEventListener("click", () => actions.save());
    this.input.onChange(() => actions.inputsChanged());
  }

  showMode(mode: LayoutMode): void {
    this.modeButton.textContent = `배치 모양: ${mode.label}`;
  }

  showPerspective(perspective: ViewPerspective): void {
    this.perspectiveButton.textContent = `보는 기준: ${perspective.label}`;
  }

  setUndoEnabled(enabled: boolean): void {
    this.undoButton.disabled = !enabled;
  }

  setSaveEnabled(enabled: boolean): void {
    this.saveButton.disabled = !enabled;
  }
}

class ClassChoice {
  private static readonly GRADES = [1, 2];
  private static readonly CLASSES = [1, 2, 3, 4, 5];

  private grade = 0;
  private classNumber = 0;
  private readonly gradeButtons: HTMLButtonElement[];
  private readonly classButtons: HTMLButtonElement[];

  constructor(container: HTMLElement, private readonly onChange: () => void) {
    this.gradeButtons = ClassChoice.GRADES.map((grade) => this.buildButton(`${grade}학년`, () => this.pickGrade(grade)));
    this.classButtons = ClassChoice.CLASSES.map((number) => this.buildButton(`${number}반`, () => this.pickClass(number)));
    const gradeRow = SeatDom.create("div", "choice-row");
    const classRow = SeatDom.create("div", "choice-row");
    gradeRow.append(...this.gradeButtons);
    classRow.append(...this.classButtons);
    container.replaceChildren(gradeRow, classRow);
  }

  get value(): string | null {
    return this.grade > 0 && this.classNumber > 0 ? `${this.grade}-${this.classNumber}` : null;
  }

  reset(): void {
    this.grade = 0;
    this.classNumber = 0;
    this.paint();
  }

  static label(classId: string): string {
    const [grade, classNumber] = classId.split("-");
    return `${grade}학년 ${classNumber}반`;
  }

  private buildButton(text: string, onPress: () => void): HTMLButtonElement {
    const button = SeatDom.create("button", "choice", text);
    button.type = "button";
    button.addEventListener("click", onPress);
    return button;
  }

  private pickGrade(grade: number): void {
    this.grade = grade;
    this.changed();
  }

  private pickClass(classNumber: number): void {
    this.classNumber = classNumber;
    this.changed();
  }

  private changed(): void {
    this.paint();
    this.onChange();
  }

  private paint(): void {
    this.gradeButtons.forEach((button, index) => this.mark(button, ClassChoice.GRADES[index] === this.grade));
    this.classButtons.forEach((button, index) => this.mark(button, ClassChoice.CLASSES[index] === this.classNumber));
  }

  private mark(button: HTMLButtonElement, on: boolean): void {
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
  }
}

class SaveDialog {
  private readonly overlay = SeatDom.byId<HTMLElement>("saveDialog");
  private readonly confirmButton = SeatDom.byId<HTMLButtonElement>("saveConfirm");
  private readonly cancelButton = SeatDom.byId<HTMLButtonElement>("saveCancel");
  private readonly choice = new ClassChoice(SeatDom.byId("saveClassChoice"), () => this.updateConfirm());
  private finish: (classId: string | null) => void = () => undefined;

  constructor() {
    this.confirmButton.addEventListener("click", () => this.close(this.choice.value));
    this.cancelButton.addEventListener("click", () => this.close(null));
  }

  ask(): Promise<string | null> {
    this.choice.reset();
    this.updateConfirm();
    this.overlay.hidden = false;
    return new Promise((resolve) => {
      this.finish = resolve;
    });
  }

  private updateConfirm(): void {
    this.confirmButton.disabled = this.choice.value === null;
  }

  private close(classId: string | null): void {
    this.overlay.hidden = true;
    this.finish(classId);
  }
}

interface StoredSeatPlan {
  mode: unknown;
  cells: unknown;
  at: unknown;
}

class SeatPlanRecord {
  constructor(readonly id: string, readonly modeKey: string, readonly cells: string, readonly savedAt: number) {}

  static fromBoard(board: SeatBoard, mode: LayoutMode): SeatPlanRecord {
    return new SeatPlanRecord("", mode.key, board.toCells(), 0);
  }

  static fromStored(id: string, raw: unknown): SeatPlanRecord | null {
    if (typeof raw !== "object" || raw === null) return null;
    const stored = raw as StoredSeatPlan;
    if (typeof stored.mode !== "string" || typeof stored.cells !== "string" || typeof stored.at !== "number") return null;
    return new SeatPlanRecord(id, stored.mode, stored.cells, stored.at);
  }

  toPayload(): { mode: string; cells: string; at: { ".sv": string } } {
    return { mode: this.modeKey, cells: this.cells, at: { ".sv": "timestamp" } };
  }

  applyTo(board: SeatBoard): boolean {
    return board.loadCells(this.cells);
  }

  savedLabel(): string {
    const date = new Date(this.savedAt);
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} ${date.getHours()}:${minutes}`;
  }
}

class SeatPlanRepository {
  private static readonly TIMEOUT_MS = 10000;
  private static readonly LIST_LIMIT = 30;

  async save(classId: string, record: SeatPlanRecord): Promise<void> {
    const response = await fetch(this.urlFor(classId), {
      method: "POST",
      body: JSON.stringify(record.toPayload()),
      signal: AbortSignal.timeout(SeatPlanRepository.TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`저장 실패 ${response.status}`);
  }

  async list(classId: string): Promise<SeatPlanRecord[]> {
    const query = `?orderBy=%22at%22&limitToLast=${SeatPlanRepository.LIST_LIMIT}`;
    const response = await fetch(this.urlFor(classId) + query, {
      signal: AbortSignal.timeout(SeatPlanRepository.TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`불러오기 실패 ${response.status}`);
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return [];
    return Object.entries(body)
      .map(([id, raw]) => SeatPlanRecord.fromStored(id, raw))
      .filter((record): record is SeatPlanRecord => record !== null)
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  private urlFor(classId: string): string {
    const base = (window.PORTAL_CONFIG?.DB_URL ?? "").replace(/\/+$/, "");
    if (base === "") throw new Error("데이터베이스 주소가 없어요");
    return `${base}/seatplans/${classId}.json`;
  }
}

class PrintSheet {
  constructor(private readonly titleElement: HTMLElement, private readonly metaElement: HTMLElement) {}

  fill(classId: string, record: SeatPlanRecord, mode: LayoutMode, perspective: ViewPerspective): void {
    this.titleElement.textContent = `${ClassChoice.label(classId)} 자리 배치표`;
    this.metaElement.textContent = `${record.savedLabel()} 저장 · ${mode.label} · ${perspective.label}`;
  }

  print(): void {
    window.print();
  }
}

class SavedPlanList {
  private readonly element = SeatDom.byId<HTMLElement>("savedList");

  show(records: readonly SeatPlanRecord[], activeId: string, onPick: (record: SeatPlanRecord) => void): void {
    const buttons = records.map((record) => {
      const mode = LayoutModes.byKey(record.modeKey);
      const button = SeatDom.create("button", "saved-item", `${record.savedLabel()} · ${mode.label}`);
      button.type = "button";
      button.classList.toggle("on", record.id === activeId);
      button.addEventListener("click", () => onPick(record));
      return button;
    });
    this.element.replaceChildren(...buttons);
  }

  clear(): void {
    this.element.replaceChildren();
  }
}

class SavedPlansView {
  private readonly overlay = SeatDom.byId<HTMLElement>("savedView");
  private readonly hint = SeatDom.byId<HTMLElement>("savedHint");
  private readonly detail = SeatDom.byId<HTMLElement>("savedDetail");
  private readonly perspectiveButton = SeatDom.byId<HTMLButtonElement>("savedPerspective");
  private readonly printButton = SeatDom.byId<HTMLButtonElement>("savedPrint");
  private readonly stage = new SeatStageView(SeatDom.byId("savedStageHost"));
  private readonly list = new SavedPlanList();
  private readonly choice: ClassChoice;
  private readonly printSheet = new PrintSheet(SeatDom.byId("savedTitle"), SeatDom.byId("savedMeta"));
  private perspective: ViewPerspective = Perspectives.teacher;
  private records: SeatPlanRecord[] = [];
  private current: SeatPlanRecord | null = null;
  private loadCount = 0;

  constructor(private readonly repository: SeatPlanRepository) {
    this.choice = new ClassChoice(SeatDom.byId("savedClassChoice"), () => this.loadClass());
    SeatDom.byId("savedClose").addEventListener("click", () => this.close());
    this.perspectiveButton.addEventListener("click", () => this.togglePerspective());
    this.printButton.addEventListener("click", () => this.printCurrent());
  }

  open(): void {
    this.overlay.hidden = false;
    document.body.classList.add("saved-open");
    this.showHint("학년과 반을 고르면 저장된 배치가 나와요");
    this.paintPerspectiveButton();
  }

  private close(): void {
    this.overlay.hidden = true;
    document.body.classList.remove("saved-open");
  }

  private async loadClass(): Promise<void> {
    const classId = this.choice.value;
    if (classId === null) return;
    const ticket = ++this.loadCount;
    this.current = null;
    this.list.clear();
    this.showHint("불러오는 중이에요…");
    try {
      const records = await this.repository.list(classId);
      if (ticket !== this.loadCount) return;
      this.records = records;
      this.showHint(records.length === 0 ? "저장된 배치가 없어요" : "목록에서 배치를 골라 주세요");
      this.list.show(records, "", (record) => this.pick(record));
    } catch {
      if (ticket !== this.loadCount) return;
      this.showHint("불러오지 못했어요. 인터넷을 확인해 주세요");
    }
  }

  private pick(record: SeatPlanRecord): void {
    this.current = record;
    this.list.show(this.records, record.id, (picked) => this.pick(picked));
    this.showCurrent();
  }

  private togglePerspective(): void {
    this.perspective = Perspectives.other(this.perspective);
    this.paintPerspectiveButton();
    this.showCurrent();
  }

  private showCurrent(): void {
    const classId = this.choice.value;
    const record = this.current;
    if (classId === null || record === null) return;
    const board = new SeatBoard();
    if (!record.applyTo(board)) {
      this.showHint("저장된 배치를 읽지 못했어요");
      return;
    }
    const mode = LayoutModes.byKey(record.modeKey);
    this.stage.render(board, mode, this.perspective, null, false);
    this.printSheet.fill(classId, record, mode, this.perspective);
    this.hint.hidden = true;
    this.detail.hidden = false;
    this.printButton.disabled = false;
  }

  private printCurrent(): void {
    if (this.current !== null) this.printSheet.print();
  }

  private showHint(text: string): void {
    this.hint.textContent = text;
    this.hint.hidden = false;
    this.detail.hidden = true;
    this.printButton.disabled = true;
  }

  private paintPerspectiveButton(): void {
    this.perspectiveButton.textContent = `보는 기준: ${this.perspective.label}`;
  }
}

interface SeatInteractionHandler {
  canDragFrom(position: SeatPosition): boolean;
  onSeatTapped(position: SeatPosition): void;
  onSeatDropped(from: SeatPosition, to: SeatPosition): void;
  onBackgroundTapped(): void;
}

interface PressedSeat {
  pointerId: number;
  from: SeatPosition | null;
  source: HTMLElement | null;
  startX: number;
  startY: number;
  dragging: boolean;
}

class SeatDragController {
  private static readonly DRAG_THRESHOLD_PX = 8;

  private pressed: PressedSeat | null = null;
  private ghost: HTMLElement | null = null;
  private hovered: HTMLElement | null = null;

  constructor(private readonly surface: HTMLElement, private readonly handler: SeatInteractionHandler) {
    surface.addEventListener("pointerdown", this.onDown);
    surface.addEventListener("pointermove", this.onMove);
    surface.addEventListener("pointerup", this.onUp);
    surface.addEventListener("pointercancel", this.onCancel);
    surface.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (this.pressed !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
    const source = this.cellAt(event.target);
    this.pressed = {
      pointerId: event.pointerId,
      from: source ? SeatPosition.fromElement(source) : null,
      source,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    this.surface.setPointerCapture(event.pointerId);
  };

  private readonly onMove = (event: PointerEvent): void => {
    const pressed = this.pressed;
    if (pressed === null || pressed.pointerId !== event.pointerId) return;
    if (!pressed.dragging) {
      const distance = Math.hypot(event.clientX - pressed.startX, event.clientY - pressed.startY);
      const canDrag = pressed.from !== null && this.handler.canDragFrom(pressed.from);
      if (distance < SeatDragController.DRAG_THRESHOLD_PX || !canDrag) return;
      this.startDrag(pressed);
    }
    this.moveGhost(event.clientX, event.clientY);
    this.markHovered(this.dropTargetAt(event.clientX, event.clientY));
  };

  private readonly onUp = (event: PointerEvent): void => {
    const pressed = this.pressed;
    if (pressed === null || pressed.pointerId !== event.pointerId) return;
    const target = pressed.dragging ? this.dropTargetAt(event.clientX, event.clientY) : null;
    this.finishPress();
    if (pressed.dragging) {
      const to = target ? SeatPosition.fromElement(target) : null;
      if (pressed.from !== null && to !== null) this.handler.onSeatDropped(pressed.from, to);
    } else if (pressed.from !== null) {
      this.handler.onSeatTapped(pressed.from);
    } else {
      this.handler.onBackgroundTapped();
    }
  };

  private readonly onCancel = (): void => {
    this.finishPress();
  };

  private startDrag(pressed: PressedSeat): void {
    pressed.dragging = true;
    const source = pressed.source;
    if (source === null) return;
    const box = source.getBoundingClientRect();
    this.ghost = SeatDom.create("div", "drag-ghost", source.textContent ?? "");
    this.ghost.style.width = `${box.width}px`;
    this.ghost.style.height = `${box.height}px`;
    this.ghost.style.fontSize = `${box.height * 0.5}px`;
    document.body.append(this.ghost);
    source.classList.add("drag-source");
  }

  private moveGhost(x: number, y: number): void {
    if (this.ghost === null) return;
    this.ghost.style.left = `${x - this.ghost.offsetWidth / 2}px`;
    this.ghost.style.top = `${y - this.ghost.offsetHeight / 2}px`;
  }

  private dropTargetAt(x: number, y: number): HTMLElement | null {
    const cell = this.cellAt(document.elementFromPoint(x, y));
    if (cell === null || cell === this.pressed?.source || cell.classList.contains("blocked")) return null;
    return cell;
  }

  private markHovered(cell: HTMLElement | null): void {
    if (cell === this.hovered) return;
    this.hovered?.classList.remove("drop-target");
    cell?.classList.add("drop-target");
    this.hovered = cell;
  }

  private cellAt(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>(".cell") : null;
  }

  private finishPress(): void {
    this.pressed?.source?.classList.remove("drag-source");
    this.markHovered(null);
    this.ghost?.remove();
    this.ghost = null;
    if (this.pressed !== null && this.surface.hasPointerCapture(this.pressed.pointerId)) {
      this.surface.releasePointerCapture(this.pressed.pointerId);
    }
    this.pressed = null;
  }
}

class SeatInteractionCoordinator implements SeatInteractionHandler {
  constructor(
    private readonly board: SeatBoard,
    private readonly selection: SeatSelection,
    private readonly swapper: SeatSwapper,
    private readonly messages: MessageBar,
    private readonly onChanged: () => void,
  ) {}

  canDragFrom(position: SeatPosition): boolean {
    return this.board.hasAssignments() && this.board.seatAt(position).isFilled;
  }

  onSeatTapped(position: SeatPosition): void {
    const seat = this.board.seatAt(position);
    if (!this.board.hasAssignments()) {
      seat.toggleBlocked();
      this.onChanged();
      return;
    }
    const picked = this.selection.current;
    if (picked === null) {
      this.pickFirst(seat);
      return;
    }
    this.selection.clear();
    if (!picked.equals(position)) this.swapper.swap(picked, position);
    this.onChanged();
  }

  onSeatDropped(from: SeatPosition, to: SeatPosition): void {
    this.selection.clear();
    this.swapper.swap(from, to);
    this.onChanged();
  }

  onBackgroundTapped(): void {
    if (this.selection.current === null) return;
    this.selection.clear();
    this.onChanged();
  }

  private pickFirst(seat: Seat): void {
    if (!seat.isFilled) {
      this.messages.show("배치를 지우면 X 칸을 다시 고를 수 있어요", "info");
      return;
    }
    this.selection.select(seat.position);
    this.onChanged();
  }
}

class SeatPickerApp {
  private readonly board = new SeatBoard();
  private readonly history = new SwapHistory();
  private readonly selection = new SeatSelection();
  private readonly swapper = new SeatSwapper(this.board, this.history);
  private readonly assigner = new SeatAssigner(new SeatShuffler(new SeatMathRandomSource()));
  private readonly repository = new SeatPlanRepository();
  private readonly stage = new SeatStageView(SeatDom.byId("stageHost"));
  private readonly status = new StatusView(SeatDom.byId("status"));
  private readonly messages = new MessageBar(SeatDom.byId("message"));
  private readonly saveDialog = new SaveDialog();
  private readonly savedView = new SavedPlansView(this.repository);
  private readonly controls = new ControlPanel({
    toggleMode: () => this.toggleMode(),
    togglePerspective: () => this.togglePerspective(),
    inputsChanged: () => this.refreshStatus(),
    place: () => this.place(),
    clearPlacement: () => this.clearPlacement(),
    openSaved: () => this.savedView.open(),
    undo: () => this.undo(),
    save: () => void this.save(),
  });
  private mode: LayoutMode = LayoutModes.pair;
  private perspective: ViewPerspective = Perspectives.student;
  private saving = false;

  constructor() {
    const coordinator = new SeatInteractionCoordinator(this.board, this.selection, this.swapper, this.messages, () => this.refresh(false));
    new SeatDragController(SeatDom.byId("stageHost"), coordinator);
    this.refresh(false);
  }

  private toggleMode(): void {
    this.mode = LayoutModes.other(this.mode);
    this.refresh(false);
  }

  private togglePerspective(): void {
    this.perspective = Perspectives.other(this.perspective);
    this.refresh(false);
  }

  private place(): void {
    const result = this.controls.input.read();
    if (!result.ok) {
      this.messages.show(result.message, "warn");
      return;
    }
    const available = this.board.availableCount();
    if (result.numbers.length > available) {
      this.messages.show(`번호 ${result.numbers.length}개인데 쓸 수 있는 자리는 ${available}칸이에요`, "warn");
      return;
    }
    this.history.clear();
    this.selection.clear();
    this.assigner.assign(this.board, result.numbers);
    this.refresh(true);
    const notice = result.notice === "" ? "" : ` (${result.notice})`;
    this.messages.show(`번호 ${result.numbers.length}개를 배치했어요${notice}`, "ok");
  }

  private clearPlacement(): void {
    this.board.clearAssignments();
    this.history.clear();
    this.selection.clear();
    this.refresh(false);
    this.messages.show("배치를 지웠어요", "info");
  }

  private undo(): void {
    this.selection.clear();
    this.swapper.undo();
    this.refresh(false);
  }

  private async save(): Promise<void> {
    if (this.saving || !this.board.hasAssignments()) return;
    const classId = await this.saveDialog.ask();
    if (classId === null) return;
    this.saving = true;
    this.controls.setSaveEnabled(false);
    try {
      await this.repository.save(classId, SeatPlanRecord.fromBoard(this.board, this.mode));
      this.messages.show(`${ClassChoice.label(classId)} 자리 배치를 저장했어요`, "ok");
    } catch {
      this.messages.show("저장하지 못했어요. 인터넷을 확인해 주세요", "warn");
    } finally {
      this.saving = false;
      this.refresh(false);
    }
  }

  private refresh(animate: boolean): void {
    this.stage.render(this.board, this.mode, this.perspective, this.selection.current, animate);
    this.controls.showMode(this.mode);
    this.controls.showPerspective(this.perspective);
    this.controls.setUndoEnabled(this.history.hasRecord);
    this.controls.setSaveEnabled(!this.saving && this.board.hasAssignments());
    this.refreshStatus();
  }

  private refreshStatus(): void {
    const result = this.controls.input.read();
    this.status.show(result.ok ? result.numbers.length : 0, this.board.availableCount());
  }
}

new SeatPickerApp();
