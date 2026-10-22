class TeamDom {
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

class TeamShuffler {
  shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items];
    for (let last = shuffled.length - 1; last > 0; last--) {
      const pick = Math.floor(Math.random() * (last + 1));
      [shuffled[last], shuffled[pick]] = [shuffled[pick], shuffled[last]];
    }
    return shuffled;
  }
}

class TeamSplitter {
  private static readonly MIN_MEMBERS = 2;

  constructor(private readonly shuffler: TeamShuffler) {}

  split(numbers: readonly number[], membersPerTeam: number): number[][] {
    if (numbers.length === 0) return [];
    const teamCount = this.teamCount(numbers.length, membersPerTeam);
    const mixed = this.shuffler.shuffle(numbers);
    const baseSize = Math.floor(mixed.length / teamCount);
    const biggerTeams = mixed.length % teamCount;
    const teams: number[][] = [];
    let start = 0;
    for (let index = 0; index < teamCount; index++) {
      const size = baseSize + (index < biggerTeams ? 1 : 0);
      teams.push(mixed.slice(start, start + size).sort((a, b) => a - b));
      start += size;
    }
    return teams;
  }

  private teamCount(studentCount: number, membersPerTeam: number): number {
    let teamCount = Math.max(1, Math.ceil(studentCount / membersPerTeam));
    while (teamCount > 1 && Math.floor(studentCount / teamCount) < TeamSplitter.MIN_MEMBERS) teamCount--;
    return teamCount;
  }
}

class TeamSizePicker {
  static readonly SIZES: readonly number[] = [2, 3, 4, 5, 6];
  private static readonly DEFAULT_SIZE = 3;

  private current = TeamSizePicker.DEFAULT_SIZE;
  private readonly buttons = new Map<number, HTMLButtonElement>();

  constructor(container: HTMLElement) {
    TeamSizePicker.SIZES.forEach((size) => {
      const button = TeamDom.create("button", "size-button", `${size}명`);
      button.type = "button";
      button.addEventListener("click", () => this.select(size));
      this.buttons.set(size, button);
      container.appendChild(button);
    });
    this.paint();
  }

  value(): number {
    return this.current;
  }

  private select(size: number): void {
    this.current = size;
    this.paint();
  }

  private paint(): void {
    this.buttons.forEach((button, size) => {
      const on = size === this.current;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    });
  }
}

class TeamNumberPicker {
  private static readonly COUNT = 30;
  private static readonly PER_ROW = 15;

  private readonly excluded = new Set<number>();
  private changeListener: () => void = () => undefined;

  constructor(container: HTMLElement) {
    const buttons = this.allNumbers().map((number) => this.buildButton(number));
    [0, 1].forEach((rowIndex) => {
      const row = TeamDom.create("div", "number-row");
      row.append(...buttons.slice(rowIndex * TeamNumberPicker.PER_ROW, (rowIndex + 1) * TeamNumberPicker.PER_ROW));
      container.appendChild(row);
    });
  }

  onChange(listener: () => void): void {
    this.changeListener = listener;
  }

  presentNumbers(): number[] {
    return this.allNumbers().filter((number) => !this.excluded.has(number));
  }

  private allNumbers(): number[] {
    return Array.from({ length: TeamNumberPicker.COUNT }, (_, index) => index + 1);
  }

  private buildButton(number: number): HTMLButtonElement {
    const button = TeamDom.create("button", "number-button", String(number));
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => this.toggle(number, button));
    return button;
  }

  private toggle(number: number, button: HTMLButtonElement): void {
    const nowAbsent = !this.excluded.has(number);
    if (nowAbsent) this.excluded.add(number);
    else this.excluded.delete(number);
    button.classList.toggle("off", nowAbsent);
    button.setAttribute("aria-pressed", String(nowAbsent));
    this.changeListener();
  }
}

class TeamBoardView {
  private static readonly CARD_ASPECT = 1.3;

  constructor(private readonly board: HTMLElement) {}

  showHint(text: string): void {
    this.board.textContent = "";
    this.board.appendChild(TeamDom.create("p", "board-hint", text));
  }

  showTeams(teams: readonly (readonly number[])[]): void {
    this.board.textContent = "";
    this.fitGrid(teams.length);
    teams.forEach((members, index) => this.board.appendChild(this.buildCard(index + 1, members)));
  }

  private fitGrid(teamCount: number): void {
    const aspect = this.board.clientWidth / Math.max(1, this.board.clientHeight);
    const columns = Math.max(1, Math.min(teamCount, Math.round(Math.sqrt(teamCount * aspect / TeamBoardView.CARD_ASPECT))));
    this.board.style.setProperty("--cols", String(columns));
    this.board.style.setProperty("--rows", String(Math.ceil(teamCount / columns)));
  }

  private buildCard(teamNumber: number, members: readonly number[]): HTMLElement {
    const card = TeamDom.create("section", "team-card");
    card.style.animationDelay = `${(teamNumber - 1) * 40}ms`;
    card.appendChild(TeamDom.create("h2", "team-title", `${teamNumber}조`));
    const list = TeamDom.create("div", "team-members");
    members.forEach((member) => list.appendChild(TeamDom.create("span", "member-chip", String(member))));
    card.appendChild(list);
    return card;
  }
}

class TeamPickerApp {
  private readonly sizes = new TeamSizePicker(TeamDom.byId("sizeChoice"));
  private readonly numbers = new TeamNumberPicker(TeamDom.byId("numberPicker"));
  private readonly view = new TeamBoardView(TeamDom.byId("teamBoard"));
  private readonly splitter = new TeamSplitter(new TeamShuffler());
  private readonly presentCount = TeamDom.byId("presentCount");

  constructor() {
    TeamDom.byId("placeButton").addEventListener("click", () => this.place());
    this.numbers.onChange(() => this.showPresentCount());
    this.showPresentCount();
    this.view.showHint("조원 수를 고르고 배치를 눌러 주세요.");
  }

  private place(): void {
    const present = this.numbers.presentNumbers();
    if (present.length === 0) {
      this.view.showHint("출석한 번호가 없어요. 아래에서 번호를 다시 켜 주세요.");
      return;
    }
    this.view.showTeams(this.splitter.split(present, this.sizes.value()));
  }

  private showPresentCount(): void {
    this.presentCount.textContent = `${this.numbers.presentNumbers().length}명`;
  }
}

new TeamPickerApp();
