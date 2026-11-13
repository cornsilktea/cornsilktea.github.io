interface BbTeacherIo {
  read(path: string): Promise<unknown>;
  patch(values: Record<string, unknown>): Promise<void>;
}

interface BbAbilityRow {
  key: string;
  g: number;
  cells: Array<{ text: string; sort: number }>;
}

class BbAbilityTable {
  static readonly FEW_GAMES = 5;
  static readonly BAT_HEAD = ["컨택-파워-주루", "게임", "타석", "타율", "출루율", "장타율", "OPS", "홈런율", "삼진율", "볼넷율"];
  static readonly PIT_HEAD = ["제구-구위-변화", "게임", "상대 타자", "피OPS", "평균자책점", "WHIP", "삼진률", "볼넷율"];

  static sum<T extends object>(rows: readonly T[], keys: readonly (keyof T)[], empty: T): T {
    const total = Object.assign({}, empty);
    rows.forEach((row) => keys.forEach((key) => { (total as Record<string, number>)[key as string] += AccountNumbers.count(row[key]); }));
    return total;
  }

  static cell(value: number | null, text: (value: number) => string): { text: string; sort: number } {
    return value === null ? { text: "-", sort: -1 } : { text: text(value), sort: value };
  }

  static batRows(groups: Record<string, BbAbilityBat[]>): BbAbilityRow[] {
    const f = BbBaseballFormulas, rate = f.rateText, pct = (value: number) => (value * 100).toFixed(1) + "%";
    return Object.keys(groups).map((key) => {
      const s = BbAbilityTable.sum(groups[key], (["g"] as (keyof BbAbilityBat)[]).concat(BbStatsKeys.BAT), Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyBat()));
      const c = BbAbilityTable.cell;
      return { key, g: s.g, cells: [c(s.g, String), c(s.pa, String), c(f.average(s), rate), c(f.onBase(s), rate), c(f.slugging(s), rate), c(f.ops(s), rate), c(f.perPlate(s.hr, s), pct), c(f.perPlate(s.k, s), pct), c(f.perPlate(s.bb, s), pct)] };
    });
  }

  static pitRows(groups: Record<string, BbAbilityPit[]>): BbAbilityRow[] {
    const f = BbBaseballFormulas, pct = (value: number) => (value * 100).toFixed(1) + "%";
    return Object.keys(groups).map((key) => {
      const s = BbAbilityTable.sum(groups[key], (["g"] as (keyof BbAbilityPit)[]).concat(BbStatsKeys.PIT), Object.assign({ g: 0 }, BbBoxScoreBuilder.emptyPit()));
      const c = BbAbilityTable.cell;
      return { key, g: s.g, cells: [c(s.g, String), c(s.bf, String), c(f.ops(s), f.rateText), c(f.earnedRunAverage(s), f.meanText), c(f.whip(s), f.meanText), c(f.perBatter(s.k, s), pct), c(f.perBatter(s.bb, s), pct)] };
    });
  }

  static html(head: readonly string[], rows: readonly BbAbilityRow[], sortColumn: number, kind: string): string {
    const sorted = rows.slice().sort((a, b) => (sortColumn < 0 ? a.key.localeCompare(b.key) : b.cells[sortColumn].sort - a.cells[sortColumn].sort));
    return '<table class="asd-table bb-ability-table"><thead><tr>' + head.map((label, index) => '<th data-bb-sort="' + kind + ":" + (index - 1) + '" style="cursor:pointer">' + label + "</th>").join("") + "</tr></thead><tbody>"
      + sorted.map((row) => '<tr style="' + (row.g < BbAbilityTable.FEW_GAMES ? "opacity:.45" : "") + '"><td><b>' + row.key + "</b></td>" + row.cells.map((cell) => "<td>" + cell.text + "</td>").join("") + "</tr>").join("")
      + "</tbody></table>";
  }
}

class BbTeacherPanel {
  private opened = false;
  private batRows: BbAbilityRow[] = [];
  private pitRows: BbAbilityRow[] = [];
  private batSort = -1;
  private pitSort = -1;

  constructor(private readonly io: BbTeacherIo, private readonly body: HTMLElement, private readonly toggle: HTMLElement) {}

  bind(): void {
    this.toggle.addEventListener("click", () => {
      const open = this.body.hidden;
      this.body.hidden = !open;
      this.toggle.textContent = open ? "접기" : "펼치기";
      if (open && !this.opened) { this.opened = true; this.build(); }
    });
  }

