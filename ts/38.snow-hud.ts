type SnAimKind = "throw" | "wall";

class SnDom {
  static el<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
  static esc(text: string): string { return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]); }
  static show(el: HTMLElement, on: boolean): void { el.hidden = !on; }
  static text(el: HTMLElement, text: string): void { if (el.textContent !== text) el.textContent = text; }
  static html(el: HTMLElement, html: string): void { if (el.innerHTML !== html) el.innerHTML = html; }
}

class SnKeyboard {
  static readonly MOVE: Readonly<Record<string, "up" | "down" | "left" | "right">> = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
  };
  readonly held = { up: false, down: false, left: false, right: false, k: false };
  private readonly listeners: Array<(code: string) => void> = [];

  constructor() {
    window.addEventListener("keydown", (e) => this.onDown(e));
    window.addEventListener("keyup", (e) => this.onUp(e));
    window.addEventListener("blur", () => this.release());
  }

  onPress(listener: (code: string) => void): void { this.listeners.push(listener); }

  private nameOf(e: KeyboardEvent): string { return SnKeyboard.MOVE[e.code] ? e.code : SnKeyboard.MOVE[e.key] ? e.key : e.code; }

  private onDown(e: KeyboardEvent): void {
    if (e.target && /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement).tagName)) return;
    const name = this.nameOf(e), dir = SnKeyboard.MOVE[name];
    if (dir) { this.held[dir] = true; e.preventDefault(); }
    if (e.code === "KeyK") this.held.k = true;
    if (!e.repeat) this.listeners.forEach((fn) => fn(e.code || e.key));
  }

  private onUp(e: KeyboardEvent): void {
    const dir = SnKeyboard.MOVE[this.nameOf(e)];
    if (dir) this.held[dir] = false;
    if (e.code === "KeyK") this.held.k = false;
  }

  release(): void { this.held.up = this.held.down = this.held.left = this.held.right = this.held.k = false; }

  vector(): { x: number; z: number } {
    const x = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0), z = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0);
    const d = Math.hypot(x, z);
    return d ? { x: x / d, z: z / d } : { x: 0, z: 0 };
  }
}

class SnJoystick {
  static readonly DEAD = 8;
  private pointer: number | null = null;
  private ox = 0; private oy = 0; private dx = 0; private dy = 0;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;

  constructor(private readonly zone: HTMLElement) {
    this.base = SnDom.el("joyBase");
    this.knob = SnDom.el("joyKnob");
    zone.addEventListener("pointerdown", (e) => this.down(e));
    zone.addEventListener("pointermove", (e) => this.move(e));
    zone.addEventListener("pointerup", (e) => this.up(e));
    zone.addEventListener("pointercancel", (e) => this.up(e));
  }

  private radius(): number { return this.base.offsetWidth / 2 || 60; }

  private down(e: PointerEvent): void {
    if (this.pointer !== null) return;
    const box = this.base.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) > this.radius() * 2.5) return;
    this.pointer = e.pointerId; this.ox = cx; this.oy = cy;
    this.dx = e.clientX - cx; this.dy = e.clientY - cy;
    try { this.zone.setPointerCapture(e.pointerId); } catch (error) { this.pointer = e.pointerId; }
    e.preventDefault();
    this.paint();
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointer) return;
    this.dx = e.clientX - this.ox; this.dy = e.clientY - this.oy;
    this.paint();
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null; this.dx = this.dy = 0;
    this.paint();
  }

  reset(): void { this.pointer = null; this.dx = this.dy = 0; this.paint(); }

  private paint(): void {
    const r = this.radius(), d = Math.hypot(this.dx, this.dy), k = d > r ? r / d : 1;
    this.knob.style.transform = "translate(" + (this.dx * k) + "px," + (this.dy * k) + "px)";
    this.base.classList.toggle("on", this.pointer !== null);
  }

  vector(): { x: number; z: number } | null {
    if (this.pointer === null) return null;
    const d = Math.hypot(this.dx, this.dy);
    if (d < SnJoystick.DEAD) return { x: 0, z: 0 };
    const m = Math.min(1, d / this.radius());
    return { x: this.dx / d * m, z: this.dy / d * m };
  }
}

interface SnAimHandlers {
  press(): void;
  drag(angle: number, kind: SnAimKind): void;
  release(angle: number | null, cancelled: boolean): void;
}

