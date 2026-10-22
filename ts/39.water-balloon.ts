type WbScreenName = "start" | "lobby" | "game" | "party";

class WbPlayOptions {
  static readonly STORAGE_KEY = "waterballoon_solo_v1";
  seed: number;
  mapId: string;
  mode: WbMode;
  bots: number;
  level: WbDifficulty;
  readonly speed: number;
  readonly skipTo: number;
  readonly watch: boolean;
  readonly autoSolo: boolean;
  readonly showNet: boolean;

  constructor(search: string) {
    const params = new URLSearchParams(search);
    const saved = WbPlayOptions.load();
    this.seed = Number(params.get("seed")) || Math.floor(Math.random() * 1e9);
    this.mapId = params.get("map") || saved.map || WbMapCatalog.RANDOM;
    this.mode = (params.get("mode") || saved.mode) === "team" ? "team" : "solo";
    this.bots = WbPlayOptions.clampBots(this.mode, Number(params.get("bots")) || saved.bots || 0);
    this.level = WbPlayOptions.levelOf(params.get("level") || saved.level || "");
    this.speed = Math.max(0.25, Math.min(8, Number(params.get("speed")) || 1));
    this.skipTo = Math.max(0, Math.min(WbBalance.MATCH, Number(params.get("at")) || 0));
    this.watch = params.has("watch");
    this.autoSolo = params.has("solo") || this.watch;
    this.showNet = params.has("net");
    if (params.get("trap") === "hit") WbAvatarView.trapClip = "Hit_B";
  }

  static clampBots(mode: WbMode, bots: number): number {
    const limit = mode === "solo" ? WbBalance.MAX_PLAYERS - 1 : WbBalance.TEAM_COUNT - 1;
    return Math.max(1, Math.min(limit, bots || (mode === "solo" ? 3 : 1)));
  }

  static levelOf(text: string): WbDifficulty { return text === "easy" || text === "hard" ? text : "normal"; }

  static load(): { map?: string; mode?: string; bots?: number; level?: string } {
    try {
      const raw = localStorage.getItem(WbPlayOptions.STORAGE_KEY);
      return raw ? JSON.parse(raw) as { map?: string; mode?: string; bots?: number; level?: string } : {};
    } catch (error) {
      return {};
    }
  }

  save(): void {
    try {
      localStorage.setItem(WbPlayOptions.STORAGE_KEY, JSON.stringify({ map: this.mapId, mode: this.mode, bots: this.bots, level: this.level }));
    } catch (error) {
      return;
    }
  }
}

class WbBotLooks {
  static make(seed: number): CharacterLook {
    const random = new WbSeededRandom(seed);
    const look = CharacterLooks.createDefault();
    look.c = random.int(CharacterCatalog.RANDOM_TYPE_COUNT);
    CharacterCatalog.COLOR_PARTS.forEach((part) => { look.p[part.key] = random.next() < 0.15 ? 0 : 1 + random.int(part.set.length); });
    return look;
  }
}

class WbSoloRoster {
  static readonly MY_ID = "me";

  static build(mode: WbMode, nick: string, bots: number): WbRosterTeam[] {
    let n = 0;
    const next = (): WbRosterMember => WbRosterPlanner.botMember(++n);
    const me: WbRosterMember = { id: WbSoloRoster.MY_ID, nick, bot: false };
    if (mode === "solo") return [{ color: 0, members: [me] }, ...Array.from({ length: bots }, (_, k) => ({ color: k + 1, members: [next()] }))];
    return [{ color: 0, members: [me, next()] }, ...Array.from({ length: bots }, (_, k) => ({ color: k + 1, members: [next(), next()] }))];
  }
}

class WbInput {
  private readonly buffer = new WbTurnBuffer();
  private presses = 0;
  body: () => WbBody = () => ({ x: 0, z: 0 });

  constructor(private readonly joystick: WbJoystick) {}

  private now(): number { return performance.now() / 1000; }

  direction(dir: number, down: boolean): void {
    if (down) this.buffer.press(dir, this.body());
    else this.buffer.release(dir, this.body(), this.now());
  }

  action(): void { this.presses++; }

  intent(): WbIntent {
    const steer = this.joystick.active ? this.joystick.read() : this.buffer.read(this.now());
    return { move: steer.move, alt: steer.alt, kPress: this.presses };
  }

  reset(): void { this.buffer.clear(); this.joystick.reset(); }
}

class WbLocalPilot implements WbPilot {
  readonly bot = false;
  constructor(private readonly input: WbInput) {}
  decide(): WbIntent { return this.input.intent(); }
}

class WbLocalLead implements WbLead {
  constructor(private readonly engine: WbEngine, readonly index: number, private readonly input: WbInput) {}

  position(tickTime: number): { x: number; z: number } {
    const e = this.engine, p = e.players[this.index];
    const body = { x: p.x, z: p.z };
    if (p.life === "out" || e.tick < 0 || e.ended) return body;
    const f = Math.max(0, Math.min(1, tickTime - e.tick));
    const intent = this.input.intent();
    WbMover.advance(e, p.index, body, intent.move, intent.alt, p.speed() * WbBalance.DT * f);
    return body;
  }
}

abstract class WbMatchDriver {
  abstract readonly engine: WbEngine;
  abstract readonly myIndex: number;
  abstract readonly looks: CharacterLook[];
  abstract readonly mapId: string;
  readonly online: boolean = false;
  get source(): WbSceneSource { return this.engine; }
  lead(input: WbInput): WbLead | null {
    const me = this.engine.players[this.myIndex];
    return me ? new WbLocalLead(this.engine, me.index, input) : null;
  }
  update(dt: number, nowMs: number): WbEvent[] { return this.engine.update(dt); }
}

class WbSoloDriver extends WbMatchDriver {
  readonly engine: WbEngine;
  readonly myIndex: number;
  readonly looks: CharacterLook[];
  readonly mapId: string;

  constructor(options: WbPlayOptions, seed: number, profile: PlayerProfile, input: WbInput) {
    super();
    const teams = WbSoloRoster.build(options.mode, profile.nickOrDefault(), options.bots);
    this.engine = new WbEngine({ seed, lootSeed: seed ^ 0x1007, mode: options.mode, teams });
    this.myIndex = this.engine.players.findIndex((p) => p.id === WbSoloRoster.MY_ID);
    this.engine.players.forEach((p) => this.engine.attach(p.index, p.bot ? new WbBotBrain(p.index, options.level, seed) : new WbLocalPilot(input)));
    this.looks = this.engine.players.map((p) => p.bot ? WbBotLooks.make(seed + p.index * 7919) : profile.look);
    this.mapId = WbMapCatalog.resolve(options.mapId, new WbSeededRandom(seed ^ 0x3A9)).id;
  }
}

