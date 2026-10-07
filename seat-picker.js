"use strict";
class SeatDom {
    static byId(id) {
        const element = document.getElementById(id);
        if (!element)
            throw new Error(`#${id} 요소가 없어요`);
        return element;
    }
    static fill(parent, children) {
        parent.textContent = "";
        children.forEach((child) => parent.appendChild(child));
    }
    static create(tag, className, text = "") {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = text;
        return element;
    }
}
class SeatPosition {
    constructor(row, column) {
        this.row = row;
        this.column = column;
    }
    get index() {
        return (this.row - 1) * SeatBoard.COLUMNS + (this.column - 1);
    }
    equals(other) {
        return this.row === other.row && this.column === other.column;
    }
    static fromElement(element) {
        const row = Number(element.dataset.row);
        const column = Number(element.dataset.column);
        return row >= 1 && column >= 1 ? new SeatPosition(row, column) : null;
    }
}
class Seat {
    constructor(position) {
        this.position = position;
        this.blocked = false;
        this.number = 0;
    }
    get isEmpty() {
        return !this.blocked && this.number === 0;
    }
    get isFilled() {
        return this.number > 0;
    }
    toggleBlocked() {
        this.blocked = !this.blocked;
    }
    block() {
        this.blocked = true;
    }
    unblock() {
        this.blocked = false;
    }
    assign(number) {
        this.number = number;
    }
    clear() {
        this.number = 0;
    }
    toCell() {
        return this.blocked ? Seat.BLOCKED_CELL : this.number;
    }
    loadCell(cell) {
        this.blocked = cell === Seat.BLOCKED_CELL;
        this.number = cell > 0 ? cell : 0;
    }
}
Seat.BLOCKED_CELL = -1;
class SeatBoard {
    constructor() {
        this.seats = Array.from({ length: SeatBoard.ROWS * SeatBoard.COLUMNS }, (_, index) => new Seat(new SeatPosition(Math.floor(index / SeatBoard.COLUMNS) + 1, (index % SeatBoard.COLUMNS) + 1)));
    }
    seatAt(position) {
        return this.seats[position.index];
    }
    availableSeats() {
        return this.seats.filter((seat) => !seat.blocked);
    }
    availableCount() {
        return this.availableSeats().length;
    }
    blockedCount() {
        return this.seats.length - this.availableCount();
    }
    unblockAll() {
        this.seats.forEach((seat) => seat.unblock());
    }
    hasAssignments() {
        return this.seats.some((seat) => seat.isFilled);
    }
    clearAssignments() {
        this.seats.forEach((seat) => seat.clear());
    }
    toCells() {
        return this.seats.map((seat) => seat.toCell()).join(",");
    }
    loadCells(text) {
        const cells = text.split(",");
        if (cells.length !== this.seats.length)
            return false;
        if (!cells.every((cell) => SeatBoard.CELL_PATTERN.test(cell)))
            return false;
        this.seats.forEach((seat, index) => seat.loadCell(Number(cells[index])));
        return true;
    }
}
SeatBoard.ROWS = 5;
SeatBoard.COLUMNS = 6;
SeatBoard.CELL_PATTERN = /^(-1|0|[1-9][0-9]{0,2})$/;
class SequenceBuilder {
    static between(from, to) {
        const step = to >= from ? 1 : -1;
        return Array.from({ length: Math.abs(to - from) + 1 }, (_, index) => from + index * step);
    }
}
class ViewPerspective {
}
class TeacherPerspective extends ViewPerspective {
    constructor() {
        super(...arguments);
        this.label = "선생님 기준";
        this.chalkboardClass = "chalk-bottom";
    }
    rowsTopToBottom(depth) {
        return SequenceBuilder.between(depth, 1);
    }
    columnsLeftToRight(width) {
        return SequenceBuilder.between(1, width);
    }
}
class StudentPerspective extends ViewPerspective {
    constructor() {
        super(...arguments);
        this.label = "학생 기준";
        this.chalkboardClass = "chalk-top";
    }
    rowsTopToBottom(depth) {
        return SequenceBuilder.between(1, depth);
    }
    columnsLeftToRight(width) {
        return SequenceBuilder.between(width, 1);
    }
}
class Perspectives {
    static other(current) {
        return Perspectives.all.find((perspective) => perspective !== current) ?? current;
    }
}
Perspectives.student = new StudentPerspective();
Perspectives.teacher = new TeacherPerspective();
Perspectives.all = [Perspectives.student, Perspectives.teacher];
class LayoutMode {
    gapClassAfter(visualIndex) {
        return visualIndex === this.width - 1 ? "" : this.gapBetween(visualIndex);
    }
}
class PairLayoutMode extends LayoutMode {
    constructor() {
        super(...arguments);
        this.key = "pair";
        this.label = "짝꿍 모드";
        this.depth = SeatBoard.ROWS;
        this.width = SeatBoard.COLUMNS;
    }
    seatAt(gridRow, gridColumn) {
        return new SeatPosition(gridRow, gridColumn);
    }
    gapBetween(visualIndex) {
        return visualIndex % 2 === 0 ? "gap-joined" : "gap-aisle";
    }
}
class ExamLayoutMode extends LayoutMode {
    constructor() {
        super(...arguments);
        this.key = "exam";
        this.label = "시험대형 모드";
        this.depth = SeatBoard.COLUMNS;
        this.width = SeatBoard.ROWS;
    }
    seatAt(gridRow, gridColumn) {
        return new SeatPosition(gridColumn, gridRow);
    }
    gapBetween() {
        return "gap-even";
    }
}
class LayoutModes {
    static other(current) {
        return LayoutModes.all.find((mode) => mode !== current) ?? current;
    }
    static byKey(key) {
        return LayoutModes.all.find((mode) => mode.key === key) ?? LayoutModes.pair;
    }
}
LayoutModes.pair = new PairLayoutMode();
LayoutModes.exam = new ExamLayoutMode();
LayoutModes.all = [LayoutModes.pair, LayoutModes.exam];
class BlockedSeatRelocator {
    relocate(board, to) {
        const count = board.blockedCount();
        board.unblockAll();
        this.positionsFarthestFirst(to).slice(0, count).forEach((position) => board.seatAt(position).block());
    }
    positionsFarthestFirst(mode) {
        const columns = SequenceBuilder.between(1, mode.width);
        return SequenceBuilder.between(mode.depth, 1).flatMap((row) => columns.map((column) => mode.seatAt(row, column)));
    }
}
class NumberPicker {
    constructor(container) {
        this.excluded = new Set();
        this.changeListener = () => undefined;
        this.buttons = SequenceBuilder.between(1, NumberPicker.COUNT).map((number) => this.buildButton(number));
        const rows = [0, 1].map((rowIndex) => {
            const row = SeatDom.create("div", "number-row");
            row.append(...this.buttons.slice(rowIndex * NumberPicker.PER_ROW, (rowIndex + 1) * NumberPicker.PER_ROW));
            return row;
        });
        SeatDom.fill(container, rows);
    }
    onChange(listener) {
        this.changeListener = listener;
    }
    selectedNumbers() {
        return SequenceBuilder.between(1, NumberPicker.COUNT).filter((number) => !this.excluded.has(number));
    }
    buildButton(number) {
        const button = SeatDom.create("button", "number-button", String(number));
        button.type = "button";
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => this.toggle(number, button));
        return button;
    }
    toggle(number, button) {
        const nowExcluded = !this.excluded.has(number);
        if (nowExcluded)
            this.excluded.add(number);
        else
            this.excluded.delete(number);
        button.classList.toggle("off", nowExcluded);
        button.setAttribute("aria-pressed", String(nowExcluded));
        this.changeListener();
    }
}
NumberPicker.COUNT = SeatBoard.ROWS * SeatBoard.COLUMNS;
NumberPicker.PER_ROW = 15;
class SeatMathRandomSource {
    next() {
        return Math.random();
    }
}
class SeatShuffler {
    constructor(random) {
        this.random = random;
    }
    shuffle(items) {
        const shuffled = [...items];
        for (let last = shuffled.length - 1; last > 0; last--) {
            const pick = Math.floor(this.random.next() * (last + 1));
            [shuffled[last], shuffled[pick]] = [shuffled[pick], shuffled[last]];
        }
        return shuffled;
    }
}
class SeatAssigner {
    constructor(shuffler) {
        this.shuffler = shuffler;
    }
    assign(board, numbers) {
        board.clearAssignments();
        const seats = this.shuffler.shuffle(board.availableSeats());
        numbers.forEach((number, index) => seats[index].assign(number));
    }
}
class SwapHistory {
    constructor() {
        this.last = null;
    }
    remember(first, second) {
        this.last = [first, second];
    }
    take() {
        const taken = this.last;
        this.last = null;
        return taken;
    }
    get hasRecord() {
        return this.last !== null;
    }
    clear() {
        this.last = null;
    }
}
class SeatSelection {
    constructor() {
        this.selected = null;
    }
    get current() {
        return this.selected;
    }
    select(position) {
        this.selected = position;
    }
    clear() {
        this.selected = null;
    }
}
class SeatSwapper {
    constructor(board, history) {
        this.board = board;
        this.history = history;
    }
    swap(first, second) {
        if (!this.exchange(first, second))
            return false;
        this.history.remember(first, second);
        return true;
    }
    undo() {
        const last = this.history.take();
        return last !== null && this.exchange(last[0], last[1]);
    }
    exchange(first, second) {
        const a = this.board.seatAt(first);
        const b = this.board.seatAt(second);
        if (first.equals(second) || a.blocked || b.blocked)
            return false;
        if (a.isEmpty && b.isEmpty)
            return false;
        const aNumber = a.number;
        a.assign(b.number);
        b.assign(aNumber);
        return true;
    }
}
class ChalkboardLabelView {
    constructor() {
        this.element = SeatDom.create("div", "chalk", "칠판");
    }
}
class SeatStageView {
    constructor(host) {
        this.root = SeatDom.create("div", "stage");
        this.chalkboard = new ChalkboardLabelView();
        this.boardElement = SeatDom.create("div", "board");
        this.root.append(this.chalkboard.element, this.boardElement);
        SeatDom.fill(host, [this.root]);
    }
    render(board, mode, perspective, selected, animate) {
        this.root.className = `stage ${perspective.chalkboardClass}`;
        const blockedBackRows = this.blockedBackRows(board, mode);
        const rows = perspective.rowsTopToBottom(mode.depth).map((row) => {
            const rowElement = SeatDom.create("div", blockedBackRows.has(row) ? "row blocked-back" : "row");
            const cells = perspective.columnsLeftToRight(mode.width).map((column, visualIndex) => {
                const position = mode.seatAt(row, column);
                return this.buildCell(board.seatAt(position), mode.gapClassAfter(visualIndex), selected, animate);
            });
            rowElement.append(...cells);
            return rowElement;
        });
        SeatDom.fill(this.boardElement, rows);
    }
    blockedBackRows(board, mode) {
        const rows = new Set();
        for (let row = mode.depth; row >= 1; row--) {
            const columns = SequenceBuilder.between(1, mode.width);
            if (!columns.every((column) => board.seatAt(mode.seatAt(row, column)).blocked))
                break;
            rows.add(row);
        }
        return rows;
    }
    buildCell(seat, gapClass, selected, animate) {
        const classes = ["cell", gapClass];
        if (seat.blocked)
            classes.push("blocked");
        if (seat.isFilled)
            classes.push("filled");
        if (seat.isFilled && animate)
            classes.push("pop");
        if (selected && selected.equals(seat.position))
            classes.push("selected");
        const cell = SeatDom.create("div", classes.filter((name) => name !== "").join(" "));
        cell.dataset.row = String(seat.position.row);
        cell.dataset.column = String(seat.position.column);
        cell.append(SeatDom.create("span", "num", seat.isFilled ? String(seat.number) : ""));
        return cell;
    }
}
class StatusView {
    constructor(element) {
        this.element = element;
    }
    show(received, available) {
        const remaining = available - received;
        const shortage = remaining < 0;
        this.element.textContent = shortage
            ? `받은 학생 ${received}명 · ${-remaining}칸 부족`
            : `받은 학생 ${received}명 · 남은 칸 ${remaining}칸`;
        this.element.classList.toggle("short", shortage);
    }
}
class MessageBar {
    constructor(element) {
        this.element = element;
        this.timer = 0;
    }
    show(text, tone) {
        window.clearTimeout(this.timer);
        this.element.textContent = text;
        this.element.className = `message ${tone}`;
        this.timer = window.setTimeout(() => this.hide(), MessageBar.VISIBLE_MS);
    }
    hide() {
        this.element.textContent = "";
        this.element.className = "message";
    }
}
MessageBar.VISIBLE_MS = 5000;
class ControlPanel {
    constructor(actions) {
        this.modeButton = SeatDom.byId("modeToggle");
        this.perspectiveButton = SeatDom.byId("perspectiveToggle");
        this.placeButton = SeatDom.byId("placeButton");
        this.clearButton = SeatDom.byId("clearButton");
        this.savedButton = SeatDom.byId("savedButton");
        this.undoButton = SeatDom.byId("undoButton");
        this.saveButton = SeatDom.byId("saveButton");
        this.numbers = new NumberPicker(SeatDom.byId("numberPicker"));
        this.modeButton.addEventListener("click", () => actions.toggleMode());
        this.perspectiveButton.addEventListener("click", () => actions.togglePerspective());
        this.placeButton.addEventListener("click", () => actions.place());
        this.clearButton.addEventListener("click", () => actions.clearPlacement());
        this.savedButton.addEventListener("click", () => actions.openSaved());
        this.undoButton.addEventListener("click", () => actions.undo());
        this.saveButton.addEventListener("click", () => actions.save());
        this.numbers.onChange(() => actions.inputsChanged());
    }
    showMode(mode) {
        this.modeButton.textContent = `배치 모양: ${mode.label}`;
    }
    showPerspective(perspective) {
        this.perspectiveButton.textContent = `보는 기준: ${perspective.label}`;
    }
    setUndoEnabled(enabled) {
        this.undoButton.disabled = !enabled;
    }
    setSaveEnabled(enabled) {
        this.saveButton.disabled = !enabled;
    }
}
class ClassChoice {
    constructor(container, onChange) {
        this.onChange = onChange;
        this.grade = 0;
        this.classNumber = 0;
        this.gradeButtons = ClassChoice.GRADES.map((grade) => this.buildButton(`${grade}학년`, () => this.pickGrade(grade)));
        this.classButtons = ClassChoice.CLASSES.map((number) => this.buildButton(`${number}반`, () => this.pickClass(number)));
        const gradeRow = SeatDom.create("div", "choice-row");
        const classRow = SeatDom.create("div", "choice-row");
        gradeRow.append(...this.gradeButtons);
        classRow.append(...this.classButtons);
        SeatDom.fill(container, [gradeRow, classRow]);
    }
    get value() {
        return this.grade > 0 && this.classNumber > 0 ? `${this.grade}-${this.classNumber}` : null;
    }
    reset() {
        this.grade = 0;
        this.classNumber = 0;
        this.paint();
    }
    static label(classId) {
        const [grade, classNumber] = classId.split("-");
        return `${grade}학년 ${classNumber}반`;
    }
    buildButton(text, onPress) {
        const button = SeatDom.create("button", "choice", text);
        button.type = "button";
        button.addEventListener("click", onPress);
        return button;
    }
    pickGrade(grade) {
        this.grade = grade;
        this.changed();
    }
    pickClass(classNumber) {
        this.classNumber = classNumber;
        this.changed();
    }
    changed() {
        this.paint();
        this.onChange();
    }
    paint() {
        this.gradeButtons.forEach((button, index) => this.mark(button, ClassChoice.GRADES[index] === this.grade));
        this.classButtons.forEach((button, index) => this.mark(button, ClassChoice.CLASSES[index] === this.classNumber));
    }
    mark(button, on) {
        button.classList.toggle("on", on);
        button.setAttribute("aria-pressed", String(on));
    }
}
ClassChoice.GRADES = [1, 2];
ClassChoice.CLASSES = [1, 2, 3, 4, 5];
class SaveDialog {
    constructor() {
        this.overlay = SeatDom.byId("saveDialog");
        this.confirmButton = SeatDom.byId("saveConfirm");
        this.cancelButton = SeatDom.byId("saveCancel");
        this.choice = new ClassChoice(SeatDom.byId("saveClassChoice"), () => this.updateConfirm());
        this.finish = () => undefined;
        this.confirmButton.addEventListener("click", () => this.close(this.choice.value));
        this.cancelButton.addEventListener("click", () => this.close(null));
    }
    ask() {
        this.choice.reset();
        this.updateConfirm();
        this.overlay.hidden = false;
        return new Promise((resolve) => {
            this.finish = resolve;
        });
    }
    updateConfirm() {
        this.confirmButton.disabled = this.choice.value === null;
    }
    close(classId) {
        this.overlay.hidden = true;
        this.finish(classId);
    }
}
class SeatPlanRecord {
    constructor(id, modeKey, cells, savedAt) {
        this.id = id;
        this.modeKey = modeKey;
        this.cells = cells;
        this.savedAt = savedAt;
    }
    static fromBoard(board, mode) {
        return new SeatPlanRecord("", mode.key, board.toCells(), 0);
    }
    static fromStored(id, raw) {
        if (typeof raw !== "object" || raw === null)
            return null;
        const stored = raw;
        if (typeof stored.mode !== "string" || typeof stored.cells !== "string" || typeof stored.at !== "number")
            return null;
        return new SeatPlanRecord(id, stored.mode, stored.cells, stored.at);
    }
    toPayload() {
        return { mode: this.modeKey, cells: this.cells, at: { ".sv": "timestamp" } };
    }
    applyTo(board) {
        return board.loadCells(this.cells);
    }
    savedLabel() {
        const date = new Date(this.savedAt);
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} ${date.getHours()}:${minutes}`;
    }
}
class SeatPlanRepository {
    async save(classId, record) {
        const response = await this.fetchWithTimeout(this.urlFor(classId), {
            method: "POST",
            body: JSON.stringify(record.toPayload()),
        });
        if (!response.ok)
            throw new Error(`저장 실패 ${response.status}`);
    }
    async list(classId) {
        const query = `?orderBy=%22at%22&limitToLast=${SeatPlanRepository.LIST_LIMIT}`;
        const response = await this.fetchWithTimeout(this.urlFor(classId) + query, {});
        if (!response.ok)
            throw new Error(`불러오기 실패 ${response.status}`);
        const body = await response.json();
        if (typeof body !== "object" || body === null)
            return [];
        return Object.entries(body)
            .map(([id, raw]) => SeatPlanRecord.fromStored(id, raw))
            .filter((record) => record !== null)
            .sort((a, b) => b.savedAt - a.savedAt);
    }
    async fetchWithTimeout(url, init) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), SeatPlanRepository.TIMEOUT_MS);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        }
        finally {
            window.clearTimeout(timer);
        }
    }
    urlFor(classId) {
        const base = (window.PORTAL_CONFIG?.DB_URL ?? "").replace(/\/+$/, "");
        if (base === "")
            throw new Error("데이터베이스 주소가 없어요");
        return `${base}/seatplans/${classId}.json`;
    }
}
SeatPlanRepository.TIMEOUT_MS = 10000;
SeatPlanRepository.LIST_LIMIT = 30;
class PrintSheet {
    constructor(titleElement, metaElement) {
        this.titleElement = titleElement;
        this.metaElement = metaElement;
    }
    fill(classId, record, mode, perspective) {
        this.titleElement.textContent = `${ClassChoice.label(classId)} 자리 배치표`;
        this.metaElement.textContent = `${record.savedLabel()} 저장 · ${mode.label} · ${perspective.label}`;
    }
    print() {
        window.print();
    }
}
class SavedPlanList {
    constructor() {
        this.element = SeatDom.byId("savedList");
    }
    show(records, activeId, onPick) {
        const buttons = records.map((record) => {
            const mode = LayoutModes.byKey(record.modeKey);
            const button = SeatDom.create("button", "saved-item", `${record.savedLabel()} · ${mode.label}`);
            button.type = "button";
            button.classList.toggle("on", record.id === activeId);
            button.addEventListener("click", () => onPick(record));
            return button;
        });
        SeatDom.fill(this.element, buttons);
    }
    clear() {
        SeatDom.fill(this.element, []);
    }
}
class SavedPlansView {
    constructor(repository) {
        this.repository = repository;
        this.overlay = SeatDom.byId("savedView");
        this.hint = SeatDom.byId("savedHint");
        this.detail = SeatDom.byId("savedDetail");
        this.perspectiveButton = SeatDom.byId("savedPerspective");
        this.printButton = SeatDom.byId("savedPrint");
        this.stage = new SeatStageView(SeatDom.byId("savedStageHost"));
        this.list = new SavedPlanList();
        this.printSheet = new PrintSheet(SeatDom.byId("savedTitle"), SeatDom.byId("savedMeta"));
        this.perspective = Perspectives.teacher;
        this.records = [];
        this.current = null;
        this.loadCount = 0;
        this.choice = new ClassChoice(SeatDom.byId("savedClassChoice"), () => this.loadClass());
        SeatDom.byId("savedClose").addEventListener("click", () => this.close());
        this.perspectiveButton.addEventListener("click", () => this.togglePerspective());
        this.printButton.addEventListener("click", () => this.printCurrent());
    }
    open() {
        this.overlay.hidden = false;
        document.body.classList.add("saved-open");
        this.showHint("학년과 반을 고르면 저장된 배치가 나와요");
        this.paintPerspectiveButton();
    }
    close() {
        this.overlay.hidden = true;
        document.body.classList.remove("saved-open");
    }
    async loadClass() {
        const classId = this.choice.value;
        if (classId === null)
            return;
        const ticket = ++this.loadCount;
        this.current = null;
        this.list.clear();
        this.showHint("불러오는 중이에요…");
        try {
            const records = await this.repository.list(classId);
            if (ticket !== this.loadCount)
                return;
            this.records = records;
            this.showHint(records.length === 0 ? "저장된 배치가 없어요" : "목록에서 배치를 골라 주세요");
            this.list.show(records, "", (record) => this.pick(record));
        }
        catch {
            if (ticket !== this.loadCount)
                return;
            this.showHint("불러오지 못했어요. 인터넷을 확인해 주세요");
        }
    }
    pick(record) {
        this.current = record;
        this.list.show(this.records, record.id, (picked) => this.pick(picked));
        this.showCurrent();
    }
    togglePerspective() {
        this.perspective = Perspectives.other(this.perspective);
        this.paintPerspectiveButton();
        this.showCurrent();
    }
    showCurrent() {
        const classId = this.choice.value;
        const record = this.current;
        if (classId === null || record === null)
            return;
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
    printCurrent() {
        if (this.current !== null)
            this.printSheet.print();
    }
    showHint(text) {
        this.hint.textContent = text;
        this.hint.hidden = false;
        this.detail.hidden = true;
        this.printButton.disabled = true;
    }
    paintPerspectiveButton() {
        this.perspectiveButton.textContent = `보는 기준: ${this.perspective.label}`;
    }
}
class SeatDragController {
    constructor(surface, handler) {
        this.surface = surface;
        this.handler = handler;
        this.pressed = null;
        this.ghost = null;
        this.hovered = null;
        this.onDown = (event) => {
            if (this.pressed !== null || (event.pointerType === "mouse" && event.button !== 0))
                return;
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
        this.onMove = (event) => {
            const pressed = this.pressed;
            if (pressed === null || pressed.pointerId !== event.pointerId)
                return;
            if (!pressed.dragging) {
                const distance = Math.hypot(event.clientX - pressed.startX, event.clientY - pressed.startY);
                const canDrag = pressed.from !== null && this.handler.canDragFrom(pressed.from);
                if (distance < SeatDragController.DRAG_THRESHOLD_PX || !canDrag)
                    return;
                this.startDrag(pressed);
            }
            this.moveGhost(event.clientX, event.clientY);
            this.markHovered(this.dropTargetAt(event.clientX, event.clientY));
        };
        this.onUp = (event) => {
            const pressed = this.pressed;
            if (pressed === null || pressed.pointerId !== event.pointerId)
                return;
            const target = pressed.dragging ? this.dropTargetAt(event.clientX, event.clientY) : null;
            this.finishPress();
            if (pressed.dragging) {
                const to = target ? SeatPosition.fromElement(target) : null;
                if (pressed.from !== null && to !== null)
                    this.handler.onSeatDropped(pressed.from, to);
            }
            else if (pressed.from !== null) {
                this.handler.onSeatTapped(pressed.from);
            }
            else {
                this.handler.onBackgroundTapped();
            }
        };
        this.onCancel = () => {
            this.finishPress();
        };
        surface.addEventListener("pointerdown", this.onDown);
        surface.addEventListener("pointermove", this.onMove);
        surface.addEventListener("pointerup", this.onUp);
        surface.addEventListener("pointercancel", this.onCancel);
        surface.addEventListener("contextmenu", (event) => event.preventDefault());
    }
    startDrag(pressed) {
        pressed.dragging = true;
        const source = pressed.source;
        if (source === null)
            return;
        const box = source.getBoundingClientRect();
        this.ghost = SeatDom.create("div", "drag-ghost", source.textContent ?? "");
        this.ghost.style.width = `${box.width}px`;
        this.ghost.style.height = `${box.height}px`;
        this.ghost.style.fontSize = `${box.height * 0.5}px`;
        document.body.append(this.ghost);
        source.classList.add("drag-source");
    }
    moveGhost(x, y) {
        if (this.ghost === null)
            return;
        this.ghost.style.left = `${x - this.ghost.offsetWidth / 2}px`;
        this.ghost.style.top = `${y - this.ghost.offsetHeight / 2}px`;
    }
    dropTargetAt(x, y) {
        const cell = this.cellAt(document.elementFromPoint(x, y));
        if (cell === null || cell === this.pressed?.source || cell.classList.contains("blocked"))
            return null;
        return cell;
    }
    markHovered(cell) {
        if (cell === this.hovered)
            return;
        this.hovered?.classList.remove("drop-target");
        cell?.classList.add("drop-target");
        this.hovered = cell;
    }
    cellAt(target) {
        return target instanceof Element ? target.closest(".cell") : null;
    }
    finishPress() {
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
SeatDragController.DRAG_THRESHOLD_PX = 8;
class SeatInteractionCoordinator {
    constructor(board, selection, swapper, messages, onChanged) {
        this.board = board;
        this.selection = selection;
        this.swapper = swapper;
        this.messages = messages;
        this.onChanged = onChanged;
    }
    canDragFrom(position) {
        return this.board.hasAssignments() && this.board.seatAt(position).isFilled;
    }
    onSeatTapped(position) {
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
        if (!picked.equals(position))
            this.swapper.swap(picked, position);
        this.onChanged();
    }
    onSeatDropped(from, to) {
        this.selection.clear();
        this.swapper.swap(from, to);
        this.onChanged();
    }
    onBackgroundTapped() {
        if (this.selection.current === null)
            return;
        this.selection.clear();
        this.onChanged();
    }
    pickFirst(seat) {
        if (!seat.isFilled) {
            this.messages.show("배치를 지우면 X 칸을 다시 고를 수 있어요", "info");
            return;
        }
        this.selection.select(seat.position);
        this.onChanged();
    }
}
class SeatPickerApp {
    constructor() {
        this.board = new SeatBoard();
        this.history = new SwapHistory();
        this.selection = new SeatSelection();
        this.swapper = new SeatSwapper(this.board, this.history);
        this.assigner = new SeatAssigner(new SeatShuffler(new SeatMathRandomSource()));
        this.repository = new SeatPlanRepository();
        this.relocator = new BlockedSeatRelocator();
        this.stage = new SeatStageView(SeatDom.byId("stageHost"));
        this.status = new StatusView(SeatDom.byId("status"));
        this.messages = new MessageBar(SeatDom.byId("message"));
        this.saveDialog = new SaveDialog();
        this.savedView = new SavedPlansView(this.repository);
        this.controls = new ControlPanel({
            toggleMode: () => this.toggleMode(),
            togglePerspective: () => this.togglePerspective(),
            inputsChanged: () => this.refreshStatus(),
            place: () => this.place(),
            clearPlacement: () => this.clearPlacement(),
            openSaved: () => this.savedView.open(),
            undo: () => this.undo(),
            save: () => void this.save(),
        });
        this.mode = LayoutModes.pair;
        this.perspective = Perspectives.student;
        this.saving = false;
        const coordinator = new SeatInteractionCoordinator(this.board, this.selection, this.swapper, this.messages, () => this.refresh(false));
        new SeatDragController(SeatDom.byId("stageHost"), coordinator);
        this.refresh(false);
    }
    toggleMode() {
        this.mode = LayoutModes.other(this.mode);
        if (!this.board.hasAssignments())
            this.relocator.relocate(this.board, this.mode);
        this.refresh(false);
    }
    togglePerspective() {
        this.perspective = Perspectives.other(this.perspective);
        this.refresh(false);
    }
    place() {
        const numbers = this.controls.numbers.selectedNumbers();
        if (numbers.length === 0) {
            this.messages.show("배치할 번호가 하나도 없어요", "warn");
            return;
        }
        const available = this.board.availableCount();
        if (numbers.length > available) {
            this.messages.show(`번호 ${numbers.length}개인데 쓸 수 있는 자리는 ${available}칸이에요`, "warn");
            return;
        }
        this.history.clear();
        this.selection.clear();
        this.assigner.assign(this.board, numbers);
        this.refresh(true);
        this.messages.show(`번호 ${numbers.length}개를 배치했어요`, "ok");
    }
    clearPlacement() {
        this.board.clearAssignments();
        this.history.clear();
        this.selection.clear();
        this.refresh(false);
        this.messages.show("배치를 지웠어요", "info");
    }
    undo() {
        this.selection.clear();
        this.swapper.undo();
        this.refresh(false);
    }
    async save() {
        if (this.saving || !this.board.hasAssignments())
            return;
        const classId = await this.saveDialog.ask();
        if (classId === null)
            return;
        this.saving = true;
        this.controls.setSaveEnabled(false);
        try {
            await this.repository.save(classId, SeatPlanRecord.fromBoard(this.board, this.mode));
            this.messages.show(`${ClassChoice.label(classId)} 자리 배치를 저장했어요`, "ok");
        }
        catch {
            this.messages.show("저장하지 못했어요. 인터넷을 확인해 주세요", "warn");
        }
        finally {
            this.saving = false;
            this.refresh(false);
        }
    }
    refresh(animate) {
        this.stage.render(this.board, this.mode, this.perspective, this.selection.current, animate);
        this.controls.showMode(this.mode);
        this.controls.showPerspective(this.perspective);
        this.controls.setUndoEnabled(this.history.hasRecord);
        this.controls.setSaveEnabled(!this.saving && this.board.hasAssignments());
        this.refreshStatus();
    }
    refreshStatus() {
        this.status.show(this.controls.numbers.selectedNumbers().length, this.board.availableCount());
    }
}
new SeatPickerApp();
