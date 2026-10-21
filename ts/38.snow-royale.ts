type SnScreenName = "start" | "lobby" | "game" | "party";

class SnPlayOptions {
  readonly speed: number;
  readonly mode: SnMode;
  readonly seed: number;
  readonly offline: boolean;
  readonly watchOnly: boolean;
  readonly showNet: boolean;
  constructor(search: string) {
    const params = new URLSearchParams(search);
    this.speed = Math.max(0.25, Math.min(8, Number(params.get("speed")) || 1));
    this.mode = params.get("mode") === "solo" ? "solo" : "duos";
    this.seed = Number(params.get("seed")) || Math.floor(Math.random() * 1e9);
    this.watchOnly = params.has("watch");
    this.offline = params.has("offline") || this.watchOnly;
    this.showNet = params.has("net");
  }
}

class SnTimeText {
  static clock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
}

class SnBotLooks {
  static make(seed: number): CharacterLook {
    const random = new SnSeededRandom(seed);
    const look = CharacterLooks.createDefault();
    look.c = random.int(CharacterCatalog.RANDOM_TYPE_COUNT);
    CharacterCatalog.COLOR_PARTS.forEach((part) => { look.p[part.key] = random.next() < 0.15 ? 0 : 1 + random.int(part.set.length); });
    return look;
  }
}

class SnSpectatorState {
  watched = 0;
  overview = false;
  private switchAt = -1;

  pick(num: number): void { this.watched = num; this.overview = false; this.switchAt = -1; }
  toggleOverview(): void { this.overview = !this.overview; }

  step(engine: SnEngine, delta: number): void {
    const n = engine.players.length;
    for (let k = 1; k <= n; k++) {
      const num = (this.watched + delta * k + n * 4) % n;
      if (engine.players[num].life !== "out") { this.pick(num); return; }
    }
  }

  follow(engine: SnEngine, nowMs: number): void {
    const p = engine.players[this.watched];
    if (!p || p.life !== "out") { this.switchAt = -1; return; }
    if (this.switchAt < 0) { this.switchAt = nowMs + 2000; return; }
    if (nowMs < this.switchAt) return;
    const mate = engine.teams[p.team].members.find((m) => m.life === "alive" || m.life === "down");
    const best = mate || engine.players.filter((m) => m.life === "alive").sort((a, b) => b.kills - a.kills)[0];
    if (best) this.pick(best.num);
    this.switchAt = -1;
  }

  startFrom(engine: SnEngine, me: SnPlayer | null): void {
    if (!me) { const first = engine.players.find((m) => m.life !== "out"); this.pick(first ? first.num : 0); return; }
    const mate = engine.teams[me.team].members.find((m) => m !== me && (m.life === "alive" || m.life === "down"));
    const killer = me.killedBy >= 0 ? engine.players[me.killedBy] : null;
    const target = mate || (killer && killer.life !== "out" ? killer : null) || engine.players.find((m) => m.life === "alive");
    this.pick(target ? target.num : me.num);
  }
}

abstract class SnMatchDriver {
  abstract readonly engine: SnEngine;
  abstract readonly source: SnSceneSource;
  abstract readonly myNum: number;
  abstract tick(dt: number, nowMs: number): SnEvent[];
  readonly online: boolean = false;
  dispose(): void { return; }
}

class SnOfflineDriver extends SnMatchDriver {
  readonly engine: SnEngine;
  readonly myNum: number;
  private carry = 0;
  constructor(mode: SnMode, seed: number, me: SnHumanSeat | null, controls: SnLocalControls, private readonly speed: number) {
    super();
    const teams = me ? SnRosterPlanner.fill(mode, [me]) : SnRosterPlanner.allBots(mode);
    this.engine = new SnEngine({ seed, mode, teams });
    let mine = -1;
    this.engine.players.forEach((p) => {
      if (p.bot) this.engine.attach(p.num, new SnBotBrain(seed * 31 + p.num * 7919 + 1));
      else { this.engine.attach(p.num, new SnLocalPilot(controls)); mine = p.num; }
    });
    this.myNum = mine;
  }
  get source(): SnSceneSource { return this.engine; }
  tick(dt: number): SnEvent[] {
    const events: SnEvent[] = [];
    this.carry += dt * this.speed;
    let steps = 0;
    while (this.carry >= SnGame.STEP && steps < 40) { this.carry -= SnGame.STEP; steps++; this.engine.update(SnGame.STEP).forEach((e) => events.push(e)); }
    return events;
  }
}

class SnHostDriver extends SnMatchDriver {
  readonly online = true;
  readonly engine: SnEngine;
  readonly myNum: number;
  readonly director: SnHostDirector;
  private carry = 0;
  constructor(match: SnMatchRecord, session: RkSession<SnPlayerRecord>, controls: SnLocalControls, meter: SnNetMeter, private readonly speed: number) {
    super();
    this.engine = new SnEngine({ seed: match.seed, mode: match.mode, teams: match.teams });
    this.director = new SnHostDirector(this.engine, session, match, meter);
    let mine = -1;
    this.engine.players.forEach((p) => {
      if (p.bot) this.engine.attach(p.num, new SnBotBrain(match.seed * 31 + p.num * 7919 + 1));
      else if (p.id === session.myId) { this.engine.attach(p.num, new SnLocalPilot(controls)); mine = p.num; }
      else { const pilot = new SnRemotePilot(); this.engine.attach(p.num, pilot); this.director.remote.set(p.num, pilot); p.external = true; }
    });
    this.myNum = mine;
  }
  get source(): SnSceneSource { return this.engine; }
  receiveState(id: string, raw: string, nowMs: number): void {
    const p = this.engine.players.find((x) => x.id === id);
    if (p) this.director.receiveState(p.num, raw, nowMs);
  }
  playerLeft(id: string): void {
    const p = this.engine.players.find((x) => x.id === id);
    if (p && !p.bot) this.engine.disconnect(p.num);
  }
  tick(dt: number, nowMs: number): SnEvent[] {
    const events: SnEvent[] = [];
    this.carry += dt * this.speed;
    let steps = 0;
    while (this.carry >= SnGame.STEP && steps < 40) { this.carry -= SnGame.STEP; steps++; this.engine.update(SnGame.STEP).forEach((e) => events.push(e)); }
    this.director.collect(events);
    this.director.publish(nowMs);
    return events;
  }
}