class WbWatchDriver extends WbMatchDriver {
  readonly engine: WbEngine;
  readonly myIndex = -1;
  readonly looks: CharacterLook[];

  constructor(mode: WbMode, count: number, level: WbDifficulty, seed: number, readonly mapId: string) {
    super();
    this.engine = new WbEngine({ seed, lootSeed: seed ^ 0x1007, mode, teams: WbRosterPlanner.allBots(mode, count) });
    this.engine.players.forEach((p) => this.engine.attach(p.index, new WbBotBrain(p.index, level, seed)));
    this.looks = this.engine.players.map((p) => WbBotLooks.make(seed + p.index * 7919));
  }
}

class WbHostDriver extends WbMatchDriver {
  readonly online = true;
  readonly engine: WbEngine;
  readonly myIndex: number;
  readonly link: WbHostLink;
  readonly mapId: string;

  constructor(readonly match: WbMatchRecord, session: RkSession<WbPlayerRecord>, input: WbInput, meter: WbNetMeter, level: WbDifficulty, readonly looks: CharacterLook[]) {
    super();
    this.engine = new WbEngine({ seed: match.seed, lootSeed: Math.floor(Math.random() * 1e9), mode: match.mode, teams: match.teams });
    this.link = new WbHostLink(this.engine, session, match, meter);
    this.mapId = match.map;
    let mine = -1;
    this.engine.players.forEach((p) => {
      if (p.bot) this.engine.attach(p.index, new WbBotBrain(p.index, level, match.seed));
      else if (p.id === session.myId) { this.engine.attach(p.index, new WbLocalPilot(input)); mine = p.index; }
      else { const pilot = new WbRemotePilot(); this.engine.attach(p.index, pilot); this.link.remote.set(p.index, pilot); p.external = true; }
    });
    this.myIndex = mine;
  }

  receiveState(id: string, raw: string, nowMs: number): void {
    const p = this.engine.players.find((x) => x.id === id);
    if (p) this.link.receive(p.index, raw, nowMs);
  }

  playerLeft(id: string): void {
    const p = this.engine.players.find((x) => x.id === id);
    if (p && !p.bot) this.engine.disconnect(p.index);
  }

  update(dt: number, nowMs: number): WbEvent[] {
    const events = this.engine.update(dt, (list, tick) => this.link.collect(list, tick));
    this.link.publish(nowMs);
    return events;
  }
}

class WbGuestDriver extends WbMatchDriver {
  readonly online = true;
  readonly mirror: WbMirror;
  readonly myIndex: number;
  readonly mapId: string;
  private body: WbGuestBody | null = null;

  constructor(readonly match: WbMatchRecord, private readonly session: RkSession<WbPlayerRecord>, private readonly input: WbInput, private readonly meter: WbNetMeter, readonly looks: CharacterLook[]) {
    super();
    this.myIndex = match.teams.flatMap((t) => t.members).findIndex((m) => m.id === session.myId);
    this.mirror = new WbMirror(match, this.myIndex);
    this.mapId = match.map;
  }

  get engine(): WbEngine { return this.mirror.engine; }
  get source(): WbSceneSource { return this.mirror; }

  lead(input: WbInput): WbLead | null {
    if (this.myIndex < 0) return null;
    this.body = new WbGuestBody(this.mirror, this.myIndex, input, this.session, this.meter);
    return this.body;
  }

  update(dt: number, nowMs: number): WbEvent[] {
    const m = this.mirror, s = this.session;
    m.applySnap(s.value<string>("snap"), nowMs);
    const events = m.takeEvents(s.value<string>("ev"));
    m.applyBoard(s.value<string>("board"));
    m.applyEnd(s.value<WbEndRecord>("end"));
    m.advance(nowMs, dt);
    if (this.body) this.body.step(Math.min(0.1, dt), nowMs);
    return events;
  }
}

class WbMatchView {
  static readonly RESULT_DELAY_MS = 2000;
  static readonly START_SHOW = 0.8;
  static readonly ICONS: Readonly<Record<string, string>> = { balloon: "💧", range: "물줄기", shoe: "👟", needle: "📌" };
  watched: number;
  private endedAt = -1;
  private resultShown = false;
  private tenWarned = false;
  private lastCount = "";

  constructor(readonly driver: WbMatchDriver, private readonly world: WbWorldView, private readonly ui: WbGameUi, input: WbInput) {
    const theme = WbMapCatalog.find(driver.mapId);
    const match = world.show(theme, driver.source, driver.looks);
    match.lead = driver.lead(input);
    const me = driver.engine.players[driver.myIndex];
    input.reset();
    input.body = () => me ? { x: me.x, z: me.z } : { x: 0, z: 0 };
    world.playing = true;
    ui.result.hide();
    ui.banner.hide();
    ui.hud.show(true);
    this.watched = Math.max(0, driver.myIndex);
    this.markWatched();
    const first = driver.engine.players[this.watched];
    if (first && first.life === "out") this.cycle(1);
  }

  get engine(): WbEngine { return this.driver.engine; }
  get mine(): boolean { return this.driver.myIndex >= 0 && this.watched === this.driver.myIndex; }
  get finished(): boolean { return this.resultShown; }
  get spectating(): boolean { const me = this.engine.players[this.driver.myIndex]; return !me || me.life === "out"; }

  markWatched(): void {
    const match = this.world.current;
    if (match) match.avatars.forEach((a, k) => { a.watched = k === this.watched; });
  }

  cycle(delta: number): void {
    if (!this.spectating) return;
    const n = this.engine.players.length;
    for (let k = 1; k <= n; k++) {
      const next = (this.watched + delta * k + n * 4) % n;
      if (this.engine.players[next].life !== "out") { this.watched = next; break; }
    }
    this.markWatched();
  }

