interface BbRosterLooks {
  p: Array<CharacterLook | null>;
  b: Array<CharacterLook | null>;
}

interface BbStoredProfile {
  version: 3;
  lineup: BbBatterSheet[];
  pitchers: BbPitcherSheet[];
  looks: BbRosterLooks;
  ballpark: string;
}

interface BbRosterRowPlayer {
  a: number[];
  h: BbHand;
  l?: string;
}

interface BbRosterRowPitcher extends BbRosterRowPlayer {
  k: string;
}

interface BbRosterRowBatter extends BbRosterRowPlayer {
  o: BbLineupPosition;
}

interface BbRosterRow {
  v: 3;
  p: BbRosterRowPitcher[];
  b: BbRosterRowBatter[];
}

class BbRosterCodec {
  static readonly VERSION = 3;
  static readonly LOOK_LIMIT = 400;

  static toRow(profile: BbStoredProfile): BbRosterRow {
    const lookText = (look: CharacterLook | null | undefined) => look ? { l: JSON.stringify(look) } : {};
    return {
      v: 3,
      p: profile.pitchers.map((sheet, index) => ({ a: BbProfileStore.pointsOf(BbAbilityAllocator.PITCHER, sheet.abilities), h: sheet.hand, k: sheet.pitches.join(","), ...lookText(profile.looks.p[index]) })),
      b: profile.lineup.map((sheet, index) => ({ a: BbProfileStore.pointsOf(BbAbilityAllocator.BATTER, sheet.abilities), h: sheet.hand, o: sheet.position, ...lookText(profile.looks.b[index]) }))
    };
  }

  static fromRow(raw: unknown): BbStoredProfile | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Partial<BbRosterRow>, roles = BbRosterPlan.pitcherRoles();
    if (row.v !== BbRosterCodec.VERSION) return null;
    const pitchers = BbRosterCodec.listOf<BbRosterRowPitcher>(row.p), batters = BbRosterCodec.listOf<BbRosterRowBatter>(row.b);
    if (pitchers.length !== roles.length || batters.length !== BbRosterPlan.batterCount()) return null;
    const points = (entry: BbRosterRowPlayer) => BbRosterCodec.listOf<number>(entry && entry.a);
    const profile: BbStoredProfile = {
      version: 3, ballpark: "main",
      pitchers: pitchers.map((entry, index) => { const a = points(entry); return { abilities: { control: a[0], power: a[1], breaking: a[2], stamina: a[3] }, hand: entry.h, pitches: String(entry.k || "").split(",") as BbPitchId[], role: roles[index] }; }),
      lineup: batters.map((entry) => { const a = points(entry); return { abilities: { contact: a[0], power: a[1], speed: a[2], defense: a[3] }, hand: entry.h, position: entry.o }; }),
      looks: { p: pitchers.map((entry) => BbRosterCodec.lookOf(entry)), b: batters.map((entry) => BbRosterCodec.lookOf(entry)) }
    };
    return BbProfileStore.isSound(profile) ? profile : null;
  }

  static lookOf(entry: BbRosterRowPlayer | null | undefined): CharacterLook | null {
    if (!entry || typeof entry.l !== "string" || entry.l.length > BbRosterCodec.LOOK_LIMIT) return null;
    try { return CharacterLooks.clean(JSON.parse(entry.l)); } catch (error) { return null; }
  }

  static listOf<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    if (!value || typeof value !== "object") return [];
    const keyed = value as Record<string, T>;
    return Object.keys(keyed).filter((key) => /^[0-9]+$/.test(key)).sort((a, b) => Number(a) - Number(b)).map((key) => keyed[key]);
  }
}

class BbRosterAccount {
  static readonly PATH = "roster/baseballduel";
  static readonly USER_EVENT = "portal-user-changed";
  private sent = "";

  constructor(private readonly onPulled: (profile: BbStoredProfile) => void) {
    document.addEventListener(BbRosterAccount.USER_EVENT, () => { void this.pull(); });
  }

  async pull(): Promise<void> {
    const database = BbRosterAccount.database();
    if (!database) return;
    try {
      const remote = BbRosterCodec.fromRow(await database.read<unknown>(BbRosterAccount.PATH));
      if (!remote) { await this.push(BbProfileStore.load()); return; }
      this.sent = JSON.stringify(BbRosterCodec.toRow(remote));
      BbProfileStore.save(remote);
      this.onPulled(remote);
    } catch (error) {
      return;
    }
  }