class SnClientDriver extends SnMatchDriver {
  readonly online = true;
  readonly mirror: SnMirror;
  readonly myNum: number;
  private readonly body: SnLocalBody | null;
  constructor(readonly match: SnMatchRecord, private readonly session: RkSession<SnPlayerRecord>, private readonly controls: SnLocalControls, meter: SnNetMeter) {
    super();
    const teams = match.teams.flatMap((t) => t.members);
    this.myNum = teams.findIndex((m) => m.id === session.myId);
    this.mirror = new SnMirror(match, this.myNum);
    this.body = this.myNum >= 0 ? new SnLocalBody(this.mirror, this.myNum, session, meter) : null;
  }
  get engine(): SnEngine { return this.mirror.engine; }
  get source(): SnSceneSource { return this.mirror; }
  tick(dt: number, nowMs: number): SnEvent[] {
    const m = this.mirror, s = this.session;
    m.applySnap(s.value<string>("snap"), nowMs, true);
    m.applyWalls(s.value<string>("wall"));
    m.applyLoot(s.value<string>("loot"));
    const cleared = m.applySnowMap(s.value<string>("snowmap"));
    const events = m.takeEvents(s.value<string>("ev"));
    if (cleared.length) events.push({ t: "snow", tiles: cleared });
    m.applyEnd(s.value<SnEndRecord>("end"));
    m.advance(nowMs, dt);
    if (this.body) {
      const me = m.engine.players[this.myNum];
      const intent = this.controls.intent(true);
      this.body.step(intent, Math.min(0.1, dt));
      if (me) this.body.send(nowMs);
    }
    return events;
  }
}

class SnMatchView {
  private readonly spectator = new SnSpectatorState();
  private spectating = false;
  private shots = 0;
  private resultShown = false;

  constructor(private readonly ui: SnGameUi, readonly driver: SnMatchDriver, looks: ReadonlyMap<number, CharacterLook>) {
    const scene = ui.scene, engine = driver.engine;
    this.spectating = driver.myNum < 0;
    this.spectator.pick(Math.max(0, driver.myNum));
    ui.results.hide();
    ui.controls.reset();
    ui.controls.setShotCounter(() => this.shots);
    scene.beginMatch(driver.source, looks, engine.snow.amount);
    scene.world.rig.snap();
    scene.world.playing = true;
    const me = driver.myNum >= 0 ? engine.players[driver.myNum] : null;
    const leader = !!me && engine.teams[me.team].leader === me;
    ui.bigMap.setPicking(leader, leader ? "낙하 지점을 누르세요" : "전체 지도", leader ? (x, z) => ui.controls.queueDrop(x, z) : null);
    ui.bigMap.setOpen(leader);
    if (me) ui.toast.show(leader ? "지도를 눌러 낙하 지점을 고르세요 (20초)" : "팀장이 낙하 지점을 고르는 중이에요", 4, performance.now(), true);
  }

  get me(): SnPlayer | null { return this.driver.myNum >= 0 ? this.driver.engine.players[this.driver.myNum] : null; }
  get isSpectating(): boolean { return this.spectating; }

  toggleMap(): void {
    const big = this.ui.bigMap, engine = this.driver.engine, me = this.me;
    const picking = !!me && me.life === "sky" && engine.teams[me.team].dropAt < 0 && engine.teams[me.team].leader === me;
    if (picking) return;
    big.setPicking(false, "전체 지도", null);
    big.setOpen(!big.open);
  }

  spectatorKey(code: string): void {
    if (!this.spectating) return;
    if (code === "ArrowRight" || code === "KeyD") this.spectator.step(this.driver.engine, 1);
    if (code === "ArrowLeft" || code === "KeyA") this.spectator.step(this.driver.engine, -1);
  }

  pickActor(x: number, y: number): void {
    if (!this.spectating) return;
    const num = this.ui.scene.pickActor(x, y);
    if (num >= 0) this.spectator.pick(num);
  }

  pickCard(num: number): void { this.spectator.pick(num); }
  toggleOverview(): void { this.spectator.toggleOverview(); }