class SnAimButton {
  static readonly DRAG_MIN = 14;
  private pointer: number | null = null;
  private ox = 0; private oy = 0;
  private dragging = false;
  private cancelled = false;
  private angle = 0;

  constructor(readonly el: HTMLElement, private readonly kind: SnAimKind, private readonly handlers: SnAimHandlers) {
    el.addEventListener("pointerdown", (e) => this.down(e));
    el.addEventListener("pointermove", (e) => this.move(e));
    el.addEventListener("pointerup", (e) => this.up(e, false));
    el.addEventListener("pointercancel", (e) => this.up(e, true));
    el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }

  get pressed(): boolean { return this.pointer !== null; }
  get aiming(): boolean { return this.pointer !== null && this.dragging && !this.cancelled; }
  get dragged(): boolean { return this.pointer !== null && this.dragging; }

  private down(e: PointerEvent): void {
    e.preventDefault();
    if (this.pointer !== null) return;
    this.pointer = e.pointerId; this.ox = e.clientX; this.oy = e.clientY;
    this.dragging = false; this.cancelled = false;
    try { this.el.setPointerCapture(e.pointerId); } catch (error) { this.pointer = e.pointerId; }
    this.handlers.press();
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointer) return;
    const dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    if (Math.hypot(dx, dy) > SnAimButton.DRAG_MIN) { this.dragging = true; this.angle = Math.atan2(dy, dx); }
    const box = this.el.getBoundingClientRect();
    this.cancelled = this.dragging && e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
    if (this.dragging && !this.cancelled) this.handlers.drag(this.angle, this.kind);
  }

  private up(e: PointerEvent, lost: boolean): void {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.handlers.release(this.dragging ? this.angle : null, lost || this.cancelled);
    this.dragging = false;
  }
}

class SnLocalControls {
  static readonly HOLD_MS = 250;
  readonly keyboard = new SnKeyboard();
  readonly joystick: SnJoystick;
  readonly throwButton: SnAimButton;
  readonly wallButton: SnAimButton;
  enabled = false;
  aimAngle: number | null = null;
  aimKind: SnAimKind = "throw";
  private pendingAttack = false;
  private pendingAttackAngle: number | null = null;
  private pendingWall = false;
  private pendingWallAngle: number | null = null;
  private pendingDrop: SnPoint | null = null;
  private throwPressedAt = -1;
  private shotsAtPress = -1;
  private readonly mapListeners: Array<() => void> = [];

  setShotCounter(counter: () => number): void { this.shotCounter = counter; }

  constructor(private shotCounter: () => number) {
    this.joystick = new SnJoystick(SnDom.el("touchZone"));
    this.throwButton = new SnAimButton(SnDom.el("btnThrow"), "throw", {
      press: () => { this.throwPressedAt = performance.now(); this.shotsAtPress = this.shotCounter(); },
      drag: (angle, kind) => { this.aimAngle = angle; this.aimKind = kind; },
      release: (angle, cancelled) => {
        this.aimAngle = null;
        if (cancelled || !this.enabled) return;
        if (angle !== null) { this.pendingAttack = true; this.pendingAttackAngle = angle; return; }
        if (this.shotCounter() === this.shotsAtPress) { this.pendingAttack = true; this.pendingAttackAngle = null; }
      },
    });
    this.wallButton = new SnAimButton(SnDom.el("btnWall"), "wall", {
      press: () => undefined,
      drag: (angle, kind) => { this.aimAngle = angle; this.aimKind = kind; },
      release: (angle, cancelled) => {
        this.aimAngle = null;
        if (cancelled || !this.enabled) return;
        this.pendingWall = true; this.pendingWallAngle = angle;
      },
    });
    this.keyboard.onPress((code) => {
      if (code === "KeyM") { this.mapListeners.forEach((fn) => fn()); return; }
      if (!this.enabled) return;
      if (code === "KeyK") { this.pendingAttack = true; this.pendingAttackAngle = null; }
      if (code === "KeyJ") { this.pendingWall = true; this.pendingWallAngle = null; }
    });
  }

  aimWorldAngle(): number | null { return this.aimAngle; }
  onMapKey(listener: () => void): void { this.mapListeners.push(listener); }
  queueDrop(x: number, z: number): void { this.pendingDrop = { x, z }; }

  holdingK(): boolean {
    const buttonHeld = this.throwButton.pressed && !this.throwButton.dragged && performance.now() - this.throwPressedAt > SnLocalControls.HOLD_MS;
    return this.keyboard.held.k || buttonHeld;
  }

