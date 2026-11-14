interface BbBoardSnapshot {
  inning: number;
  half: 0 | 1;
  outs: number;
  balls: number;
  strikes: number;
  score: [number, number];
  pitches: number;
}

class BbHudParts {
  private static readonly SVG_SPACE = "http://www.w3.org/2000/svg";

  static box(className: string, parent: HTMLElement, text = ""): HTMLElement {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  static shape<K extends keyof SVGElementTagNameMap>(tag: K, className: string, parent: Element, attributes: Readonly<Record<string, string | number>> = {}): SVGElementTagNameMap[K] {
    const element = document.createElementNS(BbHudParts.SVG_SPACE, tag);
    element.setAttribute("class", className);
    Object.keys(attributes).forEach((name) => element.setAttribute(name, String(attributes[name])));
    parent.appendChild(element);
    return element;
  }
}

class BbRunnerDiamond {
  private static readonly ROLES: readonly BbRoleId[] = ["batter", "runnerFirst", "runnerSecond", "runnerThird"];
  private static readonly BAGS: readonly BbVec[] = [BbFieldGeometry.FIRST, BbFieldGeometry.SECOND, BbFieldGeometry.THIRD];
  private static readonly BAG_HALF = 4.2;
  private static readonly DOT_RADIUS = 3.6;
  private static readonly ON_BAG_METERS = 2.9;
  private static readonly EDGE = { left: -26, right: 26, top: -44, bottom: 5 };

  private readonly bags: SVGElement[];
  private readonly dots: SVGElement[];
  private readonly lit: boolean[] = [false, false, false];
  private readonly seen: boolean[] = [false, false, false, false];

  constructor(host: HTMLElement) {
    const edge = BbRunnerDiamond.EDGE, home = BbFieldGeometry.HOME, half = BbRunnerDiamond.BAG_HALF;
    const picture = BbHudParts.shape("svg", "bb-diamond", host, { viewBox: [edge.left, edge.top, edge.right - edge.left, edge.bottom - edge.top].join(" ") });
    const corners = [home].concat(BbRunnerDiamond.BAGS), gaps = [half * 0.6, half, half, half];
    corners.forEach((corner, index) => {
      const next = corners[(index + 1) % corners.length], along = next.minus(corner).unit();
      const from = corner.plus(along.times(gaps[index])), to = next.minus(along.times(gaps[(index + 1) % corners.length]));
      BbHudParts.shape("line", "bb-diamond-line", picture, { x1: from.x.toFixed(2), y1: from.z.toFixed(2), x2: to.x.toFixed(2), y2: to.z.toFixed(2) });
    });
    BbHudParts.shape("rect", "bb-diamond-home", picture, { x: -half * 0.6, y: -half * 0.6, width: half * 1.2, height: half * 1.2, transform: "rotate(45)" });
    this.bags = BbRunnerDiamond.BAGS.map((bag) => BbHudParts.shape("rect", "bb-diamond-bag", picture, { x: -half, y: -half, width: half * 2, height: half * 2, transform: "translate(" + bag.x + " " + bag.z + ") rotate(45)" }));
    this.dots = BbRunnerDiamond.ROLES.map(() => BbHudParts.shape("circle", "bb-diamond-runner", picture, { r: BbRunnerDiamond.DOT_RADIUS }));
  }

  follow(script: BbDrillScript, tracks: readonly BbRunnerTrack[], seconds: number): void {
    const edge = BbRunnerDiamond.EDGE, occupied = [false, false, false];
    BbRunnerDiamond.ROLES.forEach((role, index) => {
      const running = tracks.some((track) => track.role === role && seconds >= track.since && seconds < track.until), dot = this.dots[index];
      if (running !== this.seen[index]) { this.seen[index] = running; dot.style.opacity = running ? "1" : "0"; }
      if (!running) return;
      const spot = script.placementOf(role, seconds).position;
      dot.style.transform = "translate(" + BbCurve.clamp(spot.x, edge.left + 3, edge.right - 3).toFixed(2) + "px," + BbCurve.clamp(spot.z, edge.top + 3, edge.bottom - 3).toFixed(2) + "px)";
      BbRunnerDiamond.BAGS.forEach((bag, base) => { if (spot.distanceTo(bag) < BbRunnerDiamond.ON_BAG_METERS) occupied[base] = true; });
    });
    occupied.forEach((on, base) => {
      if (on === this.lit[base]) return;
      this.lit[base] = on;
      this.bags[base].classList.toggle("on", on);
    });
  }
}

class BbCountLamps {
  private static readonly ROWS: ReadonlyArray<readonly [string, number, string]> = [["B", 3, "ball"], ["S", 2, "strike"], ["O", 2, "out"]];
  private readonly lamps: HTMLElement[][];