  private onEvents(events: readonly SnEvent[], nowMs: number): void {
    const engine = this.driver.engine, ui = this.ui, myNum = this.driver.myNum, watched = this.spectator.watched;
    for (const ev of events) {
      if (ev.t === "shot" && ev.by === myNum) this.shots++;
      else if (ev.t === "noSnow" && ev.id === myNum) ui.toast.show("눈이 부족해요 — 눈 칸을 밟아 모으세요", 1.4, nowMs);
      else if (ev.t === "noWall" && ev.id === myNum) ui.toast.show("여기에는 벽을 세울 수 없어요", 1.4, nowMs);
      else if (ev.t === "storm") ui.toast.show(ev.what === "warn" ? "곧 " + ev.stage + "단계 눈보라가 줄어듭니다" : ev.what === "full" ? "눈보라가 섬을 덮었습니다" : ev.stage + "단계 눈보라가 줄어듭니다", 3, nowMs, true);
      else if (ev.t === "hit") {
        const to = engine.players[ev.to];
        if (!to || (ev.storm && ev.to !== watched)) continue;
        const kind = ev.storm ? "storm" : ev.by === watched ? "mine" : ev.to === watched ? "hurt" : "other";
        ui.numbers.add("-" + Math.round(ev.v), kind, to.x, engine.map.heightAt(to.x, to.z) + 2.1, to.z, nowMs);
      } else if (ev.t === "down" && ev.by === myNum && ev.by >= 0) ui.toast.show(engine.players[ev.id].nick + " 처치!", 2, nowMs, true);
      else if (ev.t === "down" && ev.id === myNum) ui.toast.show(engine.mode === "duos" && engine.players[ev.id].revivesUsed < SnBalance.REVIVE.max ? "얼어붙었어요! 아군이 부활시킬 수 있어요" : "얼어붙었어요!", 3, nowMs, true);
      else if (ev.t === "revive" && (ev.id === myNum || ev.by === myNum)) ui.toast.show(ev.id === myNum ? "부활했어요!" : engine.players[ev.id].nick + " 부활!", 2, nowMs, true);
      else if (ev.t === "crate" && ev.by === myNum && ev.taken) ui.toast.show(this.itemText(engine.crates[ev.i].item), 1.8, nowMs);
      else if (ev.t === "crate" && ev.by === myNum && !ev.taken) ui.toast.show("이미 같거나 더 좋은 것을 갖고 있어요 — 아군이 가져갈 수 있게 남겨 둡니다", 2, nowMs);
      else if (ev.t === "pile" && ev.by === myNum) ui.toast.show("눈 더미 +" + SnBalance.SNOW.pile, 1.2, nowMs);
      else if (ev.t === "drop" && this.me && ev.team === this.me.team) { ui.bigMap.setOpen(false); ui.bigMap.setPicking(false, "전체 지도", null); }
    }
  }

  private itemText(item: SnItem): string {
    if (item.kind === "cocoa") return "☕ 코코아! 체온 회복";
    if (item.kind === "big") return "⚪ 대형 눈덩이! 다음 공격은 굴리기";
    return SnHud.ICONS[SnGearRules.slotIndex(item.slot)] + " " + SnBalance.GRADE_NAMES[item.grade] + " " + SnHud.SLOT_NAMES[SnGearRules.slotIndex(item.slot)] + " 장착!";
  }

  private marks(engine: SnEngine, viewerTeam: number): SnMapMarks {
    const pointer = this.spectating ? this.spectator.watched : this.driver.myNum;
    const people = engine.players.filter((p) => (p.life !== "sky" || p.landAt >= 0) && p.life !== "out" && (viewerTeam < 0 || p.team === viewerTeam)).map((p) => ({
      x: p.x, z: p.z, yaw: p.yaw, color: SnPalette.teamColor(engine.mode, p.team), me: p.num === pointer, down: p.life === "down", nick: p.nick,
    }));
    const pins = engine.teams.filter((t) => t.dropAt >= 0 && engine.time < SnBalance.DROP.pickLimit + SnBalance.DROP.time && (viewerTeam < 0 || t.num === viewerTeam)).map((t) => ({ x: t.dropX, z: t.dropZ, color: SnPalette.teamColor(engine.mode, t.num) }));
    return { storm: engine.stormNow(), crates: engine.crates, people, pins };
  }

  frame(dt: number, ms: number): void {
    const ui = this.ui, scene = ui.scene, controls = ui.controls, driver = this.driver, engine = driver.engine;
    const events = driver.tick(dt, ms);
    scene.applyEvents(events, ms);
    this.onEvents(events, ms);
    const me = this.me;
    if (me && !this.spectating && (me.life === "out" || engine.ended)) { this.spectating = true; this.spectator.startFrom(engine, me); }
    controls.enabled = !!me && (me.life === "alive" || (me.life === "sky" && me.landAt >= 0)) && !this.spectating;
    if (this.spectating) this.spectator.follow(engine, ms);
    const watchedNum = this.spectating ? this.spectator.watched : driver.myNum;
    const watched = engine.players[watchedNum] || null;
    const overview = this.spectating && this.spectator.overview;
    scene.showSilhouettesFor(overview ? -1 : watched ? watched.team : -1);
    scene.sync(driver.source, dt, ms);
    if (overview) scene.followEveryone(dt); else scene.followActor(watchedNum, dt);
    const rig = scene.world.rig;
    const dist = Math.hypot(rig.camera.position.x - rig.focusX, rig.camera.position.z - rig.focusZ, rig.camera.position.y - rig.focusY);
    scene.setFog(Math.max(75, dist * 1.4), Math.max(180, dist * 2.6));
    if (watched && !overview) scene.hideTreesAround(watched.x, watched.z, dt); else scene.props.fadePines(false, dt);
    this.updateAim(me);
    const storm = engine.stormNow();
    const edge = watched && watched.life === "alive" && !overview ? Math.hypot(watched.x - storm.x, watched.z - storm.z) - storm.r : -99;
    ui.hud.showFrost(edge > 0 ? 0.75 + Math.sin(ms / 180) * 0.1 : edge > -3 ? 0.25 : 0);
    scene.render(dt, edge > 0);
    this.drawHud(engine, watched, overview, me, ms);
  }

  private updateAim(me: SnPlayer | null): void {
    const ui = this.ui, angle = ui.controls.aimWorldAngle();
    if (!me || !ui.controls.enabled || angle === null) { ui.scene.aimGuide.hide(); return; }
    const y = ui.scene.map.heightAt(me.x, me.z);
    if (ui.controls.aimKind === "wall") {
      const engine = this.driver.engine, plan = engine.wallWorks.plan(me, angle);
      const w = plan ? plan.wall : engine.wallWorks.footprint(me, angle);
      ui.scene.aimGuide.showWall(w.x, y, w.z, w.yaw, w.halfX, !!plan);
      return;
    }
    ui.scene.aimGuide.show(ui.controls.aimKind, me.x, y, me.z, angle, me.bigBall ? SnBalance.BIG.distance * 0.5 : SnBalance.SHOT.range);
  }

