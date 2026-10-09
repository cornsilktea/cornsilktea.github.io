"use strict";
class WarDom {
    static byId(id) {
        return document.getElementById(id);
    }
    static make(tag, className, text = "") {
        const element = document.createElement(tag);
        element.className = className;
        if (text)
            element.textContent = text;
        return element;
    }
    static clear(element) {
        while (element.firstChild)
            element.removeChild(element.firstChild);
    }
}
class WarTimeText {
    static clock(ticks) {
        const seconds = Math.floor(ticks / WarBalance.TICKS_PER_SEC);
        return Math.floor(seconds / 60) + ":" + (seconds % 60 < 10 ? "0" : "") + (seconds % 60);
    }
}
class WarTopBar {
    constructor() {
        this.ore = WarDom.byId("hudOre");
        this.crystal = WarDom.byId("hudCrystal");
        this.pop = WarDom.byId("hudPop");
        this.time = WarDom.byId("hudTime");
    }
    update(engine, team) {
        const economy = engine.players[team].economy;
        this.ore.textContent = String(economy.ore);
        this.crystal.textContent = String(economy.crystal);
        this.pop.textContent = economy.popUsed + "/" + WarBalance.POP_CAP;
        this.time.textContent = WarTimeText.clock(engine.tick) + " / " + WarTimeText.clock(WarBalance.MATCH_TICKS);
    }
}
class WarNotice {
    constructor() {
        this.element = WarDom.byId("hudNotice");
        this.hideAt = 0;
    }
    show(text) {
        this.element.textContent = text;
        this.element.hidden = false;
        this.hideAt = performance.now() + WarNotice.SHOW_MS;
    }
    update() {
        if (!this.element.hidden && performance.now() > this.hideAt)
            this.element.hidden = true;
    }
    reset() {
        this.element.hidden = true;
    }
}
WarNotice.SHOW_MS = 3200;
class WarSquadNames {
    static of(index) {
        return index === WarBalance.FLEET_SQUAD ? "비행단" : "부대 " + (index + 1);
    }
}
class WarSquadPanel {
    constructor() {
        this.onSelect = () => undefined;
        this.workerText = WarDom.byId("workerCount");
        this.rows = [];
        this.cells = [];
        for (let index = 0; index < WarBalance.SQUAD_COUNT; index++) {
            const row = WarDom.byId("squadRow" + index);
            row.style.setProperty("--squad", WarPalette.SQUAD_COLORS[index]);
            const gauge = row.querySelector(".gauge");
            const cells = [];
            for (let i = 0; i < WarBalance.SQUAD_CAP; i++) {
                const cell = WarDom.make("i", "cell");
                gauge.appendChild(cell);
                cells.push(cell);
            }
            row.addEventListener("click", () => this.onSelect(index));
            this.rows.push(row);
            this.cells.push(cells);
        }
    }
    update(player, selection) {
        this.workerText.textContent = "광석 " + player.economy.oreWorkers + " · 결정 " + player.economy.crystalWorkers;
        player.squads.forEach((squad, index) => {
            const order = ["melee", "ranged", "elite", "air"];
            const colors = [];
            for (const kind of order) {
                for (const unit of squad.members)
                    if (unit.def.kind === kind)
                        colors.push(WarPalette.KIND_COLORS[kind]);
            }
            this.cells[index].forEach((cell, i) => {
                const color = colors[i];
                cell.style.background = color ?? "";
                cell.classList.toggle("on", color !== undefined);
            });
            this.rows[index].classList.toggle("selected", selection.kind === "squad" && selection.index === index);
            this.rows[index].classList.toggle("away", squad.mode !== "home");
        });
    }
}
class WarCommandCard {
    constructor() {
        this.host = WarDom.byId("cmdCard");
        this.signature = "";
    }
    update(selection, engine, team, sink, onAfter) {
        const cells = this.cellsFor(selection, engine, team, sink, onAfter);
        const signature = selection.kind + ":" + cells.map((c) => c.label + c.sub + c.enabled).join("|");
        if (signature === this.signature)
            return;
        this.signature = signature;
        WarDom.clear(this.host);
        for (const spec of cells) {
            const cell = WarDom.make(spec.onPress ? "button" : "div", spec.onPress ? "cmdBtn" : "cmdNote");
            if (cell instanceof HTMLButtonElement) {
                cell.type = "button";
                cell.disabled = !spec.enabled;
            }
            cell.appendChild(WarDom.make("b", "", spec.label));
            if (spec.sub)
                cell.appendChild(WarDom.make("small", "", spec.sub));
            if (spec.desc)
                cell.appendChild(WarDom.make("span", "desc", spec.desc));
            const press = spec.onPress;
            if (press)
                cell.addEventListener("click", () => press());
            this.host.appendChild(cell);
        }
    }
    static note(label, desc) {
        return [{ label, sub: "", desc, enabled: true, onPress: null }];
    }
    cellsFor(selection, engine, team, sink, onAfter) {
        const player = engine.players[team];
        const economy = player.economy;
        if (selection.kind === "slot") {
            return WarBuildingCatalog.buildable(player.slotDefs[selection.index].kind).map((def) => ({
                label: WarBuildingCatalog.displayName(def.type, player.faction),
                sub: WarCommandCard.costText(def.ore, def.crystal) + " · " + def.buildTicks / WarBalance.TICKS_PER_SEC + "초 · " + player.countOf(def.type) + "/" + WarBalance.BUILDINGS_PER_TYPE,
                desc: WarBlurbs.building(def.type),
                enabled: economy.canAfford(def.ore, def.crystal) && player.countOf(def.type) < WarBalance.BUILDINGS_PER_TYPE,
                onPress: () => { sink(new WarBuildCommand(team, selection.index, def.type)); onAfter(); },
            }));
        }
        if (selection.kind === "building") {
            const building = engine.entityById(selection.id);
            if (!(building instanceof WarBuilding) || building.team !== team)
                return WarCommandCard.note("적 건물", "부수면 승리에 가까워져요.");
            if (!building.complete)
                return WarCommandCard.note("짓는 중", "다 지어지면 병력을 만들 수 있어요.");
            if (building.def.type === "turret")
                return WarCommandCard.note(WarBuildingCatalog.displayName("turret", player.faction), WarBlurbs.building("turret"));
            const items = building.def.type === "hq"
                ? [WarProductionItem.from("worker_ore"), WarProductionItem.from("worker_crystal")]
                : WarUnitCatalog.producedBy(player.faction, building.def.type).map((def) => WarProductionItem.from(def.id));
            return items.map((item) => ({
                label: item.name,
                sub: WarCommandCard.costText(item.ore, item.crystal) + (item.pop > 1 ? " · 인구 " + item.pop : ""),
                desc: WarBlurbs.unit(item.id),
                enabled: economy.canAfford(item.ore, item.crystal) && economy.popFree >= item.pop && building.queue.length < WarBalance.QUEUE_LIMIT,
                onPress: () => sink(new WarProduceCommand(team, building.id, item.id)),
            }));
        }
        if (selection.kind === "squad") {
            return [
                { label: "이동", sub: "", desc: "마우스는 오른쪽 클릭, 터치는 화면을 누르면 그곳으로 가요. 길게 그리려면 공격 지도를 쓰세요.", enabled: true, onPress: null },
                { label: "귀환", sub: "입구로 돌아와요", desc: "", enabled: player.squads[selection.index].mode !== "home", onPress: () => sink(new WarRecallCommand(team, selection.index)) },
            ];
        }
        if (selection.kind === "unit") {
            const unit = engine.entityById(selection.id);
            if (unit instanceof WarUnit && unit.team === team)
                return WarCommandCard.note("이동", "마우스는 오른쪽 클릭, 터치는 화면을 누르면 이 병력만 그곳으로 가요. 가다가 적을 만나면 싸워요.");
            return WarCommandCard.note("적 병력", "우리 병력을 보내 맞서 싸우세요.");
        }
        return WarCommandCard.note("빈 터를 눌러 보세요", "건물을 지을 수 있어요. 건물을 누르면 병력을 만들어요. 위쪽 부대를 누르면 지시를 내려요.");
    }
    static costText(ore, crystal) {
        return "광석 " + ore + (crystal > 0 ? " · 결정 " + crystal : "");
    }
}
class WarInfoPanel {
    constructor() {
        this.host = WarDom.byId("infoPanel");
        this.signature = "";
    }
    update(selection, engine, team) {
        const lines = this.linesFor(selection, engine, team);
        const signature = lines.title + "|" + lines.hpRatio + "|" + lines.rows.join("|");
        if (signature === this.signature)
            return;
        this.signature = signature;
        WarDom.clear(this.host);
        this.host.appendChild(WarDom.make("h3", "", lines.title));
        if (lines.hpRatio >= 0) {
            const bar = WarDom.make("div", "infoBar");
            const fill = WarDom.make("div", "infoBarFill");
            fill.style.width = Math.round(lines.hpRatio * 100) + "%";
            bar.appendChild(fill);
            this.host.appendChild(bar);
        }
        for (const row of lines.rows)
            this.host.appendChild(WarDom.make("div", "infoRow", row));
    }
    linesFor(selection, engine, team) {
        const player = engine.players[team];
        if (selection.kind === "unit") {
            const unit = engine.entityById(selection.id);
            if (unit instanceof WarUnit) {
                const squad = unit.team === team && unit.squadIndex >= 0 ? " · " + WarSquadNames.of(unit.squadIndex) : "";
                return {
                    title: unit.def.name + (unit.team === team ? "" : " (적)"),
                    hpRatio: unit.hp / unit.maxHp,
                    rows: ["체력 " + unit.hp + "/" + unit.maxHp + squad, "공격력 " + unit.def.damage + " · 사거리 " + unit.def.range / 100 + "m · 속도 " + unit.def.speed / 100 + "m/s"],
                };
            }
        }
        if (selection.kind === "building") {
            const building = engine.entityById(selection.id);
            if (building instanceof WarBuilding) {
                const rows = ["체력 " + building.hp + "/" + building.maxHp];
                if (!building.complete)
                    rows.push("건설 중 " + Math.round((1 - building.buildLeft / building.def.buildTicks) * 100) + "%");
                building.queue.forEach((queued, i) => rows.push((i === 0 ? "생산 중 " : "대기 ") + queued.item.name + (i === 0 ? " " + Math.round((1 - queued.ticksLeft / queued.item.ticks) * 100) + "%" : "")));
                return { title: WarBuildingCatalog.displayName(building.def.type, engine.players[building.team].faction) + (building.team === team ? "" : " (적)"), hpRatio: building.hp / building.maxHp, rows };
            }
        }
        if (selection.kind === "squad") {
            const squad = player.squads[selection.index];
            const count = (kind) => squad.members.filter((u) => u.def.kind === kind).length;
            return {
                title: WarSquadNames.of(selection.index),
                hpRatio: -1,
                rows: ["근접 " + count("melee") + " · 원거리 " + count("ranged") + " · 고급 " + count("elite") + " · 비행 " + count("air") + " (" + squad.members.length + "/" + WarBalance.SQUAD_CAP + ")", squad.mode === "home" ? "입구에서 수비 중" : squad.mode === "away" ? "공격 이동 중" : "귀환 중"],
            };
        }
        if (selection.kind === "slot") {
            return { title: "빈 터", hpRatio: -1, rows: ["건물 슬롯 " + (selection.index + 1), "왼쪽 카드에서 지을 건물을 고르세요."] };
        }
        const economy = player.economy;
        return {
            title: "기지 현황",
            hpRatio: -1,
            rows: [
                "광석 일꾼 " + economy.oreWorkers + " (초당 " + (WarEconomy.milliPerSecond(economy.oreWorkers, false) / 1000).toFixed(1) + ")",
                "결정 일꾼 " + economy.crystalWorkers + " (초당 " + (WarEconomy.milliPerSecond(economy.crystalWorkers, true) / 1000).toFixed(1) + ")",
                "건물 " + (player.buildings().length - 1) + "개 · 병력 " + engine.units(team).length + "기",
            ],
        };
    }
}
class WarAlertPulses {
    constructor() {
        this.pulses = [];
    }
    add(point) {
        this.pulses.push({ x: point.x, y: point.y, startedMs: performance.now() });
    }
    clear() {
        this.pulses = [];
    }
    paint(context, width, height, transform) {
        const now = performance.now();
        this.pulses = this.pulses.filter((pulse) => now - pulse.startedMs < WarAlertPulses.LIFE_MS);
        for (const pulse of this.pulses) {
            const progress = (now - pulse.startedMs) / WarAlertPulses.LIFE_MS;
            const center = transform.toMap(pulse, width, height);
            context.fillStyle = "rgba(255, 70, 70, 0.95)";
            context.beginPath();
            context.arc(center.x, center.y, 3, 0, Math.PI * 2);
            context.fill();
            context.strokeStyle = "rgba(255, 70, 70, " + (1 - progress).toFixed(2) + ")";
            context.lineWidth = 2.5;
            context.beginPath();
            context.arc(center.x, center.y, 4 + progress * width * 0.12, 0, Math.PI * 2);
            context.stroke();
        }
    }
}
WarAlertPulses.LIFE_MS = 1800;
class WarMapPainter {
    static paint(context, width, height, engine, transform, showPaths, cameraFocus, pulses) {
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#10162A";
        context.fillRect(0, 0, width, height);
        WarMapPainter.paintCorridors(context, width, height, transform);
        WarMapPainter.paintFog(context, width, height, engine, transform);
        if (showPaths)
            WarMapPainter.paintPaths(context, width, height, engine, transform);
        WarMapPainter.paintEntities(context, width, height, engine, transform);
        pulses.paint(context, width, height, transform);
        if (cameraFocus) {
            const p = transform.toMap(cameraFocus, width, height);
            context.strokeStyle = "rgba(255,255,255,.85)";
            context.lineWidth = 1.5;
            context.strokeRect(p.x - width * 0.12, p.y - height * 0.07, width * 0.24, height * 0.14);
        }
    }
    static paintCorridors(context, width, height, transform) {
        context.lineCap = "round";
        context.strokeStyle = "#2E3A57";
        for (const corridor of WarMapData.corridors()) {
            const a = transform.toMap({ x: corridor.ax, y: corridor.ay }, width, height);
            const b = transform.toMap({ x: corridor.bx, y: corridor.by }, width, height);
            context.lineWidth = Math.max(3, (corridor.halfWidth * 2 * width) / (WarMapData.HALF_W * 2));
            context.beginPath();
            context.moveTo(a.x, a.y);
            context.lineTo(b.x, b.y);
            context.stroke();
        }
    }
    static paintFog(context, width, height, engine, transform) {
        const cell = WarMapData.VISION_CELL;
        const cols = Math.ceil((WarMapData.HALF_W * 2) / cell), rows = Math.ceil((WarMapData.HALF_H * 2) / cell);
        context.fillStyle = "rgba(0,0,0,.86)";
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const world = { x: col * cell + cell / 2 - WarMapData.HALF_W, y: row * cell + cell / 2 - WarMapData.HALF_H };
                if (engine.vision.isVisible(transform.team, world.x, world.y))
                    continue;
                const p = transform.toMap({ x: col * cell - WarMapData.HALF_W, y: row * cell - WarMapData.HALF_H }, width, height);
                const q = transform.toMap({ x: (col + 1) * cell - WarMapData.HALF_W, y: (row + 1) * cell - WarMapData.HALF_H }, width, height);
                context.fillRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x) + 0.5, Math.abs(q.y - p.y) + 0.5);
            }
        }
    }
    static paintPaths(context, width, height, engine, transform) {
        context.lineWidth = 3;
        engine.players[transform.team].squads.forEach((squad, index) => {
            if (squad.path.length === 0)
                return;
            context.strokeStyle = WarPalette.SQUAD_COLORS[index];
            context.beginPath();
            const start = transform.toMap(squad.anchor, width, height);
            context.moveTo(start.x, start.y);
            for (const point of squad.path) {
                const p = transform.toMap(point, width, height);
                context.lineTo(p.x, p.y);
            }
            context.stroke();
        });
    }
    static paintEntities(context, width, height, engine, transform) {
        for (const entity of engine.entities) {
            if (!entity.alive)
                continue;
            const mine = entity.team === transform.team;
            if (!mine && !engine.vision.isVisible(transform.team, entity.x, entity.y))
                continue;
            const p = transform.toMap(entity, width, height);
            if (entity instanceof WarBuilding) {
                const size = entity.def.type === "hq" ? 9 : 6;
                context.fillStyle = mine ? "#7CE0A8" : WarPalette.ENEMY;
                context.fillRect(p.x - size / 2, p.y - size / 2, size, size);
                continue;
            }
            const unit = entity;
            context.fillStyle = mine ? WarPalette.SQUAD_COLORS[Math.max(0, unit.squadIndex)] : WarPalette.ENEMY;
            context.beginPath();
            context.arc(p.x, p.y, unit.def.pop > 1 ? 3.4 : 2.5, 0, Math.PI * 2);
            context.fill();
        }
    }
}
class WarMinimap {
    constructor(pulses) {
        this.pulses = pulses;
        this.onJump = () => undefined;
        this.canvas = WarDom.byId("minimap");
        this.context = this.canvas.getContext("2d");
        this.pendingJump = null;
        this.pendingFresh = false;
        const jump = (event) => {
            const rect = this.canvas.getBoundingClientRect();
            this.pendingJump = { x: ((event.clientX - rect.left) / rect.width) * this.canvas.width, y: ((event.clientY - rect.top) / rect.height) * this.canvas.height };
            event.preventDefault();
        };
        this.canvas.addEventListener("pointerdown", (event) => { jump(event); this.pendingFresh = true; this.canvas.setPointerCapture(event.pointerId); });
    }
    update(engine, transform, focus) {
        if (this.pendingJump) {
            this.onJump(transform.mapToWorld(this.pendingJump.x, this.pendingJump.y, this.canvas.width, this.canvas.height), this.pendingFresh);
            this.pendingJump = null;
            this.pendingFresh = false;
        }
        WarMapPainter.paint(this.context, this.canvas.width, this.canvas.height, engine, transform, false, transform.sceneToWorld(focus.x, focus.z), this.pulses);
    }
}
class WarAttackMapOverlay {
    constructor(sink, teamOf, transformOf, pulses) {
        this.sink = sink;
        this.teamOf = teamOf;
        this.transformOf = transformOf;
        this.pulses = pulses;
        this.overlay = WarDom.byId("attackMap");
        this.canvas = WarDom.byId("attackCanvas");
        this.context = this.canvas.getContext("2d");
        this.squadButtons = [];
        this.chosenSquad = -1;
        this.drawing = [];
        for (let index = 0; index < WarBalance.SQUAD_COUNT; index++) {
            const button = WarDom.byId("sqBtn" + index);
            button.style.setProperty("--squad", WarPalette.SQUAD_COLORS[index]);
            button.addEventListener("click", () => this.choose(index));
            this.squadButtons.push(button);
        }
        WarDom.byId("btnRecall").addEventListener("click", () => {
            if (this.chosenSquad >= 0)
                this.sink(new WarRecallCommand(this.teamOf(), this.chosenSquad));
        });
        WarDom.byId("btnCloseMap").addEventListener("click", () => this.close());
        this.canvas.addEventListener("pointerdown", (event) => this.startDrawing(event));
        this.canvas.addEventListener("pointermove", (event) => this.continueDrawing(event));
        this.canvas.addEventListener("pointerup", (event) => this.finishDrawing(event));
        this.canvas.addEventListener("pointercancel", () => { this.drawing = []; });
    }
    get isOpen() {
        return !this.overlay.hidden;
    }
    open(squad = -1) {
        this.overlay.hidden = false;
        this.fitCanvas();
        if (squad >= 0)
            this.choose(squad);
        else if (this.chosenSquad < 0)
            this.choose(0);
    }
    close() {
        this.overlay.hidden = true;
        this.drawing = [];
    }
    update(engine) {
        if (!this.isOpen)
            return;
        const transform = this.transformOf();
        WarMapPainter.paint(this.context, this.canvas.width, this.canvas.height, engine, transform, true, null, this.pulses);
        if (this.drawing.length > 1 && this.chosenSquad >= 0) {
            this.context.strokeStyle = WarPalette.SQUAD_COLORS[this.chosenSquad];
            this.context.lineWidth = 4;
            this.context.setLineDash([8, 6]);
            this.context.beginPath();
            this.drawing.forEach((p, i) => (i === 0 ? this.context.moveTo(p.x, p.y) : this.context.lineTo(p.x, p.y)));
            this.context.stroke();
            this.context.setLineDash([]);
        }
        this.squadButtons.forEach((button, index) => {
            const size = engine.players[this.teamOf()].squads[index].members.length;
            button.textContent = WarSquadNames.of(index) + " (" + size + ")";
            button.classList.toggle("selected", index === this.chosenSquad);
        });
    }
    choose(index) {
        this.chosenSquad = index;
    }
    fitCanvas() {
        const box = WarDom.byId("attackBox").getBoundingClientRect();
        const ratio = (WarMapData.HALF_W * 2) / (WarMapData.HALF_H * 2);
        const height = Math.max(240, Math.min(box.height, box.width / ratio));
        this.canvas.height = Math.round(height);
        this.canvas.width = Math.round(height * ratio);
    }
    localPoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: ((event.clientX - rect.left) / rect.width) * this.canvas.width, y: ((event.clientY - rect.top) / rect.height) * this.canvas.height };
    }
    startDrawing(event) {
        if (this.chosenSquad < 0)
            return;
        this.canvas.setPointerCapture(event.pointerId);
        this.drawing = [this.localPoint(event)];
        event.preventDefault();
    }
    continueDrawing(event) {
        if (this.drawing.length === 0)
            return;
        const point = this.localPoint(event);
        const last = this.drawing[this.drawing.length - 1];
        if (Math.hypot(point.x - last.x, point.y - last.y) >= 6)
            this.drawing.push(point);
    }
    finishDrawing(event) {
        if (this.drawing.length === 0)
            return;
        this.drawing.push(this.localPoint(event));
        const transform = this.transformOf();
        const waypoints = this.simplify(this.drawing).map((p) => transform.mapToWorld(p.x, p.y, this.canvas.width, this.canvas.height));
        this.drawing = [];
        if (waypoints.length > 0)
            this.sink(new WarAttackPathCommand(this.teamOf(), this.chosenSquad, waypoints));
    }
    simplify(points) {
        const minGap = this.canvas.height * 0.07;
        const result = [];
        for (const point of points) {
            const last = result[result.length - 1];
            if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= minGap)
                result.push(point);
        }
        const end = points[points.length - 1];
        const tail = result[result.length - 1];
        if (tail !== end && Math.hypot(end.x - tail.x, end.y - tail.y) > 4)
            result.push(end);
        return result;
    }
}