  frame(dt: number, nowMs: number): void {
    const events = this.driver.update(dt, nowMs);
    this.world.react(events, nowMs);
    this.reactUi(events, nowMs);
    this.world.render(dt, nowMs);
    const watched = this.engine.players[this.watched] || null;
    this.ui.hud.update(this.engine, watched, this.mine);
    this.updateButton();
    this.updateCount();
    if (this.engine.ended && this.endedAt < 0) this.endedAt = nowMs;
    if (this.endedAt >= 0 && !this.resultShown && nowMs - this.endedAt > WbMatchView.RESULT_DELAY_MS) {
      this.resultShown = true;
      this.world.playing = false;
      if (!this.engine.ranks.length) this.engine.ranks = WbScoreboard.ranks(this.engine);
      this.ui.result.show(this.engine, this.driver.myIndex);
      const match = this.world.current;
      if (match) match.cheer(this.engine.ranks);
    }
    const panel = this.spectating && !this.resultShown;
    this.ui.spectators.show(panel);
    document.body.classList.toggle("spectating", panel);
    if (panel) this.ui.spectators.render(this.engine, this.watched);
  }

  pick(index: number): void {
    if (!this.spectating || !this.engine.players[index]) return;
    this.watched = index;
    this.markWatched();
  }

  dispose(): void {
    this.world.clear();
    this.world.playing = false;
    this.ui.result.hide();
    this.ui.banner.hide();
    this.ui.count.set("");
    this.ui.hud.show(false);
    this.ui.spectators.show(false);
    document.body.classList.remove("spectating");
    WbDom.show(WbDom.el("controls"), false);
  }

  private updateButton(): void {
    const me = this.engine.players[this.driver.myIndex];
    WbDom.show(WbDom.el("controls"), !!me && me.life !== "out" && !this.engine.ended);
    if (!me) return;
    if (me.life === "trapped") this.ui.button.show(me.needles > 0 ? "needle" : "empty", me.needles);
    else {
      const left = me.balloonsMax - this.engine.activeBalloons(me.index);
      this.ui.button.show(left > 0 && me.life === "alive" ? "balloon" : "empty", Math.max(0, left));
    }
  }

  private updateCount(): void {
    const e = this.engine, s = e.seconds;
    let text = "";
    if (e.tick < 0) text = String(Math.max(1, Math.ceil(-s)));
    else if (s < WbMatchView.START_SHOW) text = "시작!";
    else if (!e.ended && s >= WbBalance.MATCH - WbBalance.FINAL_COUNT) text = String(Math.max(1, Math.ceil(WbBalance.MATCH - s)));
    if (text && text !== this.lastCount) this.ui.sound.beep(text === "시작!");
    this.lastCount = text;
    this.ui.count.set(text);
    if (!this.tenWarned && s >= WbBalance.MATCH - 10 && !e.ended) { this.tenWarned = true; this.ui.banner.show("10초 남음", true); }
  }

  private headAt(index: number): { x: number; y: number } | null {
    const match = this.world.current;
    const avatar = match ? match.avatarAt(index) : null;
    if (!avatar) return null;
    return this.world.project(avatar.root.position.x, 2.9, avatar.root.position.z);
  }

  private nick(index: number): string {
    const p = this.engine.players[index];
    return p ? p.nick : "";
  }

  private reactUi(events: readonly WbEvent[], nowMs: number): void {
    const me = this.driver.myIndex, ui = this.ui;
    let blasts = 0;
    for (const ev of events) {
      if (ev.t === "blast") blasts++;
      if (ev.t === "place" && ev.by === me) ui.sound.place();
      if (ev.t === "noPlace" && ev.by === me) { ui.sound.noPlace(); ui.button.shake(); }
      if (ev.t === "trap") {
        ui.sound.trap();
        if (ev.id === me) { WbVibration.trap(); ui.banner.show("갇혔어요!", true, 1200); }
        else ui.banner.show(this.nick(ev.id) + " 님이 갇혔습니다", false, 1200);
      }
      if (ev.t === "rescue") { ui.sound.rescue(); ui.banner.show(this.nick(ev.id) + (ev.needle ? " 님 바늘 탈출!" : " 님 구출!"), false, 1200); }
      if (ev.t === "out") {
        ui.sound.pop();
        ui.banner.show(this.nick(ev.id) + (ev.why === "left" ? " 님 연결 끊김" : " 님 탈락"), ev.id === me, 1400);
        if (ev.id === this.watched) window.setTimeout(() => this.cycle(1), 1200);
      }
      if (ev.t === "pick") {
        if (ev.by === me) ui.sound.pick(ev.grade > 0);
        const at = this.headAt(ev.by);
        if (at) ui.floats.spawn(at.x, at.y, this.pickText(ev.kind, ev.gain, ev.max), ev.max ? "max" : "grade" + ev.grade);
      }
      if (ev.t === "sudden") { ui.sound.warn(); ui.banner.show("서든데스!", true, 2000); }
    }
    if (blasts) ui.sound.blast(blasts, nowMs);
  }

  private pickText(kind: string, gain: number, max: boolean): string {
    if (max) return "MAX";
    const icon = WbMatchView.ICONS[kind];
    if (icon) return "+" + gain + " " + icon;
    return WbHud.ITEM_NAMES[kind] + "!";
  }
}

class WbGameUi {
  readonly hud = new WbHud();
  readonly banner = new WbBanner();
  readonly count = new WbBigCount();
  readonly floats = new WbFloatText();
  readonly sound = new WbSound();
  readonly result = new WbResultBoard();
  readonly spectators = new WbSpectatorPanel();
  readonly joystick: WbJoystick;
  readonly button: WbActionButton;

  constructor(onAction: () => void) {
    this.joystick = new WbJoystick(WbDom.el("touchZone"));
    this.button = new WbActionButton(onAction);
  }
}

class WbEmptyMapSource implements WbSceneSource {
  static readonly LAYOUT_PLAYERS = 4;
  readonly tick = 0;
  readonly tickTime = 0;
  readonly mode: WbMode = "solo";
  readonly grid: WbGrid;
  readonly players: readonly WbActorSource[] = [];
  readonly balloons: readonly WbBalloonSource[] = [];
  readonly floor: ReadonlyMap<number, WbFloorItem> = new Map();
  readonly wetUntil: ArrayLike<number>;
  readonly sudden: WbSuddenDeath;

  constructor(seed: number) {
    const engine = new WbEngine({ seed, lootSeed: seed ^ 0x1007, mode: this.mode, teams: WbRosterPlanner.allBots(this.mode, WbEmptyMapSource.LAYOUT_PLAYERS) });
    this.grid = engine.grid;
    this.wetUntil = engine.wetUntil;
    this.sudden = engine.sudden;
  }
}