  constructor(host: HTMLElement) {
    const table = BbHudParts.box("bb-count", host);
    this.lamps = BbCountLamps.ROWS.map(([letter, count, kind]) => {
      const row = BbHudParts.box("bb-count-row", table);
      BbHudParts.box("bb-count-letter", row, letter);
      return Array.from({ length: count }, () => BbHudParts.box("bb-lamp bb-lamp-" + kind, row));
    });
  }

  show(balls: number, strikes: number, outs: number): void {
    [balls, strikes, outs].forEach((value, row) => this.lamps[row].forEach((lamp, index) => lamp.classList.toggle("on", index < value)));
  }
}

type BbCardSide = "left" | "right";

class BbPlayerCard {
  private static readonly MOST_POINTS = 7;
  private static readonly NO_RECORD = "-";
  private readonly name: HTMLElement;
  private readonly fills: HTMLElement[];
  private readonly points: HTMLElement[];
  private readonly values: HTMLElement[];
  private readonly heatGrid: HTMLElement;
  private readonly heatCells: HTMLElement[];

  constructor(host: HTMLElement, side: BbCardSide, role: string, abilityLabels: readonly string[], statLabels: readonly string[]) {
    const card = BbHudParts.box("bb-card bb-card-" + side, host), head = BbHudParts.box("bb-card-head", card);
    this.heatGrid = BbHudParts.box("bb-card-heat", card);
    this.heatCells = Array.from({ length: BbZoneGrid.CELLS }, () => BbHudParts.box("bb-card-heat-cell", this.heatGrid));
    BbHudParts.box("bb-card-role", head, role);
    this.name = BbHudParts.box("bb-card-name", head);
    const abilities = BbHudParts.box("bb-card-abilities", card);
    this.fills = [];
    this.points = [];
    abilityLabels.forEach((label) => {
      const row = BbHudParts.box("bb-card-ability", abilities);
      BbHudParts.box("bb-card-label", row, label);
      this.fills.push(BbHudParts.box("bb-card-fill", BbHudParts.box("bb-card-bar", row)));
      this.points.push(BbHudParts.box("bb-card-point", row));
    });
    const stats = BbHudParts.box("bb-card-stats", card);
    this.values = statLabels.map((label) => {
      const cell = BbHudParts.box("bb-card-stat", stats);
      BbHudParts.box("bb-card-stat-label", cell, label);
      return BbHudParts.box("bb-card-stat-value", cell, BbPlayerCard.NO_RECORD);
    });
  }

  show(name: string, points: readonly number[], stats: readonly string[] = []): void {
    this.name.textContent = name;
    points.forEach((value, index) => {
      this.fills[index].style.transform = "scaleX(" + BbCurve.clamp(value / BbPlayerCard.MOST_POINTS, 0, 1).toFixed(3) + ")";
      this.points[index].textContent = String(value);
    });
    this.values.forEach((cell, index) => { cell.textContent = stats[index] || BbPlayerCard.NO_RECORD; });
  }

  heat(tones: readonly string[] | null): void {
    this.heatGrid.classList.toggle("open", !!tones);
    this.heatCells.forEach((cell, index) => { cell.className = "bb-card-heat-cell" + (tones ? " " + tones[index] : ""); });
  }
}

interface BbCardFacts {
  batting: readonly string[];
  pitching: readonly string[];
  batterHeat: readonly string[] | null;
  pitcherHeat: readonly string[] | null;
}

class BbMatchupCards {
  private readonly batter: BbPlayerCard;
  private readonly pitcher: BbPlayerCard;