  intent(canThrow: boolean = true): SnIntent {
    const intent = SnIdleIntent.make();
    if (this.pendingDrop) { intent.dropPick = this.pendingDrop; this.pendingDrop = null; }
    if (!this.enabled) { this.pendingAttack = this.pendingWall = false; return intent; }
    const stick = this.joystick.vector() || this.keyboard.vector();
    intent.moveX = stick.x; intent.moveZ = stick.z;
    intent.holdK = this.holdingK();
    if (this.pendingAttack && canThrow) { intent.attack = true; intent.attackAngle = this.pendingAttackAngle; this.pendingAttack = false; }
    if (this.pendingWall) { intent.wall = true; intent.wallAngle = this.pendingWallAngle; this.pendingWall = false; }
    return intent;
  }

  reset(): void {
    this.keyboard.release(); this.joystick.reset();
    this.pendingAttack = this.pendingWall = false; this.pendingDrop = null; this.aimAngle = null;
  }
}

class SnLocalPilot implements SnPilot {
  readonly bot = false;
  constructor(private readonly controls: SnLocalControls) {}
  decide(engine: SnEngine, me: SnPlayer): SnIntent { return this.controls.intent(engine.time >= me.nextShotAt); }
}

class SnMapPainter {
  static readonly SIZE = 480;
  readonly base: HTMLCanvasElement;

  constructor(private readonly map: SnMap) {
    this.base = document.createElement("canvas");
    this.base.width = this.base.height = SnMapPainter.SIZE;
    this.paintBase();
  }

  private paintBase(): void {
    const ctx = this.base.getContext("2d") as CanvasRenderingContext2D;
    const cell = SnMapPainter.SIZE / SnGridMath.SIZE, map = this.map;
    const levels = ["#DCE6EE", "#C4D3DF", "#A9BDCD"];
    for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
      const kind = map.kind[idx];
      ctx.fillStyle = kind === SnTile.MOUNTAIN ? "#7E848C" : kind === SnTile.BLOCK ? "#8C6A55" : kind === SnTile.RAMP ? "#D9C9A6" : map.surface[idx] === SnSurface.ICE ? "#8FC3DD" : map.surface[idx] === SnSurface.BRIDGE ? "#9A7656" : levels[map.level[idx]];
      ctx.fillRect(SnGridMath.colOf(idx) * cell, SnGridMath.rowOf(idx) * cell, cell + 0.5, cell + 0.5);
    }
    ctx.strokeStyle = "rgba(60,70,84,.75)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let idx = 0; idx < SnGridMath.COUNT; idx++) {
      if (!map.walkable(idx)) continue;
      const i = SnGridMath.colOf(idx), j = SnGridMath.rowOf(idx);
      if (i + 1 < SnGridMath.SIZE) { const n = idx + 1; if (map.walkable(n) && !map.connected(idx, n)) { ctx.moveTo((i + 1) * cell, j * cell); ctx.lineTo((i + 1) * cell, (j + 1) * cell); } }
      if (j + 1 < SnGridMath.SIZE) { const n = idx + SnGridMath.SIZE; if (map.walkable(n) && !map.connected(idx, n)) { ctx.moveTo(i * cell, (j + 1) * cell); ctx.lineTo((i + 1) * cell, (j + 1) * cell); } }
    }
    ctx.stroke();
    const scale = SnMapPainter.SIZE / (SnGridMath.HALF * 2);
    for (const o of map.obstacles) {
      const x = (o.x + SnGridMath.HALF) * scale, y = (o.z + SnGridMath.HALF) * scale;
      if (o.model === "pine") { ctx.fillStyle = "#2E5845"; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill(); }
      else if (o.model === "rock") { ctx.fillStyle = "#6E737A"; ctx.beginPath(); ctx.arc(x, y, Math.max(2, o.radius * scale), 0, Math.PI * 2); ctx.fill(); }
      else if (!o.isBox || o.halfX < 2.5) { ctx.fillStyle = "#8C6A55"; ctx.fillRect(x - 2, y - 2, 4, 4); }
    }
  }
}

interface SnMapMarks {
  storm: SnStormState;
  crates: readonly SnCrateSource[];
  people: ReadonlyArray<{ x: number; z: number; color: string; me: boolean; yaw: number; down: boolean; nick: string }>;
  pins: ReadonlyArray<{ x: number; z: number; color: string }>;
}