  async push(profile: BbStoredProfile): Promise<void> {
    const database = BbRosterAccount.database(), row = BbRosterCodec.toRow(profile), text = JSON.stringify(row);
    if (!database || text === this.sent) return;
    try { await database.write(BbRosterAccount.PATH, row); this.sent = text; } catch (error) { return; }
  }

  private static database(): AccountDatabase | null {
    const user = window.PORTAL_USER;
    return user && typeof AccountDatabase === "function" ? new AccountDatabase(user) : null;
  }
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
    return { version: 3, ballpark: "main", lineup: team.lineup, pitchers: team.pitchers, looks: BbProfileStore.blankLooks() };
  }

  static blankLooks(): BbRosterLooks {
    return { p: BbRosterPlan.pitcherRoles().map(() => null), b: BbRosterPlan.BATTING_ORDER.map(() => null) };
  }

  static withLooks(profile: BbStoredProfile): BbStoredProfile {
    const looks = profile.looks, blank = BbProfileStore.blankLooks(), fit = (list: unknown, size: number) => Array.from({ length: size }, (_, index) => {
      const item = Array.isArray(list) ? list[index] : null;
      return item ? CharacterLooks.clean(item) : null;
    });
    profile.looks = { p: fit(looks ? looks.p : null, blank.p.length), b: fit(looks ? looks.b : null, blank.b.length) };
    return profile;
  }

  static looksOf(raw: unknown): BbRosterLooks {
    const source = raw && typeof raw === "object" ? raw as { p?: unknown; b?: unknown } : {}, blank = BbProfileStore.blankLooks();
    const fit = (list: unknown, size: number) => Array.from({ length: size }, (_, index) => {
      const item = list && typeof list === "object" ? (list as Record<string, unknown>)[index] : null;
      return item && typeof item === "object" ? CharacterLooks.clean(item) : null;
    });
    return { p: fit(source.p, blank.p.length), b: fit(source.b, blank.b.length) };
  }

  static pointsOf(plan: BbAbilityPlan, abilities: object): number[] {
    const values = abilities as Record<string, number>;
    return plan.items.map((item) => values[item.key]);
  }

  static load(): BbStoredProfile {
    try {
      const raw = localStorage.getItem(BbProfileStore.KEY), parsed = raw ? JSON.parse(raw) as Partial<BbStoredProfile> : null;
      if (parsed && BbProfileStore.isSound(parsed)) return BbProfileStore.withLooks(parsed as BbStoredProfile);
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
      pitchers: BbRosterPlan.pitcherRoles().map((role) => ({ abilities: { control: pit[0], power: pit[1], breaking: pit[2], stamina: rest(pit) }, hand: pitcher.hand, pitches: pitcher.pitches.slice(), role })),
      looks: BbProfileStore.blankLooks()
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

  static isSound(profile: Partial<BbStoredProfile>): boolean {
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
  private readonly rows: HTMLElement[] = [];
  private readonly notes: HTMLElement[] = [];
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
      this.notes.push(BbHudParts.box("bb-sheet-ability-effect", words, item.effect));
      const steps = BbHudParts.box("bb-sheet-steps", row);
      this.fills.push(BbHudParts.box("bb-card-fill", BbHudParts.box("bb-card-bar bb-sheet-bar", steps)));
      this.lowerers.push(BbSheetParts.button("bb-sheet-step", steps, "▼", () => this.step(index, false)));
      this.values.push(BbHudParts.box("bb-sheet-value", steps));
      this.raisers.push(BbSheetParts.button("bb-sheet-step", steps, "▲", () => this.step(index, true)));
      this.rows.push(row);
    });
    this.hint = BbHudParts.box("bb-sheet-hint", host);
  }

  dim(index: number, note: string | null): void {
    this.rows[index].classList.toggle("dim", !!note);
    this.notes[index].textContent = note || this.plan.items[index].effect;
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
    this.budget.textContent = "여분 " + spare + " / " + plan.total;
    this.budget.classList.toggle("left", spare > 0);
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

interface BbSheetFaces {
  portrait(look: CharacterLook): string | null;
  baseLook(): CharacterLook;
  editor(draft: EditableLook): ProfileEditor | null;
}

class BbStageFaces implements BbSheetFaces {
  private static readonly KIT_TEAM: 0 | 1 = 1;
  private readonly profile = new PlayerProfile();

  constructor(private readonly stage: BbStage) {}

  portrait(look: CharacterLook): string | null { return this.stage.portrait(look, BbStageFaces.KIT_TEAM); }
  baseLook(): CharacterLook { return this.profile.look; }
  editor(draft: EditableLook): ProfileEditor | null { return this.stage.lookEditor(draft); }
}

class BbPortraitQueue {
  private readonly waiting = new Map<HTMLImageElement, CharacterLook>();
  private busy = false;

  constructor(private readonly faces: BbSheetFaces) {}

  ask(image: HTMLImageElement, look: CharacterLook): void {
    this.waiting.set(image, look);
    if (!this.busy) this.next();
  }

  private next(): void {
    const first = this.waiting.entries().next();
    if (first.done) { this.busy = false; return; }
    this.busy = true;
    requestAnimationFrame(() => {
      const [image, look] = first.value;
      if (this.waiting.get(image) === look) {
        this.waiting.delete(image);
        const url = this.faces.portrait(look);
        image.hidden = !url;
        if (url) image.src = url;
      }
      this.next();
    });
  }
}

class BbPortraitButton {
  private readonly image: HTMLImageElement;

  constructor(host: HTMLElement, private readonly queue: BbPortraitQueue, onPress: () => void) {
    const button = BbSheetParts.button("bb-sheet-face", host, "", onPress);
    this.image = document.createElement("img");
    this.image.alt = "";
    this.image.hidden = true;
    button.appendChild(this.image);
    BbHudParts.box("bb-sheet-face-tag", button, "꾸미기");
  }

  show(look: CharacterLook): void { this.queue.ask(this.image, look); }
}

interface BbCardHooks {
  queue: BbPortraitQueue;
  look(index: number): CharacterLook;
  editLook(index: number): void;
  changed(): void;
}

class BbPitcherCard {
  private readonly face: BbPortraitButton;
  private readonly hand: BbHandToggle;
  private readonly points: BbAbilityPane;
  private readonly chips: BbPitchChips;
  private sheet: BbPitcherSheet | null = null;

  constructor(host: HTMLElement, role: BbPitcherRole, private readonly index: number, private readonly hooks: BbCardHooks) {
    const card = BbHudParts.box("bb-sheet-card pitcher", host);
    BbHudParts.box("bb-sheet-card-role", card, BbRosterPlan.roleLabel(role));
    this.face = new BbPortraitButton(card, hooks.queue, () => hooks.editLook(index));
    this.hand = new BbHandToggle(card, ["우투", "좌투"], (hand) => this.edit((sheet) => { sheet.hand = hand; }));
    this.points = new BbAbilityPane(card, BbAbilityAllocator.PITCHER, (points) => this.pointsChanged(points));
    this.chips = new BbPitchChips(card, (pitches) => this.edit((sheet) => { sheet.pitches = pitches.slice(); }));
  }

  load(sheet: BbPitcherSheet): void {
    this.sheet = sheet;
    this.hand.load(sheet.hand);
    this.points.load(BbProfileStore.pointsOf(BbAbilityAllocator.PITCHER, sheet.abilities));
    this.chips.load(sheet.abilities.breaking, sheet.pitches);
    this.dress();
  }

  dress(): void { this.face.show(this.hooks.look(this.index)); }

  private pointsChanged(points: readonly number[]): void {
    const pitches = this.chips.reshape(points[2]);
    this.edit((sheet) => { sheet.abilities = { control: points[0], power: points[1], breaking: points[2], stamina: points[3] }; sheet.pitches = pitches.slice(); });
  }

  private edit(change: (sheet: BbPitcherSheet) => void): void {
    if (!this.sheet) return;
    change(this.sheet);
    this.hooks.changed();
  }
}

class BbBatterCard {
  private static readonly DEFENSE_ROW = 3;
  private readonly position: HTMLButtonElement;
  private readonly face: BbPortraitButton;
  private readonly hand: BbHandToggle;
  private readonly points: BbAbilityPane;
  private sheet: BbBatterSheet | null = null;

  constructor(host: HTMLElement, private readonly index: number, private readonly hooks: BbCardHooks, pickPosition: (index: number) => void) {
    const card = BbHudParts.box("bb-sheet-card batter", host), top = BbHudParts.box("bb-sheet-card-top", card);
    BbHudParts.box("bb-sheet-order", top, String(index + 1));
    this.position = BbSheetParts.button("bb-sheet-position", top, "", () => pickPosition(index));
    this.face = new BbPortraitButton(card, hooks.queue, () => hooks.editLook(index));
    this.hand = new BbHandToggle(card, ["우타", "좌타"], (hand) => this.edit((sheet) => { sheet.hand = hand; }));
    this.points = new BbAbilityPane(card, BbAbilityAllocator.BATTER, (points) => this.edit((sheet) => { sheet.abilities = { contact: points[0], power: points[1], speed: points[2], defense: points[3] }; }));
  }

  load(sheet: BbBatterSheet): void {
    this.sheet = sheet;
    this.hand.load(sheet.hand);
    this.points.load(BbProfileStore.pointsOf(BbAbilityAllocator.BATTER, sheet.abilities));
    this.placed();
    this.dress();
  }

  placed(): void {
    const position = this.sheet ? this.sheet.position : BbRosterPlan.DESIGNATED;
    this.position.textContent = BbRosterPlan.positionLabel(position);
    this.points.dim(BbBatterCard.DEFENSE_ROW, position === BbRosterPlan.DESIGNATED ? "지명타자는 수비 안 함" : null);
  }

  dress(): void { this.face.show(this.hooks.look(this.index)); }

  private edit(change: (sheet: BbBatterSheet) => void): void {
    if (!this.sheet) return;
    change(this.sheet);
    this.hooks.changed();
  }
}

class BbPositionPicker {
  private static readonly SPOTS: Readonly<Record<BbLineupPosition, readonly [number, number]>> = {
    C: [50, 90], "1B": [71, 58], "2B": [61, 41], SS: [39, 41], "3B": [29, 58], LF: [20, 24], CF: [50, 11], RF: [80, 24], DH: [12, 88]
  };
  private static readonly FIELD_SVG =
    "<svg class='bb-pos-field' viewBox='0 0 520 420' aria-hidden='true'>" +
    "<path d='M260 360 L18 118 A342 342 0 0 1 502 118 Z' fill='#3f7a45'/>" +
    "<path d='M260 360 L150 250 L260 140 L370 250 Z' fill='#b98a5a'/>" +
    "<path d='M260 330 L180 250 L260 170 L340 250 Z' fill='#4c8b50'/>" +
    "<g fill='#f4f1e8'><rect x='253' y='133' width='14' height='14' transform='rotate(45 260 140)'/><rect x='143' y='243' width='14' height='14' transform='rotate(45 150 250)'/>" +
    "<rect x='363' y='243' width='14' height='14' transform='rotate(45 370 250)'/><path d='M252 352 h16 v8 l-8 8 l-8 -8 Z'/></g>" +
    "<circle cx='260' cy='250' r='12' fill='#c79a68'/></svg>";

  private readonly screen: HTMLElement;
  private readonly title: HTMLElement;
  private readonly buttons = new Map<BbLineupPosition, HTMLButtonElement>();
  private lineup: BbBatterSheet[] = [];
  private index = 0;
  private onPick: () => void = () => undefined;

  constructor(host: HTMLElement) {
    this.screen = BbHudParts.box("bb-pos", host);
    const box = BbHudParts.box("bb-pos-window", this.screen), head = BbHudParts.box("bb-pos-head", box);
    this.title = BbHudParts.box("bb-pos-title", head);
    BbSheetParts.button("bb-sheet-close", head, "닫기", () => this.close());
    const field = BbHudParts.box("bb-pos-map", box);
    field.innerHTML = BbPositionPicker.FIELD_SVG;
    BbRosterPlan.BATTING_ORDER.forEach((position) => {
      const [x, y] = BbPositionPicker.SPOTS[position], button = BbSheetParts.button("bb-pos-spot", field, "", () => this.pick(position));
      button.style.left = x + "%";
      button.style.top = y + "%";
      this.buttons.set(position, button);
    });
    this.screen.addEventListener("pointerdown", (event) => { if (event.target === this.screen) this.close(); });
  }

  get isOpen(): boolean { return this.screen.classList.contains("open"); }

  open(lineup: BbBatterSheet[], index: number, onPick: () => void): void {
    this.lineup = lineup;
    this.index = index;
    this.onPick = onPick;
    this.draw();
    this.screen.classList.add("open");
  }

  close(): void { this.screen.classList.remove("open"); }

  private pick(position: BbLineupPosition): void {
    BbRosterPlan.swapPosition(this.lineup, this.index, position);
    this.onPick();
    this.close();
  }

  private draw(): void {
    const mover = this.lineup[this.index];
    this.title.textContent = (this.index + 1) + "번 타자 포지션 바꾸기";
    this.buttons.forEach((button, position) => {
      const holder = this.lineup.findIndex((sheet) => sheet.position === position);
      button.innerHTML = "";
      BbHudParts.box("bb-pos-name", button, BbRosterPlan.positionLabel(position));
      BbHudParts.box("bb-pos-order", button, holder >= 0 ? (holder + 1) + "번" : "");
      button.classList.toggle("on", !!mover && mover.position === position);
    });
  }
}

class BbLookEditor {
  private readonly modal: HTMLElement;
  private readonly host: HTMLElement;
  private readonly note: HTMLElement;
  private readonly draft = new LookDraft(CharacterLooks.createDefault());
  private editor: ProfileEditor | null = null;
  private onDone: (look: CharacterLook | null) => void = () => undefined;
  private reset = false;

  constructor(private readonly faces: BbSheetFaces) {
    this.modal = document.createElement("div");
    this.modal.className = "st-screen maker-modal bb-look";
    this.modal.hidden = true;
    const wrap = BbHudParts.box("st-wrap", this.modal), card = BbHudParts.box("st-card", wrap), head = BbHudParts.box("maker-head", card);
    const title = document.createElement("h2");
    title.textContent = "선수 외형 꾸미기";
    head.appendChild(title);
    BbSheetParts.button("st-btn maker-save", head, "완료", () => this.finish());
    this.host = BbHudParts.box("maker-host", card);
    BbSheetParts.button("st-btn bb-look-reset", card, "내 캐릭터 모습으로 되돌리기", () => { this.reset = true; this.finish(); });
    this.note = BbHudParts.box("st-hint maker-note", card, "이 선수에게만 쓰이는 모습이에요. 비워 두면 내 캐릭터 모습을 써요.");
    document.body.appendChild(this.modal);
  }

  get isOpen(): boolean { return !this.modal.hidden; }

  open(look: CharacterLook, onDone: (look: CharacterLook | null) => void): void {
    this.onDone = onDone;
    this.reset = false;
    this.draft.setLook(look);
    if (!this.editor) {
      this.editor = this.faces.editor(this.draft);
      if (this.editor) this.editor.mount(this.host);
    }
    if (!this.editor) { this.note.textContent = "경기장을 불러온 다음에 꾸밀 수 있어요."; this.modal.hidden = false; return; }
    this.editor.refreshFromProfile();
    this.modal.hidden = false;
    this.editor.setActive(true);
  }

  finish(): void {
    if (this.modal.hidden) return;
    this.modal.hidden = true;
    if (this.editor) this.editor.setActive(false);
    if (this.editor) this.onDone(this.reset ? null : this.draft.look);
  }
}

class BbSheetDialog {
  private static readonly TABS: readonly string[] = ["투수", "타자"];
  private readonly screen: HTMLElement;
  private readonly note: HTMLElement;
  private readonly tabs: HTMLButtonElement[];
  private readonly panes: HTMLElement[];
  private readonly pitcherCards: BbPitcherCard[];
  private readonly batterCards: BbBatterCard[];
  private readonly picker: BbPositionPicker;
  private readonly looks: BbLookEditor;
  private profile: BbStoredProfile = BbProfileStore.blank();
  private shown = 0;

  constructor(host: HTMLElement, private readonly faces: BbSheetFaces, private readonly onClose: (profile: BbStoredProfile) => void) {
    this.screen = BbHudParts.box("bb-sheet", host);
    const sheet = BbHudParts.box("bb-sheet-window", this.screen), head = BbHudParts.box("bb-sheet-head", sheet);
    BbHudParts.box("bb-sheet-title", head, "선수 정보 만들기");
    const tabRow = BbHudParts.box("bb-sheet-tabs", head);
    this.tabs = BbSheetDialog.TABS.map((label, index) => BbSheetParts.button("bb-sheet-tab", tabRow, label, () => this.turnTo(index)));
    this.note = BbHudParts.box("bb-sheet-note", head);
    BbSheetParts.button("bb-sheet-close", head, "닫기", () => this.close());
    this.panes = BbSheetDialog.TABS.map((_, index) => BbHudParts.box("bb-sheet-pane " + (index === 0 ? "pitchers" : "batters"), sheet));
    const queue = new BbPortraitQueue(faces);
    const hooks = (kind: "p" | "b"): BbCardHooks => ({ queue, look: (index) => this.lookOf(kind, index), editLook: (index) => this.editLook(kind, index), changed: () => this.changed() });
    this.pitcherCards = BbRosterPlan.pitcherRoles().map((role, index) => new BbPitcherCard(this.panes[0], role, index, hooks("p")));
    this.batterCards = BbRosterPlan.BATTING_ORDER.map((_, index) => new BbBatterCard(this.panes[1], index, hooks("b"), (at) => this.pickPosition(at)));
    this.picker = new BbPositionPicker(this.screen);
    this.looks = new BbLookEditor(faces);
    this.screen.addEventListener("pointerdown", (event) => { if (event.target === this.screen) this.close(); });
    document.addEventListener("keydown", (event) => this.escape(event));
  }

  get isOpen(): boolean { return this.screen.classList.contains("open"); }

  open(): void {
    this.profile = BbProfileStore.load();
    this.profile.pitchers.forEach((sheet, index) => this.pitcherCards[index].load(sheet));
    this.profile.lineup.forEach((sheet, index) => this.batterCards[index].load(sheet));
    this.turnTo(this.shown);
    this.drawNote();
    this.screen.classList.add("open");
  }

  shut(): void {
    if (!this.isOpen) return;
    this.picker.close();
    this.looks.finish();
    this.close();
  }

  private close(): void {
    if (!this.isOpen) return;
    this.screen.classList.remove("open");
    this.onClose(this.profile);
  }

  private escape(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    if (this.looks.isOpen) this.looks.finish();
    else if (this.picker.isOpen) this.picker.close();
    else this.close();
  }

  private lookOf(kind: "p" | "b", index: number): CharacterLook { return this.profile.looks[kind][index] || this.faces.baseLook(); }

  private editLook(kind: "p" | "b", index: number): void {
    this.looks.open(this.lookOf(kind, index), (look) => {
      this.profile.looks[kind][index] = look && !BbWardrobe.sameLook(CharacterLooks.clean(look), CharacterLooks.clean(this.faces.baseLook())) ? CharacterLooks.clean(look) : null;
      (kind === "p" ? this.pitcherCards : this.batterCards)[index].dress();
      this.changed();
    });
  }

  private pickPosition(index: number): void {
    this.picker.open(this.profile.lineup, index, () => {
      this.batterCards.forEach((card) => card.placed());
      this.changed();
    });
  }

  private changed(): void {
    BbProfileStore.save(this.profile);
    this.drawNote();
  }

  private drawNote(): void {
    const spare = (plan: BbAbilityPlan, list: readonly object[]) => list.filter((sheet) => BbProfileStore.pointsOf(plan, (sheet as { abilities: object }).abilities).reduce((sum, value) => sum + value, 0) < plan.total).length;
    const left = this.shown === 0 ? spare(BbAbilityAllocator.PITCHER, this.profile.pitchers) : spare(BbAbilityAllocator.BATTER, this.profile.lineup);
    const plan = this.shown === 0 ? BbAbilityAllocator.PITCHER : BbAbilityAllocator.BATTER;
    this.note.textContent = "선수마다 " + plan.total + "포인트 · 능력치 " + plan.least + "~" + plan.most + (left ? " · 포인트가 남은 선수 " + left + "명" : "");
    this.note.classList.toggle("left", left > 0);
  }

  private turnTo(shown: number): void {
    this.shown = shown;
    this.tabs.forEach((tab, index) => tab.classList.toggle("on", index === shown));
    this.panes.forEach((pane, index) => pane.classList.toggle("on", index === shown));
    this.drawNote();
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