class WbMenuBackdrop {
  static readonly RADIUS = 34;
  static readonly HEIGHT = 30;
  static readonly SPIN = 0.05;
  static readonly MAP_SECONDS = 24;
  private showing = false;
  private angle = 0;
  private mapLeft = 0;
  private mapIndex = Math.floor(Math.random() * WbMapCatalog.THEMES.length);
  private seed = Math.floor(Math.random() * 1e9);

  constructor(private readonly world: WbWorldView) {}

  stop(): void { if (this.showing) { this.world.clear(); this.showing = false; } }

  frame(dt: number, nowMs: number): void {
    this.mapLeft -= dt;
    if (!this.showing || this.mapLeft <= 0) this.nextMap();
    this.angle += dt * WbMenuBackdrop.SPIN;
    this.world.render(dt, nowMs);
    this.world.rig.orbit(this.angle, WbMenuBackdrop.RADIUS, WbMenuBackdrop.HEIGHT);
  }

  private nextMap(): void {
    if (this.showing) this.mapIndex = (this.mapIndex + 1) % WbMapCatalog.THEMES.length;
    this.seed = (this.seed + 1) >>> 0;
    this.world.show(WbMapCatalog.THEMES[this.mapIndex], new WbEmptyMapSource(this.seed), []);
    this.world.playing = false;
    this.showing = true;
    this.mapLeft = WbMenuBackdrop.MAP_SECONDS;
  }
}

class WbLobbyView {
  static readonly TEAM_NAMES: readonly string[] = ["빨강", "파랑", "노랑", "초록"];
  onSeat: (slot: number) => void = () => undefined;
  onBot: (slot: number) => void = () => undefined;

  constructor() {
    WbDom.el("lobbySeats").addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const bot = target.closest("[data-bot]") as HTMLElement | null;
      if (bot) { this.onBot(Number(bot.dataset.bot)); return; }
      const seat = target.closest("[data-slot]") as HTMLElement | null;
      if (seat) this.onSeat(Number(seat.dataset.slot));
    });
  }

  static modeOf(session: RkSession<WbPlayerRecord>): WbMode { return session.value<string>("mode") === "team" ? "team" : "solo"; }
  static botsOf(session: RkSession<WbPlayerRecord>): number[] { const list = session.value<number[]>("bots"); return Array.isArray(list) ? list.slice() : []; }

  static humans(session: RkSession<WbPlayerRecord>, plan: RkSeatPlan): WbHumanSeat[] {
    const list: WbHumanSeat[] = [];
    plan.humanSeats(session.players).forEach((id, slot) => { if (id) list.push({ id, nick: (session.players.get(id) as WbPlayerRecord).nick, slot }); });
    return list;
  }

  render(session: RkSession<WbPlayerRecord>, plan: RkSeatPlan): void {
    const mode = WbLobbyView.modeOf(session), host = session.isHost(), bots = WbLobbyView.botsOf(session);
    WbDom.text(WbDom.el("lobbyCode"), session.code);
    WbDom.text(WbDom.el("lobbyMode"), mode === "team" ? "팀전 (2명씩)" : "개인전");
    const seats = plan.humanSeats(session.players);
    let html = "";
    for (let slot = 0; slot < WbRoomRules.SEATS; slot++) {
      const team = WbRoomRules.teamOfSlot(mode, slot), color = WbPalette.teamColor(mode, team);
      const id = seats[slot], record = id ? session.players.get(id) : null;
      const head = mode === "team" && slot % 2 === 0 ? "<div class=\"seatTeam\" style=\"background:" + color + "\">" + WbLobbyView.TEAM_NAMES[team] + "팀</div>" : "";
      const botHere = bots.indexOf(mode === "team" ? team : slot) >= 0;
      let inner = "<span class=\"empty\">빈자리</span>";
      if (record) inner = WbDom.esc(record.nick) + (id === session.hostId ? " 👑" : "");
      else if (botHere) inner = "봇" + (host ? " <button type=\"button\" class=\"seatBot\" data-bot=\"" + slot + "\">×</button>" : "");
      else if (host) inner += " <button type=\"button\" class=\"seatBot\" data-bot=\"" + slot + "\">+봇</button>";
      html += head + "<div class=\"seat" + (record ? " taken" : "") + (id === session.myId ? " mine" : "") + "\" data-slot=\"" + slot + "\" style=\"border-color:" + color + ";background:" + (record || botHere ? color : color + "26") + "\">" + inner + "</div>";
    }
    WbDom.html(WbDom.el("lobbySeats"), html);
    const watchers = plan.spectators(session.players).map((sid) => WbDom.esc((session.players.get(sid) as WbPlayerRecord).nick));
    WbDom.html(WbDom.el("lobbySpectators"), "관전: " + (watchers.length ? watchers.join(", ") : "<span class=\"empty\">없음</span>"));
    WbDom.show(WbDom.el("btnStart"), host);
    WbDom.show(WbDom.el("lobbyHostRow"), host);
    WbDom.show(WbDom.el("lobbyGuestRow"), !host);
    const map = session.value<string>("map") || WbMapCatalog.RANDOM, level = WbPlayOptions.levelOf(session.value<string>("level") || "");
    WbDom.el<HTMLSelectElement>("lobbyMap").value = map;
    WbDom.el<HTMLSelectElement>("lobbyLevel").value = level;
    WbDom.text(WbDom.el("lobbyGuestInfo"), "맵: " + (map === WbMapCatalog.RANDOM ? "무작위" : WbMapCatalog.find(map).title) + " · 봇: " + WbBotTuning.LABELS[level]);
    WbDom.text(WbDom.el("btnSeatMode"), session.isSpectator() ? "선수로 참가" : "관전자로 보기");
    const humans = WbLobbyView.humans(session, plan);
    const roster = WbRosterPlanner.fill(mode, humans, bots);
    const botCount = roster.reduce((a, t) => a + t.members.filter((m) => m.bot).length, 0);
    WbDom.el<HTMLButtonElement>("btnStart").disabled = humans.length < 1;
    WbDom.text(WbDom.el("lobbyHint"), host ? "사람 " + humans.length + "명 + 봇 " + botCount + "명으로 시작해요." : "방장이 시작하길 기다려요…");
  }
}