class SnMapCanvas {
  constructor(private readonly canvas: HTMLCanvasElement, private readonly painter: SnMapPainter) {}

  fit(): { w: number; h: number; dpr: number } {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) { this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); }
    return { w, h, dpr };
  }

  draw(cx: number, cz: number, span: number, marks: SnMapMarks, labels: boolean = false): void {
    const { w, h, dpr } = this.fit();
    if (!w || !h) return;
    const ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const size = Math.min(w, h), scale = size / span;
    const ox = w / 2 - cx * scale, oy = h / 2 - cz * scale;
    const toX = (x: number) => ox + x * scale, toY = (z: number) => oy + z * scale;
    ctx.fillStyle = "#EEF3F8";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this.painter.base, toX(-SnGridMath.HALF), toY(-SnGridMath.HALF), SnGridMath.HALF * 2 * scale, SnGridMath.HALF * 2 * scale);
    const s = marks.storm;
    if (s.r > 0.2) {
      ctx.save();
      ctx.fillStyle = "rgba(235,242,250,.55)";
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(toX(s.x), toY(s.z), s.r * scale, 0, Math.PI * 2, true); ctx.fill("evenodd");
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(toX(s.x), toY(s.z), s.r * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else { ctx.fillStyle = "rgba(235,242,250,.55)"; ctx.fillRect(0, 0, w, h); }
    if (s.next && s.next.r > 0.2) {
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = "#2F6FD6"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(toX(s.next.x), toY(s.next.z), s.next.r * scale, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = "#F7C948"; ctx.strokeStyle = "rgba(40,30,10,.7)"; ctx.lineWidth = 1;
    for (const c of marks.crates) {
      if (c.taken) continue;
      ctx.beginPath(); ctx.rect(toX(c.x) - 3, toY(c.z) - 3, 6, 6); ctx.fill(); ctx.stroke();
    }
    for (const pin of marks.pins) {
      const x = toX(pin.x), y = toY(pin.z);
      ctx.fillStyle = pin.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y - 16, 8, Math.PI * 0.8, Math.PI * 2.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
    const ordered = marks.people.slice().sort((a, b) => Number(a.me) - Number(b.me));
    for (const p of ordered) this.person(ctx, toX(p.x), toY(p.z), p, pulse, labels);
  }

  private person(ctx: CanvasRenderingContext2D, x: number, y: number, p: SnMapMarks["people"][number], pulse: number, labels: boolean): void {
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = 0.35 + 0.35 * pulse;
    ctx.fillStyle = p.me ? "#D97B4F" : p.color;
    ctx.beginPath(); ctx.arc(0, 0, (p.me ? 15 : 12) + pulse * 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (p.down) {
      ctx.fillStyle = "#FFFFFF"; ctx.strokeStyle = p.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = p.color; ctx.font = "800 10px \"Nanum Gothic\", \"Malgun Gothic\", sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("✕", 0, 0.5);
    } else if (p.me) {
      ctx.rotate(p.yaw);
      ctx.fillStyle = "#D97B4F"; ctx.strokeStyle = "#1A2230"; ctx.lineWidth = 4.5; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-9, 9.5); ctx.lineTo(-4, 0); ctx.lineTo(-9, -9.5); ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2.2; ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = p.color; ctx.strokeStyle = "#1A2230"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2.6; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    if (!labels) return;
    ctx.save();
    ctx.font = "800 13px \"Nanum Gothic\", \"Malgun Gothic\", sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.lineWidth = 4; ctx.strokeStyle = "#1A2230"; ctx.fillStyle = "#FFFFFF";
    const text = p.me ? "나" : p.nick;
    ctx.strokeText(text, x, y - 16); ctx.fillText(text, x, y - 16);
    ctx.restore();
  }

  worldAt(clientX: number, clientY: number, cx: number, cz: number, span: number): SnPoint {
    const box = this.canvas.getBoundingClientRect(), size = Math.min(box.width, box.height), scale = size / span;
    return { x: cx + (clientX - box.left - box.width / 2) / scale, z: cz + (clientY - box.top - box.height / 2) / scale };
  }
}

class SnToast {
  private hideAt = 0;
  constructor(private readonly el: HTMLElement) {}
  show(text: string, seconds: number, nowMs: number, strong: boolean = false): void {
    this.el.textContent = text;
    this.el.classList.toggle("strong", strong);
    this.el.hidden = false;
    this.hideAt = nowMs + seconds * 1000;
  }
  update(nowMs: number): void { if (!this.el.hidden && nowMs > this.hideAt) this.el.hidden = true; }
  hide(): void { this.el.hidden = true; }
}

class SnDamageNumbers {
  private readonly pool: Array<{ el: HTMLElement; until: number; x: number; y: number; z: number; born: number }> = [];
  constructor(private readonly layer: HTMLElement) {}
  add(text: string, kind: "mine" | "hurt" | "other" | "storm", x: number, y: number, z: number, nowMs: number): void {
    let slot = this.pool.find((p) => p.until < nowMs);
    if (!slot) {
      if (this.pool.length > 40) return;
      const el = document.createElement("div");
      el.className = "sn-num";
      this.layer.appendChild(el);
      slot = { el, until: 0, x: 0, y: 0, z: 0, born: 0 };
      this.pool.push(slot);
    }
    slot.el.textContent = text;
    slot.el.className = "sn-num " + kind;
    slot.x = x; slot.y = y; slot.z = z; slot.born = nowMs; slot.until = nowMs + 900;
  }
  update(world: SnWorldView, nowMs: number): void {
    for (const p of this.pool) {
      if (p.until < nowMs) { p.el.style.display = "none"; continue; }
      const k = (nowMs - p.born) / 900, s = world.project(p.x, p.y + k * 0.8, p.z);
      p.el.style.display = s.visible ? "block" : "none";
      p.el.style.transform = "translate(" + Math.round(s.x) + "px," + Math.round(s.y) + "px) translate(-50%,-50%)";
      p.el.style.opacity = String(1 - k * k);
    }
  }
}

class SnHud {
  static readonly ICONS: readonly string[] = ["🎩", "🧥", "👟"];
  static readonly SLOT_NAMES: readonly string[] = ["모자", "한벌옷", "신발"];
  private readonly hp = SnDom.el("hudHpFill");
  private readonly hpText = SnDom.el("hudHpText");
  private readonly snow = SnDom.el("hudSnow");
  private readonly snowFill = SnDom.el("hudSnowFill");
  private readonly gear = SnDom.el("hudGear");
  private readonly storm = SnDom.el("hudStorm");
  private readonly teams = SnDom.el("hudTeams");
  private readonly kills = SnDom.el("hudKills");
  private readonly watchTag = SnDom.el("hudWatch");
  private readonly throwButton = SnDom.el("btnThrow");
  private readonly wallButton = SnDom.el("btnWall");
  private readonly frost = SnDom.el("frost");

  showTop(engine: SnEngine): void {
    const s = engine.stormNow();
    let text: string;
    if (s.phase === "prep") text = "❄ 눈보라 " + Math.ceil(s.phaseEnd - engine.time) + "초 뒤";
    else if (s.phase === "full") text = "❄ 눈보라가 섬을 덮었습니다";
    else text = "❄ " + s.stage + "단계 " + (s.phase === "shrink" ? "줄어드는 중 " : "대기 ") + Math.ceil(s.phaseEnd - engine.time) + "초";
    SnDom.text(this.storm, text);
    SnDom.text(this.teams, "남은 팀 " + engine.teams.filter((t) => !t.out).length);
  }

  showPlayer(engine: SnEngine, p: SnPlayer | null, watching: boolean): void {
    SnDom.show(SnDom.el("hudMine"), !!p);
    if (!p) return;
    const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));
    this.hp.style.width = (ratio * 100).toFixed(1) + "%";
    this.hp.classList.toggle("low", ratio < 0.3);
    SnDom.text(this.hpText, p.life === "down" || p.life === "out" ? "얼어붙음 ⛄" : "체온 " + Math.ceil(Math.max(0, p.hp)) + " / " + p.maxHp);
    const snow = engine.teams[p.team].snow;
    SnDom.text(this.snow, "❄ " + snow + " / " + SnBalance.SNOW.cap);
    this.snowFill.style.width = (snow / SnBalance.SNOW.cap * 100).toFixed(1) + "%";
    SnDom.html(this.gear, p.gear.map((g, k) => '<span class="slot' + (g < 0 ? " empty" : "") + '" style="' + (g < 0 ? "" : "border-color:" + SnBalance.GRADE_COLORS[g]) + '" title="' + SnHud.SLOT_NAMES[k] + '">' + SnHud.ICONS[k] + (g < 0 ? "" : "<b style=\"background:" + SnBalance.GRADE_COLORS[g] + '"></b>') + "</span>").join("") + (p.bigBall ? '<span class="slot big" title="대형 눈덩이">⚪</span>' : ""));
    SnDom.text(this.kills, "처치 " + p.kills);
    SnDom.show(this.watchTag, watching);
    if (watching) SnDom.text(this.watchTag, "관전 중: " + p.nick);
  }

  showButtons(engine: SnEngine, me: SnPlayer | null, on: boolean): void {
    SnDom.show(SnDom.el("controls"), on);
    if (!on || !me) return;
    const team = engine.teams[me.team];
    this.throwButton.classList.toggle("big", me.bigBall);
    SnDom.text(this.throwButton.querySelector("span") as HTMLElement, me.bigBall ? "굴리기" : me.reviveTarget >= 0 ? "부활 " + Math.ceil(SnBalance.REVIVE.time - me.reviveProgress) + "초" : "던지기");
    const revive = me.reviveTarget >= 0 ? me.reviveProgress / SnBalance.REVIVE.time : 0;
    this.throwButton.style.setProperty("--revive", (revive * 360).toFixed(0) + "deg");
    this.throwButton.classList.toggle("reviving", revive > 0);
    this.throwButton.classList.toggle("dim", !me.bigBall && team.snow < SnBalance.SHOT.cost);
    this.wallButton.classList.toggle("dim", team.snow < SnBalance.WALL.cost || engine.time < me.nextWallAt);
  }

  showFrost(strength: number): void {
    this.frost.style.opacity = strength.toFixed(2);
  }
}

class SnSpectatorPanel {
  private readonly panel = SnDom.el("specPanel");
  private readonly overviewButton = SnDom.el("btnOverview");
  private picked: ((num: number) => void) | null = null;

  constructor() {
    this.panel.addEventListener("click", (e) => {
      const card = (e.target as HTMLElement).closest("[data-num]") as HTMLElement | null;
      if (card && this.picked) this.picked(Number(card.dataset.num));
    });
  }

  onPick(listener: (num: number) => void): void { this.picked = listener; }
  onOverview(listener: () => void): void { this.overviewButton.addEventListener("click", listener); }

  show(on: boolean): void {
    SnDom.show(this.panel, on);
    SnDom.show(this.overviewButton, on);
  }

  render(engine: SnEngine, watched: number, overview: boolean): void {
    this.overviewButton.classList.toggle("on", overview);
    SnDom.text(this.overviewButton.querySelector("span") as HTMLElement, overview ? "선수 시점" : "전체 보기");
    const s = engine.stormNow();
    let html = '<div class="spTime"><b>' + SnTimeText.clock(engine.time) + "</b><small>" + (s.stage ? "눈보라 " + Math.min(6, s.stage) + "단계" : "준비") + " · 남은 팀 " + engine.teams.filter((t) => !t.out).length + "</small></div>";
    engine.teams.forEach((team) => {
      const color = SnPalette.teamColor(engine.mode, team.num);
      const alive = team.members.filter((m) => m.life === "alive" || m.life === "sky").length;
      if (engine.mode === "duos") html += '<div class="spHead" style="background:' + color + '">' + SnBalance.TEAM_NAMES_DUOS[team.num] + "팀 · 생존 " + alive + "/" + team.members.length + "<small>❄ " + team.snow + (team.out ? " · 탈락" : "") + "</small></div>";
      team.members.forEach((p) => {
        const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));
        const status = p.life === "sky" ? "낙하 중" : p.life === "down" ? (p.canBeRevived() ? "⛄ 부활 대기" : "⛄ 얼어붙음") : p.life === "out" ? "탈락" : "체온 " + Math.ceil(p.hp) + " / " + p.maxHp;
        const snow = engine.teams[team.num].snow;
        const dots = p.gear.map((g) => '<i class="gd" style="background:' + (g < 0 ? "rgba(255,255,255,.18)" : SnBalance.GRADE_COLORS[g]) + '"></i>').join("") +
          '<div class="spSnow"><i style="width:' + Math.round(snow / SnBalance.SNOW.cap * 100) + '%"></i><span>❄ ' + snow + "</span></div>";
        html += '<div class="spCard' + (p.life === "out" ? " dead" : p.life === "down" ? " down" : "") + (p.num === watched && !overview ? " watched" : "") + '" data-num="' + p.num + '" style="border-color:' + color + '">' +
          '<div class="spName">' + (p.bot ? "🤖 " : "") + SnDom.esc(p.nick) + '<span class="spK">' + p.kills + "처치</span>" + (p.bigBall ? '<span class="spBig">⚪</span>' : "") + "</div>" +
          '<div class="spBar hp' + (ratio < 0.3 ? " low" : "") + '"><i style="width:' + Math.round((p.life === "alive" || p.life === "sky" ? ratio : 0) * 100) + '%"></i><span>' + status + "</span></div>" +
          '<div class="spGear">' + dots + "</div></div>";
      });
    });
    SnDom.html(this.panel, html);
  }
}

