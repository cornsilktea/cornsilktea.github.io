interface BbStoredProfile {
  version: 3;
  lineup: BbBatterSheet[];
  pitchers: BbPitcherSheet[];
  ballpark: string;
}

interface BbLegacyProfile {
  version: 2;
  lineup: Array<{ abilities: Record<string, number>; hand: BbHand }>;
  pitchers: Array<{ abilities: Record<string, number>; hand: BbHand; pitches: BbPitchId[] }>;
}

class BbProfileStore {
  static readonly KEY = "baseballduel_profile_v3";
  static readonly LEGACY_KEY = "baseballduel_profile_v2";
  private static readonly HANDS: readonly string[] = ["R", "L"];

  static blank(): BbStoredProfile {
    const team = BbAiLevel.team("R");
    return { version: 3, ballpark: "main", lineup: team.lineup, pitchers: team.pitchers };
  }

  static pointsOf(plan: BbAbilityPlan, abilities: object): number[] {
    const values = abilities as Record<string, number>;
    return plan.items.map((item) => values[item.key]);
  }

  static load(): BbStoredProfile {
    try {
      const raw = localStorage.getItem(BbProfileStore.KEY), parsed = raw ? JSON.parse(raw) as Partial<BbStoredProfile> : null;
      if (parsed && BbProfileStore.isSound(parsed)) return parsed as BbStoredProfile;
      const legacy = localStorage.getItem(BbProfileStore.LEGACY_KEY), migrated = legacy ? BbProfileStore.migrate(JSON.parse(legacy) as BbLegacyProfile) : null;
      if (migrated && BbProfileStore.isSound(migrated)) return migrated;
    } catch (error) {
      return BbProfileStore.blank();
    }
    return BbProfileStore.blank();
  }

  static migrate(old: BbLegacyProfile): BbStoredProfile | null {
    if (!old || old.version !== 2 || !Array.isArray(old.lineup) || !Array.isArray(old.pitchers) || !old.lineup[0] || !old.pitchers[0]) return null;
    const batter = old.lineup[0], pitcher = old.pitchers[0], rest = (values: number[]) => Math.max(1, Math.min(7, 12 - values.reduce((sum, value) => sum + value, 0)));
    const bat = [batter.abilities.contact, batter.abilities.power, batter.abilities.speed], pit = [pitcher.abilities.control, pitcher.abilities.power, pitcher.abilities.breaking];
    return {
      version: 3, ballpark: "main",
      lineup: BbRosterPlan.BATTING_ORDER.map((position) => ({ abilities: { contact: bat[0], power: bat[1], speed: bat[2], defense: rest(bat) }, hand: batter.hand, position })),
      pitchers: BbRosterPlan.pitcherRoles().map((role) => ({ abilities: { control: pit[0], power: pit[1], breaking: pit[2], stamina: rest(pit) }, hand: pitcher.hand, pitches: pitcher.pitches.slice(), role }))
    };
  }

  static teamOf(sheet: Partial<BbTeamSheet> | null | undefined): BbTeamSheet {
    const blank = BbProfileStore.blank(), candidate: Partial<BbStoredProfile> = { version: 3, lineup: sheet ? sheet.lineup : undefined, pitchers: sheet ? sheet.pitchers : undefined };
    const sound = BbProfileStore.isSound(candidate) ? candidate as BbStoredProfile : blank;
    return { lineup: sound.lineup, pitchers: sound.pitchers };
  }

  static save(profile: BbStoredProfile): void {
    try { localStorage.setItem(BbProfileStore.KEY, JSON.stringify(profile)); } catch (error) { return; }
  }

