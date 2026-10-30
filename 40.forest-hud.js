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
    constructor(session, toast, drag) {
        super("가방 (I)", session, toast);
        this.drag = drag;
        this.selected = -1;
    }
    equipmentRow() {
        const row = FrDom.make("div", "fr-row");
        row.style.justifyContent = "center";
        [["helmet", "머리"], ["top", "몸"], ["bottom", "다리"], ["shoes", "발"], ["weapon", "무기"]].forEach(([kind, label]) => {
            const tier = this.session.bag.bestTier(kind);
            const cell = tier > 0 ? FrItemCell.render(FrItems.gearId(kind, tier), 1, 0) : FrDom.make("div", "fr-cell empty");
            cell.title = label + (tier > 0 ? "" : " (없음)");
            cell.appendChild(FrDom.make("div", "fr-cell-key", label));
            row.appendChild(cell);
        });
        const ringLevel = FrRingKit.level(this.session);
        const ring = FrRingKit.best(this.session) ? FrItemCell.render("ring", 1, 0) : FrDom.make("div", "fr-cell empty");
        ring.appendChild(FrDom.make("div", "fr-cell-key", "반지"));
        if (ringLevel > 0)
            ring.appendChild(FrDom.make("div", "fr-cell-count", "+" + ringLevel));
        row.appendChild(ring);
        return row;
    }
    render() {
        FrDom.clear(this.body);
        this.body.appendChild(this.equipmentRow());
        const grid = FrDom.make("div", "fr-grid");
        for (let i = 0; i < FrBalance.BAG_SLOTS; i++) {
            const slot = this.session.bag.slots[i];
            const cell = slot ? FrItemCell.render(slot.id, slot.count, slot.uses) : FrDom.make("div", "fr-cell empty");
            if (i === this.selected)
                cell.classList.add("selected");
            if (i < FrBalance.HOTBAR_SLOTS)
                cell.classList.add("hot");
            cell.addEventListener("click", () => { if (this.drag.justDropped())
                return; this.selected = i; this.render(); });
            this.drag.attach(cell, i, !!slot);
            grid.appendChild(cell);
        }
        this.body.appendChild(grid);
        this.body.appendChild(FrDom.make("div", "fr-note", "앞 8칸(굵은 테두리)이 아래 핫바예요. 아이템을 끌어서 핫바 칸이나 다른 칸에 놓으면 자리가 바뀌어요."));
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
            this.session.stats.add("chestPut", count);
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
            this.session.stats.add("chestTake", count);
        }
        this.session.changed();
    }
}
class FrPersonalChestWindow extends FrWindow {
    constructor(session, toast) {
        super("내 창고", session, toast);
        this.onRemove = () => undefined;
    }
    render() {
        FrDom.clear(this.body);
        const columns = FrDom.make("div", "fr-cols");
        columns.append(this.bagColumn(), this.storeColumn());
        this.body.appendChild(columns);
        const used = this.session.personal.slotsUsed();
        this.body.appendChild(FrDom.make("div", "fr-note", "내 창고 " + used + " / " + FrBalance.PERSONAL_SLOTS + "칸 · 어느 섬에서도 같은 창고예요 · 만들 때 재료로도 쓰여요"));
        if (used === 0)
            this.body.appendChild(this.button("상자 치우기", () => { this.close(); this.onRemove(); }));
    }
    bagColumn() {
        const column = FrDom.make("div", "fr-col");
        column.appendChild(FrDom.make("h3", "", "내 가방"));
        const totals = new Map();
        this.session.bag.slots.forEach((s) => { if (FrItems.isStackable(s.id))
            totals.set(s.id, (totals.get(s.id) || 0) + s.count); });
        if (totals.size === 0)
            column.appendChild(FrDom.make("div", "fr-note", "넣을 것이 없어요"));
        totals.forEach((count, id) => {
            const row = FrDom.make("div", "fr-line");
            row.append(FrIcons.image(id, 28), FrDom.make("span", "", String(count)));
            [1, 10, count].filter((n, i, list) => n <= count && list.indexOf(n) === i).forEach((n) => row.appendChild(this.button(n === count && n > 10 ? "전부" : "+" + n, () => this.move(id, n, true))));
            column.appendChild(row);
        });
        return column;
    }
    storeColumn() {
        const column = FrDom.make("div", "fr-col");
        column.appendChild(FrDom.make("h3", "", "창고"));
        const ids = this.session.personal.ids();
        if (ids.length === 0)
            column.appendChild(FrDom.make("div", "fr-note", "창고가 비어 있어요"));
        ids.forEach((id) => {
            const have = this.session.personal.count(id);
            const row = FrDom.make("div", "fr-line");
            row.append(FrIcons.image(id, 28), FrDom.make("span", "", String(have)));
            [1, 10, have].filter((n, i, list) => n <= have && list.indexOf(n) === i).forEach((n) => row.appendChild(this.button(n === have && n > 10 ? "전부" : "-" + n, () => this.move(id, n, false))));
            column.appendChild(row);
        });
        return column;
    }
    move(id, count, intoStore) {
        if (intoStore) {
            if (this.session.bag.count(id) < count)
                return;
            if (!this.session.personal.canPut(id, count)) {
                this.toast.show("내 창고에 더 넣을 수 없어요");
                return;
            }
            this.session.bag.take(id, count);
            this.session.personal.put(id, count);
        }
        else {
            if (this.session.bag.freeSlots() < 1 && this.session.bag.count(id) % FrBalance.STACK_SIZE === 0) {
                this.toast.show("가방이 가득 찼어요");
                return;
            }
            this.session.personal.take(id, count);
            this.session.bag.add(id, count);
        }
        this.session.changed();
    }
}
class FrCraftWindow extends FrWindow {
    constructor(session, toast, station = "workbench") {
        super(station === "forge" ? "대장간" : "작업대", session, toast);
        this.station = station;
        this.random = new FrRandom(Date.now() >>> 0);
    }
    ringSection() {
        const box = FrDom.make("div", "fr-recipe");
        box.style.marginBottom = "10px";
        const level = FrRingKit.level(this.session);
        const has = FrRingKit.best(this.session) !== null;
        const head = FrDom.make("div", "fr-head");
        head.append(FrIcons.image("ring", 40), FrDom.make("b", "", has ? "반지 +" + level + " · 행동력 최대 " + this.session.ap.max() : "반지가 없어요 (하드·헬 던전에서 나와요)"));
        box.appendChild(head);
        const cost = FrRingKit.enhanceCost(this.session);
        if (has && cost) {
            box.appendChild(FrDom.make("div", "fr-note", "+" + (level + 1) + " 도전 · 성공률 " + Math.round(cost.rate * 100) + "% · 실패해도 단계는 안 내려가요. 단계마다 행동력 최대 +10"));
            const needs = FrDom.make("div", "fr-row");
            needs.append(this.needLine("enhance_stone", this.session.bag.count("enhance_stone"), cost.enhance), this.needLine("magic_stone", this.session.bag.count("magic_stone"), cost.magic));
            box.appendChild(needs);
            box.appendChild(this.button("강화", () => this.enhance(), this.session.bag.count("enhance_stone") >= cost.enhance && this.session.bag.count("magic_stone") >= cost.magic));
        }
        else if (has)
            box.appendChild(FrDom.make("div", "fr-note", "더는 강화할 수 없어요 (+10)"));
        const spare = FrRingKit.spare(this.session).length;
        if (spare > 0)
            box.appendChild(this.button("남는 반지 녹이기 (강화석 +" + FrBalance.RING_MELT_ENHANCE + ") · " + spare + "개", () => { if (FrRingKit.melt(this.session))
                this.toast.show("강화석 " + FrBalance.RING_MELT_ENHANCE + "개를 얻었어요"); }));
        return box;
    }
    enhance() {
        const result = FrRingKit.enhance(this.session, this.random);
        if (result.done && result.success)
            this.toast.show("강화 성공! 반지 +" + result.level + " (행동력 최대 " + this.session.ap.max() + ")");
        this.render();
    }
    render() {
        FrDom.clear(this.body);
        if (this.station === "forge")
            this.body.appendChild(this.ringSection());
        const source = this.session.craftSource();
        this.body.appendChild(FrDom.make("div", "fr-note", "재료는 가방 → 공용 창고 순으로 써요."));
        const list = FrDom.make("div", "fr-list");
        FrCraftMenu.options().filter((o) => o.station === this.station).forEach((option) => {
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
    constructor(session, toast, station = "campfire") {
        super(station === "campfire" ? "모닥불 요리" : station === "oven" ? "화덕 요리" : "섬 부엌 요리", session, toast);
        this.station = station;
    }
    render() {
        FrDom.clear(this.body);
        const source = this.session.craftSource();
        const list = FrDom.make("div", "fr-list");
        FrCatalog.RECIPES.filter((r) => r.station === this.station).forEach((recipe) => {
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
        this.site = null;
    }
    openFor(def, site = null) { this.def = def; this.site = site; this.open(); }
    render() {
        FrDom.clear(this.body);
        const def = this.def;
        if (!def)
            return;
        this.body.appendChild(FrDom.make("h3", "", def.name));
        const village = this.session.world.village;
        const level = village.level();
        const next = FrVillageLevels.nextScore(level);
        this.body.appendChild(FrDom.make("div", "fr-note", "마을 " + level + "단계 " + FrVillageLevels.label(level) + " · 점수 " + village.score() + (next >= 0 ? " / " + next : " (가장 높은 단계)") + " · 이 건설 +" + def.score));
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
        if (await this.session.world.build(def, this.session.nick, this.site ? this.site.number : 0)) {
            this.session.stats.add("built");
            this.toast.show(def.name + "이(가) 지어졌어요!");
            this.close();
        }
        else
            this.toast.show("아직 지을 수 없어요");
        this.session.changed();
    }
}
class FrPouchWindow extends FrWindow {
    constructor(session, toast) {
        super("이번 탐험에서 얻은 것", session, toast);
        this.expedition = null;
    }
    showFor(expedition) { this.expedition = expedition; this.open(); }
    render() {
        FrDom.clear(this.body);
        const e = this.expedition;
        if (!e)
            return;
        this.body.appendChild(FrDom.make("div", "fr-note", FrAreaInfo.label(e.area) + " · " + e.seconds() + "초 동안 · 행동력 " + e.spentActionPoints() + " 사용" + (e.note ? " · " + e.note : "")));
        const gains = e.gains();
        const ids = Object.keys(gains);
        const grid = FrDom.make("div", "fr-pouch-grid");
        if (ids.length === 0)
            grid.appendChild(FrDom.make("div", "fr-note", "이번에는 얻은 것이 없어요"));
        ids.forEach((id) => {
            const cell = FrDom.make("div", "fr-pouch-item");
            cell.style.borderColor = FrItemNames.GRADE_COLORS[FrItemNames.grade(id)];
            cell.title = FrItemNames.label(id);
            cell.append(FrIcons.image(id, 40), FrDom.make("b", "", "+" + gains[id]));
            grid.appendChild(cell);
        });
        this.body.appendChild(grid);
        const worn = e.wornTools();
        if (worn.length > 0)
            this.body.appendChild(FrDom.make("div", "fr-note", "닳은 도구: " + worn.join(", ")));
        this.body.appendChild(this.button("닫기", () => this.close()));
    }
}
class FrSeedWindow extends FrWindow {
    constructor(session, toast) {
        super("무엇을 심을까요?", session, toast);
        this.onPlant = () => undefined;
    }
    render() {
        FrDom.clear(this.body);
        const seeds = FrCatalog.CROPS.map((c) => ({ crop: c, id: c.id + "_seed" })).filter((s) => this.session.bag.count(s.id) > 0);
        if (seeds.length === 0)
            this.body.appendChild(FrDom.make("div", "fr-note", "가방에 씨앗이 없어요. 공용 창고에서 꺼내 오거나, 과일 숲에서 과일나무를 흔들면 가끔 나와요."));
        const list = FrDom.make("div", "fr-list");
        seeds.forEach(({ crop, id }) => {
            const row = FrDom.make("div", "fr-recipe");
            const head = FrDom.make("div", "fr-head");
            head.append(FrIcons.image(id, 34), FrDom.make("b", "", crop.name + " 씨앗 × " + this.session.bag.count(id)));
            row.appendChild(head);
            row.appendChild(FrDom.make("div", "fr-note", "자라는 데 게임 " + crop.days + "일 (물가에서는 더 빨라요)"));
            row.appendChild(this.button("심기", () => { this.close(); this.onPlant(id); }));
            list.appendChild(row);
        });
        this.body.appendChild(list);
    }
}
class FrRecipeBookWindow extends FrWindow {
    constructor(session, toast) { super("레시피 책 (R)", session, toast); }
    render() {
        FrDom.clear(this.body);
        const stationNames = { campfire: "모닥불", oven: "화덕", kitchen: "섬 부엌" };
        for (let star = 1; star <= 5; star++) {
            this.body.appendChild(FrDom.make("h3", "", "★".repeat(star) + " " + stationNames[FrCatalog.RECIPES.find((r) => r.star === star).station]));
            const list = FrDom.make("div", "fr-list");
            FrCatalog.RECIPES.filter((r) => r.star === star).forEach((recipe) => {
                const row = FrDom.make("div", "fr-recipe");
                const open = FrRecipeRules.unlocked(recipe, this.session.seen);
                const head = FrDom.make("div", "fr-head");
                head.append(open ? FrIcons.image(recipe.id, 34) : FrDom.make("span", "", "?"), FrDom.make("b", "", open ? recipe.name + (this.session.seen.has(recipe.id) ? "" : "  NEW") : "? ? ?"));
                row.appendChild(head);
                const line = FrDom.make("div", "fr-need");
                recipe.ingredients.forEach((i) => {
                    if (!open) {
                        line.appendChild(FrDom.make("span", "", "? "));
                        return;
                    }
                    line.append(i.item ? FrIcons.image(i.item, 22) : FrDom.make("span", "", i.group === "fruit" ? "과일" : i.group === "fish_common" ? "일반 물고기" : i.group === "fish_rare" ? "희귀 물고기" : "전설 물고기"), FrDom.make("span", "", "×" + i.count + " "));
                });
                row.appendChild(line);
                if (open)
                    row.appendChild(FrDom.make("div", "fr-note", "행동력 +" + FrFoodRules.islandGain(recipe.star) + " · 던전 체력 +" + FrFoodRules.dungeonGain(recipe.star)));
                list.appendChild(row);
            });
            this.body.appendChild(list);
        }
    }
}
class FrItemInfoPopup {
    constructor() {
        this.onItem = () => undefined;
        this.root = FrDom.make("div", "fr-win fr-info");
        this.root.hidden = true;
        const head = FrDom.make("div", "fr-win-head");
        this.title = FrDom.make("b", "", "");
        const close = FrDom.make("button", "fr-win-close", "✕");
        close.type = "button";
        close.addEventListener("click", () => this.hide());
        head.append(this.title, close);
        this.body = FrDom.make("div", "fr-win-body");
        this.root.append(head, this.body);
        document.body.appendChild(this.root);
    }
    get isOpen() { return !this.root.hidden; }
    hide() { this.root.hidden = true; }
    show(id, session) {
        const material = FrCatalog.material(id);
        if (!material)
            return;
        FrDom.clear(this.body);
        this.title.textContent = material.name;
        const head = FrDom.make("div", "fr-head");
        head.append(FrIcons.image(id, 56), FrDom.make("div", "", (material.grade === "legend" ? "전설" : material.grade === "rare" ? "희귀" : "일반") + " · 가방 " + session.bag.count(id) + " · 공용 창고 " + session.world.publicStore.count(id)));
        this.body.appendChild(head);
        this.section("얻는 곳", [FrDom.make("div", "", material.howToGet)]);
        const makes = FrCraftMenu.options().filter((o) => o.output === id);
        if (makes.length > 0)
            this.section("만드는 법", makes.map((o) => this.costLine(o.label, o.cost)));
        const products = FrItemUses.of(id);
        this.section("이 재화로 만들 수 있는 것", products.length > 0 ? [this.productGrid(products)] : [FrDom.make("div", "fr-note", "아직 쓰이는 곳이 없어요")]);
        this.root.hidden = false;
    }
    section(title, nodes) {
        const box = FrDom.make("div", "fr-detail");
        box.appendChild(FrDom.make("h3", "", title));
        nodes.forEach((n) => box.appendChild(n));
        this.body.appendChild(box);
    }
    costLine(label, cost) {
        const line = FrDom.make("div", "fr-line");
        line.appendChild(FrDom.make("b", "", label + " ← "));
        Object.keys(cost).forEach((c) => {
            const chip = FrDom.make("span", "fr-need");
            chip.title = FrItemNames.label(c);
            chip.append(FrIcons.image(c, 22), FrDom.make("span", "", "×" + cost[c] + " "));
            line.appendChild(chip);
        });
        return line;
    }
    productGrid(products) {
        const grid = FrDom.make("div", "fr-uses");
        products.forEach((use) => {
            const card = FrDom.make("div", "fr-use");
            card.appendChild(use.icon ? FrIcons.image(use.icon, 34) : FrDom.make("span", "fr-use-mark", "🏗"));
            card.appendChild(FrDom.make("div", "fr-use-name", use.name));
            card.appendChild(FrDom.make("div", "fr-use-kind", use.kind));
            if (use.icon && FrCatalog.material(use.icon)) {
                card.classList.add("link");
                card.addEventListener("click", () => this.onItem(use.icon));
            }
            grid.appendChild(card);
        });
        return grid;
    }
}
class FrItemUses {
    static of(id) {
        const uses = [];
        FrCraftMenu.options().forEach((o) => { if (o.cost[id])
            uses.push({ name: o.label, kind: o.station === "forge" ? "대장간" : "작업대", icon: o.output }); });
        FrCatalog.RECIPES.forEach((r) => { if (r.ingredients.some((i) => i.item === id || (i.group && FrCatalog.groupMembers(i.group).indexOf(id) >= 0)))
            uses.push({ name: r.name, kind: "요리 ★" + r.star, icon: r.id }); });
        FrCatalog.CONSTRUCTIONS.forEach((c) => { if (c.cost[id])
            uses.push({ name: c.name, kind: "공동 건설", icon: null }); });
        return uses;
    }
}
class FrSleepBoard {
    constructor(onWake) {
        this.root = FrDom.make("div", "fr-sleep-board");
        this.root.hidden = true;
        this.root.appendChild(FrDom.make("div", "fr-sleep-title", "💤 모두 잠들면 아침이 와요"));
        this.summary = FrDom.make("div", "fr-sleep-summary");
        this.list = FrDom.make("div", "fr-sleep-list");
        const wake = FrDom.make("button", "fr-btn fr-sleep-wake", "일어나기 (Z)");
        wake.type = "button";
        wake.addEventListener("click", onWake);
        const legend = FrDom.make("div", "fr-sleep-legend");
        ["asleep", "awake", "idle", "offline"].forEach((state) => {
            const item = FrDom.make("span", "");
            item.append(this.dot(state), FrDom.make("span", "", FrSleepBoard.STATES[state].text.split(" · ")[0]));
            legend.appendChild(item);
        });
        this.root.append(this.summary, legend, this.list, wake);
        document.body.appendChild(this.root);
    }
    show(rows, banner) {
        this.summary.textContent = banner;
        FrDom.clear(this.list);
        rows.forEach((row) => {
            const line = FrDom.make("div", row.self ? "fr-sleep-row me" : "fr-sleep-row");
            line.appendChild(this.dot(row.state));
            line.appendChild(FrDom.make("span", "fr-sleep-name", (row.no > 0 ? row.no + " " : "") + row.name + (row.self ? " (나)" : "")));
            const where = row.state === "away" || (row.state === "awake" && row.area !== "island") ? " · " + FrSleepVote.areaLabel(row.area) : "";
            line.appendChild(FrDom.make("span", "fr-sleep-state", FrSleepBoard.STATES[row.state].text + where));
            this.list.appendChild(line);
        });
        this.root.hidden = false;
    }
    hide() { if (!this.root.hidden)
        this.root.hidden = true; }
    dot(state) {
        const dot = FrDom.make("span", "fr-sleep-dot");
        dot.style.background = FrSleepBoard.STATES[state].color;
        if (state === "awake" || state === "away")
            dot.style.boxShadow = "0 0 8px " + FrSleepBoard.STATES[state].color;
        return dot;
    }
}
FrSleepBoard.STATES = {
    asleep: { color: "#7BA8FF", text: "자는 중" },
    awake: { color: "#FF7A5A", text: "깨어 있음" },
    away: { color: "#F2C14E", text: "깨어 있음" },
    idle: { color: "#9AA5B4", text: "오늘 안 움직임 · 안 기다려요" },
    offline: { color: "#4A5361", text: "접속 안 함" },
};
class FrCurrencyWindow extends FrWindow {
    constructor(session, toast) {
        super("재화 현황 (U)", session, toast);
        this.selected = "";
        this.info = new FrItemInfoPopup();
        this.info.onItem = (id) => this.pick(id);
    }
    showItem(id) { this.open(); this.pick(id); }
    close() { super.close(); this.info.hide(); }
    pick(id) {
        this.selected = id;
        this.info.show(id, this.session);
        this.render();
    }
    render() {
        FrDom.clear(this.body);
        const rank = { common: 0, rare: 1, legend: 2 };
        FrCurrencyWindow.ORDER.forEach((category) => {
            this.body.appendChild(FrDom.make("h3", "", FrCurrencyWindow.CATEGORY_NAMES[category]));
            const grid = FrDom.make("div", "fr-pouch-grid");
            FrCatalog.MATERIALS.filter((m) => m.category === category).sort((a, b) => rank[a.grade] - rank[b.grade]).forEach((m) => {
                const cell = FrDom.make("div", "fr-pouch-item");
                cell.style.borderColor = FrItemNames.GRADE_COLORS[m.grade];
                cell.title = m.name;
                const known = this.session.seen.has(m.id);
                if (!known)
                    cell.style.opacity = "0.4";
                if (m.id === this.selected)
                    cell.classList.add("picked");
                cell.append(FrIcons.image(m.id, 34), FrDom.make("span", "fr-cur-count", this.session.bag.count(m.id) + " / " + this.session.world.publicStore.count(m.id)));
                cell.addEventListener("click", () => this.pick(m.id));
                grid.appendChild(cell);
            });
            this.body.appendChild(grid);
        });
        this.body.appendChild(FrDom.make("div", "fr-note", "숫자는 가방 / 공용 창고예요. 흐린 것은 아직 못 얻은 재화예요. 누르면 얻는 곳과 만들 수 있는 것이 나와요."));
    }
}
FrCurrencyWindow.ORDER = ["wood", "beach", "fish", "mineral", "crop", "dungeon", "crafted", "block"];
FrCurrencyWindow.CATEGORY_NAMES = { wood: "목재·과일·꽃", beach: "해변", fish: "물고기", mineral: "광물·얼음", crop: "작물·씨앗", dungeon: "던전", crafted: "가공품", block: "블록" };
class FrStatsWindow extends FrWindow {
    constructor(session, toast, backend, island, roster) {
        super("기록판 (Y)", session, toast);
        this.backend = backend;
        this.island = island;
        this.roster = roster;
        this.tab = FrStatCatalog.TABS[0];
        this.today = true;
        this.others = {};
        this.loading = false;
    }
    open() { super.open(); void this.reload(); }
    async reload() {
        if (this.loading)
            return;
        this.loading = true;
        try {
            this.others = (await this.backend.get("forest/" + this.island + "/stats")) || {};
        }
        catch (error) {
            this.others = {};
        }
        this.loading = false;
        if (this.isOpen)
            this.render();
    }
    render() {
        FrDom.clear(this.body);
        const tabs = FrDom.make("div", "fr-row");
        [["오늘", true], ["전체", false]].forEach(([label, today]) => { const b = this.button(String(label), () => { this.today = Boolean(today); this.render(); }); if (this.today === today)
            b.style.outline = "2px solid #fff"; tabs.appendChild(b); });
        tabs.appendChild(this.button("새로 고침", () => void this.reload()));
        this.body.appendChild(tabs);
        const cats = FrDom.make("div", "fr-row");
        FrStatCatalog.TABS.forEach((name) => { const b = this.button(name, () => { this.tab = name; this.render(); }); if (name === this.tab)
            b.style.outline = "2px solid #fff"; cats.appendChild(b); });
        this.body.appendChild(cats);
        const defs = FrStatCatalog.DEFS.filter((d) => d.tab === this.tab);
        const table = FrDom.make("table", "fr-stats");
        const head = FrDom.make("tr");
        head.appendChild(FrDom.make("th", "", "번호 이름"));
        defs.forEach((d) => head.appendChild(FrDom.make("th", "", d.label)));
        table.appendChild(head);
        const rows = Array.from(this.roster.members.entries()).filter(([, m]) => !m.adm).sort((a, b) => a[1].no - b[1].no);
        if (!this.session.admin && !rows.some(([uid]) => uid === this.session.uid))
            rows.push([this.session.uid, { no: this.session.no, name: this.session.nick, look: null, adm: false }]);
        rows.forEach(([uid, member]) => {
            const mine = uid === this.session.uid;
            const stats = mine ? this.session.stats.data : this.others[uid];
            const line = FrDom.make("tr");
            if (mine)
                line.className = "me";
            line.appendChild(FrDom.make("td", "", (member.no > 90000 ? "" : member.no + " ") + member.name));
            defs.forEach((d) => {
                const value = stats ? (this.today ? (stats.today && stats.today.c ? stats.today.c[d.key] : 0) : stats.all[d.key]) || 0 : 0;
                line.appendChild(FrDom.make("td", value ? "" : "zero", value ? String(value) : "–"));
            });
            table.appendChild(line);
        });
        if (rows.length === 0)
            this.body.appendChild(FrDom.make("div", "fr-note", "아직 들어온 학생이 없어요"));
        this.body.appendChild(table);
        this.body.appendChild(FrDom.make("div", "fr-note", "순위는 없어요. 번호 순서대로 해 낸 횟수만 보여 줘요. 기록은 몇 초 뒤에 반영돼요."));
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
class FrDungeonWindow extends FrWindow {
    constructor(session, toast) {
        super("던전 (서쪽 포탈)", session, toast);
        this.onEnter = () => undefined;
        this.onItem = () => undefined;
    }
    render() {
        FrDom.clear(this.body);
        this.body.appendChild(FrDom.make("div", "fr-note", "행동력 " + FrBalance.DUNGEON_ENTRY_COST + "을 쓰고 " + FrBalance.DUNGEON_SECONDS + "초 동안 사냥해요. 공격은 J 또는 오른쪽 버튼. 몬스터가 팔을 치켜들면 물러나서 피해요. 쓰러지면 그때까지 얻은 것을 가지고 나와요."));
        const cards = FrDom.make("div", "fr-dcards");
        ["normal", "hard", "hell"].forEach((difficulty) => {
            const card = FrDom.make("div", "fr-dcard fr-d-" + difficulty);
            card.appendChild(FrDom.make("h3", "", FrDungeonInfo.NAMES[difficulty] + " — " + FrDungeonInfo.CAVE_NAMES[difficulty]));
            card.appendChild(FrDom.make("div", "", FrDungeonInfo.SUMMARY[difficulty]));
            card.appendChild(FrDom.make("div", "fr-note", "권장 장비: " + FrDungeonInfo.RECOMMENDED[difficulty]));
            card.appendChild(FrDom.make("div", "fr-note", "몬스터: " + FrDungeonInfo.monsterNames(difficulty).join(", ")));
            const drops = FrDom.make("div", "fr-pouch-grid");
            FrDungeonInfo.dropIds(difficulty).forEach((id) => {
                const cell = FrDom.make("div", "fr-pouch-item");
                cell.style.borderColor = FrItemNames.GRADE_COLORS[FrItemNames.grade(id)];
                cell.title = FrItemNames.label(id);
                cell.appendChild(FrIcons.image(id, 30));
                cell.addEventListener("click", () => this.onItem(id));
                drops.appendChild(cell);
            });
            card.appendChild(drops);
            const enough = this.session.ap.current >= FrBalance.DUNGEON_ENTRY_COST;
            card.appendChild(this.button("입장 (행동력 " + FrBalance.DUNGEON_ENTRY_COST + " · " + FrBalance.DUNGEON_SECONDS + "초)", () => { this.close(); this.onEnter(difficulty); }, enough));
            cards.appendChild(card);
        });
        this.body.appendChild(cards);
        this.body.appendChild(FrDom.make("div", "fr-note", "지금 행동력 " + Math.round(this.session.ap.current) + " / " + this.session.ap.max() + " · 장비 공격력 " + FrDungeonRules.weaponDamage(this.session.bag.bestTier("weapon")) + " · 받는 피해 -" + Math.round(FrDungeonRules.armorReduction(FrDungeonInfo.armorOf(this.session)) * 100) + "%"));
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
        this.apBox = FrDom.el("hudAp");
        this.hp = FrDom.el("hudHp");
        this.hpFill = FrDom.el("hudHpFill");
        this.hpText = FrDom.el("hudHpText");
    }
    showClock(minute, day) { this.clock.textContent = FrClock.label(minute) + " · " + day + "일째"; }
    showAp(ap, unlimited = false) {
        const hotbar = FrDom.el("hotbar");
        if (hotbar.offsetWidth > 0)
            this.apBox.style.width = hotbar.offsetWidth + "px";
        if (unlimited) {
            this.apText.textContent = "운영자 · 제한 없음";
            this.apFill.style.width = "100%";
            this.apFill.className = "";
            return;
        }
        const current = Math.round(ap.current);
        this.apText.textContent = "⚡ " + current + " / " + ap.max();
        this.apFill.style.width = Math.max(0, Math.min(1, ap.current / ap.max())) * 100 + "%";
        this.apFill.className = current < FrStatusHud.AP_LOW ? "low" : current < FrStatusHud.AP_MID ? "mid" : "";
    }
    showArea(text) { this.area.textContent = text; }
    showHealth(visible, health = 0) {
        this.hp.hidden = !visible;
        if (!visible)
            return;
        this.hpFill.style.width = health + "%";
        this.hpText.textContent = "❤ " + Math.round(health) + " / " + FrBalance.PLAYER_HEALTH;
    }
    showSleepBand(text) { this.sleepBand.textContent = text; this.sleepBand.hidden = text === ""; }
    showSleepButton(visible, sleeping) { this.sleepButton.hidden = !visible; this.sleepButton.textContent = sleeping ? "일어나기 (Z)" : "잠자기 (Z)"; }
}
FrStatusHud.AP_MID = 35;
FrStatusHud.AP_LOW = 20;
class FrHotbar {
    constructor(session, onUse, drag) {
        this.session = session;
        this.onUse = onUse;
        this.drag = drag;
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
            cell.addEventListener("click", () => { if (!this.drag.justDropped())
                this.onUse(i); });
            this.drag.attach(cell, i, !!slot);
            this.root.appendChild(cell);
        }
    }
}
class FrIslandMapPainter {
    static othersOf(roster, selfUid, islandOnly = false) {
        const dots = [];
        roster.aliveUids().forEach((uid) => {
            const pose = roster.poses.get(uid), member = roster.members.get(uid), row = roster.presence.get(uid);
            if (uid === selfUid || !pose || !member || member.adm)
                return;
            if (islandOnly && row && row.area !== "island")
                return;
            dots.push({ x: pose.x / FrTerrainData.BLOCK, z: pose.z / FrTerrainData.BLOCK, name: member.name });
        });
        return dots;
    }
    static paint(g, world, P, others, me) {
        const terrain = world.terrain;
        const image = g.createImageData(terrain.w * P, terrain.d * P);
        for (let z = 0; z < terrain.d; z++)
            for (let x = 0; x < terrain.w; x++) {
                const base = FrIslandMapPainter.TOP_COLORS[terrain.top(x, z)] || FrIslandMapPainter.TOP_COLORS.G;
                const light = terrain.isWater(x, z) ? 1 : 0.86 + Math.max(0, terrain.height(x, z)) * 0.025;
                const block = world.blocks.top(terrain.index(x, z)) > 0;
                const color = block ? [205, 170, 120] : base.map((v) => Math.min(255, v * light));
                for (let py = 0; py < P; py++)
                    for (let px = 0; px < P; px++) {
                        const k = ((z * P + py) * terrain.w * P + x * P + px) * 4;
                        image.data[k] = color[0];
                        image.data[k + 1] = color[1];
                        image.data[k + 2] = color[2];
                        image.data[k + 3] = 255;
                    }
            }
        g.putImageData(image, 0, 0);
        g.fillStyle = "rgba(28,84,38,0.85)";
        world.trees.forEach((spot, index) => { if (!world.isFelled(index)) {
            g.beginPath();
            g.arc((spot.x + 0.5) * P, (spot.z + 0.5) * P, P * 0.55, 0, Math.PI * 2);
            g.fill();
        } });
        world.sites.forEach((site) => {
            if (!world.isBuilt(site.id))
                return;
            g.fillStyle = "#6E7079";
            site.cells.forEach((c) => g.fillRect(c.x * P, c.z * P, P, P));
        });
        const a = terrain.anchors;
        g.strokeStyle = "rgba(255,255,255,0.7)";
        g.lineWidth = 1;
        a.lots.forEach((lot) => g.strokeRect(lot.x * P + 0.5, lot.z * P + 0.5, lot.size * P - 1, lot.size * P - 1));
        g.fillStyle = "#FF8C00";
        g.beginPath();
        g.arc((a.campfire.x + 0.5) * P, (a.campfire.z + 0.5) * P, P * 1.6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#8A5A2B";
        g.fillRect(a.publicChest.x * P, a.publicChest.z * P, a.publicChest.size * P, a.publicChest.size * P);
        g.font = "bold " + Math.max(10, P * 3) + "px \"Nanum Gothic\", \"Malgun Gothic\", sans-serif";
        g.textAlign = "center";
        Object.keys(a.portals).forEach((id) => {
            const p = a.portals[id];
            const cx = (p.x + 0.5) * P, cz = (p.z + 0.5) * P;
            g.fillStyle = FrIslandMapPainter.PORTAL_COLORS[id] || "#FFFFFF";
            g.beginPath();
            g.arc(cx, cz, P * 2, 0, Math.PI * 2);
            g.fill();
            FrIslandMapPainter.label(g, FrAreaInfo.label(id), cx, cz - P * 2.6);
        });
        others.forEach((dot) => FrIslandMapPainter.dot(g, dot, P, "#7BA8FF", false));
        if (me)
            FrIslandMapPainter.dot(g, me, P, "#D97B4F", true);
    }
    static dot(g, dot, P, color, big) {
        const r = big ? P * 1.8 : P * 1.3;
        g.fillStyle = "#FFFFFF";
        g.beginPath();
        g.arc(dot.x * P, dot.z * P, r + 2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = color;
        g.beginPath();
        g.arc(dot.x * P, dot.z * P, r, 0, Math.PI * 2);
        g.fill();
        if (dot.name)
            FrIslandMapPainter.label(g, dot.name, dot.x * P, dot.z * P - r - 4);
    }
    static label(g, text, x, y) {
        g.lineWidth = 3;
        g.strokeStyle = "rgba(0,0,0,0.7)";
        g.strokeText(text, x, y);
        g.fillStyle = "#FFFFFF";
        g.fillText(text, x, y);
    }
}
FrIslandMapPainter.TOP_COLORS = {
    G: [111, 163, 82], D: [150, 112, 74], S: [128, 128, 132], N: [226, 208, 150], W: [246, 248, 250], R: [70, 130, 200], O: [40, 80, 140], P: [196, 168, 110],
};
FrIslandMapPainter.PORTAL_COLORS = { fruit: "#EC40B0", beach: "#00D2E6", mine: "#FFD600", dungeon: "#9640DC" };
class FrMapWindow extends FrWindow {
    constructor(session, toast, marks) {
        super("지도 (M)", session, toast);
        this.marks = marks;
        this.timer = 0;
        this.root.classList.add("fr-map");
        this.canvas = FrDom.make("canvas");
        this.canvas.width = session.world.terrain.w * FrMapWindow.CELL_PIXELS;
        this.canvas.height = session.world.terrain.d * FrMapWindow.CELL_PIXELS;
    }
    open() { super.open(); window.clearInterval(this.timer); this.timer = window.setInterval(() => { if (this.isOpen)
        this.paint(); }, 1000); }
    close() { super.close(); window.clearInterval(this.timer); }
    render() {
        FrDom.clear(this.body);
        const marks = this.marks();
        if (!marks.island)
            this.body.appendChild(FrDom.make("div", "fr-note", "지금은 섬 밖에 있어요. 섬 지도를 보여 줘요."));
        this.body.appendChild(this.canvas);
        const legend = FrDom.make("div", "fr-map-legend");
        [["#D97B4F", "나"], ["#7BA8FF", "친구"], ["#1C5426", "나무"], ["#6E7079", "지은 건물"], ["#CDAA78", "블록"], ["#FF8C00", "모닥불"], ["#8A5A2B", "공용 창고"]].forEach(([color, text]) => {
            const item = FrDom.make("span");
            const box = FrDom.make("i");
            box.style.background = color;
            item.append(box, FrDom.make("span", "", text));
            legend.appendChild(item);
        });
        this.body.appendChild(legend);
        this.paint();
    }
    paint() {
        const marks = this.marks();
        FrIslandMapPainter.paint(this.canvas.getContext("2d"), this.session.world, FrMapWindow.CELL_PIXELS, marks.others, marks.me);
    }
}
FrMapWindow.CELL_PIXELS = 5;
class FrSlotDrag {
    constructor(session) {
        this.session = session;
        this.from = -1;
        this.startX = 0;
        this.startY = 0;
        this.ghost = null;
        this.over = null;
        this.droppedAt = 0;
        window.addEventListener("pointermove", (event) => this.move(event));
        window.addEventListener("pointerup", (event) => this.end(event));
        window.addEventListener("pointercancel", () => this.cancel());
    }
    attach(cell, index, filled) {
        cell.dataset.slot = String(index);
        cell.style.touchAction = "none";
        if (!filled)
            return;
        cell.addEventListener("pointerdown", (event) => {
            this.from = index;
            this.startX = event.clientX;
            this.startY = event.clientY;
        });
    }
    justDropped() { return Date.now() - this.droppedAt < FrSlotDrag.CLICK_GUARD_MS; }
    move(event) {
        if (this.from < 0)
            return;
        if (!this.ghost) {
            if (Math.hypot(event.clientX - this.startX, event.clientY - this.startY) < FrSlotDrag.START_DISTANCE)
                return;
            const slot = this.session.bag.slots[this.from];
            if (!slot) {
                this.cancel();
                return;
            }
            this.ghost = FrItemCell.render(slot.id, slot.count, slot.uses);
            this.ghost.style.cssText = "position:fixed;z-index:60;pointer-events:none;opacity:.85;transform:translate(-50%,-50%) scale(1.1);";
            document.body.appendChild(this.ghost);
        }
        this.ghost.style.left = event.clientX + "px";
        this.ghost.style.top = event.clientY + "px";
        const target = this.targetAt(event.clientX, event.clientY);
        if (target !== this.over) {
            if (this.over)
                this.over.classList.remove("drop-over");
            if (target)
                target.classList.add("drop-over");
            this.over = target;
        }
    }
    end(event) {
        if (this.from < 0)
            return;
        const dragging = !!this.ghost;
        const target = dragging ? this.targetAt(event.clientX, event.clientY) : null;
        const from = this.from;
        this.cancel();
        if (!dragging)
            return;
        this.droppedAt = Date.now();
        if (!target)
            return;
        const to = Number(target.dataset.slot);
        if (this.session.bag.move(from, to)) {
            this.session.selected = Math.min(to, this.session.bag.slots.length - 1);
            this.session.changed();
        }
    }
    cancel() {
        this.from = -1;
        if (this.ghost) {
            this.ghost.remove();
            this.ghost = null;
        }
        if (this.over) {
            this.over.classList.remove("drop-over");
            this.over = null;
        }
    }
    targetAt(x, y) {
        const node = document.elementFromPoint(x, y);
        const cell = node ? node.closest("[data-slot]") : null;
        return cell;
    }
}
FrSlotDrag.START_DISTANCE = 6;
FrSlotDrag.CLICK_GUARD_MS = 250;