class SnAllyPanel {
  private readonly panel = SnDom.el("allyPanel");

  render(engine: SnEngine, viewer: SnPlayer | null): void {
    const mates = viewer ? engine.teams[viewer.team].members.filter((m) => m !== viewer) : [];
    SnDom.show(this.panel, mates.length > 0);
    if (!mates.length) return;
    const color = SnPalette.teamColor(engine.mode, (viewer as SnPlayer).team), snow = engine.teams[(viewer as SnPlayer).team].snow;
    SnDom.html(this.panel, mates.map((p) => {
      const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));
      const status = p.life === "sky" ? "낙하 중" : p.life === "down" ? "⛄ 얼어붙음" : p.life === "out" ? "탈락" : "체온 " + Math.ceil(p.hp) + " / " + p.maxHp;
      const gear = p.gear.map((g, k) => '<span class="gs' + (g < 0 ? " empty" : "") + '" style="' + (g < 0 ? "" : "border-color:" + SnBalance.GRADE_COLORS[g]) + '">' + SnHud.ICONS[k] + "</span>").join("") + (p.bigBall ? '<span class="gs">⚪</span>' : "");
      return '<div class="allyCard' + (p.life === "down" ? " down" : p.life === "out" ? " out" : "") + '" style="border-left-color:' + color + '">' +
        '<div class="allyName">' + (p.bot ? "🤖 " : "") + SnDom.esc(p.nick) + "</div>" +
        '<div class="spBar' + (ratio < 0.3 ? " low" : "") + '"><i style="width:' + Math.round((p.life === "alive" || p.life === "sky" ? ratio : 0) * 100) + '%"></i><span>' + status + "</span></div>" +
        '<div class="allyRow">' + gear + '<div class="snowGauge"><i style="width:' + Math.round(snow / SnBalance.SNOW.cap * 100) + '%"></i><span>❄ ' + snow + "</span></div></div></div>";
    }).join(""));
  }

  hide(): void { SnDom.show(this.panel, false); }
}