class WbGame {
  static readonly STALL_MS = 250;
  static readonly WATCHDOG_MS = 100;
  static readonly LEAVE_CONFIRM_MS = 3000;
  private readonly options = new WbPlayOptions(location.search);
  private readonly touch = matchMedia("(pointer: coarse)").matches;
  private readonly backend = new RkBackend();
  private readonly directory = new RkDirectory<WbPlayerRecord>(this.backend, WbRoomRules.RULES);
  private readonly seatPlan = new RkSeatPlan(WbRoomRules.RULES);
  private readonly meter = new WbNetMeter();
  private readonly myId = "p" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  private lobby: WbLobbyView | null = null;
  private world: WbWorldView | null = null;
  private ui: WbGameUi | null = null;
  private input: WbInput | null = null;
  private profile: PlayerProfile | null = null;
  private editor: ProfileEditor | null = null;
  private backdrop: WbMenuBackdrop | null = null;
  private session: RkSession<WbPlayerRecord> | null = null;
  private view: WbMatchView | null = null;
  private practice = false;
  private holding = false;
  private matchId = 0;
  private lastMs = 0;
  private leaveAskedAt = -1;
  private randomMode: WbMode = "team";
  private readonly randoms = new Map<WbMode, MkRandomFlow>();

  constructor(private readonly libs: ThreeLibs) {
    this.start().catch((error) => { WbDom.text(WbDom.el("loading"), "불러오기 실패: " + error); });
  }

  private async start(): Promise<void> {
    const assets = new CharacterAssets(this.libs);
    await assets.load();
    const library = new WbModelLibrary(this.libs);
    await library.load(assets.clips);
    const factory = new CharacterModelFactory(this.libs, assets);
    this.world = new WbWorldView(this.libs, WbDom.el<HTMLCanvasElement>("view"), this.touch, library, factory);
    this.backdrop = new WbMenuBackdrop(this.world);
    this.profile = new PlayerProfile();
    this.editor = new ProfileEditor(this.libs, factory, assets, this.profile);
    this.editor.onChange(() => this.pushProfile());
    FoldCard.bindAll(document);
    const ui = new WbGameUi(() => this.action());
    this.ui = ui;
    ui.spectators.onPick((index) => { if (this.view) this.view.pick(index); });
    this.input = new WbInput(ui.joystick);
    this.lobby = new WbLobbyView();
    this.lobby.onSeat = (slot) => this.clickSeat(slot);
    this.lobby.onBot = (slot) => this.toggleBot(slot);
    new WbKeyboard({ dir: (dir, down) => this.direction(dir, down), action: () => this.action(), other: (code) => this.otherKey(code) });
    this.bindMenus();
    document.body.classList.toggle("touch", this.touch);
    WbDom.show(WbDom.el("loading"), false);
    window.addEventListener("pagehide", () => { if (this.session) this.session.removeMineOnUnload(); });
    this.fillSoloForm();
    if (this.options.autoSolo) this.startSolo();
    else { this.showScreen("start"); this.updateStartButtons(); }
    this.lastMs = performance.now();
    requestAnimationFrame((ms) => this.frame(ms));
    window.setInterval(() => { const now = performance.now(); if (now - this.lastMs > WbGame.STALL_MS) this.step(now); }, WbGame.WATCHDOG_MS);
  }

  private bindMenus(): void {
    const on = (id: string, fn: () => void): void => WbDom.el(id).addEventListener("click", fn);
    on("btnSolo", () => { this.readSoloForm(); this.startSolo(); });
    on("btnCreateSolo", () => this.createRoom("solo"));
    on("btnCreateTeam", () => this.createRoom("team"));
    on("btnRandomSolo", () => this.createParty("solo"));
    on("btnRandomTeam", () => this.createParty("team"));
    on("btnJoin", () => this.joinRoom(false));
    on("btnWatch", () => this.joinRoom(true));
    WbDom.el("joinCode").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") this.joinRoom(false); });
    on("btnStart", () => this.startMatch());
    on("btnLeave", () => this.leaveRoom(""));
    on("btnSeatMode", () => this.toggleSeatMode());
    on("btnModeToggle", () => this.toggleMode());
    on("btnAgain", () => this.afterResult());
    on("btnResultLeave", () => this.leaveRoom(""));
    on("btnGameLeave", () => this.askLeave());
    on("btnMute", () => this.toggleMute());
    WbDom.el("lobbyMap").addEventListener("change", () => this.writeHostValue("map", WbDom.el<HTMLSelectElement>("lobbyMap").value));
    WbDom.el("lobbyLevel").addEventListener("change", () => this.writeHostValue("level", WbDom.el<HTMLSelectElement>("lobbyLevel").value));
    WbDom.el("soloMode").addEventListener("change", () => this.refreshBotChoices());
  }

  private fillSoloForm(): void {
    WbDom.el<HTMLSelectElement>("soloMode").value = this.options.mode;
    this.refreshBotChoices();
    WbDom.el<HTMLSelectElement>("soloBots").value = String(this.options.bots);
    WbDom.el<HTMLSelectElement>("soloLevel").value = this.options.level;
    WbDom.el<HTMLSelectElement>("soloMap").value = this.options.mapId;
  }

  private refreshBotChoices(): void {
    const mode = WbDom.el<HTMLSelectElement>("soloMode").value === "team" ? "team" : "solo";
    const select = WbDom.el<HTMLSelectElement>("soloBots"), keep = Number(select.value) || 0;
    const limit = mode === "solo" ? WbBalance.MAX_PLAYERS - 1 : WbBalance.TEAM_COUNT - 1;
    select.innerHTML = Array.from({ length: limit }, (_, k) => "<option value=\"" + (k + 1) + "\">봇 " + (k + 1) + (mode === "solo" ? "명" : "팀") + "</option>").join("");
    select.value = String(WbPlayOptions.clampBots(mode, keep));
  }

  private readSoloForm(): void {
    const o = this.options;
    o.mode = WbDom.el<HTMLSelectElement>("soloMode").value === "team" ? "team" : "solo";
    o.bots = WbPlayOptions.clampBots(o.mode, Number(WbDom.el<HTMLSelectElement>("soloBots").value));
    o.level = WbPlayOptions.levelOf(WbDom.el<HTMLSelectElement>("soloLevel").value);
    o.mapId = WbDom.el<HTMLSelectElement>("soloMap").value || WbMapCatalog.RANDOM;
    o.save();
  }