  private drawHud(engine: SnEngine, watched: SnPlayer | null, overview: boolean, me: SnPlayer | null, ms: number): void {
    const ui = this.ui;
    const marks = this.marks(engine, this.spectating ? -1 : me ? me.team : -1);
    ui.hud.showTop(engine);
    ui.hud.showPlayer(engine, overview ? null : watched, this.spectating);
    ui.hud.showButtons(engine, me, !this.spectating && !!me && (me.life === "alive" || me.life === "sky"));
    SnDom.show(SnDom.el("touchZone"), !this.spectating);
    document.body.classList.toggle("spectating", this.spectating);
    const center = watched && !overview ? watched : null;
    ui.miniMap.draw(center ? center.x : ui.scene.world.rig.focusX, center ? center.z : ui.scene.world.rig.focusZ, marks);
    ui.bigMap.draw(marks);
    const allyViewer = overview ? null : watched;
    ui.allyPanel.render(engine, allyViewer);
    ui.allyPointers.render(engine, allyViewer, ui.scene.world);
    ui.specPanel.show(this.spectating);
    if (this.spectating) ui.specPanel.render(engine, this.spectator.watched, overview);
    if (me && me.life === "sky" && engine.teams[me.team].dropAt < 0 && engine.teams[me.team].leader === me) {
      SnDom.text(SnDom.el("bigMapTitle"), "낙하 지점을 누르세요 · " + Math.max(0, Math.ceil(SnBalance.DROP.pickLimit - engine.time)) + "초");
      if (!ui.bigMap.open) ui.bigMap.setOpen(true);
    }
    ui.toast.update(ms);
    ui.numbers.update(ui.scene.world, ms);
    const endReady = engine.ended && (!this.driver.online || engine.endAt > 0 || this.driver instanceof SnHostDriver);
    if (endReady && !this.resultShown) { this.resultShown = true; ui.results.show(engine, this.driver.myNum); }
  }

  dispose(): void {
    this.driver.dispose();
    this.ui.scene.clearMatch();
    this.ui.scene.world.playing = false;
    this.ui.toast.hide();
    this.ui.results.hide();
    this.ui.specPanel.show(false);
    this.ui.allyPanel.hide();
    this.ui.allyPointers.hide();
    this.ui.bigMap.setOpen(false);
    this.ui.scene.aimGuide.hide();
    SnDom.show(SnDom.el("controls"), false);
    SnDom.show(SnDom.el("hudMine"), false);
    document.body.classList.remove("spectating");
  }
}

class SnGameUi {
  readonly hud = new SnHud();
  readonly toast = new SnToast(SnDom.el("toast"));
  readonly results = new SnResultBoard();
  readonly specPanel = new SnSpectatorPanel();
  readonly bigMap: SnBigMap;
  readonly miniMap: SnMiniMap;
  readonly numbers = new SnDamageNumbers(SnDom.el("numLayer"));
  readonly allyPanel = new SnAllyPanel();
  readonly allyPointers = new SnAllyPointers();
  readonly controls: SnLocalControls;
  constructor(readonly scene: SnSceneView, onMapToggle: () => void) {
    const painter = new SnMapPainter(scene.map);
    this.bigMap = new SnBigMap(painter);
    this.miniMap = new SnMiniMap(painter, onMapToggle);
    this.controls = new SnLocalControls(() => 0);
  }
}

class SnLobbyView {
  onSeatClick: (slot: number) => void = () => undefined;
  constructor() {
    SnDom.el("lobbySeats").addEventListener("click", (e) => {
      const seat = (e.target as HTMLElement).closest("[data-slot]") as HTMLElement | null;
      if (seat) this.onSeatClick(Number(seat.dataset.slot));
    });
  }

  render(session: RkSession<SnPlayerRecord>, plan: RkSeatPlan): void {
    const mode = (session.value<string>("mode") === "solo" ? "solo" : "duos") as SnMode;
    SnDom.text(SnDom.el("lobbyCode"), session.code);
    SnDom.text(SnDom.el("lobbyMode"), mode === "duos" ? "팀전" : "개인전");
    const seats = plan.humanSeats(session.players);
    let html = "";
    for (let slot = 0; slot < SnRoomRules.SEATS; slot++) {
      const team = SnRoomRules.teamOfSlot(mode, slot), color = SnPalette.teamColor(mode, team);
      const id = seats[slot], record = id ? session.players.get(id) : null;
      const head = mode === "duos" && slot % 2 === 0 ? '<div class="seatTeam" style="background:' + color + '">' + SnBalance.TEAM_NAMES_DUOS[team] + "팀</div>" : "";
      html += head + '<div class="seat' + (record ? " taken" : "") + (id === session.myId ? " mine" : "") + '" data-slot="' + slot + '" style="border-color:' + color + '">' +
        (record ? SnDom.esc(record.nick) + (id === session.hostId ? " 👑" : "") : '<span class="empty">빈자리 · AI</span>') + "</div>";
    }
    SnDom.html(SnDom.el("lobbySeats"), html);
    const watchers = plan.spectators(session.players).map((id) => SnDom.esc((session.players.get(id) as SnPlayerRecord).nick));
    SnDom.html(SnDom.el("lobbySpectators"), watchers.length ? watchers.join(", ") : '<span class="empty">없음</span>');
    const humans = seats.filter((x) => x).length;
    const host = session.isHost();
    SnDom.show(SnDom.el("btnStart"), host);
    SnDom.show(SnDom.el("btnModeToggle"), host);
    SnDom.el<HTMLButtonElement>("btnStart").disabled = humans < 1;
    SnDom.text(SnDom.el("btnSeatMode"), session.isSpectator() ? "선수로 참가" : "관전자로 보기");
    const fill = SnRosterPlanner.fill(mode, seats.map((id, slot) => id ? { id, nick: "", team: SnRoomRules.teamOfSlot(mode, slot) } : null).filter((x): x is SnHumanSeat => !!x));
    const bots = fill.reduce((a, t) => a + t.members.filter((m) => m.bot).length, 0);
    SnDom.text(SnDom.el("lobbyHint"), host ? "사람 " + humans + "명 + AI " + bots + "명으로 시작해요." : "방장이 시작하길 기다려요…");
  }
}