class SnAllyPointers {
  static readonly MARGIN = 30;
  private readonly layer = SnDom.el("allyPointers");
  private readonly pool: HTMLElement[] = [];

  render(engine: SnEngine, viewer: SnPlayer | null, world: SnWorldView): void {
    const mates = viewer && viewer.life !== "out" ? engine.teams[viewer.team].members.filter((m) => m !== viewer && (m.life === "alive" || m.life === "down" || (m.life === "sky" && m.landAt >= 0))) : [];
    let used = 0;
    const w = window.innerWidth, h = window.innerHeight, m = SnAllyPointers.MARGIN;
    for (const p of mates) {
      const y = engine.map.heightAt(p.x, p.z) + 1;
      const s = world.project(p.x, y, p.z);
      const inside = s.visible && s.x > m && s.x < w - m && s.y > m && s.y < h - m;
      if (inside) continue;
      let dx = s.x - w / 2, dy = s.y - h / 2;
      if (!s.visible) { dx = -dx; dy = -dy; }
      const angle = Math.atan2(dy, dx), cos = Math.cos(angle), sin = Math.sin(angle);
      const reach = Math.min(Math.abs(cos) > 1e-6 ? (w / 2 - m) / Math.abs(cos) : Infinity, Math.abs(sin) > 1e-6 ? (h / 2 - m) / Math.abs(sin) : Infinity);
      const el = this.pointer(used++);
      el.style.transform = "translate(" + Math.round(w / 2 + cos * reach) + "px," + Math.round(h / 2 + sin * reach) + "px)";
      const arrow = el.firstChild as HTMLElement, label = el.lastChild as HTMLElement;
      arrow.style.transform = "rotate(" + angle.toFixed(3) + "rad)";
      arrow.style.background = SnPalette.teamColor(engine.mode, p.team);
      SnDom.text(label, (p.life === "down" ? "⛄ " : "") + p.nick + " " + Math.round(Math.hypot(p.x - (viewer as SnPlayer).x, p.z - (viewer as SnPlayer).z)) + "m");
      label.style.top = sin < -0.5 ? "16px" : "-32px";
      el.style.display = "block";
    }
    for (let k = used; k < this.pool.length; k++) this.pool[k].style.display = "none";
  }

