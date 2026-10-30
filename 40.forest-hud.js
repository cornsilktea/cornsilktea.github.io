"use strict";
class FrDom {
    static el(id) {
        const node = document.getElementById(id);
        if (!node)
            throw new Error("화면 요소를 찾지 못했어요: " + id);
        return node;
    }
    static make(tag, className = "", text = "") {
        const node = document.createElement(tag);
        if (className)
            node.className = className;
        if (text)
            node.textContent = text;
        return node;
    }
    static clear(node) { while (node.firstChild)
        node.removeChild(node.firstChild); }
}
class FrToast {
    constructor(box) {
        this.box = box;
        this.timer = 0;
    }
    show(text, milliseconds = 2200) {
        this.box.textContent = text;
        this.box.hidden = false;
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => { this.box.hidden = true; }, milliseconds);
    }
}
class FrItemCell {
    static render(id, count, uses) {
        const cell = FrDom.make("div", "fr-cell");
        cell.style.borderColor = FrItemNames.GRADE_COLORS[FrItemNames.grade(id)];
        cell.appendChild(FrIcons.image(id, 38));
        if (count > 1)
            cell.appendChild(FrDom.make("div", "fr-cell-count", String(count)));
        const total = FrItems.durabilityOf(id);
        if (total > 0) {
            const bar = FrDom.make("div", "fr-cell-bar");
            const fill = FrDom.make("div", uses <= 10 ? "fr-cell-fill low" : "fr-cell-fill");
            fill.style.width = Math.max(0, Math.min(100, (uses / total) * 100)) + "%";
            bar.appendChild(fill);
            cell.appendChild(bar);
        }
        cell.title = FrItemNames.label(id);
        return cell;
    }
}
class FrWindow {
    constructor(title, session, toast) {
        this.session = session;
        this.toast = toast;
        this.opened = false;
        this.root = FrDom.make("div", "fr-win");
        this.root.hidden = true;
        const head = FrDom.make("div", "fr-win-head");
        head.appendChild(FrDom.make("b", "", title));
        const close = FrDom.make("button", "fr-win-close", "✕");
        close.type = "button";
        close.addEventListener("click", () => this.close());
        head.appendChild(close);
        this.body = FrDom.make("div", "fr-win-body");
        this.root.append(head, this.body);
        document.body.appendChild(this.root);
        session.onChange(() => { if (this.opened)
            this.render(); });
    }
    get isOpen() { return this.opened; }
    open() { this.opened = true; this.root.hidden = false; this.render(); }
    close() { this.opened = false; this.root.hidden = true; }
    button(label, action, enabled = true) {
        const button = FrDom.make("button", "fr-btn", label);
        button.type = "button";
        button.disabled = !enabled;
        button.addEventListener("click", action);
        return button;
    }
    needLine(id, have, need) {
        const line = FrDom.make("div", have >= need ? "fr-need ok" : "fr-need lack");
        line.title = FrItemNames.label(id);
        line.append(FrIcons.image(id, 22), FrDom.make("span", "", " " + have + " / " + need));
        return line;
    }
}
class FrBagWindow extends FrWindow {
    constructor(session, toast) {
        super("가방", session, toast);
        this.selected = -1;
    }
    render() {
        FrDom.clear(this.body);
        const grid = FrDom.make("div", "fr-grid");
        for (let i = 0; i < FrBalance.BAG_SLOTS; i++) {
            const slot = this.session.bag.slots[i];
            const cell = slot ? FrItemCell.render(slot.id, slot.count, slot.uses) : FrDom.make("div", "fr-cell empty");
            if (i === this.selected)
                cell.classList.add("selected");
            if (i < FrBalance.HOTBAR_SLOTS)
                cell.classList.add("hot");
            cell.addEventListener("click", () => { this.selected = i; this.render(); });
            grid.appendChild(cell);
        }
        this.body.appendChild(grid);
        this.body.appendChild(FrDom.make("div", "fr-note", "앞 8칸(굵은 테두리)이 아래 핫바예요. 숫자 1~8 로 먹을 수 있어요."));
        const slot = this.session.bag.slots[this.selected];
        if (!slot)
            return;
        const detail = FrDom.make("div", "fr-detail");
        detail.appendChild(FrDom.make("b", "", FrItemNames.label(slot.id) + (slot.count > 1 ? " × " + slot.count : "")));
        const total = FrItems.durabilityOf(slot.id);
        if (total > 0)
            detail.appendChild(FrDom.make("div", "", "내구도 " + slot.uses + " / " + total));
        const row = FrDom.make("div", "fr-row");
        if (FrFoodRules.canEat(slot.id))
            row.appendChild(this.button("먹기", () => this.eat(slot.id), this.session.ap.current < this.session.ap.max()));
        row.appendChild(this.button("1개 버리기", () => this.discard(slot.id, 1)));
        if (slot.count > 1)
            row.appendChild(this.button("전부 버리기", () => this.discard(slot.id, slot.count)));
        detail.appendChild(row);
        this.body.appendChild(detail);
    }
    eat(id) { this.toast.show(this.session.eat(id) ? "냠냠! 행동력이 찼어요" : "지금은 먹을 수 없어요"); }
    discard(id, count) { this.session.bag.take(id, count); this.selected = -1; this.session.changed(); }
}
class FrChestWindow extends FrWindow {
    constructor(session, toast) { super("공용 창고", session, toast); }
    render() {
        FrDom.clear(this.body);
        const columns = FrDom.make("div", "fr-cols");
        columns.append(this.bagColumn(), this.storeColumn(), this.logColumn());
        this.body.appendChild(columns);
        const used = this.session.world.publicStore.slotsUsed();
        this.body.appendChild(FrDom.make("div", "fr-note", "창고 " + used + " / " + FrBalance.PUBLIC_SLOTS + "칸 · 재료만 넣을 수 있어요 (장비·반지 제외)"));
    }
    bagColumn() {
        const column = FrDom.make("div", "fr-col");
        column.appendChild(FrDom.make("h3", "", "내 가방"));
        const totals = new Map();
        this.session.bag.slots.forEach((s) => { if (FrItems.isStackable(s.id))
            totals.set(s.id, (totals.get(s.id) || 0) + s.count); });
        if (totals.size === 0)
            column.appendChild(FrDom.make("div", "fr-note", "넣을 재료가 없어요"));
        totals.forEach((count, id) => {
            const row = FrDom.make("div", "fr-line");
            row.append(FrIcons.image(id, 28), FrDom.make("span", "", String(count)));
            [1, 10, count].filter((n, i, list) => n <= count && list.indexOf(n) === i).forEach((n) => row.appendChild(this.button(n === count && n > 10 ? "전부" : "+" + n, () => void this.move(id, n, true))));
            column.appendChild(row);
        });
        return column;
    }
    storeColumn() {
        const column = FrDom.make("div", "fr-col");
        column.appendChild(FrDom.make("h3", "", "창고"));
        const amounts = this.session.world.publicStore.amountsSnapshot();
        const ids = Object.keys(amounts);
        if (ids.length === 0)
            column.appendChild(FrDom.make("div", "fr-note", "창고가 비어 있어요"));
        ids.forEach((id) => {
            const row = FrDom.make("div", "fr-line");
            row.append(FrIcons.image(id, 28), FrDom.make("span", "", String(amounts[id])));
            [1, 10, amounts[id]].filter((n, i, list) => n <= amounts[id] && list.indexOf(n) === i).forEach((n) => row.appendChild(this.button(n === amounts[id] && n > 10 ? "전부" : "-" + n, () => void this.move(id, n, false))));
            column.appendChild(row);
        });
        return column;
    }
    logColumn() {
        const column = FrDom.make("div", "fr-col log");
        column.appendChild(FrDom.make("h3", "", "기록"));
        this.session.world.publicStore.log.slice(0, 40).forEach((line) => {
            const time = new Date(line.at);
            const stamp = (time.getHours() < 10 ? "0" : "") + time.getHours() + ":" + (time.getMinutes() < 10 ? "0" : "") + time.getMinutes();
            const verb = line.verb === "put" ? "넣음" : line.verb === "take" ? "꺼냄" : line.verb === "build" ? "건설에 씀" : "운영자 지급";
            column.appendChild(FrDom.make("div", line.verb === "take" ? "fr-log take" : "fr-log", stamp + " " + line.who + " " + verb + " " + FrItemNames.label(line.item) + " ×" + line.count));
        });
        return column;
    }
    async move(id, count, intoStore) {
        if (intoStore) {
            if (this.session.bag.count(id) < count)
                return;
            if (!(await this.session.world.putPublic(id, count, this.session.nick))) {
                this.toast.show("창고에 더 넣을 수 없어요");
                return;
            }
            this.session.bag.take(id, count);
        }
        else {
            if (this.session.bag.freeSlots() < 1 && this.session.bag.count(id) % FrBalance.STACK_SIZE === 0) {
                this.toast.show("가방이 가득 찼어요");
                return;
            }
            if (!(await this.session.world.takePublic(id, count, this.session.nick))) {
                this.toast.show("창고에 그만큼 없어요");
                this.render();
                return;
            }
            this.session.gain(id, count);
        }
        this.session.changed();
    }
}
class FrCraftWindow extends FrWindow {
    constructor(session, toast) { super("작업대", session, toast); }
    render() {
        FrDom.clear(this.body);
        const source = this.session.craftSource();
        this.body.appendChild(FrDom.make("div", "fr-note", "재료는 가방 → 공용 창고 순으로 써요."));
        const list = FrDom.make("div", "fr-list");
        FrCraftMenu.options().forEach((option) => {
            const row = FrDom.make("div", "fr-recipe");
            const head = FrDom.make("div", "fr-head");
            head.append(FrIcons.image(option.output, 34), FrDom.make("b", "", option.label));
            row.appendChild(head);
            Object.keys(option.cost).forEach((id) => row.appendChild(this.needLine(id, source.total(id), option.cost[id])));
            row.appendChild(this.button("만들기", () => this.make(option), source.canPay(option.cost)));
            list.appendChild(row);
        });
        this.body.appendChild(list);
    }
    make(option) {
        this.toast.show(this.session.craft(option) ? FrItemNames.label(option.output) + " 완성!" : "만들 수 없어요");
    }
}
class FrCookWindow extends FrWindow {
    constructor(session, toast) { super("모닥불 요리", session, toast); }
    render() {
        FrDom.clear(this.body);
        const source = this.session.craftSource();
        const list = FrDom.make("div", "fr-list");
        FrCatalog.RECIPES.filter((r) => r.station === "campfire").forEach((recipe) => {
            const row = FrDom.make("div", "fr-recipe");
            if (!FrRecipeRules.unlocked(recipe, this.session.seen)) {
                row.appendChild(FrDom.make("b", "", "★" + recipe.star + " ? ? ?"));
                row.appendChild(FrDom.make("div", "fr-note", "재료를 한 번 얻으면 열려요"));
                list.appendChild(row);
                return;
            }
            const head = FrDom.make("div", "fr-head");
            head.append(FrIcons.image(recipe.id, 34), FrDom.make("b", "", "★" + recipe.star + " " + recipe.name + (this.session.seen.has(recipe.id) ? "" : "  NEW")));
            row.appendChild(head);
            const plan = FrRecipeRules.resolve(recipe, source);
            recipe.ingredients.forEach((ingredient) => {
                const label = ingredient.item ? FrItemNames.label(ingredient.item) : ingredient.group === "fruit" ? "과일" : ingredient.group === "fish_common" ? "일반 물고기" : ingredient.group === "fish_rare" ? "희귀 물고기" : "전설 물고기";
                const have = ingredient.item ? source.total(ingredient.item) : FrCatalog.groupMembers(ingredient.group).reduce((s, id) => s + source.total(id), 0);
                const line = FrDom.make("div", have >= ingredient.count ? "fr-need ok" : "fr-need lack");
                line.title = label;
                line.append(ingredient.item ? FrIcons.image(ingredient.item, 22) : FrDom.make("span", "", label), FrDom.make("span", "", " " + have + " / " + ingredient.count));
                row.appendChild(line);
            });
            row.appendChild(FrDom.make("div", "fr-note", "먹으면 행동력 +" + FrFoodRules.islandGain(recipe.star)));
            row.appendChild(this.button("요리", () => this.cook(recipe), plan.missing.length === 0));
            list.appendChild(row);
        });
        this.body.appendChild(list);
    }
    cook(recipe) {
        this.toast.show(this.session.cook(recipe).ok ? recipe.name + " 완성!" : "재료가 모자라요");
    }
}
class FrBuildWindow extends FrWindow {
    constructor(session, toast) {
        super("건설", session, toast);
        this.def = null;
    }
    openFor(def) { this.def = def; this.open(); }
    render() {
        FrDom.clear(this.body);
        const def = this.def;
        if (!def)
            return;
        this.body.appendChild(FrDom.make("h3", "", def.name));
        this.body.appendChild(FrDom.make("div", "fr-note", "건설은 공용 창고의 재료만 써요. 가방에 있는 재료는 창고로 넣을 수 있어요."));
        const store = this.session.world.publicStore;
        let enough = true;
        Object.keys(def.cost).forEach((id) => {
            const row = FrDom.make("div", "fr-line");
            const have = store.count(id);
            if (have < def.cost[id])
                enough = false;
            row.appendChild(this.needLine(id, have, def.cost[id]));
            row.appendChild(FrDom.make("span", "fr-note", "가방 " + this.session.bag.count(id)));
            this.body.appendChild(row);
        });
        const actions = FrDom.make("div", "fr-row");
        actions.appendChild(this.button("가방에서 넣기", () => void this.fill(def)));
        actions.appendChild(this.button("짓기", () => void this.build(def), enough));
        this.body.appendChild(actions);
    }
    async fill(def) {
        for (const id of Object.keys(def.cost)) {
            const lacking = def.cost[id] - this.session.world.publicStore.count(id);
            const give = Math.min(lacking, this.session.bag.count(id));
            if (give <= 0)
                continue;
            if (await this.session.world.putPublic(id, give, this.session.nick))
                this.session.bag.take(id, give);
        }
        this.session.changed();
    }
    async build(def) {
        if (await this.session.world.build(def, this.session.nick)) {
            this.toast.show(def.name + "이(가) 지어졌어요!");
            this.close();
        }
        else
            this.toast.show("아직 지을 수 없어요");
        this.session.changed();
    }
}
class FrWindows {
    constructor() {
        this.all = [];
    }
    register(window) { this.all.push(window); return window; }
    anyOpen() { return this.all.some((w) => w.isOpen); }
    closeAll() { this.all.forEach((w) => w.close()); }
    openOnly(target, after) { this.closeAll(); target.open(); if (after)
        after(); }
}
class FrMiniGameView {
    constructor() {
        this.game = null;
        this.fill = null;
        this.needle = null;
        this.ring = null;
        this.hits = null;
        this.root = FrDom.make("div", "fr-mini");
        this.root.hidden = true;
        this.title = FrDom.make("div", "fr-mini-title");
        this.stage = FrDom.make("div", "fr-mini-stage");
        this.root.append(this.title, this.stage);
        document.body.appendChild(this.root);
    }
    get active() { return this.game !== null; }
    show(label, game) {
        this.game = game;
        this.title.textContent = label;
        FrDom.clear(this.stage);
        this.fill = this.needle = this.ring = this.hits = null;
        if (game instanceof FrMashGauge)
            this.buildMash();
        else if (game instanceof FrCenterStop)
            this.buildCenter(game);
        else if (game instanceof FrShrinkRing)
            this.buildRing(game);
        else if (game instanceof FrHoldRelease)
            this.buildHold(game);
        this.root.hidden = false;
    }
    hide() { this.game = null; this.root.hidden = true; this.root.classList.remove("win"); }
    restart(name) {
        this.root.classList.remove("pop-press", "pop-hit", "pop-miss");
        void this.root.offsetWidth;
        this.root.classList.add(name);
    }
    feedback(kind) { this.restart("pop-" + kind); }
    celebrate() {
        this.root.hidden = false;
        this.root.classList.add("win");
        this.restart("pop-hit");
        const burst = FrDom.make("div", "fr-confetti");
        for (let i = 0; i < 18; i++) {
            const piece = FrDom.make("span");
            const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.4, distance = 70 + Math.random() * 90;
            piece.style.setProperty("--dx", Math.cos(angle) * distance + "px");
            piece.style.setProperty("--dy", Math.sin(angle) * distance - 30 + "px");
            piece.style.background = ["#FFD43A", "#9BE08A", "#FF8A5A", "#7BC8FF", "#FFFFFF"][i % 5];
            burst.appendChild(piece);
        }
        const label = FrDom.make("div", "fr-win-text", "성공!");
        this.root.append(burst, label);
        window.setTimeout(() => { burst.remove(); label.remove(); }, 1100);
    }
    bar() { return FrDom.make("div", "fr-track"); }
    buildMash() {
        const track = this.bar();
        this.fill = FrDom.make("div", "fr-fill");
        track.appendChild(this.fill);
        this.stage.append(track, FrDom.make("div", "fr-note", "Space 또는 버튼을 빠르게 연타!"));
    }
    buildCenter(game) {
        const track = this.bar();
        const green = FrDom.make("div", "fr-green");
        green.style.left = (50 - (game.greenFraction * 100) / 2) + "%";
        green.style.width = game.greenFraction * 100 + "%";
        this.needle = FrDom.make("div", "fr-needle");
        track.append(green, this.needle);
        this.hits = FrDom.make("div", "fr-note");
        this.stage.append(track, this.hits, FrDom.make("div", "fr-note", "바늘이 초록 칸에 있을 때 누르세요"));
    }
    buildHold(game) {
        const track = this.bar();
        const green = FrDom.make("div", "fr-green");
        green.style.left = (game.center * 100 - (game.greenFraction * 100) / 2) + "%";
        green.style.width = game.greenFraction * 100 + "%";
        this.fill = FrDom.make("div", "fr-fill thin");
        track.append(this.fill, green);
        this.stage.append(track, FrDom.make("div", "fr-note", "꾹 누르고 있다가 초록 칸에서 떼세요"));
    }
    buildRing(game) {
        const holder = FrDom.make("div", "fr-ring-holder");
        const target = FrDom.make("div", "fr-ring target");
        target.style.width = target.style.height = game.targetRadius * 100 + "%";
        this.ring = FrDom.make("div", "fr-ring moving");
        holder.append(this.ring, target);
        this.stage.append(holder, FrDom.make("div", "fr-note", "큰 원이 고리에 겹칠 때 누르세요"));
    }
    update() {
        const game = this.game;
        if (!game)
            return;
        if (this.fill)
            this.fill.style.width = game.progress() * 100 + "%";
        if (game instanceof FrCenterStop && this.needle && this.hits) {
            this.needle.style.left = game.needle() * 100 + "%";
            this.hits.textContent = game.hitsNeeded > 1 ? "맞춘 횟수 " + Math.round(game.progress() * game.hitsNeeded) + " / " + game.hitsNeeded : "";
        }
        if (game instanceof FrShrinkRing && this.ring)
            this.ring.style.width = this.ring.style.height = Math.max(0, game.radius()) * 100 + "%";
    }
}
class FrStatusHud {
    constructor() {
        this.clock = FrDom.el("hudClock");
        this.apText = FrDom.el("hudApText");
        this.apFill = FrDom.el("hudApFill");
        this.area = FrDom.el("hudArea");
        this.sleepBand = FrDom.el("hudSleep");
        this.sleepButton = FrDom.el("btnSleep");
    }
    showClock(minute, day) { this.clock.textContent = FrClock.label(minute) + " · " + day + "일째"; }
    showAp(ap) {
        this.apText.textContent = "⚡ " + Math.round(ap.current) + " / " + ap.max();
        this.apFill.style.width = (ap.current / ap.max()) * 100 + "%";
    }
    showArea(text) { this.area.textContent = text; }
    showSleepBand(text) { this.sleepBand.textContent = text; this.sleepBand.hidden = text === ""; }
    showSleepButton(visible, sleeping) { this.sleepButton.hidden = !visible; this.sleepButton.textContent = sleeping ? "일어나기 (Z)" : "잠자기 (Z)"; }
}
class FrHotbar {
    constructor(session, onUse) {
        this.session = session;
        this.onUse = onUse;
        this.root = FrDom.el("hotbar");
    }
    render() {
        FrDom.clear(this.root);
        for (let i = 0; i < FrBalance.HOTBAR_SLOTS; i++) {
            const slot = this.session.bag.slots[i];
            const cell = slot ? FrItemCell.render(slot.id, slot.count, slot.uses) : FrDom.make("div", "fr-cell empty");
            cell.appendChild(FrDom.make("div", "fr-cell-key", String(i + 1)));
            if (i === this.session.selected)
                cell.classList.add("selected");
            cell.addEventListener("click", () => this.onUse(i));
            this.root.appendChild(cell);
        }
    }
}
