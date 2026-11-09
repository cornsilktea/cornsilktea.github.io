/* =====================================================================
   30번 팀 구성(2026-11-02 선생님 요청) — 교사 제어판(admin.html) 전용

   한 반의 반 별 통계(classStats/<반>/<uid>)를 한 번 읽어 MVP율 순으로 티어 1·2·3 으로 나누고,
   8개 조(세로 칸) × 3개 티어(가로 줄) 판 위에서 조를 짠다. 다른 학생의 통계는 교사만 읽을 수 있으므로 제어판에서만 쓴다.
   순서: 티어 1 은 MVP율 순서대로 1~8조에 자리를 잡고 → 티어 2(가나다순)를 끌어다 놓으면 → 티어 3(가나다순)이 나온다.
   배치가 끝난 뒤에는 명찰을 끌어다 놓거나 두 명찰을 차례로 눌러 서로 바꿀 수 있다(티어 1 도 다른 칸으로 옮길 수 있다).
   ===================================================================== */

interface TeamFormationIo {
  read(path: string): Promise<unknown>;
}

interface TeamFormationIds {
  cls: string;
  load: string;
  msg: string;
  board: string;
  tray: string;
}

interface TeamFormationClass {
  id: string;
  label: string;
}

interface TeamFormationRaw {
  n?: unknown;
  g?: unknown;
  m?: unknown;
}

interface TeamFormationSlot {
  row: number;
  col: number;
}

class TeamFormationStudent {
  constructor(
    readonly id: string,
    readonly fullName: string,
    readonly games: number,
    readonly mvp: number,
    public tier: number = 3
  ) {}

  get shownName(): string {
    const stripped = this.fullName.replace(/^\d+[\s._-]*/, "").trim();
    return stripped || this.fullName;
  }

  get mvpRate(): number {
    return this.games > 0 ? this.mvp / this.games : -1;
  }

  get mvpPercentText(): string {
    return this.games > 0 ? Math.round(this.mvpRate * 100) + "%" : "-";
  }

  static byMvpRate(a: TeamFormationStudent, b: TeamFormationStudent): number {
    return b.mvpRate - a.mvpRate || b.games - a.games || a.shownName.localeCompare(b.shownName, "ko");
  }

  static byName(a: TeamFormationStudent, b: TeamFormationStudent): number {
    return a.shownName.localeCompare(b.shownName, "ko") || a.fullName.localeCompare(b.fullName, "ko");
  }
}

class TeamFormationRoster {
  static readonly TIER_SIZE = 8;

  readonly students: TeamFormationStudent[];

  constructor(raw: Record<string, TeamFormationRaw>) {
    this.students = Object.keys(raw)
      .map((uid) => TeamFormationRoster.studentOf(uid, raw[uid] || {}))
      .sort(TeamFormationStudent.byMvpRate);
    this.students.forEach((student, index) => {
      student.tier = Math.min(3, Math.floor(index / TeamFormationRoster.TIER_SIZE) + 1);
    });
  }

  private static studentOf(uid: string, raw: TeamFormationRaw): TeamFormationStudent {
    const name = typeof raw.n === "string" && raw.n ? raw.n : "?";
    return new TeamFormationStudent(uid, name, Math.max(0, Number(raw.g) || 0), Math.max(0, Number(raw.m) || 0));
  }

  tierOf(tier: number): TeamFormationStudent[] {
    return this.students.filter((student) => student.tier === tier);
  }
}

class TeamFormationBoard {
  static readonly ROWS = 3;
  static readonly COLS = 8;

  private readonly cells: (TeamFormationStudent | null)[][];
  private readonly unplaced: Set<TeamFormationStudent>;

  constructor(readonly roster: TeamFormationRoster) {
    this.cells = Array.from({ length: TeamFormationBoard.ROWS }, () => new Array<TeamFormationStudent | null>(TeamFormationBoard.COLS).fill(null));
    this.unplaced = new Set(roster.students);
    roster.tierOf(1).slice(0, TeamFormationBoard.COLS).forEach((student, col) => this.put(student, { row: 0, col }));
  }

  get isDirty(): boolean {
    return this.roster.students.some((student) => student.tier > 1 && !this.unplaced.has(student));
  }

  studentAt(slot: TeamFormationSlot): TeamFormationStudent | null {
    return this.cells[slot.row][slot.col];
  }