class SnMenuBackdrop {
  static readonly STOPS: readonly SnPoint[] = [
    { x: 0, z: -4 }, { x: -37, z: 6 }, { x: -52, z: -26 }, { x: -20, z: -46 }, { x: 26, z: -50 }, { x: 54, z: 12 }, { x: 40, z: 18 }, { x: 0, z: 46 }, { x: -22, z: 28 },
  ];
  static readonly HOLD = 9;
  static readonly RADIUS = 30;
  static readonly HEIGHT = 20;
  static readonly SPIN = 0.06;
  private active = false;
  private angle = 0;
  private stop = 0;
  private holdLeft = SnMenuBackdrop.HOLD;
  private x = 0; private y = 2.4; private z = -4;

  constructor(private readonly scene: SnSceneView) {}

  stopTour(): void { this.active = false; }

  frame(dt: number): void {
    if (!this.active) { this.scene.showMenuWorld(); this.active = true; }
    this.holdLeft -= dt;
    if (this.holdLeft <= 0) { this.holdLeft = SnMenuBackdrop.HOLD; this.stop = (this.stop + 1) % SnMenuBackdrop.STOPS.length; }
    const target = SnMenuBackdrop.STOPS[this.stop], k = Math.min(1, dt * 0.45);
    this.x += (target.x - this.x) * k; this.z += (target.z - this.z) * k;
    this.y += (this.scene.map.heightAt(target.x, target.z) - this.y) * k;
    this.angle += dt * SnMenuBackdrop.SPIN;
    this.scene.world.rig.orbit(SnMenuBackdrop.RADIUS, SnMenuBackdrop.HEIGHT, this.angle, this.x, this.y, this.z);
    this.scene.render(dt, false);
  }
}
class SnGame {
  static readonly STEP = 1 / 30;
  static readonly STALL_MS = 250;
  static readonly WATCHDOG_MS = 100;
  private readonly options = new SnPlayOptions(location.search);
  private readonly backend = new RkBackend();
  private readonly directory = new RkDirectory<SnPlayerRecord>(this.backend, SnRoomRules.RULES);
  private readonly seatPlan = new RkSeatPlan(SnRoomRules.RULES);
  private readonly lobby = new SnLobbyView();
  private readonly meter = new SnNetMeter();
  private readonly myId = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  private readonly touch = matchMedia("(pointer: coarse)").matches;
  private ui: SnGameUi | null = null;
  private profile: PlayerProfile | null = null;
  private editor: ProfileEditor | null = null;
  private backdrop: SnMenuBackdrop | null = null;
  private practice = false;
  private session: RkSession<SnPlayerRecord> | null = null;
  private view: SnMatchView | null = null;
  private matchId = 0;
  private randomMode: SnMode = "duos";
  private readonly randoms = new Map<SnMode, MkRandomFlow>();
  private lastMs = 0;
  private seed: number;

  constructor(private readonly libs: ThreeLibs) {
    this.seed = this.options.seed;
    this.start().catch((error) => { SnDom.text(SnDom.el("loading"), "불러오기 실패: " + error); });
  }

  private async start(): Promise<void> {
    const assets = new CharacterAssets(this.libs);
    await assets.load();
    const library = new SnModelLibrary(this.libs);
    await library.load(assets.clips);
    const factory = new CharacterModelFactory(this.libs, assets);
    const canvas = SnDom.el<HTMLCanvasElement>("view");
    const scene = new SnSceneView(this.libs, canvas, this.touch, library, factory, SnMap.shared());
    const ui = new SnGameUi(scene, () => { if (this.view) this.view.toggleMap(); });
    this.ui = ui;
    this.profile = new PlayerProfile();
    this.editor = new ProfileEditor(this.libs, factory, assets, this.profile);
    this.editor.onChange(() => this.pushProfile());
    FoldCard.bindAll(document);
    this.backdrop = new SnMenuBackdrop(scene);
    ui.controls.onMapKey(() => { if (this.view) this.view.toggleMap(); });
    ui.controls.keyboard.onPress((code) => { if (this.view) this.view.spectatorKey(code); });
    canvas.addEventListener("pointerdown", (e) => { if (this.view) this.view.pickActor(e.clientX, e.clientY); });
    ui.specPanel.onPick((num) => { if (this.view) this.view.pickCard(num); });
    ui.specPanel.onOverview(() => { if (this.view) this.view.toggleOverview(); });
    document.body.classList.toggle("touch", this.touch);
    this.bindMenus();
    SnDom.show(SnDom.el("loading"), false);
    window.addEventListener("pagehide", () => { if (this.session) this.session.removeMineOnUnload(); });
    if (this.options.offline) this.startOffline();
    else { this.showScreen("start"); this.updateStartButtons(); }
    this.lastMs = performance.now();
    requestAnimationFrame((ms) => this.frame(ms));
    window.setInterval(() => { const now = performance.now(); if (now - this.lastMs > SnGame.STALL_MS) this.step(now); }, SnGame.WATCHDOG_MS);
  }