  private direction(dir: number, down: boolean): void {
    const view = this.view;
    if (view && view.spectating && down && WbDir.horizontal(dir)) { view.cycle(dir === WbDir.RIGHT ? 1 : -1); return; }
    if (this.input) this.input.direction(dir, down);
  }

  private action(): void {
    if (this.view && this.view.finished) { if (this.practice || this.holding || !this.session || this.session.isHost()) this.afterResult(); return; }
    if (this.input) this.input.action();
  }

  private otherKey(code: string): void {
    if (code === "KeyN" && this.practice) this.afterResult();
  }

  private toggleMute(): void {
    if (!this.ui) return;
    WbDom.text(WbDom.el("btnMute"), this.ui.sound.toggle() ? "🔇" : "🔊");
  }

  private askLeave(): void {
    const button = WbDom.el("btnGameLeave"), now = performance.now();
    if (this.leaveAskedAt >= 0 && now - this.leaveAskedAt < WbGame.LEAVE_CONFIRM_MS) { this.resetLeave(); this.leaveRoom(""); return; }
    this.leaveAskedAt = now;
    button.classList.add("confirm");
    WbDom.text(button, "한 번 더 누르면 나가요");
    window.setTimeout(() => { if (performance.now() - this.leaveAskedAt >= WbGame.LEAVE_CONFIRM_MS - 50) this.resetLeave(); }, WbGame.LEAVE_CONFIRM_MS);
  }

  private resetLeave(): void {
    this.leaveAskedAt = -1;
    const button = WbDom.el("btnGameLeave");
    button.classList.remove("confirm");
    WbDom.text(button, this.practice ? "나가기" : "방 나가기");
  }

  private showScreen(name: WbScreenName): void {
    WbDom.show(WbDom.el("btnGameLeave"), name === "game");
    this.resetLeave();
    WbDom.show(WbDom.el("startScreen"), name === "start");
    WbDom.show(WbDom.el("lobbyScreen"), name === "lobby");
    WbDom.show(WbDom.el("partyScreen"), name === "party");
    WbDom.show(WbDom.el("partyMountSolo"), this.randomMode === "solo");
    WbDom.show(WbDom.el("partyMountTeam"), this.randomMode === "team");
    WbDom.show(WbDom.el("touchZone"), name === "game");
    if (name !== "game") { WbDom.show(WbDom.el("controls"), false); if (this.ui) this.ui.hud.show(false); }
    const editor = this.editor;
    if (!editor) return;
    if (name === "game") { editor.setActive(false); return; }
    editor.mount(WbDom.el(name === "start" ? "profileHost" : name === "party" ? "partyProfileHost" : "lobbyProfileHost"));
    editor.setActive(true);
  }

  private pushProfile(): void {
    const profile = this.profile;
    if (this.session && profile) this.session.pushProfile({ nick: profile.nickOrDefault(), look: profile.look });
    this.randoms.forEach((flow) => flow.updateMe());
  }