  constructor(host: HTMLElement) {
    this.batter = new BbPlayerCard(host, "left", "타자", ["컨택", "파워", "주루"], ["타율", "출루율", "장타율", "홈런"]);
    this.pitcher = new BbPlayerCard(host, "right", "투수", ["제구", "구위", "변화"], ["평균자책점", "WHIP", "피OPS", "투구수"]);
  }

  show(batterName: string, batter: BbBatterSheet, pitcherName: string, pitcher: BbPitcherSheet, pitches: number, facts: BbCardFacts | null = null): void {
    this.batter.show(batterName, [batter.abilities.contact, batter.abilities.power, batter.abilities.speed], facts ? facts.batting : []);
    this.pitcher.show(pitcherName, [pitcher.abilities.control, pitcher.abilities.power, pitcher.abilities.breaking], [0, 1, 2].map((index) => (facts && facts.pitching[index]) || "").concat([String(pitches)]));
    this.batter.heat(facts ? facts.batterHeat : null);
    this.pitcher.heat(facts ? facts.pitcherHeat : null);
  }
}

class BbBoardTicker {
  private shown: BbBoardSnapshot = { inning: 1, half: 0, outs: 0, balls: 0, strikes: 0, score: [0, 0], pitches: 0 };

  constructor(private readonly hud: BbScoreHud) {}

  begin(board: BbBoardSnapshot): void {
    this.shown = { ...board, score: [board.score[0], board.score[1]] };
    this.hud.show(this.shown);
  }

  thrown(countEnds: boolean): void {
    this.shown.pitches++;
    if (countEnds) this.shown.balls = this.shown.strikes = 0;
    this.hud.show(this.shown);
  }

  settle(final: BbBoardSnapshot): void {
    if (this.sameHalf(final) && final.outs >= this.shown.outs) this.begin({ ...final, pitches: this.shown.pitches });
    else this.begin({ ...this.shown, score: final.score, outs: 3 });
  }

  tally(kind: BbCallTally, final: BbBoardSnapshot): void {
    const shown = this.shown;
    if (kind === "settle") { this.settle(final); return; }
    if (kind === "out") shown.outs = Math.min(shown.outs + 1, 3);
    else shown.score[shown.half] = Math.min(shown.score[shown.half] + 1, final.score[shown.half]);
    this.hud.show(shown);
  }

  private sameHalf(final: BbBoardSnapshot): boolean { return final.inning === this.shown.inning && final.half === this.shown.half; }
}

class BbScoreHud {
  private readonly inning: HTMLElement;
  private readonly names: HTMLElement[];
  private readonly runs: HTMLElement[];
  private readonly rows: HTMLElement[];
  private readonly roomCode: HTMLElement;
  private readonly lamps: BbCountLamps;
  private readonly diamond: BbRunnerDiamond;

  constructor(host: HTMLElement) {
    const box = BbHudParts.box("hud-box bb-score", host);
    this.inning = BbHudParts.box("bb-score-inning", box);
    const teams = BbHudParts.box("bb-score-teams", box);
    this.rows = [0, 1].map(() => BbHudParts.box("bb-score-row", teams));
    this.names = this.rows.map((row) => BbHudParts.box("bb-score-name", row));
    this.runs = this.rows.map((row) => BbHudParts.box("bb-score-runs", row, "0"));
    this.diamond = new BbRunnerDiamond(box);
    this.lamps = new BbCountLamps(box);
    this.roomCode = BbHudParts.box("room-code-tag", box);
    this.roomCode.id = "hudRoomCode";
  }

  players(guest: string, host: string): void { [guest, host].forEach((name, team) => { this.names[team].textContent = name; }); }

  room(code: string): void { this.roomCode.textContent = code ? "방 코드 " + code : ""; }

  show(board: BbBoardSnapshot): void {
    this.inning.textContent = board.inning + "회";
    this.runs.forEach((cell, team) => { cell.textContent = String(board.score[team]); });
    this.rows.forEach((row, team) => row.classList.toggle("batting", team === board.half));
    this.lamps.show(board.balls, board.strikes, board.outs);
  }

  follow(script: BbDrillScript, tracks: readonly BbRunnerTrack[], seconds: number): void { this.diamond.follow(script, tracks, seconds); }
}
