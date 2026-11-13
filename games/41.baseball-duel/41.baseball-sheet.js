"use strict";
class BbProfileStore {
    static blank() {
        const even = BbAbilityAllocator.PITCHER.total / BbAbilityAllocator.PITCHER.items.length;
        return {
            version: 2, ballpark: "main",
            lineup: [{ abilities: { contact: even, power: even, speed: even }, hand: "R" }],
            pitchers: [{ abilities: { control: even, power: even, breaking: even }, hand: "R", pitches: new BbPitchSelection(even).usable(), role: "starter" }]
        };
    }
    static pointsOf(plan, abilities) {
        const values = abilities;
        return plan.items.map((item) => values[item.key]);
    }
    static load() {
        try {
            const raw = localStorage.getItem(BbProfileStore.KEY), parsed = raw ? JSON.parse(raw) : null;
            if (parsed && BbProfileStore.isSound(parsed))
                return parsed;
        }
        catch (error) {
            return BbProfileStore.blank();
        }
        return BbProfileStore.blank();
    }
    static teamOf(sheet) {
        const blank = BbProfileStore.blank(), candidate = { version: 2, lineup: sheet ? sheet.lineup : undefined, pitchers: sheet ? sheet.pitchers : undefined };
        const sound = BbProfileStore.isSound(candidate) ? candidate : blank;
        return { lineup: sound.lineup.slice(0, 1), pitchers: sound.pitchers.slice(0, 1) };
    }
    static save(profile) {
        try {
            localStorage.setItem(BbProfileStore.KEY, JSON.stringify(profile));
        }
        catch (error) {
            return;
        }
    }
    static isSound(profile) {
        const lineup = profile.lineup, pitchers = profile.pitchers;
        if (profile.version !== 2 || !Array.isArray(lineup) || !Array.isArray(pitchers) || !lineup.length || !pitchers.length)
            return false;
        const handed = (sheet) => !!sheet && !!sheet.abilities && BbProfileStore.HANDS.indexOf(sheet.hand) >= 0;
        if (!lineup.every((sheet) => handed(sheet) && BbAbilityAllocator.isValid(BbAbilityAllocator.BATTER, BbProfileStore.pointsOf(BbAbilityAllocator.BATTER, sheet.abilities))))
            return false;
        return pitchers.every((sheet) => {
            if (!handed(sheet) || !BbAbilityAllocator.isValid(BbAbilityAllocator.PITCHER, BbProfileStore.pointsOf(BbAbilityAllocator.PITCHER, sheet.abilities)) || !Array.isArray(sheet.pitches))
                return false;
            const allowed = new BbPitchSelection(sheet.abilities.breaking, sheet.pitches.filter((id) => id !== "ft")).usable();
            return sheet.pitches.length === allowed.length && sheet.pitches.every((id) => allowed.indexOf(id) >= 0);
        });
    }
}
BbProfileStore.KEY = "baseballduel_profile_v2";
BbProfileStore.HANDS = ["R", "L"];
class BbSheetParts {
    static button(className, parent, text, onPress) {
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
    constructor(host, plan, onChange) {
        this.plan = plan;
        this.onChange = onChange;
        this.values = [];
        this.fills = [];
        this.raisers = [];
        this.lowerers = [];
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
    load(points) {
        this.allocator = new BbAbilityAllocator(this.plan, points);
        this.draw();
    }
    step(index, up) {
        if (!(up ? this.allocator.raise(index) : this.allocator.lower(index)))
            return;
        this.draw();
        this.onChange(this.allocator.points);
    }
    draw() {
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
    constructor(host, labels, onChange) {
        this.onChange = onChange;
        const row = BbHudParts.box("bb-sheet-hands", host);
        this.buttons = BbHandToggle.HANDS.map((hand, index) => BbSheetParts.button("bb-sheet-hand", row, labels[index], () => { this.load(hand); this.onChange(hand); }));
    }
    load(hand) { this.buttons.forEach((button, index) => button.classList.toggle("on", BbHandToggle.HANDS[index] === hand)); }
}
BbHandToggle.HANDS = ["R", "L"];
class BbPitchChips {
    constructor(host, onChange) {
        this.onChange = onChange;
        this.selection = new BbPitchSelection(1);
        this.count = BbHudParts.box("bb-sheet-chip-count", host);
        const row = BbHudParts.box("bb-sheet-chips", host);
        BbHudParts.box("bb-sheet-chip fixed", row, BbPitchCatalog.of("ft").label);
        this.chips = BbPitchCatalog.BREAKING_ORDER.map((id) => BbSheetParts.button("bb-sheet-chip", row, BbPitchCatalog.of(id).label, () => this.press(id)));
    }
    load(breaking, pitches) {
        this.selection = new BbPitchSelection(breaking, pitches.filter((id) => id !== "ft"));
        this.draw();
    }
    reshape(breaking) {
        this.selection.setBreaking(breaking);
        this.draw();
        return this.selection.usable();
    }
    press(id) {
        if (!this.selection.toggle(id))
            return;
        this.draw();
        this.onChange(this.selection.usable());
    }
    draw() {
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
    constructor(host, onClose) {
        this.onClose = onClose;
        this.profile = BbProfileStore.blank();
        this.screen = BbHudParts.box("bb-sheet", host);
        const sheet = BbHudParts.box("bb-sheet-window", this.screen), head = BbHudParts.box("bb-sheet-head", sheet);
        BbHudParts.box("bb-sheet-title", head, "선수 정보 만들기");
        BbSheetParts.button("bb-sheet-close", head, "닫기", () => this.close());
        const tabRow = BbHudParts.box("bb-sheet-tabs", sheet);
        this.tabs = BbSheetDialog.TABS.map((label, index) => BbSheetParts.button("bb-sheet-tab", tabRow, label, () => this.turnTo(index)));
        this.panes = BbSheetDialog.TABS.map(() => BbHudParts.box("bb-sheet-pane", sheet));
        const [pitching, batting] = this.panes;
        this.pitcherHand = new BbHandToggle(pitching, ["우투", "좌투"], (hand) => { this.pitcher().hand = hand; this.keep(); });
        this.pitcherPoints = new BbAbilityPane(pitching, BbAbilityAllocator.PITCHER, (points) => this.pitcherChanged(points));
        this.chips = new BbPitchChips(pitching, (pitches) => { this.pitcher().pitches = pitches; this.keep(); });
        this.batterHand = new BbHandToggle(batting, ["우타", "좌타"], (hand) => { this.batter().hand = hand; this.keep(); });
        this.batterPoints = new BbAbilityPane(batting, BbAbilityAllocator.BATTER, (points) => { this.batter().abilities = { contact: points[0], power: points[1], speed: points[2] }; this.keep(); });
        this.screen.addEventListener("pointerdown", (event) => { if (event.target === this.screen)
            this.close(); });
    }
    open() {
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
    close() {
        this.screen.classList.remove("open");
        this.onClose(this.profile);
    }
    pitcher() { return this.profile.pitchers[0]; }
    batter() { return this.profile.lineup[0]; }
    keep() { BbProfileStore.save(this.profile); }
    pitcherChanged(points) {
        const pitcher = this.pitcher();
        pitcher.abilities = { control: points[0], power: points[1], breaking: points[2] };
        pitcher.pitches = this.chips.reshape(points[2]);
        this.keep();
    }
    turnTo(shown) {
        this.tabs.forEach((tab, index) => tab.classList.toggle("on", index === shown));
        this.panes.forEach((pane, index) => pane.classList.toggle("on", index === shown));
    }
}
BbSheetDialog.TABS = ["투수", "타자"];
class BbGameMenu {
    shut() { this.panel.classList.remove("open"); }
    constructor(host, toggles, actions, cycles = []) {
        const corner = BbHudParts.box("bb-menu", host);
        BbSheetParts.button("bb-menu-open", corner, "⋯", () => this.panel.classList.toggle("open"));
        this.panel = BbHudParts.box("bb-menu-panel", corner);
        toggles.forEach((toggle) => {
            const item = BbSheetParts.button("bb-menu-item", this.panel, toggle.label, () => toggle.onFlip(item.classList.toggle("on")));
            if (toggle.on)
                item.classList.add("on");
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
    constructor(host, title, onStart, onSheet) {
        this.screen = BbHudParts.box("bb-lobby open", host);
        const card = BbHudParts.box("bb-lobby-card", this.screen);
        BbHudParts.box("bb-lobby-title", card, title);
        BbSheetParts.button("bb-lobby-button main", card, "경기 시작", () => { this.screen.classList.remove("open"); onStart(); });
        BbSheetParts.button("bb-lobby-button", card, "선수 정보 만들기", onSheet);
    }
}