  private bindMenus(): void {
    SnDom.el("btnCreateDuos").addEventListener("click", () => this.createRoom("duos"));
    SnDom.el("btnCreateSolo").addEventListener("click", () => this.createRoom("solo"));
    SnDom.el("btnRandomDuos").addEventListener("click", () => this.createParty("duos"));
    SnDom.el("btnRandomSolo").addEventListener("click", () => this.createParty("solo"));
    SnDom.el("btnPractice").addEventListener("click", () => { this.practice = true; this.startOffline(); });
    SnDom.el("btnJoin").addEventListener("click", () => this.joinRoom(false));
    SnDom.el("btnWatch").addEventListener("click", () => this.joinRoom(true));
    SnDom.el("joinCode").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") this.joinRoom(false); });
    SnDom.el("btnStart").addEventListener("click", () => this.startMatch());
    SnDom.el("btnLeave").addEventListener("click", () => this.leaveRoom(""));
    SnDom.el("btnSeatMode").addEventListener("click", () => this.toggleSeatMode());
    SnDom.el("btnModeToggle").addEventListener("click", () => this.toggleMode());
    SnDom.el("btnAgain").addEventListener("click", () => this.afterResult());
    SnDom.el("btnResultLeave").addEventListener("click", () => this.leaveRoom(""));
    SnDom.el("btnGameLeave").addEventListener("click", () => this.askLeave());
    this.lobby.onSeatClick = (slot) => this.clickSeat(slot);
  }

  static readonly LEAVE_CONFIRM_MS = 3000;
  private leaveAskedAt = -1;

  private askLeave(): void {
    const button = SnDom.el("btnGameLeave"), now = performance.now();
    if (this.leaveAskedAt >= 0 && now - this.leaveAskedAt < SnGame.LEAVE_CONFIRM_MS) { this.resetLeave(); this.leaveRoom(""); return; }
    this.leaveAskedAt = now;
    button.classList.add("confirm");
    SnDom.text(button, "한 번 더 누르면 나가요");
    window.setTimeout(() => { if (performance.now() - this.leaveAskedAt >= SnGame.LEAVE_CONFIRM_MS - 50) this.resetLeave(); }, SnGame.LEAVE_CONFIRM_MS);
  }

  private resetLeave(): void {
    this.leaveAskedAt = -1;
    const button = SnDom.el("btnGameLeave");
    button.classList.remove("confirm");
    SnDom.text(button, this.practice || this.options.offline ? "나가기" : "방 나가기");
  }

  private showScreen(name: SnScreenName): void {
    SnDom.show(SnDom.el("btnGameLeave"), name === "game");
    this.resetLeave();
    SnDom.show(SnDom.el("startScreen"), name === "start");
    SnDom.show(SnDom.el("lobbyScreen"), name === "lobby");
    SnDom.show(SnDom.el("partyScreen"), name === "party");
    SnDom.show(SnDom.el("partyMountSolo"), this.randomMode === "solo");
    SnDom.show(SnDom.el("partyMountDuos"), this.randomMode === "duos");
    SnDom.show(SnDom.el("hudTop"), name === "game");
    SnDom.show(SnDom.el("mapDock"), name === "game");
    if (name !== "game") { SnDom.show(SnDom.el("controls"), false); SnDom.show(SnDom.el("hudMine"), false); SnDom.show(SnDom.el("touchZone"), false); }
    const editor = this.editor;
    if (!editor) return;
    if (name === "game") { editor.setActive(false); return; }
    editor.mount(SnDom.el(name === "start" ? "profileHost" : name === "party" ? "partyProfileHost" : "lobbyProfileHost"));
    editor.setActive(true);
  }

  private pushProfile(): void {
    const profile = this.profile;
    if (this.session && profile) this.session.pushProfile({ nick: profile.nickOrDefault(), look: profile.look });
    this.randoms.forEach((flow) => flow.updateMe());
  }

  private randomFor(mode: SnMode): MkRandomFlow {
    const existing = this.randoms.get(mode);
    if (existing) return existing;
    const flow = SnRandomSetup.create(mode, this.backend, this.directory, this.myId, {
      myRecord: () => this.myRecord(),
      enterTicketRoom: (code, hosting) => this.enterTicketRoom(mode, code, hosting),
      leaveRoomQuietly: () => this.leaveRoomQuietly(),
      startMatch: () => this.startMatch(),
      showParty: () => { this.randomMode = mode; this.showScreen("party"); flow.render(); },
      showStart: (message) => { this.showScreen("start"); this.startMessage(message); }
    });
    this.randoms.set(mode, flow);
    return flow;
  }

  private random(): MkRandomFlow | null {
    return this.randoms.get(this.randomMode) || null;
  }

  private inParty(): boolean {
    const flow = this.random();
    return !!flow && flow.inParty();
  }

  private async createParty(mode: SnMode): Promise<void> {
    if (!this.backend.database) return;
    this.startMessage("");
    this.randomMode = mode;
    try {
      this.startMessage(await this.randomFor(mode).create());
    } catch (error) {
      this.startMessage("랜덤 매칭 방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
    }
  }

  private async enterTicketRoom(mode: SnMode, code: string, hosting: boolean): Promise<boolean> {
    this.randomMode = mode;
    if (!hosting) {
      const outcome = await this.directory.join(code, this.myId, this.myRecord(), false, true).catch(() => null);
      if (!outcome || !outcome.ok) return false;
    }
    this.enterRoom(code, hosting);
    if (hosting) (this.session as RkSession<SnPlayerRecord>).writeValue("mode", mode);
    SnDom.text(SnDom.el("lobbyNotice"), "매칭됐어요! 곧 시작해요.");
    SnDom.el("lobbyScreen").classList.add("matched");
    return true;
  }

  private leaveRoomQuietly(): void {
    if (this.session) this.session.leave();
    if (this.session) this.session.silentClose();
    this.session = null;
    if (this.view) { this.view.dispose(); this.view = null; }
    this.matchId = 0;
    SnDom.el("lobbyScreen").classList.remove("matched");
  }

  private reportEnd(session: RkSession<SnPlayerRecord>): void {
    const flow = this.random(), match = session.value<SnMatchRecord>("match"), end = session.value<SnEndRecord>("end");
    const ticket = flow ? flow.ticket() : null;
    if (!flow || !ticket || !match || !end || end.match !== match.id) return;
    const team = match.teams.findIndex((t) => t.members.some((m) => m.id === this.myId));
    if (team < 0) return;
    const rank = end.ranks[team];
    const showStreak = () => SnDom.text(SnDom.el("resultStreak"), flow.endHint());
    showStreak();
    flow.matchEnded({ result: rank === 1 ? "win" : "lose", rank, of: match.teams.length }, showStreak);
  }

  private updateStartButtons(): void {
    const ok = !!this.backend.database;
    ["btnCreateDuos", "btnCreateSolo", "btnJoin", "btnWatch"].forEach((id) => { SnDom.el<HTMLButtonElement>(id).disabled = !ok; });
    if (!ok) this.startMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인)");
  }

