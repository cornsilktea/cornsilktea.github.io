interface FrQuestSnapshot {
  count(key: string): number;
  speciesCount(group: string): number;
  built(id: string): number;
  people(): number;
}

abstract class FrQuestRequirement {
  readonly shown: boolean = true;
  abstract have(board: FrQuestSnapshot): number;
  abstract need(board: FrQuestSnapshot): number;
  met(board: FrQuestSnapshot): boolean { return this.have(board) >= this.need(board); }
}

class FrCountRequirement extends FrQuestRequirement {
  static readonly MIN_PEOPLE = 3;
  static readonly FULL_PEOPLE = 10;

  constructor(private readonly key: string, private readonly base: number) { super(); }

  static scaled(base: number, people: number): number {
    const clamped = Math.max(FrCountRequirement.MIN_PEOPLE, Math.min(FrCountRequirement.FULL_PEOPLE, people));
    return Math.ceil(base * clamped / FrCountRequirement.FULL_PEOPLE);
  }

  have(board: FrQuestSnapshot): number { return board.count(this.key); }
  need(board: FrQuestSnapshot): number { return FrCountRequirement.scaled(this.base, board.people()); }
}

class FrFixedRequirement extends FrQuestRequirement {
  constructor(private readonly key: string, private readonly amount: number) { super(); }
  have(board: FrQuestSnapshot): number { return board.count(this.key); }
  need(): number { return this.amount; }
}

class FrSpeciesRequirement extends FrQuestRequirement {
  readonly shown = false;
  constructor(private readonly group: string, private readonly amount: number) { super(); }
  have(board: FrQuestSnapshot): number { return board.speciesCount(this.group); }
  need(): number { return this.amount; }
}

class FrBuildRequirement extends FrQuestRequirement {
  constructor(private readonly id: string, private readonly amount: number) { super(); }
  have(board: FrQuestSnapshot): number { return Math.min(this.amount, board.built(this.id)); }
  need(): number { return this.amount; }
}

class FrQuestMission {
  constructor(readonly id: string, readonly name: string, readonly chapter: number, private readonly requirements: FrQuestRequirement[]) {}

  complete(board: FrQuestSnapshot): boolean { return this.requirements.every((r) => r.met(board)); }

  have(board: FrQuestSnapshot): number {
    return this.requirements.filter((r) => r.shown).reduce((sum, r) => sum + Math.min(r.have(board), r.need(board)), 0);
  }

  need(board: FrQuestSnapshot): number {
    return this.requirements.filter((r) => r.shown).reduce((sum, r) => sum + r.need(board), 0);
  }
}

class FrQuestCatalog {
  static readonly CHAPTER_NAMES: ReadonlyArray<string> = ["", "첫 불씨", "길을 열다", "먹고사는 마을", "지키는 마을", "동마의 축제"];

  static readonly MISSIONS: ReadonlyArray<FrQuestMission> = FrQuestCatalog.build();

  static forChapter(chapter: number): FrQuestMission[] { return FrQuestCatalog.MISSIONS.filter((m) => m.chapter === chapter); }

