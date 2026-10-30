interface FrSaveData {
  bag: FrBagSlot[];
  ap: number;
  ring: number;
  pity: Record<string, number>;
  seen: string[];
  lastAt: number;
  stats?: FrStatsData;
}

interface FrIslandCode { cls: string; island: number }

class FrIslandLink {
  static readonly TEST_ISLAND = "test_1";
  static readonly LOCAL_ISLAND = "local_1";
  static readonly CLASS_PATTERN = /^[1-3]-[1-5]$/;

  static linkClass(search: string): string {
    const match = /[?&]c=([^&]*)/.exec(search);
    return match ? decodeURIComponent(match[1]) : "";
  }

  static needsCode(search: string): boolean {
    const link = FrIslandLink.linkClass(search);
    return FrIslandLink.CLASS_PATTERN.test(link) || link === "contest";
  }

  static autoIsland(search: string): string | null {
    const link = FrIslandLink.linkClass(search);
    if (link === "test") return FrIslandLink.TEST_ISLAND;
    return FrIslandLink.needsCode(search) ? null : FrIslandLink.LOCAL_ISLAND;
  }

  static accepts(search: string, code: FrIslandCode): boolean {
    const link = FrIslandLink.linkClass(search);
    return link === "contest" ? code.cls === "test" : code.cls === link;
  }

  static islandKey(code: FrIslandCode): string { return code.cls + "_" + code.island; }
}

class FrIslandJoin {
  constructor(private readonly backend: FrBackend, private readonly uid: string, private readonly search: string) {}

  async existingHome(): Promise<string | null> {
    return this.backend.get<string>("users/" + this.uid + "/forest/home");
  }

  async joinWithCode(rawCode: string): Promise<{ island: string | null; message: string }> {
    const code = rawCode.trim().toLowerCase();
    if (!/^[a-z0-9가-힣]{2,12}$/.test(code)) return { island: null, message: "섬 코드를 다시 확인해 주세요." };
    const found = await this.backend.get<FrIslandCode>("forestCodes/" + code);
    if (!found) return { island: null, message: "없는 섬 코드예요." };
    if (!FrIslandLink.accepts(this.search, found)) return { island: null, message: "이 링크에서는 쓸 수 없는 코드예요." };
    return this.claim(FrIslandLink.islandKey(found));
  }

  async joinAutomatically(island: string): Promise<{ island: string | null; message: string }> {
    return this.claim(island);
  }

  private async claim(island: string): Promise<{ island: string | null; message: string }> {
    const result = await this.backend.transaction<string>("users/" + this.uid + "/forest/home", (current) => (current === null ? island : undefined));
    return { island: result.value, message: "" };
  }
}

class FrAccountSave {
  static readonly SAVE_INTERVAL_MS = 2000;

  private pending: FrSaveData | null = null;
  private timer = 0;
  statsPath = "";

  constructor(private readonly backend: FrBackend, private readonly uid: string) {}

  private path(rest: string): string { return "users/" + this.uid + "/forest/" + rest; }

  async load(): Promise<FrSaveData> {
    const stored = await this.backend.get<Partial<FrSaveData>>(this.path("save"));
    return {
      bag: stored && stored.bag ? stored.bag : [],
      ap: stored && typeof stored.ap === "number" ? stored.ap : FrBalance.BASE_ACTION_POINTS,
      ring: stored && typeof stored.ring === "number" ? stored.ring : 0,
      pity: stored && stored.pity ? stored.pity : {},
      seen: stored && stored.seen ? stored.seen : [],
      lastAt: stored && stored.lastAt ? stored.lastAt : 0,
    };
  }

  queue(data: FrSaveData): void {
    this.pending = data;
    if (this.timer) return;
    this.timer = window.setTimeout(() => { this.timer = 0; void this.flush(); }, FrAccountSave.SAVE_INTERVAL_MS);
  }

  async flush(): Promise<void> {
    if (!this.pending) return;
    const data = this.pending;
    this.pending = null;
    await this.backend.set(this.path("save"), data);
    if (this.statsPath && data.stats) await this.backend.set(this.statsPath, { all: data.stats.all, today: data.stats.today });
  }

  async clearHomeForTest(): Promise<void> { await this.backend.set(this.path("home"), null); }
}
