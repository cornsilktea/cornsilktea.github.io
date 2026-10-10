type WarDifficulty = "easy" | "normal" | "hard";

interface WarInputHandlers {
  tap: (clientX: number, clientY: number, touch: boolean) => void;
  command: (clientX: number, clientY: number) => void;
}

class WarInputController {
  private static readonly DRAG_PIXELS = 9;
  private static readonly KEY_PAN_SPEED = 34;

  private readonly held = new Set<string>();
  private pointerStart: WarPoint | null = null;
  private pointerLast: WarPoint | null = null;
  private dragging = false;
  private button = 0;
  private touch = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly world: WarWorldView, private readonly handlers: WarInputHandlers, private readonly isActive: () => boolean) {
    canvas.addEventListener("pointerdown", (event) => this.onDown(event));
    canvas.addEventListener("pointermove", (event) => this.onMove(event));
    canvas.addEventListener("pointerup", (event) => this.onUp(event));
    canvas.addEventListener("pointercancel", () => this.reset());
    canvas.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    window.addEventListener("keydown", (event) => this.held.add(this.keyOf(event)));
    window.addEventListener("keyup", (event) => this.held.delete(this.keyOf(event)));
    window.addEventListener("blur", () => this.held.clear());
  }

  update(deltaSeconds: number): void {
    if (!this.isActive()) return;
    const step = WarInputController.KEY_PAN_SPEED * deltaSeconds;
    const dx = (this.held.has("right") ? 1 : 0) - (this.held.has("left") ? 1 : 0);
    const dz = (this.held.has("down") ? 1 : 0) - (this.held.has("up") ? 1 : 0);
    if (dx !== 0 || dz !== 0) this.world.rig.pan(dx * step, dz * step);
  }

  private keyOf(event: KeyboardEvent): string {
    if (event.code === "KeyW" || event.key === "ArrowUp") return "up";
    if (event.code === "KeyS" || event.key === "ArrowDown") return "down";
    if (event.code === "KeyA" || event.key === "ArrowLeft") return "left";
    if (event.code === "KeyD" || event.key === "ArrowRight") return "right";
    return event.code;
  }

  private onDown(event: PointerEvent): void {
    if (!this.isActive()) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.button = event.button;
    this.touch = event.pointerType === "touch";
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.pointerLast = { x: event.clientX, y: event.clientY };
    this.dragging = false;
  }

  private onMove(event: PointerEvent): void {
    if (!this.pointerStart || !this.pointerLast) return;
    if (this.button === 2) return;
    if (!this.dragging && Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > WarInputController.DRAG_PIXELS) this.dragging = true;
    if (!this.dragging) return;
    const before = this.world.groundPoint(this.pointerLast.x, this.pointerLast.y);
    const after = this.world.groundPoint(event.clientX, event.clientY);
    if (before && after) this.world.rig.pan(before.x - after.x, before.z - after.z);
    this.pointerLast = { x: event.clientX, y: event.clientY };
  }

  private onUp(event: PointerEvent): void {
    const wasTap = this.pointerStart !== null && !this.dragging;
    const button = this.button;
    const touch = this.touch;
    this.reset();
    if (!this.isActive()) return;
    if (button === 2) this.handlers.command(event.clientX, event.clientY);
    else if (wasTap && button === 0) this.handlers.tap(event.clientX, event.clientY, touch);
  }

  private onWheel(event: WheelEvent): void {
    if (!this.isActive()) return;
    event.preventDefault();
    this.world.rig.zoomBy(event.deltaY > 0 ? 1.08 : 0.92);
  }

  private reset(): void {
    this.pointerStart = null;
    this.pointerLast = null;
    this.dragging = false;
  }
}

class WarLocalMatch {
  private static readonly TEST_SPEED = Math.max(1, Math.min(8, Number(new URLSearchParams(window.location.search).get("speed")) || 1));

  readonly engine: WarEngine;
  readonly view: WarMatchView;
  private readonly bot: WarBotBrain;
  private accumulatorMs = 0;