  private static build(): FrQuestMission[] {
    const count = (key: string, base: number) => new FrCountRequirement(key, base);
    const built = (id: string, amount = 1) => new FrBuildRequirement(id, amount);
    const m = (id: string, name: string, requirements: FrQuestRequirement[]) => new FrQuestMission(id, name, Number(id.charAt(0)), requirements);
    return [
      m("1-1", "작업대를 세우자", [built("workbench")]),
      m("1-2", "숲에 빈터를", [count("cleared", 20)]),
      m("1-3", "첫 도구 공방", [count("woodGear", 20)]),
      m("1-4", "모닥불 식탁", [count("cook", 20)]),
      m("2-1", "강 위의 다리", [built("bridge_east"), built("bridge_south")]),
      m("2-2", "계단 마을", [built("stairs", 3)]),
      m("2-3", "불을 다루다", [built("forge"), built("oven")]),
      m("2-4", "광부의 날", [count("ironDonated", 70)]),
      m("3-1", "텃밭 가꾸기", [built("farm_expand", 2)]),
      m("3-2", "풍년", [count("harvest", 40), new FrSpeciesRequirement("crop", 6)]),
      m("3-3", "바다의 도감", [count("fish", 90), new FrSpeciesRequirement("fish", 8)]),
      m("3-4", "밤을 밝히다", [built("lamp", 8), built("kitchen")]),
      m("4-1", "성벽 두르기", [built("wall", 12)]),
      m("4-2", "하늘 높이 망루", [built("tower", 4)]),
      m("4-3", "용감한 탐험대", [count("trip", 150)]),
      m("4-4", "힘을 모아 반지를", [count("ringUp", 8)]),
      m("5-1", "활짝 열린 성문", [built("gate", 4)]),
      m("5-2", "우리 마을 집들이", [count("house", 10)]),
      m("5-3", "마을 잔치", [count("cook4", 15)]),
      m("5-4", "축제의 밤", [new FrFixedRequirement("allSleep", 3)]),
    ];
  }
}

class FrQuestBoard implements FrQuestSnapshot {
  static readonly FLUSH_MS = 2000;

  onChange: () => void = () => undefined;
  onMissionDone: (mission: FrQuestMission) => void = () => undefined;

  private readonly remoteCounts = new Map<string, number>();
  private readonly pending = new Map<string, number>();
  private readonly species = new Map<string, Set<string>>();
  private readonly doneIds = new Set<string>();
  private readonly unsentSpecies: string[] = [];
  private readonly unsentDone: string[] = [];
  private flushTimer = 0;
  holding: () => boolean = () => false;

  constructor(private readonly backend: FrBackend, private readonly island: string, private readonly villageOf: () => FrVillage, private readonly peopleNow: () => number) {}

  private path(rest: string): string { return "forest/" + this.island + "/quest/" + rest; }

  async load(): Promise<void> {
    const data = await this.backend.get<{ n?: Record<string, number>; sp?: Record<string, number>; done?: Record<string, number> }>(this.path(""));
    if (!data) return;
    Object.keys(data.n || {}).forEach((key) => this.remoteCounts.set(key, Number((data.n as Record<string, number>)[key])));
    Object.keys(data.sp || {}).forEach((key) => this.addSpecies(key));
    Object.keys(data.done || {}).forEach((id) => this.doneIds.add(id));
  }

  count(key: string): number { return (this.remoteCounts.get(key) || 0) + (this.pending.get(key) || 0); }
  speciesCount(group: string): number { return (this.species.get(group) || new Set<string>()).size; }
  built(id: string): number { return this.villageOf().builtCount(id); }
  people(): number { return this.peopleNow(); }
  isDone(id: string): boolean { return this.doneIds.has(id); }

  villageLevel(): number {
    let level = 1;
    for (let chapter = 1; chapter < FrQuestCatalog.CHAPTER_NAMES.length - 1; chapter++) {
      if (!FrQuestCatalog.forChapter(chapter).every((m) => this.doneIds.has(m.id))) break;
      level = chapter + 1;
    }
    return level;
  }

  record(key: string, amount = 1): void {
    this.pending.set(key, (this.pending.get(key) || 0) + amount);
    this.scheduleFlush();
    this.evaluate();
  }

  recordSpecies(group: string, id: string): void {
    const key = group + "_" + id;
    if (this.addSpecies(key)) { this.unsentSpecies.push(key); this.scheduleFlush(); }
    this.evaluate();
  }

  remoteCount(key: string, value: number): void {
    this.remoteCounts.set(key, Math.max(this.remoteCounts.get(key) || 0, value));
    this.evaluate();
  }

  remoteSpecies(key: string): void { if (this.addSpecies(key)) this.evaluate(); }

  remoteDone(id: string): void {
    if (this.doneIds.has(id)) return;
    this.doneIds.add(id);
    this.onChange();
  }