  private randomFor(mode: WbMode): MkRandomFlow {
    const existing = this.randoms.get(mode);
    if (existing) return existing;
    const flow = WbRandomSetup.create(mode, this.backend, this.directory, this.myId, {
      myRecord: () => this.myRecord(),
      enterTicketRoom: (code, hosting) => this.enterTicketRoom(mode, code, hosting),
      leaveRoomQuietly: () => this.leaveRoomQuietly(),
      startMatch: () => this.startMatch(),
      showParty: () => { this.randomMode = mode; this.showScreen("party"); flow.render(); },
      showStart: (message) => { this.showScreen("start"); this.updateStartButtons(); this.startMessage(message); },
      presentIds: () => (this.session ? RkMatchHooks.humanIds(this.session.players) : [])
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

  private async createParty(mode: WbMode): Promise<void> {
    if (!this.backend.database) return;
    this.startMessage("");
    this.randomMode = mode;
    try {
      this.startMessage(await this.randomFor(mode).create());
    } catch (error) {
      this.startMessage("랜덤 매칭 방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
    }
  }

  private async enterTicketRoom(mode: WbMode, code: string, hosting: boolean): Promise<boolean> {
    this.randomMode = mode;
    if (!hosting) {
      const outcome = await this.directory.join(code, this.myId, this.myRecord(), false, true).catch(() => null);
      if (!outcome || !outcome.ok) return false;
    }
    this.enterRoom(code, hosting);
    if (hosting) (this.session as RkSession<WbPlayerRecord>).ref.update({ mode, map: WbMapCatalog.RANDOM, level: "normal", bots: [] });
    WbDom.text(WbDom.el("lobbyNotice"), "매칭됐어요! 곧 시작해요.");
    WbDom.el("lobbyScreen").classList.add("matched");
    return true;
  }

  private leaveRoomQuietly(): void {
    if (this.session) this.session.leave();
    this.session = null;
    this.holding = false;
    if (this.view) { this.view.dispose(); this.view = null; }
    this.matchId = 0;
    WbDom.el("lobbyScreen").classList.remove("matched");
  }

  private reportEnd(session: RkSession<WbPlayerRecord>): void {
    const flow = this.random(), match = session.value<WbMatchRecord>("match"), end = session.value<WbEndRecord>("end");
    const ticket = flow ? flow.ticket() : null;
    if (!flow || !ticket || !match || !end || end.match !== match.id) return;
    const index = match.teams.flatMap((t) => t.members).findIndex((m) => m.id === this.myId);
    if (index < 0) return;
    const rank = end.ranks[index];
    const of = match.mode === "solo" ? end.ranks.length : match.teams.length;
    const showStreak = () => WbDom.text(WbDom.el("resultStreak"), flow.endHint());
    showStreak();
    flow.matchEnded({ result: rank === 1 ? "win" : "lose", rank, of }, showStreak);
  }

  private updateStartButtons(): void {
    const ok = !!this.backend.database;
    ["btnCreateSolo", "btnCreateTeam", "btnJoin", "btnWatch"].forEach((id) => { WbDom.el<HTMLButtonElement>(id).disabled = !ok; });
    if (!ok) this.startMessage("온라인 연결을 할 수 없어요. (firebase-config.js·인터넷 확인) 혼자 하기는 할 수 있어요.");
  }

  private startMessage(text: string): void { WbDom.text(WbDom.el("startMsg"), text); }

  private myRecord(): WbPlayerRecord {
    const profile = this.profile as PlayerProfile;
    return { nick: profile.nickOrDefault(), isBot: false, joinedAt: this.backend.now(), slot: 0, look: profile.look, spectator: false };
  }

  private async createRoom(mode: WbMode): Promise<void> {
    if (!this.backend.database) return;
    this.startMessage("");
    try {
      const code = await this.directory.create(this.myId, this.myRecord(), {}, (taken) => this.randomFor("team").codeTaken(taken));
      if (!code) { this.startMessage("방을 만들지 못했어요. 다시 눌러 주세요."); return; }
      this.enterRoom(code, true);
      (this.session as RkSession<WbPlayerRecord>).ref.update({ mode, map: WbMapCatalog.RANDOM, level: "normal", bots: [] });
    } catch (error) {
      this.startMessage("방을 만들지 못했어요. (데이터베이스 규칙을 확인해 주세요)");
    }
  }

  private async joinRoom(asSpectator: boolean): Promise<void> {
    if (!this.backend.database) return;
    const code = WbDom.el<HTMLInputElement>("joinCode").value.replace(/\D/g, "");
    if (code.length !== 5) { this.startMessage("방 코드 5자리를 입력해 주세요."); return; }
    this.startMessage("");
    try {
      const party = await this.randomFor("team").tryJoin(code);
      if (party.handled) {
        this.randomMode = "team";
        this.startMessage(party.message);
        return;
      }
      const outcome = await this.directory.join(code, this.myId, this.myRecord(), asSpectator);
      if (outcome.ok) { this.enterRoom(code, false); WbDom.text(WbDom.el("lobbyNotice"), outcome.message); }
      else this.startMessage(outcome.message);
    } catch (error) {
      this.startMessage("방을 불러오지 못했어요.");
    }
  }

  private enterRoom(code: string, hosting: boolean): void {
    if (this.backdrop) this.backdrop.stop();
    const session = new RkSession<WbPlayerRecord>(this.backend, WbRoomRules.RULES, code, this.myId, hosting, WbRoomRules.VALUES);
    this.session = session;
    this.practice = false;
    session.onChange = (kind) => this.onSessionChange(kind);
    session.onRemoteState = (id, raw) => { if (this.view && this.view.driver instanceof WbHostDriver) this.view.driver.receiveState(id, raw, performance.now()); };
    session.onPlayerRemoved = (id) => this.playerRemoved(id);
    session.onClosed = (message) => this.exitToStart(message);
    session.connect();
    this.showScreen("lobby");
    (this.lobby as WbLobbyView).render(session, this.seatPlan);
  }

  private playerRemoved(id: string): void {
    const session = this.session;
    if (this.view && this.view.driver instanceof WbHostDriver) this.view.driver.playerLeft(id);
    if (session && session.isHost() && session.status === "lobby") this.pruneBots();
  }

  private onSessionChange(kind: string): void {
    const session = this.session;
    if (!session) return;
    if (!this.view && kind !== "snap" && kind !== "ev" && kind !== "board") (this.lobby as WbLobbyView).render(session, this.seatPlan);
    if (kind === "status" || kind === "match" || kind === "players") this.syncPhase();
    const flow = this.random();
    if (flow && (kind === "players" || kind === "host" || kind === "status")) flow.roomChanged(this.seatPlan.humanSeats(session.players).filter((id) => !!id).length, session.isHost(), session.status === "lobby");
    if (kind === "end" || kind === "status") this.reportEnd(session);
  }

  private syncPhase(): void {
    const session = this.session, ui = this.ui, world = this.world, input = this.input;
    if (!session || !ui || !world || !input) return;
    const match = session.value<WbMatchRecord>("match");
    if (session.status === "lobby") {
      if (this.view && this.view.finished && session.isSpectator() && !this.holding) {
        this.holding = true;
        WbDom.show(WbDom.el("btnAgain"), true);
        WbDom.text(WbDom.el("btnAgain"), "대기실로");
        return;
      }
      if (this.holding) return;
      if (this.view) { this.view.dispose(); this.view = null; }
      this.showScreen("lobby");
      (this.lobby as WbLobbyView).render(session, this.seatPlan);
      return;
    }
    if ((session.status === "playing" || session.status === "ended") && match && match.id !== this.matchId && session.me()) {
      if (this.view) this.view.dispose();
      if (this.backdrop) this.backdrop.stop();
      this.holding = false;
      this.matchId = match.id;
      const looks = match.teams.flatMap((t) => t.members).map((m, k) => {
        const record = session.players.get(m.id);
        return record && !m.bot ? record.look : WbBotLooks.make(match.seed + k * 7919);
      });
      const level = WbPlayOptions.levelOf(session.value<string>("level") || "");
      const driver: WbMatchDriver = session.isHost() ? new WbHostDriver(match, session, input, this.meter, level, looks) : new WbGuestDriver(match, session, input, this.meter, looks);
      this.view = new WbMatchView(driver, world, ui, input);
      this.showScreen("game");
      ui.hud.show(true);
      const flow = this.random(), matched = !!flow && flow.hasTicket();
      WbDom.show(WbDom.el("btnAgain"), session.isHost() && !matched);
      WbDom.text(WbDom.el("btnAgain"), "대기실로");
      WbDom.text(WbDom.el("btnResultLeave"), matched ? (this.randomMode === "solo" ? "랜덤 매칭 대기실로" : "팀 대기실로") : "방 나가기");
      WbDom.text(WbDom.el("resultStreak"), "");
    }
  }

  private startMatch(): void {
    const session = this.session;
    if (!session || !session.isHost() || session.status !== "lobby") return;
    const mode = WbLobbyView.modeOf(session);
    const humans = WbLobbyView.humans(session, this.seatPlan);
    if (!humans.length) return;
    const seed = Math.floor(Math.random() * 1e9);
    const map = WbMapCatalog.resolve(session.value<string>("map") || WbMapCatalog.RANDOM, new WbSeededRandom(seed ^ 0x3A9)).id;
    const match: WbMatchRecord = { id: 1 + Math.floor(Math.random() * 1e9), seed, mode, map, teams: WbRosterPlanner.fill(mode, humans, WbLobbyView.botsOf(session)), startAt: this.backend.now() };
    session.ref.update({ match, status: "playing", st: null, snap: null, ev: null, board: null, end: null });
  }

  private afterResult(): void {
    if (this.practice) { this.options.seed = (this.options.seed + 1) >>> 0; this.startSolo(); return; }
    if (this.holding) {
      this.holding = false;
      if (this.view) { this.view.dispose(); this.view = null; }
      this.syncPhase();
      return;
    }
    const session = this.session;
    if (!session || !session.isHost()) return;
    session.ref.update({ status: "lobby", match: null, st: null, snap: null, ev: null, board: null, end: null });
  }

  private writeHostValue(name: string, value: string): void {
    const session = this.session;
    if (session && session.isHost() && session.status === "lobby") session.writeValue(name, value);
  }

  private toggleSeatMode(): void {
    const session = this.session;
    if (!session || session.status !== "lobby") return;
    if (session.isSpectator()) {
      const seat = this.seatPlan.freeSeat(session.players);
      if (seat >= 0) session.ref.child("players/" + session.myId).update({ slot: seat, spectator: false });
    } else session.ref.child("players/" + session.myId).update({ slot: WbRoomRules.SPECTATOR_SLOT, spectator: true });
  }

  private toggleMode(): void {
    const session = this.session;
    if (!session || !session.isHost() || session.status !== "lobby") return;
    session.ref.update({ mode: WbLobbyView.modeOf(session) === "team" ? "solo" : "team", bots: [] });
  }

  private clickSeat(slot: number): void {
    const session = this.session;
    if (!session || session.status !== "lobby") return;
    if (this.seatPlan.humanSeats(session.players)[slot]) return;
    session.ref.child("players/" + session.myId).update({ slot, spectator: false });
  }

  private toggleBot(slot: number): void {
    const session = this.session;
    if (!session || !session.isHost() || session.status !== "lobby") return;
    const mode = WbLobbyView.modeOf(session), key = WbRoomRules.teamOfSlot(mode, slot);
    const bots = WbLobbyView.botsOf(session), at = bots.indexOf(key);
    if (at >= 0) bots.splice(at, 1); else bots.push(key);
    session.writeValue("bots", bots);
  }

  private pruneBots(): void {
    const session = this.session;
    if (!session) return;
    const mode = WbLobbyView.modeOf(session), seats = this.seatPlan.humanSeats(session.players);
    const bots = WbLobbyView.botsOf(session).filter((key) => mode === "team" || !seats[key]);
    if (bots.length !== WbLobbyView.botsOf(session).length) session.writeValue("bots", bots);
  }

  private leaveRoom(message: string): void {
    if (this.practice) {
      this.practice = false;
      if (this.view) { this.view.dispose(); this.view = null; }
      this.showScreen("start");
      this.updateStartButtons();
      return;
    }
    if (this.inParty()) { (this.random() as MkRandomFlow).backToParty(message); return; }
    if (this.session) this.session.leave();
    this.exitToStart(message);
  }

  private exitToStart(message: string): void {
    if (this.session) this.session.silentClose();
    this.session = null;
    this.holding = false;
    if (this.view) { this.view.dispose(); this.view = null; }
    this.matchId = 0;
    WbDom.el("lobbyScreen").classList.remove("matched");
    if (this.inParty()) { (this.random() as MkRandomFlow).backToParty(message); return; }
    this.showScreen("start");
    this.updateStartButtons();
    this.startMessage(message);
  }

  private startSolo(): void {
    const ui = this.ui as WbGameUi, world = this.world as WbWorldView, input = this.input as WbInput;
    if (this.view) this.view.dispose();
    if (this.backdrop) this.backdrop.stop();
    this.practice = true;
    const o = this.options;
    const driver: WbMatchDriver = o.watch
      ? new WbWatchDriver(o.mode, o.mode === "solo" ? o.bots + 1 : (o.bots + 1) * 2, o.level, o.seed, WbMapCatalog.resolve(o.mapId, new WbSeededRandom(o.seed ^ 0x3A9)).id)
      : new WbSoloDriver(o, o.seed, this.profile as PlayerProfile, input);
    while (!driver.engine.ended && driver.engine.seconds < o.skipTo) driver.engine.step();
    this.view = new WbMatchView(driver, world, ui, input);
    this.showScreen("game");
    ui.hud.show(true);
    WbDom.show(WbDom.el("btnAgain"), true);
    WbDom.text(WbDom.el("btnAgain"), "다시 하기");
    WbDom.text(WbDom.el("btnResultLeave"), "나가기");
  }

  private frame(ms: number): void {
    requestAnimationFrame((next) => this.frame(next));
    this.step(ms);
  }

  private step(ms: number): void {
    const dt = Math.min(0.1, Math.max(0, (ms - this.lastMs) / 1000));
    this.lastMs = ms;
    if (this.view) this.view.frame(dt * (this.practice ? this.options.speed : 1), ms);
    else if (this.backdrop && this.world) this.backdrop.frame(dt, ms);
    this.meter.tick(ms);
    if (this.options.showNet) WbDom.text(WbDom.el("netMeter"), (this.meter.rate / 1024).toFixed(1) + " KB/s");
  }
}

class WbRandomSetup {
  static readonly CAPACITY = 8;

  static create(mode: WbMode, backend: RkBackend, directory: RkDirectory<WbPlayerRecord>, myId: string, port: RkMatchPort<WbPlayerRecord>): MkRandomFlow {
    const solo = mode === "solo", perTeam = solo ? 1 : WbBalance.TEAM_SIZE;
    return RkRandomSetup.create<WbPlayerRecord>({
      backend, directory, myId, port,
      rules: WbRoomRules.RULES,
      options: {
        gameRoot: "waterballoon",
        queue: "waterballoon_" + mode,
        partyLimit: perTeam,
        matcher: new MkFreeForAllMatcher(perTeam, WbRandomSetup.CAPACITY, MkMatcher.TIMING, solo ? WbRandomSetup.CAPACITY : WbBalance.TEAM_COUNT),
        intro: solo ? "매칭 시작을 누르면 다른 학생들과 개인전으로 만나요. 모자란 자리는 봇이 채워요." : "매칭 시작을 누르면 다른 팀들과 팀전(2명씩 최대 4팀)으로 만나요. 모자란 자리는 봇이 채워요.",
        showRank: true,
        solo
      },
      assign: (plan) => MkSeatAssign.bySide(plan, perTeam),
      screen: WbDom.el("partyScreen"),
      mount: WbDom.el(solo ? "partyMountSolo" : "partyMountTeam")
    });
  }
}