  private startMessage(text: string): void { SnDom.text(SnDom.el("startMsg"), text); }

  private myRecord(): SnPlayerRecord {
    const profile = this.profile as PlayerProfile;
    return { nick: profile.nickOrDefault(), isBot: false, joinedAt: this.backend.now(), slot: 0, look: profile.look, spectator: false };
  }

  private async createRoom(mode: SnMode): Promise<void> {
    if (!this.backend.database) return;
    this.startMessage("");
    try {
      const code = await this.directory.create(this.myId, this.myRecord(), {}, (taken) => this.randomFor("duos").codeTaken(taken));
      if (!code) { this.startMessage("방을 만들지 못했어요. 다시 눌러 주세요."); return; }
      this.enterRoom(code, true);
      (this.session as RkSession<SnPlayerRecord>).writeValue("mode", mode);
    } catch (error) {
      this.startMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
    }
  }

  private async joinRoom(asSpectator: boolean): Promise<void> {
    if (!this.backend.database) return;
    const code = SnDom.el<HTMLInputElement>("joinCode").value.replace(/\D/g, "");
    if (code.length !== 5) { this.startMessage("방 코드 5자리를 입력해 주세요."); return; }
    this.startMessage("");
    try {
      const party = await this.randomFor("duos").tryJoin(code);
      if (party.handled) {
        this.randomMode = "duos";
        this.startMessage(party.message);
        return;
      }
      const outcome = await this.directory.join(code, this.myId, this.myRecord(), asSpectator);
      if (outcome.ok) { this.enterRoom(code, false); SnDom.text(SnDom.el("lobbyNotice"), outcome.message); }
      else this.startMessage(outcome.message);
    } catch (error) {
      this.startMessage("방을 불러오지 못했어요.");
    }
  }

  private enterRoom(code: string, hosting: boolean): void {
    const session = new RkSession<SnPlayerRecord>(this.backend, SnRoomRules.RULES, code, this.myId, hosting, SnRoomRules.VALUES);
    this.session = session;
    session.onChange = (kind) => this.onSessionChange(kind);
    session.onRemoteState = (id, raw) => { if (this.view && this.view.driver instanceof SnHostDriver) this.view.driver.receiveState(id, raw, performance.now()); };
    session.onPlayerRemoved = (id) => { if (this.view && this.view.driver instanceof SnHostDriver) this.view.driver.playerLeft(id); };
    session.onClosed = (message) => this.exitToStart(message);
    session.connect();
    this.showScreen("lobby");
    this.lobby.render(session, this.seatPlan);
  }

  private onSessionChange(kind: string): void {
    const session = this.session;
    if (!session) return;
    if (!this.view && (kind === "players" || kind === "host" || kind === "status" || kind === "mode")) this.lobby.render(session, this.seatPlan);
    if (kind === "status" || kind === "match" || kind === "players") this.syncPhase();
    const flow = this.random();
    if (flow && (kind === "players" || kind === "host" || kind === "status")) flow.roomChanged(this.seatPlan.humanSeats(session.players).filter((id) => !!id).length, session.isHost(), session.status === "lobby");
    if (kind === "end" || kind === "status") this.reportEnd(session);
  }

  private syncPhase(): void {
    const session = this.session, ui = this.ui;
    if (!session || !ui) return;
    const match = session.value<SnMatchRecord>("match");
    if (session.status === "lobby") {
      if (this.view) { this.view.dispose(); this.view = null; }
      this.showScreen("lobby");
      this.lobby.render(session, this.seatPlan);
      return;
    }
    if ((session.status === "playing" || session.status === "ended") && match && match.id !== this.matchId && session.me()) {
      if (this.view) this.view.dispose();
      this.matchId = match.id;
      const looks = new Map<number, CharacterLook>();
      match.teams.flatMap((t) => t.members).forEach((m, num) => {
        const record = session.players.get(m.id);
        looks.set(num, record && !m.bot ? record.look : SnBotLooks.make(match.seed + num * 97));
      });
      const driver = session.isHost() ? new SnHostDriver(match, session, ui.controls, this.meter, this.options.speed) : new SnClientDriver(match, session, ui.controls, this.meter);
      if (this.backdrop) this.backdrop.stopTour();
    this.view = new SnMatchView(ui, driver, looks);
      this.showScreen("game");
      const flow = this.random(), matched = !!flow && flow.hasTicket();
      SnDom.show(SnDom.el("btnAgain"), session.isHost() && !matched);
      SnDom.text(SnDom.el("btnAgain"), "대기실로");
      SnDom.show(SnDom.el("btnResultLeave"), true);
      SnDom.text(SnDom.el("btnResultLeave"), matched ? (this.randomMode === "solo" ? "랜덤 매칭 대기실로" : "팀 대기실로") : "방 나가기");
      SnDom.text(SnDom.el("resultStreak"), "");
    }
  }