  constructor(libs: ThreeLibs, assets: WarAssetLibrary, world: WarWorldView, readonly viewer: WarTeam, level: WarDifficulty, factions: [WarFactionId, WarFactionId], private readonly onEvent: (event: WarEvent) => void) {
    const seed = (Math.random() * 0x7fffffff) | 0;
    this.engine = new WarEngine({ seed, factions });
    this.bot = WarBotFactory.create(level, viewer === 0 ? 1 : 0, seed ^ 0x5bd1e995);
    this.view = new WarMatchView(libs, assets, world, this.engine, viewer);
  }

  get alpha(): number {
    return Math.min(1, this.accumulatorMs / WarBalance.TICK_MS);
  }

  get finished(): boolean {
    return this.engine.result !== null;
  }

  advance(deltaSeconds: number): void {
    if (this.finished) return;
    this.accumulatorMs += Math.min(250, deltaSeconds * 1000) * WarLocalMatch.TEST_SPEED;
    let stepped = false;
    while (this.accumulatorMs >= WarBalance.TICK_MS && !this.finished) {
      this.accumulatorMs -= WarBalance.TICK_MS;
      this.bot.act(this.engine);
      this.engine.step();
      stepped = true;
      for (const event of this.engine.drainEvents()) this.onEvent(event);
    }
    if (stepped) this.view.onTick();
  }

  dispose(): void {
    this.view.dispose();
  }
}

class WarGameApp {
  private readonly canvas = WarDom.byId<HTMLCanvasElement>("view");
  private readonly world: WarWorldView;
  private readonly assets: WarAssetLibrary;
  private readonly backdrop: WarMenuBackdrop;
  private readonly portraits: WarPortraits;
  private readonly input: WarInputController;
  private readonly topBar = new WarTopBar();
  private readonly notice = new WarNotice();
  private readonly squadPanel = new WarSquadPanel();
  private readonly commandCard = new WarCommandCard();
  private readonly infoPanel = new WarInfoPanel();
  private readonly alertPulses = new WarAlertPulses();
  private readonly minimap = new WarMinimap(this.alertPulses);
  private readonly attackMap: WarAttackMapOverlay;
  private match: WarLocalMatch | null = null;
  private selection: WarSelection = { kind: "none" };
  private level: WarDifficulty = "normal";
  private myFaction: WarFactionId = "adventurer";
  private foeChoice: WarFactionId | "random" = "random";
  private lastFrameMs = 0;
  private frameCount = 0;
  private ready = false;

  constructor(private readonly libs: ThreeLibs) {
    const touchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    this.world = new WarWorldView(libs, this.canvas, touchDevice);
    WarBalanceText.fill(document);
    this.assets = new WarAssetLibrary(libs);
    this.backdrop = new WarMenuBackdrop(libs, this.assets, this.world);
    this.portraits = new WarPortraits(libs, this.assets);
    this.commandCard.portraits = this.portraits;
    this.input = new WarInputController(this.canvas, this.world, { tap: (x, y, touch) => this.onTap(x, y, touch), command: (x, y) => this.onCommandClick(x, y) }, () => this.match !== null && !this.attackMap.isOpen);
    this.attackMap = new WarAttackMapOverlay((command) => this.sendCommand(command), () => this.viewer, () => (this.match as WarLocalMatch).view.transform, this.alertPulses);
    this.bindUi();
    this.loadAssets();
    requestAnimationFrame((now) => this.frame(now));
  }

  private get viewer(): WarTeam {
    return this.match ? this.match.viewer : 0;
  }

  private async loadAssets(): Promise<void> {
    const note = WarDom.byId("loadNote");
    try {
      await this.assets.load();
      this.ready = true;
      note.textContent = "";
      WarDom.byId<HTMLButtonElement>("btnStart").disabled = false;
      this.backdrop.show();
    } catch (error) {
      note.textContent = "모델을 불러오지 못했어요. 새로고침해 주세요.";
    }
  }