  private part<T extends HTMLElement>(selector: string): T { return this.body.querySelector(selector) as T; }

  private build(): void {
    this.body.innerHTML = '<p class="hint">41번 야구 1대1 대전. <b>핫콜드존</b>을 켜면 경기 중 투수에게 상대 타자의 구역별 타율이, 타자에게 상대 투수가 많이 던지는 위치가 보입니다(기본 꺼짐). '
      + "<b>포인트별 성적</b>은 학생이 고른 능력치 배분별로 사람과 한 경기 기록을 합쳐 보여 줍니다(학생 화면에는 없음). 5경기 미만인 줄은 흐리게, 머리글을 누르면 정렬합니다.</p>"
      + '<div class="actions"><button type="button" data-bb-zones>핫콜드존: 읽는 중…</button><button type="button" data-bb-load>포인트별 성적 불러오기</button></div><p class="msg" data-bb-msg></p><div data-bb-tables class="stats-box"></div>';
    this.part<HTMLButtonElement>("[data-bb-zones]").addEventListener("click", () => { this.flipZones(); });
    this.part<HTMLButtonElement>("[data-bb-load]").addEventListener("click", () => { this.load(); });
    this.part("[data-bb-tables]").addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest("[data-bb-sort]");
      if (!target) return;
      const [kind, column] = String(target.getAttribute("data-bb-sort")).split(":");
      if (kind === "bat") this.batSort = Number(column); else this.pitSort = Number(column);
      this.draw();
    });
    this.readZones();
  }

  private say(text: string): void { this.part("[data-bb-msg]").textContent = text; }

  private async readZones(): Promise<void> {
    const button = this.part<HTMLButtonElement>("[data-bb-zones]");
    try {
      const on = (await this.io.read(BbZoneSwitch.PATH)) === true;
      button.dataset.on = on ? "1" : "0";
      button.textContent = "핫콜드존: " + (on ? "켜짐 (누르면 끔)" : "꺼짐 (누르면 켬)");
    } catch (error) {
      button.textContent = "핫콜드존: 읽지 못함";
    }
  }

  private async flipZones(): Promise<void> {
    const button = this.part<HTMLButtonElement>("[data-bb-zones]"), next = button.dataset.on !== "1";
    try {
      await this.io.patch({ [BbZoneSwitch.PATH]: next });
      await this.readZones();
      this.say("핫콜드존을 " + (next ? "켰어요. 학생이 게임을 다시 열면 적용됩니다." : "껐어요."));
    } catch (error) {
      this.say("바꾸지 못했어요. (데이터베이스 규칙 게시 여부를 확인해 주세요)");
    }
  }

  private async load(): Promise<void> {
    this.say("불러오는 중…");
    try {
      const board = AccountShape.slots(await this.io.read(BbBoardRow.ROOT)), uids = Object.keys(board);
      const nodes = await Promise.all(uids.map((uid) => this.io.read("users/" + uid + "/stats/" + BbStatsKeys.GAME).then((raw) => BbStatsMath.normalize(raw)).catch(() => null)));
      const bat: Record<string, BbAbilityBat[]> = {}, pit: Record<string, BbAbilityPit[]> = {};
      nodes.forEach((node) => {
        if (!node) return;
        Object.keys(node.ab).forEach((key) => { (bat[key] = bat[key] || []).push(node.ab[key]); });
        Object.keys(node.ap).forEach((key) => { (pit[key] = pit[key] || []).push(node.ap[key]); });
      });
      this.batRows = BbAbilityTable.batRows(bat);
      this.pitRows = BbAbilityTable.pitRows(pit);
      this.say("학생 " + uids.length + "명의 기록을 합쳤어요.");
      this.draw();
    } catch (error) {
      this.say("불러오지 못했어요.");
    }
  }

  private draw(): void {
    this.part("[data-bb-tables]").innerHTML = '<div class="asd-sec">타자 (' + this.batRows.length + "가지 배분)</div>" + BbAbilityTable.html(BbAbilityTable.BAT_HEAD, this.batRows, this.batSort, "bat")
      + '<div class="asd-sec">투수 (' + this.pitRows.length + "가지 배분)</div>" + BbAbilityTable.html(BbAbilityTable.PIT_HEAD, this.pitRows, this.pitSort, "pit");
  }
}