  private startMatch(): void {
    const session = this.session;
    if (!session || !session.isHost() || session.status !== "lobby") return;
    const mode = (session.value<string>("mode") === "solo" ? "solo" : "duos") as SnMode;
    const seats = this.seatPlan.humanSeats(session.players);
    const humans: SnHumanSeat[] = [];
    seats.forEach((id, slot) => { if (id) humans.push({ id, nick: (session.players.get(id) as SnPlayerRecord).nick, team: SnRoomRules.teamOfSlot(mode, slot) }); });
    if (!humans.length) return;
    const match: SnMatchRecord = { id: 1 + Math.floor(Math.random() * 1e9), seed: Math.floor(Math.random() * 1e9), mode, teams: SnRosterPlanner.fill(mode, humans), startAt: this.backend.now() };
    session.ref.update({ match, status: "playing", st: null, snap: null, wall: null, loot: null, snowmap: null, ev: null, end: null });
  }

  private afterResult(): void {
    if (this.options.offline || this.practice) { this.seed++; this.startOffline(); return; }
    const session = this.session;
    if (!session || !session.isHost()) return;
    session.ref.update({ status: "lobby", match: null, st: null, snap: null, wall: null, loot: null, snowmap: null, ev: null, end: null });
  }

  private toggleSeatMode(): void {
    const session = this.session;
    if (!session || session.status !== "lobby") return;
    if (session.isSpectator()) {
      const seat = this.seatPlan.freeSeat(session.players);
      if (seat >= 0) session.ref.child("players/" + session.myId).update({ slot: seat, spectator: false });
    } else session.ref.child("players/" + session.myId).update({ slot: SnRoomRules.SPECTATOR_SLOT, spectator: true });
  }

  private toggleMode(): void {
    const session = this.session;
    if (!session || !session.isHost() || session.status !== "lobby") return;
    session.writeValue("mode", session.value<string>("mode") === "solo" ? "duos" : "solo");
  }

  private clickSeat(slot: number): void {
    const session = this.session;
    if (!session || session.status !== "lobby") return;
    if (this.seatPlan.humanSeats(session.players)[slot]) return;
    session.ref.child("players/" + session.myId).update({ slot, spectator: false });
  }

  private leaveRoom(message: string): void {
    if (this.options.offline) { const cls = new URLSearchParams(location.search).get("c"); location.href = location.pathname + (cls ? "?c=" + encodeURIComponent(cls) : ""); return; }
    if (this.practice) {
      this.practice = false;
      if (this.view) { this.view.dispose(); this.view = null; }
      this.showScreen("start");
      return;
    }
    if (this.inParty()) { (this.random() as MkRandomFlow).backToParty(message); return; }
    if (this.session) this.session.leave();
    this.exitToStart(message);
  }

  private exitToStart(message: string): void {
    if (this.session) this.session.silentClose();
    this.session = null;
    if (this.view) { this.view.dispose(); this.view = null; }
    this.matchId = 0;
    SnDom.el("lobbyScreen").classList.remove("matched");
    if (this.inParty()) { (this.random() as MkRandomFlow).backToParty(message); return; }
    this.showScreen("start");
    this.startMessage(message);
  }

  private startOffline(): void {
    const ui = this.ui as SnGameUi, profile = this.profile as PlayerProfile;
    if (this.view) this.view.dispose();
    const me: SnHumanSeat | null = this.options.watchOnly ? null : { id: "me", nick: profile.nickOrDefault(), team: 0 };
    const driver = new SnOfflineDriver(this.options.mode, this.seed, me, ui.controls, this.options.speed);
    const looks = new Map<number, CharacterLook>();
    driver.engine.players.forEach((p) => looks.set(p.num, p.bot ? SnBotLooks.make(this.seed + p.num * 97) : profile.look));
    if (this.backdrop) this.backdrop.stopTour();
    this.view = new SnMatchView(ui, driver, looks);
    this.showScreen("game");
    SnDom.text(SnDom.el("btnAgain"), "다시 하기");
    SnDom.show(SnDom.el("btnAgain"), true);
    SnDom.text(SnDom.el("btnResultLeave"), "나가기");
  }

  private frame(ms: number): void {
    requestAnimationFrame((next) => this.frame(next));
    this.step(ms);
  }

  private step(ms: number): void {
    const dt = Math.min(0.1, Math.max(0, (ms - this.lastMs) / 1000));
    this.lastMs = ms;
    const ui = this.ui;
    if (!ui) return;
    const backdrop = this.backdrop as SnMenuBackdrop;
    if (this.view) this.view.frame(dt, ms);
    else backdrop.frame(dt);
    this.meter.tick(ms);
    if (this.options.showNet) SnDom.text(SnDom.el("netMeter"), (this.meter.rate / 1024).toFixed(1) + " KB/s");
  }
}

class SnRandomSetup {
  static readonly CAPACITY = 6;
  static readonly DUOS_TEAMS = 3;

  static create(mode: SnMode, backend: RkBackend, directory: RkDirectory<SnPlayerRecord>, myId: string, port: RkMatchPort<SnPlayerRecord>): MkRandomFlow {
    const solo = mode === "solo", perTeam = solo ? 1 : 2;
    return RkRandomSetup.create<SnPlayerRecord>({
      backend, directory, myId, port,
      rules: SnRoomRules.RULES,
      options: {
        gameRoot: "snowroyale",
        queue: "snowroyale_" + mode,
        partyLimit: perTeam,
        matcher: new MkFreeForAllMatcher(perTeam, SnRandomSetup.CAPACITY, MkMatcher.TIMING, solo ? SnRandomSetup.CAPACITY : SnRandomSetup.DUOS_TEAMS),
        intro: solo ? "매칭 시작을 누르면 다른 학생들과 개인전으로 만나요. 모자란 자리는 AI가 채워요." : "매칭 시작을 누르면 다른 팀들과 팀전(2명씩 최대 3팀)으로 만나요. 모자란 자리는 AI가 채워요.",
        showRank: true,
        solo
      },
      assign: (plan) => MkSeatAssign.bySide(plan, perTeam),
      screen: SnDom.el("partyScreen"),
      mount: SnDom.el(solo ? "partyMountSolo" : "partyMountDuos")
    });
  }
}
