"use strict";
class WarInputController {
    constructor(canvas, world, handlers, isActive) {
        this.canvas = canvas;
        this.world = world;
        this.handlers = handlers;
        this.isActive = isActive;
        this.held = new Set();
        this.pointerStart = null;
        this.pointerLast = null;
        this.dragging = false;
        this.button = 0;
        canvas.addEventListener("pointerdown", (event) => this.onDown(event));
        canvas.addEventListener("pointermove", (event) => this.onMove(event));
        canvas.addEventListener("pointerup", (event) => this.onUp(event));
        canvas.addEventListener("pointercancel", () => this.reset());
        canvas.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
        window.addEventListener("keydown", (event) => this.held.add(this.keyOf(event)));
        window.addEventListener("keyup", (event) => this.held.delete(this.keyOf(event)));
        window.addEventListener("blur", () => this.held.clear());
    }
    update(deltaSeconds) {
        if (!this.isActive())
            return;
        const step = WarInputController.KEY_PAN_SPEED * deltaSeconds;
        const dx = (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
        const dz = (this.held.has("down") ? 1 : 0) - (this.held.has("up") ? 1 : 0);
        if (dx !== 0 || dz !== 0)
            this.world.rig.pan(dx * step, dz * step);
    }
    keyOf(event) {
        if (event.code === "KeyW" || event.key === "ArrowUp")
            return "up";
        if (event.code === "KeyS" || event.key === "ArrowDown")
            return "down";
        if (event.code === "KeyA" || event.key === "ArrowLeft")
            return "left";
        if (event.code === "KeyD" || event.key === "ArrowRight")
            return "right";
        return event.code;
    }
    onDown(event) {
        if (!this.isActive())
            return;
        this.canvas.setPointerCapture(event.pointerId);
        this.button = event.button;
        this.pointerStart = { x: event.clientX, y: event.clientY };
        this.pointerLast = { x: event.clientX, y: event.clientY };
        this.dragging = false;
    }
    onMove(event) {
        if (!this.pointerStart || !this.pointerLast)
            return;
        if (!this.dragging && Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > WarInputController.DRAG_PIXELS)
            this.dragging = true;
        if (!this.dragging)
            return;
        const before = this.world.groundPoint(this.pointerLast.x, this.pointerLast.y);
        const after = this.world.groundPoint(event.clientX, event.clientY);
        if (before && after)
            this.world.rig.pan(before.x - after.x, before.z - after.z);
        this.pointerLast = { x: event.clientX, y: event.clientY };
    }
    onUp(event) {
        const wasTap = this.pointerStart !== null && !this.dragging;
        const button = this.button;
        this.reset();
        if (!wasTap || !this.isActive())
            return;
        if (button === 2)
            this.handlers.command(event.clientX, event.clientY);
        else
            this.handlers.tap(event.clientX, event.clientY);
    }
    onWheel(event) {
        if (!this.isActive())
            return;
        event.preventDefault();
        this.world.rig.zoomBy(event.deltaY > 0 ? 1.08 : 0.92);
    }
    reset() {
        this.pointerStart = null;
        this.pointerLast = null;
        this.dragging = false;
    }
}
WarInputController.DRAG_PIXELS = 9;
WarInputController.KEY_PAN_SPEED = 34;
class WarLocalMatch {
    constructor(libs, assets, world, viewer, level, factions, onEvent) {
        this.viewer = viewer;
        this.onEvent = onEvent;
        this.accumulatorMs = 0;
        const seed = (Math.random() * 0x7fffffff) | 0;
        this.engine = new WarEngine({ seed, factions });
        this.bot = WarBotFactory.create(level, viewer === 0 ? 1 : 0, seed ^ 0x5bd1e995);
        this.view = new WarMatchView(libs, assets, world, this.engine, viewer);
    }
    get alpha() {
        return Math.min(1, this.accumulatorMs / WarBalance.TICK_MS);
    }
    get finished() {
        return this.engine.result !== null;
    }
    advance(deltaSeconds) {
        if (this.finished)
            return;
        this.accumulatorMs += Math.min(250, deltaSeconds * 1000) * WarLocalMatch.TEST_SPEED;
        let stepped = false;
        while (this.accumulatorMs >= WarBalance.TICK_MS && !this.finished) {
            this.accumulatorMs -= WarBalance.TICK_MS;
            this.bot.act(this.engine);
            this.engine.step();
            stepped = true;
            for (const event of this.engine.drainEvents())
                this.onEvent(event);
        }
        if (stepped)
            this.view.onTick();
    }
    dispose() {
        this.view.dispose();
    }
}
WarLocalMatch.TEST_SPEED = Math.max(1, Math.min(8, Number(new URLSearchParams(window.location.search).get("speed")) || 1));
class WarGameApp {
    constructor(libs) {
        this.libs = libs;
        this.canvas = WarDom.byId("view");
        this.topBar = new WarTopBar();
        this.notice = new WarNotice();
        this.squadPanel = new WarSquadPanel();
        this.commandCard = new WarCommandCard();
        this.infoPanel = new WarInfoPanel();
        this.alertPulses = new WarAlertPulses();
        this.minimap = new WarMinimap(this.alertPulses);
        this.match = null;
        this.selection = { kind: "none" };
        this.level = "normal";
        this.myFaction = "pioneer";
        this.foeChoice = "random";
        this.lastFrameMs = 0;
        this.frameCount = 0;
        this.ready = false;
        const touchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
        this.world = new WarWorldView(libs, this.canvas, touchDevice);
        this.assets = new WarAssetLibrary(libs);
        this.backdrop = new WarMenuBackdrop(libs, this.assets, this.world);
        this.input = new WarInputController(this.canvas, this.world, { tap: (x, y) => this.onTap(x, y), command: (x, y) => this.onCommandClick(x, y) }, () => this.match !== null && !this.attackMap.isOpen);
        this.attackMap = new WarAttackMapOverlay((command) => this.sendCommand(command), () => this.viewer, () => this.match.view.transform, this.alertPulses);
        this.bindUi();
        this.loadAssets();
        requestAnimationFrame((now) => this.frame(now));
    }
    get viewer() {
        return this.match ? this.match.viewer : 0;
    }
    async loadAssets() {
        const note = WarDom.byId("loadNote");
        try {
            await this.assets.load();
            this.ready = true;
            note.textContent = "";
            WarDom.byId("btnStart").disabled = false;
            this.backdrop.show();
        }
        catch (error) {
            note.textContent = "모델을 불러오지 못했어요. 새로고침해 주세요.";
        }
    }
    bindUi() {
        document.querySelectorAll("[data-level]").forEach((button) => {
            button.addEventListener("click", () => {
                this.level = button.dataset.level;
                document.querySelectorAll("[data-level]").forEach((other) => other.classList.toggle("on", other === button));
            });
        });
        this.bindChoice("data-mine", (value) => { this.myFaction = value; });
        this.bindChoice("data-foe", (value) => { this.foeChoice = value; });
        WarDom.byId("btnStart").addEventListener("click", () => this.startMatch());
        WarDom.byId("btnAgain").addEventListener("click", () => this.startMatch());
        WarDom.byId("btnToMenu").addEventListener("click", () => this.showMenu());
        WarDom.byId("btnSurrender").addEventListener("click", () => {
            if (this.match && window.confirm("항복할까요?"))
                this.sendCommand(new WarSurrenderCommand(this.viewer));
        });
        this.squadPanel.onSelect = (index) => this.select({ kind: "squad", index });
        this.minimap.onJump = (point, fresh) => this.onMinimap(point, fresh);
        window.addEventListener("contextmenu", (event) => event.preventDefault());
        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape")
                this.attackMap.close();
            if (event.code === "Space" && this.match)
                this.attackMap.isOpen ? this.attackMap.close() : this.attackMap.open();
        });
    }
    bindChoice(attribute, onChoose) {
        const buttons = Array.from(document.querySelectorAll("[" + attribute + "]"));
        buttons.forEach((button) => {
            button.addEventListener("click", () => {
                onChoose(button.getAttribute(attribute));
                buttons.forEach((other) => other.classList.toggle("on", other === button));
            });
        });
    }
    startMatch() {
        if (!this.ready)
            return;
        if (this.match)
            this.match.dispose();
        this.backdrop.hide();
        const viewer = (Math.random() < 0.5 ? 0 : 1);
        const foe = this.foeChoice === "random" ? (Math.random() < 0.5 ? "pioneer" : "grave") : this.foeChoice;
        const factions = viewer === 0 ? [this.myFaction, foe] : [foe, this.myFaction];
        this.match = new WarLocalMatch(this.libs, this.assets, this.world, viewer, this.level, factions, (event) => this.onEvent(event));
        this.selection = { kind: "none" };
        this.world.playing = true;
        this.notice.reset();
        this.alertPulses.clear();
        this.attackMap.close();
        WarDom.byId("startScreen").hidden = true;
        WarDom.byId("endScreen").hidden = true;
        WarDom.byId("gameUi").hidden = false;
        this.notice.show(viewer === 0 ? "기지는 화면 아래쪽이에요. 빈 터를 눌러 건물을 지어 보세요." : "기지가 화면 아래로 보이도록 지도를 돌려 놓았어요.");
    }
    showMenu() {
        if (this.match)
            this.match.dispose();
        this.match = null;
        this.world.playing = false;
        WarDom.byId("startScreen").hidden = false;
        WarDom.byId("endScreen").hidden = true;
        WarDom.byId("gameUi").hidden = true;
        this.attackMap.close();
        this.backdrop.show();
    }
    sendCommand(command) {
        if (this.match)
            this.match.engine.submit(command);
    }
    select(selection) {
        this.selection = selection;
        if (this.match)
            this.match.view.setSelection(selection);
    }
    onTap(clientX, clientY) {
        if (!this.match)
            return;
        const picked = this.match.view.pick(clientX, clientY);
        if (this.canOrder() && !this.isOwnPick(picked, this.match)) {
            this.onCommandClick(clientX, clientY);
            return;
        }
        this.select(picked);
    }
    onCommandClick(clientX, clientY) {
        if (!this.match || !this.canOrder())
            return;
        const point = this.match.view.groundWorld(clientX, clientY);
        if (point)
            this.orderTo(point);
    }
    onMinimap(point, fresh) {
        if (fresh && this.selection.kind === "unit" && this.canOrder())
            this.orderTo(point);
        else
            this.attackMap.open(this.selection.kind === "squad" ? this.selection.index : -1);
    }
    isOwnPick(picked, match) {
        if (picked.kind === "slot")
            return true;
        if (picked.kind !== "unit" && picked.kind !== "building")
            return false;
        const entity = match.engine.entityById(picked.id);
        return !!entity && entity.team === match.viewer;
    }
    canOrder() {
        if (!this.match)
            return false;
        if (this.selection.kind === "squad")
            return true;
        if (this.selection.kind !== "unit")
            return false;
        const entity = this.match.engine.entityById(this.selection.id);
        return entity instanceof WarUnit && entity.team === this.match.viewer && entity.alive;
    }
    orderTo(point) {
        const selection = this.selection;
        if (selection.kind === "squad") {
            this.sendCommand(new WarAttackPathCommand(this.viewer, selection.index, [point]));
            this.notice.show("부대 " + (selection.index + 1) + "이(가) 이동해요.");
        }
        else if (selection.kind === "unit") {
            this.sendCommand(new WarMoveUnitCommand(this.viewer, selection.id, point));
        }
    }
    onEvent(event) {
        if (!this.match)
            return;
        this.match.view.handleEvent(event);
        if (event.kind === "produced" && event.team === this.viewer)
            this.notice.show(event.text + "이(가) 생산되었습니다.");
        else if (event.kind === "built" && event.team === this.viewer)
            this.notice.show(event.text + " 건설이 끝났어요.");
        else if (event.kind === "buildingDestroyed")
            this.notice.show((event.team === this.viewer ? "우리 " : "적 ") + event.text + "이(가) 부서졌어요!");
        else if (event.kind === "alert" && event.team === this.viewer)
            this.raiseAlert(event);
        else if (event.kind === "ended")
            this.showResult(event.winner);
    }
    raiseAlert(event) {
        this.alertPulses.add({ x: event.x, y: event.y });
        this.notice.show(event.text);
    }
    showResult(winner) {
        const match = this.match;
        const engine = match.engine;
        const result = engine.result;
        const mine = engine.players[match.viewer];
        const title = winner === 2 ? "무승부" : winner === match.viewer ? "승리!" : "패배";
        WarDom.byId("endTitle").textContent = title;
        const reasons = { hq: "사령부가 부서졌어요.", time: "15분이 지나 사령부 체력으로 정했어요.", surrender: "항복으로 끝났어요." };
        WarDom.byId("endReason").textContent = reasons[result.reason];
        WarDom.byId("endStats").textContent = "걸린 시간 " + WarTimeText.clock(result.tick) + " · 만든 병력 " + mine.unitsProduced + " · 잃은 병력 " + mine.unitsLost;
        WarDom.byId("endScreen").hidden = false;
        WarDom.byId("gameUi").hidden = true;
        this.attackMap.close();
        this.world.playing = false;
    }
    validateSelection(match) {
        const selection = this.selection;
        if (selection.kind === "unit" || selection.kind === "building") {
            const entity = match.engine.entityById(selection.id);
            if (!entity || !entity.alive)
                this.select({ kind: "none" });
        }
        else if (selection.kind === "slot" && match.engine.players[match.viewer].slotBuildings[selection.index]) {
            const building = match.engine.players[match.viewer].slotBuildings[selection.index];
            this.select({ kind: "building", id: building.id });
        }
    }
    updateHud(match) {
        const engine = match.engine;
        this.validateSelection(match);
        this.topBar.update(engine, match.viewer);
        this.notice.update();
        this.squadPanel.update(engine.players[match.viewer], this.selection);
        this.commandCard.update(this.selection, engine, match.viewer, (command) => this.sendCommand(command), () => this.select({ kind: "none" }));
        this.infoPanel.update(this.selection, engine, match.viewer);
        if (this.frameCount % 2 === 0)
            this.minimap.update(engine, match.view.transform, this.world.rig.focus);
        this.attackMap.update(engine);
    }
    frame(nowMs) {
        const deltaSeconds = this.lastFrameMs === 0 ? 0.016 : Math.min(0.1, (nowMs - this.lastFrameMs) / 1000);
        this.lastFrameMs = nowMs;
        this.frameCount++;
        this.input.update(deltaSeconds);
        if (this.match) {
            this.match.advance(deltaSeconds);
            this.match.view.render(this.match.alpha, deltaSeconds);
            this.updateHud(this.match);
        }
        else if (this.ready) {
            this.backdrop.render(deltaSeconds);
        }
        this.world.render(deltaSeconds);
        requestAnimationFrame((next) => this.frame(next));
    }
}