  private bindUi(): void {
    document.querySelectorAll<HTMLElement>("[data-level]").forEach((button) => {
      button.addEventListener("click", () => {
        this.level = button.dataset.level as WarDifficulty;
        document.querySelectorAll<HTMLElement>("[data-level]").forEach((other) => other.classList.toggle("on", other === button));
      });
    });
    this.bindChoice("data-mine", (value) => { this.myFaction = value as WarFactionId; });
    this.bindChoice("data-foe", (value) => { this.foeChoice = value as WarFactionId | "random"; });
    WarDom.byId("btnStart").addEventListener("click", () => this.startMatch());
    WarDom.byId("btnAgain").addEventListener("click", () => this.startMatch());
    WarDom.byId("btnToMenu").addEventListener("click", () => this.showMenu());
    WarDom.byId("btnSurrender").addEventListener("click", () => {
      if (this.match && window.confirm("항복할까요?")) this.sendCommand(new WarSurrenderCommand(this.viewer));
    });
    this.squadPanel.onSelect = (index) => this.select({ kind: "squad", index });
    this.minimap.onJump = () => this.onMinimap();
    window.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.attackMap.close();
      if (event.code === "Space" && this.match) this.attackMap.isOpen ? this.attackMap.close() : this.attackMap.open();
    });
  }

  private bindChoice(attribute: string, onChoose: (value: string) => void): void {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>("[" + attribute + "]"));
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        onChoose(button.getAttribute(attribute) as string);
        buttons.forEach((other) => other.classList.toggle("on", other === button));
      });
    });
  }

  private startMatch(): void {
    if (!this.ready) return;
    if (this.match) this.match.dispose();
    this.backdrop.hide();
    const viewer = (Math.random() < 0.5 ? 0 : 1) as WarTeam;
    const foe: WarFactionId = this.foeChoice === "random" ? (Math.random() < 0.5 ? "adventurer" : "grave") : this.foeChoice;
    const factions: [WarFactionId, WarFactionId] = viewer === 0 ? [this.myFaction, foe] : [foe, this.myFaction];
    this.portraits.warm(this.myFaction);
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

  private showMenu(): void {
    if (this.match) this.match.dispose();
    this.match = null;
    this.world.playing = false;
    WarDom.byId("startScreen").hidden = false;
    WarDom.byId("endScreen").hidden = true;
    WarDom.byId("gameUi").hidden = true;
    this.attackMap.close();
    this.backdrop.show();
  }

  private sendCommand(command: WarCommand): void {
    if (this.match) this.match.engine.submit(command);
  }

  private select(selection: WarSelection): void {
    this.selection = selection;
    if (this.match) this.match.view.setSelection(selection);
  }

  private onTap(clientX: number, clientY: number, touch: boolean): void {
    if (!this.match) return;
    const picked = this.match.view.pick(clientX, clientY);
    if (touch && this.canOrder() && !this.isOwnPick(picked, this.match)) {
      this.onCommandClick(clientX, clientY);
      return;
    }
    this.select(picked);
  }

  private onCommandClick(clientX: number, clientY: number): void {
    if (!this.match || !this.canOrder()) return;
    const point = this.match.view.groundWorld(clientX, clientY);
    if (point) this.orderTo(point);
  }

  private onMinimap(): void {
    this.attackMap.open(this.selection.kind === "squad" ? this.selection.index : -1);
  }

  private isOwnPick(picked: WarSelection, match: WarLocalMatch): boolean {
    if (picked.kind === "slot") return true;
    if (picked.kind !== "unit" && picked.kind !== "building") return false;
    const entity = match.engine.entityById(picked.id);
    return !!entity && entity.team === match.viewer;
  }

  private canOrder(): boolean {
    if (!this.match) return false;
    if (this.selection.kind === "squad") return true;
    if (this.selection.kind !== "unit") return false;
    const entity = this.match.engine.entityById(this.selection.id);
    return entity instanceof WarUnit && entity.team === this.match.viewer && entity.alive;
  }

  private orderTo(point: WarPoint): void {
    const selection = this.selection;
    if (selection.kind === "squad") {
      this.sendCommand(new WarAttackPathCommand(this.viewer, selection.index, [point]));
      this.notice.show(WarSquadNames.of(selection.index) + "이(가) 이동해요.");
    } else if (selection.kind === "unit") {
      this.sendCommand(new WarMoveUnitCommand(this.viewer, selection.id, point));
    }
  }

  private onEvent(event: WarEvent): void {
    if (!this.match) return;
    this.match.view.handleEvent(event);
    if (event.kind === "produced" && event.team === this.viewer) this.notice.show(event.text + "이(가) 생산되었습니다.");
    else if (event.kind === "built" && event.team === this.viewer) this.notice.show(event.text + " 건설이 끝났어요.");
    else if (event.kind === "buildingDestroyed") this.notice.show((event.team === this.viewer ? "우리 " : "적 ") + event.text + "이(가) 부서졌어요!");
    else if (event.kind === "alert" && event.team === this.viewer) this.raiseAlert(event);
    else if (event.kind === "ended") this.showResult(event.winner as WarWinner);
  }

  private raiseAlert(event: WarEvent): void {
    this.alertPulses.add({ x: event.x as number, y: event.y as number });
    this.notice.show(event.text);
  }

  private showResult(winner: WarWinner): void {
    const match = this.match as WarLocalMatch;
    const engine = match.engine;
    const result = engine.result as WarResult;
    const mine = engine.players[match.viewer];
    const title = winner === 2 ? "무승부" : winner === match.viewer ? "승리!" : "패배";
    WarDom.byId("endTitle").textContent = title;
    const reasons: Record<WarEndReason, string> = { hq: "본부가 부서졌어요.", time: "15분이 지나 본부 체력으로 정했어요.", surrender: "항복으로 끝났어요." };
    WarDom.byId("endReason").textContent = reasons[result.reason];
    WarDom.byId("endStats").textContent = "걸린 시간 " + WarTimeText.clock(result.tick) + " · 만든 병력 " + mine.unitsProduced + " · 잃은 병력 " + mine.unitsLost;
    WarDom.byId("endScreen").hidden = false;
    WarDom.byId("gameUi").hidden = true;
    this.attackMap.close();
    this.world.playing = false;
  }

  private validateSelection(match: WarLocalMatch): void {
    const selection = this.selection;
    if (selection.kind === "unit" || selection.kind === "building") {
      const entity = match.engine.entityById(selection.id);
      if (!entity || !entity.alive) this.select({ kind: "none" });
    } else if (selection.kind === "slot" && match.engine.players[match.viewer].slotBuildings[selection.index]) {
      const building = match.engine.players[match.viewer].slotBuildings[selection.index] as WarBuilding;
      this.select({ kind: "building", id: building.id });
    }
  }

  private updateHud(match: WarLocalMatch): void {
    const engine = match.engine;
    this.validateSelection(match);
    this.topBar.update(engine, match.viewer);
    this.notice.update();
    this.squadPanel.update(engine.players[match.viewer], this.selection);
    this.commandCard.update(this.selection, engine, match.viewer, (command) => this.sendCommand(command), () => this.select({ kind: "none" }));
    this.infoPanel.update(this.selection, engine, match.viewer);
    if (this.frameCount % 2 === 0) this.minimap.update(engine, match.view.transform, this.world.rig.focus);
    this.attackMap.update(engine);
  }

  private frame(nowMs: number): void {
    const deltaSeconds = this.lastFrameMs === 0 ? 0.016 : Math.min(0.1, (nowMs - this.lastFrameMs) / 1000);
    this.lastFrameMs = nowMs;
    this.frameCount++;
    this.input.update(deltaSeconds);
    if (this.match) {
      this.match.advance(deltaSeconds);
      this.match.view.render(this.match.alpha, deltaSeconds);
      this.updateHud(this.match);
    } else if (this.ready) {
      this.backdrop.render(deltaSeconds);
    }
    this.world.render(deltaSeconds);
    requestAnimationFrame((next) => this.frame(next));
  }
}