  private pointer(k: number): HTMLElement {
    if (!this.pool[k]) {
      const el = document.createElement("div");
      el.className = "allyPtr";
      el.innerHTML = "<i></i><b></b>";
      this.layer.appendChild(el);
      this.pool[k] = el;
    }
    return this.pool[k];
  }

  hide(): void { this.pool.forEach((el) => { el.style.display = "none"; }); }
}

class SnBigMap {
  private readonly box = SnDom.el("bigMap");
  private readonly canvas: SnMapCanvas;
  private readonly title = SnDom.el("bigMapTitle");
  private picking = false;
  private pickHandler: ((x: number, z: number) => void) | null = null;
  open = false;

  constructor(painter: SnMapPainter) {
    this.canvas = new SnMapCanvas(SnDom.el<HTMLCanvasElement>("bigMapCanvas"), painter);
    SnDom.el("bigMapClose").addEventListener("click", () => this.setOpen(false));
    SnDom.el<HTMLCanvasElement>("bigMapCanvas").addEventListener("pointerdown", (e) => {
      if (!this.picking || !this.pickHandler) return;
      const p = this.canvas.worldAt(e.clientX, e.clientY, 0, 0, SnGridMath.HALF * 2 + 8);
      this.pickHandler(p.x, p.z);
    });
  }