  evaluate(): void {
    FrQuestCatalog.MISSIONS.forEach((mission) => {
      if (this.doneIds.has(mission.id) || !mission.complete(this)) return;
      this.doneIds.add(mission.id);
      this.unsentDone.push(mission.id);
      this.scheduleFlush();
      this.onMissionDone(mission);
    });
    this.onChange();
  }

  private addSpecies(key: string): boolean {
    const group = key.split("_")[0];
    const set = this.species.get(group) || new Set<string>();
    if (set.has(key)) return false;
    set.add(key);
    this.species.set(group, set);
    return true;
  }

  release(): void { this.scheduleFlush(); }

  private scheduleFlush(): void {
    if (this.flushTimer || this.holding()) return;
    this.flushTimer = window.setTimeout(() => { this.flushTimer = 0; void this.flush(); }, FrQuestBoard.FLUSH_MS);
  }

  private async flush(): Promise<void> {
    const batch = Array.from(this.pending.entries());
    this.pending.clear();
    this.unsentSpecies.splice(0).forEach((key) => void this.backend.set(this.path("sp/" + key), 1));
    this.unsentDone.splice(0).forEach((id) => void this.backend.set(this.path("done/" + id), 1));
    for (const [key, delta] of batch) {
      this.remoteCounts.set(key, (this.remoteCounts.get(key) || 0) + delta);
      try {
        const result = await this.backend.transaction<number>(this.path("n/" + key), (current) => (current || 0) + delta);
        if (result.committed && typeof result.value === "number") this.remoteCounts.set(key, Math.max(this.remoteCounts.get(key) || 0, result.value));
      } catch (error) {
        this.pending.set(key, (this.pending.get(key) || 0) + delta);
        this.remoteCounts.set(key, Math.max(0, (this.remoteCounts.get(key) || 0) - delta));
      }
    }
    this.onChange();
  }
}

class FrQuestNode implements FrNode {
  constructor(private readonly board: FrQuestBoard) {}

  apply(rest: string[], value: unknown): void {
    if (rest.length === 0) {
      const table = (value || {}) as Record<string, unknown>;
      this.section("n", table.n);
      this.section("sp", table.sp);
      this.section("done", table.done);
      return;
    }
    if (rest.length === 1) { this.section(rest[0], value); return; }
    this.entry(rest[0], rest[1], value);
  }

  private section(name: string, value: unknown): void {
    const table = (value || {}) as Record<string, unknown>;
    Object.keys(table).forEach((key) => this.entry(name, key, table[key]));
  }

  private entry(name: string, key: string, value: unknown): void {
    if (value === null || value === undefined) return;
    if (name === "n") this.board.remoteCount(key, Number(value));
    else if (name === "sp") this.board.remoteSpecies(key);
    else if (name === "done") this.board.remoteDone(key);
  }
}

class FrQuestPanel {
  private lastSignature = "";

  constructor(private readonly root: HTMLElement, private readonly board: FrQuestBoard, private readonly levelOf: () => number) {}

  render(): void {
    const chapter = Math.max(1, Math.min(5, this.levelOf()));
    const missions = FrQuestCatalog.forChapter(chapter);
    const rows = missions.map((mission) => {
      const done = this.board.isDone(mission.id);
      return { mission, done, text: mission.name + (done ? " (완료)" : " (" + mission.have(this.board) + "/" + mission.need(this.board) + ")") };
    });
    const signature = chapter + "|" + rows.map((r) => r.text).join("|");
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    FrDom.clear(this.root);
    this.root.appendChild(FrDom.make("div", "fr-quest-head", "마을 " + chapter + "단계 퀘스트 · " + FrQuestCatalog.CHAPTER_NAMES[chapter]));
    rows.forEach((row) => this.root.appendChild(FrDom.make("div", row.done ? "fr-quest-row done" : "fr-quest-row", row.text)));
  }
}