  private static isSound(profile: Partial<BbStoredProfile>): boolean {
    const lineup = profile.lineup, pitchers = profile.pitchers, roles = BbRosterPlan.pitcherRoles();
    if (profile.version !== 3 || !Array.isArray(lineup) || !Array.isArray(pitchers) || !BbRosterPlan.isFullLineup(lineup) || pitchers.length !== roles.length) return false;
    if (!pitchers.every((sheet, index) => !!sheet && sheet.role === roles[index])) return false;
    const handed = (sheet: { hand?: string; abilities?: object }) => !!sheet && !!sheet.abilities && BbProfileStore.HANDS.indexOf(sheet.hand as string) >= 0;
    if (!lineup.every((sheet) => handed(sheet) && BbAbilityAllocator.isValid(BbAbilityAllocator.BATTER, BbProfileStore.pointsOf(BbAbilityAllocator.BATTER, sheet.abilities)))) return false;
    return pitchers.every((sheet) => {
      if (!handed(sheet) || !BbAbilityAllocator.isValid(BbAbilityAllocator.PITCHER, BbProfileStore.pointsOf(BbAbilityAllocator.PITCHER, sheet.abilities)) || !Array.isArray(sheet.pitches)) return false;
      const allowed = new BbPitchSelection(sheet.abilities.breaking, sheet.pitches.filter((id) => id !== "ft")).usable();
      return sheet.pitches.length === allowed.length && sheet.pitches.every((id) => allowed.indexOf(id) >= 0);
    });
  }
}

class BbSheetParts {
  static button(className: string, parent: HTMLElement, text: string, onPress: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", onPress);
    parent.appendChild(button);
    return button;
  }
}

class BbAbilityPane {
  private readonly budget: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly values: HTMLElement[] = [];
  private readonly fills: HTMLElement[] = [];
  private readonly raisers: HTMLButtonElement[] = [];
  private readonly lowerers: HTMLButtonElement[] = [];
  private allocator: BbAbilityAllocator;

  constructor(host: HTMLElement, private readonly plan: BbAbilityPlan, private readonly onChange: (points: readonly number[]) => void) {
    this.allocator = new BbAbilityAllocator(plan);
    this.budget = BbHudParts.box("bb-sheet-budget", host);
    plan.items.forEach((item, index) => {
      const row = BbHudParts.box("bb-sheet-ability", host), words = BbHudParts.box("bb-sheet-words", row);
      BbHudParts.box("bb-sheet-ability-name", words, item.label);
      BbHudParts.box("bb-sheet-ability-effect", words, item.effect);
      this.fills.push(BbHudParts.box("bb-card-fill", BbHudParts.box("bb-card-bar bb-sheet-bar", row)));
      this.values.push(BbHudParts.box("bb-sheet-value", row));
      this.lowerers.push(BbSheetParts.button("bb-sheet-step", row, "▼", () => this.step(index, false)));
      this.raisers.push(BbSheetParts.button("bb-sheet-step", row, "▲", () => this.step(index, true)));
    });
    this.hint = BbHudParts.box("bb-sheet-hint", host);
  }

  load(points: readonly number[]): void {
    this.allocator = new BbAbilityAllocator(this.plan, points);
    this.draw();
  }

  private step(index: number, up: boolean): void {
    if (!(up ? this.allocator.raise(index) : this.allocator.lower(index))) return;
    this.draw();
    this.onChange(this.allocator.points);
  }

  private draw(): void {
    const allocator = this.allocator, plan = this.plan, spare = allocator.spare();
    this.budget.textContent = "사용 " + allocator.used() + " / 여분 " + spare;
    allocator.points.forEach((value, index) => {
      this.values[index].textContent = String(value);
      this.fills[index].style.transform = "scaleX(" + (value / plan.most).toFixed(3) + ")";
      this.raisers[index].disabled = !allocator.canRaise(index);
      this.lowerers[index].disabled = !allocator.canLower(index);
    });
    this.hint.textContent = spare < 1 ? "여분이 없습니다. 올리려면 다른 능력치를 먼저 내리세요." : "능력치 하나는 " + plan.least + "부터 " + plan.most + "까지 줄 수 있습니다.";
  }
}

class BbHandToggle {
  private readonly buttons: HTMLButtonElement[];
  private static readonly HANDS: readonly BbHand[] = ["R", "L"];

  constructor(host: HTMLElement, labels: readonly [string, string], private readonly onChange: (hand: BbHand) => void) {
    const row = BbHudParts.box("bb-sheet-hands", host);
    this.buttons = BbHandToggle.HANDS.map((hand, index) => BbSheetParts.button("bb-sheet-hand", row, labels[index], () => { this.load(hand); this.onChange(hand); }));
  }