  slotOf(student: TeamFormationStudent): TeamFormationSlot | null {
    for (let row = 0; row < TeamFormationBoard.ROWS; row++) {
      const col = this.cells[row].indexOf(student);
      if (col >= 0) return { row, col };
    }
    return null;
  }

  /* 대기 칸에는 아직 자리가 없는 학생 중 가장 높은 티어만 보인다. 티어 1 은 MVP율 순, 나머지는 가나다순 */
  trayStudents(): TeamFormationStudent[] {
    const waiting = Array.from(this.unplaced);
    if (!waiting.length) return [];
    const tier = Math.min(...waiting.map((student) => student.tier));
    const group = waiting.filter((student) => student.tier === tier);
    return group.sort(tier === 1 ? TeamFormationStudent.byMvpRate : TeamFormationStudent.byName);
  }

  trayTier(): number {
    const group = this.trayStudents();
    return group.length ? group[0].tier : 0;
  }

  /* 빈 칸이면 옮기고, 학생이 든 칸이면 서로 바꾼다. 대기 칸의 학생과 바꾸면 칸에 있던 학생이 대기 칸으로 간다 */
  moveTo(student: TeamFormationStudent, target: TeamFormationSlot): void {
    const occupant = this.studentAt(target);
    if (occupant === student) return;
    const from = this.slotOf(student);
    if (from) this.cells[from.row][from.col] = null;
    this.unplaced.delete(student);
    this.cells[target.row][target.col] = student;
    if (!occupant) return;
    if (from) this.cells[from.row][from.col] = occupant;
    else this.unplaced.add(occupant);
  }

  returnToTray(student: TeamFormationStudent): void {
    const from = this.slotOf(student);
    if (!from) return;
    this.cells[from.row][from.col] = null;
    this.unplaced.add(student);
  }

  private put(student: TeamFormationStudent, slot: TeamFormationSlot): void {
    this.cells[slot.row][slot.col] = student;
    this.unplaced.delete(student);
  }
}

class TeamFormationView {
  private selected: TeamFormationStudent | null = null;
  private dragged: TeamFormationStudent | null = null;

  constructor(
    private readonly board: TeamFormationBoard,
    private readonly boardBox: HTMLElement,
    private readonly trayBox: HTMLElement,
    private readonly say: (text: string) => void
  ) {
    this.makeDropTarget(this.trayBox, (student) => { this.board.returnToTray(student); this.selected = null; this.render(); });
    this.render();
  }

  private render(): void {
    this.boardBox.textContent = "";
    this.boardBox.appendChild(this.gridElement());
    this.renderTray();
  }

  private gridElement(): HTMLElement {
    const grid = this.make("div", "tf-grid");
    grid.appendChild(this.make("div", "tf-corner"));
    for (let col = 0; col < TeamFormationBoard.COLS; col++) grid.appendChild(this.make("div", "tf-head", (col + 1) + "조"));
    for (let row = 0; row < TeamFormationBoard.ROWS; row++) {
      grid.appendChild(this.make("div", "tf-tier tf-tier" + (row + 1), "티어 " + (row + 1)));
      for (let col = 0; col < TeamFormationBoard.COLS; col++) grid.appendChild(this.cellElement({ row, col }));
    }
    return grid;
  }

  private cellElement(slot: TeamFormationSlot): HTMLElement {
    const cell = this.make("div", "tf-cell");
    this.makeDropTarget(cell, (student) => this.moveTo(student, slot));
    cell.addEventListener("click", () => { if (this.selected) this.moveTo(this.selected, slot); });
    const student = this.board.studentAt(slot);
    if (student) cell.appendChild(this.tokenElement(student));
    return cell;
  }

  private renderTray(): void {
    const students = this.board.trayStudents();
    const tier = this.board.trayTier();
    this.trayBox.textContent = "";
    const title = tier ? "티어 " + tier + " 학생 " + students.length + "명 — 팀 칸으로 끌어다 놓으세요" : "모든 학생이 조에 들어갔습니다";
    this.trayBox.appendChild(this.make("div", "tf-tray-title", title));
    const list = this.make("div", "tf-tray-list");
    students.forEach((student) => list.appendChild(this.tokenElement(student)));
    this.trayBox.appendChild(list);
  }

