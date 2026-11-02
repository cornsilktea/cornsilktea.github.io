class FrGainRow {
  readonly node: HTMLDivElement;
  private readonly countNode: HTMLSpanElement;
  private total = 0;
  private timer = 0;

  constructor(readonly id: string, private readonly onExpire: (row: FrGainRow) => void) {
    const grade = FrItemNames.grade(id);
    this.node = FrDom.make("div", "fr-gain fr-gain-" + grade);
    this.node.style.setProperty("--gain-color", FrItemNames.GRADE_COLORS[grade]);
    this.node.appendChild(FrIcons.image(id, 34));
    this.node.appendChild(FrDom.make("span", "fr-gain-name", FrItemNames.label(id)));
    this.countNode = FrDom.make("span", "fr-gain-count");
    this.node.appendChild(this.countNode);
  }

  add(amount: number): void {
    this.total += amount;
    this.countNode.textContent = "+" + this.total;
    this.node.classList.remove("bump");
    void this.node.offsetWidth;
    this.node.classList.add("bump");
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.fadeOut(), FrGainFeed.SHOW_MS);
  }

  fadeOut(): void {
    this.node.classList.add("leaving");
    window.setTimeout(() => this.onExpire(this), FrGainFeed.LEAVE_MS);
  }
}

class FrGainFeed {
  static readonly SHOW_MS = 2400;
  static readonly LEAVE_MS = 400;
  static readonly MAX_ROWS = 6;

  private readonly rows: FrGainRow[] = [];

  constructor(private readonly box: HTMLElement) {}

  push(id: string, amount: number): void {
    if (amount <= 0) return;
    const existing = this.rows.find((r) => r.id === id);
    if (existing) { existing.add(amount); return; }
    if (this.rows.length >= FrGainFeed.MAX_ROWS) this.drop(this.rows[0]);
    const row = new FrGainRow(id, (expired) => this.drop(expired));
    this.rows.push(row);
    this.box.appendChild(row.node);
    row.add(amount);
  }

  private drop(row: FrGainRow): void {
    const index = this.rows.indexOf(row);
    if (index < 0) return;
    this.rows.splice(index, 1);
    if (row.node.parentNode) row.node.parentNode.removeChild(row.node);
  }
}