  load(hand: BbHand): void { this.buttons.forEach((button, index) => button.classList.toggle("on", BbHandToggle.HANDS[index] === hand)); }
}

class BbPitchChips {
  private readonly count: HTMLElement;
  private readonly chips: HTMLButtonElement[];
  private selection = new BbPitchSelection(1);

  constructor(host: HTMLElement, private readonly onChange: (pitches: BbPitchId[]) => void) {
    this.count = BbHudParts.box("bb-sheet-chip-count", host);
    const row = BbHudParts.box("bb-sheet-chips", host);
    BbHudParts.box("bb-sheet-chip fixed", row, BbPitchCatalog.of("ft").label);
    this.chips = BbPitchCatalog.BREAKING_ORDER.map((id) => BbSheetParts.button("bb-sheet-chip", row, BbPitchCatalog.of(id).label, () => this.press(id)));
  }

  load(breaking: number, pitches: readonly BbPitchId[]): void {
    this.selection = new BbPitchSelection(breaking, pitches.filter((id) => id !== "ft"));
    this.draw();
  }

  reshape(breaking: number): BbPitchId[] {
    this.selection.setBreaking(breaking);
    this.draw();
    return this.selection.usable();
  }

  private press(id: BbPitchId): void {
    if (!this.selection.toggle(id)) return;
    this.draw();
    this.onChange(this.selection.usable());
  }

  private draw(): void {
    const selection = this.selection;
    this.count.textContent = "고를 수 있는 구종 수 " + selection.spare() + "  (변화구 " + selection.slots() + "칸)";
    BbPitchCatalog.BREAKING_ORDER.forEach((id, index) => {
      const chip = this.chips[index], locked = !selection.isUnlocked(id);
      chip.classList.toggle("on", selection.isOn(id));
      chip.classList.toggle("locked", locked);
      chip.disabled = locked || (!selection.isOn(id) && selection.spare() < 1);
    });
  }
}

class BbSheetDialog {
  private static readonly TABS: readonly string[] = ["투수", "타자"];
  private readonly screen: HTMLElement;
  private readonly tabs: HTMLButtonElement[];
  private readonly panes: HTMLElement[];
  private readonly pitcherPoints: BbAbilityPane;
  private readonly batterPoints: BbAbilityPane;
  private readonly pitcherHand: BbHandToggle;
  private readonly batterHand: BbHandToggle;
  private readonly chips: BbPitchChips;
  private profile: BbStoredProfile = BbProfileStore.blank();

  constructor(host: HTMLElement, private readonly onClose: (profile: BbStoredProfile) => void) {
    this.screen = BbHudParts.box("bb-sheet", host);
    const sheet = BbHudParts.box("bb-sheet-window", this.screen), head = BbHudParts.box("bb-sheet-head", sheet);
    BbHudParts.box("bb-sheet-title", head, "선수 정보 만들기");
    BbSheetParts.button("bb-sheet-close", head, "닫기", () => this.close());
    const tabRow = BbHudParts.box("bb-sheet-tabs", sheet);
    this.tabs = BbSheetDialog.TABS.map((label, index) => BbSheetParts.button("bb-sheet-tab", tabRow, label, () => this.turnTo(index)));
    this.panes = BbSheetDialog.TABS.map(() => BbHudParts.box("bb-sheet-pane", sheet));
    const [pitching, batting] = this.panes;
    this.pitcherHand = new BbHandToggle(pitching, ["우투", "좌투"], (hand) => { this.profile.pitchers.forEach((sheet) => { sheet.hand = hand; }); this.keep(); });
    this.pitcherPoints = new BbAbilityPane(pitching, BbAbilityAllocator.PITCHER, (points) => this.pitcherChanged(points));
    this.chips = new BbPitchChips(pitching, (pitches) => { this.profile.pitchers.forEach((sheet) => { sheet.pitches = pitches.slice(); }); this.keep(); });
    this.batterHand = new BbHandToggle(batting, ["우타", "좌타"], (hand) => { this.profile.lineup.forEach((sheet) => { sheet.hand = hand; }); this.keep(); });
    this.batterPoints = new BbAbilityPane(batting, BbAbilityAllocator.BATTER, (points) => { this.profile.lineup.forEach((sheet) => { sheet.abilities = { contact: points[0], power: points[1], speed: points[2], defense: points[3] }; }); this.keep(); });
    this.screen.addEventListener("pointerdown", (event) => { if (event.target === this.screen) this.close(); });
  }