  private tokenElement(student: TeamFormationStudent): HTMLElement {
    const token = this.make("div", "tf-token tf-token" + student.tier);
    token.appendChild(this.make("div", "tf-token-name", student.shownName));
    token.appendChild(this.make("div", "tf-token-rate", student.mvpPercentText));
    token.draggable = true;
    token.title = student.fullName + " · MVP율 " + (student.games ? (student.mvpRate * 100).toFixed(1) + "% (" + student.mvp + "/" + student.games + "판)" : "기록 없음");
    if (student === this.selected) token.classList.add("selected");
    token.addEventListener("dragstart", (event) => {
      this.dragged = student;
      event.dataTransfer?.setData("text/plain", student.id);
    });
    token.addEventListener("dragend", () => { this.dragged = null; });
    token.addEventListener("click", (event) => { event.stopPropagation(); this.clickToken(student); });
    return token;
  }

  private makeDropTarget(target: HTMLElement, onDrop: (student: TeamFormationStudent) => void): void {
    target.addEventListener("dragover", (event) => { event.preventDefault(); target.classList.add("over"); });
    target.addEventListener("dragleave", () => target.classList.remove("over"));
    target.addEventListener("drop", (event) => {
      event.preventDefault();
      target.classList.remove("over");
      if (this.dragged) onDrop(this.dragged);
      this.dragged = null;
    });
  }

  private clickToken(student: TeamFormationStudent): void {
    if (this.selected === student) { this.selected = null; this.render(); return; }
    const slot = this.board.slotOf(student);
    if (this.selected && slot) { this.moveTo(this.selected, slot); return; }
    const selectedSlot = this.selected && this.board.slotOf(this.selected);
    if (this.selected && selectedSlot) { this.moveTo(student, selectedSlot); return; }
    this.selected = student;
    this.say(student.shownName + " 선택 — 옮길 칸이나 바꿀 명찰을 누르세요.");
    this.render();
  }

  private moveTo(student: TeamFormationStudent, slot: TeamFormationSlot): void {
    this.board.moveTo(student, slot);
    this.selected = null;
    this.say("");
    this.render();
  }

  private make(tag: string, className: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
}

class TeamFormationPanel {
  private busy = false;
  private board: TeamFormationBoard | null = null;

  constructor(
    private readonly io: TeamFormationIo,
    private readonly ids: TeamFormationIds,
    private readonly classes: TeamFormationClass[],
    private readonly currentClass: () => string | null
  ) {}

  /* 펼칠 때마다 부른다: 반 목록을 채우고(처음 한 번), 제어판에서 펼쳐 둔 반이 있으면 그 반을 고른다 */
  open(): void {
    const select = this.el<HTMLSelectElement>(this.ids.cls);
    if (!select.options.length) {
      this.classes.forEach((c) => select.appendChild(new Option(c.label, c.id)));
    }
    const current = this.currentClass();
    if (!this.board && current && this.classes.some((c) => c.id === current)) select.value = current;
  }

  bind(): void {
    this.el(this.ids.load).addEventListener("click", () => { void this.load(); });
  }

  private el<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
  }

  private say(text: string): void {
    this.el(this.ids.msg).textContent = text;
  }

  private async load(): Promise<void> {
    if (this.busy) return;
    if (this.board && this.board.isDirty && !confirm("지금 짜 둔 조가 사라집니다. 다시 불러올까요?")) return;
    const cls = this.el<HTMLSelectElement>(this.ids.cls).value;
    const label = this.classes.find((c) => c.id === cls)?.label || cls;
    this.busy = true;
    this.say(label + " 통계를 불러오는 중…");
    try {
      const data = (await this.io.read("classStats/" + cls)) as Record<string, TeamFormationRaw> | null;
      const roster = new TeamFormationRoster(data || {});
      this.board = new TeamFormationBoard(roster);
      new TeamFormationView(this.board, this.el(this.ids.board), this.el(this.ids.tray), (text) => this.say(text));
      this.say(label + " " + roster.students.length + "명 · 티어 1 " + roster.tierOf(1).length + "명 · 티어 2 " + roster.tierOf(2).length + "명 · 티어 3 " + roster.tierOf(3).length + "명" + (roster.students.length > 24 ? " (24명을 넘는 학생은 대기 칸에 남습니다)" : ""));
    } catch (e) {
      this.say("불러오지 못했습니다 (" + (e instanceof Error ? e.message : String(e)) + "). 권한은 데이터베이스 규칙(classStats)을 확인하세요.");
    } finally {
      this.busy = false;
    }
  }
}