  setOpen(open: boolean): void {
    this.open = open;
    SnDom.show(this.box, open);
  }

  setPicking(picking: boolean, title: string, handler: ((x: number, z: number) => void) | null): void {
    this.picking = picking;
    this.pickHandler = handler;
    SnDom.text(this.title, title);
    SnDom.show(SnDom.el("bigMapClose"), !picking);
    this.box.classList.toggle("picking", picking);
  }

  draw(marks: SnMapMarks): void {
    if (this.open) this.canvas.draw(0, 0, SnGridMath.HALF * 2 + 8, marks, true);
  }
}

class SnMiniMap {
  static readonly SPAN = 84;
  private readonly canvas: SnMapCanvas;
  constructor(painter: SnMapPainter, onOpen: () => void) {
    const el = SnDom.el<HTMLCanvasElement>("miniMap");
    this.canvas = new SnMapCanvas(el, painter);
    el.addEventListener("click", onOpen);
  }
  draw(cx: number, cz: number, marks: SnMapMarks): void { this.canvas.draw(cx, cz, SnMiniMap.SPAN, marks); }
}

class SnResultBoard {
  private readonly box = SnDom.el("resultBox");
  show(engine: SnEngine, myNum: number): void {
    const ranks = engine.ranks();
    const order = engine.teams.map((t, i) => ({ t, rank: ranks[i] })).sort((a, b) => a.rank - b.rank);
    let rows = "";
    for (const { t, rank } of order) for (const p of t.members) {
      rows += "<tr" + (p.num === myNum ? ' class="me"' : "") + "><td>" + rank + "위</td><td><i class=\"tc\" style=\"background:" + SnPalette.teamColor(engine.mode, t.num) + '"></i>' + (p.bot ? "🤖 " : "") + SnDom.esc(p.nick) + "</td><td>" + SnTimeText.clock(engine.survival(p)) + "</td><td>" + p.kills + "</td><td>" + p.dealt + "</td><td>" + p.collected + "</td><td>" + p.walls + "</td></tr>";
    }
    const mine = myNum >= 0 ? ranks[engine.players[myNum].team] : 0;
    SnDom.text(SnDom.el("resultTitle"), myNum < 0 ? "경기 끝" : mine === 1 ? "우승! 🏆" : mine + "위");
    SnDom.html(SnDom.el("resultRows"), rows);
    SnDom.show(this.box, true);
  }
  hide(): void { SnDom.show(this.box, false); }
}