  open(): void {
    this.profile = BbProfileStore.load();
    const pitcher = this.pitcher(), batter = this.batter();
    this.pitcherHand.load(pitcher.hand);
    this.pitcherPoints.load(BbProfileStore.pointsOf(BbAbilityAllocator.PITCHER, pitcher.abilities));
    this.chips.load(pitcher.abilities.breaking, pitcher.pitches);
    this.batterHand.load(batter.hand);
    this.batterPoints.load(BbProfileStore.pointsOf(BbAbilityAllocator.BATTER, batter.abilities));
    this.turnTo(0);
    this.screen.classList.add("open");
  }

  private close(): void {
    this.screen.classList.remove("open");
    this.onClose(this.profile);
  }

  private pitcher(): BbPitcherSheet { return this.profile.pitchers[0]; }
  private batter(): BbBatterSheet { return this.profile.lineup[0]; }
  private keep(): void { BbProfileStore.save(this.profile); }

  private pitcherChanged(points: readonly number[]): void {
    const pitches = this.chips.reshape(points[2]);
    this.profile.pitchers.forEach((sheet) => { sheet.abilities = { control: points[0], power: points[1], breaking: points[2], stamina: points[3] }; sheet.pitches = pitches.slice(); });
    this.keep();
  }

  private turnTo(shown: number): void {
    this.tabs.forEach((tab, index) => tab.classList.toggle("on", index === shown));
    this.panes.forEach((pane, index) => pane.classList.toggle("on", index === shown));
  }
}

interface BbMenuToggle {
  label: string;
  onFlip: (on: boolean) => void;
  on?: boolean;
}

interface BbMenuCycle {
  labels: readonly string[];
  index: number;
  onPick: (index: number) => void;
}

class BbGameMenu {
  private readonly panel: HTMLElement;

  shut(): void { this.panel.classList.remove("open"); }

  constructor(host: HTMLElement, toggles: readonly BbMenuToggle[], actions: ReadonlyArray<readonly [string, () => void]>, cycles: readonly BbMenuCycle[] = []) {
    const corner = BbHudParts.box("bb-menu", host);
    BbSheetParts.button("bb-menu-open", corner, "⋯", () => this.panel.classList.toggle("open"));
    this.panel = BbHudParts.box("bb-menu-panel", corner);
    toggles.forEach((toggle) => {
      const item = BbSheetParts.button("bb-menu-item", this.panel, toggle.label, () => toggle.onFlip(item.classList.toggle("on")));
      if (toggle.on) item.classList.add("on");
    });
    cycles.forEach((cycle) => {
      let index = cycle.index;
      const item = BbSheetParts.button("bb-menu-item", this.panel, cycle.labels[index], () => {
        index = (index + 1) % cycle.labels.length;
        item.textContent = cycle.labels[index];
        cycle.onPick(index);
      });
    });
    actions.forEach(([label, run]) => BbSheetParts.button("bb-menu-item", this.panel, label, () => { this.panel.classList.remove("open"); run(); }));
  }
}

class BbLabLobby {
  private readonly screen: HTMLElement;

  constructor(host: HTMLElement, title: string, onStart: () => void, onSheet: () => void) {
    this.screen = BbHudParts.box("bb-lobby open", host);
    const card = BbHudParts.box("bb-lobby-card", this.screen);
    BbHudParts.box("bb-lobby-title", card, title);
    BbSheetParts.button("bb-lobby-button main", card, "경기 시작", () => { this.screen.classList.remove("open"); onStart(); });
    BbSheetParts.button("bb-lobby-button", card, "선수 정보 만들기", onSheet);
  }
}
